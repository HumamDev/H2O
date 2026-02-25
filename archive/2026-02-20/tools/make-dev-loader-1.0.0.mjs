/**
 * tools/make-dev-loader.mjs
 * @version 1.0.0
 *
 * Generates dev loaders and helper installers for Tampermonkey, served from h2o-vscode-tm-server.
 *
 * OUTPUT (under DEV_DIR):
 *  - _dev-loader.user.js
 *  - _dev-loader.tampermonkey.txt
 *  - _dev-loader.full.user.js
 *  - _dev-loader.full.tampermonkey.txt
 *  - _build.json (metadata, optional)
 *  - one/    (one userscript per selected alias)
 *  - groups/ (core/data/hub/minimap group loaders)
 *  - bisect/ (bisect loaders + _index.txt + _install-all.tampermonkey.txt)
 *  - proxy/  (per-alias proxy userscripts that keep ORIGINAL @name/header + live no-cache fetch)
 *
 * ENV:
 *  - H2O_SERVER_DIR    -> server root (h2o-vscode-tm-server)
 *  - H2O_SRC_DIR       -> source root (h2o-source) used to read ORIGINAL headers
 *  - H2O_ORDER_FILE    -> dev-order (tsv/txt) path (alias filenames)
 *  - H2O_BUILD_TS      -> cache buster for generated loaders (loaders/one/groups/bisect)
 *  - H2O_PROXY_MODE    -> "live" (default) or "require" for legacy stable @require proxy
 *  - H2O_PROXY_V       -> cache token used only when H2O_PROXY_MODE=require (default "dev")
 *  - H2O_DEV_DIR_NAME  -> dev output folder name (default "dev_output")
 *  - H2O_DEV_CLEAN     -> "1" to clean dev_output subfolders before writing
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/* -----------------------------
   Config
------------------------------ */

const SERVER =
  process.env.H2O_SERVER_DIR ||
  "/Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-vscode-tm-server";

const SRC =
  process.env.H2O_SRC_DIR ||
  "/Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-source";

const DEV_DIR_NAME = process.env.H2O_DEV_DIR_NAME || "dev_output";
const DEV_DIR = path.join(SERVER, DEV_DIR_NAME);

const ALIAS_DIR = path.join(SERVER, "alias");

const ONE_DIR = path.join(DEV_DIR, "one");
const GROUP_DIR = path.join(DEV_DIR, "groups");
const BISECT_DIR = path.join(DEV_DIR, "bisect");
const PROXY_DIR = path.join(DEV_DIR, "proxy");

const ORDER_FILE =
  process.env.H2O_ORDER_FILE ||
  path.join(SRC, "config", "dev-order.tsv");

const buildTs = String(process.env.H2O_BUILD_TS || Date.now());
const DO_CLEAN = String(process.env.H2O_DEV_CLEAN || "") === "1";

// Proxy mode:
// - live (default): fetches alias file at runtime with cache-busting query each page load
// - require: legacy stable @require with fixed proxy token
const PROXY_MODE = String(process.env.H2O_PROXY_MODE || "live").toLowerCase();
const PROXY_V = String(process.env.H2O_PROXY_V || "dev");

/* -----------------------------
   Helpers (FS)
------------------------------ */

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmDirContents(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, entry), { recursive: true, force: true });
  }
}

/* -----------------------------
   Helpers (Strings)
------------------------------ */

function padN(n, w) {
  return String(n).padStart(w, "0");
}

function safeFileName(name) {
  return String(name || "").replace(/[^\w.\-()]+/g, "_");
}

/* -----------------------------
   dev-order parsing (TSV + TXT)
------------------------------ */

/**
 * Supported order files:
 * 1) TSV (recommended):
 *    STATUS<TAB>FILENAME
 *    STATUS accepts: ON/OFF, ✅/❌, 🟢/🔴, 🟩/🟥, 1/0, true/false, yes/no
 *
 * 2) TXT legacy:
 *    - blank lines ignored
 *    - full-line # ignored
 *    - inline " # comment" stripped
 *    - lines starting with "-" are OFF (ignored)
 *    - lines starting with "+" are ON (+ stripped)
 *    - otherwise line is treated as filename (ON)
 */
function parseStatusToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  if (raw === "✅" || raw === "🟢" || raw === "🟩") return "ON";
  if (raw === "❌" || raw === "🔴" || raw === "🟥") return "OFF";

  const v = raw.toLowerCase();
  if (v === "on" || v === "1" || v === "true" || v === "yes") return "ON";
  if (v === "off" || v === "0" || v === "false" || v === "no") return "OFF";

  return null;
}

function readOrderListTSV(txt) {
  const out = [];
  for (const rawLine of String(txt || "").split(/\r?\n/)) {
    const line0 = rawLine.trim();
    if (!line0) continue;
    if (line0.startsWith("#")) continue;

    const line = line0.replace(/\s+#.*$/, "").trim(); // strip inline comments
    if (!line) continue;

    const parts = line.split("\t");
    if (parts.length < 2) continue;

    const st = parseStatusToken(parts[0]);
    const file = parts.slice(1).join("\t").trim();
    if (!file) continue;

    if (st === "ON") out.push(file);
  }
  return out;
}

function readOrderListTXT(txt) {
  return String(txt || "")
    .split(/\r?\n/)
    .map((s) => s.replace(/\s+#.*$/, "").trim())
    .filter((s) => s && !s.startsWith("#"))
    .filter((s) => !s.startsWith("-"))
    .map((s) => (s.startsWith("+") ? s.slice(1).trim() : s))
    .filter(Boolean);
}

function readOrderList(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  return /\.tsv$/i.test(fp) ? readOrderListTSV(txt) : readOrderListTXT(txt);
}

/* -----------------------------
   Alias name mapping (match make-aliases.mjs)
------------------------------ */

function stripEmojiAndInvisibles(s) {
  return String(s || "")
    .replace(/[\p{Extended_Pictographic}]/gu, "")
    .replace(/[\uFE0E\uFE0F\u200D\u200B-\u200F\uFEFF\u2060\u00AD]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "");
}

// Convert REAL source filename -> alias filename
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

// Build alias->source-path map by scanning SRC for *.user.js
function buildAliasToSourceMap() {
  const map = new Map();
  if (!fs.existsSync(SRC)) return map;

  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!/\.user\.js$/i.test(entry.name)) continue;

    const alias = toAliasName(entry.name);
    if (!alias) continue;

    map.set(alias, path.join(SRC, entry.name));
  }
  return map;
}

/* -----------------------------
   Userscript header extraction
------------------------------ */

function extractUserScriptHeaderLines(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const txt = fs.readFileSync(filePath, "utf8");
    const m = txt.match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/);
    if (!m) return null;
    return m[0].split(/\r?\n/);
  } catch {
    return null;
  }
}

function normalizeHeaderForProxy(headerLines, aliasFile, proxyMode) {
  // Keep original header as much as possible, but:
  // - remove all @require (proxy controls loading)
  // - ensure @match exists for chatgpt.com (keep if present)
  // - ensure @run-at exists (keep if present)
  // - in live mode, force grant/connect needed for GM_xmlhttpRequest
  const out = [];
  for (const line of headerLines) {
    if (/^\s*\/\/\s*@require\b/i.test(line)) continue;
    if (proxyMode === "live" && /^\s*\/\/\s*@grant\b/i.test(line)) continue;
    if (proxyMode === "live" && /^\s*\/\/\s*@connect\b/i.test(line)) continue;
    out.push(line);
  }

  const closeIdx = out.findIndex((l) => /^\s*\/\/\s*==\/UserScript==\s*$/i.test(l));
  const toInsert = [];
  if (!out.some((l) => /^\s*\/\/\s*@match\b/i.test(l))) {
    toInsert.push("// @match        https://chatgpt.com/*");
  }
  if (!out.some((l) => /^\s*\/\/\s*@run-at\b/i.test(l))) {
    toInsert.push("// @run-at       document-idle");
  }

  if (proxyMode === "live") {
    toInsert.push("// @grant        GM_xmlhttpRequest");
    toInsert.push("// @connect      127.0.0.1");
  } else {
    if (!out.some((l) => /^\s*\/\/\s*@connect\b/i.test(l))) {
      toInsert.push("// @connect      127.0.0.1");
    }
    toInsert.push(`// @require      ${requireUrl(aliasFile, PROXY_V)}`);
  }

  if (closeIdx >= 0) out.splice(closeIdx, 0, ...toInsert);
  else out.push(...toInsert, "// ==/UserScript==");

  return out;
}

/* -----------------------------
   Tampermonkey userscript builders
------------------------------ */

function requireUrl(file, v) {
  return `http://127.0.0.1:5500/alias/${encodeURIComponent(file)}?v=${encodeURIComponent(v)}`;
}

function requireLine(file) {
  // Loader/ONE/Bisect use buildTs (fast hard-bust on rebuild)
  return `// @require      ${requireUrl(file, buildTs)}`;
}

function makeRequires(files) {
  return files.map(requireLine).join("\n");
}

function makeLoader({ name, files, logTag }) {
  const requires = makeRequires(files);
  return `// ==UserScript==
// @name         ${name}
// @namespace    H2O.ChatGPT.Dev
// @version      1.0.0
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @connect      127.0.0.1
${requires}
// ==/UserScript==

console.log("[${logTag}] buildTs=${buildTs}");`;
}

function makeOneLoader(file, idx, stepW) {
  const n = padN(idx + 1, stepW);
  return `// ==UserScript==
// @name         H2O DEV ONE (${n}) ${file}
// @namespace    H2O.ChatGPT.Dev
// @version      1.0.0
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// @connect      127.0.0.1
${requireLine(file)}
// ==/UserScript==

console.log("[H2O DEV ONE] loaded:", ${JSON.stringify(file)}, "buildTs=", ${JSON.stringify(buildTs)});`;
}

function makeLiveProxyRuntime(aliasFile) {
  return `(function () {
  const aliasFile = ${JSON.stringify(aliasFile)};
  const base = "http://127.0.0.1:5500/alias/";
  const bust = String(Date.now()) + "-" + Math.random().toString(36).slice(2);
  const url = base + encodeURIComponent(aliasFile) + "?tmcb=" + encodeURIComponent(bust);

  GM_xmlhttpRequest({
    method: "GET",
    url,
    nocache: true,
    headers: {
      "Cache-Control": "no-cache, no-store, max-age=0",
      "Pragma": "no-cache",
    },
    onload: (res) => {
      const status = Number((res && res.status) || 0);
      if (status < 200 || status >= 300) {
        console.error("[H2O DEV PROXY] fetch failed:", aliasFile, "status=", status, "url=", url);
        return;
      }

      const code = String((res && res.responseText) || "");
      if (!code.trim()) {
        console.error("[H2O DEV PROXY] empty response:", aliasFile, "url=", url);
        return;
      }

      try {
        (0, eval)(code + "\\n//# sourceURL=" + url);
        console.log("[H2O DEV PROXY] loaded live:", aliasFile, "url=", url);
      } catch (err) {
        console.error("[H2O DEV PROXY] eval failed:", aliasFile, err);
      }
    },
    onerror: (err) => {
      console.error("[H2O DEV PROXY] request error:", aliasFile, err);
    },
    ontimeout: () => {
      console.error("[H2O DEV PROXY] request timeout:", aliasFile, "url=", url);
    },
  });
})();`;
}

function makeProxyLoader({ aliasFile, srcHeaderLines }) {
  // Install-once proxy:
  // - copies original header (@name, @namespace, @version, @description, grants, etc.)
  // - live mode (default): fetches latest alias on every page load (cache-busting)
  // - require mode: legacy stable @require with fixed PROXY_V token
  let headerLines = srcHeaderLines;
  if (!headerLines || !headerLines.length) {
    // fallback: minimal header if we can't read original
    headerLines = [
      "// ==UserScript==",
      `// @name         ${aliasFile}`,
      "// @namespace    H2O.ChatGPT.Proxy",
      "// @version      1.0.0",
      "// @match        https://chatgpt.com/*",
      "// @run-at       document-idle",
      "// @grant        GM_xmlhttpRequest",
      "// ==/UserScript==",
    ];
  }

  const normalized = normalizeHeaderForProxy(headerLines, aliasFile, PROXY_MODE);

  const out = [];
  out.push(...normalized);
  out.push("");
  if (PROXY_MODE === "live") {
    out.push(makeLiveProxyRuntime(aliasFile));
  } else {
    out.push(`console.log("[H2O DEV PROXY] loaded:", ${JSON.stringify(aliasFile)}, "v=", ${JSON.stringify(PROXY_V)});`);
  }
  return out.join("\n");
}

/* -----------------------------
   Group selection
------------------------------ */

function pick(files, rx) {
  return files.filter((f) => rx.test(f));
}

function buildGroups(files) {
  // Anchored + precedence-safe
  const groupCore = pick(files, /^0A1\./);
  const groupData = pick(files, /^0B1/);
  const groupHub = pick(files, /^(0Z1|0Z2|0Z3)/);
  const groupMiniMap = pick(files, /^(1A1|1A2|1A3|1A4|1A5|1A6|1A7|1A1z)/);

  return [
    { key: "core", name: "H2O DEV Loader (Group: Core)", files: groupCore },
    { key: "data", name: "H2O DEV Loader (Group: Data)", files: groupData },
    { key: "hub", name: "H2O DEV Loader (Group: Control Hub)", files: groupHub },
    { key: "minimap", name: "H2O DEV Loader (Group: MiniMap)", files: groupMiniMap },
  ];
}

/* -----------------------------
   Bisect generation (binary-search debugging)
------------------------------ */

function writeBisectLoaders(allFiles) {
  let idx = 0;

  const PADW = String(allFiles.length).length;
  const STEPW = Math.max(2, String(allFiles.length).length);

  const nodes = [];
  const installChunks = [];

  function summarizeRange(seg, lo, hi) {
    const a = seg[0] || "";
    const b = seg[seg.length - 1] || "";
    return `${padN(lo + 1, PADW)}-${padN(hi, PADW)} (${seg.length}) :: ${a} … ${b}`;
  }

  function mkOutFile(nodeIdx, lo, hi) {
    return `_dev-loader.bisect.${padN(nodeIdx, STEPW)}.${padN(lo + 1, PADW)}-${padN(hi, PADW)}.user.js`;
  }

  function rec(lo, hi) {
    const seg = allFiles.slice(lo, hi);
    if (seg.length < 2) return null;

    idx += 1;
    const myIdx = idx;

    const label = summarizeRange(seg, lo, hi);
    const outFile = mkOutFile(myIdx, lo, hi);
    const outPath = path.join(BISECT_DIR, outFile);

    const code = makeLoader({
      name: `H2O DEV Loader (Bisect ${padN(myIdx, STEPW)}) ${label}`,
      files: seg,
      logTag: `H2O DEV BISECT:${padN(myIdx, STEPW)} ${padN(lo + 1, PADW)}-${padN(hi, PADW)}`,
    });

    fs.writeFileSync(outPath, code, "utf8");
    installChunks.push(code);

    const node = { idx: myIdx, lo, hi, count: seg.length, outFile, left: null, right: null };
    nodes.push(node);

    const mid = lo + Math.ceil((hi - lo) / 2);
    node.left = rec(lo, mid);
    node.right = rec(mid, hi);

    return node;
  }

  rec(0, allFiles.length);
  nodes.sort((a, b) => a.idx - b.idx);

  const indexLines = [];
  indexLines.push(`# H2O Bisect Index`);
  indexLines.push(`# buildTs=${buildTs}`);
  indexLines.push(`# total=${allFiles.length}`);
  indexLines.push(`#`);
  indexLines.push(`# HOW TO USE:`);
  indexLines.push(`# 1) Install ONE bisect loader (start with the first line).`);
  indexLines.push(`# 2) Run it on chatgpt.com.`);
  indexLines.push(`# 3) If it FAILS -> install NEXT:FAIL (left half).`);
  indexLines.push(`# 4) If it PASSES -> install NEXT:PASS (right half).`);
  indexLines.push(`# 5) Repeat until you narrow to the broken area.`);
  indexLines.push(`#`);

  for (const n of nodes) {
    const base = `${padN(n.idx, STEPW)} | ${padN(n.lo + 1, PADW)}-${padN(n.hi, PADW)} | n=${padN(n.count, PADW)} | ${n.outFile}`;
    if (n.left && n.right) {
      const fail = `${padN(n.left.idx, STEPW)} (${padN(n.left.lo + 1, PADW)}-${padN(n.left.hi, PADW)}) ${n.left.outFile}`;
      const pass = `${padN(n.right.idx, STEPW)} (${padN(n.right.lo + 1, PADW)}-${padN(n.right.hi, PADW)}) ${n.right.outFile}`;
      indexLines.push(`${base} | NEXT:FAIL → ${fail} | NEXT:PASS → ${pass}`);
    } else {
      indexLines.push(base);
    }
  }

  const indexPath = path.join(BISECT_DIR, "_index.txt");
  fs.writeFileSync(indexPath, indexLines.join("\n") + "\n", "utf8");

  const installAllPath = path.join(BISECT_DIR, "_install-all.tampermonkey.txt");
  const installAllHeader =
    `// H2O Bisect Install-All (paste pack)\n` +
    `// buildTs=${buildTs}\n` +
    `// total=${allFiles.length}\n` +
    `// count=${installChunks.length}\n\n`;
  fs.writeFileSync(installAllPath, installAllHeader + installChunks.join("\n\n") + "\n", "utf8");

  return { count: idx, indexPath, installAllPath };
}

/* -----------------------------
   Install-all pack helper
------------------------------ */

function writeInstallAllPack(outPath, title, chunks) {
  const header =
    `// ${title}\n` +
    `// buildTs=${buildTs}\n` +
    `// count=${chunks.length}\n\n`;
  fs.writeFileSync(outPath, header + chunks.join("\n\n") + "\n", "utf8");
}

/* -----------------------------
   Main
------------------------------ */

const filesRaw = readOrderList(ORDER_FILE);

// Filter out ghosts: only include alias files that exist in alias folder
const files = filesRaw.filter((name) => {
  try { return fs.existsSync(path.join(ALIAS_DIR, name)); }
  catch { return false; }
});

const ghost = filesRaw.length - files.length;
if (ghost > 0) {
  console.warn(`[H2O] dev-order contains ${ghost} alias entries not found in alias dir; skipped.`);
}

ensureDir(DEV_DIR);
ensureDir(ONE_DIR);
ensureDir(GROUP_DIR);
ensureDir(BISECT_DIR);
ensureDir(PROXY_DIR);

if (DO_CLEAN) {
  rmDirContents(ONE_DIR);
  rmDirContents(GROUP_DIR);
  rmDirContents(BISECT_DIR);
  rmDirContents(PROXY_DIR);
}

// Selected / Full outputs
const outSelectedUserJs = path.join(DEV_DIR, "_dev-loader.user.js");
const outSelectedTxt = path.join(DEV_DIR, "_dev-loader.tampermonkey.txt");
const outFullUserJs = path.join(DEV_DIR, "_dev-loader.full.user.js");
const outFullTxt = path.join(DEV_DIR, "_dev-loader.full.tampermonkey.txt");

const selected = makeLoader({ name: "H2O DEV Loader (Selected)", files, logTag: "H2O DEV LOADER" });
const full = makeLoader({ name: "H2O DEV Loader (FULL)", files, logTag: "H2O DEV FULL" });

fs.writeFileSync(outSelectedUserJs, selected, "utf8");
fs.writeFileSync(outSelectedTxt, selected, "utf8");
fs.writeFileSync(outFullUserJs, full, "utf8");
fs.writeFileSync(outFullTxt, full, "utf8");

// Build metadata (optional)
const buildMetaPath = path.join(DEV_DIR, "_build.json");
const buildMeta = {
  buildTs,
  proxyMode: PROXY_MODE,
  proxyV: PROXY_V,
  generatedAt: new Date().toISOString(),
  orderFile: ORDER_FILE,
  filesCount: files.length,
  serverBase: "http://127.0.0.1:5500",
  aliasBasePath: "/alias/",
  devBasePath: `/${DEV_DIR_NAME}/`,
};
fs.writeFileSync(buildMetaPath, JSON.stringify(buildMeta, null, 2) + "\n", "utf8");

// PROXY loaders (install once)
const aliasToSrc = buildAliasToSourceMap();
const proxyChunks = [];

for (const aliasFile of files) {
  const srcPath = aliasToSrc.get(aliasFile) || null;
  const headerLines = extractUserScriptHeaderLines(srcPath);
  const code = makeProxyLoader({ aliasFile, srcHeaderLines: headerLines });

  const outName = `_proxy.${safeFileName(aliasFile)}.user.js`;
  fs.writeFileSync(path.join(PROXY_DIR, outName), code + "\n", "utf8");
  proxyChunks.push(code);
}

writeInstallAllPack(
  path.join(PROXY_DIR, "_install-all.tampermonkey.txt"),
  "H2O PROXY Install-All (paste pack)",
  proxyChunks
);

// ONE loaders
const oneStepW = Math.max(2, String(files.length).length);
const oneChunks = [];
files.forEach((f, i) => {
  const fname = `_dev.${padN(i + 1, oneStepW)}-${safeFileName(f)}.user.js`;
  const code = makeOneLoader(f, i, oneStepW);
  fs.writeFileSync(path.join(ONE_DIR, fname), code, "utf8");
  oneChunks.push(code);
});

// GROUP loaders
const groups = buildGroups(files);
const groupChunks = [];
groups.forEach((g) => {
  const out = path.join(GROUP_DIR, `_dev-loader.group.${g.key}.user.js`);
  const code = makeLoader({ name: g.name, files: g.files, logTag: `H2O DEV GROUP:${g.key}` });
  fs.writeFileSync(out, code, "utf8");
  groupChunks.push(code);
});

writeInstallAllPack(path.join(ONE_DIR, "_install-all.tampermonkey.txt"), "H2O ONE Install-All (paste pack)", oneChunks);
writeInstallAllPack(path.join(GROUP_DIR, "_install-all.tampermonkey.txt"), "H2O GROUP Install-All (paste pack)", groupChunks);

// BISECT loaders + assist outputs
const bisectMeta = writeBisectLoaders(files);

// Clipboard: copy Selected loader (most-used)
const pb = spawnSync("pbcopy", [], { input: selected });
const copied = !pb.error && pb.status === 0;

// Logs
console.log("[H2O] buildTs:", buildTs);
console.log("[H2O] proxyMode:", PROXY_MODE);
console.log("[H2O] proxyV:", PROXY_V);
console.log("[H2O] orderFile:", ORDER_FILE);
console.log("[H2O] files:", files.length);
console.log("[H2O] wrote:", outSelectedUserJs);
console.log("[H2O] wrote:", outSelectedTxt);
console.log("[H2O] wrote:", outFullUserJs);
console.log("[H2O] wrote:", outFullTxt);
console.log("[H2O] wrote build meta:", buildMetaPath);
console.log("[H2O] wrote PROXY loaders:", PROXY_DIR);
console.log("[H2O] wrote PROXY install-all:", path.join(PROXY_DIR, "_install-all.tampermonkey.txt"));
console.log("[H2O] wrote ONE loaders:", ONE_DIR);
console.log("[H2O] wrote GROUP loaders:", GROUP_DIR);
console.log("[H2O] wrote BISECT loaders:", BISECT_DIR, `(count=${bisectMeta.count})`);
console.log("[H2O] wrote BISECT index:", bisectMeta.indexPath);
console.log("[H2O] wrote BISECT install-all:", bisectMeta.installAllPath);
console.log(copied ? `[H2O] copied Selected loader ✅ (buildTs=${buildTs})` : `[H2O] clipboard copy failed ❌`);
