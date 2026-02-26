import fs from "node:fs";
import path from "node:path";
// @version 1.0.0

const SRC = process.argv[2]; // workspaceFolder (h2o-source)
if (!SRC) throw new Error("Missing SRC arg");
const FORCE_ALL =
  process.argv.includes("--all") ||
  String(process.env.H2O_ARCHIVE_ALL || "") === "1";
const MIGRATE_PATHS = process.argv.includes("--migrate-paths");

const ARCHIVE_ROOT = path.join(SRC, "archive");
const STATE_DIR = path.join(ARCHIVE_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "lastVersions.json");
const PIPELINE_TRACKED_FILES = [
  "tools/ops/archive-snapshot.mjs",
  "tools/common/make-aliases.mjs",
  "tools/common/sync-dev-order.mjs",
  "tools/ext/make-ext-proxy-pack.mjs",
  "tools/ext/make-chrome-live-extension.mjs",
  "tools/ext/make-chrome-ops-panel-extension.mjs",
  "tools/ext/write-extension-icons.mjs",
  ".vscode/tasks.json",
];

fs.mkdirSync(ARCHIVE_ROOT, { recursive: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

function dayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeReadJSON(fp, fallback) {
  try { return JSON.parse(fs.readFileSync(fp, "utf8")); } catch { return fallback; }
}

function readVersionFromText(txt) {
  const lineVer = txt.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m);
  if (lineVer) return String(lineVer[1]).trim();

  const blockVer = txt.match(/^\s*\*\s*@version\s+([^\s*]+)\s*$/m);
  if (blockVer) return String(blockVer[1]).trim();

  const jsonStrVer = txt.match(/"version"\s*:\s*"([^"]+)"/);
  if (jsonStrVer) return String(jsonStrVer[1]).trim();

  const jsonNumVer = txt.match(/"version"\s*:\s*([0-9]+(?:\.[0-9]+)*)/);
  if (jsonNumVer) return String(jsonNumVer[1]).trim();

  return null;
}

function readVersionFromFile(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  return readVersionFromText(txt);
}

function withVersionInName(filename, version) {
  const USER_SUFFIX = ".user.js";

  if (filename.endsWith(USER_SUFFIX)) {
    const stem = filename.slice(0, -USER_SUFFIX.length);
    return `${stem}-${version}${USER_SUFFIX}`;
  }

  const ext = path.extname(filename);
  const base = filename.slice(0, -ext.length);
  return `${base}-${version}${ext}`;
}

function pickUserScriptDir(srcRoot) {
  const scriptsDir = path.join(srcRoot, "scripts");
  try {
    if (!fs.existsSync(scriptsDir) || !fs.statSync(scriptsDir).isDirectory()) return srcRoot;
    const entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
    return entries.some((e) => e.isFile() && /\.user\.js$/i.test(e.name)) ? scriptsDir : srcRoot;
  } catch {
    return srcRoot;
  }
}

function collectUserScripts(srcDir) {
  const out = [];
  const userDir = pickUserScriptDir(srcDir);
  const relPrefix = path.relative(srcDir, userDir);
  const entries = fs.readdirSync(userDir, { withFileTypes: true });

  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name === ".DS_Store") continue;
    if (e.name.startsWith(".")) continue;
    if (!/\.user\.js$/i.test(e.name)) continue;
    out.push(relPrefix && relPrefix !== "." ? path.join(relPrefix, e.name) : e.name);
  }

  return out;
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function maybeMigrateStatePaths(stateObj, srcRoot) {
  if (!MIGRATE_PATHS) return stateObj;

  if (!stateObj || typeof stateObj !== "object" || Array.isArray(stateObj)) {
    return {};
  }

  const srcKeySet = new Set(Object.keys(stateObj));
  const next = {};
  let moved = 0;
  let skippedDestInState = 0;
  let skippedNoDest = 0;
  let skippedOldStillExists = 0;

  for (const [rawKey, value] of Object.entries(stateObj)) {
    const key = String(rawKey || "").replace(/\\/g, "/");
    let outKey = key;

    const isRootUserScriptKey =
      /\.user\.js$/i.test(key) &&
      !key.startsWith("scripts/") &&
      !key.includes("/");

    if (isRootUserScriptKey) {
      const destKey = `scripts/${key}`;
      const oldPath = path.join(srcRoot, key);
      const destPath = path.join(srcRoot, destKey);
      const oldExists = fs.existsSync(oldPath);
      const destExists = fs.existsSync(destPath);

      if (!destExists) {
        skippedNoDest++;
      } else if (oldExists) {
        skippedOldStillExists++;
      } else if (srcKeySet.has(destKey)) {
        skippedDestInState++;
      } else {
        outKey = destKey;
        moved++;
      }
    }

    next[outKey] = value;
  }

  if (moved > 0) {
    const backupPath = `${STATE_FILE}.bak`;
    if (fs.existsSync(STATE_FILE)) {
      fs.copyFileSync(STATE_FILE, backupPath);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
    console.log(`[H2O] migrated state paths (--migrate-paths): ${moved}`);
    console.log(`[H2O] backup: ${backupPath}`);
  } else {
    console.log(`[H2O] migrated state paths (--migrate-paths): 0`);
  }

  if (skippedDestInState) console.log(`[H2O] migrate skipped (dest key already exists): ${skippedDestInState}`);
  if (skippedNoDest) console.log(`[H2O] migrate skipped (dest file missing): ${skippedNoDest}`);
  if (skippedOldStillExists) console.log(`[H2O] migrate skipped (old file still exists): ${skippedOldStillExists}`);

  return moved > 0 ? next : stateObj;
}

const state = maybeMigrateStatePaths(safeReadJSON(STATE_FILE, {}), SRC);
const todayDir = path.join(ARCHIVE_ROOT, dayStamp());
fs.mkdirSync(todayDir, { recursive: true });

const trackedRelPaths = uniqueSorted([
  ...collectUserScripts(SRC),
  ...PIPELINE_TRACKED_FILES,
]);

let archivedCount = 0;
const skippedNoVersion = [];
const skippedMissing = [];

for (const relPathRaw of trackedRelPaths) {
  const relPath = String(relPathRaw).replace(/\\/g, "/");
  const fp = path.join(SRC, relPath);

  if (!fs.existsSync(fp)) {
    skippedMissing.push(relPath);
    continue;
  }

  let st;
  try { st = fs.statSync(fp); } catch { st = null; }
  if (!st?.isFile()) continue;

  const ver = readVersionFromFile(fp);
  if (!ver) {
    skippedNoVersion.push(relPath);
    continue;
  }

  const key = relPath;
  const last = state[key];

  if (FORCE_ALL || last !== ver) {
    const relDir = path.dirname(relPath);
    const outName = withVersionInName(path.basename(relPath), ver);
    const outDir = (relDir === ".") ? todayDir : path.join(todayDir, relDir);
    const outRel = (relDir === ".") ? outName : path.join(relDir, outName);
    const outPath = path.join(outDir, outName);

    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(fp, outPath);

    state[key] = ver;
    archivedCount++;
    const reason = FORCE_ALL ? "full snapshot" : "version change";
    console.log(`[H2O] archived (${reason}): ${relPath} -> ${outRel}`);
  }
}

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
if (skippedNoVersion.length) {
  console.log(`[H2O] skipped (no version marker): ${skippedNoVersion.length}`);
}
if (skippedMissing.length) {
  console.log(`[H2O] skipped (missing tracked file): ${skippedMissing.length}`);
}
if (FORCE_ALL) {
  console.log(`[H2O] mode: full snapshot (--all)`);
}
console.log(`[H2O] archive-on-version done. new archives: ${archivedCount}`);
