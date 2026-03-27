// @version 1.0.0
export function makeChromeLivePopupDataSource() {
  return `  function readTag(metaText, tag) {
    const rx = new RegExp("^\\\\s*//\\\\s*@" + tag + "\\\\s+(.+?)\\\\s*$", "mi");
    const m = String(metaText || "").match(rx);
    return m ? String(m[1]).trim() : "";
  }

  function normalizeRunAt(runAtRaw) {
    const v = String(runAtRaw || "").trim().toLowerCase().replace(/_/g, "-");
    if (v === "document-start") return "document-start";
    if (v === "document-end") return "document-end";
    return "document-idle";
  }

  function aliasIdFromRequireUrl(urlStr) {
    const raw = String(urlStr || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const idx = parts.lastIndexOf("alias");
      const tail = idx >= 0 ? parts.slice(idx + 1).join("/") : (parts[parts.length - 1] || "");
      return decodeURIComponent(tail || "");
    } catch {}
    const m = raw.match(new RegExp("/alias/([^?#]+)", "i"));
    if (m) {
      try { return decodeURIComponent(m[1]); } catch { return m[1]; }
    }
    return raw;
  }

  function normalizeInt(raw, fallback = 0) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
  }

  function normalizeBool(raw, fallback = false) {
    if (typeof raw === "boolean") return raw;
    return !!fallback;
  }

  function normalizeColWidth(raw, fallback = 80) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return Math.max(42, Math.round(Number(fallback) || 80));
    return Math.max(42, Math.min(640, Math.round(n)));
  }

  function normalizeScriptColWidth(raw, fallback = 248) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return Math.max(248, Math.round(Number(fallback) || 248));
    return Math.max(248, Math.min(620, Math.round(n)));
  }

  function normalizeColWidthMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const col of COL_DEFS) {
      const key = String(col.key || "");
      if (!Object.prototype.hasOwnProperty.call(rawMap, key)) continue;
      out[key] = normalizeColWidth(rawMap[key], col.width || 80);
    }
    return out;
  }

  function stripDevCacheNoise(url) {
    const raw = String(url || "");
    if (!raw) return raw;
    try {
      const u = new URL(raw, location.href);
      u.searchParams.delete("extcb");
      u.searchParams.delete("cb");
      u.searchParams.delete("cacheBust");
      return u.toString();
    } catch {}
    return raw
      .replace(/([?&])extcb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cb=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/([?&])cacheBust=[^&#]*(&)?/gi, (m, lead, tail) => tail ? lead : "")
      .replace(/[?&]$/, "")
      .replace("?&", "?");
  }

  function parseProxyPack(packText) {
    const headers = String(packText || "").match(HDR_RE) || [];
    const out = [];
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      const name = readTag(h, "name") || "(unnamed)";
      const runAt = normalizeRunAt(readTag(h, "run-at") || "document-idle");
      const rawRequireUrl = readTag(h, "require");
      if (!rawRequireUrl) continue;
      const aliasId = aliasIdFromRequireUrl(rawRequireUrl) || name;
      const requireUrl = stripDevCacheNoise(rawRequireUrl);
      const metrics = {
        lines: normalizeInt(readTag(h, "h2o-lines")),
        bytes: normalizeInt(readTag(h, "h2o-bytes")),
        score: normalizeInt(readTag(h, "h2o-score")),
        weight: String(readTag(h, "h2o-weight") || "").toLowerCase(),
        watchers: normalizeInt(readTag(h, "h2o-watchers")),
        listeners: normalizeInt(readTag(h, "h2o-listeners")),
      };
      out.push({ name, runAt, requireUrl, aliasId, metrics, packIndex: i });
    }
    return out;
  }

  function groupInfoForAlias(aliasId) {
    const id = String(aliasId || "").split(".")[0].toUpperCase();
    if (/^0A/.test(id)) return { key: "CORE", title: "🧠 Core", order: 10 };
    if (/^0B/.test(id)) return { key: "DATA", title: "🗄️ Data", order: 20 };
    if (/^0W/.test(id)) return { key: "UNMOUNT_PAGINATION", title: "🪟 Unmount + Pagination", order: 25 };
    if (/^0Z/.test(id)) return { key: "CONTROL_HUB", title: "📍 Control Hub", order: 30 };
    if (/^1A1/.test(id)) return { key: "MINIMAP_BASE", title: "🗺️ MiniMap Base", order: 40 };
    if (/^1A/.test(id)) return { key: "MINIMAP_PLUGINS", title: "🧩 MiniMap Add-ons", order: 50 };
    if (/^1/.test(id)) return { key: "ANSWERS_UI", title: "🧱 Answers UI", order: 60 };
    if (/^2/.test(id)) return { key: "QUESTIONS_UI", title: "❓ Questions UI", order: 70 };
    if (/^3X/.test(id)) return { key: "WORKSPACE", title: "🔶 Workspace", order: 85 };
    if (/^(3|4)/.test(id)) return { key: "DOCK_ENGINES_TABS", title: "🧩 Dock + Engines + Tabs", order: 80 };
    if (/^5/.test(id)) return { key: "EXPORT", title: "📤 Export", order: 90 };
    if (/^6/.test(id)) return { key: "UTILITIES", title: "🧰 Utilities", order: 100 };
    if (/^7/.test(id)) return { key: "PROMPTS", title: "📝 Prompts", order: 110 };
    if (/^8/.test(id)) return { key: "THEMES_SKINS", title: "🎨 Themes + Skins + Input", order: 120 };
    if (/^9/.test(id)) return { key: "INTERFACE", title: "🖥️ Interface", order: 130 };
    if (/^X/.test(id)) return { key: "EXPERIMENTAL", title: "🧪 Experimental", order: 140 };
    return { key: "OTHER", title: "📦 Other", order: 999 };
  }

  function groupScripts(list) {
    const byKey = new Map();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const info = groupInfoForAlias(item.aliasId);
      let group = byKey.get(info.key);
      if (!group) {
        group = { ...info, firstIndex: i, items: [] };
        byKey.set(info.key, group);
      }
      group.items.push(item);
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.firstIndex - b.firstIndex;
    });
  }

  function devConfigUrl(fileName) {
    const fallback = "http://127.0.0.1:5500/config/" + String(fileName || "");
    try {
      const u = new URL(PROXY_PACK_URL);
      return u.origin + "/config/" + String(fileName || "");
    } catch {}
    return fallback;
  }

  const DEV_ORDER_TSV_URL = devConfigUrl("dev-order.tsv");
  const DEV_ORDER_TXT_URL = devConfigUrl("dev-order.txt");
  const DEV_ORDER_JSON_URL = devConfigUrl("dev-order.json");

  function parseDevOrderEnabledToken(tokenRaw) {
    const raw = String(tokenRaw || "").trim();
    if (!raw) return null;
    if (["✅", "🟢", "🟩"].includes(raw)) return true;
    if (["❌", "🔴", "🟥"].includes(raw)) return false;
    const v = raw.toLowerCase();
    if (["on", "1", "true", "yes"].includes(v)) return true;
    if (["off", "0", "false", "no"].includes(v)) return false;
    return null;
  }

  function sanitizeOrderSectionKey(titleRaw, idx) {
    const base = String(titleRaw || "")
      .replace(/\\s+/g, "_")
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    return base || ("SECTION_" + String((Number(idx) || 0) + 1));
  }

  function normalizeDevOrderSections(rawSections) {
    const out = [];
    if (!Array.isArray(rawSections)) return out;
    for (let i = 0; i < rawSections.length; i++) {
      const src = rawSections[i];
      if (!src || typeof src !== "object") continue;
      const title = String(src.title || "").trim();
      const key = String(src.key || "").trim() || ("SECTION_" + (i + 1));
      const itemsRaw = Array.isArray(src.items) ? src.items : [];
      const items = [];
      for (const row of itemsRaw) {
        if (!row || typeof row !== "object") continue;
        const file = String(row.file || "").trim();
        if (!file || !/\\.user\\.js$/i.test(file)) continue;
        items.push({
          file,
          enabled: row.enabled === true,
        });
      }
      if (!items.length) continue;
      out.push({
        key,
        title: title || key,
        items,
      });
    }
    return out;
  }

  function normalizeAliasFilenameMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = String(k || "").trim();
      const file = String(v || "").trim();
      if (!aliasId || !file) continue;
      out[aliasId] = file;
    }
    return out;
  }

  function stripUserJsSuffix(raw) {
    return String(raw || "").replace(/\\.user\\.js$/i, "").trim();
  }

  function displayFilenameForAlias(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return "";
    return stripUserJsSuffix(String(aliasFilenameMap[aliasId] || aliasId));
  }

  function findScriptByAlias(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return null;
    for (const item of scripts) {
      if (String(item && item.aliasId || "").trim() === aliasId) return item;
    }
    return null;
  }

  function aliasRequireUrl(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return "";
    const enc = encodeURIComponent(aliasId);
    try {
      const u = new URL(PROXY_PACK_URL);
      return u.origin + "/alias/" + enc;
    } catch {}
    return "http://127.0.0.1:5500/alias/" + enc;
  }

  function ensureVisibleScriptRow(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return false;
    if (findScriptByAlias(aliasId)) return false;

    let maxPackIndex = -1;
    for (const it of scripts) {
      const p = Number(it && it.packIndex);
      if (Number.isFinite(p) && p > maxPackIndex) maxPackIndex = p;
    }

    scripts.push({
      name: displayFilenameForAlias(aliasId),
      runAt: "document-idle",
      requireUrl: aliasRequireUrl(aliasId),
      aliasId,
      metrics: {
        lines: 0,
        bytes: 0,
        score: 0,
        weight: "",
        watchers: 0,
        listeners: 0,
      },
      packIndex: maxPackIndex + 1,
    });
    return true;
  }

  function removeVisibleScriptRow(aliasIdRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return false;
    const before = scripts.length;
    scripts = scripts.filter((it) => String(it && it.aliasId || "").trim() !== aliasId);
    return scripts.length !== before;
  }

  function cloneDevOrderSections(rawSections) {
    return normalizeDevOrderSections(rawSections);
  }

  function normalizeOrderOverrideMap(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [k, v] of Object.entries(rawMap)) {
      const aliasId = String(k || "").trim();
      if (!aliasId || !/\\.user\\.js$/i.test(aliasId)) continue;
      out[aliasId] = v === true;
    }
    return out;
  }

  function applyOrderOverrides(baseSections, overridesRaw) {
    const overrides = normalizeOrderOverrideMap(overridesRaw);
    const next = cloneDevOrderSections(baseSections);
    for (const sec of next) {
      for (const row of sec.items) {
        const aliasId = String(row && row.file || "").trim();
        if (!aliasId) continue;
        if (!Object.prototype.hasOwnProperty.call(overrides, aliasId)) continue;
        row.enabled = overrides[aliasId] === true;
      }
    }
    return next;
  }

  function applyCurrentOrderOverrides() {
    orderSections = applyOrderOverrides(orderSectionsBase, orderOverrideMap);
  }

  function setOrderEnabledInBase(aliasIdRaw, enabledRaw) {
    const aliasId = String(aliasIdRaw || "").trim();
    if (!aliasId) return false;
    let changed = false;
    const nextEnabled = enabledRaw === true;
    for (const sec of orderSectionsBase) {
      for (const row of sec.items) {
        const file = String(row && row.file || "").trim();
        if (file !== aliasId) continue;
        if (row.enabled !== nextEnabled) {
          row.enabled = nextEnabled;
          changed = true;
        }
      }
    }
    return changed;
  }

  function collectOrderEnabledMap() {
    const out = {};
    for (const sec of orderSections) {
      const items = Array.isArray(sec && sec.items) ? sec.items : [];
      for (const row of items) {
        const aliasId = String(row && row.file || "").trim();
        if (!aliasId) continue;
        out[aliasId] = row.enabled === true;
      }
    }
    return out;
  }

  function syncVisibleScriptsWithOrder() {
    const orderEnabledMap = collectOrderEnabledMap();
    if (!Object.keys(orderEnabledMap).length) return false;

    let changed = false;
    for (const [aliasId, enabled] of Object.entries(orderEnabledMap)) {
      if (enabled) {
        if (ensureVisibleScriptRow(aliasId)) changed = true;
        continue;
      }
      if (forcedVisibleAliasIds.has(aliasId)) continue;
      if (removeVisibleScriptRow(aliasId)) changed = true;
    }

    return changed;
  }

  function parseDevOrderSectionsFromTsv(text) {
    const sections = [];
    let current = null;
    let sectionIdx = 0;

    const ensureSection = (titleRaw) => {
      const title = String(titleRaw || "").trim();
      if (!title) return null;
      const sec = {
        key: sanitizeOrderSectionKey(title, sectionIdx),
        title,
        items: [],
      };
      sectionIdx += 1;
      sections.push(sec);
      return sec;
    };

    for (const rawLine of String(text || "").split(/\\r?\\n/)) {
      const line = String(rawLine || "").trim();
      if (!line) continue;

      if (line.startsWith("#")) {
        const title = line.replace(/^#\\s*/, "").trim();
        if (!title) continue;
        if (/^=+$/.test(title)) continue;
        if (/^h2o dev order/i.test(title)) continue;
        if (/^master:/i.test(title)) continue;
        current = ensureSection(title);
        continue;
      }

      const parts = line.split("\\t");
      if (parts.length < 2) continue;
      const enabled = parseDevOrderEnabledToken(parts[0]) === true;
      const file = String(parts.slice(1).join("\\t") || "").trim();
      if (!/\\.user\\.js$/i.test(file)) continue;
      if (!current) current = ensureSection("Other");
      current.items.push({ file, enabled });
    }

    return normalizeDevOrderSections(sections);
  }

  function recomputeOrderDerivedState() {
    const visibleAliasSet = new Set();
    for (const item of scripts) {
      const aliasId = String(item && item.aliasId || "").trim();
      if (aliasId) visibleAliasSet.add(aliasId);
    }

    const nextGroupTotals = {};
    const nextHiddenSections = [];
    let nextHiddenNonVisible = 0;
    let nextHiddenOff = 0;

    for (const sec of orderSections) {
      const hiddenItems = [];
      for (const row of sec.items) {
        const aliasId = String(row && row.file || "").trim();
        if (!aliasId) continue;

        const info = groupInfoForAlias(aliasId);
        const gKey = String(info && info.key || "OTHER");
        nextGroupTotals[gKey] = (Number(nextGroupTotals[gKey]) || 0) + 1;

        const isVisible = visibleAliasSet.has(aliasId);
        if (!isVisible) {
          const enabled = row.enabled === true;
          hiddenItems.push({ aliasId, enabled });
          nextHiddenNonVisible += 1;
          if (!enabled) nextHiddenOff += 1;
        }
      }

      if (hiddenItems.length) {
        nextHiddenSections.push({
          key: sec.key,
          title: sec.title,
          items: hiddenItems,
        });
      }
    }

    groupExpectedTotals = nextGroupTotals;
    hiddenNonVisibleSections = nextHiddenSections;
    hiddenNonVisibleTotal = nextHiddenNonVisible;
    hiddenOffTotal = nextHiddenOff;
  }
`;
}
