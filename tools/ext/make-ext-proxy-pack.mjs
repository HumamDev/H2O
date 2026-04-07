// tools/ext/make-ext-proxy-pack.mjs
// @version 1.0.0
//
// EXT-native proxy pack generator.
// Writes only the header pack consumed by tools/ext/build-chrome-live-extension.mjs
// and avoids generating TM loader/proxy artifacts.
//
// Uses an EXT-specific proxy-pack filename for clearer EXT workflow semantics.

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

const ORDER_FILE = process.env.H2O_ORDER_FILE || path.join(SRC, "config", "dev-order.tsv");
const DEPS_FILE = process.env.H2O_DEPS_FILE || path.join(SRC, "config", "loader-deps.json");
const DEV_DIR_NAME = process.env.H2O_DEV_DIR_NAME || "dev_output";
const DEV_ORIGIN = String(process.env.H2O_DEV_ORIGIN || "http://127.0.0.1:5500").replace(/\/$/, "");
const BUILD_TS = String(process.env.H2O_BUILD_TS || Date.now());

const ALIAS_DIR = path.join(SERVER, "alias");
const PROXY_DIR = path.join(SERVER, DEV_DIR_NAME, "proxy");
const OUT_FILE = path.join(PROXY_DIR, "_paste-pack.ext.txt");
const OUT_NAME = path.basename(OUT_FILE);

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeTextFileAtomic(fp, text) {
  const target = path.resolve(fp);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(temp, text, "utf8");
  fs.renameSync(temp, target);
}

function parseBoolStatus(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  if (["\u2705", "\u{1F7E2}", "\u{1F7E9}"].includes(raw)) return true;
  if (["\u274C", "\u{1F534}", "\u{1F7E5}"].includes(raw)) return false;

  const v = raw.toLowerCase();
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  return null;
}

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

function normalizeAliasId(aliasRaw) {
  const alias = toAliasName(aliasRaw);
  if (alias) return alias;
  const raw = String(aliasRaw || "").trim();
  return raw ? raw.replace(/\.user\.js$/i, ".js") : "";
}

function stripScriptFilenameSuffix(filenameRaw) {
  return String(filenameRaw || "").replace(/(\.user)?\.js$/i, "").trim();
}

function isSourceScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return false;
  return toAliasName(name) !== null;
}

function readOrderedAliasesFromTSV(txt) {
  const out = [];
  for (const rawLine of String(txt || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const noInline = line.replace(/\s+#.*$/, "").trim();
    if (!noInline) continue;
    const parts = noInline.split("\t");
    if (parts.length < 2) continue;
    const enabled = parseBoolStatus(parts[0]);
    const aliasFile = toAliasName(parts.slice(1).join("\t").trim());
    if (enabled !== true) continue;
    if (!aliasFile) continue;
    out.push(aliasFile);
  }
  return out;
}

function readOrderedAliasesFromTXT(txt) {
  const out = [];
  for (const rawLine of String(txt || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const isOff = line.startsWith("- ") || line.startsWith("-");
    if (isOff) continue;
    const aliasFile = toAliasName(line);
    if (!aliasFile) continue;
    out.push(aliasFile);
  }
  return out;
}

function readOrderedAliasesFromJSON(txt) {
  const out = [];
  let obj = null;
  try {
    obj = JSON.parse(txt);
  } catch {
    return out;
  }
  const sections = Array.isArray(obj?.sections) ? obj.sections : [];
  for (const sec of sections) {
    const items = Array.isArray(sec?.items) ? sec.items : [];
    for (const it of items) {
      const aliasFile = toAliasName(String(it?.file || "").trim());
      const enabled = !!it?.enabled;
      if (!enabled) continue;
      if (!aliasFile) continue;
      out.push(aliasFile);
    }
  }
  return out;
}

function readOrderedAliases(orderFile) {
  if (!fs.existsSync(orderFile)) return [];
  const txt = fs.readFileSync(orderFile, "utf8");
  if (/\.json$/i.test(orderFile)) return readOrderedAliasesFromJSON(txt);
  if (/\.tsv$/i.test(orderFile)) return readOrderedAliasesFromTSV(txt);
  return readOrderedAliasesFromTXT(txt);
}

function readCanonicalDisplayNameMap(srcRoot) {
  const out = {};
  const scriptsDir = path.join(srcRoot, "scripts");
  if (!fs.existsSync(scriptsDir)) return out;
  let entries = [];
  try {
    entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry || !entry.isFile || !entry.isFile()) continue;
    if (!isSourceScriptName(entry.name)) continue;
    const aliasId = toAliasName(entry.name);
    if (!aliasId || Object.prototype.hasOwnProperty.call(out, aliasId)) continue;
    out[aliasId] = stripScriptFilenameSuffix(entry.name);
  }
  return out;
}

function fallbackAliasList() {
  if (!fs.existsSync(ALIAS_DIR)) return [];
  return uniqueKeepOrder(
    fs
      .readdirSync(ALIAS_DIR, { withFileTypes: true })
      .filter((d) => d.isFile() || d.isSymbolicLink())
      .map((d) => toAliasName(d.name))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  );
}

function resolveAliasPath(aliasFileRaw) {
  const aliasFile = toAliasName(aliasFileRaw);
  if (!aliasFile) return "";
  const currentPath = path.join(ALIAS_DIR, aliasFile);
  if (fs.existsSync(currentPath)) return currentPath;
  const legacyPath = path.join(ALIAS_DIR, aliasFile.replace(/\.js$/i, ".user.js"));
  if (fs.existsSync(legacyPath)) return legacyPath;
  return currentPath;
}

function readRuntimeGroupOrders(depsFile) {
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(depsFile, "utf8"));
  } catch {
    return [];
  }
  const groups = manifest && typeof manifest === "object" ? manifest.groups : null;
  if (!groups || typeof groups !== "object") return [];
  const out = [];
  for (const meta of Object.values(groups)) {
    const runtimeOrder = uniqueKeepOrder((meta && Array.isArray(meta.runtimeOrder) ? meta.runtimeOrder : []).map(normalizeAliasId).filter(Boolean));
    if (runtimeOrder.length > 1) out.push(runtimeOrder);
  }
  return out;
}

function readHeaderBlock(fileText) {
  const m = String(fileText || "").match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
  return m ? String(m[0]) : "";
}

function readTag(metaText, tag) {
  const rx = new RegExp(`^\\s*//\\s*@${tag}\\s+(.+?)\\s*$`, "mi");
  const m = String(metaText || "").match(rx);
  return m ? String(m[1]).trim() : "";
}

function normalizeRunAt(runAtRaw) {
  const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
  if (v === "document-start") return "document-start";
  if (v === "document-end") return "document-end";
  return "document-idle";
}

function line(tag, value) {
  return `// @${tag.padEnd(12, " ")} ${value}`;
}

function countMatches(text, rx) {
  const m = String(text || "").match(rx);
  return m ? m.length : 0;
}

function computeScriptMetrics(fileText) {
  const text = String(fileText || "");
  const bytes = Buffer.byteLength(text, "utf8");
  const lines = text ? text.split(/\r?\n/).length : 0;

  const observerRefs = countMatches(text, /\b(?:MutationObserver|ResizeObserver|IntersectionObserver|PerformanceObserver)\b/g);
  const intervalRefs = countMatches(text, /\bsetInterval\s*\(/g);
  const rafRefs = countMatches(text, /\brequestAnimationFrame\s*\(/g);
  const listenerRefs = countMatches(text, /\.addEventListener\s*\(/g);
  const domQueryRefs = countMatches(text, /\bquerySelector(?:All)?\s*\(/g);

  const scoreRaw =
    (bytes / 1024) * 0.32 +
    (lines / 100) * 0.45 +
    observerRefs * 2.8 +
    intervalRefs * 2.2 +
    rafRefs * 1.6 +
    listenerRefs * 0.18 +
    domQueryRefs * 0.06;
  const score = Math.max(1, Math.min(999, Math.round(scoreRaw)));
  const weight = score >= 30 ? "heavy" : (score >= 15 ? "medium" : "light");

  return {
    bytes,
    lines,
    score,
    weight,
    watchers: observerRefs + intervalRefs + rafRefs,
    listeners: listenerRefs,
  };
}

function buildPackEntry(aliasFileRaw) {
  const aliasFile = toAliasName(aliasFileRaw);
  if (!aliasFile) return null;
  const aliasPath = resolveAliasPath(aliasFile);
  if (!fs.existsSync(aliasPath)) return null;

  const txt = fs.readFileSync(aliasPath, "utf8");
  const header = readHeaderBlock(txt);
  const name = DISPLAY_NAME_MAP[aliasFile] || stripScriptFilenameSuffix(readTag(header, "name") || aliasFile);
  const runAt = normalizeRunAt(readTag(header, "run-at") || "document-idle");
  const metrics = computeScriptMetrics(txt);
  const requireUrl = `${DEV_ORIGIN}/alias/${encodeURIComponent(aliasFile)}?v=${encodeURIComponent(BUILD_TS)}`;

  return [
    "// ==UserScript==",
    line("name", name),
    line("version", BUILD_TS),
    line("run-at", runAt),
    line("h2o-lines", String(metrics.lines)),
    line("h2o-bytes", String(metrics.bytes)),
    line("h2o-score", String(metrics.score)),
    line("h2o-weight", metrics.weight),
    line("h2o-watchers", String(metrics.watchers)),
    line("h2o-listeners", String(metrics.listeners)),
    line("require", requireUrl),
    "// ==/UserScript==",
    "",
  ].join("\n");
}

function cleanProxyDirKeepPack() {
  ensureDir(PROXY_DIR);
  let removed = 0;
  for (const d of fs.readdirSync(PROXY_DIR, { withFileTypes: true })) {
    if (d.name === ".DS_Store") continue;
    if (d.name === OUT_NAME) continue;
    const fp = path.join(PROXY_DIR, d.name);
    try {
      if (d.isDirectory()) {
        fs.rmSync(fp, { recursive: true, force: true });
      } else {
        fs.unlinkSync(fp);
      }
      removed++;
    } catch {}
  }
  return removed;
}

function uniqueKeepOrder(list) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const v = String(item || "").trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function applyRuntimeGroupOrder(list, runtimeGroupOrders) {
  let ordered = uniqueKeepOrder(list);
  for (const runtimeOrder of Array.isArray(runtimeGroupOrders) ? runtimeGroupOrders : []) {
    const wanted = uniqueKeepOrder(runtimeOrder);
    if (wanted.length < 2) continue;
    const present = wanted.filter((aliasId) => ordered.includes(aliasId));
    if (present.length < 2) continue;
    const presentSet = new Set(present);
    const insertAt = ordered.findIndex((aliasId) => presentSet.has(aliasId));
    if (insertAt < 0) continue;
    const rest = ordered.filter((aliasId) => !presentSet.has(aliasId));
    ordered = [...rest.slice(0, insertAt), ...present, ...rest.slice(insertAt)];
  }
  return ordered;
}

const orderedFromConfig = readOrderedAliases(ORDER_FILE);
const DISPLAY_NAME_MAP = readCanonicalDisplayNameMap(SRC);
const RUNTIME_GROUP_ORDERS = readRuntimeGroupOrders(DEPS_FILE);
const orderedAliases = applyRuntimeGroupOrder(
  uniqueKeepOrder(orderedFromConfig.length ? orderedFromConfig : fallbackAliasList()),
  RUNTIME_GROUP_ORDERS
);

let missingAliases = 0;
const chunks = [];
for (const aliasFile of orderedAliases) {
  const chunk = buildPackEntry(aliasFile);
  if (!chunk) {
    missingAliases++;
    continue;
  }
  chunks.push(chunk);
}

const removedProxyArtifacts = cleanProxyDirKeepPack();

const banner = [
  "// H2O EXT Proxy Pack (header-only)",
  "// extPackFile=_paste-pack.ext.txt",
  `// buildTs=${BUILD_TS}`,
  `// count=${chunks.length}`,
  `// orderSource=${fs.existsSync(ORDER_FILE) ? ORDER_FILE : "alias-dir-fallback"}`,
  "",
].join("\n");

writeTextFileAtomic(OUT_FILE, banner + chunks.join("\n"));

console.log("[H2O EXT] wrote proxy pack:", OUT_FILE);
console.log("[H2O EXT] entries:", chunks.length);
if (missingAliases) console.warn("[H2O EXT] missing aliases skipped:", missingAliases);
if (removedProxyArtifacts) console.log("[H2O EXT] removed stale proxy artifacts:", removedProxyArtifacts);
