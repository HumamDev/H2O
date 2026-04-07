// ==UserScript==
// @h2o-id             2x1a.question.numbers
// @name               2X1a.🟡🔢 Question Numbers 🔢
// @namespace          H2O.Premium.CGX.question.numbers
// @author             HumamDev
// @version            1.0.2
// @revision           002
// @build              260402-000001
// @description        Big faded question numbers + edit counter (split from 2X Question Numbers & Style) with delta processing and visible-only repositioning.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const TOK = 'QN';
  const PID = 'qbigindex';
  const CID = 'QBIGINDEX';
  const SkID = 'qbig';

  const W = window;
  const D = document;

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  W.H2O[TOK][PID] = W.H2O[TOK][PID] || {};

  const MOD = W.H2O[TOK][PID];
  MOD.diag = MOD.diag || {};
  MOD.state = MOD.state || {};
  MOD.api = MOD.api || {};

  const DIAG = MOD.diag;
  DIAG.pid = PID;
  DIAG.cid = CID;

  const SEL = Object.freeze({
    USER_MSG: '[data-message-author-role="user"]',

    BUBBLE: '.user-message-bubble-color',
    QWRAP_BUBBLE: '.cgxui-qswr-bubble, .cgxui-qswr-bubble-short, .ho-qwrap-bubble, .ho-qwrap-bubble-short',
    QWRAP_TEXT: '.cgxui-qswr-text, .ho-qwrap-text',
    PROSE: '.markdown, .prose, [class*="markdown"], [class*="prose"]',

    EDIT_BADGE: 'div.tabular-nums',

    TURN_ROOT: '[tabindex="-1"]',
    TURN_GROUP_HINT: '[class*="group/turn-messages"]',

    TURNS: '[data-testid="conversation-turns"]',
    TURN: '[data-testid="conversation-turn"]',
    MAIN: 'main',
  });

  const EV = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    INDEX_UPDATED_WIN: 'h2o:index:updated',
    TURN_UPDATED_WIN: 'h2o:turn:updated',
    BUS_INDEX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
    ROUTE_CHANGED: 'evt:h2o:route:changed',
  });

  const ATTR = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI: 'data-cgxui',

    SIG_NUM: 'data-h2o-qbig-sig-num',
    SIG_POS: 'data-h2o-qbig-sig-pos',
    SIG_HOST_FALLBACK: 'data-h2o-qbig-hostfb',
  });

  const UI = Object.freeze({
    HOST_CLASS: `cgxui-${SkID}-host`,
    HOST_FB_CLASS: `cgxui-${SkID}-host-fb`,
    ALLOW_OVERFLOW_CLASS: `cgxui-${SkID}-allow-overflow`,

    NUM_CLASS: `cgxui-${SkID}-number`,
    MAIN_CLASS: `cgxui-${SkID}-main`,
    EDITS_CLASS: `cgxui-${SkID}-edits`,

    DIGIT_1: `cgxui-${SkID}-digit-1`,
    DIGIT_2: `cgxui-${SkID}-digit-2`,
    DIGIT_3: `cgxui-${SkID}-digit-3`,
    DIGIT_4: `cgxui-${SkID}-digit-4`,
  });

  const CSS = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-num-style`,
  });

  const CFG = Object.freeze({
    X_MODE: 'bubble',
    BUBBLE_GAP_PX: 14,
    RAIL_GAP_PX: 18,
    ABS_LEFT_PX: 24,
    ABS_RIGHT_PX: null,

    Y_MODE: 'bubble-center',
    BUBBLE_CENTER_Y_OFFSET_PX: 0,
    TOP_PX: 10,
    TOP_EXTRA_PX: 0,

    COLOR: 'rgba(128, 128, 128, 0.12)',
    SCALE: 0.75,

    SHOW_1_OF_1: false,
    EDIT_WRAP: true,
    EDIT_PREFIX_SPACE: true,

    EDIT_SEARCH_DY_MIN: -30,
    EDIT_SEARCH_DY_MAX: 220,

    INC_PER_FRAME: 30,
    POS_PER_FRAME: 30,
    BUS_DEBOUNCE_MS: 260,
    POS_THROTTLE_MS: 200,
    MAX_DELTA_CHILDREN: 24,
    PERF_LOG_MS: 10000,
  });

  const KEY_INIT_BOOT = `H2O:${TOK}:${PID}:booted`;

  const PERF = {
    enabled: false,
    deltaUpdates: 0,
    fullScans: 0,
    positionedVisibleCount: 0,
    editRecomputes: 0,
    ticker: 0,
  };

  function initPerf() {
    if (PERF.ticker) return;
    try { PERF.enabled = W.localStorage?.getItem('h2o:perf') === '1'; } catch {}
    if (!PERF.enabled) return;

    PERF.ticker = W.setInterval(() => {
      try {
        console.log('[2X1b][perf]', {
          deltaUpdates: PERF.deltaUpdates,
          fullScans: PERF.fullScans,
          positionedVisibleCount: PERF.positionedVisibleCount,
          editRecomputes: PERF.editRecomputes,
        });
      } catch {}

      PERF.deltaUpdates = 0;
      PERF.fullScans = 0;
      PERF.positionedVisibleCount = 0;
      PERF.editRecomputes = 0;
    }, CFG.PERF_LOG_MS);
  }

  function q(sel, root = D) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = D) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function setAttr(el, k, v) {
    try { el?.setAttribute?.(k, v); } catch {}
  }

  function digitClass(n) {
    const len = String(n).length;
    if (len === 1) return UI.DIGIT_1;
    if (len === 2) return UI.DIGIT_2;
    if (len === 3) return UI.DIGIT_3;
    return UI.DIGIT_4;
  }

  function injectCSSOnce() {
    if (D.getElementById(CSS.STYLE_ID)) return;

    const style = D.createElement('style');
    style.id = CSS.STYLE_ID;
    style.textContent = `
/* fallback host support when background script is disabled */
${SEL.USER_MSG}.${UI.HOST_FB_CLASS}{
  position: relative !important;
  overflow: visible;
  z-index: 0;
}
${SEL.USER_MSG}.${UI.HOST_FB_CLASS}.${UI.ALLOW_OVERFLOW_CLASS}{
  overflow: visible !important;
}
${SEL.USER_MSG}.${UI.HOST_FB_CLASS} ${SEL.BUBBLE}{
  position: relative;
  z-index: 0;
}

/* container (NO MASK here — so edits won't vanish) */
.${UI.NUM_CLASS}{
  position: absolute;
  pointer-events: none;
  user-select: none;
  z-index: 0;
  white-space: nowrap;
  overflow: visible;
  line-height: 1;
  transform-origin: right center;
}

/* BIG DIGIT: mask + blend lives HERE */
.${UI.NUM_CLASS} .${UI.MAIN_CLASS}{
  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  display: inline-block;

  color: ${CFG.COLOR};
  mix-blend-mode: multiply;

  -webkit-mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 40%, transparent 100%);
  mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 40%, transparent 100%);
}

/* EDITS: same visual family as question number, only smaller */
.${UI.NUM_CLASS} .${UI.EDITS_CLASS}{
  font-family: Georgia, serif;
  font-weight: 700;
  font-feature-settings: 'onum' 1;
  letter-spacing: 0;
  display: inline-block;
  margin-left: 10px;

  color: ${CFG.COLOR};
  mix-blend-mode: multiply;

  transform: translateY(-10%);
  font-size: 34px;
  line-height: 1;
}

.${UI.DIGIT_1} { font-size: 100px; }
.${UI.DIGIT_2} { font-size: 85px; }
.${UI.DIGIT_3} { font-size: 70px; }
.${UI.DIGIT_4} { font-size: 55px; }
    `.trim();

    D.head.appendChild(style);

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { style.remove(); } catch {}
    });
  }

  function findConversationRoot() {
    const turns = q(SEL.TURNS);
    if (turns) return turns;

    const turn = q(SEL.TURN);
    if (turn?.parentElement) return turn.parentElement;

    return q(SEL.MAIN) || D.body;
  }

  function getTurnRoot(hostEl) {
    return (
      hostEl.closest?.(SEL.TURN_ROOT)
      || hostEl.closest?.(SEL.TURN_GROUP_HINT)
      || hostEl.parentElement
      || D
    );
  }

  function ensureHostFallback(hostEl) {
    if (!hostEl || !(hostEl instanceof HTMLElement)) return;

    if (hostEl.classList.contains(UI.HOST_CLASS)) {
      if (!hostEl.classList.contains(UI.ALLOW_OVERFLOW_CLASS)) {
        hostEl.classList.add(UI.ALLOW_OVERFLOW_CLASS);
      }
      return;
    }

    if (hostEl.getAttribute(ATTR.SIG_HOST_FALLBACK) === '1') return;

    hostEl.classList.add(UI.HOST_CLASS);
    hostEl.classList.add(UI.HOST_FB_CLASS);
    hostEl.classList.add(UI.ALLOW_OVERFLOW_CLASS);
    setAttr(hostEl, ATTR.OWNER, SkID);
    setAttr(hostEl, ATTR.UI, `${SkID}-host`);
    setAttr(hostEl, ATTR.SIG_HOST_FALLBACK, '1');
  }

  function ensureNumNode(hostEl) {
    let numEl = hostEl.querySelector(`.${UI.NUM_CLASS}`);
    if (numEl) return numEl;

    numEl = D.createElement('div');
    numEl.className = UI.NUM_CLASS;
    setAttr(numEl, ATTR.OWNER, SkID);
    setAttr(numEl, ATTR.UI, `${SkID}-num`);
    hostEl.insertBefore(numEl, hostEl.firstChild);
    return numEl;
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
        qwrapNode.getAttribute?.('data-h2o-qwrap-id') ||
        qwrapNode.getAttribute?.('data-ho-qwrap-id') ||
        qwrapNode.dataset?.h2oQwrapId ||
        qwrapNode.dataset?.hoQwrapId ||
        ''
      ).trim();
      if (isStableQuestionId(qwrapId)) return qwrapId;
    }

    try {
      const qId = W?.H2O?.index?.getQId?.(el) || '';
      const normalized = String(qId || '').trim();
      if (isStableQuestionId(normalized)) return normalized;
    } catch {}

    try {
      const textEl =
        el.querySelector?.('.cgxui-qswr-text') ||
        el.querySelector?.('.ho-qwrap-text') ||
        el.querySelector?.('.whitespace-pre-wrap') ||
        null;
      const qwrapId =
        W?.H2O_getStableQwrapId?.(el, textEl) ||
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

  function readCanonicalTurnNumFromRecord(record) {
    const turnNo = Number(
      record?.turnNo
      || record?.index
      || record?.idx
      || record?.gid
      || record?.turnIndex
      || 0
    );
    return (Number.isFinite(turnNo) && turnNo > 0) ? turnNo : 0;
  }

  function getPaginationState() {
    try {
      return W?.H2O?.PW?.pgnwndw?.state || null;
    } catch {
      return null;
    }
  }

  function getCanonicalTurnNumFromPaginationState(hostEl) {
    const state = getPaginationState();
    const rows = Array.isArray(state?.masterTurns)
      ? state.masterTurns
      : (Array.isArray(state?.turns) ? state.turns : []);
    if (!rows.length) return 0;

    const turnRoot =
      hostEl?.closest?.(SEL.TURN)
      || hostEl?.closest?.(SEL.TURN_ROOT)
      || hostEl?.closest?.(SEL.TURN_GROUP_HINT)
      || null;

    for (const row of rows) {
      const node = row?.node || row?.el || null;
      if (!node) continue;
      if (node === turnRoot || (typeof node.contains === 'function' && node.contains(hostEl))) {
        // Prefer answerIndex (1-based count of answered turns) as the
        // user-visible canonical turn number — this stays correct even when
        // Q and A are separate masterTurns entries.
        const answerIdx = Math.max(0, Number(row?.answerIndex || 0) || 0);
        if (answerIdx > 0) return answerIdx;

        // This is an unanswered question turn (Q19 case). Do NOT fall back to
        // readCanonicalTurnNumFromRecord which would return the raw gid (e.g. 37)
        // instead of the user-visible pair number (19). Return 0 so the caller
        // falls through to getPaginationTurnNumFromDomWindow which counts
        // answered turns before this node and returns the correct number.
      }
    }

    return 0;
  }


  function getDomTurnOrdinal(hostEl) {
    const turnRoot =
      hostEl?.closest?.(SEL.TURN)
      || hostEl?.closest?.(SEL.TURN_ROOT)
      || hostEl?.closest?.(SEL.TURN_GROUP_HINT)
      || null;
    if (!turnRoot) return 0;

    const root = findConversationRoot() || D;
    const turns = qsa(SEL.TURN, root);
    const idx = turns.indexOf(turnRoot);
    return idx >= 0 ? (idx + 1) : 0;
  }

  function getPaginationTurnNumFromDomWindow(hostEl) {
    try {
      const info = W?.H2O_Pagination?.getPageInfo?.() || null;
      if (!info) return 0;
      // answerRange.start is the 1-based answerIndex of the first visible answered turn.
      const startAnswerIndex = Math.max(0, Number(info?.answerRange?.start || 0) || 0);
      if (!(startAnswerIndex > 0)) return 0;

      // Count how many answered turn nodes appear before hostEl in the visible DOM window.
      // Then the question's number = startAnswerIndex + that count (0-based).
      const root = findConversationRoot() || D;
      const visibleTurns = qsa(SEL.TURN, root);
      let answeredBefore = 0;
      let foundHostTurn = false;
      for (const turn of visibleTurns) {
        const hasAnswer = !!turn.querySelector('[data-message-author-role="assistant"]');
        if (turn === hostEl || turn.contains(hostEl)) {
          foundHostTurn = true;
          // The question belongs to this turn's answer slot.
          // Its number = start of visible window + answered turns seen so far.
          break;
        }
        if (hasAnswer) answeredBefore++;
      }
      if (!foundHostTurn) return 0;
      return startAnswerIndex + answeredBefore;
    } catch {
      return 0;
    }
  }

  function getCanonicalTurnNumFromTurnRoot(hostEl) {
    const rt = W.H2O?.turnRuntime || null;
    if (!rt) return 0;

    const turnRoot =
      hostEl?.closest?.(SEL.TURN)
      || hostEl?.closest?.(SEL.TURN_ROOT)
      || hostEl?.closest?.(SEL.TURN_GROUP_HINT)
      || null;

    const candidates = [];
    const pushId = (raw) => {
      const id = String(raw || '').trim().replace(/^conversation-turn-/, '');
      if (!id) return;
      if (!candidates.includes(id)) candidates.push(id);
    };

    pushId(turnRoot?.getAttribute?.('data-turn-id'));
    pushId(turnRoot?.dataset?.turnId);
    pushId(turnRoot?.getAttribute?.('data-message-id'));
    pushId(turnRoot?.dataset?.messageId);
    pushId(turnRoot?.getAttribute?.('data-h2o-uid'));
    pushId(turnRoot?.dataset?.h2oUid);

    // Also try the qId from the user message element — most reliable for
    // unanswered turns (Q19 case) where the container carries no ID attrs.
    const userEl = (hostEl?.matches?.('[data-message-author-role="user"]'))
      ? hostEl
      : (turnRoot?.querySelector?.('[data-message-author-role="user"]') || null);
    if (userEl) {
      pushId(userEl.getAttribute?.('data-message-id'));
      pushId(userEl.dataset?.messageId);
      pushId(userEl.getAttribute?.('data-h2o-qwrap-id'));
      pushId(userEl.getAttribute?.('data-ho-qwrap-id'));
      try { pushId(W.H2O?.index?.getQId?.(userEl)); } catch {}
    }

    for (const id of candidates) {
      try {
        const record =
          rt.getTurnRecordByTurnId?.(id) ||
          rt.getTurnRecordByAId?.(id) ||
          rt.getTurnRecordByQId?.(id) ||
          null;
        const turnNo = readCanonicalTurnNumFromRecord(record);
        if (turnNo > 0) return turnNo;
      } catch {}
    }

    return 0;
  }

  function getCanonicalTurnNum(hostEl) {
    const fromPagination = getCanonicalTurnNumFromPaginationState(hostEl);
    if (fromPagination > 0) return fromPagination;

    const fromTurnRoot = getCanonicalTurnNumFromTurnRoot(hostEl);
    if (fromTurnRoot > 0) return fromTurnRoot;

    const rt = W.H2O?.turnRuntime || null;
    if (!rt) return 0;

    const qIdCandidates = [];
    const pushId = (raw) => {
      const id = String(raw || '').trim().replace(/^conversation-turn-/, '');
      if (!id) return;
      if (!qIdCandidates.includes(id)) qIdCandidates.push(id);
    };

    pushId(getStableQuestionIdFromElement(hostEl));
    pushId(W.H2O?.msg?.getIdFromEl?.(hostEl));
    pushId(hostEl?.getAttribute?.('data-message-id'));
    pushId(hostEl?.dataset?.messageId);
    pushId(hostEl?.getAttribute?.('data-turn-id'));
    pushId(hostEl?.dataset?.turnId);

    for (const qId of qIdCandidates) {
      try {
        const record =
          rt.getTurnRecordByQId?.(qId) ||
          rt.getTurnRecordByTurnId?.(qId) ||
          rt.getTurnRecordByAId?.(qId) ||
          null;
        const turnNo = readCanonicalTurnNumFromRecord(record);
        if (turnNo > 0) return turnNo;
      } catch {}
    }

    return 0;
  }

  function isPaginationEnabled() {
    try {
      return !!W.H2O_Pagination?.getPageInfo?.()?.enabled;
    } catch {
      return false;
    }
  }

  // Returns the 1-based count of answered turns (Q+A pairs) that appear at or
  // before hostEl in the full conversation DOM, regardless of page.
  // This is the correct user-visible turn number when canonical resolution fails.
  function getDomAnsweredTurnOrdinal(hostEl) {
    const root = findConversationRoot() || D;
    // Count conversation-turn nodes that contain an assistant message and appear
    // before (or contain) the hostEl in document order.
    const allTurns = qsa(SEL.TURN, root);
    let count = 0;
    for (const turn of allTurns) {
      // Does this turn have an assistant element (is it an answered turn)?
      const hasAnswer = !!turn.querySelector('[data-message-author-role="assistant"]');
      if (hasAnswer) count++;
      // Stop after we've passed the turn that contains hostEl.
      if (turn === hostEl || turn.contains(hostEl)) break;
      // If hostEl IS a turn node (user-only turn), also stop.
      if (hostEl === turn) break;
    }
    // If the turn containing hostEl is unanswered (count didn't increment for it),
    // return what we have (the count of answered turns before this one + 0 for this turn).
    return count > 0 ? count : 0;
  }

  function computeDisplayNumber(hostEl) {
    // 1) Canonical: pagination state (answerIndex) or turnRuntime.
    const canonicalTurnNum = getCanonicalTurnNum(hostEl);
    if (canonicalTurnNum > 0) return canonicalTurnNum;

    // 2) When pagination is on and canonical failed, use page-window offset.
    if (isPaginationEnabled()) {
      const fromPagedDom = getPaginationTurnNumFromDomWindow(hostEl);
      if (fromPagedDom > 0) return fromPagedDom;
    }

    // 3) DOM-based fallback: count answered turns up to and including this one.
    //    This handles the case where Q and A are separate turn nodes and the
    //    raw DOM ordinal would give wrong (doubled) numbers.
    const answeredOrdinal = getDomAnsweredTurnOrdinal(hostEl);
    if (answeredOrdinal > 0) return answeredOrdinal;

    // 4) Last resort: scan index.
    const scanNum = MOD.state.scanIndexByHost?.get(hostEl) || 0;
    return scanNum || ((MOD.state.scanIndexCounter || 0) + 1);
  }

  function parseEditInfoForHost(hostEl) {
    const st = MOD.state;
    const turnRoot = getTurnRoot(hostEl);
    const turnVersion = st.turnVersion.get(turnRoot) || 0;

    const cached = st.editCache.get(hostEl);
    if (cached && cached.turnRoot === turnRoot && cached.turnVersion === turnVersion) {
      return cached.value;
    }

    PERF.editRecomputes++;

    const userRect = hostEl.getBoundingClientRect();
    const candidates = qsa(SEL.EDIT_BADGE, turnRoot)
      .map((el) => ({ el, rect: el.getBoundingClientRect(), txt: (el.textContent || '').trim() }))
      .filter((x) => /^\d+\s*\/\s*\d+$/.test(x.txt));

    let best = null;
    let bestScore = Infinity;

    for (const c of candidates) {
      const dy = c.rect.top - userRect.bottom;
      if (dy < CFG.EDIT_SEARCH_DY_MIN || dy > CFG.EDIT_SEARCH_DY_MAX) continue;
      const score = Math.abs(dy);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    let value = '';
    if (best) {
      const m = best.txt.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (m) {
        const cur = parseInt(m[1], 10);
        const total = parseInt(m[2], 10);

        if (Number.isFinite(cur) && Number.isFinite(total) && total > 0) {
          if (CFG.SHOW_1_OF_1 || total !== 1) {
            let editCore = `${cur}/${total}`;
            if (CFG.EDIT_WRAP) editCore = `(${editCore})`;
            if (CFG.EDIT_PREFIX_SPACE) editCore = ` ${editCore}`;
            value = editCore;
          }
        }
      }
    }

    st.editCache.set(hostEl, { turnRoot, turnVersion, value });
    return value;
  }

  function getAnchor(hostEl) {
    const st = MOD.state;
    const cached = st.anchorCache.get(hostEl);
    if (cached && cached.isConnected && hostEl.contains(cached)) return cached;

    const bubble = hostEl.querySelector(SEL.BUBBLE);
    if (bubble) {
      st.anchorCache.set(hostEl, bubble);
      return bubble;
    }

    const qwrapBubble = hostEl.querySelector(SEL.QWRAP_BUBBLE);
    if (qwrapBubble) {
      st.anchorCache.set(hostEl, qwrapBubble);
      return qwrapBubble;
    }

    const qwrapText = hostEl.querySelector(SEL.QWRAP_TEXT);
    if (qwrapText) {
      st.anchorCache.set(hostEl, qwrapText);
      return qwrapText;
    }

    const prose = hostEl.querySelector(SEL.PROSE);
    if (prose) {
      st.anchorCache.set(hostEl, prose);
      return prose;
    }

    st.anchorCache.set(hostEl, hostEl);
    return hostEl;
  }

  function readPosition(hostEl) {
    const hostRect = hostEl.getBoundingClientRect();
    const anchor = getAnchor(hostEl);
    const anchorRect = anchor.getBoundingClientRect();

    let left = '';
    let right = '';
    let top = '';
    let transform = '';

    if (CFG.X_MODE === 'bubble') {
      const targetRightEdgeX = anchorRect.left - CFG.BUBBLE_GAP_PX;
      const rightPx = Math.max(0, Math.round(hostRect.right - targetRightEdgeX));
      right = `${rightPx}px`;
    } else if (CFG.X_MODE === 'rail') {
      right = `calc(var(--user-chat-width, 70%) + ${CFG.RAIL_GAP_PX}px)`;
    } else if (CFG.ABS_RIGHT_PX != null) {
      right = `${CFG.ABS_RIGHT_PX}px`;
    } else {
      left = `${CFG.ABS_LEFT_PX}px`;
    }

    if (CFG.Y_MODE === 'bubble-center') {
      const centerY = (anchorRect.top + (anchorRect.height / 2)) - hostRect.top + CFG.BUBBLE_CENTER_Y_OFFSET_PX;
      top = `${Math.round(centerY)}px`;
      transform = `translateY(-50%) scale(${CFG.SCALE})`;
    } else if (CFG.Y_MODE === 'host-center') {
      top = '50%';
      transform = `translateY(-50%) scale(${CFG.SCALE})`;
    } else {
      top = `${CFG.TOP_PX + CFG.TOP_EXTRA_PX}px`;
      transform = `scale(${CFG.SCALE})`;
    }

    return { left, right, top, transform };
  }

  function makeNumHTML(num, editStr) {
    return `
      <span class="${UI.MAIN_CLASS}">${num}</span>
      ${editStr ? `<span class="${UI.EDITS_CLASS}">${editStr}</span>` : ''}
    `.trim();
  }

  function markTurnDirtyByNode(node) {
    if (!node || node.nodeType !== 1) return;
    const st = MOD.state;
    const el = /** @type {Element} */ (node);

    const turnRoot = el.closest?.(SEL.TURN_ROOT)
      || el.closest?.(SEL.TURN_GROUP_HINT)
      || null;

    if (!turnRoot) return;
    const next = (st.turnVersion.get(turnRoot) || 0) + 1;
    st.turnVersion.set(turnRoot, next);
  }

  function scheduleUser(hostEl) {
    if (!hostEl || !(hostEl instanceof HTMLElement)) return;
    const st = MOD.state;
    st.pendingUsers.add(hostEl);
    st.anchorCache.delete(hostEl);
    st.userSeen.add(hostEl);
    PERF.deltaUpdates++;
    observeUser(hostEl);
    scheduleFlush();
  }

  function schedulePosition(hostEl) {
    if (!hostEl || !(hostEl instanceof HTMLElement)) return;
    const st = MOD.state;
    st.pendingPos.add(hostEl);
    scheduleFlush();
  }

  function scheduleVisibleReposition() {
    const st = MOD.state;
    if (st.posTimer) return;

    const elapsed = Date.now() - (st.lastPosTick || 0);
    const wait = Math.max(0, CFG.POS_THROTTLE_MS - elapsed);

    st.posTimer = setTimeout(() => {
      st.posTimer = 0;
      for (const el of st.visibleUsers) {
        if (el && el.isConnected) st.pendingPos.add(el);
      }
      scheduleFlush();
    }, wait);
  }

  function scheduleFlush() {
    const st = MOD.state;
    if (st.rafPending) return;
    st.rafPending = true;
    requestAnimationFrame(() => {
      st.rafPending = false;
      try { flush(); } catch (err) { DIAG.lastErr = String(err); }
    });
  }

  function scheduleFullScan() {
    MOD.state.needFull = true;
    scheduleFlush();
  }

  function scheduleFullScanDebounced() {
    const st = MOD.state;
    if (st.fullDebounceT) clearTimeout(st.fullDebounceT);
    st.fullDebounceT = setTimeout(() => {
      st.fullDebounceT = 0;
      scheduleFullScan();
    }, CFG.BUS_DEBOUNCE_MS);
  }

  function fullScanUsers() {
    const st = MOD.state;
    st.scanIndexByHost = new WeakMap();
    st.scanIndexCounter = 0;

    const users = qsa(SEL.USER_MSG);
    for (let i = 0; i < users.length; i++) {
      const host = users[i];
      st.scanIndexByHost.set(host, i + 1);
      st.scanIndexCounter = i + 1;
      st.userSeen.add(host);
      observeUser(host);
      st.pendingUsers.add(host);
    }

    PERF.fullScans++;
  }

  function applyPatch(patch) {
    if (!patch?.host || !(patch.host instanceof HTMLElement)) return;

    ensureHostFallback(patch.host);
    const numEl = ensureNumNode(patch.host);

    if (patch.numSig && numEl.getAttribute(ATTR.SIG_NUM) !== patch.numSig) {
      numEl.className = `${UI.NUM_CLASS} ${digitClass(patch.num)}`;
      numEl.innerHTML = makeNumHTML(patch.num, patch.editStr);
      setAttr(numEl, ATTR.SIG_NUM, patch.numSig);
    }

    if (patch.pos) {
      const posSig = `${patch.pos.left}|${patch.pos.right}|${patch.pos.top}|${patch.pos.transform}`;
      if (numEl.getAttribute(ATTR.SIG_POS) !== posSig) {
        numEl.style.left = patch.pos.left;
        numEl.style.right = patch.pos.right;
        numEl.style.top = patch.pos.top;
        numEl.style.transform = patch.pos.transform;
        setAttr(numEl, ATTR.SIG_POS, posSig);
      }
      PERF.positionedVisibleCount++;
    }
  }

  function unobserveDeadUsers() {
    const st = MOD.state;
    for (const el of Array.from(st.ioObserved)) {
      if (el && el.isConnected) continue;
      try { st.io?.unobserve?.(el); } catch {}
      st.ioObserved.delete(el);
      st.visibleUsers.delete(el);
      st.pendingUsers.delete(el);
      st.pendingPos.delete(el);
    }
  }

  function flush() {
    const st = MOD.state;

    if (st.needFull) {
      st.needFull = false;
      st.pendingUsers.clear();
      st.pendingPos.clear();
      attachMO();
      fullScanUsers();
    }

    unobserveDeadUsers();

    const work = new Map();

    let takeUsers = 0;
    for (const host of Array.from(st.pendingUsers)) {
      st.pendingUsers.delete(host);
      if (!host?.isConnected) continue;
      work.set(host, { host, doNumber: true, doPos: st.visibleUsers.has(host) });
      takeUsers++;
      if (takeUsers >= CFG.INC_PER_FRAME) break;
    }

    let takePos = 0;
    for (const host of Array.from(st.pendingPos)) {
      st.pendingPos.delete(host);
      if (!host?.isConnected) continue;
      const item = work.get(host) || { host, doNumber: false, doPos: true };
      item.doPos = true;
      work.set(host, item);
      takePos++;
      if (takePos >= CFG.POS_PER_FRAME) break;
    }

    const patches = [];

    for (const item of work.values()) {
      const host = item.host;

      let num = null;
      let editStr = '';
      let numSig = '';

      if (item.doNumber) {
        num = computeDisplayNumber(host);
        editStr = parseEditInfoForHost(host);
        numSig = `${num}|${editStr}`;
      }

      let pos = null;
      if (item.doPos) {
        pos = readPosition(host);
      }

      patches.push({ host, num, editStr, numSig, pos });
    }

    for (const patch of patches) applyPatch(patch);

    st.lastPosTick = Date.now();

    if (st.pendingUsers.size || st.pendingPos.size) scheduleFlush();
  }

  function ensureVisibleIO() {
    const st = MOD.state;
    if (st.io) return st.io;
    if (typeof IntersectionObserver !== 'function') return null;

    st.io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const host = entry.target;
        if (!host || !(host instanceof HTMLElement)) continue;

        if (entry.isIntersecting) {
          st.visibleUsers.add(host);
          const hasNum = !!host.querySelector(`.${UI.NUM_CLASS}`);
          if (!hasNum) st.pendingUsers.add(host);
          else st.pendingPos.add(host);
        } else {
          st.visibleUsers.delete(host);
        }
      }

      scheduleFlush();
    }, { root: null, rootMargin: '120px 0px 120px 0px', threshold: 0.01 });

    return st.io;
  }

  function observeUser(hostEl) {
    const st = MOD.state;
    const io = ensureVisibleIO();
    if (!io) return;
    if (st.ioObserved.has(hostEl)) return;
    try { io.observe(hostEl); } catch {}
    st.ioObserved.add(hostEl);
  }

  function disconnectVisibleIO() {
    const st = MOD.state;
    if (!st.io) return;
    try { st.io.disconnect(); } catch {}
    st.io = null;
    st.ioObserved.clear();
    st.visibleUsers.clear();
  }

  function collectUserCandidate(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL.USER_MSG)) {
      out.add(el);
      return false;
    }

    const cc = el.childElementCount || 0;
    if (cc === 0) return false;
    if (cc > CFG.MAX_DELTA_CHILDREN) return true;

    const hit = el.querySelector?.(SEL.USER_MSG);
    if (hit) out.add(hit);
    return false;
  }

  function attachMO() {
    const st = MOD.state;
    const root = findConversationRoot();
    if (!root) return;
    if (st.mo && st.moRoot === root) return;

    if (st.mo) {
      try { st.mo.disconnect(); } catch {}
      st.mo = null;
    }

    st.moRoot = root;
    st.mo = new MutationObserver((muts) => {
      const hit = new Set();
      let needRepair = false;

      for (const m of muts) {
        markTurnDirtyByNode(m.target);
        if (m.addedNodes?.length) {
          for (const node of m.addedNodes) {
            markTurnDirtyByNode(node);
            if (collectUserCandidate(node, hit)) needRepair = true;
          }
        }
        if (m.removedNodes?.length) {
          for (const node of m.removedNodes) {
            markTurnDirtyByNode(node);
          }
        }
      }

      if (hit.size) {
        for (const host of hit) {
          if (!st.scanIndexByHost.has(host)) {
            st.scanIndexCounter = (st.scanIndexCounter || 0) + 1;
            st.scanIndexByHost.set(host, st.scanIndexCounter);
            st.orderDirty = true;
          }
          scheduleUser(host);
        }
      }

      if (st.orderDirty || needRepair) {
        st.orderDirty = false;
        scheduleFullScanDebounced();
      }
    });

    st.mo.observe(root, { childList: true, subtree: true });
  }

  function detachMO() {
    const st = MOD.state;
    if (!st.mo) return;
    try { st.mo.disconnect(); } catch {}
    st.mo = null;
    st.moRoot = null;
  }

  function hookCore() {
    const st = MOD.state;
    if (st.coreHooked) return;
    if (!W.H2O?.bus) return;
    st.coreHooked = true;

    const onCoreRefresh = () => scheduleFullScanDebounced();

    try {
      W.H2O.bus.on(EV.BUS_INDEX_UPDATED, onCoreRefresh);
      W.H2O.bus.on(EV.BUS_TURN_UPDATED, onCoreRefresh);
    } catch {}

    W.addEventListener(EV.INDEX_UPDATED_WIN, onCoreRefresh, { passive: true });
    W.addEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh, { passive: true });

    st.cleanup.push(() => W.removeEventListener(EV.INDEX_UPDATED_WIN, onCoreRefresh));
    st.cleanup.push(() => W.removeEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh));
  }

  function onRouteChanged() {
    const st = MOD.state;
    st.scanIndexByHost = new WeakMap();
    st.editCache = new WeakMap();
    st.anchorCache = new WeakMap();
    st.turnVersion = new WeakMap();
    st.pendingUsers.clear();
    st.pendingPos.clear();

    disconnectVisibleIO();
    attachMO();
    scheduleFullScanDebounced();
  }

  function boot() {
    if (W[KEY_INIT_BOOT]) return;
    W[KEY_INIT_BOOT] = true;

    const st = MOD.state;
    st.cleanup = st.cleanup || [];
    st.pendingUsers = st.pendingUsers || new Set();
    st.pendingPos = st.pendingPos || new Set();
    st.userSeen = st.userSeen || new WeakSet();
    st.visibleUsers = st.visibleUsers || new Set();
    st.ioObserved = st.ioObserved || new Set();
    st.scanIndexByHost = st.scanIndexByHost || new WeakMap();
    st.scanIndexCounter = st.scanIndexCounter || 0;
    st.editCache = st.editCache || new WeakMap();
    st.anchorCache = st.anchorCache || new WeakMap();
    st.turnVersion = st.turnVersion || new WeakMap();

    st.rafPending = false;
    st.needFull = false;
    st.fullDebounceT = 0;
    st.lastPosTick = 0;
    st.posTimer = 0;
    st.mo = null;
    st.moRoot = null;
    st.io = null;
    st.coreHooked = false;

    initPerf();
    injectCSSOnce();

    attachMO();
    hookCore();
    W.addEventListener(EV.CORE_READY, hookCore, { once: true });
    st.cleanup.push(() => W.removeEventListener(EV.CORE_READY, hookCore));

    W.addEventListener(EV.ROUTE_CHANGED, onRouteChanged, true);
    W.addEventListener('popstate', onRouteChanged, true);
    W.addEventListener('hashchange', onRouteChanged, true);

    st.cleanup.push(() => W.removeEventListener(EV.ROUTE_CHANGED, onRouteChanged, true));
    st.cleanup.push(() => W.removeEventListener('popstate', onRouteChanged, true));
    st.cleanup.push(() => W.removeEventListener('hashchange', onRouteChanged, true));

    // When pagination is toggled on or off, canonical turn numbers change.
    // Re-scan all visible question nodes after a short delay so Core/Pagination
    // finish updating before we re-read turn numbers.
    const onPaginationConfigChanged = () => {
      setTimeout(() => scheduleFullScanDebounced(), 100);
    };
    W.addEventListener('evt:h2o:pagination:configchanged', onPaginationConfigChanged, { passive: true });
    st.cleanup.push(() => W.removeEventListener('evt:h2o:pagination:configchanged', onPaginationConfigChanged));

    const onScroll = () => scheduleVisibleReposition();
    const onResize = () => scheduleVisibleReposition();
    const onClick = () => setTimeout(scheduleVisibleReposition, 40);

    W.addEventListener('scroll', onScroll, { passive: true });
    W.addEventListener('resize', onResize, { passive: true });
    D.addEventListener('click', onClick, true);

    st.cleanup.push(() => W.removeEventListener('scroll', onScroll));
    st.cleanup.push(() => W.removeEventListener('resize', onResize));
    st.cleanup.push(() => D.removeEventListener('click', onClick, true));

    scheduleFullScan();
  }

  function dispose() {
    if (!W[KEY_INIT_BOOT]) return;

    const st = MOD.state;
    const cleanup = st.cleanup || [];

    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    if (st.fullDebounceT) clearTimeout(st.fullDebounceT);
    st.fullDebounceT = 0;
    if (st.posTimer) clearTimeout(st.posTimer);
    st.posTimer = 0;

    detachMO();
    disconnectVisibleIO();

    if (PERF.ticker) {
      try { clearInterval(PERF.ticker); } catch {}
      PERF.ticker = 0;
    }

    W[KEY_INIT_BOOT] = false;
  }

  MOD.api.boot = boot;
  MOD.api.dispose = dispose;
  MOD.api.rescan = scheduleFullScan;

  boot();
})();