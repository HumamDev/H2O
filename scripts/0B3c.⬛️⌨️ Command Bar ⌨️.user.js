// ==UserScript==
// @h2o-id             0b3c.command.bar
// @name               0B3c.⬛️⌨️ Command Bar ⌨️
// @namespace          H2O.Premium.CGX.command.bar
// @author             HumamDev
// @version            1.1.2
// @revision           001
// @build              260315-000001
// @description        Archive command bar shell: standalone dock owner with pass-1 control registration API.
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

  const API = (H2O.commandBar = H2O.commandBar || Object.create(null));
  if (API.__h2oCommandBarPass1 === true && typeof API.ensureMounted === "function") {
    try { API.ensureMounted(); } catch {}
    return;
  }

  const TAG = "[H2O.CommandBar]";
  const DOCK_COLLAPSE_LEGACY_KEY = "h2o:archive:dock:collapsed:v1";
  const DOCK_BG_BODY = "body";
  const DOCK_BG_BAR = "bar";
  const DOCK_BG_SIDE = "side";
  const SAVE_MODE_SILENT = "silent";
  const SAVE_MODE_READER = "reader";
  const SAVE_MODE_LIBRARY = "library";
  const WINDOW_ALL = "all";
  const WINDOW_MINIMAP = "minimap";
  const WINDOW_SNAPSHOT = "snapshot";
  const WINDOW_UNMOUNT = "unmount";
  const WINDOW_HIGHLIGHTS = "highlights";
  const WINDOW_SECTIONS = "sections";
  const WINDOW_OPTS = [
    { id: WINDOW_ALL, label: "All" },
    { id: WINDOW_MINIMAP, label: "MiniMap" },
    { id: WINDOW_SNAPSHOT, label: "Snapshot" },
    { id: WINDOW_UNMOUNT, label: "Unmount" },
    { id: WINDOW_HIGHLIGHTS, label: "Highlights" },
    { id: WINDOW_SECTIONS, label: "Sections" },
  ];
  const DOCK_TARGET_HEIGHT_MIN_PX = 24;
  const DOCK_TARGET_HEIGHT_FALLBACK_PX = 30;
  const DOCK_TARGET_HEIGHT_NOTICE_TRIM_PX = 5;
  const DOCK_CTRL_FONT_PX = 10.5;
  const DOCK_CTRL_PAD_Y_PX = 2;
  const DOCK_CTRL_PAD_X_PX = 5;
  const DOCK_FOLD_TAB_BOTTOM_PX = 60;
  const STATUS_PANEL_SIZE_DEFAULT_FRAC = 0.25;
  const STATUS_PANEL_SIZE_MIN_PX = 160;
  const STATUS_PANEL_SIZE_MAX_FRAC = 0.55;
  const STATUS_PANEL_MAIN_MIN_PX = 240;
  const STATUS_PANEL_SIZE_STEP_PX = 24;
  const STATUS_PANEL_RESERVED_OFFSET_PX = 22;
  const STATUS_PANEL_ITEM_H_PX = 18;
  const STATUS_ROTATE_MS = 3200;
  const STATUS_ROTATE_USER_PAUSE_MS = 4800;
  const ROUTE_POLL_MS = 800;
  const SEL_TURN_PRIMARY = 'article[data-testid="conversation-turn"],div[data-testid="conversation-turn"]';

  const state = {
    mounted: false,
    mountReady: false,
    mounting: false,
    stylesMounted: false,
    listenersBound: false,
    routeTimer: 0,
    revealRaf: 0,
    primeLayoutRaf: 0,
    lastRouteSig: "",
    root: null,
    toolsPinnedLeft: null,
    leftDivider: null,
    rightDivider: null,
    toolsLeft: null,
    toolsRail: null,
    stateEl: null,
    foldBtn: null,
    statusRow: null,
    statusCountEl: null,
    statusViewportEl: null,
    statusTrackEl: null,
    infoWrap: null,
    infoBtn: null,
    infoPanel: null,
    infoWarnDot: null,
    bgPicker: null,
    bgBtn: null,
    bgMenu: null,
    bgOpts: [],
    scopePicker: null,
    scopeBtn: null,
    scopeMenu: null,
    scopeOpts: [],
    scopeWindow: WINDOW_ALL,
    scopeWheelAt: 0,
    activeCaptureId: "",
    groups: new Map(),
    groupHeaders: new Map(),
    controls: new Map(),
    statuses: new Map(),
    panelSections: new Map(),
    seq: 1,
    statusSeq: 1,
    panelSeq: 1,
    statusItems: [],
    statusViewIndex: 0,
    statusRotateTimer: 0,
    statusRotatePauseUntilMs: 0,
    statusHover: false,
    statusWheelAt: 0,
    statusPanelSizeLoaded: false,
    statusPanelSizeCustom: false,
    statusPanelSizePx: 0,
    statusResizePointerId: 0,
    statusResizeStartX: 0,
    statusResizeStartSizePx: 0,
    reflowRaf: 0,
    reflowZones: new Set(),
    dockResizeObserver: null,
    dockSidebarResizeObserver: null,
    dockSidebarObservedEls: [],
    dockGeomBurstUntilMs: 0,
    dockGeomBurstRaf: 0,
    dockGeomBurstTimer: 0,
    dockLastAppliedHeightPx: 0,
    dockLastSidebarRightPx: 0,
    composerNoticeEl: null,
    composerNoticeMissUntilMs: 0,
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

  function toChatId(raw) {
    return String(raw || "").trim();
  }

  function stableHash(raw) {
    const s = String(raw || "");
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h >>> 0).toString(36);
  }

  function getCurrentChatId() {
    const fromUtil = H2O.util?.getChatId?.();
    const utilId = toChatId(fromUtil);
    if (utilId) return utilId;
    try {
      const u = new URL(W.location.href);
      const parts = String(u.pathname || "").split("/").filter(Boolean);
      const cIdx = parts.indexOf("c");
      if (cIdx >= 0 && parts[cIdx + 1]) return toChatId(parts[cIdx + 1]);
      const gIdx = parts.indexOf("g");
      if (gIdx >= 0 && parts[gIdx + 1]) return toChatId(parts[gIdx + 1]);
      if (parts.length > 0) {
        const tail = toChatId(parts[parts.length - 1]);
        if (/^[a-z0-9-]{16,}$/i.test(tail)) return tail;
      }
      return "path:" + stableHash(u.pathname + "|" + u.search);
    } catch {
      return "path:" + stableHash(String(W.location.pathname || ""));
    }
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

  function lsDel(key) {
    try { localStorage.removeItem(String(key)); return true; } catch { return false; }
  }

  function normalizeDockBgMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === DOCK_BG_BODY) return DOCK_BG_BODY;
    if (mode === DOCK_BG_SIDE) return DOCK_BG_SIDE;
    return DOCK_BG_BAR;
  }

  function normalizeAfterSaveMode(raw) {
    const mode = String(raw || "").trim().toLowerCase();
    if (mode === SAVE_MODE_READER) return SAVE_MODE_READER;
    if (mode === SAVE_MODE_LIBRARY) return SAVE_MODE_LIBRARY;
    return SAVE_MODE_SILENT;
  }

  function keyCollapsed() {
    return `${dataNs()}:commandbar:collapsed:v1`;
  }

  function keyBgMode() {
    return `${dataNs()}:commandbar:bg:v1`;
  }

  function keyAfterSaveMode() {
    return `${dataNs()}:commandbar:after-save:v1`;
  }

  function keyImportantOnly() {
    return `${dataNs()}:commandbar:important-only:v1`;
  }

  function keyInfoOpen(chatId) {
    return `${dataNs()}:commandbar:info:${chatId}:v1`;
  }

  function keyWindowScope() {
    return `${dataNs()}:commandbar:window-scope:v1`;
  }

  function keyStatusPanelSize() {
    return `${dataNs()}:commandbar:status-panel-size:v1`;
  }

  function keyLegacyBgMode() {
    return `${dataNs()}:archive:dock:bg:v1`;
  }

  function keyLegacyAfterSaveMode() {
    return `${dataNs()}:archive:dock:after-save:v1`;
  }

  function keyLegacyImportantOnly() {
    return `${dataNs()}:archive:dock:important-only:v1`;
  }

  function keyLegacyInfoOpen(chatId) {
    return `${dataNs()}:archive:dock:info:${chatId}:v1`;
  }

  function readStringWithLegacy(nextKey, legacyKey, fallback = "") {
    const next = lsGetStr(nextKey, null);
    if (next != null) return String(next);
    const legacy = lsGetStr(legacyKey, null);
    if (legacy != null) return String(legacy);
    return String(fallback || "");
  }

  function readJsonWithLegacy(nextKey, legacyKey, fallback = null) {
    const next = lsGetJson(nextKey, null);
    if (next != null) return next;
    const legacy = lsGetJson(legacyKey, null);
    if (legacy != null) return legacy;
    return fallback;
  }

  function writeStringBoth(nextKey, legacyKey, value) {
    lsSetStr(nextKey, value);
    if (legacyKey) lsSetStr(legacyKey, value);
    return value;
  }

  function writeJsonBoth(nextKey, legacyKey, value) {
    lsSetJson(nextKey, value);
    if (legacyKey) lsSetJson(legacyKey, value);
    return value;
  }

  function normalizeWindowScope(raw) {
    const value = String(raw || "").trim().toLowerCase();
    if (value === WINDOW_MINIMAP) return WINDOW_MINIMAP;
    if (value === WINDOW_SNAPSHOT) return WINDOW_SNAPSHOT;
    if (value === WINDOW_UNMOUNT) return WINDOW_UNMOUNT;
    if (value === WINDOW_HIGHLIGHTS) return WINDOW_HIGHLIGHTS;
    if (value === WINDOW_SECTIONS) return WINDOW_SECTIONS;
    return WINDOW_ALL;
  }

  function getWindowScopeMeta(scopeRaw) {
    const scope = normalizeWindowScope(scopeRaw);
    return WINDOW_OPTS.find((item) => item.id === scope) || WINDOW_OPTS[0];
  }

  function getWindowScope() {
    return normalizeWindowScope(lsGetStr(keyWindowScope(), WINDOW_ALL));
  }

  function setWindowScope(scopeRaw) {
    const scope = normalizeWindowScope(scopeRaw);
    lsSetStr(keyWindowScope(), scope);
    return scope;
  }

  function getCollapsed() {
    return !!readJsonWithLegacy(keyCollapsed(), DOCK_COLLAPSE_LEGACY_KEY, false);
  }

  function setCollapsed(collapsed) {
    return !!writeJsonBoth(keyCollapsed(), DOCK_COLLAPSE_LEGACY_KEY, !!collapsed);
  }

  function getBgMode() {
    return normalizeDockBgMode(readStringWithLegacy(keyBgMode(), keyLegacyBgMode(), DOCK_BG_BAR));
  }

  function setBgMode(modeRaw) {
    const mode = normalizeDockBgMode(modeRaw);
    return writeStringBoth(keyBgMode(), keyLegacyBgMode(), mode);
  }

  function getAfterSaveMode() {
    return normalizeAfterSaveMode(readStringWithLegacy(keyAfterSaveMode(), keyLegacyAfterSaveMode(), SAVE_MODE_SILENT));
  }

  function setAfterSaveMode(modeRaw) {
    const mode = normalizeAfterSaveMode(modeRaw);
    return writeStringBoth(keyAfterSaveMode(), keyLegacyAfterSaveMode(), mode);
  }

  function getImportantOnly() {
    return !!readJsonWithLegacy(keyImportantOnly(), keyLegacyImportantOnly(), false);
  }

  function setImportantOnly(on) {
    return !!writeJsonBoth(keyImportantOnly(), keyLegacyImportantOnly(), !!on);
  }

  function getInfoOpen(chatIdRaw) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return false;
    return !!readJsonWithLegacy(keyInfoOpen(chatId), keyLegacyInfoOpen(chatId), false);
  }

  function setInfoOpen(chatIdRaw, open) {
    const chatId = toChatId(chatIdRaw || "");
    if (!chatId) return false;
    return !!writeJsonBoth(keyInfoOpen(chatId), keyLegacyInfoOpen(chatId), !!open);
  }

  function getStoredStatusPanelSizePx() {
    const raw = lsGetStr(keyStatusPanelSize(), "");
    const px = Math.round(Number.parseFloat(String(raw || "")));
    return Number.isFinite(px) && px > 0 ? px : null;
  }

  function getDockWidthPx() {
    const dock = state.root;
    if (!dock || !dock.isConnected) return 0;
    try {
      return Math.max(0, Math.round(Number(dock.getBoundingClientRect?.().width || dock.offsetWidth || 0)));
    } catch {
      return Math.max(0, Math.round(Number(dock.offsetWidth || 0)));
    }
  }

  function getStatusPanelBoundsPx(dockWidthRaw = getDockWidthPx()) {
    const dockWidth = Math.max(0, Math.round(Number(dockWidthRaw || 0)));
    const absoluteMin = STATUS_PANEL_RESERVED_OFFSET_PX + 84;
    const min = Math.max(absoluteMin, STATUS_PANEL_SIZE_MIN_PX);
    const maxByFrac = Math.max(min, Math.round(dockWidth * STATUS_PANEL_SIZE_MAX_FRAC));
    const maxByMain = Math.max(min, dockWidth - STATUS_PANEL_MAIN_MIN_PX);
    const maxByViewport = Math.max(min, dockWidth - 72);
    const max = Math.max(min, Math.min(maxByFrac, maxByMain, maxByViewport));
    const def = Math.min(max, Math.max(min, Math.round(dockWidth * STATUS_PANEL_SIZE_DEFAULT_FRAC)));
    return { min, max, def };
  }

  function updateStatusDividerMetrics(sizePxRaw = state.statusPanelSizePx) {
    const divider = state.rightDivider;
    if (!divider) return;
    const { min, max } = getStatusPanelBoundsPx();
    const now = Math.min(max, Math.max(min, Math.round(Number(sizePxRaw || min))));
    divider.title = "Drag to resize right panel";
    divider.setAttribute("aria-label", divider.title);
    divider.setAttribute("aria-valuemin", String(min));
    divider.setAttribute("aria-valuemax", String(max));
    divider.setAttribute("aria-valuenow", String(now));
  }

  function applyStatusPanelSizePx(sizePxRaw, opts = {}) {
    const root = opts.root || state.root || ensureMounted();
    if (!root) return 0;
    const custom = !!opts.custom;
    const bounds = getStatusPanelBoundsPx();
    const target = custom ? Number(sizePxRaw || 0) : bounds.def;
    const next = Math.min(bounds.max, Math.max(bounds.min, Math.round(target || bounds.def)));
    root.style.setProperty("--h2o-archive-status-panel-size", `${next}px`);
    state.statusPanelSizePx = next;
    state.statusPanelSizeCustom = custom;
    updateStatusDividerMetrics(next);
    if (opts.persist) {
      if (custom) lsSetStr(keyStatusPanelSize(), String(next));
      else lsDel(keyStatusPanelSize());
    }
    updateDockOverflowMask();
    return next;
  }

  function syncStatusPanelSizeToDock() {
    if (!state.root?.isConnected) return 0;
    return applyStatusPanelSizePx(state.statusPanelSizeCustom ? state.statusPanelSizePx : 0, {
      root: state.root,
      custom: state.statusPanelSizeCustom,
      persist: false,
    });
  }

  function primeStatusPanelSize() {
    if (!state.statusPanelSizeLoaded) {
      const stored = getStoredStatusPanelSizePx();
      state.statusPanelSizeLoaded = true;
      state.statusPanelSizeCustom = Number.isFinite(stored) && stored > 0;
      state.statusPanelSizePx = Number.isFinite(stored) ? Math.round(stored) : 0;
    }
    return syncStatusPanelSizeToDock();
  }

  function setStatusResizeActive(on) {
    const active = !!on;
    state.root?.classList?.toggle?.("is-resizing-panel", active);
    state.rightDivider?.classList?.toggle?.("is-resizing", active);
    try { D.documentElement?.classList?.toggle?.("h2o-commandbar-resizing-panel", active); } catch {}
  }

  function clearStatusResizeSession() {
    if (!state.statusResizePointerId) return;
    try { state.rightDivider?.releasePointerCapture?.(state.statusResizePointerId); } catch {}
    state.statusResizePointerId = 0;
    state.statusResizeStartX = 0;
    state.statusResizeStartSizePx = 0;
    setStatusResizeActive(false);
  }

  function nudgeStatusPanelSize(deltaPx) {
    primeStatusPanelSize();
    return applyStatusPanelSizePx(Math.round(Number(state.statusPanelSizePx || 0)) + Math.round(Number(deltaPx || 0)), {
      custom: true,
      persist: true,
    });
  }

  function setStatusPanelSizeToBound(which = "min") {
    primeStatusPanelSize();
    const { min, max } = getStatusPanelBoundsPx();
    return applyStatusPanelSizePx(which === "max" ? max : min, {
      custom: true,
      persist: true,
    });
  }

  function onStatusResizeStart(ev) {
    if (!state.rightDivider || state.root?.classList.contains("collapsed")) return;
    if (Number(ev?.button || 0) !== 0) return;
    primeStatusPanelSize();
    state.statusResizePointerId = Number(ev?.pointerId || 0) || 1;
    state.statusResizeStartX = Number(ev?.clientX || 0);
    state.statusResizeStartSizePx = Math.max(0, Math.round(Number(state.statusPanelSizePx || 0)));
    setStatusResizeActive(true);
    try { state.rightDivider.setPointerCapture?.(state.statusResizePointerId); } catch {}
    try {
      ev?.preventDefault?.();
      ev?.stopPropagation?.();
    } catch {}
  }

  function onStatusResizeMove(ev) {
    if (!state.statusResizePointerId) return;
    if (Number(ev?.pointerId || 0) !== Number(state.statusResizePointerId || 0)) return;
    const deltaX = Number(state.statusResizeStartX || 0) - Number(ev?.clientX || 0);
    applyStatusPanelSizePx(Math.round(Number(state.statusResizeStartSizePx || 0) + deltaX), {
      custom: true,
      persist: false,
    });
    try { ev?.preventDefault?.(); } catch {}
  }

  function onStatusResizeEnd(ev) {
    if (!state.statusResizePointerId) return;
    if (ev && Number(ev?.pointerId || 0) && Number(ev.pointerId || 0) !== Number(state.statusResizePointerId || 0)) return;
    applyStatusPanelSizePx(state.statusPanelSizePx, {
      custom: true,
      persist: true,
    });
    clearStatusResizeSession();
  }

  function getDockPanelBaseBgColor() {
    try {
      const bodyBg = getComputedStyle(D.body).backgroundColor;
      const htmlBg = getComputedStyle(D.documentElement).backgroundColor;
      if (bodyBg && bodyBg !== "rgba(0, 0, 0, 0)" && bodyBg !== "rgba(0,0,0,0)" && bodyBg !== "transparent") return bodyBg;
      if (htmlBg && htmlBg !== "rgba(0, 0, 0, 0)" && htmlBg !== "rgba(0,0,0,0)" && htmlBg !== "transparent") return htmlBg;
    } catch {}
    return "#212121";
  }

  function dockBgColorForMode(modeRaw) {
    const mode = normalizeDockBgMode(modeRaw);
    if (mode === DOCK_BG_BODY) return "#2a2a2a";
    if (mode === DOCK_BG_SIDE) return "#141414";
    return getDockPanelBaseBgColor();
  }

  function dockStatusColorForMode(modeRaw) {
    const mode = normalizeDockBgMode(modeRaw);
    if (mode === DOCK_BG_BODY) return "#7cc6ff";
    if (mode === DOCK_BG_SIDE) return "#ffd47c";
    return "#dfe6f0";
  }

  function mountStyles() {
    if (state.stylesMounted) return;
    state.stylesMounted = true;
    const style = D.createElement("style");
    style.id = "h2o-command-bar-style";
    style.textContent = `
html,body{padding-bottom:0 !important}
.h2o-archive-dock{position:fixed;left:0;right:0;bottom:0;width:100%;z-index:1000022;background:var(--h2o-archive-dock-bg,#14161a);backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,.14);border-left:0;border-right:0;border-bottom:0;border-radius:0;padding:5px 8px;display:flex;gap:5px;align-items:center;flex-wrap:nowrap;overflow:visible;box-sizing:border-box;font:${DOCK_CTRL_FONT_PX}px/1.08 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;color:#e8edf6;transform-origin:center bottom;transition:none;height:var(--h2o-archive-dock-target-h,${DOCK_TARGET_HEIGHT_FALLBACK_PX}px);min-height:var(--h2o-archive-dock-target-h,${DOCK_TARGET_HEIGHT_FALLBACK_PX}px);--h2o-archive-dock-status-color:#dfe6f0;--h2o-archive-scope-surface-1:rgba(95,106,125,.13);--h2o-archive-scope-surface-2:rgba(48,55,69,.08);--h2o-archive-scope-border:rgba(210,220,234,.14);--h2o-archive-scope-glow:rgba(216,226,239,.11);--h2o-archive-scope-pill-1:rgba(255,255,255,.1);--h2o-archive-scope-pill-2:rgba(255,255,255,.06);--h2o-archive-scope-pill-border:rgba(255,255,255,.18);--h2o-archive-scope-accent:#dfe6f0;--h2o-archive-scope-accent-border:rgba(223,230,240,.3);--h2o-archive-scope-ring:rgba(223,230,240,.18);--h2o-archive-divider-core:rgba(255,255,255,.26);--h2o-archive-divider-glow:rgba(255,255,255,.08);--h2o-archive-status-panel-size:25%}
.h2o-archive-dock.scope-open{z-index:2147483646}
.h2o-archive-dock[data-bg="body"]{--h2o-archive-dock-bg:#2a2a2a;--h2o-archive-dock-pill-bg:#2a2a2a;--h2o-archive-dock-status-color:#7cc6ff}
.h2o-archive-dock[data-bg="bar"]{--h2o-archive-dock-bg:#212121;--h2o-archive-dock-pill-bg:#212121;--h2o-archive-dock-status-color:#dfe6f0}
.h2o-archive-dock[data-bg="side"]{--h2o-archive-dock-bg:#141414;--h2o-archive-dock-pill-bg:#141414;--h2o-archive-dock-status-color:#ffd47c}
.h2o-archive-dock[data-window-scope="all"]{--h2o-archive-scope-surface-1:rgba(95,106,125,.13);--h2o-archive-scope-surface-2:rgba(48,55,69,.08);--h2o-archive-scope-border:rgba(210,220,234,.14);--h2o-archive-scope-glow:rgba(216,226,239,.11);--h2o-archive-scope-pill-1:rgba(255,255,255,.1);--h2o-archive-scope-pill-2:rgba(255,255,255,.06);--h2o-archive-scope-pill-border:rgba(255,255,255,.18);--h2o-archive-scope-accent:#dfe6f0;--h2o-archive-scope-accent-border:rgba(223,230,240,.28);--h2o-archive-scope-ring:rgba(223,230,240,.17)}
.h2o-archive-dock[data-window-scope="minimap"]{--h2o-archive-scope-surface-1:rgba(139,44,44,.17);--h2o-archive-scope-surface-2:rgba(65,17,17,.1);--h2o-archive-scope-border:rgba(255,133,133,.18);--h2o-archive-scope-glow:rgba(255,145,145,.15);--h2o-archive-scope-pill-1:rgba(176,54,54,.22);--h2o-archive-scope-pill-2:rgba(92,24,24,.13);--h2o-archive-scope-pill-border:rgba(255,135,135,.24);--h2o-archive-scope-accent:#ff9a9a;--h2o-archive-scope-accent-border:rgba(255,154,154,.34);--h2o-archive-scope-ring:rgba(255,145,145,.24)}
.h2o-archive-dock[data-window-scope="snapshot"]{--h2o-archive-scope-surface-1:rgba(44,108,150,.18);--h2o-archive-scope-surface-2:rgba(18,52,80,.1);--h2o-archive-scope-border:rgba(124,199,255,.18);--h2o-archive-scope-glow:rgba(132,208,255,.16);--h2o-archive-scope-pill-1:rgba(55,130,181,.22);--h2o-archive-scope-pill-2:rgba(20,63,97,.13);--h2o-archive-scope-pill-border:rgba(127,201,255,.24);--h2o-archive-scope-accent:#8ecfff;--h2o-archive-scope-accent-border:rgba(142,207,255,.34);--h2o-archive-scope-ring:rgba(132,208,255,.24)}
.h2o-archive-dock[data-window-scope="unmount"]{--h2o-archive-scope-surface-1:rgba(52,123,67,.18);--h2o-archive-scope-surface-2:rgba(22,62,34,.1);--h2o-archive-scope-border:rgba(145,228,161,.18);--h2o-archive-scope-glow:rgba(156,231,168,.16);--h2o-archive-scope-pill-1:rgba(61,142,78,.22);--h2o-archive-scope-pill-2:rgba(27,73,40,.13);--h2o-archive-scope-pill-border:rgba(146,227,162,.24);--h2o-archive-scope-accent:#9fe3a5;--h2o-archive-scope-accent-border:rgba(159,227,165,.34);--h2o-archive-scope-ring:rgba(156,231,168,.24)}
.h2o-archive-dock[data-window-scope="highlights"]{--h2o-archive-scope-surface-1:rgba(123,96,36,.2);--h2o-archive-scope-surface-2:rgba(70,48,12,.11);--h2o-archive-scope-border:rgba(241,214,120,.2);--h2o-archive-scope-glow:rgba(248,221,133,.17);--h2o-archive-scope-pill-1:rgba(152,117,37,.24);--h2o-archive-scope-pill-2:rgba(85,58,12,.14);--h2o-archive-scope-pill-border:rgba(242,214,123,.26);--h2o-archive-scope-accent:#f2d67b;--h2o-archive-scope-accent-border:rgba(242,214,123,.34);--h2o-archive-scope-ring:rgba(248,221,133,.23)}
.h2o-archive-dock[data-window-scope="sections"]{--h2o-archive-scope-surface-1:rgba(112,76,143,.2);--h2o-archive-scope-surface-2:rgba(52,29,79,.11);--h2o-archive-scope-border:rgba(210,170,247,.2);--h2o-archive-scope-glow:rgba(214,176,248,.17);--h2o-archive-scope-pill-1:rgba(126,82,165,.24);--h2o-archive-scope-pill-2:rgba(63,36,101,.14);--h2o-archive-scope-pill-border:rgba(210,170,247,.26);--h2o-archive-scope-accent:#d6b0f8;--h2o-archive-scope-accent-border:rgba(214,176,248,.34);--h2o-archive-scope-ring:rgba(214,176,248,.23)}
.h2o-archive-dock select,.h2o-archive-dock button{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#e8edf6;border-radius:7px;padding:${DOCK_CTRL_PAD_Y_PX}px ${DOCK_CTRL_PAD_X_PX}px;font:inherit}
.h2o-archive-dock button{cursor:pointer}
.h2o-archive-dock .toolsPinnedLeft{display:flex;align-items:center;gap:6px;flex:0 0 auto;position:relative;z-index:5}
.h2o-archive-dock .dockDivider{flex:0 0 1px;align-self:stretch;position:relative;background:linear-gradient(180deg,transparent 0%,var(--h2o-archive-divider-core) 14%,var(--h2o-archive-divider-core) 86%,transparent 100%);box-shadow:0 0 10px var(--h2o-archive-divider-glow);pointer-events:none}
.h2o-archive-dock .leftDivider{margin:4px 8px 4px 3px}
.h2o-archive-dock .rightDivider{margin:4px 3px 4px 8px;pointer-events:auto;cursor:col-resize;touch-action:none;z-index:6}
.h2o-archive-dock .rightDivider::before{content:"";position:absolute;top:0;bottom:0;left:-8px;right:-8px}
.h2o-archive-dock .rightDivider:hover,
.h2o-archive-dock .rightDivider:focus-visible,
.h2o-archive-dock .rightDivider.is-resizing{background:linear-gradient(180deg,transparent 0%,rgba(144,198,255,.82) 14%,rgba(144,198,255,.82) 86%,transparent 100%);box-shadow:0 0 0 1px rgba(102,173,255,.22),0 0 14px rgba(102,173,255,.22);outline:none}
.h2o-archive-dock .toolsLeft{position:relative;display:flex;align-items:center;gap:0;min-width:0;flex:1 1 auto;overflow-x:auto;overflow-y:hidden;white-space:nowrap;padding:0;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-gutter:stable both-edges;scrollbar-width:none;-ms-overflow-style:none;z-index:2}
.h2o-archive-dock .toolsLeft::-webkit-scrollbar{height:0;width:0;display:none}
.h2o-archive-dock .toolsRail{position:relative;display:inline-flex;align-items:center;gap:6px;min-width:max-content;margin-right:8px;padding:1px 10px 1px 8px;border-radius:11px;background:linear-gradient(180deg,var(--h2o-archive-scope-surface-1),var(--h2o-archive-scope-surface-2));box-shadow:inset 0 0 0 1px var(--h2o-archive-scope-border)}
.h2o-archive-dock .toolsRail::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(90deg,var(--h2o-archive-scope-glow),transparent 52%,transparent 88%);z-index:0}
.h2o-archive-dock .toolsRail > *{flex:0 0 auto;position:relative;z-index:1}
.h2o-archive-dock .toolsRail > *[hidden]{display:none !important}
.h2o-archive-dock .cmdGroupTab{display:inline-flex;align-items:center;justify-content:center;min-height:20px;padding:2px 9px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(255,255,255,.08),rgba(255,255,255,.04));color:var(--h2o-archive-scope-accent,#dfe6f0);font-weight:700;letter-spacing:.02em;box-shadow:0 0 0 1px rgba(255,255,255,.03) inset;white-space:nowrap}
.h2o-archive-dock .cmdGroupTab[data-group-owner="hc"]{color:#f0d8a8;border-color:rgba(240,216,168,.22);background:linear-gradient(180deg,rgba(173,122,34,.16),rgba(74,52,14,.08))}
.h2o-archive-dock .state{display:none !important}
.h2o-archive-dock .toolsRail button,
.h2o-archive-dock .toolsRail .dockChoice .dockChoiceFace{background:linear-gradient(180deg,var(--h2o-archive-scope-pill-1),var(--h2o-archive-scope-pill-2));border-color:var(--h2o-archive-scope-pill-border)}
.h2o-archive-dock .infoWrap{position:relative}
.h2o-archive-dock .bgPicker{position:relative}
.h2o-archive-dock .scopePicker{position:relative}
.h2o-archive-dock .scopeBtn{position:relative;display:inline-flex;align-items:center;width:auto;min-width:0;max-width:none;padding-right:18px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-color:var(--h2o-archive-scope-accent-border);box-shadow:0 0 0 1px var(--h2o-archive-scope-ring) inset;background:linear-gradient(180deg,var(--h2o-archive-scope-pill-1),var(--h2o-archive-scope-pill-2))}
.h2o-archive-dock .scopeBtn::after{content:"▾";position:absolute;right:7px;top:50%;transform:translateY(-50%);font-size:9px;line-height:1;opacity:.76;pointer-events:none}
.h2o-archive-dock .scopePicker.open .scopeBtn{border-color:var(--h2o-archive-scope-accent);box-shadow:0 0 0 1px var(--h2o-archive-scope-ring) inset,0 0 12px var(--h2o-archive-scope-glow)}
.h2o-archive-dock .scopeMenu{position:absolute;left:0;bottom:calc(100% + 8px);display:grid;gap:6px;padding:8px;border:1px solid rgba(255,255,255,.15);border-radius:13px;background:linear-gradient(180deg,rgba(24,27,34,.98),rgba(9,11,15,.98));box-shadow:0 16px 34px rgba(0,0,0,.44),0 0 0 1px rgba(255,255,255,.04) inset;backdrop-filter:blur(14px) saturate(145%);opacity:0;transform:translateY(8px) scale(.985);transform-origin:bottom left;pointer-events:none;visibility:hidden;transition:opacity .16s ease,transform .16s ease;z-index:2147483647}
.h2o-archive-dock .scopePicker.open .scopeMenu{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;visibility:visible}
.h2o-archive-dock .scopeOpt{position:relative;text-align:left;min-width:116px;padding:4px 10px 4px 12px;border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.05);transition:transform .14s ease,filter .14s ease,border-color .14s ease,background .14s ease,color .14s ease}
.h2o-archive-dock .scopeOpt::before{content:"";display:inline-block;width:7px;height:7px;margin-right:8px;border-radius:999px;background:currentColor;opacity:.92;vertical-align:middle}
.h2o-archive-dock .scopeOpt:hover{filter:brightness(1.06);transform:translateY(-1px)}
.h2o-archive-dock .scopeOpt[data-window="all"]{color:#e7edf8;background:linear-gradient(180deg,rgba(105,114,132,.18),rgba(64,72,90,.12));border-color:rgba(204,214,229,.22)}
.h2o-archive-dock .scopeOpt[data-window="minimap"]{color:#ff9a9a;background:linear-gradient(180deg,rgba(166,49,49,.24),rgba(86,22,22,.17));border-color:rgba(255,126,126,.28)}
.h2o-archive-dock .scopeOpt[data-window="snapshot"]{color:#8ecfff;background:linear-gradient(180deg,rgba(43,113,156,.24),rgba(18,57,87,.17));border-color:rgba(120,197,255,.28)}
.h2o-archive-dock .scopeOpt[data-window="unmount"]{color:#9fe3a5;background:linear-gradient(180deg,rgba(55,123,69,.24),rgba(27,73,39,.17));border-color:rgba(134,221,154,.28)}
.h2o-archive-dock .scopeOpt[data-window="highlights"]{color:#f2d67b;background:linear-gradient(180deg,rgba(152,117,37,.24),rgba(85,58,12,.17));border-color:rgba(242,214,123,.28)}
.h2o-archive-dock .scopeOpt[data-window="sections"]{color:#d6b0f8;background:linear-gradient(180deg,rgba(126,82,165,.24),rgba(63,36,101,.17));border-color:rgba(210,170,247,.28)}
.h2o-archive-dock .scopeOpt.on{color:#f7fbff;box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 10px 22px rgba(0,0,0,.2)}
.h2o-archive-dock .scopeOpt.on[data-window="all"]{border-color:rgba(233,241,251,.48);background:linear-gradient(180deg,rgba(124,133,153,.3),rgba(72,80,98,.2))}
.h2o-archive-dock .scopeOpt.on[data-window="minimap"]{border-color:rgba(255,147,147,.5);background:linear-gradient(180deg,rgba(186,56,56,.36),rgba(103,25,25,.24))}
.h2o-archive-dock .scopeOpt.on[data-window="snapshot"]{border-color:rgba(139,208,255,.5);background:linear-gradient(180deg,rgba(50,133,183,.36),rgba(21,69,105,.24))}
.h2o-archive-dock .scopeOpt.on[data-window="unmount"]{border-color:rgba(154,231,169,.5);background:linear-gradient(180deg,rgba(63,141,79,.36),rgba(31,86,46,.24))}
.h2o-archive-dock .scopeOpt.on[data-window="highlights"]{border-color:rgba(247,222,136,.5);background:linear-gradient(180deg,rgba(170,132,43,.36),rgba(95,64,14,.24))}
.h2o-archive-dock .scopeOpt.on[data-window="sections"]{border-color:rgba(220,184,250,.5);background:linear-gradient(180deg,rgba(136,89,177,.36),rgba(72,42,113,.24))}
.h2o-archive-dock .dockChoice{position:relative;display:inline-flex;align-items:center}
.h2o-archive-dock [data-ctrl-theme="all"]{--h2o-archive-ctrl-accent:#e7edf8;--h2o-archive-ctrl-accent-border:rgba(231,237,248,.26);--h2o-archive-ctrl-accent-glow:rgba(223,230,240,.16)}
.h2o-archive-dock [data-ctrl-theme="minimap"]{--h2o-archive-ctrl-accent:#ff9a9a;--h2o-archive-ctrl-accent-border:rgba(255,154,154,.32);--h2o-archive-ctrl-accent-glow:rgba(255,145,145,.18)}
.h2o-archive-dock [data-ctrl-theme="snapshot"]{--h2o-archive-ctrl-accent:#8ecfff;--h2o-archive-ctrl-accent-border:rgba(142,207,255,.32);--h2o-archive-ctrl-accent-glow:rgba(132,208,255,.18)}
.h2o-archive-dock [data-ctrl-theme="unmount"]{--h2o-archive-ctrl-accent:#9fe3a5;--h2o-archive-ctrl-accent-border:rgba(159,227,165,.32);--h2o-archive-ctrl-accent-glow:rgba(156,231,168,.18)}
.h2o-archive-dock [data-ctrl-theme="highlights"]{--h2o-archive-ctrl-accent:#f2d67b;--h2o-archive-ctrl-accent-border:rgba(242,214,123,.32);--h2o-archive-ctrl-accent-glow:rgba(248,221,133,.18)}
.h2o-archive-dock [data-ctrl-theme="sections"]{--h2o-archive-ctrl-accent:#d6b0f8;--h2o-archive-ctrl-accent-border:rgba(214,176,248,.32);--h2o-archive-ctrl-accent-glow:rgba(214,176,248,.18)}
.h2o-archive-dock .dockChoice .dockChoiceFace{display:inline-flex;align-items:center;justify-content:center;gap:0;line-height:1;padding-right:18px;pointer-events:none}
.h2o-archive-dock .dockChoiceLabel{opacity:.98}
.h2o-archive-dock .dockChoiceSep{opacity:.72}
.h2o-archive-dock .dockChoiceValue{font-weight:700;letter-spacing:.01em;color:inherit;transition:color .15s ease,text-shadow .15s ease,filter .15s ease}
.h2o-archive-dock .dockChoiceFace.has-value .dockChoiceValue{color:var(--h2o-archive-ctrl-accent,#e7edf8);text-shadow:0 0 7px var(--h2o-archive-ctrl-accent-glow,rgba(223,230,240,.16))}
.h2o-archive-dock .dockChoice::after{content:"▾";position:absolute;right:7px;top:50%;transform:translateY(-50%);font-size:9px;line-height:1;opacity:.76;pointer-events:none}
.h2o-archive-dock .dockChoice select{position:absolute;inset:0;z-index:1;min-width:100%;margin:0;opacity:0;cursor:pointer;-webkit-appearance:none;appearance:none}
.h2o-archive-dock .dockChoice:focus-within .dockChoiceFace{border-color:rgba(71,163,255,.7);box-shadow:0 0 0 1px rgba(71,163,255,.22) inset}
.h2o-archive-dock .dockChoice.is-disabled .dockChoiceFace,
.h2o-archive-dock .dockChoice.is-disabled::after{opacity:.46}
.h2o-archive-dock .dockChoice select:disabled{cursor:default}
.h2o-archive-dock button[data-ctrl-theme].is-used,
.h2o-archive-dock .capture[data-ctrl-theme].is-used{border-color:var(--h2o-archive-ctrl-accent-border);box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 0 10px var(--h2o-archive-ctrl-accent-glow)}
.h2o-archive-dock button[data-ctrl-theme].is-pulse,
.h2o-archive-dock .capture[data-ctrl-theme].is-pulse{animation:h2o-archive-control-pulse .74s ease-out}
.h2o-archive-dock .bgBtn{width:22px;min-width:22px;height:20px;min-height:20px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.h2o-archive-dock .bgBtn .bgIcon{width:12px;height:12px;display:block;fill:currentColor}
.h2o-archive-dock .bgBtn[data-bg="body"]{color:#67baf8}
.h2o-archive-dock .bgBtn[data-bg="bar"]{color:#dde3ee}
.h2o-archive-dock .bgBtn[data-bg="side"]{color:#ffcf6e}
.h2o-archive-dock .bgPicker.open .bgBtn{border-color:rgba(71,163,255,.7);box-shadow:0 0 0 1px rgba(71,163,255,.22) inset}
.h2o-archive-dock .bgMenu{display:none}
.h2o-archive-bg-menu{position:fixed;left:0;top:0;display:none;flex-direction:column;gap:4px;padding:5px;border:1px solid rgba(255,255,255,.2);border-radius:8px;background:rgba(11,13,17,.96);box-shadow:0 10px 24px rgba(0,0,0,.45);z-index:1000027}
.h2o-archive-bg-menu.open{display:flex}
.h2o-archive-bg-menu .bgOpt{min-width:74px;text-transform:capitalize;text-align:left}
.h2o-archive-dock .infoWarnDot{width:10px;height:10px;min-width:10px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.2)}
.h2o-archive-dock .infoWarnDot.on{background:#35c759;border-color:#35c759}
.h2o-archive-dock .infoPanel{position:absolute;left:0;bottom:calc(100% + 8px);width:fit-content;min-width:min(360px,calc(100vw - 24px));max-width:min(520px,calc(100vw - 24px));max-height:min(60vh,520px);overflow:auto;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:8px 10px;background:rgba(10,12,16,.96);box-shadow:0 12px 28px rgba(0,0,0,.45);opacity:0;transform:translateY(10px) scale(.985);transform-origin:bottom left;pointer-events:none;visibility:hidden;transition:opacity .17s ease,transform .17s ease;z-index:2147483647}
.h2o-archive-dock .infoWrap.open .infoPanel{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;visibility:visible}
.h2o-archive-dock .captureWrap{position:relative;display:inline-flex;align-items:center;gap:0}
.h2o-archive-dock .captureWrap .capture{border-top-right-radius:0;border-bottom-right-radius:0}
.h2o-archive-dock .captureWrap .captureMenuBtn{min-width:20px;width:20px;padding:${DOCK_CTRL_PAD_Y_PX}px 0;border-left:0;border-top-left-radius:0;border-bottom-left-radius:0}
.h2o-archive-dock .captureWrap.open .capture,
.h2o-archive-dock .captureWrap.open .captureMenuBtn{border-color:rgba(71,163,255,.7)}
.h2o-archive-dock .saveMenu{position:absolute;left:0;bottom:calc(100% + 8px);min-width:min(320px,calc(100vw - 24px));max-width:min(360px,calc(100vw - 24px));display:grid;gap:9px;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:12px;background:rgba(10,12,16,.97);box-shadow:0 12px 28px rgba(0,0,0,.45);opacity:0;transform:translateY(8px) scale(.985);transform-origin:bottom left;pointer-events:none;visibility:hidden;transition:opacity .16s ease,transform .16s ease;z-index:2147483647}
.h2o-archive-dock .captureWrap.open .saveMenu{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;visibility:visible}
.h2o-archive-dock .saveField{display:grid;gap:4px}
.h2o-archive-dock .saveFieldLabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.72}
.h2o-archive-dock .saveField select{width:100%}
.h2o-archive-dock .saveActions{display:flex;gap:8px}
.h2o-archive-dock .saveActions button{flex:1}
.h2o-archive-dock .saveHint{font-size:11px;line-height:1.35;opacity:.82}
html.h2o-archive-info-open [data-cgxui$="-dial-up"],
html.h2o-archive-info-open [data-cgxui$="-dial-down"],
html.h2o-archive-info-open [data-cgxui-owner="nvcn"][data-cgxui$="-nav-up"],
html.h2o-archive-info-open [data-cgxui-owner="nvcn"][data-cgxui$="-nav-down"],
html.h2o-archive-info-open .cgxui-nav-box-left[data-cgxui-owner="nvcn"]{
  opacity:0 !important;
  visibility:hidden !important;
  pointer-events:none !important;
}
html.h2o-commandbar-resizing-panel,
html.h2o-commandbar-resizing-panel *{
  cursor:col-resize !important;
  user-select:none !important;
}
.h2o-archive-dock .infoPanel .infoTable{border-collapse:separate;border-spacing:0;width:100%;font-size:11px;line-height:1.35}
.h2o-archive-dock .infoPanel .infoTable tr.sec td{padding:8px 8px 5px;border-top:1px solid rgba(255,255,255,.14);font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.74}
.h2o-archive-dock .infoPanel .infoTable tr.sec:first-child td{border-top:0;padding-top:2px}
.h2o-archive-dock .infoPanel .infoTable td{padding:5px 8px;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.08)}
.h2o-archive-dock .infoPanel .infoTable tr.last td{border-bottom:0}
.h2o-archive-dock .infoPanel .infoTable td.k{width:138px;opacity:.8}
.h2o-archive-dock .infoPanel .infoTable td.v{opacity:.96;word-break:break-word}
.h2o-archive-dock .infoPanel .infoTable td.v.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10.5px}
.h2o-archive-dock .infoPanel .infoTable tr.warn td.v{color:#ffd3d3}
.h2o-archive-dock .infoPanel .infoTable tr.good td.v{color:#a9e8b6}
.h2o-archive-dock .fold{position:fixed;right:-11px;bottom:${DOCK_FOLD_TAB_BOTTOM_PX}px;z-index:1000026;width:22px;min-width:22px;height:32px;min-height:32px;padding:0;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700;line-height:1;border-radius:10px 0 0 10px;border:1px solid rgba(255,255,255,.24);border-right:0;background:var(--h2o-archive-dock-bg,#14161a);box-shadow:0 8px 18px rgba(0,0,0,.38);opacity:.52;transition:right .18s ease,opacity .18s ease,filter .18s ease}
.h2o-archive-dock.edge-hot .fold,
.h2o-archive-dock .fold:hover{right:0;opacity:1;filter:brightness(1.08)}
.h2o-archive-dock .statusRow{position:relative;flex:0 0 calc(var(--h2o-archive-status-panel-size) - ${STATUS_PANEL_RESERVED_OFFSET_PX}px);max-width:calc(var(--h2o-archive-status-panel-size) - ${STATUS_PANEL_RESERVED_OFFSET_PX}px);min-width:0;min-height:22px;display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:0 2px 0 0;box-sizing:border-box;font-size:11px;line-height:1.05;letter-spacing:.01em;opacity:.97;color:#dfe6f0;pointer-events:auto;z-index:4}
.h2o-archive-dock.is-resizing-panel .toolsLeft{scrollbar-width:none}
.h2o-archive-dock .statusRow.is-empty{visibility:hidden;pointer-events:none}
.h2o-archive-dock .statusCount{flex:0 0 auto;min-width:18px;height:18px;padding:0 5px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);font-size:10px;font-weight:700;line-height:1;color:var(--h2o-archive-dock-status-color,#dfe6f0);box-shadow:0 0 0 1px rgba(255,255,255,.04) inset}
.h2o-archive-dock .statusViewport{position:relative;flex:1 1 auto;height:${STATUS_PANEL_ITEM_H_PX}px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.h2o-archive-dock .statusTrack{display:flex;flex-direction:column;align-items:stretch;min-width:100%;transition:transform .28s ease}
.h2o-archive-dock .statusItem{height:${STATUS_PANEL_ITEM_H_PX}px;display:flex;align-items:center;justify-content:center;padding:0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;color:#dfe6f0}
.h2o-archive-dock .statusItem.info{color:var(--h2o-archive-dock-status-color,#dfe6f0)}
.h2o-archive-dock .statusItem.warn{color:#ffd98b}
.h2o-archive-dock .statusItem.good{color:#a9e8b6}
.h2o-archive-dock .statusItem.dev{color:var(--h2o-archive-dock-status-color,#dfe6f0)}
.h2o-archive-dock .statusRow.is-dev-loader .statusViewport{transform:translateY(2px)}
.h2o-archive-dock .statusRow.is-dev-loader .statusItem{font-size:10px;line-height:1.02}
.h2o-archive-dock.expand-up{animation:h2o-archive-dock-up .18s ease-out}
.h2o-archive-dock.collapse-down{animation:h2o-archive-dock-down .16s ease-in}
@keyframes h2o-archive-dock-up{from{transform:translateY(14px);opacity:.86}to{transform:translateY(0);opacity:1}}
@keyframes h2o-archive-dock-down{from{transform:translateY(0);opacity:1}to{transform:translateY(14px);opacity:.86}}
@keyframes h2o-archive-control-pulse{0%{box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 0 0 var(--h2o-archive-ctrl-accent-glow)}50%{box-shadow:0 0 0 1px rgba(255,255,255,.05) inset,0 0 14px var(--h2o-archive-ctrl-accent-glow)}100%{box-shadow:0 0 0 1px rgba(255,255,255,.04) inset,0 0 6px var(--h2o-archive-ctrl-accent-glow)}}
.h2o-archive-dock.collapsed{left:0;right:0;bottom:0;width:0;max-width:none;padding:0;gap:0;min-height:0;height:0;background:transparent;backdrop-filter:none;border:0;border-radius:0;box-shadow:none}
.h2o-archive-dock.collapsed .fold{right:-11px;bottom:${DOCK_FOLD_TAB_BOTTOM_PX}px;width:22px;min-width:22px;height:32px;min-height:32px;padding:0;border-radius:10px 0 0 10px;border:1px solid rgba(255,255,255,.24);border-right:0;background:var(--h2o-archive-dock-bg,#14161a);box-shadow:0 8px 18px rgba(0,0,0,.38);opacity:.52}
.h2o-archive-dock.collapsed.edge-hot .fold,
.h2o-archive-dock.collapsed .fold:hover{right:0;opacity:1;filter:brightness(1.08)}
.h2o-archive-dock.collapsed .toolsPinnedLeft{display:none}
.h2o-archive-dock.collapsed .leftDivider{display:none}
.h2o-archive-dock.collapsed .toolsLeft{display:none}
.h2o-archive-dock.collapsed .rightDivider{display:none}
.h2o-archive-dock.collapsed::before{display:none}
.h2o-archive-dock.collapsed::after{display:none}
.h2o-archive-dock.collapsed .statusRow{display:none !important}
`;
    D.head?.appendChild(style);
  }

  function buildShell() {
    const wrap = D.createElement("div");
    wrap.className = "h2o-archive-dock";
    wrap.style.visibility = "hidden";
    wrap.style.opacity = "0";
    wrap.innerHTML = `
<div class="toolsPinnedLeft">
  <button type="button" class="infoWarnDot" aria-pressed="false" title="Important warnings OFF" aria-label="Important warnings OFF"></button>
  <div class="bgPicker">
    <button type="button" class="bgBtn" aria-haspopup="menu" aria-expanded="false" title="Dock background" aria-label="Dock background">
      <svg class="bgIcon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a9 9 0 0 0 0 18h1.7a2.7 2.7 0 0 0 0-5.4H12a2 2 0 1 1 0-4h2.8A4.6 4.6 0 0 0 14.8 3H12z"></path>
        <circle cx="7.7" cy="9.2" r="1.05"></circle>
        <circle cx="10.4" cy="6.8" r="1.02"></circle>
        <circle cx="13.8" cy="6.6" r="1.0"></circle>
      </svg>
    </button>
    <div class="bgMenu" role="menu" aria-label="Dock background options">
      <button type="button" class="bgOpt" data-bg="${DOCK_BG_BODY}" role="menuitem">body</button>
      <button type="button" class="bgOpt" data-bg="${DOCK_BG_BAR}" role="menuitem">bar</button>
      <button type="button" class="bgOpt" data-bg="${DOCK_BG_SIDE}" role="menuitem">side</button>
    </div>
  </div>
  <div class="infoWrap">
    <button type="button" class="infoBtn" aria-pressed="false">Info</button>
    <div class="infoPanel" aria-hidden="true"></div>
  </div>
  <div class="scopePicker">
    <button type="button" class="scopeBtn" aria-haspopup="menu" aria-expanded="false" title="Command bar window" aria-label="Command bar window">All</button>
    <div class="scopeMenu" role="menu" aria-label="Command bar windows">
      <button type="button" class="scopeOpt" data-window="${WINDOW_ALL}" role="menuitemradio" aria-checked="true">All</button>
      <button type="button" class="scopeOpt" data-window="${WINDOW_MINIMAP}" role="menuitemradio" aria-checked="false">MiniMap</button>
      <button type="button" class="scopeOpt" data-window="${WINDOW_SNAPSHOT}" role="menuitemradio" aria-checked="false">Snapshot</button>
      <button type="button" class="scopeOpt" data-window="${WINDOW_UNMOUNT}" role="menuitemradio" aria-checked="false">Unmount</button>
      <button type="button" class="scopeOpt" data-window="${WINDOW_HIGHLIGHTS}" role="menuitemradio" aria-checked="false">Highlights</button>
      <button type="button" class="scopeOpt" data-window="${WINDOW_SECTIONS}" role="menuitemradio" aria-checked="false">Sections</button>
    </div>
  </div>
</div>
<div class="leftDivider dockDivider" aria-hidden="true"></div>
<div class="toolsLeft">
  <div class="toolsRail">
    <span class="state" aria-hidden="true"></span>
  </div>
</div>
<div class="rightDivider dockDivider" role="separator" aria-orientation="vertical" tabindex="0"></div>
<button type="button" class="fold" title="Collapse archive dock" aria-label="Collapse archive dock">▸</button>
<div class="statusRow is-empty" aria-live="polite">
  <div class="statusCount" aria-hidden="true">0</div>
  <div class="statusViewport">
    <div class="statusTrack"></div>
  </div>
</div>
`;
    D.documentElement.appendChild(wrap);
    return wrap;
  }

  function cacheShellRefs(root) {
    state.root = root;
    state.toolsPinnedLeft = root.querySelector(".toolsPinnedLeft");
    state.leftDivider = root.querySelector(".leftDivider");
    state.rightDivider = root.querySelector(".rightDivider");
    state.toolsLeft = root.querySelector(".toolsLeft");
    state.toolsRail = root.querySelector(".toolsRail");
    state.stateEl = root.querySelector(".state");
    state.foldBtn = root.querySelector(".fold");
    state.statusRow = root.querySelector(".statusRow");
    state.statusCountEl = root.querySelector(".statusCount");
    state.statusViewportEl = root.querySelector(".statusViewport");
    state.statusTrackEl = root.querySelector(".statusTrack");
    state.infoWrap = state.toolsPinnedLeft?.querySelector(".infoWrap") || null;
    state.infoBtn = state.infoWrap?.querySelector(".infoBtn") || null;
    state.infoPanel = state.infoWrap?.querySelector(".infoPanel") || null;
    state.infoWarnDot = state.toolsPinnedLeft?.querySelector(".infoWarnDot") || null;
    state.bgPicker = root.querySelector(".bgPicker");
    state.bgBtn = state.bgPicker?.querySelector(".bgBtn") || null;
    state.bgMenu = state.bgPicker?.querySelector(".bgMenu") || null;
    state.bgOpts = Array.from(state.bgPicker?.querySelectorAll(".bgOpt") || []);
    state.scopePicker = root.querySelector(".scopePicker");
    state.scopeBtn = state.scopePicker?.querySelector(".scopeBtn") || null;
    state.scopeMenu = state.scopePicker?.querySelector(".scopeMenu") || null;
    state.scopeOpts = Array.from(state.scopePicker?.querySelectorAll(".scopeOpt") || []);
    if (state.bgMenu && !state.bgMenu.classList.contains("h2o-archive-bg-menu")) {
      state.bgMenu.classList.add("h2o-archive-bg-menu");
    }
    if (state.bgMenu && state.bgMenu.parentElement !== D.documentElement) {
      try { D.documentElement.appendChild(state.bgMenu); } catch {}
    }
  }

  function ensureMounted() {
    mountStyles();
    let root = state.root;
    if (!root || !root.isConnected) {
      root = D.querySelector(".h2o-archive-dock");
      if (!root) root = buildShell();
      cacheShellRefs(root);
      state.mounted = true;
      state.mountReady = false;
    } else if (!state.toolsLeft || !state.toolsRail || !state.foldBtn || !state.statusRow || !state.statusTrackEl) {
      cacheShellRefs(root);
      state.mountReady = false;
    }
    if (state.mounting) return state.root || root;
    if (!state.mountReady) {
      state.mounting = true;
      try {
        const bgMode = getBgMode();
        applyBackgroundMode(bgMode);
        setBgButtonState(bgMode);
        state.scopeWindow = getWindowScope();
        updateScopeButtonState(state.scopeWindow);
        renderScopeMenuState();
        closeScopePicker();
        primeStatusPanelSize();
        setFoldState(getCollapsed(), false, { skipPersist: true, skipLayout: true });
        setImportantDotState(getImportantOnly());
        if (!state.listenersBound) bindShellListeners();
        syncInfoPanelRouteState(true);
        schedulePrimeLayout();
        if (!state.revealRaf) {
          state.revealRaf = W.requestAnimationFrame(() => {
            state.revealRaf = 0;
            if (!state.root?.isConnected) return;
            state.root.style.removeProperty("visibility");
            state.root.style.removeProperty("opacity");
            schedulePrimeLayout();
          });
        }
        state.mountReady = true;
      } finally {
        state.mounting = false;
      }
    } else if (!state.listenersBound) {
      bindShellListeners();
    }
    return state.root;
  }

  function schedulePrimeLayout() {
    if (state.primeLayoutRaf) return;
    state.primeLayoutRaf = W.requestAnimationFrame(() => {
      state.primeLayoutRaf = 0;
      ensureDockHeightObserver();
      refreshDockSidebarObserver();
      scheduleDockGeometryBurst();
      updateDockHeightVar();
    });
  }

  function applyBackgroundMode(modeRaw) {
    const root = ensureMounted();
    const mode = normalizeDockBgMode(modeRaw);
    const bg = dockBgColorForMode(mode);
    const statusColor = dockStatusColorForMode(mode);
    root.dataset.bg = mode;
    root.style.setProperty("--h2o-archive-dock-bg", bg);
    root.style.setProperty("--h2o-archive-dock-pill-bg", bg);
    root.style.setProperty("--h2o-archive-dock-status-color", statusColor);
    return mode;
  }

  function setBgButtonState(modeRaw) {
    const mode = normalizeDockBgMode(modeRaw);
    if (!state.bgBtn) return;
    state.bgBtn.dataset.bg = mode;
    state.bgBtn.title = `Dock background: ${mode}`;
    state.bgBtn.setAttribute("aria-label", state.bgBtn.title);
  }

  function setInfoPanelVisible(open) {
    ensureMounted();
    const docRoot = D.documentElement;
    const isOpen = !!open;
    if (!state.infoWrap) {
      try { docRoot?.classList?.remove("h2o-archive-info-open"); } catch {}
      return;
    }
    state.infoWrap.classList.toggle("open", isOpen);
    try { docRoot?.classList?.toggle("h2o-archive-info-open", isOpen); } catch {}
    state.infoPanel?.setAttribute("aria-hidden", isOpen ? "false" : "true");
    if (state.infoBtn) {
      state.infoBtn.setAttribute("aria-pressed", isOpen ? "true" : "false");
      state.infoBtn.textContent = "Info";
    }
    if (isOpen) renderPanelSections();
    schedulePrimeLayout();
  }

  function setImportantDotState(on) {
    ensureMounted();
    const isOn = !!on;
    if (!state.infoWarnDot) return;
    state.infoWarnDot.classList.toggle("on", isOn);
    state.infoWarnDot.setAttribute("aria-pressed", isOn ? "true" : "false");
    state.infoWarnDot.title = isOn ? "Important warnings ON" : "Important warnings OFF";
    state.infoWarnDot.setAttribute("aria-label", state.infoWarnDot.title);
    renderStatusRow();
    if (state.infoWrap?.classList.contains("open")) renderPanelSections();
  }

  function setFoldState(collapsed, animate = true, opts = {}) {
    ensureMounted();
    const skipPersist = !!opts.skipPersist;
    const skipLayout = !!opts.skipLayout;
    const isCollapsed = !!collapsed;
    state.root?.classList.toggle("collapsed", isCollapsed);
    if (state.foldBtn) {
      state.foldBtn.textContent = isCollapsed ? "◂" : "▸";
      state.foldBtn.title = isCollapsed ? "Open archive dock" : "Collapse archive dock";
      state.foldBtn.setAttribute("aria-label", state.foldBtn.title);
    }
    if (animate && state.root) {
      state.root.classList.remove("expand-up", "collapse-down");
      void state.root.offsetWidth;
      state.root.classList.add(isCollapsed ? "collapse-down" : "expand-up");
      W.setTimeout(() => {
        state.root?.classList.remove("expand-up", "collapse-down");
      }, 240);
    }
    if (!skipPersist) setCollapsed(isCollapsed);
    if (!skipLayout) schedulePrimeLayout();
  }

  function closeBgPicker() {
    if (!state.bgPicker || !state.bgBtn) return;
    state.bgPicker.classList.remove("open");
    state.bgBtn.setAttribute("aria-expanded", "false");
    try { state.bgMenu?.classList?.remove("open"); } catch {}
  }

  function placeBgMenu() {
    if (!state.bgMenu || !state.bgBtn) return;
    try {
      const btnRect = state.bgBtn.getBoundingClientRect();
      const menuRect = state.bgMenu.getBoundingClientRect();
      const vw = Math.max(Number(W.innerWidth || 0), Number(D.documentElement?.clientWidth || 0));
      const left = Math.max(8, Math.min(Math.round(btnRect.left), Math.max(8, vw - Math.round(menuRect.width || 0) - 8)));
      const top = Math.max(8, Math.round(btnRect.top - Number(menuRect.height || 0) - 8));
      state.bgMenu.style.left = `${left}px`;
      state.bgMenu.style.top = `${top}px`;
    } catch {}
  }

  function openBgPicker() {
    ensureMounted();
    if (!state.bgPicker || !state.bgBtn) return;
    const nextOpen = !state.bgPicker.classList.contains("open");
    if (nextOpen) closeScopePicker();
    state.bgPicker.classList.toggle("open", nextOpen);
    state.bgBtn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    try { state.bgMenu?.classList?.toggle("open", nextOpen); } catch {}
    if (nextOpen) W.requestAnimationFrame(placeBgMenu);
  }

  function getWindowScopeIndex(scopeRaw) {
    const scope = normalizeWindowScope(scopeRaw);
    const idx = WINDOW_OPTS.findIndex((item) => item.id === scope);
    return idx >= 0 ? idx : 0;
  }

  function resolveControlWindow(rec) {
    const explicit = normalizeWindowScope(rec?.def?.windowId || rec?.def?.windowScope || rec?.scopeWindow || "");
    if (explicit !== WINDOW_ALL) return explicit;
    const owner = String(rec?.owner || "").trim().toLowerCase();
    const groupId = String(rec?.groupId || "").trim().toLowerCase();
    if (owner === "mm" || groupId.startsWith("mm.")) return WINDOW_MINIMAP;
    if (owner === "sn" || groupId.startsWith("sn.")) return WINDOW_SNAPSHOT;
    if (owner === "um" || owner === "pw" || groupId.startsWith("um.") || groupId.startsWith("pw.")) return WINDOW_UNMOUNT;
    if (owner === "hl" || owner === "hi" || groupId.startsWith("hl.") || groupId.startsWith("hi.")) return WINDOW_HIGHLIGHTS;
    if (owner === "sc" || owner === "sb" || owner === "se" || groupId.startsWith("sc.") || groupId.startsWith("sb.") || groupId.startsWith("se.")) return WINDOW_SECTIONS;
    return WINDOW_ALL;
  }

  function getControlTheme(rec) {
    return normalizeWindowScope(rec?.scopeWindow || resolveControlWindow(rec) || WINDOW_ALL);
  }

  function setControlThemeAttr(el, themeRaw) {
    if (!el) return;
    const theme = normalizeWindowScope(themeRaw || WINDOW_ALL);
    try { el.setAttribute("data-ctrl-theme", theme); } catch {}
  }

  function syncControlTheme(rec) {
    const theme = getControlTheme(rec);
    rec.theme = theme;
    setControlThemeAttr(rec?.node, theme);
    setControlThemeAttr(rec?.parts?.button, theme);
    setControlThemeAttr(rec?.parts?.face, theme);
    setControlThemeAttr(rec?.parts?.primary, theme);
    return theme;
  }

  function syncControlUsedState(rec) {
    const used = !!rec?.used;
    rec?.parts?.button?.classList?.toggle?.("is-used", used);
    rec?.parts?.primary?.classList?.toggle?.("is-used", used);
  }

  function pulseControlEl(el) {
    if (!el) return;
    try {
      if (el.__h2oPulseTimer) W.clearTimeout(el.__h2oPulseTimer);
    } catch {}
    try {
      el.classList.remove("is-pulse");
      void el.offsetWidth;
      el.classList.add("is-pulse");
    } catch {}
    try {
      el.__h2oPulseTimer = W.setTimeout(() => {
        try { el.classList.remove("is-pulse"); } catch {}
        try { el.__h2oPulseTimer = 0; } catch {}
      }, 820);
    } catch {}
  }

  function markControlUsed(rec, el = null) {
    if (!rec) return;
    rec.used = true;
    syncControlUsedState(rec);
    pulseControlEl(el || rec?.parts?.button || rec?.parts?.primary || rec?.parts?.face || null);
  }

  function shouldShowControlForWindow(rec) {
    if (!rec || rec.zone !== "main") return true;
    const current = normalizeWindowScope(state.scopeWindow || WINDOW_ALL);
    if (current === WINDOW_ALL) return true;
    return resolveControlWindow(rec) === current;
  }

  function applyControlWindowVisibility(rec) {
    if (!rec?.node) return false;
    const visible = shouldShowControlForWindow(rec);
    rec.node.hidden = !visible;
    rec.node.setAttribute("aria-hidden", visible ? "false" : "true");
    if (!visible && state.activeCaptureId === rec.id) setCaptureMenuOpen(rec, false);
    return visible;
  }

  function renderScopeMenuState() {
    const active = normalizeWindowScope(state.scopeWindow || WINDOW_ALL);
    for (const opt of state.scopeOpts) {
      const scope = normalizeWindowScope(opt?.dataset?.window || WINDOW_ALL);
      const on = scope === active;
      opt?.classList?.toggle("on", on);
      try { opt?.setAttribute?.("aria-checked", on ? "true" : "false"); } catch {}
    }
  }

  function updateScopeButtonState(scopeRaw) {
    const meta = getWindowScopeMeta(scopeRaw);
    try { state.root?.setAttribute?.("data-window-scope", meta.id); } catch {}
    if (!state.scopeBtn) return meta.id;
    try { state.scopeBtn.setAttribute("data-window-scope", meta.id); } catch {}
    state.scopeBtn.textContent = meta.label;
    state.scopeBtn.title = `Command bar window: ${meta.label}`;
    state.scopeBtn.setAttribute("aria-label", state.scopeBtn.title);
    return meta.id;
  }

  function applyWindowScope(scopeRaw, opts = {}) {
    const next = setWindowScope(scopeRaw);
    state.scopeWindow = next;
    updateScopeButtonState(next);
    renderScopeMenuState();
    for (const rec of state.controls.values()) applyControlWindowVisibility(rec);
    if (opts.resetScroll !== false && state.toolsLeft) state.toolsLeft.scrollLeft = 0;
    updateDockOverflowMask();
    schedulePrimeLayout();
    return next;
  }

  function cycleWindowScope(stepRaw = 1) {
    const step = Number(stepRaw) < 0 ? -1 : 1;
    const idx = getWindowScopeIndex(state.scopeWindow || WINDOW_ALL);
    const len = WINDOW_OPTS.length || 1;
    const nextIdx = (idx + step + len) % len;
    return applyWindowScope(WINDOW_OPTS[nextIdx]?.id || WINDOW_ALL);
  }

  function closeScopePicker() {
    if (!state.scopePicker || !state.scopeBtn) return;
    state.scopePicker.classList.remove("open");
    state.root?.classList?.remove?.("scope-open");
    state.scopeBtn.setAttribute("aria-expanded", "false");
    state.scopeMenu?.setAttribute("aria-hidden", "true");
  }

  function openScopePicker(forceOpen = null) {
    ensureMounted();
    if (!state.scopePicker || !state.scopeBtn) return;
    const nextOpen = forceOpen == null ? !state.scopePicker.classList.contains("open") : !!forceOpen;
    if (nextOpen) closeBgPicker();
    state.scopePicker.classList.toggle("open", nextOpen);
    state.root?.classList?.toggle?.("scope-open", nextOpen);
    state.scopeBtn.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    state.scopeMenu?.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    renderScopeMenuState();
  }

  function resolveMaybeFn(value, ctx = {}) {
    if (typeof value !== "function") return value;
    try { return value(ctx); } catch (e) { warn("section resolver failed", e); return ""; }
  }

  function getSortedSections() {
    const items = Array.from(state.panelSections.values());
    items.sort((a, b) => {
      const ao = Number(a.order) || 0;
      const bo = Number(b.order) || 0;
      if (ao !== bo) return ao - bo;
      return (a.seq || 0) - (b.seq || 0);
    });
    return items;
  }

  function renderPanelSections() {
    ensureMounted();
    if (!state.infoPanel) return;
    const sections = getSortedSections();
    if (!sections.length) {
      state.infoPanel.replaceChildren();
      return;
    }
    const table = D.createElement("table");
    table.className = "infoTable";
    const tbody = D.createElement("tbody");
    for (const section of sections) {
      const secRow = D.createElement("tr");
      secRow.className = "sec";
      const secCell = D.createElement("td");
      secCell.colSpan = 2;
      secCell.textContent = String(resolveMaybeFn(section.title, { section }) || "");
      secRow.appendChild(secCell);
      tbody.appendChild(secRow);

      const rows = Array.isArray(section.rows) ? section.rows : [];
      for (const row of rows) {
        const tr = D.createElement("tr");
        const tone = String(resolveMaybeFn(row?.tone, { section, row }) || "").trim();
        if (tone === "warn") tr.classList.add("warn");
        if (tone === "good") tr.classList.add("good");
        if (resolveMaybeFn(row?.last, { section, row })) tr.classList.add("last");
        const k = D.createElement("td");
        const v = D.createElement("td");
        k.className = "k";
        v.className = "v";
        if (resolveMaybeFn(row?.mono, { section, row })) v.classList.add("mono");
        k.textContent = String(resolveMaybeFn(row?.key, { section, row }) || "");
        v.textContent = String(resolveMaybeFn(row?.value, { section, row }) ?? "");
        tr.append(k, v);
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
    state.infoPanel.replaceChildren(table);
  }

  function isDevLoaderStatus(winner, textRaw, titleRaw) {
    const owner = String(winner?.owner || "").trim().toLowerCase();
    if (owner === "dev" || owner === "devcontrols" || owner === "dev-controls") return true;
    const combined = `${String(textRaw || "")} ${String(titleRaw || "")}`.toLowerCase();
    if (!combined) return false;
    return combined.includes("h2o dev controls")
      || (/loaded\s+\d+\s*\/\s*\d+/i.test(combined) && combined.includes("disabled") && combined.includes("toggles"));
  }

  function clearStatusRotateTimer() {
    if (!state.statusRotateTimer) return;
    try { W.clearTimeout(state.statusRotateTimer); } catch {}
    state.statusRotateTimer = 0;
  }

  function normalizeStatusTone(toneRaw, textRaw = "") {
    const tone = String(toneRaw || "").trim().toLowerCase();
    if (tone === "warn" || tone === "good" || tone === "info" || tone === "dev") return tone;
    const text = String(textRaw || "").trim().toLowerCase();
    if (!text) return "info";
    if (isDevLoaderStatus(null, text, text)) return "dev";
    if (/(warn|warning|unavailable|error|failed|missing|fallback|disabled|retry|pending|skipped|not ready|cold-only)/i.test(text)) return "warn";
    if (/(opened|saved|ready|resynced|captured|capture|synced|active)/i.test(text)) return "good";
    return "info";
  }

  function normalizeStatusMessage(raw, fallback = {}) {
    const source = isObj(raw) ? raw : { text: raw };
    const text = String(source.text || source.message || source.label || "").trim();
    if (!text) return null;
    const title = String(source.title || text).trim() || text;
    const priority = Number(source.priority ?? fallback.priority) || 0;
    const owner = String(source.owner || fallback.owner || "").trim();
    const tone = normalizeStatusTone(source.tone || fallback.tone || "", text);
    const important = source.important == null ? !!fallback.important || tone === "warn" : !!source.important;
    const keyBase = `${owner}|${tone}|${text}|${title}|${important ? 1 : 0}`;
    return {
      key: stableHash(keyBase),
      owner,
      text,
      title,
      tone,
      important,
      priority,
      isDevLoader: isDevLoaderStatus({ owner }, text, title),
      seq: Number(source.seq ?? fallback.seq) || 0,
      statusSeq: Number(fallback.statusSeq) || 0,
    };
  }

  function normalizeStatusMessageList(listRaw, fallback = {}) {
    const list = Array.isArray(listRaw) ? listRaw : (listRaw == null ? [] : [listRaw]);
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const msg = normalizeStatusMessage(list[i], { ...fallback, seq: i });
      if (msg) out.push(msg);
    }
    return out;
  }

  function statusToneScore(item) {
    if (!item) return 0;
    let score = Number(item.priority) || 0;
    if (item.important) score += 400;
    if (item.tone === "warn") score += 300;
    else if (item.tone === "good") score += 120;
    else if (item.tone === "info") score += 100;
    else if (item.tone === "dev") score += 80;
    return score;
  }

  function getVisibleStatusItems() {
    const importantOnly = getImportantOnly();
    const seen = new Set();
    const out = [];
    for (const rec of state.statuses.values()) {
      const regular = Array.isArray(rec.messages) ? rec.messages : normalizeStatusMessageList(rec.text ? [{ text: rec.text, title: rec.title }] : [], {
        owner: rec.owner,
        priority: rec.priority,
        statusSeq: rec.seq,
      });
      const important = Array.isArray(rec.importantMessages) ? rec.importantMessages : normalizeStatusMessageList(rec.importantText ? [{ text: rec.importantText, title: rec.importantTitle || rec.importantText, tone: "warn", important: true }] : [], {
        owner: rec.owner,
        priority: (Number(rec.priority) || 0) + 200,
        tone: "warn",
        important: true,
        statusSeq: rec.seq,
      });
      const pool = importantOnly ? important : [...important, ...regular];
      for (const item of pool) {
        if (!item?.text) continue;
        const dedupeKey = `${String(item.tone || "")}|${String(item.text || "").toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(item);
      }
    }
    out.sort((a, b) => {
      const as = statusToneScore(a);
      const bs = statusToneScore(b);
      if (as !== bs) return bs - as;
      if ((b.statusSeq || 0) !== (a.statusSeq || 0)) return (b.statusSeq || 0) - (a.statusSeq || 0);
      return (a.seq || 0) - (b.seq || 0);
    });
    return out;
  }

  function applyStatusPanelView() {
    const items = Array.isArray(state.statusItems) ? state.statusItems : [];
    const len = items.length;
    const idx = len ? Math.max(0, Math.min(Number(state.statusViewIndex) || 0, len - 1)) : 0;
    state.statusViewIndex = idx;
    if (state.statusTrackEl) state.statusTrackEl.style.transform = `translateY(-${idx * STATUS_PANEL_ITEM_H_PX}px)`;
    const active = len ? items[idx] || null : null;
    if (state.statusRow) {
      state.statusRow.classList.toggle("is-empty", !len);
      state.statusRow.classList.toggle("is-dev-loader", !!active?.isDevLoader);
      state.statusRow.title = active ? String(active.title || active.text || "") : "";
      state.statusRow.setAttribute("aria-label", state.statusRow.title || "");
    }
    if (state.statusViewportEl) state.statusViewportEl.setAttribute("aria-label", active ? String(active.title || active.text || "") : "");
    if (state.statusCountEl) {
      const countText = len > 99 ? "99+" : String(len);
      state.statusCountEl.textContent = countText;
      state.statusCountEl.title = len ? `${len} message${len === 1 ? "" : "s"}` : "No messages";
    }
  }

  function scheduleStatusRotate() {
    clearStatusRotateTimer();
    const len = Array.isArray(state.statusItems) ? state.statusItems.length : 0;
    if (len < 2 || state.statusHover) return;
    const waitUntil = Number(state.statusRotatePauseUntilMs || 0);
    const delay = Math.max(900, Math.max(STATUS_ROTATE_MS, waitUntil - Date.now()));
    state.statusRotateTimer = W.setTimeout(() => {
      state.statusRotateTimer = 0;
      if (state.statusHover || !Array.isArray(state.statusItems) || state.statusItems.length < 2) return;
      state.statusViewIndex = (Number(state.statusViewIndex || 0) + 1) % state.statusItems.length;
      applyStatusPanelView();
      scheduleStatusRotate();
    }, delay);
  }

  function stepStatusView(stepRaw = 1, opts = {}) {
    const items = Array.isArray(state.statusItems) ? state.statusItems : [];
    const len = items.length;
    if (!len) return false;
    const step = Number(stepRaw) < 0 ? -1 : 1;
    const next = (Number(state.statusViewIndex || 0) + step + len) % len;
    state.statusViewIndex = next;
    if (opts.pause !== false) state.statusRotatePauseUntilMs = Date.now() + STATUS_ROTATE_USER_PAUSE_MS;
    applyStatusPanelView();
    scheduleStatusRotate();
    return true;
  }

  function renderStatusRow() {
    ensureMounted();
    if (!state.statusRow || !state.statusTrackEl) return;
    const prevItems = Array.isArray(state.statusItems) ? state.statusItems.slice() : [];
    const prevKey = prevItems[Math.max(0, Math.min(Number(state.statusViewIndex) || 0, Math.max(0, prevItems.length - 1)))]?.key || "";
    const items = getVisibleStatusItems();
    state.statusItems = items;
    if (!items.length) {
      clearStatusRotateTimer();
      state.statusViewIndex = 0;
      state.statusTrackEl.replaceChildren();
      applyStatusPanelView();
      return;
    }
    const hasNewWarn = items.some((item) => item.tone === "warn" && !prevItems.some((prev) => prev.key === item.key));
    if (hasNewWarn) {
      state.statusViewIndex = Math.max(0, items.findIndex((item) => item.tone === "warn"));
      state.statusRotatePauseUntilMs = Date.now() + STATUS_ROTATE_USER_PAUSE_MS;
    } else {
      const prevIdx = items.findIndex((item) => item.key === prevKey);
      state.statusViewIndex = prevIdx >= 0 ? prevIdx : Math.max(0, Math.min(Number(state.statusViewIndex) || 0, items.length - 1));
    }
    const frag = D.createDocumentFragment();
    for (const item of items) {
      const node = D.createElement("div");
      node.className = `statusItem ${String(item.tone || "info")}`;
      node.textContent = String(item.text || "");
      node.title = String(item.title || item.text || "");
      frag.appendChild(node);
    }
    state.statusTrackEl.replaceChildren(frag);
    applyStatusPanelView();
    scheduleStatusRotate();
  }

  function getActiveCaptureRecord() {
    return state.activeCaptureId ? state.controls.get(state.activeCaptureId) || null : null;
  }

  function setCaptureMenuOpen(rec, open) {
    if (!rec?.parts?.wrap || !rec.parts.menuBtn || !rec.parts.saveMenu) return;
    const isOpen = !!open;
    if (!isOpen && state.activeCaptureId === rec.id) state.activeCaptureId = "";
    if (isOpen) {
      const prev = getActiveCaptureRecord();
      if (prev && prev !== rec) setCaptureMenuOpen(prev, false);
      state.activeCaptureId = rec.id;
    }
    rec.parts.wrap.classList.toggle("open", isOpen);
    rec.parts.menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    rec.parts.saveMenu.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }

  function fillCaptureMenu(rec, model = {}) {
    if (!rec?.parts?.saveFolder || !rec.parts.saveMode) return;
    const folderOptions = Array.isArray(model.folderOptions) ? model.folderOptions : [];
    rec.parts.saveFolder.textContent = "";
    const options = folderOptions.length ? folderOptions : [{ value: "", label: "Unfiled" }];
    for (const item of options) {
      const opt = D.createElement("option");
      opt.value = String(item?.value || "");
      opt.textContent = String(item?.label || item?.value || "").trim() || String(item?.value || "");
      rec.parts.saveFolder.appendChild(opt);
    }
    rec.parts.saveFolder.value = String(model.folderId || "");
    rec.parts.saveMode.value = normalizeAfterSaveMode(model.mode || getAfterSaveMode());
  }

  function syncSelectFace(rec) {
    const selectEl = rec?.parts?.select;
    const face = rec?.parts?.face;
    const baseEl = rec?.parts?.baseEl;
    const sepEl = rec?.parts?.sepEl;
    const valueEl = rec?.parts?.valueEl;
    if (!selectEl || !face) return;
    const base = String(rec.def.faceBase || rec.def.title || "").trim();
    const suffix = String(rec.def.faceMap?.[String(selectEl.value || "")] || "").trim();
    const fullLabel = suffix ? `${base}: ${suffix}` : base;
    const selectedText = String(selectEl.options?.[selectEl.selectedIndex]?.textContent || "").trim();
    const assistiveLabel = selectedText ? `${fullLabel} (${selectedText})` : fullLabel;
    if (baseEl && sepEl && valueEl) {
      baseEl.textContent = base;
      sepEl.textContent = suffix ? ": " : "";
      valueEl.textContent = suffix;
      face.classList.toggle("has-value", !!suffix);
    } else {
      face.textContent = fullLabel;
    }
    face.title = assistiveLabel;
    selectEl.title = assistiveLabel;
    selectEl.setAttribute("aria-label", assistiveLabel);
    rec.node.classList.toggle("is-disabled", !!selectEl.disabled);
  }

  function buildButtonControl(rec) {
    const btn = D.createElement("button");
    btn.type = "button";
    rec.parts = { button: btn };
    btn.addEventListener("click", (ev) => {
      markControlUsed(rec, btn);
      try {
        const res = rec.def.onClick?.({ id: rec.id, owner: rec.owner, el: btn, event: ev });
        if (res && typeof res.then === "function") res.catch((e) => warn(`control click failed: ${rec.id}`, e));
      } catch (e) {
        warn(`control click failed: ${rec.id}`, e);
      }
    });
    rec.node = btn;
    patchButtonControl(rec, rec.def);
    return btn;
  }

  function patchButtonControl(rec, nextDef) {
    const btn = rec?.parts?.button;
    if (!btn) return false;
    btn.className = String(nextDef.className || "").trim();
    btn.textContent = String(nextDef.text || "");
    btn.title = String(nextDef.title || nextDef.text || "");
    btn.setAttribute("aria-label", btn.title);
    btn.disabled = !!nextDef.disabled;
    return true;
  }

  function buildSelectControl(rec) {
    const wrap = D.createElement("div");
    wrap.className = "dockChoice";
    const face = D.createElement("button");
    face.type = "button";
    face.className = "dockChoiceFace";
    face.tabIndex = -1;
    face.setAttribute("aria-hidden", "true");
    const baseEl = D.createElement("span");
    baseEl.className = "dockChoiceLabel";
    const sepEl = D.createElement("span");
    sepEl.className = "dockChoiceSep";
    const valueEl = D.createElement("span");
    valueEl.className = "dockChoiceValue";
    face.append(baseEl, sepEl, valueEl);
    const select = D.createElement("select");
    select.addEventListener("change", (ev) => {
      syncSelectFace(rec);
      pulseControlEl(face);
      try {
        const res = rec.def.onChange?.({ id: rec.id, owner: rec.owner, value: select.value, el: select, event: ev });
        if (res && typeof res.then === "function") res.catch((e) => warn(`control change failed: ${rec.id}`, e));
      } catch (e) {
        warn(`control change failed: ${rec.id}`, e);
      }
    });
    wrap.append(face, select);
    rec.parts = { face, select, baseEl, sepEl, valueEl };
    rec.node = wrap;
    patchSelectControl(rec, rec.def);
    return wrap;
  }

  function patchSelectControl(rec, nextDef) {
    const wrap = rec?.node;
    const select = rec?.parts?.select;
    if (!wrap || !select) return false;
    const className = String(nextDef.className || "").trim();
    select.className = className;
    select.textContent = "";
    const options = Array.isArray(nextDef.options) ? nextDef.options : [];
    for (const item of options) {
      const opt = D.createElement("option");
      opt.value = String(item?.value || "");
      opt.textContent = String(item?.label || item?.value || "").trim();
      select.appendChild(opt);
    }
    select.value = String(nextDef.value ?? "");
    if (select.value !== String(nextDef.value ?? "") && options[0]) {
      select.value = String(options[0].value || "");
    }
    select.disabled = !!nextDef.disabled;
    select.title = String(nextDef.title || nextDef.faceBase || "");
    syncSelectFace(rec);
    return true;
  }

  function buildCaptureMenuControl(rec) {
    const wrap = D.createElement("div");
    wrap.className = "captureWrap";
    const primary = D.createElement("button");
    primary.type = "button";
    primary.className = "capture";
    const menuBtn = D.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "captureMenuBtn";
    menuBtn.setAttribute("aria-haspopup", "dialog");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.title = "Capture options";
    menuBtn.setAttribute("aria-label", "Capture options");
    menuBtn.textContent = "▾";
    const saveMenu = D.createElement("div");
    saveMenu.className = "saveMenu";
    saveMenu.setAttribute("aria-hidden", "true");
    saveMenu.innerHTML = `
<label class="saveField">
  <span class="saveFieldLabel">Folder</span>
  <select class="saveFolder"></select>
</label>
<label class="saveField">
  <span class="saveFieldLabel">After save</span>
  <select class="saveMode">
    <option value="${SAVE_MODE_SILENT}">Stay here</option>
    <option value="${SAVE_MODE_READER}">Open Reader</option>
    <option value="${SAVE_MODE_LIBRARY}">Open Saved Chats</option>
  </select>
</label>
<div class="saveHint">Use the menu when you want folder binding or an after-save action. Plain capture stays immediate.</div>
<div class="saveActions">
  <button type="button" class="saveApply">Save</button>
  <button type="button" class="saveCancel">Cancel</button>
</div>
`;
    wrap.append(primary, menuBtn, saveMenu);
    const saveFolder = saveMenu.querySelector(".saveFolder");
    const saveMode = saveMenu.querySelector(".saveMode");
    const saveApply = saveMenu.querySelector(".saveApply");
    const saveCancel = saveMenu.querySelector(".saveCancel");
    rec.parts = { wrap, primary, menuBtn, saveMenu, saveFolder, saveMode, saveApply, saveCancel };
    primary.addEventListener("click", (ev) => {
      markControlUsed(rec, primary);
      try {
        const res = rec.def.onPrimaryClick?.({ id: rec.id, owner: rec.owner, event: ev, el: primary });
        if (res && typeof res.then === "function") res.catch((e) => warn(`capture click failed: ${rec.id}`, e));
      } catch (e) {
        warn(`capture click failed: ${rec.id}`, e);
      }
    });
    menuBtn.addEventListener("click", async (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      if (wrap.classList.contains("open")) {
        setCaptureMenuOpen(rec, false);
        return;
      }
      setCaptureMenuOpen(rec, true);
      rec.menuSeq = (rec.menuSeq || 0) + 1;
      const seq = rec.menuSeq;
      try {
        const model = await Promise.resolve(rec.def.onMenuOpen?.({ id: rec.id, owner: rec.owner }));
        if (seq !== rec.menuSeq || !wrap.classList.contains("open")) return;
        fillCaptureMenu(rec, isObj(model) ? model : {});
      } catch (e) {
        warn(`capture menu open failed: ${rec.id}`, e);
      }
    });
    saveCancel?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      setCaptureMenuOpen(rec, false);
    });
    saveApply?.addEventListener("click", async (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      markControlUsed(rec, primary);
      setAfterSaveMode(saveMode?.value || SAVE_MODE_SILENT);
      try {
        const res = rec.def.onApply?.({
          id: rec.id,
          owner: rec.owner,
          folderId: String(saveFolder?.value || ""),
          mode: String(saveMode?.value || SAVE_MODE_SILENT),
          event: ev,
        });
        if (res && typeof res.then === "function") await res;
      } catch (e) {
        warn(`capture apply failed: ${rec.id}`, e);
      }
      setCaptureMenuOpen(rec, false);
    });
    rec.node = wrap;
    patchCaptureMenuControl(rec, rec.def);
    return wrap;
  }

  function patchCaptureMenuControl(rec, nextDef) {
    const primary = rec?.parts?.primary;
    if (!primary) return false;
    primary.textContent = String(nextDef.text || "");
    primary.title = String(nextDef.title || nextDef.text || "");
    primary.setAttribute("aria-label", primary.title);
    primary.disabled = !!nextDef.disabled;
    if (rec.parts.menuBtn) rec.parts.menuBtn.disabled = !!nextDef.disabled;
    return true;
  }

  function createControlRecord(def) {
    const id = String(def?.id || "").trim();
    const owner = String(def?.owner || "").trim();
    if (!id || !owner) return null;
    const group = state.groups.get(String(def.groupId || "").trim()) || null;
    const zone = String(group?.zone || def.zone || "main").trim().toLowerCase() === "pinned" ? "pinned" : "main";
    const groupOrder = Number(group?.order) || 500;
    const rec = {
      id,
      owner,
      zone,
      groupId: String(def.groupId || "").trim(),
      groupOrder,
      groupLabel: String(group?.label || "").trim(),
      def: { ...def, id, owner },
      scopeWindow: WINDOW_ALL,
      used: false,
      seq: state.seq += 1,
      node: null,
      parts: null,
      menuSeq: 0,
    };
    if (rec.def.type === "button") buildButtonControl(rec);
    else if (rec.def.type === "select") buildSelectControl(rec);
    else if (rec.def.type === "captureMenu") buildCaptureMenuControl(rec);
    else return null;
    rec.scopeWindow = resolveControlWindow(rec);
    syncControlTheme(rec);
    syncControlUsedState(rec);
    return rec;
  }

  function ensureGroupHeaderNode(group, zone = "main") {
    if (!group || zone !== "main") return null;
    const key = `${zone}::${String(group.id || "")}`;
    let node = state.groupHeaders.get(key) || null;
    const label = String(group.label || "").trim();
    if (label === 'Sections' && state.scopeWindow === 'highlights') {
      if (node) {
        try { node.remove(); } catch {}
        state.groupHeaders.delete(key);
      }
      return null;
    }
    if (!label) {
      if (node) { try { node.remove(); } catch {} state.groupHeaders.delete(key); }
      return null;
    }
    if (!node || !node.isConnected) {
      node = D.createElement("span");
      node.className = "cmdGroupTab";
      node.setAttribute("aria-hidden", "true");
      state.groupHeaders.set(key, node);
    }
    node.textContent = label;
    if (group.owner) node.setAttribute("data-group-owner", String(group.owner));
    node.setAttribute("data-group-id", String(group.id || ""));
    return node;
  }

  function clearZoneGroupHeaders(zone = "main") {
    for (const [key, node] of Array.from(state.groupHeaders.entries())) {
      if (!String(key).startsWith(`${zone}::`)) continue;
      try { node?.remove?.(); } catch {}
      state.groupHeaders.delete(key);
    }
  }

  function sortControlsForZone(zone) {
    const items = Array.from(state.controls.values()).filter((rec) => rec.zone === zone);
    items.sort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      const ao = Number(a.def.order) || 0;
      const bo = Number(b.def.order) || 0;
      if (ao !== bo) return ao - bo;
      return (a.seq || 0) - (b.seq || 0);
    });
    return items;
  }

  function reflowZoneNow(zone) {
    const parent = zone === "pinned" ? state.toolsPinnedLeft : (state.toolsRail || state.toolsLeft);
    if (!parent) return;
    clearZoneGroupHeaders(zone);
    const items = sortControlsForZone(zone);
    let lastGroupId = "";
    for (const rec of items) {
      if (!rec.node || !rec.node.isConnected) continue;
      applyControlWindowVisibility(rec);
      if (zone === "main" && rec.groupId && rec.groupId !== lastGroupId) {
        const group = state.groups.get(String(rec.groupId || "").trim()) || null;
        const header = ensureGroupHeaderNode(group, zone);
        if (header) {
          if (state.stateEl) parent.insertBefore(header, state.stateEl);
          else parent.appendChild(header);
        }
        lastGroupId = rec.groupId;
      }
      if (zone === "main" && state.stateEl) parent.insertBefore(rec.node, state.stateEl);
      else parent.appendChild(rec.node);
    }
  }

  function scheduleLayoutCommit(zone = "main") {
    ensureMounted();
    state.reflowZones.add(zone === "pinned" ? "pinned" : "main");
    if (state.reflowRaf) return;
    state.reflowRaf = W.requestAnimationFrame(() => {
      state.reflowRaf = 0;
      const zones = Array.from(state.reflowZones);
      state.reflowZones.clear();
      for (const z of zones) reflowZoneNow(z);
      updateDockOverflowMask();
      schedulePrimeLayout();
    });
  }

  function removeControlInternal(idRaw) {
    const id = String(idRaw || "").trim();
    const rec = state.controls.get(id);
    if (!rec) return false;
    if (state.activeCaptureId === id) state.activeCaptureId = "";
    state.controls.delete(id);
    try { rec.node?.remove?.(); } catch {}
    scheduleLayoutCommit(rec.zone);
    return true;
  }

  function registerGroup(groupDef) {
    ensureMounted();
    const id = String(groupDef?.id || "").trim();
    const owner = String(groupDef?.owner || "").trim();
    if (!id || !owner) return false;
    const zone = String(groupDef.zone || "main").trim().toLowerCase() === "pinned" ? "pinned" : "main";
    state.groups.set(id, {
      id,
      owner,
      zone,
      order: Number(groupDef.order) || 500,
      label: String(groupDef.label || groupDef.title || "").trim(),
    });
    return true;
  }

  function registerControl(controlDef) {
    ensureMounted();
    const rec = createControlRecord(controlDef);
    if (!rec) return false;
    removeControlInternal(rec.id);
    state.controls.set(rec.id, rec);
    applyControlWindowVisibility(rec);
    const parent = rec.zone === "pinned" ? state.toolsPinnedLeft : (state.toolsRail || state.toolsLeft);
    if (rec.zone === "main" && state.stateEl) parent?.insertBefore(rec.node, state.stateEl);
    else parent?.appendChild(rec.node);
    scheduleLayoutCommit(rec.zone);
    return true;
  }

  function patchControl(idRaw, patch = {}) {
    ensureMounted();
    const id = String(idRaw || "").trim();
    const rec = state.controls.get(id);
    if (!rec) return false;
    const nextDef = { ...rec.def, ...(isObj(patch) ? patch : {}) };
    if (String(nextDef.type || rec.def.type) !== String(rec.def.type || "")) {
      return !!registerControl(nextDef);
    }
    if ((nextDef.groupId || rec.def.groupId) !== rec.groupId) {
      return !!registerControl(nextDef);
    }
    rec.def = nextDef;
    rec.scopeWindow = resolveControlWindow(rec);
    if (rec.def.type === "button") patchButtonControl(rec, nextDef);
    else if (rec.def.type === "select") patchSelectControl(rec, nextDef);
    else if (rec.def.type === "captureMenu") patchCaptureMenuControl(rec, nextDef);
    syncControlTheme(rec);
    syncControlUsedState(rec);
    applyControlWindowVisibility(rec);
    return true;
  }

  function removeOwner(ownerIdRaw) {
    const ownerId = String(ownerIdRaw || "").trim();
    if (!ownerId) return false;
    for (const [id, rec] of Array.from(state.controls.entries())) {
      if (rec.owner !== ownerId) continue;
      removeControlInternal(id);
    }
    for (const [id, rec] of Array.from(state.groups.entries())) {
      if (String(rec.owner || "") !== ownerId) continue;
      state.groups.delete(id);
      const headerKeyMain = `main::${id}`;
      const headerKeyPinned = `pinned::${id}`;
      try { state.groupHeaders.get(headerKeyMain)?.remove?.(); } catch {}
      try { state.groupHeaders.get(headerKeyPinned)?.remove?.(); } catch {}
      state.groupHeaders.delete(headerKeyMain);
      state.groupHeaders.delete(headerKeyPinned);
    }
    state.statuses.delete(ownerId);
    for (const [id, section] of Array.from(state.panelSections.entries())) {
      if (String(section.owner || "") !== ownerId) continue;
      state.panelSections.delete(id);
    }
    renderStatusRow();
    if (state.infoWrap?.classList.contains("open")) renderPanelSections();
    return true;
  }

  function setStatus(statusDef) {
    ensureMounted();
    const owner = String(statusDef?.owner || "").trim();
    if (!owner) return false;
    const priority = Number(statusDef.priority) || 0;
    const seq = state.statusSeq += 1;
    const regularMessages = normalizeStatusMessageList(statusDef?.messages, {
      owner,
      priority,
      statusSeq: seq,
    });
    const importantMessages = normalizeStatusMessageList(statusDef?.importantMessages, {
      owner,
      priority: priority + 200,
      tone: "warn",
      important: true,
      statusSeq: seq,
    });
    if (!regularMessages.length && String(statusDef?.text || "").trim()) {
      const fallback = normalizeStatusMessage({
        text: String(statusDef.text || ""),
        title: String(statusDef.title || statusDef.text || ""),
        priority,
      }, { owner, statusSeq: seq });
      if (fallback) regularMessages.push(fallback);
    }
    if (!importantMessages.length && String(statusDef?.importantText || "").trim()) {
      const fallback = normalizeStatusMessage({
        text: String(statusDef.importantText || ""),
        title: String(statusDef.importantTitle || statusDef.importantText || ""),
        priority: priority + 200,
        tone: "warn",
        important: true,
      }, { owner, tone: "warn", important: true, statusSeq: seq });
      if (fallback) importantMessages.push(fallback);
    }
    state.statuses.set(owner, {
      owner,
      priority,
      text: String(statusDef.text || ""),
      title: String(statusDef.title || ""),
      importantText: String(statusDef.importantText || ""),
      importantTitle: String(statusDef.importantTitle || ""),
      messages: regularMessages,
      importantMessages,
      seq,
    });
    renderStatusRow();
    return true;
  }

  function clearStatus(ownerIdRaw = "") {
    const owner = String(ownerIdRaw || "").trim();
    if (!owner) state.statuses.clear();
    else state.statuses.delete(owner);
    renderStatusRow();
    return true;
  }

  function setPanelSection(sectionDef) {
    ensureMounted();
    const id = String(sectionDef?.id || "").trim();
    const owner = String(sectionDef?.owner || "").trim();
    if (!id || !owner) return false;
    state.panelSections.set(id, {
      id,
      owner,
      order: Number(sectionDef.order) || 0,
      title: sectionDef.title,
      rows: Array.isArray(sectionDef.rows) ? sectionDef.rows.slice() : [],
      seq: state.panelSeq += 1,
    });
    if (state.infoWrap?.classList.contains("open")) renderPanelSections();
    return true;
  }

  function toFinitePx(valueRaw, fallback = 0) {
    const n = Number.parseFloat(String(valueRaw ?? ""));
    return Number.isFinite(n) ? n : Number(fallback) || 0;
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

  function applyDockGeometry() {
    ensureMounted();
    const dock = state.root;
    if (!dock || !dock.isConnected) return;
    if (dock.classList.contains("collapsed")) {
      if (dock.style.left !== "") dock.style.left = "";
      if (dock.style.right !== "0px" && dock.style.right !== "0") dock.style.right = "0px";
      if (dock.style.width !== "") dock.style.width = "";
      return;
    }
    const leftRaw = Math.max(0, Math.round(Number(getSidebarRightPx() || 0)));
    const prevLeft = Math.max(0, Math.round(Number(state.dockLastSidebarRightPx || 0)));
    const left = (prevLeft > 0 && Math.abs(leftRaw - prevLeft) <= 2) ? prevLeft : leftRaw;
    state.dockLastSidebarRightPx = left;
    const leftCss = `${left}px`;
    const rightCss = "0px";
    const widthCss = left > 0 ? `calc(100% - ${left}px)` : "";
    if (dock.style.left !== leftCss) dock.style.left = leftCss;
    if (dock.style.right !== rightCss && dock.style.right !== "0") dock.style.right = rightCss;
    if ((dock.style.width || "") !== widthCss) dock.style.width = widthCss;
    syncStatusPanelSizeToDock();
  }

  function scheduleDockGeometryBurst() {
    try { applyDockGeometry(); } catch {}
    const until = Date.now() + 760;
    state.dockGeomBurstUntilMs = Math.max(Number(state.dockGeomBurstUntilMs || 0), until);
    const tick = () => {
      try { applyDockGeometry(); } catch {}
      if (Date.now() < Number(state.dockGeomBurstUntilMs || 0)) {
        state.dockGeomBurstRaf = W.requestAnimationFrame(tick);
      } else {
        state.dockGeomBurstRaf = 0;
      }
    };
    if (!state.dockGeomBurstRaf) state.dockGeomBurstRaf = W.requestAnimationFrame(tick);
    if (state.dockGeomBurstTimer) {
      try { W.clearTimeout(state.dockGeomBurstTimer); } catch {}
    }
    const tailMs = Math.max(140, (Number(state.dockGeomBurstUntilMs || 0) - Date.now()) + 80);
    state.dockGeomBurstTimer = W.setTimeout(() => {
      state.dockGeomBurstUntilMs = 0;
      if (state.dockGeomBurstRaf) {
        try { W.cancelAnimationFrame(state.dockGeomBurstRaf); } catch {}
        state.dockGeomBurstRaf = 0;
      }
      try { applyDockGeometry(); } catch {}
    }, tailMs);
  }

  function refreshDockSidebarObserver() {
    if (typeof ResizeObserver !== "function") return null;
    if (!state.dockSidebarResizeObserver) {
      state.dockSidebarResizeObserver = new ResizeObserver(() => {
        scheduleDockGeometryBurst();
      });
    }
    const ro = state.dockSidebarResizeObserver;
    const nodes = [
      D.querySelector("#stage-slideover-sidebar"),
      D.querySelector("#stage-sidebar-tiny-bar"),
    ].filter((el) => !!el && el.isConnected);
    const prev = Array.isArray(state.dockSidebarObservedEls) ? state.dockSidebarObservedEls : [];
    const same = prev.length === nodes.length && prev.every((el, idx) => el === nodes[idx]);
    if (same) return ro;
    for (const node of prev) {
      try { node.removeEventListener("transitionstart", scheduleDockGeometryBurst); } catch {}
      try { node.removeEventListener("transitionrun", scheduleDockGeometryBurst); } catch {}
      try { node.removeEventListener("transitioncancel", scheduleDockGeometryBurst); } catch {}
      try { node.removeEventListener("transitionend", scheduleDockGeometryBurst); } catch {}
    }
    try { ro.disconnect(); } catch {}
    for (const node of nodes) {
      try { ro.observe(node); } catch {}
      try { node.addEventListener("transitionstart", scheduleDockGeometryBurst, { passive: true }); } catch {}
      try { node.addEventListener("transitionrun", scheduleDockGeometryBurst, { passive: true }); } catch {}
      try { node.addEventListener("transitioncancel", scheduleDockGeometryBurst, { passive: true }); } catch {}
      try { node.addEventListener("transitionend", scheduleDockGeometryBurst, { passive: true }); } catch {}
    }
    state.dockSidebarObservedEls = nodes;
    scheduleDockGeometryBurst();
    return ro;
  }

  function resolveComposerNoticeEl() {
    if (state.composerNoticeEl?.isConnected) return state.composerNoticeEl;
    if (Date.now() < Number(state.composerNoticeMissUntilMs || 0)) return null;
    const byClass = D.querySelector('div.select-none.active\\:select-auto.data-has-range-start\\:select-auto.flex.min-h-8.w-full.items-center.justify-center.p-2');
    if (byClass && byClass.isConnected) {
      state.composerNoticeEl = byClass;
      state.composerNoticeMissUntilMs = 0;
      return byClass;
    }
    const blocks = Array.from(D.querySelectorAll("div"));
    for (const el of blocks) {
      const txt = String(el?.textContent || "").trim();
      if (!txt || !/ChatGPT can make mistakes\./i.test(txt)) continue;
      state.composerNoticeEl = el;
      state.composerNoticeMissUntilMs = 0;
      return el;
    }
    state.composerNoticeEl = null;
    state.composerNoticeMissUntilMs = Date.now() + 1500;
    return null;
  }

  function hasConversationTurns() {
    try {
      return !!D.querySelector(SEL_TURN_PRIMARY);
    } catch {
      return false;
    }
  }

  function getDockTargetHeightPx() {
    const fallbackPx = Math.max(DOCK_TARGET_HEIGHT_MIN_PX, Math.ceil(Number(DOCK_TARGET_HEIGHT_FALLBACK_PX) || 0));
    const trimPx = Math.max(0, Math.ceil(Number(DOCK_TARGET_HEIGHT_NOTICE_TRIM_PX) || 0));
    const fallbackAdjustedPx = Math.max(DOCK_TARGET_HEIGHT_MIN_PX, fallbackPx - trimPx);
    const maxPx = 78;
    if (hasConversationTurns()) return Math.min(maxPx, fallbackAdjustedPx);
    const notice = resolveComposerNoticeEl();
    if (!notice) return Math.min(maxPx, fallbackAdjustedPx);
    try {
      const rect = notice.getBoundingClientRect();
      const h = Math.max(0, Math.ceil(Number(rect?.height || 0)));
      if (h > 0) return Math.max(DOCK_TARGET_HEIGHT_MIN_PX, Math.min(maxPx, h - trimPx));
    } catch {}
    return Math.min(maxPx, fallbackAdjustedPx);
  }

  function updateDockTargetHeightVar() {
    const root = D.documentElement || D.body;
    if (!root) return DOCK_TARGET_HEIGHT_FALLBACK_PX;
    const h = getDockTargetHeightPx();
    const next = `${h}px`;
    if (root.style.getPropertyValue("--h2o-archive-dock-target-h") !== next) {
      root.style.setProperty("--h2o-archive-dock-target-h", next);
    }
    return h;
  }

  function updateDockOverflowMask() {
    ensureMounted();
    if (!state.root) return false;
    if (state.root.classList.contains("collapsed")) {
      state.root.classList.remove("has-overflow");
      return false;
    }
    const tools = state.toolsLeft;
    if (!tools) {
      state.root.classList.remove("has-overflow");
      return false;
    }
    const hasOverflow = (Number(tools.scrollWidth || 0) - Number(tools.clientWidth || 0)) > 6;
    state.root.classList.toggle("has-overflow", hasOverflow);
    return hasOverflow;
  }

  function updateDockHeightVar() {
    ensureMounted();
    const dock = state.root;
    const root = D.documentElement || D.body;
    if (!root) return;
    updateDockTargetHeightVar();
    const setRootDockH = (pxRaw) => {
      const px = Math.max(0, Math.ceil(Number(pxRaw) || 0));
      const next = `${px}px`;
      if (root.style.getPropertyValue("--h2o-archive-dock-h") !== next) {
        root.style.setProperty("--h2o-archive-dock-h", next);
      }
      return px;
    };
    if (!dock || !dock.isConnected) {
      state.dockLastAppliedHeightPx = 0;
      setRootDockH(0);
      return;
    }
    if (dock.classList.contains("collapsed")) {
      state.dockLastAppliedHeightPx = 0;
      setRootDockH(0);
      updateDockOverflowMask();
      applyDockGeometry();
      return;
    }
    const rawH = Math.max(0, Math.ceil(Number(dock.getBoundingClientRect?.().height || dock.offsetHeight || 0)));
    const prevH = Math.max(0, Math.ceil(Number(state.dockLastAppliedHeightPx || 0)));
    const h = (prevH > 0 && Math.abs(rawH - prevH) <= 1) ? prevH : rawH;
    state.dockLastAppliedHeightPx = h;
    setRootDockH(0);
    refreshDockSidebarObserver();
    applyDockGeometry();
    updateDockOverflowMask();
  }

  function ensureDockHeightObserver() {
    if (state.dockResizeObserver) return state.dockResizeObserver;
    if (typeof ResizeObserver !== "function") return null;
    const dock = state.root;
    if (!dock) return null;
    const ro = new ResizeObserver(() => updateDockHeightVar());
    try {
      ro.observe(dock);
      state.dockResizeObserver = ro;
      return ro;
    } catch (e) {
      warn("dock resize observer failed", e);
      return null;
    }
  }

  function syncInfoPanelRouteState(force = false) {
    ensureMounted();
    const sig = `${String(W.location.href || "")}|${getCurrentChatId()}`;
    if (!force && sig === state.lastRouteSig) return;
    state.lastRouteSig = sig;
    setInfoPanelVisible(getInfoOpen(getCurrentChatId()));
  }

  function bindShellListeners() {
    if (state.listenersBound) return;
    state.listenersBound = true;
    state.foldBtn?.addEventListener("click", () => {
      setFoldState(!state.root?.classList.contains("collapsed"));
    });
    state.foldBtn?.addEventListener("pointerenter", () => state.root?.classList.toggle("edge-hot", true));
    state.foldBtn?.addEventListener("pointerleave", () => state.root?.classList.toggle("edge-hot", false));
    D.addEventListener("pointermove", (ev) => {
      const fold = state.foldBtn;
      if (!fold) return;
      const vw = Math.max(Number(W.innerWidth || 0), Number(D.documentElement?.clientWidth || 0));
      const clientX = Number(ev?.clientX || 0);
      const clientY = Number(ev?.clientY || 0);
      const nearEdge = clientX >= Math.max(0, vw - 24);
      let nearY = true;
      try {
        const rect = fold.getBoundingClientRect();
        const centerY = Number(rect.top || 0) + (Number(rect.height || 0) / 2);
        nearY = Math.abs(clientY - centerY) <= Math.max(96, Number(rect.height || 0) * 2.5);
      } catch {}
      state.root?.classList.toggle("edge-hot", nearEdge && nearY);
    }, { passive: true, capture: true });
    state.bgBtn?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      openBgPicker();
    });
    for (const opt of state.bgOpts) {
      opt?.addEventListener("click", (ev) => {
        try {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
        } catch {}
        const nextMode = setBgMode(opt?.dataset?.bg || DOCK_BG_BAR);
        applyBackgroundMode(nextMode);
        setBgButtonState(nextMode);
        closeBgPicker();
        if (state.infoWrap?.classList.contains("open")) renderPanelSections();
      });
    }
    state.scopeBtn?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      openScopePicker();
    });
    state.scopeBtn?.addEventListener("wheel", (ev) => {
      if (!ev || !Number.isFinite(Number(ev.deltaY || 0)) || Number(ev.deltaY || 0) === 0) return;
      const now = Date.now();
      if ((now - Number(state.scopeWheelAt || 0)) < 95) {
        try { ev.preventDefault(); } catch {}
        return;
      }
      state.scopeWheelAt = now;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch {}
      cycleWindowScope(Number(ev.deltaY || 0) > 0 ? 1 : -1);
    }, { passive: false });
    for (const opt of state.scopeOpts) {
      opt?.addEventListener("click", (ev) => {
        try {
          ev?.preventDefault?.();
          ev?.stopPropagation?.();
        } catch {}
        applyWindowScope(opt?.dataset?.window || WINDOW_ALL);
        closeScopePicker();
      });
    }
    state.infoBtn?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      const chatId = getCurrentChatId();
      const next = !getInfoOpen(chatId);
      setInfoOpen(chatId, next);
      setInfoPanelVisible(next);
    });
    state.infoWarnDot?.addEventListener("click", (ev) => {
      try {
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
      } catch {}
      const next = !getImportantOnly();
      setImportantOnly(next);
      setImportantDotState(next);
    });
    state.rightDivider?.addEventListener("pointerdown", onStatusResizeStart);
    state.rightDivider?.addEventListener("keydown", (ev) => {
      const key = String(ev?.key || "");
      if (!key) return;
      if (key === "ArrowLeft") {
        try { ev.preventDefault(); } catch {}
        nudgeStatusPanelSize(STATUS_PANEL_SIZE_STEP_PX);
        return;
      }
      if (key === "ArrowRight") {
        try { ev.preventDefault(); } catch {}
        nudgeStatusPanelSize(-STATUS_PANEL_SIZE_STEP_PX);
        return;
      }
      if (key === "Home") {
        try { ev.preventDefault(); } catch {}
        setStatusPanelSizeToBound("min");
        return;
      }
      if (key === "End") {
        try { ev.preventDefault(); } catch {}
        setStatusPanelSizeToBound("max");
      }
    });
    state.statusRow?.addEventListener("pointerenter", () => {
      state.statusHover = true;
      clearStatusRotateTimer();
    });
    state.statusRow?.addEventListener("pointerleave", () => {
      state.statusHover = false;
      scheduleStatusRotate();
    });
    state.statusRow?.addEventListener("wheel", (ev) => {
      const deltaY = Number(ev?.deltaY || 0);
      if (!Number.isFinite(deltaY) || deltaY === 0 || (state.statusItems?.length || 0) < 2) return;
      const now = Date.now();
      if ((now - Number(state.statusWheelAt || 0)) < 90) {
        try { ev.preventDefault(); } catch {}
        return;
      }
      state.statusWheelAt = now;
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch {}
      stepStatusView(deltaY > 0 ? 1 : -1, { pause: true });
    }, { passive: false });
    D.addEventListener("pointerdown", (ev) => {
      const target = ev?.target;
      const active = getActiveCaptureRecord();
      if (active?.parts?.wrap && target instanceof Node && (active.parts.wrap.contains(target) || active.parts.saveMenu?.contains(target))) {
        return;
      }
      if (active) setCaptureMenuOpen(active, false);
      if (target instanceof Node && (state.bgPicker?.contains(target) || !!state.bgMenu?.contains(target))) return;
      if (target instanceof Node && state.scopePicker?.contains(target)) return;
      closeBgPicker();
      closeScopePicker();
    }, true);
    D.addEventListener("pointermove", onStatusResizeMove, true);
    D.addEventListener("pointerup", onStatusResizeEnd, true);
    D.addEventListener("pointercancel", onStatusResizeEnd, true);
    D.addEventListener("keydown", (ev) => {
      if (String(ev?.key || "") !== "Escape") return;
      const active = getActiveCaptureRecord();
      if (active) setCaptureMenuOpen(active, false);
      closeBgPicker();
      closeScopePicker();
      onStatusResizeEnd();
    }, true);
    W.addEventListener("resize", () => {
      scheduleDockGeometryBurst();
      updateDockHeightVar();
      if (state.bgPicker?.classList.contains("open")) placeBgMenu();
    }, { passive: true });
  }

  function boot() {
    ensureMounted();
    if (!state.routeTimer) {
      state.routeTimer = W.setInterval(() => {
        try { syncInfoPanelRouteState(false); } catch (e) { warn("route sync failed", e); }
      }, ROUTE_POLL_MS);
    }
  }

  API.__h2oCommandBarPass1 = true;
  API.ensureMounted = ensureMounted;
  API.registerGroup = registerGroup;
  API.registerControl = registerControl;
  API.patchControl = patchControl;
  API.removeOwner = removeOwner;
  API.setStatus = setStatus;
  API.clearStatus = clearStatus;
  API.setPanelSection = setPanelSection;
  API.getWindowScope = () => normalizeWindowScope(state.scopeWindow || getWindowScope());
  API.setWindowScope = (scopeRaw) => applyWindowScope(scopeRaw);

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
