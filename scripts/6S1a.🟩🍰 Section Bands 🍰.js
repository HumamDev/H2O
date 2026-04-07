// ==UserScript==
// @h2o-id             6s1a.section.bands
// @name               6S1a.🟩🍰 Section Bands 🍰
// @namespace          H2O.Premium.CGX.section.bands
// @author             HumamDev
// @version            1.2.2
// @revision           001
// @build              260314-113900
// @description        Section bands with popup controls for collapse, expand, show sections, collapse sections, and native first-title full-answer collapse.
// @match              https://chatgpt.com/*
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */

  const W = window;
  const D = document;

  // ✅ CANONICAL IDs (LOCKED)
  const PID  = 'sctnbnds';
  const BrID = PID;
  const DsID = PID;

  // Section Bands → "section"+"bands" → sc + bn = scbn
  const SkID = 'scbn';

  // CID identifiers only
  const CID = 'sbands';

  // TOK (first two title words: Section Bands)
  const TOK = 'SB';

  // labels only
  const MODTAG = 'SBands';
  const SUITE  = 'prm';
  const HOST   = 'cgx';
  const EMOJI_HDR = 'OFF';

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  const H2O = (W.H2O = W.H2O || {});
  const MOD_OBJ = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD_OBJ.meta = MOD_OBJ.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP,
    modtag: MODTAG, suite: SUITE, host: HOST, emoji_hdr: EMOJI_HDR
  };

  // ✅ DIAG (bounded flight recorder)
  MOD_OBJ.diag = MOD_OBJ.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD_OBJ.diag;

  // MODE B registries (warn + keep-first)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  function DIAG_pushStep(msg, data) {
    try {
      const a = DIAG.steps;
      a.push({ t: Math.round(performance.now() - DIAG.t0), msg, data: data ? JSON.stringify(data).slice(0, 500) : '' });
      if (a.length > DIAG.bufMax) a.splice(0, a.length - DIAG.bufMax);
    } catch {}
  }
  function DIAG_pushErr(msg, err) {
    try {
      const a = DIAG.errors;
      a.push({ t: Math.round(performance.now() - DIAG.t0), msg, err: String(err && (err.stack || err.message || err)).slice(0, 700) });
      if (a.length > DIAG.errMax) a.splice(0, a.length - DIAG.errMax);
    } catch {}
  }

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

  const ATTR_ = Object.freeze({
    MSG_ROLE: 'data-message-author-role',
    MSG_ID: 'data-message-id',

    CGXUI: 'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
    CGXUI_PART: 'data-cgxui-part',
    CGXUI_SCOPE: 'data-cgxui-scope',
    SEC_INDEX: 'data-sec-index',

    // host marker on non-owned answers (namespaced)
    ANSWER_PROCESSED: `data-${SkID}-processed`,
  });

  const NS_ = Object.freeze({
    DISK: `h2o:${SUITE}:${HOST}:${DsID}`,
  });

  const KEY_ = Object.freeze({
    CFG_AUTO_MODE_V1:    `${NS_.DISK}:cfg:auto_mode:v1`,
    CFG_MANUAL_ENABLED_V1: `${NS_.DISK}:cfg:manual_enabled:v1`,
    CFG_BINDINGS_V1:     `${NS_.DISK}:cfg:bindings:v1`,
    CFG_PALETTE_V1:      `${NS_.DISK}:cfg:palette:v1`,
    STATE_BANDS_V1:      `${NS_.DISK}:state:bands:v1`,
    MIG_DONE_V1:         `${NS_.DISK}:migrate:bands:v1`,

    // legacy (migration only)
    LEG_AUTO: 'ho-secBands-autoMode',
    LEG_STORE:'ho-secBands-v1',
  });

  // UI tokens (SkID-based values)
  const UI_ = Object.freeze({
    STYLE:       `cgxui-${SkID}-style`,

    PALETTE:     `${SkID}-palette`,
    PANEL:       `${SkID}-panel`,
    RAILBTN:     `${SkID}-railbtn`,
    TINYBTN:     `${SkID}-tinybtn`,

    BAND:        `${SkID}-band`,
    PALETTE_BTN: `${SkID}-pbtn`,
    PATTERN_BTN: `${SkID}-ptnbtn`,
    SLIDER:      `${SkID}-slider`,
    ACT_BTN:     `${SkID}-actbtn`,
    SWITCH:      `${SkID}-switch`,
  });

  const CSS_ = Object.freeze({
    STYLE_ID: UI_.STYLE,
  });

  // Host integration constants
  const CFG_ = Object.freeze({
    RAIL_ID: 'stage-sidebar-tiny-bar',
    PANEL_GAP_TOP: 6,
    PANEL_GAP_RAIL: 10,
    PANEL_GAP_TINY: 10,
    VIEWPORT_PAD: 8,
    BAND_LEFT_HOTZONE_PX: 40,
    POPUP_MOUSE_DOUBLE_MS: 280,
    POPUP_MOUSE_SLOP_PX: 18,

    SCAN_DEBOUNCE_MS: 80,
    INVENTORY_SNIPPET_MAX: 240,
    INVENTORY_TITLE_MAX: 140,
  });

  const EV_SBANDS_AUTO_MODE = 'h2o:section-bands:auto-mode';
  const EV_SBANDS_CHANGED = 'h2o:section-bands:changed';
  const EV_SBANDS_CHANGED_LEG = 'h2o-section-bands:changed';
  const FEATURE_KEY_SECTION_BANDS = 'sectionBands';

  const CFG_PALETTE_DEFAULTS = Object.freeze([
    Object.freeze({ key: 'olive',  label: 'Color 1', hex: '#78866b' }),
    Object.freeze({ key: 'gold',   label: 'Color 2', hex: '#ebc86e' }),
    Object.freeze({ key: 'red',    label: 'Color 3', hex: '#cd5a5a' }),
    Object.freeze({ key: 'blue',   label: 'Color 4', hex: '#5c91c8' }),
    Object.freeze({ key: 'purple', label: 'Color 5', hex: '#9273c8' }),
  ]);
  const CFG_APPLY_START_MODES = Object.freeze(['default', 'same_last', 'next_after_last']);

  // Fill alpha levels (1..5)
  const CFG_FILL_ALPHAS = Object.freeze([0.10, 0.20, 0.30, 0.40, 0.50]);

  // Ring widths (1..5) px, 3 = default
  const CFG_RING_WIDTHS = Object.freeze([0.5, 1, 2, 3, 4]);

  // Patterns
  const CFG_PATTERN_KEYS = Object.freeze(['stripe', 'dots', 'lines', 'cross', 'grid']);

  const CFG_BINDING_SCHEMA = Object.freeze({
    popupMouse: Object.freeze(['left_click', 'middle_click', 'right_click', 'left_double', 'middle_double', 'right_double', 'none']),
    applyColor: Object.freeze(['space', 'enter', 'meta_1', 'meta_h', 'ctrl_1', 'ctrl_h', 'meta_or_ctrl_1', 'meta_or_ctrl_h', 'none']),
    clearColor: Object.freeze(['meta_z', 'ctrl_z', 'meta_or_ctrl_z', 'escape', 'none']),
    rotateColor: Object.freeze(['space', 'enter', 'enter_backspace', 'arrow_lr', 'arrow_ud', 'none']),
    intensity: Object.freeze(['space', 'enter', 'enter_backspace', 'arrow_lr', 'arrow_ud', 'none']),
    mode: Object.freeze(['space', 'enter', 'arrow_lr', 'arrow_ud', 'meta_v', 'ctrl_v', 'meta_or_ctrl_v', 'meta_x', 'ctrl_x', 'meta_or_ctrl_x', 'none']),
    choosePattern: Object.freeze(['space', 'enter', 'meta_x', 'ctrl_x', 'meta_or_ctrl_x', 'meta_v', 'ctrl_v', 'meta_or_ctrl_v', 'escape', 'none']),
    rotatePattern: Object.freeze(['space', 'enter', 'enter_backspace', 'arrow_lr', 'arrow_ud', 'meta_x', 'ctrl_x', 'meta_or_ctrl_x', 'escape', 'none']),
  });

  const CFG_BINDING_DEFAULTS = Object.freeze({
    popupMouse: 'middle_double',
    applyColor: 'space',
    clearColor: 'meta_or_ctrl_z',
    rotateColor: 'none',
    intensity: 'arrow_ud',
    mode: 'enter',
    choosePattern: 'meta_or_ctrl_x',
    rotatePattern: 'arrow_lr',
  });
  const CFG_PALETTE_STATE_DEFAULTS = Object.freeze({
    defaultKey: 'olive',
    applyStartMode: 'default',
    lastUsedKey: null,
  });

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val) { try { localStorage.setItem(key, String(val)); return true; } catch { return false; } },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); return true; } catch { return false; } },
    del(key) { try { localStorage.removeItem(key); return true; } catch { return false; } },
  };

  function UTIL_qs(sel, root = D) { try { return root.querySelector(sel); } catch { return null; } }
  function UTIL_qsa(sel, root = D) { try { return Array.from(root.querySelectorAll(sel)); } catch { return []; } }

  function UTIL_clamp(n, min, max) { return Math.min(Math.max(n, min), max); }

  function UTIL_normalizeHexColor(raw, fallback = null) {
    const base = String(raw || '').trim().replace(/^#/, '');
    const expanded = /^[\da-f]{3}$/i.test(base)
      ? base.split('').map((ch) => ch + ch).join('')
      : base;
    if (!/^[\da-f]{6}$/i.test(expanded)) return fallback;
    return `#${expanded.toLowerCase()}`;
  }

  function UTIL_hexToRgbTriplet(hex) {
    const normalized = UTIL_normalizeHexColor(hex, null);
    if (!normalized) return null;
    return [
      parseInt(normalized.slice(1, 3), 16),
      parseInt(normalized.slice(3, 5), 16),
      parseInt(normalized.slice(5, 7), 16),
    ].join(', ');
  }

  function UTIL_extendRegistry(reg, map, name) {
    try {
      for (const k of Object.keys(map)) {
        if (reg[k] != null && reg[k] !== map[k]) {
          DIAG_pushStep('registry_collision', { name, key: k });
          continue;
        }
        if (reg[k] == null) reg[k] = map[k];
      }
    } catch (e) {
      DIAG_pushErr('registry_extend_failed', e);
    }
  }

  function UTIL_isEl(x) { return !!(x && x.nodeType === 1); }
  function UTIL_isNode(x) { return !!(x && typeof x.nodeType === 'number'); }

  function UTIL_nodeToElement(node) {
    if (!UTIL_isNode(node)) return null;
    return (node.nodeType === 1) ? node : (node.parentElement || null);
  }

  function UTIL_isEditableLike(el) {
    if (!UTIL_isEl(el)) return false;
    if (el.isContentEditable) return true;
    if (el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return true;
    if (el.closest('input, textarea, select, button')) return true;
    if (el.closest('[role="textbox"], [role="combobox"], [role="searchbox"], [data-lexical-editor="true"]')) return true;
    return false;
  }

  function UTIL_mkOwned(tag, uiToken, part) {
    const el = D.createElement(tag);
    el.setAttribute(ATTR_.CGXUI, uiToken);
    el.setAttribute(ATTR_.CGXUI_OWNER, SkID);
    if (part) el.setAttribute(ATTR_.CGXUI_PART, part);
    return el;
  }

  function UTIL_selScoped(uiToken) {
    return `[${ATTR_.CGXUI}="${uiToken}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;
  }

  function UTIL_isAssistantMsg(el) {
    return UTIL_isEl(el) && el.getAttribute(ATTR_.MSG_ROLE) === 'assistant';
  }

  function UTIL_getOwnedBandFromNode(node) {
    const el = UTIL_nodeToElement(node);
    if (!el) return null;
    return el.closest(UTIL_selScoped(UI_.BAND));
  }

  function BINDINGS_normalizeValue(key, raw) {
    const allowed = CFG_BINDING_SCHEMA[key];
    if (!allowed) return raw;
    const value = String(raw || '').trim();
    return allowed.includes(value) ? value : CFG_BINDING_DEFAULTS[key];
  }

  function BINDINGS_load() {
    const raw = UTIL_storage.getJSON(KEY_.CFG_BINDINGS_V1, null);
    const out = {};
    for (const key of Object.keys(CFG_BINDING_DEFAULTS)) {
      out[key] = BINDINGS_normalizeValue(key, raw && raw[key]);
    }
    return out;
  }

  function BINDINGS_save() {
    UTIL_storage.setJSON(KEY_.CFG_BINDINGS_V1, STATE.cfg.bindings || {});
  }

  function BINDINGS_get(key) {
    if (!STATE.cfg.bindings) STATE.cfg.bindings = BINDINGS_load();
    return BINDINGS_normalizeValue(key, STATE.cfg.bindings[key]);
  }

  function BINDINGS_set(key, value) {
    if (!CFG_BINDING_SCHEMA[key]) return false;
    if (!STATE.cfg.bindings) STATE.cfg.bindings = BINDINGS_load();
    STATE.cfg.bindings[key] = BINDINGS_normalizeValue(key, value);
    BINDINGS_save();
    return true;
  }

  function BINDINGS_all() {
    if (!STATE.cfg.bindings) STATE.cfg.bindings = BINDINGS_load();
    return Object.assign({}, STATE.cfg.bindings);
  }

  function PALETTE_exportState(state) {
    const src = state || PALETTE_getState();
    return {
      colors: (src.colors || []).map((color, idx) => ({
        key: CFG_PALETTE_DEFAULTS[idx]?.key || color?.key || `color_${idx + 1}`,
        label: `Color ${idx + 1}`,
        hex: UTIL_normalizeHexColor(color?.hex, CFG_PALETTE_DEFAULTS[idx]?.hex || '#888888'),
      })),
      defaultKey: src.defaultKey,
      applyStartMode: src.applyStartMode,
      lastUsedKey: src.lastUsedKey,
    };
  }

  function PALETTE_normalizeColor(raw, idx) {
    const fallback = CFG_PALETTE_DEFAULTS[idx] || CFG_PALETTE_DEFAULTS[0];
    const label = `Color ${idx + 1}`;
    const hex = UTIL_normalizeHexColor(raw?.hex, fallback.hex);
    return {
      key: fallback.key,
      label,
      hex,
      rgb: UTIL_hexToRgbTriplet(hex) || UTIL_hexToRgbTriplet(fallback.hex) || '255, 255, 255',
    };
  }

  function PALETTE_normalizeState(raw) {
    const colors = CFG_PALETTE_DEFAULTS.map((fallback, idx) => {
      const incoming = Array.isArray(raw?.colors) ? raw.colors[idx] : null;
      return PALETTE_normalizeColor(incoming, idx);
    });
    const keys = colors.map((color) => color.key);
    const defaultKey = keys.includes(raw?.defaultKey) ? raw.defaultKey : CFG_PALETTE_STATE_DEFAULTS.defaultKey;
    const applyStartMode = CFG_APPLY_START_MODES.includes(raw?.applyStartMode) ? raw.applyStartMode : CFG_PALETTE_STATE_DEFAULTS.applyStartMode;
    const lastUsedKey = keys.includes(raw?.lastUsedKey) ? raw.lastUsedKey : null;
    return { colors, defaultKey, applyStartMode, lastUsedKey };
  }

  function PALETTE_load() {
    return PALETTE_normalizeState(UTIL_storage.getJSON(KEY_.CFG_PALETTE_V1, null));
  }

  function PALETTE_getState() {
    if (!STATE.cfg.palette) STATE.cfg.palette = PALETTE_load();
    return STATE.cfg.palette;
  }

  function PALETTE_save() {
    UTIL_storage.setJSON(KEY_.CFG_PALETTE_V1, PALETTE_exportState(PALETTE_getState()));
  }

  function PALETTE_getDefs() {
    return PALETTE_getState().colors.slice();
  }

  function PALETTE_getDef(key) {
    const wanted = String(key || '').trim();
    if (!wanted) return null;
    return PALETTE_getDefs().find((color) => color.key === wanted) || null;
  }

  function PALETTE_getLoopDefs() {
    const state = PALETTE_getState();
    const defs = state.colors.slice();
    if (!defs.length) return defs;
    const startIdx = defs.findIndex((color) => color.key === state.defaultKey);
    if (startIdx <= 0) return defs;
    return defs.slice(startIdx).concat(defs.slice(0, startIdx));
  }

  function PALETTE_getLoopKeys() {
    return PALETTE_getLoopDefs().map((color) => color.key).filter(Boolean);
  }

  function PALETTE_getLoopKeyAt(idx) {
    const keys = PALETTE_getLoopKeys();
    if (!keys.length) return null;
    return keys[((idx % keys.length) + keys.length) % keys.length];
  }

  function PALETTE_getNextLoopKey(fromKey, step = 1) {
    const keys = PALETTE_getLoopKeys();
    if (!keys.length) return null;
    const idx = keys.indexOf(String(fromKey || '').trim());
    if (idx < 0) return keys[0];
    const delta = step < 0 ? -1 : 1;
    return keys[(idx + delta + keys.length) % keys.length];
  }

  function PALETTE_resolveApplyStartKey() {
    const state = PALETTE_getState();
    if (state.applyStartMode === 'same_last') return state.lastUsedKey || state.defaultKey;
    if (state.applyStartMode === 'next_after_last') return state.lastUsedKey ? (PALETTE_getNextLoopKey(state.lastUsedKey, 1) || state.defaultKey) : state.defaultKey;
    return state.defaultKey;
  }

  function PALETTE_setLastUsedKey(key) {
    const state = PALETTE_getState();
    const nextKey = PALETTE_getDef(key)?.key || null;
    if (!nextKey || state.lastUsedKey === nextKey) return false;
    state.lastUsedKey = nextKey;
    PALETTE_save();
    return true;
  }

  function PALETTE_reapplyAutoBands() {
    const answers = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"]`);
    for (const ans of answers) {
      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), ans);
      bands.forEach((band, idx) => {
        if (band.dataset.secSource !== 'auto') return;
        const key = PALETTE_getLoopKeyAt(idx);
        if (!key) return;
        DOM_applyBandColor(band, key, 'fill');
        IO_saveFromBand(band);
      });
    }
  }

  function PALETTE_refreshUi() {
    if (STATE.cfg.autoMode) PALETTE_reapplyAutoBands();
    const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND));
    for (const band of bands) DOM_updateBandVisual(band);
    if (STATE.ui.currentBand && !D.contains(STATE.ui.currentBand)) STATE.ui.currentBand = null;
    if (!STATE.ui.palette || !UI_isPaletteVisible() || !STATE.ui.currentBand) return;
    UI_buildPalette();
    UI_updatePaletteActiveState();
  }

  function PALETTE_setConfig(next) {
    const current = PALETTE_getState();
    const merged = PALETTE_normalizeState({
      colors: Array.isArray(next?.colors) ? next.colors : current.colors,
      defaultKey: next?.defaultKey ?? current.defaultKey,
      applyStartMode: next?.applyStartMode ?? current.applyStartMode,
      lastUsedKey: next?.lastUsedKey ?? current.lastUsedKey,
    });
    STATE.cfg.palette = merged;
    PALETTE_save();
    PALETTE_refreshUi();
    return PALETTE_exportState(merged);
  }

  function PALETTE_resetConfig() {
    STATE.cfg.palette = PALETTE_normalizeState(null);
    PALETTE_save();
    PALETTE_refreshUi();
    return PALETTE_exportState(STATE.cfg.palette);
  }

  function UTIL_getAnswerId(answerEl) {
    if (!UTIL_isEl(answerEl)) return null;

    const real = answerEl.getAttribute(ATTR_.MSG_ID) || answerEl.id;
    if (real) return real;

    const all = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"]`);
    const idx = all.indexOf(answerEl);
    return `idx-${idx >= 0 ? idx : 0}`;
  }

  function UTIL_normalizeId(id) {
    const normalized = W.H2O?.msg?.normalizeId?.(id);
    return String(normalized || id || '').trim();
  }

  function getChatId() {
    const fromCore = W.H2O?.util?.getChatId?.();
    if (fromCore) return String(fromCore);
    const match = String(W.location?.pathname || '').match(/\/c\/([a-z0-9-]+)/i);
    return match ? String(match[1]) : 'unknown';
  }

  function inventoryKey(chatId) {
    const id = String(chatId || 'unknown');
    return `${NS_.DISK}:state:band_inventory_${id}:v1`;
  }

  function IO_readInventory(chatId) {
    const fb = { v: 1, byId: {} };
    const raw = UTIL_storage.getJSON(inventoryKey(chatId), fb);
    if (!raw || typeof raw !== 'object') return { ...fb };
    if (!raw.byId || typeof raw.byId !== 'object') raw.byId = {};
    raw.v = 1;
    return raw;
  }

  function IO_writeInventory(chatId, store) {
    const safe = (store && typeof store === 'object') ? store : {};
    UTIL_storage.setJSON(inventoryKey(chatId), {
      v: 1,
      byId: (safe.byId && typeof safe.byId === 'object') ? safe.byId : {},
    });
  }

  function UTIL_cleanText(raw) {
    return String(raw || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function UTIL_truncText(raw, max) {
    const text = UTIL_cleanText(raw);
    const limit = Number(max || 0);
    if (!text || !Number.isFinite(limit) || limit < 1 || text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
  }

  function UTIL_getBandText(bandEl) {
    if (!UTIL_isEl(bandEl)) return '';
    const clone = bandEl.cloneNode(true);
    clone.querySelectorAll('button, nav, svg, textarea, input, select').forEach((node) => node.remove());
    return UTIL_cleanText(clone.textContent || '');
  }

  function UTIL_getBandTitle(bandEl, sectionIndex) {
    if (!UTIL_isEl(bandEl)) return `Section ${Number(sectionIndex || 0) + 1}`;
    const heading = UTIL_cleanText(bandEl.querySelector('h1,h2,h3,h4,h5,h6')?.textContent || '');
    if (heading) return UTIL_truncText(heading, CFG_.INVENTORY_TITLE_MAX);
    const text = UTIL_getBandText(bandEl);
    const firstLine = UTIL_cleanText((text.split('\n').find((line) => line.trim()) || ''));
    if (firstLine) return UTIL_truncText(firstLine, CFG_.INVENTORY_TITLE_MAX);
    return `Section ${Number(sectionIndex || 0) + 1}`;
  }

  function UTIL_bandRecordComparable(record) {
    if (!record || typeof record !== 'object') return null;
    const { updatedAt, ...rest } = record;
    return rest;
  }

  function UTIL_bandRecordEqual(a, b) {
    try {
      return JSON.stringify(UTIL_bandRecordComparable(a)) === JSON.stringify(UTIL_bandRecordComparable(b));
    } catch {
      return false;
    }
  }

  function IO_emitBandChanged(detail) {
    const payload = {
      chatId: String(detail?.chatId || getChatId()),
      answerId: String(detail?.answerId || ''),
      sectionIndex: Number.isFinite(Number(detail?.sectionIndex)) ? Number(detail.sectionIndex) : -1,
      reason: String(detail?.reason || ''),
      ts: Date.now(),
    };
    try { W.dispatchEvent(new CustomEvent(EV_SBANDS_CHANGED, { detail: payload })); } catch {}
    try { W.dispatchEvent(new CustomEvent(EV_SBANDS_CHANGED_LEG, { detail: payload })); } catch {}
  }

  function buildBandRecord(bandEl, answerEl = null) {
    if (!UTIL_isEl(bandEl)) return null;
    const ownerAnswer = UTIL_isEl(answerEl) ? answerEl : bandEl.closest(`[${ATTR_.MSG_ROLE}="assistant"]`);
    if (!ownerAnswer) return null;

    const rawAnswerId = UTIL_normalizeId(UTIL_getAnswerId(ownerAnswer));
    const answerId = UTIL_normalizeId(W.H2O?.turn?.getPrimaryAIdByAId?.(rawAnswerId) || rawAnswerId);
    const sectionIndex = parseInt(bandEl.dataset.secIndex || '-1', 10);
    const colorKey = String(bandEl.dataset.secColor || '').trim();
    if (!answerId || !Number.isFinite(sectionIndex) || sectionIndex < 0 || !colorKey) return null;

    const bandText = UTIL_getBandText(bandEl);
    return {
      id: `${answerId}:${sectionIndex}`,
      chatId: getChatId(),
      answerId,
      turnNo: Number(W.H2O?.turn?.getTurnIndexByAId?.(answerId) || W.H2O?.index?.getAIndex?.(answerId) || 0) || 0,
      sectionIndex,
      title: UTIL_getBandTitle(bandEl, sectionIndex),
      snippet: UTIL_truncText(bandText, CFG_.INVENTORY_SNIPPET_MAX),
      colorKey,
      mode: String(bandEl.dataset.secMode || 'fill'),
      pattern: String(bandEl.dataset.secPattern || 'none'),
      collapsed: String(bandEl.dataset.secCollapsed || '0') === '1',
      source: String(bandEl.dataset.secSource || 'none'),
      updatedAt: Date.now(),
    };
  }

  function upsertBandRecord(chatId, record) {
    if (!record || typeof record !== 'object' || !record.id) return false;
    const inventory = IO_readInventory(chatId);
    const prev = inventory.byId[record.id];
    const next = prev && UTIL_bandRecordEqual(prev, record)
      ? { ...record, updatedAt: Number(prev.updatedAt || record.updatedAt || Date.now()) }
      : { ...record, updatedAt: Date.now() };
    if (prev && UTIL_bandRecordEqual(prev, next)) return false;
    inventory.byId[record.id] = next;
    IO_writeInventory(chatId, inventory);
    IO_emitBandChanged({
      chatId,
      answerId: next.answerId,
      sectionIndex: next.sectionIndex,
      reason: 'upsert',
    });
    return true;
  }

  function removeBandRecord(chatId, recordId) {
    const id = String(recordId || '').trim();
    if (!id) return false;
    const inventory = IO_readInventory(chatId);
    const prev = inventory.byId[id];
    if (!prev) return false;
    delete inventory.byId[id];
    IO_writeInventory(chatId, inventory);
    IO_emitBandChanged({
      chatId,
      answerId: String(prev.answerId || ''),
      sectionIndex: Number(prev.sectionIndex || -1),
      reason: 'remove',
    });
    return true;
  }

  function listBandRecords(chatId) {
    const inventory = IO_readInventory(chatId || getChatId());
    return Object.values(inventory.byId || {})
      .filter((record) => record && typeof record === 'object')
      .sort((a, b) => {
        const turnDelta = (Number(a?.turnNo || 0) - Number(b?.turnNo || 0));
        if (turnDelta) return turnDelta;
        const secDelta = (Number(a?.sectionIndex || 0) - Number(b?.sectionIndex || 0));
        if (secDelta) return secDelta;
        return Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
      });
  }

  function IO_syncAnswerInventory(answerEl, reason = 'sync') {
    try {
      if (!UTIL_isEl(answerEl)) return;

      const rawAnswerId = UTIL_normalizeId(UTIL_getAnswerId(answerEl));
      const answerId = UTIL_normalizeId(W.H2O?.turn?.getPrimaryAIdByAId?.(rawAnswerId) || rawAnswerId);
      const chatId = getChatId();
      if (!answerId || !chatId) return;

      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), answerEl);
      const inventory = IO_readInventory(chatId);
      const byId = inventory.byId || {};
      const desired = new Map();
      const changes = [];
      let dirty = false;

      bands.forEach((band, idx) => {
        if (!UTIL_isEl(band)) return;
        if (!band.dataset.secIndex) band.dataset.secIndex = String(idx);
        const sectionIndex = parseInt(band.dataset.secIndex || String(idx), 10);
        if (!Number.isFinite(sectionIndex) || sectionIndex < 0) return;
        const slotId = `${answerId}:${sectionIndex}`;
        const record = buildBandRecord(band, answerEl);
        if (!record) return;
        const prev = byId[slotId];
        const next = prev && UTIL_bandRecordEqual(prev, record)
          ? { ...record, updatedAt: Number(prev.updatedAt || record.updatedAt || Date.now()) }
          : { ...record, updatedAt: Date.now() };
        desired.set(slotId, next);
        if (!prev || !UTIL_bandRecordEqual(prev, next)) {
          byId[slotId] = next;
          dirty = true;
          changes.push({ answerId, sectionIndex, reason });
        }
      });

      Object.keys(byId)
        .filter((id) => id.startsWith(`${answerId}:`) && !desired.has(id))
        .forEach((id) => {
          const prev = byId[id];
          delete byId[id];
          dirty = true;
          changes.push({
            answerId,
            sectionIndex: Number(prev?.sectionIndex || id.split(':').pop() || -1),
            reason,
          });
        });

      if (!dirty) return;
      inventory.byId = byId;
      IO_writeInventory(chatId, inventory);
      changes.forEach((change) => {
        IO_emitBandChanged({
          chatId,
          answerId: change.answerId,
          sectionIndex: change.sectionIndex,
          reason: change.reason,
        });
      });
    } catch (e) {
      DIAG_pushErr('sync_inventory_failed', e);
    }
  }

  function UTIL_inViewportClamp(top, left, rectW, rectH) {
    const maxTop  = W.innerHeight - rectH - CFG_.VIEWPORT_PAD;
    const maxLeft = W.innerWidth  - rectW - CFG_.VIEWPORT_PAD;
    return {
      top:  Math.max(CFG_.VIEWPORT_PAD, Math.min(top,  maxTop)),
      left: Math.max(CFG_.VIEWPORT_PAD, Math.min(left, maxLeft)),
    };
  }

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  MOD_OBJ.state = MOD_OBJ.state || {};
  const STATE = MOD_OBJ.state;

  STATE.booted = !!STATE.booted;

  // UI refs
  STATE.ui = STATE.ui || {
    panel: null,
    railBtn: null,
    palette: null,
    currentBand: null,
    slider: null,
    hoverBand: null,
    popupMouseLastAt: 0,
    popupMouseLastBand: null,
    popupMouseLastButton: -1,
    popupMouseLastPoint: { x: 0, y: 0 },

    panelAnchor: 'top', // 'top' | 'rail' | 'tiny'
  };

  // observers/timers/listeners cleanup
  STATE.clean = STATE.clean || {
    moAnswers: null,
    schScan: 0,

    onResize: null,
    onScroll: null,
    onDocMouseDown: null,
    onDocContextMenu: null,
    onDocPointerMove: null,
    onDocKeyDown: null,
    onPaletteMouseDown: null,
  };

  // config state
  STATE.cfg = STATE.cfg || {
    autoMode: false,
    manualEnabled: true,
    migDone: false,
    bindings: null,
    palette: null,
  };

  /* ───────────────────────────── 🟦 SURFACE — EVENTS / API (spec-only) 📄🔒💧 ───────────────────────────── */

  // No new cross-module public events promised here (kept internal to avoid ecosystem drift).
  // (If you later want, we can add evt:h2o:bands:* with MIG bridge.)

  function SURFACE_registerControlHubFeature() {
    const cfg = {
      key: FEATURE_KEY_SECTION_BANDS,
      label: 'Section Bands',
      description: 'Colored bands that visually group assistant sections.',
      enabled() {
        return STATE.cfg.manualEnabled;
      },
      setEnabled(on) {
        CORE_SB_setManualEnabled(!!on);
      },
      getSummary() {
        return STATE.cfg.manualEnabled ? 'Manual controls are available.' : 'Manual controls are disabled.';
      },
    };

    const attach = (host) => {
      if (!host) return;
      host.features = host.features || {};
      host.features[FEATURE_KEY_SECTION_BANDS] = cfg;
    };

    W.h2oConfig = W.h2oConfig || {};
    attach(W.h2oConfig);
    W.hoConfig = W.hoConfig || {};
    attach(W.hoConfig);
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — CSS RULES / STYLE DEFINITIONS 📄🔓💧 ───────────────────────────── */

  function CSS_SB_text() {
    const S_PALETTE = UTIL_selScoped(UI_.PALETTE);
    const S_PANEL   = UTIL_selScoped(UI_.PANEL);
    const S_RAILBTN = UTIL_selScoped(UI_.RAILBTN);
    const S_TINYBTN = `[${ATTR_.CGXUI}="${UI_.TINYBTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`; // lives inside host rail clone
    const S_BAND    = UTIL_selScoped(UI_.BAND);

    const S_PBTN    = UTIL_selScoped(UI_.PALETTE_BTN);
    const S_PTNBTN  = UTIL_selScoped(UI_.PATTERN_BTN);
    const S_SLIDER  = UTIL_selScoped(UI_.SLIDER);
    const S_ACTBTN  = UTIL_selScoped(UI_.ACT_BTN);
    const S_SWITCH  = UTIL_selScoped(UI_.SWITCH);

    // NOTE: Section band wrappers live inside message markdown; still owned via data attrs.
    return `
/* ---- Section Bands (owned, contract v2.0) ---- */

${S_BAND}{
  position: relative;
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px 0 8px 0;
  transition:
    background-color .15s ease,
    box-shadow .15s ease,
    border-color .15s ease,
    outline-color .15s ease,
    outline-width .15s ease,
    background-image .15s ease,
    max-height .20s ease,
    padding .20s ease;
  border-style: solid;
  border-width: 2px;
  border-color: transparent;
  outline: 0 solid transparent;
  outline-offset: 0;
  background-repeat: repeat;
  background-size: auto;
}

/* Don't style any accidental clones under the under-ui container */
.ho-under-ui ${S_BAND}{
  background: none !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  outline: none !important;
  background-image: none !important;
}

/* Collapsed strip */
${S_BAND}[${ATTR_.CGXUI_STATE}="collapsed"]{
  padding-top: 0;
  padding-bottom: 0;
  max-height: 6px;
  overflow: hidden;
  cursor: pointer;
}

/* Palette popup */
${S_PALETTE}{
  position: fixed;
  display: none;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(20,20,20,0.9);
  border-radius: 10px;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 2px 10px rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  z-index: 99999;
  overflow: visible;
  transform-origin: top left;
}

${S_PALETTE} [${ATTR_.CGXUI_PART}="toprow"]{
  display:flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

${S_PALETTE} [${ATTR_.CGXUI_PART}="col"]{
  display:flex;
  flex-direction: column;
  gap: 6px;
}

${S_PBTN}, ${S_PTNBTN}{
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.30);
  background-clip: padding-box;
  cursor: pointer;
  outline: none;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease, background-color .12s ease, color .12s ease;
  font-size: 13px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

${S_PTNBTN}{
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.7);
}

${S_PBTN}:hover, ${S_PTNBTN}:hover{
  transform: scale(1.12);
  box-shadow: 0 0 6px rgba(255,255,255,0.35);
}

${S_PBTN}[${ATTR_.CGXUI_STATE}="active"],
${S_PTNBTN}[${ATTR_.CGXUI_STATE}="active"]{
  box-shadow: 0 0 0 2px rgba(255,255,255,0.85) inset;
}

${S_PALETTE} [${ATTR_.CGXUI_PART}="sliderwrap"]{
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(255,255,255,0.08);
  display:flex;
  justify-content:center;
  align-items:center;
}

${S_SLIDER}{
  -webkit-appearance:none;
  appearance:none;
  width: 80px;
  height: 4px;
  background: transparent;
  cursor: pointer;
}
${S_SLIDER}::-webkit-slider-runnable-track{
  height:4px;
  border-radius:999px;
  background: rgba(255,255,255,0.25);
}
${S_SLIDER}::-webkit-slider-thumb{
  -webkit-appearance:none;
  appearance:none;
  width:12px;height:12px;border-radius:50%;
  background:#fff;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
  margin-top:-4px;
}
${S_SLIDER}::-moz-range-track{
  height:4px;border-radius:999px;
  background: rgba(255,255,255,0.25);
}
${S_SLIDER}::-moz-range-thumb{
  width:12px;height:12px;border-radius:50%;
  background:#fff;border:none;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
}

/* collapse row */
${S_PALETTE} [${ATTR_.CGXUI_PART}="collapserow"]{
  margin-top: 6px;
  display:flex;
  justify-content: space-between;
  gap: 6px;
}

${S_ACTBTN}{
  flex: 1;
  min-height: 58px;
  padding: 10px 10px;
  text-align:center;
  font-size: 11px;
  line-height: 1.2;
  font-weight: 600;
  cursor:pointer;
  border-radius: 8px;
  background: linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.03));
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow: 0 2px 6px rgba(0,0,0,0.35);
  transition: background .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease, opacity .18s ease;
}
${S_ACTBTN}:hover{
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.30);
  box-shadow: 0 3px 8px rgba(0,0,0,0.45);
  transform: translateY(-1px);
}
${S_ACTBTN}[${ATTR_.CGXUI_STATE}="disabled"]{
  opacity: .45;
  cursor: default;
  box-shadow: none;
  transform: none !important;
}

/* Control panel */
${S_PANEL}{
  position: fixed;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(15,15,15,0.96);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 10px 28px rgba(0,0,0,0.7);
  z-index: 99999;
  min-width: 190px;
  display: none;
}
${S_PANEL} [${ATTR_.CGXUI_PART}="hdr"]{
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
}
${S_PANEL} [${ATTR_.CGXUI_PART}="row"]{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
  font-size: 11px;
}

/* Switch */
${S_SWITCH}{
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: 999px;
  background: rgba(255,255,255,0.18);
  cursor:pointer;
  flex-shrink: 0;
}
${S_SWITCH} [${ATTR_.CGXUI_PART}="knob"]{
  position:absolute;
  top:2px; left:2px;
  width:14px; height:14px;
  border-radius: 50%;
  background:#fff;
  transition: transform .18s ease;
}
${S_SWITCH}[${ATTR_.CGXUI_STATE}="on"] [${ATTR_.CGXUI_PART}="knob"]{
  transform: translateX(16px);
}

/* Rail button (optional classic rail injection) */
${S_RAILBTN}{
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border:none; outline:none;
  background: transparent;
  display:flex;
  align-items:center;
  justify-content:center;
  margin: 6px auto;
  cursor:pointer;
  color: rgba(255,255,255,0.70);
  font-size: 16px;
  line-height: 1;
  transition: background .15s ease, transform .15s ease, color .15s ease;
}
${S_RAILBTN}:hover{
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.90);
  transform: translateY(-1px);
}
${S_RAILBTN}:active{
  background: rgba(255,255,255,0.10);
  transform: translateY(0px);
}
${S_RAILBTN}[${ATTR_.CGXUI_STATE}="on"]{
  background: rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.95);
}

/* Tiny-rail icon text only (cloned native pill keeps its own hover) */
#${CFG_.RAIL_ID} [${S_TINYBTN}] .h2o-icon-text{
  font-size: 16px;
  line-height: 1;
  opacity: .9;
  transform: translateY(-0.5px);
  user-select: none;
}
`;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */

  function UI_ensureStyle() {
    try {
      const css = CSS_SB_text();
      let style = D.getElementById(CSS_.STYLE_ID);
      if (!style) {
        style = D.createElement('style');
        style.id = CSS_.STYLE_ID;
        style.setAttribute(ATTR_.CGXUI, UI_.STYLE);
        style.setAttribute(ATTR_.CGXUI_OWNER, SkID);
        style.textContent = css;
        D.documentElement.appendChild(style);
      } else {
        // update in place (idempotent)
        if (style.getAttribute(ATTR_.CGXUI_OWNER) !== SkID) {
          DIAG_pushErr('skid_collision_style', `style owner != ${SkID}`);
        }
        style.textContent = css;
      }
      return true;
    } catch (e) {
      DIAG_pushErr('ensure_style_failed', e);
      return false;
    }
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS 📝🔓💥 ───────────────────────────── */

  function IO_migrateLegacyOnce() {
    try {
      if (UTIL_storage.getStr(KEY_.MIG_DONE_V1, null) === '1') return;

      const vAutoNew = UTIL_storage.getStr(KEY_.CFG_AUTO_MODE_V1, null);
      if (vAutoNew == null || vAutoNew === '') {
        const vOld = UTIL_storage.getStr(KEY_.LEG_AUTO, null);
        if (vOld != null && vOld !== '') UTIL_storage.setStr(KEY_.CFG_AUTO_MODE_V1, vOld);
      }

      const vStoreNew = UTIL_storage.getStr(KEY_.STATE_BANDS_V1, null);
      if (vStoreNew == null || vStoreNew === '') {
        const vOld = UTIL_storage.getStr(KEY_.LEG_STORE, null);
        if (vOld != null && vOld !== '') UTIL_storage.setStr(KEY_.STATE_BANDS_V1, vOld);
      }

      UTIL_storage.del(KEY_.LEG_AUTO);
      UTIL_storage.del(KEY_.LEG_STORE);
      UTIL_storage.setStr(KEY_.MIG_DONE_V1, '1');
    } catch (e) {
      DIAG_pushErr('migrate_failed', e);
    }
  }

  function IO_readStore() {
    return UTIL_storage.getJSON(KEY_.STATE_BANDS_V1, {}) || {};
  }

  function IO_writeStore(store) {
    UTIL_storage.setJSON(KEY_.STATE_BANDS_V1, store || {});
  }

  function IO_saveAnswerBands(answerEl) {
    try {
      const id = UTIL_getAnswerId(answerEl);
      if (!id) return;

      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), answerEl);
      const sections = bands.map(b => ({
        color:     b.dataset.secColor     || null,
        mode:      b.dataset.secMode      || null,
        levelFill: b.dataset.secLevelFill || null,
        levelRing: b.dataset.secLevelRing || null,
        pattern:   b.dataset.secPattern   || 'none',
        collapsed: b.dataset.secCollapsed || '0',
        source:    b.dataset.secSource    || 'none',
      }));

      const store = IO_readStore();
      store[id] = { sections };
      IO_writeStore(store);
      IO_syncAnswerInventory(answerEl, 'save');
    } catch (e) {
      DIAG_pushErr('save_answer_failed', e);
    }
  }

  function IO_saveFromBand(bandEl) {
    const answerEl = bandEl.closest(`[${ATTR_.MSG_ROLE}="assistant"]`);
    if (!answerEl) return;
    IO_saveAnswerBands(answerEl);
  }

  function IO_restoreBandsState(answerEl) {
    try {
      const id = UTIL_getAnswerId(answerEl);
      if (!id) return;

      const store = IO_readStore();
      const entry = store[id];
      if (!entry || !Array.isArray(entry.sections)) return;

      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), answerEl);
      entry.sections.forEach((s, idx) => {
        const band = bands[idx];
        if (!band || !s) return;

        band.dataset.secColor      = s.color     || '';
        band.dataset.secMode       = s.mode      || 'fill';
        band.dataset.secLevelFill  = s.levelFill || '1';
        band.dataset.secLevelRing  = s.levelRing || '3';
        band.dataset.secPattern    = s.pattern   || 'none';
        band.dataset.secCollapsed  = s.collapsed || '0';
        band.dataset.secSource     = s.source    || 'none';

        DOM_updateBandVisual(band);

        if (band.dataset.secCollapsed === '1') {
          band.setAttribute(ATTR_.CGXUI_STATE, 'collapsed');
        } else {
          band.removeAttribute(ATTR_.CGXUI_STATE);
        }
      });
      IO_syncAnswerInventory(answerEl, 'restore');
    } catch (e) {
      DIAG_pushErr('restore_failed', e);
    }
  }

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC 📝🔓💥 ───────────────────────────── */

  function CORE_SB_setAutoMode(on) {
    STATE.cfg.autoMode = !!on;
    UTIL_storage.setStr(KEY_.CFG_AUTO_MODE_V1, STATE.cfg.autoMode ? '1' : '0');

    UI_updatePanelSwitch();
    UI_updateRailButton();
    UI_updateTinyRailButtonTitle();

    if (STATE.cfg.autoMode) {
      CORE_SB_autoColorUncoloredBands();
    } else {
      CORE_SB_clearAutoBands();
    }

    try {
      W.dispatchEvent(new CustomEvent(EV_SBANDS_AUTO_MODE, { detail: { on: STATE.cfg.autoMode } }));
    } catch {}
  }

  function CORE_SB_autoColorUncoloredBands() {
    const answers = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"]`);
    for (const ans of answers) {
      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), ans);
      bands.forEach((band, idx) => {
        if (!band.dataset.secColor) {
          const key = PALETTE_getLoopKeyAt(idx);
          if (!key) return;
          band.dataset.secSource = 'auto';
          DOM_applyBandColor(band, key, 'fill');
          IO_saveFromBand(band);
        }
      });
    }
  }

  function UI_cleanupManualUi() {
    UI_hidePalette();

    if (STATE.ui.palette) {
      if (STATE.clean.onPaletteMouseDown) {
        try { STATE.ui.palette.removeEventListener('mousedown', STATE.clean.onPaletteMouseDown, true); } catch {}
        STATE.clean.onPaletteMouseDown = null;
      }
      if (STATE.ui.palette.parentNode) {
        STATE.ui.palette.parentNode.removeChild(STATE.ui.palette);
      }
      STATE.ui.palette = null;
    }

    if (STATE.ui.panel && STATE.ui.panel.parentNode) {
      STATE.ui.panel.parentNode.removeChild(STATE.ui.panel);
    }
    STATE.ui.panel = null;

    if (STATE.ui.railBtn && STATE.ui.railBtn.parentNode) {
      STATE.ui.railBtn.parentNode.removeChild(STATE.ui.railBtn);
    }
    STATE.ui.railBtn = null;
  }

  function CORE_SB_setManualEnabled(on) {
    const next = !!on;
    const same = STATE.cfg.manualEnabled === next;
    STATE.cfg.manualEnabled = next;
    UTIL_storage.setStr(KEY_.CFG_MANUAL_ENABLED_V1, next ? '1' : '0');
    if (!next) {
      UI_cleanupManualUi();
      return;
    }
    if (same && STATE.ui.palette && STATE.ui.panel && STATE.ui.railBtn) {
      UI_updatePanelSwitch();
      UI_updateRailButton();
      UI_updateTinyRailButtonTitle();
      return;
    }
    UI_ensurePalette();
    UI_ensureControlPanel();
    UI_updatePanelSwitch();
    UI_updateRailButton();
    UI_updateTinyRailButtonTitle();
  }

  function CORE_SB_clearAutoBands() {
    const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND));
    for (const band of bands) {
      if (band.dataset.secSource === 'auto') {
        DOM_clearBandColor(band);
        IO_saveFromBand(band);
      }
    }
  }

  /* ───────────────────────────── 🟤 VERIFY/SAFETY — HARDENING 📝🔓💧 ───────────────────────────── */

  function SAFE_ensureLevelsInitialized(band) {
    if (!band.dataset.secLevelFill) band.dataset.secLevelFill = '1';
    if (!band.dataset.secLevelRing) band.dataset.secLevelRing = '3';
    if (!band.dataset.secPattern)   band.dataset.secPattern   = 'none';
    if (!band.dataset.secCollapsed) band.dataset.secCollapsed = '0';
    if (!band.dataset.secSource)    band.dataset.secSource    = 'none';
  }

  function SAFE_getPaletteDef(key) {
    return PALETTE_getDef(key);
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM (Bands + Palette) 📝🔓💥 ───────────────────────────── */

  function DOM_applyPatternToBand(band) {
    const pattern = band.dataset.secPattern || 'none';

    if (pattern === 'stripe') {
      band.style.backgroundImage =
        'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 4px)';
      band.style.backgroundSize = 'auto';
    } else if (pattern === 'dots') {
      band.style.backgroundImage =
        'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)';
      band.style.backgroundSize = '8px 8px';
    } else if (pattern === 'lines') {
      band.style.backgroundImage =
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 6px)';
      band.style.backgroundSize = 'auto';
    } else if (pattern === 'cross') {
      band.style.backgroundImage =
        'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 4px),' +
        'repeating-linear-gradient(135deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 2px, transparent 2px, transparent 4px)';
      band.style.backgroundSize = 'auto';
    } else if (pattern === 'grid') {
      band.style.backgroundImage =
        'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 8px),' +
        'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 8px)';
      band.style.backgroundSize = 'auto';
    } else {
      band.style.backgroundImage = 'none';
    }
  }

  function DOM_updateBandVisual(band) {
    SAFE_ensureLevelsInitialized(band);

    const key = band.dataset.secColor;
    if (!key) {
      band.style.backgroundColor = 'transparent';
      band.style.borderColor = 'transparent';
      band.style.outline = '0 solid transparent';
      band.style.backgroundImage = 'none';
      return;
    }

    const def = SAFE_getPaletteDef(key);
    if (!def) {
      band.style.backgroundColor = 'transparent';
      band.style.borderColor = 'transparent';
      band.style.outline = '0 solid transparent';
      band.style.backgroundImage = 'none';
      return;
    }

    const mode = band.dataset.secMode || 'fill';

    if (mode === 'ring') {
      const lvlRing = UTIL_clamp(parseInt(band.dataset.secLevelRing || '3', 10), 1, CFG_RING_WIDTHS.length);
      const width = CFG_RING_WIDTHS[lvlRing - 1];
      const rgbaBorder = `rgba(${def.rgb}, 0.50)`;

      band.style.backgroundColor = 'transparent';
      band.style.borderColor = 'transparent';
      band.style.outline = `${width}px solid ${rgbaBorder}`;
    } else {
      const lvlFill = UTIL_clamp(parseInt(band.dataset.secLevelFill || '1', 10), 1, CFG_FILL_ALPHAS.length);
      const alpha = CFG_FILL_ALPHAS[lvlFill - 1];
      const rgbaFill = `rgba(${def.rgb}, ${alpha.toFixed(2)})`;

      band.style.backgroundColor = rgbaFill;
      band.style.borderColor = 'transparent';
      band.style.outline = '0 solid transparent';
    }

    DOM_applyPatternToBand(band);
  }

  function DOM_clearBandColor(band) {
    delete band.dataset.secColor;
    delete band.dataset.secMode;
    delete band.dataset.secPattern;
    band.dataset.secSource = 'none';

    band.style.backgroundColor = 'transparent';
    band.style.borderColor = 'transparent';
    band.style.outline = '0 solid transparent';
    band.style.backgroundImage = 'none';
  }

  function DOM_applyBandColor(band, key, mode) {
    const def = SAFE_getPaletteDef(key);
    if (!def) return;
    SAFE_ensureLevelsInitialized(band);
    band.dataset.secColor = key;
    band.dataset.secMode = mode || 'fill';
    DOM_updateBandVisual(band);
  }

  function DOM_setBandColorOrClear(band, key, mode) {
    const curKey = band.dataset.secColor || null;
    const curMode = band.dataset.secMode || 'fill';

    if (curKey === key && curMode === mode) {
      DOM_clearBandColor(band);
    } else {
      DOM_applyBandColor(band, key, mode);
      band.dataset.secSource = 'manual';
      PALETTE_setLastUsedKey(key);
    }
    IO_saveFromBand(band);
  }

  function DOM_setBandPattern(band, patternKey) {
    if (!CFG_PATTERN_KEYS.includes(patternKey)) return;
    const current = band.dataset.secPattern || 'none';
    band.dataset.secPattern = (current === patternKey) ? 'none' : patternKey;
    DOM_updateBandVisual(band);
    IO_saveFromBand(band);
  }

  function DOM_cycleBandColor(band, step = 1) {
    if (!band) return false;
    const keys = PALETTE_getLoopKeys();
    if (!keys.length) return false;

    const curKey = String(band.dataset.secColor || '').trim();
    const idx = keys.indexOf(curKey);
    const normStep = step < 0 ? -1 : 1;
    const startIdx = (idx >= 0) ? idx : (normStep > 0 ? -1 : 0);
    const nextKey = keys[(startIdx + normStep + keys.length) % keys.length];

    SAFE_ensureLevelsInitialized(band);
    DOM_applyBandColor(band, nextKey, band.dataset.secMode || 'fill');
    band.dataset.secSource = 'manual';
    PALETTE_setLastUsedKey(nextKey);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_applyBandColorFromKeyActivation(band) {
    if (!band) return false;
    const key = PALETTE_resolveApplyStartKey();
    if (!key) return false;
    SAFE_ensureLevelsInitialized(band);
    DOM_applyBandColor(band, key, band.dataset.secMode || 'fill');
    band.dataset.secSource = 'manual';
    PALETTE_setLastUsedKey(key);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_removeBandColor(band) {
    if (!band) return false;
    DOM_clearBandColor(band);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_adjustBandIntensity(band, step = 1) {
    if (!band || !band.dataset.secColor) return false;
    SAFE_ensureLevelsInitialized(band);

    const normStep = step < 0 ? -1 : 1;
    const mode = band.dataset.secMode || 'fill';
    if (mode === 'ring') {
      const next = UTIL_clamp(parseInt(band.dataset.secLevelRing || '3', 10) + normStep, 1, CFG_RING_WIDTHS.length);
      band.dataset.secLevelRing = String(next);
    } else {
      const next = UTIL_clamp(parseInt(band.dataset.secLevelFill || '1', 10) + normStep, 1, CFG_FILL_ALPHAS.length);
      band.dataset.secLevelFill = String(next);
    }

    DOM_updateBandVisual(band);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_toggleBandMode(band) {
    if (!band || !band.dataset.secColor) return false;
    SAFE_ensureLevelsInitialized(band);
    band.dataset.secMode = (band.dataset.secMode === 'ring') ? 'fill' : 'ring';
    DOM_updateBandVisual(band);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_toggleBandPatternSelection(band) {
    if (!band) return false;
    SAFE_ensureLevelsInitialized(band);
    band.dataset.secPattern = (band.dataset.secPattern && band.dataset.secPattern !== 'none')
      ? 'none'
      : CFG_PATTERN_KEYS[0];
    DOM_updateBandVisual(band);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_cycleBandPattern(band, step = 1) {
    if (!band) return false;
    SAFE_ensureLevelsInitialized(band);

    const normStep = step < 0 ? -1 : 1;
    const cur = band.dataset.secPattern || 'none';
    const idx = CFG_PATTERN_KEYS.indexOf(cur);
    const startIdx = (idx >= 0) ? idx : (normStep > 0 ? -1 : 0);
    band.dataset.secPattern = CFG_PATTERN_KEYS[(startIdx + normStep + CFG_PATTERN_KEYS.length) % CFG_PATTERN_KEYS.length];
    DOM_updateBandVisual(band);
    IO_saveFromBand(band);
    if (STATE.ui.currentBand === band) UI_updatePaletteActiveState();
    return true;
  }

  function DOM_isBandCollapsed(band) {
    return (band.dataset.secCollapsed === '1') || (band.getAttribute(ATTR_.CGXUI_STATE) === 'collapsed');
  }

  function DOM_collapseBand(band) {
    if (DOM_isBandCollapsed(band)) return;
    band.dataset.secCollapsed = '1';
    band.setAttribute(ATTR_.CGXUI_STATE, 'collapsed');

    if (!band.dataset.secColor) {
      const cs = getComputedStyle(band);
      const bg = cs.backgroundColor;
      const isTransparent = bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)';
      if (isTransparent) band.style.backgroundColor = 'rgba(40,40,40,0.9)';
    }

    IO_saveFromBand(band);
  }

  function DOM_expandBand(band) {
    if (!DOM_isBandCollapsed(band)) return;
    band.dataset.secCollapsed = '0';
    band.removeAttribute(ATTR_.CGXUI_STATE);

    if (!band.dataset.secColor) band.style.backgroundColor = 'transparent';

    IO_saveFromBand(band);
  }

  function DOM_getAnswerElFromBand(band) {
    if (!UTIL_isEl(band)) return null;
    return band.closest(`[${ATTR_.MSG_ROLE}="assistant"]`);
  }

  function DOM_getMarkdownElFromBand(band) {
    const answerEl = DOM_getAnswerElFromBand(band);
    const sc = W.H2O?.SectionCollapser;
    if (answerEl && typeof sc?.findMarkdownFromNode === 'function') {
      return sc.findMarkdownFromNode(answerEl);
    }
    if (!answerEl) return null;
    return (
      answerEl.querySelector('.markdown') ||
      answerEl.querySelector('[data-message-content]') ||
      answerEl.querySelector('div[class*="markdown"]') ||
      answerEl.querySelector('div.prose') ||
      null
    );
  }

  function DOM_showSectionsForBandAnswer(band) {
    const md = DOM_getMarkdownElFromBand(band);
    const sc = W.H2O?.SectionCollapser;
    if (!md || typeof sc?.showSections !== 'function') return false;
    return !!sc.showSections(md);
  }

  function DOM_collapseSectionsForBandAnswer(band) {
    const md = DOM_getMarkdownElFromBand(band);
    const sc = W.H2O?.SectionCollapser;
    if (!md) return false;
    if (typeof sc?.collapseSections === 'function') return !!sc.collapseSections(md);
    if (typeof sc?.ensureSectionized === 'function' && typeof sc?.collapseAll === 'function') {
      const ok = sc.ensureSectionized(md, { expand: false });
      if (!ok) return false;
      sc.collapseAll(md);
      return true;
    }
    return false;
  }

  function DOM_collapseEntireAnswerFromBand(band) {
    const md = DOM_getMarkdownElFromBand(band);
    const sc = W.H2O?.SectionCollapser;
    if (!md || typeof sc?.collapseEntireAnswer !== 'function') return false;
    return !!sc.collapseEntireAnswer(md);
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — UI NODES (Palette/Panel/Buttons) 📝🔓💥 ───────────────────────────── */

  function UI_ensurePalette() {
    if (!STATE.cfg.manualEnabled) return null;
    if (STATE.ui.palette) return STATE.ui.palette;

    const palette = UTIL_mkOwned('div', UI_.PALETTE, 'root');
    D.body.appendChild(palette);

    STATE.ui.palette = palette;

    STATE.clean.onPaletteMouseDown = (e) => UI_onPaletteMouseDown(e);
    palette.addEventListener('mousedown', STATE.clean.onPaletteMouseDown, true);

    return palette;
  }

  function UI_hidePalette() {
    const el = STATE.ui.palette;
    if (!el) return;
    el.style.display = 'none';
    STATE.ui.currentBand = null;
    STATE.ui.slider = null;
  }

  function UI_isPaletteVisible() {
    const el = STATE.ui.palette;
    return !!(el && el.style.display !== 'none');
  }

  function UI_buildPalette() {
    const paletteEl = UI_ensurePalette();
    paletteEl.innerHTML = '';
    STATE.ui.slider = null;

    const topRow = D.createElement('div');
    topRow.setAttribute(ATTR_.CGXUI_PART, 'toprow');

    const mkCol = () => {
      const col = D.createElement('div');
      col.setAttribute(ATTR_.CGXUI_PART, 'col');
      return col;
    };

    const colPattern = mkCol();
    const colRing = mkCol();
    const colFill = mkCol();

    // Pattern buttons (left)
    const patternDefs = [
      { key: 'stripe', label: '/' },
      { key: 'dots',   label: '•' },
      { key: 'lines',  label: '=' },
      { key: 'cross',  label: '×' },
      { key: 'grid',   label: '#' },
    ];

    for (const p of patternDefs) {
      const btn = UTIL_mkOwned('button', UI_.PATTERN_BTN, 'pattern');
      btn.type = 'button';
      btn.setAttribute(ATTR_.CGXUI_PART, 'pattern');
      btn.dataset.patternKey = p.key;
      btn.textContent = p.label;
      colPattern.appendChild(btn);
    }

    // Ring buttons (middle)
    for (const { key, rgb, label, hex } of PALETTE_getLoopDefs()) {
      const btn = UTIL_mkOwned('button', UI_.PALETTE_BTN, 'ring');
      btn.type = 'button';
      btn.dataset.colorKey = key;
      btn.dataset.mode = 'ring';
      btn.style.borderColor = `rgba(${rgb}, 0.8)`;
      btn.title = `${label} ${String(hex || '').toUpperCase()}`.trim();
      colRing.appendChild(btn);
    }

    // Fill buttons (right)
    for (const { key, rgb, label, hex } of PALETTE_getLoopDefs()) {
      const btn = UTIL_mkOwned('button', UI_.PALETTE_BTN, 'fill');
      btn.type = 'button';
      btn.dataset.colorKey = key;
      btn.dataset.mode = 'fill';
      btn.style.background = `rgba(${rgb}, 0.25)`;
      btn.title = `${label} ${String(hex || '').toUpperCase()}`.trim();
      colFill.appendChild(btn);
    }

    topRow.appendChild(colPattern);
    topRow.appendChild(colRing);
    topRow.appendChild(colFill);
    paletteEl.appendChild(topRow);

    // Slider row
    const wrap = D.createElement('div');
    wrap.setAttribute(ATTR_.CGXUI_PART, 'sliderwrap');

    const slider = UTIL_mkOwned('input', UI_.SLIDER, 'slider');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '5';
    slider.step = '1';
    slider.setAttribute(ATTR_.CGXUI_PART, 'slider');

    STATE.ui.slider = slider;

    const band = STATE.ui.currentBand;
    if (band) {
      SAFE_ensureLevelsInitialized(band);
      const mode = band.dataset.secMode || 'fill';
      slider.value = (mode === 'ring')
        ? (band.dataset.secLevelRing || '3')
        : (band.dataset.secLevelFill || '1');
    } else {
      slider.value = '1';
    }

    slider.addEventListener('input', () => {
      const b = STATE.ui.currentBand;
      if (!b) return;
      SAFE_ensureLevelsInitialized(b);
      const mode = b.dataset.secMode || 'fill';
      if (mode === 'ring') b.dataset.secLevelRing = slider.value;
      else b.dataset.secLevelFill = slider.value;
      DOM_updateBandVisual(b);
      IO_saveFromBand(b);
      UI_updatePaletteActiveState();
    });

    wrap.appendChild(slider);
    paletteEl.appendChild(wrap);

    // Action rows
    const row = D.createElement('div');
    row.setAttribute(ATTR_.CGXUI_PART, 'collapserow');

    const row2 = D.createElement('div');
    row2.setAttribute(ATTR_.CGXUI_PART, 'collapserow');

    const mkAct = (txt) => {
      const b = UTIL_mkOwned('button', UI_.ACT_BTN, 'act');
      b.type = 'button';
      b.textContent = txt;
      b.setAttribute(ATTR_.CGXUI_PART, 'act');
      return b;
    };

    const collapseBtn = mkAct('Collapse');
    const expandBtn = mkAct('Expand');
    const showSectionsBtn = mkAct('Show Sections');
    const collapseSectionsBtn = mkAct('Collapse Sections');
    const collapseAnswerBtn = mkAct('Collapse Answer');

    const row3 = D.createElement('div');
    row3.setAttribute(ATTR_.CGXUI_PART, 'collapserow');
    const row4 = D.createElement('div');
    row4.setAttribute(ATTR_.CGXUI_PART, 'collapserow');

    row.appendChild(collapseBtn);
    row.appendChild(expandBtn);
    row2.appendChild(showSectionsBtn);
    row3.appendChild(collapseSectionsBtn);
    row4.appendChild(collapseAnswerBtn);
    paletteEl.appendChild(row);
    paletteEl.appendChild(row2);
    paletteEl.appendChild(row3);
    paletteEl.appendChild(row4);

    const scApi = W.H2O?.SectionCollapser;
    const isCollapsed = band ? DOM_isBandCollapsed(band) : false;
    if (isCollapsed) collapseBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
    else expandBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
    if (!scApi?.showSections) showSectionsBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
    if (!(scApi?.collapseSections || (scApi?.ensureSectionized && scApi?.collapseAll))) collapseSectionsBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
    if (!scApi?.collapseEntireAnswer) collapseAnswerBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');

    collapseBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const b = STATE.ui.currentBand;
      if (!b || DOM_isBandCollapsed(b)) return;
      DOM_collapseBand(b);
      collapseBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
      expandBtn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    expandBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const b = STATE.ui.currentBand;
      if (!b || !DOM_isBandCollapsed(b)) return;
      DOM_expandBand(b);
      expandBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
      collapseBtn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    showSectionsBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const b = STATE.ui.currentBand;
      if (!b) return;
      const ok = DOM_showSectionsForBandAnswer(b);
      if (!ok) {
        showSectionsBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
        return;
      }
      showSectionsBtn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    collapseSectionsBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const b = STATE.ui.currentBand;
      if (!b) return;
      const ok = DOM_collapseSectionsForBandAnswer(b);
      if (!ok) {
        collapseSectionsBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
        return;
      }
      collapseSectionsBtn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    collapseAnswerBtn.addEventListener('click', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const b = STATE.ui.currentBand;
      if (!b) return;
      const ok = DOM_collapseEntireAnswerFromBand(b);
      if (!ok) {
        collapseAnswerBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
      }
    });
  }

  function UI_updatePaletteActiveState() {
    const paletteEl = STATE.ui.palette;
    const band = STATE.ui.currentBand;
    if (!paletteEl || !band) return;

    const curKey = band.dataset.secColor || null;
    const curMode = band.dataset.secMode || 'fill';
    const curPattern = band.dataset.secPattern || 'none';

    // color buttons
    const pbtnSel = UTIL_selScoped(UI_.PALETTE_BTN);
    const btns = UTIL_qsa(pbtnSel, paletteEl);
    btns.forEach(btn => {
      const key = btn.dataset.colorKey;
      const mode = btn.dataset.mode || 'fill';
      const active = (key === curKey && mode === curMode);
      if (active) btn.setAttribute(ATTR_.CGXUI_STATE, 'active');
      else btn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    // pattern buttons
    const ptnSel = UTIL_selScoped(UI_.PATTERN_BTN);
    const ptns = UTIL_qsa(ptnSel, paletteEl);
    ptns.forEach(btn => {
      const pk = btn.dataset.patternKey;
      const active = (pk === curPattern) && pk !== 'none';
      if (active) btn.setAttribute(ATTR_.CGXUI_STATE, 'active');
      else btn.removeAttribute(ATTR_.CGXUI_STATE);
    });

    // slider sync
    if (STATE.ui.slider) {
      SAFE_ensureLevelsInitialized(band);
      const mode = band.dataset.secMode || 'fill';
      STATE.ui.slider.value = (mode === 'ring')
        ? (band.dataset.secLevelRing || '3')
        : (band.dataset.secLevelFill || '1');
    }
  }

  function UI_positionPaletteNearBand(band) {
    const paletteEl = STATE.ui.palette;
    if (!paletteEl || !band) return;
    if (paletteEl.style.display === 'none') return;

    // Measure at natural size (no scale) first
    paletteEl.style.transformOrigin = 'top left';
    paletteEl.style.transform = 'scale(1)';

    const rect = band.getBoundingClientRect();
    const pr0 = paletteEl.getBoundingClientRect();
    if (!pr0 || pr0.width < 10 || pr0.height < 10) return;

    const gap = 10;               // space between popup and answer text
    const pad = CFG_.VIEWPORT_PAD; // viewport padding

    // Anchor to the LEFT of the answer text area (never cover the text)
    const ans = band.closest(`[${ATTR_.MSG_ROLE}="assistant"]`);
    const md = ans ? ans.querySelector('.markdown') : null;
    const tr = md ? md.getBoundingClientRect() : null;

    // Fallback: use band rect if markdown not found
    const textLeft = tr ? tr.left : rect.left;

    // Horizontal space available on the left side of text
    const maxRightEdge = Math.max(pad + 20, textLeft - gap); // where popup must end (to the left of text)
    const availW = Math.max(50, maxRightEdge - pad);

    // Vertical space available in viewport
    const availH = Math.max(50, W.innerHeight - pad * 2);

    // Scale down ONLY if needed so the popup fits fully in the available left gutter
    const scale = Math.min(1, availW / pr0.width, availH / pr0.height);
    paletteEl.style.transform = (scale < 1) ? `scale(${scale})` : 'scale(1)';

    const prW = pr0.width * scale;
    const prH = pr0.height * scale;

    // Position: vertically centered to band, right edge fixed before text
    let top = rect.top + rect.height / 2 - prH / 2;
    let left = maxRightEdge - prW;

    // Clamp vertically (and left, but keep it from ever overlapping the text)
    const clV = UTIL_inViewportClamp(top, left, prW, prH);
    const clLeft = Math.min(clV.left, maxRightEdge - prW);

    paletteEl.style.top = `${clV.top}px`;
    paletteEl.style.left = `${clLeft}px`;
  }

  function UI_showPaletteForBand(band) {
    if (!STATE.cfg.manualEnabled) return;
    STATE.ui.currentBand = band;
    SAFE_ensureLevelsInitialized(band);

    UI_buildPalette();
    UI_updatePaletteActiveState();

    const paletteEl = STATE.ui.palette;

    // Render first, measure next frame (prevents 0x0 rect → bad clamp → cropped popup)
    paletteEl.style.visibility = 'hidden';
    paletteEl.style.display = 'flex';
    paletteEl.style.top = '0px';
    paletteEl.style.left = '0px';
    paletteEl.style.transform = 'scale(1)';

    let tries = 0;
    const place = () => {
      tries++;

      const pr = paletteEl.getBoundingClientRect();
      if ((pr.width < 10 || pr.height < 10) && tries < 3) {
        W.requestAnimationFrame(place);
        return;
      }

      UI_positionPaletteNearBand(band);
      paletteEl.style.visibility = 'visible';
    };

    W.requestAnimationFrame(place);
  }

  function UI_togglePaletteForBand(band) {
    if (!band) return false;
    if (UI_isPaletteVisible() && STATE.ui.currentBand === band) {
      UI_hidePalette();
      return true;
    }
    UI_showPaletteForBand(band);
    return true;
  }

  function DOM_findBandFromMarginGutterPoint(msgEl, clientY) {
    if (!UTIL_isAssistantMsg(msgEl)) return null;
    const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND), msgEl);
    if (!bands.length) return null;

    let nearest = null;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const band of bands) {
      const rect = band.getBoundingClientRect?.();
      if (!rect || rect.height <= 0) continue;
      if (clientY >= rect.top && clientY <= rect.bottom) return band;

      const dist = (clientY < rect.top) ? (rect.top - clientY) : (clientY - rect.bottom);
      if (dist < nearestDist) {
        nearest = band;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  function CORE_SB_togglePaletteFromMarginGutter({ msgEl, clientY }) {
    if (!STATE.cfg.manualEnabled) return false;
    const band = DOM_findBandFromMarginGutterPoint(msgEl, clientY);
    if (!band) return false;
    return UI_togglePaletteForBand(band);
  }

  function TIME_resolveBandFromSelection() {
    const sel = W.getSelection?.();
    if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;

    const text = String(sel.toString() || '').trim();
    if (!text) return null;

    const range = sel.getRangeAt(0);
    return (
      UTIL_getOwnedBandFromNode(range.commonAncestorContainer) ||
      UTIL_getOwnedBandFromNode(range.startContainer) ||
      UTIL_getOwnedBandFromNode(range.endContainer) ||
      UTIL_getOwnedBandFromNode(sel.anchorNode) ||
      UTIL_getOwnedBandFromNode(sel.focusNode) ||
      null
    );
  }

  function TIME_resolveHoveredBand() {
    const band = STATE.ui.hoverBand;
    if (!band || !D.contains(band)) return null;
    return band;
  }

  function TIME_resolveShortcutBand(opts = {}) {
    const selectionBand = TIME_resolveBandFromSelection();
    const hoveredBand = TIME_resolveHoveredBand();
    const band = opts.preferSelection ? (selectionBand || hoveredBand) : (hoveredBand || selectionBand);
    if (!band || !band.closest(`[${ATTR_.MSG_ROLE}="assistant"]`)) return null;
    return band;
  }

  function TIME_trackHoveredBand(e) {
    if (!STATE.cfg.manualEnabled) return;
    STATE.ui.hoverBand = UTIL_getOwnedBandFromNode(e?.target);
  }

  function TIME_plainKeyMatch(e, key) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
    const k = String(e.key || '');
    if (key === 'space') return (k === ' ' || e.code === 'Space' || k === 'Spacebar');
    if (key === 'enter') return k === 'Enter';
    if (key === 'backspace') return k === 'Backspace';
    if (key === 'escape') return k === 'Escape' || k === 'Esc';
    return false;
  }

  function TIME_comboKeyMatch(e, combo) {
    const k = String(e.key || '').toLowerCase();
    const isCmd = !!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    const isCtrl = !!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    const isCmdOrCtrl = (e.metaKey || e.ctrlKey) && !(e.metaKey && e.ctrlKey) && !e.altKey && !e.shiftKey;

    switch (combo) {
      case 'meta_1': return isCmd && k === '1';
      case 'meta_h': return isCmd && k === 'h';
      case 'ctrl_1': return isCtrl && k === '1';
      case 'ctrl_h': return isCtrl && k === 'h';
      case 'meta_or_ctrl_1': return isCmdOrCtrl && k === '1';
      case 'meta_or_ctrl_h': return isCmdOrCtrl && k === 'h';
      case 'meta_z': return isCmd && k === 'z';
      case 'ctrl_z': return isCtrl && k === 'z';
      case 'meta_or_ctrl_z': return isCmdOrCtrl && k === 'z';
      case 'meta_x': return isCmd && k === 'x';
      case 'ctrl_x': return isCtrl && k === 'x';
      case 'meta_or_ctrl_x': return isCmdOrCtrl && k === 'x';
      case 'meta_v': return isCmd && k === 'v';
      case 'ctrl_v': return isCtrl && k === 'v';
      case 'meta_or_ctrl_v': return isCmdOrCtrl && k === 'v';
      default: return false;
    }
  }

  function TIME_matchHotkey(e, binding) {
    const b = String(binding || 'none');
    if (b === 'none') return false;
    return TIME_plainKeyMatch(e, b) || TIME_comboKeyMatch(e, b);
  }

  function TIME_matchDirectionalBinding(e, binding) {
    const b = String(binding || 'none');
    if (b === 'none') return 0;
    if (b === 'space') return TIME_plainKeyMatch(e, 'space') ? 1 : 0;
    if (b === 'enter') return TIME_plainKeyMatch(e, 'enter') ? 1 : 0;
    if (b === 'enter_backspace') {
      if (TIME_plainKeyMatch(e, 'enter')) return 1;
      if (TIME_plainKeyMatch(e, 'backspace')) return -1;
      return 0;
    }
    if (b === 'arrow_lr' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowRight') return 1;
      if (e.key === 'ArrowLeft') return -1;
    }
    if (b === 'arrow_ud' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      if (e.key === 'ArrowUp') return 1;
      if (e.key === 'ArrowDown') return -1;
    }
    return 0;
  }

  function TIME_matchRotatePatternBinding(e, binding) {
    const step = TIME_matchDirectionalBinding(e, binding);
    if (step) return step;
    return (!e.repeat && TIME_matchHotkey(e, binding)) ? 1 : 0;
  }

  function TIME_popupBindingInfo(binding) {
    const map = {
      left_click: { button: 0, dbl: false },
      middle_click: { button: 1, dbl: false },
      right_click: { button: 2, dbl: false },
      left_double: { button: 0, dbl: true },
      middle_double: { button: 1, dbl: true },
      right_double: { button: 2, dbl: true },
    };
    return map[String(binding || 'none')] || null;
  }

  function TIME_isBandLeftHotzoneHit(band, e) {
    if (!band || !e || !Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return false;
    const rect = band.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    if (e.clientY < rect.top || e.clientY > rect.bottom) return false;
    return e.clientX >= rect.left && e.clientX <= (rect.left + Math.min(CFG_.BAND_LEFT_HOTZONE_PX, Math.max(24, rect.width * 0.22)));
  }

  function TIME_resolvePopupBandFromEvent(e) {
    const targetEl = UTIL_nodeToElement(e?.target);
    if (!targetEl) return null;
    if (UTIL_isEditableLike(targetEl)) return null;
    if (targetEl.closest('a, button, input, textarea, select, [role="button"], [role="textbox"]')) return null;
    const band = UTIL_getOwnedBandFromNode(targetEl);
    if (!band || !band.closest(`[${ATTR_.MSG_ROLE}="assistant"]`)) return null;
    return TIME_isBandLeftHotzoneHit(band, e) ? band : null;
  }

  function TIME_handlePopupMouseDown(e) {
    const info = TIME_popupBindingInfo(BINDINGS_get('popupMouse'));
    if (!info || e.button !== info.button) return false;

    const band = TIME_resolvePopupBandFromEvent(e);
    if (!band) return false;

    e.preventDefault();
    e.stopPropagation();
    STATE.ui.hoverBand = band;

    if (!info.dbl) {
      UI_togglePaletteForBand(band);
      return true;
    }

    const now = performance.now();
    const dx = Math.abs((e.clientX || 0) - Number(STATE.ui.popupMouseLastPoint?.x || 0));
    const dy = Math.abs((e.clientY || 0) - Number(STATE.ui.popupMouseLastPoint?.y || 0));
    const same =
      STATE.ui.popupMouseLastBand === band &&
      STATE.ui.popupMouseLastButton === info.button &&
      (now - STATE.ui.popupMouseLastAt) <= CFG_.POPUP_MOUSE_DOUBLE_MS &&
      dx <= CFG_.POPUP_MOUSE_SLOP_PX &&
      dy <= CFG_.POPUP_MOUSE_SLOP_PX;

    STATE.ui.popupMouseLastAt = now;
    STATE.ui.popupMouseLastBand = band;
    STATE.ui.popupMouseLastButton = info.button;
    STATE.ui.popupMouseLastPoint = { x: e.clientX || 0, y: e.clientY || 0 };

    if (same) {
      STATE.ui.popupMouseLastAt = 0;
      STATE.ui.popupMouseLastBand = null;
      STATE.ui.popupMouseLastButton = -1;
      UI_togglePaletteForBand(band);
    }
    return true;
  }

  function TIME_onDocumentContextMenu(e) {
    const info = TIME_popupBindingInfo(BINDINGS_get('popupMouse'));
    if (!info || info.button !== 2) return;
    if (!TIME_resolvePopupBandFromEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function TIME_onDocumentKeyDown(e) {
    if (!STATE.cfg.manualEnabled) return;
    try {
      const targetEl = UTIL_nodeToElement(e?.target);
      const activeEl = UTIL_isEl(D.activeElement) ? D.activeElement : null;
      if (UTIL_isEditableLike(targetEl) || UTIL_isEditableLike(activeEl)) return;

      const applyColorBinding = BINDINGS_get('applyColor');
      const rotateColorBinding = BINDINGS_get('rotateColor');
      if (!e.repeat && TIME_matchHotkey(e, applyColorBinding)) {
        const band = TIME_resolveShortcutBand({ preferSelection: true });
        if (!band) return;
        if (band.dataset.secColor) {
          if (applyColorBinding !== rotateColorBinding) return;
          e.preventDefault();
          e.stopPropagation();
          DOM_cycleBandColor(band, 1);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        DOM_applyBandColorFromKeyActivation(band);
        return;
      }

      if (TIME_matchHotkey(e, BINDINGS_get('clearColor'))) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        DOM_removeBandColor(band);
        return;
      }

      const rotateColorStep = TIME_matchDirectionalBinding(e, rotateColorBinding);
      if (rotateColorStep) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        DOM_cycleBandColor(band, rotateColorStep);
        return;
      }

      const intensityStep = TIME_matchDirectionalBinding(e, BINDINGS_get('intensity'));
      if (intensityStep) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        DOM_adjustBandIntensity(band, intensityStep);
        return;
      }

      const modeBinding = BINDINGS_get('mode');
      const modeStep = TIME_matchDirectionalBinding(e, modeBinding);
      if (modeStep || (!e.repeat && TIME_matchHotkey(e, modeBinding))) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        DOM_toggleBandMode(band);
        return;
      }

      const choosePatternBinding = BINDINGS_get('choosePattern');
      const rotatePatternBinding = BINDINGS_get('rotatePattern');
      const rotatePatternStep = TIME_matchRotatePatternBinding(e, rotatePatternBinding);
      if (rotatePatternStep) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        DOM_cycleBandPattern(band, rotatePatternStep);
        return;
      }

      if (!e.repeat && TIME_matchHotkey(e, choosePatternBinding)) {
        const band = TIME_resolveShortcutBand();
        if (!band) return;
        e.preventDefault();
        e.stopPropagation();
        if (choosePatternBinding === rotatePatternBinding && band.dataset.secPattern && band.dataset.secPattern !== 'none') {
          DOM_cycleBandPattern(band, 1);
        } else {
          DOM_toggleBandPatternSelection(band);
        }
      }
    } catch (err) {
      DIAG_pushErr('doc_keydown_failed', err);
    }
  }

  function UI_onPaletteMouseDown(e) {
    if (!STATE.cfg.manualEnabled) return;
    if (!UTIL_isEl(e.target)) return;

    const band = STATE.ui.currentBand;
    if (!band) return;

    const patternBtn = e.target.closest(UTIL_selScoped(UI_.PATTERN_BTN));
    const colorBtn   = e.target.closest(UTIL_selScoped(UI_.PALETTE_BTN));

    if (patternBtn) {
      e.preventDefault(); e.stopPropagation();
      const pk = patternBtn.dataset.patternKey;
      DOM_setBandPattern(band, pk);
      UI_updatePaletteActiveState();
      return;
    }

    if (colorBtn) {
      e.preventDefault(); e.stopPropagation();
      const key = colorBtn.dataset.colorKey;
      const mode = colorBtn.dataset.mode || 'fill';
      DOM_setBandColorOrClear(band, key, mode);
      UI_updatePaletteActiveState();
      return;
    }
  }

  function UI_ensureControlPanel() {
    if (!STATE.cfg.manualEnabled) return null;
    if (STATE.ui.panel) return STATE.ui.panel;

    const panel = UTIL_mkOwned('div', UI_.PANEL, 'panel');
    panel.style.display = 'none';

    const hdr = D.createElement('div');
    hdr.setAttribute(ATTR_.CGXUI_PART, 'hdr');
    hdr.textContent = 'Section Bands';

    const row = D.createElement('div');
    row.setAttribute(ATTR_.CGXUI_PART, 'row');

    const left = D.createElement('span');
    left.textContent = 'Automatic coloring';

    const sw = UTIL_mkOwned('div', UI_.SWITCH, 'switch');
    sw.setAttribute(ATTR_.CGXUI_PART, 'switch');

    const knob = D.createElement('div');
    knob.setAttribute(ATTR_.CGXUI_PART, 'knob');
    sw.appendChild(knob);

    row.appendChild(left);
    row.appendChild(sw);

    panel.appendChild(hdr);
    panel.appendChild(row);

    D.body.appendChild(panel);

    sw.addEventListener('click', () => {
      CORE_SB_setAutoMode(!STATE.cfg.autoMode);
    });

    STATE.ui.panel = panel;
    UI_updatePanelSwitch();
    return panel;
  }

  function UI_updatePanelSwitch() {
    const panel = STATE.ui.panel;
    if (!panel) return;
    const sw = panel.querySelector(UTIL_selScoped(UI_.SWITCH));
    if (!sw) return;

    if (STATE.cfg.autoMode) sw.setAttribute(ATTR_.CGXUI_STATE, 'on');
    else sw.removeAttribute(ATTR_.CGXUI_STATE);
  }

  function UI_updateRailButton() {
    const btn = STATE.ui.railBtn;
    if (!btn) return;
    btn.textContent = '🍰';
    if (STATE.cfg.autoMode) btn.setAttribute(ATTR_.CGXUI_STATE, 'on');
    else btn.removeAttribute(ATTR_.CGXUI_STATE);
    btn.title = STATE.cfg.autoMode ? 'Section Bands (Auto ON)' : 'Section Bands (Auto OFF)';
  }

  function UI_updateTinyRailButtonTitle() {
    const rail = D.getElementById(CFG_.RAIL_ID);
    if (!rail) return;
    const tiny = rail.querySelector(`[${ATTR_.CGXUI}="${UI_.TINYBTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
    if (!tiny) return;
    tiny.title = STATE.cfg.autoMode ? 'Section Bands (Auto ON)' : 'Section Bands (Auto OFF)';
  }

  function UI_positionPanelNearRailBtn() {
    const panel = STATE.ui.panel;
    const btn = STATE.ui.railBtn;
    if (!panel || !btn) return;
    if (panel.style.display !== 'block') return;
    if (STATE.ui.panelAnchor !== 'rail') return;

    const br = btn.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    if (!pr || pr.width < 10 || pr.height < 10) {
      W.requestAnimationFrame(() => {
        try { UI_positionPanelNearRailBtn(); } catch {}
      });
      return;
    }
    const gap = CFG_.PANEL_GAP_RAIL;

    let top = br.top;
    let left = br.right + gap;

    const cl = UTIL_inViewportClamp(top, left, pr.width, pr.height);
    panel.style.top = `${cl.top}px`;
    panel.style.left = `${cl.left}px`;
  }

  function UI_positionPanelNearTinyBtn(anchorEl) {
    const panel = STATE.ui.panel;
    if (!panel || !anchorEl) return;
    if (panel.style.display !== 'block') return;
    if (STATE.ui.panelAnchor !== 'tiny') return;

    const br = anchorEl.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    if (!pr || pr.width < 10 || pr.height < 10) {
      W.requestAnimationFrame(() => {
        try { UI_positionPanelNearTinyBtn(anchorEl); } catch {}
      });
      return;
    }
    const gap = CFG_.PANEL_GAP_TINY;

    let top = br.top;
    let left = br.right + gap;

    const cl = UTIL_inViewportClamp(top, left, pr.width, pr.height);
    panel.style.top = `${cl.top}px`;
    panel.style.left = `${cl.left}px`;
  }

  /* ───────────────────────────── 🟨 TIME — SCHEDULING / REACTIVITY 📝🔓💥 ───────────────────────────── */

  const SCH_ = Object.freeze({
    SCAN: 1,
  });

  function OBS_SB_scheduleScan(reason) {
    try {
      if (STATE.clean.schScan) return;
      STATE.clean.schScan = W.setTimeout(() => {
        STATE.clean.schScan = 0;
        CORE_SB_processAllAnswers();
      }, CFG_.SCAN_DEBOUNCE_MS);
      DIAG_pushStep('scan_scheduled', { reason: reason || '' });
    } catch (e) {
      DIAG_pushErr('schedule_scan_failed', e);
    }
  }

  /* ───────────────────────────── 🟥 ENGINE — SECTION GROUPING / APPLY 📝🔓💥 ───────────────────────────── */

  function CORE_SB_processAllAnswers() {
    try {
      const answers = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"]`);
      for (const ans of answers) {
        if (!UTIL_isEl(ans)) continue;
        if (ans.getAttribute(ATTR_.ANSWER_PROCESSED) === '1') continue;
        CORE_SB_processAnswer(ans);
      }
    } catch (e) {
      DIAG_pushErr('process_all_failed', e);
    }
  }

  function CORE_SB_processAnswer(answerEl) {
    try {
      // mark processed early to avoid repeat loops
      answerEl.setAttribute(ATTR_.ANSWER_PROCESSED, '1');

      const content = answerEl.querySelector('.markdown');
      if (!content) return;

      // avoid double wrap if bands exist
      if (content.querySelector(UTIL_selScoped(UI_.BAND))) return;

      DOM_applySectionBands(content);

      // restore state after build
      IO_restoreBandsState(answerEl);
      IO_syncAnswerInventory(answerEl, 'process');
    } catch (e) {
      DIAG_pushErr('process_answer_failed', e);
    }
  }

  function DOM_applySectionBands(container) {
    const blocks = Array.from(container.children).filter(el => {
      if (!UTIL_isEl(el)) return false;
      // preserve ecosystem under-ui
      if (el.classList && el.classList.contains('ho-under-ui')) return false;
      return true;
    });

    if (!blocks.length) return;

    const sections = [];
    let cur = [];

    const push = () => { if (cur.length) { sections.push(cur); cur = []; } };

    blocks.forEach(el => {
      if (el.tagName === 'HR') { push(); return; }
      cur.push(el);
    });
    push();

    sections.forEach((sectionBlocks, idx) => {
      if (!sectionBlocks.length) return;

      const band = UTIL_mkOwned('div', UI_.BAND, 'band');
      band.dataset.secIndex = String(idx);
      band.dataset.secLevelFill = '1';
      band.dataset.secLevelRing = '3';
      band.dataset.secPattern   = 'none';
      band.dataset.secCollapsed = '0';
      band.dataset.secSource    = 'none';

      const first = sectionBlocks[0];
      container.insertBefore(band, first);
      sectionBlocks.forEach(node => band.appendChild(node));

      // auto mode init
      if (STATE.cfg.autoMode) {
        const key = PALETTE_getLoopKeyAt(idx);
        if (!key) return;
        band.dataset.secSource = 'auto';
        DOM_applyBandColor(band, key, 'fill');
      } else {
        DOM_updateBandVisual(band);
      }
    });
  }

  /* ───────────────────────────── 🟧 BOUNDARIES — HOST UI INTEGRATION (Top / Rail / Tiny Rail) 📝🔓💥 ───────────────────────────── */
  function HOST_findRailAvatarButtonFallback() {
    // legacy rail injection fallback (best-effort)
    const btns = UTIL_qsa('button');
    const candidates = [];

    for (const b of btns) {
      const img = b.querySelector('img');
      if (!img) continue;
      const r = b.getBoundingClientRect();
      if (r.width <= 64 && r.height <= 64 && r.left >= 0 && r.left < 120) candidates.push(b);
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
    return candidates[0] || null;
  }

  function HOST_insertRailButtonFallback() {
    if (!STATE.cfg.manualEnabled) return;
    // only if you still want the classic rail button (kept to preserve original feature)
    if (STATE.ui.railBtn && D.contains(STATE.ui.railBtn)) return;

    const avatarBtn = HOST_findRailAvatarButtonFallback();
    if (!avatarBtn || !avatarBtn.parentElement) return;

    const btn = UTIL_mkOwned('button', UI_.RAILBTN, 'railbtn');
    btn.type = 'button';
    btn.textContent = '🍰';

    STATE.ui.railBtn = btn;
    UI_updateRailButton();

    btn.addEventListener('click', () => {
      STATE.ui.panelAnchor = 'rail';
      UI_ensureControlPanel();
      const panel = STATE.ui.panel;

      const open = (panel.style.display !== 'block');
      panel.style.display = open ? 'block' : 'none';
      if (open) {
        UI_updatePanelSwitch();
        UI_positionPanelNearRailBtn();
      }
    });

    avatarBtn.parentElement.insertBefore(btn, avatarBtn);
  }

  /* ───────────────────────────── 🟨 TIME — GLOBAL INPUT HANDLERS 📝🔓💥 ───────────────────────────── */

  function TIME_onDocumentMouseDown(e) {
    if (!STATE.cfg.manualEnabled) return;
    try {
      if (!UTIL_isEl(e.target)) return;
      if (TIME_handlePopupMouseDown(e)) return;
      STATE.ui.hoverBand = UTIL_getOwnedBandFromNode(e.target);

      // Hide palette when clicking outside
      if (UI_isPaletteVisible()) {
        const paletteEl = STATE.ui.palette;
        if (paletteEl && !paletteEl.contains(e.target)) UI_hidePalette();
      }
    } catch (err) {
      DIAG_pushErr('doc_mousedown_failed', err);
    }
  }

  function TIME_onResizeScroll() {
    try {
    UI_positionPanelNearRailBtn();
    // keep the middle-click palette fully in-view on resize/scroll
    if (UI_isPaletteVisible() && STATE.ui.currentBand) UI_positionPaletteNearBand(STATE.ui.currentBand);
    } catch (e) {
      DIAG_pushErr('resize_scroll_failed', e);
    }
  }

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING / STARTUP 📝🔓💥 ───────────────────────────── */

  function CORE_SB_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    try {
      // registries (optional exposure, no overrides)
      UTIL_extendRegistry(H2O.KEYS, {
        [`${CID_UP}_CFG_AUTO_MODE_V1`]:     KEY_.CFG_AUTO_MODE_V1,
        [`${CID_UP}_CFG_MANUAL_ENABLED_V1`]: KEY_.CFG_MANUAL_ENABLED_V1,
        [`${CID_UP}_STATE_BANDS_V1`]:       KEY_.STATE_BANDS_V1,
      }, 'H2O.KEYS');

      UTIL_extendRegistry(H2O.UI, {
        [`${CID_UP}_PALETTE`]: UI_.PALETTE,
        [`${CID_UP}_PANEL`]:   UI_.PANEL,
        [`${CID_UP}_BAND`]:    UI_.BAND,
      }, 'H2O.UI');

      UI_ensureStyle();

      // migrate legacy keys inside lifecycle (not top-level)
      IO_migrateLegacyOnce();

      // load auto mode
      STATE.cfg.autoMode = (UTIL_storage.getStr(KEY_.CFG_AUTO_MODE_V1, '0') === '1');
      STATE.cfg.manualEnabled = (UTIL_storage.getStr(KEY_.CFG_MANUAL_ENABLED_V1, '1') === '1');
      STATE.cfg.bindings = BINDINGS_load();
      STATE.cfg.palette = PALETTE_load();

      CORE_SB_setManualEnabled(STATE.cfg.manualEnabled);

      SURFACE_registerControlHubFeature();

      // initial scan
      CORE_SB_processAllAnswers();

      // observe new answers (SPA)
      STATE.clean.moAnswers = new MutationObserver((muts) => {
        for (const m of muts) {
          if (m.addedNodes && m.addedNodes.length) { OBS_SB_scheduleScan('mo_answers'); break; }
        }
      });
      STATE.clean.moAnswers.observe(D.body, { childList: true, subtree: true });

      // global events
      STATE.clean.onDocMouseDown = (e) => TIME_onDocumentMouseDown(e);
      D.addEventListener('mousedown', STATE.clean.onDocMouseDown, true);
      STATE.clean.onDocContextMenu = (e) => TIME_onDocumentContextMenu(e);
      D.addEventListener('contextmenu', STATE.clean.onDocContextMenu, true);
      STATE.clean.onDocPointerMove = (e) => TIME_trackHoveredBand(e);
      D.addEventListener('pointermove', STATE.clean.onDocPointerMove, true);
      STATE.clean.onDocKeyDown = (e) => TIME_onDocumentKeyDown(e);
      D.addEventListener('keydown', STATE.clean.onDocKeyDown, true);

      STATE.clean.onResize = () => TIME_onResizeScroll();
      STATE.clean.onScroll = () => TIME_onResizeScroll();
      W.addEventListener('resize', STATE.clean.onResize);
      W.addEventListener('scroll', STATE.clean.onScroll, true);

      // sync UI state now
      UI_updatePanelSwitch();
      UI_updateRailButton();
      UI_updateTinyRailButtonTitle();

      // auto-mode behavior should apply after bands exist
      if (STATE.cfg.autoMode) CORE_SB_autoColorUncoloredBands();

      DIAG_pushStep('boot_ok', { pid: PID, skid: SkID });
    } catch (e) {
      DIAG_pushErr('boot_failed', e);
    }
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_SB_dispose() {
    try {
      if (!STATE.booted) return;
      STATE.booted = false;

      // stop timers
      if (STATE.clean.schScan) {
        W.clearTimeout(STATE.clean.schScan);
        STATE.clean.schScan = 0;
      }

      // disconnect observers
      try { STATE.clean.moAnswers?.disconnect(); } catch {}
      STATE.clean.moAnswers = null;

      // remove listeners
      if (STATE.clean.onDocMouseDown) {
        D.removeEventListener('mousedown', STATE.clean.onDocMouseDown, true);
        STATE.clean.onDocMouseDown = null;
      }
      if (STATE.clean.onDocContextMenu) {
        D.removeEventListener('contextmenu', STATE.clean.onDocContextMenu, true);
        STATE.clean.onDocContextMenu = null;
      }
      if (STATE.clean.onDocPointerMove) {
        D.removeEventListener('pointermove', STATE.clean.onDocPointerMove, true);
        STATE.clean.onDocPointerMove = null;
      }
      if (STATE.clean.onDocKeyDown) {
        D.removeEventListener('keydown', STATE.clean.onDocKeyDown, true);
        STATE.clean.onDocKeyDown = null;
      }
      if (STATE.clean.onResize) {
        W.removeEventListener('resize', STATE.clean.onResize);
        STATE.clean.onResize = null;
      }
      if (STATE.clean.onScroll) {
        W.removeEventListener('scroll', STATE.clean.onScroll, true);
        STATE.clean.onScroll = null;
      }

      // unwrap bands we created (full cleanup)
      const bands = UTIL_qsa(UTIL_selScoped(UI_.BAND));
      for (const band of bands) {
        try {
          const parent = band.parentNode;
          if (!parent) continue;

          // replace band with its children (preserve order)
          const frag = D.createDocumentFragment();
          while (band.firstChild) frag.appendChild(band.firstChild);
          parent.insertBefore(frag, band);
          parent.removeChild(band);
        } catch {}
      }

      // remove processed marker on answers (optional cleanup)
      const answers = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"][${ATTR_.ANSWER_PROCESSED}="1"]`);
      for (const a of answers) {
        try { a.removeAttribute(ATTR_.ANSWER_PROCESSED); } catch {}
      }

      // remove UI nodes
      try { UI_cleanupManualUi(); } catch {}

      // remove tiny-rail button wrapper if present (best-effort)
      try {
        const rail = D.getElementById(CFG_.RAIL_ID);
        const tiny = rail ? rail.querySelector(`[${ATTR_.CGXUI}="${UI_.TINYBTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`) : null;
        const wrap = tiny ? tiny.closest('div[data-state]') : null;
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      } catch {}

      // remove style
      try {
        const style = D.getElementById(CSS_.STYLE_ID);
        if (style && style.parentNode) style.parentNode.removeChild(style);
      } catch {}

      // clear refs
      STATE.ui.panel = null;
      STATE.ui.railBtn = null;
      STATE.ui.palette = null;
      STATE.ui.currentBand = null;
      STATE.ui.slider = null;
      STATE.ui.hoverBand = null;
      STATE.ui.popupMouseLastAt = 0;
      STATE.ui.popupMouseLastBand = null;
      STATE.ui.popupMouseLastButton = -1;
      STATE.ui.popupMouseLastPoint = { x: 0, y: 0 };

      DIAG_pushStep('dispose_ok', {});
    } catch (e) {
      DIAG_pushErr('dispose_failed', e);
    }
  }

  /* ───────────────────────────── 🧯 BOOT (no other top-level side-effects) ───────────────────────────── */

  // expose lifecycle (internal)
  MOD_OBJ.api = MOD_OBJ.api || {};
  const autoModeApi = MOD_OBJ.api.autoMode || {
    isAutoModeOn: () => STATE.cfg.autoMode,
    setAutoMode: (on) => CORE_SB_setAutoMode(!!on),
    toggleAutoMode: () => CORE_SB_setAutoMode(!STATE.cfg.autoMode),
  };
  const bindingsApi = {
    getBinding: (key) => BINDINGS_get(key),
    setBinding: (key, value) => BINDINGS_set(key, value),
    getAll: () => BINDINGS_all(),
    schema: () => Object.assign({}, CFG_BINDING_SCHEMA),
  };
  const paletteApi = {
    isVisible: () => UI_isPaletteVisible(),
    hide: () => UI_hidePalette(),
    showForBand: (band) => {
      if (!band || !STATE.cfg.manualEnabled) return false;
      UI_showPaletteForBand(band);
      return true;
    },
    toggleForBand: (band) => UI_togglePaletteForBand(band),
    toggleFromMarginGutter: (detail) => CORE_SB_togglePaletteFromMarginGutter(detail || {}),
  };
  const paletteConfigApi = {
    getConfig: () => PALETTE_exportState(),
    setConfig: (next) => PALETTE_setConfig(next || {}),
    resetConfig: () => PALETTE_resetConfig(),
    getDefaultKey: () => PALETTE_getState().defaultKey,
    setDefaultKey: (key) => PALETTE_setConfig({ defaultKey: key }),
    getApplyStartMode: () => PALETTE_getState().applyStartMode,
    setApplyStartMode: (mode) => PALETTE_setConfig({ applyStartMode: mode }),
    getPaletteDefs: () => PALETTE_getDefs().map(({ key, label, hex }) => ({ key, label, hex })),
  };
  const inventoryApi = {
    listForChat: (chatId) => listBandRecords(chatId || getChatId()),
  };
  MOD_OBJ.api.autoMode = MOD_OBJ.api.autoMode || autoModeApi;
  MOD_OBJ.api.bindings = Object.assign(MOD_OBJ.api.bindings || {}, bindingsApi);
  MOD_OBJ.api.palette = Object.assign(MOD_OBJ.api.palette || {}, paletteApi);
  MOD_OBJ.api.paletteConfig = Object.assign(MOD_OBJ.api.paletteConfig || {}, paletteConfigApi);
  MOD_OBJ.api.inventory = Object.assign(MOD_OBJ.api.inventory || {}, inventoryApi);
  MOD_OBJ.api.listForChat = MOD_OBJ.api.listForChat || inventoryApi.listForChat;
  Object.assign(MOD_OBJ.api, autoModeApi);
  MOD_OBJ.boot = CORE_SB_boot;
  MOD_OBJ.dispose = CORE_SB_dispose;

  // start
  CORE_SB_boot();

})();
