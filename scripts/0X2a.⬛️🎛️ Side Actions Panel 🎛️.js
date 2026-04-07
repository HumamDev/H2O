// ==UserScript==
// @h2o-id             0b3d.side.actions.panel
// @name               0B3d.⬛️🎛️ Side Actions Panel 🎛️
// @namespace          H2O.Premium.CGX.side.actions.panel
// @author             HumamDev
// @version            0.4.3
// @revision           004
// @build              260331-230500
// @description        Narrow right-side action panel for user-facing feature actions with top tabs and future command-bar migration hooks.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  "use strict";

  const W = window;
  const TOPW = W.top || W;
  const D = document;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const API = (H2O.sideActionsPanel = H2O.sideActionsPanel || Object.create(null));
  if (API.__h2oSideActionsPanelReady === true && typeof API.ensureMounted === "function") {
    try { API.ensureMounted(); } catch {}
    return;
  }

  const TAG = "[H2O.SideActions]";
  const PANEL_W_PX = 248;
  const PANEL_MIN_H_PX = 140;
  const PANEL_MAX_H_VH = 58;
  const PANEL_TOP_FALLBACK_PX = 132;
  const PANEL_EDGE_OFFSET_PX = 12;
  const PANEL_GAP_PX = 10;
  const PANEL_REPOS_MS = 900;
  const ADOPT_POLL_MS = 1100;
  const TAB_PLACEMENT_PAGE_RIGHT = "page-right";
  const TAB_PLACEMENT_SIDEBAR_EDGE = "sidebar-edge";
  const SIDEBAR_EDGE_HOT_NEAR_PX = 26;
  const SIDEBAR_EDGE_HOT_BEHIND_PX = 18;
  const LAUNCHER_W_PX = 22;
  const LAUNCHER_H_PX = 32;
  const LAUNCHER_HIDE_SHIFT_PX = 11;
  const SIDEBAR_MASK_W_PX = LAUNCHER_HIDE_SHIFT_PX;
  const LAUNCHER_BOTTOM_DEFAULT_PX = 98;
  const LAUNCHER_STACK_GAP_PX = 6;

  const TAB_HIGHLIGHTS = "highlights";
  const TAB_SECTIONS = "sections";
  const TAB_MINIMAP = "minimap";
  const TAB_OTHER = "other";

  const DEFAULT_TABS = [
    { id: TAB_HIGHLIGHTS, label: "Highlights", order: 100 },
    { id: TAB_SECTIONS, label: "Sections", order: 200 },
    { id: TAB_MINIMAP, label: "MiniMap", order: 300 },
    { id: TAB_OTHER, label: "Other", order: 900 },
  ];

  const state = {
    mounted: false,
    mountReady: false,
    mounting: false,
    stylesMounted: false,
    listenersBound: false,
    root: null,
    launcher: null,
    panel: null,
    closeBtn: null,
    titleEl: null,
    tabRail: null,
    body: null,
    empty: null,
    activeTab: TAB_HIGHLIGHTS,
    open: false,
    tabs: new Map(),
    actions: new Map(),
    seq: 1,
    reflowRaf: 0,
    routeTimer: 0,
    adoptTimer: 0,
    launcherBottomPx: LAUNCHER_BOTTOM_DEFAULT_PX,
    tabPlacement: TAB_PLACEMENT_PAGE_RIGHT,
    bridgeInstalled: false,
    bridgeMoved: new Set(),
    edgeMask: null,
  };

  function warn(...args) {
    try { console.warn(TAG, ...args); } catch {}
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function dataNs() {
    return String(H2O.data?.ready?.ns?.NS_DISK || "h2o:prm:cgx:h2odata");
  }

  function keyOpen() {
    return `${dataNs()}:side-actions-panel:open:v1`;
  }

  function keyTab() {
    return `${dataNs()}:side-actions-panel:tab:v1`;
  }

  function lsGetStr(key, fallback = null) {
    try { return localStorage.getItem(String(key)) ?? fallback; } catch { return fallback; }
  }

  function lsSetStr(key, value) {
    try { localStorage.setItem(String(key), String(value)); return true; } catch { return false; }
  }

  function lsGetJson(key, fallback = null) {
    const raw = lsGetStr(key, null);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function lsSetJson(key, value) {
    try { localStorage.setItem(String(key), JSON.stringify(value)); return true; } catch { return false; }
  }

  function normalizeTabId(raw) {
    const id = String(raw || "").trim().toLowerCase();
    if (!id) return TAB_OTHER;
    if (id === "minimap") return TAB_MINIMAP;
    if (id === "sections") return TAB_SECTIONS;
    if (id === "highlights" || id === "highlight") return TAB_HIGHLIGHTS;
    if (id === "other" || id === "misc" || id === "general") return TAB_OTHER;
    return id;
  }

  function normalizeActionTone(raw) {
    const tone = String(raw || "").trim().toLowerCase();
    if (tone === "highlights") return TAB_HIGHLIGHTS;
    if (tone === "sections") return TAB_SECTIONS;
    if (tone === "minimap") return TAB_MINIMAP;
    return TAB_OTHER;
  }

  function normalizeTabPlacement(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (value === TAB_PLACEMENT_SIDEBAR_EDGE || value === "sidebar" || value === "left") return TAB_PLACEMENT_SIDEBAR_EDGE;
    return TAB_PLACEMENT_PAGE_RIGHT;
  }

  function keyTabPlacement() {
    return `${dataNs()}:side-actions-panel:tab-placement:v1`;
  }

  function readTabPlacement() {
    return normalizeTabPlacement(lsGetStr(keyTabPlacement(), TAB_PLACEMENT_PAGE_RIGHT));
  }

  function writeTabPlacement(placementRaw) {
    const next = normalizeTabPlacement(placementRaw);
    lsSetStr(keyTabPlacement(), next);
    return next;
  }

  function readOpen() {
    return !!lsGetJson(keyOpen(), false);
  }

  function writeOpen(open) {
    return !!lsSetJson(keyOpen(), !!open);
  }

  function readTab() {
    return normalizeTabId(lsGetStr(keyTab(), TAB_HIGHLIGHTS));
  }

  function writeTab(tabId) {
    const next = normalizeTabId(tabId);
    lsSetStr(keyTab(), next);
    return next;
  }

  function mountStyles() {
    if (state.stylesMounted) return;
    state.stylesMounted = true;
    const style = D.createElement("style");
    style.id = "h2o-side-actions-panel-style";
    style.textContent = `
.h2o-side-actions-root{
  position:fixed;
  top:${PANEL_TOP_FALLBACK_PX}px;
  z-index:1000025;
  width:${PANEL_W_PX}px;
  max-width:min(${PANEL_W_PX}px,calc(100vw - 20px));
  --h2o-side-actions-sidebar-edge-px:0px;
  pointer-events:none;
  --h2o-side-actions-bg:rgba(10,12,16,.96);
  --h2o-side-actions-bg-2:rgba(17,20,27,.98);
  --h2o-side-actions-line:rgba(255,255,255,.12);
  --h2o-side-actions-soft:rgba(255,255,255,.08);
  --h2o-side-actions-text:#ebeff6;
  --h2o-side-actions-dim:rgba(235,239,246,.72);
  --h2o-side-actions-gold:#f2d67b;
  --h2o-side-actions-violet:#d6b0f8;
  --h2o-side-actions-red:#ff9a9a;
  --h2o-side-actions-blue:#8ecfff;
  --h2o-side-actions-sidebar-mask-bg:rgba(24,24,24,.98);
  --h2o-side-actions-sidebar-mask-w:${SIDEBAR_MASK_W_PX}px;
  --h2o-side-actions-launcher-bg:#14161a;
  --h2o-side-actions-launcher-fg:#e8edf6;
  --h2o-side-actions-launcher-border:rgba(255,255,255,.24);
  --h2o-side-actions-launcher-shadow:0 8px 18px rgba(0,0,0,.38);
}
.h2o-side-actions-root *{box-sizing:border-box}
.h2o-side-actions-launcher{
  position:fixed;
  bottom:${LAUNCHER_BOTTOM_DEFAULT_PX}px;
  z-index:2;
  width:${LAUNCHER_W_PX}px;
  min-width:${LAUNCHER_W_PX}px;
  height:${LAUNCHER_H_PX}px;
  min-height:${LAUNCHER_H_PX}px;
  padding:0;
  display:flex;
  align-items:center;
  justify-content:center;
  text-align:center;
  font-weight:700;
  line-height:1;
  border:1px solid var(--h2o-side-actions-launcher-border,rgba(255,255,255,.24));
  background:var(--h2o-side-actions-launcher-bg,#14161a);
  color:var(--h2o-side-actions-launcher-fg,#e8edf6);
  box-shadow:var(--h2o-side-actions-launcher-shadow,0 8px 18px rgba(0,0,0,.38));
  pointer-events:auto;
  cursor:pointer;
  opacity:.52;
  transition:transform .18s ease, opacity .18s ease, filter .18s ease, left .18s ease, right .18s ease;
}
.h2o-side-actions-root[data-tab-placement="sidebar-edge"] .h2o-side-actions-launcher{
  left:var(--h2o-side-actions-sidebar-edge-px,0px);
  right:auto;
  transform:translateX(-${LAUNCHER_HIDE_SHIFT_PX}px);
  border-radius:0 10px 10px 0;
  border-left:0;
}
.h2o-side-actions-root[data-tab-placement="page-right"] .h2o-side-actions-launcher{
  right:0;
  left:auto;
  transform:translateX(${LAUNCHER_HIDE_SHIFT_PX}px);
  border-radius:10px 0 0 10px;
  border-right:0;
}
.h2o-side-actions-root.edge-hot .h2o-side-actions-launcher,
.h2o-side-actions-launcher:hover,
.h2o-side-actions-root.is-open .h2o-side-actions-launcher{
  opacity:1;
  transform:translateX(0);
  filter:brightness(1.08);
}
.h2o-side-actions-root .sidebarEdgeMask{position:fixed;top:0;bottom:0;left:calc(var(--h2o-side-actions-sidebar-edge-px,0px) - var(--h2o-side-actions-sidebar-mask-w,11px));width:var(--h2o-side-actions-sidebar-mask-w,11px);background:var(--h2o-side-actions-sidebar-mask-bg,rgba(24,24,24,.98));pointer-events:none;opacity:0;z-index:3;transition:opacity .18s ease,left .18s ease}
.h2o-side-actions-root[data-tab-placement="sidebar-edge"] .sidebarEdgeMask{opacity:1}
.h2o-side-actions-panel{
  position:relative;
  z-index:4;
  width:100%;
  min-height:${PANEL_MIN_H_PX}px;
  max-height:min(${PANEL_MAX_H_VH}vh, calc(100vh - 28px));
  display:grid;
  grid-template-rows:auto auto 1fr;
  gap:8px;
  padding:10px;
  border:1px solid var(--h2o-side-actions-line);
  border-radius:16px;
  background:linear-gradient(180deg,var(--h2o-side-actions-bg-2),var(--h2o-side-actions-bg));
  box-shadow:0 18px 34px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.04) inset;
  backdrop-filter:blur(16px) saturate(138%);
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  transition:opacity .18s ease, transform .18s ease, visibility .18s ease;
}
.h2o-side-actions-root[data-tab-placement="sidebar-edge"] .h2o-side-actions-panel{
  transform:translateX(-14px) scale(.985);
  transform-origin:top left;
}
.h2o-side-actions-root[data-tab-placement="page-right"] .h2o-side-actions-panel{
  transform:translateX(14px) scale(.985);
  transform-origin:top right;
}
.h2o-side-actions-root.is-open .h2o-side-actions-panel{
  position:relative;
  z-index:3;
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  transform:translateX(0) scale(1);
}
.h2o-side-actions-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  min-height:24px;
}
.h2o-side-actions-title{
  font:600 12px/1.1 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  letter-spacing:.02em;
  color:var(--h2o-side-actions-text);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.h2o-side-actions-close{
  border:1px solid rgba(255,255,255,.14);
  background:rgba(255,255,255,.05);
  color:var(--h2o-side-actions-dim);
  border-radius:9px;
  min-width:22px;
  width:22px;
  height:22px;
  padding:0;
  cursor:pointer;
}
.h2o-side-actions-tabrail{
  display:flex;
  align-items:center;
  gap:6px;
  overflow:auto hidden;
  scrollbar-width:none;
  min-width:0;
}
.h2o-side-actions-tabrail::-webkit-scrollbar{display:none}
.h2o-side-actions-tab{
  flex:0 0 auto;
  min-height:24px;
  padding:4px 10px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.05);
  color:var(--h2o-side-actions-dim);
  font:600 11px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  cursor:pointer;
  white-space:nowrap;
  transition:filter .14s ease, transform .14s ease, border-color .14s ease, background .14s ease, color .14s ease;
}
.h2o-side-actions-tab:hover{filter:brightness(1.06); transform:translateY(-1px)}
.h2o-side-actions-tab.is-active{
  color:#f8fbff;
  border-color:rgba(255,255,255,.2);
  box-shadow:0 0 0 1px rgba(255,255,255,.04) inset;
}
.h2o-side-actions-tab[data-tab="highlights"].is-active{
  background:linear-gradient(180deg,rgba(170,132,43,.32),rgba(95,64,14,.24));
  border-color:rgba(247,222,136,.34);
  color:var(--h2o-side-actions-gold);
}
.h2o-side-actions-tab[data-tab="sections"].is-active{
  background:linear-gradient(180deg,rgba(136,89,177,.32),rgba(72,42,113,.24));
  border-color:rgba(220,184,250,.34);
  color:var(--h2o-side-actions-violet);
}
.h2o-side-actions-tab[data-tab="minimap"].is-active{
  background:linear-gradient(180deg,rgba(186,56,56,.32),rgba(103,25,25,.24));
  border-color:rgba(255,147,147,.34);
  color:var(--h2o-side-actions-red);
}
.h2o-side-actions-tab[data-tab="other"].is-active{
  background:linear-gradient(180deg,rgba(50,133,183,.28),rgba(21,69,105,.22));
  border-color:rgba(139,208,255,.28);
  color:var(--h2o-side-actions-blue);
}
.h2o-side-actions-body{
  min-height:0;
  overflow:auto;
  display:grid;
  align-content:start;
  gap:8px;
  padding-right:1px;
}
.h2o-side-actions-empty{
  padding:16px 10px;
  border:1px dashed rgba(255,255,255,.12);
  border-radius:12px;
  color:rgba(235,239,246,.58);
  font:500 11px/1.4 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  text-align:center;
}
.h2o-side-actions-action{
  width:100%;
  min-height:30px;
  display:flex;
  align-items:center;
  justify-content:flex-start;
  text-align:left;
  gap:8px;
  padding:7px 10px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.05);
  color:var(--h2o-side-actions-text);
  font:600 11px/1.2 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;
  cursor:pointer;
  transition:transform .14s ease, filter .14s ease, border-color .14s ease, background .14s ease;
}
.h2o-side-actions-action:hover{filter:brightness(1.06); transform:translateY(-1px)}
.h2o-side-actions-action:disabled{
  opacity:.5;
  cursor:default;
  transform:none !important;
  filter:none !important;
}
.h2o-side-actions-action[data-tone="highlights"]{
  border-color:rgba(242,214,123,.22);
  background:linear-gradient(180deg,rgba(152,117,37,.18),rgba(85,58,12,.12));
}
.h2o-side-actions-action[data-tone="sections"]{
  border-color:rgba(214,176,248,.22);
  background:linear-gradient(180deg,rgba(126,82,165,.18),rgba(63,36,101,.12));
}
.h2o-side-actions-action[data-tone="minimap"]{
  border-color:rgba(255,154,154,.22);
  background:linear-gradient(180deg,rgba(176,54,54,.18),rgba(92,24,24,.12));
}
.h2o-side-actions-action[data-tone="other"]{
  border-color:rgba(142,207,255,.2);
  background:linear-gradient(180deg,rgba(55,130,181,.16),rgba(20,63,97,.11));
}
.h2o-side-actions-action .sa-label{
  flex:1 1 auto;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.h2o-side-actions-action .sa-badge{
  flex:0 0 auto;
  min-width:8px;
  height:8px;
  border-radius:999px;
  background:currentColor;
  opacity:.85;
}
`;
    D.head?.appendChild(style);
  }

  function buildShell() {
    const root = D.createElement("div");
    root.className = "h2o-side-actions-root";
    root.innerHTML = `
<div class="sidebarEdgeMask" aria-hidden="true"></div>
<button type="button" class="h2o-side-actions-launcher" aria-pressed="false" aria-label="Open side actions panel" title="Open side actions panel">◂</button>
<div class="h2o-side-actions-panel" aria-hidden="true">
  <div class="h2o-side-actions-head">
    <div class="h2o-side-actions-title">Side Actions</div>
    <button type="button" class="h2o-side-actions-close" aria-label="Close side actions panel" title="Close">×</button>
  </div>
  <div class="h2o-side-actions-tabrail" role="tablist" aria-label="Side action tabs"></div>
  <div class="h2o-side-actions-body">
    <div class="h2o-side-actions-empty">No actions in this tab yet.</div>
  </div>
</div>
`;
    D.documentElement.appendChild(root);
    return root;
  }

  function cacheShellRefs(root) {
    state.root = root;
    state.launcher = root.querySelector(".h2o-side-actions-launcher");
    state.edgeMask = root.querySelector(".sidebarEdgeMask");
    state.panel = root.querySelector(".h2o-side-actions-panel");
    state.closeBtn = root.querySelector(".h2o-side-actions-close");
    state.titleEl = root.querySelector(".h2o-side-actions-title");
    state.tabRail = root.querySelector(".h2o-side-actions-tabrail");
    state.body = root.querySelector(".h2o-side-actions-body");
    state.empty = root.querySelector(".h2o-side-actions-empty");
  }


  function _isVisibleBox(el) {
    if (!el || !el.isConnected) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = el.getBoundingClientRect();
      return Number.isFinite(r.right) && Number.isFinite(r.width) && r.width > 2 && r.height > 2;
    } catch {
      return false;
    }
  }

  function _rightPx(el) {
    try {
      const r = el.getBoundingClientRect();
      const right = Math.max(r.right, r.left + r.width);
      return Math.max(0, Math.round(Number.isFinite(right) ? right : 0));
    } catch {
      return 0;
    }
  }

  function _isOpenSlideover(el) {
    if (!el || !el.isConnected) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const rect = el.getBoundingClientRect();
      const w = Number(rect?.width || 0);
      const h = Number(rect?.height || 0);
      const op = Number.parseFloat(String(cs.opacity || "1"));
      return w > 20 && h > 20 && Number.isFinite(op) && op > 0.02;
    } catch {
      return false;
    }
  }

  function _isInteractiveTinyRail(el) {
    if (!el || !el.isConnected || !_isVisibleBox(el)) return false;
    try {
      if (el.hasAttribute("inert")) return false;
      const cs = getComputedStyle(el);
      const op = Number.parseFloat(String(cs.opacity || "1"));
      const pe = String(cs.pointerEvents || "").toLowerCase();
      if (pe === "none") return false;
      if (Number.isFinite(op) && op < 0.2) return false;
      const rect = el.getBoundingClientRect();
      return Number(rect?.width || 0) > 20;
    } catch {
      return false;
    }
  }

  function getSidebarRightPx() {
    const slideover = D.querySelector("#stage-slideover-sidebar");
    const tiny = D.querySelector("#stage-sidebar-tiny-bar");
    const aside = D.querySelector("aside");
    if (_isOpenSlideover(slideover)) return _rightPx(slideover);
    if (_isInteractiveTinyRail(tiny)) return _rightPx(tiny);
    if (_isVisibleBox(slideover)) return _rightPx(slideover);
    if (_isVisibleBox(aside)) return _rightPx(aside);
    return 0;
  }

  function isPointerNearSidebarEdge(clientXRaw = 0, clientYRaw = 0, anchorTopRaw = 0, anchorHeightRaw = LAUNCHER_H_PX) {
    const edge = Math.max(0, Math.round(Number(getSidebarRightPx() || 0)));
    const clientX = Math.max(0, Math.round(Number(clientXRaw || 0)));
    const clientY = Math.max(0, Math.round(Number(clientYRaw || 0)));
    const nearX = clientX >= Math.max(0, edge - SIDEBAR_EDGE_HOT_BEHIND_PX) && clientX <= (edge + SIDEBAR_EDGE_HOT_NEAR_PX);
    const centerY = Math.max(0, Math.round(Number(anchorTopRaw || 0) + (Number(anchorHeightRaw || LAUNCHER_H_PX) / 2)));
    const nearY = Math.abs(clientY - centerY) <= Math.max(96, Math.round(Number(anchorHeightRaw || LAUNCHER_H_PX) * 2.5));
    return nearX && nearY;
  }

  function isPointerNearPageRightEdge(clientXRaw = 0, clientYRaw = 0, anchorTopRaw = 0, anchorHeightRaw = LAUNCHER_H_PX) {
    const vw = Math.max(Number(W.innerWidth || 0), Number(D.documentElement?.clientWidth || 0));
    const clientX = Math.max(0, Math.round(Number(clientXRaw || 0)));
    const clientY = Math.max(0, Math.round(Number(clientYRaw || 0)));
    const nearX = clientX >= Math.max(0, vw - 24);
    const centerY = Math.max(0, Math.round(Number(anchorTopRaw || 0) + (Number(anchorHeightRaw || LAUNCHER_H_PX) / 2)));
    const nearY = Math.abs(clientY - centerY) <= Math.max(96, Math.round(Number(anchorHeightRaw || LAUNCHER_H_PX) * 2.5));
    return nearX && nearY;
  }

  function syncLauncherSkinFromCommandBar() {
    const root = state.root;
    if (!root) return;
    let bg = '#14161a';
    let fg = '#e8edf6';
    let border = 'rgba(255,255,255,.24)';
    let shadow = '0 8px 18px rgba(0,0,0,.38)';
    const fold = D.querySelector('.h2o-archive-dock .fold');
    if (fold && fold instanceof Element && fold.isConnected) {
      try {
        const cs = getComputedStyle(fold);
        bg = String(cs.backgroundColor || bg);
        fg = String(cs.color || fg);
        border = String(cs.borderTopColor || cs.borderRightColor || border);
        shadow = String(cs.boxShadow || shadow);
      } catch {}
    }
    root.style.setProperty('--h2o-side-actions-launcher-bg', bg);
    root.style.setProperty('--h2o-side-actions-launcher-fg', fg);
    root.style.setProperty('--h2o-side-actions-launcher-border', border);
    root.style.setProperty('--h2o-side-actions-launcher-shadow', shadow);
  }

  function getSidebarMaskColor() {
    const picks = [
      D.querySelector("#stage-slideover-sidebar"),
      D.querySelector("#stage-sidebar-tiny-bar"),
      D.querySelector("aside"),
      D.body,
      D.documentElement,
    ].filter(Boolean);
    for (const el of picks) {
      try {
        const bg = String(getComputedStyle(el).backgroundColor || "").trim();
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "rgba(0,0,0,0)" && bg !== "transparent") return bg;
      } catch {}
    }
    return "rgba(24,24,24,.98)";
  }

  function findCommandBarFoldRect() {
    const fold = D.querySelector(".h2o-archive-dock .fold");
    if (!fold || !(fold instanceof Element) || !fold.isConnected) return null;
    try {
      const cs = getComputedStyle(fold);
      const rect = fold.getBoundingClientRect();
      if (cs.display === "none" || cs.visibility === "hidden") return null;
      if ((rect.width || 0) < 10 || (rect.height || 0) < 10) return null;
      return rect;
    } catch {
      return null;
    }
  }

  function findMiniMapAnchor() {
    const selectors = [
      '[data-h2o-minimap-root]',
      '[data-cgxui-owner="mnmp"]',
      '[data-cgxui-owner="mm"]',
      '[class*="minimap"]',
      '[class*="MiniMap"]',
      '.ho-mm-shell',
      '.ho-mm-wrap',
      '.h2o-minimap',
      '.cgxui-minimap-wrap',
    ];
    for (const sel of selectors) {
      const list = Array.from(D.querySelectorAll(sel));
      for (const node of list) {
        if (!node || !(node instanceof Element) || !node.isConnected) continue;
        try {
          const cs = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          if ((rect.width || 0) < 24 || (rect.height || 0) < 24) continue;
          return rect;
        } catch {}
      }
    }
    return null;
  }

  function positionRoot() {
    const root = state.root;
    if (!root) return;
    const placement = state.tabPlacement || readTabPlacement();
    const sidebarEdgePx = Math.max(0, Math.round(Number(getSidebarRightPx() || 0)));
    let top = PANEL_TOP_FALLBACK_PX;
    const anchor = findMiniMapAnchor();
    if (anchor) top = Math.round(anchor.bottom + PANEL_GAP_PX);
    const maxTop = Math.max(16, Math.round((W.innerHeight || D.documentElement?.clientHeight || 800) - 180));
    const nextTop = Math.max(16, Math.min(top, maxTop));
    const viewportW = Math.max(Number(W.innerWidth || 0), Number(D.documentElement?.clientWidth || 1024));
    root.style.top = `${nextTop}px`;
    root.dataset.tabPlacement = placement;
    root.style.setProperty('--h2o-side-actions-sidebar-edge-px', `${sidebarEdgePx}px`);
    root.style.setProperty('--h2o-side-actions-sidebar-mask-bg', getSidebarMaskColor());
    syncLauncherSkinFromCommandBar();
    if (state.edgeMask) {
      state.edgeMask.style.left = `${sidebarEdgePx - SIDEBAR_MASK_W_PX}px`;
      state.edgeMask.style.width = `${SIDEBAR_MASK_W_PX}px`;
    }
    if (placement === TAB_PLACEMENT_PAGE_RIGHT) {
      const maxPanelW = Math.max(180, Math.round(viewportW - PANEL_EDGE_OFFSET_PX - 16));
      root.style.left = 'auto';
      root.style.right = `${PANEL_EDGE_OFFSET_PX}px`;
      root.style.maxWidth = `min(${PANEL_W_PX}px, ${maxPanelW}px)`;
      if (state.launcher) {
        state.launcher.style.left = 'auto';
        state.launcher.style.right = '0px';
      }
    } else {
      const nextLeft = Math.max(0, sidebarEdgePx + PANEL_EDGE_OFFSET_PX);
      const maxPanelW = Math.max(180, Math.round(viewportW - nextLeft - 16));
      root.style.left = `${nextLeft}px`;
      root.style.right = 'auto';
      root.style.maxWidth = `min(${PANEL_W_PX}px, ${maxPanelW}px)`;
      if (state.launcher) {
        state.launcher.style.left = `${sidebarEdgePx}px`;
        state.launcher.style.right = 'auto';
      }
    }
  }

  function positionLauncher() {
    const launcher = state.launcher;
    if (!launcher) return;
    let foldRect = null;
    const cbPlacement = TOPW.H2O?.commandBar?.getTabPlacement?.();
    if (!cbPlacement || normalizeTabPlacement(cbPlacement) === (state.tabPlacement || readTabPlacement())) {
      foldRect = findCommandBarFoldRect();
    }
    const viewportH = Math.max(Number(W.innerHeight || 0), Number(D.documentElement?.clientHeight || 800));
    const bottom = foldRect
      ? Math.max(16, Math.round((viewportH - foldRect.bottom) + foldRect.height + LAUNCHER_STACK_GAP_PX))
      : LAUNCHER_BOTTOM_DEFAULT_PX;
    state.launcherBottomPx = bottom;
    launcher.style.bottom = `${bottom}px`;
  }

  function applyTabPlacement(placementRaw, persist = false) {
    const placement = persist ? writeTabPlacement(placementRaw) : normalizeTabPlacement(placementRaw);
    state.tabPlacement = placement;
    if (state.root) state.root.dataset.tabPlacement = placement;
    positionRoot();
    positionLauncher();
    return placement;
  }

  function sortedTabs() {
    const list = Array.from(state.tabs.values());
    list.sort((a, b) => {
      const ao = Number(a.order) || 0;
      const bo = Number(b.order) || 0;
      if (ao !== bo) return ao - bo;
      return String(a.label || "").localeCompare(String(b.label || ""));
    });
    return list;
  }

  function sortedActionsForTab(tabId) {
    const tid = normalizeTabId(tabId);
    const list = Array.from(state.actions.values()).filter((rec) => normalizeTabId(rec.tabId) === tid);
    list.sort((a, b) => {
      const ao = Number(a.order) || 0;
      const bo = Number(b.order) || 0;
      if (ao !== bo) return ao - bo;
      return (a.seq || 0) - (b.seq || 0);
    });
    return list;
  }

  function ensureDefaultTabs() {
    for (const tab of DEFAULT_TABS) registerTab(tab);
  }

  function ensureMounted() {
    mountStyles();
    let root = state.root;
    if (!root || !root.isConnected) {
      root = D.querySelector(".h2o-side-actions-root");
      if (!root) root = buildShell();
      cacheShellRefs(root);
      state.mounted = true;
      state.mountReady = false;
    }
    if (state.mounting) return state.root || root;
    if (!state.mountReady) {
      state.mounting = true;
      try {
        ensureDefaultTabs();
        state.activeTab = readTab();
        if (!state.tabs.has(state.activeTab)) state.activeTab = DEFAULT_TABS[0].id;
        state.open = readOpen();
        state.tabPlacement = readTabPlacement();
        renderTabs();
        renderActions();
        if (!state.listenersBound) bindShellListeners();
        applyOpenState(state.open, false);
        applyActiveTab(state.activeTab, false);
        applyTabPlacement(state.tabPlacement, false);
        ensureCommandBarBridge();
        state.mountReady = true;
      } finally {
        state.mounting = false;
      }
    }
    return state.root;
  }

  function renderTabs() {
    ensureMounted();
    if (!state.tabRail) return;
    const frag = D.createDocumentFragment();
    for (const tab of sortedTabs()) {
      const btn = D.createElement("button");
      btn.type = "button";
      btn.className = "h2o-side-actions-tab";
      btn.dataset.tab = tab.id;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.id === state.activeTab ? "true" : "false");
      btn.textContent = String(tab.label || tab.id);
      btn.addEventListener("click", () => {
        applyActiveTab(tab.id, true);
      });
      frag.appendChild(btn);
    }
    state.tabRail.replaceChildren(frag);
  }

  function computeActionLabel(def) {
    if (def?.kind === "dom") return String(def.text || def.label || def.title || readNodeLabel(def.sourceEl) || def.id || "").trim();
    return String(def.text || def.label || def.title || def.id || "").trim();
  }

  function ensureDomActionMounted(rec) {
    if (!rec?.node || !rec?.sourceEl) return;
    if (rec.sourceEl.parentElement !== rec.node) rec.node.appendChild(rec.sourceEl);
  }

  function evaluateFlag(value, ctx = {}) {
    if (typeof value !== "function") return !!value;
    try { return !!value(ctx); } catch (e) { warn("flag resolver failed", e); return false; }
  }

  function evaluateDisabled(value, ctx = {}) {
    if (typeof value !== "function") return !!value;
    try { return !!value(ctx); } catch (e) { warn("disabled resolver failed", e); return false; }
  }

  function buildActionNode(rec) {
    const btn = D.createElement("button");
    btn.type = "button";
    btn.className = "h2o-side-actions-action";
    btn.innerHTML = `<span class="sa-label"></span><span class="sa-badge" aria-hidden="true"></span>`;
    btn.addEventListener("click", (ev) => {
      if (btn.disabled) return;
      try {
        const res = rec.onClick?.({ id: rec.id, owner: rec.owner, el: btn, event: ev });
        if (res && typeof res.then === "function") res.catch((e) => warn(`action failed: ${rec.id}`, e));
      } catch (e) {
        warn(`action failed: ${rec.id}`, e);
      }
    });
    rec.node = btn;
    patchActionNode(rec);
    return btn;
  }

  function patchActionNode(rec) {
    const btn = rec?.node;
    if (!btn) return;
    const tone = normalizeActionTone(rec.tone || rec.tabId);
    const label = computeActionLabel(rec);
    const hidden = evaluateFlag(rec.hidden, { rec, id: rec.id, owner: rec.owner });
    const disabled = evaluateDisabled(rec.disabled, { rec, id: rec.id, owner: rec.owner });
    btn.dataset.tone = tone;
    btn.dataset.tab = normalizeTabId(rec.tabId);
    btn.hidden = hidden;
    if (rec?.kind === "dom") {
      ensureDomActionMounted(rec);
      btn.title = String(rec.title || label || "");
      if (rec.sourceEl && "disabled" in rec.sourceEl) {
        try { rec.sourceEl.disabled = disabled; } catch {}
      }
      return;
    }
    btn.disabled = disabled;
    btn.title = String(rec.title || label || "");
    btn.setAttribute("aria-label", btn.title || label);
    const labelEl = btn.querySelector(".sa-label");
    if (labelEl) labelEl.textContent = label;
  }

  function renderActions() {
    ensureMounted();
    adoptCommandBarControls();
    if (!state.body) return;
    const active = normalizeTabId(state.activeTab);
    const items = sortedActionsForTab(active);
    const frag = D.createDocumentFragment();
    let visibleCount = 0;
    for (const rec of items) {
      if (!rec.node || !rec.node.isConnected) buildActionNode(rec);
      patchActionNode(rec);
      if (rec.node?.hidden) continue;
      visibleCount += 1;
      frag.appendChild(rec.node);
    }
    if (visibleCount === 0) {
      if (!state.empty) {
        state.empty = D.createElement("div");
        state.empty.className = "h2o-side-actions-empty";
      }
      state.empty.textContent = "No actions in this tab yet.";
      frag.appendChild(state.empty);
    }
    state.body.replaceChildren(frag);
    const tab = state.tabs.get(active);
    if (state.titleEl) state.titleEl.textContent = tab?.label ? `${tab.label} Actions` : "Side Actions";
    for (const btn of Array.from(state.tabRail?.querySelectorAll(".h2o-side-actions-tab") || [])) {
      const isActive = normalizeTabId(btn.dataset.tab || "") === active;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
    }
  }

  function scheduleRender() {
    if (state.reflowRaf) return;
    state.reflowRaf = W.requestAnimationFrame(() => {
      state.reflowRaf = 0;
      renderTabs();
      renderActions();
      positionRoot();
      positionLauncher();
    });
  }

  function applyOpenState(open, persist = true) {
    ensureMounted();
    const next = !!open;
    state.open = next;
    state.root?.classList.toggle("is-open", next);
    state.panel?.setAttribute("aria-hidden", next ? "false" : "true");
    if (state.launcher) {
      state.launcher.textContent = next ? "▸" : "◂";
      state.launcher.title = next ? "Close side actions panel" : "Open side actions panel";
      state.launcher.setAttribute("aria-label", state.launcher.title);
      state.launcher.setAttribute("aria-pressed", next ? "true" : "false");
    }
    if (persist) writeOpen(next);
    positionRoot();
    positionLauncher();
    return next;
  }

  function applyActiveTab(tabIdRaw, persist = true) {
    ensureMounted();
    const next = state.tabs.has(normalizeTabId(tabIdRaw)) ? normalizeTabId(tabIdRaw) : DEFAULT_TABS[0].id;
    state.activeTab = next;
    if (persist) writeTab(next);
    renderActions();
    return next;
  }

  function registerTab(tabDef = {}) {
    const id = normalizeTabId(tabDef.id);
    if (!id) return false;
    const existing = state.tabs.get(id) || {};
    state.tabs.set(id, {
      id,
      label: String(tabDef.label || existing.label || id).trim(),
      order: Number(tabDef.order ?? existing.order) || 500,
      owner: String(tabDef.owner || existing.owner || "sap").trim(),
    });
    if (state.mountReady) scheduleRender();
    return true;
  }

  function registerAction(actionDef = {}) {
    ensureMounted();
    const id = String(actionDef.id || "").trim();
    const owner = String(actionDef.owner || "").trim();
    if (!id || !owner) return false;
    const tabId = normalizeTabId(actionDef.tabId || actionDef.tab || actionDef.windowId || actionDef.windowScope || TAB_OTHER);
    if (!state.tabs.has(tabId)) registerTab({ id: tabId, label: actionDef.tabLabel || tabId, owner });
    const rec = {
      id,
      owner,
      tabId,
      text: actionDef.text,
      label: actionDef.label,
      title: actionDef.title,
      order: Number(actionDef.order) || 0,
      tone: actionDef.tone || tabId,
      hidden: actionDef.hidden,
      disabled: actionDef.disabled,
      onClick: typeof actionDef.onClick === "function" ? actionDef.onClick : null,
      seq: state.seq += 1,
      node: null,
      kind: actionDef.kind === "dom" ? "dom" : "button",
      sourceEl: actionDef.kind === "dom" ? actionDef.sourceEl || null : null,
      meta: isObj(actionDef.meta) ? { ...actionDef.meta } : Object.create(null),
    };
    const existing = state.actions.get(id);
    if (existing?.node?.isConnected) {
      try { existing.node.remove(); } catch {}
    }
    state.actions.set(id, rec);
    if (state.mountReady) scheduleRender();
    return true;
  }

  function patchAction(idRaw, patch = {}) {
    const id = String(idRaw || "").trim();
    const rec = state.actions.get(id);
    if (!rec || !isObj(patch)) return false;
    if ("tabId" in patch || "tab" in patch || "windowId" in patch || "windowScope" in patch) {
      rec.tabId = normalizeTabId(patch.tabId || patch.tab || patch.windowId || patch.windowScope || rec.tabId);
      if (!state.tabs.has(rec.tabId)) registerTab({ id: rec.tabId, label: rec.tabId, owner: rec.owner });
    }
    if ("text" in patch) rec.text = patch.text;
    if ("label" in patch) rec.label = patch.label;
    if ("title" in patch) rec.title = patch.title;
    if ("order" in patch) rec.order = Number(patch.order) || 0;
    if ("tone" in patch) rec.tone = patch.tone;
    if ("hidden" in patch) rec.hidden = patch.hidden;
    if ("disabled" in patch) rec.disabled = patch.disabled;
    if ("onClick" in patch && typeof patch.onClick === "function") rec.onClick = patch.onClick;
    patchActionNode(rec);
    if (state.mountReady) scheduleRender();
    return true;
  }

  function removeOwner(ownerIdRaw = "") {
    const ownerId = String(ownerIdRaw || "").trim();
    if (!ownerId) return false;
    for (const [id, rec] of Array.from(state.actions.entries())) {
      if (rec.owner !== ownerId) continue;
      try { rec.node?.remove?.(); } catch {}
      state.actions.delete(id);
      state.bridgeMoved.delete(id);
    }
    for (const [id, tab] of Array.from(state.tabs.entries())) {
      if (String(tab.owner || "") !== ownerId) continue;
      const stillUsed = Array.from(state.actions.values()).some((rec) => normalizeTabId(rec.tabId) === id);
      const isDefault = DEFAULT_TABS.some((item) => item.id === id);
      if (!stillUsed && !isDefault) state.tabs.delete(id);
    }
    if (!state.tabs.has(state.activeTab)) state.activeTab = DEFAULT_TABS[0].id;
    if (state.mountReady) scheduleRender();
    return true;
  }

  function bindShellListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;
    state.launcher?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      applyOpenState(!state.open, true);
    });
    state.closeBtn?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      applyOpenState(false, true);
    });
    state.launcher?.addEventListener("pointerenter", () => state.root?.classList.toggle("edge-hot", true));
    state.launcher?.addEventListener("pointerleave", () => state.root?.classList.toggle("edge-hot", false));
    D.addEventListener("pointermove", (ev) => {
      const launcher = state.launcher;
      if (!launcher) return;
      let top = 0;
      let height = LAUNCHER_H_PX;
      try {
        const rect = launcher.getBoundingClientRect();
        top = Number(rect.top || 0);
        height = Math.max(1, Number(rect.height || LAUNCHER_H_PX));
      } catch {}
      const hot = (state.tabPlacement || readTabPlacement()) === TAB_PLACEMENT_SIDEBAR_EDGE
        ? isPointerNearSidebarEdge(ev?.clientX || 0, ev?.clientY || 0, top, height)
        : isPointerNearPageRightEdge(ev?.clientX || 0, ev?.clientY || 0, top, height);
      state.root?.classList.toggle("edge-hot", hot);
    }, { passive: true, capture: true });
    D.addEventListener("pointerdown", (ev) => {
      const t = ev?.target;
      if (!(t instanceof Node)) return;
      if (state.root?.contains(t)) return;
      if (!state.open) return;
      applyOpenState(false, true);
    }, true);
    W.addEventListener("resize", () => {
      positionRoot();
      positionLauncher();
    }, { passive: true });
    if (!state.routeTimer) {
      state.routeTimer = W.setInterval(() => {
        try {
          adoptCommandBarControls();
          positionRoot();
          positionLauncher();
        } catch {}
      }, PANEL_REPOS_MS);
    }
    if (!state.adoptTimer) {
      state.adoptTimer = W.setInterval(() => {
        try {
          const changed = adoptCommandBarControls();
          if (changed) scheduleRender();
        } catch {}
      }, ADOPT_POLL_MS);
    }
  }

  function isFeatureTab(tabIdRaw) {
    const tabId = normalizeTabId(tabIdRaw);
    return tabId === TAB_HIGHLIGHTS || tabId === TAB_SECTIONS || tabId === TAB_MINIMAP;
  }

  function readNodeText(node) {
    if (!node) return "";
    try {
      return String(node.getAttribute?.("aria-label") || node.title || node.textContent || "").replace(/\s+/g, " ").trim();
    } catch {
      return "";
    }
  }

  function readNodeLabel(node) {
    return readNodeText(node);
  }

  function readNodeTitle(node) {
    if (!node) return "";
    try { return String(node.title || node.getAttribute?.("aria-label") || readNodeText(node) || "").trim(); } catch { return ""; }
  }

  function findNodeTheme(node) {
    if (!node || !(node instanceof Element)) return TAB_OTHER;
    const direct = node.getAttribute("data-ctrl-theme");
    if (direct) return normalizeTabId(direct);
    const nested = node.querySelector?.("[data-ctrl-theme]")?.getAttribute?.("data-ctrl-theme") || "";
    return normalizeTabId(nested || TAB_OTHER);
  }

  function looksLikeDevControlText(raw) {
    const text = String(raw || "").toLowerCase();
    if (!text) return false;
    return /(debug|diagn|repair|fix|override|force|reload|resync|inspect|scope|background|command bar|dev|hotkey|unsafe|rebuild|takeover)/i.test(text);
  }

  function makeDomActionId(node, tabId) {
    const label = readNodeLabel(node);
    const basis = `${tabId}|${label}|${node.className || ""}|${node.getAttribute?.("data-ctrl-theme") || ""}`;
    let h = 5381;
    for (let i = 0; i < basis.length; i += 1) h = ((h << 5) + h) ^ basis.charCodeAt(i);
    return `dom:${Math.abs(h >>> 0).toString(36)}`;
  }

  function shouldAdoptCommandBarNode(node) {
    if (!node || !(node instanceof Element) || !node.isConnected) return false;
    if (node.closest(".toolsPinnedLeft")) return false;
    if (node.classList.contains("state") || node.classList.contains("cmdGroupTab")) return false;
    if (node.getAttribute("data-h2o-side-adopted") === "1") return false;
    const theme = findNodeTheme(node);
    if (!isFeatureTab(theme)) return false;
    const isPlainBtn = node.matches("button") && !node.classList.contains("captureMenuBtn");
    const isCapture = node.classList.contains("captureWrap");
    if (!isPlainBtn && !isCapture) return false;
    const label = `${readNodeText(node)} ${readNodeTitle(node)}`;
    if (looksLikeDevControlText(label)) return false;
    return true;
  }

  function adoptNodeAsAction(node) {
    const tabId = findNodeTheme(node);
    const owner = `dom:${tabId}`;
    const id = makeDomActionId(node, tabId);
    if (!state.actions.has(id)) {
      registerAction({
        id,
        owner,
        kind: "dom",
        sourceEl: node,
        tabId,
        title: readNodeTitle(node) || readNodeLabel(node),
        text: readNodeLabel(node),
        tone: tabId,
        order: 500,
        meta: { source: "commandbar-dom-adopt" },
      });
    }
    node.setAttribute("data-h2o-side-adopted", "1");
    const rec = state.actions.get(id);
    if (rec) {
      rec.sourceEl = node;
      rec.text = readNodeLabel(node);
      rec.title = readNodeTitle(node) || rec.text;
      if (!rec.node) buildActionNode(rec);
      ensureDomActionMounted(rec);
      patchActionNode(rec);
    }
  }

  function adoptCommandBarControls() {
    const rail = D.querySelector(".h2o-archive-dock .toolsRail");
    if (!rail) return false;
    let changed = false;
    const candidates = Array.from(rail.children || []);
    for (const node of candidates) {
      if (!shouldAdoptCommandBarNode(node)) continue;
      adoptNodeAsAction(node);
      changed = true;
    }
    return changed;
  }

  function shouldMoveCommandBarDef(def = {}) {
    const type = String(def.type || "button").trim().toLowerCase();
    if (type !== "button") return false;
    if (String(def.zone || "").trim().toLowerCase() === "pinned") return false;
    if (def.keepInCommandBar === true || def.devOnly === true || def.surface === "command-bar") return false;
    if (def.sideAction === true) return true;
    const surface = String(def.surface || def.placement || def.area || "").trim().toLowerCase();
    if (surface === "side-panel" || surface === "sidepanel" || surface === "side" || surface === "consumer") return true;
    const tabId = commandBarTabFromDef(def);
    if (!isFeatureTab(tabId)) return false;
    const combined = [def.text, def.faceBase, def.label, def.title, def.id, def.groupId, def.className].filter(Boolean).join(" ");
    if (looksLikeDevControlText(combined)) return false;
    return true;
  }

  function commandBarTabFromDef(def = {}) {
    const candidate = normalizeTabId(def.sideTab || def.tabId || def.windowId || def.windowScope || def.scopeWindow || TAB_OTHER);
    if (candidate && candidate !== "all") return candidate;
    const owner = String(def.owner || "").trim().toLowerCase();
    const groupId = String(def.groupId || "").trim().toLowerCase();
    if (owner === "hl" || owner === "hi" || groupId.startsWith("hl.") || groupId.startsWith("hi.")) return TAB_HIGHLIGHTS;
    if (owner === "sc" || owner === "sb" || owner === "se" || groupId.startsWith("sc.") || groupId.startsWith("sb.") || groupId.startsWith("se.")) return TAB_SECTIONS;
    if (owner === "mm" || groupId.startsWith("mm.")) return TAB_MINIMAP;
    return TAB_OTHER;
  }

  function convertCommandBarDef(def = {}) {
    const tabId = commandBarTabFromDef(def);
    return {
      id: def.id,
      owner: def.owner,
      tabId,
      tabLabel: def.tabLabel,
      text: def.text || def.faceBase || def.label || def.title || def.id,
      title: def.title || def.text || def.faceBase || def.label || def.id,
      order: Number(def.sideOrder ?? def.order) || 0,
      tone: tabId,
      disabled: def.disabled,
      hidden: def.hidden,
      onClick: typeof def.onClick === "function"
        ? ({ event, el }) => def.onClick({ id: def.id, owner: def.owner, event, el })
        : null,
      meta: { source: "commandBar-bridge" },
    };
  }

  function ensureCommandBarBridge() {
    if (state.bridgeInstalled) return true;
    const cb = H2O.commandBar;
    if (!cb || typeof cb.registerControl !== "function") return false;

    if (cb.__h2oSideActionsBridgeInstalled === true) {
      state.bridgeInstalled = true;
      return true;
    }

    const origRegisterControl = cb.registerControl.bind(cb);
    const origPatchControl = typeof cb.patchControl === "function" ? cb.patchControl.bind(cb) : null;
    const origRemoveOwner = typeof cb.removeOwner === "function" ? cb.removeOwner.bind(cb) : null;

    cb.registerControl = function patchedRegisterControl(def) {
      if (shouldMoveCommandBarDef(def)) {
        try {
          const ok = registerAction(convertCommandBarDef(def));
          if (ok) {
            state.bridgeMoved.add(String(def.id || "").trim());
            return true;
          }
        } catch (e) {
          warn("command bar bridge register failed", e);
        }
      }
      return origRegisterControl(def);
    };

    if (origPatchControl) {
      cb.patchControl = function patchedPatchControl(idRaw, patch = {}) {
        const id = String(idRaw || "").trim();
        if (state.bridgeMoved.has(id)) {
          const merged = { id, ...(isObj(patch) ? patch : {}) };
          const ok = patchAction(id, {
            tabId: merged.sideTab || merged.tabId || merged.windowId || merged.windowScope,
            text: merged.text || merged.faceBase || merged.label,
            title: merged.title,
            order: merged.sideOrder ?? merged.order,
            disabled: merged.disabled,
            hidden: merged.hidden,
            onClick: typeof merged.onClick === "function" ? ({ event, el }) => merged.onClick({ id, event, el }) : undefined,
          });
          return !!ok;
        }
        return origPatchControl(idRaw, patch);
      };
    }

    if (origRemoveOwner) {
      cb.removeOwner = function patchedRemoveOwner(ownerIdRaw = "") {
        const ownerId = String(ownerIdRaw || "").trim();
        if (ownerId) removeOwner(ownerId);
        return origRemoveOwner(ownerIdRaw);
      };
    }

    cb.__h2oSideActionsBridgeInstalled = true;
    state.bridgeInstalled = true;
    return true;
  }

  API.__h2oSideActionsPanelReady = true;
  API.ensureMounted = ensureMounted;
  API.open = () => applyOpenState(true, true);
  API.close = () => applyOpenState(false, true);
  API.toggle = () => applyOpenState(!state.open, true);
  API.isOpen = () => !!state.open;
  API.registerTab = registerTab;
  API.registerAction = registerAction;
  API.patchAction = patchAction;
  API.removeOwner = removeOwner;
  API.setTab = (tabIdRaw) => applyActiveTab(tabIdRaw, true);
  API.getTab = () => normalizeTabId(state.activeTab);
  API.getTabPlacement = () => normalizeTabPlacement(state.tabPlacement || readTabPlacement());
  API.setTabPlacement = (placementRaw) => applyTabPlacement(placementRaw, true);
  API.attachCommandBarBridge = ensureCommandBarBridge;
  API.adoptCommandBarControls = adoptCommandBarControls;

  function boot() {
    ensureMounted();
  }

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
