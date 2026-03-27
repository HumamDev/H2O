// ==UserScript==
// @h2o-id             1z1a.answer.timestamp
// @name               1Z1a.🔴⏳ Answer Timestamp ⏳
// @namespace          H2O.Premium.CGX.answer.timestamp
// @author             HumamDev
// @version            2.0.0
// @revision           001
// @build              260304-102754
// @description        Timestamp under every assistant message (H2O Core aware) + " | #". Contract v2 Stage-1 spine, cgxui hooks, idempotent boot/dispose, legacy-safe.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
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
    CONV_TURNS: '[data-testid="conversation-turns"]',
    CONV_TURN: '[data-testid="conversation-turn"]',
    MAIN: 'main',
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
    WIN_PW_CHANGED:    'evt:h2o:pagination:pagechanged',
    WIN_PW_CHANGED_COMPAT: 'h2o:pagination:pagechanged',
  });

  const CFG_ = Object.freeze({
    // initial refresh delay (keeps old behavior)
    INITIAL_SCAN_DELAY_MS: 1200,
    QUEUE_ALL_DEBOUNCE_MS: 250,
    MO_MAX_NODE_CHILDREN: 24,
    PERF_LOG_MS: 10000,
    PERF_KEY: 'h2o:perf',
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

  /* ───────────────────────────── 2.5) PERF + ROOT HELPERS ───────────────────────────── */

  /** @helper */
  function CORE_AT_perfEnabled() {
    try { return W.localStorage?.getItem(CFG_.PERF_KEY) === '1'; } catch {}
    return false;
  }

  /** @helper */
  function CORE_AT_perfInc(key, n = 1) {
    const perf = MOD.state.perf;
    if (!perf?.enabled) return;
    perf[key] = (perf[key] || 0) + n;
  }

  /** @helper */
  function CORE_AT_startPerfTicker() {
    const st = MOD.state;
    st.perf = st.perf || {
      enabled: false,
      fullScans: 0,
      deltaUpdates: 0,
      labelsUpdated: 0,
      cacheHits: 0,
      timer: 0,
    };

    st.perf.enabled = CORE_AT_perfEnabled();
    if (!st.perf.enabled || st.perf.timer) return;

    st.perf.timer = W.setInterval(() => {
      const p = MOD.state.perf;
      if (!p?.enabled) return;
      try {
        console.log('[1Z1a][perf]', {
          fullScans: p.fullScans || 0,
          deltaUpdates: p.deltaUpdates || 0,
          labelsUpdated: p.labelsUpdated || 0,
          cacheHits: p.cacheHits || 0,
        });
      } catch {}
      p.fullScans = 0;
      p.deltaUpdates = 0;
      p.labelsUpdated = 0;
      p.cacheHits = 0;
    }, CFG_.PERF_LOG_MS);
  }

  /** @helper */
  function CORE_AT_stopPerfTicker() {
    const st = MOD.state;
    const p = st.perf;
    if (!p?.timer) return;
    try { W.clearInterval(p.timer); } catch {}
    p.timer = 0;
  }

  /** @helper */
  function DOM_AT_getConversationRoot() {
    const turns = DOC.querySelector(SEL_.CONV_TURNS);
    if (turns) return turns;
    const turn = DOC.querySelector(SEL_.CONV_TURN);
    if (turn?.parentElement) return turn.parentElement;
    return DOC.querySelector(SEL_.MAIN) || null;
  }

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
  function DOM_AT_getPaginationTurnOffset() {
    const api = W.H2O_Pagination;
    const H = W.H2O;
    if (!api || typeof api.getPageInfo !== 'function') return 0;

    let info = null;
    try { info = api.getPageInfo(); } catch (_) { info = null; }
    if (!info || info.enabled === false) return 0;

    const totalCanonical = Math.max(
      Number(info?.totalTurns || 0),
      Number(info?.totalAnswers || 0),
      Number(info?.answerRange?.total || 0),
      Number(info?.bufferedAnswerRange?.total || 0),
    );
    const localTurns = Number(H?.turn?.total?.() || 0);
    if (!Number.isFinite(totalCanonical) || totalCanonical <= 0) return 0;
    if (!Number.isFinite(localTurns) || localTurns <= 0 || localTurns >= totalCanonical) return 0;

    const start = Math.max(
      0,
      Number(info?.bufferedAnswerRange?.start || info?.answerRange?.start || 0) || 0,
    );
    return start > 1 ? (start - 1) : 0;
  }

  /** @helper */
  function DOM_AT_getTurnIndex(div) {
    const t0 = W.H2O?.turn?.getTurnIndexByAEl?.(div);
    if (!Number.isFinite(t0) || t0 <= 0) return null;
    return t0 + DOM_AT_getPaginationTurnOffset();
  }

  /** @helper */
  function DOM_AT_getAIndex(div) {
    const a0 = W.H2O?.index?.getAIndex?.(div);
    if (Number.isFinite(a0) && a0 > 0) return a0;

    const cached = MOD.state.domAIndexMap?.get?.(div);
    if (Number.isFinite(cached) && cached > 0) {
      CORE_AT_perfInc('cacheHits');
      return cached;
    }
    return null;
  }

  /** @helper */
  function DOM_AT_rebuildDomAIndexMap(root) {
    const map = new WeakMap();
    if (!root) {
      MOD.state.domAIndexMap = map;
      MOD.state.domAIndexCounter = 0;
      return;
    }

    const all = root.querySelectorAll?.(SEL_.ASSIST_MSG) || [];
    let idx = 0;
    for (const el of all) {
      idx += 1;
      map.set(el, idx);
    }
    MOD.state.domAIndexMap = map;
    MOD.state.domAIndexCounter = idx;
  }

  /** @helper */
  function DOM_AT_seedDomAIndexFromDelta(div) {
    const st = MOD.state;
    st.domAIndexMap = st.domAIndexMap || new WeakMap();
    if (st.domAIndexMap.has(div)) return;
    st.domAIndexCounter = (st.domAIndexCounter || 0) + 1;
    st.domAIndexMap.set(div, st.domAIndexCounter);
  }

  /** @critical */
  function UI_AT_buildLabel(div) {
    const ts = DOM_AT_getCreateTime(div);
    if (!ts) return null;

    const base = W.H2O?.time?.format?.(ts) || UTIL_AT_formatLocal(ts);

    // Prefer turn index to stay aligned with Turn(Q→A) system.
    const tIdx = DOM_AT_getTurnIndex(div);
    const aIdx = DOM_AT_getAIndex(div);

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
      CORE_AT_perfInc('labelsUpdated');
    }
  }

  /* ───────────────────────────── 6) SCHEDULER (no spam) ───────────────────────────── */

  const STORE_AT_pendingRoots = new Set();
  let STORE_AT_rafQueued = false;

  /** @helper */
  function DOM_AT_queueRoot(node, opts = null) {
    if (!node || node.nodeType !== 1) return;
    if (opts?.full) MOD.state.pendingFullScan = true;
    if (opts?.delta) {
      CORE_AT_perfInc('deltaUpdates');
      if (node.matches?.(SEL_.ASSIST_MSG)) DOM_AT_seedDomAIndexFromDelta(node);
    }
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
    const st = MOD.state;
    let roots = Array.from(STORE_AT_pendingRoots);
    STORE_AT_pendingRoots.clear();

    if (st.pendingFullScan) {
      st.pendingFullScan = false;
      const fullRoot = DOM_AT_getConversationRoot() || DOC.body;
      DOM_AT_rebuildDomAIndexMap(fullRoot);
      roots = [fullRoot];
      CORE_AT_perfInc('fullScans');
    }

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
    CORE_AT_attachFallbackMO();
    const root = DOM_AT_getConversationRoot();
    if (root) {
      DOM_AT_queueRoot(root, { full: true });
      return;
    }
    // fallback safety only when conversation container is unavailable
    DOM_AT_queueRoot(DOC.body, { full: true });
  }

  /** @helper */
  function DOM_AT_queueAllAssistantsDebounced() {
    const st = MOD.state;
    if (st.queueAllTimer) return;
    st.queueAllTimer = W.setTimeout(() => {
      st.queueAllTimer = 0;
      DOM_AT_queueAllAssistants();
    }, CFG_.QUEUE_ALL_DEBOUNCE_MS);
  }

  /* ───────────────────────────── 7) HOOKS (Core + fallback) ───────────────────────────── */

  /** @critical */
  function CORE_AT_hookCore() {
    const st = MOD.state;
    if (st.coreHooked) return;

    // Must be tolerant: some deployments expose bus later.
    if (!W.H2O?.bus && !W.H2O?.index) return;

    st.coreHooked = true;
    const onCoreReindex = () => DOM_AT_queueAllAssistantsDebounced();

    // Bus topics (if present)
    try { W.H2O?.bus?.on?.(EV_.BUS_INDEX_UPDATED, onCoreReindex); } catch {}
    try { W.H2O?.bus?.on?.(EV_.BUS_TURN_UPDATED,  onCoreReindex); } catch {}

    // Window events (compat)
    W.addEventListener(EV_.WIN_INDEX_UPDATED, onCoreReindex, { passive: true });
    W.addEventListener(EV_.WIN_TURN_UPDATED,  onCoreReindex, { passive: true });
    W.addEventListener(EV_.WIN_ANS_SCAN,      onCoreReindex, { passive: true });
    W.addEventListener(EV_.WIN_PW_CHANGED, onCoreReindex, { passive: true });
    W.addEventListener(EV_.WIN_PW_CHANGED_COMPAT, onCoreReindex, { passive: true });

    st.cleanup = st.cleanup || [];
    st.cleanup.push(() => {
      W.removeEventListener(EV_.WIN_INDEX_UPDATED, onCoreReindex);
      W.removeEventListener(EV_.WIN_TURN_UPDATED,  onCoreReindex);
      W.removeEventListener(EV_.WIN_ANS_SCAN,      onCoreReindex);
      W.removeEventListener(EV_.WIN_PW_CHANGED, onCoreReindex);
      W.removeEventListener(EV_.WIN_PW_CHANGED_COMPAT, onCoreReindex);
      st.coreHooked = false;
    });

    DOM_AT_queueAllAssistants();
  }

  /** @critical */
  function CORE_AT_detachFallbackMO() {
    const st = MOD.state;
    if (!st.observer) return;
    try { st.observer.disconnect(); } catch {}
    st.observer = null;
    st.observerRoot = null;
  }

  /** @helper */
  function DOM_AT_collectAssistNodes(node, out) {
    if (!node || node.nodeType !== 1) return false;
    const el = /** @type {Element} */ (node);

    if (el.matches?.(SEL_.ASSIST_MSG)) {
      out.add(el);
      return false;
    }

    const childCount = el.childElementCount || 0;
    if (!childCount) return false;
    if (childCount > CFG_.MO_MAX_NODE_CHILDREN) return true;

    const first = el.querySelector?.(SEL_.ASSIST_MSG);
    if (!first) return false;
    out.add(first);

    // small wrappers: capture all assistant nodes in one pass
    if (childCount <= 6) {
      const all = el.querySelectorAll?.(SEL_.ASSIST_MSG);
      if (all?.length) all.forEach((a) => out.add(a));
    }
    return false;
  }

  /** @critical */
  function CORE_AT_attachFallbackMO() {
    const st = MOD.state;
    const root = DOM_AT_getConversationRoot() || DOC.body;
    if (st.observer && st.observerRoot === root) return;
    CORE_AT_detachFallbackMO();

    const mo = new MutationObserver((muts) => {
      const hit = new Set();
      let needRepair = false;

      for (const m of muts) {
        const added = m.addedNodes;
        if (!added || !added.length) continue;
        for (const n of added) {
          if (DOM_AT_collectAssistNodes(n, hit)) needRepair = true;
        }
      }

      if (hit.size) hit.forEach((n) => DOM_AT_queueRoot(n, { delta: true }));
      if (needRepair) DOM_AT_queueAllAssistantsDebounced();
    });

    mo.observe(root, { childList: true, subtree: true });

    st.observer = mo;
    st.observerRoot = root;
  }

  /* ───────────────────────────── 8) BOOT / DISPOSE (idempotent + full cleanup) ───────────────────────────── */

  /** @critical */
  function CORE_AT_boot() {
    const st = MOD.state;
    if (st.booted) return;
    st.booted = true;

    st.cleanup = st.cleanup || [];
    st.pendingFullScan = false;
    st.domAIndexMap = new WeakMap();
    st.domAIndexCounter = 0;
    st.queueAllTimer = 0;

    CORE_AT_startPerfTicker();

    UI_AT_injectCSSOnce();

    CORE_AT_attachFallbackMO();
    CORE_AT_hookCore();
    W.addEventListener(EV_.WIN_CORE_READY, CORE_AT_hookCore, { once: true });

    st.cleanup.push(() => {
      try { W.removeEventListener(EV_.WIN_CORE_READY, CORE_AT_hookCore); } catch {}
    });
    st.cleanup.push(() => {
      if (st.queueAllTimer) {
        try { W.clearTimeout(st.queueAllTimer); } catch {}
      }
      st.queueAllTimer = 0;
    });
    st.cleanup.push(() => CORE_AT_detachFallbackMO());
    st.cleanup.push(() => CORE_AT_stopPerfTicker());

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

    STORE_AT_pendingRoots.clear();
    STORE_AT_rafQueued = false;
    st.pendingFullScan = false;

    st.booted = false;
  }

  /* ───────────────────────────── 9) MINIMAL BOOTSTRAP ───────────────────────────── */

  CORE_AT_boot();

})();
