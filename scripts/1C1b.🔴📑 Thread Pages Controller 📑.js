// ==UserScript==
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
// ==/UserScript==

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
  const EV_MM_TOGGLE_PAGE_COLLAPSED = 'evt:h2o:minimap:toggle-page-collapsed';
  const ATTR_CHAT_PAGE_HIDDEN = 'data-cgxui-chat-page-hidden';
  const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
  const ATTR_CHAT_PAGE_TITLE_ITEM = 'data-cgxui-chat-page-title-item';
  const ATTR_CHAT_PAGE_QUESTION_HIDDEN = 'data-cgxui-chat-page-question-hidden';
  const ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN = 'data-cgxui-chat-page-no-answer-question-hidden';
  const ANSWER_TITLE_COLLAPSED_ATTR = 'data-at-collapsed';
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
    onDividerDotClick: null,
    onAnswerCollapse: null,
    onTitleSet: null,
    onPaginationPageChanged: null,
    onPaginationConfigChanged: null,
    onMiniMapTogglePageCollapsed: null,
    dividerVisualTimer: null,
    dividerVisualRefreshToken: 0,
    dividerStyleEl: null,
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

  function CM_ROUTER_API() {
    try { return TOPW.H2O?.CM?.chtmech?.api || null; } catch { return null; }
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

  function getRows(pageNum = 0, chatId = '') {
    try { return MM_CORE_PAGES()?.getRows?.(pageNum, chatId) || []; } catch { return []; }
  }

  function getPageAnswerIds(pageNum = 0, chatId = '') {
    return Array.from(new Set(
      getRows(pageNum, chatId)
        .filter((row) => !row?.noAnswer)
        .map((row) => String(row?.answerId || '').trim())
        .filter(Boolean)
    ));
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
    try { return MM_CORE_PAGES()?.getSections?.(chatId) || { sections: new Map(), allHosts: [] }; } catch { return { sections: new Map(), allHosts: [] }; }
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
    try { return MM_CORE_PAGES()?.findRowByAnswerId?.(answerId) || null; } catch { return null; }
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
    return host;
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

  function applyTitleListVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const active = isTitleListActive(num, id);
    const rows = getRows(num, id);
    const at = AT_PUBLIC();
    const um = UM_PUBLIC();
    const routes = getConfiguredDividerRoutes();
    const driver = routes.dividerDotRoute === 'engine/unmount' ? 'engine' : 'legacy';
    const answerIds = normalizeAnswerIds(getPageAnswerIds(num, id));

    if (answerIds.length) {
      if (driver === 'engine') {
        try {
          if (active && typeof um?.collapseManyByIds === 'function') {
            um.collapseManyByIds(answerIds, {
              source: 'answer-title',
              preserveShell: 'answer-title',
              emitLegacyAnswerCollapse: false,
            });
          } else if (!active && typeof um?.expandManyByIds === 'function') {
            um.expandManyByIds(answerIds, {
              source: 'answer-title',
              emitLegacyAnswerCollapse: false,
            });
          }
        } catch {}
      } else if (at?.setCollapsed) {
        for (const answerId of answerIds) {
          try { at.setCollapsed(answerId, !!active, { animate: false, source: 'chat-pages-controller:title-list' }); } catch {}
        }
      }
    }

    for (const row of rows) {
      if (row.noAnswer) {
        applyNoAnswerTitleCollapsedDom(row.answerHost, !!active, {
          animate: opts?.animate === true,
          bar: row.titleBar,
          questionHost: row.questionHost,
        });
      } else {
        setQuestionHostTitleListHidden(row.questionHost, !!active);
      }
    }
    if (!active) sweepQuestionHostRestore();
    return { ok: true, status: 'ok', chatId: id, pageNum: num, rows: rows.length, active, driver };
  }

  function setTitleListMode(pageNum = 0, enabled = false, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const source = String(opts?.source || 'chat-pages-controller:title-list').trim() || 'chat-pages-controller:title-list';
    const next = localReadTitleListPagesSet(id);
    if (enabled) next.add(num); else next.delete(num);
    localWriteTitleListPagesSet(id, Array.from(next));
    const visual = applyTitleListVisuals(num, { chatId: id, source, animate: opts?.animate });
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
    scheduleDividerVisualRefresh(id, 0);
    return { ok: titleResult?.ok !== false && pageResult?.ok !== false, status: 'ok', chatId: id, pageNum: num, titleResult, pageResult };
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

    for (const pageNum of pageNums) {
      for (const row of getRows(pageNum, id)) {
        const aId = String(row?.answerId || '').trim();
        if (aId && !row?.noAnswer) answerIds.add(aId);
      }
    }

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
      try { pg.teardownRuntimeSession('thread-pages-controller:reset-all-mechanisms', { preserveApi: true }); } catch {}
    }

    // 2) Remount background-unmounted turns first so later hard-expands can take over mounted DOM reliably.
    if (typeof um?.remountAll === 'function') {
      try { um.remountAll('thread-pages-controller:reset-all-mechanisms'); } catch {}
    }

    // 3) Clear every manual Unmount collapse source for this chat, not only answer-title.
    //    This is critical because page divider dblclick may collapse with source 'page-collapse'.
    if (typeof um?.expandManyByIds === 'function' && answerIds.size) {
      try {
        um.expandManyByIds(Array.from(answerIds), {
          emitLegacyAnswerCollapse: true,
        });
      } catch {}
    }

    // 4) Clear Turn Title Bar local/dom residue for mounted rows in the current thread.
    if (typeof at?.resetCollapsedForCurrentChat === 'function') {
      try { at.resetCollapsedForCurrentChat({ animate: false, answerIds: Array.from(answerIds) }); } catch {}
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
    S.titleListPagesByChat.set(id, new Set());
    S.collapsedPageDriversByChat.delete(id);
    S.collapsedPageModesByChat.delete(id);
    for (const pageNum of pageNums) {
      restoreDetachedPageHosts(pageNum, id);
      applyPageVisuals(pageNum, { chatId: id, source: 'reset-all-mechanisms' });
    }

    // 7) Final sweep: remove residual hidden question/title-list state, then rebuild dividers from clean chat state.
    sweepQuestionHostRestore();
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    return {
      ok: true,
      status: 'ok',
      chatId: id,
      pages: pageNums.length,
      answers: answerIds.size,
      manualCollapsed: manualCollapsedIds.size,
    };
  }

  function refreshAll(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const pageNums = collectKnownPageNums(id);
    for (const pageNum of pageNums) {
      applyPageVisuals(pageNum, { chatId: id, source: 'chat-pages-controller:refresh' });
    }
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    scheduleDividerVisualRefresh(id, 0);
    return { ok: true, status: 'refreshed', chatId: id, pages: pageNums };
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
      const nextEnabled = !isDividerTitleCollapsed(pageNum, chatId);
      const answerIds = getPageAnswerIds(pageNum, chatId);
      const routed = CM_ROUTER_API()?.routeChatPageDotClick?.({
        pageNum,
        chatId,
        dividerEl: divider,
        pageAnswerIds: answerIds,
        nextEnabled,
      });

      if (routed?.handled === true) {
        setTitleListMode(pageNum, nextEnabled, { chatId, source: 'chat-page-divider:dot', animate: false });
        return;
      }
      // Legacy fallback: batch toggle via Title Bar API (normal answer rows only)
      const at = AT_PUBLIC();
      if (at?.setCollapsed) {
        for (const answerId of answerIds) {
          try { at.setCollapsed(answerId, nextEnabled, { animate: false, source: 'chat-page-divider:dot' }); } catch {}
        }
      }
      setTitleListMode(pageNum, nextEnabled, { chatId, source: 'chat-page-divider:dot', animate: false });
    };

    S.onAnswerCollapse = (ev) => {
      const answerId = String(ev?.detail?.answerId || '').trim();
      if (!answerId) return;
      const chatId = resolveChatId();
      try { MM_CORE_PAGES()?.renderDividers?.(chatId); } catch {}
      scheduleDividerVisualRefresh(chatId);
    };

    S.onTitleSet = (ev) => {
      const answerId = String(ev?.detail?.answerId || '').trim();
      if (!answerId) return;
      const chatId = resolveChatId();
      const row = findRowByAnswerId(answerId);
      if (!row) return;
      const pageNum = Math.max(1, Number(row?.pageNum || 0) || 0);
      if (!pageNum) return;
      if (!isPageCollapsed(pageNum, chatId) && !isTitleListActive(pageNum, chatId)) return;
      applyPageVisuals(pageNum, { chatId, source: 'chat-pages-controller:title-set', animate: false });
    };

    S.onPaginationPageChanged = () => {
      try { refreshAll(resolveChatId()); } catch {}
    };

    S.onPaginationConfigChanged = (ev) => {
      const reason = String(ev?.detail?.reason || '').trim();
      if (!shouldRefreshOnPaginationConfigChanged(reason)) return;
      try { setTimeout(() => { try { refreshAll(resolveChatId()); } catch {} }, 80); } catch {}
    };

    S.onMiniMapTogglePageCollapsed = (ev) => {
      const pageNum = Math.max(1, Number(ev?.detail?.pageNum || 0) || 0);
      if (!pageNum) return;
      const source = String(ev?.detail?.source || 'minimap-local').trim() || 'minimap-local';
      try { MM_CORE_PAGES()?.toggleMiniMapPageCollapsed?.(pageNum, '', { source, propagate: false }); } catch {}
    };

    document.addEventListener('dblclick', S.onDividerDblClick, true);
    window.addEventListener('click', S.onDividerDotClick, true);
    window.addEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged);
    window.addEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse);
    window.addEventListener(EV_TITLE_SET, S.onTitleSet);
    window.addEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed);
    window.addEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged);
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged);
    }

    S.listenersBound = true;
    S.bound = true;
    S.chatId = resolveChatId();
    ensureDividerStyle();
    try { refreshAll(S.chatId); } catch {}
    scheduleDividerVisualRefresh(S.chatId, 0);
    return { ok: true, status: 'bound', chatId: S.chatId };
  }

  function unbind() {
    try { document.removeEventListener('dblclick', S.onDividerDblClick, true); } catch {}
    try { window.removeEventListener('click', S.onDividerDotClick, true); } catch {}
    try { window.removeEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged); } catch {}
    try { window.removeEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse); } catch {}
    try { window.removeEventListener(EV_TITLE_SET, S.onTitleSet); } catch {}
    try { window.removeEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed); } catch {}
    try { window.removeEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged); } catch {}
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      try { window.removeEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged); } catch {}
    }
    S.onDividerDblClick = null;
    S.onDividerDotClick = null;
    S.onAnswerCollapse = null;
    S.onTitleSet = null;
    S.onPaginationPageChanged = null;
    S.onPaginationConfigChanged = null;
    S.onMiniMapTogglePageCollapsed = null;
    clearDividerRefreshTimer();
    S.listenersBound = false;
    S.bound = false;
    return { ok: true, status: 'unbound', chatId: String(S.chatId || '').trim() };
  }

  function registerBridge() {
    const SH = MM_SH();
    if (!SH) return null;
    SH.api = SH.api || Object.create(null);
    SH.api.mm = SH.api.mm || Object.create(null);
    SH.api.mm.chatPagesCtl = Object.freeze({
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
      applyPageVisuals,
      applyPageCollapsedVisuals,
      applyDividerVisualsToDivider,
      getState,
      getPageDividerDebugState,
    });
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