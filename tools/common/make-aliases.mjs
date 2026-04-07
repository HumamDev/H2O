// tools/common/make-aliases.mjs
// @version 1.0.0
//
// Writes scripts (as alias filenames) into SERVER/alias.
// Mode can be copy (default) or symlink (recommended for instant dev refresh).
// Master dev-order recommended: config/dev-order.tsv
//
// Supported order formats (read-only compatibility):
// - .tsv : STATUS<TAB>SOURCE_OR_ALIAS (STATUS = ON/OFF; also ✅/❌, 🟢/🔴, 🟩/🟥)
// - .txt : ON = normal line; OFF = starts with "- "
// - .json: { sections:[{items:[{file, enabled}]}] }

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const SRC_DEFAULT = path.resolve(TOOL_DIR, "..", "..");
const SERVER_DEFAULT = path.resolve(SRC_DEFAULT, "..", "h2o-dev-server");

const SERVER =
  process.env.H2O_SERVER_DIR ||
  SERVER_DEFAULT;

const SRC =
  process.env.H2O_SRC_DIR ||
  SRC_DEFAULT;

const ORDER_FILE =
  process.env.H2O_ORDER_FILE || path.join(SRC, "config", "dev-order.tsv");
const ALIAS_SCOPE = String(process.env.H2O_ALIAS_SCOPE || "all").trim().toLowerCase() === "on"
  ? "on"
  : "all";

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

const SCRIPT_SRC_DIR = pickUserScriptDir(SRC);

const IS_ICLOUD_SERVER = /Mobile Documents\/com~apple~CloudDocs/.test(SERVER);
const REQUESTED_ALIAS_MODE = String(process.env.H2O_ALIAS_MODE || "copy").toLowerCase() === "symlink"
  ? "symlink"
  : "copy";
const FORCE_COPY_FOR_ICLOUD =
  IS_ICLOUD_SERVER &&
  REQUESTED_ALIAS_MODE === "symlink" &&
  process.env.H2O_ALLOW_ICLOUD_SYMLINK !== "1";
const ALIAS_MODE = FORCE_COPY_FOR_ICLOUD ? "copy" : REQUESTED_ALIAS_MODE;

const ALIAS_DIR = path.join(SERVER, "alias");
fs.mkdirSync(ALIAS_DIR, { recursive: true });

/* -----------------------------
   Alias rules (must match sync-dev-order)
------------------------------ */

function stripEmojiAndInvisibles(s) {
  return String(s || "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "")
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D\u200B-\u200F\uFEFF\u2060\u00AD]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
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

function normalizeOrderEntryToAliasName(filename) {
  const raw = String(filename || "").trim();
  if (!raw) return "";
  return toAliasName(raw) || "";
}

function conflictCloneCanonicalName(filename) {
  const name = String(filename || "").trim();
  if (!name) return "";
  const match = name.match(/^(.*?)(?:\.user)? \d+\.js$/i);
  if (!match) return "";
  const canonical = `${match[1]}.js`;
  return toAliasName(canonical) ? canonical : "";
}

function isAliasArtifactName(filename) {
  return !!toAliasName(filename) || !!conflictCloneCanonicalName(filename);
}

// iCloud/desktop sync can spawn conflict clones like:
//   "0B1b._Data_Sync_.user 2.js"
// Keep canonical alias filenames and prune numbered conflict clones when a canonical alias exists.
function pruneConflictCloneAliases(dir) {
  let removed = 0;
  const names = fs.readdirSync(dir);
  const normalizedPresent = new Set(names.map((name) => toAliasName(name)).filter(Boolean));

  for (const name of names) {
    const canonical = conflictCloneCanonicalName(name);
    if (!canonical) continue;

    const fp = path.join(dir, name);
    let st = null;
    try { st = fs.lstatSync(fp); } catch { st = null; }
    if (!st || !(st.isFile() || st.isSymbolicLink())) continue;

    const normalizedCanonical = toAliasName(canonical);
    if (!normalizedCanonical || !normalizedPresent.has(normalizedCanonical)) continue;

    try {
      fs.unlinkSync(fp);
      removed++;
    } catch {}
  }

  return removed;
}

/* -----------------------------
   Optional ON filter
------------------------------ */

function parseBoolStatus(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  // Emoji toggles (nice for TSV editing)
  if (raw === "✅" || raw === "🟢" || raw === "🟩") return true;
  if (raw === "❌" || raw === "🔴" || raw === "🟥") return false;

  const v = raw.toLowerCase();
  if (v === "on" || v === "1" || v === "true" || v === "yes") return true;
  if (v === "off" || v === "0" || v === "false" || v === "no") return false;

  return null;
}

function readOnSetFromTSV(txt) {
  const on = new Set();
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    const noInline = line.replace(/\s+#.*$/, "").trim();
    if (!noInline) continue;

    const parts = noInline.split("\t");
    if (parts.length < 2) continue;

    const status = parseBoolStatus(parts[0]);
    const file = parts.slice(1).join("\t").trim();
    if (!file || !/(\.user)?\.js$/i.test(file)) continue;
    const alias = normalizeOrderEntryToAliasName(file);
    if (!alias) continue;

    if (status === true) on.add(alias);
  }
  return on;
}

function readOnSetFromTXT(txt) {
  const on = new Set();
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    // OFF marker is "- " (dash + space). Also accept old "-" prefix.
    const isOff = line.startsWith("- ") || line.startsWith("-");
    const name = isOff ? line.replace(/^-\s*/, "").trim() : line;
    if (!name || !/(\.user)?\.js$/i.test(name)) continue;
    const alias = normalizeOrderEntryToAliasName(name);
    if (!alias) continue;

    if (!isOff) on.add(alias);
  }
  return on;
}

function readOnSetFromJSON(txt) {
  const on = new Set();
  let obj = null;
  try {
    obj = JSON.parse(txt);
  } catch {
    return on;
  }

  const sections = Array.isArray(obj?.sections) ? obj.sections : [];
  for (const sec of sections) {
    const items = Array.isArray(sec?.items) ? sec.items : [];
    for (const it of items) {
      const file = String(it?.file || "").trim();
      const enabled = !!it?.enabled;
      const alias = normalizeOrderEntryToAliasName(file);
      if (enabled && alias) on.add(alias);
    }
  }
  return on;
}

function readOnSet(orderFile) {
  if (!fs.existsSync(orderFile)) return new Set();

  const txt = fs.readFileSync(orderFile, "utf8");
  const isTSV = /\.tsv$/i.test(orderFile);
  const isJSON = /\.json$/i.test(orderFile);

  if (isJSON) return readOnSetFromJSON(txt);
  if (isTSV) return readOnSetFromTSV(txt);
  return readOnSetFromTXT(txt);
}

// 1) Optional ON list from dev-order (source or alias compatibility)
const ON = readOnSet(ORDER_FILE);

/* -----------------------------
   Build aliases
------------------------------ */

// 2) Clean alias folder (prevents ghost files)
let cleanedAliasArtifacts = 0;
let skippedAliasCleanup = 0;
for (const entry of fs.readdirSync(ALIAS_DIR, { withFileTypes: true })) {
  if (!(entry.isFile() || entry.isSymbolicLink())) continue;
  if (entry.name === ".DS_Store") continue;
  if (!isAliasArtifactName(entry.name)) continue;
  try {
    fs.unlinkSync(path.join(ALIAS_DIR, entry.name));
    cleanedAliasArtifacts++;
  } catch {
    skippedAliasCleanup++;
  }
}

// 3) Write aliases from source scripts dir (scripts/ preferred, root fallback)
let copied = 0;
let linked = 0;
let linkFallbackToCopy = 0;
let skippedOff = 0;
let skippedNotListed = 0;
const filterOn = ALIAS_SCOPE === "on" && ON.size > 0;

for (const entry of fs.readdirSync(SCRIPT_SRC_DIR, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".DS_Store") continue;
  if (!isSourceScriptName(entry.name)) continue;

  const aliasName = toAliasName(entry.name);
  if (!aliasName) continue;

  if (filterOn && !ON.has(aliasName)) {
    // Not ON when filtering → skip
    skippedOff++;
    continue;
  }

  const src = path.join(SCRIPT_SRC_DIR, entry.name);
  const dst = path.join(ALIAS_DIR, aliasName);

  if (ALIAS_MODE === "symlink") {
    const relSrc = path.relative(path.dirname(dst), src);
    try {
      fs.symlinkSync(relSrc, dst);
      linked++;
    } catch {
      // Fallback keeps build resilient on filesystems where symlink creation is blocked.
      fs.copyFileSync(src, dst);
      copied++;
      linkFallbackToCopy++;
    }
  } else {
    fs.copyFileSync(src, dst);
    copied++;
  }
}

const prunedConflictClones = pruneConflictCloneAliases(ALIAS_DIR);

if (!filterOn) {
  // Helpful hint: filter is disabled in all mode.
  skippedNotListed = 0;
}

console.log("[H2O] aliases ready:", ALIAS_DIR);
console.log("[H2O] alias mode:", ALIAS_MODE);
if (FORCE_COPY_FOR_ICLOUD) {
  console.warn("[H2O] warning: H2O_SERVER_DIR is inside iCloud Drive; forcing alias mode from symlink -> copy for stability.");
  console.warn("[H2O] warning: set H2O_ALLOW_ICLOUD_SYMLINK=1 only if you want to bypass this safeguard.");
}
console.log("[H2O] alias scope:", ALIAS_SCOPE);
if (REQUESTED_ALIAS_MODE === "symlink" && IS_ICLOUD_SERVER) {
  console.warn("[H2O] warning: iCloud + symlink mode can recreate duplicate '* 2.js' alias clones.");
  console.warn("[H2O] warning: for max stability, move H2O_SERVER_DIR outside iCloud or use H2O_ALIAS_MODE=copy.");
}
console.log("[H2O] order:", ORDER_FILE);
console.log("[H2O] scripts dir:", SCRIPT_SRC_DIR);
console.log("[H2O] ON entries:", ON.size);
console.log("[H2O] cleaned alias artifacts:", cleanedAliasArtifacts);
if (skippedAliasCleanup) console.warn("[H2O] skipped alias cleanup failures:", skippedAliasCleanup);
console.log("[H2O] linked:", linked);
console.log("[H2O] copied:", copied);
console.log("[H2O] symlink fallback->copy:", linkFallbackToCopy);
console.log("[H2O] pruned conflict clones:", prunedConflictClones);
console.log("[H2O] skipped (OFF/not listed, scope=on):", skippedOff);
