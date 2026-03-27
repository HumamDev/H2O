// ==UserScript==
// @h2o-id             0b3a.data.archive
// @name               0B3a.⬛️🗄️ Data Archive 🗂️
// @namespace          H2O.Premium.CGX.data.archive
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260304-102754
// @description        Unified archive runtime (extension-backed boot mode + reader + compatibility facade).
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

  const state = {
    extensionChecked: false,
    extensionBacked: false,
    bridgeClientId: "",
    bridgeSessionToken: "",
    bridgeSessionReady: false,
    latestByChat: new Map(),
    snapshotChatById: new Map(),
    migratedSeen: new Set(),
    keyMigrationSeen: new Set(),
    lastChatId: "",
    lastHref: "",
    stylesMounted: false,
    commandBarApi: null,
    commandBarBound: false,
    commandBarBindTimer: 0,
    dockWarnByChat: new Map(),
    dockStatusTextByChat: new Map(),
    previewStatusByChat: new Map(),
    hybridByChat: new Map(),
    hybridStreamFailCount: new Map(),
    hybridScrollHostFailCount: new Map(),
    hybridApplyTimer: 0,
    hybridMutationReasonByChat: new Map(),
    lastLibraryHashHref: "",
    reader: {
      root: null,
      title: null,
      error: null,
      search: null,
      list: null,
      body: null,
      count: null,
      modeSelect: null,
      chatId: "",
      snapshots: [],
      currentSnapshot: null,
    },
    page: {
      root: null,
      title: null,
      subtitle: null,
      badges: null,
      error: null,
      search: null,
      list: null,
      body: null,
      count: null,
      liveBtn: null,
      readerBtn: null,
      captureBtn: null,
      savedBtn: null,
      refreshBtn: null,
      closeBtn: null,
      mode: MODE_ARCHIVE_FIRST,
      chatId: "",
      snapshots: [],
      currentSnapshot: null,
    },
    saved: {
      root: null,
      title: null,
      note: null,
      search: null,
      viewSelect: null,
      folderSelect: null,
      list: null,
      openReaderBtn: null,
      rows: [],
      selectedChatId: "",
      selectedSnapshotId: "",
      noteTone: "",
    },
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

  function pageModeLabel(modeRaw) {
    const mode = normalizePageMode(modeRaw);
    if (mode === MODE_ARCHIVE_FIRST) return "Archive Preview";
    if (mode === MODE_ARCHIVE_ONLY) return "Archive Only";
    return "Live";
  }

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

  function collectNativeTurnNodes(rootEl = null) {
    const root = rootEl && rootEl.querySelectorAll ? rootEl : D;
    const nodes = Array.from(root.querySelectorAll(SEL_TURN_PRIMARY));
    return nodes.filter((el) => !isArchiveInjectedNode(el));
  }

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

  function parseReaderHashRequest() {
    const raw = String(W.location.hash || "");
    if (!raw) return null;
    const hash = raw.startsWith("#") ? raw.slice(1) : raw;
    const params = new URLSearchParams(hash);
    if (String(params.get("h2o-archive-reader") || "") !== "1") return null;
    const chatId = toChatId(params.get("chatId") || getCurrentChatId());
    if (!chatId) return null;
    return { chatId };
  }

  function buildReaderTabUrl(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const u = new URL(W.location.href);
    const p = new URLSearchParams();
    p.set("h2o-archive-reader", "1");
    p.set("chatId", chatId);
    u.hash = p.toString();
    return u.toString();
  }

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

  function foldersApi() {
    const f = H2O.folders || W.H2O?.folders;
    return (f && typeof f === "object") ? f : null;
  }

  function tryLoadFoldersFallback() {
    const keys = [
      "h2o:prm:cgx:fldrs:state:data:v1",
      "h2o:folders:v1",
      "h2o:prm:cgx:folders:v1",
      "H2O:folders:v1",
    ];
    for (const key of keys) {
      const value = lsGetJson(key, null);
      if (Array.isArray(value)) return value;
      if (Array.isArray(value?.folders)) return value.folders;
    }
    return [];
  }

  function getFoldersList() {
    const f = foldersApi();
    try {
      if (typeof f?.list === "function") return f.list();
      if (typeof f?.getAll === "function") return f.getAll();
      if (Array.isArray(f?.folders)) return f.folders;
    } catch {}
    return tryLoadFoldersFallback();
  }

  function keyArchiveFolder(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    return `${dataNs()}:archiveFolder:${chatId}:v1`;
  }

  function resolveFolderBinding(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return { folderId: "", folderName: "" };
    const raw = lsGetJson(keyArchiveFolder(chatId), null);
    const folderId = String(raw?.folderId || raw?.id || "").trim();
    if (!folderId) return { folderId: "", folderName: "" };
    const folderList = getFoldersList();
    const folders = Array.isArray(folderList) ? folderList : [];
    let folderName = "";
    for (const folder of folders) {
      const id = String(folder?.id || folder?.folderId || "").trim();
      if (!id || id !== folderId) continue;
      folderName = String(folder?.name || folder?.title || folderId).trim();
      break;
    }
    return { folderId, folderName };
  }

  function resolveFolderInfo(folderIdRaw) {
    const folderId = String(folderIdRaw || "").trim();
    if (!folderId) return { folderId: "", folderName: "" };
    const list = Array.isArray(getFoldersList()) ? getFoldersList() : [];
    for (const folder of list) {
      const id = String(folder?.id || folder?.folderId || "").trim();
      if (!id || id !== folderId) continue;
      return {
        folderId,
        folderName: String(folder?.name || folder?.title || folderId).trim() || folderId,
      };
    }
    return { folderId, folderName: folderId };
  }

  function setFolderBinding(chatIdRaw, folderIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) throw new Error("missing chatId");
    const folderId = String(folderIdRaw || "").trim();
    if (!folderId) {
      lsDel(keyArchiveFolder(chatId));
      return { ok: true, chatId, folderId: "", folderName: "" };
    }
    const folderInfo = resolveFolderInfo(folderId);
    lsSetJson(keyArchiveFolder(chatId), {
      folderId: folderInfo.folderId,
      folderName: folderInfo.folderName,
      updatedAt: nowIso(),
    });
    return { ok: true, chatId, folderId: folderInfo.folderId, folderName: folderInfo.folderName };
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
  function getLocalHotStart(chatId, fallback = 0) {
    return normalizeHotStart(lsGetStr(keyHotStart(chatId), null), fallback);
  }
  function setLocalHotStart(chatId, idxRaw) {
    const idx = normalizeHotStart(idxRaw, 0);
    lsSetStr(keyHotStart(chatId), String(idx));
    return idx;
  }
  function delLocalHotStart(chatId) {
    return lsDel(keyHotStart(chatId));
  }
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

  function makeBridgeClientId() {
    return `arch_client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function bridgeNeedsSession(opRaw) {
    const op = String(opRaw || "").trim();
    return !!op && op !== "ping" && op !== "initSession";
  }

  async function ensureBridgeSession(force = false) {
    if (!state.extensionBacked) return false;
    if (!state.bridgeClientId) state.bridgeClientId = makeBridgeClientId();
    if (state.bridgeSessionReady && state.bridgeSessionToken && !force) return true;
    try {
      const id = `h2o_archive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const req = {
        op: "initSession",
        payload: { clientId: state.bridgeClientId },
      };
      const maxWait = 2000;
      const out = await new Promise((resolve, reject) => {
        let done = false;
        const timer = W.setTimeout(() => {
          if (done) return;
          done = true;
          W.removeEventListener("message", onMsg, false);
          reject(new Error("bridge session timeout"));
        }, maxWait);
        const onMsg = (ev) => {
          if (ev.source !== W) return;
          const data = ev.data;
          if (!isObj(data) || data.type !== RES || String(data.id || "") !== id) return;
          if (done) return;
          done = true;
          W.clearTimeout(timer);
          W.removeEventListener("message", onMsg, false);
          if (data.ok === false) {
            reject(new Error(String(data.error || "bridge session failed")));
            return;
          }
          resolve(data.result || null);
        };
        W.addEventListener("message", onMsg, false);
        try {
          W.postMessage({ type: REQ, id, req, timeoutMs: maxWait }, "*");
        } catch (e) {
          if (done) return;
          done = true;
          W.clearTimeout(timer);
          W.removeEventListener("message", onMsg, false);
          reject(e);
        }
      });
      const token = String(out?.sessionToken || "").trim();
      if (!token) throw new Error("missing session token");
      state.bridgeSessionToken = token;
      state.bridgeSessionReady = true;
      return true;
    } catch (e) {
      state.bridgeSessionToken = "";
      state.bridgeSessionReady = false;
      warn("bridge session init failed", e);
      return false;
    }
  }

  async function bridgeCall(op, payload = {}, timeoutMs = BRIDGE_TIMEOUT_MS) {
    const req = { op: String(op || "").trim(), payload: isObj(payload) ? payload : {} };
    if (!req.op) throw new Error("missing bridge op");
    const nextPayload = isObj(req.payload) ? { ...req.payload } : {};
    if (!Object.prototype.hasOwnProperty.call(nextPayload, "nsDisk")) nextPayload.nsDisk = dataNs();
    if (bridgeNeedsSession(req.op)) {
      if (!state.bridgeSessionReady || !state.bridgeSessionToken) {
        await ensureBridgeSession();
      }
      if (state.bridgeSessionReady && state.bridgeSessionToken) {
        nextPayload.clientId = state.bridgeClientId;
        nextPayload.sessionToken = state.bridgeSessionToken;
      }
    }
    req.payload = nextPayload;

    const id = `h2o_archive_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const maxWait = Number.isFinite(Number(timeoutMs)) ? Math.max(500, Math.min(120000, Math.floor(Number(timeoutMs)))) : BRIDGE_TIMEOUT_MS;

    return new Promise((resolve, reject) => {
      let done = false;
      const timer = W.setTimeout(() => {
        if (done) return;
        done = true;
        W.removeEventListener("message", onMsg, false);
        reject(new Error(`bridge timeout (${maxWait}ms)`));
      }, maxWait);

      const onMsg = (ev) => {
        if (ev.source !== W) return;
        const data = ev.data;
        if (!isObj(data) || data.type !== RES || String(data.id || "") !== id) return;
        if (done) return;
        done = true;
        W.clearTimeout(timer);
        W.removeEventListener("message", onMsg, false);
        if (data.ok === false) {
          const msg = String(data.error || "bridge request failed");
          if (bridgeNeedsSession(req.op) && /session|unauthorized|token/i.test(msg)) {
            state.bridgeSessionReady = false;
            state.bridgeSessionToken = "";
          }
          reject(new Error(msg));
          return;
        }
        resolve(data.result);
      };

      W.addEventListener("message", onMsg, false);
      try {
        W.postMessage({ type: REQ, id, req, timeoutMs: maxWait }, "*");
      } catch (e) {
        if (done) return;
        done = true;
        W.clearTimeout(timer);
        W.removeEventListener("message", onMsg, false);
        reject(e);
      }
    });
  }

  async function ensureExtensionBacked(force = false) {
    if (state.extensionChecked && !force) return state.extensionBacked;
    state.extensionChecked = true;
    try {
      const pong = await bridgeCall("ping", {}, 1800);
      state.extensionBacked = !!(pong && (pong.ok !== false) && String(pong.source || "sw") === "sw");
      if (state.extensionBacked) await ensureBridgeSession(force);
      else {
        state.bridgeSessionReady = false;
        state.bridgeSessionToken = "";
      }
    } catch {
      state.extensionBacked = false;
      state.bridgeSessionReady = false;
      state.bridgeSessionToken = "";
    }
    return state.extensionBacked;
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

  function getHotStart(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return 0;
    return getLocalHotStart(chatId, 0);
  }

  function setHotStart(chatIdRaw, idxRaw) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    return setLocalHotStart(chatId, idxRaw);
  }

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
        state.extensionChecked = false;
        state.extensionBacked = false;
        state.bridgeSessionReady = false;
        state.bridgeSessionToken = "";
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
      state.extensionChecked = false;
      state.extensionBacked = false;
      state.bridgeSessionReady = false;
      state.bridgeSessionToken = "";
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
    if (mode === SAVE_MODE_READER) {
      afterOpen = await openReader(chatId, snapshotId);
    } else if (mode === SAVE_MODE_LIBRARY) {
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
      try {
        if (state.saved.root) state.saved.root.classList.remove("open");
      } catch {}
      return {
        ...res,
        mode: "workbench",
        route,
        compatUrl: buildSavedChatsCompatUrl(request),
      };
    }
    const panel = await openSavedChatsPanel({
      ...request,
      note: String(res?.message || WORKBENCH_LOCAL_ONLY_WARNING),
      tone: "warn",
      force: !!opts.force,
    });
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

  function emitArchiveEvent(type, detail = {}) {
    try { W.dispatchEvent(new CustomEvent(String(type || ""), { detail: isObj(detail) ? detail : {} })); } catch {}
  }

  function setDockWarning(chatIdRaw, message = "") {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return;
    const msg = String(message || "").trim();
    if (msg) state.dockWarnByChat.set(chatId, msg);
    else state.dockWarnByChat.delete(chatId);
  }

  function getDockWarning(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return "";
    return String(state.dockWarnByChat.get(chatId) || "");
  }

  function setDockStatusText(chatIdRaw, message = "") {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return;
    const msg = String(message || "").trim();
    if (msg) state.dockStatusTextByChat.set(chatId, msg);
    else state.dockStatusTextByChat.delete(chatId);
  }

  function getDockStatusText(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return "";
    return String(state.dockStatusTextByChat.get(chatId) || "");
  }

  function setPreviewStatus(chatIdRaw, nextRaw = null) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return null;
    if (!isObj(nextRaw)) {
      state.previewStatusByChat.delete(chatId);
      return null;
    }
    const next = {
      fallbackReason: normalizeFallbackReason(nextRaw.fallbackReason || FALLBACK_REASON_NONE),
      message: String(nextRaw.message || "").trim(),
      activeSource: String(nextRaw.activeSource || "").trim().toLowerCase() || ACTIVE_SOURCE_ARCHIVE,
      snapshotId: String(nextRaw.snapshotId || "").trim(),
      updatedAt: nowIso(),
    };
    state.previewStatusByChat.set(chatId, next);
    return next;
  }

  function getPreviewStatus(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return null;
    return state.previewStatusByChat.get(chatId) || null;
  }

  function debugArchive(...args) {
    if (!getArchiveAdvancedSettings().debugArchiveEvents) return;
    try { console.debug(TAG, ...args); } catch {}
  }

  function inferFallbackReasonFromWarning(warnRaw, fallback = FALLBACK_REASON_NONE) {
    const text = String(warnRaw || "").trim();
    if (!text) return normalizeFallbackReason(fallback);
    if (/mount/i.test(text) && /fail/i.test(text)) return FALLBACK_REASON_MOUNT_FAILED;
    if (/host/i.test(text) && /fail/i.test(text)) return FALLBACK_REASON_HOST_FAILED;
    if (/snapshot/i.test(text) && /missing/i.test(text)) return FALLBACK_REASON_SNAPSHOT_MISSING;
    if (/live/i.test(text) && /single/i.test(text)) return FALLBACK_REASON_LIVE_SINGLE_VIEW;
    return normalizeFallbackReason(fallback);
  }

  async function resolveEffectiveArchivePlan(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) {
      return {
        chatId: "",
        pageMode: MODE_LIVE_FIRST,
        pageModeLabel: pageModeLabel(MODE_LIVE_FIRST),
        requestedStrategy: ARCH_VIEW_REBUILD_FIRST,
        requestedStrategyLabel: loadStrategyLabel(ARCH_VIEW_REBUILD_FIRST),
        effectiveStrategy: ARCH_VIEW_REBUILD_FIRST,
        effectiveStrategyLabel: loadStrategyLabel(ARCH_VIEW_REBUILD_FIRST),
        activeSource: ACTIVE_SOURCE_NATIVE,
        activeSourceLabel: activeSourceLabel(ACTIVE_SOURCE_NATIVE),
        snapshotReady: false,
        snapshotStateLabel: "Missing",
        baselineReady: false,
        baselineStateLabel: "Missing",
        snapshotId: "",
        baselineCount: 0,
        fallbackReason: FALLBACK_REASON_NONE,
        fallbackReasonLabel: fallbackReasonLabel(FALLBACK_REASON_NONE),
        helpText: buildArchiveHelpText(MODE_LIVE_FIRST),
        previewVisible: false,
        storageMode: state.extensionBacked ? "extension" : "local",
        advanced: getArchiveAdvancedSettings(),
      };
    }

    const advanced = normalizeArchiveAdvancedSettings(opts.advanced || getArchiveAdvancedSettings());
    const pageMode = normalizePageMode(opts.pageMode || await getPageMode(chatId));
    const requestedStrategy = normalizeLoadStrategy(opts.requestedStrategy || opts.loadStrategy || getLoadStrategy(chatId));
    let latest = canonicalSnapshot(opts.latest);
    if (!latest && (opts.forceLoadLatest || pageMode !== MODE_LIVE_FIRST || requestedStrategy !== ARCH_VIEW_REBUILD_FIRST || advanced.showSnapshotMeta)) {
      try {
        latest = await loadLatestSnapshotInternal(chatId);
      } catch (e) {
        warn("resolveEffectiveArchivePlan snapshot load failed", e);
      }
    }
    const baseline = normalizeBaseline(opts.baseline || getLocalBaseline(chatId), null);
    const snapshotId = String(latest?.snapshotId || baseline?.snapshotId || "");
    const baselineCount = Array.isArray(latest?.messages) ? latest.messages.length : normalizeHotStart(baseline?.baselineCount, 0);
    const snapshotReady = !!snapshotId;
    const baselineReady = baselineCount > 0;
    let effectiveStrategy = requestedStrategy;
    let activeSource = ACTIVE_SOURCE_NATIVE;
    let fallbackReason = FALLBACK_REASON_NONE;

    if (pageMode === MODE_LIVE_FIRST) {
      activeSource = ACTIVE_SOURCE_NATIVE;
      effectiveStrategy = ARCH_VIEW_REBUILD_FIRST;
      if (requestedStrategy !== ARCH_VIEW_REBUILD_FIRST) {
        fallbackReason = snapshotReady ? FALLBACK_REASON_LIVE_SINGLE_VIEW : FALLBACK_REASON_SNAPSHOT_MISSING;
      }
    } else if (!snapshotReady) {
      effectiveStrategy = ARCH_VIEW_REBUILD_FIRST;
      activeSource = ACTIVE_SOURCE_ARCHIVE;
      fallbackReason = FALLBACK_REASON_SNAPSHOT_MISSING;
    } else {
      effectiveStrategy = requestedStrategy === LOAD_STRATEGY_AUTO ? ARCH_VIEW_CACHE_FIRST : requestedStrategy;
      activeSource = effectiveStrategy === ARCH_VIEW_CACHE_FIRST ? ACTIVE_SOURCE_SNAPSHOT : ACTIVE_SOURCE_ARCHIVE;
    }

    const previewStatus = getPreviewStatus(chatId);
    if (previewStatus?.fallbackReason) {
      fallbackReason = normalizeFallbackReason(previewStatus.fallbackReason);
      if (previewStatus.activeSource) activeSource = String(previewStatus.activeSource || "").trim().toLowerCase() || activeSource;
    } else {
      fallbackReason = inferFallbackReasonFromWarning(opts.warning || getDockWarning(chatId), fallbackReason);
    }

    const fallbackReasonText = advanced.showFallbackReason ? fallbackReasonLabel(fallbackReason) : "Hidden";
    const helpText = buildArchiveHelpText(pageMode);
    const statusText = pageMode === MODE_LIVE_FIRST
      ? "Live mode keeps one native transcript visible."
      : (pageMode === MODE_ARCHIVE_ONLY
        ? "Archive Only shows one archive-owned transcript surface."
        : "Archive Preview shows one archive-owned preview surface.");

    return {
      chatId,
      pageMode,
      pageModeLabel: pageModeLabel(pageMode),
      requestedStrategy,
      requestedStrategyLabel: loadStrategyLabel(requestedStrategy),
      effectiveStrategy,
      effectiveStrategyLabel: loadStrategyLabel(effectiveStrategy),
      activeSource,
      activeSourceLabel: activeSourceLabel(activeSource),
      snapshotReady,
      snapshotStateLabel: snapshotReady ? "Ready" : "Missing",
      baselineReady,
      baselineStateLabel: baselineReady ? "Ready" : "Missing",
      snapshotId,
      baselineCount,
      capturedAt: String(latest?.createdAt || baseline?.capturedAt || ""),
      fallbackReason,
      fallbackReasonLabel: fallbackReasonText,
      previewVisible: !!(state.page.root && state.page.root.classList.contains("open") && state.page.chatId === chatId),
      helpText,
      statusText,
      storageMode: state.extensionBacked ? "extension" : "local",
      latest,
      advanced,
      statusLines: [
        { key: "Mode", value: pageModeLabel(pageMode) },
        { key: "Strategy", value: loadStrategyLabel(requestedStrategy) },
        { key: "Effective strategy", value: loadStrategyLabel(effectiveStrategy) },
        { key: "Snapshot", value: snapshotReady ? "Ready" : "Missing" },
        { key: "Baseline", value: baselineReady ? "Ready" : "Missing" },
        { key: "Active source", value: activeSourceLabel(activeSource) },
        { key: "Fallback reason", value: fallbackReasonText },
      ],
    };
  }

  async function getArchiveStatus(chatIdRaw) {
    return resolveEffectiveArchivePlan(chatIdRaw, { forceLoadLatest: true });
  }

  function getHybridState(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return null;
    let st = state.hybridByChat.get(chatId);
    if (st) return st;
    st = {
      chatId,
      enabled: false,
      applying: false,
      coldOnly: false,
      root: null,
      scrollHost: null,
      coldLayer: null,
      observer: null,
      observerRoot: null,
      coldOnlyObserver: null,
      coldOnlyObserverRoot: null,
      retryTimer: 0,
      snapshotId: "",
      baselineCount: 0,
      baselineTurns: 0,
      hotStart: 0,
      lastAppliedSnapshotId: "",
      lastAppliedBaselineCount: 0,
      lastAppliedHotStart: 0,
      lastNativeNodeCount: 0,
      lastNativeTurnCount: 0,
      mutationPending: false,
      detachMode: "none",
      detachedNodes: [],
      detachSpacerEl: null,
      detachAnchorEl: null,
      detachedBinEl: null,
      lastSpacerPx: 0,
      lastDetachedCount: 0,
      lastDetachNodeCount: 0,
    };
    state.hybridByChat.set(chatId, st);
    return st;
  }

  function isScrollableElement(el) {
    if (!el || !el.isConnected) return false;
    try {
      const cs = getComputedStyle(el);
      const oy = String(cs?.overflowY || "");
      const mayScroll = oy === "auto" || oy === "scroll" || oy === "overlay";
      return mayScroll && (el.scrollHeight > (el.clientHeight + 10));
    } catch {
      return false;
    }
  }

  function resolveScrollHost(rootEl = null) {
    let cur = rootEl && rootEl.nodeType === 1 ? rootEl : null;
    while (cur && cur !== D.body && cur !== D.documentElement) {
      if (isScrollableElement(cur)) return cur;
      cur = cur.parentElement;
    }
    return D.scrollingElement || D.documentElement || D.body;
  }

  function resolveChatScrollHost() {
    const firstNative = collectNativeMessageNodes(D)[0] || null;
    let cur = firstNative && firstNative.nodeType === 1 ? firstNative : null;
    while (cur && cur !== D.body && cur !== D.documentElement) {
      if (isScrollableElement(cur)) return cur;
      cur = cur.parentElement;
    }
    return D.scrollingElement || D.documentElement || D.body;
  }

  function resolveColdMountTarget(rootEl = null) {
    const convRoot = D.querySelector('[data-testid="conversation-turns"]')
      || D.querySelector('[data-testid^="conversation-turns"]')
      || null;
    const main = D.querySelector("main");
    let mountRoot = null;
    let reason = "body";
    if (convRoot && convRoot.isConnected) {
      mountRoot = convRoot;
      reason = "conversation-turns";
    } else if (main && main.isConnected) {
      mountRoot = main.firstElementChild || main;
      reason = "main";
    } else {
      mountRoot = D.body || D.documentElement || null;
      reason = "body";
    }
    const host = resolveScrollHost(mountRoot || main || D.body);
    if (!host) return { host: null, mountRoot: null, reason: "missing-host" };
    if (!mountRoot || !host.contains(mountRoot)) {
      mountRoot = host.firstElementChild || host;
      reason = `${reason}:host-rebind`;
    }
    if (!mountRoot) return { host: null, mountRoot: null, reason: "missing-mount-root" };
    return { host, mountRoot, reason };
  }

  function isVisibleInHost(targetEl, hostEl) {
    if (!targetEl || !targetEl.isConnected) return false;
    try {
      const tr = targetEl.getBoundingClientRect();
      if (!tr || tr.height <= 0 || tr.width <= 0) return false;
      const host = hostEl || D.scrollingElement || D.documentElement || D.body;
      const isPageHost = host === D.scrollingElement || host === D.documentElement || host === D.body;
      if (isPageHost) {
        const vh = W.innerHeight || D.documentElement?.clientHeight || 0;
        return tr.bottom >= 0 && tr.top <= vh;
      }
      const hr = host.getBoundingClientRect();
      return tr.bottom >= hr.top && tr.top <= hr.bottom;
    } catch {
      return false;
    }
  }

  function collectNativeMessageNodes(rootEl = null) {
    const root = rootEl && rootEl.querySelectorAll ? rootEl : D;
    const nodes = Array.from(root.querySelectorAll(SEL_MESSAGE_NODES));
    return nodes.filter((el) => !isArchiveInjectedNode(el));
  }

  function allColdLayers() {
    return Array.from(D.querySelectorAll('.h2o-cold-layer[data-h2o-cold-layer="1"], .h2o-cold-layer'));
  }

  function pickNewestColdLayer() {
    const layers = allColdLayers();
    if (!layers.length) return null;
    let best = null;
    let bestCreated = -1;
    for (const el of layers) {
      const created = Number(el?.dataset?.h2oColdCreated || NaN);
      if (!Number.isFinite(created)) continue;
      if (created > bestCreated) {
        bestCreated = created;
        best = el;
      }
    }
    if (best) return best;
    for (const el of layers) {
      if (el && el.isConnected) return el;
    }
    return layers[0] || null;
  }

  function cleanupColdLayers(keepEl = null) {
    const keep = keepEl && keepEl.isConnected ? keepEl : null;
    const layers = allColdLayers();
    for (const el of layers) {
      if (keep && el === keep) continue;
      try { el.remove(); } catch {}
    }
    if (keep) {
      const left = allColdLayers();
      if (left.length !== 1 || left[0] !== keep) {
        warn("cold layer cleanup invariant failed", { keepConnected: !!keep.isConnected, count: left.length });
      }
    }
    return allColdLayers().length;
  }

  function ensureColdLayer(rootEl, st = null) {
    const resolved = resolveColdMountTarget(rootEl);
    const mountRoot = resolved?.mountRoot || null;
    const host = resolved?.host || null;
    if (!mountRoot || !host) return null;
    if (st) st.scrollHost = host;
    let layer = (st?.coldLayer && st.coldLayer.isConnected) ? st.coldLayer : null;
    if (!layer) layer = pickNewestColdLayer();
    if (layer && layer.isConnected) {
      try {
        layer.classList.add("h2o-cold-layer");
        layer.setAttribute("data-h2o-cold-layer", "1");
      } catch {}
      if (layer.parentElement !== mountRoot) {
        mountRoot.insertBefore(layer, mountRoot.firstChild || null);
      }
      cleanupColdLayers(layer);
      if (st) st.coldLayer = layer;
      return layer;
    }
    const newLayer = document.createElement("div");
    newLayer.className = "h2o-cold-layer";
    newLayer.setAttribute("data-h2o-cold-layer", "1");
    newLayer.dataset.h2oColdCreated = String(Date.now());
    mountRoot.insertBefore(newLayer, mountRoot.firstChild || null);
    cleanupColdLayers(newLayer);
    if (st) st.coldLayer = newLayer;
    return newLayer;
  }

  function clearMiniMapColdMarkers() {
    const btns = D.querySelectorAll('[data-cgxui="mnmp-btn"],[data-cgxui="mm-btn"],.cgxui-mm-btn');
    for (const btn of btns) {
      try {
        btn.classList.remove("h2o-mm-cold");
        btn.classList.remove("h2o-mm-pending");
        btn.removeAttribute("data-h2o-archive-cold");
        btn.removeAttribute("data-h2o-archive-pending");
        btn.removeAttribute("data-h2o-archive-msg-idx");
      } catch {}
    }
  }

  function unhideNativeColdNodes(rootEl = null) {
    const root = rootEl && rootEl.querySelectorAll ? rootEl : D;
    const nodes = root.querySelectorAll(".h2o-archive-native-cold-hidden,.h2o-archive-native-turn-hidden");
    for (const el of nodes) {
      try {
        el.classList.remove("h2o-archive-native-cold-hidden");
        el.classList.remove("h2o-archive-native-turn-hidden");
      } catch {}
    }
  }

  function ensureDetachBin(st) {
    if (!st) return null;
    if (st.detachedBinEl && st.detachedBinEl.isConnected) return st.detachedBinEl;
    const bin = D.createElement("div");
    bin.className = "h2o-archive-native-detached-bin";
    bin.style.display = "none";
    bin.style.visibility = "hidden";
    bin.style.pointerEvents = "none";
    (D.body || D.documentElement).appendChild(bin);
    st.detachedBinEl = bin;
    return bin;
  }

  function restoreDetachedNativeColdNodes(st) {
    if (!st) return { ok: false, restored: 0, reason: "missing-state" };
    const nodes = Array.isArray(st.detachedNodes) ? st.detachedNodes.filter(Boolean) : [];
    const spacer = st.detachSpacerEl;
    if (!nodes.length && !(spacer && spacer.isConnected)) {
      st.detachMode = "none";
      st.detachedNodes = [];
      st.detachSpacerEl = null;
      st.detachAnchorEl = null;
      return { ok: true, restored: 0 };
    }
    try {
      const parent = (spacer && spacer.parentNode) || (st.root && st.root.isConnected ? st.root : null);
      if (!parent) {
        for (const node of nodes) {
          try { node.remove?.(); } catch {}
        }
        if (spacer && spacer.isConnected) {
          try { spacer.remove(); } catch {}
        }
        st.detachMode = "none";
        st.detachedNodes = [];
        st.detachSpacerEl = null;
        st.detachAnchorEl = null;
        return { ok: true, restored: 0, reason: "detached-discarded" };
      }
      for (const node of nodes) {
        if (!node) continue;
        if (spacer && spacer.parentNode === parent) parent.insertBefore(node, spacer);
        else parent.appendChild(node);
        try { node.classList.remove("h2o-archive-native-cold-hidden"); } catch {}
      }
      if (spacer && spacer.isConnected) {
        try { spacer.remove(); } catch {}
      }
      st.detachMode = "none";
      st.detachedNodes = [];
      st.detachSpacerEl = null;
      st.detachAnchorEl = null;
      return { ok: true, restored: nodes.length };
    } catch (e) {
      warn("restore detached cold nodes failed", e);
      st.detachMode = "hidden";
      if (spacer && spacer.isConnected) {
        try { spacer.remove(); } catch {}
      }
      st.detachedNodes = [];
      st.detachSpacerEl = null;
      st.detachAnchorEl = null;
      return { ok: false, restored: 0, reason: "restore-failed" };
    }
  }

  function messageIndexForAnswer(messages, answerIndexRaw) {
    const rows = Array.isArray(messages) ? messages : [];
    const answerIndex = Math.max(1, Math.floor(Number(answerIndexRaw) || 0));
    if (!rows.length || answerIndex < 1) return rows.length;
    let seen = 0;
    for (let i = 0; i < rows.length; i += 1) {
      if (String(rows[i]?.role || "") !== "assistant") continue;
      seen += 1;
      if (seen === answerIndex) return i;
    }
    return rows.length;
  }

  function countAssistantTurns(messages, endExclusiveRaw = null) {
    const rows = Array.isArray(messages) ? messages : [];
    if (!rows.length) return 0;
    const endExclusive = endExclusiveRaw == null
      ? rows.length
      : Math.max(0, Math.min(rows.length, Math.floor(Number(endExclusiveRaw) || 0)));
    let turns = 0;
    for (let i = 0; i < endExclusive; i += 1) {
      if (String(rows[i]?.role || "").toLowerCase() === "assistant") turns += 1;
    }
    return turns;
  }

  function countAssistantInNativeNodes(nodes) {
    const list = Array.isArray(nodes) ? nodes : [];
    let turns = 0;
    for (const el of list) {
      const role = String(el?.getAttribute?.(ATTR_MESSAGE_AUTHOR_ROLE) || "").toLowerCase();
      if (role === "assistant") turns += 1;
    }
    return turns;
  }

  function isStreamRootReady(st) {
    if (!st?.root || !st.root.isConnected) return false;
    try {
      return collectNativeMessageNodes(st.root).length > 0;
    } catch {
      return false;
    }
  }

  function syncMiniMapColdState(chatIdRaw, messages, hotStartRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return;
    const hotStart = normalizeHotStart(hotStartRaw, 0);
    const rows = Array.isArray(messages) ? messages : [];
    const pendingHot = opts?.pendingHot === true;
    const pendingBaselineTurns = normalizeHotStart(opts?.pendingBaselineTurns, countAssistantTurns(rows));
    const btns = D.querySelectorAll('[data-cgxui="mnmp-btn"],[data-cgxui="mm-btn"],.cgxui-mm-btn');
    for (const btn of btns) {
      const idxRaw = Number(btn?.dataset?.turnIdx || 0);
      if (!Number.isFinite(idxRaw) || idxRaw <= 0) {
        try {
          btn.classList.remove("h2o-mm-cold");
          btn.classList.remove("h2o-mm-pending");
          btn.removeAttribute("data-h2o-archive-cold");
          btn.removeAttribute("data-h2o-archive-pending");
          btn.removeAttribute("data-h2o-archive-msg-idx");
        } catch {}
        continue;
      }
      const msgIdx = messageIndexForAnswer(rows, idxRaw);
      const isCold = pendingHot ? (idxRaw <= pendingBaselineTurns) : (msgIdx < hotStart);
      try {
        btn.dataset.h2oArchiveMsgIdx = String(msgIdx);
        if (isCold) {
          btn.classList.add("h2o-mm-cold");
          btn.classList.remove("h2o-mm-pending");
          btn.setAttribute("data-h2o-archive-cold", "1");
          btn.removeAttribute("data-h2o-archive-pending");
        } else {
          btn.classList.remove("h2o-mm-cold");
          btn.removeAttribute("data-h2o-archive-cold");
          if (pendingHot) {
            btn.classList.add("h2o-mm-pending");
            btn.setAttribute("data-h2o-archive-pending", "1");
          } else {
            btn.classList.remove("h2o-mm-pending");
            btn.removeAttribute("data-h2o-archive-pending");
          }
        }
      } catch {}
    }
  }

  function sanitizeRichTurnFragment(htmlRaw) {
    const html = String(htmlRaw || "").trim();
    if (!html) return null;
    const tpl = D.createElement("template");
    tpl.innerHTML = html;
    const blocked = tpl.content.querySelectorAll("script,style,link,iframe,object,embed");
    for (const bad of blocked) {
      try { bad.remove(); } catch {}
    }
    const all = tpl.content.querySelectorAll("*");
    for (const el of all) {
      try {
        el.removeAttribute("id");
        el.removeAttribute("contenteditable");
        if (String(el.getAttribute("data-testid") || "") === "conversation-turn") {
          el.removeAttribute("data-testid");
        }
        for (const attr of Array.from(el.attributes || [])) {
          const name = String(attr?.name || "").toLowerCase();
          if (name.startsWith("on")) el.removeAttribute(attr.name);
        }
        el.classList.add("h2o-cold-frozen");
        el.setAttribute("aria-hidden", "true");
        if (el.matches?.("a,button,input,textarea,select,summary,[role='button'],[role='link'],[tabindex]")) {
          el.setAttribute("tabindex", "-1");
          el.setAttribute("aria-disabled", "true");
        }
      } catch {}
    }
    const roots = Array.from(tpl.content.children || []);
    if (!roots.length) return null;
    for (const root of roots) {
      try {
        root.classList.add("h2o-cold-rich-turn", "h2o-cold-frozen");
        root.setAttribute("data-h2o-cold", "1");
        root.setAttribute("aria-hidden", "true");
      } catch {}
    }
    const frag = D.createDocumentFragment();
    while (tpl.content.firstChild) frag.appendChild(tpl.content.firstChild);
    return frag;
  }

  function renderColdLayer(layerEl, snapshotOrMessages, hotStartRaw) {
    if (!layerEl) return 0;
    const snapshot = isObj(snapshotOrMessages)
      ? snapshotOrMessages
      : { messages: Array.isArray(snapshotOrMessages) ? snapshotOrMessages : [], meta: {} };
    const rows = normalizeMessages(snapshot.messages);
    const meta = normalizeSnapshotMeta(snapshot.meta);
    const hotStart = normalizeHotStart(hotStartRaw, 0);
    const coldCount = Math.max(0, Math.min(rows.length, hotStart));
    layerEl.style.opacity = "0";
    layerEl.dataset.h2oColdTs = String(Date.now());
    if (!coldCount) {
      layerEl.replaceChildren();
      W.requestAnimationFrame(() => {
        if (layerEl.isConnected) layerEl.style.opacity = "1";
      });
      return 0;
    }

    const richTurns = normalizeRichTurns(meta?.richTurns);
    const coldTurns = countAssistantTurns(rows, coldCount);
    if (richTurns.length && coldTurns > 0) {
      const richByTurn = new Map();
      for (const turn of richTurns) richByTurn.set(Number(turn.turnIdx), turn);
      const richFrag = D.createDocumentFragment();
      for (let turnIdx = 1; turnIdx <= coldTurns; turnIdx += 1) {
        const msgIdx = messageIndexForAnswer(rows, turnIdx);
        const rich = richByTurn.get(turnIdx);
        const sanitized = sanitizeRichTurnFragment(rich?.outerHTML || "");
        if (!sanitized) continue;
        const temp = D.createElement("div");
        temp.appendChild(sanitized);
        const root = temp.firstElementChild;
        if (root) {
          root.setAttribute("data-h2o-cold", "1");
          root.setAttribute("data-h2o-cold-idx", String(msgIdx));
          root.setAttribute("data-h2o-cold-turn-idx", String(turnIdx));
          root.setAttribute("aria-hidden", "true");
        }
        while (temp.firstChild) richFrag.appendChild(temp.firstChild);
      }
      layerEl.replaceChildren(richFrag);
      W.requestAnimationFrame(() => {
        if (layerEl.isConnected) layerEl.style.opacity = "1";
      });
      return coldTurns;
    }

    const frag = D.createDocumentFragment();
    for (let i = 0; i < coldCount; i += 1) {
      const m = rows[i];
      const card = D.createElement("article");
      card.className = `h2o-cold-msg ${String(m?.role || "") === "user" ? "user" : "assistant"}`;
      card.setAttribute("data-h2o-cold-idx", String(i));
      card.setAttribute("aria-hidden", "true");
      const role = D.createElement("div");
      role.className = "h2o-cold-role";
      role.textContent = String(m?.role || "assistant");
      const text = D.createElement("div");
      text.className = "h2o-cold-text";
      text.textContent = String(m?.text || "");
      card.append(role, text);
      frag.appendChild(card);
    }
    layerEl.replaceChildren(frag);
    W.requestAnimationFrame(() => {
      if (layerEl.isConnected) layerEl.style.opacity = "1";
    });
    return coldCount;
  }

  function applyNativeColdBoundary(rootEl, hotStartRaw, opts = {}) {
    const nodes = Array.isArray(opts?.nodes) ? opts.nodes : collectNativeMessageNodes(rootEl);
    const hotStart = normalizeHotStart(hotStartRaw, 0);
    const startIdx = Math.max(0, Math.floor(Number(opts?.startIdx ?? 0) || 0));
    const endIdx = Math.min(nodes.length - 1, Math.max(startIdx, Math.floor(Number(opts?.endIdx ?? (nodes.length - 1)) || 0)));
    for (let i = startIdx; i <= endIdx; i += 1) {
      const el = nodes[i];
      if (!el) continue;
      if (i < hotStart) {
        try { el.classList.add("h2o-archive-native-cold-hidden"); } catch {}
      } else {
        try { el.classList.remove("h2o-archive-native-cold-hidden"); } catch {}
      }
    }
    return nodes.length;
  }

  function applyNativeColdTurnBoundary(rootEl, baselineTurnsRaw, opts = {}) {
    const nodes = Array.isArray(opts?.nodes) ? opts.nodes : collectNativeTurnNodes(rootEl);
    const baselineTurns = normalizeHotStart(baselineTurnsRaw, 0);
    const startIdx = Math.max(0, Math.floor(Number(opts?.startIdx ?? 0) || 0));
    const endIdx = Math.min(nodes.length - 1, Math.max(startIdx, Math.floor(Number(opts?.endIdx ?? (nodes.length - 1)) || 0)));
    for (let i = startIdx; i <= endIdx; i += 1) {
      const el = nodes[i];
      if (!el) continue;
      if (i < baselineTurns) {
        try { el.classList.add("h2o-archive-native-turn-hidden"); } catch {}
      } else {
        try { el.classList.remove("h2o-archive-native-turn-hidden"); } catch {}
      }
    }
    return nodes.length;
  }

  function detachNativeColdNodes(st, rootEl, hotStartRaw, nodes = null) {
    if (!st || !rootEl || !rootEl.isConnected) return { ok: false, mode: "skip", nodeCount: 0 };
    const hotStart = normalizeHotStart(hotStartRaw, 0);
    const hadDetached = st.detachMode === "detached" && Array.isArray(st.detachedNodes) && st.detachedNodes.length > 0;
    if (hadDetached) restoreDetachedNativeColdNodes(st);
    const list = (!hadDetached && Array.isArray(nodes)) ? nodes : collectNativeMessageNodes(rootEl);
    const nodeCount = list.length;
    st.lastDetachNodeCount = nodeCount;
    st.lastDetachedCount = 0;
    st.lastSpacerPx = 0;
    if (st.detachMode === "hidden") return { ok: false, mode: "hidden", nodeCount };
    if (hotStart < 1 || nodeCount < HYBRID_DETACH_THRESHOLD_NODES) {
      restoreDetachedNativeColdNodes(st);
      return { ok: false, mode: "skip", nodeCount };
    }
    const coldCount = Math.max(0, Math.min(nodeCount, hotStart));
    if (coldCount < 1) {
      restoreDetachedNativeColdNodes(st);
      return { ok: false, mode: "skip", nodeCount };
    }
    const coldNodes = list.slice(0, coldCount).filter((n) => !!n && n.isConnected);
    if (!coldNodes.length) return { ok: false, mode: "skip", nodeCount };
    let spacer = null;
    try {
      const first = coldNodes[0];
      const parent = first?.parentNode;
      if (!parent) return { ok: false, mode: "skip", nodeCount };
      let totalHeight = 0;
      for (const node of coldNodes) {
        const h = Number(node?.getBoundingClientRect?.().height || node?.offsetHeight || 0);
        if (Number.isFinite(h) && h > 0) totalHeight += h;
      }
      const baseHeight = Number(totalHeight);
      const bufferPx = Math.min(8, Math.max(1, Math.round(baseHeight * 0.01)));
      const spacerRaw = baseHeight + bufferPx;
      if (!Number.isFinite(spacerRaw) || spacerRaw <= 0 || spacerRaw > HYBRID_MAX_SPACER_PX) {
        return { ok: false, mode: "invalid-height", nodeCount, coldCount };
      }
      const spacerPx = Math.max(0, Math.min(HYBRID_MAX_SPACER_PX, Math.round(spacerRaw)));
      if (!Number.isFinite(spacerPx) || spacerPx <= 0) {
        return { ok: false, mode: "invalid-height", nodeCount, coldCount };
      }
      spacer = D.createElement("div");
      spacer.className = "h2o-archive-native-cold-spacer";
      spacer.style.height = `${spacerPx}px`;
      parent.insertBefore(spacer, first);
      const frag = D.createDocumentFragment();
      for (const node of coldNodes) {
        try { node.classList.remove("h2o-archive-native-cold-hidden"); } catch {}
        frag.appendChild(node);
      }
      const bin = ensureDetachBin(st);
      if (!bin) throw new Error("detach bin missing");
      bin.appendChild(frag);
      st.detachMode = "detached";
      st.detachedNodes = coldNodes;
      st.detachSpacerEl = spacer;
      st.detachAnchorEl = spacer;
      st.lastSpacerPx = spacerPx;
      st.lastDetachedCount = coldNodes.length;
      return { ok: true, mode: "detached", nodeCount, coldCount };
    } catch (e) {
      warn("detach cold nodes failed", e);
      if (spacer && spacer.isConnected) {
        try { spacer.remove(); } catch {}
      }
      restoreDetachedNativeColdNodes(st);
      st.detachMode = "hidden";
      applyNativeColdBoundary(rootEl, hotStart, { nodes: list, startIdx: 0, endIdx: list.length - 1 });
      return { ok: false, mode: "hidden-fallback", nodeCount, coldCount };
    }
  }

  function resolveStreamRoot() {
    const all = collectNativeMessageNodes(D);
    const hasMsgs = (el) => !!(el && typeof el.querySelectorAll === "function" && collectNativeMessageNodes(el).length > 0);
    if (!all.length) return { root: null, strategy: "none" };

    const first = all[0];
    const aRoot = first?.closest?.('[data-testid="conversation-turns"]')
      || first?.closest?.('[data-testid^="conversation-turns"]')
      || first?.parentElement
      || null;
    if (aRoot && hasMsgs(aRoot)) return { root: aRoot, strategy: "A" };

    const bCandidates = [
      D.querySelector('[data-testid="conversation-turns"]'),
      D.querySelector('[data-testid^="conversation-turns"]'),
      D.querySelector("main"),
    ].filter(Boolean);
    for (const cand of bCandidates) {
      if (hasMsgs(cand)) return { root: cand, strategy: "B" };
    }

    let cRoot = null;
    let cur = first?.parentElement || null;
    while (cur && cur !== D.body && cur !== D.documentElement) {
      let containsAll = true;
      for (const node of all) {
        if (!cur.contains(node)) {
          containsAll = false;
          break;
        }
      }
      if (containsAll && isScrollableElement(cur) && hasMsgs(cur)) {
        cRoot = cur;
        break;
      }
      cur = cur.parentElement;
    }
    if (cRoot) return { root: cRoot, strategy: "C" };
    return { root: null, strategy: "failed" };
  }

  function disconnectHybridObserver(st) {
    if (!st?.observer) return;
    try { st.observer.disconnect(); } catch {}
    st.observer = null;
    st.observerRoot = null;
  }

  function disconnectColdOnlyObserver(st) {
    if (!st?.coldOnlyObserver) return;
    try { st.coldOnlyObserver.disconnect(); } catch {}
    st.coldOnlyObserver = null;
    st.coldOnlyObserverRoot = null;
  }

  function isMutationAppendReason(reasonRaw) {
    const reason = String(reasonRaw || "").toLowerCase();
    return reason.includes("mutation:append");
  }

  function isExplicitFullReason(reasonRaw) {
    const reason = String(reasonRaw || "").toLowerCase();
    return reason.includes("route-change")
      || reason.includes("rehydrate")
      || reason.includes("capture")
      || reason.includes("set-view-mode")
      || reason.includes("mutation:full");
  }

  function ensureHybridObserver(chatId, st, rootEl) {
    if (!st || !rootEl) return false;
    if (!st.observer) {
      st.observer = new MutationObserver((mutations) => onHybridMutations(chatId, mutations));
    }
    if (st.observerRoot === rootEl) return true;
    try { st.observer.disconnect(); } catch {}
    try {
      st.observer.observe(rootEl, { childList: true, subtree: true });
      st.observerRoot = rootEl;
      return true;
    } catch (e) {
      warn("hybrid observer failed", e);
      st.observerRoot = null;
      return false;
    }
  }

  function ensureColdOnlyObserver(chatId, st, rootEl = null) {
    if (!st) return false;
    const observeRoot = (rootEl && rootEl.isConnected)
      ? rootEl
      : (D.body || D.documentElement || null);
    if (!observeRoot) return false;
    if (!st.coldOnlyObserver) {
      st.coldOnlyObserver = new MutationObserver((mutations) => onColdOnlyMutations(chatId, mutations));
    }
    if (st.coldOnlyObserverRoot === observeRoot) return true;
    try { st.coldOnlyObserver.disconnect(); } catch {}
    try {
      st.coldOnlyObserver.observe(observeRoot, { childList: true, subtree: true });
      st.coldOnlyObserverRoot = observeRoot;
      return true;
    } catch (e) {
      warn("cold-only observer failed", e);
      st.coldOnlyObserverRoot = null;
      return false;
    }
  }

  function onHybridMutations(chatIdRaw, mutationList) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const st = getHybridState(chatId);
    if (!chatId || !st?.enabled) return;
    const rows = Array.isArray(mutationList) ? mutationList : [];
    if (!rows.length) return;
    let added = 0;
    let removed = 0;
    for (const m of rows) {
      added += Number(m?.addedNodes?.length || 0);
      removed += Number(m?.removedNodes?.length || 0);
    }
    if (!added && !removed) return;
    if (!st.root || !st.root.isConnected || !st.coldLayer || !st.coldLayer.isConnected) {
      scheduleHybridApply(chatId, "mutation:full:root-disconnected");
      return;
    }
    if (removed > 0) {
      st.mutationPending = true;
      scheduleHybridApply(chatId, "mutation:full:removed");
      return;
    }
    st.mutationPending = true;
    scheduleHybridApply(chatId, "mutation:append");
  }

  function onColdOnlyMutations(chatIdRaw, mutationList) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const st = getHybridState(chatId);
    if (!chatId || !st?.enabled || !st.coldOnly) return;
    const rows = Array.isArray(mutationList) ? mutationList : [];
    if (!rows.length) return;
    let added = 0;
    let removed = 0;
    for (const m of rows) {
      added += Number(m?.addedNodes?.length || 0);
      removed += Number(m?.removedNodes?.length || 0);
    }
    if (!added && !removed) return;
    if (st.applying) return;

    const stream = resolveStreamRoot();
    if (stream?.root) {
      applyHybrid(chatId, "cold-only:upgrade").catch((e) => warn("cold-only upgrade failed", e));
      return;
    }

    const nativeNodes = collectNativeMessageNodes(D);
    if (!nativeNodes.length) {
      st.lastNativeNodeCount = 0;
      return;
    }
    if (removed > 0 || nativeNodes.length < st.lastNativeNodeCount) {
      applyNativeColdBoundary(null, st.baselineCount, {
        nodes: nativeNodes,
        startIdx: 0,
        endIdx: nativeNodes.length - 1,
      });
    } else {
      const startIdx = Math.max(0, st.lastNativeNodeCount);
      if (startIdx < nativeNodes.length) {
        applyNativeColdBoundary(null, st.baselineCount, {
          nodes: nativeNodes,
          startIdx,
          endIdx: nativeNodes.length - 1,
        });
      }
    }
    st.lastNativeNodeCount = nativeNodes.length;
    st.lastNativeTurnCount = collectNativeTurnNodes(D).length;
  }

  function scheduleHybridApply(chatIdRaw, reason = "scheduled") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return;
    state.hybridMutationReasonByChat.set(chatId, String(reason || "scheduled"));
    const schedule = H2O.runtime?.schedule || null;
    if (schedule) {
      try { schedule.cancel("archive:hybrid-apply"); } catch {}
      state.hybridApplyTimer = 0;
      state.hybridApplyTimer = schedule.timeoutOnce("archive:hybrid-apply", HYBRID_APPLY_DEBOUNCE_MS, () => {
        state.hybridApplyTimer = 0;
        const pending = String(state.hybridMutationReasonByChat.get(chatId) || reason || "scheduled");
        state.hybridMutationReasonByChat.delete(chatId);
        const nextReason = `debounced:${pending}`;
        if (isMutationAppendReason(nextReason)) {
          applyHybridIncremental(chatId, nextReason)
            .then((res) => {
              if (res?.ok) return;
              if (String(res?.reason || "").includes("need-full")) {
                applyHybrid(chatId, `mutation:full:${String(res?.reason || "fallback")}`).catch((e) => warn("applyHybrid full fallback failed", e));
              }
            })
            .catch((e) => warn("applyHybrid incremental scheduled failed", e));
          return;
        }
        applyHybrid(chatId, nextReason).catch((e) => warn("applyHybrid scheduled failed", e));
      });
      return;
    }
    if (state.hybridApplyTimer) {
      try { W.clearTimeout(state.hybridApplyTimer); } catch {}
      state.hybridApplyTimer = 0;
    }
    state.hybridApplyTimer = W.setTimeout(() => {
      state.hybridApplyTimer = 0;
      const pending = String(state.hybridMutationReasonByChat.get(chatId) || reason || "scheduled");
      state.hybridMutationReasonByChat.delete(chatId);
      const nextReason = `debounced:${pending}`;
      if (isMutationAppendReason(nextReason)) {
        applyHybridIncremental(chatId, nextReason)
          .then((res) => {
            if (res?.ok) return;
            if (String(res?.reason || "").includes("need-full")) {
              applyHybrid(chatId, `mutation:full:${String(res?.reason || "fallback")}`).catch((e) => warn("applyHybrid full fallback failed", e));
            }
          })
          .catch((e) => warn("applyHybrid incremental scheduled failed", e));
        return;
      }
      applyHybrid(chatId, nextReason).catch((e) => warn("applyHybrid scheduled failed", e));
    }, HYBRID_APPLY_DEBOUNCE_MS);
  }

  function clearHybridRetryTimer(st) {
    if (!st) return;
    const chatId = toChatId(st.chatId);
    const schedule = H2O.runtime?.schedule || null;
    if (chatId && schedule) {
      try { schedule.cancel(`archive:hybrid-retry:${chatId}`); } catch {}
    }
    if (st.retryTimer) {
      try { W.clearTimeout(st.retryTimer); } catch {}
    }
    st.retryTimer = 0;
  }

  function scheduleHybridRetry(chatIdRaw, reason = "stream-root-retry", delayMsRaw = 420) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return;
    const st = getHybridState(chatId);
    if (!st) return;
    clearHybridRetryTimer(st);
    const delayMs = Math.max(120, Math.floor(Number(delayMsRaw) || 420));
    const schedule = H2O.runtime?.schedule || null;
    if (schedule) {
      st.retryTimer = schedule.timeoutOnce(`archive:hybrid-retry:${chatId}`, delayMs, () => {
        st.retryTimer = 0;
        if (getViewMode(chatId) !== ARCH_VIEW_CACHE_FIRST) return;
        applyHybrid(chatId, String(reason || "stream-root-retry")).catch((e) => warn("hybrid retry failed", e));
      });
      return;
    }
    st.retryTimer = W.setTimeout(() => {
      st.retryTimer = 0;
      if (getViewMode(chatId) !== ARCH_VIEW_CACHE_FIRST) return;
      applyHybrid(chatId, String(reason || "stream-root-retry")).catch((e) => warn("hybrid retry failed", e));
    }, delayMs);
  }

  async function disableHybrid(chatIdRaw, reason = "manual") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const st = getHybridState(chatId);
    cleanupColdLayers(st?.coldLayer || null);
    clearHybridRetryTimer(st);
    disconnectColdOnlyObserver(st);
    state.hybridMutationReasonByChat.delete(chatId);
    state.hybridScrollHostFailCount.delete(chatId);
    disconnectHybridObserver(st);
    restoreDetachedNativeColdNodes(st);
    if (st?.detachedBinEl && st.detachedBinEl.isConnected) {
      try { st.detachedBinEl.remove(); } catch {}
    }
    if (st?.coldLayer && st.coldLayer.isConnected) {
      try { st.coldLayer.remove(); } catch {}
    }
    cleanupColdLayers(null);
    unhideNativeColdNodes(D);
    clearMiniMapColdMarkers();
    if (st) {
      st.enabled = false;
      st.root = null;
      st.coldOnly = false;
      st.scrollHost = null;
      st.coldLayer = null;
      st.coldOnlyObserver = null;
      st.coldOnlyObserverRoot = null;
      st.retryTimer = 0;
      st.snapshotId = "";
      st.baselineCount = 0;
      st.baselineTurns = 0;
      st.hotStart = 0;
      st.lastAppliedSnapshotId = "";
      st.lastAppliedBaselineCount = 0;
      st.lastAppliedHotStart = 0;
      st.lastNativeNodeCount = 0;
      st.lastNativeTurnCount = 0;
      st.mutationPending = false;
      st.detachMode = "none";
      st.detachedNodes = [];
      st.detachSpacerEl = null;
      st.detachAnchorEl = null;
      st.detachedBinEl = null;
      st.lastSpacerPx = 0;
      st.lastDetachedCount = 0;
      st.lastDetachNodeCount = 0;
    }
    emitArchiveEvent(EVT_ARCHIVE_HYBRID_STATE, {
      chatId,
      enabled: false,
      coldOnly: false,
      reason: String(reason || "manual"),
      hotStart: getLocalHotStart(chatId, 0),
    });
    await refreshDockState(chatId);
    return { ok: true, chatId, disabled: true };
  }

  async function applyHybridIncremental(chatIdRaw, reason = "mutation:append") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const st = getHybridState(chatId);
    if (st?.applying) return { ok: false, reason: "busy" };
    if (!st?.enabled || !st.root || !st.root.isConnected || !st.coldLayer || !st.coldLayer.isConnected) {
      return { ok: false, reason: "need-full:state-missing" };
    }
    if (getViewMode(chatId) !== ARCH_VIEW_CACHE_FIRST) {
      await disableHybrid(chatId, "view-not-cache");
      return { ok: false, reason: "view-not-cache" };
    }
    if (!st.snapshotId || !st.baselineCount) return { ok: false, reason: "need-full:baseline-missing" };
    if (st.lastAppliedSnapshotId !== st.snapshotId
      || st.lastAppliedBaselineCount !== st.baselineCount
      || st.lastAppliedHotStart !== st.hotStart) {
      return { ok: false, reason: "need-full:cached-boundary-changed" };
    }
    const nodes = collectNativeMessageNodes(st.root);
    if (nodes.length < st.lastNativeNodeCount) {
      return { ok: false, reason: "need-full:nodes-shrunk" };
    }
    const startIdx = Math.max(0, st.lastNativeNodeCount);
    if (st.detachMode === "detached") {
      for (let i = startIdx; i < nodes.length; i += 1) {
        try { nodes[i]?.classList?.remove?.("h2o-archive-native-cold-hidden"); } catch {}
      }
    } else if (startIdx < nodes.length) {
      applyNativeColdBoundary(st.root, st.hotStart, {
        nodes,
        startIdx,
        endIdx: nodes.length - 1,
      });
    }
    st.mutationPending = false;
    st.lastNativeNodeCount = nodes.length;
    st.lastNativeTurnCount = collectNativeTurnNodes(st.root).length;
    await resyncMiniMapColdMarkers(chatId, `incremental:${String(reason || "mutation:append")}`);
    emitArchiveEvent(EVT_ARCHIVE_HYBRID_STATE, {
      chatId,
      enabled: true,
      hotStart: st.hotStart,
      baselineCount: st.baselineCount,
      snapshotId: st.snapshotId,
      reason: String(reason || "mutation:append"),
      incremental: true,
    });
    await refreshDockState(chatId);
    return { ok: true, chatId, incremental: true, nodeCount: nodes.length };
  }

  async function applyHybridFull(chatId, reason, latest, stream, hotStart, baselineCount) {
    const st = getHybridState(chatId);
    if (!st) return { ok: false, reason: "missing-hybrid-state" };
    cleanupColdLayers(st?.coldLayer || null);
    clearHybridRetryTimer(st);
    disconnectColdOnlyObserver(st);
    const streamRoot = stream?.root || null;
    if (!streamRoot) return { ok: false, reason: "stream-root-missing" };
    const hostResolved = resolveColdMountTarget(streamRoot);
    if (!hostResolved?.host || !hostResolved?.mountRoot) {
      const failCount = Number(state.hybridScrollHostFailCount.get(chatId) || 0) + 1;
      state.hybridScrollHostFailCount.set(chatId, failCount);
      if (failCount >= 3) {
        setDockWarning(chatId, "Fast mode auto-disabled: scroll host lookup failed.");
        setLocalViewMode(chatId, ARCH_VIEW_REBUILD_FIRST);
        await disableHybrid(chatId, "scroll-host-failed");
        return { ok: false, reason: "scroll-host-failed", failCount };
      }
      if (failCount === 1) {
        setDockWarning(chatId, "Fast mode warning: scroll host unresolved, retrying.");
      }
      await refreshDockState(chatId);
      return { ok: false, reason: "scroll-host-wait", failCount };
    }
    state.hybridScrollHostFailCount.set(chatId, 0);

    if (st.root && st.root !== streamRoot) {
      restoreDetachedNativeColdNodes(st);
      unhideNativeColdNodes(st.root);
    }
    if (st.detachMode === "detached" && hotStart < st.lastAppliedHotStart) {
      restoreDetachedNativeColdNodes(st);
    }

    st.enabled = true;
    st.coldOnly = false;
    st.root = streamRoot;
    st.scrollHost = hostResolved.host;
    st.snapshotId = String(latest.snapshotId || "");
    st.baselineCount = baselineCount;
    st.baselineTurns = countAssistantTurns(latest.messages);
    st.hotStart = hotStart;
    unhideNativeColdNodes(D);
    st.coldLayer = ensureColdLayer(hostResolved.mountRoot, st);
    if (!st.coldLayer) {
      const failCount = Number(state.hybridScrollHostFailCount.get(chatId) || 0) + 1;
      state.hybridScrollHostFailCount.set(chatId, failCount);
      if (failCount >= 3) {
        setDockWarning(chatId, "Fast mode auto-disabled: cold layer mount failed.");
        setLocalViewMode(chatId, ARCH_VIEW_REBUILD_FIRST);
        await disableHybrid(chatId, "cold-layer-mount-failed");
        return { ok: false, reason: "cold-layer-mount-failed", failCount };
      }
      if (failCount === 1) setDockWarning(chatId, "Fast mode warning: cold layer mount retrying.");
      await refreshDockState(chatId);
      return { ok: false, reason: "cold-layer-mount-wait", failCount };
    }

    renderColdLayer(st.coldLayer, latest, hotStart);
    const nodesBeforeBoundary = collectNativeMessageNodes(streamRoot);
    const detachRes = detachNativeColdNodes(st, streamRoot, hotStart, nodesBeforeBoundary);
    if (!detachRes.ok || detachRes.mode !== "detached") {
      applyNativeColdBoundary(streamRoot, hotStart, {
        nodes: nodesBeforeBoundary,
        startIdx: 0,
        endIdx: nodesBeforeBoundary.length - 1,
      });
      st.lastNativeNodeCount = nodesBeforeBoundary.length;
      if (st.detachMode !== "hidden") st.detachMode = "none";
    } else {
      const nodesAfterDetach = collectNativeMessageNodes(streamRoot);
      for (const el of nodesAfterDetach) {
        try { el.classList.remove("h2o-archive-native-cold-hidden"); } catch {}
      }
      st.lastNativeNodeCount = nodesAfterDetach.length;
    }
    st.lastAppliedSnapshotId = st.snapshotId;
    st.lastAppliedBaselineCount = baselineCount;
    st.lastAppliedHotStart = hotStart;
    st.mutationPending = false;
    st.lastNativeTurnCount = collectNativeTurnNodes(streamRoot).length;

    ensureHybridObserver(chatId, st, streamRoot);
    await resyncMiniMapColdMarkers(chatId, `applyHybrid:${String(reason || "manual")}`);

    emitArchiveEvent(EVT_ARCHIVE_HOTSTART_CHANGED, {
      chatId,
      hotStart,
      baselineCount,
      snapshotId: st.snapshotId,
      reason: String(reason || "manual"),
    });
    emitArchiveEvent(EVT_ARCHIVE_HYBRID_STATE, {
      chatId,
      enabled: true,
      coldOnly: false,
      hotStart,
      baselineCount,
      snapshotId: st.snapshotId,
      strategy: stream?.strategy || "cached",
      detachMode: st.detachMode,
    });
    await refreshDockState(chatId);
    return { ok: true, chatId, hotStart, baselineCount, strategy: stream?.strategy || "cached", detachMode: st.detachMode };
  }

  async function applyHybridColdOnly(chatId, reason, latest, hotStart, baselineCount) {
    const st = getHybridState(chatId);
    if (!st) return { ok: false, reason: "missing-hybrid-state" };
    cleanupColdLayers(st?.coldLayer || null);
    clearHybridRetryTimer(st);
    const firstNativeMsg = collectNativeMessageNodes(D)[0] || null;
    const base = (st?.coldLayer?.parentElement && st.coldLayer.parentElement.isConnected)
      ? st.coldLayer.parentElement
      : (D.querySelector('[data-testid="conversation-turns"]')
        || D.querySelector('[data-testid^="conversation-turns"]')
        || D.querySelector("main")
        || firstNativeMsg?.parentElement
        || D.body
        || D.documentElement);
    const hostResolved = resolveColdMountTarget(base);
    if (!hostResolved?.host || !hostResolved?.mountRoot) {
      const failCount = Number(state.hybridScrollHostFailCount.get(chatId) || 0) + 1;
      state.hybridScrollHostFailCount.set(chatId, failCount);
      if (failCount === 1) {
        setDockWarning(chatId, "Fast mode archive-only warning: scroll host unresolved.");
      } else if (failCount >= 3) {
        setDockWarning(chatId, "Fast mode archive-only still waiting: scroll host unresolved.");
      }
      await refreshDockState(chatId);
      scheduleHybridRetry(chatId, "stream-root-retry:mount-wait", 600);
      return { ok: false, reason: "cold-only-mount-root-missing", failCount };
    }
    state.hybridScrollHostFailCount.set(chatId, 0);

    disconnectHybridObserver(st);
    disconnectColdOnlyObserver(st);
    restoreDetachedNativeColdNodes(st);
    if (st.root && st.root.isConnected) unhideNativeColdNodes(st.root);

    st.enabled = true;
    st.coldOnly = true;
    st.root = null;
    st.scrollHost = hostResolved.host;
    st.snapshotId = String(latest.snapshotId || "");
    st.baselineCount = baselineCount;
    st.baselineTurns = countAssistantTurns(latest.messages);
    st.hotStart = hotStart;
    st.coldLayer = ensureColdLayer(hostResolved.mountRoot, st);
    if (!st.coldLayer) {
      setDockWarning(chatId, "Fast mode archive-only waiting: layer mount not ready.");
      await refreshDockState(chatId);
      scheduleHybridRetry(chatId, "stream-root-retry:cold-layer", 600);
      return { ok: false, reason: "cold-only-layer-missing" };
    }

    renderColdLayer(st.coldLayer, latest, hotStart);
    unhideNativeColdNodes(D);
    const nativeNodes = collectNativeMessageNodes(D);
    if (nativeNodes.length > 0) {
      applyNativeColdBoundary(null, st.baselineCount, {
        nodes: nativeNodes,
        startIdx: 0,
        endIdx: nativeNodes.length - 1,
      });
    }
    const observerRoot = (st.scrollHost && st.scrollHost.isConnected)
      ? st.scrollHost
      : (D.body || D.documentElement || null);
    ensureColdOnlyObserver(chatId, st, observerRoot);
    st.lastAppliedSnapshotId = st.snapshotId;
    st.lastAppliedBaselineCount = baselineCount;
    st.lastAppliedHotStart = hotStart;
    st.lastNativeNodeCount = nativeNodes.length;
    st.lastNativeTurnCount = collectNativeTurnNodes(D).length;
    st.mutationPending = false;
    st.detachMode = "none";
    setDockWarning(chatId, "Fast mode archive-only: waiting for native stream root (MiniMap hot pending).");
    await resyncMiniMapColdMarkers(chatId, `cold-only:${String(reason || "manual")}`);
    emitArchiveEvent(EVT_ARCHIVE_HYBRID_STATE, {
      chatId,
      enabled: true,
      coldOnly: true,
      hotStart,
      baselineCount,
      snapshotId: st.snapshotId,
      reason: String(reason || "manual"),
      strategy: "cold-only",
    });
    await refreshDockState(chatId);
    scheduleHybridRetry(chatId, "stream-root-retry:cold-only", 480);
    return { ok: true, chatId, coldOnly: true, hotStart, baselineCount };
  }

  async function tryRecoverSnapshotForManualCacheFirst(chatId) {
    try {
      await captureNow(chatId);
    } catch (e) {
      warn("cache-first snapshot recovery failed", e);
    }
    try {
      const latest = await loadLatestSnapshotInternal(chatId);
      if (latest && Array.isArray(latest.messages) && latest.messages.length) return latest;
    } catch {}
    return null;
  }

  async function applyHybrid(chatIdRaw, reason = "manual", opts = null) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const pageMode = await getPageMode(chatId);
    const requestedStrategy = getLoadStrategy(chatId);
    if (pageMode !== MODE_LIVE_FIRST || requestedStrategy !== ARCH_VIEW_REBUILD_FIRST) {
      const liveOnlyReason = pageMode === MODE_LIVE_FIRST ? FALLBACK_REASON_LIVE_SINGLE_VIEW : FALLBACK_REASON_NONE;
      setDockWarning(chatId, pageMode === MODE_LIVE_FIRST
        ? "Live mode keeps one native transcript visible."
        : `${pageModeLabel(pageMode)} uses one archive surface.`);
      setPreviewStatus(chatId, {
        fallbackReason: liveOnlyReason,
        activeSource: pageMode === MODE_LIVE_FIRST ? ACTIVE_SOURCE_NATIVE : ACTIVE_SOURCE_ARCHIVE,
        message: pageMode === MODE_LIVE_FIRST
          ? "Live mode keeps one native transcript visible."
          : `${pageModeLabel(pageMode)} uses one archive surface.`,
      });
      await disableHybrid(chatId, `single-transcript:${pageMode}:${String(reason || "manual")}`);
      return { ok: false, reason: pageMode === MODE_LIVE_FIRST ? FALLBACK_REASON_LIVE_SINGLE_VIEW : `page-mode:${pageMode}` };
    }
    const st = getHybridState(chatId);
    if (!st || st.applying) return { ok: false, reason: "busy" };
    if (isMutationAppendReason(reason)) {
      const inc = await applyHybridIncremental(chatId, reason);
      if (inc?.ok) return inc;
      if (!String(inc?.reason || "").includes("need-full")) return inc;
    }
    st.applying = true;
    try {
      if (getViewMode(chatId) !== ARCH_VIEW_CACHE_FIRST) {
        return disableHybrid(chatId, "view-not-cache");
      }
      const allowSnapshotRecovery = String(reason || "") === "set-view-mode" && opts?.userInitiated === true;
      let latest = await loadLatestSnapshotInternal(chatId);
      if ((!latest || !Array.isArray(latest.messages) || !latest.messages.length) && allowSnapshotRecovery) {
        latest = await tryRecoverSnapshotForManualCacheFirst(chatId);
      }
      if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
        setDockWarning(chatId, "Fast mode disabled: snapshot missing.");
        setLocalViewMode(chatId, ARCH_VIEW_REBUILD_FIRST);
        delLocalHotStart(chatId);
        await disableHybrid(chatId, "snapshot-missing");
        return { ok: false, reason: "snapshot-missing" };
      }

      const baselineCount = latest.messages.length;
      setLocalBaseline(chatId, {
        snapshotId: String(latest.snapshotId || ""),
        baselineCount,
        capturedAt: String(latest.createdAt || nowIso()),
      });

      const rawHot = lsGetStr(keyHotStart(chatId), null);
      const hotStart = (rawHot == null)
        ? baselineCount
        : Math.max(0, Math.min(baselineCount, normalizeHotStart(rawHot, baselineCount)));
      setLocalHotStart(chatId, hotStart);

      const cachedRootUsable = !!(st.root && st.root.isConnected && collectNativeMessageNodes(st.root).length > 0);
      const stream = cachedRootUsable ? { root: st.root, strategy: "cached" } : resolveStreamRoot();
      if (!stream.root) {
        const failCount = Number(state.hybridStreamFailCount.get(chatId) || 0) + 1;
        state.hybridStreamFailCount.set(chatId, failCount);
        return applyHybridColdOnly(chatId, reason, latest, hotStart, baselineCount);
      }
      state.hybridStreamFailCount.set(chatId, 0);
      setDockWarning(chatId, "");

      if (!isExplicitFullReason(reason)
        && st.enabled
        && st.root === stream.root
        && st.coldLayer
        && st.coldLayer.isConnected
        && st.lastAppliedSnapshotId === String(latest.snapshotId || "")
        && st.lastAppliedBaselineCount === baselineCount
        && st.lastAppliedHotStart === hotStart) {
        const inc = await applyHybridIncremental(chatId, `noop:${String(reason || "manual")}`);
        if (inc?.ok) return inc;
      }
      return applyHybridFull(chatId, reason, latest, stream, hotStart, baselineCount);
    } finally {
      st.applying = false;
    }
  }

  async function afterSnapshotCaptured(chatIdRaw, snapshot, reason = "capture") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const snap = canonicalSnapshot(snapshot);
    if (!chatId || !snap) return { ok: false, reason: "missing-capture-state" };
    const baselineCount = Array.isArray(snap.messages) ? snap.messages.length : 0;
    setLocalBaseline(chatId, {
      snapshotId: String(snap.snapshotId || ""),
      baselineCount,
      capturedAt: String(snap.createdAt || nowIso()),
    });
    setLocalHotStart(chatId, baselineCount);
    emitArchiveEvent(EVT_ARCHIVE_HOTSTART_CHANGED, {
      chatId,
      hotStart: baselineCount,
      baselineCount,
      snapshotId: String(snap.snapshotId || ""),
      reason: String(reason || "capture"),
    });
    await applyBootMode(chatId, `${String(reason || "capture")}:post-capture`);
    await refreshDockState(chatId);
    return { ok: true, chatId, baselineCount };
  }

  async function rehydrateFromIndex(chatIdRaw, idxRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const latest = await loadLatestSnapshotInternal(chatId);
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      setDockWarning(chatId, "Rehydrate failed: snapshot missing.");
      await refreshDockState(chatId);
      return { ok: false, reason: "snapshot-missing" };
    }
    const baselineCount = latest.messages.length;
    const kind = String(opts?.kind || "message").trim().toLowerCase();
    const requestedAnswerIndex = (kind === "answer") ? Math.max(1, normalizeHotStart(idxRaw, 0)) : Math.max(0, normalizeHotStart(opts?.answerIndex, 0));
    let hotStart = normalizeHotStart(idxRaw, 0);
    if (kind === "answer") {
      hotStart = messageIndexForAnswer(latest.messages, hotStart);
    }
    hotStart = Math.max(0, Math.min(baselineCount, hotStart));
    setLocalLoadStrategy(chatId, ARCH_VIEW_CACHE_FIRST);
    setLocalBootMode(chatId, MODE_ARCHIVE_FIRST);
    setLocalHotStart(chatId, hotStart);
    setLocalBaseline(chatId, {
      snapshotId: String(latest.snapshotId || ""),
      baselineCount,
      capturedAt: String(latest.createdAt || nowIso()),
    });
    emitArchiveEvent(EVT_ARCHIVE_HOTSTART_CHANGED, {
      chatId,
      hotStart,
      baselineCount,
      snapshotId: String(latest.snapshotId || ""),
      source: String(opts?.source || "rehydrate"),
    });
    setDockStatusText(chatId, requestedAnswerIndex > 0 ? `Archive Preview opened at answer ${requestedAnswerIndex}` : "Archive Preview opened");
    await applyBootMode(chatId, "rehydrate");
    await refreshDockState(chatId);
    return { ok: true, chatId, hotStart, baselineCount };
  }

  function scrollToCold(chatIdRaw, msgIdxRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const rawIdx = Number(msgIdxRaw);
    const msgIdx = Number.isFinite(rawIdx) ? Math.floor(rawIdx) : -1;
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    if (msgIdx < 0) return { ok: false, reason: "cold-index-invalid", chatId, msgIdx };
    const st = getHybridState(chatId);
    const byLayer = st?.coldLayer?.querySelector?.(`[data-h2o-cold-idx="${msgIdx}"]`) || null;
    const target = byLayer || D.querySelector(`[data-h2o-cold-idx="${msgIdx}"]`);
    if (!target) return { ok: false, reason: "cold-target-missing", chatId, msgIdx, answerIndex: Number(opts?.answerIndex || 0) };
    try {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      const host = (st?.scrollHost && st.scrollHost.isConnected) ? st.scrollHost : resolveScrollHost(st?.root || target);
      if (!isVisibleInHost(target, host)) {
        const tr = target.getBoundingClientRect();
        const isPageHost = host === D.scrollingElement || host === D.documentElement || host === D.body;
        if (isPageHost) {
          const vh = W.innerHeight || D.documentElement?.clientHeight || 0;
          const dy = (tr.top + (tr.height / 2)) - (vh / 2);
          W.scrollBy({ top: dy, behavior: "smooth" });
        } else if (host && typeof host.scrollTop === "number") {
          const hr = host.getBoundingClientRect();
          const dy = (tr.top + (tr.height / 2)) - (hr.top + (hr.height / 2));
          host.scrollTo({ top: host.scrollTop + dy, behavior: "smooth" });
        }
      }
      return { ok: true, reason: "cold-target-scrolled", chatId, msgIdx };
    } catch (e) {
      warn("scrollToCold failed", e);
      return { ok: false, reason: "cold-scroll-failed", chatId, msgIdx };
    }
  }

  function scrollToNativeTarget(chatIdRaw, answerIndexRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const answerIndex = Math.max(1, Math.floor(Number(answerIndexRaw) || 0));
    if (!chatId || answerIndex < 1) return { ok: false, reason: "missing-target" };
    const st = getHybridState(chatId);
    const root = (st?.root && st.root.isConnected) ? st.root : (resolveStreamRoot()?.root || null);
    if (!root) return { ok: false, reason: "stream-root-missing" };
    const assistants = collectNativeMessageNodes(root).filter((el) => String(el?.getAttribute?.(ATTR_MESSAGE_AUTHOR_ROLE) || "").toLowerCase() === "assistant");
    const target = assistants[answerIndex - 1] || null;
    if (!target) return { ok: false, reason: "native-target-missing", answerIndex, nodeCount: assistants.length };
    try {
      target.scrollIntoView({ block: String(opts?.block || "center"), behavior: String(opts?.behavior || "smooth") });
      return { ok: true, reason: "native-target-scrolled", answerIndex };
    } catch (e) {
      warn("scrollToNativeTarget failed", e);
      return { ok: false, reason: "native-scroll-failed", answerIndex };
    }
  }

  async function retryScrollToNative(chatIdRaw, answerIndexRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    const answerIndex = Math.max(1, Math.floor(Number(answerIndexRaw) || 0));
    const attempts = Math.max(1, Math.floor(Number(opts?.attempts) || 6));
    const delayMs = Math.max(20, Math.floor(Number(opts?.delayMs) || 120));
    for (let i = 0; i < attempts; i += 1) {
      const res = scrollToNativeTarget(chatId, answerIndex, opts);
      if (res?.ok) return { ok: true, attempts: i + 1 };
      await new Promise((resolve) => W.setTimeout(resolve, delayMs));
    }
    return { ok: false, reason: "native-target-timeout", attempts };
  }

  async function scrollToColdWithFallback(chatIdRaw, msgIdxRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const answerIndex = Math.max(1, normalizeHotStart(opts?.answerIndex, 0));
    let res = scrollToCold(chatId, msgIdxRaw, { ...opts, answerIndex });
    if (res?.ok) return res;

    let latest = state.latestByChat.get(chatId) || null;
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      try {
        latest = await loadLatestSnapshotInternal(chatId);
      } catch (e) {
        warn("scrollToCold snapshot load failed", e);
        latest = null;
      }
    }
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      setDockWarning(chatId, "Cold scroll fallback unavailable: snapshot missing. Opened reader.");
      await refreshDockState(chatId);
      try {
        await openReader(chatId);
      } catch (e) {
        warn("openReader fallback failed", e);
      }
      return { ok: false, reason: "snapshot-missing", chatId };
    }

    const computedMsgIdx = Math.max(0, messageIndexForAnswer(latest.messages, answerIndex));
    res = scrollToCold(chatId, computedMsgIdx, { ...opts, answerIndex });
    if (res?.ok) return { ...res, computedMsgIdx };

    await resyncMiniMapColdMarkers(chatId, "scroll-cold-computed-retry");
    res = scrollToCold(chatId, computedMsgIdx, { ...opts, answerIndex });
    if (res?.ok) return { ...res, computedMsgIdx, retried: true };

    setDockWarning(chatId, "Cold target not mounted yet; retry in a moment.");
    await refreshDockState(chatId);
    return { ok: false, reason: "cold-target-missing-after-compute", chatId, computedMsgIdx };
  }

  function mountStyles() {
    if (state.stylesMounted) return;
    state.stylesMounted = true;
    const style = D.createElement("style");
    style.id = "h2o-archive-boot-style";
style.textContent = `
.h2o-archive-native-cold-hidden{display:none !important}
.h2o-archive-native-turn-hidden{display:none !important}
.h2o-archive-native-cold-spacer{display:block;pointer-events:none;width:100%}
.h2o-cold-layer{position:relative;display:grid;gap:10px;margin:0 0 6px 0}
.h2o-cold-msg{position:relative;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px 12px;white-space:pre-wrap;pointer-events:none;user-select:none;background-color:rgba(160,160,160,.06);background-image:repeating-linear-gradient(-45deg, rgba(190,190,190,.16) 0 2px, rgba(120,120,120,.08) 2px 8px)}
.h2o-cold-msg::before{content:"❄";position:absolute;left:8px;top:6px;font-size:10px;opacity:.65}
.h2o-cold-msg .h2o-cold-role{font-size:11px;opacity:.74;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em}
.h2o-cold-msg .h2o-cold-text{line-height:1.38}
.h2o-cold-msg.user{border-color:rgba(96,165,250,.28)}
.h2o-cold-msg.assistant{border-color:rgba(148,163,184,.22)}
.h2o-cold-msg.h2o-cold-rich-wrap{padding:0;border:0;background:none}
.h2o-cold-msg.h2o-cold-rich-wrap::before{display:none}
.h2o-cold-rich-turn,.h2o-cold-frozen{pointer-events:none !important;user-select:none !important}

[data-cgxui="mnmp-btn"].h2o-mm-cold,
[data-cgxui="mm-btn"].h2o-mm-cold,
.cgxui-mm-btn.h2o-mm-cold{
  background-image:repeating-linear-gradient(-45deg, rgba(148,163,184,.22) 0 2px, rgba(100,116,139,.08) 2px 8px) !important;
}
[data-cgxui="mnmp-btn"].h2o-mm-pending,
[data-cgxui="mm-btn"].h2o-mm-pending,
.cgxui-mm-btn.h2o-mm-pending{
  outline:1px dashed rgba(148,163,184,.6) !important;
  outline-offset:-1px;
  opacity:.9;
}

.h2o-archive-reader{position:fixed;inset:0;z-index:2147483632;background:rgba(7,9,13,.8);backdrop-filter:blur(4px);display:none}
.h2o-archive-reader.open{display:block}
.h2o-archive-reader .panel{position:absolute;inset:18px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#0f131b;color:#e7edf8;display:flex;flex-direction:column;overflow:hidden}
.h2o-archive-reader .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.09)}
.h2o-archive-reader .title{font-weight:650;font-size:13px;flex:1}
.h2o-archive-reader .head input,.h2o-archive-reader .head select,.h2o-archive-reader .head button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#e7edf8;border-radius:8px;padding:6px 8px;font:12px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.h2o-archive-reader .err{display:none;background:rgba(127,29,29,.85);color:#fecaca;padding:7px 12px;font-size:12px}
.h2o-archive-reader .err.show{display:block}
.h2o-archive-reader .snapshots{display:flex;gap:6px;overflow:auto;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.07)}
.h2o-archive-reader .snap{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);border-radius:8px;padding:6px 8px;min-width:190px;max-width:280px}
.h2o-archive-reader .snap.active{border-color:#7dd3fc;background:rgba(125,211,252,.12)}
.h2o-archive-reader .snap .meta{font-size:11px;opacity:.8;margin-bottom:5px}
.h2o-archive-reader .snap .actions{display:flex;gap:6px}
.h2o-archive-reader .snap .actions button{flex:1;padding:4px 6px;font-size:11px}
.h2o-archive-reader .count{padding:8px 12px;font-size:12px;opacity:.8;border-bottom:1px solid rgba(255,255,255,.07)}
.h2o-archive-reader .body{overflow:auto;padding:12px;display:grid;gap:10px}
.h2o-archive-reader .msg{border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 12px;white-space:pre-wrap}
.h2o-archive-reader .msg.user{background:rgba(59,130,246,.08)}
.h2o-archive-reader .msg.assistant{background:rgba(255,255,255,.04)}
.h2o-archive-reader .msg .role{font-size:11px;opacity:.74;margin-bottom:6px}
.h2o-archive-reader .empty{padding:14px;border:1px dashed rgba(255,255,255,.22);border-radius:10px;opacity:.86}

html[data-h2o-archive-page-open="1"]{
  overflow:hidden !important;
}
.h2o-archive-page{position:fixed;inset:0;z-index:2147483630;background:#0b1016;color:#e7edf8;display:none}
.h2o-archive-page.open{display:block}
.h2o-archive-page .shell{position:absolute;inset:0;display:flex;flex-direction:column;background:
  radial-gradient(circle at top left, rgba(56,189,248,.14), transparent 38%),
  radial-gradient(circle at top right, rgba(96,165,250,.1), transparent 32%),
  linear-gradient(180deg, rgba(9,13,19,.98), rgba(8,11,17,.98))}
.h2o-archive-page .head{padding:16px 18px 12px;border-bottom:1px solid rgba(255,255,255,.08);display:grid;gap:10px}
.h2o-archive-page .meta{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
.h2o-archive-page .kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.66}
.h2o-archive-page .title{font-size:24px;line-height:1.15;font-weight:720}
.h2o-archive-page .subtitle{font-size:13px;line-height:1.45;max-width:860px;opacity:.82}
.h2o-archive-page .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.h2o-archive-page .toolbar input,.h2o-archive-page .toolbar button{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e7edf8;border-radius:999px;padding:7px 11px;font:12px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.h2o-archive-page .toolbar button.primary{background:linear-gradient(180deg, rgba(125,211,252,.22), rgba(56,189,248,.18));border-color:rgba(125,211,252,.42)}
.h2o-archive-page .badges{display:flex;gap:7px;flex-wrap:wrap}
.h2o-archive-page .badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);font-size:11px;line-height:1.2;opacity:.92}
.h2o-archive-page .badge.warn{border-color:rgba(251,191,36,.42);background:rgba(245,158,11,.14);color:#fde68a}
.h2o-archive-page .badge.good{border-color:rgba(134,239,172,.42);background:rgba(34,197,94,.14);color:#dcfce7}
.h2o-archive-page .err{display:none;background:rgba(127,29,29,.82);color:#fecaca;padding:8px 18px;font-size:12px}
.h2o-archive-page .err.show{display:block}
.h2o-archive-page .layout{min-height:0;flex:1;display:grid;grid-template-columns:minmax(250px, 320px) minmax(0,1fr)}
.h2o-archive-page .rail{border-right:1px solid rgba(255,255,255,.08);padding:14px;display:grid;grid-auto-rows:max-content;gap:10px;overflow:auto;background:rgba(255,255,255,.025)}
.h2o-archive-page .railTitle{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.62}
.h2o-archive-page .snapshots{display:grid;gap:8px}
.h2o-archive-page .snap{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:12px;padding:10px;display:grid;gap:8px}
.h2o-archive-page .snap.active{border-color:#7dd3fc;background:rgba(125,211,252,.12)}
.h2o-archive-page .snap .meta{font-size:11px;opacity:.82}
.h2o-archive-page .snap .actions{display:flex;gap:6px;flex-wrap:wrap}
.h2o-archive-page .snap .actions button{flex:1 1 0;padding:5px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#e7edf8;font-size:11px}
.h2o-archive-page .main{min-width:0;display:grid;grid-template-rows:auto auto minmax(0,1fr)}
.h2o-archive-page .count{padding:12px 16px 8px;font-size:12px;opacity:.78}
.h2o-archive-page .body{overflow:auto;padding:8px 16px 20px;display:grid;gap:12px}
.h2o-archive-page .msg{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px 14px;white-space:pre-wrap;line-height:1.5}
.h2o-archive-page .msg.user{background:rgba(59,130,246,.08)}
.h2o-archive-page .msg.assistant{background:rgba(255,255,255,.04)}
.h2o-archive-page .msg .role{font-size:11px;opacity:.72;margin-bottom:7px;text-transform:uppercase;letter-spacing:.06em}
.h2o-archive-page .empty{margin:14px 16px 20px;padding:16px;border:1px dashed rgba(255,255,255,.18);border-radius:16px;background:rgba(255,255,255,.03);display:grid;gap:10px}
.h2o-archive-page .emptyActions{display:flex;gap:8px;flex-wrap:wrap}
@media (max-width: 920px){
  .h2o-archive-page .layout{grid-template-columns:1fr}
  .h2o-archive-page .rail{border-right:0;border-bottom:1px solid rgba(255,255,255,.08)}
  .h2o-archive-page .title{font-size:20px}
}

.h2o-archive-saved{position:fixed;inset:0;z-index:2147483631;background:rgba(7,9,13,.78);backdrop-filter:blur(4px);display:none}
.h2o-archive-saved.open{display:block}
.h2o-archive-saved .panel{position:absolute;inset:18px;border:1px solid rgba(255,255,255,.14);border-radius:14px;background:#0f131b;color:#e7edf8;display:flex;flex-direction:column;overflow:hidden}
.h2o-archive-saved .head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.09)}
.h2o-archive-saved .title{font-weight:650;font-size:13px;flex:1}
.h2o-archive-saved .head input,.h2o-archive-saved .head select,.h2o-archive-saved .head button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#e7edf8;border-radius:8px;padding:6px 8px;font:12px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
.h2o-archive-saved .note{display:none;padding:8px 12px;font-size:12px;border-bottom:1px solid rgba(255,255,255,.07)}
.h2o-archive-saved .note.show{display:block}
.h2o-archive-saved .note.warn{background:rgba(120,53,15,.46);color:#ffdeb5}
.h2o-archive-saved .note.info{background:rgba(30,64,175,.24);color:#dbeafe}
.h2o-archive-saved .list{overflow:auto;padding:8px 12px;display:grid;gap:8px}
.h2o-archive-saved .item{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.04);cursor:pointer}
.h2o-archive-saved .item:hover{border-color:rgba(125,211,252,.42);background:rgba(125,211,252,.08)}
.h2o-archive-saved .item.active{border-color:#7dd3fc;background:rgba(125,211,252,.12)}
.h2o-archive-saved .itemTitle{font-weight:650;line-height:1.3}
.h2o-archive-saved .itemMeta{margin-top:5px;font-size:11px;opacity:.82;display:flex;gap:8px;flex-wrap:wrap}
.h2o-archive-saved .itemBadges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.h2o-archive-saved .itemBadge{display:inline-flex;align-items:center;padding:2px 7px;border:1px solid rgba(255,255,255,.14);border-radius:999px;font-size:10px;background:rgba(255,255,255,.05)}
.h2o-archive-saved .itemExcerpt{margin-top:8px;font-size:12px;line-height:1.45;opacity:.88}
.h2o-archive-saved .empty{padding:14px;border:1px dashed rgba(255,255,255,.22);border-radius:10px;opacity:.86}
`;
    (D.head || D.documentElement || D.body).appendChild(style);
  }

  function showReaderError(message) {
    const el = state.reader.error;
    if (!el) return;
    const msg = String(message || "").trim();
    if (!msg) {
      el.classList.remove("show");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.add("show");
  }

  function renderReaderMessages() {
    const body = state.reader.body;
    if (!body) return;
    const snap = state.reader.currentSnapshot;
    const query = String(state.reader.search?.value || "").trim().toLowerCase();
    body.textContent = "";
    if (!snap || !Array.isArray(snap.messages) || snap.messages.length === 0) {
      const empty = D.createElement("div");
      empty.className = "empty";
      empty.innerHTML = "No snapshot available for this chat.";
      const btn = D.createElement("button");
      btn.type = "button";
      btn.textContent = "Capture Now";
      btn.style.marginTop = "10px";
      btn.addEventListener("click", async () => {
        try {
          const res = await captureNow(state.reader.chatId || getCurrentChatId());
          if (res?.storage === "legacy" && res?.message) showReaderError(String(res.message));
          await openReader(state.reader.chatId || getCurrentChatId());
        } catch (e) {
          showReaderError(String(e && (e.message || e)));
        }
      });
      empty.appendChild(btn);
      body.appendChild(empty);
      if (state.reader.count) state.reader.count.textContent = "0 messages";
      return;
    }

    const rows = snap.messages.filter((m) => {
      if (!query) return true;
      return String(m.text || "").toLowerCase().includes(query);
    });

    for (const m of rows) {
      const wrap = D.createElement("article");
      wrap.className = `msg ${m.role === "user" ? "user" : "assistant"}`;
      const role = D.createElement("div");
      role.className = "role";
      role.textContent = m.role;
      const text = D.createElement("div");
      text.textContent = String(m.text || "");
      wrap.append(role, text);
      body.appendChild(wrap);
    }
    if (state.reader.count) {
      const total = snap.messages.length;
      state.reader.count.textContent = query ? `${rows.length}/${total} messages` : `${total} messages`;
    }
  }

  function snapshotLabel(row) {
    const createdAt = String(row?.createdAt || "");
    const dt = createdAt ? new Date(createdAt) : null;
    const ts = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString("en-US") : createdAt || "unknown";
    const count = Number(row?.messageCount || 0);
    return `${ts} · ${count} msg`;
  }

  function renderReaderSnapshotList() {
    const listEl = state.reader.list;
    if (!listEl) return;
    listEl.textContent = "";
    const rows = Array.isArray(state.reader.snapshots) ? state.reader.snapshots : [];
    if (!rows.length) return;
    for (const row of rows) {
      const sid = String(row?.snapshotId || "");
      if (!sid) continue;
      const card = D.createElement("div");
      card.className = "snap";
      if (state.reader.currentSnapshot?.snapshotId === sid) card.classList.add("active");
      const meta = D.createElement("div");
      meta.className = "meta";
      meta.textContent = snapshotLabel(row);

      const actions = D.createElement("div");
      actions.className = "actions";
      const openBtn = D.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", async () => {
        try {
          showReaderError("");
          const snap = await loadSnapshot(sid);
          state.reader.currentSnapshot = canonicalSnapshot(snap);
          renderReaderSnapshotList();
          renderReaderMessages();
        } catch (e) {
          showReaderError(String(e && (e.message || e)));
        }
      });

      const pinBtn = D.createElement("button");
      pinBtn.type = "button";
      pinBtn.textContent = row?.pinned ? "Unpin" : "Pin";
      pinBtn.addEventListener("click", async () => {
        try {
          await pinSnapshot(sid, !row?.pinned);
          state.reader.snapshots = await listSnapshots(state.reader.chatId || getCurrentChatId());
          renderReaderSnapshotList();
        } catch (e) {
          showReaderError(String(e && (e.message || e)));
        }
      });

      const delBtn = D.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        try {
          await deleteSnapshot(sid);
          state.reader.snapshots = await listSnapshots(state.reader.chatId || getCurrentChatId());
          if (state.reader.currentSnapshot?.snapshotId === sid) {
            state.reader.currentSnapshot = null;
          }
          renderReaderSnapshotList();
          renderReaderMessages();
        } catch (e) {
          showReaderError(String(e && (e.message || e)));
        }
      });
      actions.append(openBtn, pinBtn, delBtn);
      card.append(meta, actions);
      listEl.appendChild(card);
    }
  }

  function ensureReaderUi() {
    if (state.reader.root) return state.reader.root;
    const root = D.createElement("div");
    root.className = "h2o-archive-reader";
    root.innerHTML = `
<div class="panel">
  <div class="head">
    <div class="title">Archive Reader</div>
    <select class="readerMode">
      <option value="${MODE_LIVE_FIRST}">Live</option>
      <option value="${MODE_ARCHIVE_FIRST}">Archive Preview</option>
      <option value="${MODE_ARCHIVE_ONLY}">Archive Only</option>
    </select>
    <input class="search" type="search" placeholder="Search messages">
    <button type="button" class="readerCapture">Capture Snapshot</button>
    <button type="button" class="close">Close</button>
  </div>
  <div class="err"></div>
  <div class="snapshots"></div>
  <div class="count"></div>
  <div class="body"></div>
</div>`;
    D.documentElement.appendChild(root);

    state.reader.root = root;
    state.reader.title = root.querySelector(".title");
    state.reader.error = root.querySelector(".err");
    state.reader.search = root.querySelector(".search");
    state.reader.list = root.querySelector(".snapshots");
    state.reader.body = root.querySelector(".body");
    state.reader.count = root.querySelector(".count");
    state.reader.modeSelect = root.querySelector(".readerMode");

    const closeBtn = root.querySelector(".close");
    const captureBtn = root.querySelector(".readerCapture");
    closeBtn?.addEventListener("click", () => root.classList.remove("open"));
    captureBtn?.addEventListener("click", async () => {
      try {
        showReaderError("");
        const res = await captureNow(state.reader.chatId || getCurrentChatId());
        if (res?.storage === "legacy" && res?.message) showReaderError(String(res.message));
        await openReader(state.reader.chatId || getCurrentChatId());
      } catch (e) {
        showReaderError(String(e && (e.message || e)));
      }
    });
    state.reader.search?.addEventListener("input", () => renderReaderMessages());
    state.reader.modeSelect?.addEventListener("change", async () => {
      try {
        const chatId = state.reader.chatId || getCurrentChatId();
        await setMode(chatId, state.reader.modeSelect?.value || MODE_LIVE_FIRST);
      } catch (e) {
        showReaderError(String(e && (e.message || e)));
      }
    });
    return root;
  }

  async function openReader(chatIdRaw, snapshotIdRaw = "") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const preferredSnapshotId = String(snapshotIdRaw || "").trim();
    const root = ensureReaderUi();
    state.reader.chatId = chatId;
    if (state.reader.title) state.reader.title.textContent = `Archive Reader · ${chatId}`;
    if (state.reader.modeSelect) state.reader.modeSelect.value = await getMode(chatId);
    showReaderError("");

    state.reader.snapshots = await listSnapshots(chatId);
    state.reader.currentSnapshot = null;
    if (preferredSnapshotId) {
      try {
        state.reader.currentSnapshot = canonicalSnapshot(await loadSnapshot(preferredSnapshotId));
      } catch {}
    }
    if (!state.reader.currentSnapshot && state.reader.snapshots.length) {
      const firstId = String(state.reader.snapshots[0]?.snapshotId || "");
      state.reader.currentSnapshot = firstId ? canonicalSnapshot(await loadSnapshot(firstId)) : null;
    }
    if (!state.reader.currentSnapshot) {
      state.reader.currentSnapshot = await loadLatestSnapshotInternal(chatId);
    }
    renderReaderSnapshotList();
    renderReaderMessages();
    root.classList.add("open");
    return {
      ok: true,
      chatId,
      snapshotId: String(state.reader.currentSnapshot?.snapshotId || preferredSnapshotId || ""),
      snapshotCount: state.reader.snapshots.length,
    };
  }

  function showArchivePageError(message) {
    const el = state.page.error;
    if (!el) return;
    const msg = String(message || "").trim();
    if (!msg) {
      el.classList.remove("show");
      el.textContent = "";
      return;
    }
    el.textContent = msg;
    el.classList.add("show");
  }

  function renderArchivePageMessages() {
    const body = state.page.body;
    if (!body) return;
    const snap = state.page.currentSnapshot;
    const query = String(state.page.search?.value || "").trim().toLowerCase();
    body.textContent = "";
    if (!snap || !Array.isArray(snap.messages) || snap.messages.length === 0) {
      const empty = D.createElement("div");
      empty.className = "empty";
      const title = D.createElement("div");
      title.textContent = "No snapshot is ready for this page mode yet.";
      const summary = D.createElement("div");
      summary.textContent = "Archive Preview and Archive Only stay single-view, so they wait for archive data instead of mixing with the native transcript.";
      const actions = D.createElement("div");
      actions.className = "emptyActions";
      const captureBtn = D.createElement("button");
      captureBtn.type = "button";
      captureBtn.className = "primary";
      captureBtn.textContent = "Capture Snapshot Now";
      captureBtn.addEventListener("click", async () => {
        try {
          const res = await captureNow(state.page.chatId || getCurrentChatId());
          if (res?.storage === "legacy" && res?.message) showArchivePageError(String(res.message));
          await openArchivePageSurface(state.page.chatId || getCurrentChatId(), { mode: state.page.mode, reason: "capture:page-empty" });
        } catch (e) {
          showArchivePageError(String(e && (e.message || e)));
        }
      });
      const liveBtn = D.createElement("button");
      liveBtn.type = "button";
      liveBtn.textContent = "Open Live";
      liveBtn.addEventListener("click", () => {
        void setPageMode(state.page.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
      });
      actions.append(captureBtn, liveBtn);
      empty.append(title, summary, actions);
      body.appendChild(empty);
      if (state.page.count) state.page.count.textContent = "0 messages";
      return;
    }

    const rows = snap.messages.filter((m) => {
      if (!query) return true;
      return String(m.text || "").toLowerCase().includes(query);
    });

    for (const m of rows) {
      const wrap = D.createElement("article");
      wrap.className = `msg ${m.role === "user" ? "user" : "assistant"}`;
      const role = D.createElement("div");
      role.className = "role";
      role.textContent = m.role;
      const text = D.createElement("div");
      text.textContent = String(m.text || "");
      wrap.append(role, text);
      body.appendChild(wrap);
    }
    if (state.page.count) {
      const total = snap.messages.length;
      state.page.count.textContent = query ? `${rows.length}/${total} messages` : `${total} messages`;
    }
  }

  function renderArchivePageSnapshotList() {
    const listEl = state.page.list;
    if (!listEl) return;
    listEl.textContent = "";
    const rows = Array.isArray(state.page.snapshots) ? state.page.snapshots : [];
    if (!rows.length) {
      const empty = D.createElement("div");
      empty.className = "snap";
      empty.innerHTML = `<div class="meta">No snapshots saved for this chat.</div>`;
      listEl.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const sid = String(row?.snapshotId || "");
      if (!sid) continue;
      const card = D.createElement("div");
      card.className = "snap";
      if (state.page.currentSnapshot?.snapshotId === sid) card.classList.add("active");
      const meta = D.createElement("div");
      meta.className = "meta";
      meta.textContent = snapshotLabel(row);

      const actions = D.createElement("div");
      actions.className = "actions";
      const openBtn = D.createElement("button");
      openBtn.type = "button";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", async () => {
        try {
          showArchivePageError("");
          const snap = await loadSnapshot(sid);
          state.page.currentSnapshot = canonicalSnapshot(snap);
          renderArchivePageSnapshotList();
          renderArchivePageMessages();
        } catch (e) {
          showArchivePageError(String(e && (e.message || e)));
        }
      });
      const pinBtn = D.createElement("button");
      pinBtn.type = "button";
      pinBtn.textContent = row?.pinned ? "Unpin" : "Pin";
      pinBtn.addEventListener("click", async () => {
        try {
          await pinSnapshot(sid, !row?.pinned);
          state.page.snapshots = await listSnapshots(state.page.chatId || getCurrentChatId());
          renderArchivePageSnapshotList();
        } catch (e) {
          showArchivePageError(String(e && (e.message || e)));
        }
      });
      const delBtn = D.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", async () => {
        try {
          await deleteSnapshot(sid);
          state.page.snapshots = await listSnapshots(state.page.chatId || getCurrentChatId());
          if (state.page.currentSnapshot?.snapshotId === sid) state.page.currentSnapshot = null;
          renderArchivePageSnapshotList();
          renderArchivePageMessages();
        } catch (e) {
          showArchivePageError(String(e && (e.message || e)));
        }
      });
      actions.append(openBtn, pinBtn, delBtn);
      card.append(meta, actions);
      listEl.appendChild(card);
    }
  }

  function closeArchivePageSurface() {
    if (state.page.root) state.page.root.classList.remove("open");
    try { D.documentElement.removeAttribute("data-h2o-archive-page-open"); } catch {}
    try { D.documentElement.removeAttribute("data-h2o-archive-page-mode"); } catch {}
    if (state.page.chatId) setPreviewStatus(state.page.chatId, null);
  }

  function renderArchivePageBadges(plan) {
    const badges = state.page.badges;
    if (!badges) return;
    badges.textContent = "";
    const rows = [
      { text: `Mode: ${plan.pageModeLabel}` },
      { text: `Strategy: ${plan.requestedStrategyLabel}` },
      { text: `Effective: ${plan.effectiveStrategyLabel}` },
      { text: `Source: ${plan.activeSourceLabel}` },
      { text: `Snapshot: ${plan.snapshotStateLabel}`, tone: plan.snapshotReady ? "good" : "warn" },
      { text: `Fallback: ${plan.fallbackReasonLabel}`, tone: plan.fallbackReason === FALLBACK_REASON_NONE ? "" : "warn" },
    ];
    for (const row of rows) {
      const chip = D.createElement("span");
      chip.className = `badge ${String(row.tone || "").trim()}`.trim();
      chip.textContent = row.text;
      badges.appendChild(chip);
    }
  }

  function ensureArchivePageUi() {
    if (state.page.root) return state.page.root;
    const root = D.createElement("div");
    root.className = "h2o-archive-page";
    root.innerHTML = `
<div class="shell">
  <div class="head">
    <div class="meta">
      <div>
        <div class="kicker">Archive Page</div>
        <div class="title">Archive Preview</div>
        <div class="subtitle"></div>
      </div>
      <div class="toolbar">
        <input class="search" type="search" placeholder="Search archive messages">
        <button type="button" class="refresh">Refresh Snapshot</button>
        <button type="button" class="capture primary">Capture Snapshot</button>
        <button type="button" class="saved">Saved Chats</button>
        <button type="button" class="reader">Reader</button>
        <button type="button" class="live">Open Live</button>
        <button type="button" class="close">Close</button>
      </div>
    </div>
    <div class="badges"></div>
  </div>
  <div class="err"></div>
  <div class="layout">
    <aside class="rail">
      <div class="railTitle">Snapshots</div>
      <div class="snapshots"></div>
    </aside>
    <section class="main">
      <div class="count"></div>
      <div class="body"></div>
    </section>
  </div>
</div>`;
    D.documentElement.appendChild(root);

    state.page.root = root;
    state.page.title = root.querySelector(".title");
    state.page.subtitle = root.querySelector(".subtitle");
    state.page.badges = root.querySelector(".badges");
    state.page.error = root.querySelector(".err");
    state.page.search = root.querySelector(".search");
    state.page.list = root.querySelector(".snapshots");
    state.page.body = root.querySelector(".body");
    state.page.count = root.querySelector(".count");
    state.page.liveBtn = root.querySelector(".live");
    state.page.readerBtn = root.querySelector(".reader");
    state.page.captureBtn = root.querySelector(".capture");
    state.page.savedBtn = root.querySelector(".saved");
    state.page.refreshBtn = root.querySelector(".refresh");
    state.page.closeBtn = root.querySelector(".close");

    state.page.search?.addEventListener("input", () => renderArchivePageMessages());
    state.page.liveBtn?.addEventListener("click", () => {
      void setPageMode(state.page.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
    });
    state.page.closeBtn?.addEventListener("click", () => {
      void setPageMode(state.page.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
    });
    state.page.readerBtn?.addEventListener("click", async () => {
      try {
        await openReader(state.page.chatId || getCurrentChatId(), state.page.currentSnapshot?.snapshotId || "");
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    state.page.captureBtn?.addEventListener("click", async () => {
      try {
        showArchivePageError("");
        const res = await captureNow(state.page.chatId || getCurrentChatId());
        if (res?.storage === "legacy" && res?.message) showArchivePageError(String(res.message));
        await openArchivePageSurface(state.page.chatId || getCurrentChatId(), { mode: state.page.mode, reason: "capture:page-toolbar" });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    state.page.savedBtn?.addEventListener("click", async () => {
      try {
        await openSavedChats({
          view: "saved",
          chatId: state.page.chatId || getCurrentChatId(),
          folderId: resolveFolderBinding(state.page.chatId || getCurrentChatId()).folderId,
          snapshotId: state.page.currentSnapshot?.snapshotId || "",
        });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    state.page.refreshBtn?.addEventListener("click", async () => {
      try {
        await loadLatestSnapshotInternal(state.page.chatId || getCurrentChatId());
        await openArchivePageSurface(state.page.chatId || getCurrentChatId(), { mode: state.page.mode, reason: "refresh:page-toolbar", forceLoadLatest: true });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    return root;
  }

  async function openArchivePageSurface(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) throw new Error("missing chatId");
    const pageMode = normalizePageMode(opts.mode || await getPageMode(chatId));
    const preferredSnapshotId = String(opts.snapshotId || "").trim();
    const root = ensureArchivePageUi();
    if (state.page.chatId && state.page.chatId !== chatId) {
      setPreviewStatus(state.page.chatId, null);
    }
    state.page.chatId = chatId;
    state.page.mode = pageMode;
    showArchivePageError("");
    if (state.reader.root) state.reader.root.classList.remove("open");

    let plan = await resolveEffectiveArchivePlan(chatId, {
      pageMode,
      forceLoadLatest: opts.forceLoadLatest === true || pageMode !== MODE_LIVE_FIRST,
    });
    if (!plan.snapshotReady && plan.advanced.autoCaptureWhenSnapshotMissing) {
      try {
        await captureNow(chatId);
        plan = await resolveEffectiveArchivePlan(chatId, {
          pageMode,
          forceLoadLatest: true,
        });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    }

    state.page.snapshots = await listSnapshots(chatId);
    state.page.currentSnapshot = null;
    if (preferredSnapshotId) {
      try {
        state.page.currentSnapshot = canonicalSnapshot(await loadSnapshot(preferredSnapshotId));
      } catch {}
    }
    if (!state.page.currentSnapshot && plan.latest) {
      state.page.currentSnapshot = canonicalSnapshot(plan.latest);
    }
    if (!state.page.currentSnapshot && state.page.snapshots.length) {
      const firstId = String(state.page.snapshots[0]?.snapshotId || "");
      state.page.currentSnapshot = firstId ? canonicalSnapshot(await loadSnapshot(firstId)) : null;
    }

    if (state.page.title) {
      state.page.title.textContent = `${pageModeLabel(pageMode)} · ${chatId}`;
    }
    if (state.page.subtitle) {
      state.page.subtitle.textContent = `${plan.helpText} Load Strategy ${plan.requestedStrategyLabel} resolves to ${plan.effectiveStrategyLabel}.`;
    }
    renderArchivePageBadges(plan);
    renderArchivePageSnapshotList();
    renderArchivePageMessages();
    root.classList.add("open");
    D.documentElement.setAttribute("data-h2o-archive-page-open", "1");
    D.documentElement.setAttribute("data-h2o-archive-page-mode", pageMode === MODE_ARCHIVE_ONLY ? "archive-only" : "archive-preview");
    setPreviewStatus(chatId, {
      fallbackReason: plan.fallbackReason,
      message: plan.statusText,
      activeSource: plan.activeSource,
      snapshotId: plan.snapshotId,
    });
    debugArchive("page-surface-open", { chatId, pageMode, requestedStrategy: plan.requestedStrategy, effectiveStrategy: plan.effectiveStrategy });
    return {
      ok: true,
      chatId,
      pageMode,
      snapshotId: String(state.page.currentSnapshot?.snapshotId || plan.snapshotId || ""),
      snapshotCount: state.page.snapshots.length,
    };
  }

  function setSavedChatsNote(message, tone = "") {
    const el = state.saved.note;
    if (!el) return;
    const msg = String(message || "").trim();
    if (!msg) {
      el.className = "note";
      el.textContent = "";
      return;
    }
    el.className = `note show ${String(tone || "").trim()}`.trim();
    el.textContent = msg;
  }

  function setSelectedSavedChat(row, el = null) {
    state.saved.selectedChatId = toChatId(row?.chatId || "");
    state.saved.selectedSnapshotId = String(row?.snapshotId || "").trim();
    state.saved.openReaderBtn && (state.saved.openReaderBtn.disabled = !state.saved.selectedChatId);
    Array.from(state.saved.list?.querySelectorAll(".item.active") || []).forEach((node) => node.classList.remove("active"));
    el?.classList?.add("active");
  }

  function renderSavedChatsList() {
    const listEl = state.saved.list;
    if (!listEl) return;
    const rows = filterWorkbenchRows(state.saved.rows, {
      view: state.saved.viewSelect?.value || "saved",
      folderId: state.saved.folderSelect?.value || "",
      query: state.saved.search?.value || "",
    });
    listEl.textContent = "";
    if (!rows.length) {
      const empty = D.createElement("div");
      empty.className = "empty";
      empty.textContent = "No saved chats match this filter yet.";
      listEl.appendChild(empty);
      state.saved.selectedChatId = "";
      state.saved.selectedSnapshotId = "";
      if (state.saved.openReaderBtn) state.saved.openReaderBtn.disabled = true;
      return;
    }
    let selectedRow = null;
    let selectedEl = null;
    const preferredSnapshotId = String(state.saved.selectedSnapshotId || "").trim();
    const preferredChatId = toChatId(state.saved.selectedChatId || "");
    rows.forEach((row, idx) => {
      const card = D.createElement("article");
      card.className = "item";
      const stampRaw = String(row.updatedAt || row.createdAt || "");
      const stampDate = stampRaw ? new Date(stampRaw) : null;
      const stamp = stampDate && !Number.isNaN(stampDate.getTime()) ? stampDate.toLocaleString("en-US") : stampRaw;
      const metaBits = [
        stamp,
        `${Number(row.messageCount || 0)} msg`,
        `${Number(row.answerCount || 0)} ans`,
        row.chatId,
      ].filter(Boolean);
      const badges = [
        row.pinned ? "Pinned" : "",
        row.archived ? "Archived" : "",
        row.folderId ? (row.folderName || row.folderId) : "",
      ].filter(Boolean);
      const titleEl = D.createElement("div");
      titleEl.className = "itemTitle";
      titleEl.textContent = String(row.title || row.chatId || "Saved chat");
      const metaEl = D.createElement("div");
      metaEl.className = "itemMeta";
      metaBits.forEach((part, partIdx) => {
        if (partIdx) {
          const dot = D.createElement("span");
          dot.textContent = "•";
          metaEl.appendChild(dot);
        }
        const bit = D.createElement("span");
        bit.textContent = String(part);
        metaEl.appendChild(bit);
      });
      card.append(titleEl, metaEl);
      if (badges.length) {
        const badgesEl = D.createElement("div");
        badgesEl.className = "itemBadges";
        for (const badge of badges) {
          const badgeEl = D.createElement("span");
          badgeEl.className = "itemBadge";
          badgeEl.textContent = String(badge);
          badgesEl.appendChild(badgeEl);
        }
        card.appendChild(badgesEl);
      }
      const excerptEl = D.createElement("div");
      excerptEl.className = "itemExcerpt";
      excerptEl.textContent = String(row.excerpt || "");
      card.appendChild(excerptEl);
      card.addEventListener("click", () => setSelectedSavedChat(row, card));
      card.addEventListener("dblclick", async () => {
        setSelectedSavedChat(row, card);
        state.saved.root?.classList.remove("open");
        await openReader(row.chatId, row.snapshotId);
      });
      listEl.appendChild(card);
      const isMatch = preferredSnapshotId
        ? preferredSnapshotId === String(row.snapshotId || "")
        : preferredChatId
          ? preferredChatId === toChatId(row.chatId)
          : idx === 0;
      if (isMatch && !selectedRow) {
        selectedRow = row;
        selectedEl = card;
      }
    });
    if (selectedRow && selectedEl) setSelectedSavedChat(selectedRow, selectedEl);
  }

  function fillSavedChatsFolderSelect() {
    const sel = state.saved.folderSelect;
    if (!sel) return;
    const view = state.saved.viewSelect?.value || "saved";
    const current = normalizeFolderFilter(sel.value || "");
    const options = collectWorkbenchFolderOptions(state.saved.rows, view);
    sel.textContent = "";
    for (const item of options) {
      const opt = D.createElement("option");
      opt.value = String(item.folderId || "");
      opt.textContent = `${String(item.label || "All folders")} (${Number(item.count || 0)})`;
      sel.appendChild(opt);
    }
    const nextValue = options.some((item) => String(item.folderId || "") === current) ? current : "";
    sel.value = nextValue;
  }

  function ensureSavedChatsUi() {
    if (state.saved.root) return state.saved.root;
    const root = D.createElement("div");
    root.className = "h2o-archive-saved";
    root.innerHTML = `
<div class="panel">
  <div class="head">
    <div class="title">Saved Chats</div>
    <select class="savedView">
      <option value="saved">Saved</option>
      <option value="pinned">Pinned</option>
      <option value="archive">Archive</option>
    </select>
    <select class="savedFolder"></select>
    <input class="search" type="search" placeholder="Search saved chats">
    <button type="button" class="refresh">Refresh</button>
    <button type="button" class="openReader" disabled>Open Reader</button>
    <button type="button" class="close">Close</button>
  </div>
  <div class="note"></div>
  <div class="list"></div>
</div>`;
    D.documentElement.appendChild(root);
    state.saved.root = root;
    state.saved.title = root.querySelector(".title");
    state.saved.note = root.querySelector(".note");
    state.saved.search = root.querySelector(".search");
    state.saved.viewSelect = root.querySelector(".savedView");
    state.saved.folderSelect = root.querySelector(".savedFolder");
    state.saved.list = root.querySelector(".list");
    state.saved.openReaderBtn = root.querySelector(".openReader");
    root.querySelector(".close")?.addEventListener("click", () => root.classList.remove("open"));
    root.addEventListener("click", (ev) => {
      if (ev.target === root) root.classList.remove("open");
    });
    root.querySelector(".refresh")?.addEventListener("click", () => {
      openSavedChatsPanel({
        view: state.saved.viewSelect?.value || "saved",
        folderId: state.saved.folderSelect?.value || "",
        chatId: state.saved.selectedChatId || "",
        snapshotId: state.saved.selectedSnapshotId || "",
        note: state.saved.note?.textContent || "",
        tone: state.saved.noteTone || "",
        force: true,
      }).catch((e) => setSavedChatsNote(String(e && (e.message || e) || ""), "warn"));
    });
    state.saved.search?.addEventListener("input", () => renderSavedChatsList());
    state.saved.viewSelect?.addEventListener("change", () => {
      fillSavedChatsFolderSelect();
      renderSavedChatsList();
    });
    state.saved.folderSelect?.addEventListener("change", () => renderSavedChatsList());
    state.saved.openReaderBtn?.addEventListener("click", async () => {
      const chatId = toChatId(state.saved.selectedChatId || "");
      if (!chatId) return;
      const snapshotId = String(state.saved.selectedSnapshotId || "").trim();
      root.classList.remove("open");
      await openReader(chatId, snapshotId);
    });
    return root;
  }

  async function openSavedChatsPanel(opts = {}) {
    const root = ensureSavedChatsUi();
    const view = normalizeArchiveView(opts.view || "saved");
    const folderId = normalizeFolderFilter(opts.folderId || "");
    state.saved.rows = await listWorkbenchRowsInternal();
    if (state.saved.title) {
      const modeLabel = state.extensionBacked ? "extension" : "local";
      state.saved.title.textContent = `Saved Chats · ${modeLabel}`;
    }
    if (state.saved.viewSelect) state.saved.viewSelect.value = view;
    fillSavedChatsFolderSelect();
    if (state.saved.folderSelect) {
      const hasFolder = Array.from(state.saved.folderSelect.options || []).some((opt) => String(opt.value || "") === folderId);
      state.saved.folderSelect.value = hasFolder ? folderId : "";
    }
    state.saved.selectedChatId = toChatId(opts.chatId || state.saved.selectedChatId || "");
    state.saved.selectedSnapshotId = String(opts.snapshotId || state.saved.selectedSnapshotId || "").trim();
    state.saved.noteTone = String(opts.tone || "").trim();
    setSavedChatsNote(String(opts.note || ""), state.saved.noteTone);
    renderSavedChatsList();
    root.classList.add("open");
    return {
      ok: true,
      mode: state.extensionBacked ? "extension-panel" : "local-panel",
      chatId: state.saved.selectedChatId,
      snapshotId: state.saved.selectedSnapshotId,
      rowCount: Array.isArray(state.saved.rows) ? state.saved.rows.length : 0,
    };
  }

  async function applyBootMode(chatIdRaw, reason = "route") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    migrateLocalChatKeysIfNeeded(chatId);
    await migrateLegacyIfNeeded(chatId);
    const pageMode = await getPageMode(chatId);
    clearMiniMapColdMarkers();
    await disableHybrid(chatId, `page-mode:${String(reason || "route")}:${pageMode}`);
    if (pageMode === MODE_LIVE_FIRST) {
      closeArchivePageSurface();
      setPreviewStatus(chatId, {
        fallbackReason: getLoadStrategy(chatId) === ARCH_VIEW_REBUILD_FIRST ? FALLBACK_REASON_NONE : FALLBACK_REASON_LIVE_SINGLE_VIEW,
        activeSource: ACTIVE_SOURCE_NATIVE,
        message: "Live mode keeps one native transcript visible.",
      });
      return { ok: true, chatId, pageMode, visible: ACTIVE_SOURCE_NATIVE };
    }
    const res = await openArchivePageSurface(chatId, {
      mode: pageMode,
      forceLoadLatest: true,
      reason,
    });
    return { ...res, visible: ACTIVE_SOURCE_ARCHIVE };
  }

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

      api.registerControl({
        id: "archive.reader",
        owner: "archive",
        groupId: "archive.main",
        order: 300,
        type: "button",
        className: "reader",
        text: "Open Reader",
        title: "Open Reader",
        onClick: async () => {
          const chatId = getCurrentChatId();
          try {
            await openReader(chatId);
            setDockStatusText(chatId, "Opened Archive Reader");
            await refreshDockState(chatId);
          } catch (e) {
            setDockStatusText(chatId, "Reader unavailable");
            await refreshDockState(chatId);
            showReaderError(String(e && (e.message || e)));
          }
        },
      });

      api.registerControl({
        id: "archive.saved",
        owner: "archive",
        groupId: "archive.main",
        order: 400,
        type: "button",
        className: "saved",
        text: "Saved Chats",
        title: "Saved Chats",
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
            showReaderError(String(e && (e.message || e)));
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
            showReaderError(String(e && (e.message || e)));
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
    const ext = state.extensionBacked ? "extension" : "local";
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

  async function resyncMiniMapColdMarkers(chatIdRaw, reason = "manual") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const pageMode = await getPageMode(chatId);
    const requestedStrategy = getLoadStrategy(chatId);
    if (pageMode !== MODE_LIVE_FIRST || requestedStrategy === ARCH_VIEW_REBUILD_FIRST) {
      clearMiniMapColdMarkers();
      return { ok: true, chatId, cleared: true, reason: pageMode !== MODE_LIVE_FIRST ? "page-mode-archive" : "strategy-safe" };
    }
    let latest = state.latestByChat.get(chatId) || null;
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      try {
        latest = await loadLatestSnapshotInternal(chatId);
      } catch (e) {
        warn("resync minimap snapshot load failed", e);
        latest = null;
      }
    }
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      clearMiniMapColdMarkers();
      return { ok: false, chatId, reason: "snapshot-missing" };
    }
    const baselineCount = latest.messages.length;
    const baselineTurns = countAssistantTurns(latest.messages);
    const hotStart = Math.max(0, Math.min(baselineCount, getLocalHotStart(chatId, baselineCount)));
    const hybrid = getHybridState(chatId);
    const pendingHot = !isStreamRootReady(hybrid);
    syncMiniMapColdState(chatId, latest.messages, hotStart, { pendingHot, pendingBaselineTurns: baselineTurns });
    return {
      ok: true,
      chatId,
      reason: String(reason || "manual"),
      hotStart,
      baselineCount,
      baselineTurns,
      pendingHot,
      snapshotId: String(latest.snapshotId || ""),
    };
  }

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
    if (!state.extensionBacked) {
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
    if (!state.extensionBacked) {
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
    if (state.extensionBacked) {
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

  const archiveBoot = (H2O.archiveBoot = H2O.archiveBoot || {});
  archiveBoot.VERSION = "1.0.0";
  archiveBoot.MSG = { REQ, RES, SW };
  archiveBoot.ARCH_VIEW_CACHE_FIRST = ARCH_VIEW_CACHE_FIRST;
  archiveBoot.ARCH_VIEW_REBUILD_FIRST = ARCH_VIEW_REBUILD_FIRST;
  archiveBoot.LOAD_STRATEGY_AUTO = LOAD_STRATEGY_AUTO;
  archiveBoot.isExtensionBacked = () => state.extensionBacked === true;
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
  archiveBoot.captureNow = (chatId) => captureNow(chatId);
  archiveBoot.captureWithOptions = (opts = {}) => captureWithOptions(opts);
  archiveBoot.loadLatestSnapshot = (chatId) => loadLatestSnapshotInternal(chatId);
  archiveBoot.openReader = (chatId, snapshotId) => openReader(chatId, snapshotId);
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
      cleanupColdLayers(null);
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
    mountStyles();
    ensureArchiveCommandBarBindings();
    scheduleCommandBarBindRetry();
    W.addEventListener(EVT_ARCHIVE_SCROLL_TO_COLD, (ev) => {
      const d = ev?.detail || {};
      const chatId = toChatId(d.chatId || getCurrentChatId());
      const msgIdxRaw = d.msgIdx ?? d.messageIndex ?? d.idx;
      const answerIndex = Math.max(1, normalizeHotStart(d.answerIndex ?? d.turnIndex, 0));
      scrollToColdWithFallback(chatId, msgIdxRaw, { answerIndex, source: String(d.source || "event") })
        .catch((e) => warn("cold scroll event failed", e));
    }, true);
    W.addEventListener(EVT_ARCHIVE_REHYDRATE, (ev) => {
      const d = ev?.detail || {};
      const chatId = toChatId(d.chatId || getCurrentChatId());
      const idxRaw = d.hotStartIndex ?? d.messageIndex ?? d.answerIndex ?? d.turnIndex ?? d.idx;
      const kind = String(d.kind || (d.answerIndex != null ? "answer" : "message")).toLowerCase();
      rehydrateFromIndex(chatId, idxRaw, {
        kind,
        answerIndex: d.answerIndex,
        source: String(d.source || "event"),
      }).catch((e) => warn("rehydrate event failed", e));
    }, true);
    W.addEventListener("evt:h2o:minimap:index:hydrated", (ev) => {
      const d = ev?.detail || {};
      const chatId = toChatId(d.chatId || getCurrentChatId());
      resyncMiniMapColdMarkers(chatId, "minimap:index:hydrated").catch((e) => warn("minimap hydrated resync failed", e));
    }, true);
    W.addEventListener("evt:h2o:minimap:index:appended", (ev) => {
      const d = ev?.detail || {};
      const chatId = toChatId(d.chatId || getCurrentChatId());
      resyncMiniMapColdMarkers(chatId, "minimap:index:appended").catch((e) => warn("minimap appended resync failed", e));
    }, true);
    const readerReq = parseReaderHashRequest();
    if (readerReq?.chatId) {
      openReader(readerReq.chatId).catch((e) => warn("reader hash boot failed", e));
    }
    await ensureExtensionBacked();
    await onRouteChange(true);
    W.setInterval(() => {
      onRouteChange(false).catch((e) => warn("route watcher", e));
    }, 800);
    log("ready", { extensionBacked: state.extensionBacked });
  }

  boot().catch((e) => warn("boot failed", e));
})();
