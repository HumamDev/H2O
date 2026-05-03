#!/usr/bin/env node
// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

try {
  ensureGitRepo();
  installPreCommitHook();
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.startsWith("[hooks]") ? msg : `[hooks] ${msg}`);
  process.exit(1);
}

function ensureGitRepo() {
  const res = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.error || res.status !== 0 || String(res.stdout || "").trim() !== "true") {
    throw new Error("[hooks] Not a git repository.");
  }
}

function installPreCommitHook() {
  const gitCommonDirRes = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (gitCommonDirRes.error || gitCommonDirRes.status !== 0) {
    throw new Error("[hooks] Could not determine git common dir.");
  }
  const gitCommonDir = String(gitCommonDirRes.stdout || "").trim();
  const hooksDir = path.resolve(REPO_ROOT, gitCommonDir, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  const hookPath = path.join(hooksDir, "pre-commit");
  const body = [
    "#!/bin/sh",
    "# h2o pre-commit: stamp ONLY staged userscripts; never auto-stage unrelated files.",
    "",
    "# Emergency bypass (preferable to --no-verify; preserves any other hooks).",
    "if [ \"${H2O_SKIP_REV_STAMP:-0}\" = \"1\" ]; then",
    "  echo \"[pre-commit] H2O_SKIP_REV_STAMP=1; skipping rev:stamp.\"",
    "  exit 0",
    "fi",
    "",
    "# Capture the staged userscript subset (NUL-delim, robust against spaces/emoji).",
    "tmpf=$(mktemp -t h2o-prestamp.XXXXXX) || { echo \"[pre-commit] mktemp failed\" >&2; exit 1; }",
    "trap 'rm -f \"$tmpf\"' EXIT INT TERM HUP",
    "",
    "git diff --cached --name-only --diff-filter=ACMR -z -- 'scripts/*.user.js' > \"$tmpf\"",
    "",
    "# No staged userscripts -> nothing for rev:stamp to do; do not touch the staging area.",
    "if [ ! -s \"$tmpf\" ]; then",
    "  echo \"[pre-commit] No staged userscripts; skipping rev:stamp.\"",
    "  exit 0",
    "fi",
    "",
    "# rev:stamp --files parses on comma; refuse if any staged userscript filename contains one.",
    "if tr '\\0' '\\n' < \"$tmpf\" | grep -q ','; then",
    "  echo \"[pre-commit] Staged userscript filename contains a comma; rename or use H2O_SKIP_REV_STAMP=1.\" >&2",
    "  exit 1",
    "fi",
    "",
    "files_arg=$(tr '\\0' ',' < \"$tmpf\" | sed 's/,$//')",
    "",
    "node tools/versioning/rev-stamp.mjs --with-build --log-edit --files \"$files_arg\"",
    "status=$?",
    "if [ \"$status\" -ne 0 ]; then",
    "  echo \"[pre-commit] rev:stamp failed\" >&2",
    "  exit \"$status\"",
    "fi",
    "",
    "# Re-stage exactly the userscripts we asked rev:stamp to stamp; nothing else.",
    "xargs -0 git add -- < \"$tmpf\"",
    "exit 0",
    "",
  ].join("\n");

  fs.writeFileSync(hookPath, body, { encoding: "utf8", mode: 0o755 });
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch {}

  console.log("[hooks] Installed .git/hooks/pre-commit");
  console.log("[hooks] This hook is opt-in and runs: npm run rev:stamp");
}
