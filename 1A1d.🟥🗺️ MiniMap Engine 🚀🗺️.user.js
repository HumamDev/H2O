// ==UserScript==
// @name         1A1d.🟥🗺️ MiniMap Engine 🚀🗺️
// @namespace    H2O.Prime.CGX.MiniMapEngine
// @version      12.6.3
// @description  MiniMap Engine: hard runtime authority (observers, rebuild scheduling, active sync)
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* Cutover Smoke Test Checklist
 * - Kernel+Shell+Engine (Main optional): MiniMap appears, updates, navigates
 * - Kernel+Shell+Main+Engine: no double observers, no duplicate rebuild loops
 * - Remove Main: system remains functional (target architecture)
 */

(() => {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const TOPW = W.top || W;

  // Kernel-authoritative bridge access (no fallbacks here; util.mm decides)
  const MM = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.mm || null;
  const MM_core = () => MM()?.core?.() || null;
  const MM_ui = () => MM()?.ui?.() || null;
  const MM_rt = () => MM()?.rt?.() || null;
  const MM_behavior = () => (TOPW.H2O_MM_SHARED?.get?.() || null)?.util?.behavior || null;
  const MM_uiRefs = () => MM()?.uiRefs?.() || (MM_ui()?.getRefs?.() || {});

  const ENGINE_VER = '12.6.3';
  const EVT_ENGINE_READY = 'evt:h2o:minimap:engine-ready';
  const EVT_SHELL_READY = 'evt:h2o:minimap:shell-ready';
  const EVT_ANSWERS_SCAN_FALLBACK = 'evt:h2o:answers:scan';
  const EVT_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';

  const BOOT_MAX_TRIES = 80;
  const BOOT_GAP_MS = 120;
  const REBUILD_DEBOUNCE_MS = 120;

  const S = {
    running: false,
    bootDone: false,
    bootTries: 0,
    bootTimer: null,

    rebuildTimer: null,
    rebuildReason: '',
    syncRAF: 0,

    domMO: null,
    panelMO: null,
    formRO: null,
    io: null,

    answerPollTimer: null,
    turnPollTimer: null,
    failsafeTimer: null,

    offScroll: null,
    offResize: null,
    offShellReady: null,
    offBehaviorChanged: null,
    offBtnClick: null,

    lastActiveTurnId: '',
    visibleSet: new Set(),
    mapButtons: null,
    turnListeners: new Set(),
    scrollSyncDisabled: false,
    mmScroller: null,
    mmUser: false,
    mmProgram: false,
    mmUserTimer: null,
    offMmWheel: null,
    offMmTouchStart: null,
    offMmMouseDown: null,
  };

  function getCoreSurface() {
    return MM_core();
  }

  function disableScrollSync(reason = 'core-missing') {
    if (S.scrollSyncDisabled) return;
    S.scrollSyncDisabled = true;
    warn('Scroll sync disabled.', { reason });
  }

  function getDiag() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    try {
      const d = SH?.diag?.ensure?.({ name: 'H2O MiniMap Engine', diagKey: 'H2O:diag:minimap' });
      return d && typeof d.log === 'function' ? d : null;
    } catch {
      return null;
    }
  }

  function dlog(step, data) {
    try { getDiag()?.log?.(step, data); } catch {}
  }

  function derr(where, err) {
    try { getDiag()?.err?.(err, where); } catch {}
  }

  function warn(msg, extra) { try { console.warn('[MiniMap Engine]', msg, extra || ''); } catch {} }

  function diagAssertNoMainHelpers() {
    const diag = getDiag();
    if (!diag) return;
    const names = [
      ['setActive', 'MiniMapButton'].join(''),
      ['center', 'MiniMapOnId'].join(''),
      ['updateActive', 'MiniMapBtn'].join(''),
      ['updateCounter', 'ToId'].join(''),
      ['updateToggleColor', 'ById'].join(''),
    ];
    try {
      const present = names.filter((n) => typeof TOPW?.[n] === 'function');
      if (present.length) diag.log?.('engine:assert-main-helpers-present', { names: present });
    } catch {}
  }

  function markPlugin() {
    try { TOPW.H2O_MM_ENGINE_PLUGIN = true; } catch {}
    try { TOPW.H2O_MM_ENGINE_VER = ENGINE_VER; } catch {}
  }

  function markReady(ready) {
    try { TOPW.H2O_MM_ENGINE_READY = !!ready; } catch {}
  }

  function getRegs() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const SEL = SH?.SEL_ || SH?.registries?.SEL || W?.H2O?.SEL || {};
    const EV = SH?.EV_ || SH?.registries?.EV || W?.H2O?.EV || {};
    return { SEL, EV };
  }

  function q(sel, root = document) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function qq(sel, root = document) {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  }

  function answersSelector() {
    const { SEL } = getRegs();
    return SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]';
  }

  function mmBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN || '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"]';
  }

  function activeBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN_ACTIVE || '[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active';
  }

  function btnClassName() {
    return 'cgxui-mm-btn';
  }

  function wrapClassName() {
    return 'cgxui-mm-wrap';
  }

  function convContainer() {
    const { SEL } = getRegs();
    return q(SEL.CONV_TURNS) || q(SEL.MAIN) || document.body;
  }

  function formEl() {
    const { SEL } = getRegs();
    return q(SEL.FORM);
  }

  function minimapPanel() {
    try {
      const { panel } = MM_uiRefs();
      if (panel && panel.isConnected) return panel;
    } catch {}
    const { SEL } = getRegs();
    return q(SEL.MINIMAP) || q(SEL.PANEL) || q('[data-cgxui$="minimap"]');
  }

  function minimapCol() {
    try {
      const { col } = MM_uiRefs();
      if (col && col.isConnected) return col;
    } catch {}
    const { SEL } = getRegs();
    return q(SEL.MM_COL) || q('[data-cgxui="mm-col"]') || q('.cgxui-mm-col');
  }

  function ensureCol() {
    const panel = minimapPanel();
    if (!panel) return null;

    let col = minimapCol();
    if (col) return col;

    col = document.createElement('div');
    col.className = 'cgxui-mm-col';
    col.setAttribute('data-cgxui-owner', 'mnmp');
    col.setAttribute('data-cgxui', 'mm-col');
    panel.appendChild(col);
    return col;
  }

  function setStateToken(el, tok, on) {
    if (!el) return;
    const key = 'data-cgxui-state';
    const cur = String(el.getAttribute(key) || '').trim();
    const set = new Set(cur ? cur.split(/\s+/).filter(Boolean) : []);
    if (on) set.add(tok); else set.delete(tok);
    if (set.size) el.setAttribute(key, Array.from(set).join(' '));
    else el.removeAttribute(key);
  }

  function internalSetActiveClass(btnId) {
    const id = String(btnId || '').trim();
    if (!id) return;
    const btns = qq(mmBtnSelector());
    for (const b of btns) {
      const on = String(b?.dataset?.id || '') === id;
      b.classList.toggle('active', on);
      b.classList.toggle('inview', on);
      setStateToken(b, 'active', on);
      setStateToken(b, 'inview', on);
      if (on) b.setAttribute('data-cgxui-inview', '1');
      else b.removeAttribute('data-cgxui-inview');
    }
  }

  function findAnswerById(answerId) {
    const id = String(answerId || '').trim();
    if (!id) return null;
    const variants = [id];
    if (id.startsWith('turn:')) variants.push(String(id.slice(5)).trim());
    else variants.push(`turn:${id}`);
    try {
      const normalizeAssistant = (el) => {
        if (!el) return null;
        try {
          const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
          if (role === 'assistant') return el;
        } catch {}
        try {
          const nested = el.querySelector?.('[data-message-author-role="assistant"]');
          if (nested) return nested;
        } catch {}
        try {
          const up = el.closest?.('[data-message-author-role="assistant"]');
          if (up) return up;
        } catch {}
        return el;
      };
      for (const v of variants) {
        if (!v) continue;
        const esc = (window.CSS?.escape) ? CSS.escape(v) : v.replace(/"/g, '\\"');
        const el = q(`[data-message-id="${esc}"]`) ||
          q(`[data-cgxui-id="${esc}"]`) ||
          q(`[data-h2o-ans-id="${esc}"]`) ||
          q(`[data-h2o-core-id="${esc}"]`);
        if (el) return normalizeAssistant(el);
      }
      return null;
    } catch {
      return null;
    }
  }

  function resolveAnswerTarget(anyId, primaryAId = '', turnIdxHint = 0) {
    const key = String(anyId || '').trim();
    const aId = String(primaryAId || '').trim();
    const candidates = [key];
    if (key.startsWith('turn:')) candidates.push(String(key.slice(5)).trim());
    else candidates.push(`turn:${key}`);
    if (aId) {
      candidates.push(aId);
      if (aId.startsWith('turn:')) candidates.push(String(aId.slice(5)).trim());
      else candidates.push(`turn:${aId}`);
    }
    const core = getCoreSurface();
    let t = null;
    for (const c of candidates) {
      if (!c || t) continue;
      try { t = core?.getTurnById?.(c) || null; } catch {}
    }
    if (!t && core && typeof core.getTurnList === 'function') {
      try {
        const list = core.getTurnList() || [];
        t = list.find((x) => {
          const tid = String(x?.turnId || '').trim();
          const aid = String(x?.answerId || '').trim();
          return candidates.includes(tid) || candidates.includes(aid);
        }) || null;
      } catch {}
    }
    const answerId = String(t?.answerId || aId || '').trim();
    const normalizeAssistant = (el) => {
      if (!el) return null;
      try {
        const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
        if (role === 'assistant') return el;
      } catch {}
      try {
        const nested = el.querySelector?.('[data-message-author-role="assistant"]');
        if (nested) return nested;
      } catch {}
      try {
        const up = el.closest?.('[data-message-author-role="assistant"]');
        if (up) return up;
      } catch {}
      return el;
    };
    const direct = (
      normalizeAssistant(t?.primaryAEl) ||
      findAnswerById(answerId || key) ||
      normalizeAssistant(t?.el) ||
      normalizeAssistant(t?.qEl)
    );
    if (direct) return direct;

    // Fallback: resolve by turn index to the Nth assistant answer in DOM order.
    let idx = Number(t?.index || t?.idx || turnIdxHint || 0);
    if (!idx && core && typeof core.getTurnIndex === 'function') {
      try { idx = Number(core.getTurnIndex(key) || 0); } catch {}
    }
    if (idx > 0) {
      const answers = qq(answersSelector());
      const el = answers[idx - 1] || null;
      if (el) return el;
    }
    return null;
  }

  function resolveQuestionTarget(anyId, primaryAId = '') {
    const key = String(anyId || '').trim();
    const aId = String(primaryAId || '').trim();
    const candidates = [key];
    if (key.startsWith('turn:')) candidates.push(String(key.slice(5)).trim());
    else candidates.push(`turn:${key}`);
    if (aId) {
      candidates.push(aId);
      if (aId.startsWith('turn:')) candidates.push(String(aId.slice(5)).trim());
      else candidates.push(`turn:${aId}`);
    }

    const core = getCoreSurface();
    let t = null;
    for (const c of candidates) {
      if (!c || t) continue;
      try { t = core?.getTurnById?.(c) || null; } catch {}
    }
    if (!t && core && typeof core.getTurnList === 'function') {
      try {
        const list = core.getTurnList() || [];
        t = list.find((x) => {
          const tid = String(x?.turnId || '').trim();
          const aid = String(x?.answerId || '').trim();
          return candidates.includes(tid) || candidates.includes(aid);
        }) || null;
      } catch {}
    }

    const normalizeQuestion = (el) => {
      if (!el) return null;
      try {
        const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
        if (role === 'user') return el;
      } catch {}
      try {
        const nested = el.querySelector?.('[data-message-author-role="user"]');
        if (nested) return nested;
      } catch {}
      try {
        const up = el.closest?.('[data-message-author-role="user"]');
        if (up) return up;
      } catch {}
      return null;
    };

    const qDirect = normalizeQuestion(t?.qEl);
    if (qDirect) return qDirect;

    // Fallback: from the answer, pick the closest previous user message.
    const ans = resolveAnswerTarget(key, aId, Number(t?.idx || t?.index || 0));
    if (ans) {
      try {
        const turnHost = ans.closest?.('[data-testid="conversation-turn"]');
        const qInTurn = normalizeQuestion(turnHost?.querySelector?.('[data-message-author-role="user"]'));
        if (qInTurn) return qInTurn;
      } catch {}
      try {
        let cur = ans.previousElementSibling;
        while (cur) {
          const q = normalizeQuestion(cur);
          if (q) return q;
          cur = cur.previousElementSibling;
        }
      } catch {}
      try {
        const host = ans.closest?.('[data-testid^="conversation-turn"]') || ans.parentElement;
        const q = host?.querySelector?.('[data-message-author-role="user"]');
        if (q) return q;
      } catch {}
      try {
        const users = qq('[data-message-author-role="user"]');
        let best = null;
        for (const u of users) {
          if (!u?.isConnected) continue;
          const rel = u.compareDocumentPosition(ans);
          if (!(rel & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
          if (!best || (best.compareDocumentPosition(u) & Node.DOCUMENT_POSITION_FOLLOWING)) best = u;
        }
        const q = normalizeQuestion(best);
        if (q) return q;
      } catch {}
    }

    // Index-based fallback when turn payload lacks qEl.
    try {
      const core2 = getCoreSurface();
      let idx = Number(t?.idx || t?.index || 0);
      if (!idx && core2 && typeof core2.getTurnIndex === 'function') {
        idx = Number(core2.getTurnIndex(key) || 0);
      }
      if (idx > 0) {
        const turnHosts = qq('[data-testid="conversation-turn"]');
        const host = turnHosts[idx - 1] || null;
        const q = normalizeQuestion(host?.querySelector?.('[data-message-author-role="user"]'));
        if (q) return q;
      }
    } catch {}
    if (ans) {
      try {
        const ar = ans.getBoundingClientRect();
        const users = qq('[data-message-author-role="user"]');
        const near = users.find((u) => {
          const ur = u.getBoundingClientRect();
          return ur.top <= ar.top && (ar.top - ur.top) < 1400;
        }) || null;
        const q = normalizeQuestion(near);
        if (q) return q;
      } catch {}
    }
    return null;
  }

  function scrollPageToTarget(target, smooth = true, block = 'center') {
    if (!target || !target.isConnected) return false;
    const findScrollableAncestors = (el) => {
      const out = [];
      let cur = el?.parentElement || null;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        try {
          const cs = getComputedStyle(cur);
          const oy = String(cs?.overflowY || '');
          const canScroll = (oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight + 4;
          if (canScroll) out.push(cur);
        } catch {}
        cur = cur.parentElement;
      }
      return out;
    };
    const ancestors = findScrollableAncestors(target).filter((el) => !el.closest?.('[data-cgxui-owner="mnmp"]'));
    const byScrollRoot = ancestors.find((el) => el.hasAttribute?.('data-scroll-root')) || null;
    const byTall = ancestors.filter((el) => (el.clientHeight || 0) >= Math.max(240, Math.floor(window.innerHeight * 0.45)));
    const host = byScrollRoot || byTall[byTall.length - 1] || ancestors[ancestors.length - 1] || null;
    try {
      if (host && host !== target) {
        const before = host.scrollTop;
        const hr = host.getBoundingClientRect();
        const tr = target.getBoundingClientRect();
        const topInHost = (tr.top - hr.top) + host.scrollTop;
        const targetCenter = topInHost - ((host.clientHeight - tr.height) * (block === 'start' ? 0.08 : 0.5));
        const desiredTop = Math.max(0, Math.floor(targetCenter));
        host.scrollTo({ top: desiredTop, behavior: smooth ? 'smooth' : 'auto' });
        // Keep smooth behavior smooth; force set only for non-smooth paths.
        if (!smooth) {
          setTimeout(() => {
            try {
              if (Math.abs((host.scrollTop || 0) - desiredTop) > 2) host.scrollTop = desiredTop;
            } catch {}
          }, 0);
        }
        if (Math.abs(host.scrollTop - before) > 1) return true;
        if (!smooth) {
          try { host.scrollTop = desiredTop; } catch {}
          if (Math.abs(host.scrollTop - before) > 1) return true;
        }
        return true;
      }
    } catch {}
    try {
      target.scrollIntoView?.({ behavior: smooth ? 'smooth' : 'auto', block });
      return true;
    } catch {}
    try {
      const top = Math.max(0, (target.getBoundingClientRect().top + (window.scrollY || 0)) - 120);
      window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
      return true;
    } catch {
      return false;
    }
  }

  function observeVisibleAnswers(answers) {
    try { S.io?.disconnect?.(); } catch {}
    S.visibleSet.clear();
    if (typeof IntersectionObserver !== 'function') {
      S.io = null;
      return;
    }
    S.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) S.visibleSet.add(e.target);
        else S.visibleSet.delete(e.target);
      }
    }, { root: null, rootMargin: '-120px 0px -40px 0px', threshold: 0 });
    for (const el of answers) {
      try { S.io.observe(el); } catch {}
    }
  }

  function behaviorApi() {
    try { return MM_behavior() || null; } catch { return null; }
  }

  function behaviorMap() {
    const api = behaviorApi();
    try { return api?.get?.() || api?.defaults?.() || null; } catch { return null; }
  }

  function behaviorBinding(surface, gesture, ev) {
    const api = behaviorApi();
    const map = behaviorMap();
    try { return api?.getBinding?.(surface, gesture, ev, map) || { kind: 'none' }; } catch { return { kind: 'none' }; }
  }

  function ensureDelegatedHandlers() {
    if (S.offBtnClick) return;

    const MM = (window.MM = window.MM || {});
    const supportsAuxClick = ('onauxclick' in document);
    let lastMidTime = 0;
    let lastMidId = '';
    let midTimer = null;
    let lastTapTs = 0;
    let lastTapId = '';
    let suppressClickUntil = 0;

    const callWashPalette = (ev, primaryAId, anchorBtnEl = null) => {
      try {
        const SH = TOPW.H2O_MM_SHARED?.get?.();
        if (SH?.util?.mmOpenWashPalette) return !!SH.util.mmOpenWashPalette(ev, primaryAId, anchorBtnEl);
      } catch {}
      try {
        const api = W?.H2O?.MM?.wash;
        if (api && typeof api.openPalette === 'function') {
          api.openPalette(ev, primaryAId, anchorBtnEl);
          return true;
        }
      } catch {}
      return false;
    };

    const openExportMenu = () => {
      const exportBtn =
        document.getElementById('cgxui-xpch-export-btn') ||
        document.querySelector('[data-cgxui="xpch-dl-toggle"][data-cgxui-owner="xpch"]');
      if (exportBtn && typeof exportBtn.click === 'function') {
        try { exportBtn.click(); return true; } catch {}
      }
      return false;
    };

    const getTurn = (turnId) => {
      try { return getCoreSurface()?.getTurnById?.(turnId) || null; } catch { return null; }
    };

    const isOwnedMiniMapBtn = (btn) => {
      if (!btn) return false;
      try {
        const owner = String(btn.getAttribute?.('data-cgxui-owner') || '').trim();
        if (owner === 'mnmp') return true;
      } catch {}
      try {
        if (btn.classList?.contains?.('cgxui-mm-btn')) return true;
      } catch {}
      return false;
    };

    const turnCtx = (btn, gesture, ev) => {
      const turnId = String(btn?.dataset?.id || btn?.dataset?.turnId || '').trim();
      const answerId = String(btn?.dataset?.primaryAId || '').trim();
      const id = turnId || answerId;
      const turn = turnId ? getTurn(turnId) : null;
      return {
        surface: 'turn',
        gesture,
        turnId,
        answerId,
        id,
        btnEl: btn || null,
        ev,
        turn,
        sh: TOPW.H2O_MM_SHARED?.get?.() || null,
        core: MM_core(),
        rt: MM_rt(),
        uiRefs: MM_uiRefs(),
      };
    };

    const turnActions = {
      answer: (ctx) => {
        if (!ctx?.id) return false;
        MM.program = true;
        try {
          const target = resolveAnswerTarget(ctx.id, ctx.answerId, Number(ctx.btnEl?.dataset?.turnIdx || 0));
          scrollPageToTarget(target, true, 'center');
          setActiveTurnId(ctx.id, `turn:${ctx.gesture}:answer`);
        } finally {
          setTimeout(() => { MM.program = false; }, 140);
        }
        return true;
      },
      question: (ctx) => {
        if (!ctx?.id) return false;
        MM.program = true;
        try {
          const target = resolveQuestionTarget(ctx.id, ctx.answerId) ||
            resolveAnswerTarget(ctx.id, ctx.answerId, Number(ctx.btnEl?.dataset?.turnIdx || 0));
          scrollPageToTarget(target, true, 'center');
          try { W.applyTempFlash?.(target); } catch {}
          setActiveTurnId(ctx.id, `turn:${ctx.gesture}:question`);
        } finally {
          setTimeout(() => { MM.program = false; }, 160);
        }
        return true;
      },
      palette: (ctx) => {
        if (!ctx?.answerId && !ctx?.id) return false;
        const rect = ctx.btnEl?.getBoundingClientRect?.();
        const event = ctx.ev || {
          clientX: Math.round((rect?.left || 0) + ((rect?.width || 0) / 2)),
          clientY: Math.round((rect?.top || 0) + ((rect?.height || 0) / 2)),
          preventDefault() {},
          stopPropagation() {},
        };
        return !!callWashPalette(event, ctx.answerId || ctx.id, ctx.btnEl || null);
      },
      titles: (ctx) => {
        try { W.toggleStickyTitlePanel?.(ctx.btnEl || null, ctx.answerId || ctx.id); } catch {}
        return true;
      },
      quick: () => {
        const toggle = MM_uiRefs()?.toggle || q('[data-cgxui="mnmp-toggle"][data-cgxui-owner="mnmp"]');
        if (!toggle) return false;
        try {
          const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1, buttons: 4 });
          try { Object.defineProperty(ev, '__h2oBehaviorSyntheticQuick', { value: true }); } catch {}
          toggle.dispatchEvent(ev);
          return true;
        } catch {
          return false;
        }
      },
      export: () => openExportMenu(),
      auto: () => false,
    };
    const turnActionsCustom = {
      'export.menu.open': () => openExportMenu(),
      'quick.open': (ctx) => turnActions.quick(ctx),
    };

    const resolveTurnBinding = (binding, ctx) => {
      const map = behaviorMap() || {};
      const kind = String(binding?.kind || '').trim();
      if (!kind) return { binding: { kind: 'none' }, fn: null };
      if (kind === 'auto') {
        const defs = behaviorApi()?.defaults?.() || null;
        const next = defs?.turn?.[ctx.gesture] || null;
        const nk = String(next?.kind || '').trim();
        if (!nk || nk === 'auto') return { binding: { kind: 'none' }, fn: null };
        return { binding: next, fn: (nk === 'custom') ? null : (turnActions[nk] || null) };
      }
      if (kind === 'custom') {
        const id = String(binding?.id || '').trim();
        if (!id || typeof turnActionsCustom[id] !== 'function') {
          behaviorApi()?.warnOnce?.(`turn-custom:${ctx.gesture}:${id || 'missing'}`, 'Unknown custom action id; fallback applied.', { gesture: ctx.gesture, id });
          const fbKind = String(map?.customFallback?.kind || 'none').trim();
          const fb = (fbKind === 'none') ? { kind: 'none' } : { kind: fbKind };
          if (fb.kind === 'none') return { binding: fb, fn: null };
          return { binding: fb, fn: turnActions[fb.kind] || null };
        }
        return { binding, fn: turnActionsCustom[id] };
      }
      return { binding, fn: turnActions[kind] || null };
    };

    const runTurnGesture = (btn, gesture, event) => {
      if (!btn || !isOwnedMiniMapBtn(btn)) return false;
      const ctx = turnCtx(btn, gesture, event);
      if (!ctx.id) return false;
      const binding = behaviorBinding('turn', gesture, event);
      const kind = String(binding?.kind || '').trim();
      if (kind === 'none') return false;
      if (kind === 'blocked') {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      const resolved = resolveTurnBinding(binding, ctx);
      if (!resolved.fn) {
        behaviorApi()?.warnOnce?.(`turn-action:${gesture}:${kind}`, 'Turn action unavailable; safe no-op.', { gesture, kind });
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      event?.preventDefault?.();
      event?.stopPropagation?.();
      try {
        return !!resolved.fn(ctx, binding?.payload || {});
      } catch (e) {
        behaviorApi()?.warnOnce?.(`turn-action-err:${gesture}:${kind}`, 'Turn action failed; safe no-op.', { err: String(e?.message || e) });
        return false;
      }
    };

    const pointerHandler = (e) => {
      if (e.button != null && e.button !== 0) return;
      const btn = e.target?.closest?.(mmBtnSelector());
      if (!btn || !isOwnedMiniMapBtn(btn)) return;

      const id = String(btn.dataset?.id || btn.dataset?.turnId || btn.dataset?.primaryAId || '').trim();
      const now = performance.now();
      const isDouble = !!id && id === lastTapId && (now - lastTapTs) < 360;
      lastTapId = id;
      lastTapTs = now;

      if (isDouble) {
        suppressClickUntil = now + 420;
        runTurnGesture(btn, 'dblclick', e);
        return;
      }
      runTurnGesture(btn, 'click', e);
    };

    const handler = (e) => {
      if (performance.now() < suppressClickUntil) return;
      const btn = e.target?.closest?.(mmBtnSelector());
      if (!btn || !isOwnedMiniMapBtn(btn)) return;
      runTurnGesture(btn, 'click', e);
    };

    const handleMiddleEvent = (event) => {
      const btn = event?.target?.closest?.(mmBtnSelector());
      if (!btn || event.button !== 1) return;
      if (!btn.closest?.('[data-cgxui$="minimap"]')) return;

      const turnId = String(btn.dataset?.id || btn.dataset?.turnId || '').trim();
      if (!turnId) return;

      const midBinding = behaviorBinding('turn', 'mid', event);
      const dmidBinding = behaviorBinding('turn', 'dmid', event);
      const hasMid = String(midBinding?.kind || 'none') !== 'none';
      const hasDmid = String(dmidBinding?.kind || 'none') !== 'none';
      if (!hasMid && !hasDmid) return;

      // Consume auxclick immediately so other middle-click listeners can't fire a single action
      // before we decide whether this gesture is single-middle or double-middle.
      event.preventDefault();
      event.stopPropagation();

      const now = performance.now();
      const delta = now - lastMidTime;
      const isSame = (turnId === lastMidId);
      lastMidTime = now;
      lastMidId = turnId;

      if (isSame && delta < 280 && hasDmid) {
        if (midTimer) { clearTimeout(midTimer); midTimer = null; }
        runTurnGesture(btn, 'dmid', event);
      } else {
        if (midTimer) { clearTimeout(midTimer); midTimer = null; }
        if (!hasMid) return;
        const rect = btn.getBoundingClientRect?.();
        const clientX = Number.isFinite(event?.clientX) ? event.clientX : Math.round((rect?.left || 0) + ((rect?.width || 0) / 2));
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : Math.round((rect?.top || 0) + ((rect?.height || 0) / 2));
        midTimer = setTimeout(() => {
          midTimer = null;
          const fakeEvt = {
            clientX,
            clientY,
            button: 1,
            shiftKey: !!event?.shiftKey,
            altKey: !!event?.altKey,
            metaKey: !!event?.metaKey,
            preventDefault() {},
            stopPropagation() {},
          };
          runTurnGesture(btn, 'mid', fakeEvt);
        }, 260);
      }
    };

    const suppressMiddleDown = (event) => {
      const btn = event?.target?.closest?.(mmBtnSelector());
      if (!btn || event.button !== 1) return;
      if (!btn.closest?.('[data-cgxui$="minimap"]')) return;
      const b = behaviorBinding('turn', 'mid', event);
      const db = behaviorBinding('turn', 'dmid', event);
      if (String(b?.kind || 'none') === 'none' && String(db?.kind || 'none') === 'none') return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointerdown', pointerHandler, true);
    window.addEventListener('click', handler, true);
    if (supportsAuxClick) {
      window.addEventListener('mousedown', suppressMiddleDown, true);
      window.addEventListener('auxclick', handleMiddleEvent, true);
    } else {
      window.addEventListener('mousedown', handleMiddleEvent, true);
    }
    S.offBtnClick = () => {
      try { window.removeEventListener('pointerdown', pointerHandler, true); } catch {}
      try { window.removeEventListener('click', handler, true); } catch {}
      try { window.removeEventListener('mousedown', suppressMiddleDown, true); } catch {}
      try { window.removeEventListener('auxclick', handleMiddleEvent, true); } catch {}
      try { window.removeEventListener('mousedown', handleMiddleEvent, true); } catch {}
      try { if (midTimer) clearTimeout(midTimer); } catch {}
      midTimer = null;
    };
  }

  function emitAnswersScan(reason = 'engine') {
    const { EV } = getRegs();
    const evtName = EV.ANSWERS_SCAN || EVT_ANSWERS_SCAN_FALLBACK;
    try { W.H2O?.bus?.emit?.('answers:scan', { reason }); } catch {}
    try { window.dispatchEvent(new CustomEvent(evtName, { detail: { reason } })); } catch {}
  }

  function findBtnById(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const btn = MM_core()?.getBtnById?.(key);
      if (btn) return btn;
    } catch {}
    try {
      const btns = qq(mmBtnSelector());
      for (const btn of btns) {
        const id1 = String(btn?.dataset?.id || '').trim();
        const id2 = String(btn?.dataset?.turnId || '').trim();
        if (id1 === key || id2 === key) return btn;
      }
      return null;
    } catch {
      return null;
    }
  }

  function getActiveTurnId() {
    try {
      const b = q(activeBtnSelector());
      const id = String(b?.dataset?.id || b?.dataset?.turnId || '').trim();
      if (id) return id;
    } catch {}
    return String(S.lastActiveTurnId || '');
  }

  function getTurnIndex(anyId) {
    const core = MM_core();
    const key = String(anyId || getActiveTurnId() || '').trim();
    if (!key || !core) return 0;
    try { return Number(core.getTurnIndex?.(key) || 0); } catch { return 0; }
  }

  function notifyTurnChange(source = 'engine') {
    const id = getActiveTurnId();
    if (!id || id === S.lastActiveTurnId) return;

    S.lastActiveTurnId = id;
    const detail = { activeTurnId: id, source };

    for (const cb of Array.from(S.turnListeners)) {
      try { cb(detail); } catch {}
    }
  }

  function setActiveTurnId(id, source = 'api') {
    const key = String(id || '').trim();
    if (!key) return false;

    const core = getCoreSurface();
    if (!core) {
      disableScrollSync('set-active:no-core');
      return false;
    }
    S.mmProgram = true;
    const isQuestionJumpSource = String(source || '').includes('dbl');
    if (!isQuestionJumpSource) {
      const target = resolveAnswerTarget(key);
      try { scrollPageToTarget(target, true, 'center'); } catch (e) { derr('setActive:target.scroll', e); }
    }
    try { core.setActive?.(key, source); } catch (e) { derr('setActive:core.setActive', e); }
    try { core.centerOn?.(key, { force: true, smooth: true }); } catch (e) { derr('setActive:core.centerOn', e); }
    try { core.updateCounter?.(key); } catch (e) { derr('setActive:core.updateCounter', e); }
    try { core.updateToggleColor?.(key); } catch (e) { derr('setActive:core.updateToggleColor', e); }
    clearTimeout(S.mmUserTimer);
    S.mmUserTimer = setTimeout(() => { S.mmProgram = false; }, 240);

    S.lastActiveTurnId = key;
    notifyTurnChange(source);
    return true;
  }

  function syncActive(reason = 'scroll') {
    if (!S.running) return;
    if (S.scrollSyncDisabled) return;
    if (S.mmUser || S.mmProgram) return;

    try { if (S.syncRAF) cancelAnimationFrame(S.syncRAF); } catch {}
    S.syncRAF = requestAnimationFrame(() => {
      S.syncRAF = 0;
      const core = getCoreSurface();
      if (!core) {
        disableScrollSync('sync:no-core');
        return;
      }
      let id = '';
      if (typeof core.computeActiveFromViewport !== 'function' || typeof core.setActive !== 'function') {
        disableScrollSync('sync:core-surface-missing');
        return;
      }
      const active = core.computeActiveFromViewport({
        visibleSet: S.visibleSet,
        anchorY: 120,
        turnAnchorY: Math.max(0, Math.floor(window.innerHeight * 0.22)),
      });
      id = String(active?.activeTurnId || active?.activeAnswerId || active?.syncedId || '');
      if (id) {
        try { core.setActive(id, 'scroll-sync'); } catch (e) { derr('sync:setActive', e); }
        try { core.centerOn?.(id, { force: false, smooth: true }); } catch (e) { derr('sync:centerOn', e); }
        S.lastActiveTurnId = id;
      }
      notifyTurnChange(reason);
    });
  }

  function clearMiniMapGuardBindings() {
    try { S.offMmWheel?.(); } catch {}
    try { S.offMmTouchStart?.(); } catch {}
    try { S.offMmMouseDown?.(); } catch {}
    S.offMmWheel = null;
    S.offMmTouchStart = null;
    S.offMmMouseDown = null;
    S.mmScroller = null;
    S.mmUser = false;
    S.mmProgram = false;
    clearTimeout(S.mmUserTimer);
    S.mmUserTimer = null;
  }

  function miniMapScroller() {
    const panel = minimapPanel();
    if (!panel) return null;
    if (S.mmScroller && S.mmScroller.isConnected) return S.mmScroller;
    const { SEL } = getRegs();
    const pick = (sel) => {
      const s = String(sel || '').trim();
      if (!s) return null;
      try { return panel.querySelector(s); } catch { return null; }
    };
    const candidates = [
      pick(SEL.MM_COL),
      pick(SEL.MM_SCROLL),
      pick(SEL.MM_COL_LEGACY),
      pick(SEL.COL_PLAIN),
      panel,
    ].filter(Boolean);
    const found = candidates.find((el) => {
      try {
        return el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible';
      } catch {
        return false;
      }
    }) || panel;
    return found;
  }

  function bindMiniMapScrollGuards() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const on = SH?.util?.on || ((t, ev, fn, opts) => {
      t?.addEventListener?.(ev, fn, opts);
      return () => { try { t?.removeEventListener?.(ev, fn, opts); } catch {} };
    });
    const scroller = miniMapScroller();
    if (!scroller) return;
    if (scroller === S.mmScroller && S.offMmWheel) return;
    clearMiniMapGuardBindings();
    S.mmScroller = scroller;
    const markUser = (ms) => {
      S.mmUser = true;
      clearTimeout(S.mmUserTimer);
      S.mmUserTimer = setTimeout(() => { S.mmUser = false; }, ms);
    };
    S.offMmWheel = on(scroller, 'wheel', () => markUser(450), { passive: false });
    S.offMmTouchStart = on(scroller, 'touchstart', () => markUser(650), { passive: false });
    S.offMmMouseDown = on(scroller, 'mousedown', (e) => {
      if (e?.target?.closest?.(mmBtnSelector())) return;
      markUser(450);
    }, { passive: false });
  }

  function rebuildNow(reason = 'engine:rebuildNow') {
    S.rebuildReason = String(reason || 'engine:rebuildNow');

    const core = MM_core();
    if (!core) return false;

    let ok = false;
    try {
      const res = core.rebuildNow?.(S.rebuildReason);
      ok = (res && typeof res === 'object') ? !!res.ok : !!res;
    } catch (e) {
      derr('rebuildNow:core', e);
    }

    if (ok) {
      try { observeVisibleAnswers(core.getAnswerList?.() || []); } catch {}
      try { bindMiniMapScrollGuards(); } catch {}
      syncActive('rebuild');
    }

    return ok;
  }

  function scheduleRebuild(reason = 'engine:rebuild') {
    S.rebuildReason = String(reason || 'engine:rebuild');
    const core = MM_core();
    if (!core) return false;
    try { return !!core.scheduleRebuild?.(S.rebuildReason); } catch { return false; }
  }

  function onTurnChange(cb) {
    if (typeof cb !== 'function') return () => {};
    S.turnListeners.add(cb);
    return () => { try { S.turnListeners.delete(cb); } catch {} };
  }

  function clearTimer(name, type = 'timeout') {
    const id = S[name];
    if (!id) return;
    try {
      if (type === 'interval') clearInterval(id);
      else clearTimeout(id);
    } catch {}
    S[name] = null;
  }

  function stop(reason = 'engine:stop') {
    clearTimer('rebuildTimer');
    clearTimer('answerPollTimer', 'interval');
    clearTimer('turnPollTimer', 'interval');
    clearTimer('failsafeTimer');

    try { if (S.syncRAF) cancelAnimationFrame(S.syncRAF); } catch {}
    S.syncRAF = 0;

    try { S.domMO?.disconnect?.(); } catch {}
    try { S.panelMO?.disconnect?.(); } catch {}
    try { S.formRO?.disconnect?.(); } catch {}
    try { S.io?.disconnect?.(); } catch {}
    S.domMO = null;
    S.panelMO = null;
    S.formRO = null;
    S.io = null;
    S.visibleSet.clear();
    clearMiniMapGuardBindings();

    try { S.offScroll?.(); } catch {}
    try { S.offResize?.(); } catch {}
    try { S.offShellReady?.(); } catch {}
    try { S.offBehaviorChanged?.(); } catch {}
    try { S.offBtnClick?.(); } catch {}
    S.offScroll = null;
    S.offResize = null;
    S.offShellReady = null;
    S.offBehaviorChanged = null;
    S.offBtnClick = null;

    S.running = false;
    S.scrollSyncDisabled = false;
    markReady(false);
    dlog('engine:stop', { reason });
    return true;
  }

  function relevantMutation(muts) {
    const answerSel = answersSelector();
    const btnSel = mmBtnSelector();

    for (const m of muts || []) {
      const nodes = [...(m.addedNodes || []), ...(m.removedNodes || [])];
      for (const n of nodes) {
        if (!n || n.nodeType !== 1) continue;
        const el = n;

        if (el.matches?.(answerSel) || el.querySelector?.(answerSel)) return true;
        if (el.matches?.(btnSel) || el.querySelector?.(btnSel)) return true;
      }
    }

    return false;
  }

  function bindObservers() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const on = SH?.util?.on || ((t, ev, fn, opts) => {
      t?.addEventListener?.(ev, fn, opts);
      return () => { try { t?.removeEventListener?.(ev, fn, opts); } catch {} };
    });

    const root = convContainer();
    if (root) {
      S.domMO = new MutationObserver((muts) => {
        if (!S.running) return;
        if (!relevantMutation(muts)) return;
        scheduleRebuild('mo:answers');
      });
      S.domMO.observe(root, { childList: true, subtree: true });
    }

    S.offScroll = on(window, 'scroll', () => syncActive('scroll'), { passive: true });
    S.offResize = on(window, 'resize', () => {
      try { W.positionCounterBox?.(); } catch {}
      syncActive('resize');
      scheduleRebuild('resize');
    }, { passive: true });

    const form = formEl();
    if (form && typeof ResizeObserver === 'function') {
      S.formRO = new ResizeObserver(() => {
        try { W.positionCounterBox?.(); } catch {}
      });
      S.formRO.observe(form);
    }

    S.panelMO = new MutationObserver((muts) => {
      if (!S.running) return;
      const hit = muts.some((m) => Array.from(m.removedNodes || []).some((n) => {
        if (!n || n.nodeType !== 1) return false;
        const el = n;
        return !!(el.matches?.('[data-cgxui="mm-panel"], [data-cgxui="mm-toggle"]') ||
          el.querySelector?.('[data-cgxui="mm-panel"], [data-cgxui="mm-toggle"]'));
      }));
      if (hit) scheduleRebuild('panel:removed');
    });
    S.panelMO.observe(document.body, { childList: true, subtree: true });
    bindMiniMapScrollGuards();
  }

  function seedRuntimeTimers() {
    let answerTries = 0;
    S.answerPollTimer = setInterval(() => {
      if (!S.running) return;
      answerTries++;

      const answers = qq(answersSelector());
      const hasBtn = qq(mmBtnSelector()).length > 0;
      if (hasBtn || answerTries > 20) {
        clearTimer('answerPollTimer', 'interval');
        return;
      }
      if (answers.length) scheduleRebuild('boot:init-ready');
    }, 250);

    let turnTries = 0;
    S.turnPollTimer = setInterval(() => {
      if (!S.running) return;
      turnTries++;

      const hasTurn = !!W.H2O_MM_hasTurnAPI?.();
      if (!hasTurn) {
        if (turnTries > 24) clearTimer('turnPollTimer', 'interval');
        return;
      }

      const hasBtn = qq(mmBtnSelector()).length > 0;
      if (hasBtn || turnTries > 24) {
        clearTimer('turnPollTimer', 'interval');
        return;
      }

      scheduleRebuild('boot:init-ready-turns');
    }, 250);

    S.failsafeTimer = setTimeout(() => {
      if (!S.running) return;
      const panel = minimapPanel();
      const hasBtn = qq(mmBtnSelector()).length > 0;
      if (panel && !hasBtn) scheduleRebuild('failsafe:panel-no-buttons');
    }, 1200);
  }

  function start(reason = 'engine:start') {
    if (S.running) return true;
    const core = MM_core();
    if (!core || TOPW.H2O_MM_CORE_READY !== true) {
      warn('Core not ready; runtime idle.', { reason });
      return false;
    }

    S.running = true;

    // Ensure UI shell/root exists before first rebuild scheduling.
    try { MM_ui()?.ensureUI?.(`engine:${reason}`); } catch (e) { derr('start:ensureUI', e); }
    try { core.initCore?.(); } catch (e) { derr('start:initCore', e); }

    try { ensureDelegatedHandlers(); } catch (e) { derr('start:bindDelegatedHandlers', e); }
    try { W.H2O?.MM?.dots?.attachInlineMutationObserver?.(); } catch (e) { derr('start:attachInlineMutationObserver', e); }

    bindObservers();
    seedRuntimeTimers();

    scheduleRebuild(`boot:${reason}`);
    setTimeout(() => syncActive('boot:sync'), 80);

    dlog('engine:start', { reason });
    return true;
  }

  const RUNTIME_API = {
    ver: ENGINE_VER,
    owner: 'engine',
    start,
    stop,
    scheduleRebuild,
    rebuildNow,
    getActiveTurnId,
    getActiveId: getActiveTurnId,
    setActiveTurnId,
    getTurnIndex,
    onTurnChange,
  };

  function installRuntimeApi() {
    try {
      const SH = TOPW.H2O_MM_SHARED?.get?.();
      if (SH?.api) SH.api.rt = Object.assign({}, SH.api.rt || {}, RUNTIME_API);
      return true;
    } catch {
      return false;
    }
  }

  function depsReady() {
    const core = MM_core();
    const refs = MM_uiRefs();
    const hasUiRefs = !!(refs?.root && refs?.panel && refs?.toggle);
    return !!core && TOPW.H2O_MM_CORE_READY === true && hasUiRefs;
  }

  function clearBootTimer() {
    try { if (S.bootTimer) clearTimeout(S.bootTimer); } catch {}
    S.bootTimer = null;
  }

  function emitEngineReady() {
    try { window.dispatchEvent(new CustomEvent(EVT_ENGINE_READY, { detail: { ver: ENGINE_VER } })); } catch {}
  }

  function installDelegatedHandlersBridge() {
    try {
      if (typeof W.H2O_MM_bindDelegatedHandlersOnce !== 'function') {
        W.H2O_MM_bindDelegatedHandlersOnce = function H2O_MM_bindDelegatedHandlersOnce() {
          try { ensureDelegatedHandlers(); } catch {}
          return true;
        };
      }
    } catch {}
  }

  function bootAttempt(source = 'timer') {
    if (S.bootDone) return;
    diagAssertNoMainHelpers();

    S.bootTries++;
    if (!depsReady()) {
      if (S.bootTries >= BOOT_MAX_TRIES) {
        warn('Dependencies missing for runtime cutover; engine idle.', { source, tries: S.bootTries });
        clearBootTimer();
      }
      return;
    }

    if (!installRuntimeApi()) return;
    if (!start(`boot:${source}`)) return;

    S.bootDone = true;
    markReady(true);
    emitEngineReady();
    clearBootTimer();
  }

  function scheduleBootTick() {
    clearBootTimer();
    S.bootTimer = setTimeout(() => {
      bootAttempt('retry');
      if (!S.bootDone && S.bootTries < BOOT_MAX_TRIES) scheduleBootTick();
    }, BOOT_GAP_MS);
  }

  function bindRetryHooks() {
    const retry = () => {
      if (S.bootDone) return;
      bootAttempt('event');
      if (!S.bootDone && S.bootTries < BOOT_MAX_TRIES) scheduleBootTick();
    };

    try {
      window.addEventListener(EVT_SHELL_READY, retry);
      S.offShellReady = () => { try { window.removeEventListener(EVT_SHELL_READY, retry); } catch {} };
    } catch {}

    try {
      const onBehaviorChanged = () => {
        try { behaviorApi()?.get?.(true); } catch {}
      };
      window.addEventListener(EVT_BEHAVIOR_CHANGED, onBehaviorChanged, true);
      S.offBehaviorChanged = () => { try { window.removeEventListener(EVT_BEHAVIOR_CHANGED, onBehaviorChanged, true); } catch {} };
    } catch {}
  }

  markPlugin();
  markReady(false);
  installDelegatedHandlersBridge();
  installRuntimeApi();
  bindRetryHooks();
  bootAttempt('init');
  if (!S.bootDone) scheduleBootTick();
})();
