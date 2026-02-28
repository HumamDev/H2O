#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";

const SAFE_STAGE_PATHS = [
  "tools",
  "scripts",
  "config",
  "meta",
  "changelogs",
  "versions.csv",
  "package.json",
  "package-lock.json",
  ".vscode/tasks.json",
  ".vscode/settings.json",
  "archive/.state/lastVersions.json",
];

const MAX_UNSAFE_PRINT = 15;
const DEFAULT_MESSAGE_FILE = "meta/notes/COMMIT_MESSAGE.txt";

function runGitCapture(args) {
  const res = spawnSync("git", args, { encoding: "utf8" });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const err = (res.stderr || "").trim();
    throw new Error(err || `git ${args.join(" ")} failed`);
  }
  return String(res.stdout || "");
}

function runGit(args) {
  const res = spawnSync("git", args, { stdio: "inherit" });
  if (res.error) throw res.error;
  if (res.status !== 0) process.exit(res.status ?? 1);
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function firstNonEmptyLine(lines) {
  for (const line of lines) {
    const t = String(line || "").trim();
    if (t) return t;
  }
  return "";
}

function asOneLine(v) {
  return firstNonEmptyLine(String(v || "").split(/\r?\n/));
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths.map(normalizePath).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function parseStatusPaths() {
  const raw = runGitCapture(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!raw) return [];

  const fields = raw.split("\0").filter(Boolean);
  const out = [];

  for (let i = 0; i < fields.length; i += 1) {
    const entry = fields[i];
    const status = entry.slice(0, 2);
    const pathA = normalizePath(entry.slice(3));
    if (pathA) out.push(pathA);

    // Porcelain v1 -z emits a second path for rename/copy entries.
    if (status.includes("R") || status.includes("C")) {
      i += 1;
      const pathB = normalizePath(fields[i] || "");
      if (pathB) out.push(pathB);
    }
  }

  return uniqueSorted(out);
}

function parseStagedPaths() {
  const raw = runGitCapture(["diff", "--cached", "--name-only", "-z"]);
  if (!raw) return [];
  return uniqueSorted(raw.split("\0"));
}

function isSafePath(filePath) {
  const p = normalizePath(filePath);
  const base = p.split("/").pop() || "";

  if (!p) return false;
  if (p === DEFAULT_MESSAGE_FILE) return false;
  if (base === ".DS_Store") return false;
  if (p.startsWith("build/")) return false;
  if (p.startsWith("node_modules/")) return false;
  if (p.startsWith("archive/") && p !== "archive/.state/lastVersions.json") return false;

  if (p.startsWith("tools/")) return true;
  if (p.startsWith("scripts/")) return true;
  if (p.startsWith("config/")) return true;
  if (p.startsWith("meta/")) return true;
  if (p.startsWith("changelogs/")) return true;

  if (p === "versions.csv") return true;
  if (p === "package.json") return true;
  if (p === "package-lock.json") return true;
  if (p === ".vscode/tasks.json") return true;
  if (p === ".vscode/settings.json") return true;
  if (p === "archive/.state/lastVersions.json") return true;

  return false;
}

function scopeForPath(filePath) {
  const p = normalizePath(filePath);

  if (p === "archive/.state/lastVersions.json") return "archive";
  if (p.startsWith("tools/")) return "tools";
  if (p.startsWith("scripts/")) return "scripts";
  if (p.startsWith("meta/")) return "meta";
  if (p.startsWith("config/")) return "config";
  if (p.startsWith("changelogs/")) return "changelogs";
  if (p === ".vscode/tasks.json" || p === ".vscode/settings.json") return "vscode";
  if (p === "package.json" || p === "package-lock.json" || p === "versions.csv") return "release";
  return null;
}

function chooseMessage(files) {
  const scopes = new Set(files.map(scopeForPath).filter(Boolean));
  if (scopes.size !== 1) {
    return {
      message: "chore: update workspace",
      mixed: true,
    };
  }

  const onlyScope = [...scopes][0];
  if (onlyScope === "tools") return { message: "chore(tools): update tooling", mixed: false };
  if (onlyScope === "scripts") return { message: "chore(scripts): update scripts", mixed: false };
  if (onlyScope === "config") return { message: "chore(config): update config", mixed: false };
  if (onlyScope === "meta") return { message: "chore(meta): update metadata", mixed: false };
  if (onlyScope === "archive") return { message: "chore(archive): update archive state", mixed: false };
  if (onlyScope === "release") return { message: "chore(release): update release metadata", mixed: false };
  if (onlyScope === "vscode") return { message: "chore(vscode): update workspace tasks", mixed: false };
  if (onlyScope === "changelogs") return { message: "chore(changelogs): update changelogs", mixed: false };

  return {
    message: "chore: update workspace",
    mixed: true,
  };
}

function parseFlags() {
  const out = {
    dryRun: false,
    force: false,
    hasMessage: false,
    message: "",
    hasMessageFile: false,
    messageFile: "",
  };

  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--force") {
      out.force = true;
      continue;
    }
    if (arg === "--message") {
      if (i + 1 >= argv.length) throw new Error("missing value for --message");
      i += 1;
      out.hasMessage = true;
      out.message = argv[i];
      continue;
    }
    if (arg.startsWith("--message=")) {
      out.hasMessage = true;
      out.message = arg.slice("--message=".length);
      continue;
    }
    if (arg === "--message-file") {
      if (i + 1 >= argv.length) throw new Error("missing value for --message-file");
      i += 1;
      out.hasMessageFile = true;
      out.messageFile = argv[i];
      continue;
    }
    if (arg.startsWith("--message-file=")) {
      out.hasMessageFile = true;
      out.messageFile = arg.slice("--message-file=".length);
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return out;
}

function printUnsafeWarning(paths) {
  console.log(`[commit:auto] warning: ${paths.length} path(s) are outside safe auto-commit scope`);
  const shown = paths.slice(0, MAX_UNSAFE_PRINT);
  for (const p of shown) {
    console.log(`  - ${p}`);
  }
  if (paths.length > shown.length) {
    console.log(`  ... and ${paths.length - shown.length} more`);
  }
}

function readMessageFromText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const codexLines = [];
  const gitlensLines = [];
  let section = "";

  for (const rawLine of lines) {
    const tag = String(rawLine || "").trim().toLowerCase();
    if (tag === "[codex]") {
      section = "codex";
      continue;
    }
    if (tag === "[gitlens]") {
      section = "gitlens";
      continue;
    }
    if (section === "codex") codexLines.push(rawLine);
    if (section === "gitlens") gitlensLines.push(rawLine);
  }

  const codex = firstNonEmptyLine(codexLines);
  if (codex) return { message: codex, source: "codex" };

  const gitlens = firstNonEmptyLine(gitlensLines);
  if (gitlens) return { message: gitlens, source: "gitlens" };

  const plain = firstNonEmptyLine(
    lines.filter((line) => {
      const t = String(line || "").trim().toLowerCase();
      return t !== "[codex]" && t !== "[gitlens]";
    }),
  );
  if (plain) return { message: plain, source: "file" };

  return { message: "", source: "empty" };
}

function readMessageFromFile(filePath, { failOnEmpty }) {
  const p = normalizePath(filePath);
  if (!fs.existsSync(p)) {
    const e = new Error(`message file not found: ${p}`);
    e.exitCode = 3;
    throw e;
  }

  let text = "";
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (err) {
    const e = new Error(`cannot read message file: ${p}`);
    e.exitCode = 3;
    e.cause = err;
    throw e;
  }

  const parsed = readMessageFromText(text);
  if (!parsed.message && failOnEmpty) {
    const e = new Error(`message file has no usable line: ${p}`);
    e.exitCode = 3;
    throw e;
  }
  return parsed;
}

function pickCommitMessage({
  hasProvidedMessage,
  providedMessage,
  hasExplicitMessageFile,
  explicitMessageFile,
  inferredMessage,
}) {
  if (hasProvidedMessage) {
    const explicitLine = asOneLine(providedMessage);
    if (!explicitLine) {
      const e = new Error("--message is empty");
      e.exitCode = 3;
      throw e;
    }
    return { message: explicitLine, source: "provided", fileUsed: "" };
  }

  if (hasExplicitMessageFile) {
    const pathArg = normalizePath(explicitMessageFile);
    if (!pathArg) {
      const e = new Error("--message-file is empty");
      e.exitCode = 3;
      throw e;
    }
    const parsed = readMessageFromFile(explicitMessageFile, { failOnEmpty: true });
    return {
      message: parsed.message,
      source: parsed.source,
      fileUsed: pathArg,
    };
  }

  if (fs.existsSync(DEFAULT_MESSAGE_FILE)) {
    console.log(`[commit:auto] using message from ${DEFAULT_MESSAGE_FILE}`);
    const parsed = readMessageFromFile(DEFAULT_MESSAGE_FILE, { failOnEmpty: false });
    if (parsed.message) {
      return {
        message: parsed.message,
        source: parsed.source,
        fileUsed: DEFAULT_MESSAGE_FILE,
      };
    }
    return {
      message: inferredMessage,
      source: "fallback",
      fileUsed: DEFAULT_MESSAGE_FILE,
    };
  }

  return { message: inferredMessage, source: "inferred", fileUsed: "" };
}

function describeMessageSource(source) {
  if (source === "provided") return "provided";
  if (source === "codex") return "file(codex)";
  if (source === "gitlens") return "file(gitlens)";
  if (source === "file") return "file";
  if (source === "fallback") return "fallback";
  return "inferred";
}

function main() {
  const {
    dryRun,
    force,
    hasMessage: hasProvidedMessage,
    message: providedMessage,
    hasMessageFile: hasExplicitMessageFile,
    messageFile: explicitMessageFile,
  } = parseFlags();
  const changedPaths = parseStatusPaths();

  if (!changedPaths.length) {
    console.log("[commit:auto] nothing to commit");
    process.exit(0);
  }

  const unsafePaths = uniqueSorted(changedPaths.filter((p) => !isSafePath(p)));
  if (unsafePaths.length > 0) {
    printUnsafeWarning(unsafePaths);
    if (!force) {
      console.log("[commit:auto] aborting (use --force to continue with safe paths only)");
      process.exit(2);
    }
    console.log("[commit:auto] --force enabled: continuing with safe paths only");
  }

  const safeChangedPaths = uniqueSorted(changedPaths.filter(isSafePath));
  if (!safeChangedPaths.length) {
    console.log("[commit:auto] nothing to commit");
    process.exit(0);
  }

  if (dryRun) {
    const inferred = chooseMessage(safeChangedPaths);
    const pickedDry = pickCommitMessage({
      hasProvidedMessage,
      providedMessage,
      hasExplicitMessageFile,
      explicitMessageFile,
      inferredMessage: inferred.message,
    });

    console.log(`[commit:auto] dry-run: would stage ${safeChangedPaths.length} file(s)`);
    for (const p of safeChangedPaths) {
      console.log(`  - ${p}`);
    }
    if (inferred.mixed && pickedDry.source === "inferred") {
      console.log("[commit:auto] warning: mixed scopes detected; using fallback message");
    }
    console.log(`[commit:auto] message source: ${describeMessageSource(pickedDry.source)}`);
    console.log(`[commit:auto] message: ${pickedDry.message}`);
    process.exit(0);
  }

  console.log("[commit:auto] staging safe paths");
  runGit(["reset", "--quiet"]);
  runGit(["add", "-A", "--", ...SAFE_STAGE_PATHS]);

  let stagedFiles = parseStagedPaths();
  const stagedUnsafe = stagedFiles.filter((p) => !isSafePath(p));
  if (stagedUnsafe.length > 0) {
    for (const p of stagedUnsafe) {
      runGit(["reset", "--", p]);
    }
    stagedFiles = parseStagedPaths();
  }

  if (!stagedFiles.length) {
    console.log("[commit:auto] nothing to commit");
    process.exit(0);
  }

  const inferredFromStaged = chooseMessage(stagedFiles);
  const picked = pickCommitMessage({
    hasProvidedMessage,
    providedMessage,
    hasExplicitMessageFile,
    explicitMessageFile,
    inferredMessage: inferredFromStaged.message,
  });

  if (inferredFromStaged.mixed && picked.source === "inferred") {
    console.log("[commit:auto] warning: mixed scopes detected; using fallback message");
  }
  console.log(`[commit:auto] staged files: ${stagedFiles.length}`);
  console.log(`[commit:auto] message source: ${describeMessageSource(picked.source)}`);
  console.log(`[commit:auto] message: ${picked.message}`);

  runGit(["commit", "-m", picked.message]);

  console.log("[commit:auto] latest commit");
  runGit(["log", "-1", "--oneline"]);
}

try {
  main();
} catch (err) {
  console.error(`[commit:auto] failed: ${err?.message || err}`);
  process.exit(err?.exitCode || 1);
}
