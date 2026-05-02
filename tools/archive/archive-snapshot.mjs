import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
// @version 1.0.2

const SRC = process.argv[2]; // workspaceFolder (h2o-source)
if (!SRC) throw new Error("Missing SRC arg");
const FORCE_ALL =
  process.argv.includes("--all") ||
  String(process.env.H2O_ARCHIVE_ALL || "") === "1";
// Run once after filename/path renames to migrate lastVersions keys safely.
const MIGRATE_PATHS = process.argv.includes("--migrate-paths");

const ARCHIVE_ROOT = path.join(SRC, "archive");
const STATE_DIR = path.join(ARCHIVE_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "lastVersions.json");
const ADDITIONAL_TRACKED_FILES = [
  "surfaces/studio/studio.css",
  "surfaces/studio/studio.html",
  "surfaces/studio/studio.js",

  "surfaces/desk/desk.css",
  "surfaces/desk/desk.html",
  "surfaces/desk/desk.js",
  "surfaces/desk/page-bridge.js",

  ".vscode/tasks.json",
];
const TOOLS_REL = "tools";
const EXCLUDED_ARCHIVE_NAMES = new Set([
  ".DS_Store",
]);
const EXCLUDED_ARCHIVE_DIRS = new Set([
  ".git",
  "artifacts",
  "build",
  "cache",
  "node_modules",
  "tmp",
]);
const STUDIO_SURFACES_REL = path.join("surfaces", "studio");

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

function readArchiveMarkerFromFile(fp, relPath) {
  const txt = fs.readFileSync(fp, "utf8");
  const version = readVersionFromText(txt);
  if (version) return { marker: version, reason: "version change" };
  if (!isToolsRelPath(relPath)) return null;
  const digest = crypto.createHash("sha256").update(txt).digest("hex").slice(0, 12);
  return { marker: `sha256-${digest}`, reason: "content hash change" };
}

function toAliasName(filename) {
  const base = String(filename || "").replace(/(\.user)?\.js$/i, "");
  const firstDot = base.indexOf(".");
  if (firstDot <= 0) return null;

  const id = base.slice(0, firstDot).trim();
  let title = base.slice(firstDot + 1);

  title = stripEmojiAndInvisibles(title)
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!id || !title) return null;
  return `${id}._${title}_.js`;
}

function isSourceScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return false;
  return toAliasName(name) !== null;
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
    return entries.some((e) => e.isFile() && isSourceScriptName(e.name)) ? scriptsDir : srcRoot;
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
    if (!isSourceScriptName(e.name)) continue;
    out.push(relPrefix && relPrefix !== "." ? path.join(relPrefix, e.name) : e.name);
  }

  return out;
}

function collectTopLevelFiles(srcRoot, relDir) {
  const out = [];
  const absDir = path.join(srcRoot, relDir);
  try {
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return out;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      if (e.name === ".DS_Store") continue;
      if (e.name.startsWith(".")) continue;
      out.push(path.join(relDir, e.name));
    }
  } catch {}
  return out;
}

function collectRecursiveFiles(srcRoot, relDir) {
  const out = [];
  const absDir = path.join(srcRoot, relDir);

  function walk(abs, rel) {
    let entries = [];
    try {
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return;
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (EXCLUDED_ARCHIVE_NAMES.has(entry.name)) continue;
      if (entry.name.endsWith(".local.json") || /\.local\./i.test(entry.name)) continue;
      if (entry.name === ".env" || entry.name.startsWith(".env.")) continue;

      const childRel = path.join(rel, entry.name);
      const childAbs = path.join(abs, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (EXCLUDED_ARCHIVE_DIRS.has(entry.name)) continue;
        walk(childAbs, childRel);
        continue;
      }
      if (entry.isFile()) out.push(childRel);
    }
  }

  walk(absDir, relDir);
  return out;
}

function assertScriptArchiveCoverage(srcRoot, relPaths) {
  const scriptsDir = path.join(srcRoot, "scripts");
  try {
    if (!fs.existsSync(scriptsDir) || !fs.statSync(scriptsDir).isDirectory()) return;
  } catch {
    return;
  }
  if (Array.isArray(relPaths) && relPaths.length > 0) return;
  throw new Error("[H2O] archive snapshot found scripts/ but discovered 0 archiveable source scripts");
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function normalizePathKey(v) {
  return String(v || "").replace(/\\/g, "/");
}

function isToolsRelPath(relPath) {
  const key = normalizePathKey(relPath);
  return key === TOOLS_REL || key.startsWith(`${TOOLS_REL}/`);
}

function stripEmojiAndInvisibles(s) {
  return String(s || "")
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D\u200B-\u200F\uFEFF\u2060\u00AD]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}

function normalizeUserScriptTitleFromPath(relPath) {
  const key = normalizePathKey(relPath);
  if (!/(\.user)?\.js$/i.test(key)) return "";

  const base = path.basename(key).replace(/(\.user)?\.js$/i, "");
  const firstDot = base.indexOf(".");
  const title = firstDot >= 0 ? base.slice(firstDot + 1) : base;

  return stripEmojiAndInvisibles(title)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildCurrentUserScriptLookup(srcRoot) {
  const currentUserScripts = collectUserScripts(srcRoot)
    .map((p) => normalizePathKey(p))
    .filter((p) => isSourceScriptName(path.basename(p)));

  const scriptSet = new Set(currentUserScripts);
  const byTitle = new Map();

  for (const relPath of currentUserScripts) {
    const titleKey = normalizeUserScriptTitleFromPath(relPath);
    if (!titleKey) continue;
    if (!byTitle.has(titleKey)) byTitle.set(titleKey, []);
    byTitle.get(titleKey).push(relPath);
  }

  return { scriptSet, byTitle };
}

function maybeMigrateStatePaths(stateObj, srcRoot) {
  if (!MIGRATE_PATHS) return stateObj;

  if (!stateObj || typeof stateObj !== "object" || Array.isArray(stateObj)) {
    return {};
  }

  const srcKeySet = new Set(Object.keys(stateObj).map((k) => normalizePathKey(k)));
  const { scriptSet, byTitle } = buildCurrentUserScriptLookup(srcRoot);
  const next = {};
  let moved = 0;
  let skippedDestInState = 0;
  let skippedNoDest = 0;
  let skippedOldStillExists = 0;
  let skippedAmbiguousUserScriptTitle = 0;

  for (const [rawKey, value] of Object.entries(stateObj)) {
    const key = normalizePathKey(rawKey);
    let outKey = key;

    if (/\.user\.js$/i.test(key)) {
      const oldPath = path.join(srcRoot, key);
      const oldExists = fs.existsSync(oldPath);
      const isRootUserScriptKey = !key.startsWith("scripts/") && !key.includes("/");

      let destKey = null;

      if (isRootUserScriptKey) {
        const prefixed = `scripts/${key}`;
        if (scriptSet.has(prefixed)) {
          destKey = prefixed;
        } else {
          skippedNoDest++;
        }
      }

      if (!destKey && !oldExists) {
        const titleKey = normalizeUserScriptTitleFromPath(key);
        const candidates = byTitle.get(titleKey) || [];
        if (candidates.length === 1) {
          destKey = candidates[0];
        } else if (candidates.length > 1) {
          skippedAmbiguousUserScriptTitle++;
        }
      }

      if (destKey && destKey !== key) {
        const destExists = scriptSet.has(destKey) || fs.existsSync(path.join(srcRoot, destKey));
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
  if (skippedAmbiguousUserScriptTitle) {
    console.log(`[H2O] migrate skipped (ambiguous userscript title): ${skippedAmbiguousUserScriptTitle}`);
  }

  return moved > 0 ? next : stateObj;
}

const state = maybeMigrateStatePaths(safeReadJSON(STATE_FILE, {}), SRC);
const todayDir = path.join(ARCHIVE_ROOT, dayStamp());
fs.mkdirSync(todayDir, { recursive: true });

const trackedUserScripts = collectUserScripts(SRC);
const trackedStudioSurfaceFiles = collectTopLevelFiles(SRC, STUDIO_SURFACES_REL);
const trackedToolFiles = collectRecursiveFiles(SRC, TOOLS_REL);
assertScriptArchiveCoverage(SRC, trackedUserScripts);

const trackedRelPaths = uniqueSorted([
  ...trackedUserScripts,
  ...trackedStudioSurfaceFiles,
  ...trackedToolFiles,
  ...ADDITIONAL_TRACKED_FILES,
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

  const marker = readArchiveMarkerFromFile(fp, relPath);
  if (!marker) {
    skippedNoVersion.push(relPath);
    continue;
  }

  const key = relPath;
  const last = state[key];

  if (FORCE_ALL || last !== marker.marker) {
    const relDir = path.dirname(relPath);
    const outName = withVersionInName(path.basename(relPath), marker.marker);
    const outDir = (relDir === ".") ? todayDir : path.join(todayDir, relDir);
    const outRel = (relDir === ".") ? outName : path.join(relDir, outName);
    const outPath = path.join(outDir, outName);

    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(fp, outPath);

    state[key] = marker.marker;
    archivedCount++;
    const reason = FORCE_ALL ? "full snapshot" : marker.reason;
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
