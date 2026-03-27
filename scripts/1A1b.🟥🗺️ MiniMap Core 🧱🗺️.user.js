// ==UserScript==
// @h2o-id             1a1b.minimap.core
// @name               1A1b.🟥🗺️ MiniMap Core 🧱🗺️
// @namespace          H2O.Premium.CGX.minimap.core
// @author             HumamDev
// @version            12.6.15
// @revision           001
// @build              260304-102754
// @description        MiniMap Core: state/index/rebuild/registry authority
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

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

  const CORE_VER = '12.6.15';
  const MAX_TRIES = 80;
  const GAP_MS = 120;
  const REBUILD_FALLBACK_MS = 180;

  const S = {
    inited: false,
    installTries: 0,
    installTimer: null,
    rebuildTimer: null,
    rebuildRaf: 0,
    rebuildToken: 0,
    rebuildReason: '',
    turnList: [],
    turnById: new Map(),
    turnIdByAId: new Map(),
    answerByTurnId: new Map(),
    answerEls: [],
    mapButtons: null,
    emptyRetryTimer: null,
    emptyRetryCount: 0,
    retryTimer: null,
    retryCount: 0,
    retryKind: '',
    retryReason: '',
    rebuildInFlight: false,
    rebuildQueuedReason: '',
    lastRebuildResult: null,
    lastActiveIndex: 0,
    gutterSyncQueue: new Map(),
    gutterSyncRaf: 0,
    marginSymbolsBridgeBound: false,
    marginSymbolsBridgeOff: null,
    washBridgeBound: false,
    washBridgeOff: null,
    viewBridgeBound: false,
    viewBridgeOff: null,
    washRepaintQueue: new Set(),
    washRepaintRaf: 0,
    washRepaintAll: false,
    washBridgeLastSig: '',
    washBridgeLastTs: 0,
    qWashStoreRaw: '',
    qWashStore: Object.create(null),
    lastAppliedViewMode: '',
    lastActiveBtnEl: null,
    lastActiveTurnIdFast: '',
    lastActiveBtnId: '',
    perfFullScanTick: 0,
    perfRebuildWindowTs: 0,
    perfRebuildTriggerCount: 0,
    selectedMiniDividerId: '',
    dividerDrag: null,
  };

  const UI_TOK = Object.freeze({
    OWNER: 'mnmp',
    COL: 'mnmp-col',
    WRAP: 'mnmp-wrap',
    BTN: 'mnmp-btn',
    QBTN: 'mnmp-qbtn',
    DIVIDER_LAYER: 'mnmp-divider-layer',
    DIVIDER: 'mnmp-divider',
    COL_LEGACY: 'mm-col',
    WRAP_LEGACY: 'mm-wrap',
    BTN_LEGACY: 'mm-btn',
    QBTN_LEGACY: 'mm-qbtn',
  });
  const EMPTY_RETRY_MAX = 8;
  const EMPTY_RETRY_GAP_MS = 180;
  const COLOR_BY_NAME = Object.freeze({
    blue: '#3A8BFF',
    red: '#FF4A4A',
    green: '#31D158',
    gold: '#FFD700',
    sky: '#4CD3FF',
    pink: '#FF71C6',
    purple: '#A36BFF',
    orange: '#FFA63A',
  });
  const EV_MARGIN_SYMBOLS_CHANGED = 'evt:h2o:margin:symbols:changed';
  const EV_VIEW_CHANGED = 'evt:h2o:minimap:view-changed';
  const CLS_HIDE_QWASH = 'cgx-mm-hide-qwash';
  const EV_WASH_CHANGED = Object.freeze([
    'evt:h2o:mm:wash_changed',
    'h2o:mm:wash_changed',
    'evt:h2o:wash:changed',
    'h2o:wash:changed',
    'evt:h2o:answer:wash',
    'h2o:answer:wash',
  ]);
  const FLASH_CLS = Object.freeze({
    WASH_WRAP: 'cgxui-mnmp-wash-wrap',
    WASH_WRAP_LEGACY: 'cgxui-wash-wrap',
    FLASH: 'cgxui-mnmp-flash',
    FLASH_LEGACY: 'cgxui-flash',
  });
  const KEY_MARGIN_SYMBOLS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols:v1';
  const KEY_MARGIN_SYMBOL_COLORS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols_colors:v1';
  const KEY_MARGIN_PINS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:state:pins:v1';
  const KEY_QWASH_FALLBACK = 'h2o:qwash:map:v1';
  const KEY_CUSTOM_DIVIDERS_SUFFIX = 'state:custom_dividers:chat';
  const KEY_TURN_CACHE_META_SUFFIX = 'state:turn_cache_meta:chat';
  const KEY_TURN_CACHE_TURNS_SUFFIX = 'state:turn_cache:chat';
  const EV_MM_INDEX_HYDRATED = 'evt:h2o:minimap:index:hydrated';
  const EV_MM_INDEX_APPENDED = 'evt:h2o:minimap:index:appended';
  const EV_MM_DIVIDER_CHANGED = 'evt:h2o:minimap:divider:changed';
  const EV_MM_DIVIDER_SELECTED = 'evt:h2o:minimap:divider:selected';

  const MINI_DIVIDER_DEFAULT_COLOR = '#facc15';                 // 👈 new divider default color
  const MINI_DIVIDER_LAYOUT = Object.freeze({
    GAP_CENTER_RATIO: 0.5,                                      // 👈 base target inside each gap; 0.5 = center, lower = higher, higher = lower
    UPPER_BOX_CLEARANCE_PX: 0,                                  // 👈 minimum space kept below the upper box before the divider center can sit
    LOWER_BOX_CLEARANCE_PX: 0,                                  // 👈 minimum space kept above the lower box so the divider stays visually detached from its top edge
  });

  const PERF_ASSERT_ON = (() => {
    try { return String(localStorage.getItem('h2o:perf') || '') === '1'; } catch { return false; }
  })();

  function warn(msg, extra) { try { console.warn('[MiniMap Core]', msg, extra || ''); } catch {} }

  function getRegs() {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const SEL = SH?.SEL_ || SH?.registries?.SEL || W?.H2O?.SEL || {};
    return { SH, SEL };
  }

  function q(sel, root = document) {
    try { return sel ? root.querySelector(sel) : null; } catch { return null; }
  }

  function escAttr(v) {
    const s = String(v || '');
    if (!s) return s;
    try { return (window.CSS?.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"'); } catch { return s; }
  }

  function qq(sel, root = document) {
    try { return sel ? Array.from(root.querySelectorAll(sel)) : []; } catch { return []; }
  }

  function markPerfFullScan() {
    S.perfFullScanTick = Number(S.perfFullScanTick || 0) + 1;
  }

  function perfLog(label, payload = null) {
    if (!PERF_ASSERT_ON) return;
    try {
      console.debug(`[MiniMap][perf] ${label}`, payload || {});
    } catch {}
  }

  function perfReportDuration(label, t0, scanTick0, payload = null) {
    if (!PERF_ASSERT_ON) return;
    const elapsed = Math.max(0, Number(performance.now() - Number(t0 || 0)).toFixed(2));
    const scansTotal = Number(S.perfFullScanTick || 0);
    const scansDelta = Math.max(0, scansTotal - Number(scanTick0 || 0));
    perfLog(label, Object.assign({
      ms: elapsed,
      fullScansDelta: scansDelta,
      fullScansTotal: scansTotal,
    }, payload || {}));
  }

  function perfMarkRebuildTrigger(reason = '') {
    if (!PERF_ASSERT_ON) return;
    const now = Date.now();
    if (!S.perfRebuildWindowTs) S.perfRebuildWindowTs = now;
    S.perfRebuildTriggerCount = Number(S.perfRebuildTriggerCount || 0) + 1;
    const windowMs = Math.max(1, now - Number(S.perfRebuildWindowTs || now));
    const perMinute = Math.round((Number(S.perfRebuildTriggerCount || 0) * 60000) / windowMs);
    perfLog('rebuild.trigger', {
      reason: String(reason || ''),
      countInWindow: Number(S.perfRebuildTriggerCount || 0),
      windowMs,
      approxPerMinute: perMinute,
    });
    if (windowMs >= 60000) {
      S.perfRebuildWindowTs = now;
      S.perfRebuildTriggerCount = 0;
    }
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

  function mmBtnSelector() {
    const { SEL } = getRegs();
    return SEL.MM_BTN || '[data-cgxui="mnmp-btn"], [data-cgxui="mm-btn"]';
  }

  function getCoreViewMode() {
    try {
      const viaUi = String(MM_ui()?.getViewMode?.() || '').trim().toLowerCase();
      if (viaUi) return viaUi;
    } catch {}
    try {
      const viaPanel = String(MM_uiRefs()?.panel?.getAttribute?.('data-cgxui-view') || '').trim().toLowerCase();
      if (viaPanel) return viaPanel;
    } catch {}
    return 'classic';
  }

  function isQaViewActive() {
    return getCoreViewMode() === 'qa';
  }

  function getMiniMapRootEl() {
    try {
      const viaRefs = MM_uiRefs()?.root || null;
      if (viaRefs) return viaRefs;
    } catch {}
    return q('[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"], [data-h2o-owner="minimap-v10"]');
  }

  function qwashApi() {
    return TOPW?.H2O_QWASH_API || W?.H2O_QWASH_API || null;
  }

  function syncCurrentViewArtifacts(force = false) {
    const mode = String(getCoreViewMode() || 'classic').trim().toLowerCase() || 'classic';
    const refs = MM_uiRefs();
    const panel = refs?.panel || minimapPanel();
    if (panel) {
      try { panel.setAttribute('data-cgxui-view', mode); } catch {}
    }

    const root = refs?.root || getMiniMapRootEl();
    const hideQwash = mode === 'qa';
    if (root) {
      try { root.classList.toggle(CLS_HIDE_QWASH, hideQwash); } catch {}
    }

    if (!force && mode === String(S.lastAppliedViewMode || '').trim()) return mode;
    S.lastAppliedViewMode = mode;

    const api = qwashApi();
    if (hideQwash) {
      try { api?.clearMiniMap?.(); } catch {}
      try {
        collectMiniBtns().forEach((btn) => { clearQuestionWashMiniRing(btn); });
      } catch {}
    } else {
      try { api?.repaint?.('core:view-sync'); } catch {}
    }
    return mode;
  }

  function getWrapForMiniBtn(btn) {
    if (!btn) return null;
    return (
      btn.closest?.(`[data-cgxui="${UI_TOK.WRAP}"]`) ||
      btn.closest?.(`[data-cgxui="${UI_TOK.WRAP_LEGACY}"]`) ||
      btn.closest?.('.cgxui-mm-wrap') ||
      null
    );
  }

  function getQuestionBtnForWrap(wrap) {
    if (!wrap) return null;
    return (
      wrap.querySelector?.(`[data-cgxui="${UI_TOK.QBTN}"]`) ||
      wrap.querySelector?.(`[data-cgxui="${UI_TOK.QBTN_LEGACY}"]`) ||
      wrap.querySelector?.('.cgxui-mm-qbtn') ||
      null
    );
  }

  function syncWrapMeta(wrap, turn, band) {
    if (!wrap) return null;
    const questionId = String(turn?.questionId || turn?.qId || '').trim();
    wrap.dataset.turnIdx = String(turn?.index || 0);
    wrap.dataset.pageBand = String(band || getTurnPageBand(turn?.index || 0));
    wrap.dataset.turnId = String(turn?.turnId || '');
    if (turn?.answerId) wrap.dataset.primaryAId = String(turn.answerId || '');
    else delete wrap.dataset.primaryAId;
    if (questionId) wrap.dataset.questionId = questionId;
    else delete wrap.dataset.questionId;
    return wrap;
  }

  function syncAnswerBtnMeta(btn, turn, band) {
    if (!btn) return null;
    const turnId = String(turn?.turnId || '').trim();
    const answerId = String(turn?.answerId || '').trim();
    const idx = String(turn?.index || 0);
    const pageBand = String(band || getTurnPageBand(turn?.index || 0));

    btn.dataset.id = turnId;
    btn.dataset.turnId = turnId;
    btn.dataset.primaryAId = answerId;
    btn.dataset.turnIdx = idx;
    btn.dataset.pageBand = pageBand;
    btn.dataset.surfaceRole = 'answer';
    btn.setAttribute('aria-label', `Go to answer ${idx || ''}`);

    const num = btn.querySelector('.cgxui-mm-num');
    if (num) num.textContent = String(turn?.index || '');
    return btn;
  }

  function syncQuestionBtnMeta(qBtn, turn, band) {
    if (!qBtn) return null;
    const turnId = String(turn?.turnId || '').trim();
    const answerId = String(turn?.answerId || '').trim();
    const questionId = String(turn?.questionId || turn?.qId || '').trim();
    const idx = String(turn?.index || 0);
    const pageBand = String(band || getTurnPageBand(turn?.index || 0));

    qBtn.dataset.turnId = turnId;
    qBtn.dataset.primaryAId = answerId;
    if (questionId) qBtn.dataset.questionId = questionId;
    else delete qBtn.dataset.questionId;
    qBtn.dataset.turnIdx = idx;
    qBtn.dataset.pageBand = pageBand;
    qBtn.dataset.surfaceRole = 'question';
    qBtn.setAttribute('aria-label', `Go to question ${idx || ''}`);
    qBtn.textContent = '';
    return qBtn;
  }

  function ensureQuestionBtnForWrap(wrap, turn, band, enabled = isQaViewActive()) {
    if (!wrap) return null;

    let qBtn = getQuestionBtnForWrap(wrap);

    if (!enabled) {
      if (qBtn) qBtn.remove();
      return null;
    }

    if (!qBtn) {
      qBtn = document.createElement('button');
      qBtn.type = 'button';
      qBtn.className = 'cgxui-mm-qbtn';
      qBtn.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
      qBtn.setAttribute('data-cgxui', UI_TOK.QBTN);
    }

    syncQuestionBtnMeta(qBtn, turn, band);

    if (wrap.firstChild !== qBtn) {
      wrap.insertBefore(qBtn, wrap.firstChild || null);
    }

    return qBtn;
  }

  function syncTurnRowDom(btn, turn, { qaEnabled = isQaViewActive() } = {}) {
    if (!btn || !turn) return { wrap: null, qBtn: null, btn: btn || null };
    const band = getTurnPageBand(turn.index);
    const wrap = getWrapForMiniBtn(btn);

    syncAnswerBtnMeta(btn, turn, band);
    syncWrapMeta(wrap, turn, band);

    const qBtn = ensureQuestionBtnForWrap(wrap, turn, band, qaEnabled);
    return { wrap, qBtn, btn };
  }

  function setPeerQuestionActiveFromAnswerBtn(btn, on) {
    const wrap = getWrapForMiniBtn(btn);
    const qBtn = getQuestionBtnForWrap(wrap);
    if (!qBtn) return false;
    const active = !!on;
    qBtn.classList.toggle('inview', active);
    setStateToken(qBtn, 'peer-active', active);
    if (active) qBtn.setAttribute('data-cgxui-inview', '1');
    else qBtn.removeAttribute('data-cgxui-inview');
    return true;
  }

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function luminance({ r, g, b }) {
    const srgb = [r, g, b].map((v0) => {
      let v = Number(v0) || 0;
      v /= 255;
      return v <= 0.03928 ? (v / 12.92) : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  }

  function bestTextColor(bgHex) {
    const L = luminance(hexToRgb(bgHex || '#222'));
    return L > 0.5 ? '#111' : '#fff';
  }

  function normalizeQuestionWashColorId(input) {
    const id = String(input || '').trim().toLowerCase();
    return COLOR_BY_NAME[id] ? id : '';
  }

  function isStableQuestionId(v) {
    const id = String(v || '').trim().replace(/^conversation-turn-/, '');
    if (!id || id.length < 6) return false;
    if (/^(?:user|assistant|message)$/i.test(id)) return false;
    return true;
  }

  function getStableQuestionIdFromElement(el) {
    if (!el || !(el instanceof Element)) return '';

    const qwrapNode = (
      el.closest?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      el.querySelector?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      null
    );
    if (qwrapNode) {
      const qwrapId = String(
        qwrapNode.getAttribute?.('data-h2o-qwrap-id')
        || qwrapNode.getAttribute?.('data-ho-qwrap-id')
        || qwrapNode.dataset?.h2oQwrapId
        || qwrapNode.dataset?.hoQwrapId
        || ''
      ).trim();
      if (isStableQuestionId(qwrapId)) return qwrapId;
    }

    try {
      const qId = TOPW?.H2O?.index?.getQId?.(el) || W?.H2O?.index?.getQId?.(el) || '';
      const normalized = String(qId || '').trim();
      if (isStableQuestionId(normalized)) return normalized;
    } catch {}

    try {
      const textEl =
        el.querySelector?.('.cgxui-qswr-text') ||
        el.querySelector?.('.whitespace-pre-wrap') ||
        null;
      const qwrapId =
        W?.H2O_getStableQwrapId?.(el, textEl) ||
        TOPW?.H2O_getStableQwrapId?.(el, textEl) ||
        '';
      const normalized = String(qwrapId || '').trim();
      if (isStableQuestionId(normalized)) return normalized;
    } catch {}

    const attrs = [
      'data-h2o-qwrap-id',
      'data-ho-qwrap-id',
      'data-h2o-uid',
      'data-ho-uid',
      'data-message-id',
      'data-turn-id',
      'id',
    ];
    const roots = [
      el,
      el.closest?.('[data-message-author-role], [data-author-role], [data-role], [data-message-id], [data-turn-id]') || null,
    ].filter(Boolean);

    for (const root of roots) {
      for (const attr of attrs) {
        const raw = String(root.getAttribute?.(attr) || '').trim().replace(/^conversation-turn-/, '');
        if (isStableQuestionId(raw)) return raw;
      }
    }
    return '';
  }

  function readQuestionWashCssVar(el, prop) {
    if (!el || !(el instanceof Element) || !prop) return '';
    try {
      const direct = String(el.style?.getPropertyValue(prop) || '').trim();
      if (direct) return direct;
    } catch {}
    try {
      const computed = String(W.getComputedStyle(el).getPropertyValue(prop) || '').trim();
      if (computed) return computed;
    } catch {}
    return '';
  }

  function resolveQuestionWashColorFromElement(questionEl) {
    if (!questionEl || !(questionEl instanceof Element)) return '';
    const candidates = [];
    const push = (el) => {
      if (el instanceof Element && !candidates.includes(el)) candidates.push(el);
    };
    push(questionEl);
    push(questionEl.closest?.('.cgxq-qwash-on') || null);
    push(questionEl.querySelector?.('.cgxq-qwash-on') || null);
    try {
      Array.from(questionEl.querySelectorAll?.('.cgxq-qwash-on') || []).slice(0, 4).forEach(push);
    } catch {}

    for (const el of candidates) {
      for (const prop of ['--cgxq-qwash-wash-edge', '--cgxq-qwash-wash-deep', '--cgxq-qwash-wash']) {
        const raw = readQuestionWashCssVar(el, prop);
        if (raw && raw !== 'transparent') return raw;
      }
    }
    return '';
  }

  function coerceQuestionWashEntry(rawEntry) {
    if (rawEntry == null) return null;
    if (typeof rawEntry === 'string') {
      const colorId = normalizeQuestionWashColorId(rawEntry);
      return colorId ? { colorId } : null;
    }
    if (typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;
    const colorId = normalizeQuestionWashColorId(
      rawEntry.colorId ?? rawEntry.color ?? rawEntry.colorName ?? rawEntry.name ?? rawEntry.c
    );
    return colorId ? { colorId } : null;
  }

  function getQuestionWashStore() {
    let raw = '';
    try { raw = String(W.localStorage?.getItem(KEY_QWASH_FALLBACK) || ''); } catch {}
    if (raw === S.qWashStoreRaw && S.qWashStore && typeof S.qWashStore === 'object') {
      return S.qWashStore;
    }

    const nextStore = Object.create(null);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.entries(parsed).forEach(([rawKey, rawEntry]) => {
            const key = String(rawKey || '').trim();
            const entry = coerceQuestionWashEntry(rawEntry);
            if (key && entry) nextStore[key] = entry;
          });
        }
      } catch {}
    }

    S.qWashStoreRaw = raw;
    S.qWashStore = nextStore;
    return nextStore;
  }

  function questionWashScopeKey() {
    try {
      const m = String(W.location.pathname || '').match(/\/c\/([^/]+)/);
      if (m && m[1]) return `c:${m[1]}`;
      return String(W.location.pathname || '/');
    } catch {
      return '/';
    }
  }

  function resolveMiniBtnWashState(primaryAId, btnEl = null) {
    const id = String(
      primaryAId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!id) {
      return { id: '', colorName: null, bg: null, isGold: false, paintBg: '', text: '' };
    }
    const washMap = (W?.H2O?.MM?.washMap && typeof W.H2O.MM.washMap === 'object') ? W.H2O.MM.washMap : null;
    if (!washMap) {
      return { id, colorName: null, bg: null, isGold: false, paintBg: '', text: '' };
    }

    const rawName = washMap?.[id];
    const norm = String(rawName || '').trim().toLowerCase();
    const colorName = norm && COLOR_BY_NAME[norm] ? norm : null;
    if (rawName && !colorName) {
      try { delete washMap[id]; } catch {}
    }

    const bg = colorName ? (COLOR_BY_NAME?.[colorName] || null) : null;
    const isGold = !!bg && (colorName === 'gold' || String(bg).toUpperCase() === '#FFD700');
    const paintBg = bg ? (isGold ? '#E6C200' : bg) : '';
    const text = bg ? bestTextColor(paintBg) : '';
    return { id, colorName, bg, isGold, paintBg, text };
  }

  function resolveQuestionBtnWashState(primaryAId, qBtn = null) {
    const store = getQuestionWashStore();
    const btn = qBtn || null;
    const directTurnId = String(btn?.dataset?.turnId || '').trim();
    const directQuestionId = String(btn?.dataset?.questionId || '').trim();
    const directAnswerId = String(primaryAId || btn?.dataset?.primaryAId || '').trim();
    let turnIdx = Math.max(0, Number(btn?.dataset?.turnIdx || 0) || 0);

    let record = null;
    for (const key of [directQuestionId, directTurnId, directAnswerId]) {
      if (!key) continue;
      record = getSharedTurnRecordByAnyId(key);
      if (record) break;
    }

    const questionEl = record?.questionEl || record?.qEl || record?.live?.qEl || null;
    const stableQuestionId = getStableQuestionIdFromElement(questionEl);
    const questionId = String(directQuestionId || record?.qId || record?.questionId || stableQuestionId || '').trim();
    const turnId = String(directTurnId || record?.turnId || '').trim();
    if (!turnIdx) {
      turnIdx = Math.max(0, Number(record?.turnNo || record?.idx || record?.index || 0) || 0);
    }
    if (!turnIdx) {
      const turnApi = TOPW?.H2O?.turn || W?.H2O?.turn || null;
      if (questionEl && typeof turnApi?.getTurnIndexByQEl === 'function') {
        try { turnIdx = Math.max(0, Number(turnApi.getTurnIndexByQEl(questionEl) || 0) || 0); } catch {}
      }
      if (!turnIdx && questionId && typeof turnApi?.getTurnIndexByQId === 'function') {
        try { turnIdx = Math.max(0, Number(turnApi.getTurnIndexByQId(questionId) || 0) || 0); } catch {}
      }
    }

    const keys = [];
    const pushKey = (rawKey) => {
      const key = String(rawKey || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    };
    pushKey(questionId ? `id:${questionId}` : '');
    pushKey(stableQuestionId ? `id:${stableQuestionId}` : '');
    pushKey(turnId ? `id:${turnId}` : '');
    if (turnIdx > 0) {
      pushKey(`ord:${questionWashScopeKey()}:${turnIdx}`);
    }

    let entry = null;
    let matchedKey = '';
    for (const key of keys) {
      if (!store[key]) continue;
      entry = store[key];
      matchedKey = key;
      break;
    }

    const colorName = normalizeQuestionWashColorId(entry?.colorId);
    const liveBg = colorName ? '' : resolveQuestionWashColorFromElement(questionEl);
    const bg = colorName ? (COLOR_BY_NAME[colorName] || null) : (liveBg || null);
    return {
      matchedKey,
      questionId,
      stableQuestionId,
      turnId,
      turnIdx,
      colorName: colorName || null,
      bg,
    };
  }

  function clearQuestionWashMiniRing(btnEl) {
    if (!btnEl) return false;
    const num = btnEl.querySelector?.('.cgxui-mm-num') || null;
    if (!num) return false;
    try { num.classList.remove('cgxq-qwash-mm-num-on'); } catch {}
    try {
      num.style.removeProperty('--cgxq-qwash-mm-ring');
      num.style.removeProperty('--cgxq-qwash-mm-fill');
      num.style.removeProperty('display');
      num.style.removeProperty('align-items');
      num.style.removeProperty('justify-content');
      num.style.removeProperty('min-width');
      num.style.removeProperty('height');
      num.style.removeProperty('padding');
      num.style.removeProperty('box-sizing');
      num.style.removeProperty('line-height');
      num.style.removeProperty('border-radius');
      num.style.removeProperty('border');
      num.style.removeProperty('background');
      num.style.removeProperty('color');
      num.style.removeProperty('box-shadow');
    } catch {}
    return true;
  }

  function clearMiniBtnWashVisual(btnEl) {
    if (!btnEl) return false;
    try { delete btnEl.dataset.wash; } catch {}
    try { btnEl.removeAttribute('data-cgxui-wash'); } catch {}
    try {
      btnEl.style.removeProperty('background');
      btnEl.style.removeProperty('color');
      btnEl.style.removeProperty('text-shadow');
      btnEl.style.removeProperty('box-shadow');
      btnEl.style.removeProperty('--cgxui-mnmp-q-wash-color');
    } catch {}
    try {
      for (const cls of Array.from(btnEl.classList || [])) {
        if (!cls) continue;
        if (cls.startsWith('cgxui-mnmp-wash-') || cls.startsWith('cgxui-wash-')) {
          btnEl.classList.remove(cls);
        }
      }
    } catch {}
    return true;
  }

  function applyQaWashToQuestionBtn(primaryAId, qBtn) {
    if (!qBtn) return false;
    const wash = resolveQuestionBtnWashState(primaryAId, qBtn);
    clearMiniBtnWashVisual(qBtn);
    if (!wash.bg) return false;
    qBtn.dataset.wash = 'true';
    try { qBtn.setAttribute('data-cgxui-wash', '1'); } catch {}
    try { qBtn.style.setProperty('--cgxui-mnmp-q-wash-color', wash.bg); } catch {}
    return true;
  }

  function fallbackApplyWashToMiniBtn(primaryAId, btnEl) {
    if (!btnEl) return false;
    const wash = resolveMiniBtnWashState(primaryAId, btnEl);
    if (!wash.id) return false;

    const { bg, isGold, paintBg, text } = wash;
    if (bg) {
      btnEl.style.background = `linear-gradient(145deg, rgba(255,255,255,0.06), rgba(0,0,0,0.10)), ${paintBg}`;
      btnEl.style.color = text;
      btnEl.style.textShadow = (text === '#fff')
        ? '0 0 2px rgba(0,0,0,.35)'
        : '0 1px 0 rgba(255,255,255,.35)';
      btnEl.style.boxShadow = isGold
        ? '0 0 5px 1px rgba(255,215,0,0.30)'
        : `0 0 6px 2px ${bg}40`;
      btnEl.dataset.wash = 'true';
      try { btnEl.setAttribute('data-cgxui-wash', '1'); } catch {}
    } else {
      btnEl.style.background = 'rgba(255,255,255,.06)';
      btnEl.style.color = '#e5e7eb';
      btnEl.style.textShadow = '0 0 2px rgba(0,0,0,.25)';
      btnEl.style.boxShadow = 'none';
      btnEl.dataset.wash = 'false';
      try { btnEl.removeAttribute('data-cgxui-wash'); } catch {}
    }
    return true;
  }

  function applyWashToMiniBtn(primaryAId, btnEl) {
    const id = String(
      primaryAId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!btnEl || !id) return false;

    try {
      const sharedApply = TOPW.H2O_MM_SHARED?.get?.()?.util?.mmApplyWashToBtn;
      if (typeof sharedApply === 'function') {
        const arity = Number(sharedApply.length || 0);
        if (arity >= 3) {
          sharedApply(id, btnEl, fallbackApplyWashToMiniBtn);
          return true;
        }
        const out = sharedApply(id, btnEl);
        if (out === false) return !!fallbackApplyWashToMiniBtn(id, btnEl);
        if (out == null) {
          try { fallbackApplyWashToMiniBtn(id, btnEl); } catch {}
        }
        return true;
      }
    } catch {}

    try {
      const washApi = W?.H2O?.MM?.wash;
      if (washApi && typeof washApi.applyToMiniBtn === 'function') {
        washApi.applyToMiniBtn(id, btnEl);
        return true;
      }
    } catch {}

    return !!fallbackApplyWashToMiniBtn(id, btnEl);
  }

  function collectMiniBtns() {
    const out = [];
    const seen = new Set();

    try {
      const map = ensureMapStore();
      for (const btn of map.values()) {
        if (!btn || !btn.isConnected || seen.has(btn)) continue;
        seen.add(btn);
        out.push(btn);
      }
    } catch {}
    if (out.length) return out;

    let scanRoot = null;
    try { scanRoot = minimapCol(MM_uiRefs()?.panel || null) || null; } catch {}
    if (!scanRoot) {
      try {
        const panel = minimapPanel();
        scanRoot = minimapCol(panel) || panel || null;
      } catch {}
    }
    if (!scanRoot) scanRoot = document;
    markPerfFullScan();
    for (const btn of qq(mmBtnSelector(), scanRoot)) {
      if (!btn || seen.has(btn)) continue;
      seen.add(btn);
      out.push(btn);
    }
    return out;
  }

  function washEventSig(detail) {
    const all = detail?.all === true || detail?.full === true;
    const color = String(detail?.colorName ?? detail?.color ?? '').trim();
    if (all) return `all|${color}`;
    const ids = extractWashEventIds(detail).sort();
    if (!ids.length && !color) return '';
    return `${ids.join(',')}|${color}`;
  }

  function repaintMiniBtnByAnswerId(anyId, btnEl = null) {
    const key = String(
      anyId ||
      btnEl?.dataset?.primaryAId ||
      btnEl?.dataset?.id ||
      btnEl?.dataset?.turnId ||
      ''
    ).trim();
    if (!key) return false;
    const btn = btnEl || getBtnById(key);
    if (!btn) return false;
    const primaryAId = String(btn?.dataset?.primaryAId || key).trim();
    if (!primaryAId) return false;
    const wrap = getWrapForMiniBtn(btn);
    const qBtn = getQuestionBtnForWrap(wrap);

    if (isQaViewActive()) {
      clearMiniBtnWashVisual(btn);
      clearQuestionWashMiniRing(btn);
      applyWashToMiniBtn(primaryAId, btn);
      applyQaWashToQuestionBtn(primaryAId, qBtn);
      return true;
    }

    clearMiniBtnWashVisual(qBtn);
    return !!applyWashToMiniBtn(primaryAId, btn);
  }

  function repaintAllMiniBtns() {
    let painted = 0;
    for (const btn of collectMiniBtns()) {
      const id = String(
        btn?.dataset?.primaryAId ||
        btn?.dataset?.id ||
        btn?.dataset?.turnId ||
        ''
      ).trim();
      if (!id) continue;
      if (repaintMiniBtnByAnswerId(id, btn)) painted += 1;
    }
    return painted;
  }

  function extractWashEventIds(detail) {
    const ids = new Set();
    const push = (v) => {
      const s = String(v || '').trim();
      if (s) ids.add(s);
    };
    push(detail?.primaryAId);
    push(detail?.answerId);
    push(detail?.id);
    push(detail?.turnId);
    const buckets = [detail?.primaryAIds, detail?.answerIds, detail?.ids, detail?.turnIds];
    for (const arr of buckets) {
      if (!Array.isArray(arr)) continue;
      for (const v of arr) push(v);
    }
    return Array.from(ids);
  }

  function flushWashRepaintQueue() {
    S.washRepaintRaf = 0;
    const repaintAll = !!S.washRepaintAll;
    S.washRepaintAll = false;
    const ids = Array.from(S.washRepaintQueue.values());
    S.washRepaintQueue.clear();

    if (repaintAll || !ids.length) {
      repaintAllMiniBtns();
      try {
        const activeBtn = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
        const activeId = String(activeBtn?.dataset?.turnId || activeBtn?.dataset?.primaryAId || '').trim();
        if (activeId) updateToggleColor(activeId);
      } catch {}
      return true;
    }

    for (const id of ids) {
      try { repaintMiniBtnByAnswerId(id); } catch {}
    }
    try { updateToggleColor(ids[0] || ''); } catch {}
    return true;
  }

  function scheduleWashRepaint(ids = null) {
    if (ids == null) S.washRepaintAll = true;
    else if (Array.isArray(ids)) {
      for (const raw of ids) {
        const id = String(raw || '').trim();
        if (id) S.washRepaintQueue.add(id);
      }
      if (!S.washRepaintQueue.size) S.washRepaintAll = true;
    } else {
      const id = String(ids || '').trim();
      if (id) S.washRepaintQueue.add(id);
      else S.washRepaintAll = true;
    }
    if (S.washRepaintRaf) return true;
    S.washRepaintRaf = requestAnimationFrame(flushWashRepaintQueue);
    return true;
  }

  function bindWashBridge() {
    if (S.washBridgeBound) return true;

    const onWashChanged = (ev) => {
      const detail = ev?.detail || {};
      const sig = washEventSig(detail);
      if (sig) {
        const now = performance.now();
        if (sig === S.washBridgeLastSig && (now - S.washBridgeLastTs) < 45) return;
        S.washBridgeLastSig = sig;
        S.washBridgeLastTs = now;
      }
      if (detail?.all === true || detail?.full === true) {
        scheduleWashRepaint();
        return;
      }
      const ids = extractWashEventIds(detail);
      if (ids.length) scheduleWashRepaint(ids);
      else scheduleWashRepaint();
    };

    for (const evtName of EV_WASH_CHANGED) {
      window.addEventListener(evtName, onWashChanged);
    }

    S.washBridgeOff = () => {
      for (const evtName of EV_WASH_CHANGED) {
        try { window.removeEventListener(evtName, onWashChanged); } catch {}
      }
      if (S.washRepaintRaf) {
        try { cancelAnimationFrame(S.washRepaintRaf); } catch {}
      }
      S.washRepaintRaf = 0;
      S.washRepaintAll = false;
      S.washRepaintQueue.clear();
      S.washBridgeLastSig = '';
      S.washBridgeLastTs = 0;
    };
    S.washBridgeBound = true;
    return true;
  }

  function unbindWashBridge() {
    try { S.washBridgeOff?.(); } catch {}
    S.washBridgeOff = null;
    S.washBridgeBound = false;
  }

  function bindViewBridge() {
    if (S.viewBridgeBound) return true;

    const onViewChanged = () => {
      try { syncCurrentViewArtifacts(true); } catch {}
      scheduleWashRepaint();
    };

    window.addEventListener(EV_VIEW_CHANGED, onViewChanged);
    if (EV_VIEW_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_VIEW_CHANGED.slice(4), onViewChanged);
    }

    S.viewBridgeOff = () => {
      try { window.removeEventListener(EV_VIEW_CHANGED, onViewChanged); } catch {}
      if (EV_VIEW_CHANGED.startsWith('evt:')) {
        try { window.removeEventListener(EV_VIEW_CHANGED.slice(4), onViewChanged); } catch {}
      }
    };
    S.viewBridgeBound = true;
    return true;
  }

  function unbindViewBridge() {
    try { S.viewBridgeOff?.(); } catch {}
    S.viewBridgeOff = null;
    S.viewBridgeBound = false;
  }

  function getUiRefs() {
    try {
      return MM_uiRefs();
    } catch {
      return {};
    }
  }

  function safeDiag(kind, msg, extra) {
    try { TOPW.H2O_MM_DIAG?.[kind]?.(msg, extra); } catch {}
  }

  function counterEl() {
    const refs = getUiRefs();
    if (refs.counter && refs.counter.isConnected) return refs.counter;
    return q('[data-cgxui$="counter"]');
  }

  function toggleEl() {
    const { SEL } = getRegs();
    const refs = getUiRefs();
    return refs.toggle || q(SEL.MM_TOGGLE || '') || q('[data-cgxui$="toggle"]');
  }

  function toggleCountEl() {
    const { SEL } = getRegs();
    const tg = toggleEl();
    return tg?.querySelector?.(SEL.MM_BTN_COUNT || SEL.MM_TOGGLE_COUNT || '.cgxui-mm-count')
      || q(SEL.MM_TOGGLE_COUNT || '')
      || q('.cgxui-mm-count')
      || tg?.querySelector?.('[data-cgxui$="count"]')
      || null;
  }

  function getMiniMapScroller(btn = null) {
    const refs = getUiRefs();
    const panel = refs.panel || minimapPanel();
    const col = refs.col || minimapCol(panel);
    const candidates = [col, panel];

    if (btn?.closest) {
      const wrap = btn.closest('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"]');
      if (wrap) candidates.push(wrap.parentElement);
    }
    if (panel) {
      candidates.push(...qq('*', panel).slice(0, 24));
    }

    const seen = new Set();
    for (const el of candidates) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      try {
        const cs = getComputedStyle(el);
        if (el.scrollHeight > el.clientHeight && cs.overflowY !== 'visible') return el;
      } catch {}
    }

    let p = panel?.parentElement || null;
    let guard = 0;
    while (p && guard < 6) {
      guard += 1;
      try {
        const cs = getComputedStyle(p);
        if (p.scrollHeight > p.clientHeight && cs.overflowY !== 'visible') return p;
      } catch {}
      p = p.parentElement;
    }
    return panel || col || null;
  }

  function centerMiniMapNode(node, { smooth = true } = {}) {
    if (!node) return false;

    const scroller = getMiniMapScroller(node);
    if (scroller?.scrollTo) {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const nodeTop = node.getBoundingClientRect().top;
      const current = scroller.scrollTop || 0;
      const delta = (nodeTop - scrollerTop) - (scroller.clientHeight / 2 - node.clientHeight / 2);
      scroller.scrollTo({
        top: Math.max(0, current + delta),
        behavior: smooth ? 'smooth' : 'auto',
      });
      return true;
    }

    try {
      node.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
      return true;
    } catch {
      return false;
    }
  }

  function getAnswerEls() {
    const { SEL } = getRegs();
    const primary = qq(SEL.ANSWER || '');
    if (primary.length) return primary;
    const a = qq('article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]');
    if (a.length) return a;
    const b = qq('[data-message-author-role="assistant"]');
    if (b.length) return b;
    return qq('[data-testid="conversation-turn"] [data-message-author-role="assistant"]');
  }

  function pickAssistantMessageEl(node) {
    if (!node || node.nodeType !== 1) return null;
    const role = String(node.getAttribute?.('data-message-author-role') || '').toLowerCase();
    if (role === 'assistant') return node;
    try {
      const nested = node.querySelector?.('[data-message-author-role="assistant"]');
      if (nested) return nested;
    } catch {}
    try {
      const up = node.closest?.('[data-message-author-role="assistant"]');
      if (up) return up;
    } catch {}
    return null;
  }

  function getMessageId(el) {
    try {
      const viaFn = W.getMessageId?.(el);
      if (viaFn) return String(viaFn);
    } catch {}

    const raw = (
      el?.getAttribute?.('data-message-id') ||
      el?.dataset?.messageId ||
      el?.getAttribute?.('data-cgxui-id') ||
      el?.getAttribute?.('data-h2o-ans-id') ||
      el?.dataset?.h2oAnsId ||
      ''
    );
    if (raw) return String(raw);

    const gen = `a_${Math.random().toString(36).slice(2)}`;
    try { el?.setAttribute?.('data-h2o-core-id', gen); } catch {}
    return gen;
  }

  function parseTurnId(el, idx, aId) {
    const raw = (
      el?.getAttribute?.('data-turn-id') ||
      el?.dataset?.turnId ||
      el?.getAttribute?.('data-cgx-turn-id') ||
      ''
    );
    if (raw) return String(raw).trim();
    if (aId) return `turn:${aId}`;
    return `turn:${idx}`;
  }

  function resolveChatId() {
    const fromUtil = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromUtil) return fromUtil;
    const m = String(location.pathname || '').match(/\/(?:c|chat)\/([a-z0-9-]+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function safeChatKeyPart(chatId = '') {
    return String(chatId || '').trim().replace(/[^a-z0-9_-]/gi, '_');
  }

  function nsDisk() {
    const { SH } = getRegs();
    try {
      const ns = SH?.util?.ns;
      if (ns && typeof ns.disk === 'function') return ns.disk('prm', 'cgx', 'mnmp');
    } catch {}
    return String(SH?.NS_DISK || 'h2o:prm:cgx:mnmp');
  }

  function keyTurnCacheMeta(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_TURN_CACHE_META_SUFFIX}:${safeId}:v1`;
  }

  function keyTurnCacheTurns(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_TURN_CACHE_TURNS_SUFFIX}:${safeId}:v1`;
  }

  function keyCustomDividers(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_CUSTOM_DIVIDERS_SUFFIX}:${safeId}:v1`;
  }

  function makeMiniDividerId() {
    return `divider:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  }

  function clampMiniDividerRatio(value, fallback = 0.5) {
    const ratio = Number(value);
    if (!Number.isFinite(ratio)) return fallback;
    return Math.min(1, Math.max(0, ratio));
  }

  function normalizeMiniDividerStyle(raw) {
    const style = String(raw || '').trim().toLowerCase();
    return style === 'dashed' || style === 'dotted' ? style : 'solid';
  }

  function normalizeMiniDividerColor(raw, fallback = MINI_DIVIDER_DEFAULT_COLOR) {
    const value = String(raw || '').trim().toLowerCase();
    if (/^#?[0-9a-f]{3}$/i.test(value)) {
      const hex = value.replace(/^#/, '');
      return `#${hex.split('').map((ch) => ch + ch).join('')}`;
    }
    if (/^#?[0-9a-f]{6}$/i.test(value)) {
      return `#${value.replace(/^#/, '')}`;
    }
    return String(fallback || MINI_DIVIDER_DEFAULT_COLOR).trim().toLowerCase();
  }

  function normalizeMiniDividerRecord(raw, fallbackYRatio = null, chatId = '') {
    const rawRatio = raw?.yRatio ?? raw?.ratio ?? raw?.y ?? fallbackYRatio;
    const hasRatio = Number.isFinite(Number(rawRatio));
    const gapId = String(raw?.gapId || raw?.anchorId || raw?.gap || '').trim();
    const rawSlot =
      raw?.afterTurnIndex ??
      raw?.position ??
      raw?.after ??
      0;
    const slot = Math.max(0, Number(rawSlot) || 0);
    if (!hasRatio && !slot && !gapId) return null;
    const resolvedChatId = String(chatId || raw?.chatId || resolveChatId() || '').trim();
    return {
      id: String(raw?.id || raw?.dividerId || '').trim() || makeMiniDividerId(),
      chatId: resolvedChatId,
      gapId,
      yRatio: hasRatio ? clampMiniDividerRatio(rawRatio) : null,
      afterTurnIndex: slot,
      style: normalizeMiniDividerStyle(raw?.style || raw?.lineStyle || raw?.type || ''),
      color: normalizeMiniDividerColor(raw?.color || raw?.lineColor || raw?.hex || ''),
    };
  }

  function normalizeMiniDividerList(records, chatId = '') {
    const src = Array.isArray(records) ? records : [];
    const byId = new Map();
    for (let i = 0; i < src.length; i += 1) {
      const item = normalizeMiniDividerRecord(src[i], null, chatId);
      if (!item) continue;
      byId.set(String(item.id || '').trim(), item);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const aRatio = Number.isFinite(Number(a?.yRatio)) ? Number(a.yRatio) : Infinity;
      const bRatio = Number.isFinite(Number(b?.yRatio)) ? Number(b.yRatio) : Infinity;
      if (aRatio !== bRatio) return aRatio - bRatio;
      const aSlot = Number(a?.afterTurnIndex || 0);
      const bSlot = Number(b?.afterTurnIndex || 0);
      if (aSlot !== bSlot) return aSlot - bSlot;
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
  }

  function loadMiniDividers(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return [];
    const key = keyCustomDividers(id);
    if (!key) return [];
    return normalizeMiniDividerList(storageGetJSON(key, []), id);
  }

  function saveMiniDividers(chatId = '', items = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    const key = keyCustomDividers(id);
    if (!key) return { ok: false, status: 'key-missing', chatId: id, items: [] };
    const nextItems = normalizeMiniDividerList(items, id);
    const ok = storageSetJSON(key, nextItems);
    return {
      ok,
      status: ok ? 'ok' : 'storage-failed',
      chatId: id,
      items: nextItems,
    };
  }

  function getMiniDividers(chatId = '') {
    return loadMiniDividers(chatId);
  }

  function getMiniDividerById(dividerId, chatId = '') {
    const id = String(dividerId || '').trim();
    if (!id) return null;
    return loadMiniDividers(chatId).find((item) => String(item?.id || '').trim() === id) || null;
  }

  function getMiniDividerByAfterTurn(afterTurnIndex, chatId = '') {
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!slot) return null;
    const list = loadMiniDividers(chatId);
    return list.find((item) => Number(item?.afterTurnIndex || 0) === slot) || null;
  }

  function getSelectedMiniDividerId() {
    return String(S.selectedMiniDividerId || '').trim();
  }

  function emitMiniDividerChanged(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || resolveChatId() || '').trim(),
      dividerId: String(detail?.dividerId || '').trim(),
      action: String(detail?.action || 'update').trim(),
      source: String(detail?.source || 'core').trim(),
      item: detail?.item || null,
      items: Array.isArray(detail?.items) ? detail.items.slice() : undefined,
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_DIVIDER_CHANGED, { detail: out })); } catch {}
    return out;
  }

  function emitMiniDividerSelected(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || resolveChatId() || '').trim(),
      dividerId: String(detail?.dividerId || '').trim(),
      source: String(detail?.source || 'core').trim(),
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_DIVIDER_SELECTED, { detail: out })); } catch {}
    return out;
  }

  function setSelectedMiniDividerId(dividerId = '', opts = {}) {
    const nextId = String(dividerId || '').trim();
    const prevId = String(S.selectedMiniDividerId || '').trim();
    S.selectedMiniDividerId = nextId;
    if (opts.render !== false) {
      try { renderMiniDividerOverlay(String(opts.chatId || resolveChatId() || '').trim()); } catch {}
    }
    if (opts.emit !== false && nextId !== prevId) {
      emitMiniDividerSelected({
        chatId: String(opts.chatId || resolveChatId() || '').trim(),
        dividerId: nextId,
        source: String(opts.source || 'core').trim(),
      });
    }
    return nextId;
  }

  function selectMiniDivider(dividerId = '', chatId = '', source = 'core') {
    const item = getMiniDividerById(dividerId, chatId);
    const nextId = String(item?.id || '').trim();
    setSelectedMiniDividerId(nextId, {
      chatId: String(chatId || resolveChatId() || '').trim(),
      source,
      render: true,
      emit: true,
    });
    return item || null;
  }

  function upsertMiniDivider(record = {}, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const existing = getMiniDividerById(record?.id || record?.dividerId || '', id);
    const merged = Object.assign({}, existing || {}, record || {});
    const item = normalizeMiniDividerRecord(merged, existing?.yRatio ?? null, id);
    if (!item) return { ok: false, status: 'position-missing', chatId: id, item: null, items: [] };
    const list = loadMiniDividers(id).filter((entry) => String(entry?.id || '').trim() !== item.id);
    list.push(item);
    const saved = saveMiniDividers(id, list);
    if (saved.ok) {
      setSelectedMiniDividerId(item.id, { chatId: id, source: 'core:update', render: false, emit: true });
      try { renderMiniDividerOverlay(id); } catch {}
      emitMiniDividerChanged({
        chatId: id,
        dividerId: item.id,
        action: existing ? 'update' : 'create',
        source: 'core:update',
        item,
        items: saved.items,
      });
    }
    return Object.assign({}, saved, { item });
  }

  function createMiniDivider(record = {}, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const model = getMiniDividerGapModel();
    const defaultGap = getDefaultMiniDividerGap(model);
    const seed = Object.assign({
      gapId: String(defaultGap?.id || '').trim(),
      yRatio: Number.isFinite(Number(defaultGap?.ratio)) ? Number(defaultGap.ratio) : null,
      style: 'solid',
      color: MINI_DIVIDER_DEFAULT_COLOR,
    }, record || {});
    const hasPlacement =
      String(seed?.gapId || '').trim() ||
      Number.isFinite(Number(seed?.yRatio)) ||
      Math.max(0, Number(seed?.afterTurnIndex || 0) || 0);
    if (!hasPlacement) {
      return { ok: false, status: 'gap-missing', chatId: id, item: null, items: loadMiniDividers(id) };
    }
    return upsertMiniDivider(seed, id);
  }

  function removeMiniDividerById(dividerId, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const dividerKey = String(dividerId || '').trim();
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    if (!dividerKey) return { ok: false, status: 'divider-id-missing', chatId: id, items: loadMiniDividers(id) };
    const list = loadMiniDividers(id).filter((entry) => String(entry?.id || '').trim() !== dividerKey);
    const saved = saveMiniDividers(id, list);
    if (saved.ok) {
      if (String(S.selectedMiniDividerId || '').trim() === dividerKey) {
        setSelectedMiniDividerId('', { chatId: id, source: 'core:remove', render: false, emit: true });
      }
      try { renderMiniDividerOverlay(id); } catch {}
      emitMiniDividerChanged({
        chatId: id,
        dividerId: dividerKey,
        action: 'remove',
        source: 'core:remove',
        items: saved.items,
      });
    }
    return saved;
  }

  function removeMiniDividerByAfterTurn(afterTurnIndex, chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!id) return { ok: false, status: 'chat-id-missing', chatId: '', items: [] };
    if (!slot) return { ok: false, status: 'position-missing', chatId: id, items: loadMiniDividers(id) };
    const match = getMiniDividerByAfterTurn(slot, id);
    if (!match?.id) return { ok: false, status: 'divider-missing', chatId: id, items: loadMiniDividers(id) };
    return removeMiniDividerById(match.id, id);
  }

  function normalizeCacheTurnRow(raw, fallbackIdx = 0) {
    const i = Math.max(1, Number(raw?.idx || raw?.index || fallbackIdx || 1) || 1);
    const answerId = String(raw?.answerId || raw?.primaryAId || raw?.aId || '').trim();
    const turnId = String(raw?.turnId || raw?.id || (answerId ? `turn:a:${answerId}` : `turn:${i}`)).trim();
    if (!turnId) return null;
    return {
      idx: i,
      turnId,
      answerId,
      primaryAId: answerId,
    };
  }

  function normalizeCacheTurnRows(rows) {
    const src = Array.isArray(rows) ? rows : [];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < src.length; i += 1) {
      const row = normalizeCacheTurnRow(src[i], i + 1);
      if (!row) continue;
      const key = String(row.answerId || row.turnId || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      row.idx = out.length + 1;
      out.push(row);
    }
    return out;
  }

  function enrichCacheTurnRowsFromPagination(rows) {
    const base = normalizeCacheTurnRows(rows);
    if (!base.length) return base;

    const canonical = getCanonicalTurnsFromPagination();
    const canonicalList = Array.isArray(canonical?.list) ? canonical.list : [];
    if (!canonicalList.length) return base;

    const canonicalByTurnId = new Map();
    const canonicalByAnswerId = new Map();
    for (const turn of canonicalList) {
      const turnId = String(turn?.turnId || '').trim();
      const answerId = normalizePaginationAnswerId(turn?.answerId || turn?.primaryAId || '');
      if (turnId) canonicalByTurnId.set(turnId, turn);
      if (answerId) canonicalByAnswerId.set(answerId, turn);
    }

    return base.map((row, idx) => {
      const answerId = normalizePaginationAnswerId(row?.answerId || row?.primaryAId || row?.aId || '');
      const turnId = String(row?.turnId || row?.id || '').trim();
      const canonicalTurn =
        canonicalByTurnId.get(turnId)
        || (answerId ? canonicalByAnswerId.get(answerId) : null)
        || canonicalList[idx]
        || null;
      if (!canonicalTurn) return row;

      const nextAnswerId = normalizePaginationAnswerId(canonicalTurn?.answerId || canonicalTurn?.primaryAId || answerId);
      const nextTurnId = String(canonicalTurn?.turnId || turnId || '').trim();

      return {
        ...row,
        idx: Math.max(1, Number(row?.idx || row?.index || idx + 1) || idx + 1),
        turnId: nextTurnId || turnId,
        answerId: nextAnswerId || answerId,
        primaryAId: nextAnswerId || answerId,
      };
    });
  }

  function minimapPanel() {
    const { SEL } = getRegs();
    try {
      const { panel: refsPanel } = MM_uiRefs();
      if (refsPanel && refsPanel.isConnected) return refsPanel;
    } catch {}
    const all = [
      ...qq(SEL.MINIMAP || ''),
      ...qq(SEL.PANEL || ''),
      ...qq('[data-cgxui$="minimap"]'),
    ].filter((el) => el && el.isConnected);
    if (!all.length) return null;
    return all[all.length - 1] || null;
  }

  function minimapCol(panelEl = null) {
    const { SEL } = getRegs();
    const root = panelEl && panelEl.querySelector ? panelEl : document;
    return q(SEL.MM_COL, root) ||
      q(`[data-cgxui="${UI_TOK.COL}"][data-cgxui-owner="${UI_TOK.OWNER}"]`, root) ||
      q(`[data-cgxui="${UI_TOK.COL_LEGACY}"][data-cgxui-owner="${UI_TOK.OWNER}"]`, root) ||
      q('.cgxui-mm-col', root);
  }

  function ensureCol() {
    let panel = minimapPanel();
    if (!panel) {
      try {
        panel = MM_ui()?.ensureUI?.('core:ensure-col')?.panel || minimapPanel();
      } catch {}
    }
    if (!panel) return null;

    let col = minimapCol(panel);
    if (col) return col;

    col = document.createElement('div');
    col.className = 'cgxui-mm-col';
    col.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    col.setAttribute('data-cgxui', UI_TOK.COL);
    panel.appendChild(col);
    return col;
  }

  function ensureMapStore() {
    if (S.mapButtons instanceof Map) return S.mapButtons;
    const m =
      (W.H2O_MM_mapButtons instanceof Map) ? W.H2O_MM_mapButtons :
      (W.mapButtons instanceof Map) ? W.mapButtons :
      new Map();
    return setMapStore(m);
  }

  function setMapStore(nextMap) {
    const m = (nextMap instanceof Map) ? nextMap : new Map();
    S.mapButtons = m;
    try { W.H2O_MM_mapButtons = m; } catch {}
    try { W.mapButtons = m; } catch {}
    return m;
  }

  function mmIdxNow() {
    const now = Date.now();
    return Number.isFinite(now) ? now : 0;
  }

  // Compatibility shim: keep shell/engine contracts stable while mm_index persistence is removed from Core.
  function mmIdxEmitHydrated(detail = {}) {
    const out = {
      chatId: String(detail?.chatId || '').trim(),
      source: String(detail?.source || 'core'),
      status: String(detail?.status || 'noop'),
      turnCount: Number(detail?.turnCount || 0),
      renderedCount: Number(detail?.renderedCount || 0),
      ts: Number(detail?.ts || mmIdxNow()),
    };
    try { window.dispatchEvent(new CustomEvent(EV_MM_INDEX_HYDRATED, { detail: out })); } catch {}
    return out;
  }

  function hydrateIndexFromDisk(chatId = '', opts = {}) {
    const detail = mmIdxEmitHydrated({
      chatId: String(chatId || '').trim(),
      source: String(opts?.source || 'core'),
      status: 'noop',
      turnCount: 0,
      renderedCount: 0,
    });
    return { ok: false, status: 'noop', detail };
  }

  function renderFromIndex(chatId = '', _idxObj = null, opts = {}) {
    return hydrateIndexFromDisk(chatId, opts);
  }

  function loadTurnCache(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return null;
    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return null;

    const turns = enrichCacheTurnRowsFromPagination(storageGetJSON(turnsKey, null));
    if (!turns.length) return null;

    const last = turns[turns.length - 1] || null;
    const rawMeta = storageGetJSON(metaKey, null);
    const meta = {
      chatId: id,
      turnCount: turns.length,
      lastTurnId: String(rawMeta?.lastTurnId || last?.turnId || '').trim(),
      updatedAt: Number(rawMeta?.updatedAt || 0) || mmIdxNow(),
    };
    const lastActiveTurnId = String(rawMeta?.lastActiveTurnId || '').trim();
    const lastActiveAnswerId = String(rawMeta?.lastActiveAnswerId || '').trim();
    if (lastActiveTurnId) meta.lastActiveTurnId = lastActiveTurnId;
    if (lastActiveAnswerId) meta.lastActiveAnswerId = lastActiveAnswerId;

    return { meta, turns };
  }

  function clearTurnCache(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing' };

    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return { ok: false, status: 'key-missing' };

    const okTurns = storageRemove(turnsKey);
    const okMeta = storageRemove(metaKey);
    return {
      ok: !!(okTurns && okMeta),
      status: (okTurns && okMeta) ? 'ok' : 'remove-failed',
      chatId: id,
    };
  }

  function saveTurnCache(chatId = '', turns = []) {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, status: 'chat-id-missing' };

    const turnsKey = keyTurnCacheTurns(id);
    const metaKey = keyTurnCacheMeta(id);
    if (!turnsKey || !metaKey) return { ok: false, status: 'key-missing' };

    const rows = enrichCacheTurnRowsFromPagination(turns);
    if (!rows.length) return { ok: false, status: 'turns-empty', turnsCount: 0 };

    const last = rows[rows.length - 1] || null;
    const activeTurnId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
    const activeTurn = activeTurnId ? findTurnByAnyId(activeTurnId) : null;
    const activeAnswerId = String(activeTurn?.answerId || '').trim();
    const meta = {
      chatId: id,
      turnCount: rows.length,
      lastTurnId: String(last?.turnId || '').trim(),
      updatedAt: mmIdxNow(),
    };
    if (activeTurnId) meta.lastActiveTurnId = activeTurnId;
    if (activeAnswerId) meta.lastActiveAnswerId = activeAnswerId;

    const okTurns = storageSetJSON(turnsKey, rows);
    const okMeta = storageSetJSON(metaKey, meta);
    const ok = !!(okTurns && okMeta);
    return {
      ok,
      status: ok ? 'ok' : 'storage-failed',
      meta,
      turnsCount: rows.length,
    };
  }

  function renderFromCache(chatId = '') {
    const id = String(chatId || resolveChatId()).trim();
    if (!id) return { ok: false, renderedCount: 0, status: 'chat-id-missing' };

    const cached = loadTurnCache(id);
    if (!cached || !Array.isArray(cached.turns) || !cached.turns.length) {
      mmIdxEmitHydrated({
        chatId: id,
        source: 'cache',
        status: 'cache-miss',
        turnCount: 0,
        renderedCount: 0,
      });
      return { ok: false, renderedCount: 0, status: 'cache-miss', chatId: id, lastTurnId: '', lastAnswerId: '' };
    }

    const ensured = ensureUiRefsForRebuild('cache-render');
    if (!ensured.ready) {
      return { ok: false, renderedCount: 0, status: 'ui-missing', chatId: id, lastTurnId: '', lastAnswerId: '' };
    }

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    for (const row of cached.turns) {
      const turnId = String(row?.turnId || '').trim();
      if (!turnId) continue;
      const answerId = String(row?.primaryAId || row?.answerId || '').trim();
      const idx = Math.max(1, Number(row?.idx || 0) || (list.length + 1));
      const turn = { turnId, answerId, index: idx, el: null };
      list.push(turn);
      byId.set(turnId, turn);
      if (answerId) byAId.set(answerId, turnId);
    }

    if (!list.length) {
      return { ok: false, renderedCount: 0, status: 'cache-empty', chatId: id, lastTurnId: '', lastAnswerId: '' };
    }

    S.turnList = list;
    S.turnById = byId;
    S.turnIdByAId = byAId;
    S.answerByTurnId = new Map();
    S.answerEls = [];

    const byIdGlobal =
      (W.H2O_MM_turnById instanceof Map) ? W.H2O_MM_turnById :
      new Map();
    const byAIdGlobal =
      (W.H2O_MM_turnIdByAId instanceof Map) ? W.H2O_MM_turnIdByAId :
      new Map();
    byIdGlobal.clear();
    byAIdGlobal.clear();
    for (const t of list) {
      byIdGlobal.set(t.turnId, t);
      if (t.answerId) byAIdGlobal.set(t.answerId, t.turnId);
    }
    try { W.H2O_MM_turnById = byIdGlobal; } catch {}
    try { W.H2O_MM_turnIdByAId = byAIdGlobal; } catch {}

    const map = ensureTurnButtons(list);
    const renderedCount = Number(list.length || 0);
    const last = cached.turns[cached.turns.length - 1] || null;
    const lastTurnId = String(last?.turnId || '').trim();
    const lastAnswerId = String(last?.primaryAId || last?.answerId || '').trim();
    const paginationCoverage = validateTurnsAgainstPagination(list, { source: 'cache-render' });
    const activeHint = String(
      cached?.meta?.lastActiveTurnId ||
      cached?.meta?.lastActiveAnswerId ||
      S.lastActiveTurnIdFast ||
      cached?.meta?.lastTurnId ||
      lastTurnId ||
      lastAnswerId
    ).trim();
    if (activeHint) {
      try { setActive(activeHint, 'cache-render'); } catch {}
    } else {
      try { updateCounter(''); } catch {}
    }

    mmIdxEmitHydrated({
      chatId: id,
      source: 'cache',
      status: 'cache-hit',
      turnCount: renderedCount,
      renderedCount,
    });
    return {
      ok: !!(map instanceof Map) && renderedCount > 0,
      renderedCount,
      status: renderedCount > 0 ? 'ok' : 'cache-empty',
      chatId: id,
      lastTurnId,
      lastAnswerId,
      paginationCoverage,
    };
  }

  function appendTurnFromAnswerEl(_chatId = '', _answerEl = null, _opts = {}) {
    const chatId = String(_chatId || resolveChatId()).trim();
    const source = String(_opts?.source || 'core:append').trim();
    const rootEl = (_answerEl && _answerEl.nodeType === 1) ? _answerEl : null;
    if (!rootEl) return { ok: false, status: 'noop' };

    const answerEl = pickAssistantMessageEl(rootEl);
    if (!answerEl) return { ok: false, status: 'ignored' };
    if (!answerEl.isConnected) return { ok: false, status: 'stale' };

    const ensured = ensureUiRefsForRebuild('append-turn');
    if (!ensured.ready) return { ok: false, status: 'ui-missing' };

    if (!S.turnList.length) indexTurns();

    const answerId = String(getMessageId(answerEl) || '').trim();
    if (!answerId) return { ok: false, status: 'noop' };
    let turnId = String(S.turnIdByAId.get(answerId) || '').trim();
    if (!turnId) turnId = String(parseTurnId(answerEl, S.turnList.length + 1, answerId) || `turn:a:${answerId}`).trim();
    if (!turnId) return { ok: false, status: 'noop' };

    const existing = findTurnByAnyId(turnId) || findTurnByAnyId(answerId);
    if (existing) {
      const existingTurnId = String(existing.turnId || turnId).trim();
      if (!existingTurnId) return { ok: false, status: 'error' };
      if (!existing.answerId) existing.answerId = answerId;
      existing.el = answerEl;
      S.turnById.set(existingTurnId, existing);
      if (answerId) S.turnIdByAId.set(answerId, existingTurnId);
      S.answerByTurnId.set(existingTurnId, answerEl);
      if (!S.answerEls.length || S.answerEls[S.answerEls.length - 1] !== answerEl) {
        if (!S.answerEls.includes(answerEl)) S.answerEls.push(answerEl);
      }
      const map = ensureMapStore();
      let btn = map.get(existingTurnId) || (answerId ? map.get(answerId) : null) || null;
      if (!btn) {
        const col = ensureCol();
        if (!col) return { ok: false, status: 'ui-missing' };
        const made = createBtn(existing);
        btn = made.btn;
        try { col.appendChild(made.wrap); } catch {}
      }
      if (btn) {
        syncTurnRowDom(btn, existing, { qaEnabled: isQaViewActive() });
        map.set(existingTurnId, btn);
        if (answerId) map.set(answerId, btn);
        const symbolMeta = getMarginSymbolMetaForAnswer(answerId);
        updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });
        repaintMiniBtnByAnswerId(answerId || existingTurnId, btn);
      }
      return {
        ok: true,
        status: 'exists',
        chatId,
        source,
        turnId: existingTurnId,
        answerId,
        idx: Number(existing.index || 0),
      };
    }

    const lastKnownAnswer = S.answerEls[S.answerEls.length - 1] || null;
    if (lastKnownAnswer && lastKnownAnswer.isConnected && lastKnownAnswer !== answerEl) {
      try {
        const rel = lastKnownAnswer.compareDocumentPosition(answerEl);
        const follows = !!(rel & Node.DOCUMENT_POSITION_FOLLOWING);
        if (!follows) {
          return { ok: false, status: 'non-monotonic', chatId, source, turnId, answerId };
        }
      } catch {}
    }

    const nextIdx = Math.max(1, Number(S.turnList.length || 0) + 1);
    const nextTurn = { turnId, answerId, index: nextIdx, el: answerEl };
    S.turnList.push(nextTurn);
    S.turnById.set(turnId, nextTurn);
    if (answerId) S.turnIdByAId.set(answerId, turnId);
    S.answerByTurnId.set(turnId, answerEl);
    S.answerEls.push(answerEl);

    const map = ensureMapStore();
    const col = ensureCol();
    if (!col) return { ok: false, status: 'ui-missing' };
    const made = createBtn(nextTurn);
    const btn = made.btn;
    try { col.appendChild(made.wrap); } catch {}

    syncTurnRowDom(btn, nextTurn, { qaEnabled: isQaViewActive() });

    map.set(turnId, btn);
    if (answerId) map.set(answerId, btn);

    const symbolMeta = getMarginSymbolMetaForAnswer(answerId);
    updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });
    repaintMiniBtnByAnswerId(answerId || turnId, btn);
    try { W.syncMiniMapDot?.(answerId); } catch {}
    try { W.H2O_MM_syncQuoteBadgesForIdx?.(btn, nextIdx); } catch {}
    try {
      if (chatId) saveTurnCache(chatId, S.turnList);
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent(EV_MM_INDEX_APPENDED, {
        detail: {
          chatId,
          source,
          turnId,
          answerId,
          msgId: answerId,
          idx: nextIdx,
        },
      }));
    } catch {}

    return {
      ok: true,
      status: 'appended',
      chatId,
      source,
      turnId,
      answerId,
      idx: nextIdx,
    };
  }

  function attachVisibleAnswers(_chatId = '', root = null) {
    const host = (root && root.querySelectorAll) ? root : document;
    const { SEL } = getRegs();
    const sel = SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]';
    const answers = qq(sel, host);
    if (!answers.length) return { ok: false, status: 'empty', attached: 0 };

    let attached = 0;
    const attachedEls = [];
    for (const el of answers) {
      const aid = String(getMessageId(el) || '').trim();
      if (!aid) continue;
      const turnId = String(S.turnIdByAId.get(aid) || '').trim();
      if (!turnId) continue;
      const turn = S.turnById.get(turnId) || null;
      if (turn) turn.el = el;
      S.answerByTurnId.set(turnId, el);
      attached += 1;
      attachedEls.push(el);
    }
    if (attachedEls.length) S.answerEls = attachedEls;
    return { ok: attached > 0, status: attached > 0 ? 'ok' : 'empty', attached };
  }

  function storageApi() {
    try { return getRegs()?.SH?.util?.storage || null; } catch { return null; }
  }

  function storageGetJSON(key, fallback = null) {
    const k = String(key || '').trim();
    if (!k) return fallback;
    const storage = storageApi();
    if (storage && typeof storage.getJSON === 'function') {
      try {
        const parsed = storage.getJSON(k, fallback);
        return parsed == null ? fallback : parsed;
      } catch {}
    }
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function storageSetJSON(key, val) {
    const k = String(key || '').trim();
    if (!k) return false;
    const storage = storageApi();
    if (storage && typeof storage.setJSON === 'function') {
      try { return !!storage.setJSON(k, val); } catch {}
    }
    try {
      localStorage.setItem(k, JSON.stringify(val));
      return true;
    } catch {
      return false;
    }
  }

  function storageRemove(key) {
    const k = String(key || '').trim();
    if (!k) return false;
    const storage = storageApi();
    if (storage && typeof storage.remove === 'function') {
      try {
        storage.remove(k);
        return true;
      } catch {}
    }
    if (storage && typeof storage.del === 'function') {
      try {
        storage.del(k);
        return true;
      } catch {}
    }
    if (storage && typeof storage.removeItem === 'function') {
      try {
        storage.removeItem(k);
        return true;
      } catch {}
    }
    try {
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  function normalizeSymbols(symbols) {
    if (!Array.isArray(symbols)) return [];
    const out = [];
    for (const sym of symbols) {
      const s = String(sym || '').trim();
      if (s) out.push(s);
    }
    return out;
  }

  function normalizeColors(colors) {
    if (!Array.isArray(colors)) return [];
    return colors.map((c) => String(c || '').trim());
  }

  function collectSymbolEntriesFromBuckets(buckets) {
    const rows = Array.isArray(buckets) ? buckets : [];
    const picked = [];
    let seq = 0;
    for (const b of rows) {
      const items = Array.isArray(b?.items)
        ? b.items
        : ((b?.items && typeof b.items === 'object') ? Object.values(b.items) : []);
      for (const it of items) {
        if (!it || it.type !== 'symbol') continue;
        const sym = String(it?.data?.symbol || '').trim();
        if (!sym) continue;
        const color = String(it?.data?.color || it?.ui?.color || '').trim();
        const ts = Number(it?.ts);
        seq += 1;
        picked.push({
          sym,
          color,
          ts: Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER,
          seq,
        });
      }
    }
    if (!picked.length) return [];
    picked.sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
    return picked.map((x) => ({ symbol: x.sym, color: String(x.color || '').trim() }));
  }

  function collectSymbolsFromBuckets(buckets) {
    return collectSymbolEntriesFromBuckets(buckets).map((x) => x.symbol);
  }

  function collectSymbolColorsFromBuckets(buckets) {
    return collectSymbolEntriesFromBuckets(buckets).map((x) => x.color);
  }

  function marginSymbolsMapKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_SYMBOLS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_SYMBOLS_V1 ||
      KEY_MARGIN_SYMBOLS_FALLBACK;
    return String(key || KEY_MARGIN_SYMBOLS_FALLBACK).trim();
  }

  function marginPinsStoreKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_STATE_PINS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_STATE_PINS_V1 ||
      KEY_MARGIN_PINS_FALLBACK;
    return String(key || KEY_MARGIN_PINS_FALLBACK).trim();
  }

  function marginSymbolColorsMapKey() {
    const key =
      TOPW?.H2O?.MA?.mrgnnchr?.api?.core?.keys?.KEY_MANCHOR_SYMBOL_COLORS_V1 ||
      TOPW?.H2O?.KEYS?.MRGNNCHR_SYMBOL_COLORS_V1 ||
      KEY_MARGIN_SYMBOL_COLORS_FALLBACK;
    return String(key || KEY_MARGIN_SYMBOL_COLORS_FALLBACK).trim();
  }

  function loadMarginSymbolsMap() {
    const map = storageGetJSON(marginSymbolsMapKey(), null);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    return map;
  }

  function loadMarginSymbolColorsMap() {
    const map = storageGetJSON(marginSymbolColorsMapKey(), null);
    if (!map || typeof map !== 'object' || Array.isArray(map)) return null;
    return map;
  }

  function buildMarginSymbolMetaMapFromPinsStore() {
    const store = storageGetJSON(marginPinsStoreKey(), null);
    if (!store || typeof store !== 'object' || Array.isArray(store)) return Object.create(null);
    const out = Object.create(null);
    for (const [answerId, buckets] of Object.entries(store)) {
      const id = String(answerId || '').trim();
      if (!id) continue;
      const bucketList = Array.isArray(buckets)
        ? buckets
        : ((buckets && typeof buckets === 'object') ? Object.values(buckets) : []);
      const symbols = collectSymbolsFromBuckets(bucketList);
      if (!symbols.length) continue;
      const colors = collectSymbolColorsFromBuckets(bucketList);
      out[id] = { symbols, colors };
    }
    return out;
  }

  function getMarginSymbolMetaMap() {
    const symbolsMap = loadMarginSymbolsMap();
    if (symbolsMap) {
      const colorsMap = loadMarginSymbolColorsMap();
      const pinsMetaMap = colorsMap ? null : buildMarginSymbolMetaMapFromPinsStore();
      const colorsSource = colorsMap || Object.create(null);
      const out = Object.create(null);
      for (const [answerId, symbolsRaw] of Object.entries(symbolsMap)) {
        const id = String(answerId || '').trim();
        if (!id) continue;
        const symbols = normalizeSymbols(symbolsRaw);
        if (!symbols.length) continue;
        const colors = normalizeColors(
          colorsSource[id] ?? pinsMetaMap?.[id]?.colors ?? []
        );
        out[id] = { symbols, colors };
      }
      return out;
    }
    return buildMarginSymbolMetaMapFromPinsStore();
  }

  function getMarginSymbolMetaForAnswer(answerId, symbolMetaMap = null) {
    const id = String(answerId || '').trim();
    if (!id) return { symbols: [], colors: [] };
    const map = (symbolMetaMap && typeof symbolMetaMap === 'object' && !Array.isArray(symbolMetaMap))
      ? symbolMetaMap
      : getMarginSymbolMetaMap();
    const raw = map?.[id];
    if (Array.isArray(raw)) return { symbols: normalizeSymbols(raw), colors: [] };
    return {
      symbols: normalizeSymbols(raw?.symbols),
      colors: normalizeColors(raw?.colors),
    };
  }

  function getMarginSymbolsForAnswer(answerId, symbolMetaMap = null) {
    return getMarginSymbolMetaForAnswer(answerId, symbolMetaMap).symbols;
  }

  function ensureMiniMapGutter(btnRow) {
    if (!btnRow || typeof btnRow !== 'object') return null;
    const wrap = btnRow.matches?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap')
      ? btnRow
      : btnRow.closest?.('[data-cgxui="mnmp-wrap"], [data-cgxui="mm-wrap"], .cgxui-mm-wrap');
    if (!wrap) return null;

    let gutter = wrap.querySelector('.cgxui-mm-gutter');
    if (!gutter) {
      gutter = document.createElement('div');
      gutter.className = 'cgxui-mm-gutter';
      wrap.appendChild(gutter);
    }

    let sym = gutter.querySelector('.cgxui-mm-gutterSym');
    if (!sym) {
      sym = document.createElement('span');
      sym.className = 'cgxui-mm-gutterSym';
      gutter.appendChild(sym);
    }
    return { wrap, gutter, sym };
  }

  function updateMiniMapGutterSymbol(btnRow, symbols, opts = null) {
    const mounted = ensureMiniMapGutter(btnRow);
    if (!mounted) return false;

    const first = normalizeSymbols(symbols)[0] || '';
    const color = String(opts?.color || '').trim();

    const maApi = TOPW?.H2O?.MA?.mrgnnchr?.api?.core;

    if (maApi && maApi.symbols?.buildViewModel && maApi.symbols?.resolveSemanticId) {
        mounted.sym.textContent = '';
        const symbolId = first ? maApi.symbols.resolveSemanticId(first, first) : '';

        if (symbolId) {
            const vm = maApi.symbols.buildViewModel(symbolId, color, '');
            if (vm && vm.svgBody) {
                const flipStyle = vm.symbolId === 'arrow' ? 'transform: scaleX(-1); transform-origin: 50% 50%;' : '';
                mounted.sym.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vm.viewBox}" fill="none" aria-hidden="true" focusable="false" style="width: 100%; height: 100%; ${flipStyle}">${vm.svgBody}</svg>`;
            }
        }
    } else {
        if (mounted.sym.textContent !== first) mounted.sym.textContent = first;
    }

    if (first) mounted.gutter.setAttribute('data-has-symbol', '1');
    else mounted.gutter.removeAttribute('data-has-symbol');

    if (!first) {
      if (mounted.sym.style.color) mounted.sym.style.color = '';
      return true;
    }
    if (color) {
      if (mounted.sym.style.color !== color) mounted.sym.style.color = color;
    } else if (mounted.sym.style.color) {
      mounted.sym.style.color = '';
    }
    return true;
  }

  function syncMiniMapGutterForAnswer(answerId, symbols = null, colors = null) {
    const id = String(answerId || '').trim();
    if (!id) return false;
    const btn = getBtnById(id) || findMiniBtn(id);
    if (!btn) return false;

    const hasSymbols = Array.isArray(symbols);
    const hasColors = Array.isArray(colors);
    const meta = (!hasSymbols || !hasColors) ? getMarginSymbolMetaForAnswer(id) : null;
    const nextSymbols = hasSymbols ? normalizeSymbols(symbols) : (meta?.symbols || []);
    const nextColors = hasColors ? normalizeColors(colors) : (meta?.colors || []);
    return updateMiniMapGutterSymbol(btn, nextSymbols, { color: String(nextColors[0] || '').trim() });
  }

  function flushMiniMapGutterQueue() {
    S.gutterSyncRaf = 0;
    const entries = Array.from(S.gutterSyncQueue.entries());
    S.gutterSyncQueue.clear();
    for (const [answerId, payload] of entries) {
      try {
        syncMiniMapGutterForAnswer(answerId, payload?.symbols ?? null, payload?.colors ?? null);
      } catch {}
    }
  }

  function scheduleMiniMapGutterSync(answerId, symbols = null, colors = null) {
    const id = String(answerId || '').trim();
    if (!id) return;
    const hasSymbols = Array.isArray(symbols);
    const hasColors = Array.isArray(colors);
    const prev = S.gutterSyncQueue.get(id) || { symbols: null, colors: null };
    const next = {
      symbols: hasSymbols ? normalizeSymbols(symbols) : prev.symbols,
      colors: hasColors ? normalizeColors(colors) : prev.colors,
    };
    if (!hasSymbols && !hasColors && !S.gutterSyncQueue.has(id)) {
      next.symbols = null;
      next.colors = null;
    }
    S.gutterSyncQueue.set(id, next);
    if (S.gutterSyncRaf) return;
    S.gutterSyncRaf = requestAnimationFrame(flushMiniMapGutterQueue);
  }

  function bindMarginSymbolsBridge() {
    if (S.marginSymbolsBridgeBound) return true;

    const onMarginSymbolsChanged = (ev) => {
      const detail = ev?.detail || {};
      const answerId = String(detail.answerId || '').trim();
      if (!answerId) return;
      const symbols = Array.isArray(detail.symbols) ? detail.symbols : null;
      const colors = Array.isArray(detail.colors) ? detail.colors : null;
      scheduleMiniMapGutterSync(answerId, symbols, colors);
    };

    window.addEventListener(EV_MARGIN_SYMBOLS_CHANGED, onMarginSymbolsChanged);
    if (EV_MARGIN_SYMBOLS_CHANGED.startsWith('evt:')) {
      window.addEventListener(EV_MARGIN_SYMBOLS_CHANGED.slice(4), onMarginSymbolsChanged);
    }

    S.marginSymbolsBridgeOff = () => {
      try { window.removeEventListener(EV_MARGIN_SYMBOLS_CHANGED, onMarginSymbolsChanged); } catch {}
      if (EV_MARGIN_SYMBOLS_CHANGED.startsWith('evt:')) {
        try { window.removeEventListener(EV_MARGIN_SYMBOLS_CHANGED.slice(4), onMarginSymbolsChanged); } catch {}
      }
    };
    S.marginSymbolsBridgeBound = true;
    return true;
  }

  function unbindMarginSymbolsBridge() {
    try { S.marginSymbolsBridgeOff?.(); } catch {}
    S.marginSymbolsBridgeOff = null;
    S.marginSymbolsBridgeBound = false;
  }

  function getTurnRuntimeApi() {
    return W?.H2O?.turnRuntime || null;
  }

  function projectSharedTurnRecord(record, fallbackIndex = 0) {
    const turnId = String(record?.turnId || '').trim();
    if (!turnId) return null;
    const answerId = String(record?.primaryAId || record?.answerId || '').trim();
    const questionId = String(record?.qId || record?.questionId || '').trim();
    const index = Math.max(1, Number(record?.turnNo || record?.idx || fallbackIndex || 1) || 1);
    const el = record?.live?.primaryAEl || record?.primaryAEl || null;
    const questionEl = record?.live?.qEl || record?.qEl || null;
    return { turnId, answerId, questionId, index, el: el || null, questionEl: questionEl || null };
  }

  function getCanonicalTurnsFromSharedRuntime() {
    const api = getTurnRuntimeApi();
    if (!api || typeof api.listTurnRecords !== 'function') return null;

    const records = api.listTurnRecords() || [];
    if (!Array.isArray(records) || !records.length) return null;

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];

    for (let i = 0; i < records.length; i += 1) {
      const turn = projectSharedTurnRecord(records[i], i + 1);
      if (!turn) continue;
      list.push(turn);
      byId.set(turn.turnId, turn);
      if (turn.answerId) byAId.set(turn.answerId, turn.turnId);
      if (turn.el) {
        answerByTurn.set(turn.turnId, turn.el);
        answers.push(turn.el);
      }
    }

    return list.length ? { list, byId, byAId, answerByTurn, answers } : null;
  }

  function hasCanonicalAssistantTurnShape(turn) {
    const answerId = normalizePaginationAnswerId(turn?.answerId || '');
    if (!answerId) return false;
    return String(turn?.turnId || '').trim() === `turn:a:${answerId}`;
  }

  function shouldUseSharedRuntimeCanonical(sharedCanonical, paginationCanonical) {
    const sharedList = Array.isArray(sharedCanonical?.list) ? sharedCanonical.list : [];
    if (!sharedList.length) return false;

    let paginationEnabled = false;
    try {
      const info = W?.H2O_Pagination?.getPageInfo?.();
      if (info && typeof info.enabled === 'boolean') paginationEnabled = !!info.enabled;
    } catch {}

    const canonicalList = Array.isArray(paginationCanonical?.list) ? paginationCanonical.list : [];
    if (!paginationEnabled || !canonicalList.length) return true;

    const sharedAnswerTurns = sharedList.filter((turn) => !!normalizePaginationAnswerId(turn?.answerId || ''));
    if (sharedAnswerTurns.length < canonicalList.length) return false;

    const checkCount = Math.min(getPaginationPageSizeHint(), canonicalList.length);
    for (let i = 0; i < checkCount; i += 1) {
      const sharedTurn = sharedAnswerTurns[i] || null;
      const sharedAnswerId = normalizePaginationAnswerId(sharedTurn?.answerId || '');
      const canonicalAnswerId = normalizePaginationAnswerId(canonicalList[i]?.answerId || '');
      if (!hasCanonicalAssistantTurnShape(sharedTurn)) return false;
      if (!sharedAnswerId || !canonicalAnswerId || sharedAnswerId !== canonicalAnswerId) return false;
    }

    return true;
  }

  function getSharedTurnRecordByAnyId(anyId) {
    const api = getTurnRuntimeApi();
    const key = String(anyId || '').trim();
    if (!api || !key) return null;
    try {
      return api.getTurnRecordByTurnId?.(key)
        || api.getTurnRecordByAId?.(key)
        || api.getTurnRecordByQId?.(key)
        || null;
    } catch {
      return null;
    }
  }

  function indexTurns() {
    let answers = [];
    let list = [];
    let byId = new Map();
    let byAId = new Map();
    let answerByTurn = new Map();

    const sharedCanonical = getCanonicalTurnsFromSharedRuntime();
    const pwCanonical = getCanonicalTurnsFromPagination();
    if (shouldUseSharedRuntimeCanonical(sharedCanonical, pwCanonical)) {
      list = sharedCanonical.list.slice();
      byId = sharedCanonical.byId;
      byAId = sharedCanonical.byAId;
      answerByTurn = sharedCanonical.answerByTurn;
      answers = sharedCanonical.answers.slice();
    } else {
      if (pwCanonical?.list?.length) {
        list = pwCanonical.list.slice();
        byId = pwCanonical.byId;
        byAId = pwCanonical.byAId;
        answerByTurn = pwCanonical.answerByTurn;
        answers = pwCanonical.answers.slice();
      } else {
          const turnApi = W?.H2O?.turn?.getTurns;
          const apiTurns = (typeof turnApi === 'function') ? turnApi.call(W.H2O.turn) : null;
          if (Array.isArray(apiTurns) && apiTurns.length) {
            for (let i = 0; i < apiTurns.length; i += 1) {
              const t = apiTurns[i] || {};
              const idx = Number(t?.idx || (i + 1));
              const answerId = String(t?.primaryAId || t?.answerId || '').trim();
              const turnId = String(t?.turnId || t?.id || `turn:${idx}`).trim();
              if (!turnId) continue;

              const el = t?.primaryAEl || (answerId ? q(`[data-message-id="${escAttr(answerId)}"]`) : null);
              const turn = { turnId, answerId, index: idx, el: el || null };
              list.push(turn);
              byId.set(turnId, turn);
              if (answerId) byAId.set(answerId, turnId);
              if (el) {
                answerByTurn.set(turnId, el);
                answers.push(el);
              }
            }
          } else {
            answers = getAnswerEls();
            let idx = 0;
            for (const ans of answers) {
              idx += 1;
              const aId = getMessageId(ans);
              const turnId = parseTurnId(ans, idx, aId);
              const turn = { turnId, answerId: aId, index: idx, el: ans };
              list.push(turn);
              byId.set(turnId, turn);
              if (aId) byAId.set(aId, turnId);
              answerByTurn.set(turnId, ans);
            }
          }
      }
    }

    S.turnList = list;
    S.turnById = byId;
    S.turnIdByAId = byAId;
    S.answerByTurnId = answerByTurn;
    S.answerEls = answers.slice();

    const byIdGlobal =
      (W.H2O_MM_turnById instanceof Map) ? W.H2O_MM_turnById :
      new Map();
    const byAIdGlobal =
      (W.H2O_MM_turnIdByAId instanceof Map) ? W.H2O_MM_turnIdByAId :
      new Map();
    byIdGlobal.clear();
    byAIdGlobal.clear();
    for (const t of list) {
      byIdGlobal.set(t.turnId, t);
      if (t.answerId) byAIdGlobal.set(t.answerId, t.turnId);
    }
    try { W.H2O_MM_turnById = byIdGlobal; } catch {}
    try { W.H2O_MM_turnIdByAId = byAIdGlobal; } catch {}

    return list;
  }

  function getPaginationState() {
    try {
      return W?.H2O?.PW?.pgnwndw?.state || W?.H2O_Pagination?.state || null;
    } catch {
      return null;
    }
  }

  function normalizePaginationTurnId(raw, fallbackIdx = 0, answerId = '') {
    const direct = String(raw?.turnId || raw?.id || '').trim();
    if (direct) return direct;

    const uid = String(raw?.uid || raw?.turnUid || '').trim();
    if (uid) return uid.startsWith('turn:') ? uid : `turn:${uid}`;

    if (answerId) return `turn:a:${answerId}`;

    const idx = Math.max(1, Number(raw?.answerIndex || raw?.index || fallbackIdx || 1) || 1);
    return `pw-turn-${idx}`;
  }

  function normalizePaginationAnswerId(raw) {
    let id = String(raw || '').replace(/^conversation-turn-/, '').trim();
    if (!id) return '';
    if (id.startsWith('turn:a:')) id = id.slice(7).trim();
    else if (id.startsWith('turn:')) id = id.slice(5).trim();
    return id;
  }

  function buildCanonicalTurnCollection(rows, { requireAnswer = false } = {}) {
    const src = Array.isArray(rows) ? rows : [];
    if (!src.length) return null;

    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();
    const answers = [];
    const seen = new Set();

    for (const raw of src) {
      if (!raw) continue;

      let answerEl = raw?.primaryAEl || raw?.answerEl || raw?.el || null;
      if (!answerEl && raw?.node) answerEl = pickAssistantMessageEl(raw.node);
      if (!answerEl && raw?.nodeType === 1) answerEl = pickAssistantMessageEl(raw);

      let answerId = normalizePaginationAnswerId(raw?.answerId || raw?.primaryAId || raw?.aId || '');
      if (!answerId && answerEl) answerId = normalizePaginationAnswerId(getMessageId(answerEl) || '');
      if (requireAnswer && !answerId && !answerEl) continue;

      const nextIndex = list.length + 1;
      const turnId = normalizePaginationTurnId(raw, nextIndex, answerId);
      const dedupeKey = String(answerId || turnId || '').trim();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const turn = {
        turnId,
        answerId,
        index: nextIndex,
        el: answerEl || null,
      };
      list.push(turn);
      byId.set(turnId, turn);
      if (answerId) byAId.set(answerId, turnId);
      if (answerEl) {
        answerByTurn.set(turnId, answerEl);
        answers.push(answerEl);
      }
    }

    if (!list.length) return null;
    return { list, byId, byAId, answerByTurn, answers };
  }

  function getCanonicalTurnsFromPagination() {
    const ps = getPaginationState();
    const canonicalRows =
      (Array.isArray(ps?.masterTurnUnits) && ps.masterTurnUnits.length) ? ps.masterTurnUnits
        : (Array.isArray(ps?.canonicalTurns) && ps.canonicalTurns.length) ? ps.canonicalTurns
          : (Array.isArray(ps?.masterAnswers) && ps.masterAnswers.length) ? ps.masterAnswers
            : null;
    const canonical = buildCanonicalTurnCollection(canonicalRows, { requireAnswer: true });
    if (canonical?.list?.length) return canonical;

    const rawTurns = Array.isArray(ps?.masterTurns) ? ps.masterTurns : [];
    return buildCanonicalTurnCollection(rawTurns, { requireAnswer: true });
  }

  function getPaginationPageSizeHint() {
    try {
      const info = W?.H2O_Pagination?.getPageInfo?.();
      const fromInfo = Math.max(1, Number(info?.pageSize || 0) || 0);
      if (fromInfo > 0) return fromInfo;
    } catch {}
    const ps = getPaginationState();
    const candidates = [
      ps?.runtime?.pageSize,
      ps?.config?.pageSize,
      ps?.pageSize,
    ];
    for (const raw of candidates) {
      const n = Math.max(1, Number(raw || 0) || 0);
      if (n > 0) return n;
    }
    return 25;
  }

  function validateTurnsAgainstPagination(turns = S.turnList, opts = {}) {
    const canonical = getCanonicalTurnsFromPagination();
    const canonicalList = Array.isArray(canonical?.list) ? canonical.list : [];
    const enabled = (() => {
      try {
        const info = W?.H2O_Pagination?.getPageInfo?.();
        if (info && typeof info.enabled === 'boolean') return !!info.enabled;
      } catch {}
      return canonicalList.length > 0;
    })();
    if (!enabled && !canonicalList.length) {
      return { ok: true, applicable: false, reason: 'pagination-off', pageSize: 0, checkedCount: 0 };
    }
    if (!canonicalList.length) {
      return { ok: true, applicable: false, reason: 'canonical-unavailable', pageSize: getPaginationPageSizeHint(), checkedCount: 0 };
    }

    const list = Array.isArray(turns) ? turns : [];
    const pageSize = Math.max(1, Number(opts?.pageSize || getPaginationPageSizeHint() || 25) || 25);
    const checkedCount = Math.min(pageSize, canonicalList.length);
    if (!checkedCount) {
      return { ok: true, applicable: true, reason: 'empty-canonical', pageSize, checkedCount: 0 };
    }
    if (!list.length) {
      return {
        ok: false,
        applicable: true,
        reason: 'turns-empty',
        pageSize,
        checkedCount,
        missingAnswerCount: checkedCount,
        mismatchedAnswerCount: 0,
        missingTurnCount: 0,
        firstMismatchAt: 1,
      };
    }

    let missingAnswerCount = 0;
    let mismatchedAnswerCount = 0;
    let missingTurnCount = 0;
    let firstMismatchAt = 0;
    let firstExpectedAnswerId = '';
    let firstActualAnswerId = '';
    let firstExpectedTurnId = '';
    let firstActualTurnId = '';

    for (let i = 0; i < checkedCount; i += 1) {
      const expected = canonicalList[i] || null;
      const actual = list[i] || null;
      const expectedAnswerId = normalizePaginationAnswerId(expected?.answerId || expected?.primaryAId || '');
      const actualAnswerId = normalizePaginationAnswerId(actual?.answerId || actual?.primaryAId || actual?.aId || '');
      const expectedTurnId = String(expected?.turnId || '').trim();
      const actualTurnId = String(actual?.turnId || actual?.id || '').trim();

      let mismatch = false;
      if (!actual) {
        missingTurnCount += 1;
        mismatch = true;
      } else if (expectedAnswerId) {
        if (!actualAnswerId) {
          missingAnswerCount += 1;
          mismatch = true;
        } else if (actualAnswerId !== expectedAnswerId) {
          mismatchedAnswerCount += 1;
          mismatch = true;
        }
      } else if (expectedTurnId && actualTurnId !== expectedTurnId) {
        missingTurnCount += 1;
        mismatch = true;
      }

      if (mismatch && !firstMismatchAt) {
        firstMismatchAt = i + 1;
        firstExpectedAnswerId = expectedAnswerId;
        firstActualAnswerId = actualAnswerId;
        firstExpectedTurnId = expectedTurnId;
        firstActualTurnId = actualTurnId;
      }
    }

    const ok = missingAnswerCount === 0 && mismatchedAnswerCount === 0 && missingTurnCount === 0 && list.length >= checkedCount;
    return {
      ok,
      applicable: true,
      reason: ok ? 'ok' : 'first-page-mismatch',
      pageSize,
      checkedCount,
      missingAnswerCount,
      mismatchedAnswerCount,
      missingTurnCount,
      firstMismatchAt,
      firstExpectedAnswerId,
      firstActualAnswerId,
      firstExpectedTurnId,
      firstActualTurnId,
      totalTurns: list.length,
      totalCanonicalTurns: canonicalList.length,
    };
  }

  function getTurnPageBand(turnIndex) {
    const idx = Math.max(1, Number(turnIndex || 1));
    if (idx <= 25) return 'normal';
    if (idx <= 50) return 'teal';
    if (idx <= 75) return 'blue';
    if (idx <= 100) return 'darkred';
    return 'violet';
  }

  function createPageDivider(pageNum, band) {
    const div = document.createElement('div');
    div.className = 'cgxui-mm-page-divider';
    div.setAttribute('data-page-band', String(band || 'normal'));
    div.setAttribute('data-page-num', String(pageNum || 1));
    div.innerHTML = `<span class="cgxui-mm-page-divider-line"></span><button type="button" class="cgxui-mm-page-divider-label" data-page-num="${String(pageNum || 1)}" data-page-band="${String(band || 'normal')}" aria-label="Go to Page ${String(pageNum || 1)}">Page ${pageNum}</button><span class="cgxui-mm-page-divider-line"></span>`;
    return div;
  }

  function ensureMiniDividerLayer(panel = null) {
    const host = panel || minimapPanel();
    if (!host) return null;
    let layer =
      host.querySelector?.(`[data-cgxui="${UI_TOK.DIVIDER_LAYER}"][data-cgxui-owner="${UI_TOK.OWNER}"]`) ||
      host.querySelector?.('.cgxui-mm-divider-layer') ||
      null;
    if (layer) return layer;
    layer = document.createElement('div');
    layer.className = 'cgxui-mm-divider-layer';
    layer.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    layer.setAttribute('data-cgxui', UI_TOK.DIVIDER_LAYER);
    host.appendChild(layer);
    return layer;
  }

  function getMiniDividerTrackMetrics(panel = null, col = null) {
    const host = panel || minimapPanel();
    const track = col || minimapCol(host);
    if (!host || !track || !track.isConnected) return null;
    const top = Number(track.offsetTop || 0) || 0;
    const height = Math.max(0, Number(track.offsetHeight || 0) || 0);
    if (!height) return null;
    return { panel: host, col: track, top, height };
  }

  function getMiniDividerRowMeta(row, idx = 0) {
    if (!row?.matches) return null;
    if (row.matches(`[data-cgxui="${UI_TOK.WRAP}"], [data-cgxui="${UI_TOK.WRAP_LEGACY}"], .cgxui-mm-wrap`)) {
      const turnId = String(row?.dataset?.turnId || '').trim();
      const turnIdx = Math.max(0, Number(row?.dataset?.turnIdx || 0) || 0);
      const keyCore = turnId || (turnIdx ? `idx:${turnIdx}` : `row:${idx}`);
      return {
        el: row,
        type: 'turn',
        key: `turn:${keyCore}`,
        turnId,
        turnIdx,
      };
    }
    if (row.matches('.cgxui-mm-page-divider')) {
      const pageNum = Math.max(1, Number(row?.dataset?.pageNum || 1) || 1);
      return {
        el: row,
        type: 'page-divider',
        key: `page:${pageNum}`,
        pageNum,
      };
    }
    return {
      el: row,
      type: 'row',
      key: `row:${idx}`,
    };
  }


  function isMiniDividerSurfaceVisible(el) {
    if (!el?.isConnected) return false;
    const w = Number(el.offsetWidth || 0) || 0;
    const h = Number(el.offsetHeight || 0) || 0;
    if (!(w > 0 && h > 0)) return false;

    const cs = getComputedStyle(el);
    if (!cs) return true;

    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;
    if ((Number(cs.opacity) || 0) <= 0.001) return false;

    return true;
  }

  function getMiniDividerRowBounds(meta) {
    const row = meta?.el || null;
    if (!row) return null;

    const rowTop = Number(row.offsetTop || 0) || 0;
    const rowBottom = rowTop + (Number(row.offsetHeight || 0) || 0);

    if (meta?.type !== 'turn') {
      return { top: rowTop, bottom: rowBottom };
    }

    const qBtn = getQuestionBtnForWrap(row);
    const aBtn =
      row.querySelector?.(`[data-cgxui="${UI_TOK.BTN}"]`) ||
      row.querySelector?.(`[data-cgxui="${UI_TOK.BTN_LEGACY}"]`) ||
      row.querySelector?.('.cgxui-mm-btn') ||
      null;

    const parts = [];

    // In Q+A view: use visible question + answer as one grouped snap surface.
    // In Classic view: qBtn should not exist, but even if it does, hidden ones are ignored.
    for (const el of [qBtn, aBtn]) {
      if (!isMiniDividerSurfaceVisible(el)) continue;

      const top = rowTop + (Number(el.offsetTop || 0) || 0);
      const bottom = top + (Number(el.offsetHeight || 0) || 0);

      if (!(bottom > top)) continue;
      parts.push({ top, bottom });
    }

    if (!parts.length) {
      return { top: rowTop, bottom: rowBottom };
    }

    return {
      top: Math.min(...parts.map((part) => part.top)),
      bottom: Math.max(...parts.map((part) => part.bottom)),
    };
  }

  function getMiniDividerGapModel(panel = null, col = null) {
    const info = getMiniDividerTrackMetrics(panel, col);
    if (!info) return null;

    // IMPORTANT:
    // Only turn rows are valid snap neighbors for custom dividers.
    // This excludes page dividers and any other non-turn rows.
    const rows = Array.from(info.col.children || [])
      .map((row, idx) => getMiniDividerRowMeta(row, idx))
      .filter((meta) => meta && meta.type === 'turn');

    const gaps = [];
    const centerRatio = Math.max(
      0,
      Math.min(1, Number(MINI_DIVIDER_LAYOUT.GAP_CENTER_RATIO ?? 0.5) || 0.5)
    );
    const upperClearance = Math.max(
      0,
      Number(MINI_DIVIDER_LAYOUT.UPPER_BOX_CLEARANCE_PX ?? 0) || 0
    );
    const lowerClearance = Math.max(
      0,
      Number(MINI_DIVIDER_LAYOUT.LOWER_BOX_CLEARANCE_PX ?? 0) || 0
    );

    for (let i = 0; i < rows.length - 1; i += 1) {
      const before = rows[i];
      const after = rows[i + 1];

      const beforeBounds = getMiniDividerRowBounds(before);
      const afterBounds = getMiniDividerRowBounds(after);

      if (!beforeBounds || !afterBounds) continue;

      const beforeBottom = Number(beforeBounds.bottom || 0);
      const afterTop = Number(afterBounds.top || 0);
      const gapHeight = afterTop - beforeBottom;

      if (!(gapHeight > 0)) continue;

      // True target inside the real turn-to-turn gap
      const desiredY = beforeBottom + (gapHeight * centerRatio);

      // Safety clamps
      const safeMinY = beforeBottom + upperClearance;
      const safeMaxY = afterTop - lowerClearance;

      let y = desiredY;

      if (safeMaxY >= safeMinY) {
        y = Math.min(safeMaxY, Math.max(safeMinY, desiredY));
      } else {
        // If the clearances are too large for this gap,
        // fall back to the raw geometric center of the TURN gap,
        // not some other row model.
        y = beforeBottom + (gapHeight * 0.5);
      }

      const ratio = clampMiniDividerRatio(y / Math.max(1, info.height));

      gaps.push({
        id: `gap:${before.key}::${after.key}`,
        index: gaps.length + 1,
        y,
        ratio,
        before,
        after,
        gapHeight,
        beforeBottom,
        afterTop,
      });
    }

    return { metrics: info, rows, gaps };
  }

  function findNearestMiniDividerGap(targetRatio, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const ratio = clampMiniDividerRatio(targetRatio);
    let best = gaps[0];
    let bestDist = Math.abs(Number(best?.ratio || 0) - ratio);
    for (let i = 1; i < gaps.length; i += 1) {
      const gap = gaps[i];
      const dist = Math.abs(Number(gap?.ratio || 0) - ratio);
      if (dist < bestDist) {
        best = gap;
        bestDist = dist;
      }
    }
    return best;
  }

  function findNearestMiniDividerGapByY(targetY, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const y = Number(targetY);
    if (!Number.isFinite(y)) return gaps[0] || null;
    let best = gaps[0];
    let bestDist = Math.abs(Number(best?.y || 0) - y);
    for (let i = 1; i < gaps.length; i += 1) {
      const gap = gaps[i];
      const dist = Math.abs(Number(gap?.y || 0) - y);
      if (dist < bestDist) {
        best = gap;
        bestDist = dist;
      }
    }
    return best;
  }

  function getMiniDividerGapFromSlot(afterTurnIndex, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    const slot = Math.max(0, Number(afterTurnIndex || 0) || 0);
    if (!slot || !gaps.length) return null;
    return gaps.find((gap) => Number(gap?.before?.turnIdx || 0) === slot) || null;
  }

  function resolveMiniDividerGap(item, model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const gapId = String(item?.gapId || '').trim();
    if (gapId) {
      const byId = gaps.find((gap) => String(gap?.id || '').trim() === gapId) || null;
      if (byId) return byId;
    }
    const slot = Math.max(0, Number(item?.afterTurnIndex || 0) || 0);
    if (slot) {
      const bySlot = getMiniDividerGapFromSlot(slot, gapModel);
      if (bySlot) return bySlot;
    }
    const rawRatio = Number(item?.yRatio);
    if (Number.isFinite(rawRatio)) {
      const byRatio = findNearestMiniDividerGap(rawRatio, gapModel);
      if (byRatio) return byRatio;
    }
    return gaps[0] || null;
  }

  function getDefaultMiniDividerGap(model = null) {
    const gapModel = model || getMiniDividerGapModel();
    const gaps = Array.isArray(gapModel?.gaps) ? gapModel.gaps : [];
    if (!gaps.length) return null;
    const info = gapModel?.metrics || null;
    const activeBtn = info?.col?.querySelector?.('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn[data-cgxui-state~="active"], .cgxui-mm-btn.active') || null;
    const wrap = getWrapForMiniBtn(activeBtn);
    const activeIdx = Math.max(0, Number(wrap?.dataset?.turnIdx || activeBtn?.dataset?.turnIdx || 0) || 0);
    if (activeIdx) {
      const direct = getMiniDividerGapFromSlot(activeIdx, gapModel);
      if (direct) return direct;
      const wrapBottom = Number(wrap?.offsetTop || 0) + Number(wrap?.offsetHeight || 0);
      return findNearestMiniDividerGap(wrapBottom / Math.max(1, info?.height || 1), gapModel) || gaps[0];
    }
    return gaps[Math.floor(gaps.length / 2)] || gaps[0] || null;
  }

  function positionMiniDividerElement(divider, gap) {
    if (!divider) return false;
    const nextRatio = clampMiniDividerRatio(gap?.ratio);
    const nextY = Number(gap?.y);
    const gapId = String(gap?.id || '').trim();
    if (Number.isFinite(nextY)) divider.style.top = `${nextY.toFixed(2)}px`;
    else divider.style.top = `${(nextRatio * 100).toFixed(4)}%`;
    divider.dataset.yRatio = String(nextRatio);
    if (gapId) divider.dataset.gapId = gapId;
    else delete divider.dataset.gapId;
    return true;
  }

  function handleMiniDividerPointerDown(e, dividerId = '') {
    const item = getMiniDividerById(dividerId);
    if (!item) return;
    const panel = minimapPanel();
    const layer = ensureMiniDividerLayer(panel);
    const divider = e?.currentTarget || null;
    if (!panel || !layer || !divider) return;

    e.preventDefault();
    e.stopPropagation();

    const model = getMiniDividerGapModel(panel, minimapCol(panel));
    const gaps = Array.isArray(model?.gaps) ? model.gaps : [];
    if (!gaps.length) return;

    const selectedId = String(item?.id || '').trim();
    if (selectedId) {
      setSelectedMiniDividerId(selectedId, { chatId: item.chatId, source: 'core:drag-start', render: false, emit: true });
      try {
        const nodes = Array.from(layer.querySelectorAll('.cgxui-mm-overlay-divider[data-divider-id]'));
        for (const node of nodes) {
          node.setAttribute('data-selected', node === divider ? '1' : '0');
        }
      } catch {}
    }

    const layerRect = () => layer.getBoundingClientRect();
    const startGap = resolveMiniDividerGap(item, model) || gaps[0];
    if (!startGap) return;

    const gapFromClientY = (clientY) => {
      const rect = layerRect();
      const y = Number(clientY || 0) - rect.top;
      return findNearestMiniDividerGapByY(y, model) || startGap;
    };

    const prevDrag = S.dividerDrag;
    if (prevDrag) {
      try { window.removeEventListener('pointermove', prevDrag.move, true); } catch {}
      try { window.removeEventListener('pointerup', prevDrag.up, true); } catch {}
      try { window.removeEventListener('pointercancel', prevDrag.up, true); } catch {}
      S.dividerDrag = null;
    }

    const move = (ev) => {
      ev.preventDefault?.();
      const gap = gapFromClientY(ev.clientY);
      if (S.dividerDrag) {
        S.dividerDrag.gapId = String(gap?.id || '').trim();
        S.dividerDrag.ratio = Number(gap?.ratio || startGap?.ratio || 0.5);
      }
      positionMiniDividerElement(divider, gap);
    };
    const up = (ev) => {
      try { window.removeEventListener('pointermove', move, true); } catch {}
      try { window.removeEventListener('pointerup', up, true); } catch {}
      try { window.removeEventListener('pointercancel', up, true); } catch {}
      const drag = S.dividerDrag;
      S.dividerDrag = null;
      if (!drag) return;
      const finalGap = gapFromClientY(ev?.clientY);
      const existing = getMiniDividerById(drag.dividerId, drag.chatId) || item;
      const result = upsertMiniDivider({
        id: drag.dividerId,
        gapId: String(finalGap?.id || drag.gapId || '').trim(),
        yRatio: Number(finalGap?.ratio || drag.ratio || startGap?.ratio || 0.5),
        style: existing?.style,
        color: existing?.color,
        afterTurnIndex: 0,
      }, drag.chatId);
      if (!result?.ok && divider) {
        positionMiniDividerElement(divider, startGap);
      }
      try { ev.preventDefault?.(); } catch {}
    };

    S.dividerDrag = {
      dividerId: selectedId,
      chatId: item.chatId,
      gapId: String(startGap?.id || '').trim(),
      ratio: Number(startGap?.ratio || 0.5),
      move,
      up,
    };

    try { window.addEventListener('pointermove', move, true); } catch {}
    try { window.addEventListener('pointerup', up, true); } catch {}
    try { window.addEventListener('pointercancel', up, true); } catch {}
  }

  function createOverlayMiniDivider(item, metrics = null) {
    const divider = document.createElement('div');
    const style = normalizeMiniDividerStyle(item?.style || '');
    const color = normalizeMiniDividerColor(item?.color || '');
    const selected = String(item?.id || '').trim() === String(S.selectedMiniDividerId || '').trim();
    const model = metrics?.gaps ? metrics : getMiniDividerGapModel(metrics?.panel || null, metrics?.col || null);
    const gap = resolveMiniDividerGap(item, model);
    if (!gap) return null;

    divider.className = 'cgxui-mm-overlay-divider';
    divider.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    divider.setAttribute('data-cgxui', UI_TOK.DIVIDER);
    divider.setAttribute('data-divider-id', String(item?.id || ''));
    divider.setAttribute('data-divider-style', style);
    divider.setAttribute('data-selected', selected ? '1' : '0');
    divider.style.setProperty('--cgxui-mm-overlay-divider-color', color);
    divider.innerHTML = '<span class="cgxui-mm-overlay-divider-hit" aria-hidden="true"></span><span class="cgxui-mm-overlay-divider-line" aria-hidden="true"></span>';
    positionMiniDividerElement(divider, gap);
    divider.addEventListener('pointerdown', (e) => handleMiniDividerPointerDown(e, item?.id || ''), { passive: false });
    return divider;
  }

  function renderMiniDividerOverlay(chatId = '') {
    const panel = minimapPanel();
    const col = minimapCol(panel);
    const layer = ensureMiniDividerLayer(panel);
    if (!panel || !col || !layer) return null;

    const items = loadMiniDividers(chatId);
    const model = getMiniDividerGapModel(panel, col);
    const metrics = model?.metrics || null;
    if (!metrics || !Array.isArray(model?.gaps)) {
      layer.replaceChildren();
      return layer;
    }

    layer.style.top = `${metrics.top}px`;
    layer.style.height = `${metrics.height}px`;

    const selectedId = String(S.selectedMiniDividerId || '').trim();
    if (selectedId && !items.some((item) => String(item?.id || '').trim() === selectedId)) {
      S.selectedMiniDividerId = '';
    }

    const frag = document.createDocumentFragment();
    for (const item of items) {
      const divider = createOverlayMiniDivider(item, model);
      if (divider) frag.appendChild(divider);
    }
    layer.replaceChildren(frag);
    return layer;
  }

  function createBtn(turn) {
    const wrap = document.createElement('div');
    wrap.className = 'cgxui-mm-wrap';
    wrap.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    wrap.setAttribute('data-cgxui', UI_TOK.WRAP);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cgxui-mm-btn';
    btn.setAttribute('data-cgxui-owner', UI_TOK.OWNER);
    btn.setAttribute('data-cgxui', UI_TOK.BTN);
    btn.innerHTML = '<span class="cgxui-mm-qfrom" aria-hidden="true"></span>'
      + '<span class="cgxui-mm-qto" aria-hidden="true"></span>'
      + `<span class="cgxui-mm-num" aria-hidden="true">${turn.index}</span>`;

    wrap.appendChild(btn);
    syncTurnRowDom(btn, turn, { qaEnabled: isQaViewActive() });

    return {
      wrap,
      btn,
      qBtn: getQuestionBtnForWrap(wrap),
    };
  }

  function ensureTurnButtons(list = S.turnList) {
    const turns = Array.isArray(list) ? list : [];
    const col = ensureCol();
    if (!col) return null;
    if (!turns.length) {
      col.textContent = '';
      try { renderMiniDividerOverlay(resolveChatId()); } catch {}
      return setMapStore(new Map());
    }

    const prevMap = ensureMapStore();
    const nextMap = new Map();
    const marginSymbolMetaMap = getMarginSymbolMetaMap();
    const frag = document.createDocumentFragment();
    const qaEnabled = syncCurrentViewArtifacts() === 'qa';

    for (const turn of turns) {
      const turnId = String(turn?.turnId || '').trim();
      if (!turnId) continue;

      const turnIndex = Number(turn?.index || 0);
      const pageNum = Math.max(1, Math.ceil(turnIndex / 25));
      const band = getTurnPageBand(turnIndex);

      if (turnIndex > 0 && ((turnIndex - 1) % 25 === 0)) {
        frag.appendChild(createPageDivider(pageNum, band));
      }

      const answerId = String(turn?.answerId || '').trim();
      let btn = prevMap.get(turnId) || (answerId ? prevMap.get(answerId) : null) || null;
      let wrap = null;
      if (!btn || !btn.isConnected) {
        const made = createBtn(turn);
        btn = made.btn;
        wrap = made.wrap;
      } else {
        wrap = getWrapForMiniBtn(btn);
        if (!wrap) {
          const made = createBtn(turn);
          btn = made.btn;
          wrap = made.wrap;
        } else {
          syncTurnRowDom(btn, turn, { qaEnabled });
        }
      }

      if (!wrap) continue;

      syncWrapMeta(wrap, turn, band);
      syncAnswerBtnMeta(btn, turn, band);
      ensureQuestionBtnForWrap(wrap, turn, band, qaEnabled);

      frag.appendChild(wrap);

      nextMap.set(turnId, btn);
      if (answerId) nextMap.set(answerId, btn);

      const symbolMeta = getMarginSymbolMetaForAnswer(answerId, marginSymbolMetaMap);
      updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });
      repaintMiniBtnByAnswerId(answerId || turnId, btn);
      try { W.syncMiniMapDot?.(answerId); } catch {}
      try { W.H2O_MM_syncQuoteBadgesForIdx?.(btn, turn.index); } catch {}
    }

    col.replaceChildren(frag);
    try { renderMiniDividerOverlay(resolveChatId()); } catch {}
    setMapStore(nextMap);

    const activeId = String(S.lastActiveTurnIdFast || S.lastActiveBtnId || '').trim();
    if (activeId) {
      try { setActive(activeId, 'rebuild:turn-buttons'); } catch {}
    } else {
      try { updateCounter(''); } catch {}
    }
    requestAnimationFrame(() => {
      try { W.H2O?.MM?.dots?.repaintDotsForAllMiniBtns?.(); } catch {}
      try { W.H2O_MM_repaintDots?.(); } catch {}
    });

    return nextMap;
  }

  function getPageDividerLabel(pageNum = 0) {
    const num = Math.max(1, Number(pageNum || 0) || 1);
    const col = ensureCol();
    if (!col) return null;
    try {
      return col.querySelector(`.cgxui-mm-page-divider-label[data-page-num="${String(num)}"]`);
    } catch {
      return null;
    }
  }

  function findTurnByAnyId(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;
    const candidates = [key];
    if (key.startsWith('turn:')) candidates.push(String(key.slice(5)).trim());
    else candidates.push(`turn:${key}`);
    for (const c of candidates) {
      if (!c) continue;
      if (S.turnById.has(c)) return S.turnById.get(c);
      if (S.turnIdByAId.has(c)) return S.turnById.get(S.turnIdByAId.get(c)) || null;
    }
    const sharedRecord = getSharedTurnRecordByAnyId(key);
    if (sharedRecord) return projectSharedTurnRecord(sharedRecord);
    return null;
  }

  function getBtnById(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;
    const map = ensureMapStore();
    const byMap = map.get(key);
    if (byMap) return byMap;
    const turn = findTurnByAnyId(key);
    if (!turn) return null;
    const aId = String(turn.answerId || '').trim();
    return map.get(aId) || map.get(turn.turnId) || null;
  }

  function getTurnById(turnId) {
    const key = String(turnId || '').trim();
    if (!key) return null;
    return S.turnById.get(key) || projectSharedTurnRecord(getSharedTurnRecordByAnyId(key)) || null;
  }

  function refreshTurnsCache() {
    const turnApi = W?.H2O?.turn?.getTurns;
    const apiTurns = (typeof turnApi === 'function') ? turnApi.call(W.H2O.turn) : null;
    if (Array.isArray(apiTurns) && apiTurns.length) {
      indexTurns();
      return apiTurns;
    }
    indexTurns();
    return [];
  }

  function getTurns() {
    const turnApi = W?.H2O?.turn?.getTurns;
    const apiTurns = (typeof turnApi === 'function') ? turnApi.call(W.H2O.turn) : null;
    if (Array.isArray(apiTurns) && apiTurns.length) {
      indexTurns();
      return apiTurns;
    }
    return refreshTurnsCache();
  }

  function resolveBtnId(anyId) {
    const id = String(anyId || '').trim();
    if (!id) return '';

    const map = ensureMapStore();
    if (map?.has?.(id)) return id;

    const sharedTurnId = String(getSharedTurnRecordByAnyId(id)?.turnId || '').trim();
    if (sharedTurnId) return sharedTurnId;

    const mapped = S.turnIdByAId?.get?.(id);
    if (mapped) return String(mapped).trim();

    const idx = W?.H2O?.turn?.getTurnIndexByAId?.(id) || 0;
    if (idx) {
      const turns = getTurns();
      const t = turns?.[idx - 1];
      const turnId = String(t?.turnId || '').trim();
      if (turnId) return turnId;
    }

    let found = '';
    map?.forEach?.((btn, key) => {
      if (found) return;
      const pid = String(btn?.dataset?.primaryAId || '').trim();
      if (pid && pid === id) found = String(key || '').trim();
    });
    return found || id;
  }

  function turnIdxForAnswerEl(answerEl) {
    if (!answerEl) return 0;
    const viaCore = W?.H2O?.turn?.getTurnIndexByAEl?.(answerEl) || 0;
    if (viaCore) return viaCore;

    const aId = String(getMessageId(answerEl) || '').trim();
    if (!aId) return 0;

    const sharedTurnNo = Number(getSharedTurnRecordByAnyId(aId)?.turnNo || 0);
    if (sharedTurnNo > 0) return sharedTurnNo;

    const turnId = S.turnIdByAId.get(aId);
    if (turnId) return Number(S.turnById.get(turnId)?.index || 0) || 0;

    indexTurns();
    const turnId2 = S.turnIdByAId.get(aId);
    return Number(S.turnById.get(turnId2 || '')?.index || 0) || 0;
  }

  function findMiniBtn(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return null;

    const map = ensureMapStore();
    const direct = map?.get?.(key);
    if (direct) return direct;

    const mappedTurnId = S.turnIdByAId?.get?.(key);
    if (mappedTurnId) {
      const byMapped = map?.get?.(String(mappedTurnId).trim());
      if (byMapped) return byMapped;
    }

    let found = null;
    map?.forEach?.((btn) => {
      if (found) return;
      const pid = String(btn?.dataset?.primaryAId || '').trim();
      if (pid && pid === key) found = btn;
    });
    if (found) return found;

    try {
      const esc = escAttr(key);
      return q(`[data-cgxui="mnmp-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-primary-a-id="${esc}"]`)
        || q(`[data-cgxui="mnmp-btn"][data-turn-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-primary-a-id="${esc}"]`)
        || q(`[data-cgxui="mm-btn"][data-turn-id="${esc}"]`)
        || null;
    } catch {
      return null;
    }
  }

  function getTurnList() {
    return S.turnList.slice();
  }

  function getTurnIndex(anyId = '') {
    const key = String(anyId || '').trim();
    if (!key) return 0;
    const turn = findTurnByAnyId(key);
    return Number(turn?.index || 0);
  }

  function computeActiveFromViewport(opts = {}) {
    if (!S.turnList.length && !S.answerEls.length) indexTurns();
    const turns = S.turnList.length ? S.turnList : [];
    const turnAnchor = Number.isFinite(opts?.turnAnchorY)
      ? Number(opts.turnAnchorY)
      : Math.max(0, Math.floor(window.innerHeight * 0.22));
    const fallbackAnchor = Number.isFinite(opts?.anchorY) ? Number(opts.anchorY) : 120;
    const activePageDivider = (() => {
      const dividers = qq('.cgxui-pgnw-page-divider[data-page-num]');
      if (!dividers.length) return null;

      let best = null;
      let bestDist = Infinity;
      for (const el of dividers) {
        if (!el?.getBoundingClientRect) continue;
        const rect = el.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

        const pageNum = Math.max(1, Number(el.getAttribute?.('data-page-num') || 0) || 0);
        if (!pageNum) continue;

        const dist = (rect.top <= turnAnchor && rect.bottom >= turnAnchor)
          ? 0
          : Math.min(Math.abs(rect.top - turnAnchor), Math.abs(rect.bottom - turnAnchor));
        if (dist < bestDist) {
          bestDist = dist;
          best = { el, pageNum, dist };
          if (dist === 0) break;
        }
      }
      const threshold = Math.max(72, Math.floor(window.innerHeight * 0.18));
      return best && Number(best.dist || 0) <= threshold ? best : null;
    })();
    const activePageNum = Math.max(0, Number(activePageDivider?.pageNum || 0) || 0);

    let pickedTurn = null;

    if (turns.length) {
      const lastId = String(S.lastActiveTurnIdFast || '').trim();
      if (lastId) {
        const lastTurn = S.turnById.get(lastId) || null;
        const lastEl = lastTurn?.el || S.answerByTurnId.get(lastId) || null;
        if (lastEl?.getBoundingClientRect) {
          try {
            const r = lastEl.getBoundingClientRect();
            if (r.bottom >= 0 && r.top <= window.innerHeight && r.top <= turnAnchor && r.bottom >= turnAnchor) {
              const turnId = String(lastTurn?.turnId || lastId).trim();
              const answerId = String(lastTurn?.answerId || '').trim();
              const idx = Number(lastTurn?.index || getTurnIndex(turnId || answerId) || 0);
              return { activeTurnId: turnId, activeAnswerId: answerId, activeBtnIndex: idx, activePageNum };
            }
          } catch {}
        }
      }

      const visibleSet = (opts?.visibleSet instanceof Set && opts.visibleSet.size)
        ? Array.from(opts.visibleSet)
        : [];

      if (visibleSet.length) {
        let bestEl = null;
        let bestDist = Infinity;

        for (const el of visibleSet) {
          if (!el?.getBoundingClientRect) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;

          const dist = (r.top <= turnAnchor && r.bottom >= turnAnchor)
            ? 0
            : Math.min(Math.abs(r.top - turnAnchor), Math.abs(r.bottom - turnAnchor));

          if (dist < bestDist) {
            bestDist = dist;
            bestEl = el;
            if (dist === 0) break;
          }
        }

        if (bestEl) {
          const aId = String(getMessageId(bestEl) || '').trim();
          const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
          if (turnId) pickedTurn = S.turnById.get(turnId) || null;
        }
      }

      if (!pickedTurn) {
        try {
          const probe = document.elementFromPoint(Math.floor(window.innerWidth * 0.5), turnAnchor);
          const { SEL } = getRegs();
          const aEl = probe?.closest?.(
            SEL.ANSWER || 'article[data-message-author-role="assistant"], div[data-message-author-role="assistant"]'
          );
          if (aEl) {
            const aId = String(getMessageId(aEl) || '').trim();
            const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
            if (turnId) pickedTurn = S.turnById.get(turnId) || null;
          }
        } catch {}
      }

      if (!pickedTurn) {
        const last = Math.max(1, Number(S.lastActiveIndex || 1));
        const i0 = Math.max(0, last - 25);
        const i1 = Math.min(turns.length - 1, last + 25);
        let bestTurn = null;
        let bestDist = Infinity;

        for (let i = i0; i <= i1; i += 1) {
          const t = turns[i];
          const turnId = String(t?.turnId || '').trim();
          let el = t?.el || (turnId ? S.answerByTurnId.get(turnId) : null);
          // Keep active-compute bounded: no per-turn DOM queries in this loop.
          if (!el) continue;
          if (!el?.getBoundingClientRect) continue;
          const r = el.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) continue;

          const dist = (r.top <= turnAnchor && r.bottom >= turnAnchor)
            ? 0
            : Math.min(Math.abs(r.top - turnAnchor), Math.abs(r.bottom - turnAnchor));

          if (dist < bestDist) {
            bestDist = dist;
            bestTurn = t;
            if (dist === 0) break;
          }
        }
        pickedTurn = bestTurn || null;
      }
    }

    if (pickedTurn) {
      const turnId = String(pickedTurn.turnId || '').trim();
      const answerId = String(pickedTurn.answerId || '').trim();
      const idx = Number(pickedTurn.index || getTurnIndex(turnId || answerId) || 0);
      return { activeTurnId: turnId, activeAnswerId: answerId, activeBtnIndex: idx, activePageNum };
    }

    const answers = (S.answerEls.length ? S.answerEls : getAnswerEls()).filter((el) => !!el && el.isConnected);
    if (!answers.length) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0, activePageNum };

    const y = window.scrollY || 0;
    let bestEl = null;
    let bestDelta = Infinity;
    for (const el of answers) {
      const r = el?.getBoundingClientRect?.();
      if (!r) continue;
      const top = r.top + y;
      const d = Math.abs(top - y - fallbackAnchor);
      if (d < bestDelta) {
        bestDelta = d;
        bestEl = el;
      }
    }

    if (!bestEl) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0, activePageNum };
    const aId = String(getMessageId(bestEl) || '').trim();
    const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
    return {
      activeTurnId: turnId,
      activeAnswerId: aId,
      activeBtnIndex: getTurnIndex(turnId || aId),
      activePageNum,
    };
  }

  function setBtnActiveState(btn, on) {
    if (!btn) return;
    const active = !!on;
    btn.classList.toggle('active', active);
    btn.classList.toggle('inview', active);
    setStateToken(btn, 'active', active);
    setStateToken(btn, 'inview', active);
    if (active) btn.setAttribute('data-cgxui-inview', '1');
    else btn.removeAttribute('data-cgxui-inview');
  }

  function isBtnActive(btn) {
    if (!btn) return false;
    try {
      if (btn.classList?.contains?.('active')) return true;
    } catch {}
    const st = String(btn.getAttribute?.('data-cgxui-state') || '').trim();
    return /\bactive\b/.test(st);
  }

  function setActive(anyId, reason = 'core') {
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const key = String(anyId || '').trim();
    const scanTick0 = Number(S.perfFullScanTick || 0);
    const perfDone = (ok, payload = null) => {
      if (PERF_ASSERT_ON) {
        perfReportDuration('setActive', perfT0, scanTick0, Object.assign({
          ok: !!ok,
          reason: String(reason || 'core'),
        }, payload || {}));
        console.assert(scanTick0 === Number(S.perfFullScanTick || 0), '[MiniMap] Active path must be O(1) — no full scans');
      }
      return !!ok;
    };
    if (!key) return perfDone(false, { status: 'id-missing' });

    const turn = findTurnByAnyId(key);
    const targetTurnId = String(turn?.turnId || key).trim();
    if (!targetTurnId) return perfDone(false, { status: 'turn-missing' });

    const nextBtn = getBtnById(targetTurnId);
    if (!nextBtn) return perfDone(false, { status: 'btn-missing', id: targetTurnId });

    const sameTarget = targetTurnId === String(S.lastActiveTurnIdFast || '').trim();
    const isScrollReason = String(reason || '').trim() === 'scroll-sync';
    const fastActive = isBtnActive(nextBtn);
    const fastPrevOk = !S.lastActiveBtnEl || !S.lastActiveBtnEl.isConnected || S.lastActiveBtnEl === nextBtn;
    if (isScrollReason && sameTarget && fastActive && fastPrevOk) {
      S.lastActiveBtnEl = nextBtn;
      S.lastActiveTurnIdFast = targetTurnId;
      S.lastActiveBtnId = targetTurnId;
      S.lastActiveIndex = Number(turn?.index || S.lastActiveIndex || 0);
      return perfDone(true, { id: targetTurnId, status: 'noop:same-active' });
    }

    let prevBtn = S.lastActiveBtnEl;
    if (prevBtn && !prevBtn.isConnected) prevBtn = null;
    if (!prevBtn) {
      const stale = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
      if (stale && stale !== nextBtn) {
        setBtnActiveState(stale, false);
        setPeerQuestionActiveFromAnswerBtn(stale, false);
      }
    }
    if (prevBtn && prevBtn !== nextBtn) {
      setBtnActiveState(prevBtn, false);
      setPeerQuestionActiveFromAnswerBtn(prevBtn, false);
    }
    setBtnActiveState(nextBtn, true);
    setPeerQuestionActiveFromAnswerBtn(nextBtn, true);
    S.lastActiveBtnEl = nextBtn;
    S.lastActiveTurnIdFast = targetTurnId;
    S.lastActiveBtnId = targetTurnId;

    updateCounter(targetTurnId);
    updateToggleColor(targetTurnId);
    S.lastActiveIndex = Number(turn?.index || getTurnIndex(targetTurnId) || S.lastActiveIndex || 0);
    return perfDone(true, { id: targetTurnId, status: 'updated' });
  }

  function centerOn(anyId, { force = false, smooth = true, activate = true } = {}) {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const btn = getBtnById(key);
    if (!btn) return false;

    centerMiniMapNode(btn, { smooth });

    if (activate) {
      const targetId = String(btn.dataset.turnId || key).trim();
      const already = targetId && targetId === String(S.lastActiveTurnIdFast || '').trim() && isBtnActive(btn);
      if (!already || force) setActive(targetId || key);
    }
    return true;
  }

  function centerOnPageDivider(pageNum, { smooth = true } = {}) {
    const label = getPageDividerLabel(pageNum);
    if (!label) return false;
    return centerMiniMapNode(label, { smooth });
  }

  function updateToggleColor(anyId) {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const tg = toggleEl();
    if (!tg) return false;

    const turn = findTurnByAnyId(key);
    const btnId = String(turn?.turnId || key).trim();
    const primaryId = String(turn?.answerId || getBtnById(btnId)?.dataset?.primaryAId || '').trim();
    const washMap = (W?.H2O?.MM?.washMap && typeof W.H2O.MM.washMap === 'object') ? W.H2O.MM.washMap : {};
    const colorName = washMap[primaryId || btnId] || null;
    const raw = COLOR_BY_NAME[colorName] || colorName || '';
    tg.style.background = raw ? `color-mix(in srgb, ${raw} 30%, #2f2f2f)` : '#2f2f2f';
    return true;
  }

  function applyToggleCounterPageBand(turnIndex = 0, total = 0) {
    const band = total > 0 ? getTurnPageBand(Math.max(1, Number(turnIndex || 1) || 1)) : 'normal';
    const tg = toggleEl();
    const tEl = toggleCountEl();
    if (tg) tg.setAttribute('data-page-band', band);
    if (tEl) tEl.setAttribute('data-page-band', band);
    return band;
  }

  function updateCounter(anyId = '') {
    const key = String(anyId || '').trim();
    const total = Number(
      S.turnList.length
      || W?.H2O?.turn?.total?.()
      || getAnswerEls().length
      || 0
    );

    let idx = Number(getTurnIndex(key));
    if (!idx && key.startsWith('turn:')) {
      const m = key.match(/(\d+)$/);
      if (m) idx = Number(m[1]) || 0;
    }
    if (!idx) idx = total > 0 ? 1 : 0;

    const cEl = counterEl();
    if (cEl) cEl.textContent = `Answer: ${idx}/${total}`;

    const tEl = toggleCountEl();
    if (tEl) {
      tEl.textContent = `${idx}/${total}`;
    }
    applyToggleCounterPageBand(idx, total);

    if (key) updateToggleColor(key);
    return true;
  }

  function resolveRebuildActiveId() {
    try {
      const fastBtn = S.lastActiveBtnEl;
      const fastId = String(fastBtn?.dataset?.turnId || fastBtn?.dataset?.id || '').trim();
      if (fastBtn?.isConnected && fastId) return fastId;
    } catch {}
    const fast = String(S.lastActiveTurnIdFast || '').trim();
    if (fast) return fast;
    try {
      const active = q('[data-cgxui="mnmp-btn"][data-cgxui-state~="active"], [data-cgxui="mm-btn"][data-cgxui-state~="active"], .cgxui-mm-btn.active');
      const activeId = String(active?.dataset?.turnId || active?.dataset?.id || active?.dataset?.primaryAId || '').trim();
      if (activeId) return activeId;
    } catch {}
    const viewport = computeActiveFromViewport({});
    const viewportId = String(viewport?.activeTurnId || viewport?.activeAnswerId || '').trim();
    if (viewportId) return viewportId;
    const first = S.turnList[0] || null;
    return String(first?.turnId || first?.answerId || '').trim();
  }

  function finalizeRebuildUi(reason = 'core:rebuild') {
    const activeId = resolveRebuildActiveId();
    if (activeId) {
      setActive(activeId, `rebuild:${String(reason || 'core:rebuild')}`);
      return true;
    }
    updateCounter('');
    return false;
  }

  function syncActiveFromViewport(opts = {}) {
    const active = computeActiveFromViewport(opts);
    const id = String(active?.activeTurnId || active?.activeAnswerId || '').trim();
    if (!id) return active;

    if (opts?.center) centerOn(id, { force: false, smooth: true });
    else setActive(id, 'viewport-sync');

    if (opts?.relabel) {
      try { W.relabelMiniMap?.(); } catch {}
    }
    return Object.assign({}, active, { syncedId: id });
  }

  function resolveAnswerEl(target) {
    if (!target) return null;
    if (target && target.nodeType === 1) return target;
    const id = String(target || '').trim();
    if (!id) return null;
    try {
      const esc = escAttr(id);
      return q(`[data-message-id="${esc}"]`) ||
        q(`[data-cgxui-id="${esc}"]`) ||
        q(`[data-h2o-ans-id="${esc}"]`) ||
        q(`[data-h2o-core-id="${esc}"]`);
    } catch {
      return null;
    }
  }

  function parseFlashDurationMs(raw, fallback = 1600) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return fallback;
    if (s.endsWith('ms')) {
      const n = Number(s.slice(0, -2));
      return Number.isFinite(n) && n > 0 ? n : fallback;
    }
    if (s.endsWith('s')) {
      const n = Number(s.slice(0, -1));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : fallback;
    }
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function getPageFlashDurationMs(target = null) {
    const fallback = 1600;
    const sources = [
      (target instanceof Element) ? target : null,
      document.documentElement,
    ].filter(Boolean);
    for (const source of sources) {
      try {
        const raw = String(getComputedStyle(source).getPropertyValue('--cgxui-mnmp-flash-ms') || '').trim();
        const ms = parseFlashDurationMs(raw, 0);
        if (ms > 0) return ms;
      } catch {}
    }
    return fallback;
  }

  function applyTempFlash(answerEl, opts = null) {
    const target = answerEl?.querySelector?.('[data-message-content]') || answerEl;
    if (!target) return false;
    try {
      const flashMs = Math.max(200, getPageFlashDurationMs(target) + 80);
      const surface = String(opts?.surface || 'answer').trim().toLowerCase() === 'question' ? 'question' : 'answer';
      const hadWrap = !!target.classList?.contains?.(FLASH_CLS.WASH_WRAP);
      const hadWrapLegacy = !!target.classList?.contains?.(FLASH_CLS.WASH_WRAP_LEGACY);
      const hasAnyWashTintClass = () => {
        const inlineBandColor = String(
          target.style?.getPropertyValue?.('--h2o-band-color')
          || target.style?.getPropertyValue?.('--cgxui-mnmp-band-color')
          || ''
        ).trim();
        const inlineBandOpacity = String(
          target.style?.getPropertyValue?.('--h2o-band-opacity')
          || target.style?.getPropertyValue?.('--cgxui-mnmp-band-opacity')
          || ''
        ).trim();
        if (inlineBandColor || inlineBandOpacity) return true;
        const classes = Array.from(target.classList || []);
        return classes.some((cls) => {
          if (!cls || cls === FLASH_CLS.WASH_WRAP || cls === FLASH_CLS.WASH_WRAP_LEGACY) return false;
          return cls.startsWith('cgxui-mnmp-wash-') || cls.startsWith('cgxui-wash-');
        });
      };
      target.classList?.add?.(FLASH_CLS.WASH_WRAP, FLASH_CLS.WASH_WRAP_LEGACY);
      target.classList?.remove?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY);
      try { target.removeAttribute('data-cgxui-flash'); } catch {}
      try { target.setAttribute('data-cgxui-flash-surface', surface); } catch {}
      void target.offsetWidth;
      target.classList?.add?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY);
      try { target.setAttribute('data-cgxui-flash', '1'); } catch {}
      setTimeout(() => {
        try { target.classList?.remove?.(FLASH_CLS.FLASH, FLASH_CLS.FLASH_LEGACY); } catch {}
        try { target.removeAttribute('data-cgxui-flash'); } catch {}
        try { target.removeAttribute('data-cgxui-flash-surface'); } catch {}
        const keepWrap = hasAnyWashTintClass();
        if (!hadWrap && !keepWrap) {
          try { target.classList?.remove?.(FLASH_CLS.WASH_WRAP); } catch {}
        }
        if (!hadWrapLegacy && !keepWrap) {
          try { target.classList?.remove?.(FLASH_CLS.WASH_WRAP_LEGACY); } catch {}
        }
      }, flashMs);
      return true;
    } catch {
      return false;
    }
  }

  function flashAnswer(target) {
    const el = resolveAnswerEl(target);
    if (!el) return false;
    try { applyTempFlash(el); } catch {}
    try {
      const aId = String(getMessageId(el) || '').trim();
      if (aId) {
        const { SEL } = getRegs();
        const btn = q(SEL.MM_BTN_BY_PRIMARY_A_ID?.(aId) || '') ||
          q(SEL.MM_BTN_BY_ID?.(aId) || '') ||
          q(`[data-cgxui$="btn"][data-primary-a-id="${escAttr(aId)}"]`) ||
          q(`[data-cgxui$="btn"][data-id="${escAttr(aId)}"]`);
        if (btn) {
          try { btn.setAttribute('data-cgxui-flash', '1'); } catch {}
          setTimeout(() => { try { btn.removeAttribute('data-cgxui-flash'); } catch {} }, 1200);
        }
      }
    } catch {}
    return true;
  }

  function emitAnswersScan(reason = 'core') {
    const SH = TOPW.H2O_MM_SHARED?.get?.();
    const EV = SH?.EV_ || SH?.registries?.EV || W?.H2O?.EV || {};
    const evtName = EV.ANSWERS_SCAN || 'evt:h2o:answers:scan';
    try { W.H2O?.bus?.emit?.('answers:scan', { reason }); } catch {}
    try { window.dispatchEvent(new CustomEvent(evtName, { detail: { reason } })); } catch {}
  }

  function behaviorApi() {
    try { return MM_behavior() || null; } catch { return null; }
  }

  function getBehavior(force = false) {
    const api = behaviorApi();
    try { return api?.get?.(!!force) || api?.defaults?.() || null; } catch { return null; }
  }

  function setBehavior(next, reason = 'core:setBehavior') {
    const api = behaviorApi();
    try { return api?.set?.(next, reason) || getBehavior(true); } catch { return getBehavior(true); }
  }

  function validateBehavior(next, opts = {}) {
    const api = behaviorApi();
    try { return api?.validate?.(next, opts) || api?.defaults?.() || null; } catch { return api?.defaults?.() || null; }
  }

  function makeRebuildResult(reason, status = 'not-ready') {
    return {
      ok: status === 'ok',
      status,
      reason: String(reason || 'core:rebuildNow'),
      built: {
        ui: false,
        turns: 0,
        buttons: false,
      },
      retry: {
        scheduled: false,
        count: Number(S.retryCount || 0),
        kind: String(S.retryKind || ''),
      },
    };
  }

  function clearRetry() {
    try { if (S.retryTimer) clearTimeout(S.retryTimer); } catch {}
    S.retryTimer = null;
    S.retryCount = 0;
    S.retryKind = '';
    S.retryReason = '';
  }

  function scheduleRetry(kind = 'retry', reason = 'core:retry') {
    if (S.retryTimer) return false;
    if (S.retryCount >= EMPTY_RETRY_MAX) return false;
    S.retryCount += 1;
    S.retryKind = String(kind || 'retry');
    S.retryReason = String(reason || S.rebuildReason || 'core:retry');
    const delay = Math.min(1400, EMPTY_RETRY_GAP_MS * (2 ** Math.max(0, S.retryCount - 1)));
    S.retryTimer = setTimeout(() => {
      S.retryTimer = null;
      const why = `${S.retryReason}:retry:${S.retryKind}:${S.retryCount}`;
      rebuildNow(why);
    }, delay);
    return true;
  }

  function ensureUiRefsForRebuild(reason = 'core:rebuildNow') {
    const ui = MM_ui();
    let refs = MM_uiRefs();
    const hasRefs = !!(refs?.root && refs?.panel);
    if (hasRefs) return { ui, refs, ready: true };
    try { ui?.ensureUI?.(`core:rebuildNow:${reason}`); } catch {}
    refs = MM_uiRefs();
    return { ui, refs, ready: !!(refs?.root && refs?.panel) };
  }

  function cancelScheduledRebuild() {
    const schedule = TOPW?.H2O?.runtime?.schedule || W?.H2O?.runtime?.schedule || null;
    if (schedule) {
      try { schedule.cancel('minimap:rebuild'); } catch {}
      try { schedule.cancel('minimap:rebuild:fallback'); } catch {}
    }
    if (S.rebuildRaf) {
      try { cancelAnimationFrame(S.rebuildRaf); } catch {}
      S.rebuildRaf = 0;
    }
    if (S.rebuildTimer) {
      try { clearTimeout(S.rebuildTimer); } catch {}
      S.rebuildTimer = null;
    }
  }

  function invalidateScheduledRebuild() {
    S.rebuildToken += 1;
    cancelScheduledRebuild();
  }

  function runScheduledRebuild(token) {
    if (!token || token !== S.rebuildToken) return false;
    // Consume this cycle token before running rebuild so correctness does not depend on rebuildNow internals.
    S.rebuildToken += 1;
    cancelScheduledRebuild();
    rebuildNow(S.rebuildReason);
    return true;
  }

  function rebuildNow(reason = 'core:rebuildNow') {
    const perfT0 = PERF_ASSERT_ON ? performance.now() : 0;
    const scanTick0 = Number(S.perfFullScanTick || 0);
    const why = String(reason || 'core:rebuildNow');
    // Direct rebuild must run immediately and clear any pending scheduled handles.
    cancelScheduledRebuild();
    S.rebuildReason = why;
    if (S.rebuildInFlight) {
      S.rebuildReason = why;
      const queued = makeRebuildResult(why, 'queued');
      S.lastRebuildResult = queued;
      perfReportDuration('rebuildNow', perfT0, scanTick0, {
        reason: why,
        status: 'queued',
        turns: Number(S.turnList.length || 0),
      });
      return queued;
    }

    S.rebuildInFlight = true;
    let out = makeRebuildResult(why, 'not-ready');
    try {
      const ensured = ensureUiRefsForRebuild(why);
      out.built.ui = !!ensured.ready;
      if (!ensured.ready) {
        out.reason = 'ui-missing';
        out.retry.scheduled = scheduleRetry('ui-missing', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }

      const list = indexTurns();
      out.built.turns = Array.isArray(list) ? list.length : 0;
      if (!out.built.turns) {
        out.reason = 'turns-empty';
        out.retry.scheduled = scheduleRetry('turns-empty', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }

      const rt = MM_rt();
      let map = null;
      let usedFallbackEnsureButtons = false;
      if (rt && typeof rt.ensureButtons === 'function') {
        try {
          map = rt.ensureButtons({
            reason: `core:${why}`,
            turns: S.turnList.slice(),
            refs: ensured.refs || {},
          }) || null;
        } catch (e) {
          safeDiag('err', 'core.rebuildNow:rt.ensureButtons', e);
        }
      }
      if (!(map instanceof Map)) {
        map = ensureTurnButtons(S.turnList);
        usedFallbackEnsureButtons = true;
      }
      out.built.buttons = !!(map && map.size >= 0);
      if (!out.built.buttons) {
        out.status = 'partial';
        out.reason = 'buttons-missing';
        out.retry.scheduled = scheduleRetry('buttons-missing', why);
        out.retry.count = S.retryCount;
        out.retry.kind = S.retryKind;
        S.lastRebuildResult = out;
        return out;
      }
      if (!usedFallbackEnsureButtons) {
        try { repaintAllMiniBtns(); } catch {}
      }
      try { finalizeRebuildUi(why); } catch {}
      try {
        const chatId = resolveChatId();
        if (chatId) saveTurnCache(chatId, S.turnList);
      } catch {}
      clearRetry();
      try {
        const sh2 = TOPW.H2O_MM_SHARED?.get?.();
        if (sh2?.state) sh2.state.didEverBuildButtons = true;
      } catch {}
      try { W.H2O_MM_bindDelegatedHandlersOnce?.(); } catch {}
      emitAnswersScan(`core:${S.rebuildReason}`);

      out.status = 'ok';
      out.ok = true;
      out.reason = why;
      out.retry.scheduled = false;
      out.retry.count = 0;
      out.retry.kind = '';
      S.lastRebuildResult = out;
      return out;
    } catch (e) {
      safeDiag('err', 'core.rebuildNow', e);
      const failed = makeRebuildResult(why, 'error');
      failed.reason = 'error';
      failed.retry.scheduled = scheduleRetry('error', why);
      failed.retry.count = S.retryCount;
      failed.retry.kind = S.retryKind;
      S.lastRebuildResult = failed;
      return failed;
    } finally {
      S.rebuildInFlight = false;
      S.rebuildQueuedReason = '';
      perfReportDuration('rebuildNow', perfT0, scanTick0, {
        reason: why,
        status: String(S.lastRebuildResult?.status || out?.status || ''),
        turns: Number(S.lastRebuildResult?.built?.turns || out?.built?.turns || 0),
      });
    }
  }

  function clearEmptyRetry() {
    clearRetry();
    S.emptyRetryTimer = null;
    S.emptyRetryCount = 0;
  }

  function scheduleEmptyRetry(reason = 'core:empty') {
    scheduleRetry('turns-empty', reason);
  }

  function scheduleRebuild(reason = 'core:rebuild') {
    S.rebuildReason = String(reason || 'core:rebuild');
    perfMarkRebuildTrigger(S.rebuildReason);
    if (S.rebuildRaf || S.rebuildTimer) return true;
    const token = (S.rebuildToken += 1);
    const schedule = TOPW?.H2O?.runtime?.schedule || W?.H2O?.runtime?.schedule || null;
    if (schedule) {
      S.rebuildRaf = schedule.rafOnce('minimap:rebuild', () => { runScheduledRebuild(token); });
      S.rebuildTimer = schedule.timeoutOnce('minimap:rebuild:fallback', REBUILD_FALLBACK_MS, () => {
        runScheduledRebuild(token);
      });
      return true;
    }
    S.rebuildRaf = requestAnimationFrame(() => { runScheduledRebuild(token); });
    S.rebuildTimer = setTimeout(() => {
      runScheduledRebuild(token);
    }, REBUILD_FALLBACK_MS);
    return true;
  }

  function resnapshot(reason = 'core:resnapshot') {
    indexTurns();
    return S.turnList;
  }

  function refreshAnswers(reason = 'core:refreshAnswers') {
    return rebuildNow(reason);
  }

  function initCore() {
    if (S.inited) return true;
    S.inited = true;
    indexTurns();
    syncCurrentViewArtifacts(true);
    bindMarginSymbolsBridge();
    bindWashBridge();
    bindViewBridge();
    return true;
  }

  function disposeCore() {
    invalidateScheduledRebuild();
    clearEmptyRetry();
    S.rebuildInFlight = false;
    S.rebuildQueuedReason = '';
    if (S.gutterSyncRaf) {
      try { cancelAnimationFrame(S.gutterSyncRaf); } catch {}
      S.gutterSyncRaf = 0;
    }
    S.gutterSyncQueue.clear();
    if (S.washRepaintRaf) {
      try { cancelAnimationFrame(S.washRepaintRaf); } catch {}
      S.washRepaintRaf = 0;
    }
    S.washRepaintQueue.clear();
    S.washRepaintAll = false;
    S.lastActiveBtnEl = null;
    S.lastActiveTurnIdFast = '';
    S.lastActiveBtnId = '';
    if (S.dividerDrag) {
      try { window.removeEventListener('pointermove', S.dividerDrag.move, true); } catch {}
      try { window.removeEventListener('pointerup', S.dividerDrag.up, true); } catch {}
      try { window.removeEventListener('pointercancel', S.dividerDrag.up, true); } catch {}
      S.dividerDrag = null;
    }
    unbindMarginSymbolsBridge();
    unbindWashBridge();
    unbindViewBridge();
    S.inited = false;
    return true;
  }

  const CORE_API = {
    ver: CORE_VER,
    initCore,
    disposeCore,
    scheduleRebuild,
    rebuildNow,
    refreshAnswers,
    resnapshot,
    getTurnIndex,
    getTurns,
    refreshTurnsCache,
    resolveBtnId,
    turnIdxForAnswerEl,
    findMiniBtn,
    getTurnList,
    getTurnById,
    getBtnById,
    ensureTurnButtons,
    loadTurnCache,
    clearTurnCache,
    saveTurnCache,
    getMiniDividers,
    getMiniDividerById,
    getMiniDividerByAfterTurn,
    getSelectedMiniDividerId,
    selectMiniDivider,
    createMiniDivider,
    upsertMiniDivider,
    removeMiniDividerById,
    removeMiniDividerByAfterTurn,
    renderMiniDividerOverlay,
    renderFromCache,
    validateTurnsAgainstPagination,
    hydrateIndexFromDisk,
    renderFromIndex,
    appendTurnFromAnswerEl,
    attachVisibleAnswers,
    repaintMiniBtnByAnswerId,
    repaintAllMiniBtns,
    updateMiniMapGutterSymbol,
    syncMiniMapGutterForAnswer,
    scheduleMiniMapGutterSync,
    setActive,
    centerOn,
    centerOnPageDivider,
    updateCounter,
    updateToggleColor,
    syncActiveFromViewport,
    computeActiveFromViewport,
    applyTempFlash,
    flashAnswer,
    getAnswerList: () => S.answerEls.slice(),
    getBehavior,
    setBehavior,
    validateBehavior,
  };

  function installGlobalApi() {
    const resolveAnyId = (firstArg) => {
      if (typeof firstArg === 'string' || typeof firstArg === 'number') return String(firstArg);
      const ds = firstArg?.dataset || null;
      return String(
        ds?.id ||
        ds?.turnId ||
        ds?.primaryAId ||
        firstArg?.id ||
        firstArg?.turnId ||
        firstArg?.answerId ||
        firstArg?.activeTurnId ||
        ''
      ).trim();
    };
    const installAliasesOn = (T) => {
      if (!T) return;
      T.H2O_MM_getAnswersSafe = () => CORE_API.getAnswerList();
      T.getAnswers = () => CORE_API.getAnswerList();
      T.H2O_MM_getTurns = (...args) => CORE_API.getTurns?.(...args);
      T.H2O_MM_refreshTurnsCache = (...args) => CORE_API.refreshTurnsCache?.(...args);
      T.H2O_MM_resolveBtnId = (...args) => CORE_API.resolveBtnId?.(...args);
      T.H2O_MM_turnIdxForAnswerEl = (...args) => CORE_API.turnIdxForAnswerEl?.(...args);
      T.H2O_MM_findMiniBtn = (...args) => CORE_API.findMiniBtn?.(...args);
      T.H2O_MM_updateMiniMapGutterSymbol = (...args) => CORE_API.updateMiniMapGutterSymbol?.(...args);
      T.setActiveMiniMapButton = (...args) => {
        const id = resolveAnyId(args[0]);
        return id ? CORE_API.setActive(id, 'legacy-global') : false;
      };
      T.centerMiniMapOnId = (...args) => {
        const id = resolveAnyId(args[0]);
        const opts = (args[1] && typeof args[1] === 'object') ? args[1] : {};
        return id ? CORE_API.centerOn(id, opts) : false;
      };
      T.updateCounterToId = (id) => CORE_API.updateCounter(resolveAnyId(id));
      T.updateToggleColorById = (id) => CORE_API.updateToggleColor(resolveAnyId(id));
      T.updateActiveMiniMapBtn = (arg = {}) => {
        const opts = (arg && typeof arg === 'object' && !Array.isArray(arg)) ? arg : {};
        return CORE_API.syncActiveFromViewport(opts);
      };
      T.H2O_MM_repaintMiniBtnByAnswerId = (...args) => CORE_API.repaintMiniBtnByAnswerId(...args);
      T.H2O_MM_repaintAllMiniBtns = (...args) => CORE_API.repaintAllMiniBtns(...args);
      T.applyTempFlash = (...args) => CORE_API.applyTempFlash(...args);
      T.flashAnswer = (...args) => CORE_API.flashAnswer(...args);
      if (typeof T.updateMiniMapGutterSymbol !== 'function') {
        T.updateMiniMapGutterSymbol = (...args) => CORE_API.updateMiniMapGutterSymbol?.(...args);
      }
      if (typeof T.H2O_MM_coreRebuildNow !== 'function') {
        T.H2O_MM_coreRebuildNow = (...args) => CORE_API.rebuildNow(...args);
      }
      if (typeof T.H2O_MM_coreScheduleRebuild !== 'function') {
        T.H2O_MM_coreScheduleRebuild = (...args) => CORE_API.scheduleRebuild(...args);
      }
      if (typeof T.enhanceAll !== 'function') {
        T.enhanceAll = () => CORE_API.rebuildNow('main:shim');
      }
      if (typeof T.h2oEnhanceAll !== 'function') {
        T.h2oEnhanceAll = (..._args) => T.enhanceAll();
      }
      if (typeof T.h2oRebuildMiniMap !== 'function') {
        T.h2oRebuildMiniMap = (..._args) => T.enhanceAll();
      }
    };
    installAliasesOn(TOPW);
    if (W !== TOPW) installAliasesOn(W);
    try { TOPW.H2O_MM_CORE_PLUGIN = true; } catch {}
    try { TOPW.H2O_MM_CORE_VER = CORE_VER; } catch {}
    try { TOPW.H2O_MM_CORE_READY = true; } catch {}
  }

  function installIntoKernelShared() {
    try {
      const root = TOPW.H2O_MM_SHARED;
      if (!root || typeof root !== 'object') return false;
      root.api = (root.api && typeof root.api === 'object') ? root.api : {};
      root.api.core = CORE_API;
      root.api.rt = root.api.rt || null;
      root.api.ui = root.api.ui || null;
      const vaultApi = TOPW?.H2O?.MM?.mnmp?.api;
      if (vaultApi && typeof vaultApi === 'object') {
        vaultApi.core = CORE_API;
        vaultApi.rt = vaultApi.rt || null;
        vaultApi.ui = vaultApi.ui || null;
      }
      return true;
    } catch {
      return false;
    }
  }

  function clearInstallTimer() {
    try { if (S.installTimer) clearTimeout(S.installTimer); } catch {}
    S.installTimer = null;
  }

  function scheduleInstallRetry() {
    clearInstallTimer();
    S.installTimer = setTimeout(() => {
      S.installTries += 1;
      const ok = installIntoKernelShared();
      if (ok) return;
      if (S.installTries >= MAX_TRIES) {
        warn('Kernel shared bridge not found; Core kept global-only.', { tries: S.installTries });
        return;
      }
      scheduleInstallRetry();
    }, GAP_MS);
  }

  installGlobalApi();
  initCore();
  if (!installIntoKernelShared()) scheduleInstallRetry();
})();
