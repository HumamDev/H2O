// ==UserScript==
// @h2o-id             8y1a.input.dock.keys.rail
// @name               8Y1a.🟣🧊 Input Dock (Keys Rail)
// @namespace          H2O.Premium.CGX.input.dock.keys.rail
// @author             HumamDev
// @version            0.1.4
// @revision           005
// @build              260304-102754
// @description        Cockpit-inspired container around the composer + slot-based Keys Rail host (top/left/right/layer). Contract v2.0 Stage-1 mechanics.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ============================================================================
   * 🧊🧷 H2O — Input Dock (Keys Rail)
   * ----------------------------------------------------------------------------
   * Contract v2.0 — Stage 1 (Mechanics):
   * - Identity-first, bounded vault, SEL_/EV_/UI_/ATTR_/CFG_ registries.
   * - Idempotent boot + full dispose cleanup.
   * - Slot API: register/unregister/getSlot/ready/list + queued registrations.
   * - “Dock owns layout; providers own behavior.”
   * ========================================================================== */

  const W = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
  const D = document;

  /* ───────────────────────────── 0) Identity (confirmed) ───────────────────────────── */

  const TOK = 'ID';
  const PID = 'inpdck';
  const CID = 'InpDock';
  const SkID = 'idok';

  const SUITE = 'prm';
  const HOST  = 'cgx';

  const BrID = PID;
  const DsID = PID;

  const MODTAG    = 'InputDock';
  const MODICON   = '🧷';
  const EMOJI_HDR = '🧊';

  const H2O = (W.H2O = W.H2O || {});
  H2O[TOK] = H2O[TOK] || Object.create(null);

  const VAULT = (H2O[TOK][BrID] = H2O[TOK][BrID] || {
    diag:  Object.create(null),
    state: Object.create(null),
    api:   Object.create(null),
  });

  // If hot-reloaded, dispose previous instance first.
  try { VAULT.api?.dispose?.(); } catch {}

  VAULT.state.meta = VAULT.state.meta || {
    TOK, PID, CID, SkID, BrID, DsID, MODTAG, MODICON, EMOJI_HDR, SUITE, HOST,
  };

  /* ───────────────────────────── 1) Tokens (Stage 1) ───────────────────────────── */

  const ATTR_ = Object.freeze({
    CGX_OWNER: 'data-cgxui-owner',
    CGX_UI:    'data-cgxui',
    CGX_STATE: 'data-cgxui-state',
  });

  const UI_ = Object.freeze({
    STYLE: `${SkID}-style`,
    ROOT:  `${SkID}-root`,
    SHELL: `${SkID}-shell`,
    TOP:   `${SkID}-top`,
    BAY:   `${SkID}-bay`,
    LEFT:  `${SkID}-left`,
    RIGHT: `${SkID}-right`,
    LAYER: `${SkID}-layer`,
  });

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
  });

  const EV_ = Object.freeze({
    READY: 'evt:h2o:inputdock:ready',
  });

  const SEL_ = Object.freeze({
    // Composer forms (borrowed spirit from your nvcn finder)
    FORM: [
      'form[data-type="unified-composer"]',
      'form.group\\/composer',
      'form[data-testid="composer"]',
      'form[action*="conversation"]',
    ].join(','),
    ANY_FORM: 'form',
    PROMPT_TA: '#prompt-textarea',
    SEND_BTN: 'button[data-testid="send-button"], button[aria-label*="send" i]',
    SURFACE: '[data-composer-surface="true"]',
    EDITABLE: [
      '#prompt-textarea',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      'form.group\\/composer [contenteditable="true"]',
      'form[data-testid="composer"] [contenteditable="true"]',
      'form[action*="conversation"] [contenteditable="true"]',
      'form[data-testid="composer"] textarea',
      'form[action*="conversation"] textarea',
    ].join(','),
    // Dock owned nodes
    ROOT:  () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.ROOT}"]`,
    SHELL: () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.SHELL}"]`,
    TOP:   () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.TOP}"]`,
    BAY:   () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.BAY}"]`,
    LEFT:  () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.LEFT}"]`,
    RIGHT: () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.RIGHT}"]`,
    LAYER: () => `[${ATTR_.CGX_OWNER}="${SkID}"][${ATTR_.CGX_UI}="${UI_.LAYER}"]`,
  });

  // Visual + geometry knobs
  const CFG_ = Object.freeze({
    Z: 1000001,

    // panel texture (same family as your Quick Tree CFG + PM glass)
    PANEL_BG_A_ALPHA: 0.045,
    PANEL_BG_B_ALPHA: 0.030,
    PANEL_BORDER_ALPHA: 0.12,
    PANEL_RING_ALPHA: 0.10,
    PANEL_SHADOW_ALPHA: 0.85,
    PANEL_BLUR_PX: 14,
    PANEL_SATURATE: 1.05,
    PANEL_CONTRAST: 1.08,
    PANEL_BRIGHTNESS: 1.03,

    // Dock geometry
    DOCK_MAX_W_PX: 1400,
    DOCK_MIN_W_PX: 220,
    DOCK_MARGIN_X_PX: 12,
    DOCK_MIN_TOP_PX: 52,
    DOCK_TOP_OVERLAY_PX: 26,
    DOCK_MIN_HEIGHT_PX: 150,
    ANCHOR_MAX_VH: 0.9,
    ANCHOR_MIN_PX: 280,
    ANCHOR_MAX_PX: 1200,
    DOCK_SIDE_PAD_PX: 2,
    SIDE_LANE_W_PX: 44,
    SHELL_PAD_TOP_PX: 8,
    SHELL_PAD_BOTTOM_PX: 10,
    DOCK_RADIUS_PX: 22,
    INNER_RADIUS_PX: 18,

    // Top rail
    TOP_GAP_PX: 8,
    TOP_PAD_X_PX: 6,
    TOP_PAD_BOTTOM_PX: 8,
    TOP_MIN_H_PX: 20,

    // Bay cavity
    BAY_PAD_PX: 0,
    BAY_MIN_H_PX: 44,
    BAY_MAX_H_PX: 220,
    BAY_EXTRA_H_PX: 0,

    // Side stacks hug distance
    SIDE_HUG_PX: 40,
    SIDE_GAP_PX: 8,

    // Underglow
    GLOW_ALPHA: 0.40,

    // Self-heal / observers
    BOOT_RETRY_MS: 450,
    HEAL_DEBOUNCE_MS: 48,
    TRACK_POLL_MS: 120,

    // Diagnostics (quiet by default)
    DIAG_LOG: false,
  });

  const DIAG = (VAULT.diag = VAULT.diag || Object.create(null));
  DIAG.once = DIAG.once || Object.create(null);

  function DIAG_log(tag, extra) {
    if (!CFG_.DIAG_LOG) return;
    const msg = `[H2O:${MODTAG}] ${String(tag || '')}`;
    try {
      if (extra === undefined) console.debug(msg);
      else console.debug(msg, extra);
    } catch {}
  }

  function DIAG_once(key, tag, extra) {
    if (!CFG_.DIAG_LOG) return;
    const k = String(key || '').trim();
    if (!k) return;
    if (DIAG.once[k]) return;
    DIAG.once[k] = 1;
    DIAG_log(tag, extra);
  }

  /* ───────────────────────────── 2) Cleanup registry ───────────────────────────── */

  function UTIL_cleanupMake() {
    const fns = [];
    return {
      add(fn) { if (typeof fn === 'function') fns.push(fn); return fn; },
      run() { while (fns.length) { try { fns.pop()(); } catch {} } },
    };
  }

  const CLEANUP = (VAULT.state.cleanup = VAULT.state.cleanup || UTIL_cleanupMake());

  function UTIL_on(target, type, fn, opts) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, opts);
    CLEANUP.add(() => { try { target.removeEventListener(type, fn, opts); } catch {} });
  }

  function UTIL_mo(target, opts, handler) {
    if (!target) return null;
    const mo = new MutationObserver(handler);
    try { mo.observe(target, opts); } catch {}
    CLEANUP.add(() => { try { mo.disconnect(); } catch {} });
    return mo;
  }

  function UTIL_debounce(fn, ms) {
    let t = 0;
    return (...args) => {
      if (t) clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
      CLEANUP.add(() => { try { clearTimeout(t); } catch {} });
    };
  }

  /* ───────────────────────────── 3) Small DOM helpers ───────────────────────────── */

  const DOM_ = Object.freeze({
    q(sel, root = D) { return root.querySelector(sel); },
    qa(sel, root = D) { return Array.from(root.querySelectorAll(sel)); },
    isConnected(el) { return !!(el && el.isConnected); },
    isVisible(el) {
      if (!el || !el.isConnected) return false;
      try {
        const cs = W.getComputedStyle?.(el);
        if (cs) {
          if (cs.display === 'none') return false;
          if (cs.visibility === 'hidden') return false;
          const op = Number.parseFloat(cs.opacity || '1');
          if (Number.isFinite(op) && op <= 0.02) return false;
        }
        const r = el.getBoundingClientRect?.();
        if (!r || r.width <= 0 || r.height <= 0) return false;
        return true;
      } catch { return false; }
    },
    el(tag, attrs = {}, kids = []) {
      const n = D.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (k === 'style') Object.assign(n.style, v);
        else if (k === 'text') n.textContent = String(v ?? '');
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else if (v !== false && v != null) n.setAttribute(k, String(v));
      }
      for (const c of kids) n.appendChild(typeof c === 'string' ? D.createTextNode(c) : c);
      return n;
    },
  });

  /* ───────────────────────────── 4) State ───────────────────────────── */

  const STATE = (VAULT.state.runtime = VAULT.state.runtime || {
    booted: false,
    readyEmitted: false,

    form: null,
    input: null,
    anchorEl: null,
    anchorInputEl: null,
    anchorRadiusPx: CFG_.INNER_RADIUS_PX,
    anchorRect: null,
    root: null,
    shell: null,
    slots: null,

    pending: [],      // queued register payloads
    reg: new Map(),   // id -> { id, slot, order, el, mode, pin, prev:{parent,next} }

    mo: null,
    roAnchor: null,
    moAnchor: null,
    heal: null,
    bootTimer: 0,
    trackTimer: 0,
    trackRAF: 0,
    trackFrames: 0,
  });

  /* ───────────────────────────── 5) CSS (cockpit bezel) ───────────────────────────── */

  function CORE_injectCssOnce() {
    if (D.getElementById(CSS_.STYLE_ID)) return;

    const s = DOM_.el('style', {
      id: CSS_.STYLE_ID,
      [ATTR_.CGX_OWNER]: SkID,
      [ATTR_.CGX_UI]: UI_.STYLE,
    });

    // NOTE: no raw strings elsewhere; CSS lives here.
    s.textContent = `
/* ${EMOJI_HDR} ${MODICON} ${MODTAG} — Cockpit Dock */

${SEL_.ROOT()}{
  position: fixed;
  left: ${CFG_.DOCK_MARGIN_X_PX}px;
  top: ${CFG_.DOCK_MIN_TOP_PX}px;
  width: min(${CFG_.DOCK_MAX_W_PX}px, calc(100vw - ${CFG_.DOCK_MARGIN_X_PX * 2}px));
  margin: 0;
  z-index: ${CFG_.Z};
  pointer-events: none;
}

${SEL_.ROOT()}[${ATTR_.CGX_STATE}~="hidden"]{
  display: none;
}

${SEL_.SHELL()}{
  position: relative;
  border-radius: ${CFG_.DOCK_RADIUS_PX}px;
  padding: ${CFG_.SHELL_PAD_TOP_PX}px ${CFG_.DOCK_SIDE_PAD_PX}px ${CFG_.SHELL_PAD_BOTTOM_PX}px ${CFG_.DOCK_SIDE_PAD_PX}px;
  pointer-events: none;
  --cgxui-${SkID}-bay-h: ${CFG_.BAY_MIN_H_PX}px;
  --cgxui-${SkID}-top-h: ${CFG_.TOP_MIN_H_PX}px;
  --cgxui-${SkID}-side-lane: ${CFG_.SIDE_LANE_W_PX}px;
  --cgxui-${SkID}-bay-radius: ${CFG_.INNER_RADIUS_PX}px;
  --cgxui-${SkID}-bay-w: 100%;
  --cgxui-${SkID}-side-center-y: calc(${CFG_.SHELL_PAD_TOP_PX}px + var(--cgxui-${SkID}-top-h) + ${CFG_.TOP_PAD_BOTTOM_PX}px + var(--cgxui-${SkID}-bay-h) * 0.5);

  color: var(--cgxui-prmn-text, #f4f6fb);
  background:
    radial-gradient(circle at 0% 0%, rgba(255,255,255,0.00), transparent 45%),
    radial-gradient(circle at 100% 100%, rgba(255,255,255,0.00), transparent 55%),
    linear-gradient(135deg, rgba(255,255,255,0.045), rgba(255,255,255,0.030));
  border: 1px solid var(--cgxui-prmn-border, rgba(255,255,255,.12));
  box-shadow: 0 26px 80px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.10);
  filter: none !important;
  backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
  -webkit-backdrop-filter: blur(14px) saturate(1.05) contrast(1.08) brightness(1.03);
}

/* Inner ring */
${SEL_.SHELL()}::before{
  content:"";
  position:absolute;
  inset: 1px;
  border-radius: calc(${CFG_.DOCK_RADIUS_PX}px - 1px);
  pointer-events:none;
  z-index: 0;
  background: transparent;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255, ${CFG_.PANEL_RING_ALPHA}),
    inset 0 -1px 0 rgba(0,0,0, 0.55);
}

/* Underglow strip */
${SEL_.SHELL()}::after{
  content:"";
  position:absolute;
  left: 16px;
  right: 16px;
  bottom: 4px;
  height: 12px;
  border-radius: 999px;
  pointer-events:none;
  z-index: 0;
  background: radial-gradient(closest-side, rgba(70,160,255, ${CFG_.GLOW_ALPHA}), rgba(70,160,255,0));
  filter: blur(2px);
}

/* Top rail (flexible keys line) */
${SEL_.TOP()}{
  position: relative;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-height: var(--cgxui-${SkID}-top-h);
  gap: ${CFG_.TOP_GAP_PX}px;
  padding: 0 ${CFG_.TOP_PAD_X_PX}px ${CFG_.TOP_PAD_BOTTOM_PX}px ${CFG_.TOP_PAD_X_PX}px;
  overflow: visible;
  white-space: nowrap;
  border-radius: 12px;
  background: transparent;
  pointer-events: auto !important;
}

/* Bay cavity visually wraps the live composer without re-parenting it */
${SEL_.BAY()}{
  position: relative;
  z-index: 5;
  min-height: var(--cgxui-${SkID}-bay-h);
  width: min(var(--cgxui-${SkID}-bay-w), calc(100% - (var(--cgxui-${SkID}-side-lane) * 2)));
  max-width: 100%;
  margin-left: auto;
  margin-right: auto;
  border-radius: var(--cgxui-${SkID}-bay-radius);
  padding: ${CFG_.BAY_PAD_PX}px;
  pointer-events: none !important;
  background: transparent;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.12),
    inset 0 0 0 3px rgba(0,0,0,0.45);
}

${SEL_.BAY()}::before{
  content:"";
  position:absolute;
  inset: -2px;
  border-radius: calc(var(--cgxui-${SkID}-bay-radius) + 2px);
  pointer-events:none;
  box-shadow:
    0 0 0 1px rgba(120,165,240,0.24),
    0 0 24px rgba(30,145,255,0.2);
}

/* Side stacks hug the bay */
${SEL_.LEFT()}, ${SEL_.RIGHT()}{
  position: absolute;
  top: var(--cgxui-${SkID}-side-center-y);
  transform: translateY(-50%);
  z-index: 21;
  display: flex;
  flex-direction: column;
  gap: ${CFG_.SIDE_GAP_PX}px;
  pointer-events: auto !important;
}
${SEL_.LEFT()} { left: 7px; }
${SEL_.RIGHT()} { right: 7px; }

/* Overlay layer for popovers */
${SEL_.LAYER()}{
  position: absolute;
  inset: 0;
  z-index: 24;
  pointer-events: none;
}
${SEL_.LAYER()} > *{
  pointer-events: auto;
}

${SEL_.TOP()} *,
${SEL_.LEFT()} *,
${SEL_.RIGHT()} *{
  pointer-events: auto !important;
}
`;

    D.head.appendChild(s);
    CLEANUP.add(() => { try { s.remove(); } catch {} });
  }

  /* ───────────────────────────── 6) Composer finding + mount ───────────────────────────── */

  let __cachedForm = null;
  let __cachedInput = null;
  let __cachedSurface = null;

  function UTIL_clamp(n, min, max) {
    if (!Number.isFinite(n)) return min;
    if (!Number.isFinite(min)) min = n;
    if (!Number.isFinite(max)) max = n;
    if (max < min) return min;
    return Math.min(max, Math.max(min, n));
  }

  function UTIL_parseFirstPx(raw, fallback = 0) {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    const m = s.match(/-?\d+(\.\d+)?/);
    if (!m) return fallback;
    const v = Number.parseFloat(m[0]);
    return Number.isFinite(v) ? v : fallback;
  }

  function UTIL_readRadiusPx(el, fallback = CFG_.INNER_RADIUS_PX) {
    if (!el || !DOM_.isVisible(el)) return fallback;
    try {
      const inlineV = UTIL_parseFirstPx(el.style?.borderRadius, NaN);
      if (Number.isFinite(inlineV) && inlineV > 0) return inlineV;
      const cs = W.getComputedStyle?.(el);
      const v = UTIL_parseFirstPx(cs?.borderTopLeftRadius, NaN);
      if (Number.isFinite(v) && v > 0) return v;
    } catch {}
    return fallback;
  }

  function CORE_followFor(frames = 12) {
    const n = Math.max(0, Number(frames) | 0);
    STATE.trackFrames = Math.max(STATE.trackFrames || 0, n);
    if (STATE.trackRAF) return;
    const tick = () => {
      STATE.trackRAF = 0;
      STATE.heal?.();
      if ((STATE.trackFrames || 0) > 0) {
        STATE.trackFrames -= 1;
        STATE.trackRAF = W.requestAnimationFrame(tick);
      }
    };
    STATE.trackRAF = W.requestAnimationFrame(tick);
  }

  function CORE_clearAnchorObservers() {
    try { STATE.roAnchor?.disconnect?.(); } catch {}
    try { STATE.moAnchor?.disconnect?.(); } catch {}
    STATE.roAnchor = null;
    STATE.moAnchor = null;
    STATE.anchorEl = null;
    STATE.anchorInputEl = null;
  }

  function CORE_bindAnchorObservers(anchorEl, inputEl) {
    const a = (anchorEl && anchorEl.isConnected) ? anchorEl : null;
    const i = (inputEl && inputEl.isConnected) ? inputEl : null;
    if (!a) {
      CORE_clearAnchorObservers();
      return;
    }
    if (STATE.anchorEl === a && STATE.anchorInputEl === i && (STATE.roAnchor || STATE.moAnchor)) return;
    CORE_clearAnchorObservers();
    STATE.anchorEl = a;
    STATE.anchorInputEl = i;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => CORE_followFor(18));
      try { ro.observe(a); } catch {}
      if (i && i !== a) { try { ro.observe(i); } catch {} }
      STATE.roAnchor = ro;
    }

    const mo = new MutationObserver(() => CORE_followFor(8));
    try { mo.observe(a, { attributes: true, attributeFilter: ['class', 'style', 'data-state'] }); } catch {}
    if (i && i !== a) {
      try { mo.observe(i, { attributes: true, attributeFilter: ['class', 'style', 'data-state'] }); } catch {}
    }
    STATE.moAnchor = mo;
  }

  function UTIL_scoreBottomLaneRect(r) {
    if (!r) return 0;
    const vh = Math.max(1, Number(W.innerHeight) || 0);
    const bottom = Number(r.bottom);
    let score = 0;
    if (Number.isFinite(bottom)) {
      if (bottom >= (vh * 0.45)) score += 2;
      if (bottom <= (vh + 24)) score += 1;
      const distFromBottom = Math.abs(vh - bottom);
      score += Math.max(0, 420 - distFromBottom) / 70;
    }
    return score;
  }

  function UTIL_pickComposerInput(formHint = null) {
    const prompt = D.getElementById('prompt-textarea');
    if (prompt && DOM_.isVisible(prompt)) {
      const promptForm = prompt.closest?.('form') || null;
      if (!formHint || (promptForm && promptForm === formHint)) return prompt;
    }

    if (formHint) {
      const scoped = formHint.querySelector?.('#prompt-textarea, textarea, [contenteditable="true"]') || null;
      if (scoped && DOM_.isVisible(scoped)) return scoped;
    }

    const candidates = DOM_.qa(SEL_.EDITABLE);
    if (!candidates.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of candidates) {
      if (!el) continue;
      let score = 0;

      const hostForm = el.closest?.('form') || null;
      if (el.id === 'prompt-textarea') score += 12;
      if (String(el.getAttribute?.('contenteditable') || '').toLowerCase() === 'true') score += 3;
      if (el.tagName === 'TEXTAREA') score += 2;
      if (hostForm && formHint && hostForm === formHint) score += 4;
      if (hostForm?.matches?.('form[data-type="unified-composer"], form.group\\/composer')) score += 8;
      if (hostForm?.matches?.('form[data-testid="composer"]')) score += 7;
      if (hostForm?.matches?.('form[action*="conversation"]')) score += 6;
      if (hostForm?.querySelector?.(SEL_.SEND_BTN)) score += 3;

      const aria = String(el.getAttribute?.('aria-label') || '').toLowerCase();
      const ph = String(el.getAttribute?.('placeholder') || '').toLowerCase();
      if (aria.includes('message') || ph.includes('message')) score += 2;

      if (DOM_.isVisible(el)) score += 4;
      try { score += UTIL_scoreBottomLaneRect(el.getBoundingClientRect()); } catch {}

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return (bestScore >= 5) ? best : (best || null);
  }

  function UTIL_pickComposerSurface(inputHint = null) {
    const cands = DOM_.qa(SEL_.SURFACE);
    if (!cands.length) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const el of cands) {
      if (!DOM_.isVisible(el)) continue;
      const r = el.getBoundingClientRect?.();
      if (!r || r.width <= 0 || r.height <= 0) continue;

      let score = 0;
      if (r.width >= 300) score += 2;
      if (el.closest?.(SEL_.FORM)) score += 6;
      if (inputHint && el.contains?.(inputHint)) score += 18;
      score += UTIL_scoreBottomLaneRect(r);

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    return best;
  }

  function UTIL_pickComposerForm() {
    // a) Fast path: #prompt-textarea -> closest form
    const prompt = D.querySelector(SEL_.PROMPT_TA);
    const promptForm = prompt?.closest?.('form') || null;
    if (promptForm && DOM_.isVisible(promptForm)) return promptForm;

    const forms = DOM_.qa(SEL_.FORM);
    if (forms.length) {
      let best = null;
      let bestScore = -Infinity;

      for (const f of forms) {
        if (!f) continue;

        const isUnified = !!f.matches?.('form[data-type="unified-composer"], form.group\\/composer');
        const isComposer = !!f.matches?.('form[data-testid="composer"]');
        const isConvo = !!f.matches?.('form[action*="conversation"]');
        const hasPrompt = !!f.querySelector?.('#prompt-textarea');
        const hasSend = !!f.querySelector?.(SEL_.SEND_BTN);
        const hasInput = !!f.querySelector?.('#prompt-textarea, textarea, [contenteditable="true"]');

        if (!(isUnified || isComposer || isConvo || hasPrompt || hasSend || hasInput)) continue;

        let score = 0;
        if (isUnified) score += 13;
        if (isComposer) score += 12;
        if (hasPrompt) score += 10;
        if (isConvo) score += 8;
        if (hasSend) score += 6;
        if (hasInput) score += 4;
        if (DOM_.isVisible(f)) score += 3;
        try { score += UTIL_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}

        if (score > bestScore) {
          best = f;
          bestScore = score;
        }
      }

      if (best && bestScore >= 8) return best;
    }

    // b) fallback input -> host form in visible bottom composer lane
    const pickedInput = UTIL_pickComposerInput(null);
    const inputForm = pickedInput?.closest?.('form') || null;
    if (inputForm && DOM_.isVisible(inputForm)) return inputForm;

    // c) fallback to last visible form near viewport bottom with a send button
    let tail = null;
    let tailScore = -Infinity;
    for (const f of DOM_.qa(SEL_.ANY_FORM)) {
      if (!DOM_.isVisible(f)) continue;
      if (!f.querySelector?.(SEL_.SEND_BTN)) continue;
      let score = 6;
      const hasInput = !!f.querySelector?.('#prompt-textarea, textarea, [contenteditable="true"]');
      if (hasInput) score += 3;
      try { score += UTIL_scoreBottomLaneRect(f.getBoundingClientRect()); } catch {}
      if (score >= tailScore) {
        tail = f;
        tailScore = score;
      }
    }

    return tail || null;
  }

  function UTIL_findComposerForm() {
    if (__cachedForm && DOM_.isVisible(__cachedForm)) return __cachedForm;
    const f = UTIL_pickComposerForm();
    __cachedForm = f || null;
    return __cachedForm;
  }

  function UTIL_findComposerInput(formHint = null) {
    if (__cachedInput && DOM_.isVisible(__cachedInput)) return __cachedInput;
    const form = formHint || UTIL_findComposerForm();
    const input = UTIL_pickComposerInput(form) || UTIL_pickComposerInput(null);
    __cachedInput = input || null;
    return __cachedInput;
  }

  function UTIL_findComposerSurface(form, input) {
    if (
      __cachedSurface &&
      DOM_.isVisible(__cachedSurface) &&
      (!input || __cachedSurface.contains?.(input) || input.closest?.(SEL_.SURFACE) === __cachedSurface)
    ) return __cachedSurface;
    const hinted =
      input?.closest?.(SEL_.SURFACE) ||
      form?.querySelector?.(SEL_.SURFACE) ||
      form?.closest?.(SEL_.SURFACE) ||
      null;
    if (hinted && DOM_.isVisible(hinted)) {
      __cachedSurface = hinted;
      return __cachedSurface;
    }
    const picked = UTIL_pickComposerSurface(input || null);
    __cachedSurface = picked || null;
    return __cachedSurface;
  }

  function UTIL_unionRect(rects) {
    const xs = [];
    const ys = [];
    const x2 = [];
    const y2 = [];
    for (const r of (rects || [])) {
      if (!r) continue;
      if (!Number.isFinite(r.left) || !Number.isFinite(r.top) || !Number.isFinite(r.right) || !Number.isFinite(r.bottom)) continue;
      if ((r.width || 0) <= 0 || (r.height || 0) <= 0) continue;
      xs.push(r.left);
      ys.push(r.top);
      x2.push(r.right);
      y2.push(r.bottom);
    }
    if (!xs.length) return null;
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...x2);
    const bottom = Math.max(...y2);
    return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  }

  function UTIL_clampAnchorRect(r) {
    if (!r) return null;
    const left = Number(r.left);
    const top = Number(r.top);
    const right = Number(r.right);
    const bottom = Number(r.bottom);
    if (!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)) return r;

    const width = Math.max(0, Number(r.width) || (right - left));
    const rawHeight = Math.max(0, bottom - top);
    const maxAnchorHeight = Math.max(
      CFG_.ANCHOR_MIN_PX,
      Math.min(CFG_.ANCHOR_MAX_PX, Math.round((W.innerHeight || 0) * CFG_.ANCHOR_MAX_VH)),
    );

    if (rawHeight <= maxAnchorHeight + 1) {
      return { left, top, right, bottom, width, height: rawHeight };
    }

    const clampedTop = Math.max(0, bottom - maxAnchorHeight);
    return {
      left,
      top: clampedTop,
      right,
      bottom,
      width,
      height: Math.max(0, bottom - clampedTop),
    };
  }

  function UTIL_getComposerAnchorData(form, input) {
    const prompt = D.getElementById('prompt-textarea');
    const promptSurface = prompt?.closest?.(SEL_.SURFACE) || null;
    if (promptSurface && DOM_.isVisible(promptSurface)) {
      const rPromptSurface = promptSurface.getBoundingClientRect?.();
      if (rPromptSurface && rPromptSurface.width > 0 && rPromptSurface.height > 0) {
        return {
          rect: rPromptSurface,
          el: promptSurface,
          radiusPx: UTIL_readRadiusPx(promptSurface, CFG_.INNER_RADIUS_PX),
        };
      }
    }

    const surface = UTIL_findComposerSurface(form, input);
    if (surface && DOM_.isVisible(surface)) {
      const rSurface = surface.getBoundingClientRect?.();
      if (rSurface && rSurface.width > 0 && rSurface.height > 0) {
        return {
          rect: rSurface,
          el: surface,
          radiusPx: UTIL_readRadiusPx(surface, CFG_.INNER_RADIUS_PX),
        };
      }
    }

    const rForm = (form && DOM_.isVisible(form)) ? form.getBoundingClientRect() : null;
    const rInput = (input && DOM_.isVisible(input)) ? input.getBoundingClientRect() : null;
    const merged = UTIL_unionRect([rForm, rInput]) || rInput || rForm || null;
    const rect = UTIL_clampAnchorRect(merged);
    const fallbackEl = (form && DOM_.isVisible(form)) ? form : (input && DOM_.isVisible(input) ? input : null);
    if (!rect) return null;
    return {
      rect,
      el: fallbackEl,
      radiusPx: UTIL_readRadiusPx(fallbackEl, CFG_.INNER_RADIUS_PX),
    };
  }

  function CORE_applyDockLayout(anchorRect, anchorRadiusPx = CFG_.INNER_RADIUS_PX) {
    if (!STATE.root || !STATE.shell || !anchorRect) return false;

    const vw = Math.max(1, Number(W.innerWidth) || D.documentElement.clientWidth || 0);
    const vh = Math.max(1, Number(W.innerHeight) || D.documentElement.clientHeight || 0);
    const vvTop = Number(W.visualViewport?.offsetTop) || 0;
    const vvLeft = Number(W.visualViewport?.offsetLeft) || 0;

    const marginX = CFG_.DOCK_MARGIN_X_PX;
    const sideLane = Math.max(0, Number(CFG_.SIDE_LANE_W_PX) || 0);
    const maxW = Math.max(220, vw - (marginX * 2));
    const desiredW = Math.max(
      CFG_.DOCK_MIN_W_PX,
      Math.round((anchorRect.width || 0) + (CFG_.DOCK_SIDE_PAD_PX * 2) + (sideLane * 2)),
    );
    const widthPx = Math.min(CFG_.DOCK_MAX_W_PX, Math.min(desiredW, maxW));
    const leftRaw = Math.round((Number(anchorRect.left) || 0) + vvLeft - CFG_.DOCK_SIDE_PAD_PX - sideLane);
    const leftPx = UTIL_clamp(leftRaw, marginX, Math.max(marginX, vw - widthPx - marginX));

    const topHRaw = Number(STATE.slots?.top?.getBoundingClientRect?.().height) || 0;
    const topH = Math.max(CFG_.TOP_MIN_H_PX, Math.round(topHRaw));
    const overlayH = CFG_.DOCK_TOP_OVERLAY_PX + CFG_.SHELL_PAD_TOP_PX + Math.max(0, topH - CFG_.TOP_MIN_H_PX);

    const maxTop = Math.max(CFG_.DOCK_MIN_TOP_PX, vh - CFG_.DOCK_MIN_HEIGHT_PX);
    const topPx = UTIL_clamp(
      Math.round((Number(anchorRect.top) || 0) + vvTop - overlayH),
      CFG_.DOCK_MIN_TOP_PX,
      maxTop,
    );

    const bayMaxByViewport = Math.max(CFG_.BAY_MIN_H_PX, Math.min(CFG_.BAY_MAX_H_PX, Math.round(vh * 0.45)));
    const bayHeight = UTIL_clamp(
      Math.round((Number(anchorRect.height) || CFG_.BAY_MIN_H_PX) + CFG_.BAY_EXTRA_H_PX),
      CFG_.BAY_MIN_H_PX,
      bayMaxByViewport,
    );
    const bayRadius = UTIL_clamp(Math.round(Number(anchorRadiusPx) || CFG_.INNER_RADIUS_PX), 12, 48);
    const bayMaxByDock = Math.max(180, Math.round(widthPx - (CFG_.DOCK_SIDE_PAD_PX * 2) - (sideLane * 2)));
    const bayWidth = Math.max(180, Math.min(Math.round(anchorRect.width || bayMaxByDock), bayMaxByDock));

    STATE.root.style.left = `${leftPx}px`;
    STATE.root.style.top = `${topPx}px`;
    STATE.root.style.width = `${Math.max(220, Math.round(widthPx))}px`;
    STATE.shell.style.setProperty(`--cgxui-${SkID}-top-h`, `${topH}px`);
    STATE.shell.style.setProperty(`--cgxui-${SkID}-bay-h`, `${bayHeight}px`);
    STATE.shell.style.setProperty(`--cgxui-${SkID}-bay-radius`, `${bayRadius}px`);
    STATE.shell.style.setProperty(`--cgxui-${SkID}-bay-w`, `${bayWidth}px`);
    return true;
  }

  function CORE_buildDockOnce() {
    if (STATE.root && STATE.root.isConnected && STATE.slots) return STATE.root;

    const foundRoot = DOM_.q(SEL_.ROOT());
    if (foundRoot) {
      const shell = DOM_.q(SEL_.SHELL(), foundRoot);
      const top = DOM_.q(SEL_.TOP(), foundRoot);
      const bay = DOM_.q(SEL_.BAY(), foundRoot);
      const armL = DOM_.q(SEL_.ARML(), foundRoot);
      const armR = DOM_.q(SEL_.ARMR(), foundRoot);
      const left = DOM_.q(SEL_.LEFT(), foundRoot);
      const right = DOM_.q(SEL_.RIGHT(), foundRoot);
      const layer = DOM_.q(SEL_.LAYER(), foundRoot);
      if (shell && top && bay && armL && armR && left && right && layer) {
        STATE.root = foundRoot;
        STATE.shell = shell;
        STATE.slots = { top, bay, left, right, layer };
        return foundRoot;
      }
      try { foundRoot.remove(); } catch {}
    }

    const root = DOM_.el('div', {
      [ATTR_.CGX_OWNER]: SkID,
      [ATTR_.CGX_UI]: UI_.ROOT,
      [ATTR_.CGX_STATE]: 'hidden',
    });

    const shell = DOM_.el('div', {
      [ATTR_.CGX_OWNER]: SkID,
      [ATTR_.CGX_UI]: UI_.SHELL,
    });

    const top = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.TOP });
    const bay = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.BAY });
    const armL = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.ARML });
    const armR = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.ARMR });
    const left = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.LEFT });
    const right = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.RIGHT });
    const layer = DOM_.el('div', { [ATTR_.CGX_OWNER]: SkID, [ATTR_.CGX_UI]: UI_.LAYER });

    shell.appendChild(top);
    shell.appendChild(bay);
    shell.appendChild(armL);
    shell.appendChild(armR);
    shell.appendChild(left);
    shell.appendChild(right);
    shell.appendChild(layer);
    root.appendChild(shell);

    STATE.root = root;
    STATE.shell = shell;
    STATE.slots = { top, bay, left, right, layer };

    CLEANUP.add(() => { try { root.remove(); } catch {} });
    return root;
  }

  function CORE_mountDockNearComposer() {
    const form = UTIL_findComposerForm();
    const input = UTIL_findComposerInput(form);

    if (!form && !input) {
      DIAG_once('miss:composer', 'mount miss: no composer form/input');
      return false;
    }

    const anchor = UTIL_getComposerAnchorData(form, input);
    const anchorRect = anchor?.rect || null;
    if (!anchorRect) {
      DIAG_once('miss:anchor', 'mount miss: no anchor rect');
      return false;
    }

    CORE_injectCssOnce();
    const root = CORE_buildDockOnce();
    const mountParent = D.body || D.documentElement;
    if (!mountParent) return false;

    if (!root.isConnected) {
      mountParent.appendChild(root);
      DIAG_log('dock root attached');
    }

    if (!CORE_applyDockLayout(anchorRect, anchor?.radiusPx || CFG_.INNER_RADIUS_PX)) return false;

    root.setAttribute(ATTR_.CGX_STATE, 'mounted');
    STATE.form = form || input?.closest?.('form') || null;
    STATE.input = input || null;
    STATE.anchorEl = anchor?.el || STATE.form || STATE.input || null;
    STATE.anchorRadiusPx = Number(anchor?.radiusPx) || CFG_.INNER_RADIUS_PX;
    STATE.anchorRect = anchorRect;
    CORE_bindAnchorObservers(STATE.anchorEl, STATE.input);
    return true;
  }

  /* ───────────────────────────── 7) Slot API ───────────────────────────── */

  function API_ready() {
    const composerVisible = DOM_.isVisible(STATE.form) || DOM_.isVisible(STATE.input);
    return !!(STATE.root && STATE.root.isConnected && STATE.slots && STATE.anchorRect && composerVisible);
  }

  function API_getSlot(slotName) {
    const s = STATE.slots || {};
    const k = String(slotName || '').toLowerCase();
    if (k === 'top') return s.top || null;
    if (k === 'left') return s.left || null;
    if (k === 'right') return s.right || null;
    if (k === 'layer') return s.layer || null;
    if (k === 'bay') return s.bay || null;
    return null;
  }

  function REG_sortAndReflow(slotName) {
    const slotEl = API_getSlot(slotName);
    if (!slotEl) return;

    const items = [];
    for (const it of STATE.reg.values()) {
      if (String(it.slot) === String(slotName)) items.push(it);
    }
    items.sort((a, b) => {
      const ao = Number(a.order) || 0;
      const bo = Number(b.order) || 0;
      if (ao !== bo) return ao - bo;
      return (a._seq || 0) - (b._seq || 0);
    });

    // Ensure correct order (append in sorted order if not already).
    for (const it of items) {
      if (!it.el || !it.el.isConnected) continue;
      if (it.el.parentElement !== slotEl) {
        slotEl.appendChild(it.el);
      } else {
        slotEl.appendChild(it.el); // reorders within same parent
      }
    }
  }

  let __seq = 1;

  function API_register(payload) {
    const p = payload || {};
    const id = String(p.id || '').trim();
    const slot = String(p.slot || '').trim().toLowerCase();
    const el = p.el;

    if (!id || !(el instanceof HTMLElement)) return false;
    if (!['top','left','right','layer'].includes(slot)) return false;

    // If not ready yet, queue and return false.
    if (!API_ready()) {
      STATE.pending.push({ ...p, id, slot, el });
      return false;
    }

    // Replace existing (idempotent)
    if (STATE.reg.has(id)) {
      try { API_unregister(id); } catch {}
    }

    const slotEl = API_getSlot(slot);
    if (!slotEl) return false;

    // Save previous location for unregister/dispose restore
    const prevParent = el.parentElement || null;
    const prevNext = el.nextSibling || null;

    const mode = String(p.mode || 'move').toLowerCase();   // move | clone
    const pin = String(p.pin || 'append').toLowerCase();   // append | prepend
    const order = Number.isFinite(Number(p.order)) ? Number(p.order) : 500;

    let mountedEl = el;

    if (mode === 'clone') {
      mountedEl = el.cloneNode(true);
    }

    // Mount
    if (pin === 'prepend' && slotEl.firstChild) slotEl.insertBefore(mountedEl, slotEl.firstChild);
    else slotEl.appendChild(mountedEl);

    const rec = {
      id,
      slot,
      order,
      el: mountedEl,
      sourceEl: el,
      mode,
      pin,
      prev: { parent: prevParent, next: prevNext },
      _seq: __seq++,
    };
    STATE.reg.set(id, rec);

    // If move, detach original from its old place (already moved). If clone, leave original.
    // Reflow order
    REG_sortAndReflow(slot);
    CORE_followFor(8);

    return true;
  }

  function API_unregister(idRaw) {
    const id = String(idRaw || '').trim();
    const rec = STATE.reg.get(id);
    if (!rec) return false;

    STATE.reg.delete(id);

    const mountedEl = rec.el;
    if (rec.mode === 'move') {
      const targetParent = rec.prev?.parent;
      const targetNext = rec.prev?.next;
      const restoreParent =
        (targetParent && targetParent.isConnected) ? targetParent : (D.body || D.documentElement || null);

      if (mountedEl instanceof HTMLElement && restoreParent) {
        try {
          if (targetNext && targetNext.parentNode === restoreParent) restoreParent.insertBefore(mountedEl, targetNext);
          else restoreParent.appendChild(mountedEl);
        } catch {
          try { mountedEl.remove(); } catch {}
        }
      } else if (mountedEl?.isConnected) {
        try { mountedEl.remove(); } catch {}
      }
    } else {
      if (mountedEl?.isConnected) {
        try { mountedEl.remove(); } catch {}
      }
    }

    // Reflow remaining items in slot
    REG_sortAndReflow(rec.slot);
    CORE_followFor(8);

    return true;
  }

  function API_list() {
    const out = [];
    for (const rec of STATE.reg.values()) out.push({ id: rec.id, slot: rec.slot, order: rec.order });
    out.sort((a,b) => (a.order||0) - (b.order||0));
    return out;
  }

  function API_flushPending() {
    if (!API_ready()) return;
    const q = STATE.pending.splice(0, STATE.pending.length);
    for (const item of q) {
      try { API_register(item); } catch {}
    }
  }

  function API_emitReady() {
    if (STATE.readyEmitted) return;
    if (!API_ready()) return;

    STATE.readyEmitted = true;
    try {
      W.dispatchEvent(new CustomEvent(EV_.READY, {
        detail: {
          version: '0.1.4',
          rootEl: STATE.root,
          slots: {
            top: API_getSlot('top'),
            left: API_getSlot('left'),
            right: API_getSlot('right'),
            layer: API_getSlot('layer'),
          },
        },
      }));
    } catch {}
  }

  /* ───────────────────────────── 8) Boot / heal / dispose ───────────────────────────── */

  function CORE_heal() {
    // Re-resolve composer on DOM churn/route switches; keep mount idempotent.
    __cachedForm = null;
    __cachedInput = null;
    __cachedSurface = null;
    const ok = CORE_mountDockNearComposer();
    if (ok) {
      API_flushPending();
      API_emitReady();
      // Reflow all slots
      REG_sortAndReflow('top');
      REG_sortAndReflow('left');
      REG_sortAndReflow('right');
      REG_sortAndReflow('layer');
      DIAG_once('heal:mounted', 'heal mounted');
    } else if (STATE.root?.isConnected) {
      STATE.root.setAttribute(ATTR_.CGX_STATE, 'hidden');
      CORE_clearAnchorObservers();
    }
  }

  function CORE_boot() {
    if (STATE.booted) return;
    STATE.booted = true;
    DIAG_log('boot start', { readyState: D.readyState });

    STATE.heal = UTIL_debounce(CORE_heal, CFG_.HEAL_DEBOUNCE_MS);

    // First attempt
    CORE_heal();

    // Observe DOM changes to self-heal (composer often remounts)
    STATE.mo = UTIL_mo(D.documentElement, { childList: true, subtree: true }, () => {
      STATE.heal?.();
    });

    UTIL_on(W, 'resize', () => STATE.heal?.(), { passive: true });
    UTIL_on(W, 'scroll', () => STATE.heal?.(), { passive: true });
    if (W.visualViewport) {
      UTIL_on(W.visualViewport, 'resize', () => CORE_followFor(18), { passive: true });
      UTIL_on(W.visualViewport, 'scroll', () => CORE_followFor(12), { passive: true });
    }

    UTIL_on(D, 'input', (ev) => {
      const t = ev?.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.id === 'prompt-textarea') {
        CORE_followFor(24);
        return;
      }
      if (!t.closest?.('form')) return;
      if (t.matches?.('textarea, [contenteditable="true"]') || t.closest?.('#prompt-textarea')) {
        CORE_followFor(20);
      }
    }, { capture: true });

    // Retry timer if we boot too early and composer not found yet
    STATE.bootTimer = setInterval(() => {
      if (API_ready()) {
        try { clearInterval(STATE.bootTimer); } catch {}
        STATE.bootTimer = 0;
        return;
      }
      CORE_heal();
    }, CFG_.BOOT_RETRY_MS);
    STATE.trackTimer = setInterval(() => {
      CORE_heal();
    }, CFG_.TRACK_POLL_MS);

    CLEANUP.add(() => { try { if (STATE.bootTimer) clearInterval(STATE.bootTimer); } catch {} });
    CLEANUP.add(() => { try { if (STATE.trackTimer) clearInterval(STATE.trackTimer); } catch {} });
    CLEANUP.add(() => {
      if (STATE.trackRAF) {
        try { W.cancelAnimationFrame(STATE.trackRAF); } catch {}
      }
      STATE.trackRAF = 0;
      STATE.trackFrames = 0;
    });
    CLEANUP.add(() => { CORE_clearAnchorObservers(); });
  }

  function CORE_dispose() {
    // Remove dock + styles + listeners via CLEANUP
    try {
      for (const id of Array.from(STATE.reg.keys())) {
        try { API_unregister(id); } catch {}
      }
    } catch {}
    try { STATE.reg.clear(); } catch {}
    try { STATE.pending.length = 0; } catch {}
    try { STATE.readyEmitted = false; } catch {}
    try { STATE.booted = false; } catch {}
    CLEANUP.run();

    // Clear refs
    __cachedForm = null;
    __cachedInput = null;
    __cachedSurface = null;
    STATE.form = null;
    STATE.input = null;
    STATE.anchorEl = null;
    STATE.anchorInputEl = null;
    STATE.anchorRadiusPx = CFG_.INNER_RADIUS_PX;
    STATE.anchorRect = null;
    STATE.root = null;
    STATE.shell = null;
    STATE.slots = null;
    STATE.mo = null;
    STATE.roAnchor = null;
    STATE.moAnchor = null;
    STATE.heal = null;
    STATE.trackTimer = 0;
    STATE.trackRAF = 0;
    STATE.trackFrames = 0;
    DIAG_log('disposed');
  }

  /* ───────────────────────────── 9) Publish API ───────────────────────────── */

  VAULT.api = VAULT.api || Object.create(null);
  VAULT.api.ready = API_ready;
  VAULT.api.getSlot = API_getSlot;
  VAULT.api.register = API_register;
  VAULT.api.unregister = API_unregister;
  VAULT.api.list = API_list;
  VAULT.api.flush = API_flushPending;
  VAULT.api.dispose = CORE_dispose;

  // Simple top-level convenience alias (optional, but practical)
  H2O.InputDock = H2O.InputDock || Object.create(null);
  H2O.InputDock.api = VAULT.api;

  /* ───────────────────────────── 10) GO ───────────────────────────── */

  if (D.readyState === 'loading') {
    UTIL_on(D, 'DOMContentLoaded', CORE_boot, { once: true });
    DIAG_log('boot waiting for DOMContentLoaded');
  } else {
    CORE_boot();
  }

})();
