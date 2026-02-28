#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

const USERSCRIPT_PATH_RE = /^scripts\/.+\.user\.js$/i;
const USER_FILE_RE = /\.user\.js$/i;
const VERSION_RE = /^\s*\/\/\s*@version\s+([^\s]+)\s*$/im;
const ID_RE = /^\s*\/\/\s*@h2o-id\s+(.+?)\s*$/im;
const REV_RE = /^\s*\/\/\s*@rev\s+(\d+)\s*$/im;

const ARCHIVE_ROOT = path.join(REPO_ROOT, "archive");
const STATE_DIR = path.join(ARCHIVE_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "lastVersions.json");
const LEDGER_V2 = path.join(REPO_ROOT, "meta", "ledger", "edits.v2.csv");
const LEDGER_V1 = path.join(REPO_ROOT, "meta", "ledger", "edits.csv");

try {
  await main();
} catch (err) {
  fatal(err);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const relPath = await resolveTargetRelPath(args);
  const meta = readUserscriptMeta(relPath);
  if (!meta.version) {
    throw new Error(`[archive:one] Missing @version in ${relPath}`);
  }

  const outRel = archiveOne(relPath, meta.version, meta.rev);
  const shownId = meta.id || args.recentScriptId || "unknown";
  console.log(`[archive:one] archived ${relPath} (id=${shownId}) -> ${outRel}`);
}

function parseArgs(argv) {
  const out = {
    file: "",
    id: "",
    pick: false,
    recent: false,
    recentScriptId: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--pick") {
      out.pick = true;
      continue;
    }
    if (arg === "--recent") {
      out.recent = true;
      continue;
    }
    if (arg === "--file") {
      const next = argv[i + 1];
      if (!next) throw new Error("[archive:one] Missing value after --file.");
      out.file = normalizePath(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      out.file = normalizePath(arg.slice("--file=".length));
      continue;
    }
    if (arg === "--id") {
      const next = argv[i + 1];
      if (!next) throw new Error("[archive:one] Missing value after --id.");
      out.id = String(next).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--id=")) {
      out.id = String(arg.slice("--id=".length)).trim();
      continue;
    }
    throw new Error(`[archive:one] Unknown argument: ${arg}`);
  }

  const selectedCount = Number(Boolean(out.file)) + Number(Boolean(out.id)) + Number(out.pick) + Number(out.recent);
  if (selectedCount !== 1) {
    throw new Error("[archive:one] Choose exactly one selector: --file, --id, --pick, or --recent.");
  }
  return out;
}

function printHelp() {
  console.log("Usage: node tools/archive-one.mjs (--file <scripts/...user.js> | --id <scriptId> | --pick | --recent)");
}

async function resolveTargetRelPath(args) {
  if (args.file) {
    assertUserscriptPath(args.file);
    assertFileExists(args.file);
    return args.file;
  }
  if (args.id) {
    const all = listUserscriptsWithMeta();
    const matches = all.filter((item) => item.id === args.id);
    if (!matches.length) throw new Error(`[archive:one] No userscript found for id=${args.id}`);
    if (matches.length > 1) throw new Error(`[archive:one] Multiple userscripts found for id=${args.id}`);
    return matches[0].relPath;
  }
  if (args.pick) {
    return await pickUserscriptPath();
  }
  if (args.recent) {
    const recent = readRecentEditRelPath();
    args.recentScriptId = recent.scriptId;
    return recent.relPath;
  }
  throw new Error("[archive:one] No selector provided.");
}

function listUserscriptsWithMeta() {
  const scriptsDir = path.join(REPO_ROOT, "scripts");
  if (!fs.existsSync(scriptsDir) || !fs.statSync(scriptsDir).isDirectory()) {
    return [];
  }
  const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile() || !USER_FILE_RE.test(entry.name)) continue;
    const relPath = normalizePath(path.join("scripts", entry.name));
    const meta = readUserscriptMeta(relPath);
    out.push({
      relPath,
      id: meta.id,
      version: meta.version,
    });
  }
  out.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { numeric: true }));
  return out;
}

async function pickUserscriptPath() {
  const all = listUserscriptsWithMeta();
  if (!all.length) throw new Error("[archive:one] No scripts/*.user.js found.");

  for (let i = 0; i < all.length; i += 1) {
    const item = all[i];
    console.log(`${i + 1}) ${item.relPath} | id=${item.id || "<none>"} | version=${item.version || "<missing>"}`);
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question("Pick script number: ");
    const idx = Number.parseInt(String(answer || "").trim(), 10);
    if (!Number.isInteger(idx) || idx < 1 || idx > all.length) {
      throw new Error("[archive:one] Invalid selection.");
    }
    return all[idx - 1].relPath;
  } finally {
    rl.close();
  }
}

function readRecentEditRelPath() {
  const ledger = resolveLedgerPath();
  if (!ledger) {
    throw new Error("[archive:one] No edit ledger found. Run rev:save at least once.");
  }

  const text = String(fs.readFileSync(ledger, "utf8") || "").replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new Error("[archive:one] Edit ledger is empty. Run rev:save at least once.");
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    throw new Error("[archive:one] Edit ledger has no EDIT rows.");
  }

  const header = rows[0];
  const idxKind = header.indexOf("kind");
  const idxTs = header.indexOf("ts");
  const idxRelPath = header.indexOf("rel_path");
  const idxScriptId = header.indexOf("script_id");
  if (idxKind < 0 || idxTs < 0 || idxRelPath < 0) {
    throw new Error(`[archive:one] Ledger header missing required columns in ${displayPath(ledger)}.`);
  }

  const edits = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const kind = String(row[idxKind] || "").trim().toUpperCase();
    if (kind !== "EDIT") continue;
    const relPath = normalizePath(String(row[idxRelPath] || ""));
    if (!relPath) continue;
    edits.push({
      relPath,
      ts: String(row[idxTs] || "").trim(),
      scriptId: idxScriptId >= 0 ? String(row[idxScriptId] || "").trim() : "",
      order: i,
    });
  }

  if (!edits.length) {
    throw new Error("[archive:one] Edit ledger has no EDIT rows.");
  }

  const parseable = edits
    .map((e) => ({ ...e, tsNum: Date.parse(e.ts) }))
    .filter((e) => Number.isFinite(e.tsNum));

  let picked = null;
  if (parseable.length) {
    picked = parseable.sort((a, b) => (b.tsNum !== a.tsNum ? b.tsNum - a.tsNum : b.order - a.order))[0];
  } else {
    picked = edits[edits.length - 1];
  }

  assertUserscriptPath(picked.relPath);
  assertFileExists(picked.relPath);
  return {
    relPath: picked.relPath,
    scriptId: picked.scriptId,
  };
}

function resolveLedgerPath() {
  if (fs.existsSync(LEDGER_V2)) return LEDGER_V2;
  if (fs.existsSync(LEDGER_V1)) return LEDGER_V1;
  return "";
}

function archiveOne(relPath, version, rev) {
  const day = dayStamp();
  const srcPath = path.join(REPO_ROOT, relPath);
  const outDir = path.join(ARCHIVE_ROOT, day, "scripts");
  const outName = chooseArchiveName(outDir, path.basename(relPath), version, rev);
  const outPath = path.join(outDir, outName);
  const outRel = normalizePath(path.relative(REPO_ROOT, outPath));

  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(srcPath, outPath);

  fs.mkdirSync(STATE_DIR, { recursive: true });
  const state = safeReadJson(STATE_FILE, {});
  state[relPath] = version;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  return outRel;
}

function readUserscriptMeta(relPath) {
  assertUserscriptPath(relPath);
  const abs = path.join(REPO_ROOT, relPath);
  assertFileExists(relPath);
  const text = String(fs.readFileSync(abs, "utf8") || "");
  const idMatch = text.match(ID_RE);
  const versionMatch = text.match(VERSION_RE);
  const revMatch = text.match(REV_RE);
  return {
    id: idMatch ? String(idMatch[1] || "").trim() : "",
    version: versionMatch ? String(versionMatch[1] || "").trim() : "",
    rev: revMatch ? String(revMatch[1] || "").trim() : "",
  };
}

function chooseArchiveName(outDir, fileName, version, rev) {
  const baseName = withVersionInName(fileName, version);
  const primaryPath = path.join(outDir, baseName);
  if (!fs.existsSync(primaryPath)) return baseName;

  const suffix = baseName.endsWith(".user.js") ? ".user.js" : (path.extname(baseName) || ".js");
  const stem = baseName.endsWith(suffix) ? baseName.slice(0, -suffix.length) : baseName;
  const normalizedRev = String(rev || "").trim().replace(/[^\d]/g, "");

  if (normalizedRev) {
    const revName = `${stem}-r${normalizedRev}${suffix}`;
    const revPath = path.join(outDir, revName);
    if (!fs.existsSync(revPath)) return revName;
    return makeIncrementedName(outDir, `${stem}-r${normalizedRev}`, suffix);
  }

  return makeIncrementedName(outDir, stem, suffix);
}

function makeIncrementedName(outDir, stem, suffix) {
  let n = 2;
  while (true) {
    const candidate = `${stem}-${n}${suffix}`;
    if (!fs.existsSync(path.join(outDir, candidate))) return candidate;
    n += 1;
  }
}

function assertUserscriptPath(relPath) {
  if (!USERSCRIPT_PATH_RE.test(relPath)) {
    throw new Error(`[archive:one] Refusing non-userscript path: ${relPath}`);
  }
}

function assertFileExists(relPath) {
  const abs = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`[archive:one] File not found: ${relPath}`);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      pushField();
      continue;
    }
    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }
    if (ch === "\r") {
      if (text[i + 1] === "\n") continue;
      pushField();
      pushRow();
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function withVersionInName(filename, version) {
  const suffix = ".user.js";
  if (filename.endsWith(suffix)) {
    const stem = filename.slice(0, -suffix.length);
    return `${stem}-${version}${suffix}`;
  }
  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  return `${base}-${version}${ext}`;
}

function safeReadJson(filePath, fallback) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
    return fallback;
  } catch {
    return fallback;
  }
}

function dayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function displayPath(filePath) {
  return normalizePath(path.relative(REPO_ROOT, filePath));
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.startsWith("[archive:one]") ? msg : `[archive:one] ${msg}`);
  process.exit(1);
}
