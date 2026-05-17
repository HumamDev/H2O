#!/usr/bin/env node
// @version 1.1.0  (Phase 0E-1 migration: path constants imported from tools/paths.mjs)
//
// Phase 0E-1 note: REPO_ROOT, META_LEDGER_DIR, EDITS_CSV, EDITS_V2_CSV,
// VERSIONS_CSV, and TOOLS_DIR are sourced from tools/paths.mjs. DASHBOARD_SCRIPT
// remains computed locally via path.join(TOOLS_DIR, "versioning",
// "versions-dashboard.mjs") since it's a sibling-file reference inside this
// versioning folder, not a top-level repo path. Local variable names
// (REPO_ROOT, LEDGER_DIR, EDITS_FILE, EDITS_V2_FILE, VERSIONS_FILE) are
// preserved so the rest of the file is untouched.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  REPO_ROOT,
  TOOLS_DIR,
  META_LEDGER_DIR,
  EDITS_CSV,
  EDITS_V2_CSV,
  VERSIONS_CSV,
} from "../paths.mjs";

const DASHBOARD_SCRIPT = path.join(TOOLS_DIR, "versioning", "versions-dashboard.mjs");

// Local aliases preserve pre-Phase-0E-1 variable names. Each resolves to the
// same value as before:
//   LEDGER_DIR     === META_LEDGER_DIR  (<REPO_ROOT>/meta/ledger)
//   EDITS_FILE     === EDITS_CSV        (<REPO_ROOT>/meta/ledger/edits.csv)
//   EDITS_V2_FILE  === EDITS_V2_CSV     (<REPO_ROOT>/meta/ledger/edits.v2.csv)
//   VERSIONS_FILE  === VERSIONS_CSV     (<REPO_ROOT>/versions.csv)
// REPO_ROOT is used directly via the imported name.
const LEDGER_DIR = META_LEDGER_DIR;
const EDITS_FILE = EDITS_CSV;
const EDITS_V2_FILE = EDITS_V2_CSV;
const VERSIONS_FILE = VERSIONS_CSV;

const DEFAULT_DEBOUNCE_MS = 15_000;
const POLL_MS = 1_000;

try {
  main();
} catch (err) {
  fatal(err);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const pollTimers = [];
  let timer = null;
  let stopping = false;

  log(`debounce=${args.debounceMs}ms`);
  watchFileWithPolling(VERSIONS_FILE, "versions.csv", {
    isOptional: true,
    missingLog: "versions.csv missing; watching for file creation.",
  });
  watchFileWithPolling(EDITS_FILE, "meta/ledger/edits.csv", {
    isOptional: true,
    missingLog: "edits.csv missing; watching meta/ledger for file creation.",
  });
  watchFileWithPolling(EDITS_V2_FILE, "meta/ledger/edits.v2.csv", {
    isOptional: true,
    missingLog: "edits.v2.csv missing; watching meta/ledger for file creation.",
  });

  bindSignal("SIGINT");
  bindSignal("SIGTERM");
  bindSignal("SIGHUP");
  bindSignal("SIGBREAK");

  function bindSignal(signal) {
    try {
      process.on(signal, () => shutdown(signal));
    } catch {
      // Signal is not supported on this platform/runtime.
    }
  }

  function watchFileWithPolling(filePath, reason, options = {}) {
    if (!options.isOptional && !fs.existsSync(filePath)) {
      throw new Error(`Required input file missing: ${toRepoRel(filePath)}`);
    }
    if (options.isOptional && !fs.existsSync(filePath) && options.missingLog) {
      log(String(options.missingLog));
    }

    let prev = statKey(filePath);
    log(`watching ${toRepoRel(filePath)} (poll=${POLL_MS}ms)`);

    const interval = setInterval(() => {
      if (stopping) return;
      const next = statKey(filePath);
      if (!didChange(prev, next)) return;
      prev = next;
      schedule(reason);
    }, POLL_MS);
    pollTimers.push(interval);
  }

  function schedule(reason) {
    if (stopping) return;
    if (timer) clearTimeout(timer);

    log(`change detected: ${reason}; scheduled rebuild in ${args.debounceMs}ms`);
    timer = setTimeout(() => {
      timer = null;
      rebuild();
    }, args.debounceMs);
  }

  function rebuild() {
    if (stopping) return;

    log("rebuilding...");
    const res = spawnSync(process.execPath, [DASHBOARD_SCRIPT], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });

    if (res.error) {
      console.error(`[dash:watch] rebuild failed: ${res.error.message}`);
      return;
    }
    if (res.status !== 0) {
      console.error(`[dash:watch] rebuild failed with exit ${res.status}`);
      return;
    }
    log("ok");
  }

  function shutdown(signal) {
    if (stopping) return;
    stopping = true;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    for (const t of pollTimers) {
      try {
        clearInterval(t);
      } catch {
        // ignore
      }
    }
    log(`stopped (${signal})`);
    process.exit(0);
  }
}

function parseArgs(argv) {
  const out = {
    debounceMs: DEFAULT_DEBOUNCE_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--debounce-ms") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --debounce-ms.");
      out.debounceMs = parseDebounceMs(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--debounce-ms=")) {
      out.debounceMs = parseDebounceMs(arg.slice("--debounce-ms=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function parseDebounceMs(raw) {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid --debounce-ms value: ${raw}`);
  }
  return n;
}

function printHelp() {
  console.log("Usage: node tools/versioning/dashboard-watch.mjs [--debounce-ms <n>]");
}

function didChange(prev, next) {
  if (prev.exists !== next.exists) return true;
  if (!prev.exists && !next.exists) return false;
  return prev.mtimeMs !== next.mtimeMs || prev.size !== next.size;
}

function statKey(filePath) {
  try {
    const st = fs.statSync(filePath);
    return {
      exists: true,
      mtimeMs: Math.trunc(st.mtimeMs),
      size: Number(st.size || 0),
    };
  } catch {
    return {
      exists: false,
      mtimeMs: 0,
      size: 0,
    };
  }
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/");
}

function toRepoRel(absPath) {
  const rel = path.relative(REPO_ROOT, absPath);
  if (!rel || rel === "") return ".";
  if (rel.startsWith("..") || path.isAbsolute(rel)) return normalizePath(absPath);
  return normalizePath(rel);
}

function log(message) {
  console.log(`[dash:watch] ${message}`);
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.startsWith("[dash:watch]") ? msg : `[dash:watch] ${msg}`);
  process.exit(1);
}
