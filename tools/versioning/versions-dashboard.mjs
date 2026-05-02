// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

const INPUT_SHIP_CSV = path.join(REPO_ROOT, "versions.csv");
const INPUT_EDIT_CSV = path.join(REPO_ROOT, "meta", "ledger", "edits.csv");
const INPUT_EDIT_V2_CSV = path.join(REPO_ROOT, "meta", "ledger", "edits.v2.csv");

const META_LEDGER_DIR = path.join(REPO_ROOT, "meta", "ledger");
const META_REPORTS_DIR = path.join(REPO_ROOT, "meta", "reports");

const OUT_LATEST_CSV = path.join(META_LEDGER_DIR, "versions-latest.csv");
const OUT_LATEST_MD = path.join(META_REPORTS_DIR, "versions-latest.md");
const OUT_HTML = path.join(META_REPORTS_DIR, "versions.html");

const REQUIRED_SHIP_HEADER = ["date", "script_id", "version", "bump", "summary"];
const REQUIRED_EDIT_HEADER = ["ts", "kind", "script_id", "rel_path", "rev", "build", "note"];

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

function readFileOptional(filePath) {
  try {
    return String(fs.readFileSync(filePath, "utf8") || "").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
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
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
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
      if (text[i + 1] === "\n") continue;
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    fail("Malformed CSV: unmatched quote.");
  }

  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function analyzeHeader(headerRow, required, sourceName) {
  if (!headerRow) fail(`${sourceName} has no header row.`);
  if (headerRow.length < required.length) {
    fail(`${sourceName} header has ${headerRow.length} columns; expected at least ${required.length}.`);
  }
  for (let i = 0; i < required.length; i++) {
    if (headerRow[i] !== required[i]) {
      fail(
        `${sourceName} header mismatch at column ${i + 1}: got "${headerRow[i]}", expected "${required[i]}".`,
      );
    }
  }

  const idx = Object.create(null);
  headerRow.forEach((name, i) => {
    idx[name] = i;
  });

  return {
    rowWidth: headerRow.length,
    idx,
  };
}

function csvQuote(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows) {
  return `${rows.map((row) => row.map(csvQuote).join(",")).join("\n")}\n`;
}

function readShipRows() {
  const text = readFileRequired(INPUT_SHIP_CSV);
  const rows = parseCsv(text);
  if (!rows.length) fail("versions.csv has no rows.");

  const header = analyzeHeader(rows[0], REQUIRED_SHIP_HEADER, "versions.csv");
  const commitShaIndex = Number.isInteger(header.idx.commit_sha) ? header.idx.commit_sha : -1;

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length !== header.rowWidth) {
      fail(`versions.csv row ${i + 1} has ${row.length} columns; expected ${header.rowWidth}.`);
    }

    const obj = {
      date: row[header.idx.date],
      script_id: row[header.idx.script_id],
      version: row[header.idx.version],
      bump: row[header.idx.bump],
      summary: row[header.idx.summary],
      commit_sha: commitShaIndex >= 0 ? String(row[commitShaIndex] || "") : "",
      _rowIndex: i,
    };

    if (!obj.script_id) fail(`versions.csv row ${i + 1} is missing script_id.`);
    out.push(obj);
  }

  if (!out.length) fail("versions.csv contains only a header and no SHIP rows.");
  return out;
}

function readEditRowsOptional() {
  const editInput = resolveEditInputPath();
  const sourceName = displayPath(editInput);
  const text = readFileOptional(editInput);
  if (!String(text).trim()) return [];

  const rows = parseCsv(text);
  if (!rows.length) return [];

  const header = analyzeEditHeader(rows[0], sourceName);

  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.length || (row.length === 1 && row[0] === "")) continue;
    if (row.length !== header.rowWidth) {
      fail(`${sourceName} row ${i + 1} has ${row.length} columns; expected ${header.rowWidth}.`);
    }

    const obj = {
      ts: row[header.idx.ts],
      kind: String(row[header.idx.kind] || "EDIT"),
      script_id: row[header.idx.script_id],
      rel_path: row[header.idx.rel_path],
      rev: row[header.idx.rev],
      build: row[header.idx.build],
      note: row[header.idx.note],
      msg: header.hasMsg ? String(row[header.idx.msg] || "") : "",
      _rowIndex: i,
    };

    if (!obj.script_id) fail(`${sourceName} row ${i + 1} is missing script_id.`);
    out.push(obj);
  }

  return out;
}

function resolveEditInputPath() {
  if (fs.existsSync(INPUT_EDIT_V2_CSV)) return INPUT_EDIT_V2_CSV;
  return INPUT_EDIT_CSV;
}

function analyzeEditHeader(headerRow, sourceName) {
  const base = analyzeHeader(headerRow, REQUIRED_EDIT_HEADER, sourceName);
  const hasMsg = Number.isInteger(base.idx.msg);
  return {
    ...base,
    hasMsg,
  };
}

function pickLatestRows(shipRows) {
  const byScript = new Map();

  for (const row of shipRows) {
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

function normalizeShipTs(dateValue) {
  const s = String(dateValue || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return s.replace(/\.\d{3}Z$/, "Z");
  }
  return `${s}T00:00:00Z`;
}

function toTimestampNumber(isoTs) {
  const n = Date.parse(String(isoTs || ""));
  return Number.isFinite(n) ? n : 0;
}

function buildTimelineEvents(shipRows, editRows) {
  const events = [];

  for (const row of shipRows) {
    events.push({
      ts: normalizeShipTs(row.date),
      kind: "SHIP",
      script_id: row.script_id,
      rev: "",
      build: "",
      version: row.version,
      bump: row.bump,
      summary_note: row.summary,
      rel_path: "",
      _order: row._rowIndex,
    });
  }

  for (const row of editRows) {
    events.push({
      ts: String(row.ts || "").replace(/\.\d{3}Z$/, "Z"),
      kind: String(row.kind || "EDIT") || "EDIT",
      script_id: row.script_id,
      rev: row.rev,
      build: row.build,
      version: "",
      bump: "",
      summary_note: row.msg || row.note,
      rel_path: row.rel_path,
      _order: 1_000_000 + row._rowIndex,
    });
  }

  events.sort((a, b) => {
    const ta = toTimestampNumber(a.ts);
    const tb = toTimestampNumber(b.ts);
    if (tb !== ta) return tb - ta;
    return b._order - a._order;
  });

  return events;
}

function escapeMd(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function escapeMdExceptLinks(value) {
  const s = String(value ?? "");
  if (/^\[[^\]]+\]\([^)]+\)$/.test(s)) return s;
  return escapeMd(s);
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

function renderHtmlTimeline(events, generatedAtIso) {
  const json = JSON.stringify(events);
  const serverRowsHtml = events
    .map((row) => {
      const kind = String(row.kind || "").toUpperCase();
      const kindClass = kind === "SHIP" ? "ship" : "edit";
      const bump = String(row.bump || "").toLowerCase();
      const bumpClass = ["major", "minor", "patch"].includes(bump) ? bump : "";
      const bumpHtml = bump
        ? `<span class="bump ${bumpClass}">${escapeHtml(bump)}</span>`
        : "";

      return [
        "<tr>",
        `<td><code>${escapeHtml(row.ts || "")}</code></td>`,
        `<td><span class="kind ${kindClass}">${escapeHtml(kind || "")}</span></td>`,
        `<td><code>${escapeHtml(row.script_id || "")}</code></td>`,
        `<td><code>${escapeHtml(row.rev || "")}</code></td>`,
        `<td><code>${escapeHtml(row.build || "")}</code></td>`,
        `<td><code>${escapeHtml(row.version || "")}</code></td>`,
        `<td>${bumpHtml}</td>`,
        `<td class="summary">${escapeHtml(row.summary_note || "")}</td>`,
        `<td class="rel">${escapeHtml(row.rel_path || "")}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Version Timeline</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1115;
      --panel: #171a21;
      --line: #2a3140;
      --text: #e9edf5;
      --muted: #9aa5b6;
      --accent: #7cc4ff;
      --ship: #5eb2ff;
      --edit: #6ee7a5;
      --major: #ff6b6b;
      --minor: #ffd166;
      --patch: #72e3a6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(180deg, #0d1016 0%, #121721 100%);
      color: var(--text);
    }
    .wrap {
      max-width: 1450px;
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
      max-width: 520px;
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
      min-width: 1300px;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: top;
      text-align: left;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      background: #1a202b;
      z-index: 1;
      font-weight: 600;
    }
    .muted { color: var(--muted); }
    .kind {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .02em;
    }
    .kind.ship { color: #071d31; background: var(--ship); }
    .kind.edit { color: #082213; background: var(--edit); }
    .bump {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: lowercase;
    }
    .bump.major { color: #1a0d0d; background: var(--major); }
    .bump.minor { color: #2f2400; background: var(--minor); }
    .bump.patch { color: #062212; background: var(--patch); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: #c9e2ff;
    }
    .summary {
      white-space: normal;
      min-width: 280px;
      max-width: 420px;
    }
    .rel {
      white-space: normal;
      min-width: 240px;
      max-width: 360px;
      color: var(--muted);
    }
    .empty {
      padding: 16px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Version Timeline</h1>
    <div class="meta">Generated <code>${escapeHtml(generatedAtIso)}</code> • <span id="countMeta">${events.length}</span> events</div>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Search script_id, summary/note, path, kind..." autocomplete="off">
      <div id="resultCount" class="muted">${events.length} shown</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ts</th>
            <th>kind</th>
            <th>script_id</th>
            <th>rev</th>
            <th>build</th>
            <th>version</th>
            <th>bump</th>
            <th>summary/note</th>
            <th>rel_path</th>
          </tr>
        </thead>
        <tbody id="rows">${serverRowsHtml}</tbody>
      </table>
      <div id="empty" class="empty"${events.length === 0 ? "" : " hidden"}>No matching rows.</div>
    </div>
  </div>
  <script id="timeline-data" type="application/json">${escapeJsonForScriptTag(json)}</script>
  <script>
  (() => {
    const rowsEl = document.getElementById("rows");
    const emptyEl = document.getElementById("empty");
    const searchEl = document.getElementById("search");
    const resultCountEl = document.getElementById("resultCount");
    const raw = document.getElementById("timeline-data").textContent || "[]";

    let data = [];
    try {
      data = JSON.parse(raw);
    } catch {
      data = [];
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function render(filtered) {
      rowsEl.innerHTML = "";
      for (const row of filtered) {
        const kind = String(row.kind || "").toUpperCase();
        const kindClass = kind === "SHIP" ? "ship" : "edit";
        const bump = String(row.bump || "").toLowerCase();
        const bumpClass = ["major", "minor", "patch"].includes(bump) ? bump : "";

        const tr = document.createElement("tr");
        tr.innerHTML = [
          "<td><code>" + escapeHtml(row.ts || "") + "</code></td>",
          "<td><span class=\"kind " + kindClass + "\">" + escapeHtml(kind || "") + "</span></td>",
          "<td><code>" + escapeHtml(row.script_id || "") + "</code></td>",
          "<td><code>" + escapeHtml(row.rev || "") + "</code></td>",
          "<td><code>" + escapeHtml(row.build || "") + "</code></td>",
          "<td><code>" + escapeHtml(row.version || "") + "</code></td>",
          "<td>" + (bump ? ("<span class=\"bump " + bumpClass + "\">" + escapeHtml(bump) + "</span>") : "") + "</td>",
          "<td class=\"summary\">" + escapeHtml(row.summary_note || "") + "</td>",
          "<td class=\"rel\">" + escapeHtml(row.rel_path || "") + "</td>",
        ].join("");
        rowsEl.appendChild(tr);
      }

      emptyEl.hidden = filtered.length !== 0;
      resultCountEl.textContent = filtered.length + " shown";
    }

    function applyFilter() {
      const q = String(searchEl.value || "").trim().toLowerCase();
      if (!q) {
        render(data);
        return;
      }

      const filtered = data.filter((row) => {
        return String(row.ts || "").toLowerCase().includes(q)
          || String(row.kind || "").toLowerCase().includes(q)
          || String(row.script_id || "").toLowerCase().includes(q)
          || String(row.rev || "").toLowerCase().includes(q)
          || String(row.build || "").toLowerCase().includes(q)
          || String(row.version || "").toLowerCase().includes(q)
          || String(row.bump || "").toLowerCase().includes(q)
          || String(row.summary_note || "").toLowerCase().includes(q)
          || String(row.rel_path || "").toLowerCase().includes(q);
      });

      render(filtered);
    }

    searchEl.addEventListener("input", applyFilter);
    render(data);
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

  const shipRows = readShipRows();
  const editRows = readEditRowsOptional();
  const latestRows = pickLatestRows(shipRows);
  const timelineEvents = buildTimelineEvents(shipRows, editRows);
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
  writeFile(OUT_HTML, renderHtmlTimeline(timelineEvents, generatedAtIso));

  console.log(`[versions:build] SHIP rows: ${shipRows.length}`);
  console.log(`[versions:build] EDIT rows: ${editRows.length}`);
  console.log(`[versions:build] timeline events: ${timelineEvents.length}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_LATEST_CSV)}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_LATEST_MD)}`);
  console.log(`[versions:build] wrote ${displayPath(OUT_HTML)}`);
}

main();
