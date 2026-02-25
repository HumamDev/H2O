// tools/common/make-aliases.mjs
// @version 1.0.0
//
// Writes ONLY the ON scripts (as alias filenames) into SERVER/alias.
// Mode can be copy (default) or symlink (recommended for instant dev refresh).
// Master dev-order recommended: config/dev-order.tsv
//
// Supported order formats (read-only compatibility):
// - .tsv : STATUS<TAB>ALIAS (STATUS = ON/OFF; also ✅/❌, 🟢/🔴, 🟩/🟥)
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

const ALIAS_MODE = String(process.env.H2O_ALIAS_MODE || "copy").toLowerCase() === "symlink"
  ? "symlink"
  : "copy";
const IS_ICLOUD_SERVER = /Mobile Documents\/com~apple~CloudDocs/.test(SERVER);

const ALIAS_DIR = path.join(SERVER, "alias");
fs.mkdirSync(ALIAS_DIR, { recursive: true });

/* -----------------------------
   Alias rules (must match sync-dev-order)
------------------------------ */

function stripEmojiAndInvisibles(s) {
  return String(s || "")
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
  return `${id}._${title}_.user.js`;
}

// iCloud/desktop sync can spawn conflict clones like:
//   "0B1b._Data_Sync_.user 2.js"
// Keep canonical ".user.js" and prune numbered conflict clones when canonical exists.
function pruneConflictCloneAliases(dir) {
  let removed = 0;
  const names = fs.readdirSync(dir);
  const set = new Set(names);

  for (const name of names) {
    if (!/\.user \d+\.js$/i.test(name)) continue;

    const fp = path.join(dir, name);
    let st = null;
    try { st = fs.lstatSync(fp); } catch { st = null; }
    if (!st || !(st.isFile() || st.isSymbolicLink())) continue;

    const canonical = name.replace(/\.user \d+\.js$/i, ".user.js");
    if (!set.has(canonical)) continue;

    try {
      fs.unlinkSync(fp);
      removed++;
    } catch {}
  }

  return removed;
}

/* -----------------------------
   Read ON set
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
    if (!file || !/\.user\.js$/i.test(file)) continue;

    if (status === true) on.add(file);
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
    if (!name || !/\.user\.js$/i.test(name)) continue;

    if (!isOff) on.add(name);
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
      if (enabled && file) on.add(file);
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

// 1) Read ON list from dev-order (alias-only)
const ON = readOnSet(ORDER_FILE);

/* -----------------------------
   Build aliases (ON-only)
------------------------------ */

// 2) Clean alias folder (prevents ghost files)
for (const entry of fs.readdirSync(ALIAS_DIR, { withFileTypes: true })) {
  if (!(entry.isFile() || entry.isSymbolicLink())) continue;
  if (entry.name === ".DS_Store") continue;
  if (!/\.js$/i.test(entry.name)) continue;
  fs.unlinkSync(path.join(ALIAS_DIR, entry.name));
}

// 3) Write ONLY ON scripts from SOURCE root
let copied = 0;
let linked = 0;
let linkFallbackToCopy = 0;
let skippedOff = 0;
let skippedNotListed = 0;

for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".DS_Store") continue;
  if (!/\.user\.js$/i.test(entry.name)) continue;

  const aliasName = toAliasName(entry.name);
  if (!aliasName) continue;

  if (ON.size > 0 && !ON.has(aliasName)) {
    // Not ON → skip
    skippedOff++;
    continue;
  }

  const src = path.join(SRC, entry.name);
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

if (ON.size === 0) {
  // Helpful hint: if order file missing or empty, you likely forgot to Sync first.
  skippedNotListed = 0;
}

console.log("[H2O] aliases (ON-only) ready:", ALIAS_DIR);
console.log("[H2O] alias mode:", ALIAS_MODE);
if (ALIAS_MODE === "symlink" && IS_ICLOUD_SERVER) {
  console.warn("[H2O] warning: iCloud + symlink mode can recreate duplicate '* 2.js' alias clones.");
  console.warn("[H2O] warning: for max stability, move H2O_SERVER_DIR outside iCloud or use H2O_ALIAS_MODE=copy.");
}
console.log("[H2O] order:", ORDER_FILE);
console.log("[H2O] ON entries:", ON.size);
console.log("[H2O] linked:", linked);
console.log("[H2O] copied:", copied);
console.log("[H2O] symlink fallback->copy:", linkFallbackToCopy);
console.log("[H2O] pruned conflict clones:", prunedConflictClones);
console.log("[H2O] skipped (OFF/not listed):", skippedOff);
