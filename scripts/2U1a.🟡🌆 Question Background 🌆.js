// ==UserScript==
// @h2o-id             2u1a.question.background
// @name               2U1a.🟡🌆 Question Background 🌆
// @namespace          H2O.Premium.CGX.question.background
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260304-102754
// @description        Host/background structural support for Question Numbers (split from 2X Question Numbers & Style).
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  const TOK = 'QN';
  const PID = 'qbigbg';
  const CID = 'QBIGBG';
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
    SIG_BG: 'data-h2o-qbg-sig',
  });

  const UI = Object.freeze({
    HOST_CLASS: `cgxui-${SkID}-host`,
    ALLOW_OVERFLOW_CLASS: `cgxui-${SkID}-allow-overflow`,
  });

  const CSS = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-bg-style`,
  });

  const CFG = Object.freeze({
    INC_PER_FRAME: 60,
    BUS_DEBOUNCE_MS: 260,
    MAX_DELTA_CHILDREN: 24,
  });

  const KEY_INIT_BOOT = `H2O:${TOK}:${PID}:booted`;

  function q(sel, root = D) {
    try { return root.querySelector(sel); } catch { return null; }
  }

  function qsa(sel, root = D) {
    try { return Array.from(root.querySelectorAll(sel)); } catch { return []; }
  }

  function setAttr(el, k, v) {
    try { el?.setAttribute?.(k, v); } catch {}
  }

  function injectCSSOnce() {
    if (D.getElementById(CSS.STYLE_ID)) return;

    const style = D.createElement('style');
    style.id = CSS.STYLE_ID;
    style.textContent = `
${SEL.USER_MSG}.${UI.HOST_CLASS}{
  position: relative !important;
  overflow: visible;
  z-index: 0;
}
${SEL.USER_MSG}.${UI.HOST_CLASS}.${UI.ALLOW_OVERFLOW_CLASS}{
  overflow: visible !important;
}
${SEL.USER_MSG}.${UI.HOST_CLASS} ${SEL.BUBBLE}{
  position: relative;
  z-index: 0;
}
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

  function applyHost(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    if (el.getAttribute(ATTR.SIG_BG) === '1') return false;

    if (!el.classList.contains(UI.HOST_CLASS)) el.classList.add(UI.HOST_CLASS);
    if (!el.classList.contains(UI.ALLOW_OVERFLOW_CLASS)) el.classList.add(UI.ALLOW_OVERFLOW_CLASS);

    setAttr(el, ATTR.OWNER, SkID);
    setAttr(el, ATTR.UI, `${SkID}-host`);
    setAttr(el, ATTR.SIG_BG, '1');
    return true;
  }

  function fullScan() {
    const users = qsa(SEL.USER_MSG);
    for (const el of users) applyHost(el);
    DIAG.lastFullScanCount = users.length;
  }

  const S = MOD.state;
  S.pending = S.pending || new Set();

  function scheduleUser(el) {
    if (!el || !(el instanceof HTMLElement)) return;
    S.pending.add(el);
    scheduleFlush();
  }

  function flush() {
    S.rafPending = false;

    if (S.needFull) {
      S.needFull = false;
      S.pending.clear();
      fullScan();
      return;
    }

    let n = 0;
    for (const el of Array.from(S.pending)) {
      S.pending.delete(el);
      applyHost(el);
      n++;
      if (n >= CFG.INC_PER_FRAME) break;
    }

    if (S.pending.size) scheduleFlush();
  }

  function scheduleFlush() {
    if (S.rafPending) return;
    S.rafPending = true;
    requestAnimationFrame(() => {
      try { flush(); } catch {}
    });
  }

  function scheduleFullScan() {
    S.needFull = true;
    scheduleFlush();
  }

  function scheduleFullScanDebounced() {
    if (S.fullDebounceT) clearTimeout(S.fullDebounceT);
    S.fullDebounceT = setTimeout(() => {
      S.fullDebounceT = 0;
      scheduleFullScan();
    }, CFG.BUS_DEBOUNCE_MS);
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
    const root = findConversationRoot();
    if (!root) return;
    if (S.mo && S.moRoot === root) return;

    if (S.mo) {
      try { S.mo.disconnect(); } catch {}
      S.mo = null;
    }

    S.moRoot = root;
    S.mo = new MutationObserver((muts) => {
      const hit = new Set();
      let needRepair = false;

      for (const m of muts) {
        if (!m.addedNodes?.length) continue;
        for (const node of m.addedNodes) {
          if (collectUserCandidate(node, hit)) needRepair = true;
        }
      }

      if (hit.size) {
        for (const el of hit) scheduleUser(el);
      }
      if (needRepair) scheduleFullScanDebounced();
    });

    S.mo.observe(root, { childList: true, subtree: true });
  }

  function detachMO() {
    if (!S.mo) return;
    try { S.mo.disconnect(); } catch {}
    S.mo = null;
    S.moRoot = null;
  }

  function hookCore() {
    if (S.coreHooked) return;
    if (!W.H2O?.bus) return;
    S.coreHooked = true;

    const onCoreRefresh = () => scheduleFullScanDebounced();

    try { W.H2O.bus.on(EV.BUS_INDEX_UPDATED, onCoreRefresh); } catch {}
    try { W.H2O.bus.on(EV.BUS_TURN_UPDATED, onCoreRefresh); } catch {}

    W.addEventListener(EV.INDEX_UPDATED_WIN, onCoreRefresh, { passive: true });
    W.addEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh, { passive: true });

    S.cleanup.push(() => W.removeEventListener(EV.INDEX_UPDATED_WIN, onCoreRefresh));
    S.cleanup.push(() => W.removeEventListener(EV.TURN_UPDATED_WIN, onCoreRefresh));
  }

  function onRouteChanged() {
    attachMO();
    scheduleFullScanDebounced();
  }

  function boot() {
    if (W[KEY_INIT_BOOT]) return;
    W[KEY_INIT_BOOT] = true;

    S.cleanup = S.cleanup || [];
    S.pending = S.pending || new Set();
    S.rafPending = false;
    S.needFull = false;
    S.mo = null;
    S.moRoot = null;
    S.coreHooked = false;

    injectCSSOnce();
    attachMO();

    hookCore();
    W.addEventListener(EV.CORE_READY, hookCore, { once: true });
    S.cleanup.push(() => W.removeEventListener(EV.CORE_READY, hookCore));

    W.addEventListener(EV.ROUTE_CHANGED, onRouteChanged, true);
    W.addEventListener('popstate', onRouteChanged, true);
    W.addEventListener('hashchange', onRouteChanged, true);
    S.cleanup.push(() => W.removeEventListener(EV.ROUTE_CHANGED, onRouteChanged, true));
    S.cleanup.push(() => W.removeEventListener('popstate', onRouteChanged, true));
    S.cleanup.push(() => W.removeEventListener('hashchange', onRouteChanged, true));

    scheduleFullScan();
  }

  function dispose() {
    if (!W[KEY_INIT_BOOT]) return;

    const cleanup = S.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    if (S.fullDebounceT) clearTimeout(S.fullDebounceT);
    S.fullDebounceT = 0;

    detachMO();

    W[KEY_INIT_BOOT] = false;
  }

  MOD.api.boot = boot;
  MOD.api.dispose = dispose;
  MOD.api.rescan = scheduleFullScan;

  boot();
})();
