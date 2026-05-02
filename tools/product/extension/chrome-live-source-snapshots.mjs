// @version 1.0.0
import fs from "node:fs";
import path from "node:path";

function parseOrderEnabledToken(tokenRaw) {
  const raw = String(tokenRaw || "").trim();
  if (!raw) return null;
  if (["\u2705", "\u{1F7E2}", "\u{1F7E9}"].includes(raw)) return true;
  if (["\u274C", "\u{1F534}", "\u{1F7E5}"].includes(raw)) return false;
  const v = raw.toLowerCase();
  if (["on", "1", "true", "yes"].includes(v)) return true;
  if (["off", "0", "false", "no"].includes(v)) return false;
  return null;
}

function sanitizeSectionKey(titleRaw, idx) {
  const base = String(titleRaw || "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (base || "SECTION") + "_" + String(idx + 1);
}

function readDevOrderSectionsSnapshot(orderFile) {
  if (!fs.existsSync(orderFile)) return [];
  const text = fs.readFileSync(orderFile, "utf8");
  const sections = [];
  let current = null;
  let sectionIdx = 0;

  const ensureSection = (title) => {
    const trimmed = String(title || "").trim();
    if (!trimmed) return null;
    const sec = {
      key: sanitizeSectionKey(trimmed, sectionIdx),
      title: trimmed,
      items: [],
    };
    sectionIdx += 1;
    sections.push(sec);
    return sec;
  };

  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#")) {
      const title = line.replace(/^#\s*/, "").trim();
      if (!title) continue;
      if (/^=+$/.test(title)) continue;
      if (/^h2o dev order/i.test(title)) continue;
      if (/^master:/i.test(title)) continue;
      current = ensureSection(title);
      continue;
    }

    const parts = line.split("\t");
    if (parts.length < 2) continue;
    const enabledRaw = parseOrderEnabledToken(parts[0]);
    const file = parts.slice(1).join("\t").trim();
    if (!/(\.user)?\.js$/i.test(file)) continue;
    const aliasFile = toAliasName(file);
    if (!aliasFile) continue;

    if (!current) current = ensureSection("Other");
    current.items.push({
      file: aliasFile,
      enabled: enabledRaw === true,
    });
  }

  return sections.filter((sec) => Array.isArray(sec.items) && sec.items.length > 0);
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

function isSourceScriptName(filename) {
  const name = String(filename || "");
  if (!/(\.user)?\.js$/i.test(name)) return false;
  return toAliasName(name) !== null;
}

function readAliasFilenameMap(srcRoot) {
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
    const alias = toAliasName(entry.name);
    if (!alias) continue;
    if (!Object.prototype.hasOwnProperty.call(out, alias)) {
      out[alias] = String(entry.name);
    }
  }
  return out;
}

function normalizeRunAtTag(runAtRaw) {
  const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
  if (v === "document-start") return "document-start";
  if (v === "document-end") return "document-end";
  return "document-idle";
}

function readHeaderTag(metaText, tag) {
  const rx = new RegExp("^\\s*//\\s*@" + String(tag || "") + "\\s+(.+?)\\s*$", "mi");
  const m = String(metaText || "").match(rx);
  return m ? String(m[1]).trim() : "";
}

function stripScriptFilenameSuffix(filenameRaw) {
  return String(filenameRaw || "").replace(/(\.user)?\.js$/i, "").trim();
}

function readRuntimeOrderMeta(srcRoot) {
  const out = {};
  const depsFile = path.join(srcRoot, "config", "loader-deps.json");
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(depsFile, "utf8"));
  } catch {
    return out;
  }
  const groups = manifest && typeof manifest === "object" ? manifest.groups : null;
  if (!groups || typeof groups !== "object") return out;
  for (const [groupName, meta] of Object.entries(groups)) {
    const runtimeOrder = Array.isArray(meta && meta.runtimeOrder) ? meta.runtimeOrder : [];
    for (let i = 0; i < runtimeOrder.length; i++) {
      const aliasId = toAliasName(runtimeOrder[i]);
      if (!aliasId || Object.prototype.hasOwnProperty.call(out, aliasId)) continue;
      out[aliasId] = {
        runtimeGroup: String(groupName || ""),
        runtimeOrder: i,
      };
    }
  }
  return out;
}

function readScriptCatalog(srcRoot) {
  const out = {};
  const scriptsDir = path.join(srcRoot, "scripts");
  if (!fs.existsSync(scriptsDir)) return out;
  const runtimeOrderMeta = readRuntimeOrderMeta(srcRoot);

  let entries = [];
  try {
    entries = fs.readdirSync(scriptsDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry || !entry.isFile || !entry.isFile()) continue;
    if (!isSourceScriptName(entry.name)) continue;

    const alias = toAliasName(entry.name);
    if (!alias) continue;

    const fp = path.join(scriptsDir, entry.name);
    let srcText = "";
    try {
      srcText = fs.readFileSync(fp, "utf8");
    } catch {
      srcText = "";
    }

    const metaMatch = String(srcText || "").match(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/m);
    const meta = metaMatch ? String(metaMatch[0] || "") : "";
    const scriptName = stripScriptFilenameSuffix(entry.name) || String(readHeaderTag(meta, "name") || entry.name).trim() || entry.name;
    const runAt = normalizeRunAtTag(readHeaderTag(meta, "run-at") || "document-idle");
    const runtimeMeta = runtimeOrderMeta[alias] || null;

    out[alias] = {
      name: scriptName,
      runAt,
      runtimeGroup: runtimeMeta ? runtimeMeta.runtimeGroup : "",
      runtimeOrder: runtimeMeta ? runtimeMeta.runtimeOrder : null,
    };
  }

  return out;
}

export function createChromeLiveSourceSnapshots({ srcRoot, orderFile }) {
  return {
    DEV_ORDER_SECTIONS_SNAPSHOT: readDevOrderSectionsSnapshot(orderFile),
    DEV_ALIAS_FILENAME_MAP: readAliasFilenameMap(srcRoot),
    DEV_SCRIPT_CATALOG: readScriptCatalog(srcRoot),
  };
}
