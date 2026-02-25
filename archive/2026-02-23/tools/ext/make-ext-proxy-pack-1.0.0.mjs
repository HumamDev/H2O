// tools/ext/make-ext-proxy-pack.mjs
// @version 1.0.0
//
// EXT-native proxy pack generator.
// Writes only the header pack consumed by tools/ext/make-chrome-live-extension.mjs
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
    const aliasFile = parts.slice(1).join("\t").trim();
    if (enabled !== true) continue;
    if (!/\.user\.js$/i.test(aliasFile)) continue;
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
    if (!/\.user\.js$/i.test(line)) continue;
    out.push(line);
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
      const aliasFile = String(it?.file || "").trim();
      const enabled = !!it?.enabled;
      if (!enabled) continue;
      if (!/\.user\.js$/i.test(aliasFile)) continue;
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

function fallbackAliasList() {
  if (!fs.existsSync(ALIAS_DIR)) return [];
  return fs
    .readdirSync(ALIAS_DIR, { withFileTypes: true })
    .filter((d) => (d.isFile() || d.isSymbolicLink()) && /\.user\.js$/i.test(d.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
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

function buildPackEntry(aliasFile) {
  const aliasPath = path.join(ALIAS_DIR, aliasFile);
  if (!fs.existsSync(aliasPath)) return null;

  const txt = fs.readFileSync(aliasPath, "utf8");
  const header = readHeaderBlock(txt);
  const name = readTag(header, "name") || aliasFile;
  const runAt = normalizeRunAt(readTag(header, "run-at") || "document-idle");
  const requireUrl = `${DEV_ORIGIN}/alias/${encodeURIComponent(aliasFile)}?v=${encodeURIComponent(BUILD_TS)}`;

  return [
    "// ==UserScript==",
    line("name", name),
    line("version", BUILD_TS),
    line("run-at", runAt),
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

const orderedFromConfig = readOrderedAliases(ORDER_FILE);
const orderedAliases = uniqueKeepOrder(orderedFromConfig.length ? orderedFromConfig : fallbackAliasList());

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

fs.writeFileSync(OUT_FILE, banner + chunks.join("\n"), "utf8");

console.log("[H2O EXT] wrote proxy pack:", OUT_FILE);
console.log("[H2O EXT] entries:", chunks.length);
if (missingAliases) console.warn("[H2O EXT] missing aliases skipped:", missingAliases);
if (removedProxyArtifacts) console.log("[H2O EXT] removed stale proxy artifacts:", removedProxyArtifacts);
