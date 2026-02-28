#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { appendEditRows, buildEditRowsForPaths } from "./edit-log.mjs";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

const USERSCRIPT_HEADER_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/;
const USERSCRIPT_PATH_RE = /^scripts\/.+\.user\.js$/i;
const REV_LINE_RE = /^\s*\/\/\s*@rev\s+(\d+)\s*$/i;
const BUILD_LINE_RE = /^\s*\/\/\s*@build\s+(.+?)\s*$/i;
const VERSION_LINE_RE = /^\s*\/\/\s*@version\b/i;
const START_LINE_RE = /^\s*\/\/\s*==UserScript==\s*$/i;

try {
  await main();
} catch (err) {
  fatal(err);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureGitRepo();

  const targets = args.files.length > 0 ? args.files : detectChangedUserScripts();
  if (!targets.length) {
    console.log("[rev:stamp] No changed userscripts under scripts/*.user.js.");
    process.exit(0);
  }

  const isoNow = args.withBuild ? new Date().toISOString().replace(/\.\d{3}Z$/, "Z") : "";
  let changedCount = 0;
  const changedPaths = [];
  const editOverrides = new Map();

  for (const relPath of targets) {
    const normalized = normalizePath(relPath);
    if (!USERSCRIPT_PATH_RE.test(normalized)) {
      throw new Error(`[rev:stamp] Refusing non-userscript path: ${normalized}`);
    }

    const absPath = path.join(REPO_ROOT, normalized);
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      throw new Error(`[rev:stamp] File not found: ${normalized}`);
    }

    const text = fs.readFileSync(absPath, "utf8");
    const next = stampText(text, {
      relPath: normalized,
      withBuild: args.withBuild,
      buildIso: isoNow,
    });

    if (!next.changed) {
      continue;
    }

    changedCount += 1;
    changedPaths.push(normalized);
    editOverrides.set(normalized, {
      rev: next.nextRev,
      build: args.withBuild ? next.nextBuild : undefined,
    });
    if (args.dryRun) {
      printDryRunLine(normalized, next);
      continue;
    }

    fs.writeFileSync(absPath, next.text, "utf8");
    printApplyLine(normalized, next);
  }

  if (args.dryRun) {
    console.log(`[rev:stamp] dry-run complete. files planned: ${changedCount}`);
  } else {
    console.log(`[rev:stamp] updated files: ${changedCount}`);
  }

  if (args.logEdit && changedPaths.length > 0) {
    const rows = buildEditRowsForPaths(changedPaths, {
      note: args.noteProvided ? args.note : undefined,
      explicitNote: args.noteProvided,
      ts: nowIsoNoMs(),
      overrides: editOverrides,
    });
    appendEditRows(rows, { dryRun: args.dryRun });
  }
}

function parseArgs(argv) {
  const out = {
    dryRun: false,
    withBuild: false,
    logEdit: false,
    files: [],
    note: "",
    noteProvided: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run" || arg === "--dry") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--with-build") {
      out.withBuild = true;
      continue;
    }
    if (arg === "--log-edit") {
      out.logEdit = true;
      continue;
    }
    if (arg === "--files") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --files.");
      out.files = parseFilesArg(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--files=")) {
      out.files = parseFilesArg(arg.slice("--files=".length));
      continue;
    }
    if (arg === "--note") {
      const noteParts = [];
      let j = i + 1;
      // If note text itself needs leading "--", users should quote:
      // --note "fix: handle --flag parsing"
      while (j < argv.length) {
        const token = String(argv[j] ?? "");
        if (token === "--") break;
        if (token.startsWith("--")) break;
        noteParts.push(token);
        j += 1;
      }
      if (!noteParts.length) throw new Error("Missing value after --note.");
      out.note = noteParts.join(" ");
      out.noteProvided = true;
      i = j - 1;
      continue;
    }
    if (arg.startsWith("--note=")) {
      out.note = String(arg.slice("--note=".length));
      out.noteProvided = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  out.note = String(out.note || "").replace(/\r?\n/g, " ").trim();
  out.files = uniqueSorted(out.files.map(normalizePath).filter(Boolean));
  return out;
}

function printHelp() {
  console.log(
    "Usage: node tools/rev-stamp.mjs [--dry-run] [--with-build] [--log-edit] [--files path1,path2] [--note \"...\"]",
  );
}

function parseFilesArg(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureGitRepo() {
  const inside = runGitCapture(["rev-parse", "--is-inside-work-tree"]).stdout.trim();
  if (inside !== "true") throw new Error("Not a git repository.");
}

function detectChangedUserScripts() {
  const unstaged = readNameList(runGitCapture(["diff", "--name-only", "-z", "--", "scripts"]).stdout, true);
  const staged = readNameList(runGitCapture(["diff", "--cached", "--name-only", "-z", "--", "scripts"]).stdout, true);
  const untracked = readNameList(
    runGitCapture(["ls-files", "--others", "--exclude-standard", "-z", "--", "scripts"]).stdout,
    true,
  );

  return uniqueSorted([...unstaged, ...staged, ...untracked])
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

function stampText(text, { relPath, withBuild, buildIso }) {
  const headerMatch = text.match(USERSCRIPT_HEADER_RE);
  if (!headerMatch || headerMatch.index == null) {
    throw new Error(`[rev:stamp] Missing userscript header in ${relPath}`);
  }

  const header = headerMatch[0];
  const newline = detectNewline(text);
  const lines = header.split(/\r?\n/);

  let revIdx = findLineIndex(lines, REV_LINE_RE);
  let oldRev = "000000";
  let revNum = 0;
  if (revIdx >= 0) {
    const m = lines[revIdx].match(REV_LINE_RE);
    if (!m) throw new Error(`[rev:stamp] Invalid @rev format in ${relPath}`);
    const raw = String(m[1] || "").trim();
    if (!/^\d+$/.test(raw)) throw new Error(`[rev:stamp] Invalid @rev value in ${relPath}`);
    oldRev = String(raw).padStart(6, "0");
    revNum = Number(raw);
  }

  const nextRevNum = revNum + 1;
  const nextRev = String(nextRevNum).padStart(6, "0");
  const revLine = `// @rev        ${nextRev}`;

  if (revIdx >= 0) {
    lines[revIdx] = revLine;
  } else {
    const insertIdx = findRevInsertIndex(lines);
    lines.splice(insertIdx, 0, revLine);
    revIdx = insertIdx;
  }

  let oldBuild = "";
  let nextBuild = "";
  if (withBuild) {
    nextBuild = buildIso;
    const buildLine = `// @build      ${buildIso}`;
    const buildIdx = findLineIndex(lines, BUILD_LINE_RE);
    if (buildIdx >= 0) {
      const m = lines[buildIdx].match(BUILD_LINE_RE);
      oldBuild = m ? String(m[1] || "").trim() : "";
      lines[buildIdx] = buildLine;
    } else {
      lines.splice(revIdx + 1, 0, buildLine);
    }
  }

  const nextHeader = lines.join(newline);
  if (nextHeader === header) {
    return {
      changed: false,
      text,
      oldRev,
      nextRev,
      oldBuild,
      nextBuild,
    };
  }

  const start = headerMatch.index;
  const end = start + header.length;
  const nextText = `${text.slice(0, start)}${nextHeader}${text.slice(end)}`;
  return {
    changed: true,
    text: nextText,
    oldRev,
    nextRev,
    oldBuild,
    nextBuild,
  };
}

function findRevInsertIndex(lines) {
  const versionIdx = findLineIndex(lines, VERSION_LINE_RE);
  if (versionIdx >= 0) return versionIdx + 1;

  const startIdx = findLineIndex(lines, START_LINE_RE);
  if (startIdx >= 0) return startIdx + 1;

  return 1;
}

function findLineIndex(lines, re) {
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i])) return i;
  }
  return -1;
}

function printDryRunLine(relPath, info) {
  const buildChunk = info.nextBuild
    ? ` | build ${info.oldBuild || "<none>"} -> ${info.nextBuild}`
    : "";
  console.log(`[rev:stamp] ${relPath} | rev ${info.oldRev} -> ${info.nextRev}${buildChunk}`);
}

function printApplyLine(relPath, info) {
  const buildChunk = info.nextBuild
    ? ` | build ${info.oldBuild || "<none>"} -> ${info.nextBuild}`
    : "";
  console.log(`[rev:stamp] stamped ${relPath} | rev ${info.oldRev} -> ${info.nextRev}${buildChunk}`);
}

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function readNameList(text, zeroDelimited = false) {
  if (zeroDelimited) {
    return String(text || "")
      .split("\0")
      .map((s) => normalizePath(s).trim())
      .filter(Boolean);
  }
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => normalizePath(s).trim())
    .filter(Boolean);
}

function nowIsoNoMs() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
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

function quoteArgs(args) {
  return args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ");
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.startsWith("[rev:stamp]") ? msg : `[rev:stamp] ${msg}`);
  process.exit(1);
}
