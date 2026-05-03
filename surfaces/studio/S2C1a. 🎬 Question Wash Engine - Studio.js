// ==UserScript==
// @h2o-id             s2c1a.question.wash.engine.studio
// @name               S2C1a. 🎬 Question Wash Engine - Studio
// @namespace          H2O.Premium.CGX.question.wash.engine
// @author             HumamDev
// @version            1.0.2
// @revision           001
// @build              260304-102754
// @description        Double-middle-click a page question bubble, or middle-click a Q+A minimap question box, to open the persistent question wash palette. Storage key: h2o:qwash:map:v1
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

/*
How to use:
- Double-middle-click on a user question bubble to open the wash palette.
- In MiniMap Q+A view, middle-click the top question box to open the same palette.
- Pick a color to apply wash; click "X" to clear/remove wash.
- Washes are persisted in localStorage key: h2o:qwash:map:v1
*/

(function questionWashEngine() {
  'use strict';

  const W = window;
  const D = document;
  const TOPW = W.top || W;

  const NS = 'cgxq-qwash';
  const STYLE_ID = `${NS}-style`;
  const STORAGE_KEY = 'h2o:qwash:map:v1';
  const STORAGE_QWASH_VIS_KEY = 'h2o:prm:cgx:mnmp:ui:badgeVisibility:qwash:v1';
  const EV_CORE_INDEX_UPDATED = 'evt:h2o:core:index:updated';
  const EV_CORE_INDEX_UPDATED_ALIAS = 'index:updated';
  const EV_CORE_INDEX_UPDATED_ALIAS2 = 'h2o:index:updated';
  const EV_MM_INDEX_HYDRATED = 'evt:h2o:minimap:index:hydrated';
  const EV_MM_INDEX_APPENDED = 'evt:h2o:minimap:index:appended';
  const EV_QWRAP_WRAPPED = 'h2o:qwrap:wrapped';
  const EV_OBS_READY = 'evt:h2o:obs:ready';
  const EV_OBS_MUTATIONS = 'evt:h2o:obs:mutations';
  const EV_OBS_FLUSH = 'evt:h2o:obs:flush';
  const EV_MSG_REMOUNTED = 'evt:h2o:message:remounted';
  const EV_MSG_REMOUNTED_ALIAS = 'h2o:message:remounted';
  const EV_MSG_REMOUNTED_ALIAS2 = 'message:remounted';
  const OPEN_DEBOUNCE_MS = 240;
  const DOUBLE_MIDDLE_MS = 280;
  const DOUBLE_MIDDLE_SLOP_PX = 12;
  const RESCAN_DELAY_MS = 100;
  const BOOT_RETRY_DELAYS_MS = Object.freeze([120, 260, 480, 900, 1500, 2400]);
  const QUESTION_WASH_ALPHA_DARK = 0.32;
  const QUESTION_WASH_ALPHA_LIGHT = 0.26;

  const CLS = Object.freeze({
    HOST: `${NS}-host`,
    ON: `${NS}-on`,
    PALETTE: `${NS}-palette`,
    SWATCH: `${NS}-swatch`,
    MM_ON: `${NS}-mm-on`,
    MM_NUM_ON: `${NS}-mm-num-on`,
  });

  // Exact fallback copy from: 1A2 Answer Wash Engine palette block.
  const DEFAULT_COLORS = Object.freeze([
    // FIRST ROW
    { name:'blue',   color:'#3A8BFF' },
    { name:'red',    color:'#FF4A4A' },
    { name:'green',  color:'#31D158' },
    { name:'gold',   color:'#FFD700' },

    // SECOND ROW
    { name:'sky',    color:'#4CD3FF' },
    { name:'pink',   color:'#FF71C6' },
    { name:'purple', color:'#A36BFF' },
    { name:'orange', color:'#FFA63A' }
  ]);

  const state = {
    washMap: loadWashMap(),
    paletteDef: resolvePalette(),
    elToKey: new WeakMap(),
    keyToEl: new Map(),
    scanTimer: 0,
    scanRaf: 0,
    isApplying: false,
    lastOpenAt: 0,
    lastOpenKey: '',
    lastOpenXY: { x: 0, y: 0 },
    lastQuestionMidAt: 0,
    lastQuestionMidKey: '',
    lastQuestionMidXY: { x: 0, y: 0 },
    miniMapQaRepaintRaf: 0,
    popover: null,
    currentTargetKey: '',
    observer: null,
    bootRetryIndex: 0,
    bootRetryTimer: 0,
    bootPassTimers: [],
    hydrationWatchdogTimer: 0,
    hydrationWatchdogUntil: 0,
    obsOffReady: null,
    obsOffMut: null,
  };

  injectStyle();
  buildPaletteUI();
  bindInputEvents();
  bindSPAObservers();
  bindRuntimeEvents();
  bindObserverHub();
  bindMiniMapVisibilityEvents();
  bindInteractionHydration();
  kickBootHydrationPasses();
  startHydrationWatchdog('boot');
  scheduleRescan('boot');

  function logWarn(...args) {
    try { console.warn('[QuestionWash]', ...args); } catch {}
  }

  function eventTargets() {
    return (TOPW && TOPW !== W) ? [W, TOPW] : [W];
  }

  function UTIL_isStudioMode() {
  try {
    if (window.H2O_STUDIO_MODE) return true;
    if (document.documentElement?.dataset?.h2oStudioMode === '1') return true;
    if (document.body?.dataset?.h2oStudioMode === '1') return true;
  } catch {}
  return false;
}

function DOM_QWASH_getStudioReaderRoot() {
  try {
    return (
      document.querySelector('[data-h2o-studio-reader="1"]') ||
      document.querySelector('.cgFrame[data-h2o-studio-reader="1"]') ||
      null
    );
  } catch {
    return null;
  }
}

function DOM_QWASH_getStudioConversationRoot() {
  try {
    return (
      document.querySelector('[data-h2o-studio-reader="1"] [data-testid="conversation-turns"]') ||
      document.querySelector('.cgScroll[data-testid="conversation-turns"]') ||
      document.querySelector('[data-testid="conversation-turns"]')
    );
  } catch {
    return null;
  }
}

function DOM_QWASH_getScopeRoot() {
  if (UTIL_isStudioMode()) {
    return DOM_QWASH_getStudioConversationRoot()
      || DOM_QWASH_getStudioReaderRoot()
      || document;
  }
  return document;
}

function DOM_QWASH_getObserverRoot() {
  if (UTIL_isStudioMode()) {
    return DOM_QWASH_getStudioConversationRoot()
      || DOM_QWASH_getStudioReaderRoot()
      || document.body
      || null;
  }
  return document.documentElement || document.body || null;
}

function dispatchDual(evtName, detail) {
    eventTargets().forEach((target) => {
      try { target.dispatchEvent(new CustomEvent(evtName, { detail })); } catch {}
    });
  }

  function isMiniMapQaViewActive() {
    try {
      const scope = DOM_QWASH_getScopeRoot();
    const host = scope.querySelector?.('[data-cgxui="mnmp-panel"][data-cgxui-view], [data-cgxui="mnmp-minimap"][data-cgxui-view], [data-h2o-owner="minimap-v10"][data-cgxui-view]');
      const view = String(host?.getAttribute?.('data-cgxui-view') || '').trim().toLowerCase();
      return view === 'qa';
    } catch {}
    return false;
  }

  function getMiniMapCoreRepaintAll() {
    const candidates = [
      TOPW?.H2O_MM_repaintAllMiniBtns,
      W?.H2O_MM_repaintAllMiniBtns,
      TOPW?.H2O_MM_SHARED?.get?.()?.api?.core?.repaintAllMiniBtns,
      W?.H2O_MM_SHARED?.get?.()?.api?.core?.repaintAllMiniBtns,
      TOPW?.H2O?.MM?.mnmp?.api?.core?.repaintAllMiniBtns,
      W?.H2O?.MM?.mnmp?.api?.core?.repaintAllMiniBtns,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'function') return candidate;
    }
    return null;
  }

  function requestMiniMapQaQuestionRepaint(reason = 'qwash') {
    if (!isMiniMapQaViewActive()) return false;
    if (state.miniMapQaRepaintRaf) return true;
    state.miniMapQaRepaintRaf = W.requestAnimationFrame(() => {
      state.miniMapQaRepaintRaf = 0;
      try { getMiniMapCoreRepaintAll()?.(reason); } catch {}
    });
    return true;
  }

  function loadWashMap() {
    try {
      const raw = W.localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.create(null);
      const parsed = JSON.parse(raw);
      return normalizeStoredWashMap(parsed);
    } catch {
      return Object.create(null);
    }
  }

  function saveWashMap() {
    try {
      state.washMap = normalizeStoredWashMap(state.washMap);
      W.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.washMap || Object.create(null)));
    } catch (err) {
      logWarn('Failed to save wash map', err);
    }
  }

  function normalizeStoredWashMap(rawMap) {
    if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) {
      return Object.create(null);
    }
    const out = Object.create(null);
    Object.entries(rawMap).forEach(([rawKey, rawEntry]) => {
      const key = String(rawKey || '').trim();
      const entry = coerceStoredWashEntry(rawEntry);
      if (!key || !entry) return;
      out[key] = entry;
    });
    return out;
  }

  function coerceStoredWashEntry(rawEntry) {
    if (rawEntry == null) return null;
    if (typeof rawEntry === 'string') {
      const colorId = normalizeStoredColorToken(rawEntry);
      return colorId ? { colorId, updatedAt: 0 } : null;
    }
    if (typeof rawEntry !== 'object' || Array.isArray(rawEntry)) return null;

    const colorId = normalizeStoredColorToken(
      rawEntry.colorId ?? rawEntry.color ?? rawEntry.colorName ?? rawEntry.name ?? rawEntry.c
    );
    if (!colorId) return null;

    const updatedAt = Number(rawEntry.updatedAt ?? rawEntry.ts ?? rawEntry.at ?? 0);
    return Number.isFinite(updatedAt) && updatedAt > 0
      ? { colorId, updatedAt }
      : { colorId, updatedAt: 0 };
  }

  function normalizeStoredColorToken(input) {
    return String(input || '').trim().toLowerCase();
  }

  function normalizeHex(input) {
    const s = String(input || '').trim();
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return '';
    if (s.length === 4) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
    }
    return s.toUpperCase();
  }

  function hexToRgba(hex, alpha = 0.16) {
    const n = normalizeHex(hex);
    if (!n) return 'rgba(58, 139, 255, 0.16)';
    const v = n.slice(1);
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function resolvePalette() {
    const fromMiniMap = getPaletteFromMiniMap();
    const source = fromMiniMap.length ? fromMiniMap : DEFAULT_COLORS;
    const byId = Object.create(null);
    source.forEach((c) => {
      const id = String(c.id || '').trim().toLowerCase();
      const hex = normalizeHex(c.hex || c.color);
      if (!id || !hex) return;
      byId[id] = {
        id,
        hex,
        washDark: hexToRgba(hex, QUESTION_WASH_ALPHA_DARK),
        washLight: hexToRgba(hex, QUESTION_WASH_ALPHA_LIGHT),
        deepDark: hexToRgba(hex, 0.40),
        deepLight: hexToRgba(hex, 0.34),
        edgeDark: hexToRgba(hex, 0.36),
        edgeLight: hexToRgba(hex, 0.30),
      };
    });
    return byId;
  }

  function getPaletteFromMiniMap() {
    const candidates = [];
    try {
      const washColorByName = TOPW?.H2O?.MM?.wash?.getColorByName?.();
      if (washColorByName && typeof washColorByName === 'object') {
        candidates.push(washColorByName);
      }
    } catch {}

    try {
      const shared = TOPW?.H2O_MM_SHARED?.get?.();
      if (shared && typeof shared === 'object') {
        candidates.push(shared?.palette?.colors);
        candidates.push(shared?.util?.palette?.colors);
        candidates.push(shared?.ui?.palette?.colors);
      }
    } catch {}

    for (const source of candidates) {
      const out = coercePalette(source);
      if (out.length) return out;
    }
    return [];
  }

  function coercePalette(source) {
    if (!source) return [];
    const out = [];
    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = String(item.id || item.name || '').trim().toLowerCase();
        const hex = normalizeHex(item.hex || item.color);
        if (!id || !hex) return;
        out.push({ id, hex });
      });
      return out;
    }
    if (typeof source === 'object') {
      Object.entries(source).forEach(([k, v]) => {
        const id = String(k || '').trim().toLowerCase();
        const hex = normalizeHex(v);
        if (!id || !hex) return;
        out.push({ id, hex });
      });
      return out;
    }
    return [];
  }

  function injectStyle() {
    let style = D.getElementById(STYLE_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = STYLE_ID;
    }
    style.textContent = `
      .${CLS.HOST} {
        position: relative !important;
        isolation: isolate;
      }

      .${CLS.HOST}.${CLS.ON} {
        background: var(--${NS}-wash-base, transparent) !important;
        box-shadow: var(--${NS}-wash-shadow, none) !important;
      }

      .${CLS.HOST}.${CLS.ON}::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(120% 90% at 14% 8%, var(--${NS}-wash-hi, rgba(255,255,255,0.015)) 0%, transparent 38%),
          linear-gradient(165deg, var(--${NS}-wash, rgba(58, 139, 255, 0.46)) 0%, var(--${NS}-wash-deep, rgba(58, 139, 255, 0.62)) 100%);
        border-radius: var(--${NS}-radius, 14px);
        box-shadow:
          inset 0 0 0 1px var(--${NS}-wash-edge, rgba(58, 139, 255, 0.66)),
          inset 0 -4px 8px -10px var(--${NS}-wash-lo, rgba(0, 0, 0, 0.08));
        filter: saturate(0.86) brightness(0.94);
        pointer-events: none;
        z-index: 0;
      }

      .${CLS.HOST}.${CLS.ON}::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: var(--${NS}-radius, 14px);
        background: linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.04) 0%,
          rgba(255, 255, 255, 0.012) 14%,
          transparent 44%,
          transparent 100%
        );
        opacity: 0.06;
        pointer-events: none;
        z-index: 0;
      }

      .${CLS.HOST}.${CLS.ON} > * {
        position: relative;
        z-index: 1;
      }

      .${CLS.MM_NUM_ON} {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        min-width: 18px !important;
        height: 16px !important;
        padding: 0 4px !important;
        border: 1.5px solid var(--${NS}-mm-ring, #3A8BFF) !important;
        background: var(--${NS}-mm-fill, rgba(58, 139, 255, 0.30)) !important;
        border-radius: 4px !important;
        box-sizing: border-box !important;
        line-height: 1 !important;
      }

      [data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"].cgx-mm-hide-qwash .${CLS.MM_NUM_ON},
      [data-h2o-owner="minimap-v10"].cgx-mm-hide-qwash .${CLS.MM_NUM_ON} {
        border-color: transparent !important;
        background: transparent !important;
        box-shadow: none !important;
      }
    `;
    if (!style.isConnected) D.documentElement.appendChild(style);
  }

  function buildPaletteUI() {
    const pop = D.createElement('div');
    pop.className = CLS.PALETTE;
    pop.setAttribute('aria-hidden', 'true');
    Object.assign(pop.style, {
      position: 'fixed',
      zIndex: '2147483647',
      display: 'none',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignContent: 'center',

      gap: '4px',
      width: '115px',
      height: '65px',
      boxSizing: 'border-box',

      borderRadius: '12px',
      background: 'rgba(255,255,255,0.04)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      transition: 'opacity 0.15s ease'
    });

    Object.values(state.paletteDef).forEach((entry) => {
      const swatch = D.createElement('div');
      swatch.className = CLS.SWATCH;
      swatch.title = entry.id;
      swatch.setAttribute('data-color-id', entry.id);
      Object.assign(swatch.style, {
        width: '22px',
        height: '22px',
        borderRadius: '6px',
        cursor: 'pointer',
        background: `color-mix(in srgb, ${entry.hex} 45%, #1a1a1a)`,
        boxShadow: 'inset 0 0 2px rgba(255,255,255,0.05)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
      });
      swatch.addEventListener('mouseenter', () => {
        swatch.style.transform = 'scale(1.1)';
        swatch.style.boxShadow = `0 0 6px color-mix(in srgb, ${entry.hex} 40%, transparent)`;
      });
      swatch.addEventListener('mouseleave', () => {
        swatch.style.transform = '';
        swatch.style.boxShadow = 'inset 0 0 2px rgba(255,255,255,0.05)';
      });
      const applyFromSwatch = (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        const key = state.currentTargetKey;
        const active = key ? normalizeColorId(state.washMap?.[key]?.colorId) : '';
        applyColorToCurrent(active === entry.id ? null : entry.id);
        hidePalette();
      };
      swatch.addEventListener('pointerdown', applyFromSwatch);
      swatch.addEventListener('click', (ev) => {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      });
      pop.appendChild(swatch);
    });
    D.body.appendChild(pop);
    state.popover = pop;

    const hideOnOutside = (ev) => {
      if (!state.popover || state.popover.style.display === 'none') return;
      if (Date.now() - state.lastOpenAt < 60) return;
      if (state.popover.contains(ev.target)) return;
      hidePalette();
    };

    D.addEventListener('pointerdown', hideOnOutside, true);
    D.addEventListener('mousedown', hideOnOutside, true);
    D.addEventListener('click', hideOnOutside, true);

    D.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') hidePalette();
    }, true);
    W.addEventListener('scroll', hidePalette, { passive: true });
    W.addEventListener('blur', hidePalette, true);
  }

  function bindInputEvents() {
    const supportsAux = ('onauxclick' in D);

    const isEventInsideQuestion = (questionEl, eventTarget) => {
      if (!questionEl || !(questionEl instanceof Element)) return false;
      if (!(eventTarget instanceof Node)) return false;
      return questionEl === eventTarget || questionEl.contains(eventTarget);
    };

    const isInScope = (node) => {
      const scope = DOM_QWASH_getScopeRoot();
      if (!scope || scope === document) return true;
      return !!(node instanceof Node && (scope === node || scope.contains(node)));
    };

    const openPaletteForKeyAt = (clientX, clientY, key) => {
      const resolvedKey = String(key || '').trim();
      if (!resolvedKey) return false;
      const now = Date.now();
      const x = Number.isFinite(clientX) ? clientX : 0;
      const y = Number.isFinite(clientY) ? clientY : 0;
      const dx = Math.abs(x - state.lastOpenXY.x);
      const dy = Math.abs(y - state.lastOpenXY.y);
      if (state.lastOpenKey === resolvedKey && (now - state.lastOpenAt) < OPEN_DEBOUNCE_MS && dx < 4 && dy < 4) {
        return false;
      }
      state.lastOpenAt = now;
      state.lastOpenKey = resolvedKey;
      state.lastOpenXY = { x, y };
      showPaletteAt(x, y, resolvedKey);
      return true;
    };

    const getMiniMapQaQuestionBtnFromNode = (node) => {
      const start = (node instanceof Element) ? node : node?.parentElement;
      if (!start) return null;
      const btn = start.closest?.('[data-cgxui="mnmp-qbtn"], [data-cgxui="mm-qbtn"], .cgxui-mm-qbtn');
      if (!(btn instanceof HTMLElement)) return null;
      if (String(btn.dataset?.surfaceRole || '').trim().toLowerCase() !== 'question') return null;
      const viewHost = btn.closest?.('[data-cgxui-view]');
      const view = String(viewHost?.getAttribute?.('data-cgxui-view') || '').trim().toLowerCase();
      if (view && view !== 'qa') return null;
      return btn;
    };

    const resolveQuestionKeyForMeta = ({ questionId = '', turnId = '', turnIndex = 0 } = {}) => {
      const qId = String(questionId || '').trim();
      const tId = String(turnId || '').trim();
      const idx = Math.max(0, Number(turnIndex || 0) || 0);
      const rememberItem = (item) => {
        const key = String(item?.key || '').trim();
        const el = item?.el;
        if (key && el instanceof Element) {
          state.keyToEl.set(key, el);
          state.elToKey.set(el, key);
        }
        return key;
      };

      for (const key of [
        qId ? `id:${qId}` : '',
        tId ? `id:${tId}` : '',
        idx > 0 ? `ord:${threadScopeKey()}:${idx}` : '',
      ]) {
        if (!key) continue;
        if (state.keyToEl.has(key)) return key;
      }

      const snapshot = buildSnapshot(collectQuestionBlocks());
      if (qId) {
        const byQuestionId = snapshot.find((item) => (
          String(item?.questionId || '').trim() === qId
          || String(item?.stableId || '').trim() === qId
          || String(item?.id || '').trim() === qId
        ));
        if (byQuestionId?.key) return rememberItem(byQuestionId);
      }
      if (tId) {
        const byTurnId = snapshot.find((item) => (
          String(item?.turnId || '').trim() === tId
          || String(item?.id || '').trim() === tId
        ));
        if (byTurnId?.key) return rememberItem(byTurnId);
      }
      if (idx > 0) {
        const byTurnIndex = snapshot.find((item) => (
          Math.max(0, Number(item?.turnIndex || 0) || 0) === idx
          || (Math.max(0, Number(item?.idx || 0) || 0) + 1) === idx
        ));
        if (byTurnIndex?.key) return rememberItem(byTurnIndex);
      }
      return '';
    };

    const resolveMiniMapQuestionKey = (qBtn) => {
      if (!(qBtn instanceof HTMLElement)) return '';
      return resolveQuestionKeyForMeta({
        questionId: qBtn.dataset?.questionId,
        turnId: qBtn.dataset?.turnId,
        turnIndex: qBtn.dataset?.turnIdx,
      });
    };

    const openFromMiniMapQuestionMiddle = (ev) => {
      if (!ev || ev.button !== 1) return false;
      if (!isInScope(ev?.target)) return false;
      const qBtn = getMiniMapQaQuestionBtnFromNode(ev.target);
      if (!qBtn) return false;
      const key = resolveMiniMapQuestionKey(qBtn);
      if (!key) return false;

      ev.preventDefault();
      ev.stopPropagation();

      const rect = qBtn.getBoundingClientRect?.() || null;
      const clientX = Number.isFinite(ev?.clientX) ? ev.clientX : Math.round((rect?.left || 0) + ((rect?.width || 0) / 2));
      const clientY = Number.isFinite(ev?.clientY) ? ev.clientY : Math.round((rect?.top || 0) + ((rect?.height || 0) / 2));
      return openPaletteForKeyAt(clientX, clientY, key);
    };

    const openFromQuestionDoubleMiddle = (ev) => {
      if (!ev || ev.button !== 1) return false;
      if (!isInScope(ev?.target)) return false;
      if (getMiniMapQaQuestionBtnFromNode(ev.target)) return false;

      const question = findQuestionBlockFromNode(ev.target);
      if (!question) return false;
      if (!isEventInsideQuestion(question, ev.target)) return false;
      const key = getKeyForElement(question);
      if (!key) return false;

      ev.preventDefault();
      ev.stopPropagation();

      const clientX = Number.isFinite(ev?.clientX) ? ev.clientX : 0;
      const clientY = Number.isFinite(ev?.clientY) ? ev.clientY : 0;
      const now = performance.now();
      const delta = now - Number(state.lastQuestionMidAt || 0);
      const dx = Math.abs(clientX - Number(state.lastQuestionMidXY?.x || 0));
      const dy = Math.abs(clientY - Number(state.lastQuestionMidXY?.y || 0));
      const isSame = (
        state.lastQuestionMidKey === key
        && delta < DOUBLE_MIDDLE_MS
        && dx <= DOUBLE_MIDDLE_SLOP_PX
        && dy <= DOUBLE_MIDDLE_SLOP_PX
      );

      state.lastQuestionMidAt = now;
      state.lastQuestionMidKey = key;
      state.lastQuestionMidXY = { x: clientX, y: clientY };

      if (!isSame) return true;
      return openPaletteForKeyAt(clientX, clientY, key);
    };

    const handleMiddleInput = (ev) => {
      if (!ev || ev.button !== 1) return;
      if (!isInScope(ev?.target)) return;
      if (openFromMiniMapQuestionMiddle(ev)) return;
      openFromQuestionDoubleMiddle(ev);
    };

    const suppressMiddleDown = (ev) => {
      if (!ev || ev.button !== 1) return;
      if (getMiniMapQaQuestionBtnFromNode(ev.target)) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const question = findQuestionBlockFromNode(ev.target);
      if (!question) return;
      if (!isEventInsideQuestion(question, ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };

    if (supportsAux) {
      D.addEventListener('mousedown', suppressMiddleDown, true);
      D.addEventListener('auxclick', handleMiddleInput, true);
    } else {
      D.addEventListener('mousedown', handleMiddleInput, true);
    }
  }

  function bindInteractionHydration() {
  const kickFromInteraction = (ev) => {
    if (!hasStoredWashes()) return;

    const scope = DOM_QWASH_getScopeRoot();
    if (scope !== document) {
      const target = ev?.target;
      if (!(target instanceof Node) || (!scope.contains(target) && scope !== target)) return;
    }

    const question = findQuestionBlockFromNode(ev?.target);
    if (!question) return;
    runApplyPass(`interaction:${ev?.type || 'event'}`);
    scheduleRescan(`interaction:${ev?.type || 'event'}:followup`);
  };

  ['pointerdown', 'mousedown', 'click', 'auxclick'].forEach((type) => {
    try { D.addEventListener(type, kickFromInteraction, true); } catch {}
  });
}

  function getObserverHub() {
    return TOPW?.H2O?.obs || W?.H2O?.obs || TOPW?.H2O?.observerHub || W?.H2O?.observerHub || null;
  }

  function disconnectSpaObserver() {
    if (!state.observer) return false;
    try { state.observer.disconnect(); } catch {}
    state.observer = null;
    return true;
  }

  function bindSPAObservers() {
    const hub = getObserverHub();
    disconnectSpaObserver();

    if (!(hub && typeof hub.onReady === 'function' && typeof hub.onMutations === 'function')) {
      state.observer = new MutationObserver((mutList) => {
        if (state.isApplying) return;
        for (const m of mutList) {
          if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
            scheduleRescan('dom');
            return;
          }
        }
      });

      const obsRoot = DOM_QWASH_getObserverRoot();
      if (obsRoot) {
        state.observer.observe(obsRoot, {
          childList: true,
          subtree: true,
        });
      }
    }

    W.addEventListener('popstate', () => {
      resetHydrationState('popstate');
      scheduleRescan('popstate');
    }, true);
    W.addEventListener('hashchange', () => {
      resetHydrationState('hashchange');
      scheduleRescan('hashchange');
    }, true);

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
  }

  function bindRuntimeEvents() {
    const onRuntimeChanged = () => scheduleRescan('runtime:index');
    [
      EV_CORE_INDEX_UPDATED,
      EV_CORE_INDEX_UPDATED_ALIAS,
      EV_CORE_INDEX_UPDATED_ALIAS2,
      EV_MM_INDEX_HYDRATED,
      EV_MM_INDEX_APPENDED,
      EV_QWRAP_WRAPPED,
      EV_OBS_READY,
      EV_OBS_MUTATIONS,
      EV_OBS_FLUSH,
      EV_MSG_REMOUNTED,
      EV_MSG_REMOUNTED_ALIAS,
      EV_MSG_REMOUNTED_ALIAS2,
    ].forEach((evtName) => {
      eventTargets().forEach((target) => {
        try { target.addEventListener(evtName, onRuntimeChanged, true); } catch {}
      });
    });

    W.addEventListener('pageshow', () => {
      if (UTIL_isStudioMode() && !DOM_QWASH_getScopeRoot()) return;
      scheduleRescan('pageshow');
    }, true);
    W.addEventListener('focus', () => {
      if (UTIL_isStudioMode() && !DOM_QWASH_getScopeRoot()) return;
      scheduleRescan('focus');
    }, true);
    D.addEventListener('visibilitychange', () => {
      if (!D.hidden) scheduleRescan('visibility');
    }, true);
  }

  function bindObserverHub() {
    const hub = getObserverHub();
    if (!hub || typeof hub.onReady !== 'function' || typeof hub.onMutations !== 'function') return false;

    disconnectSpaObserver();

    if (typeof state.obsOffReady === 'function') {
      try { state.obsOffReady(); } catch {}
    }
    if (typeof state.obsOffMut === 'function') {
      try { state.obsOffMut(); } catch {}
    }

    state.obsOffReady = hub.onReady('question-wash:ready', () => {
      runApplyPass('hub:ready');
      startHydrationWatchdog('hub:ready');
      scheduleRescan('hub:ready:followup');
    }, { immediate: true });

    state.obsOffMut = hub.onMutations('question-wash:mut', (payload) => {
      if (!payload?.conversationRelevant) return;
      if (payload?.hasAdded || payload?.hasRemoved || payload?.removedTurnLike || payload?.removedAnswerLike) {
        runApplyPass('hub:mut');
      }
      startHydrationWatchdog('hub:mut');
      scheduleRescan('hub:mut:followup');
    });
    return true;
  }

  function bindMiniMapVisibilityEvents() {
    const onChange = (ev) => {
      const kind = String(ev?.detail?.kind || '').trim().toLowerCase();
      if (kind && kind !== 'qwash') return;
      const on = (
        typeof ev?.detail?.on === 'boolean'
          ? ev.detail.on
          : (typeof ev?.detail?.visibility?.qwash === 'boolean' ? ev.detail.visibility.qwash : null)
      );
      if (on === false) {
        stopHydrationWatchdog();
        clearMiniMapRings();
        return;
      }
      runApplyPass(on === true ? 'minimap:qwash-visibility:on:immediate' : 'minimap:qwash-visibility:immediate');
      startHydrationWatchdog(on === true ? 'minimap:qwash-visibility:on' : 'minimap:qwash-visibility');
      scheduleRescan(on === true ? 'minimap:qwash-visibility:on' : 'minimap:qwash-visibility');
    };
    ['evt:h2o:minimap:badge-visibility', 'h2o:minimap:badge-visibility'].forEach((evtName) => {
      eventTargets().forEach((target) => {
        try { target.addEventListener(evtName, onChange, true); } catch {}
      });
    });
  }

  function patchHistoryMethod(name) {
    try {
      const orig = history[name];
      if (typeof orig !== 'function') return;
      const marker = `__${NS}_${name}_patched__`;
      if (orig[marker]) return;
      const wrapped = function patchedHistoryMethod(...args) {
        const out = orig.apply(this, args);
        resetHydrationState(`history:${name}`);
        scheduleRescan(`history:${name}`);
        return out;
      };
      wrapped[marker] = true;
      history[name] = wrapped;
    } catch {}
  }

  function scheduleRescan(_reason) {
    if (state.scanTimer) W.clearTimeout(state.scanTimer);
    state.scanTimer = W.setTimeout(() => {
      state.scanTimer = 0;
      if (state.scanRaf) return;
      state.scanRaf = W.requestAnimationFrame(() => {
        state.scanRaf = 0;
        applyAllWashes();
      });
    }, RESCAN_DELAY_MS);
  }

  function runApplyPass(_reason = 'manual') {
    return applyAllWashes();
  }

  function kickBootHydrationPasses() {
    if (Array.isArray(state.bootPassTimers) && state.bootPassTimers.length) {
      state.bootPassTimers.forEach((timer) => {
        try { W.clearTimeout(timer); } catch {}
      });
    }
    const delays = [0, 60, 180, 420, 900, 1500, 2400, 3600];
    state.bootPassTimers = delays.map((delay) => W.setTimeout(() => {
      runApplyPass(`boot:warm:${delay}`);
    }, delay));
  }

  function resetHydrationState(_reason = 'reset') {
    state.bootRetryIndex = 0;
    if (state.bootRetryTimer) {
      W.clearTimeout(state.bootRetryTimer);
      state.bootRetryTimer = 0;
    }
    bindObserverHub();
    kickBootHydrationPasses();
    startHydrationWatchdog(_reason);
  }

  function hasStoredWashes() {
    try {
      return Object.keys(state.washMap || {}).length > 0;
    } catch {}
    return false;
  }

  function stopHydrationWatchdog() {
    if (state.hydrationWatchdogTimer) {
      try { W.clearInterval(state.hydrationWatchdogTimer); } catch {}
      state.hydrationWatchdogTimer = 0;
    }
    state.hydrationWatchdogUntil = 0;
  }

  function startHydrationWatchdog(_reason = 'watchdog') {
    if (!hasStoredWashes()) {
      stopHydrationWatchdog();
      return false;
    }
    const until = Date.now() + 15000;
    state.hydrationWatchdogUntil = Math.max(state.hydrationWatchdogUntil || 0, until);
    if (state.hydrationWatchdogTimer) return true;
    state.hydrationWatchdogTimer = W.setInterval(() => {
      if (!hasStoredWashes()) {
        stopHydrationWatchdog();
        return;
      }
      const stats = runApplyPass('watchdog');
      if (!needsHydrationFollowup(stats)) {
        stopHydrationWatchdog();
        return;
      }
      if (Date.now() >= Number(state.hydrationWatchdogUntil || 0)) {
        stopHydrationWatchdog();
      }
    }, 500);
    return true;
  }

  function applyAllWashes() {
    const blocks = collectQuestionBlocks();
    const snapshot = buildSnapshot(blocks);
    const activeNow = new Set(blocks);
    const paintedNow = new Set();
    const mmBtns = collectMiniMapButtons();
    const allowMiniMapQwash = isMiniMapQwashVisible();
    const miniMapQaMode = allowMiniMapQwash && isMiniMapQaViewActive();
    clearMiniMapRings(mmBtns);
    const stats = {
      rows: snapshot.length,
      storedEntries: Object.keys(state.washMap || {}).length,
      matched: 0,
      painted: 0,
      paintedItems: 0,
      miniMapPainted: 0,
      unresolved: 0,
      miniMapButtons: mmBtns.length,
      miniMapQaMode,
      wrapperMaskActive: isQuestionWrapperMaskActive(),
    };

    state.keyToEl.clear();
    state.elToKey = new WeakMap();

    state.isApplying = true;
    try {
      snapshot.forEach((item, idx) => {
        const { el, key } = item;
        if (!el || !key) return;
        state.elToKey.set(el, key);
        if (!state.keyToEl.has(key)) state.keyToEl.set(key, el);

        const { entry, matchedKey } = resolveStoredWashEntry(item);
        if (entry && matchedKey && matchedKey !== key) {
          state.washMap[key] = entry;
          try { delete state.washMap[matchedKey]; } catch {}
        }
        if (!String(item?.questionId || item?.stableId || item?.id || '').trim()) {
          stats.unresolved += 1;
        }
        const colorId = normalizeColorId(entry?.colorId);
        if (!colorId) {
          clearWash(el);
          return;
        }
        stats.matched += 1;
        const paintedTargets = applyWash(el, colorId);
        if (paintedTargets?.length) {
          paintedTargets.forEach((t) => paintedNow.add(t));
          stats.painted += paintedTargets.length;
          stats.paintedItems += 1;
        }
      });

      const keep = new Set([...activeNow, ...paintedNow]);
      D.querySelectorAll(`.${CLS.HOST}.${CLS.ON}`).forEach((el) => {
        if (!keep.has(el)) clearWash(el);
      });

      if (allowMiniMapQwash && !miniMapQaMode) {
        mmBtns.forEach((btn) => {
          const { entry } = resolveStoredWashEntryForMiniBtn(btn);
          const colorId = normalizeColorId(entry?.colorId);
          if (!colorId) return;
          applyMiniMapRing(btn, colorId);
          stats.miniMapPainted += 1;
        });
      }

      maybeScheduleBootRetry(stats);
    } finally {
      state.isApplying = false;
    }
    if (miniMapQaMode) requestMiniMapQaQuestionRepaint('qwash');
    return stats;
  }

  function maybeScheduleBootRetry(stats) {
    if (state.bootRetryTimer) {
      W.clearTimeout(state.bootRetryTimer);
      state.bootRetryTimer = 0;
    }

    const delays = BOOT_RETRY_DELAYS_MS;
    if (state.bootRetryIndex >= delays.length) return;

    const entries = Object.keys(state.washMap || {});
    if (!entries.length) {
      state.bootRetryIndex = delays.length;
      return;
    }

    if (!needsHydrationFollowup(stats)) {
      state.bootRetryIndex = delays.length;
      stopHydrationWatchdog();
      return;
    }

    if (!Number(stats?.rows || 0)) {
      const delay = delays[state.bootRetryIndex];
      state.bootRetryIndex += 1;
      state.bootRetryTimer = W.setTimeout(() => {
        state.bootRetryTimer = 0;
        runApplyPass('boot:retry:no-rows');
        scheduleRescan('boot:retry:no-rows:followup');
      }, delay);
      return;
    }

    const delay = delays[state.bootRetryIndex];
    state.bootRetryIndex += 1;
    state.bootRetryTimer = W.setTimeout(() => {
      state.bootRetryTimer = 0;
      runApplyPass('boot:retry');
      scheduleRescan('boot:retry:followup');
    }, delay);
  }

  function needsHydrationFollowup(stats) {
    const matched = Number(stats?.matched || 0);
    const rows = Number(stats?.rows || 0);
    const painted = Number(stats?.painted || 0);
    const paintedItems = Number(stats?.paintedItems || 0);
    const miniMapPainted = Number(stats?.miniMapPainted || 0);
    const miniMapButtons = Number(stats?.miniMapButtons || 0);
    const miniMapQaMode = !!stats?.miniMapQaMode;
    const unresolved = Number(stats?.unresolved || 0);
    const wrapperMaskActive = !!stats?.wrapperMaskActive;
    const storedEntries = Number(stats?.storedEntries || 0);
    const miniMapVisible = isMiniMapQwashVisible();

    if (!storedEntries) return false;
    if (!rows) return true;
    if (wrapperMaskActive) return true;
    if (unresolved > 0) return true;
    if (matched <= 0) return true;
    if (painted <= 0) return true;
    if (paintedItems < matched) return true;
    if (miniMapVisible && miniMapButtons <= 0) return true;
    if (miniMapVisible && miniMapQaMode) return false;
    if (miniMapVisible && miniMapPainted < matched) return true;
    return false;
  }

  function applyColorToCurrent(colorIdOrNull) {
    const key = state.currentTargetKey;
    if (!key) return;
    const colorId = normalizeColorId(colorIdOrNull);
    if (!colorId) {
      try { delete state.washMap[key]; } catch {}
    } else {
      state.washMap[key] = {
        colorId,
        updatedAt: Date.now(),
      };
    }
    saveWashMap();
    const el = state.keyToEl.get(key);
    if (el) {
      if (!colorId) clearWash(el);
      else applyWash(el, colorId);
    }
    requestMiniMapQaQuestionRepaint('qwash');
    scheduleRescan('qwash:changed');
  }

  function normalizeColorId(input) {
    const id = String(input || '').trim().toLowerCase();
    return state.paletteDef[id] ? id : '';
  }

  function applyWash(el, colorId) {
    const color = state.paletteDef[colorId];
    if (!el || !color) return null;
    const target = resolveWashTarget(el) || el;
    const dark = isDarkTheme();
    const hi = dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.015)';
    const lo = dark ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.06)';
    const rootRect = el.getBoundingClientRect?.() || null;
    const rawTargets = [target];
    const targets = rawTargets.filter((t) => {
      if (!(t instanceof HTMLElement)) return false;
      const rect = t.getBoundingClientRect();
      return isValidWashContainer(t, rect, rootRect);
    });
    if (!targets.length) return null;
    targets.forEach((t) => {
      if (!t) return;
      const br = readWashRadius(t);
      t.classList.add(CLS.HOST);
      t.classList.add(CLS.ON);
      t.style.setProperty(`--${NS}-wash`, dark ? color.washDark : color.washLight);
      t.style.setProperty(`--${NS}-wash-deep`, dark ? color.deepDark : color.deepLight);
      t.style.setProperty(`--${NS}-wash-edge`, dark ? color.edgeDark : color.edgeLight);
      t.style.setProperty(`--${NS}-wash-hi`, hi);
      t.style.setProperty(`--${NS}-wash-lo`, lo);
      t.style.setProperty(`--${NS}-radius`, br);
      t.style.setProperty(
        `--${NS}-wash-base`,
        `linear-gradient(165deg, ${dark ? color.washDark : color.washLight} 0%, ${dark ? color.deepDark : color.deepLight} 100%)`
      );
      t.style.setProperty(
        `--${NS}-wash-shadow`,
        `inset 0 0 0 1px ${dark ? color.edgeDark : color.edgeLight}, inset 0 -18px 22px -18px ${lo}`
      );
    });
    return targets;
  }

  function clearWash(el) {
    if (!el) return;
    const targets = [el, ...Array.from(el.querySelectorAll(`.${CLS.HOST}`))];
    targets.forEach((t) => {
      t.classList.remove(CLS.ON);
      t.classList.remove(CLS.HOST);
      t.style.removeProperty(`--${NS}-wash`);
      t.style.removeProperty(`--${NS}-wash-deep`);
      t.style.removeProperty(`--${NS}-wash-edge`);
      t.style.removeProperty(`--${NS}-wash-hi`);
      t.style.removeProperty(`--${NS}-wash-lo`);
      t.style.removeProperty(`--${NS}-radius`);
      t.style.removeProperty(`--${NS}-wash-base`);
      t.style.removeProperty(`--${NS}-wash-shadow`);
    });
  }

  function resolveWashTarget(el) {
    if (!el || !(el instanceof Element)) return el;

    const strictBubble = normalizeQuestionBubbleRoot(el);
    if (strictBubble) return strictBubble;

    const rootRect = el.getBoundingClientRect?.() || null;
    const candidates = [
      el,
      ...Array.from(el.querySelectorAll(':scope > *')),
      ...Array.from(el.querySelectorAll('[class*="rounded"], .whitespace-pre-wrap, [class*="prose"]'))
    ];

    let best = el;
    let bestScore = -Infinity;
    for (const c of candidates) {
      if (!(c instanceof HTMLElement)) continue;
      const rect = c.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (!isValidWashContainer(c, rect, rootRect)) continue;
      const txt = normalizedMessageText(c);
      if (txt.length < 1) continue;

      let score = 0;
      if (c === el) score += 2;
      const cls = String(c.className || '');
      if (/rounded/i.test(cls)) score += 40;
      if (isLikelyUserBubble(c)) score += 120;
      try {
        const bg = String(getComputedStyle(c).backgroundColor || '');
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') score += 18;
      } catch {}
      if (rootRect && rootRect.width > 0) {
        const ratio = rect.width / rootRect.width;
        if (ratio <= 0.96) score += 20;
        if (ratio >= 0.92 && !isLikelyUserBubble(c)) score -= 120;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  function isValidWashContainer(el, rect, rootRect) {
    const tag = String(el.tagName || '').toLowerCase();
    if (['span', 'code', 'a', 'mark', 'strong', 'em', 'i', 'b', 'small', 'sub', 'sup'].includes(tag)) {
      return false;
    }
    if (rect.height < 14 || rect.width < 22) return false;
    try {
      const cs = getComputedStyle(el);
      const disp = String(cs.display || '');
      if (disp.startsWith('inline')) return false;
      if (cs.position === 'absolute' || cs.position === 'fixed') return false;
    } catch {}

    if (rootRect && rootRect.width > 0) {
      const widthRatio = rect.width / rootRect.width;
      if (widthRatio < 0.08) return false;
      if (widthRatio > 0.92 && !isLikelyUserBubble(el)) return false;
    }

    const cls = String(el.className || '');
    if (/token|katex|math|hljs|code/i.test(cls)) return false;
    return true;
  }

  function isLikelyUserBubble(el) {
    if (!el || !(el instanceof Element)) return false;
    const cls = String(el.className || '');
    const st = String(el.getAttribute('style') || '');
    if (/user-message-bubble/i.test(cls)) return true;
    if (/max-w-\[var\(--user-chat-width/i.test(cls)) return true;
    if (/rounded-\[18px\]|rounded-\[|corner-superellipse/i.test(cls) && /px-|py-/.test(cls)) return true;
    if (/--user-chat-width/.test(st)) return true;
    return false;
  }

  function normalizeQuestionBubbleRoot(node) {
    if (!node || !(node instanceof Element)) return null;
    const bubbleSel = [
      '.user-message-bubble-color',
      '[class*="user-message-bubble"]',
      '[class*="max-w-[var(--user-chat-width"]',
      '[class*="corner-superellipse"]'
    ].join(',');
    const up = node.closest(bubbleSel);
    if (up) return up;
    const down = node.querySelector(bubbleSel);
    if (down) return down;
    return null;
  }

  function isDarkTheme() {
    try {
      if (D.documentElement.classList.contains('dark')) return true;
      if (D.documentElement.classList.contains('light')) return false;
      return !!W.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    } catch {
      return true;
    }
  }

  function collectMiniMapButtons() {
    const selectors = new Set([
      '[data-cgxui="mnmp-btn"][data-cgxui-owner="mnmp"]',
      '[data-cgxui="mnmp-btn"]',
      '[data-cgxui="mm-btn"]',
      '[data-cgxui$="mnmp-btn"]',
      '[data-cgxui$="mm-btn"]',
      '.cgxui-mm-btn'
    ]);
    try {
      const sh = TOPW?.H2O_MM_SHARED?.get?.();
      const mmSel = String(sh?.SEL_?.MM_BTN || sh?.registries?.SEL?.MM_BTN || '').trim();
      if (mmSel) selectors.add(mmSel);
    } catch {}

    const scope = DOM_QWASH_getScopeRoot();
    return Array.from(scope.querySelectorAll(Array.from(selectors).join(',')))
      .filter((el) => el instanceof HTMLElement);
  }

  function buildMiniMapBtnLookup(btns) {
    const byId = new Map();
    const byTurnIdx = new Map();
    (Array.isArray(btns) ? btns : []).forEach((btn) => {
      if (!(btn instanceof HTMLElement)) return;
      [
        btn.dataset?.id,
        btn.dataset?.turnId,
        btn.dataset?.primaryAId,
      ].forEach((raw) => {
        const key = String(raw || '').trim();
        if (key && !byId.has(key)) byId.set(key, btn);
      });
      const turnIdx = String(btn.dataset?.turnIdx || '').trim();
      if (turnIdx && !byTurnIdx.has(turnIdx)) byTurnIdx.set(turnIdx, btn);
    });
    return { byId, byTurnIdx };
  }

  function getTurnRuntimeApi() {
    return TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
  }

  function getTurnIndexApi() {
    return TOPW?.H2O?.turn || W?.H2O?.turn || null;
  }

  function getTurnRecordByAnyId(anyId) {
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

  function resolveStoredWashEntryForMiniBtn(btn) {
    if (!(btn instanceof HTMLElement)) return { entry: null, matchedKey: '' };

    const directQuestionId = String(btn.dataset?.questionId || '').trim();
    const directTurnId = String(btn.dataset?.turnId || '').trim();
    const directAnswerId = String(btn.dataset?.primaryAId || btn.dataset?.id || '').trim();
    let turnIndex = Math.max(0, Number(btn.dataset?.turnIdx || 0) || 0);

    let turn = null;
    for (const key of [directQuestionId, directTurnId, directAnswerId]) {
      if (!key) continue;
      turn = getTurnRecordByAnyId(key);
      if (turn) break;
    }

    const questionEl = turn?.questionEl || turn?.qEl || turn?.live?.qEl || null;
    const stableQuestionId = getQuestionStableId(questionEl);
    const questionId = String(directQuestionId || turn?.qId || turn?.questionId || stableQuestionId || '').trim();
    const turnId = String(directTurnId || turn?.turnId || '').trim();

    if (!turnIndex) {
      turnIndex = Math.max(0, Number(turn?.turnNo || turn?.idx || turn?.index || 0) || 0);
    }
    if (!turnIndex) {
      const turnApi = getTurnIndexApi();
      if (questionEl && typeof turnApi?.getTurnIndexByQEl === 'function') {
        try { turnIndex = Math.max(0, Number(turnApi.getTurnIndexByQEl(questionEl) || 0) || 0); } catch {}
      }
      if (!turnIndex && questionId && typeof turnApi?.getTurnIndexByQId === 'function') {
        try { turnIndex = Math.max(0, Number(turnApi.getTurnIndexByQId(questionId) || 0) || 0); } catch {}
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
    if (turnIndex > 0) {
      pushKey(`ord:${threadScopeKey()}:${turnIndex}`);
    }

    for (const key of keys) {
      const hit = state.washMap?.[key];
      if (hit) return { entry: hit, matchedKey: key };
    }
    return { entry: null, matchedKey: '' };
  }

  function resolveMiniMapButton(item, mmBtns, mmLookup, fallbackIdx = -1) {
    const ids = [
      item?.turnId,
      item?.questionId,
      item?.stableId,
      item?.id,
    ].map((v) => String(v || '').trim()).filter(Boolean);

    const findMiniBtnApi =
      TOPW?.H2O_MM_findMiniBtn
      || W?.H2O_MM_findMiniBtn
      || TOPW?.H2O?.MM?.core?.findMiniBtn
      || W?.H2O?.MM?.core?.findMiniBtn
      || null;

    if (typeof findMiniBtnApi === 'function') {
      for (const id of ids) {
        try {
          const btn = findMiniBtnApi(id);
          if (btn instanceof HTMLElement) return btn;
        } catch {}
      }
    }

    for (const id of ids) {
      const exact = mmLookup?.byId?.get?.(id) || null;
      if (exact) return exact;
    }

    const turnIdx = Math.max(0, Number(item?.turnIndex || 0) || 0);
    if (turnIdx > 0) {
      const byIdx = mmLookup?.byTurnIdx?.get?.(String(turnIdx)) || null;
      if (byIdx) return byIdx;
    }

    return Array.isArray(mmBtns) && fallbackIdx >= 0 ? (mmBtns[fallbackIdx] || null) : null;
  }

  function applyMiniMapRing(btn, colorId) {
    const color = state.paletteDef[colorId];
    if (!btn || !color) return;
    const num = findMiniMapNumEl(btn);
    if (!num) return;
    const fill = hexToRgba(color.hex, 0.30);
    const text = textColorForHex(color.hex);
    num.classList.add(CLS.MM_NUM_ON);
    num.style.setProperty(`--${NS}-mm-ring`, color.hex);
    num.style.setProperty(`--${NS}-mm-fill`, fill);
    num.style.setProperty('display', 'inline-flex', 'important');
    num.style.setProperty('align-items', 'center', 'important');
    num.style.setProperty('justify-content', 'center', 'important');
    num.style.setProperty('min-width', '18px', 'important');
    num.style.setProperty('height', '16px', 'important');
    num.style.setProperty('padding', '0 4px', 'important');
    num.style.setProperty('box-sizing', 'border-box', 'important');
    num.style.setProperty('line-height', '1', 'important');
    num.style.setProperty('border-radius', '4px', 'important');
    num.style.setProperty('border', `1.5px solid ${color.hex}`, 'important');
    num.style.setProperty('background', fill, 'important');
    num.style.setProperty('color', text, 'important');
  }

  function clearMiniMapRings(btns) {
    const targets = (btns && btns.length) ? btns : collectMiniMapButtons();
    targets.forEach((btn) => {
      const num = findMiniMapNumEl(btn);
      if (!num) return;
      num.classList.remove(CLS.MM_NUM_ON);
      num.style.removeProperty(`--${NS}-mm-ring`);
      num.style.removeProperty(`--${NS}-mm-fill`);
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
    });
  }

  function notifyMiniMapVisibility(detail = {}) {
    const kind = String(detail?.kind || 'qwash').trim().toLowerCase() || 'qwash';
    const on = detail?.on;
    if (kind !== 'qwash') return false;
    if (on === false) {
      stopHydrationWatchdog();
      clearMiniMapRings();
      return true;
    }
    runApplyPass(on === true ? 'api:minimap-qwash:on:immediate' : 'api:minimap-qwash:immediate');
    startHydrationWatchdog(on === true ? 'api:minimap-qwash:on' : 'api:minimap-qwash');
    scheduleRescan(on === true ? 'api:minimap-qwash:on' : 'api:minimap-qwash');
    return true;
  }

  function findMiniMapNumEl(btn) {
    if (!btn || !(btn instanceof Element)) return null;
    const exact = btn.querySelector('.cgxui-mm-num, [data-cgxui="mm-num"]');
    if (exact) return exact;
    const candidate = btn.querySelector('span:last-child, span');
    if (candidate) return candidate;
    return null;
  }

  function parseBool(raw, fallback = true) {
    if (raw == null) return !!fallback;
    const s = String(raw).trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return !!fallback;
  }

  function qwashVisStorageKey() {
    try {
      const sh = TOPW?.H2O_MM_SHARED?.get?.();
      const ns = sh?.util?.ns;
      if (ns && typeof ns.disk === 'function') {
        return `${ns.disk('prm', 'cgx', 'mnmp')}:ui:badgeVisibility:qwash:v1`;
      }
      if (sh?.NS_DISK) {
        return `${String(sh.NS_DISK)}:ui:badgeVisibility:qwash:v1`;
      }
    } catch {}
    return STORAGE_QWASH_VIS_KEY;
  }

  function isMiniMapQwashVisible() {
    try {
      const root = D.querySelector('[data-cgxui="mnmp-root"][data-cgxui-owner="mnmp"], [data-h2o-owner="minimap-v10"]');
      if (root && root.classList.contains('cgx-mm-hide-qwash')) return false;
    } catch {}
    try {
      return parseBool(W.localStorage.getItem(qwashVisStorageKey()), true);
    } catch {}
    return true;
  }

  function isQuestionWrapperMaskActive() {
    try {
      return D.documentElement?.getAttribute('data-cgxui-qswr-pre') === '1';
    } catch {}
    return false;
  }

  function textColorForHex(hex) {
    const n = normalizeHex(hex);
    if (!n) return '#E5E7EB';
    const r = parseInt(n.slice(1, 3), 16);
    const g = parseInt(n.slice(3, 5), 16);
    const b = parseInt(n.slice(5, 7), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 150 ? '#111827' : '#F9FAFB';
  }

  function readWashRadius(el) {
    try {
      const raw = String(W.getComputedStyle(el).borderRadius || '').trim();
      if (!raw || raw === '0px') return '14px';
      return raw;
    } catch {
      return '14px';
    }
  }

  function showPaletteAt(clientX, clientY, key) {
    if (!state.popover) return;
    state.currentTargetKey = key;
    state.popover.style.display = 'flex';
    state.popover.setAttribute('aria-hidden', 'false');

    const rect = state.popover.getBoundingClientRect();
    const pad = 8;
    const maxX = Math.max(pad, W.innerWidth - rect.width - pad);
    const maxY = Math.max(pad, W.innerHeight - rect.height - pad);

    const x = Math.max(pad, Math.min(clientX + 8, maxX));
    const y = Math.max(pad, Math.min(clientY + 8, maxY));
    state.popover.style.left = `${x}px`;
    state.popover.style.top = `${y}px`;
  }

  function hidePalette() {
    if (!state.popover) return;
    state.popover.style.display = 'none';
    state.popover.setAttribute('aria-hidden', 'true');
    state.currentTargetKey = '';
  }

  function getKeyForElement(el) {
    if (!el) return '';
    const known = state.elToKey.get(el);
    if (known) return known;
    applyAllWashes();
    return state.elToKey.get(el) || '';
  }

  function resolveUserMessageHost(node) {
    if (!node || !(node instanceof Element)) return null;
    const userSel = [
      '[data-message-author-role="user"]',
      '[data-author-role="user"]',
      '[data-role="user"]',
      '[data-testid*="user-message"]',
    ].join(',');

    const up = node.closest(userSel);
    if (up) return up;

    if (detectRole(node) === 'user') return node;

    const turn = closestTurnContainer(node);
    const fromTurn = turn?.querySelector?.(userSel) || null;
    if (fromTurn) return fromTurn;

    return node.querySelector?.(userSel) || null;
  }

  function collectQuestionBlocks() {
  const out = [];
  const seen = new Set();
  const scope = DOM_QWASH_getScopeRoot();

  const userHosts = Array.from(scope.querySelectorAll([
    '[data-message-author-role="user"]',
    '[data-author-role="user"]',
    '[data-role="user"]',
    '[data-testid*="user-message"]',
  ].join(',')));

  userHosts.forEach((host) => {
    if (!(host instanceof Element)) return;
    const turn = closestTurnContainer(host) || host;
    const seeded =
      host.querySelector('.cgxui-qswr, [data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      normalizeQuestionBubbleRoot(host) ||
      host;
    const el =
      chooseQuestionRoot(seeded, turn) ||
      fallbackQuestionRoot(seeded, turn) ||
      normalizeQuestionBubbleRoot(seeded) ||
      null;
    if (!el || seen.has(el)) return;
    seen.add(el);
    out.push(el);
  });

  if (!out.length) {
    scope.querySelectorAll('.cgxui-qswr, [data-h2o-qwrap-id], [data-ho-qwrap-id]').forEach((node) => {
      const el = findQuestionBlockFromNode(node);
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    });
  }

  return out;
}

  function buildSnapshot(blocks) {
    const scope = threadScopeKey();
    const info = blocks.map((el, idx) => {
      const origin = resolveUserMessageHost(el) || resolveUserOriginNode(el) || el;
      const meta = resolveQuestionTurnMeta(origin, idx + 1);
      const stableId = findStableMessageId(origin) || findStableMessageId(el);
      const id = meta.questionId || meta.turnId || stableId;
      const text = normalizedMessageText(el);
      return {
        el,
        idx,
        id,
        stableId,
        questionId: meta.questionId,
        turnId: meta.turnId,
        turnIndex: meta.turnIndex,
        text,
      };
    });

    const dupMap = new Map();
    return info.map((item) => {
      const orderKey = `ord:${scope}:${item.idx + 1}`;
      const textKey = item.text || '[empty]';
      const prev = dupMap.get(textKey) || 0;
      const ord = prev + 1;
      dupMap.set(textKey, ord);
      const hash = fnv1a32(`${textKey}|${item.idx}`);
      const textLegacyKey = `txt:${hash}:${ord}`;
      if (item.id) {
        const legacyKeys = [orderKey, textLegacyKey];
        [
          item.stableId,
          item.questionId,
          item.turnId,
        ].forEach((rawId) => {
          const legacyId = String(rawId || '').trim();
          const legacyKey = legacyId ? `id:${legacyId}` : '';
          if (legacyKey && legacyKey !== `id:${item.id}` && !legacyKeys.includes(legacyKey)) {
            legacyKeys.push(legacyKey);
          }
        });
        return {
          ...item,
          key: `id:${item.id}`,
          legacyKeys,
        };
      }
      return {
        ...item,
        key: orderKey,
        legacyKeys: [textLegacyKey],
      };
    });
  }

  function resolveQuestionTurnMeta(el, fallbackIdx = 0) {
    const messageHost = resolveUserMessageHost(el) || resolveUserOriginNode(el) || el;
    const questionId = getQuestionStableId(messageHost);
    const turnRuntime = TOPW?.H2O?.turnRuntime || W?.H2O?.turnRuntime || null;
    const turnApi = TOPW?.H2O?.turn || W?.H2O?.turn || null;

    let turn = null;
    if (questionId && typeof turnRuntime?.getTurnRecordByQId === 'function') {
      try { turn = turnRuntime.getTurnRecordByQId(questionId) || null; } catch {}
    }

    let turnIndex = 0;
    if (messageHost && typeof turnApi?.getTurnIndexByQEl === 'function') {
      try { turnIndex = Number(turnApi.getTurnIndexByQEl(messageHost) || 0) || 0; } catch {}
    }
    if (!turnIndex && questionId && typeof turnApi?.getTurnIndexByQId === 'function') {
      try { turnIndex = Number(turnApi.getTurnIndexByQId(questionId) || 0) || 0; } catch {}
    }
    if (!turn && turnIndex > 0 && typeof turnRuntime?.getTurnRecordByTurnNo === 'function') {
      try { turn = turnRuntime.getTurnRecordByTurnNo(turnIndex) || null; } catch {}
    }

    const turnId = String(turn?.turnId || '').trim();
    const normalizedTurnIndex = Math.max(
      0,
      Number(turn?.turnNo || turn?.idx || turn?.index || turnIndex || fallbackIdx || 0) || 0
    );

    return {
      questionId,
      turnId,
      turnIndex: normalizedTurnIndex,
    };
  }

  function getQuestionStableId(el) {
    if (!el || !(el instanceof Element)) return '';
    const messageHost = resolveUserMessageHost(el) || resolveUserOriginNode(el) || el;

    const qwrapNode = (
      messageHost.closest?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
      messageHost.querySelector?.('[data-h2o-qwrap-id], [data-ho-qwrap-id]') ||
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
      if (isStableId(qwrapId)) return qwrapId;
    }

    try {
      const qId = TOPW?.H2O?.index?.getQId?.(messageHost) || W?.H2O?.index?.getQId?.(messageHost) || '';
      const normalized = String(qId || '').trim();
      if (normalized) return normalized;
    } catch {}

    try {
      const textEl =
        messageHost.querySelector?.('.cgxui-qswr-text') ||
        messageHost.querySelector?.('.whitespace-pre-wrap') ||
        null;
      const qwrapId =
        W?.H2O_getStableQwrapId?.(messageHost, textEl) ||
        TOPW?.H2O_getStableQwrapId?.(messageHost, textEl) ||
        '';
      const normalized = String(qwrapId || '').trim();
      if (normalized) return normalized;
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
      messageHost,
      messageHost.closest?.('[data-message-author-role], [data-author-role], [data-role], [data-message-id], [data-turn-id]') || null,
    ].filter(Boolean);

    for (const root of roots) {
      for (const attr of attrs) {
        const raw = String(root.getAttribute?.(attr) || '').trim().replace(/^conversation-turn-/, '');
        if (isStableId(raw)) return raw;
      }
    }
    return '';
  }

  function resolveStoredWashEntry(item) {
    if (!item || !item.key) return { entry: null, matchedKey: '' };
    const keys = [item.key];
    if (Array.isArray(item.legacyKeys)) {
      item.legacyKeys.forEach((k) => {
        const key = String(k || '').trim();
        if (key && !keys.includes(key)) keys.push(key);
      });
    } else if (item.legacyKey) {
      const key = String(item.legacyKey || '').trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
    for (const key of keys) {
      const hit = state.washMap[key];
      if (hit) return { entry: hit, matchedKey: key };
    }
    return { entry: null, matchedKey: '' };
  }

  function threadScopeKey() {
  try {
    const viaH2O = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (viaH2O) return `c:${viaH2O}`;

    const path = String(W.location.pathname || '/');
    const m = path.match(/\/c\/([^/]+)/) || path.match(/\/g\/([^/]+)\/c\/([^/]+)/);
    if (m && m[1]) return `c:${m[m.length - 1]}`;
    return path;
  } catch {
    return '/';
  }
}

  function findStableMessageId(el) {
    if (!el || !(el instanceof Element)) return '';
    const knownQuestionId = getQuestionStableId(el);
    if (knownQuestionId) return knownQuestionId;
    const roots = [el];
    const host = el.closest('[data-message-author-role], [data-author-role], [data-role], [data-message-id], [data-testid*="conversation-turn"]');
    if (host && host !== el) roots.push(host);

    for (const root of roots) {
      const ds = root.dataset || {};
      const directVals = [
        ds.h2oUid,
        ds.hoUid,
        ds.h2oQwrapId,
        ds.hoQwrapId,
        root.getAttribute('data-h2o-uid'),
        root.getAttribute('data-ho-uid'),
        root.getAttribute('data-h2o-qwrap-id'),
        root.getAttribute('data-ho-qwrap-id'),
        root.getAttribute('data-cgxui-uid'),
      ];
      for (const vRaw of directVals) {
        const v = String(vRaw || '').trim().replace(/^conversation-turn-/, '');
        if (isStableId(v)) return v;
      }
    }

    const attrs = [
      'data-message-id',
      'data-id',
      'data-turn-id',
      'data-node-id',
      'data-cgxui-uid',
      'data-h2o-uid',
      'data-ho-uid',
      'data-h2o-qwrap-id',
      'data-ho-qwrap-id',
      'id',
    ];
    for (const a of attrs) {
      const v = (el.getAttribute(a) || '').trim();
      if (isStableId(v)) return v;
    }
    for (const a of attrs) {
      const sub = el.querySelector(`[${a}]`);
      if (!sub) continue;
      const v = (sub.getAttribute(a) || '').trim();
      if (isStableId(v)) return v;
    }
    return '';
  }

  function isStableId(v) {
    if (!v) return false;
    if (v.length < 6) return false;
    if (/^(?:^|\s)(?:user|assistant|message)(?:$|\s)/i.test(v)) return false;
    return true;
  }

  function normalizedMessageText(el) {
    const raw = String(el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
    return raw.slice(0, 4000);
  }

  function fnv1a32(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function normalizeRole(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'user' || s === 'human' || s === 'you') return 'user';
    if (s === 'assistant' || s === 'ai' || s === 'chatgpt' || s === 'model') return 'assistant';
    return '';
  }

  function detectRole(el) {
    if (!el || !(el instanceof Element)) return '';
    const attrs = ['data-message-author-role', 'data-author-role', 'data-role'];
    for (const a of attrs) {
      const r = normalizeRole(el.getAttribute(a));
      if (r) return r;
    }
    for (const a of attrs) {
      const n = el.querySelector(`[${a}]`);
      if (!n) continue;
      const r = normalizeRole(n.getAttribute(a));
      if (r) return r;
    }

    const userAvatar = el.querySelector('img[alt="You"], img[alt*="You"], [aria-label="You"], [aria-label*="You"]');
    if (userAvatar) return 'user';
    const aiAvatar = el.querySelector('img[alt*="ChatGPT"], [aria-label*="ChatGPT"]');
    if (aiAvatar) return 'assistant';
    return '';
  }

  function closestTurnContainer(el) {
    if (!el) return null;
    return el.closest([
      'article[data-testid*="conversation-turn"]',
      '[data-testid*="conversation-turn"]',
      'article',
      '[data-message-id]',
      '[data-turn-id]',
    ].join(','));
  }

  function resolveUserOriginNode(node) {
    if (!node || !(node instanceof Element)) return null;
    if (detectRole(node) === 'user') return node;
    return node.querySelector([
      '[data-message-author-role="user"]',
      '[data-author-role="user"]',
      '[data-role="user"]',
      '[data-testid*="user-message"]',
      '[class*="rounded"]',
      '.whitespace-pre-wrap',
      '[class*="prose"]'
    ].join(','));
  }

  function isBubbleLike(el, turnRect) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    if (rect.height < 20) return false;
    const textLen = normalizedMessageText(el).length;
    if (textLen < 4) return false;
    let score = 0;
    const cls = String(el.className || '');
    if (/rounded/i.test(cls)) score += 45;
    if (/max-w-|w-fit|inline-block|self-end|ml-auto|justify-end/i.test(cls)) score += 20;
    if (turnRect && turnRect.width > 0) {
      const ratio = rect.width / turnRect.width;
      if (ratio <= 0.9) score += 30;
      if (ratio > 0.96) score -= 35;
    }
    try {
      const br = parseFloat(String(W.getComputedStyle(el).borderRadius || '0'));
      if (Number.isFinite(br) && br >= 10) score += 35;
      if (Number.isFinite(br) && br <= 1) score -= 15;
    } catch {}
    return score >= 45;
  }

  function chooseQuestionRoot(origin, turn) {
    if (!origin) return null;

    const strictBubble = normalizeQuestionBubbleRoot(origin) || normalizeQuestionBubbleRoot(turn);
    if (strictBubble && strictBubble !== turn) return strictBubble;

    const preferred = turn?.querySelector([
      '[data-message-author-role="user"]',
      '[data-author-role="user"]',
      '[data-role="user"]',
      '[data-testid*="user-message"]',
    ].join(','));
    if (preferred && preferred.contains(origin)) {
      const seeded = resolveBubbleWithinTurn(preferred, turn) || preferred;
      if (seeded && seeded !== turn) return seeded;
    }
    if (preferred) {
      const seeded = resolveBubbleWithinTurn(preferred, turn) || preferred;
      if (seeded && seeded !== turn) return seeded;
    }

    const direct = resolveBubbleWithinTurn(origin, turn);
    if (direct && direct !== turn) return direct;

    let cur = origin;
    let best = null;
    let bestScore = -1;
    const turnRect = turn?.getBoundingClientRect?.() || null;
    while (cur && cur !== turn && cur !== D.body) {
      if (!(cur instanceof Element)) break;
      const rect = cur.getBoundingClientRect();
      if (!isValidWashContainer(cur, rect, turnRect)) {
        cur = cur.parentElement;
        continue;
      }
      const txt = normalizedMessageText(cur);
      if (txt.length >= 8) {
        let score = 0;
        if (turnRect && turnRect.width > 0 && rect.width > 0) {
          const ratio = rect.width / turnRect.width;
          if (ratio <= 0.9) score += 40;
          if (ratio > 0.96) score -= 30;
        }
        if (/rounded/i.test(String(cur.className || ''))) score += 40;
        if (isBubbleLike(cur, turnRect)) score += 35;
        if (score > bestScore) {
          best = cur;
          bestScore = score;
        }
      }
      cur = cur.parentElement;
    }

    if (best && best !== turn) return normalizeQuestionBubbleRoot(best) || best;
    return fallbackQuestionRoot(origin, turn);
  }

  function fallbackQuestionRoot(origin, turn) {
    if (!origin || !turn) return null;
    let cur = origin;
    while (cur && cur !== turn && cur !== D.body) {
      if (cur instanceof HTMLElement) {
        const strict = normalizeQuestionBubbleRoot(cur);
        if (strict) return strict;
        const rect = cur.getBoundingClientRect();
        if (isValidWashContainer(cur, rect, turn.getBoundingClientRect?.() || null)) {
          const txt = normalizedMessageText(cur);
          if (txt.length >= 1) return cur;
        }
      }
      cur = cur.parentElement;
    }

    const userNode = resolveUserOriginNode(turn);
    if (userNode && userNode instanceof HTMLElement) {
      const rect = userNode.getBoundingClientRect();
      if (isValidWashContainer(userNode, rect, turn.getBoundingClientRect?.() || null)) return userNode;
    }
    return (turn instanceof HTMLElement) ? turn : null;
  }

  function resolveBubbleWithinTurn(origin, turn) {
    if (!origin || !turn || !(turn instanceof Element)) return null;
    const turnRect = turn.getBoundingClientRect?.() || null;

    const closestRounded = origin.closest([
      '[class*="rounded-3xl"]',
      '[class*="rounded-2xl"]',
      '[class*="rounded-xl"]',
      '[class*="rounded-lg"]',
      '[class*="rounded-md"]',
      '[class*="rounded"]'
    ].join(','));
    if (closestRounded && turn.contains(closestRounded) && isBubbleLike(closestRounded, turnRect)) {
      return closestRounded;
    }

    const within = turn.querySelectorAll([
      '[class*="rounded-3xl"]',
      '[class*="rounded-2xl"]',
      '[class*="rounded-xl"]',
      '[class*="rounded-lg"]',
      '[class*="rounded-md"]',
      '[class*="rounded"]'
    ].join(','));

    let best = null;
    let bestArea = Infinity;
    within.forEach((el) => {
      if (!isBubbleLike(el, turnRect)) return;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!area || area >= bestArea) return;
      best = el;
      bestArea = area;
    });

    return best;
  }

  function findQuestionBlockFromNode(node) {
  const start = (node instanceof Element) ? node : node?.parentElement;
  if (!start) return null;

  const scopeRoot = DOM_QWASH_getScopeRoot();

  let cur = start;
  while (cur && cur !== D.body && cur !== scopeRoot) {
    const role = detectRole(cur);
    if (role === 'assistant') return null;
    if (role === 'user') {
      const turn = closestTurnContainer(cur) || cur;
      return chooseQuestionRoot(cur, turn) || fallbackQuestionRoot(cur, turn);
    }
    cur = cur.parentElement;
  }

  const turn = closestTurnContainer(start);
  if (!turn) return null;
  const turnRole = detectRole(turn);
  if (turnRole !== 'user') return null;
  const fallbackOrigin = resolveUserOriginNode(turn) || start;
  return chooseQuestionRoot(fallbackOrigin, turn) || fallbackQuestionRoot(fallbackOrigin, turn);
}

  const api = {
    rescan(reason = 'api') {
      scheduleRescan(`api:${String(reason || 'rescan')}`);
      return true;
    },
    repaint(reason = 'api') {
      runApplyPass(`api:${String(reason || 'repaint')}:immediate`);
      scheduleRescan(`api:${String(reason || 'repaint')}`);
      return true;
    },
    clearMiniMap: () => {
      clearMiniMapRings();
      return true;
    },
    onMiniMapVisibilityChanged(detail = {}) {
      return notifyMiniMapVisibility(detail);
    },
  };

  try { W.H2O_QWASH_API = api; } catch {}
  try { TOPW.H2O_QWASH_API = api; } catch {}
})();
