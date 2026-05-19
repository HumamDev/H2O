// @version 1.0.0
export function makeChromeLivePopupStorageSource() {
  return `  function defaultInfoPrefs() {
    const out = {};
    for (const col of COL_DEFS) {
      if (!col.toggleable) continue;
      out[col.key] = col.defaultOn !== false;
    }
    return out;
  }

  function normalizeInfoPrefs(rawPrefs) {
    const out = defaultInfoPrefs();
    if (!rawPrefs || typeof rawPrefs !== "object") return out;
    for (const col of COL_DEFS) {
      if (!col.toggleable) continue;
      if (Object.prototype.hasOwnProperty.call(rawPrefs, col.key)) {
        out[col.key] = rawPrefs[col.key] !== false;
      }
    }
    return out;
  }

  function normalizeRuntimeStats(rawStats) {
    const out = {};
    if (!rawStats || typeof rawStats !== "object") return out;

    for (const [aliasId, raw] of Object.entries(rawStats)) {
      if (!raw || typeof raw !== "object") continue;
      const key = normalizeAliasId(aliasId);
      if (!key) continue;

      const loads = normalizeInt(raw.loads);
      const failures = normalizeInt(raw.failures);
      const ts = normalizeInt(raw.ts);
      const lastSeenRaw = normalizeInt(raw.lastSeen);
      const lastSeen = lastSeenRaw || ts || 0;
      const phase = String(raw.lastPhase || raw.phase || "").trim();
      const lastLoadMs = Number(raw.lastLoadMs);
      const ewmaLoadMs = Number(raw.ewmaLoadMs);
      const lastHeapDeltaBytes = Number(raw.lastHeapDeltaBytes);
      const heapSupported = raw.heapSupported !== false;

      out[key] = {
        loads,
        failures,
        lastSeen,
        ts: lastSeen || ts,
        lastPhase: phase,
        phase,
        lastLoadMs: Number.isFinite(lastLoadMs) ? lastLoadMs : 0,
        ewmaLoadMs: Number.isFinite(ewmaLoadMs) ? ewmaLoadMs : 0,
        lastHeapDeltaBytes: Number.isFinite(lastHeapDeltaBytes) ? lastHeapDeltaBytes : 0,
        heapSupported: !!heapSupported,
      };
    }

    return out;
  }

  function normalizeSortMode(raw) {
    const v = String(raw || "").trim();
    return ["pack", "load_desc", "score_desc", "watchers_desc"].includes(v) ? v : "pack";
  }

  function normalizeTopNMode(raw) {
    const v = String(raw || "").trim();
    return ["all", "top10", "top20"].includes(v) ? v : "all";
  }

  function normalizeTopNScope(raw) {
    const v = String(raw || "").trim();
    return ["group", "global"].includes(v) ? v : "group";
  }

  function normalizePopupBgMode(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === POPUP_BG_BODY) return POPUP_BG_BODY;
    if (v === POPUP_BG_SIDE) return POPUP_BG_SIDE;
    return POPUP_BG_BAR;
  }

  function sanitizeGroupLabel(raw, fallback = "") {
    const base = String(raw == null ? "" : raw).replace(/\\s+/g, " ").trim();
    const fb = String(fallback == null ? "" : fallback).replace(/\\s+/g, " ").trim();
    const val = base || fb;
    return val ? val.slice(0, 80) : "";
  }

  function normalizeGroupLabels(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== "object") return out;
    for (const [rawKey, rawLabel] of Object.entries(rawMap)) {
      const key = String(rawKey || "").trim();
      if (!key) continue;
      const label = sanitizeGroupLabel(rawLabel, "");
      if (!label) continue;
      out[key] = label;
    }
    return out;
  }

  function groupDisplayTitle(group) {
    const base = sanitizeGroupLabel(group && group.title || "", "");
    return base;
  }

  function storageGetState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        STORAGE_KEY,
        STORAGE_SETS_KEY,
        STORAGE_INFO_KEY,
        STORAGE_RUNTIME_KEY,
        STORAGE_RUNTIME_ADVANCED_KEY,
        STORAGE_SORT_MODE_KEY,
        STORAGE_TOPN_MODE_KEY,
        STORAGE_TOPN_SCOPE_KEY,
        STORAGE_GROUP_LABELS_KEY,
        STORAGE_COL_WIDTHS_KEY,
        STORAGE_SCRIPT_COL_WIDTH_KEY,
        STORAGE_POPUP_BG_MODE_KEY,
        STORAGE_LEFTBAR_COLLAPSED_KEY,
        STORAGE_SET_CLICK_RELOAD_KEY,
        STORAGE_ORDER_OVERRIDES_KEY,
      ], (res) => {
        const le = chrome.runtime.lastError;
        if (le) {
          resolve({
            toggleMap: {},
            toggleSets: {},
            infoPrefs: defaultInfoPrefs(),
            runtimeStats: {},
            runtimeAdvanced: false,
            sortMode: "pack",
            topNMode: "all",
            topNScope: "group",
            groupLabels: {},
            colWidthMap: {},
            scriptColWidth: 248,
            popupBgMode: POPUP_BG_BAR,
            leftbarCollapsed: false,
            setClickReload: true,
            orderOverrideMap: {},
          });
          return;
        }

        const map = normalizeGlobalToggleMap(res ? res[STORAGE_KEY] : null);
        const sets = normalizeSets(res ? res[STORAGE_SETS_KEY] : null);
        const info = normalizeInfoPrefs(res ? res[STORAGE_INFO_KEY] : null);
        const runtime = normalizeRuntimeStats(res ? res[STORAGE_RUNTIME_KEY] : null);
        resolve({
          toggleMap: map,
          toggleSets: sets,
          infoPrefs: info,
          runtimeStats: runtime,
          runtimeAdvanced: normalizeBool(res ? res[STORAGE_RUNTIME_ADVANCED_KEY] : false, false),
          sortMode: normalizeSortMode(res ? res[STORAGE_SORT_MODE_KEY] : "pack"),
          topNMode: normalizeTopNMode(res ? res[STORAGE_TOPN_MODE_KEY] : "all"),
          topNScope: normalizeTopNScope(res ? res[STORAGE_TOPN_SCOPE_KEY] : "group"),
          groupLabels: normalizeGroupLabels(res ? res[STORAGE_GROUP_LABELS_KEY] : null),
          colWidthMap: normalizeColWidthMap(res ? res[STORAGE_COL_WIDTHS_KEY] : null),
          scriptColWidth: normalizeScriptColWidth(res ? res[STORAGE_SCRIPT_COL_WIDTH_KEY] : 248, 248),
          popupBgMode: normalizePopupBgMode(res ? res[STORAGE_POPUP_BG_MODE_KEY] : POPUP_BG_BAR),
          leftbarCollapsed: normalizeBool(res ? res[STORAGE_LEFTBAR_COLLAPSED_KEY] : false, false),
          setClickReload: normalizeBool(res ? res[STORAGE_SET_CLICK_RELOAD_KEY] : true, true),
          orderOverrideMap: normalizeOrderOverrideMap(res ? res[STORAGE_ORDER_OVERRIDES_KEY] : null),
        });
      });
    });
  }

  function storageSetMap(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: nextMap }, () => resolve());
    });
  }

  function storageSetSets(nextSets) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_SETS_KEY]: nextSets }, () => resolve());
    });
  }

  function storageSetInfoPrefs(nextPrefs) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_INFO_KEY]: nextPrefs }, () => resolve());
    });
  }

  function storageSetRuntimeAdvanced(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_RUNTIME_ADVANCED_KEY]: !!nextVal }, () => resolve());
    });
  }

  function storageSetSortMode(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_SORT_MODE_KEY]: normalizeSortMode(nextVal) }, () => resolve());
    });
  }

  function storageSetTopNMode(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_TOPN_MODE_KEY]: normalizeTopNMode(nextVal) }, () => resolve());
    });
  }

  function storageSetTopNScope(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_TOPN_SCOPE_KEY]: normalizeTopNScope(nextVal) }, () => resolve());
    });
  }

  function storageSetGroupLabels(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_GROUP_LABELS_KEY]: normalizeGroupLabels(nextMap) }, () => resolve());
    });
  }

  function storageSetColWidthMap(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_COL_WIDTHS_KEY]: normalizeColWidthMap(nextMap) }, () => resolve());
    });
  }

  function storageSetScriptColWidth(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_SCRIPT_COL_WIDTH_KEY]: normalizeScriptColWidth(nextVal, 248) }, () => resolve());
    });
  }

  function storageSetPopupBgMode(nextMode) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_POPUP_BG_MODE_KEY]: normalizePopupBgMode(nextMode) }, () => resolve());
    });
  }

  function storageSetLeftbarCollapsed(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_LEFTBAR_COLLAPSED_KEY]: !!nextVal }, () => resolve());
    });
  }

  function storageSetSetClickReload(nextVal) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_SET_CLICK_RELOAD_KEY]: !!nextVal }, () => resolve());
    });
  }

  function storageSetOrderOverrideMap(nextMap) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_ORDER_OVERRIDES_KEY]: normalizeOrderOverrideMap(nextMap) }, () => resolve());
    });
  }

  function storageRemoveKeys(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.remove(Array.isArray(keys) ? keys : [keys], () => resolve());
    });
  }

  function storageResetMap() {
    return storageRemoveKeys([STORAGE_KEY]);
  }
`;
}
