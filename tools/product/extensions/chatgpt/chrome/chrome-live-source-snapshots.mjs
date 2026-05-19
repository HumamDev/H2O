// @version 1.1.0  (Phase 8K-4: runtime base path resolves through tools/paths.mjs)
import fs from "node:fs";
import path from "node:path";

// Phase 8K-4: runtime userscript source folder name resolves through the
// central path registry. Today "scripts"; 8K-5 flips to "src-runtime-base".
// CRITICAL: this file participates in the chrome-live deterministic build
// hash via the source-snapshot collection logic — the rename is safe
// because the hash is computed over file CONTENTS, not source path strings.
import { RUNTIME_BASE_REL } from "../../../../paths.mjs";

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
  const scriptsDir = path.join(srcRoot, RUNTIME_BASE_REL);
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

// Phase 4 Step 5a: read per-script tier classification + optional on-demand
// openEvent from config/loader-tiers.json. The loader does NOT yet read these
// fields — they are embedded into DEV_SCRIPT_CATALOG for forward compatibility
// and diagnostic visibility. Any alias not listed defaults to L4 (handled in
// readScriptCatalog by the `|| "L4"` / `|| ""` fallbacks).
function readTierMeta(srcRoot) {
  const out = {};
  const tiersFile = path.join(srcRoot, "config", "loader-tiers.json");
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(tiersFile, "utf8"));
  } catch {
    return out;
  }
  const scripts = manifest && typeof manifest === "object" ? manifest.scripts : null;
  if (!scripts || typeof scripts !== "object") return out;
  for (const [aliasRaw, entry] of Object.entries(scripts)) {
    const aliasId = String(aliasRaw || "").trim();
    if (!aliasId) continue;
    const tier = String((entry && entry.tier) || "").trim();
    const openEvent = String((entry && entry.openEvent) || "").trim();
    if (!tier && !openEvent) continue;
    out[aliasId] = {
      tier: tier || "L4",
      openEvent,
    };
  }
  return out;
}

function readScriptCatalog(srcRoot) {
  const out = {};
  const scriptsDir = path.join(srcRoot, RUNTIME_BASE_REL);
  if (!fs.existsSync(scriptsDir)) return out;
  const runtimeOrderMeta = readRuntimeOrderMeta(srcRoot);
  const tierMeta = readTierMeta(srcRoot);

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

    const metaMatch = String(srcText || "").match(/\/\/\s*==H2O Module==[\s\S]*?\/\/\s*==\/H2O Module==/m);
    const meta = metaMatch ? String(metaMatch[0] || "") : "";
    const scriptName = stripScriptFilenameSuffix(entry.name) || String(readHeaderTag(meta, "name") || entry.name).trim() || entry.name;
    const runAt = normalizeRunAtTag(readHeaderTag(meta, "run-at") || "document-idle");
    const runtimeMeta = runtimeOrderMeta[alias] || null;
    const tierEntry = tierMeta[alias] || null;

    out[alias] = {
      name: scriptName,
      runAt,
      runtimeGroup: runtimeMeta ? runtimeMeta.runtimeGroup : "",
      runtimeOrder: runtimeMeta ? runtimeMeta.runtimeOrder : null,
      // Phase 4 Step 5a: tier defaults to "L4" when not declared in
      // config/loader-tiers.json. openEvent defaults to "" (empty string).
      // These fields are metadata-only at this phase — the loader does NOT
      // act on them yet.
      tier: tierEntry ? tierEntry.tier : "L4",
      openEvent: tierEntry ? tierEntry.openEvent : "",
    };
  }

  return out;
}

// Loader V3 Phase 1: read config/loader-deps.json and normalize per-script
// dep edges into a JSON-serializable map embedded into the generated loader.
// Read-only — used by the V3_WAVE_DIAG predictor to simulate tier/wave
// dispatch. Does NOT change loader behavior.
function readLoaderDepsSnapshot(srcRoot) {
  const out = {};
  const depsFile = path.join(srcRoot, "config", "loader-deps.json");
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(depsFile, "utf8"));
  } catch {
    return out;
  }
  const scripts = manifest && typeof manifest === "object" ? manifest.scripts : null;
  if (!scripts || typeof scripts !== "object") return out;
  for (const [aliasRaw, entry] of Object.entries(scripts)) {
    const aliasId = String(aliasRaw || "").trim();
    if (!aliasId || !entry || typeof entry !== "object") continue;
    const dependsOn = Array.isArray(entry.dependsOn) ? entry.dependsOn.map((x) => String(x || "")).filter(Boolean) : [];
    const after = Array.isArray(entry.after) ? entry.after.map((x) => String(x || "")).filter(Boolean) : [];
    const optionalDependsOn = Array.isArray(entry.optionalDependsOn) ? entry.optionalDependsOn.map((x) => String(x || "")).filter(Boolean) : [];
    const provides = Array.isArray(entry.provides) ? entry.provides.map((x) => String(x || "")).filter(Boolean) : [];
    out[aliasId] = {
      phase: String(entry.phase || "document-idle"),
      dependsOn,
      after,
      optionalDependsOn,
      group: String(entry.group || ""),
      provides,
      critical: entry.critical === true,
    };
  }
  return out;
}

export function createChromeLiveSourceSnapshots({ srcRoot, orderFile }) {
  return {
    DEV_ORDER_SECTIONS_SNAPSHOT: readDevOrderSectionsSnapshot(orderFile),
    DEV_ALIAS_FILENAME_MAP: readAliasFilenameMap(srcRoot),
    DEV_SCRIPT_CATALOG: readScriptCatalog(srcRoot),
    LOADER_DEPS_SNAPSHOT: readLoaderDepsSnapshot(srcRoot),
  };
}
