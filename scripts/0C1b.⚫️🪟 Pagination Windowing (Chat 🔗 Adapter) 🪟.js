// ==UserScript==
// @h2o-id             0c1b.pagination.windowing.chat.adapter
// @name               0C1b.⬛️🪟 Pagination Windowing (Chat Adapter) 🪟
// @namespace          H2O.Premium.CGX.pagination.windowing.chat.adapter
// @author             HumamDev
// @version            1.1.0
// @revision           002
// @build              260328-002627
// @description        Chat adapter for Pagination Windowing. Owns ChatGPT DOM discovery, page rendering, observer integration, style injection, and command-bar/feature surfaces while preserving the existing engine contract.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

/*
Usage:
- `window.H2O_Pagination.getConfig()` exposes the live page/window settings.
- Navigate with on-page controls or `window.H2O_Pagination.goOlder()/goNewer()/goToPage(index)`.
- Works with Unmount Messages v1.3.1 by moving whole turn nodes as-is and emitting
  `evt:h2o:pagination:pagechanged` after page swaps.

Diagnostic controls:
- `window.H2O_Pagination.getDiagConfig()` returns `{ styleMode, swapMode, debug }`.
- `window.H2O_Pagination.setDiagConfig({ styleMode, swapMode, debug })` merges, persists, and reapplies.

Self-check:
- [x] rebuildIndex contains no self-recursion
- [x] recovery uses fullRoot (not paged root)
- [x] merge handles React replacement deterministically
- [x] shortcuts ignore composer robustly
- [x] zero-answer chats stable
- [x] single swap per render
- [x] view swap reliable
- [x] diag.debug works
- [x] idle does not increase swapCount
*/

(() => {
  'use strict';

  const TOK = 'PW';
  const PID = 'pgnwndw';
  const CID = 'paginationw';
  const SkID = 'pgnw';
  const MODTAG = 'PaginationW';
  const MODICON = '🪟';
  const EMOJI_HDR = '🟦';

  const SUITE = 'prm';
  const HOST = 'cgx';
  const DsID = PID;
  const BrID = PID;

  // Config
  const CFG_DEBUG = false;
  const CFG_ENABLED_DEFAULT = true;
  const CFG_PAGE_SIZE_DEFAULT = 25;
  const CFG_PAGE_BAND_SIZE = 25;
  const CFG_PAGE_SIZE_MIN = 5;
  const CFG_PAGE_SIZE_MAX = 200;
  const CFG_BUFFER_DEFAULT = 10;
  const CFG_BUFFER_MIN = 0;
  const CFG_BUFFER_MAX = 80;
  const CFG_AUTO_LOAD_SENTINEL_DEFAULT = false;
  const CFG_SHORTCUTS_ENABLED_DEFAULT = true;
  const OBSERVER_DEBOUNCE_MS = 140;
  const OBSERVER_SUPPRESS_MS = 350;
  const VISIBLE_REFRESH_THROTTLE_MS = 2000;
  const AUTO_LOAD_GAP_MS = 700;
  const COMMAND_BAR_BIND_RETRY_MS = 350;
  const COMMAND_BAR_BIND_MAX_ATTEMPTS = 40;
  const STALE_MIN_EXPECTED_TURNS = 1;
  const RECOVERY_MIN_MASTER_TURNS = 20;
  const RECOVERY_DISCONNECTED_RATIO = 0.35;
  const RECOVERY_DISCOVERY_RATIO = 0.60;

  // Events
  const EV_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EV_CFG_CHANGED = 'evt:h2o:pagination:configchanged';

  // Selectors
  const SEL_MSG_ANY = '[data-message-author-role="assistant"], [data-message-author-role="user"]';
  const SEL_MSG_A = '[data-message-author-role="assistant"]';
  const SEL_MSG_Q = '[data-message-author-role="user"]';
  const SEL_CONV_TURN = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';

  // Attr / keys
  const ATTR_CGX_OWNER = 'data-cgxui-owner';
  const ATTR_CGX_ID = 'data-cgxui';
  const CSS_STYLE_ID = `cgxui-${SkID}-style`;
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
  const SEL_SHORTCUT_EDITABLE = 'input, textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]';
  const SEL_SHORTCUT_COMPOSER = 'form[data-testid="composer"], form[data-type="unified-composer"], form.group\\/composer, [data-composer-surface="true"]';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || {};
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {});
  VAULT.meta = VAULT.meta || { tok: TOK, pid: PID, cid: CID, skid: SkID, modtag: MODTAG, suite: SUITE, host: HOST };
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
  S.runtimeConfig = null;
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
  S.diagConfig = null;

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

  function toInt(val, fallback) {
    const n = Number.parseInt(String(val ?? ''), 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function clampInt(val, min, max, fallback) {
    const n = toInt(val, fallback);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
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

  function safeLogWarn(msg, extra) {
    try { console.warn('[H2O Pagination]', msg, extra || ''); } catch (_) {}
  }

  function isDebugEnabled() {
    const diag = S.diagConfig || DIAG_DEFAULT;
    return !!CFG_DEBUG || !!diag.debug;
  }

  function debugLog(msg, extra) {
    if (!isDebugEnabled()) return;
    try { console.warn('[H2O Pagination][debug]', msg, extra || ''); } catch (_) {}
  }

  function safeDispatch(name, detail) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
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

  function getStorageKey(chatId) {
    return `${NS_DISK}:pagination:${String(chatId || 'unknown')}:v1`;
  }

  function getSwapMode() {
    const diag = S.diagConfig || DIAG_DEFAULT;
    return DIAG_SWAP_MODES.has(diag.swapMode) ? diag.swapMode : DIAG_DEFAULT.swapMode;
  }

  function getStyleMode() {
    const diag = S.diagConfig || DIAG_DEFAULT;
    return DIAG_STYLE_MODES.has(diag.styleMode) ? diag.styleMode : DIAG_DEFAULT.styleMode;
  }

  function shouldUseObserverHub() {
    const diag = S.diagConfig || DIAG_DEFAULT;
    return diag.useObserverHub !== false;
  }

  function getObserverHub() {
    const hub = W.H2O?.obs;
    if (!shouldUseObserverHub()) return null;
    if (!hub || typeof hub !== 'object') return null;
    for (const key of ['ensureRoot', 'onReady', 'onMutations', 'withSuppressed']) {
      if (typeof hub[key] !== 'function') return null;
    }
    return hub;
  }

  S.runtimeConfig = normalizeRuntimeConfig(readRuntimeConfig(), RUNTIME_DEFAULT);
  S.diagConfig = normalizeDiagConfig(readDiagConfig(), DIAG_DEFAULT);

  function readStoredPageIndex(chatId) {
    try {
      const raw = W.localStorage?.getItem?.(getStorageKey(chatId));
      if (raw == null) return null;
      const n = Number.parseInt(String(raw), 10);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  }

  function writeStoredPageIndex(chatId, index) {
    try {
      W.localStorage?.setItem?.(getStorageKey(chatId), String(index));
      return true;
    } catch (_) {
      return false;
    }
  }

  function markObserverSuppressedWindow() {
    const until = Date.now() + OBSERVER_SUPPRESS_MS;
    S.suppressObserverUntil = Math.max(Number(S.suppressObserverUntil || 0), until);
  }

  function armDeferredRefreshFlush() {
    if (S.deferredRefreshTimer) return;
    const waitMs = Math.max(20, Number(S.suppressObserverUntil || 0) - Date.now() + 20);
    S.deferredRefreshTimer = W.setTimeout(() => {
      S.deferredRefreshTimer = 0;
      if (!S.booted) return;
      if (!S.deferredRefreshNeeded) return;
      S.deferredRefreshNeeded = false;
      scheduleRefresh('mo:deferred');
    }, waitMs);
  }

  function normalizeRole(v) {
    const r = String(v || '').trim().toLowerCase();
    if (r === 'assistant') return 'assistant';
    if (r === 'user') return 'user';
    return '';
  }

  function isOurUiNode(node) {
    if (!node || node.nodeType !== 1) return false;
    try {
      return node.getAttribute(ATTR_CGX_OWNER) === SkID;
    } catch (_) {
      return false;
    }
  }

  function isInsideOwnedUi(node) {
    if (!isElementNode(node)) return false;
    if (isOurUiNode(node)) return true;
    try {
      return !!node.closest?.(`[${ATTR_CGX_OWNER}="${SkID}"]`);
    } catch (_) {
      return false;
    }
  }

  function nodeLooksLikeConversationMutation(node) {
    if (!isElementNode(node)) return false;
    if (isInsideOwnedUi(node)) return false;
    try {
      if (node.matches(SEL_MSG_ANY) || node.matches(SEL_CONV_TURN)) return true;
    } catch (_) {}
    try {
      return !!(node.querySelector(SEL_MSG_ANY) || node.querySelector(SEL_CONV_TURN));
    } catch (_) {
      return false;
    }
  }

  function mutationAffectsConversationStructure(node) {
    return nodeLooksLikeConversationMutation(node);
  }

  function isElementNode(node) {
    return !!node && node.nodeType === 1;
  }

  function toRootDirectChild(node, root) {
    if (!isElementNode(node) || !isElementNode(root)) return null;
    let cur = node;
    while (cur && cur.parentElement && cur.parentElement !== root) {
      cur = cur.parentElement;
    }
    if (cur && cur.parentElement === root) return cur;
    return null;
  }

  function compareDomOrder(a, b) {
    if (a === b) return 0;
    try {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    } catch (_) {}
    return 0;
  }

  function nodeLooksLikeTurn(node) {
    if (!isElementNode(node) || isOurUiNode(node)) return false;
    try {
      if (node.matches(SEL_MSG_ANY) || node.matches(SEL_CONV_TURN)) return true;
      if (node.querySelector(SEL_MSG_ANY)) return true;
    } catch (_) {}
    return false;
  }

  function findConversationRoot() {
    const firstTurn = document.querySelector(SEL_CONV_TURN);
    if (firstTurn && firstTurn.parentElement) return firstTurn.parentElement;

    const firstMsg = document.querySelector(SEL_MSG_ANY);
    if (!firstMsg) return null;

    const fromExplicit = firstMsg.closest(SEL_CONV_TURN);
    if (fromExplicit && fromExplicit.parentElement) return fromExplicit.parentElement;

    if (firstMsg.parentElement) return firstMsg.parentElement;
    return null;
  }

  function discoverTurnNodes(root) {
    if (!isElementNode(root)) return [];

    const out = [];
    const seen = new Set();
    const push = (node) => {
      if (!isElementNode(node) || isOurUiNode(node)) return;
      if (node.parentElement !== root) return;
      if (!nodeLooksLikeTurn(node)) return;
      if (seen.has(node)) return;
      seen.add(node);
      out.push(node);
    };

    const explicit = Array.from(root.querySelectorAll(SEL_CONV_TURN));
    for (const el of explicit) {
      const direct = toRootDirectChild(el, root);
      if (direct) push(direct);
    }

    const msgs = Array.from(root.querySelectorAll(SEL_MSG_ANY));
    for (const msg of msgs) {
      const explicitTurn = msg.closest(SEL_CONV_TURN);
      const base = explicitTurn || msg;
      const direct = toRootDirectChild(base, root) || toRootDirectChild(msg, root);
      if (direct) push(direct);
    }

    if (!out.length) {
      const kids = Array.from(root.children || []);
      for (const child of kids) {
        if (nodeLooksLikeTurn(child)) push(child);
      }
    }

    out.sort(compareDomOrder);
    return out;
  }

  function detectTurnRole(node) {
    if (!isElementNode(node)) return 'assistant';

    const selfRole = normalizeRole(node.getAttribute('data-message-author-role'));
    if (selfRole) return selfRole;

    let nested = null;
    try { nested = node.querySelector(SEL_MSG_ANY); } catch (_) { nested = null; }
    if (nested) {
      const nestedRole = normalizeRole(nested.getAttribute('data-message-author-role'));
      if (nestedRole) return nestedRole;
    }

    try {
      if (node.querySelector(SEL_MSG_A)) return 'assistant';
      if (node.querySelector(SEL_MSG_Q)) return 'user';
    } catch (_) {}

    return 'assistant';
  }

  function findPrimaryMessageEl(node) {
    if (!isElementNode(node)) return null;
    try {
      if (node.matches(SEL_MSG_ANY)) return node;
      return node.querySelector(SEL_MSG_ANY);
    } catch (_) {
      return null;
    }
  }

  function findAssistantEl(node, role) {
    if (!isElementNode(node)) return null;
    try {
      if (role === 'assistant' && node.matches(SEL_MSG_A)) return node;
      if (node.matches(SEL_MSG_A)) return node;
    } catch (_) {}
    try {
      return node.querySelector(SEL_MSG_A);
    } catch (_) {
      return null;
    }
  }

  function readNodeAttr(node, attrName) {
    if (!isElementNode(node)) return '';
    try {
      const v = node.getAttribute(attrName);
      return v ? String(v).trim() : '';
    } catch (_) {
      return '';
    }
  }

  function getMessageLikeId(node) {
    if (!isElementNode(node)) return '';

    const attrCandidates = [
      'data-message-id',
      'data-h2o-ans-id',
      'data-cgxui-id',
      'data-h2o-uid',
    ];
    for (const attrName of attrCandidates) {
      const value = readNodeAttr(node, attrName);
      if (value) return value;
    }

    const dsCandidates = [
      node?.dataset?.messageId,
      node?.dataset?.h2oAnsId,
      node?.dataset?.cgxuiId,
      node?.dataset?.h2oUid,
    ];
    for (const raw of dsCandidates) {
      const value = String(raw || '').trim();
      if (value) return value;
    }
    return '';
  }

  function getPreferredUid(node, role, gid) {
    const msgEl = findPrimaryMessageEl(node);
    const candidates = [node, msgEl];

    for (const el of candidates) {
      const uid = readNodeAttr(el, 'data-h2o-uid');
      if (uid) return uid;
      const uidDs = (el && el.dataset && el.dataset.h2oUid) ? String(el.dataset.h2oUid).trim() : '';
      if (uidDs) return uidDs;
    }

    for (const el of candidates) {
      const num = readNodeAttr(el, 'data-h2o-num');
      if (num) return `${role}:${num}`;
      const numDs = (el && el.dataset && el.dataset.h2oNum) ? String(el.dataset.h2oNum).trim() : '';
      if (numDs) return `${role}:${numDs}`;
    }

    return `${role}:${gid}`;
  }

  function buildCanonicalTurnId(turn, fallbackIndex = 0) {
    const nodeTurnId =
      readNodeAttr(turn?.node, 'data-turn-id')
      || String(turn?.node?.dataset?.turnId || '').trim()
      || readNodeAttr(turn?.answerEl, 'data-turn-id')
      || String(turn?.answerEl?.dataset?.turnId || '').trim();
    if (nodeTurnId) return nodeTurnId;

    const answerId = String(turn?.answerId || '').trim();
    if (answerId) return `turn:${answerId}`;

    const uid = String(turn?.uid || '').trim();
    if (uid) return uid.startsWith('turn:') ? uid : `turn:${uid}`;

    const idx = Math.max(1, Number(fallbackIndex || turn?.gid || 1) || 1);
    return `pw-turn-${idx}`;
  }

  function CORE_PG_normalizeId(raw) {
    return String(raw || '').replace(/^conversation-turn-/, '').trim();
  }

  function CORE_PG_addIdVariant(set, raw, opts = {}) {
    if (!(set instanceof Set)) return;
    const id = CORE_PG_normalizeId(raw);
    if (!id) return;

    set.add(id);

    if (id.startsWith('turn:a:')) {
      const bare = CORE_PG_normalizeId(id.slice(7));
      if (bare) {
        set.add(bare);
        set.add(`turn:${bare}`);
      }
      return;
    }

    if (id.startsWith('turn:')) {
      const bare = CORE_PG_normalizeId(id.slice(5));
      if (bare) set.add(bare);
      return;
    }

    if (opts.turnVariant) set.add(`turn:${id}`);
    if (opts.assistantTurnVariant) set.add(`turn:a:${id}`);
  }

  function CORE_PG_collectRecordIds(record) {
    const out = new Set();
    if (!record) return out;

    CORE_PG_addIdVariant(out, record.turnId);
    CORE_PG_addIdVariant(out, record.uid, { turnVariant: true, assistantTurnVariant: !!record.answerId });
    CORE_PG_addIdVariant(out, record.turnUid, { turnVariant: true });
    CORE_PG_addIdVariant(out, record.answerId, { turnVariant: true, assistantTurnVariant: true });
    CORE_PG_addIdVariant(out, record.primaryAId, { turnVariant: true, assistantTurnVariant: true });

    const nodeCandidates = [
      record.node,
      record.answerEl,
      record.el,
      record.primaryAEl,
    ];
    for (const node of nodeCandidates) {
      if (!isElementNode(node)) continue;
      CORE_PG_addIdVariant(out, readNodeAttr(node, 'data-turn-id'));
      CORE_PG_addIdVariant(out, getMessageLikeId(node), { turnVariant: true, assistantTurnVariant: true });
      CORE_PG_addIdVariant(out, String(node?.dataset?.turnId || '').trim());
      CORE_PG_addIdVariant(out, String(node?.dataset?.messageId || '').trim(), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
    }

    return out;
  }

  function CORE_PG_recordMatchesAnyId(anyId, record) {
    const wanted = new Set();
    CORE_PG_addIdVariant(wanted, anyId, { turnVariant: true, assistantTurnVariant: true });
    if (!wanted.size) return false;

    for (const recordId of CORE_PG_collectRecordIds(record)) {
      if (wanted.has(recordId)) return true;
    }
    return false;
  }

  function CORE_PG_getAnswerRecordForTurn(turn) {
    if (!turn) return null;

    const directIdx = Number(turn?.answerIndex || 0);
    if (directIdx > 0) {
      const direct = S.masterAnswers[directIdx - 1] || null;
      if (direct) return direct;
    }

    return S.masterAnswers.find((answer) => {
      if (!answer) return false;
      return answer.turnId === turn.turnId
        || answer.turnUid === turn.uid
        || answer.gid === turn.gid
        || (!!turn.answerId && answer.answerId === turn.answerId);
    }) || null;
  }

  function CORE_PG_getTurnRecordForAnswer(answer) {
    if (!answer) return null;

    const turnIndex = Number(answer?.turnIndex);
    if (Number.isFinite(turnIndex) && turnIndex >= 0) {
      const direct = S.masterTurns[turnIndex] || null;
      if (direct) return direct;
    }

    return S.masterTurns.find((turn) => {
      if (!turn) return false;
      return turn.turnId === answer.turnId
        || turn.uid === answer.turnUid
        || turn.gid === answer.gid
        || (!!answer.answerId && turn.answerId === answer.answerId);
    }) || null;
  }

  function CORE_PG_resolveAnyIdToAnswerRecord(anyId) {
    const id = CORE_PG_normalizeId(anyId);
    if (!id) return null;
    return S.masterAnswers.find((answer) => CORE_PG_recordMatchesAnyId(id, answer)) || null;
  }

  function CORE_PG_resolveAnyIdToTurnRecord(anyId) {
    const id = CORE_PG_normalizeId(anyId);
    if (!id) return null;

    const answer = CORE_PG_resolveAnyIdToAnswerRecord(id);
    if (answer) return CORE_PG_getTurnRecordForAnswer(answer);

    return S.masterTurns.find((turn) => CORE_PG_recordMatchesAnyId(id, turn)) || null;
  }

  function CORE_PG_resolveAnyIdToPage(anyId) {
    const id = CORE_PG_normalizeId(anyId);
    if (!id) return null;

    let answer = CORE_PG_resolveAnyIdToAnswerRecord(id);
    let turn = answer ? CORE_PG_getTurnRecordForAnswer(answer) : CORE_PG_resolveAnyIdToTurnRecord(id);
    if (!turn && answer) turn = CORE_PG_getTurnRecordForAnswer(answer);
    if (!turn) return null;
    if (!answer) answer = CORE_PG_getAnswerRecordForTurn(turn);

    const turnIndex = S.masterTurns.indexOf(turn);
    const answerIndex = Number(answer?.answerIndex || turn?.answerIndex || 0);
    const pageIndex = answerIndex > 0 ? Math.max(0, Math.floor((answerIndex - 1) / getPageSize())) : 0;

    return {
      id,
      turn,
      answer,
      turnIndex,
      answerIndex,
      pageIndex,
      pageNum: pageIndex + 1,
      turnId: String(turn?.turnId || answer?.turnId || '').trim(),
      answerId: String(answer?.answerId || turn?.answerId || answer?.primaryAId || '').trim(),
    };
  }

  function CORE_PG_collectTargetIds(target) {
    const out = new Set();
    if (!target) return out;

    CORE_PG_addIdVariant(out, target.id, { turnVariant: true, assistantTurnVariant: true });
    CORE_PG_addIdVariant(out, target.turnId, { turnVariant: true, assistantTurnVariant: true });
    CORE_PG_addIdVariant(out, target.answerId, { turnVariant: true, assistantTurnVariant: true });

    for (const id of CORE_PG_collectRecordIds(target.turn)) out.add(id);
    for (const id of CORE_PG_collectRecordIds(target.answer)) out.add(id);
    return out;
  }

  function CORE_PG_collectNodeIds(node) {
    const out = new Set();
    if (!isElementNode(node)) return out;

    const turnHost = node.closest?.(SEL_CONV_TURN) || null;
    const assistantEl = findAssistantEl(node, detectTurnRole(node))
      || findAssistantEl(turnHost, detectTurnRole(turnHost));
    const nodeCandidates = [node, turnHost, assistantEl];

    for (const candidate of nodeCandidates) {
      if (!isElementNode(candidate)) continue;
      CORE_PG_addIdVariant(out, readNodeAttr(candidate, 'data-turn-id'));
      CORE_PG_addIdVariant(out, getMessageLikeId(candidate), { turnVariant: true, assistantTurnVariant: true });
      CORE_PG_addIdVariant(out, String(candidate?.dataset?.turnId || '').trim(), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
      CORE_PG_addIdVariant(out, String(candidate?.dataset?.messageId || '').trim(), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
      CORE_PG_addIdVariant(out, readNodeAttr(candidate, 'data-cgxui-id'), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
      CORE_PG_addIdVariant(out, readNodeAttr(candidate, 'data-h2o-ans-id'), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
      CORE_PG_addIdVariant(out, readNodeAttr(candidate, 'data-h2o-core-id'), {
        turnVariant: true,
        assistantTurnVariant: true,
      });
    }

    return out;
  }

  function CORE_PG_getActiveRenderRoot() {
    if (isElementNode(S.ui.viewBox) && S.ui.viewBox.isConnected) return S.ui.viewBox;
    if (isElementNode(S.root) && S.root.isConnected) return S.root;
    return null;
  }

  function CORE_PG_findTurnHostByAnyId(anyId, root = CORE_PG_getActiveRenderRoot()) {
    if (!isElementNode(root)) return null;

    const wanted = new Set();
    CORE_PG_addIdVariant(wanted, anyId, { turnVariant: true, assistantTurnVariant: true });
    if (!wanted.size) return null;

    for (const variant of wanted) {
      if (!variant) continue;
      try {
        const esc = (W.CSS?.escape) ? W.CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = root.querySelector(`[data-turn-id="${esc}"]`)
          || root.querySelector(`[data-message-id="${esc}"]`);
        if (!el) continue;
        const host = el.closest?.(SEL_CONV_TURN) || el;
        if (isElementNode(host) && root.contains(host)) return host;
      } catch (_) {}
    }

    return null;
  }

  function CORE_PG_findAnswerHostByAnyId(anyId, root = CORE_PG_getActiveRenderRoot()) {
    if (!isElementNode(root)) return null;

    const wanted = new Set();
    CORE_PG_addIdVariant(wanted, anyId, { turnVariant: true, assistantTurnVariant: true });
    if (!wanted.size) return null;

    for (const variant of wanted) {
      if (!variant) continue;
      try {
        const esc = (W.CSS?.escape) ? W.CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = root.querySelector(`[data-message-id="${esc}"]`)
          || root.querySelector(`[data-cgxui-id="${esc}"]`)
          || root.querySelector(`[data-h2o-ans-id="${esc}"]`)
          || root.querySelector(`[data-h2o-core-id="${esc}"]`)
          || root.querySelector(`[data-turn-id="${esc}"]`);
        const answerEl = findAssistantEl(el, detectTurnRole(el));
        if (isElementNode(answerEl) && root.contains(answerEl)) return answerEl;
      } catch (_) {}
    }

    return null;
  }

  function CORE_PG_nodeMatchesTarget(node, target) {
    if (!isElementNode(node)) return false;

    const wanted = CORE_PG_collectTargetIds(target);
    if (!wanted.size) return false;

    for (const id of CORE_PG_collectNodeIds(node)) {
      if (wanted.has(id)) return true;
    }
    return false;
  }

  function CORE_PG_isTargetMaterializedOnActivePage(target) {
    const pageIndex = Math.max(0, Number(target?.pageIndex || 0) || 0);
    const turnIndex = Number(target?.turnIndex ?? -1);
    const pageOk = !!S.renderedOnce && Number(S.pageIndex || 0) === pageIndex;
    const turnVisible = !Number.isFinite(turnIndex) || turnIndex < 0 || !!S.viewTurnIndexSet?.has(turnIndex);
    const root = CORE_PG_getActiveRenderRoot();

    if (!pageOk || !turnVisible || !isElementNode(root)) {
      return {
        ok: false,
        pageOk,
        turnVisible,
        root,
        targetHostFound: false,
        targetHost: null,
        turnHost: null,
        answerHost: null,
      };
    }

    let turnHost = null;
    if (isElementNode(target?.turn?.node) && target.turn.node.isConnected && root.contains(target.turn.node)) {
      turnHost = target.turn.node;
    }
    if (!turnHost) {
      turnHost = CORE_PG_findTurnHostByAnyId(target?.turnId || target?.answerId || target?.id, root);
    }
    if (turnHost && !CORE_PG_nodeMatchesTarget(turnHost, target)) turnHost = null;

    let answerHost = null;
    const answerCandidates = [
      target?.answer?.answerEl,
      target?.answer?.el,
      target?.answer?.primaryAEl,
      target?.turn?.answerEl,
    ];
    for (const candidate of answerCandidates) {
      if (!isElementNode(candidate) || !candidate.isConnected || !root.contains(candidate)) continue;
      if (!CORE_PG_nodeMatchesTarget(candidate, target)) continue;
      answerHost = candidate;
      break;
    }
    if (!answerHost && turnHost) {
      const answerFromTurn = findAssistantEl(turnHost, detectTurnRole(turnHost));
      if (isElementNode(answerFromTurn) && answerFromTurn.isConnected && root.contains(answerFromTurn) && CORE_PG_nodeMatchesTarget(answerFromTurn, target)) {
        answerHost = answerFromTurn;
      }
    }
    if (!answerHost) {
      answerHost = CORE_PG_findAnswerHostByAnyId(target?.answerId || target?.turnId || target?.id, root);
      if (answerHost && !CORE_PG_nodeMatchesTarget(answerHost, target)) answerHost = null;
    }

    const targetHost = answerHost || turnHost || null;
    return {
      ok: !!targetHost,
      pageOk,
      turnVisible,
      root,
      targetHostFound: !!targetHost,
      targetHost,
      turnHost,
      answerHost,
    };
  }

  function makeTurnRecord(node, gid) {
    const role = detectTurnRole(node);
    const answerEl = findAssistantEl(node, role);
    const answerId = answerEl
      ? (getMessageLikeId(answerEl) || getPreferredUid(answerEl, 'assistant', gid))
      : '';
    return {
      gid,
      role,
      node,
      uid: getPreferredUid(node, role, gid),
      answerEl,
      answerId,
      turnId: '',
      isAnswer: false,
      answerIndex: 0,
      detached: !node.isConnected,
    };
  }

  function syncLegacyRefs() {
    S.turns = S.masterTurns;
    S.answers = S.masterAnswers;
    S.turnUnits = S.masterTurnUnits;
    S.canonicalTurns = S.masterTurnUnits;
    S.turnNodeSet = S.masterTurnNodeSet;
    S.uidToTurn = S.masterUidToTurn;
    S.visibleTurnIndices = S.viewTurnIndices;
  }

  function getTurnRuntimeApi() {
    try {
      const api = W?.H2O?.turnRuntime || null;
      if (!api || typeof api !== 'object') return null;
      if (typeof api.getTurnById !== 'function') {
        api.getTurnById = (id) => CORE_PG_projectTurnRuntimeTurn(CORE_PG_resolveAnyIdToTurnRecord(id));
      }
      if (typeof api.getTurnByIndex !== 'function') {
        // Index here means answerIndex (user-visible turn number), so look up
        // via masterAnswers which is indexed 1-based by answerIndex.
        api.getTurnByIndex = (index) => {
          const answers = Array.isArray(S.masterAnswers) ? S.masterAnswers : [];
          const idx = Math.max(1, Number(index || 0) || 0);
          const answer = answers[idx - 1] || null;
          if (!answer) return null;
          const turn = CORE_PG_getTurnRecordForAnswer(answer);
          return CORE_PG_projectTurnRuntimeTurn(turn, answer.turnIndex >= 0 ? answer.turnIndex : -1);
        };
      }
      if (typeof api.listTurns !== 'function') {
        // Return one record per answered turn (paired Q+A), using answerIndex
        // as the canonical index. This keeps downstream consumers (MiniMap,
        // Question Numbers) aligned on the correct user-visible turn number.
        api.listTurns = () => {
          const answers = Array.isArray(S.masterAnswers) ? S.masterAnswers : [];
          return answers.map((answer) => {
            const turn = CORE_PG_getTurnRecordForAnswer(answer);
            const projected = CORE_PG_projectTurnRuntimeTurn(
              turn,
              answer.turnIndex >= 0 ? answer.turnIndex : -1,
            );
            if (!projected) return null;
            // Override index with answerIndex so MiniMap buttons are numbered 1, 2, 3…
            projected.index = answer.answerIndex;
            projected.gid = answer.answerIndex;
            projected.turnNo = answer.answerIndex;
            return projected;
          }).filter(Boolean);
        };
      }
      return api;
    } catch (_) {
      return null;
    }
  }

  function CORE_PG_projectTurnRuntimeTurn(turn, fallbackIndex = -1) {
    if (!turn) return null;
    const turnIndex = (Number.isInteger(fallbackIndex) && fallbackIndex >= 0)
      ? fallbackIndex
      : S.masterTurns.indexOf(turn);
    const answerIndex = Math.max(0, Number(turn?.answerIndex || 0) || 0);
    const answer = answerIndex > 0
      ? (S.masterAnswers[answerIndex - 1] || null)
      : CORE_PG_getAnswerRecordForTurn(turn);
    const gid = Math.max(1, Number(turn?.gid || turnIndex + 1) || turnIndex + 1);
    return {
      turnId: String(turn?.turnId || '').trim(),
      uid: String(turn?.uid || '').trim(),
      gid,
      index: gid,
      role: String(turn?.role || '').trim(),
      answerId: String(answer?.answerId || turn?.answerId || '').trim(),
      answerIndex: Math.max(0, Number(answer?.answerIndex || turn?.answerIndex || 0) || 0),
      node: turn?.node || null,
      answerEl: turn?.answerEl || answer?.answerEl || answer?.el || null,
      detached: !!turn?.detached,
      isAnswer: !!turn?.isAnswer,
    };
  }

  function syncSharedTurnRuntimeCanonical() {
    const api = getTurnRuntimeApi();
    if (!api || typeof api._reconcilePaginationSnapshot !== 'function') return false;

    const rows = Array.isArray(S.masterTurns) ? S.masterTurns.filter(Boolean) : [];
    const sig = rows.map((turn, idx) => {
      const gid = Math.max(1, Number(turn?.gid || idx + 1) || idx + 1);
      return [
        gid,
        String(turn?.role || '').trim(),
        String(turn?.uid || '').trim(),
        String(turn?.answerId || '').trim(),
        String(turn?.turnId || '').trim(),
      ].join(':');
    }).join('|');

    if (sig && sig === String(S.turnRuntimeCanonicalSig || '')) return false;

    try {
      api._reconcilePaginationSnapshot(rows);
      S.turnRuntimeCanonicalSig = sig;
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearSharedTurnRuntimeCanonical() {
    S.turnRuntimeCanonicalSig = '';
    S.turnRuntimePageStateSig = '';

    const api = getTurnRuntimeApi();
    if (!api || typeof api._clearPaginationSnapshot !== 'function') return false;
    try {
      api._clearPaginationSnapshot();
      return true;
    } catch (_) {
      return false;
    }
  }

  function resolveCurrentPageTurnBounds(win) {
    const turns = S.masterTurns;
    const answers = S.masterAnswers;
    if (!win || !turns.length || !answers.length) return { start: -1, end: -1 };

    const first = answers[win.answerStartIndex] || null;
    const last = answers[win.answerEndIndex] || null;
    if (!first || !last) return { start: -1, end: -1 };

    const start = resolveAnswerWindowStartTurnIndex(first);
    const end = resolveAnswerWindowEndTurnIndex(last);
    if (start < 0 || end < 0) return { start: -1, end: -1 };
    return { start, end };
  }

  function syncSharedTurnRuntimePageState(win) {
    const api = getTurnRuntimeApi();
    if (!api || typeof api.listTurnRecords !== 'function' || typeof api.patchTurnPageState !== 'function') return false;

    const records = api.listTurnRecords() || [];
    if (!Array.isArray(records) || !records.length) return false;

    const currentBounds = resolveCurrentPageTurnBounds(win);
    const sig = [
      Number(S.pageIndex || 0),
      Number(S.pageCount || 0),
      Number(win?.answerStartIndex ?? -1),
      Number(win?.answerEndIndex ?? -1),
      Number(win?.bufferedAnswerStartIndex ?? -1),
      Number(win?.bufferedAnswerEndIndex ?? -1),
      Number(currentBounds.start ?? -1),
      Number(currentBounds.end ?? -1),
      Number(win?.turnStart ?? -1),
      Number(win?.turnEnd ?? -1),
      Number(records.length || 0),
    ].join(':');
    if (sig === String(S.turnRuntimePageStateSig || '')) return false;

    const pageSize = getPageSize();
    const bufferAnswers = getBufferAnswers();
    const pageIndex = Number(S.pageIndex || 0) || 0;
    const pageCount = Number(S.pageCount || 1) || 1;
    const bufferedTurnStart = Number(win?.turnStart ?? -1);
    const bufferedTurnEnd = Number(win?.turnEnd ?? -1);

    for (const record of records) {
      const turnNo = Math.max(1, Number(record?.turnNo || record?.idx || 0) || 0);
      const turnIndex0 = turnNo - 1;
      const sourceTurn = S.masterTurns[turnIndex0] || null;
      const answerNumber = Math.max(0, Number(sourceTurn?.answerIndex || 0) || 0);
      const inCurrentPage = currentBounds.start >= 0 && currentBounds.end >= currentBounds.start
        ? (turnIndex0 >= currentBounds.start && turnIndex0 <= currentBounds.end)
        : false;
      const inBufferedWindow = bufferedTurnStart >= 0 && bufferedTurnEnd >= bufferedTurnStart
        ? (turnIndex0 >= bufferedTurnStart && turnIndex0 <= bufferedTurnEnd)
        : false;

      try {
        api.patchTurnPageState(record.turnId, {
          answerNumber: answerNumber > 0 ? answerNumber : null,
          answerIndex0: answerNumber > 0 ? (answerNumber - 1) : null,
          pageIndex,
          pageCount,
          pageSize,
          bufferAnswers,
          turnStart: currentBounds.start,
          turnEnd: currentBounds.end,
          answerStartIndex: Number(win?.answerStartIndex ?? -1),
          answerEndIndex: Number(win?.answerEndIndex ?? -1),
          bufferedAnswerStartIndex: Number(win?.bufferedAnswerStartIndex ?? -1),
          bufferedAnswerEndIndex: Number(win?.bufferedAnswerEndIndex ?? -1),
          inCurrentPage,
          inBufferedWindow,
        }, { owner: 'pagination' });
      } catch (_) {}
    }

    S.turnRuntimePageStateSig = sig;
    return true;
  }

  function clearMasterState() {
    const emptyTurns = [];
    const emptyAnswers = [];
    S.hasMaster = false;
    S.fullRoot = null;
    S.masterTurns = emptyTurns;
    S.masterAnswers = emptyAnswers;
    S.masterTurnUnits = emptyAnswers;
    S.masterTurnNodeSet = new Set();
    S.masterUidToTurn = new Map();
    S.viewTurnIndices = [];
    S.viewTurnIndexSet = new Set();
    S.visibleTurnIndices = [];
    S.visibleTurnStart = -1;
    S.visibleTurnEnd = -1;
    S.lastWindow = null;
    S.pageIndex = 0;
    S.pageCount = 1;
    S.pendingAddedTurnNodes.clear();
    S.suppressObserverUntil = 0;
    S.deferredRefreshNeeded = false;
    if (S.deferredRefreshTimer) {
      clearTimeout(S.deferredRefreshTimer);
      S.deferredRefreshTimer = 0;
    }
    clearSharedTurnRuntimeCanonical();
    syncLegacyRefs();
  }

  function recomputeMasterDerived() {
    const validTurns = [];
    const nextTurnSet = new Set();
    const nextUidMap = new Map();
    const nextAnswers = [];

    for (let i = 0; i < S.masterTurns.length; i += 1) {
      const turn = S.masterTurns[i];
      if (!turn || !isElementNode(turn.node)) continue;

      validTurns.push(turn);
    }

    for (let i = 0; i < validTurns.length; i += 1) {
      const turn = validTurns[i];
      turn.gid = i + 1;
      turn.role = detectTurnRole(turn.node);
      turn.uid = getPreferredUid(turn.node, turn.role, turn.gid);
      turn.answerEl = findAssistantEl(turn.node, turn.role);
      turn.answerId = turn.answerEl
        ? (getMessageLikeId(turn.answerEl) || getPreferredUid(turn.answerEl, 'assistant', turn.gid))
        : '';
      turn.isAnswer = !!turn.answerEl;
      turn.answerIndex = 0;
      turn.turnId = buildCanonicalTurnId(turn, turn.gid);

      nextTurnSet.add(turn.node);
      if (turn.uid && !nextUidMap.has(turn.uid)) nextUidMap.set(turn.uid, turn);

      if (turn.isAnswer) {
        const answerIndex = nextAnswers.length + 1;
        turn.answerIndex = answerIndex;
        nextAnswers.push({
          answerIndex,
          gid: turn.gid,
          uid: turn.answerId || turn.turnId || turn.uid,
          turnUid: turn.uid,
          turnId: turn.turnId,
          answerId: turn.answerId,
          primaryAId: turn.answerId,
          turnIndex: i,
          node: turn.node,
          el: turn.answerEl,
          answerEl: turn.answerEl,
          primaryAEl: turn.answerEl,
        });
      }
    }

    S.masterTurns = validTurns;
    S.masterTurnNodeSet = nextTurnSet;
    S.masterUidToTurn = nextUidMap;
    S.masterAnswers = nextAnswers;
    S.masterTurnUnits = nextAnswers;
    S.pageCount = Math.max(1, Math.ceil((S.masterAnswers.length || 0) / getPageSize()));
    S.pageIndex = clampInt(S.pageIndex, 0, Math.max(0, S.pageCount - 1), S.pageCount - 1);
    syncLegacyRefs();
    syncSharedTurnRuntimeCanonical();
  }

  function recomputeDerived() {
    recomputeMasterDerived();
  }

  function fullDiscoverMaster(root) {
    if (!isElementNode(root)) return false;
    const domTurns = discoverTurnNodes(root);
    if (!domTurns.length) return false;

    S.fullRoot = root;
    S.masterTurns = domTurns.map((node, idx) => makeTurnRecord(node, idx + 1));
    S.hasMaster = true;
    S.pendingAddedTurnNodes.clear();
    recomputeMasterDerived();
    return true;
  }

  function getActiveRootContainer() {
    if (isElementNode(S.fullRoot) && S.fullRoot.isConnected) return S.fullRoot;
    if (isElementNode(S.root) && S.root.isConnected) return S.root;
    return null;
  }

  function getRecoveryRootContainer() {
    const full = getActiveRootContainer();
    if (isElementNode(full)) return full;
    const found = findConversationRoot();
    return isElementNode(found) ? found : null;
  }

  function collectTurnCandidatesFromNode(node, outSet) {
    const root = getActiveRootContainer();
    if (!isElementNode(root) || !isElementNode(node) || isOurUiNode(node)) return;
    if (!(outSet instanceof Set)) return;

    const direct = toRootDirectChild(node, root);
    if (direct && !isOurUiNode(direct) && nodeLooksLikeTurn(direct)) outSet.add(direct);

    let nested = [];
    try { nested = Array.from(node.querySelectorAll(`${SEL_CONV_TURN}, ${SEL_MSG_ANY}`)); } catch (_) {}
    for (const el of nested) {
      if (!isElementNode(el) || isOurUiNode(el)) continue;
      const d = toRootDirectChild(el, root);
      if (d && !isOurUiNode(d) && nodeLooksLikeTurn(d)) outSet.add(d);
    }
  }

  function collectStructuralTurnCandidates(node, outSet) {
    if (!(outSet instanceof Set)) return false;
    const before = outSet.size;
    collectTurnCandidatesFromNode(node, outSet);
    return outSet.size > before;
  }

  function isTrackedTurnNodeUnderRoot(node, root = getActiveRootContainer()) {
    return !!(isElementNode(node) && node.isConnected && isElementNode(root) && root.contains(node));
  }

  function removedNodeTouchesTrackedTurnHost(node) {
    if (!isElementNode(node)) return false;
    if (!(S.masterTurnNodeSet instanceof Set) || !S.masterTurnNodeSet.size) return false;
    if (S.masterTurnNodeSet.has(node)) return true;
    for (const turnNode of S.masterTurnNodeSet) {
      if (!isElementNode(turnNode)) continue;
      try {
        if (node.contains(turnNode)) return true;
      } catch {}
    }
    return false;
  }

  function findInsertIndexByDomOrder(turns, node) {
    for (let i = 0; i < turns.length; i += 1) {
      const cur = turns[i];
      if (!cur || !isElementNode(cur.node) || !cur.node.isConnected) continue;
      if (compareDomOrder(node, cur.node) < 0) return i;
    }
    return turns.length;
  }

  function mergePendingMasterCandidates() {
    if (!S.hasMaster) return false;
    if (!S.pendingAddedTurnNodes.size) return false;

    const root = getActiveRootContainer();
    if (!isElementNode(root)) return false;

    const turns = S.masterTurns;
    const pending = Array.from(S.pendingAddedTurnNodes);
    S.pendingAddedTurnNodes.clear();
    let changed = false;

    for (const raw of pending) {
      if (!isElementNode(raw)) continue;
      const node = toRootDirectChild(raw, root) || (raw.parentElement === root ? raw : null);
      if (!isElementNode(node) || isOurUiNode(node) || !nodeLooksLikeTurn(node)) continue;

      const role = detectTurnRole(node);
      const uid = getPreferredUid(node, role, 0);
      const byUid = uid ? S.masterUidToTurn.get(uid) : null;
      if (byUid) {
        const oldNode = byUid.node;
        const keepExistingNode = oldNode !== node && isTrackedTurnNodeUnderRoot(oldNode, root);
        const nextNode = keepExistingNode ? oldNode : node;
        const nextRole = keepExistingNode ? byUid.role : role;
        const nextAnswerEl = keepExistingNode ? byUid.answerEl : findAssistantEl(node, role);
        const nextIsAnswer = keepExistingNode ? !!byUid.answerEl : !!nextAnswerEl;
        if (byUid.node !== nextNode) {
          byUid.node = nextNode;
          changed = true;
        }
        if (byUid.role !== nextRole || byUid.uid !== uid || byUid.answerEl !== nextAnswerEl || byUid.isAnswer !== nextIsAnswer) {
          changed = true;
        }
        byUid.role = nextRole;
        byUid.uid = uid;
        byUid.answerEl = nextAnswerEl;
        byUid.isAnswer = nextIsAnswer;
        S.masterTurnNodeSet.add(nextNode);
        if (isElementNode(oldNode) && oldNode !== nextNode) S.masterTurnNodeSet.delete(oldNode);
        continue;
      }

      if (S.masterTurnNodeSet.has(node)) continue;

      const rec = makeTurnRecord(node, 0);
      const idx = findInsertIndexByDomOrder(turns, node);
      turns.splice(idx, 0, rec);
      changed = true;
    }

    if (changed) debugLog('merge', { candidates: pending.length, masterTurns: turns.length });
    return changed;
  }

  function isTurnExpectedConnected(turnIndex) {
    if (!Number.isInteger(turnIndex) || turnIndex < 0) return false;
    if (!S.renderedOnce) return true;

    if (S.viewTurnIndexSet instanceof Set && S.viewTurnIndexSet.size) {
      return S.viewTurnIndexSet.has(turnIndex);
    }

    const win = S.lastWindow;
    if (win && Number.isFinite(win.turnStart) && Number.isFinite(win.turnEnd)) {
      const start = Math.max(0, win.turnStart);
      const end = Math.max(start, win.turnEnd);
      return turnIndex >= start && turnIndex <= end;
    }

    return false;
  }

  function getExpectedDisconnectedStats() {
    let expectedTotal = 0;
    let disconnected = 0;

    for (let i = 0; i < S.masterTurns.length; i += 1) {
      if (!isTurnExpectedConnected(i)) continue;
      expectedTotal += 1;
      const turn = S.masterTurns[i];
      if (!turn || !isElementNode(turn.node) || !turn.node.isConnected) disconnected += 1;
    }

    const ratio = expectedTotal > 0 ? (disconnected / expectedTotal) : 0;
    return { expectedTotal, disconnected, ratio };
  }

  function maybeRecoverMasterFromDom() {
    if (!S.hasMaster) return false;
    if (S.recoveryAttemptedChatId === S.chatId) return false;

    const total = S.masterTurns.length;
    const stats = getExpectedDisconnectedStats();
    if (stats.expectedTotal < RECOVERY_MIN_MASTER_TURNS) return false;
    if (stats.ratio < RECOVERY_DISCONNECTED_RATIO) return false;

    S.recoveryAttemptedChatId = S.chatId;
    debugLog('recovery:trigger', {
      total,
      expectedTotal: stats.expectedTotal,
      disconnected: stats.disconnected,
      ratio: stats.ratio,
    });
    const recoverRoot = getRecoveryRootContainer();
    if (!isElementNode(recoverRoot)) return false;
    const discovered = discoverTurnNodes(recoverRoot);
    if (discovered.length < Math.ceil(total * RECOVERY_DISCOVERY_RATIO)) return false;

    S.fullRoot = recoverRoot;
    S.masterTurns = discovered.map((node, idx) => makeTurnRecord(node, idx + 1));
    S.hasMaster = true;
    debugLog('recovery:success', { discovered: discovered.length, total });
    return true;
  }

  function removeSentinelsFromRoot(root) {
    if (!isElementNode(root)) return;
    if (S.ui.topBox && S.ui.topBox.parentElement === root) S.ui.topBox.remove();
    if (S.ui.viewBox && S.ui.viewBox.parentElement === root) S.ui.viewBox.remove();
    if (S.ui.bottomBox && S.ui.bottomBox.parentElement === root) S.ui.bottomBox.remove();
  }

  function ensureRootObserver() {
    if (!isElementNode(S.root) || typeof MutationObserver !== 'function') return;
    if (S.rootObserver && S.rootObservedEl === S.root) return;

    if (S.rootObserver) {
      try { S.rootObserver.disconnect(); } catch (_) {}
      S.rootObserver = null;
      S.rootObservedEl = null;
    }

    S.rootObserver = new MutationObserver((mutations) => {
      if (!S.booted) return;
      if (S.isRendering) return;

      let hasRealMutation = false;
      for (const m of mutations) {
        if (!m || m.type !== 'childList') continue;

        if (m.addedNodes && m.addedNodes.length) {
          for (const n of Array.from(m.addedNodes)) {
            if (!isElementNode(n) || isInsideOwnedUi(n)) continue;
            if (!mutationAffectsConversationStructure(n)) continue;
            if (collectStructuralTurnCandidates(n, S.pendingAddedTurnNodes)) hasRealMutation = true;
          }
        }

        if (m.removedNodes && m.removedNodes.length) {
          for (const n of Array.from(m.removedNodes)) {
            if (!isElementNode(n) || isInsideOwnedUi(n)) continue;
            if (!removedNodeTouchesTrackedTurnHost(n)) continue;
            hasRealMutation = true;
            break;
          }
        }
      }

      const now = Date.now();
      if (now < S.suppressObserverUntil) {
        if (hasRealMutation) {
          S.deferredRefreshNeeded = true;
          armDeferredRefreshFlush();
        }
        return;
      }

      if (S.deferredRefreshNeeded) {
        S.deferredRefreshNeeded = false;
        scheduleRefresh('mo:deferred');
        return;
      }

      if (hasRealMutation) scheduleRefresh('mo');
    });

    try {
      S.rootObserver.observe(S.root, { childList: true, subtree: true });
      S.rootObservedEl = S.root;
    } catch (_) {
      S.rootObserver = null;
      S.rootObservedEl = null;
    }
  }

  function installStartObserver() {
    if (S.startObserver || typeof MutationObserver !== 'function') return;
    S.startObserver = new MutationObserver(() => {
      const ok = rebuildIndex('start:observer');
      if (ok) {
        disconnectStartObserver();
        renderPageWithHub(S.pageIndex, 'start:observer');
      }
    });
    try {
      S.startObserver.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {
      S.startObserver = null;
    }
  }

  function disconnectStartObserver() {
    if (!S.startObserver) return;
    try { S.startObserver.disconnect(); } catch (_) {}
    S.startObserver = null;
  }

  function disconnectRootObserver() {
    if (!S.rootObserver) return;
    try { S.rootObserver.disconnect(); } catch (_) {}
    S.rootObserver = null;
    S.rootObservedEl = null;
  }

  function unbindObserverHub() {
    if (typeof S.offObsReady === 'function') {
      try { S.offObsReady(); } catch (_) {}
    }
    if (typeof S.offObsMut === 'function') {
      try { S.offObsMut(); } catch (_) {}
    }
    S.offObsReady = null;
    S.offObsMut = null;
  }

  function bindObserverHub() {
    const hub = getObserverHub();
    if (!hub) {
      unbindObserverHub();
      return false;
    }

    unbindObserverHub();

    S.offObsReady = hub.onReady('pgnw:ready', () => {
      if (!S.booted) return;
      scheduleRefresh('obs:ready');
    }, { immediate: true });

    S.offObsMut = hub.onMutations('pgnw:mut', (payload) => {
      if (!S.booted) return;
      if (!payload?.conversationRelevant) return;
      if (S.isRendering) return;

      const normalizedAddedTurnCandidates = new Set();
      if (payload.addedTurnCandidates instanceof Set) {
        for (const el of payload.addedTurnCandidates) {
          if (!isElementNode(el)) continue;
          collectStructuralTurnCandidates(el, normalizedAddedTurnCandidates);
        }
      }
      const hasStructuralMutation =
        !!(normalizedAddedTurnCandidates.size || payload.removedTurnLike);
      if (!hasStructuralMutation) return;

      for (const el of normalizedAddedTurnCandidates) {
        S.pendingAddedTurnNodes.add(el);
      }

      if (payload.suppressActive) {
        S.deferredRefreshNeeded = true;
        armDeferredRefreshFlush();
        return;
      }

      if (S.deferredRefreshNeeded) {
        S.deferredRefreshNeeded = false;
        scheduleRefresh('obs:deferred');
        return;
      }

      scheduleRefresh(payload.deferred ? 'obs:deferred' : 'obs:mut');
    });

    disconnectStartObserver();
    disconnectRootObserver();
    try { hub.ensureRoot('pagination:bind'); } catch (_) {}
    return true;
  }

  function buildStyleText(styleMode) {
    const base = `
/* ${EMOJI_HDR} ${MODICON} ${MODTAG} */
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel{
  display:flex;
  justify-content:center;
  align-items:center;
  margin:10px 0;
  pointer-events:auto;
}
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel > button[data-cgxui-owner="${SkID}"]{
  appearance:none;
  border-radius:10px;
  padding:7px 12px;
  font:600 12px/1.2 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  cursor:pointer;
}
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel > button[data-cgxui-owner="${SkID}"]:disabled{
  opacity:0.45;
  cursor:default;
}
.cgxui-pgnw-sentinel{
  display:flex;
  justify-content:center;
  align-items:center;
  margin: 14px 0 18px;
  --pgnw-band-fg: rgba(243,244,246,0.75);
  --pgnw-band-border: rgba(255,255,255,0.07);
  --pgnw-band-bg: rgba(255,255,255,0.03);
  --pgnw-band-bg-hover: rgba(255,255,255,0.07);
}
.cgxui-pgnw-sentinel > button{
  min-width: 260px;
  padding: 8px 20px;
  border-radius: 999px;
  border: 1px solid var(--pgnw-band-border);
  background: var(--pgnw-band-bg);
  color: var(--pgnw-band-fg);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.cgxui-pgnw-sentinel > button:hover:not(:disabled){
  background: var(--pgnw-band-bg-hover);
}
.cgxui-pgnw-sentinel > button:disabled{
  opacity: 0.4;
  cursor: default;
}
/* Latest page — subtle, clearly at-the-end feel */
.cgxui-pgnw-sentinel[data-on-last="1"] > button[data-on-last="1"]{
  --pgnw-band-fg: rgba(255,255,255,0.28);
  --pgnw-band-border: rgba(255,255,255,0.05);
  --pgnw-band-bg: transparent;
  min-width: 0;
  padding: 6px 14px;
  font-size: 11px;
  font-weight: 400;
  letter-spacing: 0.04em;
  cursor: default;
  pointer-events: none;
}
.cgxui-pgnw-sentinel[data-page-band="normal"],
.cgxui-pgnw-sentinel > button[data-page-band="normal"]{
  --pgnw-band-fg: rgba(167,243,208,0.80);
  --pgnw-band-border: rgba(16,185,129,0.18);
  --pgnw-band-bg: rgba(6,95,70,0.10);
  --pgnw-band-bg-hover: rgba(16,185,129,0.14);
}
.cgxui-pgnw-sentinel[data-page-band="teal"],
.cgxui-pgnw-sentinel > button[data-page-band="teal"]{
  --pgnw-band-fg: rgba(253,230,138,0.80);
  --pgnw-band-border: rgba(234,179,8,0.18);
  --pgnw-band-bg: rgba(113,63,18,0.12);
  --pgnw-band-bg-hover: rgba(202,138,4,0.16);
}
.cgxui-pgnw-sentinel[data-page-band="blue"],
.cgxui-pgnw-sentinel > button[data-page-band="blue"]{
  --pgnw-band-fg: rgba(191,219,254,0.80);
  --pgnw-band-border: rgba(96,165,250,0.18);
  --pgnw-band-bg: rgba(23,37,84,0.14);
  --pgnw-band-bg-hover: rgba(37,99,235,0.18);
}
.cgxui-pgnw-sentinel[data-page-band="darkred"],
.cgxui-pgnw-sentinel > button[data-page-band="darkred"]{
  --pgnw-band-fg: rgba(252,165,165,0.80);
  --pgnw-band-border: rgba(220,38,38,0.18);
  --pgnw-band-bg: rgba(69,10,10,0.14);
  --pgnw-band-bg-hover: rgba(185,28,28,0.18);
}
.cgxui-pgnw-sentinel[data-page-band="violet"],
.cgxui-pgnw-sentinel > button[data-page-band="violet"]{
  --pgnw-band-fg: rgba(221,214,254,0.80);
  --pgnw-band-border: rgba(139,92,246,0.18);
  --pgnw-band-bg: rgba(46,16,101,0.14);
  --pgnw-band-bg-hover: rgba(124,58,237,0.18);
}
.cgxui-pgnw-page-divider{
  display:flex;
  align-items:center;
  gap:12px;
  margin: 22px 0 18px;
  --pgnw-band-fg: rgba(243,244,246,0.98);
  --pgnw-band-border: rgba(255,255,255,0.12);
  --pgnw-band-bg: rgba(45,48,56,0.96);
}
.cgxui-pgnw-page-divider-line{
  flex:1 1 auto;
  min-width: 24px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--pgnw-band-border) 85%, white 15%) 12%,
    color-mix(in srgb, var(--pgnw-band-border) 88%, white 12%) 88%,
    transparent 100%
  );
  opacity: 0.9;
}
.cgxui-pgnw-page-divider-pill{
  flex:0 0 auto;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-width: 108px;
  padding: 7px 14px;
  border-radius: 999px;
  border:1px solid var(--pgnw-band-border);
  background: color-mix(in srgb, var(--pgnw-band-bg) 82%, transparent);
  color: var(--pgnw-band-fg);
  font: 700 11px/1.1 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
}
.cgxui-pgnw-page-divider[data-page-band="normal"]{
  --pgnw-band-fg: rgba(236,253,245,0.98);
  --pgnw-band-border: rgba(16,185,129,0.24);
  --pgnw-band-bg: rgba(5,150,105,0.34);
}
.cgxui-pgnw-page-divider[data-page-band="teal"]{
  --pgnw-band-fg: rgba(254,252,232,0.98);
  --pgnw-band-border: rgba(250,204,21,0.24);
  --pgnw-band-bg: rgba(161,98,7,0.34);
}
.cgxui-pgnw-page-divider[data-page-band="blue"]{
  --pgnw-band-fg: rgba(239,246,255,0.98);
  --pgnw-band-border: rgba(96,165,250,0.24);
  --pgnw-band-bg: rgba(29,78,216,0.34);
}
.cgxui-pgnw-page-divider[data-page-band="darkred"]{
  --pgnw-band-fg: rgba(254,242,242,0.98);
  --pgnw-band-border: rgba(220,38,38,0.24);
  --pgnw-band-bg: rgba(153,27,27,0.34);
}
.cgxui-pgnw-page-divider[data-page-band="violet"]{
  --pgnw-band-fg: rgba(245,243,255,0.98);
  --pgnw-band-border: rgba(139,92,246,0.24);
  --pgnw-band-bg: rgba(109,40,217,0.34);
}
`;
    if (styleMode === 'off') {
      return `${base}
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel > button[data-cgxui-owner="${SkID}"]{
  border:1px solid transparent;
  background:transparent;
  color:inherit;
}
`;
    }
    if (styleMode === 'conservative') {
      return `${base}
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel > button[data-cgxui-owner="${SkID}"]{
  border:1px solid var(--pgnw-band-border, rgba(255,255,255,0.22));
  background:var(--pgnw-band-bg, rgba(17,17,17,0.84));
  color:var(--pgnw-band-fg, rgba(229,231,235,1));
  opacity:0.95;
  box-shadow:none;
}
`;
    }
    return `${base}
[data-cgxui-owner="${SkID}"].cgxui-${SkID}-sentinel > button[data-cgxui-owner="${SkID}"]{
  border:1px solid var(--pgnw-band-border, color-mix(in srgb, var(--cgxui-fg, #fff) 22%, transparent));
  background:var(--pgnw-band-bg, color-mix(in srgb, var(--cgxui-bg, #111) 84%, transparent));
  color:var(--pgnw-band-fg, var(--cgxui-fg, #e5e7eb));
  opacity:0.95;
  box-shadow:none;
}
`;
  }

  function installStyleOnce() {
    const styleMode = getStyleMode();
    if (styleMode === 'off') {
      try { document.getElementById(CSS_STYLE_ID)?.remove(); } catch (_) {}
      if (S.ui.appliedStyleMode !== styleMode) {
        S.ui.appliedStyleMode = styleMode;
        debugLog('style-mode-applied', { styleMode });
      }
      return;
    }
    const cssText = buildStyleText(styleMode);
    let style = document.getElementById(CSS_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = CSS_STYLE_ID;
      document.documentElement.appendChild(style);
    }
    if (style.textContent !== cssText) style.textContent = cssText;
    if (S.ui.appliedStyleMode !== styleMode) {
      S.ui.appliedStyleMode = styleMode;
      debugLog('style-mode-applied', { styleMode });
    }
  }

  function ensureViewContainer() {
    if (S.ui.viewBox && isElementNode(S.ui.viewBox)) return S.ui.viewBox;
    const box = document.createElement('div');
    box.className = `cgxui-${SkID}-view`;
    box.setAttribute(ATTR_CGX_OWNER, SkID);
    box.setAttribute(ATTR_CGX_ID, 'pagination-view');
    S.ui.viewBox = box;
    return box;
  }

  function ensureSentinels() {
    if (!S.ui.topBox || !S.ui.topBtn) {
      const topBox = document.createElement('div');
      topBox.className = `cgxui-${SkID}-sentinel cgxui-${SkID}-sentinel-top cgxui-pgnw-sentinel`;
      topBox.setAttribute(ATTR_CGX_OWNER, SkID);
      topBox.setAttribute(ATTR_CGX_ID, 'pagination-top');

      const topBtn = document.createElement('button');
      topBtn.type = 'button';
      topBtn.textContent = '\u2B06 Load older';
      topBtn.setAttribute(ATTR_CGX_OWNER, SkID);
      topBtn.setAttribute(ATTR_CGX_ID, 'pagination-top-btn');
      if (!S.onTopClick) S.onTopClick = () => { goOlder('ui:top'); };
      topBtn.addEventListener('click', S.onTopClick);

      topBox.appendChild(topBtn);
      S.ui.topBox = topBox;
      S.ui.topBtn = topBtn;
    }

    if (!S.ui.bottomBox || !S.ui.bottomBtn) {
      const bottomBox = document.createElement('div');
      bottomBox.className = `cgxui-${SkID}-sentinel cgxui-${SkID}-sentinel-bottom cgxui-pgnw-sentinel`;
      bottomBox.setAttribute(ATTR_CGX_OWNER, SkID);
      bottomBox.setAttribute(ATTR_CGX_ID, 'pagination-bottom');

      const bottomBtn = document.createElement('button');
      bottomBtn.type = 'button';
      bottomBtn.textContent = '\u2B07 Load newer';
      bottomBtn.setAttribute(ATTR_CGX_OWNER, SkID);
      bottomBtn.setAttribute(ATTR_CGX_ID, 'pagination-bottom-btn');
      if (!S.onBottomClick) S.onBottomClick = () => { goNewer('ui:bottom'); };
      bottomBtn.addEventListener('click', S.onBottomClick);

      bottomBox.appendChild(bottomBtn);
      S.ui.bottomBox = bottomBox;
      S.ui.bottomBtn = bottomBtn;
    }

    ensureAutoLoadObserver();
  }

  function ensureAutoLoadObserver() {
    if (!isAutoLoadSentinelEnabled()) return;
    if (typeof IntersectionObserver !== 'function') return;
    if (!S.ui.topBox || !S.ui.bottomBox) return;
    if (S.autoLoadObserver) return;

    S.autoLoadObserver = new IntersectionObserver((entries) => {
      const now = Date.now();
      if (now - S.autoLoadLastAt < AUTO_LOAD_GAP_MS) return;

      for (const e of entries) {
        if (!e || !e.isIntersecting) continue;
        if (e.target === S.ui.topBox && S.ui.topBtn && !S.ui.topBtn.disabled) {
          S.autoLoadLastAt = now;
          goOlder('auto:sentinel');
          return;
        }
        if (e.target === S.ui.bottomBox && S.ui.bottomBtn && !S.ui.bottomBtn.disabled) {
          S.autoLoadLastAt = now;
          goNewer('auto:sentinel');
          return;
        }
      }
    }, { root: null, threshold: 0.85 });

    try {
      S.autoLoadObserver.observe(S.ui.topBox);
      S.autoLoadObserver.observe(S.ui.bottomBox);
    } catch (_) {
      try { S.autoLoadObserver.disconnect(); } catch (_) {}
      S.autoLoadObserver = null;
    }
  }

  function disconnectAutoLoadObserver() {
    if (!S.autoLoadObserver) return;
    try { S.autoLoadObserver.disconnect(); } catch (_) {}
    S.autoLoadObserver = null;
  }

  function buildAnswerRangePayload(win) {
    if (!win || !S.masterAnswers.length || win.answerStartIndex < 0 || win.answerEndIndex < 0) {
      return {
        start: 0,
        end: 0,
        total: S.masterAnswers.length || 0,
        pageSize: getPageSize(),
        startGid: 0,
        endGid: 0,
      };
    }
    const startAnswer = win.answerStartIndex + 1;
    const endAnswer = win.answerEndIndex + 1;
    const startAns = S.masterAnswers[win.answerStartIndex] || null;
    const endAns = S.masterAnswers[win.answerEndIndex] || null;
    return {
      start: startAnswer,
      end: endAnswer,
      total: S.masterAnswers.length,
      pageSize: getPageSize(),
      startGid: startAns ? startAns.gid : 0,
      endGid: endAns ? endAns.gid : 0,
    };
  }

  function buildBufferedAnswerRangePayload(win) {
    if (!win || !S.masterAnswers.length || win.bufferedAnswerStartIndex < 0 || win.bufferedAnswerEndIndex < 0) {
      return {
        start: 0,
        end: 0,
        total: S.masterAnswers.length || 0,
        buffer: getBufferAnswers(),
        startGid: 0,
        endGid: 0,
      };
    }
    const startAnswer = win.bufferedAnswerStartIndex + 1;
    const endAnswer = win.bufferedAnswerEndIndex + 1;
    const startAns = S.masterAnswers[win.bufferedAnswerStartIndex] || null;
    const endAns = S.masterAnswers[win.bufferedAnswerEndIndex] || null;
    return {
      start: startAnswer,
      end: endAnswer,
      total: S.masterAnswers.length,
      buffer: getBufferAnswers(),
      startGid: startAns ? startAns.gid : 0,
      endGid: endAns ? endAns.gid : 0,
    };
  }

  function pageBandNameFromPageIndex(pageIndex) {
    const p = Math.max(0, Number(pageIndex || 0));
    if (p === 0) return 'normal';
    if (p === 1) return 'teal';
    if (p === 2) return 'blue';
    if (p === 3) return 'darkred';
    return 'violet';
  }

  function pageBandNameFromTurnIndex(turnIndex) {
    const idx = Math.max(0, Number(turnIndex || 0));
    const pageIndex = Math.floor(idx / CFG_PAGE_BAND_SIZE);
    return pageBandNameFromPageIndex(pageIndex);
  }

  function getPageNumberForAnswerIndex(answerIndex) {
    const idx = Math.max(1, Number(answerIndex || 1));
    return Math.max(1, Math.ceil(idx / CFG_PAGE_BAND_SIZE));
  }

  function resolveAnswerWindowStartTurnIndex(answer) {
    const turns = S.masterTurns;
    if (!turns.length) return -1;

    const rawTurnIndex = Number(answer?.turnIndex);
    if (!Number.isFinite(rawTurnIndex) || rawTurnIndex < 0) return -1;

    let turnIndex = clampInt(rawTurnIndex, 0, turns.length - 1, 0);
    const current = turns[turnIndex] || null;
    const prev = turnIndex > 0 ? (turns[turnIndex - 1] || null) : null;
    if (prev && prev.role === 'user' && current && current.role === 'assistant') {
      turnIndex -= 1;
    }
    return turnIndex;
  }

  function resolveAnswerWindowEndTurnIndex(answer) {
    const turns = S.masterTurns;
    if (!turns.length) return -1;

    const rawTurnIndex = Number(answer?.turnIndex);
    if (!Number.isFinite(rawTurnIndex) || rawTurnIndex < 0) return -1;

    let turnIndex = clampInt(rawTurnIndex, 0, turns.length - 1, 0);
    const next = turnIndex < turns.length - 1 ? (turns[turnIndex + 1] || null) : null;
    if (next && next.role === 'user') {
      turnIndex += 1;
    }
    return turnIndex;
  }

  function buildPageDividerMapForTurnRange(startTurnIndex, endTurnIndex) {
    const map = new Map();
    const turns = S.masterTurns;
    if (!turns.length) return map;

    const pageSize = getPageSize();
    const start = Math.max(0, Number(startTurnIndex || 0));
    const end = Math.max(start, Number(endTurnIndex || start));

    // Page boundaries must be based on the true Q+A pair number (Core turnNo),
    // NOT answerIndex. answerIndex skips unanswered-question turns, so
    // answerIndex=26 can equal pair 27 when e.g. pair 19 has no answer.
    // Core turnNo always equals the real pair count (1..N including gaps).
    const rt = (typeof W !== 'undefined') ? (W?.H2O?.turnRuntime || null) : null;

    for (let i = start; i <= end; i += 1) {
      const turn = turns[i] || null;
      if (!turn) continue;
      // Only answered turns can anchor a page boundary.
      const answerIndex = Math.max(0, Number(turn?.answerIndex || 0) || 0);
      if (answerIndex <= 0) continue;

      // Resolve the true pair number via Core turnRuntime.
      let pairNo = 0;
      const aId = String(turn?.answerId || '').trim();
      if (rt && aId) {
        try {
          const rec = rt.getTurnRecordByAId?.(aId) || null;
          pairNo = Math.max(0, Number(rec?.turnNo || rec?.idx || 0) || 0);
        } catch {}
      }
      // Fallback: answerIndex (only correct when no unanswered turns before this answer).
      if (!pairNo) pairNo = answerIndex;

      // Place a divider before the first pair of every page after page 1.
      if ((pairNo - 1) % pageSize !== 0) continue;
      const pageNum = Math.max(1, Math.ceil(pairNo / pageSize));
      // pageNum 1 divider IS wanted — it marks the start of page 1 at the top.

      // When Q and A are separate masterTurns nodes, this turn (i) is the
      // A-node. The divider must go before the paired Q-node so it appears
      // before the full Q+A pair, not between Q and A.
      let dividerIndex = i;
      if (i > 0) {
        const prev = turns[i - 1] || null;
        if (prev && String(prev.role || '').trim() === 'user') {
          dividerIndex = i - 1;
        }
      }

      if (map.has(dividerIndex)) continue;
      const boundaryGid = Math.max(1, Number(turn?.gid || turn?.turnNo || i + 1) || (i + 1));
      map.set(dividerIndex, {
        pageNum,
        band: pageBandNameFromTurnIndex(pairNo - 1),
        answerIndex,
        turnGid: boundaryGid,
      });
    }
    return map;
  }

  function createInlinePageDivider(pageNum, band, answerIndex, turnGid = 0) {
    const div = document.createElement('div');
    div.className = 'cgxui-pgnw-page-divider';
    div.setAttribute(ATTR_CGX_OWNER, SkID);
    div.setAttribute(ATTR_CGX_ID, 'pagination-page-divider');
    div.setAttribute('data-cgxui-chat-page-divider', '1');
    div.setAttribute('data-page-num', String(pageNum || 1));
    div.setAttribute('data-page-band', String(band || 'normal'));
    if (Number.isFinite(answerIndex) && answerIndex > 0) {
      div.setAttribute('data-answer-index', String(answerIndex));
    }
    if (Number.isFinite(turnGid) && turnGid > 0) {
      div.setAttribute('data-turn-gid', String(turnGid));
    }

    const left = document.createElement('span');
    left.className = 'cgxui-pgnw-page-divider-line';

    const pill = document.createElement('span');
    pill.className = 'cgxui-pgnw-page-divider-pill';

    const dot = document.createElement('span');
    dot.className = 'cgxui-pgnw-page-divider-dot';
    dot.setAttribute('aria-hidden', 'true');

    const textEl = document.createElement('span');
    textEl.className = 'cgxui-pgnw-page-divider-text';
    textEl.textContent = `Page ${pageNum}`;

    pill.append(dot, textEl);

    const right = document.createElement('span');
    right.className = 'cgxui-pgnw-page-divider-line';

    div.append(left, pill, right);
    return div;
  }

  function emitPageChanged(win, reason) {
    const turns = S.masterTurns;
    const detail = {
      source: 'pagination-windowing',
      reason: String(reason || ''),
      pageIndex: S.pageIndex,
      pageCount: S.pageCount,
      pageSize: getPageSize(),
      bufferAnswers: getBufferAnswers(),
      totalTurns: turns.length,
      totalAnswers: S.masterAnswers.length,
      answerRange: buildAnswerRangePayload(win),
      bufferedAnswerRange: buildBufferedAnswerRangePayload(win),
      turnRange: {
        startGid: win && Number.isFinite(win.turnStart) && win.turnStart >= 0 && turns[win.turnStart] ? turns[win.turnStart].gid : 0,
        endGid: win && Number.isFinite(win.turnEnd) && win.turnEnd >= 0 && turns[win.turnEnd] ? turns[win.turnEnd].gid : 0,
      },
      ts: Date.now(),
    };

    debugLog('page-changed', {
      reason: detail.reason,
      pageIndex: detail.pageIndex,
      pageCount: detail.pageCount,
      answerRange: detail.answerRange,
      bufferedAnswerRange: detail.bufferedAnswerRange,
    });
    safeDispatch(EV_PAGE_CHANGED, detail);
    syncCommandBarControls();
  }

  function computePageWindow(pageIndex) {
    const turns = S.masterTurns;
    const answers = S.masterAnswers;
    if (!turns.length) return null;

    const pageSize = getPageSize();
    const bufferAnswers = getBufferAnswers();
    const pageCount = Math.max(1, Math.ceil((answers.length || 0) / pageSize));
    const idx = clampInt(pageIndex, 0, Math.max(0, pageCount - 1), 0);

    if (!answers.length) {
      return {
        pageIndex: idx,
        pageCount,
        answerStartIndex: -1,
        answerEndIndex: -1,
        bufferedAnswerStartIndex: -1,
        bufferedAnswerEndIndex: -1,
        turnStart: 0,
        turnEnd: Math.max(0, turns.length - 1),
      };
    }

    const ansStart = idx * pageSize;
    const ansEndExclusive = Math.min(ansStart + pageSize, answers.length);
    const ansEnd = Math.max(ansStart, ansEndExclusive - 1);
    const bufStart = Math.max(0, ansStart - bufferAnswers);
    const bufEnd = Math.min(answers.length - 1, ansEnd + bufferAnswers);

    const firstBuf = answers[bufStart];
    const lastBuf = answers[bufEnd];
    if (!firstBuf || !lastBuf) return null;

    const turnStart = resolveAnswerWindowStartTurnIndex(firstBuf);
    const turnEnd = resolveAnswerWindowEndTurnIndex(lastBuf);
    if (turnStart < 0 || turnEnd < 0) return null;

    return {
      pageIndex: idx,
      pageCount,
      answerStartIndex: ansStart,
      answerEndIndex: ansEnd,
      bufferedAnswerStartIndex: bufStart,
      bufferedAnswerEndIndex: bufEnd,
      turnStart,
      turnEnd,
    };
  }

  function findAssistantForTurn(turn) {
    if (!turn) return null;
    if (turn.answerEl && turn.answerEl.isConnected) return turn.answerEl;
    turn.answerEl = findAssistantEl(turn.node, turn.role);
    return turn.answerEl || null;
  }

  function findRenderedPageDivider(pageNum) {
    const num = Math.max(1, Number(pageNum || 1) || 1);
    if (num <= 1) return null;

    const root =
      (isElementNode(S.ui.viewBox) && S.ui.viewBox.isConnected)
        ? S.ui.viewBox
        : ((isElementNode(S.root) && S.root.isConnected) ? S.root : null);
    if (!root) return null;

    try {
      return root.querySelector(`.cgxui-pgnw-page-divider[data-page-num="${String(num)}"]`);
    } catch (_) {
      return null;
    }
  }

  function resolvePageStartTarget(win) {
    if (!win) return null;

    const pageNum = Math.max(1, Number(win.pageIndex || 0) + 1);
    const dividerEl = findRenderedPageDivider(pageNum);
    if (dividerEl && dividerEl.isConnected) return dividerEl;

    const firstAnswer = Number.isFinite(win.answerStartIndex) && win.answerStartIndex >= 0
      ? (S.masterAnswers[win.answerStartIndex] || null)
      : null;
    const answerTurn = Number.isFinite(firstAnswer?.turnIndex)
      ? (S.masterTurns[firstAnswer.turnIndex] || null)
      : null;
    const answerEl =
      firstAnswer?.primaryAEl ||
      firstAnswer?.answerEl ||
      firstAnswer?.el ||
      findAssistantForTurn(answerTurn);
    if (answerEl && answerEl.isConnected) return answerEl;

    const startTurn = Number.isFinite(win.turnStart) && win.turnStart >= 0
      ? (S.masterTurns[win.turnStart] || null)
      : null;
    if (startTurn?.node?.isConnected) return startTurn.node;
    return null;
  }

  function scrollToPageStartTarget(target, smooth = true) {
    if (!isElementNode(target) || !target.isConnected) return false;
    const run = () => {
      if (!target.isConnected) return;
      try {
        target.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
      } catch (_) {
        try {
          const rect = target.getBoundingClientRect();
          const top = rect.top + (W.scrollY || W.pageYOffset || 0);
          W.scrollTo({ top, left: 0, behavior: smooth ? 'smooth' : 'auto' });
        } catch {
          try { target.scrollIntoView(true); } catch {}
        }
      }
    };
    if (smooth) {
      W.requestAnimationFrame(run);
    } else {
      run();
    }
    return true;
  }

  function jumpViewportToElement(target, block = 'start') {
    if (!isElementNode(target) || !target.isConnected) return false;
    const nextBlock = block === 'end' ? 'end' : 'start';
    try {
      target.scrollIntoView({ block: nextBlock, behavior: 'auto' });
      return true;
    } catch (_) {
      try {
        const rect = target.getBoundingClientRect();
        const top = rect.top + (W.scrollY || W.pageYOffset || 0);
        const viewportH = Math.max(0, W.innerHeight || document.documentElement?.clientHeight || 0);
        const offset = nextBlock === 'end'
          ? Math.max(0, viewportH - rect.height)
          : 0;
        W.scrollTo({ top: Math.max(0, top - offset), left: 0, behavior: 'auto' });
        return true;
      } catch {
        try { target.scrollIntoView(nextBlock === 'start'); } catch {}
      }
    }
    return true;
  }

  function stageViewportForPageJumpDirection(direction) {
    const dir = Math.sign(Number(direction || 0));
    if (!dir) return false;

    if (dir < 0 && isElementNode(S.ui.bottomBox) && S.ui.bottomBox.isConnected) {
      return jumpViewportToElement(S.ui.bottomBox, 'end');
    }
    if (dir > 0 && isElementNode(S.ui.topBox) && S.ui.topBox.isConnected) {
      return jumpViewportToElement(S.ui.topBox, 'start');
    }
    return false;
  }

  function captureScrollAnchor() {
    if (!S.turns.length) return null;

    const start = Number.isFinite(S.visibleTurnStart) ? S.visibleTurnStart : 0;
    const end = Number.isFinite(S.visibleTurnEnd) ? S.visibleTurnEnd : (S.turns.length - 1);

    let bestPositive = null;
    let bestNegative = null;
    for (let i = Math.max(0, start); i <= Math.min(end, S.turns.length - 1); i += 1) {
      const turn = S.turns[i];
      if (!turn) continue;
      const answerEl = findAssistantForTurn(turn);
      if (!answerEl || !answerEl.isConnected) continue;

      const rect = answerEl.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= W.innerHeight) continue;

      const anchor = {
        uid: turn.uid,
        gid: turn.gid,
        offsetTop: rect.top,
      };

      if (rect.top >= 0) {
        if (!bestPositive || rect.top < bestPositive.offsetTop) bestPositive = anchor;
      } else if (!bestNegative || rect.top > bestNegative.offsetTop) {
        bestNegative = anchor;
      }
    }

    return bestPositive || bestNegative || null;
  }

  function resolveAnchorTarget(anchor) {
    if (!anchor) return null;

    const byUid = anchor.uid ? S.uidToTurn.get(anchor.uid) : null;
    if (byUid && byUid.node && byUid.node.isConnected) {
      const a = findAssistantForTurn(byUid);
      if (a && a.isConnected) return a;
    }

    if (Number.isFinite(anchor.gid) && anchor.gid > 0) {
      const exact = S.turns.find((t) => t && t.gid === anchor.gid && t.node && t.node.isConnected);
      if (exact) {
        const a = findAssistantForTurn(exact);
        if (a && a.isConnected) return a;
      }
    }

    let best = null;
    let bestDist = Number.POSITIVE_INFINITY;
    const start = Math.max(0, S.visibleTurnStart);
    const end = Math.min(S.turns.length - 1, Math.max(start, S.visibleTurnEnd));
    for (let i = start; i <= end; i += 1) {
      const turn = S.turns[i];
      if (!turn || !turn.node || !turn.node.isConnected) continue;
      const a = findAssistantForTurn(turn);
      if (!a || !a.isConnected) continue;
      const dist = Math.abs((turn.gid || 0) - (anchor.gid || 0));
      if (dist < bestDist) {
        bestDist = dist;
        best = a;
      }
    }
    return best;
  }

  function restoreScrollAnchor(anchor) {
    if (!anchor || !Number.isFinite(anchor.offsetTop)) return;

    W.requestAnimationFrame(() => {
      const target = resolveAnchorTarget(anchor);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      if (!Number.isFinite(rect.top)) return;

      const delta = rect.top - anchor.offsetTop;
      if (!Number.isFinite(delta)) return;
      if (Math.abs(delta) < 1) return;
      if (Math.abs(delta) > 12000) return;

      try { W.scrollBy({ top: delta, left: 0, behavior: 'auto' }); } catch (_) { W.scrollBy(0, delta); }
    });
  }

  function updateSentinelState(win) {
    if (!S.ui.topBtn || !S.ui.bottomBtn) return;

    const onFirst = S.pageIndex <= 0;
    const onLast = S.pageIndex >= Math.max(0, S.pageCount - 1);
    const pageCount = S.pageCount;

    // Both sentinel buttons show the DESTINATION page — the page you land on
    // after clicking, not the page you are currently on.
    //
    // Top "Load older"  → destination = previous page (pageIndex - 1)
    // Bottom "Load more" → destination = next page     (pageIndex + 1)

    const prevPageIndex = Math.max(0, S.pageIndex - 1);
    const prevPageFace  = `Page ${prevPageIndex + 1}/${pageCount}`;
    const prevBand      = pageBandNameFromPageIndex(prevPageIndex);

    const nextPageIndex = Math.min(S.pageIndex + 1, Math.max(0, pageCount - 1));
    const nextPageFace  = `Page ${nextPageIndex + 1}/${pageCount}`;
    const nextBand      = pageBandNameFromPageIndex(nextPageIndex);

    // Fallback for disabled state (already on first/last — no destination).
    const currentPageFace = `Page ${S.pageIndex + 1}/${pageCount}`;
    const currentBand     = pageBandNameFromPageIndex(S.pageIndex);

    S.ui.topBtn.disabled    = !!onFirst;
    S.ui.bottomBtn.disabled = !!onLast;

    // Top: shows the previous page (destination when going older).
    S.ui.topBtn.textContent = onFirst
      ? `↑ Load older · ${currentPageFace}`
      : `↑ Load older · ${prevPageFace}`;

    // Bottom: shows the next page (destination when going newer).
    S.ui.bottomBtn.textContent = onLast
      ? `↓ Latest page · ${currentPageFace}`
      : `↓ Load more · ${nextPageFace}`;

    const topBand    = onFirst ? currentBand : prevBand;
    const bottomBand = onLast  ? currentBand : nextBand;

    if (S.ui.topBox) {
      S.ui.topBox.setAttribute('data-page-index',  String(S.pageIndex));
      S.ui.topBox.setAttribute('data-page-count',  String(pageCount));
      S.ui.topBox.setAttribute('data-page-band',   topBand);
      S.ui.topBox.setAttribute('data-page-window', onFirst ? currentPageFace : prevPageFace);
      S.ui.topBox.style.display = onFirst ? 'none' : '';
    }

    if (S.ui.bottomBox) {
      S.ui.bottomBox.setAttribute('data-page-index',  String(S.pageIndex));
      S.ui.bottomBox.setAttribute('data-page-count',  String(pageCount));
      S.ui.bottomBox.setAttribute('data-page-band',   bottomBand);
      S.ui.bottomBox.setAttribute('data-page-window', onLast ? currentPageFace : nextPageFace);
      if (onLast) S.ui.bottomBox.setAttribute('data-on-last', '1');
      else S.ui.bottomBox.removeAttribute('data-on-last');
      S.ui.bottomBox.style.display = '';
    }

    S.ui.topBtn.setAttribute('data-page-band',    topBand);
    S.ui.bottomBtn.setAttribute('data-page-band', bottomBand);
    if (onLast) S.ui.bottomBtn.setAttribute('data-on-last', '1');
    else S.ui.bottomBtn.removeAttribute('data-on-last');
    S.ui.topBtn.title    = onFirst ? 'You are already on the oldest page' : `Load older turns • ${prevPageFace}`;
    S.ui.bottomBtn.title = onLast  ? 'You are on the latest page'         : `Load newer turns • ${nextPageFace}`;
  }

  function maybeRestoreInlineOnInserted(insertedIndices) {
    if (!Array.isArray(insertedIndices) || !insertedIndices.length) return;
    if (typeof W.restoreInlineHighlights !== 'function') return;

    const turns = S.masterTurns;
    const limit = Math.min(insertedIndices.length, 220);
    for (let i = 0; i < limit; i += 1) {
      const idx = insertedIndices[i];
      const turn = turns[idx];
      if (!turn) continue;
      const answerEl = findAssistantForTurn(turn);
      if (!answerEl || !answerEl.isConnected) continue;
      try { W.restoreInlineHighlights(answerEl); } catch (_) {}
    }
  }

  function isViewLayoutValid() {
    if (!isElementNode(S.root)) return false;
    if (!isElementNode(S.ui.topBox) || !isElementNode(S.ui.bottomBox) || !isElementNode(S.ui.viewBox)) return false;
    if (S.ui.topBox.parentElement !== S.root) return false;
    if (S.ui.viewBox.parentElement !== S.root) return false;
    if (S.ui.bottomBox.parentElement !== S.root) return false;
    if (S.root.children.length !== 3) return false;
    return S.root.children[0] === S.ui.topBox
      && S.root.children[1] === S.ui.viewBox
      && S.root.children[2] === S.ui.bottomBox;
  }

  function applyRootSwap(turnNodes) {
    const frag = document.createDocumentFragment();
    frag.appendChild(S.ui.topBox);
    for (const node of turnNodes) {
      if (!isElementNode(node)) continue;
      frag.appendChild(node);
    }
    frag.appendChild(S.ui.bottomBox);
    S.root.replaceChildren(frag);
  }

  function applyViewSwap(turnNodes) {
    const viewBox = ensureViewContainer();
    if (!isElementNode(viewBox)) return false;

    if (!isViewLayoutValid()) {
      const layoutFrag = document.createDocumentFragment();
      layoutFrag.appendChild(S.ui.topBox);
      layoutFrag.appendChild(viewBox);
      layoutFrag.appendChild(S.ui.bottomBox);
      S.root.replaceChildren(layoutFrag);
    }
    if (!isViewLayoutValid()) return false;

    const viewFrag = document.createDocumentFragment();
    for (const node of turnNodes) {
      if (!isElementNode(node)) continue;
      viewFrag.appendChild(node);
    }
    viewBox.replaceChildren(viewFrag);
    return true;
  }

  function renderPageWithHub(pageIndex, reason, opts = {}) {
    const hub = getObserverHub();
    if (hub) {
      return hub.withSuppressed('pagination:render', () => {
        return renderPage(pageIndex, reason, opts);
      }, { ms: 180, flush: true });
    }
    return renderPage(pageIndex, reason, opts);
  }

  function renderPage(nextPageIndex, reason, opts = {}) {
    if (!isFeatureEnabled()) return false;
    const turns = S.masterTurns;
    if (!S.booted) return false;
    if (!isElementNode(S.root) || !turns.length) return false;

    const win = computePageWindow(nextPageIndex);
    if (!win) return false;

    installStyleOnce();
    ensureSentinels();

    const anchor = (opts && opts.anchor) ? opts.anchor : captureScrollAnchor();
    const prevVisibleSet = new Set(S.viewTurnIndices || []);
    const nextVisibleIndices = [];
    const turnNodes = [];

    const start = Math.max(0, win.turnStart);
    const end = Math.min(turns.length - 1, Math.max(start, win.turnEnd));
    const pageDividerByTurnIndex = buildPageDividerMapForTurnRange(start, end);
    for (let i = start; i <= end; i += 1) {
      const turn = turns[i];
      if (!turn || !isElementNode(turn.node)) continue;
      const divider = pageDividerByTurnIndex.get(i);
      nextVisibleIndices.push(i);
      if (divider) {
        turnNodes.push(createInlinePageDivider(divider.pageNum, divider.band, divider.answerIndex, divider.turnGid));
      }
      turnNodes.push(turn.node);
    }

    S.isRendering = true;
    S.renderSuppressUntil = Date.now() + 180;
    markObserverSuppressedWindow();
    const requestedSwapMode = getSwapMode();
    let usedSwapMode = 'root';
    try {
      if (requestedSwapMode === 'view') {
        const viewOk = applyViewSwap(turnNodes);
        if (viewOk) {
          usedSwapMode = 'view';
        } else {
          if (!S.swapFallbackLogged) {
            debugLog('swap-mode-fallback', { requestedSwapMode, reason: 'view-layout-invariant' });
            S.swapFallbackLogged = true;
          }
          applyRootSwap(turnNodes);
          usedSwapMode = 'root';
        }
      } else {
        applyRootSwap(turnNodes);
        usedSwapMode = 'root';
      }
    } catch (err) {
      if (requestedSwapMode === 'view') {
        try {
          if (!S.swapFallbackLogged) {
            debugLog('swap-mode-fallback', { requestedSwapMode, reason: 'view-swap-error' });
            S.swapFallbackLogged = true;
          }
          applyRootSwap(turnNodes);
          usedSwapMode = 'root';
        } catch (_) {
          S.isRendering = false;
          safeLogWarn('render failed', err);
          return false;
        }
      } else {
        S.isRendering = false;
        safeLogWarn('render failed', err);
        return false;
      }
    }

    S.lastAppliedSwapMode = usedSwapMode;
    S.renderSwapCount += 1;
    debugLog('swap-mode-applied', { requestedSwapMode, usedSwapMode });

    const visibleSet = new Set(nextVisibleIndices);
    for (let i = 0; i < turns.length; i += 1) {
      const turn = turns[i];
      if (!turn) continue;
      turn.detached = !visibleSet.has(i);
    }

    const inserted = [];
    for (const i of nextVisibleIndices) {
      if (!prevVisibleSet.has(i)) inserted.push(i);
    }

    S.pageIndex = win.pageIndex;
    S.pageCount = win.pageCount;
    S.lastWindow = win;
    S.viewTurnIndices = nextVisibleIndices;
    S.viewTurnIndexSet = new Set(nextVisibleIndices);
    S.visibleTurnIndices = nextVisibleIndices;
    S.visibleTurnStart = nextVisibleIndices.length ? nextVisibleIndices[0] : -1;
    S.visibleTurnEnd = nextVisibleIndices.length ? nextVisibleIndices[nextVisibleIndices.length - 1] : -1;
    S.renderedOnce = true;
    syncLegacyRefs();
    syncSharedTurnRuntimePageState(win);

    updateSentinelState(win);
    maybeRestoreInlineOnInserted(inserted);
    writeStoredPageIndex(S.chatId || getChatId(), S.pageIndex);
    debugLog('render-swap', {
      swapCount: S.renderSwapCount,
      swapMode: S.lastAppliedSwapMode,
      pageIndex: S.pageIndex,
      pageCount: S.pageCount,
      answerRange: buildAnswerRangePayload(win),
      bufferedAnswerRange: buildBufferedAnswerRangePayload(win),
    });
    emitPageChanged(win, reason);
    if (!opts || opts.restoreAnchor !== false) restoreScrollAnchor(anchor);

    queueMicrotask(() => { S.isRendering = false; });
    return true;
  }

  function restoreAllTurnsIntoRoot() {
    const turns = S.masterTurns;
    if (!isElementNode(S.root) || !turns.length) return;

    const frag = document.createDocumentFragment();
    for (const turn of turns) {
      if (!turn || !isElementNode(turn.node)) continue;
      frag.appendChild(turn.node);
      turn.detached = false;
    }

    const extras = Array.from(S.root.children || []).filter((child) => {
      if (!isElementNode(child)) return false;
      if (isOurUiNode(child)) return false;
      return !S.masterTurnNodeSet.has(child);
    });
    for (const extra of extras) {
      frag.appendChild(extra);
    }

    try { S.root.replaceChildren(frag); } catch (_) {}
  }

  function rebuildIndex(reason) {
    if (!isFeatureEnabled()) return false;
    if (S.isRebuilding) return false;
    S.isRebuilding = true;
    debugLog('rebuild-index', { reason: String(reason || '') });
    try {
      const currentChatId = getChatId();
      const chatChanged = (S.chatId && S.chatId !== currentChatId);
      if (chatChanged) {
        removeSentinelsFromRoot(S.root);
        clearMasterState();
        S.recoveryAttemptedChatId = '';
        S.needsRestorePage = true;
      }
      S.chatId = currentChatId;

      const root = findConversationRoot();
      if (!isElementNode(root)) {
        if (S.rootObserver) {
          try { S.rootObserver.disconnect(); } catch (_) {}
          S.rootObserver = null;
          S.rootObservedEl = null;
        }
        S.root = null;
        S.fullRoot = null;
        return false;
      }

      const rootChanged = root !== S.root;
      if (rootChanged) {
        removeSentinelsFromRoot(S.root);
        S.root = root;
      }

      if (getObserverHub()) {
        disconnectRootObserver();
      } else {
        ensureRootObserver();
      }

      const previousPageIndex = S.pageIndex;
      const previousPageCount = S.pageCount;
      const wasOnLast = previousPageIndex >= Math.max(0, previousPageCount - 1);

      if (!S.hasMaster || !S.masterTurns.length || chatChanged) {
        const ok = fullDiscoverMaster(root);
        if (!ok) return false;
        S.needsRestorePage = true;
        S.recoveryAttemptedChatId = '';
      } else {
        if (S.pendingAddedTurnNodes.size) mergePendingMasterCandidates();
        maybeRecoverMasterFromDom();
        recomputeMasterDerived();
      }

      if (!S.masterTurns.length) return false;

      if (S.needsRestorePage) {
        const stored = readStoredPageIndex(S.chatId);
        S.pageIndex = clampInt(stored, 0, Math.max(0, S.pageCount - 1), Math.max(0, S.pageCount - 1));
        S.needsRestorePage = false;
      } else if (wasOnLast && S.pageCount >= previousPageCount) {
        S.pageIndex = Math.max(0, S.pageCount - 1);
      } else {
        S.pageIndex = clampInt(S.pageIndex, 0, Math.max(0, S.pageCount - 1), 0);
      }
      syncLegacyRefs();

      return true;
    } finally {
      S.isRebuilding = false;
    }
  }

  function ensureIndexFresh(reason) {
    if (!isFeatureEnabled()) return false;
    if (!S.booted) return false;
    if (!isElementNode(S.root) || !S.root.isConnected || !S.hasMaster || !S.masterTurns.length) {
      return rebuildIndex(`${reason}:rebuild`);
    }

    if (S.pendingAddedTurnNodes.size) {
      return rebuildIndex(`${reason}:merge`);
    }

    const stats = getExpectedDisconnectedStats();
    if (stats.expectedTotal >= STALE_MIN_EXPECTED_TURNS && stats.ratio >= RECOVERY_DISCONNECTED_RATIO) {
      return rebuildIndex(`${reason}:stale`);
    }
    return true;
  }

  function scheduleRefresh(reason) {
    if (!isFeatureEnabled()) return 0;
    S.pendingRefreshReason = String(reason || 'refresh');
    if (S.refreshTimer) clearTimeout(S.refreshTimer);
    S.refreshTimer = setTimeout(() => {
      S.refreshTimer = 0;
      if (!S.booted) return;

      const anchor = captureScrollAnchor();
      const hub = getObserverHub();
      const ok = rebuildIndex(`mo:${S.pendingRefreshReason}`);
      if (!ok) {
        if (hub) {
          try { hub.ensureRoot('pagination:refresh'); } catch (_) {}
        } else {
          installStartObserver();
        }
        return;
      }
      disconnectStartObserver();
      renderPageWithHub(S.pageIndex, `mo:${S.pendingRefreshReason}`, { anchor, restoreAnchor: true });
    }, OBSERVER_DEBOUNCE_MS);
  }

  function goToPage(pageIndex, reason = 'api:goToPage') {
    if (!isFeatureEnabled()) return false;
    if (!ensureIndexFresh('goToPage')) return false;
    const target = clampInt(pageIndex, 0, Math.max(0, S.pageCount - 1), S.pageIndex);

    if (target === S.pageIndex && S.renderedOnce) {
      const win = computePageWindow(S.pageIndex);
      updateSentinelState(win);
      return true;
    }

    const anchor = captureScrollAnchor();
    return renderPageWithHub(target, reason, { anchor, restoreAnchor: true });
  }

  function goToPageStart(pageIndex, reason = 'api:goToPageStart', opts = {}) {
    if (!isFeatureEnabled()) return false;
    if (!ensureIndexFresh('goToPageStart')) return false;

    const prevPageIndex = S.pageIndex;
    const target = clampInt(pageIndex, 0, Math.max(0, S.pageCount - 1), S.pageIndex);
    const smooth = opts?.smooth !== false;

    let win = computePageWindow(target);
    if (!win) return false;

    if (target !== S.pageIndex || !S.renderedOnce) {
      const rendered = renderPageWithHub(target, reason, { restoreAnchor: false });
      if (!rendered) return false;
      win = S.lastWindow || computePageWindow(target);
      if (!win) return false;
    } else {
      updateSentinelState(win);
    }

    const direction = Math.sign(target - prevPageIndex);
    if (smooth && direction) stageViewportForPageJumpDirection(direction);

    const startTarget = resolvePageStartTarget(win);
    if (startTarget) scrollToPageStartTarget(startTarget, smooth);
    return true;
  }

  function goOlder(reason = 'api:goOlder') {
    return goToPage(S.pageIndex - 1, reason);
  }

  function goNewer(reason = 'api:goNewer') {
    return goToPage(S.pageIndex + 1, reason);
  }

  function goToAnswerGid(gid) {
    if (!isFeatureEnabled()) return false;
    if (!ensureIndexFresh('goToAnswerGid')) return false;
    if (!S.masterAnswers.length) return false;

    const targetGid = toInt(gid, 0);
    if (!Number.isFinite(targetGid) || targetGid <= 0) return false;

    let idx = S.masterAnswers.findIndex((a) => a.gid >= targetGid);
    if (idx < 0) idx = S.masterAnswers.length - 1;
    const page = Math.floor(idx / getPageSize());

    const anchor = captureScrollAnchor();
    return renderPageWithHub(page, 'api:goToAnswerGid', { anchor, restoreAnchor: true });
  }

  function goFirst(reason = 'api:goFirst') {
    return goToPage(0, reason);
  }

  function goLast(reason = 'api:goLast') {
    return goToPage(Math.max(0, S.pageCount - 1), reason);
  }

  function CORE_PG_waitForCommittedPage(target, timeoutMs = 900) {
    const maxWaitMs = Math.max(120, Number(timeoutMs || 900) || 900);

    return new Promise((resolve) => {
      const t0 = performance.now();
      let lastState = CORE_PG_isTargetMaterializedOnActivePage(target);

      const tick = () => {
        lastState = CORE_PG_isTargetMaterializedOnActivePage(target);
        if (lastState.ok) {
          requestAnimationFrame(() => resolve(lastState));
          return;
        }
        if ((performance.now() - t0) >= maxWaitMs) {
          resolve(lastState);
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  async function API_PG_ensureVisibleById(anyId, opts = {}) {
    const id = CORE_PG_normalizeId(anyId);
    if (!id) return { ok: false, reason: 'missing-id', id: '' };
    if (!isFeatureEnabled()) return { ok: false, reason: 'disabled', id };

    if (!S.booted) boot('api:ensureVisibleById');
    if (!ensureIndexFresh('ensureVisibleById')) {
      return { ok: false, reason: 'index-unavailable', id };
    }

    const target = CORE_PG_resolveAnyIdToPage(id);
    if (!target) {
      return { ok: false, reason: 'not-found', id };
    }

    const reason = String(opts?.reason || 'api:ensureVisibleById');
    const prevPageIndex = Number(S.pageIndex || 0);
    const shouldRestoreAnchor = opts?.restoreAnchor !== false;
    const visibleState = CORE_PG_isTargetMaterializedOnActivePage(target);
    const alreadyVisible = !!visibleState.ok;

    let rendered = false;
    if (!alreadyVisible) {
      const anchor = shouldRestoreAnchor ? captureScrollAnchor() : null;
      rendered = !!renderPageWithHub(target.pageIndex, reason, { anchor, restoreAnchor: shouldRestoreAnchor });
      if (!rendered) {
        return { ok: false, reason: 'render-failed', id, ...target, rendered };
      }
    }

    const committedState = await CORE_PG_waitForCommittedPage(target, opts?.timeoutMs);
    const finalState = (committedState && typeof committedState === 'object')
      ? committedState
      : CORE_PG_isTargetMaterializedOnActivePage(target);
    return {
      ok: !!finalState?.ok,
      id,
      reason,
      rendered,
      pageChanged: Number(prevPageIndex) !== Number(target.pageIndex || 0) && Number(S.pageIndex || 0) === Number(target.pageIndex || 0),
      committed: !!finalState?.ok,
      targetHostFound: !!finalState?.targetHostFound,
      targetHost: finalState?.targetHost || null,
      targetTurnHost: finalState?.turnHost || null,
      targetAnswerHost: finalState?.answerHost || null,
      ...target,
    };
  }

  function inShortcutIgnoreZone(el) {
    if (!isElementNode(el)) return false;
    try {
      if (el.matches(SEL_SHORTCUT_EDITABLE) || el.closest(SEL_SHORTCUT_EDITABLE)) return true;
    } catch (_) {}
    try {
      if (el.matches(SEL_SHORTCUT_COMPOSER) || el.closest(SEL_SHORTCUT_COMPOSER)) return true;
    } catch (_) {}
    try {
      const form = el.closest?.('form');
      const tid = String(form?.getAttribute?.('data-testid') || '').toLowerCase();
      const typ = String(form?.getAttribute?.('data-type') || '').toLowerCase();
      if (tid.includes('composer') || typ.includes('composer')) return true;
    } catch (_) {}
    try {
      if (el.closest?.('#prompt-textarea, [data-testid="prompt-textarea"], [data-composer-surface="true"], [class*="composer"]')) return true;
    } catch (_) {}
    return false;
  }

  function shouldIgnoreShortcutEvent(e) {
    const target = isElementNode(e?.target) ? e.target : null;
    const active = isElementNode(document.activeElement) ? document.activeElement : null;
    return inShortcutIgnoreZone(target) || inShortcutIgnoreZone(active);
  }

  function onShortcutKeyDown(e) {
    if (!areShortcutsEnabled()) return;
    if (!S.booted) return;
    if (!e || e.defaultPrevented) return;
    if (e.ctrlKey) return;
    if (typeof e.getModifierState === 'function' && e.getModifierState('AltGraph')) return;
    if (shouldIgnoreShortcutEvent(e)) return;

    const key = String(e.key || '');
    const altOnly = !!e.altKey && !e.metaKey && !e.shiftKey;
    const metaShift = !!e.metaKey && !!e.shiftKey && !e.altKey;

    let handled = false;
    if (altOnly && key === 'ArrowUp') {
      handled = goOlder('kbd:alt+up');
    } else if (altOnly && key === 'ArrowDown') {
      handled = goNewer('kbd:alt+down');
    } else if (metaShift && key === 'ArrowUp') {
      handled = goOlder('kbd:meta+shift+up');
    } else if (metaShift && key === 'ArrowDown') {
      handled = goNewer('kbd:meta+shift+down');
    } else if (altOnly && key === 'Home') {
      handled = goFirst('kbd:alt+home');
    } else if (altOnly && key === 'End') {
      handled = goLast('kbd:alt+end');
    }

    if (handled) {
      try { e.preventDefault(); } catch (_) {}
      try { e.stopPropagation(); } catch (_) {}
    }
  }

  function getPageInfo() {
    const turns = S.masterTurns;
    const win = computePageWindow(S.pageIndex);
    return {
      chatId: S.chatId || getChatId(),
      pageIndex: S.pageIndex,
      pageCount: S.pageCount,
      enabled: isFeatureEnabled(),
      pageSize: getPageSize(),
      bufferAnswers: getBufferAnswers(),
      autoLoadSentinel: isAutoLoadSentinelEnabled(),
      shortcutsEnabled: areShortcutsEnabled(),
      totalTurns: turns.length,
      totalAnswers: S.masterAnswers.length,
      answerRange: buildAnswerRangePayload(win),
      bufferedAnswerRange: buildBufferedAnswerRangePayload(win),
      turnRange: {
        startGid: win && Number.isFinite(win.turnStart) && win.turnStart >= 0 && turns[win.turnStart] ? turns[win.turnStart].gid : 0,
        endGid: win && Number.isFinite(win.turnEnd) && win.turnEnd >= 0 && turns[win.turnEnd] ? turns[win.turnEnd].gid : 0,
      },
    };
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
    if (!isFeatureEnabled()) return 'Disabled • all turns stay visible';
    const info = getPageInfo();
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
    syncCommandBarControls();
    return detail;
  }

  function refreshWindowing(reason = 'cfg:refresh') {
    if (!isFeatureEnabled()) return false;
    if (!S.booted) return false;
    const anchor = captureScrollAnchor();
    const ok = rebuildIndex(reason);
    if (!ok) {
      scheduleRefresh(reason);
      return false;
    }
    return renderPageWithHub(S.pageIndex, reason, { anchor, restoreAnchor: true });
  }

  function applyDiagConfig(reason = 'diag:apply') {
    if (!isFeatureEnabled()) {
      try { document.getElementById(CSS_STYLE_ID)?.remove(); } catch (_) {}
      return true;
    }
    installStyleOnce();
    if (!S.booted) return true;
    if (!S.renderedOnce) return true;
    if (!ensureIndexFresh('diag')) {
      scheduleRefresh('diag');
      return false;
    }
    const anchor = captureScrollAnchor();
    return renderPageWithHub(S.pageIndex, reason, { anchor, restoreAnchor: true });
  }

  function setDiagConfig(partial) {
    const current = S.diagConfig || DIAG_DEFAULT;
    const mergedInput = Object.assign({}, current, (partial && typeof partial === 'object') ? partial : {});
    const next = normalizeDiagConfig(mergedInput, DIAG_DEFAULT);
    const changed = next.styleMode !== current.styleMode
      || next.swapMode !== current.swapMode
      || next.debug !== current.debug
      || next.useObserverHub !== current.useObserverHub;

    S.diagConfig = next;
    writeDiagConfig(next);
    if (next.swapMode !== current.swapMode) S.swapFallbackLogged = false;

    if (changed) {
      debugLog('diag-config-updated', next);
      if (next.useObserverHub !== current.useObserverHub) {
        if (next.useObserverHub) {
          bindObserverHub();
        } else {
          unbindObserverHub();
          disconnectStartObserver();
          ensureRootObserver();
        }
      }
      applyDiagConfig('diag:set');
      emitConfigChanged('cfg:diag');
    }
    return getDiagConfigCopy();
  }

  function applySetting(optKey, val) {
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

    if (key === 'pwEnabled') {
      if (clean.enabled) boot(`cfg:${key}`);
      else teardownRuntimeSession(`cfg:${key}`, { preserveApi: true });
    } else if (key === 'pwPageSize' || key === 'pwBufferAnswers') {
      refreshWindowing(`cfg:${key}`);
    } else if (key === 'pwAutoLoadSentinel') {
      if (S.booted && clean.autoLoadSentinel) ensureAutoLoadObserver();
      else disconnectAutoLoadObserver();
    } else if (key === 'pwShortcutsEnabled') {
      syncShortcutBinding();
    }

    emitConfigChanged(`cfg:${key}`);
    return true;
  }

  function setEnabled(on) {
    applySetting('pwEnabled', !!on);
    return isFeatureEnabled();
  }

  function getCommandBarApi() {
    const api = W.H2O?.commandBar;
    if (!api || typeof api !== 'object') return null;
    for (const key of ['ensureMounted', 'registerGroup', 'registerControl', 'patchControl', 'removeOwner']) {
      if (typeof api[key] !== 'function') return null;
    }
    return api;
  }

  function clearCommandBarBindTimer() {
    if (!S.commandBarBindTimer) return;
    try { W.clearTimeout(S.commandBarBindTimer); } catch (_) {}
    try { W.clearInterval(S.commandBarBindTimer); } catch (_) {}
    S.commandBarBindTimer = 0;
  }

  function scheduleCommandBarBindRetry(attempt = 1) {
    if (S.commandBarBound && getCommandBarApi()) {
      clearCommandBarBindTimer();
      return 0;
    }
    if (S.commandBarBindTimer) return S.commandBarBindTimer;
    const nextAttempt = Math.max(1, Number(attempt || 1) || 1);
    if (nextAttempt > COMMAND_BAR_BIND_MAX_ATTEMPTS) return 0;
    S.commandBarBindTimer = W.setTimeout(() => {
      S.commandBarBindTimer = 0;
      if (S.commandBarBound && getCommandBarApi()) return;
      if (getCommandBarApi()) {
        bindCommandBarFeature();
        return;
      }
      if (nextAttempt < COMMAND_BAR_BIND_MAX_ATTEMPTS) scheduleCommandBarBindRetry(nextAttempt + 1);
    }, COMMAND_BAR_BIND_RETRY_MS);
    return S.commandBarBindTimer;
  }

  function syncCommandBarControls() {
    const api = S.commandBarApi || getCommandBarApi();
    if (api && !S.commandBarBound) return !!bindCommandBarFeature();
    if (!api || !S.commandBarBound) return false;

    const info = getPageInfo();
    const enabled = !!info.enabled;
    const pageCount = Math.max(1, Number(info.pageCount || 1));
    const pageIndex = clampInt(info.pageIndex, 0, Math.max(0, pageCount - 1), 0);
    const pageOptions = [];
    const pageFaceMap = {};

    for (let i = 0; i < pageCount; i += 1) {
      const value = String(i);
      pageOptions.push({ value, label: `Page ${i + 1} / ${pageCount}` });
      pageFaceMap[value] = `${i + 1}/${pageCount}`;
    }

    api.patchControl('pw.toggle', {
      text: enabled ? 'PW·ON' : 'PW·OFF',
      title: enabled
        ? `Pagination Windowing is ON • ${pageCount} page(s) • click to disable`
        : 'Pagination Windowing is OFF • click to enable',
      disabled: false,
    });
    api.patchControl('pw.page', {
      value: String(pageIndex),
      options: pageOptions,
      faceBase: 'PW·Pg',
      faceMap: pageFaceMap,
      title: enabled ? `Pagination page ${pageIndex + 1} of ${pageCount}` : 'Pagination Windowing is OFF',
      disabled: !enabled || pageCount <= 1,
    });
    api.patchControl('pw.prev', {
      text: 'PW·Prev',
      title: enabled ? 'Go to older pagination window' : 'Pagination Windowing is OFF',
      disabled: !enabled || pageIndex <= 0,
    });
    api.patchControl('pw.next', {
      text: 'PW·Next',
      title: enabled ? 'Go to newer pagination window' : 'Pagination Windowing is OFF',
      disabled: !enabled || pageIndex >= (pageCount - 1),
    });
    return true;
  }

  function bindCommandBarFeature() {
    const api = getCommandBarApi();
    if (!api) {
      S.commandBarApi = null;
      S.commandBarBound = false;
      scheduleCommandBarBindRetry();
      return null;
    }
    try { api.ensureMounted(); } catch (_) {}
    if (S.commandBarApi && S.commandBarApi !== api) S.commandBarBound = false;
    S.commandBarApi = api;

    if (!S.commandBarBound) {
      api.removeOwner('pw');
      api.registerGroup({ id: 'pw.main', owner: 'pw', zone: 'main', order: 400 });
      api.registerControl({
        id: 'pw.toggle',
        owner: 'pw',
        groupId: 'pw.main',
        order: 100,
        type: 'button',
        className: 'pw-toggle',
        text: 'PW·ON',
        title: 'Toggle Pagination Windowing',
        onClick: () => {
          setEnabled(!isFeatureEnabled());
          syncCommandBarControls();
        },
      });
      api.registerControl({
        id: 'pw.page',
        owner: 'pw',
        groupId: 'pw.main',
        order: 200,
        type: 'select',
        /* select type not handled by Side Actions bridge — stays in Command Bar */
        keepInCommandBar: true,
        className: 'pw-page',
        title: 'Pagination page',
        faceBase: 'PW·Pg',
        faceMap: { '0': '1/1' },
        options: [{ value: '0', label: 'Page 1 / 1' }],
        value: '0',
        onChange: ({ value }) => {
          goToPage(toInt(value, S.pageIndex), 'command-bar:goToPage');
          syncCommandBarControls();
        },
      });
      api.registerControl({
        id: 'pw.prev',
        owner: 'pw',
        groupId: 'pw.main',
        order: 300,
        type: 'button',
        className: 'pw-prev',
        text: 'PW·Prev',
        title: 'Go to older page',
        /* Navigation action: belongs in Side Actions → MiniMap tab */
        sideAction: true,
        sideTab: 'minimap',
        onClick: () => {
          goOlder('command-bar:goOlder');
          syncCommandBarControls();
        },
      });
      api.registerControl({
        id: 'pw.next',
        owner: 'pw',
        groupId: 'pw.main',
        order: 400,
        type: 'button',
        className: 'pw-next',
        text: 'PW·Next',
        title: 'Go to newer page',
        /* Navigation action: belongs in Side Actions → MiniMap tab */
        sideAction: true,
        sideTab: 'minimap',
        onClick: () => {
          goNewer('command-bar:goNewer');
          syncCommandBarControls();
        },
      });
      S.commandBarBound = true;
    }

    syncCommandBarControls();
    clearCommandBarBindTimer();
    return api;
  }

  function registerFeatureSurfaces() {
    const feature = {
      key: 'paginationWindowing',
      label: 'Pagination Windowing',
      description: 'Answer-page windowing for long chats, with page navigation and swap tuning.',
      enabled() { return isFeatureEnabled(); },
      setEnabled(on) { return setEnabled(!!on); },
      applySetting(optKey, value) { return applySetting(optKey, value); },
      getSummary() { return getSummary(); },
    };

    const attach = (host) => {
      if (!host) return;
      host.features = host.features || {};
      host.features.paginationWindowing = feature;
    };

    W.h2oConfig = W.h2oConfig || {};
    W.hoConfig = W.hoConfig || W.h2oConfig;
    attach(W.h2oConfig);
    attach(W.hoConfig);
    bindCommandBarFeature();
  }

  function syncShortcutBinding() {
    if (!S.onKeyDown) S.onKeyDown = onShortcutKeyDown;
    try { document.removeEventListener('keydown', S.onKeyDown, true); } catch (_) {}
    if (S.booted && areShortcutsEnabled()) {
      try { document.addEventListener('keydown', S.onKeyDown, true); } catch (_) {}
    }
  }

  function teardownRuntimeSession(reason = 'dispose', opts = {}) {
    const preserveApi = !!opts?.preserveApi;
    debugLog('dispose-cleanup', {
      reason: String(reason || 'dispose'),
      swapMode: S.lastAppliedSwapMode || getSwapMode(),
      hasViewContainer: !!(S.ui.viewBox && S.ui.viewBox.isConnected),
      renderSwapCount: S.renderSwapCount,
    });

    if (S.refreshTimer) {
      clearTimeout(S.refreshTimer);
      S.refreshTimer = 0;
    }
    if (S.deferredRefreshTimer) {
      clearTimeout(S.deferredRefreshTimer);
      S.deferredRefreshTimer = 0;
    }

    disconnectAutoLoadObserver();
    disconnectStartObserver();
    unbindObserverHub();
    disconnectRootObserver();

    if (S.onPopState) W.removeEventListener('popstate', S.onPopState);
    if (S.onHashChange) W.removeEventListener('hashchange', S.onHashChange);
    if (S.onVisibilityChange) document.removeEventListener('visibilitychange', S.onVisibilityChange);
    if (S.onKeyDown) document.removeEventListener('keydown', S.onKeyDown, true);

    if (S.ui.topBtn && S.onTopClick) S.ui.topBtn.removeEventListener('click', S.onTopClick);
    if (S.ui.bottomBtn && S.onBottomClick) S.ui.bottomBtn.removeEventListener('click', S.onBottomClick);

    restoreAllTurnsIntoRoot();
    removeSentinelsFromRoot(S.root);
    clearSharedTurnRuntimeCanonical();

    try { document.getElementById(CSS_STYLE_ID)?.remove(); } catch (_) {}

    S.booted = false;
    S.isRendering = false;
    S.renderedOnce = false;
    S.renderSuppressUntil = 0;
    S.suppressObserverUntil = 0;
    S.deferredRefreshNeeded = false;
    S.deferredRefreshTimer = 0;
    S.lastVisibleRefreshAt = 0;
    S.pendingRefreshReason = '';
    S.pendingAddedTurnNodes = new Set();
    S.masterTurns = [];
    S.masterAnswers = [];
    S.masterTurnUnits = [];
    S.masterTurnNodeSet = new Set();
    S.masterUidToTurn = new Map();
    S.turns = S.masterTurns;
    S.answers = S.masterAnswers;
    S.turnUnits = S.masterTurnUnits;
    S.canonicalTurns = S.masterTurnUnits;
    S.turnNodeSet = S.masterTurnNodeSet;
    S.uidToTurn = S.masterUidToTurn;
    S.viewTurnIndices = [];
    S.viewTurnIndexSet = new Set();
    S.visibleTurnIndices = [];
    S.visibleTurnStart = -1;
    S.visibleTurnEnd = -1;
    S.lastWindow = null;
    S.pageIndex = 0;
    S.pageCount = 1;
    S.hasMaster = false;
    S.needsRestorePage = true;
    S.root = null;
    S.fullRoot = null;
    S.chatId = '';
    S.recoveryAttemptedChatId = '';
    S.onPopState = null;
    S.onHashChange = null;
    S.onVisibilityChange = null;
    S.onKeyDown = null;
    S.ui.topBox = null;
    S.ui.topBtn = null;
    S.ui.viewBox = null;
    S.ui.appliedStyleMode = '';
    S.ui.bottomBox = null;
    S.ui.bottomBtn = null;
    S.onTopClick = null;
    S.onBottomClick = null;
    S.isRebuilding = false;
    S.renderSwapCount = 0;
    S.swapFallbackLogged = false;
    S.lastAppliedSwapMode = '';
    S.offObsReady = null;
    S.offObsMut = null;

    try { delete W[KEY_BOOT]; } catch (_) {}
    clearCommandBarBindTimer();
    if (!preserveApi) {
      try { S.commandBarApi?.removeOwner?.('pw'); } catch (_) {}
      S.commandBarBound = false;
      S.commandBarApi = null;
    }
    return { ok: true, reason: String(reason || 'dispose') };
  }

  function dispose(reason = 'dispose') {
    return teardownRuntimeSession(reason, { preserveApi: false });
  }

  function boot(reason = 'boot') {
    if (!isFeatureEnabled()) return false;
    if (S.booted) return true;
    if (W[KEY_BOOT]) return true;
    W[KEY_BOOT] = 1;
    S.booted = true;
    S.chatId = getChatId();
    S.needsRestorePage = true;

    installStyleOnce();

    if (!S.onPopState) S.onPopState = () => scheduleRefresh('popstate');
    if (!S.onHashChange) S.onHashChange = () => scheduleRefresh('hashchange');
    if (!S.onVisibilityChange) {
      S.onVisibilityChange = () => {
        if (document.hidden) return;
        const now = Date.now();
        if ((now - S.lastVisibleRefreshAt) < VISIBLE_REFRESH_THROTTLE_MS) return;
        S.lastVisibleRefreshAt = now;
        scheduleRefresh('visible');
      };
    }
    W.addEventListener('popstate', S.onPopState);
    W.addEventListener('hashchange', S.onHashChange);
    document.addEventListener('visibilitychange', S.onVisibilityChange);
    syncShortcutBinding();

    const hubBound = !!bindObserverHub();
    let ok = false;
    if (hubBound) {
      disconnectStartObserver();
      disconnectRootObserver();
      ok = rebuildIndex(reason);
      if (ok) {
        renderPageWithHub(S.pageIndex, reason, { restoreAnchor: false });
      } else {
        try { getObserverHub()?.ensureRoot?.('pagination:boot'); } catch (_) {}
      }
    } else {
      ok = rebuildIndex(reason);
      if (ok) {
        renderPageWithHub(S.pageIndex, reason, { restoreAnchor: false });
        disconnectStartObserver();
      } else {
        installStartObserver();
      }
    }

    return ok;
  }

  const ADAPTER = Object.freeze({
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
    goOlder,
    goNewer,
    goFirst,
    goLast,
    resolveAnyIdToTurnRecord: (anyId) => CORE_PG_resolveAnyIdToTurnRecord(anyId),
    resolveAnyIdToPage: (anyId) => CORE_PG_resolveAnyIdToPage(anyId),
    rebuildIndex: (reason = 'api:rebuild') => {
      const anchor = captureScrollAnchor();
      const ok = rebuildIndex(reason);
      if (!ok) return false;
      return renderPageWithHub(S.pageIndex, reason, { anchor, restoreAnchor: true });
    },
    boot,
    dispose,
    registerFeatureSurfaces,
    syncCommandBarControls,
    syncShortcutBinding,
    teardownRuntimeSession,
    refreshWindowing,
    emitConfigChanged,
  });

  VAULT.chatAdapter = ADAPTER;
  try { VAULT.engine?.attachChatAdapter?.(ADAPTER); } catch (_) {}
  registerFeatureSurfaces();

  try {
    if (isFeatureEnabled()) boot('init');
  } catch (err) {
    safeLogWarn('boot crash', err);
    try { dispose('boot-crash'); } catch (_) {}
  }
})();
