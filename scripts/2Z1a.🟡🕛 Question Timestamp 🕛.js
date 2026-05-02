// ==UserScript==
// @h2o-id             2z1a.question.timestamp
// @name               2Z1a.🟡🕛 Question Timestamp 🕛
// @namespace          H2O.Premium.CGX.question.timestamp
// @author             HumamDev
// @version            2.1.0
// @revision           001
// @build              260304-102754
// @description        Timestamp under USER question. Normal: timestamp shows on hover. Short questions: on hover show toolbar first, then hide toolbar and show timestamp (no overlap, no jitter). Contract v2 Stage-1 spine + QWrapper-aware anchor.
// @match              https://chatgpt.com/*
// @run-at             document-end
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* =============================================================================
   * 🧱 H2O Module Standard — Contract (v2.0) — Stage 1: Foundation/Mechanics
   * - Identity-first, registries, cgxui-only hooks (alongside legacy-safe fallbacks),
   *   boot/dispose, cleanup, Core-aware time formatting.
   * ============================================================================= */

  /* ───────────────────────────── 0) IDENTITY ───────────────────────────── */

  /** @core Identity + namespace anchors (Contract v2.0) */
  const TOK = 'QT';                // functions: CORE_QT_*, DOM_QT_*, UI_QT_*
  const PID = 'qts';
  const CID = 'QTIMESTAMP';
  const SkID = 'qts';              // STRICT casing per contract

  const MODTAG = 'QTimestamp';
  const MODICON = '⏳';
  const EMOJI_HDR = '🟠';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Aliases (readability only; NOT new identities)
  const DsID = PID;
  const BrID = PID;

  /* ───────────────────────────── 1) REGISTRIES ───────────────────────────── */

  /** @core Selectors (no raw strings outside SEL_) */
  const SEL_QTIMESTAMP_ = Object.freeze({
    USER_MSG: 'div[data-message-author-role="user"]',
    TURN_ROOT_A: '.group\\/turn-messages',
    TURN_ROOT_B: '[class~="group/turn-messages"]',
    CONV_TURNS: '[data-testid="conversation-turns"]',
    CONV_TURN: '[data-testid="conversation-turn"]',
    MAIN: 'main',

    COPY_BTN: 'button[data-testid="copy-turn-action-button"]',
    INNER_ROW: 'div.flex.flex-wrap.items-center',
    OUTER_BAR: 'div.z-0.flex.justify-end',

    // Anchor candidates (prefer QWrapper’s text host, then normal user text)
    ANCHOR: [
      '.cgxui-qswr-text',        // ✅ new QWrapper target (best)
      '.ho-qwrap-text',          // legacy QWrapper
      '.whitespace-pre-wrap',
      '[data-testid="user-message"]',
      '.prose',
      '.markdown',
      '[class*="markdown"]',
      '[class*="prose"]',
      'p'
    ].join(','),
  });

  /** @core Attributes (cgxui-only + internal markers) */
  const ATTR_QTIMESTAMP_ = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI:    'data-cgxui',
    STATE: 'data-cgxui-state',

    INLINE: 'data-cgxui-qts-inline',
    BAR:    'data-cgxui-qts-bar',
    ICONS:  'data-cgxui-qts-icons',

    BOUND:  'data-cgxui-qts-bound',
  });

  /** @core CSS token registry */
  const CSS_QTIMESTAMP_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
    // legacy-safe: if older style exists, do not duplicate
    LEGACY_STYLE_IDS: ['h2o-qts-style', 'ho-qts-style', 'cgxui-qts-style'],
    // scoped classes
    CLS_INLINE: `cgxui-${SkID}-inline`,
    CLS_SHORT:  `cgxui-${SkID}--short`,
    CLS_SHOWTS: `cgxui-${SkID}--showts`,
    CLS_HIDEIC: `cgxui-${SkID}--hideicons`,
  });

  /** @core Config */
  const CFG_QTIMESTAMP_ = Object.freeze({
    SHORT_Q_MAX_PX: 260, // <= this width => "short question"
    DELAY_MS: 1500,      // toolbar visible first, then timestamp
    RESCAN_T1_MS: 800,
    UPDATE_MIN_MS: 200,
    MO_MAX_NODE_CHILDREN: 24,
  });

  /** @core Event topics (listen only; do not assume present) */
  const EV_QTIMESTAMP_ = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    INDEX_UPDATED: 'h2o:index:updated',
    TURN_UPDATED: 'h2o:turn:updated',
    Q_SCAN: 'h2o:questions:scan',
    BUS_INDEX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
    ROUTE_CHANGED: 'evt:h2o:route:changed',
    QWRAP_WRAPPED: 'h2o:qwrap:wrapped',
  });

  const KEY_QTIMESTAMP_PERF = 'h2o:perf';

  /* ───────────────────────────── 2) VAULT + BOUNDED DIAG ───────────────────────────── */

  /** @core Module vault (H2O[TOK][PID]) + bounded DIAG (H2O[TOK][BrID].diag) */
  const W = window;

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  W.H2O[TOK][PID] = W.H2O[TOK][PID] || {};

  const MOD = W.H2O[TOK][PID];
  MOD.diag  = MOD.diag  || {};
  MOD.state = MOD.state || {};
  MOD.api   = MOD.api   || {};

  W.H2O[TOK][BrID] = W.H2O[TOK][BrID] || {};
  W.H2O[TOK][BrID].diag = W.H2O[TOK][BrID].diag || MOD.diag;

  const DIAG = W.H2O[TOK][BrID].diag;

  /* ───────────────────────────── 3) TIME FORMAT ───────────────────────────── */

  /** @helper */
  const UTIL_QTIMESTAMP_pad2 = (n) => String(n).padStart(2, '0');

  /** @helper */
  function UTIL_QTIMESTAMP_formatTimestamp(epochSeconds) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const d = new Date(epochSeconds * 1000);
    return `${months[d.getMonth()]} ${d.getDate()} - ${UTIL_QTIMESTAMP_pad2(d.getHours())}:${UTIL_QTIMESTAMP_pad2(d.getMinutes())}`;
  }

  /* ───────────────────────────── 4) REACT create_time FALLBACK ───────────────────────────── */

  /** @helper */
  function DOM_QT_getReactHandle(el) {
    const k = Object.keys(el || {}).find(x => x.startsWith('__reactFiber$') || x.startsWith('__reactProps$'));
    return k ? { key: k, value: el[k] } : null;
  }

  /** @helper */
  function DOM_QT_findCreateTimeFromReact(el) {
    const h = DOM_QT_getReactHandle(el);
    if (!h) return null;

    if (h.key.startsWith('__reactProps$')) {
      const p = h.value;
      const t = p?.messages?.[0]?.create_time ?? p?.message?.create_time ?? null;
      return (typeof t === 'number' && isFinite(t)) ? t : null;
    }

    let f = h.value;
    for (let i = 0; i < 18 && f; i++) {
      const mp = f.memoizedProps;
      const t =
        mp?.messages?.[0]?.create_time ??
        mp?.message?.create_time ??
        mp?.children?.props?.messages?.[0]?.create_time ??
        mp?.children?.props?.message?.create_time ??
        null;
      if (typeof t === 'number' && isFinite(t)) return t;
      f = f.return;
    }
    return null;
  }

  /* ───────────────────────────── 5) DOM HELPERS ───────────────────────────── */

  /** @helper */
  function DOM_QT_findTurnRoot(userMsgDiv) {
    let el = userMsgDiv;
    for (let i = 0; i < 12 && el; i++) {
      if (el.classList?.contains('group/turn-messages')) return el;
      if (el.querySelector?.(SEL_QTIMESTAMP_.COPY_BTN)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** @helper */
  function DOM_QT_findQuestionAnchor(userMsgDiv) {
    const root = userMsgDiv;
    const candidates = Array.from(root.querySelectorAll(SEL_QTIMESTAMP_.ANCHOR));
    for (const el of candidates) {
      const t = (el.textContent || '').trim();
      if (t) return el;
    }
    return userMsgDiv;
  }

  /** @helper */
  function DOM_QT_getConversationRoot() {
    return (
      document.querySelector(SEL_QTIMESTAMP_.CONV_TURNS) ||
      document.querySelector(SEL_QTIMESTAMP_.CONV_TURN)?.parentElement ||
      document.querySelector(SEL_QTIMESTAMP_.MAIN) ||
      null
    );
  }

  /* ───────────────────────────── 6) BUILD / POSITION TIMESTAMP ───────────────────────────── */

  /** @critical */
  function DOM_QT_ensureTimestamp(userMsgDiv) {
    const ts =
      W.H2O?.time?.getCreateTime?.(userMsgDiv) ||
      DOM_QT_findCreateTimeFromReact(userMsgDiv);

    if (!ts) return null;

    const turnRoot = DOM_QT_findTurnRoot(userMsgDiv);
    if (!turnRoot) return null;

    const copyBtn = turnRoot.querySelector(SEL_QTIMESTAMP_.COPY_BTN);
    if (!copyBtn) return null;

    const innerRow = copyBtn.closest(SEL_QTIMESTAMP_.INNER_ROW);
    if (!innerRow) return null;

    innerRow.setAttribute(ATTR_QTIMESTAMP_.ICONS, '1');

    const outerBar = innerRow.closest(SEL_QTIMESTAMP_.OUTER_BAR);
    if (!outerBar) return null;

    outerBar.setAttribute(ATTR_QTIMESTAMP_.BAR, '1');
    outerBar.setAttribute(ATTR_QTIMESTAMP_.OWNER, SkID);
    outerBar.setAttribute(ATTR_QTIMESTAMP_.UI, `${SkID}-bar`);

    const text = W.H2O?.time?.format?.(ts) || UTIL_QTIMESTAMP_formatTimestamp(ts);

    let inline = outerBar.querySelector(`div[${ATTR_QTIMESTAMP_.INLINE}="1"]`);
    if (!inline) {
      inline = document.createElement('div');
      inline.className = CSS_QTIMESTAMP_.CLS_INLINE;
      inline.setAttribute(ATTR_QTIMESTAMP_.INLINE, '1');
      inline.setAttribute(ATTR_QTIMESTAMP_.OWNER, SkID);
      inline.setAttribute(ATTR_QTIMESTAMP_.UI, `${SkID}-inline`);
      outerBar.insertBefore(inline, outerBar.firstChild);
    }
    inline.textContent = text;

    // Align to question left edge (stable, no clamping loops)
    const anchor = DOM_QT_findQuestionAnchor(userMsgDiv);
    const barRect = outerBar.getBoundingClientRect();
    const aRect   = anchor.getBoundingClientRect();
    const left = Math.max(0, Math.round(aRect.left - barRect.left));
    inline.style.setProperty(`--cgxui-${SkID}-left`, `${left}px`);

    return { turnRoot, anchorRect: aRect };
  }

  /* ───────────────────────────── 7) HOVER SEQUENCING (SHORT QUESTIONS) ───────────────────────────── */

  /** @critical */
  function DOM_QT_bindTurn(turnRoot) {
    if (!turnRoot || turnRoot.getAttribute(ATTR_QTIMESTAMP_.BOUND) === '1') return;
    turnRoot.setAttribute(ATTR_QTIMESTAMP_.BOUND, '1');

    const userMsgDiv = turnRoot.querySelector(SEL_QTIMESTAMP_.USER_MSG);
    if (!userMsgDiv) return;

    let tHide = null;

    const reset = () => {
      if (tHide) { clearTimeout(tHide); tHide = null; }
      turnRoot.classList.remove(CSS_QTIMESTAMP_.CLS_SHORT, CSS_QTIMESTAMP_.CLS_SHOWTS, CSS_QTIMESTAMP_.CLS_HIDEIC);
    };

    const onEnter = () => {
      reset();

      // Build timestamp + measure once (no jitter loops)
      const info = DOM_QT_ensureTimestamp(userMsgDiv);
      if (!info) return;

      const isShort = info.anchorRect.width > 2 && info.anchorRect.width <= CFG_QTIMESTAMP_.SHORT_Q_MAX_PX;
      if (!isShort) return; // normal behavior handled by CSS hover

      // Short mode: show toolbar first, then swap to timestamp
      turnRoot.classList.add(CSS_QTIMESTAMP_.CLS_SHORT);

      tHide = setTimeout(() => {
        turnRoot.classList.add(CSS_QTIMESTAMP_.CLS_HIDEIC, CSS_QTIMESTAMP_.CLS_SHOWTS);
      }, CFG_QTIMESTAMP_.DELAY_MS);
    };

    turnRoot.addEventListener('mouseenter', onEnter, { passive: true });
    turnRoot.addEventListener('mouseleave', reset, { passive: true });
    turnRoot.addEventListener('focusin', onEnter, { passive: true });
    turnRoot.addEventListener('focusout', reset, { passive: true });

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      turnRoot.removeEventListener('mouseenter', onEnter);
      turnRoot.removeEventListener('mouseleave', reset);
      turnRoot.removeEventListener('focusin', onEnter);
      turnRoot.removeEventListener('focusout', reset);
      reset();
      try { turnRoot.removeAttribute(ATTR_QTIMESTAMP_.BOUND); } catch {}
    });
  }

  /* ───────────────────────────── 8) SCAN + SCHEDULER ───────────────────────────── */

  /** @helper */
  function DOM_QT_markDirtyUser(userMsgDiv) {
    if (!userMsgDiv || userMsgDiv.nodeType !== 1) return;
    if (!userMsgDiv.matches?.(SEL_QTIMESTAMP_.USER_MSG)) return;
    const st = MOD.state;
    st.dirtyUsers = st.dirtyUsers || new Set();
    st.dirtyUsers.add(userMsgDiv);
  }

  /** @helper */
  function DOM_QT_collectDirtyUsersFromNode(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    if (el.matches?.(SEL_QTIMESTAMP_.USER_MSG)) {
      out.add(el);
      return false;
    }

    const childCount = el.childElementCount || 0;
    if (childCount > CFG_QTIMESTAMP_.MO_MAX_NODE_CHILDREN) return true;

    const firstUser = el.querySelector?.(SEL_QTIMESTAMP_.USER_MSG);
    if (firstUser) {
      out.add(firstUser);
      const isTurnLike = (
        el.matches?.(SEL_QTIMESTAMP_.TURN_ROOT_A) ||
        el.matches?.(SEL_QTIMESTAMP_.TURN_ROOT_B)
      );
      if (isTurnLike && childCount <= 6) {
        const users = el.querySelectorAll?.(SEL_QTIMESTAMP_.USER_MSG);
        if (users?.length) users.forEach((u) => out.add(u));
      }
    }

    const turnRoot = (
      el.matches?.(SEL_QTIMESTAMP_.TURN_ROOT_A) ||
      el.matches?.(SEL_QTIMESTAMP_.TURN_ROOT_B)
    )
      ? el
      : el.closest?.(`${SEL_QTIMESTAMP_.TURN_ROOT_A},${SEL_QTIMESTAMP_.TURN_ROOT_B}`);
    if (!turnRoot) return false;
    const relatedUser = turnRoot.querySelector?.(SEL_QTIMESTAMP_.USER_MSG);
    if (relatedUser) out.add(relatedUser);
    return false;
  }

  /** @helper */
  function DOM_QT_scan(users = null) {
    const list = Array.isArray(users)
      ? users.filter((el) => !!el && el.isConnected && el.matches?.(SEL_QTIMESTAMP_.USER_MSG))
      : [];
    if (list.length) {
      for (const userMsgDiv of list) {
        const turnRoot = DOM_QT_findTurnRoot(userMsgDiv);
        if (turnRoot) DOM_QT_bindTurn(turnRoot);
      }
      for (const userMsgDiv of list) {
        DOM_QT_ensureTimestamp(userMsgDiv);
      }
      return list.length;
    }

    const turns = document.querySelectorAll(`${SEL_QTIMESTAMP_.TURN_ROOT_A},${SEL_QTIMESTAMP_.TURN_ROOT_B}`);
    turns.forEach(DOM_QT_bindTurn);

    const usersAll = document.querySelectorAll(SEL_QTIMESTAMP_.USER_MSG);
    usersAll.forEach(DOM_QT_ensureTimestamp);
    return usersAll.length;
  }

  /** @helper */
  function CORE_QT_perfTick(reason = 'scan') {
    const st = MOD.state;
    if (!st.perfEnabled) return;
    const now = Date.now();
    if (!st.perfWindowStartAt) st.perfWindowStartAt = now;
    if ((now - st.perfWindowStartAt) >= 1000) {
      try { console.log(`[QTimestamp][perf] runs/s=${Number(st.perfRunsInWindow || 0)} reason=${reason}`); } catch {}
      st.perfWindowStartAt = now;
      st.perfRunsInWindow = 0;
    }
    st.perfRunsInWindow = Number(st.perfRunsInWindow || 0) + 1;
    try { console.count('[QTimestamp] run'); } catch {}
  }

  /** @helper */
  function CORE_QT_runNow(reason = 'scan') {
    const st = MOD.state;
    st.lastRunAt = Date.now();
    const users = st.dirtyUsers ? Array.from(st.dirtyUsers) : [];
    const runFull = !!st.pendingFullScan;
    if (st.dirtyUsers) st.dirtyUsers.clear();
    st.pendingFullScan = false;
    if (!runFull && users.length === 0) return;
    DOM_QT_scan(runFull ? null : users);
    CORE_QT_perfTick(reason);
  }

  /** @helper */
  function CORE_QT_schedule(reason = 'event', opts = null) {
    const st = MOD.state;
    if (opts?.full) st.pendingFullScan = true;
    if (Array.isArray(opts?.users)) opts.users.forEach(DOM_QT_markDirtyUser);
    const elapsed = Date.now() - Number(st.lastRunAt || 0);
    const delay = Math.max(0, Number(CFG_QTIMESTAMP_.UPDATE_MIN_MS || 200) - elapsed);
    if (st.runTimer || st.runRaf) return;
    const queueRaf = () => {
      st.runTimer = 0;
      st.runRaf = requestAnimationFrame(() => {
        st.runRaf = 0;
        CORE_QT_runNow(reason);
      });
    };
    if (delay > 0) st.runTimer = setTimeout(queueRaf, delay);
    else queueRaf();
  }

  /* ───────────────────────────── 9) CSS ───────────────────────────── */

  /** @critical */
  function UI_QT_injectCSSOnce() {
    if (document.getElementById(CSS_QTIMESTAMP_.STYLE_ID)) return;
    for (const id of CSS_QTIMESTAMP_.LEGACY_STYLE_IDS) {
      if (document.getElementById(id)) return;
    }

    const style = document.createElement('style');
    style.id = CSS_QTIMESTAMP_.STYLE_ID;
    style.textContent = `
/* QTimestamp (cgxui-${SkID}) — bar host */
${SEL_QTIMESTAMP_.OUTER_BAR}[${ATTR_QTIMESTAMP_.BAR}="1"]{
  position: relative !important;
  overflow: visible !important;
}

/* Timestamp element */
.${CSS_QTIMESTAMP_.CLS_INLINE}{
  position: absolute !important;
  top: 50%;
  left: var(--cgxui-${SkID}-left, 0px);
  transform: translateY(-50%);
  white-space: nowrap;

  font-size: 12px;
  font-weight: 200;
  font-family: ui-monospace, "SF Mono", Monaco, monospace;
  color: rgba(160,160,160,0.95);

  user-select: none;
  pointer-events: none;

  opacity: 0;
  transition: opacity 160ms ease;
}

/* Normal behavior: show timestamp on hover */
${SEL_QTIMESTAMP_.TURN_ROOT_A}:hover .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_A}:focus-within .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_B}:hover .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_B}:focus-within .${CSS_QTIMESTAMP_.CLS_INLINE}{
  opacity: 0.92;
}

/* Short mode: do NOT show timestamp immediately on hover */
${SEL_QTIMESTAMP_.TURN_ROOT_A}.${CSS_QTIMESTAMP_.CLS_SHORT}:hover .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_A}.${CSS_QTIMESTAMP_.CLS_SHORT}:focus-within .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_B}.${CSS_QTIMESTAMP_.CLS_SHORT}:hover .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_B}.${CSS_QTIMESTAMP_.CLS_SHORT}:focus-within .${CSS_QTIMESTAMP_.CLS_INLINE}{
  opacity: 0 !important;
}

/* Short mode: after delay, show timestamp */
${SEL_QTIMESTAMP_.TURN_ROOT_A}.${CSS_QTIMESTAMP_.CLS_SHORT}.${CSS_QTIMESTAMP_.CLS_SHOWTS} .${CSS_QTIMESTAMP_.CLS_INLINE},
${SEL_QTIMESTAMP_.TURN_ROOT_B}.${CSS_QTIMESTAMP_.CLS_SHORT}.${CSS_QTIMESTAMP_.CLS_SHOWTS} .${CSS_QTIMESTAMP_.CLS_INLINE}{
  opacity: 0.92 !important;
}

/* Short mode: after delay, hide EVERYTHING in the bar except the timestamp */
${SEL_QTIMESTAMP_.TURN_ROOT_B}.${CSS_QTIMESTAMP_.CLS_SHORT}.${CSS_QTIMESTAMP_.CLS_HIDEIC}
${SEL_QTIMESTAMP_.OUTER_BAR}[${ATTR_QTIMESTAMP_.BAR}="1"] > :not(.${CSS_QTIMESTAMP_.CLS_INLINE}){
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity 120ms ease !important;
}

${SEL_QTIMESTAMP_.TURN_ROOT_B}.${CSS_QTIMESTAMP_.CLS_SHORT}.${CSS_QTIMESTAMP_.CLS_HIDEIC} .tabular-nums{
  opacity: 0 !important;
  pointer-events: none !important;
}
    `.trim();

    document.documentElement.appendChild(style);

    MOD.state.styleEl = style;
    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { style.remove(); } catch {}
      MOD.state.styleEl = null;
    });
  }

  /* ───────────────────────────── 10) CORE HOOK + FALLBACK MO ───────────────────────────── */

  /** @critical */
  function CORE_QT_detachFallbackMO() {
    const st = MOD.state;
    if (st.mo) {
      try { st.mo.disconnect(); } catch {}
      st.mo = null;
    }
    st.moRoot = null;
  }

  /** @critical */
  function CORE_QT_attachFallbackMO() {
    const st = MOD.state;
    const root = DOM_QT_getConversationRoot() || document.body;
    if (st.mo && st.moRoot === root) return;
    CORE_QT_detachFallbackMO();

    st.mo = new MutationObserver((mutations) => {
      const dirty = new Set();
      let needFull = false;
      for (const m of mutations || []) {
        const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
        for (const n of nodes) {
          if (DOM_QT_collectDirtyUsersFromNode(n, dirty)) needFull = true;
        }
      }
      CORE_QT_schedule('mo', { users: Array.from(dirty), full: needFull });
    });
    st.mo.observe(root, { childList: true, subtree: true });
    st.moRoot = root;
    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      CORE_QT_detachFallbackMO();
    });
  }

  /** @critical */
  function CORE_QT_getObserverHub() {
    const hub = W.H2O?.obs;
    if (!hub || typeof hub !== 'object') return null;
    for (const key of ['ensureRoot', 'onReady', 'onMutations']) {
      if (typeof hub[key] !== 'function') return null;
    }
    return hub;
  }

  /** @critical */
  function CORE_QT_unbindObserverHub() {
    const st = MOD.state;
    const hub = CORE_QT_getObserverHub();

    if (typeof st.obsOffReady === 'function') {
      const off = st.obsOffReady;
      st.obsOffReady = null;
      try { off(); } catch {}
    } else if (hub && typeof hub.off === 'function') {
      try { hub.off('question-timestamp:ready'); } catch {}
    } else {
      st.obsOffReady = null;
    }

    if (typeof st.obsOffMut === 'function') {
      const off = st.obsOffMut;
      st.obsOffMut = null;
      try { off(); } catch {}
    } else if (hub && typeof hub.off === 'function') {
      try { hub.off('question-timestamp:mut'); } catch {}
    } else {
      st.obsOffMut = null;
    }
  }

  /** @critical */
  function CORE_QT_hasHubBinding() {
    const st = MOD.state;
    return (typeof st.obsOffReady === 'function') || (typeof st.obsOffMut === 'function');
  }

  /** @critical */
  function CORE_QT_bindObserverHub(reason = 'bind') {
    const st = MOD.state;
    const hub = CORE_QT_getObserverHub();
    if (!hub) {
      CORE_QT_unbindObserverHub();
      return false;
    }

    try { hub.ensureRoot(`question-timestamp:${String(reason || 'bind')}`); } catch {}

    if (!CORE_QT_hasHubBinding()) {
      st.obsOffReady = hub.onReady('question-timestamp:ready', () => {
        CORE_QT_detachFallbackMO();
        CORE_QT_schedule('hub:ready', { full: true });
      }, { immediate: true });

      st.obsOffMut = hub.onMutations('question-timestamp:mut', (payload) => {
        if (!payload?.conversationRelevant) return;

        const dirty = new Set();
        let needFull = !!(payload.hasRemoved || payload.removedTurnLike || payload.removedAnswerLike);

        for (const node of Array.isArray(payload.addedElements) ? payload.addedElements : []) {
          if (DOM_QT_collectDirtyUsersFromNode(node, dirty)) needFull = true;
        }

        CORE_QT_schedule('hub:mut', { users: Array.from(dirty), full: needFull });
      });
    }

    CORE_QT_detachFallbackMO();
    return true;
  }

  /** @critical */
  function CORE_QT_hookCoreIfReady() {
    const st = MOD.state;
    if (st.coreHooked) return;
    if (!W.H2O?.bus) return;

    st.coreHooked = true;

    try { W.H2O.bus.on(EV_QTIMESTAMP_.BUS_INDEX_UPDATED, () => CORE_QT_schedule('bus:index', { full: true })); } catch {}
    try { W.H2O.bus.on(EV_QTIMESTAMP_.BUS_TURN_UPDATED, () => CORE_QT_schedule('bus:turn', { full: true })); } catch {}

    st.onIndexUpdated = () => CORE_QT_schedule('evt:index', { full: true });
    st.onTurnUpdated = () => CORE_QT_schedule('evt:turn', { full: true });
    st.onQScan = () => CORE_QT_schedule('evt:qscan', { full: true });
    W.addEventListener(EV_QTIMESTAMP_.INDEX_UPDATED, st.onIndexUpdated, { passive: true });
    W.addEventListener(EV_QTIMESTAMP_.TURN_UPDATED, st.onTurnUpdated, { passive: true });
    W.addEventListener(EV_QTIMESTAMP_.Q_SCAN, st.onQScan, { passive: true });

    // Core is the single source of truth → disconnect fallback MO
    CORE_QT_detachFallbackMO();

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { W.removeEventListener(EV_QTIMESTAMP_.INDEX_UPDATED, st.onIndexUpdated); } catch {}
      try { W.removeEventListener(EV_QTIMESTAMP_.TURN_UPDATED, st.onTurnUpdated); } catch {}
      try { W.removeEventListener(EV_QTIMESTAMP_.Q_SCAN, st.onQScan); } catch {}
      st.onIndexUpdated = null;
      st.onTurnUpdated = null;
      st.onQScan = null;
      st.coreHooked = false;
    });

    CORE_QT_schedule('core:ready', { full: true });
  }

  /* ───────────────────────────── 11) BOOT / DISPOSE ───────────────────────────── */

  const KEY_QTIMESTAMP_INIT_BOOT = `H2O:${TOK}:${PID}:booted`;

  /** @critical */
  function CORE_QT_boot() {
    if (W[KEY_QTIMESTAMP_INIT_BOOT]) return;
    W[KEY_QTIMESTAMP_INIT_BOOT] = true;

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.lastRunAt = 0;
    MOD.state.pendingFullScan = false;
    MOD.state.dirtyUsers = MOD.state.dirtyUsers || new Set();
    MOD.state.runTimer = 0;
    MOD.state.runRaf = 0;
    MOD.state.mo = MOD.state.mo || null;
    MOD.state.moRoot = MOD.state.moRoot || null;
    MOD.state.obsOffReady = (typeof MOD.state.obsOffReady === 'function') ? MOD.state.obsOffReady : null;
    MOD.state.obsOffMut = (typeof MOD.state.obsOffMut === 'function') ? MOD.state.obsOffMut : null;
    try { MOD.state.perfEnabled = (String(localStorage.getItem(KEY_QTIMESTAMP_PERF) || '') === '1'); } catch { MOD.state.perfEnabled = false; }
    MOD.state.perfWindowStartAt = 0;
    MOD.state.perfRunsInWindow = 0;

    UI_QT_injectCSSOnce();

    MOD.state.onResize = () => CORE_QT_schedule('resize', { full: true });
    W.addEventListener('resize', MOD.state.onResize, { passive: true });
    MOD.state.cleanup.push(() => {
      try { W.removeEventListener('resize', MOD.state.onResize); } catch {}
      MOD.state.onResize = null;
    });

    if (!CORE_QT_bindObserverHub('bind')) CORE_QT_attachFallbackMO();
    MOD.state.cleanup.push(() => CORE_QT_unbindObserverHub());
    CORE_QT_hookCoreIfReady();
    W.addEventListener(EV_QTIMESTAMP_.CORE_READY, CORE_QT_hookCoreIfReady, { once: true });

    const onRouteChanged = () => {
      if (!CORE_QT_bindObserverHub('route')) CORE_QT_attachFallbackMO();
      CORE_QT_schedule('route', { full: true });
    };
    W.addEventListener(EV_QTIMESTAMP_.ROUTE_CHANGED, onRouteChanged, true);
    W.addEventListener('popstate', onRouteChanged, true);
    W.addEventListener('hashchange', onRouteChanged, true);
    MOD.state.cleanup.push(() => W.removeEventListener(EV_QTIMESTAMP_.ROUTE_CHANGED, onRouteChanged, true));
    MOD.state.cleanup.push(() => W.removeEventListener('popstate', onRouteChanged, true));
    MOD.state.cleanup.push(() => W.removeEventListener('hashchange', onRouteChanged, true));

    const onQwrapWrapped = (ev) => {
      const userMsgEl = ev?.detail?.userMsgEl;
      if (!userMsgEl || !userMsgEl.matches?.(SEL_QTIMESTAMP_.USER_MSG)) return;
      CORE_QT_schedule('evt:qwrap:wrapped', { users: [userMsgEl] });
    };
    W.addEventListener(EV_QTIMESTAMP_.QWRAP_WRAPPED, onQwrapWrapped, { passive: true });
    MOD.state.cleanup.push(() => W.removeEventListener(EV_QTIMESTAMP_.QWRAP_WRAPPED, onQwrapWrapped));

    // Prime scan + safety rescan (same behavior as old)
    DOM_QT_scan();
    const t1 = setTimeout(() => CORE_QT_schedule('rescan:t1', { full: true }), CFG_QTIMESTAMP_.RESCAN_T1_MS);
    MOD.state.cleanup.push(() => clearTimeout(t1));

    // expose module methods
    MOD.api.boot = CORE_QT_boot;
    MOD.api.dispose = CORE_QT_dispose;
  }

  /** @critical */
  function CORE_QT_dispose() {
    if (!W[KEY_QTIMESTAMP_INIT_BOOT]) return;

    const cleanup = MOD.state.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    if (MOD.state.runTimer) {
      try { clearTimeout(MOD.state.runTimer); } catch {}
      MOD.state.runTimer = 0;
    }
    if (MOD.state.runRaf) {
      try { cancelAnimationFrame(MOD.state.runRaf); } catch {}
      MOD.state.runRaf = 0;
    }
    CORE_QT_detachFallbackMO();
    CORE_QT_unbindObserverHub();
    MOD.state.pendingFullScan = false;
    try { MOD.state.dirtyUsers?.clear?.(); } catch {}
    MOD.state.coreHooked = false;

    W[KEY_QTIMESTAMP_INIT_BOOT] = false;
  }

  CORE_QT_boot();
})();
