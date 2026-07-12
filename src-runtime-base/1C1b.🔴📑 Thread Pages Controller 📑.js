// ==H2O Module==
// @h2o-id             1c1b.chat.pages.controller
// @name               1C1b.🔴📑 Thread Pages Controller 📑
// @namespace          H2O.Premium.CGX.chat.pages.controller
// @author             HumamDev
// @version            2.2.5
// @revision           001
// @build              260413-010100
// @description        MiniMap add-on: chat-page fold behavior owner. Phase 5 moves page-fold DOM mechanics and title-list/page-collapse logic here.
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

  const MODTAG = 'ChatPagesCtl';
  const EV_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EV_PAGE_CFG_CHANGED = 'evt:h2o:pagination:configchanged';
  const EV_ANSWER_COLLAPSE = 'evt:h2o:answer:collapse';
  const EV_TITLE_SET = 'evt:h2o:title:set';
  const EV_CORE_INDEX_UPDATED = 'evt:h2o:core:index:updated';
  const EV_MM_TOGGLE_PAGE_COLLAPSED = 'evt:h2o:minimap:toggle-page-collapsed';
  const EV_ROUTE_CHANGED = 'evt:h2o:route:changed';
  const EV_VISIT_STATE_MODE_CHANGED = 'evt:h2o:chat-pages:visit-state-mode-changed';
  const ATTR_CHAT_PAGE_HIDDEN = 'data-cgxui-chat-page-hidden';
  const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
  const ATTR_CHAT_PAGE_TITLE_ITEM = 'data-cgxui-chat-page-title-item';
  const ATTR_CHAT_PAGE_QUESTION_HIDDEN = 'data-cgxui-chat-page-question-hidden';
  const ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN = 'data-cgxui-chat-page-no-answer-question-hidden';
  const ATTR_CHAT_PAGE_WRAPPER_HIDDEN = 'data-cgxui-chat-page-wrapper-hidden';
  const ANSWER_TITLE_COLLAPSED_ATTR = 'data-at-collapsed';
  const TURN_HOST_SEL = '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]';
  const USER_MSG_SEL = '[data-message-author-role="user"]';
  const ASSISTANT_MSG_SEL = '[data-message-author-role="assistant"]';
  const NO_ANSWER_TITLE_BAR_SEL = '[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"][data-at-no-answer="1"]';
  const ANSWER_TITLE_ICON_SEL = '[data-cgxui="atns-answer-title-icon"][data-cgxui-owner="atns"]';
  const TITLE_LIST_ROW_GAP_PX = 4;
  const DIVIDER_STYLE_ID = 'cgxui-chat-pages-divider-style';

  /* Divider visual keys — tune these safely */
  const DIVIDER_VISUAL_KEYS = Object.freeze({
    lineLeftScale: 1.30,
    lineRightScale: 1.30,

    dotSizeExpandedPx: 12,
    dotSizeCollapsedPx: 12,

    expandedDotColor: '#facc15',
    expandedDotGlowColor: 'rgba(250, 204, 21, 0.48)',
    expandedDotGlowBlurPx: 10,
    expandedDotGlowSpreadPx: 0,

    collapsedDotColor: '#b8c0cc',
    collapsedDotGlowColor: 'rgba(184, 192, 204, 0.30)',
    collapsedDotGlowBlurPx: 12,
    collapsedDotGlowSpreadPx: 0,
  });
  const RESTORE_PROPS = [
    'display', 'overflow', 'max-height', 'height', 'min-height',
    'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom',
    'border-top-width', 'border-bottom-width', 'opacity',
    'pointer-events', 'transition', 'gap'
  ];
  const COMPACT_ZERO_PROPS = [
    'min-height','height','max-height','padding-top','padding-bottom','padding-left','padding-right',
    'margin-top','margin-bottom','gap','border-top-width','border-bottom-width'
  ];

  /* Phase 6: 1A2c is now the sole active owner of chat-page folding behavior; Core remains page-surface authority */
  const S = {
    booted: false,
    bound: false,
    chatId: '',
    collapsedPagesByChat: new Map(),
    titleListPagesByChat: new Map(),
    collapsedPageDriversByChat: new Map(),
    collapsedPageModesByChat: new Map(),
    detachedPageHostsByChat: new Map(),
    bridgeOff: null,
    listenersBound: false,
    lastAppliedChatId: '',
    onDividerDblClick: null,
    onDividerClick: null,
    onDividerDotClick: null,
    onAnswerCollapse: null,
    onTitleSet: null,
    onCoreIndexUpdated: null,
    onPaginationPageChanged: null,
    onPaginationConfigChanged: null,
    onMiniMapTogglePageCollapsed: null,
    onRouteChanged: null,
    onVisitStateModeChanged: null,
    dividerVisualTimer: null,
    dividerVisualRefreshToken: 0,
    dividerClickTimer: null,
    dividerStyleEl: null,
    titleListStacksByKey: new Map(),
    titleListStackStatsByKey: new Map(),
    titleListStackSequence: 0,
    titleListRepairTimer: 0,
    titleListRepairPages: new Set(),
    titleListRepairAllPages: false,
    titleListBatchDepth: 0,
    titleListBatchDirty: false,
    titleIntentReplayInFlight: false,
    titleIntentTrailingTimer: null,
    titleIntentLastAppliedByAnswer: new Map(),
    titleIntentStats: {
      replayRuns: 0,
      replayNoops: 0,
      replaySkippedInert: 0,
      replayReentrantSkips: 0,
      titleSetEventsSeen: 0,
      targetedApplies: 0,
      fullPageApplies: 0,
      resolverCalls: 0,
      resolverDefaultReturns: 0,
      domMutationsFromTitleIntent: 0,
      localStorageReads: 0,
      localStorageWrites: 0,
      mutationReplayRequests: 0,
      mutationReplaySelfIgnored: 0,
      membershipScans: 0,
      skippedMembershipScansInert: 0,
      debugSnapshotCalls: 0,
      debugSnapshotMutations: 0,
    },
    // Single in-memory ledger cache: localStorage is read at most once per
    // chat (and refreshed on write-through). Every hot path — mutation
    // observers, isCollapsed, title-set events — must answer "is the intent
    // system active?" from this cache in O(1) with zero storage IO.
    titleIntentLedgerCache: { chatId: '', ledger: null, inert: true },
    visitState: {
      currentVisitId: '',
      currentChatId: '',
      visitSequence: 0,
      resets: 0,
      lastMode: 'remember',
      resetAppliedThisVisit: false,
      resetAppliedAt: 0,
      clearedFamilies: 0,
      clearedFamilyNames: [],
      clearedKeys: [],
      skippedKeys: [],
      missingChatIdDeferrals: 0,
      restoreSuppressedBecauseReset: false,
      liveStateCleared: false,
      domCleanupApplied: false,
      lastResult: null,
      deferredTimer: 0,
    },
  };

  function MM_SH() {
    try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; }
  }

  function MM_CORE_API() {
    try { return MM_SH()?.api?.core || null; } catch { return null; }
  }

  function MM_CORE_PAGES() {
    const core = MM_CORE_API();
    try { return core?.pages || core || null; } catch { return core || null; }
  }

  function AT_PUBLIC() {
    try { return TOPW.H2O?.AT?.tnswrttl?.api?.public || null; } catch { return null; }
  }

  function WASH_PUBLIC() {
    try { return TOPW.H2O?.MM?.wash || W.H2O?.MM?.wash || null; } catch { return null; }
  }

  function CM_ROUTER_API() {
    try { return TOPW.H2O?.CM?.chtmech?.api || null; } catch { return null; }
  }

  function TAGS_API() {
    try {
      return TOPW.H2O?.Tags || TOPW.H2O?.LibraryCore?.getService?.('tags') || TOPW.H2O?.LibraryCore?.getOwner?.('tags') || null;
    } catch {
      return null;
    }
  }

  function UM_PUBLIC() {
    try { return TOPW.H2O?.UM?.nmntmssgs?.api || null; } catch { return null; }
  }

  function PG_ADAPTER() {
    try { return TOPW.H2O?.PW?.pgnwndw?.engine?.getChatAdapter?.() || null; } catch { return null; }
  }

  function ensureDividerStyle() {
    let styleEl = null;
    try { styleEl = document.getElementById(DIVIDER_STYLE_ID); } catch {}
    if (!styleEl) {
      try {
        styleEl = document.createElement('style');
        styleEl.id = DIVIDER_STYLE_ID;
        document.head.appendChild(styleEl);
      } catch {
        styleEl = null;
      }
    }
    if (!styleEl) return null;

    const css = `
.cgxui-chat-page-divider,
.cgxui-pgnw-page-divider {
  --cgxui-page-divider-dot-size: ${DIVIDER_VISUAL_KEYS.dotSizeExpandedPx}px;
  --cgxui-page-divider-dot-bg: ${DIVIDER_VISUAL_KEYS.expandedDotColor};
  --cgxui-page-divider-dot-glow: ${DIVIDER_VISUAL_KEYS.expandedDotGlowColor};
  --cgxui-page-divider-dot-glow-blur: ${DIVIDER_VISUAL_KEYS.expandedDotGlowBlurPx}px;
  --cgxui-page-divider-dot-glow-spread: ${DIVIDER_VISUAL_KEYS.expandedDotGlowSpreadPx}px;
}

.cgxui-chat-page-divider .cgxui-chat-page-divider-dot,
.cgxui-chat-page-divider .cgxui-pgnw-page-divider-dot,
.cgxui-pgnw-page-divider .cgxui-chat-page-divider-dot,
.cgxui-pgnw-page-divider .cgxui-pgnw-page-divider-dot {
  width: var(--cgxui-page-divider-dot-size) !important;
  height: var(--cgxui-page-divider-dot-size) !important;
  min-width: var(--cgxui-page-divider-dot-size) !important;
  min-height: var(--cgxui-page-divider-dot-size) !important;
  border-radius: 999px !important;
  background: var(--cgxui-page-divider-dot-bg) !important;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--cgxui-page-divider-dot-bg) 24%, rgba(255,255,255,0.16)),
    0 0 var(--cgxui-page-divider-dot-glow-blur) var(--cgxui-page-divider-dot-glow-spread) var(--cgxui-page-divider-dot-glow) !important;
  transition: background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, width 180ms ease, height 180ms ease !important;
}

/* Page title-bar stack: one stable H2O-owned container per title-listed
   page, anchored under the page divider. Its children are the REAL answer
   title bars (relocated when hydrated, generated by the Title Bar system's
   own factory when not), so they carry their own full styling — the
   container only provides layout and width alignment with the thread. */
.cgxui-chat-page-title-list-synth {
  margin: 6px auto 14px;
  max-width: var(--thread-content-max-width, 48rem);
  padding: 4px 8px 4px 42px; /* left gutter for the faded side numerals */
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cgxui-chat-page-title-list-synth > [data-cgxui="atns-answer-title"] {
  position: relative;
  overflow: visible;
  margin: 0 !important;
}
/* Page-circle title-list number: a compact, softly faded index marker. Keep
   the glyph complete; the big-answer right-edge mask clips right-aligned
   two-digit markers in this much narrower box. */
.cgxui-chat-page-title-list-synth > [data-cgxui="atns-answer-title"][data-h2o-title-list-num="1"][data-h2o-turn-num]::before {
  content: attr(data-h2o-turn-num);
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  transform-origin: right center;
  margin-right: 11px;
  width: 2.25rem;
  min-width: 2.25rem;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: oldstyle-nums tabular-nums;
  font-feature-settings: 'onum' 1, 'tnum' 1;
  letter-spacing: 0;
  line-height: 1;
  color: rgba(128, 128, 128, 0.28);
  text-shadow: 0 0 10px rgba(128, 128, 128, 0.10);
  text-align: right;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  z-index: 1;
  -webkit-mask-image: none;
  mask-image: none;
}
.cgxui-chat-page-title-list-synth > [data-h2o-title-row-opened="1"] {
  box-shadow: inset 2px 0 0 rgba(94, 190, 150, 0.7);
}
/* The ownership stamp is the durable hide projection. Other mechanisms may
   restore inline display while repairing their own state; they must not make
   title-list-owned flow visible unless the stack owner removes this stamp. */
[data-cgxui-chat-page-title-list-hidden] {
  display: none !important;
}
/* Native turn wrappers carry chat-column margins and width constraints. Keep
   them inside an H2O-owned layout boundary so opening one row can grow only
   vertically and cannot change the stack's horizontal anchor or width. */
.cgxui-chat-page-title-list-synth > [data-h2o-title-inline-slot="1"] {
  display: flow-root;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 0 6px;
  padding: 0;
  overflow: visible;
  contain: layout;
  isolation: isolate;
}
.cgxui-chat-page-title-list-synth > [data-h2o-title-inline-slot="1"] > [data-h2o-title-stack-inline] {
  display: var(--h2o-title-inline-display, block) !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box !important;
  margin-inline: 0 !important;
}
`;

    if (styleEl.textContent !== css) styleEl.textContent = css;
    S.dividerStyleEl = styleEl;
    return styleEl;
  }

  function clearDividerRefreshTimer() {
    S.dividerVisualRefreshToken = Number(S.dividerVisualRefreshToken || 0) + 1;
    if (!S.dividerVisualTimer) return;
    try { clearTimeout(S.dividerVisualTimer); } catch {}
    S.dividerVisualTimer = null;
  }

  function clearDividerClickTimer() {
    if (!S.dividerClickTimer) return;
    try { W.clearTimeout(S.dividerClickTimer); } catch {}
    S.dividerClickTimer = null;
  }

  function openTagsCloudFromDivider(divider) {
    if (!(divider instanceof HTMLElement)) return false;
    const api = TAGS_API();
    if (typeof api?.openTagsCloudPopup !== 'function') return false;
    const chatId = resolveChatId();
    try {
      return !!api.openTagsCloudPopup(divider, {
        currentChatId: chatId,
        reason: 'chat-page-divider',
      });
    } catch {
      return false;
    }
  }

  function isPageWrappedByPagination(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (!num || !id) return false;
    return isPageCollapsed(num, id)
      && getPageCollapseDriver(num, id) === 'engine'
      && getPageCollapseMode(num, id) === 'pagination';
  }

  function isDividerTitleCollapsed(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (!num || !id) return false;
    if (isTitleListActive(num, id)) return true;
    const summary = getPageCollapsedRowSummary(num, id);
    return !!summary.totalRows && !!summary.allCollapsed;
  }

  // Live per-row scan without the title-list-set shortcut. The divider circle
  // must decide collapse-vs-expand from what the rows actually look like, not
  // from the title-list bookkeeping — otherwise rows collapsed individually
  // (source `answer-title`) leave the page stuck in a mixed state the circle
  // can never resolve.
  function getLivePageRowCollapseSummary(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    const rows = getRows(num, id);
    let collapsedRows = 0;
    for (const row of rows) {
      if (isChatPageRowCollapsed(row)) collapsedRows += 1;
    }
    return {
      totalRows: rows.length,
      collapsedRows,
      allCollapsed: rows.length > 0 && collapsedRows >= rows.length,
      allExpanded: collapsedRows <= 0,
      mixed: collapsedRows > 0 && collapsedRows < rows.length,
    };
  }

  function getDividerUiMode(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (!num || !id) return 'normal';
    if (isPageWrappedByPagination(num, id)) return 'page_collapsed';
    if (isDividerTitleCollapsed(num, id)) return 'all_collapsed';
    return 'normal';
  }

  function getDividerCircleState(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return 'expanded';
    return isDividerTitleCollapsed(num, chatId) ? 'collapsed' : 'expanded';
  }

  function getDividerRoots(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return [];
    const escaped = (typeof CSS !== 'undefined' && CSS?.escape)
      ? CSS.escape(String(num))
      : String(num).replace(/[^a-z0-9_-]/gi, '\\$&');
    const selectors = [
      `.cgxui-chat-page-divider[data-page-num="${escaped}"]`,
      `.cgxui-chat-page-divider[data-cgxui-chat-page-num="${escaped}"]`,
      `.cgxui-pgnw-page-divider[data-page-num="${escaped}"]`,
      `.cgxui-pgnw-page-divider[data-cgxui-chat-page-num="${escaped}"]`,
    ];
    try {
      return Array.from(new Set(selectors.flatMap((sel) => Array.from(document.querySelectorAll(sel)))));
    } catch {
      return [];
    }
  }

  function getDividerStateTokens(state = 'expanded') {
    const collapsed = String(state || '').trim().toLowerCase() === 'collapsed';
    if (collapsed) {
      return {
        dotSizePx: Math.max(0, Number(DIVIDER_VISUAL_KEYS.dotSizeCollapsedPx || 0) || 0),
        dotColor: String(DIVIDER_VISUAL_KEYS.collapsedDotColor || '').trim() || '#b8c0cc',
        dotGlowColor: String(DIVIDER_VISUAL_KEYS.collapsedDotGlowColor || '').trim() || 'rgba(184, 192, 204, 0.30)',
        dotGlowBlurPx: Math.max(0, Number(DIVIDER_VISUAL_KEYS.collapsedDotGlowBlurPx || 0) || 0),
        dotGlowSpreadPx: Number(DIVIDER_VISUAL_KEYS.collapsedDotGlowSpreadPx || 0) || 0,
      };
    }
    return {
      dotSizePx: Math.max(0, Number(DIVIDER_VISUAL_KEYS.dotSizeExpandedPx || 0) || 0),
      dotColor: String(DIVIDER_VISUAL_KEYS.expandedDotColor || '').trim() || '#facc15',
      dotGlowColor: String(DIVIDER_VISUAL_KEYS.expandedDotGlowColor || '').trim() || 'rgba(250, 204, 21, 0.48)',
      dotGlowBlurPx: Math.max(0, Number(DIVIDER_VISUAL_KEYS.expandedDotGlowBlurPx || 0) || 0),
      dotGlowSpreadPx: Number(DIVIDER_VISUAL_KEYS.expandedDotGlowSpreadPx || 0) || 0,
    };
  }

  function getDividerDotEls(divider = null) {
    if (!divider?.querySelectorAll) return [];
    try {
      return Array.from(divider.querySelectorAll('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot'));
    } catch {
      return [];
    }
  }

  function isDividerLineCandidate(el = null, dividerRect = null) {
    if (!(el instanceof HTMLElement)) return false;
    if (!dividerRect) return false;
    const text = String(el.textContent || '').trim();
    if (text) return false;
    if (el.matches?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot')) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (rect.width < 24) return false;
    if (rect.height > 8) return false;
    if (rect.top < dividerRect.top - 24 || rect.bottom > dividerRect.bottom + 24) return false;
    return true;
  }

  function getDividerLineEls(divider = null) {
    if (!divider?.querySelectorAll) return { left: null, right: null };
    const dividerRect = divider.getBoundingClientRect();
    const centerX = dividerRect.left + (dividerRect.width / 2);
    const preferredSelectors = [
      '.cgxui-chat-page-divider-line',
      '.cgxui-pgnw-page-divider-line',
      '[data-cgxui-chat-page-divider-line]',
      '[data-cgxui-page-divider-line]',
      '[class*="divider-line"]',
      '[class*="page-divider-line"]',
      '[class*="divider-rule"]',
    ];

    const candidates = [];
    const seen = new Set();
    const pushCandidate = (el) => {
      if (!(el instanceof HTMLElement)) return;
      if (seen.has(el)) return;
      if (!isDividerLineCandidate(el, dividerRect)) return;
      seen.add(el);
      candidates.push(el);
    };

    for (const sel of preferredSelectors) {
      let nodes = [];
      try { nodes = Array.from(divider.querySelectorAll(sel)); } catch {}
      for (const el of nodes) pushCandidate(el);
    }

    if (!candidates.length) {
      let fallbackNodes = [];
      try { fallbackNodes = Array.from(divider.querySelectorAll('*')); } catch {}
      for (const el of fallbackNodes) pushCandidate(el);
    }

    const classify = (el) => {
      const rect = el.getBoundingClientRect();
      const midX = rect.left + (rect.width / 2);
      return { el, rect, midX, width: rect.width };
    };

    const leftItems = candidates.map(classify).filter((item) => item.midX <= centerX);
    const rightItems = candidates.map(classify).filter((item) => item.midX >= centerX);
    leftItems.sort((a, b) => b.width - a.width);
    rightItems.sort((a, b) => b.width - a.width);

    return {
      left: leftItems[0]?.el || null,
      right: rightItems[0]?.el || null,
    };
  }

  function getDividerLineBaseWidth(lineEl = null) {
    if (!(lineEl instanceof HTMLElement)) return 0;
    const cached = Number(lineEl.dataset?.cgxuiDividerBaseWidth || 0) || 0;
    if (cached > 0) return cached;
    const width = lineEl.getBoundingClientRect().width || 0;
    if (width > 0) {
      try { lineEl.dataset.cgxuiDividerBaseWidth = String(width); } catch {}
    }
    return width;
  }

  function applyDividerLineScale(lineEl = null, scale = 1, side = 'left') {
    if (!(lineEl instanceof HTMLElement)) return false;
    const nextScale = Math.max(0, Number(scale || 0) || 0);
    const origin = String(side || '').trim().toLowerCase() === 'right' ? 'left center' : 'right center';

    // Important: Core geometry recalculates line widths after divider render,
    // especially during boot/refresh. Width-based overrides lose that race.
    // Using transform keeps the geometry width as the base and extends only the
    // visual line length, so later geometry passes do not wipe out the effect.
    try { lineEl.style.removeProperty('flex'); } catch {}
    try { lineEl.style.removeProperty('width'); } catch {}
    try { lineEl.style.removeProperty('min-width'); } catch {}
    try { lineEl.style.removeProperty('max-width'); } catch {}
    try { lineEl.style.setProperty('transform-origin', origin, 'important'); } catch {}
    try { lineEl.style.setProperty('transform', `scaleX(${nextScale})`, 'important'); } catch {}
    try { lineEl.style.setProperty('will-change', 'transform', 'important'); } catch {}
    try { lineEl.style.setProperty('transition', 'transform 180ms ease', 'important'); } catch {}
    return true;
  }

  function applyDividerVisualsToRoot(divider = null, state = 'expanded', opts = {}) {
    if (!(divider instanceof HTMLElement)) return { ok: false, status: 'divider-missing' };

    const wrapped = !!opts?.wrapped;
    const tokens = getDividerStateTokens(state);
    const effectiveTokens = wrapped && state !== 'collapsed'
      ? {
          ...tokens,
          dotColor: '#9ca3af',
          dotGlowColor: 'rgba(156, 163, 175, 0.20)',
          dotGlowBlurPx: Math.max(4, Number(tokens.dotGlowBlurPx || 0) || 0),
        }
      : tokens;
    try { divider.setAttribute('data-cgxui-page-title-state', state); } catch {}
    if (wrapped) {
      try { divider.setAttribute('data-cgxui-page-wrap', '1'); } catch {}
    } else {
      try { divider.removeAttribute('data-cgxui-page-wrap'); } catch {}
    }
    try { divider.style.setProperty('--cgxui-page-divider-dot-size', `${effectiveTokens.dotSizePx}px`); } catch {}
    try { divider.style.setProperty('--cgxui-page-divider-dot-bg', effectiveTokens.dotColor); } catch {}
    try { divider.style.setProperty('--cgxui-page-divider-dot-glow', effectiveTokens.dotGlowColor); } catch {}
    try { divider.style.setProperty('--cgxui-page-divider-dot-glow-blur', `${effectiveTokens.dotGlowBlurPx}px`); } catch {}
    try { divider.style.setProperty('--cgxui-page-divider-dot-glow-spread', `${effectiveTokens.dotGlowSpreadPx}px`); } catch {}

    const dots = getDividerDotEls(divider);
    for (const dot of dots) {
      try { dot.style.setProperty('width', `${effectiveTokens.dotSizePx}px`, 'important'); } catch {}
      try { dot.style.setProperty('height', `${effectiveTokens.dotSizePx}px`, 'important'); } catch {}
      try { dot.style.setProperty('min-width', `${effectiveTokens.dotSizePx}px`, 'important'); } catch {}
      try { dot.style.setProperty('min-height', `${effectiveTokens.dotSizePx}px`, 'important'); } catch {}
    }

    const pills = Array.from(divider.querySelectorAll('.cgxui-chat-page-divider-pill, .cgxui-pgnw-page-divider-pill, [class*="page-divider-pill"]'));
    for (const pill of pills) {
      if (!(pill instanceof HTMLElement)) continue;
      if (wrapped) {
        try { pill.style.setProperty('background', 'rgba(28, 34, 31, 0.92)', 'important'); } catch {}
        try { pill.style.setProperty('border-style', 'dotted', 'important'); } catch {}
        try { pill.style.setProperty('border-color', 'rgba(148, 163, 156, 0.34)', 'important'); } catch {}
        try { pill.style.setProperty('box-shadow', '0 0 0 1px rgba(12, 16, 15, 0.55), inset 0 0 0 1px rgba(255,255,255,0.02)', 'important'); } catch {}
        try { pill.style.setProperty('opacity', '0.94', 'important'); } catch {}
      } else {
        try { pill.style.removeProperty('background'); } catch {}
        try { pill.style.removeProperty('border-style'); } catch {}
        try { pill.style.removeProperty('border-color'); } catch {}
        try { pill.style.removeProperty('box-shadow'); } catch {}
        try { pill.style.removeProperty('opacity'); } catch {}
      }
    }

    const lines = getDividerLineEls(divider);
    applyDividerLineScale(lines.left, DIVIDER_VISUAL_KEYS.lineLeftScale, 'left');
    applyDividerLineScale(lines.right, DIVIDER_VISUAL_KEYS.lineRightScale, 'right');

    return {
      ok: true,
      status: 'ok',
      state,
      wrapped,
      dots: dots.length,
      hasLeftLine: !!lines.left,
      hasRightLine: !!lines.right,
    };
  }

  function applyDividerVisualsForPage(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return { ok: false, status: 'page-missing', pageNum: num, count: 0 };
    ensureDividerStyle();
    const mode = getDividerUiMode(num, chatId);
    const state = getDividerCircleState(num, chatId);
    const wrapped = isPageWrappedByPagination(num, chatId);
    const roots = getDividerRoots(num);
    for (const divider of roots) applyDividerVisualsToRoot(divider, state, { wrapped });
    return { ok: true, status: 'ok', pageNum: num, mode, state, wrapped, count: roots.length };
  }

  function collectKnownPageNums(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const pageNums = new Set();
    try {
      const payload = getSections(id);
      for (const key of payload?.sections?.keys?.() || []) pageNums.add(Math.max(1, Number(key || 0) || 0));
    } catch {}
    for (const p of readCollapsedPages(id)) pageNums.add(Math.max(1, Number(p || 0) || 0));
    for (const p of readTitleListPages(id)) pageNums.add(Math.max(1, Number(p || 0) || 0));
    try {
      for (const divider of Array.from(document.querySelectorAll('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider'))) {
        const num = getDividerPageNum(divider);
        if (num) pageNums.add(num);
      }
    } catch {}
    return Array.from(pageNums).filter(Boolean).sort((a, b) => a - b);
  }

  function applyDividerVisualsForChat(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const pages = collectKnownPageNums(id);
    for (const pageNum of pages) applyDividerVisualsForPage(pageNum, id);
    return { ok: true, status: 'ok', chatId: id, pages };
  }

  function applyDividerVisualsToDivider(divider = null, opts = {}) {
    if (!(divider instanceof HTMLElement)) return { ok: false, status: 'divider-missing' };
    ensureDividerStyle();
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(opts?.pageNum || getDividerPageNum(divider) || 0) || 0);
    // Placement belongs exclusively to MiniMap Core's verified
    // forcePlaceDividerBeforeTurnWrapper() pass. This callback is visual only:
    // renderChatPageDividers runs immediately, in RAF, and from delayed
    // mutation/scroll repairs. Rebuilding stack rows here caused the first
    // correct list to be overwritten by a later divider-repair cadence.
    const mode = getDividerUiMode(num, id);
    const state = String(opts?.state || getDividerCircleState(num, id) || 'expanded').trim() || 'expanded';
    const wrapped = opts?.wrapped == null ? isPageWrappedByPagination(num, id) : !!opts.wrapped;
    const result = applyDividerVisualsToRoot(divider, state, { wrapped });
    return {
      ok: !!result?.ok,
      status: result?.status || (result?.ok ? 'ok' : 'failed'),
      chatId: id,
      pageNum: num,
      mode,
      state,
      wrapped,
      hasLeftLine: !!result?.hasLeftLine,
      hasRightLine: !!result?.hasRightLine,
    };
  }

  function scheduleDividerVisualRefresh(chatId = '', delay = 34) {
    clearDividerRefreshTimer();
    ensureDividerStyle();
    const id = String(chatId || resolveChatId()).trim();
    const token = Number(S.dividerVisualRefreshToken || 0);

    S.dividerVisualTimer = setTimeout(() => {
      if (token !== Number(S.dividerVisualRefreshToken || 0)) return;
      S.dividerVisualTimer = null;
      try { applyDividerVisualsForChat(id); } catch {}
    }, Math.max(0, Number(delay || 0) || 0));
    return true;
  }


  function resolveChatId() {
    try {
      const viaPages = MM_CORE_PAGES()?.getChatId?.();
      if (viaPages) return String(viaPages).trim();
    } catch {}
    try {
      const path = String(W.location.pathname || '/');
      const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
      if (m && m[1]) return decodeURIComponent(m[1]);
      return path || '/';
    } catch {
      return '';
    }
  }

  function safeChatKeyPart(chatId = '') {
    return String(chatId || '').trim().replace(/[^a-z0-9_-]/gi, '_');
  }

  function nsDisk() {
    try { return String(MM_SH()?.NS_DISK || 'h2o:prm:cgx:mnmp').trim(); } catch { return 'h2o:prm:cgx:mnmp'; }
  }

  function keyCollapsedPages(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    return safeId ? `${nsDisk()}:ui:chat-pages:collapsed:${safeId}:v1` : '';
  }

  function keyTitleListPages(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    return safeId ? `${nsDisk()}:ui:chat-pages:title-list:${safeId}:v1` : '';
  }

  function keyTitleIntentLedger(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    return safeId ? `${nsDisk()}:ui:chat-pages:title-intent:${safeId}:v2` : '';
  }

  function storageGetRaw(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    try {
      return W.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }

  function storageGetJSON(key, fallback = null) {
    const k = String(key || '').trim();
    if (!k) return fallback;
    try {
      const raw = W.localStorage?.getItem(k);
      return raw == null ? fallback : (JSON.parse(raw) ?? fallback);
    } catch {
      return fallback;
    }
  }

  function storageSetJSON(key, value) {
    const k = String(key || '').trim();
    if (!k) return false;
    try {
      W.localStorage?.setItem(k, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    try {
      W.localStorage?.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  function normalizePageNums(raw) {
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

  function normalizeAnswerIds(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const out = [];
    for (const item of src) {
      const id = String(item || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    out.sort();
    return out;
  }

  function normalizeTitleIntentState(state = '') {
    const s = String(state || '').trim().toLowerCase();
    return s === 'collapsed' ? 'collapsed' : 'expanded';
  }

  function samePageNums(a = [], b = []) {
    const left = normalizePageNums(a);
    const right = normalizePageNums(b);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function localReadCollapsedPagesSet(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const cached = S.collapsedPagesByChat.get(id);
    if (cached instanceof Set) return new Set(cached);
    const pages = normalizePageNums(storageGetJSON(keyCollapsedPages(id), []));
    const set = new Set(pages);
    S.collapsedPagesByChat.set(id, set);
    return new Set(set);
  }

  function localWriteCollapsedPagesSet(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const next = new Set(normalizePageNums(Array.isArray(pages) ? pages : Array.from(pages || [])));
    S.collapsedPagesByChat.set(id, next);
    storageSetJSON(keyCollapsedPages(id), Array.from(next));
    return new Set(next);
  }

  function localReadTitleListPagesSet(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const cached = S.titleListPagesByChat.get(id);
    if (cached instanceof Set) return new Set(cached);
    const pages = normalizePageNums(storageGetJSON(keyTitleListPages(id), []));
    const set = new Set(pages);
    S.titleListPagesByChat.set(id, set);
    return new Set(set);
  }

  function localWriteTitleListPagesSet(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return new Set();
    const next = new Set(normalizePageNums(Array.isArray(pages) ? pages : Array.from(pages || [])));
    S.titleListPagesByChat.set(id, next);
    storageSetJSON(keyTitleListPages(id), Array.from(next));
    return new Set(next);
  }

  function getDividerPageNum(divider = null) {
    return Math.max(1, Number(
      divider?.getAttribute?.('data-page-num') ||
      divider?.getAttribute?.('data-cgxui-chat-page-num') ||
      0
    ) || 0);
  }

  // ── Canonical Q+A pair contract ────────────────────────────────────────────
  // • A complete conversation unit is the Q+A pair: user prompt section plus the
  //   following assistant answer section. Page rows treat the pair as atomic.
  // • The assistant answer owns the single visible title bar for the pair.
  // • NO ANSWER shells are only for true orphan questions (no following answer).
  // • Page dividers anchor before the pair start (question wrapper), never
  //   between a question and its answer.
  // • Title collapse hides question + answer body; the bar stays as the handle.
  // ChatGPT wraps each turn <section data-testid="conversation-turn-N"
  // data-turn="user|assistant"> in its own only-child wrapper DIV, so sibling
  // walks between turn hosts dead-end. Pairing therefore uses document-order
  // adjacency over the live turn-section list, guarded to the same
  // conversation flow, with a short-lived cache for mass operations.
  const TURN_LIST_CACHE_TTL_MS = 300;
  let _turnSectionListCache = { at: 0, list: [] };

  function listTurnSections() {
    const now = Date.now();
    if (now - _turnSectionListCache.at <= TURN_LIST_CACHE_TTL_MS && _turnSectionListCache.list.length) {
      return _turnSectionListCache.list;
    }
    let list = [];
    try { list = Array.from(document.querySelectorAll(TURN_HOST_SEL)); } catch {}
    _turnSectionListCache = { at: now, list };
    return list;
  }

  function getTurnSectionForNode(node = null) {
    const el = node instanceof Element ? node : null;
    if (!el) return null;
    const direct = el.closest?.(TURN_HOST_SEL) || null;
    if (direct) return direct;
    // Wrapper div around a single turn section (2026 ChatGPT DOM shape).
    try {
      const inner = el.querySelectorAll?.(TURN_HOST_SEL) || [];
      if (inner.length === 1) return inner[0];
    } catch {}
    return null;
  }

  function sameConversationFlow(a = null, b = null) {
    if (!a || !b) return false;
    const flowOf = (el) => el.closest?.('main') || el.ownerDocument?.body || null;
    const fa = flowOf(a);
    return !!fa && fa === flowOf(b);
  }

  function getAdjacentTurnHost(host = null, dir = 1) {
    const section = getTurnSectionForNode(host);
    if (!section) return null;
    const list = listTurnSections();
    const idx = list.indexOf(section);
    if (idx < 0) return null;
    const next = list[idx + (dir < 0 ? -1 : 1)] || null;
    if (!next || !sameConversationFlow(section, next)) return null;
    return next;
  }

  function getTurnHostRole(host = null) {
    if (!host || host.nodeType !== 1) return '';
    const section = getTurnSectionForNode(host) || host;
    const turnAttr = String(section.getAttribute?.('data-turn') || '').trim().toLowerCase();
    if (turnAttr === 'user' || turnAttr === 'assistant') return turnAttr;
    const role = String(section.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
    if (role === 'user' || role === 'assistant') return role;
    try { if (section.querySelector?.(ASSISTANT_MSG_SEL)) return 'assistant'; } catch {}
    try { if (section.querySelector?.(USER_MSG_SEL)) return 'user'; } catch {}
    return '';
  }

  function getTurnHostForNode(node = null) {
    const el = node instanceof Element ? node : null;
    return getTurnSectionForNode(el) || el || null;
  }

  function getPreviousTurnHost(host = null) {
    const prev = getAdjacentTurnHost(host, -1);
    return prev && getTurnHostRole(prev) ? prev : null;
  }

  function getNextTurnHost(host = null) {
    const next = getAdjacentTurnHost(host, 1);
    return next && getTurnHostRole(next) ? next : null;
  }

  // The divider must sit between Q+A pairs, not inside a turn's only-child
  // wrapper chain. Climb from the pair-start section through wrappers whose
  // sole element child is the turn, and return the outermost such wrapper.
  function getTurnAnchorNode(host = null) {
    const section = getTurnSectionForNode(host) || (host instanceof Element ? host : null);
    if (!section) return null;
    let cur = section;
    while (cur.parentElement && cur.parentElement !== document.body) {
      const parent = cur.parentElement;
      // Inline-opened native wrappers live inside an H2O slot. The slot and
      // stack are layout owners, never part of the native turn anchor.
      if (parent.matches?.('[data-h2o-title-inline-slot="1"], [data-cgxui="chat-page-title-list-synth"]')) break;
      if (parent.children.length !== 1) break;
      // Never climb past the conversation flow container.
      if (parent.matches?.('main')) break;
      cur = parent;
    }
    return cur;
  }

  function getQuestionHostForAnswerHost(answerHost = null, answerMsgEl = null, opts = {}) {
    const host = getTurnHostForNode(answerHost || answerMsgEl);
    if (!host) return null;
    if (opts?.turnHostOnly !== true) {
      try {
        const sameTurnQuestion = host.querySelector?.(USER_MSG_SEL) || null;
        if (sameTurnQuestion && answerMsgEl && !sameTurnQuestion.contains?.(answerMsgEl)) return sameTurnQuestion;
      } catch {}
    }
    const prev = getPreviousTurnHost(host);
    return getTurnHostRole(prev) === 'user' ? prev : null;
  }

  function getPairedAssistantHostForQuestion(questionHost = null) {
    const host = getTurnHostForNode(questionHost);
    if (!host) return null;
    try {
      if (host.querySelector?.(ASSISTANT_MSG_SEL)) return host;
    } catch {}
    const next = getNextTurnHost(host);
    return getTurnHostRole(next) === 'assistant' ? next : null;
  }

  function removeNoAnswerTitleBar(host = null) {
    if (!host?.querySelectorAll) return 0;
    let removed = 0;
    try {
      for (const bar of Array.from(host.querySelectorAll(NO_ANSWER_TITLE_BAR_SEL))) {
        try { bar.remove(); removed += 1; } catch {}
      }
      host.removeAttribute?.('data-cgxui-chat-page-no-answer');
      host.removeAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN);
    } catch {}
    return removed;
  }

  function normalizeFullTurnRows(rows = []) {
    const out = [];
    const seenAnswerIds = new Set();
    for (const raw of Array.isArray(rows) ? rows : []) {
      if (!raw) continue;
      if (raw.noAnswer) {
        const questionHost = raw.questionHost || raw.answerHost || null;
        if (getPairedAssistantHostForQuestion(questionHost)) {
          removeNoAnswerTitleBar(questionHost);
          continue;
        }
        out.push(raw);
        continue;
      }
      const answerId = String(raw.answerId || '').trim();
      if (answerId) {
        if (seenAnswerIds.has(answerId)) continue;
        seenAnswerIds.add(answerId);
      }
      const questionHost = raw.questionHost || getQuestionHostForAnswerHost(raw.answerHost, raw.answerMsgEl) || null;
      if (questionHost) removeNoAnswerTitleBar(questionHost);
      out.push(questionHost === raw.questionHost ? raw : Object.assign({}, raw, { questionHost }));
    }
    return out;
  }

  function normalizeFullTurnSections(payload = null) {
    const sections = payload?.sections instanceof Map ? payload.sections : new Map();
    if (!sections.size) return payload || { sections: new Map(), allHosts: [] };

    const assistantPageByQuestion = new Map();
    for (const section of sections.values()) {
      const pageNum = Math.max(1, Number(section?.pageNum || 0) || 0);
      for (const host of Array.isArray(section?.hosts) ? section.hosts : []) {
        if (getTurnHostRole(host) !== 'assistant') continue;
        const qHost = getQuestionHostForAnswerHost(host, host?.querySelector?.(ASSISTANT_MSG_SEL) || null, { turnHostOnly: true });
        if (qHost) assistantPageByQuestion.set(qHost, pageNum);
      }
    }

    const nextSections = new Map();
    const allHosts = [];
    const allSeen = new Set();
    for (const [key, section] of sections) {
      const pageNum = Math.max(1, Number(section?.pageNum || key || 0) || 0);
      const hostSeen = new Set();
      const hosts = [];
      const addHost = (host) => {
        if (!host || hostSeen.has(host)) return;
        hostSeen.add(host);
        hosts.push(host);
        if (!allSeen.has(host)) {
          allSeen.add(host);
          allHosts.push(host);
        }
      };

      for (const host of Array.isArray(section?.hosts) ? section.hosts : []) {
        const role = getTurnHostRole(host);
        if (role === 'user') {
          const answerPage = assistantPageByQuestion.get(host) || 0;
          if (answerPage && answerPage !== pageNum) {
            removeNoAnswerTitleBar(host);
            continue;
          }
          addHost(host);
          continue;
        }
        if (role === 'assistant') {
          const qHost = getQuestionHostForAnswerHost(host, host?.querySelector?.(ASSISTANT_MSG_SEL) || null, { turnHostOnly: true });
          if (qHost) {
            removeNoAnswerTitleBar(qHost);
            addHost(qHost);
          }
          addHost(host);
          continue;
        }
        addHost(host);
      }

      // Keep hosts in document order so hosts[0] is the true pair start even
      // when the raw builder appended question hosts after assistant hosts.
      hosts.sort((a, b) => {
        if (a === b) return 0;
        try {
          return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
        } catch { return 0; }
      });
      nextSections.set(pageNum || key, Object.assign({}, section, { pageNum: pageNum || section?.pageNum, hosts, hostSet: new Set(hosts) }));
    }

    return { sections: nextSections, allHosts };
  }

  function getRows(pageNum = 0, chatId = '') {
    try { return normalizeFullTurnRows(MM_CORE_PAGES()?.getRows?.(pageNum, chatId) || []); } catch { return []; }
  }

  function getPageAnswerIds(pageNum = 0, chatId = '') {
    return Array.from(new Set(
      getRows(pageNum, chatId)
        .filter((row) => !row?.noAnswer)
        .map((row) => String(row?.answerId || '').trim())
        .filter(Boolean)
    ));
  }

  // Rows only cover pairs whose content and title bar are currently hydrated.
  // Mass page actions must use authoritative membership — the canonical turn
  // list slice for the page — or freshly hydrating rows escape the action.
  // Ids that cannot be applied yet are collapsed on hydration by the
  // onTitleSet re-apply path.
  function getAuthoritativePageAnswerIds(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const ids = new Set(getPageAnswerIds(num, chatId));
    try {
      const list = MM_CORE_API()?.getTurnList?.() || [];
      if (Array.isArray(list) && list.length) {
        const start = (num - 1) * 25;
        const end = Math.min(list.length, start + 25);
        for (let i = start; i < end; i += 1) {
          const aId = String(list[i]?.answerId || '').trim();
          if (aId) ids.add(aId);
        }
      }
    } catch {}
    return Array.from(ids);
  }

  function createEmptyTitleIntentLedger() {
    return { rev: 0, pages: {}, overrides: {} };
  }

  function normalizeTitleIntentLedger(raw = null) {
    // Already-normalized ledgers (cache hits) pass through untouched: the
    // defensive normalize calls in every helper must not deep-copy on hot
    // paths. The marker is non-enumerable so JSON.stringify never persists it.
    if (raw && raw.__h2oTitleIntentNormalized === true) return raw;
    const out = createEmptyTitleIntentLedger();
    try {
      Object.defineProperty(out, '__h2oTitleIntentNormalized', { value: true, enumerable: false });
    } catch {}
    if (raw && typeof raw === 'object') {
      out.rev = Math.max(0, Number(raw.rev || 0) || 0);
      const pages = (raw.pages && typeof raw.pages === 'object') ? raw.pages : {};
      for (const [pageKey, entry] of Object.entries(pages)) {
        const pageNum = Math.max(1, Number(pageKey || entry?.page || 0) || 0);
        if (!pageNum || !entry || typeof entry !== 'object') continue;
        const rev = Math.max(0, Number(entry.rev || 0) || 0);
        out.pages[String(pageNum)] = {
          state: normalizeTitleIntentState(entry.state),
          rev,
          at: Math.max(0, Number(entry.at || 0) || 0),
          source: String(entry.source || 'unknown').trim() || 'unknown',
        };
        out.rev = Math.max(out.rev, rev);
      }
      const overrides = (raw.overrides && typeof raw.overrides === 'object') ? raw.overrides : {};
      for (const [rawAnswerId, entry] of Object.entries(overrides)) {
        const answerId = String(rawAnswerId || '').trim();
        if (!answerId || !entry || typeof entry !== 'object') continue;
        const rev = Math.max(0, Number(entry.rev || 0) || 0);
        out.overrides[answerId] = {
          state: normalizeTitleIntentState(entry.state),
          rev,
          page: Math.max(0, Number(entry.page || 0) || 0) || null,
          at: Math.max(0, Number(entry.at || 0) || 0),
          source: String(entry.source || 'manual').trim() || 'manual',
        };
        out.rev = Math.max(out.rev, rev);
      }
    }
    return out;
  }

  function countActiveTitleIntentPages(ledger = null) {
    const src = normalizeTitleIntentLedger(ledger);
    return Object.values(src.pages || {}).filter((entry) => Number(entry?.rev || 0) > 0).length;
  }

  function countActiveTitleIntentOverrides(ledger = null) {
    const src = normalizeTitleIntentLedger(ledger);
    return Object.values(src.overrides || {}).filter((entry) => Number(entry?.rev || 0) > 0).length;
  }

  function isTitleIntentLedgerInert(ledger = null) {
    const src = normalizeTitleIntentLedger(ledger);
    return countActiveTitleIntentPages(src) <= 0 && countActiveTitleIntentOverrides(src) <= 0;
  }

  function getTitleIntentStats() {
    return Object.assign({}, S.titleIntentStats || {});
  }

  function incTitleIntentStat(name = '', amount = 1) {
    const key = String(name || '').trim();
    if (!key) return;
    S.titleIntentStats[key] = Math.max(0, Number(S.titleIntentStats[key] || 0) || 0) + amount;
  }

  function cacheTitleIntentLedger(chatId = '', ledger = null) {
    const normalized = normalizeTitleIntentLedger(ledger);
    S.titleIntentLedgerCache = {
      chatId: String(chatId || '').trim(),
      ledger: normalized,
      inert: countActiveTitleIntentPages(normalized) <= 0 && countActiveTitleIntentOverrides(normalized) <= 0,
    };
    return normalized;
  }

  function readTitleIntentLedger(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const cache = S.titleIntentLedgerCache;
    if (cache && cache.chatId === id && cache.ledger) return cache.ledger;
    const key = keyTitleIntentLedger(id);
    incTitleIntentStat('localStorageReads');
    return cacheTitleIntentLedger(id, storageGetJSON(key, null));
  }

  function writeTitleIntentLedger(chatId = '', ledger = null) {
    const id = String(chatId || resolveChatId()).trim();
    const key = keyTitleIntentLedger(id);
    // The cache may hand back the same object callers then mutate; re-derive
    // the inert flag on every write-through so the O(1) gate stays truthful.
    const next = cacheTitleIntentLedger(id, ledger);
    incTitleIntentStat('localStorageWrites');
    if (key) storageSetJSON(key, next);
    return next;
  }

  // ── Central safety gate ─────────────────────────────────────────────────
  // THE single question every title-intent path asks first. O(1), no storage
  // IO, no allocation after the first per-chat read. While this returns
  // false the entire title-intent system is inert: no membership scans, no
  // resolver-driven DOM work, no replay scheduling, no projection stamping.
  // Only the two explicit user gestures (page circle click, manual title
  // toggle on a page that already has an intent) can flip it to true.
  function isTitleIntentEngineActive(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const cache = S.titleIntentLedgerCache;
    if (cache && cache.chatId === id && cache.ledger) return !cache.inert;
    readTitleIntentLedger(id);
    return !(S.titleIntentLedgerCache?.inert !== false);
  }

  function bumpTitleIntentRev(ledger = null) {
    const next = normalizeTitleIntentLedger(ledger);
    next.rev = Math.max(0, Number(next.rev || 0) || 0) + 1;
    return next.rev;
  }

  function titleIntentPageHasActiveState(pageNum = 0, ledger = null) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return false;
    const src = normalizeTitleIntentLedger(ledger);
    if (Number(src.pages?.[String(num)]?.rev || 0) > 0) return true;
    return Object.values(src.overrides || {}).some((entry) => Number(entry?.rev || 0) > 0
      && Math.max(1, Number(entry?.page || 0) || 0) === num);
  }

  function getTitleIntentPageForAnswerFromLedger(answerId = '', ledger = null) {
    const id = String(answerId || '').trim();
    if (!id) return null;
    const src = normalizeTitleIntentLedger(ledger);
    const overridePage = Math.max(0, Number(src.overrides?.[id]?.page || 0) || 0) || null;
    if (overridePage) return overridePage;
    return null;
  }

  function titleIntentDesiredIsActive(desired = null) {
    return !!desired && Number(desired.rev || 0) > 0
      && (desired.source === 'page-intent' || desired.source === 'manual');
  }

  function getHydratedTitleActualState(msgEl = null, bar = null) {
    if (!msgEl || !bar) return null;
    const msgCollapsed = msgEl?.getAttribute?.('data-at-collapsed') === '1';
    const barCollapsed = String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
    return (msgCollapsed || barCollapsed) ? 'collapsed' : 'expanded';
  }

  function titleIntentProjectionMatches(bar = null, desired = null) {
    if (!bar || !desired) return false;
    return String(bar.getAttribute?.('data-h2o-title-desired') || '') === String(desired.state || '')
      && String(bar.getAttribute?.('data-h2o-title-state-source') || '') === String(desired.source || '')
      && Number(bar.getAttribute?.('data-h2o-title-rev') || 0) === Math.max(0, Number(desired.rev || 0) || 0);
  }

  function beginTitleIntentReplay(opts = {}) {
    if (opts?.withinTitleIntentReplay === true) return true;
    if (S.titleIntentReplayInFlight) {
      incTitleIntentStat('replayReentrantSkips');
      return false;
    }
    S.titleIntentReplayInFlight = true;
    incTitleIntentStat('replayRuns');
    return true;
  }

  function endTitleIntentReplay(opts = {}) {
    if (opts?.withinTitleIntentReplay === true) return;
    S.titleIntentReplayInFlight = false;
  }

  function scheduleTrailingTitleIntentReplay(request = {}) {
    if (S.titleIntentTrailingTimer) return false;
    S.titleIntentTrailingTimer = W.setTimeout(() => {
      S.titleIntentTrailingTimer = null;
      const chatId = String(request?.chatId || resolveChatId()).trim();
      const ledger = readTitleIntentLedger(chatId);
      if (isTitleIntentLedgerInert(ledger)) {
        incTitleIntentStat('replaySkippedInert');
        return;
      }
      const answerId = String(request?.answerId || '').trim();
      const pageNum = Math.max(1, Number(request?.pageNum || request?.page || 0) || 0);
      try {
        if (answerId) applyTitleIntentToAnswer(answerId, { chatId, page: pageNum, animate: false, source: 'title-intent:trailing' });
        else if (pageNum) applyTitleIntentToPage(pageNum, { chatId, animate: false, source: 'title-intent:trailing' });
      } catch {}
    }, 0);
    return true;
  }

  // Page lookup for the resolver MUST be cheap and side-effect free: the
  // in-memory canonical turn list only. It must never call findRowByAnswerId
  // or getAuthoritativePageAnswerIds — those route through the Core row
  // builder, which is O(page) per call and CREATES no-answer title bars as a
  // side effect. Doing that per resolver call (isCollapsed / mutation
  // reconcile / title-set) is what froze chat open: thousands of mutations ×
  // all known pages × row builds, each build emitting new DOM mutations that
  // re-fed the observer. If the turn list cannot answer, return null and let
  // the caller treat the state as default — never scan to find out.
  function findPageForAnswerId(answerId = '') {
    const id = String(answerId || '').trim();
    if (!id) return null;
    try {
      const list = MM_CORE_API()?.getTurnList?.() || [];
      if (Array.isArray(list)) {
        const idx = list.findIndex((turn) => String(turn?.answerId || turn?.primaryAId || '').trim() === id);
        if (idx >= 0) return Math.max(1, Math.ceil((idx + 1) / 25));
      }
    } catch {}
    return null;
  }

  function resolveDesiredTitleState(answerId = '', opts = {}) {
    incTitleIntentStat('resolverCalls');
    const id = String(answerId || '').trim();
    const chatId = String(opts?.chatId || resolveChatId()).trim();
    const ledger = opts?.ledger ? normalizeTitleIntentLedger(opts.ledger) : readTitleIntentLedger(chatId);
    const explicitPage = Math.max(0, Number(opts?.page || opts?.pageNum || 0) || 0) || null;
    if (isTitleIntentLedgerInert(ledger)) {
      incTitleIntentStat('resolverDefaultReturns');
      return { state: 'expanded', source: 'default', rev: 0, page: explicitPage };
    }
    const page = explicitPage
      || getTitleIntentPageForAnswerFromLedger(id, ledger)
      || findPageForAnswerId(id)
      || null;
    const pageIntent = page ? ledger.pages[String(page)] || null : null;
    const override = id ? ledger.overrides[id] || null : null;
    const pageRev = Math.max(0, Number(pageIntent?.rev || 0) || 0);
    const overrideRev = Math.max(0, Number(override?.rev || 0) || 0);
    if (override && overrideRev > pageRev) {
      return { state: normalizeTitleIntentState(override.state), source: 'manual', rev: overrideRev, page };
    }
    if (pageIntent) {
      return { state: normalizeTitleIntentState(pageIntent.state), source: 'page-intent', rev: pageRev, page };
    }
    incTitleIntentStat('resolverDefaultReturns');
    return { state: 'expanded', source: 'default', rev: 0, page };
  }

  function writePageTitleIntent(pageNum = 0, state = 'expanded', opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!id || !num) return { ok: false, status: 'invalid-page-intent', chatId: id, pageNum: num };
    const ledger = readTitleIntentLedger(id);
    const rev = bumpTitleIntentRev(ledger);
    const nextState = normalizeTitleIntentState(state);
    if (!Array.isArray(opts?.answerIds)) incTitleIntentStat('membershipScans');
    const members = normalizeAnswerIds(opts?.answerIds || getAuthoritativePageAnswerIds(num, id));
    ledger.pages[String(num)] = {
      state: nextState,
      rev,
      at: Date.now(),
      source: String(opts?.source || 'chat-page-divider:circle').trim() || 'chat-page-divider:circle',
    };
    for (const answerId of members) {
      const override = ledger.overrides[answerId] || null;
      if (!override || Number(override.rev || 0) <= rev) delete ledger.overrides[answerId];
    }
    writeTitleIntentLedger(id, ledger);
    return { ok: true, status: 'ok', chatId: id, pageNum: num, state: nextState, rev, members };
  }

  function recordManualTitleOverride(answerId = '', state = 'expanded', opts = {}) {
    const answer = String(answerId || '').trim();
    const id = String(opts?.chatId || resolveChatId()).trim();
    if (!answer || !id) return { ok: false, status: 'invalid-manual-title-intent', answerId: answer, chatId: id };
    const ledger = readTitleIntentLedger(id);
    // Overrides exist to protect a manual choice from a PAGE intent. With no
    // active intent anywhere, the legacy/engine manual systems already own the
    // state — recording an override here would flip the ledger non-inert
    // forever and re-arm the whole replay machinery on every future chat
    // open. Manual toggles must never bootstrap the engine.
    if (isTitleIntentLedgerInert(ledger)) {
      incTitleIntentStat('replaySkippedInert');
      return { ok: true, status: 'skipped-inert', answerId: answer, chatId: id };
    }
    const rev = bumpTitleIntentRev(ledger);
    const page = Math.max(0, Number(opts?.page || opts?.pageNum || findPageForAnswerId(answer) || 0) || 0) || null;
    ledger.overrides[answer] = {
      state: normalizeTitleIntentState(state),
      rev,
      page,
      at: Date.now(),
      source: String(opts?.source || 'answer-title').trim() || 'answer-title',
    };
    writeTitleIntentLedger(id, ledger);
    return { ok: true, status: 'ok', chatId: id, answerId: answer, state: ledger.overrides[answer].state, rev, page };
  }

  function stampTitleIntentProjection(answerId = '', desired = null, bar = null, shell = null) {
    const id = String(answerId || '').trim();
    const d = desired || resolveDesiredTitleState(id);
    try {
      // No-op guard: identical projection attrs must not touch the DOM at
      // all — attribute churn is observable by other modules' observers.
      if (bar && titleIntentProjectionMatches(bar, d)
        && String(bar.getAttribute?.('data-h2o-title-answer-id') || '') === id
        && (!shell || String(shell.getAttribute?.('data-h2o-title-pending-rev') || '0') === String(Math.max(0, Number(d.rev || 0) || 0)))) {
        return d;
      }
      incTitleIntentStat('domMutationsFromTitleIntent');
      if (bar) {
        bar.setAttribute('data-h2o-title-answer-id', id);
        if (d.page != null) bar.setAttribute('data-h2o-title-page', String(d.page));
        else bar.removeAttribute('data-h2o-title-page');
        bar.setAttribute('data-h2o-title-desired', d.state);
        bar.setAttribute('data-h2o-title-state-source', d.source);
        bar.setAttribute('data-h2o-title-rev', String(Math.max(0, Number(d.rev || 0) || 0)));
        bar.setAttribute('data-h2o-title-hydrated', '1');
      }
      if (shell && d.rev > 0) {
        shell.setAttribute('data-h2o-title-pending-state', d.state);
        shell.setAttribute('data-h2o-title-pending-rev', String(Math.max(0, Number(d.rev || 0) || 0)));
        if (d.page != null) shell.setAttribute('data-h2o-title-page', String(d.page));
      }
    } catch {}
    return d;
  }

  function applyTitleIntentToAnswer(answerId = '', opts = {}) {
    const id = String(answerId || '').trim();
    if (!id) return { ok: false, status: 'invalid-answer-id', answerId: id };
    const chatId = String(opts?.chatId || resolveChatId()).trim();
    const ledger = opts?.ledger ? normalizeTitleIntentLedger(opts.ledger) : readTitleIntentLedger(chatId);
    if (isTitleIntentLedgerInert(ledger)) {
      incTitleIntentStat('replaySkippedInert');
      return { ok: true, status: 'skipped-inert', answerId: id, hydrated: false };
    }
    if (!beginTitleIntentReplay(opts)) {
      scheduleTrailingTitleIntentReplay({ chatId, answerId: id, pageNum: opts?.page || opts?.pageNum });
      return { ok: true, status: 'reentrant-scheduled', answerId: id, hydrated: false };
    }
    try {
      incTitleIntentStat('targetedApplies');
      const desired = resolveDesiredTitleState(id, { chatId, page: opts?.page || opts?.pageNum, ledger });
      if (!titleIntentDesiredIsActive(desired)) {
        incTitleIntentStat('replayNoops');
        return { ok: true, status: 'default-noop', answerId: id, desired, hydrated: false };
      }
      const at = AT_PUBLIC();
      const msgEl = at?.getMessageEl?.(id) || null;
      const bar = at?.getBar?.(id) || null;
      const shell = msgEl?.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]') || msgEl?.parentElement || null;
      if (!msgEl || !bar) {
        stampTitleIntentProjection(id, desired, bar, shell);
        return { ok: true, status: 'deferred-unhydrated', answerId: id, desired, hydrated: false };
      }
      const actualState = getHydratedTitleActualState(msgEl, bar);
      const applyKey = `${id}:${desired.state}:${desired.source}:${Math.max(0, Number(desired.rev || 0) || 0)}`;
      if (actualState === desired.state
        && titleIntentProjectionMatches(bar, desired)
        && S.titleIntentLastAppliedByAnswer.get(id) === applyKey) {
        incTitleIntentStat('replayNoops');
        return { ok: true, status: 'noop-current', answerId: id, desired, hydrated: true };
      }
      stampTitleIntentProjection(id, desired, bar, shell);
      if (actualState === desired.state) {
        S.titleIntentLastAppliedByAnswer.set(id, applyKey);
        incTitleIntentStat('replayNoops');
        return { ok: true, status: 'noop-projection-only', answerId: id, desired, hydrated: true };
      }
      const collapsed = desired.state === 'collapsed';
      incTitleIntentStat('domMutationsFromTitleIntent');
      try {
        at?.setCollapsed?.(id, collapsed, {
          animate: opts?.animate === true,
          source: `title-intent:${desired.source}`,
        });
      } catch {}
      stampTitleIntentProjection(id, desired, at?.getBar?.(id) || bar, shell);
      S.titleIntentLastAppliedByAnswer.set(id, applyKey);
      return { ok: true, status: 'applied', answerId: id, desired, hydrated: true };
    } finally {
      endTitleIntentReplay(opts);
    }
  }

  function applyTitleIntentToPage(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const ledger = opts?.ledger ? normalizeTitleIntentLedger(opts.ledger) : readTitleIntentLedger(id);
    if (isTitleIntentLedgerInert(ledger) || !titleIntentPageHasActiveState(num, ledger)) {
      incTitleIntentStat('replaySkippedInert');
      return { ok: true, status: 'skipped-inert', chatId: id, pageNum: num, members: 0, hydrated: 0, unhydrated: 0, results: [] };
    }
    if (!beginTitleIntentReplay(opts)) {
      scheduleTrailingTitleIntentReplay({ chatId: id, pageNum: num });
      return { ok: true, status: 'reentrant-scheduled', chatId: id, pageNum: num, members: 0, hydrated: 0, unhydrated: 0, results: [] };
    }
    try {
      incTitleIntentStat('fullPageApplies');
      if (!Array.isArray(opts?.answerIds)) incTitleIntentStat('membershipScans');
      const members = normalizeAnswerIds(opts?.answerIds || getAuthoritativePageAnswerIds(num, id));
      const results = [];
      for (const answerId of members) {
        results.push(applyTitleIntentToAnswer(answerId, {
          chatId: id,
          page: num,
          animate: opts?.animate === true,
          ledger,
          withinTitleIntentReplay: true,
        }));
      }
      return {
        ok: true,
        status: 'ok',
        chatId: id,
        pageNum: num,
        members: members.length,
        hydrated: results.filter((r) => r?.hydrated).length,
        unhydrated: results.filter((r) => !r?.hydrated).length,
        results,
      };
    } finally {
      endTitleIntentReplay(opts);
    }
  }

  function getResolvedPageTitleIntentSummary(pageNum = 0, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const ledger = readTitleIntentLedger(id);
    const members = normalizeAnswerIds(getAuthoritativePageAnswerIds(num, id));
    let collapsed = 0;
    let expanded = 0;
    for (const answerId of members) {
      const desired = resolveDesiredTitleState(answerId, { chatId: id, page: num, ledger });
      if (desired.state === 'collapsed') collapsed += 1;
      else expanded += 1;
    }
    return {
      chatId: id,
      pageNum: num,
      ledger,
      members,
      collapsed,
      expanded,
      allCollapsed: members.length > 0 && collapsed >= members.length,
      allExpanded: expanded >= members.length,
      mixed: collapsed > 0 && expanded > 0,
    };
  }

  function getNoAnswerRows(pageNum = 0, chatId = '') {
    return getRows(pageNum, chatId).filter((row) => !!row?.noAnswer && !!row?.answerHost && !!row?.titleBar);
  }

  function getPageCollapsedRowSummary(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    const rows = getRows(num, id);
    if (!rows.length) {
      return {
        rows,
        totalRows: 0,
        collapsedRows: 0,
        allCollapsed: false,
        allExpanded: true,
        normalRows: [],
        noAnswerRows: [],
      };
    }

    const normalRows = rows.filter((row) => !row?.noAnswer && !!String(row?.answerId || '').trim());
    const noAnswerRows = rows.filter((row) => !!row?.noAnswer);
    if (isTitleListActive(num, id)) {
      return {
        rows,
        totalRows: rows.length,
        collapsedRows: rows.length,
        allCollapsed: rows.length > 0,
        allExpanded: false,
        normalRows,
        noAnswerRows,
      };
    }

    let collapsedRows = 0;
    if (normalRows.length) {
      collapsedRows += normalRows.filter((row) => isChatPageRowCollapsed(row)).length;
    }

    if (noAnswerRows.length) {
      collapsedRows += noAnswerRows.filter((row) => isChatPageRowCollapsed(row)).length;
    }

    return {
      rows,
      totalRows: rows.length,
      collapsedRows,
      allCollapsed: collapsedRows >= rows.length,
      allExpanded: collapsedRows <= 0,
      normalRows,
      noAnswerRows,
    };
  }

  function getSections(chatId = '') {
    try { return normalizeFullTurnSections(MM_CORE_PAGES()?.getSections?.(chatId) || { sections: new Map(), allHosts: [] }); } catch { return { sections: new Map(), allHosts: [] }; }
  }

  function normalizeVisualDriver(driver = 'legacy') {
    return String(driver || '').trim().toLowerCase() === 'engine' ? 'engine' : 'legacy';
  }

  function _driverStoreGet(store, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { chatId: '', map: new Map() };
    let map = store.get(id);
    if (!(map instanceof Map)) {
      map = new Map();
      store.set(id, map);
    }
    return { chatId: id, map };
  }

  function getDriverForPage(store, pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return 'legacy';
    const entry = _driverStoreGet(store, chatId);
    return normalizeVisualDriver(entry.map.get(num));
  }

  function setDriverForPage(store, pageNum = 0, active = false, driver = 'legacy', chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const entry = _driverStoreGet(store, chatId);
    if (!entry.chatId || !num) return 'legacy';
    if (active) entry.map.set(num, normalizeVisualDriver(driver));
    else entry.map.delete(num);
    if (!entry.map.size) store.delete(entry.chatId);
    return getDriverForPage(store, num, entry.chatId);
  }

  function getPageCollapseDriver(pageNum = 0, chatId = '') {
    return getDriverForPage(S.collapsedPageDriversByChat, pageNum, chatId);
  }

  function setPageCollapseDriver(pageNum = 0, active = false, driver = 'legacy', chatId = '') {
    return setDriverForPage(S.collapsedPageDriversByChat, pageNum, active, driver, chatId);
  }

  function _pageModeStoreGet(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { chatId: '', map: new Map() };
    let map = S.collapsedPageModesByChat.get(id);
    if (!(map instanceof Map)) {
      map = new Map();
      S.collapsedPageModesByChat.set(id, map);
    }
    return { chatId: id, map };
  }

  function getPageCollapseMode(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return '';
    const entry = _pageModeStoreGet(chatId);
    return String(entry.map.get(num) || '').trim().toLowerCase();
  }

  function setPageCollapseMode(pageNum = 0, active = false, mode = '', chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const entry = _pageModeStoreGet(chatId);
    if (!entry.chatId || !num) return '';
    const normalized = String(mode || '').trim().toLowerCase();
    if (active && normalized) entry.map.set(num, normalized);
    else entry.map.delete(num);
    if (!entry.map.size) S.collapsedPageModesByChat.delete(entry.chatId);
    return getPageCollapseMode(num, entry.chatId);
  }

  function _detachedPageStoreGet(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { chatId: '', map: new Map() };
    let map = S.detachedPageHostsByChat.get(id);
    if (!(map instanceof Map)) {
      map = new Map();
      S.detachedPageHostsByChat.set(id, map);
    }
    return { chatId: id, map };
  }

  function getDetachedPageRecord(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return null;
    const entry = _detachedPageStoreGet(chatId);
    return entry.map.get(num) || null;
  }

  function clearDetachedPageRecord(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const entry = _detachedPageStoreGet(chatId);
    if (!entry.chatId || !num) return null;
    const prev = entry.map.get(num) || null;
    entry.map.delete(num);
    if (!entry.map.size) S.detachedPageHostsByChat.delete(entry.chatId);
    return prev;
  }

  function isChatPageDividerHost(host = null) {
    if (!host) return false;
    try {
      if (host.matches?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider')) return true;
      if (host.getAttribute?.('data-cgxui-chat-page-divider') === '1') return true;
      if (host.querySelector?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider')) return true;
      if (host.querySelector?.('[data-cgxui-chat-page-divider="1"]')) return true;
    } catch {}
    return false;
  }

  function getPageBodyHosts(hosts = []) {
    return Array.from(new Set((Array.isArray(hosts) ? hosts : []).filter((host) => host && !isChatPageDividerHost(host))));
  }

  function detachPageHostsFromChat(pageNum = 0, chatId = '', hosts = []) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (!num || !id) return { ok: false, status: 'page-or-chat-missing', items: [] };
    const existing = getDetachedPageRecord(num, id);
    if (existing?.items?.length) return { ok: true, status: 'already-detached', items: existing.items.slice() };

    const uniqueHosts = getPageBodyHosts(hosts);
    const items = [];
    for (const host of uniqueHosts) {
      const parent = host?.parentNode || null;
      if (!host || !parent) continue;
      const placeholder = document.createComment(`cgxui-chat-page-detached:${id}:${num}`);
      try { parent.insertBefore(placeholder, host); } catch { continue; }
      try { parent.removeChild(host); } catch {
        try { placeholder.remove(); } catch {}
        continue;
      }
      items.push({ host, placeholder });
    }

    const entry = _detachedPageStoreGet(id);
    entry.map.set(num, { pageNum: num, chatId: id, items });
    return { ok: true, status: items.length ? 'detached' : 'empty', items: items.slice() };
  }

  function restoreDetachedPageHosts(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    const record = clearDetachedPageRecord(num, id);
    if (!record?.items?.length) return { ok: true, status: 'nothing-detached', items: [] };

    for (const item of record.items) {
      const host = item?.host || null;
      const placeholder = item?.placeholder || null;
      const parent = placeholder?.parentNode || null;
      if (host && parent) {
        try { parent.insertBefore(host, placeholder); } catch {}
      }
      try { placeholder?.remove?.(); } catch {}
    }
    return { ok: true, status: 'restored', items: record.items.slice() };
  }

  function findRowByAnswerId(answerId = '') {
    try {
      const row = MM_CORE_PAGES()?.findRowByAnswerId?.(answerId) || null;
      return normalizeFullTurnRows(row ? [row] : [])[0] || row || null;
    } catch { return null; }
  }

  function readCollapsedPages(chatId = '') {
    return localReadCollapsedPagesSet(chatId);
  }

  function writeCollapsedPages(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', pages: [] };
    const next = Array.from(localWriteCollapsedPagesSet(id, pages));
    return { ok: true, status: 'ok', chatId: id, pages: next };
  }

  function isPageCollapsed(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return !!num && localReadCollapsedPagesSet(chatId).has(num);
  }

  function readTitleListPages(chatId = '') {
    return localReadTitleListPagesSet(chatId);
  }

  function writeTitleListPages(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', pages: [] };
    const next = Array.from(localWriteTitleListPagesSet(id, pages));
    return { ok: true, status: 'ok', chatId: id, pages: next };
  }

  function isTitleListActive(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return !!num && localReadTitleListPagesSet(chatId).has(num);
  }

  function _clearRestoreProps(el) {
    if (!el?.style) return;
    for (const p of RESTORE_PROPS) {
      try { el.style.removeProperty(p); } catch {}
    }
  }

  function isTitleBarCollapsed(bar = null) {
    return String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
  }

  function isAnswerTitleCollapsed(answerMsgEl = null, bar = null, answerId = '') {
    const id = String(answerId || answerMsgEl?.getAttribute?.('data-message-id') || answerMsgEl?.dataset?.messageId || '').trim();
    const at = AT_PUBLIC();
    try {
      if (id && at?.isCollapsed && at.isCollapsed(id)) return true;
    } catch {}
    try {
      const um = UM_PUBLIC();
      if (id && typeof um?.getManualCollapsedIds === 'function') {
        const directIds = um.getManualCollapsedIds({ source: 'answer-title' }) || [];
        const batchIds = um.getManualCollapsedIds({ source: 'title-list-row' }) || [];
        if ((Array.isArray(directIds) && directIds.includes(id)) || (Array.isArray(batchIds) && batchIds.includes(id))) {
          return true;
        }
      }
    } catch {}
    return String(answerMsgEl?.getAttribute?.(ANSWER_TITLE_COLLAPSED_ATTR) || '').trim() === '1'
      || String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
  }

  function getNoAnswerManagedEls(host = null, bar = null, questionHost = null) {
    if (!host?.children) return [];
    const titleBar = bar || host?.querySelector?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"][data-at-no-answer="1"]') || null;
    if (!titleBar) return Array.from(host.children);
    const ancestorPath = new Set();
    let cur = titleBar;
    while (cur && cur !== host) {
      ancestorPath.add(cur);
      cur = cur.parentElement;
    }
    const result = [];
    const seen = new Set(ancestorPath);
    for (const anc of ancestorPath) {
      const parent = anc.parentElement;
      if (!parent) continue;
      for (const sibling of parent.children) {
        if (seen.has(sibling)) continue;
        seen.add(sibling);
        result.push(sibling);
      }
    }

    const addOuterManaged = (root) => {
      const parent = root?.parentElement;
      if (!parent) return;
      for (const sibling of Array.from(parent.children || [])) {
        if (!sibling || sibling === root || sibling === host || sibling === questionHost) continue;
        if (isChatPageDividerHost(sibling)) continue;
        if (seen.has(sibling)) continue;
        seen.add(sibling);
        result.push(sibling);
      }
    };

    addOuterManaged(host);
    if (questionHost && questionHost !== host) {
      if (!seen.has(questionHost)) {
        seen.add(questionHost);
        result.push(questionHost);
      }
      addOuterManaged(questionHost);
    }
    return result;
  }

  function applyNoAnswerTitleCollapsedDom(host = null, collapsed = false, opts = {}) {
    const bar = opts?.bar || host?.querySelector?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"][data-at-no-answer="1"]') || null;
    const questionHost = opts?.questionHost || null;
    if (!host || !bar) return { ok: false, status: 'missing-no-answer-title' };
    const animate = opts.animate !== false;
    const iconEl = bar.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
    const managedEls = getNoAnswerManagedEls(host, bar, questionHost);
    const setNoAnswerHiddenAttr = (target, enabled) => {
      if (!target) return;
      if (enabled) target.setAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN, '1');
      else target.removeAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN);
    };
    if (collapsed) {
      bar.setAttribute('data-cgxui-state', 'collapsed editable');
      setNoAnswerHiddenAttr(host, true);
      setNoAnswerHiddenAttr(questionHost, true);
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
      setNoAnswerHiddenAttr(host, false);
      setNoAnswerHiddenAttr(questionHost, false);
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
        if (animate) setTimeout(() => { try { el.style.transition = ''; } catch {} }, 270);
      });
    }
    return { ok: true, status: 'ok', host, bar, questionHost, collapsed: !!collapsed };
  }

  function restoreNoAnswerMemberContent(member = null, bar = null) {
    if (!member || member.type === 'answer') return false;
    const qSection = titleListMemberSections(member).questionSection;
    const qAnchor = qSection ? getTurnAnchorNode(qSection) : null;
    if (!qSection || !qAnchor) return false;
    const nodes = new Set([qAnchor, qSection]);
    try {
      for (const node of qAnchor.querySelectorAll(
        '[data-cgxui-at-hidden], [data-at-question-hidden], [data-cgxui-chat-page-question-hidden], [data-cgxui-chat-page-no-answer-question-hidden]'
      )) nodes.add(node);
    } catch {}
    for (const node of nodes) {
      const hadManagedResidue = node.hasAttribute?.('data-cgxui-at-hidden')
        || node.hasAttribute?.('data-at-question-hidden');
      const hadQuestionDisplayHide = node.hasAttribute?.(ATTR_CHAT_PAGE_QUESTION_HIDDEN);
      try { node.removeAttribute('data-cgxui-at-hidden'); } catch {}
      try { node.removeAttribute('data-at-question-hidden'); } catch {}
      try { node.removeAttribute(ATTR_CHAT_PAGE_QUESTION_HIDDEN); } catch {}
      try { node.removeAttribute(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN); } catch {}
      // Keep ATTR_TITLE_LIST_FLOW_HIDDEN intact. It is the outer ownership
      // guard until adoption has placed this wrapper inside the inline slot.
      if (hadManagedResidue) _clearRestoreProps(node);
      else if (hadQuestionDisplayHide) { try { node.style.removeProperty('display'); } catch {} }
    }
    try { bar?.setAttribute?.('data-cgxui-state', 'editable'); } catch {}
    const icon = bar?.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
    if (icon) icon.textContent = '⌄';
    return true;
  }

  function isChatPageRowCollapsed(row = null) {
    if (!row) return false;
    if (row.noAnswer) {
      const hostHidden = String(row.answerHost?.getAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN) || '').trim() === '1';
      const questionHidden = String(row.questionHost?.getAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN) || '').trim() === '1';
      return isTitleBarCollapsed(row.titleBar) || hostHidden || questionHidden;
    }
    return isAnswerTitleCollapsed(row.answerMsgEl, row.titleBar, row.answerId);
  }

  function _compactZeroEl(el) {
    if (!el?.style) return;
    for (const p of COMPACT_ZERO_PROPS) {
      try { el.style.setProperty(p, '0px', 'important'); } catch {}
    }
    try { el.setAttribute('data-cgxui-chat-page-title-wrapper', '1'); } catch {}
  }

  function _compactRestoreEl(el) {
    if (!el?.style) return;
    for (const p of COMPACT_ZERO_PROPS) {
      try { el.style.removeProperty(p); } catch {}
    }
    try { el.removeAttribute('data-cgxui-chat-page-title-wrapper'); } catch {}
  }

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

  function setChatPageTurnHostDomState(host, pageNum = 0, collapsed = false) {
    if (!host) return null;
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (num) host.setAttribute(ATTR_CHAT_PAGE_NUM, String(num));
    else host.removeAttribute(ATTR_CHAT_PAGE_NUM);
    if (collapsed) {
      host.setAttribute(ATTR_CHAT_PAGE_HIDDEN, '1');
      try { host.style.setProperty('display', 'none', 'important'); } catch {}
    } else {
      host.removeAttribute(ATTR_CHAT_PAGE_HIDDEN);
      try { host.style.removeProperty('display'); } catch {}
    }
    // ChatGPT sizes every turn through an only-child wrapper div
    // (height: var(--last-known-height, 50vh)); the section itself measures
    // 0px when its content is virtualized. Hiding only the section therefore
    // changes nothing in layout — the collapsed page keeps its full reserved
    // space and the next page never moves up. Page collapse must hide the
    // wrapper (the layout node) as well, and expand must restore it.
    const layoutNode = getTurnAnchorNode(host);
    if (layoutNode && layoutNode !== host) {
      if (collapsed) {
        layoutNode.setAttribute(ATTR_CHAT_PAGE_WRAPPER_HIDDEN, '1');
        try { layoutNode.style.setProperty('display', 'none', 'important'); } catch {}
      } else {
        layoutNode.removeAttribute(ATTR_CHAT_PAGE_WRAPPER_HIDDEN);
        try { layoutNode.style.removeProperty('display'); } catch {}
      }
    }
    return host;
  }

  // Restore every host stamped hidden for one page. The stamps
  // (page-num + page-hidden attrs) are written by collapse itself, so this
  // sweep covers unhydrated sections and both halves of every Q+A pair even
  // when the rebuilt section host list is incomplete. It only touches
  // page-collapse attributes — title-bar, title-list, MiniMap-local, and
  // unmount hide sources use different markers and are never cleared here.
  function sweepPageHiddenDomState(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!num) return 0;
    let cleared = 0;
    try {
      const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(String(num)) : String(num);
      for (const host of Array.from(document.querySelectorAll(`[${ATTR_CHAT_PAGE_NUM}="${esc}"][${ATTR_CHAT_PAGE_HIDDEN}="1"]`))) {
        setChatPageTurnHostDomState(host, num, false);
        cleared += 1;
      }
    } catch {}
    return cleared;
  }

  // Clear page-hidden state for every page that is not currently recorded as
  // collapsed — the recovery net for stale stamps after resets, refreshes,
  // or interrupted toggles.
  function sweepStalePageHiddenDomState(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const collapsedSet = localReadCollapsedPagesSet(id);
    let cleared = 0;
    try {
      for (const host of Array.from(document.querySelectorAll(`[${ATTR_CHAT_PAGE_HIDDEN}="1"]`))) {
        const num = Math.max(0, Number(host.getAttribute(ATTR_CHAT_PAGE_NUM) || 0) || 0);
        if (num && collapsedSet.has(num)) continue;
        setChatPageTurnHostDomState(host, num || 1, false);
        cleared += 1;
      }
    } catch {}
    return cleared;
  }

  function sweepQuestionHostRestore() {
    try {
      for (const qHost of Array.from(document.querySelectorAll('[data-cgxui-chat-page-question-hidden="1"]'))) {
        qHost.removeAttribute(ATTR_CHAT_PAGE_QUESTION_HIDDEN);
        _clearRestoreProps(qHost);
      }
    } catch {}
    try {
      for (const qHost of Array.from(document.querySelectorAll('[data-at-question-hidden="1"]'))) {
        qHost.removeAttribute('data-at-question-hidden');
        _clearRestoreProps(qHost);
      }
    } catch {}
    try {
      // Stale wrapper hides (layout nodes of collapsed pages) must also be
      // released or restored pages would stay zero-height.
      for (const wrapper of Array.from(document.querySelectorAll(`[${ATTR_CHAT_PAGE_WRAPPER_HIDDEN}="1"]`))) {
        const inner = wrapper.querySelector?.(`[${ATTR_CHAT_PAGE_HIDDEN}="1"]`);
        if (inner) continue; // page still legitimately collapsed
        wrapper.removeAttribute(ATTR_CHAT_PAGE_WRAPPER_HIDDEN);
        try { wrapper.style.removeProperty('display'); } catch {}
      }
    } catch {}
  }

  function getTitleState(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (isTitleListActive(num, id)) return 'collapsed';
    const summary = getPageCollapsedRowSummary(num, id);
    if (!summary.totalRows) return 'expanded';
    if (summary.collapsedRows <= 0) return 'expanded';
    if (summary.collapsedRows >= summary.totalRows) return 'collapsed';
    return 'mixed';
  }

  function getState(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    return {
      booted: !!S.booted,
      bound: !!S.bound,
      listenersBound: !!S.listenersBound,
      chatId: id,
      collapsedPages: Array.from(readCollapsedPages(id) || []).sort((a, b) => a - b),
      titleListPages: Array.from(readTitleListPages(id) || []).sort((a, b) => a - b),
    };
  }

  function getConfiguredDividerRoutes() {
    const cfg = CM_ROUTER_API()?.getConfig?.() || null;
    const gestureBackend = String(cfg?.gestureBackend || 'legacy').trim().toLowerCase();
    const answerTitleMode = String(cfg?.answerTitleDblClickMode || '').trim().toLowerCase();
    const dividerDotMode = String(cfg?.dividerDotClickMode || '').trim().toLowerCase();
    const dividerDblClickMode = String(cfg?.dividerDblClickMode || '').trim().toLowerCase();

    const titleBarRoute = gestureBackend === 'engine' && answerTitleMode === 'unmount-engine'
      ? 'engine/unmount'
      : (gestureBackend === 'off' ? 'off' : 'legacy');
    const dividerDotRoute = gestureBackend === 'engine' && dividerDotMode === 'unmount-engine'
      ? 'engine/unmount'
      : (gestureBackend === 'off' ? 'off' : 'legacy');
    let dividerDblClickRoute = gestureBackend === 'off' ? 'off' : 'legacy';
    if (gestureBackend === 'engine') {
      dividerDblClickRoute = dividerDblClickMode === 'unmount-page-collapse'
        ? 'engine/page-collapse'
        : 'engine/pagination';
    }

    return {
      titleBarRoute,
      dividerDotRoute,
      dividerDblClickRoute,
      hoverInfoBoxEnabled: String(cfg?.chatPageDividerHoverInfoBox || 'on').trim().toLowerCase() !== 'off',
    };
  }

  function getPageDividerDebugState(pageNum = 0, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const rows = getRows(num, id);
    const pageCollapsed = isPageCollapsed(num, id);
    const pageCollapseDriver = getPageCollapseDriver(num, id);
    const pageCollapseMode = getPageCollapseMode(num, id);
    const titleState = getTitleState(num, id);
    const summary = getPageCollapsedRowSummary(num, id);
    const collapsedRows = summary.collapsedRows;
    const detachedHosts = getDetachedPageRecord(num, id)?.items?.length || 0;
    const routes = getConfiguredDividerRoutes();
    let hiddenQuestionHosts = 0;
    for (const row of rows) {
      const host = row?.questionHost || null;
      if (!host) continue;
      if (String(host.getAttribute?.(ATTR_CHAT_PAGE_QUESTION_HIDDEN) || '').trim() === '1') {
        hiddenQuestionHosts += 1;
        continue;
      }
      try {
        if (String(host.style?.getPropertyValue?.('display') || '').trim().toLowerCase() === 'none') {
          hiddenQuestionHosts += 1;
        }
      } catch {}
    }
    return {
      ok: true,
      status: 'ok',
      pageNum: num,
      chatId: id,
      titleBarRoute: routes.titleBarRoute,
      dividerDotRoute: routes.dividerDotRoute,
      dividerDblClickRoute: routes.dividerDblClickRoute,
      hoverInfoBoxEnabled: routes.hoverInfoBoxEnabled,
      mode: getDividerUiMode(num, id),
      titleListActive: isTitleListActive(num, id),
      pageWrappedByPagination: isPageWrappedByPagination(num, id),
      pageCollapsed: !!pageCollapsed,
      pageCollapseDriver,
      pageCollapseMode,
      titleState,
      collapsedRows,
      totalRows: rows.length,
      detachedHosts,
      hiddenQuestionHosts,
    };
  }

  function clearTitleListModeState(pageNum = 0, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (!id || !num) return false;
    const next = localReadTitleListPagesSet(id);
    const had = next.delete(num);
    if (had) localWriteTitleListPagesSet(id, Array.from(next));
    return had;
  }

  // ── Synthetic page title-list (stable, hydration-independent) ─────────────
  // Product contract: the circle lists EVERY canonical member of PAGE N in
  // canonical order, together under the page divider, stable across scroll.
  // In-flow bars cannot satisfy this — unhydrated members have no bars and
  // their wrappers hold full reserved heights between the bars that do exist.
  // So while title-list mode is active for a page we render ONE H2O-owned
  // container after the divider (rows keyed by answerId, text from the
  // persisted title cache with a deterministic fallback) and hide the page's
  // in-flow pair wrappers under a NAMESPACED stamp so page-collapse state can
  // never clobber our restore (and vice versa). No ChatGPT-owned node is
  // mutated beyond the same display-hide technique page collapse already uses.
  const ATTR_TITLE_LIST_FLOW_HIDDEN = 'data-cgxui-chat-page-title-list-hidden';
  const ATTR_TITLE_LIST_NUM = 'data-h2o-title-list-num';
  const TITLE_LIST_SYNTH_SEL = '[data-cgxui="chat-page-title-list-synth"]';
  const ATTR_TITLE_STACK_INLINE = 'data-h2o-title-stack-inline';
  const ATTR_TITLE_INLINE_SLOT = 'data-h2o-title-inline-slot';
  const ATTR_TITLE_INLINE_FOR = 'data-h2o-title-inline-for';

  function TURN_RUNTIME() {
    try { return TOPW.H2O?.turnRuntime || W.H2O?.turnRuntime || null; } catch { return null; }
  }

  function turnRecordForTitleListIdentity(anyId = '', turnNo = 0) {
    const raw = String(anyId || '').trim();
    const rt = TURN_RUNTIME();
    try {
      return (raw && (
        rt?.getTurnRecordByAId?.(raw)
        || rt?.getTurnRecordByQId?.(raw)
        || rt?.getTurnRecordByTurnId?.(raw)
      )) || (turnNo ? rt?.getTurnRecordByTurnNo?.(turnNo) : null) || null;
    } catch { return null; }
  }

  function sectionByAnswerIdForTitleList(anyId = '', role = '', recordHint = null) {
    const raw = String(anyId || '').trim();
    const wantedRole = String(role || '').trim().toLowerCase();
    const record = recordHint || turnRecordForTitleListIdentity(raw);
    const ids = new Set([
      raw,
      record?.qId,
      record?.primaryAId,
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ...(Array.isArray(record?._aliasIds) ? record._aliasIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const liveCandidate = wantedRole === 'user'
      ? record?.live?.qEl
      : wantedRole === 'assistant'
        ? record?.live?.primaryAEl
        : (record?.live?.primaryAEl || record?.live?.qEl);
    const liveSection = getTurnSectionForNode(liveCandidate);
    if (liveSection && (!wantedRole || getTurnHostRole(liveSection) === wantedRole)) return liveSection;
    for (const id of ids) {
      try {
        const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(id) : id.replace(/"/g, '\\"');
        const roleSel = wantedRole ? `[data-turn="${wantedRole}"]` : '';
        const section = document.querySelector(`section[data-testid^="conversation-turn"]${roleSel}[data-turn-id="${esc}"]`) || null;
        if (section) return section;
      } catch {}
    }
    return null;
  }

  function turnNumberOfSection(section = null) {
    return Math.max(0, Number(String(section?.getAttribute?.('data-testid') || '')
      .match(/conversation-turn-(\d+)/)?.[1] || 0) || 0);
  }

  function titleListMemberSections(member = null) {
    if (!member) return { record: null, questionSection: null, answerSection: null };
    const identity = member.answerId || member.questionId || member.id || '';
    const record = turnRecordForTitleListIdentity(identity, member.turnNo);
    let answerSection = member.type === 'answer'
      ? sectionByAnswerIdForTitleList(member.answerId, 'assistant', record)
      : null;
    let questionSection = sectionByAnswerIdForTitleList(member.questionId || record?.qId || identity, 'user', record);
    // Persistent USER shells survive hydration and retain canonical prompt
    // order. Use that order only to locate the already-canonical turn record;
    // never infer page membership or an assistant shell from raw testid math,
    // which shifts after a genuine NO ANSWER turn.
    const turnNo = Math.max(0, Number(member.turnNo || record?.turnNo || 0) || 0);
    if (!questionSection && turnNo > 0) {
      try {
        const questionSections = Array.from(document.querySelectorAll('section[data-testid^="conversation-turn"][data-turn="user"]'))
          .sort((a, b) => turnNumberOfSection(a) - turnNumberOfSection(b));
        questionSection = questionSections[turnNo - 1] || null;
      } catch {}
    }
    // Adjacency is a placement fallback only. Canonical membership and the
    // page/turn number still come from turnRuntime; visible order never
    // decides which page owns the pair.
    if (!questionSection && answerSection) {
      const previous = getPreviousTurnHost(answerSection);
      if (getTurnHostRole(previous) === 'user') questionSection = previous;
    }
    if (!answerSection && member.type === 'answer' && questionSection) {
      const next = getNextTurnHost(questionSection);
      if (getTurnHostRole(next) === 'assistant') answerSection = next;
    }
    return { record, questionSection, answerSection };
  }

  // Canonical PAGE TITLE members: every Q+A pair of the page, INCLUDING
  // unanswered pairs. Primary source is the Core turnRuntime record list —
  // the gap-aware pair map built from the persistent turn sections (pair 19
  // with no assistant still has a record with its true turnNo and qId).
  // Fallback is the MiniMap turn list (answers only) using each entry's own
  // turnNo/index field — NEVER the array offset, which drifts by one for
  // every unanswered pair before it.
  function pureCanonicalPageMemberDetails(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const out = [];
    const seen = new Set();
    try {
      const records = TURN_RUNTIME()?.listTurnRecords?.() || [];
      for (const rec of Array.isArray(records) ? records : []) {
        const turnNo = Math.max(0, Number(rec?.turnNo || rec?.idx || 0) || 0);
        if (!turnNo || Math.ceil(turnNo / 25) !== num) continue;
        // H2O Core's canonical schema owns answers as primaryAId + answerIds;
        // answerId/aId are compatibility projections and can be absent during
        // reconciliation. Missing the canonical fields misclassified a real
        // Q+A record as NO ANSWER and left its flow content outside the stack.
        const answerId = String(
          rec?.primaryAId
          || rec?.answerId
          || rec?.aId
          || (Array.isArray(rec?.answerIds) ? rec.answerIds[0] : '')
          || ''
        ).trim();
        const questionId = String(rec?.qId || rec?.questionId || '').trim();
        const turnId = String(rec?.turnId || rec?.id || '').trim();
        const aliasIds = Array.from(new Set([
          answerId,
          ...(Array.isArray(rec?.answerIds) ? rec.answerIds : []),
          ...(Array.isArray(rec?._aliasIds) ? rec._aliasIds : []),
        ].map((value) => String(value || '').trim()).filter(Boolean)));
        const id = answerId || questionId || `turn-${turnNo}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, answerId, questionId, turnId, aliasIds, turnNo, type: answerId ? 'answer' : 'no-answer' });
      }
    } catch {}
    if (!out.length) {
      try {
        const list = MM_CORE_API()?.getTurnList?.() || [];
        for (let i = 0; i < (Array.isArray(list) ? list.length : 0); i += 1) {
          const turnNo = Math.max(0, Number(list[i]?.turnNo || list[i]?.index || 0) || 0) || (i + 1);
          if (Math.ceil(turnNo / 25) !== num) continue;
          const answerId = String(list[i]?.answerId || list[i]?.primaryAId || '').trim();
          if (!answerId || seen.has(answerId)) continue;
          seen.add(answerId);
          out.push({
            id: answerId,
            answerId,
            questionId: String(list[i]?.questionId || list[i]?.qId || '').trim(),
            turnId: String(list[i]?.turnId || '').trim(),
            aliasIds: [answerId],
            turnNo,
            type: 'answer',
          });
        }
      } catch {}
    }
    out.sort((a, b) => a.turnNo - b.turnNo);
    return out;
  }

  function isSyntheticTitlePlaceholder(value = '') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text) return true;
    if (/^(?:…|\.{2,}|untitled answer|answer(?:\s+\d+)?|\d+)$/i.test(text)) return true;
    return false;
  }

  function titleListAnswerFamilyIds(member = null) {
    if (!member || member.type !== 'answer') return [];
    const ids = new Set([
      member.answerId,
      member.id,
      ...(Array.isArray(member.aliasIds) ? member.aliasIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const rec = turnRecordForTitleListIdentity(member.answerId || member.id, member.turnNo);
    for (const value of [rec?.primaryAId, rec?.answerId, ...(Array.isArray(rec?.answerIds) ? rec.answerIds : []), ...(Array.isArray(rec?._aliasIds) ? rec._aliasIds : [])]) {
      const id = String(value || '').trim();
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }

  // Ranked title sources — a known real title must never regress to a lower
  // rank: hydrated bar text (3) > persisted title cache (2) > canonical
  // record metadata (1) > fallback (0). No-answer rows carry no title text;
  // their identity IS the NO ANSWER badge.
  function resolveSyntheticRowTitle(member = null) {
    if (!member) return { text: '', source: 'fallback', rank: 0 };
    if (member.type !== 'answer') return { text: '', source: 'no-answer', rank: 3 };
    const at = AT_PUBLIC();
    const familyIds = titleListAnswerFamilyIds(member);
    for (const answerId of familyIds) {
      try {
        const bar = at?.getBar?.(answerId) || null;
        const liveText = String(bar?.querySelector?.('[data-cgxui="atns-answer-title-text"]')?.textContent || '').trim();
        if (!isSyntheticTitlePlaceholder(liveText)) return { text: liveText, source: 'hydrated', rank: 3, answerId };
      } catch {}
    }
    for (const answerId of familyIds) {
      try {
        const cached = String(at?.getTitle?.(answerId) || '').trim();
        if (!isSyntheticTitlePlaceholder(cached)) return { text: cached, source: 'cached', rank: 2, answerId };
      } catch {}
    }
    try {
      const rec = turnRecordForTitleListIdentity(member.answerId || member.id, member.turnNo);
      const metaTitle = String(rec?.title || rec?.answerTitle || '').trim();
      if (!isSyntheticTitlePlaceholder(metaTitle)) return { text: metaTitle, source: 'metadata', rank: 1 };
    } catch {}
    return { text: 'Untitled Answer', source: 'fallback', rank: 0 };
  }

  function setTitleListMemberFlowHidden(member = null, pageNum = 0, hidden = false) {
    if (!member) return false;
    // Hide/release every shell for this canonical turn, not only the first
    // section lookup. ChatGPT can briefly retain an older shell while a new
    // hydrated shell is mounted; either one becoming visible is a flow leak.
    const targets = memberAllFlowAnchors(member);
    if (!targets.length) return false;
    let changed = false;
    for (const node of targets) {
      if (setTitleListFlowAnchorHidden(node, pageNum, hidden)) changed = true;
    }
    return changed;
  }

  // Restore is stamp-driven (like sweepPageHiddenDomState): membership may
  // have changed since collapse, so we release whatever collapse stamped.
  function sweepSyntheticTitleListHidden(pageNum = 0) {
    const num = Math.max(0, Number(pageNum || 0) || 0);
    const sel = num
      ? `[${ATTR_TITLE_LIST_FLOW_HIDDEN}="${String(num)}"]`
      : `[${ATTR_TITLE_LIST_FLOW_HIDDEN}]`;
    let released = 0;
    try {
      for (const node of Array.from(document.querySelectorAll(sel))) {
        try { node.removeAttribute(ATTR_TITLE_LIST_FLOW_HIDDEN); } catch {}
        try { node.style.removeProperty('display'); } catch {}
        try { node.style.removeProperty('--h2o-title-inline-display'); } catch {}
        released += 1;
      }
    } catch {}
    return released;
  }

  function titleListStackRegistryKey(pageNum = 0, chatId = '') {
    return `${String(chatId || resolveChatId()).trim()}::${Math.max(1, Number(pageNum || 0) || 1)}`;
  }

  function titleListStackDomId(pageNum = 0) {
    return `cgxui-chat-page-title-list-p${Math.max(1, Number(pageNum || 0) || 1)}`;
  }

  function getSyntheticTitleListContainers(pageNum = 0) {
    try {
      return Array.from(document.querySelectorAll(`${TITLE_LIST_SYNTH_SEL}[data-page-num="${String(pageNum)}"]`));
    } catch { return []; }
  }

  function getTitleListStackStats(pageNum = 0, chatId = '') {
    const key = titleListStackRegistryKey(pageNum, chatId);
    let stats = S.titleListStackStatsByKey.get(key) || null;
    if (!stats) {
      stats = {
        buildCount: 0,
        replaceCount: 0,
        reattachCount: 0,
        rowReplaceCount: 0,
        identityRekeyCount: 0,
        titleUpgradeCount: 0,
        titleDowngradePreventedCount: 0,
        mutationCount: 0,
        syncCount: 0,
        lastBuildReason: '',
        lastReplaceReason: '',
        lastReattachReason: '',
        lastSyncReason: '',
        lastStackMutationReason: '',
        firstListCreatedAt: 0,
        lastStackMutationAt: 0,
        lastListSettledAt: 0,
        stackRectBeforeOpen: null,
        stackRectAfterOpen: null,
        lastOpenedTurnNo: 0,
        activeStackId: '',
      };
      S.titleListStackStatsByKey.set(key, stats);
    }
    return stats;
  }

  function markTitleListStackMutation(stats = null, reason = '') {
    if (!stats) return;
    stats.mutationCount = Number(stats.mutationCount || 0) + 1;
    stats.lastStackMutationReason = String(reason || 'stack-mutation');
    stats.lastStackMutationAt = Date.now();
  }

  function scoreTitleListContainer(container = null) {
    if (!container) return -1;
    let rows = 0;
    let washed = 0;
    let opened = 0;
    try {
      for (const child of Array.from(container.children || [])) {
        if (!child.matches?.('[data-h2o-stack-key]')) continue;
        rows += 1;
        if (child.hasAttribute('data-h2o-title-wash')) washed += 1;
        if (child.getAttribute('data-h2o-title-row-opened') === '1') opened += 1;
      }
    } catch {}
    return (rows * 100) + (washed * 10) + (opened * 5);
  }

  function getSyntheticTitleListContainer(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 1);
    const key = titleListStackRegistryKey(num, chatId);
    const registered = S.titleListStacksByKey.get(key) || null;
    if (registered?.isConnected && registered.matches?.(`${TITLE_LIST_SYNTH_SEL}[data-page-num="${String(num)}"]`)) {
      return registered;
    }
    const containers = getSyntheticTitleListContainers(num);
    return containers.sort((a, b) => scoreTitleListContainer(b) - scoreTitleListContainer(a))[0] || null;
  }

  function claimSingleTitleListContainer(pageNum = 0, chatId = '', divider = null, reason = 'stack-sync') {
    const num = Math.max(1, Number(pageNum || 0) || 1);
    const id = String(chatId || resolveChatId()).trim();
    const key = titleListStackRegistryKey(num, id);
    const stats = getTitleListStackStats(num, id);
    stats.syncCount += 1;
    stats.lastSyncReason = String(reason || 'stack-sync');
    const expectedId = titleListStackDomId(num);
    const containers = getSyntheticTitleListContainers(num);
    const registered = S.titleListStacksByKey.get(key) || null;
    const registeredMatches = !!registered?.matches?.(`${TITLE_LIST_SYNTH_SEL}[data-page-num="${String(num)}"]`);
    let container = registeredMatches
      ? registered
      : (containers.find((entry) => entry.id === expectedId)
        || containers.sort((a, b) => scoreTitleListContainer(b) - scoreTitleListContainer(a))[0]
        || null);

    if (registeredMatches && !registered.isConnected) {
      stats.reattachCount += 1;
      stats.lastReattachReason = String(reason || 'stack-sync');
      markTitleListStackMutation(stats, `reattach:${String(reason || 'stack-sync')}`);
    }

    if (!container) {
      container = document.createElement('div');
      container.className = 'cgxui-chat-page-title-list-synth';
      container.setAttribute('data-cgxui', 'chat-page-title-list-synth');
      container.setAttribute('data-cgxui-owner', 'chtpgs');
      container.setAttribute('data-page-num', String(num));
      stats.buildCount += 1;
      stats.lastBuildReason = String(reason || 'stack-sync');
      if (!stats.firstListCreatedAt) stats.firstListCreatedAt = Date.now();
      markTitleListStackMutation(stats, `build:${String(reason || 'stack-sync')}`);
    }

    // A surviving stack can outlive a hot module refresh. Replace its prior
    // capture listener explicitly so one double-click always has one stack
    // executor, never the old and new module handlers together.
    const priorDblClick = container._h2oTitleListDblClickHandler || null;
    if (priorDblClick !== onSyntheticTitleRowDblClick) {
      if (typeof priorDblClick === 'function') {
        try { container.removeEventListener('dblclick', priorDblClick, true); } catch {}
      }
      try { container.addEventListener('dblclick', onSyntheticTitleRowDblClick, true); } catch {}
      try { container._h2oTitleListDblClickHandler = onSyntheticTitleRowDblClick; } catch {}
    }

    if (container.id !== expectedId) container.id = expectedId;
    if (container.getAttribute('data-h2o-title-stack-owner') !== '1C1b:syncSyntheticTitleList') {
      container.setAttribute('data-h2o-title-stack-owner', '1C1b:syncSyntheticTitleList');
    }
    if (container.getAttribute('data-h2o-title-stack-id') !== expectedId) {
      container.setAttribute('data-h2o-title-stack-id', expectedId);
    }
    if (!container.hasAttribute('data-h2o-title-stack-seq')) {
      container.setAttribute('data-h2o-title-stack-seq', String(++S.titleListStackSequence));
    }
    S.titleListStacksByKey.set(key, container);
    stats.activeStackId = expectedId;

    // Older/hot-reloaded builds may have left more than one container for the
    // same page. Keep the strongest existing stack, restore any inline turn
    // content from the duplicate, merge only missing rows, then remove it.
    for (const duplicate of getSyntheticTitleListContainers(num)) {
      if (duplicate === container) continue;
      restoreAllInlineTurns(duplicate);
      for (const row of Array.from(duplicate.children || [])) {
        if (!row.matches?.('[data-h2o-stack-key]')) continue;
        const rowKey = String(row.getAttribute('data-h2o-stack-key') || '');
        let existing = null;
        try {
          const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(rowKey) : rowKey.replace(/"/g, '\\"');
          existing = container.querySelector(`:scope > [data-h2o-stack-key="${esc}"]`);
        } catch {}
        if (!existing) {
          try { container.appendChild(row); } catch {}
        } else {
          try { row.remove(); } catch {}
        }
      }
      try { duplicate.remove(); } catch {}
      stats.replaceCount += 1;
      stats.lastReplaceReason = `duplicate-container:${String(reason || 'stack-sync')}`;
      markTitleListStackMutation(stats, stats.lastReplaceReason);
    }

    if (divider?.parentNode && divider.nextElementSibling !== container) {
      try {
        divider.parentNode.insertBefore(container, divider.nextSibling);
        markTitleListStackMutation(stats, `anchor:${String(reason || 'stack-sync')}`);
      } catch {}
    }
    return container;
  }

  function titleBarMemberId(bar = null) {
    const stackKey = String(bar?.getAttribute?.('data-h2o-stack-key') || '').trim();
    if (stackKey) return stackKey;
    const answerId = String(bar?.getAttribute?.('data-answer-id') || '').trim();
    return answerId.startsWith('no-answer:') ? answerId.slice('no-answer:'.length) : answerId;
  }

  function stackRowMatchesMember(row = null, member = null) {
    if (!row || !member) return false;
    const rowType = String(row.getAttribute?.('data-h2o-stack-type') || (row.hasAttribute?.('data-at-no-answer') ? 'no-answer' : 'answer'));
    if (rowType !== member.type) return false;
    const rowTurnNo = Math.max(0, Number(row.getAttribute?.('data-h2o-stack-turn-no') || row.getAttribute?.('data-h2o-turn-num') || 0) || 0);
    if (rowTurnNo && member.turnNo && rowTurnNo === member.turnNo) return true;
    const rowId = titleBarMemberId(row);
    if (!rowId) return false;
    if (rowType !== 'answer') {
      return rowId === member.id || rowId === member.questionId;
    }
    const family = new Set(titleListAnswerFamilyIds(member));
    if (family.has(rowId)) return true;
    const rowRecord = turnRecordForTitleListIdentity(rowId, rowTurnNo);
    for (const value of [rowRecord?.primaryAId, rowRecord?.answerId, ...(Array.isArray(rowRecord?.answerIds) ? rowRecord.answerIds : []), ...(Array.isArray(rowRecord?._aliasIds) ? rowRecord._aliasIds : [])]) {
      if (family.has(String(value || '').trim())) return true;
    }
    return false;
  }

  function findStackRowForMember(container = null, member = null) {
    if (!container || !member) return null;
    try {
      const esc = (typeof CSS !== 'undefined' && CSS?.escape) ? CSS.escape(member.id) : member.id.replace(/"/g, '\\"');
      const exact = container.querySelector(`:scope > [data-h2o-stack-key="${esc}"]`);
      if (exact) return exact;
    } catch {}
    try {
      return Array.from(container.children || []).find((row) => (
        row.matches?.('[data-h2o-stack-key]') && stackRowMatchesMember(row, member)
      )) || null;
    } catch { return null; }
  }

  function projectSyntheticRowTitle(member = null, bar = null) {
    if (!bar || !member) return { changed: false, preventedDowngrade: false, source: '' };
    if (member.type !== 'answer') {
      const changed = bar.getAttribute('data-h2o-title-row-source') !== 'no-answer'
        || bar.getAttribute('data-h2o-title-row-source-rank') !== '3';
      if (changed) {
        bar.setAttribute('data-h2o-title-row-source', 'no-answer');
        bar.setAttribute('data-h2o-title-row-source-rank', '3');
      }
      return { changed, preventedDowngrade: false, source: 'no-answer' };
    }
    const textEl = bar.querySelector?.('[data-cgxui="atns-answer-title-text"]') || null;
    const currentText = String(textEl?.textContent || '').trim();
    const currentReal = !isSyntheticTitlePlaceholder(currentText);
    const currentRank = currentReal
      ? Math.max(1, Number(bar.getAttribute('data-h2o-title-row-source-rank') || 3) || 3)
      : 0;
    const resolved = resolveSyntheticRowTitle(member);
    const resolvedReal = !isSyntheticTitlePlaceholder(resolved.text) && resolved.source !== 'fallback';
    let changed = false;
    let preventedDowngrade = false;
    if (resolvedReal && (!currentReal || resolved.rank > currentRank)) {
      if (textEl && currentText !== resolved.text) { textEl.textContent = resolved.text; changed = true; }
      if (bar.getAttribute('data-h2o-title-row-source') !== resolved.source) {
        bar.setAttribute('data-h2o-title-row-source', resolved.source);
        changed = true;
      }
      if (bar.getAttribute('data-h2o-title-row-source-rank') !== String(resolved.rank)) {
        bar.setAttribute('data-h2o-title-row-source-rank', String(resolved.rank));
        changed = true;
      }
    } else if (currentReal) {
      preventedDowngrade = !resolvedReal || resolved.rank < currentRank;
      if (!bar.hasAttribute('data-h2o-title-row-source')) {
        bar.setAttribute('data-h2o-title-row-source', 'hydrated');
        changed = true;
      }
      if (!bar.hasAttribute('data-h2o-title-row-source-rank')) {
        bar.setAttribute('data-h2o-title-row-source-rank', String(currentRank));
        changed = true;
      }
    } else {
      const source = resolvedReal ? resolved.source : 'fallback';
      const rank = resolvedReal ? resolved.rank : 0;
      if (resolvedReal && textEl && currentText !== resolved.text) { textEl.textContent = resolved.text; changed = true; }
      if (bar.getAttribute('data-h2o-title-row-source') !== source) { bar.setAttribute('data-h2o-title-row-source', source); changed = true; }
      if (bar.getAttribute('data-h2o-title-row-source-rank') !== String(rank)) { bar.setAttribute('data-h2o-title-row-source-rank', String(rank)); changed = true; }
    }
    return {
      changed,
      preventedDowngrade,
      source: String(bar.getAttribute('data-h2o-title-row-source') || ''),
    };
  }

  function removeDuplicateFlowBarsForStackedMember(member = null, keepBar = null, titleBarPool = null) {
    if (!member?.id || !keepBar) return 0;
    let removed = 0;
    const candidates = new Set();
    try {
      const pool = Array.isArray(titleBarPool)
        ? titleBarPool
        : Array.from(document.querySelectorAll('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]'));
      for (const candidate of pool) {
        if (!candidate?.isConnected) continue;
        if (candidate !== keepBar && stackRowMatchesMember(candidate, member)) candidates.add(candidate);
      }
    } catch {}
    // A title created during a partially hydrated pass can briefly lack its
    // answer-id. Canonical Q+A wrappers are a stronger ownership boundary
    // than that incomplete projection, so remove every competing title bar
    // inside this member's own flow anchors as well.
    try {
      for (const anchor of memberFlowAnchors(member)) {
        for (const candidate of Array.from(anchor.querySelectorAll?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]') || [])) {
          if (candidate !== keepBar) candidates.add(candidate);
        }
      }
    } catch {}
    for (const candidate of candidates) {
      try { candidate.remove(); removed += 1; } catch {}
    }
    return removed;
  }

  function applyStackedTitleBarWash(member = null, bar = null) {
    if (!bar) return { ok: false, status: 'bar-missing' };
    const wash = WASH_PUBLIC();
    if (typeof wash?.applyToTitleBar !== 'function') return { ok: false, status: 'washer-api-unavailable' };
    const answerId = member?.type === 'answer' ? String(member.answerId || member.id || '').trim() : '';
    try {
      const resolved = wash?.resolveForId?.(answerId) || null;
      const existing = String(bar.getAttribute?.('data-h2o-title-wash') || '').trim();
      // Stack reconciliation is not the washer removal executor. If canonical
      // identity is temporarily incomplete, preserve the already-projected
      // color; an explicit washer change event clears it through 1A2a.
      if (!resolved?.colorName && existing) {
        return { ok: true, status: 'preserved-existing-on-identity-miss', colorName: existing };
      }
    } catch {}
    try { return wash.applyToTitleBar(answerId, bar) || { ok: true, status: 'applied' }; } catch { return { ok: false, status: 'washer-apply-failed' }; }
  }

  // ── Inline open: the opened turn renders in the title-list context ────────
  // Double-click must reveal the turn DIRECTLY UNDER its stacked bar — not at
  // the turn's natural flow position below the whole stack (that reads as a
  // detached duplicate area). Re-parenting turn wrappers is precedented: the
  // pagination windowing adapter moves the same nodes wholesale on every page
  // swap. Wrappers are stamped so every release path can restore them to the
  // flow at their canonical (testid-ordered) position.
  function memberFlowAnchors(member) {
    const out = [];
    const sections = titleListMemberSections(member);
    if (member?.type === 'answer' && member.answerId) {
      const section = sections.answerSection;
      const qHost = sections.questionSection
        || (section ? getQuestionHostForAnswerHost(section, null, { turnHostOnly: true }) : null);
      const qAnchor = qHost ? getTurnAnchorNode(qHost) : null;
      if (qAnchor) out.push(qAnchor);
      if (section) {
        const aAnchor = getTurnAnchorNode(section);
        if (aAnchor && aAnchor !== qAnchor) out.push(aAnchor);
      }
    } else if (member?.questionId) {
      const qSection = sections.questionSection;
      const qAnchor = qSection ? getTurnAnchorNode(qSection) : null;
      if (qAnchor) out.push(qAnchor);
    }
    return out;
  }

  function memberSectionCandidates(member = null, role = '') {
    if (!member) return [];
    const wantedRole = String(role || '').trim().toLowerCase();
    const record = turnRecordForTitleListIdentity(member.answerId || member.questionId || member.id, member.turnNo);
    const ids = new Set([
      member.id,
      member.questionId,
      member.answerId,
      member.turnId,
      record?.qId,
      record?.primaryAId,
      record?.turnId,
      ...(Array.isArray(member.aliasIds) ? member.aliasIds : []),
      ...(Array.isArray(record?.answerIds) ? record.answerIds : []),
      ...(Array.isArray(record?._aliasIds) ? record._aliasIds : []),
    ].map((value) => String(value || '').trim()).filter(Boolean));
    const out = new Set();
    const primary = titleListMemberSections(member);
    if (wantedRole === 'user' && primary.questionSection) out.add(primary.questionSection);
    if (wantedRole === 'assistant' && primary.answerSection) out.add(primary.answerSection);
    let sections = [];
    try {
      sections = Array.from(document.querySelectorAll(`section[data-testid^="conversation-turn"][data-turn="${wantedRole}"]`));
    } catch {}
    for (const section of sections) {
      const sectionId = String(section.getAttribute?.('data-turn-id') || '').trim();
      if (sectionId && ids.has(sectionId)) {
        out.add(section);
        continue;
      }
      const sectionRecord = turnRecordForTitleListIdentity(sectionId);
      if (sectionRecord && Number(sectionRecord.turnNo || 0) === Number(member.turnNo || 0)) out.add(section);
    }
    if (wantedRole === 'user' && member.turnNo > 0) {
      const sorted = sections.slice().sort((a, b) => turnNumberOfSection(a) - turnNumberOfSection(b));
      const fallback = sorted[member.turnNo - 1] || null;
      if (fallback) out.add(fallback);
    }
    return Array.from(out).filter((section) => section?.isConnected);
  }

  function memberAllFlowAnchors(member = null) {
    if (!member) return [];
    const out = new Set(memberFlowAnchors(member));
    for (const section of memberSectionCandidates(member, 'user')) {
      const anchor = getTurnAnchorNode(section);
      if (anchor) out.add(anchor);
    }
    if (member.type === 'answer') {
      for (const section of memberSectionCandidates(member, 'assistant')) {
        const anchor = getTurnAnchorNode(section);
        if (anchor) out.add(anchor);
      }
    }
    return Array.from(out).filter((anchor) => anchor?.isConnected);
  }

  function setTitleListFlowAnchorHidden(anchor = null, pageNum = 0, hidden = false) {
    if (!anchor?.style) return false;
    const num = Math.max(1, Number(pageNum || 0) || 0);
    if (hidden) {
      // A wrapper still inline-adopted in the stack must return to canonical
      // flow before the page-level hide projection is applied.
      if (anchor.hasAttribute?.(ATTR_TITLE_STACK_INLINE)) restoreInlineTurnToFlow(anchor);
      const alreadyStamped = String(anchor.getAttribute?.(ATTR_TITLE_LIST_FLOW_HIDDEN) || '') === String(num);
      const currentDisplay = String(getComputedStyle(anchor)?.display || '').toLowerCase();
      const alreadyHidden = currentDisplay === 'none';
      if (!alreadyHidden && currentDisplay) {
        try { anchor.style.setProperty('--h2o-title-inline-display', currentDisplay); } catch {}
      }
      try { anchor.setAttribute(ATTR_TITLE_LIST_FLOW_HIDDEN, String(num)); } catch {}
      try { anchor.style.setProperty('display', 'none', 'important'); } catch {}
      return !alreadyStamped || !alreadyHidden;
    }
    const hadStamp = anchor.hasAttribute?.(ATTR_TITLE_LIST_FLOW_HIDDEN);
    const hadInlineHide = String(anchor.style.getPropertyValue?.('display') || '').toLowerCase() === 'none';
    try { anchor.removeAttribute(ATTR_TITLE_LIST_FLOW_HIDDEN); } catch {}
    try { anchor.style.removeProperty('display'); } catch {}
    return !!(hadStamp || hadInlineHide);
  }

  function titleListRectSnapshot(el = null) {
    try {
      const rect = el?.getBoundingClientRect?.();
      if (!rect) return null;
      return {
        left: Number(rect.left.toFixed(2)),
        right: Number(rect.right.toFixed(2)),
        top: Number(rect.top.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      };
    } catch { return null; }
  }

  function getInlineSlotForRow(row = null, containerHint = null) {
    const container = containerHint || row?.closest?.(TITLE_LIST_SYNTH_SEL) || null;
    if (!container || !row) return null;
    const key = String(row.getAttribute('data-h2o-stack-key') || '').trim();
    const turnNo = String(row.getAttribute('data-h2o-stack-turn-no') || '').trim();
    return Array.from(container.children || []).find((child) => (
      child.getAttribute?.(ATTR_TITLE_INLINE_SLOT) === '1'
      && ((key && child.getAttribute?.(ATTR_TITLE_INLINE_FOR) === key)
        || (turnNo && child.getAttribute?.('data-h2o-stack-turn-no') === turnNo))
    )) || null;
  }

  function ensureInlineSlotForRow(row = null, pageNum = 0, containerHint = null) {
    const container = containerHint || row?.closest?.(TITLE_LIST_SYNTH_SEL) || null;
    if (!container || !row) return null;
    let slot = getInlineSlotForRow(row, container);
    if (!slot) {
      slot = document.createElement('div');
      slot.setAttribute(ATTR_TITLE_INLINE_SLOT, '1');
      slot.setAttribute('data-cgxui-owner', 'chtpgs');
    }
    const key = String(row.getAttribute('data-h2o-stack-key') || '').trim();
    const turnNo = String(row.getAttribute('data-h2o-stack-turn-no') || '').trim();
    slot.setAttribute(ATTR_TITLE_INLINE_FOR, key);
    slot.setAttribute('data-page-num', String(pageNum));
    if (turnNo) slot.setAttribute('data-h2o-stack-turn-no', turnNo);
    if (row.nextElementSibling !== slot) {
      try { container.insertBefore(slot, row.nextSibling); } catch { return null; }
    }
    return slot;
  }

  function rememberInlineAnchorOrigin(anchor = null) {
    if (!anchor?.parentNode || anchor.closest?.(TITLE_LIST_SYNTH_SEL)) return;
    try {
      anchor._h2oTitleListOrigin = {
        parent: anchor.parentNode,
        previousSibling: anchor.previousSibling,
        nextSibling: anchor.nextSibling,
      };
    } catch {}
  }

  function adoptOpenedTurnIntoStack(member, pageNum, bar, containerHint = null, opts = {}) {
    const container = containerHint || bar?.closest?.(TITLE_LIST_SYNTH_SEL) || getSyntheticTitleListContainer(pageNum);
    if (!container || !bar) return false;
    const stats = getTitleListStackStats(pageNum, resolveChatId());
    if (opts?.captureLayout === true) {
      stats.stackRectBeforeOpen = titleListRectSnapshot(container);
      stats.lastOpenedTurnNo = Math.max(0, Number(member?.turnNo || 0) || 0);
    }
    // An engine restore from an older/manual record may have reinserted the
    // preserved bar into answer flow. The stack owner immediately reclaims
    // the SAME node before using it as the inline-open anchor.
    if (bar.parentElement !== container) {
      const turnNo = Math.max(0, Number(member?.turnNo || 0) || 0);
      const before = Array.from(container.querySelectorAll('[data-h2o-stack-turn-no]'))
        .find((row) => Number(row.getAttribute('data-h2o-stack-turn-no') || 0) > turnNo) || null;
      try { container.insertBefore(bar, before); } catch { return false; }
    }
    const sections = titleListMemberSections(member);
    const questionContentAvailable = !!(sections.questionSection?.matches?.(USER_MSG_SEL)
      || sections.questionSection?.querySelector?.(USER_MSG_SEL));
    const answerContentAvailable = !!(sections.answerSection?.matches?.(ASSISTANT_MSG_SEL)
      || sections.answerSection?.querySelector?.(ASSISTANT_MSG_SEL));
    const completeTurnAvailable = member?.type === 'answer'
      ? !!(sections.questionSection && sections.answerSection && questionContentAvailable && answerContentAvailable)
      : !!(sections.questionSection && questionContentAvailable);
    if (!completeTurnAvailable) return false;
    const anchors = memberFlowAnchors(member);
    if (!anchors.length) return false;
    const slot = ensureInlineSlotForRow(bar, pageNum, container);
    if (!slot) return false;
    const adopted = [];
    for (const anchor of anchors) {
      if (!anchor || anchor === container || anchor.contains?.(container)) continue;
      rememberInlineAnchorOrigin(anchor);
      try { anchor.setAttribute(ATTR_TITLE_STACK_INLINE, String(pageNum)); } catch {}
      try { slot.appendChild(anchor); } catch { return false; }
      // Keep the flow-hide ownership stamp while inline. The slot's scoped
      // CSS override makes it visible here; if ChatGPT reparents this same
      // node back to normal flow, the global stamped rule hides it instantly
      // until the canonical repair re-adopts it.
      try { anchor.setAttribute(ATTR_TITLE_LIST_FLOW_HIDDEN, String(pageNum)); } catch {}
      try { anchor.style.removeProperty('display'); } catch {}
      adopted.push(anchor);
    }
    // If hydration left a duplicate shell for the same canonical turn, keep
    // only the adopted shell visible. The duplicate remains in normal flow
    // under the page-level hide stamp for later native cleanup.
    for (const candidate of memberAllFlowAnchors(member)) {
      if (!adopted.includes(candidate) && !candidate.closest?.(`[${ATTR_TITLE_INLINE_SLOT}="1"]`)) {
        setTitleListFlowAnchorHidden(candidate, pageNum, true);
      }
    }
    const ok = adopted.length > 0 && adopted.every((anchor) => (
      anchor.parentElement === slot
      && anchor.getAttribute?.(ATTR_TITLE_STACK_INLINE) === String(pageNum)
    ));
    slot.setAttribute('data-h2o-title-inline-pending', ok ? '0' : '1');
    stats.stackRectAfterOpen = titleListRectSnapshot(container);
    return ok;
  }

  function turnNumberOfWrapper(node) {
    if (!node) return 0;
    const section = node.matches?.('section[data-testid^="conversation-turn"]')
      ? node
      : node.querySelector?.('section[data-testid^="conversation-turn"]');
    return Number(String(section?.getAttribute?.('data-testid') || '').match(/conversation-turn-(\d+)/)?.[1] || 0) || 0;
  }

  function restoreInlineTurnToFlow(anchor) {
    if (!anchor) return false;
    const slot = anchor.closest?.(`[${ATTR_TITLE_INLINE_SLOT}="1"]`) || null;
    const container = anchor.closest?.(TITLE_LIST_SYNTH_SEL);
    const origin = anchor._h2oTitleListOrigin || null;
    try { anchor.removeAttribute(ATTR_TITLE_STACK_INLINE); } catch {}
    let restored = false;
    if (origin?.parent?.isConnected) {
      if (origin.nextSibling?.parentNode === origin.parent) {
        try { origin.parent.insertBefore(anchor, origin.nextSibling); restored = true; } catch {}
      } else if (origin.previousSibling?.parentNode === origin.parent) {
        try { origin.parent.insertBefore(anchor, origin.previousSibling.nextSibling); restored = true; } catch {}
      } else if (!origin.parent.childNodes?.length) {
        try { origin.parent.appendChild(anchor); restored = true; } catch {}
      }
    }
    const flowParent = origin?.parent?.isConnected ? origin.parent : (container?.parentNode || null);
    if (!restored && !flowParent) return false;
    // Canonical restore position: before the first flow wrapper whose turn
    // number is higher (testid order == canonical order; sections persist).
    if (!restored) {
      const myNum = turnNumberOfWrapper(anchor);
      let before = null;
      if (myNum) {
        for (const child of Array.from(flowParent.children)) {
          if (child === container || child === anchor) continue;
          const n = turnNumberOfWrapper(child);
          if (n > myNum) { before = child; break; }
        }
      }
      try { flowParent.insertBefore(anchor, before); restored = true; } catch {}
    }
    try { delete anchor._h2oTitleListOrigin; } catch {}
    if (slot && !slot.children.length) { try { slot.remove(); } catch {} }
    return restored;
  }

  function restoreAllInlineTurns(container) {
    if (!container?.querySelectorAll) return 0;
    let restored = 0;
    for (const anchor of Array.from(container.querySelectorAll(`[${ATTR_TITLE_STACK_INLINE}]`))) {
      if (restoreInlineTurnToFlow(anchor)) restored += 1;
    }
    for (const slot of Array.from(container.querySelectorAll(`:scope > [${ATTR_TITLE_INLINE_SLOT}="1"]`))) {
      if (!slot.children.length) { try { slot.remove(); } catch {} }
    }
    return restored;
  }

  function releaseInlineSlotForRow(row = null, containerHint = null) {
    const slot = getInlineSlotForRow(row, containerHint);
    if (!slot) return 0;
    let restored = 0;
    for (const anchor of Array.from(slot.querySelectorAll(`[${ATTR_TITLE_STACK_INLINE}]`))) {
      if (restoreInlineTurnToFlow(anchor)) restored += 1;
    }
    if (slot.isConnected && !slot.children.length) { try { slot.remove(); } catch {} }
    return restored;
  }

  function resetOpenedTitleListRows(pageNum = 0) {
    let reset = 0;
    for (const container of getSyntheticTitleListContainers(pageNum)) {
      restoreAllInlineTurns(container);
      for (const row of Array.from(container.querySelectorAll('[data-h2o-title-row-opened="1"]'))) {
        try {
          row.removeAttribute('data-h2o-title-row-opened');
          row.removeAttribute('data-h2o-title-row-opened-by');
          reset += 1;
        } catch {}
      }
    }
    return reset;
  }

  function syntheticRowMember(row) {
    const type = String(row?.getAttribute?.('data-h2o-stack-type') || 'answer');
    const id = String(row?.getAttribute?.('data-h2o-stack-key') || row?.getAttribute?.('data-answer-id') || '').trim();
    if (!id) return null;
    return {
      id,
      type,
      answerId: type === 'answer' ? id : '',
      questionId: type === 'answer' ? '' : id,
      turnNo: Math.max(0, Number(row?.getAttribute?.('data-h2o-stack-turn-no') || 0) || 0),
    };
  }

  // DOUBLE-click on a stacked title bar opens/closes ONLY that member's turn
  // — the page stays in title-list mode and every other bar stays in the
  // stack with its turn hidden. This capture handler runs before the bar's
  // own dblclick listener (which would toggle bar collapse) and suppresses
  // it, plus cancels the bar's pending single-click title-edit timer.
  function onSyntheticTitleRowDblClick(ev) {
    const row = ev?.target?.closest?.('[data-h2o-stack-key]');
    if (!row) return;
    try { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); } catch {}
    try {
      if (row._titleEditTimer) { W.clearTimeout(row._titleEditTimer); row._titleEditTimer = 0; }
    } catch {}
    const member = syntheticRowMember(row);
    const container = row.closest(TITLE_LIST_SYNTH_SEL);
    const pageNum = Math.max(1, Number(container?.getAttribute('data-page-num') || 0) || 0);
    if (!member || !pageNum) return;
    const chatId = resolveChatId();
    const opened = row.getAttribute('data-h2o-title-row-opened') === '1';
    const at = AT_PUBLIC();
    // The single-turn undo MUST use the same executor the page batch used:
    // in the engine route, collapseManyByIds detached the answer body into
    // the Unmount engine's record — at.setCollapsed alone cannot bring it
    // back, which is why Engine-mode opens looked like they did nothing.
    const routes = getConfiguredDividerRoutes();
    const engineDriver = routes.dividerDotRoute === 'engine/unmount';
    const um = UM_PUBLIC();
    const setMemberCollapsed = (collapsed) => {
      if (!member.answerId) return { ok: true, executor: 'no-answer' };
      if (engineDriver && um) {
        try {
          let result = null;
          if (collapsed && typeof um.collapseManyByIds === 'function') {
            result = um.collapseManyByIds([member.answerId], {
              source: 'title-list-row',
              preserveShell: 'title-list-row',
              emitLegacyAnswerCollapse: false,
            });
          } else if (!collapsed && typeof um.expandManyByIds === 'function') {
            const results = [];
            const hasSource = (source) => {
              try { return typeof um.isCollapsedById !== 'function' || um.isCollapsedById(member.answerId, { source }); } catch { return true; }
            };
            if (hasSource('title-list-row')) {
              results.push(um.expandManyByIds([member.answerId], {
                source: 'title-list-row',
                emitLegacyAnswerCollapse: false,
              }));
            }
            // A pre-existing manual title collapse is the same row's own
            // source. Opening that row clears it without touching unrelated
            // page-collapse/background/windowing sources.
            if (hasSource('answer-title')) {
              results.push(um.expandManyByIds([member.answerId], {
                source: 'answer-title',
                emitLegacyAnswerCollapse: false,
              }));
            }
            // No matching engine source means the engine did no work. Fall
            // through to the local executor so a legacy DOM residue left by
            // a route change can still be expanded instead of producing an
            // empty "opened" row.
            result = results.length
              ? { ok: results.every((entry) => !!entry && entry.ok !== false), results }
              : null;
          }
          if (result && result.ok !== false) return { ok: true, executor: 'engine', result };
        } catch {}
      }
      // Fail-closed legacy fallback. The title-intent source makes the Title
      // Bar API compare actual DOM residue rather than the override we wrote
      // immediately before this call, and does not record a second override.
      try {
        const result = at?.setCollapsed?.(member.answerId, collapsed, {
          animate: false,
          source: 'title-intent:stack-row',
        });
        return { ok: !!result && result.ok !== false, executor: 'legacy', result };
      } catch { return { ok: false, executor: 'none' }; }
    };
    if (!opened) {
      let executorResult = { ok: true, executor: 'no-answer' };
      if (member.type === 'answer') {
        // Explicit manual gesture: durable override first (works even for
        // unhydrated members — ledger only), then expand while the flow-hide
        // stamp remains active. The stamp is released only after adoption.
        recordManualTitleOverride(member.answerId, 'expanded', { chatId, page: pageNum, source: 'answer-title' });
        executorResult = setMemberCollapsed(false);
      } else {
        restoreNoAnswerMemberContent(member, row);
      }
      // Title-list context: the opened turn renders DIRECTLY UNDER its bar
      // inside one layout-isolated slot. Never expose normal flow first: if
      // content is unavailable, the row stays closed and flow stays hidden.
      const adopted = executorResult.ok !== false && adoptOpenedTurnIntoStack(member, pageNum, row, container, {
        captureLayout: true,
      });
      if (!adopted) {
        releaseInlineSlotForRow(row, container);
        if (member.type === 'answer') {
          recordManualTitleOverride(member.answerId, 'collapsed', { chatId, page: pageNum, source: 'answer-title' });
          setMemberCollapsed(true);
        }
        setTitleListMemberFlowHidden(member, pageNum, true);
        try { syncSyntheticTitleList(pageNum, chatId, true, { reason: 'row-open-failed' }); } catch {}
        return;
      }
      row.setAttribute('data-h2o-title-row-opened', '1');
      row.setAttribute('data-h2o-title-row-opened-by', 'dblclick');
      try { syncSyntheticTitleList(pageNum, chatId, true, { reason: 'row-opened' }); } catch {}
    } else {
      // Close: restore the inline wrappers to their canonical flow position
      // FIRST, then collapse + re-hide them there.
      releaseInlineSlotForRow(row, container);
      if (member.type === 'answer') {
        recordManualTitleOverride(member.answerId, 'collapsed', { chatId, page: pageNum, source: 'answer-title' });
        setMemberCollapsed(true);
      }
      setTitleListMemberFlowHidden(member, pageNum, true);
      row.removeAttribute('data-h2o-title-row-opened');
      row.removeAttribute('data-h2o-title-row-opened-by');
      try { syncSyntheticTitleList(pageNum, chatId, true, { reason: 'row-closed' }); } catch {}
    }
    scheduleDividerVisualRefresh(chatId, 0);
  }

  // Release every real/detached bar from a stack container: real bars are
  // re-homed to their canonical message-element position, detached bars for
  // still-unhydrated members are removed (their owners recreate on demand).
  function restoreNoAnswerTitleBarToFlow(bar = null, member = null) {
    if (!bar || member?.type === 'answer') return false;
    const qSection = titleListMemberSections(member).questionSection;
    const qEl = qSection?.querySelector?.(USER_MSG_SEL) || null;
    if (!qSection || !qEl) return false;
    const parent = qEl.parentElement && qEl.parentElement !== qSection ? qEl.parentElement : qSection;
    try {
      parent.insertBefore(bar, qEl.nextElementSibling || null);
      bar.removeAttribute('data-h2o-detached-title-bar');
      return true;
    } catch { return false; }
  }

  function releaseTitleStackBars(container) {
    if (!container?.querySelectorAll) return 0;
    const at = AT_PUBLIC();
    let released = 0;
    for (const bar of Array.from(container.querySelectorAll('[data-h2o-stack-key]'))) {
      const member = syntheticRowMember(bar);
      const answerId = String(bar.getAttribute('data-answer-id') || '').trim();
      const detached = bar.getAttribute('data-h2o-detached-title-bar') === '1';
      for (const attr of ['data-h2o-in-title-stack', 'data-h2o-stack-key', 'data-h2o-stack-type', 'data-h2o-stack-turn-no', ATTR_TITLE_LIST_NUM, 'data-h2o-title-row-opened', 'data-h2o-title-row-opened-by']) {
        try { bar.removeAttribute(attr); } catch {}
      }
      const restoredNoAnswer = member?.type !== 'answer' && restoreNoAnswerTitleBarToFlow(bar, member);
      const msgEl = (!restoredNoAnswer && !detached && answerId) ? (at?.getMessageEl?.(answerId) || null) : null;
      if (restoredNoAnswer) {
        // Restored above; MiniMap Core remains the normal-flow NO ANSWER
        // creator/wiring owner once title-list mode is inactive.
      } else if (msgEl) {
        try { msgEl.insertBefore(bar, msgEl.firstElementChild || null); } catch { try { bar.remove(); } catch {} }
      } else {
        try { bar.remove(); } catch {}
      }
      released += 1;
    }
    return released;
  }

  function syncSyntheticTitleList(pageNum = 0, chatId = '', active = false, opts = {}) {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    const reason = String(opts?.reason || 'stack-sync').trim() || 'stack-sync';
    if (!active) {
      let released = 0;
      for (const stale of getSyntheticTitleListContainers(num)) {
        restoreAllInlineTurns(stale);
        released += releaseTitleStackBars(stale);
        try { stale.remove(); } catch {}
      }
      released += sweepSyntheticTitleListHidden(num);
      S.titleListStacksByKey.delete(titleListStackRegistryKey(num, id));
      getTitleListStackStats(num, id).activeStackId = '';
      return { ok: true, status: 'inactive', pageNum: num, rows: 0, released };
    }
    const members = pureCanonicalPageMemberDetails(num);
    if (!members.length) {
      // No canonical membership yet (turn ledger still hydrating): keep the
      // legacy in-place behavior for now; the next visuals pass retries.
      return { ok: true, status: 'no-members', pageNum: num, rows: 0 };
    }
    let divider = null;
    try {
      divider = document.querySelector(`.cgxui-chat-page-divider[data-page-num="${String(num)}"], .cgxui-pgnw-page-divider[data-page-num="${String(num)}"]`);
    } catch {}
    if (!divider?.parentNode) {
      return { ok: true, status: 'no-divider', pageNum: num, rows: 0 };
    }
    const container = claimSingleTitleListContainer(num, id, divider, reason);
    if (!container) return { ok: false, status: 'stack-unavailable', pageNum: num, rows: 0 };
    const stats = getTitleListStackStats(num, id);
    const at = AT_PUBLIC();
    const keep = new Set();
    let titleBarPool = [];
    try {
      titleBarPool = Array.from(document.querySelectorAll('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]'));
    } catch {}
    let lastPlaced = null;
    for (const member of members) {
      keep.add(member.id);
      let bar = findStackRowForMember(container, member);
      if (bar) {
        const oldKey = String(bar.getAttribute('data-h2o-stack-key') || '').trim();
        if (oldKey !== member.id) {
          bar.setAttribute('data-h2o-stack-key', member.id);
          stats.identityRekeyCount = Number(stats.identityRekeyCount || 0) + 1;
          markTitleListStackMutation(stats, `row-rekey:${reason}`);
        }
      }
      // Adopt the REAL in-flow bar whenever it exists — relocation, never a
      // copy, so exactly one instance of each title bar can ever be visible.
      // (1C1a's ensure/getBar treat a [data-h2o-in-title-stack] bar as THE
      // bar for its answer, so title edits, collapse wiring, and hydration
      // upgrades all target the stacked element in place.)
      if (!bar && member.type === 'answer' && member.answerId) {
        let realBar = null;
        try { realBar = at?.getBar?.(member.answerId) || null; } catch {}
        if (realBar) bar = realBar;
      }
      if (!bar && member.type !== 'answer') {
        const qSection = titleListMemberSections(member).questionSection;
        try { bar = qSection?.querySelector?.(NO_ANSWER_TITLE_BAR_SEL) || null; } catch {}
      }
      if (!bar) {
        // Unhydrated member / orphan question: generate the SAME title-bar
        // component through the Title Bar system's own factory. It carries
        // data-answer-id, so on hydration DOM_ensureTitleBar reuses THIS
        // element (upgrade in place — no swap, no duplicate).
        const resolved = member.type === 'answer' ? resolveSyntheticRowTitle(member) : { text: '', source: 'no-answer', rank: 3 };
        try {
          bar = at?.buildDetachedBar?.({
            answerId: member.type === 'answer' ? member.answerId : `no-answer:${member.questionId}`,
            turnNo: member.turnNo,
            title: resolved.source === 'fallback' ? '' : resolved.text,
            noAnswer: member.type !== 'answer',
          }) || null;
        } catch {}
        if (!bar) continue;
        bar.setAttribute('data-h2o-title-row-source', resolved.source);
        bar.setAttribute('data-h2o-title-row-source-rank', String(resolved.rank));
        markTitleListStackMutation(stats, `row-created:${reason}`);
      }
      bar.setAttribute('data-h2o-in-title-stack', String(num));
      bar.setAttribute('data-h2o-stack-key', member.id);
      bar.setAttribute('data-h2o-stack-type', member.type);
      bar.setAttribute('data-h2o-stack-turn-no', String(member.turnNo));
      if (bar.getAttribute(ATTR_TITLE_LIST_NUM) !== '1') bar.setAttribute(ATTR_TITLE_LIST_NUM, '1');
      try { bar.setAttribute('data-h2o-turn-num', String(member.turnNo)); } catch {}
      try {
        bar.setAttribute('data-h2o-title-row-hydrated',
          (member.type === 'answer' && at?.getMessageEl?.(member.answerId)) ? '1' : '0');
      } catch {}
      const titleProjection = projectSyntheticRowTitle(member, bar);
      if (titleProjection.changed) {
        stats.titleUpgradeCount = Number(stats.titleUpgradeCount || 0) + 1;
        markTitleListStackMutation(stats, `title-upgrade:${reason}`);
      }
      if (titleProjection.preventedDowngrade) {
        stats.titleDowngradePreventedCount = Number(stats.titleDowngradePreventedCount || 0) + 1;
      }
      const explicitlyOpened = bar.getAttribute('data-h2o-title-row-opened') === '1'
        && bar.getAttribute('data-h2o-title-row-opened-by') === 'dblclick';
      const staleOpen = bar.getAttribute('data-h2o-title-row-opened') === '1' && !explicitlyOpened;
      if (staleOpen) {
        releaseInlineSlotForRow(bar, container);
        bar.removeAttribute('data-h2o-title-row-opened');
        bar.removeAttribute('data-h2o-title-row-opened-by');
        setTitleListMemberFlowHidden(member, num, true);
        markTitleListStackMutation(stats, `unproven-row-open-cleared:${reason}`);
      }
      const rowOpened = !staleOpen && explicitlyOpened;
      if (member.type !== 'answer') {
        try { bar.setAttribute('data-cgxui-state', rowOpened ? 'editable' : 'collapsed editable'); } catch {}
        const icon = bar.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
        if (icon) icon.textContent = rowOpened ? '⌄' : '›';
      }
      // Single Visible Instance Rule: stack membership is identity-based and
      // global. Engine restore/hydration can move or recreate a flow bar
      // outside the expected section subtree, so section-local dedup was not
      // sufficient and produced bars that appeared/disappeared by cadence.
      const removedDuplicates = removeDuplicateFlowBarsForStackedMember(member, bar, titleBarPool);
      if (removedDuplicates > 0) markTitleListStackMutation(stats, `dedup:${reason}`);
      const washProjection = applyStackedTitleBarWash(member, bar);
      if (washProjection?.status === 'painted' || washProjection?.status === 'clear') {
        markTitleListStackMutation(stats, `washer:${reason}`);
      }
      // Canonical order among BARS, tolerant of inline-opened turn content
      // sitting between a bar and the next bar. Only move when relative
      // order is actually wrong — stable passes must emit zero mutations.
      if (bar.parentElement !== container) {
        try {
          container.insertBefore(bar, lastPlaced ? lastPlaced.nextSibling : container.firstChild);
          markTitleListStackMutation(stats, `row-adopted:${reason}`);
        } catch {}
      } else if (lastPlaced) {
        const ordered = !!(lastPlaced.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!ordered) {
          try {
            container.insertBefore(bar, lastPlaced.nextSibling);
            markTitleListStackMutation(stats, `row-reordered:${reason}`);
          } catch {}
        }
      } else if (container.firstElementChild !== bar) {
        try {
          container.insertBefore(bar, container.firstChild);
          markTitleListStackMutation(stats, `row-reordered:${reason}`);
        } catch {}
      }
      // An explicitly opened row is repaired by the same stack owner on every
      // canonical sync. If ChatGPT reclaimed its native wrapper, re-adopt it
      // into the existing isolated slot instead of allowing a flow leak.
      let openedContentAdopted = false;
      if (rowOpened) {
        openedContentAdopted = adoptOpenedTurnIntoStack(member, num, bar, container, { captureLayout: false });
        if (!openedContentAdopted) setTitleListMemberFlowHidden(member, num, true);
      } else {
        releaseInlineSlotForRow(bar, container);
      }
      // Advance past the bar and its one H2O-owned inline slot.
      lastPlaced = bar;
      const inlineSlot = getInlineSlotForRow(bar, container);
      if (rowOpened && inlineSlot?.previousElementSibling === bar) lastPlaced = inlineSlot;
      // Hide the member's in-flow pair unless the user opened it via dblclick.
      if (!rowOpened) {
        if (setTitleListMemberFlowHidden(member, num, true)) {
          markTitleListStackMutation(stats, `flow-hidden:${reason}`);
        }
      }
    }
    // Release bars for members no longer in the canonical page membership.
    try {
      for (const bar of Array.from(container.children || []).filter((row) => row.matches?.('[data-h2o-stack-key]'))) {
        const id = String(bar.getAttribute('data-h2o-stack-key') || '');
        if (keep.has(id)) continue;
        const staleTurnNo = Math.max(0, Number(bar.getAttribute('data-h2o-stack-turn-no') || 0) || 0);
        const replacedAtSameTurn = staleTurnNo > 0 && Array.from(container.children || []).some((candidate) => (
          candidate !== bar
          && candidate.matches?.('[data-h2o-stack-key]')
          && Number(candidate.getAttribute('data-h2o-stack-turn-no') || 0) === staleTurnNo
        ));
        const answerId = String(bar.getAttribute('data-answer-id') || '').trim();
        const msgEl = answerId ? (at?.getMessageEl?.(answerId) || null) : null;
        releaseInlineSlotForRow(bar, container);
        for (const attr of ['data-h2o-in-title-stack', 'data-h2o-stack-key', 'data-h2o-stack-type', 'data-h2o-stack-turn-no', ATTR_TITLE_LIST_NUM, 'data-h2o-title-row-opened', 'data-h2o-title-row-opened-by']) {
          try { bar.removeAttribute(attr); } catch {}
        }
        if (msgEl && bar.getAttribute('data-h2o-detached-title-bar') !== '1') {
          try { msgEl.insertBefore(bar, msgEl.firstElementChild || null); } catch { try { bar.remove(); } catch {} }
        } else {
          try { bar.remove(); } catch {}
        }
        if (replacedAtSameTurn) {
          stats.rowReplaceCount = Number(stats.rowReplaceCount || 0) + 1;
          stats.replaceCount = Number(stats.replaceCount || 0) + 1;
          stats.lastReplaceReason = `row-replaced:${reason}`;
        }
        markTitleListStackMutation(stats, `row-released:${reason}`);
      }
      for (const slot of Array.from(container.querySelectorAll(`:scope > [${ATTR_TITLE_INLINE_SLOT}="1"]`))) {
        const slotKey = String(slot.getAttribute(ATTR_TITLE_INLINE_FOR) || '').trim();
        const slotTurnNo = Number(slot.getAttribute('data-h2o-stack-turn-no') || 0);
        const ownerRow = Array.from(container.children || []).find((candidate) => (
          candidate.matches?.('[data-h2o-stack-key]')
          && ((slotKey && candidate.getAttribute('data-h2o-stack-key') === slotKey)
            || (slotTurnNo && Number(candidate.getAttribute('data-h2o-stack-turn-no') || 0) === slotTurnNo))
        )) || null;
        if (!ownerRow) {
          for (const anchor of Array.from(slot.querySelectorAll(`[${ATTR_TITLE_STACK_INLINE}]`))) restoreInlineTurnToFlow(anchor);
          if (!slot.children.length) { try { slot.remove(); } catch {} }
        }
      }
    } catch {}
    stats.lastListSettledAt = Date.now();
    return { ok: true, status: 'ok', pageNum: num, rows: members.length, stackId: container.id, reason };
  }

  function scheduleActiveTitleListRepair(reason = 'canonical-index-updated', delay = 16, pageNum = 0) {
    const requestedPage = Math.max(0, Number(pageNum || 0) || 0);
    if (requestedPage) S.titleListRepairPages.add(requestedPage);
    else S.titleListRepairAllPages = true;
    if (S.titleListRepairTimer) {
      try { W.clearTimeout(S.titleListRepairTimer); } catch {}
    }
    S.titleListRepairTimer = W.setTimeout(() => {
      S.titleListRepairTimer = 0;
      const chatId = resolveChatId();
      const activePages = readTitleListPages(chatId);
      const requestedPages = S.titleListRepairAllPages
        ? Array.from(activePages)
        : Array.from(S.titleListRepairPages).filter((num) => activePages.has(num));
      S.titleListRepairPages.clear();
      S.titleListRepairAllPages = false;
      if (!activePages.size) return;
      for (const requested of requestedPages) {
        try { syncSyntheticTitleList(requested, chatId, true, { reason }); } catch {}
      }
    }, Math.max(0, Number(delay || 0) || 0));
    return true;
  }

  function reassertActiveTitleListFlowHidden(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const id = String(chatId || resolveChatId()).trim();
    if (!isTitleListActive(num, id)) return { ok: true, status: 'inactive', hidden: 0 };
    const container = getSyntheticTitleListContainer(num, id);
    let hidden = 0;
    for (const member of pureCanonicalPageMemberDetails(num)) {
      const row = findStackRowForMember(container, member);
      const explicitlyOpened = row?.getAttribute?.('data-h2o-title-row-opened') === '1'
        && row?.getAttribute?.('data-h2o-title-row-opened-by') === 'dblclick';
      if (!explicitlyOpened && setTitleListMemberFlowHidden(member, num, true)) hidden += 1;
    }
    return { ok: true, status: 'ok', hidden };
  }

  function applyTitleListVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const active = isTitleListActive(num, id);
    const rows = getRows(num, id);
    const at = AT_PUBLIC();
    const um = UM_PUBLIC();
    const routes = getConfiguredDividerRoutes();
    const driver = routes.dividerDotRoute === 'engine/unmount' ? 'engine' : 'legacy';
    const skipAnswerBatch = opts?.skipAnswerBatch === true;
    // The EXPAND batch is an explicit user action (divider dot click), never a
    // background repair: refresh/hydration passes call this function for every
    // known page with active=false, and running the expand batch there wiped
    // the `title-list-row` ledger (and, in legacy mode, manual collapses)
    // moments after a mass collapse — leaving freshly hydrated rows expanded.
    // Collapse re-application stays allowed on every pass so hydrating rows
    // of an active title-list page snap collapsed.
    const explicitDotAction = String(opts?.source || '').startsWith('chat-page-divider:dot');
    const ledger = readTitleIntentLedger(id);
    const pageHasTitleIntent = titleIntentPageHasActiveState(num, ledger);
    const needsAnswerIds = !!active || explicitDotAction || pageHasTitleIntent;
    const answerIds = needsAnswerIds ? normalizeAnswerIds(getAuthoritativePageAnswerIds(num, id)) : [];

    if (answerIds.length && !skipAnswerBatch) {
      if (driver === 'engine') {
        try {
          if (active && typeof um?.collapseManyByIds === 'function') {
            um.collapseManyByIds(answerIds, {
              source: 'title-list-row',
              preserveShell: 'title-list-row',
              emitLegacyAnswerCollapse: false,
            });
          } else if (!active && explicitDotAction && typeof um?.expandManyByIds === 'function') {
            um.expandManyByIds(answerIds, {
              source: 'title-list-row',
              emitLegacyAnswerCollapse: false,
            });
          }
        } catch {}
      } else if (at?.setCollapsed) {
        if (active || explicitDotAction) {
          for (const answerId of answerIds) {
            try { at.setCollapsed(answerId, !!active, { animate: false, source: 'chat-pages-controller:title-list' }); } catch {}
          }
        }
      }
    }

    // The synthetic stack is the sole active flow-hide owner. Legacy row
    // helpers are used only while releasing title-list mode so their old
    // inner-node stamps cannot compete with whole-wrapper hiding.
    if (!active) {
      for (const row of rows) {
        if (row.noAnswer) {
          applyNoAnswerTitleCollapsedDom(row.answerHost, false, {
            animate: opts?.animate === true,
            bar: row.titleBar,
            questionHost: row.questionHost,
          });
        } else {
          setQuestionHostTitleListHidden(row.questionHost, false);
        }
      }
    }
    if (!active) sweepQuestionHostRestore();
    // Stable synthetic list: renders/updates the full-page canonical row list
    // while active; removes it and releases the flow stamps when inactive.
    const synth = syncSyntheticTitleList(num, id, !!active, { reason: String(opts?.source || 'apply-title-list-visuals') });
    const intentReplay = pageHasTitleIntent
      ? applyTitleIntentToPage(num, { chatId: id, answerIds, animate: opts?.animate === true, ledger })
      : { ok: true, status: 'skipped-inert', chatId: id, pageNum: num, members: 0, hydrated: 0, unhydrated: 0, results: [] };
    if (!pageHasTitleIntent) incTitleIntentStat('replaySkippedInert');
    return { ok: true, status: 'ok', chatId: id, pageNum: num, rows: rows.length, active, driver, synth, intentReplay };
  }

  function setTitleListMode(pageNum = 0, enabled = false, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const source = String(opts?.source || 'chat-pages-controller:title-list').trim() || 'chat-pages-controller:title-list';
    const next = localReadTitleListPagesSet(id);
    if (enabled) next.add(num); else next.delete(num);
    localWriteTitleListPagesSet(id, Array.from(next));
    const visual = applyTitleListVisuals(num, { chatId: id, source, animate: opts?.animate, skipAnswerBatch: opts?.skipAnswerBatch === true });
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    return { ok: true, status: 'ok', chatId: id, pageNum: num, enabled: !!enabled, visual };
  }

  function applyPageCollapsedVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const collapsed = isPageCollapsed(num, id);
    const driver = normalizeVisualDriver(opts?.driver || getPageCollapseDriver(num, id));
    const mode = String(opts?.mode || getPageCollapseMode(num, id) || '').trim().toLowerCase();
    const wrappedByPagination = driver === 'engine' && mode === 'pagination';
    const payload = getSections(id);
    const section = payload?.sections?.get?.(num) || null;
    const hosts = Array.isArray(section?.hosts) ? section.hosts : [];
    const bodyHosts = getPageBodyHosts(hosts);

    if (wrappedByPagination) {
      if (collapsed) {
        detachPageHostsFromChat(num, id, bodyHosts);
      } else {
        restoreDetachedPageHosts(num, id);
      }
      for (const host of bodyHosts) setChatPageTurnHostDomState(host, num, false);
    } else {
      restoreDetachedPageHosts(num, id);
      for (const host of bodyHosts) setChatPageTurnHostDomState(host, num, driver === 'engine' ? false : collapsed);
      // Expand must not depend on the freshly rebuilt host list: hydration
      // churn can leave it incomplete and strand hidden sections/wrappers.
      // Collapse stamped every host it hid with page-num + hidden attrs, so
      // restore sweeps those stamps directly.
      if (!collapsed) sweepPageHiddenDomState(num);
      try { MM_CORE_PAGES()?.setMiniMapPageCollapsed?.(num, collapsed, id, { source: String(opts?.source || 'chat-sync').trim() || 'chat-sync', propagate: true }); } catch {}
    }
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    const detachedCount = getDetachedPageRecord(num, id)?.items?.length || 0;
    return { ok: true, status: 'ok', chatId: id, pageNum: num, collapsed, hosts: bodyHosts.length || detachedCount, driver, mode, wrappedByPagination };
  }

  function applyPageVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const source = String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller';
    const titleResult = applyTitleListVisuals(num, { chatId: id, source, animate: opts?.animate });
    const pageResult = applyPageCollapsedVisuals(num, { chatId: id, source });
    // Page-collapse restore can remove display from pair wrappers. Reassert
    // only the hide projection here; applyTitleListVisuals above already ran
    // the sole stack reconciler. A second full sync was the delayed row
    // replacement path that downgraded titles and washer state.
    const titleListFlow = reassertActiveTitleListFlowHidden(num, id);
    scheduleDividerVisualRefresh(id, 0);
    return { ok: titleResult?.ok !== false && pageResult?.ok !== false, status: 'ok', chatId: id, pageNum: num, titleResult, pageResult, titleListFlow };
  }

  function setPageCollapsed(pageNum = 0, collapsed = true, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const driver = normalizeVisualDriver(opts?.driver);
    const mode = String(opts?.mode || '').trim().toLowerCase();
    const source = String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller';
    const next = localReadCollapsedPagesSet(id);
    if (collapsed) next.add(num); else next.delete(num);
    localWriteCollapsedPagesSet(id, Array.from(next));
    setPageCollapseDriver(num, !!collapsed, driver, id);
    setPageCollapseMode(num, !!collapsed && mode === 'pagination', mode, id);
    const visual = applyPageCollapsedVisuals(num, { chatId: id, source, driver, mode });
    return { ok: true, status: 'ok', chatId: id, pageNum: num, collapsed: !!collapsed, source, driver, mode, visual };
  }

  function togglePageCollapsed(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return setPageCollapsed(num, !isPageCollapsed(num, id), Object.assign({}, opts, { chatId: id }));
  }

  function resetAllMechanisms(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', pages: 0, answers: 0, manualCollapsed: 0 };

    const pageNums = collectKnownPageNums(id);
    const at = AT_PUBLIC();
    const um = UM_PUBLIC();
    const pg = PG_ADAPTER();
    const answerIds = new Set();
    const manualCollapsedIds = new Set();
    const resetDetails = {
      pagination: null,
      remountedBackgroundTurns: 0,
      unmountManual: null,
      titleBar: null,
    };

    for (const pageNum of pageNums) {
      for (const row of getRows(pageNum, id)) {
        const aId = String(row?.answerId || '').trim();
        if (aId && !row?.noAnswer) answerIds.add(aId);
      }
    }

    // Shell-persistent chats may have zero hydrated rows at visit time. The
    // canonical runtime still knows every answer id, which is required to
    // filter this chat out of the legacy global collapsed-id set safely.
    try {
      for (const record of TURN_RUNTIME()?.listTurnRecords?.() || []) {
        const ids = Array.isArray(record?.answerIds)
          ? record.answerIds
          : [record?.primaryAId, record?.answerId, record?.aId];
        for (const rawId of ids) {
          const aId = String(rawId || '').trim();
          if (aId) answerIds.add(aId);
        }
      }
    } catch {}

    try {
      const raw = um?.getManualCollapsedIds?.() || [];
      for (const rawId of Array.isArray(raw) ? raw : []) {
        const aId = String(rawId || '').trim();
        if (!aId) continue;
        manualCollapsedIds.add(aId);
        answerIds.add(aId);
      }
    } catch {}

    // Hard reset current chat back to origin before any of the 3 mechanisms.
    // 1) Tear down transient/committed pagination runtime so the live root returns to full-chat origin.
    // Keep preserveApi=true so feature surfaces survive; this is a live-session reset, not a feature unload.
    if (typeof pg?.teardownRuntimeSession === 'function') {
      try { resetDetails.pagination = pg.teardownRuntimeSession('thread-pages-controller:reset-all-mechanisms', { preserveApi: true }); } catch {}
    }

    // 2) Remount background-unmounted turns first so later hard-expands can take over mounted DOM reliably.
    if (typeof um?.remountAll === 'function') {
      try { resetDetails.remountedBackgroundTurns = Number(um.remountAll('thread-pages-controller:reset-all-mechanisms') || 0); } catch {}
    }

    // 3) Clear every manual Unmount collapse source for this chat, not only answer-title.
    //    This is critical because page divider dblclick may collapse with source 'page-collapse'.
    if (typeof um?.clearManualCollapsedForCurrentChat === 'function') {
      try {
        resetDetails.unmountManual = um.clearManualCollapsedForCurrentChat({
          chatId: id,
          emitLegacyAnswerCollapse: true,
        });
      } catch {}
    } else if (typeof um?.expandManyByIds === 'function' && answerIds.size) {
      try {
        resetDetails.unmountManual = um.expandManyByIds(Array.from(answerIds), {
          emitLegacyAnswerCollapse: true,
        });
      } catch {}
    }

    // 4) Clear Turn Title Bar local/dom residue for mounted rows in the current thread.
    if (typeof at?.resetCollapsedForCurrentChat === 'function') {
      try { resetDetails.titleBar = at.resetCollapsedForCurrentChat({ animate: false, answerIds: Array.from(answerIds) }); } catch {}
    }

    // 5) Restore question hosts / no-answer shells to the true open baseline.
    for (const pageNum of pageNums) {
      for (const row of getRows(pageNum, id)) {
        if (row.noAnswer) {
          applyNoAnswerTitleCollapsedDom(row.answerHost, false, { animate: false, bar: row.titleBar, questionHost: row.questionHost });
        } else {
          setQuestionHostTitleListHidden(row.questionHost, false);
        }
      }
    }

    // 6) Restore any stored title-list and divider-button page-collapse state for this thread.
    localWriteTitleListPagesSet(id, []);
    localWriteCollapsedPagesSet(id, []);
    // Clear the intent ledger only when it actually holds intents — an
    // already-inert chat must not get an empty ledger written on reset.
    if (isTitleIntentEngineActive(id)) writeTitleIntentLedger(id, createEmptyTitleIntentLedger());
    S.titleListPagesByChat.set(id, new Set());
    S.collapsedPageDriversByChat.delete(id);
    S.collapsedPageModesByChat.delete(id);
    for (const pageNum of pageNums) {
      restoreDetachedPageHosts(pageNum, id);
      applyPageVisuals(pageNum, { chatId: id, source: 'reset-all-mechanisms' });
    }

    // 7) Final sweep: remove residual hidden question/title-list state and any
    //    stale page-hidden sections/wrappers, then rebuild dividers from clean
    //    chat state.
    sweepStalePageHiddenDomState(id);
    sweepQuestionHostRestore();
    // Release ALL synthetic title-list containers and flow stamps (page 0 =
    // every page), including pages no longer in the known-page inventory.
    sweepSyntheticTitleListHidden(0);
    try {
      for (const container of Array.from(document.querySelectorAll(TITLE_LIST_SYNTH_SEL))) {
        restoreAllInlineTurns(container);
        releaseTitleStackBars(container);
        try { container.remove(); } catch {}
      }
    } catch {}
    for (const [key] of Array.from(S.titleListStacksByKey.entries())) {
      if (!id || key.startsWith(`${id}::`)) S.titleListStacksByKey.delete(key);
    }
    for (const [key, stats] of Array.from(S.titleListStackStatsByKey.entries())) {
      if (!id || key.startsWith(`${id}::`)) stats.activeStackId = '';
    }
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    return {
      ok: true,
      status: 'ok',
      chatId: id,
      pages: pageNums.length,
      answers: answerIds.size,
      manualCollapsed: manualCollapsedIds.size,
      resetDetails,
    };
  }

  // ── Chat visit state policy (Performance → Mechanisms → Chat visit state) ──
  // One visit is one module load for a hard reload, or one transition into a
  // different chat id for SPA navigation. Ordinary pagination/title refreshes
  // stay inside that visit and must never retrigger reset.
  const KEY_VISIT_STATE_MODE_V1 = 'h2o:prm:cgx:mnmp:ui:chat-pages:visit-state-mode:v1';
  const KEY_LEGACY_TITLE_COLLAPSED_V1 = 'h2o:prm:cgx:atitle:collapsed:v1';

  function getVisitStateMode() {
    try {
      const v = W.localStorage?.getItem(KEY_VISIT_STATE_MODE_V1);
      return v === 'reset' ? 'reset' : 'remember';
    } catch { return 'remember'; }
  }

  function resolveVisitChatId(chatId = '') {
    try {
      const path = String(W.location?.pathname || '');
      const match = path.match(/\/c\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
      if (!/\/g\/[^/?#]+/i.test(path)) return '';
    } catch {}
    const id = String(chatId || resolveChatId()).trim();
    if (!id || id === '/') return '';
    return id;
  }

  function beginChatVisit(chatId = '', opts = {}) {
    const id = resolveVisitChatId(chatId);
    const state = S.visitState;
    if (!id) {
      state.missingChatIdDeferrals += 1;
      return { ok: false, status: 'chat-id-missing', chatId: '' };
    }
    if (state.deferredTimer) {
      try { W.clearTimeout(state.deferredTimer); } catch {}
      state.deferredTimer = 0;
    }
    const forceNew = opts?.forceNew === true;
    if (forceNew || state.currentChatId !== id || !state.currentVisitId) {
      state.visitSequence += 1;
      state.currentChatId = id;
      state.currentVisitId = `${Date.now().toString(36)}-${state.visitSequence}-${safeChatKeyPart(id).slice(0, 18)}`;
      state.resetAppliedThisVisit = false;
      state.restoreSuppressedBecauseReset = false;
      state.liveStateCleared = false;
      state.domCleanupApplied = false;
    }
    return { ok: true, status: 'visit-ready', chatId: id, visitId: state.currentVisitId };
  }

  function clearTitleIntentProjectionAttrs() {
    const attrs = [
      'data-h2o-title-page', 'data-h2o-title-desired', 'data-h2o-title-state-source',
      'data-h2o-title-rev', 'data-h2o-title-pending-state', 'data-h2o-title-pending-rev',
    ];
    let changed = 0;
    try {
      for (const el of Array.from(document.querySelectorAll(attrs.map((attr) => `[${attr}]`).join(',')))) {
        let localChanged = false;
        for (const attr of attrs) {
          if (!el.hasAttribute?.(attr)) continue;
          try { el.removeAttribute(attr); localChanged = true; } catch {}
        }
        if (localChanged) changed += 1;
      }
    } catch {}
    return changed;
  }

  function clearVisitStateForChat(chatId = '', opts = {}) {
    const id = resolveVisitChatId(chatId);
    const state = S.visitState;
    if (!id) {
      state.missingChatIdDeferrals += 1;
      return { ok: false, status: 'chat-id-missing', chatId: '' };
    }

    const titleListKey = keyTitleListPages(id);
    const collapsedPagesKey = keyCollapsedPages(id);
    const intentKey = keyTitleIntentLedger(id);
    const before = {
      titleListPages: localReadTitleListPagesSet(id).size,
      collapsedPages: localReadCollapsedPagesSet(id).size,
      intentActive: isTitleIntentEngineActive(id),
      titleListRaw: storageGetRaw(titleListKey),
      collapsedRaw: storageGetRaw(collapsedPagesKey),
      intentRaw: storageGetRaw(intentKey),
      liveDrivers: S.collapsedPageDriversByChat.get(id)?.size || 0,
      liveModes: S.collapsedPageModesByChat.get(id)?.size || 0,
      detachedPages: S.detachedPageHostsByChat.get(id)?.size || 0,
      paginationActive: (() => {
        try {
          const paginationState = PG_ADAPTER()?.getDividerPaginationState?.() || null;
          return !!paginationState?.active || !!paginationState?.transient;
        } catch { return false; }
      })(),
    };

    const reset = resetAllMechanisms(id);
    const unmountReset = reset?.resetDetails?.unmountManual || null;
    const titleReset = reset?.resetDetails?.titleBar || null;

    const clearedKeys = [];
    const skippedKeys = [];
    const noteKey = (key, existed) => (existed ? clearedKeys : skippedKeys).push(key);
    noteKey(titleListKey, before.titleListRaw != null);
    noteKey(collapsedPagesKey, before.collapsedRaw != null);
    noteKey(intentKey, before.intentRaw != null);
    if (unmountReset?.storageKey) noteKey(unmountReset.storageKey, !!unmountReset.persistedExisted);
    noteKey(KEY_LEGACY_TITLE_COLLAPSED_V1, !!titleReset?.persistedChanged);

    storageRemove(titleListKey);
    storageRemove(collapsedPagesKey);
    storageRemove(intentKey);
    S.titleListPagesByChat.set(id, new Set());
    S.collapsedPagesByChat.set(id, new Set());
    S.collapsedPageDriversByChat.delete(id);
    S.collapsedPageModesByChat.delete(id);
    S.detachedPageHostsByChat.delete(id);
    cacheTitleIntentLedger(id, createEmptyTitleIntentLedger());
    S.titleIntentLastAppliedByAnswer.clear();

    let orphanStackBarsCleaned = 0;
    try {
      const at = AT_PUBLIC();
      for (const bar of Array.from(document.querySelectorAll('[data-h2o-in-title-stack]'))) {
        if (bar.closest?.(TITLE_LIST_SYNTH_SEL)) continue;
        const answerId = String(bar.getAttribute('data-answer-id') || '').trim();
        const detached = bar.getAttribute('data-h2o-detached-title-bar') === '1';
        for (const attr of [
          'data-h2o-in-title-stack', 'data-h2o-stack-key', 'data-h2o-stack-type',
          'data-h2o-stack-turn-no', ATTR_TITLE_LIST_NUM, 'data-h2o-title-row-opened',
        ]) {
          try { bar.removeAttribute(attr); } catch {}
        }
        const msgEl = (!detached && answerId) ? (at?.getMessageEl?.(answerId) || null) : null;
        if (msgEl) {
          try { msgEl.insertBefore(bar, msgEl.firstElementChild || null); } catch {}
        } else if (detached) {
          try { bar.remove(); } catch {}
        }
        orphanStackBarsCleaned += 1;
      }
    } catch {}

    const projectionAttrsCleared = clearTitleIntentProjectionAttrs();
    sweepSyntheticTitleListHidden(0);
    sweepStalePageHiddenDomState(id);
    sweepQuestionHostRestore();

    const familyNames = [];
    if (before.titleListPages > 0 || before.titleListRaw != null) familyNames.push('title-list-pages');
    if (before.collapsedPages > 0 || before.collapsedRaw != null) familyNames.push('collapsed-pages');
    if (before.intentActive || before.intentRaw != null) familyNames.push('title-intent');
    if (unmountReset?.persistedExisted || Number(unmountReset?.liveRecords || 0) > 0) familyNames.push('engine-manual-title-collapse');
    if (titleReset?.persistedChanged) familyNames.push('legacy-manual-title-collapse');
    if (before.liveDrivers || before.liveModes || before.detachedPages || before.paginationActive) familyNames.push('live-page-runtime');

    const result = {
      ok: reset?.ok !== false,
      status: reset?.ok === false ? (reset?.status || 'reset-failed') : 'cleared',
      reason: String(opts?.reason || 'visit-reset'),
      chatId: id,
      clearedFamilies: familyNames.length,
      clearedFamilyNames: familyNames,
      clearedKeys,
      skippedKeys,
      liveStateCleared: reset?.ok !== false,
      domCleanupApplied: reset?.ok !== false,
      projectionAttrsCleared,
      orphanStackBarsCleaned,
      reset,
    };
    state.lastResult = result;
    return result;
  }

  function commitVisitResetResult(result = null) {
    const state = S.visitState;
    const ok = !!result?.ok;
    state.resets += ok ? 1 : 0;
    state.resetAppliedThisVisit = ok;
    state.resetAppliedAt = ok ? Date.now() : 0;
    state.clearedFamilies = Number(result?.clearedFamilies || 0);
    state.clearedFamilyNames = result?.clearedFamilyNames || [];
    state.clearedKeys = result?.clearedKeys || [];
    state.skippedKeys = result?.skippedKeys || [];
    state.liveStateCleared = !!result?.liveStateCleared;
    state.domCleanupApplied = !!result?.domCleanupApplied;
    return result;
  }

  function clearVisitStateForCurrentChat(opts = {}) {
    const id = resolveVisitChatId(opts?.chatId || resolveChatId());
    const visit = beginChatVisit(id);
    if (!visit.ok) return visit;
    S.visitState.restoreSuppressedBecauseReset = getVisitStateMode() === 'reset';
    return commitVisitResetResult(clearVisitStateForChat(id, {
      reason: opts?.reason || 'debug-api',
    }));
  }

  function maybeApplyVisitStatePolicy(chatId = '', opts = {}) {
    const state = S.visitState;
    const mode = getVisitStateMode();
    state.lastMode = mode;
    const visit = beginChatVisit(chatId, { forceNew: opts?.forceNewVisit === true });
    if (!visit.ok) return { mode, applied: false, deferred: true };
    if (mode !== 'reset') {
      state.restoreSuppressedBecauseReset = false;
      return { mode, applied: false, chatId: visit.chatId, visitId: visit.visitId };
    }
    state.restoreSuppressedBecauseReset = true;
    if (state.resetAppliedThisVisit && opts?.forceReset !== true) {
      return { mode, applied: false, alreadyApplied: true, chatId: visit.chatId, visitId: visit.visitId };
    }

    const result = clearVisitStateForChat(visit.chatId, { reason: opts?.reason || 'chat-visit' });
    commitVisitResetResult(result);
    return { mode, applied: !!result.ok, chatId: visit.chatId, visitId: visit.visitId, result };
  }

  function scheduleDeferredVisitRefresh(reason = 'deferred-chat-id', attempt = 0) {
    const state = S.visitState;
    if (state.deferredTimer) return;
    if (attempt >= 20) return;
    state.deferredTimer = W.setTimeout(() => {
      state.deferredTimer = 0;
      const id = resolveVisitChatId();
      if (!id) {
        state.missingChatIdDeferrals += 1;
        scheduleDeferredVisitRefresh(reason, attempt + 1);
        return;
      }
      refreshAll(id, { reason, forceNewVisit: true });
    }, 50);
  }

  function refreshAll(chatId = '', opts = {}) {
    const requestedId = String(chatId || resolveChatId()).trim();
    const visitPolicy = maybeApplyVisitStatePolicy(requestedId, opts);
    if (visitPolicy.deferred) {
      scheduleDeferredVisitRefresh(opts?.reason || 'refresh-chat-id');
      return { ok: false, status: 'visit-reset-deferred', chatId: '', pages: [] };
    }
    const id = String(visitPolicy.chatId || requestedId).trim();
    const pageNums = collectKnownPageNums(id);
    for (const pageNum of pageNums) {
      applyPageVisuals(pageNum, { chatId: id, source: 'chat-pages-controller:refresh' });
    }
    sweepStalePageHiddenDomState(id);
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    return { ok: true, status: 'refreshed', chatId: id, pages: pageNums };
  }

  // Pure read-only membership for the debug snapshot: canonical turn-list
  // slice only. It must NEVER route through getRows /
  // getAuthoritativePageAnswerIds — the Core row builder creates no-answer
  // title bars as a side effect, so a diagnostic call could itself mutate the
  // DOM and re-feed the mutation observers it is trying to observe.
  function pureCanonicalPageMembers(pageNum = 0) {
    return pureCanonicalPageMemberDetails(pageNum)
      .filter((member) => member.type === 'answer' && member.answerId)
      .map((member) => member.answerId);
  }

  function titleIntentDebugSnapshot(opts = {}) {
    incTitleIntentStat('debugSnapshotCalls');
    const chatId = String(opts?.chatId || resolveChatId()).trim();
    const pageNum = Math.max(1, Number(opts?.page || opts?.pageNum || 1) || 1);
    const ledger = readTitleIntentLedger(chatId);
    // Read-only page inventory: canonical turn-list math + ledger pages +
    // already-rendered divider attrs. No getSections/getRows row building.
    const availableSet = new Set();
    try {
      const list = MM_CORE_API()?.getTurnList?.() || [];
      const pageCount = Array.isArray(list) && list.length ? Math.ceil(list.length / 25) : 0;
      for (let p = 1; p <= pageCount; p += 1) availableSet.add(p);
    } catch {}
    for (const key of Object.keys(ledger.pages || {})) {
      const p = Math.max(0, Number(key || 0) || 0);
      if (p) availableSet.add(p);
    }
    try {
      for (const divider of Array.from(document.querySelectorAll('.cgxui-chat-page-divider[data-page-num], .cgxui-pgnw-page-divider[data-page-num]'))) {
        const p = Math.max(0, Number(divider.getAttribute('data-page-num') || 0) || 0);
        if (p) availableSet.add(p);
      }
    } catch {}
    const availablePages = Array.from(availableSet).sort((a, b) => a - b);
    const activeIntentCount = countActiveTitleIntentPages(ledger);
    const activeOverrideCount = countActiveTitleIntentOverrides(ledger);
    const isIntentSystemInert = activeIntentCount <= 0 && activeOverrideCount <= 0;
    const members = normalizeAnswerIds(pureCanonicalPageMembers(pageNum));
    const pageIntent = ledger.pages[String(pageNum)] || null;
    const pageHasIntent = Number(pageIntent?.rev || 0) > 0;
    const at = AT_PUBLIC();
    const pageExists = availablePages.includes(pageNum) || members.length > 0 || pageHasIntent;
    let reasonIfNoMembers = '';
    if (!members.length) {
      if (!pageExists) reasonIfNoMembers = 'page-not-found';
      else if (pageHasIntent) reasonIfNoMembers = 'page-has-intent-but-no-canonical-members';
      else reasonIfNoMembers = 'no-canonical-members-detected';
    }
    const hydratedMembers = [];
    const unhydratedMembers = [];
    const memberDetails = [];
    let obeyCount = 0;

    for (const answerId of members) {
      const desired = resolveDesiredTitleState(answerId, { chatId, page: pageNum, ledger });
      const msgEl = at?.getMessageEl?.(answerId) || null;
      const bar = at?.getBar?.(answerId) || null;
      const hydrated = !!(msgEl && bar);
      const actualState = hydrated ? getHydratedTitleActualState(msgEl, bar) : null;
      const rect = bar?.getBoundingClientRect?.();
      const visible = !!(rect && rect.width > 0 && rect.height > 0);
      const attrs = hydrated ? {
        desired: bar.getAttribute?.('data-h2o-title-desired') || '',
        source: bar.getAttribute?.('data-h2o-title-state-source') || '',
        rev: Number(bar.getAttribute?.('data-h2o-title-rev') || 0) || 0,
        page: bar.getAttribute?.('data-h2o-title-page') || '',
        hydrated: bar.getAttribute?.('data-h2o-title-hydrated') || '',
      } : null;
      const detail = {
        answerId,
        desired,
        hydrated,
        visible,
        actualState,
        obeysResolver: !hydrated || actualState === desired.state,
        appliedAttrs: attrs,
      };
      if (detail.obeysResolver) obeyCount += 1;
      if (hydrated) hydratedMembers.push(answerId);
      else unhydratedMembers.push(answerId);
      memberDetails.push(detail);
    }

    const manualOverrides = Object.entries(ledger.overrides || {})
      .filter(([answerId, entry]) => members.includes(answerId) || Number(entry?.page || 0) === pageNum)
      .map(([answerId, entry]) => ({ answerId, state: entry.state, rev: entry.rev, page: entry.page, source: entry.source }));
    const pageRev = Math.max(0, Number(pageIntent?.rev || 0) || 0);
    const staleManualWinning = manualOverrides.some((entry) => Number(entry.rev || 0) <= pageRev
      && memberDetails.some((m) => m.answerId === entry.answerId && m.desired.source === 'manual'));
    const counters = getTitleIntentStats();

    // Mechanism route snapshot (read-only): proves which backend the circle /
    // title-bar / dblclick gestures actually route through right now.
    let mechanismRoutes = null;
    try {
      const cfg = CM_ROUTER_API()?.getConfig?.() || null;
      const routes = getConfiguredDividerRoutes();
      mechanismRoutes = {
        masterRoute: String(cfg?.gestureBackend || 'legacy'),
        titleBarRoute: routes.titleBarRoute,
        pageDividerCircleRoute: routes.dividerDotRoute,
        pageDividerDblClickRoute: routes.dividerDblClickRoute,
      };
    } catch {}
    const activeIntentPages = Object.entries(ledger.pages || {})
      .filter(([, entry]) => Number(entry?.rev || 0) > 0)
      .map(([key, entry]) => ({ page: Number(key), state: entry.state, rev: entry.rev, source: entry.source }));
    const activeOverrideAnswerIds = Object.entries(ledger.overrides || {})
      .filter(([, entry]) => Number(entry?.rev || 0) > 0)
      .map(([answerId]) => answerId);
    const activeIntentSource = activeIntentPages.map((entry) => entry.source);
    // No code path converts legacy v1 sets into v2 intents; intents can only
    // carry gesture sources ('chat-page-divider:circle' / 'answer-title').
    const createdFromLegacyTitleList = activeIntentSource.some((s) => /legacy|migrat/i.test(String(s || '')));
    const createdOnChatOpen = activeIntentPages.length > 0 && Number(counters.localStorageWrites || 0) > 0
      ? 'writes-happened-this-session-check-sources'
      : false;
    // Read-only peek at legacy v1 keys for this chat (getItem only, no writes).
    let legacyRelevantKeys = null;
    try {
      legacyRelevantKeys = {
        titleListV1: { key: keyTitleListPages(chatId), value: storageGetRaw(keyTitleListPages(chatId)) },
        collapsedV1: { key: keyCollapsedPages(chatId), value: storageGetRaw(keyCollapsedPages(chatId)) },
      };
    } catch {}
    const pageScopedGateResult = titleIntentPageHasActiveState(pageNum, ledger);
    const titleListActive = isTitleListActive(pageNum, chatId);
    const memberDetailsAll = pureCanonicalPageMemberDetails(pageNum);
    const expectedAnswerMemberCount = memberDetailsAll.filter((m) => m.type === 'answer').length;
    const expectedNoAnswerMemberCount = memberDetailsAll.filter((m) => m.type !== 'answer').length;
    const expectedTitleRowCount = memberDetailsAll.length;
    const synthContainers = getSyntheticTitleListContainers(pageNum);
    const synthContainer = getSyntheticTitleListContainer(pageNum, chatId);
    const synthRows = synthContainer
      ? Array.from(synthContainer.children || []).filter((row) => row.matches?.('[data-h2o-stack-key]'))
      : [];
    const stackStats = S.titleListStackStatsByKey.get(titleListStackRegistryKey(pageNum, chatId)) || {
      buildCount: 0,
      replaceCount: 0,
      reattachCount: 0,
      rowReplaceCount: 0,
      identityRekeyCount: 0,
      titleUpgradeCount: 0,
      titleDowngradePreventedCount: 0,
      mutationCount: 0,
      syncCount: 0,
      lastBuildReason: '',
      lastReplaceReason: '',
      lastReattachReason: '',
      lastSyncReason: '',
      lastStackMutationReason: '',
      firstListCreatedAt: 0,
      lastStackMutationAt: 0,
      lastListSettledAt: 0,
      stackRectBeforeOpen: null,
      stackRectAfterOpen: null,
      lastOpenedTurnNo: 0,
      activeStackId: '',
    };
    const titleListContainerIds = synthContainers.map((container, index) => (
      String(container.id || container.getAttribute('data-h2o-title-stack-id') || `anonymous-stack-${index + 1}`)
    ));
    const missingTitleRows = titleListActive
      ? memberDetailsAll.filter((member) => !synthRows.some((row) => stackRowMatchesMember(row, member)))
        .map((member) => ({ id: member.id, turnNo: member.turnNo, type: member.type }))
      : [];
    const titleNumbersInStack = synthRows
      .map((row) => Number(row.getAttribute('data-h2o-stack-turn-no') || 0) || 0)
      .filter(Boolean);
    const missingTitleNumbers = titleListActive
      ? memberDetailsAll.map((m) => m.turnNo).filter((n) => !titleNumbersInStack.includes(n))
      : [];
    // Duplicate / in-flow leak accounting is page-member scoped. Stacked bars
    // are classified by location, not merely by attrs, so the snapshot cannot
    // count the canonical rehosted instance as its own flow duplicate.
    const isVisibleEl = (el) => {
      try {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return !!(r && r.width > 0 && r.height > 0
          && cs.display !== 'none' && cs.visibility !== 'hidden'
          && Number.parseFloat(cs.opacity || '1') > 0);
      } catch { return false; }
    };
    const titleBarStrictlyMatchesMember = (bar = null, member = null) => {
      if (!bar || !member) return false;
      const barId = titleBarMemberId(bar);
      if (!barId) return false;
      if (member.type !== 'answer') {
        return barId === member.id || barId === member.questionId;
      }
      if (bar.hasAttribute?.('data-at-no-answer')) return false;
      const family = new Set(titleListAnswerFamilyIds(member));
      if (family.has(barId)) return true;
      const barRecord = turnRecordForTitleListIdentity(barId);
      for (const value of [
        barRecord?.primaryAId,
        barRecord?.answerId,
        barRecord?.turnId,
        ...(Array.isArray(barRecord?.answerIds) ? barRecord.answerIds : []),
        ...(Array.isArray(barRecord?._aliasIds) ? barRecord._aliasIds : []),
      ]) {
        if (family.has(String(value || '').trim())) return true;
      }
      return false;
    };
    const canonicalFlowOwnerByBar = new Map();
    try {
      for (const member of memberDetailsAll) {
        const memberSections = titleListMemberSections(member);
        for (const anchor of memberAllFlowAnchors(member)) {
          for (const bar of Array.from(anchor.querySelectorAll?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]') || [])) {
            // Some native reserved-height wrapper chains have only one direct
            // child and make getTurnAnchorNode climb above a single Q+A pair.
            // An anchor is therefore only a search boundary, never ownership
            // proof. Require canonical bar identity or the exact member turn
            // section before assigning it; otherwise TITLE 33–35 can be
            // falsely grouped under visible PAGE 1 members.
            const barSection = getTurnSectionForNode(bar);
            const inExactMemberSection = member.type === 'answer'
              ? barSection === memberSections.answerSection || barSection === memberSections.questionSection
              : barSection === memberSections.questionSection;
            const hasIdentity = !!titleBarMemberId(bar);
            const staleNoAnswerInPairedQuestion = member.type === 'answer'
              && bar.hasAttribute?.('data-at-no-answer')
              && barSection === memberSections.questionSection;
            if (hasIdentity
              ? !titleBarStrictlyMatchesMember(bar, member) && !staleNoAnswerInPairedQuestion
              : !inExactMemberSection) continue;
            canonicalFlowOwnerByBar.set(bar, member.id);
          }
        }
      }
    } catch {}
    const canonicalMemberForBar = (bar = null) => {
      if (!bar) return null;
      const flowOwnerId = canonicalFlowOwnerByBar.get(bar) || '';
      if (flowOwnerId) {
        const flowOwner = memberDetailsAll.find((member) => member.id === flowOwnerId) || null;
        if (flowOwner) return flowOwner;
      }
      const inAnyStack = !!bar.closest?.(TITLE_LIST_SYNTH_SEL);
      return memberDetailsAll.find((member) => (
        inAnyStack ? stackRowMatchesMember(bar, member) : titleBarStrictlyMatchesMember(bar, member)
      )) || null;
    };
    const visibleBarsByMember = new Map();
    const stackedVisibleBars = [];
    const inFlowVisibleBars = [];
    const titleBarClassifications = [];
    let duplicateTitleBarsVisible = false;
    let inFlowTitleBarsVisibleWhileStackActive = 0;
    try {
      for (const bar of Array.from(document.querySelectorAll('[data-cgxui="atns-answer-title"]'))) {
        const member = canonicalMemberForBar(bar);
        const memberId = String(member?.id || '');
        if (!memberId) continue;
        const visible = isVisibleEl(bar);
        const inThisStack = !!(synthContainer && bar.closest?.(TITLE_LIST_SYNTH_SEL) === synthContainer
          && bar.getAttribute('data-h2o-in-title-stack') === String(pageNum));
        titleBarClassifications.push({
          memberId,
          turnNo: Number(bar.getAttribute('data-h2o-stack-turn-no') || bar.getAttribute('data-h2o-turn-num') || 0) || 0,
          location: inThisStack ? (visible ? 'inStack' : 'hiddenStack') : (visible ? 'inFlow' : 'hiddenFlow'),
          visible,
          inStack: inThisStack,
          detached: bar.getAttribute('data-h2o-detached-title-bar') === '1',
          washer: String(bar.getAttribute('data-h2o-title-wash') || ''),
        });
        if (!visible) continue;
        const list = visibleBarsByMember.get(memberId) || [];
        list.push({ bar, inStack: inThisStack });
        visibleBarsByMember.set(memberId, list);
        if (inThisStack) stackedVisibleBars.push(bar);
        else inFlowVisibleBars.push(bar);
      }
      duplicateTitleBarsVisible = Array.from(visibleBarsByMember.values()).some((list) => list.length > 1);
      inFlowTitleBarsVisibleWhileStackActive = titleListActive ? inFlowVisibleBars.length : 0;
    } catch {}
    // Divider/list order proof (read-only).
    let pageDividerEl = null;
    try {
      pageDividerEl = document.querySelector(`.cgxui-chat-page-divider[data-page-num="${String(pageNum)}"], .cgxui-pgnw-page-divider[data-page-num="${String(pageNum)}"]`);
    } catch {}
    const dividerBeforeSyntheticList = (pageDividerEl && synthContainer)
      ? !!(pageDividerEl.compareDocumentPosition(synthContainer) & Node.DOCUMENT_POSITION_FOLLOWING)
      : (synthContainer ? false : 'notApplicable');
    const syntheticListAnchor = (synthContainer && synthContainer.previousElementSibling === pageDividerEl)
      ? 'after-chat-page-divider'
      : (synthContainer ? 'detached-from-divider' : 'none');
    // NO ANSWER flow accounting (read-only rect checks). Count both a leaked
    // title bar and leaked orphan/Q content: a flow wrapper can remain visible
    // even after its title bar was correctly rehosted into the stack.
    let visibleInFlowNoAnswerRows = 0;
    try {
      for (const bar of Array.from(document.querySelectorAll(NO_ANSWER_TITLE_BAR_SEL))) {
        const member = canonicalMemberForBar(bar);
        if (!member || member.type === 'answer') continue;
        const inThisStack = !!(synthContainer && bar.closest?.(TITLE_LIST_SYNTH_SEL) === synthContainer);
        if (!inThisStack && isVisibleEl(bar)) visibleInFlowNoAnswerRows += 1;
      }
    } catch {}
    const orphanQuestionFlowDetails = memberDetailsAll.flatMap((member) => {
      if (member.type === 'answer') return [];
      return memberAllFlowAnchors(member).flatMap((anchor) => {
        const inlineSlot = anchor.closest?.(`[${ATTR_TITLE_INLINE_SLOT}="1"]`) || null;
        const inStack = !!anchor.closest?.(TITLE_LIST_SYNTH_SEL);
        const visible = isVisibleEl(anchor);
        if (inStack || inlineSlot || !visible) return [];
        const underList = !!(synthContainer
          && (synthContainer.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING));
        return [{
          id: member.id,
          questionId: member.questionId,
          turnNo: member.turnNo,
          anchor,
          underList,
          hasHideStamp: anchor.hasAttribute?.(ATTR_TITLE_LIST_FLOW_HIDDEN) || false,
          rect: titleListRectSnapshot(anchor),
        }];
      });
    });
    const visibleInFlowNoAnswerMembers = Array.from(new Map(
      orphanQuestionFlowDetails.map((entry) => [entry.id, entry])
    ).values());
    const orphanQuestionFlowVisible = visibleInFlowNoAnswerMembers.length;
    const orphanQuestionVisibleUnderList = visibleInFlowNoAnswerMembers.some((entry) => entry.underList);
    const noAnswerInFlowVisible = Math.max(orphanQuestionFlowVisible, visibleInFlowNoAnswerRows);
    const noAnswerRowsHiddenBySyntheticList = memberDetailsAll.filter((m) => {
      if (m.type === 'answer') return false;
      const anchors = memberAllFlowAnchors(m).filter((anchor) => !anchor.closest?.(TITLE_LIST_SYNTH_SEL));
      return anchors.length > 0 && anchors.every((anchor) => !isVisibleEl(anchor));
    }).length;
    const listedNoAnswerRows = synthRows.filter((row) => row.getAttribute('data-h2o-stack-type') === 'no-answer').length;
    // Title quality accounting.
    const rowSourceOf = (row) => String(row.getAttribute('data-h2o-title-row-source') || '');
    const rowTitleOf = (row) => String(row.querySelector?.('[data-cgxui="atns-answer-title-text"]')?.textContent || '').trim();
    const fallbackTitleRows = synthRows
      .filter((row) => row.getAttribute('data-h2o-stack-type') === 'answer'
        && (rowSourceOf(row) === 'fallback' || isSyntheticTitlePlaceholder(rowTitleOf(row))))
      .map((row) => ({
        turnNo: Number(row.getAttribute('data-h2o-stack-turn-no') || 0),
        id: row.getAttribute('data-h2o-stack-key'),
        text: rowTitleOf(row),
        source: rowSourceOf(row),
      }));
    const realTitleRows = synthRows.filter((row) => row.getAttribute('data-h2o-stack-type') === 'answer'
      && !isSyntheticTitlePlaceholder(rowTitleOf(row))
      && rowSourceOf(row) !== 'fallback').length;
    const rowsUsingFallbackDespiteKnownTitle = fallbackTitleRows.filter((entry) => {
      const member = memberDetailsAll.find((candidate) => candidate.turnNo === entry.turnNo && candidate.type === 'answer') || null;
      if (!member) return false;
      const resolved = resolveSyntheticRowTitle(member);
      return resolved.source !== 'fallback' && !isSyntheticTitlePlaceholder(resolved.text);
    });
    const openedStackRows = synthRows.filter((row) => row.getAttribute('data-h2o-title-row-opened') === '1');
    const manualOpenRows = openedStackRows.map((row) => ({
      id: row.getAttribute('data-h2o-stack-key'),
      turnNo: Number(row.getAttribute('data-h2o-stack-turn-no') || 0),
      type: row.getAttribute('data-h2o-stack-type') || 'answer',
      openedBy: row.getAttribute('data-h2o-title-row-opened-by') || '',
    }));
    const noAnswerAutoOpenedRows = manualOpenRows.filter((row) => row.type === 'no-answer' && row.openedBy !== 'dblclick');
    const noAnswerAutoOpened = noAnswerAutoOpenedRows.length > 0;
    const openedRowId = manualOpenRows[0]?.id || null;
    const titleRowSources = {
      hydratedTitleHits: synthRows.filter((row) => rowSourceOf(row) === 'hydrated').length,
      titleCacheHits: synthRows.filter((row) => rowSourceOf(row) === 'cached').length,
      metadataTitleHits: synthRows.filter((row) => rowSourceOf(row) === 'metadata').length,
      fallback: fallbackTitleRows.length,
      noAnswer: listedNoAnswerRows,
      hydrated: synthRows.filter((row) => row.getAttribute('data-h2o-title-row-hydrated') === '1').length,
      expandedByUser: manualOpenRows.length,
    };
    const washMap = (() => {
      try {
        const viaApi = WASH_PUBLIC()?.getWashMap?.();
        if (viaApi && typeof viaApi === 'object') return viaApi;
        const direct = TOPW.H2O?.MM?.washMap;
        return direct && typeof direct === 'object' ? direct : {};
      } catch { return {}; }
    })();
    const washApi = WASH_PUBLIC();
    const expectedWasherStates = memberDetailsAll.flatMap((member) => {
      if (member.type !== 'answer') return [];
      let resolved = null;
      try { resolved = washApi?.resolveForId?.(member.answerId) || null; } catch {}
      const fallbackColor = String(washMap?.[member.answerId] || '').trim().toLowerCase();
      const colorName = String(resolved?.colorName || fallbackColor).trim().toLowerCase();
      return colorName ? [{ memberId: member.id, answerId: member.answerId, turnNo: member.turnNo, colorName }] : [];
    });
    const expectedWasherMemberIds = expectedWasherStates.map((entry) => entry.memberId);
    const washerTitleBarsInStack = synthRows.filter((row) => !!String(row.getAttribute('data-h2o-title-wash') || '').trim());
    const washerTitleBarsInFlowDuplicates = inFlowVisibleBars.filter((bar) => !!String(bar.getAttribute('data-h2o-title-wash') || '').trim());
    const goldTitleBarsInStack = washerTitleBarsInStack.filter((row) => String(row.getAttribute('data-h2o-title-wash') || '').toLowerCase() === 'gold');
    const goldTitleBarsInFlowDuplicates = washerTitleBarsInFlowDuplicates.filter((row) => String(row.getAttribute('data-h2o-title-wash') || '').toLowerCase() === 'gold');
    const activeFlashRowsInStack = synthRows.filter((row) => row.getAttribute('data-cgxui-flash') === '1'
      || Array.from(row.classList || []).some((cls) => /flash|active/i.test(String(cls || ''))));
    const washerProjectionComplete = expectedWasherStates.every((expected) => {
      const member = memberDetailsAll.find((candidate) => candidate.id === expected.memberId) || null;
      return !!(member && synthRows.some((row) => (
        stackRowMatchesMember(row, member)
        && String(row.getAttribute('data-h2o-title-wash') || '').trim().toLowerCase() === expected.colorName
      )));
    });
    const openedMember = openedStackRows.length === 1
      ? memberDetailsAll.find((member) => stackRowMatchesMember(openedStackRows[0], member)) || null
      : null;
    const inlineSlots = synthContainer
      ? Array.from(synthContainer.querySelectorAll(`:scope > [${ATTR_TITLE_INLINE_SLOT}="1"]`))
      : [];
    const inlineAnchors = inlineSlots.flatMap((slot) => Array.from(slot.querySelectorAll(`[${ATTR_TITLE_STACK_INLINE}]`)));
    const openedRow = openedStackRows[0] || null;
    const openedSlot = openedRow ? getInlineSlotForRow(openedRow, synthContainer) : null;
    const openedInlineAnchors = openedSlot
      ? Array.from(openedSlot.querySelectorAll(`[${ATTR_TITLE_STACK_INLINE}]`))
      : [];
    const openedMemberAnchors = openedMember ? memberAllFlowAnchors(openedMember) : [];
    const openedSections = openedMember ? titleListMemberSections(openedMember) : null;
    const requiredOpenedSections = openedSections
      ? [openedSections.questionSection, openedMember?.type === 'answer' ? openedSections.answerSection : null].filter(Boolean)
      : [];
    const openedSectionsCovered = requiredOpenedSections.length > 0
      && requiredOpenedSections.every((section) => openedInlineAnchors.some((anchor) => anchor === section || anchor.contains?.(section)));
    const openedTurnInsideListContext = manualOpenRows.length === 0
      ? 'notApplicable'
      : !!(openedMember && openedRow && openedSlot
        && openedSlot.parentElement === synthContainer
        && openedSlot.previousElementSibling === openedRow
        && openedInlineAnchors.length > 0
        && openedSectionsCovered
        && openedInlineAnchors.every((anchor) => anchor.parentElement === openedSlot
          && anchor.getAttribute(ATTR_TITLE_STACK_INLINE) === String(pageNum)
          && openedMemberAnchors.includes(anchor))
        && inlineAnchors.every((anchor) => openedInlineAnchors.includes(anchor)));
    const otherRowsRemainCollapsed = manualOpenRows.length === 0
      ? 'notApplicable'
      : memberDetailsAll.filter((member) => member.id !== openedMember?.id).every((member) => {
          const anchors = memberAllFlowAnchors(member);
          return anchors.length > 0 && anchors.every((anchor) => !isVisibleEl(anchor));
        });
    const openedTurnsInlineInStack = inlineSlots.filter((slot) => (
      slot.querySelector?.(`[${ATTR_TITLE_STACK_INLINE}]`)
    )).length;
    const openedInlineContentCount = openedInlineAnchors.length;
    const orphanQuestionInlineVisible = openedMember?.type === 'no-answer'
      ? openedInlineAnchors.some((anchor) => isVisibleEl(anchor))
      : false;
    const doubleClickRowOpensOnlyThatTurn = manualOpenRows.length === 0
      ? 'notApplicable'
      : manualOpenRows.length === 1
        && openedTurnInsideListContext === true
        && openedTurnsInlineInStack === 1;
    const stackRectBeforeOpen = stackStats.stackRectBeforeOpen || null;
    const stackRectAfterOpen = manualOpenRows.length ? titleListRectSnapshot(synthContainer) : (stackStats.stackRectAfterOpen || null);
    const stackLayoutStable = manualOpenRows.length === 0
      ? 'notApplicable'
      : !!(stackRectBeforeOpen && stackRectAfterOpen
        && Math.abs(Number(stackRectBeforeOpen.left) - Number(stackRectAfterOpen.left)) <= 2
        && Math.abs(Number(stackRectBeforeOpen.width) - Number(stackRectAfterOpen.width)) <= 2);

    return {
      mechanismRoutes,
      visitState: {
        preference: getVisitStateMode(),
        chatId,
        currentVisitId: String(S.visitState?.currentVisitId || ''),
        resetModeActive: getVisitStateMode() === 'reset',
        resetAppliedThisVisit: !!S.visitState?.resetAppliedThisVisit,
        resetAppliedAt: Number(S.visitState?.resetAppliedAt || 0),
        clearedFamiliesOnLastReset: Number(S.visitState?.clearedFamilies || 0),
        clearedFamilyNames: Array.from(S.visitState?.clearedFamilyNames || []),
        clearedKeys: Array.from(S.visitState?.clearedKeys || []),
        skippedKeys: Array.from(S.visitState?.skippedKeys || []),
        missingChatIdDeferrals: Number(S.visitState?.missingChatIdDeferrals || 0),
        restoreSuppressedBecauseReset: !!S.visitState?.restoreSuppressedBecauseReset,
        liveStateCleared: !!S.visitState?.liveStateCleared,
        domCleanupApplied: !!S.visitState?.domCleanupApplied,
        rememberedTitleListPages: (() => { try { return localReadTitleListPagesSet(chatId)?.size || 0; } catch { return 0; } })(),
        rememberedCollapsedPages: (() => { try { return readCollapsedPages(chatId)?.size || 0; } catch { return 0; } })(),
        rememberedIntentActive: isTitleIntentEngineActive(chatId),
        sessionResets: Number(S.visitState?.resets || 0),
        lastResetApplied: !!S.visitState?.resetAppliedThisVisit,
      },
      activeIntentPages,
      activeOverrideAnswerIds,
      activeIntentSource,
      createdFromLegacyTitleList,
      createdOnChatOpen,
      legacyRelevantKeys,
      pageScopedGateResult,
      titleListActive,
      expectedPageMemberCount: members.length,
      expectedAnswerMemberCount,
      expectedNoAnswerMemberCount,
      expectedTitleRowCount,
      expectedTitleBarCount: expectedTitleRowCount,
      expectedAnswerTitleBars: expectedAnswerMemberCount,
      expectedNoAnswerTitleBars: expectedNoAnswerMemberCount,
      listedTitleRows: synthRows.length,
      listedTitleBarCount: synthRows.length,
      listedNoAnswerRows,
      listedNoAnswerTitleBars: listedNoAnswerRows,
      titleBarClassifications,
      stackedVisibleTitleBars: titleBarClassifications.filter((entry) => entry.location === 'inStack').length,
      hiddenFlowTitleBars: titleBarClassifications.filter((entry) => entry.location === 'hiddenFlow').length,
      duplicateTitleBarsVisible,
      inFlowTitleBarsVisibleWhileStackActive,
      inFlowTitleBarsVisibleWhileTitleListActive: inFlowTitleBarsVisibleWhileStackActive,
      titleNumbersInStack,
      missingTitleNumbers,
      dividerBeforeTitleStack: dividerBeforeSyntheticList,
      dividerBeforeTitleList: dividerBeforeSyntheticList,
      titleStackAnchor: syntheticListAnchor,
      titleListAnchor: syntheticListAnchor,
      // Realness proof: every listed element must be a REAL title bar — the
      // atns-owned component (relocated or produced by 1C1a's own factory).
      // No fake row selector exists as the final row implementation.
      listedRealTitleBarCount: synthRows.filter((row) => row.matches?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]')).length,
      listedTitleBarsAreRealTitleBars: synthRows.length > 0
        ? synthRows.every((row) => row.matches?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]'))
        : 'notApplicable',
      stackTitleBarSelectors: [
        '[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]',
        '[data-at-no-answer="1"] (NO ANSWER variant)',
        '[data-h2o-detached-title-bar="1"] (1C1a factory-built, pre-hydration)',
      ],
      // Styling contract proof (Active Styling / Faded Number rules).
      fadedSideNumbersPresent: synthRows.length > 0
        ? synthRows.every((row) => Number(row.getAttribute('data-h2o-turn-num') || 0) > 0)
        : 'notApplicable',
      activeTitleBarNumbersPreserved: synthRows.length > 0
        ? synthRows.every((row) => Number(row.getAttribute('data-h2o-turn-num') || 0) > 0)
        : 'notApplicable',
      washerTitleBarsInStack: washerTitleBarsInStack.length,
      washerTitleBarsInFlowDuplicates: washerTitleBarsInFlowDuplicates.length,
      washerRowsInStack: washerTitleBarsInStack.map((row) => ({
        id: titleBarMemberId(row),
        turnNo: Number(row.getAttribute('data-h2o-stack-turn-no') || 0) || 0,
        wash: row.getAttribute('data-h2o-title-wash') || '',
      })),
      expectedWasherMemberIds,
      expectedWasherStates,
      goldActiveTitleBarsInStack: goldTitleBarsInStack.length,
      goldActiveTitleBarsInFlowDuplicates: goldTitleBarsInFlowDuplicates.length,
      activeFlashState: activeFlashRowsInStack.length
        ? { state: 'active', rows: activeFlashRowsInStack.map((row) => titleBarMemberId(row)) }
        : { state: 'none', rows: [] },
      activeTitleBarStylePreserved: !titleListActive
        ? 'notApplicable'
        : (expectedWasherMemberIds.length || activeFlashRowsInStack.length)
          ? washerProjectionComplete
          : 'notApplicable',
      // Ownership map (static, documents the single-owner model).
      titleListContainerCount: synthContainers.length,
      titleListContainerIds,
      stackOwner: String(synthContainer?.getAttribute?.('data-h2o-title-stack-owner') || '1C1b:syncSyntheticTitleList'),
      activeStackId: String(synthContainer?.id || ''),
      stackBuildCount: Number(stackStats.buildCount || 0),
      stackReplaceCount: Number(stackStats.replaceCount || 0),
      stackReattachCount: Number(stackStats.reattachCount || 0),
      stackRowReplaceCount: Number(stackStats.rowReplaceCount || 0),
      stackIdentityRekeyCount: Number(stackStats.identityRekeyCount || 0),
      stackTitleUpgradeCount: Number(stackStats.titleUpgradeCount || 0),
      stackTitleDowngradePreventedCount: Number(stackStats.titleDowngradePreventedCount || 0),
      stackMutationCount: Number(stackStats.mutationCount || 0),
      stackSyncCount: Number(stackStats.syncCount || 0),
      lastStackBuildReason: String(stackStats.lastBuildReason || ''),
      lastStackReplaceReason: String(stackStats.lastReplaceReason || ''),
      lastStackReattachReason: String(stackStats.lastReattachReason || ''),
      lastStackSyncReason: String(stackStats.lastSyncReason || ''),
      lastStackMutationReason: String(stackStats.lastStackMutationReason || ''),
      firstListCreatedAt: Number(stackStats.firstListCreatedAt || 0),
      lastStackMutationAt: Number(stackStats.lastStackMutationAt || 0),
      lastListSettledAt: Number(stackStats.lastListSettledAt || 0),
      stackRectBeforeOpen,
      stackRectAfterOpen,
      stackLayoutStable,
      dividerOwner: '1A1b:forcePlaceDividerBeforeTurnWrapper (also re-anchors the stack — Divider/Stack Unit Rule)',
      inFlowHideOwner: '1C1b:setTitleListMemberFlowHidden (+ dedup in syncSyntheticTitleList)',
      stylingOwner: '1A2a washer projection + 1C1a bar CSS + 1C1b stack numeral CSS + 1A1b:flashAnswer',
      duplicateMechanismConflicts: [
        (titleListActive && synthContainers.length !== 1) ? `title-list-container-count:${synthContainers.length}` : null,
        duplicateTitleBarsVisible ? 'duplicate-title-bars-visible' : null,
        inFlowTitleBarsVisibleWhileStackActive > 0 ? 'in-flow-member-bars-visible-while-stack-active' : null,
        noAnswerInFlowVisible > 0 ? 'no-answer-flow-visible-while-stack-active' : null,
        orphanQuestionVisibleUnderList ? 'orphan-question-visible-under-title-list' : null,
        noAnswerAutoOpened ? 'no-answer-row-opened-without-explicit-dblclick' : null,
        (titleListActive && dividerBeforeSyntheticList !== true) ? 'stack-above-divider' : null,
        openedTurnInsideListContext === false ? 'opened-turn-outside-list-context' : null,
        stackLayoutStable === false ? 'stack-horizontal-layout-shifted-after-open' : null,
      ].filter(Boolean),
      openedTitleNumber: manualOpenRows[0]?.turnNo || null,
      openedTurnsInlineInStack,
      openedInlineContentCount,
      openedTurnInsideListContext,
      doubleClickRowOpensOnlyThatTurn,
      pageRemainsInTitleListMode: manualOpenRows.length === 0 ? 'notApplicable' : titleListActive === true,
      otherRowsRemainCollapsed,
      noAnswerInStack: listedNoAnswerRows,
      noAnswerInFlowVisible,
      orphanQuestionFlowVisible,
      orphanQuestionVisibleUnderList,
      orphanQuestionInlineVisible,
      orphanQuestionFlowDetails: visibleInFlowNoAnswerMembers.map((entry) => ({
        id: entry.id,
        turnNo: entry.turnNo,
        questionId: entry.questionId,
        underList: entry.underList,
        hasHideStamp: entry.hasHideStamp,
        rect: entry.rect,
      })),
      noAnswerAutoOpened,
      noAnswerAutoOpenedRows,
      visibleInFlowNoAnswerMembers: visibleInFlowNoAnswerMembers.map((entry) => ({
        id: entry.id,
        turnNo: entry.turnNo,
        questionId: entry.questionId,
      })),
      visibleInFlowNoAnswerRows,
      noAnswerRowsHiddenBySyntheticList,
      missingTitleRows,
      titleRowSources,
      fallbackTitleRows,
      realTitleRows,
      rowsUsingFallbackDespiteKnownTitle,
      dividerBeforeSyntheticList,
      syntheticListAnchor,
      dividerPage: Number(pageDividerEl?.getAttribute?.('data-page-num') || 0) || null,
      syntheticListPage: Number(synthContainer?.getAttribute?.('data-page-num') || 0) || null,
      manualOpenRows,
      manualOverrideRows: activeOverrideAnswerIds,
      openedRowId,
      openedRowStillVisible: openedRowId
        ? !!(openedInlineAnchors.length
          && openedInlineAnchors.every((anchor) => anchor.isConnected
            && anchor.parentElement === openedSlot
            && isVisibleEl(anchor)))
        : 'notApplicable',
      onlyOneTurnOpened: manualOpenRows.length ? manualOpenRows.length === 1 : 'notApplicable',
      moduleAvailable: true,
      ledgerKey: keyTitleIntentLedger(chatId),
      ledgerRev: ledger.rev,
      chatId,
      pageNum,
      pageIntent,
      pageExists,
      reasonIfNoMembers,
      availablePages,
      activeIntentCount,
      activeOverrideCount,
      isIntentSystemInert,
      pageHasIntent,
      titleIntentActive: !isIntentSystemInert,
      canonicalMembers: members.length,
      canonicalPageMembers: members,
      rowsHydrated: hydratedMembers.length,
      hydrated: hydratedMembers.length,
      unhydrated: unhydratedMembers.length,
      hydratedCount: hydratedMembers.length,
      unhydratedCount: unhydratedMembers.length,
      hydratedMembers,
      unhydratedMembers,
      members: memberDetails,
      manualOverrides,
      replayRuns: counters.replayRuns,
      replayNoops: counters.replayNoops,
      replaySkippedInert: counters.replaySkippedInert,
      replayReentrantSkips: counters.replayReentrantSkips,
      titleSetEventsSeen: counters.titleSetEventsSeen,
      targetedApplies: counters.targetedApplies,
      fullPageApplies: counters.fullPageApplies,
      counters,
      pass: {
        durablePageIntentExists: pageHasIntent ? true : 'notApplicable',
        canonicalPageMembershipUsed: !pageExists ? 'notApplicable' : members.length > 0,
        allHydratedMembersObeyResolver: !pageHasIntent ? 'notApplicable' : memberDetails.filter((m) => m.hydrated).every((m) => m.obeysResolver),
        unhydratedMembersNotDropped: !pageHasIntent ? 'notApplicable' : members.length > 0 && unhydratedMembers.every((answerId) => members.includes(answerId)),
        noVisibleOnlyPartialCollapse: !pageHasIntent ? 'notApplicable' : members.length > 0 && members.length >= hydratedMembers.length,
        expandSupersedesCollapse: !pageHasIntent ? 'notApplicable' : pageIntent.state !== 'expanded' || !staleManualWinning,
        staleRevDoesNotBeatNewerRev: !pageHasIntent && !activeOverrideCount ? 'notApplicable' : !staleManualWinning,
        manualOverridesAreExplicit: activeOverrideCount <= 0 ? 'notApplicable' : manualOverrides.every((entry) => !!entry.answerId && Number(entry.rev || 0) > 0 && !!entry.source),
        legacyKeysDidNotArmIntent: createdFromLegacyTitleList === false,
        titleListRowsComplete: !titleListActive
          ? 'notApplicable'
          : (expectedTitleRowCount > 0 && synthRows.length >= expectedTitleRowCount && missingTitleRows.length === 0),
        dividerBeforeSyntheticList: !titleListActive ? 'notApplicable' : dividerBeforeSyntheticList === true,
        noInFlowNoAnswerLeakWhileSyntheticListActive: !titleListActive
          ? 'notApplicable'
          : visibleInFlowNoAnswerRows === 0
            && noAnswerInFlowVisible === 0
            && orphanQuestionFlowVisible === 0
            && orphanQuestionVisibleUnderList === false,
        noNoAnswerAutoOpen: !titleListActive ? 'notApplicable' : noAnswerAutoOpened === false,
        oneTitleListContainer: !titleListActive
          ? 'notApplicable'
          : synthContainers.length === 1,
        noFallbackWhereRealTitleKnown: !titleListActive
          ? 'notApplicable'
          : rowsUsingFallbackDespiteKnownTitle.length === 0,
        doubleClickRowOpensOnlyThatTurn,
        pageRemainsInTitleListMode: manualOpenRows.length === 0
          ? 'notApplicable'
          : titleListActive === true,
        otherRowsRemainCollapsed,
        openedTurnInsideListContext,
        stackLayoutStable,
        noDuplicateTitleBarsVisible: !pageExists ? 'notApplicable' : duplicateTitleBarsVisible === false,
        noInFlowTitleBarsWhileStackActive: !titleListActive ? 'notApplicable' : inFlowTitleBarsVisibleWhileStackActive === 0,
        noMissingTitleNumbers: !titleListActive ? 'notApplicable' : missingTitleNumbers.length === 0,
        listedTitleBarsAreRealTitleBars: !titleListActive
          ? 'notApplicable'
          : (synthRows.length > 0 && synthRows.every((row) => row.matches?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"]'))),
        fadedSideNumbersPresent: !titleListActive
          ? 'notApplicable'
          : synthRows.every((row) => Number(row.getAttribute('data-h2o-turn-num') || 0) > 0),
        activeTitleBarStylePreserved: !titleListActive
          ? 'notApplicable'
          : (expectedWasherMemberIds.length || activeFlashRowsInStack.length)
            ? washerProjectionComplete
            : 'notApplicable',
        washerStylePreserved: !titleListActive || !expectedWasherMemberIds.length
          ? 'notApplicable'
          : washerProjectionComplete,
        noMechanismConflicts: !titleListActive
          ? 'notApplicable'
          : (synthContainers.length === 1
            && !duplicateTitleBarsVisible
            && inFlowTitleBarsVisibleWhileStackActive === 0
            && noAnswerInFlowVisible === 0
            && orphanQuestionFlowVisible === 0
            && orphanQuestionVisibleUnderList === false
            && noAnswerAutoOpened === false
            && dividerBeforeSyntheticList === true
            && openedTurnInsideListContext !== false
            && stackLayoutStable !== false),
      },
    };
  }

  function shouldRefreshOnPaginationConfigChanged(reason = '') {
    const why = String(reason || '').trim();
    switch (why) {
      case 'cfg:pwPageSize':
      case 'cfg:pwBufferAnswers':
      case 'cfg:diag':
      case 'cfg:pwAutoLoadSentinel':
      case 'cfg:pwShortcutsEnabled':
        return false;
      default:
        return true;
    }
  }

  function bind() {
    if (S.listenersBound) {
      S.bound = true;
      return { ok: true, status: 'already-bound', chatId: String(S.chatId || resolveChatId()).trim() };
    }

    S.onDividerDblClick = (ev) => {
      clearDividerClickTimer();
      try { TAGS_API()?.closeTagsCloudPopup?.(); } catch {}
      const dot = ev?.target?.closest?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot');
      if (dot) return;
      const divider = ev?.target?.closest?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider');
      if (!divider) return;
      const pageNum = getDividerPageNum(divider);
      if (!pageNum) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      const chatId = resolveChatId();
      const nextCollapsed = !isPageCollapsed(pageNum, chatId);
      const routed = CM_ROUTER_API()?.routeChatPageDividerDblClick?.({
        pageNum,
        chatId,
        dividerEl: divider,
        pageAnswerIds: getPageAnswerIds(pageNum, chatId),
        currentCollapsed: !nextCollapsed,
        nextCollapsed,
        owner: {
          setPageCollapsed,
        },
      });
      if (routed?.handled === true) return;
      try { togglePageCollapsed(pageNum, { chatId: resolveChatId(), source: 'chat-page-divider:dblclick' }); } catch {}
    };

    S.onDividerClick = (ev) => {
      if (Number(ev?.detail || 1) > 1) return;
      const dot = ev?.target?.closest?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot');
      if (dot) return;
      const divider = ev?.target?.closest?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider');
      if (!divider) return;
      const pageNum = getDividerPageNum(divider);
      if (!pageNum) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      clearDividerClickTimer();
      S.dividerClickTimer = W.setTimeout(() => {
        S.dividerClickTimer = null;
        openTagsCloudFromDivider(divider);
      }, 180);
    };

    S.onDividerDotClick = (ev) => {
      if (Number(ev?.detail || 1) > 1) return;
      const dot = ev?.target?.closest?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot');
      if (!dot) return;
      const divider = dot.closest?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider');
      if (!divider) return;
      const pageNum = getDividerPageNum(divider);
      if (!pageNum) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      const chatId = resolveChatId();
      const answerIds = getAuthoritativePageAnswerIds(pageNum, chatId);
      // Deterministic mass action: resolve over canonical page membership and
      // the durable intent ledger, not the current hydrated title-bar subset.
      const intentSummary = getResolvedPageTitleIntentSummary(pageNum, chatId);
      const nextEnabled = !intentSummary.allCollapsed;
      writePageTitleIntent(pageNum, nextEnabled ? 'collapsed' : 'expanded', {
        chatId,
        answerIds,
        source: 'chat-page-divider:circle',
      });
      // A newer page intent supersedes older per-row open projections. Return
      // any inline Q+A wrappers to flow before the resolved batch runs; the
      // stack sync below will then hide or release them deterministically.
      resetOpenedTitleListRows(pageNum);
      const routed = CM_ROUTER_API()?.routeChatPageDotClick?.({
        pageNum,
        chatId,
        dividerEl: divider,
        pageAnswerIds: answerIds,
        nextEnabled,
      });

      const routerHandledEngineBatch = routed?.handled === true
        && routed?.backend === 'engine'
        && /^batch-(collapse|expand)-page$/.test(String(routed?.action || ''));
      const routerAttemptedEngineBatch = routed?.handled === false
        && routed?.backend === 'engine'
        && /^(batch-toggle-unavailable|batch-(collapse|expand)-failed)$/.test(String(routed?.action || ''));

      if (routed?.handled === true) {
        setTitleListMode(pageNum, nextEnabled, {
          chatId,
          source: 'chat-page-divider:dot',
          animate: false,
          skipAnswerBatch: routerHandledEngineBatch,
        });
        return;
      }
      // Legacy fallback: batch toggle via Title Bar API (normal answer rows only)
      const at = AT_PUBLIC();
      let legacyBatchApplied = false;
      if (at?.setCollapsed) {
        S.titleListBatchDepth += 1;
        try {
          for (const answerId of answerIds) {
            try { at.setCollapsed(answerId, nextEnabled, { animate: false, source: 'chat-page-divider:dot' }); } catch {}
          }
          legacyBatchApplied = true;
        } finally {
          S.titleListBatchDepth = Math.max(0, S.titleListBatchDepth - 1);
          if (!S.titleListBatchDepth) S.titleListBatchDirty = false;
        }
      }
      setTitleListMode(pageNum, nextEnabled, {
        chatId,
        source: 'chat-page-divider:dot',
        animate: false,
        skipAnswerBatch: routerAttemptedEngineBatch || legacyBatchApplied,
      });
    };

    S.onAnswerCollapse = (ev) => {
      const answerId = String(ev?.detail?.answerId || '').trim();
      if (!answerId) return;
      // Page-circle legacy fallback updates every row synchronously, then the
      // page owner performs one state/stack/render commit. Re-entering here
      // once per row was the second repair cadence that replaced the first
      // list-like state and raced washer/NO ANSWER projection.
      if (S.titleListBatchDepth > 0) {
        S.titleListBatchDirty = true;
        return;
      }
      const chatId = resolveChatId();
      try { MM_CORE_PAGES()?.renderDividers?.(chatId); } catch {}
      scheduleDividerVisualRefresh(chatId);
    };

    S.onTitleSet = (ev) => {
      incTitleIntentStat('titleSetEventsSeen');
      const answerId = String(ev?.detail?.answerId || '').trim();
      if (!answerId) return;
      const chatId = resolveChatId();
      // O(1) gates FIRST. Title-set events fire for every bar during chat
      // open; nothing heavier than cached-ledger checks and title-list/page
      // set lookups may run before we know a page is actually collapsed,
      // title-listed, or intent-active. In the fully idle state this handler
      // must do zero row scans and zero DOM work.
      const engineActive = isTitleIntentEngineActive(chatId);
      const hasCollapsedPages = (readCollapsedPages(chatId)?.size || 0) > 0;
      const hasTitleListPages = (readTitleListPages(chatId)?.size || 0) > 0;
      if (!engineActive && !hasCollapsedPages && !hasTitleListPages) {
        incTitleIntentStat('replaySkippedInert');
        return;
      }
      const ledger = readTitleIntentLedger(chatId);
      const row = findRowByAnswerId(answerId);
      const pageNum = Math.max(0, Number(row?.pageNum
        || (engineActive ? getTitleIntentPageForAnswerFromLedger(answerId, ledger) : 0)
        || (engineActive ? findPageForAnswerId(answerId) : 0)
        || 0) || 0);
      if (!pageNum) return;
      if (engineActive && titleIntentPageHasActiveState(pageNum, ledger)) {
        applyTitleIntentToAnswer(answerId, { chatId, page: pageNum, animate: false, ledger });
        if (S.titleIntentReplayInFlight) return;
      }
      const pageCollapsed = isPageCollapsed(pageNum, chatId);
      const titleListActive = isTitleListActive(pageNum, chatId);
      if (!pageCollapsed && !titleListActive) return;
      // A title-set event is a hydration signal, not a page gesture. Repair
      // only this page's canonical stack and never replay the page-level
      // collapse executors or rebuild the stack twice.
      if (titleListActive) scheduleActiveTitleListRepair('title-set', 0, pageNum);
      if (pageCollapsed) applyPageCollapsedVisuals(pageNum, { chatId, source: 'chat-pages-controller:title-set' });
    };

    S.onCoreIndexUpdated = () => {
      const chatId = resolveChatId();
      const cached = S.titleListPagesByChat.get(chatId);
      if (cached instanceof Set && cached.size === 0) return;
      if (!(cached instanceof Set) && readTitleListPages(chatId).size === 0) return;
      scheduleActiveTitleListRepair('core-index-updated', 16);
    };

    S.onPaginationPageChanged = () => {
      try { refreshAll(resolveChatId()); } catch {}
    };

    S.onPaginationConfigChanged = (ev) => {
      const reason = String(ev?.detail?.reason || '').trim();
      if (!shouldRefreshOnPaginationConfigChanged(reason)) return;
      try { setTimeout(() => { try { refreshAll(resolveChatId()); } catch {} }, 80); } catch {}
    };

    S.onRouteChanged = () => {
      try {
        W.setTimeout(() => {
          const id = resolveVisitChatId();
          if (!id) {
            S.visitState.currentChatId = '';
            S.visitState.currentVisitId = '';
            scheduleDeferredVisitRefresh('route-change');
            return;
          }
          if (id === S.visitState.currentChatId) return;
          try { refreshAll(id, { reason: 'route-change', forceNewVisit: true }); } catch {}
        }, 0);
      } catch {}
    };

    S.onVisitStateModeChanged = (ev) => {
      const mode = String(ev?.detail?.mode || getVisitStateMode()).trim().toLowerCase();
      if (mode !== 'reset') {
        S.visitState.lastMode = 'remember';
        S.visitState.restoreSuppressedBecauseReset = false;
        return;
      }
      const id = resolveVisitChatId();
      if (!id) {
        scheduleDeferredVisitRefresh('preference-reset');
        return;
      }
      try {
        maybeApplyVisitStatePolicy(id, {
          forceReset: true,
          reason: 'preference-switched-to-reset',
        });
      } catch {}
    };

    S.onMiniMapTogglePageCollapsed = (ev) => {
      const pageNum = Math.max(1, Number(ev?.detail?.pageNum || 0) || 0);
      if (!pageNum) return;
      const source = String(ev?.detail?.source || 'minimap-local').trim() || 'minimap-local';
      try { MM_CORE_PAGES()?.toggleMiniMapPageCollapsed?.(pageNum, '', { source, propagate: false }); } catch {}
    };

    document.addEventListener('dblclick', S.onDividerDblClick, true);
    window.addEventListener('click', S.onDividerClick, true);
    window.addEventListener('click', S.onDividerDotClick, true);
    window.addEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged);
    window.addEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse);
    window.addEventListener(EV_TITLE_SET, S.onTitleSet);
    window.addEventListener(EV_CORE_INDEX_UPDATED, S.onCoreIndexUpdated);
    window.addEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed);
    window.addEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged);
    window.addEventListener(EV_ROUTE_CHANGED, S.onRouteChanged, true);
    window.addEventListener(EV_VISIT_STATE_MODE_CHANGED, S.onVisitStateModeChanged, true);
    window.addEventListener('popstate', S.onRouteChanged, true);
    window.addEventListener('hashchange', S.onRouteChanged, true);
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged);
    }

    S.listenersBound = true;
    S.bound = true;
    S.chatId = resolveChatId();
    ensureDividerStyle();
    try { refreshAll(S.chatId, { reason: 'bind' }); } catch {}
    scheduleDividerVisualRefresh(S.chatId, 0);
    return { ok: true, status: 'bound', chatId: S.chatId };
  }

  function unbind() {
    clearDividerClickTimer();
    try { document.removeEventListener('dblclick', S.onDividerDblClick, true); } catch {}
    try { window.removeEventListener('click', S.onDividerClick, true); } catch {}
    try { window.removeEventListener('click', S.onDividerDotClick, true); } catch {}
    try { window.removeEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged); } catch {}
    try { window.removeEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse); } catch {}
    try { window.removeEventListener(EV_TITLE_SET, S.onTitleSet); } catch {}
    try { window.removeEventListener(EV_CORE_INDEX_UPDATED, S.onCoreIndexUpdated); } catch {}
    try { window.removeEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed); } catch {}
    try { window.removeEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged); } catch {}
    try { window.removeEventListener(EV_ROUTE_CHANGED, S.onRouteChanged, true); } catch {}
    try { window.removeEventListener(EV_VISIT_STATE_MODE_CHANGED, S.onVisitStateModeChanged, true); } catch {}
    try { window.removeEventListener('popstate', S.onRouteChanged, true); } catch {}
    try { window.removeEventListener('hashchange', S.onRouteChanged, true); } catch {}
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      try { window.removeEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged); } catch {}
    }
    S.onDividerDblClick = null;
    S.onDividerClick = null;
    S.onDividerDotClick = null;
    S.onAnswerCollapse = null;
    S.onTitleSet = null;
    S.onCoreIndexUpdated = null;
    S.onPaginationPageChanged = null;
    S.onPaginationConfigChanged = null;
    S.onMiniMapTogglePageCollapsed = null;
    S.onRouteChanged = null;
    S.onVisitStateModeChanged = null;
    if (S.visitState.deferredTimer) {
      try { W.clearTimeout(S.visitState.deferredTimer); } catch {}
      S.visitState.deferredTimer = 0;
    }
    clearDividerRefreshTimer();
    if (S.titleListRepairTimer) {
      try { W.clearTimeout(S.titleListRepairTimer); } catch {}
      S.titleListRepairTimer = 0;
    }
    S.titleListRepairPages.clear();
    S.titleListRepairAllPages = false;
    S.listenersBound = false;
    S.bound = false;
    return { ok: true, status: 'unbound', chatId: String(S.chatId || '').trim() };
  }

  function registerBridge() {
    const SH = MM_SH();
    if (!SH) return null;
    SH.api = SH.api || Object.create(null);
    SH.api.mm = SH.api.mm || Object.create(null);
    const api = Object.freeze({
      ver: '2.2.5',
      boot,
      dispose,
      bind,
      unbind,
      refreshAll,
      readCollapsedPages,
      writeCollapsedPages,
      readTitleListPages,
      writeTitleListPages,
      isPageCollapsed,
      isTitleListActive,
      setTitleListMode,
      setPageCollapsed,
      togglePageCollapsed,
      getTitleState,
      getDividerUiMode,
      resetAllMechanisms,
      resetPageTitleStateForCurrentChat: resetAllMechanisms,
      resetCurrentChatOutline: resetAllMechanisms,
      clearVisitStateForCurrentChat,
      applyPageVisuals,
      applyPageCollapsedVisuals,
      applyDividerVisualsToDivider,
      readTitleIntentLedger,
      writePageTitleIntent,
      recordManualTitleOverride,
      resolveDesiredTitleState,
      applyTitleIntentToAnswer,
      applyTitleIntentToPage,
      titleIntentDebugSnapshot,
      isTitleIntentSystemInert: (chatId = '') => !isTitleIntentEngineActive(chatId),
      // O(1) cached gate — THE check every consumer must make before any
      // title-intent work. No storage IO, no allocation.
      isTitleIntentEngineActive,
      noteTitleIntentStat: incTitleIntentStat,
      getTitleIntentStats,
      getState,
      getPageDividerDebugState,
    });
    SH.api.mm.chatPagesCtl = api;
    try {
      TOPW.H2O = TOPW.H2O || {};
      TOPW.H2O.ChatPageTitleIntent = TOPW.H2O.ChatPageTitleIntent || {};
      TOPW.H2O.ChatPageTitleIntent.api = api;
      W.H2O_TITLE_INTENT_DEBUG = {
        snapshot: titleIntentDebugSnapshot,
        resolve: resolveDesiredTitleState,
        clearVisitStateForCurrentChat,
      };
      TOPW.H2O_TITLE_INTENT_DEBUG = W.H2O_TITLE_INTENT_DEBUG;
    } catch {}
    return SH.api.mm.chatPagesCtl;
  }

  function boot() {
    registerBridge();
    ensureDividerStyle();
    S.booted = true;
    S.chatId = resolveChatId();
    const bindResult = bind();
    return { ok: !!bindResult?.ok, status: bindResult?.status || 'booted', chatId: S.chatId };
  }

  function dispose() {
    unbind();
    try { S.dividerStyleEl?.remove?.(); } catch {}
    S.dividerStyleEl = null;
    S.booted = false;
    S.chatId = '';
    return { ok: true, status: 'disposed' };
  }

  boot();
})();
