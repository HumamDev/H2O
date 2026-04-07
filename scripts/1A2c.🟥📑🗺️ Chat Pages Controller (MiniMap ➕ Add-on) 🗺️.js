// ==UserScript==
// @h2o-id             1a2c.chat.pages.controller
// @name               1A2c.🟥📑🗺️ Chat Pages Controller (MiniMap ➕ Add-on) 🗺️
// @namespace          H2O.Premium.CGX.chat.pages.controller
// @author             HumamDev
// @version            1.0.0
// @revision           004
// @build              260405-000300
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
  const EV_MM_TOGGLE_PAGE_COLLAPSED = 'evt:h2o:minimap:toggle-page-collapsed';
  const KEY_TITLE_LIST_PAGES = 'h2o:prm:cgx:mnmp:state:titlelist:pages:v1';

  const ATTR_CHAT_PAGE_HIDDEN = 'data-cgxui-chat-page-hidden';
  const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';
  const ATTR_CHAT_PAGE_TITLE_ITEM = 'data-cgxui-chat-page-title-item';
  const ATTR_CHAT_PAGE_QUESTION_HIDDEN = 'data-cgxui-chat-page-question-hidden';
  const ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN = 'data-cgxui-chat-page-no-answer-question-hidden';
  const ANSWER_TITLE_COLLAPSED_ATTR = 'data-at-collapsed';
  const ANSWER_TITLE_ICON_SEL = '[data-cgxui="atns-answer-title-icon"][data-cgxui-owner="atns"]';
  const TITLE_LIST_ROW_GAP_PX = 4;
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
    titleListDriversByChat: new Map(),
    bridgeOff: null,
    listenersBound: false,
    lastAppliedChatId: '',
    onDividerDblClick: null,
    onDividerDotClick: null,
    onAnswerCollapse: null,
    onPaginationPageChanged: null,
    onPaginationConfigChanged: null,
    onMiniMapTogglePageCollapsed: null,
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
    return safeId ? `${KEY_TITLE_LIST_PAGES}:${safeId}` : '';
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
    const diskKey = keyTitleListPages(id);
    let pages = [];
    if (diskKey) {
      const perChatRaw = storageGetRaw(diskKey);
      if (perChatRaw != null) {
        pages = normalizePageNums(storageGetJSON(diskKey, []));
      } else {
        const legacyRaw = storageGetRaw(KEY_TITLE_LIST_PAGES);
        if (legacyRaw != null) {
          const normalizedLegacy = normalizePageNums(storageGetJSON(KEY_TITLE_LIST_PAGES, []));
          pages = normalizedLegacy.slice();
          const wrote = storageSetJSON(diskKey, normalizedLegacy);
          if (wrote) {
            const verify = normalizePageNums(storageGetJSON(diskKey, []));
            if (samePageNums(verify, normalizedLegacy)) {
              pages = verify.slice();
              storageRemove(KEY_TITLE_LIST_PAGES);
            }
          }
        }
      }
    }
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
        .map((row) => String(row?.answerId || '').trim())
        .filter(Boolean)
    ));
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

  function getTitleListDriver(pageNum = 0, chatId = '') {
    return getDriverForPage(S.titleListDriversByChat, pageNum, chatId);
  }

  function setTitleListDriver(pageNum = 0, active = false, driver = 'legacy', chatId = '') {
    return setDriverForPage(S.titleListDriversByChat, pageNum, active, driver, chatId);
  }

  function getPageCollapseDriver(pageNum = 0, chatId = '') {
    return getDriverForPage(S.collapsedPageDriversByChat, pageNum, chatId);
  }

  function setPageCollapseDriver(pageNum = 0, active = false, driver = 'legacy', chatId = '') {
    return setDriverForPage(S.collapsedPageDriversByChat, pageNum, active, driver, chatId);
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

  function readTitleListPages(chatId = '') {
    return localReadTitleListPagesSet(chatId);
  }

  function writeTitleListPages(chatId = '', pages = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', pages: [] };
    const next = Array.from(localWriteTitleListPagesSet(id, pages));
    return { ok: true, status: 'ok', chatId: id, pages: next };
  }

  function isPageCollapsed(pageNum = 0, chatId = '') {
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return !!num && localReadCollapsedPagesSet(chatId).has(num);
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
      if (id && UM_PUBLIC()?.isCollapsedById?.(id)) return true;
    } catch {}
    return String(answerMsgEl?.getAttribute?.(ANSWER_TITLE_COLLAPSED_ATTR) || '').trim() === '1'
      || String(bar?.getAttribute?.('data-cgxui-state') || '').split(/\s+/).includes('collapsed');
  }

  function getNoAnswerManagedEls(host = null, bar = null) {
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
    return result;
  }

  function applyNoAnswerTitleCollapsedDom(host = null, collapsed = false, opts = {}) {
    const bar = opts?.bar || host?.querySelector?.('[data-cgxui="atns-answer-title"][data-cgxui-owner="atns"][data-at-no-answer="1"]') || null;
    if (!host || !bar) return { ok: false, status: 'missing-no-answer-title' };
    const animate = opts.animate !== false;
    const iconEl = bar.querySelector?.(ANSWER_TITLE_ICON_SEL) || null;
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
        if (animate) setTimeout(() => { try { el.style.transition = ''; } catch {} }, 270);
      });
    }
    return { ok: true, status: 'ok', host, bar, collapsed: !!collapsed };
  }

  function isChatPageRowCollapsed(row = null) {
    if (!row) return false;
    if (row.noAnswer) {
      return isTitleBarCollapsed(row.titleBar) || String(row.questionHost?.getAttribute?.(ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN) || '').trim() === '1';
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

  function applyChatPageTitleListCompactDom(row = null, active = false) {
    const isNoAnswer = !!row?.noAnswer;
    const host  = row?.answerHost || row?.questionHost || null;
    const bar   = row?.titleBar || null;
    const msgEl = row?.answerMsgEl || null;
    const compact = !!active && isChatPageRowCollapsed(row);
    if (!host) return false;

    const ancestors = msgEl ? _getAncestorsBetween(msgEl, host) : [];
    const noAnswerInner = isNoAnswer ? (host.firstElementChild || null) : null;
    const canCompactNoAnswerInner = !!(
      isNoAnswer
      && noAnswerInner
      && noAnswerInner !== bar
      && (!bar || !noAnswerInner.contains?.(bar))
    );

    if (compact) {
      host.setAttribute?.(ATTR_CHAT_PAGE_TITLE_ITEM, '1');
      try { host.style.setProperty('min-height', '0px', 'important'); } catch {}
      try { host.style.setProperty('padding-top', '0px', 'important'); } catch {}
      try { host.style.setProperty('padding-bottom', '0px', 'important'); } catch {}
      try { host.style.setProperty('margin-top', '0px', 'important'); } catch {}
      try { host.style.setProperty('margin-bottom', `${TITLE_LIST_ROW_GAP_PX}px`, 'important'); } catch {}
      try { host.style.setProperty('gap', '0px', 'important'); } catch {}

      for (const anc of ancestors) {
        if (anc === bar) continue;
        _compactZeroEl(anc);
      }
      if (canCompactNoAnswerInner) _compactZeroEl(noAnswerInner);
      if (msgEl) {
        try { msgEl.style.setProperty('min-height', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('padding-top', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('padding-bottom', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('margin-top', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('margin-bottom', '0px', 'important'); } catch {}
        try { msgEl.style.setProperty('gap', '0px', 'important'); } catch {}
      }
      if (bar) {
        try { bar.style.setProperty('margin-top', '0px', 'important'); } catch {}
        try { bar.style.setProperty('margin-bottom', `${TITLE_LIST_ROW_GAP_PX}px`, 'important'); } catch {}
        try { bar.style.removeProperty('display'); } catch {}
        try { bar.style.removeProperty('visibility'); } catch {}
        try { bar.style.removeProperty('opacity'); } catch {}
      }
      if (isNoAnswer) {
        try { host.style.setProperty('display', 'block', 'important'); } catch {}
      }
    } else {
      host.removeAttribute?.(ATTR_CHAT_PAGE_TITLE_ITEM);
      for (const p of ['min-height','padding-top','padding-bottom','margin-top','margin-bottom','gap']) {
        try { host.style.removeProperty(p); } catch {}
      }
      if (isNoAnswer) { try { host.style.removeProperty('display'); } catch {} }
      for (const anc of ancestors) {
        if (anc === bar) continue;
        _compactRestoreEl(anc);
      }
      if (canCompactNoAnswerInner) _compactRestoreEl(noAnswerInner);
      if (msgEl) {
        for (const p of ['min-height','padding-top','padding-bottom','margin-top','margin-bottom','gap']) {
          try { msgEl.style.removeProperty(p); } catch {}
        }
      }
      if (bar) {
        try { bar.style.removeProperty('margin-top'); } catch {}
        try { bar.style.removeProperty('margin-bottom'); } catch {}
      }
    }
    return true;
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
    const rows = getRows(num, chatId);
    if (!rows.length) return 'expanded';
    const collapsedCount = rows.filter((row) => isChatPageRowCollapsed(row)).length;
    if (collapsedCount <= 0) return 'expanded';
    if (collapsedCount >= rows.length && isTitleListActive(num, chatId)) return 'collapsed';
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

  function applyTitleListVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const active = isTitleListActive(num, id);
    const driver = normalizeVisualDriver(opts?.driver || getTitleListDriver(num, id));
    const rows = getRows(num, id);
    const at = AT_PUBLIC();
    if (active) {
      try { document.documentElement.style.setProperty('--cgxui-title-list-row-gap', `${TITLE_LIST_ROW_GAP_PX}px`); } catch {}
    }
    for (const row of rows) {
      if (row.noAnswer) {
        applyNoAnswerTitleCollapsedDom(row.answerHost, !!active, { animate: opts?.animate === true, bar: row.titleBar });
      } else {
        if (driver !== 'engine' && at?.setCollapsed && row.answerId) {
          const collapsedNow = !!at.isCollapsed?.(row.answerId);
          if (active && !collapsedNow) {
            try { at.setCollapsed(row.answerId, true, { animate: false, source: 'chat-pages-controller:title-list' }); } catch {}
          } else if (!active && collapsedNow) {
            try { at.setCollapsed(row.answerId, false, { animate: opts?.animate !== false, source: 'chat-pages-controller:title-list' }); } catch {}
          }
        }
        setQuestionHostTitleListHidden(row.questionHost, !!active && isChatPageRowCollapsed(row));
      }
      applyChatPageTitleListCompactDom(row, !!active);
    }
    if (!active) sweepQuestionHostRestore();
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    return { ok: true, status: 'ok', chatId: id, pageNum: num, rows: rows.length, active, driver };
  }

  function applyPageCollapsedVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const collapsed = isPageCollapsed(num, id);
    const driver = normalizeVisualDriver(opts?.driver || getPageCollapseDriver(num, id));
    const payload = getSections(id);
    const section = payload?.sections?.get?.(num) || null;
    const hosts = Array.isArray(section?.hosts) ? section.hosts : [];
    for (const host of hosts) setChatPageTurnHostDomState(host, num, driver === 'engine' ? false : collapsed);
    try { MM_CORE_PAGES()?.setMiniMapPageCollapsed?.(num, collapsed, id, { source: String(opts?.source || 'chat-sync').trim() || 'chat-sync', propagate: true }); } catch {}
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    return { ok: true, status: 'ok', chatId: id, pageNum: num, collapsed, hosts: hosts.length, driver };
  }

  function applyPageVisuals(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const titleResult = applyTitleListVisuals(num, { chatId: id, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller', animate: opts?.animate });
    const pageResult = applyPageCollapsedVisuals(num, { chatId: id, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller' });
    return { ok: !!(titleResult?.ok !== false && pageResult?.ok !== false), status: 'ok', chatId: id, pageNum: num, titleResult, pageResult };
  }

  function setPageCollapsed(pageNum = 0, collapsed = true, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const driver = normalizeVisualDriver(opts?.driver);
    const next = localReadCollapsedPagesSet(id);
    if (collapsed) next.add(num); else next.delete(num);
    localWriteCollapsedPagesSet(id, Array.from(next));
    setPageCollapseDriver(num, !!collapsed, driver, id);
    const visual = applyPageCollapsedVisuals(num, { chatId: id, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller', driver });
    return { ok: true, status: 'ok', chatId: id, pageNum: num, collapsed: !!collapsed, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller', driver, visual };
  }

  function togglePageCollapsed(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return setPageCollapsed(num, !isPageCollapsed(num, id), Object.assign({}, opts, { chatId: id }));
  }

  function setTitleListMode(pageNum = 0, enabled = false, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    const driver = normalizeVisualDriver(opts?.driver);
    const next = localReadTitleListPagesSet(id);
    if (enabled) next.add(num); else next.delete(num);
    localWriteTitleListPagesSet(id, Array.from(next));
    setTitleListDriver(num, !!enabled, driver, id);
    const visual = applyTitleListVisuals(num, { chatId: id, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller', animate: opts?.animate !== false, driver });
    return { ok: true, status: 'ok', chatId: id, pageNum: num, enabled: !!enabled, source: String(opts?.source || 'chat-pages-controller').trim() || 'chat-pages-controller', driver, rows: visual?.rows || 0 };
  }

  function toggleTitleListMode(pageNum = 0, opts = {}) {
    const id = String(opts?.chatId || resolveChatId()).trim();
    const num = Math.max(1, Number(pageNum || 0) || 0);
    return setTitleListMode(num, !isTitleListActive(num, id), Object.assign({}, opts, { chatId: id }));
  }

  function refreshAll(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const payload = getSections(id);
    const pageNums = new Set();
    try {
      for (const key of payload?.sections?.keys?.() || []) pageNums.add(Math.max(1, Number(key || 0) || 0));
    } catch {}
    for (const p of readCollapsedPages(id)) pageNums.add(Math.max(1, Number(p || 0) || 0));
    for (const p of readTitleListPages(id)) pageNums.add(Math.max(1, Number(p || 0) || 0));
    const ordered = Array.from(pageNums).filter(Boolean).sort((a, b) => a - b);
    for (const pageNum of ordered) applyPageVisuals(pageNum, { chatId: id, source: 'chat-pages-controller:refresh', animate: false });
    try { MM_CORE_PAGES()?.renderDividers?.(id); } catch {}
    return { ok: true, status: 'refreshed', chatId: id, pages: ordered };
  }

  function bind() {
    if (S.listenersBound) {
      S.bound = true;
      return { ok: true, status: 'already-bound', chatId: String(S.chatId || resolveChatId()).trim() };
    }

    S.onDividerDblClick = (ev) => {
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
        currentTitleListActive: isTitleListActive(pageNum, chatId),
        owner: {
          setPageCollapsed,
        },
      });
      if (routed?.handled === true) return;
      try { togglePageCollapsed(pageNum, { chatId: resolveChatId(), source: 'chat-page-divider:dblclick' }); } catch {}
    };

    S.onDividerDotClick = (ev) => {
      const dot = ev?.target?.closest?.('.cgxui-chat-page-divider-dot, .cgxui-pgnw-page-divider-dot');
      if (!dot) return;
      const divider = dot.closest?.('.cgxui-chat-page-divider, .cgxui-pgnw-page-divider');
      if (!divider) return;
      const pageNum = getDividerPageNum(divider);
      if (!pageNum) return;
      try { ev.preventDefault(); ev.stopPropagation(); } catch {}
      const chatId = resolveChatId();
      const nextEnabled = !isTitleListActive(pageNum, chatId);
      const routed = CM_ROUTER_API()?.routeChatPageDotClick?.({
        pageNum,
        chatId,
        dividerEl: divider,
        pageAnswerIds: getPageAnswerIds(pageNum, chatId),
        currentEnabled: !nextEnabled,
        nextEnabled,
        titleState: getTitleState(pageNum, chatId),
        owner: {
          setTitleListMode,
        },
      });
      if (routed?.handled === true) return;
      try { toggleTitleListMode(pageNum, { chatId: resolveChatId(), source: 'chat-page-divider:dot' }); } catch {}
    };

    S.onAnswerCollapse = (ev) => {
      const answerId = String(ev?.detail?.answerId || '').trim();
      if (!answerId) return;
      const row = findRowByAnswerId(answerId);
      if (!row) return;
      if (isTitleListActive(row.pageNum, resolveChatId())) {
        if (row.noAnswer) {
          applyNoAnswerTitleCollapsedDom(row.answerHost, !!ev?.detail?.collapsed, { animate: false, bar: row.titleBar });
        } else {
          setQuestionHostTitleListHidden(row.questionHost, !!ev?.detail?.collapsed);
        }
        applyChatPageTitleListCompactDom(row, true);
      }
      try { MM_CORE_PAGES()?.renderDividers?.(resolveChatId()); } catch {}
    };

    S.onPaginationPageChanged = () => {
      try { refreshAll(resolveChatId()); } catch {}
    };

    S.onPaginationConfigChanged = () => {
      try { setTimeout(() => { try { refreshAll(resolveChatId()); MM_CORE_PAGES()?.scheduleRebuild?.('chat-pages-controller:pagination-config'); } catch {} }, 80); } catch {}
    };

    S.onMiniMapTogglePageCollapsed = (ev) => {
      const pageNum = Math.max(1, Number(ev?.detail?.pageNum || 0) || 0);
      if (!pageNum) return;
      const source = String(ev?.detail?.source || 'minimap-local').trim() || 'minimap-local';
      try { MM_CORE_PAGES()?.toggleMiniMapPageCollapsed?.(pageNum, '', { source, propagate: false }); } catch {}
    };

    window.addEventListener('dblclick', S.onDividerDblClick, true);
    document.addEventListener('dblclick', S.onDividerDblClick, true);
    window.addEventListener('click', S.onDividerDotClick, true);
    window.addEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged);
    window.addEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse);
    window.addEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed);
    window.addEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged);
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged);
    }

    S.listenersBound = true;
    S.bound = true;
    S.chatId = resolveChatId();
    try { refreshAll(S.chatId); } catch {}
    return { ok: true, status: 'bound', chatId: S.chatId };
  }

  function unbind() {
    try { window.removeEventListener('dblclick', S.onDividerDblClick, true); } catch {}
    try { document.removeEventListener('dblclick', S.onDividerDblClick, true); } catch {}
    try { window.removeEventListener('click', S.onDividerDotClick, true); } catch {}
    try { window.removeEventListener(EV_PAGE_CHANGED, S.onPaginationPageChanged); } catch {}
    try { window.removeEventListener(EV_ANSWER_COLLAPSE, S.onAnswerCollapse); } catch {}
    try { window.removeEventListener(EV_MM_TOGGLE_PAGE_COLLAPSED, S.onMiniMapTogglePageCollapsed); } catch {}
    try { window.removeEventListener(EV_PAGE_CFG_CHANGED, S.onPaginationConfigChanged); } catch {}
    if (EV_PAGE_CHANGED.startsWith('evt:')) {
      try { window.removeEventListener(EV_PAGE_CHANGED.slice(4), S.onPaginationPageChanged); } catch {}
    }
    S.onDividerDblClick = null;
    S.onDividerDotClick = null;
    S.onAnswerCollapse = null;
    S.onPaginationPageChanged = null;
    S.onPaginationConfigChanged = null;
    S.onMiniMapTogglePageCollapsed = null;
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
      ver: '1.1.0',
      boot,
      dispose,
      bind,
      unbind,
      refreshAll,
      readCollapsedPages,
      writeCollapsedPages,
      isPageCollapsed,
      setPageCollapsed,
      togglePageCollapsed,
      readTitleListPages,
      writeTitleListPages,
      isTitleListActive,
      getTitleState,
      setTitleListMode,
      toggleTitleListMode,
      applyPageVisuals,
      applyTitleListVisuals,
      applyPageCollapsedVisuals,
      getState,
    });
    return SH.api.mm.chatPagesCtl;
  }

  function boot() {
    registerBridge();
    S.booted = true;
    S.chatId = resolveChatId();
    const bindResult = bind();
    return { ok: !!bindResult?.ok, status: bindResult?.status || 'booted', chatId: S.chatId };
  }

  function dispose() {
    unbind();
    S.booted = false;
    S.chatId = '';
    return { ok: true, status: 'disposed' };
  }

  boot();
})();
