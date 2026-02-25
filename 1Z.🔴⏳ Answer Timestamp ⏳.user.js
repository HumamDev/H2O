// ==UserScript==
// @name         1Z.🔴⏳ Answer Timestamp ⏳
// @namespace    H2O.Prime.CGX.AnswerTimestamp
// @version      2.0.0
// @description  Timestamp under every assistant message (H2O Core aware) + " | #". Contract v2 Stage-1 spine, cgxui hooks, idempotent boot/dispose, legacy-safe.
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* =============================================================================
   * 🧱 H2O Module Standard — Contract (v2.0) — Stage 1: Foundation/Mechanics
   * - Identity-first, registries, cgxui-only hooks (alongside legacy), boot/dispose,
   *   cleanup, no feature loss.
   * ============================================================================= */

  /* ───────────────────────────── 0) IDENTITY ───────────────────────────── */

  /** @core Identity + namespace anchors (Contract v2.0) */
  const TOK = 'AT';                  // Answer Timestamp
  const PID = 'answrts';             // Answer Timestamp (pid-safe)
  const CID = 'ANSWERTIMESTAMP';     // constant prefix carrier
  const SkID = 'ats';                // Skin ID

  const MODTAG = 'AnswerTimestamp';
  const MODICON = '⏳';
  const EMOJI_HDR = '🔴';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Aliases (readability only; NOT new identities)
  const DsID = PID;
  const BrID = PID;

  /* ───────────────────────────── 1) REGISTRIES ───────────────────────────── */

  /** @core Constants & registries (no raw selector/key/style IDs) */
  const SEL_ = Object.freeze({
    ASSIST_MSG: 'div[data-message-author-role="assistant"]',
    STAMP_OURS: ':scope > .cgxui-ats-ts',
    STAMP_LEGACY: ':scope > .chatgpt-timestamp',
  });

  const ATTR_ = Object.freeze({
    OWNER: 'data-cgxui-owner',
    UI:    'data-cgxui',
    STATE: 'data-cgxui-state',
  });

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
    // Keep legacy class name alive for compatibility, but style via cgxui.
    STAMP_CLASS_OURS: 'cgxui-ats-ts',
    STAMP_CLASS_LEGACY: 'chatgpt-timestamp',
  });

  const EV_ = Object.freeze({
    // bus topics (Core)
    BUS_INDEX_UPDATED: 'index:updated',
    BUS_TURN_UPDATED:  'turn:updated',

    // window events (compat)
    WIN_CORE_READY:    'h2o:core:ready',
    WIN_INDEX_UPDATED: 'h2o:index:updated',
    WIN_TURN_UPDATED:  'h2o:turn:updated',
    WIN_ANS_SCAN:      'h2o:answers:scan',
  });

  const CFG_ = Object.freeze({
    // initial refresh delay (keeps old behavior)
    INITIAL_SCAN_DELAY_MS: 1200,
  });

  /* ───────────────────────────── 2) VAULT + BOUNDED DIAG ───────────────────────────── */

  /** @core Module vault (H2O[TOK][PID]) + bounded DIAG (H2O[TOK][BrID].diag) */
  const W = window;
  const DOC = document;

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

  /* ───────────────────────────── 3) UI — CSS (idempotent) ───────────────────────────── */

  /** @critical */
  function UI_AT_injectCSSOnce() {
    if (DOC.getElementById(CSS_.STYLE_ID)) return;

    const style = DOC.createElement('style');
    style.id = CSS_.STYLE_ID;
    style.textContent = `
/* ${EMOJI_HDR} ${MODICON} ${MODTAG} — cgxui-only styling (legacy class kept for compatibility) */
.${CSS_.STAMP_CLASS_OURS},
.${CSS_.STAMP_CLASS_LEGACY}{
  font-size: 12px;
  color: #999;
  font-weight: 200;
  margin-top: 1px;
  margin-bottom: 1px;
  text-align: left;
  margin-left: 0;
  padding-left: 1px;
  width: 100%;
  max-width: 100vw;
  display: block;
  font-family: ui-monospace, "SF Mono", Monaco, monospace;
}
    `.trim();

    DOC.head.appendChild(style);

    MOD.state.styleEl = style;
    MOD.state.cleanup = MOD.state.cleanup || [];
    MOD.state.cleanup.push(() => {
      try { style.remove(); } catch {}
      MOD.state.styleEl = null;
    });
  }

  /* ───────────────────────────── 4) HELPERS (no feature loss) ───────────────────────────── */

  const UTIL_AT_months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /** @helper */
  function UTIL_AT_pad2(n) { return String(n).padStart(2, '0'); }

  /** @helper */
  function UTIL_AT_formatLocal(tsSeconds) {
    const d = new Date(tsSeconds * 1000);
    return `${UTIL_AT_months[d.getMonth()]} ${d.getDate()} - ${UTIL_AT_pad2(d.getHours())}:${UTIL_AT_pad2(d.getMinutes())}`;
  }

  // Fallback (cache per element so fiber scanning happens once)
  const STORE_AT_TS_cache = new WeakMap();       // div -> number|null
  const STORE_AT_REACTKEY_cache = new WeakMap(); // div -> string|null

  /** @helper */
  function DOM_AT_getReactFiberKey(div) {
    if (STORE_AT_REACTKEY_cache.has(div)) return STORE_AT_REACTKEY_cache.get(div);
    const k =
      Object.keys(div).find(x => x.startsWith('__reactFiber$')) ||
      Object.keys(div).find(x => x.startsWith('__reactProps$')) ||
      null;
    STORE_AT_REACTKEY_cache.set(div, k);
    return k;
  }

  /** @helper */
  function DOM_AT_findCreateTimeFromReact(div) {
    const reactKey = DOM_AT_getReactFiberKey(div);
    if (!reactKey) return null;

    // props shape
    if (reactKey.startsWith('__reactProps$')) {
      const p = div[reactKey];
      const t = p?.messages?.[0]?.create_time ?? p?.message?.create_time ?? null;
      return (typeof t === 'number' && isFinite(t) && t > 0) ? t : null;
    }

    // fiber shape
    let f = div[reactKey];
    for (let i = 0; i < 18 && f; i++) {
      const mp = f.memoizedProps;
      const t =
        mp?.messages?.[0]?.create_time ??
        mp?.message?.create_time ??
        mp?.children?.props?.messages?.[0]?.create_time ??
        mp?.children?.props?.message?.create_time ??
        null;
      if (typeof t === 'number' && isFinite(t) && t > 0) return t;
      f = f.return;
    }
    return null;
  }

  /** @critical */
  function DOM_AT_getCreateTime(div) {
    // Prefer Core (fast + cached on their side)
    const core = W.H2O?.time?.getCreateTime?.(div);
    if (Number.isFinite(core) && core > 0) return core;

    if (STORE_AT_TS_cache.has(div)) return STORE_AT_TS_cache.get(div);

    const ts = DOM_AT_findCreateTimeFromReact(div);
    const ok = (typeof ts === 'number' && isFinite(ts) && ts > 0) ? ts : null;
    STORE_AT_TS_cache.set(div, ok);
    return ok;
  }

  /** @helper */
  function DOM_AT_getTurnIndex(div) {
    const t0 = W.H2O?.turn?.getTurnIndexByAEl?.(div);
    return (Number.isFinite(t0) && t0 > 0) ? t0 : null;
  }

  /** @helper */
  function DOM_AT_getAIndex(div) {
    const a0 = W.H2O?.index?.getAIndex?.(div);
    return (Number.isFinite(a0) && a0 > 0) ? a0 : null;
  }

  /** @helper */
  function DOM_AT_computeDomAIndex(div) {
    const all = DOC.querySelectorAll(SEL_.ASSIST_MSG);
    for (let i = 0; i < all.length; i++) if (all[i] === div) return i + 1;
    return null;
  }

  /** @critical */
  function UI_AT_buildLabel(div) {
    const ts = DOM_AT_getCreateTime(div);
    if (!ts) return null;

    const base = W.H2O?.time?.format?.(ts) || UTIL_AT_formatLocal(ts);

    // Prefer turn index to stay aligned with Turn(Q→A) system.
    const tIdx = DOM_AT_getTurnIndex(div);
    let aIdx = DOM_AT_getAIndex(div);
    if (!aIdx) aIdx = DOM_AT_computeDomAIndex(div);

    if (tIdx) return `${base} | ${tIdx}`;
    if (aIdx) return `${base} | ${aIdx}`;
    return `${base}`;
  }

  /* ───────────────────────────── 5) DOM APPLY ───────────────────────────── */

  /** @critical */
  function DOM_AT_addOrUpdateOne(div) {
    if (!div || div.nodeType !== 1) return;

    const fullLabel = UI_AT_buildLabel(div);
    if (!fullLabel) return;

    let stamp =
      div.querySelector(SEL_.STAMP_OURS) ||
      div.querySelector(SEL_.STAMP_LEGACY) ||
      null;

    if (!stamp) {
      stamp = DOC.createElement('div');
      stamp.className = `${CSS_.STAMP_CLASS_LEGACY} ${CSS_.STAMP_CLASS_OURS}`;
      stamp.setAttribute(ATTR_.OWNER, SkID);
      stamp.setAttribute(ATTR_.UI, `${SkID}-stamp`);
      div.appendChild(stamp);
    } else {
      // Upgrade existing stamp node without breaking old styling/hooks
      if (!stamp.classList.contains(CSS_.STAMP_CLASS_OURS)) stamp.classList.add(CSS_.STAMP_CLASS_OURS);
      if (!stamp.classList.contains(CSS_.STAMP_CLASS_LEGACY)) stamp.classList.add(CSS_.STAMP_CLASS_LEGACY);
      if (!stamp.getAttribute(ATTR_.OWNER)) stamp.setAttribute(ATTR_.OWNER, SkID);
      if (!stamp.getAttribute(ATTR_.UI)) stamp.setAttribute(ATTR_.UI, `${SkID}-stamp`);
    }

    if (stamp.dataset.fullLabel !== fullLabel) {
      stamp.textContent = fullLabel;
      stamp.dataset.fullLabel = fullLabel;
    }
  }

  /* ───────────────────────────── 6) SCHEDULER (no spam) ───────────────────────────── */

  const STORE_AT_pendingRoots = new Set();
  let STORE_AT_rafQueued = false;

  /** @helper */
  function DOM_AT_queueRoot(node) {
    if (!node || node.nodeType !== 1) return;
    STORE_AT_pendingRoots.add(node);
    DOM_AT_scheduleFlush();
  }

  /** @helper */
  function DOM_AT_scheduleFlush() {
    if (STORE_AT_rafQueued) return;
    STORE_AT_rafQueued = true;
    requestAnimationFrame(() => {
      STORE_AT_rafQueued = false;
      DOM_AT_flush();
    });
  }

  /** @critical */
  function DOM_AT_flush() {
    const roots = Array.from(STORE_AT_pendingRoots);
    STORE_AT_pendingRoots.clear();

    for (const root of roots) {
      if (root.matches?.(SEL_.ASSIST_MSG)) {
        DOM_AT_addOrUpdateOne(root);
        continue;
      }
      const answers = root.querySelectorAll?.(SEL_.ASSIST_MSG);
      if (!answers || !answers.length) continue;
      answers.forEach(DOM_AT_addOrUpdateOne);
    }
  }

  /** @helper */
  function DOM_AT_queueAllAssistants() {
    DOM_AT_queueRoot(DOC.body);
  }

  /* ───────────────────────────── 7) HOOKS (Core + fallback) ───────────────────────────── */

  /** @critical */
  function CORE_AT_hookCore() {
    const st = MOD.state;
    if (st.coreHooked) return;

    // Must be tolerant: some deployments expose bus later.
    if (!W.H2O?.bus && !W.H2O?.index) return;

    st.coreHooked = true;

    // Bus topics (if present)
    try { W.H2O?.bus?.on?.(EV_.BUS_INDEX_UPDATED, DOM_AT_queueAllAssistants); } catch {}
    try { W.H2O?.bus?.on?.(EV_.BUS_TURN_UPDATED,  DOM_AT_queueAllAssistants); } catch {}

    // Window events (compat)
    W.addEventListener(EV_.WIN_INDEX_UPDATED, DOM_AT_queueAllAssistants, { passive: true });
    W.addEventListener(EV_.WIN_TURN_UPDATED,  DOM_AT_queueAllAssistants, { passive: true });
    W.addEventListener(EV_.WIN_ANS_SCAN,      DOM_AT_queueAllAssistants, { passive: true });

    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      W.removeEventListener(EV_.WIN_INDEX_UPDATED, DOM_AT_queueAllAssistants);
      W.removeEventListener(EV_.WIN_TURN_UPDATED,  DOM_AT_queueAllAssistants);
      W.removeEventListener(EV_.WIN_ANS_SCAN,      DOM_AT_queueAllAssistants);
      st.coreHooked = false;
    });

    DOM_AT_queueAllAssistants();
  }

  /** @critical */
  function CORE_AT_attachFallbackMO() {
    const st = MOD.state;
    if (st.observer) return;

    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        const added = m.addedNodes;
        if (!added || !added.length) continue;
        for (const n of added) DOM_AT_queueRoot(n);
      }
    });

    mo.observe(DOC.body, { childList: true, subtree: true });

    st.observer = mo;
    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      try { mo.disconnect(); } catch {}
      st.observer = null;
    });
  }

  /* ───────────────────────────── 8) BOOT / DISPOSE (idempotent + full cleanup) ───────────────────────────── */

  /** @critical */
  function CORE_AT_boot() {
    const st = MOD.state;
    if (st.booted) return;
    st.booted = true;

    st.cleanup = st.cleanup || [];

    UI_AT_injectCSSOnce();

    CORE_AT_attachFallbackMO();
    CORE_AT_hookCore();
    W.addEventListener(EV_.WIN_CORE_READY, CORE_AT_hookCore, { once: true });

    st.cleanup.push(() => {
      try { W.removeEventListener(EV_.WIN_CORE_READY, CORE_AT_hookCore); } catch {}
    });

    // initial scan (kept, but queued)
    const t = setTimeout(DOM_AT_queueAllAssistants, CFG_.INITIAL_SCAN_DELAY_MS);
    st.cleanup.push(() => clearTimeout(t));

    // Expose
    MOD.api.boot = CORE_AT_boot;
    MOD.api.dispose = CORE_AT_dispose;
  }

  /** @critical */
  function CORE_AT_dispose() {
    const st = MOD.state;
    if (!st.booted) return;

    const cleanup = st.cleanup || [];
    while (cleanup.length) {
      const fn = cleanup.pop();
      try { fn && fn(); } catch {}
    }

    st.booted = false;
  }

  /* ───────────────────────────── 9) MINIMAL BOOTSTRAP ───────────────────────────── */

  CORE_AT_boot();

})();
