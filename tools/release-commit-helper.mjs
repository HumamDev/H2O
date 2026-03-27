#!/usr/bin/env node
// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

const USERSCRIPT_HEADER_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/;
const SAFE_ID_RE = /^[a-z0-9._-]+$/;
const USERSCRIPT_PATH_RE = /^scripts\/.+\.user\.js$/i;

main().catch((err) => fatal(err));

async function main() {
  ensureGitRepo();

  const changedPaths = listChangedUserscriptPaths();
  if (!changedPaths.length) {
    console.log("[release-commit-helper] No changed userscripts under scripts/*.user.js.");
    process.exit(0);
  }

  const descriptors = changedPaths.map((relPath) => ({
    relPath,
    scriptId: readScriptId(relPath),
  }));

  printChangedScripts(descriptors);

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive terminal required. Run this command in a terminal.");
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const selected = await promptSelection(rl, descriptors);
    const magnitude = await promptMagnitude(rl);
    const summary = await promptSummary(rl);
    const selectedPlan = selected.map((item) => ({
      relPath: item.relPath,
      scriptId: item.scriptId,
      subject: buildCommitSubject(item.scriptId, magnitude, summary),
    }));

    if (selectedPlan.length > 1) {
      console.log(
        `[release-commit-helper] Selected ${selectedPlan.length} scripts. Creating one commit per script with shared magnitude + summary.`,
      );
    }

    const selectedSet = new Set(selectedPlan.map((item) => item.relPath));
    const foreignStaged = listForeignStagedPaths(selectedSet);
    if (foreignStaged.length > 0) {
      console.log("[release-commit-helper] Staged files outside selected scripts:");
      for (const p of foreignStaged) {
        console.log(`  - ${p}`);
      }
      console.log("[release-commit-helper] Unstage them or commit them first.");
      process.exit(1);
    }

    printCommitPlan(selectedPlan, magnitude);
    const proceed = await promptYesNo(rl, "Proceed? (y/N): ");
    if (!proceed) {
      console.log("[release-commit-helper] Cancelled.");
      process.exit(0);
    }

    const committed = [];
    for (const item of selectedPlan) {
      if (!hasPendingChange(item.relPath)) {
        console.log(
          `[release-commit-helper] Skipping ${item.relPath} (no pending changes).`,
        );
        continue;
      }

      stageAndCommit(item.relPath, item.subject);
      committed.push({ relPath: item.relPath, subject: item.subject });
      console.log(`[release-commit-helper] committed: ${item.subject}`);
    }

    if (!committed.length) {
      console.log("[release-commit-helper] Nothing committed.");
      process.exit(0);
    }

    const runShipNow = await promptYesNo(rl, "Run release + archive now? (Y/n): ", {
      defaultYes: true,
    });
    if (!runShipNow) {
      console.log("");
      console.log("[release-commit-helper] Next steps:");
      console.log("  npm run release");
      console.log('  node tools/ops/archive-snapshot.mjs "$PWD"');
      return;
    }

    console.log("[release-commit-helper] Running release...");
    runCommand("npm", ["run", "release"]);
    console.log("[release-commit-helper] Running archive snapshot...");
    runCommand("node", ["tools/ops/archive-snapshot.mjs", REPO_ROOT]);
    console.log("[release-commit-helper] Release + archive complete.");
  } finally {
    rl.close();
  }
}

function ensureGitRepo() {
  const out = runGitCapture(["rev-parse", "--is-inside-work-tree"]).stdout.trim();
  if (out !== "true") {
    throw new Error("Not a git repository.");
  }
}

function listChangedUserscriptPaths() {
  const unstaged = readNameList(runGitCapture(["diff", "--name-only", "--", "scripts"]).stdout);
  const staged = readNameList(
    runGitCapture(["diff", "--cached", "--name-only", "--", "scripts"]).stdout,
  );
  const untracked = readNameList(
    runGitCapture(["ls-files", "--others", "--exclude-standard", "--", "scripts"]).stdout,
  );

  const merged = uniqueSorted([...unstaged, ...staged, ...untracked]);

  return merged
    .map(normalizePath)
    .filter((p) => USERSCRIPT_PATH_RE.test(p))
    .filter((p) => {
      const abs = path.join(REPO_ROOT, p);
      try {
        return fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch {
        return false;
      }
    });
}

function readNameList(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => normalizePath(s).trim())
    .filter(Boolean);
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function printChangedScripts(descriptors) {
  console.log("[release-commit-helper] Changed userscripts:");
  descriptors.forEach((item, idx) => {
    console.log(`  ${idx + 1}) ${item.relPath}`);
    console.log(`     id: ${item.scriptId}`);
  });
}

function readScriptId(relPath) {
  const absPath = path.join(REPO_ROOT, relPath);
  const text = fs.readFileSync(absPath, "utf8");
  const headerMatch = text.match(USERSCRIPT_HEADER_RE);
  const header = headerMatch ? headerMatch[0] : text;

  const idMatch = header.match(/^\/\/\s*@h2o-id\s+(.+?)\s*$/m);
  if (idMatch) {
    const id = String(idMatch[1] || "").trim();
    if (!SAFE_ID_RE.test(id)) {
      throw new Error(`Invalid @h2o-id "${id}" in ${relPath}.`);
    }
    return id;
  }

  const fallback = deriveScriptIdFromFileName(path.basename(relPath));
  if (!fallback || !SAFE_ID_RE.test(fallback)) {
    throw new Error(`Could not derive script id from filename: ${relPath}`);
  }
  return fallback;
}

function deriveScriptIdFromFileName(fileName) {
  const stem = fileName.replace(/\.user\.js$/i, "");
  return stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

async function promptSelection(rl, descriptors) {
  while (true) {
    const raw = await ask(rl, "Select script index(es) (example: 1, 1,3, or all): ");
    const parsed = parseSelection(raw, descriptors.length);
    if (!parsed.ok) {
      console.log(`[release-commit-helper] ${parsed.error}`);
      continue;
    }
    return parsed.indices.map((i) => descriptors[i]);
  }
}

function parseSelection(raw, max) {
  const rawTrim = String(raw || "").trim().toLowerCase();
  if (rawTrim === "all") {
    return {
      ok: true,
      indices: Array.from({ length: max }, (_, i) => i),
    };
  }

  const tokens = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!tokens.length) {
    return { ok: false, error: "Selection is required." };
  }

  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      return { ok: false, error: `Invalid index "${token}".` };
    }
    const n = Number(token);
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return { ok: false, error: `Index out of range: ${token}` };
    }
    const idx = n - 1;
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return { ok: true, indices: out };
}

async function promptMagnitude(rl) {
  console.log("Select change magnitude:");
  console.log("  1) small / patch -> fix");
  console.log("  2) medium / minor -> feat");
  console.log("  3) major -> feat!");

  while (true) {
    const raw = await ask(
      rl,
      "Magnitude (1/2/3 or small/patch, medium/minor, major): ",
    );
    const parsed = parseMagnitude(raw);
    if (!parsed) {
      console.log("[release-commit-helper] Invalid magnitude.");
      continue;
    }
    return parsed;
  }
}

function parseMagnitude(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (key === "1" || key === "small" || key === "patch") return "small";
  if (key === "2" || key === "medium" || key === "minor") return "medium";
  if (key === "3" || key === "major") return "major";
  return null;
}

async function promptSummary(rl) {
  while (true) {
    const raw = await ask(rl, "One-line summary: ");
    const summary = String(raw || "").replace(/\r?\n/g, " ").trim();
    if (!summary) {
      console.log("[release-commit-helper] Summary is required.");
      continue;
    }
    return summary;
  }
}

function buildCommitSubject(scriptId, magnitude, summary) {
  if (magnitude === "small") {
    return `fix(${scriptId}): ${summary}`;
  }
  if (magnitude === "medium") {
    return `feat(${scriptId}): ${summary}`;
  }
  return `feat(${scriptId})!: ${summary}`;
}

function printCommitPlan(plan, magnitude) {
  const type = commitTypeFromMagnitude(magnitude);
  console.log("[release-commit-helper] Commit plan:");
  console.log(`  scripts selected: ${plan.length}`);
  console.log(`  magnitude: ${magnitude} -> ${type}`);
  for (const item of plan) {
    console.log(`  - ${item.subject}`);
  }
}

function commitTypeFromMagnitude(magnitude) {
  if (magnitude === "small") return "fix";
  if (magnitude === "medium") return "feat";
  return "feat!";
}

function hasPendingChange(relPath) {
  const out = runGitCapture(["status", "--porcelain=v1", "--", relPath]).stdout.trim();
  return out.length > 0;
}

function listStagedPaths() {
  return readNameList(runGitCapture(["diff", "--cached", "--name-only"]).stdout).map(normalizePath);
}

function listForeignStagedPaths(selectedSet) {
  return listStagedPaths().filter((p) => !selectedSet.has(p));
}

function stageAndCommit(relPath, subject) {
  runGit(["add", "--", relPath]);

  const staged = runGitCapture(["diff", "--cached", "--name-only", "--", relPath]).stdout.trim();
  if (!staged) {
    throw new Error(`No staged changes for ${relPath}.`);
  }

  runGit(["commit", "--only", "-m", subject, "--", relPath]);
}

async function promptYesNo(rl, question, { defaultYes = false } = {}) {
  const raw = await ask(rl, question);
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultYes;
  return ["y", "yes"].includes(normalized);
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || "")));
  });
}

function runGitCapture(args) {
  const res = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    const detail = String(res.stderr || res.stdout || "").trim() || `exit ${res.status}`;
    throw new Error(`git ${quoteArgs(args)} failed: ${detail}`);
  }

  return {
    stdout: String(res.stdout || ""),
    stderr: String(res.stderr || ""),
  };
}

function runGit(args) {
  const res = spawnSync("git", args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`git ${quoteArgs(args)} failed with exit ${res.status}`);
  }
}

function runCommand(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`${cmd} ${quoteArgs(args)} failed with exit ${res.status}`);
  }
}

function quoteArgs(args) {
  return args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[release-commit-helper] ERROR: ${msg}`);
  process.exit(1);
}
