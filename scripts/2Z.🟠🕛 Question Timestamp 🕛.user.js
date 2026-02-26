// ==UserScript==
// @name         2Z.🟠🕛 Question Timestamp 🕛
// @namespace    H2O.Prime.CGX.QuestionTimestamp
// @version      2.1.0
// @description  Timestamp under USER question. Normal: timestamp shows on hover. Short questions: on hover show toolbar first, then hide toolbar and show timestamp (no overlap, no jitter). Contract v2 Stage-1 spine + QWrapper-aware anchor.
// @match        https://chatgpt.com/*
// @run-at       document-end
// @grant        none
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
  });

  /** @core Event topics (listen only; do not assume present) */
  const EV_QTIMESTAMP_ = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    INDEX_UPDATED: 'h2o:index:updated',
    TURN_UPDATED: 'h2o:turn:updated',
    Q_SCAN: 'h2o:questions:scan',
    BUS_INDEX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
  });

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
  function DOM_QT_scan() {
    const turns = document.querySelectorAll(`${SEL_QTIMESTAMP_.TURN_ROOT_A},${SEL_QTIMESTAMP_.TURN_ROOT_B}`);
    turns.forEach(DOM_QT_bindTurn);

    // Ensure timestamps exist for all user messages (even without hover)
    document.querySelectorAll(SEL_QTIMESTAMP_.USER_MSG).forEach(DOM_QT_ensureTimestamp);
  }

  /** @helper */
  function CORE_QT_schedule() {
    const st = MOD.state;
    if (st.scheduled) return;
    st.scheduled = true;
    requestAnimationFrame(() => {
      st.scheduled = false;
      DOM_QT_scan();
    });
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
  function CORE_QT_attachFallbackMO() {
    const st = MOD.state;
    if (st.mo) return;
    st.mo = new MutationObserver(CORE_QT_schedule);
    st.mo.observe(document.documentElement, { childList: true, subtree: true });
    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      try { st.mo && st.mo.disconnect(); } catch {}
      st.mo = null;
    });
  }

  /** @critical */
  function CORE_QT_hookCoreIfReady() {
    const st = MOD.state;
    if (st.coreHooked) return;
    if (!W.H2O?.bus) return;

    st.coreHooked = true;

    try { W.H2O.bus.on(EV_QTIMESTAMP_.BUS_INDEX_UPDATED, CORE_QT_schedule); } catch {}
    try { W.H2O.bus.on(EV_QTIMESTAMP_.BUS_TURN_UPDATED, CORE_QT_schedule); } catch {}

    W.addEventListener(EV_QTIMESTAMP_.INDEX_UPDATED, CORE_QT_schedule, { passive: true });
    W.addEventListener(EV_QTIMESTAMP_.TURN_UPDATED, CORE_QT_schedule, { passive: true });
    W.addEventListener(EV_QTIMESTAMP_.Q_SCAN, CORE_QT_schedule, { passive: true });

    // Core is the single source of truth → disconnect fallback MO
    if (st.mo) { try { st.mo.disconnect(); } catch {} st.mo = null; }

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { W.removeEventListener(EV_QTIMESTAMP_.INDEX_UPDATED, CORE_QT_schedule); } catch {}
      try { W.removeEventListener(EV_QTIMESTAMP_.TURN_UPDATED, CORE_QT_schedule); } catch {}
      try { W.removeEventListener(EV_QTIMESTAMP_.Q_SCAN, CORE_QT_schedule); } catch {}
      st.coreHooked = false;
    });

    CORE_QT_schedule();
  }

  /* ───────────────────────────── 11) BOOT / DISPOSE ───────────────────────────── */

  const KEY_QTIMESTAMP_INIT_BOOT = `H2O:${TOK}:${PID}:booted`;

  /** @critical */
  function CORE_QT_boot() {
    if (W[KEY_QTIMESTAMP_INIT_BOOT]) return;
    W[KEY_QTIMESTAMP_INIT_BOOT] = true;

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.scheduled = false;

    UI_QT_injectCSSOnce();

    W.addEventListener('resize', CORE_QT_schedule, { passive: true });
    MOD.state.cleanup.push(() => {
      try { W.removeEventListener('resize', CORE_QT_schedule); } catch {}
    });

    CORE_QT_attachFallbackMO();
    CORE_QT_hookCoreIfReady();
    W.addEventListener(EV_QTIMESTAMP_.CORE_READY, CORE_QT_hookCoreIfReady, { once: true });

    // Prime scan + safety rescan (same behavior as old)
    DOM_QT_scan();
    const t1 = setTimeout(DOM_QT_scan, CFG_QTIMESTAMP_.RESCAN_T1_MS);
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

    MOD.state.scheduled = false;
    MOD.state.coreHooked = false;

    W[KEY_QTIMESTAMP_INIT_BOOT] = false;
  }

  CORE_QT_boot();
})();
