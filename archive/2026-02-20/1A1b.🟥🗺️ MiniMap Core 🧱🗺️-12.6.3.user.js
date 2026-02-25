// ==UserScript==
// @name         1A1b.🟥🗺️ MiniMap Core 🧱🗺️
// @namespace    H2O.Prime.CGX.MiniMapCore
// @version      12.6.3
// @description  MiniMap Core: state/index/rebuild/registry authority
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
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

  const CORE_VER = '12.6.3';
  const MAX_TRIES = 80;
  const GAP_MS = 120;
  const REBUILD_DEBOUNCE_MS = 120;

  const S = {
    inited: false,
    installTries: 0,
    installTimer: null,
    rebuildTimer: null,
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
  };

  const UI_TOK = Object.freeze({
    OWNER: 'mnmp',
    COL: 'mnmp-col',
    WRAP: 'mnmp-wrap',
    BTN: 'mnmp-btn',
    COL_LEGACY: 'mm-col',
    WRAP_LEGACY: 'mm-wrap',
    BTN_LEGACY: 'mm-btn',
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
  const KEY_MARGIN_SYMBOLS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols:v1';
  const KEY_MARGIN_SYMBOL_COLORS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:symbols_colors:v1';
  const KEY_MARGIN_PINS_FALLBACK = 'h2o:prm:cgx:mrgnnchr:state:pins:v1';

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
    S.mapButtons = m;
    try { W.H2O_MM_mapButtons = m; } catch {}
    try { W.mapButtons = m; } catch {}
    return m;
  }

  function storageGetJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(String(key));
      if (raw == null) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
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
    if (mounted.sym.textContent !== first) mounted.sym.textContent = first;

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

  function indexTurns() {
    let answers = [];
    const list = [];
    const byId = new Map();
    const byAId = new Map();
    const answerByTurn = new Map();

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
    btn.dataset.id = String(turn.turnId);
    btn.dataset.turnId = String(turn.turnId);
    btn.dataset.primaryAId = String(turn.answerId || '');
    btn.dataset.turnIdx = String(turn.index || 0);
    btn.innerHTML = '<span class="cgxui-mm-qfrom" aria-hidden="true"></span>'
      + '<span class="cgxui-mm-qto" aria-hidden="true"></span>'
      + `<span class="cgxui-mm-num" aria-hidden="true">${turn.index}</span>`;

    wrap.appendChild(btn);
    return { wrap, btn };
  }

  function ensureTurnButtons(list = S.turnList) {
    const turns = Array.isArray(list) ? list : [];
    const col = ensureCol();
    if (!col) return null;
    if (!turns.length) return ensureMapStore();

    const map = ensureMapStore();
    const marginSymbolMetaMap = getMarginSymbolMetaMap();
    const keepTurnIds = new Set();
    const frag = document.createDocumentFragment();

    for (const turn of turns) {
      const turnId = String(turn?.turnId || '').trim();
      if (!turnId) continue;
      keepTurnIds.add(turnId);

      const answerId = String(turn?.answerId || '').trim();
      const key = turnId;
      let btn = map.get(turnId) || map.get(answerId);
      if (!btn || !btn.isConnected) {
        const made = createBtn(turn);
        btn = made.btn;
        frag.appendChild(made.wrap);
      } else {
        const host =
          btn.closest(`[data-cgxui="${UI_TOK.WRAP}"]`) ||
          btn.closest(`[data-cgxui="${UI_TOK.WRAP_LEGACY}"]`);
        if (host) frag.appendChild(host);
      }

      btn.dataset.id = turnId;
      btn.dataset.turnId = turnId;
      btn.dataset.primaryAId = answerId;
      btn.dataset.turnIdx = String(turn.index || 0);
      const num = btn.querySelector('.cgxui-mm-num');
      if (num) num.textContent = String(turn.index || '');
      const symbolMeta = getMarginSymbolMetaForAnswer(answerId, marginSymbolMetaMap);
      updateMiniMapGutterSymbol(btn, symbolMeta.symbols, { color: String(symbolMeta.colors[0] || '').trim() });

      map.set(turnId, btn);
      if (answerId) map.set(answerId, btn);
    }

    col.textContent = '';
    col.appendChild(frag);

    for (const [k, btn] of Array.from(map.entries())) {
      const turnId = String(btn?.dataset?.turnId || '').trim();
      if (turnId && keepTurnIds.has(turnId)) continue;
      try {
        (btn?.closest?.(`[data-cgxui="${UI_TOK.WRAP}"]`) ||
         btn?.closest?.(`[data-cgxui="${UI_TOK.WRAP_LEGACY}"]`))?.remove?.();
      } catch {}
      map.delete(k);
    }

    for (const turn of turns) {
      const answerId = String(turn?.answerId || '').trim();
      if (answerId) {
        try { W.syncMiniMapDot?.(answerId); } catch {}
      }
      try { W.H2O_MM_syncQuoteBadgesForIdx?.(getBtnById(turn.turnId), turn.index); } catch {}
    }

    return map;
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
    return key ? (S.turnById.get(key) || null) : null;
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

    let pickedTurn = null;

    if (turns.length) {
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
          const el = t?.el || (t?.answerId ? q(`[data-message-id="${escAttr(t.answerId)}"]`) : null);
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
      return { activeTurnId: turnId, activeAnswerId: answerId, activeBtnIndex: idx };
    }

    const answers = S.answerEls.length ? S.answerEls : getAnswerEls();
    if (!answers.length) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0 };

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

    if (!bestEl) return { activeTurnId: '', activeAnswerId: '', activeBtnIndex: 0 };
    const aId = String(getMessageId(bestEl) || '').trim();
    const turnId = aId ? (S.turnIdByAId.get(aId) || '') : '';
    return {
      activeTurnId: turnId,
      activeAnswerId: aId,
      activeBtnIndex: getTurnIndex(turnId || aId),
    };
  }

  function setActive(anyId, reason = 'core') {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const turn = findTurnByAnyId(key);
    const targetTurnId = String(turn?.turnId || key).trim();
    if (!targetTurnId) return false;

    const btns = qq(mmBtnSelector());
    for (const b of btns) {
      const on = String(b?.dataset?.id || b?.dataset?.turnId || '').trim() === targetTurnId;
      b.classList.toggle('active', on);
      b.classList.toggle('inview', on);
      setStateToken(b, 'active', on);
      setStateToken(b, 'inview', on);
      if (on) b.setAttribute('data-cgxui-inview', '1');
      else b.removeAttribute('data-cgxui-inview');
    }

    updateCounter(targetTurnId);
    updateToggleColor(targetTurnId);
    S.lastActiveIndex = Number(turn?.index || getTurnIndex(targetTurnId) || S.lastActiveIndex || 0);
    return true;
  }

  function centerOn(anyId, { force = false, smooth = true } = {}) {
    const key = String(anyId || '').trim();
    if (!key) return false;
    const btn = getBtnById(key);
    if (!btn) return false;

    const s = getMiniMapScroller(btn);
    if (s?.scrollTo) {
      const scrollerTop = s.getBoundingClientRect().top;
      const btnTop = btn.getBoundingClientRect().top;
      const current = s.scrollTop || 0;
      const delta = (btnTop - scrollerTop) - (s.clientHeight / 2 - btn.clientHeight / 2);
      s.scrollTo({
        top: Math.max(0, current + delta),
        behavior: smooth ? 'smooth' : 'auto',
      });
    } else {
      try { btn.scrollIntoView?.({ block: 'center', behavior: smooth ? 'smooth' : 'auto' }); } catch {}
    }

    setActive(btn.dataset.turnId || key);
    return true;
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

  function updateCounter(anyId = '') {
    const key = String(anyId || '').trim();
    const total = Number(
      W?.H2O?.turn?.total?.()
      || S.turnList.length
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
      if (total > 100) {
        tEl.style.color = '#ff6b6b';
        tEl.style.textShadow = '0 0 8px rgba(255,107,107,0.45)';
      } else {
        tEl.style.color = '';
        tEl.style.textShadow = '';
      }
    }

    if (key) updateToggleColor(key);
    return true;
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

  function applyTempFlash(answerEl) {
    const target = answerEl?.querySelector?.('[data-message-content]') || answerEl;
    if (!target) return false;
    try {
      target.classList?.add?.('cgxui-wash-wrap');
      target.classList?.remove?.('cgxui-flash');
      try { target.removeAttribute('data-cgxui-flash'); } catch {}
      void target.offsetWidth;
      target.classList?.add?.('cgxui-flash');
      try { target.setAttribute('data-cgxui-flash', '1'); } catch {}
      setTimeout(() => {
        try { target.classList?.remove?.('cgxui-flash'); } catch {}
        try { target.removeAttribute('data-cgxui-flash'); } catch {}
      }, 2200);
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

  function rebuildNow(reason = 'core:rebuildNow') {
    const why = String(reason || 'core:rebuildNow');
    S.rebuildReason = why;
    if (S.rebuildInFlight) {
      S.rebuildQueuedReason = why;
      const queued = makeRebuildResult(why, 'queued');
      S.lastRebuildResult = queued;
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
      if (!(map instanceof Map)) map = ensureTurnButtons(S.turnList);
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
      const queued = String(S.rebuildQueuedReason || '').trim();
      S.rebuildQueuedReason = '';
      if (queued && queued !== why) scheduleRebuild(`${queued}:queued`);
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
    if (S.rebuildTimer) return true;
    S.rebuildTimer = setTimeout(() => {
      S.rebuildTimer = null;
      rebuildNow(S.rebuildReason);
    }, REBUILD_DEBOUNCE_MS);
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
    bindMarginSymbolsBridge();
    return true;
  }

  function disposeCore() {
    try { if (S.rebuildTimer) clearTimeout(S.rebuildTimer); } catch {}
    S.rebuildTimer = null;
    clearEmptyRetry();
    S.rebuildInFlight = false;
    S.rebuildQueuedReason = '';
    if (S.gutterSyncRaf) {
      try { cancelAnimationFrame(S.gutterSyncRaf); } catch {}
      S.gutterSyncRaf = 0;
    }
    S.gutterSyncQueue.clear();
    unbindMarginSymbolsBridge();
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
    updateMiniMapGutterSymbol,
    syncMiniMapGutterForAnswer,
    scheduleMiniMapGutterSync,
    setActive,
    centerOn,
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
