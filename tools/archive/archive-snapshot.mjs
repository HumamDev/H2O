import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
// @version 1.4.0  (Phase 8I-FINAL: REFUSED_ARCHIVE_PREFIXES hard-guard layer)

// Phase 8I-2 (2026-05-19): archive root comes from the central registry
// (tools/paths.mjs). paths.mjs throws if the resolved path lands inside
// REPO_ROOT; the belt-and-suspenders check below guards against the case
// where SRC argv differs from REPO_ROOT (e.g. sibling worktree).
//
// Phase 8I-3 (2026-05-19): the source-roots include list, exclusion sets,
// and exclusion patterns moved into tools/archive/source-roots.mjs as a
// pure-data configuration module. This file consumes the descriptors and
// dispatches to the appropriate collection helper. Behavior is byte-
// equivalent to the pre-8I-3 inlined logic — the same set of files is
// archived, with the same markers, into the same destination.
import { ARCHIVE_DIR, RUNTIME_BASE_REL, SURFACES_BASE_REL } from "../paths.mjs";
import {
  ADDITIONAL_TRACKED_FILES,
  EXCLUDED_ARCHIVE_NAMES,
  EXCLUDED_ARCHIVE_DIRS,
  EXCLUDED_ARCHIVE_PATTERNS,
  REFUSED_ARCHIVE_PREFIXES,
  TOOLS_REL,
  SOURCE_ROOTS,
} from "./source-roots.mjs";
// Note: SURFACES_REL is consumed internally by source-roots.mjs in the
// SOURCE_ROOTS descriptor; archive-snapshot.mjs doesn't reference it
// directly so it's not imported here.

const SRC = process.argv[2]; // workspaceFolder (the repo root / source tree)
if (!SRC) throw new Error("Missing SRC arg");
const FORCE_ALL =
  process.argv.includes("--all") ||
  String(process.env.H2O_ARCHIVE_ALL || "") === "1";
// Run once after filename/path renames to migrate lastVersions keys safely.
const MIGRATE_PATHS = process.argv.includes("--migrate-paths");

const ARCHIVE_ROOT = ARCHIVE_DIR;
{
  // Belt-and-suspenders: refuse if the archive root lands inside the source
  // tree even when paths.mjs's REPO_ROOT-based check would have allowed it
  // (e.g. when SRC is a sibling worktree or a fresh-clone path).
  const archiveAbs = path.resolve(ARCHIVE_ROOT);
  const srcAbs = path.resolve(SRC);
  const rel = path.relative(srcAbs, archiveAbs);
  const isInside = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (isInside) {
    throw new Error(
      "[archive-snapshot] Refusing to write archive inside source tree.\n" +
      `  ARCHIVE_ROOT = ${archiveAbs}\n` +
      `  SRC          = ${srcAbs}\n` +
      "  Set H2O_ARCHIVE_DIR to a path OUTSIDE the source tree."
    );
  }
}
const STATE_DIR = path.join(ARCHIVE_ROOT, ".state");
const STATE_FILE = path.join(STATE_DIR, "lastVersions.json");

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
  // Phase 8K-4: RUNTIME_BASE_REL replaces the hardcoded "scripts" literal.
  const scriptsDir = path.join(srcRoot, RUNTIME_BASE_REL);
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
      if (EXCLUDED_ARCHIVE_PATTERNS.some((p) => p.test(entry.name))) continue;

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
  // Phase 8K-4: RUNTIME_BASE_REL replaces the hardcoded "scripts" literal.
  const scriptsDir = path.join(srcRoot, RUNTIME_BASE_REL);
  try {
    if (!fs.existsSync(scriptsDir) || !fs.statSync(scriptsDir).isDirectory()) return;
  } catch {
    return;
  }
  if (Array.isArray(relPaths) && relPaths.length > 0) return;
  throw new Error(`[H2O] archive snapshot found ${RUNTIME_BASE_REL}/ but discovered 0 archiveable source scripts`);
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

  // Phase 8L-5: rewrite "surfaces/<rest>" → "<SURFACES_BASE_REL>/<rest>" when
  // the legacy `surfaces/` prefix lingers in state and the new
  // `src-surfaces-base/` path exists on disk (and the old one doesn't). Only
  // applies when SURFACES_BASE_REL is something other than "surfaces" (i.e.
  // post-rename). Steady-state runs without --migrate-paths are unaffected.
  const SURFACES_LEGACY_PREFIX = "surfaces/";
  const SURFACES_NEW_PREFIX = `${SURFACES_BASE_REL}/`;
  const surfacesRewriteActive =
    SURFACES_NEW_PREFIX !== SURFACES_LEGACY_PREFIX;
  let surfacesMoved = 0;
  let surfacesSkippedOldStillExists = 0;
  let surfacesSkippedNoDest = 0;
  let surfacesSkippedDestInState = 0;

  for (const [rawKey, value] of Object.entries(stateObj)) {
    const key = normalizePathKey(rawKey);
    let outKey = key;

    if (surfacesRewriteActive && key.startsWith(SURFACES_LEGACY_PREFIX)) {
      const rewritten = SURFACES_NEW_PREFIX + key.slice(SURFACES_LEGACY_PREFIX.length);
      const oldPath = path.join(srcRoot, key);
      const newPath = path.join(srcRoot, rewritten);
      const oldExists = fs.existsSync(oldPath);
      const newExists = fs.existsSync(newPath);
      if (!newExists) {
        surfacesSkippedNoDest++;
      } else if (oldExists) {
        surfacesSkippedOldStillExists++;
      } else if (srcKeySet.has(rewritten)) {
        surfacesSkippedDestInState++;
      } else {
        outKey = rewritten;
        surfacesMoved++;
      }
    }

    if (/\.user\.js$/i.test(key)) {
      const oldPath = path.join(srcRoot, key);
      const oldExists = fs.existsSync(oldPath);
      // Phase 8K-4: RUNTIME_BASE_REL replaces the hardcoded "scripts" literal
      // in the state-file key normalization. Post-8K-5 it resolves to
      // "src-runtime-base/"; `--migrate-paths` (operator-invoked) rewrites
      // old "scripts/..." state keys to the new prefix on the next run.
      const isRootUserScriptKey = !key.startsWith(`${RUNTIME_BASE_REL}/`) && !key.includes("/");

      let destKey = null;

      if (isRootUserScriptKey) {
        const prefixed = `${RUNTIME_BASE_REL}/${key}`;
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

  const totalMoved = moved + surfacesMoved;
  if (totalMoved > 0) {
    const backupPath = `${STATE_FILE}.bak`;
    if (fs.existsSync(STATE_FILE)) {
      fs.copyFileSync(STATE_FILE, backupPath);
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
    console.log(`[H2O] migrated state paths (--migrate-paths): ${totalMoved} (userscripts=${moved}, surfaces=${surfacesMoved})`);
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
  if (surfacesSkippedDestInState) console.log(`[H2O] migrate skipped surfaces (dest key already exists): ${surfacesSkippedDestInState}`);
  if (surfacesSkippedNoDest) console.log(`[H2O] migrate skipped surfaces (dest file missing): ${surfacesSkippedNoDest}`);
  if (surfacesSkippedOldStillExists) console.log(`[H2O] migrate skipped surfaces (old file still exists): ${surfacesSkippedOldStillExists}`);

  return totalMoved > 0 ? next : stateObj;
}

const state = maybeMigrateStatePaths(safeReadJSON(STATE_FILE, {}), SRC);
const todayDir = path.join(ARCHIVE_ROOT, dayStamp());
fs.mkdirSync(todayDir, { recursive: true });

// Phase 8I-3: collect candidate files by dispatching each SOURCE_ROOTS
// descriptor to the appropriate helper. The set produced here must be
// byte-equivalent to the pre-8I-3 inline collection of [userscripts,
// surfaces/studio top-level, tools recursive, ADDITIONAL_TRACKED_FILES].
function collectFromDescriptor(srcRoot, descriptor) {
  switch (descriptor.kind) {
    case "userscripts":
      return collectUserScripts(srcRoot);
    case "top-level":
      return collectTopLevelFiles(srcRoot, descriptor.root);
    case "recursive":
      return collectRecursiveFiles(srcRoot, descriptor.root);
    case "explicit":
      return descriptor.files;
    default:
      throw new Error(`[archive-snapshot] Unknown source-root kind: ${descriptor.kind}`);
  }
}

const collectedFiles = [];
let trackedUserScripts = [];
for (const descriptor of SOURCE_ROOTS) {
  const files = collectFromDescriptor(SRC, descriptor);
  collectedFiles.push(...files);
  if (descriptor.kind === "userscripts") trackedUserScripts = files;
}
assertScriptArchiveCoverage(SRC, trackedUserScripts);

// Phase 8I-FINAL: hard-refuse path-prefix guard. After source-root
// collection but before the archive loop, filter out any candidate
// whose relative path starts with a refused prefix (apps/extensions/,
// archive/, meta/, changelogs/, s-files/, operator-notes/, references/,
// plans/, tmp/, cache/, artifacts/). This is a belt-and-suspenders
// layer on top of EXCLUDED_ARCHIVE_DIRS — it catches the case where a
// future SOURCE_ROOTS descriptor accidentally points at one of those
// prefixes (which the basename-match exclusion lists wouldn't catch
// because the prefix itself is multi-segment). If anything is refused
// here it indicates a misconfigured descriptor — warn loudly so the
// operator notices.
function isRefusedPath(relPath) {
  const key = String(relPath).replace(/\\/g, "/");
  for (const prefix of REFUSED_ARCHIVE_PREFIXES) {
    const prefixNoSlash = prefix.replace(/\/$/, "");
    if (key === prefixNoSlash || key.startsWith(prefix)) return true;
  }
  return false;
}

const allCandidates = uniqueSorted(collectedFiles);
const refusedPaths = allCandidates.filter(isRefusedPath);
if (refusedPaths.length > 0) {
  console.warn(`[H2O] REFUSED ${refusedPaths.length} path(s) via REFUSED_ARCHIVE_PREFIXES guard (misconfigured descriptor?):`);
  for (const p of refusedPaths) console.warn(`  - ${p}`);
}
const trackedRelPaths = allCandidates.filter((p) => !isRefusedPath(p));

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
