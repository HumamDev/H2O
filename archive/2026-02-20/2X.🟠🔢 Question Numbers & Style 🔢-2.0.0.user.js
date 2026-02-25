// ==UserScript==
// @name         2X.🟠🔢 Question Numbers & Style 🔢
// @namespace    H2O.Prime.CGX.QuestionBigIndex
// @version      2.0.0
// @description  Big faded question numbers left of user bubbles, centered on bubble (not attachments). Adds edit counter like (2/3) when message has edits. H2O Core-safe indexing + bubble fallback. Contract v2 Stage-1 aligned. QWrapper-compatible.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* =============================================================================
   * 🧱 H2O Module Standard — Contract (v2.0) — Stage 1: Foundation/Mechanics
   * - Identity-first, registries, cgxui-only hooks, boot/dispose, cleanup,
   *   Core-safe indexing, zero feature loss.
   * ============================================================================= */

  /* ───────────────────────────── 0) IDENTITY (derived from existing script) ───────────────────────────── */

  /** @core */
  const TOK = 'QN';                 // Question Numbers
  const PID = 'qbigindex';          // slug id (existing concept: QuestionBigIndex)
  const CID = 'QBIGINDEX';          // Contract casing (uppercase CID)
  const SkID = 'qbig';              // Skin id (ui prefix)

  const MODTAG = 'QBigIndex';
  const MODICON = '🔢';
  const EMOJI_HDR = '🟠';

  const SUITE = 'prm';
  const HOST = 'cgx';

  // Aliases (readability only; NOT new identities)
  const DsID = PID;
  const BrID = PID;

  /* ───────────────────────────── 1) REGISTRIES (no raw selector/key IDs) ───────────────────────────── */

  /** @core */
  const SEL_QBIGINDEX = Object.freeze({
    USER_MSG: '[data-message-author-role="user"]',

    // Bubble/anchor candidates (prefer actual bubble, then wrapper, then prose/markdown)
    BUBBLE: '.user-message-bubble-color',
    QWRAP_BUBBLE: '.cgxui-qswr-bubble, .cgxui-qswr-bubble-short, .ho-qwrap-bubble, .ho-qwrap-bubble-short',
    QWRAP_ROOT: '.cgxui-qswr, .ho-qwrap',
    QWRAP_TEXT: '.cgxui-qswr-text, .ho-qwrap-text',
    PROSE: '.markdown, .prose, [class*="markdown"], [class*="prose"]',

    // "2/3" edit counter nodes
    EDIT_BADGE: 'div.tabular-nums',

    // Structural roots
    TURN_ROOT: '[tabindex="-1"]',
    TURN_GROUP_HINT: '[class*="group/turn-messages"]',
  });

  /** @core */
  const ATTR_QBIGINDEX = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI: 'data-cgxui',
    STATE: 'data-cgxui-state',

    SIG: 'data-h2o-sig', // internal signature
  });

  /** @core */
  const CSS_QBIGINDEX = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
    // optional legacy style ids (none for this module)
    LEGACY_STYLE_IDS: [],
  });

  /** @core */
  const KEY_QBIGINDEX = Object.freeze({
    INIT_BOOT: `H2O:${TOK}:${PID}:booted`,
  });

  /** @core */
  const EV_QBIGINDEX = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    INDEX_UPDATED_WIN: 'h2o:index:updated',
    // bus topics (best-effort; keep legacy-safe)
    BUS_INDEX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
  });

  /* ───────────────────────────── 2) CONFIG (ported 1:1) ───────────────────────────── */

  /** @core */
  const CFG_QBIGINDEX = Object.freeze({
    // ✅ X positioning
    X_MODE: 'bubble',          // 'bubble' (per bubble) | 'rail' | 'absolute'
    BUBBLE_GAP_PX: 14,
    RAIL_GAP_PX: 18,
    ABS_LEFT_PX: 24,
    ABS_RIGHT_PX: null,

    // ✅ Y positioning
    Y_MODE: 'bubble-center',   // 'bubble-center' | 'host-center' | 'top'
    BUBBLE_CENTER_Y_OFFSET_PX: 0,
    TOP_PX: 10,
    TOP_EXTRA_PX: 0,

    // ✅ look
    COLOR: 'rgba(128, 128, 128, 0.12)',
    SCALE: 0.75,

    // ✅ edits formatting
    SHOW_1_OF_1: false,
    EDIT_WRAP: true,
    EDIT_PREFIX_SPACE: true,

    // ✅ detection window (how far below the question to look for 2/2)
    EDIT_SEARCH_DY_MIN: -30,
    EDIT_SEARCH_DY_MAX: 220,
  });

  /* ───────────────────────────── 3) VAULT + BOUNDED DIAG ───────────────────────────── */

  /** @core */
  const W = window;

  W.H2O = W.H2O || {};
  W.H2O[TOK] = W.H2O[TOK] || {};
  W.H2O[TOK][PID] = W.H2O[TOK][PID] || {};

  const MOD = W.H2O[TOK][PID];
  MOD.diag = MOD.diag || {};
  MOD.state = MOD.state || {};
  MOD.api = MOD.api || {};

  W.H2O[TOK][BrID] = W.H2O[TOK][BrID] || {};
  W.H2O[TOK][BrID].diag = W.H2O[TOK][BrID].diag || MOD.diag;

  const DIAG = W.H2O[TOK][BrID].diag;

  /* ───────────────────────────── 4) UI TOKENS ───────────────────────────── */

  /** @core */
  const UI_QBIGINDEX = Object.freeze({
    HOST_CLASS: `cgxui-${SkID}-host`,
    NUM_CLASS: `cgxui-${SkID}-number`,
    MAIN_CLASS: `cgxui-${SkID}-main`,
    EDITS_CLASS: `cgxui-${SkID}-edits`,

    // digit sizing helpers
    DIGIT_1: `cgxui-${SkID}-digit-1`,
    DIGIT_2: `cgxui-${SkID}-digit-2`,
    DIGIT_3: `cgxui-${SkID}-digit-3`,
    DIGIT_4: `cgxui-${SkID}-digit-4`,
  });

  /* ───────────────────────────── 5) SMALL UTILS ───────────────────────────── */

  /** @helper */
  function UTIL_QR_qsa(sel, root = document) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  /** @helper */
  function UTIL_QR_setAttr(el, k, v) {
    try { el?.setAttribute?.(k, v); } catch {}
  }

  /** @helper */
  function UTIL_QR_inRange(n, a, b) { return n >= a && n <= b; }

  /** @helper */
  function UTIL_QR_digitClass(n) {
    const len = String(n).length;
    if (len === 1) return UI_QBIGINDEX.DIGIT_1;
    if (len === 2) return UI_QBIGINDEX.DIGIT_2;
    if (len === 3) return UI_QBIGINDEX.DIGIT_3;
    return UI_QBIGINDEX.DIGIT_4;
  }

  /* ───────────────────────────── 6) CSS ───────────────────────────── */

  /** @critical */
  function UI_QR_injectCSSOnce() {
    if (document.getElementById(CSS_QBIGINDEX.STYLE_ID)) return;
    for (const id of CSS_QBIGINDEX.LEGACY_STYLE_IDS) {
      if (document.getElementById(id)) return;
    }

    const style = document.createElement('style');
    style.id = CSS_QBIGINDEX.STYLE_ID;

    // Note: host selector uses class on user message root (not global), to avoid layout bleed.
    style.textContent = `
${SEL_QBIGINDEX.USER_MSG}.${UI_QBIGINDEX.HOST_CLASS}{
  position: relative !important;
  overflow: visible;
  z-index: 0;
}
${SEL_QBIGINDEX.USER_MSG}.${UI_QBIGINDEX.HOST_CLASS}.cgxui-${SkID}-allow-overflow{
  overflow: visible !important;
}
${SEL_QBIGINDEX.USER_MSG}.${UI_QBIGINDEX.HOST_CLASS} ${SEL_QBIGINDEX.BUBBLE}{
  position: relative;
  z-index: 0;
}

/* container (NO MASK here — so edits won't vanish) */
.${UI_QBIGINDEX.NUM_CLASS}{
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
.${UI_QBIGINDEX.NUM_CLASS} .${UI_QBIGINDEX.MAIN_CLASS}{
  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  display: inline-block;

  color: ${CFG_QBIGINDEX.COLOR};
  mix-blend-mode: multiply;

  -webkit-mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 40%, transparent 100%);
  mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.85) 40%, transparent 100%);
}

/* EDITS: visible, NOT masked */
.${UI_QBIGINDEX.NUM_CLASS} .${UI_QBIGINDEX.EDITS_CLASS}{
  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  font-weight: 700;
  letter-spacing: 0.2px;
  display: inline-block;
  margin-left: 10px;

  color: rgba(210,210,210,0.55);
  mix-blend-mode: normal;

  transform: translateY(-22%);
  font-size: 18px;
}

/* digit sizing */
.${UI_QBIGINDEX.DIGIT_1} { font-size: 100px; }
.${UI_QBIGINDEX.DIGIT_2} { font-size: 85px; }
.${UI_QBIGINDEX.DIGIT_3} { font-size: 70px; }
.${UI_QBIGINDEX.DIGIT_4} { font-size: 55px; }
    `.trim();

    document.head.appendChild(style);

    MOD.state.styleEl = style;
    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { style.remove(); } catch {}
      MOD.state.styleEl = null;
    });
  }

  /* ───────────────────────────── 7) EDIT COUNTER (ported) ───────────────────────────── */

  /** @critical */
  function DOM_QR_getEditInfoForUserMessage(userEl) {
    const root =
      userEl.closest(SEL_QBIGINDEX.TURN_ROOT) ||
      userEl.closest(SEL_QBIGINDEX.TURN_GROUP_HINT) ||
      userEl.parentElement ||
      document;

    const userRect = userEl.getBoundingClientRect();

    const candidates = UTIL_QR_qsa(SEL_QBIGINDEX.EDIT_BADGE, root)
      .map(el => ({ el, rect: el.getBoundingClientRect(), txt: (el.textContent || '').trim() }))
      .filter(x => /^\d+\s*\/\s*\d+$/.test(x.txt));

    let best = null;
    let bestScore = Infinity;

    for (const c of candidates) {
      const dy = c.rect.top - userRect.bottom;
      if (dy < CFG_QBIGINDEX.EDIT_SEARCH_DY_MIN || dy > CFG_QBIGINDEX.EDIT_SEARCH_DY_MAX) continue;

      const score = Math.abs(dy);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (!best) return null;

    const m = best.txt.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return null;

    const cur = parseInt(m[1], 10);
    const total = parseInt(m[2], 10);

    if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 0) return null;
    if (!CFG_QBIGINDEX.SHOW_1_OF_1 && total === 1) return null;

    return { cur, total };
  }

  /* ───────────────────────────── 8) POSITIONING (QWrapper-compatible) ───────────────────────────── */

  /** @helper */
  function DOM_QR_pickAnchor(hostEl) {
    // Prefer real bubble (most stable)
    const bubble = hostEl.querySelector(SEL_QBIGINDEX.BUBBLE);
    if (bubble) return bubble;

    // If Question Wrapper exists, prefer its bubble host or text block (centers on text, not attachments)
    const qwrapBubble = hostEl.querySelector(SEL_QBIGINDEX.QWRAP_BUBBLE);
    if (qwrapBubble) return qwrapBubble;

    const qwrapText = hostEl.querySelector(SEL_QBIGINDEX.QWRAP_TEXT);
    if (qwrapText) return qwrapText;

    const prose = hostEl.querySelector(SEL_QBIGINDEX.PROSE);
    if (prose) return prose;

    return hostEl;
  }

  /** @critical */
  function DOM_QR_applyPosition(numEl, hostEl) {
    numEl.style.left = '';
    numEl.style.right = '';
    numEl.style.top = '';
    numEl.style.transform = '';

    const hostRect = hostEl.getBoundingClientRect();
    const anchor = DOM_QR_pickAnchor(hostEl);
    const anchorRect = anchor.getBoundingClientRect();

    // X
    if (CFG_QBIGINDEX.X_MODE === 'bubble') {
      const targetRightEdgeX = anchorRect.left - CFG_QBIGINDEX.BUBBLE_GAP_PX;
      const rightPx = Math.max(0, Math.round(hostRect.right - targetRightEdgeX));
      numEl.style.right = `${rightPx}px`;
    } else if (CFG_QBIGINDEX.X_MODE === 'rail') {
      numEl.style.right = `calc(var(--user-chat-width, 70%) + ${CFG_QBIGINDEX.RAIL_GAP_PX}px)`;
    } else {
      if (CFG_QBIGINDEX.ABS_RIGHT_PX != null) numEl.style.right = `${CFG_QBIGINDEX.ABS_RIGHT_PX}px`;
      else numEl.style.left = `${CFG_QBIGINDEX.ABS_LEFT_PX}px`;
    }

    // Y
    if (CFG_QBIGINDEX.Y_MODE === 'bubble-center') {
      const centerY = (anchorRect.top + anchorRect.height / 2) - hostRect.top + CFG_QBIGINDEX.BUBBLE_CENTER_Y_OFFSET_PX;
      numEl.style.top = `${Math.round(centerY)}px`;
      numEl.style.transform = `translateY(-50%) scale(${CFG_QBIGINDEX.SCALE})`;
    } else if (CFG_QBIGINDEX.Y_MODE === 'host-center') {
      numEl.style.top = '50%';
      numEl.style.transform = `translateY(-50%) scale(${CFG_QBIGINDEX.SCALE})`;
    } else {
      numEl.style.top = `${CFG_QBIGINDEX.TOP_PX + CFG_QBIGINDEX.TOP_EXTRA_PX}px`;
      numEl.style.transform = `scale(${CFG_QBIGINDEX.SCALE})`;
    }
  }

  /* ───────────────────────────── 9) RENDER LOOP (ported logic, reduced flicker) ───────────────────────────── */

  /** @critical */
  function CORE_QR_run() {
    const st = MOD.state;
    st.scheduled = false;

    const H = W.H2O || null;

    // Core getters (safe even if Core not ready)
    const getTurnByQ = H?.turn?.getTurnIndexByQEl;
    const getQIndex = H?.index?.getQIndex;

    const users = UTIL_QR_qsa(SEL_QBIGINDEX.USER_MSG);
    let scanQ = 0;

    for (const el of users) {
      // 1) Fallback scan index (last resort)
      const scanNum = ++scanQ;

      // 2) Core raw-Q index (better fallback than scan)
      const coreQ = (typeof getQIndex === 'function') ? getQIndex(el) : 0;
      const qNum = (Number.isFinite(coreQ) && coreQ > 0) ? coreQ : scanNum;

      // 3) Turn index (sync key for Q/A)
      const tRaw = (typeof getTurnByQ === 'function') ? getTurnByQ(el) : 0;
      const turnNum = (Number.isFinite(tRaw) && tRaw > 0) ? tRaw : 0;

      // Final display number: prefer turnNum to align with answer numbering.
      const num = turnNum || qNum;

      // Host class (cgxui)
      if (!el.classList.contains(UI_QBIGINDEX.HOST_CLASS)) el.classList.add(UI_QBIGINDEX.HOST_CLASS);
      el.classList.add(`cgxui-${SkID}-allow-overflow`);

      // Tag ownership (cgxui-only)
      UTIL_QR_setAttr(el, ATTR_QBIGINDEX.OWNER, SkID);
      UTIL_QR_setAttr(el, ATTR_QBIGINDEX.UI, `${SkID}-host`);

      // Ensure number node exists
      let numEl = el.querySelector(`.${UI_QBIGINDEX.NUM_CLASS}`);
      if (!numEl) {
        numEl = document.createElement('div');
        numEl.className = UI_QBIGINDEX.NUM_CLASS;
        UTIL_QR_setAttr(numEl, ATTR_QBIGINDEX.OWNER, SkID);
        UTIL_QR_setAttr(numEl, ATTR_QBIGINDEX.UI, `${SkID}-num`);
        el.insertBefore(numEl, el.firstChild);
      }

      // Edits string (independent from numbering)
      const edit = DOM_QR_getEditInfoForUserMessage(el);
      let editStr = '';
      if (edit) {
        const core = `${edit.cur}/${edit.total}`;
        editStr = CFG_QBIGINDEX.EDIT_WRAP ? `(${core})` : core;
        if (CFG_QBIGINDEX.EDIT_PREFIX_SPACE) editStr = ` ${editStr}`;
      }

      // Update DOM only when needed (reduces flicker)
      const sig = `${num}|${editStr}`;
      const prevSig = numEl.getAttribute(ATTR_QBIGINDEX.SIG) || '';
      if (prevSig !== sig) {
        UTIL_QR_setAttr(numEl, ATTR_QBIGINDEX.SIG, sig);

        // digit sizing follows displayed number
        numEl.className = `${UI_QBIGINDEX.NUM_CLASS} ${UTIL_QR_digitClass(num)}`;

        numEl.innerHTML = `
          <span class="${UI_QBIGINDEX.MAIN_CLASS}">${num}</span>
          ${editStr ? `<span class="${UI_QBIGINDEX.EDITS_CLASS}">${editStr}</span>` : ''}
        `.trim();
      }

      // Positioning can change on resize/scroll even if number didn’t
      DOM_QR_applyPosition(numEl, el);
    }
  }

  /** @helper */
  function CORE_QR_schedule() {
    const st = MOD.state;
    if (st.scheduled) return;
    st.scheduled = true;
    requestAnimationFrame(CORE_QR_run);
  }

  /* ───────────────────────────── 10) OBSERVERS + CORE HOOK ───────────────────────────── */

  /** @critical */
  function CORE_QR_attachFallbackMO() {
    const st = MOD.state;
    if (st.mo) return;

    st.mo = new MutationObserver(CORE_QR_schedule);
    st.mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      try { st.mo?.disconnect?.(); } catch {}
      st.mo = null;
    });
  }

  /** @helper */
  function CORE_QR_detachFallbackMO() {
    const st = MOD.state;
    if (!st.mo) return;
    try { st.mo.disconnect(); } catch {}
    st.mo = null;
  }

  /** @critical */
  function CORE_QR_hookCore() {
    const st = MOD.state;
    if (st.coreHooked) return;

    if (!W.H2O?.bus || !W.H2O?.index || !W.H2O?.turn) return;
    st.coreHooked = true;

    // React to Core updates (single source of truth)
    try {
      W.H2O.bus.on(EV_QBIGINDEX.BUS_INDEX_UPDATED, CORE_QR_schedule);
      W.H2O.bus.on(EV_QBIGINDEX.BUS_TURN_UPDATED, CORE_QR_schedule);
    } catch {}

    W.addEventListener(EV_QBIGINDEX.INDEX_UPDATED_WIN, CORE_QR_schedule, { passive: true });

    // If Core is present, drop heavy fallback observer
    CORE_QR_detachFallbackMO();
    CORE_QR_schedule();
  }

  /* ───────────────────────────── 11) BOOT / DISPOSE ───────────────────────────── */

  /** @critical */
  function CORE_QR_boot() {
    if (W[KEY_QBIGINDEX.INIT_BOOT]) return;
    W[KEY_QBIGINDEX.INIT_BOOT] = true;

    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.scheduled = false;
    MOD.state.coreHooked = false;
    MOD.state.mo = null;

    UI_QR_injectCSSOnce();

    // Always keep layout responsive
    const onClick = () => setTimeout(CORE_QR_schedule, 40);
    const onResize = () => CORE_QR_schedule();
    const onScroll = () => CORE_QR_schedule();

    document.addEventListener('click', onClick, true);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });

    MOD.state.cleanup.push(() => document.removeEventListener('click', onClick, true));
    MOD.state.cleanup.push(() => window.removeEventListener('resize', onResize));
    MOD.state.cleanup.push(() => window.removeEventListener('scroll', onScroll));

    // Start
    CORE_QR_attachFallbackMO();
    CORE_QR_hookCore();
    window.addEventListener(EV_QBIGINDEX.CORE_READY, CORE_QR_hookCore, { once: true });

    CORE_QR_schedule();

    // expose module methods
    MOD.api.boot = CORE_QR_boot;
    MOD.api.dispose = CORE_QR_dispose;
  }

  /** @critical */
  function CORE_QR_dispose() {
    if (!W[KEY_QBIGINDEX.INIT_BOOT]) return;

    const cleanup = MOD.state.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    MOD.state.scheduled = false;
    MOD.state.coreHooked = false;
    MOD.state.mo = null;

    W[KEY_QBIGINDEX.INIT_BOOT] = false;
  }

  CORE_QR_boot();
})();
