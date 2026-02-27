// ==UserScript==
// @h2o-id      1x.answer.numbers.style
// @name         1X.🔴🧮 Answer Numbers & Style 🧮
// @namespace    H2O.ChatGPT.AnswerNumbersStyle
// @version      3.0.0
// @description  Big left answer number + full-width fading band. Anti-clipping + stable layering. H2O-Core compatible (index/turn). Contract v2 Stage 1 (identity/keys/selectors/events/css) + cgxui-scoped hooks.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 💧 H2O — Answer Numbers & Style (Stage 1: Foundation / Mechanics)
   * - Contract v2 aligned: identity-first, cgxui-only UI hooks, selector registry,
   *   keyed events/attrs/css IDs, idempotent boot/dispose, bounded DIAG.
   * ========================================================================== */

  /* ───────────────────────────── 0) Identity (Contract) ───────────────────────────── */
  /** @core Identity anchors + vault (no behavior change). */
  const TOK     = 'H2O';
  const PID     = 'AnsNums';        // module id (script)
  const CID     = 'ANSNUM';         // capability id
  const SkID    = 'ansn';           // skin id (cgxui owner)
  const BrID    = 'BR_ANSNUM';      // bridge id (diag anchor)
  const DsID    = 'DS_ANSNUM';      // dataset domain id (if needed later)
  const MODTAG  = 'AnswerNumbers';
  const MODICON = '🔴🔢';
  const EMOJI_HDR = '🔴🔢';

  const W = window;
  const D = document;

  W[TOK] = W[TOK] || {};
  const H2O = W[TOK];

  // Bounded DIAG per Contract (under H2O[TOK][BrID].diag)
  H2O[BrID] = H2O[BrID] || {};
  const DIAG = (H2O[BrID].diag = H2O[BrID].diag || {
    pid: PID, cid: CID, skid: SkID,
    bootCount: 0,
    disposeCount: 0,
    lastFlushMs: 0,
    lastFullScanCount: 0,
    lastIncCount: 0,
    lastErr: null,
  });

  // Module vault (optional but handy)
  H2O[PID] = H2O[PID] || {};
  const VAULT = H2O[PID];
  VAULT.state = VAULT.state || {};
  VAULT.api   = VAULT.api   || {};

  /* ───────────────────────────── 1) Keys / Selectors / Events / CSS IDs ───────────────────────────── */
  /** @core Central registries (no raw strings elsewhere). */
  const SEL = Object.freeze({
    ANSWER: '[data-message-author-role="assistant"]',
    TURN:   '[data-testid="conversation-turn"]',
  });

  const EV = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    IDX_UPDATED_WIN: 'h2o:index:updated',
    BUS_IDX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
  });

  const ATTR = Object.freeze({
    OWNER: 'data-cgxui-owner',
    STATE: 'data-cgxui-state',
    // internal bookkeeping
    UNCLIP_DONE: `data-cgxui-${SkID}-unclip-done`,
    TURN_OVF_DONE: `data-cgxui-${SkID}-turn-ovf-done`,
    SIG_NUM: `data-cgxui-${SkID}-num`,
    SIG_SHORT: `data-cgxui-${SkID}-short`,
    SIG_REGEN: `data-cgxui-${SkID}-regen`,
  });

  const CSS = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style-v300`,
    VAR_FADE_TOP: `--cgxui-${SkID}-bg-fade-top-px`,
    VAR_FADE_BOT: `--cgxui-${SkID}-bg-fade-bot-px`,
  });

  const CLS = Object.freeze({
    UNCLIP: `cgxui-${SkID}-ovf-unclip`,
    TURN_OVF: `cgxui-${SkID}-turn-ovf`,
    WRAP: `cgxui-${SkID}-answer-wrap`,
    BIG:  `cgxui-${SkID}-big-number`,
    VFADE: `cgxui-${SkID}-big-vfade`,
    MAIN: `cgxui-${SkID}-abig-main`,
    REGEN: `cgxui-${SkID}-abig-regens`,
    DIGIT_1: `cgxui-${SkID}-digit-1`,
    DIGIT_2: `cgxui-${SkID}-digit-2`,
    DIGIT_3: `cgxui-${SkID}-digit-3`,
    DIGIT_4: `cgxui-${SkID}-digit-4`,
  });

  /* ───────────────────────────── 2) Config ───────────────────────────── */
  /** @helper Knobs (kept minimal, stable defaults). */
  const CFG = Object.freeze({
    // incremental flush safety limit per frame
    INC_PER_FRAME: 40,
    // short-answer vertical fade threshold
    SHORT_SCROLLH_PX: 170,
  });

  /* ───────────────────────────── 3) CSS Injector (idempotent) ───────────────────────────── */
  /** @critical Injects CSS once; uses cgxui-scoped classes/vars. */
  function CSS_ensure() {
    if (D.getElementById(CSS.STYLE_ID)) return;

    const style = D.createElement('style');
    style.id = CSS.STYLE_ID;

    // Visuals intentionally preserved from v2.6.0 (names changed only)
    style.textContent = `
:root{
  ${CSS.VAR_FADE_TOP}: 28px;
  ${CSS.VAR_FADE_BOT}: 52px;
}

.${CLS.UNCLIP}{
  overflow: visible !important;
  overflow-clip-margin: 999px !important;
}

${SEL.TURN}{ overflow: visible !important; }
.${CLS.TURN_OVF}{ overflow: visible !important; }

.${CLS.WRAP}{
  position: relative;
  overflow: visible !important;
  isolation: isolate;
  z-index: 0;
}

.${CLS.WRAP} .markdown{
  position: relative;
  z-index: 2;
}

.${CLS.BIG}{
  position: absolute;
  left: -140px;
  top: 50%;
  transform: translateY(-50%);

  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  color: rgba(128, 128, 128, 0.12);

  pointer-events: none;
  z-index: 1;
  line-height: 1;
  white-space: nowrap;
  user-select: none;
  mix-blend-mode: multiply;
  text-align: left;
  overflow: visible;

  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    rgba(0,0,0,0.35) calc(${CSS.VAR_FADE_TOP} * 0.35),
    black ${CSS.VAR_FADE_TOP},
    black calc(100% - ${CSS.VAR_FADE_BOT}),
    rgba(0,0,0,0.35) calc(100% - (${CSS.VAR_FADE_BOT} * 0.35)),
    transparent 100%
  );

  mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 40%, transparent 100%);
}

.${CLS.BIG}.${CLS.VFADE}{
  -webkit-mask-image:
    linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 40%, transparent 100%),
    linear-gradient(
      to bottom,
      transparent 0%,
      rgba(0,0,0,0.35) 2%,
      black var(${CSS.VAR_FADE_TOP}),
      black calc(100% - var(${CSS.VAR_FADE_BOT})),
      rgba(0,0,0,0.35) 98%,
      transparent 100%
    );
  -webkit-mask-composite: source-in;
}

.${CLS.BIG} .${CLS.MAIN}{
  font-weight: 700;
  font-family: Georgia, serif;
  font-feature-settings: 'onum' 1;
  display: inline-block;

  color: rgba(128, 128, 128, 0.12);
  mix-blend-mode: multiply;

  -webkit-mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 40%, transparent 100%);
  mask-image: linear-gradient(to right, black 0%, rgba(0,0,0,0.8) 40%, transparent 100%);
}

.${CLS.BIG} .${CLS.REGEN}{
  display: block;
  width: 100%;
  text-align: center;
  margin: 10px 0 0 0;

  font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
  font-weight: 800;
  letter-spacing: 0.2px;
  font-size: 18px;

  color: rgba(210,210,210,0.60);
  mix-blend-mode: normal;

  pointer-events: none;
  white-space: nowrap;
  text-shadow: 0 1px 0 rgba(0,0,0,0.35);
}

.${CLS.DIGIT_1} { font-size: 150px; }
.${CLS.DIGIT_2} { font-size: 125px; }
.${CLS.DIGIT_3} { font-size: 100px; }
.${CLS.DIGIT_4} { font-size: 70px;  }

.${CLS.WRAP}::before{
  content: '';
  position: absolute;

  top: -25px;
  bottom: -50px;

  left: -100vw;
  right: -100vw;

  z-index: 0;
  pointer-events: none;

  background: color-mix(in srgb, var(--h2o-band-color, #9CA3AF) 60%, transparent);
  opacity: var(--h2o-band-opacity, 0.10);

  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    rgba(0,0,0,0.35) 25px,
    black 50px,
    black calc(100% - 52px),
    rgba(0,0,0,0.35) calc(100% - 18px),
    transparent 100%
  );

  mask-image: linear-gradient(
    to bottom,
    transparent 0px,
    rgba(0,0,0,0.35) 25px,
    black 50px,
    black calc(100% - 52px),
    rgba(0,0,0,0.35) calc(100% - 18px),
    transparent 100%
  );
}
    `.trim();

    D.head.appendChild(style);
  }

  /* ───────────────────────────── 4) Utilities ───────────────────────────── */
  /** @helper Digit sizing class by length. */
  function UTIL_digitClass(n) {
    const len = String(n).length;
    if (len === 1) return CLS.DIGIT_1;
    if (len === 2) return CLS.DIGIT_2;
    if (len === 3) return CLS.DIGIT_3;
    return CLS.DIGIT_4;
  }

  /** @critical Anti-clip for ancestors (one-time per answer element). */
  function UTIL_unclipAncestorsOnce(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    if (el.getAttribute(ATTR.UNCLIP_DONE) === '1') return;
    el.setAttribute(ATTR.UNCLIP_DONE, '1');

    let p = el;
    let steps = 0;
    while (p && p !== D.body && steps < 10) {
      if (p instanceof HTMLElement) p.classList.add(CLS.UNCLIP);
      p = p.parentElement;
      steps++;
    }
  }

  /** @critical Turn overflow (one-time per conversation turn). */
  function UTIL_ensureTurnOverflowOnce(el) {
    const turn = el.closest?.(SEL.TURN);
    if (!turn) return;
    if (turn.getAttribute(ATTR.TURN_OVF_DONE) === '1') return;
    turn.setAttribute(ATTR.TURN_OVF_DONE, '1');
    turn.classList.add(CLS.TURN_OVF);
  }

  /** @helper Regen info from tabular-nums inside the same turn. */
  function UTIL_getRegenInfoForAnswer(el) {
    const turn =
      el.closest(SEL.TURN) ||
      el.closest('[class*="group/turn-messages"]') ||
      el.parentElement;

    if (!turn) return null;

    const els = turn.querySelectorAll('div.tabular-nums');
    for (let i = els.length - 1; i >= 0; i--) {
      const txt = (els[i].textContent || '').trim();
      const m = txt.match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!m) continue;

      const cur = +m[1];
      const total = +m[2];

      if (!Number.isFinite(cur) || !Number.isFinite(total) || total <= 0) return null;
      if (total === 1) return null; // show only when regen exists
      return { cur, total };
    }
    return null;
  }

  /** @helper Number source: prefer Core turn index, else Core A-index, else DOM order. */
  function UTIL_computeNum(el, domIndex1) {
    const tRaw = W.H2O?.turn?.getTurnIndexByAEl?.(el);

    let turnNum = 0;
    if (Number.isFinite(tRaw)) {
      // preserve prior normalization behavior
      turnNum = (tRaw === 0) ? 1 : (tRaw > 0 ? tRaw : 0);
    }

    const a0 = W.H2O?.index?.getAIndex?.(el);
    const aNum = (Number.isFinite(a0) && a0 > 0) ? a0 : domIndex1;

    return (turnNum || aNum);
  }

  /** @helper "Short" answers get vertical fade. */
  function UTIL_isShort(el) {
    return (el.scrollHeight || 0) < CFG.SHORT_SCROLLH_PX;
  }

  /** @helper Inner HTML builder (keeps exact visual structure). */
  function UTIL_buildInnerHTML(num, regenStr) {
    return `
      <span class="${CLS.MAIN}">${num}</span>
      ${regenStr ? `<span class="${CLS.REGEN}">${regenStr}</span>` : ''}
    `.trim();
  }

  /* ───────────────────────────── 5) Apply One Answer (diffed, minimal churn) ───────────────────────────── */
  /** @critical Apply/update wrapper + big number for a single assistant message. */
  function CORE_applyToAnswer(el, domIndex1) {
    if (!el || !(el instanceof HTMLElement)) return;

    UTIL_ensureTurnOverflowOnce(el);
    UTIL_unclipAncestorsOnce(el);

    const num = UTIL_computeNum(el, domIndex1);
    const isShort = UTIL_isShort(el);

    const regen = UTIL_getRegenInfoForAnswer(el);
    const regenStr = (regen && regen.total > 1) ? `(${regen.cur}/${regen.total})` : '';

    const prevNum   = el.getAttribute(ATTR.SIG_NUM)   || '';
    const prevShort = el.getAttribute(ATTR.SIG_SHORT) || '';
    const prevRegen = el.getAttribute(ATTR.SIG_REGEN) || '';

    const nextNum   = String(num);
    const nextShort = isShort ? '1' : '0';
    const nextRegen = regenStr;

    // Already wrapped and no meaningful change
    if (el.classList.contains(CLS.WRAP) &&
        prevNum === nextNum &&
        prevShort === nextShort &&
        prevRegen === nextRegen) {
      return;
    }

    el.setAttribute(ATTR.SIG_NUM, nextNum);
    el.setAttribute(ATTR.SIG_SHORT, nextShort);
    el.setAttribute(ATTR.SIG_REGEN, nextRegen);

    // Ensure wrapper
    if (!el.classList.contains(CLS.WRAP)) el.classList.add(CLS.WRAP);

    // Ensure big number element
    let big = el.querySelector(`:scope > .${CLS.BIG}`);
    if (!big) {
      big = D.createElement('div');
      big.className = `${CLS.BIG} ${UTIL_digitClass(num)}`;
      big.setAttribute(ATTR.OWNER, SkID);
      big.setAttribute('data-cgxui', `${SkID}-abig`);
      el.insertBefore(big, el.firstChild);
    }

    // Update classes
    big.className = `${CLS.BIG} ${UTIL_digitClass(num)}`;
    if (isShort) big.classList.add(CLS.VFADE);
    else big.classList.remove(CLS.VFADE);

    // Update inner only when needed
    const desired = UTIL_buildInnerHTML(num, regenStr);
    if ((big._cgxuiLastHTML || '') !== desired) {
      big.innerHTML = desired;
      big._cgxuiLastHTML = desired;
    }

    // Cleanup legacy nodes if present (compat from older HO versions)
    const legacyBig = el.querySelector(':scope > .ho-big-number');
    if (legacyBig && legacyBig !== big) legacyBig.remove();
    const legacySmall = el.querySelector(':scope > .ho-small-number-box');
    if (legacySmall) legacySmall.remove();
  }

  /* ───────────────────────────── 6) Scans + Scheduler ───────────────────────────── */
  /** @critical Full scan with stable DOM ordering. */
  function CORE_fullScan() {
    const answers = D.querySelectorAll(SEL.ANSWER);
    answers.forEach((el, i) => CORE_applyToAnswer(el, i + 1));
    DIAG.lastFullScanCount = answers.length;
  }

  let rafPending = false;
  let needFull = false;
  const pending = new Set();

  /** @critical Flush work on RAF (prevents spam). */
  function CORE_flush() {
    const t0 = performance.now();

    if (needFull) {
      needFull = false;
      pending.clear();
      CORE_fullScan();
      DIAG.lastIncCount = 0;
      DIAG.lastFlushMs = Math.round(performance.now() - t0);
      return;
    }

    if (pending.size) {
      let i = 0;
      for (const el of pending) {
        pending.delete(el);
        // Best-effort index in incremental mode; full scan will correct ordering when needed.
        CORE_applyToAnswer(el, i + 1);
        i++;
        if (i >= CFG.INC_PER_FRAME) break;
      }
      DIAG.lastIncCount = i;

      if (pending.size) CORE_scheduleFlush();
    }

    DIAG.lastFlushMs = Math.round(performance.now() - t0);
  }

  /** @critical Schedule a flush. */
  function CORE_scheduleFlush() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      try { CORE_flush(); } catch (e) { DIAG.lastErr = String(e); }
    });
  }

  /** @critical Schedule a full scan. */
  function CORE_scheduleFullScan() {
    needFull = true;
    CORE_scheduleFlush();
  }

  /** @helper Schedule a specific answer. */
  function CORE_scheduleAnswer(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    pending.add(el);
    CORE_scheduleFlush();
  }

  /* ───────────────────────────── 7) MutationObserver (incremental) ───────────────────────────── */
  let MO = null;

  /** @helper Collect assistant nodes from added subtree. */
  function UTIL_extractAssistantNodes(node, out) {
    if (!node || node.nodeType !== 1) return;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL.ANSWER)) out.add(el);
    const found = el.querySelectorAll?.(SEL.ANSWER);
    if (found && found.length) found.forEach(x => out.add(x));
  }

  /** @critical Attach fallback MO (added nodes only). */
  function OBS_attachFallbackMO() {
    if (MO) return;
    MO = new MutationObserver((muts) => {
      const hit = new Set();
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          m.addedNodes.forEach(n => UTIL_extractAssistantNodes(n, hit));
        }
      }
      if (hit.size) hit.forEach(CORE_scheduleAnswer);
    });
    MO.observe(D.body, { childList: true, subtree: true });
  }

  /** @critical Detach fallback MO. */
  function OBS_detachFallbackMO() {
    if (!MO) return;
    MO.disconnect();
    MO = null;
  }

  /* ───────────────────────────── 8) Core Hooks ───────────────────────────── */
  let coreHooked = false;

  /** @critical Hook to H2O Core bus/topics if available. */
  function CORE_hookCore() {
    if (coreHooked) return;
    if (!W.H2O?.bus) return;

    coreHooked = true;

    try { W.H2O.bus.on(EV.BUS_IDX_UPDATED, CORE_scheduleFullScan); } catch {}
    try { W.H2O.bus.on(EV.BUS_TURN_UPDATED, CORE_scheduleFullScan); } catch {}

    W.addEventListener(EV.IDX_UPDATED_WIN, CORE_scheduleFullScan, { passive: true });

    // Core is authoritative → we can reduce MO noise
    OBS_detachFallbackMO();

    CORE_scheduleFullScan();
  }

  /* ───────────────────────────── 9) Boot / Dispose ───────────────────────────── */
  let booted = false;
  const CLEAN = [];

  /** @core Boot (idempotent). */
  function CORE_ANSNUM_boot() {
    if (booted) return;
    booted = true;
    DIAG.bootCount++;

    CSS_ensure();

    // Fallback watcher first (covers early async mounts)
    OBS_attachFallbackMO();

    // Try core now; if not ready, wait
    CORE_hookCore();
    const onReady = () => CORE_hookCore();
    W.addEventListener(EV.CORE_READY, onReady, { once: true });
    CLEAN.push(() => W.removeEventListener(EV.CORE_READY, onReady));

    // Initial scan (scheduled)
    CORE_scheduleFullScan();
  }

  /** @core Dispose (idempotent + full cleanup). */
  function CORE_ANSNUM_dispose() {
    if (!booted) return;
    booted = false;
    DIAG.disposeCount++;

    try { OBS_detachFallbackMO(); } catch {}
    try {
      for (const fn of CLEAN.splice(0)) { try { fn(); } catch {} }
    } catch {}

    // Remove injected style
    const style = D.getElementById(CSS.STYLE_ID);
    if (style) style.remove();
  }

  // Public API (optional)
  VAULT.api.boot = CORE_ANSNUM_boot;
  VAULT.api.dispose = CORE_ANSNUM_dispose;
  VAULT.api.rescan = CORE_scheduleFullScan;

  /* ───────────────────────────── 10) Start (single side effect) ───────────────────────────── */
  CORE_ANSNUM_boot();
})();
