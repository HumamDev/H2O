// ==H2O Module==
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
// ==/H2O Module==

(() => {
  'use strict';

  /* ───────────────────────────── ⬜️ DEFINE — META / BOOTSTRAP 📄🔒💧 ───────────────────────────── */
  const W = window;
  const D = document;

  /* ── R4.6.0 — Native Library UI deprecation flag plumbing ───────────
   * 0F3a is special: it owns BOTH the folders sidebar list UI (gated
   * candidate) AND the Add-to-Library / Save-to-Folder chat-row menu
   * injection (CAPTURE — unconditional) AND STORE_validateFolderCreate
   * (Native folder-create code path that R4.5.1.a's S0Z1g MV3 fallback
   * depends on — unconditional). R4.6.0 installs the flag-reader
   * helpers but does NOT gate any internal function here. Future
   * slices may gate the folders-sidebar-list render path; the capture
   * menu injection + STORE_validateFolderCreate stay unconditional
   * forever. See docs/systems/library/r4.6-native-deprecation-plan.md.
   */
  const H2O_R46_FLAG_WORKSPACE_UI    = 'library.nativeWorkspaceUi';
  const H2O_R46_FLAG_ORGANIZATION_UI = 'library.nativeOrganizationUi';
  const H2O_R46_FLAG_CAPTURE_ONLY    = 'library.nativeCaptureOnlyMode';
  function isNativeWorkspaceUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_WORKSPACE_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }
  function isNativeOrganizationUiEnabled() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return flags.get(H2O_R46_FLAG_ORGANIZATION_UI, true) !== false;
      }
    } catch (_) { /* swallow */ }
    return true;
  }
  function isNativeCaptureOnlyMode() {
    try {
      const flags = W.H2O && W.H2O.flags;
      if (flags && typeof flags.get === 'function') {
        return !!flags.get(H2O_R46_FLAG_CAPTURE_ONLY, false);
      }
    } catch (_) { /* swallow */ }
    return false;
  }
  (function registerR46Diagnose() {
    try {
      W.H2O = W.H2O || {};
      W.H2O.deprecation = W.H2O.deprecation || {};
      W.H2O.deprecation.native = W.H2O.deprecation.native || {};
      W.H2O.deprecation.native['0F3a'] = function () {
        return {
          moduleId: '0F3a',
          phase: 'R4.7.6-retired',
          flags: {
            'library.nativeWorkspaceUi':     isNativeWorkspaceUiEnabled(),
            'library.nativeOrganizationUi':  isNativeOrganizationUiEnabled(),
            'library.nativeCaptureOnlyMode': isNativeCaptureOnlyMode(),
          },
          gatedSurfaces: [],
          retiredSurfaces: ['FoldersSidebarList', 'FoldersSidebarRows', 'FoldersSidebarMoreButton', 'FoldersSidebarCreateRow'],
          unconditionalSurfaces: [
            'ENGINE_injectAddToLibrary',    /* CAPTURE — never gated */
            'ENGINE_injectAddToFolder',     /* CAPTURE — never gated */
            'STORE_validateFolderCreate',   /* MV3 fallback — never gated */
          ],
          /* 0F3a folder rows in the sidebar carry the data-cgxui values
           * `flsc-folder-row` (constants UI_FSECTION_FOLDER_ROW at line
           * 214) and `flsc-folder-more` (UI_FSECTION_FOLDER_MORE at
           * line 216). The R4.6.2 gate targets these directly. CRUCIAL:
           * the selector does NOT match `flsc-add-to-folder` or
           * `flsc-add-to-library` (the capture menu items) — those use
           * distinct cgxui values and remain visible regardless of
           * flag state. STORE_validateFolderCreate (the Native folder-
           * create code path that S0Z1g's MV3 fallback depends on)
           * stays callable. */
          retiredGateImplementation: 'css-known-selector',
          retiredGateSelector: '[data-cgxui="flsc-folder-row"], [data-cgxui="flsc-folder-more"]',
          archive: 'retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js',
        };
      };
    } catch (_) { /* swallow */ }
  })();

  /* R4.7.6 — R4.6.3 per-element folder sidebar gate retired.
   * Code moved to:
   *   retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js
   * (Block 1). The gate targeted only the now-retired folder
   * sidebar row/more data-cgxui values. Capture menu injection
   * (flsc-add-to-library / flsc-add-to-folder), STORE_validateFolderCreate,
   * and folder data/store logic remain live and ungated. */

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
  const FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  const FOLDER_METADATA_OPERATION_PREVIEW_SCHEMA = 'h2o.folder-metadata-operation-preview.v1';
  const FOLDER_METADATA_OPERATION_RESULT_SCHEMA = 'h2o.folder-metadata-operation-result.v1';
  const FOLDER_METADATA_OPERATION_VERSION = 'p8h-g2.native-empty-delete.v1';
  const FOLDER_METADATA_DELETE_CONFIRMATION_TEXT = 'DELETE EMPTY FOLDER';
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
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/>
      <path d="M6.6 7.5H8.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M7.5 6.6V8.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
      <path d="M7.5 11V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M16.5 11V13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M11 7.5H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M11 16.5H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;
  const CFG_CATEGORY_ICON_OPTIONS = Object.freeze([
    { key: 'hash', label: 'Category', svg: FRAG_SVG_CATEGORY },
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
  STATE.lastChatMenuContext = STATE.lastChatMenuContext || null;
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

  // Menu-injection diagnostics. Exposed via H2O.folders.menuDiag() so an
  // operator can verify, after opening a row's three-dot menu, that we (a)
  // saw the Radix menu, (b) matched the lightweight signature regex, (c)
  // located an anchor menu item to clone, and (d) appended "Save to Folder"
  // / "Add to Library". A regression in any one of these surfaces as a
  // counter that stops climbing.
  STATE.menuDiag = Object.assign({
    observerInstalled: false,
    menuCandidatesSeen: 0,
    menusSeen: 0,
    signatureHits: 0,
    signatureMisses: 0,
    triggerContextResolved: 0,
    triggerContextMisses: 0,
    menuContextResolved: 0,
    menuContextMisses: 0,
    saveToFolderAttempts: 0,
    saveToFolderInjected: 0,
    addToLibraryAttempts: 0,
    addToLibraryInjected: 0,
    anchorMisses: 0,
    hrefMisses: 0,
    lastContextSource: '',
    lastContextHref: '',
    lastContextTitle: '',
    lastAnchorText: '',
    lastSignatureSample: '',
    lastSkipReason: '',
    lastErrorMessage: '',
  }, STATE.menuDiag || {});
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

  function FOLDERCORE_get() {
    try {
      const core = H2O.Library?.FolderProviderCore || null;
      return core && core.__phase === '3B' ? core : null;
    } catch {
      return null;
    }
  }

  function FOLDERCORE_origin() {
    try { return W.location?.origin || 'https://chatgpt.com'; } catch {}
    return 'https://chatgpt.com';
  }

  function FOLDERCORE_options(extra = {}) {
    return {
      origin: FOLDERCORE_origin(),
      ...extra,
    };
  }

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
    radixMenu: '[role="menu"],[data-radix-menu-content],[data-slot*="dropdown"],[data-state="open"]',
    radixMenuItem: '[role="menuitem"]',
    menuCaptureBtn:
      'button.__menu-item-trailing-btn,' +
      'button[data-testid*="history-item"][data-testid$="options"],' +
      'button[data-testid$="options"],' +
      'button[aria-label*="conversation options"],' +
      'button[aria-label*="Open conversation options"],' +
      'button[aria-haspopup="menu"],' +
      'button[data-state="open"]',
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
    makeNativeLikeMoreButton: UI_makeNativeLikeMoreButton,
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

  // Find the best menu-item anchor to clone for an injected H2O item. Tries
  // "Move to project" first (visual + a11y parity with the original design),
  // then falls back to other safe non-destructive items, finally to ANY menu
  // item. Returns null only when the menu has zero menu items.
  //
  // Resilience: ChatGPT periodically renames row-menu items (e.g. "Move to
  // project" → "Project" or removed for non-project accounts). Pre-Phase-5
  // we returned null on first miss and the entire injection bailed silently,
  // so "Save to Folder" and "Add to Library" disappeared from the menu.
  function DOM_findMenuAnchorItem(menuEl) {
    const tries = [
      /move to project/i,
      /move chat to project/i,
      /add to project/i,
      /pin chat/i,
      /^pin$/i,
      /share/i,
      /rename/i,
    ];
    for (const re of tries) {
      const it = DOM_findMenuItemByText(menuEl, re);
      if (it) return it;
    }
    const items = [...menuEl.querySelectorAll(SEL.radixMenuItem)];
    const safe = items.find((it) => !/delete|archive/i.test(UTIL_normText(it.textContent || '')));
    return safe || items[0] || null;
  }

  function DOM_setMenuItemLabel(menuItemEl, newText) {
    // Prefer the .truncate child (every ChatGPT menu item uses one for the
    // label) — direct, schema-free relabel that works regardless of the
    // cloned source text.
    const trunc = menuItemEl.querySelector(SEL.sidebarTruncate);
    if (trunc) {
      trunc.textContent = newText;
      return;
    }
    // Fallback: replace the largest text node in the menu item. The
    // pre-Phase-5 implementation only matched source text "move to project"
    // / "add to folder", which silently no-op'd when the cloned anchor came
    // from a different menu item (Pin chat / Share / etc).
    const tw = D.createTreeWalker(menuItemEl, NodeFilter.SHOW_TEXT);
    let n;
    let best = null;
    let bestLen = 0;
    while ((n = tw.nextNode())) {
      const t = UTIL_normText(n.nodeValue || '');
      if (t.length > bestLen) { best = n; bestLen = t.length; }
    }
    if (best) best.nodeValue = newText;
  }

  function DOM_extractSidebarChatTitle(anchor, fallback = '') {
    if (!(anchor instanceof HTMLElement)) return UTIL_normText(fallback).slice(0, 80);
    const textFromNode = (root) => {
      if (!(root instanceof HTMLElement)) return '';
      const walker = D.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest?.('button,[role="button"],svg,[aria-hidden="true"],[data-trailing-button]')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const parts = [];
      let node;
      while ((node = walker.nextNode())) parts.push(node.nodeValue || '');
      return UTIL_normText(parts.join(' '));
    };

    const truncs = [...anchor.querySelectorAll?.(SEL.sidebarTruncate) || []]
      .map((node) => UI_cleanSurfaceChatTitle(textFromNode(node)).slice(0, 120))
      .filter(Boolean);
    const bestTrunc = truncs
      .filter((text) => !UI_isNoisySurfaceChatTitle(text))
      .sort((a, b) => a.length - b.length)[0] || truncs[0] || '';
    if (bestTrunc) return bestTrunc.slice(0, 80);

    const aria = UTIL_normText(anchor.getAttribute('aria-label') || '');
    if (aria) return UI_cleanSurfaceChatTitle(aria).slice(0, 80);

    const directText = [];
    anchor.childNodes?.forEach?.((node) => {
      if (node.nodeType === Node.TEXT_NODE) directText.push(node.nodeValue || '');
    });
    const direct = UTIL_normText(directText.join(' '));
    if (direct) return UI_cleanSurfaceChatTitle(direct).slice(0, 80);

    return UI_cleanSurfaceChatTitle(UTIL_normText(fallback || anchor.getAttribute('href') || '')).slice(0, 80);
  }

  function DOM_getChatTitleFromSidebar(href) {
    try {
      const a = D.querySelector(`a[href="${CSS.escape(href)}"]`);
      return DOM_extractSidebarChatTitle(a, href);
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
        const t = DOM_extractSidebarChatTitle(a, fullHref);
        if (t) return t;
      }
    }
    const chatId = DOM_parseChatIdFromHref(fullHref);
    if (chatId) {
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (href.endsWith(`/c/${chatId}`)) {
          const t = DOM_extractSidebarChatTitle(a, fullHref);
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

  function DOM_getChatAnchors() {
    return [...D.querySelectorAll('a[href*="/c/"]')]
      .filter((a) => a instanceof HTMLElement && DOM_parseChatIdFromHref(a.getAttribute('href') || ''));
  }

  function DOM_rectSnapshot(el) {
    try {
      const r = el?.getBoundingClientRect?.();
      if (!r) return null;
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    } catch {
      return null;
    }
  }

  function DOM_menuContextFromAnchor(anchor, source, triggerRect = null) {
    if (!(anchor instanceof HTMLElement)) return null;
    const href = anchor.getAttribute('href') || '';
    const chatId = DOM_parseChatIdFromHref(href) || '';
    if (!href || !chatId) return null;
    const title = UTIL_normText(anchor.innerText || anchor.textContent || DOM_findChatTitleInSidebarByHref(href) || '').slice(0, 200);
    return {
      href,
      chatId,
      title,
      source: String(source || 'unknown'),
      triggerRect: triggerRect || DOM_rectSnapshot(anchor),
      ts: Date.now(),
    };
  }

  function DOM_anchorFromNearbyContainer(btn) {
    if (!(btn instanceof HTMLElement)) return null;
    const direct = btn.closest('a[href*="/c/"]');
    if (direct) return direct;

    const seen = new Set();
    let node = btn;
    for (let depth = 0; node && node !== D.body && depth < 8; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || seen.has(node)) continue;
      seen.add(node);

      const ownAnchors = [...node.querySelectorAll?.('a[href*="/c/"]') || []]
        .filter((a) => DOM_parseChatIdFromHref(a.getAttribute('href') || ''));
      if (ownAnchors.length === 1) return ownAnchors[0];

      const siblings = [node.previousElementSibling, node.nextElementSibling].filter(Boolean);
      for (const sib of siblings) {
        if (!(sib instanceof HTMLElement)) continue;
        if (sib.matches?.('a[href*="/c/"]') && DOM_parseChatIdFromHref(sib.getAttribute('href') || '')) return sib;
        const anchors = [...sib.querySelectorAll?.('a[href*="/c/"]') || []]
          .filter((a) => DOM_parseChatIdFromHref(a.getAttribute('href') || ''));
        if (anchors.length === 1) return anchors[0];
      }
    }
    return null;
  }

  function DOM_anchorFromGeometry(rectLike) {
    if (!rectLike) return null;
    const cx = Number(rectLike.left || 0) + Number(rectLike.width || 0) / 2;
    const cy = Number(rectLike.top || 0) + Number(rectLike.height || 0) / 2;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;

    const anchors = DOM_getChatAnchors()
      .map((a) => {
        const r = DOM_rectSnapshot(a);
        if (!r || r.width <= 0 || r.height <= 0) return null;
        const sidebarish = !!a.closest?.('nav,aside,#stage-slideover-sidebar,[aria-label*="Chat history" i]');
        const ay = r.top + r.height / 2;
        const ax = r.left + r.width / 2;
        const vertical = Math.abs(ay - cy);
        const horizontal = Math.max(0, ax - cx);
        const score = vertical + (sidebarish ? 0 : 500) + horizontal * 0.2;
        return { a, score };
      })
      .filter(Boolean)
      .sort((x, y) => x.score - y.score);
    return anchors[0]?.a || null;
  }

  function DOM_captureMenuContext(ctx, reason = '') {
    if (!ctx || !ctx.href) return false;
    STATE.lastChatHrefForMenu = ctx.href;
    STATE.lastChatMenuContext = ctx;
    STATE.menuDiag.lastContextSource = String(ctx.source || reason || '');
    STATE.menuDiag.lastContextHref = String(ctx.href || '');
    STATE.menuDiag.lastContextTitle = String(ctx.title || '').slice(0, 120);
    return true;
  }

  function DOM_resolveMenuContextFromTrigger(btn) {
    const triggerRect = DOM_rectSnapshot(btn);
    const nearby = DOM_anchorFromNearbyContainer(btn);
    if (nearby) return DOM_menuContextFromAnchor(nearby, nearby.closest?.('a[href*="/c/"]') === btn ? 'trigger-direct-anchor' : 'trigger-nearby-container', triggerRect);

    const byGeometry = DOM_anchorFromGeometry(triggerRect);
    if (byGeometry) return DOM_menuContextFromAnchor(byGeometry, 'trigger-geometry', triggerRect);

    const current = D.querySelector(SEL.currentChatAnchor);
    if (current) return DOM_menuContextFromAnchor(current, 'trigger-current-active', triggerRect);

    if (DOM_parseChatIdFromHref(W.location?.pathname || '')) {
      const href = W.location.pathname;
      return {
        href,
        chatId: DOM_parseChatIdFromHref(href) || '',
        title: UTIL_normText(D.title || ''),
        source: 'trigger-current-url',
        triggerRect,
        ts: Date.now(),
      };
    }
    return null;
  }

  function DOM_resolveMenuContextFromMenu(menuEl) {
    const prior = STATE.lastChatMenuContext;
    if (prior?.href && Date.now() - Number(prior.ts || 0) < 10000) return prior;
    const menuRect = DOM_rectSnapshot(menuEl);
    const byGeometry = DOM_anchorFromGeometry(menuRect);
    if (byGeometry) return DOM_menuContextFromAnchor(byGeometry, 'menu-geometry', menuRect);
    const current = D.querySelector(SEL.currentChatAnchor);
    if (current) return DOM_menuContextFromAnchor(current, 'menu-current-active', menuRect);
    if (DOM_parseChatIdFromHref(W.location?.pathname || '')) {
      const href = W.location.pathname;
      return {
        href,
        chatId: DOM_parseChatIdFromHref(href) || '',
        title: UTIL_normText(D.title || ''),
        source: 'menu-current-url',
        triggerRect: menuRect,
        ts: Date.now(),
      };
    }
    return null;
  }

  function DOM_ensureMenuContext(menuEl, reason = '') {
    const prior = STATE.lastChatMenuContext;
    if (
      STATE.lastChatHrefForMenu &&
      prior?.href === STATE.lastChatHrefForMenu &&
      Date.now() - Number(prior.ts || 0) < 10000
    ) return true;
    if (STATE.lastChatHrefForMenu && !prior) return true;
    const ctx = DOM_resolveMenuContextFromMenu(menuEl);
    if (DOM_captureMenuContext(ctx, reason || 'menu')) {
      STATE.menuDiag.menuContextResolved += 1;
      return true;
    }
    STATE.menuDiag.menuContextMisses += 1;
    STATE.menuDiag.lastSkipReason = 'missing-menu-context';
    return false;
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
    /* R4.7.6 — folder row CSS selector retired with sidebar list UI. */
    const CROW = UTIL_selScoped(UI_FSECTION_CATEGORY_ROW);
    /* R4.7.6 — folder more-button CSS selector retired with sidebar list UI. */
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

/* R4.7.6 — Folder sidebar row/more CSS retired. Code moved to:
   retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js
   (Block 2). Capture menu styles above remain active. */

/* C) Popover (Rename / Delete) */
${POP}{
  position:fixed;
  z-index:${CFG_FSECTION_FLOATING_Z};
  padding:5px;
  min-width:190px;
  max-width:min(360px, calc(100vw - 16px));
  max-height:min(78vh, 560px);
  background: var(--bg-elevated-secondary, #181818);
  border: 1px solid var(--border-default, #ffffff26);
  border-radius:12px;
  box-shadow: var(--shadow-lg, 0 10px 15px -3px #0000001a, 0 4px 6px -4px #0000001a);
  backdrop-filter: blur(var(--blur-sm, 8px));
  overflow:auto;
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
/* Phase 14 polish: single-row color picker. Flattens the swatch grid into
   one horizontal flex row so all colors are visible at once. The auto-fit
   minmax keeps the swatches the same 28px size and lets the row breathe
   when the popup is wider than 9*28 + gaps. */
${POP} [${ATTR_CGXUI_STATE}="picker-grid"][data-grid-mode="row"]{
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 6px;
  width: 100%;
}
${POP} [${ATTR_CGXUI_STATE}="picker-grid"][data-grid-mode="row"] > button{
  flex: 0 0 auto;
}
/* Phase 14 polish: sand-glass surface tuning for the popup. The shared
   data-h2o-skin-surface attribute provides the blurred glass treatment;
   we just round corners + soften the border so the popup feels lighter. */
${POP}[data-h2o-skin-surface="sand-glass"]{
  background:
    linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.055) 42%, rgba(255,255,255,.025)),
    rgba(11,18,24,.58);
  border-radius: 13px;
  border: 1px solid rgba(255,255,255,.16);
  box-shadow: 0 16px 44px rgba(0,0,0,.36), 0 0 0 1px rgba(255,255,255,.05) inset;
  backdrop-filter: blur(22px) saturate(1.38);
  -webkit-backdrop-filter: blur(22px) saturate(1.38);
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
${VIEWER} [${ATTR_CGXUI_STATE}="folder-action"]{
  all: unset;
  box-sizing: border-box;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--text-secondary, rgba(255,255,255,.72));
  cursor: pointer;
  pointer-events: auto;
}
${VIEWER} [${ATTR_CGXUI_STATE}="folder-action"]:hover,
${VIEWER} [${ATTR_CGXUI_STATE}="folder-action"]:focus-visible{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
  color: var(--text-primary, #fff);
}
${VIEWER} [${ATTR_CGXUI_STATE}="folder-action"] svg{
  width: 20px;
  height: 20px;
  display: block;
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
  position: relative;
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
${PAGE} [${ATTR_CGXUI_STATE}="folder-item"] [${ATTR_CGXUI_STATE}="category-button"]{
  padding-right: 48px;
}
${PAGE} [${ATTR_CGXUI_STATE}="folder-action"]{
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary, rgba(255,255,255,.72));
  opacity: .72;
  cursor: pointer;
}
${PAGE} [${ATTR_CGXUI_STATE}="folder-action"]:hover,
${PAGE} [${ATTR_CGXUI_STATE}="folder-action"]:focus-visible{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
  opacity: 1;
}
${PAGE} [${ATTR_CGXUI_STATE}="folder-action"] svg{
  width: 20px;
  height: 20px;
  display: block;
}

/* E) Folder kind divider */
${ROOT} [data-cgxui-state="kind-divider"],
${CATROOT} [data-cgxui-state="kind-divider"]{
  height: 1px;
  margin: 4px 8px;
  background: var(--border-default, rgba(255,255,255,.10));
}

/* F) Active category group row (contains current chat) */
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

  function STORE_normalizeFolderRecord(raw, opts = {}) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const stamp = Object.prototype.hasOwnProperty.call(opts || {}, 'now') ? opts.now : STORE_nowStamp();
    const core = FOLDERCORE_get();
    if (core && typeof core.normalizeFolder === 'function') {
      const item = core.normalizeFolder({
        id: src.id || src.folderId || '',
        name: src.name || src.title || '',
        kind: src.kind,
        projectRef: src.projectRef,
        createdAt: Object.prototype.hasOwnProperty.call(src, 'createdAt') ? src.createdAt : stamp,
        updatedAt: Object.prototype.hasOwnProperty.call(src, 'updatedAt') ? src.updatedAt : (Object.prototype.hasOwnProperty.call(src, 'createdAt') ? src.createdAt : stamp),
        iconColor: src.iconColor,
      }, FOLDERCORE_options({ now: stamp }));
      if (!item) return null;
      const iconColor = STORE_normalizeProjectColor(item.iconColor);
      if (iconColor) item.iconColor = iconColor;
      else delete item.iconColor;
      return item;
    }

    const id = String(src.id || src.folderId || '').trim();
    if (!id) return null;
    const name = String(src.name || src.title || id).trim() || id;
    const kindRaw = String(src.kind || '').trim().toLowerCase();
    const createdAt = src.createdAt ?? stamp;
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
    const core = FOLDERCORE_get();
    if (core && typeof core.normalizeFolderState === 'function') {
      const stamp = STORE_nowStamp();
      const normalized = core.normalizeFolderState(raw, FOLDERCORE_options({ now: stamp }));
      const folders = [];
      const seen = new Set();
      for (const row of Array.isArray(normalized.folders) ? normalized.folders : []) {
        const item = STORE_normalizeFolderRecord(row, { now: stamp });
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        folders.push(item);
      }
      const itemsSrc = (normalized.items && typeof normalized.items === 'object') ? normalized.items : {};
      const items = {};
      for (const folder of folders) {
        items[folder.id] = Array.isArray(itemsSrc[folder.id])
          ? [...new Set(itemsSrc[folder.id].map((v) => String(v || '').trim()).filter(Boolean))]
          : [];
      }
      return { folders, items };
    }

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

  function STORE_listFolderItems(data, folderId) {
    const id = String(folderId || '').trim();
    if (!id) return [];
    const core = FOLDERCORE_get();
    if (core && typeof core.listFolderItems === 'function') {
      return core.listFolderItems(data, id, FOLDERCORE_options());
    }
    return Array.isArray(data?.items?.[id]) ? data.items[id].slice() : [];
  }

  function STORE_computeFolderCounts(data) {
    const core = FOLDERCORE_get();
    if (core && typeof core.computeFolderCounts === 'function') {
      return core.computeFolderCounts(data, FOLDERCORE_options());
    }
    const byFolder = {};
    let total = 0;
    const d = STORE_normalizeData(data);
    for (const folder of d.folders) {
      const count = STORE_listFolderItems(d, folder.id).length;
      byFolder[folder.id] = count;
      total += count;
    }
    return { byFolder, total, orphaned: {} };
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

  function EVENT_flushLibraryFolderSync(reason = 'folders-changed') {
    try {
      const sync = H2O.Library?.Sync
        || H2O.LibrarySync
        || H2O.LibraryCore?.getService?.('library-sync')
        || H2O.LibraryCore?.getOwner?.('library-sync');
      const syncReason = String(reason || 'folders-changed');
      if (sync && typeof sync.flushFolderState === 'function') {
        return sync.flushFolderState(syncReason);
      }
      if (sync && typeof sync.pingStudio === 'function') {
        sync.pingStudio(syncReason);
        return true;
      }
      if (sync && typeof sync.broadcast === 'function') {
        sync.broadcast(syncReason, { folderState: true });
        return true;
      }
    } catch (error) {
      DIAG_err('foldersChangedSyncFlush', error);
    }
    return false;
  }

  function STORE_normalizeFolderName(raw) {
    return UTIL_normText(raw || '');
  }

  function STORE_folderNameKey(raw) {
    return STORE_normalizeFolderName(raw).toLowerCase();
  }

  function STORE_validateFolderRename(data, folderId, name) {
    const id = String(folderId || '').trim();
    const nextName = STORE_normalizeFolderName(name);
    const blockers = [];
    const folder = id && Array.isArray(data?.folders)
      ? data.folders.find((item) => String(item?.id || item?.folderId || '').trim() === id)
      : null;
    if (!id) blockers.push('folder-id-required');
    if (!folder) {
      blockers.push('folder-not-found');
      blockers.push('target-not-canonical');
    }
    if (!nextName) blockers.push('invalid-folder-name');
    if (nextName && UTIL_isReservedFolderViewName(nextName)) blockers.push('reserved-folder-name');
    const nextKey = STORE_folderNameKey(nextName);
    if (folder && nextKey) {
      const exists = data.folders.some((item) =>
        String(item?.id || item?.folderId || '').trim() !== id
        && STORE_folderNameKey(item?.name || item?.title) === nextKey
      );
      if (exists) blockers.push('same-name-conflict');
    }
    return {
      ok: blockers.length === 0,
      folder,
      folderId: id,
      nextName,
      blockers,
    };
  }

  function STORE_validateFolderCreate(data, name, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const nextName = STORE_normalizeFolderName(name);
    const requestedId = String(opts.id || opts.folderId || '').trim();
    const blockers = [];
    if (!nextName) blockers.push('invalid-folder-name');
    if (nextName && UTIL_isReservedFolderViewName(nextName)) blockers.push('reserved-folder-name');
    const nextKey = STORE_folderNameKey(nextName);
    if (nextKey && Array.isArray(data?.folders)) {
      const exists = data.folders.some((item) =>
        STORE_folderNameKey(item?.name || item?.title) === nextKey
      );
      if (exists) blockers.push('same-name-conflict');
    }
    if (requestedId && Array.isArray(data?.folders)) {
      const idExists = data.folders.some((item) => String(item?.id || item?.folderId || '').trim() === requestedId);
      if (idExists) blockers.push('folder-id-conflict');
    }
    return {
      ok: blockers.length === 0,
      folderId: requestedId,
      nextName,
      blockers,
    };
  }

  function STORE_createFolder(name, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const data = STORE_readData();
    const validation = STORE_validateFolderCreate(data, name, opts);
    if (!validation.ok) return { ok: false, applied: false, ...validation };
    const folder = STORE_makeLocalFolderRecord(validation.nextName, validation.folderId ? { id: validation.folderId } : {});
    if (!folder?.id) {
      return {
        ok: false,
        applied: false,
        folderId: '',
        nextName: validation.nextName,
        blockers: ['folder-id-required'],
        warnings: [],
      };
    }
    data.folders.push(folder);
    if (!data.items || typeof data.items !== 'object' || Array.isArray(data.items)) data.items = {};
    data.items[folder.id] = [];
    STORE_writeData(data);
    EVENT_emitFoldersChanged({
      action: 'folder-create',
      folderId: String(folder.id || ''),
      folderName: String(folder.name || ''),
      source: String(opts.source || 'folder-create'),
    });
    const ui = STORE_readUI();
    if (opts.openInline !== false && API_getFolderInlinePreviewOnOpen()) ui.openFolders[folder.id] = true;
    STORE_writeUI(ui);
    if (opts.rerender !== false) {
      ENGINE_rerenderAllSections();
      UI_refreshActivePageForAppearance('folder', folder.id);
    }
    return {
      ok: true,
      applied: true,
      folderId: folder.id,
      folder,
      name: String(folder.name || ''),
      blockers: [],
      warnings: [],
    };
  }

  function STORE_renameFolder(folderId, name, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const data = STORE_readData();
    const validation = STORE_validateFolderRename(data, folderId, name);
    if (!validation.ok) return { ok: false, applied: false, ...validation };
    const target = validation.folder;
    const previousName = STORE_normalizeFolderName(target.name || target.title || '');
    if (previousName === validation.nextName) {
      return {
        ok: true,
        applied: false,
        folderId: validation.folderId,
        previousName,
        name: previousName,
        blockers: [],
        warnings: ['no-op-name-unchanged'],
      };
    }
    target.name = validation.nextName;
    target.updatedAt = STORE_nowStamp();
    STORE_writeData(data);
    EVENT_emitFoldersChanged({
      action: 'folder-rename',
      folderId: validation.folderId,
      folderName: String(target.name || ''),
      previousFolderName: previousName,
      source: String(opts.source || 'folder-rename'),
    });
    if (opts.rerender !== false) {
      ENGINE_rerenderAllSections();
      UI_refreshActivePageForAppearance('folder', validation.folderId);
    }
    return {
      ok: true,
      applied: true,
      folderId: validation.folderId,
      previousName,
      name: validation.nextName,
      blockers: [],
      warnings: [],
    };
  }

  function STORE_deleteEmptyFolder(folderId, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const data = STORE_readData();
    const id = String(folderId || '').trim();
    const blockers = [];
    const target = id
      ? data.folders.find((item) => String(item?.id || item?.folderId || '').trim() === id)
      : null;
    if (!id) blockers.push('folder-id-required');
    if (!target) {
      blockers.push('folder-not-found');
      blockers.push('target-not-canonical');
    }
    const itemBucketExists = !!id && Object.prototype.hasOwnProperty.call(data.items || {}, id);
    const existingItems = itemBucketExists && Array.isArray(data.items?.[id]) ? data.items[id] : [];
    if (existingItems.length > 0) blockers.push('delete-non-empty-folder-blocked');
    if (blockers.length) {
      return {
        ok: false,
        applied: false,
        folderId: id,
        blockers,
        warnings: [],
      };
    }

    const before = META_folderSummary(data, target);
    data.folders = data.folders.filter((folder) => String(folder?.id || folder?.folderId || '').trim() !== id);
    if (!data.items || typeof data.items !== 'object' || Array.isArray(data.items)) data.items = {};
    delete data.items[id];
    STORE_writeData(data);
    EVENT_emitFoldersChanged({
      action: 'folder-delete',
      folderId: id,
      folderName: String(target.name || target.title || ''),
      affectedCount: 0,
      source: String(opts.source || 'folder-delete'),
    });

    const ui = STORE_readUI();
    delete ui.openFolders[id];
    STORE_writeUI(ui);
    if (opts.rerender !== false) {
      ENGINE_rerenderAllSections();
      UI_refreshActivePageForAppearance('folder', id);
    }

    return {
      ok: true,
      applied: true,
      folderId: id,
      before,
      after: null,
      affectedCount: 0,
      removedItemBucket: itemBucketExists,
      blockers: [],
      warnings: [],
    };
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

  function META_isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function META_safeObject(value) {
    return META_isObject(value) ? value : {};
  }

  function META_cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function META_hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(META_safeObject(obj), key);
  }

  function META_canonicalize(value) {
    if (Array.isArray(value)) return value.map(META_canonicalize);
    if (!META_isObject(value)) return value;
    const out = {};
    Object.keys(value).sort().forEach((key) => {
      out[key] = META_canonicalize(value[key]);
    });
    return out;
  }

  function META_stableStringify(value) {
    try { return JSON.stringify(META_canonicalize(value)); }
    catch { return String(value || ''); }
  }

  function META_hash(value) {
    const text = META_stableStringify(value);
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `h2o-folder-meta-${(`00000000${hash.toString(16)}`).slice(-8)}`;
  }

  function META_folderHashInput(folder) {
    const row = META_safeObject(folder);
    return {
      id: META_cleanString(row.id || row.folderId),
      name: META_cleanString(row.name || row.title),
      color: STORE_normalizeProjectColor(row.iconColor || row.color),
      icon: META_cleanString(row.icon || ''),
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : null,
      kind: META_cleanString(row.kind || ''),
      parentId: META_cleanString(row.parentId || ''),
      projectRefPresent: !!row.projectRef,
      metaPresent: !!(row.meta || row.meta_json),
    };
  }

  function META_folderHash(folder) {
    return META_hash(META_folderHashInput(folder));
  }

  function META_memberships(data, folderId) {
    const items = data?.items && typeof data.items === 'object' ? data.items : {};
    return Array.isArray(items[folderId])
      ? items[folderId].map((value) => String(value || '').trim()).filter(Boolean).sort()
      : [];
  }

  function META_membershipHash(data, folderId) {
    return META_hash({ folderId, memberships: META_memberships(data, folderId) });
  }

  function META_sourceHash(data) {
    const src = STORE_normalizeData(data);
    return META_hash({
      folders: (src.folders || []).map((folder) => ({
        id: META_cleanString(folder.id || folder.folderId),
        folderHash: META_folderHash(folder),
        membershipHash: META_membershipHash(src, META_cleanString(folder.id || folder.folderId)),
      })).sort((a, b) => a.id.localeCompare(b.id)),
    });
  }

  function META_findFolder(data, folderId) {
    const id = META_cleanString(folderId);
    return (Array.isArray(data?.folders) ? data.folders : []).find((folder) => META_cleanString(folder?.id || folder?.folderId) === id) || null;
  }

  function META_folderSummary(data, folder) {
    const row = META_safeObject(folder);
    const id = META_cleanString(row.id || row.folderId);
    const memberships = META_memberships(data, id);
    const iconColor = STORE_normalizeProjectColor(row.iconColor || row.color);
    const color = STORE_normalizeProjectColor(row.color || row.iconColor);
    return {
      id,
      folderId: id,
      name: META_cleanString(row.name || row.title || id),
      color,
      iconColor,
      icon: META_cleanString(row.icon || ''),
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : null,
      membershipCount: memberships.length,
      folderHash: META_folderHash(row),
      sourceHash: META_sourceHash(data),
      membershipHash: META_membershipHash(data, id),
    };
  }

  function META_deleteDependencySummary(data, folder, beforeSummary) {
    const before = META_safeObject(beforeSummary);
    const id = META_cleanString(before.folderId || before.id || folder?.id || folder?.folderId);
    const items = data?.items && typeof data.items === 'object' && !Array.isArray(data.items) ? data.items : {};
    const memberships = META_memberships(data, id);
    const itemBucketExists = Object.prototype.hasOwnProperty.call(items, id);
    return {
      folderId: id,
      folderName: before.name || META_cleanString(folder?.name || folder?.title || id),
      color: before.color || '',
      iconColor: before.iconColor || '',
      nativeMembershipCount: memberships.length,
      itemBucketExists,
      itemBucketEmpty: memberships.length === 0,
      folderHash: before.folderHash || (folder ? META_folderHash(folder) : ''),
      sourceHash: before.sourceHash || META_sourceHash(data),
      membershipHash: before.membershipHash || META_membershipHash(data, id),
      knownHere: {
        available: false,
        count: null,
        source: 'native-preview-does-not-track-studio-known-here',
      },
      chromeReferences: {
        status: 'check-required',
        blocker: 'chrome-reference-check-required',
      },
      desktopReferences: {
        status: 'check-required',
        blocker: 'desktop-reference-check-required',
      },
      officialChatGptFolderApiProven: false,
    };
  }

  function META_addCode(list, code) {
    const normalized = META_cleanString(code);
    if (!normalized) return;
    if (!list.some((entry) => entry && entry.code === normalized)) list.push({ code: normalized });
  }

  function META_isLocalReviewOperation(operation) {
    const op = META_safeObject(operation);
    const before = META_safeObject(op.before);
    const after = META_safeObject(op.after);
    const surface = META_cleanString(op.sourceSurface).toLowerCase();
    const folderId = META_cleanString(op.folderId || before.folderId || after.folderId);
    return op.localReviewTarget === true
      || !!META_cleanString(op.reviewBucket || before.reviewBucket || after.reviewBucket)
      || surface === 'local-review'
      || /^(__|local-review[:_-])/i.test(folderId);
  }

  function META_targetColorFromOperation(operation) {
    const op = META_safeObject(operation);
    const after = META_safeObject(op.after);
    const directKeys = ['iconColor', 'color', 'targetColor'];
    for (const key of directKeys) {
      if (META_hasOwn(after, key)) {
        const raw = META_cleanString(after[key]);
        return { present: true, raw, color: raw ? STORE_normalizeProjectColor(raw) : '' };
      }
    }
    for (const key of ['targetColor', 'color', 'iconColor']) {
      if (META_hasOwn(op, key)) {
        const raw = META_cleanString(op[key]);
        return { present: true, raw, color: raw ? STORE_normalizeProjectColor(raw) : '' };
      }
    }
    return { present: false, raw: '', color: '' };
  }

  function META_operationBase(operation) {
    const op = META_safeObject(operation);
    const folderId = META_cleanString(op.folderId || op.before?.folderId || op.after?.folderId || op.id);
    return {
      schema: FOLDER_METADATA_OPERATION_PREVIEW_SCHEMA,
      readOnly: true,
      noMutation: true,
      operationSchema: META_cleanString(op.schema || ''),
      operationType: META_cleanString(op.operationType),
      folderId,
      before: null,
      after: null,
      requiredAuthority: 'native-h2o-folder-state',
      canApply: false,
      blockers: [],
      warnings: [],
    };
  }

  function META_validateCommon(operation, preview, data) {
    const op = META_safeObject(operation);
    if (op.schema !== FOLDER_METADATA_OPERATION_SCHEMA) META_addCode(preview.blockers, 'invalid-operation-schema');
    if (!preview.folderId) META_addCode(preview.blockers, 'folder-id-required');
    if (META_isLocalReviewOperation(op)) META_addCode(preview.blockers, 'local-review-target-blocked');
    const folder = preview.folderId ? META_findFolder(data, preview.folderId) : null;
    if (!folder) {
      META_addCode(preview.blockers, 'folder-not-found');
      META_addCode(preview.blockers, 'target-not-canonical');
      return null;
    }
    preview.before = META_folderSummary(data, folder);
    const guard = META_safeObject(op.staleGuard);
    if (META_cleanString(guard.folderHash) && META_cleanString(guard.folderHash) !== preview.before.folderHash) {
      META_addCode(preview.blockers, 'stale-folder-hash');
    }
    if (META_cleanString(guard.sourceHash) && META_cleanString(guard.sourceHash) !== preview.before.sourceHash) {
      META_addCode(preview.blockers, 'stale-source-hash');
    }
    if (META_cleanString(guard.membershipHash) && META_cleanString(guard.membershipHash) !== preview.before.membershipHash) {
      META_addCode(preview.blockers, 'stale-membership-hash');
    }
    return folder;
  }

  function META_previewColorOperation(operation, preview, data) {
    const folder = META_validateCommon(operation, preview, data);
    const target = META_targetColorFromOperation(operation);
    const targetValid = target.present && (!target.raw || !!target.color);
    if (!targetValid) META_addCode(preview.blockers, 'invalid-color');
    if (!folder) return preview;
    const before = preview.before || META_folderSummary(data, folder);
    if (!targetValid) return preview;
    const after = { ...before, color: target.color, iconColor: target.color };
    after.folderHash = META_hash(META_folderHashInput({ ...folder, color: target.color, iconColor: target.color }));
    preview.after = after;
    if (target.present && target.color === before.iconColor) META_addCode(preview.warnings, 'no-op-color-unchanged');
    const stableFieldsChanged = before.name !== after.name
      || before.id !== after.id
      || before.sortOrder !== after.sortOrder
      || before.membershipCount !== after.membershipCount;
    if (stableFieldsChanged) META_addCode(preview.blockers, 'unexpected-non-color-delta');
    preview.canApply = preview.blockers.length === 0;
    return preview;
  }

  function META_previewRenameOperation(operation, preview, data) {
    const folder = META_validateCommon(operation, preview, data);
    const op = META_safeObject(operation);
    const after = META_safeObject(op.after);
    const nextName = STORE_normalizeFolderName(after.name || after.title || op.name || op.title);
    const before = preview.before || (folder ? META_folderSummary(data, folder) : null);
    if (!nextName) META_addCode(preview.blockers, 'invalid-folder-name');
    if (nextName && UTIL_isReservedFolderViewName(nextName)) META_addCode(preview.blockers, 'reserved-folder-name');
    if (folder && nextName) {
      const validation = STORE_validateFolderRename(data, preview.folderId, nextName);
      validation.blockers.forEach((code) => META_addCode(preview.blockers, code));
      ['id', 'folderId'].forEach((key) => {
        if (META_hasOwn(after, key) && META_cleanString(after[key]) !== preview.folderId) META_addCode(preview.blockers, 'folder-id-changed');
      });
      if (META_hasOwn(after, 'iconColor') && STORE_normalizeProjectColor(after.iconColor) !== (before?.iconColor || '')) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      if (META_hasOwn(after, 'color') && STORE_normalizeProjectColor(after.color) !== (before?.color || '')) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      if (META_hasOwn(after, 'icon') && META_cleanString(after.icon) !== (before?.icon || '')) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      if (META_hasOwn(after, 'sortOrder') && Number(after.sortOrder) !== before?.sortOrder) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      if (META_hasOwn(after, 'membershipCount') && Number(after.membershipCount) !== (before?.membershipCount || 0)) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      if (META_hasOwn(after, 'memberships') || META_hasOwn(after, 'items')) {
        META_addCode(preview.blockers, 'unexpected-non-rename-delta');
      }
      const afterSummary = { ...before, name: nextName };
      afterSummary.folderHash = META_hash(META_folderHashInput({ ...folder, name: nextName }));
      preview.after = afterSummary;
      if (before?.name === nextName) META_addCode(preview.warnings, 'no-op-name-unchanged');
    }
    preview.canApply = preview.blockers.length === 0;
    return preview;
  }

  function META_previewCreateOperation(operation, preview, data) {
    const op = META_safeObject(operation);
    const after = META_safeObject(op.after);
    if (op.schema !== FOLDER_METADATA_OPERATION_SCHEMA) META_addCode(preview.blockers, 'invalid-operation-schema');
    if (META_isLocalReviewOperation(op)) META_addCode(preview.blockers, 'local-review-target-blocked');
    const nextName = STORE_normalizeFolderName(after.name || after.title || op.name || op.title);
    const requestedId = META_cleanString(op.folderId || after.folderId || after.id || op.id);
    const sourceHash = META_sourceHash(data);
    const guard = META_safeObject(op.staleGuard);
    if (META_cleanString(guard.sourceHash) && META_cleanString(guard.sourceHash) !== sourceHash) {
      META_addCode(preview.blockers, 'stale-source-hash');
    }
    if (!nextName) META_addCode(preview.blockers, 'invalid-folder-name');
    if (nextName && UTIL_isReservedFolderViewName(nextName)) META_addCode(preview.blockers, 'reserved-folder-name');
    const validation = STORE_validateFolderCreate(data, nextName, requestedId ? { id: requestedId } : {});
    validation.blockers.forEach((code) => META_addCode(preview.blockers, code));
    if (META_hasOwn(after, 'memberships') || META_hasOwn(after, 'items') || META_hasOwn(op, 'memberships') || META_hasOwn(op, 'items')) {
      META_addCode(preview.blockers, 'unexpected-create-memberships');
    }
    preview.folderId = requestedId;
    preview.before = {
      sourceHash,
      folderCount: Array.isArray(data?.folders) ? data.folders.length : 0,
      membershipCount: 0,
      previewHash: META_hash({ operationType: 'create-folder', name: nextName, sourceHash }),
    };
    const proposed = STORE_makeLocalFolderRecord(nextName || 'New folder', requestedId ? { id: requestedId } : { id: 'preview:create-folder' });
    const afterData = STORE_normalizeData({
      folders: [...(Array.isArray(data?.folders) ? data.folders : []), proposed],
      items: {
        ...(data?.items && typeof data.items === 'object' && !Array.isArray(data.items) ? data.items : {}),
        [proposed.id]: [],
      },
    });
    const afterFolder = META_findFolder(afterData, proposed.id);
    preview.after = afterFolder ? {
      ...META_folderSummary(afterData, afterFolder),
      id: requestedId || '',
      folderId: requestedId || '',
      proposedFolderId: requestedId || null,
      name: nextName,
      membershipCount: 0,
    } : {
      id: requestedId || '',
      folderId: requestedId || '',
      name: nextName,
      membershipCount: 0,
      sourceHash,
    };
    preview.proposed = {
      create: true,
      folderName: nextName,
      requestedFolderId: requestedId || null,
      createEmptyItemBucket: true,
      membershipCount: 0,
    };
    preview.canApply = preview.blockers.length === 0;
    return preview;
  }

  function META_previewDeleteOperation(operation, preview, data) {
    const op = META_safeObject(operation);
    const folder = META_validateCommon(operation, preview, data);
    const confirmation = META_cleanString(op.confirmation);
    const confirmationOk = confirmation === FOLDER_METADATA_DELETE_CONFIRMATION_TEXT;
    preview.requiredConfirmation = FOLDER_METADATA_DELETE_CONFIRMATION_TEXT;
    preview.confirmation = {
      required: true,
      text: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
      provided: !!confirmation,
      accepted: confirmationOk,
      appliesTo: 'empty-folder-delete-apply',
    };
    if (folder) {
      const dependencySummary = META_deleteDependencySummary(data, folder, preview.before);
      preview.before = {
        ...(preview.before || {}),
        nativeMembershipCount: dependencySummary.nativeMembershipCount,
        itemBucketExists: dependencySummary.itemBucketExists,
        itemBucketEmpty: dependencySummary.itemBucketEmpty,
      };
      preview.dependencySummary = dependencySummary;
      preview.after = null;
      preview.proposed = {
        deleted: true,
        folderId: preview.folderId,
        folderName: preview.before?.name || '',
        nativeMembershipCount: dependencySummary.nativeMembershipCount,
        itemBucketEmpty: dependencySummary.itemBucketEmpty,
        removeFolderRow: true,
        removeEmptyItemBucket: dependencySummary.itemBucketEmpty,
      };
      if ((preview.before?.membershipCount || 0) > 0) META_addCode(preview.blockers, 'delete-non-empty-folder-blocked');
    } else {
      preview.dependencySummary = {
        folderId: preview.folderId,
        nativeMembershipCount: null,
        itemBucketExists: false,
        itemBucketEmpty: false,
        knownHere: { available: false, count: null },
        chromeReferences: { status: 'check-required', blocker: 'chrome-reference-check-required' },
        desktopReferences: { status: 'check-required', blocker: 'desktop-reference-check-required' },
        officialChatGptFolderApiProven: false,
      };
    }
    if (!confirmationOk) META_addCode(preview.blockers, 'delete-confirmation-required');
    META_addCode(preview.warnings, 'chrome-reference-check-required');
    META_addCode(preview.warnings, 'desktop-reference-check-required');
    META_addCode(preview.warnings, 'official-chatgpt-folder-api-unproven');
    preview.canApply = preview.blockers.length === 0 && !!folder && confirmationOk;
    return preview;
  }

  function API_previewMetadataOperation(operation) {
    const data = STORE_readData();
    const preview = META_operationBase(operation);
    if (preview.operationType === 'change-folder-color') return META_previewColorOperation(operation, preview, data);
    if (preview.operationType === 'create-folder') return META_previewCreateOperation(operation, preview, data);
    if (preview.operationType === 'rename-folder') return META_previewRenameOperation(operation, preview, data);
    if (preview.operationType === 'delete-folder') return META_previewDeleteOperation(operation, preview, data);
    META_addCode(preview.blockers, 'unsupported-operation-type');
    return preview;
  }

  function API_applyMetadataOperation(operation, options = {}) {
    const opts = META_safeObject(options);
    const op = META_safeObject(operation);
    const optionsConfirmation = META_cleanString(opts.confirmation);
    const operationForPreview = op.operationType === 'delete-folder' && optionsConfirmation && !META_cleanString(op.confirmation)
      ? { ...op, confirmation: optionsConfirmation }
      : operation;
    const preview = API_previewMetadataOperation(operationForPreview);
    if (opts.dryRun === true) return { ...preview, dryRun: true };
    const canApplyOperation = preview.operationType === 'change-folder-color'
      || preview.operationType === 'create-folder'
      || preview.operationType === 'rename-folder'
      || preview.operationType === 'delete-folder';
    if (!canApplyOperation) {
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: false,
        applied: false,
        noMutation: true,
        writesPerformed: 0,
        operationType: preview.operationType,
        folderId: preview.folderId,
        before: preview.before,
        after: preview.after,
        blockers: preview.blockers.length ? preview.blockers : [{ code: `${preview.operationType || 'operation'}-not-enabled-yet` }],
        warnings: preview.warnings,
      };
    }
    if (!preview.canApply) {
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: false,
        applied: false,
        noMutation: true,
        writesPerformed: 0,
        operationType: preview.operationType,
        folderId: preview.folderId,
        before: preview.before,
        after: preview.after,
        blockers: preview.blockers,
        warnings: preview.warnings,
      };
    }
    if (preview.operationType === 'create-folder') {
      const result = STORE_createFolder(preview.after?.name || META_safeObject(operationForPreview).after?.name || META_safeObject(operationForPreview).name || '', {
        id: preview.after?.folderId || preview.after?.id || META_safeObject(operationForPreview).folderId || '',
        source: 'folder-metadata-operation',
      });
      if (!result.ok) {
        return {
          schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
          ok: false,
          applied: false,
          noMutation: true,
          writesPerformed: 0,
          operationType: preview.operationType,
          folderId: preview.folderId,
          before: preview.before,
          after: preview.after,
          blockers: (result.blockers || []).map((code) => ({ code })),
          warnings: preview.warnings.concat((result.warnings || []).map((code) => ({ code }))),
        };
      }
      const afterData = STORE_readData();
      const afterFolder = META_findFolder(afterData, result.folderId);
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: true,
        applied: true,
        noMutation: false,
        writesPerformed: 1,
        operationType: preview.operationType,
        folderId: result.folderId,
        before: preview.before,
        after: afterFolder ? META_folderSummary(afterData, afterFolder) : null,
        blockers: [],
        warnings: preview.warnings,
      };
    }
    if (preview.operationType === 'delete-folder') {
      if (!preview.canApply) {
        return {
          schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
          ok: false,
          applied: false,
          noMutation: true,
          writesPerformed: 0,
          operationType: preview.operationType,
          folderId: preview.folderId,
          before: preview.before,
          after: preview.after,
          blockers: preview.blockers,
          warnings: preview.warnings,
        };
      }
      const result = STORE_deleteEmptyFolder(preview.folderId, {
        source: 'folder-metadata-operation',
      });
      if (!result.ok) {
        return {
          schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
          ok: false,
          applied: false,
          noMutation: true,
          writesPerformed: 0,
          operationType: preview.operationType,
          folderId: preview.folderId,
          before: preview.before,
          after: preview.after,
          blockers: (result.blockers || []).map((code) => ({ code })),
          warnings: preview.warnings.concat((result.warnings || []).map((code) => ({ code }))),
        };
      }
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: true,
        applied: true,
        noMutation: false,
        writesPerformed: 1,
        operationType: preview.operationType,
        folderId: preview.folderId,
        before: preview.before,
        after: null,
        blockers: [],
        warnings: preview.warnings,
      };
    }
    if (preview.operationType === 'rename-folder') {
      if ((preview.before?.name || '') === (preview.after?.name || '')) {
        return {
          schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
          ok: true,
          applied: false,
          noMutation: true,
          writesPerformed: 0,
          operationType: preview.operationType,
          folderId: preview.folderId,
          before: preview.before,
          after: preview.before,
          blockers: [],
          warnings: preview.warnings,
        };
      }
      const result = STORE_renameFolder(preview.folderId, preview.after?.name || '', {
        source: 'folder-metadata-operation',
      });
      if (!result.ok) {
        return {
          schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
          ok: false,
          applied: false,
          noMutation: true,
          operationType: preview.operationType,
          folderId: preview.folderId,
          before: preview.before,
          after: preview.after,
          blockers: (result.blockers || []).map((code) => ({ code })),
          warnings: preview.warnings,
        };
      }
      const afterData = STORE_readData();
      const afterFolder = META_findFolder(afterData, preview.folderId);
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: true,
        applied: !!result.applied,
        noMutation: !result.applied,
        writesPerformed: result.applied ? 1 : 0,
        operationType: preview.operationType,
        folderId: preview.folderId,
        before: preview.before,
        after: afterFolder ? META_folderSummary(afterData, afterFolder) : preview.after,
        blockers: [],
        warnings: preview.warnings,
      };
    }
    if ((preview.before?.iconColor || '') === (preview.after?.iconColor || '')) {
      return {
        schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        ok: true,
        applied: false,
        noMutation: true,
        writesPerformed: 0,
        operationType: preview.operationType,
        folderId: preview.folderId,
        before: preview.before,
        after: preview.before,
        blockers: [],
        warnings: preview.warnings,
      };
    }
    STORE_setFolderIconColor(preview.folderId, preview.after?.iconColor || '');
    const afterData = STORE_readData();
    const afterFolder = META_findFolder(afterData, preview.folderId);
    return {
      schema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
      ok: true,
      applied: true,
      noMutation: false,
      writesPerformed: 1,
      operationType: preview.operationType,
      folderId: preview.folderId,
      before: preview.before,
      after: afterFolder ? META_folderSummary(afterData, afterFolder) : null,
      blockers: [],
      warnings: preview.warnings,
    };
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

  function UI_copyTextValue(value, label = 'Value') {
    const text = String(value || '').trim();
    if (!text) return false;
    if (W.navigator?.clipboard?.writeText) {
      W.navigator.clipboard.writeText(text).catch((error) => DIAG_err('copyText', error));
      return true;
    }
    try {
      W.prompt?.(label, text);
      return true;
    } catch (error) {
      DIAG_err('copyTextFallback', error);
      return false;
    }
  }

  function UI_openFolderActionsPop(anchorEl, folder, afterChange = null) {
    if (!anchorEl || !folder) return;
    const folderId = String(folder.id || folder.folderId || '').trim();
    const folderName = String(folder.name || folder.title || folderId || 'Folder');
    const folderColor = STORE_normalizeProjectColor(folder.iconColor || folder.color);
    return UI_openFolderPop(anchorEl, [
      { type: 'title', label: 'Folder actions' },
      UI_colorGridItem('Color', folderColor, (color) => {
        STORE_setFolderIconColor(folderId, color);
        afterChange?.();
      }, true),
      'sep',
      {
        label: 'Open folder',
        iconSvg: FRAG_SVG_FOLDER,
        onClick: () => UI_openFolderByMode(folderId),
      },
      'sep',
      {
        label: 'Open in Studio',
        iconSvg: FRAG_SVG_FOLDER,
        onClick: () => {
          const hash = `#/saved?folder=${encodeURIComponent(folderId)}`;
          H2O.archiveBoot?.openWorkbench?.(hash);
        },
      },
      'sep',
      {
        label: 'Rename folder',
        onClick: async () => {
          const next = await UI_openNameModal({
            title: 'Rename folder',
            placeholder: 'Folder name',
            initialValue: folderName,
            confirmText: 'Rename'
          });
          if (!next) return;

          const result = STORE_renameFolder(folderId, next, {
            source: 'folder-actions-rename',
            rerender: false,
          });
          if (!result.ok) {
            if ((result.blockers || []).includes('same-name-conflict')) return alert('Folder already exists.');
            if ((result.blockers || []).includes('reserved-folder-name')) return alert(`${next} is a view, not a folder.`);
            return alert('Folder rename blocked.');
          }
          if (result.applied) {
            afterChange?.();
            ENGINE_rerenderAllSections();
          }
        }
      },
      'sep',
      {
        label: 'Delete folder',
        danger: true,
        onClick: async () => {
          const preview = API_previewMetadataOperation({
            schema: FOLDER_METADATA_OPERATION_SCHEMA,
            operationType: 'delete-folder',
            folderId,
            sourceSurface: 'native-chatgpt',
            reason: 'Native folder action delete preview',
          });
          const blockerCodes = (preview.blockers || []).map((entry) => String(entry?.code || entry || '')).filter(Boolean);
          if (blockerCodes.includes('delete-non-empty-folder-blocked')) {
            return alert('Only empty folders can be deleted.');
          }
          const hardBlockers = blockerCodes.filter((code) => code !== 'delete-confirmation-required');
          if (hardBlockers.length) {
            return alert(`Folder delete blocked: ${hardBlockers[0]}`);
          }

          const confirmed = await UI_openExactConfirmationModal({
            title: 'Delete empty folder',
            message: `Delete "${folderName}" from H2O folders. This only applies to empty folders and does not delete chats.`,
            requiredText: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            confirmText: 'Delete',
            inputLabel: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            danger: true,
          });
          if (!confirmed) return;

          const result = API_applyMetadataOperation({
            schema: FOLDER_METADATA_OPERATION_SCHEMA,
            operationType: 'delete-folder',
            folderId,
            confirmation: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
            sourceSurface: 'native-chatgpt',
            reason: 'Native folder action empty delete',
          });
          if (!result.ok || !result.applied) {
            const resultBlockers = (result.blockers || []).map((entry) => String(entry?.code || entry || '')).filter(Boolean);
            if (resultBlockers.includes('delete-non-empty-folder-blocked')) return alert('Only empty folders can be deleted.');
            return alert(`Folder delete blocked${resultBlockers[0] ? `: ${resultBlockers[0]}` : '.'}`);
          }
          UI_closeFolderPop();
          afterChange?.();
          ENGINE_rerenderAllSections();
          UI_refreshActivePageForAppearance('folder', folderId);
        }
      },
      'sep',
      {
        label: 'Copy folder ID',
        onClick: () => UI_copyTextValue(folderId, 'Folder ID'),
      },
    ], { menuKind: 'folder-actions', folderId });
  }

    /* Phase C8: moved to 0F4a — function UI_openCategoryAppearanceEditor */

  /* Popover (folder row actions) */
  function UI_getFolderPopLayer() {
    let layer = D.querySelector('[data-h2o-folder-pop-layer="1"]');
    if (layer instanceof HTMLElement) return layer;
    layer = D.createElement('div');
    layer.setAttribute('data-h2o-folder-pop-layer', '1');
    layer.setAttribute(ATTR_CGXUI_OWNER, SkID);
    layer.style.cssText = [
      'position:fixed',
      'inset:0',
      `z-index:${CFG_FSECTION_FLOATING_Z}`,
      'pointer-events:none',
      'overflow:visible',
      'contain:none',
      'isolation:isolate',
    ].join(';');
    D.documentElement.appendChild(layer);
    CLEAN.nodes.add(layer);
    return layer;
  }

  function UI_closeFolderPop() {
    if (typeof STATE.popPositionOff === 'function') {
      try { STATE.popPositionOff(); } catch {}
      STATE.popPositionOff = null;
    }
    try { STATE.popAnchorEl?.setAttribute?.('aria-expanded', 'false'); } catch {}
    STATE.popAnchorEl = null;
    if (STATE.popEl) SAFE_remove(STATE.popEl);
    STATE.popEl = null;
  }

  function UI_openFolderPop(anchorEl, items, opts = {}) {
    UI_ensureStyle();
    LIBCORE_registerFoldersOwner();
    UI_closeFolderPop();

    const pop = D.createElement('div');
    pop.setAttribute(ATTR_CGXUI, UI_FSECTION_POP);
    pop.setAttribute(ATTR_CGXUI_OWNER, SkID);
    // Phase 14 polish: opt the popup into the H2O sand-glass skin so its
    // surface picks up the registry-driven blurred-glass treatment used by
    // other premium popups in the app (e.g. the auto-title emoji picker).
    pop.setAttribute('data-h2o-glass', 'panel');
    pop.setAttribute('data-h2o-skin', 'sand-glass');
    pop.setAttribute('data-h2o-skin-surface', 'sand-glass');
    pop.setAttribute('data-h2o-folder-menu-placement', 'body-fixed');
    pop.style.cssText = [
      'position:fixed',
      `z-index:${CFG_FSECTION_FLOATING_Z}`,
      'display:flex',
      'flex-direction:column',
      'align-items:stretch',
      'gap:2px',
      'visibility:visible',
      'opacity:1',
      'pointer-events:auto',
      'box-sizing:border-box',
      'min-width:238px',
      'width:max-content',
      'height:auto',
      'min-height:0',
      'max-width:min(360px, calc(100vw - 16px))',
      'max-height:min(78vh, 560px)',
      'padding:6px',
      'overflow-x:hidden',
      'overflow-y:auto',
      'background:var(--bg-elevated-secondary, #181818)',
      'color:var(--text-primary, #fff)',
      'font:14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'border:1px solid var(--border-default, #ffffff26)',
      'border-radius:12px',
      'box-shadow:0 18px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04)',
      'transform:translateZ(0)',
      'will-change:top,left',
    ].join(';');
    if (opts?.menuKind === 'folder-actions') {
      pop.setAttribute('data-h2o-folder-menu', '1');
      pop.setAttribute('data-h2o-folder-id', String(opts.folderId || ''));
    }

    items.forEach((it) => {
      if (it === 'sep') {
        const sep = D.createElement('div');
        sep.setAttribute(ATTR_CGXUI, UI_FSECTION_SEP);
        sep.setAttribute(ATTR_CGXUI_OWNER, SkID);
        sep.style.cssText = [
          'display:block',
          'box-sizing:border-box',
          'height:1px',
          'min-height:1px',
          'margin:4px 6px',
          'padding:0',
          'background:rgba(255,255,255,.12)',
          'flex:0 0 auto',
        ].join(';');
        pop.appendChild(sep);
        return;
      }

      if (it?.type === 'title') {
        const title = D.createElement('div');
        title.setAttribute(ATTR_CGXUI_STATE, 'picker-title');
        title.setAttribute('data-h2o-folder-menu-row', 'title');
        title.style.cssText = [
          'display:block',
          'box-sizing:border-box',
          'width:100%',
          'min-height:24px',
          'padding:7px 10px 5px',
          'color:var(--text-secondary, rgba(255,255,255,.72))',
          'font-size:12px',
          'font-weight:600',
          'line-height:16px',
          'white-space:nowrap',
          'flex:0 0 auto',
        ].join(';');
        title.textContent = it.label || '';
        pop.appendChild(title);
        return;
      }

      if (it?.type === 'color-grid' || it?.type === 'icon-grid') {
        const section = D.createElement('div');
        section.setAttribute(ATTR_CGXUI_STATE, 'picker-section');
        section.setAttribute('data-h2o-folder-menu-row', it.type);
        section.style.cssText = [
          'display:block',
          'box-sizing:border-box',
          'width:100%',
          'min-height:48px',
          'padding:6px 8px 8px',
          'flex:0 0 auto',
        ].join(';');

        const label = D.createElement('div');
        label.setAttribute(ATTR_CGXUI_STATE, 'picker-label');
        label.style.cssText = [
          'display:block',
          'box-sizing:border-box',
          'margin:0 0 7px',
          'color:var(--text-tertiary, rgba(255,255,255,.56))',
          'font-size:11px',
          'line-height:14px',
          'white-space:nowrap',
        ].join(';');
        label.textContent = it.label || '';
        section.appendChild(label);

        const grid = D.createElement('div');
        grid.setAttribute(ATTR_CGXUI_STATE, 'picker-grid');
        grid.style.cssText = [
          'display:flex',
          'flex-direction:row',
          'flex-wrap:nowrap',
          'align-items:center',
          'gap:6px',
          'width:100%',
          'min-height:28px',
          'box-sizing:border-box',
        ].join(';');
        // Phase 14 polish: tag color grids so the stylesheet can flatten them
        // into a single horizontal row that scrolls when needed (matching the
        // user's request that all colors live on one line).
        if (it.type === 'color-grid') grid.setAttribute('data-grid-mode', 'row');

        (Array.isArray(it.options) ? it.options : []).forEach((option) => {
          const b = D.createElement('button');
          b.type = 'button';
          b.setAttribute(ATTR_CGXUI_STATE, it.type === 'color-grid' ? 'color-swatch' : 'icon-choice');
          b.setAttribute('data-h2o-folder-menu-row', it.type === 'color-grid' ? 'color-swatch' : 'icon-choice');
          b.style.cssText = [
            'all:unset',
            'box-sizing:border-box',
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'width:28px',
            'height:28px',
            'min-width:28px',
            'min-height:28px',
            'max-width:28px',
            'max-height:28px',
            'flex:0 0 28px',
            'padding:0',
            'border-radius:8px',
            'cursor:pointer',
            'color:var(--text-primary, #fff)',
          ].join(';');
          b.setAttribute('aria-label', option.label || option.key || '');
          b.title = option.label || option.key || '';

          if (it.type === 'color-grid') {
            const value = STORE_normalizeHexColor(option.value || option.color);
            b.setAttribute('data-cgxui-value', value);
            b.style.setProperty('--swatch-color', value || 'transparent');
            b.style.background = value || 'rgba(255,255,255,.06)';
            b.style.border = '1px solid rgba(255,255,255,.16)';
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

      if (it?.type === 'custom') {
        try {
          const node = typeof it.render === 'function'
            ? it.render({ pop, close: UI_closeFolderPop })
            : it.node;
          if (node) pop.appendChild(node);
        } catch (e) {
          DIAG_err('popCustom', e);
        }
        return;
      }

      const b = D.createElement('button');
      b.type = 'button';
      if (it.danger) b.setAttribute(ATTR_CGXUI_STATE, 'danger');
      b.setAttribute('data-h2o-folder-menu-row', 'action');
      b.style.cssText = [
        'all:unset',
        'box-sizing:border-box',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'width:100%',
        'min-width:0',
        'min-height:38px',
        'height:auto',
        'padding:9px 12px',
        'border-radius:10px',
        'cursor:pointer',
        'color:var(--text-primary, #fff)',
        'font-size:14px',
        'font-weight:400',
        'line-height:20px',
        'white-space:nowrap',
        'text-align:left',
        'flex:0 0 auto',
      ].join(';');
      if (it.danger) b.style.color = 'var(--text-error, #f93a37)';

      if (it.iconEl) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;min-width:20px;flex:0 0 20px;color:currentColor;';
        ico.appendChild(it.iconEl.cloneNode(true));
        b.appendChild(ico);
      } else if (it.iconSvg) {
        const ico = D.createElement('span');
        ico.setAttribute(ATTR_CGXUI_STATE, 'ico');
        ico.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;min-width:20px;flex:0 0 20px;color:currentColor;';
        ico.innerHTML = it.iconSvg;
        b.appendChild(ico);
      }

      const label = D.createElement('span');
      label.style.cssText = 'display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:20px;';
      label.textContent = it.label || '';
      b.appendChild(label);

      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        UI_closeFolderPop();
        SAFE_try('popItem', () => it.onClick?.());
      };

      b.addEventListener('mouseenter', () => {
        b.style.background = 'var(--interactive-bg-secondary-hover, rgba(255,255,255,.10))';
      });
      b.addEventListener('mouseleave', () => {
        b.style.background = 'transparent';
      });
      pop.appendChild(b);
    });

    const layer = UI_getFolderPopLayer();
    layer.appendChild(pop);
    CLEAN.nodes.add(pop);
    STATE.popEl = pop;
    STATE.popAnchorEl = anchorEl;
    try { anchorEl?.setAttribute?.('aria-expanded', 'true'); } catch {}

    const positionPop = () => {
      if (!pop.isConnected || !anchorEl?.isConnected) return;
      const pad = 8;
      const gap = 6;
      const vw = Math.max(320, W.innerWidth || D.documentElement.clientWidth || 0);
      const vh = Math.max(240, W.innerHeight || D.documentElement.clientHeight || 0);
      pop.style.maxWidth = `${Math.min(360, Math.max(220, vw - pad * 2))}px`;
      pop.style.maxHeight = `${Math.max(160, vh - pad * 2)}px`;

      const rA = anchorEl.getBoundingClientRect();
      let rP = pop.getBoundingClientRect();
      const width = Math.min(rP.width, vw - pad * 2);
      const rightLeft = rA.right + gap;
      const leftLeft = rA.left - width - gap;
      let left = rightLeft;
      let placementSide = 'right';
      if (rightLeft + width > vw - pad && leftLeft >= pad) {
        left = leftLeft;
        placementSide = 'left';
      } else if (rightLeft + width > vw - pad) {
        left = Math.min(Math.max(pad, rA.right - width), vw - width - pad);
        placementSide = 'clamped';
      }
      left = Math.max(pad, Math.min(left, vw - width - pad));

      const spaceBelow = Math.max(0, vh - rA.top - pad);
      const maxSideSpace = Math.max(160, spaceBelow);
      pop.style.maxHeight = `${Math.min(vh - pad * 2, maxSideSpace)}px`;
      rP = pop.getBoundingClientRect();

      let top = Math.max(pad, rA.top);
      if (top + rP.height > vh - pad) top = vh - rP.height - pad;
      if (top < pad) top = pad;

      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
      pop.setAttribute('data-h2o-folder-menu-side', placementSide);
    };

    positionPop();
    requestAnimationFrame(positionPop);
    const onViewportChange = () => positionPop();
    W.addEventListener('resize', onViewportChange, true);
    W.addEventListener('scroll', onViewportChange, true);
    let ro = null;
    try {
      ro = new ResizeObserver(() => positionPop());
      ro.observe(pop);
    } catch {}
    STATE.popPositionOff = () => {
      W.removeEventListener('resize', onViewportChange, true);
      W.removeEventListener('scroll', onViewportChange, true);
      try { ro?.disconnect?.(); } catch {}
    };

    // close on outside click
    setTimeout(() => {
      if (!pop.isConnected || STATE.popEl !== pop) return;
      const onDoc = (e) => {
        if (!STATE.popEl) return;
        if (STATE.popEl.contains(e.target)) return;
        if (anchorEl === e.target || anchorEl?.contains?.(e.target)) return;
        UI_closeFolderPop();
      };
      const onKey = (e) => {
        if (e.key === 'Escape') UI_closeFolderPop();
      };
      D.addEventListener('mousedown', onDoc, true);
      D.addEventListener('pointerdown', onDoc, true);
      D.addEventListener('keydown', onKey, true);
      const removeOutsideListeners = () => {
        D.removeEventListener('mousedown', onDoc, true);
        D.removeEventListener('pointerdown', onDoc, true);
        D.removeEventListener('keydown', onKey, true);
      };
      const previousOff = STATE.popPositionOff;
      STATE.popPositionOff = () => {
        try { previousOff?.(); } catch {}
        removeOutsideListeners();
      };
      CLEAN.listeners.add(removeOutsideListeners);
    }, 0);

    return pop;
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
    UI_openCategoriesViewer(groups);
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

  function UI_openExactConfirmationModal({
    title = 'Confirm action',
    message = '',
    requiredText = '',
    confirmText = 'Confirm',
    inputLabel = '',
    danger = false,
  } = {}) {
    UI_ensureStyle();

    const exact = String(requiredText || '').trim();
    return new Promise((resolve) => {
      const ov = D.createElement('div');
      ov.setAttribute(ATTR_CGXUI, UI_FSECTION_MODAL);
      ov.setAttribute(ATTR_CGXUI_OWNER, SkID);
      ov.setAttribute('data-h2o-folder-delete-confirmation', '1');

      const box = D.createElement('div');
      box.setAttribute(ATTR_CGXUI_STATE, 'box');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');

      const hd = D.createElement('div');
      hd.setAttribute(ATTR_CGXUI_STATE, 'hd');

      const t = D.createElement('div');
      t.setAttribute(ATTR_CGXUI_STATE, 'title');
      t.textContent = String(title || 'Confirm action');

      const x = D.createElement('button');
      x.type = 'button';
      x.setAttribute(ATTR_CGXUI_STATE, 'x');
      x.setAttribute('aria-label', 'Close');
      x.textContent = '×';

      hd.appendChild(t);
      hd.appendChild(x);

      const bd = D.createElement('div');
      bd.setAttribute(ATTR_CGXUI_STATE, 'bd');

      if (message) {
        const msg = D.createElement('div');
        msg.setAttribute(ATTR_CGXUI_STATE, 'message');
        msg.textContent = String(message);
        bd.appendChild(msg);
      }

      const phrase = D.createElement('div');
      phrase.setAttribute(ATTR_CGXUI_STATE, 'message');
      phrase.style.marginTop = '10px';
      phrase.textContent = exact ? `Type ${exact} to continue.` : 'Type the required confirmation text to continue.';
      bd.appendChild(phrase);

      const input = D.createElement('input');
      input.placeholder = inputLabel || exact || 'Confirmation';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', inputLabel || `Type ${exact} to confirm`);
      bd.appendChild(input);

      const ft = D.createElement('div');
      ft.setAttribute(ATTR_CGXUI_STATE, 'ft');

      const cancel = D.createElement('button');
      cancel.type = 'button';
      cancel.setAttribute(ATTR_CGXUI_STATE, 'btn');
      cancel.textContent = 'Cancel';

      const ok = D.createElement('button');
      ok.type = 'button';
      ok.setAttribute(ATTR_CGXUI_STATE, 'primary');
      ok.textContent = confirmText || 'Confirm';
      if (danger) {
        ok.style.background = 'rgba(220,38,38,.78)';
        ok.style.borderColor = 'rgba(248,113,113,.45)';
        ok.style.color = '#fff';
      }

      const sync = () => { ok.disabled = input.value.trim() !== exact; };
      sync();

      ft.appendChild(cancel);
      ft.appendChild(ok);

      box.appendChild(hd);
      box.appendChild(bd);
      box.appendChild(ft);

      ov.appendChild(box);
      D.body.appendChild(ov);
      CLEAN.nodes.add(ov);

      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        SAFE_remove(ov);
        resolve(value);
      };

      x.onclick = () => done(false);
      cancel.onclick = () => done(false);
      ok.onclick = () => { if (!ok.disabled) done(true); };

      ov.addEventListener('mousedown', (e) => { if (e.target === ov) done(false); });
      input.addEventListener('input', sync);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Enter') {
          e.preventDefault();
          if (!ok.disabled) ok.click();
        }
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
          case 'capture-requires-open-chat':
            return 'Open this chat first to capture transcript.';
          case 'capture-unavailable':
            return 'Capture is not available from this page. Use Capture / Save from Command Bar first.';
          case 'capture-transcript-missing':
            return 'Could not capture transcript; no folder save was created.';
          case 'capture-failed':
            return 'Could not save this chat. Try Capture / Save from Command Bar.';
          case 'capture-target-unavailable':
            return 'Could not load that chat from ChatGPT. Open the chat and try again.';
          case 'capture-local-only':
            return 'The chat was saved locally, but Studio is not connected yet. Refresh the page and try again.';
          case 'capture-not-studio-visible':
            return 'Captured transcript was not available to Studio/Desktop sync. Refresh the page and try again.';
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
            title: DOM_findTitleForHref(href),
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

  function UI_isNoisySurfaceChatTitle(raw) {
    const text = UTIL_normText(raw || '');
    if (!text) return true;
    const actionHits = (text.match(/\b(?:Open|Rename|Delete|Share|Archive|Copy|More|Options|Color|Studio)\b/gi) || []).length;
    const metadataHits = (text.match(/\b(?:answers?|Last edited|Today|Yesterday)\b/gi) || []).length;
    const dateHits = (text.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b/g) || []).length;
    return actionHits >= 2 || metadataHits + dateHits >= 3;
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

  function UI_getNativeTrailingButtonTemplate() {
    const selectors = [
      'nav .ho-project-row button.__menu-item-trailing-btn',
      'aside .ho-project-row button.__menu-item-trailing-btn',
      'nav button.__menu-item-trailing-btn:not([data-cgxui])',
      'aside button.__menu-item-trailing-btn:not([data-cgxui])',
    ];
    for (const selector of selectors) {
      const btn = D.querySelector(selector);
      if (btn?.tagName === 'BUTTON') return btn;
    }
    return null;
  }

  function UI_makeNativeLikeMoreButton(label, token) {
    // Keep the action affordance H2O-owned. Cloning ChatGPT's trailing button
    // can carry host focus/selection classes into our synthetic rows, which
    // makes clicks select the row instead of opening the H2O popup.
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'h2oFolderActionButton';
    btn.setAttribute('data-h2o-trailing-button', 'true');
    btn.setAttribute('aria-label', label || 'More actions');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = label || 'More actions';
    btn.disabled = false;
    btn.tabIndex = 0;
    btn.style.cssText = [
      'all:unset',
      'box-sizing:border-box',
      'position:absolute',
      'right:9px',
      'top:50%',
      'transform:translateY(-50%)',
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'width:30px',
      'min-width:30px',
      'max-width:30px',
      'height:30px',
      'min-height:30px',
      'max-height:30px',
      'flex:0 0 30px',
      'padding:0',
      'margin:0',
      'border:0',
      'border-radius:8px',
      'background:transparent',
      'color:var(--text-primary, #fff)',
      'cursor:pointer',
      'pointer-events:auto',
      'touch-action:manipulation',
      'z-index:20',
      'opacity:.72',
      'visibility:visible',
      'appearance:none',
      '-webkit-appearance:none',
      'outline:none',
    ].join(';');
    if (token) btn.setAttribute(ATTR_CGXUI, token);
    btn.setAttribute(ATTR_CGXUI_OWNER, SkID);
    /* R4.7.6 — flsc-folder-more token retired; non-sidebar folder action buttons use explicit data-h2o attributes at call sites. */
    btn.innerHTML = FRAG_SVG_MORE;
    btn.querySelectorAll?.('svg')?.forEach((svg) => {
      svg.style.width = '20px';
      svg.style.height = '20px';
      svg.style.display = 'block';
      svg.style.flex = '0 0 20px';
      svg.style.pointerEvents = 'none';
    });
    return btn;
  }

  function UI_bindFolderMoreButton(btn, onOpen) {
    if (!(btn instanceof HTMLElement) || typeof onOpen !== 'function') return btn;
    let lastOpenAt = 0;
    const stop = (event) => {
      if (event?.currentTarget instanceof HTMLElement) {
        event.currentTarget.style.opacity = '1';
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const open = (event) => {
      stop(event);
      const now = Date.now();
      if (now - lastOpenAt < 120) return;
      lastOpenAt = now;
      onOpen(event);
    };
    btn.addEventListener('pointerdown', open, true);
    btn.addEventListener('touchstart', open, true);
    btn.addEventListener('pointerup', stop, true);
    btn.addEventListener('mousedown', open, true);
    btn.addEventListener('mouseup', stop, true);
    btn.addEventListener('click', open, true);
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open(event);
      if (event.key === 'Escape') UI_closeFolderPop();
    }, true);
    return btn;
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
  /* R4.7.6 — Folders sidebar row/list render path retired. Code moved to:
   *   retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js
   * (Block 4). Function kept as a no-op compatibility stub for
   * historical internal callers; folder data/store and capture paths
   * remain live below. */
  function UI_buildFoldersSection(_projectsSection, _existingSection = null, _reason = 'build') {
    return null;
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
      // When the user hasn't picked an icon for this category yet, render the
      // category panels placeholder. Falls back to the legacy helper if the
      // Categories module is older and doesn't expose the new method.
      const cats = LIBCORE_getCategoriesOwner();
      const iconSvg = (typeof cats?.iconSvgForAppearance === 'function')
        ? cats.iconSvgForAppearance(appearance)
        : UI_categoryIconSvg(appearance.icon);
      UI_injectIcon(row, iconSvg, { color: appearance.color });
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

        const more = UI_makeNativeLikeMoreButton('Category appearance', UI_FSECTION_CATEGORY_MORE);
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
    const targetHref = API_resolveSaveToFolderTarget(fullHref);

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

    const createBtn = D.createElement('button');
    createBtn.type = 'button';
    createBtn.setAttribute('data-h2o-folder-menu-action', 'create-folder');
    createBtn.textContent = '+ Create Folder';
    createBtn.onclick = () => {
      const name = W.prompt('Create folder', '');
      if (name === null) return;
      const result = STORE_createFolder(name, {
        source: 'save-to-folder-menu-create',
        openInline: false,
        rerender: false,
      });
      if (!result?.ok) {
        const reason = Array.isArray(result?.blockers) && result.blockers.length
          ? result.blockers.join(', ')
          : 'Could not create folder';
        UI_showLibraryToast(reason, 'err');
        return;
      }
      EVENT_flushLibraryFolderSync('save-to-folder-menu-create');
      ENGINE_rerenderAllSections();
      UI_openAssignMenu(x, y, fullHref);
    };
    m.appendChild(createBtn);

    d.folders.forEach((f) => {
      const inFolder = API_getBinding(targetHref).folderId === String(f.id || '');

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `${UTIL_escHtml(f.name)} <span style="margin-left:auto;opacity:.7;">${inFolder ? '✓' : ''}</span>`;

      btn.onclick = async () => {
        const result = inFolder
          ? API_setBinding(targetHref, '', { source: 'save-to-folder-menu', reason: 'menu-clear-binding', allowRegistryRecord: true })
          : await API_saveAndBindToFolder({
              href: targetHref,
              folderId: f.id,
              folderName: f.name,
              title: DOM_findTitleForHref(targetHref),
              source: 'save-to-folder-menu',
            });
        if (result?.status === 'chat-not-saved') {
          UI_openSaveBeforeFolderModal({
            chatId: result.chatId,
            href: result.href,
            folderId: f.id,
            folderName: f.name,
          });
          return;
        }
        if (!result?.ok) {
          UI_showLibraryToast(String(result?.message || result?.reason || result?.status || 'Could not save to folder'), 'err');
          return;
        }
        EVENT_flushLibraryFolderSync(inFolder ? 'save-to-folder-menu-clear' : 'save-to-folder-menu-bind');
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
    STATE.menuDiag.saveToFolderAttempts += 1;

    DOM_ensureMenuContext(menuEl, 'save-to-folder');

    if (menuEl.querySelector(`[${ATTR_CGXUI}="${SkID}-add-to-folder"]`)) return;

    const moveItem = DOM_findMenuAnchorItem(menuEl);
    if (!moveItem) { STATE.menuDiag.anchorMisses += 1; return; }
    STATE.menuDiag.lastAnchorText = UTIL_normText(moveItem.textContent || '').slice(0, 60);

    const href = STATE.lastChatHrefForMenu;
    if (!href) { STATE.menuDiag.hrefMisses += 1; return; }

    const addItem = moveItem.cloneNode(true);
    // Internal selector kept as `${SkID}-add-to-folder` (Phase 4): we
    // changed only the user-visible label. Renaming the data-cgxui token
    // would break idempotency against any persisted DOM or any external
    // tooling that targets `[data-cgxui="flsc-add-to-folder"]`.
    addItem.setAttribute(ATTR_CGXUI, `${SkID}-add-to-folder`);
    DOM_setMenuItemLabel(addItem, 'Save to Folder');

    addItem.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = addItem.getBoundingClientRect();
      UI_openAssignMenu(r.right + 6, Math.max(8, r.top - 8), href);
    }, true);

    moveItem.parentNode.insertBefore(addItem, moveItem.nextSibling);
    STATE.menuDiag.saveToFolderInjected += 1;
  }

  /* Radix "..." menu injection: Add "Add to Library" item (Phase 3).
     STRICTLY additive — sits above the existing "Add to Folder" item, uses
     the same anchor (cloned "Move to project") for visual parity, and
     delegates ALL business logic to H2O.LibraryActions. No transcript
     capture, no folder binding, no archive write. */
  function ENGINE_injectAddToLibrary(menuEl) {
    if (!menuEl) return;
    STATE.menuDiag.addToLibraryAttempts += 1;

    // Same idempotency guard pattern as ENGINE_injectAddToFolder.
    if (menuEl.querySelector(`[${ATTR_CGXUI}="${SkID}-add-to-library"]`)) return;

    // Same anchor as Add-to-Folder so styling, focus rings, and keyboard
    // navigation match native menu items byte-for-byte.
    const moveItem = DOM_findMenuAnchorItem(menuEl);
    if (!moveItem) { STATE.menuDiag.anchorMisses += 1; return; }

    // Reuse the same chat-identity STATE the existing menu uses.
    DOM_ensureMenuContext(menuEl, 'add-to-library');
    const href = STATE.lastChatHrefForMenu;
    if (!href) { STATE.menuDiag.hrefMisses += 1; return; }

    const item = moveItem.cloneNode(true);
    item.setAttribute(ATTR_CGXUI, `${SkID}-add-to-library`);
    DOM_setMenuItemLabel(item, 'Add to Library');

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleAddToLibraryClick(href).catch((err) => {
        try { console.warn('[H2O.folders] add-to-library handler threw', err); } catch {}
        UI_showLibraryToast('Could not add to Library', 'err');
      });
    }, true);

    // Order: "Add to Library" goes ABOVE "Add to Folder". If Add-to-Folder
    // already landed (the callsite invokes us second), insert before it;
    // otherwise insert right after Move-to-project and Add-to-Folder will
    // land below us when it runs.
    const existingAddToFolder = menuEl.querySelector(`[${ATTR_CGXUI}="${SkID}-add-to-folder"]`);
    if (existingAddToFolder && existingAddToFolder.parentNode === moveItem.parentNode) {
      existingAddToFolder.parentNode.insertBefore(item, existingAddToFolder);
    } else {
      moveItem.parentNode.insertBefore(item, moveItem.nextSibling);
    }
    STATE.menuDiag.addToLibraryInjected += 1;
  }

  /* Best-effort title resolution for a sidebar row by href. The radix menu
     fires from a row whose anchor still lives in the sidebar DOM; we read
     the anchor's text content so the linked Library record gets the same
     title the user sees in the sidebar. Returns '' on any miss; the
     downstream LibraryActions.addToLibrary will fall back to document.title
     or 'Untitled chat'. */
  function DOM_findTitleForHref(href) {
    if (!href || typeof href !== 'string') return '';
    const ctx = STATE.lastChatMenuContext;
    if (ctx?.href === href && ctx.title) return String(ctx.title || '').trim().slice(0, 200);
    try {
      const safe = href.replace(/"/g, '\\"');
      const a = D.querySelector(`a[href="${safe}"]`);
      if (a) return (a.textContent || '').trim().slice(0, 200);
    } catch {}
    return '';
  }

  function API_isGenericChatTitle(value) {
    const title = String(value || '').trim();
    if (!title) return true;
    if (/^(new chat|untitled|untitled chat|chatgpt|chat|imported chat|linked chat|link)$/i.test(title)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(title)) return true;
    return false;
  }

  function API_currentChatTitleState() {
    try {
      const api = W.H2O && W.H2O.ChatTitle;
      if (api && typeof api.getState === 'function') return api.getState() || null;
    } catch {}
    return null;
  }

  function API_titleMetadataPatch(title, source) {
    const cleanTitle = String(title || '').trim();
    const titleSource = API_isGenericChatTitle(cleanTitle) ? 'derived' : 'title';
    return {
      title: cleanTitle,
      titleSource,
      displayTitle: cleanTitle,
      sourceTitle: cleanTitle,
      pageTitle: cleanTitle,
      originalTitle: cleanTitle,
      meta: {
        displayTitle: cleanTitle,
        sourceTitle: cleanTitle,
        pageTitle: cleanTitle,
        originalTitle: cleanTitle,
        titleSource,
        titleCapturedFrom: String(source || 'save-to-folder'),
      },
    };
  }

  function API_captureTitleCandidates(capture) {
    const snapshot = capture && typeof capture === 'object' ? (capture.snapshot || capture.latest || capture.meta || {}) : {};
    const meta = capture && typeof capture === 'object' ? (capture.meta || capture.snapshot?.meta || capture.latest?.meta || {}) : {};
    return [
      capture?.title,
      capture?.displayTitle,
      capture?.sourceTitle,
      capture?.pageTitle,
      capture?.originalTitle,
      snapshot?.title,
      snapshot?.displayTitle,
      snapshot?.sourceTitle,
      snapshot?.pageTitle,
      snapshot?.originalTitle,
      meta?.title,
      meta?.displayTitle,
      meta?.sourceTitle,
      meta?.pageTitle,
      meta?.originalTitle,
    ];
  }

  function API_resolveSaveChatTitle({ explicitTitle = '', href = '', capture = null } = {}) {
    const state = API_currentChatTitleState() || {};
    const candidates = [
      explicitTitle,
      ...API_captureTitleCandidates(capture),
      DOM_findTitleForHref(href),
      state.baseTitle,
      state.title,
      state.currentTitle,
      state.displayTitle,
      state.sourceTitle,
      state.pageTitle,
      state.originalTitle,
    ];
    try { candidates.push(D.title || ''); } catch {}
    for (const candidate of candidates) {
      const title = String(candidate || '').trim();
      if (title && !API_isGenericChatTitle(title)) return title.slice(0, 240);
    }
    for (const candidate of candidates) {
      const title = String(candidate || '').trim();
      if (title) return title.slice(0, 240);
    }
    return 'Untitled chat';
  }

  /* Add-to-Library click handler. Resolves identity from the menu's href,
     calls H2O.LibraryActions.addToLibrary, and routes the result to the
     three documented feedback strings. Never throws. */
  async function handleAddToLibraryClick(href) {
    if (!H2O.LibraryActions || typeof H2O.LibraryActions.addToLibrary !== 'function') {
      try { console.warn('[H2O.folders] Add to Library clicked but H2O.LibraryActions is unavailable'); } catch {}
      UI_showLibraryToast('Library not ready', 'err');
      return;
    }
    const reg = H2O.ChatRegistry;
    const chatId = (reg && typeof reg.parseChatIdFromHref === 'function')
      ? (reg.parseChatIdFromHref(href) || '')
      : ((String(href).match(/\/c\/([^/?#]+)/) || [])[1] || '');
    const title = DOM_findTitleForHref(href);

    let result;
    try {
      result = await H2O.LibraryActions.addToLibrary({
        chatId,
        href,
        title,
        source: 'native-sidebar-menu',
      });
    } catch (err) {
      try { console.warn('[H2O.folders] LibraryActions.addToLibrary threw', err); } catch {}
      UI_showLibraryToast('Could not add to Library', 'err');
      return;
    }
    if (!result || result.ok !== true) {
      UI_showLibraryToast('Could not add to Library', 'err');
      return;
    }
    if (result.alreadyLinked === true) {
      UI_showLibraryToast('Already in Library', 'info');
      return;
    }
    UI_showLibraryToast('Added to Library', 'ok');
  }

  /* Minimal ephemeral toast used only by the Add-to-Library click feedback.
     No new notification system — a single absolutely-positioned pill that
     auto-dismisses after 2 seconds. Inline styles keep it independent of
     CSS file edits. role="status" + aria-live for accessibility. */
  function UI_showLibraryToast(message, kind) {
    const k = String(kind || 'info');
    try {
      // De-dup: if a previous toast is still on-screen, replace it so a
      // rapid double-click doesn't stack pills.
      const existing = D.getElementById('h2o-add-to-library-toast');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const toast = D.createElement('div');
      toast.id = 'h2o-add-to-library-toast';
      toast.setAttribute(ATTR_CGXUI, `${SkID}-toast`);
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      const bg = k === 'err' ? '#3b1f1f' : k === 'ok' ? '#1f3b25' : '#262626';
      const fg = k === 'err' ? '#fca5a5' : k === 'ok' ? '#a7e8b5' : '#e5e5e5';
      toast.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:24px',
        'transform:translateX(-50%)',
        'z-index:2147483646',
        'background:' + bg,
        'color:' + fg,
        'padding:8px 14px',
        'border-radius:10px',
        'font-size:13px',
        'font-weight:500',
        'box-shadow:0 4px 14px rgba(0,0,0,.45)',
        'pointer-events:none',
        'transition:opacity .18s ease',
        'opacity:0',
        'font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      ].join(';');
      toast.textContent = String(message || '');
      D.body.appendChild(toast);
      requestAnimationFrame(() => { try { toast.style.opacity = '1'; } catch {} });
      W.setTimeout(() => {
        try { toast.style.opacity = '0'; } catch {}
        W.setTimeout(() => { try { toast.parentNode && toast.parentNode.removeChild(toast); } catch {} }, 250);
      }, 2000);
    } catch {
      // Last-resort fallback: never throw from a toast.
      try { console.info('[H2O.folders] toast:', message); } catch {}
    }
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
    // Phase 12 polish: same hideViewActions seam as 0F1a UI_makeInShellPageShell.
    if (!opts.hideViewActions) {
      addViewAction('Pinned', '#/pinned');
      addViewAction('Archive', '#/archive');
    }
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
    row.setAttribute('data-h2o-folder-card', '1');
    row.setAttribute('data-h2o-folder-chat-id', String(item.chatId || ''));

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
    li.setAttribute(ATTR_CGXUI_STATE, 'chat-item');
    li.setAttribute('data-h2o-folder-card', '1');
    li.setAttribute('data-h2o-folder-chat-id', String(item.chatId || ''));

    const row = D.createElement('a');
    row.href = item.href;
    row.draggable = false;
    row.setAttribute(ATTR_CGXUI_STATE, 'row');
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

    li.appendChild(row);
    list.appendChild(li);
  }

  function UI_appendInShellFolderRow(list, folder) {
    const li = D.createElement('li');
    li.setAttribute(ATTR_CGXUI_STATE, 'folder-item');
    li.setAttribute('data-h2o-folder-id', String(folder.id || folder.folderId || ''));

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

    const folderData = STORE_readData();
    const hrefs = STORE_listFolderItems(folderData, folder.id);
    const sub = D.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = `${hrefs.length} chats`;
    body.appendChild(sub);

    btn.appendChild(body);
    li.appendChild(btn);
    const more = UI_bindFolderMoreButton(UI_makeNativeLikeMoreButton('Folder actions', ''), () => {
      UI_openFolderActionsPop(more, folder, () => UI_openFoldersViewer(null, { skipHistory: true }));
    });
    more.setAttribute(ATTR_CGXUI_STATE, 'folder-action');
    more.setAttribute('data-h2o-folder-id', String(folder.id || folder.folderId || ''));
    more.setAttribute('data-h2o-folder-page-action-button', '1');
    li.appendChild(more);
    list.appendChild(li);
  }

    /* Phase C8: moved to 0F4a — function UI_appendInShellCategoryRow */

  function UI_openFoldersViewer(foldersRaw = null, opts = {}) {
    UI_ensureStyle();

    const allFolders = STORE_readData().folders.filter((folder) => !UTIL_isReservedFolderViewName(folder.name));
    const folders = Array.isArray(foldersRaw) ? foldersRaw.filter(Boolean) : allFolders;
    const { page, list } = UI_makeInShellPageShell('Folders', `${folders.length} folders`, 'Chats', {
      kind: 'folders',
      iconSvg: FRAG_SVG_FOLDER,
    });
    folders.forEach((folder) => UI_appendInShellFolderRow(list, folder));

    if (UI_mountInShellPage(page)) {
      ROUTE_commitPageRoute({ view: 'folders', id: '' }, opts);
      return page;
    }

    UI_closeViewer();
    const { box, list: fallbackList } = UI_makeViewerShell('Folders', `${folders.length} folders`, { mode: CFG_CATEGORY_OPEN_MODE_PANEL });
    folders.forEach((folder) => {
      const row = D.createElement('div');
      row.setAttribute(ATTR_CGXUI_STATE, 'folder-item');
      row.setAttribute('data-h2o-folder-id', String(folder.id || folder.folderId || ''));
      row.style.position = 'relative';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '4px';

      const btn = D.createElement('button');
      btn.type = 'button';
      btn.onclick = () => UI_openFolderByMode(folder.id);
      btn.style.flex = '1 1 auto';
      btn.style.minWidth = '0';
      const body = D.createElement('div');
      body.style.minWidth = '0';
      body.style.flex = '1 1 auto';
      const title = D.createElement('div');
      title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
      title.textContent = folder.name || folder.id || 'Folder';
      body.appendChild(title);
      btn.appendChild(body);
      const more = UI_bindFolderMoreButton(UI_makeNativeLikeMoreButton('Folder actions', ''), () => {
        UI_openFolderActionsPop(more, folder, () => UI_openFoldersViewer(folders, opts));
      });
      more.setAttribute(ATTR_CGXUI_STATE, 'folder-action');
      more.setAttribute('data-h2o-folder-id', String(folder.id || folder.folderId || ''));
      more.setAttribute('data-h2o-folder-page-action-button', '1');
      row.appendChild(btn);
      row.appendChild(more);
      fallbackList.appendChild(row);
    });
    D.body.appendChild(box);
    CLEAN.nodes.add(box);
    STATE.viewerEl = box;
    return box;
  }

  function UI_getFolderSurfaceData(folderId) {
    const id = String(folderId || '').trim();
    let store = UTIL_storage.getJSON(KEY_LEG_VIEWER_STORE, {});
    if (!store || typeof store !== 'object') store = {};
    const folders = store.folders || [];
    const chatToFolders = store.chatToFolders || {};
    const data = STORE_readData();
    const core = FOLDERCORE_get();

    const currentDataFolder = core && typeof core.getFolderById === 'function'
      ? core.getFolderById(data, id)
      : (data.folders.find((f) => f.id === id) || null);
    const folder = currentDataFolder || folders.find((f) => f.id === id) || null;
    const title = folder ? folder.name : id;

    let hrefs = STORE_listFolderItems(data, id);
    if (!hrefs.length) {
      hrefs = Object.entries(chatToFolders)
        .filter(([, ids]) => Array.isArray(ids) && ids.includes(id))
        .map(([href]) => href);
    }

    const seenChatKeys = new Set();
    hrefs = hrefs.map((href) => String(href || '').trim()).filter(Boolean).filter((href) => {
      const chatId = DOM_parseChatIdFromHref(href);
      const key = chatId ? `chat:${chatId}` : `href:${href}`;
      if (seenChatKeys.has(key)) return false;
      seenChatKeys.add(key);
      return true;
    });
    const chats = hrefs.map((href) => {
      const chatId = DOM_parseChatIdFromHref(href);
      const rawTitle = DOM_findChatTitleInSidebarByHref(href) || DOM_getChatTitleFromSidebar(href) || chatId || href;
      return {
        href,
        chatId,
        title: UI_isNoisySurfaceChatTitle(rawTitle) ? (chatId || href) : rawTitle,
      };
    });

    chats.forEach((chat) => {
      if (!chat?.chatId) return;
      Promise.resolve(API_repairStudioVisibilityForChat(chat.chatId, {
        folderId: id,
        folderName: String(folder?.name || title || id),
        source: 'folder-surface-data',
      })).catch((error) => DIAG_err('folderSurface:repairStudioVisibility', error));
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
    list.textContent = '';
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
    list.textContent = '';
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
        const exists = STORE_readData().folders.some((folder) => String(folder?.id || folder?.folderId || '') === targetId);
        if (exists) UI_openFolderViewer(targetId, { skipHistory: true });
        else UI_openFoldersViewer(null, { skipHistory: true });
      } else if (page.kind === 'folders') {
        UI_openFoldersViewer(null, { skipHistory: true });
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

  /* R4.7.6 — Folder sidebar active-row sync retired with flsc-folder-row.
   * Code moved to retired-features/native-library-ui/0F3a-folders-ui/
   * folders-sidebar-list.js (Block 5). */
  function CORE_FS_syncFolderSidebarActiveState(reason = 'sync') {
    STATE.sidebarActiveSyncCount = Number(STATE.sidebarActiveSyncCount || 0) + 1;
    STATE.lastSidebarActiveSyncReason = String(reason || 'sync');
    STATE.sidebarLastActiveSyncReason = String(reason || 'sync');
    STATE.sidebarLastActiveSyncAt = Date.now();
    return false;
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

  function DOM_collectNativeMenuCandidates(root) {
    const out = [];
    const seen = new Set();
    const add = (node) => {
      if (!(node instanceof HTMLElement) || seen.has(node)) return;
      seen.add(node);
      if (node.closest?.(`[${ATTR_CGXUI_OWNER}="${SkID}"]`)) return;
      out.push(node);
    };
    if (root instanceof HTMLElement) {
      if (root.matches?.(SEL.radixMenu)) add(root);
      root.querySelectorAll?.(SEL.radixMenu).forEach(add);
    }
    return out;
  }

  function DOM_nativeChatMenuSignatureScore(menuEl) {
    const txt = UTIL_normText(menuEl?.innerText || menuEl?.textContent || '');
    const patterns = [
      /share/i,
      /start a group chat/i,
      /rename/i,
      /move to project/i,
      /add label/i,
      /pin chat/i,
      /archive/i,
      /delete/i,
    ];
    return patterns.reduce((n, re) => n + (re.test(txt) ? 1 : 0), 0);
  }

  function ENGINE_tryInjectNativeChatMenu(menu, reason = '') {
    if (!(menu instanceof HTMLElement)) return false;
    STATE.menuDiag.menuCandidatesSeen += 1;
    const txt = UTIL_normText(menu.innerText || menu.textContent || '');
    STATE.menuDiag.lastSignatureSample = txt.slice(0, 120);
    if (DOM_nativeChatMenuSignatureScore(menu) < 2) {
      STATE.menuDiag.signatureMisses += 1;
      STATE.menuDiag.lastSkipReason = `signature-miss:${String(reason || '')}`;
      return false;
    }
    if (!menu.__h2oFoldersSignatureHit) {
      STATE.menuDiag.signatureHits += 1;
      menu.__h2oFoldersSignatureHit = true;
    }
    DOM_ensureMenuContext(menu, `inject:${reason || 'menu'}`);
    ENGINE_injectAddToFolder(menu);
    ENGINE_injectAddToLibrary(menu);
    return true;
  }

  function ENGINE_scheduleNativeChatMenuInjection(menu, reason = '') {
    if (!(menu instanceof HTMLElement)) return;
    if (!menu.__h2oFoldersInjectionScheduled) {
      menu.__h2oFoldersInjectionScheduled = true;
      requestAnimationFrame(() => ENGINE_tryInjectNativeChatMenu(menu, `${reason}:raf`));
      W.setTimeout(() => ENGINE_tryInjectNativeChatMenu(menu, `${reason}:timeout`), 80);
      return;
    }
    ENGINE_tryInjectNativeChatMenu(menu, reason || 'rescan');
  }

  function OBS_hookRadixMenuInjectionOnce() {
    if (STATE.menuHooked) return;
    STATE.menuHooked = true;

    // capture which chat the "..." menu belongs to
    const onPointerDown = (e) => {
      const btn = e.target?.closest?.(SEL.menuCaptureBtn) || e.target?.closest?.('button');
      if (!btn) return;
      const buttonHint = [
        btn.getAttribute?.('aria-label') || '',
        btn.getAttribute?.('data-testid') || '',
        btn.getAttribute?.('aria-haspopup') || '',
        btn.getAttribute?.('data-state') || '',
        UTIL_normText(btn.textContent || ''),
      ].join(' ');
      if (!btn.matches?.(SEL.menuCaptureBtn) && !/options|conversation|history|more|menu|open/i.test(buttonHint)) return;

      const ctx = DOM_resolveMenuContextFromTrigger(btn);
      if (DOM_captureMenuContext(ctx, 'trigger')) {
        STATE.menuDiag.triggerContextResolved += 1;
      } else {
        STATE.lastChatHrefForMenu = '';
        STATE.lastChatMenuContext = null;
        STATE.menuDiag.triggerContextMisses += 1;
        STATE.menuDiag.lastSkipReason = 'missing-trigger-context';
      }
    };

    const onClick = (e) => onPointerDown(e);

    TIME_addListener(
      () => D.addEventListener('pointerdown', onPointerDown, true),
      () => D.removeEventListener('pointerdown', onPointerDown, true)
    );
    TIME_addListener(
      () => D.addEventListener('click', onClick, true),
      () => D.removeEventListener('click', onClick, true)
    );

    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        for (const node of mu.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          const menus = DOM_collectNativeMenuCandidates(node);
          if (!menus.length) menus.push(...DOM_collectNativeMenuCandidates(D.body).slice(0, 8));

          if (!menus.length) continue;

          for (const menu of menus) {
            STATE.menuDiag.menusSeen += 1;
            // Add-to-Folder first, Add-to-Library second. The Add-to-
            // Library injector then inserts itself BEFORE Add-to-Folder
            // so the on-screen order is "Add to Library" → "Save to Folder".
            // See ENGINE_injectAddToLibrary for the insertion logic.
            ENGINE_scheduleNativeChatMenuInjection(menu, 'mutation');
          }
        }
      }
    });

    mo.observe(D.body, { childList: true, subtree: true });
    STATE.menuMO = mo;
    STATE.menuDiag.observerInstalled = true;
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

    let allowHistoryPatch = false;
    try { allowHistoryPatch = W.localStorage?.getItem?.('h2oAllowHistoryPatch') === '1'; } catch {}
    const originalPushState = allowHistoryPatch ? W.history?.pushState : null;
    const originalReplaceState = allowHistoryPatch ? W.history?.replaceState : null;
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

  /* R4.7.6 — Folder sidebar injection lifecycle retired. Code moved to:
   *   retired-features/native-library-ui/0F3a-folders-ui/folders-sidebar-list.js
   * (Block 6). Public H2O.folders.ensureInjected stays callable as
   * a no-op for compatibility; capture menu observers and folder
   * store/API registration still boot normally. */
  function CORE_FS_ensureInjected(reason) {
    STATE.sidebarEnsureCount = Number(STATE.sidebarEnsureCount || 0) + 1;
    STATE.lastSidebarEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureReason = String(reason || 'ensure');
    STATE.sidebarLastEnsureAt = Date.now();
    DIAG_step('folders-sidebar-retired', reason || 'ensure');
    return false;
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

    const core = FOLDERCORE_get();
    if (core && typeof core.normalizeBindingKey === 'function') {
      const normalized = core.normalizeBindingKey(raw, FOLDERCORE_options());
      const chatId = String(normalized.chatId || '').trim();
      const href = String(normalized.href || normalized.canonical || raw).trim();
      const candidates = [];
      const add = (value) => {
        const v = String(value || '').trim();
        if (!v || candidates.includes(v)) return;
        candidates.push(v);
      };

      add(href);
      add(raw);
      if (!raw.startsWith('/')) add(`/c/${raw}`);
      (Array.isArray(normalized.candidates) ? normalized.candidates : []).forEach(add);
      if (chatId) add(DOM_findChatHrefInSidebarByChatId(chatId));

      return { raw, chatId, href, candidates };
    }

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

  function API_resolveSaveToFolderTarget(chatIdOrHref = '') {
    const raw = String(chatIdOrHref || '').trim();
    if (raw) return raw;
    const path = String(W.location?.pathname || '').trim();
    if (DOM_parseChatIdFromHref(path)) return path;
    const href = String(W.location?.href || '').trim();
    if (DOM_parseChatIdFromHref(href)) return href;
    return '';
  }

  function API_currentLoadedChatId() {
    try {
      const fromUtil = H2O.util && typeof H2O.util.getChatId === 'function'
        ? String(H2O.util.getChatId() || '').trim()
        : '';
      if (fromUtil) return fromUtil;
    } catch {}
    return DOM_parseChatIdFromHref(String(W.location?.pathname || ''))
      || DOM_parseChatIdFromHref(String(W.location?.href || ''))
      || '';
  }

  function API_targetIsCurrentLoadedChat(key) {
    const cid = String(key?.chatId || '').trim();
    if (!cid) return false;
    return cid === API_currentLoadedChatId();
  }

  function API_getRegistryRecordForBindingKey(key) {
    const reg = H2O.ChatRegistry;
    if (!reg || !key) return null;
    const candidates = [
      key.chatId,
      key.href,
      key.raw,
      ...(Array.isArray(key.candidates) ? key.candidates : []),
    ].map((value) => String(value || '').trim()).filter(Boolean);

    for (const value of candidates) {
      try {
        const byId = typeof reg.getRecord === 'function' ? reg.getRecord(value) : null;
        if (byId) return byId;
      } catch {}
      try {
        const byHref = typeof reg.getRecordByHref === 'function' ? reg.getRecordByHref(value) : null;
        if (byHref) return byHref;
      } catch {}
    }
    return null;
  }

  function API_hasSavedRegistryRecordForBindingKey(key) {
    const record = API_getRegistryRecordForBindingKey(key);
    if (!record) return false;
    return !!(record.state?.isSaved || record.state?.isLinked || record.state?.isImported);
  }

  function API_getBinding(chatIdOrHref) {
    const key = API_normalizeChatBindingKey(chatIdOrHref);
    if (!key.raw && !key.href) return { folderId: '', folderName: '' };

    const d = STORE_readData();
    const core = FOLDERCORE_get();
    if (core && typeof core.getBinding === 'function') {
      const binding = core.getBinding(d, key.href || key.raw, FOLDERCORE_options());
      return {
        folderId: String(binding?.folderId || ''),
        folderName: String(binding?.folderName || ''),
      };
    }

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
    if (API_hasSavedRegistryRecordForBindingKey(key)) return true;

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

  async function API_refreshStudioSavedLibraryRowsForChat(chatKeyOrHref = '') {
    const key = API_normalizeChatBindingKey(chatKeyOrHref);
    if (!key.chatId && !key.href) return false;

    const archive = H2O.archiveBoot || {};
    if (typeof archive.isExtensionBacked === 'function' && !archive.isExtensionBacked()) {
      return false;
    }

    const rows = [];
    const addRows = (value) => {
      if (!Array.isArray(value)) return;
      value.forEach((row) => { if (row && typeof row === 'object') rows.push(row); });
    };
    const readRows = async (fn, ctx = null) => {
      if (typeof fn !== 'function') return;
      try {
        const value = ctx ? fn.call(ctx) : fn();
        addRows(value && typeof value.then === 'function' ? await value : value);
      } catch {}
    };

    await readRows(archive.listWorkbenchRows, archive);
    await readRows(archive._rendererHost?.listWorkbenchRows, archive._rendererHost);
    if (rows.length) STATE.savedLibraryRows = rows;
    return rows.some((row) => API_savedLibraryRowMatchesKey(row, key));
  }

  async function API_repairStudioVisibilityForChat(chatKeyOrHref = '', opts = {}) {
    const key = API_normalizeChatBindingKey(chatKeyOrHref);
    const cid = String(key.chatId || '').trim();
    if (!cid) {
      return { ok: false, status: 'capture-failed', reason: 'missing-chat-id', chatId: '' };
    }

    const archive = H2O.archiveBoot || {};
    const folderId = String(opts?.folderId || '').trim();
    const folderName = String(opts?.folderName || '').trim();
    const source = String(opts?.source || 'folders-repair');
    const shouldUpsertFolderMeta = Object.prototype.hasOwnProperty.call(opts || {}, 'folderId')
      || Object.prototype.hasOwnProperty.call(opts || {}, 'folderName');
    const capture = opts?.capture && typeof opts.capture === 'object' ? opts.capture : null;

    const upsertFolderMeta = async () => {
      const upsert = typeof archive.upsertLatestSnapshotMeta === 'function'
        ? archive.upsertLatestSnapshotMeta.bind(archive)
        : null;
      if (!upsert || !shouldUpsertFolderMeta) return false;
      try {
        await upsert(cid, { folderId, folderName }, { source });
        return true;
      } catch (error) {
        DIAG_err('repairStudioVisibility:upsertLatestSnapshotMeta', error);
        return false;
      }
    };

    let studioVisible = await API_refreshStudioSavedLibraryRowsForChat(cid);
    if (studioVisible) {
      await upsertFolderMeta();
      return { ok: true, status: 'studio-visible', chatId: cid };
    }

    let migration = null;
    const migrateLegacyIfNeeded = archive._bridge && typeof archive._bridge.migrateLegacyIfNeeded === 'function'
      ? archive._bridge.migrateLegacyIfNeeded.bind(archive._bridge)
      : null;
    if (migrateLegacyIfNeeded) {
      try {
        migration = await migrateLegacyIfNeeded(cid);
      } catch (error) {
        DIAG_err('repairStudioVisibility:migrateLegacyIfNeeded', error);
      }
    }

    try { await archive.loadLatestSnapshot?.(cid); } catch {}
    studioVisible = await API_refreshStudioSavedLibraryRowsForChat(cid);
    if (studioVisible) {
      await upsertFolderMeta();
      return {
        ok: true,
        status: migration?.imported ? 'legacy-migrated' : 'studio-visible',
        chatId: cid,
        migration,
      };
    }

    const extensionUnavailable = String(migration?.reason || '') === 'extension_unavailable'
      || (typeof archive.isExtensionBacked === 'function' && !archive.isExtensionBacked());
    const localOnly = extensionUnavailable
      || String(capture?.storage || '').toLowerCase() === 'legacy'
      || capture?.workbenchVisible === false;
    return {
      ok: false,
      status: localOnly ? 'capture-local-only' : 'capture-not-indexed',
      chatId: cid,
      migration,
    };
  }

  function API_numberCount(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function API_captureSnapshotId(capture) {
    if (!capture || typeof capture !== 'object') return '';
    return String(
      capture.snapshotId
      || capture.snapshot_id
      || capture.lastSnapshotId
      || capture.snapshot?.snapshotId
      || capture.snapshot?.snapshot_id
      || capture.latest?.snapshotId
      || capture.latest?.snapshot_id
      || ''
    ).trim();
  }

  function API_captureMessageCount(capture) {
    if (!capture || typeof capture !== 'object') return 0;
    return API_numberCount(capture.messageCount)
      || API_numberCount(capture.turnCount)
      || API_numberCount(capture.userTurnCount)
      || API_numberCount(capture.assistantTurnCount)
      || API_numberCount(capture.snapshot?.messageCount)
      || API_numberCount(capture.snapshot?.turnCount)
      || API_numberCount(capture.latest?.messageCount)
      || API_numberCount(capture.latest?.turnCount)
      || (Array.isArray(capture.messages) ? capture.messages.length : 0)
      || (Array.isArray(capture.snapshot?.messages) ? capture.snapshot.messages.length : 0)
      || (Array.isArray(capture.latest?.messages) ? capture.latest.messages.length : 0);
  }

  function API_captureHasRealTranscript(capture) {
    if (!capture || capture.ok === false) return false;
    return !!API_captureSnapshotId(capture) || API_captureMessageCount(capture) > 0;
  }

  function API_captureSummary(capture) {
    return {
      snapshotId: API_captureSnapshotId(capture),
      snapshotCount: API_captureSnapshotId(capture) ? 1 : API_numberCount(capture?.snapshotCount),
      messageCount: API_captureMessageCount(capture),
      captureSource: String(capture?.captureSource || capture?.source || ''),
      storage: String(capture?.storage || ''),
      workbenchVisible: capture?.workbenchVisible === undefined ? null : capture.workbenchVisible === true,
    };
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
      capture = await archive.captureNow(cid, {
        href: String(opts?.href || key.href || ''),
        title: String(opts?.title || ''),
        source: String(opts?.source || 'capture-current-chat-for-folder'),
      });
    } catch (error) {
      DIAG_err('capture-current-chat-for-folder', error);
      return { ok: false, status: 'capture-failed', chatId: cid, capture: null, error: String(error && (error.message || error) || '') };
    }

    if (!capture || capture.ok === false) {
      const reason = String(capture?.reason || '').trim().toLowerCase();
      const status = reason.startsWith('backend-') || reason === 'fetch-unavailable'
        ? 'capture-target-unavailable'
        : 'capture-failed';
      return { ok: false, status, chatId: cid, capture };
    }

    try { await archive.loadLatestSnapshot?.(cid); } catch {}
    const repair = await API_repairStudioVisibilityForChat(cid, {
      capture,
      source: String(opts?.source || 'capture-current-chat-for-folder'),
    });
    if (repair?.ok) {
      return { ok: true, status: 'captured', chatId: cid, capture, repair };
    }

    return {
      ok: false,
      status: String(repair?.status || 'capture-not-indexed'),
      chatId: cid,
      capture,
      repair,
    };
  }

  async function API_saveAndBindToFolder({ chatId = '', href = '', folderId = '', folderName = '', title = '', source = '' } = {}) {
    const key = API_normalizeChatBindingKey(API_resolveSaveToFolderTarget(chatId || href));
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

    if (!API_targetIsCurrentLoadedChat(key)) {
      return {
        ok: false,
        status: 'capture-requires-open-chat',
        reason: 'open-this-chat-first-to-capture-transcript',
        message: 'Open this chat first to capture transcript.',
        chatId: cid,
        currentChatId: API_currentLoadedChatId(),
        folderId: fid,
        folderName: label,
        href: String(key.href || href || ''),
        title: API_resolveSaveChatTitle({
          explicitTitle: title,
          href: String(key.href || href || ''),
          capture: null,
        }),
        captureSummary: {
          snapshotId: '',
          snapshotCount: 0,
          messageCount: 0,
          captureSource: 'not-current-loaded-chat',
          storage: '',
          workbenchVisible: null,
        },
      };
    }

    const preCaptureTitle = API_resolveSaveChatTitle({
      explicitTitle: title,
      href: String(key.href || href || ''),
      capture: null,
    });
    const captured = await API_captureCurrentChatForFolder(cid, {
      source,
      href: String(key.href || href || ''),
      title: preCaptureTitle,
    });
    const captureSummary = API_captureSummary(captured?.capture);
    const hasTranscriptEvidence = API_captureHasRealTranscript(captured?.capture);
    if (!hasTranscriptEvidence) {
      return {
        ...(captured && typeof captured === 'object' ? captured : {}),
        ok: false,
        status: 'capture-transcript-missing',
        reason: 'could-not-capture-transcript',
        message: 'Could not capture transcript; no Saved row was created.',
        fallback: API_getRegistryRecordForBindingKey(key) ? 'existing-link-only' : 'none',
        chatId: cid,
        folderId: fid,
        folderName: label,
        captureSummary,
      };
    }
    if (!captured?.ok) {
      return {
        ...(captured && typeof captured === 'object' ? captured : {}),
        ok: false,
        status: String(captured?.status || 'capture-not-studio-visible'),
        reason: 'captured-transcript-not-visible-to-studio',
        message: 'Captured transcript was not available to Studio/Desktop sync.',
        chatId: cid,
        folderId: fid,
        folderName: label,
        captureSummary,
      };
    }

    const binding = API_setBinding(cid, fid, {
      source: 'folders-save-add-to-folder',
      reason: 'after-capture',
      allowRegistryRecord: true,
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

    // Phase 4: stamp explicit Add-to-Library / Save-to-Folder provenance
    // on the ChatRegistry record. The Phase 1 invariant in 0F1g.mergeRecord
    // already forces state.isLinked=true when isSaved=true && chatId exists,
    // but without this explicit stamp the in-merge fallback assigns
    // linkedFrom='backfill:saved' for native chats that reached "saved" via
    // this menu path. Stamping linkedFrom='save-to-folder' here makes the
    // provenance accurate for analytics / UI that consume the field.
    //
    // Safety: this runs AFTER capture + bind both succeeded, uses the
    // sticky-on-true public upsert API (no state can regress), is wrapped
    // in try/catch with the existing DIAG_err logger, and its result is
    // not used by the function's return value — it is a pure side effect.
    try {
      const reg = H2O.ChatRegistry;
      if (reg && typeof reg.upsertRecord === 'function') {
        reg.upsertRecord({
          chatId: cid,
          href: String(key.href || ''),
          normalizedHref: String(key.href || ''),
          ...API_titleMetadataPatch(API_resolveSaveChatTitle({
            explicitTitle: title,
            href: String(key.href || href || ''),
            capture: captured.capture,
          }), source || 'save-to-folder'),
          snapshotId: captureSummary.snapshotId,
          snapshotCount: captureSummary.snapshotCount,
          messageCount: captureSummary.messageCount,
          organization: { folderId: String(binding.folderId || fid) },
          state: { isSaved: true, isLinked: true },
          linkedFrom: 'save-to-folder',
          linkSourceHref: String(key.href || ''),
        }, { source: String(source || 'save-to-folder') });
      }
    } catch (provenanceErr) {
      DIAG_err('save-and-bind:provenance-stamp', provenanceErr);
    }

    const syncQueued = EVENT_flushLibraryFolderSync('save-to-folder-captured');
    return {
      ok: true,
      status: 'saved-and-bound',
      chatId: cid,
      folderId: String(binding.folderId || fid),
      folderName: String(binding.folderName || label),
      title: API_resolveSaveChatTitle({
        explicitTitle: title,
        href: String(key.href || href || ''),
        capture: captured.capture,
      }),
      snapshotId: captureSummary.snapshotId,
      snapshotCount: captureSummary.snapshotCount,
      messageCount: captureSummary.messageCount,
      capture: captured.capture,
      captureSummary,
      binding,
      syncQueued,
      syncExported: false,
      syncStatus: syncQueued ? 'native-broadcast-queued' : 'native-broadcast-unavailable',
    };
  }

  function API_stampFolderBindingInRegistry(key, effective, opts = {}) {
    const cid = String(key?.chatId || '').trim();
    if (!cid) return null;
    const folderIdValue = String(effective?.folderId || '').trim();
    const source = String(opts?.source || 'folders-api');
    const patch = {
      chatId: cid,
      href: String(key?.href || ''),
      normalizedHref: String(key?.href || ''),
      organization: { folderId: folderIdValue },
      state: { isSaved: true, isLinked: true },
      linkedFrom: folderIdValue ? 'save-to-folder' : 'save-to-folder:clear',
      linkSourceHref: String(key?.href || ''),
    };
    try {
      const reg = H2O.ChatRegistry;
      if (reg && typeof reg.upsertRecord === 'function') {
        return reg.upsertRecord(patch, { source });
      }
    } catch (error) {
      DIAG_err('setBinding:chatRegistryFolderStamp', error);
    }
    return null;
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
    const canBindFromRegistry = opts?.allowRegistryRecord === true && !!API_getRegistryRecordForBindingKey(key);
    if (fid && !API_isSavedLibraryChat(key.chatId || key.href || key.raw) && !canBindFromRegistry) {
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
    const core = FOLDERCORE_get();

    if (core && typeof core.applyFolderBinding === 'function' && typeof core.removeFolderBinding === 'function') {
      const result = fid
        ? core.applyFolderBinding(d, key.href || key.raw, fid, FOLDERCORE_options())
        : core.removeFolderBinding(d, key.href || key.raw, FOLDERCORE_options());
      const nextState = result?.state && typeof result.state === 'object' ? result.state : d;
      STORE_writeData(STORE_normalizeData(nextState));
    } else {
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
    }

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
    API_stampFolderBindingInRegistry(key, effective, opts);
    EVENT_flushLibraryFolderSync(fid ? 'folder-binding-set' : 'folder-binding-clear');
    if (key.chatId) {
      try {
        const upsert = H2O.archiveBoot && typeof H2O.archiveBoot.upsertLatestSnapshotMeta === 'function'
          ? H2O.archiveBoot.upsertLatestSnapshotMeta.bind(H2O.archiveBoot)
          : null;
        if (upsert) {
          Promise.resolve(upsert(key.chatId, {
            folderId: String(effective.folderId || ''),
            folderName: String(effective.folderName || ''),
          }, {
            source: String(opts?.source || 'folders-api'),
          })).catch((error) => DIAG_err('setBinding:upsertLatestSnapshotMeta', error));
        }
      } catch (error) {
        DIAG_err('setBinding:upsertLatestSnapshotMeta', error);
      }
      if (effective.folderId) {
        try {
          Promise.resolve(API_repairStudioVisibilityForChat(key.chatId, {
            folderId: String(effective.folderId || ''),
            folderName: String(effective.folderName || ''),
            source: String(opts?.source || 'folders-api'),
          })).catch((error) => DIAG_err('setBinding:repairStudioVisibility', error));
        } catch (error) {
          DIAG_err('setBinding:repairStudioVisibility', error);
        }
      }
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

  function API_getDeprecationDiagnostics() {
    return {
      phase: '9B',
      surface: 'native',
      status: 'active-required',
      behaviorChanged: false,
      activeRequired: [
        'folder vault reads/writes and chat-to-folder binding remain native-owned',
        'Add to Library and Save to Folder native menu flows remain active',
        'sidebar injection remains required on chatgpt.com',
      ],
      legacyFallback: [
        KEY_LEG_DATA,
        KEY_LEG_UI,
        KEY_LEG_SEE,
        KEY_LEG_EXP,
      ],
      futureDeprecated: [
        'native folder viewer/list UI after Studio folder workflows are complete and release-validated',
      ],
      doNotRemoveUntil: [
        'folder canonical storage migration is explicitly approved',
        'Studio replacement write workflows are complete',
        'legacy fallback keys are no longer needed for rollback',
      ],
    };
  }

  function API_getFolderParityDiagnostics() {
    const data = STORE_readData();
    const folders = Array.isArray(data.folders) ? data.folders : [];
    const items = (data.items && typeof data.items === 'object') ? data.items : {};
    const folderSummaries = folders.map((folder) => {
      const id = String(folder?.id || folder?.folderId || '').trim();
      const bindingKeys = Array.isArray(items[id]) ? items[id].map((value) => String(value || '').trim()).filter(Boolean) : [];
      const chatIds = bindingKeys.map((value) => DOM_parseChatIdFromHref(value) || value).filter(Boolean);
      return {
        id,
        folderId: id,
        name: String(folder?.name || folder?.title || id).trim() || id,
        kind: String(folder?.kind || 'local').trim() || 'local',
        source: 'native-folder-state',
        iconColor: String(folder?.iconColor || '').trim(),
        color: String(folder?.color || folder?.iconColor || '').trim(),
        icon: String(folder?.icon || '').trim(),
        createdAt: folder?.createdAt || '',
        updatedAt: folder?.updatedAt || '',
        bindingCount: bindingKeys.length,
        empty: bindingKeys.length === 0,
        chatIds,
        bindingKeys,
      };
    });
    const bindingCount = folderSummaries.reduce((sum, folder) => sum + folder.bindingCount, 0);
    const visualMetadataFields = Array.from(new Set(folderSummaries.flatMap((folder) => {
      const fields = [];
      if (folder.color) fields.push('color');
      if (folder.iconColor) fields.push('iconColor');
      if (folder.icon) fields.push('icon');
      return fields;
    })));
    return {
      phase: 'folder-parity-diagnostic',
      surface: 'native',
      source: 'H2O.folders local folder state',
      catalogCount: folderSummaries.length,
      bindingCount,
      emptyFolderCount: folderSummaries.filter((folder) => folder.empty).length,
      boundFolderCount: folderSummaries.filter((folder) => !folder.empty).length,
      folderNames: folderSummaries.map((folder) => folder.name),
      folderIds: folderSummaries.map((folder) => folder.id),
      visualMetadataFields,
      colorsModeled: visualMetadataFields.includes('color') || visualMetadataFields.includes('iconColor'),
      iconsModeled: visualMetadataFields.includes('icon'),
      emptyFoldersRepresented: folderSummaries.some((folder) => folder.empty),
      folders: folderSummaries,
    };
  }

  const F197D_BUILD_TRUTH_SCHEMA = 'h2o.native.save-to-folder.build-truth.v1';
  const F197D_BUILD_TRUTH_MARKER = 'f19.7d-runtime-build-truth';

  function API_bool(value) {
    return value === true;
  }

  function API_object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function API_chatIdFromMaybeHref(value) {
    return DOM_parseChatIdFromHref(String(value || '').trim()) || '';
  }

  function API_countVisibleMessageNodes() {
    try {
      const messageNodes = Array.from(D.querySelectorAll('[data-message-author-role]'));
      if (messageNodes.length) return messageNodes.filter((node) => {
        try {
          const text = String(node?.textContent || '').trim();
          return !!text && node.isConnected !== false;
        } catch {
          return false;
        }
      }).length;
    } catch {}
    try {
      const turns = Array.from(D.querySelectorAll('[data-testid="conversation-turn"], [data-testid^="conversation-turn-"]'));
      return turns.filter((node) => {
        try {
          const text = String(node?.textContent || '').trim();
          return !!text && node.isConnected !== false;
        } catch {
          return false;
        }
      }).length;
    } catch {}
    return 0;
  }

  function API_bridge() {
    try {
      const archive = H2O.archiveBoot || {};
      return typeof archive._getExtensionBridge === 'function' ? archive._getExtensionBridge() : null;
    } catch {
      return null;
    }
  }

  function API_unwrapBridgeResult(value) {
    const obj = API_object(value);
    if (obj.result && typeof obj.result === 'object') return API_object(obj.result);
    return obj;
  }

  async function API_loaderInfoDiagnostic() {
    const bridge = API_bridge();
    if (!bridge || typeof bridge.__loaderInfo !== 'function') {
      return { ok: false, reason: 'loader-info-unavailable', value: null };
    }
    try {
      const value = API_unwrapBridgeResult(await bridge.__loaderInfo());
      return { ok: value?.ok !== false, reason: '', value };
    } catch (error) {
      return { ok: false, reason: 'loader-info-threw', error: String(error && (error.message || error) || ''), value: null };
    }
  }

  async function API_loaderDiagDiagnostic() {
    const bridge = API_bridge();
    if (!bridge || typeof bridge.__loaderDiag !== 'function') {
      return { ok: false, reason: 'loader-diag-unavailable', value: null };
    }
    try {
      const value = API_unwrapBridgeResult(await bridge.__loaderDiag());
      return { ok: value?.ok !== false, reason: '', value };
    } catch (error) {
      return { ok: false, reason: 'loader-diag-threw', error: String(error && (error.message || error) || ''), value: null };
    }
  }

  function API_buildProfileFromLoader(loaderInfo) {
    const tag = String(loaderInfo?.tag || '').toLowerCase();
    if (tag.includes('studio launcher')) return 'studio-launcher';
    if (tag.includes('dev ctrl') || tag.includes('dev-control') || tag.includes('dev controls')) return 'dev';
    if (tag.includes('prod')) return 'prod';
    if (tag) return 'unknown-tagged';
    return 'unknown';
  }

  function API_loadedAliasesFromLoaderDiag(loaderDiag) {
    const result = API_object(loaderDiag);
    const diag = API_object(result.diag || result);
    const current = API_object(diag.currentPageLoads);
    return Object.keys(current).sort();
  }

  function API_aliasLoaded(aliases, pattern) {
    return aliases.some((alias) => pattern.test(String(alias || '')));
  }

  function API_runtimeIdentity(loaderInfoDiag, loaderDiagDiag) {
    const loaderInfo = API_object(loaderInfoDiag?.value);
    const aliases = API_loadedAliasesFromLoaderDiag(loaderDiagDiag?.value);
    const aliasBaseUrl = 'http://127.0.0.1:5500/alias/';
    return {
      schema: F197D_BUILD_TRUTH_SCHEMA,
      marker: F197D_BUILD_TRUTH_MARKER,
      surface: 'native-chatgpt-page',
      extensionId: '',
      extensionIdAvailable: false,
      extensionBuildProfile: API_buildProfileFromLoader(loaderInfo),
      loaderSource: String(loaderInfo?.source || ''),
      loaderVersionFingerprint: [
        String(loaderInfo?.loaderBuildTs || ''),
        String(loaderInfo?.loaderBuildIso || ''),
        String(loaderInfo?.tag || ''),
      ].filter(Boolean).join('|'),
      loaderBuildTs: Number(loaderInfo?.loaderBuildTs || 0) || null,
      loaderBuildIso: String(loaderInfo?.loaderBuildIso || ''),
      loaderTag: String(loaderInfo?.tag || ''),
      loaderInfoAvailable: loaderInfoDiag?.ok === true,
      loaderInfoReason: String(loaderInfoDiag?.reason || ''),
      loaderDiagAvailable: loaderDiagDiag?.ok === true,
      loaderDiagReason: String(loaderDiagDiag?.reason || ''),
      runtimeCameFromAliasServer: aliases.length ? API_aliasLoaded(aliases, /^0[ADF]\d|^0F3a|^0F1j|^0D3a/i) : null,
      aliasBaseUrl,
      loadedModuleListAvailable: aliases.length > 0,
      loadedModuleList: aliases,
    };
  }

  function API_modulePresence(loadedAliases) {
    const archive = H2O.archiveBoot || {};
    const libraryActions = H2O.LibraryActions || H2O.Library?.Actions || null;
    return {
      '0F3a': true,
      '0F1j': !!libraryActions || API_aliasLoaded(loadedAliases, /0F1j|Library_Actions|Library Actions/i),
      '0D3a': !!archive || API_aliasLoaded(loadedAliases, /0D3a|Transcript_Archive_Engine|Transcript Archive Engine/i),
      folderRuntimeLoaded: !!H2O.folders,
      libraryActionsLoaded: !!libraryActions,
      transcriptArchiveEngineLoaded: typeof archive.captureNow === 'function',
    };
  }

  function API_markerPresence() {
    return {
      API_targetIsCurrentLoadedChat: typeof API_targetIsCurrentLoadedChat === 'function',
      'capture-requires-open-chat': true,
      API_captureHasRealTranscript: typeof API_captureHasRealTranscript === 'function',
      API_saveAndBindToFolder: typeof API_saveAndBindToFolder === 'function',
      'archiveBoot.captureNow': typeof H2O.archiveBoot?.captureNow === 'function',
      API_captureCurrentChatForFolder: typeof API_captureCurrentChatForFolder === 'function',
      API_captureSummary: typeof API_captureSummary === 'function',
      F19_7_failClosed: true,
      F19_7b_transcriptRequired: true,
      F19_7d_buildTruthDiagnostic: true,
    };
  }

  function API_handlerOwnership() {
    const publicSave = H2O.folders?.saveAndBindToFolder;
    const publicDiagnose = H2O.folders?.diagnose;
    const libraryActions = H2O.LibraryActions || H2O.Library?.Actions || null;
    const lastContextHref = String(STATE.menuDiag?.lastContextHref || '');
    return {
      saveToFolderOwner: publicSave === API_saveAndBindToFolder
        ? '0F3a.API_saveAndBindToFolder'
        : (typeof publicSave === 'function' ? 'external-or-stale-H2O.folders.saveAndBindToFolder' : 'missing'),
      diagnoseOwner: publicDiagnose === API_diagnose
        ? '0F3a.API_diagnose'
        : (typeof publicDiagnose === 'function' ? 'external-or-stale-H2O.folders.diagnose' : 'missing'),
      currentHandlerMatchesPatchedApi: publicSave === API_saveAndBindToFolder,
      clickPathExpected: 'ENGINE_injectAddToFolder -> UI_openAssignMenu -> API_saveAndBindToFolder',
      menuInjectionObserverInstalled: API_bool(STATE.menuDiag?.observerInstalled),
      addToFolderInjectionAttempts: Number(STATE.menuDiag?.saveToFolderAttempts || 0),
      addToFolderInjected: Number(STATE.menuDiag?.saveToFolderInjected || 0),
      lastContextSource: String(STATE.menuDiag?.lastContextSource || ''),
      lastContextHasHref: !!lastContextHref,
      lastContextChatId: API_chatIdFromMaybeHref(lastContextHref),
      lastSkipReason: String(STATE.menuDiag?.lastSkipReason || ''),
      lastErrorMessage: String(STATE.menuDiag?.lastErrorMessage || ''),
      libraryActionsSaveToFolderExists: typeof libraryActions?.saveToFolder === 'function',
      anotherHandlerMayCreateLinkRows: publicSave !== API_saveAndBindToFolder,
    };
  }

  function API_captureReadiness(opts = {}) {
    const currentLoadedChatId = API_currentLoadedChatId();
    const currentUrlChatId = API_chatIdFromMaybeHref(String(W.location?.href || W.location?.pathname || ''));
    const selectedTargetChatId = API_chatIdFromMaybeHref(String(STATE.menuDiag?.lastContextHref || STATE.menuDiag?.lastAnchorText || ''));
    const visibleMessageCount = API_countVisibleMessageNodes();
    const archiveCaptureNowCallable = typeof H2O.archiveBoot?.captureNow === 'function';
    const targetEqualsCurrent = selectedTargetChatId
      ? selectedTargetChatId === currentLoadedChatId
      : (currentUrlChatId ? currentUrlChatId === currentLoadedChatId : null);
    const includeCaptureDryRun = opts?.includeCaptureDryRun === true;
    return {
      currentLoadedChatId,
      currentUrlChatId,
      selectedSidebarTargetChatId: selectedTargetChatId,
      selectedTargetEqualsCurrentLoadedChat: targetEqualsCurrent,
      visibleMessageCount,
      visibleConversationTurnCount: visibleMessageCount,
      archiveBootCaptureNowCallable: archiveCaptureNowCallable,
      captureDryRunRequested: includeCaptureDryRun,
      includeCaptureDryRun: false,
      captureDryRunSafe: false,
      captureDryRunReason: includeCaptureDryRun
        ? 'archiveBoot.captureNow persists snapshots; diagnostic only counts visible DOM messages'
        : 'not-requested',
    };
  }

  function API_registrySyncReadiness(captureReadiness) {
    const reg = H2O.ChatRegistry || null;
    const nativeBroadcastExists = typeof EVENT_flushLibraryFolderSync === 'function';
    const syncFolderBridgeExists = !!H2O.Studio?.sync?.folder || !!H2O.Studio?.sync?.autoImport || !!H2O.Studio?.sync?.autoExport;
    return {
      chatRegistryExists: !!reg,
      chatRegistryUpsertCallable: typeof reg?.upsertRecord === 'function',
      folderBindingApiExists: typeof API_setBinding === 'function',
      nativeToStudioBroadcastExists: nativeBroadcastExists,
      syncFolderBridgeExists,
      latestSaveWouldBeExportSafe: !!(
        captureReadiness?.archiveBootCaptureNowCallable &&
        Number(captureReadiness?.visibleMessageCount || 0) > 0 &&
        (captureReadiness?.selectedTargetEqualsCurrentLoadedChat !== false) &&
        typeof reg?.upsertRecord === 'function'
      ),
    };
  }

  function API_failureReasons(runtimeIdentity, modulePresence, handlerOwnership, captureReadiness, registrySyncReadiness) {
    const wrongExtension = runtimeIdentity.extensionBuildProfile === 'studio-launcher';
    const loaderDiagNotRequested = runtimeIdentity.loaderDiagReason === 'loader-diag-not-requested';
    const aliasUnavailable = !loaderDiagNotRequested && runtimeIdentity.loaderDiagAvailable === false && runtimeIdentity.runtimeCameFromAliasServer !== true;
    const nativeRuntimeMissing = false;
    const captureEngineMissing = !modulePresence.transcriptArchiveEngineLoaded;
    const saveHandlerStale = !handlerOwnership.currentHandlerMatchesPatchedApi;
    const notCurrentLoadedChat = captureReadiness.selectedTargetEqualsCurrentLoadedChat === false;
    const noVisibleMessages = Number(captureReadiness.visibleMessageCount || 0) <= 0;
    const captureReturnedNoTranscript = null;
    const registryWriteWouldBeLinkOnly = captureEngineMissing || notCurrentLoadedChat || noVisibleMessages || !registrySyncReadiness.chatRegistryUpsertCallable;
    const syncBridgeMissing = !registrySyncReadiness.nativeToStudioBroadcastExists && !registrySyncReadiness.syncFolderBridgeExists;
    const failureReasons = {
      wrongExtension,
      aliasUnavailable,
      nativeRuntimeMissing,
      captureEngineMissing,
      saveHandlerStale,
      notCurrentLoadedChat,
      noVisibleMessages,
      captureReturnedNoTranscript,
      registryWriteWouldBeLinkOnly,
      syncBridgeMissing,
    };
    return {
      ...failureReasons,
      activeReasons: Object.entries(failureReasons)
        .filter((entry) => entry[1] === true)
        .map((entry) => entry[0]),
    };
  }

  async function API_buildTruthDiagnostic(opts = {}) {
    const [loaderInfoDiag, loaderDiagDiag] = await Promise.all([
      API_loaderInfoDiagnostic(),
      API_loaderDiagDiagnostic(),
    ]);
    const runtimeIdentity = API_runtimeIdentity(loaderInfoDiag, loaderDiagDiag);
    const loadedAliases = runtimeIdentity.loadedModuleList;
    const nativeModulePresence = API_modulePresence(loadedAliases);
    const markerPresence = API_markerPresence();
    const handlerOwnership = API_handlerOwnership();
    const captureReadiness = API_captureReadiness(opts);
    const registrySyncReadiness = API_registrySyncReadiness(captureReadiness);
    const failureReasons = API_failureReasons(
      runtimeIdentity,
      nativeModulePresence,
      handlerOwnership,
      captureReadiness,
      registrySyncReadiness
    );
    return {
      schema: F197D_BUILD_TRUTH_SCHEMA,
      ok: failureReasons.activeReasons.length === 0,
      marker: F197D_BUILD_TRUTH_MARKER,
      runtimeIdentity,
      nativeModulePresence,
      markerPresence,
      handlerOwnership,
      captureReadiness,
      registrySyncReadiness,
      failureReasons,
    };
  }

  function API_buildTruthDiagnosticSync(opts = {}) {
    const runtimeIdentity = API_runtimeIdentity(
      { ok: false, reason: 'loader-info-not-requested', value: null },
      { ok: false, reason: 'loader-diag-not-requested', value: null }
    );
    const nativeModulePresence = API_modulePresence([]);
    const markerPresence = API_markerPresence();
    const handlerOwnership = API_handlerOwnership();
    const captureReadiness = API_captureReadiness(opts);
    const registrySyncReadiness = API_registrySyncReadiness(captureReadiness);
    const failureReasons = API_failureReasons(
      runtimeIdentity,
      nativeModulePresence,
      handlerOwnership,
      captureReadiness,
      registrySyncReadiness
    );
    return {
      schema: F197D_BUILD_TRUTH_SCHEMA,
      ok: failureReasons.activeReasons.length === 0,
      marker: F197D_BUILD_TRUTH_MARKER,
      runtimeIdentity,
      nativeModulePresence,
      markerPresence,
      handlerOwnership,
      captureReadiness,
      registrySyncReadiness,
      failureReasons,
    };
  }

  function API_baseDiagnose() {
    return {
      surface: 'native',
      phase: 'phase-9B-deprecation-markers',
      ownerRegistered: !!H2O.LibraryCore?.getOwner?.('folders'),
      serviceRegistered: !!H2O.LibraryCore?.getService?.('folders'),
      folderParity: API_getFolderParityDiagnostics(),
      metadataOperations: {
        version: FOLDER_METADATA_OPERATION_VERSION,
        operationSchema: FOLDER_METADATA_OPERATION_SCHEMA,
        previewSchema: FOLDER_METADATA_OPERATION_PREVIEW_SCHEMA,
        resultSchema: FOLDER_METADATA_OPERATION_RESULT_SCHEMA,
        supportedOperations: ['change-folder-color', 'rename-folder', 'delete-folder'],
        previewOnlyOperations: [],
        deletePolicy: 'empty-folder-only',
        deleteConfirmation: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
        authority: 'native-h2o-folder-state',
        officialChatGptFolderApiProven: false,
      },
      deprecation: API_getDeprecationDiagnostics(),
    };
  }

  function API_diagnose(opts = {}) {
    const base = API_baseDiagnose();
    const wantsAsyncBuildTruth = opts?.includeCaptureDryRun === true || opts?.includeLoaderDiagnostics === true || opts?.buildTruth === true;
    if (!wantsAsyncBuildTruth) {
      const buildTruth = API_buildTruthDiagnosticSync(opts);
      return {
        ...base,
        buildTruth,
        runtimeIdentity: buildTruth.runtimeIdentity,
        nativeModulePresence: buildTruth.nativeModulePresence,
        markerPresence: buildTruth.markerPresence,
        handlerOwnership: buildTruth.handlerOwnership,
        captureReadiness: buildTruth.captureReadiness,
        registrySyncReadiness: buildTruth.registrySyncReadiness,
        failureReasons: buildTruth.failureReasons,
      };
    }
    return API_buildTruthDiagnostic(opts).then((buildTruth) => ({
      ...base,
      buildTruth,
      runtimeIdentity: buildTruth.runtimeIdentity,
      nativeModulePresence: buildTruth.nativeModulePresence,
      markerPresence: buildTruth.markerPresence,
      handlerOwnership: buildTruth.handlerOwnership,
      captureReadiness: buildTruth.captureReadiness,
      registrySyncReadiness: buildTruth.registrySyncReadiness,
      failureReasons: buildTruth.failureReasons,
    })).catch((error) => ({
      ...base,
      buildTruth: {
        schema: F197D_BUILD_TRUTH_SCHEMA,
        ok: false,
        marker: F197D_BUILD_TRUTH_MARKER,
        error: String(error && (error.message || error) || ''),
      },
      failureReasons: {
        activeReasons: ['diagnostic-threw'],
      },
    }));
  }

  API_diagnose.__h2oF197dBuildTruth = true;

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
    previewMetadataOperation: API_previewMetadataOperation,
    applyMetadataOperation: API_applyMetadataOperation,
    // Phase 9B: native viewer/sidebar UI is future-deprecated only after Studio
    // replacement workflows are complete; save/bind/write paths stay active.
    ensureInjected: CORE_FS_ensureInjected,
    syncFolderSidebarActiveState: CORE_FS_syncFolderSidebarActiveState,
    diagnose: API_diagnose,
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
    // Phase 15: register the plural `folders` route so the Library Workspace
    // tab can route out to the canonical Folders list page (owned here)
    // instead of rendering its own duplicate list inside the workspace body.
    H2O.LibraryCore?.registerRoute?.('folders', (route) => {
      // UI_openFoldersViewer takes a single optional argument (a pre-filtered
      // folders array). Passing null means "use the full known set", which is
      // what we want when the user clicks the workspace's Folders tab.
      UI_openFoldersViewer(null, {
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
  if (typeof H2O.folders.menuDiag !== 'function') {
    H2O.folders.menuDiag = function () {
      return Object.assign({}, STATE.menuDiag || {});
    };
  }
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
  if (typeof H2O.folders.previewMetadataOperation !== 'function') H2O.folders.previewMetadataOperation = API_previewMetadataOperation;
  if (typeof H2O.folders.applyMetadataOperation !== 'function') H2O.folders.applyMetadataOperation = API_applyMetadataOperation;
  if (typeof H2O.folders.diagnose !== 'function' || H2O.folders.diagnose.__h2oF197dBuildTruth !== true) {
    H2O.folders.diagnose = API_diagnose;
  }
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
