// tools/loader/sync-dev-order.mjs
// @version 1.1.0
//
// Purpose:
// - Scan SRC for source script files (*.user.js or *.js)
// - Maintain a sectioned, human-readable dev-order file using real source filenames
// - Keep alias filenames as a derived compatibility layer for downstream tooling
//
// Master format: TSV (editable)
//   STATUS<TAB>SOURCE_FILENAME
//   STATUS = 🟢 / 🔴
//   (Reader accepts: 🟢/🔴, ✅/❌, 🟩/🟥, ON/OFF, true/false, 1/0, yes/no)
//
// This script also emits beside it:
// - dev-order.txt (human list; OFF uses "- ")
// - dev-order.json (view; enabled boolean)
// - scripts-list.tsv (raw filenames; one per line)
// - userscript-headers.tsv (filename + full UserScript header block as readable multi-line rows)
// - userscript-headers.html (colorized accessible view)
//
// Critical behavior:
// - PRESERVES your previous choices from the existing TSV
// - Adds new files with defaults (INTERFACE/EXPERIMENTAL default 🔴, others 🟢)
// - Removes deleted files automatically (because we re-scan SRC each time)

import fs from "node:fs";
import path from "node:path";

/* -----------------------------
   ENV / PATHS
------------------------------ */

const SRC_ROOT = process.env.H2O_SRC_DIR || process.cwd();
const ORDER_FILE =
  process.env.H2O_ORDER_FILE || path.join(SRC_ROOT, "config", "dev-order.tsv");

const DIR = path.dirname(ORDER_FILE);
fs.mkdirSync(DIR, { recursive: true });

const BASE = path.basename(ORDER_FILE);
const STEM = BASE.replace(/\.(json|tsv|txt)$/i, "");

const OUT_TSV = path.join(DIR, `${STEM}.tsv`);
const OUT_TXT = path.join(DIR, `${STEM}.txt`);
const OUT_JSON = path.join(DIR, `${STEM}.json`);
const OUT_SCRIPTS_LIST_TSV = path.join(DIR, "scripts-list.tsv");
const OUT_USERSCRIPT_HEADERS_TSV = path.join(DIR, "userscript-headers.tsv");
const OUT_USERSCRIPT_HEADERS_HTML = path.join(DIR, "userscript-headers.html");
const USERSCRIPT_HEADER_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/;
const DEBUG_SYNC_DEV_ORDER = process.env.H2O_DEBUG_SYNC_DEV_ORDER === "1";
const RUN_STARTED_AT = Date.now();

function logDebug(message) {
  if (!DEBUG_SYNC_DEV_ORDER) return;
  const elapsedMs = String(Date.now() - RUN_STARTED_AT).padStart(5, " ");
  console.error(`[H2O][sync-dev-order][+${elapsedMs}ms] ${message}`);
}

function writeTextFileAtomic(fp, text) {
  const target = path.resolve(fp);
  const dir = path.dirname(target);
  const base = path.basename(target);
  const temp = path.join(dir, `.${base}.tmp-${process.pid}-${Date.now()}`);
  logDebug(`write start: ${target}`);
  fs.writeFileSync(temp, text, "utf8");
  fs.renameSync(temp, target);
  logDebug(`write done: ${target}`);
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

const SCRIPT_SRC_DIR = pickUserScriptDir(SRC_ROOT);

/* -----------------------------
   Alias rules (must match make-aliases.mjs)
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
  return `${id}._${title}_.user.js`;
}

function isSourceScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return false;
  return toAliasName(name) !== null;
}

function normalizeOrderEntryToSourceName(file, sourceNames, aliasToSource) {
  const raw = String(file || "").trim();
  if (!raw) return "";
  if (sourceNames.has(raw)) return raw;
  const alias = toAliasName(raw);
  if (!alias) return "";
  return aliasToSource.get(alias) || "";
}

/* -----------------------------
   Status parsing / rendering
------------------------------ */

// Internal status is normalized to "ON" | "OFF" for safety.
// TSV output is always 🟢 / 🔴.

function parseStatusToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;

  // Emoji toggles
  // ON:  ✅ 🟢 🟩
  // OFF: ❌ 🔴 🟥
  if (raw === "✅" || raw === "🟢" || raw === "🟩") return "ON";
  if (raw === "❌" || raw === "🔴" || raw === "🟥") return "OFF";

  // Plain words / booleans / numbers
  const v = raw.toLowerCase();
  if (v === "on" || v === "1" || v === "true" || v === "yes") return "ON";
  if (v === "off" || v === "0" || v === "false" || v === "no") return "OFF";

  return null;
}

function statusToEmoji(st) {
  return st === "OFF" ? "🔴" : "🟢";
}

function emojiToStatus(emojiOrToken) {
  return parseStatusToken(emojiOrToken) || null;
}

/* -----------------------------
   Read existing TSV (preserve your choices)
------------------------------ */

function readExistingTSV(fp, sourceNames, aliasToSource) {
  const statusMap = new Map(); // source filename -> "ON" | "OFF"
  const sectionOrderMap = new Map();
  const sectionTitleMap = new Map();
  for (const sec of SECTIONS) sectionOrderMap.set(sec.key, []);
  if (!fs.existsSync(fp)) return { statusMap, sectionOrderMap, sectionTitleMap };

  const txt = fs.readFileSync(fp, "utf8");
  let currentSectionKey = "";
  let currentSectionTitle = "";
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const title = line.replace(/^#\s*/, "").trim();
      if (!title) continue;
      if (
        /^=+$/.test(title) ||
        /^h2o dev order/i.test(title) ||
        /^master:/i.test(title) ||
        /^status<tab>filename/i.test(title)
      ) {
        continue;
      }
      currentSectionTitle = title;
      const section = SECTIONS.find((sec) => title === sec.title);
      currentSectionKey = section ? section.key : "";
      if (currentSectionKey && !sectionTitleMap.has(currentSectionKey)) {
        sectionTitleMap.set(currentSectionKey, title);
      }
      continue;
    }

    // allow inline comments (keeps your headers clean)
    const noInline = line.replace(/\s+#.*$/, "").trim();
    if (!noInline) continue;

    const parts = noInline.split("\t");
    if (parts.length < 2) continue;

    const status = emojiToStatus(parts[0]);
    const rawFile = parts.slice(1).join("\t").trim();
    if (!rawFile || !/(\.user)?\.js$/i.test(rawFile)) continue;
    const file = normalizeOrderEntryToSourceName(rawFile, sourceNames, aliasToSource);
    if (!file) continue;

    if (status) statusMap.set(file, status);
    const sectionKey = currentSectionKey || groupOf(file);
    if (currentSectionTitle && !sectionTitleMap.has(sectionKey)) {
      sectionTitleMap.set(sectionKey, currentSectionTitle);
    }
    const sectionList = sectionOrderMap.get(sectionKey) || [];
    if (!sectionList.includes(file)) sectionList.push(file);
    if (!sectionOrderMap.has(sectionKey)) sectionOrderMap.set(sectionKey, sectionList);
  }

  return { statusMap, sectionOrderMap, sectionTitleMap };
}

/* -----------------------------
   Sectioning / sorting
------------------------------ */

function sortKey(filename) {
  const id = String(filename || "").split(".")[0] || filename;
  const m = id.match(/^(\d+)(.*)$/);
  const num = m ? Number(m[1]) : 9999;
  const tail = m ? m[2] : id;
  return `${String(num).padStart(4, "0")}:${tail}:${filename}`;
}

function groupOf(filename) {
  const id = String(filename || "").split(".")[0] || "";

  if (/^0A/i.test(id)) return "CORE";
  if (/^0B/i.test(id) || /^0W/i.test(id)) return "UNMOUNT_PAGINATION";
  if (/^0C/i.test(id)) return "PERFORMANCE";
  if (/^0D/i.test(id)) return "DATA";
  if (/^0X/i.test(id)) return "COMMAND_BAR_SIDE_ACTIONS";
  if (/^0Z/i.test(id)) return "CONTROL_HUB";

  if (/^1A1/i.test(id)) return "MINIMAP_BASE";
  if (/^1A/i.test(id)) return "MINIMAP_PLUGINS";
  if (/^1B/i.test(id)) return "MM_FEATURE_UI";

  if (/^1/i.test(id)) return "ANSWERS_UI";
  if (/^2/i.test(id)) return "QUESTIONS_UI";
  if (/^3Z/i.test(id) || /^4/i.test(id)) return "WORKSPACE";
  if (/^3/i.test(id)) return "DOCK_ENGINES_TABS";
  if (/^5/i.test(id)) return "EXPORT";
  if (/^6/i.test(id)) return "UTILITIES";
  if (/^7/i.test(id)) return "PROMPTS";
  if (/^8/i.test(id)) return "THEMES_SKINS";
  if (/^9/i.test(id)) return "INTERFACE";
  if (/^X/i.test(id)) return "EXPERIMENTAL";

  return "OTHER";
}

const SECTIONS = [
  {
    key: "CORE",
    title: "🧠 CORE",
    header: ["# =========================", "# 🧠 CORE", "# ========================="],
  },
  {
    key: "UNMOUNT_PAGINATION",
    title: "🪟 CHAT FLOW",
    header: [
      "# =========================",
      "# 🪟 CHAT FLOW",
      "# =========================",
    ],
  },
  {
    key: "PERFORMANCE",
    title: "⚡ PERFORMANCE",
    header: ["# =========================", "# ⚡ PERFORMANCE", "# ========================="],
  },
  {
    key: "DATA",
    title: "🗄️ DATA",
    header: ["# =========================", "# 🗄️ DATA", "# ========================="],
  },
  {
    key: "COMMAND_BAR_SIDE_ACTIONS",
    title: "🎛️ SYSTEM SURFACES",
    header: [
      "# =========================",
      "# 🎛️ SYSTEM SURFACES",
      "# =========================",
    ],
  },
  {
    key: "CONTROL_HUB",
    title: "🕹️ CONTROL HUB",
    header: ["# =========================", "# 🕹️ CONTROL HUB", "# ========================="],
  },
  {
    key: "MINIMAP_BASE",
    title: "🗺️ MINIMAP BASE",
    header: ["# =========================", "# 🗺️ MINIMAP BASE", "# ========================="],
  },
  {
    key: "MINIMAP_PLUGINS",
    title: "🧩 MM ADD-ONS + PLUGINS",
    header: [
      "# =========================",
      "# 🧩 MM ADD-ONS + PLUGINS",
      "# =========================",
    ],
  },
  {
    key: "MM_FEATURE_UI",
    title: "🖱️ MM FEATURE UI",
    header: ["# =========================", "# 🖱️ MM FEATURE UI", "# ========================="],
  },
  {
    key: "ANSWERS_UI",
    title: "🧱 ANSWER UI",
    header: ["# =========================", "# 🧱 ANSWER UI", "# ========================="],
  },
  {
    key: "QUESTIONS_UI",
    title: "❓ QUESTION UI",
    header: ["# =========================", "# ❓ QUESTION UI", "# ========================="],
  },
  {
    key: "DOCK_ENGINES_TABS",
    title: "🧱 DOCK",
    header: [
      "# =========================",
      "# 🧱 DOCK",
      "# =========================",
    ],
  },
  {
    key: "WORKSPACE",
    title: "🧱 WORKSPACE",
    header: ["# =========================", "# 🧱 WORKSPACE", "# ========================="],
  },
  {
    key: "EXPORT",
    title: "📤 EXPORT",
    header: ["# =========================", "# 📤 EXPORT", "# ========================="],
  },
  {
    key: "UTILITIES",
    title: "🧰 UTILITIES + PORTALS + SECTIONS",
    header: [
      "# =========================",
      "# 🧰 UTILITIES + PORTALS + SECTIONS",
      "# =========================",
    ],
  },
  {
    key: "PROMPTS",
    title: "📝 PROMPTS",
    header: ["# =========================", "# 📝 PROMPTS", "# ========================="],
  },
  {
    key: "THEMES_SKINS",
    title: "🎨 THEMES + SKINS + INPUT",
    header: ["# =========================", "# 🎨 THEMES + SKINS + INPUT", "# ========================="],
  },
  {
    key: "INTERFACE",
    title: "🖥️ INTERFACE",
    header: ["# =========================", "# 🖥️ INTERFACE", "# ========================="],
  },
  {
    key: "EXPERIMENTAL",
    title: "🧪 EXPERIMENTAL",
    header: [
      "# =========================",
      "# 🧪 EXPERIMENTAL",
      "# =========================",
    ],
  },
  {
    key: "OTHER",
    title: "📦 OTHER",
    header: ["# =========================", "# 📦 OTHER", "# ========================="],
  },
];

function defaultStatusForGroup(groupKey) {
  return (groupKey === "INTERFACE" || groupKey === "EXPERIMENTAL") ? "OFF" : "ON";
}

function buildSectionHeader(titleRaw) {
  const title = String(titleRaw || "").trim();
  return ["# =========================", `# ${title}`, "# ========================="];
}

function resolveSections(sectionTitleMap) {
  return SECTIONS.map((sec) => ({
    key: sec.key,
    title: String(sectionTitleMap?.get(sec.key) || sec.title || "").trim() || sec.title,
  }));
}

/* -----------------------------
   Writers
------------------------------ */

function writeTSV({ fp, sections, sectioned, statusMap }) {
  const out = [];

  out.push(`# H2O dev order (source filenames) — TSV (sectioned)`);
  out.push(`# MASTER: ${path.basename(fp)}`);
  out.push(
    `# STATUS<TAB>FILENAME   (STATUS = 🟢/🔴; accepts ON/OFF, ✅/❌, 🟩/🟥 when reading)`
  );
  out.push("");

  for (const sec of sections) {
    const list = sectioned.get(sec.key) || [];
    if (!list.length) continue;

    out.push(...buildSectionHeader(sec.title));

    for (const file of list) {
      const st = statusMap.get(file) || "ON"; // internal ON/OFF
      out.push(`${statusToEmoji(st)}\t${file}`);
    }

    out.push("");
  }

  writeTextFileAtomic(fp, out.join("\n") + "\n");
}

function writeTXT({ fp, sections, sectioned, statusMap }) {
  const out = [];
  out.push(`# H2O dev order (source filenames) — TXT (sectioned) — GENERATED`);
  out.push(`# Master is ${path.basename(OUT_TSV)}`);
  out.push(`# ON  = normal line`);
  out.push(`# OFF = starts with "- " (dash + space)`);
  out.push("");

  for (const sec of sections) {
    const list = sectioned.get(sec.key) || [];
    if (!list.length) continue;

    out.push(...buildSectionHeader(sec.title));

    for (const file of list) {
      const st = statusMap.get(file) || "ON";
      const pref = st === "OFF" ? "- " : "";
      out.push(`${pref}${file}`);
    }

    out.push("");
  }

  writeTextFileAtomic(fp, out.join("\n") + "\n");
}

function writeJSON({ fp, sections, sectioned, statusMap }) {
  const obj = {
    version: 1,
    format: "h2o-dev-order",
    master: path.basename(OUT_TSV),
    notes: [
      "TSV is the master editable file.",
      "enabled=true means ON; enabled=false means OFF.",
      "file is the real source filename from scripts/, not the derived alias filename.",
      "TSV status is written as 🟢/🔴 but parsed into ON/OFF internally.",
    ],
    sections: [],
  };

  for (const sec of sections) {
    const list = sectioned.get(sec.key) || [];
    if (!list.length) continue;

    obj.sections.push({
      key: sec.key,
      title: sec.title,
      items: list.map((file) => ({
        file,
        enabled: (statusMap.get(file) || "ON") === "ON",
      })),
    });
  }

  writeTextFileAtomic(fp, JSON.stringify(obj, null, 2) + "\n");
}

function writeScriptsListTSV({ fp, names }) {
  const out = [];
  out.push("# H2O scripts list (raw filenames) — TSV — GENERATED");
  out.push(`# Source dir: ${path.relative(SRC_ROOT, SCRIPT_SRC_DIR) || "."}`);
  out.push("# Column: filename");
  out.push("");

  for (const name of names) out.push(name);

  writeTextFileAtomic(fp, out.join("\n") + "\n");
}

function normalizeNewlines(text) {
  return String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function sanitizeTSVValueLine(text) {
  return String(text || "").replace(/\t/g, "    ");
}

function readUserscriptHeaderBlock(fp) {
  const txt = fs.readFileSync(fp, "utf8");
  const match = txt.match(USERSCRIPT_HEADER_RE);
  return match ? normalizeNewlines(match[0]) : "";
}

function writeUserscriptHeadersTSV({ fp, names }) {
  const out = [];
  let missingCount = 0;

  out.push("# H2O userscript headers — TSV — GENERATED");
  out.push(`# Source dir: ${path.relative(SRC_ROOT, SCRIPT_SRC_DIR) || "."}`);
  out.push("# Layout per block:");
  out.push("#   <filename>");
  out.push("#");
  out.push("#   \t// ==UserScript==");
  out.push("#   \t// ...");
  out.push("#   \t// ==/UserScript==");
  out.push("");

  for (const name of names) {
    logDebug(`headers TSV: read ${name}`);
    const absPath = path.join(SCRIPT_SRC_DIR, name);
    const headerBlock = readUserscriptHeaderBlock(absPath);
    const headerLines = headerBlock ? headerBlock.split("\n") : [];

    if (!headerLines.length) {
      missingCount += 1;
      out.push(name);
      out.push("");
      out.push("\t<missing userscript header>");
      out.push("");
      continue;
    }

    out.push(name);
    out.push("");
    for (let i = 0; i < headerLines.length; i += 1) {
      out.push(`\t${sanitizeTSVValueLine(headerLines[i])}`);
    }
    out.push("");
  }

  writeTextFileAtomic(fp, out.join("\n") + "\n");
  return { missingCount };
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function lineClassForHeader(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return "line-blank";
  if (/^\/\/\s*==/.test(trimmed)) return "line-marker";
  const m = trimmed.match(/^\/\/\s+@([^\s]+)/);
  if (!m) return "line-other";
  const key = String(m[1] || "").toLowerCase();
  if (key === "h2o-id") return "line-id";
  if (key === "name") return "line-name";
  if (key === "namespace") return "line-namespace";
  if (key === "author") return "line-author";
  if (key === "version") return "line-version";
  if (key === "revision") return "line-revision";
  if (key === "build") return "line-build";
  if (key === "description") return "line-description";
  return "line-other";
}

function writeUserscriptHeadersHTML({ fp, names }) {
  const blocks = [];
  let missingCount = 0;

  for (const name of names) {
    logDebug(`headers HTML: read ${name}`);
    const absPath = path.join(SCRIPT_SRC_DIR, name);
    const headerBlock = readUserscriptHeaderBlock(absPath);
    const headerLines = headerBlock ? headerBlock.split("\n") : [];
    if (!headerLines.length) {
      missingCount += 1;
      blocks.push(`
        <section class="script-block">
          <h2>${escapeHtml(name)}</h2>
          <pre class="header-lines"><div class="line line-missing">&lt;missing userscript header&gt;</div></pre>
        </section>
      `);
      continue;
    }

    const rendered = headerLines
      .map((line) => `<div class="line ${lineClassForHeader(line)}">${escapeHtml(line)}</div>`)
      .join("\n");

    blocks.push(`
      <section class="script-block">
        <h2>${escapeHtml(name)}</h2>
        <pre class="header-lines">${rendered}</pre>
      </section>
    `);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>H2O Userscript Headers</title>
  <style>
    :root {
      --bg: #f7f7f2;
      --panel: #fffdf7;
      --text: #1f2937;
      --muted: #4b5563;
      --marker: #0f766e;
      --id: #1d4ed8;
      --name: #047857;
      --namespace: #b45309;
      --author: #be123c;
      --version: #0369a1;
      --revision: #7c2d12;
      --build: #334155;
      --description: #14532d;
      --other: #374151;
      --missing: #b91c1c;
      --border: #d6d3d1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: "Atkinson Hyperlegible", "Lexend", "Segoe UI", "Verdana", sans-serif;
      line-height: 1.65;
      letter-spacing: 0.01em;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 1.45rem;
    }
    .note {
      margin: 0 0 20px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .script-block {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      margin: 0 0 14px;
    }
    .script-block h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 700;
    }
    pre.header-lines {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.92rem;
      font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", "Consolas", monospace;
      background: transparent;
    }
    .line { color: var(--other); }
    .line-blank { color: transparent; }
    .line-marker { color: var(--marker); font-weight: 700; }
    .line-id { color: var(--id); }
    .line-name { color: var(--name); font-weight: 700; }
    .line-namespace { color: var(--namespace); }
    .line-author { color: var(--author); }
    .line-version { color: var(--version); }
    .line-revision { color: var(--revision); font-weight: 700; }
    .line-build { color: var(--build); }
    .line-description { color: var(--description); }
    .line-missing { color: var(--missing); font-weight: 700; }
  </style>
</head>
<body>
  <h1>H2O Userscript Headers</h1>
  <p class="note">Generated by sync-dev-order. Source: ${escapeHtml(path.relative(SRC_ROOT, SCRIPT_SRC_DIR) || ".")}</p>
  ${blocks.join("\n")}
</body>
</html>
`;

  writeTextFileAtomic(fp, html);
  return { missingCount };
}

function sortScriptName(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/* -----------------------------
   Main
------------------------------ */

logDebug(`start SRC_ROOT=${SRC_ROOT}`);
logDebug(`start ORDER_FILE=${ORDER_FILE}`);
logDebug(`start SCRIPT_SRC_DIR=${SCRIPT_SRC_DIR}`);

// 1) Scan source folder for real scripts
const foundSourceNames = new Set();
const rawScriptNames = new Set();
const aliasToSource = new Map();
for (const entry of fs.readdirSync(SCRIPT_SRC_DIR, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".DS_Store") continue;
  if (!isSourceScriptName(entry.name)) continue;

  foundSourceNames.add(entry.name);
  rawScriptNames.add(entry.name);

  const alias = toAliasName(entry.name);
  if (alias && !aliasToSource.has(alias)) aliasToSource.set(alias, entry.name);
}
logDebug(`scan done: sourceFiles=${foundSourceNames.size} aliases=${aliasToSource.size}`);

// 2) Read prior statuses + section order from existing TSV (master)
const priorState = readExistingTSV(OUT_TSV, foundSourceNames, aliasToSource);
const priorStatus = priorState.statusMap;
const priorSectionOrder = priorState.sectionOrderMap;
const sectionDefs = resolveSections(priorState.sectionTitleMap);
logDebug(`readExistingTSV done: statuses=${priorStatus.size}`);

// 3) Build statusMap for current source filenames, preserving previous where possible
const statusMap = new Map();
for (const file of foundSourceNames) {
  const groupKey = groupOf(file);
  const prev = priorStatus.get(file);
  statusMap.set(file, prev || defaultStatusForGroup(groupKey));
}

// 4) Section + order
const sectioned = new Map();
for (const sec of sectionDefs) sectioned.set(sec.key, []);

const sorted = Array.from(foundSourceNames).sort((a, b) =>
  sortKey(a).localeCompare(sortKey(b))
);

const sortedRawNames = Array.from(rawScriptNames).sort(sortScriptName);
logDebug(`sort done: sortedAliases=${sorted.length} sortedRaw=${sortedRawNames.length}`);

for (const sec of sectionDefs) {
  const secKey = sec.key;
  const priorList = (priorSectionOrder.get(secKey) || []).filter(
    (file) => foundSourceNames.has(file) && groupOf(file) === secKey
  );
  const seen = new Set(priorList);
  const appendedNew = sorted.filter(
    (file) => groupOf(file) === secKey && !seen.has(file)
  );
  sectioned.set(secKey, [...priorList, ...appendedNew]);
}

for (const file of sorted) {
  const g = groupOf(file);
  if (!sectioned.has(g)) sectioned.set(g, []);
  const list = sectioned.get(g);
  if (!list.includes(file)) list.push(file);
}

// 5) Write master TSV + generated views
logDebug("write phase: dev-order.tsv");
writeTSV({ fp: OUT_TSV, sections: sectionDefs, sectioned, statusMap });
logDebug("write phase: dev-order.txt");
writeTXT({ fp: OUT_TXT, sections: sectionDefs, sectioned, statusMap });
logDebug("write phase: dev-order.json");
writeJSON({ fp: OUT_JSON, sections: sectionDefs, sectioned, statusMap });
logDebug("write phase: scripts-list.tsv");
writeScriptsListTSV({ fp: OUT_SCRIPTS_LIST_TSV, names: sortedRawNames });
logDebug("write phase: userscript-headers.tsv");
const headerTSV = writeUserscriptHeadersTSV({
  fp: OUT_USERSCRIPT_HEADERS_TSV,
  names: sortedRawNames,
});
logDebug("write phase: userscript-headers.html");
const headerHTML = writeUserscriptHeadersHTML({
  fp: OUT_USERSCRIPT_HEADERS_HTML,
  names: sortedRawNames,
});
logDebug("all writes done");

console.log("[H2O] sync-dev-order done");
console.log("[H2O] SRC:", SRC_ROOT);
console.log("[H2O] scripts dir:", SCRIPT_SRC_DIR);
console.log("[H2O] wrote TSV:", OUT_TSV);
console.log("[H2O] wrote TXT:", OUT_TXT);
console.log("[H2O] wrote JSON:", OUT_JSON);
console.log("[H2O] wrote scripts list TSV:", OUT_SCRIPTS_LIST_TSV);
console.log("[H2O] wrote userscript headers TSV:", OUT_USERSCRIPT_HEADERS_TSV);
console.log("[H2O] wrote userscript headers HTML:", OUT_USERSCRIPT_HEADERS_HTML);
if (headerTSV.missingCount > 0) {
  console.warn(`[H2O] WARNING: missing UserScript header in ${headerTSV.missingCount} file(s).`);
}
if (headerHTML.missingCount > 0) {
  console.warn(`[H2O] WARNING: missing UserScript header in ${headerHTML.missingCount} file(s).`);
}
console.log("[H2O] entries:", sorted.length);
logDebug("complete");
