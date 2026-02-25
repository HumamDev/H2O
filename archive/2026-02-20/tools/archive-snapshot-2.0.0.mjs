import fs from "node:fs";
import path from "node:path";
// @version 2.0.0

const SRC = process.argv[2]; // workspaceFolder (h2o-source)
if (!SRC) throw new Error("Missing SRC arg");
const FORCE_ALL =
  process.argv.includes("--all") ||
  String(process.env.H2O_ARCHIVE_ALL || "") === "1";

const ARCHIVE_ROOT = path.join(SRC, "archive");
const STATE_DIR = path.join(ARCHIVE_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "lastVersions.json");
const PIPELINE_TRACKED_FILES = [
  "tools/archive-snapshot.mjs",
  "tools/make-aliases.mjs",
  "tools/make-dev-loader.mjs",
  "tools/make-dev-all.mjs",
  "tools/sync-dev-order.mjs",
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
  // Tampermonkey/script marker:
  //   // @version x.y.z
  const lineVer = txt.match(/^\s*\/\/\s*@version\s+([^\s]+)\s*$/m);
  if (lineVer) return String(lineVer[1]).trim();

  // Block-comment marker:
  //   * @version x.y.z
  const blockVer = txt.match(/^\s*\*\s*@version\s+([^\s*]+)\s*$/m);
  if (blockVer) return String(blockVer[1]).trim();

  // JSON style:
  //   "version": "x.y.z"
  const jsonStrVer = txt.match(/"version"\s*:\s*"([^"]+)"/);
  if (jsonStrVer) return String(jsonStrVer[1]).trim();

  // JSON numeric style:
  //   "version": 2.0
  const jsonNumVer = txt.match(/"version"\s*:\s*([0-9]+(?:\.[0-9]+)*)/);
  if (jsonNumVer) return String(jsonNumVer[1]).trim();

  return null;
}

function readVersionFromFile(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  return readVersionFromText(txt);
}

function withVersionInName(filename, version) {
  // ✅ Desired:
  // "X.user.js" -> "X-<ver>.user.js"
  // Fallback:
  // "X.js" -> "X-<ver>.js"

  const USER_SUFFIX = ".user.js";

  if (filename.endsWith(USER_SUFFIX)) {
    const stem = filename.slice(0, -USER_SUFFIX.length); // remove ".user.js"
    return `${stem}-${version}${USER_SUFFIX}`;
  }

  const ext = path.extname(filename);            // ".js"
  const base = filename.slice(0, -ext.length);   // "X"
  return `${base}-${version}${ext}`;
}

function collectTopLevelScripts(srcDir) {
  const out = [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name === ".DS_Store") continue;
    if (e.name.startsWith(".")) continue; // ignore hidden
    if (!/\.(js|mjs)$/i.test(e.name)) continue;
    if (e.name === "tasks.json") continue;
    out.push(e.name);
  }

  return out;
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

const state = safeReadJSON(STATE_FILE, {});
const todayDir = path.join(ARCHIVE_ROOT, dayStamp());
fs.mkdirSync(todayDir, { recursive: true });

const trackedRelPaths = uniqueSorted([
  ...collectTopLevelScripts(SRC),
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

  // Archive when version marker changes.
  const ver = readVersionFromFile(fp);
  if (!ver) {
    skippedNoVersion.push(relPath);
    continue;
  }

  const key = relPath; // track by relative file path
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
