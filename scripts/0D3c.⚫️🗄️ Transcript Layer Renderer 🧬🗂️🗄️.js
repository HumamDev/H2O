// ==UserScript==
// @h2o-id             0d3c.transcript.layer.renderer
// @name               0D3c.⚫️🗄️ Transcript Layer Renderer 🧬🗂️🗄️
// @namespace          H2O.Premium.CGX.transcript.layer.renderer
// @author             HumamDev
// @version            1.1.0
// @revision           001
// @build              260404-000000
// @description        Transcript renderer: hybrid cold/hot rendering, archive page surface, local saved chats panel, and renderer-local listeners.
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
  const TAG = "[H2O.TranscriptRenderer]";

  /* ─── Bridge to 0D3a engine ─── */
  function _ab() { return H2O.archiveBoot || null; }
  function _b() { return _ab()?._bridge || null; }
  function _host() { return _ab()?._rendererHost || null; }

  /* ─── Shared helpers ─── */
  function log(...a) { try { console.log(TAG, ...a); } catch {} }
  function warn(...a) { try { console.warn(TAG, ...a); } catch {} }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function nowIso() { return new Date().toISOString(); }
  function toChatId(r) { return String(r || "").trim(); }
  function stableHash(r) { const s=String(r||""); let h=5381; for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i); return Math.abs(h>>>0).toString(36); }
  function getCurrentChatId() {
    const fromHost = _host()?.getCurrentChatId?.();
    if (fromHost) return toChatId(fromHost);
    const f = H2O.util?.getChatId?.(); if (f) return toChatId(f);
    try { const u=new URL(W.location.href); const p=String(u.pathname||"").split("/").filter(Boolean);
      const c=p.indexOf("c"); if(c>=0&&p[c+1]) return toChatId(p[c+1]);
      const g=p.indexOf("g"); if(g>=0&&p[g+2]) return toChatId(p[g+2]);
    } catch {} return "";
  }

  /* ─── Bridged helpers ─── */
  function lsGetStr(k,fb) { return _b()?.lsGetStr?.(k,fb)??fb; }
  function lsSetStr(k,v) { return _b()?.lsSetStr?.(k,v); }
  function lsDel(k) { return _b()?.lsDel?.(k); }
  function lsGetJson(k,fb) { return _b()?.lsGetJson?.(k,fb)??fb; }
  function lsSetJson(k,v) { return _b()?.lsSetJson?.(k,v); }
  function lsGetStrWithFallback(a,b,fb) { return _b()?.lsGetStrWithFallback?.(a,b,fb)??fb; }
  function lsSetStrBoth(a,b,v) { return _b()?.lsSetStrBoth?.(a,b,v); }
  function lsSetJsonBoth(a,b,v) { return _b()?.lsSetJsonBoth?.(a,b,v); }
  function canonicalSnapshot(r) { return _b()?.canonicalSnapshot?.(r)||r; }
  function normalizeHotStart(r,fb) { return _b()?.normalizeHotStart?.(r,fb)??Math.max(0,Number(r||0)||fb||0); }
  function keyHotStart(c) { return _b()?.keyHotStart?.(c)||`h2o:prm:cgx:archive:hotStart:${c}:v1`; }
  function getLocalBaseline(c) { return _b()?.getLocalBaseline?.(c)||null; }
  function setLocalBaseline(c,v) { return _b()?.setLocalBaseline?.(c,v); }
  function getLocalBootMode(c) { return _b()?.getLocalBootMode?.(c)||""; }
  function setLocalBootMode(c,v) { return _b()?.setLocalBootMode?.(c,v); }
  function getLocalViewMode(c) { return _b()?.getLocalViewMode?.(c)||""; }
  function setLocalViewMode(c,v) { return _b()?.setLocalViewMode?.(c,v); }
  function getLocalLoadStrategy(c) { return _b()?.getLocalLoadStrategy?.(c)||""; }
  function setLocalLoadStrategy(c,v) { return _b()?.setLocalLoadStrategy?.(c,v); }
  function migrateLocalChatKeysIfNeeded(c) { return _b()?.migrateLocalChatKeysIfNeeded?.(c); }
  async function migrateLegacyIfNeeded(c) { return _b()?.migrateLegacyIfNeeded?.(c); }
  function setDockWarning(c,m) { return _b()?.setDockWarning?.(c,m); }
  function getDockWarning(c) { return _b()?.getDockWarning?.(c)||""; }
  function setDockStatusText(c,m) { return _b()?.setDockStatusText?.(c,m); }
  function getDockStatusText(c) { return _b()?.getDockStatusText?.(c)||""; }
  async function refreshDockState(c) { return _b()?.refreshDockState?.(c); }
  function getFoldersList() { return _b()?.getFoldersList?.()||[]; }
  function resolveFolderBinding(c) { return _b()?.resolveFolderBinding?.(c)||{folderId:"",folderName:""}; }
  function getArchiveAdvancedSettings() { return _b()?.getArchiveAdvancedSettings?.()||{}; }
  function getStorageMode() {
    return String(_host()?.getStorageMode?.() || (_host()?.isExtensionBacked?.() ? "extension" : "local"));
  }
  function captureNow(c) { return _host()?.captureNow?.(c); }
  function captureWithOptions(o) { return _host()?.captureWithOptions?.(o); }
  function loadLatestSnapshotInternal(c) { return _host()?.loadLatestSnapshot?.(c); }
  function getCachedLatestSnapshot(c) { return _host()?.getCachedLatestSnapshot?.(c) || null; }
  function listSnapshots(c) { return _host()?.listSnapshots?.(c); }
  function loadSnapshot(s) { return _host()?.loadSnapshot?.(s); }
  function pinSnapshot(snapshotId, pinned) { return _host()?.pinSnapshot?.(snapshotId, pinned); }
  function deleteSnapshot(snapshotId) { return _host()?.deleteSnapshot?.(snapshotId); }
  function listWorkbenchRowsInternal() { return _host()?.listWorkbenchRows?.() || []; }
  async function getMode(c) { return _host()?.getMode?.(c); }
  async function setMode(c,m) { return _host()?.setMode?.(c,m); }
  function getViewMode(c) { return _host()?.getViewMode?.(c)||"rebuild_first"; }
  async function setViewMode(c,m) { return _host()?.setViewMode?.(c,m); }
  function getLoadStrategy(c) { return _host()?.getLoadStrategy?.(c)||"auto"; }
  async function setLoadStrategy(c,s,o) { return _host()?.setLoadStrategy?.(c,s,o); }
  async function getPageMode(c) { return _host()?.getPageMode?.(c); }
  async function setPageMode(c,m) { return _host()?.setPageMode?.(c,m); }
  async function openSavedChats(o) { return _host()?.openSavedChats?.(o); }

  /* ─── Constants ─── */
  const MODE_LIVE_FIRST="live_first", MODE_ARCHIVE_FIRST="archive_first", MODE_ARCHIVE_ONLY="archive_only";
  const ARCH_VIEW_CACHE_FIRST="cache_first", ARCH_VIEW_REBUILD_FIRST="rebuild_first", LOAD_STRATEGY_AUTO="auto";
  const ACTIVE_SOURCE_NATIVE="native", ACTIVE_SOURCE_SNAPSHOT="snapshot", ACTIVE_SOURCE_ARCHIVE="archive";
  const FALLBACK_REASON_NONE="none", FALLBACK_REASON_SNAPSHOT_MISSING="snapshot-missing";
  const FALLBACK_REASON_LIVE_SINGLE_VIEW="live-single-view", FALLBACK_REASON_HOST_FAILED="host-failed", FALLBACK_REASON_MOUNT_FAILED="mount-failed";
  const HYBRID_APPLY_DEBOUNCE_MS=120, HYBRID_DETACH_THRESHOLD_NODES=50, HYBRID_MAX_SPACER_PX=2500000;
  const SAVE_MODE_SILENT="silent", SAVE_MODE_READER="reader", SAVE_MODE_LIBRARY="library";
  const WORKBENCH_LOCAL_ONLY_WARNING = "Saved in local fallback mode — the extension workbench cannot see this until the archive bridge connects.";
  const EVT_ARCHIVE_REHYDRATE="evt:h2o:archive:rehydrate", EVT_ARCHIVE_SCROLL_TO_COLD="evt:h2o:archive:scroll-to-cold";
  const EVT_ARCHIVE_HOTSTART_CHANGED="evt:h2o:archive:hotstart:changed", EVT_ARCHIVE_HYBRID_STATE="evt:h2o:archive:hybrid:state";
  const ARCHIVE_ADVANCED_DEFAULTS = Object.freeze({autoCaptureWhenSnapshotMissing:false,allowStaleSnapshotBoot:false,keepPreviewUntilNativeStable:true,forceFallbackOnMountFailure:true,forceFallbackOnHostFailure:true,showFallbackReason:true,showSnapshotMeta:false,debugArchiveEvents:false});
  const ATTR_MESSAGE_AUTHOR_ROLE="data-message-author-role";
  const SEL_MESSAGE_NODES=`[${ATTR_MESSAGE_AUTHOR_ROLE}="user"],[${ATTR_MESSAGE_AUTHOR_ROLE}="assistant"]`;
  const SEL_TURN_PRIMARY='[data-testid="conversation-turn"],[data-testid^="conversation-turn-"]';

  /* ─── State ─── */
  const state = {
    stylesMounted: false,
    listenersBound: false,
    previewStatusByChat: new Map(),
    hybridByChat: new Map(), hybridStreamFailCount: new Map(),
    hybridScrollHostFailCount: new Map(), hybridApplyTimer: 0,
    hybridMutationReasonByChat: new Map(),
    pageSurface: {
      root:null,title:null,subtitle:null,badges:null,error:null,search:null,
      list:null,body:null,count:null,liveBtn:null,captureBtn:null,savedBtn:null,
      refreshBtn:null,closeBtn:null,mode:MODE_ARCHIVE_FIRST,chatId:"",snapshots:[],currentSnapshot:null,
    },
    saved: {
      root:null,title:null,note:null,search:null,viewSelect:null,folderSelect:null,list:null,
      rows:[],selectedChatId:"",selectedSnapshotId:"",noteTone:"",
    },
  };

  /* ═══════════════════════════════════════════════════════════════════
   *  EXTRACTED HYBRID FUNCTIONS (from 0D3a)
   * ═══════════════════════════════════════════════════════════════════ */

  /* --- Scattered helpers --- */
  function normalizeMode(raw) {
    const v = String(raw || "").trim().toLowerCase();
    if (v === MODE_ARCHIVE_FIRST) return MODE_ARCHIVE_FIRST;
    if (v === MODE_ARCHIVE_ONLY) return MODE_ARCHIVE_ONLY;
    return MODE_LIVE_FIRST;
  }

  function normalizePageMode(raw) {
    return normalizeMode(raw);
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

  function normalizeFolderFilter(raw) {
    return String(raw || "").trim();
  }

  function normalizeBaseline(raw, fallback = null) {
    const src = isObj(raw) ? raw : {};
    const snapshotId = String(src.snapshotId || "");
    const baselineCount = normalizeHotStart(src.baselineCount, 0);
    const capturedAt = String(src.capturedAt || "");
    if (!snapshotId && !baselineCount) return fallback;
    return { snapshotId, baselineCount, capturedAt };
  }

  function pageModeLabel(modeRaw) {
    const mode = normalizePageMode(modeRaw);
    if (mode === MODE_ARCHIVE_FIRST) return "Archive Preview";
    if (mode === MODE_ARCHIVE_ONLY) return "Archive Only";
    return "Live";
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

  function isConversationTurnNode(el) {
    if (!el || el.nodeType !== 1) return false;
    const testid = String(el.getAttribute?.("data-testid") || "").trim();
    return testid === "conversation-turn" || testid.startsWith("conversation-turn-");
  }

  function collectNativeTurnNodes(rootEl = null) {
    const root = rootEl && rootEl.querySelectorAll ? rootEl : D;
    const nodes = [];
    if (isConversationTurnNode(root)) nodes.push(root);
    nodes.push(...Array.from(root.querySelectorAll(SEL_TURN_PRIMARY)));
    const seen = new Set();
    return nodes.filter((el) => {
      if (!el || seen.has(el) || isArchiveInjectedNode(el)) return false;
      seen.add(el);
      return true;
    });
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

  /* --- emitArchiveEvent..resolveEffectiveArchivePlan --- */
  function emitArchiveEvent(type, detail = {}) {
    try { W.dispatchEvent(new CustomEvent(String(type || ""), { detail: isObj(detail) ? detail : {} })); } catch {}
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
        storageMode: getStorageMode(),
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
      previewVisible: !!(state.pageSurface.root && state.pageSurface.root.classList.contains("open") && state.pageSurface.chatId === chatId),
      helpText,
      statusText,
      storageMode: getStorageMode(),
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



  /* --- getHybridState..scrollToColdWithFallback --- */
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

    let latest = getCachedLatestSnapshot(chatId) || null;
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      try {
        latest = await loadLatestSnapshotInternal(chatId);
      } catch (e) {
        warn("scrollToCold snapshot load failed", e);
        latest = null;
      }
    }
    if (!latest || !Array.isArray(latest.messages) || !latest.messages.length) {
      setDockWarning(chatId, "Cold scroll fallback unavailable: snapshot missing.");
      await refreshDockState(chatId);
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

/* .h2o-archive-reader CSS — removed (reader deprecated v1.1.0) */

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

  // showReaderError — removed (reader deprecated)

  // renderReaderMessages — removed (reader deprecated)




  /* --- Archive Page Surface --- */
  function showArchivePageError(message) {
    const el = state.pageSurface.error;
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
    const body = state.pageSurface.body;
    if (!body) return;
    const snap = state.pageSurface.currentSnapshot;
    const query = String(state.pageSurface.search?.value || "").trim().toLowerCase();
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
          const res = await captureNow(state.pageSurface.chatId || getCurrentChatId());
          if (res?.storage === "legacy" && res?.message) showArchivePageError(String(res.message));
          await openArchivePageSurface(state.pageSurface.chatId || getCurrentChatId(), { mode: state.pageSurface.mode, reason: "capture:page-empty" });
        } catch (e) {
          showArchivePageError(String(e && (e.message || e)));
        }
      });
      const liveBtn = D.createElement("button");
      liveBtn.type = "button";
      liveBtn.textContent = "Open Live";
      liveBtn.addEventListener("click", () => {
        void setPageMode(state.pageSurface.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
      });
      actions.append(captureBtn, liveBtn);
      empty.append(title, summary, actions);
      body.appendChild(empty);
      if (state.pageSurface.count) state.pageSurface.count.textContent = "0 messages";
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
    if (state.pageSurface.count) {
      const total = snap.messages.length;
      state.pageSurface.count.textContent = query ? `${rows.length}/${total} messages` : `${total} messages`;
    }
  }

  function renderArchivePageSnapshotList() {
    const listEl = state.pageSurface.list;
    if (!listEl) return;
    listEl.textContent = "";
    const rows = Array.isArray(state.pageSurface.snapshots) ? state.pageSurface.snapshots : [];
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
      if (state.pageSurface.currentSnapshot?.snapshotId === sid) card.classList.add("active");
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
          state.pageSurface.currentSnapshot = canonicalSnapshot(snap);
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
          state.pageSurface.snapshots = await listSnapshots(state.pageSurface.chatId || getCurrentChatId());
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
          state.pageSurface.snapshots = await listSnapshots(state.pageSurface.chatId || getCurrentChatId());
          if (state.pageSurface.currentSnapshot?.snapshotId === sid) state.pageSurface.currentSnapshot = null;
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
    if (state.pageSurface.root) state.pageSurface.root.classList.remove("open");
    try { D.documentElement.removeAttribute("data-h2o-archive-page-open"); } catch {}
    try { D.documentElement.removeAttribute("data-h2o-archive-page-mode"); } catch {}
    if (state.pageSurface.chatId) setPreviewStatus(state.pageSurface.chatId, null);
  }

  function renderArchivePageBadges(plan) {
    const badges = state.pageSurface.badges;
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
    if (state.pageSurface.root) return state.pageSurface.root;
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

    state.pageSurface.root = root;
    state.pageSurface.title = root.querySelector(".title");
    state.pageSurface.subtitle = root.querySelector(".subtitle");
    state.pageSurface.badges = root.querySelector(".badges");
    state.pageSurface.error = root.querySelector(".err");
    state.pageSurface.search = root.querySelector(".search");
    state.pageSurface.list = root.querySelector(".snapshots");
    state.pageSurface.body = root.querySelector(".body");
    state.pageSurface.count = root.querySelector(".count");
    state.pageSurface.liveBtn = root.querySelector(".live");
    state.pageSurface.captureBtn = root.querySelector(".capture");
    state.pageSurface.savedBtn = root.querySelector(".saved");
    state.pageSurface.refreshBtn = root.querySelector(".refresh");
    state.pageSurface.closeBtn = root.querySelector(".close");

    state.pageSurface.search?.addEventListener("input", () => renderArchivePageMessages());
    state.pageSurface.liveBtn?.addEventListener("click", () => {
      void setPageMode(state.pageSurface.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
    });
    state.pageSurface.closeBtn?.addEventListener("click", () => {
      void setPageMode(state.pageSurface.chatId || getCurrentChatId(), MODE_LIVE_FIRST).catch((e) => showArchivePageError(String(e && (e.message || e))));
    });
    // readerBtn click handler — removed (reader deprecated)
    state.pageSurface.captureBtn?.addEventListener("click", async () => {
      try {
        showArchivePageError("");
        const res = await captureNow(state.pageSurface.chatId || getCurrentChatId());
        if (res?.storage === "legacy" && res?.message) showArchivePageError(String(res.message));
        await openArchivePageSurface(state.pageSurface.chatId || getCurrentChatId(), { mode: state.pageSurface.mode, reason: "capture:page-toolbar" });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    state.pageSurface.savedBtn?.addEventListener("click", async () => {
      try {
        await openSavedChats({
          view: "saved",
          chatId: state.pageSurface.chatId || getCurrentChatId(),
          folderId: resolveFolderBinding(state.pageSurface.chatId || getCurrentChatId()).folderId,
          snapshotId: state.pageSurface.currentSnapshot?.snapshotId || "",
        });
      } catch (e) {
        showArchivePageError(String(e && (e.message || e)));
      }
    });
    state.pageSurface.refreshBtn?.addEventListener("click", async () => {
      try {
        await loadLatestSnapshotInternal(state.pageSurface.chatId || getCurrentChatId());
        await openArchivePageSurface(state.pageSurface.chatId || getCurrentChatId(), { mode: state.pageSurface.mode, reason: "refresh:page-toolbar", forceLoadLatest: true });
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
    if (state.pageSurface.chatId && state.pageSurface.chatId !== chatId) {
      setPreviewStatus(state.pageSurface.chatId, null);
    }
    state.pageSurface.chatId = chatId;
    state.pageSurface.mode = pageMode;
    showArchivePageError("");

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

    state.pageSurface.snapshots = await listSnapshots(chatId);
    state.pageSurface.currentSnapshot = null;
    if (preferredSnapshotId) {
      try {
        state.pageSurface.currentSnapshot = canonicalSnapshot(await loadSnapshot(preferredSnapshotId));
      } catch {}
    }
    if (!state.pageSurface.currentSnapshot && plan.latest) {
      state.pageSurface.currentSnapshot = canonicalSnapshot(plan.latest);
    }
    if (!state.pageSurface.currentSnapshot && state.pageSurface.snapshots.length) {
      const firstId = String(state.pageSurface.snapshots[0]?.snapshotId || "");
      state.pageSurface.currentSnapshot = firstId ? canonicalSnapshot(await loadSnapshot(firstId)) : null;
    }

    if (state.pageSurface.title) {
      state.pageSurface.title.textContent = `${pageModeLabel(pageMode)} · ${chatId}`;
    }
    if (state.pageSurface.subtitle) {
      state.pageSurface.subtitle.textContent = `${plan.helpText} Load Strategy ${plan.requestedStrategyLabel} resolves to ${plan.effectiveStrategyLabel}.`;
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
      snapshotId: String(state.pageSurface.currentSnapshot?.snapshotId || plan.snapshotId || ""),
      snapshotCount: state.pageSurface.snapshots.length,
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
      card.addEventListener("dblclick", () => {
        setSelectedSavedChat(row, card);
        state.saved.root?.classList.remove("open");
        // Navigate to the chat (reader removed — use hybrid view)
        try {
          const chatUrl = `/c/${encodeURIComponent(row.chatId)}`;
          W.location.href = chatUrl;
        } catch (e) { warn("navigate to chat failed", e); }
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
    // openReaderBtn click — removed (reader deprecated)
    return root;
  }

  async function openSavedChatsPanel(opts = {}) {
    const root = ensureSavedChatsUi();
    const view = normalizeArchiveView(opts.view || "saved");
    const folderId = normalizeFolderFilter(opts.folderId || "");
    state.saved.rows = await listWorkbenchRowsInternal();
    if (state.saved.title) {
      const modeLabel = getStorageMode();
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
      mode: getStorageMode() === "extension" ? "extension-panel" : "local-panel",
      chatId: state.saved.selectedChatId,
      snapshotId: state.saved.selectedSnapshotId,
      rowCount: Array.isArray(state.saved.rows) ? state.saved.rows.length : 0,
    };
  }

  function closeSavedChatsPanel() {
    try { state.saved.root?.classList.remove("open"); } catch {}
    return { ok: true };
  }



  /* --- applyBootMode --- */
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

  /* --- resyncMiniMapColdMarkers --- */
  async function resyncMiniMapColdMarkers(chatIdRaw, reason = "manual") {
    const chatId = toChatId(chatIdRaw || getCurrentChatId());
    if (!chatId) return { ok: false, reason: "missing-chat-id" };
    const pageMode = await getPageMode(chatId);
    const requestedStrategy = getLoadStrategy(chatId);
    if (pageMode !== MODE_LIVE_FIRST || requestedStrategy === ARCH_VIEW_REBUILD_FIRST) {
      clearMiniMapColdMarkers();
      return { ok: true, chatId, cleared: true, reason: pageMode !== MODE_LIVE_FIRST ? "page-mode-archive" : "strategy-safe" };
    }
    let latest = getCachedLatestSnapshot(chatId) || null;
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
  /* ═══════════════════════════════════════════════════════════════════
   *  PUBLIC API + BOOT
   * ═══════════════════════════════════════════════════════════════════ */

  const rendererApi = {
    applyHybrid, disableHybrid, rehydrateFromIndex,
    scrollToCold, scrollToColdWithFallback,
    applyBootMode, afterSnapshotCaptured,
    getHybridState, setPreviewStatus, getPreviewStatus,
    resolveEffectiveArchivePlan,
    clearMiniMapColdMarkers, syncMiniMapColdState, resyncMiniMapColdMarkers,
    openArchivePageSurface, closeArchivePageSurface,
    collectNativeTurnNodes, collectNativeMessageNodes,
    pageModeLabel, emitArchiveEvent, messageIndexForAnswer,
    getLocalHotStart, setLocalHotStart, delLocalHotStart,
    getHotStart, setHotStart,
    mountStyles, ensureBootListeners,
    openSavedChatsPanel, closeSavedChatsPanel,
    cleanupColdLayers,
  };
  H2O.snapshotHybrid = rendererApi;

  function waitForEngine(cb) {
    if (_ab()?._registerRenderer && _b() && _host()) return cb();
    const check = () => {
      if (_ab()?._registerRenderer && _b() && _host()) return cb();
      W.setTimeout(check, 200);
    };
    W.setTimeout(check, 100);
  }

  function ensureBootListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;
    log("boot", { bridge: !!_b() });
    W.addEventListener(EVT_ARCHIVE_SCROLL_TO_COLD, (ev) => {
      const d=ev?.detail||{}; const chatId=toChatId(d.chatId||getCurrentChatId());
      const msgIdxRaw=d.msgIdx??d.messageIndex??d.idx;
      const answerIndex=Math.max(1,normalizeHotStart(d.answerIndex??d.turnIndex,0));
      scrollToColdWithFallback(chatId,msgIdxRaw,{answerIndex,source:String(d.source||"event")}).catch(e=>warn("cold scroll event failed",e));
    }, true);
    W.addEventListener(EVT_ARCHIVE_REHYDRATE, (ev) => {
      const d=ev?.detail||{}; const chatId=toChatId(d.chatId||getCurrentChatId());
      const idxRaw=d.hotStartIndex??d.messageIndex??d.answerIndex??d.turnIndex??d.idx;
      const kind=String(d.kind||(d.answerIndex!=null?"answer":"message")).toLowerCase();
      rehydrateFromIndex(chatId,idxRaw,{kind,answerIndex:d.answerIndex,source:String(d.source||"event")}).catch(e=>warn("rehydrate event failed",e));
    }, true);
    W.addEventListener("evt:h2o:minimap:index:hydrated", (ev) => {
      const d=ev?.detail||{}; const chatId=toChatId(d.chatId||getCurrentChatId());
      resyncMiniMapColdMarkers(chatId,"minimap:index:hydrated").catch(e=>warn("minimap hydrated resync failed",e));
    }, true);
    W.addEventListener("evt:h2o:minimap:index:appended", (ev) => {
      const d=ev?.detail||{}; const chatId=toChatId(d.chatId||getCurrentChatId());
      resyncMiniMapColdMarkers(chatId,"minimap:index:appended").catch(e=>warn("minimap appended resync failed",e));
    }, true);
  }

  function registerRenderer() {
    const ab = _ab();
    if (!ab || typeof ab._registerRenderer !== "function") return false;
    ab._registerRenderer(rendererApi);
    return true;
  }

  function rendererBoot() {
    registerRenderer();
    ensureBootListeners();
    log("ready");
  }

  waitForEngine(() => { try { rendererBoot(); } catch (e) { warn("boot failed", e); } });
})();
