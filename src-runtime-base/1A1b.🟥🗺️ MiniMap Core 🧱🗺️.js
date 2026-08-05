// ==H2O Module==
// @h2o-id             1a1b.minimap.core
// @name               1A1b.🟥🗺️ MiniMap Core 🧱🗺️
// @namespace          H2O.Premium.CGX.minimap.core
// @author             HumamDev
// @version            12.7.11
// @revision           007
// @build              260412-000003
// @description        MiniMap Core: state/index/rebuild/registry authority
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;
  H2O.perf = H2O.perf || {};
  H2O.perf.modules = H2O.perf.modules || Object.create(null);
  const PERF_MODULE = (H2O.perf.modules.miniMapCoreUi && typeof H2O.perf.modules.miniMapCoreUi === 'object')
    ? H2O.perf.modules.miniMapCoreUi
    : (H2O.perf.modules.miniMapCoreUi = Object.create(null));
  const PERF = (() => {
    const existing = PERF_MODULE.__h2oPerfState;
    if (existing && typeof existing === 'object') return existing;
    const next = createMiniMapCoreUiPerfState();
    try {
      Object.defineProperty(PERF_MODULE, '__h2oPerfState', {
        value: next,
        configurable: true,
        writable: true,
      });
    } catch {
      PERF_MODULE.__h2oPerfState = next;
    }
    return next;
  })();
  ensureMiniMapCoreUiPerfStateShape(PERF);
  PERF_MODULE.getStats = getMiniMapCoreUiPerfStats;
  PERF_MODULE.resetStats = () => {
    resetMiniMapCoreUiPerfState(PERF);
    return getMiniMapCoreUiPerfStats();
  };

  // Kernel-authoritative bridge access (no fallbacks here; util.mm decides)
  const MM = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.mm || null;
  const MM_core = () => MM()?.core?.() || null;
  const MM_ui = () => MM()?.ui?.() || null;
  const MM_rt = () => MM()?.rt?.() || null;
  const MM_behavior = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.behavior || null;
  const MM_uiRefs = () => MM()?.uiRefs?.() || (MM_ui()?.getRefs?.() || {});


/* Phase 1 compatibility seam for 1A2c Chat Pages Controller */
function getChatPagesControllerApi() {
  try {
    return TOPW.H2O_MM_SHARED?.get?.()?.api?.mm?.chatPagesCtl || null;
  } catch {
    return null;
  }
}

function callChatPagesCtl(methodName, args, fallbackFn) {
  const api = getChatPagesControllerApi();
  const fn = api && typeof api[methodName] === 'function' ? api[methodName] : null;
  if (fn) {
    try {
      return fn(...(Array.isArray(args) ? args : []));
    } catch (err) {
      try { console.warn('[MiniMap Core] chatPagesCtl delegation failed:', methodName, err); } catch {}
    }
  }
  return typeof fallbackFn === 'function'
    ? fallbackFn(...(Array.isArray(args) ? args : []))
    : false;
}

function AT_PUBLIC() {
  try {
    return TOPW.H2O?.AT?.tnswrttl?.api?.public || null;
  } catch {
    return null;
  }
}

function UM_PUBLIC() {
  try {
    return TOPW.H2O?.UM?.nmntmssgs?.api || null;
  } catch {
    return null;
  }
}

  const CORE_VER = '12.6.22';
  const MAX_TRIES = 80;
  const GAP_MS = 120;
  const REBUILD_FALLBACK_MS = 180;

  const S = {
    inited: false,
    installTries: 0,
    installTimer: null,
    rebuildTimer: null,
    rebuildRaf: 0,
    rebuildToken: 0,
    rebuildReason: '',
    turnList: [],
    retainedTurnList: [],
    retainedTurnChatKey: '',
    turnById: new Map(),
    turnIdByAId: new Map(),
    answerByTurnId: new Map(),
    answerEls: [],
    mapButtons: null,
    emptyRetryTimer: null,
    emptyRetryCount: 0,
    retryTimer: null,
    retryCount: 0,
    retryKind: '',
    retryReason: '',
    rebuildInFlight: false,
    rebuildQueuedReason: '',
    lastRebuildResult: null,
    completeIndexStateListenerBound: false,
    completeIndexStateListener: null,
    completeIndexBoundaryStatus: 'disabled',
    completeIndexBoundaryRenderCount: 0,
    lastCoreProjectionChatKey: '',
    lastCacheMergeChatKey: '',
    lastCachePersistenceChatKey: '',
    lastCoreProjectedTotal: null,
    lastInternalMergeInputTotal: null,
    lastCacheMergeDecision: null,
    lastCachePersistenceDecision: null,
    lastActiveIndex: 0,
    gutterSyncQueue: new Map(),
    gutterSyncRaf: 0,
    marginSymbolsBridgeBound: false,
    marginSymbolsBridgeOff: null,
    washBridgeBound: false,
    washBridgeOff: null,
    viewBridgeBound: false,
    viewBridgeOff: null,
    washRepaintQueue: new Set(),
    washRepaintRaf: 0,
    washRepaintAll: false,
    washBridgeLastSig: '',
    washBridgeLastTs: 0,
    qWashStoreRaw: '',
    qWashStore: Object.create(null),
    lastAppliedViewMode: '',
    lastActiveBtnEl: null,
    lastActiveTurnIdFast: '',
    lastActiveBtnId: '',
    perfFullScanTick: 0,
    perfRebuildWindowTs: 0,
    perfRebuildTriggerCount: 0,
    selectedMiniDividerId: '',
    dividerDrag: null,
    collapsedMiniMapPagesByChat: new Map(),
    collapsedChatPagesByChat: new Map(),
    titleListChatPagesByChat: new Map(),
    chatPageStatusCardEl: null,
    chatPageStatusCardAnchor: null,
    chatPageMechanismsListener: null,
  };

  const PERF_SCOPE = {
    fullRenderDepth: 0,
    incrementalDepth: 0,
    dividerDepth: 0,
  };

  const UI_TOK = Object.freeze({
    OWNER: 'mnmp',
    COL: 'mnmp-col',
    WRAP: 'mnmp-wrap',
    BTN: 'mnmp-btn',
    QBTN: 'mnmp-qbtn',
    DIVIDER_LAYER: 'mnmp-divider-layer',
    DIVIDER: 'mnmp-divider',
    COL_LEGACY: 'mm-col',
    WRAP_LEGACY: 'mm-wrap',
    BTN_LEGACY: 'mm-btn',
    QBTN_LEGACY: 'mm-qbtn',
  });
  const EMPTY_RETRY_MAX = 8;
  const EMPTY_RETRY_GAP_MS = 180;
  const COLOR_BY_NAME = Object.freeze({
    blue: '#3A8BFF',
    red: '#FF4A4A',
    green: '#31D158',
    gold: '#FFD700',
    sky: '#4CD3FF',
    pink: '#FF71C6',
    purple: '#A36BFF',
    orange: '#FFA63A',
  });
  const EV_MARGIN_SYMBOLS_CHANGED = 'evt:h2o:margin:symbols:changed';
  const EV_VIEW_CHANGED = 'evt:h2o:minimap:view-changed';
  const CLS_HIDE_QWASH = 'cgx-mm-hide-qwash';
  const EV_WASH_CHANGED = Object.freeze([
    'evt:h2o:mm:wash_changed',
    'h2o:mm:wash_changed',
    'evt:h2o:wash:changed',
    'h2o:wash:changed',
    'evt:h2o:answer:wash',
    'h2o:answer:wash',
  ]);
  const FLASH_CLS = Object.freeze({
    WASH_WRAP: 'cgxui-mnmp-wash-wrap',
    WASH_WRAP_LEGACY: 'cgxui-wash-wrap',
    FLASH: 'cgxui-mnmp-flash',
    FLASH_LEGACY: 'cgxui-flash',
  });
  const KEY_MARGIN_SYMBOLS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols:v1';
  const KEY_MARGIN_SYMBOL_COLORS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols_colors:v1';
  const KEY_MARGIN_PINS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:state:pins:v1';
  const KEY_QWASH_FALLBACK = 'h2o:qwash:map:v1';
  const KEY_CUSTOM_DIVIDERS_SUFFIX = 'state:custom_dividers:chat';
  const KEY_COLLAPSED_PAGES_SUFFIX = 'ui:collapsed_pages:chat';
  const KEY_TURN_CACHE_META_SUFFIX = 'state:turn_cache_meta:chat';
  const KEY_TURN_CACHE_TURNS_SUFFIX = 'state:turn_cache:chat';
  const KEY_PAGE_LABEL_STYLE_SUFFIX = 'ui:page-label-style:v1';
  const KEY_PAGE_DIVIDERS_SUFFIX = 'ui:page-dividers:v1';
  const KEY_CHAT_PAGE_DIVIDERS_SUFFIX = 'ui:chat-pages:v1';
  const KEY_CHUB_CHAT_MECHANISMS_V1 = 'h2o:prm:cgx:cntrlhb:state:chat-mechanisms:v1';
  const EV_CHAT_MECHANISMS_CHANGED = 'evt:h2o:chat-mechanisms:changed';
  const EV_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EV_MM_INDEX_HYDRATED = 'evt:h2o:minimap:index:hydrated';
  const EV_MM_INDEX_APPENDED = 'evt:h2o:minimap:index:appended';
  const EV_MM_DIVIDER_CHANGED = 'evt:h2o:minimap:divider:changed';
  const EV_MM_DIVIDER_SELECTED = 'evt:h2o:minimap:divider:selected';
  const EFFECTIVE_TURN_RUNTIME_METHOD = Object.freeze({
    INDEX: ['getEffective', 'PresentationIndex'].join(''),
    STATUS: ['getEffective', 'PresentationStatus'].join(''),
    QID: ['getEffective', 'TurnRecordByQId'].join(''),
    AID: ['getEffective', 'TurnRecordByAId'].join(''),
  });
  const ATTR_PAGE_LABEL_STYLE = 'data-cgxui-page-label-style';
  const ATTR_PAGE_DIVIDERS = 'data-cgxui-page-dividers';
  const ATTR_CHAT_PAGE_DIVIDERS = 'data-cgxui-chat-pages';
  const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';
  const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
  const ATTR_CHAT_PAGE_COLLAPSED = 'data-cgxui-chat-page-collapsed';
  const ATTR_CHAT_PAGE_HIDDEN = 'data-cgxui-chat-page-hidden';
  const ATTR_CHAT_PAGE_TITLE_LIST = 'data-cgxui-chat-page-title-list';
  const ATTR_CHAT_PAGE_TITLE_STATE = 'data-cgxui-chat-page-title-state';
  const ATTR_CHAT_PAGE_QUESTION_HIDDEN = 'data-cgxui-chat-page-question-hidden';
  const PAGE_LABEL_STYLE_DEFAULT = 'pill';
  const PAGE_LABEL_STYLE_PILL = 'pill';

  // Manual divider: user-created, draggable MiniMap divider edited from Quick Controls.
  const MINI_DIVIDER_DEFAULT_COLOR = '#facc15';                 // 👈 new divider default color
  const MINI_DIVIDER_LAYOUT = Object.freeze({
    GAP_CENTER_RATIO: 0.5,                                      // 👈 base target inside each gap; 0.5 = center, lower = higher, higher = lower
    UPPER_BOX_CLEARANCE_PX: 0,                                  // 👈 minimum space kept below the upper box before the divider center can sit
    LOWER_BOX_CLEARANCE_PX: 0,                                  // 👈 minimum space kept above the lower box so the divider stays visually detached from its top edge
  });

  const PERF_ASSERT_ON = (() => {
    try { return String(localStorage.getItem('h2o:perf') || '') === '1'; } catch { return false; }
  })();

  function perfNow() {
    const n = Number(W.performance?.now?.() || Date.now());
    return Number.isFinite(n) ? n : 0;
  }

  function perfRoundMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 1000) / 1000;
  }

  function createDurationBucket() {
    return {
      count: 0,
      totalMs: 0,
      maxMs: 0,
      slowOver4Count: 0,
      slowOver8Count: 0,
      slowOver16Count: 0,
      slowOver50Count: 0,
    };
  }

  function createSummaryBucket() {
    return Object.assign(createDurationBucket(), {
      beforeBootCount: 0,
      afterBootCount: 0,
      lastReason: '',
      lastAt: 0,
    });
  }

  function createRenderUnitsBucket() {
    return {
      answerRows: 0,
      answerButtons: 0,
      questionButtons: 0,
      miniPageDividers: 0,
      overlayDividers: 0,
      chatPageDividers: 0,
      gutterSymbols: 0,
      washRepaints: 0,
      activeStateUpdates: 0,
      collapseVisualUpdates: 0,
      counterUpdates: 0,
      lastRenderUnit: '',
      lastAt: 0,
    };
  }

  function createNodeLifecycleBucket() {
    return {
      created: Object.create(null),
      reused: Object.create(null),
      removed: Object.create(null),
      repaired: Object.create(null),
      noOp: Object.create(null),
      lastAction: '',
      lastUnit: '',
      lastAt: 0,
    };
  }

  function createMiniMapCoreUiPerfState() {
    return {
      bootCompletedAt: 0,
      fullRender: Object.assign(createSummaryBucket(), {
        branches: Object.create(null),
      }),
      incrementalRefresh: Object.assign(createSummaryBucket(), {
        appendTurnStatuses: Object.create(null),
      }),
      dividerUi: Object.assign(createSummaryBucket(), {
        createdCount: 0,
        reusedCount: 0,
        removedCount: 0,
      }),
      domWriteCluster: createSummaryBucket(),
      renderUnits: createRenderUnitsBucket(),
      nodeLifecycle: createNodeLifecycleBucket(),
      paths: {
        ensureTurnButtons: createDurationBucket(),
        renderFromCache: createDurationBucket(),
        appendTurnFromAnswerEl: createDurationBucket(),
        syncTurnRowDom: createDurationBucket(),
        ensureQuestionBtnForWrap: createDurationBucket(),
        applyMiniMapPageUiPrefs: createDurationBucket(),
        applyMiniMapPageCollapsedState: createDurationBucket(),
        applyAllMiniMapPageCollapsedStates: createDurationBucket(),
        flushWashRepaintQueue: createDurationBucket(),
        flushMiniMapGutterQueue: createDurationBucket(),
        setActive: createDurationBucket(),
        updateToggleColor: createDurationBucket(),
        updateCounter: createDurationBucket(),
        renderMiniDividerOverlay: createDurationBucket(),
        renderChatPageDividers: createDurationBucket(),
      },
    };
  }

  function ensureMiniMapCoreUiPerfStateShape(target) {
    if (!target || typeof target !== 'object') return target;
    if (!target.paths || typeof target.paths !== 'object') target.paths = createMiniMapCoreUiPerfState().paths;
    if (!target.renderUnits || typeof target.renderUnits !== 'object') target.renderUnits = createRenderUnitsBucket();
    if (!target.nodeLifecycle || typeof target.nodeLifecycle !== 'object') target.nodeLifecycle = createNodeLifecycleBucket();
    if (!target.fullRender || typeof target.fullRender !== 'object') target.fullRender = Object.assign(createSummaryBucket(), { branches: Object.create(null) });
    if (!target.fullRender.branches || typeof target.fullRender.branches !== 'object') target.fullRender.branches = Object.create(null);
    if (!target.incrementalRefresh || typeof target.incrementalRefresh !== 'object') target.incrementalRefresh = Object.assign(createSummaryBucket(), { appendTurnStatuses: Object.create(null) });
    if (!target.incrementalRefresh.appendTurnStatuses || typeof target.incrementalRefresh.appendTurnStatuses !== 'object') target.incrementalRefresh.appendTurnStatuses = Object.create(null);
    if (!target.dividerUi || typeof target.dividerUi !== 'object') target.dividerUi = Object.assign(createSummaryBucket(), { createdCount: 0, reusedCount: 0, removedCount: 0 });
    if (!target.domWriteCluster || typeof target.domWriteCluster !== 'object') target.domWriteCluster = createSummaryBucket();
    return target;
  }

  function recordDuration(bucket, msRaw) {
    if (!bucket) return 0;
    const ms = Number(msRaw);
    if (!Number.isFinite(ms) || ms < 0) return 0;
    bucket.count = Number(bucket.count || 0) + 1;
    bucket.totalMs = Number(bucket.totalMs || 0) + ms;
    bucket.maxMs = Math.max(Number(bucket.maxMs || 0), ms);
    if (ms > 4) bucket.slowOver4Count = Number(bucket.slowOver4Count || 0) + 1;
    if (ms > 8) bucket.slowOver8Count = Number(bucket.slowOver8Count || 0) + 1;
    if (ms > 16) bucket.slowOver16Count = Number(bucket.slowOver16Count || 0) + 1;
    if (ms > 50) bucket.slowOver50Count = Number(bucket.slowOver50Count || 0) + 1;
    return ms;
  }

  function bumpCounter(obj, key, delta = 1) {
    if (!obj) return 0;
    const k = String(key || '');
    obj[k] = Number(obj[k] || 0) + Number(delta || 0);
    return obj[k];
  }

  function bumpReason(obj, key) {
    const reason = String(key || '').trim() || 'unknown';
    return bumpCounter(obj, reason);
  }

  function copyPlainCounts(obj) {
    const out = Object.create(null);
    for (const key of Object.keys(obj || {})) out[key] = Number(obj[key] || 0);
    return out;
  }

  function readDurationBucket(bucket) {
    const count = Number(bucket?.count || 0);
    const totalMs = Number(bucket?.totalMs || 0);
    return {
      count,
      totalMs: perfRoundMs(totalMs) ?? 0,
      avgMs: count > 0 ? perfRoundMs(totalMs / count) : null,
      maxMs: count > 0 ? perfRoundMs(bucket?.maxMs || 0) : null,
      slowOver4Count: Number(bucket?.slowOver4Count || 0),
      slowOver8Count: Number(bucket?.slowOver8Count || 0),
      slowOver16Count: Number(bucket?.slowOver16Count || 0),
      slowOver50Count: Number(bucket?.slowOver50Count || 0),
    };
  }

  function readSummaryBucket(bucket) {
    return Object.assign(readDurationBucket(bucket), {
      beforeBootCount: Number(bucket?.beforeBootCount || 0),
      afterBootCount: Number(bucket?.afterBootCount || 0),
      lastReason: String(bucket?.lastReason || ''),
      lastAt: Number(bucket?.lastAt || 0),
    });
  }

  function currentPerfPhase() {
    return Number(PERF.bootCompletedAt || 0) > 0 ? 'afterBoot' : 'beforeBoot';
  }

  function noteSummaryBucket(bucket, reason = '') {
    if (!bucket) return;
    if (currentPerfPhase() === 'afterBoot') bucket.afterBootCount = Number(bucket.afterBootCount || 0) + 1;
    else bucket.beforeBootCount = Number(bucket.beforeBootCount || 0) + 1;
    bucket.lastReason = String(reason || '');
    bucket.lastAt = Date.now();
  }

  function enterPerfOwner(kind) {
    if (kind === 'fullRender') {
      const owned = PERF_SCOPE.fullRenderDepth === 0;
      PERF_SCOPE.fullRenderDepth += 1;
      return owned;
    }
    if (kind === 'incremental') {
      const owned = PERF_SCOPE.fullRenderDepth === 0 && PERF_SCOPE.dividerDepth === 0 && PERF_SCOPE.incrementalDepth === 0;
      PERF_SCOPE.incrementalDepth += 1;
      return owned;
    }
    if (kind === 'divider') {
      const owned = PERF_SCOPE.fullRenderDepth === 0 && PERF_SCOPE.incrementalDepth === 0 && PERF_SCOPE.dividerDepth === 0;
      PERF_SCOPE.dividerDepth += 1;
      return owned;
    }
    return false;
  }

  function exitPerfOwner(kind) {
    if (kind === 'fullRender') PERF_SCOPE.fullRenderDepth = Math.max(0, PERF_SCOPE.fullRenderDepth - 1);
    else if (kind === 'incremental') PERF_SCOPE.incrementalDepth = Math.max(0, PERF_SCOPE.incrementalDepth - 1);
    else if (kind === 'divider') PERF_SCOPE.dividerDepth = Math.max(0, PERF_SCOPE.dividerDepth - 1);
  }

  function noteRenderUnit(unit, delta = 1) {
    if (!unit) return 0;
    const next = bumpCounter(PERF.renderUnits, unit, delta);
    PERF.renderUnits.lastRenderUnit = String(unit);
    PERF.renderUnits.lastAt = Date.now();
    return next;
  }

  function noteNodeLifecycle(kind, unit, delta = 1) {
    const bucket = PERF.nodeLifecycle?.[kind];
    if (!bucket || !unit) return 0;
    const next = bumpCounter(bucket, unit, delta);
    PERF.nodeLifecycle.lastAction = String(kind || '');
    PERF.nodeLifecycle.lastUnit = String(unit || '');
    PERF.nodeLifecycle.lastAt = Date.now();
    return next;
  }

  function resetMiniMapCoreUiPerfState(target) {
    if (!target) return target;
    const bootCompletedAt = Number(target.bootCompletedAt || 0) > 0 ? Number(target.bootCompletedAt || 0) : 0;
    const next = createMiniMapCoreUiPerfState();
    next.bootCompletedAt = bootCompletedAt;
    Object.keys(next).forEach((key) => { target[key] = next[key]; });
    return target;
  }

  function getMiniMapCoreUiPerfStats() {
    ensureMiniMapCoreUiPerfStateShape(PERF);
    const paths = Object.create(null);
    for (const key of Object.keys(PERF.paths || {})) paths[key] = readDurationBucket(PERF.paths[key]);
    return {
      bootCompletedAt: Number(PERF.bootCompletedAt || 0),
      fullRender: Object.assign(readSummaryBucket(PERF.fullRender), {
        branches: copyPlainCounts(PERF.fullRender?.branches),
      }),
      incrementalRefresh: Object.assign(readSummaryBucket(PERF.incrementalRefresh), {
        appendTurnStatuses: copyPlainCounts(PERF.incrementalRefresh?.appendTurnStatuses),
      }),
      dividerUi: Object.assign(readSummaryBucket(PERF.dividerUi), {
        createdCount: Number(PERF.dividerUi?.createdCount || 0),
        reusedCount: Number(PERF.dividerUi?.reusedCount || 0),
        removedCount: Number(PERF.dividerUi?.removedCount || 0),
      }),
      domWriteCluster: readSummaryBucket(PERF.domWriteCluster),
      renderUnits: {
        answerRows: Number(PERF.renderUnits?.answerRows || 0),
        answerButtons: Number(PERF.renderUnits?.answerButtons || 0),
        questionButtons: Number(PERF.renderUnits?.questionButtons || 0),
        miniPageDividers: Number(PERF.renderUnits?.miniPageDividers || 0),
        overlayDividers: Number(PERF.renderUnits?.overlayDividers || 0),
        chatPageDividers: Number(PERF.renderUnits?.chatPageDividers || 0),
        gutterSymbols: Number(PERF.renderUnits?.gutterSymbols || 0),
        washRepaints: Number(PERF.renderUnits?.washRepaints || 0),
        activeStateUpdates: Number(PERF.renderUnits?.activeStateUpdates || 0),
        collapseVisualUpdates: Number(PERF.renderUnits?.collapseVisualUpdates || 0),
        counterUpdates: Number(PERF.renderUnits?.counterUpdates || 0),
        lastRenderUnit: String(PERF.renderUnits?.lastRenderUnit || ''),
        lastAt: Number(PERF.renderUnits?.lastAt || 0),
      },
      nodeLifecycle: {
        created: copyPlainCounts(PERF.nodeLifecycle?.created),
        reused: copyPlainCounts(PERF.nodeLifecycle?.reused),
        removed: copyPlainCounts(PERF.nodeLifecycle?.removed),
        repaired: copyPlainCounts(PERF.nodeLifecycle?.repaired),
        noOp: copyPlainCounts(PERF.nodeLifecycle?.noOp),
        lastAction: String(PERF.nodeLifecycle?.lastAction || ''),
        lastUnit: String(PERF.nodeLifecycle?.lastUnit || ''),
        lastAt: Number(PERF.nodeLifecycle?.lastAt || 0),
      },
      paths,
    };
  }

  function warn(msg, extra) { try { console.warn('[MiniMap Core]', msg, extra || ''); } catch {} }

  function getRegs() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const SEL = SH?.SEL_ || SH?.registries?.SEL || W?.H2O?.SEL || {};
    return { SH, SEL };
  }

  function q(sel, root = document) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function escAttr(v) {
    const s = String(v || '');
    if (!s) return s;
    try { return (window.CSS?.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); } catch { return s; }
  }

  function qq(sel, root = document) {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  }

  function markPerfFullScan() {
    S.perfFullScanTick = Number(S.perfFullScanTick || 0) + 1;
  }

  function perfLog(label, payload = null) {
    if (!PERF_ASSERT_ON) return;
    try {
      console.debug(`[MiniMap][perf] ${label}`, payload || {});
    } catch {}
  }

  function perfReportDuration(label, t0, scanTick0, payload = null) {
    if (!PERF_ASSERT_ON) return;
    const elapsed = Math.max(0, Number(performance.now() - Number(t0 || 0)).toFixed(2));
    const scansTotal = Number(S.perfFullScanTick || 0);
    const scansDelta = Math.max(0, scansTotal - Number(scanTick0 || 0));
    perfLog(label, Object.assign({
      ms: elapsed,
      fullScansDelta: scansDelta,
      fullScansTotal: scansTotal,
    }, payload || {}));
  }

  function perfMarkRebuildTrigger(reason = '') {
    if (!PERF_ASSERT_ON) return;
    const now = Date.now();
    if (!S.perfRebuildWindowTs) S.perfRebuildWindowTs = now;
    S.perfRebuildTriggerCount = Number(S.perfRebuildTriggerCount || 0) + 1;
    const windowMs = Math.max(1, now - Number(S.perfRebuildWindowTs || now));
    const perMinute = Math.round((Number(S.perfRebuildTriggerCount || 0) * 60000) / windowMs);
    perfLog('rebuild.trigger', {
      reason: String(reason || ''),
      countInWindow: Number(S.perfRebuildTriggerCount || 0),
      windowMs,
      approxPerMinute: perMinute,
    });
    if (windowMs >= 60000) {
      S.perfRebuildWindowTs = now;
      S.perfRebuildTriggerCount = 0;
    }
  }

  function setStateToken(el, tok, on) {
    if (!el) return;
    const key = 'data-cgxui-state';
    const cur = String(el.getAttribute(key) || '').trim();
    const set = new Set(cur ? cur.split(/\s+/).filter(Boolean) : []);
    if (on) set.add(tok); else set.delete(tok);
    if (set.size) el.setAttribute(key, Array.from(set).join(' '));
    else el.removeAttribute(key);
  }

  function mmBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN || '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"]';
  }

  function getCoreViewMode() {
    try {
      const viaUi = String(MM_ui()?.getViewMode?.() || '').trim().toLowerCase();
      if (viaUi) return viaUi;
    } catch {}
    try {
      const viaPanel = String(MM_uiRefs()?.panel?.getAttribute?.('data-cgxui-view') || '').trim().toLowerCase();
      if (viaPanel) return viaPanel;
    } catch {}
    return 'classic';
  }

  function isQaViewActive() {
    return getCoreViewMode() === 'qa';
  }

  function getMiniMapRootEl() {
    try {
      const viaRefs = MM_uiRefs()?.root || null;
      if (viaRefs) return viaRefs;
    } catch {}
    return q('[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"], [data-h2o-owner="minimap-v10"]');
  }

  function qwashApi() {
    return TOPW?.H2O_QWASH_API || W?.H2O_QWASH_API || null;
  }

  function syncCurrentViewArtifacts(force = false) {
    const mode = String(getCoreViewMode() || 'classic').trim().toLowerCase() || 'classic';
    const refs = MM_uiRefs();
    const panel = refs?.panel || minimapPanel();
    if (panel) {
      try { panel.setAttribute('data-cgxui-view', mode); } catch {}
    }

    const root = refs?.root || getMiniMapRootEl();
    const hideQwash = mode === 'qa';
    if (root) {
      try { root.classList.toggle(CLS_HIDE_QWASH, hideQwash); } catch {}
    }

    if (!force && mode === String(S.lastAppliedViewMode || '').trim()) return mode;
    S.lastAppliedViewMode = mode;

    const api = qwashApi();
    if (hideQwash) {
      try { api?.clearMiniMap?.(); } catch {}
      try {
        collectMiniBtns().forEach((btn) => { clearQuestionWashMiniRing(btn); });
      } catch {}
    } else {
      try { api?.repaint?.('core:view-sync'); } catch {}
    }
    return mode;
  }

  function getWrapForMiniBtn(btn) {
    if (!btn) return null;
    return (
      btn.closest?.(`[data-cgxui="${UI_TOK.WRAP}"]`) ||
      btn.closest?.(`[data-cgxui="${UI_TOK.WRAP_LEGACY}"]`) ||
      btn.closest?.('.cgxui-mm-wrap') ||
      null
    );
  }

  function getQuestionBtnForWrap(wrap) {
    if (!wrap) return null;
    return (
      wrap.querySelector?.(`[data-cgxui="${UI_TOK.QBTN}"]`) ||
      wrap.querySelector?.(`[data-cgxui="${UI_TOK.QBTN_LEGACY}"]`) ||
      wrap.querySelector?.('.cgxui-mm-qbtn') ||
      null
    );
  }

  const MINI_MAP_NO_ANSWER_ATTR = 'data-cgxui-no-answer';

  function isCanonicalNoAnswerRecord(record = null) {
    if (!record || typeof record !== 'object') return false;
    if (record.noAnswer === true || record.hasAssistant === false) return true;
    const answerIds = Array.isArray(record.answerIds) ? record.answerIds : null;
    const primaryAId = String(record.primaryAId || record.answerId || '').trim();
    return !!answerIds && answerIds.length === 0 && !primaryAId;
  }

  function bareMiniMapTurnIdentity(turnId = '') {
    const value = String(turnId || '').trim();
    if (value.startsWith('turn:a:')) return value.slice(7).trim();
    if (value.startsWith('turn:')) return value.slice(5).trim();
    return value;
  }

  function isValidMiniMapAnswerCandidate(candidate, { turnId = '', questionId = '' } = {}) {
    const value = String(candidate || '').trim();
    if (!value || value.startsWith('turn:')) return false;

    const turnKey = String(turnId || '').trim();
    const questionKey = String(questionId || '').trim();
    const forbidden = new Set([
      turnKey,
      bareMiniMapTurnIdentity(turnKey),
      questionKey,
    ].filter(Boolean));
    if (forbidden.has(value)) return false;

    const api = getTurnRuntimeApi();
    try {
      if (api?.getTurnRecordByTurnId?.(value)) return false;
      if (api?.getTurnRecordByQId?.(value)) return false;
    } catch {}
    return true;
  }

  function getSharedTurnRecordByIdentity(kind, anyId) {
    const api = getTurnRuntimeApi();
    const key = String(anyId || '').trim();
    if (!api || !key) return null;
    try {
      if (selectedPathPresentationActive()) {
        if (kind === 'question') return callEffectiveTurnRuntime('QID', key);
        if (kind === 'answer') return callEffectiveTurnRuntime('AID', key);
        if (kind === 'turn' && key.startsWith('turn:')) {
          return callEffectiveTurnRuntime('QID', key.slice(5));
        }
        return null;
      }
      if (kind === 'turn') return api.getTurnRecordByTurnId?.(key) || null;
      if (kind === 'question') return api.getTurnRecordByQId?.(key) || null;
      if (kind === 'answer') return api.getTurnRecordByAId?.(key) || null;
    } catch {}
    return null;
  }

  function canonicalTurnIdentityProof(record = null, context = {}) {
    const canonicalQuestionId = String(record?.qId || record?.questionId || '').trim();
    const canonicalTurnId = String(record?.turnId || '').trim();
    const currentAnswerIds = new Set([
      record?.primaryAId,
      record?.answerId,
      ...(Array.isArray(record?.currentAnswerIds) ? record.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const questionId = String(context?.questionId || '').trim();
    const turnId = String(context?.turnId || '').trim();
    const answerId = String(context?.answerId || '').trim();

    if (!record || !canonicalQuestionId) return { proven: false, basis: 'canonical-record-missing' };
    if (canonicalTurnId && turnId && canonicalTurnId === turnId) {
      return { proven: true, basis: 'turn-id-exact' };
    }
    if (turnId && turnId === `turn:${canonicalQuestionId}`) {
      return { proven: true, basis: 'question-turn-id-exact' };
    }
    if (canonicalTurnId && turnId && canonicalTurnId !== turnId) {
      return { proven: false, basis: 'turn-id-conflict' };
    }
    if (questionId && questionId === canonicalQuestionId) {
      return { proven: true, basis: 'question-id-exact' };
    }
    if (questionId && questionId !== canonicalQuestionId) {
      return { proven: false, basis: 'question-id-conflict' };
    }
    if (!questionId && answerId && currentAnswerIds.has(answerId)) {
      return { proven: true, basis: 'current-answer-id-exact' };
    }
    return { proven: false, basis: 'alias-only' };
  }

  function shouldSuppressUnprovenCachedQuestion(row, turnId = '', questionId = '', identityProof = null) {
    const qId = String(questionId || '').trim();
    const id = String(turnId || '').trim();
    if (!qId || !id || identityProof?.proven) return false;
    if (cacheRowLayer(row) === 'history') return false;
    const proof = cacheRowCurrentProof(row);
    const suspect = row?.suspectQuestionIdentity === true || proof === CURRENT_PROOF_TRANSIENT;
    return suspect && id !== `turn:${qId}`;
  }

  function resolveQaRowCanonicalMeta(turn = null, { btn = null, wrap = null, qBtn = null, primaryAId = '' } = {}) {
    const directTurnId = String(
      turn?.turnId ||
      qBtn?.dataset?.turnId ||
      wrap?.dataset?.turnId ||
      btn?.dataset?.turnId ||
      ''
    ).trim();
    const directAnswerId = String(
      primaryAId ||
      turn?.answerId ||
      turn?.primaryAId ||
      qBtn?.dataset?.primaryAId ||
      wrap?.dataset?.primaryAId ||
      btn?.dataset?.primaryAId ||
      ''
    ).trim();
    const cachedQuestionId = String(
      turn?.questionId ||
      turn?.qId ||
      qBtn?.dataset?.questionId ||
      wrap?.dataset?.questionId ||
      ''
    ).trim();
    let turnIdx = Math.max(0, Number(
      turn?.index ||
      turn?.turnNo ||
      turn?.idx ||
      qBtn?.dataset?.turnIdx ||
      wrap?.dataset?.turnIdx ||
      btn?.dataset?.turnIdx ||
      0
    ) || 0);

    let record = getSharedTurnRecordByIdentity('turn', directTurnId);
    if (!record) record = getSharedTurnRecordByIdentity('question', cachedQuestionId);
    const directAnswerCandidate = isValidMiniMapAnswerCandidate(directAnswerId, {
      turnId: directTurnId,
      questionId: cachedQuestionId,
    }) ? directAnswerId : '';
    if (!record && directAnswerCandidate) {
      record = getSharedTurnRecordByIdentity('answer', directAnswerCandidate);
    }

    const canonicalQuestionId = String(record?.qId || record?.questionId || '').trim();
    const identityProof = canonicalTurnIdentityProof(record, {
      turnId: directTurnId,
      questionId: cachedQuestionId,
      answerId: directAnswerCandidate,
    });
    const resolvedRecord = identityProof.proven ? record : null;
    const suppressCachedQuestion = shouldSuppressUnprovenCachedQuestion(
      turn,
      directTurnId,
      cachedQuestionId,
      identityProof,
    );
    const questionId = String(
      (identityProof.proven ? canonicalQuestionId : '')
      || (suppressCachedQuestion ? '' : cachedQuestionId)
    ).trim();
    const noAnswer = isCanonicalNoAnswerRecord(resolvedRecord || turn);
    const turnId = String(
      resolvedRecord?.turnId ||
      directTurnId ||
      (noAnswer && questionId ? `turn:${questionId}` : '')
    ).trim();
    const answerId = noAnswer
      ? ''
      : String(resolvedRecord?.primaryAId || resolvedRecord?.answerId || (
          isValidMiniMapAnswerCandidate(directAnswerCandidate, { turnId, questionId })
            ? directAnswerCandidate
            : ''
        )).trim();
    if (!turnIdx) {
      turnIdx = Math.max(0, Number(resolvedRecord?.turnNo || resolvedRecord?.idx || resolvedRecord?.index || 0) || 0);
    }

    return {
      record,
      turnId,
      answerId,
      questionId,
      canonicalQuestionId,
      cachedQuestionId,
      canonicalMatchProven: identityProof.proven,
      canonicalMatchBasis: identityProof.basis,
      cachedQuestionSuppressed: suppressCachedQuestion,
      noAnswer,
      hasAssistant: noAnswer ? false : resolvedRecord?.hasAssistant,
      turnIdx,
      questionEl: resolvedRecord?.questionEl || resolvedRecord?.qEl || resolvedRecord?.live?.qEl || turn?.questionEl || turn?.qEl || turn?.live?.qEl || null,
    };
  }

  function backfillQaRowMeta(wrap, qBtn, meta = null) {
    if (!meta) return false;
    const turnId = String(meta?.turnId || '').trim();
    const answerId = String(meta?.answerId || meta?.primaryAId || '').trim();
    const questionId = String(
      meta?.questionId
      || (meta?.cachedQuestionSuppressed ? '' : (meta?.canonicalQuestionId || meta?.cachedQuestionId))
      || ''
    ).trim();
    const turnIdx = Math.max(0, Number(meta?.turnIdx || meta?.index || 0) || 0);
    const idx = turnIdx > 0 ? String(turnIdx) : '';

    if (wrap) {
      wrap.dataset.turnId = turnId;
      if (answerId) wrap.dataset.primaryAId = answerId;
      else delete wrap.dataset.primaryAId;
      if (questionId) wrap.dataset.questionId = questionId;
      else delete wrap.dataset.questionId;
      if (idx) wrap.dataset.turnIdx = idx;
      else delete wrap.dataset.turnIdx;
    }

    if (qBtn) {
      qBtn.dataset.turnId = turnId;
      if (answerId) qBtn.dataset.primaryAId = answerId;
      else delete qBtn.dataset.primaryAId;
      if (questionId) qBtn.dataset.questionId = questionId;
      else delete qBtn.dataset.questionId;
      if (idx) qBtn.dataset.turnIdx = idx;
      else delete qBtn.dataset.turnIdx;
    }

    return true;
  }

  function syncWrapMeta(wrap, turn, band, qaMeta = null) {
    if (!wrap) return null;
    const meta = qaMeta || resolveQaRowCanonicalMeta(turn, { wrap });
    const turnIdx = Math.max(0, Number(meta?.turnIdx || turn?.index || 0) || 0);
    const questionId = String(meta?.questionId || '').trim();
    const turnId = String(meta?.turnId || turn?.turnId || '').trim();
    const answerId = String(meta?.answerId || '').trim();
    const pageNum = Math.max(1, Math.ceil(Math.max(1, turnIdx || 1) / 25));
    wrap.dataset.turnIdx = String(turnIdx);
    wrap.dataset.pageNum = String(pageNum);
    wrap.dataset.pageBand = String(band || getTurnPageBand(turnIdx || turn?.index || 0));
    wrap.dataset.turnId = turnId;
    if (answerId) wrap.dataset.primaryAId = answerId;
    else delete wrap.dataset.primaryAId;
    if (questionId) wrap.dataset.questionId = questionId;
    else delete wrap.dataset.questionId;
    return wrap;
  }

  function syncAnswerBtnMeta(btn, turn, band, qaMeta = null) {
    if (!btn) return null;
    const meta = qaMeta || resolveQaRowCanonicalMeta(turn, {
      btn,
      wrap: getWrapForMiniBtn(btn),
      primaryAId: turn?.answerId || turn?.primaryAId || '',
    });
    const turnId = String(meta?.turnId || turn?.turnId || '').trim();
    const answerId = String(meta?.answerId || '').trim();
    const idxNum = Math.max(0, Number(meta?.turnIdx || turn?.index || 0) || 0);
    const idx = String(idxNum);
    const pageNum = String(Math.max(1, Math.ceil(Math.max(1, idxNum || 1) / 25)));
    const pageBand = String(band || getTurnPageBand(idxNum));

    btn.dataset.id = turnId;
    btn.dataset.turnId = turnId;
    if (answerId) btn.dataset.primaryAId = answerId;
    else delete btn.dataset.primaryAId;
    if (meta?.noAnswer) btn.setAttribute(MINI_MAP_NO_ANSWER_ATTR, '1');
    else btn.removeAttribute(MINI_MAP_NO_ANSWER_ATTR);
    btn.dataset.turnIdx = idx;
    btn.dataset.pageNum = pageNum;
    btn.dataset.pageBand = pageBand;
    btn.dataset.surfaceRole = 'answer';
    btn.setAttribute('aria-label', `Go to answer ${idx || ''}`);

    const num = btn.querySelector('.cgxui-mm-num');
    if (num) num.textContent = String(idxNum || '');
    return btn;
  }

  function syncQuestionBtnMeta(qBtn, turn, band, qaMeta = null) {
    if (!qBtn) return null;
    const meta = qaMeta || resolveQaRowCanonicalMeta(turn, { wrap: getWrapForMiniBtn(qBtn), qBtn });
    const turnId = String(meta?.turnId || turn?.turnId || '').trim();
    const answerId = String(meta?.answerId || '').trim();
    const questionId = String(meta?.questionId || '').trim();
    const idxNum = Math.max(0, Number(meta?.turnIdx || turn?.index || 0) || 0);
    const idx = String(idxNum);
    const pageNum = String(Math.max(1, Math.ceil(Math.max(1, idxNum || 1) / 25)));
    const pageBand = String(band || getTurnPageBand(idxNum || turn?.index || 0));

    qBtn.dataset.turnId = turnId;
    if (answerId) qBtn.dataset.primaryAId = answerId;
    else delete qBtn.dataset.primaryAId;
    if (questionId) qBtn.dataset.questionId = questionId;
    else delete qBtn.dataset.questionId;
    qBtn.dataset.turnIdx = idx;
    qBtn.dataset.pageNum = pageNum;
    qBtn.dataset.pageBand = pageBand;
    qBtn.dataset.surfaceRole = 'question';
    qBtn.setAttribute('aria-label', `Go to question ${idx || ''}`);
    qBtn.textContent = '';
    return qBtn;
  }

  function ensureQuestionBtnForWrap(wrap, turn, band, enabled = isQaViewActive(), qaMeta = null) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      if (!wrap) {
        noteNodeLifecycle('noOp', 'questionButtons');
        return null;
      }

      let qBtn = getQuestionBtnForWrap(wrap);

      if (!enabled) {
        if (qBtn) {
          qBtn.remove();
          noteNodeLifecycle('removed', 'questionButtons');
        } else {
          noteNodeLifecycle('noOp', 'questionButtons');
        }
        return null;
      }

      if (!qBtn) {
        qBtn = document.createElement('button');
        qBtn.type = 'button';
        qBtn.className = 'cgxui-mm-qbtn';
        qBtn.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
        qBtn.setAttribute('data-cgxui', UI_TOK.QBTN);
        noteNodeLifecycle('created', 'questionButtons');
      } else {
        noteNodeLifecycle('reused', 'questionButtons');
      }

      syncQuestionBtnMeta(qBtn, turn, band, qaMeta);
      backfillQaRowMeta(wrap, qBtn, qaMeta);

      if (wrap.firstChild !== qBtn) {
        wrap.insertBefore(qBtn, wrap.firstChild || null);
      }
      noteRenderUnit('questionButtons');
      return qBtn;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.ensureQuestionBtnForWrap, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'ensureQuestionBtnForWrap');
      }
      exitPerfOwner('incremental');
    }
  }

  function syncTurnRowDom(btn, turn, { qaEnabled = isQaViewActive() } = {}) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      if (!btn || !turn) return { wrap: null, qBtn: null, btn: btn || null };
      const wrap = getWrapForMiniBtn(btn);
      const qaMeta = resolveQaRowCanonicalMeta(turn, { btn, wrap, primaryAId: turn?.answerId || turn?.primaryAId || '' });
      const band = getTurnPageBand(qaMeta?.turnIdx || turn.index);

      syncAnswerBtnMeta(btn, turn, band, qaMeta);
      syncWrapMeta(wrap, turn, band, qaMeta);

      const qBtn = ensureQuestionBtnForWrap(wrap, turn, band, qaEnabled, qaMeta);
      backfillQaRowMeta(wrap, qBtn, qaMeta);
      return { wrap, qBtn, btn };
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.syncTurnRowDom, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'syncTurnRowDom');
      }
      exitPerfOwner('incremental');
    }
  }

  function setPeerQuestionActiveFromAnswerBtn(btn, on) {
    const wrap = getWrapForMiniBtn(btn);
    const qBtn = getQuestionBtnForWrap(wrap);
    if (!qBtn) return false;
    const active = !!on;
    qBtn.classList.toggle('inview', active);
    setStateToken(qBtn, 'peer-active', active);
    if (active) qBtn.setAttribute('data-cgxui-inview', '1');
    else qBtn.removeAttribute('data-cgxui-inview');
    return true;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function luminance({ r, g, b }) {
    const srgb = [r, g, b].map((v0) => {
      let v = Number(v0) || 0;
      v /= 255;
      return v <= 0.03928 ? (v / 12.92) : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function bestTextColor(bgHex) {
    const L = luminance(hexToRgb(bgHex || '#222'));
    return L > 0.5 ? '#111' : '#fff';
  }

  function normalizeQuestionWashColorId(input) {
    const id = String(input || '').trim().toLowerCase();
    return COLOR_BY_NAME[id] ? id : '';
  }

  function isStableQuestionId(v) {
    const id = String(v || '').trim().replace(/^conversation-turn-/, '');
    if (!id || id.length < 6) return false;
    if (/^(?:user|assistant|message)$/i.test(id)) return false;
    return true;
  }

  function getStableQuestionIdFromElement(el) {
    if (!el || !(el instanceof Element)) return '';

    const qwrapNode = (
      el.closest?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      el.querySelector?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      null
    );
    if (qwrapNode) {
      const qwrapId = String(
        qwrapNode.getAttribute?.('data-h2o-qwrap-id')
        || qwrapNode.getAttribute?.('data-ho-qwrap-id')
        || qwrapNode.dataset?.h2oQwrapId
        || qwrapNode.dataset?.hoQwrapId
        || ''
      ).trim();
      if (isStableQuestionId(qwrapId)) return qwrapId;
    }

    try {
      const qId = TOPW?.H2O?.index?.getQId?.(el) || W?.H2O?.index?.getQId?.(el) || '';
      const normalized = String(qId || '').trim();
      if (isStableQuestionId(normalized)) return normalized;
    } catch {}

    try {
      const textEl =
        el.querySelector?.('.cgxui-qswr-text') ||
        el.querySelector?.('.whitespace-pre-wrap') ||
        null;
      const qwrapId =
        W?.H2O_getStableQwrapId?.(el, textEl) ||
        TOPW?.H2O_getStableQwrapId?.(el, textEl) ||
        '';
      const normalized = String(qwrapId || '').trim();
      if (isStableQuestionId(normalized)) return normalized;
    } catch {}

    const attrs = [
      'data-h2o-qwrap-id',
      'data-ho-qwrap-id',
      'data-h2o-uid',
      'data-ho-uid',
      'data-message-id',
      'data-turn-id',
      'id',
    ];
    const roots = [
      el,
      el.closest?.('[data-message-author-role], [data-author-role], [data-role], [data-message-id], [data-turn-id]') || null,
    ].filter(Boolean);

    for (const root of roots) {
      for (const attr of attrs) {
        const raw = String(root.getAttribute?.(attr) || '').trim().replace(/^conversation-turn-/, '');
        if (isStableQuestionId(raw)) return raw;
      }
    }
    return '';
  }

  function readQuestionWashCssVar(el, prop) {
    if (!el || !(el instanceof Element) || !prop) return '';
    try {
      const direct = String(el.style?.getPropertyValue(prop) || '').trim();
      if (direct) return direct;
    } catch {}
    try {
      const computed = String(W.getComputedStyle(el).getPropertyValue(prop) || '').trim();
      if (computed) return computed;
    } catch {}
    return '';
  }

  function resolveQuestionWashColorFromElement(questionEl) {
    if (!questionEl || !(questionEl instanceof Element)) return '';
    const candidates = [];
    const push = (el) => {
      if (el instanceof Element && !candidates.includes(el)) candidates.push(el);
    };
    push(questionEl);
    push(questionEl.closest?.('.cgxq-qwash-on') || null);
    push(questionEl.querySelector?.('.cgxq-qwash-on') || null);
    try {
      Array.from(questionEl.querySelectorAll?.('.cgxq-qwash-on') || []).slice(0, 4).forEach(push);
    } catch {}

    for (const el of candidates) {
      for (const prop of ['--cgxq-qwash-wash-edge', '--cgxq-qwash-wash-deep', '--cgxq-qwash-wash']) {
        const raw = readQuestionWashCssVar(el, prop);
        if (raw && raw !== 'transparent') return raw;
      }
    }
    return '';
  }

  function coerceQuestionWashEntry(rawEntry) {
    if (rawEntry == null) return null;
    if (typeof rawEntry === 'string') {
      const colorId = normalizeQuestionWashColorId(rawEntry);
      return colorId ? { colorId } : null;
    }
    if (typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
    const colorId = normalizeQuestionWashColorId(
      rawEntry.colorId ?? rawEntry.color ?? rawEntry.colorName ?? rawEntry.name ?? rawEntry.c
    );
    return colorId ? { colorId } : null;
  }

  function getQuestionWashStore() {
    let raw = '';
    try { raw = String(W.localStorage?.getItem(KEY_QWASH_FALLBACK) || ''); } catch {}
    if (raw === S.qWashStoreRaw && S.qWashStore && typeof S.qWashStore === 'object') {
      return S.qWashStore;
    }

    const nextStore = Object.create(null);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([rawKey, rawEntry]) => {
            const key = String(rawKey || '').trim();
            const entry = coerceQuestionWashEntry(rawEntry);
            if (key && entry) nextStore[key] = entry;
          });
        }
      } catch {}
    }

    S.qWashStoreRaw = raw;
    S.qWashStore = nextStore;
    return nextStore;
  }

  function questionWashScopeKey() {
    try {
      const m = String(W.location.pathname || '').match(/\/c\/([^/]+)/);
      if (m && m[1]) return `c:${m[1]}`;
      return String(W.location.pathname || '/');
    } catch {
      return '/';
    }
  }

  function resolveMiniBtnWashState(primaryAId, btnEl = null) {
    const id = String(
      primaryAId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!id) {
      return { id: '', colorName: null, bg: null, isGold: false, paintBg: '', text: '' };
    }
    const washMap = (W?.H2O?.MM?.washMap && typeof W.H2O.MM.washMap === 'object') ? W.H2O.MM.washMap : null;
    if (!washMap) {
      return { id, colorName: null, bg: null, isGold: false, paintBg: '', text: '' };
    }

    const rawName = washMap?.[id];
    const norm = String(rawName || '').trim().toLowerCase();
    const colorName = norm && COLOR_BY_NAME[norm] ? norm : null;
    if (rawName && !colorName) {
      try { delete washMap[id]; } catch {}
    }

    const bg = colorName ? (COLOR_BY_NAME?.[colorName] || null) : null;
    const isGold = !!bg && (colorName === 'gold' || String(bg).toUpperCase() === '#FFD700');
    const paintBg = bg ? (isGold ? '#E6C200' : bg) : '';
    const text = bg ? bestTextColor(paintBg) : '';
    return { id, colorName, bg, isGold, paintBg, text };
  }

  function resolveQuestionBtnWashState(primaryAId, qBtn = null) {
    const store = getQuestionWashStore();
    const btn = qBtn || null;
    const wrap = getWrapForMiniBtn(btn);
    const meta = resolveQaRowCanonicalMeta(null, { qBtn: btn, wrap, primaryAId });
    backfillQaRowMeta(wrap, btn, meta);

    const canonicalQuestionId = String(meta?.canonicalQuestionId || '').trim();
    const cachedQuestionId = String(meta?.cachedQuestionId || '').trim();
    let questionId = String(canonicalQuestionId || cachedQuestionId || '').trim();
    const turnId = String(meta?.turnId || '').trim();
    let turnIdx = Math.max(0, Number(meta?.turnIdx || 0) || 0);
    if (!turnIdx) {
      const turnApi = TOPW?.H2O?.turn || W?.H2O?.turn || null;
      if (!turnIdx && questionId && typeof turnApi?.getTurnIndexByQId === 'function') {
        try { turnIdx = Math.max(0, Number(turnApi.getTurnIndexByQId(questionId) || 0) || 0); } catch {}
      }
    }

    const keys = [];
    const pushKey = (rawKey) => {
      const key = String(rawKey || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    };
    pushKey(canonicalQuestionId ? `id:${canonicalQuestionId}` : '');
    if (cachedQuestionId && cachedQuestionId !== canonicalQuestionId) {
      pushKey(`id:${cachedQuestionId}`);
    }
    pushKey(turnId ? `id:${turnId}` : '');
    if (turnIdx > 0) {
      pushKey(`ord:${questionWashScopeKey()}:${turnIdx}`);
    }

    let entry = null;
    let matchedKey = '';
    for (const key of keys) {
      if (!store[key]) continue;
      entry = store[key];
      matchedKey = key;
      break;
    }

    let stableQuestionId = '';
    if (!entry) {
      stableQuestionId = getStableQuestionIdFromElement(meta?.questionEl || null);
      if (!questionId && stableQuestionId) questionId = stableQuestionId;
      if (stableQuestionId && stableQuestionId !== canonicalQuestionId && stableQuestionId !== cachedQuestionId) {
        const liveKey = `id:${stableQuestionId}`;
        if (store[liveKey]) {
          entry = store[liveKey];
          matchedKey = liveKey;
        }
      }
    }

    const colorName = normalizeQuestionWashColorId(entry?.colorId);
    const liveBg = colorName ? '' : resolveQuestionWashColorFromElement(meta?.questionEl || null);
    const bg = colorName ? (COLOR_BY_NAME[colorName] || null) : (liveBg || null);
    return {
      matchedKey,
      answerId: String(meta?.answerId || '').trim(),
      questionId,
      stableQuestionId,
      turnId,
      turnIdx,
      colorName: colorName || null,
      bg,
    };
  }

  function clearQuestionWashMiniRing(btnEl) {
    if (!btnEl) return false;
    const num = btnEl.querySelector?.('.cgxui-mm-num') || null;
    if (!num) return false;
    try { num.classList.remove('cgxq-qwash-mm-num-on'); } catch {}
    try {
      num.style.removeProperty('--cgxq-qwash-mm-ring');
      num.style.removeProperty('--cgxq-qwash-mm-fill');
      num.style.removeProperty('display');
      num.style.removeProperty('align-items');
      num.style.removeProperty('justify-content');
      num.style.removeProperty('min-width');
      num.style.removeProperty('height');
      num.style.removeProperty('padding');
      num.style.removeProperty('box-sizing');
      num.style.removeProperty('line-height');
      num.style.removeProperty('border-radius');
      num.style.removeProperty('border');
      num.style.removeProperty('background');
      num.style.removeProperty('color');
      num.style.removeProperty('box-shadow');
    } catch {}
    return true;
  }

  function clearMiniBtnWashVisual(btnEl) {
    if (!btnEl) return false;
    try { delete btnEl.dataset.wash; } catch {}
    try { btnEl.removeAttribute('data-cgxui-wash'); } catch {}
    try {
      btnEl.style.removeProperty('background');
      btnEl.style.removeProperty('color');
      btnEl.style.removeProperty('text-shadow');
      btnEl.style.removeProperty('box-shadow');
      btnEl.style.removeProperty('--cgxui-mnmp-q-wash-color');
    } catch {}
    try {
      for (const cls of Array.from(btnEl.classList || [])) {
        if (!cls) continue;
        if (cls.startsWith('cgxui-mnmp-wash-') || cls.startsWith('cgxui-wash-')) {
          btnEl.classList.remove(cls);
        }
      }
    } catch {}
    return true;
  }

  function applyQaWashToQuestionBtn(primaryAId, qBtn) {
    if (!qBtn) return false;
    const wrap = getWrapForMiniBtn(qBtn);
    const wash = resolveQuestionBtnWashState(primaryAId, qBtn);
    backfillQaRowMeta(wrap, qBtn, wash);
    clearMiniBtnWashVisual(qBtn);
    if (!wash.bg) return false;
    qBtn.dataset.wash = 'true';
    try { qBtn.setAttribute('data-cgxui-wash', '1'); } catch {}
    try { qBtn.style.setProperty('--cgxui-mnmp-q-wash-color', wash.bg); } catch {}
    return true;
  }

  function fallbackApplyWashToMiniBtn(primaryAId, btnEl) {
    if (!btnEl) return false;
    const wash = resolveMiniBtnWashState(primaryAId, btnEl);
    if (!wash.id) return false;

    const { bg, isGold, paintBg, text } = wash;
    if (bg) {
      btnEl.style.background = `linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10)), ${paintBg}`;
      btnEl.style.color = text;
      btnEl.style.textShadow = (text === '#fff')
        ? '0 0 2px rgba(0,0,0,.35)'
        : '0 1px 0 rgba(255,255,255,.35)';
      btnEl.style.boxShadow = isGold
        ? '0 0 5px 1px rgba(255,215,0,0.30)'
        : `0 0 6px 2px ${bg}40`;
      btnEl.dataset.wash = 'true';
      try { btnEl.setAttribute('data-cgxui-wash', '1'); } catch {}
    } else {
      btnEl.style.background = 'rgba(255,255,255,.06)';
      btnEl.style.color = '#e5e7eb';
      btnEl.style.textShadow = '0 0 2px rgba(0,0,0,.25)';
      btnEl.style.boxShadow = 'none';
      btnEl.dataset.wash = 'false';
      try { btnEl.removeAttribute('data-cgxui-wash'); } catch {}
    }
    return true;
  }

  function applyWashToMiniBtn(primaryAId, btnEl) {
    const id = String(
      primaryAId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!btnEl || !id) return false;

    try {
      const sharedApply = TOPW.H2O_MM_SHARED?.get?.()?.util?.mmApplyWashToBtn;
      if (typeof sharedApply === 'function') {
        const arity = Number(sharedApply.length || 0);
        if (arity >= 3) {
          sharedApply(id, btnEl, fallbackApplyWashToMiniBtn);
          return true;
        }
        const out = sharedApply(id, btnEl);
        if (out === false) return !!fallbackApplyWashToMiniBtn(id, btnEl);
        if (out == null) {
          try { fallbackApplyWashToMiniBtn(id, btnEl); } catch {}
        }
        return true;
      }
    } catch {}

    try {
      const washApi = W?.H2O?.MM?.wash;
      if (washApi && typeof washApi.applyToMiniBtn === 'function') {
        washApi.applyToMiniBtn(id, btnEl);
        return true;
      }
    } catch {}

    return !!fallbackApplyWashToMiniBtn(id, btnEl);
  }

  function collectMiniBtns() {
    const out = [];
    const seen = new Set();

    try {
      const map = ensureMapStore();
      for (const btn of map.values()) {
        if (!btn || !btn.isConnected || seen.has(btn)) continue;
        seen.add(btn);
        out.push(btn);
      }
    } catch {}
    if (out.length) return out;

    let scanRoot = null;
    try { scanRoot = minimapCol(MM_uiRefs()?.panel || null) || null; } catch {}
    if (!scanRoot) {
      try {
        const panel = minimapPanel();
        scanRoot = minimapCol(panel) || panel || null;
      } catch {}
    }
    if (!scanRoot) scanRoot = document;
    markPerfFullScan();
    for (const btn of qq(mmBtnSelector(), scanRoot)) {
      if (!btn || seen.has(btn)) continue;
      seen.add(btn);
      out.push(btn);
    }
    return out;
  }

  function washEventSig(detail) {
    const all = detail?.all === true || detail?.full === true;
    const color = String(detail?.colorName ?? detail?.color ?? '').trim();
    if (all) return `all|${color}`;
    const ids = extractWashEventIds(detail).sort();
    if (!ids.length && !color) return '';
    return `${ids.join(',')}|${color}`;
  }

  function repaintMiniBtnByAnswerId(anyId, btnEl = null) {
    const key = String(
      anyId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!key) return false;
    const btn = btnEl || getBtnById(key);
    if (!btn) return false;
    const primaryAId = String(btn?.dataset?.primaryAId || key).trim();
    if (!primaryAId) return false;
    const wrap = getWrapForMiniBtn(btn);
    const qBtn = getQuestionBtnForWrap(wrap);

    if (isQaViewActive()) {
      const qaMeta = resolveQaRowCanonicalMeta(null, { btn, wrap, qBtn, primaryAId });
      backfillQaRowMeta(wrap, qBtn, qaMeta);
      clearMiniBtnWashVisual(btn);
      clearQuestionWashMiniRing(btn);
      applyWashToMiniBtn(primaryAId, btn);
      applyQaWashToQuestionBtn(primaryAId, qBtn);
      return true;
    }

    clearMiniBtnWashVisual(qBtn);
    return !!applyWashToMiniBtn(primaryAId, btn);
  }

  function repaintAllMiniBtns() {
    let painted = 0;
    for (const btn of collectMiniBtns()) {
      const id = String(
        btn?.dataset?.primaryAId ||
        btn?.dataset?.id ||
        btn?.dataset?.turnId ||
        ''
      ).trim();
      if (!id) continue;
      if (repaintMiniBtnByAnswerId(id, btn)) painted += 1;
    }
    return painted;
  }

  function extractWashEventIds(detail) {
    const ids = new Set();
    const push = (v) => {
      const s = String(v || '').trim();
      if (s) ids.add(s);
    };
    push(detail?.primaryAId);
    push(detail?.answerId);
    push(detail?.id);
    push(detail?.turnId);
    const buckets = [detail?.primaryAIds, detail?.answerIds, detail?.ids, detail?.turnIds];
    for (const arr of buckets) {
      if (!Array.isArray(arr)) continue;
      for (const v of arr) push(v);
    }
    return Array.from(ids);
  }

  function flushWashRepaintQueue() {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      S.washRepaintRaf = 0;
      const repaintAll = !!S.washRepaintAll;
      S.washRepaintAll = false;
      const ids = Array.from(S.washRepaintQueue.values());
      S.washRepaintQueue.clear();

      if (repaintAll || !ids.length) {
        const repainted = Number(repaintAllMiniBtns() || 0);
        if (repainted > 0) noteRenderUnit('washRepaints', repainted);
        try {
          const activeBtn = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
          const activeId = String(activeBtn?.dataset?.turnId || activeBtn?.dataset?.primaryAId || '').trim();
          if (activeId) updateToggleColor(activeId);
        } catch {}
        return true;
      }

      for (const id of ids) {
        try { repaintMiniBtnByAnswerId(id); } catch {}
      }
      if (ids.length) noteRenderUnit('washRepaints', ids.length);
      try { updateToggleColor(ids[0] || ''); } catch {}
      return true;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.flushWashRepaintQueue, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'flushWashRepaintQueue');
      }
      exitPerfOwner('incremental');
    }
  }

  function scheduleWashRepaint(ids = null) {
    if (ids == null) S.washRepaintAll = true;
    else if (Array.isArray(ids)) {
      for (const raw of ids) {
        const id = String(raw || '').trim();
        if (id) S.washRepaintQueue.add(id);
      }
      if (!S.washRepaintQueue.size) S.washRepaintAll = true;
    } else {
      const id = String(ids || '').trim();
      if (id) S.washRepaintQueue.add(id);
      else S.washRepaintAll = true;
    }
    if (S.washRepaintRaf) return true;
    S.washRepaintRaf = requestAnimationFrame(flushWashRepaintQueue);
    return true;
  }

  function bindWashBridge() {
    if (S.washBridgeBound) return true;

    const onWashChanged = (ev) => {
      const detail = ev?.detail || {};
      const sig = washEventSig(detail);
      if (sig) {
        const now = performance.now();
        if (sig === S.washBridgeLastSig && (now - S.washBridgeLastTs) < 45) return;
        S.washBridgeLastSig = sig;
        S.washBridgeLastTs = now;
      }
      if (detail?.all === true || detail?.full === true) {
        scheduleWashRepaint();
        return;
      }
      const ids = extractWashEventIds(detail);
      if (ids.length) scheduleWashRepaint(ids);
      else scheduleWashRepaint();
    };

    for (const evtName of EV_WASH_CHANGED) {
      window.addEventListener(evtName, onWashChanged);
    }

    S.washBridgeOff = () => {
      for (const evtName of EV_WASH_CHANGED) {
        try { window.removeEventListener(evtName, onWashChanged); } catch {}
      }
      if (S.washRepaintRaf) {
        try { cancelAnimationFrame(S.washRepaintRaf); } catch {}
      }
      S.washRepaintRaf = 0;
      S.washRepaintAll = false;
      S.washRepaintQueue.clear();
      S.washBridgeLastSig = '';
      S.washBridgeLastTs = 0;
    };
    S.washBridgeBound = true;
    return true;
  }

  function unbindWashBridge() {
    try { S.washBridgeOff?.(); } catch {}
    S.washBridgeOff = null;
    S.washBridgeBound = false;
  }

  function bindViewBridge() {
    if (S.viewBridgeBound) return true;

    const onViewChanged = () => {
      try { syncCurrentViewArtifacts(true); } catch {}
      scheduleWashRepaint();
    };

    window.addEventListener(EV_VIEW_CHANGED, onViewChanged);
    if (EV_VIEW_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_VIEW_CHANGED.slice(4), onViewChanged);
    }

    S.viewBridgeOff = () => {
      try { window.removeEventListener(EV_VIEW_CHANGED, onViewChanged); } catch {}
      if (EV_VIEW_CHANGED.startsWith('evt:')) {
        try { window.removeEventListener(EV_VIEW_CHANGED.slice(4), onViewChanged); } catch {}
      }
    };
    S.viewBridgeBound = true;
    return true;
  }

  function unbindViewBridge() {
    try { S.viewBridgeOff?.(); } catch {}
    S.viewBridgeOff = null;
    S.viewBridgeBound = false;
  }

  function getUiRefs() {
    try {
      return MM_uiRefs();
    } catch {
      return {};
    }
  }

  function safeDiag(kind, msg, extra) {
    try { TOPW.H2O_MM_DIAG?.[kind]?.(msg, extra); } catch {}
  }

  function counterEl() {
    const refs = getUiRefs();
    if (refs.counter && refs.counter.isConnected) return refs.counter;
    return q('[data-cgxui$="counter"]');
  }

  function toggleEl() {
    const { SEL } = getRegs();
    const refs = getUiRefs();
    return refs.toggle || q(SEL.MM_TOGGLE || '') || q('[data-cgxui$="toggle"]');
  }

  function toggleCountEl() {
    const { SEL } = getRegs();
    const tg = toggleEl();
    return tg?.querySelector?.(SEL.MM_BTN_COUNT || SEL.MM_TOGGLE_COUNT || '.cgxui-mm-count')
      || q(SEL.MM_TOGGLE_COUNT || '')
      || q('.cgxui-mm-count')
      || tg?.querySelector?.('[data-cgxui$="count"]')
      || null;
  }

  function getMiniMapScroller(btn = null) {
    const refs = getUiRefs();
    const panel = refs.panel || minimapPanel();
    const col = refs.col || minimapCol(panel);
    const candidates = [col, panel];

    if (btn?.closest) {
      const wrap = btn.closest('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"]');
      if (wrap) candidates.push(wrap.parentElement);
    }
    if (panel) {
      candidates.push(...qq('*', panel).slice(0, 24));
    }

    const seen = new Set();
    for (const el of candidates) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      try {
        const cs = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight && cs.overflowY !== 'visible') return el;
      } catch {}
    }

    let p = panel?.parentElement || null;
    let guard = 0;
    while (p && guard < 6) {
      guard += 1;
      try {
        const cs = getComputedStyle(p);
        if (p.scrollHeight > p.clientHeight && cs.overflowY !== 'visible') return p;
      } catch {}
      p = p.parentElement;
    }
    return panel || col || null;
  }

  function centerMiniMapNode(node, { smooth = true } = {}) {
    if (!node) return false;

    const scroller = getMiniMapScroller(node);
    if (scroller?.scrollTo) {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const nodeTop = node.getBoundingClientRect().top;
      const current = scroller.scrollTop || 0;
      const delta = (nodeTop - scrollerTop) - (scroller.clientHeight / 2 - node.clientHeight / 2);
      scroller.scrollTo({
        top: Math.max(0, current + delta),
        behavior: smooth ? 'smooth' : 'auto',
      });
      return true;
    }

    try {
      node.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      return true;
    } catch {
      return false;
    }
  }

  function getAnswerEls() {
    const { SEL } = getRegs();
    const primary = qq(SEL.ANSWER || '');
    if (primary.length) return primary;
    const a = qq('article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]');
    if (a.length) return a;
    const b = qq('[data-message-author-role="assistant"]');
    if (b.length) return b;
    return qq('[data-testid="conversation-turn"] [data-message-author-role="assistant"]');
  }

  function pickAssistantMessageEl(node) {
    if (!node || node.nodeType !== 1) return null;
    const role = String(node.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role === 'assistant') return node;
    try {
      const nested = node.querySelector?.('[data-message-author-role="assistant"]');
      if (nested) return nested;
    } catch {}
    try {
      const up = node.closest?.('[data-message-author-role="assistant"]');
      if (up) return up;
    } catch {}
    return null;
  }

  function getMessageId(el) {
    try {
      const viaFn = W.getMessageId?.(el);
      if (viaFn) return String(viaFn);
    } catch {}

    const raw = (
      el?.getAttribute?.('data-message-id') ||
      el?.dataset?.messageId ||
      el?.getAttribute?.('data-cgxui-id') ||
      el?.getAttribute?.('data-h2o-ans-id') ||
      el?.dataset?.h2oAnsId ||
      ''
    );
    if (raw) return String(raw);

    const gen = `a_${Math.random().toString(36).slice(2)}`;
    try { el?.setAttribute?.('data-h2o-core-id', gen); } catch {}
    return gen;
  }

  function parseTurnId(el, idx, aId) {
    const raw = (
      el?.getAttribute?.('data-turn-id') ||
      el?.dataset?.turnId ||
      el?.getAttribute?.('data-cgx-turn-id') ||
      ''
    );
    if (raw) return String(raw).trim();
    if (aId) return `turn:${aId}`;
    return `turn:${idx}`;
  }

  // FNV-1a-inspired 32-bit hash, base-36 encoded. Mirrors Pagination's stableHash36
  // exactly so that path_<hash> fallback IDs are identical across all modules.
  function stableHash36(input) {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function resolveChatId() {
    // Check shared util hook first (may be populated by another H2O module).
    const fromUtil = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromUtil) return fromUtil;
    // Mirror Pagination getChatId() exactly: /c/, /g/, then path_hash fallback.
    // This guarantees Core, Engine, and Pagination all key collapse state on the
    // same identity string for the same chat/GPT/session.
    const path = String(location.pathname || '/');
    const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    return `path_${stableHash36(`${location.origin}${path}${location.search || ''}`)}`;
  }

  function safeChatKeyPart(chatId = '') {
    return String(chatId || '').trim().replace(/[^a-z0-9_-]/gi, '_');
  }

  function nsDisk() {
    const { SH } = getRegs();
    try {
      const ns = SH?.util?.ns;
      if (ns && typeof ns.disk === 'function') return ns.disk('prm', 'cgx', 'mnmp');
    } catch {}
    return String(SH?.NS_DISK || 'h2o:prm:cgx:mnmp');
  }

  function keyTurnCacheMeta(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_TURN_CACHE_META_SUFFIX}:${safeId}:v1`;
  }

  function keyTurnCacheTurns(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_TURN_CACHE_TURNS_SUFFIX}:${safeId}:v1`;
  }

  function keyCustomDividers(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_CUSTOM_DIVIDERS_SUFFIX}:${safeId}:v1`;
  }

  function keyCollapsedPages(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_COLLAPSED_PAGES_SUFFIX}:${safeId}:v1`;
  }

  function keyPageLabelStyle() {
    return `${nsDisk()}:${KEY_PAGE_LABEL_STYLE_SUFFIX}`;
  }

  function keyPageDividers() {
    return `${nsDisk()}:${KEY_PAGE_DIVIDERS_SUFFIX}`;
  }

  function keyChatPageDividers() {
    return `${nsDisk()}:${KEY_CHAT_PAGE_DIVIDERS_SUFFIX}`;
  }

  function makeMiniDividerId() {
    return `divider:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  }

  function clampMiniDividerRatio(value, fallback = 0.5) {
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return fallback;
    return Math.min(1, Math.max(0, ratio));
  }

  function normalizeMiniDividerStyle(raw) {
    const style = String(raw || '').trim().toLowerCase();
    return style === 'dashed' || style === 'dotted' ? style : 'solid';
  }

  function normalizeMiniDividerColor(raw, fallback = MINI_DIVIDER_DEFAULT_COLOR) {
    const value = String(raw || '').trim().toLowerCase();
    if (/^#?[0-9a-f]{3}$/i.test(value)) {
      const hex = value.replace(/^#/, '');
      return `#${hex.split('').map((ch) => ch + ch).join('')}`;
    }
    if (/^#?[0-9a-f]{6}$/i.test(value)) {
      return `#${value.replace(/^#/, '')}`;
    }
    return String(fallback || MINI_DIVIDER_DEFAULT_COLOR).trim().toLowerCase();
  }

  function normalizeMiniDividerRecord(raw, fallbackYRatio = null, chatId = '') {
    const rawRatio = raw?.yRatio ?? raw?.ratio ?? raw?.y ?? fallbackYRatio;
    const hasRatio = Number.isFinite(Number(rawRatio));
    const gapId = String(raw?.gapId || raw?.anchorId || raw?.gap || '').trim();
    const rawSlot =
      raw?.afterTurnIndex ??
      raw?.position ??
      raw?.after ??
      0;
    const slot = Math.max(0, Number(rawSlot) || 0);
    if (!hasRatio && !slot && !gapId) return null;
    const resolvedChatId = String(chatId || raw?.chatId || resolveChatId() || '').trim();
    return {
      id: String(raw?.id || raw?.dividerId || '').trim() || makeMiniDividerId(),
      chatId: resolvedChatId,
      gapId,
      yRatio: hasRatio ? clampMiniDividerRatio(rawRatio) : null,
      afterTurnIndex: slot,
      style: normalizeMiniDividerStyle(raw?.style || raw?.lineStyle || raw?.type || ''),
      color: normalizeMiniDividerColor(raw?.color || raw?.lineColor || raw?.hex || ''),
    };
  }

  function normalizeMiniDividerList(records, chatId = '') {
    const src = Array.isArray(records) ? records : [];
    const byId = new Map();
    for (let i = 0; i < src.length; i += 1) {
      const item = normalizeMiniDividerRecord(src[i], null, chatId);
      if (!item) continue;
      byId.set(String(item.id || '').trim(), item);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aRatio = Number.isFinite(Number(a?.yRatio)) ? Number(a.yRatio) : Infinity;
      const bRatio = Number.isFinite(Number(b?.yRatio)) ? Number(b.yRatio) : Infinity;
      if (aRatio !== bRatio) return aRatio - bRatio;
      const aSlot = Number(a?.afterTurnIndex || 0);
      const bSlot = Number(b?.afterTurnIndex || 0);
      if (aSlot !== bSlot) return aSlot - bSlot;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
  }

  function loadMiniDividers(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return [];
    const key = keyCustomDividers(id);
    if (!key) return [];
    return normalizeMiniDividerList(storageGetJSON(key, []), id);
  }

  function saveMiniDividers(chatId = '', items = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    const key = keyCustomDividers(id);
    if (!key) return { ok: false, status: 'key-missing', chatId: id, items: [] };
    const nextItems = normalizeMiniDividerList(items, id);
    const ok = storageSetJSON(key, nextItems);
    return {
      ok,
      status: ok ? 'ok' : 'storage-failed',
      chatId: id,
      items: nextItems,
    };
  }

  function getMiniDividers(chatId = '') {
    return loadMiniDividers(chatId);
  }

  function normalizeMiniMapPageLabelStyle(_raw) {
    return PAGE_LABEL_STYLE_PILL;
  }

  function normalizeMiniMapPageDividersEnabled(raw, fallback = true) {
    if (typeof raw === 'boolean') return raw;
    const value = String(raw ?? '').trim().toLowerCase();
    if (!value) return !!fallback;
    if (value === '0' || value === 'false' || value === 'off' || value === 'hidden' || value === 'no') return false;
    if (value === '1' || value === 'true' || value === 'on' || value === 'show' || value === 'yes') return true;
    return !!fallback;
  }

  function normalizeChatPageDividersEnabled(raw, fallback = true) {
    return normalizeMiniMapPageDividersEnabled(raw, fallback);
  }

  function normalizeMiniMapCollapsedPages(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const out = [];
    for (const item of src) {
      const pageNum = Math.max(1, Number(item || 0) || 0);
      if (!pageNum || seen.has(pageNum)) continue;
      seen.add(pageNum);
      out.push(pageNum);
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function getMiniMapPageLabelStyle() {
    return normalizeMiniMapPageLabelStyle(storageGetStr(keyPageLabelStyle(), PAGE_LABEL_STYLE_DEFAULT));
  }

  function getMiniMapPageDividersEnabled() {
    return normalizeMiniMapPageDividersEnabled(storageGetStr(keyPageDividers(), '1'), true);
  }

  function getChatPageDividersEnabled() {
    return normalizeChatPageDividersEnabled(storageGetStr(keyChatPageDividers(), '1'), true);
  }

  function readCollapsedMiniMapPages(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const cached = S.collapsedMiniMapPagesByChat.get(id);
    if (cached instanceof Set) return new Set(cached);
    const key = keyCollapsedPages(id);
    const next = new Set(normalizeMiniMapCollapsedPages(storageGetJSON(key, [])));
    S.collapsedMiniMapPagesByChat.set(id, next);
    return new Set(next);
  }

  function saveCollapsedMiniMapPages(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', pages: [] };
    const key = keyCollapsedPages(id);
    if (!key) return { ok: false, status: 'key-missing', chatId: id, pages: [] };
    const nextPages = normalizeMiniMapCollapsedPages(Array.isArray(pages) ? pages : Array.from(pages || []));
    S.collapsedMiniMapPagesByChat.set(id, new Set(nextPages));
    const ok = storageSetJSON(key, nextPages);
    return {
      ok,
      status: ok ? 'ok' : 'storage-failed',
      chatId: id,
      pages: nextPages,
    };
  }

  function getMiniMapCollapsedPages(chatId = '') {
    return Array.from(readCollapsedMiniMapPages(chatId));
  }

  function isMiniMapPageCollapsed(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return false;
    return readCollapsedMiniMapPages(chatId).has(num);
  }

  function applyMiniMapPageUiPrefs(opts = {}) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const refs = MM_uiRefs();
      const root = refs?.root || getMiniMapRootEl();
      const panel = refs?.panel || minimapPanel();
      const labelStyle = PAGE_LABEL_STYLE_PILL;
      const dividersEnabled = normalizeMiniMapPageDividersEnabled(
        Object.prototype.hasOwnProperty.call(opts || {}, 'pageDividersEnabled')
          ? opts.pageDividersEnabled
          : getMiniMapPageDividersEnabled(),
        true
      );
      const chatPagesEnabled = normalizeChatPageDividersEnabled(
        Object.prototype.hasOwnProperty.call(opts || {}, 'chatPageDividersEnabled')
          ? opts.chatPageDividersEnabled
          : getChatPageDividersEnabled(),
        true
      );
      for (const el of [root, panel]) {
        if (!el) continue;
        try { el.setAttribute(ATTR_PAGE_LABEL_STYLE, labelStyle); } catch {}
        try { el.setAttribute(ATTR_PAGE_DIVIDERS, dividersEnabled ? '1' : '0'); } catch {}
      }
      try { document.documentElement.setAttribute(ATTR_CHAT_PAGE_DIVIDERS, chatPagesEnabled ? '1' : '0'); } catch {}
      try { renderChatPageDividers(resolveChatId()); } catch {}
      return { root, panel, pageLabelStyle: labelStyle, pageDividersEnabled: dividersEnabled, chatPageDividersEnabled: chatPagesEnabled };
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.applyMiniMapPageUiPrefs, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'applyMiniMapPageUiPrefs');
      }
      exitPerfOwner('incremental');
    }
  }

  function getMiniMapPageDivider(pageNum = 0, col = null) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const track = col || minimapCol() || ensureCol();
    if (!track || !num) return null;
    return track.querySelector?.(`.cgxui-mm-page-divider[data-page-num="${String(num)}"]`) || null;
  }

  function setMiniMapPageDividerDomState(divider, collapsed = false) {
    if (!divider) return null;
    const on = !!collapsed;
    const pageNum = Math.max(1, Number(divider?.dataset?.pageNum || 0) || 1);
    if (on) divider.setAttribute('data-page-collapsed', '1');
    else divider.removeAttribute('data-page-collapsed');
    const label = divider.querySelector?.('.cgxui-mm-page-divider-label') || null;
    if (label) {
      label.setAttribute('aria-expanded', on ? 'false' : 'true');
      label.title = on
        ? `Page ${pageNum} collapsed. Double-click to expand.`
        : `Page ${pageNum}. Click to jump. Double-click to collapse.`;
    }
    return divider;
  }

  function setMiniMapPageWrapDomState(wrap, collapsed = false) {
    if (!wrap) return null;
    if (collapsed) wrap.setAttribute('data-page-collapsed', '1');
    else wrap.removeAttribute('data-page-collapsed');
    return wrap;
  }

  function applyMiniMapPageCollapsedState(pageNum = 0, collapsed = false, col = null) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const num = Math.max(1, Number(pageNum || 0) || 0);
      const track = col || minimapCol() || ensureCol();
      if (!track || !num) return false;
      const wraps = qq(`.cgxui-mm-wrap[data-page-num="${String(num)}"]`, track);
      for (const wrap of wraps) setMiniMapPageWrapDomState(wrap, collapsed);
      const divider = getMiniMapPageDivider(num, track);
      setMiniMapPageDividerDomState(divider, collapsed);
      noteRenderUnit('collapseVisualUpdates', wraps.length + (divider ? 1 : 0));
      return true;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.applyMiniMapPageCollapsedState, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'applyMiniMapPageCollapsedState');
      }
      exitPerfOwner('incremental');
    }
  }

  function applyAllMiniMapPageCollapsedStates(chatId = '', col = null) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const track = col || minimapCol() || ensureCol();
      if (!track) return false;
      const collapsed = readCollapsedMiniMapPages(chatId);
      const wraps = qq('.cgxui-mm-wrap[data-page-num]', track);
      for (const wrap of wraps) {
        const pageNum = Math.max(1, Number(wrap?.dataset?.pageNum || 0) || 0);
        setMiniMapPageWrapDomState(wrap, collapsed.has(pageNum));
      }
      const dividers = qq('.cgxui-mm-page-divider[data-page-num]', track);
      for (const divider of dividers) {
        const pageNum = Math.max(1, Number(divider?.dataset?.pageNum || 0) || 0);
        setMiniMapPageDividerDomState(divider, collapsed.has(pageNum));
      }
      noteRenderUnit('collapseVisualUpdates', wraps.length + dividers.length);
      return true;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.applyAllMiniMapPageCollapsedStates, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'applyAllMiniMapPageCollapsedStates');
      }
      exitPerfOwner('incremental');
    }
  }

  function normalizeMiniMapCollapseArgs(chatIdOrOpts = '', sourceOrOpts = 'core') {
    let chatId = '';
    let source = 'core';
    let opts = null;

    if (chatIdOrOpts && typeof chatIdOrOpts === 'object' && !Array.isArray(chatIdOrOpts)) {
      opts = chatIdOrOpts;
      chatId = String(chatIdOrOpts.chatId || '').trim();
      source = String(chatIdOrOpts.source || 'core').trim() || 'core';
    } else {
      chatId = String(chatIdOrOpts || '').trim();
      if (sourceOrOpts && typeof sourceOrOpts === 'object' && !Array.isArray(sourceOrOpts)) {
        opts = sourceOrOpts;
        source = String(sourceOrOpts.source || 'core').trim() || 'core';
        if (!chatId) chatId = String(sourceOrOpts.chatId || '').trim();
      } else {
        source = String(sourceOrOpts || 'core').trim() || 'core';
      }
    }

    return { chatId, source, opts: opts || Object.create(null) };
  }

  function setMiniMapPageCollapsed(pageNum = 0, collapsed = true, chatId = '', source = 'core') {
    const arg = normalizeMiniMapCollapseArgs(chatId, source);
    const id = String(arg.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!id || !num) {
      return { ok: false, status: !id ? 'chat-id-missing' : 'page-missing', chatId: id, pageNum: num, collapsed: !!collapsed };
    }
    const nextCollapsed = !!collapsed;
    const set = readCollapsedMiniMapPages(id);
    if (nextCollapsed) set.add(num);
    else set.delete(num);
    const result = saveCollapsedMiniMapPages(id, Array.from(set));
    try { applyMiniMapPageCollapsedState(num, nextCollapsed, minimapCol()); } catch {}
    try { renderMiniDividerOverlay(id); } catch {}
    return Object.assign({}, result, {
      source: String(arg.source || 'core'),
      pageNum: num,
      collapsed: nextCollapsed,
    });
  }

  function toggleMiniMapPageCollapsed(pageNum = 0, chatId = '', source = 'core') {
    const arg = normalizeMiniMapCollapseArgs(chatId, source);
    const id = String(arg.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const nextCollapsed = !isMiniMapPageCollapsed(num, id);
    return setMiniMapPageCollapsed(num, nextCollapsed, id, { source: String(arg.source || 'core'), propagate: arg.opts?.propagate });
  }

  function setMiniMapPageLabelStyle(_value, source = 'core') {
    const next = PAGE_LABEL_STYLE_PILL;
    const ok = storageSetStr(keyPageLabelStyle(), next);
    applyMiniMapPageUiPrefs({ pageLabelStyle: next });
    return { ok, status: ok ? 'ok' : 'storage-failed', source: String(source || 'core'), value: next };
  }

  function setMiniMapPageDividersEnabled(value, source = 'core') {
    const next = normalizeMiniMapPageDividersEnabled(value, true);
    const ok = storageSetStr(keyPageDividers(), next ? '1' : '0');
    applyMiniMapPageUiPrefs({ pageDividersEnabled: next });
    try { renderMiniDividerOverlay(resolveChatId()); } catch {}
    return { ok, status: ok ? 'ok' : 'storage-failed', source: String(source || 'core'), enabled: next };
  }

  function setChatPageDividersEnabled(value, source = 'core') {
    const next = normalizeChatPageDividersEnabled(value, true);
    const ok = storageSetStr(keyChatPageDividers(), next ? '1' : '0');
    applyMiniMapPageUiPrefs({ chatPageDividersEnabled: next });
    return { ok, status: ok ? 'ok' : 'storage-failed', source: String(source || 'core'), enabled: next };
  }

  function coreFallback_readCollapsedChatPages(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const cached = S.collapsedChatPagesByChat.get(id);
    return (cached instanceof Set) ? new Set(cached) : new Set();
  }

  function coreFallback_isChatPageCollapsed(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return coreFallback_readCollapsedChatPages(chatId).has(num);
  }

  function coreFallback_setChatPageCollapsed(pageNum = 0, collapsed = true, chatId = '', source = 'core') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!id) {
      return { ok: false, status: 'chat-id-missing', chatId: id, pageNum: num, collapsed: !!collapsed };
    }
    const nextCollapsed = !!collapsed;
    const next = readCollapsedChatPages(id);
    if (nextCollapsed) next.add(num);
    else next.delete(num);
    S.collapsedChatPagesByChat.set(id, next);
    try { renderChatPageDividers(id); } catch {}
    try { setMiniMapPageCollapsed(num, nextCollapsed, id, { source: 'chat-sync', propagate: true }); } catch {}
    return {
      ok: true,
      status: 'ok',
      source: String(source || 'core'),
      chatId: id,
      pageNum: num,
      collapsed: nextCollapsed,
    };
  }

  function coreFallback_toggleChatPageCollapsed(pageNum = 0, chatId = '', source = 'core') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const nextCollapsed = !coreFallback_isChatPageCollapsed(num, id);
    return coreFallback_setChatPageCollapsed(num, nextCollapsed, id, source);
  }

  // Manual divider storage helpers. Legacy MiniDivider names remain for compatibility.
  function getMiniDividerById(dividerId, chatId = '') {
    const id = String(dividerId || '').trim();
    if (!id) return null;
    return loadMiniDividers(chatId).find((item) => String(item?.id || '').trim() === id) || null;
  }

  function getMiniDividerByAfterTurn(afterTurnIndex, chatId = '') {
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!slot) return null;
    const list = loadMiniDividers(chatId);
    return list.find((item) => Number(item?.afterTurnIndex || 0) === slot) || null;
  }

  function getSelectedMiniDividerId() {
    return String(S.selectedMiniDividerId || '').trim();
  }

  function emitMiniDividerChanged(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || resolveChatId() || '').trim(),
      dividerId: String(detail?.dividerId || '').trim(),
      action: String(detail?.action || 'update').trim(),
      source: String(detail?.source || 'core').trim(),
      item: detail?.item || null,
      items: Array.isArray(detail?.items) ? detail.items.slice() : undefined,
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_DIVIDER_CHANGED, { detail: out })); } catch {}
    return out;
  }

  function emitMiniDividerSelected(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || resolveChatId() || '').trim(),
      dividerId: String(detail?.dividerId || '').trim(),
      source: String(detail?.source || 'core').trim(),
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_DIVIDER_SELECTED, { detail: out })); } catch {}
    return out;
  }

  function setSelectedMiniDividerId(dividerId = '', opts = {}) {
    const nextId = String(dividerId || '').trim();
    const prevId = String(S.selectedMiniDividerId || '').trim();
    S.selectedMiniDividerId = nextId;
    if (opts.render !== false) {
      try { renderMiniDividerOverlay(String(opts.chatId || resolveChatId() || '').trim()); } catch {}
    }
    if (opts.emit !== false && nextId !== prevId) {
      emitMiniDividerSelected({
        chatId: String(opts.chatId || resolveChatId() || '').trim(),
        dividerId: nextId,
        source: String(opts.source || 'core').trim(),
      });
    }
    return nextId;
  }

  function selectMiniDivider(dividerId = '', chatId = '', source = 'core') {
    const item = getMiniDividerById(dividerId, chatId);
    const nextId = String(item?.id || '').trim();
    setSelectedMiniDividerId(nextId, {
      chatId: String(chatId || resolveChatId() || '').trim(),
      source,
      render: true,
      emit: true,
    });
    return item || null;
  }

  function upsertMiniDivider(record = {}, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const existing = getMiniDividerById(record?.id || record?.dividerId || '', id);
    const merged = Object.assign({}, existing || {}, record || {});
    const item = normalizeMiniDividerRecord(merged, existing?.yRatio ?? null, id);
    if (!item) return { ok: false, status: 'position-missing', chatId: id, item: null, items: [] };
    const list = loadMiniDividers(id).filter((entry) => String(entry?.id || '').trim() !== item.id);
    list.push(item);
    const saved = saveMiniDividers(id, list);
    if (saved.ok) {
      setSelectedMiniDividerId(item.id, { chatId: id, source: 'core:update', render: false, emit: true });
      try { renderMiniDividerOverlay(id); } catch {}
      emitMiniDividerChanged({
        chatId: id,
        dividerId: item.id,
        action: existing ? 'update' : 'create',
        source: 'core:update',
        item,
        items: saved.items,
      });
    }
    return Object.assign({}, saved, { item });
  }

  function createMiniDivider(record = {}, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const model = getMiniDividerGapModel();
    const defaultGap = getDefaultMiniDividerGap(model);
    const seed = Object.assign({
      gapId: String(defaultGap?.id || '').trim(),
      yRatio: Number.isFinite(Number(defaultGap?.ratio)) ? Number(defaultGap.ratio) : null,
      style: 'solid',
      color: MINI_DIVIDER_DEFAULT_COLOR,
    }, record || {});
    const hasPlacement =
      String(seed?.gapId || '').trim() ||
      Number.isFinite(Number(seed?.yRatio)) ||
      Math.max(0, Number(seed?.afterTurnIndex || 0) || 0);
    if (!hasPlacement) {
      return { ok: false, status: 'gap-missing', chatId: id, item: null, items: loadMiniDividers(id) };
    }
    return upsertMiniDivider(seed, id);
  }

  function removeMiniDividerById(dividerId, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const dividerKey = String(dividerId || '').trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    if (!dividerKey) return { ok: false, status: 'divider-id-missing', chatId: id, items: loadMiniDividers(id) };
    const list = loadMiniDividers(id).filter((entry) => String(entry?.id || '').trim() !== dividerKey);
    const saved = saveMiniDividers(id, list);
    if (saved.ok) {
      if (String(S.selectedMiniDividerId || '').trim() === dividerKey) {
        setSelectedMiniDividerId('', { chatId: id, source: 'core:remove', render: false, emit: true });
      }
      try { renderMiniDividerOverlay(id); } catch {}
      emitMiniDividerChanged({
        chatId: id,
        dividerId: dividerKey,
        action: 'remove',
        source: 'core:remove',
        items: saved.items,
      });
    }
    return saved;
  }

  function removeMiniDividerByAfterTurn(afterTurnIndex, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    if (!slot) return { ok: false, status: 'position-missing', chatId: id, items: loadMiniDividers(id) };
    const match = getMiniDividerByAfterTurn(slot, id);
    if (!match?.id) return { ok: false, status: 'divider-missing', chatId: id, items: loadMiniDividers(id) };
    return removeMiniDividerById(match.id, id);
  }

  const CACHE_SHRINK_CAUSES = new Set([
    'branch-deleted',
    'conversation-edited',
    'variant-switched',
    'server-history-changed',
  ]);
  const CACHE_SHRINK_REMOVAL_LIMIT = 256;

  function cacheRowQuestionId(row) {
    return String(row?.questionId || row?.qId || '').trim();
  }

  function cacheRowTurnId(row) {
    return String(row?.turnId || row?.id || '').trim();
  }

  function cacheRowAnswerIds(row) {
    const source = [
      ...(Array.isArray(row?.answerIds) ? row.answerIds : []),
      row?.primaryAId,
      row?.answerId,
      row?.aId,
    ];
    const out = [];
    const seen = new Set();
    for (const value of source) {
      const id = String(value || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function cacheRowsShareIdentity(left, right) {
    if (!left || !right) return false;
    const leftQId = cacheRowQuestionId(left);
    const rightQId = cacheRowQuestionId(right);
    if (leftQId && rightQId) return leftQId === rightQId;

    const leftTurnId = cacheRowTurnId(left);
    const rightTurnId = cacheRowTurnId(right);
    if (leftTurnId && rightTurnId) return leftTurnId === rightTurnId;

    const leftAnswers = new Set(cacheRowAnswerIds(left));
    return cacheRowAnswerIds(right).some((id) => leftAnswers.has(id));
  }

  function cacheRowLayer(row) {
    return row?.layer === 'history' ? 'history' : 'current';
  }

  const CURRENT_PROOF_PROVEN = 'proven-current';
  const CURRENT_PROOF_RETAINED = 'retained-proven-current';
  const CURRENT_PROOF_TRANSIENT = 'transient-unverified';
  const CURRENT_PROOF_LEGACY = 'legacy-unverified';

  function cacheRowCurrentProof(row) {
    if (cacheRowLayer(row) === 'history') return 'history';
    const value = String(row?.currentProof || '').trim();
    if (
      value === CURRENT_PROOF_PROVEN
      || value === CURRENT_PROOF_RETAINED
      || value === CURRENT_PROOF_TRANSIENT
      || value === CURRENT_PROOF_LEGACY
    ) return value;
    return CURRENT_PROOF_LEGACY;
  }

  function syntheticAnswerOnlyCurrentId(row) {
    if (cacheRowLayer(row) !== 'current' || cacheRowQuestionId(row)) return '';
    const turnId = cacheRowTurnId(row);
    if (!turnId.startsWith('turn:a:')) return '';
    const answerId = turnId.slice(7).trim();
    if (!answerId || !cacheRowAnswerIds(row).includes(answerId)) return '';
    return answerId;
  }

  function isSyntheticAnswerOnlyCurrentRow(row) {
    return !!syntheticAnswerOnlyCurrentId(row);
  }

  const TRANSIENT_DIAGNOSTIC_COUNT_FIELDS = Object.freeze([
    'transientRowsExcluded',
    'independentlyOwnedTransientCount',
    'ownerlessTransientExcludedCount',
    'unresolvedTransientCount',
    'syntheticProofRevocationCount',
    'syntheticRowsReconciledCount',
    'syntheticRowsExcludedCount',
    'syntheticRowsPendingCount',
    'syntheticOwnerAmbiguousCount',
  ]);

  function transientDiagnosticRowIdentity(row) {
    const syntheticId = syntheticAnswerOnlyCurrentId(row);
    if (syntheticId) return `synthetic:${syntheticId}`;
    const qId = cacheRowQuestionId(row);
    if (qId) return `question:${qId}`;
    const turnId = cacheRowTurnId(row);
    if (turnId) return `turn:${turnId}`;
    const answerId = String(row?.primaryAId || row?.answerId || '').trim();
    return answerId ? `answer:${answerId}` : '';
  }

  function createTransientDiagnosticClaims() {
    return Object.fromEntries(
      TRANSIENT_DIAGNOSTIC_COUNT_FIELDS.map((field) => [field, new Set()]),
    );
  }

  function noteTransientDiagnosticClaim(claims, field, row) {
    const key = transientDiagnosticRowIdentity(row);
    if (!key || !claims?.[field]) return false;
    claims[field].add(key);
    return true;
  }

  function mergeTransientDiagnosticClaims(target, ...sources) {
    for (const source of sources) {
      const claims = source?._transientDiagnosticClaims || source;
      if (!claims) continue;
      for (const field of TRANSIENT_DIAGNOSTIC_COUNT_FIELDS) {
        const values = claims[field];
        if (!values || !target?.[field]) continue;
        for (const value of values) target[field].add(value);
      }
    }
    return target;
  }

  function applyTransientDiagnosticCounts(target, claims) {
    for (const field of TRANSIENT_DIAGNOSTIC_COUNT_FIELDS) {
      target[field] = claims?.[field]?.size || 0;
    }
    return target;
  }

  function attachTransientDiagnosticClaims(target, claims) {
    try {
      Object.defineProperty(target, '_transientDiagnosticClaims', {
        value: claims,
        configurable: true,
      });
    } catch {}
    return target;
  }

  function currentLedgerMembers() {
    const api = getTurnRuntimeApi();
    try {
      const snapshot = api?.getChatAtlasLedgerSnapshot?.() || null;
      const currentChatKey = String(resolveChatId() || '').trim();
      const ledgerChatKey = String(snapshot?.chatKey || '').trim();
      if (snapshot?.ledgerReady !== true) return [];
      if (currentChatKey && ledgerChatKey && currentChatKey !== ledgerChatKey) return [];
      return Array.isArray(snapshot?.members) ? snapshot.members : [];
    } catch {
      return [];
    }
  }

  function ledgerMemberQuestionIds(member) {
    return new Set([
      member?.question?.currentQId,
      member?.question?.qId,
      ...(Array.isArray(member?.question?.currentAliases) ? member.question.currentAliases : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
  }

  function ledgerMemberAnswerIds(member) {
    return new Set([
      member?.answer?.primaryAId,
      ...(Array.isArray(member?.answer?.currentAnswerIds) ? member.answer.currentAnswerIds : []),
      ...(Array.isArray(member?.answer?.currentAliases) ? member.answer.currentAliases : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
  }

  function resolveMiniMapCurrentMemberByAnswer(answerId = '') {
    const id = String(answerId || '').trim();
    if (!id) return null;
    const candidates = currentLedgerMembers().filter((member) => ledgerMemberAnswerIds(member).has(id));
    if (candidates.length !== 1) return null;
    const member = candidates[0];
    const qId = String(member?.question?.currentQId || member?.question?.qId || '').trim();
    if (!qId) return null;
    return {
      member,
      qId,
      logicalMemberKey: String(member?.logicalMemberKey || '').trim(),
      answerIds: Array.from(new Set([
        ...(Array.isArray(member?.answer?.currentAnswerIds) ? member.answer.currentAnswerIds : []),
        member?.answer?.primaryAId,
      ].map((value) => String(value || '').trim()).filter(Boolean))),
    };
  }

  function resolveMiniMapCurrentMemberByQuestion(questionId = '') {
    const id = String(questionId || '').trim();
    if (!id) return null;
    const candidates = currentLedgerMembers().filter((member) => ledgerMemberQuestionIds(member).has(id));
    return candidates.length === 1 ? candidates[0] : null;
  }

  function currentCanonicalRecords() {
    const api = getTurnRuntimeApi();
    try {
      const records = typeof api?.listTurnRecords === 'function'
        ? api.listTurnRecords()
        : (typeof api?.listTurns === 'function' ? api.listTurns() : []);
      return Array.isArray(records) ? records.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function exactCurrentRecordIdentity(record, row) {
    const qId = cacheRowQuestionId(row);
    const turnId = cacheRowTurnId(row);
    const answerIds = new Set(cacheRowAnswerIds(row));
    const recordQId = String(record?.qId || record?.questionId || '').trim();
    const recordTurnId = String(record?.turnId || '').trim();
    const recordAnswerIds = new Set([
      record?.primaryAId,
      record?.answerId,
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ...(Array.isArray(record?.currentAnswerIds) ? record.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    if (qId && recordQId && qId !== recordQId) return false;
    if (qId && recordQId === qId) return true;
    if (turnId && recordTurnId === turnId) return true;
    return !!answerIds.size && Array.from(answerIds).some((id) => recordAnswerIds.has(id));
  }

  function exactCurrentLedgerIdentity(member, row) {
    const qId = cacheRowQuestionId(row);
    const answerIds = new Set(cacheRowAnswerIds(row));
    const memberQIds = new Set([
      member?.question?.currentQId,
      member?.question?.qId,
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const memberAnswerIds = new Set([
      member?.answer?.primaryAId,
      ...(Array.isArray(member?.answer?.currentAnswerIds) ? member.answer.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    if (qId && memberQIds.size && !memberQIds.has(qId)) return false;
    if (qId && memberQIds.has(qId)) return true;
    return !!answerIds.size && Array.from(answerIds).some((id) => memberAnswerIds.has(id));
  }

  function exactSyntheticCurrentRecordOwner(record, row) {
    const syntheticId = syntheticAnswerOnlyCurrentId(row);
    const qId = String(record?.qId || record?.questionId || '').trim();
    if (!syntheticId || !qId) return false;
    const currentAnswerIds = new Set([
      record?.primaryAId,
      record?.answerId,
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ...(Array.isArray(record?.currentAnswerIds) ? record.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    return currentAnswerIds.has(syntheticId);
  }

  function canonicalCurrentOwnerAnswerIds(record) {
    return Array.from(new Set([
      record?.primaryAId,
      record?.answerId,
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ...(Array.isArray(record?.currentAnswerIds) ? record.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean)));
  }

  function exactSyntheticCurrentLedgerOwner(member, row) {
    const syntheticId = syntheticAnswerOnlyCurrentId(row);
    const qId = String(
      member?.question?.currentQId || member?.question?.qId || ''
    ).trim();
    if (!syntheticId || !qId) return false;
    const currentAnswerIds = new Set([
      member?.answer?.primaryAId,
      ...(Array.isArray(member?.answer?.currentAnswerIds) ? member.answer.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    return currentAnswerIds.has(syntheticId);
  }

  function ledgerCurrentOwnerAnswerIds(member) {
    return Array.from(new Set([
      member?.answer?.primaryAId,
      ...(Array.isArray(member?.answer?.currentAnswerIds) ? member.answer.currentAnswerIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean)));
  }

  function isHostOwnedControl(el) {
    if (!el) return true;
    try {
      if (el.closest?.('[data-cgxui-owner], [data-h2o-owner]')) return true;
      if (el.closest?.('[data-cgxui*="divider"], [data-cgxui*="title"], [data-cgxui*="mnmp"]')) return true;
    } catch {}
    return false;
  }

  function isConnectedSelectedHostAssistant(el, answerId = '') {
    if (!el || el.nodeType !== 1 || el.isConnected !== true || isHostOwnedControl(el)) return false;
    const id = String(answerId || '').trim();
    const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role !== 'assistant') return false;
    if (id && String(getMessageId(el) || '').trim() !== id) return false;
    const turnHost = el.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || null;
    if (!turnHost || turnHost.isConnected !== true || isHostOwnedControl(turnHost)) return false;
    try {
      if (el.hidden || turnHost.hidden || el.inert || turnHost.inert) return false;
      if (el.closest?.('[hidden], [inert], [aria-hidden="true"], [data-selected="false"], [data-is-current="false"]')) return false;
      const style = getComputedStyle?.(turnHost);
      if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    } catch {}
    return true;
  }

  function connectedSelectedHostOwners(row) {
    const syntheticId = syntheticAnswerOnlyCurrentId(row);
    const answerIds = syntheticId ? [syntheticId] : cacheRowAnswerIds(row);
    if (!answerIds.length) return [];
    const owners = [];
    const seen = new Set();
    for (const answerId of answerIds) {
      let candidates = [];
      try {
        const escaped = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
          ? CSS.escape(answerId)
          : answerId.replace(/"/g, '\\"');
        candidates = Array.from(document.querySelectorAll?.(
          `[data-message-author-role="assistant"][data-message-id="${escaped}"]`
        ) || []);
      } catch {}
      for (const candidate of candidates) {
        if (!isConnectedSelectedHostAssistant(candidate, answerId) || seen.has(candidate)) continue;
        seen.add(candidate);
        owners.push({ el: candidate, answerId });
      }
    }
    return owners;
  }

  function evaluateTransientCurrentOwnership(row) {
    const rowQId = cacheRowQuestionId(row) || null;
    const answerId = String(row?.primaryAId || row?.answerId || cacheRowAnswerIds(row)[0] || '').trim() || null;
    const syntheticId = syntheticAnswerOnlyCurrentId(row);
    const canonicalOwners = currentCanonicalRecords().filter((record) => (
      syntheticId
        ? exactSyntheticCurrentRecordOwner(record, row)
        : exactCurrentRecordIdentity(record, row)
    ));
    if (canonicalOwners.length > 1) {
      return {
        owned: false,
        basis: 'none',
        qId: rowQId,
        answerId,
        hostConnected: false,
        ambiguity: 'canonical-owner-ambiguous',
      };
    }
    const ledgerOwners = currentLedgerMembers().filter((member) => (
      syntheticId
        ? exactSyntheticCurrentLedgerOwner(member, row)
        : exactCurrentLedgerIdentity(member, row)
    ));
    if (ledgerOwners.length > 1) {
      return {
        owned: false,
        basis: 'none',
        qId: rowQId,
        answerId,
        hostConnected: false,
        ambiguity: 'ledger-owner-ambiguous',
      };
    }
    const canonicalQId = String(canonicalOwners[0]?.qId || canonicalOwners[0]?.questionId || '').trim();
    const ledgerQId = String(
      ledgerOwners[0]?.question?.currentQId || ledgerOwners[0]?.question?.qId || ''
    ).trim();
    if (canonicalQId && ledgerQId && canonicalQId !== ledgerQId) {
      return {
        owned: false,
        basis: 'none',
        qId: rowQId,
        answerId,
        hostConnected: false,
        ambiguity: 'current-owner-qid-conflict',
      };
    }
    if (canonicalOwners.length === 1 && canonicalQId) {
      const ownerAnswerIds = canonicalCurrentOwnerAnswerIds(canonicalOwners[0]);
      return {
        owned: true,
        basis: 'canonical-current-member',
        qId: canonicalQId,
        answerId,
        hostConnected: false,
        ownerAnswerIds,
        ownerPrimaryAId: String(canonicalOwners[0]?.primaryAId || canonicalOwners[0]?.answerId || '').trim(),
        logicalMemberKey: String(canonicalOwners[0]?.logicalMemberKey || '').trim(),
      };
    }
    if (ledgerOwners.length === 1 && ledgerQId) {
      const ownerAnswerIds = ledgerCurrentOwnerAnswerIds(ledgerOwners[0]);
      return {
        owned: true,
        basis: 'ledger-current-member',
        qId: ledgerQId,
        answerId,
        hostConnected: false,
        ownerAnswerIds,
        ownerPrimaryAId: String(ledgerOwners[0]?.answer?.primaryAId || '').trim(),
        logicalMemberKey: String(ledgerOwners[0]?.logicalMemberKey || '').trim(),
      };
    }
    const hostOwners = connectedSelectedHostOwners(row);
    if (hostOwners.length === 1) {
      return { owned: true, basis: 'connected-selected-host-answer', qId: rowQId, answerId, hostConnected: true };
    }
    if (hostOwners.length > 1) {
      return {
        owned: false,
        basis: 'none',
        qId: rowQId,
        answerId,
        hostConnected: false,
        ambiguity: 'host-owner-ambiguous',
      };
    }
    return { owned: false, basis: 'none', qId: rowQId, answerId, hostConnected: false };
  }

  function transientOwnershipClaim(ownership) {
    if (!ownership?.owned) return '';
    const qId = String(ownership.qId || '').trim();
    const answerId = String(ownership.answerId || '').trim();
    return qId ? `question:${qId}` : (answerId ? `answer:${answerId}` : '');
  }

  function deriveLiveCurrentProof(row) {
    if (isSyntheticAnswerOnlyCurrentRow(row)) return CURRENT_PROOF_TRANSIENT;
    const existing = cacheRowCurrentProof(row);
    if (existing === CURRENT_PROOF_PROVEN || existing === CURRENT_PROOF_RETAINED) return existing;
    const ownership = evaluateTransientCurrentOwnership(row);
    if (
      ownership.owned
      && ownership.qId
      && ownership.basis !== 'connected-selected-host-answer'
    ) return CURRENT_PROOF_PROVEN;
    return CURRENT_PROOF_TRANSIENT;
  }

  function reconcileSyntheticCurrentRow(row, ownership = null) {
    if (!isSyntheticAnswerOnlyCurrentRow(row)) return null;
    const resolved = ownership || evaluateTransientCurrentOwnership(row);
    const qId = String(resolved?.qId || '').trim();
    if (!resolved?.owned || !qId || resolved?.ambiguity) return null;
    return {
      ...row,
      qId,
      questionId: qId,
      turnId: `turn:${qId}`,
      layer: 'current',
      selectedPath: true,
      currentProof: CURRENT_PROOF_PROVEN,
      suspectQuestionIdentity: false,
      repairReason: 'synthetic-owner-reconciled',
    };
  }

  function cacheSplitRoleOwnership(questionRow, answerRow) {
    const qId = cacheRowQuestionId(questionRow);
    const answerIds = cacheRowAnswerIds(answerRow);
    if (!qId || !answerIds.length) return null;

    const questionMemberKey = cacheRowLogicalMemberKey(questionRow);
    const answerMemberKey = cacheRowLogicalMemberKey(answerRow);
    if (questionMemberKey && answerMemberKey && questionMemberKey === answerMemberKey) {
      return { basis: 'logical-member-key', logicalMemberKey: questionMemberKey, member: null };
    }

    const members = currentLedgerMembers();
    const questionOwners = members.filter((member) => ledgerMemberQuestionIds(member).has(qId));
    const answerOwners = members.filter((member) => (
      answerIds.some((answerId) => ledgerMemberAnswerIds(member).has(answerId))
    ));
    if (questionOwners.length !== 1 || answerOwners.length !== 1 || questionOwners[0] !== answerOwners[0]) {
      return null;
    }
    return {
      basis: 'ledger-current-ownership',
      logicalMemberKey: String(questionOwners[0]?.logicalMemberKey || '').trim(),
      member: questionOwners[0],
    };
  }

  function cacheRowLogicalMemberKey(row) {
    return String(row?.logicalMemberKey || row?.memberKey || '').trim();
  }

  function cacheRowLineageKey(row) {
    return String(row?.lineageKey || row?.branchKey || row?.parentQuestionId || '').trim();
  }

  function cacheRowsHaveVariantRelationship(left, right) {
    if (!left || !right) return false;
    const leftQId = cacheRowQuestionId(left);
    const rightQId = cacheRowQuestionId(right);
    if (!leftQId || leftQId !== rightQId) return false;

    const leftMember = cacheRowLogicalMemberKey(left);
    const rightMember = cacheRowLogicalMemberKey(right);
    if (leftMember && rightMember) return leftMember === rightMember;

    const leftLineage = cacheRowLineageKey(left);
    const rightLineage = cacheRowLineageKey(right);
    if (leftLineage && rightLineage) return leftLineage === rightLineage;

    const leftTurnId = cacheRowTurnId(left);
    const rightTurnId = cacheRowTurnId(right);
    if (leftTurnId && rightTurnId && leftTurnId === rightTurnId) return true;

    const leftAnswers = new Set(cacheRowAnswerIds(left));
    return cacheRowAnswerIds(right).some((id) => leftAnswers.has(id));
  }

  function cacheRowsHaveCompatibleBranchContext(left, right) {
    if (!left || !right) return false;
    const leftQId = cacheRowQuestionId(left);
    const rightQId = cacheRowQuestionId(right);
    if (leftQId && rightQId && leftQId !== rightQId) return false;
    const leftMember = cacheRowLogicalMemberKey(left);
    const rightMember = cacheRowLogicalMemberKey(right);
    if (leftMember && rightMember && leftMember !== rightMember) return false;
    const leftLineage = cacheRowLineageKey(left);
    const rightLineage = cacheRowLineageKey(right);
    if (leftLineage && rightLineage && leftLineage !== rightLineage) return false;
    return true;
  }

  function findCacheRowIndex(rows, target, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const usedIndexes = opts?.usedIndexes instanceof Set ? opts.usedIndexes : null;
    const requiredLayer = opts?.layer === 'history' || opts?.layer === 'current'
      ? opts.layer
      : '';
    const candidateIndexes = [];
    for (let index = 0; index < list.length; index += 1) {
      if (usedIndexes?.has(index)) continue;
      if (requiredLayer && cacheRowLayer(list[index]) !== requiredLayer) continue;
      candidateIndexes.push(index);
    }

    const qId = cacheRowQuestionId(target);
    if (qId) {
      const qMatches = candidateIndexes.filter((index) => (
        cacheRowQuestionId(list[index]) === qId
        && cacheRowsHaveCompatibleBranchContext(list[index], target)
      ));
      if (qMatches.length === 1) return qMatches[0];
      if (qMatches.length > 1) {
        const turnId = cacheRowTurnId(target);
        if (turnId) {
          const turnMatches = qMatches.filter((index) => cacheRowTurnId(list[index]) === turnId);
          if (turnMatches.length === 1) return turnMatches[0];
        }
        const targetAnswers = new Set(cacheRowAnswerIds(target));
        const answerMatches = qMatches.filter((index) => (
          cacheRowAnswerIds(list[index]).some((id) => targetAnswers.has(id))
        ));
        if (answerMatches.length === 1) return answerMatches[0];
        return -1;
      }
    }

    const turnId = cacheRowTurnId(target);
    if (turnId) {
      const turnMatches = candidateIndexes.filter((index) => {
        const row = list[index];
        const rowQId = cacheRowQuestionId(row);
        if (qId && rowQId && rowQId !== qId) return false;
        return cacheRowTurnId(row) === turnId;
      });
      if (turnMatches.length === 1) return turnMatches[0];
      if (turnMatches.length > 1) return -1;
    }

    const answerIds = new Set(cacheRowAnswerIds(target));
    if (!answerIds.size) return -1;
    const answerMatches = candidateIndexes.filter((index) => {
      const row = list[index];
      const rowQId = cacheRowQuestionId(row);
      const rowTurnId = cacheRowTurnId(row);
      if (qId && rowQId && qId !== rowQId) return false;
      if (turnId && rowTurnId && turnId !== rowTurnId) return false;
      return cacheRowAnswerIds(row).some((id) => answerIds.has(id));
    });
    return answerMatches.length === 1 ? answerMatches[0] : -1;
  }

  function isValidCacheAnswerCandidate(candidate, context = {}, raw = null) {
    if (isValidMiniMapAnswerCandidate(candidate, context)) return true;
    const value = String(candidate || '').trim();
    const turnId = String(context?.turnId || '').trim();
    const questionId = String(context?.questionId || '').trim();
    const explicitlyAnswered = raw?.noAnswer !== true && raw?.hasAssistant !== false;
    return !!value
      && explicitlyAnswered
      && value !== questionId
      && turnId === `turn:a:${value}`;
  }

  function normalizeCacheTurnRow(raw, fallbackIdx = 0) {
    const i = Math.max(1, Number(raw?.idx || raw?.index || fallbackIdx || 1) || 1);
    const historicalInput = raw?.layer === 'history' || raw?.selectedPath === false;
    let questionId = String(raw?.questionId || raw?.qId || '').trim();
    let turnId = String(raw?.turnId || raw?.id || '').trim();
    let answerId = String(raw?.answerId || raw?.primaryAId || raw?.aId || '').trim();

    let record = getSharedTurnRecordByIdentity('turn', turnId);
    if (!record) record = getSharedTurnRecordByIdentity('question', questionId);
    if (!record && isValidMiniMapAnswerCandidate(answerId, { turnId, questionId })) {
      record = getSharedTurnRecordByIdentity('answer', answerId);
    }

    const canonicalQuestionId = String(record?.qId || record?.questionId || '').trim();
    const identityProof = canonicalTurnIdentityProof(record, { turnId, questionId, answerId });
    const resolvedRecord = identityProof.proven && !historicalInput ? record : null;
    const suppressCachedQuestion = shouldSuppressUnprovenCachedQuestion(
      raw,
      turnId,
      questionId,
      identityProof,
    );
    questionId = String(
      (resolvedRecord ? canonicalQuestionId : '')
      || (suppressCachedQuestion ? '' : questionId)
    ).trim();
    const noAnswer = isCanonicalNoAnswerRecord(resolvedRecord)
      || raw?.noAnswer === true
      || raw?.hasAssistant === false;
    turnId = String(
      resolvedRecord?.turnId ||
      turnId ||
      (noAnswer && questionId ? `turn:${questionId}` : '')
    ).trim();

    let answerIds = [];
    if (noAnswer) {
      answerId = '';
      if (questionId) turnId = `turn:${questionId}`;
    } else {
      const canonicalAnswerId = String(resolvedRecord?.primaryAId || resolvedRecord?.answerId || '').trim();
      answerId = canonicalAnswerId || (
        isValidCacheAnswerCandidate(answerId, { turnId, questionId }, raw) ? answerId : ''
      );
      const answerSource = [
        ...(Array.isArray(resolvedRecord?.answerIds) ? resolvedRecord.answerIds : []),
        ...(Array.isArray(raw?.answerIds) ? raw.answerIds : []),
        answerId,
      ];
      const seenAnswerIds = new Set();
      answerIds = answerSource.reduce((out, value) => {
        const candidate = String(value || '').trim();
        if (
          !candidate
          || seenAnswerIds.has(candidate)
          || !isValidCacheAnswerCandidate(candidate, { turnId, questionId }, raw)
        ) return out;
        seenAnswerIds.add(candidate);
        out.push(candidate);
        return out;
      }, []);
      if (answerId && answerIds[answerIds.length - 1] !== answerId) {
        answerIds = answerIds.filter((id) => id !== answerId);
        answerIds.push(answerId);
      }
    }
    if (!turnId) {
      turnId = answerId ? `turn:a:${answerId}` : (questionId ? `turn:${questionId}` : `turn:${i}`);
    }
    if (!turnId) return null;
    const layer = historicalInput ? 'history' : 'current';
    const currentProof = layer === 'history' ? 'history' : cacheRowCurrentProof(raw);
    const normalized = {
      idx: i,
      turnId,
      answerId,
      primaryAId: answerId,
      answerIds,
      questionId,
      qId: questionId,
      noAnswer,
      hasAssistant: noAnswer ? false : (raw?.hasAssistant ?? resolvedRecord?.hasAssistant),
      layer,
      selectedPath: layer === 'history'
        ? false
        : (raw?.selectedPath === true ? true : 'unverified'),
      currentProof,
    };
    const logicalMemberKey = cacheRowLogicalMemberKey(raw);
    const lineageKey = cacheRowLineageKey(raw);
    if (logicalMemberKey) normalized.logicalMemberKey = logicalMemberKey;
    if (lineageKey) normalized.lineageKey = lineageKey;
    if (
      raw?.suspectQuestionIdentity === true
      || (!!record && !identityProof.proven && !!canonicalQuestionId && canonicalQuestionId !== questionId)
    ) normalized.suspectQuestionIdentity = true;
    const repairReason = String(raw?.repairReason || '').trim();
    if (repairReason) normalized.repairReason = repairReason;
    return normalized;
  }

  function cacheTurnRowWasSanitized(raw, normalized) {
    if (!raw || !normalized) return true;
    const rawQId = cacheRowQuestionId(raw);
    const rawTurnId = cacheRowTurnId(raw);
    const rawPrimary = String(raw?.primaryAId || raw?.answerId || raw?.aId || '').trim();
    const normalizedPrimary = String(normalized?.primaryAId || normalized?.answerId || '').trim();
    return rawQId !== cacheRowQuestionId(normalized)
      || rawTurnId !== cacheRowTurnId(normalized)
      || rawPrimary !== normalizedPrimary
      || ((raw?.noAnswer === true || raw?.hasAssistant === false) !== normalized.noAnswer)
      || cacheRowLayer(raw) !== cacheRowLayer(normalized)
      || raw?.selectedPath !== normalized.selectedPath
      || String(raw?.currentProof || '').trim() !== normalized.currentProof;
  }

  function mergeCacheVariantEvidence(baseRow, extraRow, primaryPreference = '') {
    const base = { ...(baseRow || {}) };
    if (base?.noAnswer === true || base?.hasAssistant === false) {
      base.answerId = '';
      base.primaryAId = '';
      base.answerIds = [];
      return base;
    }
    const primaryAId = String(primaryPreference || base?.primaryAId || base?.answerId || '').trim();
    const answerIds = [];
    const seen = new Set();
    for (const value of [...cacheRowAnswerIds(base), ...cacheRowAnswerIds(extraRow), primaryAId]) {
      const answerId = String(value || '').trim();
      if (!answerId || seen.has(answerId)) continue;
      seen.add(answerId);
      answerIds.push(answerId);
    }
    if (primaryAId) {
      const withoutPrimary = answerIds.filter((value) => value !== primaryAId);
      withoutPrimary.push(primaryAId);
      base.answerIds = withoutPrimary;
      base.answerId = primaryAId;
      base.primaryAId = primaryAId;
    } else {
      base.answerIds = answerIds;
    }
    return base;
  }

  function cacheRowCanonicalCorroboration(row) {
    const turnId = cacheRowTurnId(row);
    const questionId = cacheRowQuestionId(row);
    const answerId = String(row?.primaryAId || row?.answerId || '').trim();
    let record = getSharedTurnRecordByIdentity('turn', turnId);
    if (!record) record = getSharedTurnRecordByIdentity('question', questionId);
    if (!record && answerId) record = getSharedTurnRecordByIdentity('answer', answerId);
    const proof = canonicalTurnIdentityProof(record, { turnId, questionId, answerId });
    return {
      record,
      proof,
      canonicalQuestionId: String(record?.qId || record?.questionId || '').trim(),
      canonicalTurnId: String(record?.turnId || '').trim(),
      canonicalPrimaryAId: String(record?.primaryAId || record?.answerId || '').trim(),
    };
  }

  function cacheRowHasAuthoritativeCurrentPosition(row) {
    const corroboration = cacheRowCanonicalCorroboration(row);
    const rowIndex = Math.max(0, Number(row?.idx || row?.index || 0) || 0);
    const recordIndex = Math.max(0, Number(
      corroboration.record?.turnNo
      || corroboration.record?.idx
      || corroboration.record?.index
      || 0
    ) || 0);
    return corroboration.proof.proven && rowIndex > 0 && recordIndex === rowIndex;
  }

  function cacheCurrentCandidateScore(row, liveRows = [], canonicalQuestionId = '') {
    let score = row?.selectedPath === true ? 8 : 0;
    const qId = cacheRowQuestionId(row);
    const turnId = cacheRowTurnId(row);
    const answers = new Set(cacheRowAnswerIds(row));
    const canonical = cacheRowCanonicalCorroboration(row);
    if (canonicalQuestionId && qId === canonicalQuestionId) score += 80;
    if (canonical.proof.proven) score += 40;
    if (canonical.canonicalTurnId && canonical.canonicalTurnId === turnId) score += 40;
    if (canonical.canonicalPrimaryAId && answers.has(canonical.canonicalPrimaryAId)) score += 20;
    for (const live of (Array.isArray(liveRows) ? liveRows : [])) {
      if (qId && qId === cacheRowQuestionId(live)) score += 16;
      if (turnId && turnId === cacheRowTurnId(live)) score += 32;
      const liveAnswers = cacheRowAnswerIds(live);
      if (liveAnswers.some((id) => answers.has(id))) score += 12;
      if (
        Math.max(0, Number(row?.idx || row?.index || 0) || 0)
        === Math.max(0, Number(live?.idx || live?.index || 0) || 0)
      ) score += 4;
    }
    return score;
  }

  function findCacheSplitRoleProposals(rows = []) {
    const list = Array.isArray(rows) ? rows : [];
    const questionIndexes = [];
    const answerIndexes = [];
    for (let index = 0; index < list.length; index += 1) {
      const row = list[index];
      if (cacheRowLayer(row) !== 'current') continue;
      const qId = cacheRowQuestionId(row);
      const answerIds = cacheRowAnswerIds(row);
      if (qId && answerIds.length === 0) questionIndexes.push(index);
      if (!qId && answerIds.length > 0) answerIndexes.push(index);
    }

    const proposals = [];
    for (const questionIndex of questionIndexes) {
      for (const answerIndex of answerIndexes) {
        const ownership = cacheSplitRoleOwnership(list[questionIndex], list[answerIndex]);
        if (ownership) proposals.push({ questionIndex, answerIndex, ownership });
      }
    }
    const questionUses = new Map();
    const answerUses = new Map();
    for (const proposal of proposals) {
      questionUses.set(proposal.questionIndex, (questionUses.get(proposal.questionIndex) || 0) + 1);
      answerUses.set(proposal.answerIndex, (answerUses.get(proposal.answerIndex) || 0) + 1);
    }
    return {
      proposals,
      accepted: proposals.filter((proposal) => (
        questionUses.get(proposal.questionIndex) === 1
        && answerUses.get(proposal.answerIndex) === 1
      )),
      ambiguousCount: proposals.filter((proposal) => (
        questionUses.get(proposal.questionIndex) !== 1
        || answerUses.get(proposal.answerIndex) !== 1
      )).length,
    };
  }

  function reconcileCacheSplitRoleRows(rows = []) {
    const source = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
    const relationships = findCacheSplitRoleProposals(source);
    const mergedAt = new Map();
    const removed = new Set();
    let reconciledCount = 0;
    for (const proposal of relationships.accepted) {
      if (removed.has(proposal.questionIndex) || removed.has(proposal.answerIndex)) continue;
      const questionRow = source[proposal.questionIndex];
      const answerRow = source[proposal.answerIndex];
      const primaryAId = String(answerRow?.primaryAId || answerRow?.answerId || '').trim();
      const answerIds = cacheRowAnswerIds(answerRow);
      const merged = {
        ...questionRow,
        answerId: primaryAId,
        primaryAId,
        answerIds,
        noAnswer: false,
        hasAssistant: true,
        layer: 'current',
        selectedPath: true,
        currentProof: CURRENT_PROOF_PROVEN,
      };
      if (proposal.ownership.logicalMemberKey) {
        merged.logicalMemberKey = proposal.ownership.logicalMemberKey;
      }
      const targetIndex = Math.min(proposal.questionIndex, proposal.answerIndex);
      const removedIndex = Math.max(proposal.questionIndex, proposal.answerIndex);
      mergedAt.set(targetIndex, merged);
      removed.add(removedIndex);
      reconciledCount += 1;
    }
    const out = [];
    for (let index = 0; index < source.length; index += 1) {
      if (removed.has(index)) continue;
      out.push(mergedAt.get(index) || source[index]);
    }
    return {
      rows: out,
      reconciledCount,
      ambiguousCount: relationships.ambiguousCount,
      relationshipCount: relationships.proposals.length,
    };
  }

  function repairCacheCurrentMembership(rows, opts = {}) {
    const splitRepair = reconcileCacheSplitRoleRows(rows);
    const next = splitRepair.rows;
    const liveRows = (Array.isArray(opts?.liveRows) ? opts.liveRows : [])
      .map((row, index) => normalizeCacheTurnRow({
        ...row,
        layer: 'current',
        selectedPath: true,
        currentProof: deriveLiveCurrentProof(row),
      }, index + 1))
      .filter(Boolean);
    let repairedRows = splitRepair.reconciledCount;
    let demotedRows = 0;
    let duplicateCurrentQIdCount = 0;
    const diagnosticClaims = createTransientDiagnosticClaims();

    const demote = (index, reason) => {
      const row = next[index];
      if (!row || cacheRowLayer(row) === 'history') return false;
      next[index] = {
        ...row,
        layer: 'history',
        selectedPath: false,
        currentProof: 'history',
        suspectQuestionIdentity: true,
        repairReason: String(reason || 'branch-membership-repair'),
      };
      repairedRows += 1;
      demotedRows += 1;
      return true;
    };

    for (let index = 0; index < next.length; index += 1) {
      const row = next[index];
      if (!isSyntheticAnswerOnlyCurrentRow(row)) continue;
      const ownership = evaluateTransientCurrentOwnership(row);
      const reconciled = reconcileSyntheticCurrentRow(row, ownership);
      if (reconciled) {
        next[index] = reconciled;
        repairedRows += 1;
        noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsReconciledCount', row);
        continue;
      }
      const priorProof = cacheRowCurrentProof(row);
      if (priorProof === CURRENT_PROOF_PROVEN || priorProof === CURRENT_PROOF_RETAINED) {
        noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticProofRevocationCount', row);
      }
      if (priorProof !== CURRENT_PROOF_TRANSIENT) repairedRows += 1;
      next[index] = {
        ...row,
        currentProof: CURRENT_PROOF_TRANSIENT,
        suspectQuestionIdentity: true,
        repairReason: priorProof === CURRENT_PROOF_PROVEN || priorProof === CURRENT_PROOF_RETAINED
          ? 'synthetic-proof-revoked'
          : 'synthetic-boundary-pending',
      };
    }

    const selectWinner = (indexes, canonicalQuestionId = '') => indexes
      .slice()
      .sort((left, right) => {
        const scoreDiff = cacheCurrentCandidateScore(next[right], liveRows, canonicalQuestionId)
          - cacheCurrentCandidateScore(next[left], liveRows, canonicalQuestionId);
        return scoreDiff || left - right;
      })[0];

    const qGroups = new Map();
    next.forEach((row, index) => {
      if (cacheRowLayer(row) !== 'current') return;
      const qId = cacheRowQuestionId(row);
      if (!qId) return;
      if (!qGroups.has(qId)) qGroups.set(qId, []);
      qGroups.get(qId).push(index);
    });
    for (const [qId, indexes] of qGroups.entries()) {
      if (indexes.length < 2) continue;
      duplicateCurrentQIdCount += 1;
      const winner = selectWinner(indexes, qId);
      for (const index of indexes) {
        if (index === winner) continue;
        if (cacheRowsHaveVariantRelationship(next[winner], next[index])) {
          next[winner] = mergeCacheVariantEvidence(next[winner], next[index], next[winner]?.primaryAId);
        }
        demote(index, 'duplicate-current-qid');
      }
      next[winner] = { ...next[winner], layer: 'current', selectedPath: true };
    }

    const canonicalGroups = new Map();
    next.forEach((row, index) => {
      if (cacheRowLayer(row) !== 'current') return;
      const corroboration = cacheRowCanonicalCorroboration(row);
      const canonicalQuestionId = corroboration.canonicalQuestionId;
      if (!canonicalQuestionId) return;
      if (!canonicalGroups.has(canonicalQuestionId)) canonicalGroups.set(canonicalQuestionId, []);
      canonicalGroups.get(canonicalQuestionId).push(index);
    });
    for (const [canonicalQuestionId, indexes] of canonicalGroups.entries()) {
      if (indexes.length < 2) continue;
      const winner = selectWinner(indexes, canonicalQuestionId);
      for (const index of indexes) {
        if (index === winner) continue;
        demote(index, 'alias-resolved-branch-conflict');
      }
      next[winner] = { ...next[winner], layer: 'current', selectedPath: true };
    }

    const positionGroups = new Map();
    next.forEach((row, index) => {
      if (cacheRowLayer(row) !== 'current') return;
      const turnIndex = Math.max(0, Number(row?.idx || row?.index || 0) || 0);
      if (!turnIndex) return;
      if (!positionGroups.has(turnIndex)) positionGroups.set(turnIndex, []);
      positionGroups.get(turnIndex).push(index);
    });
    for (const indexes of positionGroups.values()) {
      if (indexes.length < 2) continue;
      const distinctQIds = new Set(indexes.map((index) => cacheRowQuestionId(next[index])).filter(Boolean));
      if (distinctQIds.size < 2) continue;
      const authoritative = indexes.filter((index) => cacheRowHasAuthoritativeCurrentPosition(next[index]));
      if (!authoritative.length) continue;
      const winner = selectWinner(authoritative);
      for (const index of indexes) {
        if (index === winner) continue;
        demote(index, 'duplicate-current-turn-position');
      }
      next[winner] = { ...next[winner], layer: 'current', selectedPath: true };
    }

    for (const live of liveRows) {
      const exact = findCacheRowIndex(next, live, { layer: 'current' });
      if (exact >= 0) continue;
      if (!cacheRowHasAuthoritativeCurrentPosition(live)) continue;
      const liveIndex = Math.max(0, Number(live?.idx || live?.index || 0) || 0);
      if (!liveIndex) continue;
      const conflictIndex = next.findIndex((row) => (
        cacheRowLayer(row) === 'current'
        && Math.max(0, Number(row?.idx || row?.index || 0) || 0) === liveIndex
        && cacheRowQuestionId(row)
        && cacheRowQuestionId(live)
        && cacheRowQuestionId(row) !== cacheRowQuestionId(live)
      ));
      if (conflictIndex >= 0) demote(conflictIndex, 'selected-path-position-replaced');
    }

    for (let index = 0; index < next.length; index += 1) {
      const row = next[index];
      if (cacheRowLayer(row) !== 'current' || cacheRowCurrentProof(row) !== CURRENT_PROOF_TRANSIENT) continue;
      const synthetic = isSyntheticAnswerOnlyCurrentRow(row);
      const ownership = evaluateTransientCurrentOwnership(row);
      if (!ownership.owned || ownership.ambiguity) {
        if (ownership.ambiguity && synthetic) {
          noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticOwnerAmbiguousCount', row);
        }
        if (demote(index, synthetic
          ? (ownership.ambiguity ? 'synthetic-owner-ambiguous' : 'ownerless-synthetic-excluded')
          : 'ownerless-transient-current')) {
          noteTransientDiagnosticClaim(diagnosticClaims, 'transientRowsExcluded', row);
          noteTransientDiagnosticClaim(diagnosticClaims, 'ownerlessTransientExcludedCount', row);
          if (synthetic) {
            noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsExcludedCount', row);
          }
        }
        continue;
      }
      noteTransientDiagnosticClaim(diagnosticClaims, 'independentlyOwnedTransientCount', row);
      noteTransientDiagnosticClaim(diagnosticClaims, 'unresolvedTransientCount', row);
      const liveIndex = findCacheRowIndex(liveRows, row, { layer: 'current' });
      if (liveIndex >= 0) {
        if (synthetic) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsPendingCount', row);
        continue;
      }
      const splitLiveMatches = liveRows.filter((liveRow) => (
        !cacheRowQuestionId(liveRow)
        && cacheRowAnswerIds(liveRow).length > 0
        && !!cacheSplitRoleOwnership(row, liveRow)
      ));
      if (splitLiveMatches.length === 1) {
        if (synthetic) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsPendingCount', row);
        continue;
      }
      if (demote(index, synthetic ? 'synthetic-boundary-off-dom' : 'transient-unverified-off-dom')) {
        noteTransientDiagnosticClaim(diagnosticClaims, 'transientRowsExcluded', row);
        if (synthetic) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsExcludedCount', row);
      }
    }

    if (opts?.reindexCurrent !== false) {
      let currentIndex = 0;
      for (let index = 0; index < next.length; index += 1) {
        if (cacheRowLayer(next[index]) === 'current') {
          currentIndex += 1;
          next[index] = { ...next[index], idx: currentIndex };
        }
      }
    }
    const currentRows = next.filter((row) => cacheRowLayer(row) === 'current');
    const historyRows = next.filter((row) => cacheRowLayer(row) === 'history');
    const result = {
      rows: next,
      currentRows,
      historyRows,
      repairedRows,
      demotedRows,
      duplicateCurrentQIdCount,
      splitRoleReconciledCount: splitRepair.reconciledCount,
      splitRoleAmbiguousCount: splitRepair.ambiguousCount,
    };
    applyTransientDiagnosticCounts(result, diagnosticClaims);
    return attachTransientDiagnosticClaims(result, diagnosticClaims);
  }

  function normalizeCacheTurnRowsDetailed(rows, opts = {}) {
    const src = Array.isArray(rows) ? rows : [];
    const out = [];
    let sanitizedRows = 0;
    for (let i = 0; i < src.length; i += 1) {
      const row = normalizeCacheTurnRow(src[i], i + 1);
      if (!row) continue;
      if (cacheTurnRowWasSanitized(src[i], row)) sanitizedRows += 1;
      const existingIndex = out.findIndex((existing) => (
        cacheRowLayer(existing) === cacheRowLayer(row)
        && cacheRowQuestionId(existing) === cacheRowQuestionId(row)
        && cacheRowTurnId(existing) === cacheRowTurnId(row)
      ));
      if (existingIndex >= 0) {
        sanitizedRows += 1;
        out[existingIndex] = mergeCacheVariantEvidence(row, out[existingIndex], row.primaryAId);
      } else {
        out.push(row);
      }
    }
    if (opts?.repairMembership === false) {
      const result = {
        rows: out,
        currentRows: out.filter((row) => cacheRowLayer(row) === 'current'),
        historyRows: out.filter((row) => cacheRowLayer(row) === 'history'),
        sanitizedRows,
        repairedRows: 0,
        demotedRows: 0,
        duplicateCurrentQIdCount: 0,
        splitRoleReconciledCount: 0,
        splitRoleAmbiguousCount: 0,
        transientRowsExcluded: 0,
        independentlyOwnedTransientCount: 0,
        ownerlessTransientExcludedCount: 0,
        unresolvedTransientCount: 0,
        syntheticProofRevocationCount: 0,
        syntheticRowsReconciledCount: 0,
        syntheticRowsExcludedCount: 0,
        syntheticRowsPendingCount: 0,
        syntheticOwnerAmbiguousCount: 0,
      };
      return attachTransientDiagnosticClaims(result, createTransientDiagnosticClaims());
    }
    const repaired = repairCacheCurrentMembership(out, opts);
    const result = {
      ...repaired,
      sanitizedRows: sanitizedRows + repaired.repairedRows,
    };
    return attachTransientDiagnosticClaims(
      result,
      repaired._transientDiagnosticClaims || createTransientDiagnosticClaims(),
    );
  }

  function normalizeCacheTurnRows(rows, opts = {}) {
    return normalizeCacheTurnRowsDetailed(rows, opts).rows;
  }

  function enrichCacheTurnRowsFromPagination(rows, opts = {}) {
    const base = normalizeCacheTurnRows(rows, { ...opts, repairMembership: false });
    if (!base.length) return base;

    const canonical = getCanonicalTurnsFromPagination();
    const canonicalList = Array.isArray(canonical?.list) ? canonical.list : [];
    if (!canonicalList.length) return base;

    const canonicalByTurnId = new Map();
    const canonicalByAnswerId = new Map();
    for (const turn of canonicalList) {
      const turnId = String(turn?.turnId || '').trim();
      const answerId = normalizePaginationAnswerId(turn?.answerId || turn?.primaryAId || '');
      if (turnId) canonicalByTurnId.set(turnId, turn);
      if (answerId) canonicalByAnswerId.set(answerId, turn);
    }

    return base.map((row, idx) => {
      if (cacheRowLayer(row) === 'history') return row;
      if (row?.noAnswer === true) return row;
      const answerId = normalizePaginationAnswerId(row?.answerId || row?.primaryAId || row?.aId || '');
      const turnId = String(row?.turnId || row?.id || '').trim();
      const canonicalTurn =
        canonicalByTurnId.get(turnId)
        || (answerId ? canonicalByAnswerId.get(answerId) : null)
        || null;
      if (!canonicalTurn) return row;

      const nextAnswerId = normalizePaginationAnswerId(canonicalTurn?.answerId || canonicalTurn?.primaryAId || answerId);
      const nextTurnId = String(canonicalTurn?.turnId || turnId || '').trim();

      return normalizeCacheTurnRow({
        ...row,
        idx: Math.max(1, Number(row?.idx || row?.index || idx + 1) || idx + 1),
        turnId: nextTurnId || turnId,
        answerId: nextAnswerId || answerId,
        primaryAId: nextAnswerId || answerId,
      }, idx + 1);
    });
  }

  function minimapPanel() {
    const { SEL } = getRegs();
    try {
      const { panel: refsPanel } = MM_uiRefs();
      if (refsPanel && refsPanel.isConnected) return refsPanel;
    } catch {}
    const all = [
      ...qq(SEL.MINIMAP || ''),
      ...qq(SEL.PANEL || ''),
      ...qq('[data-cgxui$="minimap"]'),
    ].filter((el) => el && el.isConnected);
    if (!all.length) return null;
    return all[all.length - 1] || null;
  }

  function minimapCol(panelEl = null) {
    const { SEL } = getRegs();
    const root = panelEl && panelEl.querySelector ? panelEl : document;
    return q(SEL.MM_COL, root) ||
      q(`[data-cgxui="${UI_TOK.COL}"][data-cgxui-owner="${UI_TOK.OWNER}"]`, root) ||
      q(`[data-cgxui="${UI_TOK.COL_LEGACY}"][data-cgxui-owner="${UI_TOK.OWNER}"]`, root) ||
      q('.cgxui-mm-col', root);
  }

  function ensureCol() {
    let panel = minimapPanel();
    if (!panel) {
      try {
        panel = MM_ui()?.ensureUI?.('core:ensure-col')?.panel || minimapPanel();
      } catch {}
    }
    if (!panel) return null;

    let col = minimapCol(panel);
    if (col) return col;

    col = document.createElement('div');
    col.className = 'cgxui-mm-col';
    col.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    col.setAttribute('data-cgxui', UI_TOK.COL);
    panel.appendChild(col);
    return col;
  }

  function renderCompleteIndexBoundaryState(statusRaw = 'loading-full-index') {
    const status = String(statusRaw || 'loading-full-index');
    const col = ensureCol();
    if (!col) return null;
    const loading = status === 'loading-full-index';
    const marker = document.createElement('div');
    marker.className = 'cgxui-mm-complete-index-status';
    marker.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    marker.setAttribute('data-cgxui', 'mnmp-complete-index-status');
    marker.setAttribute('data-complete-index-status', status);
    marker.setAttribute('role', 'status');
    marker.setAttribute('aria-live', 'polite');
    marker.setAttribute('aria-busy', loading ? 'true' : 'false');
    marker.textContent = loading
      ? 'Loading full conversation index…'
      : 'Full conversation index unavailable';
    marker.style.cssText = [
      'box-sizing:border-box',
      'width:72px',
      'min-height:36px',
      'padding:7px 6px',
      'border-radius:8px',
      'font:600 10px/1.15 system-ui,sans-serif',
      'text-align:center',
      'color:currentColor',
      'opacity:.78',
      'contain:content',
    ].join(';');
    col.replaceChildren(marker);
    setMapStore(new Map());
    S.completeIndexBoundaryStatus = status;
    S.completeIndexBoundaryRenderCount += 1;
    return marker;
  }

  function clearCompleteIndexBoundaryState() {
    const col = minimapCol(MM_uiRefs()?.panel || null) || minimapCol() || null;
    const marker = col?.querySelector?.('[data-cgxui="mnmp-complete-index-status"]') || null;
    try { marker?.remove?.(); } catch {}
    S.completeIndexBoundaryStatus = 'complete';
    return !!marker;
  }

  function ensureMapStore() {
    if (S.mapButtons instanceof Map) return S.mapButtons;
    const m =
      (W.H2O_MM_mapButtons instanceof Map) ? W.H2O_MM_mapButtons :
      (W.mapButtons instanceof Map) ? W.mapButtons :
      new Map();
    return setMapStore(m);
  }

  function setMapStore(nextMap) {
    const incoming = (nextMap instanceof Map) ? nextMap : new Map();
    const live =
      (S.mapButtons instanceof Map) ? S.mapButtons :
      (W.H2O_MM_mapButtons instanceof Map) ? W.H2O_MM_mapButtons :
      (W.mapButtons instanceof Map) ? W.mapButtons :
      null;
    const m = live || incoming;
    if (m !== incoming) {
      const entries = Array.from(incoming.entries());
      m.clear();
      for (const [key, value] of entries) m.set(key, value);
    }
    S.mapButtons = m;
    try { W.H2O_MM_mapButtons = m; } catch {}
    try { W.mapButtons = m; } catch {}
    return m;
  }

  function replaceArrayContents(target, nextItems) {
    const out = Array.isArray(target) ? target : [];
    const items = (out === nextItems) ? nextItems.slice() : (Array.isArray(nextItems) ? nextItems : []);
    out.length = 0;
    for (const item of items) out.push(item);
    return out;
  }

  function replaceMapContents(target, nextMap) {
    const out = (target instanceof Map) ? target : new Map();
    const entries = (out === nextMap)
      ? Array.from(nextMap.entries())
      : Array.from((nextMap instanceof Map ? nextMap : new Map()).entries());
    out.clear();
    for (const [key, value] of entries) out.set(key, value);
    return out;
  }

  function publishTurnSnapshot(snapshot = null) {
    const next = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const list = Array.isArray(next.list) ? next.list : [];
    const byId = (next.byId instanceof Map) ? next.byId : new Map();
    const byAId = (next.byAId instanceof Map) ? next.byAId : new Map();
    const answerByTurn = (next.answerByTurn instanceof Map) ? next.answerByTurn : new Map();
    const answers = Array.isArray(next.answers) ? next.answers : [];

    S.turnList = replaceArrayContents(S.turnList, list);
    S.turnById = replaceMapContents(S.turnById, byId);
    S.turnIdByAId = replaceMapContents(S.turnIdByAId, byAId);
    S.answerByTurnId = replaceMapContents(S.answerByTurnId, answerByTurn);
    S.answerEls = replaceArrayContents(S.answerEls, answers);

    const byIdGlobal =
      (W.H2O_MM_turnById instanceof Map) ? W.H2O_MM_turnById :
      new Map();
    const byAIdGlobal =
      (W.H2O_MM_turnIdByAId instanceof Map) ? W.H2O_MM_turnIdByAId :
      new Map();
    replaceMapContents(byIdGlobal, byId);
    replaceMapContents(byAIdGlobal, byAId);
    try { W.H2O_MM_turnById = byIdGlobal; } catch {}
    try { W.H2O_MM_turnIdByAId = byAIdGlobal; } catch {}
    try { renderChatPageDividers(resolveChatId()); } catch {}

    return {
      list: S.turnList,
      byId: S.turnById,
      byAId: S.turnIdByAId,
      answerByTurn: S.answerByTurnId,
      answers: S.answerEls,
    };
  }

  function mmIdxNow() {
    const now = Date.now();
    return Number.isFinite(now) ? now : 0;
  }

  // Compatibility shim: keep shell/engine contracts stable while mm_index persistence is removed from Core.
  function mmIdxEmitHydrated(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || '').trim(),
      source: String(detail?.source || 'core'),
      status: String(detail?.status || 'noop'),
      turnCount: Number(detail?.turnCount || 0),
      renderedCount: Number(detail?.renderedCount || 0),
      ts: Number(detail?.ts || mmIdxNow()),
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_INDEX_HYDRATED, { detail: out })); } catch {}
    return out;
  }

  function hydrateIndexFromDisk(chatId = '', opts = {}) {
    const detail = mmIdxEmitHydrated({
      chatId: String(chatId || '').trim(),
      source: String(opts?.source || 'core'),
      status: 'noop',
      turnCount: 0,
      renderedCount: 0,
    });
    return { ok: false, status: 'noop', detail };
  }

  function renderFromIndex(chatId = '', _idxObj = null, opts = {}) {
    return hydrateIndexFromDisk(chatId, opts);
  }

  function loadTurnCache(chatId = '', opts = {}) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return null;
    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return null;

    const rawTurns = storageGetJSON(turnsKey, null);
    const preNormalization = normalizeCacheTurnRowsDetailed(rawTurns, { repairMembership: false });
    const enrichedRows = enrichCacheTurnRowsFromPagination(preNormalization.rows, { repairMembership: false });
    let liveRows = Array.isArray(opts?.liveRows) ? opts.liveRows : [];
    if (!liveRows.length) {
      try { liveRows = getCanonicalTurnsFromSharedRuntime()?.list || []; } catch { liveRows = []; }
    }
    const normalization = normalizeCacheTurnRowsDetailed(enrichedRows, {
      liveRows,
      reindexCurrent: opts?.reindexCurrent !== false,
    });
    normalization.sanitizedRows += Number(preNormalization.sanitizedRows || 0);
    const turns = normalization.rows;
    if (!turns.length) return null;

    const currentTurns = normalization.currentRows;
    const historyTurns = normalization.historyRows;

    const last = currentTurns[currentTurns.length - 1] || turns[turns.length - 1] || null;
    const rawMeta = storageGetJSON(metaKey, null);
    const meta = {
      chatId: id,
      turnCount: turns.length,
      publishedTurnCount: currentTurns.length,
      historicalTurnCount: historyTurns.length,
      cacheLayout: Math.max(1, Number(rawMeta?.cacheLayout || 1) || 1),
      lastTurnId: String(rawMeta?.lastTurnId || last?.turnId || '').trim(),
      updatedAt: Number(rawMeta?.updatedAt || 0) || mmIdxNow(),
    };
    const lastActiveTurnId = String(rawMeta?.lastActiveTurnId || '').trim();
    const lastActiveAnswerId = String(rawMeta?.lastActiveAnswerId || '').trim();
    if (lastActiveTurnId) meta.lastActiveTurnId = lastActiveTurnId;
    if (lastActiveAnswerId) meta.lastActiveAnswerId = lastActiveAnswerId;

    const normalizationSummary = {
      sanitizedRows: Number(normalization.sanitizedRows || 0),
      repairedRows: Number(normalization.repairedRows || 0),
      demotedRows: Number(normalization.demotedRows || 0),
      duplicateCurrentQIdCount: Number(normalization.duplicateCurrentQIdCount || 0),
      splitRoleReconciledCount: Number(normalization.splitRoleReconciledCount || 0),
      splitRoleAmbiguousCount: Number(normalization.splitRoleAmbiguousCount || 0),
      transientRowsExcluded: Number(normalization.transientRowsExcluded || 0),
      independentlyOwnedTransientCount: Number(normalization.independentlyOwnedTransientCount || 0),
      ownerlessTransientExcludedCount: Number(normalization.ownerlessTransientExcludedCount || 0),
      unresolvedTransientCount: Number(normalization.unresolvedTransientCount || 0),
      syntheticProofRevocationCount: Number(normalization.syntheticProofRevocationCount || 0),
      syntheticRowsReconciledCount: Number(normalization.syntheticRowsReconciledCount || 0),
      syntheticRowsExcludedCount: Number(normalization.syntheticRowsExcludedCount || 0),
      syntheticRowsPendingCount: Number(normalization.syntheticRowsPendingCount || 0),
      syntheticOwnerAmbiguousCount: Number(normalization.syntheticOwnerAmbiguousCount || 0),
    };
    attachTransientDiagnosticClaims(
      normalizationSummary,
      normalization._transientDiagnosticClaims || createTransientDiagnosticClaims(),
    );

    return {
      meta,
      turns,
      currentTurns,
      historyTurns,
      normalization: normalizationSummary,
    };
  }

  function clearTurnCache(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing' };

    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return { ok: false, status: 'key-missing' };

    const okTurns = storageRemove(turnsKey);
    const okMeta = storageRemove(metaKey);
    return {
      ok: !!(okTurns && okMeta),
      status: (okTurns && okMeta) ? 'ok' : 'remove-failed',
      chatId: id,
    };
  }

  function validateAuthoritativeShrinkProof(proof, context = {}) {
    const chatId = String(context?.chatId || '').trim();
    const cachedMeta = context?.cachedMeta && typeof context.cachedMeta === 'object'
      ? context.cachedMeta
      : {};
    const input = proof && typeof proof === 'object' ? proof : null;
    const result = {
      ok: false,
      reason: 'shrink-proof-missing',
      chatId,
      cause: '',
      removedQIds: [],
      freshness: 0,
    };
    if (!input) return result;

    const proofChatId = String(input.chatId || input.chatKey || '').trim();
    if (!chatId || proofChatId !== chatId) {
      result.reason = 'shrink-proof-chat-mismatch';
      return result;
    }
    const complete = input.complete === true || String(input.completeness || '').trim() === 'complete';
    if (!complete) {
      result.reason = 'shrink-proof-incomplete';
      return result;
    }
    const cause = String(input.cause || '').trim();
    if (!CACHE_SHRINK_CAUSES.has(cause)) {
      result.reason = 'shrink-proof-cause-invalid';
      return result;
    }
    const removedQIds = [];
    const seen = new Set();
    for (const value of (Array.isArray(input.removedQIds) ? input.removedQIds : [])) {
      const qId = String(value || '').trim();
      if (!qId || seen.has(qId)) continue;
      seen.add(qId);
      removedQIds.push(qId);
      if (removedQIds.length > CACHE_SHRINK_REMOVAL_LIMIT) {
        result.reason = 'shrink-proof-removals-unbounded';
        return result;
      }
    }
    if (!removedQIds.length) {
      result.reason = 'shrink-proof-removals-missing';
      return result;
    }
    const freshness = Number(input.freshness || input.updatedAt || input.observedAt || 0);
    if (!Number.isFinite(freshness) || freshness <= Number(cachedMeta?.updatedAt || 0)) {
      result.reason = 'shrink-proof-not-fresh';
      return result;
    }
    return {
      ok: true,
      reason: 'authoritative-shrink-proven',
      chatId,
      cause,
      removedQIds,
      freshness,
    };
  }

  function missingCachedMembership(existingRows, incomingRows) {
    const incoming = Array.isArray(incomingRows) ? incomingRows : [];
    const qIds = [];
    let unresolvedCount = 0;
    for (const row of (Array.isArray(existingRows) ? existingRows : [])) {
      if (findCacheRowIndex(incoming, row) >= 0) continue;
      const qId = cacheRowQuestionId(row);
      if (!qId) {
        unresolvedCount += 1;
        continue;
      }
      if (!qIds.includes(qId)) qIds.push(qId);
    }
    return { qIds, unresolvedCount };
  }

  function validateCurrentLayerMembership(rows = []) {
    const currentRows = (Array.isArray(rows) ? rows : [])
      .filter((row) => cacheRowLayer(row) === 'current');
    const qIds = new Set();
    const turnIds = new Set();
    const primaryIds = new Set();
    const turnIndexes = new Set();
    let duplicateQuestionCount = 0;
    let duplicateTurnCount = 0;
    let duplicatePrimaryCount = 0;
    let duplicateTurnIndexCount = 0;
    for (const row of currentRows) {
      const qId = cacheRowQuestionId(row);
      const turnId = cacheRowTurnId(row);
      const primaryAId = String(row?.primaryAId || row?.answerId || '').trim();
      const turnIndex = Math.max(0, Number(row?.idx || row?.index || 0) || 0);
      if (qId) {
        if (qIds.has(qId)) duplicateQuestionCount += 1;
        qIds.add(qId);
      }
      if (turnId) {
        if (turnIds.has(turnId)) duplicateTurnCount += 1;
        turnIds.add(turnId);
      }
      if (primaryAId) {
        if (primaryIds.has(primaryAId)) duplicatePrimaryCount += 1;
        primaryIds.add(primaryAId);
      }
      if (turnIndex > 0) {
        if (turnIndexes.has(turnIndex)) duplicateTurnIndexCount += 1;
        turnIndexes.add(turnIndex);
      }
    }
    const reasons = [];
    const splitRelationships = findCacheSplitRoleProposals(currentRows);
    const splitRoleDuplicateCount = splitRelationships.accepted.length;
    if (duplicateQuestionCount) reasons.push('duplicate-current-qid');
    if (duplicateTurnCount) reasons.push('duplicate-current-turn-id');
    if (duplicatePrimaryCount) reasons.push('duplicate-current-primary-id');
    if (duplicateTurnIndexCount) reasons.push('duplicate-current-turn-index');
    if (splitRoleDuplicateCount) reasons.push('split-role-duplicate');
    return {
      ok: reasons.length === 0,
      currentCount: currentRows.length,
      duplicateQuestionCount,
      duplicateTurnCount,
      duplicatePrimaryCount,
      duplicateTurnIndexCount,
      splitRoleDuplicateCount,
      reasons,
    };
  }

  function cacheRowOwnedAnswerIds(row) {
    const candidates = [
      ...cacheRowAnswerIds(row),
      ...(Array.isArray(row?.currentAnswerIds) ? row.currentAnswerIds : []),
      ...(Array.isArray(row?.answerAliases) ? row.answerAliases : []),
      ...(Array.isArray(row?.answerResolverAliases) ? row.answerResolverAliases : []),
      ...(Array.isArray(row?.variants) ? row.variants.map((variant) => (
        typeof variant === 'string'
          ? variant
          : (variant?.answerId || variant?.primaryAId || variant?.id || '')
      )) : []),
    ];
    const qId = cacheRowQuestionId(row);
    const turnId = cacheRowTurnId(row);
    const out = [];
    const seen = new Set();
    for (const value of candidates) {
      const answerId = String(value || '').trim();
      if (
        !answerId
        || answerId === qId
        || answerId === turnId
        || answerId.startsWith('turn:')
        || seen.has(answerId)
      ) continue;
      seen.add(answerId);
      out.push(answerId);
    }
    return out;
  }

  function inspectCrossQIdAnswerOwnership(rows = [], limit = 12) {
    const ownersByAnswer = new Map();
    const source = Array.isArray(rows) ? rows : [];
    for (let index = 0; index < source.length; index += 1) {
      const row = source[index];
      const qId = cacheRowQuestionId(row);
      if (!qId || row?.noAnswer === true || row?.hasAssistant === false) continue;
      for (const answerId of cacheRowOwnedAnswerIds(row)) {
        if (!ownersByAnswer.has(answerId)) ownersByAnswer.set(answerId, new Map());
        const qOwners = ownersByAnswer.get(answerId);
        if (!qOwners.has(qId)) qOwners.set(qId, { layers: new Set(), indexes: [] });
        const owner = qOwners.get(qId);
        owner.layers.add(cacheRowLayer(row));
        if (owner.indexes.length < 8) owner.indexes.push(index);
      }
    }

    const evidenceLimit = Math.max(1, Math.min(24, Number(limit || 12) || 12));
    const conflicts = [];
    let conflictCount = 0;
    for (const [answerId, qOwners] of ownersByAnswer) {
      if (qOwners.size < 2) continue;
      conflictCount += 1;
      if (conflicts.length >= evidenceLimit) continue;
      conflicts.push(Object.freeze({
        answerId,
        qIds: Array.from(qOwners.keys()).slice(0, 8),
        owners: Array.from(qOwners.entries()).slice(0, 8).map(([qId, owner]) => Object.freeze({
          qId,
          layers: Array.from(owner.layers).slice(0, 2),
          indexes: owner.indexes.slice(0, 8),
        })),
      }));
    }
    return Object.freeze({
      ok: conflictCount === 0,
      conflictCount,
      conflicts: Object.freeze(conflicts),
      truncated: conflictCount > conflicts.length,
    });
  }

  function boundedCacheMergeDecision(decision = null) {
    if (!decision || typeof decision !== 'object') return null;
    const cachedCount = Math.max(0, Number(decision.cachedCount || 0) || 0);
    const liveCount = Math.max(0, Number(decision.liveCount || 0) || 0);
    const outputCount = Math.max(0, Number(decision.outputCount || 0) || 0);
    const liveCurrentCount = decision.liveCurrentCount != null && Number.isFinite(Number(decision.liveCurrentCount))
      ? Math.max(0, Number(decision.liveCurrentCount))
      : null;
    return Object.freeze({
      accepted: decision.accepted === true,
      mode: String(decision.mode || 'unknown'),
      cachedCount,
      liveCount,
      outputCount,
      overlapCount: Math.max(0, Number(decision.overlapCount || 0) || 0),
      sanitizedRows: Math.max(0, Number(decision.sanitizedRows || 0) || 0),
      retainedCount: Math.max(0, Number(decision.retainedCount ?? decision.totalRetainedCount ?? outputCount) || 0),
      publishedCurrentCount: Math.max(0, Number(decision.publishedCurrentCount ?? outputCount) || 0),
      historicalRetainedCount: Math.max(0, Number(decision.historicalRetainedCount || 0) || 0),
      cachedCurrentCount: Math.max(0, Number(decision.cachedCurrentCount ?? cachedCount) || 0),
      cachedHistoricalCount: Math.max(0, Number(decision.cachedHistoricalCount || 0) || 0),
      liveCurrentCount,
      offDomCurrentRetainedCount: Math.max(0, Number(decision.offDomCurrentRetainedCount || 0) || 0),
      repairedRows: Math.max(0, Number(decision.repairedRows || 0) || 0),
      demotedRows: Math.max(0, Number(decision.demotedRows || 0) || 0),
      duplicateCurrentQIdCount: Math.max(0, Number(decision.duplicateCurrentQIdCount || 0) || 0),
      splitRoleReconciledCount: Math.max(0, Number(decision.splitRoleReconciledCount || 0) || 0),
      splitRoleAmbiguousCount: Math.max(0, Number(decision.splitRoleAmbiguousCount || 0) || 0),
      transientRowsExcluded: Math.max(0, Number(decision.transientRowsExcluded || 0) || 0),
      independentlyOwnedTransientCount: Math.max(0, Number(decision.independentlyOwnedTransientCount || 0) || 0),
      ownerlessTransientExcludedCount: Math.max(0, Number(decision.ownerlessTransientExcludedCount || 0) || 0),
      unresolvedTransientCount: Math.max(0, Number(decision.unresolvedTransientCount || 0) || 0),
      syntheticProofRevocationCount: Math.max(0, Number(decision.syntheticProofRevocationCount || 0) || 0),
      syntheticRowsReconciledCount: Math.max(0, Number(decision.syntheticRowsReconciledCount || 0) || 0),
      syntheticRowsExcludedCount: Math.max(0, Number(decision.syntheticRowsExcludedCount || 0) || 0),
      syntheticRowsPendingCount: Math.max(0, Number(decision.syntheticRowsPendingCount || 0) || 0),
      syntheticOwnerAmbiguousCount: Math.max(0, Number(decision.syntheticOwnerAmbiguousCount || 0) || 0),
      syntheticPublishedCurrentCount: Math.max(0, Number(decision.syntheticPublishedCurrentCount || 0) || 0),
      authoritativeLiveInput: decision.authoritativeLiveInput === true,
      authoritativeLiveProjectedCount: decision.authoritativeLiveProjectedCount != null
        && Number.isFinite(Number(decision.authoritativeLiveProjectedCount))
        ? Math.max(0, Number(decision.authoritativeLiveProjectedCount))
        : null,
      internalMergeInputCount: decision.internalMergeInputCount != null
        && Number.isFinite(Number(decision.internalMergeInputCount))
        ? Math.max(0, Number(decision.internalMergeInputCount))
        : null,
      bijectionProven: decision.bijectionProven === true,
      reason: String(decision.reason || ''),
      completeness: liveCurrentCount != null && outputCount > liveCurrentCount
        ? 'incomplete'
        : 'unknown',
    });
  }

  function rememberCacheMergeDecision(chatId = '', decision = null) {
    const chatKey = String(chatId || resolveChatId() || '').trim();
    S.lastCacheMergeChatKey = chatKey;
    S.lastCacheMergeDecision = boundedCacheMergeDecision(decision);
    if (S.lastCacheMergeDecision?.authoritativeLiveInput) {
      S.lastCoreProjectionChatKey = chatKey;
      S.lastCoreProjectedTotal = S.lastCacheMergeDecision.authoritativeLiveProjectedCount;
    } else if (S.lastCacheMergeDecision) {
      S.lastInternalMergeInputTotal = S.lastCacheMergeDecision.internalMergeInputCount;
    }
    return decision;
  }

  function boundedCachePersistenceDecision(result = null) {
    if (!result || typeof result !== 'object') return null;
    const previousRaw = result.previousTurnsCount ?? result.existingCount;
    const incomingRaw = result.turnsCount ?? result.incomingCount;
    const previousCount = Number.isFinite(Number(previousRaw))
      ? Math.max(0, Number(previousRaw))
      : null;
    const incomingCount = Number.isFinite(Number(incomingRaw))
      ? Math.max(0, Number(incomingRaw))
      : null;
    const proofAccepted = !!result.shrinkProof;
    return Object.freeze({
      ok: result.ok === true,
      status: String(result.status || 'unknown'),
      previousCount,
      incomingCount,
      publishedCurrentCount: Number.isFinite(Number(result.publishedTurnCount))
        ? Math.max(0, Number(result.publishedTurnCount))
        : null,
      historicalRetainedCount: Number.isFinite(Number(result.historicalTurnCount))
        ? Math.max(0, Number(result.historicalTurnCount))
        : null,
      proofAccepted,
      crossQIdAnswerConflictCount: Math.max(0, Number(result.crossQIdAnswerConflictCount || 0) || 0),
      crossQIdAnswerConflicts: Object.freeze((Array.isArray(result.crossQIdAnswerConflicts)
        ? result.crossQIdAnswerConflicts
        : []).slice(0, 12).map((conflict) => Object.freeze({
        answerId: String(conflict?.answerId || ''),
        qIds: Object.freeze((Array.isArray(conflict?.qIds) ? conflict.qIds : []).slice(0, 8)),
      }))),
      reason: String(
        result.proofReason
        || result.shrinkProof?.cause
        || result.reason
        || result.status
        || ''
      ),
    });
  }

  function rememberCachePersistenceDecision(chatId = '', result = null) {
    const chatKey = String(chatId || resolveChatId() || '').trim();
    S.lastCachePersistenceChatKey = chatKey;
    S.lastCachePersistenceDecision = boundedCachePersistenceDecision(result);
    return result;
  }

  function getCacheCompletenessDiagnostics() {
    const chatKey = String(resolveChatId() || '').trim() || null;
    const mergeSameChat = !!chatKey && chatKey === S.lastCacheMergeChatKey;
    const persistenceSameChat = !!chatKey && chatKey === S.lastCachePersistenceChatKey;
    const projectionSameChat = !!chatKey && chatKey === S.lastCoreProjectionChatKey;
    const lastMergeDecision = mergeSameChat
      ? boundedCacheMergeDecision(S.lastCacheMergeDecision)
      : null;
    const lastPersistenceDecision = persistenceSameChat
      ? boundedCachePersistenceDecision(S.lastCachePersistenceDecision)
      : null;
    const publishedTurnCount = Math.max(0, Number(S.turnList.length || 0) || 0);
    const observedTurnCount = projectionSameChat && Number.isFinite(Number(S.lastCoreProjectedTotal))
      ? Math.max(0, Number(S.lastCoreProjectedTotal))
      : null;
    let cachedTurnCount = null;
    if (lastPersistenceDecision) {
      cachedTurnCount = lastPersistenceDecision.ok
        ? lastPersistenceDecision.incomingCount
        : lastPersistenceDecision.previousCount;
    }
    if (cachedTurnCount == null) cachedTurnCount = lastMergeDecision?.cachedCount ?? null;
    const retainedStateCount = S.retainedTurnChatKey === chatKey
      ? Math.max(0, Number(S.retainedTurnList.length || 0) || 0)
      : 0;
    const retainedBase = Math.max(
      retainedStateCount,
      publishedTurnCount,
      Number.isFinite(Number(cachedTurnCount)) ? Number(cachedTurnCount) : 0,
    );
    const historicalRetainedCount = lastMergeDecision?.historicalRetainedCount
      ?? (S.retainedTurnChatKey === chatKey
        ? S.retainedTurnList.filter((row) => cacheRowLayer(row) === 'history').length
        : 0);
    const offDomRetainedCount = observedTurnCount == null
      ? null
      : Math.max(0, publishedTurnCount - observedTurnCount);
    return Object.freeze({
      chatKey,
      cachedTurnCount,
      publishedTurnCount,
      observedTurnCount,
      offDomRetainedCount,
      totalRetainedCount: retainedBase,
      historicalRetainedCount,
      offDomCurrentRetainedCount: offDomRetainedCount,
      repairedOrDemotedRowCount: Math.max(0, Number(lastMergeDecision?.repairedRows || 0) || 0),
      authoritativeLiveProjectedCount: observedTurnCount,
      internalMergeInputCount: lastMergeDecision?.internalMergeInputCount ?? S.lastInternalMergeInputTotal,
      independentlyOwnedTransientCount: Math.max(0, Number(lastMergeDecision?.independentlyOwnedTransientCount || 0) || 0),
      ownerlessTransientExcludedCount: Math.max(0, Number(lastMergeDecision?.ownerlessTransientExcludedCount || 0) || 0),
      unresolvedTransientCount: Math.max(0, Number(lastMergeDecision?.unresolvedTransientCount || 0) || 0),
      syntheticProofRevocationCount: Math.max(0, Number(lastMergeDecision?.syntheticProofRevocationCount || 0) || 0),
      syntheticRowsReconciledCount: Math.max(0, Number(lastMergeDecision?.syntheticRowsReconciledCount || 0) || 0),
      syntheticRowsExcludedCount: Math.max(0, Number(lastMergeDecision?.syntheticRowsExcludedCount || 0) || 0),
      syntheticRowsPendingCount: Math.max(0, Number(lastMergeDecision?.syntheticRowsPendingCount || 0) || 0),
      syntheticOwnerAmbiguousCount: Math.max(0, Number(lastMergeDecision?.syntheticOwnerAmbiguousCount || 0) || 0),
      syntheticPublishedCurrentCount: Math.max(0, Number(lastMergeDecision?.syntheticPublishedCurrentCount || 0) || 0),
      lastMergeDecision,
      lastPersistenceDecision,
    });
  }

  function saveTurnCache(chatId = '', turns = [], opts = {}) {
    const id = String(chatId || resolveChatId()).trim();
    const finish = (result) => rememberCachePersistenceDecision(id, result);
    if (!id) return finish({ ok: false, status: 'chat-id-missing' });
    if (selectedPathPresentationActive()) {
      return finish({
        ok: true,
        status: 'selected-path-overlay-skipped',
        chatId: id,
        writesAttempted: 0,
      });
    }

    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return finish({ ok: false, status: 'key-missing' });

    const suppliedMembership = validateCurrentLayerMembership(turns);
    if (!suppliedMembership.ok) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        chatId: id,
        incomingCount: Array.isArray(turns) ? turns.length : 0,
        currentCount: suppliedMembership.currentCount,
        duplicateQuestionCount: suppliedMembership.duplicateQuestionCount,
        duplicateTurnCount: suppliedMembership.duplicateTurnCount,
        duplicatePrimaryCount: suppliedMembership.duplicatePrimaryCount,
        duplicateTurnIndexCount: suppliedMembership.duplicateTurnIndexCount,
        splitRoleDuplicateCount: suppliedMembership.splitRoleDuplicateCount,
        reasons: suppliedMembership.reasons.slice(0, 8),
        writesAttempted: 0,
      });
    }

    const suppliedCrossQIdOwnership = inspectCrossQIdAnswerOwnership(turns);
    if (!suppliedCrossQIdOwnership.ok) {
      return finish({
        ok: false,
        status: 'cross-qid-answer-ownership-conflict',
        reason: 'cross-qid-answer-ownership-conflict',
        reasons: ['cross-qid-answer-ownership-conflict'],
        chatId: id,
        incomingCount: Array.isArray(turns) ? turns.length : 0,
        crossQIdAnswerConflictCount: suppliedCrossQIdOwnership.conflictCount,
        crossQIdAnswerConflicts: suppliedCrossQIdOwnership.conflicts,
        crossQIdAnswerConflictsTruncated: suppliedCrossQIdOwnership.truncated,
        writesAttempted: 0,
      });
    }

    const suppliedSyntheticOwnership = (Array.isArray(turns) ? turns : [])
      .filter((row) => isSyntheticAnswerOnlyCurrentRow(row))
      .map((row) => ({ row, ownership: evaluateTransientCurrentOwnership(row) }));
    const suppliedSyntheticClaims = new Map();
    for (const entry of suppliedSyntheticOwnership) {
      const claim = transientOwnershipClaim(entry.ownership);
      if (!claim) continue;
      suppliedSyntheticClaims.set(claim, (suppliedSyntheticClaims.get(claim) || 0) + 1);
    }
    const suppliedSyntheticAmbiguity = suppliedSyntheticOwnership.filter((entry) => {
      const claim = transientOwnershipClaim(entry.ownership);
      return !!entry.ownership?.ambiguity || (!!claim && suppliedSyntheticClaims.get(claim) !== 1);
    });
    if (suppliedSyntheticAmbiguity.length) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        reason: 'synthetic-owner-ambiguous',
        reasons: ['synthetic-owner-ambiguous'],
        chatId: id,
        incomingCount: Array.isArray(turns) ? turns.length : 0,
        ambiguousSyntheticOwnerCount: suppliedSyntheticAmbiguity.length,
        writesAttempted: 0,
      });
    }

    const existingRawTurns = storageGetJSON(turnsKey, null);
    const existingRawMeta = storageGetJSON(metaKey, null);
    const existingPre = normalizeCacheTurnRowsDetailed(existingRawTurns, { repairMembership: false });
    const existingEnriched = enrichCacheTurnRowsFromPagination(existingPre.rows, { repairMembership: false });
    const existingRows = normalizeCacheTurnRowsDetailed(existingEnriched, {
      liveRows: Array.isArray(opts?.liveRows) ? opts.liveRows : [],
    }).rows;
    const incomingPre = normalizeCacheTurnRowsDetailed(turns, { repairMembership: false });
    const incomingEnriched = enrichCacheTurnRowsFromPagination(incomingPre.rows, { repairMembership: false });
    let rows = normalizeCacheTurnRowsDetailed(incomingEnriched, { repairMembership: false }).rows;
    if (!rows.length) return finish({ ok: false, status: 'turns-empty', turnsCount: 0 });

    const syntheticEntries = rows
      .map((row, index) => ({
        row,
        index,
        ownership: isSyntheticAnswerOnlyCurrentRow(row)
          ? evaluateTransientCurrentOwnership(row)
          : null,
      }))
      .filter((entry) => !!entry.ownership);
    const syntheticClaimCounts = new Map();
    for (const entry of syntheticEntries) {
      const claim = transientOwnershipClaim(entry.ownership);
      if (!claim) continue;
      syntheticClaimCounts.set(claim, (syntheticClaimCounts.get(claim) || 0) + 1);
    }
    const ambiguousSyntheticOwnership = syntheticEntries.filter((entry) => {
      const claim = transientOwnershipClaim(entry.ownership);
      return !!entry.ownership?.ambiguity || (!!claim && syntheticClaimCounts.get(claim) !== 1);
    });
    if (ambiguousSyntheticOwnership.length) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        reason: 'synthetic-owner-ambiguous',
        reasons: ['synthetic-owner-ambiguous'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        ambiguousSyntheticOwnerCount: ambiguousSyntheticOwnership.length,
        writesAttempted: 0,
      });
    }

    const syntheticReplacements = new Map();
    const syntheticRemovedIndexes = new Set();
    for (const entry of syntheticEntries) {
      const reconciled = reconcileSyntheticCurrentRow(entry.row, entry.ownership);
      if (!reconciled) continue;
      const qId = cacheRowQuestionId(reconciled);
      const matchingIndexes = rows.reduce((out, candidate, index) => {
        if (
          index !== entry.index
          && cacheRowLayer(candidate) === 'current'
          && cacheRowQuestionId(candidate) === qId
        ) out.push(index);
        return out;
      }, []);
      if (matchingIndexes.length > 1) {
        return finish({
          ok: false,
          status: 'malformed-membership',
          reason: 'synthetic-owner-ambiguous',
          reasons: ['synthetic-owner-ambiguous'],
          chatId: id,
          existingCount: existingRows.length,
          incomingCount: rows.length,
          ambiguousSyntheticOwnerCount: matchingIndexes.length,
          writesAttempted: 0,
        });
      }
      if (matchingIndexes.length === 1) {
        const targetIndex = matchingIndexes[0];
        const target = syntheticReplacements.get(targetIndex) || rows[targetIndex];
        const primaryAId = String(reconciled?.primaryAId || reconciled?.answerId || '').trim();
        const merged = mergeCacheVariantEvidence({
          ...target,
          ...reconciled,
          qId,
          questionId: qId,
          turnId: `turn:${qId}`,
          noAnswer: false,
          hasAssistant: true,
          layer: 'current',
          selectedPath: true,
          currentProof: CURRENT_PROOF_PROVEN,
        }, target, primaryAId);
        syntheticReplacements.set(targetIndex, merged);
        syntheticRemovedIndexes.add(entry.index);
      } else {
        syntheticReplacements.set(entry.index, reconciled);
      }
    }
    rows = rows
      .map((row, index) => syntheticReplacements.get(index) || row)
      .filter((_row, index) => !syntheticRemovedIndexes.has(index));

    const unresolvedSynthetic = rows
      .filter((row) => isSyntheticAnswerOnlyCurrentRow(row))
      .map((row) => ({ row, ownership: evaluateTransientCurrentOwnership(row) }));
    const ownerlessSynthetic = unresolvedSynthetic.filter((entry) => !entry.ownership.owned);
    if (ownerlessSynthetic.length) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        reason: 'ownerless-synthetic-current',
        reasons: ['ownerless-synthetic-current'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        ownerlessSyntheticCount: ownerlessSynthetic.length,
        writesAttempted: 0,
      });
    }
    if (unresolvedSynthetic.length) {
      return finish({
        ok: false,
        status: 'transient-pending-ownership',
        reason: 'synthetic-boundary-pending',
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        syntheticPendingCount: unresolvedSynthetic.length,
        writesAttempted: 0,
      });
    }

    const initialMembership = validateCurrentLayerMembership(rows);
    if (!initialMembership.ok) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        currentCount: initialMembership.currentCount,
        duplicateQuestionCount: initialMembership.duplicateQuestionCount,
        duplicateTurnCount: initialMembership.duplicateTurnCount,
        duplicatePrimaryCount: initialMembership.duplicatePrimaryCount,
        duplicateTurnIndexCount: initialMembership.duplicateTurnIndexCount,
        splitRoleDuplicateCount: initialMembership.splitRoleDuplicateCount,
        reasons: initialMembership.reasons.slice(0, 8),
        writesAttempted: 0,
      });
    }

    const normalizedCrossQIdOwnership = inspectCrossQIdAnswerOwnership(rows);
    if (!normalizedCrossQIdOwnership.ok) {
      return finish({
        ok: false,
        status: 'cross-qid-answer-ownership-conflict',
        reason: 'cross-qid-answer-ownership-conflict',
        reasons: ['cross-qid-answer-ownership-conflict'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        crossQIdAnswerConflictCount: normalizedCrossQIdOwnership.conflictCount,
        crossQIdAnswerConflicts: normalizedCrossQIdOwnership.conflicts,
        crossQIdAnswerConflictsTruncated: normalizedCrossQIdOwnership.truncated,
        writesAttempted: 0,
      });
    }

    const transientOwnership = rows
      .filter((row) => (
        cacheRowLayer(row) === 'current'
        && cacheRowCurrentProof(row) === CURRENT_PROOF_TRANSIENT
        && !isSyntheticAnswerOnlyCurrentRow(row)
      ))
      .map((row) => ({ row, ownership: evaluateTransientCurrentOwnership(row) }));
    const transientClaims = new Map();
    for (const entry of transientOwnership) {
      const claim = transientOwnershipClaim(entry.ownership);
      if (!claim) continue;
      transientClaims.set(claim, (transientClaims.get(claim) || 0) + 1);
    }
    const ambiguousTransientClaims = Array.from(transientClaims.values()).filter((count) => count > 1).length;
    if (ambiguousTransientClaims) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        reason: 'transient-owner-ambiguous',
        reasons: ['transient-owner-ambiguous'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        ambiguousTransientOwnerCount: ambiguousTransientClaims,
        writesAttempted: 0,
      });
    }
    const ownerlessTransient = transientOwnership.filter((entry) => !entry.ownership.owned);
    if (ownerlessTransient.length) {
      return finish({
        ok: false,
        status: 'malformed-membership',
        reason: 'ownerless-transient-current',
        reasons: ['ownerless-transient-current'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        ownerlessTransientCount: ownerlessTransient.length,
        writesAttempted: 0,
      });
    }
    const hostOnlyTransient = transientOwnership.filter((entry) => (
      entry.ownership.basis === 'connected-selected-host-answer'
    ));
    if (hostOnlyTransient.length) {
      return finish({
        ok: false,
        status: 'transient-pending-ownership',
        reason: 'transient-current-pending-ownership',
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        transientCount: hostOnlyTransient.length,
        writesAttempted: 0,
      });
    }
    if (transientOwnership.length) {
      const promoted = new Set(transientOwnership.map((entry) => entry.row));
      rows = rows.map((row) => promoted.has(row)
        ? { ...row, currentProof: CURRENT_PROOF_PROVEN }
        : row);
    }

    const proof = validateAuthoritativeShrinkProof(opts?.shrinkProof, {
      chatId: id,
      cachedMeta: existingRawMeta,
    });
    const missingMembership = missingCachedMembership(existingRows, rows);
    const missingQIds = missingMembership.qIds;
    if (existingRows.length > rows.length) {
      const removals = new Set(proof.removedQIds || []);
      const proofCoversMissing = proof.ok
        && missingMembership.unresolvedCount === 0
        && missingQIds.length > 0
        && missingQIds.every((qId) => removals.has(qId));
      if (!proofCoversMissing) {
        return finish({
          ok: false,
          status: 'shrink-not-proven',
          chatId: id,
          existingCount: existingRows.length,
          incomingCount: rows.length,
          missingQIds: missingQIds.slice(0, CACHE_SHRINK_REMOVAL_LIMIT),
          unresolvedMissingCount: Number(missingMembership.unresolvedCount || 0),
          proofReason: String(proof.reason || 'shrink-proof-missing'),
          writesAttempted: 0,
        });
      }
    }

    const finalCrossQIdOwnership = inspectCrossQIdAnswerOwnership(rows);
    if (!finalCrossQIdOwnership.ok) {
      return finish({
        ok: false,
        status: 'cross-qid-answer-ownership-conflict',
        reason: 'cross-qid-answer-ownership-conflict',
        reasons: ['cross-qid-answer-ownership-conflict'],
        chatId: id,
        existingCount: existingRows.length,
        incomingCount: rows.length,
        crossQIdAnswerConflictCount: finalCrossQIdOwnership.conflictCount,
        crossQIdAnswerConflicts: finalCrossQIdOwnership.conflicts,
        crossQIdAnswerConflictsTruncated: finalCrossQIdOwnership.truncated,
        writesAttempted: 0,
      });
    }

    const currentRows = rows.filter((row) => cacheRowLayer(row) === 'current');
    const historyRows = rows.filter((row) => cacheRowLayer(row) === 'history');
    const last = currentRows[currentRows.length - 1] || rows[rows.length - 1] || null;
    const activeTurnId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
    const activeTurn = activeTurnId ? findTurnByAnyId(activeTurnId) : null;
    const activeAnswerId = String(activeTurn?.answerId || '').trim();
    const meta = {
      chatId: id,
      turnCount: rows.length,
      publishedTurnCount: currentRows.length,
      historicalTurnCount: historyRows.length,
      cacheLayout: 2,
      lastTurnId: String(last?.turnId || '').trim(),
      updatedAt: mmIdxNow(),
    };
    if (activeTurnId) meta.lastActiveTurnId = activeTurnId;
    if (activeAnswerId) meta.lastActiveAnswerId = activeAnswerId;

    const okTurns = storageSetJSON(turnsKey, rows);
    const okMeta = storageSetJSON(metaKey, meta);
    const ok = !!(okTurns && okMeta);
    return finish({
      ok,
      status: ok ? 'ok' : 'storage-failed',
      meta,
      turnsCount: rows.length,
      publishedTurnCount: currentRows.length,
      historicalTurnCount: historyRows.length,
      previousTurnsCount: existingRows.length,
      shrinkProof: proof.ok ? {
        cause: proof.cause,
        removedQIds: proof.removedQIds.slice(),
        freshness: proof.freshness,
      } : null,
    });
  }

  // Durable MiniMap turn ledger: merge the freshly indexed turn list with the
  // persisted per-chat turn cache so a rebuild can never publish or save
  // fewer turns than this conversation has already shown. ChatGPT virtualizes
  // far-away turn sections out of the document and H2O mechanisms hide or
  // lighten pages, so a raw re-index can shrink to the rendered subset and
  // renumber it from 1 ("Page 1" bug). Known turns keep their cached order
  // (stable indices and page membership), fresh turns replace their cached
  // entries (live elements win), and unknown turns are inserted after their
  // nearest known live neighbor. Cache identity is per chatId, so it resets
  // only when the conversation changes.
  function cacheRowToTurn(row) {
    const normalized = normalizeCacheTurnRow(row, Number(row?.idx || row?.index || 1));
    if (!normalized) return null;
    return {
      ...row,
      turnId: normalized.turnId,
      answerId: normalized.answerId,
      primaryAId: normalized.primaryAId,
      answerIds: normalized.answerIds.slice(),
      questionId: normalized.questionId,
      qId: normalized.qId,
      noAnswer: normalized.noAnswer,
      hasAssistant: normalized.hasAssistant,
      layer: normalized.layer,
      selectedPath: normalized.selectedPath,
      currentProof: normalized.currentProof,
      index: Number(row?.index || row?.idx || 0),
      el: row?.el || null,
    };
  }

  function mergeLiveTurnOverCache(cachedRow, liveTurn) {
    const cached = cacheRowToTurn(cachedRow) || {};
    const live = cacheRowToTurn(liveTurn) || {};
    const liveProof = deriveLiveCurrentProof(liveTurn);
    const cachedProof = cacheRowCurrentProof(cached);
    const currentProof = liveProof === CURRENT_PROOF_PROVEN
      ? CURRENT_PROOF_PROVEN
      : (
        cachedProof === CURRENT_PROOF_PROVEN
        || cachedProof === CURRENT_PROOF_RETAINED
        || cachedProof === CURRENT_PROOF_LEGACY
          ? CURRENT_PROOF_RETAINED
          : CURRENT_PROOF_TRANSIENT
      );
    const merged = {
      ...cached,
      ...liveTurn,
      ...live,
      qId: cacheRowQuestionId(live) || cacheRowQuestionId(cached),
      questionId: cacheRowQuestionId(live) || cacheRowQuestionId(cached),
      turnId: cacheRowTurnId(live) || cacheRowTurnId(cached),
      layer: 'current',
      selectedPath: true,
      currentProof,
      el: liveTurn?.el || null,
    };
    if (live.noAnswer === true || live.hasAssistant === false) {
      merged.answerId = '';
      merged.primaryAId = '';
      merged.answerIds = [];
      merged.noAnswer = true;
      merged.hasAssistant = false;
    } else {
      const primaryAId = String(live?.primaryAId || live?.answerId || '').trim();
      const withVariants = mergeCacheVariantEvidence(merged, cached, primaryAId);
      merged.answerId = withVariants.answerId;
      merged.primaryAId = withVariants.primaryAId;
      merged.answerIds = withVariants.answerIds;
    }
    if (isSyntheticAnswerOnlyCurrentRow(merged)) {
      merged.currentProof = CURRENT_PROOF_TRANSIENT;
      merged.suspectQuestionIdentity = true;
      merged.repairReason = 'synthetic-boundary-pending';
    }
    return merged;
  }

  function rememberRetainedTurnList(chatId = '', rows = []) {
    const id = String(chatId || resolveChatId() || '').trim();
    S.retainedTurnChatKey = id;
    S.retainedTurnList = replaceArrayContents(S.retainedTurnList, Array.isArray(rows) ? rows : []);
    return S.retainedTurnList;
  }

  function prepareLiveCurrentRows(list = []) {
    const diagnosticClaims = createTransientDiagnosticClaims();
    const candidates = (Array.isArray(list) ? list : []).map((row) => {
      const synthetic = isSyntheticAnswerOnlyCurrentRow(row);
      const priorProof = cacheRowCurrentProof(row);
      const currentProof = deriveLiveCurrentProof(row);
      const requiresOwnership = synthetic
        || priorProof === CURRENT_PROOF_TRANSIENT
        || currentProof === CURRENT_PROOF_TRANSIENT;
      if (!requiresOwnership) {
        return {
          row,
          currentProof,
          ownership: null,
          claim: '',
          requiresOwnership: false,
          synthetic: false,
          priorProof,
          reconciled: null,
        };
      }
      const ownership = evaluateTransientCurrentOwnership(row);
      return {
        row,
        currentProof,
        ownership,
        claim: transientOwnershipClaim(ownership),
        requiresOwnership: true,
        synthetic,
        priorProof,
        reconciled: synthetic ? reconcileSyntheticCurrentRow(row, ownership) : null,
      };
    });
    const claimCounts = new Map();
    const candidatesByClaim = new Map();
    for (const candidate of candidates) {
      if (!candidate.claim) continue;
      claimCounts.set(candidate.claim, (claimCounts.get(candidate.claim) || 0) + 1);
      if (!candidatesByClaim.has(candidate.claim)) candidatesByClaim.set(candidate.claim, []);
      candidatesByClaim.get(candidate.claim).push(candidate);
    }
    const sameOwnerVariantGroups = new Map();
    for (const [claim, group] of candidatesByClaim.entries()) {
      if (group.length < 2) continue;
      const syntheticIds = group.map((candidate) => syntheticAnswerOnlyCurrentId(candidate.row)).filter(Boolean);
      const qIds = new Set(group.map((candidate) => String(candidate.ownership?.qId || '').trim()).filter(Boolean));
      const valid = syntheticIds.length === group.length
        && new Set(syntheticIds).size === syntheticIds.length
        && qIds.size === 1
        && group.every((candidate) => (
          candidate.synthetic
          && candidate.reconciled
          && candidate.ownership?.owned
          && !candidate.ownership?.ambiguity
          && candidate.ownership?.basis !== 'connected-selected-host-answer'
          && syntheticIds.every((answerId) => (
            Array.isArray(candidate.ownership?.ownerAnswerIds)
            && candidate.ownership.ownerAnswerIds.includes(answerId)
          ))
        ));
      if (!valid) continue;
      const preferredPrimaries = Array.from(new Set(group
        .map((candidate) => String(candidate.ownership?.ownerPrimaryAId || '').trim())
        .filter(Boolean)));
      if (preferredPrimaries.length > 1) continue;
      const primaryAId = preferredPrimaries[0] || syntheticIds[syntheticIds.length - 1] || '';
      let mergedRow = group[0].reconciled;
      for (const candidate of group.slice(1)) {
        mergedRow = mergeCacheVariantEvidence(mergedRow, candidate.reconciled, primaryAId);
      }
      mergedRow = mergeCacheVariantEvidence(mergedRow, {
        answerIds: group[0].ownership.ownerAnswerIds,
        primaryAId,
      }, primaryAId);
      sameOwnerVariantGroups.set(claim, {
        leader: group[0],
        row: {
          ...mergedRow,
          logicalMemberKey: String(group[0].ownership?.logicalMemberKey || mergedRow?.logicalMemberKey || '').trim(),
          currentProof: CURRENT_PROOF_PROVEN,
        },
      });
    }
    const rawRows = candidates.map((candidate) => {
      const sameOwnerVariantGroup = candidate.claim
        ? sameOwnerVariantGroups.get(candidate.claim)
        : null;
      if (sameOwnerVariantGroup && sameOwnerVariantGroup.leader !== candidate) {
        noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsReconciledCount', candidate.row);
        return null;
      }
      if (
        candidate.requiresOwnership
        && (
          !candidate.ownership?.owned
          || candidate.ownership?.ambiguity
          || !candidate.claim
          || (claimCounts.get(candidate.claim) !== 1 && !sameOwnerVariantGroup)
        )
      ) {
        noteTransientDiagnosticClaim(diagnosticClaims, 'transientRowsExcluded', candidate.row);
        noteTransientDiagnosticClaim(diagnosticClaims, 'ownerlessTransientExcludedCount', candidate.row);
        if (candidate.synthetic) {
          noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsExcludedCount', candidate.row);
          if (
            candidate.ownership?.ambiguity
            || (candidate.claim && claimCounts.get(candidate.claim) !== 1)
          ) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticOwnerAmbiguousCount', candidate.row);
          if (
            candidate.priorProof === CURRENT_PROOF_PROVEN
            || candidate.priorProof === CURRENT_PROOF_RETAINED
          ) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticProofRevocationCount', candidate.row);
        }
        return null;
      }
      const row = sameOwnerVariantGroup?.row || candidate.reconciled || candidate.row;
      const currentProof = sameOwnerVariantGroup || candidate.reconciled
        ? CURRENT_PROOF_PROVEN
        : candidate.currentProof;
      if (sameOwnerVariantGroup || candidate.reconciled) {
        noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticRowsReconciledCount', candidate.row);
      }
      if (
        candidate.synthetic
        && !candidate.reconciled
        && (
          candidate.priorProof === CURRENT_PROOF_PROVEN
          || candidate.priorProof === CURRENT_PROOF_RETAINED
        )
      ) noteTransientDiagnosticClaim(diagnosticClaims, 'syntheticProofRevocationCount', candidate.row);
      return {
        ...row,
        layer: 'current',
        selectedPath: true,
        currentProof,
      };
    }).filter(Boolean);
    const normalized = normalizeCacheTurnRowsDetailed(rawRows, { liveRows: rawRows });
    mergeTransientDiagnosticClaims(diagnosticClaims, normalized);
    const result = {
      rows: normalized.rows,
      currentRows: normalized.currentRows,
      historyRows: normalized.historyRows,
      repairedRows: normalized.repairedRows,
      demotedRows: normalized.demotedRows,
      duplicateCurrentQIdCount: normalized.duplicateCurrentQIdCount,
      splitRoleReconciledCount: normalized.splitRoleReconciledCount,
      splitRoleAmbiguousCount: normalized.splitRoleAmbiguousCount,
      rawCount: Array.isArray(list) ? list.filter(Boolean).length : 0,
    };
    applyTransientDiagnosticCounts(result, diagnosticClaims);
    return attachTransientDiagnosticClaims(result, diagnosticClaims);
  }

  function mergeTurnListWithCache(chatId, list, evidence = null) {
    const liveList = Array.isArray(list) ? list.filter(Boolean) : [];
    const normalizedChatId = String(chatId || '').trim();
    const authoritativeLiveInput = evidence?.inputKind === 'authoritative-live'
      || evidence?.source === 'core-runtime'
      || (evidence?.coreProjectedTotal != null && Number.isFinite(Number(evidence.coreProjectedTotal)));
    const priorAuthoritativeLiveCount = normalizedChatId
      && normalizedChatId === S.lastCoreProjectionChatKey
      && Number.isFinite(Number(S.lastCoreProjectedTotal))
      ? Math.max(0, Number(S.lastCoreProjectedTotal))
      : null;
    const preparedLive = prepareLiveCurrentRows(liveList);
    const liveCurrentRows = preparedLive.currentRows;
    const authoritativeLogicalLiveCount = liveCurrentRows
      .filter((row) => !isSyntheticAnswerOnlyCurrentRow(row)).length;
    let cached = null;
    try {
      cached = loadTurnCache(chatId, { liveRows: liveCurrentRows, reindexCurrent: false });
    } catch {
      cached = null;
    }
    const cachedRows = Array.isArray(cached?.turns) ? cached.turns : [];
    const cachedCurrentRows = Array.isArray(cached?.currentTurns) ? cached.currentTurns : [];
    const cachedHistoryRows = Array.isArray(cached?.historyTurns) ? cached.historyTurns : [];
    const diagnosticClaims = createTransientDiagnosticClaims();
    mergeTransientDiagnosticClaims(diagnosticClaims, cached?.normalization, preparedLive);
    const decision = {
      accepted: true,
      mode: cachedRows.length ? 'union' : 'live-wins',
      cachedCount: cachedRows.length,
      cachedCurrentCount: cachedCurrentRows.length,
      cachedHistoricalCount: cachedHistoryRows.length,
      liveCount: liveList.length,
      liveCurrentCount: authoritativeLiveInput ? authoritativeLogicalLiveCount : priorAuthoritativeLiveCount,
      authoritativeLiveInput,
      authoritativeLiveProjectedCount: authoritativeLiveInput
        ? authoritativeLogicalLiveCount
        : null,
      internalMergeInputCount: authoritativeLiveInput ? null : liveList.length,
      outputCount: liveCurrentRows.length,
      retainedCount: preparedLive.rows.length,
      publishedCurrentCount: liveCurrentRows.length,
      historicalRetainedCount: preparedLive.historyRows.length,
      offDomCurrentRetainedCount: 0,
      overlapCount: 0,
      sanitizedRows: Number(cached?.normalization?.sanitizedRows || 0),
      repairedRows: Number(cached?.normalization?.repairedRows || 0) + preparedLive.repairedRows,
      demotedRows: Number(cached?.normalization?.demotedRows || 0) + preparedLive.demotedRows,
      duplicateCurrentQIdCount: Number(cached?.normalization?.duplicateCurrentQIdCount || 0)
        + preparedLive.duplicateCurrentQIdCount,
      splitRoleReconciledCount: Number(cached?.normalization?.splitRoleReconciledCount || 0)
        + Number(preparedLive.splitRoleReconciledCount || 0),
      splitRoleAmbiguousCount: Number(cached?.normalization?.splitRoleAmbiguousCount || 0)
        + Number(preparedLive.splitRoleAmbiguousCount || 0),
      transientRowsExcluded: 0,
      independentlyOwnedTransientCount: 0,
      ownerlessTransientExcludedCount: 0,
      unresolvedTransientCount: 0,
      syntheticProofRevocationCount: 0,
      syntheticRowsReconciledCount: 0,
      syntheticRowsExcludedCount: 0,
      syntheticRowsPendingCount: 0,
      syntheticOwnerAmbiguousCount: 0,
      syntheticPublishedCurrentCount: liveCurrentRows.length - authoritativeLogicalLiveCount,
      bijectionProven: false,
      reason: cachedRows.length ? 'cache-preserving-union' : 'cache-empty',
    };
    applyTransientDiagnosticCounts(decision, diagnosticClaims);
    if (!cachedRows.length) {
      const retained = preparedLive.rows.map(cacheRowToTurn).filter(Boolean);
      const repaired = repairCacheCurrentMembership(retained, { liveRows: liveCurrentRows });
      const published = repaired.currentRows.map(cacheRowToTurn).filter(Boolean);
      published.forEach((turn, index) => {
        turn.index = index + 1;
        turn.idx = index + 1;
      });
      rememberRetainedTurnList(chatId, repaired.rows);
      decision.outputCount = published.length;
      decision.retainedCount = repaired.rows.length;
      decision.publishedCurrentCount = published.length;
      decision.historicalRetainedCount = repaired.historyRows.length;
      decision.repairedRows += repaired.repairedRows;
      decision.demotedRows += repaired.demotedRows;
      decision.splitRoleReconciledCount += Number(repaired.splitRoleReconciledCount || 0);
      decision.splitRoleAmbiguousCount += Number(repaired.splitRoleAmbiguousCount || 0);
      mergeTransientDiagnosticClaims(diagnosticClaims, repaired);
      applyTransientDiagnosticCounts(decision, diagnosticClaims);
      decision.syntheticPublishedCurrentCount = published
        .filter((row) => isSyntheticAnswerOnlyCurrentRow(row)).length;
      if (repaired.historyRows.length) {
        decision.mode = 'union';
        decision.reason = 'duplicate-current-qid-repaired';
      }
      if (decision.syntheticOwnerAmbiguousCount) {
        decision.mode = 'union';
        decision.reason = 'synthetic-owner-ambiguous';
      } else if (decision.syntheticRowsExcludedCount) {
        decision.mode = 'union';
        decision.reason = 'ownerless-synthetic-excluded';
      } else if (decision.syntheticRowsPendingCount) {
        decision.mode = 'union';
        decision.reason = 'synthetic-boundary-pending';
      } else if (decision.syntheticProofRevocationCount) {
        decision.mode = 'union';
        decision.reason = 'synthetic-proof-revoked';
      }
      rememberCacheMergeDecision(chatId, decision);
      return {
        list: published,
        currentList: published,
        retainedList: repaired.rows,
        historyList: repaired.historyRows,
        decision,
      };
    }

    const proof = validateAuthoritativeShrinkProof(evidence?.shrinkProof, {
      chatId: String(chatId || '').trim(),
      cachedMeta: cached?.meta,
    });
    const removedQIds = proof.ok ? new Set(proof.removedQIds) : new Set();
    const retained = cachedRows
      .filter((row) => !removedQIds.has(cacheRowQuestionId(row)))
      .map(cacheRowToTurn)
      .filter(Boolean);
    if (proof.ok && retained.length < cachedRows.length) {
      decision.mode = 'proven-shrink';
      decision.reason = proof.reason;
      decision.shrinkProof = {
        chatId: proof.chatId,
        completeness: 'complete',
        cause: proof.cause,
        removedQIds: proof.removedQIds.slice(),
        freshness: proof.freshness,
      };
    }

    const usedCachedIndexes = new Set();
    const matches = liveCurrentRows.map((turn) => {
      let index = findCacheRowIndex(retained, turn, {
        layer: 'current',
        usedIndexes: usedCachedIndexes,
      });
      let matchedLayer = 'current';
      if (index < 0) {
        index = findCacheRowIndex(retained, turn, {
          layer: 'history',
          usedIndexes: usedCachedIndexes,
        });
        matchedLayer = 'history';
      }
      let splitOwnership = null;
      if (index < 0 && !cacheRowQuestionId(turn) && cacheRowAnswerIds(turn).length) {
        const splitCandidates = [];
        for (let candidateIndex = 0; candidateIndex < retained.length; candidateIndex += 1) {
          if (usedCachedIndexes.has(candidateIndex)) continue;
          const candidate = retained[candidateIndex];
          if (cacheRowLayer(candidate) !== 'current') continue;
          if (!cacheRowQuestionId(candidate) || cacheRowAnswerIds(candidate).length) continue;
          const ownership = cacheSplitRoleOwnership(candidate, turn);
          if (ownership) splitCandidates.push({ index: candidateIndex, ownership });
        }
        if (splitCandidates.length === 1) {
          index = splitCandidates[0].index;
          splitOwnership = splitCandidates[0].ownership;
          matchedLayer = 'current';
        }
      }
      if (index >= 0) usedCachedIndexes.add(index);
      return {
        turn,
        index,
        matchedLayer,
        cachedRow: index >= 0 ? retained[index] : null,
        mergedRow: null,
        splitOwnership,
      };
    });

    const demoteRetainedIndex = (index, reason) => {
      const row = retained[index];
      if (!row || cacheRowLayer(row) === 'history') return false;
      retained[index] = {
        ...row,
        layer: 'history',
        selectedPath: false,
        currentProof: 'history',
        suspectQuestionIdentity: true,
        repairReason: String(reason || 'branch-history-retained'),
      };
      decision.repairedRows += 1;
      decision.demotedRows += 1;
      return true;
    };

    for (const match of matches) {
      if (match.index < 0) continue;
      const previous = retained[match.index];
      match.mergedRow = mergeLiveTurnOverCache(previous, match.turn);
      if (match.splitOwnership) {
        match.mergedRow.currentProof = CURRENT_PROOF_PROVEN;
        if (match.splitOwnership.logicalMemberKey) {
          match.mergedRow.logicalMemberKey = match.splitOwnership.logicalMemberKey;
        }
        decision.repairedRows += 1;
        decision.splitRoleReconciledCount += 1;
      }
      retained[match.index] = match.mergedRow;
      decision.overlapCount += 1;
      if (match.matchedLayer === 'history') {
        decision.repairedRows += 1;
        const selectedIndex = Math.max(0, Number(match.turn?.idx || match.turn?.index || 0) || 0);
        const competingIndex = cacheRowHasAuthoritativeCurrentPosition(match.turn)
          ? retained.findIndex((row) => (
          row !== match.mergedRow
          && cacheRowLayer(row) === 'current'
          && selectedIndex > 0
          && Math.max(0, Number(row?.idx || row?.index || 0) || 0) === selectedIndex
          && cacheRowQuestionId(row) !== cacheRowQuestionId(match.turn)
          ))
          : -1;
        if (competingIndex >= 0) demoteRetainedIndex(competingIndex, 'selected-history-branch-promoted');
      }
    }

    let anchorRow = null;
    for (let liveIndex = 0; liveIndex < matches.length; liveIndex += 1) {
      const match = matches[liveIndex];
      if (match.mergedRow) {
        anchorRow = match.mergedRow;
        continue;
      }

      const turn = cacheRowToTurn(match.turn);
      if (!turn) continue;
      turn.layer = 'current';
      turn.selectedPath = true;
      const turnIndex = Math.max(0, Number(turn?.idx || turn?.index || liveIndex + 1) || 0);
      const conflictIndex = cacheRowHasAuthoritativeCurrentPosition(turn)
        ? retained.findIndex((row) => (
        !matches.some((candidate) => candidate.mergedRow === row)
        && cacheRowLayer(row) === 'current'
        && turnIndex > 0
        && Math.max(0, Number(row?.idx || row?.index || 0) || 0) === turnIndex
        && cacheRowQuestionId(row)
        && cacheRowQuestionId(turn)
        && cacheRowQuestionId(row) !== cacheRowQuestionId(turn)
        ))
        : -1;
      if (conflictIndex >= 0) demoteRetainedIndex(conflictIndex, 'selected-path-position-replaced');

      let insertAt = anchorRow ? retained.indexOf(anchorRow) + 1 : -1;
      if (insertAt <= 0) {
        const nextMatch = matches.slice(liveIndex + 1).find((candidate) => candidate.mergedRow);
        insertAt = nextMatch?.mergedRow ? retained.indexOf(nextMatch.mergedRow) : retained.length;
      }
      retained.splice(Math.max(0, insertAt), 0, turn);
      anchorRow = turn;
    }

    for (const historyRow of preparedLive.historyRows) {
      const exactIndex = retained.findIndex((row) => (
        cacheRowLayer(row) === 'history'
        && cacheRowQuestionId(row) === cacheRowQuestionId(historyRow)
        && cacheRowTurnId(row) === cacheRowTurnId(historyRow)
        && String(row?.primaryAId || row?.answerId || '').trim()
          === String(historyRow?.primaryAId || historyRow?.answerId || '').trim()
      ));
      if (exactIndex >= 0) continue;
      retained.push({
        ...cacheRowToTurn(historyRow),
        layer: 'history',
        selectedPath: false,
        currentProof: 'history',
        suspectQuestionIdentity: true,
        repairReason: String(historyRow?.repairReason || 'duplicate-live-question-identity'),
      });
    }

    const repaired = repairCacheCurrentMembership(retained, { liveRows: liveCurrentRows });
    decision.repairedRows += repaired.repairedRows;
    decision.demotedRows += repaired.demotedRows;
    decision.splitRoleReconciledCount += Number(repaired.splitRoleReconciledCount || 0);
    decision.splitRoleAmbiguousCount += Number(repaired.splitRoleAmbiguousCount || 0);
    mergeTransientDiagnosticClaims(diagnosticClaims, repaired);
    applyTransientDiagnosticCounts(decision, diagnosticClaims);
    const out = repaired.currentRows.map(cacheRowToTurn).filter(Boolean);
    out.forEach((turn, index) => {
      turn.index = index + 1;
      turn.idx = index + 1;
      turn.layer = 'current';
      turn.selectedPath = true;
    });

    const completePairs = matches.length === liveCurrentRows.length
      && matches.every((match) => {
        if (match.index < 0 || match.matchedLayer !== 'current') return false;
        const cachedRow = match.cachedRow;
        if (!cachedRow) return false;
        if (cacheRowQuestionId(cachedRow) !== cacheRowQuestionId(match.turn)) return false;
        if ((cachedRow?.noAnswer === true) !== (match.turn?.noAnswer === true)) return false;
        const cachedTurnId = cacheRowTurnId(cachedRow);
        const liveTurnId = cacheRowTurnId(match.turn);
        return cachedTurnId === liveTurnId || cacheRowsHaveVariantRelationship(cachedRow, match.turn);
      });
    const publishedQIds = out.map(cacheRowQuestionId).filter(Boolean);
    const uniquePublishedQIds = new Set(publishedQIds).size === publishedQIds.length;
    const currentProofsComplete = out.every((row) => {
      if (isSyntheticAnswerOnlyCurrentRow(row)) return false;
      const currentProof = cacheRowCurrentProof(row);
      return currentProof === CURRENT_PROOF_PROVEN
        || currentProof === CURRENT_PROOF_RETAINED
        || currentProof === CURRENT_PROOF_LEGACY;
    });
    const bijectionProven = authoritativeLiveInput
      && decision.mode !== 'proven-shrink'
      && preparedLive.rawCount === liveCurrentRows.length
      && cachedHistoryRows.length === 0
      && cachedCurrentRows.length === liveCurrentRows.length
      && liveCurrentRows.length === out.length
      && decision.overlapCount === liveCurrentRows.length
      && completePairs
      && uniquePublishedQIds
      && currentProofsComplete
      && decision.ownerlessTransientExcludedCount === 0
      && decision.unresolvedTransientCount === 0
      && decision.syntheticRowsPendingCount === 0
      && decision.syntheticOwnerAmbiguousCount === 0
      && decision.demotedRows === 0;

    decision.outputCount = out.length;
    decision.retainedCount = repaired.rows.length;
    decision.publishedCurrentCount = out.length;
    decision.historicalRetainedCount = repaired.historyRows.length;
    decision.syntheticPublishedCurrentCount = out
      .filter((row) => isSyntheticAnswerOnlyCurrentRow(row)).length;
    decision.offDomCurrentRetainedCount = Math.max(
      0,
      out.length - decision.syntheticPublishedCurrentCount - authoritativeLogicalLiveCount,
    );
    decision.bijectionProven = bijectionProven;
    if (bijectionProven) {
      decision.mode = 'live-wins';
      decision.reason = 'complete-overlap-refresh';
    } else if (decision.mode !== 'proven-shrink') {
      decision.mode = 'union';
      if (decision.syntheticOwnerAmbiguousCount) {
        decision.reason = 'synthetic-owner-ambiguous';
      } else if (decision.syntheticRowsExcludedCount) {
        decision.reason = 'ownerless-synthetic-excluded';
      } else if (decision.syntheticRowsPendingCount) {
        decision.reason = 'synthetic-boundary-pending';
      } else if (decision.syntheticProofRevocationCount) {
        decision.reason = 'synthetic-proof-revoked';
      } else if (!authoritativeLiveInput) {
        decision.reason = 'internal-state-refresh';
      } else if (decision.ownerlessTransientExcludedCount) {
        decision.reason = 'ownerless-transient-excluded';
      } else if (decision.unresolvedTransientCount) {
        decision.reason = 'transient-current-pending-ownership';
      } else if (decision.duplicateCurrentQIdCount || repaired.duplicateCurrentQIdCount) {
        decision.reason = 'duplicate-current-qid-repaired';
      } else if (preparedLive.historyRows.length) {
        decision.reason = 'overlap-ambiguous';
      } else if (repaired.historyRows.length) {
        decision.reason = 'branch-history-retained';
      } else {
        decision.reason = 'partial-overlap-union';
      }
    }
    rememberRetainedTurnList(chatId, repaired.rows);
    rememberCacheMergeDecision(chatId, decision);
    return {
      list: out,
      currentList: out,
      retainedList: repaired.rows,
      historyList: repaired.historyRows,
      decision,
    };
  }

  function persistPublishedTurnList(chatId = '', currentRows = [], opts = {}) {
    const id = String(chatId || resolveChatId() || '').trim();
    if (!id) return rememberCachePersistenceDecision('', { ok: false, status: 'chat-id-missing' });
    if (selectedPathPresentationActive()) {
      return rememberCachePersistenceDecision(id, {
        ok: true,
        status: 'selected-path-overlay-skipped',
        chatId: id,
        writesAttempted: 0,
      });
    }
    const merged = mergeTurnListWithCache(id, currentRows, {
      source: String(opts?.reason || 'current-publication'),
      inputKind: 'internal-state',
      completeness: 'unproven',
      shrinkProof: opts?.shrinkProof || null,
    });
    const persisted = saveTurnCache(id, merged.retainedList, {
      ...opts,
      liveRows: merged.currentList,
    });
    if (!persisted || typeof persisted !== 'object') return persisted;
    return {
      ...persisted,
      mergeDecision: boundedCacheMergeDecision(merged.decision),
    };
  }

  function renderFromCache(chatId = '') {
    const perfT0 = perfNow();
    try {
      const id = String(chatId || resolveChatId()).trim();
      if (!id) return { ok: false, renderedCount: 0, status: 'chat-id-missing' };
      const completeIndex = getCompleteIndexProjectionStatus();
      if (completeIndex.enabled) {
        scheduleRebuild(`complete-index:${completeIndex.status}:legacy-cache-bypassed`);
        return {
          ok: false,
          renderedCount: 0,
          status: 'complete-index-authority',
          chatId: id,
          lastTurnId: '',
          lastAnswerId: '',
        };
      }

      const cached = loadTurnCache(id);
      const cachedCurrentTurns = Array.isArray(cached?.currentTurns) ? cached.currentTurns : [];
      if (!cached || !cachedCurrentTurns.length) {
        mmIdxEmitHydrated({
          chatId: id,
          source: 'cache',
          status: 'cache-miss',
          turnCount: 0,
          renderedCount: 0,
        });
        return { ok: false, renderedCount: 0, status: 'cache-miss', chatId: id, lastTurnId: '', lastAnswerId: '' };
      }

      const ensured = ensureUiRefsForRebuild('cache-render');
      if (!ensured.ready) {
        return { ok: false, renderedCount: 0, status: 'ui-missing', chatId: id, lastTurnId: '', lastAnswerId: '' };
      }

      const list = [];
      const byId = new Map();
      const byAId = new Map();
      for (const row of cachedCurrentTurns) {
        const turnId = String(row?.turnId || '').trim();
        if (!turnId) continue;
        const answerId = String(row?.primaryAId || row?.answerId || '').trim();
        const idx = Math.max(1, Number(row?.idx || 0) || (list.length + 1));
        const questionId = String(row?.questionId || row?.qId || '').trim();
        const noAnswer = row?.noAnswer === true || row?.hasAssistant === false;
        const turn = {
          turnId,
          answerId: noAnswer ? '' : answerId,
          primaryAId: noAnswer ? '' : answerId,
          answerIds: noAnswer ? [] : cacheRowAnswerIds(row),
          questionId,
          qId: questionId,
          noAnswer,
          hasAssistant: noAnswer ? false : row?.hasAssistant,
          index: idx,
          el: null,
        };
        list.push(turn);
        byId.set(turnId, turn);
        if (turn.answerId) byAId.set(turn.answerId, turnId);
      }

      if (!list.length) {
        return { ok: false, renderedCount: 0, status: 'cache-empty', chatId: id, lastTurnId: '', lastAnswerId: '' };
      }

      const snapshot = {
        list,
        byId,
        byAId,
        answerByTurn: new Map(),
        answers: [],
      };

      rememberRetainedTurnList(id, cached.turns);

      const map = ensureTurnButtons(snapshot.list, { skipActiveSync: true });
      const renderedCount = Number(list.length || 0);
      const last = cachedCurrentTurns[cachedCurrentTurns.length - 1] || null;
      const lastTurnId = String(last?.turnId || '').trim();
      const lastAnswerId = String(last?.primaryAId || last?.answerId || '').trim();
      const paginationCoverage = validateTurnsAgainstPagination(list, { source: 'cache-render' });
      if (map instanceof Map) publishTurnSnapshot(snapshot);
      const activeHint = String(
        cached?.meta?.lastActiveTurnId ||
        cached?.meta?.lastActiveAnswerId ||
        S.lastActiveTurnIdFast ||
        cached?.meta?.lastTurnId ||
        lastTurnId ||
        lastAnswerId
      ).trim();
      if (map instanceof Map && activeHint) {
        try { setActive(activeHint, 'cache-render'); } catch {}
      } else if (map instanceof Map) {
        try { updateCounter(''); } catch {}
      }

      mmIdxEmitHydrated({
        chatId: id,
        source: 'cache',
        status: 'cache-hit',
        turnCount: renderedCount,
        renderedCount,
      });
      let cacheSanitizationPersistence = null;
      if (Number(cached?.normalization?.sanitizedRows || 0) > 0) {
        try {
          cacheSanitizationPersistence = saveTurnCache(id, cached.turns, {
            reason: 'cache-read-sanitization',
          });
        } catch {}
      }
      return {
        ok: !!(map instanceof Map) && renderedCount > 0,
        renderedCount,
        status: renderedCount > 0 ? 'ok' : 'cache-empty',
        chatId: id,
        lastTurnId,
        lastAnswerId,
        paginationCoverage,
        cacheSanitizationPersistence,
      };
    } finally {
      recordDuration(PERF.paths.renderFromCache, perfNow() - perfT0);
    }
  }

  function appendTurnFromAnswerEl(_chatId = '', _answerEl = null, _opts = {}) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const chatId = String(_chatId || resolveChatId()).trim();
      const source = String(_opts?.source || 'core:append').trim();
      const completeIndex = getCompleteIndexProjectionStatus();
      if (completeIndex.enabled) {
        scheduleRebuild(`complete-index:${completeIndex.status}:incremental-append-bypassed`);
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'completeIndexAuthority');
        return { ok: false, status: 'complete-index-authority', chatId, source };
      }
      const rootEl = (_answerEl && _answerEl.nodeType === 1) ? _answerEl : null;
      if (!rootEl) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'noop');
        return { ok: false, status: 'noop' };
      }

      const answerEl = pickAssistantMessageEl(rootEl);
      if (!answerEl) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'ignored');
        return { ok: false, status: 'ignored' };
      }
      if (!answerEl.isConnected) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'stale');
        return { ok: false, status: 'stale' };
      }

      const ensured = ensureUiRefsForRebuild('append-turn');
      if (!ensured.ready) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'uiMissing');
        return { ok: false, status: 'ui-missing' };
      }

      if (!S.turnList.length) indexTurns();

      const answerId = String(getMessageId(answerEl) || '').trim();
      if (!answerId) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'noop');
        return { ok: false, status: 'noop' };
      }
      const sharedRecord = getSharedTurnRecordByIdentity('answer', answerId);
      const projectedRecord = sharedRecord ? projectSharedTurnRecord(sharedRecord, S.turnList.length + 1) : null;
      const currentOwner = resolveMiniMapCurrentMemberByAnswer(answerId);
      const projectedQId = String(currentOwner?.qId || '').trim() || cacheRowQuestionId(projectedRecord);
      const projectedAnswerIds = Array.from(new Set([
        ...(Array.isArray(projectedRecord?.answerIds) ? projectedRecord.answerIds : []),
        ...(Array.isArray(currentOwner?.answerIds) ? currentOwner.answerIds : []),
        answerId,
      ].map((value) => String(value || '').trim()).filter(Boolean)));
      let turnId = String(projectedRecord?.turnId || S.turnIdByAId.get(answerId) || '').trim();
      if (currentOwner?.qId) turnId = `turn:${currentOwner.qId}`;
      if (!turnId) turnId = String(parseTurnId(answerEl, S.turnList.length + 1, answerId) || `turn:a:${answerId}`).trim();
      if (!turnId) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'noop');
        return { ok: false, status: 'noop' };
      }

      const existing = findTurnByAnyId(turnId)
        || (projectedQId ? S.turnList.find((turn) => cacheRowQuestionId(turn) === projectedQId) : null)
        || findTurnByAnyId(answerId);
      if (existing) {
        const existingTurnId = String(existing.turnId || turnId).trim();
        if (!existingTurnId) {
          bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'error');
          return { ok: false, status: 'error' };
        }
        existing.answerId = answerId;
        existing.primaryAId = answerId;
        existing.answerIds = Array.from(new Set([
          ...cacheRowAnswerIds(existing),
          ...projectedAnswerIds,
        ])).filter(Boolean);
        if (existing.answerIds[existing.answerIds.length - 1] !== answerId) {
          existing.answerIds = existing.answerIds.filter((id) => id !== answerId);
          existing.answerIds.push(answerId);
        }
        existing.noAnswer = false;
        existing.hasAssistant = true;
        existing.currentProof = projectedQId ? CURRENT_PROOF_PROVEN : CURRENT_PROOF_TRANSIENT;
        if (currentOwner?.logicalMemberKey) existing.logicalMemberKey = currentOwner.logicalMemberKey;
        if (projectedQId) {
          existing.qId = projectedQId;
          existing.questionId = projectedQId;
        }
        existing.el = answerEl;
        S.turnById.set(existingTurnId, existing);
        if (answerId) S.turnIdByAId.set(answerId, existingTurnId);
        S.answerByTurnId.set(existingTurnId, answerEl);
        if (!S.answerEls.length || S.answerEls[S.answerEls.length - 1] !== answerEl) {
          if (!S.answerEls.includes(answerEl)) S.answerEls.push(answerEl);
        }
        const map = ensureMapStore();
        let btn = map.get(existingTurnId) || null;
        if (!btn) {
          const col = ensureCol();
          if (!col) {
            bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'uiMissing');
            return { ok: false, status: 'ui-missing' };
          }
          const made = createBtn(existing);
          btn = made.btn;
          try { col.appendChild(made.wrap); } catch {}
          noteNodeLifecycle('repaired', 'answerRows');
          noteNodeLifecycle('created', 'answerRows');
          noteNodeLifecycle('created', 'answerButtons');
        } else {
          noteNodeLifecycle('reused', 'answerRows');
          noteNodeLifecycle('reused', 'answerButtons');
        }
        if (btn) {
          syncTurnRowDom(btn, existing, { qaEnabled: isQaViewActive() });
          map.set(existingTurnId, btn);
          const symbolMeta = getMarginSymbolMetaForAnswer(answerId);
          updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });
          repaintMiniBtnByAnswerId(answerId || existingTurnId, btn);
          noteRenderUnit('answerRows');
          noteRenderUnit('answerButtons');
          noteRenderUnit('gutterSymbols');
        }
        try { renderChatPageDividers(chatId); } catch {}
        let cachePersistence = null;
        try {
          if (chatId) cachePersistence = persistPublishedTurnList(chatId, S.turnList, {
            reason: 'append-existing-refresh',
          });
        } catch {}
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'exists');
        return {
          ok: true,
          status: 'exists',
          chatId,
          source,
          turnId: existingTurnId,
          answerId,
          idx: Number(existing.index || 0),
          cachePersistence,
        };
      }

      const lastKnownAnswer = S.answerEls[S.answerEls.length - 1] || null;
      if (lastKnownAnswer && lastKnownAnswer.isConnected && lastKnownAnswer !== answerEl) {
        try {
          const rel = lastKnownAnswer.compareDocumentPosition(answerEl);
          const follows = !!(rel & Node.DOCUMENT_POSITION_FOLLOWING);
          if (!follows) {
            bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'nonMonotonic');
            return { ok: false, status: 'non-monotonic', chatId, source, turnId, answerId };
          }
        } catch {}
      }

      const nextIdx = Math.max(1, Number(S.turnList.length || 0) + 1);
      const nextTurn = {
        ...(projectedRecord || {}),
        turnId,
        qId: projectedQId,
        questionId: projectedQId,
        answerId,
        primaryAId: answerId,
        answerIds: projectedAnswerIds,
        currentProof: projectedQId ? CURRENT_PROOF_PROVEN : CURRENT_PROOF_TRANSIENT,
        index: nextIdx,
        el: answerEl,
      };
      if (currentOwner?.logicalMemberKey) nextTurn.logicalMemberKey = currentOwner.logicalMemberKey;
      S.turnList.push(nextTurn);
      S.turnById.set(turnId, nextTurn);
      if (answerId) S.turnIdByAId.set(answerId, turnId);
      S.answerByTurnId.set(turnId, answerEl);
      S.answerEls.push(answerEl);

      const map = ensureMapStore();
      const col = ensureCol();
      if (!col) {
        bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'uiMissing');
        return { ok: false, status: 'ui-missing' };
      }
      const made = createBtn(nextTurn);
      const btn = made.btn;
      try { col.appendChild(made.wrap); } catch {}
      noteNodeLifecycle('created', 'answerRows');
      noteNodeLifecycle('created', 'answerButtons');
      noteRenderUnit('answerRows');
      noteRenderUnit('answerButtons');

      syncTurnRowDom(btn, nextTurn, { qaEnabled: isQaViewActive() });

      map.set(turnId, btn);

      const symbolMeta = getMarginSymbolMetaForAnswer(answerId);
      updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });
      repaintMiniBtnByAnswerId(answerId || turnId, btn);
      noteRenderUnit('gutterSymbols');
      try { W.syncMiniMapDot?.(answerId); } catch {}
      try { W.H2O_MM_syncQuoteBadgesForIdx?.(btn, nextIdx); } catch {}
      let cachePersistence = null;
      try {
        if (chatId) cachePersistence = persistPublishedTurnList(chatId, S.turnList, {
          reason: 'append-new-turn',
        });
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent(EV_MM_INDEX_APPENDED, {
          detail: {
            chatId,
            source,
            turnId,
            answerId,
            msgId: answerId,
            idx: nextIdx,
          },
        }));
      } catch {}
      try { renderChatPageDividers(chatId); } catch {}
      bumpReason(PERF.incrementalRefresh.appendTurnStatuses, 'appended');

      return {
        ok: true,
        status: 'appended',
        chatId,
        source,
        turnId,
        answerId,
        idx: nextIdx,
        cachePersistence,
      };
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.appendTurnFromAnswerEl, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'appendTurnFromAnswerEl');
      }
      exitPerfOwner('incremental');
    }
  }

  function attachVisibleAnswers(_chatId = '', root = null) {
    const host = (root && root.querySelectorAll) ? root : document;
    const { SEL } = getRegs();
    const sel = SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]';
    const answers = qq(sel, host);
    if (!answers.length) return { ok: false, status: 'empty', attached: 0 };

    let attached = 0;
    const attachedEls = [];
    for (const el of answers) {
      const aid = String(getMessageId(el) || '').trim();
      if (!aid) continue;
      const turnId = String(S.turnIdByAId.get(aid) || '').trim();
      if (!turnId) continue;
      const turn = S.turnById.get(turnId) || null;
      if (turn) turn.el = el;
      S.answerByTurnId.set(turnId, el);
      attached += 1;
      attachedEls.push(el);
    }
    if (attachedEls.length) S.answerEls = attachedEls;
    return { ok: attached > 0, status: attached > 0 ? 'ok' : 'empty', attached };
  }

  function storageApi() {
    try { return getRegs()?.SH?.util?.storage || null; } catch { return null; }
  }

  function storageGetJSON(key, fallback = null) {
    const k = String(key || '').trim();
    if (!k) return fallback;
    const storage = storageApi();
    if (storage && typeof storage.getJSON === 'function') {
      try {
        const parsed = storage.getJSON(k, fallback);
        return parsed == null ? fallback : parsed;
      } catch {}
    }
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function storageGetStr(key, fallback = '') {
    const k = String(key || '').trim();
    if (!k) return fallback;
    const storage = storageApi();
    if (storage && typeof storage.getStr === 'function') {
      try {
        const value = storage.getStr(k, null);
        return value == null ? fallback : String(value);
      } catch {}
    }
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? fallback : String(raw);
    } catch {
      return fallback;
    }
  }

  function storageSetJSON(key, val) {
    const k = String(key || '').trim();
    if (!k) return false;
    const storage = storageApi();
    if (storage && typeof storage.setJSON === 'function') {
      try { return !!storage.setJSON(k, val); } catch {}
    }
    try {
      localStorage.setItem(k, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  }

  function storageSetStr(key, val) {
    const k = String(key || '').trim();
    if (!k) return false;
    const storage = storageApi();
    if (storage && typeof storage.setStr === 'function') {
      try { return !!storage.setStr(k, String(val)); } catch {}
    }
    try {
      localStorage.setItem(k, String(val));
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    const storage = storageApi();
    if (storage && typeof storage.remove === 'function') {
      try {
        storage.remove(k);
        return true;
      } catch {}
    }
    if (storage && typeof storage.del === 'function') {
      try {
        storage.del(k);
        return true;
      } catch {}
    }
    if (storage && typeof storage.removeItem === 'function') {
      try {
        storage.removeItem(k);
        return true;
      } catch {}
    }
    try {
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeSymbols(symbols) {
    if (!Array.isArray(symbols)) return [];
    const out = [];
    for (const sym of symbols) {
      const s = String(sym || '').trim();
      if (s) out.push(s);
    }
    return out;
  }

  function normalizeColors(colors) {
    if (!Array.isArray(colors)) return [];
    return colors.map((c) => String(c || '').trim());
  }

  function collectSymbolEntriesFromBuckets(buckets) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const picked = [];
    let seq = 0;
    for (const b of rows) {
      const items = Array.isArray(b?.items)
        ? b.items
        : ((b?.items && typeof b.items === 'object') ? Object.values(b.items) : []);
      for (const it of items) {
        if (!it || it.type !== 'symbol') continue;
        const sym = String(it?.data?.symbol || '').trim();
        if (!sym) continue;
        const color = String(it?.data?.color || it?.ui?.color || '').trim();
        const ts = Number(it?.ts);
        seq += 1;
        picked.push({
          sym,
          color,
          ts: Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER,
          seq,
        });
      }
    }
    if (!picked.length) return [];
    picked.sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
    return picked.map((x) => ({ symbol: x.sym, color: String(x.color || '').trim() }));
  }

  function collectSymbolsFromBuckets(buckets) {
    return collectSymbolEntriesFromBuckets(buckets).map((x) => x.symbol);
  }

  function collectSymbolColorsFromBuckets(buckets) {
    return collectSymbolEntriesFromBuckets(buckets).map((x) => x.color);
  }

  function marginSymbolsMapKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_SYMBOLS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_SYMBOLS_V1 ||
      KEY_MARGIN_SYMBOLS_FALLBACK;
    return String(key || KEY_MARGIN_SYMBOLS_FALLBACK).trim();
  }

  function marginPinsStoreKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_STATE_PINS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_STATE_PINS_V1 ||
      KEY_MARGIN_PINS_FALLBACK;
    return String(key || KEY_MARGIN_PINS_FALLBACK).trim();
  }

  function marginSymbolColorsMapKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_SYMBOL_COLORS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_SYMBOL_COLORS_V1 ||
      KEY_MARGIN_SYMBOL_COLORS_FALLBACK;
    return String(key || KEY_MARGIN_SYMBOL_COLORS_FALLBACK).trim();
  }

  function loadMarginSymbolsMap() {
    const map = storageGetJSON(marginSymbolsMapKey(), null);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    return map;
  }

  function loadMarginSymbolColorsMap() {
    const map = storageGetJSON(marginSymbolColorsMapKey(), null);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    return map;
  }

  function buildMarginSymbolMetaMapFromPinsStore() {
    const store = storageGetJSON(marginPinsStoreKey(), null);
    if (!store || typeof store !== 'object' || Array.isArray(store)) return Object.create(null);
    const out = Object.create(null);
    for (const [answerId, buckets] of Object.entries(store)) {
      const id = String(answerId || '').trim();
      if (!id) continue;
      const bucketList = Array.isArray(buckets)
        ? buckets
        : ((buckets && typeof buckets === 'object') ? Object.values(buckets) : []);
      const symbols = collectSymbolsFromBuckets(bucketList);
      if (!symbols.length) continue;
      const colors = collectSymbolColorsFromBuckets(bucketList);
      out[id] = { symbols, colors };
    }
    return out;
  }

  function getMarginSymbolMetaMap() {
    const symbolsMap = loadMarginSymbolsMap();
    if (symbolsMap) {
      const colorsMap = loadMarginSymbolColorsMap();
      const pinsMetaMap = colorsMap ? null : buildMarginSymbolMetaMapFromPinsStore();
      const colorsSource = colorsMap || Object.create(null);
      const out = Object.create(null);
      for (const [answerId, symbolsRaw] of Object.entries(symbolsMap)) {
        const id = String(answerId || '').trim();
        if (!id) continue;
        const symbols = normalizeSymbols(symbolsRaw);
        if (!symbols.length) continue;
        const colors = normalizeColors(
          colorsSource[id] ?? pinsMetaMap?.[id]?.colors ?? []
        );
        out[id] = { symbols, colors };
      }
      return out;
    }
    return buildMarginSymbolMetaMapFromPinsStore();
  }

  function getMarginSymbolMetaForAnswer(answerId, symbolMetaMap = null) {
    const id = String(answerId || '').trim();
    if (!id) return { symbols: [], colors: [] };
    const map = (symbolMetaMap && typeof symbolMetaMap === 'object' && !Array.isArray(symbolMetaMap))
      ? symbolMetaMap
      : getMarginSymbolMetaMap();
    const raw = map?.[id];
    if (Array.isArray(raw)) return { symbols: normalizeSymbols(raw), colors: [] };
    return {
      symbols: normalizeSymbols(raw?.symbols),
      colors: normalizeColors(raw?.colors),
    };
  }

  function getMarginSymbolsForAnswer(answerId, symbolMetaMap = null) {
    return getMarginSymbolMetaForAnswer(answerId, symbolMetaMap).symbols;
  }

  function ensureMiniMapGutter(btnRow) {
    if (!btnRow || typeof btnRow !== 'object') return null;
    const wrap = btnRow.matches?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap')
      ? btnRow
      : btnRow.closest?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap');
    if (!wrap) return null;

    let gutter = wrap.querySelector('.cgxui-mm-gutter');
    if (!gutter) {
      gutter = document.createElement('div');
      gutter.className = 'cgxui-mm-gutter';
      wrap.appendChild(gutter);
    }

    let sym = gutter.querySelector('.cgxui-mm-gutterSym');
    if (!sym) {
      sym = document.createElement('span');
      sym.className = 'cgxui-mm-gutterSym';
      gutter.appendChild(sym);
    }
    return { wrap, gutter, sym };
  }

  function updateMiniMapGutterSymbol(btnRow, symbols, opts = null) {
    const mounted = ensureMiniMapGutter(btnRow);
    if (!mounted) return false;

    const first = normalizeSymbols(symbols)[0] || '';
    const color = String(opts?.color || '').trim();

    const maApi = TOPW?.H2O?.MA?.mrgnnchr?.api?.core;

    if (maApi && maApi.symbols?.buildViewModel && maApi.symbols?.resolveSemanticId) {
        mounted.sym.textContent = '';
        const symbolId = first ? maApi.symbols.resolveSemanticId(first, first) : '';

        if (symbolId) {
            const vm = maApi.symbols.buildViewModel(symbolId, color, '');
            if (vm && vm.svgBody) {
                const flipStyle = vm.symbolId === 'arrow' ? 'transform: scaleX(-1); transform-origin: 50% 50%;' : '';
                mounted.sym.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vm.viewBox}" fill="none" aria-hidden="true" focusable="false" style="width: 100%; height: 100%; ${flipStyle}">${vm.svgBody}</svg>`;
            }
        }
    } else {
        if (mounted.sym.textContent !== first) mounted.sym.textContent = first;
    }

    if (first) mounted.gutter.setAttribute('data-has-symbol', '1');
    else mounted.gutter.removeAttribute('data-has-symbol');

    if (!first) {
      if (mounted.sym.style.color) mounted.sym.style.color = '';
      return true;
    }
    if (color) {
      if (mounted.sym.style.color !== color) mounted.sym.style.color = color;
    } else if (mounted.sym.style.color) {
      mounted.sym.style.color = '';
    }
    return true;
  }

  function syncMiniMapGutterForAnswer(answerId, symbols = null, colors = null) {
    const id = String(answerId || '').trim();
    if (!id) return false;
    const btn = getBtnById(id) || findMiniBtn(id);
    if (!btn) return false;

    const hasSymbols = Array.isArray(symbols);
    const hasColors = Array.isArray(colors);
    const meta = (!hasSymbols || !hasColors) ? getMarginSymbolMetaForAnswer(id) : null;
    const nextSymbols = hasSymbols ? normalizeSymbols(symbols) : (meta?.symbols || []);
    const nextColors = hasColors ? normalizeColors(colors) : (meta?.colors || []);
    return updateMiniMapGutterSymbol(btn, nextSymbols, { color: String(nextColors[0] || '').trim() });
  }

  function flushMiniMapGutterQueue() {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      S.gutterSyncRaf = 0;
      const entries = Array.from(S.gutterSyncQueue.entries());
      S.gutterSyncQueue.clear();
      for (const [answerId, payload] of entries) {
        try {
          syncMiniMapGutterForAnswer(answerId, payload?.symbols ?? null, payload?.colors ?? null);
        } catch {}
      }
      if (entries.length) noteRenderUnit('gutterSymbols', entries.length);
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.flushMiniMapGutterQueue, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'flushMiniMapGutterQueue');
      }
      exitPerfOwner('incremental');
    }
  }

  function scheduleMiniMapGutterSync(answerId, symbols = null, colors = null) {
    const id = String(answerId || '').trim();
    if (!id) return;
    const hasSymbols = Array.isArray(symbols);
    const hasColors = Array.isArray(colors);
    const prev = S.gutterSyncQueue.get(id) || { symbols: null, colors: null };
    const next = {
      symbols: hasSymbols ? normalizeSymbols(symbols) : prev.symbols,
      colors: hasColors ? normalizeColors(colors) : prev.colors,
    };
    if (!hasSymbols && !hasColors && !S.gutterSyncQueue.has(id)) {
      next.symbols = null;
      next.colors = null;
    }
    S.gutterSyncQueue.set(id, next);
    if (S.gutterSyncRaf) return;
    S.gutterSyncRaf = requestAnimationFrame(flushMiniMapGutterQueue);
  }

  function bindMarginSymbolsBridge() {
    if (S.marginSymbolsBridgeBound) return true;

    const onMarginSymbolsChanged = (ev) => {
      const detail = ev?.detail || {};
      const answerId = String(detail.answerId || '').trim();
      if (!answerId) return;
      const symbols = Array.isArray(detail.symbols) ? detail.symbols : null;
      const colors = Array.isArray(detail.colors) ? detail.colors : null;
      scheduleMiniMapGutterSync(answerId, symbols, colors);
    };

    window.addEventListener(EV_MARGIN_SYMBOLS_CHANGED, onMarginSymbolsChanged);
    if (EV_MARGIN_SYMBOLS_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_MARGIN_SYMBOLS_CHANGED.slice(4), onMarginSymbolsChanged);
    }

    S.marginSymbolsBridgeOff = () => {
      try { window.removeEventListener(EV_MARGIN_SYMBOLS_CHANGED, onMarginSymbolsChanged); } catch {}
      if (EV_MARGIN_SYMBOLS_CHANGED.startsWith('evt:')) {
        try { window.removeEventListener(EV_MARGIN_SYMBOLS_CHANGED.slice(4), onMarginSymbolsChanged); } catch {}
      }
    };
    S.marginSymbolsBridgeBound = true;
    return true;
  }

  function unbindMarginSymbolsBridge() {
    try { S.marginSymbolsBridgeOff?.(); } catch {}
    S.marginSymbolsBridgeOff = null;
    S.marginSymbolsBridgeBound = false;
  }

  function getTurnRuntimeApi() {
    return TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
  }

  function callEffectiveTurnRuntime(method, ...args) {
    const api = getTurnRuntimeApi();
    const name = EFFECTIVE_TURN_RUNTIME_METHOD[method];
    const fn = name ? api?.[name] : null;
    if (typeof fn !== 'function') return null;
    try { return fn.apply(api, args); } catch { return null; }
  }

  function getEffectivePresentationRuntimeStatus() {
    const status = callEffectiveTurnRuntime('STATUS');
    if (!status || typeof status !== 'object') {
      return Object.freeze({
        source: 'canonical',
        overlayActive: false,
        count: 0,
        canonicalFingerprint: '',
        effectiveFingerprint: '',
        effectiveCount: 0,
        anchorQId: null,
        pathLength: 0,
        generation: 0,
      });
    }
    // The canonical fingerprint identifies the whole conversation graph and is
    // unchanged by walking a different selected path through it. The effective
    // fingerprint - the same one the Pages Controller reads as
    // effectiveFingerprint - is what actually changes on a branch switch, so
    // page-unit identity and coherence need it. Read through the existing
    // INDEX verb: no third fingerprint model is introduced.
    let index = null;
    try { index = callEffectiveTurnRuntime('INDEX'); } catch { index = null; }
    const effectiveTurns = Array.isArray(index?.turns) ? index.turns : [];
    return Object.freeze({
      source: String(status.source || 'canonical'),
      overlayActive: status.overlayActive === true,
      count: Math.max(0, Number(status.count || 0) || 0),
      canonicalFingerprint: String(status.canonicalFingerprint || ''),
      effectiveFingerprint: String(index?.sourceFingerprint || ''),
      effectiveCount: effectiveTurns.length,
      anchorQId: String(status.anchorQId || '') || null,
      pathLength: Math.max(0, Number(status.pathLength || 0) || 0),
      generation: Math.max(0, Number(status.generation || 0) || 0),
    });
  }

  function selectedPathPresentationActive() {
    const status = getEffectivePresentationRuntimeStatus();
    return status.overlayActive === true
      && status.source === 'selected-path-overlay'
      && status.count > 0;
  }

  function getCompleteIndexProjectionStatus() {
    const api = getTurnRuntimeApi();
    try {
      const status = api?.getCompleteTurnIndexProjectionStatus?.();
      if (status && typeof status === 'object') {
        return {
          enabled: status.enabled === true,
          authoritative: status.authoritative === true,
          status: String(status.status || 'disabled'),
          diagnosticStatus: String(status.diagnosticStatus || '') || null,
          chatId: String(status.chatId || '') || null,
          count: Math.max(0, Number(status.count || 0) || 0),
          completeCount: Math.max(0, Number(status.completeCount ?? status.count ?? 0) || 0),
          pendingCount: Math.max(0, Number(status.pendingCount || 0) || 0),
          projectedCount: Math.max(0, Number(status.projectedCount ?? status.count ?? 0) || 0),
          source: String(status.source || '') || null,
          fingerprint: String(status.fingerprint || '') || null,
          completenessProof: String(status.completenessProof || '') || null,
          routeGeneration: Math.max(0, Number(status.routeGeneration || 0) || 0),
          // Branch-transition fields. These were previously dropped here, so
          // page-unit reconciliation could not tell that a trusted branch
          // switch had begun. trustedSelectionIntentActive and
          // branchSelectionStale are both set synchronously by the Core's
          // trusted native branch capture - before ChatGPT replaces the
          // mounted branch content - and clear only when the new presentation
          // is rebuilt or the selection is abandoned. The three lease flags
          // arrive later (coordinator acceptance, confirmation scheduling) and
          // are carried through unchanged for continuity with 1C1b.
          trustedSelectionIntentActive: status.trustedSelectionIntentActive === true,
          branchTransactionPending: status.branchTransactionPending === true,
          branchSelectionStale: status.branchSelectionStale === true,
          branchExpansionPending: status.branchExpansionPending === true,
          branchExpansionFailClosed: status.branchExpansionFailClosed === true,
          branchExpansionState: String(status.branchExpansionState || 'idle'),
          branchExpansionReason: String(status.branchExpansionReason || '') || null,
          branchExpansionPriorCount: Math.max(0, Number(status.branchExpansionPriorCount || 0) || 0),
          branchExpansionTargetCount: Math.max(0, Number(status.branchExpansionTargetCount || 0) || 0),
          branchExpansionExpectedFingerprint:
            String(status.branchExpansionExpectedFingerprint || '') || null,
          branchExpansionRequiredPageNums: Object.freeze(
            (Array.isArray(status.branchExpansionRequiredPageNums)
              ? status.branchExpansionRequiredPageNums
              : [])
              .map((pageNum) => Math.max(0, Number(pageNum || 0) || 0))
              .filter((pageNum, index, values) => pageNum > 1 && values.indexOf(pageNum) === index),
          ),
          selectedPathConfirmationPending: status.selectedPathConfirmationPending === true,
          selectedPathConfirmationLeaseActive: status.selectedPathConfirmationLeaseActive === true,
          selectedPathRequestLeaseActive: status.selectedPathRequestLeaseActive === true,
        };
      }
    } catch {}
    return {
      enabled: false,
      authoritative: false,
      status: 'disabled',
      branchTransactionPending: false,
      diagnosticStatus: null,
      chatId: null,
      count: 0,
      completeCount: 0,
      pendingCount: 0,
      projectedCount: 0,
      source: null,
      fingerprint: null,
      completenessProof: null,
      routeGeneration: 0,
      trustedSelectionIntentActive: false,
      branchSelectionStale: false,
      branchExpansionPending: false,
      branchExpansionFailClosed: false,
      branchExpansionState: 'idle',
      branchExpansionReason: null,
      branchExpansionPriorCount: 0,
      branchExpansionTargetCount: 0,
      branchExpansionExpectedFingerprint: null,
      branchExpansionRequiredPageNums: Object.freeze([]),
      selectedPathConfirmationPending: false,
      selectedPathConfirmationLeaseActive: false,
      selectedPathRequestLeaseActive: false,
    };
  }

  function getCompleteIndexMiniMapDiagnostics() {
    const status = getCompleteIndexProjectionStatus();
    return Object.freeze({
      enabled: status.enabled,
      authoritative: status.authoritative,
      status: status.status,
      diagnosticStatus: status.diagnosticStatus,
      expectedCount: status.projectedCount,
      completeCount: status.completeCount,
      pendingCount: status.pendingCount,
      publishedCount: Array.isArray(S.turnList) ? S.turnList.length : 0,
      boundaryStatus: String(S.completeIndexBoundaryStatus || 'disabled'),
      boundaryRenderCount: Math.max(0, Number(S.completeIndexBoundaryRenderCount || 0) || 0),
      legacyCacheAuthoritative: false,
    });
  }

  function projectSharedTurnRecord(record, fallbackIndex = 0) {
    const noAnswer = isCanonicalNoAnswerRecord(record);
    const questionId = String(record?.qId || record?.questionId || '').trim();
    const turnId = String(record?.turnId || (noAnswer && questionId ? `turn:${questionId}` : '')).trim();
    if (!turnId) return null;
    const answerId = noAnswer ? '' : String(record?.primaryAId || record?.answerId || '').trim();
    const answerIds = cacheRowAnswerIds({
      answerIds: Array.isArray(record?.answerVariants) ? record.answerVariants : record?.answerIds,
      primaryAId: answerId,
    });
    const index = Math.max(1, Number(record?.order || record?.turnNo || record?.idx || fallbackIndex || 1) || 1);
    const el = record?.live?.primaryAEl || record?.primaryAEl || null;
    const questionEl = record?.live?.qEl || record?.qEl || null;
    const projected = {
      turnId,
      answerId,
      primaryAId: answerId,
      answerIds,
      questionId,
      qId: questionId,
      noAnswer,
      hasAssistant: noAnswer ? false : record?.hasAssistant,
      index,
      el: el || null,
      questionEl: questionEl || null,
      livePending: record?.completeIndexPending === true,
      livePendingProvenance: record?.completeIndexPending === true ? 'live-pending-overlay' : null,
      streaming: record?.completeIndexPending === true && record?.livePendingStreaming === true,
    };
    projected.currentProof = questionId && (noAnswer || answerIds.length)
      ? CURRENT_PROOF_PROVEN
      : deriveLiveCurrentProof(projected);
    return projected;
  }

  function projectCanonicalTurnRecord(record, fallbackIndex = 0) {
    const noAnswer = isCanonicalNoAnswerRecord(record);
    const questionId = String(record?.questionId || record?.qId || '').trim();
    const turnId = String(record?.turnId || record?.id || (noAnswer && questionId ? `turn:${questionId}` : '')).trim();
    if (!turnId) return null;
    const answerId = noAnswer ? '' : String(record?.answerId || record?.primaryAId || record?.aId || '').trim();
    const answerIds = cacheRowAnswerIds({
      answerIds: record?.answerIds,
      primaryAId: answerId,
    });
    const index = Math.max(1, Number(record?.index || record?.idx || record?.turnNo || fallbackIndex || 1) || 1);
    const el = record?.el || record?.primaryAEl || record?.answerEl || record?.live?.primaryAEl || null;
    const questionEl = record?.questionEl || record?.qEl || record?.live?.qEl || null;
    const projected = {
      turnId,
      answerId,
      primaryAId: answerId,
      answerIds,
      questionId,
      qId: questionId,
      noAnswer,
      hasAssistant: noAnswer ? false : record?.hasAssistant,
      index,
      el: el || null,
      questionEl: questionEl || null,
    };
    projected.currentProof = questionId && (noAnswer || answerIds.length)
      ? CURRENT_PROOF_PROVEN
      : deriveLiveCurrentProof(projected);
    return projected;
  }

  function getPublishedTurnByIdMap() {
    try {
      return (W.H2O_MM_turnById instanceof Map) ? W.H2O_MM_turnById : null;
    } catch {
      return null;
    }
  }

  function getPublishedTurnIdByAIdMap() {
    try {
      return (W.H2O_MM_turnIdByAId instanceof Map) ? W.H2O_MM_turnIdByAId : null;
    } catch {
      return null;
    }
  }

  function getExistingMapStore() {
    try {
      if (S.mapButtons instanceof Map) return S.mapButtons;
      if (W.H2O_MM_mapButtons instanceof Map) return W.H2O_MM_mapButtons;
      if (W.mapButtons instanceof Map) return W.mapButtons;
    } catch {}
    return null;
  }

  function canonicalLookupCandidates(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return [];
    const out = [];
    const push = (value) => {
      const next = String(value || '').trim();
      if (next && !out.includes(next)) out.push(next);
    };
    push(key);
    if (key.startsWith('turn:')) push(key.slice(5));
    else push(`turn:${key}`);
    return out;
  }

  function lookupCanonicalTurnByTurnId(turnId) {
    const key = String(turnId || '').trim();
    if (!key) return null;
    if (S.turnById instanceof Map && S.turnById.has(key)) {
      return S.turnById.get(key) || null;
    }
    if (Array.isArray(S.turnList) && S.turnList.length) {
      const fromList = S.turnList.find((turn) => String(turn?.turnId || '').trim() === key) || null;
      if (fromList) return fromList;
    }
    const published = getPublishedTurnByIdMap();
    if (published?.has?.(key)) {
      return projectCanonicalTurnRecord(published.get(key), 0);
    }
    return null;
  }

  function lookupCanonicalTurnIdByAnswerId(answerId) {
    const key = String(answerId || '').trim();
    if (!key) return '';
    if (S.turnIdByAId instanceof Map) {
      const direct = String(S.turnIdByAId.get(key) || '').trim();
      if (direct) return direct;
    }
    if (Array.isArray(S.turnList) && S.turnList.length) {
      const fromList = S.turnList.find((turn) => String(turn?.answerId || '').trim() === key) || null;
      const turnId = String(fromList?.turnId || '').trim();
      if (turnId) return turnId;
    }
    const published = getPublishedTurnIdByAIdMap();
    const mapped = String(published?.get?.(key) || '').trim();
    if (mapped) return mapped;
    const publishedById = getPublishedTurnByIdMap();
    if (publishedById?.size) {
      for (const turn of publishedById.values()) {
        const fromMap = projectCanonicalTurnRecord(turn, 0);
        if (String(fromMap?.answerId || '').trim() === key) {
          return String(fromMap?.turnId || '').trim();
        }
      }
    }
    return mapped;
  }

  function hasCanonicalTurnSnapshotState() {
    return !!(
      (Array.isArray(S.turnList) && S.turnList.length)
      || (S.turnById instanceof Map && S.turnById.size)
      || (S.turnIdByAId instanceof Map && S.turnIdByAId.size)
      || (getPublishedTurnByIdMap()?.size)
      || (getPublishedTurnIdByAIdMap()?.size)
    );
  }

  function compareCanonicalTurns(a, b) {
    const ai = Math.max(0, Number(a?.index || 0) || 0);
    const bi = Math.max(0, Number(b?.index || 0) || 0);
    if (ai !== bi) return ai - bi;
    return String(a?.turnId || '').localeCompare(String(b?.turnId || ''));
  }

  function buildCanonicalSnapshotFromTurns(source = null, opts = {}) {
    const rows = Array.isArray(source)
      ? source.slice()
      : ((source instanceof Map) ? Array.from(source.values()) : []);
    if (!rows.length) return null;

    const answerByTurnSource = (opts.answerByTurn instanceof Map) ? opts.answerByTurn : null;
    const answersSource = Array.isArray(opts.answers) ? opts.answers.filter(Boolean) : [];
    const byAIdSource = (opts.byAId instanceof Map) ? opts.byAId : null;
    const reverseAnswerByTurn = new Map();
    if (byAIdSource) {
      for (const [answerId, turnId] of byAIdSource.entries()) {
        const aid = String(answerId || '').trim();
        const tid = String(turnId || '').trim();
        if (aid && tid && !reverseAnswerByTurn.has(tid)) reverseAnswerByTurn.set(tid, aid);
      }
    }

    if (source instanceof Map) {
      rows.sort((a, b) => compareCanonicalTurns(
        projectCanonicalTurnRecord(a, 0),
        projectCanonicalTurnRecord(b, 0)
      ));
    }

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];
    const seenAnswers = new Set();

    for (let i = 0; i < rows.length; i += 1) {
      const turn = projectCanonicalTurnRecord(rows[i], i + 1);
      if (!turn) continue;
      if (!turn.answerId) {
        const fallbackAnswerId = String(reverseAnswerByTurn.get(turn.turnId) || '').trim();
        if (fallbackAnswerId) turn.answerId = fallbackAnswerId;
      }
      if (byId.has(turn.turnId)) continue;
      list.push(turn);
      byId.set(turn.turnId, turn);
      if (turn.answerId && !byAId.has(turn.answerId)) byAId.set(turn.answerId, turn.turnId);
      const attached = answerByTurnSource?.get?.(turn.turnId) || turn.el || null;
      if (attached) {
        answerByTurn.set(turn.turnId, attached);
        if (!seenAnswers.has(attached)) {
          seenAnswers.add(attached);
          answers.push(attached);
        }
      }
    }

    if (!list.length) return null;
    return {
      list,
      byId,
      byAId,
      answerByTurn,
      answers: answers.length ? answers : answersSource,
    };
  }

  function getBestCanonicalSnapshot() {
    const fromState =
      buildCanonicalSnapshotFromTurns(S.turnList, {
        byAId: S.turnIdByAId,
        answerByTurn: S.answerByTurnId,
        answers: S.answerEls,
      })
      || buildCanonicalSnapshotFromTurns(S.turnById, {
        byAId: S.turnIdByAId,
        answerByTurn: S.answerByTurnId,
        answers: S.answerEls,
      });
    if (fromState?.list?.length) return fromState;

    const publishedById = getPublishedTurnByIdMap();
    const publishedByAId = getPublishedTurnIdByAIdMap();
    return buildCanonicalSnapshotFromTurns(publishedById, {
      byAId: publishedByAId,
      answerByTurn: S.answerByTurnId,
      answers: S.answerEls,
    });
  }

  function recoverMiniBtnFromDom(anyId, resolvedTurnId = '') {
    const key = String(anyId || '').trim();
    const turnId = String(resolvedTurnId || '').trim();
    const root = minimapCol(MM_uiRefs()?.panel || null) || minimapCol() || minimapPanel() || null;
    if (!root) return null;

    const ids = [];
    const push = (value) => {
      const next = String(value || '').trim();
      if (next && !ids.includes(next)) ids.push(next);
    };
    push(turnId);
    push(key);

    let btn = null;
    for (const id of ids) {
      const esc = escAttr(id);
      btn = q(`[data-cgxui="mnmp-btn"][data-turn-id="${esc}"]`, root)
        || q(`[data-cgxui="mnmp-btn"][data-id="${esc}"]`, root)
        || q(`[data-cgxui="mnmp-btn"][data-primary-a-id="${esc}"]`, root)
        || q(`[data-cgxui="mm-btn"][data-turn-id="${esc}"]`, root)
        || q(`[data-cgxui="mm-btn"][data-id="${esc}"]`, root)
        || q(`[data-cgxui="mm-btn"][data-primary-a-id="${esc}"]`, root)
        || null;
      if (btn) break;
    }
    if (!btn) return null;

    const canonicalTurnId = String(
      turnId
      || btn?.dataset?.turnId
      || lookupCanonicalTurnIdByAnswerId(String(btn?.dataset?.primaryAId || '').trim())
      || ''
    ).trim();
    if (canonicalTurnId) {
      try { ensureMapStore().set(canonicalTurnId, btn); } catch {}
    }
    return btn;
  }

  function getCanonicalTurnsFromSharedRuntime() {
    const api = getTurnRuntimeApi();
    if (!api) return null;

    let records = [];
    try {
      if (typeof api.listTurns === 'function') {
        records = api.listTurns() || [];
      } else if (typeof api.listTurnRecords === 'function') {
        records = api.listTurnRecords() || [];
      }
    } catch {
      records = [];
    }
    if (!Array.isArray(records) || !records.length) return null;
    S.lastCoreProjectionChatKey = String(resolveChatId() || '').trim();
    S.lastCoreProjectedTotal = records.length;

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];

    for (let i = 0; i < records.length; i += 1) {
      const turn = projectSharedTurnRecord(records[i], i + 1);
      if (!turn) continue;
      list.push(turn);
      byId.set(turn.turnId, turn);
      if (turn.answerId) byAId.set(turn.answerId, turn.turnId);
      if (turn.el) {
        answerByTurn.set(turn.turnId, turn.el);
        answers.push(turn.el);
      }
    }

    return list.length ? {
      list,
      byId,
      byAId,
      answerByTurn,
      answers,
      source: 'core-runtime',
      coreProjectedTotal: records.length,
      completeness: 'unproven',
    } : null;
  }

  function getEffectiveTurnsFromSharedRuntime() {
    const status = getEffectivePresentationRuntimeStatus();
    if (
      status.overlayActive !== true
      || status.source !== 'selected-path-overlay'
      || status.count < 1
    ) return null;
    const index = callEffectiveTurnRuntime('INDEX');
    if (
      !index
      || index.complete !== true
      || index.proof !== 'selected-path-overlay'
      || !Array.isArray(index.turns)
      || index.turns.length !== status.count
    ) return null;

    const mountedByAnswerId = new Map();
    for (const answerEl of getAnswerEls()) {
      const answerId = String(
        answerEl?.getAttribute?.('data-message-id')
        || answerEl?.dataset?.messageId
        || answerEl?.getAttribute?.('data-h2o-ans-id')
        || answerEl?.dataset?.h2oAnsId
        || ''
      ).trim();
      if (answerId && !mountedByAnswerId.has(answerId)) mountedByAnswerId.set(answerId, answerEl);
    }

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];
    for (let indexNo = 0; indexNo < index.turns.length; indexNo += 1) {
      const turn = projectSharedTurnRecord(index.turns[indexNo], indexNo + 1);
      if (!turn || turn.index !== indexNo + 1 || byId.has(turn.turnId)) return null;
      const answerEl = turn.answerId ? (mountedByAnswerId.get(turn.answerId) || null) : null;
      if (answerEl) {
        turn.el = answerEl;
        answerByTurn.set(turn.turnId, answerEl);
        answers.push(answerEl);
      }
      list.push(turn);
      byId.set(turn.turnId, turn);
      for (const answerId of turn.answerIds) {
        if (byAId.has(answerId)) return null;
        byAId.set(answerId, turn.turnId);
      }
    }
    return {
      list,
      byId,
      byAId,
      answerByTurn,
      answers,
      source: 'selected-path-overlay',
      completeness: 'selected-path-overlay',
      presentationOverlayActive: true,
      presentationCount: status.count,
      canonicalFingerprint: status.canonicalFingerprint,
    };
  }

  function getAuthoritativeTurnSnapshot() {
    const completeIndex = getCompleteIndexProjectionStatus();
    if (completeIndex.enabled) {
      const effective = getEffectiveTurnsFromSharedRuntime();
      if (
        effective
        &&
        completeIndex.authoritative
        && completeIndex.completenessProof === 'host-payload-full-graph'
        && effective?.list?.length === effective?.presentationCount
      ) return effective;
      const runtimeCanonical = getCanonicalTurnsFromSharedRuntime();
      if (
        completeIndex.authoritative
        && completeIndex.completenessProof === 'host-payload-full-graph'
        && runtimeCanonical?.list?.length === completeIndex.projectedCount
      ) {
        return {
          ...runtimeCanonical,
          source: 'complete-index-canonical',
          completeness: 'host-payload-full-graph',
          completeIndexStatus: completeIndex.status,
          completeIndexFingerprint: completeIndex.fingerprint,
        };
      }
      return {
        list: [],
        byId: new Map(),
        byAId: new Map(),
        answerByTurn: new Map(),
        answers: [],
        source: 'complete-index-boundary',
        completeness: 'unavailable',
        completeIndexStatus: completeIndex.status,
      };
    }
    const runtimeCanonical = getCanonicalTurnsFromSharedRuntime();
    const paginationCanonical = getCanonicalTurnsFromPagination();
    if (runtimeCanonical?.list?.length) {
      if (shouldUseSharedRuntimeCanonical(runtimeCanonical, paginationCanonical)) {
        return runtimeCanonical;
      }
    }
    if (paginationCanonical?.list?.length) return paginationCanonical;

    const turnApi = TOPW?.H2O?.turn || W?.H2O?.turn || null;
    let apiTurns = null;
    try {
      apiTurns = (typeof turnApi?.getTurns === 'function') ? (turnApi.getTurns() || null) : null;
    } catch {
      apiTurns = null;
    }
    const turnsCanonical = buildCanonicalTurnCollection(apiTurns, { requireAnswer: true });
    if (turnsCanonical?.list?.length) return turnsCanonical;

    const domCanonical = buildCanonicalTurnCollection(getAnswerEls(), { requireAnswer: true });
    if (domCanonical?.list?.length) return domCanonical;

    return {
      list: [],
      byId: new Map(),
      byAId: new Map(),
      answerByTurn: new Map(),
      answers: [],
    };
  }

  function hasCanonicalAssistantTurnShape(turn) {
    const answerId = normalizePaginationAnswerId(turn?.answerId || '');
    if (!answerId) return false;
    return String(turn?.turnId || '').trim() === `turn:a:${answerId}`;
  }

  function shouldUseSharedRuntimeCanonical(sharedCanonical, paginationCanonical) {
    const sharedList = Array.isArray(sharedCanonical?.list) ? sharedCanonical.list : [];
    if (!sharedList.length) return false;

    let paginationEnabled = false;
    try {
      const info = W?.H2O_Pagination?.getPageInfo?.();
      if (info && typeof info.enabled === 'boolean') paginationEnabled = !!info.enabled;
    } catch {}

    const canonicalList = Array.isArray(paginationCanonical?.list) ? paginationCanonical.list : [];
    if (!paginationEnabled || !canonicalList.length) return true;

    const sharedAnswerTurns = sharedList.filter((turn) => !!normalizePaginationAnswerId(turn?.answerId || ''));
    if (sharedAnswerTurns.length < canonicalList.length) return false;

    const checkCount = Math.min(getPaginationPageSizeHint(), canonicalList.length);
    for (let i = 0; i < checkCount; i += 1) {
      const sharedTurn = sharedAnswerTurns[i] || null;
      const sharedAnswerId = normalizePaginationAnswerId(sharedTurn?.answerId || '');
      const canonicalAnswerId = normalizePaginationAnswerId(canonicalList[i]?.answerId || '');
      if (!hasCanonicalAssistantTurnShape(sharedTurn)) return false;
      if (!sharedAnswerId || !canonicalAnswerId || sharedAnswerId !== canonicalAnswerId) return false;
    }

    return true;
  }

  function getSharedTurnRecordByAnyId(anyId) {
    const api = getTurnRuntimeApi();
    const key = String(anyId || '').trim();
    if (!api || !key) return null;
    try {
      if (selectedPathPresentationActive()) {
        return callEffectiveTurnRuntime('AID', key)
          || callEffectiveTurnRuntime('QID', key.replace(/^turn:/, ''))
          || null;
      }
      return api.getTurnRecordByTurnId?.(key)
        || api.getTurnRecordByAId?.(key)
        || api.getTurnRecordByQId?.(key)
        || null;
    } catch {
      return null;
    }
  }

  function isPaginationWindowingEnabled() {
    try {
      return !!W?.H2O_Pagination?.getPageInfo?.()?.enabled;
    } catch {
      return false;
    }
  }

  function isTurnOnCurrentPaginationPage(turnOrId, answerId = '') {
    if (!isPaginationWindowingEnabled()) return true;
    const turnId = (turnOrId && typeof turnOrId === 'object')
      ? String(turnOrId?.turnId || '').trim()
      : String(turnOrId || '').trim();
    const answerKey = String(answerId || (turnOrId && typeof turnOrId === 'object' ? turnOrId?.answerId || '' : '')).trim();
    const record = getSharedTurnRecordByAnyId(turnId || answerKey);
    const inCurrent = record?.page?.inCurrentPage;
    return (typeof inCurrent === 'boolean') ? inCurrent : true;
  }

  function indexTurns(opts = {}) {
    const authoritative = getAuthoritativeTurnSnapshot();
    const chatId = String(resolveChatId() || '').trim();
    const snapshot = {
      list: Array.isArray(authoritative?.list) ? authoritative.list.slice() : [],
      byId: authoritative?.byId instanceof Map ? authoritative.byId : new Map(),
      byAId: authoritative?.byAId instanceof Map ? authoritative.byAId : new Map(),
      answerByTurn: authoritative?.answerByTurn instanceof Map ? authoritative.answerByTurn : new Map(),
      answers: Array.isArray(authoritative?.answers) ? authoritative.answers.slice() : [],
      canonicalEvidence: {
        source: String(authoritative?.source || ''),
        chatId,
        coreProjectedTotal: authoritative?.source === 'core-runtime'
          ? Math.max(0, Number(authoritative?.coreProjectedTotal ?? authoritative?.coreTotal ?? 0) || 0)
          : null,
        completeness: String(authoritative?.completeness || 'unproven'),
      },
      presentationOverlayActive: authoritative?.presentationOverlayActive === true,
      presentationSource: String(authoritative?.source || ''),
    };
    if (opts?.commit === false) return snapshot;
    publishTurnSnapshot(snapshot);
    return S.turnList;
  }

  function getPaginationState() {
    try {
      return W?.H2O?.PW?.pgnwndw?.state || W?.H2O_Pagination?.state || null;
    } catch {
      return null;
    }
  }

  function normalizePaginationTurnId(raw, fallbackIdx = 0, answerId = '') {
    const direct = String(raw?.turnId || raw?.id || '').trim();
    if (direct) return direct;

    const uid = String(raw?.uid || raw?.turnUid || '').trim();
    if (uid) return uid.startsWith('turn:') ? uid : `turn:${uid}`;

    if (answerId) return `turn:a:${answerId}`;

    const idx = Math.max(1, Number(raw?.turnNo || raw?.gid || raw?.index || raw?.answerIndex || fallbackIdx || 1) || 1);
    return `pw-turn-${idx}`;
  }

  function normalizePaginationAnswerId(raw) {
    let id = String(raw || '').replace(/^conversation-turn-/, '').trim();
    if (!id) return '';
    if (id.startsWith('turn:a:')) id = id.slice(7).trim();
    else if (id.startsWith('turn:')) id = id.slice(5).trim();
    return id;
  }

  function buildCanonicalTurnCollection(rows, { requireAnswer = false } = {}) {
    const src = Array.isArray(rows) ? rows : [];
    if (!src.length) return null;

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];
    const seen = new Set();

    for (const raw of src) {
      if (!raw) continue;

      let answerEl = raw?.primaryAEl || raw?.answerEl || raw?.el || null;
      if (!answerEl && raw?.node) answerEl = pickAssistantMessageEl(raw.node);
      if (!answerEl && raw?.nodeType === 1) answerEl = pickAssistantMessageEl(raw);

      let answerId = normalizePaginationAnswerId(raw?.answerId || raw?.primaryAId || raw?.aId || '');
      if (!answerId && answerEl) answerId = normalizePaginationAnswerId(getMessageId(answerEl) || '');
      if (requireAnswer && !answerId && !answerEl) continue;

      const fallbackIndex = list.length + 1;
      const turnIndex1 = (raw?.turnIndex != null)
        ? (Math.max(1, Number(raw?.turnIndex) + 1) || 0)
        : 0;

      // Priority 1: Core turnRuntime turnNo via answerId — correct Q+A pair
      // number (1..N), properly accounts for unanswered-turn gaps so button 20
      // = pair 20 even when pair 19 is unanswered.
      let canonicalIndex = 0;
      if (rt && answerId) {
        try {
          const coreRecord = rt.getTurnRecordByAId?.(answerId) || null;
          const coreTurnNo = Math.max(0, Number(coreRecord?.turnNo || coreRecord?.idx || 0) || 0);
          if (coreTurnNo > 0) canonicalIndex = coreTurnNo;
        } catch {}
      }
      // Priority 2: answerIndex from pagination — fallback when Core hasn't reconciled yet.
      if (!canonicalIndex) {
        const answerIndexRaw = Math.max(0, Number(raw?.answerIndex || 0) || 0);
        if (answerIndexRaw > 0) canonicalIndex = answerIndexRaw;
      }
      // Priority 3: other fields for non-pagination sources.
      if (!canonicalIndex) {
        canonicalIndex = Math.max(1, Number(
            raw?.turnNo
            || raw?.gid
            || raw?.index
            || raw?.idx
            || turnIndex1
            || fallbackIndex
          ) || fallbackIndex);
      }

      const turnId = normalizePaginationTurnId(raw, canonicalIndex, answerId);
      const dedupeKey = String(answerId || turnId || '').trim();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const turn = {
        turnId,
        answerId,
        index: canonicalIndex,
        turnNo: canonicalIndex,
        gid: canonicalIndex,
        el: answerEl || null,
      };
      list.push(turn);
      byId.set(turnId, turn);
      if (answerId) byAId.set(answerId, turnId);
      if (answerEl) {
        answerByTurn.set(turnId, answerEl);
        answers.push(answerEl);
      }
    }

    if (!list.length) return null;
    return { list, byId, byAId, answerByTurn, answers };
  }

  function getCanonicalTurnsFromPagination() {
    const ps = getPaginationState();
    const canonicalRows =
      (Array.isArray(ps?.masterTurnUnits) && ps.masterTurnUnits.length) ? ps.masterTurnUnits
        : (Array.isArray(ps?.canonicalTurns) && ps.canonicalTurns.length) ? ps.canonicalTurns
          : (Array.isArray(ps?.masterAnswers) && ps.masterAnswers.length) ? ps.masterAnswers
            : null;
    const canonical = buildCanonicalTurnCollection(canonicalRows, { requireAnswer: true });
    if (canonical?.list?.length) return canonical;

    const rawTurns = Array.isArray(ps?.masterTurns) ? ps.masterTurns : [];
    return buildCanonicalTurnCollection(rawTurns, { requireAnswer: true });
  }

  function getPaginationPageSizeHint() {
    try {
      const info = W?.H2O_Pagination?.getPageInfo?.();
      const fromInfo = Math.max(1, Number(info?.pageSize || 0) || 0);
      if (fromInfo > 0) return fromInfo;
    } catch {}
    const ps = getPaginationState();
    const candidates = [
      ps?.runtime?.pageSize,
      ps?.config?.pageSize,
      ps?.pageSize,
    ];
    for (const raw of candidates) {
      const n = Math.max(1, Number(raw || 0) || 0);
      if (n > 0) return n;
    }
    return 25;
  }

  function validateTurnsAgainstPagination(turns = S.turnList, opts = {}) {
    const canonical = getCanonicalTurnsFromPagination();
    const canonicalList = Array.isArray(canonical?.list) ? canonical.list : [];
    const enabled = (() => {
      try {
        const info = W?.H2O_Pagination?.getPageInfo?.();
        if (info && typeof info.enabled === 'boolean') return !!info.enabled;
      } catch {}
      return canonicalList.length > 0;
    })();
    if (!enabled && !canonicalList.length) {
      return { ok: true, applicable: false, reason: 'pagination-off', pageSize: 0, checkedCount: 0 };
    }
    if (!canonicalList.length) {
      return { ok: true, applicable: false, reason: 'canonical-unavailable', pageSize: getPaginationPageSizeHint(), checkedCount: 0 };
    }

    const list = Array.isArray(turns) ? turns : [];
    const pageSize = Math.max(1, Number(opts?.pageSize || getPaginationPageSizeHint() || 25) || 25);
    const checkedCount = Math.min(pageSize, canonicalList.length);
    if (!checkedCount) {
      return { ok: true, applicable: true, reason: 'empty-canonical', pageSize, checkedCount: 0 };
    }
    if (!list.length) {
      return {
        ok: false,
        applicable: true,
        reason: 'turns-empty',
        pageSize,
        checkedCount,
        missingAnswerCount: checkedCount,
        mismatchedAnswerCount: 0,
        missingTurnCount: 0,
        firstMismatchAt: 1,
      };
    }

    let missingAnswerCount = 0;
    let mismatchedAnswerCount = 0;
    let missingTurnCount = 0;
    let firstMismatchAt = 0;
    let firstExpectedAnswerId = '';
    let firstActualAnswerId = '';
    let firstExpectedTurnId = '';
    let firstActualTurnId = '';

    for (let i = 0; i < checkedCount; i += 1) {
      const expected = canonicalList[i] || null;
      const actual = list[i] || null;
      const expectedAnswerId = normalizePaginationAnswerId(expected?.answerId || expected?.primaryAId || '');
      const actualAnswerId = normalizePaginationAnswerId(actual?.answerId || actual?.primaryAId || actual?.aId || '');
      const expectedTurnId = String(expected?.turnId || '').trim();
      const actualTurnId = String(actual?.turnId || actual?.id || '').trim();

      let mismatch = false;
      if (!actual) {
        missingTurnCount += 1;
        mismatch = true;
      } else if (expectedAnswerId) {
        if (!actualAnswerId) {
          missingAnswerCount += 1;
          mismatch = true;
        } else if (actualAnswerId !== expectedAnswerId) {
          mismatchedAnswerCount += 1;
          mismatch = true;
        }
      } else if (expectedTurnId && actualTurnId !== expectedTurnId) {
        missingTurnCount += 1;
        mismatch = true;
      }

      if (mismatch && !firstMismatchAt) {
        firstMismatchAt = i + 1;
        firstExpectedAnswerId = expectedAnswerId;
        firstActualAnswerId = actualAnswerId;
        firstExpectedTurnId = expectedTurnId;
        firstActualTurnId = actualTurnId;
      }
    }

    const ok = missingAnswerCount === 0 && mismatchedAnswerCount === 0 && missingTurnCount === 0 && list.length >= checkedCount;
    return {
      ok,
      applicable: true,
      reason: ok ? 'ok' : 'first-page-mismatch',
      pageSize,
      checkedCount,
      missingAnswerCount,
      mismatchedAnswerCount,
      missingTurnCount,
      firstMismatchAt,
      firstExpectedAnswerId,
      firstActualAnswerId,
      firstExpectedTurnId,
      firstActualTurnId,
      totalTurns: list.length,
      totalCanonicalTurns: canonicalList.length,
    };
  }

  function getTurnPageBand(turnIndex) {
    const idx = Math.max(1, Number(turnIndex || 1));
    if (idx <= 25) return 'normal';
    if (idx <= 50) return 'teal';
    if (idx <= 75) return 'blue';
    if (idx <= 100) return 'darkred';
    return 'violet';
  }

  // MiniMap page divider: automatic structural divider inside the MiniMap track.
  function createMiniMapPageDivider(pageNum, band, collapsed = false) {
    const div = document.createElement('div');
    div.className = 'cgxui-mm-page-divider';
    div.setAttribute('data-page-band', String(band || 'normal'));
    div.setAttribute('data-page-num', String(pageNum || 1));
    div.innerHTML = `<span class="cgxui-mm-page-divider-line"></span><button type="button" class="cgxui-mm-page-divider-label" data-page-num="${String(pageNum || 1)}" data-page-band="${String(band || 'normal')}" aria-label="Go to Page ${String(pageNum || 1)}">Page ${pageNum}</button><span class="cgxui-mm-page-divider-line"></span>`;
    setMiniMapPageDividerDomState(div, collapsed);
    return div;
  }

  function ensureMiniDividerLayer(panel = null) {
    const host = panel || minimapPanel();
    if (!host) return null;
    let layer =
      host.querySelector?.(`[data-cgxui="${UI_TOK.DIVIDER_LAYER}"][data-cgxui-owner="${UI_TOK.OWNER}"]`) ||
      host.querySelector?.('.cgxui-mm-divider-layer') ||
      null;
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'cgxui-mm-divider-layer';
    layer.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    layer.setAttribute('data-cgxui', UI_TOK.DIVIDER_LAYER);
    host.appendChild(layer);
    return layer;
  }

  function getMiniDividerTrackMetrics(panel = null, col = null) {
    const host = panel || minimapPanel();
    const track = col || minimapCol(host);
    if (!host || !track || !track.isConnected) return null;
    const top = Number(track.offsetTop || 0) || 0;
    const height = Math.max(0, Number(track.offsetHeight || 0) || 0);
    if (!height) return null;
    return { panel: host, col: track, top, height };
  }

  function getMiniDividerRowMeta(row, idx = 0) {
    if (!row?.matches) return null;
    if (row.matches(`[data-cgxui="${UI_TOK.WRAP}"], [data-cgxui="${UI_TOK.WRAP_LEGACY}"], .cgxui-mm-wrap`)) {
      const turnId = String(row?.dataset?.turnId || '').trim();
      const turnIdx = Math.max(0, Number(row?.dataset?.turnIdx || 0) || 0);
      const keyCore = turnId || (turnIdx ? `idx:${turnIdx}` : `row:${idx}`);
      return {
        el: row,
        type: 'turn',
        key: `turn:${keyCore}`,
        turnId,
        turnIdx,
      };
    }
    if (row.matches('.cgxui-mm-page-divider')) {
      const pageNum = Math.max(1, Number(row?.dataset?.pageNum || 1) || 1);
      return {
        el: row,
        type: 'page-divider',
        key: `page:${pageNum}`,
        pageNum,
      };
    }
    return {
      el: row,
      type: 'row',
      key: `row:${idx}`,
    };
  }


  function isMiniDividerSurfaceVisible(el) {
    if (!el?.isConnected) return false;
    const w = Number(el.offsetWidth || 0) || 0;
    const h = Number(el.offsetHeight || 0) || 0;
    if (!(w > 0 && h > 0)) return false;

    const cs = getComputedStyle(el);
    if (!cs) return true;

    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if ((Number(cs.opacity) || 0) <= 0.001) return false;

    return true;
  }

  function getMiniDividerRowBounds(meta) {
    const row = meta?.el || null;
    if (!row) return null;

    const rowTop = Number(row.offsetTop || 0) || 0;
    const rowBottom = rowTop + (Number(row.offsetHeight || 0) || 0);

    if (meta?.type !== 'turn') {
      return { top: rowTop, bottom: rowBottom };
    }

    const qBtn = getQuestionBtnForWrap(row);
    const aBtn =
      row.querySelector?.(`[data-cgxui="${UI_TOK.BTN}"]`) ||
      row.querySelector?.(`[data-cgxui="${UI_TOK.BTN_LEGACY}"]`) ||
      row.querySelector?.('.cgxui-mm-btn') ||
      null;

    const parts = [];

    // In Q+A view: use visible question + answer as one grouped snap surface.
    // In Classic view: qBtn should not exist, but even if it does, hidden ones are ignored.
    for (const el of [qBtn, aBtn]) {
      if (!isMiniDividerSurfaceVisible(el)) continue;

      const top = rowTop + (Number(el.offsetTop || 0) || 0);
      const bottom = top + (Number(el.offsetHeight || 0) || 0);

      if (!(bottom > top)) continue;
      parts.push({ top, bottom });
    }

    if (!parts.length) {
      return { top: rowTop, bottom: rowBottom };
    }

    return {
      top: Math.min(...parts.map((part) => part.top)),
      bottom: Math.max(...parts.map((part) => part.bottom)),
    };
  }

  function getMiniDividerGapModel(panel = null, col = null) {
    const info = getMiniDividerTrackMetrics(panel, col);
    if (!info) return null;

    // IMPORTANT:
    // Only turn rows are valid snap neighbors for custom dividers.
    // This excludes page dividers and any other non-turn rows.
    const rows = Array.from(info.col.children || [])
      .map((row, idx) => getMiniDividerRowMeta(row, idx))
      .filter((meta) => meta && meta.type === 'turn');

    const gaps = [];
    const centerRatio = Math.max(
      0,
      Math.min(1, Number(MINI_DIVIDER_LAYOUT.GAP_CENTER_RATIO ?? 0.5) || 0.5)
    );
    const upperClearance = Math.max(
      0,
      Number(MINI_DIVIDER_LAYOUT.UPPER_BOX_CLEARANCE_PX ?? 0) || 0
    );
    const lowerClearance = Math.max(
      0,
      Number(MINI_DIVIDER_LAYOUT.LOWER_BOX_CLEARANCE_PX ?? 0) || 0
    );

    for (let i = 0; i < rows.length - 1; i += 1) {
      const before = rows[i];
      const after = rows[i + 1];

      const beforeBounds = getMiniDividerRowBounds(before);
      const afterBounds = getMiniDividerRowBounds(after);

      if (!beforeBounds || !afterBounds) continue;

      const beforeBottom = Number(beforeBounds.bottom || 0);
      const afterTop = Number(afterBounds.top || 0);
      const gapHeight = afterTop - beforeBottom;

      if (!(gapHeight > 0)) continue;

      // True target inside the real turn-to-turn gap
      const desiredY = beforeBottom + (gapHeight * centerRatio);

      // Safety clamps
      const safeMinY = beforeBottom + upperClearance;
      const safeMaxY = afterTop - lowerClearance;

      let y = desiredY;

      if (safeMaxY >= safeMinY) {
        y = Math.min(safeMaxY, Math.max(safeMinY, desiredY));
      } else {
        // If the clearances are too large for this gap,
        // fall back to the raw geometric center of the TURN gap,
        // not some other row model.
        y = beforeBottom + (gapHeight * 0.5);
      }

      const ratio = clampMiniDividerRatio(y / Math.max(1, info.height));

      gaps.push({
        id: `gap:${before.key}::${after.key}`,
        index: gaps.length + 1,
        y,
        ratio,
        before,
        after,
        gapHeight,
        beforeBottom,
        afterTop,
      });
    }

    return { metrics: info, rows, gaps };
  }

  function findNearestMiniDividerGap(targetRatio, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const ratio = clampMiniDividerRatio(targetRatio);
    let best = gaps[0];
    let bestDist = Math.abs(Number(best?.ratio || 0) - ratio);
    for (let i = 1; i < gaps.length; i += 1) {
      const gap = gaps[i];
      const dist = Math.abs(Number(gap?.ratio || 0) - ratio);
      if (dist < bestDist) {
        best = gap;
        bestDist = dist;
      }
    }
    return best;
  }

  function findNearestMiniDividerGapByY(targetY, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const y = Number(targetY);
    if (!Number.isFinite(y)) return gaps[0] || null;
    let best = gaps[0];
    let bestDist = Math.abs(Number(best?.y || 0) - y);
    for (let i = 1; i < gaps.length; i += 1) {
      const gap = gaps[i];
      const dist = Math.abs(Number(gap?.y || 0) - y);
      if (dist < bestDist) {
        best = gap;
        bestDist = dist;
      }
    }
    return best;
  }

  function getMiniDividerGapFromSlot(afterTurnIndex, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!slot || !gaps.length) return null;
    return gaps.find((gap) => Number(gap?.before?.turnIdx || 0) === slot) || null;
  }

  function resolveMiniDividerGap(item, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const gapId = String(item?.gapId || '').trim();
    if (gapId) {
      const byId = gaps.find((gap) => String(gap?.id || '').trim() === gapId) || null;
      if (byId) return byId;
    }
    const slot = Math.max(0, Number(item?.afterTurnIndex || 0) || 0);
    if (slot) {
      const bySlot = getMiniDividerGapFromSlot(slot, gapModel);
      if (bySlot) return bySlot;
    }
    const rawRatio = Number(item?.yRatio);
    if (Number.isFinite(rawRatio)) {
      const byRatio = findNearestMiniDividerGap(rawRatio, gapModel);
      if (byRatio) return byRatio;
    }
    return gaps[0] || null;
  }

  function getDefaultMiniDividerGap(model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const info = gapModel?.metrics || null;
    const activeBtn = info?.col?.querySelector?.('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn[data-cgxui-state~="active"], .cgxui-mm-btn.active') || null;
    const wrap = getWrapForMiniBtn(activeBtn);
    const activeIdx = Math.max(0, Number(wrap?.dataset?.turnIdx || activeBtn?.dataset?.turnIdx || 0) || 0);
    if (activeIdx) {
      const direct = getMiniDividerGapFromSlot(activeIdx, gapModel);
      if (direct) return direct;
      const wrapBottom = Number(wrap?.offsetTop || 0) + Number(wrap?.offsetHeight || 0);
      return findNearestMiniDividerGap(wrapBottom / Math.max(1, info?.height || 1), gapModel) || gaps[0];
    }
    return gaps[Math.floor(gaps.length / 2)] || gaps[0] || null;
  }

  function positionMiniDividerElement(divider, gap) {
    if (!divider) return false;
    const nextRatio = clampMiniDividerRatio(gap?.ratio);
    const nextY = Number(gap?.y);
    const gapId = String(gap?.id || '').trim();
    if (Number.isFinite(nextY)) divider.style.top = `${nextY.toFixed(2)}px`;
    else divider.style.top = `${(nextRatio * 100).toFixed(4)}%`;
    divider.dataset.yRatio = String(nextRatio);
    if (gapId) divider.dataset.gapId = gapId;
    else delete divider.dataset.gapId;
    return true;
  }

  function handleMiniDividerPointerDown(e, dividerId = '') {
    const item = getMiniDividerById(dividerId);
    if (!item) return;
    const panel = minimapPanel();
    const layer = ensureMiniDividerLayer(panel);
    const divider = e?.currentTarget || null;
    if (!panel || !layer || !divider) return;

    e.preventDefault();
    e.stopPropagation();

    const model = getMiniDividerGapModel(panel, minimapCol(panel));
    const gaps = Array.isArray(model?.gaps) ? model.gaps : [];
    if (!gaps.length) return;

    const selectedId = String(item?.id || '').trim();
    if (selectedId) {
      setSelectedMiniDividerId(selectedId, { chatId: item.chatId, source: 'core:drag-start', render: false, emit: true });
      try {
        const nodes = Array.from(layer.querySelectorAll('.cgxui-mm-overlay-divider[data-divider-id]'));
        for (const node of nodes) {
          node.setAttribute('data-selected', node === divider ? '1' : '0');
        }
      } catch {}
    }

    const layerRect = () => layer.getBoundingClientRect();
    const startGap = resolveMiniDividerGap(item, model) || gaps[0];
    if (!startGap) return;

    const gapFromClientY = (clientY) => {
      const rect = layerRect();
      const y = Number(clientY || 0) - rect.top;
      return findNearestMiniDividerGapByY(y, model) || startGap;
    };

    const prevDrag = S.dividerDrag;
    if (prevDrag) {
      try { window.removeEventListener('pointermove', prevDrag.move, true); } catch {}
      try { window.removeEventListener('pointerup', prevDrag.up, true); } catch {}
      try { window.removeEventListener('pointercancel', prevDrag.up, true); } catch {}
      S.dividerDrag = null;
    }

    const move = (ev) => {
      ev.preventDefault?.();
      const gap = gapFromClientY(ev.clientY);
      if (S.dividerDrag) {
        S.dividerDrag.gapId = String(gap?.id || '').trim();
        S.dividerDrag.ratio = Number(gap?.ratio || startGap?.ratio || 0.5);
      }
      positionMiniDividerElement(divider, gap);
    };
    const up = (ev) => {
      try { window.removeEventListener('pointermove', move, true); } catch {}
      try { window.removeEventListener('pointerup', up, true); } catch {}
      try { window.removeEventListener('pointercancel', up, true); } catch {}
      const drag = S.dividerDrag;
      S.dividerDrag = null;
      if (!drag) return;
      const finalGap = gapFromClientY(ev?.clientY);
      const existing = getMiniDividerById(drag.dividerId, drag.chatId) || item;
      const result = upsertMiniDivider({
        id: drag.dividerId,
        gapId: String(finalGap?.id || drag.gapId || '').trim(),
        yRatio: Number(finalGap?.ratio || drag.ratio || startGap?.ratio || 0.5),
        style: existing?.style,
        color: existing?.color,
        afterTurnIndex: 0,
      }, drag.chatId);
      if (!result?.ok && divider) {
        positionMiniDividerElement(divider, startGap);
      }
      try { ev.preventDefault?.(); } catch {}
    };

    S.dividerDrag = {
      dividerId: selectedId,
      chatId: item.chatId,
      gapId: String(startGap?.id || '').trim(),
      ratio: Number(startGap?.ratio || 0.5),
      move,
      up,
    };

    try { window.addEventListener('pointermove', move, true); } catch {}
    try { window.addEventListener('pointerup', up, true); } catch {}
    try { window.addEventListener('pointercancel', up, true); } catch {}
  }

  function createOverlayMiniDivider(item, metrics = null) {
    const divider = document.createElement('div');
    const style = normalizeMiniDividerStyle(item?.style || '');
    const color = normalizeMiniDividerColor(item?.color || '');
    const selected = String(item?.id || '').trim() === String(S.selectedMiniDividerId || '').trim();
    const model = metrics?.gaps ? metrics : getMiniDividerGapModel(metrics?.panel || null, metrics?.col || null);
    const gap = resolveMiniDividerGap(item, model);
    if (!gap) return null;

    divider.className = 'cgxui-mm-overlay-divider';
    divider.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    divider.setAttribute('data-cgxui', UI_TOK.DIVIDER);
    divider.setAttribute('data-divider-id', String(item?.id || ''));
    divider.setAttribute('data-divider-style', style);
    divider.setAttribute('data-selected', selected ? '1' : '0');
    divider.style.setProperty('--cgxui-mm-overlay-divider-color', color);
    divider.innerHTML = '<span class="cgxui-mm-overlay-divider-hit" aria-hidden="true"></span><span class="cgxui-mm-overlay-divider-line" aria-hidden="true"></span>';
    positionMiniDividerElement(divider, gap);
    divider.addEventListener('pointerdown', (e) => handleMiniDividerPointerDown(e, item?.id || ''), { passive: false });
    return divider;
  }

  function renderMiniDividerOverlay(chatId = '') {
    const perfOwned = enterPerfOwner('divider');
    const perfT0 = perfNow();
    try {
      const panel = minimapPanel();
      const col = minimapCol(panel);
      const layer = ensureMiniDividerLayer(panel);
      if (!panel || !col || !layer) return null;

      const items = loadMiniDividers(chatId);
      const model = getMiniDividerGapModel(panel, col);
      const metrics = model?.metrics || null;
      if (!metrics || !Array.isArray(model?.gaps)) {
        const removedCount = Number(layer.childElementCount || 0) || 0;
        if (removedCount > 0) {
          noteNodeLifecycle('removed', 'overlayDividers', removedCount);
          PERF.dividerUi.removedCount = Number(PERF.dividerUi.removedCount || 0) + removedCount;
        }
        layer.replaceChildren();
        return layer;
      }

      layer.style.top = `${metrics.top}px`;
      layer.style.height = `${metrics.height}px`;

      const selectedId = String(S.selectedMiniDividerId || '').trim();
      if (selectedId && !items.some((item) => String(item?.id || '').trim() === selectedId)) {
        S.selectedMiniDividerId = '';
      }

      const prevCount = Number(layer.childElementCount || 0) || 0;
      const frag = document.createDocumentFragment();
      let createdCount = 0;
      for (const item of items) {
        const divider = createOverlayMiniDivider(item, model);
        if (divider) {
          frag.appendChild(divider);
          createdCount += 1;
        }
      }
      if (prevCount > 0) noteNodeLifecycle('removed', 'overlayDividers', prevCount);
      if (createdCount > 0) {
        noteNodeLifecycle('created', 'overlayDividers', createdCount);
        noteRenderUnit('overlayDividers', createdCount);
        PERF.dividerUi.createdCount = Number(PERF.dividerUi.createdCount || 0) + createdCount;
      }
      if (prevCount > 0) PERF.dividerUi.removedCount = Number(PERF.dividerUi.removedCount || 0) + prevCount;
      layer.replaceChildren(frag);
      return layer;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.renderMiniDividerOverlay, ms);
      if (perfOwned) {
        recordDuration(PERF.dividerUi, ms);
        noteSummaryBucket(PERF.dividerUi, 'renderMiniDividerOverlay');
      }
      exitPerfOwner('divider');
    }
  }

  function createBtn(turn) {
    const wrap = document.createElement('div');
    wrap.className = 'cgxui-mm-wrap';
    wrap.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    wrap.setAttribute('data-cgxui', UI_TOK.WRAP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cgxui-mm-btn';
    btn.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    btn.setAttribute('data-cgxui', UI_TOK.BTN);
    btn.innerHTML = '<span class="cgxui-mm-qfrom" aria-hidden="true"></span>'
      + '<span class="cgxui-mm-qto" aria-hidden="true"></span>'
      + `<span class="cgxui-mm-num" aria-hidden="true">${turn.index}</span>`;

    wrap.appendChild(btn);
    syncTurnRowDom(btn, turn, { qaEnabled: isQaViewActive() });

    return {
      wrap,
      btn,
      qBtn: getQuestionBtnForWrap(wrap),
    };
  }

  function ensureTurnButtons(list = S.turnList, opts = {}) {
    const perfOwned = enterPerfOwner('fullRender');
    const perfT0 = perfNow();
    try {
      const explicitTurns = Array.isArray(list) ? list.filter(Boolean) : [];
      const snapshot = explicitTurns.length ? null : getAuthoritativeTurnSnapshot();
      const turns = explicitTurns.length ? explicitTurns : (Array.isArray(snapshot?.list) ? snapshot.list : []);
      const col = ensureCol();
      if (!col) return null;
      applyMiniMapPageUiPrefs();
      if (!turns.length) {
        bumpReason(PERF.fullRender.branches, 'emptyListClear');
        col.textContent = '';
        const clearedMap = setMapStore(new Map());
        try { renderMiniDividerOverlay(resolveChatId()); } catch {}
        return clearedMap;
      }

      const prevMap = ensureMapStore();
      const nextMap = new Map();
      const marginSymbolMetaMap = getMarginSymbolMetaMap();
      const frag = document.createDocumentFragment();
      const postCommitJobs = [];
      const qaEnabled = syncCurrentViewArtifacts() === 'qa';
      const collapsedPages = readCollapsedMiniMapPages(resolveChatId());
      let expectedRows = 0;
      for (const turn of turns) {
        const turnIndex = Number(turn?.index || 0);
        if (!turnIndex) continue;
        expectedRows += 1;
        if (((turnIndex - 1) % 25) === 0) expectedRows += 1;
      }
      const fastChildren = Array.from(col.children || []);
      let canReuseStructure = fastChildren.length === expectedRows && expectedRows > 0;
      let childIdx = 0;

      if (canReuseStructure) {
        for (const turn of turns) {
          const turnId = String(turn?.turnId || '').trim();
          const turnIndex = Number(turn?.index || 0);
          const pageNum = Math.max(1, Math.ceil(turnIndex / 25));
          if (!turnId || !turnIndex) {
            canReuseStructure = false;
            break;
          }
          if (turnIndex > 0 && ((turnIndex - 1) % 25 === 0)) {
            const divider = fastChildren[childIdx] || null;
            const dividerPageNum = Math.max(1, Number(divider?.dataset?.pageNum || 0) || 0);
            if (!divider?.classList?.contains?.('cgxui-mm-page-divider') || dividerPageNum !== pageNum) {
              canReuseStructure = false;
              break;
            }
            childIdx += 1;
          }
          const wrap = fastChildren[childIdx] || null;
          const wrapTurnId = String(wrap?.dataset?.turnId || '').trim();
          const btn = wrap?.querySelector?.(`[data-cgxui="${UI_TOK.BTN}"], [data-cgxui="${UI_TOK.BTN_LEGACY}"], .cgxui-mm-btn`) || null;
          const btnTurnId = String(btn?.dataset?.turnId || '').trim();
          if (!wrap?.classList?.contains?.('cgxui-mm-wrap') || !btn || wrapTurnId !== turnId || btnTurnId !== turnId) {
            canReuseStructure = false;
            break;
          }
          childIdx += 1;
        }
        if (childIdx !== fastChildren.length) canReuseStructure = false;
      }

      if (canReuseStructure) {
        childIdx = 0;
        for (const turn of turns) {
          const turnId = String(turn?.turnId || '').trim();
          if (!turnId) continue;

          const turnIndex = Number(turn?.index || 0);
          const pageNum = Math.max(1, Math.ceil(turnIndex / 25));
          const band = getTurnPageBand(turnIndex);
          const pageCollapsed = collapsedPages.has(pageNum);
          noteNodeLifecycle('reused', 'answerRows');
          noteNodeLifecycle('reused', 'answerButtons');
          noteRenderUnit('answerRows');
          noteRenderUnit('answerButtons');

          if (turnIndex > 0 && ((turnIndex - 1) % 25 === 0)) {
            const divider = fastChildren[childIdx] || null;
            if (divider) {
              divider.setAttribute('data-page-band', String(band || 'normal'));
              divider.setAttribute('data-page-num', String(pageNum));
              setMiniMapPageDividerDomState(divider, pageCollapsed);
              noteNodeLifecycle('reused', 'miniPageDividers');
              noteRenderUnit('miniPageDividers');
            }
            childIdx += 1;
          }

          const wrap = fastChildren[childIdx] || null;
          const btn = wrap?.querySelector?.(`[data-cgxui="${UI_TOK.BTN}"], [data-cgxui="${UI_TOK.BTN_LEGACY}"], .cgxui-mm-btn`) || null;
          childIdx += 1;
          if (!wrap || !btn) {
            canReuseStructure = false;
            noteNodeLifecycle('repaired', 'answerRows');
            break;
          }

          syncTurnRowDom(btn, turn, { qaEnabled });
          syncWrapMeta(wrap, turn, band);
          syncAnswerBtnMeta(btn, turn, band);
          ensureQuestionBtnForWrap(wrap, turn, band, qaEnabled);
          setMiniMapPageWrapDomState(wrap, pageCollapsed);
          nextMap.set(turnId, btn);

          const answerId = String(turn?.answerId || '').trim();
          const symbolMeta = getMarginSymbolMetaForAnswer(answerId, marginSymbolMetaMap);
          postCommitJobs.push({
            turnId,
            answerId,
            turnIndex: turn.index,
            symbols: symbolMeta.symbols,
            color: String(symbolMeta.colors[0] || '').trim(),
          });
        }
        if (canReuseStructure) {
          bumpReason(PERF.fullRender.branches, 'fastReusePath');
          applyAllMiniMapPageCollapsedStates(resolveChatId(), col);
          const committedMap = setMapStore(nextMap);
          try { renderMiniDividerOverlay(resolveChatId()); } catch {}

          if (!opts?.skipActiveSync) {
            bumpReason(PERF.fullRender.branches, 'activeSyncApplied');
            const activeId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
            if (activeId) {
              try { setActive(activeId, 'rebuild:turn-buttons'); } catch {}
            } else {
              try { updateCounter(''); } catch {}
            }
          }
          for (const job of postCommitJobs) {
            const btn = committedMap.get(job.turnId) || null;
            if (!btn || !btn.isConnected) continue;
            updateMiniMapGutterSymbol(btn, job.symbols, { color: job.color });
            repaintMiniBtnByAnswerId(job.answerId || job.turnId, btn);
            noteRenderUnit('gutterSymbols');
            try { W.syncMiniMapDot?.(job.answerId); } catch {}
            try { W.H2O_MM_syncQuoteBadgesForIdx?.(btn, job.turnIndex); } catch {}
          }
          requestAnimationFrame(() => {
            try { W.H2O?.MM?.dots?.repaintDotsForAllMiniBtns?.(); } catch {}
            try { W.H2O_MM_repaintDots?.(); } catch {}
          });
          if (!PERF.bootCompletedAt) PERF.bootCompletedAt = Date.now();
          return committedMap;
        }
        nextMap.clear();
        postCommitJobs.length = 0;
      }

      bumpReason(PERF.fullRender.branches, 'fallbackRebuildPath');
      for (const turn of turns) {
        const turnId = String(turn?.turnId || '').trim();
        if (!turnId) continue;

        const turnIndex = Number(turn?.index || 0);
        const pageNum = Math.max(1, Math.ceil(turnIndex / 25));
        const band = getTurnPageBand(turnIndex);
        const pageCollapsed = collapsedPages.has(pageNum);

        if (turnIndex > 0 && ((turnIndex - 1) % 25 === 0)) {
          frag.appendChild(createMiniMapPageDivider(pageNum, band, pageCollapsed));
          noteNodeLifecycle('created', 'miniPageDividers');
          noteRenderUnit('miniPageDividers');
        }

        const answerId = String(turn?.answerId || '').trim();
        let btn = prevMap.get(turnId) || null;
        let wrap = null;
        if (!btn || !btn.isConnected) {
          if (btn) noteNodeLifecycle('repaired', 'answerRows');
          const made = createBtn(turn);
          btn = made.btn;
          wrap = made.wrap;
          noteNodeLifecycle('created', 'answerRows');
          noteNodeLifecycle('created', 'answerButtons');
        } else {
          wrap = getWrapForMiniBtn(btn);
          if (!wrap) {
            noteNodeLifecycle('repaired', 'answerRows');
            const made = createBtn(turn);
            btn = made.btn;
            wrap = made.wrap;
            noteNodeLifecycle('created', 'answerRows');
            noteNodeLifecycle('created', 'answerButtons');
          } else {
            noteNodeLifecycle('reused', 'answerRows');
            noteNodeLifecycle('reused', 'answerButtons');
            syncTurnRowDom(btn, turn, { qaEnabled });
          }
        }

        if (!wrap) continue;

        noteRenderUnit('answerRows');
        noteRenderUnit('answerButtons');
        syncWrapMeta(wrap, turn, band);
        syncAnswerBtnMeta(btn, turn, band);
        ensureQuestionBtnForWrap(wrap, turn, band, qaEnabled);
        setMiniMapPageWrapDomState(wrap, pageCollapsed);

        frag.appendChild(wrap);
        nextMap.set(turnId, btn);

        const symbolMeta = getMarginSymbolMetaForAnswer(answerId, marginSymbolMetaMap);
        postCommitJobs.push({
          turnId,
          answerId,
          turnIndex: turn.index,
          symbols: symbolMeta.symbols,
          color: String(symbolMeta.colors[0] || '').trim(),
        });
      }

      bumpReason(PERF.fullRender.branches, 'replaceChildrenCommit');
      col.replaceChildren(frag);
      applyAllMiniMapPageCollapsedStates(resolveChatId(), col);
      const committedMap = setMapStore(nextMap);
      try { renderMiniDividerOverlay(resolveChatId()); } catch {}

      if (!opts?.skipActiveSync) {
        bumpReason(PERF.fullRender.branches, 'activeSyncApplied');
        const activeId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
        if (activeId) {
          try { setActive(activeId, 'rebuild:turn-buttons'); } catch {}
        } else {
          try { updateCounter(''); } catch {}
        }
      }
      for (const job of postCommitJobs) {
        const btn = committedMap.get(job.turnId) || null;
        if (!btn || !btn.isConnected) continue;
        updateMiniMapGutterSymbol(btn, job.symbols, { color: job.color });
        repaintMiniBtnByAnswerId(job.answerId || job.turnId, btn);
        noteRenderUnit('gutterSymbols');
        try { W.syncMiniMapDot?.(job.answerId); } catch {}
        try { W.H2O_MM_syncQuoteBadgesForIdx?.(btn, job.turnIndex); } catch {}
      }
      requestAnimationFrame(() => {
        try { W.H2O?.MM?.dots?.repaintDotsForAllMiniBtns?.(); } catch {}
        try { W.H2O_MM_repaintDots?.(); } catch {}
      });

      if (!PERF.bootCompletedAt) PERF.bootCompletedAt = Date.now();
      return committedMap;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.ensureTurnButtons, ms);
      if (perfOwned) {
        recordDuration(PERF.fullRender, ms);
        noteSummaryBucket(PERF.fullRender, 'ensureTurnButtons');
        recordDuration(PERF.domWriteCluster, ms);
        noteSummaryBucket(PERF.domWriteCluster, 'ensureTurnButtons');
      }
      exitPerfOwner('fullRender');
    }
  }

  function getMiniMapPageDividerLabel(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 1);
    const col = ensureCol();
    if (!col) return null;
    try {
      return col.querySelector(`.cgxui-mm-page-divider-label[data-page-num="${String(num)}"]`);
    } catch {
      return null;
    }
  }

  function findTurnByAnyId(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;
    const candidates = canonicalLookupCandidates(key);
    for (const c of candidates) {
      if (!c) continue;
      const direct = lookupCanonicalTurnByTurnId(c);
      if (direct) return direct;
      const mappedTurnId = lookupCanonicalTurnIdByAnswerId(c);
      if (mappedTurnId) {
        const mappedTurn = lookupCanonicalTurnByTurnId(mappedTurnId);
        if (mappedTurn) return mappedTurn;
      }
    }
    for (const c of candidates) {
      const sharedRecord = getSharedTurnRecordByAnyId(c);
      if (sharedRecord) return projectSharedTurnRecord(sharedRecord);
    }
    return null;
  }

  function getBtnById(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;
    const map = getExistingMapStore();
    const direct = map?.get?.(key) || null;
    if (direct) return direct;

    const turnId = resolveBtnId(key);
    if (turnId) {
      const byTurnId = (getExistingMapStore() || map)?.get?.(turnId) || null;
      if (byTurnId) return byTurnId;
    }

    return recoverMiniBtnFromDom(key, turnId);
  }

  function getTurnById(turnId) {
    const key = String(turnId || '').trim();
    if (!key) return null;
    return findTurnByAnyId(key);
  }

  function refreshTurnsCache() {
    const snapshot = getBestCanonicalSnapshot();
    if (snapshot?.list?.length) {
      publishTurnSnapshot(snapshot);
      return S.turnList.slice();
    }
    indexTurns();
    return S.turnList.slice();
  }

  function getTurns() {
    if (S.turnList.length) return S.turnList.slice();
    return refreshTurnsCache();
  }

  function resolveBtnId(anyId) {
    const id = String(anyId || '').trim();
    if (!id) return '';

    const map = getExistingMapStore();
    if (map?.has?.(id)) return id;

    const directTurn = lookupCanonicalTurnByTurnId(id);
    if (directTurn?.turnId) return String(directTurn.turnId).trim();

    const mapped = lookupCanonicalTurnIdByAnswerId(id);
    if (mapped) return String(mapped).trim();

    const sharedTurnId = String(getSharedTurnRecordByAnyId(id)?.turnId || '').trim();
    if (sharedTurnId) return sharedTurnId;

    if (!hasCanonicalTurnSnapshotState()) {
      refreshTurnsCache();
      const retryMap = getExistingMapStore() || map;
      if (retryMap?.has?.(id)) return id;
      const retryTurn = lookupCanonicalTurnByTurnId(id);
      if (retryTurn?.turnId) return String(retryTurn.turnId).trim();
      const retryMapped = lookupCanonicalTurnIdByAnswerId(id);
      if (retryMapped) return String(retryMapped).trim();
    }

    return id;
  }

  function turnIdxForAnswerEl(answerEl) {
    if (!answerEl) return 0;
    const viaCore = W?.H2O?.turn?.getTurnIndexByAEl?.(answerEl) || 0;
    if (viaCore) return viaCore;

    const aId = String(getMessageId(answerEl) || '').trim();
    if (!aId) return 0;

    const turnId = lookupCanonicalTurnIdByAnswerId(aId);
    if (turnId) {
      const turn = lookupCanonicalTurnByTurnId(turnId);
      const idx = Math.max(0, Number(turn?.index || 0) || 0);
      if (idx > 0) return idx;
    }

    const sharedTurnNo = Number(getSharedTurnRecordByAnyId(aId)?.turnNo || 0);
    if (sharedTurnNo > 0) return sharedTurnNo;

    if (!hasCanonicalTurnSnapshotState()) {
      refreshTurnsCache();
      const retryTurnId = lookupCanonicalTurnIdByAnswerId(aId);
      if (retryTurnId) {
        return Math.max(0, Number(lookupCanonicalTurnByTurnId(retryTurnId)?.index || 0) || 0);
      }
    }
    return 0;
  }

  function findMiniBtn(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;

    const map = getExistingMapStore();
    const direct = map?.get?.(key);
    if (direct) return direct;

    const resolvedId = resolveBtnId(key);
    if (resolvedId) {
      const byResolved = (getExistingMapStore() || map)?.get?.(String(resolvedId).trim());
      if (byResolved) return byResolved;
    }

    return recoverMiniBtnFromDom(key, resolvedId);
  }

  function getTurnList() {
    return S.turnList.slice();
  }

  function getTurnIndex(anyId = '') {
    const key = String(anyId || '').trim();
    if (!key) return 0;
    const turn = findTurnByAnyId(key);
    return Number(turn?.index || 0);
  }

  function computeActiveFromViewport(opts = {}) {
    if (!S.turnList.length && !S.answerEls.length) indexTurns();
    const turns = S.turnList.length ? S.turnList : [];
    const turnAllowed = (turn) => {
      if (!turn) return false;
      return isTurnOnCurrentPaginationPage(turn, String(turn?.answerId || '').trim());
    };
    const turnAnchor = Number.isFinite(opts?.turnAnchorY)
      ? Number(opts.turnAnchorY)
      : Math.max(0, Math.floor(window.innerHeight * 0.22));
    const fallbackAnchor = Number.isFinite(opts?.anchorY) ? Number(opts.anchorY) : 120;
    const activePageDivider = (() => {
      const dividers = qq('.cgxui-pgnw-page-divider[data-page-num]');
      if (!dividers.length) return null;

      let best = null;
      let bestDist = Infinity;
      for (const el of dividers) {
        if (!el?.getBoundingClientRect) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        const pageNum = Math.max(1, Number(el.getAttribute?.('data-page-num') || 0) || 0);
        if (!pageNum) continue;

        const dist = (rect.top <= turnAnchor && rect.bottom >= turnAnchor)
          ? 0
          : Math.min(Math.abs(rect.top - turnAnchor), Math.abs(rect.bottom - turnAnchor));
        if (dist < bestDist) {
          bestDist = dist;
          best = { el, pageNum, dist };
          if (dist === 0) break;
        }
      }
      const threshold = Math.max(72, Math.floor(window.innerHeight * 0.18));
      return best && Number(best.dist || 0) <= threshold ? best : null;
    })();
    const activePageNum = Math.max(0, Number(activePageDivider?.pageNum || 0) || 0);

    let pickedTurn = null;

    if (turns.length) {
      const lastId = String(S.lastActiveTurnIdFast || '').trim();
      if (lastId) {
        const lastTurn = S.turnById.get(lastId) || null;
        const lastEl = lastTurn?.el || S.answerByTurnId.get(lastId) || null;
        if (lastEl?.getBoundingClientRect) {
          try {
            const r = lastEl.getBoundingClientRect();
            if (turnAllowed(lastTurn) && r.bottom >= 0 && r.top <= window.innerHeight && r.top <= turnAnchor && r.bottom >= turnAnchor) {
              const turnId = String(lastTurn?.turnId || lastId).trim();
              const answerId = String(lastTurn?.answerId || '').trim();
              const idx = Number(lastTurn?.index || getTurnIndex(turnId || answerId) || 0);
              return { activeTurnId: turnId, activeAnswerId: answerId, activeBtnIndex: idx, activePageNum };
            }
          } catch {}
        }
      }

      const visibleSet = (opts?.visibleSet instanceof Set && opts.visibleSet.size)
        ? Array.from(opts.visibleSet)
        : [];

      if (visibleSet.length) {
        let bestEl = null;
        let bestDist = Infinity;

        for (const el of visibleSet) {
          if (!el?.getBoundingClientRect) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;

          const dist = (r.top <= turnAnchor && r.bottom >= turnAnchor)
            ? 0
            : Math.min(Math.abs(r.top - turnAnchor), Math.abs(r.bottom - turnAnchor));

          if (dist < bestDist) {
            bestDist = dist;
            bestEl = el;
            if (dist === 0) break;
          }
        }

        if (bestEl) {
          const aId = String(getMessageId(bestEl) || '').trim();
          const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
          if (turnId) {
            const turn = S.turnById.get(turnId) || null;
            if (turnAllowed(turn)) pickedTurn = turn;
          }
        }
      }

      if (!pickedTurn) {
        try {
          const probe = document.elementFromPoint(Math.floor(window.innerWidth * 0.5), turnAnchor);
          const { SEL } = getRegs();
          const aEl = probe?.closest?.(
            SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]'
          );
          if (aEl) {
            const aId = String(getMessageId(aEl) || '').trim();
            const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
            if (turnId) {
              const turn = S.turnById.get(turnId) || null;
              if (turnAllowed(turn)) pickedTurn = turn;
            }
          }
        } catch {}
      }

      if (!pickedTurn) {
        const last = Math.max(1, Number(S.lastActiveIndex || 1));
        const i0 = Math.max(0, last - 25);
        const i1 = Math.min(turns.length - 1, last + 25);
        let bestTurn = null;
        let bestDist = Infinity;

        for (let i = i0; i <= i1; i += 1) {
          const t = turns[i];
          if (!turnAllowed(t)) continue;
          const turnId = String(t?.turnId || '').trim();
          let el = t?.el || (turnId ? S.answerByTurnId.get(turnId) : null);
          // Keep active-compute bounded: no per-turn DOM queries in this loop.
          if (!el) continue;
          if (!el?.getBoundingClientRect) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;

          const dist = (r.top <= turnAnchor && r.bottom >= turnAnchor)
            ? 0
            : Math.min(Math.abs(r.top - turnAnchor), Math.abs(r.bottom - turnAnchor));

          if (dist < bestDist) {
            bestDist = dist;
            bestTurn = t;
            if (dist === 0) break;
          }
        }
        pickedTurn = bestTurn || null;
      }
    }

    if (pickedTurn) {
      const turnId = String(pickedTurn.turnId || '').trim();
      const answerId = String(pickedTurn.answerId || '').trim();
      const idx = Number(pickedTurn.index || getTurnIndex(turnId || answerId) || 0);
      return { activeTurnId: turnId, activeAnswerId: answerId, activeBtnIndex: idx, activePageNum };
    }

    const answers = (S.answerEls.length ? S.answerEls : getAnswerEls()).filter((el) => !!el && el.isConnected);
    if (!answers.length) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0, activePageNum };

    const y = window.scrollY || 0;
    let bestEl = null;
    let bestDelta = Infinity;
    for (const el of answers) {
      const r = el?.getBoundingClientRect?.();
      if (!r) continue;
      const top = r.top + y;
      const d = Math.abs(top - y - fallbackAnchor);
      if (d < bestDelta) {
        bestDelta = d;
        bestEl = el;
      }
    }

    if (!bestEl) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0, activePageNum };
    const aId = String(getMessageId(bestEl) || '').trim();
    const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
    if (!isTurnOnCurrentPaginationPage(turnId || aId, aId)) {
      return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0, activePageNum };
    }
    return {
      activeTurnId: turnId,
      activeAnswerId: aId,
      activeBtnIndex: getTurnIndex(turnId || aId),
      activePageNum,
    };
  }

  function setBtnActiveState(btn, on) {
    if (!btn) return;
    const active = !!on;
    btn.classList.toggle('active', active);
    btn.classList.toggle('inview', active);
    setStateToken(btn, 'active', active);
    setStateToken(btn, 'inview', active);
    if (active) btn.setAttribute('data-cgxui-inview', '1');
    else btn.removeAttribute('data-cgxui-inview');
  }

  function isBtnActive(btn) {
    if (!btn) return false;
    try {
      if (btn.classList?.contains?.('active')) return true;
    } catch {}
    const st = String(btn.getAttribute?.('data-cgxui-state') || '').trim();
    return /\bactive\b/.test(st);
  }

  function setActive(anyId, reason = 'core') {
    const perfOwned = enterPerfOwner('incremental');
    const perfUiT0 = perfNow();
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const key = String(anyId || '').trim();
    const scanTick0 = Number(S.perfFullScanTick || 0);
    let activeVisualUpdates = 0;
    const perfDone = (ok, payload = null) => {
      if (PERF_ASSERT_ON) {
        perfReportDuration('setActive', perfT0, scanTick0, Object.assign({
          ok: !!ok,
          reason: String(reason || 'core'),
        }, payload || {}));
        console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
      }
      return !!ok;
    };
    try {
      if (!key) return perfDone(false, { status: 'id-missing' });

      const turn = findTurnByAnyId(key);
      const targetTurnId = String(turn?.turnId || key).trim();
      if (!targetTurnId) return perfDone(false, { status: 'turn-missing' });

      const nextBtn = getBtnById(targetTurnId);
      if (!nextBtn) return perfDone(false, { status: 'btn-missing', id: targetTurnId });

      const sameTarget = targetTurnId === String(S.lastActiveTurnIdFast || '').trim();
      const isScrollReason = String(reason || '').trim() === 'scroll-sync';
      const fastActive = isBtnActive(nextBtn);
      const fastPrevOk = !S.lastActiveBtnEl || !S.lastActiveBtnEl.isConnected || S.lastActiveBtnEl === nextBtn;
      if (isScrollReason && sameTarget && fastActive && fastPrevOk) {
        S.lastActiveBtnEl = nextBtn;
        S.lastActiveTurnIdFast = targetTurnId;
        S.lastActiveBtnId = targetTurnId;
        S.lastActiveIndex = Number(turn?.index || S.lastActiveIndex || 0);
        return perfDone(true, { id: targetTurnId, status: 'noop:same-active' });
      }

      let prevBtn = S.lastActiveBtnEl;
      if (prevBtn && !prevBtn.isConnected) prevBtn = null;
      if (!prevBtn) {
        const stale = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
        if (stale && stale !== nextBtn) {
          setBtnActiveState(stale, false);
          setPeerQuestionActiveFromAnswerBtn(stale, false);
          activeVisualUpdates += 1;
        }
      }
      if (prevBtn && prevBtn !== nextBtn) {
        setBtnActiveState(prevBtn, false);
        setPeerQuestionActiveFromAnswerBtn(prevBtn, false);
        activeVisualUpdates += 1;
      }
      setBtnActiveState(nextBtn, true);
      setPeerQuestionActiveFromAnswerBtn(nextBtn, true);
      activeVisualUpdates += 1;
      S.lastActiveBtnEl = nextBtn;
      S.lastActiveTurnIdFast = targetTurnId;
      S.lastActiveBtnId = targetTurnId;

      updateCounter(targetTurnId);
      updateToggleColor(targetTurnId);
      S.lastActiveIndex = Number(turn?.index || getTurnIndex(targetTurnId) || S.lastActiveIndex || 0);
      if (activeVisualUpdates > 0) noteRenderUnit('activeStateUpdates', activeVisualUpdates);
      return perfDone(true, { id: targetTurnId, status: 'updated' });
    } finally {
      const ms = perfNow() - perfUiT0;
      recordDuration(PERF.paths.setActive, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, reason || 'setActive');
      }
      exitPerfOwner('incremental');
    }
  }

  function centerOn(anyId, { force = false, smooth = true, activate = true } = {}) {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const btn = getBtnById(key);
    if (!btn) return false;

    centerMiniMapNode(btn, { smooth });

    if (activate) {
      const targetId = String(btn.dataset.turnId || key).trim();
      const already = targetId && targetId === String(S.lastActiveTurnIdFast || '').trim() && isBtnActive(btn);
      if (!already || force) setActive(targetId || key);
    }
    return true;
  }

  // Chat page divider: automatic structural divider inside the live chat surface.
  function getChatPageTurnHost(turn = null) {
    const turnId = String(turn?.turnId || '').trim();
    const answerId = String(turn?.answerId || '').trim();
    let answerEl = turn?.el || turn?.primaryAEl || turn?.answerEl || null;
    if (!(answerEl?.isConnected)) {
      const attached = turnId ? (S.answerByTurnId.get(turnId) || null) : null;
      if (attached?.isConnected) answerEl = attached;
    }
    if (!(answerEl?.isConnected) && answerId) {
      answerEl = resolveAnswerEl(answerId) || null;
    }
    if (!(answerEl?.isConnected) && turnId) {
      const resolvedTurn = findTurnByAnyId(turnId) || null;
      const resolvedAnswerId = String(resolvedTurn?.answerId || '').trim();
      if (resolvedAnswerId) answerEl = resolveAnswerEl(resolvedAnswerId) || null;
    }
    if (!answerEl?.isConnected) {
      // ChatGPT virtualizes message content out of far-away sections, but the
      // turn <section> itself stays in the document with a stable
      // data-turn-id. Anchor on the section so page membership and dividers
      // keep working for turns whose content is not currently hydrated.
      const sectionId = String(answerId || turnId.replace(/^turn:a:/, '') || '').trim();
      if (sectionId) {
        try {
          const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(sectionId) : sectionId.replace(/"/g, '\\"');
          const section = document.querySelector(`[data-testid^="conversation-turn-"][data-turn-id="${esc}"], [data-testid="conversation-turn"][data-turn-id="${esc}"]`);
          if (section?.isConnected) return section;
        } catch {}
      }
      return null;
    }
    if (turn && !turn.el) turn.el = answerEl;
    if (turnId) S.answerByTurnId.set(turnId, answerEl);
    return answerEl.closest('[data-testid="conversation-turn"], [data-testid^="conversation-turn"]') || answerEl;
  }


  const ANSWER_TITLE_SEL = '[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]';
  const ANSWER_TITLE_LABEL_SEL = '[data-cgxui="atns-answer-title-label"][data-cgxui-owner="atns"]';
  const ANSWER_TITLE_TEXT_SEL = '[data-cgxui="atns-answer-title-text"][data-cgxui-owner="atns"]';
  const ANSWER_TITLE_BADGE_SEL = '[data-cgxui="atns-answer-title-badge"][data-cgxui-owner="atns"]';
  const ANSWER_TITLE_ICON_SEL = '[data-cgxui="atns-answer-title-icon"][data-cgxui-owner="atns"]';
  const ANSWER_TITLE_COLLAPSED_ATTR = 'data-at-collapsed';
  const ANSWER_TITLE_NO_ANSWER_ATTR = 'data-at-no-answer';
  const ATTR_CHAT_PAGE_TITLE_ITEM = 'data-cgxui-chat-page-title-item';
  const ATTR_CHAT_PAGE_NO_ANSWER = 'data-cgxui-chat-page-no-answer';
  const ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN = 'data-cgxui-chat-page-no-answer-question-hidden';
  const EV_ANSWER_COLLAPSE = 'evt:h2o:answer:collapse';

  // ── ✏️ ADJUSTABLE: gap (in px) between collapsed title bars in title-list mode ──
  // Increase this number for more breathing room between rows; decrease for tighter packing.
  const TITLE_LIST_ROW_GAP_PX = 4;

  // localStorage key for persisting which pages are in title-list mode (per chat)
  const KEY_TITLE_LIST_PAGES = 'h2o:prm:cgx:mnmp:state:titlelist:pages:v1';
  const CHAT_PAGE_STATUS_CARD_ID = 'cgxui-chat-page-status-card';
  const ATTR_CHAT_PAGE_STATUS_BOUND = 'data-cgxui-chat-page-status-bound';

  function isChatPageDividerHoverInfoBoxEnabled() {
    const cfg = storageGetJSON(KEY_CHUB_CHAT_MECHANISMS_V1, null);
    const raw = String(cfg?.chatPageDividerHoverInfoBox || 'on').trim().toLowerCase();
    return raw !== 'off';
  }

  function getChatPageDividerDotEl(divider = null) {
    if (!divider?.querySelector) return null;
    return divider.querySelector('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot');
  }

  function getChatPageDividerTextEl(divider = null) {
    if (!divider?.querySelector) return null;
    return divider.querySelector('.cgxui-chat-page-divider-text, .cgxui-pgnw-page-divider-text');
  }

  function getChatPageDividerDotHitEl(dot = null) {
    if (!dot?.querySelector) return null;
    return dot.querySelector('.cgxui-chat-page-divider-dot-hit, .cgxui-pgnw-page-divider-dot-hit');
  }

  // The painted circle is far smaller than a comfortable pointer target, so the
  // dot carries one real transparent child that widens what the pointer can
  // reach. It has to be a real node: a generated ::before region did not win
  // the live hit test, and clicks a few pixels off the circle still landed on
  // the label and opened the Tags cloud. The child owns no role, tabindex or
  // accessible name - the dot stays the single control, and closest() from the
  // child walks the real ancestor chain back to it.
  function ensureChatPageDividerDotHitEl(dot = null, pgnw = false) {
    if (!dot?.querySelector) return null;
    let hit = getChatPageDividerDotHitEl(dot);
    if (!hit) {
      hit = document.createElement('span');
      hit.className = pgnw ? 'cgxui-pgnw-page-divider-dot-hit' : 'cgxui-chat-page-divider-dot-hit';
      hit.setAttribute('aria-hidden', 'true');
      dot.appendChild(hit);
    }
    return hit;
  }

  function ensureChatPageDividerMarkup(divider = null, pageNum = 1) {
    if (!divider?.querySelector) return divider;
    const label = getChatPageDividerLabelEl(divider);
    if (!label) return divider;
    let dot = getChatPageDividerDotEl(divider);
    let textEl = getChatPageDividerTextEl(divider);
    if (!dot) {
      dot = document.createElement('span');
      dot.className = divider.classList?.contains('cgxui-pgnw-page-divider')
        ? 'cgxui-pgnw-page-divider-dot'
        : 'cgxui-chat-page-divider-dot';
      dot.setAttribute('aria-hidden', 'true');
      label.insertBefore(dot, label.firstChild || null);
    }
    ensureChatPageDividerDotHitEl(dot, divider.classList?.contains('cgxui-pgnw-page-divider') === true);
    if (!textEl) {
      textEl = document.createElement('span');
      textEl.className = divider.classList?.contains('cgxui-pgnw-page-divider')
        ? 'cgxui-pgnw-page-divider-text'
        : 'cgxui-chat-page-divider-text';
      textEl.textContent = `Page ${String(pageNum || 1)}`;
      label.appendChild(textEl);
    } else {
      textEl.textContent = `Page ${String(pageNum || 1)}`;
    }
    return divider;
  }

  function ensureChatPageStatusCard() {
    if (!isChatPageDividerHoverInfoBoxEnabled()) return null;
    let card = S.chatPageStatusCardEl;
    if (card?.isConnected) return card;
    try { card = document.getElementById(CHAT_PAGE_STATUS_CARD_ID); } catch {}
    if (!(card instanceof HTMLElement)) {
      try {
        card = document.createElement('div');
        card.id = CHAT_PAGE_STATUS_CARD_ID;
        card.setAttribute('role', 'tooltip');
        card.setAttribute('aria-hidden', 'true');
        card.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
        card.style.position = 'fixed';
        card.style.left = '-9999px';
        card.style.top = '-9999px';
        card.style.zIndex = '2147483646';
        card.style.pointerEvents = 'none';
        card.style.maxWidth = '320px';
        card.style.padding = '10px 12px';
        card.style.borderRadius = '10px';
        card.style.border = '1px solid rgba(148, 163, 184, 0.32)';
        card.style.background = 'rgba(15, 23, 42, 0.96)';
        card.style.color = '#e5eefc';
        card.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.34)';
        card.style.font = '12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
        card.style.whiteSpace = 'pre';
        card.style.opacity = '0';
        card.style.visibility = 'hidden';
        card.style.transform = 'translateY(4px)';
        card.style.transition = 'opacity 120ms ease, transform 120ms ease';
        document.body.appendChild(card);
      } catch {
        card = null;
      }
    }
    S.chatPageStatusCardEl = card instanceof HTMLElement ? card : null;
    return S.chatPageStatusCardEl;
  }

  function formatChatPageStatusCardText(state = null) {
    const pageNum = Math.max(1, Number(state?.pageNum || 0) || 1);
    const titleBarRoute = String(state?.titleBarRoute || 'unknown').trim() || 'unknown';
    const dividerDotRoute = String(state?.dividerDotRoute || 'unknown').trim() || 'unknown';
    const dividerDblClickRoute = String(state?.dividerDblClickRoute || 'unknown').trim() || 'unknown';
    const mode = String(state?.mode || 'normal').trim() || 'normal';
    const pageCollapsed = !!state?.pageCollapsed ? 'on' : 'off';
    const pageCollapseDriverRaw = String(state?.pageCollapseDriver || 'legacy').trim() || 'legacy';
    const pageCollapseMode = String(state?.pageCollapseMode || '').trim() || 'off';
    const titleList = !!state?.titleListActive ? 'on' : 'off';
    const titleState = String(state?.titleState || 'expanded').trim() || 'expanded';
    const collapsedRows = Math.max(0, Number(state?.collapsedRows || 0) || 0);
    const totalRows = Math.max(0, Number(state?.totalRows || 0) || 0);
    const detachedHosts = Math.max(0, Number(state?.detachedHosts || 0) || 0);
    const hiddenQuestionHosts = Math.max(0, Number(state?.hiddenQuestionHosts || 0) || 0);
    const pageCollapseDriver = !state?.pageCollapsed && pageCollapseDriverRaw === 'legacy'
      ? 'none (legacy fallback)'
      : pageCollapseDriverRaw;
    return [
      `Page ${pageNum}`,
      ``,
      `Configured routes:`,
      `- title-bar: ${titleBarRoute}`,
      `- divider-dot: ${dividerDotRoute}`,
      `- divider-dblclick: ${dividerDblClickRoute}`,
      ``,
      `Current page state:`,
      `- mode: ${mode}`,
      `- page-collapse: ${pageCollapsed}`,
      `- page-collapse-driver: ${pageCollapseDriver}`,
      `- page-collapse-mode: ${pageCollapseMode}`,
      `- title-list: ${titleList}`,
      `- title-state: ${titleState}`,
      `- rows: ${collapsedRows}/${totalRows} collapsed`,
      `- detached-hosts: ${detachedHosts}`,
      `- hidden-question-hosts: ${hiddenQuestionHosts}`,
    ].join('\n');
  }

  function hideChatPageStatusCard(anchor = null) {
    const card = S.chatPageStatusCardEl;
    if (!(card instanceof HTMLElement)) return false;
    if (anchor && S.chatPageStatusCardAnchor && anchor !== S.chatPageStatusCardAnchor) return false;
    S.chatPageStatusCardAnchor = null;
    try { card.setAttribute('aria-hidden', 'true'); } catch {}
    try { card.style.opacity = '0'; } catch {}
    try { card.style.visibility = 'hidden'; } catch {}
    try { card.style.transform = 'translateY(4px)'; } catch {}
    return true;
  }

  function syncChatPageStatusCardSetting() {
    if (isChatPageDividerHoverInfoBoxEnabled()) return true;
    try { hideChatPageStatusCard(); } catch {}
    const card = S.chatPageStatusCardEl;
    if (card instanceof HTMLElement) {
      try { card.remove(); } catch {}
    }
    S.chatPageStatusCardEl = null;
    S.chatPageStatusCardAnchor = null;
    return false;
  }

  function showChatPageStatusCard(divider = null) {
    if (!(divider instanceof HTMLElement)) return false;
    if (!isChatPageDividerHoverInfoBoxEnabled()) {
      hideChatPageStatusCard(divider);
      return false;
    }
    const card = ensureChatPageStatusCard();
    if (!(card instanceof HTMLElement)) return false;
    const pageNum = getChatPageDividerPageNum(divider);
    const chatId = String(resolveChatId() || '').trim();
    const state = getChatPageDividerDebugState(pageNum, chatId) || passiveGetChatPageDividerDebugState(pageNum, chatId);
    card.textContent = formatChatPageStatusCardText(state);

    try { card.style.left = '-9999px'; } catch {}
    try { card.style.top = '-9999px'; } catch {}
    try { card.style.visibility = 'hidden'; } catch {}
    try { card.style.opacity = '0'; } catch {}
    try { card.style.transform = 'translateY(4px)'; } catch {}

    const rect = divider.getBoundingClientRect();
    const viewportW = Math.max(0, Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 0);
    const viewportH = Math.max(0, Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 0);
    const margin = 10;
    const width = Math.max(0, Number(card.offsetWidth || 0) || 0);
    const height = Math.max(0, Number(card.offsetHeight || 0) || 0);
    let left = rect.left + (rect.width / 2) - (width / 2);
    let top = rect.top - height - margin;
    if (top < margin) top = rect.bottom + margin;
    left = Math.max(margin, Math.min(left, Math.max(margin, viewportW - width - margin)));
    top = Math.max(margin, Math.min(top, Math.max(margin, viewportH - height - margin)));

    try { card.style.left = `${Math.round(left)}px`; } catch {}
    try { card.style.top = `${Math.round(top)}px`; } catch {}
    try { card.style.visibility = 'visible'; } catch {}
    try { card.style.opacity = '1'; } catch {}
    try { card.style.transform = 'translateY(0)'; } catch {}
    try { card.setAttribute('aria-hidden', 'false'); } catch {}
    S.chatPageStatusCardAnchor = divider;
    return true;
  }

  function bindChatPageDividerStatusCard(divider = null) {
    if (!(divider instanceof HTMLElement)) return divider;
    if (divider.getAttribute?.(ATTR_CHAT_PAGE_STATUS_BOUND) === '1') return divider;
    try { divider.setAttribute(ATTR_CHAT_PAGE_STATUS_BOUND, '1'); } catch {}

    const open = () => { try { showChatPageStatusCard(divider); } catch {} };
    const close = (ev) => {
      const next = ev?.relatedTarget;
      if (next instanceof Node && divider.contains?.(next)) return;
      try { hideChatPageStatusCard(divider); } catch {}
    };

    divider.addEventListener('pointerenter', open);
    divider.addEventListener('pointerleave', close);
    divider.addEventListener('focusin', open);
    divider.addEventListener('focusout', close);
    return divider;
  }

  function bindChatPageMechanismsSettingsListener() {
    if (S.chatPageMechanismsListener) return true;
    S.chatPageMechanismsListener = () => { try { syncChatPageStatusCardSetting(); } catch {} };
    try { W.addEventListener(EV_CHAT_MECHANISMS_CHANGED, S.chatPageMechanismsListener); } catch {}
    return true;
  }

  function unbindChatPageMechanismsSettingsListener() {
    if (!S.chatPageMechanismsListener) return true;
    try { W.removeEventListener(EV_CHAT_MECHANISMS_CHANGED, S.chatPageMechanismsListener); } catch {}
    S.chatPageMechanismsListener = null;
    return true;
  }

  function coreFallback_getChatPageTitleListPages(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    // Return in-memory cache if already loaded for this chatId
    const cached = S.titleListChatPagesByChat.get(id);
    if (cached instanceof Set) return new Set(cached);
    // First access for this chatId — lazy-load from localStorage
    try {
      const diskKey = `${KEY_TITLE_LIST_PAGES}:${id}`;
      const arr = storageGetJSON(diskKey, []);
      const loaded = new Set(
        (Array.isArray(arr) ? arr : []).map(n => Math.max(1, Number(n) || 0)).filter(n => n > 0)
      );
      S.titleListChatPagesByChat.set(id, loaded);
      return new Set(loaded);
    } catch {
      S.titleListChatPagesByChat.set(id, new Set()); // cache empty to avoid re-trying
      return new Set();
    }
  }

  function coreFallback_isChatPageTitleListActive(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return false;
    return getChatPageTitleListPages(chatId).has(num);
  }

  function coreFallback_setChatPageTitleListPages(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const next = new Set();
    const src = Array.isArray(pages) ? pages : Array.from(pages || []);
    for (const page of src) {
      const num = Math.max(1, Number(page || 0) || 0);
      if (num) next.add(num);
    }
    S.titleListChatPagesByChat.set(id, next);
    // Persist to localStorage so state survives page refresh
    try {
      const diskKey = `${KEY_TITLE_LIST_PAGES}:${id}`;
      storageSetJSON(diskKey, Array.from(next));
    } catch {}
    return new Set(next);
  }

  function getAnswerTitleBarEl(answerMsgEl = null) {
    if (!answerMsgEl?.querySelector) return null;
    try { return answerMsgEl.querySelector(`:scope > ${ANSWER_TITLE_SEL}`) || answerMsgEl.querySelector(ANSWER_TITLE_SEL); } catch {}
    return answerMsgEl.querySelector(ANSWER_TITLE_SEL);
  }

  function getAnswerTitleAnswerId(answerMsgEl = null) {
    return String(
      answerMsgEl?.getAttribute?.('data-message-id')
      || answerMsgEl?.dataset?.messageId
      || answerMsgEl?.getAttribute?.('data-h2o-ans-id')
      || answerMsgEl?.dataset?.h2oAnsId
      || answerMsgEl?.getAttribute?.('data-cgxui-id')
      || ''
    ).trim();
  }

  function isAnswerTitleCollapsed(answerMsgEl = null, bar = null) {
    const answerId = getAnswerTitleAnswerId(answerMsgEl);
    const at = AT_PUBLIC();
    try {
      if (answerId && at?.isCollapsed && at.isCollapsed(answerId)) return true;
    } catch {}
    try {
      if (answerId && UM_PUBLIC()?.isCollapsedById?.(answerId)) return true;
    } catch {}
    return String(answerMsgEl?.getAttribute?.(ANSWER_TITLE_COLLAPSED_ATTR) || '').trim() === '1'
      || String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
  }

  function getAnswerTitleBodyEls(answerMsgEl = null, bar = null) {
    if (!answerMsgEl?.children) return [];
    const titleBar = bar || getAnswerTitleBarEl(answerMsgEl);
    return Array.from(answerMsgEl.children).filter((el) => el && el !== titleBar);
  }

  // Returns ALL elements that belong to the same turn as answerMsgEl but live
  // OUTSIDE it — thinking-disclosure blocks, "Stopped thinking" banners, quick-answer
  // links etc.  These elements appear at different DOM depths depending on the
  // ChatGPT version, so we walk every ancestor from answerMsgEl up to (but not
  // including) the conversation-turn host and collect siblings at each level.
  function getAnswerTitleSiblingEls(answerMsgEl = null) {
    if (!answerMsgEl) return [];
    const turnHost = getAnswerTitleTurnHost(answerMsgEl);
    if (!turnHost) return [];

    // Build the complete ancestor path from answerMsgEl up to (not including) turnHost.
    // These elements must never appear in the result — they contain the bar and the answer.
    const ancestorPath = new Set();
    let cur = answerMsgEl;
    while (cur && cur !== turnHost) {
      ancestorPath.add(cur);
      cur = cur.parentElement;
    }

    // For each ancestor, collect its siblings that are NOT in the ancestor path and NOT
    // owned by cgxui. This finds "Stopped thinking", "Quick answer" etc. at any DOM depth
    // without ever accidentally collecting an ancestor element itself.
    const result = [];
    const seen = new Set(ancestorPath); // pre-seed so ancestors are excluded from result

    for (const anc of ancestorPath) {
      const parent = anc.parentElement;
      if (!parent) continue;
      for (const sibling of parent.children) {
        if (seen.has(sibling)) continue;
        seen.add(sibling);
        if (sibling.getAttribute?.('data-cgxui') || sibling.getAttribute?.('data-cgxui-owner')) continue;
        result.push(sibling);
      }
    }
    return result;
  }

  function getAnswerTitleTurnHost(answerMsgEl = null) {
    if (!answerMsgEl) return null;
    return answerMsgEl.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || answerMsgEl.parentElement || null;
  }

  // ── Canonical Q+A pair contract (creator side) ─────────────────────────────
  // • The Q+A pair (user prompt section + following assistant answer section)
  //   is the atomic row/page unit.
  // • The assistant answer owns the pair's single visible title bar.
  // • NO ANSWER shells are only for true orphan user turns (no following
  //   assistant answer).
  // • Page dividers anchor before the pair start (question wrapper), never
  //   between a question and its answer.
  // • These helpers read chat DOM only — they must not create MiniMap → Chat
  //   state coupling.
  // ChatGPT wraps each turn <section data-testid="conversation-turn-N"
  // data-turn="user|assistant"> in its own only-child wrapper DIV, so sibling
  // walks between turn sections dead-end. Pair by document-order adjacency
  // over the live turn-section list, guarded to the same conversation flow
  // (main). A short cache keeps mass operations cheap.
  const LIVE_CHAT_TURN_SECTION_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
  let liveChatTurnSectionCache = { at: 0, list: [] };

  function listLiveChatTurnSections() {
    const now = Date.now();
    if (now - liveChatTurnSectionCache.at <= 300 && liveChatTurnSectionCache.list.length) {
      return liveChatTurnSectionCache.list;
    }
    let list = [];
    try { list = qq(LIVE_CHAT_TURN_SECTION_SEL); } catch {}
    liveChatTurnSectionCache = { at: now, list };
    return list;
  }

  function getLiveChatTurnSectionForNode(node = null) {
    const el = (node && node.nodeType === 1) ? node : null;
    if (!el) return null;
    const direct = el.closest?.(LIVE_CHAT_TURN_SECTION_SEL) || null;
    if (direct) return direct;
    // Wrapper div that owns a single turn section (2026 ChatGPT DOM shape).
    try {
      const inner = el.querySelectorAll?.(LIVE_CHAT_TURN_SECTION_SEL) || [];
      if (inner.length === 1) return inner[0];
    } catch {}
    return null;
  }

  function getAdjacentLiveChatTurnHost(host = null, dir = 1) {
    const section = getLiveChatTurnSectionForNode(host);
    if (!section) return null;
    const list = listLiveChatTurnSections();
    const idx = list.indexOf(section);
    if (idx < 0) return null;
    const next = list[idx + (dir < 0 ? -1 : 1)] || null;
    if (!next) return null;
    const flowOf = (el) => el.closest?.('main') || el.ownerDocument?.body || null;
    const flow = flowOf(section);
    return flow && flow === flowOf(next) ? next : null;
  }

  function liveChatTurnHostHasRole(host = null, role = '') {
    if (!host) return false;
    const section = getLiveChatTurnSectionForNode(host) || host;
    const turnAttr = String(section.getAttribute?.('data-turn') || '').trim().toLowerCase();
    if (turnAttr) return turnAttr === role;
    try { return !!section.querySelector?.(`[data-message-author-role="${role}"]`); } catch { return false; }
  }

  function getPairedAssistantHostForQuestionHost(questionHost = null) {
    const section = getLiveChatTurnSectionForNode(questionHost);
    if (!section) return null;
    if (pickAssistantMessageEl(section)) return section;
    const next = getAdjacentLiveChatTurnHost(section, 1);
    return next && liveChatTurnHostHasRole(next, 'assistant') ? next : null;
  }

  function getPairedQuestionHostForAssistantHost(assistantHost = null) {
    const section = getLiveChatTurnSectionForNode(assistantHost);
    if (!section) return null;
    const prev = getAdjacentLiveChatTurnHost(section, -1);
    if (!prev) return null;
    return liveChatTurnHostHasRole(prev, 'user') && !liveChatTurnHostHasRole(prev, 'assistant') ? prev : null;
  }

  // The divider must sit between Q+A pairs, not inside a turn's only-child
  // wrapper chain. Climb from the pair-start section through wrappers whose
  // sole element child is the turn, and return the outermost such wrapper.
  function getChatPagePairAnchorNode(host = null) {
    const section = getLiveChatTurnSectionForNode(host) || ((host && host.nodeType === 1) ? host : null);
    if (!section) return null;
    let cur = section;
    while (cur.parentElement && cur.parentElement !== document.body) {
      const parent = cur.parentElement;
      // Ignore previously misplaced dividers when deciding whether this is a
      // dedicated only-child turn wrapper, so stale dividers self-heal out.
      let nonDividerChildren = 0;
      for (const child of parent.children) {
        if (isChatPageDividerEl(child)) continue;
        nonDividerChildren += 1;
      }
      if (nonDividerChildren !== 1) break;
      if (parent.matches?.('main')) break;
      cur = parent;
    }
    return cur;
  }


  function isTitleBarCollapsed(bar = null) {
    return String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
  }

  function getQuestionMessageEl(host = null) {
    if (!host || host.nodeType !== 1) return null;
    const selfRole = String(host.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
    if (selfRole === 'user') return host;
    try { return host.querySelector?.('[data-message-author-role="user"]') || null; } catch {}
    return null;
  }

  function getNoAnswerTitleBarEl(host = null) {
    if (!host?.querySelector) return null;
    try { return host.querySelector(`:scope > ${ANSWER_TITLE_SEL}[${ANSWER_TITLE_NO_ANSWER_ATTR}="1"]`) || host.querySelector(`${ANSWER_TITLE_SEL}[${ANSWER_TITLE_NO_ANSWER_ATTR}="1"]`); } catch {}
    return host.querySelector(`${ANSWER_TITLE_SEL}[${ANSWER_TITLE_NO_ANSWER_ATTR}="1"]`);
  }

  function getStackedNoAnswerTitleBarEl(host = null) {
    const syntheticId = String(getNoAnswerTitleId(host) || '').trim();
    const turnNo = getChatPageTurnDisplayNumber(host);
    try {
      if (syntheticId) {
        const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(syntheticId) : syntheticId.replace(/"/g, '\\"');
        const exact = document.querySelector(
          `${ANSWER_TITLE_SEL}[${ANSWER_TITLE_NO_ANSWER_ATTR}="1"][data-answer-id="${esc}"][data-h2o-in-title-stack]`
        ) || null;
        if (exact) return exact;
      }
      if (turnNo > 0) {
        for (const bar of document.querySelectorAll(`${ANSWER_TITLE_SEL}[${ANSWER_TITLE_NO_ANSWER_ATTR}="1"][data-h2o-in-title-stack]`)) {
          const barTurnNo = Math.max(0, Number(bar.getAttribute('data-h2o-stack-turn-no') || bar.getAttribute('data-h2o-turn-num') || 0) || 0);
          if (barTurnNo === turnNo) return bar;
        }
      }
      return null;
    } catch { return null; }
  }

  function getNoAnswerTitleId(host = null) {
    const qEl = getQuestionMessageEl(host);
    const qId = String(
      qEl?.getAttribute?.('data-message-id')
      || qEl?.dataset?.messageId
      || host?.getAttribute?.('data-turn-id')
      || host?.dataset?.turnId
      || ''
    ).trim();
    if (qId) return `no-answer:${qId}`;
    const chatId = String(resolveChatId?.() || '').trim().replace(/^c\//i, '');
    const turnNo = getChatPageTurnDisplayNumber(host);
    return `no-answer:${chatId || 'chat'}:turn:${Math.max(1, turnNo || 1)}`;
  }

  function getChatPageTurnDisplayNumber(host = null) {
    const qEl = getQuestionMessageEl(host);
    const candidates = [
      qEl?.getAttribute?.('data-message-id'),
      qEl?.dataset?.messageId,
      host?.getAttribute?.('data-turn-id'),
      host?.dataset?.turnId,
    ].map((v) => String(v || '').trim()).filter(Boolean);
    for (const id of candidates) {
      const rec = getSharedTurnRecordByAnyId(id);
      // Effective/complete-index records carry the global branch position as
      // `order`; only legacy shared records use turnNo/idx/index. Omitting
      // `order` made an authoritative record look unresolved and dropped
      // through to the positional fallback below.
      const turnNo = Math.max(0, Number(rec?.order || rec?.turnNo || rec?.idx || rec?.index || 0) || 0);
      if (turnNo > 0) return turnNo;
    }
    // Positional fallback: the index among currently MOUNTED user sections.
    // Under complete-index authority that is never the global branch order —
    // with only a window of a long branch mounted it renumbered a global
    // order 19 NO ANSWER row to 3. Refuse rather than publish a wrong
    // ordinal; the row shows a bare TITLE until authority can answer, and
    // 1C1a's own refresh reconciles it from the same effective index.
    try {
      if (getCompleteIndexProjectionStatus().enabled === true) return 0;
    } catch {}
    // A conversation-turn section is a MESSAGE shell, not a Q+A index. Using
    // all shells made every assistant before an orphan shift its fallback
    // number/page and let a delayed NO ANSWER sweep miss the active stack.
    const questions = listLiveChatTurnSections().filter((turn) => getChatPageTurnRole(turn) === 'user');
    const section = getLiveChatTurnSectionForNode(host) || host;
    const idx = questions.indexOf(section);
    return idx >= 0 ? (idx + 1) : 0;
  }

  function removeNoAnswerTitleBar(host = null) {
    const bar = getNoAnswerTitleBarEl(host);
    if (bar) {
      try { bar.remove(); } catch {}
    }
    if (host) {
      host.removeAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER);
      host.removeAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN);
    }
    return true;
  }

  function ensureNoAnswerTitleBar(host = null) {
    if (!host || host.nodeType !== 1) return null;
    if (pickAssistantMessageEl(host)) {
      removeNoAnswerTitleBar(host);
      return null;
    }
    // Creator-level guard: a user turn with a paired following assistant
    // answer is part of a complete Q+A pair — the assistant owns the pair's
    // title bar, so never create a NO ANSWER shell here.
    if (getPairedAssistantHostForQuestionHost(host)) {
      removeNoAnswerTitleBar(host);
      return null;
    }
    const qEl = getQuestionMessageEl(host);
    if (!qEl) return null;

    const flowBar = getNoAnswerTitleBarEl(host);
    const stackedBar = getStackedNoAnswerTitleBarEl(host);
    if (stackedBar && flowBar && flowBar !== stackedBar) {
      try { flowBar.remove(); } catch {}
    }
    let bar = stackedBar || flowBar;
    const stackOwned = !!stackedBar;
    const turnNo = getChatPageTurnDisplayNumber(host);
    const pageNum = turnNo > 0 ? Math.ceil(turnNo / 25) : 0;
    const titleListActive = pageNum > 0 && isChatPageTitleListActive(pageNum, resolveChatId());
    // While title-list mode is active, 1C1b is the sole row/flow owner. A
    // delayed divider/NO ANSWER sweep must not manufacture a new flow title
    // bar or rewrite the already-stacked row just because the canonical
    // question id changed during hydration.
    if (titleListActive) {
      if (stackedBar) return stackedBar;
      // A pre-stack flow shell belongs to the superseded compact-list owner.
      // Remove it rather than letting the delayed MiniMap sweep expose it;
      // 1C1b will adopt/build the one canonical stacked row on its repair.
      if (flowBar) { try { flowBar.remove(); } catch {} }
      return null;
    }
    const isNew = !bar;   // track whether we just created the bar
    if (isNew) {
      bar = document.createElement('div');
      bar.setAttribute('data-cgxui-owner', 'atns');
      bar.setAttribute('data-cgxui', 'atns-answer-title');
      bar.setAttribute(ANSWER_TITLE_NO_ANSWER_ATTR, '1');
      bar.setAttribute('data-cgxui-state', 'editable');

      const badge = document.createElement('span');
      badge.setAttribute('data-cgxui-owner', 'atns');
      badge.setAttribute('data-cgxui', 'atns-answer-title-badge');
      badge.setAttribute('data-cgxui-part', 'badge');

      const label = document.createElement('span');
      label.setAttribute('data-cgxui-owner', 'atns');
      label.setAttribute('data-cgxui', 'atns-answer-title-label');
      label.setAttribute('data-cgxui-part', 'label');

      const text = document.createElement('span');
      text.setAttribute('data-cgxui-owner', 'atns');
      text.setAttribute('data-cgxui', 'atns-answer-title-text');
      text.setAttribute('data-cgxui-part', 'text');

      const icon = document.createElement('span');
      icon.setAttribute('data-cgxui-owner', 'atns');
      icon.setAttribute('data-cgxui', 'atns-answer-title-icon');
      icon.setAttribute('data-cgxui-part', 'icon');
      icon.setAttribute('aria-hidden', 'true');

      bar.appendChild(badge);
      bar.appendChild(label);
      bar.appendChild(text);
      bar.appendChild(icon);
    }

    const answerId = getNoAnswerTitleId(host);
    if (turnNo > 0) {
      try { bar.setAttribute('data-h2o-turn-num', String(turnNo)); } catch {}
    }
    const labelEl = bar.querySelector?.(ANSWER_TITLE_LABEL_SEL) || null;
    const textEl  = bar.querySelector?.(ANSWER_TITLE_TEXT_SEL)  || null;
    const iconEl  = bar.querySelector?.(ANSWER_TITLE_ICON_SEL)  || null;
    // Always update label text (turn number can change after re-index)
    if (labelEl) labelEl.textContent = turnNo > 0 ? `TITLE ${turnNo}` : 'TITLE';
    if (textEl)  textEl.textContent  = 'NO ANSWER';
    // ONLY initialise icon and state on a freshly created bar.
    // If the bar already exists, it may be in collapsed state — do NOT reset it.
    if (isNew) {
      if (iconEl)  iconEl.textContent  = '⌄';
      try { bar.setAttribute('data-cgxui-state', 'editable'); } catch {}
    }
    try { bar.setAttribute('data-answer-id', answerId); } catch {}
    try { bar.setAttribute(ANSWER_TITLE_NO_ANSWER_ATTR, '1'); } catch {}
    try { host.setAttribute(ATTR_CHAT_PAGE_NO_ANSWER, '1'); } catch {}

    // Stamp data-message-id with the synthetic answerId so resolveAnswerEl()
    // finds this bar when the MiniMap btn for this no-answer turn is clicked.
    // Without this the flash fell back to the raw turn host, creating a weird strip.
    if (answerId) {
      try { bar.setAttribute('data-message-id', answerId); } catch {}
    }

    // Wire dblclick directly on the bar — same pattern Answer Title uses for regular bars.
    // Use bar.closest() at click time (not the closure `host`) so the reference is always live.
    if (!bar._noAnswerDblClickWired) {
      bar._noAnswerDblClickWired = true;
      bar.addEventListener('dblclick', (e) => {
        try { e.stopPropagation(); e.preventDefault(); } catch {}
        const liveHost = bar.closest('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]');
        if (!liveHost) return;
        const nextCollapsed = !isTitleBarCollapsed(bar);
        applyNoAnswerTitleCollapsedDom(liveHost, nextCollapsed, { animate: true });
        try { renderChatPageDividers(resolveChatId()); } catch {}
      });
    }

    // Insert the bar INSIDE qEl's immediate parent (the content wrapper / innerWrapper).
    // This gives the bar the same horizontal padding and positioning as the user message,
    // so it aligns correctly with the other title bars in the chat.
    // getNoAnswerManagedEls is aware of this and returns bar's SIBLINGS within that same
    // parent (not host.children), so the bar is correctly excluded from collapsing.
    if (!stackOwned) {
      const insertParent = (qEl.parentElement && qEl.parentElement !== host)
        ? qEl.parentElement
        : host;
      // Place bar immediately after qEl inside insertParent.
      if (bar.parentElement !== insertParent || bar.previousElementSibling !== qEl) {
        try { insertParent.insertBefore(bar, qEl.nextElementSibling || null); } catch {}
      }
    }
    return bar;
  }

  function getNoAnswerManagedEls(host = null, bar = null) {
    if (!host?.children) return [];
    const titleBar = bar || getNoAnswerTitleBarEl(host);
    if (!titleBar) return Array.from(host.children);

    // Build the complete ancestor path from titleBar up to (not including) host.
    // These are elements that contain or ARE the bar — they must never be collapsed.
    const ancestorPath = new Set();
    let cur = titleBar;
    while (cur && cur !== host) {
      ancestorPath.add(cur);
      cur = cur.parentElement;
    }

    // For each ancestor, collect its siblings (elements sharing the same parent that are
    // NOT in the ancestor path). This captures the question element, "Stopped thinking",
    // "Quick answer" etc. at every level without accidentally hiding the bar.
    const result = [];
    const seen = new Set(ancestorPath); // pre-seed so ancestors are excluded

    for (const anc of ancestorPath) {
      const parent = anc.parentElement;
      if (!parent) continue;
      for (const sibling of parent.children) {
        if (seen.has(sibling)) continue;
        seen.add(sibling);
        result.push(sibling);
      }
    }
    return result;
  }

  function applyNoAnswerTitleCollapsedDom(host = null, collapsed = false, opts = {}) {
    const bar = ensureNoAnswerTitleBar(host);
    if (!host || !bar) return { ok: false, status: 'missing-no-answer-title' };
    const animate = opts.animate !== false;
    const iconEl = bar.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
    if (bar.hasAttribute('data-h2o-in-title-stack')) {
      bar.setAttribute('data-cgxui-state', collapsed ? 'collapsed editable' : 'editable');
      if (collapsed) host.setAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN, '1');
      else host.removeAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN);
      if (iconEl) iconEl.textContent = collapsed ? '›' : '⌄';
      return { ok: true, status: 'stack-owned-visual-only', host, bar, collapsed: !!collapsed };
    }
    const managedEls = getNoAnswerManagedEls(host, bar);
    if (collapsed) {
      bar.setAttribute('data-cgxui-state', 'collapsed editable');
      host.setAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN, '1');
      if (iconEl) iconEl.textContent = '›';
      managedEls.forEach((el) => {
        if (animate) el.style.transition = 'opacity 220ms ease, max-height 220ms ease, height 220ms ease';
        el.style.overflow = 'hidden';
        el.style.maxHeight = '0px';
        el.style.height = '0px';
        el.style.minHeight = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.borderTopWidth = '0px';
        el.style.borderBottomWidth = '0px';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        try { el.setAttribute('data-cgxui-at-hidden', '1'); } catch {}
      });
    } else {
      bar.setAttribute('data-cgxui-state', 'editable');
      host.removeAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN);
      if (iconEl) iconEl.textContent = '⌄';
      managedEls.forEach((el) => {
        if (animate) el.style.transition = 'opacity 220ms ease, max-height 220ms ease, height 220ms ease';
        el.style.overflow = '';
        el.style.maxHeight = '';
        el.style.height = '';
        el.style.minHeight = '';
        el.style.marginTop = '';
        el.style.marginBottom = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.borderTopWidth = '';
        el.style.borderBottomWidth = '';
        el.style.opacity = '';
        el.style.pointerEvents = '';
        try { el.removeAttribute('data-cgxui-at-hidden'); } catch {}
        if (animate) {
          setTimeout(() => {
            try { el.style.transition = ''; } catch {}
          }, 270);
        }
      });
    }
    return { ok: true, status: 'ok', host, bar, collapsed: !!collapsed };
  }

  function isChatPageRowCollapsed(row = null) {
    if (!row) return false;
    if (row.noAnswer) {
      return isTitleBarCollapsed(row.titleBar) || String(row.questionHost?.getAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN) || '').trim() === '1';
    }
    return isAnswerTitleCollapsed(row.answerMsgEl, row.titleBar);
  }

  // Zero every spacing/sizing property on an element, covering all the ways
  // ChatGPT's Tailwind/CSS classes can create visible height.
  function _zeroElSpacing(el) {
    if (!el?.style) return;
    try { el.style.setProperty('min-height',         '0px',     'important'); } catch {}
    try { el.style.setProperty('height',             '0px',     'important'); } catch {}
    try { el.style.setProperty('max-height',         '0px',     'important'); } catch {}
    try { el.style.setProperty('padding-top',        '0px',     'important'); } catch {}
    try { el.style.setProperty('padding-bottom',     '0px',     'important'); } catch {}
    try { el.style.setProperty('padding-left',       '0px',     'important'); } catch {}
    try { el.style.setProperty('padding-right',      '0px',     'important'); } catch {}
    try { el.style.setProperty('margin-top',         '0px',     'important'); } catch {}
    try { el.style.setProperty('margin-bottom',      '0px',     'important'); } catch {}
    try { el.style.setProperty('gap',                '0px',     'important'); } catch {}
    try { el.style.setProperty('border-top-width',   '0px',     'important'); } catch {}
    try { el.style.setProperty('border-bottom-width','0px',     'important'); } catch {}
    try { el.style.setProperty('overflow',           'hidden',  'important'); } catch {}
    try { el.style.setProperty('opacity',            '0',       'important'); } catch {}
    try { el.style.setProperty('pointer-events',     'none',    'important'); } catch {}
  }

  // Remove all spacing/sizing overrides set by _zeroElSpacing.
  function _restoreElSpacing(el) {
    if (!el?.style) return;
    const props = [
      'min-height','height','max-height',
      'padding-top','padding-bottom','padding-left','padding-right',
      'margin-top','margin-bottom','gap',
      'border-top-width','border-bottom-width',
      'overflow','opacity','pointer-events',
    ];
    for (const p of props) { try { el.style.removeProperty(p); } catch {} }
  }

  // Properties that ChatGPT's Tailwind classes set and that create visible vertical space.
  const _COMPACT_ZERO_PROPS = [
    'min-height', 'padding-top', 'padding-bottom',
    'margin-top', 'margin-bottom', 'gap',
    'border-top-width', 'border-bottom-width',
  ];

  // Zero all spacing props on a single element with !important.
  function _compactZeroEl(el) {
    if (!el?.style) return;
    for (const p of _COMPACT_ZERO_PROPS) {
      try { el.style.setProperty(p, '0px', 'important'); } catch {}
    }
    try { el.setAttribute('data-cgxui-chat-page-title-wrapper', '1'); } catch {}
  }

  // Remove all spacing overrides added by _compactZeroEl.
  function _compactRestoreEl(el) {
    if (!el?.style) return;
    for (const p of _COMPACT_ZERO_PROPS) {
      try { el.style.removeProperty(p); } catch {}
    }
    try { el.removeAttribute('data-cgxui-chat-page-title-wrapper'); } catch {}
  }

  // Collect every DOM ancestor between msgEl (exclusive) and host (exclusive).
  // This handles any number of intermediate wrappers ChatGPT may insert.
  function _getAncestorsBetween(innerEl, outerEl) {
    const ancestors = [];
    if (!innerEl || !outerEl) return ancestors;
    let cur = innerEl.parentElement;
    while (cur && cur !== outerEl) {
      ancestors.push(cur);
      cur = cur.parentElement;
    }
    return ancestors;
  }

  function applyChatPageTitleListCompactDom(row = null, active = false) {
    const isNoAnswer = !!row?.noAnswer;
    const host  = row?.answerHost || row?.questionHost || null;
    const bar   = row?.titleBar || null;
    const msgEl = row?.answerMsgEl || null;
    const compact = !!active && isChatPageRowCollapsed(row);
    if (!host) return false;

    // All ancestors between msgEl and host (exclusive on both ends).
    // For no-answer rows msgEl is null; we still want to zero innerWrapper etc.
    const ancestors = msgEl ? _getAncestorsBetween(msgEl, host) : [];

    // For no-answer rows the gap source is the innerWrapper of the question host.
    // We find it as the first child of host (same logic, no msgEl to walk from).
    const noAnswerInner = isNoAnswer ? (host.firstElementChild || null) : null;

    if (compact) {
      host.setAttribute?.(ATTR_CHAT_PAGE_TITLE_ITEM, '1');

      // 1) Host: zero its own spacing (host itself rarely has ChatGPT padding, but be safe)
      try { host.style.setProperty('min-height',    '0px', 'important'); } catch {}
      try { host.style.setProperty('padding-top',   '0px', 'important'); } catch {}
      try { host.style.setProperty('padding-bottom','0px', 'important'); } catch {}
      try { host.style.setProperty('margin-top',    '0px', 'important'); } catch {}
      try { host.style.setProperty('margin-bottom', `${TITLE_LIST_ROW_GAP_PX}px`, 'important'); } catch {}
      try { host.style.setProperty('gap',           '0px', 'important'); } catch {}

      // 2) Walk EVERY ancestor between msgEl and host and zero them all.
      //    This catches innerWrapper (py-5), any agent-turn div, any flex wrappers, etc.
      //    regardless of how many levels ChatGPT inserts between them.
      for (const anc of ancestors) {
        if (anc === bar) continue; // never touch the bar itself
        _compactZeroEl(anc);
      }

      // 3) For no-answer rows: also zero the first-child wrapper directly
      if (isNoAnswer && noAnswerInner && noAnswerInner !== bar) {
        _compactZeroEl(noAnswerInner);
      }

      // 4) msgEl itself (the [data-message-author-role="assistant"] element)
      if (msgEl) {
        try { msgEl.style.setProperty('min-height',    '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('padding-top',   '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('padding-bottom','0px', 'important'); } catch {}
        try { msgEl.style.setProperty('margin-top',    '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('margin-bottom', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('gap',           '0px', 'important'); } catch {}
      }

      // 5) Bar: always visible, tight bottom margin only
      if (bar) {
        try { bar.style.setProperty('margin-top',    '0px', 'important'); } catch {}
        try { bar.style.setProperty('margin-bottom', `${TITLE_LIST_ROW_GAP_PX}px`, 'important'); } catch {}
        try { bar.style.removeProperty('display'); } catch {}
        try { bar.style.removeProperty('visibility'); } catch {}
        try { bar.style.removeProperty('opacity'); } catch {}
      }

      // 6) No-answer host must stay as block (not display:none)
      if (isNoAnswer) {
        try { host.style.setProperty('display', 'block', 'important'); } catch {}
      }

    } else {
      // ── EXPAND: remove all inline overrides ──────────────────────────
      host.removeAttribute?.(ATTR_CHAT_PAGE_TITLE_ITEM);
      const hostRestoreProps = ['min-height','padding-top','padding-bottom','margin-top','margin-bottom','gap'];
      for (const p of hostRestoreProps) { try { host.style.removeProperty(p); } catch {} }
      if (isNoAnswer) { try { host.style.removeProperty('display'); } catch {} }

      for (const anc of ancestors) {
        if (anc === bar) continue;
        _compactRestoreEl(anc);
      }

      if (isNoAnswer && noAnswerInner && noAnswerInner !== bar) {
        _compactRestoreEl(noAnswerInner);
      }

      if (msgEl) {
        const mProps = ['min-height','padding-top','padding-bottom','margin-top','margin-bottom','gap'];
        for (const p of mProps) { try { msgEl.style.removeProperty(p); } catch {} }
      }

      if (bar) {
        try { bar.style.removeProperty('margin-top'); } catch {}
        try { bar.style.removeProperty('margin-bottom'); } catch {}
      }
    }
    return true;
  }

  function getAnswerTitleToolbarEls(answerMsgEl = null) {
    const turnHost = getAnswerTitleTurnHost(answerMsgEl);
    if (!turnHost?.querySelectorAll) return [];
    const selectors = [
      '[aria-label="Response actions"]',
      '[data-testid="response-actions"]',
    ];
    const out = [];
    const seen = new Set();
    for (const sel of selectors) {
      let nodes = [];
      try { nodes = Array.from(turnHost.querySelectorAll(sel)); } catch {}
      for (const el of nodes) {
        if (!el || seen.has(el)) continue;
        seen.add(el);
        out.push(el);
      }
    }
    return out;
  }

  function applyAnswerTitleCollapsedDom(answerMsgEl = null, collapsed = false, opts = {}) {
    const msgEl = answerMsgEl || null;
    const bar = getAnswerTitleBarEl(msgEl);
    if (!msgEl || !bar) return { ok: false, status: 'missing-title-bar' };
    const answerId = String(opts.answerId || getAnswerTitleAnswerId(msgEl)).trim();
    const animate = opts.animate !== false;
    const at = AT_PUBLIC();
    if (answerId && at?.setCollapsed) {
      try {
        return at.setCollapsed(answerId, !!collapsed, {
          animate,
          source: String(opts?.source || 'minimap-core:compat').trim() || 'minimap-core:compat',
        });
      } catch {}
    }
    const iconEl = bar.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
    const bodyEls = getAnswerTitleBodyEls(msgEl, bar);
    const siblingEls = getAnswerTitleSiblingEls(msgEl);
    const toolbarEls = getAnswerTitleToolbarEls(msgEl).filter((el) => !bodyEls.includes(el) && !siblingEls.includes(el));
    const managedEls = bodyEls.concat(siblingEls).concat(toolbarEls);
    if (collapsed) {
      bar.setAttribute('data-cgxui-state', 'collapsed editable');
      msgEl.setAttribute(ANSWER_TITLE_COLLAPSED_ATTR, '1');
      if (iconEl) iconEl.textContent = '›';
      managedEls.forEach((el) => {
        if (animate) {
          el.style.transition = 'opacity 220ms ease, max-height 220ms ease, height 220ms ease';
        }
        el.style.overflow = 'hidden';
        el.style.maxHeight = '0px';
        el.style.height = '0px';
        el.style.minHeight = '0px';
        el.style.marginTop = '0px';
        el.style.marginBottom = '0px';
        el.style.paddingTop = '0px';
        el.style.paddingBottom = '0px';
        el.style.borderTopWidth = '0px';
        el.style.borderBottomWidth = '0px';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      });
      // Also stamp a CSS attribute on sibling/toolbar elements so the Skin CSS rule
      // can hide them with !important — this survives React re-renders that reset inline styles.
      siblingEls.concat(toolbarEls).forEach(el => {
        try { el.setAttribute('data-cgxui-at-hidden', '1'); } catch {}
      });
    } else {
      bar.setAttribute('data-cgxui-state', 'editable');
      msgEl.removeAttribute(ANSWER_TITLE_COLLAPSED_ATTR);
      if (iconEl) iconEl.textContent = '⌄';
      managedEls.forEach((el) => {
        if (animate) {
          el.style.transition = 'opacity 220ms ease, max-height 220ms ease, height 220ms ease';
        }
        el.style.overflow = '';
        el.style.maxHeight = '';
        el.style.height = '';
        el.style.minHeight = '';
        el.style.marginTop = '';
        el.style.marginBottom = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
        el.style.borderTopWidth = '';
        el.style.borderBottomWidth = '';
        el.style.opacity = '';
        el.style.pointerEvents = '';
        if (animate) {
          setTimeout(() => {
            try { el.style.transition = ''; } catch {}
          }, 270);
        }
      });
      // Remove the React-resistant CSS attribute from sibling/toolbar elements
      siblingEls.concat(toolbarEls).forEach(el => {
        try { el.removeAttribute('data-cgxui-at-hidden'); } catch {}
      });
    }
    if (answerId) {
      try { window.dispatchEvent(new CustomEvent(EV_ANSWER_COLLAPSE, { detail: { answerId, collapsed: !!collapsed } })); } catch {}
    }
    return { ok: true, status: 'ok', answerId, collapsed: !!collapsed, bar, msgEl };
  }

  function setQuestionHostTitleListHidden(host = null, hidden = false) {
    if (!host) return null;
    if (hidden) {
      host.setAttribute(ATTR_CHAT_PAGE_QUESTION_HIDDEN, '1');
      try { host.style.setProperty('display', 'none', 'important'); } catch {}
    } else {
      host.removeAttribute(ATTR_CHAT_PAGE_QUESTION_HIDDEN);
      try { host.style.removeProperty('display'); } catch {}
    }
    return host;
  }

  function buildChatPageAnswerRows(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return [];
    const payload = buildChatPageSections();
    const section = payload?.sections?.get?.(num) || null;
    const hosts = Array.isArray(section?.hosts) ? section.hosts : [];
    const rows = [];
    let pendingQuestionHost = null;
    for (let i = 0; i < hosts.length; i += 1) {
      const host = hosts[i];
      const role = getChatPageTurnRole(host);
      if (role === 'user') {
        // Wrapper-aware pairing: section-hosts order is no longer trusted to
        // put the paired answer at hosts[i + 1]; ask the live DOM instead.
        if (getPairedAssistantHostForQuestionHost(host)) {
          removeNoAnswerTitleBar(host);
          pendingQuestionHost = host;
        } else {
          const bar = ensureNoAnswerTitleBar(host);
          const answerId = String(bar?.getAttribute?.('data-answer-id') || getNoAnswerTitleId(host)).trim();
          if (bar && answerId) {
            rows.push({
              pageNum: num,
              questionHost: host,
              answerHost: host,
              answerMsgEl: null,
              answerId,
              titleBar: bar,
              collapsed: isTitleBarCollapsed(bar),
              noAnswer: true,
            });
          }
          pendingQuestionHost = null;
        }
        continue;
      }
      if (role !== 'assistant') continue;
      const pairedQuestionHost = pendingQuestionHost || getPairedQuestionHostForAssistantHost(host) || null;
      if (pairedQuestionHost) removeNoAnswerTitleBar(pairedQuestionHost);
      const answerMsgEl = pickAssistantMessageEl(host) || host.querySelector?.('[data-message-author-role="assistant"]') || null;
      const answerId = getAnswerTitleAnswerId(answerMsgEl);
      const bar = getAnswerTitleBarEl(answerMsgEl);
      if (!answerMsgEl || !answerId || !bar) {
        pendingQuestionHost = null;
        continue;
      }
      rows.push({
        pageNum: num,
        questionHost: pairedQuestionHost,
        answerHost: host,
        answerMsgEl,
        answerId,
        titleBar: bar,
        collapsed: isAnswerTitleCollapsed(answerMsgEl, bar),
        noAnswer: false,
      });
      pendingQuestionHost = null;
    }
    return rows;
  }

  function syncNoAnswerTitleBars(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    void id;

    // Pass 1: section-based sweep (handles paginated chats)
    const payload = buildChatPageSections();
    const sections = payload?.sections;
    let ensured = 0;
    if (sections instanceof Map && sections.size) {
      for (const [pageNum] of sections) {
        const rows = buildChatPageAnswerRows(pageNum);
        for (const row of rows) {
          if (row?.noAnswer) ensured += 1;
        }
      }
    }

    // Pass 2: direct DOM sweep — catches orphaned user turns that the section
    // builder missed (e.g. a trailing question with no answer yet, or a chat
    // where S.turnList hasn't been populated yet).
    try {
      const allTurnEls = listLiveChatTurnSections();
      for (let i = 0; i < allTurnEls.length; i += 1) {
        const host = allTurnEls[i];
        const role = getChatPageTurnRole(host);
        if (role !== 'user') continue;
        if (pickAssistantMessageEl(host)) continue; // has assistant reply inside → skip
        // Canonical pairing: a user turn with a paired following assistant is
        // part of a normal Q+A pair — never a NO ANSWER shell. Remove any
        // stale shell left behind by earlier passes.
        if (getPairedAssistantHostForQuestionHost(host)) {
          removeNoAnswerTitleBar(host);
          continue;
        }
        // Ensure the NO ANSWER bar is present in this orphaned turn
        const bar = ensureNoAnswerTitleBar(host);
        if (bar) ensured += 1;
      }
    } catch (_e) {}

    return ensured;
  }

  function findChatPageRowByAnswerId(answerId = '') {
    const target = String(answerId || '').trim();
    if (!target) return null;
    const payload = buildChatPageSections();
    const sections = payload?.sections;
    if (!(sections instanceof Map)) return null;
    for (const [pageNum] of sections) {
      const rows = buildChatPageAnswerRows(pageNum);
      const hit = rows.find((row) => String(row?.answerId || '').trim() === target) || null;
      if (hit) return hit;
    }
    return null;
  }

  function coreFallback_getChatPageTitleState(pageNum = 0, chatId = '') {
    const rows = buildChatPageAnswerRows(pageNum);
    if (!rows.length) return 'expanded';
    const collapsedCount = rows.filter((row) => isChatPageRowCollapsed(row)).length;
    if (collapsedCount <= 0) return 'expanded';
    if (collapsedCount >= rows.length && coreFallback_isChatPageTitleListActive(pageNum, chatId)) return 'collapsed';
    return 'mixed';
  }

  function coreFallback_applyChatPageTitleListPageVisuals(pageNum = 0, chatId = '') {
    const active = coreFallback_isChatPageTitleListActive(pageNum, chatId);
    const rows = buildChatPageAnswerRows(pageNum);
    // Set the gap CSS variable whenever we apply visuals for an active title-list page
    if (active) {
      try { document.documentElement.style.setProperty('--cgxui-title-list-row-gap', `${TITLE_LIST_ROW_GAP_PX}px`); } catch {}
    }
    for (const row of rows) {
      if (row.noAnswer) {
        // Force-collapse when title-list is active regardless of current DOM state.
        // On restore from refresh the DOM is clean (no collapsed state yet) so we must
        // always drive it to match the saved title-list state.
        applyNoAnswerTitleCollapsedDom(row.answerHost, active, { animate: false });
      } else {
        if (active && !isChatPageRowCollapsed(row)) {
          // Row is not yet collapsed (e.g. page just loaded and AT hasn't run yet) —
          // force-collapse now so the title-list layout is immediately correct.
          applyAnswerTitleCollapsedDom(row.answerMsgEl, true, { answerId: row.answerId, animate: false });
        }
        setQuestionHostTitleListHidden(row.questionHost, active);
      }
      applyChatPageTitleListCompactDom(row, active);
    }
    return rows;
  }

  function coreFallback_setChatPageTitleListMode(pageNum = 0, enabled = true, chatId = '', source = 'core') {
    // Sync the gap CSS variable with the JS constant so the Skin CSS uses the same value.
    try { document.documentElement.style.setProperty('--cgxui-title-list-row-gap', `${TITLE_LIST_ROW_GAP_PX}px`); } catch {}
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!id || !num) {
      return { ok: false, status: !id ? 'chat-id-missing' : 'page-missing', chatId: id, pageNum: num, enabled: !!enabled };
    }
    const next = coreFallback_getChatPageTitleListPages(id);
    const rows = buildChatPageAnswerRows(num);
    if (enabled) next.add(num); else next.delete(num);
    coreFallback_setChatPageTitleListPages(id, Array.from(next));
    for (const row of rows) {
      // Collapse/expand body and question visibility FIRST
      if (row.noAnswer) {
        applyNoAnswerTitleCollapsedDom(row.answerHost, !!enabled, { animate: true });
      } else {
        applyAnswerTitleCollapsedDom(row.answerMsgEl, !!enabled, { answerId: row.answerId, animate: true });
        setQuestionHostTitleListHidden(row.questionHost, !!enabled);
      }
      // THEN apply compact spacing — now isChatPageRowCollapsed() reflects the new state
      applyChatPageTitleListCompactDom(row, !!enabled);
    }

    // Safety sweep on EXPAND: do a direct DOM scan to restore ALL hidden question hosts.
    // This handles stale row.questionHost references (React re-renders) and clears
    // inline styles set by EITHER Core (display:none) OR Answer Title (height:0/opacity:0).
    if (!enabled) {
      const restoreProps = ['display', 'overflow', 'max-height', 'height', 'min-height',
                           'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom',
                           'border-top-width', 'border-bottom-width', 'opacity',
                           'pointer-events', 'transition'];
      try {
        for (const qHost of qq('[data-cgxui-chat-page-question-hidden="1"]')) {
          qHost.removeAttribute('data-cgxui-chat-page-question-hidden');
          for (const p of restoreProps) { try { qHost.style.removeProperty(p); } catch {} }
        }
      } catch {}
      try {
        for (const qHost of qq('[data-at-question-hidden="1"]')) {
          qHost.removeAttribute('data-at-question-hidden');
          for (const p of restoreProps) { try { qHost.style.removeProperty(p); } catch {} }
        }
      } catch {}
    }
    try { renderChatPageDividers(id); } catch {}
    return {
      ok: true,
      status: 'ok',
      source: String(source || 'core'),
      chatId: id,
      pageNum: num,
      enabled: !!enabled,
      rows: rows.length,
    };
  }

  function coreFallback_toggleChatPageTitleListMode(pageNum = 0, chatId = '', source = 'core') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const next = !coreFallback_isChatPageTitleListActive(num, id);
    return coreFallback_setChatPageTitleListMode(num, next, id, source);
  }

function passiveReadChatPageSet() {
  return new Set();
}

function passiveIsChatPageCollapsed() {
  return false;
}

function passiveGetChatPageTitleState() {
  return 'expanded';
}

function passiveGetChatPageDividerDebugState(pageNum = 0, chatId = '') {
  const id = String(chatId || resolveChatId() || '').trim();
  const num = Math.max(1, Number(pageNum || 0) || 0);
  return {
    ok: false,
    status: 'chat-pages-controller-unavailable',
    pageNum: num,
    chatId: id,
    titleBarRoute: 'unknown',
    dividerDotRoute: 'unknown',
    dividerDblClickRoute: 'unknown',
    hoverInfoBoxEnabled: isChatPageDividerHoverInfoBoxEnabled(),
    mode: 'normal',
    pageCollapsed: false,
    pageCollapseDriver: 'legacy',
    pageCollapseMode: '',
    titleListActive: false,
    titleState: 'expanded',
    collapsedRows: 0,
    totalRows: 0,
    detachedHosts: 0,
    hiddenQuestionHosts: 0,
  };
}

function passiveChatPagesWriteResult(pageNum = 0, extra = {}) {
  const chatId = String(extra?.chatId || '').trim();
  const source = String(extra?.source || 'core-passive').trim() || 'core-passive';
  const num = Math.max(1, Number(pageNum || 0) || 0);
  return Object.assign({
    ok: false,
    status: 'chat-pages-controller-unavailable',
    chatId,
    pageNum: num,
    source,
  }, extra || {});
}

function passiveBindChatPageDividerBridge(force = false) {
  return {
    ok: false,
    status: 'chat-pages-controller-unavailable',
    force: !!force,
    source: 'core-passive',
  };
}

function passiveUnbindChatPageDividerBridge() {
  return {
    ok: false,
    status: 'chat-pages-controller-unavailable',
    source: 'core-passive',
  };
}

function readCollapsedChatPages(chatId = '') {
  return callChatPagesCtl('readCollapsedPages', [chatId], passiveReadChatPageSet);
}

function isChatPageCollapsed(pageNum = 0, chatId = '') {
  return callChatPagesCtl('isPageCollapsed', [pageNum, chatId], passiveIsChatPageCollapsed);
}

function setChatPageCollapsed(pageNum = 0, collapsed = true, chatId = '', source = 'core') {
  return callChatPagesCtl(
    'setPageCollapsed',
    [pageNum, collapsed, { chatId, source }],
    (num, nextCollapsed, opts = {}) => passiveChatPagesWriteResult(num, {
      chatId: String(opts?.chatId || chatId || '').trim(),
      collapsed: !!nextCollapsed,
      source: String(opts?.source || source || 'core-passive').trim() || 'core-passive',
    })
  );
}

function toggleChatPageCollapsed(pageNum = 0, chatId = '', source = 'core') {
  return callChatPagesCtl(
    'togglePageCollapsed',
    [pageNum, { chatId, source }],
    (num, opts = {}) => passiveChatPagesWriteResult(num, {
      chatId: String(opts?.chatId || chatId || '').trim(),
      source: String(opts?.source || source || 'core-passive').trim() || 'core-passive',
    })
  );
}

function getChatPageTitleListPages(chatId = '') {
  return callChatPagesCtl('readTitleListPages', [chatId], passiveReadChatPageSet);
}

function setChatPageTitleListPages(chatId = '', pages = []) {
  return callChatPagesCtl(
    'writeTitleListPages',
    [chatId, pages],
    (id, nextPages = []) => ({
      ok: false,
      status: 'chat-pages-controller-unavailable',
      chatId: String(id || chatId || '').trim(),
      pages: Array.isArray(nextPages) ? nextPages.slice() : Array.from(nextPages || []),
      source: 'core-passive',
    })
  );
}

function isChatPageTitleListActive(pageNum = 0, chatId = '') {
  return callChatPagesCtl('isTitleListActive', [pageNum, chatId], passiveIsChatPageCollapsed);
}

function getChatPageTitleState(pageNum = 0, chatId = '') {
  return callChatPagesCtl('getTitleState', [pageNum, chatId], passiveGetChatPageTitleState);
}

function getChatPageDividerUiMode(pageNum = 0, chatId = '', opts = {}) {
  const num = Math.max(1, Number(pageNum || 0) || 0);
  const id = String(chatId || resolveChatId() || '').trim();
  const fallbackMode = !!opts?.pageCollapsed
    ? 'page_collapsed'
    : (coreFallback_isChatPageTitleListActive(num, id) ? 'title_list' : 'normal');
  const mode = callChatPagesCtl('getDividerUiMode', [num, id], () => fallbackMode);
  const raw = String(mode || fallbackMode).trim();
  return raw === 'page_collapsed' || raw === 'title_list' ? raw : 'normal';
}

function getChatPageDividerDebugState(pageNum = 0, chatId = '') {
  return callChatPagesCtl('getPageDividerDebugState', [pageNum, chatId], passiveGetChatPageDividerDebugState);
}

function setChatPageTitleListMode(pageNum = 0, enabled = true, chatId = '', source = 'core') {
  return callChatPagesCtl(
    'setTitleListMode',
    [pageNum, enabled, { chatId, source }],
    (num, nextEnabled, opts = {}) => passiveChatPagesWriteResult(num, {
      chatId: String(opts?.chatId || chatId || '').trim(),
      enabled: !!nextEnabled,
      source: String(opts?.source || source || 'core-passive').trim() || 'core-passive',
    })
  );
}

function toggleChatPageTitleListMode(pageNum = 0, chatId = '', source = 'core') {
  return callChatPagesCtl(
    'toggleTitleListMode',
    [pageNum, { chatId, source }],
    (num, opts = {}) => passiveChatPagesWriteResult(num, {
      chatId: String(opts?.chatId || chatId || '').trim(),
      source: String(opts?.source || source || 'core-passive').trim() || 'core-passive',
    })
  );
}

function applyChatPageTitleListPageVisuals(pageNum = 0, chatId = '') {
  return callChatPagesCtl(
    'applyTitleListVisuals',
    [pageNum, { chatId }],
    (num, opts = {}) => passiveChatPagesWriteResult(num, {
      chatId: String(opts?.chatId || chatId || '').trim(),
      source: String(opts?.source || 'core-passive').trim() || 'core-passive',
    })
  );
}

function applyChatPageDividerVisuals(divider = null, pageNum = 0, chatId = '') {
  if (!(divider instanceof HTMLElement)) return false;
  return callChatPagesCtl(
    'applyDividerVisualsToDivider',
    [divider, { pageNum, chatId }],
    () => false
  );
}

function bindChatPageDividerBridge(force = false) {
  return callChatPagesCtl('bind', [{ force }], passiveBindChatPageDividerBridge);
}

function ensureChatPageDividerBridge(force = false) {
  return callChatPagesCtl('bind', [{ force }], passiveBindChatPageDividerBridge);
}

function unbindChatPageDividerBridge() {
  return callChatPagesCtl('unbind', [], passiveUnbindChatPageDividerBridge);
}
  function getChatPageDividerPageNum(divider = null) {
    return Math.max(1, Number(
      divider?.getAttribute?.('data-page-num')
      || divider?.getAttribute?.(ATTR_CHAT_PAGE_NUM)
      || 0
    ) || 0);
  }

  function getChatPageDividerLabelEl(divider = null) {
    if (!divider?.querySelector) return null;
    return divider.querySelector('.cgxui-chat-page-divider-label, .cgxui-pgnw-page-divider-pill');
  }

  function createChatPageDivider(pageNum = 1, band = 'normal') {
    const div = document.createElement('div');
    div.className = 'cgxui-chat-page-divider';
    div.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    div.setAttribute(ATTR_CHAT_PAGE_DIVIDER, '1');
    div.setAttribute('data-page-num', String(pageNum || 1));
    div.setAttribute('data-page-band', String(band || 'normal'));
    div.innerHTML = `<span class="cgxui-chat-page-divider-line"></span><span class="cgxui-chat-page-divider-label"><span class="cgxui-chat-page-divider-dot" aria-hidden="true"><span class="cgxui-chat-page-divider-dot-hit" aria-hidden="true"></span></span><span class="cgxui-chat-page-divider-text">Page ${String(pageNum || 1)}</span></span><span class="cgxui-chat-page-divider-line"></span>`;
    return div;
  }

  function getChatPageAnchorBoxEl(host = null) {
    if (!host || host.nodeType !== 1) return null;
    const assistantHost = pickAssistantMessageEl(host) || host.querySelector?.('[data-message-author-role="assistant"]') || host;
    if (!assistantHost) return null;
    const toolbar = assistantHost.querySelector?.('[aria-label="Response actions"]');
    if (toolbar instanceof Element && toolbar.isConnected) return toolbar;
    try {
      const content = assistantHost.querySelector?.('.markdown, .prose, [class*="prose"], .whitespace-pre-wrap, [data-message-content], [class*="message"]');
      if (content instanceof Element && content.isConnected) return content;
    } catch {}
    return assistantHost;
  }

  function getChatPageAnchorCenterX(host = null) {
    const box = getChatPageAnchorBoxEl(host) || host || null;
    if (!box) return NaN;
    try {
      const rect = box.getBoundingClientRect();
      const w = Number(rect?.width || 0) || 0;
      if (!w) return NaN;
      return Number(rect.left || 0) + (w / 2);
    } catch {
      return NaN;
    }
  }

  function getPreviousChatPageAnchorHost(host = null) {
    // Wrapper-aware: the previous turn is the document-order previous turn
    // section, not a DOM sibling of this host.
    const prev = getAdjacentLiveChatTurnHost(host, -1);
    return prev && getChatPageTurnRole(prev) ? prev : null;
  }

  function applyChatPageDividerGeometry(divider = null, prevHost = null, nextHost = null) {
    if (!divider || !divider.isConnected) return false;
    const label = divider.querySelector?.('.cgxui-chat-page-divider-label') || null;
    const leftLine = divider.querySelector?.('.cgxui-chat-page-divider-line:first-child') || divider.children?.[0] || null;
    const rightLine = divider.querySelector?.('.cgxui-chat-page-divider-line:last-child') || divider.children?.[2] || null;
    if (!label || !leftLine || !rightLine) return false;

    const dividerRect = divider.getBoundingClientRect();
    const rowWidth = Number(dividerRect?.width || 0) || 0;
    if (!rowWidth) return false;

    const anchorHost = prevHost || getPreviousChatPageAnchorHost(divider) || nextHost || null;
    let anchorCenter = getChatPageAnchorCenterX(anchorHost);
    if (!Number.isFinite(anchorCenter)) anchorCenter = Number(dividerRect.left || 0) + (rowWidth / 2);

    const centerLocal = anchorCenter - Number(dividerRect.left || 0);
    const labelRect = label.getBoundingClientRect();
    const labelWidth = Math.max(108, Number(labelRect?.width || 0) || 0);
    const minLine = 24;
    const gap = 12;
    const clampedCenter = Math.max((labelWidth / 2) + minLine + gap, Math.min(rowWidth - ((labelWidth / 2) + minLine + gap), centerLocal));
    const leftWidth = Math.max(minLine, clampedCenter - (labelWidth / 2) - gap);
    const rightWidth = Math.max(minLine, rowWidth - clampedCenter - (labelWidth / 2) - gap);
    const labelLeft = Math.max(leftWidth + gap, Math.min(rowWidth - rightWidth - gap - labelWidth, clampedCenter - (labelWidth / 2)));

    try {
      divider.style.setProperty('--cgxui-chat-page-label-left', `${labelLeft}px`);
      divider.style.setProperty('--cgxui-chat-page-label-width', `${labelWidth}px`);
      divider.style.setProperty('--cgxui-chat-page-left-line-w', `${leftWidth}px`);
      divider.style.setProperty('--cgxui-chat-page-right-line-w', `${rightWidth}px`);
      divider.style.setProperty('--cgxui-chat-page-center-x', `${clampedCenter}px`);
      divider.setAttribute('data-cgxui-chat-geometry', '1');
    } catch {}
    return true;
  }

  function isChatPageDividerEl(el, pageNum = 0) {
    if (!el?.classList) return false;
    const isKnownDivider =
      el.getAttribute?.(ATTR_CHAT_PAGE_DIVIDER) === '1'
      || el.classList.contains('cgxui-chat-page-divider')
      // Pagination may own the functional surface, but it still participates in the shared chat page divider UI layer.
      || el.classList.contains('cgxui-pgnw-page-divider');
    if (!isKnownDivider) return false;
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return true;
    return getChatPageDividerPageNum(el) === num;
  }

  function resolveChatPageDividerEl(target = null) {
    const el = (target instanceof Element)
      ? target
      : ((target?.parentElement instanceof Element)
        ? target.parentElement
        : ((target?.parentNode instanceof Element) ? target.parentNode : null));
    if (!el?.closest) return null;
    return el.closest('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider');
  }

  function getChatPageTurnRole(host = null) {
    if (!host || host.nodeType !== 1) return '';
    // ChatGPT stamps data-turn="user|assistant" on the turn section itself.
    const section = getLiveChatTurnSectionForNode(host) || host;
    const turnAttr = String(section.getAttribute?.('data-turn') || '').trim().toLowerCase();
    if (turnAttr === 'user' || turnAttr === 'assistant') return turnAttr;
    const selfRole = String(host.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
    if (selfRole === 'user' || selfRole === 'assistant') return selfRole;
    if (pickAssistantMessageEl(host)) return 'assistant';
    try {
      const userEl = host.querySelector?.('[data-message-author-role="user"]');
      if (userEl) return 'user';
    } catch {}
    return '';
  }

  function addChatPageSectionHost(section, host) {
    if (!section || !host || host.nodeType !== 1) return false;
    if (!(section.hostSet instanceof Set)) section.hostSet = new Set();
    if (section.hostSet.has(host)) return false;
    section.hostSet.add(host);
    section.hosts.push(host);
    return true;
  }

  function buildChatPageSectionsFromPaginationState() {
    const ps = getPaginationState();
    const masterTurns = Array.isArray(ps?.masterTurns) ? ps.masterTurns : [];
    if (!masterTurns.length) return null;

    // Page boundaries must use Core turnNo (true pair number), not answerIndex.
    // answerIndex skips unanswered turns (e.g. answerIndex 26 = pair 27 when
    // pair 19 is unanswered), causing the section boundary to land one pair late.
    const pageSize = Math.max(1, Number(ps?.pageSize || 0) || 25);
    const rt = getTurnRuntimeApi();

    const sections = new Map();
    const allHosts = [];
    const allHostSet = new Set();

    // Track the last resolved pageNum so unanswered-question turns inherit
    // the page of the surrounding answered turns.
    let lastPageNum = 1;

    for (let i = 0; i < masterTurns.length; i += 1) {
      const row = masterTurns[i] || null;
      const host = row?.node || null;
      if (!host || host.nodeType !== 1) continue;

      const answerIndex = Math.max(0, Number(row?.answerIndex || 0) || 0);
      let pageNum;
      if (answerIndex > 0) {
        // Resolve true pair number via Core turnRuntime.
        let pairNo = 0;
        const aId = String(row?.answerId || '').trim();
        if (rt && aId) {
          try {
            const rec = rt.getTurnRecordByAId?.(aId) || null;
            pairNo = Math.max(0, Number(rec?.turnNo || rec?.idx || 0) || 0);
          } catch {}
        }
        if (!pairNo) pairNo = answerIndex; // fallback when Core not yet reconciled
        pageNum = Math.max(1, Math.ceil(pairNo / pageSize));
        lastPageNum = pageNum;
      } else {
        // Unanswered question: inherit page from surrounding answered turns.
        // Look ahead for the next answered turn's pairNo.
        let found = false;
        for (let j = i + 1; j < masterTurns.length; j += 1) {
          const nextRow = masterTurns[j] || null;
          const nextAIdx = Math.max(0, Number(nextRow?.answerIndex || 0) || 0);
          if (nextAIdx > 0) {
            let nextPairNo = 0;
            const nextAId = String(nextRow?.answerId || '').trim();
            if (rt && nextAId) {
              try {
                const rec = rt.getTurnRecordByAId?.(nextAId) || null;
                nextPairNo = Math.max(0, Number(rec?.turnNo || rec?.idx || 0) || 0);
              } catch {}
            }
            if (!nextPairNo) nextPairNo = nextAIdx;
            pageNum = Math.max(1, Math.ceil(nextPairNo / pageSize));
            found = true;
            break;
          }
        }
        if (!found) pageNum = lastPageNum;
      }

      let section = sections.get(pageNum);
      if (!section) {
        section = {
          pageNum,
          band: String(getTurnPageBand(pageNum * pageSize) || 'normal'),
          hosts: [],
          hostSet: new Set(),
        };
        sections.set(pageNum, section);
      }
      addChatPageSectionHost(section, host);
      if (!allHostSet.has(host)) {
        allHostSet.add(host);
        allHosts.push(host);
      }
    }

    return sections.size ? { sections, allHosts } : null;
  }

  function buildChatPageSectionsFromTurnList() {
    const turns = Array.isArray(S.turnList) ? S.turnList : [];
    if (!turns.length) return null;

    const sections = new Map();
    const allHosts = [];
    const allHostSet = new Set();

    for (const turn of turns) {
      const idx = Math.max(1, Number(turn?.index || 0) || 0);
      if (!idx) continue;

      const host = getChatPageTurnHost(turn);
      if (!host) continue;

      const pageNum = Math.max(1, Math.ceil(idx / 25));
      let section = sections.get(pageNum);
      if (!section) {
        section = {
          pageNum,
          band: String(getTurnPageBand(idx) || 'normal'),
          hosts: [],
          hostSet: new Set(),
        };
        sections.set(pageNum, section);
      }

      // Wrapper-aware pairing: the paired question is the document-order
      // previous turn section, not a DOM sibling of the answer section.
      const pairedQuestion = getPairedQuestionHostForAssistantHost(host);
      if (pairedQuestion) addChatPageSectionHost(section, pairedQuestion);
      addChatPageSectionHost(section, host);
    }

    // ── Orphaned user-turn sweep ──────────────────────────────────────────────
    // getChatPageTurnHost() returns null for turns with no assistant element,
    // so any user-only turn (question without an answer) is skipped by the loop
    // above.  We scan the live DOM here and add those turns so that
    // buildChatPageAnswerRows can later call ensureNoAnswerTitleBar on them.
    try {
      const allTurnEls = listLiveChatTurnSections();
      for (const domHost of allTurnEls) {
        if (allHostSet.has(domHost)) continue;
        const role = getChatPageTurnRole(domHost);
        if (role !== 'user') continue;
        if (pickAssistantMessageEl(domHost)) continue; // has assistant → not orphaned
        // A user turn with a paired following assistant answer is not an
        // orphan; the paired branch above owns its placement.
        if (getPairedAssistantHostForQuestionHost(domHost)) continue;

        // Determine page from the nearest already-placed preceding turn
        // section (wrapper-aware document-order walk, not DOM siblings).
        let pageNum = 1;
        let prevTurn = getAdjacentLiveChatTurnHost(domHost, -1);
        outer: while (prevTurn) {
          for (const [pn, sec] of sections) {
            if (sec.hostSet instanceof Set && sec.hostSet.has(prevTurn)) { pageNum = pn; break outer; }
          }
          prevTurn = getAdjacentLiveChatTurnHost(prevTurn, -1);
        }

        let section = sections.get(pageNum);
        if (!section) {
          section = { pageNum, band: String(getTurnPageBand((pageNum - 1) * 25 + 1) || 'normal'), hosts: [], hostSet: new Set() };
          sections.set(pageNum, section);
        }
        addChatPageSectionHost(section, domHost);
      }
    } catch (_e) {}
    // ─────────────────────────────────────────────────────────────────────────

    for (const section of sections.values()) {
      for (const host of section.hosts) {
        if (allHostSet.has(host)) continue;
        allHostSet.add(host);
        allHosts.push(host);
      }
    }

    return { sections, allHosts };
  }

  // Direct DOM scan — no dependency on Pagination or S.turnList.
  // Finds all live conversation-turn containers and assigns them to pages
  // purely from their DOM position order. This is the independent fallback
  // that makes collapse work regardless of whether Pagination is loaded.
  function buildChatPageSectionsFromDom() {
    const turnEls = qq('[data-testid="conversation-turn"]');
    if (!turnEls.length) return null;

    const sections = new Map();
    const allHosts = [];
    const allHostSet = new Set();
    let answerIdx = 0;

    for (const host of turnEls) {
      // Count only assistant turns for page numbering (mirrors how Core indexes turns)
      const isAssistant = !!host.querySelector('[data-message-author-role="assistant"]');
      if (isAssistant) answerIdx += 1;

      const pageNum = Math.max(1, Math.ceil(Math.max(1, answerIdx) / 25));

      if (!allHostSet.has(host)) {
        allHostSet.add(host);
        allHosts.push(host);
      }

      let section = sections.get(pageNum);
      if (!section) {
        section = {
          pageNum,
          band: String(getTurnPageBand(Math.max(1, answerIdx)) || 'normal'),
          hosts: [],
          hostSet: new Set(),
        };
        sections.set(pageNum, section);
      }
      addChatPageSectionHost(section, host);
    }

    return { sections, allHosts };
  }

  function buildChatPageSections() {
    return buildChatPageSectionsFromPaginationState()
      || buildChatPageSectionsFromTurnList()
      || buildChatPageSectionsFromDom()
      || { sections: new Map(), allHosts: [] };
  }

  function setChatPageDividerDomState(divider, collapsed = false, pageNum = 0, band = 'normal', chatId = '') {
    if (!divider) return null;
    const num = Math.max(1, Number(pageNum || getChatPageDividerPageNum(divider) || 0) || 1);
    const id = String(chatId || resolveChatId() || '').trim();
    const uiMode = getChatPageDividerUiMode(num, id, { pageCollapsed: !!collapsed });
    const effectiveCollapsed = uiMode === 'page_collapsed';
    const effectiveTitleListActive = uiMode === 'title_list';
    const effectiveTitleState = effectiveTitleListActive ? 'collapsed' : 'expanded';
    divider.setAttribute(ATTR_CHAT_PAGE_DIVIDER, '1');
    divider.setAttribute(ATTR_CHAT_PAGE_NUM, String(num));
    if (divider.classList?.contains('cgxui-chat-page-divider')) {
      divider.setAttribute('data-page-num', String(num));
      divider.setAttribute('data-page-band', String(band || 'normal'));
    }
    ensureChatPageDividerMarkup(divider, num);
    bindChatPageDividerStatusCard(divider);
    if (effectiveCollapsed) divider.setAttribute(ATTR_CHAT_PAGE_COLLAPSED, '1');
    else divider.removeAttribute(ATTR_CHAT_PAGE_COLLAPSED);

    if (effectiveTitleListActive) divider.setAttribute(ATTR_CHAT_PAGE_TITLE_LIST, '1');
    else divider.removeAttribute(ATTR_CHAT_PAGE_TITLE_LIST);

    divider.setAttribute(ATTR_CHAT_PAGE_TITLE_STATE, effectiveTitleState);
    const dot = getChatPageDividerDotEl(divider);
    if (dot) {
      try { dot.setAttribute('data-page-title-state', effectiveTitleState); } catch {}
      const collapseUnavailable = String(
        divider.getAttribute?.('data-h2o-collapse-readiness') || ''
      ) === 'collapsed-exact-boundary-unavailable';
      const collapseReason = String(
        divider.getAttribute?.('data-h2o-collapse-reason') || 'readiness-api-unavailable'
      ).trim() || 'readiness-api-unavailable';
      const collapseTitle = effectiveTitleListActive
        ? `Expand Page ${num}`
        : collapseUnavailable
          ? `Collapse currently unavailable — ${collapseReason}`
          : `Collapse Page ${num}`;
      const collapseLabel = effectiveTitleListActive
        ? `Page ${num}. Expand page titles.`
        : collapseUnavailable
          ? `Page ${num}. Collapse currently unavailable because the next page boundary is not loaded. Technical reason: ${collapseReason}.`
          : `Page ${num}. Collapse page titles.`;
      try { dot.removeAttribute('aria-hidden'); } catch {}
      try { dot.setAttribute('role', 'button'); } catch {}
      try { dot.setAttribute('tabindex', '0'); } catch {}
      try { dot.removeAttribute('aria-disabled'); } catch {}
      try { dot.setAttribute('data-h2o-collapse-control-state', collapseUnavailable ? 'blocked' : 'ready'); } catch {}
      try { dot.setAttribute('title', collapseTitle); } catch {}
      try { dot.setAttribute('aria-label', collapseLabel); } catch {}
    }

    const title = `Page ${num}`;
    const label = getChatPageDividerLabelEl(divider);
    if (label) {
      try { label.setAttribute('aria-expanded', effectiveCollapsed ? 'false' : 'true'); } catch {}
      try { label.title = title; } catch {}
    }
    try { divider.title = title; } catch {}
    return divider;
  }

  function isChatPageHostHidden(host = null) {
    if (!host) return false;
    if (String(host.getAttribute?.(ATTR_CHAT_PAGE_HIDDEN) || '').trim() === '1') return true;
    try {
      return String(host.style?.getPropertyValue?.('display') || '').trim().toLowerCase() === 'none';
    } catch {
      return false;
    }
  }

  function getChatPageSectionCollapsedState(pageNum = 0, chatId = '', hosts = []) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId() || '').trim();
    const sectionHosts = Array.isArray(hosts) ? hosts : [];
    for (const host of sectionHosts) {
      if (isChatPageHostHidden(host)) return true;
    }
    if (num) {
      try {
        if (document.querySelector?.(`[${ATTR_CHAT_PAGE_NUM}="${String(num)}"][${ATTR_CHAT_PAGE_HIDDEN}="1"]`)) return true;
      } catch {}
    }
    return !!(num && readCollapsedChatPages(id)?.has?.(num));
  }

  // First pair of Page N in the authoritative canonical map → its live turn
  // section (persists in the DOM even unhydrated) → the pair's question host.
  // Resolution is IDENTITY-based: the section is looked up by its stable
  // data-turn-id, never through cached element references — ChatGPT's
  // virtualized rendering can recycle hydrated content nodes, so an element
  // ref may silently belong to a different turn and would anchor the divider
  // after the wrong pair.
  function sectionByStableId(anyId) {
    const raw = String(anyId || '').replace(/^turn:[aq]:/, '').trim();
    if (!raw) return null;
    try {
      const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(raw) : raw.replace(/"/g, '\\"');
      return document.querySelector(
        `[data-testid^="conversation-turn-"][data-turn-id="${esc}"], [data-testid="conversation-turn"][data-turn-id="${esc}"]`
      ) || null;
    } catch { return null; }
  }

  // Deterministic page-start QUESTION section, independent of turn records,
  // cached element refs, or hosts[0]. ChatGPT keeps every turn in the DOM as
  // section[data-testid="conversation-turn-N"], N being the 1-based turn
  // position (odd = user question, even = assistant answer). The first pair of
  // Page P is pair ((P-1)*25 + 1); its question is turn (((pair-1)*2)+1):
  //   Page 1 → conversation-turn-1, Page 2 → conversation-turn-51.
  // Returns { host, mode } so the divider can record how it was anchored.
  function getPageStartQuestionSection(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const pairStartIdx0 = (num - 1) * 25;          // 0-based page-start pair
    const turnNumber = (pairStartIdx0 * 2) + 1;    // 1-based turn testid number

    // Primary: exact testid.
    try {
      const bySel = document.querySelector(`section[data-testid="conversation-turn-${turnNumber}"]`);
      if (bySel && getChatPageTurnRole(bySel) === 'user') {
        return { host: bySel, mode: 'testid' };
      }
    } catch {}

    // Fallback: nth user section in DOM order (handles a non-contiguous or
    // renamed testid scheme). Index = (P-1)*25 among user turns.
    try {
      const userSections = Array.from(
        document.querySelectorAll('section[data-testid^="conversation-turn"][data-turn="user"]')
      ).sort((a, b) => {
        const na = Number(String(a.getAttribute('data-testid') || '').replace('conversation-turn-', '')) || 0;
        const nb = Number(String(b.getAttribute('data-testid') || '').replace('conversation-turn-', '')) || 0;
        return na - nb;
      });
      const pick = userSections[pairStartIdx0] || null;
      if (pick) return { host: pick, mode: 'user-nth' };
    } catch {}

    return null;
  }

  function getAuthoritativePageAnchorHost(pageNum = 0) {
    // Deterministic resolver first — always succeeds when the page-start
    // section is in the DOM (ChatGPT keeps all sections), so the divider can
    // always be repaired rather than left stuck at a prior drifted position.
    const direct = getPageStartQuestionSection(pageNum);
    if (direct?.host) {
      getAuthoritativePageAnchorHost._lastMode = direct.mode;
      return direct.host;
    }

    const num = Math.max(1, Number(pageNum || 0) || 0);
    const turn = Array.isArray(S.turnList) ? (S.turnList[(num - 1) * 25] || null) : null;
    if (!turn) return null;
    try {
      const questionId = String(turn.questionId || turn.qId || '').trim();
      const qHost = questionId ? sectionByStableId(questionId) : null;
      if (qHost) { getAuthoritativePageAnchorHost._lastMode = 'question-id'; return qHost; }

      const answerId = String(turn.answerId || '').trim()
        || String(turn.turnId || '').replace(/^turn:a:/, '').trim();
      let host = answerId ? sectionByStableId(answerId) : null;
      if (!host) {
        const resolved = getChatPageTurnHost(turn);
        const resolvedId = String(resolved?.getAttribute?.('data-turn-id') || '').trim();
        if (resolved && (!answerId || !resolvedId || resolvedId === answerId)) host = resolved;
      }
      if (!host) return null;
      const paired = getPairedQuestionHostForAssistantHost(host);
      getAuthoritativePageAnchorHost._lastMode = 'answer-paired';
      return paired || host;
    } catch {
      return null;
    }
  }

  // ChatGPT recycles/reparents turn sections on scroll, which can strand a
  // page divider below its page-start pair. renderChatPageDividers re-anchors
  // from authoritative identity, but it does not otherwise run on scroll — so
  // bind a throttled scroll trigger once (capture phase catches the inner
  // conversation scroller, not just window).
  let dividerScrollRepairBound = false;
  let dividerScrollRepairAt = 0;
  let dividerScrollTrailTimer = 0;
  let dividerScrollContainerBound = null;
  function runDividerRepair() {
    try { renderChatPageDividers(resolveChatId()); } catch {}
  }
  function onDividerRepairScroll() {
    const now = Date.now();
    // Leading (throttled) repair for live feedback.
    if (now - dividerScrollRepairAt >= 300) {
      dividerScrollRepairAt = now;
      runDividerRepair();
    }
    // Trailing repair — ChatGPT can rehydrate/reparent AFTER scroll settles,
    // so re-anchor once things stop moving.
    try { W.clearTimeout(dividerScrollTrailTimer); } catch {}
    dividerScrollTrailTimer = W.setTimeout(runDividerRepair, 500);
  }
  function bindDividerScrollRepairOnce() {
    // Bind window (capture catches inner scrollers) once.
    if (!dividerScrollRepairBound) {
      dividerScrollRepairBound = true;
      try { W.addEventListener('scroll', onDividerRepairScroll, { passive: true, capture: true }); } catch {}
    }
    // Also bind the active ChatGPT scroll container directly, in case it
    // stops events from reaching the window in some layouts.
    try {
      let cur = document.querySelector('[data-testid^="conversation-turn-"]');
      let scroller = null;
      while (cur && cur !== document.body) {
        const cs = getComputedStyle(cur);
        const oy = String(cs?.overflowY || '');
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight + 4) { scroller = cur; break; }
        cur = cur.parentElement;
      }
      if (scroller && scroller !== dividerScrollContainerBound) {
        dividerScrollContainerBound = scroller;
        scroller.addEventListener('scroll', onDividerRepairScroll, { passive: true });
      }
    } catch {}
  }

  // ── Verified divider placement (operator-exact wrapper) ────────────────────
  // The divider must sit before the SAME node the runtime smoke checks:
  // `section.parentElement`. getChatPagePairAnchorNode can climb only-child
  // wrappers to a different node (pair 1's branch/"(2/2)" structure), which is
  // why Phase 1Q stamped conversation-turn-1 while the divider stayed before
  // conversation-turn-3. Placement here uses section.parentElement directly and
  // stamps success only after verifying the final DOM.
  // H2O helper nodes that legitimately sit between a page divider and its
  // page-start wrapper (currently: the synthetic page title-list container).
  // Order verification and placement must look THROUGH them, not at them —
  // otherwise the divider repair and the list anchor leapfrog each other and
  // the divider ends up below the list.
  function isDividerPassThroughEl(el) {
    return String(el?.getAttribute?.('data-cgxui') || '') === 'chat-page-title-list-synth';
  }

  function getNextTurnTestIdAfterDivider(divider) {
    let nx = divider?.nextElementSibling || null;
    while (nx && isDividerPassThroughEl(nx)) nx = nx.nextElementSibling;
    if (!nx) return null;
    try {
      const inner = nx.querySelector?.('section[data-testid^="conversation-turn"]');
      if (inner) return inner.getAttribute('data-testid');
      if (nx.matches?.('section[data-testid^="conversation-turn"]')) return nx.getAttribute('data-testid');
    } catch {}
    return null;
  }

  function getPageStartTurnWrapper(pageNum) {
    const pairStartIdx0 = (Number(pageNum) - 1) * 25;
    const turnNumber = pairStartIdx0 * 2 + 1;
    const testid = `conversation-turn-${turnNumber}`;
    let section = null;
    try { section = document.querySelector(`section[data-testid="${testid}"]`); } catch {}
    // A page-start turn that is inline-opened INSIDE the page's title-bar
    // stack is not a divider anchor: the divider's correct position is above
    // the stack container itself (already maintained by the unit rule).
    // Anchoring on it would drag the divider into the stack.
    if (section?.closest?.('[data-cgxui="chat-page-title-list-synth"]')) return null;
    if (section) return { wrapper: section.parentElement || section, section, testid, mode: 'testid-wrapper' };

    let users = [];
    try {
      users = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn"][data-turn="user"]'))
        .sort((a, b) => {
          const an = Number(String(a.getAttribute('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1] || 0);
          const bn = Number(String(b.getAttribute('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1] || 0);
          return an - bn;
        });
    } catch {}
    const fallback = users[pairStartIdx0] || null;
    if (fallback) {
      // Partial-DOM guard: with numeric testids the primary selector would
      // have matched if the true page-start section were present, so a
      // different number here means the flow holds only a subset (e.g.
      // pagination windowing detached earlier turns). Indexing the nth user
      // section of a subset would anchor the divider at the wrong pair —
      // refuse instead of guessing; placement retries when the full flow is
      // back. The nth pick stays valid only for a renamed (non-numeric)
      // testid scheme.
      const fbNum = Number(String(fallback.getAttribute('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1] || 0);
      if (fbNum && fbNum !== turnNumber) return null;
      return {
        wrapper: fallback.parentElement || fallback,
        section: fallback,
        testid: fallback.getAttribute('data-testid'),
        mode: 'user-nth-wrapper',
      };
    }
    return null;
  }

  const CHAT_PAGE_BOUNDARY_ATTR = 'data-h2o-chat-page-boundary';
  const CHAT_PAGE_BOUNDARY_PAGE_ATTR = 'data-h2o-chat-page-boundary-page';
  const CHAT_PAGE_BOUNDARY_KIND_ATTR = 'data-h2o-chat-page-boundary-kind';
  const CHAT_PAGE_UNIT_OWNER = '1A1b:reconcileChatPageUnits';

  function getChatPageUnitState() {
    if (!S.chatPageUnitState || typeof S.chatPageUnitState !== 'object') {
      S.chatPageUnitState = {
        identity: '',
        sentinels: new Map(),
        pendingDividers: new Map(),
        reconcileInFlight: false,
        hydrationRequested: new Set(),
        last: null,
      };
    }
    if (!(S.chatPageUnitState.sentinels instanceof Map)) S.chatPageUnitState.sentinels = new Map();
    if (!(S.chatPageUnitState.pendingDividers instanceof Map)) S.chatPageUnitState.pendingDividers = new Map();
    if (!(S.chatPageUnitState.hydrationRequested instanceof Set)) S.chatPageUnitState.hydrationRequested = new Set();
    return S.chatPageUnitState;
  }

  function chatPageUnitIdentity() {
    const status = getEffectivePresentationRuntimeStatus();
    const chatId = String(resolveChatId() || '').trim();
    const routeKey = String(W.location?.pathname || '').trim();
    const source = status.overlayActive === true
      && status.source === 'selected-path-overlay'
      && status.count === Number(S.turnList?.length || 0)
      ? 'selected-path-overlay'
      : 'canonical';
    const fingerprint = String(status.canonicalFingerprint || '');
    // Selecting a different path through one canonical graph leaves chatId,
    // routeKey, canonical fingerprint and generation all unchanged, so without
    // the effective fingerprint the identity stayed constant across a branch
    // switch and the old page units were never invalidated.
    const effectiveFingerprint = String(status.effectiveFingerprint || '');
    const generation = String(status.generation || 0);
    const count = Number(S.turnList?.length || 0);
    const pageCount = count > 0 ? Math.ceil(count / 25) : 0;
    return [
      chatId, routeKey, source, String(count), fingerprint, effectiveFingerprint, generation, String(pageCount),
    ].join('|');
  }

  function chatPageRecordOrder(turn = null, fallbackOrder = 0) {
    return Math.max(0, Number(
      turn?.order
      || turn?.turnNo
      || turn?.idx
      || fallbackOrder
      || 0
    ) || 0);
  }

  function resolveChatPageExactArtifact(turn = null) {
    if (!turn) return null;
    const ids = [
      turn.questionId,
      turn.qId,
      turn.answerId,
      turn.primaryAId,
      String(turn.turnId || '').replace(/^turn:[aq]:/, ''),
    ].map((value) => String(value || '').trim()).filter(Boolean);
    let section = null;
    for (const id of ids) {
      section = sectionByStableId(id);
      if (section) break;
    }
    if (!section) {
      try { section = getChatPageTurnHost(turn) || null; } catch {}
    }
    if (!section?.isConnected) return null;
    try {
      if (section.closest?.('[data-cgxui="chat-page-title-list-synth"]')) return null;
    } catch {}
    let ownedSection = section;
    try {
      if (!ownedSection.matches?.('section[data-testid^="conversation-turn"]')) {
        ownedSection = ownedSection.closest?.('section[data-testid^="conversation-turn"]')
          || ownedSection.querySelector?.('section[data-testid^="conversation-turn"]')
          || ownedSection;
      }
    } catch {}
    if (!ownedSection?.isConnected) return null;
    const wrapper = ownedSection.parentElement || ownedSection;
    if (!wrapper?.parentNode) return null;
    return { section: ownedSection, wrapper };
  }

  function getChatPageTitleListRoot(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    try {
      return document.querySelector(
        `[data-cgxui="chat-page-title-list-synth"][data-page-num="${String(num)}"]`
      ) || null;
    } catch {
      return null;
    }
  }

  function buildChatPageUnitModel() {
    const turns = Array.isArray(S.turnList) ? S.turnList.slice() : [];
    const count = turns.length;
    const pageCount = count > 0 ? Math.ceil(count / 25) : 0;
    const status = getEffectivePresentationRuntimeStatus();
    const source = status.overlayActive === true
      && status.source === 'selected-path-overlay'
      && status.count === count
      ? 'selected-path-overlay'
      : 'canonical';
    let nativeSlotSequence = null;
    try {
      nativeSlotSequence = getChatPagesControllerApi()?.resolveNativeTurnSlotSequence?.() || null;
    } catch {}
    const nativeSlotSequenceReady = nativeSlotSequence?.ready === true
      && nativeSlotSequence.count === count
      && nativeSlotSequence.expectedSlotCount === count * 2
      && nativeSlotSequence.actualSlotCount === count * 2
      && nativeSlotSequence.flowRoot
      && Array.isArray(nativeSlotSequence.slots);
    const pages = [];
    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const startOrder = ((pageNum - 1) * 25) + 1;
      const endOrder = Math.min(count, pageNum * 25);
      const nativeStartOrdinal = ((pageNum - 1) * 25 * 2) + 1;
      const nativeEndOrdinal = Math.min(pageNum * 25 * 2, count * 2);
      const records = [];
      const artifacts = [];
      for (let index = startOrder - 1; index < endOrder; index += 1) {
        const turn = turns[index] || null;
        if (!turn) continue;
        const order = chatPageRecordOrder(turn, index + 1);
        records.push({ order, turn });
        const exact = resolveChatPageExactArtifact(turn);
        if (exact) artifacts.push({ order, turn, ...exact });
      }
      artifacts.sort((a, b) => a.order - b.order);
      const exactStart = getPageStartTurnWrapper(pageNum);
      const titleListRoot = getChatPageTitleListRoot(pageNum);
      const nativeStartSlot = nativeSlotSequenceReady
        ? nativeSlotSequence.slots[nativeStartOrdinal - 1]?.element || null
        : null;
      const nativeEndSlot = nativeSlotSequenceReady
        ? nativeSlotSequence.slots[nativeEndOrdinal - 1]?.element || null
        : null;
      const nextNativeStartSlot = nativeSlotSequenceReady
        ? nativeSlotSequence.slots[nativeEndOrdinal]?.element || null
        : null;
      pages.push({
        pageNum,
        startOrder,
        endOrder,
        nativeStartOrdinal,
        nativeEndOrdinal,
        records,
        artifacts,
        exactStart,
        earliest: artifacts[0] || null,
        latest: artifacts[artifacts.length - 1] || null,
        titleListRoot: titleListRoot?.isConnected ? titleListRoot : null,
        nativeStartSlot: nativeSlotSequenceReady
          && nativeStartSlot?.parentNode === nativeSlotSequence.flowRoot ? nativeStartSlot : null,
        nativeEndSlot: nativeSlotSequenceReady
          && nativeEndSlot?.parentNode === nativeSlotSequence.flowRoot ? nativeEndSlot : null,
        nextNativeStartSlot: nativeSlotSequenceReady
          && nextNativeStartSlot?.parentNode === nativeSlotSequence.flowRoot
          ? nextNativeStartSlot
          : null,
      });
    }
    return Object.freeze({
      identity: chatPageUnitIdentity(),
      chatId: String(resolveChatId() || '').trim(),
      source,
      count,
      pageCount,
      pages,
      nativeSlotSequence: nativeSlotSequenceReady ? nativeSlotSequence : null,
    });
  }

  function createChatPageBoundarySentinel(pageNum = 0, kind = 'start') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const safeKind = kind === 'end' ? 'end' : 'start';
    const sentinel = document.createElement('span');
    sentinel.setAttribute(CHAT_PAGE_BOUNDARY_ATTR, `page-${String(num)}-${safeKind}`);
    sentinel.setAttribute(CHAT_PAGE_BOUNDARY_PAGE_ATTR, String(num));
    sentinel.setAttribute(CHAT_PAGE_BOUNDARY_KIND_ATTR, safeKind);
    sentinel.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.setAttribute('role', 'presentation');
    try { sentinel.inert = true; } catch {}
    try {
      sentinel.style.setProperty('display', 'block');
      sentinel.style.setProperty('width', '0');
      sentinel.style.setProperty('height', '0');
      sentinel.style.setProperty('min-width', '0');
      sentinel.style.setProperty('min-height', '0');
      sentinel.style.setProperty('overflow', 'hidden');
      sentinel.style.setProperty('pointer-events', 'none');
      sentinel.style.setProperty('margin', '0');
      sentinel.style.setProperty('padding', '0');
      sentinel.style.setProperty('border', '0');
    } catch {}
    return sentinel;
  }

  function ensureChatPageBoundarySentinels(model = null) {
    const state = getChatPageUnitState();
    const nextIdentity = String(model?.identity || '');
    const stale = [];
    if (state.identity && state.identity !== nextIdentity) {
      for (const sentinel of state.sentinels.values()) stale.push(sentinel);
      state.sentinels.clear();
      state.hydrationRequested.clear();
      // The previous layout's settled result describes a page model that no
      // longer exists. Drop it so a 39-turn "settled" cannot stand in as
      // authority for the 18-turn selected path.
      state.last = null;
    }
    state.identity = nextIdentity;
    const keep = new Set();
    for (const page of Array.isArray(model?.pages) ? model.pages : []) {
      for (const kind of ['start', 'end']) {
        const key = `${String(page.pageNum)}:${kind}`;
        let sentinel = state.sentinels.get(key) || null;
        if (!sentinel) {
          try {
            sentinel = document.querySelector(
              `[${CHAT_PAGE_BOUNDARY_ATTR}="page-${String(page.pageNum)}-${kind}"]`
            ) || null;
          } catch {}
        }
        if (!sentinel) sentinel = createChatPageBoundarySentinel(page.pageNum, kind);
        state.sentinels.set(key, sentinel);
        keep.add(sentinel);
      }
    }
    try {
      for (const sentinel of Array.from(document.querySelectorAll(`[${CHAT_PAGE_BOUNDARY_ATTR}]`))) {
        if (!keep.has(sentinel)) stale.push(sentinel);
      }
    } catch {}
    return { state, stale, keep };
  }

  function compareChatPageNodes(a = null, b = null) {
    if (!a || !b || a === b) return 0;
    try {
      const relation = a.compareDocumentPosition(b);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    } catch {}
    return 0;
  }

  function resolveRenderedBoundaryWrapperFromCapability(flowRoot = null, capability = null) {
    if (capability?.supported !== true) {
      return { ok: false, reason: 'rendered-boundary-capability-unsupported' };
    }
    if (capability.boundaryIdentityCurrent !== true || capability.leaseCurrent !== true) {
      return { ok: false, reason: 'rendered-boundary-capability-not-current' };
    }
    const qId = String(capability.qId || '').trim();
    if (!qId) return { ok: false, reason: 'rendered-boundary-qid-unavailable' };
    if (!flowRoot?.isConnected) {
      return { ok: false, reason: 'rendered-boundary-flow-root-unavailable' };
    }
    const matches = [];
    try {
      for (const child of Array.from(flowRoot.children || [])) {
        if (!child?.isConnected || child.parentElement !== flowRoot) continue;
        if (String(child.getAttribute?.('data-turn-id-container') || '').trim() === qId) {
          matches.push(child);
        }
      }
    } catch {
      return { ok: false, reason: 'rendered-boundary-wrapper-unavailable' };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'rendered-boundary-wrapper-ambiguous' };
    }
    if (matches.length !== 1) {
      return { ok: false, reason: 'rendered-boundary-wrapper-unavailable' };
    }
    return { ok: true, wrapper: matches[0], qId };
  }

  function resolveRenderedBoundaryPageUnitAnchor(model = null, page = null) {
    // Page 1 is not "already at the thread start". On a selected-path
    // projection its exact order-1 wrapper can sit anywhere in the flow, so it
    // owns a rendered boundary exactly like every later page. Skipping it here
    // left the Page 1 units wherever the weaker mounted-artifact fallbacks put
    // them, which on the 18-turn branch was after the wrapper they must precede.
    if (!model || !page || Number(page.pageNum || 0) < 1) {
      return { applicable: false };
    }
    const api = getChatPagesControllerApi();
    if (typeof api?.getRenderedPageBoundaryCapability !== 'function') {
      return { applicable: false };
    }
    let capability = null;
    try {
      capability = api.getRenderedPageBoundaryCapability(page.pageNum) || null;
    } catch {
      return { applicable: false };
    }
    if (capability?.supported !== true) return { applicable: false, capability };
    if (capability.boundaryIdentityCurrent !== true || capability.leaseCurrent !== true) {
      return {
        applicable: true,
        ok: false,
        allowHydration: false,
        reason: 'rendered-boundary-capability-not-current',
        capability,
      };
    }
    const state = getChatPageUnitState();
    const startSentinel = state.sentinels.get(`${String(page.pageNum)}:start`) || null;
    const divider = state.pendingDividers.get(page.pageNum) || null;
    const flowRoot = (
      (startSentinel?.isConnected && startSentinel.parentElement)
      || (divider?.isConnected && divider.parentElement)
      || page.nativeStartSlot?.parentElement
      || page.exactStart?.wrapper?.parentElement
      || page.titleListRoot?.parentElement
      || page.earliest?.wrapper?.parentElement
      || page.latest?.wrapper?.parentElement
      || null
    );
    const resolved = resolveRenderedBoundaryWrapperFromCapability(flowRoot, capability);
    if (!resolved.ok) {
      return {
        applicable: true,
        ok: false,
        allowHydration: false,
        reason: resolved.reason,
        capability,
      };
    }
    return {
      applicable: true,
      ok: true,
      parent: flowRoot,
      before: resolved.wrapper,
      mode: 'rendered-boundary-authority',
      evidence: resolved.wrapper,
      capability,
    };
  }

  // The page-end sentinel must follow the page's exact terminal wrapper. The
  // generic artifact resolver tries the question identity first, so for a row
  // with an accepted answer it resolves to the question wrapper and would leave
  // the end sentinel sitting between that question and its own answer. Resolve
  // the terminal row by answer identity here; a row without an accepted answer
  // (NO ANSWER / stopped) keeps the generic result.
  function resolveChatPageTerminalArtifact(page = null) {
    if (typeof resolveChatPageExactArtifact !== 'function') return null;
    const records = Array.isArray(page?.records) ? page.records : [];
    const turn = records[records.length - 1]?.turn || null;
    if (!turn) return null;
    const answerId = String(turn.primaryAId || turn.answerId || '').trim();
    if (!answerId) return null;
    return resolveChatPageExactArtifact({ answerId, primaryAId: answerId });
  }

  function resolveChatPageBoundaryAnchor(model = null, page = null, kind = 'start') {
    if (!model || !page) return { ok: false, reason: 'page-unit-anchor-unavailable' };
    const isStart = kind !== 'end';
    const titleList = page.titleListRoot;
    if (isStart) {
      const renderedBoundary = typeof resolveRenderedBoundaryPageUnitAnchor === 'function'
        ? resolveRenderedBoundaryPageUnitAnchor(model, page)
        : { applicable: false };
      if (renderedBoundary.applicable) return renderedBoundary;
      if (page.nativeStartSlot?.parentNode) {
        return {
          ok: true,
          parent: page.nativeStartSlot.parentNode,
          before: page.nativeStartSlot,
          mode: 'exact-native-turn-slot',
          evidence: page.nativeStartSlot,
        };
      }
      if (page.exactStart?.wrapper?.parentNode) {
        return {
          ok: true,
          parent: page.exactStart.wrapper.parentNode,
          before: page.exactStart.wrapper,
          mode: 'exact-page-start',
          evidence: page.exactStart.wrapper,
        };
      }
      if (titleList?.parentNode) {
        return { ok: true, parent: titleList.parentNode, before: titleList, mode: 'exact-title-list', evidence: titleList };
      }
      if (page.earliest?.wrapper?.parentNode) {
        return {
          ok: true,
          parent: page.earliest.wrapper.parentNode,
          before: page.earliest.wrapper,
          mode: 'earliest-exact-page-artifact',
          evidence: page.earliest.wrapper,
        };
      }
      const previous = model.pages[page.pageNum - 2] || null;
      if (previous) {
        const previousEnd = getChatPageUnitState().sentinels.get(`${String(previous.pageNum)}:end`) || null;
        if (previousEnd?.isConnected && previousEnd.parentNode) {
          return {
            ok: true,
            parent: previousEnd.parentNode,
            before: previousEnd.nextSibling || null,
            mode: 'previous-page-end-sentinel',
            evidence: previousEnd,
          };
        }
        const previousTail = previous.titleListRoot?.parentNode
          ? previous.titleListRoot
          : (previous.latest?.wrapper?.parentNode ? previous.latest.wrapper : null);
        if (previousTail?.parentNode) {
          return {
            ok: true,
            parent: previousTail.parentNode,
            before: previousTail.nextSibling || null,
            mode: previous.titleListRoot ? 'previous-title-list-unit' : 'previous-latest-exact-artifact',
            evidence: previousTail,
          };
        }
      }
      const startSentinel = getChatPageUnitState().sentinels.get(`${String(page.pageNum)}:start`) || null;
      if (startSentinel?.isConnected && startSentinel.parentNode) {
        return {
          ok: true,
          parent: startSentinel.parentNode,
          before: startSentinel.nextSibling || null,
          mode: 'last-proven-page-start',
          evidence: startSentinel,
        };
      }
      return { ok: false, reason: 'page-unit-anchor-unavailable' };
    }
    const terminal = resolveChatPageTerminalArtifact(page);
    const terminalTail = terminal?.wrapper?.parentNode ? terminal.wrapper : null;
    // A final page proves its collapse range as [page start wrapper, page end
    // sentinel), so its end sentinel must stay after the exact terminal
    // wrapper. Collapsing that page inserts its own synthetic title list near
    // the page start; letting the list win here moved the sentinel ahead of the
    // terminal wrapper, which made the final-tail proof fail and caused the
    // committed transaction to be released by its own output. Earlier pages
    // keep the established title-list-first tail.
    const pageCount = Math.max(0, Number(model?.pageCount || 0) || 0);
    const isFinalPage = pageCount > 0 && Number(page.pageNum || 0) >= pageCount;
    const tail = (isFinalPage && terminalTail)
      ? terminalTail
      : (titleList?.parentNode
        ? titleList
        : (terminalTail || (page.latest?.wrapper?.parentNode ? page.latest.wrapper : null)));
    if (tail?.parentNode) {
      return {
        ok: true,
        parent: tail.parentNode,
        before: tail.nextSibling || null,
        mode: tail === terminalTail
          ? 'exact-terminal-page-artifact'
          : (tail === titleList ? 'title-list-end' : 'latest-exact-page-artifact'),
        evidence: tail,
      };
    }
    const endSentinel = getChatPageUnitState().sentinels.get(`${String(page.pageNum)}:end`) || null;
    if (endSentinel?.isConnected && endSentinel.parentNode) {
      return {
        ok: true,
        parent: endSentinel.parentNode,
        before: endSentinel.nextSibling || null,
        mode: 'last-proven-page-end',
        evidence: endSentinel,
      };
    }
    return { ok: false, reason: 'page-unit-anchor-unavailable' };
  }

  // Existing page-window materialization request only; this is not complete-
  // index navigation and does not scroll. Collapsed-page readiness never calls
  // this helper.
  function requestChatPageUnitHydration(page = null, reason = 'page-unit-anchor-unavailable') {
    if (!page) return false;
    const state = getChatPageUnitState();
    const key = `${state.identity}|${String(page.pageNum)}`;
    if (state.hydrationRequested.has(key)) return false;
    state.hydrationRequested.add(key);
    const first = page.records?.[0]?.turn || null;
    const id = String(
      first?.questionId
      || first?.qId
      || first?.answerId
      || first?.primaryAId
      || ''
    ).trim();
    if (!id) return false;
    const um = UM_PUBLIC();
    try {
      if (um?.requestMountPairByUid?.(id, `page-unit-ordering:${reason}`) === true) return true;
    } catch {}
    try {
      return um?.requestMountByUid?.(id, `page-unit-ordering:${reason}`) === true;
    } catch {
      return false;
    }
  }

  // Retired compatibility query for older page-hydration validators and
  // diagnostics. It resolves an authority-backed parking position but never
  // inserts or moves a divider; reconcileChatPageUnits remains the sole writer.
  function getAuthorityDividerParkingPosition(pageNum = 0) {
    const targetPage = Math.max(0, Number(pageNum) || 0);
    const turnList = Array.isArray(S.turnList) ? S.turnList : [];
    const authPairCount = turnList.length;
    const authPageCount = authPairCount > 0 ? Math.ceil(authPairCount / 25) : 0;
    if (targetPage < 1 || targetPage > authPageCount) return null;
    if (targetPage === 1) {
      const first = turnList[0] || null;
      const firstHost = first ? getChatPageTurnHost(first) : null;
      const firstAnchor = firstHost ? getChatPagePairAnchorNode(firstHost) : null;
      return firstAnchor?.parentNode
        ? { parent: firstAnchor.parentNode, before: firstAnchor, mode: 'authority-page-start' }
        : null;
    }
    const previousPage = targetPage - 1;
    let titleList = null;
    try {
      if (typeof document !== 'undefined') {
        titleList = document.querySelector(
          `[data-cgxui="chat-page-title-list-synth"][data-page-num="${String(previousPage)}"]`
        );
      }
    } catch {}
    if (titleList?.parentNode) {
      const parking = {
        parent: titleList.parentNode,
        before: titleList.nextSibling || null,
        mode: 'authority-previous-page-unit',
      };
      return { ...parking, mode: parking.mode || 'authority-parked' };
    }
    const previousEndIndex = Math.min(authPairCount, previousPage * 25) - 1;
    const previousEnd = turnList[previousEndIndex] || null;
    const previousHost = previousEnd ? getChatPageTurnHost(previousEnd) : null;
    const previousAnchor = previousHost ? getChatPagePairAnchorNode(previousHost) : null;
    if (!previousAnchor?.parentNode) return null;
    const parking = {
      parent: previousAnchor.parentNode,
      before: previousAnchor.nextSibling || null,
      mode: 'authority-previous-page-unit',
    };
    return { ...parking, mode: parking.mode || 'authority-parked' };
  }

  function getActualThreadPageDividers() {
    let candidates = [];
    try {
      candidates = Array.from(document.querySelectorAll(
        '.cgxui-chat-page-divider[data-page-num], .cgxui-pgnw-page-divider[data-page-num]'
      ));
    } catch {}
    return candidates.filter((divider) => {
      if (!divider?.isConnected) return false;
      try {
        if (divider.closest?.('#cgx-mm-root, .cgxui-mm-page-divider')) return false;
      } catch {}
      return true;
    });
  }

  function pageNumberOfThreadDivider(divider = null) {
    return Math.max(0, Number(
      divider?.getAttribute?.('data-page-num')
      || divider?.getAttribute?.(ATTR_CHAT_PAGE_NUM)
      || 0
    ) || 0);
  }

  // Exact form written by createChatPageBoundarySentinel: page-<n>-start /
  // page-<n>-end with a positive page number. Matching the exact production
  // form keeps foreign or host nodes that merely carry a similar attribute out
  // of scope.
  const CHAT_PAGE_BOUNDARY_SENTINEL_VALUE = /^page-[1-9][0-9]*-(?:start|end)$/;

  function isOwnedChatPageBoundarySentinel(node = null) {
    if (!node) return false;
    try {
      const value = String(node.getAttribute?.(CHAT_PAGE_BOUNDARY_ATTR) || '');
      if (!CHAT_PAGE_BOUNDARY_SENTINEL_VALUE.test(value)) return false;
      // The sentinel must also carry H2O's own owner stamp and its matching
      // page/kind attributes, so only nodes this module actually produced are
      // removable.
      if (String(node.getAttribute?.('data-cgxui-owner') || '') !== String(UI_TOK.OWNER)) return false;
      const page = String(node.getAttribute?.(CHAT_PAGE_BOUNDARY_PAGE_ATTR) || '');
      const kind = String(node.getAttribute?.(CHAT_PAGE_BOUNDARY_KIND_ATTR) || '');
      return value === `page-${page}-${kind}`;
    } catch {
      return false;
    }
  }

  function removeH2OChatPageUnitNode(node = null) {
    if (!node?.parentNode) return false;
    let owned = false;
    try {
      // '1' is the legacy divider-era boundary marker and is retained. The
      // sentinel branch is what page-unit cleanup was missing: sentinels store
      // page-N-start / page-N-end, never '1', so stale sentinels could never
      // be collected and went on serving as fallback anchor proof.
      owned = node.getAttribute?.(CHAT_PAGE_BOUNDARY_ATTR) === '1'
        || isOwnedChatPageBoundarySentinel(node)
        || node.classList?.contains('cgxui-chat-page-divider')
        || node.classList?.contains('cgxui-pgnw-page-divider');
    } catch {}
    if (!owned) return false;
    try {
      node.parentNode.removeChild(node);
      return true;
    } catch {
      return false;
    }
  }

  // Compatibility seam retained for page-ordering diagnostics. Authoritative
  // dividers are no longer detached on transient anchor loss.
  function detachDeferredChatPageDivider(divider = null, pageNum = 0) {
    if (!divider) return false;
    getChatPageUnitState().pendingDividers.set(Number(pageNum), divider);
    return false;
  }

  function setChatPageUnitAttributeIfChanged(node = null, name = '', value = null) {
    if (!node || !name) return false;
    try {
      if (value == null) {
        if (!node.hasAttribute?.(name)) return false;
        node.removeAttribute(name);
        return true;
      }
      const next = String(value);
      if (node.getAttribute?.(name) === next) return false;
      node.setAttribute(name, next);
      return true;
    } catch {
      return false;
    }
  }

  function enforceChatPageUnitOrder(model = null, candidatesByPage = new Map(), reason = 'reconcile', placeNode = null) {
    const state = getChatPageUnitState();
    const sentinelPlan = ensureChatPageBoundarySentinels(model);
    const stats = {
      reason: String(reason || 'reconcile'),
      identity: String(model?.identity || ''),
      source: String(model?.source || 'canonical'),
      count: Number(model?.count || 0),
      pageCount: Number(model?.pageCount || 0),
      created: 0,
      moved: 0,
      removed: 0,
      deferred: 0,
      hydrationRequests: 0,
      pages: [],
    };
    for (const stale of sentinelPlan.stale) {
      if (!stale?.parentNode) continue;
      if (removeH2OChatPageUnitNode(stale)) stats.removed += 1;
    }
    let previousPlaced = true;
    for (const page of Array.isArray(model?.pages) ? model.pages : []) {
      const pageNum = page.pageNum;
      const candidates = Array.isArray(candidatesByPage.get(pageNum))
        ? candidatesByPage.get(pageNum).filter(Boolean)
        : [];
      let divider = candidates.find((entry) => entry.classList?.contains('cgxui-chat-page-divider'))
        || candidates[0]
        || state.pendingDividers.get(pageNum)
        || null;
      if (!divider) {
        divider = createChatPageDivider(pageNum, getTurnPageBand(page.startOrder) || 'normal');
        stats.created += 1;
      }
      state.pendingDividers.set(pageNum, divider);
      for (const duplicate of candidates) {
        if (duplicate === divider) continue;
        if (removeH2OChatPageUnitNode(duplicate)) stats.removed += 1;
      }
      let anchor = previousPlaced
        ? resolveChatPageBoundaryAnchor(model, page, 'start')
        : { ok: false, reason: 'previous-page-unit-unresolved' };
      if (anchor.ok && pageNum > 1 && anchor.mode !== 'rendered-boundary-authority') {
        const previousEnd = state.sentinels.get(`${String(pageNum - 1)}:end`) || null;
        if (previousEnd?.isConnected && previousEnd.parentNode) {
          const anchorPrecedesPreviousEnd = anchor.parent !== previousEnd.parentNode
            || (anchor.before && (
              anchor.before === previousEnd
              || compareChatPageNodes(anchor.before, previousEnd) < 0
            ));
          if (anchorPrecedesPreviousEnd) {
            anchor = {
              ok: true,
              parent: previousEnd.parentNode,
              before: previousEnd.nextSibling || null,
              mode: 'previous-page-end-sentinel-clamp',
              evidence: previousEnd,
            };
          }
        }
      }
      if (!anchor.ok || !anchor.parent) {
        // Authority still owns this page. A transiently unavailable native
        // anchor must not delete or detach its sole divider. Keep a connected
        // divider exactly where the last proven reconciliation left it; the
        // existing non-scrolling page-window request may gather ordinary
        // remount evidence, but final movement remains deferred until exact.
        stats.deferred += 1;
        if (anchor.allowHydration !== false
          && requestChatPageUnitHydration(page, anchor.reason || 'page-unit-anchor-unavailable')) {
          stats.hydrationRequests += 1;
        }
        previousPlaced = false;
        stats.pages.push({
          pageNum,
          status: 'deferred',
          reason: anchor.reason || 'page-unit-anchor-unavailable',
          retained: divider?.isConnected === true,
        });
        continue;
      }
      const startSentinel = state.sentinels.get(`${String(pageNum)}:start`) || null;
      const endSentinel = state.sentinels.get(`${String(pageNum)}:end`) || null;
      if (placeNode?.(anchor.parent, divider, anchor.before || null)) stats.moved += 1;
      if (placeNode?.(anchor.parent, startSentinel, divider)) stats.moved += 1;
      const titleList = page.titleListRoot;
      if (titleList && page.nativeEndSlot?.parentNode) {
        const nativeParent = page.nativeEndSlot.parentNode;
        const nativeBefore = page.nextNativeStartSlot?.parentNode === nativeParent
          ? page.nextNativeStartSlot
          : (page.nativeEndSlot.nextSibling || null);
        // Host turn slots stay in their React-owned positions. Move only the
        // H2O title-list unit to the end of its hidden native range, so the
        // next page divider can sit immediately before its exact slot.
        if (placeNode?.(nativeParent, titleList, nativeBefore)) stats.moved += 1;
      } else if (titleList && divider.parentNode && divider.nextSibling !== titleList) {
        if (placeNode?.(divider.parentNode, titleList, divider.nextSibling || null)) stats.moved += 1;
      }
      const endAnchor = resolveChatPageBoundaryAnchor(model, page, 'end');
      if (endAnchor.ok && endAnchor.parent && endSentinel) {
        if (placeNode?.(endAnchor.parent, endSentinel, endAnchor.before || null)) stats.moved += 1;
      }
      const nextTestId = getNextTurnTestIdAfterDivider(divider);
      if (typeof setChatPageUnitAttributeIfChanged === 'function') {
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-authority-parked', null);
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-anchor-mode', anchor.mode || '');
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-next-testid', nextTestId || '');
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-order-owner', CHAT_PAGE_UNIT_OWNER);
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-order-ok', '1');
        setChatPageUnitAttributeIfChanged(divider, 'data-h2o-divider-order-repaired', '1');
      } else {
        try {
          divider.removeAttribute('data-h2o-divider-authority-parked');
          divider.setAttribute('data-h2o-divider-anchor-mode', anchor.mode || '');
          divider.setAttribute('data-h2o-divider-next-testid', nextTestId || '');
          divider.setAttribute('data-h2o-divider-order-owner', CHAT_PAGE_UNIT_OWNER);
          divider.setAttribute('data-h2o-divider-order-ok', '1');
          divider.setAttribute('data-h2o-divider-order-repaired', '1');
        } catch {}
      }
      previousPlaced = true;
      stats.pages.push({ pageNum, status: 'placed', mode: anchor.mode || '' });
    }
    for (const [pageNum, dividers] of candidatesByPage.entries()) {
      if (pageNum > model.pageCount || pageNum < 1) {
        for (const divider of dividers || []) {
          if (removeH2OChatPageUnitNode(divider)) stats.removed += 1;
        }
        state.pendingDividers.delete(pageNum);
      }
    }
    for (const [pageNum, divider] of Array.from(state.pendingDividers.entries())) {
      if (pageNum <= model.pageCount) continue;
      removeH2OChatPageUnitNode(divider);
      state.pendingDividers.delete(pageNum);
    }
    return stats;
  }

  // ── Stage 2C-2f: branch-transition withdrawal ──────────────────────────
  // A trusted native branch selection replaces the mounted conversation while
  // this module's turn list, and therefore its page model, still describes the
  // old branch. Placing units in that window moved the old Page 2 divider onto
  // a stale sentinel and showed PAGE 2 above an unrelated turn. The Core
  // already publishes the transition synchronously at trusted capture; page
  // units simply have to stop touching the DOM until authority agrees again.

  function chatPageUnitBranchTransitionActive() {
    const projection = getCompleteIndexProjectionStatus();
    // A current selected-path overlay IS the completed branch presentation:
    // stale scope and a retained click intent are its normal steady state,
    // not an open transition. Page units settle from the same effective
    // overlay index the MiniMap consumes; only genuinely pending owners
    // (request/confirmation leases, expansion containment) keep withdrawal.
    // The Core's branch transaction is the dominant owner: while it is
    // pending, page units stay withdrawn no matter what the other flags say.
    if (projection.branchTransactionPending === true) return true;
    const effective = getEffectivePresentationRuntimeStatus();
    const overlaySettled = effective.overlayActive === true
      && effective.source === 'selected-path-overlay'
      && effective.count > 0;
    if (overlaySettled) {
      return projection.branchExpansionPending === true
        || projection.branchExpansionFailClosed === true
        || projection.selectedPathRequestLeaseActive === true
        || projection.selectedPathConfirmationLeaseActive === true
        || projection.selectedPathConfirmationPending === true;
    }
    // trustedSelectionIntentActive and branchSelectionStale both begin in the
    // Core's synchronous trusted-capture path, before ChatGPT swaps content.
    // The lease flags arrive later and only extend the same window.
    return projection.trustedSelectionIntentActive === true
      || projection.branchSelectionStale === true
      || projection.branchExpansionPending === true
      || projection.branchExpansionFailClosed === true
      || projection.selectedPathRequestLeaseActive === true
      || projection.selectedPathConfirmationLeaseActive === true
      || projection.selectedPathConfirmationPending === true;
  }

  // Ordinary coherence remains count/fingerprint based. Only a keyed reverse
  // expansion checks the exact newly introduced native page heads through the
  // Pages Controller's accepted read-only primitive; unrelated virtualized
  // descendants remain outside this gate.
  function chatPageUnitPresentationCoherence(model = null) {
    const status = getEffectivePresentationRuntimeStatus();
    const projection = getCompleteIndexProjectionStatus();
    const modelCount = Math.max(0, Number(model?.count || 0) || 0);
    const authorityCount = Math.max(0, Number(status.effectiveCount || 0) || 0);
    const effectiveFingerprint = String(status.effectiveFingerprint || '');
    // Authority that cannot be read proves nothing. Incoherence has to be
    // positively demonstrated, otherwise a runtime without the effective index
    // would withdraw page units permanently.
    if (!effectiveFingerprint || authorityCount <= 0) {
      return { coherent: true, reason: 'authority-unavailable', modelCount, authorityCount };
    }
    if (modelCount !== authorityCount) {
      return { coherent: false, reason: 'effective-count-mismatch', modelCount, authorityCount };
    }
    const expansionActive = projection.branchExpansionPending === true
      || projection.branchExpansionFailClosed === true;
    const expectedFingerprint = String(projection.branchExpansionExpectedFingerprint || '');
    if (expansionActive && expectedFingerprint && effectiveFingerprint !== expectedFingerprint) {
      return { coherent: false, reason: 'effective-fingerprint-mismatch', modelCount, authorityCount };
    }
    const requiredPageNums = expansionActive
      ? (Array.isArray(projection.branchExpansionRequiredPageNums)
        ? projection.branchExpansionRequiredPageNums
        : [])
      : [];
    if (requiredPageNums.length) {
      const pagesApi = typeof getChatPagesControllerApi === 'function'
        ? getChatPagesControllerApi()
        : null;
      const resolve = pagesApi?.resolveNativePageHeadCoherence;
      if (typeof resolve !== 'function') {
        return { coherent: false, reason: 'native-page-head-unavailable', modelCount, authorityCount };
      }
      for (const pageNum of requiredPageNums) {
        let head = null;
        try { head = resolve.call(pagesApi, pageNum) || null; } catch { head = null; }
        const headState = String(head?.state || 'unavailable');
        if (headState === 'conflict') {
          return { coherent: false, reason: 'native-page-head-conflict', modelCount, authorityCount };
        }
        if (headState === 'absent') {
          return { coherent: false, reason: 'native-page-head-absent', modelCount, authorityCount };
        }
        if (headState !== 'match') {
          return { coherent: false, reason: 'native-page-head-unavailable', modelCount, authorityCount };
        }
      }
      if (projection.branchExpansionFailClosed === true) {
        return { coherent: false, reason: 'branch-expansion-fail-closed', modelCount, authorityCount };
      }
    } else if (projection.branchExpansionFailClosed === true) {
      return { coherent: false, reason: 'branch-expansion-fail-closed', modelCount, authorityCount };
    }
    return { coherent: true, reason: 'coherent', modelCount, authorityCount };
  }

  // Idempotent: every pass removes whatever H2O page-unit DOM is still
  // connected and drops the stale bookkeeping, so a second call finds nothing
  // and reports zero removals. Host conversation nodes are never touched -
  // removeH2OChatPageUnitNode only accepts H2O-owned dividers and sentinels.
  function withdrawChatPageUnits(reason = 'branch-transition') {
    const state = getChatPageUnitState();
    let removed = 0;
    for (const divider of getActualThreadPageDividers()) {
      if (removeH2OChatPageUnitNode(divider)) removed += 1;
    }
    for (const divider of Array.from(state.pendingDividers.values())) {
      if (removeH2OChatPageUnitNode(divider)) removed += 1;
    }
    try {
      for (const sentinel of Array.from(document.querySelectorAll(`[${CHAT_PAGE_BOUNDARY_ATTR}]`))) {
        if (removeH2OChatPageUnitNode(sentinel)) removed += 1;
      }
    } catch {}
    for (const sentinel of Array.from(state.sentinels.values())) {
      if (removeH2OChatPageUnitNode(sentinel)) removed += 1;
    }
    // Drop every reference tied to the withdrawn identity, so the next
    // coherent pass cannot reuse a stale divider or treat a stale sentinel as
    // proven placement.
    state.pendingDividers.clear();
    state.sentinels.clear();
    state.hydrationRequested.clear();
    state.identity = '';
    state.last = null;
    return { reason: String(reason || 'branch-transition'), removed };
  }

  function reconcileChatPageUnits(reason = 'reconcile') {
    const state = getChatPageUnitState();
    if (state.reconcileInFlight) {
      return state.last || {
        reason: String(reason || 'reconcile'),
        status: 'in-flight',
        created: 0,
        moved: 0,
        removed: 0,
      };
    }
    state.reconcileInFlight = true;
    try {
      const model = buildChatPageUnitModel();
      // Fail closed before anything is created, reused, moved or anchored.
      // Withdrawal runs inside the reconcileInFlight guard and schedules no
      // further work, so it cannot re-enter this function or drive observers.
      const transitionActive = chatPageUnitBranchTransitionActive();
      const coherence = chatPageUnitPresentationCoherence(model);
      if (transitionActive || coherence.coherent !== true) {
        const projection = getCompleteIndexProjectionStatus();
        const transitionReason = projection.branchExpansionFailClosed === true
          ? 'branch-expansion-fail-closed'
          : (projection.branchExpansionPending === true
            ? 'branch-expansion-pending'
            : 'branch-transition');
        const withdrawal = withdrawChatPageUnits(
          coherence.coherent !== true ? coherence.reason : transitionReason,
        );
        const preciseExpansionStatus = /^(?:native-page-head|branch-expansion)-/.test(withdrawal.reason);
        const stats = {
          reason: String(reason || 'reconcile'),
          identity: '',
          source: String(model?.source || 'canonical'),
          count: Number(model?.count || 0),
          pageCount: 0,
          created: 0,
          moved: 0,
          removed: withdrawal.removed,
          deferred: 0,
          hydrationRequests: 0,
          pages: [],
          order: [],
          ascending: true,
          placementRepairPending: 0,
          status: preciseExpansionStatus
            ? `${withdrawal.reason}-withdrawn`
            : 'branch-transition-withdrawn',
          withdrawn: true,
          withdrawalReason: withdrawal.reason,
          branchTransition: transitionActive,
          presentationCoherent: coherence.coherent === true,
        };
        // state.last stays null: a withdrawal is not a settled layout and must
        // never stand in as authority for the incoming presentation.
        if (typeof setChatPageUnitAttributeIfChanged === 'function') {
          setChatPageUnitAttributeIfChanged(
            document.documentElement,
            'data-h2o-page-unit-ordering-status',
            stats.status,
          );
          setChatPageUnitAttributeIfChanged(
            document.documentElement,
            'data-h2o-page-unit-ordering-count',
            '0',
          );
        } else {
          try {
            document.documentElement.setAttribute('data-h2o-page-unit-ordering-status', stats.status);
            document.documentElement.setAttribute('data-h2o-page-unit-ordering-count', '0');
          } catch {}
        }
        return stats;
      }
      const candidatesByPage = new Map();
      for (const divider of getActualThreadPageDividers()) {
        const pageNum = pageNumberOfThreadDivider(divider);
        if (!candidatesByPage.has(pageNum)) candidatesByPage.set(pageNum, []);
        candidatesByPage.get(pageNum).push(divider);
      }
      for (const [pageNum, divider] of state.pendingDividers.entries()) {
        if (!candidatesByPage.has(pageNum)) candidatesByPage.set(pageNum, []);
        if (!candidatesByPage.get(pageNum).includes(divider)) candidatesByPage.get(pageNum).push(divider);
      }
      // Sole final live-thread insertion/movement primitive. All render,
      // scroll, observer, refresh, authority and title-list repair paths reach
      // this closure through reconcileChatPageUnits.
      const placeNode = (parent = null, node = null, before = null) => {
        if (!parent || !node || before === node) return false;
        if (node.parentNode === parent && node.nextSibling === before) return false;
        try {
          parent.insertBefore(node, before || null);
          return true;
        } catch {
          return false;
        }
      };
      const stats = enforceChatPageUnitOrder(model, candidatesByPage, reason, placeNode);
      const orderedDividers = getActualThreadPageDividers()
        .map((divider) => ({ divider, pageNum: pageNumberOfThreadDivider(divider) }))
        .filter((entry) => entry.pageNum > 0 && entry.pageNum <= model.pageCount)
        .sort((a, b) => compareChatPageNodes(a.divider, b.divider));
      const order = orderedDividers.map((entry) => entry.pageNum);
      const ascending = order.every((pageNum, index) => index === 0 || order[index - 1] < pageNum);
      // Ascending divider order proves only that the pages appear in sequence.
      // Settled additionally requires every page unit to satisfy its exact
      // placement contract, which the rendered boundary is the authority on.
      // Without this a single-page layout whose units sat after their own
      // start wrapper still reported settled, because one divider is trivially
      // ascending and nothing was deferred.
      let placementRepairPending = 0;
      const placementApi = typeof getChatPagesControllerApi === 'function'
        ? getChatPagesControllerApi()
        : null;
      if (typeof placementApi?.getRenderedPageBoundaryCapability === 'function') {
        for (const page of Array.isArray(model?.pages) ? model.pages : []) {
          let capability = null;
          try {
            capability = placementApi.getRenderedPageBoundaryCapability(page.pageNum) || null;
          } catch { capability = null; }
          if (capability?.supported !== true) continue;
          if (
            capability.pageUnitOrderCurrent !== true
            || capability.placementRepairRequired === true
          ) placementRepairPending += 1;
        }
      }
      stats.placementRepairPending = placementRepairPending;
      stats.status = stats.deferred > 0
        ? 'page-unit-anchor-unavailable'
        : ((ascending && placementRepairPending === 0) ? 'settled' : 'page-unit-order-invalid');
      stats.order = order;
      stats.ascending = ascending;
      state.last = Object.freeze({
        ...stats,
        pages: Object.freeze(stats.pages.map((entry) => Object.freeze({ ...entry }))),
        order: Object.freeze(order.slice()),
      });
      if (typeof setChatPageUnitAttributeIfChanged === 'function') {
        setChatPageUnitAttributeIfChanged(
          document.documentElement,
          'data-h2o-page-unit-ordering-status',
          stats.status,
        );
        setChatPageUnitAttributeIfChanged(
          document.documentElement,
          'data-h2o-page-unit-ordering-count',
          String(model.pageCount),
        );
      } else {
        try {
          document.documentElement.setAttribute('data-h2o-page-unit-ordering-status', stats.status);
          document.documentElement.setAttribute('data-h2o-page-unit-ordering-count', String(model.pageCount));
        } catch {}
      }
      return state.last;
    } finally {
      state.reconcileInFlight = false;
    }
  }

  // Retired mover compatibility hook. It owns no placement primitive; legacy
  // callers delegate into the coherent page-unit coordinator.
  function forcePlaceDividerBeforeTurnWrapper(divider, pageNum) {
    void divider;
    const result = reconcileChatPageUnits(`legacy-divider-repair:page-${String(pageNum || 0)}`);
    return result?.status === 'settled';
  }

  // ChatGPT reparents turn wrappers after scroll/hydration, which can strand a
  // divider. Observe the flow container's childList (not subtree) and re-run
  // the verified placement, debounced. Guarded by dividerRenderInFlight so our
  // own insertions never retrigger the observer (no loop).
  let dividerRenderInFlight = false;
  let dividerOrderObserver = null;
  let dividerOrderObserverParent = null;
  let dividerOrderRepairTimer = 0;
  function scheduleDividerOrderRepair() {
    if (dividerRenderInFlight) return;
    try { W.clearTimeout(dividerOrderRepairTimer); } catch {}
    dividerOrderRepairTimer = W.setTimeout(() => {
      try { renderChatPageDividers(resolveChatId()); } catch {}
    }, 250);
  }
  function bindDividerOrderObserverOnce() {
    if (typeof MutationObserver !== 'function') return;
    let parent = null;
    try {
      const sec1 = document.querySelector('section[data-testid="conversation-turn-1"]');
      parent = sec1?.parentElement?.parentElement || sec1?.parentElement || null;
    } catch {}
    if (!parent || parent === dividerOrderObserverParent) return;
    if (dividerOrderObserver) { try { dividerOrderObserver.disconnect(); } catch {} }
    dividerOrderObserverParent = parent;
    try {
      dividerOrderObserver = new MutationObserver(() => scheduleDividerOrderRepair());
      dividerOrderObserver.observe(parent, { childList: true });
    } catch {}
  }

  function renderChatPageDividers(chatId = '') {
    bindDividerScrollRepairOnce();
    bindDividerOrderObserverOnce();
    dividerRenderInFlight = true;
    const perfOwned = enterPerfOwner('divider');
    const perfT0 = perfNow();
    try {
      const id = String(chatId || resolveChatId() || '').trim();
      // While pagination windowing owns the flow it renders its own inline
      // dividers and detaches off-window turns; teardown resets both flags, so
      // this is the reliable "leave pgnw dividers alone" signal.
      const paginationLiveState = getPaginationState();
      const paginationOwnsFlow = !!(paginationLiveState && paginationLiveState.booted && paginationLiveState.renderedOnce);
      const existingCoreDividers = qq(`.cgxui-chat-page-divider[data-cgxui-owner="${escAttr(UI_TOK.OWNER)}"]`);
      const keepCoreDividers = new Set();
      const { sections } = buildChatPageSections();
      if (!sections.size && !(Array.isArray(S.turnList) && S.turnList.length)) {
        for (const divider of existingCoreDividers) {
          try { divider.remove(); } catch {}
        }
        return false;
      }
      try { syncNoAnswerTitleBars(id); } catch {}
      let createdCount = 0;
      let reusedCount = 0;

      // Divider placement is anchored from the authoritative pair map, not
      // from whatever subset the section builder resolved this tick: the
      // first pair of Page N is canonical turn (N-1)*25, and its section
      // persists in the DOM even when content is unhydrated or the page is
      // collapsed. Sections remain the fallback and supply band/host state.
      const authPairCount = Array.isArray(S.turnList) ? S.turnList.length : 0;
      const authPageCount = authPairCount > 0 ? Math.ceil(authPairCount / 25) : 0;
      const renderPageNums = new Set();
      for (const section of sections.values()) {
        const n = Math.max(0, Number(section?.pageNum || 0) || 0);
        if (n > 0) renderPageNums.add(n);
      }
      for (let n = 1; n <= authPageCount; n += 1) renderPageNums.add(n);

      for (const pageNum of Array.from(renderPageNums).sort((a, b) => a - b)) {
        const section = sections.get(pageNum) || null;

        const hosts = Array.isArray(section?.hosts) ? section.hosts : [];
        const pageCollapsed = getChatPageSectionCollapsedState(pageNum, id, hosts);
        const band = String(section?.band || getTurnPageBand(((pageNum - 1) * 25) + 1) || 'normal');

        // Operator-exact page-start wrapper (section.parentElement). If the
        // page-start section is not in the DOM, skip creating a divider at a
        // guessed spot; an existing divider is left untouched (kept below).
        const startWrap = getPageStartTurnWrapper(pageNum);
        const geomHost = startWrap?.section || hosts[0] || null;

        // Reuse an existing divider candidate from anywhere in the DOM.
        // Creation is detached: reconcileChatPageUnits is the sole insertion
        // and movement owner for live thread dividers.
        let divider = qq(`.cgxui-chat-page-divider[data-cgxui-owner="${escAttr(UI_TOK.OWNER)}"][data-page-num="${String(pageNum)}"]`)[0]
          || qq(`.cgxui-pgnw-page-divider[data-page-num="${String(pageNum)}"]`)[0]
          || null;
        if (!divider) {
          divider = createChatPageDivider(pageNum, band);
          createdCount += 1;
          noteNodeLifecycle('created', 'chatPageDividers');
        } else {
          reusedCount += 1;
          noteNodeLifecycle('reused', 'chatPageDividers');
        }
        getChatPageUnitState().pendingDividers.set(pageNum, divider);
        // Dedup: exactly one core divider per page. The keep-by-page-count
        // rule below would otherwise preserve a stale duplicate.
        try {
          for (const d of qq(`.cgxui-chat-page-divider[data-cgxui-owner="${escAttr(UI_TOK.OWNER)}"][data-page-num="${String(pageNum)}"]`)) {
            if (d !== divider) { try { d.remove(); } catch {} }
          }
        } catch {}
        setChatPageDividerDomState(divider, pageCollapsed, pageNum, band, id);

        const coreOwnedDivider = !!divider.classList?.contains('cgxui-chat-page-divider');
        // Pagination-owned (pgnw) dividers are inline-managed by the windowing
        // render while windowing owns the flow; once windowing is torn down an
        // adopted pgnw divider is a stale leftover and must obey the same
        // verified anchor invariant as core dividers.
        if (coreOwnedDivider || !paginationOwnsFlow) {
          // Cross-family dedup: exactly one divider per page once windowing no
          // longer owns the flow (a stale pgnw twin would duplicate the label).
          if (!paginationOwnsFlow) {
            try {
              for (const d of qq(`.cgxui-pgnw-page-divider[data-page-num="${String(pageNum)}"]`)) {
                if (d !== divider) { try { d.remove(); } catch {} }
              }
            } catch {}
          }
          // Geometry is visual only (line spacing) — never moves the divider.
          if (geomHost) {
            try {
              const prevHost = getPreviousChatPageAnchorHost(geomHost);
              applyChatPageDividerGeometry(divider, prevHost, geomHost);
              applyChatPageDividerVisuals(divider, pageNum, id);
              requestAnimationFrame(() => {
                try {
                  // Reconcile through the sole ordering owner before visual
                  // geometry reads; this callback never decides placement.
                  reconcileChatPageUnits('renderChatPageDividers:raf');
                  const livePrevHost = getPreviousChatPageAnchorHost(geomHost);
                  applyChatPageDividerGeometry(divider, livePrevHost, geomHost);
                  applyChatPageDividerVisuals(divider, pageNum, id);
                } catch {}
              });
            } catch {}
          }
          if (coreOwnedDivider) keepCoreDividers.add(divider);
        }
      }

      const pageUnitResult = reconcileChatPageUnits('renderChatPageDividers');
      if (pageUnitResult?.created > 0) createdCount += Number(pageUnitResult.created || 0);
      if (pageUnitResult?.removed > 0) {
        PERF.dividerUi.removedCount = Number(PERF.dividerUi.removedCount || 0)
          + Number(pageUnitResult.removed || 0);
      }

      let removedCount = 0;
      for (const divider of existingCoreDividers) {
        if (keepCoreDividers.has(divider)) continue;
        // Never remove a divider whose page exists in the authoritative page
        // map just because its anchor could not be resolved this tick
        // (hydration churn, collapsed content). It keeps its current position
        // and gets re-anchored on a later render.
        const keepPageNum = Math.max(0, Number(divider?.getAttribute?.('data-page-num') || 0) || 0);
        if (keepPageNum && authPageCount > 0 && keepPageNum <= authPageCount) {
          keepCoreDividers.add(divider);
          continue;
        }
        // A collapsed page may have its content detached from the DOM, so its
        // hosts resolve to no usable anchor above — but the divider is the
        // page's only visible restore handle and must never be removed while
        // the page is collapsed.
        const dividerPageNum = keepPageNum;
        if (dividerPageNum && getChatPageSectionCollapsedState(dividerPageNum, id, [])) {
          keepCoreDividers.add(divider);
          continue;
        }
        removedCount += 1;
        try { divider.remove(); } catch {}
      }
      if (createdCount > 0) noteRenderUnit('chatPageDividers', createdCount);
      if (reusedCount > 0) noteRenderUnit('chatPageDividers', reusedCount);
      if (removedCount > 0) noteNodeLifecycle('removed', 'chatPageDividers', removedCount);
      PERF.dividerUi.createdCount = Number(PERF.dividerUi.createdCount || 0) + createdCount;
      PERF.dividerUi.reusedCount = Number(PERF.dividerUi.reusedCount || 0) + reusedCount;
      PERF.dividerUi.removedCount = Number(PERF.dividerUi.removedCount || 0) + removedCount;
      try { document.documentElement.setAttribute(ATTR_CHAT_PAGE_DIVIDERS, getChatPageDividersEnabled() ? '1' : '0'); } catch {}
      return true;
    } finally {
      // Clear on the next macrotask so the MutationObserver microtask that
      // fires from OUR own insertions this render still sees the flag set and
      // skips scheduling a redundant repair (prevents a render→observe loop).
      try { W.setTimeout(() => { dividerRenderInFlight = false; }, 0); } catch { dividerRenderInFlight = false; }
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.renderChatPageDividers, ms);
      if (perfOwned) {
        recordDuration(PERF.dividerUi, ms);
        noteSummaryBucket(PERF.dividerUi, 'renderChatPageDividers');
      }
      exitPerfOwner('divider');
    }
  }

  function centerOnPageDivider(pageNum, { smooth = true } = {}) {
    const label = getMiniMapPageDividerLabel(pageNum);
    if (!label) return false;
    return centerMiniMapNode(label, { smooth });
  }

  function updateToggleColor(anyId) {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const key = String(anyId || '').trim();
      if (!key) return false;
      const tg = toggleEl();
      if (!tg) return false;

      const turn = findTurnByAnyId(key);
      const btnId = String(turn?.turnId || key).trim();
      const primaryId = String(turn?.answerId || getBtnById(btnId)?.dataset?.primaryAId || '').trim();
      const washMap = (W?.H2O?.MM?.washMap && typeof W.H2O.MM.washMap === 'object') ? W.H2O.MM.washMap : {};
      const colorName = washMap[primaryId || btnId] || null;
      const raw = COLOR_BY_NAME[colorName] || colorName || '';
      tg.style.background = raw ? `color-mix(in srgb, ${raw} 30%, #2f2f2f)` : '#2f2f2f';
      return true;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.updateToggleColor, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'updateToggleColor');
      }
      exitPerfOwner('incremental');
    }
  }

  function applyToggleCounterPageBand(turnIndex = 0, total = 0) {
    const band = total > 0 ? getTurnPageBand(Math.max(1, Number(turnIndex || 1) || 1)) : 'normal';
    const tg = toggleEl();
    const tEl = toggleCountEl();
    if (tg) tg.setAttribute('data-page-band', band);
    if (tEl) tEl.setAttribute('data-page-band', band);
    return band;
  }

  function updateCounter(anyId = '') {
    const perfOwned = enterPerfOwner('incremental');
    const perfT0 = perfNow();
    try {
      const key = String(anyId || '').trim();

      // When pagination is active, the canonical turn list (S.turnList) only
      // contains answered turns (e.g. 34 for a 35-turn chat with one unanswered
      // question). Use H2O Core's turn total instead, which counts all Q+A pairs
      // including unanswered ones — giving the correct 35.
      const coreTurnTotal = Math.max(0, Number(W?.H2O?.turn?.total?.() || 0) || 0);
      const paginationEnabled = isPaginationWindowingEnabled();
      let total = Number(
        (paginationEnabled && coreTurnTotal > 0)
          ? coreTurnTotal
          : (S.turnList.length || coreTurnTotal || getAnswerEls().length || 0)
      );
      // Authoritative floor: ChatGPT keeps one <section data-turn="assistant">
      // per answered pair in the document even when content is virtualized.
      // Never display a smaller (subset-derived) count than that; while the
      // canonical list is still catching up, show the authoritative total
      // rather than a fake final subset count.
      let sectionPairTotal = 0;
      try { sectionPairTotal = document.querySelectorAll('[data-testid^="conversation-turn-"][data-turn="assistant"]').length; } catch {}
      if (sectionPairTotal > total) total = sectionPairTotal;

      let idx = Number(getTurnIndex(key));
      if (!idx && key.startsWith('turn:')) {
        const m = key.match(/(\d+)$/);
        if (m) idx = Number(m[1]) || 0;
      }
      if (!idx) idx = total > 0 ? 1 : 0;

      const cEl = counterEl();
      if (cEl) cEl.textContent = `Answer: ${idx}/${total}`;

      const tEl = toggleCountEl();
      if (tEl) {
        tEl.textContent = `${idx}/${total}`;
      }
      applyToggleCounterPageBand(idx, total);

      if (key) updateToggleColor(key);
      noteRenderUnit('counterUpdates');
      return true;
    } finally {
      const ms = perfNow() - perfT0;
      recordDuration(PERF.paths.updateCounter, ms);
      if (perfOwned) {
        recordDuration(PERF.incrementalRefresh, ms);
        noteSummaryBucket(PERF.incrementalRefresh, 'updateCounter');
      }
      exitPerfOwner('incremental');
    }
  }

  function resolveRebuildActiveId() {
    try {
      const fastBtn = S.lastActiveBtnEl;
      const fastId = String(fastBtn?.dataset?.turnId || fastBtn?.dataset?.id || '').trim();
      if (fastBtn?.isConnected && fastId) return fastId;
    } catch {}
    const fast = String(S.lastActiveTurnIdFast || '').trim();
    if (fast) return fast;
    try {
      const active = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
      const activeId = String(active?.dataset?.turnId || active?.dataset?.id || active?.dataset?.primaryAId || '').trim();
      if (activeId) return activeId;
    } catch {}
    const viewport = computeActiveFromViewport({});
    const viewportId = String(viewport?.activeTurnId || viewport?.activeAnswerId || '').trim();
    if (viewportId) return viewportId;
    const first = S.turnList[0] || null;
    return String(first?.turnId || first?.answerId || '').trim();
  }

  function clearMissingRebuildActiveIdentity(anyId = '') {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const turn = findTurnByAnyId(key);
    const targetTurnId = String(turn?.turnId || key).trim();
    if (!targetTurnId || getBtnById(targetTurnId)) return false;
    let cleared = false;
    const matchesMissingTarget = (value) => {
      const current = String(value || '').trim();
      return current === key || current === targetTurnId;
    };
    if (matchesMissingTarget(S.lastActiveTurnIdFast)) {
      S.lastActiveTurnIdFast = '';
      cleared = true;
    }
    if (matchesMissingTarget(S.lastActiveBtnId)) {
      S.lastActiveBtnId = '';
      cleared = true;
    }
    return cleared;
  }

  function applyRebuildActiveId(anyId = '', reason = 'core:rebuild') {
    const activeId = String(anyId || '').trim();
    let activated = false;
    if (activeId) {
      try {
        activated = setActive(activeId, `rebuild:${String(reason || 'core:rebuild')}`) === true;
      } catch {}
      if (activated) return true;
      clearMissingRebuildActiveIdentity(activeId);
    }
    try { updateCounter(''); } catch {}
    return false;
  }

  function finalizeRebuildUi(reason = 'core:rebuild') {
    const activeId = resolveRebuildActiveId();
    return applyRebuildActiveId(activeId, reason);
  }

  function syncActiveFromViewport(opts = {}) {
    const active = computeActiveFromViewport(opts);
    const id = String(active?.activeTurnId || active?.activeAnswerId || '').trim();
    if (!id) return active;

    if (opts?.center) centerOn(id, { force: false, smooth: true });
    else setActive(id, 'viewport-sync');

    if (opts?.relabel) {
      try { W.relabelMiniMap?.(); } catch {}
    }
    return Object.assign({}, active, { syncedId: id });
  }

  function resolveAnswerEl(target) {
    if (!target) return null;
    if (target && target.nodeType === 1) return target;
    const id = String(target || '').trim();
    if (!id) return null;
    try {
      const esc = escAttr(id);
      return q(`[data-message-id="${esc}"]`) ||
        q(`[data-cgxui-id="${esc}"]`) ||
        q(`[data-h2o-ans-id="${esc}"]`) ||
        q(`[data-h2o-core-id="${esc}"]`) ||
        // Fallback for no-answer title bars which carry data-answer-id with the synthetic id
        q(`[data-answer-id="${esc}"][${ANSWER_TITLE_NO_ANSWER_ATTR}="1"]`);
    } catch {
      return null;
    }
  }

  function parseFlashDurationMs(raw, fallback = 1600) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return fallback;
    if (s.endsWith('ms')) {
      const n = Number(s.slice(0, -2));
      return Number.isFinite(n) && n > 0 ? n : fallback;
    }
    if (s.endsWith('s')) {
      const n = Number(s.slice(0, -1));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : fallback;
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function getPageFlashDurationMs(target = null) {
    const fallback = 1600;
    const sources = [
      (target instanceof Element) ? target : null,
      document.documentElement,
    ].filter(Boolean);
    for (const source of sources) {
      try {
        const raw = String(getComputedStyle(source).getPropertyValue('--cgxui-mnmp-flash-ms') || '').trim();
        const ms = parseFlashDurationMs(raw, 0);
        if (ms > 0) return ms;
      } catch {}
    }
    return fallback;
  }

  function applyTempFlash(answerEl, opts = null) {
    const target = answerEl?.querySelector?.('[data-message-content]') || answerEl;
    if (!target) return false;
    try {
      const flashMs = Math.max(200, getPageFlashDurationMs(target) + 80);
      const surface = String(opts?.surface || 'answer').trim().toLowerCase() === 'question' ? 'question' : 'answer';
      const hadWrap = !!target.classList?.contains?.(FLASH_CLS.WASH_WRAP);
      const hadWrapLegacy = !!target.classList?.contains?.(FLASH_CLS.WASH_WRAP_LEGACY);
      const hasAnyWashTintClass = () => {
        const inlineBandColor = String(
          target.style?.getPropertyValue?.('--h2o-band-color')
          || target.style?.getPropertyValue?.('--cgxui-mnmp-band-color')
          || ''
        ).trim();
        const inlineBandOpacity = String(
          target.style?.getPropertyValue?.('--h2o-band-opacity')
          || target.style?.getPropertyValue?.('--cgxui-mnmp-band-opacity')
          || ''
        ).trim();
        if (inlineBandColor || inlineBandOpacity) return true;
        const classes = Array.from(target.classList || []);
        return classes.some((cls) => {
          if (!cls || cls === FLASH_CLS.WASH_WRAP || cls === FLASH_CLS.WASH_WRAP_LEGACY) return false;
          return cls.startsWith('cgxui-mnmp-wash-') || cls.startsWith('cgxui-wash-');
        });
      };
      target.classList?.add?.(FLASH_CLS.WASH_WRAP, FLASH_CLS.WASH_WRAP_LEGACY);
      target.classList?.remove?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY);
      try { target.removeAttribute('data-cgxui-flash'); } catch {}
      try { target.setAttribute('data-cgxui-flash-surface', surface); } catch {}
      void target.offsetWidth;
      target.classList?.add?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY);
      try { target.setAttribute('data-cgxui-flash', '1'); } catch {}
      setTimeout(() => {
        try { target.classList?.remove?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY); } catch {}
        try { target.removeAttribute('data-cgxui-flash'); } catch {}
        try { target.removeAttribute('data-cgxui-flash-surface'); } catch {}
        const keepWrap = hasAnyWashTintClass();
        if (!hadWrap && !keepWrap) {
          try { target.classList?.remove?.(FLASH_CLS.WASH_WRAP); } catch {}
        }
        if (!hadWrapLegacy && !keepWrap) {
          try { target.classList?.remove?.(FLASH_CLS.WASH_WRAP_LEGACY); } catch {}
        }
      }, flashMs);
      return true;
    } catch {
      return false;
    }
  }

  function flashAnswer(target) {
    const el = resolveAnswerEl(target);
    if (!el) return false;
    // Active/Selected Title-Bar Styling Rule: when the answer's flow is
    // hidden by page title-list mode, its relocated title bar in the stack
    // is the visible representation — the navigation flash must land there,
    // not on the hidden flow element.
    let flashTarget = el;
    try {
      const aId = String(getMessageId(el) || '').trim();
      if (aId) {
        const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(aId) : aId.replace(/"/g, '\\"');
        const stackedBar = document.querySelector(`[data-cgxui="atns-answer-title"][data-answer-id="${esc}"][data-h2o-in-title-stack]`);
        if (stackedBar) flashTarget = stackedBar;
      }
    } catch {}
    try { applyTempFlash(flashTarget); } catch {}
    try {
      const aId = String(getMessageId(el) || '').trim();
      if (aId) {
        const { SEL } = getRegs();
        const btn = q(SEL.MM_BTN_BY_PRIMARY_A_ID?.(aId) || '') ||
          q(SEL.MM_BTN_BY_ID?.(aId) || '') ||
          q(`[data-cgxui$="btn"][data-primary-a-id="${escAttr(aId)}"]`) ||
          q(`[data-cgxui$="btn"][data-id="${escAttr(aId)}"]`);
        if (btn) {
          try { btn.setAttribute('data-cgxui-flash', '1'); } catch {}
          setTimeout(() => { try { btn.removeAttribute('data-cgxui-flash'); } catch {} }, 1200);
        }
      }
    } catch {}
    return true;
  }

  function emitAnswersScan(reason = 'core') {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const EV = SH?.EV_ || SH?.registries?.EV || W?.H2O?.EV || {};
    const evtName = EV.ANSWERS_SCAN || 'evt:h2o:answers:scan';
    try { W.H2O?.bus?.emit?.('answers:scan', { reason }); } catch {}
    try { window.dispatchEvent(new CustomEvent(evtName, { detail: { reason } })); } catch {}
  }

  function behaviorApi() {
    try { return MM_behavior() || null; } catch { return null; }
  }

  function getBehavior(force = false) {
    const api = behaviorApi();
    try { return api?.get?.(!!force) || api?.defaults?.() || null; } catch { return null; }
  }

  function setBehavior(next, reason = 'core:setBehavior') {
    const api = behaviorApi();
    try { return api?.set?.(next, reason) || getBehavior(true); } catch { return getBehavior(true); }
  }

  function validateBehavior(next, opts = {}) {
    const api = behaviorApi();
    try { return api?.validate?.(next, opts) || api?.defaults?.() || null; } catch { return api?.defaults?.() || null; }
  }

  function makeRebuildResult(reason, status = 'not-ready') {
    return {
      ok: status === 'ok',
      status,
      reason: String(reason || 'core:rebuildNow'),
      built: {
        ui: false,
        turns: 0,
        buttons: false,
      },
      retry: {
        scheduled: false,
        count: Number(S.retryCount || 0),
        kind: String(S.retryKind || ''),
      },
    };
  }

  function clearRetry() {
    try { if (S.retryTimer) clearTimeout(S.retryTimer); } catch {}
    S.retryTimer = null;
    S.retryCount = 0;
    S.retryKind = '';
    S.retryReason = '';
  }

  function scheduleRetry(kind = 'retry', reason = 'core:retry') {
    if (S.retryTimer) return false;
    if (S.retryCount >= EMPTY_RETRY_MAX) return false;
    S.retryCount += 1;
    S.retryKind = String(kind || 'retry');
    S.retryReason = String(reason || S.rebuildReason || 'core:retry');
    const delay = Math.min(1400, EMPTY_RETRY_GAP_MS * (2 ** Math.max(0, S.retryCount - 1)));
    S.retryTimer = setTimeout(() => {
      S.retryTimer = null;
      const why = `${S.retryReason}:retry:${S.retryKind}:${S.retryCount}`;
      rebuildNow(why);
    }, delay);
    return true;
  }

  function ensureUiRefsForRebuild(reason = 'core:rebuildNow') {
    const ui = MM_ui();
    let refs = MM_uiRefs();
    const hasRefs = !!(refs?.root && refs?.panel);
    if (hasRefs) return { ui, refs, ready: true };
    try { ui?.ensureUI?.(`core:rebuildNow:${reason}`); } catch {}
    refs = MM_uiRefs();
    return { ui, refs, ready: !!(refs?.root && refs?.panel) };
  }

  function cancelScheduledRebuild() {
    const schedule = TOPW?.H2O?.runtime?.schedule || W?.H2O?.runtime?.schedule || null;
    if (schedule) {
      try { schedule.cancel('minimap:rebuild'); } catch {}
      try { schedule.cancel('minimap:rebuild:fallback'); } catch {}
    }
    if (S.rebuildRaf) {
      try { cancelAnimationFrame(S.rebuildRaf); } catch {}
      S.rebuildRaf = 0;
    }
    if (S.rebuildTimer) {
      try { clearTimeout(S.rebuildTimer); } catch {}
      S.rebuildTimer = null;
    }
  }

  function invalidateScheduledRebuild() {
    S.rebuildToken += 1;
    cancelScheduledRebuild();
  }

  function runScheduledRebuild(token) {
    if (!token || token !== S.rebuildToken) return false;
    // Consume this cycle token before running rebuild so correctness does not depend on rebuildNow internals.
    S.rebuildToken += 1;
    cancelScheduledRebuild();
    rebuildNow(S.rebuildReason);
    return true;
  }

  function mergeRebuildTurnCache(chatId, list, evidence, mergeFn = mergeTurnListWithCache) {
    try {
      const merged = mergeFn(chatId, list, evidence);
      if (!merged || !Array.isArray(merged.list) || !Array.isArray(merged.retainedList)) {
        throw new TypeError('invalid-cache-merge-result');
      }
      return { ok: true, merged, decision: merged.decision || null, persistence: null, error: null };
    } catch (error) {
      return {
        ok: false,
        merged: null,
        decision: Object.freeze({
          accepted: false,
          mode: 'refused',
          reason: 'cache-merge-failed',
          incomingCount: Array.isArray(list) ? list.length : 0,
          errorName: String(error?.name || 'Error').slice(0, 64),
        }),
        persistence: Object.freeze({
          ok: false,
          status: 'merge-failed',
          reason: 'cache-merge-failed',
          writesAttempted: 0,
        }),
        error,
      };
    }
  }

  function rebuildNow(reason = 'core:rebuildNow') {
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    const why = String(reason || 'core:rebuildNow');
    // Direct rebuild must run immediately and clear any pending scheduled handles.
    cancelScheduledRebuild();
    S.rebuildReason = why;
    if (S.rebuildInFlight) {
      S.rebuildReason = why;
      const queued = makeRebuildResult(why, 'queued');
      S.lastRebuildResult = queued;
      perfReportDuration('rebuildNow', perfT0, scanTick0, {
        reason: why,
        status: 'queued',
        turns: Number(S.turnList.length || 0),
      });
      return queued;
    }

    S.rebuildInFlight = true;
    let out = makeRebuildResult(why, 'not-ready');
    try {
      const ensured = ensureUiRefsForRebuild(why);
      out.built.ui = !!ensured.ready;
      if (!ensured.ready) {
        out.reason = 'ui-missing';
        out.retry.scheduled = scheduleRetry('ui-missing', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }
      applyMiniMapPageUiPrefs();

      const completeIndex = getCompleteIndexProjectionStatus();
      const effectivePresentation = getEffectivePresentationRuntimeStatus();
      const overlayActive = effectivePresentation.overlayActive === true
        && effectivePresentation.source === 'selected-path-overlay'
        && effectivePresentation.count > 0;
      if (completeIndex.enabled && !completeIndex.authoritative) {
        publishTurnSnapshot({
          list: [],
          byId: new Map(),
          byAId: new Map(),
          answerByTurn: new Map(),
          answers: [],
        });
        renderCompleteIndexBoundaryState(completeIndex.status);
        clearRetry();
        out.built.turns = 0;
        out.built.buttons = true;
        out.status = completeIndex.status;
        out.ok = true;
        out.reason = completeIndex.diagnosticStatus || completeIndex.status;
        S.lastRebuildResult = out;
        return out;
      }
      if (completeIndex.enabled) clearCompleteIndexBoundaryState();

      const snapshot = indexTurns({ commit: false });
      let list = Array.isArray(snapshot?.list) ? snapshot.list : [];
      let retainedListForPersistence = list;
      const expectedPresentationCount = overlayActive
        ? effectivePresentation.count
        : completeIndex.projectedCount;
      // Canonical-only regression contract: when no overlay is active this is
      // exactly the historical `list.length !== completeIndex.projectedCount`
      // boundary; the effective count is consulted only for proven overlays.
      if (completeIndex.enabled && list.length !== expectedPresentationCount) {
        publishTurnSnapshot({
          list: [],
          byId: new Map(),
          byAId: new Map(),
          answerByTurn: new Map(),
          answers: [],
        });
        renderCompleteIndexBoundaryState('full-index-unavailable');
        clearRetry();
        out.built.turns = 0;
        out.built.buttons = true;
        out.status = 'full-index-unavailable';
        out.ok = true;
        out.reason = overlayActive
          ? 'effective-presentation-count-mismatch'
          : 'complete-index-canonical-count-mismatch';
        S.lastRebuildResult = out;
        return out;
      }
      // Never let a subset re-index shrink the MiniMap: merge with the
      // per-chat turn cache before building buttons/publishing/saving.
      const mergeOutcome = completeIndex.enabled
        ? {
          ok: true,
          merged: {
            list: list.slice(),
            retainedList: list.slice(),
            decision: Object.freeze({
              accepted: true,
              mode: overlayActive ? 'effective-presentation' : 'complete-index-authority',
              reason: overlayActive ? 'selected-path-overlay' : 'host-payload-full-graph',
              incomingCount: list.length,
              retainedCount: list.length,
            }),
          },
          decision: Object.freeze({
            accepted: true,
            mode: overlayActive ? 'effective-presentation' : 'complete-index-authority',
            reason: overlayActive ? 'selected-path-overlay' : 'host-payload-full-graph',
            incomingCount: list.length,
            retainedCount: list.length,
          }),
          persistence: null,
          error: null,
        }
        : mergeRebuildTurnCache(resolveChatId(), list, snapshot.canonicalEvidence);
      if (!mergeOutcome.ok) {
        safeDiag('err', 'core.rebuildNow:mergeTurnCache', mergeOutcome.error);
        out.status = 'partial';
        out.reason = 'cache-merge-failed';
        out.cacheMerge = mergeOutcome.decision;
        out.cachePersistence = mergeOutcome.persistence;
        out.retry.scheduled = scheduleRetry('cache-merge-failed', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }
      const merged = mergeOutcome.merged;
      out.cacheMerge = mergeOutcome.decision;
      list = merged.list;
      retainedListForPersistence = merged.retainedList;
      snapshot.list = list;
      const byId = new Map();
      const byAId = new Map();
      for (const turn of list) {
        byId.set(turn.turnId, turn);
        if (turn.answerId) byAId.set(turn.answerId, turn.turnId);
      }
      snapshot.byId = byId;
      snapshot.byAId = byAId;
      out.built.turns = list.length;
      if (!out.built.turns) {
        out.reason = 'turns-empty';
        out.retry.scheduled = scheduleRetry('turns-empty', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }

      const rt = MM_rt();
      let map = null;
      let usedFallbackEnsureButtons = false;
      if (rt && typeof rt.ensureButtons === 'function') {
        try {
          map = rt.ensureButtons({
            reason: `core:${why}`,
            turns: list.slice(),
            refs: ensured.refs || {},
          }) || null;
        } catch (e) {
          safeDiag('err', 'core.rebuildNow:rt.ensureButtons', e);
        }
      }
      if (!(map instanceof Map)) {
        map = ensureTurnButtons(list, { skipActiveSync: true });
        usedFallbackEnsureButtons = true;
      }
      out.built.buttons = !!(map && map.size >= 0);
      if (!out.built.buttons) {
        out.status = 'partial';
        out.reason = 'buttons-missing';
        out.retry.scheduled = scheduleRetry('buttons-missing', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }
      publishTurnSnapshot(snapshot);
      if (!usedFallbackEnsureButtons) {
        try { repaintAllMiniBtns(); } catch {}
      }
      const activeId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
      try { applyRebuildActiveId(activeId, why); } catch {}
      try {
        const chatId = resolveChatId();
        if (chatId && !overlayActive) {
          out.cachePersistence = saveTurnCache(chatId, retainedListForPersistence, {
            reason: 'rebuild',
            liveRows: S.turnList,
            shrinkProof: out.cacheMerge?.mode === 'proven-shrink'
              ? out.cacheMerge?.shrinkProof
              : null,
          });
        } else if (chatId) {
          out.cachePersistence = Object.freeze({
            ok: true,
            status: 'selected-path-overlay-skipped',
            chatId,
            writesAttempted: 0,
          });
        }
      } catch {}
      clearRetry();
      try {
        const sh2 = TOPW.H2O_MM_SHARED?.get?.();
        if (sh2?.state) sh2.state.didEverBuildButtons = true;
      } catch {}
      try { W.H2O_MM_bindDelegatedHandlersOnce?.(); } catch {}
      emitAnswersScan(`core:${S.rebuildReason}`);

      out.status = 'ok';
      out.ok = true;
      out.reason = why;
      out.retry.scheduled = false;
      out.retry.count = 0;
      out.retry.kind = '';
      S.lastRebuildResult = out;
      return out;
    } catch (e) {
      safeDiag('err', 'core.rebuildNow', e);
      const failed = makeRebuildResult(why, 'error');
      failed.reason = 'error';
      failed.retry.scheduled = scheduleRetry('error', why);
      failed.retry.count = S.retryCount;
      failed.retry.kind = S.retryKind;
      S.lastRebuildResult = failed;
      return failed;
    } finally {
      S.rebuildInFlight = false;
      S.rebuildQueuedReason = '';
      perfReportDuration('rebuildNow', perfT0, scanTick0, {
        reason: why,
        status: String(S.lastRebuildResult?.status || out?.status || ''),
        turns: Number(S.lastRebuildResult?.built?.turns || out?.built?.turns || 0),
      });
    }
  }

  function clearEmptyRetry() {
    clearRetry();
    S.emptyRetryTimer = null;
    S.emptyRetryCount = 0;
  }

  function scheduleEmptyRetry(reason = 'core:empty') {
    scheduleRetry('turns-empty', reason);
  }

  function scheduleRebuild(reason = 'core:rebuild') {
    S.rebuildReason = String(reason || 'core:rebuild');
    perfMarkRebuildTrigger(S.rebuildReason);
    if (S.rebuildRaf || S.rebuildTimer) return true;
    const token = (S.rebuildToken += 1);
    const schedule = TOPW?.H2O?.runtime?.schedule || W?.H2O?.runtime?.schedule || null;
    if (schedule) {
      S.rebuildRaf = schedule.rafOnce('minimap:rebuild', () => { runScheduledRebuild(token); });
      S.rebuildTimer = schedule.timeoutOnce('minimap:rebuild:fallback', REBUILD_FALLBACK_MS, () => {
        runScheduledRebuild(token);
      });
      return true;
    }
    S.rebuildRaf = requestAnimationFrame(() => { runScheduledRebuild(token); });
    S.rebuildTimer = setTimeout(() => {
      runScheduledRebuild(token);
    }, REBUILD_FALLBACK_MS);
    return true;
  }

  function resnapshot(reason = 'core:resnapshot') {
    indexTurns();
    return S.turnList;
  }

  function refreshAnswers(reason = 'core:refreshAnswers') {
    return rebuildNow(reason);
  }

  function bindCompleteIndexStateListener() {
    if (S.completeIndexStateListenerBound) return true;
    S.completeIndexStateListener = (event) => {
      const status = String(event?.detail?.status || getCompleteIndexProjectionStatus().status || 'state');
      scheduleRebuild(`complete-index-state:${status}`);
    };
    try { W.addEventListener('evt:h2o:complete-turn-index:state', S.completeIndexStateListener); } catch {}
    S.completeIndexStateListenerBound = true;
    return true;
  }

  function unbindCompleteIndexStateListener() {
    if (!S.completeIndexStateListenerBound) return true;
    try { W.removeEventListener('evt:h2o:complete-turn-index:state', S.completeIndexStateListener); } catch {}
    S.completeIndexStateListener = null;
    S.completeIndexStateListenerBound = false;
    return true;
  }

  function initCore() {
    if (S.inited) return true;
    S.inited = true;
    indexTurns();
    syncCurrentViewArtifacts(true);
    applyMiniMapPageUiPrefs();
    bindMarginSymbolsBridge();
    bindWashBridge();
    bindViewBridge();
    bindChatPageMechanismsSettingsListener();
    bindCompleteIndexStateListener();
    return true;
  }

  function disposeCore() {
    invalidateScheduledRebuild();
    clearEmptyRetry();
    S.rebuildInFlight = false;
    S.rebuildQueuedReason = '';
    if (S.gutterSyncRaf) {
      try { cancelAnimationFrame(S.gutterSyncRaf); } catch {}
      S.gutterSyncRaf = 0;
    }
    S.gutterSyncQueue.clear();
    if (S.washRepaintRaf) {
      try { cancelAnimationFrame(S.washRepaintRaf); } catch {}
      S.washRepaintRaf = 0;
    }
    S.washRepaintQueue.clear();
    S.washRepaintAll = false;
    S.lastActiveBtnEl = null;
    S.lastActiveTurnIdFast = '';
    S.lastActiveBtnId = '';
    if (S.dividerDrag) {
      try { window.removeEventListener('pointermove', S.dividerDrag.move, true); } catch {}
      try { window.removeEventListener('pointerup', S.dividerDrag.up, true); } catch {}
      try { window.removeEventListener('pointercancel', S.dividerDrag.up, true); } catch {}
      S.dividerDrag = null;
    }
    unbindMarginSymbolsBridge();
    unbindWashBridge();
    unbindViewBridge();
    unbindChatPageMechanismsSettingsListener();
    unbindCompleteIndexStateListener();
    syncChatPageStatusCardSetting();
    S.inited = false;
    return true;
  }

  const CORE_PAGES_API = {
    getChatId: resolveChatId,
    getSections: buildChatPageSections,
    getRows: buildChatPageAnswerRows,
    findRowByAnswerId: findChatPageRowByAnswerId,
    renderDividers: renderChatPageDividers,
    buildPageUnitModel: buildChatPageUnitModel,
    reconcilePageUnits: reconcileChatPageUnits,
    getPageUnitDiagnostics: () => getChatPageUnitState().last,
    scheduleRebuild,
    setMiniMapPageCollapsed,
    toggleMiniMapPageCollapsed,
    getDividerPageNum: getChatPageDividerPageNum,
    // Single placement authority: the Thread Pages Controller anchors divider
    // repairs on this exact resolver so no second anchor semantics can exist.
    getPageStartTurnWrapper,
  };

  const CORE_API = {
    ver: CORE_VER,
    pages: CORE_PAGES_API,
    initCore,
    disposeCore,
    scheduleRebuild,
    rebuildNow,
    refreshAnswers,
    resnapshot,
    getTurnIndex,
    getTurns,
    refreshTurnsCache,
    resolveBtnId,
    turnIdxForAnswerEl,
    findMiniBtn,
    getTurnList,
    getTurnById,
    getBtnById,
    ensureTurnButtons,
    loadTurnCache,
    clearTurnCache,
    saveTurnCache,
    getCacheCompletenessDiagnostics,
    getCompleteIndexMiniMapDiagnostics,
    evaluateTransientCurrentOwnership,
    getManualDividers: getMiniDividers,
    getManualDividerById: getMiniDividerById,
    getManualDividerByAfterTurn: getMiniDividerByAfterTurn,
    getSelectedManualDividerId: getSelectedMiniDividerId,
    selectManualDivider: selectMiniDivider,
    createManualDivider: createMiniDivider,
    upsertManualDivider: upsertMiniDivider,
    removeManualDividerById: removeMiniDividerById,
    removeManualDividerByAfterTurn: removeMiniDividerByAfterTurn,
    renderManualDividerOverlay: renderMiniDividerOverlay,
    getMiniDividers,
    getMiniDividerById,
    getMiniDividerByAfterTurn,
    getSelectedMiniDividerId,
    selectMiniDivider,
    createMiniDivider,
    upsertMiniDivider,
    removeMiniDividerById,
    removeMiniDividerByAfterTurn,
    renderMiniDividerOverlay,
    getMiniMapPageLabelStyle,
    setMiniMapPageLabelStyle,
    getMiniMapPageDividersEnabled,
    setMiniMapPageDividersEnabled,
    getChatPageDividersEnabled,
    setChatPageDividersEnabled,
    renderChatPageDividers,
    buildChatPageUnitModel,
    reconcileChatPageUnits,
    getChatPageUnitDiagnostics: () => getChatPageUnitState().last,
    ensureChatPageDividerBridge,
    isChatPageCollapsed,
    setChatPageCollapsed,
    toggleChatPageCollapsed,
    getMiniMapCollapsedPages,
    isMiniMapPageCollapsed,
    setMiniMapPageCollapsed,
    toggleMiniMapPageCollapsed,
    applyMiniMapPageUiPrefs,
    renderFromCache,
    validateTurnsAgainstPagination,
    hydrateIndexFromDisk,
    renderFromIndex,
    appendTurnFromAnswerEl,
    attachVisibleAnswers,
    repaintMiniBtnByAnswerId,
    repaintAllMiniBtns,
    updateMiniMapGutterSymbol,
    syncMiniMapGutterForAnswer,
    scheduleMiniMapGutterSync,
    setActive,
    centerOn,
    centerOnPageDivider,
    updateCounter,
    updateToggleColor,
    syncActiveFromViewport,
    computeActiveFromViewport,
    applyTempFlash,
    flashAnswer,
    getAnswerList: () => S.answerEls.slice(),
    getBehavior,
    setBehavior,
    validateBehavior,
  };

  function installGlobalApi() {
    const resolveAnyId = (firstArg) => {
      if (typeof firstArg === 'string' || typeof firstArg === 'number') return String(firstArg);
      const ds = firstArg?.dataset || null;
      return String(
        ds?.id ||
        ds?.turnId ||
        ds?.primaryAId ||
        firstArg?.id ||
        firstArg?.turnId ||
        firstArg?.answerId ||
        firstArg?.activeTurnId ||
        ''
      ).trim();
    };
    const installAliasesOn = (T) => {
      if (!T) return;
      T.H2O_MM_getAnswersSafe = () => CORE_API.getAnswerList();
      T.getAnswers = () => CORE_API.getAnswerList();
      T.H2O_MM_getTurns = (...args) => CORE_API.getTurns?.(...args);
      T.H2O_MM_refreshTurnsCache = (...args) => CORE_API.refreshTurnsCache?.(...args);
      T.H2O_MM_resolveBtnId = (...args) => CORE_API.resolveBtnId?.(...args);
      T.H2O_MM_turnIdxForAnswerEl = (...args) => CORE_API.turnIdxForAnswerEl?.(...args);
      T.H2O_MM_findMiniBtn = (...args) => CORE_API.findMiniBtn?.(...args);
      T.H2O_MM_updateMiniMapGutterSymbol = (...args) => CORE_API.updateMiniMapGutterSymbol?.(...args);
      T.setActiveMiniMapButton = (...args) => {
        const id = resolveAnyId(args[0]);
        return id ? CORE_API.setActive(id, 'legacy-global') : false;
      };
      T.centerMiniMapOnId = (...args) => {
        const id = resolveAnyId(args[0]);
        const opts = (args[1] && typeof args[1] === 'object') ? args[1] : {};
        return id ? CORE_API.centerOn(id, opts) : false;
      };
      T.updateCounterToId = (id) => CORE_API.updateCounter(resolveAnyId(id));
      T.updateToggleColorById = (id) => CORE_API.updateToggleColor(resolveAnyId(id));
      T.updateActiveMiniMapBtn = (arg = {}) => {
        const opts = (arg && typeof arg === 'object' && !Array.isArray(arg)) ? arg : {};
        return CORE_API.syncActiveFromViewport(opts);
      };
      T.H2O_MM_repaintMiniBtnByAnswerId = (...args) => CORE_API.repaintMiniBtnByAnswerId(...args);
      T.H2O_MM_repaintAllMiniBtns = (...args) => CORE_API.repaintAllMiniBtns(...args);
      T.applyTempFlash = (...args) => CORE_API.applyTempFlash(...args);
      T.flashAnswer = (...args) => CORE_API.flashAnswer(...args);
      if (typeof T.updateMiniMapGutterSymbol !== 'function') {
        T.updateMiniMapGutterSymbol = (...args) => CORE_API.updateMiniMapGutterSymbol?.(...args);
      }
      if (typeof T.H2O_MM_coreRebuildNow !== 'function') {
        T.H2O_MM_coreRebuildNow = (...args) => CORE_API.rebuildNow(...args);
      }
      if (typeof T.H2O_MM_coreScheduleRebuild !== 'function') {
        T.H2O_MM_coreScheduleRebuild = (...args) => CORE_API.scheduleRebuild(...args);
      }
      if (typeof T.enhanceAll !== 'function') {
        T.enhanceAll = () => CORE_API.rebuildNow('main:shim');
      }
      if (typeof T.h2oEnhanceAll !== 'function') {
        T.h2oEnhanceAll = (..._args) => T.enhanceAll();
      }
      if (typeof T.h2oRebuildMiniMap !== 'function') {
        T.h2oRebuildMiniMap = (..._args) => T.enhanceAll();
      }
    };
    installAliasesOn(TOPW);
    if (W !== TOPW) installAliasesOn(W);
    try { TOPW.H2O_MM_CORE_PLUGIN = true; } catch {}
    try { TOPW.H2O_MM_CORE_VER = CORE_VER; } catch {}
    try { TOPW.H2O_MM_CORE_READY = true; } catch {}
    // Expose CORE_API directly so Engine's multi-fallback resolver can always
    // reach it even when the shared kernel bridge is temporarily unavailable.
    try { TOPW.H2O_MM_CORE_API = CORE_API; } catch {}
    if (W !== TOPW) { try { W.H2O_MM_CORE_API = CORE_API; } catch {} }
  }

  function installIntoKernelShared() {
    try {
      const root = TOPW.H2O_MM_SHARED;
      if (!root || typeof root !== 'object') return false;
      root.api = (root.api && typeof root.api === 'object') ? root.api : {};
      root.api.core = CORE_API;
      root.api.rt = root.api.rt || null;
      root.api.ui = root.api.ui || null;
      const vaultApi = TOPW?.H2O?.MM?.mnmp?.api;
      if (vaultApi && typeof vaultApi === 'object') {
        vaultApi.core = CORE_API;
        vaultApi.rt = vaultApi.rt || null;
        vaultApi.ui = vaultApi.ui || null;
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearInstallTimer() {
    try { if (S.installTimer) clearTimeout(S.installTimer); } catch {}
    S.installTimer = null;
  }

  function scheduleInstallRetry() {
    clearInstallTimer();
    S.installTimer = setTimeout(() => {
      S.installTries += 1;
      const ok = installIntoKernelShared();
      if (ok) return;
      if (S.installTries >= MAX_TRIES) {
        warn('Kernel shared bridge not found; Core kept global-only.', { tries: S.installTries });
        return;
      }
      scheduleInstallRetry();
    }, GAP_MS);
  }

  installGlobalApi();
  initCore();
  if (!installIntoKernelShared()) scheduleInstallRetry();
})();
