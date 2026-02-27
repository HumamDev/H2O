#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
  const known = new Set(["--dry-run", "--force"]);
  const argv = process.argv.slice(2);
  for (const arg of argv) {
    if (!known.has(arg)) {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return {
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
  };
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

function main() {
  const { dryRun, force } = parseFlags();
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
    const { message, mixed } = chooseMessage(safeChangedPaths);
    console.log(`[commit:auto] dry-run: would stage ${safeChangedPaths.length} file(s)`);
    for (const p of safeChangedPaths) {
      console.log(`  - ${p}`);
    }
    if (mixed) {
      console.log("[commit:auto] warning: mixed scopes detected; using fallback message");
    }
    console.log(`[commit:auto] message: ${message}`);
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

  const { message, mixed } = chooseMessage(stagedFiles);
  if (mixed) {
    console.log("[commit:auto] warning: mixed scopes detected; using fallback message");
  }
  console.log(`[commit:auto] staged files: ${stagedFiles.length}`);
  console.log(`[commit:auto] message: ${message}`);

  runGit(["commit", "-m", message]);

  console.log("[commit:auto] latest commit");
  runGit(["log", "-1", "--oneline"]);
}

try {
  main();
} catch (err) {
  console.error(`[commit:auto] failed: ${err?.message || err}`);
  process.exit(1);
}
