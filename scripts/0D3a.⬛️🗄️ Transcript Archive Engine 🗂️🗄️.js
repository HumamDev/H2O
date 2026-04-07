// ==UserScript==
// @h2o-id             0d3a.transcript.archive.engine
// @name               0D3a.⬛️🗄️ Transcript Archive Engine 🗂️🗄️
// @namespace          H2O.Premium.CGX.transcript.archive.engine
// @author             HumamDev
// @version            1.3.0
// @revision           001
// @build              260304-102754
// @description        Transcript archive engine: canonical public archiveBoot owner, orchestration, compatibility, and local fallback runtime.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  "use strict";

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  const archiveBoot = (H2O.archiveBoot = H2O.archiveBoot || {});

  const TAG = "[H2O.Archive]";
  const REQ = "h2o-ext-archive:v1:req";
  const RES = "h2o-ext-archive:v1:res";
  const SW = "h2o-ext-archive:v1";

  const MODE_LIVE_FIRST = "live_first";
  const MODE_ARCHIVE_FIRST = "archive_first";
  const MODE_ARCHIVE_ONLY = "archive_only";
  const ARCH_VIEW_CACHE_FIRST = "cache_first";
  const ARCH_VIEW_REBUILD_FIRST = "rebuild_first";
  const LOAD_STRATEGY_AUTO = "auto";
  const MM_BOOT_MODE_CACHE_FIRST = "cache_first";
  const MM_BOOT_MODE_REBUILD_FIRST = "rebuild_first";
  const DOCK_BG_BODY = "body";
  const DOCK_BG_BAR = "bar";
  const DOCK_BG_SIDE = "side";
  const RETENTION_DEFAULT = Object.freeze({ keepLatest: 30 });
  const BRIDGE_TIMEOUT_MS = 12000;
  const WORKBENCH_LOCAL_ONLY_WARNING = "Saved in local fallback mode — the extension workbench cannot see this until the archive bridge connects.";
  const FOLDER_FILTER_NONE = "__none__";
  const SAVE_MODE_SILENT = "silent";
  const SAVE_MODE_READER = "reader";
  const SAVE_MODE_LIBRARY = "library";
  const HASH_K_LIB = "h2o-archive-library";
  const HASH_K_FOLDER = "folderId";
  const HASH_K_CHAT = "chatId";
  const HASH_K_SNAPSHOT = "snapshotId";
  const HASH_K_VIEW = "view";
  const DOCK_COLLAPSE_KEY = "h2o:archive:dock:collapsed:v1";
  const EVT_ARCHIVE_REHYDRATE = "evt:h2o:archive:rehydrate";
  const EVT_ARCHIVE_SCROLL_TO_COLD = "evt:h2o:archive:scroll-to-cold";
  const EVT_ARCHIVE_HOTSTART_CHANGED = "evt:h2o:archive:hotstart:changed";
  const EVT_ARCHIVE_HYBRID_STATE = "evt:h2o:archive:hybrid:state";
  const HYBRID_APPLY_DEBOUNCE_MS = 120;
  const HYBRID_DETACH_THRESHOLD_NODES = 50;
  const HYBRID_MAX_SPACER_PX = 2500000;
  const ACTIVE_SOURCE_NATIVE = "native";
  const ACTIVE_SOURCE_SNAPSHOT = "snapshot";
  const ACTIVE_SOURCE_ARCHIVE = "archive";
  const FALLBACK_REASON_NONE = "none";
  const FALLBACK_REASON_SNAPSHOT_MISSING = "snapshot-missing";
  const FALLBACK_REASON_LIVE_SINGLE_VIEW = "live-single-view";
  const FALLBACK_REASON_HOST_FAILED = "host-failed";
  const FALLBACK_REASON_MOUNT_FAILED = "mount-failed";
  const ARCHIVE_ADVANCED_DEFAULTS = Object.freeze({
    autoCaptureWhenSnapshotMissing: false,
    allowStaleSnapshotBoot: false,
    keepPreviewUntilNativeStable: true,
    forceFallbackOnMountFailure: true,
    forceFallbackOnHostFailure: true,
    showFallbackReason: true,
    showSnapshotMeta: false,
    debugArchiveEvents: false,
  });
  const DOCK_TARGET_HEIGHT_MIN_PX = 24;
  const DOCK_TARGET_HEIGHT_FALLBACK_PX = 30; // 👈 Tune active-chat dock base height (also fallback when composer notice is not detected).
  const DOCK_TARGET_HEIGHT_NOTICE_TRIM_PX = 5; // 👈 Increase this to make dock shorter (applies to measured notice and active-chat base).
  const DOCK_CTRL_FONT_PX = 10.5; // 👈 Tune dock control text size.
  const DOCK_CTRL_PAD_Y_PX = 2; // 👈 Tune dock control vertical size.
  const DOCK_CTRL_PAD_X_PX = 5; // 👈 Tune dock control horizontal size.
  const DOCK_FOLD_TAB_BOTTOM_PX = 60;

  const ATTR_MESSAGE_AUTHOR_ROLE = "data-message-author-role";
  const SEL_MESSAGE_NODES = `[${ATTR_MESSAGE_AUTHOR_ROLE}="user"],[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`;
  const SEL_TURN_PRIMARY = 'article[data-testid="conversation-turn"],div[data-testid="conversation-turn"]';

  const services = (archiveBoot._services = archiveBoot._services || {});
  const serviceBootState = (archiveBoot._serviceBootState = archiveBoot._serviceBootState || {
    rendererStylesRequested: false,
    rendererListenersRequested: false,
  });

  function runRendererCatchUp(api) {
    if (!api || typeof api !== "object") return api || null;
    if (serviceBootState.rendererStylesRequested && typeof api.mountStyles === "function") {
      try { api.mountStyles(); } catch (e) { warn("renderer mountStyles catch-up failed", e); }
    }
    if (serviceBootState.rendererListenersRequested && typeof api.ensureBootListeners === "function") {
      try { api.ensureBootListeners(); } catch (e) { warn("renderer listener catch-up failed", e); }
    }
    return api;
  }

  archiveBoot._registerExtensionBridge = (api) => {
    if (!api || typeof api !== "object") return services.extensionBridge || null;
    services.extensionBridge = api;
    return api;
  };
  archiveBoot._registerRenderer = (api) => {
    if (!api || typeof api !== "object") return services.renderer || null;
    services.renderer = api;
    return runRendererCatchUp(api);
  };
  archiveBoot._getExtensionBridge = () => services.extensionBridge || null;
  archiveBoot._getRenderer = () => services.renderer || null;

  const state = {
    latestByChat: new Map(),
    snapshotChatById: new Map(),
    migratedSeen: new Set(),
    keyMigrationSeen: new Set(),
    lastChatId: "",
    lastHref: "",
    commandBarApi: null,
    commandBarBound: false,
    commandBarBindTimer: 0,
    dockWarnByChat: new Map(),
    dockStatusTextByChat: new Map(),
    lastLibraryHashHref: "",
  };

  function log(...args) {
    try { console.log(TAG, ...args); } catch {}
  }
  function warn(...args) {
    try { console.warn(TAG, ...args); } catch {}
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function toChatId(raw) {
    return String(raw || "").trim();
  }

  function stableHash(raw) {
    const s = String(raw || "");
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h >>> 0).toString(36);
  }

  function getCurrentChatId() {
    const fromUtil = H2O.util?.getChatId?.();
    const utilId = toChatId(fromUtil);
    if (utilId) return utilId;

    try {
      const u = new URL(W.location.href);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const cIdx = parts.indexOf("c");
      if (cIdx >= 0 && parts[cIdx + 1]) return toChatId(parts[cIdx + 1]);
      const gIdx = parts.indexOf("g");
      if (gIdx >= 0 && parts[gIdx + 1]) return toChatId(parts[gIdx + 1]);
      if (parts.length > 0) {
        const tail = toChatId(parts[parts.length - 1]);
        if (/^[a-z0-9-]{16,}$/i.test(tail)) return tail;
      }
      return "path:" + stableHash(u.pathname + "|" + u.search);
    } catch {
      return "path:" + stableHash(String(W.location.pathname || ""));
    }
  }

  function normalizeMode(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === MODE_ARCHIVE_FIRST) return MODE_ARCHIVE_FIRST;
    if (v === MODE_ARCHIVE_ONLY) return MODE_ARCHIVE_ONLY;
    return MODE_LIVE_FIRST;
  }

  function normalizePageMode(raw) {
    return normalizeMode(raw);
  }

  // pageModeLabel — moved to 0D3c


  function pageModeFace(modeRaw) {
    const mode = normalizePageMode(modeRaw);
    if (mode === MODE_ARCHIVE_FIRST) return "AP";
    if (mode === MODE_ARCHIVE_ONLY) return "AO";
    return "L";
  }

  function normalizeLoadStrategy(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === LOAD_STRATEGY_AUTO) return LOAD_STRATEGY_AUTO;
    if (v === ARCH_VIEW_CACHE_FIRST || v === "fast") return ARCH_VIEW_CACHE_FIRST;
    return ARCH_VIEW_REBUILD_FIRST;
  }

  function loadStrategyLabel(strategyRaw) {
    const strategy = normalizeLoadStrategy(strategyRaw);
    if (strategy === LOAD_STRATEGY_AUTO) return "Auto";
    if (strategy === ARCH_VIEW_CACHE_FIRST) return "Fast";
    return "Safe";
  }

  function loadStrategyFace(strategyRaw) {
    const strategy = normalizeLoadStrategy(strategyRaw);
    if (strategy === LOAD_STRATEGY_AUTO) return "A";
    if (strategy === ARCH_VIEW_CACHE_FIRST) return "F";
    return "S";
  }

  function legacyViewModeForStrategy(strategyRaw) {
    const strategy = normalizeLoadStrategy(strategyRaw);
    return strategy === ARCH_VIEW_REBUILD_FIRST ? ARCH_VIEW_REBUILD_FIRST : ARCH_VIEW_CACHE_FIRST;
  }

  function loadStrategyFromLegacyView(viewModeRaw) {
    const viewMode = normalizeViewMode(viewModeRaw);
    return viewMode === ARCH_VIEW_CACHE_FIRST ? ARCH_VIEW_CACHE_FIRST : ARCH_VIEW_REBUILD_FIRST;
  }

  function activeSourceLabel(sourceRaw) {
    const source = String(sourceRaw || "").trim().toLowerCase();
    if (source === ACTIVE_SOURCE_SNAPSHOT) return "Snapshot";
    if (source === ACTIVE_SOURCE_ARCHIVE) return "Archive";
    return "Native";
  }

  function normalizeFallbackReason(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || value === FALLBACK_REASON_NONE) return FALLBACK_REASON_NONE;
    if (value === FALLBACK_REASON_SNAPSHOT_MISSING) return FALLBACK_REASON_SNAPSHOT_MISSING;
    if (value === FALLBACK_REASON_LIVE_SINGLE_VIEW) return FALLBACK_REASON_LIVE_SINGLE_VIEW;
    if (value === FALLBACK_REASON_HOST_FAILED) return FALLBACK_REASON_HOST_FAILED;
    if (value === FALLBACK_REASON_MOUNT_FAILED) return FALLBACK_REASON_MOUNT_FAILED;
    if (/snapshot/.test(value) && /missing/.test(value)) return FALLBACK_REASON_SNAPSHOT_MISSING;
    if (/host/.test(value) && /fail/.test(value)) return FALLBACK_REASON_HOST_FAILED;
    if (/mount/.test(value) && /fail/.test(value)) return FALLBACK_REASON_MOUNT_FAILED;
    if (/live/.test(value) && /single/.test(value)) return FALLBACK_REASON_LIVE_SINGLE_VIEW;
    return value;
  }

  function fallbackReasonLabel(reasonRaw) {
    const reason = normalizeFallbackReason(reasonRaw);
    if (reason === FALLBACK_REASON_SNAPSHOT_MISSING) return "Snapshot Missing";
    if (reason === FALLBACK_REASON_LIVE_SINGLE_VIEW) return "Live Keeps Native View";
    if (reason === FALLBACK_REASON_HOST_FAILED) return "Host Failed";
    if (reason === FALLBACK_REASON_MOUNT_FAILED) return "Mount Failed";
    if (reason === FALLBACK_REASON_NONE) return "None";
    return String(reason || "None");
  }

  function normalizeArchiveAdvancedSettings(raw) {
    const src = isObj(raw) ? raw : {};
    return {
      autoCaptureWhenSnapshotMissing: src.autoCaptureWhenSnapshotMissing === true,
      allowStaleSnapshotBoot: src.allowStaleSnapshotBoot === true,
      keepPreviewUntilNativeStable: src.keepPreviewUntilNativeStable !== false,
      forceFallbackOnMountFailure: src.forceFallbackOnMountFailure !== false,
      forceFallbackOnHostFailure: src.forceFallbackOnHostFailure !== false,
      showFallbackReason: src.showFallbackReason !== false,
      showSnapshotMeta: src.showSnapshotMeta === true,
      debugArchiveEvents: src.debugArchiveEvents === true,
    };
  }

  function buildArchiveHelpText(pageModeRaw) {
    const pageMode = normalizePageMode(pageModeRaw);
    if (pageMode === MODE_ARCHIVE_FIRST) return "Archive Preview shows one archive-first transcript in a controlled single-view surface.";
    if (pageMode === MODE_ARCHIVE_ONLY) return "Archive Only hides the live page and shows archive content only.";
    return "Live shows the normal native chat only, even when archive data is used internally.";
  }

  function normalizeRole(raw) {
    const v = String(raw || "").trim().toLowerCase();
    return v === "user" ? "user" : "assistant";
  }

  function normalizeCreatedAt(raw) {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.floor(n);
    const d = new Date(String(raw));
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  function normalizeMessages(messages) {
    const src = Array.isArray(messages) ? messages : [];
    const rows = [];
    for (let i = 0; i < src.length; i += 1) {
      const m = isObj(src[i]) ? src[i] : {};
      const role = normalizeRole(m.role || m.author || m.type);
      const text = String(m.text || m.content || "").trim();
      if (!text) continue;
      const orderRaw = Number(m.order);
      rows.push({
        role,
        text,
        order: Number.isFinite(orderRaw) ? Math.floor(orderRaw) : i,
        createdAt: normalizeCreatedAt(m.createdAt ?? m.create_time ?? m.timestamp),
      });
    }
    rows.sort((a, b) => Number(a.order) - Number(b.order));
    for (let i = 0; i < rows.length; i += 1) rows[i].order = i;
    return rows;
  }

  function buildSnapshotExcerpt(messages) {
    const rows = normalizeMessages(messages);
    const firstAssistant = rows.find((m) => m.role === "assistant" && m.text);
    const first = firstAssistant || rows[0] || null;
    return String(first?.text || "").replace(/\s+/g, " ").trim().slice(0, 220);
  }

  function buildSnapshotMetaHints(messages) {
    const rows = normalizeMessages(messages);
    return {
      excerpt: buildSnapshotExcerpt(rows),
      answerCount: countAssistantTurns(rows),
      messageCount: rows.length,
      updatedAt: nowIso(),
    };
  }

  function captureDomNormalizedMessages() {
    const nodes = collectNativeMessageNodes(D);
    const out = [];
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      const role = normalizeRole(el?.getAttribute?.(ATTR_MESSAGE_AUTHOR_ROLE) || "assistant");
      const text = String(el?.innerText || el?.textContent || "").trim();
      if (!text) continue;
      const createdAt = normalizeCreatedAt(H2O.time?.getCreateTime?.(el));
      out.push({ role, text, order: out.length, createdAt });
    }
    return out;
  }

  function isArchiveInjectedNode(el) {
    if (!el || el.nodeType !== 1) return true;
    if (!el.isConnected) return true;
    try {
      return !!(
        el.closest(".h2o-cold-layer")
        || el.closest(".h2o-archive-native-detached-bin")
        || el.closest('[data-h2o-cold="1"]')
      );
    } catch {
      return true;
    }
  }

  // collectNativeTurnNodes — moved to 0D3c


  function normalizeMiniMapBootMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === MM_BOOT_MODE_CACHE_FIRST) return MM_BOOT_MODE_CACHE_FIRST;
    return MM_BOOT_MODE_REBUILD_FIRST;
  }

  function getMiniMapUiApi() {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.ui
        || TOPW.H2O_MM_SHARED?.api?.ui
        || W.H2O?.MM?.mnmp?.api?.ui
        || null;
    } catch {
      return null;
    }
  }

  function getMiniMapRuntimeApi() {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.rt
        || TOPW.H2O_MM_SHARED?.api?.rt
        || W.H2O?.MM?.mnmp?.api?.rt
        || null;
    } catch {
      return null;
    }
  }

  function getMiniMapBootModeSetting() {
    const ui = getMiniMapUiApi();
    if (!ui || typeof ui.getBootMode !== "function") {
      return { available: false, mode: MM_BOOT_MODE_REBUILD_FIRST };
    }
    try {
      return { available: true, mode: normalizeMiniMapBootMode(ui.getBootMode()) };
    } catch {
      return { available: false, mode: MM_BOOT_MODE_REBUILD_FIRST };
    }
  }

  function applyMiniMapRuntimeRefresh(reason = "archive:mmboot-change") {
    const rt = getMiniMapRuntimeApi();
    if (!rt) return false;
    try {
      if (typeof rt.rebuildNow === "function") {
        rt.rebuildNow(String(reason || "archive:mmboot-change"));
        return true;
      }
    } catch {}
    try {
      if (typeof rt.scheduleRebuild === "function") {
        rt.scheduleRebuild(String(reason || "archive:mmboot-change"));
        return true;
      }
    } catch {}
    return false;
  }

  function setMiniMapBootModeSetting(modeRaw) {
    const next = normalizeMiniMapBootMode(modeRaw);
    const ui = getMiniMapUiApi();
    if (!ui || typeof ui.setBootMode !== "function") {
      return { ok: false, available: false, mode: next };
    }
    try {
      const applied = normalizeMiniMapBootMode(ui.setBootMode(next));
      applyMiniMapRuntimeRefresh("archive:mmboot-change");
      return { ok: true, available: true, mode: applied };
    } catch {
      return { ok: false, available: false, mode: next };
    }
  }

  // parseReaderHashRequest — removed (reader deprecated)

  // buildReaderTabUrl — removed (reader deprecated)

  function normalizeWorkbenchRoute(routeRaw) {
    const raw = String(routeRaw || "").trim();
    if (!raw) return "/saved";
    if (raw.startsWith("#")) return raw.slice(1) || "/saved";
    return raw.startsWith("/") ? raw : ("/" + raw);
  }

  function normalizeArchiveView(raw) {
    const view = String(raw || "").trim().toLowerCase();
    if (view === "pinned") return "pinned";
    if (view === "archive") return "archive";
    return "saved";
  }

  function normalizeAfterSaveMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === SAVE_MODE_READER) return SAVE_MODE_READER;
    if (mode === SAVE_MODE_LIBRARY) return SAVE_MODE_LIBRARY;
    return SAVE_MODE_SILENT;
  }

  function normalizeFolderFilter(raw) {
    return String(raw || "").trim();
  }

  function parseLibraryHashRequest() {
    const raw = String(W.location.hash || "");
    if (!raw) return null;
    const hash = raw.startsWith("#") ? raw.slice(1) : raw;
    const params = new URLSearchParams(hash);
    if (String(params.get(HASH_K_LIB) || "") !== "1") return null;
    return {
      view: normalizeArchiveView(params.get(HASH_K_VIEW) || "saved"),
      folderId: normalizeFolderFilter(params.get(HASH_K_FOLDER) || ""),
      chatId: toChatId(params.get(HASH_K_CHAT) || ""),
      snapshotId: String(params.get(HASH_K_SNAPSHOT) || "").trim(),
      source: "hash",
    };
  }

  function buildSavedChatsCompatUrl(opts = {}) {
    const u = new URL(W.location.href);
    const p = new URLSearchParams();
    p.set(HASH_K_LIB, "1");
    const view = normalizeArchiveView(opts.view || "saved");
    if (view !== "saved") p.set(HASH_K_VIEW, view);
    const folderId = normalizeFolderFilter(opts.folderId || "");
    if (folderId) p.set(HASH_K_FOLDER, folderId);
    const chatId = toChatId(opts.chatId || "");
    if (chatId) p.set(HASH_K_CHAT, chatId);
    const snapshotId = String(opts.snapshotId || "").trim();
    if (snapshotId) p.set(HASH_K_SNAPSHOT, snapshotId);
    u.hash = p.toString();
    return u.toString();
  }

  function buildSavedChatsRoute(opts = {}) {
    const view = normalizeArchiveView(opts.view || "saved");
    const params = new URLSearchParams();
    const folderId = normalizeFolderFilter(opts.folderId || "");
    if (folderId) params.set("folder", folderId);
    const chatId = toChatId(opts.chatId || "");
    if (chatId) params.set("chat", chatId);
    const snapshotId = String(opts.snapshotId || "").trim();
    if (snapshotId) params.set("snapshot", snapshotId);
    const suffix = params.toString();
    return `/${view}${suffix ? `?${suffix}` : ""}`;
  }

  function normalizeRichTurns(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < src.length; i += 1) {
      const row = isObj(src[i]) ? src[i] : {};
      const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.idx ?? (i + 1)) || (i + 1)));
      const role = normalizeRole(row.role || row.author || "assistant");
      const outerHTML = String(row.outerHTML || row.html || "").trim();
      if (!outerHTML) continue;
      out.push({ turnIdx, role, outerHTML, html: outerHTML });
    }
    out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
    return out;
  }

  function normalizeTurnHighlights(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    for (let i = 0; i < src.length; i += 1) {
      const row = isObj(src[i]) ? src[i] : {};
      const turnIdx = Math.max(1, Math.floor(Number(row.turnIdx ?? row.answerIndex ?? (i + 1)) || (i + 1)));
      const colors = uniqStringList(row.colors || row.highlightColors || row.values || []);
      if (!colors.length) continue;
      out.push({ turnIdx, colors });
    }
    out.sort((a, b) => Number(a.turnIdx) - Number(b.turnIdx));
    return out;
  }

  function normalizeSnapshotMeta(metaRaw) {
    const src = isObj(metaRaw) ? metaRaw : {};
    const out = { ...src };
    const richTurns = normalizeRichTurns(src.richTurns);
    if (richTurns.length) out.richTurns = richTurns;
    else delete out.richTurns;
    const turnHighlights = normalizeTurnHighlights(src.turnHighlights || src.assistantTurnHighlights);
    if (turnHighlights.length) out.turnHighlights = turnHighlights;
    else delete out.turnHighlights;
    const folderId = String(src.folderId || src.folder || "").trim();
    if (folderId) out.folderId = folderId;
    else delete out.folderId;
    const folderName = String(src.folderName || "").trim();
    if (folderName) out.folderName = folderName;
    else delete out.folderName;
    return out;
  }

  function captureDomRichTurns(turnsRaw = null) {
    const turns = Array.isArray(turnsRaw) ? turnsRaw.filter(Boolean) : collectNativeTurnNodes(D);
    if (!turns.length) return [];
    const out = [];
    for (let i = 0; i < turns.length; i += 1) {
      const turnEl = turns[i];
      if (!turnEl) continue;
      const hasAssistant = !!turnEl.querySelector?.(`[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`);
      const hasUser = !!turnEl.querySelector?.(`[${ATTR_MESSAGE_AUTHOR_ROLE}="user"]`);
      const role = hasAssistant ? "assistant" : (hasUser ? "user" : "assistant");
      const outerHTML = String(turnEl.outerHTML || "").trim();
      if (!outerHTML) continue;
      out.push({
        turnIdx: i + 1,
        role,
        outerHTML,
      });
    }
    return out;
  }

  /* ───────────────────────────── Folder bindings — delegated to 5C1a (H2O.folders) ───────────────────────────── */

  function getFoldersList() {
    // Prefer canonical owner (5C1a)
    if (H2O.folders && typeof H2O.folders.list === 'function') {
      return H2O.folders.list();
    }
    // Legacy fallback: read from known localStorage keys
    const keys = ['h2o:prm:cgx:fldrs:state:data:v1', 'h2o:folders:data:v1', 'h2o:folders:v1'];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.folders)) return parsed.folders;
      } catch {}
    }
    return [];
  }

  function resolveFolderBinding(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { folderId: '', folderName: '' };

    // Prefer canonical owner (5C1a)
    if (H2O.folders && typeof H2O.folders.getBinding === 'function') {
      return H2O.folders.getBinding(chatId);
    }

    // Legacy fallback: archive's own binding key
    const key = `${dataNs()}:archiveFolder:${chatId}:v1`;
    const raw = lsGetJson(key, null);
    if (!raw) return { folderId: '', folderName: '' };
    const folderId = String(raw.folderId || raw.folder || '').trim();
    const folderName = String(raw.folderName || '').trim();
    if (!folderId) return { folderId: '', folderName: '' };
    return { folderId, folderName: folderName || folderId };
  }

  function setFolderBinding(chatIdRaw, folderIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { folderId: '', folderName: '' };
    const folderId = String(folderIdRaw || '').trim();

    // Prefer canonical owner (5C1a)
    if (H2O.folders && typeof H2O.folders.setBinding === 'function') {
      return H2O.folders.setBinding(chatId, folderId);
    }

    // Legacy fallback: archive's own binding key
    const key = `${dataNs()}:archiveFolder:${chatId}:v1`;
    if (!folderId) {
      lsDel(key);
      return { folderId: '', folderName: '' };
    }
    const folders = getFoldersList();
    const folder = folders.find(f => String(f.id || f.folderId || '') === folderId);
    const folderName = String(folder?.name || folder?.title || '').trim();
    lsSetJson(key, { folderId, folderName, updatedAt: new Date().toISOString() });
    return { folderId, folderName };
  }


  function captureTurnHighlightColors(turnEl) {
    if (!(turnEl && typeof turnEl.querySelector === "function")) return [];
    const root = turnEl.querySelector(`[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`) || turnEl;
    if (!(root && typeof root.querySelectorAll === "function")) return [];
    const nodes = Array.from(root.querySelectorAll("[data-highlight-color]"));
    return uniqStringList(nodes.map((el) => String(el?.getAttribute?.("data-highlight-color") || el?.dataset?.highlightColor || "").trim()));
  }

  function captureAssistantTurnHighlights(turnsRaw = null) {
    const turns = Array.isArray(turnsRaw) ? turnsRaw.filter(Boolean) : collectNativeTurnNodes(D);
    if (!turns.length) return [];
    const out = [];
    let answerIdx = 0;
    for (const turnEl of turns) {
      const hasAssistant = !!turnEl?.querySelector?.(`[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`);
      if (!hasAssistant) continue;
      answerIdx += 1;
      const colors = captureTurnHighlightColors(turnEl);
      if (!colors.length) continue;
      out.push({ turnIdx: answerIdx, colors });
    }
    return out;
  }

  function dataNs() {
    return String(H2O.data?.ready?.ns?.NS_DISK || "h2o:prm:cgx:h2odata");
  }

  function keyArchiveIndex() {
    return `${dataNs()}:archive:index:v1`;
  }
  function keyArchiveData(chatId) {
    return `${dataNs()}:archive:v1:${chatId}`;
  }
  function keyVaultIndex(chatId) {
    return `${dataNs()}:vault:index:v1:${chatId}`;
  }
  function keyVaultItem(chatId, vid) {
    return `${dataNs()}:vault:v1:${chatId}:${vid}`;
  }

  function keyBootMode(chatId) {
    return `${dataNs()}:chatBootMode:${chatId}`;
  }
  function keyChatIndex(chatId) {
    return `${dataNs()}:chatIndex:${chatId}`;
  }
  function keyMigrated(chatId) {
    return `${dataNs()}:chatMigrated:${chatId}:v1`;
  }
  function keyViewMode(chatId) {
    return `${dataNs()}:chatViewMode:${chatId}`;
  }
  function keyLoadStrategy(chatId) {
    return `${dataNs()}:chatLoadStrategy:${chatId}:v1`;
  }
  function keyHotStart(chatId) {
    return `${dataNs()}:chatHotStart:${chatId}`;
  }
  function keyBaseline(chatId) {
    return `${dataNs()}:chatBaseline:${chatId}`;
  }
  function keyArchiveAdvancedSettings() {
    return `${dataNs()}:archive:advanced:v1`;
  }
  function keyCommandBarBgMode() {
    return `${dataNs()}:commandbar:bg:v1`;
  }
  function keyDockBgMode() {
    return `${dataNs()}:archive:dock:bg:v1`;
  }
  function keyCommandBarAfterSaveMode() {
    return `${dataNs()}:commandbar:after-save:v1`;
  }
  function keyDockAfterSaveMode() {
    return `${dataNs()}:archive:dock:after-save:v1`;
  }
  function keyCommandBarImportantOnly() {
    return `${dataNs()}:commandbar:important-only:v1`;
  }
  function keyDockImportantOnly() {
    return `${dataNs()}:archive:dock:important-only:v1`;
  }
  function keyCommandBarInfoOpen(chatId) {
    return `${dataNs()}:commandbar:info:${chatId}:v1`;
  }
  function keyDockInfoOpen(chatId) {
    return `${dataNs()}:archive:dock:info:${chatId}:v1`;
  }
  function keyLegacyBootMode(chatId) {
    return `h2o:chatBootMode:${chatId}`;
  }
  function keyLegacyChatIndex(chatId) {
    return `h2o:chatIndex:${chatId}`;
  }
  function keyLegacyMigrated(chatId) {
    return `h2o:chatMigrated:${chatId}:v1`;
  }

  function lsGetStr(key, fallback = null) {
    try { return localStorage.getItem(String(key)) ?? fallback; } catch { return fallback; }
  }
  function lsSetStr(key, value) {
    try { localStorage.setItem(String(key), String(value)); return true; } catch { return false; }
  }
  function lsDel(key) {
    try { localStorage.removeItem(String(key)); return true; } catch { return false; }
  }
  function lsGetJson(key, fallback = null) {
    const raw = lsGetStr(key, null);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  function lsSetJson(key, value) {
    try { localStorage.setItem(String(key), JSON.stringify(value)); return true; } catch { return false; }
  }

  function lsGetStrWithFallback(nextKey, legacyKey, fallback = null) {
    const next = lsGetStr(nextKey, null);
    if (next != null) return next;
    return lsGetStr(legacyKey, fallback);
  }

  function lsGetJsonWithFallback(nextKey, legacyKey, fallback = null) {
    const next = lsGetJson(nextKey, null);
    if (next != null) return next;
    return lsGetJson(legacyKey, fallback);
  }

  function lsSetStrBoth(nextKey, legacyKey, value) {
    lsSetStr(nextKey, value);
    if (legacyKey) lsSetStr(legacyKey, value);
    return value;
  }

  function lsSetJsonBoth(nextKey, legacyKey, value) {
    lsSetJson(nextKey, value);
    if (legacyKey) lsSetJson(legacyKey, value);
    return value;
  }

  function normalizeViewMode(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === ARCH_VIEW_CACHE_FIRST) return ARCH_VIEW_CACHE_FIRST;
    return ARCH_VIEW_REBUILD_FIRST;
  }

  function normalizeDockBgMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === DOCK_BG_BODY) return DOCK_BG_BODY;
    if (mode === DOCK_BG_SIDE) return DOCK_BG_SIDE;
    return DOCK_BG_BAR;
  }

  function normalizeHotStart(raw, fallback = 0) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return Math.max(0, Math.floor(Number(fallback) || 0));
    return Math.max(0, Math.floor(n));
  }

  function normalizeBaseline(raw, fallback = null) {
    const src = isObj(raw) ? raw : {};
    const snapshotId = String(src.snapshotId || "");
    const baselineCount = normalizeHotStart(src.baselineCount, 0);
    const capturedAt = String(src.capturedAt || "");
    if (!snapshotId && !baselineCount) return fallback;
    return { snapshotId, baselineCount, capturedAt };
  }

  function migrateLocalChatKeysIfNeeded(chatIdRaw) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId || state.keyMigrationSeen.has(chatId)) return;
    const copyDel = (legacyKey, nextKey, parser = null, serializer = null) => {
      const oldRaw = lsGetStr(legacyKey, null);
      if (oldRaw == null) return;
      if (lsGetStr(nextKey, null) != null) {
        lsDel(legacyKey);
        return;
      }
      if (parser || serializer) {
        const parsed = parser ? parser(oldRaw) : oldRaw;
        if (parsed == null) return;
        if (serializer) serializer(nextKey, parsed);
        else lsSetStr(nextKey, parsed);
        lsDel(legacyKey);
        return;
      }
      lsSetStr(nextKey, oldRaw);
      lsDel(legacyKey);
    };
    copyDel(keyLegacyBootMode(chatId), keyBootMode(chatId));
    copyDel(
      keyLegacyChatIndex(chatId),
      keyChatIndex(chatId),
      (raw) => {
        try { return JSON.parse(raw); } catch { return null; }
      },
      (k, v) => { lsSetJson(k, v); },
    );
    copyDel(
      keyLegacyMigrated(chatId),
      keyMigrated(chatId),
      (raw) => {
        try { return JSON.parse(raw); } catch { return raw === "true" || raw === "1"; }
      },
      (k, v) => { lsSetJson(k, !!v); },
    );
    state.keyMigrationSeen.add(chatId);
  }

  function getDockCollapsed() {
    return !!lsGetJsonWithFallback(`${dataNs()}:commandbar:collapsed:v1`, DOCK_COLLAPSE_KEY, false);
  }

  function setDockCollapsed(collapsed) {
    lsSetJsonBoth(`${dataNs()}:commandbar:collapsed:v1`, DOCK_COLLAPSE_KEY, !!collapsed);
    return !!collapsed;
  }

  function getDockBgModeSetting() {
    return normalizeDockBgMode(lsGetStrWithFallback(keyCommandBarBgMode(), keyDockBgMode(), DOCK_BG_BAR));
  }

  function getDockAfterSaveMode() {
    return normalizeAfterSaveMode(lsGetStrWithFallback(keyCommandBarAfterSaveMode(), keyDockAfterSaveMode(), SAVE_MODE_SILENT));
  }

  function setDockBgModeSetting(modeRaw) {
    const mode = normalizeDockBgMode(modeRaw);
    lsSetStrBoth(keyCommandBarBgMode(), keyDockBgMode(), mode);
    return mode;
  }

  function setDockAfterSaveMode(modeRaw) {
    const mode = normalizeAfterSaveMode(modeRaw);
    lsSetStrBoth(keyCommandBarAfterSaveMode(), keyDockAfterSaveMode(), mode);
    return mode;
  }

  function getDockImportantOnly() {
    return !!lsGetJsonWithFallback(keyCommandBarImportantOnly(), keyDockImportantOnly(), false);
  }

  function setDockImportantOnly(on) {
    lsSetJsonBoth(keyCommandBarImportantOnly(), keyDockImportantOnly(), !!on);
    return !!on;
  }

  function getDockInfoPanelOpen(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return false;
    return !!lsGetJsonWithFallback(keyCommandBarInfoOpen(chatId), keyDockInfoOpen(chatId), false);
  }

  function setDockInfoPanelOpen(chatIdRaw, open) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return false;
    lsSetJsonBoth(keyCommandBarInfoOpen(chatId), keyDockInfoOpen(chatId), !!open);
    return !!open;
  }

  function uniqStringList(arr) {
    const seen = new Set();
    const out = [];
    const src = Array.isArray(arr) ? arr : [];
    for (const item of src) {
      const v = String(item || "").trim();
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  }

  function normalizeChatIndex(raw) {
    const src = isObj(raw) ? raw : {};
    const keepLatestRaw = Number(src.retentionPolicy?.keepLatest);
    const keepLatest = Number.isFinite(keepLatestRaw)
      ? Math.max(1, Math.min(1000, Math.floor(keepLatestRaw)))
      : RETENTION_DEFAULT.keepLatest;
    return {
      lastSnapshotId: String(src.lastSnapshotId || ""),
      lastCapturedAt: String(src.lastCapturedAt || ""),
      pinnedSnapshotIds: uniqStringList(src.pinnedSnapshotIds),
      retentionPolicy: { keepLatest },
      lastDigest: String(src.lastDigest || ""),
    };
  }

  function getLocalBootMode(chatId) {
    migrateLocalChatKeysIfNeeded(chatId);
    return normalizeMode(lsGetStr(keyBootMode(chatId), MODE_LIVE_FIRST));
  }
  function setLocalBootMode(chatId, mode) {
    migrateLocalChatKeysIfNeeded(chatId);
    const norm = normalizeMode(mode);
    lsSetStr(keyBootMode(chatId), norm);
    return norm;
  }
  function getLocalChatIndex(chatId) {
    migrateLocalChatKeysIfNeeded(chatId);
    return normalizeChatIndex(lsGetJson(keyChatIndex(chatId), null));
  }
  function setLocalChatIndex(chatId, idx) {
    migrateLocalChatKeysIfNeeded(chatId);
    const norm = normalizeChatIndex(idx);
    lsSetJson(keyChatIndex(chatId), norm);
    return norm;
  }
  function getLocalMigrated(chatId) {
    migrateLocalChatKeysIfNeeded(chatId);
    return !!lsGetJson(keyMigrated(chatId), false);
  }
  function setLocalMigrated(chatId, migrated) {
    migrateLocalChatKeysIfNeeded(chatId);
    lsSetJson(keyMigrated(chatId), !!migrated);
    return !!migrated;
  }
  function getLocalViewMode(chatId) {
    return normalizeViewMode(lsGetStr(keyViewMode(chatId), ARCH_VIEW_REBUILD_FIRST));
  }
  function setLocalViewMode(chatId, viewModeRaw) {
    const viewMode = normalizeViewMode(viewModeRaw);
    lsSetStr(keyViewMode(chatId), viewMode);
    return viewMode;
  }
  function getLocalLoadStrategy(chatId) {
    const next = lsGetStr(keyLoadStrategy(chatId), null);
    if (next != null) return normalizeLoadStrategy(next);
    return loadStrategyFromLegacyView(getLocalViewMode(chatId));
  }
  function setLocalLoadStrategy(chatId, strategyRaw) {
    const strategy = normalizeLoadStrategy(strategyRaw);
    lsSetStr(keyLoadStrategy(chatId), strategy);
    setLocalViewMode(chatId, legacyViewModeForStrategy(strategy));
    return strategy;
  }
  // getLocalHotStart — moved to 0D3c

  // setLocalHotStart — moved to 0D3c

  // delLocalHotStart — moved to 0D3c

  function getLocalBaseline(chatId) {
    return normalizeBaseline(lsGetJson(keyBaseline(chatId), null), null);
  }
  function setLocalBaseline(chatId, baseline) {
    const safe = normalizeBaseline(baseline, null);
    if (!safe) {
      lsDel(keyBaseline(chatId));
      return null;
    }
    lsSetJson(keyBaseline(chatId), safe);
    return safe;
  }
  function getArchiveAdvancedSettings() {
    return normalizeArchiveAdvancedSettings(lsGetJson(keyArchiveAdvancedSettings(), null));
  }
  function setArchiveAdvancedSettings(nextRaw = {}) {
    const current = getArchiveAdvancedSettings();
    const next = normalizeArchiveAdvancedSettings({ ...current, ...(isObj(nextRaw) ? nextRaw : {}) });
    lsSetJson(keyArchiveAdvancedSettings(), next);
    return next;
  }

  function makeSnapshotId(prefix = "legacy") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function canonicalToLegacySnapshot(snapshot) {
    if (!isObj(snapshot)) return null;
    const chatId = toChatId(snapshot.chatId);
    if (!chatId) return null;
    const messages = normalizeMessages(snapshot.messages);
    const meta = normalizeSnapshotMeta(snapshot.meta);
    return {
      schema: "H2O.archive.v1",
      snapshotId: String(snapshot.snapshotId || makeSnapshotId("legacy")),
      chatId,
      capturedAt: String(snapshot.createdAt || snapshot.capturedAt || nowIso()),
      href: String(snapshot.href || W.location.href || ""),
      meta,
      messages: messages.map((m) => ({
        id: "",
        role: m.role,
        text: m.text,
        create_time: m.createdAt,
      })),
    };
  }

  function legacyToCanonicalSnapshot(raw, chatIdHint = "") {
    const src = isObj(raw) ? raw : null;
    if (!src) return null;
    const chatId = toChatId(src.chatId || chatIdHint);
    if (!chatId) return null;
    const messages = normalizeMessages(
      (Array.isArray(src.messages) ? src.messages : []).map((m, idx) => ({
        role: m?.role,
        text: m?.text,
        order: Number(m?.order),
        createdAt: m?.create_time ?? m?.createdAt ?? idx,
      })),
    );
    const createdAt = String(src.capturedAt || src.createdAt || nowIso());
    const snapshotId = String(src.snapshotId || (`legacy:${chatId}:${createdAt}`));
    return {
      snapshotId,
      chatId,
      createdAt,
      schemaVersion: 1,
      messageCount: messages.length,
      digest: String(src.digest || ""),
      messages,
      meta: normalizeSnapshotMeta(src.meta),
      source: "legacy",
    };
  }

  function cacheSnapshot(snapshot) {
    const canonical = canonicalSnapshot(snapshot);
    if (!canonical) return null;
    state.latestByChat.set(canonical.chatId, canonical);
    state.snapshotChatById.set(canonical.snapshotId, canonical.chatId);
    return canonical;
  }

  function canonicalSnapshot(raw) {
    if (!isObj(raw)) return null;
    const chatId = toChatId(raw.chatId);
    if (!chatId) return null;
    const messages = normalizeMessages(raw.messages);
    const createdAt = String(raw.createdAt || raw.capturedAt || nowIso());
    const snapshotId = String(raw.snapshotId || `snap:${chatId}:${createdAt}`);
    return {
      snapshotId,
      chatId,
      createdAt,
      schemaVersion: Number(raw.schemaVersion || 1),
      messageCount: Number(raw.messageCount || messages.length),
      digest: String(raw.digest || ""),
      messages,
      meta: normalizeSnapshotMeta(raw.meta),
    };
  }

  async function sha256Hex(text) {
    const raw = String(text || "");
    try {
      const buf = new TextEncoder().encode(raw);
      const digest = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return "weak:" + stableHash(raw);
    }
  }

  function getExtensionBridge() {
    return archiveBoot._getExtensionBridge?.() || null;
  }

  function getExtensionBridgeState() {
    return getExtensionBridge()?.getState?.() || {
      extensionChecked: false,
      extensionBacked: false,
      bridgeClientId: "",
      bridgeSessionToken: "",
      bridgeSessionReady: false,
    };
  }

  function isExtensionBacked() {
    return getExtensionBridgeState().extensionBacked === true;
  }

  function getStorageMode() {
    return isExtensionBacked() ? "extension" : "local";
  }

  async function ensureBridgeSession(force = false) {
    const bridge = getExtensionBridge();
    if (!bridge || typeof bridge.ensureSession !== "function") return false;
    return !!(await bridge.ensureSession(force));
  }

  async function bridgeCall(op, payload = {}, timeoutMs = BRIDGE_TIMEOUT_MS) {
    const bridge = getExtensionBridge();
    if (!bridge || typeof bridge.call !== "function") throw new Error("extension bridge unavailable");
    return bridge.call(op, payload, { timeoutMs });
  }

  async function ensureExtensionBacked(force = false) {
    const bridge = getExtensionBridge();
    if (!bridge || typeof bridge.isAvailable !== "function") return false;
    return !!(await bridge.isAvailable(force));
  }

  function resetExtensionBridge() {
    try { getExtensionBridge()?.reset?.(); } catch {}
  }

  async function getPageMode(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return MODE_LIVE_FIRST;
    if (await ensureExtensionBacked()) {
      try {
        const res = await bridgeCall("getBootMode", { chatId });
        return normalizePageMode(res?.mode);
      } catch {}
    }
    return getLocalBootMode(chatId);
  }

  async function setPageMode(chatIdRaw, modeRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const mode = normalizePageMode(modeRaw);
    if (await ensureExtensionBacked()) {
      try {
        const res = await bridgeCall("setBootMode", { chatId, mode });
        await applyBootMode(chatId, "set-page-mode");
        await refreshDockState(chatId);
        return normalizePageMode(res?.mode);
      } catch (e) {
        warn("setBootMode bridge failed; falling back local", e);
      }
    }
    const out = setLocalBootMode(chatId, mode);
    await applyBootMode(chatId, "set-page-mode");
    await refreshDockState(chatId);
    return out;
  }

  async function getMode(chatIdRaw) {
    return getPageMode(chatIdRaw);
  }

  async function setMode(chatIdRaw, modeRaw) {
    return setPageMode(chatIdRaw, modeRaw);
  }

  function getLoadStrategy(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return ARCH_VIEW_REBUILD_FIRST;
    return getLocalLoadStrategy(chatId);
  }

  async function setLoadStrategy(chatIdRaw, strategyRaw, opts = null) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const strategy = setLocalLoadStrategy(chatId, strategyRaw);
    const pageMode = await getPageMode(chatId);
    if (pageMode === MODE_LIVE_FIRST) {
      clearMiniMapColdMarkers();
      await disableHybrid(chatId, "load-strategy:live");
    }
    await applyBootMode(chatId, "set-load-strategy", opts);
    await refreshDockState(chatId);
    return strategy;
  }

  function getViewMode(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return ARCH_VIEW_REBUILD_FIRST;
    return legacyViewModeForStrategy(getLocalLoadStrategy(chatId));
  }

  async function setViewMode(chatIdRaw, viewModeRaw, opts = null) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const strategy = loadStrategyFromLegacyView(viewModeRaw);
    await setLoadStrategy(chatId, strategy, opts);
    return legacyViewModeForStrategy(strategy);
  }

  function getRenderer() {
    return archiveBoot._getRenderer?.() || null;
  }

  function requestRendererStyles() {
    serviceBootState.rendererStylesRequested = true;
    const renderer = getRenderer();
    if (!renderer || typeof renderer.mountStyles !== "function") return false;
    try {
      renderer.mountStyles();
      return true;
    } catch (e) {
      warn("renderer mountStyles failed", e);
      return false;
    }
  }

  function requestRendererBootListeners() {
    serviceBootState.rendererListenersRequested = true;
    const renderer = getRenderer();
    if (!renderer || typeof renderer.ensureBootListeners !== "function") return false;
    try {
      renderer.ensureBootListeners();
      return true;
    } catch (e) {
      warn("renderer listeners init failed", e);
      return false;
    }
  }

  function getHotStart(c) { return getRenderer()?.getHotStart?.(c) ?? 0; }

  function setHotStart(c, v) { return getRenderer()?.setHotStart?.(c, v); }


  function loadLegacyLatestRaw(chatId) {
    return lsGetJson(keyArchiveData(chatId), null);
  }

  function saveLegacyIndexEntry(chatId, capturedAt) {
    const key = keyArchiveIndex();
    const list = Array.isArray(lsGetJson(key, [])) ? lsGetJson(key, []) : [];
    const next = list.filter((x) => String(x?.chatId || "") !== chatId);
    next.unshift({ chatId, capturedAt: String(capturedAt || nowIso()) });
    lsSetJson(key, next.slice(0, 200));
  }

  async function saveLegacyNormalized(chatId, messages, meta = {}, opts = {}) {
    const id = toChatId(chatId);
    if (!id) throw new Error("missing chatId");
    const rows = normalizeMessages(messages);
    if (!rows.length) return { ok: false, deduped: false, reason: "empty_messages" };

    const index = getLocalChatIndex(id);
    const digest = await sha256Hex(JSON.stringify(rows));
    if (!opts.forceNew && digest && index.lastDigest && digest === index.lastDigest) {
      return {
        ok: true,
        deduped: true,
        snapshotId: String(index.lastSnapshotId || ""),
        digest,
        messageCount: rows.length,
        createdAt: String(index.lastCapturedAt || nowIso()),
        legacy: true,
        storage: "legacy",
        workbenchVisible: false,
        message: WORKBENCH_LOCAL_ONLY_WARNING,
      };
    }

    const createdAt = String(opts.createdAt || meta.capturedAt || nowIso());
    const snapshotId = String(opts.snapshotId || makeSnapshotId("legacy"));
    const legacy = canonicalToLegacySnapshot({
      snapshotId,
      chatId: id,
      createdAt,
      messages: rows,
      digest,
      meta,
    });
    if (!legacy) throw new Error("failed to build legacy snapshot");

    lsSetJson(keyArchiveData(id), legacy);
    saveLegacyIndexEntry(id, createdAt);
    setLocalChatIndex(id, {
      ...index,
      lastSnapshotId: snapshotId,
      lastCapturedAt: createdAt,
      lastDigest: digest,
    });
    cacheSnapshot({
      snapshotId,
      chatId: id,
      createdAt,
      schemaVersion: 1,
      messageCount: rows.length,
      digest,
      messages: rows,
      meta: normalizeSnapshotMeta(meta),
    });
    return {
      ok: true,
      deduped: false,
      snapshotId,
      digest,
      messageCount: rows.length,
      createdAt,
      legacy: true,
      storage: "legacy",
      workbenchVisible: false,
      message: WORKBENCH_LOCAL_ONLY_WARNING,
    };
  }

  async function captureNow(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const messages = captureDomNormalizedMessages();
    if (!messages.length) return { ok: false, message: "No chat content found to archive." };
    let bridgeError = "";

    const nativeTurns = collectNativeTurnNodes(D);
    const richTurns = captureDomRichTurns(nativeTurns);
    const turnHighlights = captureAssistantTurnHighlights(nativeTurns);
    const folderMeta = resolveFolderBinding(chatId);
    const hints = buildSnapshotMetaHints(messages);
    const meta = {
      href: W.location.href,
      title: D.title || "",
      source: "dom",
      baselineTurns: countAssistantTurns(messages),
      richTurns,
      excerpt: hints.excerpt,
      answerCount: hints.answerCount,
      messageCount: hints.messageCount,
      updatedAt: hints.updatedAt,
    };
    if (turnHighlights.length) meta.turnHighlights = turnHighlights;
    if (folderMeta.folderId) meta.folderId = folderMeta.folderId;
    if (folderMeta.folderName) meta.folderName = folderMeta.folderName;
    if (await ensureExtensionBacked()) {
      try {
        const out = await bridgeCall("captureSnapshot", { chatId, messages, meta });
        const latest = await loadLatestSnapshotInternal(chatId);
        if (latest) {
          cacheSnapshot(latest);
          await afterSnapshotCaptured(chatId, latest, "capture-now");
        }
        return {
          ...(isObj(out) ? out : {}),
          ok: out?.ok !== false,
          messageCount: Number(out?.messageCount || messages.length || 0),
          storage: "extension",
          workbenchVisible: true,
        };
      } catch (e) {
        bridgeError = String(e && (e.message || e) || "");
        warn("captureSnapshot bridge failed; falling back local", e);
        resetExtensionBridge();
      }
    }
    const out = await saveLegacyNormalized(chatId, messages, meta, {});
    const latest = state.latestByChat.get(chatId) || (await loadLatestSnapshotInternal(chatId));
    if (latest) await afterSnapshotCaptured(chatId, latest, "capture-now");
    return {
      ...(isObj(out) ? out : {}),
      ok: out?.ok !== false,
      messageCount: Number(out?.messageCount || messages.length || 0),
      storage: "legacy",
      workbenchVisible: false,
      bridgeError,
      message: String(out?.message || WORKBENCH_LOCAL_ONLY_WARNING),
    };
  }

  async function loadLatestSnapshotInternal(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return null;
    if (await ensureExtensionBacked()) {
      const res = await bridgeCall("loadLatestSnapshot", { chatId });
      const canonical = canonicalSnapshot(res);
      if (canonical) cacheSnapshot(canonical);
      return canonical;
    }
    const legacy = legacyToCanonicalSnapshot(loadLegacyLatestRaw(chatId), chatId);
    if (legacy) cacheSnapshot(legacy);
    return legacy;
  }

  async function listSnapshots(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return [];
    if (await ensureExtensionBacked()) {
      const rows = await bridgeCall("listSnapshots", { chatId });
      const out = Array.isArray(rows) ? rows : [];
      for (const row of out) {
        const sid = String(row?.snapshotId || "");
        if (sid) state.snapshotChatById.set(sid, chatId);
      }
      return out;
    }
    const latest = await loadLatestSnapshotInternal(chatId);
    if (!latest) return [];
    const idx = getLocalChatIndex(chatId);
    return [{
      snapshotId: latest.snapshotId,
      chatId,
      createdAt: latest.createdAt,
      schemaVersion: 1,
      messageCount: latest.messageCount,
      digest: latest.digest || "",
      chunkIds: [],
      pinned: uniqStringList(idx.pinnedSnapshotIds).includes(latest.snapshotId),
      legacy: true,
    }];
  }

  async function loadSnapshot(snapshotIdRaw) {
    const snapshotId = String(snapshotIdRaw || "").trim();
    if (!snapshotId) return null;
    if (await ensureExtensionBacked()) {
      const res = await bridgeCall("loadSnapshot", { snapshotId });
      const canonical = canonicalSnapshot(res);
      if (canonical) cacheSnapshot(canonical);
      return canonical;
    }
    const chatId = state.snapshotChatById.get(snapshotId) || getCurrentChatId();
    const legacy = legacyToCanonicalSnapshot(loadLegacyLatestRaw(chatId), chatId);
    if (!legacy || String(legacy.snapshotId || "") !== snapshotId) return null;
    cacheSnapshot(legacy);
    return legacy;
  }

  async function pinSnapshot(snapshotIdRaw, pinned = true) {
    const snapshotId = String(snapshotIdRaw || "").trim();
    if (!snapshotId) throw new Error("missing snapshotId");
    const chatId = toChatId(state.snapshotChatById.get(snapshotId) || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    if (await ensureExtensionBacked()) {
      return bridgeCall("pinSnapshot", { chatId, snapshotId, pinned: !!pinned });
    }
    const idx = getLocalChatIndex(chatId);
    const set = new Set(uniqStringList(idx.pinnedSnapshotIds));
    if (pinned) set.add(snapshotId);
    else set.delete(snapshotId);
    idx.pinnedSnapshotIds = Array.from(set);
    setLocalChatIndex(chatId, idx);
    return { ok: true, pinned: idx.pinnedSnapshotIds.slice(), legacy: true };
  }

  async function deleteSnapshot(snapshotIdRaw) {
    const snapshotId = String(snapshotIdRaw || "").trim();
    if (!snapshotId) throw new Error("missing snapshotId");
    const chatId = toChatId(state.snapshotChatById.get(snapshotId) || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    if (await ensureExtensionBacked()) {
      const res = await bridgeCall("deleteSnapshot", { chatId, snapshotId });
      if (state.latestByChat.get(chatId)?.snapshotId === snapshotId) state.latestByChat.delete(chatId);
      state.snapshotChatById.delete(snapshotId);
      return res;
    }

    const latest = legacyToCanonicalSnapshot(loadLegacyLatestRaw(chatId), chatId);
    if (latest && latest.snapshotId === snapshotId) {
      lsDel(keyArchiveData(chatId));
      const indexList = Array.isArray(lsGetJson(keyArchiveIndex(), [])) ? lsGetJson(keyArchiveIndex(), []) : [];
      lsSetJson(keyArchiveIndex(), indexList.filter((x) => String(x?.chatId || "") !== chatId));
      setLocalChatIndex(chatId, {
        ...getLocalChatIndex(chatId),
        lastSnapshotId: "",
        lastCapturedAt: "",
        lastDigest: "",
      });
      state.latestByChat.delete(chatId);
    }
    return { ok: true, remaining: 0, legacy: true };
  }

  function legacyChatIds() {
    const ids = new Set();
    const idx = lsGetJson(keyArchiveIndex(), []);
    if (Array.isArray(idx)) {
      for (const row of idx) {
        const id = toChatId(row?.chatId);
        if (id) ids.add(id);
      }
    }
    try {
      const prefix = `${dataNs()}:archive:v1:`;
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (!String(k).startsWith(prefix)) continue;
        const id = toChatId(String(k).slice(prefix.length));
        if (id) ids.add(id);
      }
    } catch {}
    return Array.from(ids).sort();
  }

  async function listAllChatIdsInternal() {
    if (await ensureExtensionBacked()) {
      try {
        const rows = await bridgeCall("listAllChatIds", {});
        return uniqStringList(rows);
      } catch {}
    }
    return legacyChatIds();
  }

  function buildWorkbenchRow(snapshot, overrides = {}) {
    const canonical = canonicalSnapshot(snapshot);
    if (!canonical) return null;
    const hints = buildSnapshotMetaHints(canonical.messages);
    const index = getLocalChatIndex(canonical.chatId);
    const pinnedSnapshotIds = new Set(uniqStringList(index.pinnedSnapshotIds));
    return {
      snapshotId: canonical.snapshotId,
      chatId: canonical.chatId,
      createdAt: String(overrides.createdAt || canonical.createdAt || canonical.meta?.updatedAt || ""),
      updatedAt: String(overrides.updatedAt || canonical.meta?.updatedAt || canonical.createdAt || ""),
      title: String(overrides.title || canonical.meta?.title || canonical.chatId),
      excerpt: String(overrides.excerpt || canonical.meta?.excerpt || hints.excerpt),
      messageCount: Number(overrides.messageCount || canonical.messageCount || hints.messageCount),
      answerCount: Number(overrides.answerCount || canonical.meta?.answerCount || hints.answerCount),
      pinned: typeof overrides.pinned === "boolean" ? overrides.pinned : pinnedSnapshotIds.has(canonical.snapshotId),
      archived: !!overrides.archived,
      folderId: String(overrides.folderId || canonical.meta?.folderId || ""),
      folderName: String(overrides.folderName || canonical.meta?.folderName || ""),
      tags: Array.isArray(overrides.tags) ? overrides.tags.slice() : [],
    };
  }

  async function listWorkbenchRowsInternal() {
    if (await ensureExtensionBacked()) {
      try {
        const rows = await bridgeCall("listWorkbenchRows", {});
        if (Array.isArray(rows)) return rows;
      } catch {}
    }

    const chatIds = await listAllChatIdsInternal();
    const rows = [];
    for (const chatId of chatIds) {
      const latest = await loadLatestSnapshotInternal(chatId);
      if (!latest) continue;
      const idx = getLocalChatIndex(chatId);
      rows.push(buildWorkbenchRow(latest, {
        pinned: uniqStringList(idx.pinnedSnapshotIds).includes(String(latest.snapshotId || "")),
      }));
    }
    rows.sort((a, b) => String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || "")));
    return rows.filter(Boolean);
  }

  function matchesWorkbenchView(row, viewRaw = "saved") {
    const view = normalizeArchiveView(viewRaw);
    if (!row) return false;
    if (view === "pinned") return !!row.pinned;
    if (view === "archive") return !!row.archived;
    return !row.archived;
  }

  function matchesWorkbenchFolder(row, folderIdRaw = "") {
    const folderId = normalizeFolderFilter(folderIdRaw);
    if (!folderId) return true;
    const rowFolderId = String(row?.folderId || "").trim();
    if (folderId === FOLDER_FILTER_NONE) return !rowFolderId;
    return rowFolderId === folderId;
  }

  function sortWorkbenchRows(rowsRaw = []) {
    const rows = Array.isArray(rowsRaw) ? rowsRaw.slice() : [];
    rows.sort((a, b) => {
      if (!!a?.pinned !== !!b?.pinned) return a?.pinned ? -1 : 1;
      return String(b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.updatedAt || a?.createdAt || ""));
    });
    return rows;
  }

  function filterWorkbenchRows(rowsRaw = [], opts = {}) {
    const view = normalizeArchiveView(opts.view || "saved");
    const folderId = normalizeFolderFilter(opts.folderId || "");
    const query = String(opts.query || "").trim().toLowerCase();
    return sortWorkbenchRows((Array.isArray(rowsRaw) ? rowsRaw : []).filter((row) => {
      if (!matchesWorkbenchView(row, view)) return false;
      if (!matchesWorkbenchFolder(row, folderId)) return false;
      if (!query) return true;
      const hay = [
        row?.title,
        row?.excerpt,
        row?.chatId,
        row?.folderId,
        row?.folderName,
      ].join(" ").toLowerCase();
      return hay.includes(query);
    }));
  }

  function collectWorkbenchFolderOptions(rowsRaw = [], viewRaw = "saved") {
    const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
    const counts = new Map();
    let unfiledCount = 0;
    let total = 0;
    for (const row of rows) {
      if (!matchesWorkbenchView(row, viewRaw)) continue;
      total += 1;
      const folderId = String(row?.folderId || "").trim();
      if (!folderId) {
        unfiledCount += 1;
        continue;
      }
      const entry = counts.get(folderId) || {
        folderId,
        label: String(row?.folderName || folderId),
        count: 0,
      };
      entry.label = String(entry.label || row?.folderName || folderId);
      entry.count += 1;
      counts.set(folderId, entry);
    }
    const folders = Array.from(counts.values()).sort((a, b) => String(a.label || a.folderId).localeCompare(String(b.label || b.folderId)));
    const out = [{ folderId: "", label: "All folders", count: total }, ...folders];
    if (unfiledCount) out.push({ folderId: FOLDER_FILTER_NONE, label: "Unfiled", count: unfiledCount });
    return out;
  }

  async function openWorkbench(routeRaw = "/saved") {
    const route = normalizeWorkbenchRoute(routeRaw);
    if (!(await ensureExtensionBacked())) {
      return {
        ok: false,
        route,
        storage: "legacy",
        workbenchVisible: false,
        message: WORKBENCH_LOCAL_ONLY_WARNING,
      };
    }
    try {
      const res = await bridgeCall("openWorkbench", { route });
      return {
        ...(isObj(res) ? res : {}),
        ok: res?.ok !== false,
        route,
        storage: "extension",
        workbenchVisible: true,
      };
    } catch (e) {
      warn("openWorkbench bridge failed", e);
      resetExtensionBridge();
      return {
        ok: false,
        route,
        storage: "legacy",
        workbenchVisible: false,
        error: String(e && (e.message || e) || ""),
        message: WORKBENCH_LOCAL_ONLY_WARNING,
      };
    }
  }

  function buildDockCaptureStatus(res, countOverride = null) {
    const count = Number((countOverride ?? res?.messageCount) || 0);
    const storage = String(res?.storage || (res?.workbenchVisible ? "extension" : "legacy")).toLowerCase();
    const suffix = storage === "extension" ? "• workbench ready" : "• local only";
    return res?.deduped ? `No change (${count} msg) ${suffix}` : `Captured ${count} msg ${suffix}`;
  }

  async function captureWithOptions(opts = {}) {
    const chatId = toChatId(opts.chatId || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const folderResult = setFolderBinding(chatId, opts.folderId);
    const mode = normalizeAfterSaveMode(opts.mode || SAVE_MODE_SILENT);
    setDockAfterSaveMode(mode);
    const res = await captureNow(chatId);
    const snapshotId = String(res?.snapshotId || "");
    let afterOpen = null;
    if (mode === SAVE_MODE_READER || mode === SAVE_MODE_LIBRARY) {
      // Reader removed — SAVE_MODE_READER now falls through to library view
      afterOpen = await openSavedChats({
        view: normalizeArchiveView(opts.view || "saved"),
        folderId: folderResult.folderId,
        chatId,
        snapshotId,
        source: "capture-with-options",
      });
    }
    return {
      ...(isObj(res) ? res : {}),
      chatId,
      snapshotId,
      folderId: folderResult.folderId,
      folderName: folderResult.folderName,
      afterSaveMode: mode,
      afterOpen,
    };
  }

  async function openSavedChats(opts = {}) {
    const request = {
      view: normalizeArchiveView(opts.view || "saved"),
      folderId: normalizeFolderFilter(opts.folderId || ""),
      chatId: toChatId(opts.chatId || ""),
      snapshotId: String(opts.snapshotId || "").trim(),
      source: String(opts.source || ""),
    };
    const route = buildSavedChatsRoute(request);
    const res = await openWorkbench(route);
    if (res?.ok !== false && res?.workbenchVisible !== false) {
      try { getRenderer()?.closeSavedChatsPanel?.(); } catch {}
      return {
        ...res,
        mode: "workbench",
        route,
        compatUrl: buildSavedChatsCompatUrl(request),
      };
    }
    const panel = await (getRenderer()?.openSavedChatsPanel?.({
      ...request,
      note: String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING),
      tone: "warn",
      force: !!opts.force,
    }) || Promise.resolve({
      ok: false,
      mode: "local-panel",
      message: WORKBENCH_LOCAL_ONLY_WARNING,
      rowCount: 0,
    }));
    return {
      ...(isObj(panel) ? panel : {}),
      ok: panel?.ok !== false,
      mode: "local-panel",
      route,
      workbenchVisible: false,
      storage: "legacy",
      message: String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING),
      compatUrl: buildSavedChatsCompatUrl(request),
    };
  }

  async function exportLegacyBundle(scopeRaw, chatIdRaw) {
    const scope = String(scopeRaw || "chat").trim().toLowerCase();
    let chatIds = [];
    if (scope === "chat") {
      const chatId = toChatId(chatIdRaw || getCurrentChatId());
      if (!chatId) throw new Error("missing chatId");
      chatIds = [chatId];
    } else if (scope === "all") {
      chatIds = legacyChatIds();
    } else {
      throw new Error("invalid scope");
    }

    const chats = [];
    for (const chatId of chatIds) {
      const canonical = legacyToCanonicalSnapshot(loadLegacyLatestRaw(chatId), chatId);
      chats.push({
        chatId,
        bootMode: getLocalBootMode(chatId),
        chatIndex: getLocalChatIndex(chatId),
        migrated: getLocalMigrated(chatId),
        snapshots: canonical ? [{
          snapshotId: canonical.snapshotId,
          createdAt: canonical.createdAt,
          schemaVersion: canonical.schemaVersion,
          messageCount: canonical.messageCount,
          digest: canonical.digest,
          meta: canonical.meta || {},
          messages: canonical.messages,
        }] : [],
      });
    }

    return {
      schema: "h2o.chatArchive.bundle.v1",
      exportedAt: nowIso(),
      scope,
      chatCount: chats.length,
      chats,
      source: "legacy",
    };
  }

  async function exportBundle({ scope = "chat", chatId } = {}) {
    if (await ensureExtensionBacked()) {
      return bridgeCall("exportBundle", { scope: String(scope || "chat"), chatId: chatId || getCurrentChatId() });
    }
    return exportLegacyBundle(scope, chatId);
  }

  async function importLegacyBundle(bundle, modeRaw = "merge") {
    if (!isObj(bundle) || bundle.schema !== "h2o.chatArchive.bundle.v1" || !Array.isArray(bundle.chats)) {
      throw new Error("invalid bundle");
    }
    const mode = String(modeRaw || "merge").trim().toLowerCase() === "overwrite" ? "overwrite" : "merge";
    let importedChats = 0;
    let importedSnapshots = 0;

    for (const chat of bundle.chats) {
      const chatId = toChatId(chat?.chatId);
      if (!chatId) continue;

      if (mode === "overwrite") {
        lsDel(keyArchiveData(chatId));
      }
      if (Object.prototype.hasOwnProperty.call(chat || {}, "bootMode")) {
        setLocalBootMode(chatId, chat.bootMode);
      }

      const snaps = Array.isArray(chat?.snapshots) ? chat.snapshots.slice() : [];
      snaps.sort((a, b) => String(a?.createdAt || "").localeCompare(String(b?.createdAt || "")));
      for (const snap of snaps) {
        const messages = normalizeMessages(snap?.messages);
        if (!messages.length) continue;
        const importedMeta = normalizeSnapshotMeta({
          ...(isObj(snap?.meta) ? snap.meta : {}),
          importedAt: nowIso(),
        });
        await saveLegacyNormalized(chatId, messages, importedMeta, {
          forceNew: true,
          snapshotId: String(snap?.snapshotId || ""),
          createdAt: String(snap?.createdAt || ""),
        });
        importedSnapshots += 1;
      }

      if (isObj(chat?.chatIndex)) setLocalChatIndex(chatId, chat.chatIndex);
      if (Object.prototype.hasOwnProperty.call(chat || {}, "migrated")) setLocalMigrated(chatId, !!chat.migrated);
      importedChats += 1;
    }
    return { ok: true, mode, importedChats, importedSnapshots, source: "legacy" };
  }

  async function importBundle({ bundle, mode = "merge" } = {}) {
    if (await ensureExtensionBacked()) {
      return bridgeCall("importBundle", { bundle, mode: String(mode || "merge") });
    }
    return importLegacyBundle(bundle, mode);
  }

  function loadLegacyVaultLatest(chatId) {
    const idx = lsGetJson(keyVaultIndex(chatId), []);
    const first = Array.isArray(idx) ? idx[0] : null;
    const vid = toChatId(first?.vid);
    if (!vid) return null;
    const item = lsGetJson(keyVaultItem(chatId, vid), null);
    return legacyToCanonicalSnapshot(item?.snapshot, chatId);
  }

  async function migrateLegacyIfNeeded(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId || state.migratedSeen.has(chatId)) return { ok: true, skipped: true };
    if (!(await ensureExtensionBacked())) return { ok: false, skipped: true, reason: "extension_unavailable" };

    let migrated = false;
    try {
      const res = await bridgeCall("getMigratedFlag", { chatId });
      migrated = !!res?.migrated;
    } catch {
      migrated = getLocalMigrated(chatId);
    }
    if (migrated) {
      state.migratedSeen.add(chatId);
      return { ok: true, skipped: true, reason: "already_migrated" };
    }

    const candidates = [];
    const archiveSnap = legacyToCanonicalSnapshot(loadLegacyLatestRaw(chatId), chatId);
    if (archiveSnap) candidates.push(archiveSnap);
    const vaultSnap = loadLegacyVaultLatest(chatId);
    if (vaultSnap) candidates.push(vaultSnap);

    let imported = 0;
    for (const snap of candidates) {
      const msgs = normalizeMessages(snap.messages);
      if (!msgs.length) continue;
      try {
        const migrationMeta = normalizeSnapshotMeta({
          ...(isObj(snap?.meta) ? snap.meta : {}),
          source: "legacy-migration",
          capturedAt: snap.createdAt || null,
        });
        await bridgeCall("captureSnapshot", {
          chatId,
          messages: msgs,
          meta: migrationMeta,
        });
        imported += 1;
      } catch (e) {
        warn("migration capture failed", e);
      }
    }

    try { await bridgeCall("setMigratedFlag", { chatId, migrated: true }); } catch {}
    setLocalMigrated(chatId, true);
    state.migratedSeen.add(chatId);
    return { ok: true, imported };
  }

  /* --- Renderer delegation (0D3c) --- */
  function emitArchiveEvent(t, d) {
    const renderer = getRenderer();
    if (renderer?.emitArchiveEvent) return renderer.emitArchiveEvent(t, d);
    try { W.dispatchEvent(new CustomEvent(t, { detail: d })); } catch {}
  }
  function setPreviewStatus(c, n) { return getRenderer()?.setPreviewStatus?.(c, n); }
  function getPreviewStatus(c) { return getRenderer()?.getPreviewStatus?.(c) || null; }
  async function resolveEffectiveArchivePlan(c, o) { return getRenderer()?.resolveEffectiveArchivePlan?.(c, o) || { snapshotReady: false, advanced: ARCHIVE_ADVANCED_DEFAULTS }; }
  function getHybridState(c) { return getRenderer()?.getHybridState?.(c) || null; }
  function clearMiniMapColdMarkers() { return getRenderer()?.clearMiniMapColdMarkers?.(); }
  function collectNativeMessageNodes(r) { return getRenderer()?.collectNativeMessageNodes?.(r) || []; }
  async function disableHybrid(c, r) { return getRenderer()?.disableHybrid?.(c, r) || { ok: true }; }
  async function applyHybrid(c, r, o) { return getRenderer()?.applyHybrid?.(c, r, o) || { ok: false, reason: "renderer-not-loaded" }; }
  async function afterSnapshotCaptured(c, s, r) { return getRenderer()?.afterSnapshotCaptured?.(c, s, r) || { ok: false }; }
  async function rehydrateFromIndex(c, i, o) { return getRenderer()?.rehydrateFromIndex?.(c, i, o) || { ok: false }; }
  function scrollToCold(c, i, o) { return getRenderer()?.scrollToCold?.(c, i, o) || { ok: false }; }
  async function scrollToColdWithFallback(c, i, o) { return getRenderer()?.scrollToColdWithFallback?.(c, i, o) || { ok: false }; }
  function syncMiniMapColdState(c, m, h, o) { return getRenderer()?.syncMiniMapColdState?.(c, m, h, o); }
  async function resyncMiniMapColdMarkers(c, r) { return getRenderer()?.resyncMiniMapColdMarkers?.(c, r); }
  function messageIndexForAnswer(m, i) { return getRenderer()?.messageIndexForAnswer?.(m, i) || 0; }
  function pageModeLabel(m) { return getRenderer()?.pageModeLabel?.(m) || String(m || ""); }
  function collectNativeTurnNodes(r) { return getRenderer()?.collectNativeTurnNodes?.(r) || []; }
  function snapshotLabel(row) {
    const createdAt = String(row?.createdAt || "");
    const dt = createdAt ? new Date(createdAt) : null;
    const ts = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString("en-US") : createdAt || "unknown";
    const count = Number(row?.messageCount || 0);
    return `${ts} · ${count} msg`;
  }

  // renderReaderSnapshotList — removed (reader deprecated)


  // ensureReaderUi — removed (reader deprecated)


  async function openReader(chatIdRaw, snapshotIdRaw = "") {
    // Reader removed (v1.1.0) — use hybrid in-page loading or Studio.
    warn("openReader is deprecated. Use hybrid view or Studio instead.");
    return { ok: false, reason: "reader-removed" };
  }

  /* --- Archive Page Surface delegation (0D3c) --- */
  function showArchivePageError(m) { /* 0D3c */ }
  function closeArchivePageSurface() { return getRenderer()?.closeArchivePageSurface?.(); }
  async function openArchivePageSurface(c, o) { return getRenderer()?.openArchivePageSurface?.(c, o) || { ok: false }; }
  async function applyBootMode(c, r) { return getRenderer()?.applyBootMode?.(c, r) || { ok: false }; }

  function buildDockImportantAlerts(model = {}) {
    const out = [];
    const push = (raw) => {
      const msg = String(raw || "").trim();
      if (!msg || out.includes(msg)) return;
      out.push(msg);
    };
    const warnings = String(model.warnings || "")
      .split("|")
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    for (let i = 0; i < warnings.length; i += 1) push(warnings[i]);
    if (!model.mmBootAvailable) push("MiniMap boot API unavailable");
    if (model.pageMode !== MODE_LIVE_FIRST && !model.snapshotReady) push("Snapshot missing");
    if (model.fallbackReason && model.fallbackReason !== FALLBACK_REASON_NONE) push(`Fallback: ${fallbackReasonLabel(model.fallbackReason)}`);
    if (model.pageMode === MODE_LIVE_FIRST && model.requestedStrategy !== ARCH_VIEW_REBUILD_FIRST) push("Live mode keeps one native transcript visible");
    if (model.extMode !== "extension") push("Storage backend in local fallback mode");
    return out;
  }

  function inferDockPanelTone(textRaw = "") {
    const text = String(textRaw || "").trim().toLowerCase();
    if (!text) return "info";
    if (/(warn|warning|unavailable|error|failed|missing|fallback|disabled|retry|pending|cold-only)/i.test(text)) return "warn";
    if (/(opened|saved|ready|resynced|captured|complete|extension)/i.test(text)) return "good";
    return "info";
  }

  function buildDockPanelMessages(model = {}) {
    const out = [];
    const seen = new Set();
    const importantSet = new Set(
      (Array.isArray(model.importantAlerts) ? model.importantAlerts : [])
        .map((msg) => String(msg || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const push = (msg) => {
      if (!msg || typeof msg !== "object") return;
      const text = String(msg.text || "").trim();
      if (!text) return;
      const dedupeKey = text.toLowerCase();
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      out.push({
        text,
        title: String(msg.title || text),
        tone: String(msg.tone || "info"),
        priority: Number(msg.priority) || 0,
      });
    };

    const mmBootLabel = String(model.mmBootModeLabel || "").trim();
    const pageMode = String(model.pageModeLabel || "").trim();
    const requestedStrategy = String(model.requestedStrategyLabel || "").trim();
    const effectiveStrategy = String(model.effectiveStrategyLabel || "").trim();
    const activeSource = String(model.activeSourceLabel || "").trim();
    const statusText = String(model.statusText || "").trim();

    if (statusText) {
      const tone = inferDockPanelTone(statusText);
      if (!(tone === "warn" && importantSet.has(statusText.toLowerCase()))) {
        push({
          text: statusText,
          tone,
          priority: 180,
        });
      }
    }
    if (mmBootLabel) {
      push({
        text: model.mmBootAvailable ? `MM·Boot active: ${mmBootLabel}` : `MM·Boot ${mmBootLabel} · API unavailable`,
        tone: model.mmBootAvailable ? "info" : "warn",
        priority: model.mmBootAvailable ? 80 : 260,
      });
    }
    if (pageMode) {
      push({
        text: `Page Mode: ${pageMode}`,
        tone: "info",
        priority: 70,
      });
    }
    if (requestedStrategy) {
      push({
        text: `Load Strategy: ${requestedStrategy}`,
        tone: "info",
        priority: 68,
      });
    }
    if (effectiveStrategy) {
      push({
        text: `Effective Strategy: ${effectiveStrategy}`,
        tone: "info",
        priority: 66,
      });
    }
    if (activeSource) {
      push({
        text: `Active Source: ${activeSource}`,
        tone: model.activeSource === ACTIVE_SOURCE_NATIVE ? "good" : "info",
        priority: 64,
      });
    }
    if (model.snapshotReady) {
      push({
        text: "Snapshot ready",
        tone: "good",
        priority: 42,
      });
    }
    if (String(model.extMode || "") === "extension") {
      push({
        text: "Storage backend: extension",
        tone: "good",
        priority: 36,
      });
    }
    return out;
  }

  function formatDockInfoTs(raw) {
    const s = String(raw || "").trim();
    if (!s) return "n/a";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("en-US", { hour12: false });
  }

  function buildDockInfoSections(model = {}) {
    const warnText = String(model.warnings || "none");
    const criticalAlerts = Array.isArray(model.importantAlerts) ? model.importantAlerts.filter(Boolean) : [];
    const criticalAlertsText = criticalAlerts.length ? criticalAlerts.join(" | ") : "none";
    return [
      {
        id: "archive.context",
        owner: "archive",
        order: 100,
        title: "Context",
        rows: [
          { key: "chat id", value: model.chatId || "n/a", mono: true },
          { key: "snapshot id", value: model.snapshotId || "n/a", mono: true },
          { key: "captured at", value: formatDockInfoTs(model.capturedAt || "") },
          { key: "storage", value: model.extMode || "unknown" },
        ],
      },
      {
        id: "archive.status",
        owner: "archive",
        order: 200,
        title: "Status",
        rows: [
          { key: "page mode", value: model.pageModeLabel || "n/a" },
          { key: "strategy", value: model.requestedStrategyLabel || "n/a" },
          { key: "effective", value: model.effectiveStrategyLabel || "n/a" },
          { key: "active source", value: model.activeSourceLabel || "n/a" },
          { key: "snapshot", value: model.snapshotReady ? "ready" : "missing", tone: model.snapshotReady ? "good" : "warn" },
          { key: "baseline", value: model.baselineReady ? "ready" : "missing", tone: model.baselineReady ? "good" : "warn" },
          { key: "fallback reason", value: model.fallbackReasonLabel || "None", tone: model.fallbackReason === FALLBACK_REASON_NONE ? "good" : "warn" },
        ],
      },
      {
        id: "archive.runtime",
        owner: "archive",
        order: 300,
        title: "Runtime",
        rows: [
          { key: "visible transcript", value: model.pageMode === MODE_LIVE_FIRST ? "native page" : "archive page" },
          { key: "preview surface", value: model.previewVisible ? "open" : "closed", tone: model.previewVisible ? "good" : "" },
          { key: "minimap boot", value: model.mmBoot || "n/a" },
          { key: "dock background", value: () => getDockBgModeSetting() || "n/a" },
          {
            key: "important panel",
            value: () => getDockImportantOnly() ? "enabled" : "disabled",
            tone: () => getDockImportantOnly() ? "good" : "",
          },
        ],
      },
      {
        id: "archive.data",
        owner: "archive",
        order: 400,
        title: "Data",
        rows: [
          { key: "baseline", value: `${Number(model.baselineMsgs || 0)}m / ${Number(model.baselineTurns || 0)}t` },
          { key: "hot start", value: `${Number(model.hotStartMsg || 0)}m / ${Number(model.hotStartTurns || 0)}t` },
          { key: "visible dom", value: `${Number(model.nativeMsgs || 0)}m / ${Number(model.nativeAssistantTurns || 0)}t` },
          { key: "snapshot id", value: model.advanced?.showSnapshotMeta ? (model.snapshotId || "n/a") : "hidden", mono: !!model.advanced?.showSnapshotMeta },
        ],
      },
      {
        id: "archive.health",
        owner: "archive",
        order: 500,
        title: "Health",
        rows: [
          { key: "critical alerts", value: criticalAlertsText, tone: criticalAlerts.length ? "warn" : "good" },
          { key: "warnings", value: warnText, tone: warnText !== "none" ? "warn" : "good" },
        ],
      },
      {
        id: "archive.best-practice",
        owner: "archive",
        order: 600,
        title: "Guidance",
        rows: [
          { key: "mode help", value: model.helpText || "" },
          { key: "capture policy", value: "Capture after substantial context or mode changes." },
          { key: "summary", value: model.summary || "", last: true },
        ],
      },
    ];
  }

  function getCommandBarApi() {
    const api = H2O.commandBar;
    if (!api || typeof api !== "object") return null;
    const required = [
      "ensureMounted",
      "registerGroup",
      "registerControl",
      "patchControl",
      "removeOwner",
      "setStatus",
      "clearStatus",
      "setPanelSection",
    ];
    for (const key of required) {
      if (typeof api[key] !== "function") return null;
    }
    return api;
  }

  function clearCommandBarBindTimer() {
    if (!state.commandBarBindTimer) return;
    try { W.clearInterval(state.commandBarBindTimer); } catch {}
    state.commandBarBindTimer = 0;
  }

  function scheduleCommandBarBindRetry() {
    if (state.commandBarBound && getCommandBarApi()) {
      clearCommandBarBindTimer();
      return 0;
    }
    if (state.commandBarBindTimer) return state.commandBarBindTimer;
    state.commandBarBindTimer = W.setInterval(() => {
      if (state.commandBarBound && getCommandBarApi()) {
        clearCommandBarBindTimer();
        return;
      }
      const api = ensureArchiveCommandBarBindings();
      if (!api) return;
      clearCommandBarBindTimer();
      refreshDockState(getCurrentChatId()).catch((e) => warn("command bar refresh after bind failed", e));
    }, 350);
    return state.commandBarBindTimer;
  }

  function ensureArchiveCommandBarBindings() {
    const api = getCommandBarApi();
    if (!api) {
      state.commandBarApi = null;
      state.commandBarBound = false;
      scheduleCommandBarBindRetry();
      return null;
    }
    try { api.ensureMounted(); } catch (e) { warn("command bar ensureMounted failed", e); }
    if (state.commandBarApi && state.commandBarApi !== api) {
      state.commandBarBound = false;
    }
    state.commandBarApi = api;
    if (state.commandBarBound) {
      clearCommandBarBindTimer();
      return api;
    }

    try {
      api.removeOwner("mm");
      api.removeOwner("sn");
      api.removeOwner("archive");

      api.registerGroup({ id: "mm.main", owner: "mm", zone: "main", order: 100 });
      api.registerGroup({ id: "archive.main", owner: "archive", zone: "main", order: 200 });

      api.registerControl({
        id: "mm.boot",
        owner: "mm",
        groupId: "mm.main",
        order: 100,
        type: "select",
        className: "mmboot",
        title: "MM·Boot",
        faceBase: "MM·Boot",
        faceMap: {
          [MM_BOOT_MODE_REBUILD_FIRST]: "R",
          [MM_BOOT_MODE_CACHE_FIRST]: "C",
        },
        options: [
          { value: MM_BOOT_MODE_REBUILD_FIRST, label: "MiniMap Rebuild-First" },
          { value: MM_BOOT_MODE_CACHE_FIRST, label: "MiniMap Cache-First" },
        ],
        value: MM_BOOT_MODE_REBUILD_FIRST,
        onChange: async ({ value }) => {
          const chatId = getCurrentChatId();
          const res = setMiniMapBootModeSetting(value || MM_BOOT_MODE_REBUILD_FIRST);
          if (!res?.ok) setDockStatusText(chatId, "MiniMap boot API unavailable");
          else setDockStatusText(chatId, `MiniMap boot:${res.mode}`);
          await refreshDockState(chatId);
        },
      });

      api.registerControl({
        id: "mm.resync",
        owner: "mm",
        groupId: "mm.main",
        order: 200,
        type: "button",
        className: "resync",
        text: "MM·Resync",
        title: "MM·Resync",
        onClick: async () => {
          const chatId = getCurrentChatId();
          try {
            const res = await resyncMiniMapColdMarkers(chatId, "dock:manual-resync");
            if (res?.ok) setDockStatusText(chatId, "MiniMap markers resynced");
            else setDockStatusText(chatId, "MiniMap resync skipped");
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "MiniMap resync failed");
            await refreshDockState(chatId);
          }
        },
      });

      api.registerControl({
        id: "archive.pageMode",
        owner: "archive",
        groupId: "archive.main",
        order: 100,
        type: "select",
        className: "mode",
        title: "Page Mode",
        faceBase: "Page",
        faceMap: {
          [MODE_LIVE_FIRST]: pageModeFace(MODE_LIVE_FIRST),
          [MODE_ARCHIVE_FIRST]: pageModeFace(MODE_ARCHIVE_FIRST),
          [MODE_ARCHIVE_ONLY]: pageModeFace(MODE_ARCHIVE_ONLY),
        },
        options: [
          { value: MODE_LIVE_FIRST, label: "Live" },
          { value: MODE_ARCHIVE_FIRST, label: "Archive Preview" },
          { value: MODE_ARCHIVE_ONLY, label: "Archive Only" },
        ],
        value: MODE_LIVE_FIRST,
        onChange: async ({ value }) => {
          const chatId = getCurrentChatId();
          try {
            await setPageMode(chatId, value);
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, `Page mode error: ${String(e && (e.message || e))}`);
            await refreshDockState(chatId);
          }
        },
      });

      api.registerControl({
        id: "archive.strategy",
        owner: "archive",
        groupId: "archive.main",
        order: 200,
        type: "select",
        className: "view",
        title: "Load Strategy",
        faceBase: "Load",
        faceMap: {
          [ARCH_VIEW_REBUILD_FIRST]: loadStrategyFace(ARCH_VIEW_REBUILD_FIRST),
          [ARCH_VIEW_CACHE_FIRST]: loadStrategyFace(ARCH_VIEW_CACHE_FIRST),
          [LOAD_STRATEGY_AUTO]: loadStrategyFace(LOAD_STRATEGY_AUTO),
        },
        options: [
          { value: ARCH_VIEW_REBUILD_FIRST, label: "Safe" },
          { value: ARCH_VIEW_CACHE_FIRST, label: "Fast" },
          { value: LOAD_STRATEGY_AUTO, label: "Auto" },
        ],
        value: ARCH_VIEW_REBUILD_FIRST,
        onChange: async ({ value }) => {
          const chatId = getCurrentChatId();
          try {
            await setLoadStrategy(chatId, value, { userInitiated: true });
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, `Load strategy error: ${String(e && (e.message || e))}`);
            await refreshDockState(chatId);
          }
        },
      });

      // "Open Reader" command bar control — removed (reader deprecated v1.1.0)

      api.registerControl({
        id: "archive.saved",
        owner: "archive",
        groupId: "archive.main",
        order: 400,
        type: "button",
        className: "saved",
        text: "Saved Chats",
        title: "Saved Chats",
        /* User-facing action: browse saved chats library */
        sideAction: true,
        sideTab: "other",
        onClick: async () => {
          const chatId = getCurrentChatId();
          try {
            const res = await openSavedChats({
              view: "saved",
              chatId,
              folderId: resolveFolderBinding(chatId).folderId,
            });
            if (res?.mode === "local-panel" || res?.workbenchVisible === false) {
              setDockStatusText(chatId, "Saved chats opened • local only");
              setDockWarning(chatId, String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING));
            } else {
              setDockStatusText(chatId, "Saved chats opened");
              setDockWarning(chatId, "");
            }
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "Saved chats unavailable");
            setDockWarning(chatId, WORKBENCH_LOCAL_ONLY_WARNING);
            await refreshDockState(chatId);
          }
        },
      });

      api.registerControl({
        id: "archive.capture",
        owner: "archive",
        groupId: "archive.main",
        order: 500,
        /* captureMenu type is not supported by Side Actions bridge — stays in Command Bar.
           A dedicated Side Actions slot for capture can be added in a future pass. */
        keepInCommandBar: true,
        type: "captureMenu",
        text: "Capture Snapshot",
        title: "Capture Snapshot",
        onPrimaryClick: async () => {
          const chatId = getCurrentChatId();
          try {
            const res = await captureNow(chatId);
            setDockStatusText(chatId, buildDockCaptureStatus(res));
            setDockWarning(chatId, String(res?.storage || "").toLowerCase() === "extension" ? "" : String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING));
            await applyBootMode(chatId, "capture:command-bar");
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "Capture failed");
            await refreshDockState(chatId);
            warn("capture error", e);
          }
        },
        onMenuOpen: async () => {
          const chatId = toChatId(getCurrentChatId());
          const binding = resolveFolderBinding(chatId);
          const folders = Array.isArray(getFoldersList()) ? getFoldersList() : [];
          const folderOptions = [{ value: "", label: "Unfiled" }];
          for (const folder of folders) {
            const folderId = String(folder?.id || folder?.folderId || "").trim();
            if (!folderId) continue;
            folderOptions.push({
              value: folderId,
              label: String(folder?.name || folder?.title || folderId).trim() || folderId,
            });
          }
          return {
            folderOptions,
            folderId: String(binding?.folderId || ""),
            mode: getDockAfterSaveMode(),
          };
        },
        onApply: async ({ folderId, mode }) => {
          const chatId = getCurrentChatId();
          try {
            const res = await captureWithOptions({
              chatId,
              folderId: folderId || "",
              mode: mode || SAVE_MODE_SILENT,
            });
            setDockStatusText(chatId, buildDockCaptureStatus(res));
            setDockWarning(chatId, String(res?.storage || "").toLowerCase() === "extension" ? "" : String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING));
            await applyBootMode(chatId, "capture-menu:command-bar");
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "Capture failed");
            await refreshDockState(chatId);
            warn("capture error", e);
          }
        },
      });

      api.registerControl({
        id: "archive.refresh",
        owner: "archive",
        groupId: "archive.main",
        order: 600,
        type: "button",
        className: "refresh",
        text: "Refresh Snapshot",
        title: "Refresh Snapshot",
        onClick: async () => {
          const chatId = getCurrentChatId();
          try {
            await loadLatestSnapshotInternal(chatId);
            setDockStatusText(chatId, "Snapshot refreshed");
            await applyBootMode(chatId, "refresh-snapshot");
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "Snapshot refresh failed");
            await refreshDockState(chatId);
          }
        },
      });

      api.registerControl({
        id: "archive.status",
        owner: "archive",
        groupId: "archive.main",
        order: 700,
        type: "button",
        className: "status",
        text: "Show Status",
        title: "Show Archive Status",
        onClick: async () => {
          const chatId = getCurrentChatId();
          setDockInfoPanelOpen(chatId, true);
          setDockStatusText(chatId, "Archive status panel opened");
          await refreshDockState(chatId);
        },
      });

      state.commandBarBound = true;
      clearCommandBarBindTimer();
      return api;
    } catch (e) {
      warn("command bar bind failed", e);
      state.commandBarBound = false;
      scheduleCommandBarBindRetry();
      return null;
    }
  }

  async function refreshDockState(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const api = ensureArchiveCommandBarBindings();
    if (!api) return;
    migrateLocalChatKeysIfNeeded(chatId);
    const pageMode = await getPageMode(chatId);
    const requestedStrategy = getLoadStrategy(chatId);
    const baseline = getLocalBaseline(chatId);
    const hotStartRaw = getLocalHotStart(chatId, baseline?.baselineCount ?? 0);
    const status = await resolveEffectiveArchivePlan(chatId, {
      pageMode,
      requestedStrategy,
      latest: state.latestByChat.get(chatId) || null,
      forceLoadLatest: true,
    });
    const latest = status.latest || null;
    const latestMessages = Array.isArray(latest?.messages) ? latest.messages : null;
    const baselineMsgs = latestMessages ? latestMessages.length : normalizeHotStart(baseline?.baselineCount, hotStartRaw);
    const hotStartMsg = Math.max(0, Math.min(baselineMsgs, hotStartRaw));
    const baselineTurns = latestMessages ? countAssistantTurns(latestMessages) : Math.max(0, Math.round(baselineMsgs / 2));
    const hotStartTurns = latestMessages ? countAssistantTurns(latestMessages, hotStartMsg) : Math.max(0, Math.round(hotStartMsg / 2));
    const nativeMsgNodes = collectNativeMessageNodes(D);
    const nativeMsgs = nativeMsgNodes.length;
    const nativeAssistantTurns = countAssistantInNativeNodes(nativeMsgNodes);
    const runtime = pageMode === MODE_LIVE_FIRST ? "native" : "archive-page";
    const mix = `${status.pageModeLabel} • ${status.activeSourceLabel} • ${status.fallbackReasonLabel}`;
    const mmBoot = getMiniMapBootModeSetting();
    const ext = getStorageMode();
    const warnMsgRaw = getDockWarning(chatId);
    const statusMsgRaw = getDockStatusText(chatId) || status.statusText;
    const warnMsg = [warnMsgRaw].filter(Boolean).join(" | ");
    const mmBootModeLabel = mmBoot.mode === MM_BOOT_MODE_CACHE_FIRST ? "C" : "R";
    const importantAlerts = buildDockImportantAlerts({
      warnings: warnMsg,
      mmBootAvailable: mmBoot.available,
      pageMode,
      requestedStrategy,
      snapshotReady: status.snapshotReady,
      fallbackReason: status.fallbackReason,
      extMode: ext,
    });
    const statusMessages = buildDockPanelMessages({
      statusText: statusMsgRaw,
      importantAlerts,
      mmBootAvailable: mmBoot.available,
      mmBootModeLabel,
      pageModeLabel: status.pageModeLabel,
      requestedStrategyLabel: status.requestedStrategyLabel,
      effectiveStrategyLabel: status.effectiveStrategyLabel,
      activeSourceLabel: status.activeSourceLabel,
      activeSource: status.activeSource,
      snapshotReady: status.snapshotReady,
      extMode: ext,
    });

    api.patchControl("mm.boot", {
      value: mmBoot.mode,
      disabled: !mmBoot.available,
    });
    api.patchControl("archive.pageMode", { value: pageMode });
    api.patchControl("archive.strategy", { value: requestedStrategy });

    api.setStatus({
      owner: "archive",
      priority: 100,
      text: String(statusMsgRaw || ""),
      title: String(statusMsgRaw || warnMsg || ""),
      messages: statusMessages,
      importantText: importantAlerts[0] ? `⚠ ${importantAlerts[0]}` : "",
      importantTitle: importantAlerts.length ? importantAlerts.join(" | ") : "",
      importantMessages: importantAlerts.map((msg, idx) => ({
        text: `⚠ ${String(msg || "").trim()}`,
        title: String(msg || "").trim(),
        tone: "warn",
        important: true,
        priority: 320 - idx,
      })),
    });

    const infoModel = {
      chatId,
      snapshotId: String(status.snapshotId || baseline?.snapshotId || ""),
      capturedAt: String(status.capturedAt || baseline?.capturedAt || ""),
      pageMode,
      pageModeLabel: status.pageModeLabel,
      requestedStrategy,
      requestedStrategyLabel: status.requestedStrategyLabel,
      effectiveStrategy: status.effectiveStrategy,
      effectiveStrategyLabel: status.effectiveStrategyLabel,
      activeSource: status.activeSource,
      activeSourceLabel: status.activeSourceLabel,
      snapshotReady: status.snapshotReady,
      baselineReady: status.baselineReady,
      fallbackReason: status.fallbackReason,
      fallbackReasonLabel: status.fallbackReasonLabel,
      mmBoot: mmBoot.mode,
      runtime,
      summary: mix,
      helpText: status.helpText,
      hotStartMsg,
      hotStartTurns,
      baselineMsgs,
      baselineTurns,
      nativeMsgs,
      nativeAssistantTurns,
      previewVisible: status.previewVisible,
      extMode: ext,
      warnings: warnMsg || "none",
      importantAlerts,
      advanced: status.advanced,
    };
    for (const section of buildDockInfoSections(infoModel)) {
      api.setPanelSection(section);
    }
  }

  // resyncMiniMapColdMarkers — stub above

  function legacyCaptureLive(opts = {}) {
    const chatId = toChatId(opts.chatId || getCurrentChatId());
    const messages = captureDomNormalizedMessages();
    return canonicalToLegacySnapshot({
      snapshotId: makeSnapshotId("legacy"),
      chatId,
      createdAt: nowIso(),
      messages,
      meta: { source: "captureLive" },
    });
  }

  function legacyGetLatest(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const cached = state.latestByChat.get(chatId);
    if (cached) return canonicalToLegacySnapshot(cached);
    if (!isExtensionBacked()) {
      const legacy = loadLegacyLatestRaw(chatId);
      const canonical = legacyToCanonicalSnapshot(legacy, chatId);
      if (canonical) {
        cacheSnapshot(canonical);
        return canonicalToLegacySnapshot(canonical);
      }
    } else {
      loadLatestSnapshotInternal(chatId).catch(() => {});
    }
    return null;
  }

  function legacyList() {
    if (!isExtensionBacked()) {
      const idx = lsGetJson(keyArchiveIndex(), []);
      return Array.isArray(idx) ? idx.filter(Boolean) : [];
    }
    const rows = [];
    for (const [chatId, snap] of state.latestByChat.entries()) {
      rows.push({ chatId, capturedAt: String(snap.createdAt || "") });
    }
    rows.sort((a, b) => String(b.capturedAt || "").localeCompare(String(a.capturedAt || "")));
    return rows;
  }

  function legacySaveLatest(snapshot) {
    const canonical = canonicalSnapshot(legacyToCanonicalSnapshot(snapshot, snapshot?.chatId || getCurrentChatId()) || snapshot);
    if (!canonical || !canonical.messages.length) return false;
    cacheSnapshot(canonical);
    (async () => {
      try {
        if (await ensureExtensionBacked()) {
          await bridgeCall("captureSnapshot", {
            chatId: canonical.chatId,
            messages: canonical.messages,
            meta: { source: "legacy.saveLatest", capturedAt: canonical.createdAt },
          });
          const latest = await loadLatestSnapshotInternal(canonical.chatId);
          if (latest) cacheSnapshot(latest);
        } else {
          await saveLegacyNormalized(canonical.chatId, canonical.messages, { capturedAt: canonical.createdAt }, {});
        }
      } catch (e) {
        warn("legacy saveLatest failed", e);
      }
    })();
    return true;
  }

  function legacyRemove(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return false;
    if (isExtensionBacked()) {
      (async () => {
        try {
          const list = await listSnapshots(chatId);
          const first = list[0];
          if (first?.snapshotId) await deleteSnapshot(first.snapshotId);
        } catch (e) {
          warn("legacy remove bridge failed", e);
        }
      })();
      return true;
    }
    const ok = lsDel(keyArchiveData(chatId));
    const idx = Array.isArray(lsGetJson(keyArchiveIndex(), [])) ? lsGetJson(keyArchiveIndex(), []) : [];
    lsSetJson(keyArchiveIndex(), idx.filter((x) => String(x?.chatId || "") !== chatId));
    return !!ok;
  }

  async function getArchiveStatus(chatIdRaw) {
    return resolveEffectiveArchivePlan(chatIdRaw, { forceLoadLatest: true });
  }

  archiveBoot._rendererHost = {
    getCurrentChatId,
    toChatId,
    isExtensionBacked,
    getStorageMode,
    captureNow: (chatId) => captureNow(chatId),
    captureWithOptions: (opts = {}) => captureWithOptions(opts),
    loadLatestSnapshot: (chatId) => loadLatestSnapshotInternal(chatId),
    getCachedLatestSnapshot: (chatIdRaw) => {
      const chatId = toChatId(chatIdRaw || getCurrentChatId());
      return chatId ? (state.latestByChat.get(chatId) || null) : null;
    },
    listSnapshots: (chatId) => listSnapshots(chatId),
    loadSnapshot: (snapshotId) => loadSnapshot(snapshotId),
    pinSnapshot: (snapshotId, pinned) => pinSnapshot(snapshotId, pinned),
    deleteSnapshot: (snapshotId) => deleteSnapshot(snapshotId),
    listWorkbenchRows: () => listWorkbenchRowsInternal(),
    openSavedChats: (opts = {}) => openSavedChats(opts),
    getPageMode: (chatId) => getPageMode(chatId),
    setPageMode: (chatId, mode) => setPageMode(chatId, mode),
    getMode: (chatId) => getMode(chatId),
    setMode: (chatId, mode) => setMode(chatId, mode),
    getViewMode: (chatId) => getViewMode(chatId),
    setViewMode: (chatId, viewMode, opts = null) => setViewMode(chatId, viewMode, opts),
    getLoadStrategy: (chatId) => getLoadStrategy(chatId),
    setLoadStrategy: (chatId, strategy, opts = null) => setLoadStrategy(chatId, strategy, opts),
    refreshDockState: (chatId) => refreshDockState(chatId),
    getFoldersList,
    resolveFolderBinding,
    getArchiveAdvancedSettings: () => getArchiveAdvancedSettings(),
  };

  archiveBoot._bridge = {
    lsGetStr, lsSetStr, lsDel, lsGetJson, lsSetJson,
    lsGetStrWithFallback, lsSetStrBoth, lsSetJsonBoth,
    canonicalSnapshot, normalizeHotStart, keyHotStart,
    getLocalBaseline, setLocalBaseline,
    getLocalBootMode, setLocalBootMode,
    getLocalViewMode, setLocalViewMode,
    getLocalLoadStrategy, setLocalLoadStrategy,
    setDockWarning, getDockWarning, setDockStatusText, getDockStatusText, refreshDockState,
    getFoldersList, resolveFolderBinding, setFolderBinding,
    migrateLocalChatKeysIfNeeded, migrateLegacyIfNeeded,
    getArchiveAdvancedSettings: () => getArchiveAdvancedSettings(),
    getCurrentChatId, toChatId,
  };

  archiveBoot.VERSION = "1.3.0";
  archiveBoot.MSG = { REQ, RES, SW };
  archiveBoot.ARCH_VIEW_CACHE_FIRST = ARCH_VIEW_CACHE_FIRST;
  archiveBoot.ARCH_VIEW_REBUILD_FIRST = ARCH_VIEW_REBUILD_FIRST;
  archiveBoot.LOAD_STRATEGY_AUTO = LOAD_STRATEGY_AUTO;
  archiveBoot.isExtensionBacked = () => isExtensionBacked();
  archiveBoot.getPageMode = (chatId) => getPageMode(chatId);
  archiveBoot.setPageMode = (chatId, mode) => setPageMode(chatId, mode);
  archiveBoot.getLoadStrategy = (chatId) => getLoadStrategy(chatId);
  archiveBoot.setLoadStrategy = (chatId, strategy, opts = null) => setLoadStrategy(chatId, strategy, opts);
  archiveBoot.getArchiveStatus = (chatId) => getArchiveStatus(chatId);
  archiveBoot.getAdvancedSettings = () => getArchiveAdvancedSettings();
  archiveBoot.setAdvancedSettings = (next = {}) => setArchiveAdvancedSettings(next);
  archiveBoot.getMode = (chatId) => getMode(chatId);
  archiveBoot.setMode = (chatId, mode) => setMode(chatId, mode);
  archiveBoot.getViewMode = (chatId) => getViewMode(chatId);
  archiveBoot.setViewMode = (chatId, viewMode) => setViewMode(chatId, viewMode);
  archiveBoot.getHotStart = (chatId) => getHotStart(chatId);
  archiveBoot.setHotStart = (chatId, idx) => setHotStart(chatId, idx);
  archiveBoot.applyHybrid = (chatId, reason) => applyHybrid(chatId, reason);
  archiveBoot.applyHybridMode = (chatId, reason) => applyHybrid(chatId, reason);
  archiveBoot.disableHybrid = (chatId, reason) => disableHybrid(chatId, reason);
  archiveBoot.rehydrateFromIndex = (chatId, idx, opts = {}) => rehydrateFromIndex(chatId, idx, opts);
  archiveBoot.applyBootMode = (chatId, reason) => applyBootMode(chatId, reason);
  archiveBoot.afterSnapshotCaptured = (chatId, latest, reason) => afterSnapshotCaptured(chatId, latest, reason);
  archiveBoot.getHybridState = (chatId) => getHybridState(chatId);
  archiveBoot.setPreviewStatus = (chatId, next = null) => setPreviewStatus(chatId, next);
  archiveBoot.getPreviewStatus = (chatId) => getPreviewStatus(chatId);
  archiveBoot.clearMiniMapColdMarkers = () => clearMiniMapColdMarkers();
  archiveBoot.resyncMiniMapColdMarkers = (chatId, reason) => resyncMiniMapColdMarkers(chatId, reason);
  archiveBoot.captureNow = (chatId) => captureNow(chatId);
  archiveBoot.captureWithOptions = (opts = {}) => captureWithOptions(opts);
  archiveBoot.loadLatestSnapshot = (chatId) => loadLatestSnapshotInternal(chatId);
  archiveBoot.openReader = () => { warn("openReader deprecated — use hybrid view or Studio"); return Promise.resolve({ ok: false, reason: "reader-removed" }); };
  archiveBoot.openWorkbench = (route) => openWorkbench(route);
  archiveBoot.openSavedChats = (opts = {}) => openSavedChats(opts);
  archiveBoot.listAllChatIds = () => listAllChatIdsInternal();
  archiveBoot.listWorkbenchRows = () => listWorkbenchRowsInternal();
  archiveBoot.listSnapshots = (chatId) => listSnapshots(chatId);
  archiveBoot.loadSnapshot = (snapshotId) => loadSnapshot(snapshotId);
  archiveBoot.pinSnapshot = (snapshotId, pinned) => pinSnapshot(snapshotId, pinned);
  archiveBoot.deleteSnapshot = (snapshotId) => deleteSnapshot(snapshotId);
  archiveBoot.getFolderBinding = (chatId) => resolveFolderBinding(chatId);
  archiveBoot.setFolderBinding = (chatId, folderId) => setFolderBinding(chatId, folderId);
  archiveBoot.exportBundle = (opts = {}) => exportBundle(opts);
  archiveBoot.importBundle = (opts = {}) => importBundle(opts);

  archiveBoot.captureLive = legacyCaptureLive;
  archiveBoot.saveLatest = legacySaveLatest;
  archiveBoot.getLatest = legacyGetLatest;
  archiveBoot.remove = legacyRemove;
  archiveBoot.list = legacyList;

  const archive = (H2O.archive = H2O.archive || {});
  archive.captureLive = (...args) => archiveBoot.captureLive(...args);
  archive.saveLatest = (...args) => archiveBoot.saveLatest(...args);
  archive.getLatest = (...args) => archiveBoot.getLatest(...args);
  archive.remove = (...args) => archiveBoot.remove(...args);
  archive.list = (...args) => archiveBoot.list(...args);

  const archiveLibrary = (H2O.archiveLibrary = H2O.archiveLibrary || {});
  archiveLibrary.open = (opts = {}) => {
    const request = {
      view: normalizeArchiveView(opts.view || "saved"),
      folderId: normalizeFolderFilter(opts.folderId || ""),
      chatId: toChatId(opts.chatId || ""),
      snapshotId: String(opts.snapshotId || "").trim(),
    };
    void openSavedChats(request).catch((e) => warn("archiveLibrary.open failed", e));
    return buildSavedChatsCompatUrl(request);
  };
  archiveLibrary.VERSION = "1.0.0";

  async function onRouteChange(force = false) {
    const href = String(W.location.href || "");
    const chatId = getCurrentChatId();
    if (!force && href === state.lastHref && chatId === state.lastChatId) return;
    const prevChatId = state.lastChatId;
    state.lastHref = href;
    state.lastChatId = chatId;
    if (prevChatId && prevChatId !== chatId) {
      await disableHybrid(prevChatId, "route-chat-switch");
      try { getRenderer()?.cleanupColdLayers?.(null); } catch {}
    }
    const libReq = parseLibraryHashRequest();
    if (libReq && href !== state.lastLibraryHashHref) {
      state.lastLibraryHashHref = href;
      openSavedChats(libReq).catch((e) => warn("library hash open failed", e));
    } else if (!libReq) {
      state.lastLibraryHashHref = "";
    }
    await refreshDockState(chatId);
    await applyBootMode(chatId, "route-change");
    await resyncMiniMapColdMarkers(chatId, "route:post-boot");
    await refreshDockState(chatId);
  }

  async function boot() {
    requestRendererStyles();
    requestRendererBootListeners();
    ensureArchiveCommandBarBindings();
    scheduleCommandBarBindRetry();
    // Reader hash check — removed (reader deprecated)
    await ensureExtensionBacked();
    await onRouteChange(true);
    W.setInterval(() => {
      onRouteChange(false).catch((e) => warn("route watcher", e));
    }, 800);
    log("ready", { extensionBacked: isExtensionBacked() });
  }

  boot().catch((e) => warn("boot failed", e));
})();
