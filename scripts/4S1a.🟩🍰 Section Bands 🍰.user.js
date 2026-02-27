// ==UserScript==
// @h2o-id      4h.section.bands
// @name         4H.🟩🍰 Section Bands 🍰
// @namespace    H2O.ChatGPT.Bands
// @version      1.1.4
// @description  Section bands with fill, ring, pattern textures, and dual-behavior slider (Contract v2.0 Stage-1 aligned).
// @author       HumamDev
// @match        https://chatgpt.com/*
// @grant        none
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

    // host marker on non-owned answers (namespaced)
    ANSWER_PROCESSED: `data-${SkID}-processed`,
  });

  const NS_ = Object.freeze({
    DISK: `h2o:${SUITE}:${HOST}:${DsID}`,
  });

  const KEY_ = Object.freeze({
    CFG_AUTO_MODE_V1:    `${NS_.DISK}:cfg:auto_mode:v1`,
    CFG_MANUAL_ENABLED_V1: `${NS_.DISK}:cfg:manual_enabled:v1`,
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

    SCAN_DEBOUNCE_MS: 80,
  });

  const EV_SBANDS_AUTO_MODE = 'h2o:section-bands:auto-mode';
  const FEATURE_KEY_SECTION_BANDS = 'sectionBands';

  // Palette / levels
  const CFG_PALETTE = Object.freeze([
    { key: 'olive',  rgb: '120,134,107' },
    { key: 'gold',   rgb: '235,200,110' },
    { key: 'red',    rgb: '205, 90, 90' },
    { key: 'blue',   rgb: ' 92,145,200' },
    { key: 'purple', rgb: '146,115,200' },
  ]);

  const CFG_INITIAL_KEYS = Object.freeze(['olive', 'gold', 'red', 'blue']);

  // Fill alpha levels (1..5)
  const CFG_FILL_ALPHAS = Object.freeze([0.10, 0.20, 0.30, 0.40, 0.50]);

  // Ring widths (1..5) px, 3 = default
  const CFG_RING_WIDTHS = Object.freeze([0.5, 1, 2, 3, 4]);

  // Patterns
  const CFG_PATTERN_KEYS = Object.freeze(['stripe', 'dots', 'lines', 'cross', 'grid']);

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

  function UTIL_getAnswerId(answerEl) {
    if (!UTIL_isEl(answerEl)) return null;

    const real = answerEl.getAttribute(ATTR_.MSG_ID) || answerEl.id;
    if (real) return real;

    const all = UTIL_qsa(`[${ATTR_.MSG_ROLE}="assistant"]`);
    const idx = all.indexOf(answerEl);
    return `idx-${idx >= 0 ? idx : 0}`;
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

    panelAnchor: 'top', // 'top' | 'rail' | 'tiny'
  };

  // observers/timers/listeners cleanup
  STATE.clean = STATE.clean || {
    moAnswers: null,
    schScan: 0,

    onResize: null,
    onScroll: null,
    onDocMouseDown: null,
    onPaletteMouseDown: null,
  };

  // config state
  STATE.cfg = STATE.cfg || {
    autoMode: false,
    manualEnabled: true,
    migDone: false,
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
  padding: 6px 0;
  text-align:center;
  font-size: 9px;
  font-weight: 500;
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
          const key = CFG_INITIAL_KEYS[idx % CFG_INITIAL_KEYS.length];
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
    return CFG_PALETTE.find(p => p.key === key) || null;
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
    for (const { key, rgb } of CFG_PALETTE) {
      const btn = UTIL_mkOwned('button', UI_.PALETTE_BTN, 'ring');
      btn.type = 'button';
      btn.dataset.colorKey = key;
      btn.dataset.mode = 'ring';
      btn.style.borderColor = `rgba(${rgb}, 0.8)`;
      colRing.appendChild(btn);
    }

    // Fill buttons (right)
    for (const { key, rgb } of CFG_PALETTE) {
      const btn = UTIL_mkOwned('button', UI_.PALETTE_BTN, 'fill');
      btn.type = 'button';
      btn.dataset.colorKey = key;
      btn.dataset.mode = 'fill';
      btn.style.background = `rgba(${rgb}, 0.25)`;
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

    // Collapse/Expand row
    const row = D.createElement('div');
    row.setAttribute(ATTR_.CGXUI_PART, 'collapserow');

    const mkAct = (txt) => {
      const b = UTIL_mkOwned('button', UI_.ACT_BTN, 'act');
      b.type = 'button';
      b.textContent = txt;
      b.setAttribute(ATTR_.CGXUI_PART, 'act');
      return b;
    };

    const collapseBtn = mkAct('Collapse');
    const expandBtn = mkAct('Expand');

    row.appendChild(collapseBtn);
    row.appendChild(expandBtn);
    paletteEl.appendChild(row);

    const isCollapsed = band ? DOM_isBandCollapsed(band) : false;
    if (isCollapsed) collapseBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');
    else expandBtn.setAttribute(ATTR_.CGXUI_STATE, 'disabled');

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
        const key = CFG_INITIAL_KEYS[idx % CFG_INITIAL_KEYS.length];
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

      // Find band (owned)
      const band = e.target.closest(UTIL_selScoped(UI_.BAND));

      // Middle click toggles palette on band
      if (e.button === 1 && band) {
        e.preventDefault();
        e.stopPropagation();

        if (UI_isPaletteVisible() && STATE.ui.currentBand === band) UI_hidePalette();
        else UI_showPaletteForBand(band);

        return;
      }

      // Hide palette when clicking outside
      if (UI_isPaletteVisible()) {
        const paletteEl = STATE.ui.palette;
        if (paletteEl && !paletteEl.contains(e.target)) {
          if (!(e.button === 1 && band)) UI_hidePalette();
        }
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
  MOD_OBJ.api.autoMode = MOD_OBJ.api.autoMode || autoModeApi;
  Object.assign(MOD_OBJ.api, autoModeApi);
  MOD_OBJ.boot = CORE_SB_boot;
  MOD_OBJ.dispose = CORE_SB_dispose;

  // start
  CORE_SB_boot();

})();
