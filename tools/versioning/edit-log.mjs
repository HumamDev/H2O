#!/usr/bin/env node
// @version 1.0.0
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL_FILE = fileURLToPath(import.meta.url);
const TOOL_DIR = path.dirname(TOOL_FILE);
const REPO_ROOT = path.resolve(TOOL_DIR, "..", "..");

const USERSCRIPT_HEADER_RE = /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/;
const USERSCRIPT_PATH_RE = /^scripts\/.+\.user\.js$/i;
const SAFE_ID_RE = /^[a-z0-9._-]+$/;
const REV_LINE_RE = /^\s*\/\/\s*@revision\s+(\d+)\s*$/im;
const BUILD_LINE_RE = /^\s*\/\/\s*@build\s+(.+?)\s*$/im;
const H2O_ID_LINE_RE = /^\s*\/\/\s*@h2o-id\s+(.+?)\s*$/im;
const TYPE_PREFIX_RE = /^\s*(fix|feat|perf|refactor|chore)\s*:\s*(.*)$/i;
const FORCED_TYPES = new Set(["fix", "feat", "perf", "refactor", "chore"]);

const LEDGER_DIR = path.join(REPO_ROOT, "meta", "ledger");
const LEDGER_V1_FILE = path.join(LEDGER_DIR, "edits.csv");
const LEDGER_V2_FILE = path.join(LEDGER_DIR, "edits.v2.csv");
const LEDGER_HEADER_V1 = ["ts", "kind", "script_id", "rel_path", "rev", "build", "note"];
const LEDGER_HEADER_V2 = [...LEDGER_HEADER_V1, "msg"];

const NOTES_DIR = path.join(REPO_ROOT, "meta", "notes");
const COMMIT_MESSAGE_FILE = path.join(NOTES_DIR, "COMMIT_MESSAGE.txt");
const COMMIT_QUEUE_FILE = path.join(NOTES_DIR, "COMMIT_QUEUE.txt");

const IS_ENTRYPOINT =
  (() => {
    const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return argv1 === TOOL_FILE;
  })();

if (IS_ENTRYPOINT) {
  try {
    main();
  } catch (err) {
    fatal(err);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const relPaths = collectPaths(args);

  if (!relPaths.length) {
    console.log("[edit:log] No target files.");
    process.exit(0);
  }

  const rows = buildEditRowsForPaths(relPaths, {
    note: args.note,
    explicitNote: args.noteProvided,
    ts: nowIsoNoMs(),
    overrides: new Map(),
  });

  appendEditRows(rows, { dryRun: args.dryRun });
}

function parseArgs(argv) {
  const out = {
    file: "",
    files: [],
    note: "",
    noteProvided: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--dry-run" || arg === "--dry") {
      out.dryRun = true;
      continue;
    }
    if (arg === "--file") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --file.");
      out.file = String(next).trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--file=")) {
      out.file = String(arg.slice("--file=".length)).trim();
      continue;
    }
    if (arg === "--files") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --files.");
      out.files = parseFilesArg(next);
      i += 1;
      continue;
    }
    if (arg.startsWith("--files=")) {
      out.files = parseFilesArg(arg.slice("--files=".length));
      continue;
    }
    if (arg === "--note") {
      const next = argv[i + 1];
      if (!next) throw new Error("Missing value after --note.");
      out.note = String(next);
      out.noteProvided = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("--note=")) {
      out.note = String(arg.slice("--note=".length));
      out.noteProvided = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  out.note = String(out.note || "").replace(/\r?\n/g, " ").trim();
  out.file = normalizePath(out.file);
  out.files = uniqueSorted(out.files.map(normalizePath).filter(Boolean));
  return out;
}

function printHelp() {
  console.log("Usage: node tools/versioning/edit-log.mjs [--dry-run] [--file path] [--files a,b,c] [--note \"...\"]");
}

function parseFilesArg(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectPaths(args) {
  const merged = [];
  if (args.file) merged.push(args.file);
  merged.push(...args.files);
  const relPaths = uniqueSorted(merged.map(normalizePath).filter(Boolean));

  for (const relPath of relPaths) {
    if (!USERSCRIPT_PATH_RE.test(relPath)) {
      throw new Error(`[edit:log] Refusing non-userscript path: ${relPath}`);
    }
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`[edit:log] File not found: ${relPath}`);
    }
  }
  return relPaths;
}

export function buildEditRowsForPaths(relPaths, options = Object.create(null)) {
  const explicitNote = !!options.explicitNote;
  const providedNote = String(options.note || "").replace(/\r?\n/g, " ").trim();
  const ts = String(options.ts || nowIsoNoMs());
  const overridesInput = options.overrides;
  const overrides = overridesInput instanceof Map ? overridesInput : new Map();

  const rows = [];
  for (const relPathRaw of relPaths) {
    const relPath = normalizePath(relPathRaw);
    if (!USERSCRIPT_PATH_RE.test(relPath)) {
      throw new Error(`[edit:log] Refusing non-userscript path: ${relPath}`);
    }

    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`[edit:log] File not found: ${relPath}`);
    }

    const text = fs.readFileSync(abs, "utf8");
    const headerMatch = text.match(USERSCRIPT_HEADER_RE);
    if (!headerMatch) throw new Error(`[edit:log] Missing userscript header in ${relPath}`);
    const header = headerMatch[0];

    let scriptId = "";
    const idMatch = header.match(H2O_ID_LINE_RE);
    if (idMatch) {
      scriptId = String(idMatch[1] || "").trim();
      if (!SAFE_ID_RE.test(scriptId)) {
        throw new Error(`[edit:log] Invalid @h2o-id "${scriptId}" in ${relPath}`);
      }
    } else {
      scriptId = deriveScriptIdFromFileName(path.basename(relPath));
      if (!scriptId || !SAFE_ID_RE.test(scriptId)) {
        throw new Error(`[edit:log] Could not derive valid script id from ${relPath}`);
      }
    }

    const override = overrides.get(relPath) || Object.create(null);

    const revFromFile = parseRevFromHeader(header);
    const rev = normalizeRev(String(override.rev ?? revFromFile ?? "000"));

    const buildFromFile = parseBuildFromHeader(header);
    const build = String(override.build ?? buildFromFile ?? "").trim();

    const topicInfo = deriveTopic({
      explicitNote,
      note: providedNote,
      relPath,
      scriptId,
    });
    // Keep legacy ledger semantics: auto-generated saves keep note="auto";
    // explicit --note stores the cleaned topic text for traceability.
    const note = explicitNote ? (topicInfo.explicitNote || "auto") : "auto";
    const counts = readNumstatCounts(relPath);
    const msg = formatEditMessage({
      scriptId,
      rev,
      topic: topicInfo.topic,
      counts,
    });

    rows.push({
      ts,
      kind: "EDIT",
      script_id: scriptId,
      rel_path: relPath,
      rev,
      build,
      note,
      msg,
      forced_type: topicInfo.forcedType,
    });
  }

  return rows;
}

export function appendEditRows(rows, options = Object.create(null)) {
  const dryRun = !!options.dryRun;
  if (!rows.length) {
    if (dryRun) console.log("[edit:log] dry-run: no rows to append.");
    return;
  }

  if (dryRun) {
    for (const row of rows) {
      console.log(
        `[edit:log] dry-run + EDIT ${row.script_id} rev=${row.rev} build=${row.build || "<none>"} path=${row.rel_path} msg=${row.msg}`,
      );
    }
    return;
  }

  ensureDir(LEDGER_DIR);
  const target = resolveLedgerTarget();
  ensureLedgerFile(target.filePath, target.header);

  appendRowsToCsv(target.filePath, rows, target.header);

  const subjects = rows.map((row) => editLineToCommitSubject(row.msg, row.forced_type));
  writeCommitNotes(rows, subjects);

  console.log("[edit:log] appended " + rows.length + " EDIT row(s); wrote COMMIT_MESSAGE.txt; appended COMMIT_QUEUE.txt");
}

export function editLineToCommitSubject(editLine, forcedType = "") {
  const line = String(editLine || "").replace(/\r?\n/g, " ").trim();
  const parsed = line.match(/^edit\(([^)]+)\):\s*r(\d+)(?:\s+\(\+(\d+)\s+-(\d+)\))?\s+(.+)$/i);
  if (!parsed) {
    return `chore(edit): ${line || "Update"}`
      .replace(/\s+/g, " ")
      .trim();
  }

  const scriptId = String(parsed[1] || "").trim();
  const rev = normalizeRev(parsed[2]);
  const additions = String(parsed[3] || "").trim();
  const deletions = String(parsed[4] || "").trim();
  const topic = sanitizeTopicLine(parsed[5], 60) || "Update";
  const normalizedForcedType = normalizeForcedType(forcedType);
  const type = normalizedForcedType || inferCommitType(topic);

  if (additions && deletions) {
    return `${type}(${scriptId}): ${topic} (r${rev || "000"}, +${additions} -${deletions})`;
  }
  return `${type}(${scriptId}): ${topic} (r${rev || "000"})`;
}

function resolveLedgerTarget() {
  if (fs.existsSync(LEDGER_V2_FILE)) {
    assertLedgerHeader(LEDGER_V2_FILE, LEDGER_HEADER_V2);
    return {
      filePath: LEDGER_V2_FILE,
      header: LEDGER_HEADER_V2,
    };
  }

  if (!fs.existsSync(LEDGER_V1_FILE)) {
    return {
      filePath: LEDGER_V1_FILE,
      header: LEDGER_HEADER_V2,
    };
  }

  const v1Header = readLedgerHeader(LEDGER_V1_FILE);
  if (headersMatch(v1Header, LEDGER_HEADER_V2)) {
    return {
      filePath: LEDGER_V1_FILE,
      header: LEDGER_HEADER_V2,
    };
  }
  if (headersMatch(v1Header, LEDGER_HEADER_V1)) {
    return {
      filePath: LEDGER_V2_FILE,
      header: LEDGER_HEADER_V2,
    };
  }

  throw new Error("[edit:log] Header mismatch in meta/ledger/edits.csv");
}

function ensureLedgerFile(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${header.map(csvQuote).join(",")}\n`, "utf8");
    return;
  }
  assertLedgerHeader(filePath, header);
}

function appendRowsToCsv(filePath, rows, header) {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.length > 0 && !text.endsWith("\n") && !text.endsWith("\r\n")) {
    text += "\n";
  }
  text += rows.map((row) => toCsvRow(row, header)).join("\n");
  text += "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

function writeCommitNotes(rows, subjects) {
  ensureDir(NOTES_DIR);

  const lastSubject = String(subjects[subjects.length - 1] || "chore(edit): Update (r0)").replace(/\r?\n/g, " ").trim();
  fs.writeFileSync(COMMIT_MESSAGE_FILE, `${lastSubject}\n`, "utf8");

  const queueLines = rows.map((row, idx) => {
    const ts = String(row.ts || nowIsoNoMs()).replace(/\r?\n/g, " ").trim();
    const subject = String(subjects[idx] || "").replace(/\r?\n/g, " ").trim();
    return `${ts} | ${subject}`;
  });

  let prefix = "";
  if (fs.existsSync(COMMIT_QUEUE_FILE)) {
    const existing = fs.readFileSync(COMMIT_QUEUE_FILE, "utf8");
    if (existing.length > 0 && !existing.endsWith("\n") && !existing.endsWith("\r\n")) {
      prefix = "\n";
    }
  }
  fs.appendFileSync(COMMIT_QUEUE_FILE, `${prefix}${queueLines.join("\n")}\n`, "utf8");
}

function readNumstatCounts(relPath) {
  try {
    const res = spawnSync("git", ["diff", "--numstat", "--", relPath], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (res.error || res.status !== 0) return null;

    const lines = String(res.stdout || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    let additions = 0;
    let deletions = 0;
    let found = false;
    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      if (!/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) continue;
      additions += Number(parts[0]);
      deletions += Number(parts[1]);
      found = true;
    }

    if (!found) return null;
    return { additions, deletions };
  } catch {
    return null;
  }
}

function formatEditMessage({ scriptId, rev, topic, counts }) {
  if (counts && Number.isFinite(counts.additions) && Number.isFinite(counts.deletions)) {
    return `edit(${scriptId}): r${rev} (+${counts.additions} -${counts.deletions}) ${topic}`;
  }
  return `edit(${scriptId}): r${rev} ${topic}`;
}

function deriveTopic({ explicitNote, note, relPath, scriptId }) {
  if (explicitNote) {
    const noteParts = extractForcedTypeAndTopic(note);
    if (noteParts.cleanTopic) {
      return {
        topic: noteParts.cleanTopic,
        forcedType: noteParts.forcedType,
        explicitNote: noteParts.cleanTopic,
      };
    }
  }

  const fromPath = topicFromRelPath(relPath);
  if (fromPath) return { topic: fromPath, forcedType: "", explicitNote: "" };

  const fromScriptId = topicFromScriptId(scriptId);
  if (fromScriptId) return { topic: fromScriptId, forcedType: "", explicitNote: "" };

  return { topic: "Update", forcedType: "", explicitNote: "" };
}

function extractForcedTypeAndTopic(rawTopic) {
  const normalized = String(rawTopic || "").replace(/\r?\n/g, " ").trim();
  if (!normalized) {
    return { forcedType: "", cleanTopic: "" };
  }
  const match = normalized.match(TYPE_PREFIX_RE);
  if (!match) {
    return {
      forcedType: "",
      cleanTopic: sanitizeTopicLine(normalized, 60),
    };
  }
  const forcedType = normalizeForcedType(match[1]);
  return {
    forcedType,
    cleanTopic: sanitizeTopicLine(match[2], 60),
  };
}

function normalizeForcedType(v) {
  const t = String(v || "").trim().toLowerCase();
  return FORCED_TYPES.has(t) ? t : "";
}

function topicFromRelPath(relPath) {
  const base = path.basename(String(relPath || "")).replace(/\.user\.js$/i, "");
  const noDots = base.replace(/[._]+/g, " ");
  const noPrefix = noDots.replace(/^\s*(?=[0-9A-Z]*\d)[0-9A-Z]{1,6}[a-z]?\s*/u, "");
  const ascii = noPrefix.replace(/[^\x20-\x7E]+/g, " ");
  const words = ascii
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
  return sanitizeTopicLine(words, 60);
}

function topicFromScriptId(scriptId) {
  const parts = String(scriptId || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";

  const keepCount = parts.length >= 2 ? Math.min(4, parts.length) : 1;
  const raw = parts
    .slice(-keepCount)
    .join(" ")
    .replace(/-/g, " ");
  return sanitizeTopicLine(raw, 60);
}

function sanitizeTopicLine(value, maxLen = 60) {
  let s = String(value || "")
    .replace(/\r?\n/g, " ")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";

  const words = s
    .split(" ")
    .filter(Boolean)
    .slice(0, 6);
  s = toTitleCase(words.join(" "));
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).trim();
  }
  return s;
}

function toTitleCase(value) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function inferCommitType(topic) {
  const text = String(topic || "").toLowerCase();
  const buckets = [
    {
      type: "fix",
      keys: ["fix", "bug", "broken", "crash", "guard", "null", "undefined", "error", "regress"],
    },
    {
      type: "feat",
      keys: ["add", "new", "support", "enable", "feature", "implement", "create"],
    },
    {
      type: "perf",
      keys: ["perf", "speed", "debounce", "throttle", "optimize", "reduce"],
    },
    {
      type: "refactor",
      keys: ["refactor", "rename", "cleanup", "simplify", "format", "extract", "move"],
    },
  ];

  for (const bucket of buckets) {
    if (bucket.keys.some((key) => text.includes(key))) {
      return bucket.type;
    }
  }
  return "chore";
}

function assertLedgerHeader(filePath, expectedHeader) {
  const header = readLedgerHeader(filePath);
  if (!headersMatch(header, expectedHeader)) {
    throw new Error(`[edit:log] Header mismatch in ${displayPath(filePath)}`);
  }
}

function readLedgerHeader(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const first = String(text.split(/\r?\n/, 1)[0] || "");
  return parseCsvLine(first);
}

function parseCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
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
      out.push(field);
      field = "";
      continue;
    }
    field += ch;
  }
  out.push(field);
  return out;
}

function headersMatch(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

function parseRevFromHeader(header) {
  const m = header.match(REV_LINE_RE);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function parseBuildFromHeader(header) {
  const m = header.match(BUILD_LINE_RE);
  if (!m) return "";
  return String(m[1] || "").trim();
}

function normalizeRev(raw) {
  const digits = String(raw || "").trim().replace(/[^\d]/g, "");
  if (!digits) return "000";
  return digits.padStart(3, "0");
}

function deriveScriptIdFromFileName(fileName) {
  const stem = String(fileName || "").replace(/\.user\.js$/i, "");
  return stem
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function toCsvRow(row, header) {
  return header.map((key) => csvQuote(row[key])).join(",");
}

function csvQuote(value) {
  return `"${String(value ?? "").replace(/"/g, "\"\"")}"`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function nowIsoNoMs() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function normalizePath(v) {
  return String(v || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueSorted(paths) {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

function displayPath(filePath) {
  return path.relative(REPO_ROOT, filePath) || ".";
}

function fatal(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg.startsWith("[edit:log]") ? msg : `[edit:log] ${msg}`);
  process.exit(1);
}
