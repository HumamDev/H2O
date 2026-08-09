// ==H2O Module==
// @h2o-id             0c3a.chatpage.structure
// @name               0C3a.⬛️📐 Chat Page Structure Engine 📐
// @namespace          H2O.Premium.CGX.chatpage.structure
// @author             HumamDev
// @version            12.7.11
// @revision           001
// @build              260808-000001
// @description        Chat Page Structure Engine: canonical logical page model, page sections/rows, page-start anchor, Chat Page Divider DOM/placement/repair, page-unit reconciliation
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

// ─────────────────────────────────────────────────────────────────────────────
// STRUCTURAL OWNER FOR THE CHAT PAGE.
//
// This runtime is the single owner of the *structure* of a chat page: which
// turns belong to which logical page, where a page starts, whether a Chat Page
// Divider exists, where it is placed, and how placement is repaired. It was
// extracted verbatim out of 1A1b MiniMap Core so that page structure stops
// being a tenant of the MiniMap.
//
// It is NOT the collapse authority. Collapse/expand intent, title-list state,
// the Title Intent Ledger, atomic page-collapse transactions and divider visual
// mode all remain owned by 1C1b Thread Pages Controller. This engine only reads
// Thread Pages' public read-side (divider UI mode, title-list active, collapsed
// page set) through the same sanctioned callChatPagesCtl seam MiniMap already
// used, and never touches a Thread Pages store directly.
//
// Load order: H2O Core → Pagination → 0C3a → MiniMap Core → Thread Pages.
// Because this engine loads BEFORE its host, every cross-runtime lookup below
// is resolved dynamically at call time and fails closed when absent. Nothing is
// captured at load time.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const STRUCTURE_VER = '12.7.11';

  // ── Owned state ───────────────────────────────────────────────────────────
  // Exactly the three fields the extracted implementation owned inside the
  // MiniMap state bag. Page-unit state has one owner and it is this file.
  const EMPTY_MAP = new Map();
  const S = {
    chatPageUnitState: null,
    chatPageStatusCardEl: null,
    chatPageStatusCardAnchor: null,
    // MiniMap Core still owns the turn index. These two delegate straight to it
    // so the extracted implementation below reads and memoises exactly what it
    // read and memoised before, letting it move byte-for-byte with no rewrite.
    get turnList() { return mmHost()?.getTurnList?.() || []; },
    get answerByTurnId() { return mmHost()?.getAnswerByTurnId?.() || EMPTY_MAP; },
  };

  // ── DOM contract constants shared with MiniMap Core ────────────────────────
  // These are DOM contract *values*, not implementations. The divider markup is
  // stamped with the same owner token MiniMap uses, because existing selectors
  // in MiniMap, Thread Pages and the validators match on it. Changing either of
  // these is a DOM contract break, not a refactor.
  const UI_TOK = Object.freeze({ OWNER: 'mnmp' });
  const ANSWER_TITLE_SEL = '.cgxui-answer-title';
  const ANSWER_TITLE_ICON_SEL = '.cgxui-answer-title-icon';
  const ANSWER_TITLE_NO_ANSWER_ATTR = 'data-cgxui-answer-title-no-answer';
  const ATTR_CHAT_PAGE_DIVIDERS = 'data-cgxui-chat-page-dividers';
  const ATTR_CHAT_PAGE_NO_ANSWER_QUESTION_HIDDEN = 'data-cgxui-chat-page-no-answer-question-hidden';

  // ── Generic leaf utilities (per-script by project convention) ─────────────
  // escAttr/qq are already carried independently by several runtime scripts;
  // duplicating a five-line DOM leaf is the established pattern here and is not
  // a second implementation of any structural mechanism.
  const escAttr = (v) => {
    const s = String(v || '');
    if (!s) return s;
    try { return (window.CSS?.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); } catch { return s; }
  };

  const qq = (sel, root = document) => {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  };

  const stableHash36 = (input) => {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(36);
  };

  const storageApi = () => {
    try { return TOPW.H2O_MM_SHARED?.get?.()?.util?.storage || null; } catch { return null; }
  };

  const storageGetJSON = (key, fallback = null) => {
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
  };

  const pickAssistantMessageEl = (node) => {
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
  };

  // ── Input authority A: H2O Core / H2O.turnRuntime ─────────────────────────
  const getTurnRuntimeApi = () => {
    return TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
  };

  const resolveChatId = () => {
    // Check shared util hook first (may be populated by another H2O module).
    const fromUtil = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromUtil) return fromUtil;
    // Mirror Pagination getChatId() exactly: /c/, /g/, then path_hash fallback.
    const path = String(location.pathname || '/');
    const m = path.match(/\/c\/([^/?#]+)/i) || path.match(/\/g\/([^/?#]+)/i);
    if (m && m[1]) {
      try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
    }
    return `path_${stableHash36(`${location.origin}${path}${location.search || ''}`)}`;
  };

  // ── Input authority B: Pagination, hydration/windowing HINT only ───────────
  // Pagination stays independent. Its user-configurable pageSize is deliberately
  // NOT consulted as the logical page size; the canonical structural page size
  // is the fixed band below.
  const getPaginationState = () => {
    try {
      return W?.H2O?.PW?.pgnwndw?.state || W?.H2O_Pagination?.state || null;
    } catch {
      return null;
    }
  };

  const getTurnPageBand = (turnIndex) => {
    const idx = Math.max(1, Number(turnIndex || 1));
    if (idx <= 25) return 'normal';
    if (idx <= 50) return 'teal';
    if (idx <= 75) return 'blue';
    if (idx <= 100) return 'darkred';
    return 'violet';
  };

  // ── Input authority C: Thread Pages Controller, read-side only ─────────────
  // Same seam MiniMap Core already used. Every call is a public controller
  // method; no Thread Pages collapse store is read or written from here.
  const getChatPagesControllerApi = () => {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.mm?.chatPagesCtl || null;
    } catch {
      return null;
    }
  };

  const callChatPagesCtl = (methodName, args, fallbackFn) => {
    const api = getChatPagesControllerApi();
    const fn = api && typeof api[methodName] === 'function' ? api[methodName] : null;
    if (fn) {
      try { return fn.apply(api, Array.isArray(args) ? args : []); } catch {}
    }
    if (typeof fallbackFn === 'function') {
      try { return fallbackFn(); } catch {}
    }
    return undefined;
  };

  const getChatPageDividerUiMode = () => {
    const mode = callChatPagesCtl('getDividerUiMode', [], () => 'normal');
    const raw = String(mode || 'normal').trim().toLowerCase();
    return (raw === 'title' || raw === 'title-only') ? 'title' : 'normal';
  };

  const getChatPageDividerDebugState = (pageNum = 1) => {
    return callChatPagesCtl('getPageDividerDebugState', [pageNum], () => passiveGetChatPageDividerDebugState(pageNum));
  };

  const isChatPageTitleListActive = (pageNum = 0, chatId = '') => {
    return callChatPagesCtl('isTitleListActive', [pageNum, { chatId }], () => false) === true;
  };

  const readCollapsedChatPages = (chatId = '') => {
    const set = callChatPagesCtl('readCollapsedPages', [chatId], () => new Set());
    return (set instanceof Set) ? set : new Set();
  };

  const applyChatPageDividerVisuals = (divider = null, pageNum = 0, chatId = '') => {
    return callChatPagesCtl('applyDividerVisualsToDivider', [divider, pageNum, { chatId }], () => false);
  };

  const passiveGetChatPageDividerDebugState = (pageNum = 1) => {
    return {
      ok: false,
      status: 'chat-pages-controller-unavailable',
      pageNum: Math.max(1, Number(pageNum || 1)),
      hoverInfoBoxEnabled: isChatPageDividerHoverInfoBoxEnabled(),
      mode: 'normal',
    };
  };

  // ── MiniMap Core host seam (Milestone 1 behaviour-preservation only) ───────
  // The extracted code read MiniMap's cached turn index (S.turnList /
  // S.answerByTurnId), MiniMap's Chat Atlas read-side projection, MiniMap's
  // divider-enabled preference, the NO ANSWER / answer-title collapse DOM
  // appliers that stay with Thread Pages' lifecycle, and MiniMap Core's perf
  // buckets. Re-deriving any of those from a different source would change
  // behaviour, which this milestone forbids, so they are reached through one
  // narrow host bridge MiniMap registers.
  //
  // This bridge is the seam most worth deleting later: once the turn-record
  // source is unified on H2O.turnRuntime the index reads collapse away. It is
  // listed as deferred work rather than silently redesigned here.
  const mmHost = () => {
    try {
      return TOPW.H2O_MM_SHARED?.get?.()?.api?.mm?.chatPageStructureHost
        || TOPW.H2O_MM_CHAT_PAGE_STRUCTURE_HOST
        || null;
    } catch {
      return null;
    }
  };

  const findTurnByAnyId = (...a) => { return mmHost()?.findTurnByAnyId?.(...a) ?? null; };
  const resolveAnswerEl = (...a) => { return mmHost()?.resolveAnswerEl?.(...a) ?? null; };
  const getSharedTurnRecordByAnyId = (...a) => { return mmHost()?.getSharedTurnRecordByAnyId?.(...a) ?? null; };
  const getCompleteIndexProjectionStatus = (...a) => { return mmHost()?.getCompleteIndexProjectionStatus?.(...a) ?? null; };
  const getEffectivePresentationRuntimeStatus = (...a) => { return mmHost()?.getEffectivePresentationRuntimeStatus?.(...a) ?? null; };
  const getChatPageDividersEnabled = () => { return mmHost()?.getChatPageDividersEnabled?.() !== false; };
  const applyNoAnswerTitleCollapsedDom = (...a) => { return mmHost()?.applyNoAnswerTitleCollapsedDom?.(...a); };
  const isAnswerTitleCollapsed = (...a) => { return mmHost()?.isAnswerTitleCollapsed?.(...a) === true; };
  const isTitleBarCollapsed = (...a) => { return mmHost()?.isTitleBarCollapsed?.(...a) === true; };
  const getAnswerTitleBarEl = (...a) => { return mmHost()?.getAnswerTitleBarEl?.(...a) ?? null; };
  const getAnswerTitleAnswerId = (...a) => { return mmHost()?.getAnswerTitleAnswerId?.(...a) ?? ''; };
  const UM_PUBLIC = () => { return mmHost()?.UM_PUBLIC?.() ?? null; };

  // Perf reporting continues into MiniMap Core UI's existing buckets so
  // H2O.perf.modules.miniMapCoreUi.getStats() keeps reporting divider work at
  // the same keys. When the host is absent every call is an inert no-op.
  const PERF_SINK = Object.freeze({ createdCount: 0, reusedCount: 0, removedCount: 0 });
  const PERF = {
    get dividerUi() { return mmHost()?.perf?.state?.()?.dividerUi || PERF_SINK; },
    get paths() { return mmHost()?.perf?.state?.()?.paths || {}; },
  };
  const perfNow = () => {
    const n = Number(W.performance?.now?.() || Date.now());
    return Number.isFinite(n) ? n : 0;
  };
  const recordDuration = (...a) => { return mmHost()?.perf?.recordDuration?.(...a) ?? 0; };
  const noteSummaryBucket = (...a) => { return mmHost()?.perf?.noteSummaryBucket?.(...a); };
  const noteRenderUnit = (...a) => { return mmHost()?.perf?.noteRenderUnit?.(...a) ?? 0; };
  const noteNodeLifecycle = (...a) => { return mmHost()?.perf?.noteNodeLifecycle?.(...a) ?? 0; };
  const enterPerfOwner = (...a) => { return mmHost()?.perf?.enterPerfOwner?.(...a) === true; };
  const exitPerfOwner = (...a) => { return mmHost()?.perf?.exitPerfOwner?.(...a); };

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTED IMPLEMENTATION — moved verbatim from 1A1b MiniMap Core.
  // It is byte-identical to the code that left 1A1b: no renames, no signature
  // changes, no substitutions. S.turnList / S.answerByTurnId keep resolving to
  // MiniMap's index through the getters declared above.
  // ═══════════════════════════════════════════════════════════════════════════

  const KEY_CHUB_CHAT_MECHANISMS_V1 = 'h2o:prm:cgx:cntrlhb:state:chat-mechanisms:v1';

  const ATTR_CHAT_PAGE_DIVIDER = 'data-cgxui-chat-page-divider';

  const ATTR_CHAT_PAGE_NUM = 'data-cgxui-chat-page-num';

  const ATTR_CHAT_PAGE_COLLAPSED = 'data-cgxui-chat-page-collapsed';

  const ATTR_CHAT_PAGE_HIDDEN = 'data-cgxui-chat-page-hidden';

  const ATTR_CHAT_PAGE_TITLE_LIST = 'data-cgxui-chat-page-title-list';

  const ATTR_CHAT_PAGE_TITLE_STATE = 'data-cgxui-chat-page-title-state';

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

  const ANSWER_TITLE_LABEL_SEL = '[data-cgxui="atns-answer-title-label"][data-cgxui-owner="atns"]';

  const ANSWER_TITLE_TEXT_SEL = '[data-cgxui="atns-answer-title-text"][data-cgxui-owner="atns"]';

  const ATTR_CHAT_PAGE_NO_ANSWER = 'data-cgxui-chat-page-no-answer';

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

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC CONTRACT
  //
  // Deliberately narrow: exactly the surface the MiniMap compatibility forwards
  // and the Thread Pages Controller already call. Nothing speculative is
  // exposed, and no collapse/title-list command appears here — this engine is
  // structure only.
  //
  // Registration key: H2O_MM_SHARED.api.mm.chatPageStructure
  //
  // That is the same bus 1C1b already registers on as api.mm.chatPagesCtl, so
  // both chat-page runtimes are discoverable the same way by the same consumers
  // through the same kernel object. A direct global mirrors 1A1b's
  // TOPW.H2O_MM_CORE_API so a consumer can still resolve this engine when the
  // shared kernel bridge has not installed yet. Consumers resolve it per call
  // (see callChatPageStructure in 1A1b) and never cache the object.
  // ═══════════════════════════════════════════════════════════════════════════

  const STRUCTURE_API = {
    ver: STRUCTURE_VER,

    // logical page model / membership
    getSections: buildChatPageSections,
    getRows: buildChatPageAnswerRows,
    findRowByAnswerId: findChatPageRowByAnswerId,

    // page-start anchor authority (single implementation, project-wide)
    getPageStartTurnWrapper,
    getDividerPageNum: getChatPageDividerPageNum,

    // Chat Page Divider existence / DOM / placement / repair
    renderDividers: renderChatPageDividers,

    // page-unit subsystem
    buildPageUnitModel: buildChatPageUnitModel,
    reconcilePageUnits: reconcileChatPageUnits,
    getPageUnitDiagnostics: () => getChatPageUnitState().last,

    // NO ANSWER structural creation
    ensureNoAnswerTitleBar,
    getNoAnswerTitleBarEl,
    syncNoAnswerTitleBars,

    // divider-bound structural UI
    isChatPageDividerHoverInfoBoxEnabled,
    syncChatPageStatusCardSetting,
  };

  const INSTALL_GAP_MS = 250;
  const INSTALL_MAX_TRIES = 40;
  let installTimer = null;
  let installTries = 0;

  function installStructureIntoKernelShared() {
    try {
      const root = TOPW.H2O_MM_SHARED;
      if (!root || typeof root !== 'object') return false;
      root.api = (root.api && typeof root.api === 'object') ? root.api : {};
      root.api.mm = (root.api.mm && typeof root.api.mm === 'object') ? root.api.mm : {};
      root.api.mm.chatPageStructure = STRUCTURE_API;
      return true;
    } catch {
      return false;
    }
  }

  function scheduleStructureInstallRetry() {
    try { if (installTimer) clearTimeout(installTimer); } catch {}
    installTimer = setTimeout(() => {
      installTries += 1;
      if (installStructureIntoKernelShared()) return;
      if (installTries >= INSTALL_MAX_TRIES) return;
      scheduleStructureInstallRetry();
    }, INSTALL_GAP_MS);
  }

  try { TOPW.H2O_CHAT_PAGE_STRUCTURE_API = STRUCTURE_API; } catch {}
  if (W !== TOPW) { try { W.H2O_CHAT_PAGE_STRUCTURE_API = STRUCTURE_API; } catch {} }
  try { TOPW.H2O_CHAT_PAGE_STRUCTURE_READY = true; } catch {}
  if (!installStructureIntoKernelShared()) scheduleStructureInstallRetry();
})();
