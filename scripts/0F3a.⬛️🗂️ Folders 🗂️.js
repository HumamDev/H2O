// ==UserScript==
// @h2o-id             0f3a.folders
// @name               0F3a.⬛️🗂️ Folders 🗂️
// @namespace          H2O.Premium.CGX.folders
// @author             HumamDev
// @version            2.5.1
// @revision           008
// @build              260424-000001
// @description        Folders: sidebar injection, folder page/view logic, H2O.folders public API, categories-compat rendering-infra seam for 0F4a.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  // ✅ IDENTITY (chosen deterministically for this file; do NOT change unless you migrate UI/storage contracts)
  // Title basis: "Folders Section" → TOK=FS, CID=FSECTION, SkID=flsc
  const TOK  = 'FS';             // "Folders Section"
  const PID  = 'fldrs';          // canonical anchor (consonant-only)
  const BrID = PID;              // Brain vault key
  const DsID = PID;              // Disk namespace id
  const SkID = 'flsc';           // Skin/UI identity (cgxui-* and data-cgxui-owner ALWAYS = SkID)
  const CID  = 'fsection';       // identifiers only

  // labels only (NOT identity)
  const MODTAG = 'Folders';
  const MODICON = '🗂️';
  const EMOJI_HDR = 'OFF';
  const SUITE = 'prm';
  const HOST  = 'cgx';

  // Derived (identifiers only)
  const PID_UP = PID.toUpperCase();
  const CID_UP = CID.toUpperCase();

  // Runtime vault
  const H2O = (W.H2O = W.H2O || {});
  const MOD = ((H2O[TOK] = H2O[TOK] || {})[BrID] = (H2O[TOK][BrID] || {}));

  MOD.meta = MOD.meta || {
    tok: TOK, pid: PID, brid: BrID, dsid: DsID, skid: SkID, cid: CID_UP,
    modtag: MODTAG, suite: SUITE, host: HOST
  };

  // ✅ DIAG (bounded)
  MOD.diag = MOD.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 30 };
  const DIAG = MOD.diag;
  const DIAG_step = (s, o) => {
    try {
      const a = DIAG.steps; a.push({ t: Math.round(performance.now() - DIAG.t0), s, o: o ? String(o) : '' });
      if (a.length > DIAG.bufMax) a.splice(0, a.length - DIAG.bufMax);
    } catch {}
  };
  const DIAG_err = (s, e) => {
    try {
      const a = DIAG.errors; a.push({ t: Math.round(performance.now() - DIAG.t0), s, e: String(e?.stack || e) });
      if (a.length > DIAG.errMax) a.splice(0, a.length - DIAG.errMax);
    } catch {}
  };

  // Ecosystem registries (MODE B: warn + keep first; do NOT freeze here)
  H2O.KEYS = H2O.KEYS || {};
  H2O.EV   = H2O.EV   || {};
  H2O.SEL  = H2O.SEL  || {};
  H2O.UI   = H2O.UI   || {};

  /* ───────────────────────────── ⬛️ DEFINE — CONFIG / CONSTANTS 📄🔒💧 ───────────────────────────── */

  /* [DEFINE][DOM] ATTR_ */
  const ATTR_CGXUI       = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_MODE  = 'data-cgxui-mode';
  const ATTR_CGXUI_PAGE_HIDDEN = 'data-cgxui-page-hidden-by';

  /* [DEFINE][STORE] Namespaces */
  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`; // no trailing ":"

  /* [STORE][Folders] Canonical keys (v2 contract-aligned) */
  const KEY_FSECTION_STATE_DATA_V1 = `${NS_DISK}:state:data:v1`; // { folders:[{id,name,createdAt}], items:{[folderId]:[hrefs]} }
  const KEY_FSECTION_STATE_UI_V1   = `${NS_DISK}:state:ui:v1`;   // { openFolders:{[folderId]:bool}, foldersExpanded:bool, openCategories:{[categoryId]:bool}, categoriesExpanded:bool }
  const KEY_FSECTION_STATE_SEE_V1  = `${NS_DISK}:state:see_more:v1`; // { expandedList: bool }
  const KEY_FSECTION_STATE_EXP_V1  = `${NS_DISK}:state:folders_expanded:v1`; // { expanded: bool }
  /* Legacy keys (read/bridge so nothing is lost) */
  const KEY_LEG_DATA = 'h2o:folders:data:v1';
  const KEY_LEG_UI   = 'h2o:folders:ui:v1';
  const KEY_LEG_SEE  = 'h2o:folders:seeMoreExpanded:v1'; // "1"/"0"
  const KEY_LEG_EXP  = 'h2o:folders:expanded';           // "1"/"0"

  /* UI tokens (SkID-based values) */
  const UI_FSECTION_ROOT        = `${SkID}-root`;
  const UI_FSECTION_CATEGORIES_ROOT = `${SkID}-categories-root`;
  const UI_FSECTION_MENU        = `${SkID}-menu`;
  const UI_FSECTION_POP         = `${SkID}-pop`;
  const UI_FSECTION_MODAL       = `${SkID}-modal`;
  const UI_FSECTION_VIEWER      = `${SkID}-viewer`;
  const UI_FSECTION_PAGE_HOST   = `${SkID}-page-host`;
  const UI_FSECTION_PAGE        = `${SkID}-page`;
  const UI_FSECTION_ICON_SLOT   = `${SkID}-ico-slot`;
  const UI_FSECTION_SEP         = `${SkID}-sep`;
  const UI_FSECTION_FOLDER_ROW  = `${SkID}-folder-row`;
  const UI_FSECTION_CATEGORY_ROW = `${SkID}-category-row`;
  const UI_FSECTION_FOLDER_MORE = `${SkID}-folder-more`;
  const UI_FSECTION_CATEGORY_MORE = `${SkID}-category-more`;
  const UI_FSECTION_CATEGORY_TOGGLE = 'category-toggle';

  /* CSS style id */
  const CSS_FSECTION_STYLE_ID = `cgxui-${SkID}-style`;
  const CFG_FSECTION_FLOATING_Z = 2147483647;

  /* Config */
  const CFG_FSECTION_LABEL = 'Folders';
  const CFG_CATEGORIES_LABEL = 'Categories';
  const CFG_SEED_FOLDERS = [
    { name: 'Study' },
    { name: 'Case' },
    { name: 'Dev' },
  ];
  const CFG_RESERVED_FOLDER_VIEW_NAMES = new Set(['pinned', 'archive']);

  const CFG_SEE_MORE_LIMIT = 5;
  const CFG_CATEGORY_PREVIEW_LIMIT = 5;
  const CFG_FOLDER_CHAT_PREVIEW_LIMIT = 5;
  const CFG_CATEGORY_CHAT_PREVIEW_LIMIT = 5;
  const CFG_CATEGORY_OPEN_MODE_PAGE = 'page';
  const CFG_CATEGORY_OPEN_MODE_PANEL = 'panel';
  const CFG_MORE_OPEN_MODE_PAGE = 'page';
  const CFG_MORE_OPEN_MODE_DROPDOWN = 'dropdown';
  const CFG_H2O_PAGE_ROUTE_OWNER = `${SkID}:page-route:v1`;
  const CFG_H2O_PAGE_ROUTE_PREFIX = 'h2o';
  const CFG_H2O_PAGE_QUERY_FLAG = `h2o_${SkID}`;
  const CFG_H2O_PAGE_QUERY_VIEW = `h2o_${SkID}_view`;
  const CFG_H2O_PAGE_QUERY_ID = `h2o_${SkID}_id`;
  const CFG_CATEGORY_DEFAULT_ICON = 'hash';
  const CFG_CATEGORY_DEFAULT_COLOR = '#3B82F6';
  const CFG_ASSIGN_ONE_FOLDER_MAX = true; // keep your intended behavior: one-folder max
  const EV_FOLDERS_CHANGED = 'evt:h2o:folders:changed';
  const CFG_PROJECT_COLOR_OPTIONS = Object.freeze([
    { key: 'blue', label: 'Blue', color: '#3B82F6' },
    { key: 'red', label: 'Red', color: '#FF4C4C' },
    { key: 'green', label: 'Green', color: '#22C55E' },
    { key: 'gold', label: 'Gold', color: '#FFD54F' },
    { key: 'sky', label: 'Sky', color: '#7DD3FC' },
    { key: 'pink', label: 'Pink', color: '#F472B6' },
    { key: 'purple', label: 'Purple', color: '#A855F7' },
    { key: 'orange', label: 'Orange', color: '#FF914D' },
  ]);

  /* Icons (trusted strings, controlled) */
  const FRAG_SVG_FOLDER = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z"
            fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;
  const FRAG_SVG_ADD = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon"><use href="/cdn/assets/sprites-core-97566a9e.svg#608c49" fill="currentColor"></use></svg>
  `;
  const FRAG_SVG_MORE = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" class="icon"><use href="/cdn/assets/sprites-core-97566a9e.svg#f6d0e2" fill="currentColor"></use></svg>
  `;
  const FRAG_SVG_SECTION_ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="invisible h-3 w-3 shrink-0 group-hover/sidebar-expando-section:visible"><use href="/cdn/assets/sprites-core-97566a9e.svg#ba3792" fill="currentColor"></use></svg>';
  const FRAG_SVG_CATEGORY = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5h14M5 12h14M5 16.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 5.5 6.8 18.5M17.2 5.5 16 18.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;
  const CFG_CATEGORY_ICON_OPTIONS = Object.freeze([
    { key: 'hash', label: 'Hash', svg: FRAG_SVG_CATEGORY },
    { key: 'folder', label: 'Folder', svg: FRAG_SVG_FOLDER },
    { key: 'briefcase', label: 'Briefcase', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7m-9.5 4.5h13M5 7h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'code', label: 'Code', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5m6-10 5 5-5 5M13 5l-2 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'book', label: 'Book', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Zm0 0v16M8 7h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'pen', label: 'Pen', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm11-13 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'scale', label: 'Scale', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M6 20h12M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'heart', label: 'Heart', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.1C1.7 7.8 3.6 5 6.7 5c1.7 0 3.2.9 4.1 2.2C11.7 5.9 13.2 5 14.9 5c3.1 0 5 2.8 3.7 5.9C19 15.6 12 20 12 20Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' },
    { key: 'cart', label: 'Shopping', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2l1.6 9.5a2 2 0 0 0 2 1.7h5.7a2 2 0 0 0 1.9-1.4L20 8H8M10 20h.01M17 20h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'globe', label: 'Globe', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5S14.2 18.2 12 20.5C9.8 18.2 8.8 15.4 8.8 12S9.8 5.8 12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' },
    { key: 'wrench', label: 'Tools', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 5.2a4.5 4.5 0 0 0 4.9 5L11 18.9a3 3 0 1 1-4.2-4.2l8.7-8.7ZM7.7 17.7h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    { key: 'palette', label: 'Creative', svg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 0 0 16h1.1a1.9 1.9 0 0 0 1.3-3.2 1.3 1.3 0 0 1 .9-2.2H17a3 3 0 0 0 3-3A7.6 7.6 0 0 0 12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.7 11h.01M9.4 7.8h.01M13 7.4h.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>' },
  ]);

  /* ───────────────────────────── 🟩 TOOLS — UTILITIES 📄🔓💧 ───────────────────────────── */

  const UTIL_uid = () => `f_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  const UTIL_normText = (s) => (s || '').trim().replace(/\s+/g, ' ');
  const UTIL_escHtml = (s) => (s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));

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

  const UTIL_selScoped = (uiTok) => `[${ATTR_CGXUI}="${uiTok}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;

  /* ───────────────────────────── 🔴 STATE — REGISTRIES / CACHES 📄🔓💧 ───────────────────────────── */

  const STATE = MOD.state = MOD.state || {};
  STATE.booted = !!STATE.booted;

  // cleanup buckets
  const CLEAN = STATE.clean = STATE.clean || { timers: new Set(), observers: new Set(), listeners: new Set(), nodes: new Set() };

  // menu capture
  STATE.lastChatHrefForMenu = STATE.lastChatHrefForMenu || '';
  STATE.savedLibraryRows = Array.isArray(STATE.savedLibraryRows) ? STATE.savedLibraryRows : [];

  // active UI elements (owned)
  STATE.menuEl = null;  // assign menu
  STATE.popEl  = null;  // folder row pop
  STATE.viewerEl = null;
  STATE.pageEl = null;
  STATE.pageHost = null;
  STATE.pageHiddenRecords = [];
  STATE.pageSession = null;
  STATE.pageSeq = Number(STATE.pageSeq || 0) || 0;
  STATE.pageRoute = null;
  STATE.pageRouteToken = Number(STATE.pageRouteToken || 0) || 0;

  // injection observer
  STATE.sidebarMO = null;
  STATE.menuMO = null;
  STATE.retryTimer = 0;
  STATE.ensureTimer = 0;
  STATE.building = false;
  STATE.suppressMO = false;
  STATE.observedRoot = null;
  STATE.sidebarRenderCount = Number(STATE.sidebarRenderCount || 0) || 0;
  STATE.sidebarEnsureCount = Number(STATE.sidebarEnsureCount || 0) || 0;
  STATE.sidebarActiveSyncCount = Number(STATE.sidebarActiveSyncCount || 0) || 0;
  STATE.sidebarSkippedH2OMutations = Number(STATE.sidebarSkippedH2OMutations || 0) || 0;
  STATE.sidebarPlacementRepairCount = Number(STATE.sidebarPlacementRepairCount || 0) || 0;
  STATE.sidebarActiveSyncTimer = Number(STATE.sidebarActiveSyncTimer || 0) || 0;
  STATE.lastSidebarRenderReason = String(STATE.lastSidebarRenderReason || '');
  STATE.lastSidebarEnsureReason = String(STATE.lastSidebarEnsureReason || '');
  STATE.lastSidebarActiveSyncReason = String(STATE.lastSidebarActiveSyncReason || '');
  STATE.sidebarLastRenderReason = String(STATE.sidebarLastRenderReason || STATE.lastSidebarRenderReason || '');
  STATE.sidebarLastEnsureReason = String(STATE.sidebarLastEnsureReason || STATE.lastSidebarEnsureReason || '');
  STATE.sidebarLastActiveSyncReason = String(STATE.sidebarLastActiveSyncReason || STATE.lastSidebarActiveSyncReason || '');
  STATE.sidebarLastRenderAt = Number(STATE.sidebarLastRenderAt || 0) || 0;
  STATE.sidebarLastEnsureAt = Number(STATE.sidebarLastEnsureAt || 0) || 0;
  STATE.sidebarLastActiveSyncAt = Number(STATE.sidebarLastActiveSyncAt || 0) || 0;
  STATE.firstFoldersShellAt = Number(STATE.firstFoldersShellAt || 0) || 0;
  STATE.firstCategoriesShellAt = Number(STATE.firstCategoriesShellAt || 0) || 0;
  STATE.sidebarHydrationCount = Number(STATE.sidebarHydrationCount || 0) || 0;
  STATE.sidebarHydrationLastReason = String(STATE.sidebarHydrationLastReason || '');
  STATE.sidebarShellMode = String(STATE.sidebarShellMode || '');

  /* ───────────────────────────── 🟫 VERIFY/SAFETY — HARDENING 📝🔓💧 ───────────────────────────── */

  const SAFE_try = (label, fn) => {
    try { return fn(); }
    catch (e) { DIAG_err(label, e); return null; }
  };

  const SAFE_isEl = (x) => (x && typeof x === 'object' && x.nodeType === 1);
  const SAFE_remove = (node) => { try { node?.remove?.(); } catch {} };

  function LIBCORE_getRouteService() {
    return H2O.LibraryCore?.getService?.('route') || null;
  }

  function LIBCORE_getUiShellService() {
    return H2O.LibraryCore?.getService?.('ui-shell') || null;
  }

  function LIBCORE_getPageHostService() {
    return H2O.LibraryCore?.getService?.('page-host') || null;
  }

  function LIBCORE_getNativeSidebarService() {
    return H2O.LibraryCore?.getService?.('native-sidebar') || null;
  }

  function LIBCORE_getProjectsOwner() {
    return H2O.LibraryCore?.getOwner?.('projects') || null;
  }

  function LIBCORE_getCategoriesOwner() {
    return H2O.LibraryCore?.getOwner?.('categories') || null;
  }

  function LIBCORE_ENV() {
    return {
      W,
      D,
      H2O,
      STATE,
      CLEAN,
      SAFE_remove,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      ATTR_CGXUI_STATE,
      ATTR_CGXUI_MODE,
      ATTR_CGXUI_PAGE_HIDDEN,
      UI_FSECTION_VIEWER,
      UI_FSECTION_PAGE_HOST,
      UI_FSECTION_PAGE,
      CFG_H2O_PAGE_ROUTE_OWNER,
      CFG_H2O_PAGE_ROUTE_PREFIX,
      CFG_H2O_PAGE_QUERY_FLAG,
      CFG_H2O_PAGE_QUERY_VIEW,
      CFG_H2O_PAGE_QUERY_ID,
      SkID,
      STORE_normalizeCategoryOpenMode,
      STORE_normalizeHexColor,
      FRAG_SVG_CATEGORY,
      FRAG_SVG_FOLDER,
      DOM_resolveRightPanePageHost,
    };
  }
  const UTIL_isReservedFolderViewName = (name) => CFG_RESERVED_FOLDER_VIEW_NAMES.has(UTIL_normText(name || '').toLowerCase());

  /* ───────────────────────────── 🟧 BOUNDARIES — DOM / IO ADAPTERS 📝🔓💥 ───────────────────────────── */

  /* [SEL][Folders] Selector registry */
  const SEL = {
    projectsLabelH2: 'h2.__menu-label',
    projectsSectionA: 'div.group\\/sidebar-expando-section',
    projectsSectionB: 'div[class*="sidebar-expando-section"]',
    nav: 'nav',
    aside: 'aside',
    sidebarItemAnchor: 'a.__menu-item[href]',
    sidebarItemDiv: 'div.__menu-item',
    sidebarTruncate: '.truncate,[class*="truncate"]',
    radixMenu: '[role="menu"]',
    radixMenuItem: '[role="menuitem"]',
    menuCaptureBtn:
      'button.__menu-item-trailing-btn,' +
      'button[data-testid*="history-item"][data-testid$="options"],' +
      'button[data-testid$="options"],' +
      'button[aria-label*="conversation options"],' +
      'button[aria-label*="Open conversation options"]',
    currentChatAnchor: 'a[aria-current="page"][href*="/c/"]',
  };

  function LIBCORE_nativeSidebarEnv() {
    return {
      D,
      normalizeText: UTIL_normText,
      projectsLabelSelector: SEL.projectsLabelH2,
      projectsSectionSelectors: [SEL.projectsSectionA, SEL.projectsSectionB],
      sidebarItemSelector: '.__menu-item',
      moreLabel: 'More',
    };
  }

  function DOM_findProjectsH2() {
    return LIBCORE_getNativeSidebarService()?.findProjectsH2?.(LIBCORE_nativeSidebarEnv()) || null;
  }

  function DOM_findProjectsSection(h2) {
    return LIBCORE_getNativeSidebarService()?.findProjectsSection?.(LIBCORE_nativeSidebarEnv(), h2) || null;
  }

  function DOM_getProjectsMoreRow(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    return LIBCORE_getNativeSidebarService()?.getProjectsMoreRow?.(LIBCORE_nativeSidebarEnv(), projectsSection) || null;
  }

  function LIBCORE_callProjects(localName, argsLike = []) {
    const owner = LIBCORE_getProjectsOwner();
    const fn = owner && owner[localName];
    if (typeof fn !== 'function') return null;
    return fn(...Array.from(argsLike));
  }

  function LIBCORE_applyProjectsNativeControls(projectsSection = DOM_findProjectsSection(DOM_findProjectsH2())) {
    return LIBCORE_callProjects('applyNativeControls', arguments);
  }

  function LIBCORE_projectsMutationTouchesNativeRows(muts) {
    return !!LIBCORE_callProjects('mutationTouchesNativeRows', arguments);
  }

  function LIBCORE_mutationHasOnlyH2OOwnedNodes(muts) {
    try {
      return !!LIBCORE_getNativeSidebarService()?.mutationHasOnlyH2OOwnedNodes?.(muts);
    } catch {
      return false;
    }
  }

  function LIBCORE_openProjectsViewer(projectsRaw = null, opts = {}) {
    return LIBCORE_callProjects('openViewer', arguments);
  }

  function LIBCORE_invalidateProjectsStore(reason = 'mutation') {
    return LIBCORE_callProjects('invalidateStore', arguments);
  }

  function LIBCORE_setProjectsRefreshButtonState(btn, state = 'idle') {
    return LIBCORE_callProjects('setRefreshButtonState', arguments);
  }

  function LIBCORE_handleProjectsManualRefresh(btn) {
    return LIBCORE_callProjects('handleManualRefresh', arguments);
  }

  function DOM_pickSidebarRoot(fromEl) {
    return fromEl?.closest?.(SEL.nav) || fromEl?.closest?.(SEL.aside) || fromEl?.parentElement || D.body;
  }

  function DOM_findOwnedRoot(uiTok) {
    try {
      const node = D.querySelector(UTIL_selScoped(uiTok));
      return node instanceof HTMLElement ? node : null;
    } catch {
      return null;
    }
  }

  function UI_recordShellSeen(kind, root, reason = 'shell') {
    if (!(root instanceof HTMLElement)) return;
    if (kind === 'folders' && !STATE.firstFoldersShellAt) STATE.firstFoldersShellAt = Date.now();
    if (kind === 'categories' && !STATE.firstCategoriesShellAt) STATE.firstCategoriesShellAt = Date.now();
    STATE.sidebarShellMode = root.getAttribute('data-h2o-sidebar-shell') === 'prepaint' ? 'prepaint' : (STATE.sidebarShellMode || 'hydrated');
    root.setAttribute('data-h2o-sidebar-shell-last-seen-by', SkID);
    root.setAttribute('data-h2o-sidebar-shell-last-reason', String(reason || 'shell').slice(0, 80));
  }

  function UI_recordHydrated(kind, root, reason = 'hydrate') {
    if (!(root instanceof HTMLElement)) return;
    UI_recordShellSeen(kind, root, reason);
    root.setAttribute('data-h2o-sidebar-shell', 'hydrated');
    root.setAttribute('data-cgxui-mode', 'hydrated');
    STATE.sidebarHydrationCount = Number(STATE.sidebarHydrationCount || 0) + 1;
    STATE.sidebarHydrationLastReason = String(reason || 'hydrate');
    STATE.sidebarShellMode = 'hydrated';
  }

  function UI_noteCategoryHydration(root, reason = 'hydrate') {
    if (!(root instanceof HTMLElement)) return;
    UI_recordShellSeen('categories', root, reason);
    if (root._cgxuiRender || root.getAttribute('data-h2o-sidebar-shell') === 'hydrated') {
      UI_recordHydrated('categories', root, reason);
    }
  }

  let CATEGORY_loadGroups;
  let STORE_normalizeCategoryIcon;
  let STORE_getCategoryAppearance;
  let STORE_setCategoryAppearance;
  let UI_iconOptionForKey;
  let UI_categoryIconSvg;
  let UI_openCategoryAppearanceEditor;
  let UI_appendPanelCategoryRow;
  let UI_appendInShellCategoryRow;
  let UI_openCategoryViewer;
  let UI_openCategoryPanel;
  let UI_openCategoryByMode;
  let UI_openCategoriesViewer;
  let UI_buildCategoriesSection;
  let UI_openCategoriesPanel;
  let UI_openCategoriesByMode;

  // categories-compat SEAM — 0F3a provides rendering infrastructure to 0F4a via the LibraryCore
  // 'categories-compat' service. This seam is intentionally narrow: only sidebar row builders,
  // viewer shells, pop-up menus, page host calls, route commits, UI state helpers, and icon/token
  // constants belong here. Category data logic, catalog access, category prefs storage, and chat
  // grouping logic all live in 0F4a. Do NOT add business logic to this seam.
  //
  // FALLBACKS below are intentionally empty: Phase C8 moved all category-owned logic to 0F4a.
  // LIBCORE_delegateCategories() safely no-ops if neither owner nor fallback provides a method.
  const CATEGORIES_LOCAL_FALLBACKS = Object.freeze({
    // Intentionally empty — all category-owned fallbacks were extracted to 0F4a in Phase C8.
    // Do NOT repopulate with category business logic; that would re-introduce ownership drift.
  });

  // All entries in CATEGORIES_LOCAL_API are rendering/infra helpers owned by 0F3a.
  // 0F4a consumes them to render category UI without depending on 0F3a internals directly.
  // Stability rule: only add entries here if they are sidebar/viewer infra already owned by 0F3a.
  // Must NOT contain: category data, catalog, appearance prefs, chat grouping, or route ownership.
  const CATEGORIES_LOCAL_API = {
    openFolderPop: UI_openFolderPop,
    getActivePageContext: CATEGORY_getActivePageContext,
    ensureStyle: UI_ensureStyle,
    openNameModal: UI_openNameModal,
    makeRowShell: UI_makeRowShell,
    setRowText: UI_setRowText,
    injectIcon: UI_injectIcon,
    wireAsButton: UI_wireAsButton,
    makeIconToggle: UI_makeIconToggle,
    removeSurfaceChatLeadingIcon: UI_removeSurfaceChatLeadingIcon,
    cleanSurfaceChatTitle: UI_cleanSurfaceChatTitle,
    syncSectionHeaderArrow: UI_syncSectionHeaderArrow,
    parseChatIdFromHref: DOM_parseChatIdFromHref,
    readUi: STORE_readUI,
    writeUi: STORE_writeUI,
    openCategoriesMoreByMode: UI_openCategoriesMoreByMode,
    appendViewerChatRow: UI_appendViewerChatRow,
    getCategoryOpenMode: API_getCategoryOpenMode,
    makeViewerShell: UI_makeViewerShell,
    makeInShellPageShell: UI_makeInShellPageShell,
    mountInShellPage: UI_mountInShellPage,
    commitPageRoute: ROUTE_commitPageRoute,
    closeViewer: UI_closeViewer,
    categoryPreviewLimit: CFG_CATEGORY_PREVIEW_LIMIT,
    categoryChatPreviewLimit: CFG_CATEGORY_CHAT_PREVIEW_LIMIT,
    addIconSvg: FRAG_SVG_ADD,
    moreIconSvg: FRAG_SVG_MORE,
    categoryRowToken: UI_FSECTION_CATEGORY_ROW,
    categoryMoreToken: UI_FSECTION_CATEGORY_MORE,
  };

  function LIBCORE_registerCategoriesCompat() {
    try {
      H2O.LibraryCore?.registerService?.('categories-compat', CATEGORIES_LOCAL_API, { replace: true });
    } catch (error) {
      DIAG_err('registerCategoriesCompat', error);
    }
  }

  function LIBCORE_delegateCategories(localName, argsLike) {
    const owner = LIBCORE_getCategoriesOwner();
    const fn = owner && owner !== CATEGORIES_LOCAL_FALLBACKS ? owner[localName] : null;
    if (typeof fn === 'function') return fn(...Array.from(argsLike));
    const local = CATEGORIES_LOCAL_FALLBACKS[localName];
    if (typeof local === 'function') return local(...Array.from(argsLike));
    return null;
  }

  CATEGORY_loadGroups = function() {
    return LIBCORE_delegateCategories('loadGroups', arguments);
  };
  STORE_normalizeCategoryIcon = function(raw) {
    return LIBCORE_delegateCategories('normalizeCategoryIcon', arguments);
  };
  STORE_getCategoryAppearance = function(group, ui = STORE_readUI()) {
    return LIBCORE_delegateCategories('getAppearance', arguments);
  };
  STORE_setCategoryAppearance = function(categoryId, patch = {}) {
    return LIBCORE_delegateCategories('setAppearance', arguments);
  };
  UI_iconOptionForKey = function(key) {
    return LIBCORE_delegateCategories('iconOptionForKey', arguments);
  };
  UI_categoryIconSvg = function(key) {
    return LIBCORE_delegateCategories('iconSvg', arguments);
  };
  UI_openCategoryAppearanceEditor = function(anchorEl, group, afterChange = null) {
    return LIBCORE_delegateCategories('openAppearanceEditor', arguments);
  };
  UI_appendPanelCategoryRow = function(list, group) {
    return LIBCORE_delegateCategories('appendPanelRow', arguments);
  };
  UI_appendInShellCategoryRow = function(list, group) {
    return LIBCORE_delegateCategories('appendInShellRow', arguments);
  };
  UI_openCategoryViewer = function(groupRaw, opts = {}) {
    return LIBCORE_delegateCategories('openViewer', arguments);
  };
  UI_openCategoryPanel = function(groupRaw) {
    return LIBCORE_delegateCategories('openPanel', arguments);
  };
  UI_openCategoryByMode = function(groupRaw) {
    return LIBCORE_delegateCategories('openByMode', arguments);
  };
  UI_openCategoriesViewer = function(groupsRaw, opts = {}) {
    return LIBCORE_delegateCategories('openCategoriesViewer', arguments);
  };
  UI_buildCategoriesSection = function(projectsSection, existingSection = null, reason = 'build') {
    return LIBCORE_delegateCategories('buildSection', arguments);
  };
  UI_openCategoriesPanel = function(groupsRaw) {
    return LIBCORE_delegateCategories('openCategoriesPanel', arguments);
  };
  UI_openCategoriesByMode = function(groupsRaw) {
    return LIBCORE_delegateCategories('openCategoriesByMode', arguments);
  };

  function DOM_findMenuItemByText(menuEl, re) {
    const items = [...menuEl.querySelectorAll(SEL.radixMenuItem)];
    return items.find((it) => re.test(UTIL_normText(it.textContent || ''))) || null;
  }

  function DOM_setMenuItemLabel(menuItemEl, newText) {
    const tw = D.createTreeWalker(menuItemEl, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = UTIL_normText(n.nodeValue || '');
      if (!t) continue;
      if (/move to project/i.test(t) || /add to folder/i.test(t)) {
        n.nodeValue = newText;
        return;
      }
    }
    const el = menuItemEl.querySelector(SEL.sidebarTruncate);
    if (el) el.textContent = newText;
  }

  function DOM_getChatTitleFromSidebar(href) {
    try {
      const a = D.querySelector(`a[href="${CSS.escape(href)}"]`);
      return UTIL_normText(a?.innerText || href).slice(0, 80);
    } catch {
      return UTIL_normText(href).slice(0, 80);
    }
  }

  function DOM_parseChatIdFromHref(href) {
    const m = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  function DOM_findChatTitleInSidebarByHref(fullHref) {
    const anchors = D.querySelectorAll(SEL.sidebarItemAnchor);
    for (const a of anchors) {
      if ((a.getAttribute('href') || '') === fullHref) {
        const t = UTIL_normText(a.innerText);
        if (t) return t;
      }
    }
    const chatId = DOM_parseChatIdFromHref(fullHref);
    if (chatId) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.endsWith(`/c/${chatId}`)) {
          const t = UTIL_normText(a.innerText);
          if (t) return t;
        }
      }
    }
    return null;
  }

  function DOM_findChatHrefInSidebarByChatId(chatId) {
    const id = String(chatId || '').trim();
    if (!id) return '';
    for (const a of D.querySelectorAll(SEL.sidebarItemAnchor)) {
      const href = a.getAttribute('href') || '';
      if (DOM_parseChatIdFromHref(href) === id) return href;
    }
    return '';
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS RULES 📄🔓💧 ───────────────────────────── */

  function CSS_FSECTION_TEXT() {
    const ROOT = UTIL_selScoped(UI_FSECTION_ROOT);
    const CATROOT = UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT);
    const MENU = UTIL_selScoped(UI_FSECTION_MENU);
    const POP  = UTIL_selScoped(UI_FSECTION_POP);
    const MODAL = UTIL_selScoped(UI_FSECTION_MODAL);
    const VIEWER = UTIL_selScoped(UI_FSECTION_VIEWER);
    const PAGE_HOST = UTIL_selScoped(UI_FSECTION_PAGE_HOST);
    const PAGE = UTIL_selScoped(UI_FSECTION_PAGE);
    const SEP  = UTIL_selScoped(UI_FSECTION_SEP);
    const ICO_SLOT = UTIL_selScoped(UI_FSECTION_ICON_SLOT);
    const FROW = UTIL_selScoped(UI_FSECTION_FOLDER_ROW);
    const CROW = UTIL_selScoped(UI_FSECTION_CATEGORY_ROW);
    const FMORE = UTIL_selScoped(UI_FSECTION_FOLDER_MORE);
    const CMORE = UTIL_selScoped(UI_FSECTION_CATEGORY_MORE);
    const CTOGGLE = `${ICO_SLOT}[${ATTR_CGXUI_STATE}="${UI_FSECTION_CATEGORY_TOGGLE}"]`;

    return `
/* ===========================
   ${MODICON} ${MODTAG} — cgxui (${SkID})
   =========================== */

${ROOT} svg,
${CATROOT} svg{ width:16px; height:16px; opacity:.9; flex:0 0 auto; }
${ICO_SLOT}{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px; height:20px;
  opacity:1 !important;
  visibility:visible !important;
  flex:0 0 auto;
}
${ICO_SLOT} [${ATTR_CGXUI_STATE}="project-like-icon"]{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px;
  height:20px;
  color:currentColor;
}
${ICO_SLOT} [${ATTR_CGXUI_STATE}="project-like-icon"] svg{ width:20px; height:20px; }
${ROOT} > button svg,
${CATROOT} > button svg{ width:12px; height:12px; }
${CTOGGLE}{
  border-radius:6px;
  cursor:pointer;
}
${CTOGGLE}:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${CTOGGLE}:focus-visible{
  outline:1.5px solid var(--text-primary, currentColor);
  outline-offset:2px;
}

${SEP}{
  height: 1px;
  margin: 6px 8px;
  background: var(--border-default, rgba(255,255,255,.12));
}

/* A) Main folders dropdown menu (Assign Menu) */
${MENU}{
  position:fixed;
  z-index:${CFG_FSECTION_FLOATING_Z};
  min-width:200px;
  background:rgba(30,30,30,.96);
  border:1px solid rgba(255,255,255,.10);
  border-radius:10px;
  box-shadow:0 12px 30px rgba(0,0,0,.45);
  overflow:hidden;
  backdrop-filter: blur(8px);
}
${MENU} button{
  all:unset;
  display:flex;
  width:100%;
  padding:10px 12px;
  cursor:pointer;
  color:rgba(255,255,255,.92);
  font-size:13px;
}
${MENU} button:hover{ background:rgba(255,255,255,.08); }
${MENU} [${ATTR_CGXUI_STATE}="muted"]{ opacity:.7; padding:10px 12px; font-size:12px; }
${MENU} ${SEP}{ margin:0; }

/* B) Folder row “⋯” button */
${FROW},
${CROW}{ position:relative; }
${FROW}:not(:hover):not([aria-current="true"]),
${CROW}:not(:hover):not([aria-current="true"]){
  background: transparent !important;
}
${FMORE},
${CMORE}{
  all:unset;
  position:absolute;
  right:10px; top:50%;
  transform:translateY(-50%);
  width:28px; height:28px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:8px;
  cursor:pointer;
  color:rgba(255,255,255,.85);
  opacity:0;
}
${FROW}:hover ${FMORE},
${FROW}:focus-within ${FMORE},
${CROW}:hover ${CMORE},
${CROW}:focus-within ${CMORE}{ opacity:1; }
${FMORE}:hover,
${CMORE}:hover{ background:rgba(255,255,255,.08); }
${FMORE}:active,
${CMORE}:active{ background:rgba(255,255,255,.10); }

/* C) Popover (Rename / Delete) */
${POP}{
  position:fixed;
  z-index:${CFG_FSECTION_FLOATING_Z};
  padding:6px;
  min-width:210px;
  background: var(--bg-elevated-secondary, #181818);
  border: 1px solid var(--border-default, #ffffff26);
  border-radius:12px;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a);
  backdrop-filter: blur(var(--blur-sm, 8px));
  overflow:hidden;
}
${POP} button{
  all:unset;
  display:flex;
  align-items:center;
  gap:10px;
  width:100%;
  padding:10px 12px;
  border-radius:10px;
  cursor:pointer;
  color: var(--text-primary, #fff);
  font-size: var(--text-sm, .875rem);
  line-height: 1;
}
${POP} button:hover{ background: var(--interactive-bg-secondary-hover, #ffffff1a); }
${POP} button:active{ background: var(--interactive-bg-secondary-press, #ffffff0d); }
${POP} button[${ATTR_CGXUI_STATE}="danger"]{ color: var(--text-error, #f93a37); }

${POP} [${ATTR_CGXUI_STATE}="ico"]{
  width:20px; height:20px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  color: currentColor;
}
${POP} [${ATTR_CGXUI_STATE}="ico"] svg{ width:20px; height:20px; fill: currentColor; }
${POP} [${ATTR_CGXUI_STATE}="picker-title"]{
  padding: 8px 10px 4px;
  color: var(--text-secondary, rgba(255,255,255,.72));
  font-size: 12px;
  font-weight: 600;
}
${POP} [${ATTR_CGXUI_STATE}="picker-section"]{
  padding: 6px 8px 8px;
}
${POP} [${ATTR_CGXUI_STATE}="picker-label"]{
  margin-bottom: 7px;
  color: var(--text-tertiary, rgba(255,255,255,.56));
  font-size: 11px;
  line-height: 1;
}
${POP} [${ATTR_CGXUI_STATE}="picker-grid"]{
  display: grid;
  grid-template-columns: repeat(6, 28px);
  gap: 8px;
}
${POP} button[${ATTR_CGXUI_STATE}="color-swatch"],
${POP} button[${ATTR_CGXUI_STATE}="icon-choice"]{
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0;
  border-radius: 8px;
  justify-content: center;
  box-sizing: border-box;
}
${POP} button[${ATTR_CGXUI_STATE}="color-swatch"]{
  background: var(--swatch-color, transparent);
  border: 1px solid rgba(255,255,255,.16);
}
${POP} button[${ATTR_CGXUI_STATE}="color-swatch"][aria-pressed="true"],
${POP} button[${ATTR_CGXUI_STATE}="icon-choice"][aria-pressed="true"]{
  outline: 2px solid var(--text-primary, #fff);
  outline-offset: 2px;
}
${POP} button[${ATTR_CGXUI_STATE}="color-swatch"][data-cgxui-value=""]{
  background:
    linear-gradient(135deg, transparent calc(50% - 1px), rgba(255,255,255,.65) 50%, transparent calc(50% + 1px)),
    rgba(255,255,255,.06);
}
${POP} button[${ATTR_CGXUI_STATE}="icon-choice"] svg{
  width: 19px;
  height: 19px;
}

/* D) Modal (Create / Rename) */
${MODAL}{
  position:fixed; inset:0;
  z-index:${CFG_FSECTION_FLOATING_Z};
  background:rgba(0,0,0,.55);
  display:flex;
  align-items:flex-start;
  justify-content:center;
  padding-top:90px;
}
${MODAL} [${ATTR_CGXUI_STATE}="box"]{
  width:min(560px, calc(100vw - 32px));
  background:rgba(32,32,32,.98);
  border:1px solid rgba(255,255,255,.12);
  border-radius:16px;
  box-shadow:0 18px 60px rgba(0,0,0,.6);
  overflow:hidden;
}
${MODAL} [${ATTR_CGXUI_STATE}="hd"]{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:14px 16px;
}
${MODAL} [${ATTR_CGXUI_STATE}="title"]{ font-size:14px; font-weight:600; opacity:.95; }
${MODAL} button[${ATTR_CGXUI_STATE}="x"]{
  all:unset;
  width:30px; height:30px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:10px;
  cursor:pointer;
  opacity:.9;
}
${MODAL} button[${ATTR_CGXUI_STATE}="x"]:hover{ background:rgba(255,255,255,.08); }
${MODAL} [${ATTR_CGXUI_STATE}="bd"]{ padding:0 16px 16px; }
${MODAL} [${ATTR_CGXUI_STATE}="message"]{
  color:rgba(255,255,255,.76);
  font-size:13px;
  line-height:1.45;
}
${MODAL} input{
  width:100%;
  margin-top:6px;
  padding:12px 12px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(18,18,18,.8);
  color:rgba(255,255,255,.92);
  outline:none;
}
${MODAL} [${ATTR_CGXUI_STATE}="ft"]{
  display:flex;
  justify-content:flex-end;
  gap:10px;
  padding:12px 16px 16px;
}
${MODAL} button[${ATTR_CGXUI_STATE}="btn"],
${MODAL} button[${ATTR_CGXUI_STATE}="primary"]{
  all:unset;
  padding:10px 14px;
  border-radius:12px;
  cursor:pointer;
  font-size:13px;
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.06);
  color:rgba(255,255,255,.92);
}
${MODAL} button[${ATTR_CGXUI_STATE}="btn"]:hover,
${MODAL} button[${ATTR_CGXUI_STATE}="primary"]:hover{ background:rgba(255,255,255,.10); }
${MODAL} button[${ATTR_CGXUI_STATE}="primary"]{ background:rgba(255,255,255,.12); }
${MODAL} button[disabled]{ opacity:.4; cursor:not-allowed; }

/* Category / folder viewer */
${VIEWER}{
  position: fixed;
  inset: 0;
  z-index: ${CFG_FSECTION_FLOATING_Z};
  overflow: auto;
  background: var(--main-surface-primary, #212121);
  color: var(--text-primary, #fff);
  font: 14px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial;
}
${VIEWER}[data-cgxui-mode="panel"]{
  inset: 8px auto 8px calc(var(--sidebar-width, 260px) + 8px);
  width: min(430px, max(320px, calc(100vw - var(--sidebar-width, 260px) - 24px)));
  max-height: calc(100svh - 16px);
  overflow: hidden;
  background: var(--bg-elevated-secondary, #2f3030);
  border: 1px solid var(--border-default, rgba(255,255,255,.12));
  border-radius: 22px;
  box-shadow: 0 18px 60px rgba(0,0,0,.36);
}
${VIEWER} [${ATTR_CGXUI_STATE}="page"]{
  width: min(90vw, var(--thread-content-max-width, 48rem));
  max-width: 48rem;
  min-height: 100%;
  margin: 0 auto;
  padding: 64px 0 32px;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="page"]{
  width: auto;
  max-width: none;
  min-height: 0;
  height: 100%;
  margin: 0;
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
}
${VIEWER} [${ATTR_CGXUI_STATE}="head"]{
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:16px;
  padding: 0 0 18px;
}
${VIEWER} [${ATTR_CGXUI_STATE}="title"]{
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="head"]{
  align-items: center;
  padding: 0 0 6px;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="title"]{
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, rgba(255,255,255,.72));
}
${VIEWER} button{ border:0; background: transparent; color:inherit; cursor:pointer; font-size: 14px; opacity:.82; }
${VIEWER} button:hover{ opacity:1; }
${VIEWER} [${ATTR_CGXUI_STATE}="close"]{
  width:32px;
  height:32px;
  border-radius:8px;
  display:flex;
  align-items:center;
  justify-content:center;
}
${VIEWER} [${ATTR_CGXUI_STATE}="close"]:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${VIEWER} [${ATTR_CGXUI_STATE}="sub"]{ color: var(--text-secondary, rgba(255,255,255,.72)); font-size: 13px; margin-top: 6px; }
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="sub"]{ display:none; }
${VIEWER} [${ATTR_CGXUI_STATE}="list"]{
  border-top: 1px solid var(--border-default, rgba(255,255,255,.10));
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="list"]{
  border-top: 0;
  max-height: none;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding: 2px 0 4px;
}
${VIEWER} [${ATTR_CGXUI_STATE}="row"]{
  display:flex;
  min-height:64px;
  align-items:center;
  padding:12px;
  color:inherit;
  text-decoration:none;
}
${VIEWER} [${ATTR_CGXUI_STATE}="row"]:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="row"]{
  min-height: 38px;
  gap: 10px;
  padding: 5px 10px;
  border-radius: 10px;
  font-size: 14px;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="row"]:hover,
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="list"] button:hover{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="panel-icon"]{
  all: unset;
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  border-radius: 8px;
}
${VIEWER}[data-cgxui-mode="panel"] button[${ATTR_CGXUI_STATE}="panel-icon"]{
  cursor: pointer;
}
${VIEWER}[data-cgxui-mode="panel"] button[${ATTR_CGXUI_STATE}="panel-icon"]:hover{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="panel-icon"] svg{
  width: 20px;
  height: 20px;
}
${VIEWER} [${ATTR_CGXUI_STATE}="row-title"]{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-weight:500;
}
${VIEWER} [${ATTR_CGXUI_STATE}="row-sub"]{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color: var(--text-secondary, rgba(255,255,255,.72));
  font-size: 13px;
  margin-top:3px;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="row-title"]{
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="row-sub"]{
  display: none;
}
${VIEWER} [${ATTR_CGXUI_STATE}="list"] button{
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 64px;
  padding: 12px;
  color: inherit;
  cursor: pointer;
}
${VIEWER} [${ATTR_CGXUI_STATE}="list"] button:hover{ background: rgba(255,255,255,.08); }
${VIEWER}[data-cgxui-mode="panel"] [${ATTR_CGXUI_STATE}="list"] button{
  min-height: 38px;
  gap: 10px;
  padding: 5px 10px;
  border-radius: 10px;
}

/* Category page mode: mounted inside ChatGPT's main shell, not as a body overlay */
${PAGE_HOST}{
  min-height:100%;
  width:100%;
  flex:1 1 auto;
  display:flex;
  align-items:stretch;
  justify-content:center;
  box-sizing:border-box;
  overflow:visible;
  background:var(--main-surface-primary, #212121);
  color:var(--text-primary, #fff);
}
${PAGE}{
  --thread-content-max-width: 40rem;
  width: min(90cqw, var(--thread-content-max-width));
  max-width: var(--thread-content-max-width);
  min-height: 100%;
  margin: 0 auto;
  padding: 64px 0 32px;
  color: var(--text-primary, #fff);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  gap: 18px;
}
${PAGE} [${ATTR_CGXUI_STATE}="head"]{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
}
${PAGE} [${ATTR_CGXUI_STATE}="title-row"]{
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"]{
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary, currentColor);
  border-radius: 8px;
}
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"][role="button"]{
  cursor: pointer;
}
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"][role="button"]:hover{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
}
${PAGE} h1{
  margin: 0;
  min-width: 0;
  color: var(--text-primary, #fff);
  font-size: 28px;
  line-height: 34px;
  font-weight: 500;
}
${PAGE} [${ATTR_CGXUI_STATE}="sub"]{
  margin-top: 6px;
  color: var(--text-secondary, rgba(255,255,255,.72));
  font-size: 13px;
}
${PAGE} [${ATTR_CGXUI_STATE}="close"]{
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: .82;
}
${PAGE} [${ATTR_CGXUI_STATE}="close"]:hover{
  opacity: 1;
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
}
${PAGE} [${ATTR_CGXUI_STATE}="tabs"]{
  display: flex;
  align-items: center;
  gap: 4px;
  padding-bottom: 0;
  color: var(--text-secondary, rgba(255,255,255,.72));
  font-size: 14px;
  font-weight: 500;
}
${PAGE} [${ATTR_CGXUI_STATE}="tab"]{
  border: 0;
  border-radius: 999px;
  padding: 9px 16px;
  background: var(--interactive-bg-secondary-press, rgba(255,255,255,.10));
  color: var(--text-primary, #fff);
}
${PAGE} [${ATTR_CGXUI_STATE}="view-action"]{
  border: 0;
  border-radius: 999px;
  padding: 9px 16px;
  background: transparent;
  color: var(--text-secondary, rgba(255,255,255,.72));
}
${PAGE} [${ATTR_CGXUI_STATE}="view-action"]:hover{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
  color: var(--text-primary, #fff);
}
${PAGE} [${ATTR_CGXUI_STATE}="view-action"]:disabled{
  cursor: default;
  opacity: .62;
}
${PAGE} [${ATTR_CGXUI_STATE}="view-action"][data-cgxui-refresh-state="done"]{
  color: var(--text-primary, #fff);
}
${PAGE} ol{
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border-default, rgba(255,255,255,.10));
}
${PAGE}[data-cgxui-page-kind="projects"]{
  display: block;
  height: auto;
  min-height: 100%;
  align-content: initial;
}
${PAGE}[data-cgxui-page-kind="projects"] [${ATTR_CGXUI_STATE}="list"]{
  min-height: 0;
  overflow: visible;
  overscroll-behavior: auto;
  scrollbar-gutter: auto;
  contain: none;
}
${PAGE}[data-cgxui-page-kind="projects"] li{
  min-height: 48px;
  contain: layout paint;
  content-visibility: visible;
}
${PAGE}[data-cgxui-page-kind="projects"] a{
  min-height: 48px;
  gap: 10px;
  padding: 7px 10px;
}
${PAGE}[data-cgxui-page-kind="projects"] [${ATTR_CGXUI_STATE}="project-index"]{
  flex: 0 0 30px;
  color: var(--text-tertiary, rgba(255,255,255,.48));
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 20px;
  text-align: right;
}
${PAGE}[data-cgxui-page-kind="projects"] [${ATTR_CGXUI_STATE}="title-icon"]{
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  color: var(--text-secondary, rgba(255,255,255,.72));
}
${PAGE}[data-cgxui-page-kind="projects"] [${ATTR_CGXUI_STATE}="title-icon"] > *{
  width: 20px;
  height: 20px;
}
${PAGE}[data-cgxui-page-kind="projects"] [${ATTR_CGXUI_STATE}="title-icon"] svg{
  width: 20px;
  height: 20px;
  display: block;
}
${PAGE} li{
  min-height: 64px;
  border-bottom: 1px solid var(--border-default, rgba(255,255,255,.10));
}
${PAGE} li:hover{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
}
${PAGE} a,
${PAGE} [${ATTR_CGXUI_STATE}="category-button"]{
  display: flex;
  width: 100%;
  min-height: 64px;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  padding: 12px;
  color: inherit;
  text-decoration: none;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
${PAGE} [${ATTR_CGXUI_STATE}="row-title"]{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
}
${PAGE} [${ATTR_CGXUI_STATE}="row-sub"]{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary, rgba(255,255,255,.72));
  font-size: 14px;
  margin-top: 3px;
}
${PAGE} [${ATTR_CGXUI_STATE}="row-date"]{
  color: var(--text-tertiary, rgba(255,255,255,.55));
  flex: 0 0 auto;
  font-size: 14px;
  white-space: nowrap;
}

/* E) Folder kind divider */
${ROOT} [data-cgxui-state="kind-divider"],
${CATROOT} [data-cgxui-state="kind-divider"]{
  height: 1px;
  margin: 4px 8px;
  background: var(--border-default, rgba(255,255,255,.10));
}

/* F) Active group row (contains current chat) */
${FROW}[aria-current="true"],
${CROW}[aria-current="true"]{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
  border-radius: 8px;
}
`;
  }

  /* ───────────────────────────── 🟪 UI BOUNDARY — CSS INJECTOR 📝🔓💥 ───────────────────────────── */

  function UI_ensureStyle() {
    const existing = D.getElementById(CSS_FSECTION_STYLE_ID);
    if (existing) {
      const next = CSS_FSECTION_TEXT();
      if (existing.textContent !== next) existing.textContent = next;
      return;
    }
    const st = D.createElement('style');
    st.id = CSS_FSECTION_STYLE_ID;
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = CSS_FSECTION_TEXT();
    D.documentElement.appendChild(st);
    CLEAN.nodes.add(st);
  }

  /* ───────────────────────────── 🟥 ENGINE — DOMAIN LOGIC 📝🔓💥 ───────────────────────────── */

  function STORE_nowStamp() {
    return Date.now();
  }

  function STORE_normalizeProjectRef(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const id = String(src.id || src.projectId || '').trim();
    if (!id) return null;
    const name = String(src.name || src.projectName || id).trim() || id;
    return { id, name };
  }

  function STORE_normalizeHexColor(raw) {
    const value = String(raw || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '';
  }

  function STORE_normalizeProjectColor(raw) {
    const value = STORE_normalizeHexColor(raw);
    if (!value) return '';
    return CFG_PROJECT_COLOR_OPTIONS.some((item) => item.color.toUpperCase() === value) ? value : '';
  }

    /* Phase C8: moved to 0F4a — function STORE_normalizeCategoryIcon */

  function STORE_normalizeCategoryPrefs(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const out = {};
    Object.keys(src).forEach((categoryId) => {
      const id = String(categoryId || '').trim();
      const pref = src[categoryId] && typeof src[categoryId] === 'object' ? src[categoryId] : {};
      if (!id) return;

      const icon = STORE_normalizeCategoryIcon(pref.icon);
      const color = STORE_normalizeHexColor(pref.color);
      const row = {};
      if (icon !== CFG_CATEGORY_DEFAULT_ICON) row.icon = icon;
      if (color) row.color = color;
      if (Object.keys(row).length) out[id] = row;
    });
    return out;
  }

  function STORE_normalizeFolderRecord(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const id = String(src.id || src.folderId || '').trim();
    if (!id) return null;
    const name = String(src.name || src.title || id).trim() || id;
    const kindRaw = String(src.kind || '').trim().toLowerCase();
    const createdAt = src.createdAt ?? STORE_nowStamp();
    const updatedAt = src.updatedAt ?? createdAt;
    const item = {
      id,
      name,
      kind: kindRaw === 'project_backed' ? 'project_backed' : 'local',
      projectRef: STORE_normalizeProjectRef(src.projectRef),
      createdAt,
      updatedAt,
    };
    const iconColor = STORE_normalizeProjectColor(src.iconColor);
    if (iconColor) item.iconColor = iconColor;
    return item;
  }

  function STORE_makeLocalFolderRecord(name, extra = {}) {
    const stamp = STORE_nowStamp();
    return STORE_normalizeFolderRecord({
      id: extra.id || UTIL_uid(),
      name,
      kind: 'local',
      projectRef: null,
      createdAt: stamp,
      updatedAt: stamp,
      ...extra,
    });
  }

  function STORE_normalizeData(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const foldersSrc = Array.isArray(src.folders) ? src.folders : [];
    const folders = [];
    const seen = new Set();
    for (const row of foldersSrc) {
      const item = STORE_normalizeFolderRecord(row);
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      folders.push(item);
    }
    const itemsSrc = (src.items && typeof src.items === 'object') ? src.items : {};
    const items = {};
    for (const folder of folders) {
      items[folder.id] = Array.isArray(itemsSrc[folder.id]) ? [...new Set(itemsSrc[folder.id].map((v) => String(v || '').trim()).filter(Boolean))] : [];
    }
    return { folders, items };
  }

  function STORE_normalizeCategoryOpenMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === CFG_CATEGORY_OPEN_MODE_PANEL ? CFG_CATEGORY_OPEN_MODE_PANEL : CFG_CATEGORY_OPEN_MODE_PAGE;
  }

  function STORE_normalizeFolderOpenMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === CFG_CATEGORY_OPEN_MODE_PAGE ? CFG_CATEGORY_OPEN_MODE_PAGE : CFG_CATEGORY_OPEN_MODE_PANEL;
  }

  function STORE_normalizeMoreOpenMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return value === CFG_MORE_OPEN_MODE_DROPDOWN ? CFG_MORE_OPEN_MODE_DROPDOWN : CFG_MORE_OPEN_MODE_PAGE;
  }

  function STORE_normalizeBool(raw, fallback = true) {
    return typeof raw === 'boolean' ? raw : !!fallback;
  }

  function STORE_readData() {
    // canonical first
    let data = UTIL_storage.getJSON(KEY_FSECTION_STATE_DATA_V1, null);
    if (!data || typeof data !== 'object') {
      // legacy bridge
      data = UTIL_storage.getJSON(KEY_LEG_DATA, null);
    }
    return STORE_normalizeData(data);
  }

  function STORE_readUI() {
    let ui = UTIL_storage.getJSON(KEY_FSECTION_STATE_UI_V1, null);
    if (!ui || typeof ui !== 'object') ui = UTIL_storage.getJSON(KEY_LEG_UI, null);
    if (!ui || typeof ui !== 'object') ui = { openFolders: {}, foldersExpanded: true };
    if (!ui.openFolders || typeof ui.openFolders !== 'object') ui.openFolders = {};
    if (typeof ui.foldersExpanded !== 'boolean') ui.foldersExpanded = true;
    if (!ui.openCategories || typeof ui.openCategories !== 'object') ui.openCategories = {};
    if (typeof ui.categoriesExpanded !== 'boolean') ui.categoriesExpanded = false;
    ui.folderOpenMode = STORE_normalizeFolderOpenMode(ui.folderOpenMode);
    ui.categoryOpenMode = STORE_normalizeCategoryOpenMode(ui.categoryOpenMode);
    ui.folderMoreOpenMode = STORE_normalizeMoreOpenMode(ui.folderMoreOpenMode);
    ui.categoryMoreOpenMode = STORE_normalizeMoreOpenMode(ui.categoryMoreOpenMode);
    ui.folderInlinePreviewOnOpen = STORE_normalizeBool(ui.folderInlinePreviewOnOpen, true);
    ui.categoryInlinePreviewOnOpen = STORE_normalizeBool(ui.categoryInlinePreviewOnOpen, true);
    ui.projectMoreOpenMode = STORE_normalizeMoreOpenMode(
      Object.prototype.hasOwnProperty.call(ui, 'projectMoreOpenMode') ? ui.projectMoreOpenMode : CFG_MORE_OPEN_MODE_DROPDOWN
    );
    ui.projectInlinePreviewOnOpen = STORE_normalizeBool(ui.projectInlinePreviewOnOpen, true);
    ui.categoryPrefs = STORE_normalizeCategoryPrefs(ui.categoryPrefs);
    ui.showFolderCounts = STORE_normalizeBool(ui.showFolderCounts, true);
    ui.showCategoryCounts = STORE_normalizeBool(ui.showCategoryCounts, true);
    return ui;
  }

  function STORE_writeData(data) {
    UTIL_storage.setJSON(KEY_FSECTION_STATE_DATA_V1, data);
    // keep legacy in sync so older parts never break
    UTIL_storage.setJSON(KEY_LEG_DATA, data);
  }

  function STORE_writeUI(ui) {
    UTIL_storage.setJSON(KEY_FSECTION_STATE_UI_V1, ui);
    UTIL_storage.setJSON(KEY_LEG_UI, ui);
  }

  function EVENT_emitFoldersChanged(detail = {}) {
    try {
      const payload = {
        ...detail,
        action: String(detail.action || 'changed'),
        source: String(detail.source || 'folders'),
        ts: Date.now(),
      };
      W.dispatchEvent(new CustomEvent(EV_FOLDERS_CHANGED, { detail: payload }));
    } catch (error) {
      DIAG_err('foldersChangedEvent', error);
    }
  }

  function STORE_setFolderIconColor(folderId, color) {
    const id = String(folderId || '').trim();
    if (!id) return;
    const next = STORE_normalizeProjectColor(color);
    const data = STORE_readData();
    const folder = data.folders.find((item) => item.id === id);
    if (!folder) return;
    if (next) folder.iconColor = next;
    else delete folder.iconColor;
    folder.updatedAt = STORE_nowStamp();
    STORE_writeData(data);
    EVENT_emitFoldersChanged({
      action: 'folder-appearance',
      folderId: id,
      folderName: String(folder.name || ''),
      source: 'folder-appearance',
    });
    ENGINE_rerenderAllSections();
    UI_refreshActivePageForAppearance('folder', id);
  }

    /* Phase C8: moved to 0F4a — function STORE_getCategoryAppearance */

    /* Phase C8: moved to 0F4a — function STORE_setCategoryAppearance */

  function STORE_getShowFolderCounts() {
    return STORE_readUI().showFolderCounts !== false;
  }

  function STORE_setShowFolderCounts(value) {
    const ui = STORE_readUI();
    ui.showFolderCounts = value !== false;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return ui.showFolderCounts;
  }

  function STORE_getShowCategoryCounts() {
    return STORE_readUI().showCategoryCounts !== false;
  }

  function STORE_setShowCategoryCounts(value) {
    const ui = STORE_readUI();
    ui.showCategoryCounts = value !== false;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return ui.showCategoryCounts;
  }

  function STORE_seedIfEmpty() {
    const d = STORE_readData();
    if (d.folders.length) return;

    const folders = CFG_SEED_FOLDERS.map((x) => STORE_makeLocalFolderRecord(x.name));
    const items = {};
    folders.forEach((f) => (items[f.id] = []));
    STORE_writeData({ folders, items });
    EVENT_emitFoldersChanged({
      action: 'folders-seed',
      affectedCount: folders.length,
      source: 'folder-seed',
    });

    const ui = STORE_readUI();
    folders.forEach((f) => { ui.openFolders[f.id] = true; });
    STORE_writeUI(ui);
  }

  function ENGINE_rerenderAllSections() {
    const nodes = D.querySelectorAll([
      UTIL_selScoped(UI_FSECTION_ROOT),
      UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT),
    ].join(','));
    nodes.forEach((sec) => {
      const fn = sec?._cgxuiRender;
      if (typeof fn === 'function') SAFE_try('rerender', fn);
    });
    if (nodes.length) {
      STATE.sidebarRenderCount = Number(STATE.sidebarRenderCount || 0) + 1;
      STATE.lastSidebarRenderReason = 'section-rerender';
      STATE.sidebarLastRenderReason = 'section-rerender';
      STATE.sidebarLastRenderAt = Date.now();
    }
  }

    /* Phase C8: moved to 0F4a — function UI_iconOptionForKey */

    /* Phase C8: moved to 0F4a — function UI_categoryIconSvg */

  function UI_projectColorOptions(includeDefault = true) {
    const colors = CFG_PROJECT_COLOR_OPTIONS.map((item) => ({ ...item, value: item.color }));
    if (!includeDefault) return colors;
    return [{ key: 'default', label: 'Default', color: '', value: '' }, ...colors];
  }

  function UI_colorGridItem(label, current, onSelect, includeDefault = true) {
    return {
      type: 'color-grid',
      label,
      current: STORE_normalizeHexColor(current),
      options: UI_projectColorOptions(includeDefault),
      onSelect,
    };
  }

  function UI_iconGridItem(label, current, onSelect) {
    return {
      type: 'icon-grid',
      label,
      current: STORE_normalizeCategoryIcon(current),
      options: CFG_CATEGORY_ICON_OPTIONS,
      onSelect,
    };
  }

  function UI_openFolderAppearanceEditor(anchorEl, folder, afterChange = null) {
    if (!anchorEl || !folder) return;
    const folderColor = STORE_normalizeProjectColor(folder.iconColor);
    UI_openFolderPop(anchorEl, [
      { type: 'title', label: 'Folder appearance' },
      UI_colorGridItem('Color', folderColor, (color) => {
        STORE_setFolderIconColor(folder.id, color);
        afterChange?.();
      }, true),
    ]);
  }

    /* Phase C8: moved to 0F4a — function UI_openCategoryAppearanceEditor */

  /* Popover (folder row actions) */
  function UI_closeFolderPop() {
    if (STATE.popEl) SAFE_remove(STATE.popEl);
    STATE.popEl = null;
  }

  function UI_openFolderPop(anchorEl, items) {
    UI_ensureStyle();
    LIBCORE_registerFoldersOwner();
    UI_closeFolderPop();

    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI, UI_FSECTION_POP);
    pop.setAttribute(ATTR_CGXUI_OWNER, SkID);

    items.forEach((it) => {
      if (it === 'sep') {
        const sep = D.createElement('div');
        sep.setAttribute(ATTR_CGXUI, UI_FSECTION_SEP);
        sep.setAttribute(ATTR_CGXUI_OWNER, SkID);
        pop.appendChild(sep);
        return;
      }

      if (it?.type === 'title') {
        const title = D.createElement('div');
        title.setAttribute(ATTR_CGXUI_STATE, 'picker-title');
        title.textContent = it.label || '';
        pop.appendChild(title);
        return;
      }

      if (it?.type === 'color-grid' || it?.type === 'icon-grid') {
        const section = D.createElement('div');
        section.setAttribute(ATTR_CGXUI_STATE, 'picker-section');

        const label = D.createElement('div');
        label.setAttribute(ATTR_CGXUI_STATE, 'picker-label');
        label.textContent = it.label || '';
        section.appendChild(label);

        const grid = D.createElement('div');
        grid.setAttribute(ATTR_CGXUI_STATE, 'picker-grid');

        (Array.isArray(it.options) ? it.options : []).forEach((option) => {
          const b = D.createElement('button');
          b.type = 'button';
          b.setAttribute(ATTR_CGXUI_STATE, it.type === 'color-grid' ? 'color-swatch' : 'icon-choice');
          b.setAttribute('aria-label', option.label || option.key || '');
          b.title = option.label || option.key || '';

          if (it.type === 'color-grid') {
            const value = STORE_normalizeHexColor(option.value || option.color);
            b.setAttribute('data-cgxui-value', value);
            b.style.setProperty('--swatch-color', value || 'transparent');
            b.setAttribute('aria-pressed', value === STORE_normalizeHexColor(it.current) ? 'true' : 'false');
            b.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              UI_closeFolderPop();
              SAFE_try('popColor', () => it.onSelect?.(value));
            };
          } else {
            const value = STORE_normalizeCategoryIcon(option.key);
            b.innerHTML = option.svg || '';
            b.setAttribute('aria-pressed', value === STORE_normalizeCategoryIcon(it.current) ? 'true' : 'false');
            b.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              UI_closeFolderPop();
              SAFE_try('popIcon', () => it.onSelect?.(value));
            };
          }

          grid.appendChild(b);
        });

        section.appendChild(grid);
        pop.appendChild(section);
        return;
      }

      const b = D.createElement('button');
      b.type = 'button';
      if (it.danger) b.setAttribute(ATTR_CGXUI_STATE, 'danger');

      if (it.iconEl) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.appendChild(it.iconEl.cloneNode(true));
        b.appendChild(ico);
      } else if (it.iconSvg) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.innerHTML = it.iconSvg;
        b.appendChild(ico);
      }

      const label = D.createElement('span');
      label.textContent = it.label || '';
      b.appendChild(label);

      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI_closeFolderPop();
        SAFE_try('popItem', () => it.onClick?.());
      };

      pop.appendChild(b);
    });

    D.body.appendChild(pop);
    CLEAN.nodes.add(pop);
    STATE.popEl = pop;

    const pad = 8;
    const rA = anchorEl.getBoundingClientRect();
    const rP = pop.getBoundingClientRect();

    let left = Math.min(rA.right - rP.width, innerWidth - rP.width - pad);
    let top = Math.min(rA.bottom + 6, innerHeight - rP.height - pad);
    left = Math.max(pad, left);
    top = Math.max(pad, top);

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    // close on outside click
    setTimeout(() => {
      const onDoc = (e) => {
        if (!STATE.popEl) return;
        if (!STATE.popEl.contains(e.target)) UI_closeFolderPop();
      };
      D.addEventListener('mousedown', onDoc, true);
      CLEAN.listeners.add(() => D.removeEventListener('mousedown', onDoc, true));
    }, 0);
  }

  function UI_openFoldersOverflowDropdown(anchorEl, foldersRaw) {
    const folders = Array.isArray(foldersRaw) ? foldersRaw.filter(Boolean) : [];
    if (!folders.length) return;
    UI_openFolderPop(anchorEl, [
      { type: 'title', label: 'More folders' },
      ...folders.map((folder) => ({
        label: folder.name || folder.id || 'Folder',
        iconSvg: FRAG_SVG_FOLDER,
        onClick: () => UI_openFolderByMode(folder.id),
      })),
    ]);
  }

  function UI_openCategoriesOverflowDropdown(anchorEl, groupsRaw) {
    const groups = Array.isArray(groupsRaw) ? groupsRaw.filter(Boolean) : [];
    if (!groups.length) return;
    UI_openFolderPop(anchorEl, [
      { type: 'title', label: 'More categories' },
      ...groups.map((group) => ({
        label: group.name || group.id || 'Category',
        iconSvg: UI_categoryIconSvg(STORE_getCategoryAppearance(group).icon),
        onClick: () => UI_openCategoryByMode(group),
      })),
    ]);
  }

  function UI_openFoldersMoreByMode(anchorEl, foldersRaw) {
    const folders = Array.isArray(foldersRaw) ? foldersRaw.filter(Boolean) : [];
    if (!folders.length) return;
    if (API_getFolderMoreOpenMode() === CFG_MORE_OPEN_MODE_DROPDOWN) {
      UI_openFoldersOverflowDropdown(anchorEl, folders);
      return;
    }
    UI_openFoldersViewer(folders);
  }

  function UI_openCategoriesMoreByMode(anchorEl, groupsRaw) {
    const groups = Array.isArray(groupsRaw) ? groupsRaw.filter(Boolean) : [];
    if (!groups.length) return;
    if (API_getCategoryMoreOpenMode() === CFG_MORE_OPEN_MODE_DROPDOWN) {
      UI_openCategoriesOverflowDropdown(anchorEl, groups);
      return;
    }
    UI_openCategoriesViewer(groups, { skipHistory: true });
  }

  /* Modal (create/rename) */
  function UI_openNameModal({ title, placeholder, initialValue, confirmText }) {
    UI_ensureStyle();

    return new Promise((resolve) => {
      const ov = D.createElement('div');
      ov.setAttribute(ATTR_CGXUI, UI_FSECTION_MODAL);
      ov.setAttribute(ATTR_CGXUI_OWNER, SkID);

      const box = D.createElement('div');
      box.setAttribute(ATTR_CGXUI_STATE, 'box');

      const hd = D.createElement('div');
      hd.setAttribute(ATTR_CGXUI_STATE, 'hd');

      const t = D.createElement('div');
      t.setAttribute(ATTR_CGXUI_STATE, 'title');
      t.textContent = title;

      const x = D.createElement('button');
      x.type = 'button';
      x.setAttribute(ATTR_CGXUI_STATE, 'x');
      x.textContent = '×';

      hd.appendChild(t);
      hd.appendChild(x);

      const bd = D.createElement('div');
      bd.setAttribute(ATTR_CGXUI_STATE, 'bd');

      const input = D.createElement('input');
      input.placeholder = placeholder || '';
      input.value = initialValue || '';
      bd.appendChild(input);

      const ft = D.createElement('div');
      ft.setAttribute(ATTR_CGXUI_STATE, 'ft');

      const cancel = D.createElement('button');
      cancel.type = 'button';
      cancel.setAttribute(ATTR_CGXUI_STATE, 'btn');
      cancel.textContent = 'Cancel';

      const ok = D.createElement('button');
      ok.type = 'button';
      ok.setAttribute(ATTR_CGXUI_STATE, 'btn');
      ok.setAttribute(ATTR_CGXUI_STATE, 'primary'); // visual
      ok.textContent = confirmText || 'OK';

      const sync = () => { ok.disabled = !input.value.trim(); };
      sync();

      ft.appendChild(cancel);
      ft.appendChild(ok);

      box.appendChild(hd);
      box.appendChild(bd);
      box.appendChild(ft);

      ov.appendChild(box);
      D.body.appendChild(ov);
      CLEAN.nodes.add(ov);

      const done = (v) => { SAFE_remove(ov); resolve(v); };

      x.onclick = () => done(null);
      cancel.onclick = () => done(null);
      ok.onclick = () => done(input.value.trim() || null);

      ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(null); });
      input.addEventListener('input', sync);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(null);
        if (e.key === 'Enter') { e.preventDefault(); if (!ok.disabled) ok.click(); }
      });

      setTimeout(() => input.focus(), 0);
    });
  }

  function UI_openSaveBeforeFolderModal({ chatId = '', href = '', folderId = '', folderName = '' } = {}) {
    try {
      UI_ensureStyle();

      const ov = D.createElement('div');
      ov.setAttribute(ATTR_CGXUI, UI_FSECTION_MODAL);
      ov.setAttribute(ATTR_CGXUI_OWNER, SkID);
      ov.setAttribute('data-cgxui-modal-kind', 'save-before-folder');

      const box = D.createElement('div');
      box.setAttribute(ATTR_CGXUI_STATE, 'box');

      const hd = D.createElement('div');
      hd.setAttribute(ATTR_CGXUI_STATE, 'hd');

      const title = D.createElement('div');
      title.setAttribute(ATTR_CGXUI_STATE, 'title');
      title.textContent = 'Save chat first';

      const x = D.createElement('button');
      x.type = 'button';
      x.setAttribute(ATTR_CGXUI_STATE, 'x');
      x.textContent = '×';

      hd.appendChild(title);
      hd.appendChild(x);

      const bd = D.createElement('div');
      bd.setAttribute(ATTR_CGXUI_STATE, 'bd');

      const message = D.createElement('div');
      message.setAttribute(ATTR_CGXUI_STATE, 'message');
      message.textContent = 'This chat is not saved in Library yet. Save it before adding it to a folder.';
      bd.appendChild(message);

      const ft = D.createElement('div');
      ft.setAttribute(ATTR_CGXUI_STATE, 'ft');

      const saveAdd = D.createElement('button');
      saveAdd.type = 'button';
      saveAdd.setAttribute(ATTR_CGXUI_STATE, 'primary');
      saveAdd.textContent = 'Save + Add';

      const openSave = D.createElement('button');
      openSave.type = 'button';
      openSave.setAttribute(ATTR_CGXUI_STATE, 'btn');
      openSave.textContent = 'Open Save';

      const cancel = D.createElement('button');
      cancel.type = 'button';
      cancel.setAttribute(ATTR_CGXUI_STATE, 'btn');
      cancel.textContent = 'Cancel';

      ft.appendChild(saveAdd);
      ft.appendChild(openSave);
      ft.appendChild(cancel);
      box.appendChild(hd);
      box.appendChild(bd);
      box.appendChild(ft);
      ov.appendChild(box);
      D.body.appendChild(ov);
      CLEAN.nodes.add(ov);

      let busy = false;
      const buttons = [saveAdd, openSave, cancel, x];
      const close = () => {
        if (busy) return;
        SAFE_remove(ov);
      };
      const setBusy = (on) => {
        busy = !!on;
        buttons.forEach((button) => { button.disabled = busy; });
      };
      const setMessage = (text) => {
        message.textContent = String(text || '');
      };
      const failureMessage = (status) => {
        switch (String(status || '')) {
          case 'capture-unavailable':
            return 'Capture is not available from this page. Use Capture / Save from Command Bar first.';
          case 'capture-failed':
            return 'Could not save this chat. Try Capture / Save from Command Bar.';
          case 'capture-not-indexed':
          case 'chat-not-saved':
            return 'The chat was captured, but Library has not indexed it yet. Try again in a moment.';
          case 'folder-bind-failed':
            return 'The chat was saved, but could not be added to the folder. Try again.';
          default:
            return 'Could not save and add this chat.';
        }
      };
      const showFallbackGuidance = () => {
        alert('Use Capture / Save from Command Bar first, then add to folder.');
      };
      const openSaveSurface = async () => {
        if (busy) return;
        try {
          const archive = H2O.archiveBoot || {};
          if (typeof archive.openSavedChats === 'function') {
            await archive.openSavedChats({
              view: 'saved',
              chatId: String(chatId || ''),
              source: 'folders-save-before-folder',
            });
            close();
            return;
          }
          if (typeof archive.openWorkbench === 'function') {
            await archive.openWorkbench('/saved');
            close();
            return;
          }
          showFallbackGuidance();
        } catch (error) {
          DIAG_err('open-save-before-folder', error);
          showFallbackGuidance();
        }
      };
      const saveAndAdd = async () => {
        if (busy) return;
        setBusy(true);
        setMessage('Saving chat...');
        try {
          const result = await API_saveAndBindToFolder({
            chatId,
            href,
            folderId,
            folderName,
            source: 'save-before-folder-modal',
          });
          if (result?.ok) {
            busy = false;
            SAFE_remove(ov);
            UI_closeAssignMenu();
            ENGINE_rerenderAllSections();
            return;
          }
          setMessage(failureMessage(result?.status));
        } catch (error) {
          DIAG_err('save-add-folder-modal', error);
          setMessage('Could not save and add this chat.');
        } finally {
          setBusy(false);
        }
      };

      x.onclick = close;
      cancel.onclick = close;
      saveAdd.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveAndAdd();
      };
      openSave.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openSaveSurface();
      };
      ov.addEventListener('mousedown', (event) => { if (event.target === ov) close(); });
      ov.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close();
        if (event.key === 'Enter') {
          event.preventDefault();
          saveAdd.click();
        }
      });

      setTimeout(() => saveAdd.focus(), 0);
      return ov;
    } catch (error) {
      DIAG_err('save-before-folder-modal', error);
      alert('Save this chat to Library before adding it to a folder.');
      return null;
    }
  }

  /* Sidebar row builders (clone templates if available) */
  function UI_makeRowShell(tplDiv, tplA, fallbackClass, tagName = 'div') {
    const tag = (tagName || 'div').toLowerCase();
    const tpl = (tag === 'a' ? tplA : tplDiv) || tplA || tplDiv;

    if (tpl) {
      const row = tpl.cloneNode(true);
      row.querySelectorAll?.('[id]')?.forEach((el) => el.removeAttribute('id'));
      row.removeAttribute?.('draggable');
      row.removeAttribute?.('data-discover');
      row.removeAttribute?.('data-testid');
      row.removeAttribute?.('data-fill');
      row.removeAttribute?.('aria-current');

      row.querySelectorAll?.('.trailing-pair')?.forEach((n) => n.remove());
      row.querySelectorAll?.('button[data-testid], button[aria-label], button[data-trailing-button]')?.forEach((n) => n.remove());

      if (row.tagName === 'A') row.setAttribute('href', '#');
      row.tabIndex = 0;
      return row;
    }

    const row = D.createElement(tag);
    row.className = fallbackClass;
    if (tag === 'a') row.setAttribute('href', '#');
    row.tabIndex = 0;
    row.innerHTML = `
      <div class="flex min-w-0 grow items-center gap-2.5">
        <div class="truncate"></div>
      </div>
    `;
    return row;
  }

  function UI_setRowText(rowEl, text) {
    const trunc = rowEl.querySelector?.(SEL.sidebarTruncate);
    if (trunc) trunc.textContent = text;
    else rowEl.textContent = text;
  }

  function UI_cleanSurfaceChatTitle(raw) {
    let text = UTIL_normText(raw || '');
    for (const icon of ['📎', '📌', '📝', '✎', '✏️', '✏']) {
      if (text.startsWith(icon)) text = UTIL_normText(text.slice(icon.length));
    }

    const parts = text.split(/\s+-\s+/).map((part) => UTIL_normText(part)).filter(Boolean);
    if (parts.length < 2) return text;

    const projectName = parts.shift();
    const chatTitle = parts.join(' - ');
    return chatTitle && projectName ? `${chatTitle} - ${projectName}` : text;
  }

  function UI_findExistingPrimaryIconSlot(rowEl) {
    const owned = rowEl.querySelector?.(UTIL_selScoped(UI_FSECTION_ICON_SLOT));
    if (owned) return owned;

    const trunc = rowEl.querySelector?.(SEL.sidebarTruncate);
    const textParent = trunc?.parentElement || null;
    if (textParent) {
      const beforeText = [...textParent.children].filter((el) => el !== trunc && !el.contains?.(trunc));
      const nativeIcon = beforeText.find((el) =>
        /\bicon\b/.test(String(el.className || '')) ||
        (el.children.length <= 2 && !!el.querySelector?.(':scope > svg'))
      );
      if (nativeIcon) return nativeIcon;
    }

    const candidates = [...rowEl.querySelectorAll?.('div,span') || []].filter((el) =>
      el !== trunc &&
      !el.contains?.(trunc) &&
      (/\bicon\b/.test(String(el.className || '')) || (el.children.length <= 2 && !!el.querySelector?.(':scope > svg')))
    );
    return candidates[0] || null;
  }

  function UI_removeSurfaceChatLeadingIcon(rowEl) {
    const slot = UI_findExistingPrimaryIconSlot(rowEl);
    if (slot) SAFE_remove(slot);
  }

  function UI_findPrimaryIconSlot(rowEl) {
    const owned = rowEl.querySelector?.(UTIL_selScoped(UI_FSECTION_ICON_SLOT));
    if (owned) return owned;

    const trunc = rowEl.querySelector?.(SEL.sidebarTruncate);
    const textParent = trunc?.parentElement || null;
    if (textParent) {
      const beforeText = [...textParent.children].filter((el) => el !== trunc && !el.contains?.(trunc));
      const nativeIcon = beforeText.find((el) =>
        /\bicon\b/.test(String(el.className || '')) ||
        (el.children.length <= 2 && !!el.querySelector?.(':scope > svg'))
      );
      if (nativeIcon) return nativeIcon;
    }

    const candidates = [...rowEl.querySelectorAll?.('div,span') || []].filter((el) =>
      el !== trunc &&
      !el.contains?.(trunc) &&
      (/\bicon\b/.test(String(el.className || '')) || (el.children.length <= 2 && !!el.querySelector?.(':scope > svg')))
    );
    if (candidates[0]) return candidates[0];

    const slot = D.createElement('span');
    if (trunc && trunc.parentElement) trunc.parentElement.insertBefore(slot, trunc);
    else rowEl.insertBefore(slot, rowEl.firstChild);
    return slot;
  }

  function UI_setPrimaryIcon(rowEl, svg, opts = {}) {
    if (!svg) return null;
    const slot = UI_findPrimaryIconSlot(rowEl);
    if (!slot) return null;
    slot.setAttribute(ATTR_CGXUI, UI_FSECTION_ICON_SLOT);
    slot.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const control = D.createElement(typeof opts.onClick === 'function' ? 'button' : 'span');
    if (control.tagName === 'BUTTON') {
      control.type = 'button';
      control.setAttribute('aria-label', opts.label || '');
      control.title = opts.label || '';
      control.style.cssText = 'all:unset;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:inherit;cursor:pointer;';
      if (typeof opts.expanded === 'boolean') control.setAttribute('aria-expanded', opts.expanded ? 'true' : 'false');
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onClick?.();
      };
      control.onclick = fire;
      control.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      };
    }

    const icon = D.createElement('span');
    icon.setAttribute(ATTR_CGXUI_STATE, 'project-like-icon');
    icon.style.color = STORE_normalizeHexColor(opts.color) || 'currentColor';
    icon.innerHTML = svg;
    control.appendChild(icon);

    slot.innerHTML = '';
    slot.appendChild(control);
    return slot;
  }

  function UI_injectIcon(rowEl, svg, opts = {}) {
    return UI_setPrimaryIcon(rowEl, svg, opts);
  }

  function UI_makeIconToggle(rowEl, label, onClick, expanded = null) {
    const slot = rowEl.querySelector?.(UTIL_selScoped(UI_FSECTION_ICON_SLOT));
    if (!slot) return null;

    slot.setAttribute(ATTR_CGXUI_STATE, UI_FSECTION_CATEGORY_TOGGLE);
    const target = slot.querySelector?.('button') || slot;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', label);
    target.setAttribute('title', label);
    if (typeof expanded === 'boolean') target.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    target.tabIndex = 0;

    const fire = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.();
    };
    target.onclick = fire;
    target.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') fire(e);
    };
    return slot;
  }

  function UI_wireAsButton(rowEl, onClick) {
    rowEl.setAttribute('role', 'button');
    rowEl.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick?.(); };
    rowEl.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
    };
    return rowEl;
  }

  function UI_syncSectionHeaderArrow(headerBtn, expanded) {
    if (!headerBtn) return;
    let svg = headerBtn.querySelector?.('svg');
    if (!svg) {
      headerBtn.insertAdjacentHTML('beforeend', FRAG_SVG_SECTION_ARROW);
      svg = headerBtn.querySelector?.('svg');
    }
    if (!svg) return;
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-rtl-flip', '');
    const chevronClass = expanded
      ? 'invisible h-3 w-3 shrink-0 group-hover/sidebar-expando-section:visible'
      : 'visible h-3 w-3 shrink-0';
    svg.setAttribute('class', chevronClass);
    let use = svg.querySelector?.('use');
    if (!use) {
      svg.innerHTML = '<use href="/cdn/assets/sprites-core-97566a9e.svg#ba3792" fill="currentColor"></use>';
      use = svg.querySelector?.('use');
    }
    use?.setAttribute('href', '/cdn/assets/sprites-core-97566a9e.svg#ba3792');
    use?.setAttribute('fill', 'currentColor');
    svg.style.transformOrigin = 'center';
    svg.style.transition = svg.style.transition || 'transform .16s ease';
    svg.style.transform = expanded ? 'rotate(0deg)' : 'rotate(-90deg)';
  }

    /* Phase C8: moved to 0F4a — function CATEGORY_getCatalogEntries */

    /* Phase C8: moved to 0F4a — function CATEGORY_nativeHrefForRow */

    /* Phase C8: moved to 0F4a — function CATEGORY_collectGroups */

    /* Phase C8: moved to 0F4a — async function CATEGORY_loadGroups */

  function ROUTE_getCurrentBaseHref(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_getCurrentBaseHref) return svc.ROUTE_getCurrentBaseHref(LIBCORE_ENV(), ...args);
  return ROUTE_getCurrentBaseHref_LOCAL(...args);
}

function ROUTE_getCurrentBaseHref_LOCAL() {
    const h2o = (W.history?.state && typeof W.history.state === 'object') ? W.history.state.h2o : null;
    if (h2o?.owner === CFG_H2O_PAGE_ROUTE_OWNER && (h2o.returnHref || h2o.baseHref)) {
      return String(h2o.returnHref || h2o.baseHref);
    }

    const href = String(W.location.href || '');
    try {
      const url = new URL(href, W.location.origin);
      if (ROUTE_parseUrl(url)) return `${url.origin}/`;
      url.searchParams.delete(CFG_H2O_PAGE_QUERY_FLAG);
      url.searchParams.delete(CFG_H2O_PAGE_QUERY_VIEW);
      url.searchParams.delete(CFG_H2O_PAGE_QUERY_ID);
      if (String(url.hash || '').startsWith(`#${CFG_H2O_PAGE_ROUTE_PREFIX}/`)) url.hash = '';
      return url.href;
    } catch {}

    const hash = String(W.location.hash || '');
    if (hash.startsWith(`#${CFG_H2O_PAGE_ROUTE_PREFIX}/`)) return href.slice(0, href.length - hash.length);
    return href.split('#')[0];
  }

  function ROUTE_makeHash(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_makeHash) return svc.ROUTE_makeHash(LIBCORE_ENV(), ...args);
  return ROUTE_makeHash_LOCAL(...args);
}

function ROUTE_makeHash_LOCAL(route = {}) {
    const view = String(route.view || '').trim();
    if (view === 'projects') return `#${CFG_H2O_PAGE_ROUTE_PREFIX}/projects`;
    if (view === 'categories') return `#${CFG_H2O_PAGE_ROUTE_PREFIX}/categories`;
    if (view === 'folder' || view === 'category') {
      const id = encodeURIComponent(String(route.id || '').trim());
      return id ? `#${CFG_H2O_PAGE_ROUTE_PREFIX}/${view}/${id}` : '';
    }
    return '';
  }

  function ROUTE_makeUrl(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_makeUrl) return svc.ROUTE_makeUrl(LIBCORE_ENV(), ...args);
  return ROUTE_makeUrl_LOCAL(...args);
}

function ROUTE_makeUrl_LOCAL(route = {}) {
    const view = String(route.view || '').trim();
    if (!view) return '';

    const url = new URL('/', W.location.origin);
    url.searchParams.set(CFG_H2O_PAGE_QUERY_FLAG, '1');
    url.searchParams.set(CFG_H2O_PAGE_QUERY_VIEW, view);
    if (view === 'folder' || view === 'category') {
      const id = String(route.id || '').trim();
      if (!id) return '';
      url.searchParams.set(CFG_H2O_PAGE_QUERY_ID, id);
    }
    return `${url.pathname}${url.search}`;
  }

  function ROUTE_parseUrl(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_parseUrl) return svc.ROUTE_parseUrl(LIBCORE_ENV(), ...args);
  return ROUTE_parseUrl_LOCAL(...args);
}

function ROUTE_parseUrl_LOCAL(input = W.location.href) {
    let url;
    try {
      url = input instanceof URL ? input : new URL(String(input || W.location.href), W.location.href);
    } catch {
      return null;
    }

    if (url.searchParams.get(CFG_H2O_PAGE_QUERY_FLAG) !== '1') return null;
    const view = String(url.searchParams.get(CFG_H2O_PAGE_QUERY_VIEW) || '').trim();
    if (view === 'projects') return { view: 'projects', id: '' };
    if (view === 'categories') return { view: 'categories', id: '' };
    if (view === 'folder' || view === 'category') {
      const id = String(url.searchParams.get(CFG_H2O_PAGE_QUERY_ID) || '').trim();
      return id ? { view, id } : null;
    }
    return null;
  }

  function ROUTE_parseHash(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_parseHash) return svc.ROUTE_parseHash(LIBCORE_ENV(), ...args);
  return ROUTE_parseHash_LOCAL(...args);
}

function ROUTE_parseHash_LOCAL(hash = W.location.hash) {
    const raw = String(hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    if (parts[0] !== CFG_H2O_PAGE_ROUTE_PREFIX) return null;
    if (parts[1] === 'projects') return { view: 'projects', id: '' };
    if (parts[1] === 'categories') return { view: 'categories', id: '' };
    if ((parts[1] === 'folder' || parts[1] === 'category') && parts[2]) {
      try {
        return { view: parts[1], id: decodeURIComponent(parts.slice(2).join('/')) };
      } catch {
        return { view: parts[1], id: parts.slice(2).join('/') };
      }
    }
    return null;
  }

  function ROUTE_parseCurrent(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_parseCurrent) return svc.ROUTE_parseCurrent(LIBCORE_ENV(), ...args);
  return ROUTE_parseCurrent_LOCAL(...args);
}

function ROUTE_parseCurrent_LOCAL() {
    const route = ROUTE_parseUrl(W.location.href) || ROUTE_parseHash(W.location.hash);
    if (!route) return null;
    const h2o = (W.history?.state && typeof W.history.state === 'object') ? W.history.state.h2o : null;
    return {
      ...route,
      baseHref: String(h2o?.returnHref || h2o?.baseHref || STATE.pageRoute?.baseHref || ROUTE_getCurrentBaseHref()),
    };
  }

  function ROUTE_makeState(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_makeState) return svc.ROUTE_makeState(LIBCORE_ENV(), ...args);
  return ROUTE_makeState_LOCAL(...args);
}

function ROUTE_makeState_LOCAL(route, baseHref) {
    const current = (W.history?.state && typeof W.history.state === 'object') ? W.history.state : {};
    return {
      ...current,
      h2o: {
        owner: CFG_H2O_PAGE_ROUTE_OWNER,
        view: String(route.view || ''),
        id: String(route.id || ''),
        returnHref: String(baseHref || ROUTE_getCurrentBaseHref()),
        baseHref: String(baseHref || ROUTE_getCurrentBaseHref()),
      },
    };
  }

  function ROUTE_commitPageRoute(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_commitPageRoute) return svc.ROUTE_commitPageRoute(LIBCORE_ENV(), ...args);
  return ROUTE_commitPageRoute_LOCAL(...args);
}

function ROUTE_commitPageRoute_LOCAL(route, opts = {}) {
    const normalized = {
      view: String(route?.view || '').trim(),
      id: String(route?.id || '').trim(),
    };
    if (!normalized.view) return;

    const baseHref = String(
      opts.baseHref ||
      STATE.pageRoute?.baseHref ||
      ROUTE_parseCurrent()?.baseHref ||
      ROUTE_getCurrentBaseHref()
    );
    STATE.pageRoute = { ...normalized, baseHref };

    if (opts.fromRoute || opts.skipHistory) return;

    const routeUrl = ROUTE_makeUrl(normalized);
    if (!routeUrl) return;

    const current = ROUTE_parseCurrent();
    const sameRoute = current && current.view === normalized.view && String(current.id || '') === normalized.id;
    const state = ROUTE_makeState(normalized, baseHref);
    try {
      if (sameRoute) W.history.replaceState(state, '', routeUrl);
      else W.history.pushState(state, '', routeUrl);
    } catch (error) {
      DIAG_err('routeCommit', error);
    }
  }

  function ROUTE_clearPageRoute(...args) {
  const svc = LIBCORE_getRouteService();
  if (svc?.ROUTE_clearPageRoute) return svc.ROUTE_clearPageRoute(LIBCORE_ENV(), ...args);
  return ROUTE_clearPageRoute_LOCAL(...args);
}

function ROUTE_clearPageRoute_LOCAL() {
    STATE.pageRoute = null;
  }

  async function ROUTE_openCurrentPage(reason = 'route') {
    const route = ROUTE_parseCurrent();
    if (!route) {
      ROUTE_clearPageRoute();
      if (STATE.pageSession) UI_restoreInShellPage(`route-exit:${reason}`);
      return false;
    }

    const token = ++STATE.pageRouteToken;
    const svc = LIBCORE_getRouteService();
    if (svc?.ROUTE_dispatchRoute) {
      const handled = await svc.ROUTE_dispatchRoute(
        LIBCORE_ENV(),
        { ...route, routeToken: token },
        { reason }
      );
      if (handled) return token === STATE.pageRouteToken;
    }

    if (route.view === 'projects') {
      await LIBCORE_openProjectsViewer(null, { fromRoute: true, baseHref: route.baseHref, routeToken: token });
      return token === STATE.pageRouteToken;
    }

    if (route.view === 'folder') {
      UI_openFolderViewer(route.id, { fromRoute: true, baseHref: route.baseHref });
      return token === STATE.pageRouteToken;
    }

    if (route.view === 'category' || route.view === 'categories') {
      const groups = await CATEGORY_loadGroups();
      if (token !== STATE.pageRouteToken) return false;
      if (route.view === 'categories') {
        UI_openCategoriesViewer(groups, { fromRoute: true, baseHref: route.baseHref });
        return true;
      }
      const group = groups.find((item) => String(item?.id || '') === String(route.id || ''));
      if (group) {
        UI_openCategoryViewer(group, { fromRoute: true, baseHref: route.baseHref });
        return true;
      }
    }

    ROUTE_clearPageRoute();
    if (STATE.pageSession) UI_restoreInShellPage(`route-missing:${reason}`);
    return false;
  }

  function UI_makeFallbackSidebarHeader(labelText) {
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
    btn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
    const label = btn.querySelector('h2.__menu-label');
    if (label) label.textContent = labelText;
    return btn;
  }

  function UI_prepareSidebarSection(existingSection, projectsSection, token, labelText) {
    const projectsHeaderBtn =
      projectsSection?.querySelector?.(':scope > button') ||
      projectsSection?.querySelector?.('button') ||
      null;

    const section = existingSection instanceof HTMLElement ? existingSection : D.createElement('div');
    if (projectsSection?.className) section.className = projectsSection.className;
    else if (!section.className) section.className = 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]';
    section.style.display = '';
    section.setAttribute(ATTR_CGXUI, token);
    section.setAttribute(ATTR_CGXUI_OWNER, SkID);

    let headerBtn = section.querySelector(':scope > button');
    if (projectsHeaderBtn instanceof HTMLElement) {
      const cloned = projectsHeaderBtn.cloneNode(true);
      cloned.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      cloned.removeAttribute('aria-controls');
      if (headerBtn instanceof HTMLElement) headerBtn.replaceWith(cloned);
      else section.insertBefore(cloned, section.firstChild || null);
      headerBtn = cloned;
    } else if (!(headerBtn instanceof HTMLElement)) {
      headerBtn = UI_makeFallbackSidebarHeader(labelText);
      section.insertBefore(headerBtn, section.firstChild || null);
    }

    headerBtn.removeAttribute('data-h2o-sidebar-shell-inert');
    const label = headerBtn.querySelector('h2.__menu-label') || headerBtn.querySelector('h2') || null;
    if (label) label.textContent = labelText;

    let listWrap = section.querySelector(':scope > [data-cgxui-state="section-list"]') ||
      section.querySelector(':scope > [data-h2o-sidebar-shell-list="1"]') ||
      null;
    if (!(listWrap instanceof HTMLElement)) {
      listWrap = D.createElement('div');
      listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
      section.appendChild(listWrap);
    }
    listWrap.removeAttribute('data-h2o-sidebar-shell-list');
    listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');

    if (headerBtn.nextElementSibling !== listWrap) {
      section.insertBefore(listWrap, headerBtn.nextElementSibling || null);
    }

    return { section, headerBtn, listWrap };
  }

  /* Build the Folders section */
  function UI_buildFoldersSection(projectsSection, existingSection = null, reason = 'build') {
    const prepared = UI_prepareSidebarSection(existingSection, projectsSection, UI_FSECTION_ROOT, CFG_FSECTION_LABEL);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    UI_recordShellSeen('folders', section, reason);

    // row templates
    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA   = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const FALLBACK_ROW_CLASS = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      UI_injectIcon(row, iconSvg, { color: opts.color });
      return UI_wireAsButton(row, onClick);
    };

    const makeFolderRow = (text, iconSvg, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      UI_setRowText(row, text);
      UI_injectIcon(row, iconSvg, { color: opts.color });
      return UI_wireAsButton(row, onClick);
    };

    const makeFolderMoreRow = (text, onClick) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      row.classList.add('ps-9');
      row.setAttribute('data-cgxui-state', 'folder-show-more');
      return UI_wireAsButton(row, onClick);
    };

    const makeSubChatRow = (href, text) => {
      const a = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      UI_removeSurfaceChatLeadingIcon(a);
      UI_setRowText(a, UI_cleanSurfaceChatTitle(text));
      return a;
    };

    // independent expand/collapse state
    let expanded = STORE_readUI().foldersExpanded;

    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      UI_syncSectionHeaderArrow(headerBtn, expanded);
    };

    const setExpanded = (v) => {
      expanded = !!v;
      const ui = STORE_readUI();
      ui.foldersExpanded = expanded;
      STORE_writeUI(ui);
      // also keep legacy "h2o:folders:expanded" string key in sync
      UTIL_storage.setStr(KEY_LEG_EXP, expanded ? '1' : '0');
      UTIL_storage.setJSON(KEY_FSECTION_STATE_EXP_V1, { expanded });
      applyExpandedToDOM();
    };

    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const applySeeMoreControl = (renderedFolders = []) => {
      listWrap.querySelectorAll(':scope > [data-cgxui-state="see-more"], :scope > [data-cgxui-state="folders-more"]').forEach((n) => n.remove());

      const groups = [...listWrap.querySelectorAll(':scope > [data-cgxui-state="folder-group"]')];
      const updateKindDividers = () => {
        listWrap.querySelectorAll(':scope > [data-cgxui-state="kind-divider"]').forEach((divider) => {
          let prev = divider.previousElementSibling;
          while (prev && prev.getAttribute('data-cgxui-state') !== 'folder-group') prev = prev.previousElementSibling;
          let next = divider.nextElementSibling;
          while (next && next.getAttribute('data-cgxui-state') !== 'folder-group') next = next.nextElementSibling;

          const prevVisible = !!prev && prev.style.display !== 'none';
          const nextVisible = !!next && next.style.display !== 'none';
          divider.style.display = prevVisible && nextVisible ? '' : 'none';
        });
      };

      if (groups.length <= CFG_SEE_MORE_LIMIT) {
        groups.forEach((g) => (g.style.display = 'contents'));
        updateKindDividers();
        return;
      }

      groups.forEach((g, i) => {
        g.style.display = i < CFG_SEE_MORE_LIMIT ? 'contents' : 'none';
      });
      updateKindDividers();

      const row = makeActionRow('More', FRAG_SVG_MORE, () => {});
      row.setAttribute('data-cgxui-state', 'folders-more');
      row.setAttribute('aria-label', 'More folders');
      row.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI_openFoldersMoreByMode(row, renderedFolders);
      };
      row.onkeydown = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        UI_openFoldersMoreByMode(row, renderedFolders);
      };
      listWrap.appendChild(row);
    };

    const render = () => {
      const data = STORE_readData();
      const ui = STORE_readUI();

      listWrap.replaceChildren();

      // New folder
      listWrap.appendChild(makeActionRow('New folder', FRAG_SVG_ADD, async () => {
        const name = await UI_openNameModal({
          title: 'Create folder',
          placeholder: 'Folder name',
          initialValue: '',
          confirmText: 'Create folder'
        });
        if (!name) return;
        if (UTIL_isReservedFolderViewName(name)) return alert(`${name} is a view, not a folder.`);

        const d = STORE_readData();
        const exists = d.folders.some((f) => (f.name || '').trim().toLowerCase() === name.toLowerCase());
        if (exists) return alert('Folder already exists.');

        const folder = STORE_makeLocalFolderRecord(name);
        d.folders.push(folder);
        d.items[folder.id] = d.items[folder.id] || [];
        STORE_writeData(d);
        EVENT_emitFoldersChanged({
          action: 'folder-create',
          folderId: String(folder.id || ''),
          folderName: String(folder.name || ''),
          source: 'sidebar-folder-create',
        });

        const id = folder.id;

        const u = STORE_readUI();
        if (API_getFolderInlinePreviewOnOpen()) u.openFolders[id] = true;
        STORE_writeUI(u);

        render();
      }));

      const realFolders = data.folders.filter((folder) => !UTIL_isReservedFolderViewName(folder.name));
      const projectFolders = realFolders.filter((folder) => folder.kind === 'project_backed');
      const localFolders = realFolders.filter((folder) => folder.kind !== 'project_backed');
      const folderGroups = [
        projectFolders,
        localFolders,
      ].filter((folders) => folders.length);
      const currentChatHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || '';
      const currentChatId = DOM_parseChatIdFromHref(currentChatHref);
      const renderedFolderRows = [];
      const renderedFolders = [];

      const hrefMatchesCurrentChat = (href) => {
        const value = String(href || '');
        if (!value) return false;
        if (currentChatHref && value === currentChatHref) return true;
        const chatId = DOM_parseChatIdFromHref(value);
        return !!(chatId && currentChatId && chatId === currentChatId);
      };

      const appendKindDivider = () => {
        const divider = D.createElement('div');
        divider.setAttribute('data-cgxui-state', 'kind-divider');
        divider.setAttribute(ATTR_CGXUI_OWNER, SkID);
        listWrap.appendChild(divider);
      };

      // Folder groups
      folderGroups.forEach((folders, groupIndex) => {
        if (groupIndex > 0) appendKindDivider();

        folders.forEach((folder) => {
          renderedFolders.push(folder);
          const inlinePreviewEnabled = ui.folderInlinePreviewOnOpen !== false;
          const isOpen = inlinePreviewEnabled && !!ui.openFolders[folder.id];
          const hrefs = Array.isArray(data.items[folder.id]) ? data.items[folder.id] : [];
          const isActiveFolder = hrefs.some(hrefMatchesCurrentChat);

          const grp = D.createElement('div');
          grp.setAttribute('data-cgxui-state', 'folder-group');
          grp.style.display = 'contents';

          const folderColor = STORE_normalizeProjectColor(folder.iconColor);
          const toggleFolder = () => {
            const u = STORE_readUI();
            u.openFolders[folder.id] = !u.openFolders[folder.id];
            STORE_writeUI(u);
            render();
          };

          const row = makeFolderRow(folder.name, FRAG_SVG_FOLDER, () => {
            UI_openFolderByMode(folder.id);
          }, { color: folderColor });
          if (inlinePreviewEnabled) UI_makeIconToggle(row, isOpen ? 'Hide chats' : 'Show chats', toggleFolder, isOpen);

          // mark row as owned for CSS hover more button
          row.setAttribute(ATTR_CGXUI, UI_FSECTION_FOLDER_ROW);
          row.setAttribute(ATTR_CGXUI_OWNER, SkID);
          row.setAttribute('data-cgxui-folder-id', folder.id);
          renderedFolderRows.push({ row, isActiveFolder });

          const more = D.createElement('button');
          more.type = 'button';
          more.textContent = '⋯';
          more.title = 'Folder actions';
          more.setAttribute(ATTR_CGXUI, UI_FSECTION_FOLDER_MORE);
          more.setAttribute(ATTR_CGXUI_OWNER, SkID);

          more.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI_openFolderPop(more, [
              { type: 'title', label: 'Folder actions' },
              UI_colorGridItem('Color', folderColor, (color) => {
                STORE_setFolderIconColor(folder.id, color);
                render();
              }, true),
              'sep',
              {
                label: 'Open folder',
                onClick: () => UI_openFolderByMode(folder.id),
              },
              'sep',
              {
                label: 'Open in Studio',
                onClick: () => {
                  const hash = `#/saved?folder=${encodeURIComponent(folder.id)}`;
                  H2O.archiveBoot?.openWorkbench?.(hash);
                }
              },
              'sep',
              {
                label: 'Rename folder',
                onClick: async () => {
                  const next = await UI_openNameModal({
                    title: 'Rename folder',
                    placeholder: 'Folder name',
                    initialValue: folder.name || '',
                    confirmText: 'Rename'
                  });
                  if (!next) return;

                  const d = STORE_readData();
                  const exists = d.folders.some((f) =>
                    f.id !== folder.id && (f.name || '').trim().toLowerCase() === next.toLowerCase()
                  );
                  if (exists) return alert('Folder already exists.');

                  const target = d.folders.find((f) => f.id === folder.id);
                  if (target) {
                    const previousName = String(target.name || '');
                    target.name = next;
                    target.updatedAt = STORE_nowStamp();
                    STORE_writeData(d);
                    EVENT_emitFoldersChanged({
                      action: 'folder-rename',
                      folderId: String(target.id || folder.id || ''),
                      folderName: String(target.name || ''),
                      previousFolderName: previousName,
                      source: 'sidebar-folder-rename',
                    });
                  }
                  render();
                }
              },
              'sep',
              {
                label: 'Delete folder',
                danger: true,
                onClick: () => {
                  const ok = confirm(`Delete folder "${folder.name}"?`);
                  if (!ok) return;

                  const d = STORE_readData();
                  const existingItems = Array.isArray(d.items?.[folder.id]) ? d.items[folder.id] : [];
                  d.folders = d.folders.filter((f) => f.id !== folder.id);
                  delete d.items[folder.id];
                  STORE_writeData(d);
                  EVENT_emitFoldersChanged({
                    action: 'folder-delete',
                    folderId: String(folder.id || ''),
                    folderName: String(folder.name || ''),
                    affectedCount: existingItems.length,
                    source: 'sidebar-folder-delete',
                  });

                  const u = STORE_readUI();
                  delete u.openFolders[folder.id];
                  STORE_writeUI(u);

                  render();
                }
              }
            ]);
          };

          row.appendChild(more);

          const trunc = row.querySelector?.(SEL.sidebarTruncate);
          if (trunc && ui.showFolderCounts !== false) {
            const span = D.createElement('span');
            span.style.opacity = '.6';
            span.style.marginLeft = '8px';
            span.style.fontSize = '12px';
            span.textContent = `(${hrefs.length})`;
            trunc.parentElement?.appendChild(span);
          }

          grp.appendChild(row);

          if (isOpen) {
            const previewHrefs = hrefs.slice(0, CFG_FOLDER_CHAT_PREVIEW_LIMIT);
            previewHrefs.forEach((fullHref) => {
              const title = DOM_findChatTitleInSidebarByHref(fullHref);
              const fallbackId = DOM_parseChatIdFromHref(fullHref);
              const label = title ? title : (fallbackId || fullHref);
              grp.appendChild(makeSubChatRow(fullHref, label));
            });
            if (hrefs.length > CFG_FOLDER_CHAT_PREVIEW_LIMIT) {
              grp.appendChild(makeFolderMoreRow('Show more', () => UI_openFolderByMode(folder.id)));
            }
          }

          listWrap.appendChild(grp);
        });
      });

      let activeFolderMarked = false;
      renderedFolderRows.forEach(({ row, isActiveFolder }) => {
        if (isActiveFolder && !activeFolderMarked) {
          row.setAttribute('aria-current', 'true');
          activeFolderMarked = true;
        } else {
          row.removeAttribute('aria-current');
        }
      });

      applySeeMoreControl(renderedFolders);
      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);

    // store render function on owned root (no raw "h2o" fields)
    section._cgxuiRender = render;

    render();
    applyExpandedToDOM();
    UI_recordHydrated('folders', section, reason);

    return section;
  }

    /* Phase C8: moved to 0F4a — function UI_buildCategoriesSection */

  function UI_buildCategoriesSection_LOCAL(projectsSection) {
    const projectsHeaderBtn =
      projectsSection.querySelector(':scope > button') ||
      projectsSection.querySelector('button');

    if (!projectsHeaderBtn) return null;

    const section = D.createElement('div');
    section.className = projectsSection.className;
    section.style.display = 'none';

    section.setAttribute(ATTR_CGXUI, UI_FSECTION_CATEGORIES_ROOT);
    section.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const headerBtn = projectsHeaderBtn.cloneNode(true);
    headerBtn.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    headerBtn.removeAttribute('aria-controls');

    const label = headerBtn.querySelector('h2.__menu-label');
    if (label) label.textContent = CFG_CATEGORIES_LABEL;

    const listWrap = D.createElement('div');

    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA   = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const FALLBACK_ROW_CLASS = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      UI_injectIcon(row, iconSvg, { color: opts.color });
      return UI_wireAsButton(row, onClick);
    };

    const makeCategoryRow = (group, onOpen, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      UI_setRowText(row, group?.name || 'Category');
      const appearance = opts.appearance || STORE_getCategoryAppearance(group);
      UI_injectIcon(row, UI_categoryIconSvg(appearance.icon), { color: appearance.color });
      UI_wireAsButton(row, onOpen);
      if (typeof opts.onToggle === 'function') {
        UI_makeIconToggle(row, opts.isOpen ? 'Hide chats' : 'Show chats', opts.onToggle, !!opts.isOpen);
      }
      return row;
    };

    const makeCategoryMoreRow = (text, onClick, opts = {}) => {
      const row = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'div');
      UI_setRowText(row, text);
      if (opts.indent) row.classList.add('ps-9');
      else UI_injectIcon(row, FRAG_SVG_MORE);
      return UI_wireAsButton(row, onClick);
    };

    const makeSubChatRow = (href, text) => {
      const a = UI_makeRowShell(tplDiv, tplA, FALLBACK_ROW_CLASS, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      UI_removeSurfaceChatLeadingIcon(a);
      UI_setRowText(a, UI_cleanSurfaceChatTitle(text));
      return a;
    };

    let expanded = STORE_readUI().categoriesExpanded;
    let renderToken = 0;

    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      UI_syncSectionHeaderArrow(headerBtn, expanded);
    };

    const setExpanded = (v) => {
      expanded = !!v;
      const ui = STORE_readUI();
      ui.categoriesExpanded = expanded;
      STORE_writeUI(ui);
      applyExpandedToDOM();
    };

    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const render = async () => {
      const token = ++renderToken;
      const ui = STORE_readUI();
      listWrap.replaceChildren();
      listWrap.appendChild(makeActionRow('New category', FRAG_SVG_ADD, async () => {
        const name = await UI_openNameModal({
          title: 'Create category',
          placeholder: 'Category name',
          initialValue: '',
          confirmText: 'Create category',
        });
        if (!name) return;

        if (typeof H2O.archiveBoot?.createCategory !== 'function') {
          alert('Category creation is not available yet.');
          return;
        }
        H2O.archiveBoot.createCategory(name);
        render();
      }));

      let groups = [];
      try {
        groups = await CATEGORY_loadGroups();
      } catch (e) {
        DIAG_err('renderCategories', e);
        groups = [];
      }
      if (token !== renderToken) return;

      if (!groups.length) {
        section.style.display = '';
        applyExpandedToDOM();
        return;
      }

      section.style.display = '';

      const currentChatHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || '';
      const currentChatId = DOM_parseChatIdFromHref(currentChatHref);
      let activeCategoryMarked = false;
      const previewGroups = groups.slice(0, CFG_CATEGORY_PREVIEW_LIMIT);

      previewGroups.forEach((group) => {
        const inlinePreviewEnabled = ui.categoryInlinePreviewOnOpen !== false;
        const isOpen = inlinePreviewEnabled && !!ui.openCategories[group.id];
        const appearance = STORE_getCategoryAppearance(group, ui);
        const grp = D.createElement('div');
        grp.setAttribute('data-cgxui-state', 'category-group');
        grp.style.display = 'contents';

        const toggleCategory = () => {
          const u = STORE_readUI();
          u.openCategories[group.id] = !u.openCategories[group.id];
          STORE_writeUI(u);
          render();
        };

        const row = makeCategoryRow(group, () => {
          UI_openCategoryByMode(group);
        }, {
          appearance,
          isOpen,
          onToggle: inlinePreviewEnabled ? toggleCategory : null,
        });
        row.setAttribute(ATTR_CGXUI, UI_FSECTION_CATEGORY_ROW);
        row.setAttribute(ATTR_CGXUI_OWNER, SkID);
        row.setAttribute('data-cgxui-category-id', group.id);

        const isActiveCategory = !!currentChatId && group.rows.some((item) => item.chatId === currentChatId);
        if (isActiveCategory && !activeCategoryMarked) {
          row.setAttribute('aria-current', 'true');
          activeCategoryMarked = true;
        }

        const trunc = row.querySelector?.(SEL.sidebarTruncate);
        if (trunc && ui.showCategoryCounts !== false) {
          const span = D.createElement('span');
          span.style.opacity = '.6';
          span.style.marginLeft = '8px';
          span.style.fontSize = '12px';
          span.textContent = `(${group.rows.length})`;
          trunc.parentElement?.appendChild(span);
        }

        const more = D.createElement('button');
        more.type = 'button';
        more.textContent = '⋯';
        more.title = 'Category appearance';
        more.setAttribute(ATTR_CGXUI, UI_FSECTION_CATEGORY_MORE);
        more.setAttribute(ATTR_CGXUI_OWNER, SkID);
        more.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          UI_openCategoryAppearanceEditor(more, group, render);
        };
        row.appendChild(more);

        grp.appendChild(row);

        if (isOpen) {
          const previewRows = group.rows.slice(0, CFG_CATEGORY_CHAT_PREVIEW_LIMIT);
          previewRows.forEach((item) => {
            grp.appendChild(makeSubChatRow(item.href, item.title));
          });
          if (group.rows.length > CFG_CATEGORY_CHAT_PREVIEW_LIMIT) {
            const moreRow = makeCategoryMoreRow('Show more', () => UI_openCategoryByMode(group), { indent: true });
            moreRow.setAttribute('data-cgxui-state', 'category-show-more');
            grp.appendChild(moreRow);
          }
        }

        listWrap.appendChild(grp);
      });

      if (groups.length > CFG_CATEGORY_PREVIEW_LIMIT) {
        const moreRow = makeCategoryMoreRow('More', () => {});
        moreRow.setAttribute('data-cgxui-state', 'categories-more');
        moreRow.setAttribute('aria-label', 'More categories');
        moreRow.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          UI_openCategoriesMoreByMode(moreRow, groups);
        };
        moreRow.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          UI_openCategoriesMoreByMode(moreRow, groups);
        };
        listWrap.appendChild(moreRow);
      }

      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);

    section._cgxuiRender = render;

    render();
    applyExpandedToDOM();

    return section;
  }

  /* Assign menu (Shift+Right-click) */
  function UI_closeAssignMenu() {
    if (STATE.menuEl) SAFE_remove(STATE.menuEl);
    STATE.menuEl = null;
  }

  function UI_openAssignMenu(x, y, fullHref) {
    UI_ensureStyle();
    UI_closeAssignMenu();

    STORE_seedIfEmpty();
    const d = STORE_readData();

    const m = D.createElement('div');
    m.setAttribute(ATTR_CGXUI, UI_FSECTION_MENU);
    m.setAttribute(ATTR_CGXUI_OWNER, SkID);

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'muted');
    head.textContent = 'Add/Remove chat in folders';
    m.appendChild(head);

    const sep = D.createElement('div');
    sep.setAttribute(ATTR_CGXUI, UI_FSECTION_SEP);
    sep.setAttribute(ATTR_CGXUI_OWNER, SkID);
    m.appendChild(sep);

    d.folders.forEach((f) => {
      const arr = Array.isArray(d.items[f.id]) ? d.items[f.id] : [];
      const inFolder = arr.includes(fullHref);

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `${UTIL_escHtml(f.name)} <span style="margin-left:auto;opacity:.7;">${inFolder ? '✓' : ''}</span>`;

      btn.onclick = () => {
        const result = API_setBinding(fullHref, inFolder ? '' : f.id, { source: 'sidebar-assign-menu' });
        if (result?.status === 'chat-not-saved') {
          UI_openSaveBeforeFolderModal({
            chatId: result.chatId,
            href: result.href,
            folderId: f.id,
            folderName: f.name,
          });
          return;
        }
        UI_closeAssignMenu();
        ENGINE_rerenderAllSections();
      };

      m.appendChild(btn);
    });

    D.body.appendChild(m);
    CLEAN.nodes.add(m);
    STATE.menuEl = m;

    // position
    const pad = 8;
    const r = m.getBoundingClientRect();
    let left = x, top = y;
    if (left + r.width > innerWidth - pad) left = innerWidth - r.width - pad;
    if (top + r.height > innerHeight - pad) top = innerHeight - r.height - pad;
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;

    // outside click close
    setTimeout(() => {
      const onDoc = (e) => {
        if (!STATE.menuEl) return;
        if (!STATE.menuEl.contains(e.target)) UI_closeAssignMenu();
      };
      D.addEventListener('mousedown', onDoc, true);
      CLEAN.listeners.add(() => D.removeEventListener('mousedown', onDoc, true));
    }, 0);
  }

  /* Radix "..." menu injection: Add "Add to Folder" item */
  function ENGINE_injectAddToFolder(menuEl) {
    if (!menuEl) return;

    // fallback capture: current chat
    if (!STATE.lastChatHrefForMenu) {
      const a = D.querySelector(SEL.currentChatAnchor);
      if (a) STATE.lastChatHrefForMenu = a.getAttribute('href') || '';
    }

    if (menuEl.querySelector(`[${ATTR_CGXUI}="${SkID}-add-to-folder"]`)) return;

    const moveItem = DOM_findMenuItemByText(menuEl, /move to project/i);
    if (!moveItem) return;

    const href = STATE.lastChatHrefForMenu;
    if (!href) return;

    const addItem = moveItem.cloneNode(true);
    addItem.setAttribute(ATTR_CGXUI, `${SkID}-add-to-folder`);
    DOM_setMenuItemLabel(addItem, 'Add to Folder');

    addItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = addItem.getBoundingClientRect();
      UI_openAssignMenu(r.right + 6, Math.max(8, r.top - 8), href);
    }, true);

    moveItem.parentNode.insertBefore(addItem, moveItem.nextSibling);
  }

  /* Minimal viewer (kept feature; storage key preserved as-is) */
  const KEY_LEG_VIEWER_STORE = 'h2o:folders:v1';

  function DOM_hasClassTokens(el, tokens) {
    const cls = String(el?.className || '');
    return tokens.every((token) => cls.split(/\s+/).includes(token));
  }

  function DOM_classText(el) {
    return String(el?.className || '');
  }

  function DOM_isScrollPageHost(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cls = DOM_classText(el);
    return cls.includes('group/scroll-root') ||
           (cls.includes('overflow-y-auto') && cls.includes('flex-col') && cls.includes('min-h-0'));
  }

  function DOM_resolveRightPanePageHost() {
    const main = D.querySelector('main');
    if (main instanceof HTMLElement) {
      const candidates = [main, ...main.querySelectorAll('div')];
      const scrollRoot = candidates.find((el) => DOM_isScrollPageHost(el));
      if (scrollRoot instanceof HTMLElement) return scrollRoot;
      return main;
    }

    const thread =
      main?.closest?.('#thread') ||
      D.getElementById('thread');
    const composer = thread?.parentElement || null;
    const shell = composer?.parentElement || null;
    if (shell instanceof HTMLElement && DOM_hasClassTokens(shell, ['relative', 'grow', 'grid'])) return shell;
    if (composer instanceof HTMLElement && (
      String(composer.className || '').includes('composer-parent') ||
      composer.getAttribute('role') === 'presentation'
    )) return composer;
    if (thread instanceof HTMLElement) return thread;
    return main instanceof HTMLElement ? main : null;
  }

  function UI_makePageHostRoot(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.UI_makePageHostRoot) return svc.UI_makePageHostRoot(LIBCORE_ENV(), ...args);
  return UI_makePageHostRoot_LOCAL(...args);
}

function UI_makePageHostRoot_LOCAL(meta = {}) {
    const root = D.createElement('div');
    root.setAttribute(ATTR_CGXUI, UI_FSECTION_PAGE_HOST);
    root.setAttribute(ATTR_CGXUI_OWNER, SkID);
    root.setAttribute('data-cgxui-page-kind', String(meta.kind || 'library'));
    root.setAttribute('data-cgxui-page-title', String(meta.title || ''));
    root.setAttribute('role', 'main');
    root.setAttribute('aria-label', String(meta.title || 'Library page'));
    return root;
  }

  function PAGEHOST_replaceCurrentPage(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.PAGEHOST_replaceCurrentPage) return svc.PAGEHOST_replaceCurrentPage(LIBCORE_ENV(), ...args);
  return PAGEHOST_replaceCurrentPage_LOCAL(...args);
}

function PAGEHOST_replaceCurrentPage_LOCAL(pageEl, meta = {}) {
    const session = STATE.pageSession;
    const root = session?.root;
    if (!session || !(root instanceof HTMLElement) || !root.isConnected || !(pageEl instanceof HTMLElement)) return false;

    while (root.firstChild) root.removeChild(root.firstChild);
    root.setAttribute('data-cgxui-page-kind', String(meta.kind || session.kind || 'library'));
    root.setAttribute('data-cgxui-page-title', String(meta.title || session.title || ''));
    root.setAttribute('aria-label', String(meta.title || session.title || 'Library page'));
    root.appendChild(pageEl);

    session.pageEl = pageEl;
    session.kind = String(meta.kind || session.kind || 'library');
    session.title = String(meta.title || session.title || '');
    session.replacedAt = Date.now();
    STATE.pageEl = pageEl;
    STATE.pageHost = session.host;
    return true;
  }

  function PAGEHOST_restorePreviousPage(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.PAGEHOST_restorePreviousPage) return svc.PAGEHOST_restorePreviousPage(LIBCORE_ENV(), ...args);
  return PAGEHOST_restorePreviousPage_LOCAL(...args);
}

function PAGEHOST_restorePreviousPage_LOCAL(reason = 'restore') {
    const session = STATE.pageSession;
    if (session) {
      const host = session.host;
      const root = session.root;
      const fragment = session.fragment;

      try { CLEAN.nodes.delete?.(root); } catch {}
      if (root instanceof Node) SAFE_remove(root);

      if (host instanceof HTMLElement && host.isConnected && fragment instanceof DocumentFragment) {
        while (fragment.firstChild) host.appendChild(fragment.firstChild);
      }

      STATE.pageSession = null;
      STATE.pageEl = null;
      STATE.pageHost = null;
      STATE.pageHiddenRecords = [];
      ROUTE_clearPageRoute();
      return;
    }

    const pageEl = STATE.pageEl;
    if (pageEl) {
      try { CLEAN.nodes.delete?.(pageEl); } catch {}
      SAFE_remove(pageEl);
    }
    const records = Array.isArray(STATE.pageHiddenRecords) ? STATE.pageHiddenRecords : [];
    records.forEach((record) => {
      const el = record?.el;
      if (!(el instanceof HTMLElement)) return;
      try {
        el.style.display = record.display || '';
        if (record.ariaHidden == null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', record.ariaHidden);
        el.removeAttribute(ATTR_CGXUI_PAGE_HIDDEN);
      } catch {}
    });

    STATE.pageEl = null;
    STATE.pageHost = null;
    STATE.pageHiddenRecords = [];
    ROUTE_clearPageRoute();
  }

  function UI_restoreInShellPage(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.UI_restoreInShellPage) return svc.UI_restoreInShellPage(LIBCORE_ENV(), ...args);
  return UI_restoreInShellPage_LOCAL(...args);
}

function UI_restoreInShellPage_LOCAL(reason = 'restore') {
    PAGEHOST_restorePreviousPage(reason);
  }

  function UI_closeViewer(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.UI_closeViewer) return svc.UI_closeViewer(LIBCORE_ENV(), ...args);
  return UI_closeViewer_LOCAL(...args);
}

function UI_closeViewer_LOCAL() {
    UI_restoreInShellPage();
    if (STATE.viewerEl) SAFE_remove(STATE.viewerEl);
    STATE.viewerEl = null;
  }

  function PAGEHOST_enterPage(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.PAGEHOST_enterPage) return svc.PAGEHOST_enterPage(LIBCORE_ENV(), ...args);
  return PAGEHOST_enterPage_LOCAL(...args);
}

function PAGEHOST_enterPage_LOCAL(pageEl) {
    const host = DOM_resolveRightPanePageHost();
    if (!host || !(pageEl instanceof HTMLElement)) return false;

    if (STATE.viewerEl) {
      SAFE_remove(STATE.viewerEl);
      STATE.viewerEl = null;
    }

    const currentSession = STATE.pageSession;
    if (currentSession?.host === host && currentSession?.root instanceof HTMLElement && currentSession.root.isConnected) {
      return PAGEHOST_replaceCurrentPage(pageEl, {
        kind: pageEl.getAttribute('data-cgxui-page-kind') || 'library',
        title: pageEl.getAttribute('data-cgxui-page-title') || '',
      });
    }

    UI_restoreInShellPage('enter-new-host');

    const fragment = D.createDocumentFragment();
    const previousNodes = [];
    while (host.firstChild) {
      const node = host.firstChild;
      previousNodes.push(node);
      fragment.appendChild(node);
    }

    const root = UI_makePageHostRoot({
      kind: pageEl.getAttribute('data-cgxui-page-kind') || 'library',
      title: pageEl.getAttribute('data-cgxui-page-title') || '',
    });
    root.appendChild(pageEl);
    host.appendChild(root);
    CLEAN.nodes.add(root);

    STATE.pageSeq += 1;
    STATE.pageSession = {
      id: `${SkID}:page:${STATE.pageSeq}`,
      host,
      root,
      pageEl,
      fragment,
      previousNodes,
      kind: root.getAttribute('data-cgxui-page-kind') || 'library',
      title: root.getAttribute('data-cgxui-page-title') || '',
      enteredAt: Date.now(),
      url: W.location.href,
    };
    STATE.pageEl = pageEl;
    STATE.pageHost = host;
    STATE.pageHiddenRecords = [];
    return true;
  }

  function UI_mountInShellPage(...args) {
  const svc = LIBCORE_getPageHostService();
  if (svc?.UI_mountInShellPage) return svc.UI_mountInShellPage(LIBCORE_ENV(), ...args);
  return UI_mountInShellPage_LOCAL(...args);
}

function UI_mountInShellPage_LOCAL(pageEl) {
    return PAGEHOST_enterPage(pageEl);
  }

  function UI_makeViewerShell(...args) {
  const svc = LIBCORE_getUiShellService();
  if (svc?.UI_makeViewerShell) return svc.UI_makeViewerShell(LIBCORE_ENV(), ...args);
  return UI_makeViewerShell_LOCAL(...args);
}

function UI_makeViewerShell_LOCAL(titleText, subText, opts = {}) {
    const mode = STORE_normalizeCategoryOpenMode(opts.mode);
    const box = D.createElement('div');
    box.setAttribute(ATTR_CGXUI, UI_FSECTION_VIEWER);
    box.setAttribute(ATTR_CGXUI_OWNER, SkID);
    box.setAttribute(ATTR_CGXUI_MODE, mode);

    const page = D.createElement('div');
    page.setAttribute(ATTR_CGXUI_STATE, 'page');

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');

    const titleWrap = D.createElement('div');
    titleWrap.style.minWidth = '0';
    const ttl = D.createElement('div');
    ttl.setAttribute(ATTR_CGXUI_STATE, 'title');
    ttl.textContent = titleText;
    titleWrap.appendChild(ttl);

    if (subText) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = subText;
      titleWrap.appendChild(sub);
    }

    const x = D.createElement('button');
    x.type = 'button';
    x.setAttribute(ATTR_CGXUI_STATE, 'close');
    x.setAttribute('aria-label', 'Close');
    x.textContent = '✕';
    x.onclick = UI_closeViewer;

    if (opts.iconSvg) head.appendChild(UI_makePanelIcon(opts.iconSvg, opts.iconColor, {
      label: opts.iconLabel,
      onClick: opts.onIconClick,
    }));
    head.appendChild(titleWrap);
    head.appendChild(x);

    const list = D.createElement('div');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');

    page.appendChild(head);
    page.appendChild(list);
    box.appendChild(page);

    return { box, list };
  }

  function UI_makePanelIcon(...args) {
  const svc = LIBCORE_getUiShellService();
  if (svc?.UI_makePanelIcon) return svc.UI_makePanelIcon(LIBCORE_ENV(), ...args);
  return UI_makePanelIcon_LOCAL(...args);
}

function UI_makePanelIcon_LOCAL(svg, color, opts = {}) {
    const icon = D.createElement(typeof opts.onClick === 'function' ? 'button' : 'span');
    if (icon.tagName === 'BUTTON') {
      icon.type = 'button';
      icon.setAttribute('aria-label', opts.label || 'Edit appearance');
      icon.title = opts.label || 'Edit appearance';
      icon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onClick?.(icon);
      };
    }
    icon.setAttribute(ATTR_CGXUI_STATE, 'panel-icon');
    icon.style.color = STORE_normalizeHexColor(color) || 'currentColor';
    icon.innerHTML = svg || FRAG_SVG_CATEGORY;
    return icon;
  }

  function UI_makeInShellPageShell(...args) {
  const svc = LIBCORE_getUiShellService();
  if (svc?.UI_makeInShellPageShell) return svc.UI_makeInShellPageShell(LIBCORE_ENV(), ...args);
  return UI_makeInShellPageShell_LOCAL(...args);
}

function UI_makeInShellPageShell_LOCAL(titleText, subText, tabText = 'Chats', opts = {}) {
    const page = D.createElement('div');
    page.setAttribute(ATTR_CGXUI, UI_FSECTION_PAGE);
    page.setAttribute(ATTR_CGXUI_OWNER, SkID);
    page.setAttribute('data-cgxui-page-kind', String(opts.kind || 'library'));
    page.setAttribute('data-cgxui-page-id', String(opts.id || ''));
    page.setAttribute('data-cgxui-page-title', String(titleText || 'Library'));
    page.className = '[--thread-content-max-width:40rem] @w-lg/main:[--thread-content-max-width:48rem] mx-auto max-w-(--thread-content-max-width) flex-1 grid h-full [width:min(90cqw,var(--thread-content-max-width))]';

    const top = D.createElement('div');
    top.setAttribute(ATTR_CGXUI_STATE, 'top');

    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');

    const titleWrap = D.createElement('div');
    titleWrap.style.minWidth = '0';

    const titleRow = D.createElement('div');
    titleRow.setAttribute(ATTR_CGXUI_STATE, 'title-row');

    const icon = D.createElement('div');
    icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
    icon.style.color = STORE_normalizeHexColor(opts.iconColor) || 'currentColor';
    icon.innerHTML = opts.iconSvg || FRAG_SVG_CATEGORY;
    if (typeof opts.onIconClick === 'function') {
      icon.setAttribute('role', 'button');
      icon.setAttribute('tabindex', '0');
      icon.setAttribute('aria-label', opts.iconLabel || 'Edit appearance');
      icon.title = opts.iconLabel || 'Edit appearance';
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        opts.onIconClick(icon);
      };
      icon.onclick = fire;
      icon.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') fire(e);
      };
    }

    const h1 = D.createElement('h1');
    h1.textContent = titleText;

    titleRow.appendChild(icon);
    titleRow.appendChild(h1);
    titleWrap.appendChild(titleRow);

    if (subText) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = subText;
      titleWrap.appendChild(sub);
    }

    head.appendChild(titleWrap);

    const tabs = D.createElement('div');
    tabs.setAttribute(ATTR_CGXUI_STATE, 'tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Category sections');

    const tab = D.createElement('button');
    tab.type = 'button';
    tab.setAttribute(ATTR_CGXUI_STATE, 'tab');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'true');
    tab.textContent = tabText;
    tabs.appendChild(tab);

    const addViewAction = (label, route) => {
      const btn = D.createElement('button');
      btn.type = 'button';
      btn.setAttribute(ATTR_CGXUI_STATE, 'view-action');
      btn.textContent = label;
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        H2O.archiveBoot?.openWorkbench?.(route);
      };
      tabs.appendChild(btn);
    };
    addViewAction('Pinned', '#/pinned');
    addViewAction('Archive', '#/archive');
    if (opts.kind === 'projects') {
      const refreshBtn = D.createElement('button');
      refreshBtn.type = 'button';
      refreshBtn.setAttribute(ATTR_CGXUI_STATE, 'view-action');
      refreshBtn.setAttribute('data-cgxui-projects-refresh', '1');
      const refreshState = STATE.projectsManualRefreshRunning ? 'loading' : Date.now() < STATE.projectsManualRefreshDoneUntil ? 'done' : 'idle';
      LIBCORE_setProjectsRefreshButtonState(refreshBtn, refreshState);
      if (refreshState === 'done') {
        const timer = W.setTimeout(() => {
          if (refreshBtn.isConnected && !STATE.projectsManualRefreshRunning) LIBCORE_setProjectsRefreshButtonState(refreshBtn, 'idle');
        }, Math.max(0, STATE.projectsManualRefreshDoneUntil - Date.now()));
        CLEAN.timers.add(timer);
      }
      refreshBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        LIBCORE_handleProjectsManualRefresh(refreshBtn);
      };
      tabs.appendChild(refreshBtn);
    }

    top.appendChild(head);
    top.appendChild(tabs);

    const list = D.createElement('ol');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');
    list.setAttribute('aria-busy', 'false');

    page.appendChild(top);
    page.appendChild(list);

    return { page, list };
  }

  function UI_appendViewerChatRow(list, item) {
    const row = D.createElement('a');
    row.href = item.href;
    row.setAttribute(ATTR_CGXUI_STATE, 'row');

    const body = D.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = UI_cleanSurfaceChatTitle(item.title || item.chatId || item.href);
    body.appendChild(title);

    if (item.updatedAt || item.chatId) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
      sub.textContent = item.updatedAt || item.chatId;
      body.appendChild(sub);
    }

    row.appendChild(body);
    list.appendChild(row);
  }

    /* Phase C8: moved to 0F4a — function UI_appendPanelCategoryRow */

  function UI_appendInShellChatRow(list, item) {
    const li = D.createElement('li');
    li.className = 'group/project-item hover:bg-token-interactive-bg-secondary-hover active:bg-token-interactive-bg-secondary-press flex min-h-16 cursor-pointer items-center p-3 text-sm select-none';

    const row = D.createElement('a');
    row.href = item.href;
    row.draggable = false;
    row.className = 'block min-w-0 grow';
    row.setAttribute('data-discover', 'true');
    row.addEventListener('click', () => {
      W.setTimeout(() => UI_closeViewer(), 0);
    }, true);

    const body = D.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = UI_cleanSurfaceChatTitle(item.title || item.chatId || item.href);
    body.appendChild(title);

    const sub = D.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = item.updatedAt || item.chatId || '';
    body.appendChild(sub);

    row.appendChild(body);

    if (item.updatedAt) {
      const date = D.createElement('span');
      date.setAttribute(ATTR_CGXUI_STATE, 'row-date');
      date.setAttribute('aria-hidden', 'true');
      date.textContent = item.updatedAt;
      row.appendChild(date);
    }

    li.appendChild(row);
    list.appendChild(li);
  }

  function UI_appendInShellFolderRow(list, folder) {
    const li = D.createElement('li');
    li.className = 'group/project-item hover:bg-token-interactive-bg-secondary-hover active:bg-token-interactive-bg-secondary-press flex min-h-16 cursor-pointer items-center p-3 text-sm select-none';

    const btn = D.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI_STATE, 'category-button');
    btn.onclick = () => UI_openFolderViewer(folder.id);

    const icon = D.createElement('span');
    icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
    icon.style.color = STORE_normalizeProjectColor(folder.iconColor) || 'currentColor';
    icon.innerHTML = FRAG_SVG_FOLDER;
    btn.appendChild(icon);

    const body = D.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = folder.name || folder.id || 'Folder';
    body.appendChild(title);

    const hrefs = Array.isArray(STORE_readData().items?.[folder.id]) ? STORE_readData().items[folder.id] : [];
    const sub = D.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = `${hrefs.length} chats`;
    body.appendChild(sub);

    btn.appendChild(body);
    li.appendChild(btn);
    list.appendChild(li);
  }

    /* Phase C8: moved to 0F4a — function UI_appendInShellCategoryRow */

  function UI_openFoldersViewer(foldersRaw = null) {
    UI_ensureStyle();

    const allFolders = STORE_readData().folders.filter((folder) => !UTIL_isReservedFolderViewName(folder.name));
    const folders = Array.isArray(foldersRaw) ? foldersRaw.filter(Boolean) : allFolders;
    const { page, list } = UI_makeInShellPageShell('Folders', `${folders.length} folders`, 'Chats', {
      kind: 'folders',
      iconSvg: FRAG_SVG_FOLDER,
    });
    folders.forEach((folder) => UI_appendInShellFolderRow(list, folder));

    if (!UI_mountInShellPage(page)) {
      UI_closeViewer();
      const { box, list: fallbackList } = UI_makeViewerShell('Folders', `${folders.length} folders`, { mode: CFG_CATEGORY_OPEN_MODE_PANEL });
      folders.forEach((folder) => {
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.onclick = () => UI_openFolderByMode(folder.id);
        const body = D.createElement('div');
        body.style.minWidth = '0';
        body.style.flex = '1 1 auto';
        const title = D.createElement('div');
        title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
        title.textContent = folder.name || folder.id || 'Folder';
        body.appendChild(title);
        btn.appendChild(body);
        fallbackList.appendChild(btn);
      });
      D.body.appendChild(box);
      CLEAN.nodes.add(box);
      STATE.viewerEl = box;
    }
  }

  function UI_getFolderSurfaceData(folderId) {
    const id = String(folderId || '').trim();
    let store = UTIL_storage.getJSON(KEY_LEG_VIEWER_STORE, {});
    if (!store || typeof store !== 'object') store = {};
    const folders = store.folders || [];
    const chatToFolders = store.chatToFolders || {};
    const data = STORE_readData();

    const currentDataFolder = data.folders.find((f) => f.id === id) || null;
    const folder = currentDataFolder || folders.find((f) => f.id === id) || null;
    const title = folder ? folder.name : id;

    let hrefs = Array.isArray(data.items?.[id]) ? data.items[id] : [];
    if (!hrefs.length) {
      hrefs = Object.entries(chatToFolders)
        .filter(([, ids]) => Array.isArray(ids) && ids.includes(id))
        .map(([href]) => href);
    }

    hrefs = [...new Set(hrefs.map((href) => String(href || '').trim()).filter(Boolean))];
    const chats = hrefs.map((href) => {
      const chatId = DOM_parseChatIdFromHref(href);
      return {
        href,
        chatId,
        title: DOM_findChatTitleInSidebarByHref(href) || DOM_getChatTitleFromSidebar(href) || chatId || href,
      };
    });

    return { folder, title, chats };
  }

  function UI_openFolderPanel(folderId) {
    UI_ensureStyle();

    const { folder, title, chats } = UI_getFolderSurfaceData(folderId);

    UI_closeViewer();

    const folderColor = STORE_normalizeProjectColor(folder?.iconColor);
    const { box, list } = UI_makeViewerShell(`Folder: ${title}`, `${chats.length} chats`, {
      mode: CFG_CATEGORY_OPEN_MODE_PANEL,
      iconSvg: FRAG_SVG_FOLDER,
      iconColor: folderColor,
      iconLabel: 'Edit folder color',
      onIconClick: (anchor) => {
        if (!folder) return;
        UI_openFolderAppearanceEditor(anchor, folder, () => UI_openFolderPanel(folderId));
      },
    });
    chats.forEach((c) => UI_appendViewerChatRow(list, c));

    D.body.appendChild(box);
    CLEAN.nodes.add(box);
    STATE.viewerEl = box;
  }

  function UI_openFolderViewer(folderId, opts = {}) {
    UI_ensureStyle();

    const { folder, title, chats } = UI_getFolderSurfaceData(folderId);
    const folderColor = STORE_normalizeProjectColor(folder?.iconColor);
    const { page, list } = UI_makeInShellPageShell(`Folder: ${title}`, `${chats.length} chats in this folder`, 'Chats', {
      kind: 'folder',
      id: folderId,
      iconSvg: FRAG_SVG_FOLDER,
      iconColor: folderColor,
      iconLabel: 'Edit folder color',
      onIconClick: (anchor) => {
        if (!folder) return;
        UI_openFolderAppearanceEditor(anchor, folder, () => UI_openFolderViewer(folderId, { skipHistory: true }));
      },
    });
    chats.forEach((c) => UI_appendInShellChatRow(list, c));

    if (UI_mountInShellPage(page)) ROUTE_commitPageRoute({ view: 'folder', id: folderId }, opts);
    else UI_openFolderPanel(folderId);
  }

  function UI_openFolderByMode(folderId) {
    if (API_getFolderOpenMode() === CFG_CATEGORY_OPEN_MODE_PAGE) UI_openFolderViewer(folderId);
    else UI_openFolderPanel(folderId);
  }

    /* Phase C8: moved to 0F4a — function UI_openCategoryViewer */

    /* Phase C8: moved to 0F4a — function UI_openCategoryPanel */

    /* Phase C8: moved to 0F4a — function UI_openCategoryByMode */

    /* Phase C8: moved to 0F4a — function UI_openCategoriesViewer */

    /* Phase C8: moved to 0F4a — function UI_openCategoriesPanel */

    /* Phase C8: moved to 0F4a — function UI_openCategoriesByMode */

  function CATEGORY_getActivePageContext() {
    const page = STATE.pageEl;
    return {
      connected: !!(page && page.isConnected),
      kind: String(page?.getAttribute?.('data-cgxui-page-kind') || ''),
      id: String(page?.getAttribute?.('data-cgxui-page-id') || ''),
    };
  }

  async function UI_refreshActivePageForAppearance(kind, id) {
    const targetKind = String(kind || '');
    const targetId = String(id || '');
    const page = CATEGORY_getActivePageContext();
    if (!page.connected) return;

    if (targetKind === 'folder') {
      if (page.kind === 'folder' && page.id === targetId) {
        UI_openFolderViewer(targetId, { skipHistory: true });
      } else if (page.kind === 'folders') {
        UI_openFoldersViewer();
      }
      return;
    }

    if (targetKind === 'category') {
      return LIBCORE_delegateCategories('refreshActivePageForAppearance', arguments);
    }
  }

  function TIME_clearTimers() {
    for (const t of CLEAN.timers) { try { clearTimeout(t); clearInterval(t); } catch {} }
    CLEAN.timers.clear();
  }

  function TIME_addListener(addFn, removeFn) {
    SAFE_try('addListener', addFn);
    CLEAN.listeners.add(removeFn);
  }

  function CORE_FS_syncFolderSidebarActiveState(reason = 'sync') {
    try {
      STATE.sidebarActiveSyncCount = Number(STATE.sidebarActiveSyncCount || 0) + 1;
      STATE.lastSidebarActiveSyncReason = String(reason || 'sync');
      STATE.sidebarLastActiveSyncReason = String(reason || 'sync');
      STATE.sidebarLastActiveSyncAt = Date.now();
      const route = ROUTE_parseCurrent();
      const activeRouteFolderId = route?.view === 'folder' ? String(route.id || '').trim() : '';
      const currentHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || W.location.pathname || '';
      const key = API_normalizeChatBindingKey(currentHref);
      const candidates = new Set((key.candidates || []).map((value) => String(value || '').trim()).filter(Boolean));
      const data = STORE_readData();
      let activeMarked = false;
      D.querySelectorAll(UTIL_selScoped(UI_FSECTION_FOLDER_ROW)).forEach((row) => {
        const folderId = String(row.getAttribute('data-cgxui-folder-id') || '').trim();
        const hrefs = Array.isArray(data.items?.[folderId]) ? data.items[folderId] : [];
        const matchesCurrentChat = !!folderId && hrefs.some((value) => candidates.has(String(value || '').trim()));
        const active = !!folderId && !activeMarked && (folderId === activeRouteFolderId || matchesCurrentChat);
        if (active) {
          row.setAttribute('aria-current', 'true');
          activeMarked = true;
        } else {
          row.removeAttribute('aria-current');
        }
      });
    } catch (e) {
      DIAG_err('syncFolderSidebarActiveState', e);
    }
  }

  function TIME_scheduleActiveSync(reason = 'sync') {
    if (STATE.sidebarActiveSyncTimer) return;
    STATE.sidebarActiveSyncTimer = W.setTimeout(() => {
      const timer = STATE.sidebarActiveSyncTimer;
      STATE.sidebarActiveSyncTimer = 0;
      CLEAN.timers.delete(timer);
      CORE_FS_syncFolderSidebarActiveState(reason);
    }, 0);
    CLEAN.timers.add(STATE.sidebarActiveSyncTimer);
  }

  function OBS_ensureSidebarObserver(root) {
    if (STATE.observedRoot === root) return;
    if (STATE.sidebarMO) { try { STATE.sidebarMO.disconnect(); } catch {} }

    STATE.observedRoot = root;
    const mo = new MutationObserver((muts) => {
      if (STATE.suppressMO) return;
      if (LIBCORE_mutationHasOnlyH2OOwnedNodes(muts)) {
        if (D.querySelector(UTIL_selScoped(UI_FSECTION_ROOT))) {
          STATE.sidebarSkippedH2OMutations = Number(STATE.sidebarSkippedH2OMutations || 0) + 1;
          TIME_scheduleActiveSync('h2o-owned-mutation');
          return;
        }
      }

      // Ignore our owned UI and our menus/popovers/modals/viewer
      const relevant = muts.some((mu) => {
        const t = mu.target;
        if (!(t instanceof HTMLElement)) return true;
        return !t.closest?.(UTIL_selScoped(UI_FSECTION_ROOT)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_MENU)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_POP)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_MODAL)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_VIEWER)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_PAGE_HOST)) &&
               !t.closest?.(UTIL_selScoped(UI_FSECTION_PAGE));
      });
      if (!relevant) return;

      if (LIBCORE_projectsMutationTouchesNativeRows(muts)) LIBCORE_invalidateProjectsStore('sidebar-project-mutation');
      TIME_scheduleActiveSync('sidebar-mutation');
      TIME_scheduleEnsure('mutation');
    });

    mo.observe(root, { childList: true, subtree: true });
    STATE.sidebarMO = mo;
    CLEAN.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function TIME_scheduleEnsure(reason) {
    if (STATE.ensureTimer) clearTimeout(STATE.ensureTimer);
    STATE.ensureTimer = setTimeout(() => {
      const timer = STATE.ensureTimer;
      STATE.ensureTimer = 0;
      CLEAN.timers.delete(timer);
      CORE_FS_ensureInjected(reason);
    }, 150);
    CLEAN.timers.add(STATE.ensureTimer);
  }

  function OBS_hookShiftContextMenuOnce() {
    if (STATE.ctxHooked) return;
    STATE.ctxHooked = true;

    const onCtx = (e) => {
      if (!e.shiftKey) return;
      const a = e.target?.closest?.('a.__menu-item[href*="/c/"]');
      if (!a) return;

      const href = a.getAttribute('href') || '';
      if (href.endsWith('/project')) return;
      if (!/\/c\/[a-z0-9-]+/i.test(href)) return;

      e.preventDefault();
      e.stopPropagation();
      UI_openAssignMenu(e.clientX, e.clientY, href);
    };

    const onKey = (e) => { if (e.key === 'Escape') { UI_closeAssignMenu(); UI_closeFolderPop(); } };

    TIME_addListener(
      () => D.addEventListener('contextmenu', onCtx, true),
      () => D.removeEventListener('contextmenu', onCtx, true)
    );
    TIME_addListener(
      () => D.addEventListener('keydown', onKey, true),
      () => D.removeEventListener('keydown', onKey, true)
    );
  }

  function OBS_hookRadixMenuInjectionOnce() {
    if (STATE.menuHooked) return;
    STATE.menuHooked = true;

    // capture which chat the "..." menu belongs to
    const onPointerDown = (e) => {
      const btn = e.target?.closest?.(SEL.menuCaptureBtn);
      if (!btn) return;
      const a = btn.closest('a[href*="/c/"]');
      if (!a) return;
      STATE.lastChatHrefForMenu = a.getAttribute('href') || '';
    };

    TIME_addListener(
      () => D.addEventListener('pointerdown', onPointerDown, true),
      () => D.removeEventListener('pointerdown', onPointerDown, true)
    );

    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        for (const node of mu.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const menus = [];
          if (node.getAttribute?.('role') === 'menu') menus.push(node);
          else if (node.querySelectorAll) menus.push(...node.querySelectorAll(SEL.radixMenu));

          if (!menus.length) continue;

          for (const menu of menus) {
            requestAnimationFrame(() => {
              const txt = UTIL_normText(menu.innerText || '');
              // lightweight signature check (same as your original intention)
              if (/move to project/i.test(txt) || /pin chat/i.test(txt) || /archive/i.test(txt) || /delete/i.test(txt)) {
                ENGINE_injectAddToFolder(menu);
              }
            });
          }
        }
      }
    });

    mo.observe(D.body, { childList: true, subtree: true });
    STATE.menuMO = mo;
    CLEAN.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function OBS_hookInShellPageNavigationOnce() {
    if (STATE.inShellPageNavHooked) return;
    STATE.inShellPageNavHooked = true;

    const isH2OPageLocation = (href = W.location.href) => {
      try {
        const url = new URL(String(href || W.location.href), W.location.href);
        return !!(ROUTE_parseUrl(url) || ROUTE_parseHash(url.hash));
      } catch {
        return false;
      }
    };

    const restoreSoon = (reason) => {
      if (!STATE.pageEl) return;
      W.setTimeout(() => UI_restoreInShellPage(reason), 0);
    };

    const syncRouteSoon = (reason) => {
      W.setTimeout(() => {
        ROUTE_openCurrentPage(reason).catch((error) => DIAG_err(`route:${reason}`, error));
      }, 0);
    };

    const handleHistoryNavigation = (reason) => {
      W.setTimeout(() => CORE_FS_syncFolderSidebarActiveState(reason), 0);
      if (isH2OPageLocation()) {
        syncRouteSoon(reason);
        return;
      }
      restoreSoon(reason);
    };

    const onClick = (e) => {
      if (!STATE.pageEl) return;
      const a = e.target?.closest?.('a[href]');
      if (!a) return;
      if (!isH2OPageLocation(a.href)) {
        restoreSoon('page-link');
        W.setTimeout(() => CORE_FS_syncFolderSidebarActiveState('native-page-link'), 0);
      }
    };

    const onPopState = () => syncRouteSoon('popstate');
    const onHashChange = () => handleHistoryNavigation('hashchange');

    TIME_addListener(
      () => D.addEventListener('click', onClick, true),
      () => D.removeEventListener('click', onClick, true)
    );
    TIME_addListener(
      () => W.addEventListener('popstate', onPopState, true),
      () => W.removeEventListener('popstate', onPopState, true)
    );
    TIME_addListener(
      () => W.addEventListener('hashchange', onHashChange, true),
      () => W.removeEventListener('hashchange', onHashChange, true)
    );

    const originalPushState = W.history?.pushState;
    const originalReplaceState = W.history?.replaceState;
    if (typeof originalPushState === 'function' && typeof originalReplaceState === 'function') {
      const wrappedPushState = function (...args) {
        const result = originalPushState.apply(this, args);
        handleHistoryNavigation('pushstate');
        return result;
      };
      const wrappedReplaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        handleHistoryNavigation('replacestate');
        return result;
      };
      W.history.pushState = wrappedPushState;
      W.history.replaceState = wrappedReplaceState;
      CLEAN.listeners.add(() => {
        try { if (W.history.pushState === wrappedPushState) W.history.pushState = originalPushState; } catch {}
        try { if (W.history.replaceState === wrappedReplaceState) W.history.replaceState = originalReplaceState; } catch {}
      });
    }
  }

  function OBS_hookPanelDismissOnce() {
    if (STATE.panelDismissHooked) return;
    STATE.panelDismissHooked = true;

    const shouldIgnore = (target) =>
      !!target?.closest?.([
        UTIL_selScoped(UI_FSECTION_VIEWER),
        UTIL_selScoped(UI_FSECTION_POP),
        UTIL_selScoped(UI_FSECTION_MENU),
        UTIL_selScoped(UI_FSECTION_MODAL),
      ].join(','));

    const onPointer = (e) => {
      const viewer = STATE.viewerEl;
      if (!viewer || viewer.getAttribute(ATTR_CGXUI_MODE) !== CFG_CATEGORY_OPEN_MODE_PANEL) return;
      if (shouldIgnore(e.target)) return;
      UI_closeViewer();
    };

    TIME_addListener(
      () => D.addEventListener('pointerdown', onPointer, true),
      () => D.removeEventListener('pointerdown', onPointer, true)
    );
  }

  /* ───────────────────────────── 🟦 SURFACE — EVENTS / API 📄🔒💧 ───────────────────────────── */
  // (No public EV_/PORT required for this module right now.)

  /* ───────────────────────────── ⚫️ LIFECYCLE — INIT / WIRING 📝🔓💥 ───────────────────────────── */


  function CORE_FS_injectSection(parent, section, beforeNode) {
    if (!(parent instanceof HTMLElement) || !(beforeNode instanceof Node) || !(section instanceof HTMLElement)) return false;
    parent.insertBefore(section, beforeNode);
    return true;
  }

  function CORE_FS_sidebarPlacementReady() {
    const h2 = DOM_findProjectsH2();
    if (!h2) return false;
    const projectsSection = DOM_findProjectsSection(h2);
    const parent = projectsSection?.parentElement || null;
    if (!(projectsSection instanceof HTMLElement) || !(parent instanceof HTMLElement)) return false;
    const folders = parent.querySelector(`:scope > ${UTIL_selScoped(UI_FSECTION_ROOT)}`);
    const categories = parent.querySelector(`:scope > ${UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT)}`);
    return !!(
      folders &&
      categories &&
      projectsSection.previousElementSibling === categories &&
      categories.previousElementSibling === folders
    );
  }

  function CORE_FS_ensureInjected(reason) {
    if (STATE.building) return false;
    STATE.sidebarEnsureCount = Number(STATE.sidebarEnsureCount || 0) + 1;
    STATE.lastSidebarEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureAt = Date.now();

    const h2 = DOM_findProjectsH2();
    const projectsSection = h2 ? DOM_findProjectsSection(h2) : null;
    const existingFoldersGlobal = DOM_findOwnedRoot(UI_FSECTION_ROOT);
    const existingCategoriesGlobal = DOM_findOwnedRoot(UI_FSECTION_CATEGORIES_ROOT);
    if (!(projectsSection instanceof HTMLElement) && !existingFoldersGlobal && !existingCategoriesGlobal) return false;

    const parent = projectsSection?.parentElement || existingFoldersGlobal?.parentElement || existingCategoriesGlobal?.parentElement || null;
    if (!(parent instanceof HTMLElement)) return false;

    OBS_ensureSidebarObserver(DOM_pickSidebarRoot(projectsSection || parent));
    if (projectsSection instanceof HTMLElement) LIBCORE_applyProjectsNativeControls(projectsSection);

    const folderRoots = [...D.querySelectorAll(UTIL_selScoped(UI_FSECTION_ROOT))].filter((node) => node instanceof HTMLElement);
    const categoryRoots = [...D.querySelectorAll(UTIL_selScoped(UI_FSECTION_CATEGORIES_ROOT))].filter((node) => node instanceof HTMLElement);
    const existingFolders = folderRoots.find((node) => node instanceof HTMLElement) || null;
    const existingCategories = categoryRoots.find((node) => node instanceof HTMLElement) || null;
    if (
      projectsSection instanceof HTMLElement &&
      existingFolders &&
      existingCategories &&
      projectsSection.previousElementSibling === existingCategories &&
      existingCategories.previousElementSibling === existingFolders
    ) {
      if (!existingFolders._cgxuiRender || existingFolders.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        UI_buildFoldersSection(projectsSection, existingFolders, reason || 'already-ok-hydrate');
      } else {
        UI_recordShellSeen('folders', existingFolders, reason || 'already-ok');
      }
      if (!existingCategories._cgxuiRender || existingCategories.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        try { UI_buildCategoriesSection(projectsSection, existingCategories, reason || 'already-ok-hydrate'); } catch (e) { DIAG_err('ensureInjected:categories-hydrate', e); }
      }
      UI_noteCategoryHydration(existingCategories, reason || 'already-ok');
      LIBCORE_applyProjectsNativeControls(projectsSection);
      CORE_FS_syncFolderSidebarActiveState(reason || 'already-ok');
      DIAG_step('already-ok', reason);
      return true;
    }

    if (projectsSection instanceof HTMLElement && existingFolders && existingCategories) {
      STATE.suppressMO = true;
      try {
        if (!existingFolders._cgxuiRender || existingFolders.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          UI_buildFoldersSection(projectsSection, existingFolders, reason || 'placement-hydrate');
        }
        if (!existingCategories._cgxuiRender || existingCategories.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          try { UI_buildCategoriesSection(projectsSection, existingCategories, reason || 'placement-hydrate'); } catch (e) { DIAG_err('ensureInjected:categories-hydrate', e); }
        }
        UI_noteCategoryHydration(existingCategories, reason || 'placement-hydrate');
        folderRoots.forEach((node) => { if (node !== existingFolders) SAFE_remove(node); });
        categoryRoots.forEach((node) => { if (node !== existingCategories) SAFE_remove(node); });
        CORE_FS_injectSection(parent, existingFolders, projectsSection);
        CORE_FS_injectSection(parent, existingCategories, projectsSection);
        STATE.sidebarPlacementRepairCount = Number(STATE.sidebarPlacementRepairCount || 0) + 1;
        CORE_FS_syncFolderSidebarActiveState(reason || 'placement-repair');
        DIAG_step('placement-repair', reason);
        return true;
      } finally {
        STATE.suppressMO = false;
      }
    }

    STATE.building = true;
    STATE.suppressMO = true;

    try {
      STORE_seedIfEmpty();

      let folders = existingFolders;
      let builtSections = 0;
      folderRoots.forEach((node) => { if (node !== folders) SAFE_remove(node); });
      if (folders) {
        try {
          UI_buildFoldersSection(projectsSection, folders, reason || 'hydrate-existing');
        } catch (e) {
          DIAG_err('ensureInjected:folders-hydrate', e);
        }
      } else if (projectsSection instanceof HTMLElement) {
        try {
          folders = UI_buildFoldersSection(projectsSection, null, reason || 'build');
          if (folders) builtSections += 1;
        } catch (e) {
          DIAG_err('ensureInjected:folders', e);
        }
      }
      if (!folders) return false;

      if (projectsSection instanceof HTMLElement) CORE_FS_injectSection(parent, folders, projectsSection);

      // Categories is isolated: owner path first, then narrow local build fallback, never blocking Folders.
      let categories = existingCategories;
      categoryRoots.forEach((node) => { if (node !== categories) SAFE_remove(node); });
      if (categories) {
        try {
          UI_buildCategoriesSection(projectsSection, categories, reason || 'hydrate-existing');
        } catch (e) {
          DIAG_err('ensureInjected:categories-hydrate', e);
        }
        UI_noteCategoryHydration(categories, reason || 'hydrate-existing');
      } else if (projectsSection instanceof HTMLElement) {
        try {
          categories = UI_buildCategoriesSection(projectsSection, null, reason || 'build');
          if (categories) builtSections += 1;
        } catch (e) {
          DIAG_err('ensureInjected:categories-owner', e);
        }
        if (categories) UI_noteCategoryHydration(categories, reason || 'build');
      }
      if (categories && projectsSection instanceof HTMLElement) CORE_FS_injectSection(parent, categories, projectsSection);

      if (projectsSection instanceof HTMLElement) LIBCORE_applyProjectsNativeControls(projectsSection);
      if (builtSections) {
        STATE.sidebarRenderCount = Number(STATE.sidebarRenderCount || 0) + 1;
        STATE.lastSidebarRenderReason = String(reason || 'ensure');
        STATE.sidebarLastRenderReason = String(reason || 'ensure');
        STATE.sidebarLastRenderAt = Date.now();
      } else {
        STATE.sidebarPlacementRepairCount = Number(STATE.sidebarPlacementRepairCount || 0) + 1;
      }
      CORE_FS_syncFolderSidebarActiveState(reason || 'injected');
      DIAG_step('injected', `${reason}${categories ? '' : ':folders-only'}`);
      return true;
    } catch (e) {
      DIAG_err('ensureInjected', e);
      return false;
    } finally {
      STATE.suppressMO = false;
      STATE.building = false;
    }
  }


  /* ───────────────────────────── PUBLIC API (H2O.folders) ───────────────────────────── */
  /*
   * Canonical owner of:
   *   - Folder list (CRUD)
   *   - Chat ↔ folder bindings
   * Consumers: Archive (0D3a), Studio, Data Tab (0Z1b)
   */

  function API_list() {
    const d = STORE_readData();
    return Array.isArray(d.folders) ? d.folders.slice() : [];
  }

  function API_normalizeChatBindingKey(chatIdOrHref = '') {
    const raw = String(chatIdOrHref || '').trim();
    if (!raw) return { raw: '', chatId: '', href: '', candidates: [] };

    let chatId = DOM_parseChatIdFromHref(raw) || '';

    if (!chatId) {
      try {
        const url = /^https?:\/\//i.test(raw) ? new URL(raw) : null;
        if (url) chatId = DOM_parseChatIdFromHref(url.pathname || '') || '';
      } catch {}
    }

    if (!chatId && !raw.startsWith('/') && !/^https?:\/\//i.test(raw)) {
      chatId = raw;
    }

    const href = chatId ? `/c/${encodeURIComponent(chatId)}` : raw;
    const candidates = [];
    const add = (value) => {
      const v = String(value || '').trim();
      if (!v || candidates.includes(v)) return;
      candidates.push(v);
    };

    add(href);
    add(raw);
    if (!raw.startsWith('/')) add(`/c/${raw}`);

    if (chatId) {
      add(chatId);
      add(`/c/${chatId}`);
      add(`/c/${encodeURIComponent(chatId)}`);
      try { add(`${location.origin}/c/${encodeURIComponent(chatId)}`); } catch {}
      add(DOM_findChatHrefInSidebarByChatId(chatId));
    }

    return { raw, chatId, href, candidates };
  }

  function API_getBinding(chatIdOrHref) {
    const key = API_normalizeChatBindingKey(chatIdOrHref);
    if (!key.raw && !key.href) return { folderId: '', folderName: '' };

    const d = STORE_readData();
    const folders = Array.isArray(d.folders) ? d.folders : [];
    const items = (d.items && typeof d.items === 'object') ? d.items : {};
    const candidates = new Set(key.candidates);

    for (const folder of folders) {
      const fid = String(folder.id || '');
      const arr = Array.isArray(items[fid]) ? items[fid] : [];
      if (arr.some((value) => candidates.has(String(value || '').trim()))) {
        return { folderId: fid, folderName: String(folder.name || '') };
      }
    }
    return { folderId: '', folderName: '' };
  }

  function API_savedLibraryRowMatchesKey(row, key) {
    if (!row || typeof row !== 'object' || !key) return false;
    const candidates = new Set(key.candidates);

    const rowChatId = String(row?.chatId || row?.conversationId || row?.id || '').trim();
    const rowHref = String(row?.href || row?.url || row?.path || '').trim();
    const rowSource = String(row?.source || row?.origin || row?.originSource || '').toLowerCase();

    const rowCandidates = [];
    const addCandidate = (value) => {
      const v = String(value || '').trim();
      if (v && !rowCandidates.includes(v)) rowCandidates.push(v);
    };

    if (rowChatId) {
      addCandidate(rowChatId);
      addCandidate(`/c/${rowChatId}`);
      addCandidate(`/c/${encodeURIComponent(rowChatId)}`);
      try { addCandidate(`${location.origin}/c/${encodeURIComponent(rowChatId)}`); } catch {}
    }
    addCandidate(rowHref);

    const matches = rowCandidates.some((value) => candidates.has(String(value || '').trim()));
    if (!matches) return false;

    if (/archive|workbench|snapshot|capture|saved|import/.test(rowSource)) return true;
    if (row?.snapshotId || row?.capturedAt || row?.savedAt || row?.isSavedHint === true) return true;
    if (/^imported[-_:]/i.test(rowChatId)) return true;
    if (!/recent|native/.test(rowSource)) return true;

    return false;
  }

  function API_isSavedLibraryChat(chatKeyOrHref = '') {
    const key = API_normalizeChatBindingKey(chatKeyOrHref);
    if (!key.chatId && !key.href) return false;

    const rows = [];
    const addRows = (value) => {
      if (!Array.isArray(value)) return;
      value.forEach((row) => { if (row && typeof row === 'object') rows.push(row); });
    };

    addRows(STATE.savedLibraryRows);
    try { addRows(H2O.archiveBoot?.listWorkbenchRows?.()); } catch {}
    try { addRows(H2O.archiveBoot?._rendererHost?.listWorkbenchRows?.()); } catch {}
    try { addRows(H2O.archiveBoot?.list?.()); } catch {}

    if (key.chatId) {
      try {
        const latest = H2O.archiveBoot?.getLatest?.(key.chatId);
        if (latest && typeof latest === 'object') rows.push({ ...latest, chatId: latest.chatId || key.chatId, source: latest.source || 'archive' });
      } catch {}
      try {
        const cached = H2O.archiveBoot?._rendererHost?.getCachedLatestSnapshot?.(key.chatId);
        if (cached && typeof cached === 'object') rows.push({ ...cached, chatId: cached.chatId || key.chatId, source: cached.source || 'archive' });
      } catch {}
    }

    return rows.some((row) => API_savedLibraryRowMatchesKey(row, key));
  }

  async function API_refreshSavedLibraryRowsForChat(chatKeyOrHref = '') {
    const key = API_normalizeChatBindingKey(chatKeyOrHref);
    if (!key.chatId && !key.href) return false;

    const rows = [];
    const addRows = (value) => {
      if (!Array.isArray(value)) return;
      value.forEach((row) => { if (row && typeof row === 'object') rows.push(row); });
    };
    const readRows = async (fn) => {
      if (typeof fn !== 'function') return;
      try {
        const value = fn();
        addRows(value && typeof value.then === 'function' ? await value : value);
      } catch {}
    };

    await readRows(H2O.archiveBoot?.listWorkbenchRows?.bind(H2O.archiveBoot));
    await readRows(H2O.archiveBoot?._rendererHost?.listWorkbenchRows?.bind(H2O.archiveBoot._rendererHost));
    if (rows.length) STATE.savedLibraryRows = rows;
    return rows.some((row) => API_savedLibraryRowMatchesKey(row, key));
  }

  async function API_captureCurrentChatForFolder(chatId, opts = {}) {
    const key = API_normalizeChatBindingKey(chatId);
    const cid = String(key.chatId || '').trim();
    if (!cid) {
      return { ok: false, status: 'capture-failed', reason: 'missing-chat-id', chatId: '', capture: null };
    }

    const archive = H2O.archiveBoot || {};
    if (typeof archive.captureNow !== 'function') {
      return { ok: false, status: 'capture-unavailable', chatId: cid, capture: null };
    }

    let capture = null;
    try {
      capture = await archive.captureNow(cid);
    } catch (error) {
      DIAG_err('capture-current-chat-for-folder', error);
      return { ok: false, status: 'capture-failed', chatId: cid, capture: null, error: String(error && (error.message || error) || '') };
    }

    if (!capture || capture.ok === false) {
      return { ok: false, status: 'capture-failed', chatId: cid, capture };
    }

    try { await archive.loadLatestSnapshot?.(cid); } catch {}

    if (API_isSavedLibraryChat(cid)) {
      return { ok: true, status: 'captured', chatId: cid, capture };
    }

    const rowsMatch = await API_refreshSavedLibraryRowsForChat(cid);
    if (rowsMatch && API_isSavedLibraryChat(cid)) {
      return { ok: true, status: 'captured', chatId: cid, capture };
    }

    return { ok: false, status: 'capture-not-indexed', chatId: cid, capture };
  }

  async function API_saveAndBindToFolder({ chatId = '', href = '', folderId = '', folderName = '', source = '' } = {}) {
    const key = API_normalizeChatBindingKey(chatId || href);
    const cid = String(key.chatId || '').trim();
    const fid = String(folderId || '').trim();
    const folder = API_list().find((item) => String(item?.id || '') === fid);
    const label = String(folder?.name || folderName || '').trim();

    if (!cid) {
      return { ok: false, status: 'capture-failed', reason: 'missing-chat-id', chatId: '', folderId: fid, folderName: label };
    }
    if (!fid || !folder) {
      return { ok: false, status: 'folder-bind-failed', reason: 'missing-folder-id', chatId: cid, folderId: fid, folderName: label };
    }

    const captured = await API_captureCurrentChatForFolder(cid, { source });
    if (!captured?.ok) {
      return { ...captured, folderId: fid, folderName: label };
    }

    const binding = API_setBinding(cid, fid, {
      source: 'folders-save-add-to-folder',
      reason: 'after-capture',
    });
    if (!binding?.ok || !binding.folderId) {
      return {
        ok: false,
        status: binding?.status || 'folder-bind-failed',
        chatId: cid,
        folderId: fid,
        folderName: label,
        capture: captured.capture,
        binding,
      };
    }

    return {
      ok: true,
      status: 'saved-and-bound',
      chatId: cid,
      folderId: String(binding.folderId || fid),
      folderName: String(binding.folderName || label),
      capture: captured.capture,
      binding,
    };
  }

  function API_setBinding(chatIdOrHref, folderId, opts = {}) {
    const key = API_normalizeChatBindingKey(chatIdOrHref);
    if (!key.raw && !key.href) {
      return {
        folderId: '',
        folderName: '',
        ok: false,
        status: 'chat-not-saved',
        reason: 'save-chat-before-folder-assignment',
        chatId: '',
        href: '',
      };
    }

    const fid = String(folderId || '').trim();
    if (fid && !API_isSavedLibraryChat(key.chatId || key.href || key.raw)) {
      return {
        folderId: '',
        folderName: '',
        ok: false,
        status: 'chat-not-saved',
        reason: 'save-chat-before-folder-assignment',
        chatId: String(key.chatId || ''),
        href: String(key.href || ''),
      };
    }

    const previous = API_getBinding(key.chatId || key.href || key.raw);
    const d = STORE_readData();
    const folders = Array.isArray(d.folders) ? d.folders : [];
    const folder = folders.find(f => String(f.id || '') === fid);
    const candidates = new Set(key.candidates);
    d.items = (d.items && typeof d.items === 'object') ? d.items : {};

    // Remove all known key shapes first; API_setBinding preserves one-folder-max behavior.
    for (const existingFid of Object.keys(d.items)) {
      d.items[existingFid] = (d.items[existingFid] || []).filter(h => {
        const value = String(h || '');
        return !candidates.has(value.trim());
      });
    }

    // Assign to target folder using the canonical normalized href.
    if (fid && folder) {
      d.items[fid] = Array.isArray(d.items[fid]) ? d.items[fid] : [];
      d.items[fid].push(key.href);
      d.items[fid] = [...new Set(d.items[fid])];
    } else if (fid) {
      // Folder doesn't exist in data yet — skip silently
    }

    STORE_writeData(d);

    const effective = API_getBinding(key.chatId || key.href);
    if (previous.folderId !== effective.folderId || previous.folderName !== effective.folderName) {
      EVENT_emitFoldersChanged({
        action: fid ? 'set-binding' : 'clear-binding',
        reason: String(opts?.reason || 'api-set-binding'),
        source: String(opts?.source || 'folders-api'),
        chatId: String(key.chatId || ''),
        href: String(key.href || ''),
        folderId: String(effective.folderId || ''),
        folderName: String(effective.folderName || ''),
        previousFolderId: String(previous.folderId || ''),
        previousFolderName: String(previous.folderName || ''),
        affectedChatIds: key.chatId ? [key.chatId] : [],
      });
    }
    return { folderId: fid, folderName: String(folder?.name || ''), ok: true, status: 'ok' };
  }

  function API_getCategoryOpenMode() {
    return STORE_readUI().categoryOpenMode;
  }

  function API_getFolderOpenMode() {
    return STORE_readUI().folderOpenMode;
  }

  function API_getCategoryMoreOpenMode() {
    return STORE_readUI().categoryMoreOpenMode;
  }

  function API_getFolderMoreOpenMode() {
    return STORE_readUI().folderMoreOpenMode;
  }

  function API_getProjectMoreOpenMode() {
    return STORE_readUI().projectMoreOpenMode;
  }

  function API_getCategoryInlinePreviewOnOpen() {
    return STORE_readUI().categoryInlinePreviewOnOpen !== false;
  }

  function API_getFolderInlinePreviewOnOpen() {
    return STORE_readUI().folderInlinePreviewOnOpen !== false;
  }

  function API_getProjectInlinePreviewOnOpen() {
    return STORE_readUI().projectInlinePreviewOnOpen !== false;
  }

  function API_setCategoryOpenMode(mode) {
    const next = STORE_normalizeCategoryOpenMode(mode);
    const ui = STORE_readUI();
    ui.categoryOpenMode = next;
    STORE_writeUI(ui);
    return next;
  }

  function API_setFolderOpenMode(mode) {
    const next = STORE_normalizeFolderOpenMode(mode);
    const ui = STORE_readUI();
    ui.folderOpenMode = next;
    STORE_writeUI(ui);
    return next;
  }

  function API_setCategoryMoreOpenMode(mode) {
    const next = STORE_normalizeMoreOpenMode(mode);
    const ui = STORE_readUI();
    ui.categoryMoreOpenMode = next;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return next;
  }

  function API_setFolderMoreOpenMode(mode) {
    const next = STORE_normalizeMoreOpenMode(mode);
    const ui = STORE_readUI();
    ui.folderMoreOpenMode = next;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return next;
  }

  function API_setProjectMoreOpenMode(mode) {
    const next = STORE_normalizeMoreOpenMode(mode);
    const ui = STORE_readUI();
    ui.projectMoreOpenMode = next;
    STORE_writeUI(ui);
    LIBCORE_applyProjectsNativeControls();
    return next;
  }

  function API_setCategoryInlinePreviewOnOpen(value) {
    const next = value !== false;
    const ui = STORE_readUI();
    ui.categoryInlinePreviewOnOpen = next;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return next;
  }

  function API_setFolderInlinePreviewOnOpen(value) {
    const next = value !== false;
    const ui = STORE_readUI();
    ui.folderInlinePreviewOnOpen = next;
    STORE_writeUI(ui);
    ENGINE_rerenderAllSections();
    return next;
  }

  function API_setProjectInlinePreviewOnOpen(value) {
    const next = value !== false;
    const ui = STORE_readUI();
    ui.projectInlinePreviewOnOpen = next;
    STORE_writeUI(ui);
    LIBCORE_applyProjectsNativeControls();
    return next;
  }

  function API_getShowFolderCounts() {
    return STORE_getShowFolderCounts();
  }

  function API_setShowFolderCounts(value) {
    return STORE_setShowFolderCounts(value);
  }

  function API_getShowCategoryCounts() {
    return STORE_getShowCategoryCounts();
  }

  function API_setShowCategoryCounts(value) {
    return STORE_setShowCategoryCounts(value);
  }

  const foldersPublicApi = {
    list: API_list,
    getBinding: API_getBinding,
    setBinding: API_setBinding,
    isSavedLibraryChat: API_isSavedLibraryChat,
    captureCurrentChatForFolder: API_captureCurrentChatForFolder,
    saveAndBindToFolder: API_saveAndBindToFolder,
    getFolderOpenMode: API_getFolderOpenMode,
    setFolderOpenMode: API_setFolderOpenMode,
    getCategoryOpenMode: API_getCategoryOpenMode,
    setCategoryOpenMode: API_setCategoryOpenMode,
    getFolderMoreOpenMode: API_getFolderMoreOpenMode,
    setFolderMoreOpenMode: API_setFolderMoreOpenMode,
    getCategoryMoreOpenMode: API_getCategoryMoreOpenMode,
    setCategoryMoreOpenMode: API_setCategoryMoreOpenMode,
    getProjectMoreOpenMode: API_getProjectMoreOpenMode,
    setProjectMoreOpenMode: API_setProjectMoreOpenMode,
    getFolderInlinePreviewOnOpen: API_getFolderInlinePreviewOnOpen,
    setFolderInlinePreviewOnOpen: API_setFolderInlinePreviewOnOpen,
    getCategoryInlinePreviewOnOpen: API_getCategoryInlinePreviewOnOpen,
    setCategoryInlinePreviewOnOpen: API_setCategoryInlinePreviewOnOpen,
    getProjectInlinePreviewOnOpen: API_getProjectInlinePreviewOnOpen,
    setProjectInlinePreviewOnOpen: API_setProjectInlinePreviewOnOpen,
    getShowFolderCounts: API_getShowFolderCounts,
    setShowFolderCounts: API_setShowFolderCounts,
    getShowCategoryCounts: API_getShowCategoryCounts,
    setShowCategoryCounts: API_setShowCategoryCounts,
    ensureInjected: CORE_FS_ensureInjected,
    syncFolderSidebarActiveState: CORE_FS_syncFolderSidebarActiveState,
    getSidebarDiagnostics() {
      return {
        sidebarRenderCount: Number(STATE.sidebarRenderCount || 0),
        sidebarEnsureCount: Number(STATE.sidebarEnsureCount || 0),
        sidebarActiveSyncCount: Number(STATE.sidebarActiveSyncCount || 0),
        sidebarSkippedH2OMutations: Number(STATE.sidebarSkippedH2OMutations || 0),
        sidebarPlacementRepairCount: Number(STATE.sidebarPlacementRepairCount || 0),
        firstFoldersShellAt: Number(STATE.firstFoldersShellAt || 0),
        firstCategoriesShellAt: Number(STATE.firstCategoriesShellAt || 0),
        sidebarHydrationCount: Number(STATE.sidebarHydrationCount || 0),
        sidebarHydrationLastReason: String(STATE.sidebarHydrationLastReason || ''),
        sidebarShellMode: String(STATE.sidebarShellMode || ''),
        sidebarLastRenderReason: String(STATE.sidebarLastRenderReason || STATE.lastSidebarRenderReason || ''),
        sidebarLastEnsureReason: String(STATE.sidebarLastEnsureReason || STATE.lastSidebarEnsureReason || ''),
        sidebarLastActiveSyncReason: String(STATE.sidebarLastActiveSyncReason || STATE.lastSidebarActiveSyncReason || ''),
        sidebarLastRenderAt: Number(STATE.sidebarLastRenderAt || 0),
        sidebarLastEnsureAt: Number(STATE.sidebarLastEnsureAt || 0),
        sidebarLastActiveSyncAt: Number(STATE.sidebarLastActiveSyncAt || 0),
        lastSidebarRenderReason: String(STATE.lastSidebarRenderReason || ''),
        lastSidebarEnsureReason: String(STATE.lastSidebarEnsureReason || ''),
        lastSidebarActiveSyncReason: String(STATE.lastSidebarActiveSyncReason || ''),
      };
    },
    // Also expose folders array directly (some consumers check H2O.folders.folders)
    get folders() { return API_list(); },
  };


function LIBCORE_registerFoldersOwner() {
  try {
    H2O.LibraryCore?.registerOwner?.('folders', foldersPublicApi, { replace: true });
    H2O.LibraryCore?.registerService?.('folders', foldersPublicApi, { replace: true });
    H2O.LibraryCore?.registerRoute?.('folder', (route) => {
      UI_openFolderViewer(route?.id, {
        fromRoute: true,
        baseHref: route?.baseHref,
        routeToken: route?.routeToken,
      });
      return true;
    }, { replace: true });
  } catch (error) {
    DIAG_err('registerFoldersOwner', error);
  }
}

  H2O.folders = H2O.folders || {};
  // Non-destructive merge: don't overwrite if something already set properties
  if (typeof H2O.folders.list !== 'function') H2O.folders.list = API_list;
  if (typeof H2O.folders.getBinding !== 'function') H2O.folders.getBinding = API_getBinding;
  if (typeof H2O.folders.setBinding !== 'function') H2O.folders.setBinding = API_setBinding;
  if (typeof H2O.folders.isSavedLibraryChat !== 'function') H2O.folders.isSavedLibraryChat = API_isSavedLibraryChat;
  if (typeof H2O.folders.captureCurrentChatForFolder !== 'function') H2O.folders.captureCurrentChatForFolder = API_captureCurrentChatForFolder;
  if (typeof H2O.folders.saveAndBindToFolder !== 'function') H2O.folders.saveAndBindToFolder = API_saveAndBindToFolder;
  if (typeof H2O.folders.getFolderOpenMode !== 'function') H2O.folders.getFolderOpenMode = API_getFolderOpenMode;
  if (typeof H2O.folders.setFolderOpenMode !== 'function') H2O.folders.setFolderOpenMode = API_setFolderOpenMode;
  if (typeof H2O.folders.getCategoryOpenMode !== 'function') H2O.folders.getCategoryOpenMode = API_getCategoryOpenMode;
  if (typeof H2O.folders.setCategoryOpenMode !== 'function') H2O.folders.setCategoryOpenMode = API_setCategoryOpenMode;
  if (typeof H2O.folders.getFolderMoreOpenMode !== 'function') H2O.folders.getFolderMoreOpenMode = API_getFolderMoreOpenMode;
  if (typeof H2O.folders.setFolderMoreOpenMode !== 'function') H2O.folders.setFolderMoreOpenMode = API_setFolderMoreOpenMode;
  if (typeof H2O.folders.getCategoryMoreOpenMode !== 'function') H2O.folders.getCategoryMoreOpenMode = API_getCategoryMoreOpenMode;
  if (typeof H2O.folders.setCategoryMoreOpenMode !== 'function') H2O.folders.setCategoryMoreOpenMode = API_setCategoryMoreOpenMode;
  if (typeof H2O.folders.getProjectMoreOpenMode !== 'function') H2O.folders.getProjectMoreOpenMode = API_getProjectMoreOpenMode;
  if (typeof H2O.folders.setProjectMoreOpenMode !== 'function') H2O.folders.setProjectMoreOpenMode = API_setProjectMoreOpenMode;
  if (typeof H2O.folders.getFolderInlinePreviewOnOpen !== 'function') H2O.folders.getFolderInlinePreviewOnOpen = API_getFolderInlinePreviewOnOpen;
  if (typeof H2O.folders.setFolderInlinePreviewOnOpen !== 'function') H2O.folders.setFolderInlinePreviewOnOpen = API_setFolderInlinePreviewOnOpen;
  if (typeof H2O.folders.getCategoryInlinePreviewOnOpen !== 'function') H2O.folders.getCategoryInlinePreviewOnOpen = API_getCategoryInlinePreviewOnOpen;
  if (typeof H2O.folders.setCategoryInlinePreviewOnOpen !== 'function') H2O.folders.setCategoryInlinePreviewOnOpen = API_setCategoryInlinePreviewOnOpen;
  if (typeof H2O.folders.getProjectInlinePreviewOnOpen !== 'function') H2O.folders.getProjectInlinePreviewOnOpen = API_getProjectInlinePreviewOnOpen;
  if (typeof H2O.folders.setProjectInlinePreviewOnOpen !== 'function') H2O.folders.setProjectInlinePreviewOnOpen = API_setProjectInlinePreviewOnOpen;
  if (typeof H2O.folders.getShowFolderCounts !== 'function') H2O.folders.getShowFolderCounts = API_getShowFolderCounts;
  if (typeof H2O.folders.setShowFolderCounts !== 'function') H2O.folders.setShowFolderCounts = API_setShowFolderCounts;
  if (typeof H2O.folders.getShowCategoryCounts !== 'function') H2O.folders.getShowCategoryCounts = API_getShowCategoryCounts;
  if (typeof H2O.folders.setShowCategoryCounts !== 'function') H2O.folders.setShowCategoryCounts = API_setShowCategoryCounts;
  if (typeof H2O.folders.ensureInjected !== 'function') H2O.folders.ensureInjected = CORE_FS_ensureInjected;
  if (typeof H2O.folders.syncFolderSidebarActiveState !== 'function') H2O.folders.syncFolderSidebarActiveState = CORE_FS_syncFolderSidebarActiveState;
  if (typeof H2O.folders.getSidebarDiagnostics !== 'function') H2O.folders.getSidebarDiagnostics = foldersPublicApi.getSidebarDiagnostics;
  // Ensure .folders array is accessible
  if (!Array.isArray(H2O.folders.folders)) {
    try {
      Object.defineProperty(H2O.folders, 'folders', {
        configurable: true, enumerable: true,
        get: () => API_list(),
      });
    } catch {
      H2O.folders.folders = API_list();
    }
  }


  function CORE_FS_boot() {
    if (STATE.booted) return;
    STATE.booted = true;

    LIBCORE_registerFoldersOwner();
    UI_ensureStyle();
    OBS_hookShiftContextMenuOnce();
    OBS_hookRadixMenuInjectionOnce();
    OBS_hookInShellPageNavigationOnce();
    OBS_hookPanelDismissOnce();
    LIBCORE_registerCategoriesCompat();

    CORE_FS_ensureInjected('boot');
    W.setTimeout(() => {
      ROUTE_openCurrentPage('boot').catch((error) => DIAG_err('routeBoot', error));
    }, 0);

    // short retry window (React late-mount)
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      CORE_FS_ensureInjected('interval');
      if (CORE_FS_sidebarPlacementReady() || tries >= 12) { try { clearInterval(iv); } catch {} }
    }, 800);

    CLEAN.timers.add(iv);
  }

  /* ───────────────────────────── ⚪️ LIFECYCLE — DISPOSE / CLEANUP 📝🔓💥 ───────────────────────────── */

  function CORE_FS_dispose() {
    // idempotent
    UI_closeAssignMenu();
    UI_closeFolderPop();
    UI_closeViewer();

    // remove injected sections
    try {
      D.querySelectorAll(UTIL_selScoped(UI_FSECTION_ROOT)).forEach((n) => n.remove());
    } catch {}

    // observers
    for (const off of CLEAN.observers) { try { off(); } catch {} }
    CLEAN.observers.clear();

    // listeners
    for (const off of CLEAN.listeners) { try { off(); } catch {} }
    CLEAN.listeners.clear();

    // timers
    TIME_clearTimers();
    STATE.ensureTimer = 0;

    // style + owned nodes
    for (const n of CLEAN.nodes) { try { n.remove(); } catch {} }
    CLEAN.nodes.clear();

    // reset booted
    STATE.booted = false;
  }

  // Expose lifecycle on vault (internal)
  MOD.core = MOD.core || {};
  MOD.core.boot = CORE_FS_boot;
  MOD.core.dispose = CORE_FS_dispose;
  MOD.core.ensureInjected = CORE_FS_ensureInjected;

  /* ───────────────────────────── ✅ BOOT (lifecycle entrypoint) ───────────────────────────── */
  SAFE_try('boot', () => CORE_FS_boot());

})();
