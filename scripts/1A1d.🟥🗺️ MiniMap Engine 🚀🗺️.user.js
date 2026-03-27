// ==UserScript==
// @h2o-id             1a1d.minimap.engine
// @name               1A1d.🟥🗺️ MiniMap Engine 🚀🗺️
// @namespace          H2O.Premium.CGX.minimap.engine
// @author             HumamDev
// @version            12.6.25
// @revision           002
// @build              260304-102754
// @description        MiniMap Engine: hard runtime authority (observers, rebuild scheduling, active sync)
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
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
  const MM_schedule = () => TOPW.H2O?.runtime?.schedule || W.H2O?.runtime?.schedule || null;

  const ENGINE_VER = '12.6.25';
  const EVT_ENGINE_READY = 'evt:h2o:minimap:engine-ready';
  const EVT_SHELL_READY = 'evt:h2o:minimap:shell-ready';
  const EVT_ROUTE_CHANGED = 'evt:h2o:route:changed';
  const EVT_ANSWERS_SCAN_FALLBACK = 'evt:h2o:answers:scan';
  const EVT_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';
  const EVT_MM_INDEX_APPENDED = 'evt:h2o:minimap:index:appended';
  const EVT_MM_INDEX_HYDRATED = 'evt:h2o:minimap:index:hydrated';
  const EVT_MM_VIEW_CHANGED = 'evt:h2o:minimap:view-changed';
  const EVT_PAGE_CHANGED = 'evt:h2o:pagination:pagechanged';
  const EVT_PAGE_CHANGED_ALIAS = 'h2o:pagination:pagechanged';
  const EVT_MSG_REMOUNTED = 'evt:h2o:message:remounted';
  const EVT_MSG_REMOUNTED_ALIAS = 'h2o:message:remounted';
  const EVT_MSG_MOUNT_REQUEST = 'h2o:message:mount:request';
  const EVT_ARCHIVE_SCROLL_TO_COLD = 'evt:h2o:archive:scroll-to-cold';

  const BOOT_MAX_TRIES = 80;
  const BOOT_GAP_MS = 120;
  const MO_REBUILD_COOLDOWN_MS = 320;
  const BOOT_MODE_CACHE_FIRST = 'cache_first';
  const BOOT_MODE_REBUILD_FIRST = 'rebuild_first';
  const PERF_ASSERT_ON = (() => {
    try { return String(localStorage.getItem('h2o:perf') || '') === '1'; } catch { return false; }
  })();
  const S = {
    running: false,
    bootDone: false,
    bootTries: 0,
    bootTimer: null,
    rebuildReason: '',
    syncRAF: 0,

    domMO: null,
    panelMO: null,
    panelRootMO: null,
    formRO: null,
    io: null,
    ioObserved: new Set(),

    firstPaintRaf: 0,
    firstPaintTimer: null,
    failsafeTimer: null,
    paginationCheckFastTimer: null,
    paginationCheckSlowTimer: null,

    offScroll: null,
    offResize: null,
    offShellReady: null,
    offBehaviorChanged: null,
    offRouteChanged: null,
    offBtnClick: null,
    offPaginationChanged: null,
    offPaginationChangedAlias: null,
    offIndexAppended: null,
    offIndexHydrated: null,
    offViewChanged: null,

    lastActiveTurnId: '',
    lastActiveBtnId: '',
    lastActiveBtnEl: null,
    perfFullScanTick: 0,
    moRebuildCooldownUntil: 0,
    visibleSet: new Set(),
    mapButtons: null,
    turnListeners: new Set(),
    scrollSyncDisabled: false,
    mmScroller: null,
    mmUser: false,
    mmProgram: false,
    mmUserTimer: null,
    pageJumpTimer: null,
    pageJumpToken: 0,
    pageJumpUntil: 0,
    lastActivePageNum: 0,
    offMmWheel: null,
    offMmTouchStart: null,
    offMmMouseDown: null,
    lastViewMode: '',
  };

  function getCoreSurface() {
    return MM_core();
  }

  function disableScrollSync(reason = 'core-missing') {
    if (S.scrollSyncDisabled) return;
    S.scrollSyncDisabled = true;
    warn('Scroll sync disabled.', { reason });
  }

  function hasPendingPageJump() {
    return Number(S.pageJumpUntil || 0) > Date.now();
  }

  function cancelPageJumpGuard(token = 0) {
    const activeToken = Number(S.pageJumpToken || 0);
    if (token && token !== activeToken) return false;
    clearTimer('pageJumpTimer');
    S.pageJumpUntil = 0;
    S.mmProgram = false;
    return true;
  }

  function armPageJumpGuard(ms = 1100, reason = 'page-divider') {
    const waitMs = Math.max(260, Number(ms || 0) || 0);
    const token = Number(S.pageJumpToken || 0) + 1;
    S.pageJumpToken = token;
    S.pageJumpUntil = Date.now() + waitMs;
    S.mmProgram = true;
    clearTimer('pageJumpTimer');
    S.pageJumpTimer = setTimeout(() => {
      if (token !== Number(S.pageJumpToken || 0)) return;
      S.pageJumpTimer = null;
      S.pageJumpUntil = 0;
      S.mmProgram = false;
      if (S.running) syncActive(`${String(reason || 'page-divider')}:settled`);
    }, waitMs);
    return token;
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

  function syncViewportPageDivider(core, pageNum, reason = 'scroll') {
    const num = Math.max(0, Number(pageNum || 0) || 0);
    if (!num || typeof core?.centerOnPageDivider !== 'function') {
      S.lastActivePageNum = 0;
      return false;
    }

    const why = String(reason || '').trim();
    const shouldSmooth = !why.startsWith('scroll');
    const shouldRecenter = (
      num !== Number(S.lastActivePageNum || 0)
      || why.includes('pagechanged')
      || why.includes('page-divider')
      || why.includes('settled')
      || why.includes('boot')
      || why.includes('rebuild')
      || why.includes('resize')
    );
    S.lastActivePageNum = num;
    if (!shouldRecenter) return false;

    try { return !!core.centerOnPageDivider(num, { smooth: shouldSmooth }); } catch (e) {
      derr('sync:centerOnPageDivider', e);
      return false;
    }
  }

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

  function markPerfFullScan() {
    S.perfFullScanTick = Number(S.perfFullScanTick || 0) + 1;
  }

  function answersSelector() {
    const { SEL } = getRegs();
    return SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]';
  }

  function resolveChatId() {
    const fromUtil = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromUtil) return fromUtil;
    const m = String(location.pathname || '').match(/\/(?:c|chat)\/([a-z0-9-]+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function normalizeBootMode(raw) {
    const mode = String(raw || '').trim().toLowerCase();
    if (mode === BOOT_MODE_CACHE_FIRST) return BOOT_MODE_CACHE_FIRST;
    if (mode === BOOT_MODE_REBUILD_FIRST) return BOOT_MODE_REBUILD_FIRST;
    return BOOT_MODE_REBUILD_FIRST;
  }

  function getBootMode() {
    try {
      const viaUi = MM_ui()?.getBootMode?.();
      if (viaUi != null) return normalizeBootMode(viaUi);
    } catch {}
    return BOOT_MODE_REBUILD_FIRST;
  }

  function currentViewMode() {
    try {
      const mode = TOPW.H2O_MM_SHARED?.get?.()?.api?.views?.getMode?.();
      return String(mode || '').trim();
    } catch {
      return '';
    }
  }

  function mmBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN
      || '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"], [data-cgxui="mnmp-qbtn"], [data-cgxui="mm-qbtn"]';
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

  function selectMiniBtnById(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const esc = (window.CSS?.escape) ? CSS.escape(key) : key.replace(/"/g, '\\"');
      return q(`[data-cgxui="mnmp-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-turn-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-primary-a-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-turn-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-primary-a-id="${esc}"]`)
        || null;
    } catch {
      return null;
    }
  }

  function internalSetActiveClass(btnId, opts = null) {
    const id = String(btnId || '').trim();
    if (!id) return false;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    // Invariant: regular runtime uses Core.setActive; local fallback is repair-only.
    const core = MM_core();
    if (core && typeof core.setActive === 'function') {
      try { core.setActive(id, 'engine'); } catch {}
      S.lastActiveTurnId = id;
      S.lastActiveBtnId = id;
      try { S.lastActiveBtnEl = core.getBtnById?.(id) || S.lastActiveBtnEl || null; } catch {}
      if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
      return true;
    }
    if (!opts?.repair) return false;
    const nextBtn = findBtnById(id, { repair: true });
    if (!nextBtn) return false;
    let prevBtn = findBtnById(S.lastActiveBtnId || S.lastActiveTurnId, { repair: true });
    if (!prevBtn || !prevBtn.isConnected) prevBtn = q(activeBtnSelector());
    if (prevBtn && prevBtn !== nextBtn) {
      prevBtn.classList.remove('active', 'inview');
      setStateToken(prevBtn, 'active', false);
      setStateToken(prevBtn, 'inview', false);
      prevBtn.removeAttribute('data-cgxui-inview');
    }
    nextBtn.classList.add('active', 'inview');
    setStateToken(nextBtn, 'active', true);
    setStateToken(nextBtn, 'inview', true);
    nextBtn.setAttribute('data-cgxui-inview', '1');
    S.lastActiveTurnId = id;
    S.lastActiveBtnId = id;
    S.lastActiveBtnEl = nextBtn;
    if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
    return true;
  }

  function normalizeNavId(raw) {
    return String(raw || '').replace(/^conversation-turn-/, '').trim();
  }

  function buildIdVariants(...inputs) {
    const out = new Set();
    const push = (raw) => {
      const id = normalizeNavId(raw);
      if (!id) return;

      out.add(id);

      if (id.startsWith('turn:a:')) {
        const bare = normalizeNavId(id.slice(7));
        if (bare) {
          out.add(bare);
          out.add(`turn:${bare}`);
        }
        return;
      }

      if (id.startsWith('turn:')) {
        const bare = normalizeNavId(id.slice(5));
        if (bare) out.add(bare);
        return;
      }

      out.add(`turn:${id}`);
    };

    for (const value of inputs.flat(Infinity)) push(value);
    return Array.from(out);
  }

  function normalizeAssistantEl(el) {
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
  }

  function normalizeQuestionEl(el) {
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
  }

  function getTurnHostEl(el) {
    if (!el) return null;
    try {
      return el.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn"]') || null;
    } catch {
      return null;
    }
  }

  function collectResolvedNodeIds(node) {
    const out = new Set();
    const push = (raw) => {
      for (const variant of buildIdVariants(raw)) out.add(variant);
    };
    if (!node) return out;

    const turnHost = getTurnHostEl(node);
    const assistantEl = normalizeAssistantEl(node);
    const questionEl = normalizeQuestionEl(node);
    const candidates = [node, turnHost, assistantEl, questionEl];

    for (const candidate of candidates) {
      if (!candidate) continue;
      push(candidate.getAttribute?.('data-turn-id'));
      push(candidate.getAttribute?.('data-message-id'));
      push(candidate.getAttribute?.('data-cgxui-id'));
      push(candidate.getAttribute?.('data-h2o-ans-id'));
      push(candidate.getAttribute?.('data-h2o-core-id'));
      push(candidate?.dataset?.turnId);
      push(candidate?.dataset?.messageId);
    }

    return out;
  }

  function isResolvedOnRequestedPage(node, ctx) {
    if (!node?.isConnected) return false;

    const expectedPageIndex = Number(ctx?.pageInfo?.pageIndex);
    if (!Number.isFinite(expectedPageIndex)) return true;

    const api = getPaginationApi();
    if (typeof api?.getPageInfo !== 'function') return true;
    try {
      return Number(api.getPageInfo()?.pageIndex ?? -1) === expectedPageIndex;
    } catch {
      return false;
    }
  }

  function MINI_isResolvedTargetElement(node, ctx, surface = 'answer') {
    const target = MINI_getCanonicalTargetCtx(ctx, surface);
    if (!node?.isConnected) return false;
    if (!isResolvedOnRequestedPage(node, target)) return false;

    const expectedTurnHost =
      (target?.pageInfo?.targetTurnHost?.isConnected ? target.pageInfo.targetTurnHost : null)
      || getTurnHostEl(target?.pageInfo?.targetHost || target?.pageInfo?.targetAnswerHost || null);
    const expectedAnswerHost = normalizeAssistantEl(
      target?.pageInfo?.targetAnswerHost || target?.pageInfo?.targetHost || target?.pageInfo?.targetTurnHost || null,
    );
    const expectedQuestionEl = normalizeQuestionEl(target?.pageInfo?.targetTurnHost || target?.pageInfo?.targetHost || null);
    const nodeTurnHost = getTurnHostEl(node);

    if (expectedTurnHost && nodeTurnHost && expectedTurnHost !== nodeTurnHost) return false;

    if (surface === 'answer' && expectedAnswerHost) {
      if (normalizeAssistantEl(node) !== expectedAnswerHost) return false;
    }

    if (surface === 'question' && expectedQuestionEl) {
      const qNode = normalizeQuestionEl(node);
      if (qNode) return qNode === expectedQuestionEl;

      const aNode = normalizeAssistantEl(node);
      if (!aNode || !expectedTurnHost || getTurnHostEl(aNode) !== expectedTurnHost) return false;
    }

    const wantedIds = new Set(buildIdVariants(
      target.turnId,
      target.answerId,
      target.questionId,
      target.canonicalId,
      target.id,
      target?.pageInfo?.turnId,
      target?.pageInfo?.answerId,
    ));

    if (!wantedIds.size) return true;

    for (const gotId of collectResolvedNodeIds(node)) {
      if (wantedIds.has(gotId)) return true;
    }

    return !!expectedTurnHost && nodeTurnHost === expectedTurnHost;
  }

  function getPaginationApi() {
    const api = W.H2O_Pagination;
    return api && typeof api === 'object' ? api : null;
  }

  function getUnmountApi() {
    return W?.H2O?.UM?.nmntmssgs?.api || null;
  }

  function isPaginationEnabled() {
    const api = getPaginationApi();
    if (!api || typeof api.getPageInfo !== 'function') return false;
    try { return api.getPageInfo()?.enabled !== false; } catch { return false; }
  }

  function isUnmountEnabled() {
    const api = getUnmountApi();
    if (!api || typeof api.getConfig !== 'function') return false;
    try { return api.getConfig()?.enabled !== false; } catch { return false; }
  }

  function isVirtualizedConversation() {
    return isPaginationEnabled() || isUnmountEnabled();
  }

  function resolveTurnRecord(anyId, primaryAId = '') {
    const key = normalizeNavId(anyId);
    const aId = normalizeNavId(primaryAId);
    if (!key && !aId) return null;

    const candidateSet = new Set(buildIdVariants(
      key,
      aId,
      aId ? `turn:a:${aId}` : '',
    ));
    const core = getCoreSurface();
    let turn = null;

    for (const candidate of candidateSet) {
      if (!candidate || turn) continue;
      try { turn = core?.getTurnById?.(candidate) || null; } catch {}
    }

    if (!turn && core && typeof core.getTurnList === 'function') {
      try {
        const list = core.getTurnList() || [];
        turn = list.find((row) => {
          const rowIds = buildIdVariants(
            row?.turnId,
            row?.answerId,
            row?.primaryAId,
            row?.qId,
            row?.turnUid,
            row?.primaryAId ? `turn:a:${row.primaryAId}` : '',
          );
          return rowIds.some((rowId) => candidateSet.has(rowId));
        }) || null;
      } catch {}
    }

    return turn;
  }

  function findTurnHostById(anyId) {
    const variants = buildIdVariants(anyId);
    for (const variant of variants) {
      if (!variant) continue;
      try {
        const esc = (window.CSS?.escape) ? CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = q(`[data-turn-id="${esc}"]`);
        if (!el) continue;
        return el.closest?.('[data-testid="conversation-turn"], [data-testid^="conversation-turn"]') || el;
      } catch {}
    }
    return null;
  }

  function findAnswerById(answerId) {
    const id = normalizeNavId(answerId);
    if (!id) return null;
    const variants = buildIdVariants(id, `turn:a:${id}`);
    try {
      for (const variant of variants) {
        if (!variant) continue;
        const esc = (window.CSS?.escape) ? CSS.escape(variant) : variant.replace(/"/g, '\\"');
        const el = q(`[data-message-id="${esc}"]`) ||
          q(`[data-cgxui-id="${esc}"]`) ||
          q(`[data-h2o-ans-id="${esc}"]`) ||
          q(`[data-h2o-core-id="${esc}"]`) ||
          q(`[data-turn-id="${esc}"]`);
        if (el) return normalizeAssistantEl(el);
      }
      return null;
    } catch {
      return null;
    }
  }

  function resolveAnswerTarget(anyId, primaryAId = '', turnIdxHint = 0) {
    const key = normalizeNavId(anyId);
    const aId = normalizeNavId(primaryAId);
    const t = resolveTurnRecord(key, aId);
    const answerId = normalizeNavId(t?.answerId || t?.primaryAId || aId || '');
    const turnId = normalizeNavId(t?.turnId || key || '');
    const direct = (
      normalizeAssistantEl(t?.primaryAEl) ||
      findAnswerById(answerId || turnId || key) ||
      normalizeAssistantEl(findTurnHostById(turnId || key)) ||
      normalizeAssistantEl(t?.el) ||
      normalizeAssistantEl(t?.qEl)
    );
    if (direct) return direct;

    if (isVirtualizedConversation()) return null;

    // Fallback: resolve by turn index to the Nth assistant answer in DOM order.
    let idx = Number(t?.index || t?.idx || turnIdxHint || 0);
    const core = getCoreSurface();
    if (!idx && core && typeof core.getTurnIndex === 'function') {
      try { idx = Number(core.getTurnIndex(key) || 0); } catch {}
    }
    if (idx > 0) {
      markPerfFullScan();
      const answers = qq(answersSelector());
      const el = answers[idx - 1] || null;
      if (el) return el;
    }
    return null;
  }

  function resolveQuestionTarget(anyId, primaryAId = '') {
    const key = normalizeNavId(anyId);
    const aId = normalizeNavId(primaryAId);
    const t = resolveTurnRecord(key, aId);
    const turnId = normalizeNavId(t?.turnId || key || '');

    const qDirect =
      normalizeQuestionEl(t?.qEl) ||
      normalizeQuestionEl(findTurnHostById(turnId || key));
    if (qDirect) return qDirect;

    // Fallback: from the answer, pick the closest previous user message.
    const ans = resolveAnswerTarget(key, aId, Number(t?.idx || t?.index || 0));
    if (ans) {
      try {
        const turnHost = ans.closest?.('[data-testid="conversation-turn"]');
        const qInTurn = normalizeQuestionEl(turnHost?.querySelector?.('[data-message-author-role="user"]'));
        if (qInTurn) return qInTurn;
      } catch {}
      try {
        let cur = ans.previousElementSibling;
        while (cur) {
          const q = normalizeQuestionEl(cur);
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
        const q = normalizeQuestionEl(best);
        if (q) return q;
      } catch {}
    }

    if (isVirtualizedConversation()) return null;

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
        const q = normalizeQuestionEl(host?.querySelector?.('[data-message-author-role="user"]'));
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
        const q = normalizeQuestionEl(near);
        if (q) return q;
      } catch {}
    }
    return null;
  }

  function dispatchMountRequest(msgId, source = 'mnmp-engine') {
    const id = normalizeNavId(msgId);
    if (!id) return false;
    try {
      const api = getUnmountApi();
      if (typeof api?.requestMountByUid === 'function') {
        return api.requestMountByUid(id, String(source || 'mnmp-engine')) !== false;
      }
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(EVT_MSG_MOUNT_REQUEST, {
        detail: { msgId: id, id, source: String(source || 'mnmp-engine') },
      }));
      return true;
    } catch {
      return false;
    }
  }

  function waitForRemountByMsgId(msgId, timeoutMs = 1200) {
    const id = String(msgId || '').trim();
    if (!id) return Promise.resolve(false);
    const maxWaitMs = Math.max(120, Number(timeoutMs || 1200) || 1200);
    return new Promise((resolve) => {
      let done = false;
      let rafId = 0;
      let timerId = 0;
      const start = performance.now();

      const finish = (ok) => {
        if (done) return;
        done = true;
        try { if (rafId) cancelAnimationFrame(rafId); } catch {}
        try { if (timerId) clearTimeout(timerId); } catch {}
        try { window.removeEventListener(EVT_MSG_REMOUNTED, onRemounted, true); } catch {}
        try { window.removeEventListener(EVT_MSG_REMOUNTED_ALIAS, onRemounted, true); } catch {}
        resolve(!!ok);
      };

      const matchesMsg = (detail) => {
        const got = String(detail?.msgId || detail?.id || detail?.answerId || '').trim();
        if (!got) return false;
        return got === id || got === `turn:${id}` || `turn:${got}` === id;
      };

      const onRemounted = (e) => {
        if (!matchesMsg(e?.detail)) return;
        finish(true);
      };

      const poll = () => {
        if (findAnswerById(id)) {
          finish(true);
          return;
        }
        if ((performance.now() - start) >= maxWaitMs) {
          finish(false);
          return;
        }
        rafId = requestAnimationFrame(poll);
      };

      try { window.addEventListener(EVT_MSG_REMOUNTED, onRemounted, true); } catch {}
      try { window.addEventListener(EVT_MSG_REMOUNTED_ALIAS, onRemounted, true); } catch {}
      timerId = setTimeout(() => finish(!!findAnswerById(id)), maxWaitMs + 20);
      rafId = requestAnimationFrame(poll);
    });
  }

  function MINI_getCanonicalTargetCtx(ctx, surface = 'answer') {
    const turn = ctx?.turn || resolveTurnRecord(ctx?.turnId || ctx?.id || '', ctx?.answerId || '');
    const turnId = normalizeNavId(turn?.turnId || ctx?.turnId || ctx?.id || '');
    const answerId = normalizeNavId(turn?.answerId || turn?.primaryAId || ctx?.answerId || '');
    const questionId = normalizeNavId(turn?.qId || turn?.questionId || '');
    const canonicalId = normalizeNavId(
      surface === 'question'
        ? (questionId || turnId || answerId || ctx?.id || '')
        : (answerId || turnId || ctx?.id || ''),
    );

    return {
      ...(ctx || {}),
      turn,
      turnId,
      answerId,
      questionId,
      canonicalId,
      surface,
    };
  }

  async function MINI_materializeTarget(ctx, surface = 'answer') {
    const next = MINI_getCanonicalTargetCtx(ctx, surface);
    const requestId = normalizeNavId(next.canonicalId || next.answerId || next.turnId || next.id || '');

    if (isPaginationEnabled()) {
      const api = getPaginationApi();
      if (typeof api?.ensureVisibleById === 'function' && requestId) {
        try {
          const pageInfo = await api.ensureVisibleById(requestId, {
            reason: `minimap:${surface}:${String(next?.gesture || 'click')}`,
            restoreAnchor: false,
            timeoutMs: 1400,
          });
          next.pageInfo = pageInfo || null;
          if (pageInfo?.turn) next.turn = pageInfo.turn;
          if (pageInfo?.turnId) next.turnId = normalizeNavId(pageInfo.turnId);
          if (pageInfo?.answerId) next.answerId = normalizeNavId(pageInfo.answerId);
          if (pageInfo?.turn?.qId && !next.questionId) next.questionId = normalizeNavId(pageInfo.turn.qId);
        } catch (e) {
          derr('turn:materialize:pagination', e);
        }
      }
    }

    const mountId = normalizeNavId(next.answerId || next.canonicalId || next.turnId || requestId);
    if (isUnmountEnabled() && mountId) {
      try {
        const api = getUnmountApi();
        if (typeof api?.requestMountByUid === 'function') api.requestMountByUid(mountId, `mnmp-engine:${surface}`);
        else dispatchMountRequest(mountId, `mnmp-engine:${surface}`);
      } catch (e) {
        derr('turn:materialize:unmount', e);
        dispatchMountRequest(mountId, `mnmp-engine:${surface}`);
      }
    }

    return next;
  }

  function MINI_resolveTargetElement(ctx, surface = 'answer') {
    const target = MINI_getCanonicalTargetCtx(ctx, surface);
    const fromPageInfo = surface === 'question'
      ? (
        normalizeQuestionEl(target?.pageInfo?.targetTurnHost || target?.pageInfo?.targetHost || null)
        || normalizeAssistantEl(target?.pageInfo?.targetAnswerHost || target?.pageInfo?.targetHost || target?.pageInfo?.targetTurnHost || null)
      )
      : normalizeAssistantEl(target?.pageInfo?.targetAnswerHost || target?.pageInfo?.targetHost || target?.pageInfo?.targetTurnHost || null);
    if (MINI_isResolvedTargetElement(fromPageInfo, target, surface)) return fromPageInfo;

    if (surface === 'question') {
      const resolved =
        resolveQuestionTarget(target.questionId || target.turnId || target.canonicalId, target.answerId)
        || resolveAnswerTarget(target.answerId || target.turnId || target.canonicalId, target.answerId, Number(target?.btnEl?.dataset?.turnIdx || 0));
      return MINI_isResolvedTargetElement(resolved, target, surface) ? resolved : null;
    }
    const resolved = resolveAnswerTarget(
      target.answerId || target.canonicalId || target.turnId,
      target.answerId,
      Number(target?.btnEl?.dataset?.turnIdx || 0),
    );
    return MINI_isResolvedTargetElement(resolved, target, surface) ? resolved : null;
  }

  function MINI_waitForResolvedTarget(ctx, surface = 'answer', timeoutMs = 1400) {
    const maxWaitMs = Math.max(120, Number(timeoutMs || 1400) || 1400);
    return new Promise((resolve) => {
      const t0 = performance.now();

      const tick = () => {
        const target = MINI_resolveTargetElement(ctx, surface);
        if (target) {
          resolve(target);
          return;
        }
        if ((performance.now() - t0) >= maxWaitMs) {
          resolve(null);
          return;
        }
        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  function MINI_scrollToResolvedTarget(target, ctx, surface = 'answer') {
    if (!target) return false;
    scrollPageToTarget(target, true, 'center');
    if (surface === 'question') {
      let flashed = false;
      try { flashed = !!MM_core()?.applyTempFlash?.(target, { surface: 'question' }); } catch {}
      if (!flashed) {
        try { W.applyTempFlash?.(target, { surface: 'question' }); } catch {}
      }
    } else {
      let flashed = false;
      try { flashed = !!MM_core()?.flashAnswer?.(target); } catch {}
      if (!flashed) {
        try { flashed = !!W.flashAnswer?.(target); } catch {}
      }
      if (!flashed) {
        try { W.applyTempFlash?.(target); } catch {}
      }
    }
    setActiveTurnId(
      ctx?.turnId || ctx?.id || ctx?.answerId || ctx?.canonicalId || '',
      `turn:${ctx?.gesture || 'click'}:${surface}`,
      { skipPageScroll: true },
    );
    return true;
  }

  function MINI_navigateTurnTarget(ctx, surface = 'answer') {
    const immediateCtx = MINI_getCanonicalTargetCtx(ctx, surface);
    const immediate = MINI_resolveTargetElement(immediateCtx, surface);
    if (immediate) return Promise.resolve({ ctx: immediateCtx, target: immediate, materialized: false });

    return MINI_materializeTarget(immediateCtx, surface).then(async (materializedCtx) => {
      const waitMs = isVirtualizedConversation() ? 1600 : 480;
      const target = await MINI_waitForResolvedTarget(materializedCtx, surface, waitMs);
      return { ctx: materializedCtx, target, materialized: true };
    });
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

  function resetVisibleAnswersObserver() {
    try { S.io?.disconnect?.(); } catch {}
    S.io = null;
    S.ioObserved.clear();
    S.visibleSet.clear();
  }

  function ensureVisibleAnswersObserver() {
    if (S.io) return S.io;
    if (typeof IntersectionObserver !== 'function') {
      S.io = null;
      return null;
    }
    S.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) S.visibleSet.add(e.target);
        else S.visibleSet.delete(e.target);
      }
    }, { root: null, rootMargin: '-120px 0px -40px 0px', threshold: 0 });
    return S.io;
  }

  function pruneObservedAnswers() {
    if (!S.ioObserved.size) return 0;
    const io = S.io;
    let removed = 0;
    for (const el of Array.from(S.ioObserved)) {
      if (el?.isConnected) continue;
      removed += 1;
      try { io?.unobserve?.(el); } catch {}
      S.ioObserved.delete(el);
      S.visibleSet.delete(el);
    }
    return removed;
  }

  function observeVisibleAnswers(answers, opts = {}) {
    if (opts?.reset) resetVisibleAnswersObserver();
    const io = ensureVisibleAnswersObserver();
    if (!io) return;
    const list = (Array.isArray(answers) ? answers : []).filter((el) => !!el && el.isConnected);
    if (opts?.incremental) {
      for (const el of list) {
        if (S.ioObserved.has(el)) continue;
        try { io.observe(el); } catch {}
        S.ioObserved.add(el);
      }
      if (opts?.prune) pruneObservedAnswers();
      return;
    }
    const next = new Set(list);
    for (const el of Array.from(S.ioObserved)) {
      if (next.has(el) && el.isConnected) continue;
      try { io.unobserve(el); } catch {}
      S.ioObserved.delete(el);
      S.visibleSet.delete(el);
    }
    for (const el of next) {
      if (S.ioObserved.has(el)) continue;
      try { io.observe(el); } catch {}
      S.ioObserved.add(el);
    }
    if (opts?.prune !== false) pruneObservedAnswers();
  }

  function currentAnswerEls() {
    const core = MM_core();
    try {
      const coreList = core?.getAnswerList?.();
      if (Array.isArray(coreList)) {
        const connected = coreList.filter((el) => !!el && el.isConnected);
        if (connected.length) return connected;
        const anyDomAnswer = q(answersSelector());
        if (!anyDomAnswer) return [];
      }
    } catch {}
    markPerfFullScan();
    return qq(answersSelector());
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
    const PAGE_DIVIDER_LABEL_SEL = '.cgxui-mm-page-divider-label';
    let lastMidTime = 0;
    let lastMidId = '';
    let midTimer = null;
    let lastTapTs = 0;
    let lastTapId = '';
    let suppressClickUntil = 0;

    const isQuestionSurfaceBtn = (btn) => {
      if (!btn) return false;
      const ui = String(btn.getAttribute?.('data-cgxui') || '').trim().toLowerCase();
      if (ui === 'mnmp-qbtn' || ui === 'mm-qbtn') return true;
      if (String(btn.dataset?.surfaceRole || '').trim().toLowerCase() === 'question') return true;
      return !!btn.classList?.contains?.('cgxui-mm-qbtn');
    };

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
        const ui = String(btn.getAttribute?.('data-cgxui') || '').trim();
        if (ui === 'mnmp-btn' || ui === 'mm-btn' || ui === 'mnmp-qbtn' || ui === 'mm-qbtn') return true;
      } catch {}
      try {
        if (btn.classList?.contains?.('cgxui-mm-btn')) return true;
        if (btn.classList?.contains?.('cgxui-mm-qbtn')) return true;
      } catch {}
      return false;
    };

    const isOwnedPageDividerLabel = (label) => {
      if (!label) return false;
      try {
        if (!label.closest?.('.cgxui-mm-page-divider')) return false;
        return !!label.closest?.('[data-cgxui="mnmp-minimap"], [data-cgxui="mnmp-col"], [data-cgxui="mm-col"]');
      } catch {}
      return false;
    };

    const jumpToPageFromDivider = (label, event) => {
      if (!label || !isOwnedPageDividerLabel(label)) return false;
      const pageNum = Math.max(1, Number(
        label?.dataset?.pageNum
        || label.closest?.('.cgxui-mm-page-divider')?.getAttribute?.('data-page-num')
        || 0
      ) || 0);
      if (!pageNum) return false;

      event?.preventDefault?.();
      event?.stopPropagation?.();
      suppressClickUntil = performance.now() + 420;

      const pw = W.H2O_Pagination;
      if (pw && typeof pw.goToPageStart === 'function') {
        const guardToken = armPageJumpGuard(1100, 'page-divider');
        try {
          const ok = !!pw.goToPageStart(pageNum - 1, 'minimap:page-divider', { smooth: true });
          if (ok) {
            try { getCoreSurface()?.centerOnPageDivider?.(pageNum, { smooth: true }); } catch {}
            S.lastActivePageNum = pageNum;
            return true;
          }
        } catch {}
        cancelPageJumpGuard(guardToken);
      }
      if (pw && typeof pw.goToPage === 'function') {
        const guardToken = armPageJumpGuard(480, 'page-divider');
        try {
          const ok = !!pw.goToPage(pageNum - 1, 'minimap:page-divider');
          if (ok) return true;
        } catch {}
        cancelPageJumpGuard(guardToken);
      }

      const core = getCoreSurface();
      const firstTurnIdx = Math.max(1, ((pageNum - 1) * 25) + 1);
      const turn = core?.getTurnList?.()?.[firstTurnIdx - 1] || null;
      const targetId = String(turn?.turnId || turn?.answerId || '').trim();
      if (!targetId || typeof core?.centerOn !== 'function') return false;
      try {
        return !!core.centerOn(targetId, { force: true, smooth: true, activate: true });
      } catch {
        return false;
      }
    };

    const turnCtx = (btn, gesture, ev) => {
      const turnId = String(btn?.dataset?.id || btn?.dataset?.turnId || '').trim();
      const answerId = String(btn?.dataset?.primaryAId || '').trim();
      const id = turnId || answerId;
      const turn = turnId ? getTurn(turnId) : null;
      const surfaceRole = String(btn?.dataset?.surfaceRole || 'answer').trim().toLowerCase() || 'answer';
      return {
        surface: 'turn',
        surfaceRole,
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
        MINI_navigateTurnTarget(ctx, 'answer').then(({ ctx: nextCtx, target }) => {
          if (!target) return;
          MINI_scrollToResolvedTarget(target, nextCtx, 'answer');
        }).catch((e) => {
          derr('turn:answer:navigate', e);
        }).finally(() => {
          setTimeout(() => { MM.program = false; }, 160);
        });
        return true;
      },
      question: (ctx) => {
        if (!ctx?.id) return false;
        MM.program = true;
        MINI_navigateTurnTarget(ctx, 'question').then(({ ctx: nextCtx, target }) => {
          if (!target) return;
          MINI_scrollToResolvedTarget(target, nextCtx, 'question');
        }).catch((e) => {
          derr('turn:question:navigate', e);
        }).finally(() => {
          setTimeout(() => { MM.program = false; }, 180);
        });
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

    const normalizeTurnBindingForSurface = (binding, ctx) => {
      const role = String(ctx?.surfaceRole || 'answer').trim().toLowerCase();
      const gesture = String(ctx?.gesture || '').trim().toLowerCase();
      if (role !== 'question') return binding;
      if (gesture !== 'click') return binding;

      return { kind: 'question' };
    };

    const runTurnGesture = (btn, gesture, event) => {
      if (!btn || !isOwnedMiniMapBtn(btn)) return false;

      const ctx = turnCtx(btn, gesture, event);
      if (!ctx.id) return false;

      const isCold = btn.classList?.contains?.('h2o-mm-cold') || String(btn.getAttribute?.('data-h2o-archive-cold') || '') === '1';
      if (isCold && gesture === 'click') {
        const answerIndex = Math.max(1, Number(btn?.dataset?.turnIdx || 0) || 0);
        const rawMsgIdx = Number(btn?.dataset?.h2oArchiveMsgIdx);
        const msgIdx = Number.isFinite(rawMsgIdx) ? Math.floor(rawMsgIdx) : -1;
        try {
          window.dispatchEvent(new CustomEvent(EVT_ARCHIVE_SCROLL_TO_COLD, {
            detail: {
              chatId: String(resolveChatId() || '').trim(),
              answerIndex,
              msgIdx,
              turnId: String(ctx.turnId || '').trim(),
              answerId: String(ctx.answerId || '').trim(),
              source: 'minimap:click:cold',
            },
          }));
        } catch {}
        try { setActiveTurnId(ctx.id, 'turn:click:cold'); } catch {}
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      const binding0 = behaviorBinding('turn', gesture, event);
      const binding = normalizeTurnBindingForSurface(binding0, ctx);
      const kind = String(binding?.kind || '').trim();

      if (kind === 'none') return false;
      if (kind === 'blocked') {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      const resolved = resolveTurnBinding(binding, ctx);
      if (!resolved.fn) {
        behaviorApi()?.warnOnce?.(
          `turn-action:${gesture}:${kind}:${ctx.surfaceRole || 'answer'}`,
          'Turn action unavailable; safe no-op.',
          { gesture, kind, surfaceRole: ctx.surfaceRole || 'answer' }
        );
        event?.preventDefault?.();
        event?.stopPropagation?.();
        return true;
      }

      event?.preventDefault?.();
      event?.stopPropagation?.();
      try {
        return !!resolved.fn(ctx, binding?.payload || {});
      } catch (e) {
        behaviorApi()?.warnOnce?.(
          `turn-action-err:${gesture}:${kind}:${ctx.surfaceRole || 'answer'}`,
          'Turn action failed; safe no-op.',
          { err: String(e?.message || e), surfaceRole: ctx.surfaceRole || 'answer' }
        );
        return false;
      }
    };

    const pointerHandler = (e) => {
      if (e.button != null && e.button !== 0) return;
      const pageLabel = e.target?.closest?.(PAGE_DIVIDER_LABEL_SEL);
      if (pageLabel && isOwnedPageDividerLabel(pageLabel)) return;
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
      const pageLabel = e.target?.closest?.(PAGE_DIVIDER_LABEL_SEL);
      if (pageLabel && isOwnedPageDividerLabel(pageLabel)) {
        jumpToPageFromDivider(pageLabel, e);
        return;
      }
      const btn = e.target?.closest?.(mmBtnSelector());
      if (!btn || !isOwnedMiniMapBtn(btn)) return;
      runTurnGesture(btn, 'click', e);
    };

    const handleMiddleEvent = (event) => {
      const btn = event?.target?.closest?.(mmBtnSelector());
      if (!btn || event.button !== 1) return;
      if (!btn.closest?.('[data-cgxui$="minimap"]')) return;
      if (isQuestionSurfaceBtn(btn)) return;

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
      if (isQuestionSurfaceBtn(btn)) return;
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

  function findBtnById(id, opts = null) {
    const key = String(id || '').trim();
    if (!key) return null;
    try {
      const btn = MM_core()?.getBtnById?.(key);
      if (btn) return btn;
    } catch {}
    if (!opts?.repair) return null;
    return selectMiniBtnById(key);
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

  function setActiveTurnId(id, source = 'api', opts = {}) {
    const key = normalizeNavId(id);
    if (!key) return false;

    const core = getCoreSurface();
    if (!core) {
      disableScrollSync('set-active:no-core');
      return false;
    }
    S.mmProgram = true;
    const skipPageScroll = !!opts?.skipPageScroll;
    if (!skipPageScroll) {
      const target = resolveAnswerTarget(key);
      try { scrollPageToTarget(target, true, 'center'); } catch (e) { derr('setActive:target.scroll', e); }
    }
    try { core.setActive?.(key, source); } catch (e) { derr('setActive:core.setActive', e); }
    try { core.centerOn?.(key, { force: true, smooth: true, activate: false }); } catch (e) { derr('setActive:core.centerOn', e); }
    try { core.updateCounter?.(key); } catch (e) { derr('setActive:core.updateCounter', e); }
    try { core.updateToggleColor?.(key); } catch (e) { derr('setActive:core.updateToggleColor', e); }
    clearTimeout(S.mmUserTimer);
    S.mmUserTimer = setTimeout(() => { S.mmProgram = false; }, 240);

    S.lastActiveTurnId = key;
    S.lastActiveBtnId = key;
    try { S.lastActiveBtnEl = core.getBtnById?.(key) || S.lastActiveBtnEl || null; } catch {}
    notifyTurnChange(source);
    return true;
  }

  function syncActive(reason = 'scroll') {
    if (!S.running) return;
    if (S.scrollSyncDisabled) return;
    if (S.mmUser || S.mmProgram) return;
    const scanTick0 = Number(S.perfFullScanTick || 0);

    try { if (S.syncRAF) cancelAnimationFrame(S.syncRAF); } catch {}
    S.syncRAF = requestAnimationFrame(() => {
      S.syncRAF = 0;
      try { pruneObservedAnswers(); } catch {}
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
      const activePageNum = Math.max(0, Number(active?.activePageNum || 0) || 0);
      id = String(active?.activeTurnId || active?.activeAnswerId || active?.syncedId || '');
      if (id) {
        let nextBtn = null;
        try { nextBtn = core.getBtnById?.(id) || null; } catch {}
        const stateStr = String(nextBtn?.getAttribute?.('data-cgxui-state') || '');
        const alreadyActive = !!(
          nextBtn &&
          (nextBtn.classList?.contains?.('active') || /\bactive\b/.test(stateStr))
        );
        const sameId = id === String(S.lastActiveTurnId || S.lastActiveBtnId || '').trim();
        if (!(sameId && alreadyActive)) {
          try { core.setActive(id, 'scroll-sync'); } catch (e) { derr('sync:setActive', e); }
          const centeredDivider = syncViewportPageDivider(core, activePageNum, reason);
          if (!centeredDivider) {
            try { core.centerOn?.(id, { force: false, smooth: true, activate: false }); } catch (e) { derr('sync:centerOn', e); }
          }
          S.lastActiveTurnId = id;
          S.lastActiveBtnId = id;
          try { S.lastActiveBtnEl = core.getBtnById?.(id) || S.lastActiveBtnEl || null; } catch {}
          if (PERF_ASSERT_ON) console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
        } else {
          syncViewportPageDivider(core, activePageNum, reason);
        }
      } else {
        syncViewportPageDivider(core, activePageNum, reason);
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
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const scanTick0 = Number(S.perfFullScanTick || 0);
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

    if (PERF_ASSERT_ON) {
      try {
        console.debug('[MiniMap][perf] engine.rebuildNow', {
          reason: S.rebuildReason,
          ok,
          ms: Math.max(0, Number(performance.now() - perfT0).toFixed(2)),
          fullScansDelta: Math.max(0, Number(S.perfFullScanTick || 0) - scanTick0),
          fullScansTotal: Number(S.perfFullScanTick || 0),
        });
      } catch {}
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

  function cancelScheduledTask(key, field, type = 'timeout') {
    const schedule = MM_schedule();
    if (schedule) {
      try { schedule.cancel(key); } catch {}
    }
    const id = S[field];
    if (!id) {
      S[field] = type === 'raf' ? 0 : null;
      return;
    }
    if (type === 'raf') {
      try { cancelAnimationFrame(id); } catch {}
      S[field] = 0;
      return;
    }
    try {
      if (type === 'interval') clearInterval(id);
      else clearTimeout(id);
    } catch {}
    S[field] = null;
  }

  function stop(reason = 'engine:stop') {
    cancelScheduledTask('minimap:first-paint', 'firstPaintRaf', 'raf');
    cancelScheduledTask('minimap:first-paint:250', 'firstPaintTimer');
    cancelScheduledTask('minimap:first-paint:failsafe', 'failsafeTimer');
    clearTimer('pageJumpTimer');
    cancelScheduledTask('minimap:pagination-check:fast', 'paginationCheckFastTimer');
    cancelScheduledTask('minimap:pagination-check:slow', 'paginationCheckSlowTimer');

    try { if (S.syncRAF) cancelAnimationFrame(S.syncRAF); } catch {}
    S.syncRAF = 0;

    try { S.domMO?.disconnect?.(); } catch {}
    try { S.panelMO?.disconnect?.(); } catch {}
    try { S.panelRootMO?.disconnect?.(); } catch {}
    try { S.formRO?.disconnect?.(); } catch {}
    resetVisibleAnswersObserver();
    S.domMO = null;
    S.panelMO = null;
    S.panelRootMO = null;
    S.formRO = null;
    clearMiniMapGuardBindings();

    try { S.offScroll?.(); } catch {}
    try { S.offResize?.(); } catch {}
    try { S.offShellReady?.(); } catch {}
    try { S.offBehaviorChanged?.(); } catch {}
    try { S.offRouteChanged?.(); } catch {}
    try { S.offBtnClick?.(); } catch {}
    try { S.offPaginationChanged?.(); } catch {}
    try { S.offPaginationChangedAlias?.(); } catch {}
    try { S.offIndexAppended?.(); } catch {}
    try { S.offIndexHydrated?.(); } catch {}
    try { S.offViewChanged?.(); } catch {}
    S.offScroll = null;
    S.offResize = null;
    S.offShellReady = null;
    S.offBehaviorChanged = null;
    S.offRouteChanged = null;
    S.offBtnClick = null;
    S.offPaginationChanged = null;
    S.offPaginationChangedAlias = null;
    S.offIndexAppended = null;
    S.offIndexHydrated = null;
    S.offViewChanged = null;

    S.running = false;
    S.scrollSyncDisabled = false;
    S.pageJumpToken = 0;
    S.pageJumpUntil = 0;
    S.lastActivePageNum = 0;
    S.lastActiveBtnEl = null;
    S.lastActiveBtnId = '';
    S.moRebuildCooldownUntil = 0;
    markReady(false);
    dlog('engine:stop', { reason });
    return true;
  }

  function pickAddedAnswerNode(node, answerSel) {
    if (!node || node.nodeType !== 1) return null;
    const el = node;
    if (el.matches?.(answerSel)) return el;
    const role = String(el.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role === 'assistant') return el;
    const c1 = el.firstElementChild || null;
    if (c1?.matches?.(answerSel)) return c1;
    const c2 = c1?.firstElementChild || null;
    if (c2?.matches?.(answerSel)) return c2;
    const shouldScanDeep = (el.childElementCount || 0) <= 12
      || el.matches?.('[data-testid="conversation-turn"], [data-testid="conversation-turns"], main');
    if (!shouldScanDeep || !el.querySelector) return null;
    return el.querySelector(answerSel);
  }

  function isMiniMapOwnedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    const el = node;
    try {
      if (String(el.getAttribute?.('data-cgxui-owner') || '').trim() === 'mnmp') return true;
    } catch {}
    try {
      if (el.closest?.('[data-cgxui-owner="mnmp"]')) return true;
    } catch {}
    return false;
  }

  function collectMutationSignals(muts) {
    const answerSel = answersSelector();
    const added = new Set();
    let rebuildHit = false;
    for (const m of muts || []) {
      if (!m || m.type !== 'childList') continue;
      const hasAdded = !!(m.addedNodes && m.addedNodes.length);
      const hasRemoved = !!(m.removedNodes && m.removedNodes.length);
      if (!hasAdded && !hasRemoved) continue;
      for (const n of Array.from(m?.removedNodes || [])) {
        if (!n || n.nodeType !== 1) continue;
        const el = n;
        if (isMiniMapOwnedNode(el)) continue;
        if (el.matches?.(answerSel)) {
          rebuildHit = true;
          break;
        }
        const childCount = Number(el.childElementCount || 0);
        const isTurnLike = !!el.matches?.('[data-testid="conversation-turn"], [data-testid="conversation-turns"], main');
        if (isTurnLike && childCount <= 12 && el.querySelector?.(answerSel)) {
          rebuildHit = true;
          break;
        }
      }
      for (const n of Array.from(m?.addedNodes || [])) {
        if (isMiniMapOwnedNode(n)) continue;
        const answerEl = pickAddedAnswerNode(n, answerSel);
        if (answerEl) added.add(answerEl);
      }
    }
    return { addedAnswers: Array.from(added), rebuildHit };
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
        const sig = collectMutationSignals(muts);
        const core = MM_core();
        const chatId = resolveChatId();
        let fallbackRebuild = !!sig.rebuildHit;
        let didDeltaAppend = false;
        const observedNewAnswers = [];
        if (sig.addedAnswers.length) {
          const appendFn = core?.appendTurnFromAnswerEl;
          if (typeof appendFn === 'function' && chatId) {
            for (const answerEl of sig.addedAnswers) {
              let out = null;
              try { out = appendFn(chatId, answerEl, { source: 'engine:mo' }); } catch {}
              const status = String(out?.status || '').trim();
              if (out?.ok || status === 'appended' || status === 'exists') {
                didDeltaAppend = true;
                observedNewAnswers.push(answerEl);
              }
              if (!out || status === 'error' || status === 'non-monotonic' || status === 'ui-missing' || status === 'noop') fallbackRebuild = true;
            }
          } else {
            fallbackRebuild = true;
          }
        }
        if (didDeltaAppend) {
          try { observeVisibleAnswers(observedNewAnswers.length ? observedNewAnswers : sig.addedAnswers, { incremental: true, prune: true }); } catch {}
          syncActive('mo:append');
        }
        if (fallbackRebuild) {
          const now = Date.now();
          if (now >= Number(S.moRebuildCooldownUntil || 0)) {
            S.moRebuildCooldownUntil = now + MO_REBUILD_COOLDOWN_MS;
            scheduleRebuild('mo:answers');
          }
        }
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

    const panelTargetSel = '[data-cgxui="mm-panel"], [data-cgxui="mm-toggle"]';
    const isPanelRemovalHit = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const el = node;
      if (el.matches?.(panelTargetSel)) return true;
      const childCount = Number(el.childElementCount || 0);
      if (childCount > 8) return false;
      return !!el.querySelector?.(panelTargetSel);
    };
    const onPanelMutations = (muts) => {
      if (!S.running) return;
      const hit = muts.some((m) => Array.from(m.removedNodes || []).some((n) => {
        return isPanelRemovalHit(n);
      }));
      if (hit) scheduleRebuild('panel:removed');
    };
    const panelRoot = MM_uiRefs()?.root || null;
    const panelHost = panelRoot?.parentElement || document.body;
    S.panelMO = new MutationObserver(onPanelMutations);
    S.panelMO.observe(panelHost, { childList: true, subtree: false });
    if (panelRoot) {
      S.panelRootMO = new MutationObserver(onPanelMutations);
      S.panelRootMO.observe(panelRoot, { childList: true, subtree: true });
    }
    bindMiniMapScrollGuards();

    const onRouteChanged = () => {
      if (!S.running) return;
      resetVisibleAnswersObserver();
      scheduleRebuild('route:changed');
      scheduleFirstPaintRebuild('route');
    };
    try {
      window.addEventListener(EVT_ROUTE_CHANGED, onRouteChanged, true);
      window.addEventListener(EVT_ROUTE_CHANGED.replace(/^evt:/, ''), onRouteChanged, true);
      S.offRouteChanged = () => {
        try { window.removeEventListener(EVT_ROUTE_CHANGED, onRouteChanged, true); } catch {}
        try { window.removeEventListener(EVT_ROUTE_CHANGED.replace(/^evt:/, ''), onRouteChanged, true); } catch {}
      };
    } catch {}

    const onPaginationChanged = () => {
      if (!S.running) return;
      const chatId = resolveChatId();
      try { MM_core()?.attachVisibleAnswers?.(chatId); } catch {}
      try { observeVisibleAnswers(currentAnswerEls()); } catch {}
      if (hasPendingPageJump()) return;
      if (paginationCoverageNeedsRebuild('pagination:pagechanged')) {
        scheduleRebuild('pagination:canonical-mismatch:pagechanged');
        return;
      }
      syncActive('pagination:pagechanged');
    };
    S.offPaginationChanged = on(window, EVT_PAGE_CHANGED, onPaginationChanged, { passive: true });
    S.offPaginationChangedAlias = on(window, EVT_PAGE_CHANGED_ALIAS, onPaginationChanged, { passive: true });

    const onIndexHydrated = () => {
      if (!S.running) return;
      const chatId = resolveChatId();
      try { MM_core()?.attachVisibleAnswers?.(chatId); } catch {}
      try { observeVisibleAnswers(currentAnswerEls()); } catch {}
      schedulePaginationCoverageCheck('index:hydrated');
      syncActive('index:hydrated');
    };
    S.offIndexHydrated = on(window, EVT_MM_INDEX_HYDRATED, onIndexHydrated, { passive: true });

    const onIndexAppended = (e) => {
      if (!S.running) return;
      const detail = e?.detail || {};
      const msgId = String(detail?.msgId || detail?.answerId || '').trim();
      if (msgId) {
        const answerEl = findAnswerById(msgId);
        if (answerEl) {
          try { observeVisibleAnswers([answerEl], { incremental: true, prune: true }); } catch {}
        }
      }
      syncActive('index:appended');
    };
    S.offIndexAppended = on(window, EVT_MM_INDEX_APPENDED, onIndexAppended, { passive: true });

    const onViewChanged = (e) => {
      if (!S.running) return;
      const detail = e?.detail || {};
      const modeFromEvent = String(detail?.mode || detail?.nextMode || '').trim();
      if (modeFromEvent) {
        if (modeFromEvent === String(S.lastViewMode || '').trim()) return;
        S.lastViewMode = modeFromEvent;
      } else {
        const modeNow = currentViewMode();
        if (modeNow && modeNow === String(S.lastViewMode || '').trim()) return;
        if (modeNow) S.lastViewMode = modeNow;
      }
      scheduleRebuild('view:changed');
    };
    S.offViewChanged = on(window, EVT_MM_VIEW_CHANGED, onViewChanged, { passive: true });
  }

  function hasAnswersInDom() {
    try {
      if (hasAnswersInDomCheap()) return true;
      const list = MM_core()?.getAnswerList?.();
      if (Array.isArray(list)) return list.some((el) => !!el && el.isConnected);
      return false;
    } catch {
      return false;
    }
  }

  function hasAnswersInDomCheap() {
    try { return !!q(answersSelector()); } catch { return false; }
  }

  function getPaginationCoverageDetail() {
    try {
      return MM_core()?.validateTurnsAgainstPagination?.() || null;
    } catch {
      return null;
    }
  }

  function paginationCoverageNeedsRebuild(reason = 'pagination') {
    const detail = getPaginationCoverageDetail();
    if (!detail || !detail.applicable || detail.ok) return false;
    if (PERF_ASSERT_ON) {
      try { console.warn('[MiniMap] pagination canonical mismatch → rebuild', { reason, detail }); } catch {}
    }
    return true;
  }

  function schedulePaginationCoverageCheck(reason = 'pagination') {
    const why = String(reason || 'pagination');
    const run = (tag) => {
      if (!S.running) return;
      if (!paginationCoverageNeedsRebuild(`${why}:${tag}`)) return;
      scheduleRebuild(`pagination:canonical-mismatch:${why}:${tag}`);
    };

    const schedule = MM_schedule();
    cancelScheduledTask('minimap:pagination-check:fast', 'paginationCheckFastTimer');
    cancelScheduledTask('minimap:pagination-check:slow', 'paginationCheckSlowTimer');
    if (schedule) {
      S.paginationCheckFastTimer = schedule.timeoutOnce('minimap:pagination-check:fast', 120, () => {
        S.paginationCheckFastTimer = null;
        run('fast');
      });
      S.paginationCheckSlowTimer = schedule.timeoutOnce('minimap:pagination-check:slow', 700, () => {
        S.paginationCheckSlowTimer = null;
        run('slow');
      });
      return;
    }
    S.paginationCheckFastTimer = setTimeout(() => {
      S.paginationCheckFastTimer = null;
      run('fast');
    }, 120);
    S.paginationCheckSlowTimer = setTimeout(() => {
      S.paginationCheckSlowTimer = null;
      run('slow');
    }, 700);
  }

  function cacheBootNeedsRebuild(cacheResult) {
    const renderedCount = Number(cacheResult?.renderedCount || 0);
    const answersExist = hasAnswersInDomCheap();
    if (renderedCount === 0 && answersExist) return true;
    const lastAnswerId = String(cacheResult?.lastAnswerId || '').trim();
    const lastTurnId = String(cacheResult?.lastTurnId || '').trim();
    const probeId = lastAnswerId || lastTurnId;
    if (probeId && !findAnswerById(probeId)) return true;
    const paginationCoverage = cacheResult?.paginationCoverage || getPaginationCoverageDetail();
    if (paginationCoverage?.applicable && !paginationCoverage?.ok) return true;
    return false;
  }

  function buildMissing() {
    const core = MM_core();
    const turns = Number(core?.getTurnList?.()?.length || 0);
    let btns = 0;
    const scope = minimapCol() || minimapPanel() || null;
    if (scope) {
      markPerfFullScan();
      try { btns = Number(scope.querySelectorAll(mmBtnSelector()).length || 0); } catch {}
    } else {
      markPerfFullScan();
      btns = Number(qq(mmBtnSelector()).length || 0);
    }
    return turns <= 0 || btns <= 0;
  }

  function scheduleFirstPaintRebuild(reason = 'boot') {
    const why = String(reason || 'boot');
    const schedule = MM_schedule();
    cancelScheduledTask('minimap:first-paint', 'firstPaintRaf', 'raf');
    cancelScheduledTask('minimap:first-paint:250', 'firstPaintTimer');
    cancelScheduledTask('minimap:first-paint:failsafe', 'failsafeTimer');

    const stage = (tag) => {
      if (!S.running || !hasAnswersInDom()) return false;
      if (!buildMissing()) return false;
      return scheduleRebuild(`boot:first-paint:${why}:${tag}`);
    };

    if (schedule) {
      S.firstPaintRaf = schedule.rafOnce('minimap:first-paint', () => {
        S.firstPaintRaf = 0;
        stage('raf');
      });
      S.firstPaintTimer = schedule.timeoutOnce('minimap:first-paint:250', 250, () => {
        S.firstPaintTimer = null;
        stage('250ms');
      });
      S.failsafeTimer = schedule.timeoutOnce('minimap:first-paint:failsafe', 1000, () => {
        S.failsafeTimer = null;
        stage('1000ms');
      });
      return;
    }
    S.firstPaintRaf = requestAnimationFrame(() => {
      S.firstPaintRaf = 0;
      stage('raf');
    });
    S.firstPaintTimer = setTimeout(() => {
      S.firstPaintTimer = null;
      stage('250ms');
    }, 250);
    S.failsafeTimer = setTimeout(() => {
      S.failsafeTimer = null;
      stage('1000ms');
    }, 1000);
  }

  function start(reason = 'engine:start') {
    if (S.running) return true;
    const core = MM_core();
    if (!core || TOPW.H2O_MM_CORE_READY !== true) {
      warn('Core not ready; runtime idle.', { reason });
      return false;
    }
    if (!shellReady()) {
      warn('Shell not ready; runtime idle.', { reason });
      return false;
    }

    S.running = true;

    // Shell owns first UI mount; engine only verifies refs once shell is ready.
    try { MM_ui()?.ensureUI?.(`engine:${reason}`); } catch (e) { derr('start:ensureUI', e); }
    try { core.initCore?.(); } catch (e) { derr('start:initCore', e); }

    try { ensureDelegatedHandlers(); } catch (e) { derr('start:bindDelegatedHandlers', e); }
    try { W.H2O?.MM?.dots?.attachInlineMutationObserver?.(); } catch (e) { derr('start:attachInlineMutationObserver', e); }

    const bootMode = getBootMode();
    const chatId = resolveChatId();
    S.lastViewMode = currentViewMode() || String(S.lastViewMode || '');
    let cacheResult = null;
    let cacheBootRendered = false;
    if (bootMode === BOOT_MODE_CACHE_FIRST && typeof core.renderFromCache === 'function') {
      try {
        cacheResult = core.renderFromCache(chatId);
        cacheBootRendered = !!cacheResult?.ok;
      } catch (e) {
        derr('start:renderFromCache', e);
        cacheBootRendered = false;
      }
      const mismatch = (!cacheResult || !cacheResult.ok) || cacheBootNeedsRebuild(cacheResult);
      if (mismatch) {
        try {
          const coverage = cacheResult?.paginationCoverage || getPaginationCoverageDetail();
          if (coverage?.applicable && !coverage?.ok) core.clearTurnCache?.(chatId);
        } catch (e) { derr('start:clearTurnCache', e); }
        if (PERF_ASSERT_ON) {
          try { console.warn('[MiniMap] cache mismatch → rebuild fallback'); } catch {}
        }
        scheduleRebuild('cache:mismatch');
      }
    }

    bindObservers();
    if (cacheBootRendered) {
      try { core.attachVisibleAnswers?.(chatId); } catch (e) { derr('start:attachVisibleAnswers:cache', e); }
      try { observeVisibleAnswers(currentAnswerEls()); } catch (e) { derr('start:observeVisibleAnswers:cache', e); }
      try { bindMiniMapScrollGuards(); } catch (e) { derr('start:bindMiniMapScrollGuards:cache', e); }
      syncActive('boot:cache');
    } else if (hasAnswersInDom()) rebuildNow(`boot:answers-present:${reason}`);
    else scheduleRebuild(`boot:${reason}`);
    scheduleFirstPaintRebuild(reason);
    schedulePaginationCoverageCheck(`boot:${reason}`);
    setTimeout(() => syncActive('boot:sync'), 80);

    dlog('engine:start', {
      reason,
      bootMode,
      cacheBootRendered,
      cacheStatus: String(cacheResult?.status || ''),
    });
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

  function shellReady() {
    try { return TOPW.H2O_MM_SHELL_READY === true; } catch { return false; }
  }

  function depsReady() {
    const core = MM_core();
    const refs = MM_uiRefs();
    const hasUiRefs = !!(refs?.root && refs?.panel && refs?.toggle);
    return !!core
      && TOPW.H2O_MM_CORE_READY === true
      && shellReady()
      && hasUiRefs;
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
        warn('Dependencies missing for runtime cutover; engine idle.', { source, tries: S.bootTries, coreReady: TOPW.H2O_MM_CORE_READY === true, shellReady: shellReady(), uiRefs: !!(MM_uiRefs()?.root && MM_uiRefs()?.panel && MM_uiRefs()?.toggle) });
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
