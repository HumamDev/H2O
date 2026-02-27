#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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

function scopeForPath(filePath) {
  const p = String(filePath || "").replace(/\\/g, "/");
  if (p.startsWith("tools/")) return "tools";
  if (p.startsWith("scripts/")) return "scripts";
  if (p.startsWith("meta/")) return "meta";
  if (p.startsWith("config/")) return "config";
  if (p === "archive/.state/lastVersions.json" || p.startsWith("archive/.state/")) return "archive";
  return null;
}

function chooseMessage(files) {
  const scopes = new Set();
  let hasUnknown = false;

  for (const file of files) {
    const scope = scopeForPath(file);
    if (!scope) hasUnknown = true;
    else scopes.add(scope);
  }

  const mixed = hasUnknown || scopes.size !== 1;
  if (mixed) {
    return {
      message: "chore: update workspace",
      mixed: true,
    };
  }

  const onlyScope = Array.from(scopes)[0];
  if (onlyScope === "tools") return { message: "chore(tools): update tooling", mixed: false };
  if (onlyScope === "scripts") return { message: "chore(scripts): update scripts", mixed: false };
  if (onlyScope === "meta") return { message: "chore(meta): update metadata", mixed: false };
  if (onlyScope === "config") return { message: "chore(config): update config", mixed: false };
  if (onlyScope === "archive") return { message: "chore(archive): update archive state", mixed: false };

  return {
    message: "chore: update workspace",
    mixed: true,
  };
}

function main() {
  const status = runGitCapture(["status", "--porcelain=v1"]).trim();
  if (!status) {
    console.log("[commit:auto] nothing to commit");
    process.exit(0);
  }

  console.log("[commit:auto] staging changes");
  runGit(["add", "-A"]);

  const stagedOut = runGitCapture(["diff", "--cached", "--name-only"]);
  const stagedFiles = stagedOut
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!stagedFiles.length) {
    console.log("[commit:auto] nothing to commit");
    process.exit(0);
  }

  const { message, mixed } = chooseMessage(stagedFiles);
  if (mixed) {
    console.log("[commit:auto] warning: mixed changes detected; using fallback message");
  }
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
