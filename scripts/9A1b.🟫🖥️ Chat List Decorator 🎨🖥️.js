// ==UserScript==
// @h2o-id             9a1b.chat-list.decorator
// @name               9A1b.🟫🖥️ Chat List Decorator 🎨🖥️
// @namespace          H2O.Premium.CGX.interface.chatListDecorator
// @author             HumamDev
// @version            6.4
// @revision           002
// @build              260506-212559
// @description        Chat List Decorator: color palettes, sidebar/main-list decoration, and active row styling
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  if (window.__h2o_interface_decorator_booted) return;
  if (!window.H2O?.interface?.version) { console.warn('[Decorator] Kernel not ready'); return; }

  // ✅ Phase 2 surface gate: skip on auth/settings/admin pages where the sidebar
  // chat list isn't relevant. This script injects ~1.5KB CSS, installs a 1.2 s
  // setInterval, attaches a body-subtree MutationObserver, and adds 3 listeners
  // per visible chat row — none of which are useful on those surfaces. SPA
  // navigation back to a chat surface won't re-run the IIFE, but in current
  // chatgpt.com flows the user lands directly on a chat or home URL and only
  // visits /settings as a leaf surface, so a coarse path skip is acceptable.
  const _path9A1b = (typeof location !== 'undefined' && typeof location.pathname === 'string') ? location.pathname : '';
  if (/^\/(?:auth|settings|admin)(?:\/|$)/i.test(_path9A1b)) {
    try { console.info('[Decorator] surface skip:', _path9A1b); } catch (_) {}
    return;
  }

  const I = window.H2O.interface;
  const ACTIVITY_STYLE_KEY = "ho:chat-list-activity-style";
  const ACTIVITY_STYLE_EVENT = "h2o:interface:activity-style";
  const ACTIVITY_STYLES = new Set(["edge-strip", "edge-wide"]);
  const EDGE_WIDE_LEFT_NUDGE_KEY = "ho:chat-list:edge-wide:left-nudge-px";
  const EDGE_WIDE_TAIL_CLEARANCE_KEY = "ho:chat-list:edge-wide:tail-clearance-px";
  // Wide Edge Strip tuning. Increase leftNudgePx to move the strip left.
  // Increase tailClearancePx to push the date/actions farther left.
  const EDGE_WIDE_SCRIPT_TUNING = Object.freeze({
    leftNudgePx: 10,
    tailClearancePx: 34,
    allowLocalStorageOverride: false,
  });
  const COLOR_PRIORITY_STORE_KEY = "ho:project-chat-color-priority:v1";
  const COLOR_PRIORITY_NONE = "all";

  function normalizeActivityStyle(value) {
    const key = String(value || "").trim().toLowerCase();
    return ACTIVITY_STYLES.has(key) ? key : "edge-strip";
  }

  function getActivityStyle() {
    try {
      if (typeof I.store?.getActivityStyle === "function") return normalizeActivityStyle(I.store.getActivityStyle());
      return normalizeActivityStyle(localStorage.getItem(ACTIVITY_STYLE_KEY));
    } catch {
      return "edge-strip";
    }
  }

  function getPxTuning(key, fallback, min, max) {
    const scriptValue = Number(fallback);
    const clampedScriptValue = Number.isFinite(scriptValue) ? Math.min(max, Math.max(min, scriptValue)) : min;
    if (!EDGE_WIDE_SCRIPT_TUNING.allowLocalStorageOverride) return clampedScriptValue;
    try {
      const raw = localStorage.getItem(key);
      const n = raw == null ? clampedScriptValue : Number(raw);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : clampedScriptValue;
    } catch {
      return clampedScriptValue;
    }
  }

  function applyWideEdgeTuningKeys() {
    const leftNudgePx = getPxTuning(EDGE_WIDE_LEFT_NUDGE_KEY, EDGE_WIDE_SCRIPT_TUNING.leftNudgePx, -12, 30);
    const tailClearancePx = getPxTuning(EDGE_WIDE_TAIL_CLEARANCE_KEY, EDGE_WIDE_SCRIPT_TUNING.tailClearancePx, 20, 72);
    document.documentElement.style.setProperty("--ho-edge-wide-tail-right", `${-10 + leftNudgePx}px`);
    document.documentElement.style.setProperty("--ho-edge-wide-tail-clearance", `${tailClearancePx}px`);
  }

  function applyActivityStyle(value = getActivityStyle()) {
    const next = normalizeActivityStyle(value);
    document.documentElement.setAttribute("data-ho-chat-list-activity-style", next);
    applyWideEdgeTuningKeys();
    return next;
  }

  function normalizePriorityColor(value) {
    const key = String(value || "").trim().toLowerCase();
    return I.config.COLORS.some((c) => c.name === key) ? key : COLOR_PRIORITY_NONE;
  }

  document.documentElement.classList.add("ho-meta-boot");
  applyActivityStyle();

  const style = document.createElement("style");
  style.textContent = `
/* =========================================================
   0) Base marker
   ========================================================= */
.ho-has-colorbtn { position: relative !important; }

/* =========================================================
   1) Layout: Chat links spacing (Sidebar vs Main)
   ========================================================= */

/* Sidebar chat list */
nav a.ho-has-colorbtn-side {
  padding-left: 10px !important;     /* normal */
  padding-right: 18px !important;    /* room for right pill */
  pointer-events: auto !important;
  margin-bottom: 4px !important;
}


/* Project / Folder list (main content) */
main a.ho-has-colorbtn-main {
  padding-left: 10px !important;
  padding-right: 8px !important;
  min-height: 44px !important;
  box-sizing: border-box !important;
  width: 100% !important;
  pointer-events: auto !important;
  position: relative; z-index: 1;
}

main a.ho-has-colorbtn-main > div {
  min-width: 0 !important;
  width: 100% !important;
}

/* =========================================================
   2) Color button (vertical bar): Base + Variants
   ========================================================= */

.ho-colorbtn {
  position: absolute; /* shared base; details handled by -main / -side */
}

/* ——— Project/Folders: Premium Vertical Bar ——— */
.ho-colorbtn-main {
  position: absolute;
  left: auto !important;
  right: clamp(58px, 7vw, 90px) !important;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 38px;
  border-radius: 999px;

  background: transparent;

  border: 1px solid rgba(210,215,225,0.85);

  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);

  cursor: pointer;
  opacity: 0.95;
  transition: opacity .15s, transform .15s, box-shadow .15s;
}

.ho-colorbtn-main:hover {
  opacity: 1;
  transform: translateY(-50%) scaleX(1.12);
  box-shadow:
    0 0 0 1px rgba(230,235,245,0.6),
    0 0 8px rgba(230,235,245,0.3);
}

main .ho-main-row-tail {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  padding-right: 16px !important;
  min-width: max-content !important;
}

main .ho-main-row-tail [data-testid="project-conversation-overflow-date"] {
  order: 1 !important;
}

main .ho-main-row-tail .ho-colorbtn-tail {
  order: 2 !important;
}

main .ho-main-row-tail [data-testid="project-conversation-overflow-menu"] {
  order: 3 !important;
  inset-inline-end: 18px !important;
  right: 18px !important;
  z-index: 30 !important;
}

main .ho-main-row-tail [data-testid="project-conversation-overflow-menu"] button {
  position: relative !important;
  z-index: 31 !important;
}

main .ho-main-row-tail .ho-colorbtn-main,
.ho-colorbtn-main.ho-colorbtn-tail {
  position: absolute !important;
  left: auto !important;
  right: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  flex: 0 0 auto !important;
  width: 6px !important;
  height: 30px !important;
  margin-left: 2px !important;
  z-index: 6 !important;
}

main .ho-main-row-tail .ho-colorbtn-main:hover,
.ho-colorbtn-main.ho-colorbtn-tail:hover {
  transform: translateY(-50%) scaleX(1.12) !important;
}

/* ——— Sidebar: Compact Vertical Bar ——— */

.ho-colorbtn-side {
  position: absolute;

  left: auto !important;
  right: 6px !important;   /* tweak 4–10px to taste */

  top: 50%;
  transform: translateY(-50%);
  width: 5px;
  height: 18px;

  border-radius: 999px;

  /* premium silver frame */
  border: 1px solid rgba(210,215,225,0.85);

  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);

  opacity: 0.9;
  cursor: pointer;
  transition: opacity .15s, transform .15s, box-shadow .15s;
}

.ho-colorbtn-side:hover {
  opacity: 1;
  transform: translateY(-50%) scaleX(1.12);
  box-shadow:
    0 0 0 1px rgba(230,235,245,0.9),
    0 0 8px rgba(230,235,245,0.9);
}

/* ---------------------------------------------------------
   Heat indicator (activity pill) 🌡️
   --------------------------------------------------------- */
.ho-colorbtn::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 999px;
  pointer-events: none;
  opacity: 0;
  background: transparent;
  transition: opacity .15s, background .15s, box-shadow .15s;
}

.ho-colorbtn.ho-heat-off  {
  opacity: 0.74 !important;
  border-color: rgba(128,138,148,0.66) !important;
  box-shadow: none !important;
}
.ho-colorbtn.ho-heat-off::before { opacity: 0 !important; }
.ho-colorbtn.ho-heat-warm {
  opacity: 0.92 !important;
  border-color: rgba(245,248,255,0.96) !important;
  box-shadow:
    0 0 0 1px rgba(245,248,255,0.38),
    0 0 10px rgba(245,248,255,0.30) !important;
}
.ho-colorbtn.ho-heat-warm::before { opacity: 0 !important; }
.ho-colorbtn.ho-heat-hot  {
  opacity: 1 !important;
  border-color: rgba(255,255,255,0.98) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.42),
    0 0 13px rgba(255,255,255,0.36),
    0 0 26px rgba(255,255,255,0.18) !important;
}
.ho-colorbtn.ho-heat-hot::before {
  opacity: 1 !important;
  background: rgba(255,255,255,0.48) !important;
  box-shadow: inset 0 0 6px rgba(255,255,255,0.62) !important;
}

/* Edge Strip option: preserve the same click behavior with a thinner edge cue. */
html[data-ho-chat-list-activity-style="edge-strip"] nav a.ho-has-colorbtn-side {
  padding-right: 12px !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-main,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-side {
  width: 12px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  opacity: 1 !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-side {
  right: 0 !important;
  height: calc(100% - 8px) !important;
  min-height: 18px !important;
  max-height: 34px !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] main .ho-main-row-tail .ho-colorbtn-main,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-main.ho-colorbtn-tail {
  right: -10px !important;
  width: 14px !important;
  height: 42px !important;
  margin-left: 0 !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn::before {
  content: "" !important;
  position: absolute !important;
  inset: 4px 4px 4px auto !important;
  width: 2px !important;
  border-radius: 999px !important;
  opacity: 0.66 !important;
  background: rgba(222,228,236,0.70) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.18),
    0 0 8px rgba(245,248,255,0.24) !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-side::before {
  inset: 3px 3px 3px auto !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-main:hover,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-side:hover,
html[data-ho-chat-list-activity-style="edge-strip"] main .ho-main-row-tail .ho-colorbtn-main:hover,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn-main.ho-colorbtn-tail:hover {
  transform: translateY(-50%) !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn:hover::before {
  right: 4px !important;
  width: 3px !important;
  opacity: 1 !important;
  background: rgba(255,255,255,0.92) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.26),
    0 0 10px rgba(245,248,255,0.52) !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-off,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-warm,
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-hot {
  border-color: transparent !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-off::before {
  opacity: 0.42 !important;
  background: rgba(142,150,160,0.66) !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-warm::before {
  opacity: 0.78 !important;
  background: rgba(142,150,160,0.66) !important;
  border: 1px solid rgba(255,255,255,0.82) !important;
  box-sizing: border-box !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.14),
    0 0 8px rgba(245,248,255,0.30) !important;
}
html[data-ho-chat-list-activity-style="edge-strip"] .ho-colorbtn.ho-heat-hot::before {
  opacity: 0.74 !important;
  background: rgba(255,255,255,0.72) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.18),
    0 0 8px rgba(255,255,255,0.26),
    0 0 14px rgba(255,255,255,0.12) !important;
}

/* Wide Edge option: same edge placement with a stronger visual strip. */
html[data-ho-chat-list-activity-style="edge-wide"] nav a.ho-has-colorbtn-side {
  padding-right: 18px !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-main,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-side {
  width: 22px !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  opacity: 1 !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-side {
  right: 4px !important;
  height: calc(100% - 8px) !important;
  min-height: 18px !important;
  max-height: 34px !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] main .ho-main-row-tail .ho-colorbtn-main,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-main.ho-colorbtn-tail {
  right: var(--ho-edge-wide-tail-right, -5px) !important;
  width: 18px !important;
  height: 42px !important;
  margin-left: 0 !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] main .ho-main-row-tail {
  padding-right: var(--ho-edge-wide-tail-clearance, 34px) !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn::before {
  content: "" !important;
  position: absolute !important;
  inset: 4px 0 4px auto !important;
  width: 9px !important;
  border-radius: 999px !important;
  opacity: 0.60 !important;
  background: rgba(222,228,236,0.60) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.14),
    0 0 6px rgba(245,248,255,0.18) !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-side::before {
  inset: 3px 0 3px auto !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-main:hover,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-side:hover,
html[data-ho-chat-list-activity-style="edge-wide"] main .ho-main-row-tail .ho-colorbtn-main:hover,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn-main.ho-colorbtn-tail:hover {
  transform: translateY(-50%) !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn:hover::before {
  right: 0 !important;
  width: 10px !important;
  opacity: 0.82 !important;
  background: rgba(255,255,255,0.76) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.18),
    0 0 8px rgba(245,248,255,0.28) !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-off,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-warm,
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-hot {
  border-color: transparent !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-off::before {
  opacity: 0.42 !important;
  background: rgba(142,150,160,0.66) !important;
  box-shadow: none !important;
}

html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-warm::before {
  opacity: 0.78 !important;
  background: rgba(142,150,160,0.66) !important;
  border: 1px solid rgba(255,255,255,0.82) !important;
  box-sizing: border-box !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.14),
    0 0 8px rgba(245,248,255,0.30) !important;
}
html[data-ho-chat-list-activity-style="edge-wide"] .ho-colorbtn.ho-heat-hot::before {
  opacity: 0.74 !important;
  background: rgba(255,255,255,0.72) !important;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.18),
    0 0 8px rgba(255,255,255,0.26),
    0 0 14px rgba(255,255,255,0.12) !important;
}

/* =========================================================
   3) Palette UI (popup) + Swatches
   ========================================================= */

.ho-palette {
  position: absolute;
  display: none;

  /* ✅ SOLID BLACK */
  background: #000 !important;
  opacity: 1 !important;

  border: 1px solid rgba(255,255,255,0.14) !important;
  border-radius: 10px !important;
  padding: 8px 10px !important;

  /* ✅ ALWAYS ABOVE EVERYTHING */
  z-index: 2147483647 !important;

  /* ✅ KILL any transparency/bleed effects from filters/blends */
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  isolation: isolate !important;

  box-shadow: 0 12px 30px rgba(0,0,0,0.85) !important;
  white-space: nowrap;
  flex-direction: column;
  gap: 4px;
}

/* force palette to be solid + never blend in project list */
main .ho-palette {
  background: #000 !important;
  opacity: 1 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;
  isolation: isolate !important;
  z-index: 2147483647 !important;
}

/* ⬅ different positions for sidebar vs project list */
.ho-palette-sidebar {
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
}

.ho-palette-main {
  right: 100%;
  margin-right: 6px;
  top: 50%;
  transform: translateY(-50%);
}

.ho-palette-main-right {
  left: 24px;
  right: auto;
  margin-left: 0;
  margin-right: 0;
}

.ho-palette-row {
  display: flex;
  flex-direction: row;
  gap: 6px;
  justify-content: center;
}

.ho-swatch {
  border: 1px solid rgba(255,255,255,0.22);
  cursor: pointer;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}
.ho-swatch:hover {
  transform: scale(1.15);
  box-shadow: 0 0 6px rgba(255,255,255,0.35);
}

.ho-swatch.row {
  width: 20px;
  height: 10px;
  border-radius: 4px;            /* rounded rectangle */
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.4);
}

/* 🌡️ Heat swatches: bigger + readable */
.ho-swatch.heat{
  width: 18px !important;
  height: 18px !important;
  border-radius: 6px !important;

  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;

  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  color: rgba(255,255,255,0.88) !important;

  background: rgba(255,255,255,0.08) !important;
  border: 1px solid rgba(255,255,255,0.22) !important;
}
.ho-swatch.heat[data-level="off"]{
  background: transparent !important;
  border-color: rgba(128,138,148,0.72) !important;
  color: rgba(175,182,190,0.88) !important;
  box-shadow: none !important;
}
.ho-swatch.heat[data-level="warm"]{
  background: transparent !important;
  border-color: rgba(245,248,255,0.92) !important;
  box-shadow: 0 0 8px rgba(245,248,255,0.30) !important;
}
.ho-swatch.heat[data-level="hot"]{
  color: rgba(5,5,5,0.88) !important;
  background: rgba(255,255,255,0.70) !important;
  border-color: rgba(255,255,255,0.98) !important;
  box-shadow: 0 0 10px rgba(255,255,255,0.36) !important;
}

/* ✅ Floating/Portaled palette: HARD override all main/sidebar positioning */
.ho-palette.ho-floating{
  position: fixed !important;

  margin: 0 !important;
  transform: translateY(-50%) !important;

  display: none !important; /* controlled by .show */
  background: #000 !important;
  opacity: 1 !important;

  z-index: 2147483647 !important;
  isolation: isolate !important;

  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  mix-blend-mode: normal !important;
  filter: none !important;

  pointer-events: auto !important;
}

.ho-palette.ho-floating.show{
  display: inline-flex !important;
}

/* safety: rows must ALWAYS be flex */
.ho-palette-row{ display:flex !important; }

.ho-palette, .ho-swatch { pointer-events: auto !important; }

/* =========================================================
   3.5) Sidebar scroll layering guard
   ========================================================= */

:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > .sticky,
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"] {
  isolation: isolate !important;
  background: var(--sidebar-surface-primary, var(--bg-primary, #202123)) !important;
  background-color: var(--sidebar-surface-primary, var(--bg-primary, #202123)) !important;
}

:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > .sticky:first-child {
  z-index: 120 !important;
}

:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"] {
  z-index: 110 !important;
}

:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) > [class*="sidebar-section-first-margin-top"]::after {
  content: "" !important;
  position: absolute !important;
  left: 0 !important;
  right: 0 !important;
  bottom: -14px !important;
  height: 14px !important;
  pointer-events: none !important;
  background: linear-gradient(
    to bottom,
    var(--sidebar-surface-primary, var(--bg-primary, #202123)) 0%,
    color-mix(in srgb, var(--sidebar-surface-primary, #202123) 72%, transparent) 58%,
    transparent 100%
  ) !important;
  z-index: 1 !important;
}

:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) a.ho-has-colorbtn-side,
:where(nav[aria-label="Chat history"], #stage-slideover-sidebar nav) .ho-project-row {
  z-index: 0 !important;
}

/* =========================================================
   4) Sidebar row colors + default gray highlight
   ========================================================= */

/* --- Sidebar row highlight (simple background on link) --- */
a.ho-has-colorbtn.ho-row-gold  { background-color: rgba(212,175,55,0.12) !important; }
a.ho-has-colorbtn.ho-row-red   { background-color: rgba(179,58,58,0.15) !important; }
a.ho-has-colorbtn.ho-row-blue  { background-color: rgba(70,100,200,0.15) !important; }
a.ho-has-colorbtn.ho-row-green { background-color: rgba(60,150,90,0.15) !important; }

/* Default subtle gray highlight for *sidebar* chats with no custom color */
nav a.ho-has-colorbtn:not(.ho-row-gold):not(.ho-row-red):not(.ho-row-blue):not(.ho-row-green) {
  background-color: rgba(255, 255, 255, 0.04);  /* tweak alpha for stronger/weaker */
  border-radius: 8px;                           /* optional, to match your style */
}

/* =========================================================
   5) Project list row container (glass band) + overrides
   ========================================================= */

.ho-main-row {
  position: relative;
  border-radius: 12px;
  overflow: visible !important;
  min-height: 52px;
  margin-bottom: 0;
}

/* Single glass layer: color + hover lives here */
.ho-main-row::before {
  content: "";
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: -8px;
  right: -8px;

  border-radius: inherit;
  border: 1px solid rgba(255,255,255,0.12);

  /* glass */
  backdrop-filter: saturate(180%) blur(14px);
  -webkit-backdrop-filter: saturate(180%) blur(14px);

  opacity: 0.55;
  z-index: 0;

  /* start with NO hover shadow */
  box-shadow: none;
  transition:
    box-shadow .18s ease,
    border-color .18s ease,
    opacity .18s ease;
}

/* ✅ Let clicks pass through the glass overlay in MAIN list */
.ho-main-row::before { pointer-events: none !important; }

/* ✅ Ensure the pill is above everything in MAIN list */
main a.ho-has-colorbtn-main .ho-colorbtn-main { z-index: 5 !important; }

/* Kill ChatGPT's native hover + shadow on row + inner card */
main a[href*="/c/"],
main a[href*="/c/"] > div {
  background: none !important;
  box-shadow: none !important;
}

/* Also kill focus outline so it doesn’t add a white ring */
main a[href*="/c/"]:focus-visible {
  outline: none !important;
}

/* Color variants for the glass band */
.ho-main-row.ho-row-gold::before  { background-color: rgba(212,175,55,0.25); }
.ho-main-row.ho-row-red::before   { background-color: rgba(179,58,58,0.25); }
.ho-main-row.ho-row-blue::before  { background-color: rgba(70,100,200,0.25); }
.ho-main-row.ho-row-green::before { background-color: rgba(60,150,90,0.25); }

/* Remove ChatGPT's native hover highlight */
main a[href*="/c/"]:hover {
  background: none !important;
  box-shadow: none !important;
}

/* Apply a perfect hover shadow on the glass block */
.ho-main-row:hover::before {
  transform: translateY(-1px);
  transition: transform .15s ease, box-shadow .15s ease;

  box-shadow:
    0 2px 6px rgba(0,0,0,0.22),
    0 4px 14px rgba(0,0,0,0.28); /* Adjust strength */

  border: 1px solid rgba(255,255,255,0.18);
}


/* =========================================================
   6) Sidebar Projects/Folders — Premium section chips
   ========================================================= */

:where(nav, aside) .ho-project-row {
  width: calc(100% - 3px) !important;
  box-sizing: border-box !important;

  padding: 8px 12px !important;

  margin-top: 4px !important;
  margin-bottom: 4px !important;
  margin-left: 3px;
  margin-right: 0px;
  transform: translateX(2px);

  position: relative !important;
  border-radius: 10px !important;

  background: rgba(0,0,0,0.18) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.04),
    0 3px 10px rgba(0,0,0,0.32) !important;

  transition: background .15s ease, box-shadow .15s ease;
}

/* subtle sheen overlay (modern premium) */
:where(nav, aside) .ho-project-row::before {
  content: "" !important;
  position: absolute !important;
  inset: 0 !important;
  border-radius: inherit !important;
  pointer-events: none !important;

  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.045),
    rgba(255,255,255,0.012) 40%,
    rgba(0,0,0,0.00) 100%
  ) !important;

  opacity: 0.75 !important;
}

:where(nav, aside) .ho-project-row:hover {
  background: rgba(0,0,0,0.12) !important;
  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.11),
    inset 0 1px 0 rgba(255,255,255,0.06),
    0 5px 14px rgba(0,0,0,0.42) !important;
}

/* =========================================================
   7) Sidebar controls: See All + See more (identical)
   ========================================================= */

:where(nav, aside) .ho-seeall {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;

  min-height: 28px !important;
  padding: 6px 10px !important;

  width: calc(100% - 14px) !important;
  margin: 6px 7px !important;

  border-radius: 9px !important;

  background: rgba(255,255,255,0.035) !important;
  color: rgba(255,255,255,0.75) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.05),
    0 3px 10px rgba(0,0,0,0.35) !important;

  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0.2px;

  cursor: pointer !important;
  user-select: none !important;
  text-decoration: none !important;

  transition:
    background .15s ease,
    box-shadow .15s ease,
    transform .15s ease;
}

:where(nav, aside) .ho-seeall:hover {
  background: rgba(255,255,255,0.055) !important;
  color: rgba(255,255,255,0.9) !important;

  box-shadow:
    inset 0 0 0 1px rgba(255,255,255,0.08),
    0 5px 14px rgba(0,0,0,0.45) !important;
}

nav .ho-seeall:active {
  transform: translateY(0px);
}

/* =========================================================
   8) Active states: Chat ring + Project/Folder ring
   ========================================================= */

/* ACTIVE CHAT — ring only (keeps ho-row-* colors) */
nav a.ho-has-colorbtn-side.active:not(.ho-project-row):not(.ho-seeall),
nav a[aria-current="page"]:not(.ho-project-row):not(.ho-seeall) {
  position: relative !important;
  border-radius: 10px !important;
  box-shadow:
    inset 0 0 0 1.5px rgba(255,255,255,0.22),
    0 0 0 1px rgba(0,0,0,0.55) !important;
}

/* ✅ ensure no overlay film exists */
nav a.ho-has-colorbtn-side.active:not(.ho-project-row):not(.ho-seeall)::after {
  content: none !important;
}

nav a.ho-has-colorbtn.ho-row-gold.active  { background-color: rgba(212,175,55,0.12) !important; }
nav a.ho-has-colorbtn.ho-row-red.active   { background-color: rgba(179,58,58,0.15) !important; }
nav a.ho-has-colorbtn.ho-row-blue.active  { background-color: rgba(70,100,200,0.15) !important; }
nav a.ho-has-colorbtn.ho-row-green.active { background-color: rgba(60,150,90,0.15) !important; }

/* ACTIVE PROJECT / FOLDER — Matte ring */
:where(nav, aside) .ho-project-row[aria-current="page"],
:where(nav, aside) .ho-project-row.active,
:where(nav, aside) .ho-project-row[data-active] {
  position: relative !important;
  border-radius: 12px !important;

  box-shadow:
    inset 0 0 0 1.5px rgba(255,255,255,0.22),
    0 0 0 1px rgba(0,0,0,0.65),
    0 6px 16px rgba(0,0,0,0.44) !important;

  background: rgba(0,0,0,0.12) !important;
}

/* =========================================================
   9) MAIN LIST overlay ordering fixes (intentional overrides)
   ========================================================= */

.ho-main-row{
  position: relative !important;
  isolation: isolate !important;   /* stops weird blending */
}

/* push the glass layer behind everything */
.ho-main-row::before{
  z-index: -1 !important;
}

/* make sure the link content sits above */
main .ho-main-row > a{
  position: relative !important;
  z-index: 2 !important;
  min-height: 44px !important;
}

/* and the palette is always above all */
main .ho-main-row .ho-palette{
  z-index: 2147483647 !important;
  background: #000 !important;
  opacity: 1 !important;
  mix-blend-mode: normal !important;
  filter: none !important;
}

/* (second definition of .show — intentional stronger override) */
.ho-palette.show {
  display: inline-flex !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.ho-colorbtn { pointer-events: auto !important; }

/* =========================================================
   10) Project chat color priority control
   ========================================================= */

.ho-project-tabs-host {
  position: relative !important;
  overflow: visible !important;
}

.ho-color-priority {
  position: absolute !important;
  inset-inline-end: 0 !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  z-index: 40 !important;
  display: inline-flex !important;
  align-items: center !important;
  pointer-events: auto !important;
}

.ho-color-priority-trigger {
  height: 32px !important;
  min-width: 42px !important;
  padding: 0 10px !important;
  border: 1px solid rgba(255,255,255,0.14) !important;
  border-radius: 999px !important;
  background: rgba(255,255,255,0.055) !important;
  color: rgba(255,255,255,0.84) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.08),
    0 6px 16px rgba(0,0,0,0.34) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 6px !important;
  cursor: pointer !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
}

.ho-color-priority-trigger:hover,
.ho-color-priority.is-open .ho-color-priority-trigger {
  background: rgba(255,255,255,0.085) !important;
  border-color: rgba(255,255,255,0.22) !important;
  color: rgba(255,255,255,0.94) !important;
}

.ho-color-priority-trigger[data-active="true"] {
  border-color: rgba(255,255,255,0.30) !important;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    0 0 0 1px rgba(255,255,255,0.10),
    0 8px 20px rgba(0,0,0,0.42) !important;
}

.ho-color-priority-swatch {
  width: 11px !important;
  height: 11px !important;
  border-radius: 4px !important;
  border: 1px solid rgba(255,255,255,0.34) !important;
  background: var(--ho-color-priority-swatch-bg, linear-gradient(135deg, rgba(212,175,55,.85), rgba(179,58,58,.85) 34%, rgba(70,100,200,.85) 67%, rgba(60,150,90,.85))) !important;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.28) !important;
  flex: 0 0 auto !important;
}

.ho-color-priority-label {
  display: inline-block !important;
  white-space: nowrap !important;
}

.ho-color-priority-menu {
  position: absolute !important;
  inset-inline-end: 0 !important;
  top: calc(100% + 8px) !important;
  display: none !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(255,255,255,0.14) !important;
  background: #000 !important;
  box-shadow: 0 14px 34px rgba(0,0,0,0.72) !important;
  z-index: 2147483647 !important;
}

.ho-color-priority.is-open .ho-color-priority-menu {
  display: inline-flex !important;
}

.ho-color-priority-option {
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  border-radius: 9px !important;
  border: 1px solid rgba(255,255,255,0.16) !important;
  background: rgba(255,255,255,0.055) !important;
  color: rgba(255,255,255,0.82) !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
}

.ho-color-priority-option:hover,
.ho-color-priority-option[data-active="true"] {
  border-color: rgba(255,255,255,0.36) !important;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.10), 0 0 14px rgba(255,255,255,0.16) !important;
}

.ho-color-priority-option[data-color="all"] {
  font-size: 11px !important;
  font-weight: 800 !important;
}

.ho-color-priority-option-dot {
  width: 15px !important;
  height: 15px !important;
  border-radius: 5px !important;
  border: 1px solid rgba(255,255,255,0.34) !important;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.30) !important;
}

/* =========================================================
   11) HO Meta actions (under title): Fix/Review line + dot
   ========================================================= */


html.ho-meta-boot main .ho-main-row{ opacity: 0 !important; visibility: hidden !important; }
html:not(.ho-meta-boot) main .ho-main-row{
  opacity: 1 !important;
  transition: opacity .14s ease !important;
}
`;
  document.head.appendChild(style);

function markActiveSidebarLink() {
  const curId = (location.pathname.match(/\/c\/([^\/?#]+)/) || [])[1];
  document.querySelectorAll("nav a").forEach(a => {
    // Skip H2O-internal chat links (Tag Viewer, Bubble Cloud popup, in-shell pages).
    // Without this guard the "active" ring leaks onto H2O-injected anchors that look like
    // native chat links but are owned by H2O surfaces (data-cgxui-owner / data-h2o-tags-*).
    if (I.utils?.isInsideH2OInternalSurface?.(a)) return;
    const id = I.nav.getChatIdFromHref(a.getAttribute("href") || "");
    a.classList.toggle("active", !!curId && !!id && id === curId);
  });
}

markActiveSidebarLink();

function applyRowByIndex(link, idx) {
  // In project list: use the row container.
  // In sidebar: link itself (no .ho-main-row above).
  const rowEl = link.closest(".ho-main-row") || link;

  // clear old colors from both container and link
  [rowEl, link].forEach(el => {
    el.classList.remove("ho-row-gold","ho-row-red","ho-row-blue","ho-row-green");
  });

  if (idx < 0 || idx >= I.config.COLORS.length) return;
  const def = I.config.COLORS[idx];
  const cls = "ho-row-" + def.name;
  rowEl.classList.add(cls);
}

function isElementVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

function isSidebarOpen() {
  const main = document.querySelector('main');
  if (!main) return false;

  const rect = main.getBoundingClientRect();
  const offset = rect.left;   // distance from left edge of viewport

  // 👉 tweak this value if needed:
  // - With sidebar open, offset is usually ~260px
  // - With sidebar hidden, offset is usually < 40px
  return offset > 120;
}

let hoColorPriorityRAF = 0;
let hoColorPriorityTO = 0;
let hoColorPriorityOrderCounter = 0;

function getPriorityColorDef(name) {
  const key = normalizePriorityColor(name);
  return I.config.COLORS.find((c) => c.name === key) || null;
}

function getPriorityColorIdx(name) {
  const key = normalizePriorityColor(name);
  return I.config.COLORS.findIndex((c) => c.name === key);
}

function loadColorPriorityStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(COLOR_PRIORITY_STORE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveColorPriorityStore(store) {
  try { localStorage.setItem(COLOR_PRIORITY_STORE_KEY, JSON.stringify(store || {})); } catch {}
}

function getColorPriorityScope() {
  const path = String(location.pathname || "/").replace(/\/+$/, "") || "/";
  return `${location.origin || ""}${path}`;
}

function getPriorityColor() {
  const store = loadColorPriorityStore();
  return normalizePriorityColor(store[getColorPriorityScope()]);
}

function setPriorityColor(color) {
  const next = normalizePriorityColor(color);
  const store = loadColorPriorityStore();
  const scope = getColorPriorityScope();
  if (next === COLOR_PRIORITY_NONE) delete store[scope];
  else store[scope] = next;
  saveColorPriorityStore(store);
  return next;
}

function closeColorPriorityMenus(root = document) {
  try {
    root.querySelectorAll(".ho-color-priority.is-open").forEach((el) => {
      el.classList.remove("is-open");
      el.querySelector(".ho-color-priority-trigger")?.setAttribute("aria-expanded", "false");
    });
  } catch {}
}

function updateColorPriorityControl(root = document.querySelector(".ho-color-priority")) {
  if (!root) return;
  const color = getPriorityColor();
  const active = color !== COLOR_PRIORITY_NONE;
  const def = getPriorityColorDef(color);
  const trigger = root.querySelector(".ho-color-priority-trigger");
  const swatch = root.querySelector(".ho-color-priority-swatch");

  root.dataset.color = color;
  if (trigger) {
    trigger.dataset.active = active ? "true" : "false";
    trigger.setAttribute("aria-label", active ? `Bring ${color} chats to the top` : "Choose a chat color to bring to the top");
    trigger.title = active ? `Showing ${color} chats first` : "Bring chats with a selected color to the top";
  }
  if (swatch instanceof HTMLElement) {
    if (active && def?.value) swatch.style.setProperty("--ho-color-priority-swatch-bg", def.value);
    else swatch.style.removeProperty("--ho-color-priority-swatch-bg");
  }

  root.querySelectorAll(".ho-color-priority-option").forEach((btn) => {
    btn.dataset.active = btn.dataset.color === color ? "true" : "false";
  });
}

function makeColorPriorityOption(colorName, colorValue = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ho-color-priority-option";
  btn.dataset.color = colorName;

  if (colorName === COLOR_PRIORITY_NONE) {
    btn.textContent = "All";
    btn.title = "Use the normal project chat order";
    btn.setAttribute("aria-label", "Use the normal project chat order");
    return btn;
  }

  const dot = document.createElement("span");
  dot.className = "ho-color-priority-option-dot";
  dot.style.backgroundColor = colorValue;
  btn.appendChild(dot);
  btn.title = `Bring ${colorName} chats to the top`;
  btn.setAttribute("aria-label", `Bring ${colorName} chats to the top`);
  return btn;
}

function createColorPriorityControl() {
  const root = document.createElement("div");
  root.className = "ho-color-priority";
  root.setAttribute("data-ho-color-priority", "1");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ho-color-priority-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  const swatch = document.createElement("span");
  swatch.className = "ho-color-priority-swatch";
  swatch.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "ho-color-priority-label";
  label.textContent = "Top";

  trigger.appendChild(swatch);
  trigger.appendChild(label);

  const menu = document.createElement("div");
  menu.className = "ho-color-priority-menu";
  menu.setAttribute("role", "menu");
  menu.appendChild(makeColorPriorityOption(COLOR_PRIORITY_NONE));
  I.config.COLORS.forEach((c) => {
    menu.appendChild(makeColorPriorityOption(c.name, c.value));
  });

  root.appendChild(trigger);
  root.appendChild(menu);

  ["pointerdown", "mousedown"].forEach((evt) => {
    root.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }, true);
  });

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    closeAllPalettes();
    const open = !root.classList.contains("is-open");
    closeColorPriorityMenus();
    root.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
  }, true);

  root.addEventListener("click", (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    const option = target?.closest?.(".ho-color-priority-option");
    if (!option) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    setPriorityColor(option.dataset.color || COLOR_PRIORITY_NONE);
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    updateColorPriorityControl(root);
    scheduleColorPrioritySort();
  }, true);

  updateColorPriorityControl(root);
  return root;
}

function compactText(el) {
  if (!el) return "";
  const parts = [];
  try {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (walker.nextNode()) {
      const text = String(walker.currentNode?.nodeValue || "").trim();
      if (text) parts.push(text);
    }
  } catch {}
  return parts.join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function findProjectTabsHost() {
  const main = document.querySelector("main");
  if (!main) return null;
  const mainRect = main.getBoundingClientRect();
  const candidates = [...main.querySelectorAll('[role="tablist"], div, nav')];
  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((el) => {
    if (!(el instanceof HTMLElement) || !isElementVisible(el)) return;
    const text = compactText(el);
    if (!/\bchats\b/.test(text) || !/\bsources\b/.test(text)) return;
    if (text.length > 120) return;

    const rect = el.getBoundingClientRect();
    if (rect.height < 20 || rect.height > 84) return;
    if (rect.width < 110) return;

    let host = el;
    let cur = el.parentElement;
    while (cur && cur !== main.parentElement && main.contains(cur)) {
      const pr = cur.getBoundingClientRect();
      if (pr.height > 96) break;
      if (pr.width >= rect.width && pr.width <= mainRect.width + 40) host = cur;
      if (pr.width >= mainRect.width * 0.68) break;
      cur = cur.parentElement;
    }

    const hr = host.getBoundingClientRect();
    const score = Math.max(0, hr.top - mainRect.top) + Math.abs(mainRect.width - hr.width) * 0.03 + hr.height * 0.12;
    if (score < bestScore) {
      best = host;
      bestScore = score;
    }
  });

  return best;
}

function ensureColorPriorityControl() {
  const host = findProjectTabsHost();
  document.querySelectorAll(".ho-color-priority").forEach((el) => {
    if (!host || !host.contains(el)) el.remove();
  });
  document.querySelectorAll(".ho-project-tabs-host").forEach((el) => {
    if (el !== host) el.classList.remove("ho-project-tabs-host");
  });

  if (!host) return null;
  host.classList.add("ho-project-tabs-host");

  let control = [...host.children].find((el) => el instanceof HTMLElement && el.classList.contains("ho-color-priority"));
  if (!control) {
    control = createColorPriorityControl();
    host.appendChild(control);
  }

  updateColorPriorityControl(control);
  return control;
}

function rowMatchesPriorityColor(row, color) {
  const key = normalizePriorityColor(color);
  if (key === COLOR_PRIORITY_NONE) return false;
  const cls = `ho-row-${key}`;
  if (row?.classList?.contains(cls)) return true;

  const link = row?.matches?.("a[href]") ? row : row?.querySelector?.('a[href*="/c/"], a[href*="/chat/"]');
  if (!link || I.utils?.isInsideH2OInternalSurface?.(link)) return false;
  if (link.classList?.contains(cls)) return true;

  const idx = getPriorityColorIdx(key);
  if (idx < 0) return false;
  const id = I.nav.getChatIdFromHref(link.getAttribute("href") || "");
  return !!id && I.store.getRow(id) === idx;
}

function childContainsSortableChat(child, hostBottom) {
  if (!(child instanceof HTMLElement)) return false;
  const rect = child.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < hostBottom - 8) return false;
  return !!child.querySelector?.('a[href*="/c/"], a[href*="/chat/"]');
}

function findSortableRowUnit(row, hostBottom) {
  const main = document.querySelector("main");
  if (!(row instanceof HTMLElement) || !row.parentElement) return null;

  let cur = row;
  while (cur?.parentElement && (!main || main.contains(cur.parentElement))) {
    const parent = cur.parentElement;
    if (!(parent instanceof HTMLElement)) return null;
    if (parent === main) return { parent, unit: cur };

    const chatChildCount = [...parent.children].reduce((count, child) => {
      return count + (childContainsSortableChat(child, hostBottom) ? 1 : 0);
    }, 0);

    if (chatChildCount >= 2) return { parent, unit: cur };
    cur = parent;
  }

  return row.parentElement instanceof HTMLElement ? { parent: row.parentElement, unit: row } : null;
}

function collectSortableMainRows() {
  const groups = new Map();
  const host = document.querySelector(".ho-project-tabs-host") || findProjectTabsHost();
  if (!host) return groups;

  const hostBottom = host.getBoundingClientRect().bottom;
  const seen = new Set();
  const seenUnits = new Set();
  const links = [...document.querySelectorAll('main a[href*="/c/"], main a[href*="/chat/"]')];

  links.forEach((link) => {
    if (!(link instanceof HTMLAnchorElement)) return;
    if (I.utils?.isInsideH2OInternalSurface?.(link)) return;
    const id = I.nav.getChatIdFromHref(link.getAttribute("href") || "");
    if (!id) return;

    const row = link.closest(".ho-main-row") || link.parentElement;
    if (!(row instanceof HTMLElement) || !row.parentElement || seen.has(row)) return;
    const rowRect = row.getBoundingClientRect();
    if (rowRect.width === 0 || rowRect.height === 0) return;
    if (window.getComputedStyle(row).display === "none") return;
    if (rowRect.top < hostBottom - 8) return;

    seen.add(row);
    const sortable = findSortableRowUnit(row, hostBottom);
    if (!sortable || !(sortable.parent instanceof HTMLElement) || !(sortable.unit instanceof HTMLElement)) return;
    if (seenUnits.has(sortable.unit)) return;

    seenUnits.add(sortable.unit);
    if (sortable.unit.__hoColorPriorityOrder == null) {
      sortable.unit.__hoColorPriorityOrder = ++hoColorPriorityOrderCounter;
      sortable.unit.dataset.hoColorPriorityOrder = String(sortable.unit.__hoColorPriorityOrder);
    }

    const parent = sortable.parent;
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push({ row, unit: sortable.unit });
  });

  return groups;
}

function rowPriorityOrder(entry) {
  const unit = entry?.unit || entry;
  const n = Number(unit?.__hoColorPriorityOrder || unit?.dataset?.hoColorPriorityOrder || 0);
  return Number.isFinite(n) && n > 0 ? n : 999999;
}

function applyColorPrioritySort() {
  if (hoOpenPalette && hoOpenPalette.classList.contains("show")) return;
  const control = ensureColorPriorityControl();
  if (!control) return;

  const color = getPriorityColor();
  const groups = collectSortableMainRows();

  groups.forEach((entries, parent) => {
    if (!parent || entries.length < 2) return;

    const sorted = entries.slice().sort((a, b) => {
      if (color !== COLOR_PRIORITY_NONE) {
        const am = rowMatchesPriorityColor(a.row, color);
        const bm = rowMatchesPriorityColor(b.row, color);
        if (am !== bm) return am ? -1 : 1;
      }
      return rowPriorityOrder(a) - rowPriorityOrder(b);
    });

    const changed = sorted.some((entry, idx) => entry.unit !== entries[idx].unit);
    if (!changed) return;

    const marker = document.createTextNode("");
    parent.insertBefore(marker, entries[0].unit);
    sorted.forEach((entry) => parent.insertBefore(entry.unit, marker));
    marker.remove();
  });
}

function scheduleColorPrioritySort() {
  cancelAnimationFrame(hoColorPriorityRAF);
  clearTimeout(hoColorPriorityTO);

  const run = () => {
    cancelAnimationFrame(hoColorPriorityRAF);
    clearTimeout(hoColorPriorityTO);
    hoColorPriorityRAF = 0;
    hoColorPriorityTO = 0;
    if (I.lock.locked()) {
      setTimeout(scheduleColorPrioritySort, 50);
      return;
    }
    I.lock.with(() => applyColorPrioritySort());
  };

  hoColorPriorityRAF = requestAnimationFrame(run);
  hoColorPriorityTO = setTimeout(run, 80);
}

  /* ─────────────────────────────────────────
     4) Palette toggle logic
     ───────────────────────────────────────── */

function getPaletteForBtn(btn) {
  const id = btn?.dataset?.chatid;
  if (!id) return null;

  // 1) Always prefer palette inside the SAME anchor as the button
  const parentLink = btn.closest("a[href]");
  if (parentLink) {
    const p = parentLink.querySelector(`:scope > .ho-palette[data-chatid="${id}"]`);
    if (p) return p;
  }

  // 2) Main-list pills live in the date tail, so resolve their owning link by chat id.
  const ownerLink = getLinkForChatId(id);
  const ownerPalette = ownerLink?.querySelector(`:scope > .ho-palette[data-chatid="${id}"]`);
  if (ownerPalette) return ownerPalette;

  // 3) Fallback: any open/portaled palette for this id (rare)
  return document.querySelector(`.ho-palette.ho-floating[data-chatid="${id}"]`);
}

function getBtnForChatId(chatId, scopeEl) {
  return (
    // ✅ best: button inside same anchor as the palette (prevents cross-list mismatch)
    (scopeEl?.closest("a[href]")?.querySelector(`.ho-colorbtn[data-chatid="${chatId}"]`)) ||

    // ✅ prefer sidebar/main explicitly if needed
    document.querySelector(`nav .ho-colorbtn[data-chatid="${chatId}"]`) ||
    document.querySelector(`main .ho-colorbtn[data-chatid="${chatId}"]`) ||

    // ✅ fallback
    document.querySelector(`.ho-colorbtn[data-chatid="${chatId}"]`)
  );
}



function getLinkForChatId(chatId) {
  return document.querySelector(`a[href*="/c/${chatId}"]`);
}

function getMainRowTail(link) {
  const row = link?.closest(".ho-main-row") || link?.parentElement;
  if (!row) return null;

  const direct = [...row.children].find(el => {
    if (!(el instanceof HTMLElement) || el === link) return false;
    return !!(
      el.querySelector?.('[data-testid="project-conversation-overflow-date"]') ||
      el.querySelector?.('[data-testid="project-conversation-overflow-menu"]') ||
      el.classList.contains("text-token-text-tertiary")
    );
  });

  return direct || null;
}

function placeMainActivityPill(link, btn) {
  const tail = getMainRowTail(link);
  if (!tail || !btn) return false;

  tail.classList.add("ho-main-row-tail");
  btn.classList.add("ho-colorbtn-tail");

  const date = tail.querySelector('[data-testid="project-conversation-overflow-date"]');
  if (date && date.nextElementSibling !== btn) {
    date.insertAdjacentElement("afterend", btn);
  } else if (!tail.contains(btn)) {
    tail.appendChild(btn);
  }

  return true;
}


function openMainPalettePortal(palette, btn, parentLink) {
  if (!palette.__hoHome) palette.__hoHome = parentLink;

  // ✅ remember + remove the inline-positioning class that breaks the portaled layout
  if (!palette.__hoPosClass) {
    palette.__hoPosClass =
      palette.classList.contains("ho-palette-sidebar") ? "ho-palette-sidebar" :
      palette.classList.contains("ho-palette-main-right") ? "ho-palette-main-right" :
      palette.classList.contains("ho-palette-main") ? "ho-palette-main" : "";
  }
  palette.classList.remove("ho-palette-sidebar","ho-palette-main","ho-palette-main-right");

  palette.classList.add("ho-floating", "show");
  document.body.appendChild(palette);

  // ✅ kill any leftover geometry constraints from old class rules
  palette.style.right = "auto";
  palette.style.bottom = "auto";
  palette.style.marginRight = "0";
  palette.style.marginLeft = "0";

  // wipe any old inline constraints
  palette.style.left = "";
  palette.style.top = "";
  palette.style.transform = "";

  const r = btn.getBoundingClientRect();

  palette.style.position = "fixed";
  //palette.style.left = `${Math.round(r.right + 10)}px`;
  //palette.style.top  = `${Math.round(r.top + r.height / 2)}px`;

    const isSide = btn.classList.contains("ho-colorbtn-side");

palette.style.left = `${Math.round(isSide ? (r.left - 10) : (r.right + 10))}px`;
palette.style.top  = `${Math.round(r.top + r.height / 2)}px`;
palette.style.transform = "translateY(-50%)";


  palette.style.transform = "translateY(-50%)";

  requestAnimationFrame(() => {
    const pr = palette.getBoundingClientRect();

    let left = Math.round(r.right + 10);
    if (left + pr.width > window.innerWidth - 8) left = Math.round(r.left - 10 - pr.width);
    if (left < 8) left = 8;

    const minTop = 8 + pr.height / 2;
    const maxTop = window.innerHeight - 8 - pr.height / 2;
    let top = Math.round(r.top + r.height / 2);
    top = Math.min(Math.max(top, minTop), maxTop);

    palette.style.left = `${left}px`;
    palette.style.top  = `${top}px`;
  });
}

function closePalette(palette) {
  if (!palette) return;

  palette.classList.remove("show", "ho-floating");

  // ✅ restore original positioning class (so sidebar/main inline layout still works)
  if (palette.__hoPosClass) palette.classList.add(palette.__hoPosClass);

  palette.style.position = "";
  palette.style.left = "";
  palette.style.top = "";
  palette.style.right = "";
  palette.style.bottom = "";
  palette.style.marginRight = "";
  palette.style.marginLeft = "";
  palette.style.transform = "";

  const home = palette.__hoHome;
  if (home && home.isConnected) home.appendChild(palette);
}


function setRowOverflowForPalette(btn, on) {
  const a = btn.closest("a[href]") || getLinkForChatId(btn?.dataset?.chatid || "");
  const row = a?.closest(".ho-main-row");
  if (!row) return;

  if (on) {
    if (row.__hoPrevOverflow == null) row.__hoPrevOverflow = row.style.overflow || "";
    row.style.overflow = "visible";
  } else {
    row.style.overflow = row.__hoPrevOverflow || "";
    row.__hoPrevOverflow = null;
  }
}

let hoOpenPalette = null;

function closeAllPalettes() {
  document.querySelectorAll(".ho-palette.show").forEach(p => closePalette(p));
  hoOpenPalette = null;
}

function openUnifiedTitlePanelForButton(btn) {
  const id = btn?.dataset?.chatid;
  const openPanel =
    window.H2O?.AutoEmojiTitle?.openPanel ||
    window.H2O?.AutoEmojiTitle?.openPicker ||
    window.H2O_AutoEmojiTitle_openPanel;
  if (!id || typeof openPanel !== "function") return false;

  const parentLink = btn.closest("a[href]") || getLinkForChatId(id);
  const r = btn.getBoundingClientRect();
  const ok = openPanel({
    chatId: id,
    anchor: parentLink,
    sourceEl: btn,
    x: Math.round(r.left),
    y: Math.round(r.bottom + 6),
  });
  return ok !== false;
}


function togglePaletteForButton(btn) {
  if (openUnifiedTitlePanelForButton(btn)) {
    closeAllPalettes();
    return;
  }

  const parentLink = btn.closest("a[href]") || getLinkForChatId(btn?.dataset?.chatid || "");
  if (!parentLink) return;

  const palBefore = getPaletteForBtn(btn) || parentLink.querySelector(".ho-palette");
  const wasOpen = !!palBefore && palBefore.classList.contains("show");

  closeAllPalettes();

  if (wasOpen) {
    setRowOverflowForPalette(btn, false);
    hoOpenPalette = null;
    return;
  }

  const palette = getPaletteForBtn(btn) || parentLink.querySelector(".ho-palette");
  if (!palette) return;

  palette.__hoOwnerBtn = btn;

  // ✅ ALWAYS portal (sidebar + main)
  setRowOverflowForPalette(btn, true);   // harmless for sidebar; helps main
  openMainPalettePortal(palette, btn, parentLink);

  hoOpenPalette = palette;
}


    /* ─────────────────────────────────────────
     5) Decorate chat links (add button + palette + restore saved row)
     ───────────────────────────────────────── */

 // ---- decorate links ----
function decorateLink(link) {
  if (!(link instanceof HTMLAnchorElement)) return;

  // ✅ Skip H2O-internal chat-link rows (Tag Viewer, Bubble Cloud candidate popup, in-shell
  // pages). Without this guard the decorator stamps colorbtn pills, palette buttons, and
  // active rings onto H2O-injected anchors that look like native chat links but are owned
  // by H2O surfaces (data-cgxui-owner / data-cgxui / data-h2o-tags-* / data-h2o-shell /
  // data-h2o-page). Detection is centralized in 9A1a Interface Kernel utils so all
  // decorator entry points use the same marker set.
  if (I.utils?.isInsideH2OInternalSurface?.(link)) return;

  // normalize text (handles “… See more” and "... See more")
  const text = (link.textContent || "")
    .trim()
    .toLowerCase()
    .replace(/^[.…]+(\s+)?/, "");

  // ✅ "See All / See more" control row
  if (text === "see all" || text === "see more") {
    link.classList.add("ho-seeall");
    link.classList.remove("ho-project-row"); // safety
    return;
  }

  // only chat links
  const id = I.nav.getChatIdFromHref(link.getAttribute("href"));
  if (!id) return;

  const isSidebar = !!link.closest("nav, aside") && !link.closest("main");

  // ✅ already decorated → refresh HEAT and exit (important for rescans)
  if (link.classList.contains("ho-has-colorbtn-side") || link.classList.contains("ho-has-colorbtn-main")) {
    const row = link.closest(".ho-main-row") || link.parentElement;
    const btn = isSidebar
      ? link.querySelector(".ho-colorbtn")
      : (row?.querySelector(`.ho-colorbtn[data-chatid="${id}"]`) || link.querySelector(".ho-colorbtn"));

    // ✅ palette may be portaled (floating in body) while open
    const palInline = link.querySelector(".ho-palette");
    const palFloating = document.querySelector(`.ho-palette.ho-floating[data-chatid="${id}"]`);

    if (btn && (palInline || palFloating)) {
      if (!isSidebar) placeMainActivityPill(link, btn);
      I.heat.applyToBtn(btn, id);
      return;
    }
    // ✅ Phase 2 leak fix: clean up partial state before re-decorating, so the
    // pointerdown / mousedown / click listeners attached to the old btn die
    // with the removed node instead of accumulating on every 1.2 s scan when
    // the palette has been portal'd away. Without this, each rescan that hits
    // a partially-decorated row re-creates the btn (and wires 3 fresh
    // listeners) while the old btn — still attached to link or its row —
    // keeps its 3 listeners forever.
    try { if (btn) btn.remove(); } catch (_) {}
    try { if (palInline) palInline.remove(); } catch (_) {}
    if (!isSidebar && row) {
      try {
        row.querySelectorAll(`.ho-colorbtn[data-chatid="${id}"]`).forEach(n => n.remove());
      } catch (_) {}
    }
    link.classList.remove("ho-has-colorbtn-side", "ho-has-colorbtn-main", "ho-has-colorbtn");
    // Now fall through to fresh decoration with no leftover btn/palette nodes.
  }

  link.classList.add("ho-has-colorbtn");
  link.classList.add(isSidebar ? "ho-has-colorbtn-side" : "ho-has-colorbtn-main");

  // project list wrapper
  if (!isSidebar && link.parentElement) {
    link.parentElement.classList.add("ho-main-row");
  }

  // --- create activity pill button ---
  const btn = document.createElement("span");
  btn.className = isSidebar
    ? "ho-colorbtn ho-colorbtn-side"
    : "ho-colorbtn ho-colorbtn-main ho-colorbtn-tail";

  btn.dataset.chatid = id;

  // make it behave like a button
  btn.setAttribute("role", "button");
  btn.setAttribute("aria-label", "Open chat list controls");
  btn.title = "Open chat list controls";
  btn.tabIndex = 0;

  btn.style.pointerEvents = "auto";
btn.style.zIndex = isSidebar ? "2" : "6";


    // ✅ BLOCK navigation that triggers on pointerdown/mousedown (before click)
["pointerdown", "mousedown"].forEach(evt => {
  btn.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, true);
});


  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    togglePaletteForButton(btn);
  }, true);

  // 🔥 apply heat visuals first (auto + override)
  I.heat.applyToBtn(btn, id);

  // --- palette container ---
  const palette = document.createElement("div");
  palette.className = "ho-palette " + (isSidebar ? "ho-palette-sidebar" : "ho-palette-main");

  palette.dataset.chatid = id;

  // --- row 1: HEAT override (AUTO/H/W/OFF) ---
  const heatRow = document.createElement("div");
  heatRow.className = "ho-palette-row";
  ["auto","hot","warm","off"].forEach(level => {
    const sw = document.createElement("div");
    sw.className = "ho-swatch heat";

    sw.textContent = level[0].toUpperCase(); // A H W O
    sw.title = `Heat: ${level}`;
    sw.dataset.mode = "heat";
    sw.dataset.level = level;
    heatRow.appendChild(sw);
  });

  // --- row 2: ROW background colors ---
  const rowRows = document.createElement("div");
  rowRows.className = "ho-palette-row";
  I.config.COLORS.forEach((c, idx) => {
    const sw = document.createElement("div");
    sw.className = "ho-swatch row";
    sw.style.backgroundColor = c.value.replace(/,1\)/, ",0.5)");
    sw.title = `Row: ${c.name}`;
    sw.dataset.mode = "row";
    sw.dataset.idx = String(idx);
    rowRows.appendChild(sw);
  });

  // append rows in order
  palette.appendChild(heatRow);
  palette.appendChild(rowRows);

if (isSidebar || !placeMainActivityPill(link, btn)) {
  link.appendChild(btn);
}
link.appendChild(palette);

  // restore ROW highlight state
  const rowIdx = I.store.getRow(id);
  if (rowIdx >= 0) applyRowByIndex(link, rowIdx);
}


  /* ─────────────────────────────────────────
     6) Sidebar "Projects" tagging + "See all/more" controls
     ───────────────────────────────────────── */

function normSeeText(el) {
  const t = (el && el.textContent) ? el.textContent : "";
  return t.trim().toLowerCase().replace(/^[.…]+(\s+)?/, "");
}


function findClickablePillTarget(el) {
  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    if (
      cur.tagName === "A" ||
      cur.tagName === "BUTTON" ||
      cur.getAttribute?.("role") === "button" ||
      cur.hasAttribute?.("tabindex")
    ) return cur;
    cur = cur.parentElement;
  }
  return el; // fallback
}

function markSidebarProjects() {
  const nav = document.querySelector("nav");
  if (!nav) return;

  // clear previous project tags (any element type)
  nav.querySelectorAll(".ho-project-row").forEach(el => el.classList.remove("ho-project-row"));

  // find "Projects" header (case-insensitive)
  const projectsHeader = [...nav.querySelectorAll("*")]
    .find(el => ((el.textContent || "").trim().toLowerCase() === "projects"));

  if (!projectsHeader) return;

  let started = false;
  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_ELEMENT, null);

  while (walker.nextNode()) {
    const el = walker.currentNode;
    const txt = ((el.textContent || "").trim().toLowerCase());

    if (el === projectsHeader) { started = true; continue; }
    if (!started) continue;

    // stop when we hit the next section
    if (txt === "your chats") break;

    // normalize label (handles "... See more" and "… See more")
    const label = txt.replace(/^[.…]+(\s+)?/, "");

    // Skip controls and nested project-chat rows; only project title rows get the dark container.
    if (
      !label ||
      label === "new project" ||
      label === "see all" ||
      label === "see more" ||
      label === "show all" ||
      label === "show more" ||
      label === "more"
    ) continue;

    const isSidebarItem = el.getAttribute?.("data-sidebar-item") === "true";
    const isClickable =
      el.tagName === "A" ||
      el.tagName === "BUTTON" ||
      el.getAttribute?.("role") === "button" ||
      el.hasAttribute?.("tabindex");

    if (!isSidebarItem || !isClickable) continue;

    // Skip expanded chats inside a project.
    const href = el.getAttribute?.("href") || "";
    if (href.includes("/c/")) continue;

    el.classList.add("ho-project-row");
  }
}




function markSeeControls() {
  const nav = document.querySelector("nav");
  if (!nav) return;

  const candidates = [...nav.querySelectorAll("a,button,div,span")];

  candidates.forEach(el => {
    const t = normSeeText(el);
    if (t === "see all" || t === "see more" || t === "show all" || t === "show more") {
      const pill = findClickablePillTarget(el);
      pill.classList.add("ho-seeall");
      pill.classList.remove("ho-project-row");
      pill.parentElement?.classList.remove("ho-project-row");
    }
  });
}


  /* ─────────────────────────────────────────
     7) Full scan pass (decorate + mark projects + controls + active ring)
     ───────────────────────────────────────── */

function scanSidebar() {
      if (I.lock.locked()) return;
  const paletteOpen = hoOpenPalette && hoOpenPalette.classList.contains("show");
  applyActivityStyle();

  // Grab ALL anchors from sidebar-ish + main list
  const allA = [
    ...document.querySelectorAll('nav a[href], aside a[href], main a[href]')
  ];

  const links = allA.filter(a => {
    const href = a.getAttribute("href") || "";
    return /\/(c|chat)\//.test(href);
  });

  // ✅ DON’T redecorate while palette is open (prevents “palette eaten” bug)
  if (!paletteOpen) {
    links.forEach(decorateLink);
  }

  // heat can still update safely
  // Defense-in-depth: even though `decorateLink` already skips H2O-internal anchors (so
  // they should never carry the .ho-has-colorbtn class), re-check here in case an older
  // decoration leaked onto an H2O surface before this guard shipped, or a future surface
  // gets temporarily mis-classified.
  document.querySelectorAll("a.ho-has-colorbtn").forEach(a => {
    if (I.utils?.isInsideH2OInternalSurface?.(a)) return;
    const id = I.nav.getChatIdFromHref(a.getAttribute("href") || "");
    const btn = a.querySelector(".ho-colorbtn");
    if (id && btn) I.heat.applyToBtn(btn, id);
  });

  if (!paletteOpen) {
    markSidebarProjects();
    markSeeControls();
    markActiveSidebarLink();
    ensureColorPriorityControl();
    scheduleColorPrioritySort();
  }
}

window.addEventListener(ACTIVITY_STYLE_EVENT, (event) => {
  applyActivityStyle(event?.detail?.style);
  if (!(hoOpenPalette && hoOpenPalette.classList.contains("show"))) {
    requestAnimationFrame(scanSidebar);
  }
}, true);

scanSidebar();


// ✅ FORCE rescans because ChatGPT lists are virtualized / lazy-rendered
let hoForceTick = 0;

setInterval(() => {
  if (hoOpenPalette && hoOpenPalette.classList.contains("show")) return;
  scanSidebar();
}, 1200);


requestAnimationFrame(scanSidebar);
setTimeout(scanSidebar, 600);
setTimeout(scanSidebar, 1500);



  /* ─────────────────────────────────────────
     8) Click handling: button toggle + swatches + close-outside
     ───────────────────────────────────────── */

 // ---- click handling ----
document.addEventListener("click", e => {
  const target = e.target;
/*
  // 1) left-click on color button: toggle its palette, do NOT navigate
  if (target instanceof HTMLElement && target.classList.contains("ho-colorbtn")) {
    e.preventDefault();
    e.stopPropagation();
    togglePaletteForButton(target);
    return;
  }
*/

// 2) click on palette swatch
if (target instanceof HTMLElement && target.classList.contains("ho-swatch")) {
  e.preventDefault();
  e.stopPropagation();

  const mode = target.dataset.mode || "";
  const pal = target.closest(".ho-palette");
  const id = pal?.dataset?.chatid;
  if (!id) return;

const btn = getBtnForChatId(id, pal);

  if (!btn) return;


const parentLink = btn.closest("a[href]") || pal.__hoHome || getLinkForChatId(id);
if (!parentLink) return;


  if (mode === "heat") {
    const level = target.dataset.level || "auto";
    I.store.setOverride(id, level);
    I.heat.applyToBtn(btn, id);
  } else if (mode === "row") {
    const idx = parseInt(target.dataset.idx || "0", 10);

    const current = I.store.getRow(id);

    if (current === idx) {
      applyRowByIndex(parentLink, -1);
      I.store.setRow(id, -1);
    } else {
      applyRowByIndex(parentLink, idx);
      I.store.setRow(id, idx);
    }
    scheduleColorPrioritySort();
  }

if (pal) closePalette(pal);

  return;
}

// ✅ if clicking inside palette, do nothing (don't close)
if (target instanceof HTMLElement && target.closest(".ho-palette")) {
  return;
}

if (target instanceof HTMLElement && target.closest(".ho-color-priority")) {
  return;
}

closeColorPriorityMenus();


  // 3) click elsewhere → close palettes
// 3) click elsewhere -> close (BUT not if clicking palette or button)
// close if click is NOT inside palette and NOT on the pill button (or its children)
if (target instanceof HTMLElement) {
  const insidePalette = !!target.closest(".ho-palette");
const isBtn = !!target.closest(".ho-colorbtn");


  if (!insidePalette && !isBtn) {
    document.querySelectorAll(".ho-palette.show").forEach(p => closePalette(p));
    hoOpenPalette = null;
  }
}


}, false);

// ✅ middle-click handler defined once, globally
document.addEventListener("auxclick", e => {
  if (e.button !== 1) return;
  const btn = e.target instanceof HTMLElement ? e.target.closest(".ho-colorbtn") : null;
  if (!btn) return;

  e.preventDefault();
  e.stopPropagation();
  togglePaletteForButton(btn);
}, true);




  /* ─────────────────────────────────────────
     9) Observe DOM changes + initial scan
     ───────────────────────────────────────── */

  // ---- observe DOM ----
const rescan = I.utils.debounce(scanSidebar, 50);
  const mo = new MutationObserver(rescan);
  mo.observe(document.body, { childList: true, subtree: true });

  scanSidebar();

window.addEventListener(I.nav.EVENT, markActiveSidebarLink, true);
window.__h2o_interface_decorator_booted = true;
})();
