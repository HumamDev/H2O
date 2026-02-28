// ==UserScript==
// @h2o-id      1a1c.minimap.shell
// @name         1A1c.🟥🗺️ MiniMap Shell 🪟🗺️
// @namespace    H2O.Prime.CGX.MiniMapShell
// @version      12.6.23
// @rev        000001
// @build      2026-02-28T17:33:34Z
// @description  MiniMap Shell: UI owner bridge (Phase 2)
// @author       HumamDev
// @match        https://chatgpt.com/*
// @run-at       document-idle
// @grant        none

// ==/UserScript==

/* Smoke Test Checklist
 * - Main only -> UI works (fallback)
 * - Kernel+Main -> UI works (legacy)
 * - Kernel+Main+Shell -> UI works and only Shell owns UI
 * - Shell only -> warns+idle
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

  const SHELL_VER = '12.6.23';
  const EV_SHELL_READY = 'evt:h2o:minimap:shell-ready';
  const EV_ROUTE_CHANGED = 'evt:h2o:route:changed';
  const EV_QUICK_READY = 'evt:h2o:minimap:quick-ready';
  const EV_BEHAVIOR_CHANGED = 'evt:h2o:mm:behavior-changed';
  const KEY_COLLAPSED = 'h2o:prm:cgx:mnmp:ui:collapsed:v1';
  const KEY_COLLAPSED_LEGACY = 'ho:mm:collapsed';
  const KEY_COLLAPSED_CHAT_SUFFIX = 'ui:collapsed:chat';
  const KEY_AXIS_OFFSET_SUFFIX = 'ui:axis-offset:v1';
  const KEY_CENTER_FIX_X_SUFFIX = 'ui:center-fix-x:v1';
  const KEY_BADGE_QUOTES_SUFFIX = 'ui:badgeVisibility:quotes:v1';
  const KEY_BADGE_REVS_SUFFIX = 'ui:badgeVisibility:revisions:v1';
  const KEY_BADGE_QWASH_SUFFIX = 'ui:badgeVisibility:qwash:v1';
  const KEY_DIAL_DOTS_VIS_SUFFIX = 'ui:dialPins:dots:v1';
  const KEY_DIAL_SYMBOLS_VIS_SUFFIX = 'ui:dialPins:symbols:v1';
  const KEY_DIAL_HEIGHT_STEP_SUFFIX = 'ui:dialHeightStep:v1';
  const KEY_DIAL_HEIGHT_DIR_SUFFIX = 'ui:dialHeightDir:v1';
  const EV_BADGE_VISIBILITY = 'evt:h2o:minimap:badge-visibility';
  const DIAL_HEIGHT_STEP_MAX = 2;
  const DIAL_HEIGHT_STEP_DELTA_PX = 22;
  const DIAL_HEIGHT_STEP_DELTA_VH = 6;
  const DEFAULT_COLLAPSED_ON_BOOT = true;
  const AXIS_BOOT_DEFAULT_X = -16;
  const AXIS_BOOT_DEFAULT_Y = 0;
  const FORCE_AXIS_DEFAULT_EACH_LOAD = true;
  const FORCE_CENTER_FIX_RESET_EACH_LOAD = true;
  const LOCK_MM_CENTER_FIX_TO_AXIS = true;
  const ROOT_CGX = 'mm-root';
  const ROOT_ID = 'cgx-mm-root';
  const PRELAYOUT_CLASS = 'cgxui-mm-prelayout';

  try {
    TOPW.H2O_MM_SHELL_PLUGIN = true;
    TOPW.H2O_MM_UI_SHELL_PLUGIN = true;
    TOPW.H2O_MM_SHELL_VER = SHELL_VER;
    TOPW.H2O_MM_UI_SHELL_VER = SHELL_VER;
    if (typeof TOPW.H2O_MM_SHELL_READY !== 'boolean') TOPW.H2O_MM_SHELL_READY = false;
    if (typeof TOPW.H2O_MM_UI_SHELL_READY !== 'boolean') TOPW.H2O_MM_UI_SHELL_READY = false;
  } catch {}

  const ATTR = Object.freeze({
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI: 'data-cgxui',
    CGXUI_STATE: 'data-cgxui-state',
  });

  const UI = Object.freeze({
    ROOT: 'mnmp-root',
    MINIMAP: 'mnmp-minimap',
    // Top control: toggle button
    TOGGLE: 'mnmp-toggle',
    // Bottom control: dial button (legacy alias: AUX)
    DIAL: 'mnmp-aux',
    AUX: 'mnmp-aux',
  });

  const SEL = Object.freeze({
    ROOT: `[${ATTR.CGXUI}="${UI.ROOT}"][${ATTR.CGXUI_OWNER}="mnmp"]`,
    PANEL: `[${ATTR.CGXUI}="${UI.MINIMAP}"][${ATTR.CGXUI_OWNER}="mnmp"]`,
    TOGGLE: `[${ATTR.CGXUI}="${UI.TOGGLE}"][${ATTR.CGXUI_OWNER}="mnmp"]`,
    DIAL: `[${ATTR.CGXUI}="${UI.DIAL}"][${ATTR.CGXUI_OWNER}="mnmp"]`,
    AUX: `[${ATTR.CGXUI}="${UI.DIAL}"][${ATTR.CGXUI_OWNER}="mnmp"]`, // compatibility alias
    STYLE: '#cgxui-mnmp-style',
  });

  const SkID = 'mnmp';
  const Z = 2147483647;

  const CSS_ = Object.freeze({
    STYLE_ID: `cgxui-${SkID}-style`,
  });

  const ATTR_ = Object.freeze({
    CGXUI_OWNER: 'data-cgxui-owner',
    CGXUI: 'data-cgxui',
    CGXUI_STATE: 'data-cgxui-state',
    CGXUI_VIEW: 'data-cgxui-view',
    CGXUI_INVIEW: 'data-cgxui-inview',
    CGXUI_FLASH: 'data-cgxui-flash',
    CGXUI_WASH: 'data-cgxui-wash',
    CGXUI_WASH_LEGACY_HL: 'data-cgxui-hl',
    MSG_ROLE: 'data-message-author-role',
  });

  const UI_ = Object.freeze({
    ROOT: `${SkID}-root`,
    MINIMAP: `${SkID}-minimap`,
    COL: `${SkID}-col`,
    // Top control
    TOGGLE: `${SkID}-toggle`,
    // Bottom control (legacy alias: AUX)
    DIAL: `${SkID}-aux`,
    AUX: `${SkID}-aux`,
    WRAP: `${SkID}-wrap`,
    BTN: `${SkID}-btn`,
    DOTROW: `${SkID}-dotrow`,
    COUNT: `${SkID}-count`,
    PINROW: `${SkID}-pinrow`,
    PIN_QUOTE: `${SkID}-pin-quote`,
    PIN_QWASH: `${SkID}-pin-qwash`,
    PIN_REV: `${SkID}-pin-rev`,
    DIAL_PINROW: `${SkID}-dial-pinrow`,
    DIAL_PIN_DOTS: `${SkID}-dial-pin-dots`,
    DIAL_PIN_TITLES: `${SkID}-dial-pin-titles`,
    DIAL_PIN_SYMBOLS: `${SkID}-dial-pin-symbols`,
    COUNTER: `${SkID}-counter`,
    DIAL_UP: `${SkID}-dial-up`,
    DIAL_DOWN: `${SkID}-dial-down`,
    AUX_UP: `${SkID}-dial-up`,
    AUX_DOWN: `${SkID}-dial-down`,
  });

  const CLS_ = Object.freeze({
    ROOT: `cgxui-${SkID}-root`,
    MINIMAP: `cgxui-${SkID}-minimap`,
    COL: `cgxui-${SkID}-col`,
    TOGGLE: `cgxui-${SkID}-toggle`,
    DIAL: `cgxui-${SkID}-aux`,
    AUX: `cgxui-${SkID}-aux`,
    COUNT: `cgxui-${SkID}-count`,
    COUNTER: `cgxui-${SkID}-counter`,
    WASH_WRAP: `cgxui-${SkID}-wash-wrap`,
    WASH_PREFIX: `cgxui-${SkID}-wash-`,
    FLASH: `cgxui-${SkID}-flash`,
  });

  const COLORS = [
    { name: 'blue', color: '#3A8BFF' },
    { name: 'red', color: '#FF4A4A' },
    { name: 'green', color: '#31D158' },
    { name: 'gold', color: '#FFD700' },
    { name: 'sky', color: '#4CD3FF' },
    { name: 'pink', color: '#FF71C6' },
    { name: 'purple', color: '#A36BFF' },
    { name: 'orange', color: '#FFA63A' }
  ];
function CSS_MM_text() {
  const selScoped = (ui) => `[${ATTR_.CGXUI}="${ui}"][${ATTR_.CGXUI_OWNER}="${SkID}"]`;

  const S_ROOT       = selScoped(UI_.ROOT);
  const S_MINIMAP     = selScoped(UI_.MINIMAP);
  const S_COL         = selScoped(UI_.COL);
  const S_TOGGLE      = selScoped(UI_.TOGGLE);
  const S_DIAL        = selScoped(UI_.DIAL);

  const S_BTN         = selScoped(UI_.BTN);
  const S_DOTROW      = selScoped(UI_.DOTROW);
  const S_WRAP        = selScoped(UI_.WRAP);
  const S_COUNTER     = selScoped(UI_.COUNTER);
  const S_PINROW      = selScoped(UI_.PINROW);
  const S_PIN_QUOTE   = selScoped(UI_.PIN_QUOTE);
  const S_PIN_QWASH   = selScoped(UI_.PIN_QWASH);
  const S_PIN_REV     = selScoped(UI_.PIN_REV);
  const S_DIAL_PINROW = selScoped(UI_.DIAL_PINROW);
  const S_DIAL_PIN_DOTS = selScoped(UI_.DIAL_PIN_DOTS);
  const S_DIAL_PIN_TITLES = selScoped(UI_.DIAL_PIN_TITLES);
  const S_DIAL_PIN_SYMBOLS = selScoped(UI_.DIAL_PIN_SYMBOLS);

  const S_DIAL_UP      = selScoped(UI_.DIAL_UP);
  const S_DIAL_DOWN    = selScoped(UI_.DIAL_DOWN);

  const S_COUNT     = selScoped(UI_.COUNT);

  const base = `

:root {
  --cgxui-mnmp-flash-peak: 0.06;
  --cgxui-mnmp-flash-ms:   2200ms;
  --cgxui-mnmp-flash-ease: ease-in-out;
  --cgxui-mnmp-btn-width: 40px;
  --cgxui-mnmp-btn-height: 20px;
  --cgxui-mnmp-minimap-top: 92px;
}

${S_ROOT}{
  position: fixed !important;

  --root-top: 60px;
  --root-right: 5px; /* default anchor: near right edge but safely inside */
  top: var(--root-top);
  right: var(--root-right);

  /* Keep axis stable */
  z-index: 2147483647 !important;
  width: var(--box-w);

  display: flex;
  flex-direction: column;
  align-items: center;

  /* Stack spacing */
  --stack-gap: 0px;         /* your base */
  --stack-trim: 1px;        /* use this to nudge BOTH gaps equally */

  gap: var(--stack-gap);

  /* Root padding / bleed safety */
  --root-pad-right: 0px;
  --root-pad-bottom: 20px;
  padding-right: var(--root-pad-right);
  padding-bottom: var(--root-pad-bottom);

  overflow: visible !important;

  --box-w: 72px;
  --box-h: 36px;
  --box-r: 8px;

  --axis-x: 0px;
  --axis-y: 0px; /* moves toggle + minimap + dial together */
  --mm-center-fix-x: 0px;

  --mm-x: 0px;
  --mm-y:  calc(-1 * var(--stack-trim));
  --toggle-x: var(--mm-x);
  --toggle-y: calc(-1 * var(--stack-trim));

  /* MiniMap max-height formula control */
  --mm-max-vh: 60vh;
  --mm-max-sub: 140px; /* calc(100vh - this) */
  /* Used later as: max-height: min(var(--mm-max-vh), calc(100vh - var(--mm-max-sub))); */

  --mm-pad-r: 6px;      /* right padding */
  --mm-edge-gap: 6px;   /* keep top/bottom MiniMap edge spacing symmetrical */
  --mm-pad-t: var(--mm-edge-gap);
  --mm-pad-b: var(--mm-edge-gap);

  /* dot gutter reserved INSIDE minimap on left */
  --mm-dot-gutter: 28px;

  /* dot gap between dots and button */
  --mm-dot-gap: 10px;

  --mm-dot-x: calc(-2 * (var(--mm-dot-gutter) - var(--mm-dot-gap)));
  --mm-side-lane: calc(var(--mm-pad-r) + var(--mm-dot-gutter));
  --mm-gutter-w: 16px;
  --mm-gutter-sym-size: 12px;
  --mm-gutter-outset: 4px;
  --mm-gutter-sym-shift-x: 0.5px;
  --mm-w: calc(var(--mm-btn-w) + (2 * var(--mm-side-lane)));

  /* dot size + grid spacing */
  --mm-dot-size: 5px;
  --mm-dot-col-gap: 3px;
  --mm-dot-row-gap: 3px;
  --mm-dot-cols: 4;

  --mm-btn-w: 56px;
  --mm-btn-h: 24px;
  --mm-btn-r: 6px;

  /* Button baseline visuals */
  --mm-btn-border: 1px solid rgba(255,255,255,0.22);
  --mm-btn-bg: rgba(255,255,255,0.05);
  --mm-btn-bg-hover: rgba(255,255,255,0.08);
  --mm-btn-bg-active: rgba(255,255,255,0.12);
  --mm-btn-opacity: 0.5;

  --mm-btn-shadow-inset: inset 0 0 0 1px rgba(255,255,255,0.12);
  --mm-btn-shadow-hover: inset 0 0 0 1px rgba(255,255,255,0.22), 0 4px 10px rgba(0,0,0,0.30);
  --mm-btn-shadow-active:
    inset 0 0 0 1px rgba(255,255,255,0.18),
    0 0 0 1px rgba(255,215,0,0.85),
    0 0 10px rgba(255,215,0,0.25),
    0 0 6px 2px rgba(255,215,0,0.30);

  /* Button transitions */
  --mm-btn-trans-delay: 0.1s;
  --mm-btn-trans:
    background 0.45s ease-in-out,
    box-shadow 0.45s ease-in-out,
    color 0.5s ease,
    filter 0.4s ease,
    opacity 0.6s ease;

  --mm-flash-opacity: 0.25;
  --mm-flash-ms: 3500ms;
  --mm-flash-shadow: 0 0 4px rgba(255,215,0,0.65), inset 0 0 2px rgba(255,215,0,0.5);

  --mm-fade-a: 80px;
  --mm-fade-b: 55px;
  --mm-fade-c: 25px;
  --mm-fade-o1: 0.75;
  --mm-fade-o2: 0.45;
  --mm-fade-o3: 0.25;

  --toggle-bg: rgba(255,255,255,0.035);
  --toggle-shadow: inset 0 0 2px rgba(255,255,255,0.03), 0 2px 4px rgba(0,0,0,0.2);
  --toggle-shadow-hover: inset 0 1px 1px rgba(255,255,255,0.07), 0 3px 6px rgba(255,215,0,0.2);
  --toggle-text: rgba(255,255,255,0.4);
  --toggle-faded: 0.15;
  --toggle-faded-hover: 0.55;

  /* Modern UI typography for toggle + minimap numbers */
  --ui-font-modern: "SF Pro Display", "Inter Variable", "Inter", "Segoe UI Variable Text", "Aptos", "Helvetica Neue", Arial, sans-serif;
  --ui-font-numeric: "SF Pro Rounded", "SF Pro Display", "Inter Variable", "Inter", "Segoe UI Variable Text", "Aptos", "Helvetica Neue", Arial, sans-serif;

  --dial-x: var(--mm-x);
  --dial-y: calc(-1 * var(--stack-trim));
  --dial-inner-gap: 6px;
  --dial-inner-pad-x: 0px;
  --dial-slide-y: 0px;
  --dial-slide-y-hidden: 0px;
  --dial-fade-in-ms: 360ms;
  --dial-fade-out-ms: 920ms;
  --dial-fade-in-ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  --dial-fade-out-ease: cubic-bezier(0.16, 1, 0.3, 1);
  --dial-fade-ms: var(--dial-fade-in-ms);
  --dial-fade-ease: var(--dial-fade-in-ease);

  --mm-scrollbar-w: 6px;
  --mm-scrollbar-thumb: #666;
  --mm-scrollbar-thumb-r: 4px;
  --mm-scrollbar-thumb-opacity: 0.5;
  --mm-scrollbar-thumb-opacity-hover: 1;

  /* Interaction rule */
  pointer-events: auto;
}
${S_ROOT} > * { pointer-events: auto; }
${S_ROOT}, ${S_MINIMAP} {
  transition: opacity 150ms ease !important;
}
${S_ROOT}.${PRELAYOUT_CLASS},
${S_MINIMAP}.${PRELAYOUT_CLASS} {
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Theme tint only (Section 8 owns geometry/background/border) */

${S_BTN} {
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}

:root.dark ${S_BTN} { color: #ccc; }
:root.light ${S_BTN} { color: #333; }

@media (prefers-reduced-motion: reduce) {
  :root { --cgxui-mnmp-flash-ms: 800ms; }
}

/* Allow answer content to host wash/flash overlays */
[${ATTR_.MSG_ROLE}="assistant"] .markdown {
  position: relative;
}

/* Host element for wash + temporary flash */
.${CLS_.WASH_WRAP} {
  position: relative;
  z-index: 0;
}

/* One ::before rule per color (e.g. .cgxui-mnmp-wash-red::before) */
${COLORS.map(({ name, color }) => `
  .${CLS_.WASH_PREFIX}${name}::before {
    content: '';
    position: absolute;

    /* Extend wash above + below full answer block */
    top: -25px;
    bottom: -50px;

    /* Overflow horizontally across full viewport width */
    left: -100vw;
    right: -100vw;

    z-index: -1;              /* behind text */
    pointer-events: none;

    background: color-mix(in srgb, ${color} 50%, transparent);
    opacity: 0.08;            /* soft matte wash */
  }
`).join('')}

@keyframes cgxui-mnmp-flash-fade {
  0%   { opacity: 0; }
  25%  { opacity: var(--cgxui-mnmp-flash-peak); }
  75%  { opacity: var(--cgxui-mnmp-flash-peak); }
  100% { opacity: 0; }
}

.${CLS_.WASH_WRAP}.${CLS_.FLASH}::after,
.${CLS_.WASH_WRAP}[${ATTR_.CGXUI_FLASH}="1"]::after {
  content: '';
  position: absolute;
  top: -25px;               /* align with wash/wash background */
  bottom: -50px;            /* align height with wash overlay */
  left: -100vw;
  right: -100vw;

  background: color-mix(in srgb, gold 60%, transparent);
  box-shadow: 0 0 22px rgba(255, 215, 0, 0.35); /* soft glow halo */
  opacity: 0;
  z-index: 0;
  pointer-events: auto;
  border-radius: 12px;
  animation: cgxui-mnmp-flash-fade 1.6s ease-in-out;
}

/* Legacy keyframe (kept for compatibility if referenced anywhere else) */
@keyframes h2oFlashFade {
  0%   { opacity: 0.9; }
  40%  { opacity: 0.5; }
  100% { opacity: 0; }
}

/* Message index label (if used as message number) */
.chatgpt-timestamp.msg-number {
  font-size: 14.5px;
  font-weight: 500;
  color: rgba(255, 215, 0, 0.7);      /* matte gold */
  margin-left: 8px;
  text-shadow: 0 0 1px rgba(255, 215, 0, 0.15);
}

@keyframes cgxui-mnmp-soft-fade {
  0%   { opacity: 0.14; }
  20%  { opacity: 0.12; }
  40%  { opacity: 0.09; }
  60%  { opacity: 0.06; }
  80%  { opacity: 0.03; }
  90%  { opacity: 0.015; }
  96%  { opacity: 0.007; }
  100% { opacity: 0.0001; }
}

/* Collapsed state (toggle OFF): fade out + block interaction */
${S_MINIMAP}[${ATTR_.CGXUI_STATE}~="collapsed"] {
  opacity: 0;
  visibility: hidden;
  pointer-events: none !important;
  height: 0 !important;
  min-height: 0 !important;
  max-height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  border-width: 0 !important;
  overflow: hidden !important;
  z-index: 2147483646 !important;  /* keep toggle above */
}

${S_MINIMAP}[${ATTR_.CGXUI_STATE}~="collapsed"] *,
${S_MINIMAP}[${ATTR_.CGXUI_STATE}~="collapsed"]::before,
${S_MINIMAP}[${ATTR_.CGXUI_STATE}~="collapsed"]::after {
  pointer-events: none !important;
}

/* Collapsed state (toggle OFF): Dial follows MiniMap */
${S_DIAL}[${ATTR_.CGXUI_STATE}~="collapsed"] {
  opacity: 0;
  pointer-events: none;
  --dial-fade-ms: var(--dial-fade-out-ms);
  --dial-fade-ease: var(--dial-fade-out-ease);
  --dial-slide-y: var(--dial-slide-y-hidden);
}

${S_DIAL}:not([${ATTR_.CGXUI_STATE}~="collapsed"]) {
  opacity: 1 !important;
  pointer-events: auto;
  --dial-fade-ms: var(--dial-fade-in-ms);
  --dial-fade-ease: var(--dial-fade-in-ease);
  --dial-slide-y: 0px;
  transform: translate(
    calc(var(--axis-x, 0px) + var(--dial-x, 0px)),
    calc(var(--axis-y, 0px) + var(--dial-y, 0px) + var(--dial-slide-y, 0px))
  ) !important;
}

/* Collapsed state (toggle OFF): hide Dial too (same behavior as minimap) */
${S_ROOT} ${S_MINIMAP}[${ATTR_.CGXUI_STATE}~="collapsed"] ~ ${S_DIAL} {
  opacity: 0 !important;
  pointer-events: none !important;
  --dial-fade-ms: var(--dial-fade-out-ms);
  --dial-fade-ease: var(--dial-fade-out-ease);
  --dial-slide-y: var(--dial-slide-y-hidden);
}

/* Collapsed state (toggle OFF): hide Dial too (order-independent) */
${S_DIAL}[${ATTR_.CGXUI_STATE}~="collapsed"],
${S_ROOT}[${ATTR_.CGXUI_STATE}~="collapsed"] ${S_DIAL} {
  opacity: 0 !important;
  pointer-events: none !important;
  --dial-fade-ms: var(--dial-fade-out-ms);
  --dial-fade-ease: var(--dial-fade-out-ease);
  --dial-slide-y: var(--dial-slide-y-hidden);
}

${S_MINIMAP}{
  position: relative !important;
  order: 1;

  /* in-flow (no fixed) */
  top: auto !important;
  right: auto !important;

  /* center under stack axis */
  left: auto !important;
  transform: translate(
    calc(var(--axis-x) + var(--mm-x)),
    calc(var(--axis-y) + var(--mm-y))
  ) !important;

  /* width of the whole minimap "track" (btns + dots area via padding-left gutter) */
  width: var(--mm-w) !important;
  min-width: var(--mm-w) !important;

  /* scroll behavior */
  height: auto !important;

  max-height: min(var(--mm-max-vh), calc(100vh - var(--mm-max-sub))) !important;

  overflow-y: auto !important;
  overflow-x: visible !important;

  /* box model */
  margin: 0 !important;
  box-sizing: border-box !important;
  scrollbar-gutter: stable both-edges;

  padding-left:  var(--mm-side-lane) !important;
  padding-right: var(--mm-side-lane) !important;

  padding-bottom: var(--mm-pad-b) !important;
  scroll-padding-bottom: var(--mm-pad-b);
  padding-top: var(--mm-pad-t, 8px) !important;
  scroll-padding-top: var(--mm-pad-t, 8px) !important;

-webkit-mask-image: linear-gradient(to bottom,
  rgba(0,0,0,1) 0%,                                               /* keep = full visibility at top */
  rgba(0,0,0,1) calc(100% - var(--mm-fade-a)),                   /* 👈👈👈  ↑ Num. → fade starts higher (stronger) */
  rgba(0,0,0,var(--mm-fade-o1)) calc(100% - var(--mm-fade-b)),   /* 👈👈👈  ↓ Opacity → fade stronger earlier */
  rgba(0,0,0,var(--mm-fade-o2)) calc(100% - var(--mm-fade-c)),   /* 👈👈👈  ↑ Num. → longer ramp (smoother) */
  rgba(0,0,0,var(--mm-fade-o3)) 100%                             /* 👈👈👈  ↑ Final opacity → fade weaker (more visible) */
);
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;

  mask-image: linear-gradient(to bottom,
    rgba(0,0,0,1) 0%,
    rgba(0,0,0,1) calc(100% - 80px),
    rgba(0,0,0,0.75) calc(100% - 55px),
    rgba(0,0,0,0.45) calc(100% - 25px),
    rgba(0,0,0,0.25) 100%
  );
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
}

/* Scrollbar styling (invisible, but scrolling still works) */ /* 👈👈👈 */
${S_MINIMAP}{
  scrollbar-width: none;        /* Firefox */
  -ms-overflow-style: none;     /* old Edge/IE */
}
${S_MINIMAP}::-webkit-scrollbar{
  width: 0 !important;          /* Chrome/Safari/Opera */
  height: 0 !important;
}
${S_MINIMAP}::-webkit-scrollbar-thumb{
  background: transparent !important;
}
${S_MINIMAP}::-webkit-scrollbar-track{
  background: transparent !important;
}

/* Inner column for MiniMap buttons */
${S_COL} {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;  /* center each row inside the 72px strip */
}

${S_TOGGLE}{
  /* --- Stack layout (authoritative) --- */
  position: relative !important;
  order: 0;
  top: auto !important;
  right: auto !important;
  left: auto !important;
  transform: translate(
    calc(var(--axis-x, 0px) + var(--toggle-x, var(--mm-x, 0px))),
    calc(var(--axis-y, 0px) + var(--toggle-y, 0px))
  ) !important;
  margin: 0 !important;
  align-self: center !important;
  z-index: 2147483647 !important;

  width: var(--box-w) !important;
  height: var(--box-h) !important;
  border-radius: var(--box-r) !important;
  padding: 0 !important;
  box-sizing: border-box !important;

  /* --- Look & feel (preserved from fixed version) --- */
  background: rgba(255, 255, 255, 0.035);
  box-shadow:
    inset 0 0 2px rgba(255,255,255,0.03),
    0 2px 4px rgba(0,0,0,0.2);

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  cursor: pointer;
  user-select: none;

  transition: all 0.2s ease;

  font: 500 13px/1 var(--ui-font-modern);
  font-variant-numeric: tabular-nums lining-nums;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.2px;
  text-shadow: 0 0 2px rgba(0,0,0,0.2);
}

${S_TOGGLE}:hover {
  filter: brightness(1.15);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.07),
    0 3px 6px rgba(255, 215, 0, 0.2);
}

${S_TOGGLE}[${ATTR_.CGXUI_STATE}~="faded"] {
  opacity: 0.15;
  transition: all 0.2s ease;
}
${S_TOGGLE}[${ATTR_.CGXUI_STATE}~="faded"]:hover {
  opacity: 0.55;
}

/* Inner counter text on toggle */
${S_COUNT} {
  position: absolute;
  left: 50%;
  top: 8px;
  transform: translateX(-50%);
  font-family: var(--ui-font-numeric);
  font-weight: 520;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  letter-spacing: 0.015em;
  color: rgba(243,245,251,0.94);
  margin: 0;
  padding: 0;
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  white-space: nowrap;
  -webkit-font-smoothing: antialiased;
  pointer-events: none;
}

${S_PINROW} {
  position: absolute;
  left: 50%;
  bottom: 3px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% - 14px);
  pointer-events: auto;
}

${S_DIAL_PINROW} {
  position: absolute;
  top: 3px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 7px;
  pointer-events: auto;
  z-index: 2;
}

${S_PIN_QUOTE}, ${S_PIN_QWASH}, ${S_PIN_REV}, ${S_DIAL_PIN_DOTS}, ${S_DIAL_PIN_TITLES}, ${S_DIAL_PIN_SYMBOLS} {
  width: 7px;
  height: 7px;
  min-width: 7px;
  min-height: 7px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,0.24);
  color: rgba(255,255,255,0.58);
  box-shadow: none;
  font: 700 8px/1 var(--ui-font-modern);
  display: grid;
  place-items: center;
  cursor: pointer;
  opacity: 0.66;
  transition: opacity 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

${S_PIN_QUOTE}:hover, ${S_PIN_QWASH}:hover, ${S_PIN_REV}:hover, ${S_DIAL_PIN_DOTS}:hover, ${S_DIAL_PIN_TITLES}:hover, ${S_DIAL_PIN_SYMBOLS}:hover {
  opacity: 0.9;
  background: rgba(255,255,255,0.35);
}

${S_PIN_QUOTE}.is-off, ${S_PIN_QWASH}.is-off, ${S_PIN_REV}.is-off, ${S_DIAL_PIN_DOTS}.is-off, ${S_DIAL_PIN_TITLES}.is-off, ${S_DIAL_PIN_SYMBOLS}.is-off {
  opacity: 0.28;
  background: rgba(255,255,255,0.13);
}

${S_PIN_QUOTE}:focus-visible, ${S_PIN_QWASH}:focus-visible, ${S_PIN_REV}:focus-visible, ${S_DIAL_PIN_DOTS}:focus-visible, ${S_DIAL_PIN_TITLES}:focus-visible, ${S_DIAL_PIN_SYMBOLS}:focus-visible {
  outline: 1px solid rgba(255,215,0,0.45);
  outline-offset: 1px;
}

${S_ROOT}.cgx-mm-hide-quotes .cgxui-mm-qfrom,
${S_ROOT}.cgx-mm-hide-quotes .cgxui-mm-qto {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

${S_ROOT}.cgx-mm-hide-revs .cgxui-mm-qrev,
${S_ROOT}.cgx-mm-hide-revs .cgxui-mm-arev {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

${S_ROOT}.cgx-mm-hide-dots ${S_DOTROW} {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

${S_ROOT}.cgx-mm-hide-symbols .cgxui-mm-gutter,
${S_ROOT}.cgx-mm-hide-symbols .cgxui-mm-gutterSym {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Bottom Dial button */
${S_DIAL}{
  position: relative !important;
  order: 2;

  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 var(--dial-inner-pad-x, 0px) !important;
  gap: var(--dial-inner-gap, 6px) !important;
  opacity: 1 !important;
  z-index: 2147483647 !important;

  top: auto !important;
  right: auto !important;

  left: auto !important;
  transform: translate(
    calc(var(--axis-x, 0px) + var(--dial-x, 0px)),
    calc(var(--axis-y, 0px) + var(--dial-y, 0px) + var(--dial-slide-y, 0px))
  ) !important;

  transition:
    opacity var(--dial-fade-ms, 360ms) var(--dial-fade-ease, cubic-bezier(0.22, 0.61, 0.36, 1)),
    transform 180ms ease-out,
    filter 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;

  width: var(--box-w) !important;
  height: var(--box-h) !important;
  border-radius: var(--box-r) !important;

  flex: 0 0 auto !important;
  min-width: 0 !important;

  margin: 0 !important;
  box-sizing: border-box !important;

  background: var(--toggle-bg);
  box-shadow: var(--toggle-shadow);

  cursor: pointer;
  user-select: none;

  pointer-events: auto;
}

${S_DIAL}:hover {
  filter: brightness(1.15);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.07),
    0 3px 6px rgba(255, 215, 0, 0.2);
}

${S_DIAL}:active {
  filter: brightness(1.15);
  box-shadow:
    inset 0 1px 1px rgba(255, 255, 255, 0.07),
    0 3px 6px rgba(255, 215, 0, 0.2);
}

/* Keep vertical control stack order deterministic even if external CSS touches order */
${S_ROOT} > ${S_TOGGLE} { order: 0 !important; }
${S_ROOT} > ${S_MINIMAP} { order: 1 !important; }
${S_ROOT} > ${S_DIAL} { order: 2 !important; }

${S_TOGGLE}, ${S_DIAL}{
  width: var(--box-w) !important;
  height: var(--box-h) !important;
  border-radius: var(--box-r) !important;

  box-sizing: border-box !important;
  border: 0 !important;
  line-height: normal !important;

  flex: 0 0 auto !important;
  min-width: 0 !important;
}

${S_DIAL_UP}, ${S_DIAL_DOWN}{
  width: 20px;
  height: 20px;
  border-radius: 8px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.16);

  display: grid;
  place-items: center;

  cursor: pointer;
  pointer-events: auto;
  user-select: none;

  opacity: 0.55;
  transition: opacity 0.18s ease, filter 0.18s ease, transform 0.18s ease, border-color 0.18s ease;
  margin: 1px 0 0 !important;

  position: relative;
  top: 2px;   /* increase to 2px if needed */

  flex: 0 0 auto;
}

/* Sleek chevrons */
${S_DIAL_UP} svg,
${S_DIAL_DOWN} svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: rgba(255,255,255,0.68);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 0 1px rgba(0,0,0,0.35));
}

${S_DIAL_UP}:hover,
${S_DIAL_DOWN}:hover {
  opacity: 0.9;
  filter: brightness(1.15);
  border-color: rgba(255,215,0,0.32);
}

${S_DIAL_UP}:active,
${S_DIAL_DOWN}:active {
  transform: translateY(0.5px);
}

${S_DIAL_UP}:hover, ${S_DIAL_DOWN}:hover{
  filter: brightness(1.18);
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.85);
}

${S_DIAL_UP}:active, ${S_DIAL_DOWN}:active{
  filter: brightness(1.05);
  background: rgba(255,255,255,0.09);
}

/* MiniMap Button — unified (was split into “fill wrapper” + “geometry”).
   Think of it like: ONE canonical button style that contains BOTH:
   - layout/flex centering + user-select + baseline inset border (old 100%/100% block)
   - final geometry (56×24), transitions, opacity, and premium feel (old fixed-size block)
*/

${S_BTN}{
  /* --- Core geometry (authoritative) --- */
  width: var(--mm-btn-w) !important;
  height: var(--mm-btn-h) !important;

  /* Kill any legacy shove */
  margin-left: 0 !important;
  margin-right: 0 !important;

  /* --- Layout / interaction --- */
  display: flex;
  align-items: center;
  justify-content: center;

  position: relative !important;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  overflow: visible;
  box-sizing: border-box;

  /* --- Typography --- */
  font-size: 12px;
  line-height: 1;
  font-family: var(--ui-font-numeric);
  font-weight: 460;
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: "tnum" 1, "lnum" 1;
  letter-spacing: 0.02em;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;

  /* --- Visual baseline --- */
  border-radius: var(--mm-btn-r);
  border: var(--mm-btn-border);

  background: var(--mm-btn-bg);
  opacity: var(--mm-btn-opacity);
  box-shadow: var(--mm-btn-shadow-inset);

  color: #e5e7eb !important;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.25);

  /* --- Motion/perf --- */
  transition: var(--mm-btn-trans);
  transition-delay: var(--mm-btn-trans-delay);

  contain: paint;
  will-change: opacity, transform;

  -webkit-tap-highlight-color: transparent;

}

/* Hover: keep both old hover looks (rim + lift) */
${S_BTN}:hover{
  color: white;
  background: var(--mm-btn-bg-hover);
  box-shadow: var(--mm-btn-shadow-hover);
}

/* Active: merge both active glows */
${S_BTN}[${ATTR_.CGXUI_STATE}~="active"]{
  background: var(--mm-btn-bg-active);
  box-shadow: var(--mm-btn-shadow-active);
}

${S_DOTROW} {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  align-items: center;
  justify-items: center;
  pointer-events: auto;
  z-index: 10;
  box-sizing: content-box;
  contain: paint;

  grid-template-columns: repeat(var(--mm-dot-cols), var(--mm-dot-size));
  grid-auto-rows: var(--mm-dot-size);
  column-gap: var(--mm-dot-col-gap);
  row-gap: var(--mm-dot-row-gap);
  left: var(--mm-dot-x) !important;
}

${S_BTN}[${ATTR_.CGXUI_FLASH}="1"]::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 6px;
  background: color-mix(in srgb, gold 80%, transparent);
  opacity: 0.25;
  animation: cgxui-mnmp-soft-fade 3.5s ease-in-out;
  pointer-events: none;
  z-index: 1;
  box-shadow:
    0 0 4px rgba(255, 215, 0, 0.65),
    inset 0 0 2px rgba(255, 215, 0, 0.5);
}

${S_BTN}[${ATTR_.CGXUI_INVIEW}="1"] {
  position: relative;
  z-index: 3;
  background: color-mix(in srgb, currentColor 25%, rgba(0, 0, 0, 0.8));
  outline: 1.5px solid rgba(255, 215, 0, 0.38);
  outline-offset: 1.5px;
  box-shadow:
    0 0 4px 1px rgba(255, 215, 0, 0.2),
    0 0 10px 4px rgba(255, 215, 0, 0.12);
  filter: brightness(0.85);
  opacity: 1 !important;
  transition:
    outline 0.3s ease,
    box-shadow 0.3s ease,
    filter 0.3s ease,
    background 0.3s ease;
}

${S_BTN}[${ATTR_.CGXUI_STATE}~="noanswer"]{
}

${S_BTN}[${ATTR_.CGXUI_STATE}~="noanswer"] .cgxui-mm-num{
  opacity: 0.26;
  animation: cgxui-mnmp-noanswer-num-breathe 2.8s ease-in-out infinite;
}

${S_BTN} .cgxui-mm-num{
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-block; /* keeps opacity animation behavior */
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0 !important;
  border-radius: 0;
  box-shadow: none;
  outline: none;
  pointer-events: none;
}

@keyframes cgxui-mnmp-noanswer-num-breathe{
  0%   { opacity: 0.18; }
  50%  { opacity: 0.34; }
  100% { opacity: 0.18; }
}

${S_BTN}[${ATTR_.CGXUI_STATE}~="rev"]::before{
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 6px;
  pointer-events: none;
  z-index: 2;

  background: repeating-linear-gradient(
    135deg,
    rgba(255,255,255,0.18) 0px,
    rgba(255,255,255,0.18) 5px,
    rgba(255,255,255,0.05) 5px,
    rgba(255,255,255,0.05) 10px
  );

  /* tiny rim so the pattern reads even on low-contrast themes */
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10);

  opacity: 0.42;
}
${S_BTN}[${ATTR_.CGXUI_STATE}~="rev"][${ATTR_.CGXUI_STATE}~="active"]::before,
${S_BTN}[${ATTR_.CGXUI_STATE}~="rev"][${ATTR_.CGXUI_INVIEW}="1"]::before{
  opacity: 0.60;
}

${S_BTN}:focus,
${S_BTN}:focus-visible {
  outline: none !important;
  box-shadow: none;
}

/* Keep your active glow even if the button is focused */
${S_BTN}[${ATTR_.CGXUI_STATE}~="active"]:focus,
${S_BTN}[${ATTR_.CGXUI_STATE}~="active"]:focus-visible {
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.18),
    0 0 0 1px rgba(255, 215, 0, 0.85),
    0 0 8px rgba(255, 215, 0, 0.35) !important;
}

/* per-item wrap that contains btn + dots */
${S_WRAP}{
  width: 100% !important;
  height: var(--mm-btn-h, 24px) !important; /* fallback */

  display: flex !important;
  align-items: center !important;

  justify-content: center !important;

  flex: 0 0 auto !important;
  min-width: 0 !important;
  box-sizing: border-box !important;        /* lock */

  /* IMPORTANT:
     Your S_MINIMAP already reserves dot gutter using padding-left.
     So WRAP can simply be 100% and "center" correctly.
  */
  position: relative !important; /* anchor for dotrow */
  overflow: visible !important;
  color: #e5e7eb;       /* text color for the number inside the box */
}

${S_WRAP} .cgxui-mm-gutter{
  position: absolute !important;
  top: 50% !important;
  left: calc(50% + (var(--mm-btn-w, 56px) / 2) + var(--mm-gutter-outset, 4px)) !important;
  right: auto !important;
  transform: translateY(-50%) !important;
  width: var(--mm-gutter-w, 16px) !important;
  height: var(--mm-btn-h, 24px) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
  user-select: none !important;
  z-index: 11 !important;
}

${S_WRAP} .cgxui-mm-gutterSym{
  font-size: var(--mm-gutter-sym-size, 12px) !important;
  font-family: var(--ui-font-modern) !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  opacity: 0.88;
  transform: translateX(var(--mm-gutter-sym-shift-x, 0.5px)) scale(0.85);
  transform-origin: 50% 50%;
  text-shadow: 0 1px 2px rgba(0,0,0,0.35);
  pointer-events: none !important;
}

${S_WRAP} .cgxui-mm-gutter:not([data-has-symbol="1"]) .cgxui-mm-gutterSym{
  opacity: 0 !important;
}

${S_COUNTER} {
  position: fixed;
  z-index: ${typeof Z !== 'undefined' ? Z : 2147483647};
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-family: monospace;
  color: #fff;
  background: rgba(0,0,0,0.75);
  box-shadow: 0 0 6px rgba(0,0,0,0.3);
  pointer-events: none;
  transition: transform .1s ease-out, opacity .15s ease-out;
  opacity: .95;
  display: none
}

${S_COUNTER}[${ATTR_.CGXUI_STATE}~="show"] { display: block !important; }

${S_MINIMAP} .cgxui-save-md::before,
${S_MINIMAP} .cgxui-save-md::after,
${S_MINIMAP} .cgxui-inline-hl::before,
${S_MINIMAP} .cgxui-inline-hl::after,
${S_MINIMAP} .cgxui-under-ui::before,
${S_MINIMAP} .cgxui-under-ui::after {
  content: none !important;
  background: none !important;
  box-shadow: none !important;
}

/* (moved) 🔢 Revision Badges CSS → 1a.🔴🔁 Revision Badges (MiniMap Plugin) */
  `;
  return base;
}
  const state = {
    retries: 0,
    mounting: false,
    booted: false,
    bootHoldMO: null,
    bootHoldTimer: null,
    alignMO: null,
    alignRaf: 0,
    alignResizeBound: false,
    bootCollapseApplied: false,
    bootCollapseSig: '',
    routeSig: '',
    routeRaf: 0,
    routeBound: false,
    routeReason: '',
    prelayoutSig: '',
    prelayoutDone: false,
    prelayoutRaf1: 0,
    prelayoutRaf2: 0,
    prelayoutFailsafeTimer: null,
    prelayoutLastBtnCount: -1,
    prelayoutStableTicks: 0,
    prelayoutStartedAt: 0,
    quickReady: !!TOPW.H2O_MM_QUICK_READY,
    behaviorHooked: false,
    off: [],
    badgeVisibility: {
      loaded: false,
      quotes: true,
      qwash: true,
      revisions: true,
    },
    dialVisibility: {
      loaded: false,
      dots: true,
      symbols: true,
    },
    dialHeight: {
      loaded: false,
      step: 0,
      dir: 1,
      basePx: null,
      baseVh: null,
    },
  };

  function log(...args) { try { console.log('[MiniMap Shell]', ...args); } catch {} }
  function warn(...args) { try { console.warn('[MiniMap Shell]', ...args); } catch {} }

  function getSharedRefs() {
    try { return TOPW.H2O_MM_SHARED?.get?.() || null; } catch { return null; }
  }

  function getRefs() {
    const root = document.querySelector(SEL.ROOT);
    const panel = document.querySelector(SEL.PANEL);
    const toggle = document.querySelector(SEL.TOGGLE);
    const dial = document.querySelector(SEL.DIAL);
    const col = panel?.querySelector?.(`[${ATTR.CGXUI}="${UI_.COL}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const counter = document.querySelector(`[${ATTR.CGXUI}="${UI_.COUNTER}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const count = toggle?.querySelector?.(`[${ATTR.CGXUI}="${UI_.COUNT}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const pinQuote = toggle?.querySelector?.(`[${ATTR.CGXUI}="${UI_.PIN_QUOTE}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const pinQwash = toggle?.querySelector?.(`[${ATTR.CGXUI}="${UI_.PIN_QWASH}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const pinRev = toggle?.querySelector?.(`[${ATTR.CGXUI}="${UI_.PIN_REV}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const dialPinDots = dial?.querySelector?.(`[${ATTR.CGXUI}="${UI_.DIAL_PIN_DOTS}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const dialPinTitles = dial?.querySelector?.(`[${ATTR.CGXUI}="${UI_.DIAL_PIN_TITLES}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    const dialPinSymbols = dial?.querySelector?.(`[${ATTR.CGXUI}="${UI_.DIAL_PIN_SYMBOLS}"][${ATTR.CGXUI_OWNER}="${SkID}"]`) || null;
    // Keep a stable refs shape for all dependents.
    const scroller = col || panel || null;
    const list = col || null;
    return {
      root,
      panel,
      toggle,
      dial,
      aux: dial,
      col,
      counter,
      count,
      pinQuote,
      pinQwash,
      pinRev,
      dialPinDots,
      dialPinTitles,
      dialPinSymbols,
      scroller,
      list
    };
  }

  function stateHas(el, tok) {
    if (!el) return false;
    const cur = String(el.getAttribute(ATTR.CGXUI_STATE) || '').trim();
    if (!cur) return false;
    return cur.split(/\s+/).includes(String(tok));
  }

  function stateSet(el, tok, on) {
    if (!el) return;
    const cur = String(el.getAttribute(ATTR.CGXUI_STATE) || '').trim();
    const set = new Set(cur ? cur.split(/\s+/).filter(Boolean) : []);
    const key = String(tok);
    if (on) set.add(key); else set.delete(key);
    if (set.size) el.setAttribute(ATTR.CGXUI_STATE, Array.from(set).join(' '));
    else el.removeAttribute(ATTR.CGXUI_STATE);
  }

  function resolveChatId() {
    const fromCore = String(W?.H2O?.util?.getChatId?.() || '').trim();
    if (fromCore) return fromCore;
    const m = String(location.pathname || '').match(/\/(?:c|chat)\/([a-z0-9-]+)/i);
    return m ? String(m[1] || '').trim() : '';
  }

  function safeChatKeyPart(chatId = '') {
    return String(chatId || '').trim().replace(/[^a-z0-9_-]/gi, '_');
  }

  function keyCollapsedChat(chatId = '') {
    const safeId = safeChatKeyPart(chatId || resolveChatId());
    if (!safeId) return '';
    return `${nsDisk()}:${KEY_COLLAPSED_CHAT_SUFFIX}:${safeId}:v1`;
  }

  function readStoredRaw(key) {
    const k = String(key || '').trim();
    if (!k) return null;
    const storage = storageApi();
    if (storage && typeof storage.getStr === 'function') {
      return storage.getStr(k, null);
    }
    try { return localStorage.getItem(k); } catch { return null; }
  }

  function writeStoredRaw(key, val) {
    const k = String(key || '').trim();
    if (!k) return false;
    const v = String(val ?? '');
    const storage = storageApi();
    if (storage && typeof storage.setStr === 'function') {
      return !!storage.setStr(k, v);
    }
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  }

  function resolveCollapsedStored(chatId = '') {
    const byChatKey = keyCollapsedChat(chatId);
    if (byChatKey) {
      const chatRaw = readStoredRaw(byChatKey);
      if (chatRaw != null) {
        return { collapsed: parseStoredBool(chatRaw, DEFAULT_COLLAPSED_ON_BOOT), source: 'chat', key: byChatKey };
      }
    }
    const globalRaw = readStoredRaw(KEY_COLLAPSED);
    if (globalRaw != null) {
      return { collapsed: parseStoredBool(globalRaw, DEFAULT_COLLAPSED_ON_BOOT), source: 'global', key: KEY_COLLAPSED };
    }
    const legacyRaw = readStoredRaw(KEY_COLLAPSED_LEGACY);
    if (legacyRaw != null) {
      return { collapsed: parseStoredBool(legacyRaw, DEFAULT_COLLAPSED_ON_BOOT), source: 'legacy', key: KEY_COLLAPSED_LEGACY };
    }
    return { collapsed: !!DEFAULT_COLLAPSED_ON_BOOT, source: 'default', key: '' };
  }

  function getCollapsed(chatId = '') {
    return !!resolveCollapsedStored(chatId).collapsed;
  }

  function setCollapsed(on, opts = {}) {
    const collapsed = !!on;
    const refs = getRefs();
    stateSet(refs.panel, 'collapsed', collapsed);
    stateSet(refs.dial, 'collapsed', collapsed);
    stateSet(refs.toggle, 'faded', collapsed);

    const persist = opts?.persist !== false;
    if (!persist) return collapsed;

    const chatId = String(opts?.chatId || resolveChatId()).trim();
    const chatKey = keyCollapsedChat(chatId);
    const writeGlobal = opts?.writeGlobal === true;
    const val = collapsed ? '1' : '0';

    if (chatKey) writeStoredRaw(chatKey, val);
    if (writeGlobal) writeStoredRaw(KEY_COLLAPSED, val);
    return collapsed;
  }

  function collapsedSig(chatId = '') {
    const id = String(chatId || resolveChatId()).trim() || '__global__';
    return `${id}|${location.pathname}|${location.search}`;
  }

  function applyBootCollapsedDefault(reason = 'boot') {
    const chatId = resolveChatId();
    const sig = collapsedSig(chatId);
    if (state.bootCollapseApplied && state.bootCollapseSig === sig) return getCollapsed(chatId);
    state.bootCollapseApplied = true;
    state.bootCollapseSig = sig;
    const desired = getCollapsed(chatId);
    return setCollapsed(desired, { persist: false, writeGlobal: false, chatId, reason });
  }

  function storageApi() {
    try { return getSharedRefs()?.util?.storage || null; } catch { return null; }
  }

  function nsDisk() {
    const sh = getSharedRefs();
    try {
      const ns = sh?.util?.ns;
      if (ns && typeof ns.disk === 'function') return ns.disk('prm', 'cgx', 'mnmp');
    } catch {}
    return String(sh?.NS_DISK || 'h2o:prm:cgx:mnmp');
  }

  function keyBadgeQuotes() {
    return `${nsDisk()}:${KEY_BADGE_QUOTES_SUFFIX}`;
  }

  function keyBadgeRevs() {
    return `${nsDisk()}:${KEY_BADGE_REVS_SUFFIX}`;
  }

  function keyBadgeQwash() {
    return `${nsDisk()}:${KEY_BADGE_QWASH_SUFFIX}`;
  }

  function keyDialDotsVisibility() {
    return `${nsDisk()}:${KEY_DIAL_DOTS_VIS_SUFFIX}`;
  }

  function keyDialSymbolsVisibility() {
    return `${nsDisk()}:${KEY_DIAL_SYMBOLS_VIS_SUFFIX}`;
  }

  function keyDialHeightStep() {
    return `${nsDisk()}:${KEY_DIAL_HEIGHT_STEP_SUFFIX}`;
  }

  function keyDialHeightDir() {
    return `${nsDisk()}:${KEY_DIAL_HEIGHT_DIR_SUFFIX}`;
  }

  function keyAxisOffset() {
    return `${nsDisk()}:${KEY_AXIS_OFFSET_SUFFIX}`;
  }

  function keyCenterFixX() {
    return `${nsDisk()}:${KEY_CENTER_FIX_X_SUFFIX}`;
  }

  function parseStoredBool(raw, fallback = true) {
    if (raw == null) return !!fallback;
    const s = String(raw).trim().toLowerCase();
    if (s === '1' || s === 'true') return true;
    if (s === '0' || s === 'false') return false;
    return !!fallback;
  }

  function parseStoredInt(raw, fallback = 0, min = 0, max = 2) {
    const n = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    if (n < min) return min;
    if (n > max) return max;
    return n;
  }

  function readStoredBool(key, fallback = true) {
    const storage = storageApi();
    if (storage && typeof storage.getStr === 'function') {
      return parseStoredBool(storage.getStr(key, null), fallback);
    }
    try { return parseStoredBool(localStorage.getItem(key), fallback); } catch { return !!fallback; }
  }

  function writeStoredBool(key, on) {
    const val = on ? '1' : '0';
    const storage = storageApi();
    if (storage && typeof storage.setStr === 'function') {
      storage.setStr(key, val);
      return;
    }
    try { localStorage.setItem(key, val); } catch {}
  }

  function readStoredInt(key, fallback = 0, min = 0, max = 2) {
    const storage = storageApi();
    if (storage && typeof storage.getStr === 'function') {
      return parseStoredInt(storage.getStr(key, null), fallback, min, max);
    }
    try { return parseStoredInt(localStorage.getItem(key), fallback, min, max); } catch { return fallback; }
  }

  function writeStoredInt(key, n) {
    const val = String(Number.isFinite(n) ? Math.trunc(n) : 0);
    const storage = storageApi();
    if (storage && typeof storage.setStr === 'function') {
      storage.setStr(key, val);
      return;
    }
    try { localStorage.setItem(key, val); } catch {}
  }

  function readStoredJSON(key, fallback = null) {
    const storage = storageApi();
    if (storage && typeof storage.getJSON === 'function') {
      try {
        const v = storage.getJSON(key, null);
        return (v == null) ? fallback : v;
      } catch {}
    }
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return (parsed == null) ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function parseStoredPx(raw, fallback = 0) {
    const n = Number.parseFloat(String(raw ?? '').replace('px', '').trim());
    if (!Number.isFinite(n)) return Number.parseFloat(String(fallback || 0)) || 0;
    return n;
  }

  function readAxisOffset() {
    if (FORCE_AXIS_DEFAULT_EACH_LOAD) {
      return { x: AXIS_BOOT_DEFAULT_X, y: AXIS_BOOT_DEFAULT_Y };
    }
    const raw = readStoredJSON(keyAxisOffset(), null);
    return {
      x: Math.round(parseStoredPx(raw?.axisX, 0)),
      y: Math.round(parseStoredPx(raw?.axisY, 0)),
    };
  }

  function applyAxisOffsetFromDisk(root) {
    if (!root) return false;
    const axis = readAxisOffset();
    try { root.style.setProperty('--axis-x', `${axis.x}px`); } catch {}
    try { root.style.setProperty('--axis-y', `${axis.y}px`); } catch {}
    return true;
  }

  function readCenterFixX() {
    if (FORCE_CENTER_FIX_RESET_EACH_LOAD) return 0;
    const raw = readStoredRaw(keyCenterFixX());
    return Math.round(parseStoredPx(raw, 0));
  }

  function applyCenterFixFromDisk(root) {
    if (!root) return false;
    const x = readCenterFixX();
    try { root.style.setProperty('--mm-center-fix-x', `${x}px`); } catch {}
    return true;
  }

  function persistCenterFixX(x) {
    const v = Math.round(parseStoredPx(x, 0));
    writeStoredRaw(keyCenterFixX(), `${v}`);
    return v;
  }

  function loadBadgeVisibilityOnce() {
    if (state.badgeVisibility.loaded) return state.badgeVisibility;
    state.badgeVisibility.quotes = readStoredBool(keyBadgeQuotes(), true);
    state.badgeVisibility.qwash = readStoredBool(keyBadgeQwash(), true);
    state.badgeVisibility.revisions = readStoredBool(keyBadgeRevs(), true);
    state.badgeVisibility.loaded = true;
    return state.badgeVisibility;
  }

  function emitBadgeVisibility(kind, on) {
    const detail = {
      kind: String(kind || ''),
      on: !!on,
      visibility: {
        quotes: state.badgeVisibility.quotes !== false,
        qwash: state.badgeVisibility.qwash !== false,
        revisions: state.badgeVisibility.revisions !== false,
      }
    };
    try { W.dispatchEvent(new CustomEvent(EV_BADGE_VISIBILITY, { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:minimap:badge-visibility', { detail })); } catch {}
  }

  function resolveDialBasePx(root) {
    if (Number.isFinite(state.dialHeight.basePx) && state.dialHeight.basePx > 0) return state.dialHeight.basePx;
    let base = 140;
    try {
      const raw = getComputedStyle(root).getPropertyValue('--mm-max-sub');
      const parsed = Number.parseFloat(String(raw || '').trim());
      if (Number.isFinite(parsed) && parsed > 0) base = parsed;
    } catch {}
    state.dialHeight.basePx = base;
    return base;
  }

  function resolveDialBaseVh(root) {
    if (Number.isFinite(state.dialHeight.baseVh) && state.dialHeight.baseVh > 0) return state.dialHeight.baseVh;
    let base = 60;
    try {
      const raw = String(getComputedStyle(root).getPropertyValue('--mm-max-vh') || '').trim();
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) base = parsed;
    } catch {}
    state.dialHeight.baseVh = base;
    return base;
  }

  function applyDialHeightStep(refs = getRefs()) {
    const root = refs?.root;
    if (!root) return;
    const step = parseStoredInt(state.dialHeight.step, 0, 0, DIAL_HEIGHT_STEP_MAX);
    const base = resolveDialBasePx(root);
    const baseVh = resolveDialBaseVh(root);
    const nextPx = base + (step * DIAL_HEIGHT_STEP_DELTA_PX);
    const nextVh = Math.max(20, baseVh - (step * DIAL_HEIGHT_STEP_DELTA_VH));
    try {
      root.style.setProperty('--mm-max-sub', `${nextPx}px`);
      root.style.setProperty('--mm-max-vh', `${nextVh}vh`);
      root.setAttribute('data-cgxui-dial-step', String(step));
    } catch {}
  }

  function loadDialHeightStepOnce(refs = getRefs()) {
    if (state.dialHeight.loaded) {
      applyDialHeightStep(refs);
      return state.dialHeight.step;
    }
    state.dialHeight.step = readStoredInt(keyDialHeightStep(), 0, 0, DIAL_HEIGHT_STEP_MAX);
    state.dialHeight.dir = readStoredInt(keyDialHeightDir(), 1, -1, 1) === -1 ? -1 : 1;
    state.dialHeight.loaded = true;
    applyDialHeightStep(refs);
    return state.dialHeight.step;
  }

  function setDialHeightStep(step, refs = getRefs()) {
    const next = parseStoredInt(step, 0, 0, DIAL_HEIGHT_STEP_MAX);
    state.dialHeight.step = next;
    state.dialHeight.loaded = true;
    writeStoredInt(keyDialHeightStep(), next);
    writeStoredInt(keyDialHeightDir(), state.dialHeight.dir === -1 ? -1 : 1);
    applyDialHeightStep(refs);
    return next;
  }

  function cycleDialHeightStep(refs = getRefs()) {
    const cur = loadDialHeightStepOnce(refs);
    let dir = state.dialHeight.dir === -1 ? -1 : 1;
    let next = cur + dir;
    if (next > DIAL_HEIGHT_STEP_MAX) {
      dir = -1;
      next = cur - 1;
    } else if (next < 0) {
      dir = 1;
      next = cur + 1;
    }
    state.dialHeight.dir = dir;
    return setDialHeightStep(next, refs);
  }

  function syncPinButtons(refs = getRefs()) {
    const cfg = loadBadgeVisibilityOnce();
    const apply = (btn, isOn) => {
      if (!btn) return;
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      btn.classList.toggle('is-off', !isOn);
    };
    apply(refs.pinQuote, cfg.quotes !== false);
    apply(refs.pinQwash, cfg.qwash !== false);
    apply(refs.pinRev, cfg.revisions !== false);
  }

  function applyBadgeVisibility(refs = getRefs()) {
    const cfg = loadBadgeVisibilityOnce();
    const root = refs?.root || null;
    if (root) {
      root.classList.toggle('cgx-mm-hide-quotes', cfg.quotes === false);
      root.classList.toggle('cgx-mm-hide-qwash', cfg.qwash === false);
      root.classList.toggle('cgx-mm-hide-revs', cfg.revisions === false);
    }
    syncPinButtons(refs);
  }

  function setBadgeVisibility(kind, on) {
    const cfg = loadBadgeVisibilityOnce();
    if (kind === 'quotes') {
      cfg.quotes = !!on;
      writeStoredBool(keyBadgeQuotes(), cfg.quotes);
      emitBadgeVisibility(kind, cfg.quotes);
    } else if (kind === 'qwash') {
      cfg.qwash = !!on;
      writeStoredBool(keyBadgeQwash(), cfg.qwash);
      emitBadgeVisibility(kind, cfg.qwash);
    } else if (kind === 'revisions') {
      cfg.revisions = !!on;
      writeStoredBool(keyBadgeRevs(), cfg.revisions);
      emitBadgeVisibility(kind, cfg.revisions);
    }
    applyBadgeVisibility(getRefs());
  }

  function toggleBadgeVisibility(kind) {
    const cfg = loadBadgeVisibilityOnce();
    if (kind === 'quotes') return setBadgeVisibility(kind, !(cfg.quotes !== false));
    if (kind === 'qwash') return setBadgeVisibility(kind, !(cfg.qwash !== false));
    if (kind === 'revisions') return setBadgeVisibility(kind, !(cfg.revisions !== false));
    return false;
  }

  function loadDialVisibilityOnce() {
    if (state.dialVisibility.loaded) return state.dialVisibility;
    state.dialVisibility.dots = readStoredBool(keyDialDotsVisibility(), true);
    state.dialVisibility.symbols = readStoredBool(keyDialSymbolsVisibility(), true);
    state.dialVisibility.loaded = true;
    return state.dialVisibility;
  }

  function syncDialPinButtons(refs = getRefs()) {
    const cfg = loadDialVisibilityOnce();
    const apply = (btn, isOn) => {
      if (!btn) return;
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      btn.classList.toggle('is-off', !isOn);
    };
    apply(refs.dialPinDots, cfg.dots !== false);
    apply(refs.dialPinSymbols, cfg.symbols !== false);
    syncDialTitlePinButton(refs);
  }

  function applyDialVisibility(refs = getRefs()) {
    const cfg = loadDialVisibilityOnce();
    const root = refs?.root || null;
    if (root) {
      root.classList.toggle('cgx-mm-hide-dots', cfg.dots === false);
      root.classList.toggle('cgx-mm-hide-symbols', cfg.symbols === false);
    }
    syncDialPinButtons(refs);
  }

  function setDialVisibility(kind, on) {
    const cfg = loadDialVisibilityOnce();
    if (kind === 'dots') {
      cfg.dots = !!on;
      writeStoredBool(keyDialDotsVisibility(), cfg.dots);
    } else if (kind === 'symbols') {
      cfg.symbols = !!on;
      writeStoredBool(keyDialSymbolsVisibility(), cfg.symbols);
    } else {
      return false;
    }
    applyDialVisibility(getRefs());
    return true;
  }

  function toggleDialVisibility(kind) {
    const cfg = loadDialVisibilityOnce();
    if (kind === 'dots') return setDialVisibility(kind, !(cfg.dots !== false));
    if (kind === 'symbols') return setDialVisibility(kind, !(cfg.symbols !== false));
    return false;
  }

  function getStickyTitlePanelsMap() {
    try {
      if (TOPW.H2O_MM_stickyTitlePanels instanceof Map) return TOPW.H2O_MM_stickyTitlePanels;
    } catch {}
    try {
      if (W.H2O_MM_stickyTitlePanels instanceof Map) return W.H2O_MM_stickyTitlePanels;
    } catch {}
    return null;
  }

  function getStickyTitlePanelsStateFallback() {
    const map = getStickyTitlePanelsMap();
    let total = 0;
    let visible = 0;
    if (!(map instanceof Map)) return { total, visible };
    map.forEach((panel, id) => {
      if (!panel || !panel.isConnected) {
        map.delete(id);
        return;
      }
      total += 1;
      if (panel.style.display !== 'none') visible += 1;
    });
    return { total, visible };
  }

  function getStickyTitlePanelsState() {
    try {
      const stateFromPlugin = W.getStickyTitlePanelsState?.();
      if (stateFromPlugin && typeof stateFromPlugin === 'object') {
        const total = Number.parseInt(stateFromPlugin.total, 10);
        const visible = Number.parseInt(stateFromPlugin.visible, 10);
        return {
          total: Number.isFinite(total) ? Math.max(0, total) : 0,
          visible: Number.isFinite(visible) ? Math.max(0, visible) : 0,
        };
      }
    } catch {}
    return getStickyTitlePanelsStateFallback();
  }

  function syncDialTitlePinButton(refs = getRefs()) {
    const btn = refs?.dialPinTitles;
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

  function fallbackToggleOpenStickyTitlePanels() {
    const map = getStickyTitlePanelsMap();
    if (!(map instanceof Map)) return false;

    const stateNow = getStickyTitlePanelsStateFallback();
    if (!stateNow.total) return true;

    const show = stateNow.visible === 0;
    map.forEach((panel, id) => {
      if (!panel || !panel.isConnected) {
        map.delete(id);
        return;
      }
      panel.style.display = show ? 'flex' : 'none';
    });
    if (show) {
      try { W.repositionAllStickyPanels?.(); } catch {}
    }
    return true;
  }

  function fallbackToggleAllStickyTitlePanels() {
    const btnSel = `[${ATTR.CGXUI}="${UI_.BTN}"][${ATTR.CGXUI_OWNER}="${SkID}"]`;
    const btns = Array.from(document.querySelectorAll(btnSel));
    if (!btns.length) return fallbackToggleOpenStickyTitlePanels();

    const map = getStickyTitlePanelsMap();
    let hasAny = false;
    let allVisible = true;

    for (const btn of btns) {
      const answerId = String(btn?.dataset?.primaryAId || btn?.dataset?.id || '').trim();
      if (!answerId) continue;
      hasAny = true;
      const panel = map?.get?.(answerId);
      if (!panel || !panel.isConnected || panel.style.display === 'none') {
        allVisible = false;
        break;
      }
    }

    if (!hasAny) return false;

    if (allVisible) {
      map?.forEach?.((panel, id) => {
        if (!panel || !panel.isConnected) {
          map.delete(id);
          return;
        }
        panel.style.display = 'none';
      });
      return true;
    }

    for (const btn of btns) {
      const answerId = String(btn?.dataset?.primaryAId || btn?.dataset?.id || '').trim();
      if (!answerId) continue;
      const panel = map?.get?.(answerId);
      if (panel && panel.isConnected && panel.style.display !== 'none') continue;
      try { W.toggleStickyTitlePanel?.(btn, answerId); } catch {}
    }
    try { W.repositionAllStickyPanels?.(); } catch {}
    return true;
  }

  function toggleOpenStickyTitlePanelsFromPin() {
    let ok = false;
    try {
      const result = W.toggleOpenStickyTitlePanels?.();
      ok = !!result || typeof W.toggleOpenStickyTitlePanels === 'function';
    } catch {}
    if (!ok) ok = fallbackToggleOpenStickyTitlePanels();
    syncDialTitlePinButton(getRefs());
    return ok;
  }

  function toggleAllStickyTitlePanelsFromPin() {
    let ok = false;
    try {
      const result = W.toggleAllStickyTitlePanels?.();
      ok = !!result || typeof W.toggleAllStickyTitlePanels === 'function';
    } catch {}
    if (!ok) ok = fallbackToggleAllStickyTitlePanels();
    syncDialTitlePinButton(getRefs());
    return ok;
  }

  function markReady(on) {
    const isReady = !!on;
    try { TOPW.H2O_MM_SHELL_READY = isReady; } catch {}
    try { TOPW.H2O_MM_UI_SHELL_READY = isReady; } catch {}
    return isReady;
  }

  function emitShellReady() {
    try { W.dispatchEvent(new CustomEvent(EV_SHELL_READY, { detail: { ver: SHELL_VER } })); } catch {}
  }

  function SHELL_ensureStyle() {
    const existing = document.getElementById(CSS_.STYLE_ID);
    if (existing) {
      const nextCss = CSS_MM_text();
      if (existing.textContent !== nextCss) existing.textContent = nextCss;
      return existing;
    }
    const el = document.createElement('style');
    el.id = CSS_.STYLE_ID;
    el.textContent = CSS_MM_text();
    document.head.appendChild(el);
    return el;
  }

  function SHELL_unmountStyle() {
    const el = document.getElementById(CSS_.STYLE_ID);
    if (!el) return false;
    try { el.remove(); } catch {}
    return true;
  }

  function getRoot() {
    const byId = document.getElementById(ROOT_ID);
    const roots = Array.from(document.querySelectorAll(`${SEL.ROOT}, [data-h2o-owner="minimap-v10"]`))
      .filter(el => el && el.isConnected);
    if (byId && byId.isConnected && !roots.includes(byId)) roots.unshift(byId);

    if (roots.length > 1) {
      const keep = roots.find(el => el.matches?.(SEL.ROOT)) || roots[0];
      roots.forEach((el) => { if (el !== keep) { try { el.remove(); } catch {} } });
      keep.setAttribute('data-cgx', ROOT_CGX);
      keep.classList.add('cgx-mm', CLS_.ROOT);
      keep.id = keep.id || ROOT_ID;
      keep.setAttribute(ATTR.CGXUI_OWNER, SkID);
      keep.setAttribute(ATTR.CGXUI, UI.ROOT);
      if (keep.parentElement !== document.body) document.body.appendChild(keep);
      return keep;
    }

    if (byId && byId.isConnected) {
      byId.setAttribute('data-cgx', ROOT_CGX);
      byId.classList.add('cgx-mm', CLS_.ROOT);
      byId.id = byId.id || ROOT_ID;
      byId.setAttribute(ATTR.CGXUI_OWNER, SkID);
      byId.setAttribute(ATTR.CGXUI, UI.ROOT);
      if (byId.parentElement !== document.body) document.body.appendChild(byId);
      return byId;
    }

    let root = document.querySelector(SEL.ROOT);
    if (root && root.isConnected) return root;

    root = document.querySelector('[data-h2o-owner="minimap-v10"]');
    if (root && root.isConnected) {
      root.setAttribute('data-cgx', ROOT_CGX);
      root.classList.add('cgx-mm', CLS_.ROOT);
      root.id = root.id || ROOT_ID;
      root.setAttribute(ATTR.CGXUI_OWNER, SkID);
      root.setAttribute(ATTR.CGXUI, UI.ROOT);
      if (root.parentElement !== document.body) document.body.appendChild(root);
      return root;
    }

    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = `cgx-mm ${CLS_.ROOT}`;
    root.setAttribute('data-cgx', ROOT_CGX);
    root.setAttribute(ATTR.CGXUI_OWNER, SkID);
    root.setAttribute(ATTR.CGXUI, UI.ROOT);
    document.body.appendChild(root);
    return root;
  }

  function bind(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    state.off.push(() => { try { target.removeEventListener(type, fn, opts); } catch {} });
  }

  function cleanupListeners() {
    while (state.off.length) {
      const off = state.off.pop();
      try { off?.(); } catch {}
    }
  }

  function clearBootHoldWatchers() {
    try { state.bootHoldMO?.disconnect?.(); } catch {}
    state.bootHoldMO = null;
    try { if (state.bootHoldTimer) clearTimeout(state.bootHoldTimer); } catch {}
    state.bootHoldTimer = null;
  }

  function clearAlignWatchers() {
    try { state.alignMO?.disconnect?.(); } catch {}
    state.alignMO = null;
    if (state.alignRaf) {
      try { cancelAnimationFrame(state.alignRaf); } catch {}
      state.alignRaf = 0;
    }
  }

  function clearPrelayoutRafs() {
    if (state.prelayoutRaf1) {
      try { cancelAnimationFrame(state.prelayoutRaf1); } catch {}
      state.prelayoutRaf1 = 0;
    }
    if (state.prelayoutRaf2) {
      try { cancelAnimationFrame(state.prelayoutRaf2); } catch {}
      state.prelayoutRaf2 = 0;
    }
    if (state.prelayoutFailsafeTimer) {
      try { clearTimeout(state.prelayoutFailsafeTimer); } catch {}
      state.prelayoutFailsafeTimer = null;
    }
  }

  function prelayoutLoadSig() {
    const chatId = String(resolveChatId() || '__global__').trim();
    return `${chatId}|${location.pathname}|${location.search}`;
  }

  function setPrelayoutClass(refs = getRefs(), on = false) {
    const root = refs?.root || null;
    const panel = refs?.panel || null;
    const add = !!on;
    if (root) root.classList.toggle(PRELAYOUT_CLASS, add);
    if (panel) panel.classList.toggle(PRELAYOUT_CLASS, add);
  }

  function quickPluginPresent() {
    try { return TOPW.H2O_MM_QUICK_PLUGIN === true; } catch { return false; }
  }

  function quickReadyNow() {
    try {
      if (TOPW.H2O_MM_QUICK_READY === true) return true;
    } catch {}
    return state.quickReady === true;
  }

  function shouldHoldForQuick(elapsedMs = 0) {
    if (quickReadyNow()) return false;
    if (quickPluginPresent()) return true;
    // short grace to let quick-controls mount and apply persisted style/size before unhide
    return elapsedMs < 700;
  }

  function maybeCompletePrelayout() {
    const sig = prelayoutLoadSig();
    if (state.prelayoutDone && state.prelayoutSig === sig) return true;
    if (state.prelayoutSig !== sig) return false;
    const refs = getRefs();
    if (!(refs?.root && refs?.panel)) return false;
    const elapsed = Math.max(0, performance.now() - (state.prelayoutStartedAt || 0));
    if (shouldHoldForQuick(elapsed)) return false;
    const btnCount = countMiniMapButtons(refs);
    if (btnCount <= 0) return false;
    const changedCount = btnCount !== state.prelayoutLastBtnCount;
    state.prelayoutLastBtnCount = btnCount;
    const delta = alignMiniMapCenter(refs);
    if (changedCount || !Number.isFinite(delta) || delta >= 1) {
      state.prelayoutStableTicks = 0;
      return false;
    }
    state.prelayoutStableTicks += 1;
    if (state.prelayoutStableTicks < 2) return false;
    if (state.prelayoutFailsafeTimer) {
      try { clearTimeout(state.prelayoutFailsafeTimer); } catch {}
      state.prelayoutFailsafeTimer = null;
    }
    setPrelayoutClass(refs, false);
    state.prelayoutDone = true;
    return true;
  }

  function runPrelayoutAlign(reason = 'boot') {
    const refs = getRefs();
    if (!(refs?.root && refs?.panel)) return false;
    applyAxisOffsetFromDisk(refs.root);
    applyCenterFixFromDisk(refs.root);
    const sig = prelayoutLoadSig();
    if (state.prelayoutDone && state.prelayoutSig === sig) return false;

    state.prelayoutSig = sig;
    state.prelayoutDone = false;
    state.prelayoutLastBtnCount = -1;
    state.prelayoutStableTicks = 0;
    state.prelayoutStartedAt = performance.now();
    setPrelayoutClass(refs, true);
    clearPrelayoutRafs();
    const t0 = performance.now();
    const maxWaitMs = 2600;
    const stepWaitMs = 220;
    const runFailsafe = () => {
      state.prelayoutFailsafeTimer = null;
      if (maybeCompletePrelayout()) return;
      const refsNow = getRefs();
      const hasBtns = hasMiniMapButtons(refsNow);
      const hasAnswers = hasAssistantAnswersInDom();
      const elapsed = performance.now() - t0;
      if (shouldHoldForQuick(elapsed) && elapsed < maxWaitMs) {
        state.prelayoutFailsafeTimer = setTimeout(runFailsafe, stepWaitMs);
        return;
      }
      if (!hasBtns && hasAnswers && elapsed < maxWaitMs) {
        state.prelayoutFailsafeTimer = setTimeout(runFailsafe, stepWaitMs);
        return;
      }
      try { alignMiniMapCenter(refsNow); } catch {}
      try { setPrelayoutClass(refsNow, false); } catch {}
      state.prelayoutDone = true;
    };
    state.prelayoutFailsafeTimer = setTimeout(runFailsafe, 220);

    state.prelayoutRaf1 = requestAnimationFrame(() => {
      state.prelayoutRaf1 = 0;
      try { alignMiniMapCenter(getRefs()); } catch {}
      maybeCompletePrelayout();
      state.prelayoutRaf2 = requestAnimationFrame(() => {
        state.prelayoutRaf2 = 0;
        try { alignMiniMapCenter(getRefs()); } catch {}
        maybeCompletePrelayout();
      });
    });
    return true;
  }

  function applyControlBoxSize(el) {
    if (!el) return;
    try { Object.assign(el.style, { width: 'var(--box-w)', height: 'var(--box-h)' }); } catch {}
  }

  function mmButtonSel() {
    return [
      `[${ATTR.CGXUI}="${UI_.BTN}"][${ATTR.CGXUI_OWNER}="${SkID}"]`,
      '[data-cgxui="mm-btn"]',
      '.cgxui-mm-btn',
    ].join(', ');
  }

  function centerX(el) {
    if (!el || !el.isConnected) return null;
    try {
      const r = el.getBoundingClientRect();
      if (!Number.isFinite(r.left) || !Number.isFinite(r.width)) return null;
      return r.left + (r.width / 2);
    } catch {
      return null;
    }
  }

  function resetCenterFixToZero(root) {
    if (!root) return false;
    try { root.style.setProperty('--mm-center-fix-x', '0px'); } catch {}
    return true;
  }

  function alignMiniMapCenter(refs = getRefs()) {
    const root = refs?.root;
    if (!root) return NaN;
    if (LOCK_MM_CENTER_FIX_TO_AXIS) {
      resetCenterFixToZero(root);
      return 0;
    }
    const anchor = refs?.toggle || refs?.dial;
    const col = refs?.col || null;
    if (!anchor || !col) return NaN;
    const lane = col.querySelector(mmButtonSel());
    if (!lane) return NaN;
    const aX = centerX(anchor);
    const lX = centerX(col) ?? centerX(lane);
    if (!Number.isFinite(aX) || !Number.isFinite(lX)) return NaN;
    const dx = aX - lX;
    // Deadband avoids tiny oscillation from fractional layout rounding.
    if (Math.abs(dx) < 1) return 0;
    const cur = Number.parseFloat(String(root.style.getPropertyValue('--mm-center-fix-x') || '0').replace('px', '')) || 0;
    // Apply delta on top of current fix; assigning raw dx causes ping-pong.
    const next = Math.round(cur + dx);
    if (Math.abs(next - cur) < 1) return Math.abs(dx);
    try { root.style.setProperty('--mm-center-fix-x', `${next}px`); } catch {}
    persistCenterFixX(next);
    return Math.abs(dx);
  }

  function scheduleMiniMapCenterAlign() {
    if (state.alignRaf) return;
    state.alignRaf = requestAnimationFrame(() => {
      state.alignRaf = 0;
      const refs = getRefs();
      if (LOCK_MM_CENTER_FIX_TO_AXIS) resetCenterFixToZero(refs?.root || null);
      else alignMiniMapCenter(refs);
      maybeCompletePrelayout();
    });
  }

  function installMiniMapCenterWatchers(refs = getRefs()) {
    clearAlignWatchers();
    if (LOCK_MM_CENTER_FIX_TO_AXIS) {
      resetCenterFixToZero(refs?.root || null);
      maybeCompletePrelayout();
      return;
    }
    const col = refs?.col;
    if (col && typeof MutationObserver !== 'undefined') {
      state.alignMO = new MutationObserver(() => scheduleMiniMapCenterAlign());
      try { state.alignMO.observe(col, { childList: true, subtree: true }); } catch {}
    }
    scheduleMiniMapCenterAlign();
  }

  function hasMiniMapButtons(refs = getRefs()) {
    return countMiniMapButtons(refs) > 0;
  }

  function countMiniMapButtons(refs = getRefs()) {
    const scope = refs?.col || refs?.panel || null;
    if (!scope) return 0;
    try { return Number(scope.querySelectorAll(mmButtonSel()).length || 0); } catch {}
    return 0;
  }

  function hasAssistantAnswersInDom() {
    try { return !!document.querySelector('[data-message-author-role="assistant"]'); } catch {}
    return false;
  }

  function releaseBootHold() {
    const refs = getRefs();
    if (!refs.dial) return false;
    stateSet(refs.dial, 'boot-wait', false);
    // Cleanup from earlier startup strategy if token exists.
    stateSet(refs.root, 'boot-hold', false);
    clearBootHoldWatchers();
    return true;
  }

  function syncBootVisibility(refs = getRefs()) {
    if (!(refs?.root && refs?.panel && refs?.toggle && refs?.dial)) return;
    // Keep Dial visible immediately with the MiniMap shell.
    // We intentionally avoid boot-wait hiding to prevent reload flash/hide.
    releaseBootHold();
  }

  function emitRouteChanged(source = 'shell') {
    const detail = { source: String(source || 'shell'), href: String(location.href || ''), chatId: resolveChatId() };
    try { window.dispatchEvent(new CustomEvent(EV_ROUTE_CHANGED, { detail })); } catch {}
    try { window.dispatchEvent(new CustomEvent(EV_ROUTE_CHANGED.replace(/^evt:/, ''), { detail })); } catch {}
  }

  function installHistoryRouteBridge() {
    if (TOPW.H2O_MM_ROUTE_BRIDGE_INSTALLED === true) return true;

    const patch = (name) => {
      const orig = history?.[name];
      if (typeof orig !== 'function') return;
      if (orig.__h2oMmRouteWrapped) return;
      const wrapped = function h2oMmRouteWrapped(...args) {
        const out = orig.apply(this, args);
        emitRouteChanged(`history:${name}`);
        return out;
      };
      try { Object.defineProperty(wrapped, '__h2oMmRouteWrapped', { value: true }); } catch {}
      try { history[name] = wrapped; } catch {}
    };
    patch('pushState');
    patch('replaceState');
    try { TOPW.H2O_MM_ROUTE_BRIDGE_INSTALLED = true; } catch {}
    return true;
  }

  function syncRouteState(reason = 'route') {
    const sig = collapsedSig(resolveChatId());
    if (sig === state.routeSig && state.bootCollapseApplied) return false;
    state.routeSig = sig;
    applyAxisOffsetFromDisk(getRefs()?.root || null);
    applyCenterFixFromDisk(getRefs()?.root || null);
    applyBootCollapsedDefault(`route:${String(reason || 'route')}`);
    runPrelayoutAlign(`route:${String(reason || 'route')}`);
    try { MM_core()?.scheduleRebuild?.(`shell:route:${String(reason || 'route')}`); } catch {}
    return true;
  }

  function scheduleRouteSync(reason = 'route') {
    state.routeReason = String(reason || 'route');
    if (state.routeRaf) return;
    state.routeRaf = requestAnimationFrame(() => {
      state.routeRaf = 0;
      syncRouteState(state.routeReason || 'route');
    });
  }

  function ensureRouteBindings() {
    if (state.routeBound) return;
    state.routeBound = true;
    installHistoryRouteBridge();

    const onRoute = () => scheduleRouteSync('event');
    bind(window, EV_ROUTE_CHANGED, onRoute, { passive: true });
    bind(window, EV_ROUTE_CHANGED.replace(/^evt:/, ''), onRoute, { passive: true });
    bind(window, 'popstate', onRoute, { passive: true });
    bind(window, 'hashchange', onRoute, { passive: true });
    bind(window, 'evt:h2o:answers:scan', onRoute, { passive: true });
    bind(window, 'h2o:answers:scan', onRoute, { passive: true });

    const onQuickReady = () => {
      state.quickReady = true;
      runPrelayoutAlign('quick-ready');
    };
    bind(window, EV_QUICK_READY, onQuickReady, { passive: true });
    bind(window, EV_QUICK_READY.replace(/^evt:/, ''), onQuickReady, { passive: true });
  }

  function ensureDialButtons(dial) {
    const SVG_UP = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 14l6-6 6 6" /></svg>';
    const SVG_DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 10l6 6 6-6" /></svg>';
    let cachedScrollEl = null;
    const getScrollEl = () => {
      const direct = document.querySelector('[data-scroll-root="1"]');
      if (direct) return (cachedScrollEl = direct);
      if (cachedScrollEl && document.contains(cachedScrollEl)) return cachedScrollEl;
      const cands = Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (!/(auto|scroll)/.test(cs.overflowY)) return false;
          return (el.scrollHeight - el.clientHeight) > 200;
        })
        .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
      return (cachedScrollEl = cands[0] || document.scrollingElement || document.documentElement);
    };
    const scrollToTop = () => {
      const el = getScrollEl();
      if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      try { el.scrollTo({ top: 0, behavior: 'smooth' }); } catch { el.scrollTop = 0; }
    };
    const scrollToBottom = () => {
      const el = getScrollEl();
      let top = 0;
      if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
        const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        top = Math.max(0, h - window.innerHeight);
        window.scrollTo({ top, behavior: 'smooth' });
        return;
      }
      top = Math.max(0, (el.scrollHeight - el.clientHeight));
      try { el.scrollTo({ top, behavior: 'smooth' }); } catch { el.scrollTop = top; }
    };
    const ensureBtn = (ui, title, svg, onClick) => {
      const q = `[${ATTR.CGXUI}="${ui}"][${ATTR.CGXUI_OWNER}="${SkID}"]`;
      let btn = dial.querySelector(q);
      if (!btn) {
        btn = document.createElement('button');
        btn.setAttribute(ATTR.CGXUI, ui);
        btn.setAttribute(ATTR.CGXUI_OWNER, SkID);
        dial.appendChild(btn);
      }
      btn.type = 'button';
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.innerHTML = svg;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      };
    };
    ensureBtn(UI_.DIAL_UP, 'Scroll to top', SVG_UP, scrollToTop);
    ensureBtn(UI_.DIAL_DOWN, 'Scroll to bottom', SVG_DOWN, scrollToBottom);
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

  function markSynthetic(ev, key) {
    try { Object.defineProperty(ev, key, { value: true }); } catch {}
    try { ev[key] = true; } catch {}
    return ev;
  }

  function openExportMenu() {
    const exportBtn =
      document.getElementById('cgxui-xpch-export-btn') ||
      document.querySelector('[data-cgxui="xpch-dl-toggle"][data-cgxui-owner="xpch"]');
    if (exportBtn && typeof exportBtn.click === 'function') {
      try { exportBtn.click(); return true; } catch {}
    }
    return false;
  }

  function openQuickControls(ctx = null) {
    // For native toggle middle-click, Quick Controls plugin already listens on this same auxclick.
    // Re-dispatching here can double-toggle (open then close).
    if (ctx?.surface === 'toggle' && ctx?.gesture === 'mid' && ctx?.ev?.type === 'auxclick') {
      return true;
    }
    const refs = getRefs();
    const toggle = refs?.toggle;
    if (!toggle) return false;
    try {
      const ev = markSynthetic(new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1, buttons: 4 }), '__h2oBehaviorSyntheticQuick');
      toggle.dispatchEvent(ev);
      return true;
    } catch {
      return false;
    }
  }

  function resolveShellBinding(binding, ctx, actions, customActions) {
    const map = behaviorMap() || {};
    const kind = String(binding?.kind || '').trim();
    if (!kind) return { binding: { kind: 'none' }, fn: null };
    if (kind === 'auto') {
      const api = behaviorApi();
      let next = null;
      try {
        const defs = api?.defaults?.() || null;
        next = defs?.[ctx.surface]?.[ctx.gesture] || null;
      } catch {}
      if (!next || !next.kind || next.kind === 'auto') return { binding: { kind: 'none' }, fn: null };
      const nk = String(next.kind || '').trim();
      return { binding: next, fn: (nk === 'custom') ? null : (actions[nk] || null) };
    }
    if (kind === 'custom') {
      const id = String(binding?.id || '').trim();
      if (!id || typeof customActions[id] !== 'function') {
        behaviorApi()?.warnOnce?.(`shell-custom:${ctx.surface}:${ctx.gesture}:${id || 'missing'}`, 'Unknown custom action id; fallback applied.', { surface: ctx.surface, gesture: ctx.gesture, id });
        const fb = map?.customFallback?.kind === 'none' ? { kind: 'none' } : { kind: String(map?.customFallback?.kind || 'none') };
        if (fb.kind === 'none') return { binding: fb, fn: null };
        return { binding: fb, fn: actions[fb.kind] || null };
      }
      return { binding, fn: customActions[id] };
    }
    return { binding, fn: actions[kind] || null };
  }

  function runShellBinding(surface, gesture, ev, btnEl = null) {
    const binding = behaviorBinding(surface, gesture, ev);
    const kind = String(binding?.kind || '').trim();
    if (kind === 'none') return false;
    if (kind === 'blocked') {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return true;
    }

    const actions = {
      hideMap: (ctx) => {
        const refs = ctx.uiRefs || getRefs();
        const collapsed = !stateHas(refs.panel, 'collapsed');
        setCollapsed(collapsed);
        return true;
      },
      quick: (ctx) => openQuickControls(ctx),
      export: () => openExportMenu(),
      adjust: () => {
        cycleDialHeightStep(getRefs());
        return true;
      },
      auto: () => false,
    };
    const actionsCustom = {
      'quick.open': () => openQuickControls(),
      'export.menu.open': () => openExportMenu(),
    };
    const ctx = {
      surface,
      gesture,
      btnEl,
      ev,
      uiRefs: getRefs(),
      sh: getSharedRefs(),
      core: MM_core(),
      rt: MM_rt(),
    };
    const resolved = resolveShellBinding(binding, ctx, actions, actionsCustom);
    if (!resolved.fn) {
      behaviorApi()?.warnOnce?.(`shell-action:${surface}:${gesture}:${kind}`, 'Action unavailable; safe no-op.', { surface, gesture, kind });
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
      return true;
    }
    ev?.preventDefault?.();
    ev?.stopPropagation?.();
    try {
      return !!resolved.fn(ctx, binding?.payload || {});
    } catch (e) {
      behaviorApi()?.warnOnce?.(`shell-action-err:${surface}:${gesture}:${kind}`, 'Action failed; safe no-op.', { err: String(e?.message || e) });
      return false;
    }
  }

  function ensureToggleBinding(toggle) {
    if (!toggle || toggle.dataset.h2oShellBound) return;
    toggle.dataset.h2oShellBound = '1';

    bind(toggle, 'click', (e) => {
      if (e?.__h2oBehaviorSyntheticQuick) return;
      runShellBinding('toggle', 'click', e, toggle);
    });
    bind(toggle, 'dblclick', (e) => {
      if (e?.__h2oBehaviorSyntheticQuick) return;
      runShellBinding('toggle', 'dblclick', e, toggle);
    });
    bind(toggle, 'mousedown', (e) => {
      if (e?.button !== 1 || e?.__h2oBehaviorSyntheticQuick) return;
      const b = behaviorBinding('toggle', 'mid', e);
      if (String(b?.kind || 'none') !== 'none') e.preventDefault();
    }, { passive: false });
    bind(toggle, 'auxclick', (e) => {
      if (e?.button !== 1 || e?.__h2oBehaviorSyntheticQuick) return;
      runShellBinding('toggle', 'mid', e, toggle);
    }, { passive: false });
  }

  function ensureDialCycleBinding(dial) {
    if (!dial || dial.dataset.h2oDialCycleBound === '3') return;
    dial.dataset.h2oDialCycleBound = '3';
    const dialBtnSel = `[${ATTR.CGXUI}="${UI_.DIAL_UP}"],[${ATTR.CGXUI}="${UI_.DIAL_DOWN}"]`;

    const isDialButton = (target) => !!(target && typeof target.closest === 'function' && target.closest(dialBtnSel));

    bind(dial, 'click', (e) => {
      if (isDialButton(e?.target)) return;
      runShellBinding('dial', 'click', e, dial);
    });
    bind(dial, 'dblclick', (e) => {
      if (isDialButton(e?.target)) return;
      runShellBinding('dial', 'dblclick', e, dial);
    });
    bind(dial, 'mousedown', (e) => {
      if (e?.button !== 1 || isDialButton(e?.target)) return;
      const b = behaviorBinding('dial', 'mid', e);
      if (String(b?.kind || 'none') !== 'none') e.preventDefault();
    }, { passive: false });
    bind(dial, 'auxclick', (e) => {
      if (e?.button !== 1 || isDialButton(e?.target)) return;
      runShellBinding('dial', 'mid', e, dial);
    }, { passive: false });
  }

  function ensureTogglePins(toggle) {
    if (!toggle) return;
    let row = toggle.querySelector(`[${ATTR.CGXUI}="${UI_.PINROW}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'cgx-mm-pinrow';
      row.setAttribute(ATTR.CGXUI_OWNER, SkID);
      row.setAttribute(ATTR.CGXUI, UI_.PINROW);
      toggle.appendChild(row);
    }

    const ensurePin = (ui, className, ariaLabel, kind) => {
      let btn = row.querySelector(`[${ATTR.CGXUI}="${ui}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = `cgx-mm-pin ${className}`;
        btn.setAttribute(ATTR.CGXUI, ui);
        btn.setAttribute(ATTR.CGXUI_OWNER, SkID);
        row.appendChild(btn);
      }
      btn.type = 'button';
      btn.textContent = '•';
      btn.setAttribute('aria-label', ariaLabel);
      btn.title = ariaLabel;
      if (!btn.dataset.h2oPinBound) {
        btn.dataset.h2oPinBound = '1';
        const stop = (e) => { e.stopPropagation(); };
        bind(btn, 'pointerdown', stop, true);
        bind(btn, 'mousedown', stop, true);
        bind(btn, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') stop(e);
        }, true);
        bind(btn, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleBadgeVisibility(kind);
        }, true);
      }
      return btn;
    };

    const pinQuote = ensurePin(UI_.PIN_QUOTE, 'cgx-mm-pin-quote', 'Toggle Quote Badges', 'quotes');
    const pinQwash = ensurePin(UI_.PIN_QWASH, 'cgx-mm-pin-qwash', 'Toggle Question Color Square', 'qwash');
    const pinRev = ensurePin(UI_.PIN_REV, 'cgx-mm-pin-rev', 'Toggle Revision Badges', 'revisions');
    try {
      row.appendChild(pinQuote);
      row.appendChild(pinQwash);
      row.appendChild(pinRev);
    } catch {}
    syncPinButtons(getRefs());
  }

  function ensureDialPins(dial) {
    if (!dial) return;
    let row = dial.querySelector(`[${ATTR.CGXUI}="${UI_.DIAL_PINROW}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'cgx-mm-dial-pinrow';
      row.setAttribute(ATTR.CGXUI_OWNER, SkID);
      row.setAttribute(ATTR.CGXUI, UI_.DIAL_PINROW);
      dial.appendChild(row);
    }

    const ensurePin = (ui, className, ariaLabel, kind) => {
      let btn = row.querySelector(`[${ATTR.CGXUI}="${ui}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = `cgx-mm-pin ${className}`;
        btn.setAttribute(ATTR.CGXUI, ui);
        btn.setAttribute(ATTR.CGXUI_OWNER, SkID);
        row.appendChild(btn);
      }
      btn.type = 'button';
      btn.textContent = '•';
      btn.setAttribute('aria-label', ariaLabel);
      btn.title = ariaLabel;
      if (!btn.dataset.h2oDialPinBound) {
        btn.dataset.h2oDialPinBound = '1';
        const stop = (e) => { e.stopPropagation(); };
        bind(btn, 'pointerdown', stop, true);
        bind(btn, 'mousedown', stop, true);
        bind(btn, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') stop(e);
        }, true);
        bind(btn, 'click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleDialVisibility(kind);
        }, true);
      }
      return btn;
    };

    const ensureTitlePin = () => {
      const ui = UI_.DIAL_PIN_TITLES;
      const ariaLabel = 'Toggle Open Title Labels (double-click: toggle all)';
      let btn = row.querySelector(`[${ATTR.CGXUI}="${ui}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
      if (!btn) {
        btn = document.createElement('button');
        btn.className = 'cgx-mm-pin cgx-mm-pin-titles';
        btn.setAttribute(ATTR.CGXUI, ui);
        btn.setAttribute(ATTR.CGXUI_OWNER, SkID);
        row.appendChild(btn);
      }
      btn.type = 'button';
      btn.textContent = '•';
      btn.setAttribute('aria-label', ariaLabel);
      btn.title = ariaLabel;

      if (!btn.dataset.h2oDialTitlePinBound) {
        btn.dataset.h2oDialTitlePinBound = '1';
        let clickTimer = null;
        const stop = (e) => { e.stopPropagation(); };
        const stopHard = (e) => {
          e.preventDefault();
          e.stopPropagation();
        };

        bind(btn, 'pointerdown', stop, true);
        bind(btn, 'mousedown', stop, true);
        bind(btn, 'keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') stop(e);
        }, true);

        bind(btn, 'click', (e) => {
          stopHard(e);
          if (clickTimer) clearTimeout(clickTimer);
          clickTimer = setTimeout(() => {
            clickTimer = null;
            toggleOpenStickyTitlePanelsFromPin();
          }, 220);
        }, true);

        bind(btn, 'dblclick', (e) => {
          stopHard(e);
          if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
          }
          toggleAllStickyTitlePanelsFromPin();
        }, true);
      }

      return btn;
    };

    const pinDots = ensurePin(UI_.DIAL_PIN_DOTS, 'cgx-mm-pin-dots', 'Toggle Highlight Dots', 'dots');
    const pinTitles = ensureTitlePin();
    const pinSymbols = ensurePin(UI_.DIAL_PIN_SYMBOLS, 'cgx-mm-pin-symbols', 'Toggle Right Symbols', 'symbols');
    try {
      row.appendChild(pinDots);
      row.appendChild(pinTitles);
      row.appendChild(pinSymbols);
    } catch {}
    syncDialPinButtons(getRefs());
  }

  function installControlHubFeature() {
    window.h2oConfig = window.h2oConfig || {};
    window.h2oConfig.features = window.h2oConfig.features || {};
    window.h2oConfig.features.minimap = {
      key: 'minimap',
      label: 'MiniMap',
      description: 'Sidebar MiniMap + answer map + nav buttons',
      enabled() { return !getCollapsed(); },
      setEnabled(on) {
        const refs = getRefs();
        const collapsed = !on;
        setCollapsed(collapsed);
        if (refs.root) refs.root.style.display = on ? '' : 'none';
        if (refs.toggle) refs.toggle.style.display = on ? '' : 'none';
      }
    };
  }

  function ensureBehaviorHook() {
    if (state.behaviorHooked) return;
    state.behaviorHooked = true;
    bind(window, EV_BEHAVIOR_CHANGED, () => {
      try { behaviorApi()?.get?.(true); } catch {}
    }, true);
  }

  function ensureUI(reason = '') {
    ensureBehaviorHook();
    ensureRouteBindings();
    state.quickReady = state.quickReady || (TOPW.H2O_MM_QUICK_READY === true);
    const refsBefore = getRefs();
    if (refsBefore.root && refsBefore.panel && refsBefore.toggle && refsBefore.dial) {
      setPrelayoutClass(refsBefore, true);
      applyAxisOffsetFromDisk(refsBefore.root);
      applyCenterFixFromDisk(refsBefore.root);
      applyBootCollapsedDefault();
      loadDialHeightStepOnce(refsBefore);
      ensureToggleBinding(refsBefore.toggle);
      ensureDialCycleBinding(refsBefore.dial);
      ensureTogglePins(refsBefore.toggle);
      ensureDialPins(refsBefore.dial);
      installMiniMapCenterWatchers(refsBefore);
      if (!state.alignResizeBound) {
        state.alignResizeBound = true;
        bind(window, 'resize', () => scheduleMiniMapCenterAlign(), { passive: true });
      }
      applyBadgeVisibility(getRefs());
      applyDialVisibility(getRefs());
      syncBootVisibility(refsBefore);
      runPrelayoutAlign(`ensure:${String(reason || 'reuse')}`);
      return refsBefore;
    }
    if (state.mounting) return refsBefore;
    state.mounting = true;
    try {
      SHELL_ensureStyle();
      const root = getRoot();
      try {
        root.classList.add(CLS_.ROOT);
        root.setAttribute(ATTR.CGXUI_OWNER, SkID);
        root.setAttribute(ATTR.CGXUI, UI.ROOT);
      } catch {}
      setPrelayoutClass({ root, panel: null }, true);
      applyAxisOffsetFromDisk(root);
      applyCenterFixFromDisk(root);

      let panel = root.querySelector(SEL.PANEL);
      if (!panel) {
        panel = document.createElement('div');
        panel.className = CLS_.MINIMAP;
        panel.setAttribute(ATTR.CGXUI_OWNER, SkID);
        panel.setAttribute(ATTR.CGXUI, UI.MINIMAP);
        root.appendChild(panel);
      }
      panel.classList.add(CLS_.MINIMAP);
      panel.setAttribute(ATTR.CGXUI_OWNER, SkID);
      panel.setAttribute(ATTR.CGXUI, UI.MINIMAP);
      panel.setAttribute(ATTR_.CGXUI_VIEW, 'classic');
      setPrelayoutClass({ root, panel }, true);

      let col = panel.querySelector(`[${ATTR.CGXUI}="${UI_.COL}"][${ATTR.CGXUI_OWNER}="${SkID}"]`);
      if (!col) {
        col = document.createElement('div');
        col.className = CLS_.COL;
        col.setAttribute(ATTR.CGXUI_OWNER, SkID);
        col.setAttribute(ATTR.CGXUI, UI_.COL);
        panel.appendChild(col);
      }
      Object.assign(col.style, { overflow: 'visible' });

      let toggle = document.querySelector(SEL.TOGGLE);
      if (toggle && toggle.parentElement !== root) {
        try { root.prepend(toggle); } catch {}
      }
      if (!toggle) {
        toggle = document.createElement('div');
        toggle.className = CLS_.TOGGLE;
        toggle.setAttribute(ATTR.CGXUI_OWNER, SkID);
        toggle.setAttribute(ATTR.CGXUI, UI.TOGGLE);
        root.appendChild(toggle);
      }
      toggle.classList.add(CLS_.TOGGLE);
      toggle.setAttribute(ATTR.CGXUI_OWNER, SkID);
      toggle.setAttribute(ATTR.CGXUI, UI.TOGGLE);
      applyControlBoxSize(toggle);
      if (!toggle.querySelector(`[${ATTR.CGXUI}="${UI_.COUNT}"][${ATTR.CGXUI_OWNER}="${SkID}"]`)) {
        toggle.innerHTML = `<span class="${CLS_.COUNT}" ${ATTR.CGXUI_OWNER}="${SkID}" ${ATTR.CGXUI}="${UI_.COUNT}" style="pointer-events: none;">0 / 0</span>`;
      }
      ensureTogglePins(toggle);

      let dial = document.querySelector(SEL.DIAL);
      if (dial && dial.parentElement !== root) {
        try { root.appendChild(dial); } catch {}
      }
      if (!dial) {
        dial = document.createElement('div');
        dial.className = CLS_.DIAL;
        dial.setAttribute(ATTR.CGXUI_OWNER, SkID);
        dial.setAttribute(ATTR.CGXUI, UI.DIAL);
        root.appendChild(dial);
      }
      dial.classList.add(CLS_.DIAL);
      dial.setAttribute(ATTR.CGXUI_OWNER, SkID);
      dial.setAttribute(ATTR.CGXUI, UI.DIAL);
      applyControlBoxSize(dial);

      ensureDialButtons(dial);
      ensureDialPins(dial);
      try {
        root.appendChild(toggle);
        root.appendChild(panel);
        root.appendChild(dial);
      } catch {}

      applyBootCollapsedDefault();
      loadDialHeightStepOnce(getRefs());
      applyBadgeVisibility(getRefs());
      applyDialVisibility(getRefs());
      syncBootVisibility(getRefs());
      installControlHubFeature();
      ensureToggleBinding(toggle);
      ensureDialCycleBinding(dial);
      installMiniMapCenterWatchers(getRefs());
      if (!state.alignResizeBound) {
        state.alignResizeBound = true;
        bind(window, 'resize', () => scheduleMiniMapCenterAlign(), { passive: true });
      }
      runPrelayoutAlign(`mount:${String(reason || 'mount')}`);
      return getRefs();
    } finally {
      state.mounting = false;
    }
  }

  function mountUI(reason = '') {
    return ensureUI(reason || 'mount');
  }

  function unmountUI() {
    const refs = getRefs();
    cleanupListeners();
    clearPrelayoutRafs();
    setPrelayoutClass(refs, false);
    state.prelayoutSig = '';
    state.prelayoutDone = false;
    state.prelayoutLastBtnCount = -1;
    state.prelayoutStableTicks = 0;
    if (state.routeRaf) {
      try { cancelAnimationFrame(state.routeRaf); } catch {}
      state.routeRaf = 0;
    }
    state.routeBound = false;
    state.routeSig = '';
    state.routeReason = '';
    clearBootHoldWatchers();
    clearAlignWatchers();
    state.alignResizeBound = false;
    try { refs.counter?.remove?.(); } catch {}
    try { refs.root?.remove?.(); } catch {}
    try { SHELL_unmountStyle(); } catch {}
    markReady(false);
    return true;
  }

  function installAPI() {
    const api = {
      mountUI,
      unmountUI,
      ensureUI,
      ensureStyle: SHELL_ensureStyle,
      setCollapsed,
      getCollapsed,
      getRefs,
    };
    try {
      const sharedRoot = TOPW.H2O_MM_SHARED;
      if (sharedRoot && typeof sharedRoot === 'object') {
        sharedRoot.api = (sharedRoot.api && typeof sharedRoot.api === 'object') ? sharedRoot.api : {};
        sharedRoot.api.ui = api;
      }
    } catch {}
    try {
      const refs = TOPW.H2O_MM_SHARED?.get?.() || null;
      if (refs?.vault?.api && typeof refs.vault.api === 'object') refs.vault.api.ui = api;
      if (refs?.api && typeof refs.api === 'object') refs.api.ui = api;
    } catch {}
    try {
      W.H2O = W.H2O || {};
      W.H2O.MM = W.H2O.MM || {};
      W.H2O.MM.mnmp = W.H2O.MM.mnmp || {};
      W.H2O.MM.mnmp.api = (W.H2O.MM.mnmp.api && typeof W.H2O.MM.mnmp.api === 'object')
        ? W.H2O.MM.mnmp.api
        : {};
      W.H2O.MM.mnmp.api.ui = api;
    } catch {}
    return api;
  }

  function markShellReady() {
    if (state.booted) return;
    state.booted = true;
    markReady(true);
    emitShellReady();
    log('UI shell ready.', { ver: SHELL_VER });
  }

  function tryBoot() {
    installAPI();
    const refs = ensureUI('boot');
    if (refs?.panel && refs?.toggle) {
      installAPI();
      markShellReady();
      return true;
    }
    return false;
  }

  function scheduleBoot(maxRetries = 20, gapMs = 120) {
    const tick = () => {
      state.retries += 1;
      const done = tryBoot();
      if (done) return;
      if (state.retries >= maxRetries) {
        warn('Shell UI did not mount in time; leaving as-is.');
        return;
      }
      setTimeout(tick, gapMs);
    };
    tick();
  }

  installAPI();
  scheduleBoot(40, 150);

  try {
    W.addEventListener('pageshow', () => {
      try { ensureUI('event:pageshow'); } catch {}
      try { scheduleRouteSync('pageshow'); } catch {}
    }, { passive: true });
  } catch {}
})();
