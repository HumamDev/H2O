import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..");

const INPUT_CSV = path.join(REPO_ROOT, "versions.csv");
const META_LEDGER_DIR = path.join(REPO_ROOT, "meta", "ledger");
const META_REPORTS_DIR = path.join(REPO_ROOT, "meta", "reports");
const OUT_LATEST_CSV = path.join(META_LEDGER_DIR, "versions-latest.csv");
const OUT_LATEST_MD = path.join(META_REPORTS_DIR, "versions-latest.md");
const OUT_HTML = path.join(META_REPORTS_DIR, "versions.html");

const SOURCE_HEADER = ["date", "script_id", "version", "bump", "summary", "commit_sha"];
const LATEST_HEADER = [
  "script_id",
  "latest_version",
  "last_bump",
  "last_date",
  "last_summary",
  "last_commit_sha",
  "changelog_path",
];

function fail(message) {
  console.error(`[versions:build] ERROR ${message}`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readFileRequired(filePath) {
  let text = "";
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`Missing or unreadable file: ${displayPath(filePath)} (${error?.message || "unknown error"})`);
  }

  if (!String(text).trim()) {
    fail(`${displayPath(filePath)} is empty.`);
  }

  return String(text).replace(/^\uFEFF/, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };

  const pushRow = () => {
    if (row.length === 1 && row[0] === "" && rows.length === 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (ch === "\r") {
      if (text[i + 1] === "\n") {
        continue;
      }
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    fail("Malformed CSV: unmatched quote in versions.csv.");
  }

  const hasTrailingData = field.length > 0 || row.length > 0;
  if (hasTrailingData) {
    pushField();
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function validateSourceHeader(headerRow) {
  if (!headerRow) {
    fail("versions.csv has no header row.");
  }
  if (headerRow.length !== SOURCE_HEADER.length) {
    fail(`versions.csv header has ${headerRow.length} columns; expected ${SOURCE_HEADER.length}.`);
  }
  for (let i = 0; i < SOURCE_HEADER.length; i++) {
    if (headerRow[i] !== SOURCE_HEADER[i]) {
      fail(
        `versions.csv header mismatch at column ${i + 1}: got "${headerRow[i]}", expected "${SOURCE_HEADER[i]}".`,
      );
    }
  }
}

function csvQuote(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvQuote).join(",")).join("\n")}\n`;
}

function readReleaseRows() {
  const text = readFileRequired(INPUT_CSV);
  const rows = parseCsv(text);
  if (rows.length === 0) {
    fail("versions.csv has no rows.");
  }

  validateSourceHeader(rows[0]);

  const dataRows = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 1 && row[0] === "") continue;
    if (row.length !== SOURCE_HEADER.length) {
      fail(`versions.csv row ${i + 1} has ${row.length} columns; expected ${SOURCE_HEADER.length}.`);
    }
    const obj = {
      date: row[0],
      script_id: row[1],
      version: row[2],
      bump: row[3],
      summary: row[4],
      commit_sha: row[5],
      _rowIndex: i,
    };
    if (!obj.script_id) {
      fail(`versions.csv row ${i + 1} is missing script_id.`);
    }
    dataRows.push(obj);
  }

  if (dataRows.length === 0) {
    fail("versions.csv contains only a header and no release rows.");
  }

  return dataRows;
}

function pickLatestRows(releaseRows) {
  const byScript = new Map();

  for (const row of releaseRows) {
    const best = byScript.get(row.script_id);
    if (!best) {
      byScript.set(row.script_id, row);
      continue;
    }

    if (row.date > best.date) {
      byScript.set(row.script_id, row);
      continue;
    }

    if (row.date === best.date && row._rowIndex > best._rowIndex) {
      byScript.set(row.script_id, row);
    }
  }

  return [...byScript.values()]
    .map((row) => ({
      script_id: row.script_id,
      latest_version: row.version,
      last_bump: row.bump,
      last_date: row.date,
      last_summary: row.summary,
      last_commit_sha: row.commit_sha,
      changelog_path: `changelogs/${row.script_id}.CHANGELOG.md`,
    }))
    .sort((a, b) => a.script_id.localeCompare(b.script_id, undefined, { numeric: true }));
}

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function renderMarkdown(rows, generatedAtIso) {
  const lines = [];
  lines.push("# Versions Latest");
  lines.push("");
  lines.push(`Generated: \`${generatedAtIso}\``);
  lines.push(`Total scripts: **${rows.length}**`);
  lines.push("");
  lines.push(`| ${LATEST_HEADER.join(" | ")} |`);
  lines.push(`| ${LATEST_HEADER.map(() => "---").join(" | ")} |`);

  for (const row of rows) {
    const visiblePath = row.changelog_path;
    const mdLinkTarget = `../../${row.changelog_path}`;
    const cells = [
      row.script_id,
      row.latest_version,
      row.last_bump,
      row.last_date,
      row.last_summary,
      row.last_commit_sha,
      `[${escapeMd(visiblePath)}](${mdLinkTarget})`,
    ];
    lines.push(`| ${cells.map(escapeMdExceptLinks).join(" | ")} |`);
  }

  return `${lines.join("\n")}\n`;
}

function escapeMdExceptLinks(value) {
  const s = String(value ?? "");
  if (/^\[[^\]]+\]\([^)]+\)$/.test(s)) return s;
  return escapeMd(s);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJsonForScriptTag(jsonText) {
  return String(jsonText).replace(/</g, "\\u003c");
}

function renderHtml(rows, generatedAtIso) {
  const dataset = rows.map((row) => ({
    ...row,
    changelog_href: `../../${row.changelog_path}`,
  }));
  const json = JSON.stringify(dataset);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Version Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --line: #2a3140;
      --text: #e9edf5;
      --muted: #9aa5b6;
      --accent: #7cc4ff;
      --major: #ff6b6b;
      --minor: #ffd166;
      --patch: #72e3a6;
      --chip-bg: #222836;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(180deg, #0d1016 0%, #121721 100%);
      color: var(--text);
    }
    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 16px 32px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 22px;
      letter-spacing: 0.02em;
    }
    .meta {
      color: var(--muted);
      margin-bottom: 14px;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    .toolbar input {
      width: 100%;
      max-width: 420px;
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      outline: none;
    }
    .toolbar input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(124,196,255,0.15);
    }
    .table-wrap {
      background: rgba(23,26,33,0.75);
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 980px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: top;
      text-align: left;
    }
    th {
      position: sticky;
      top: 0;
      background: #1a202b;
      z-index: 1;
      font-weight: 600;
    }
    th button {
      all: unset;
      cursor: pointer;
      color: var(--text);
    }
    th button:hover {
      color: var(--accent);
    }
    .muted { color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--chip-bg);
      border: 1px solid rgba(255,255,255,0.06);
      text-transform: lowercase;
    }
    .badge.major { color: #1a0d0d; background: var(--major); border-color: transparent; }
    .badge.minor { color: #2f2400; background: var(--minor); border-color: transparent; }
    .badge.patch { color: #062212; background: var(--patch); border-color: transparent; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #c9e2ff;
    }
    .empty {
      padding: 16px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Version Dashboard</h1>
    <div class="meta">Generated <code>${escapeHtml(generatedAtIso)}</code> • <span id="countMeta">${rows.length}</span> scripts</div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search script_id or summary…" autocomplete="off">
      <div id="resultCount" class="muted"></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th><button type="button" data-sort-key="script_id">script_id</button></th>
            <th><button type="button" data-sort-key="latest_version">latest_version</button></th>
            <th><button type="button" data-sort-key="last_bump">last_bump</button></th>
            <th><button type="button" data-sort-key="last_date">last_date</button></th>
            <th>last_summary</th>
            <th>last_commit_sha</th>
            <th>changelog_path</th>
          </tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
      <div id="empty" class="empty" hidden>No matching rows.</div>
    </div>
  </div>
  <script id="version-data" type="application/json">${escapeJsonForScriptTag(json)}</script>
  <script>
  (() => {
    const rowsEl = document.getElementById("rows");
    const emptyEl = document.getElementById("empty");
    const searchEl = document.getElementById("search");
    const resultCountEl = document.getElementById("resultCount");
    const raw = document.getElementById("version-data").textContent || "[]";
    let data = [];
    try {
      data = JSON.parse(raw);
    } catch {
      data = [];
    }

    const state = { q: "", key: "script_id", dir: "asc" };

    function cmpText(a, b) {
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    }

    function bumpRank(v) {
      const s = String(v || "").toLowerCase();
      if (s === "major") return 3;
      if (s === "minor") return 2;
      if (s === "patch") return 1;
      return 0;
    }

    function cmpVersion(a, b) {
      const parse = (v) => {
        const m = String(v || "").match(/^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?(?:\\+([0-9A-Za-z.-]+))?$/);
        if (!m) return null;
        return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || "" };
      };
      const pa = parse(a);
      const pb = parse(b);
      if (!pa || !pb) return cmpText(a, b);
      if (pa.major !== pb.major) return pa.major - pb.major;
      if (pa.minor !== pb.minor) return pa.minor - pb.minor;
      if (pa.patch !== pb.patch) return pa.patch - pb.patch;
      if (pa.pre === pb.pre) return 0;
      if (!pa.pre) return 1;
      if (!pb.pre) return -1;
      return cmpText(pa.pre, pb.pre);
    }

    function compare(a, b) {
      let r = 0;
      if (state.key === "latest_version") r = cmpVersion(a.latest_version, b.latest_version);
      else if (state.key === "last_bump") r = bumpRank(a.last_bump) - bumpRank(b.last_bump);
      else if (state.key === "last_date") r = cmpText(a.last_date, b.last_date);
      else r = cmpText(a[state.key], b[state.key]);
      if (r === 0) r = cmpText(a.script_id, b.script_id);
      return state.dir === "asc" ? r : -r;
    }

    function badgeHtml(bump) {
      const value = String(bump || "");
      const cls = ["major", "minor", "patch"].includes(value) ? value : "";
      return '<span class="badge ' + cls + '">' + escapeHtml(value) + "</span>";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function render() {
      const q = state.q.trim().toLowerCase();
      const filtered = data.filter((row) => {
        if (!q) return true;
        return String(row.script_id || "").toLowerCase().includes(q) ||
               String(row.last_summary || "").toLowerCase().includes(q);
      }).sort(compare);

      rowsEl.innerHTML = "";
      for (const row of filtered) {
        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td><code>" + escapeHtml(row.script_id) + "</code></td>",
          "<td><code>" + escapeHtml(row.latest_version) + "</code></td>",
          "<td>" + badgeHtml(row.last_bump) + "</td>",
          "<td><code>" + escapeHtml(row.last_date) + "</code></td>",
          "<td>" + escapeHtml(row.last_summary) + "</td>",
          "<td><code>" + escapeHtml(row.last_commit_sha) + "</code></td>",
          '<td><a href="' + escapeHtml(row.changelog_href) + '" target="_blank" rel="noopener">Changelog</a></td>',
        ].join("");
        rowsEl.appendChild(tr);
      }

      emptyEl.hidden = filtered.length !== 0;
      resultCountEl.textContent = filtered.length + " shown";
    }

    searchEl.addEventListener("input", (e) => {
      state.q = e.target.value || "";
      render();
    });

    for (const btn of document.querySelectorAll("button[data-sort-key]")) {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-sort-key");
        if (!key) return;
        if (state.key === key) state.dir = state.dir === "asc" ? "desc" : "asc";
        else {
          state.key = key;
          state.dir = "asc";
        }
        render();
      });
    }

    render();
  })();
  </script>
</body>
</html>
`;
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function displayPath(filePath) {
  return path.relative(REPO_ROOT, filePath) || ".";
}

function main() {
  ensureDir(META_LEDGER_DIR);
  ensureDir(META_REPORTS_DIR);

  const releaseRows = readReleaseRows();
  const latestRows = pickLatestRows(releaseRows);
  const generatedAtIso = new Date().toISOString();

  const latestCsvRows = [
    LATEST_HEADER,
    ...latestRows.map((row) => [
      row.script_id,
      row.latest_version,
      row.last_bump,
      row.last_date,
      row.last_summary,
      row.last_commit_sha,
      row.changelog_path,
    ]),
  ];

  writeFile(OUT_LATEST_CSV, toCsv(latestCsvRows));
  writeFile(OUT_LATEST_MD, renderMarkdown(latestRows, generatedAtIso));
  writeFile(OUT_HTML, renderHtml(latestRows, generatedAtIso));

  console.log(`[versions:build] scripts processed: ${latestRows.length}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_LATEST_CSV)}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_LATEST_MD)}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_HTML)}`);
}

main();
