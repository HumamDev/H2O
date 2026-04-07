// ==UserScript==
// @h2o-id             1a5a.title.labels.minimap.plugin
// @name               1A5a.🔴🏷️🗺️ Title Labels (MiniMap 🔌 Plugin) 🗺️
// @namespace          H2O.Premium.CGX.title.labels.minimap.plugin
// @author             HumamDev
// @version            1.6.0
// @revision           001
// @build              260403-000000
// @description        MiniMap Titles plugin: sticky title label panels + tooltip sync via evt:h2o:title:set. Source of truth = shared titles store (Answer Title writer). Handles answer collapse/expand events.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ 0) Identity (Contract v2.0) DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const D = document;

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const TOK   = 'TL';        // Title Labels
  const PID   = 'ttlbls';    // consonant-only
  const CID   = 'TLabels';   // identifiers only
  const BrID  = PID;
  const DsID  = PID;

  // IMPORTANT: this plugin deliberately uses MiniMap skin id for UI hooks,
  // so existing MiniMap CSS applies.
  const SkID  = 'mnmp';

  const MODTAG    = 'TLabels';
  const MODICON   = '🏷️';
  const EMOJI_HDR = false;

  const CID_UP = CID.toUpperCase();

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || Object.create(null);
  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || { diag: Object.create(null), state: Object.create(null), api: Object.create(null) });

  VAULT.state.meta = VAULT.state.meta || { TOK, PID, CID: CID_UP, SkID, BrID, DsID, MODTAG, MODICON, SUITE, HOST };

  /* ───────────────────────────── 🧾 1) Registries (Mode B: keep-first) ───────────────────────────── */

  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  const UTIL_extendRegistry = (regObj, entries) => {
    try {
      for (const [k, v] of Object.entries(entries || {})) {
        if (regObj[k] == null) regObj[k] = v;
      }
    } catch {}
  };

  /* ───────────────────────────── ⬛️ 2) DEFINE — CONSTANTS / TOKENS ───────────────────────────── */

  const ATTR_ = Object.freeze({
    CGXUI: 'data-cgxui',
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI_STATE: 'data-cgxui-state',
    // ALIGNED with 1E1a: MiniMap buttons carry data-id (turnId) and data-primary-a-id (answerId)
    ID: 'data-id',
    PRIMARY_A_ID: 'data-primary-a-id',
    TITLE: 'title',
  });

  const UI_ = Object.freeze({
    BTN: `${SkID}-btn`,
    STICKY_TITLE: `${SkID}-sticky-title`,
    MINIMAP: `${SkID}-minimap`,
  });

  const PILL_UI_ = Object.freeze({
    PANEL: 'mm-title-panel',
    DOT: 'mm-title-dot',
    INPUT: 'mm-title-input',
  });

  const CLS_ = Object.freeze({
    STICKY_TITLE: `cgxui-${SkID}-sticky-title`,
  });

  // ─── ALIGNED selectors ───────────────────────────────────────────────────
  // These selectors must exactly match what the MiniMap module emits.
  // The canonical button attributes are:
  //   data-cgxui="mnmp-btn"  data-cgxui-owner="mnmp"
  //   data-id="{turnId}"  data-primary-a-id="{answerId}"
  const SEL_ = Object.freeze({
    MM_CONTAINER: `[${ATTR_.CGXUI}="${UI_.MINIMAP}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    MM_BTN:       `[${ATTR_.CGXUI}="${UI_.BTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`,
    // Lookup by answerId (via primary-a-id first, then data-id as fallback)
    MM_BTN_BY_PRIMARY_A_ID: (id) => `[${ATTR_.CGXUI}="${UI_.BTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.PRIMARY_A_ID}="${CSS.escape(String(id))}"]`,
    MM_BTN_BY_ID:           (id) => `[${ATTR_.CGXUI}="${UI_.BTN}"][${ATTR_.CGXUI_OWNER}="${SkID}"][${ATTR_.ID}="${CSS.escape(String(id))}"]`,
  });

  const EV_ = Object.freeze({
    TITLE_SET:       'evt:h2o:title:set',
    TITLE_SET_LEG:   'ho:title:set',
    ANSWER_COLLAPSE: 'evt:h2o:answer:collapse', // NEW: emitted by 1E1a on collapse/expand
  });

  const KEY_ = Object.freeze({
    MNMP_STATE_TITLES_V1:       `h2o:${SUITE}:${HOST}:mnmp:state:titles:v1`,
    MNMP_STATE_TITLE_PANELS_V1: `h2o:${SUITE}:${HOST}:mnmp:state:titlePanels:v1`,
  });

  UTIL_extendRegistry(H2O.KEYS, {
    MNMP_STATE_TITLES_V1: KEY_.MNMP_STATE_TITLES_V1,
    MNMP_STATE_TITLE_PANELS_V1: KEY_.MNMP_STATE_TITLE_PANELS_V1,
  });
  UTIL_extendRegistry(H2O.EV, { TITLE_SET: EV_.TITLE_SET });

  /* ───────────────────────────── 🟩 3) UTIL — STORAGE / EVENTS / TIMERS ───────────────────────────── */

  const UTIL_storage = {
    getStr(key, fallback = null) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    setStr(key, val) { try { localStorage.setItem(key, String(val)); } catch {} },
    getJSON(key, fallback = null) {
      const s = this.getStr(key, null);
      if (s == null) return fallback;
      try { return JSON.parse(s); } catch { return fallback; }
    },
    setJSON(key, val) {
      try { this.setStr(key, JSON.stringify(val)); } catch {}
    },
  };

  const UTIL_dispatch = (topic, detail) => {
    try { W.dispatchEvent(new CustomEvent(topic, { detail })); } catch {}
  };

  const UTIL_on = (t, evt, fn, opts) => {
    try { t.addEventListener(evt, fn, opts); return () => t.removeEventListener(evt, fn, opts); } catch { return () => {}; }
  };

  const UTIL_debounce = (fn, ms) => {
    let to = null;
    return (...args) => {
      if (to) clearTimeout(to);
      to = setTimeout(() => { to = null; fn(...args); }, ms);
    };
  };

  /* ───────────────────────────── 🟥 4) STATE — TITLES CACHE + UI MAPS ───────────────────────────── */

  const STATE = (VAULT.state.core = VAULT.state.core || {});
  STATE.titles = STATE.titles || Object.create(null);

  // Shared Map for title panels (compat alias kept)
  const stickyTitlePanels = (() => {
    const topW = (W && W.top) ? W.top : W;

    if (topW.H2O_MM_stickyTitlePanels instanceof Map) {
      topW.stickyTitlePanels = topW.H2O_MM_stickyTitlePanels;
      return topW.H2O_MM_stickyTitlePanels;
    }

    const m = new Map();
    topW.H2O_MM_stickyTitlePanels = m;
    topW.stickyTitlePanels = m;
    return m;
  })();

  const PANEL_MEMORY = (VAULT.state.panelMemory = VAULT.state.panelMemory || {
    singleIds: [],
    visibleIds: [],
  });

  const normalizeId = (v) => String(v || '').trim();
  const normalizeIdArray = (raw) => Array.from(new Set((Array.isArray(raw) ? raw : []).map(normalizeId).filter(Boolean)));

  function keyPanelMemory() {
    return H2O.KEYS?.MNMP_STATE_TITLE_PANELS_V1 || KEY_.MNMP_STATE_TITLE_PANELS_V1;
  }

  function loadPanelMemoryFromDisk() {
    const payload = UTIL_storage.getJSON(keyPanelMemory(), null);
    PANEL_MEMORY.singleIds = normalizeIdArray(payload?.singleIds);
    PANEL_MEMORY.visibleIds = normalizeIdArray(payload?.visibleIds);
  }

  function savePanelMemoryToDisk() {
    UTIL_storage.setJSON(keyPanelMemory(), {
      singleIds: normalizeIdArray(PANEL_MEMORY.singleIds),
      visibleIds: normalizeIdArray(PANEL_MEMORY.visibleIds),
    });
  }

  function loadTitlesFromDisk() {
    const key = H2O.KEYS?.MNMP_STATE_TITLES_V1 || KEY_.MNMP_STATE_TITLES_V1;
    const obj = UTIL_storage.getJSON(key, null);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      STATE.titles = obj;
    } else {
      STATE.titles = Object.create(null);
    }

    // Legacy-friendly aliases (READ-ONLY, to avoid split-brain)
    try { W.H2O_MM_titleOverrides = STATE.titles; } catch {}
    try { W.titleOverrides = STATE.titles; } catch {}
  }

  loadTitlesFromDisk();
  loadPanelMemoryFromDisk();

  /* ───────────────────────────── 🟡 5) TITLE API — READ / WRITE (EVENT-DRIVEN) ───────────────────────────── */

  function getCurrentTitleForId(id) {
    const key = normalizeId(id);
    if (!key) return '';

    // 1) Direct override (answerId or turnId)
    const direct = STATE.titles[key];
    if (direct) return normalizeId(direct);

    // 2) TURN id → prefer its primary answer override (if any)
    const btn = D.querySelector(SEL_.MM_BTN_BY_ID(key)) || D.querySelector(SEL_.MM_BTN_BY_PRIMARY_A_ID(key));
    const primaryAId = normalizeId(btn?.dataset?.primaryAId);
    if (primaryAId && STATE.titles[primaryAId]) return normalizeId(STATE.titles[primaryAId]);

    // 3) answerId → if we can map to turnId, try that
    try {
      const tId = normalizeId(W.H2O_MM_turnIdByAId?.get?.(key));
      if (tId && STATE.titles[tId]) return normalizeId(STATE.titles[tId]);
    } catch {}

    // 4) fallback to tooltip/title attr
    return normalizeId(btn?.getAttribute?.(ATTR_.TITLE));
  }

  function setTitleOnMiniMap(answerOrTurnId, title) {
    const id = normalizeId(answerOrTurnId);
    if (!id) return;

    // ALIGNED: look up by primary-a-id first, then by data-id
    const btn = D.querySelector(SEL_.MM_BTN_BY_PRIMARY_A_ID(id)) || D.querySelector(SEL_.MM_BTN_BY_ID(id));
    if (btn) btn.setAttribute(ATTR_.TITLE, normalizeId(title));
  }

  // No-op: Answer Title module owns the visible above-answer header
  function setTitleOnAnswer(_msgEl, _title) {}

  // The only "write" path: emit the canonical event.
  // The Answer Title module persists to disk.
  function setAnswerTitleFromMiniMap(answerId, title) {
    const clean = normalizeId(title);
    UTIL_dispatch(EV_.TITLE_SET, { answerId: normalizeId(answerId), title: clean });
  }

  /* ───────────────────────────── 🧲 6) STICKY MINI TITLE PANELS (EDITABLE) ───────────────────────────── */

  const CSS_ID = 'cgxui-title-pill-css-v1';

  function mountPillCSSOnce() {
    let style = D.getElementById(CSS_ID);
    if (!style) {
      style = D.createElement('style');
      style.id = CSS_ID;
      D.head.appendChild(style);
    }
    style.textContent = `
/* ───────────────────────────── Title Labels Pill ───────────────────────────── */
.cgxui-title-pill{
  position: fixed;
  z-index: 99997;
  width: 140px;
  height: var(--cgxui-mnmp-btn-height, 20px);
  padding: 2px 10px;
  border-top-left-radius: 999px;
  border-bottom-left-radius: 999px;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  box-sizing: border-box;

  display: flex;
  align-items: center;
  gap: 6px;

  font-size: 11px;
  line-height: 1.3;

  background: rgba(255,255,255,0.01);
  color: #e5e7eb;
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: 0 2px 6px rgba(0,0,0,0.22);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);

  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  pointer-events: auto;

  /* NEW: smooth transition when answer is collapsed/expanded */
  transition: opacity 0.18s ease;
}

/* Dimmed when the linked answer is collapsed */
.cgxui-title-pill[data-answer-collapsed="1"]{
  opacity: 0.38;
  pointer-events: none;
}

/* Left edit dot (click nub) */
.cgxui-title-pill-dot{
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);

  width: 5px;
  height: 5px;
  border-radius: 999px;

  background: rgba(148,163,184,0.45);
  box-shadow: 0 0 2px rgba(0,0,0,0.4);

  opacity: 0.8;
  cursor: pointer;

  display: block;
}

/* Input text */
.cgxui-title-pill-input{
  flex: 1 1 auto;
  min-width: 0;

  border: none;
  outline: none;
  background: transparent;

  color: #f9fafb;
  font-size: 11px;

  padding: 0 4px 0 10px; /* room for dot */
}
`;
  }

  function getPanelInput(panel) {
    if (!panel) return null;
    return (
      panel.querySelector(`input[${ATTR_.CGXUI}="${PILL_UI_.INPUT}"]`) ||
      panel.querySelector('.cgxui-title-pill-input') ||
      panel.querySelector('input')
    );
  }

  function ensureStickyTitlePanel(answerId, btn) {
    const answerKey = normalizeId(answerId);
    if (!answerKey) return null;

    let panel = stickyTitlePanels.get(answerKey);

    if (!panel || !panel.isConnected) {
      mountPillCSSOnce();

      panel = D.createElement('div');
      panel.className = 'cgxui-title-pill';
      panel.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      panel.setAttribute(ATTR_.CGXUI, PILL_UI_.PANEL);
      // NEW: store the answerId on the panel for collapse sync
      panel.dataset.forAnswerId = answerKey;

      const dot = D.createElement('div');
      dot.className = 'cgxui-title-pill-dot';
      dot.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      dot.setAttribute(ATTR_.CGXUI, PILL_UI_.DOT);

      const input = D.createElement('input');
      input.className = 'cgxui-title-pill-input';
      input.setAttribute(ATTR_.CGXUI_OWNER, SkID);
      input.setAttribute(ATTR_.CGXUI, PILL_UI_.INPUT);
      input.type = 'text';
      input.readOnly = true;

      panel.appendChild(dot);
      panel.appendChild(input);

      D.body.appendChild(panel);
      stickyTitlePanels.set(answerKey, panel);

      // Prevent MiniMap click handlers from stealing focus
      panel.addEventListener('mousedown', (e) => { try { e.stopPropagation(); } catch {} });
      panel.addEventListener('click', (e) => { try { e.stopPropagation(); } catch {} });

      let lastCommitted = '';

      const commit = () => {
        const val = normalizeId(input.value);
        lastCommitted = val;
        setAnswerTitleFromMiniMap(answerKey, val); // dispatch evt:h2o:title:set
        input.readOnly = true;
      };

      const cancel = () => {
        input.value = lastCommitted;
        input.readOnly = true;
      };

      // ✍️ Editable on dot click
      dot.addEventListener('click', (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        lastCommitted = normalizeId(input.value);
        input.readOnly = false;
        try { input.focus(); input.select(); } catch {}
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
          panel.style.display = 'none';
          markPanelsChanged();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
          panel.style.display = 'none';
          markPanelsChanged();
        }
      });

      input.addEventListener('blur', () => {
        if (!input.readOnly) commit();
      });
    }

    const input = getPanelInput(panel);
    if (input) input.value = getCurrentTitleForId(answerKey) || '';

    setPanelShownForButton(panel, btn, true);

    return panel;
  }

  function positionStickyPanelForButton(panel, btn) {
    if (!panel || !btn) return;

    // Match MiniMap row button height exactly
    const r = btn.getBoundingClientRect();
    const h = Math.max(1, Math.round(r.height || 0));
    if (h > 0) panel.style.height = `${h}px`;

    // Match right edge radius to MiniMap row buttons
    const btnStyle = W.getComputedStyle ? W.getComputedStyle(btn) : null;
    const readRadiusPx = (raw) => {
      const n = parseFloat(String(raw || '').trim());
      return Number.isFinite(n) ? n : NaN;
    };
    const rightFilletPx = Math.max(
      6,
      Math.round(
        readRadiusPx(btnStyle?.borderTopRightRadius) ||
        readRadiusPx(btnStyle?.borderBottomRightRadius) ||
        readRadiusPx(btnStyle?.getPropertyValue?.('--mm-btn-r')) ||
        readRadiusPx(btnStyle?.borderRadius) ||
        6
      )
    );
    const leftFilletPx = Math.max(6, Math.round(h / 2));
    const rightFillet = `${rightFilletPx}px`;
    const leftFillet  = `${leftFilletPx}px`;

    panel.style.setProperty('border-radius', `${leftFillet} ${rightFillet} ${rightFillet} ${leftFillet}`, 'important');
    panel.style.setProperty('border-top-left-radius', leftFillet, 'important');
    panel.style.setProperty('border-bottom-left-radius', leftFillet, 'important');
    panel.style.setProperty('border-top-right-radius', rightFillet, 'important');
    panel.style.setProperty('border-bottom-right-radius', rightFillet, 'important');
    panel.style.setProperty('clip-path', `inset(0 round ${leftFillet} ${rightFillet} ${rightFillet} ${leftFillet})`, 'important');
    panel.style.setProperty('overflow', 'hidden', 'important');
    panel.style.setProperty('z-index', '2147483647', 'important');

    const rect = panel.getBoundingClientRect();
    const W_PILL = Math.max(1, Math.round(rect.width || 140));
    const H_PILL = Math.max(1, Math.round(rect.height || h || 20));
    const GAP = 5;
    const X_NUDGE_RIGHT = 2;

    const left = Math.max(6, r.left - W_PILL - GAP + X_NUDGE_RIGHT);
    const top  = Math.max(6, r.top + (r.height - H_PILL) / 2);

    panel.style.left = left + 'px';
    panel.style.top  = top + 'px';
  }

  function isMiniMapCollapsed(root) {
    const state = String(root?.getAttribute?.(ATTR_.CGXUI_STATE) || '').trim();
    return state.split(/\s+/).includes('collapsed');
  }

  function isButtonInMiniMapViewport(btn) {
    if (!btn || !btn.isConnected) return false;

    const root = btn.closest?.(SEL_.MM_CONTAINER) || D.querySelector(SEL_.MM_CONTAINER);
    if (!root || !root.isConnected) return true;
    if (isMiniMapCollapsed(root)) return false;

    const b = btn.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const inY = b.bottom > (r.top + 1) && b.top < (r.bottom - 1);
    const inX = b.right > r.left && b.left < r.right;
    return inX && inY;
  }

  function syncPanelVisibilityForButton(panel, btn) {
    if (!panel) return;
    const inView = isButtonInMiniMapViewport(btn);
    panel.style.visibility = inView ? 'visible' : 'hidden';
    panel.style.pointerEvents = inView ? 'auto' : 'none';
  }

  function setPanelShownForButton(panel, btn, on) {
    if (!panel) return;
    if (!on || !btn) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';
    positionStickyPanelForButton(panel, btn);
    syncPanelVisibilityForButton(panel, btn);
  }

  function getSingleSelectionSet() {
    const raw = Array.isArray(PANEL_MEMORY.singleIds) ? PANEL_MEMORY.singleIds : [];
    const set = new Set();
    for (const id of raw) {
      const key = normalizeId(id);
      if (key) set.add(key);
    }
    return set;
  }

  function saveSingleSelectionSet(set) {
    PANEL_MEMORY.singleIds = Array.from(set).map((id) => normalizeId(id)).filter(Boolean);
    savePanelMemoryToDisk();
  }

  function getVisibleSelectionSet() {
    const raw = Array.isArray(PANEL_MEMORY.visibleIds) ? PANEL_MEMORY.visibleIds : [];
    const set = new Set();
    for (const id of raw) {
      const key = normalizeId(id);
      if (key) set.add(key);
    }
    return set;
  }

  function saveVisibleSelectionSet(set) {
    PANEL_MEMORY.visibleIds = Array.from(set).map((id) => normalizeId(id)).filter(Boolean);
    savePanelMemoryToDisk();
  }

  function snapshotVisibleSelectionSet() {
    cleanupDetachedStickyPanels();
    const set = new Set();
    stickyTitlePanels.forEach((panel, id) => {
      const key = normalizeId(id);
      if (!key || !panel || !panel.isConnected || panel.style.display === 'none') return;
      set.add(key);
    });
    saveVisibleSelectionSet(set);
    return set;
  }

  function syncDialTitlePinVisual() {
    const btn = D.querySelector(`[${ATTR_.CGXUI}="mnmp-dial-pin-titles"][${ATTR_.CGXUI_OWNER}="${SkID}"]`);
    if (!btn) return;
    const stateNow = getStickyTitlePanelsState();
    const hasVisible = stateNow.visible > 0;
    btn.setAttribute('aria-pressed', hasVisible ? 'true' : 'false');
    btn.classList.toggle('is-off', !hasVisible);
    const tip = hasVisible
      ? 'Hide Open Title Labels (double-click: toggle all)'
      : 'Show Open Title Labels (double-click: toggle all)';
    btn.setAttribute('aria-label', tip);
    btn.title = tip;
  }

  function markPanelsChanged() {
    snapshotVisibleSelectionSet();
    syncDialTitlePinVisual();
  }

  function rememberSingleSelectionId(id, on) {
    const key = normalizeId(id);
    if (!key) return;
    const set = getSingleSelectionSet();
    if (on) set.add(key);
    else set.delete(key);
    saveSingleSelectionSet(set);
  }

  function hidePanelsFromIdSet(idSet) {
    cleanupDetachedStickyPanels();
    stickyTitlePanels.forEach((panel, id) => {
      if (!panel || !idSet.has(normalizeId(id))) return;
      panel.style.display = 'none';
    });
    markPanelsChanged();
    return getStickyTitlePanelsState();
  }

  function ensurePanelsForIdSet(idSet) {
    for (const id of idSet) {
      const btn = findMiniMapButtonForAnswerId(id);
      if (!btn) continue;
      ensureStickyTitlePanel(id, btn);
    }
  }

  function hasVisiblePanelFromSet(idSet) {
    for (const id of idSet) {
      const panel = stickyTitlePanels.get(id);
      if (!panel || !panel.isConnected) continue;
      if (panel.style.display !== 'none') return true;
    }
    return false;
  }

  function toggleStickyTitlePanel(btn, answerId) {
    const key = normalizeId(answerId);
    if (!btn || !key) return;

    const panel = stickyTitlePanels.get(key);

    if (panel && panel.style.display !== 'none') {
      panel.style.display = 'none';
      rememberSingleSelectionId(key, false);
      markPanelsChanged();
      return getStickyTitlePanelsState();
    }

    ensureStickyTitlePanel(key, btn);
    rememberSingleSelectionId(key, true);
    markPanelsChanged();
    return getStickyTitlePanelsState();
  }

  function getMiniMapButtons() {
    return Array.from(D.querySelectorAll(SEL_.MM_BTN));
  }

  function getAnswerIdForBtn(btn) {
    // ALIGNED: prefer primary-a-id (explicit answerId), fall back to data-id (turnId)
    const answerId = normalizeId(btn?.dataset?.primaryAId);
    if (answerId) return answerId;
    return normalizeId(btn?.dataset?.id);
  }

  function findMiniMapButtonForAnswerId(answerId) {
    const key = normalizeId(answerId);
    if (!key) return null;
    // ALIGNED: check primary-a-id first, then data-id
    return D.querySelector(SEL_.MM_BTN_BY_PRIMARY_A_ID(key)) || D.querySelector(SEL_.MM_BTN_BY_ID(key));
  }

  function cleanupDetachedStickyPanels() {
    stickyTitlePanels.forEach((panel, id) => {
      if (panel && panel.isConnected) return;
      stickyTitlePanels.delete(id);
    });
  }

  function getStickyTitlePanelsState() {
    cleanupDetachedStickyPanels();
    let total = 0;
    let visible = 0;
    stickyTitlePanels.forEach((panel) => {
      if (!panel) return;
      total += 1;
      if (panel.style.display !== 'none') visible += 1;
    });
    return { total, visible };
  }

  function setExistingStickyPanelsVisible(on) {
    const show = !!on;
    cleanupDetachedStickyPanels();
    stickyTitlePanels.forEach((panel, id) => {
      if (!panel) return;
      const btn = show ? findMiniMapButtonForAnswerId(id) : null;
      setPanelShownForButton(panel, btn, show);
    });
    markPanelsChanged();
    return getStickyTitlePanelsState();
  }

  function setPanelsVisibleFromIdSet(idSet) {
    cleanupDetachedStickyPanels();
    stickyTitlePanels.forEach((panel, id) => {
      if (!panel) return;
      const key = normalizeId(id);
      const show = idSet.has(key);
      const btn = show ? findMiniMapButtonForAnswerId(key) : null;
      setPanelShownForButton(panel, btn, show);
    });
    markPanelsChanged();
    return getStickyTitlePanelsState();
  }

  function areAllMiniMapPanelsVisible(btns) {
    let hasAny = false;
    for (const btn of btns) {
      const answerId = getAnswerIdForBtn(btn);
      if (!answerId) continue;
      hasAny = true;
      const panel = stickyTitlePanels.get(answerId);
      if (!panel || !panel.isConnected || panel.style.display === 'none') return false;
    }
    return hasAny;
  }

  function toggleOpenStickyTitlePanels() {
    const selected = getSingleSelectionSet();
    if (!selected.size) {
      markPanelsChanged();
      const stateNow = getStickyTitlePanelsState();
      return { ...stateNow, shown: false, restored: false, selected: 0 };
    }

    if (hasVisiblePanelFromSet(selected)) {
      const next = hidePanelsFromIdSet(selected);
      return { ...next, shown: false, restored: false, selected: selected.size };
    }

    ensurePanelsForIdSet(selected);
    const next = setPanelsVisibleFromIdSet(selected);
    return { ...next, shown: true, restored: true, selected: selected.size };
  }

  function toggleAllStickyTitlePanels() {
    const btns = getMiniMapButtons();
    if (!btns.length) return toggleOpenStickyTitlePanels();

    const show = !areAllMiniMapPanelsVisible(btns);
    if (show) {
      for (const btn of btns) {
        const answerId = getAnswerIdForBtn(btn);
        if (!answerId) continue;
        ensureStickyTitlePanel(answerId, btn);
      }
      repositionAllStickyPanels();
      markPanelsChanged();
      return { ...getStickyTitlePanelsState(), shown: true };
    }

    const next = setExistingStickyPanelsVisible(false);
    return { ...next, shown: false };
  }

  function restorePanelsFromMemoryOnce() {
    const visible = getVisibleSelectionSet();
    if (!visible.size) {
      syncDialTitlePinVisual();
      return true;
    }
    for (const id of visible) {
      if (!findMiniMapButtonForAnswerId(id)) return false;
    }
    ensurePanelsForIdSet(visible);
    setPanelsVisibleFromIdSet(visible);
    repositionAllStickyPanels();
    return true;
  }

  function repositionAllStickyPanels() {
    stickyTitlePanels.forEach((panel, id) => {
      if (!panel || panel.style.display === 'none') return;

      const btn = findMiniMapButtonForAnswerId(normalizeId(id));
      if (!btn) {
        panel.style.visibility = 'hidden';
        panel.style.pointerEvents = 'none';
        return;
      }
      positionStickyPanelForButton(panel, btn);
      syncPanelVisibilityForButton(panel, btn);
    });
  }

  const repositionDebounced = UTIL_debounce(repositionAllStickyPanels, 80);
  let offMiniMapScroll = null;
  let miniMapScrollRoot = null;
  function bindMiniMapScroll(root) {
    if (miniMapScrollRoot === root) return;
    try { offMiniMapScroll?.(); } catch {}
    offMiniMapScroll = null;
    miniMapScrollRoot = root || null;
    if (!root) return;
    offMiniMapScroll = UTIL_on(root, 'scroll', repositionDebounced, { passive: true });
  }
  UTIL_on(window, 'scroll', repositionDebounced, { passive: true });
  UTIL_on(window, 'resize', repositionDebounced, { passive: true });

  /* ───────────────────────────── 🆕 NEW: COLLAPSE EVENT HANDLER ───────────────────────────── */
  // When 1E1a collapses/expands an answer, dim or restore the associated sticky pill

  UTIL_on(W, EV_.ANSWER_COLLAPSE, (e) => {
    try {
      const { answerId, collapsed } = e?.detail || {};
      const key = normalizeId(answerId);
      if (!key) return;

      const panel = stickyTitlePanels.get(key);
      if (!panel) return;

      // Mark panel as collapsed-answer so CSS dims it
      if (collapsed) {
        panel.setAttribute('data-answer-collapsed', '1');
      } else {
        panel.removeAttribute('data-answer-collapsed');
        // Re-position in case the layout shifted during expand
        const btn = findMiniMapButtonForAnswerId(key);
        if (btn) {
          setTimeout(() => {
            positionStickyPanelForButton(panel, btn);
            syncPanelVisibilityForButton(panel, btn);
          }, 240); // wait for 1E1a's expand transition (220ms + buffer)
        }
      }
    } catch {}
  });

  /* ───────────────────────────── 👀 7) STICKY READ-ONLY TITLE POPUP (OPTIONAL) ───────────────────────────── */

  const stickyTitlePopup = D.createElement('div');
  stickyTitlePopup.className = CLS_.STICKY_TITLE;
  stickyTitlePopup.setAttribute(ATTR_.CGXUI_OWNER, SkID);
  stickyTitlePopup.setAttribute(ATTR_.CGXUI, UI_.STICKY_TITLE);

  Object.assign(stickyTitlePopup.style, {
    position: 'fixed',
    zIndex: '2147483647',
    display: 'none',
    maxWidth: '220px',
    padding: '6px 8px',
    borderRadius: '8px',
    fontSize: '11px',
    lineHeight: '1.4',
    background: 'rgba(15,15,15,0.96)',
    color: '#f5f5f5',
    border: '1px solid rgba(255,255,255,0.15)',
    boxShadow: '0 6px 14px rgba(0,0,0,0.55)',
    pointerEvents: 'none',
    whiteSpace: 'normal',
  });

  D.body.appendChild(stickyTitlePopup);

  function showStickyTitlePopupFor(btn, answerId) {
    if (!btn || !answerId) return;

    const title = getCurrentTitleForId(answerId) || '(no title yet)';
    stickyTitlePopup.textContent = title;
    stickyTitlePopup._answerId = answerId;
    stickyTitlePopup.style.display = 'block';

    const r = btn.getBoundingClientRect();
    const gap = 6;
    const rect = stickyTitlePopup.getBoundingClientRect();

    const left = Math.max(4, r.left - rect.width - gap);
    const top  = Math.max(4, r.top);

    stickyTitlePopup.style.left = left + 'px';
    stickyTitlePopup.style.top  = top + 'px';
  }

  function hideStickyTitlePopup() {
    stickyTitlePopup.style.display = 'none';
    stickyTitlePopup._answerId = null;
  }

  /* ───────────────────────────── 🔁 8) EVENT SYNC — ONE SOURCE OF TRUTH 🔗 ───────────────────────────── */

  function onTitleSet(detail) {
    const answerId = normalizeId(detail?.answerId);
    if (!answerId) return;

    const title = normalizeId(detail?.title);

    // Update local cache (read-model)
    if (title) STATE.titles[answerId] = title;
    else delete STATE.titles[answerId];

    // Mirror to turnId when known (for tooltip lookup convenience only)
    try {
      const turnId = normalizeId(W.H2O_MM_turnIdByAId?.get?.(answerId));
      if (turnId) {
        if (title) STATE.titles[turnId] = title;
        else delete STATE.titles[turnId];
      }
    } catch {}

    // ALIGNED: update MiniMap tooltip immediately using correct selectors
    setTitleOnMiniMap(answerId, title);
    try {
      const turnId = normalizeId(W.H2O_MM_turnIdByAId?.get?.(answerId));
      if (turnId) setTitleOnMiniMap(turnId, title);
    } catch {}

    // Keep popup in sync
    if (stickyTitlePopup.style.display === 'block' && stickyTitlePopup._answerId === answerId) {
      stickyTitlePopup.textContent = title || '(no title)';
    }

    // Keep sticky panel input in sync
    const panel = stickyTitlePanels.get(answerId);
    if (panel && panel.style.display !== 'none') {
      const input = getPanelInput(panel);
      if (input) input.value = title;
    }
  }

  UTIL_on(W, EV_.TITLE_SET,     (e) => onTitleSet(e?.detail || {}));
  UTIL_on(W, EV_.TITLE_SET_LEG, (e) => onTitleSet(e?.detail || {}));

  /* ───────────────────────────── 🧠 9) TOOLTIP SYNC ON NEW BUTTONS ───────────────────────────── */

  function syncMiniMapTooltipsOnce() {
    const btns = Array.from(D.querySelectorAll(SEL_.MM_BTN));
    if (!btns.length) return;

    for (const btn of btns) {
      // ALIGNED: prefer primary-a-id, fall back to data-id
      const id = normalizeId(btn.dataset.primaryAId || btn.dataset.id);
      if (!id) continue;
      const t = getCurrentTitleForId(id);
      if (t) btn.setAttribute(ATTR_.TITLE, t);
    }
  }

  // Observe minimap container for new buttons (remount-safe)
  const mo = new MutationObserver(UTIL_debounce(() => {
    syncMiniMapTooltipsOnce();
    repositionAllStickyPanels();
  }, 120));

  function startObserve() {
    const root = D.querySelector(SEL_.MM_CONTAINER);
    if (!root) {
      bindMiniMapScroll(null);
      return false;
    }
    bindMiniMapScroll(root);
    mo.disconnect();
    mo.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [ATTR_.CGXUI_STATE],
    });
    return true;
  }

  // Retry a few times (MiniMap may load later)
  let tries = 0;
  let restoredPanels = false;
  const tInt = setInterval(() => {
    tries++;
    const ok = startObserve();
    syncMiniMapTooltipsOnce();
    if (ok && !restoredPanels) {
      restoredPanels = restorePanelsFromMemoryOnce();
    }
    if ((ok && restoredPanels) || tries >= 30) {
      if (!restoredPanels) syncDialTitlePinVisual();
      clearInterval(tInt);
    }
  }, 500);

  /* ───────────────────────────── 🔌 10) EXPORT — WINDOW HOOKS (USED BY MINIMAP) ───────────────────────────── */

  // These are the ONLY hard coupling points.
  W.getCurrentTitleForId     = getCurrentTitleForId;
  W.setTitleOnMiniMap        = setTitleOnMiniMap;
  W.setTitleOnAnswer         = setTitleOnAnswer;
  W.setAnswerTitleFromMiniMap= setAnswerTitleFromMiniMap;

  W.toggleStickyTitlePanel      = toggleStickyTitlePanel;
  W.toggleOpenStickyTitlePanels = toggleOpenStickyTitlePanels;
  W.toggleAllStickyTitlePanels  = toggleAllStickyTitlePanels;
  W.getStickyTitlePanelsState   = getStickyTitlePanelsState;
  W.repositionAllStickyPanels   = repositionAllStickyPanels;

  W.showStickyTitlePopupFor     = showStickyTitlePopupFor;
  W.hideStickyTitlePopup        = hideStickyTitlePopup;

})();