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
const CSV_HEADER = "\"date\",\"script_id\",\"version\",\"bump\",\"summary\",\"commit_sha\"";
const ALLOWED_NON_SCRIPT_DIRTY_RE = [
  /^versions\.csv$/,
  /^changelogs\//,
  /^archive\//,
  /^meta\/ledger\//,
  /^meta\/reports\//,
];

let semver;

try {
  semver = await loadSemver();
  await main();
} catch (err) {
  fatal(err);
}

async function loadSemver() {
  try {
    const mod = await import("semver");
    return mod.default || mod;
  } catch {
    throw new Error("Missing dependency \"semver\". Run `npm install`.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureGitRepo();

  const changes = parseStatusPaths();
  const changedScripts = listChangedScripts(changes);
  if (!changedScripts.length) {
    console.log("[ship:commit] No changed scripts under scripts/*.user.js.");
    process.exit(0);
  }

  const dirtyNonScripts = changes.filter((p) => !isUserscriptPath(p));
  const allowedDirtyNonScripts = dirtyNonScripts.filter((p) => isAllowedNonScriptDirtyPath(p));
  const foreignDirty = dirtyNonScripts.filter((p) => !isAllowedNonScriptDirtyPath(p));
  if (foreignDirty.length > 0) {
    if (args.dryRun) {
      console.log("[ship:commit] dry-run warning: dirty non-script paths detected:");
      for (const p of foreignDirty) console.log(`  - ${p}`);
    } else {
      throw new Error(
        `[ship:commit] Dirty non-script paths detected.\n${foreignDirty.map((p) => `  - ${p}`).join("\n")}\nClean or stash them first.`,
      );
    }
  } else if (args.dryRun && allowedDirtyNonScripts.length > 0) {
    console.log("[ship:commit] dry-run: only expected output paths are dirty (allowed).");
  }

  const descriptors = changedScripts.map((relPath) => readScriptDescriptor(relPath));
  printChangedScripts(descriptors);

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive && !args.all) {
    throw new Error("Non-interactive usage requires --all.");
  }

  const rl = interactive
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : null;

  try {
    const selected = args.all ? descriptors.slice() : await promptSelection(rl, descriptors);
    if (!selected.length) {
      console.log("[ship:commit] No scripts selected.");
      process.exit(0);
    }

    const selectedSet = new Set(selected.map((s) => s.relPath));
    const unselected = changedScripts.filter((p) => !selectedSet.has(p));
    if (unselected.length > 0) {
      if (args.dryRun) {
        console.log("[ship:commit] dry-run warning: unselected changed scripts:");
        for (const p of unselected) console.log(`  - ${p}`);
      } else {
        throw new Error(
          `[ship:commit] Unselected script changes detected.\n${unselected.map((p) => `  - ${p}`).join("\n")}\nSelect all changed scripts or clean/stash unselected changes.`,
        );
      }
    }

    const stagedOutsideSelection = listStagedOutsideSelection(selectedSet);
    const foreignStaged = stagedOutsideSelection.foreign;
    if (foreignStaged.length > 0) {
      if (args.dryRun) {
        console.log("[ship:commit] dry-run warning: staged paths outside selected scripts:");
        for (const p of foreignStaged) console.log(`  - ${p}`);
      } else {
        throw new Error(
          `[ship:commit] Staged paths outside selected scripts.\n${foreignStaged.map((p) => `  - ${p}`).join("\n")}\nUnstage them or commit them first.`,
        );
      }
    } else if (args.dryRun && stagedOutsideSelection.allowed.length > 0) {
      console.log("[ship:commit] dry-run: staged paths outside selected scripts are allowlisted output paths.");
    }

    const bumpByPath = await resolveBumps(args, selected, rl, interactive);
    const summary = await resolveSummary(args, rl, interactive);
    const plan = buildPlan(selected, bumpByPath, summary);

    printPlan(plan, args);

    if (args.dryRun) {
      console.log("[ship:commit] dry-run: no files changed.");
      return;
    }

    if (!args.yes) {
      if (!interactive) throw new Error("Non-interactive run requires --yes.");
      const ok = await promptYesNo(rl, "Proceed with commits + archive + dashboard? (y/N): ");
      if (!ok) {
        console.log("[ship:commit] Cancelled.");
        process.exit(0);
      }
    }

    const shouldWriteChangelog = !args.noChangelog;
    for (const item of plan) {
      applyUserscriptVersion(item.filePath, item.nextVersion);
      if (shouldWriteChangelog) {
        appendScriptChangelog({
          changelogPath: item.changelogPath,
          scriptId: item.scriptId,
          version: item.nextVersion,
          date: item.date,
          summary: item.summary,
          relPath: item.relPath,
        });
      }
      appendVersionsCsvRow({
        date: item.date,
        script_id: item.scriptId,
        version: item.nextVersion,
        bump: item.bump,
        summary: item.summary,
        commit_sha: "",
      });

      const commitPaths = [item.relPath, "versions.csv"];
      if (shouldWriteChangelog) {
        commitPaths.push(toRepoRel(item.changelogPath));
      }

      runGit(["add", "--", ...commitPaths]);
      runGit(["commit", "--only", "-m", item.subject, "--", ...commitPaths]);
      const newSha = requireHeadCommit();

      console.log(
        `[ship:commit] committed ${item.scriptId}: ${item.currentVersion} -> ${item.nextVersion} (${item.bump}) sha=${newSha.slice(0, 7)}`,
      );
    }

    if (args.noArchive) {
      console.log("[ship:commit] skipping archive snapshot (--no-archive).");
    } else {
      console.log("[ship:commit] running archive snapshot...");
      runCommand("node", ["tools/ops/archive-snapshot.mjs", REPO_ROOT]);
    }
    if (args.noDashboard) {
      console.log("[ship:commit] skipping dashboard build (--no-dashboard).");
    } else {
      console.log("[ship:commit] running dashboard build...");
      runCommand("npm", ["run", "dashboard:build"]);
    }
    console.log("[ship:commit] done.");
  } finally {
    if (rl) rl.close();
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    all: false,
    magnitude: "",
    summary: "",
    yes: false,
    noArchive: false,
    noDashboard: false,
    noChangelog: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run" || arg === "--dry") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--all") {
      out.all = true;
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      out.yes = true;
      continue;
    }
    if (arg === "--no-archive") {
      out.noArchive = true;
      continue;
    }
    if (arg === "--no-dashboard") {
      out.noDashboard = true;
      continue;
    }
    if (arg === "--no-changelog") {
      out.noChangelog = true;
      continue;
    }
    if (arg === "--magnitude") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --magnitude.");
      out.magnitude = normalizeMagnitude(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--magnitude=")) {
      out.magnitude = normalizeMagnitude(arg.slice("--magnitude=".length));
      continue;
    }
    if (arg === "--summary") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --summary.");
      out.summary = String(next).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--summary=")) {
      out.summary = String(arg.slice("--summary=".length)).trim();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (out.summary) {
    out.summary = out.summary.replace(/\r?\n/g, " ").trim();
  }
  if (out.summary.length === 0) out.summary = "";
  return out;
}

function printHelp() {
  console.log(
    "Usage: npm run ship:commit [-- --dry-run] [--all] [--magnitude=patch|minor|major] [--summary=\"...\"] [--yes] [--no-archive] [--no-dashboard] [--no-changelog]",
  );
}

function ensureGitRepo() {
  const inside = runGitCapture(["rev-parse", "--is-inside-work-tree"]).stdout.trim();
  if (inside !== "true") throw new Error("Not a git repository.");
}

function requireHeadCommit() {
  try {
    return runGitCapture(["rev-parse", "HEAD"]).stdout.trim();
  } catch {
    throw new Error("Repository has no commits yet.");
  }
}

function parseStatusPaths() {
  const raw = runGitCapture(["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout;
  if (!raw) return [];
  const fields = raw.split("\0").filter(Boolean);
  const out = [];

  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    const status = entry.slice(0, 2);
    const pathA = normalizePath(entry.slice(3));
    if (pathA) out.push(pathA);
    if (status.includes("R") || status.includes("C")) {
      i += 1;
      const pathB = normalizePath(fields[i] || "");
      if (pathB) out.push(pathB);
    }
  }

  return uniqueSorted(out);
}

function listChangedScripts(paths) {
  return paths
    .filter((p) => isUserscriptPath(p))
    .filter((p) => {
      const abs = path.join(REPO_ROOT, p);
      try {
        return fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch {
        return false;
      }
    });
}

function isUserscriptPath(relPath) {
  return USERSCRIPT_PATH_RE.test(normalizePath(relPath));
}

function readScriptDescriptor(relPath) {
  const filePath = path.join(REPO_ROOT, relPath);
  const text = fs.readFileSync(filePath, "utf8");
  const headerMatch = text.match(USERSCRIPT_HEADER_RE);
  if (!headerMatch) throw new Error(`Missing userscript header in ${relPath}.`);
  const header = headerMatch[0];

  const idMatch = header.match(/^\/\/\s*@h2o-id\s+(.+?)\s*$/m);
  let scriptId = "";
  if (idMatch) {
    scriptId = String(idMatch[1]).trim();
    if (!SAFE_ID_RE.test(scriptId)) {
      throw new Error(`Invalid @h2o-id "${scriptId}" in ${relPath}.`);
    }
  } else {
    scriptId = deriveScriptIdFromFileName(path.basename(relPath));
    if (!scriptId || !SAFE_ID_RE.test(scriptId)) {
      throw new Error(`Could not derive valid script id from ${relPath}.`);
    }
  }

  const versionMatch = header.match(/^\/\/\s*@version\s+(.+?)\s*$/m);
  if (!versionMatch) throw new Error(`Missing @version in ${relPath}.`);
  const versionInfo = parseCurrentVersion(String(versionMatch[1]).trim(), relPath);

  return {
    relPath,
    filePath,
    scriptId,
    rawVersion: versionInfo.rawVersion,
    baseVersion: versionInfo.baseVersion,
  };
}

function parseCurrentVersion(rawVersion, relPath) {
  const strict = semver.valid(rawVersion);
  if (strict) {
    const parsed = semver.parse(strict);
    if (!parsed) throw new Error(`Unable to parse version ${rawVersion} in ${relPath}.`);
    return {
      rawVersion,
      baseVersion: `${parsed.major}.${parsed.minor}.${parsed.patch}`,
    };
  }

  const isLegacy = /^\d+$/.test(rawVersion) || /^\d+\.\d+$/.test(rawVersion);
  if (isLegacy) {
    const coerced = semver.coerce(rawVersion);
    if (!coerced) throw new Error(`Unable to coerce legacy version ${rawVersion} in ${relPath}.`);
    return {
      rawVersion,
      baseVersion: coerced.version,
    };
  }

  throw new Error(`Invalid @version "${rawVersion}" in ${relPath}. Expected SemVer or legacy X / X.Y.`);
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

function printChangedScripts(descriptors) {
  console.log("[ship:commit] changed scripts:");
  descriptors.forEach((d, idx) => {
    console.log(`  ${idx + 1}) ${d.relPath}`);
    console.log(`     id: ${d.scriptId}`);
    console.log(`     version: ${d.rawVersion}`);
  });
}

async function promptSelection(rl, descriptors) {
  while (true) {
    const answer = await ask(rl, "Select script index(es) (example: 1,3 or all): ");
    const parsed = parseSelection(answer, descriptors.length);
    if (!parsed.ok) {
      console.log(`[ship:commit] ${parsed.error}`);
      continue;
    }
    return parsed.indices.map((i) => descriptors[i]);
  }
}

function parseSelection(raw, max) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "all") {
    return { ok: true, indices: Array.from({ length: max }, (_, i) => i) };
  }

  const tokens = String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!tokens.length) return { ok: false, error: "Selection is required." };
  const out = [];
  const seen = new Set();
  for (const token of tokens) {
    if (!/^\d+$/.test(token)) return { ok: false, error: `Invalid index "${token}".` };
    const n = Number(token);
    if (!Number.isInteger(n) || n < 1 || n > max) return { ok: false, error: `Index out of range: ${token}` };
    const idx = n - 1;
    if (!seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return { ok: true, indices: out };
}

async function resolveBumps(args, selected, rl, interactive) {
  const map = new Map();
  if (args.magnitude) {
    for (const s of selected) map.set(s.relPath, args.magnitude);
    return map;
  }

  if (!interactive) {
    for (const s of selected) map.set(s.relPath, "patch");
    return map;
  }

  if (selected.length === 1) {
    map.set(selected[0].relPath, await promptMagnitude(rl, selected[0]));
    return map;
  }

  const same = await promptYesNo(rl, "Apply same bump level to all selected scripts? (Y/n): ", {
    defaultYes: true,
  });
  if (same) {
    const magnitude = await promptMagnitude(rl);
    for (const s of selected) map.set(s.relPath, magnitude);
    return map;
  }

  for (const s of selected) {
    map.set(s.relPath, await promptMagnitude(rl, s));
  }
  return map;
}

async function resolveSummary(args, rl, interactive) {
  if (args.summary) return args.summary;
  if (!interactive) throw new Error("Non-interactive run requires --summary.");

  while (true) {
    const summary = String(await ask(rl, "Summary (one line): ")).replace(/\r?\n/g, " ").trim();
    if (summary) return summary;
    console.log("[ship:commit] Summary is required.");
  }
}

async function promptMagnitude(rl, script = null) {
  const suffix = script ? ` for ${script.scriptId}` : "";
  while (true) {
    const answer = await ask(rl, `Bump level${suffix} [patch/minor/major] (default patch): `);
    const normalized = normalizeMagnitude(answer || "patch");
    if (normalized) return normalized;
    console.log("[ship:commit] Invalid bump level.");
  }
}

function normalizeMagnitude(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "patch";
  if (v === "patch" || v === "small" || v === "fix") return "patch";
  if (v === "minor" || v === "medium" || v === "feat") return "minor";
  if (v === "major" || v === "breaking") return "major";
  return "";
}

function buildPlan(selected, bumpByPath, summary) {
  const date = new Date().toISOString().slice(0, 10);
  return selected.map((script) => {
    const bump = bumpByPath.get(script.relPath) || "patch";
    const nextVersion = semver.inc(script.baseVersion, bump);
    if (!nextVersion) throw new Error(`Failed to bump ${script.scriptId} from ${script.baseVersion} (${bump}).`);
    const subject = buildCommitSubject(script.scriptId, bump, summary);
    const changelogPath = path.join(REPO_ROOT, "changelogs", `${script.scriptId}.CHANGELOG.md`);
    return {
      ...script,
      bump,
      nextVersion,
      subject,
      summary,
      changelogPath,
      date,
      currentVersion: script.rawVersion,
    };
  });
}

function printPlan(plan, args) {
  const { dryRun, noArchive, noDashboard, noChangelog } = args;
  console.log("");
  console.log(`[ship:commit] plan (${plan.length} script${plan.length === 1 ? "" : "s"})${dryRun ? " [dry-run]" : ""}:`);
  for (const item of plan) {
    console.log(`  - ${item.subject}`);
    console.log(`    ${item.relPath}: ${item.currentVersion} -> ${item.nextVersion}`);
    if (noChangelog) {
      console.log("    changelog: skipped (--no-changelog)");
    } else {
      console.log(`    changelog: ${toRepoRel(item.changelogPath)}`);
    }
    console.log("    versions.csv: +1 row");
  }
  console.log(
    noArchive
      ? "  - archive snapshot: skipped (--no-archive)"
      : "  - archive snapshot: node tools/ops/archive-snapshot.mjs \"$PWD\"",
  );
  console.log(
    noDashboard
      ? "  - dashboard build: skipped (--no-dashboard)"
      : "  - dashboard build: npm run dashboard:build",
  );
}

function buildCommitSubject(scriptId, bump, summary) {
  if (bump === "patch") return `fix(${scriptId}): ${summary}`;
  if (bump === "minor") return `feat(${scriptId}): ${summary}`;
  return `feat(${scriptId})!: ${summary}`;
}

function applyUserscriptVersion(filePath, nextVersion) {
  const text = fs.readFileSync(filePath, "utf8");
  const headerMatch = text.match(USERSCRIPT_HEADER_RE);
  if (!headerMatch || headerMatch.index == null) {
    throw new Error(`Missing userscript header in ${toRepoRel(filePath)}.`);
  }
  const header = headerMatch[0];
  if (!/^\/\/\s*@version\s+.+$/m.test(header)) {
    throw new Error(`Missing @version in ${toRepoRel(filePath)}.`);
  }
  const updatedHeader = header.replace(
    /^(\s*\/\/\s*@version\s+)(\S+)(.*)$/m,
    (_full, p1, _p2, p3) => `${p1}${nextVersion}${p3}`,
  );
  const updated = `${text.slice(0, headerMatch.index)}${updatedHeader}${text.slice(headerMatch.index + header.length)}`;
  fs.writeFileSync(filePath, updated);
}

function appendScriptChangelog({ changelogPath, scriptId, version, date, summary, relPath }) {
  ensureDir(path.dirname(changelogPath));
  const exists = fs.existsSync(changelogPath);
  let text = exists ? fs.readFileSync(changelogPath, "utf8") : "";
  const nl = detectNewline(text || "\n");
  if (!exists) {
    text = `# ${scriptId} changelog${nl}${nl}`;
  } else if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += nl;
  }

  text += `## ${version} - ${date}${nl}`;
  text += `- ${summary}${nl}`;
  text += `- file: ${relPath}${nl}${nl}`;
  fs.writeFileSync(changelogPath, text);
}

function appendVersionsCsvRow(row) {
  const fields = ["date", "script_id", "version", "bump", "summary", "commit_sha"];
  const line = fields.map((k) => csvField(row[k])).join(",");
  const csvPath = path.join(REPO_ROOT, "versions.csv");
  const exists = fs.existsSync(csvPath);

  if (!exists) {
    fs.writeFileSync(csvPath, `${CSV_HEADER}\n${line}\n`);
    return;
  }

  let text = fs.readFileSync(csvPath, "utf8");
  const first = String(text.split(/\r?\n/, 1)[0] || "");
  if (first !== CSV_HEADER) {
    throw new Error(`versions.csv header mismatch in ${toRepoRel(csvPath)}.`);
  }
  if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += "\n";
  }
  text += `${line}\n`;
  fs.writeFileSync(csvPath, text);
}

function listStagedOutsideSelection(selectedSet) {
  const staged = readNameList(runGitCapture(["diff", "--cached", "--name-only"]).stdout);
  const out = { allowed: [], foreign: [] };
  for (const p of staged) {
    if (selectedSet.has(p)) continue;
    if (!isUserscriptPath(p) && isAllowedNonScriptDirtyPath(p)) {
      out.allowed.push(p);
      continue;
    }
    out.foreign.push(p);
  }
  return out;
}

function isAllowedNonScriptDirtyPath(relPath) {
  const p = normalizePath(relPath);
  return ALLOWED_NON_SCRIPT_DIRTY_RE.some((re) => re.test(p));
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || "")));
  });
}

async function promptYesNo(rl, question, { defaultYes = false } = {}) {
  const raw = await ask(rl, question);
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return defaultYes;
  return normalized === "y" || normalized === "yes";
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function readNameList(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => normalizePath(s).trim())
    .filter(Boolean);
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function csvField(value) {
  const s = String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, "\"\"");
  return `"${s}"`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toRepoRel(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (!rel || rel === "") return ".";
  return normalizePath(rel);
}

function runGit(args) {
  const res = spawnSync("git", args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`git ${quoteArgs(args)} failed with exit ${res.status}`);
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
  console.error(msg.startsWith("[ship:commit]") ? msg : `[ship:commit] ${msg}`);
  process.exit(1);
}
