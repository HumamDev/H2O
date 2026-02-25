// ==UserScript==
// @name         2C.🟧🧼 Question Wash Engine 🧼
// @namespace    H2O.Prime.CGX.QuestionWash
// @version      1.0.0
// @description  Middle-click a user question bubble to open a palette and apply/clear a persistent wash color. Storage key: h2o:qwash:map:v1
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
How to use:
- Middle-click on a user question bubble to open the wash palette.
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
  const OPEN_DEBOUNCE_MS = 240;
  const RESCAN_DELAY_MS = 100;
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
    popover: null,
    currentTargetKey: '',
    observer: null,
  };

  injectStyle();
  buildPaletteUI();
  bindInputEvents();
  bindSPAObservers();
  bindMiniMapVisibilityEvents();
  scheduleRescan('boot');

  function logWarn(...args) {
    try { console.warn('[QuestionWash]', ...args); } catch {}
  }

  function loadWashMap() {
    try {
      const raw = W.localStorage.getItem(STORAGE_KEY);
      if (!raw) return Object.create(null);
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : Object.create(null);
    } catch {
      return Object.create(null);
    }
  }

  function saveWashMap() {
    try {
      W.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.washMap || Object.create(null)));
    } catch (err) {
      logWarn('Failed to save wash map', err);
    }
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

    const openFromMiddle = (ev) => {
      if (!ev || ev.button !== 1) return;
      const question = findQuestionBlockFromNode(ev.target);
      if (!question) return;
      if (!isEventInsideQuestion(question, ev.target)) return;
      const key = getKeyForElement(question);
      if (!key) return;

      const now = Date.now();
      const dx = Math.abs((ev.clientX || 0) - state.lastOpenXY.x);
      const dy = Math.abs((ev.clientY || 0) - state.lastOpenXY.y);
      if (state.lastOpenKey === key && (now - state.lastOpenAt) < OPEN_DEBOUNCE_MS && dx < 4 && dy < 4) {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      state.lastOpenAt = now;
      state.lastOpenKey = key;
      state.lastOpenXY = { x: ev.clientX || 0, y: ev.clientY || 0 };
      showPaletteAt(ev.clientX || 0, ev.clientY || 0, key);
    };

    const suppressMiddleDown = (ev) => {
      if (!ev || ev.button !== 1) return;
      const question = findQuestionBlockFromNode(ev.target);
      if (!question) return;
      if (!isEventInsideQuestion(question, ev.target)) return;
      ev.preventDefault();
      ev.stopPropagation();
    };

    if (supportsAux) {
      D.addEventListener('mousedown', suppressMiddleDown, true);
      D.addEventListener('auxclick', openFromMiddle, true);
    } else {
      D.addEventListener('mousedown', openFromMiddle, true);
    }
  }

  function bindSPAObservers() {
    if (state.observer) {
      try { state.observer.disconnect(); } catch {}
    }

    state.observer = new MutationObserver((mutList) => {
      if (state.isApplying) return;
      for (const m of mutList) {
        if (m.type === 'childList' && (m.addedNodes.length || m.removedNodes.length)) {
          scheduleRescan('dom');
          return;
        }
      }
    });

    state.observer.observe(D.documentElement || D.body, {
      childList: true,
      subtree: true,
    });

    W.addEventListener('popstate', () => scheduleRescan('popstate'), true);
    W.addEventListener('hashchange', () => scheduleRescan('hashchange'), true);

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');
  }

  function bindMiniMapVisibilityEvents() {
    const onChange = (ev) => {
      const kind = String(ev?.detail?.kind || '').trim().toLowerCase();
      if (kind && kind !== 'qwash') return;
      scheduleRescan('minimap:qwash-visibility');
    };
    W.addEventListener('evt:h2o:minimap:badge-visibility', onChange, true);
    W.addEventListener('h2o:minimap:badge-visibility', onChange, true);
  }

  function patchHistoryMethod(name) {
    try {
      const orig = history[name];
      if (typeof orig !== 'function') return;
      const marker = `__${NS}_${name}_patched__`;
      if (orig[marker]) return;
      const wrapped = function patchedHistoryMethod(...args) {
        const out = orig.apply(this, args);
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

  function applyAllWashes() {
    const blocks = collectQuestionBlocks();
    const snapshot = buildSnapshot(blocks);
    const activeNow = new Set(blocks);
    const paintedNow = new Set();
    const mmBtns = collectMiniMapButtons();
    const allowMiniMapQwash = isMiniMapQwashVisible();
    clearMiniMapRings(mmBtns);

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
        const colorId = normalizeColorId(entry?.colorId);
        if (!colorId) {
          clearWash(el);
          return;
        }
        const paintedTargets = applyWash(el, colorId);
        if (paintedTargets?.length) paintedTargets.forEach((t) => paintedNow.add(t));
        const mmBtn = mmBtns[idx];
        if (allowMiniMapQwash && mmBtn) applyMiniMapRing(mmBtn, colorId);
      });

      const keep = new Set([...activeNow, ...paintedNow]);
      D.querySelectorAll(`.${CLS.HOST}.${CLS.ON}`).forEach((el) => {
        if (!keep.has(el)) clearWash(el);
      });
    } finally {
      state.isApplying = false;
    }
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

    return Array.from(D.querySelectorAll(Array.from(selectors).join(',')))
      .filter((el) => el instanceof HTMLElement);
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

  function collectQuestionBlocks() {
    const out = [];
    const seen = new Set();
    const roots = D.querySelectorAll([
      '[data-message-author-role="user"]',
      '[data-author-role="user"]',
      '[data-role="user"]',
      '[data-testid*="user-message"]',
      'article[data-testid*="conversation-turn"]',
      '[data-testid*="conversation-turn"]',
    ].join(','));

    roots.forEach((node) => {
      const origin = resolveUserOriginNode(node);
      const el = findQuestionBlockFromNode(origin || node);
      if (!el || seen.has(el)) return;
      seen.add(el);
      out.push(el);
    });

    return out;
  }

  function buildSnapshot(blocks) {
    const scope = threadScopeKey();
    const info = blocks.map((el, idx) => {
      const id = findStableMessageId(el);
      const text = normalizedMessageText(el);
      return { el, idx, id, text };
    });

    const dupMap = new Map();
    return info.map((item) => {
      if (item.id) {
        return { ...item, key: `id:${item.id}`, legacyKey: '' };
      }
      const orderKey = `ord:${scope}:${item.idx + 1}`;
      const textKey = item.text || '[empty]';
      const prev = dupMap.get(textKey) || 0;
      const ord = prev + 1;
      dupMap.set(textKey, ord);
      const hash = fnv1a32(`${textKey}|${item.idx}`);
      return { ...item, key: orderKey, legacyKey: `txt:${hash}:${ord}` };
    });
  }

  function resolveStoredWashEntry(item) {
    if (!item || !item.key) return { entry: null, matchedKey: '' };
    const direct = state.washMap[item.key];
    if (direct) return { entry: direct, matchedKey: item.key };
    if (item.legacyKey) {
      const legacy = state.washMap[item.legacyKey];
      if (legacy) return { entry: legacy, matchedKey: item.legacyKey };
    }
    return { entry: null, matchedKey: '' };
  }

  function threadScopeKey() {
    try {
      const m = String(W.location.pathname || '').match(/\/c\/([^/]+)/);
      if (m && m[1]) return `c:${m[1]}`;
      return String(W.location.pathname || '/');
    } catch {
      return '/';
    }
  }

  function findStableMessageId(el) {
    if (!el || !(el instanceof Element)) return '';
    const attrs = ['data-message-id', 'data-id', 'data-turn-id', 'data-node-id', 'id'];
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

    let cur = start;
    while (cur && cur !== D.body) {
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
})();
