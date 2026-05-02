// ==UserScript==
// @h2o-id             0c1a.pagination.windowing
// @name               0C1a.⬛️🪟 Pagination Windowing Engine 🪟
// @namespace          H2O.Premium.CGX.pagination.windowing
// @author             HumamDev
// @version            1.1.0
// @revision           002
// @build              260328-002627
// @description        Engine facade for client-side answer pagination/windowing. Preserves the existing window.H2O_Pagination contract while delegating ChatGPT DOM/render work to the chat adapter.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Pagination Windowing Engine (Pass 1 structural split)
   * Owns the shared vault, persisted config, public API registration, and the
   * engine↔adapter seam. ChatGPT DOM/render behavior lives in 0B2b.
   * ========================================================================== */

  const TOK = 'PW';
  const PID = 'pgnwndw';
  const CID = 'paginationw';
  const SkID = 'pgnw';
  const MODTAG = 'PaginationWEngine';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const DsID = PID;
  const BrID = PID;

  const CFG_ENABLED_DEFAULT = true;
  const CFG_PAGE_SIZE_DEFAULT = 25;
  const CFG_PAGE_SIZE_MIN = 5;
  const CFG_PAGE_SIZE_MAX = 200;
  const CFG_BUFFER_DEFAULT = 10;
  const CFG_BUFFER_MIN = 0;
  const CFG_BUFFER_MAX = 80;
  const CFG_AUTO_LOAD_SENTINEL_DEFAULT = false;
  const CFG_SHORTCUTS_ENABLED_DEFAULT = true;

  const EV_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EV_CFG_CHANGED = 'evt:h2o:pagination:configchanged';

  const NS_MEM = `${TOK}:${PID}:guard`;
  const KEY_BOOT = `${NS_MEM}:booted`;
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const KEY_RUNTIME_CFG = `${NS_DISK}:pagination:cfg:v1`;
  const KEY_DIAG_CFG = `${NS_DISK}:pagination:diag:v1`;
  const DIAG_STYLE_MODES = new Set(['normal', 'off', 'conservative']);
  const DIAG_SWAP_MODES = new Set(['root', 'view']);

  const RUNTIME_DEFAULT = Object.freeze({
    enabled: CFG_ENABLED_DEFAULT,
    pageSize: CFG_PAGE_SIZE_DEFAULT,
    bufferAnswers: CFG_BUFFER_DEFAULT,
    autoLoadSentinel: CFG_AUTO_LOAD_SENTINEL_DEFAULT,
    shortcutsEnabled: CFG_SHORTCUTS_ENABLED_DEFAULT,
  });

  const DIAG_DEFAULT = Object.freeze({
    styleMode: 'normal',
    swapMode: 'root',
    debug: false,
    useObserverHub: true,
  });

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});

  VAULT.meta = VAULT.meta || {
    tok: TOK,
    pid: PID,
    cid: CID,
    skid: SkID,
    modtag: MODTAG,
    suite: SUITE,
    host: HOST,
  };
  VAULT.meta.role = 'engine';
  VAULT.state = VAULT.state || {};

  const S = VAULT.state;
  S.booted = !!S.booted;
  S.root = S.root || null;
  S.fullRoot = S.fullRoot || null;
  S.rootObserver = S.rootObserver || null;
  S.rootObservedEl = S.rootObservedEl || null;
  S.startObserver = S.startObserver || null;
  S.autoLoadObserver = S.autoLoadObserver || null;
  S.autoLoadLastAt = Number(S.autoLoadLastAt || 0);
  S.refreshTimer = Number(S.refreshTimer || 0);
  S.renderSuppressUntil = Number(S.renderSuppressUntil || 0);
  S.pendingRefreshReason = S.pendingRefreshReason || '';
  S.pendingAddedTurnNodes = (S.pendingAddedTurnNodes instanceof Set) ? S.pendingAddedTurnNodes : new Set();
  S.suppressObserverUntil = Number(S.suppressObserverUntil || 0);
  S.deferredRefreshNeeded = !!S.deferredRefreshNeeded;
  S.deferredRefreshTimer = Number(S.deferredRefreshTimer || 0);
  S.lastVisibleRefreshAt = Number(S.lastVisibleRefreshAt || 0);
  S.chatId = S.chatId || '';
  S.recoveryAttemptedChatId = S.recoveryAttemptedChatId || '';
  S.hasMaster = !!S.hasMaster;
  S.needsRestorePage = (S.needsRestorePage !== false);
  S.masterTurns = Array.isArray(S.masterTurns) ? S.masterTurns : (Array.isArray(S.turns) ? S.turns : []);
  S.masterAnswers = Array.isArray(S.masterAnswers) ? S.masterAnswers : (Array.isArray(S.answers) ? S.answers : []);
  S.masterTurnUnits = Array.isArray(S.masterTurnUnits) ? S.masterTurnUnits : (Array.isArray(S.canonicalTurns) ? S.canonicalTurns : S.masterAnswers);
  S.masterTurnNodeSet = (S.masterTurnNodeSet instanceof Set) ? S.masterTurnNodeSet : ((S.turnNodeSet instanceof Set) ? S.turnNodeSet : new Set());
  S.masterUidToTurn = (S.masterUidToTurn instanceof Map) ? S.masterUidToTurn : ((S.uidToTurn instanceof Map) ? S.uidToTurn : new Map());
  S.turns = S.masterTurns;
  S.answers = S.masterAnswers;
  S.turnUnits = S.masterTurnUnits;
  S.canonicalTurns = S.masterTurnUnits;
  S.turnNodeSet = S.masterTurnNodeSet;
  S.uidToTurn = S.masterUidToTurn;
  S.pageIndex = Number.isFinite(S.pageIndex) ? S.pageIndex : 0;
  S.pageCount = Number.isFinite(S.pageCount) ? S.pageCount : 1;
  S.viewTurnIndices = Array.isArray(S.viewTurnIndices) ? S.viewTurnIndices : (Array.isArray(S.visibleTurnIndices) ? S.visibleTurnIndices : []);
  S.viewTurnIndexSet = (S.viewTurnIndexSet instanceof Set) ? S.viewTurnIndexSet : new Set(S.viewTurnIndices);
  S.visibleTurnIndices = Array.isArray(S.visibleTurnIndices) ? S.visibleTurnIndices : S.viewTurnIndices;
  S.visibleTurnStart = Number.isFinite(S.visibleTurnStart) ? S.visibleTurnStart : -1;
  S.visibleTurnEnd = Number.isFinite(S.visibleTurnEnd) ? S.visibleTurnEnd : -1;
  S.lastWindow = S.lastWindow || null;
  S.ui = S.ui || {};
  S.ui.topBox = S.ui.topBox || null;
  S.ui.topBtn = S.ui.topBtn || null;
  S.ui.bottomBox = S.ui.bottomBox || null;
  S.ui.bottomBtn = S.ui.bottomBtn || null;
  S.ui.viewBox = S.ui.viewBox || null;
  S.ui.appliedStyleMode = S.ui.appliedStyleMode || '';
  S.onTopClick = S.onTopClick || null;
  S.onBottomClick = S.onBottomClick || null;
  S.onPopState = S.onPopState || null;
  S.onHashChange = S.onHashChange || null;
  S.onVisibilityChange = S.onVisibilityChange || null;
  S.onKeyDown = S.onKeyDown || null;
  S.runtimeConfig = S.runtimeConfig || null;
  S.commandBarBindTimer = Number(S.commandBarBindTimer || 0);
  S.commandBarBound = !!S.commandBarBound;
  S.commandBarApi = S.commandBarApi || null;
  S.isRendering = !!S.isRendering;
  S.isRebuilding = !!S.isRebuilding;
  S.renderedOnce = !!S.renderedOnce;
  S.renderSwapCount = Number.isFinite(S.renderSwapCount) ? S.renderSwapCount : 0;
  S.swapFallbackLogged = !!S.swapFallbackLogged;
  S.lastAppliedSwapMode = String(S.lastAppliedSwapMode || '');
  S.offObsReady = (typeof S.offObsReady === 'function') ? S.offObsReady : null;
  S.offObsMut = (typeof S.offObsMut === 'function') ? S.offObsMut : null;
  S.diagConfig = S.diagConfig || null;

  function toInt(val, fallback) {
    const n = Number.parseInt(String(val ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampInt(val, min, max, fallback) {
    const n = toInt(val, fallback);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeRuntimeConfig(input, base = RUNTIME_DEFAULT) {
    const src = (input && typeof input === 'object') ? input : {};
    const merged = Object.assign({}, base || RUNTIME_DEFAULT, src);
    return {
      enabled: merged.enabled !== false,
      pageSize: clampInt(merged.pageSize, CFG_PAGE_SIZE_MIN, CFG_PAGE_SIZE_MAX, CFG_PAGE_SIZE_DEFAULT),
      bufferAnswers: clampInt(merged.bufferAnswers, CFG_BUFFER_MIN, CFG_BUFFER_MAX, CFG_BUFFER_DEFAULT),
      autoLoadSentinel: !!merged.autoLoadSentinel,
      shortcutsEnabled: merged.shortcutsEnabled !== false,
    };
  }

  function readRuntimeConfig() {
    try {
      const raw = W.localStorage?.getItem?.(KEY_RUNTIME_CFG);
      if (!raw) return { ...RUNTIME_DEFAULT };
      const parsed = JSON.parse(raw);
      return normalizeRuntimeConfig(parsed, RUNTIME_DEFAULT);
    } catch (_) {
      return { ...RUNTIME_DEFAULT };
    }
  }

  function writeRuntimeConfig(cfg) {
    try {
      const clean = normalizeRuntimeConfig(cfg, RUNTIME_DEFAULT);
      W.localStorage?.setItem?.(KEY_RUNTIME_CFG, JSON.stringify(clean));
      return clean;
    } catch (_) {
      return normalizeRuntimeConfig(cfg, RUNTIME_DEFAULT);
    }
  }

  function getRuntimeConfigCopy() {
    const base = S.runtimeConfig || RUNTIME_DEFAULT;
    return {
      enabled: base.enabled !== false,
      pageSize: clampInt(base.pageSize, CFG_PAGE_SIZE_MIN, CFG_PAGE_SIZE_MAX, CFG_PAGE_SIZE_DEFAULT),
      bufferAnswers: clampInt(base.bufferAnswers, CFG_BUFFER_MIN, CFG_BUFFER_MAX, CFG_BUFFER_DEFAULT),
      autoLoadSentinel: !!base.autoLoadSentinel,
      shortcutsEnabled: base.shortcutsEnabled !== false,
    };
  }

  function normalizeDiagConfig(input, base = DIAG_DEFAULT) {
    const src = (input && typeof input === 'object') ? input : {};
    const merged = Object.assign({}, base || DIAG_DEFAULT, src);
    const styleMode = DIAG_STYLE_MODES.has(String(merged.styleMode || '')) ? String(merged.styleMode) : DIAG_DEFAULT.styleMode;
    const swapMode = DIAG_SWAP_MODES.has(String(merged.swapMode || '')) ? String(merged.swapMode) : DIAG_DEFAULT.swapMode;
    const debug = !!merged.debug;
    const useObserverHub = merged.useObserverHub !== false;
    return { styleMode, swapMode, debug, useObserverHub };
  }

  function readDiagConfig() {
    try {
      const raw = W.localStorage?.getItem?.(KEY_DIAG_CFG);
      if (!raw) return { ...DIAG_DEFAULT };
      const parsed = JSON.parse(raw);
      return normalizeDiagConfig(parsed, DIAG_DEFAULT);
    } catch (_) {
      return { ...DIAG_DEFAULT };
    }
  }

  function writeDiagConfig(cfg) {
    try {
      const clean = normalizeDiagConfig(cfg, DIAG_DEFAULT);
      W.localStorage?.setItem?.(KEY_DIAG_CFG, JSON.stringify(clean));
      return clean;
    } catch (_) {
      return normalizeDiagConfig(cfg, DIAG_DEFAULT);
    }
  }

  function getDiagConfigCopy() {
    const base = S.diagConfig || DIAG_DEFAULT;
    return {
      styleMode: base.styleMode,
      swapMode: base.swapMode,
      debug: !!base.debug,
      useObserverHub: base.useObserverHub !== false,
    };
  }

  function stableHash36(input) {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  }

  function getChatId() {
    const path = String(location.pathname || '/');
    const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    return `path_${stableHash36(`${location.origin}${path}${location.search || ''}`)}`;
  }

  function paginationAdapter() {
    return (VAULT.chatAdapter && typeof VAULT.chatAdapter === 'object') ? VAULT.chatAdapter : null;
  }

  function getPageSize() {
    return getRuntimeConfigCopy().pageSize;
  }

  function getBufferAnswers() {
    return getRuntimeConfigCopy().bufferAnswers;
  }

  function isAutoLoadSentinelEnabled() {
    return !!getRuntimeConfigCopy().autoLoadSentinel;
  }

  function areShortcutsEnabled() {
    return !!getRuntimeConfigCopy().shortcutsEnabled;
  }

  function isFeatureEnabled() {
    return getRuntimeConfigCopy().enabled !== false;
  }

  function safeDispatch(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function getPageInfoFallback() {
    return {
      chatId: S.chatId || getChatId(),
      pageIndex: Number(S.pageIndex || 0),
      pageCount: Math.max(1, Number(S.pageCount || 1)),
      enabled: isFeatureEnabled(),
      pageSize: getPageSize(),
      bufferAnswers: getBufferAnswers(),
      autoLoadSentinel: isAutoLoadSentinelEnabled(),
      shortcutsEnabled: areShortcutsEnabled(),
      totalTurns: Array.isArray(S.masterTurns) ? S.masterTurns.length : 0,
      totalAnswers: Array.isArray(S.masterAnswers) ? S.masterAnswers.length : 0,
      answerRange: null,
      bufferedAnswerRange: null,
      turnRange: { startGid: 0, endGid: 0 },
    };
  }

  function getPageInfo() {
    const adapter = paginationAdapter();
    if (adapter && typeof adapter.getPageInfo === 'function') {
      return adapter.getPageInfo();
    }
    return getPageInfoFallback();
  }

  function getDiagConfig() {
    return getDiagConfigCopy();
  }

  function getConfig() {
    const runtime = getRuntimeConfigCopy();
    const diag = getDiagConfigCopy();
    return {
      enabled: runtime.enabled !== false,
      pageSize: runtime.pageSize,
      bufferAnswers: runtime.bufferAnswers,
      autoLoadSentinel: !!runtime.autoLoadSentinel,
      shortcutsEnabled: runtime.shortcutsEnabled !== false,
      styleMode: diag.styleMode,
      swapMode: diag.swapMode,
      debug: !!diag.debug,
    };
  }

  function getSummary() {
    const adapter = paginationAdapter();
    if (adapter && typeof adapter.getSummary === 'function') return adapter.getSummary();
    const info = getPageInfoFallback();
    if (!info.enabled) return 'Disabled • all turns stay visible';
    if (!info.totalAnswers) return `Enabled • ${info.pageSize} answers/page • waiting for answers`;
    return `Enabled • page ${info.pageIndex + 1}/${info.pageCount} • ${info.pageSize} answers/page`;
  }

  function emitConfigChanged(reason = 'cfg') {
    const detail = {
      source: 'pagination-windowing',
      reason: String(reason || 'cfg'),
      config: getConfig(),
      page: getPageInfo(),
      ts: Date.now(),
    };
    safeDispatch(EV_CFG_CHANGED, detail);
    try { paginationAdapter()?.syncCommandBarControls?.(); } catch (_) {}
    return detail;
  }

  function applyDiagFallback(partial) {
    const current = S.diagConfig || DIAG_DEFAULT;
    const mergedInput = Object.assign({}, current, (partial && typeof partial === 'object') ? partial : {});
    const next = normalizeDiagConfig(mergedInput, DIAG_DEFAULT);
    S.diagConfig = next;
    writeDiagConfig(next);
    return getDiagConfigCopy();
  }

  function setDiagConfig(partial) {
    const adapter = paginationAdapter();
    if (adapter && typeof adapter.setDiagConfig === 'function') return adapter.setDiagConfig(partial);
    const prev = getDiagConfigCopy();
    const next = applyDiagFallback(partial);
    if (
      next.styleMode !== prev.styleMode
      || next.swapMode !== prev.swapMode
      || next.debug !== prev.debug
      || next.useObserverHub !== prev.useObserverHub
    ) {
      emitConfigChanged('cfg:diag');
    }
    return next;
  }

  function applySetting(optKey, val) {
    const adapter = paginationAdapter();
    if (adapter && typeof adapter.applySetting === 'function') return !!adapter.applySetting(optKey, val);

    const key = String(optKey || '').trim();
    if (!key) return false;

    if (key === 'pwStyleMode') {
      const prev = getDiagConfigCopy();
      const next = setDiagConfig({ styleMode: val });
      return next.styleMode !== prev.styleMode;
    }
    if (key === 'pwSwapMode') {
      const prev = getDiagConfigCopy();
      const next = setDiagConfig({ swapMode: val });
      return next.swapMode !== prev.swapMode;
    }
    if (key === 'pwDebug') {
      const prev = getDiagConfigCopy();
      const next = setDiagConfig({ debug: !!val });
      return !!next.debug !== !!prev.debug;
    }
    if (key === 'pwUseObserverHub') {
      const prev = getDiagConfigCopy();
      const next = setDiagConfig({ useObserverHub: !!val });
      return !!next.useObserverHub !== !!prev.useObserverHub;
    }

    const current = getRuntimeConfigCopy();
    const next = { ...current };
    switch (key) {
      case 'pwEnabled':
        next.enabled = !!val;
        break;
      case 'pwPageSize':
        next.pageSize = clampInt(val, CFG_PAGE_SIZE_MIN, CFG_PAGE_SIZE_MAX, current.pageSize);
        break;
      case 'pwBufferAnswers':
        next.bufferAnswers = clampInt(val, CFG_BUFFER_MIN, CFG_BUFFER_MAX, current.bufferAnswers);
        break;
      case 'pwAutoLoadSentinel':
        next.autoLoadSentinel = !!val;
        break;
      case 'pwShortcutsEnabled':
        next.shortcutsEnabled = !!val;
        break;
      default:
        return false;
    }

    const clean = normalizeRuntimeConfig(next, RUNTIME_DEFAULT);
    const changed = clean.enabled !== current.enabled
      || clean.pageSize !== current.pageSize
      || clean.bufferAnswers !== current.bufferAnswers
      || clean.autoLoadSentinel !== current.autoLoadSentinel
      || clean.shortcutsEnabled !== current.shortcutsEnabled;
    if (!changed) return false;

    S.runtimeConfig = clean;
    writeRuntimeConfig(clean);
    emitConfigChanged(`cfg:${key}`);
    return true;
  }

  function setEnabled(on) {
    applySetting('pwEnabled', !!on);
    return isFeatureEnabled();
  }

  function delegate(name, args = [], fallback = false) {
    const adapter = paginationAdapter();
    if (adapter && typeof adapter[name] === 'function') {
      return adapter[name](...args);
    }
    return fallback;
  }

  function goToAnswerGid(gid) { return delegate('goToAnswerGid', [gid], false); }
  function goToPage(pageIndex, reason = 'api:goToPage') { return delegate('goToPage', [pageIndex, reason], false); }
  function goToPageStart(pageIndex, reason = 'api:goToPageStart', opts = {}) { return delegate('goToPageStart', [pageIndex, reason, opts], false); }
  function focusPage(pageOrIndex, opts = {}) {
    const raw = Number(pageOrIndex);
    if (!Number.isFinite(raw)) return false;
    const usePageNumber = opts?.pageNumber !== false;
    const pageIndex = Math.max(0, Math.trunc(usePageNumber ? (raw - 1) : raw));
    const reason = String(opts?.reason || opts?.source || 'api:focusPage');
    return goToPageStart(pageIndex, reason, {
      smooth: opts?.smooth !== false,
      commitWindowing: String(opts?.source || '') === 'chat-pages-controller:divider-dblclick',
      nextCollapsed: opts?.nextCollapsed,
      chatId: opts?.chatId,
    });
  }
  function goOlder(reason = 'api:goOlder') { return delegate('goOlder', [reason], false); }
  function goNewer(reason = 'api:goNewer') { return delegate('goNewer', [reason], false); }
  function goFirst(reason = 'api:goFirst') { return delegate('goFirst', [reason], false); }
  function goLast(reason = 'api:goLast') { return delegate('goLast', [reason], false); }
  function API_PG_ensureVisibleById(anyId, opts = {}) { return delegate('ensureVisibleById', [anyId, opts], Promise.resolve({ ok: false, reason: 'adapter-unavailable', id: String(anyId || '').trim() })); }
  function resolveAnyIdToTurnRecord(anyId) { return delegate('resolveAnyIdToTurnRecord', [anyId], null); }
  function resolveAnyIdToPage(anyId) { return delegate('resolveAnyIdToPage', [anyId], null); }
  function rebuildIndex(reason = 'api:rebuild') { return delegate('rebuildIndex', [reason], false); }
  function dispose(reason = 'dispose') { return delegate('dispose', [reason], false); }
  function boot(reason = 'boot') { return delegate('boot', [reason], false); }

  function attachChatAdapter(adapterApi) {
    if (!adapterApi || typeof adapterApi !== 'object') return null;
    VAULT.chatAdapter = adapterApi;
    return adapterApi;
  }

  function detachChatAdapter() {
    const prev = paginationAdapter();
    if (!prev) return null;
    VAULT.chatAdapter = null;
    return prev;
  }

  function isAdapterReady() {
    return !!paginationAdapter();
  }

  S.runtimeConfig = normalizeRuntimeConfig(readRuntimeConfig(), RUNTIME_DEFAULT);
  S.diagConfig = normalizeDiagConfig(readDiagConfig(), DIAG_DEFAULT);

  VAULT.engine = VAULT.engine || {};
  VAULT.engine.attachChatAdapter = attachChatAdapter;
  VAULT.engine.detachChatAdapter = detachChatAdapter;
  VAULT.engine.isAdapterReady = isAdapterReady;
  VAULT.engine.getChatAdapter = paginationAdapter;
  VAULT.engine.getConfig = getConfig;
  VAULT.engine.emitConfigChanged = emitConfigChanged;

  const API = {
    getPageInfo,
    getConfig,
    applySetting,
    getDiagConfig,
    setDiagConfig,
    setEnabled,
    getSummary,
    goToAnswerGid,
    ensureVisibleById: API_PG_ensureVisibleById,
    goToPage,
    goToPageStart,
    focusPage,
    goOlder,
    goNewer,
    goFirst,
    goLast,
    resolveAnyIdToTurnRecord,
    resolveAnyIdToPage,
    rebuildIndex,
    boot,
    dispose,
  };

  const prevApi = W.H2O_Pagination;
  if (prevApi && prevApi !== API && typeof prevApi.dispose === 'function') {
    try { prevApi.dispose('replace'); } catch (_) {}
  }
  W.H2O_Pagination = API;
})();
