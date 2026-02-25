// tools/sync-dev-order.mjs
// @version 1.0.0
//
// Purpose:
// - Scan SRC for *.user.js
// - Convert real filenames -> alias filenames (same rule as make-aliases.mjs)
// - Maintain a sectioned, human-readable dev-order file
//
// Master format: TSV (editable)
//   STATUS<TAB>ALIAS_FILENAME
//   STATUS = 🟢 / 🔴
//   (Reader accepts: 🟢/🔴, ✅/❌, 🟩/🟥, ON/OFF, true/false, 1/0, yes/no)
//
// This script also emits beside it:
// - dev-order.txt (human list; OFF uses "- ")
// - dev-order.json (view; enabled boolean)
//
// Critical behavior:
// - PRESERVES your previous choices from the existing TSV
// - Adds new files with defaults (EXPERIMENTAL default 🔴, others 🟢)
// - Removes deleted files automatically (because we re-scan SRC each time)

import fs from "node:fs";
import path from "node:path";

/* -----------------------------
   ENV / PATHS
------------------------------ */

const SRC = process.env.H2O_SRC_DIR || process.cwd();
const ORDER_FILE =
  process.env.H2O_ORDER_FILE || path.join(SRC, "config", "dev-order.tsv");

const DIR = path.dirname(ORDER_FILE);
fs.mkdirSync(DIR, { recursive: true });

const BASE = path.basename(ORDER_FILE);
const STEM = BASE.replace(/\.(json|tsv|txt)$/i, "");

const OUT_TSV = path.join(DIR, `${STEM}.tsv`);
const OUT_TXT = path.join(DIR, `${STEM}.txt`);
const OUT_JSON = path.join(DIR, `${STEM}.json`);

/* -----------------------------
   Alias rules (must match make-aliases.mjs)
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

function isUserScriptName(n) {
  return /\.user\.js$/i.test(String(n || ""));
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

function readExistingTSV(fp) {
  const map = new Map(); // alias -> "ON" | "OFF"
  if (!fs.existsSync(fp)) return map;

  const txt = fs.readFileSync(fp, "utf8");
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;

    // allow inline comments (keeps your headers clean)
    const noInline = line.replace(/\s+#.*$/, "").trim();
    if (!noInline) continue;

    const parts = noInline.split("\t");
    if (parts.length < 2) continue;

    const status = emojiToStatus(parts[0]);
    const file = parts.slice(1).join("\t").trim();
    if (!file || !/\.user\.js$/i.test(file)) continue;

    if (status) map.set(file, status);
  }

  return map;
}

/* -----------------------------
   Sectioning / sorting
------------------------------ */

function sortKey(alias) {
  // alias like "0A1._Title_.user.js"
  const id = String(alias || "").split(".")[0] || alias;
  const m = id.match(/^(\d+)(.*)$/);
  const num = m ? Number(m[1]) : 9999;
  const tail = m ? m[2] : id;
  return `${String(num).padStart(4, "0")}:${tail}:${alias}`;
}

function groupOf(alias) {
  const id = String(alias || "").split(".")[0] || "";

  if (/^0A/i.test(id)) return "CORE";
  if (/^0B/i.test(id)) return "DATA";
  if (/^0Z/i.test(id)) return "CONTROL_HUB";

  if (/^1A1/i.test(id)) return "MINIMAP_BASE";
  if (/^1A(2|3|4|5|6|7)/i.test(id)) return "MINIMAP_PLUGINS";

  if (/^1(b|E|X|Z)/i.test(id)) return "ANSWERS_UI";
  if (/^2/i.test(id)) return "QUESTIONS_UI";
  if (/^3/i.test(id)) return "UTILITIES";
  if (/^4/i.test(id)) return "DOCK_ENGINES_TABS";
  if (/^(5|6)/i.test(id)) return "PROMPTS_EXPORT";

  if (/^(7|8|9|u|x|z|zh)/i.test(id)) return "EXPERIMENTAL";

  return "OTHER";
}

const SECTIONS = [
  {
    key: "CORE",
    title: "🧠 CORE",
    header: ["# =========================", "# 🧠 CORE", "# ========================="],
  },
  {
    key: "DATA",
    title: "🗄️ DATA",
    header: ["# =========================", "# 🗄️ DATA", "# ========================="],
  },
  {
    key: "CONTROL_HUB",
    title: "📍 CONTROL HUB",
    header: ["# =========================", "# 📍 CONTROL HUB", "# ========================="],
  },
  {
    key: "MINIMAP_BASE",
    title: "🗺️ MINIMAP (base)",
    header: ["# =========================", "# 🗺️ MINIMAP (base)", "# ========================="],
  },
  {
    key: "MINIMAP_PLUGINS",
    title: "🧩 MINIMAP (add-ons / plugins)",
    header: [
      "# =========================",
      "# 🧩 MINIMAP (add-ons / plugins)",
      "# =========================",
    ],
  },
  {
    key: "ANSWERS_UI",
    title: "🧱 ANSWERS (UI)",
    header: ["# =========================", "# 🧱 ANSWERS (UI)", "# ========================="],
  },
  {
    key: "QUESTIONS_UI",
    title: "❓ QUESTIONS (UI)",
    header: ["# =========================", "# ❓ QUESTIONS (UI)", "# ========================="],
  },
  {
    key: "UTILITIES",
    title: "🧰 UTILITIES / PORTALS",
    header: ["# =========================", "# 🧰 UTILITIES / PORTALS", "# ========================="],
  },
  {
    key: "DOCK_ENGINES_TABS",
    title: "🧩 DOCK + ENGINES + TABS",
    header: [
      "# =========================",
      "# 🧩 DOCK + ENGINES + TABS",
      "# =========================",
    ],
  },
  {
    key: "PROMPTS_EXPORT",
    title: "📝 PROMPTS / EXPORT",
    header: ["# =========================", "# 📝 PROMPTS / EXPORT", "# ========================="],
  },
  {
    key: "EXPERIMENTAL",
    title: "🧪 EXPERIMENTAL / OFF",
    header: [
      "# =========================",
      "# 🧪 EXPERIMENTAL / OFF",
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
  return groupKey === "EXPERIMENTAL" ? "OFF" : "ON";
}

/* -----------------------------
   Writers
------------------------------ */

function writeTSV({ fp, sectioned, statusMap }) {
  const out = [];

  out.push(`# H2O dev order (alias-only) — TSV (sectioned)`);
  out.push(`# MASTER: ${path.basename(fp)}`);
  out.push(
    `# STATUS<TAB>FILENAME   (STATUS = 🟢/🔴; accepts ON/OFF, ✅/❌, 🟩/🟥 when reading)`
  );
  out.push("");

  for (const sec of SECTIONS) {
    const list = sectioned.get(sec.key) || [];
    if (!list.length) continue;

    out.push(...sec.header);

    for (const file of list) {
      const st = statusMap.get(file) || "ON"; // internal ON/OFF
      out.push(`${statusToEmoji(st)}\t${file}`);
    }

    out.push("");
  }

  fs.writeFileSync(fp, out.join("\n") + "\n", "utf8");
}

function writeTXT({ fp, sectioned, statusMap }) {
  const out = [];
  out.push(`# H2O dev order (alias-only) — TXT (sectioned) — GENERATED`);
  out.push(`# Master is ${path.basename(OUT_TSV)}`);
  out.push(`# ON  = normal line`);
  out.push(`# OFF = starts with "- " (dash + space)`);
  out.push("");

  for (const sec of SECTIONS) {
    const list = sectioned.get(sec.key) || [];
    if (!list.length) continue;

    out.push(...sec.header);

    for (const file of list) {
      const st = statusMap.get(file) || "ON";
      const pref = st === "OFF" ? "- " : "";
      out.push(`${pref}${file}`);
    }

    out.push("");
  }

  fs.writeFileSync(fp, out.join("\n") + "\n", "utf8");
}

function writeJSON({ fp, sectioned, statusMap }) {
  const obj = {
    version: 1,
    format: "h2o-dev-order",
    master: path.basename(OUT_TSV),
    notes: [
      "TSV is the master editable file.",
      "enabled=true means ON; enabled=false means OFF.",
      "file is the alias filename, e.g. 0A1._H2O_Core_.user.js",
      "TSV status is written as 🟢/🔴 but parsed into ON/OFF internally.",
    ],
    sections: [],
  };

  for (const sec of SECTIONS) {
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

  fs.writeFileSync(fp, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

/* -----------------------------
   Main
------------------------------ */

// 1) Scan source folder for real scripts -> alias names
const foundAliases = new Set();
for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".DS_Store") continue;
  if (!isUserScriptName(entry.name)) continue;

  const alias = toAliasName(entry.name);
  if (alias) foundAliases.add(alias);
}

// 2) Read prior statuses from existing TSV (master) so choices persist
const priorStatus = readExistingTSV(OUT_TSV);

// 3) Build statusMap for current aliases, preserving previous where possible
const statusMap = new Map();
for (const file of foundAliases) {
  const groupKey = groupOf(file);
  const prev = priorStatus.get(file);
  statusMap.set(file, prev || defaultStatusForGroup(groupKey));
}

// 4) Section + sort
const sectioned = new Map();
for (const sec of SECTIONS) sectioned.set(sec.key, []);

const sorted = Array.from(foundAliases).sort((a, b) =>
  sortKey(a).localeCompare(sortKey(b))
);

for (const file of sorted) {
  const g = groupOf(file);
  if (!sectioned.has(g)) sectioned.set(g, []);
  sectioned.get(g).push(file);
}

// 5) Write master TSV + generated views
writeTSV({ fp: OUT_TSV, sectioned, statusMap });
writeTXT({ fp: OUT_TXT, sectioned, statusMap });
writeJSON({ fp: OUT_JSON, sectioned, statusMap });

console.log("[H2O] sync-dev-order done");
console.log("[H2O] SRC:", SRC);
console.log("[H2O] wrote TSV:", OUT_TSV);
console.log("[H2O] wrote TXT:", OUT_TXT);
console.log("[H2O] wrote JSON:", OUT_JSON);
console.log("[H2O] entries:", sorted.length);
