// ==UserScript==
// @h2o-id             1u1a.answer.background
// @name               1U1a.🔴🖼️ Answer Background 🖼️
// @namespace          H2O.Premium.CGX.answer.background
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260304-102754
// @description        Full-width fading answer band extracted from Answer Numbers & Style, with incremental updates and low-churn observers.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const W = window;
  const D = document;

  const TOK = 'H2O';
  const PID = 'AnsBg';
  const SkID = 'ansn'; // keep shared classes/attrs compatibility
  const BrID = 'BR_ANSBG';

  W[TOK] = W[TOK] || {};
  const H2O = W[TOK];

  H2O[BrID] = H2O[BrID] || {};
  const DIAG = (H2O[BrID].diag = H2O[BrID].diag || {
    pid: PID,
    bootCount: 0,
    disposeCount: 0,
    lastFlushMs: 0,
    lastFullScanCount: 0,
    lastIncCount: 0,
    lastErr: null,
  });

  const SEL = Object.freeze({
    ANSWER: '[data-message-author-role="assistant"]',
    TURN: '[data-testid="conversation-turn"]',
    TURNS: '[data-testid="conversation-turns"]',
  });

  const EV = Object.freeze({
    CORE_READY: 'h2o:core:ready',
    IDX_UPDATED_WIN: 'h2o:index:updated',
    TURN_UPDATED_WIN: 'h2o:turn:updated',
    BUS_IDX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED: 'turn:updated',
    ROUTE_CHANGED: 'evt:h2o:route:changed',
  });

  const ATTR = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UNCLIP_DONE: `data-cgxui-${SkID}-unclip-done`,
    TURN_OVF_DONE: `data-cgxui-${SkID}-turn-ovf-done`,
    SIG_BG: 'data-h2o-x1bg-sig',
  });

  const CSS = Object.freeze({
    STYLE_ID: 'cgxui-ansbg-style-v100',
    VAR_FADE_TOP: `--cgxui-${SkID}-bg-fade-top-px`,
    VAR_FADE_BOT: `--cgxui-${SkID}-bg-fade-bot-px`,
  });

  const CLS = Object.freeze({
    UNCLIP: `cgxui-${SkID}-ovf-unclip`,
    TURN_OVF: `cgxui-${SkID}-turn-ovf`,
    WRAP: `cgxui-${SkID}-answer-wrap`,
  });

  const CFG = Object.freeze({
    INC_PER_FRAME: 60,
    BUS_DEBOUNCE_MS: 260,
    MAX_DELTA_CHILDREN: 24,
    PERF_LOG_MS: 10000,
  });

  const PERF = {
    enabled: false,
    processed: 0,
    fullScans: 0,
    deltaUpdates: 0,
    skippedBySig: 0,
    ticker: 0,
  };

  function PERF_init() {
    if (PERF.ticker) return;
    try { PERF.enabled = W.localStorage?.getItem('h2o:perf') === '1'; } catch {}
    if (!PERF.enabled) return;
    PERF.ticker = W.setInterval(() => {
      try {
        console.log('[1X1a/bg][perf]', {
          processed: PERF.processed,
          fullScans: PERF.fullScans,
          deltaUpdates: PERF.deltaUpdates,
          skippedBySig: PERF.skippedBySig,
        });
      } catch {}
      PERF.processed = 0;
      PERF.fullScans = 0;
      PERF.deltaUpdates = 0;
      PERF.skippedBySig = 0;
    }, CFG.PERF_LOG_MS);
  }

  function q(sel, root = D) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function CSS_ensure() {
    if (D.getElementById(CSS.STYLE_ID)) return;

    const style = D.createElement('style');
    style.id = CSS.STYLE_ID;
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

  function UTIL_findConversationRoot() {
    const turnsRoot = q(SEL.TURNS);
    if (turnsRoot) return turnsRoot;

    const firstTurn = q(SEL.TURN);
    if (firstTurn?.parentElement) return firstTurn.parentElement;

    return q('main') || D.body;
  }

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

  function UTIL_ensureTurnOverflowOnce(el) {
    const turn = el.closest?.(SEL.TURN);
    if (!turn) return;
    if (turn.getAttribute(ATTR.TURN_OVF_DONE) === '1') return;
    turn.setAttribute(ATTR.TURN_OVF_DONE, '1');
    turn.classList.add(CLS.TURN_OVF);
  }

  function CORE_applyBackground(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    const nextSig = '1';
    if (el.classList.contains(CLS.WRAP) && el.getAttribute(ATTR.SIG_BG) === nextSig) {
      PERF.skippedBySig++;
      return false;
    }

    UTIL_ensureTurnOverflowOnce(el);
    UTIL_unclipAncestorsOnce(el);

    if (!el.classList.contains(CLS.WRAP)) el.classList.add(CLS.WRAP);
    el.setAttribute(ATTR.SIG_BG, nextSig);
    PERF.processed++;
    return true;
  }

  function CORE_fullScan() {
    const answers = D.querySelectorAll(SEL.ANSWER);
    for (const el of answers) CORE_applyBackground(el);
    DIAG.lastFullScanCount = answers.length;
    PERF.fullScans++;
  }

  let rafPending = false;
  let needFull = false;
  let fullDebounceT = 0;
  const pending = new Set();

  function CORE_flush() {
    const t0 = performance.now();

    if (needFull) {
      needFull = false;
      pending.clear();
      OBS_attachMO();
      CORE_fullScan();
      DIAG.lastIncCount = 0;
      DIAG.lastFlushMs = Math.round(performance.now() - t0);
      return;
    }

    let i = 0;
    for (const el of pending) {
      pending.delete(el);
      CORE_applyBackground(el);
      i++;
      if (i >= CFG.INC_PER_FRAME) break;
    }

    if (pending.size) CORE_scheduleFlush();

    DIAG.lastIncCount = i;
    DIAG.lastFlushMs = Math.round(performance.now() - t0);
  }

  function CORE_scheduleFlush() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      try { CORE_flush(); } catch (e) { DIAG.lastErr = String(e); }
    });
  }

  function CORE_scheduleFullScan() {
    needFull = true;
    CORE_scheduleFlush();
  }

  function CORE_scheduleFullScanDebounced() {
    if (fullDebounceT) W.clearTimeout(fullDebounceT);
    fullDebounceT = W.setTimeout(() => {
      fullDebounceT = 0;
      CORE_scheduleFullScan();
    }, CFG.BUS_DEBOUNCE_MS);
  }

  function CORE_scheduleAnswer(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    pending.add(el);
    PERF.deltaUpdates++;
    CORE_scheduleFlush();
  }

  let MO = null;
  let MO_ROOT = null;

  function UTIL_collectAssistantNode(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL.ANSWER)) {
      out.add(el);
      return false;
    }

    if (el.matches?.(SEL.TURN)) {
      const hitInTurn = el.querySelector?.(SEL.ANSWER);
      if (hitInTurn) out.add(hitInTurn);
      return (el.childElementCount || 0) > CFG.MAX_DELTA_CHILDREN;
    }

    const cc = el.childElementCount || 0;
    if (cc === 0) return false;
    if (cc > CFG.MAX_DELTA_CHILDREN) return true;

    const hit = el.querySelector?.(SEL.ANSWER);
    if (hit) out.add(hit);
    return false;
  }

  function OBS_attachMO() {
    const root = UTIL_findConversationRoot();
    if (!root) return;
    if (MO && MO_ROOT === root) return;

    if (MO) {
      try { MO.disconnect(); } catch {}
      MO = null;
    }

    MO_ROOT = root;
    MO = new MutationObserver((muts) => {
      const hit = new Set();
      let needRepair = false;

      for (const m of muts) {
        if (!m.addedNodes?.length) continue;
        for (const n of m.addedNodes) {
          if (UTIL_collectAssistantNode(n, hit)) needRepair = true;
        }
      }

      if (hit.size) {
        hit.forEach(CORE_scheduleAnswer);
      }
      if (needRepair) {
        CORE_scheduleFullScanDebounced();
      }
    });

    MO.observe(root, { childList: true, subtree: true });
  }

  function OBS_detachMO() {
    if (!MO) return;
    try { MO.disconnect(); } catch {}
    MO = null;
    MO_ROOT = null;
  }

  let coreHooked = false;
  const CLEAN = [];

  function CORE_hookCore() {
    if (coreHooked) return;
    if (!W.H2O?.bus) return;

    coreHooked = true;

    const onCoreRefresh = () => CORE_scheduleFullScanDebounced();

    try { W.H2O.bus.on(EV.BUS_IDX_UPDATED, onCoreRefresh); } catch {}
    try { W.H2O.bus.on(EV.BUS_TURN_UPDATED, onCoreRefresh); } catch {}

    W.addEventListener(EV.IDX_UPDATED_WIN, onCoreRefresh, { passive: true });
    W.addEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh, { passive: true });

    CLEAN.push(() => W.removeEventListener(EV.IDX_UPDATED_WIN, onCoreRefresh));
    CLEAN.push(() => W.removeEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh));
  }

  function onRouteOrPageEvent() {
    OBS_attachMO();
    CORE_scheduleFullScanDebounced();
  }

  let booted = false;

  function CORE_ANSBG_boot() {
    if (booted) return;
    booted = true;
    DIAG.bootCount++;

    PERF_init();
    CSS_ensure();
    OBS_attachMO();

    CORE_hookCore();
    const onReady = () => CORE_hookCore();
    W.addEventListener(EV.CORE_READY, onReady, { once: true });
    CLEAN.push(() => W.removeEventListener(EV.CORE_READY, onReady));

    W.addEventListener(EV.ROUTE_CHANGED, onRouteOrPageEvent, true);
    W.addEventListener('popstate', onRouteOrPageEvent, true);
    W.addEventListener('hashchange', onRouteOrPageEvent, true);

    CLEAN.push(() => W.removeEventListener(EV.ROUTE_CHANGED, onRouteOrPageEvent, true));
    CLEAN.push(() => W.removeEventListener('popstate', onRouteOrPageEvent, true));
    CLEAN.push(() => W.removeEventListener('hashchange', onRouteOrPageEvent, true));

    CORE_scheduleFullScan();
  }

  function CORE_ANSBG_dispose() {
    if (!booted) return;
    booted = false;
    DIAG.disposeCount++;

    try { OBS_detachMO(); } catch {}
    try { if (fullDebounceT) W.clearTimeout(fullDebounceT); } catch {}
    fullDebounceT = 0;

    try {
      for (const fn of CLEAN.splice(0)) { try { fn(); } catch {} }
    } catch {}

    const style = D.getElementById(CSS.STYLE_ID);
    if (style) style.remove();

    if (PERF.ticker) {
      try { W.clearInterval(PERF.ticker); } catch {}
      PERF.ticker = 0;
    }
  }

  H2O[PID] = H2O[PID] || {};
  H2O[PID].api = H2O[PID].api || {};
  H2O[PID].api.boot = CORE_ANSBG_boot;
  H2O[PID].api.dispose = CORE_ANSBG_dispose;
  H2O[PID].api.rescan = CORE_scheduleFullScan;

  CORE_ANSBG_boot();
})();
