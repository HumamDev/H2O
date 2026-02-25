// tools/make-dev-all.mjs
// @version 1.0.0
//
// Generates a browser-side loader:
//   dev_output/_dev-all.js
//
// It injects <script src="http://127.0.0.1:5500/alias/<ALIAS>?v=<buildTs>"> for ON modules.
//
// Order file formats supported:
// - TSV (MASTER):  STATUS<TAB>ALIAS
//     STATUS accepts: 🟢/🔴, ON/OFF, ✅/❌, 🟩/🟥, 1/0, true/false, yes/no
// - TXT (legacy):  "- " prefix means OFF, otherwise ON
// - JSON: { sections:[{items:[{file, enabled}]}] }
//
// ENV:
// - H2O_SERVER_DIR  : server root (h2o-vscode-tm-server)
// - H2O_SRC_DIR     : source root (h2o-source) used for default order path
// - H2O_ORDER_FILE  : path to dev-order (tsv/txt/json)
// - H2O_BUILD_TS    : cache buster value

import fs from "node:fs";
import path from "node:path";

/* -----------------------------
   ENV / PATHS
------------------------------ */

const SERVER =
  process.env.H2O_SERVER_DIR ||
  "/Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-vscode-tm-server";

const SRC =
  process.env.H2O_SRC_DIR ||
  "/Users/hobayda/Library/Mobile Documents/com~apple~CloudDocs/VS Code/h2o-source";

const DEV_DIR = path.join(SERVER, "dev_output");

const ORDER_FILE =
  process.env.H2O_ORDER_FILE || path.join(SRC, "config", "dev-order.tsv");

const buildTs = process.env.H2O_BUILD_TS || String(Date.now());

/* -----------------------------
   Helpers
------------------------------ */

function stripInlineComment(line) {
  // removes " # comment" style
  return String(line || "").replace(/\s+#.*$/, "").trim();
}

function isAliasFile(s) {
  return /\.user\.js$/i.test(String(s || "").trim());
}

function parseStatusToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  // ✅ nicer TSV toggles
  if (raw === "🟢" || raw === "✅" || raw === "🟩") return "ON";
  if (raw === "🔴" || raw === "❌" || raw === "🟥") return "OFF";

  const v = raw.toLowerCase();
  if (v === "on" || v === "1" || v === "true" || v === "yes") return "ON";
  if (v === "off" || v === "0" || v === "false" || v === "no") return "OFF";

  return null;
}

/* -----------------------------
   Readers (TSV / TXT / JSON)
------------------------------ */

function readOnListFromTSV(txt) {
  const out = [];
  for (const rawLine of String(txt || "").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    const noInline = stripInlineComment(trimmed);
    if (!noInline) continue;

    const parts = noInline.split("\t");
    if (parts.length < 2) continue;

    const status = parseStatusToken(parts[0]);
    const file = parts.slice(1).join("\t").trim();

    if (!status || !isAliasFile(file)) continue;
    if (status !== "ON") continue;

    out.push(file);
  }
  return out;
}

function readOnListFromTXT(txt) {
  const out = [];
  for (const rawLine of String(txt || "").split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    line = stripInlineComment(line);
    if (!line) continue;

    // OFF if "- " or "-" prefix
    if (line.startsWith("-")) continue;

    // allow "+ " / "+" enable markers
    if (line.startsWith("+")) line = line.slice(1).trim();

    if (isAliasFile(line)) out.push(line);
  }
  return out;
}

function readOnListFromJSON(txt) {
  const out = [];
  let obj;
  try {
    obj = JSON.parse(String(txt || ""));
  } catch {
    return out;
  }

  const sections = Array.isArray(obj?.sections) ? obj.sections : [];
  for (const sec of sections) {
    const items = Array.isArray(sec?.items) ? sec.items : [];
    for (const it of items) {
      const file = String(it?.file || "").trim();
      const enabled = !!it?.enabled;
      if (enabled && isAliasFile(file)) out.push(file);
    }
  }
  return out;
}

function readOrderList(fp) {
  if (!fs.existsSync(fp)) {
    console.warn("[H2O] order file missing:", fp);
    return [];
  }

  const txt = fs.readFileSync(fp, "utf8");
  const isTSV = /\.tsv$/i.test(fp);
  const isJSON = /\.json$/i.test(fp);

  if (isJSON) return readOnListFromJSON(txt);
  if (isTSV) return readOnListFromTSV(txt);
  return readOnListFromTXT(txt);
}

/* -----------------------------
   Generate _dev-all.js
------------------------------ */

const files = readOrderList(ORDER_FILE);

const out = [];
out.push(`// AUTO-GENERATED. buildTs=${buildTs}`);
out.push(`// ORDER_FILE=${ORDER_FILE}`);
out.push(`(function(){`);
out.push(`  const base = "http://127.0.0.1:5500/alias/";`);
out.push(`  const q = "v=" + ${JSON.stringify(buildTs)};`);
out.push(`  const files = ${JSON.stringify(files, null, 2)};`);
out.push(`  if (!files.length) {`);
out.push(`    console.warn("[H2O DEV-ALL] no ON modules found (check dev-order)");`);
out.push(`    return;`);
out.push(`  }`);
out.push(`  for (const f of files) {`);
out.push(`    const s = document.createElement("script");`);
out.push(`    s.src = base + encodeURIComponent(f) + "?" + q;`);
out.push(`    s.async = false;`);
out.push(`    document.documentElement.appendChild(s);`);
out.push(`  }`);
out.push(`  console.log("[H2O DEV-ALL] injected:", files.length, "buildTs=", ${JSON.stringify(buildTs)});`);
out.push(`})();`);

fs.mkdirSync(DEV_DIR, { recursive: true });
const outPath = path.join(DEV_DIR, "_dev-all.js");
fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");

console.log("[H2O] make-dev-all done");
console.log("[H2O] orderFile:", ORDER_FILE);
console.log("[H2O] ON files:", files.length);
console.log("[H2O] wrote:", outPath);
