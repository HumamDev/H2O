// ==UserScript==
// @h2o-id             s0z1g.library_sidebar_sections.studio
// @name               S0Z1g. 🎬 Library Sidebar Sections - Studio
// @namespace          H2O.Premium.CGX.library_sidebar_sections.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000060
// @description        Studio Library sidebar sections: populates Labels, Categories, and Projects sections in the Studio sidebar from H2O.LibraryWorkspace / H2O.LibraryIndex data. Each section heading is collapsible and the state persists per-session. Items link into the Library page's detail routes (#/library/label/<id>, /category/<id>, /project/<id>). Strictly additive — does not change S0Z1f's single Library button, does not touch native ChatGPT scripts.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0Z1g Library Sidebar Sections (Studio)', Date.now());

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  // Persisted collapse state — per-section so toggling Labels doesn't affect Projects.
  const COLLAPSE_KEY = 'h2o:studio:sidebar:sections:collapse:v1';
  const FOLDER_FILTER_NONE = '__none__';
  const ITEM_LIMIT_DEFAULT = 8;
  const FOLDER_SIDEBAR_UI_STATE = {
    showFolderCountPills: false,
  };
  const FOLDER_CREATE_FLOW_STATE = {
    lastAt: 0,
    lastName: '',
    lastStage: '',
    lastStatus: '',
    lastPreview: null,
    lastApply: null,
    lastError: '',
  };
  let folderActionDelegationBound = false;
  const FOLDERS_UI_KEYS = [
    'h2o:prm:cgx:fldrs:state:ui:v1',
    'h2o:folders:ui:v1',
  ];
  const FOLDERS_DATA_KEYS = [
    'h2o:prm:cgx:fldrs:state:data:v1',
    'h2o:folders:data:v1',
    'h2o:folders:v1',
  ];
  const SIDEBAR_APPEARANCE_KEY = 'h2o:studio:sidebar:row-appearance:v1';
  const TAG_CATEGORY_LINKS_KEY = 'h2o:prm:cgx:library:tag-category-links:v1';
  const FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY = 'h2o:studio:folder-local-review:operator-mode:v1';
  const LOCAL_REVIEW_EXPLANATION = 'These folders exist locally but are not in your native ChatGPT folder catalog. Read-only — no cleanup performed.';
  const LOCAL_REVIEW_BADGE_ORDER = Object.freeze(['extra', 'test', 'conflict', 'desktop-only', 'chrome-only', 'review-required']);
  const FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  const FOLDER_METADATA_COLOR_REASON = 'Chrome Studio canonical folder color change';
  const FOLDER_METADATA_CREATE_REASON = 'Chrome Studio canonical folder create';
  const FOLDER_METADATA_RENAME_REASON = 'Chrome Studio canonical folder rename';
  const FOLDER_METADATA_DELETE_PREVIEW_REASON = 'Chrome Studio canonical folder delete preview';
  const FOLDER_METADATA_DELETE_APPLY_REASON = 'Chrome Studio canonical empty folder delete';
  const FOLDER_METADATA_DELETE_CONFIRMATION_TEXT = 'DELETE EMPTY FOLDER';
  const FOLDER_METADATA_COLOR_TIMEOUT_MS = 8000;
  const FOLDER_METADATA_CREATE_TIMEOUT_MS = 15000;
  const FOLDER_METADATA_CREATE_RECOVERY_ATTEMPTS = 8;
  const FOLDER_METADATA_CREATE_RECOVERY_DELAY_MS = 500;
  const FOLDER_METADATA_RENAME_POLL_MS = 700;
  const FOLDER_METADATA_DELETE_PREVIEW_MAX_AGE_MS = 12000;
  const SIDEBAR_MENU_COLORS = Object.freeze([
    { key: 'default', label: 'Default', color: '', value: '' },
    { key: 'blue', label: 'Blue', color: '#3B82F6', value: '#3B82F6' },
    { key: 'red', label: 'Red', color: '#FF4C4C', value: '#FF4C4C' },
    { key: 'green', label: 'Green', color: '#22C55E', value: '#22C55E' },
    { key: 'gold', label: 'Gold', color: '#FFD54F', value: '#FFD54F' },
    { key: 'sky', label: 'Sky', color: '#7DD3FC', value: '#7DD3FC' },
    { key: 'pink', label: 'Pink', color: '#F472B6', value: '#F472B6' },
    { key: 'purple', label: 'Purple', color: '#A855F7', value: '#A855F7' },
    { key: 'orange', label: 'Orange', color: '#FF914D', value: '#FF914D' },
  ]);
  const SIDEBAR_MENU_ICON_KEYS = Object.freeze([
    'hash',
    'folder',
    'briefcase',
    'code',
    'book',
    'pen',
    'scale',
    'heart',
    'cart',
    'globe',
    'wrench',
    'palette',
  ]);
  const SIDEBAR_MENU_ACTION_SVGS = Object.freeze({
    open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H11l2 2h3.5A2.5 2.5 0 0 1 19 7.5v9A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h6m-2.5-2.5L15 12l-2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    studio: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5v13A2.5 2.5 0 0 1 16.5 21h-9A2.5 2.5 0 0 1 5 18.5v-13Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.5 7h7M8.5 11h7M8.5 15h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 0 0 16h1.1a1.9 1.9 0 0 0 1.3-3.2 1.3 1.3 0 0 1 .9-2.2H17a3 3 0 0 0 3-3A7.6 7.6 0 0 0 12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.7 11h.01M9.4 7.8h.01M13 7.4h.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm11-13 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2m-7 0v12.5A1.5 1.5 0 0 0 9.5 21h5A1.5 1.5 0 0 0 16 19.5V7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 15.5V6.5A1.5 1.5 0 0 1 6.5 5h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  });
  const SIDEBAR_ICON_SVGS = Object.freeze({
    label: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h6.1c.7 0 1.3.3 1.8.7l4.4 4.4a2.5 2.5 0 0 1 0 3.6l-7.6 7.6a2.5 2.5 0 0 1-3.6 0L4.2 15.4a2.5 2.5 0 0 1-.7-1.8V5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="8.5" cy="7.5" r="1.25" fill="currentColor"/>
      </svg>
    `,
    hash: `
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
    `,
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14l-1.8 8.2a2.5 2.5 0 0 1-2.4 2H9.2a2.5 2.5 0 0 1-2.4-2L5 5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 15.5h1.7a2.3 2.3 0 0 0 4.6 0H16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 18.5h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8V7m-9.5 4.5h13M5 7h14a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-5 5 5 5m6-10 5 5-5 5M13 5l-2 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Zm0 0v16M8 7h8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm11-13 3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M6 20h12M5 7h14M7 7l-3 6h6L7 7Zm10 0-3 6h6l-3-6Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9-9.1C1.7 7.8 3.6 5 6.7 5c1.7 0 3.2.9 4.1 2.2C11.7 5.9 13.2 5 14.9 5c3.1 0 5 2.8 3.7 5.9C19 15.6 12 20 12 20Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2l1.6 9.5a2 2 0 0 0 2 1.7h5.7a2 2 0 0 0 1.9-1.4L20 8H8M10 20h.01M17 20h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.2 5.1 3.2 8.5S14.2 18.2 12 20.5C9.8 18.2 8.8 15.4 8.8 12S9.8 5.8 12 3.5Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.8 5.2a4.5 4.5 0 0 0 4.9 5L11 18.9a3 3 0 1 1-4.2-4.2l8.7-8.7ZM7.7 17.7h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 0 0 0 16h1.1a1.9 1.9 0 0 0 1.3-3.2 1.3 1.3 0 0 1 .9-2.2H17a3 3 0 0 0 3-3A7.6 7.6 0 0 0 12 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.7 11h.01M9.4 7.8h.01M13 7.4h.01" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  });

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  // ── Service accessors ──────────────────────────────────────────────────────
  function getCore()      { return H2O.LibraryCore || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getIndex()     { return H2O.LibraryIndex || null; }
  function getRouteSvc()  { return getCore()?.getService?.('route') || null; }
  function getChatListSvc() {
    return getCore()?.getService?.('chat-list') || H2O.Library?.LibrarySurfaceHost?.chatListService || null;
  }

  // ── Tiny DOM helper ────────────────────────────────────────────────────────
  function el(tag, attrs = {}, children) {
    const node = D.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'text') node.textContent = String(v);
      else node.setAttribute(k, String(v));
    }
    if (children != null) for (const c of (Array.isArray(children) ? children : [children])) {
      if (c == null || c === false) continue;
      if (c instanceof Node) node.appendChild(c);
      else node.appendChild(D.createTextNode(String(c)));
    }
    return node;
  }

  function formatNumber(n) {
    const v = Number(n) || 0;
    if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
    return String(v);
  }

  function folderOperatorModeEnabled() {
    try {
      const api = W.H2O?.Studio?.folderOperatorMode;
      if (api && typeof api.isEnabled === 'function') return api.isEnabled() === true;
    } catch {}
    try {
      const explicit = W.H2O?.Studio?.folderLocalReviewOperatorMode;
      if (explicit === true) return true;
      if (explicit === false) return false;
    } catch {}
    try {
      const raw = W.localStorage?.getItem?.(FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY);
      return raw === '1' || raw === 'true';
    } catch {}
    return false;
  }

  function folderLocalReviewAppearanceAllowed() {
    try {
      const appearance = W.H2O?.Studio?.appearance;
      if (appearance && typeof appearance.get === 'function') return appearance.get('showLocalReview') !== false;
    } catch {}
    return true;
  }

  function folderLocalReviewUiEnabled() {
    return folderOperatorModeEnabled() && folderLocalReviewAppearanceAllowed();
  }

  function folderDestructiveActionsEnabled() {
    return folderOperatorModeEnabled();
  }

  function folderSidebarDebugDetailsVisible() {
    return folderOperatorModeEnabled();
  }

  function folderSidebarChatCountLabel(value) {
    const count = Number(value || 0) || 0;
    return `${formatNumber(count)} ${count === 1 ? 'chat' : 'chats'}`;
  }

  function folderSidebarSimpleCountLabel(item = {}) {
    const count = Number(item.nativeMembershipCount ?? item.canonicalCount ?? item.count ?? item.knownStudioCount ?? item.knownCount ?? 0) || 0;
    return folderSidebarChatCountLabel(count);
  }

  function countLabelForItem(item = {}) {
    const display = String(item.displayCountLabel || '').trim();
    if (display) return display;
    return item.count != null ? formatNumber(item.count) : '';
  }

  function folderCountDetailsText(item = {}) {
    if (!folderSidebarDebugDetailsVisible()) return folderSidebarSimpleCountLabel(item);
    const display = String(item.displayCountLabel || '').trim();
    if (display) return display;
    if (item.isUnfiled) {
      const known = Number(item.knownStudioCount ?? item.knownCount ?? item.count ?? 0) || 0;
      return `${formatNumber(known)} known here`;
    }
    const hasKnown = item.knownStudioCount != null || item.knownCount != null;
    const hasNative = item.nativeMembershipCount != null || item.canonicalCount != null || item.count != null;
    if (hasNative || hasKnown) {
      const nativeCount = Number(item.nativeMembershipCount ?? item.canonicalCount ?? item.count ?? 0) || 0;
      const knownCount = Number(item.knownStudioCount ?? item.knownCount ?? 0) || 0;
      const parts = [`${formatNumber(nativeCount)} native`, `${formatNumber(knownCount)} known here`];
      if (item.countMismatch === true || (Array.isArray(item.badges) && item.badges.includes('count-mismatch'))) {
        parts.push('count-mismatch');
      }
      return parts.join(' · ');
    }
    return countLabelForItem(item);
  }

  function localReviewBadgeValues(item = {}) {
    const values = new Set((Array.isArray(item.badges) ? item.badges : [])
      .map((badge) => String(badge || '').trim().toLowerCase())
      .filter(Boolean));
    if (item.isExtra) values.add('extra');
    if (item.isTestCandidate) values.add('test');
    if (item.isConflict) values.add('conflict');
    const bucket = String(item.reviewBucket || '').trim().toLowerCase();
    if (bucket) values.add(bucket);
    values.add('review-required');
    return LOCAL_REVIEW_BADGE_ORDER.filter((badge) => values.has(badge));
  }

  function localReviewBadgeNodes(item = {}) {
    const badges = localReviewBadgeValues(item);
    if (!badges.length) return null;
    return el('span', {
      class: 'wbSidebarLocalReviewBadges',
      style: 'display:flex;flex-wrap:wrap;gap:3px;margin-top:3px;min-width:0',
    }, badges.map((badge) => el('span', {
      class: `wbSidebarLocalReviewBadge wbSidebarLocalReviewBadge--${badge}`,
      style: 'display:inline-flex;align-items:center;max-width:100%;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:1px 5px;font-size:9.5px;line-height:1.25;color:rgba(255,255,255,.68);background:rgba(255,255,255,.045);text-transform:none;letter-spacing:0',
      title: badge,
    }, badge)));
  }

  function normalizeHexColor(raw = '') {
    const value = String(raw || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '';
  }

  function readJson(key, fallback = null) {
    try {
      const raw = W.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      W.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      err(`writeJson:${key}`, e);
      return false;
    }
  }

  function emitLibraryAppearanceChanged(detail = {}) {
    const payload = {
      ...detail,
      action: String(detail.action || 'appearance-changed'),
      source: String(detail.source || 'studio-sidebar-menu'),
      ts: Date.now(),
    };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:folders:changed', { detail: payload })); } catch {}
    try { W.dispatchEvent(new CustomEvent('evt:h2o:labels:changed', { detail: payload })); } catch {}
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library:cross-surface-sync', { detail: payload })); } catch {}
  }

  function readNativeCategoryPrefs() {
    for (const key of FOLDERS_UI_KEYS) {
      const ui = readJson(key, null);
      if (ui && typeof ui === 'object' && ui.categoryPrefs && typeof ui.categoryPrefs === 'object') {
        return ui.categoryPrefs;
      }
    }
    return {};
  }

  function writeNativeCategoryAppearance(categoryId, patch = {}) {
    const id = String(categoryId || '').trim();
    if (!id) return false;
    let wrote = false;
    for (const key of FOLDERS_UI_KEYS) {
      const ui = readJson(key, null);
      const nextUi = ui && typeof ui === 'object' ? { ...ui } : {};
      const prefs = nextUi.categoryPrefs && typeof nextUi.categoryPrefs === 'object' ? { ...nextUi.categoryPrefs } : {};
      const current = prefs[id] && typeof prefs[id] === 'object' ? { ...prefs[id] } : {};
      const next = { ...current };
      if (Object.prototype.hasOwnProperty.call(patch, 'icon')) {
        const icon = normalizeCategoryIcon(patch.icon);
        if (icon === 'hash') delete next.icon;
        else next.icon = icon;
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
        const color = normalizeHexColor(patch.color || '');
        if (color) next.color = color;
        else delete next.color;
      }
      if (Object.keys(next).length) prefs[id] = next;
      else delete prefs[id];
      nextUi.categoryPrefs = prefs;
      wrote = writeJson(key, nextUi) || wrote;
    }
    if (wrote) {
      emitLibraryAppearanceChanged({ action: 'category-appearance', categoryId: id });
      renderAllSections();
    }
    return wrote;
  }

  function writeNativeFolderColor(folderId, colorRaw = '') {
    const id = String(folderId || '').trim();
    if (!id) return false;
    const color = normalizeHexColor(colorRaw || '');
    let wrote = false;
    for (const key of FOLDERS_DATA_KEYS) {
      const data = readJson(key, null);
      const folders = Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray(data.folders) ? data.folders : null);
      if (!folders) continue;
      let changed = false;
      const nextFolders = folders.map((row) => {
        const fid = String(row?.id || row?.folderId || '').trim();
        if (fid !== id || !row || typeof row !== 'object') return row;
        changed = true;
        const next = { ...row, updatedAt: new Date().toISOString() };
        if (color) next.iconColor = color;
        else delete next.iconColor;
        return next;
      });
      if (!changed) continue;
      const nextData = Array.isArray(data) ? nextFolders : { ...data, folders: nextFolders, updatedAt: new Date().toISOString() };
      wrote = writeJson(key, nextData) || wrote;
    }
    D.querySelectorAll('.wbFolderItem[data-folder-id]').forEach((node) => {
      if (String(node?.dataset?.folderId || '') !== id) return;
      if (color) {
        node.dataset.color = color;
        node.style.setProperty('--wb-sidebar-item-color', color);
      } else {
        delete node.dataset.color;
        node.style.removeProperty('--wb-sidebar-item-color');
      }
    });
    try {
      const chatList = getChatListSvc();
      if (typeof chatList?.setFolderIconColor === 'function') {
        wrote = true;
        Promise.resolve(chatList.setFolderIconColor(id, color)).then(() => {
          emitLibraryAppearanceChanged({ action: 'folder-appearance', folderId: id, iconColor: color });
        }).catch((e) => err('setFolderIconColor', e));
      }
    } catch (e) { err('setFolderIconColor.outer', e); }
    if (wrote) {
      emitLibraryAppearanceChanged({ action: 'folder-appearance', folderId: id, iconColor: color });
      try { W.H2O?.Studio?.refreshFolders?.(); } catch {}
    }
    return wrote;
  }

  function normalizeLocalAppearanceStore(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { version: 1, updatedAt: Number(src.updatedAt || 0) || 0, folders: {}, labels: {}, projects: {} };
    ['folders', 'labels', 'projects'].forEach((kind) => {
      Object.entries(src[kind] || {}).forEach(([idRaw, prefRaw]) => {
        const id = String(idRaw || '').trim();
        const pref = prefRaw && typeof prefRaw === 'object' ? prefRaw : {};
        if (!id) return;
        const row = {};
        const color = normalizeHexColor(pref.color || '');
        const icon = String(pref.icon || '').trim().toLowerCase();
        const name = String(pref.name || '').trim();
        if (color) row.color = color;
        if (SIDEBAR_ICON_SVGS[icon]) row.icon = icon;
        if (name) row.name = name;
        if (pref.hidden === true) row.hidden = true;
        if (Object.keys(row).length) out[kind][id] = row;
      });
    });
    return out;
  }

  function readLocalAppearanceStore() {
    return normalizeLocalAppearanceStore(readJson(SIDEBAR_APPEARANCE_KEY, null));
  }

  function writeLocalAppearanceStore(storeRaw) {
    const next = normalizeLocalAppearanceStore(storeRaw);
    next.updatedAt = Date.now();
    writeJson(SIDEBAR_APPEARANCE_KEY, next);
    return next;
  }

  function writeLocalRowAppearance(item, patch = {}) {
    const kind = normalizeMenuKind(item?.kind || item?.section || item?.type || '');
    const id = String(item?.id || item?.folderId || item?.labelId || item?.projectId || '').trim();
    if (!id || !['folders', 'labels', 'projects'].includes(kind)) return null;
    const store = readLocalAppearanceStore();
    const current = store[kind][id] && typeof store[kind][id] === 'object' ? { ...store[kind][id] } : {};
    const next = { ...current };
    if (kind === 'folders') {
      delete next.icon;
      delete next.name;
      delete next.hidden;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      const color = normalizeHexColor(patch.color || '');
      if (color) next.color = color;
      else delete next.color;
    }
    if (kind !== 'folders' && Object.prototype.hasOwnProperty.call(patch, 'icon')) {
      const icon = String(patch.icon || '').trim().toLowerCase();
      if (SIDEBAR_ICON_SVGS[icon]) next.icon = icon;
      else delete next.icon;
    }
    if (kind !== 'folders' && Object.prototype.hasOwnProperty.call(patch, 'name')) {
      const name = String(patch.name || '').trim();
      if (name) next.name = name;
      else delete next.name;
    }
    if (kind !== 'folders' && Object.prototype.hasOwnProperty.call(patch, 'hidden')) {
      if (patch.hidden === true) next.hidden = true;
      else delete next.hidden;
    }
    if (Object.keys(next).length) store[kind][id] = next;
    else delete store[kind][id];
    writeLocalAppearanceStore(store);
    emitLibraryAppearanceChanged({ action: `${kind}-appearance`, [`${kind.slice(0, -1)}Id`]: id });
    renderAllSections();
    return next;
  }

  function defaultIconForKind(kind) {
    if (kind === 'folders') return 'folder';
    if (kind === 'labels') return 'label';
    if (kind === 'projects') return 'briefcase';
    return 'hash';
  }

  function getRowAppearance(rawItem = {}) {
    const kind = normalizeMenuKind(rawItem.kind || rawItem.section || rawItem.type || '');
    const id = String(rawItem.id || rawItem.folderId || rawItem.categoryId || rawItem.labelId || rawItem.projectId || '').trim();
    const name = String(rawItem.name || rawItem.label || rawItem.title || '').trim();
    if (kind === 'categories') {
      const appearance = categoryAppearance({ ...rawItem, id, name });
      return {
        id,
        kind,
        name,
        color: appearance.color,
        icon: appearance.icon,
        iconSvg: iconSvg(appearance.icon),
        hidden: false,
      };
    }
    const store = readLocalAppearanceStore();
    const pref = kind === 'folders' && id && store[kind] && store[kind][id] && typeof store[kind][id] === 'object' ? store[kind][id] : {};
    const rawIcon = String(rawItem.iconKey || rawItem.icon || '').trim().toLowerCase();
    const fallbackIcon = SIDEBAR_ICON_SVGS[rawIcon] ? rawIcon : defaultIconForKind(kind);
    const icon = kind === 'folders' ? 'folder' : normalizeCategoryIcon(pref.icon || fallbackIcon);
    const isCanonicalFolder = kind === 'folders' && rawItem.isCanonical === true;
    const color = isCanonicalFolder
      ? normalizeHexColor(rawItem.iconColor || rawItem.color || rawItem.folderColor || rawItem.accentColor || '')
      : normalizeHexColor(pref.color || rawItem.color || rawItem.iconColor || rawItem.labelColor || rawItem.projectColor || '');
    return {
      id,
      kind,
      name: kind === 'folders' ? String(name || id).trim() : String(pref.name || name || id).trim(),
      color,
      icon,
      iconSvg: SIDEBAR_ICON_SVGS[icon] || SIDEBAR_ICON_SVGS[defaultIconForKind(kind)] || SIDEBAR_ICON_SVGS.hash,
      hidden: kind === 'folders' ? false : pref.hidden === true,
    };
  }

  function normalizeCategoryIcon(raw = '') {
    const key = String(raw || '').trim().toLowerCase();
    return SIDEBAR_ICON_SVGS[key] ? key : 'hash';
  }

  function defaultCategoryIconKey(id, name) {
    const key = `${id} ${name}`.toLowerCase();
    return /\b(writing|communication|docs?|copywriting)\b/.test(key) ? 'pen' : 'hash';
  }

  function categoryAppearance(row, prefs = readNativeCategoryPrefs()) {
    const id = String(row?.id || row?.categoryId || '').trim();
    const pref = id && prefs && typeof prefs === 'object' && prefs[id] && typeof prefs[id] === 'object' ? prefs[id] : {};
    const icon = normalizeCategoryIcon(
      pref.icon ||
      row?.icon ||
      row?.iconKey ||
      row?.categoryIcon ||
      row?.appearance?.icon ||
      defaultCategoryIconKey(id, row?.name || row?.label || row?.categoryName || '')
    );
    const color = normalizeHexColor(
      pref.color ||
      row?.color ||
      row?.iconColor ||
      row?.categoryColor ||
      row?.appearance?.color ||
      ''
    ) || '#3B82F6';
    return { icon, color };
  }

  function iconSvg(iconKey) {
    return SIDEBAR_ICON_SVGS[normalizeCategoryIcon(iconKey)] || SIDEBAR_ICON_SVGS.hash;
  }

  function makeItemIcon(item, kind) {
    const svg = item.iconSvg || (item.iconKey ? SIDEBAR_ICON_SVGS[item.iconKey] : '');
    const icon = el('span', { class: 'wbSidebarSectionItemIcon', 'aria-hidden': 'true' });
    if (svg) icon.innerHTML = svg;
    else if (item.icon) icon.textContent = String(item.icon);
    else if (kind === 'labels') icon.innerHTML = SIDEBAR_ICON_SVGS.label;
    else if (kind === 'categories') icon.innerHTML = SIDEBAR_ICON_SVGS.hash;
    return icon;
  }

  function normalizeTagKey(raw = '') {
    return String(raw?.id || raw?.label || raw?.name || raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function tagColorFor(tagId, explicit = '') {
    const color = normalizeHexColor(explicit || '');
    if (color) return color;
    const seed = String(tagId || '');
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    const colors = SIDEBAR_MENU_COLORS.map((row) => row.value).filter(Boolean);
    return colors[Math.abs(hash) % colors.length] || '#F472B6';
  }

  function normalizeTagLinksStore(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { version: 1, updatedAt: Number(src.updatedAt || 0) || 0, tags: {} };
    Object.entries(src.tags || {}).forEach(([fallbackKey, row]) => {
      if (!row || typeof row !== 'object') return;
      const id = normalizeTagKey(row.id || row.key || fallbackKey);
      const categoryIds = Array.from(new Set((Array.isArray(row.categoryIds) ? row.categoryIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)));
      if (!id || !categoryIds.length) return;
      out.tags[id] = {
        id,
        label: String(row.label || row.name || id).trim() || id,
        color: normalizeHexColor(row.color || ''),
        categoryIds,
        updatedAt: Number(row.updatedAt || src.updatedAt || 0) || 0,
      };
    });
    return out;
  }

  function readTagLinksStore() {
    return normalizeTagLinksStore(readJson(TAG_CATEGORY_LINKS_KEY, null));
  }

  function writeTagLinksStore(store) {
    const next = normalizeTagLinksStore(store);
    next.updatedAt = Date.now();
    writeJson(TAG_CATEGORY_LINKS_KEY, next);
    return next;
  }

  function setTagCategoryLinked(tagRaw, categoryIdRaw, linked) {
    const categoryId = String(categoryIdRaw || '').trim();
    const id = normalizeTagKey(tagRaw);
    if (!categoryId || !id) return [];
    const label = String(tagRaw?.label || tagRaw?.name || tagRaw?.id || id).trim() || id;
    const color = tagColorFor(id, tagRaw?.color || '');
    const store = readTagLinksStore();
    const row = store.tags[id] || { id, label, color, categoryIds: [] };
    const selected = new Set(Array.isArray(row.categoryIds) ? row.categoryIds : []);
    if (linked === false) selected.delete(categoryId);
    else selected.add(categoryId);
    const categoryIds = Array.from(selected);
    if (categoryIds.length) {
      store.tags[id] = { ...row, id, label, color, categoryIds, updatedAt: Date.now() };
    } else {
      delete store.tags[id];
    }
    writeTagLinksStore(store);
    const detail = { tagKey: id, categoryIds, ts: Date.now(), source: 'studio-sidebar-menu' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:tags:category-links-changed', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:tags:category-links-changed', { detail })); } catch {}
    return categoryIds;
  }

  function collectMenuTags(categoryIdRaw) {
    const categoryId = String(categoryIdRaw || '').trim();
    const byId = new Map();
    try {
      const tags = H2O.Library?.Tags?.listTags?.() || H2O.Tags?.listTags?.() || [];
      (Array.isArray(tags) ? tags : []).forEach((tag) => {
        const id = normalizeTagKey(tag);
        if (!id) return;
        byId.set(id, {
          id,
          label: String(tag?.label || tag?.name || tag?.id || id).trim() || id,
          color: tagColorFor(id, tag?.color || ''),
          count: Math.max(0, Number(tag?.count || tag?.totalUsage || tag?.chatIds?.length || 0) || 0),
        });
      });
    } catch (e) { err('collectMenuTags:list', e); }
    const store = readTagLinksStore();
    const linkedIds = new Set();
    Object.values(store.tags || {}).forEach((row) => {
      const id = normalizeTagKey(row);
      if (!id) return;
      if (Array.isArray(row.categoryIds) && row.categoryIds.includes(categoryId)) linkedIds.add(id);
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          label: String(row.label || id).trim() || id,
          color: tagColorFor(id, row.color || ''),
          count: 0,
        });
      }
    });
    return Array.from(byId.values())
      .map((tag) => ({ ...tag, linked: linkedIds.has(tag.id) }))
      .sort((a, b) => Number(b.linked) - Number(a.linked) || (b.count - a.count) || a.label.localeCompare(b.label));
  }

  function normalizeMenuKind(raw = '') {
    const kind = String(raw || '').trim().toLowerCase();
    if (kind === 'folder' || kind === 'folders') return 'folders';
    if (kind === 'category' || kind === 'categories') return 'categories';
    if (kind === 'label' || kind === 'labels') return 'labels';
    if (kind === 'project' || kind === 'projects') return 'projects';
    return kind || 'item';
  }

  function studioPlatformAdapter() {
    try {
      return String(W.H2O?.Studio?.platform?.env?.adapter || '').trim().toLowerCase();
    } catch { return ''; }
  }

  function folderMetadataOperationRequest() {
    try {
      const fn = W.H2O?.Studio?.sync?.folderMetadataOperations?.request;
      return typeof fn === 'function' ? fn : null;
    } catch { return null; }
  }

  function canRequestCanonicalFolderColor(item) {
    return item?.isCanonical === true
      && studioPlatformAdapter() === 'mv3'
      && !!folderMetadataOperationRequest();
  }

  function canRequestCanonicalFolderRename(item) {
    return item?.isCanonical === true
      && studioPlatformAdapter() === 'mv3'
      && !!folderMetadataOperationRequest();
  }

  function canRequestCanonicalFolderCreate() {
    return studioPlatformAdapter() === 'mv3'
      && !!folderMetadataOperationRequest();
  }

  function canRequestCanonicalFolderDeletePreview(item) {
    return item?.isCanonical === true
      && folderDestructiveActionsEnabled()
      && studioPlatformAdapter() === 'mv3'
      && !!folderMetadataOperationRequest();
  }

  function canRequestCanonicalFolderDeleteApply(item) {
    return canRequestCanonicalFolderDeletePreview(item);
  }

  function resultCodes(result, listName = 'blockers') {
    const rows = Array.isArray(result?.[listName]) ? result[listName] : [];
    return rows.map((entry) => String(entry?.code || '').trim()).filter(Boolean);
  }

  function firstResultCode(result, fallback = 'folder-color-request-failed') {
    return resultCodes(result, 'blockers')[0]
      || resultCodes(result, 'warnings')[0]
      || fallback;
  }

  function buildFolderColorOperation(item, color, staleGuard = null) {
    const operation = {
      schema: FOLDER_METADATA_OPERATION_SCHEMA,
      operationType: 'change-folder-color',
      folderId: String(item?.id || item?.folderId || '').trim(),
      after: { iconColor: normalizeHexColor(color || '') },
      sourceSurface: 'chrome-studio',
      reason: FOLDER_METADATA_COLOR_REASON,
    };
    if (staleGuard && typeof staleGuard === 'object' && Object.keys(staleGuard).length) {
      operation.staleGuard = staleGuard;
    }
    return operation;
  }

  function normalizeFolderRenameInput(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeFolderCreateInput(value) {
    return normalizeFolderRenameInput(value);
  }

  function buildFolderCreateOperation(name, staleGuard = null) {
    const operation = {
      schema: FOLDER_METADATA_OPERATION_SCHEMA,
      operationType: 'create-folder',
      after: { name: normalizeFolderCreateInput(name) },
      sourceSurface: 'chrome-studio',
      reason: FOLDER_METADATA_CREATE_REASON,
    };
    if (staleGuard && typeof staleGuard === 'object' && Object.keys(staleGuard).length) {
      operation.staleGuard = staleGuard;
    }
    return operation;
  }

  function buildFolderRenameOperation(item, name, staleGuard = null) {
    const operation = {
      schema: FOLDER_METADATA_OPERATION_SCHEMA,
      operationType: 'rename-folder',
      folderId: String(item?.id || item?.folderId || '').trim(),
      after: { name: normalizeFolderRenameInput(name) },
      sourceSurface: 'chrome-studio',
      reason: FOLDER_METADATA_RENAME_REASON,
    };
    if (staleGuard && typeof staleGuard === 'object' && Object.keys(staleGuard).length) {
      operation.staleGuard = staleGuard;
    }
    return operation;
  }

  function buildFolderDeletePreviewOperation(item, staleGuard = null) {
    const expectedName = normalizeFolderRenameInput(item?.name || item?.label || item?.title || '');
    const operation = {
      schema: FOLDER_METADATA_OPERATION_SCHEMA,
      operationType: 'delete-folder',
      folderId: String(item?.id || item?.folderId || '').trim(),
      sourceSurface: 'chrome-studio',
      reason: FOLDER_METADATA_DELETE_PREVIEW_REASON,
    };
    // Native owner accepts `expectedName` as the per-folder identity confirmation
    // on the delete preview/apply contract. Studio rename/color/create already
    // pass identity via `after.name`; delete previously sent neither, which caused
    // the Native owner bridge to time out on the preview request (P8h-g4).
    if (expectedName) operation.expectedName = expectedName;
    if (staleGuard && typeof staleGuard === 'object' && Object.keys(staleGuard).length) {
      operation.staleGuard = staleGuard;
    }
    return operation;
  }

  function buildFolderDeleteOperation(item, staleGuard = null, confirmation = '') {
    const operation = buildFolderDeletePreviewOperation(item, staleGuard);
    operation.reason = FOLDER_METADATA_DELETE_APPLY_REASON;
    operation.confirmation = String(confirmation || '');
    return operation;
  }

  function shortFolderId(value) {
    const id = String(value || '').trim();
    if (!id) return '';
    if (id.length <= 14) return id;
    return `${id.slice(0, 8)}...${id.slice(-5)}`;
  }

  async function resolveFreshCanonicalFolderItem(item) {
    const folderId = String(item?.id || item?.folderId || '').trim();
    if (!folderId) return null;
    try {
      const model = await W.H2O?.Library?.FolderParity?.getDisplayModel?.({ fresh: true });
      const row = (Array.isArray(model?.canonicalRows) ? model.canonicalRows : [])
        .find((candidate) => String(candidate?.folderId || candidate?.id || '').trim() === folderId);
      if (!row) return null;
      return {
        ...item,
        ...row,
        id: folderId,
        folderId,
        kind: 'folders',
        section: 'folders',
        isCanonical: true,
        name: normalizeFolderRenameInput(row.name || row.title || item?.name || ''),
      };
    } catch (e) {
      err('folderRename.resolveFreshCanonicalItem', e);
      return null;
    }
  }

  async function resolveFreshCanonicalFolderItemByName(name) {
    const targetName = normalizeFolderCreateInput(name);
    const targetKey = targetName.toLowerCase();
    if (!targetKey) return null;
    try {
      const model = await W.H2O?.Library?.FolderParity?.getDisplayModel?.({ fresh: true });
      const row = (Array.isArray(model?.canonicalRows) ? model.canonicalRows : [])
        .find((candidate) => normalizeFolderCreateInput(candidate?.name || candidate?.title || '').toLowerCase() === targetKey);
      if (!row) return null;
      const folderId = String(row.folderId || row.id || '').trim();
      return {
        ...row,
        id: folderId,
        folderId,
        kind: 'folders',
        section: 'folders',
        isCanonical: true,
        name: normalizeFolderCreateInput(row.name || row.title || targetName),
      };
    } catch (e) {
      err('folderCreate.resolveFreshCanonicalItemByName', e);
      return null;
    }
  }

  function staleGuardFromPreview(preview) {
    const src = preview?.before && typeof preview.before === 'object' ? preview.before : {};
    const out = {};
    ['folderHash', 'sourceHash', 'membershipHash', 'previewHash'].forEach((key) => {
      const value = String(src[key] || preview?.staleGuard?.[key] || '').trim();
      if (value) out[key] = value;
    });
    return out;
  }

  function deletePreviewBlockers(preview) {
    return resultCodes(preview, 'blockers');
  }

  function deletePreviewHardBlockers(preview) {
    return deletePreviewBlockers(preview)
      .filter((code) => code !== 'delete-confirmation-required');
  }

  function deletePreviewMembershipCount(preview, item = {}) {
    const before = preview?.before && typeof preview.before === 'object' ? preview.before : {};
    const deps = preview?.dependencySummary && typeof preview.dependencySummary === 'object' ? preview.dependencySummary : {};
    return Number(deps.nativeMembershipCount ?? before.nativeMembershipCount ?? before.membershipCount ?? item?.nativeMembershipCount ?? item?.count ?? 0) || 0;
  }

  function deletePreviewItemBucketEmpty(preview) {
    const before = preview?.before && typeof preview.before === 'object' ? preview.before : {};
    const deps = preview?.dependencySummary && typeof preview.dependencySummary === 'object' ? preview.dependencySummary : {};
    if (deps.itemBucketEmpty === true || before.itemBucketEmpty === true) return true;
    if (deps.itemBucketExists === false || before.itemBucketExists === false) return true;
    return false;
  }

  function canApplyDeletePreview(preview, item = {}) {
    if (!preview || typeof preview !== 'object') return false;
    const hardBlockers = deletePreviewHardBlockers(preview);
    if (hardBlockers.length) return false;
    if (deletePreviewMembershipCount(preview, item) !== 0) return false;
    return deletePreviewItemBucketEmpty(preview);
  }

  function navigateAfterDeletedFolder(folderId) {
    const id = String(folderId || '').trim();
    if (!id) return;
    const rawHash = String(W.location?.hash || '');
    const encodedId = encodeURIComponent(id);
    let decodedHash = rawHash;
    try { decodedHash = decodeURIComponent(rawHash); } catch {}
    const pointsToDeletedFolder = rawHash.includes(`/folder/${encodedId}`)
      || rawHash.includes(`folder=${encodedId}`)
      || decodedHash.includes(`/folder/${id}`)
      || decodedHash.includes(`folder=${id}`);
    if (pointsToDeletedFolder) W.location.hash = '#/library/folders';
  }

  function refreshNativeFolderState(reason = 'folder-metadata-apply') {
    const sync = W.H2O?.Library?.Sync || W.H2O?.Studio?.sync || {};
    const fn = typeof sync.refreshNativeFolderState === 'function'
      ? sync.refreshNativeFolderState
      : (typeof sync.refreshNativeBroadcast === 'function' ? sync.refreshNativeBroadcast : null);
    if (typeof fn !== 'function') return null;
    try {
      return fn.call(sync, reason);
    } catch (e) {
      err('refreshNativeFolderState.call', e);
      return null;
    }
  }

  function refreshAfterNativeFolderMetadataApply(reason = 'folder-metadata-apply') {
    let refreshed = false;
    try {
      const result = refreshNativeFolderState(reason);
      if (result && typeof result.finally === 'function') {
        refreshed = true;
        result.finally(() => {
          try { renderAllSections(); } catch (e) { err('renderAfterFolderMetadataApply', e); }
        });
      }
    } catch (e) { err('refreshNativeFolderState.folderMetadataApply', e); }
    if (!refreshed) {
      W.setTimeout(() => {
        try { renderAllSections(); } catch (e) { err('renderAfterFolderMetadataApply.timeout', e); }
      }, 650);
    }
  }

  function refreshAfterNativeFolderColorApply() {
    refreshAfterNativeFolderMetadataApply('folder-color-apply');
  }

  async function requestFolderMetadataOperationWithNativeRefresh(request, operation, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const pollReason = String(opts.pollReason || 'folder-metadata-result-poll');
    let stopped = false;
    let polling = false;
    const poll = () => {
      if (stopped || polling) return;
      const result = refreshNativeFolderState(pollReason);
      if (result && typeof result.finally === 'function') {
        polling = true;
        result.finally(() => { polling = false; });
      }
    };
    const timer = W.setInterval(poll, FOLDER_METADATA_RENAME_POLL_MS);
    W.setTimeout(poll, Math.min(250, FOLDER_METADATA_RENAME_POLL_MS));
    try {
      return await request(operation, opts);
    } finally {
      stopped = true;
      try { W.clearInterval(timer); } catch {}
    }
  }

  function resultHasBlocker(result, code) {
    return resultCodes(result, 'blockers').includes(String(code || '').trim());
  }

  function summarizeFolderMetadataResult(result) {
    if (!result || typeof result !== 'object') return null;
    return {
      requestId: String(result.requestId || ''),
      requestMode: String(result.requestMode || ''),
      operationType: String(result.operationType || ''),
      folderId: String(result.folderId || result.after?.folderId || result.after?.id || ''),
      ok: result.ok === true,
      applied: result.applied === true,
      canApply: result.canApply === true,
      blockers: resultCodes(result, 'blockers').slice(0, 8),
      warnings: resultCodes(result, 'warnings').slice(0, 8),
      afterName: String(result.after?.name || result.proposed?.folderName || ''),
    };
  }

  function recordFolderCreateFlow(stage, patch = {}) {
    FOLDER_CREATE_FLOW_STATE.lastAt = Date.now();
    FOLDER_CREATE_FLOW_STATE.lastStage = String(stage || '');
    Object.assign(FOLDER_CREATE_FLOW_STATE, patch);
  }

  function canApplyFolderCreatePreview(preview, name = '') {
    if (!preview || typeof preview !== 'object') return false;
    if (resultCodes(preview, 'blockers').length) return false;
    const opType = String(preview.operationType || 'create-folder').trim();
    if (opType && opType !== 'create-folder') return false;
    const previewName = normalizeFolderCreateInput(preview.after?.name || preview.proposed?.folderName || name);
    if (!previewName) return false;
    return preview.canApply === true || preview.ok === true || preview.readOnly === true;
  }

  function waitMs(ms) {
    return new Promise((resolve) => W.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
  }

  async function recoverCreatedFolderFromNativeState(name, reason = 'folder-create-recover') {
    const targetName = normalizeFolderCreateInput(name);
    if (!targetName) return null;
    for (let attempt = 0; attempt < FOLDER_METADATA_CREATE_RECOVERY_ATTEMPTS; attempt += 1) {
      try {
        const refresh = refreshNativeFolderState(`${reason}:${attempt + 1}`);
        if (refresh && typeof refresh.then === 'function') await refresh;
      } catch (e) {
        err('folderCreate.recover.refresh', e);
      }
      const fresh = await resolveFreshCanonicalFolderItemByName(targetName);
      if (fresh?.folderId) return fresh;
      await waitMs(FOLDER_METADATA_CREATE_RECOVERY_DELAY_MS);
    }
    return null;
  }

  async function requestCanonicalFolderColor(item, color, controls = {}) {
    const setStatus = typeof controls.setStatus === 'function' ? controls.setStatus : () => {};
    const request = folderMetadataOperationRequest();
    if (!request || studioPlatformAdapter() !== 'mv3') {
      setStatus('Blocked: native-owner-bridge-unavailable', 'blocked');
      return { ok: false, blockers: [{ code: 'native-owner-bridge-unavailable' }] };
    }
    const folderId = String(item?.id || item?.folderId || '').trim();
    if (!folderId || item?.isCanonical !== true) {
      setStatus('Blocked: target-not-canonical', 'blocked');
      return { ok: false, blockers: [{ code: 'target-not-canonical' }] };
    }

    const operation = buildFolderColorOperation(item, color);
    setStatus('Previewing...', 'pending');
    let preview = null;
    try {
      preview = await request(operation, {
        requestMode: 'preview',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
      });
    } catch (e) {
      err('folderColor.preview', e);
      setStatus(`Blocked: ${String(e?.message || e || 'preview-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'preview-request-threw' }] };
    }

    const previewBlocker = resultCodes(preview, 'blockers')[0];
    if (!preview?.ok || previewBlocker) {
      setStatus(`Blocked: ${previewBlocker || firstResultCode(preview)}`, 'blocked');
      return preview;
    }
    if (resultCodes(preview, 'warnings').includes('no-op-color-unchanged')) {
      setStatus('Color already current', 'ok');
      return preview;
    }
    if (preview.canApply !== true) {
      setStatus('Blocked: preview-not-applyable', 'blocked');
      return preview;
    }

    setStatus('Applying...', 'pending');
    let applied = null;
    try {
      applied = await request(buildFolderColorOperation(item, color, staleGuardFromPreview(preview)), {
        requestMode: 'apply',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
      });
    } catch (e) {
      err('folderColor.apply', e);
      setStatus(`Blocked: ${String(e?.message || e || 'apply-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'apply-request-threw' }] };
    }

    const applyBlocker = resultCodes(applied, 'blockers')[0];
    if (!applied?.ok || applyBlocker) {
      setStatus(`Blocked: ${applyBlocker || firstResultCode(applied, 'apply-failed')}`, 'blocked');
      return applied;
    }
    if (applied.applied !== true) {
      if (resultCodes(applied, 'warnings').includes('no-op-color-unchanged')) {
        setStatus('Color already current', 'ok');
      } else {
        setStatus('Color unchanged', 'ok');
      }
      return applied;
    }
    setStatus('Color updated', 'ok');
    refreshAfterNativeFolderColorApply();
    return applied;
  }

  async function requestCanonicalFolderCreate(name, controls = {}) {
    const setStatus = typeof controls.setStatus === 'function' ? controls.setStatus : () => {};
    const request = folderMetadataOperationRequest();
    if (!request || studioPlatformAdapter() !== 'mv3') {
      setStatus('Blocked: native-owner-bridge-unavailable', 'blocked');
      return { ok: false, blockers: [{ code: 'native-owner-bridge-unavailable' }] };
    }
    const nextName = normalizeFolderCreateInput(name);
    if (!nextName) {
      setStatus('Blocked: invalid-folder-name', 'blocked');
      return { ok: false, blockers: [{ code: 'invalid-folder-name' }] };
    }

    const operation = buildFolderCreateOperation(nextName);
    recordFolderCreateFlow('preview-start', {
      lastName: nextName,
      lastStatus: 'previewing',
      lastPreview: null,
      lastApply: null,
      lastError: '',
    });
    setStatus('Previewing...', 'pending');
    let preview = null;
    const requestCreatePreview = () => requestFolderMetadataOperationWithNativeRefresh(request, operation, {
      requestMode: 'preview',
      timeoutMs: FOLDER_METADATA_CREATE_TIMEOUT_MS,
      pollReason: 'folder-create-preview-result-poll',
    });
    try {
      preview = await requestCreatePreview();
      if (resultHasBlocker(preview, 'native-owner-timeout')) {
        recordFolderCreateFlow('preview-timeout-retry', {
          lastPreview: summarizeFolderMetadataResult(preview),
          lastStatus: 'preview-timeout-retry',
        });
        setStatus('Previewing...', 'pending');
        preview = await requestCreatePreview();
      }
    } catch (e) {
      err('folderCreate.preview', e);
      recordFolderCreateFlow('preview-error', {
        lastStatus: 'preview-error',
        lastError: String(e?.message || e || 'preview-failed'),
      });
      setStatus(`Blocked: ${String(e?.message || e || 'preview-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'preview-request-threw' }] };
    }
    recordFolderCreateFlow('preview-result', {
      lastStatus: 'preview-result',
      lastPreview: summarizeFolderMetadataResult(preview),
    });

    const previewBlocker = resultCodes(preview, 'blockers')[0];
    const previewSucceeded = preview?.ok === true || canApplyFolderCreatePreview(preview, nextName);
    if (!previewSucceeded || previewBlocker) {
      recordFolderCreateFlow('preview-blocked', {
        lastStatus: 'preview-blocked',
        lastPreview: summarizeFolderMetadataResult(preview),
      });
      setStatus(`Blocked: ${previewBlocker || firstResultCode(preview, 'folder-create-preview-failed')}`, 'blocked');
      return preview;
    }
    if (!canApplyFolderCreatePreview(preview, nextName)) {
      recordFolderCreateFlow('preview-not-applyable', {
        lastStatus: 'preview-not-applyable',
        lastPreview: summarizeFolderMetadataResult(preview),
      });
      setStatus('Blocked: preview-not-applyable', 'blocked');
      return preview;
    }

    recordFolderCreateFlow('apply-start', {
      lastStatus: 'applying',
      lastPreview: summarizeFolderMetadataResult(preview),
    });
    setStatus('Creating...', 'pending');
    let applied = null;
    try {
      applied = await requestFolderMetadataOperationWithNativeRefresh(request, buildFolderCreateOperation(nextName, staleGuardFromPreview(preview)), {
        requestMode: 'apply',
        timeoutMs: FOLDER_METADATA_CREATE_TIMEOUT_MS,
        pollReason: 'folder-create-apply-result-poll',
      });
    } catch (e) {
      err('folderCreate.apply', e);
      recordFolderCreateFlow('apply-error', {
        lastStatus: 'apply-error',
        lastError: String(e?.message || e || 'apply-failed'),
      });
      setStatus(`Blocked: ${String(e?.message || e || 'apply-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'apply-request-threw' }] };
    }
    recordFolderCreateFlow('apply-result', {
      lastStatus: 'apply-result',
      lastApply: summarizeFolderMetadataResult(applied),
    });

    if (resultHasBlocker(applied, 'native-owner-timeout')) {
      setStatus('Creating...', 'pending');
      const recovered = await recoverCreatedFolderFromNativeState(nextName, 'folder-create-apply-timeout-recover');
      if (recovered?.folderId) {
        applied = {
          schema: 'h2o.folder-metadata-operation-result.v1',
          requestId: String(applied?.requestId || ''),
          requestMode: 'apply',
          ok: true,
          applied: true,
          noMutation: false,
          writesPerformed: 1,
          operationType: 'create-folder',
          folderId: recovered.folderId,
          before: preview.before || null,
          after: recovered,
          blockers: [],
          warnings: [{ code: 'folder-create-result-recovered-from-canonical-state' }],
        };
        recordFolderCreateFlow('apply-recovered', {
          lastStatus: 'apply-recovered',
          lastApply: summarizeFolderMetadataResult(applied),
        });
      }
    }

    const applyBlocker = resultCodes(applied, 'blockers')[0];
    if (!applied?.ok || applyBlocker) {
      recordFolderCreateFlow('apply-blocked', {
        lastStatus: 'apply-blocked',
        lastApply: summarizeFolderMetadataResult(applied),
      });
      setStatus(`Blocked: ${applyBlocker || firstResultCode(applied, 'folder-create-apply-failed')}`, 'blocked');
      return applied;
    }
    if (applied.applied !== true) {
      recordFolderCreateFlow('apply-not-created', {
        lastStatus: 'apply-not-created',
        lastApply: summarizeFolderMetadataResult(applied),
      });
      setStatus('Folder not created', 'blocked');
      return applied;
    }
    recordFolderCreateFlow('created', {
      lastStatus: 'created',
      lastApply: summarizeFolderMetadataResult(applied),
    });
    setStatus('Folder created', 'ok');
    refreshAfterNativeFolderMetadataApply('folder-create-apply');
    W.setTimeout(() => {
      try { renderAllSections(); } catch (e) { err('folderCreate.renderAfterApply', e); }
    }, 250);
    return applied;
  }

  async function requestCanonicalFolderRename(item, name, controls = {}) {
    const setStatus = typeof controls.setStatus === 'function' ? controls.setStatus : () => {};
    const request = folderMetadataOperationRequest();
    if (!request || studioPlatformAdapter() !== 'mv3') {
      setStatus('Blocked: native-owner-bridge-unavailable', 'blocked');
      return { ok: false, blockers: [{ code: 'native-owner-bridge-unavailable' }] };
    }
    const folderId = String(item?.id || item?.folderId || '').trim();
    if (!folderId || item?.isCanonical !== true) {
      setStatus('Blocked: target-not-canonical', 'blocked');
      return { ok: false, blockers: [{ code: 'target-not-canonical' }] };
    }
    const nextName = normalizeFolderRenameInput(name);
    if (!nextName) {
      setStatus('Blocked: invalid-folder-name', 'blocked');
      return { ok: false, blockers: [{ code: 'invalid-folder-name' }] };
    }
    const freshItem = await resolveFreshCanonicalFolderItem(item);
    const requestItem = freshItem || item;
    const currentName = normalizeFolderRenameInput(requestItem?.name || requestItem?.title || '');
    if (currentName && nextName === currentName) {
      setStatus('Name already current', 'ok');
      return { ok: true, applied: false, noMutation: true, warnings: [{ code: 'no-op-name-unchanged' }] };
    }

    const operation = buildFolderRenameOperation(requestItem, nextName);
    setStatus('Previewing...', 'pending');
    let preview = null;
    try {
      preview = await requestFolderMetadataOperationWithNativeRefresh(request, operation, {
        requestMode: 'preview',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
        pollReason: 'folder-rename-preview-result-poll',
      });
    } catch (e) {
      err('folderRename.preview', e);
      setStatus(`Blocked: ${String(e?.message || e || 'preview-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'preview-request-threw' }] };
    }

    const previewBlocker = resultCodes(preview, 'blockers')[0];
    if (!preview?.ok || previewBlocker) {
      setStatus(`Blocked: ${previewBlocker || firstResultCode(preview, 'folder-rename-preview-failed')}`, 'blocked');
      return preview;
    }
    if (resultCodes(preview, 'warnings').includes('no-op-name-unchanged')) {
      setStatus('Name already current', 'ok');
      return preview;
    }
    if (preview.canApply !== true) {
      setStatus('Blocked: preview-not-applyable', 'blocked');
      return preview;
    }

    setStatus('Applying...', 'pending');
    let applied = null;
    try {
      applied = await requestFolderMetadataOperationWithNativeRefresh(request, buildFolderRenameOperation(requestItem, nextName, staleGuardFromPreview(preview)), {
        requestMode: 'apply',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
        pollReason: 'folder-rename-apply-result-poll',
      });
    } catch (e) {
      err('folderRename.apply', e);
      setStatus(`Blocked: ${String(e?.message || e || 'apply-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'apply-request-threw' }] };
    }

    const applyBlocker = resultCodes(applied, 'blockers')[0];
    if (!applied?.ok || applyBlocker) {
      setStatus(`Blocked: ${applyBlocker || firstResultCode(applied, 'folder-rename-apply-failed')}`, 'blocked');
      return applied;
    }
    if (applied.applied !== true) {
      if (resultCodes(applied, 'warnings').includes('no-op-name-unchanged')) {
        setStatus('Name already current', 'ok');
      } else {
        setStatus('Folder name unchanged', 'ok');
      }
      return applied;
    }
    setStatus('Folder renamed', 'ok');
    refreshAfterNativeFolderMetadataApply('folder-rename-apply');
    return applied;
  }

  async function requestCanonicalFolderDeletePreview(item, controls = {}) {
    const setStatus = typeof controls.setStatus === 'function' ? controls.setStatus : () => {};
    const request = folderMetadataOperationRequest();
    if (!request || studioPlatformAdapter() !== 'mv3') {
      setStatus('Native owner unavailable', 'blocked');
      return { ok: false, blockers: [{ code: 'native-owner-bridge-unavailable' }] };
    }
    const folderId = String(item?.id || item?.folderId || '').trim();
    if (!folderId || item?.isCanonical !== true) {
      setStatus('Blocked: target-not-canonical', 'blocked');
      return { ok: false, blockers: [{ code: 'target-not-canonical' }] };
    }

    const operation = buildFolderDeletePreviewOperation(item);
    setStatus('Previewing...', 'pending');
    let preview = null;
    try {
      preview = await requestFolderMetadataOperationWithNativeRefresh(request, operation, {
        requestMode: 'preview',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
        pollReason: 'folder-delete-preview-result-poll',
      });
    } catch (e) {
      err('folderDelete.preview', e);
      setStatus(`Blocked: ${String(e?.message || e || 'preview-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'preview-request-threw' }] };
    }

    const blockers = resultCodes(preview, 'blockers');
    const hardBlockers = deletePreviewHardBlockers(preview);
    if (!preview || typeof preview !== 'object') {
      setStatus('Blocked: folder-delete-preview-failed', 'blocked');
      return preview;
    }
    if (!preview.ok && !blockers.includes('delete-confirmation-required') && !hardBlockers.length) {
      setStatus('Blocked: folder-delete-preview-failed', 'blocked');
      return preview;
    }
    if (!preview?.ok && hardBlockers.length) {
      setStatus(`Blocked: ${hardBlockers[0] || firstResultCode(preview, 'folder-delete-preview-failed')}`, 'blocked');
      return preview;
    }
    if (blockers.includes('delete-non-empty-folder-blocked')) {
      setStatus('Blocked: delete-non-empty-folder-blocked', 'blocked');
    } else if (hardBlockers.length) {
      setStatus(`Blocked: ${hardBlockers[0]}`, 'blocked');
    } else if (blockers.includes('delete-confirmation-required')) {
      setStatus('Type DELETE EMPTY FOLDER to enable delete', 'pending');
    } else {
      setStatus('Preview ready', 'ok');
    }
    return preview;
  }

  async function requestCanonicalFolderDeleteApply(item, preview, confirmation, controls = {}) {
    const setStatus = typeof controls.setStatus === 'function' ? controls.setStatus : () => {};
    const onPreview = typeof controls.onPreview === 'function' ? controls.onPreview : () => {};
    const request = folderMetadataOperationRequest();
    if (!request || studioPlatformAdapter() !== 'mv3') {
      setStatus('Blocked: native-owner-bridge-unavailable', 'blocked');
      return { ok: false, blockers: [{ code: 'native-owner-bridge-unavailable' }] };
    }
    const folderId = String(item?.id || item?.folderId || '').trim();
    if (!folderId || item?.isCanonical !== true) {
      setStatus('Blocked: target-not-canonical', 'blocked');
      return { ok: false, blockers: [{ code: 'target-not-canonical' }] };
    }
    if (String(confirmation || '') !== FOLDER_METADATA_DELETE_CONFIRMATION_TEXT) {
      setStatus('Type DELETE EMPTY FOLDER to enable delete', 'blocked');
      return { ok: false, blockers: [{ code: 'delete-confirmation-required' }] };
    }

    let previewForApply = preview && typeof preview === 'object' ? preview : null;
    const previewAgeMs = Math.max(0, Date.now() - Number(controls.previewAt || 0));
    if (!previewForApply || !String(previewForApply.folderId || '').trim() || previewAgeMs > FOLDER_METADATA_DELETE_PREVIEW_MAX_AGE_MS) {
      previewForApply = await requestCanonicalFolderDeletePreview(item, { setStatus });
      onPreview(previewForApply);
    }

    const hardBlockers = deletePreviewHardBlockers(previewForApply);
    if (hardBlockers.length) {
      setStatus(`Blocked: ${hardBlockers[0]}`, 'blocked');
      return previewForApply;
    }
    if (!canApplyDeletePreview(previewForApply, item)) {
      const blocker = deletePreviewBlockers(previewForApply)[0] || 'delete-preview-not-applyable';
      setStatus(`Blocked: ${blocker}`, 'blocked');
      return previewForApply;
    }

    const operation = buildFolderDeleteOperation(item, staleGuardFromPreview(previewForApply), confirmation);
    setStatus('Applying...', 'pending');
    let applied = null;
    try {
      applied = await requestFolderMetadataOperationWithNativeRefresh(request, operation, {
        requestMode: 'apply',
        timeoutMs: FOLDER_METADATA_COLOR_TIMEOUT_MS,
        pollReason: 'folder-delete-apply-result-poll',
      });
    } catch (e) {
      err('folderDelete.apply', e);
      setStatus(`Blocked: ${String(e?.message || e || 'apply-failed')}`, 'blocked');
      return { ok: false, blockers: [{ code: 'apply-request-threw' }] };
    }

    const applyBlocker = resultCodes(applied, 'blockers')[0];
    if (!applied?.ok || applyBlocker) {
      setStatus(`Blocked: ${applyBlocker || firstResultCode(applied, 'folder-delete-apply-failed')}`, 'blocked');
      return applied;
    }
    if (applied.applied !== true) {
      setStatus('Folder delete not applied', 'blocked');
      return applied;
    }
    setStatus('Folder deleted', 'ok');
    navigateAfterDeletedFolder(folderId);
    refreshAfterNativeFolderMetadataApply('folder-delete-apply');
    W.setTimeout(() => {
      try { closeRowMenu(); } catch {}
      try { renderAllSections(); } catch (e) { err('folderDelete.renderAfterApply', e); }
    }, 250);
    return applied;
  }

  function menuTitleForKind(kind) {
    if (kind === 'folders') return 'Folder actions';
    if (kind === 'categories') return 'Category appearance';
    if (kind === 'labels') return 'Label appearance';
    if (kind === 'projects') return 'Project appearance';
    return 'Item options';
  }

  let activeRowMenu = null;
  let activeRowMenuOff = null;

  function closeRowMenu() {
    if (typeof activeRowMenuOff === 'function') {
      try { activeRowMenuOff(); } catch {}
    }
    activeRowMenuOff = null;
    if (activeRowMenu) {
      try { activeRowMenu.remove(); } catch {}
    }
    activeRowMenu = null;
    D.querySelectorAll('.wbSidebarSectionItemMenu[aria-expanded="true"], .wbFolderMenuBtn[aria-expanded="true"], [data-h2o-folder-create-button="1"][aria-expanded="true"]')
      .forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
  }

  function positionRowMenu(pop, anchorEl) {
    if (!pop?.isConnected || !anchorEl?.isConnected) return;
    const pad = 8;
    const gap = 6;
    const vw = Math.max(320, W.innerWidth || D.documentElement.clientWidth || 0);
    const vh = Math.max(240, W.innerHeight || D.documentElement.clientHeight || 0);
    const rA = anchorEl.getBoundingClientRect();
    let rP = pop.getBoundingClientRect();
    const width = Math.min(rP.width || 320, vw - pad * 2);
    let left = Math.min(rA.right - width, vw - width - pad);
    left = Math.max(pad, left);
    const spaceBelow = Math.max(0, vh - rA.bottom - gap - pad);
    const spaceAbove = Math.max(0, rA.top - gap - pad);
    const preferAbove = spaceBelow < Math.min(rP.height || 360, 320) && spaceAbove > spaceBelow;
    pop.style.maxHeight = `${Math.max(160, Math.min(vh - pad * 2, preferAbove ? spaceAbove : Math.max(spaceBelow, spaceAbove)))}px`;
    rP = pop.getBoundingClientRect();
    let top = preferAbove ? (rA.top - gap - rP.height) : (rA.bottom + gap);
    if (top + rP.height > vh - pad) top = vh - rP.height - pad;
    if (top < pad) top = pad;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  function applyMenuColor(item, color) {
    const kind = normalizeMenuKind(item.kind || item.section);
    if (kind === 'categories') return writeNativeCategoryAppearance(item.id, { color });
    if (kind === 'folders') {
      if (item.isCanonical === true) return false;
      writeLocalRowAppearance(item, { color });
      return writeNativeFolderColor(item.id, color);
    }
    return false;
  }

  function applyMenuIcon(item, icon) {
    const kind = normalizeMenuKind(item.kind || item.section);
    if (kind === 'categories') return writeNativeCategoryAppearance(item.id, { icon });
    return false;
  }

  function makeMenuColorPicker(item, currentColor = '', opts = {}) {
    const current = normalizeHexColor(currentColor || '');
    const onSelect = typeof opts.onSelect === 'function' ? opts.onSelect : null;
    const keepOpen = opts.keepOpen === true;
    const section = el('div', { class: 'wbSidebarNativePickerSection' }, [
      el('div', { class: 'wbSidebarNativePickerLabel' }, String(opts.label || 'Color')),
    ]);
    const grid = el('div', { class: 'wbSidebarNativeColorGrid' });
    const status = opts.status
      ? el('div', {
        class: 'wbSidebarNativePickerStatus',
        role: 'status',
        'aria-live': 'polite',
        style: 'display:none;margin-top:6px;font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
      })
      : null;
    const setStatus = (message, kind = '') => {
      if (!status) return;
      const text = String(message || '');
      status.textContent = text;
      status.dataset.kind = String(kind || '');
      status.style.display = text ? 'block' : 'none';
    };
    SIDEBAR_MENU_COLORS.forEach((option) => {
      const value = normalizeHexColor(option.value || option.color || '');
      const btn = el('button', {
        class: `wbSidebarNativeSwatch${value ? '' : ' is-default'}`,
        type: 'button',
        title: option.label,
        'aria-label': option.label,
        'aria-pressed': value === current ? 'true' : 'false',
      });
      btn.style.setProperty('--swatch-color', value || 'transparent');
      if (!value) btn.appendChild(el('span', { class: 'wbSidebarNativeSwatchSlash', 'aria-hidden': 'true' }));
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (onSelect) {
          Promise.resolve(onSelect(value, { setStatus, statusEl: status, button: btn }))
            .catch((e) => {
              err('menuColorPicker.onSelect', e);
              setStatus(`Blocked: ${String(e?.message || e || 'color-request-failed')}`, 'blocked');
            });
          return;
        }
        if (!keepOpen) closeRowMenu();
        applyMenuColor(item, value);
      });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    if (status) section.appendChild(status);
    return section;
  }

  function makeCanonicalFolderColorPicker(item, currentColor, pop, anchorEl) {
    const picker = makeMenuColorPicker(item, currentColor, {
      label: 'Color',
      status: true,
      keepOpen: true,
      onSelect: (value, controls) => requestCanonicalFolderColor(item, value, controls),
    });
    picker.hidden = true;
    picker.dataset.menuItem = 'canonical-folder-color-picker';
    const action = makeMenuAction('Change color', SIDEBAR_MENU_ACTION_SVGS.palette, () => {
      picker.hidden = !picker.hidden;
      action.setAttribute('aria-expanded', picker.hidden ? 'false' : 'true');
      if (!picker.hidden) {
        W.requestAnimationFrame(() => {
          try { positionRowMenu(pop, anchorEl); } catch {}
          try { picker.querySelector('button')?.focus?.(); } catch {}
        });
      }
    }, {
      keepOpen: true,
      title: 'Change canonical folder color through Native owner',
    });
    action.setAttribute('aria-haspopup', 'true');
    action.setAttribute('aria-expanded', 'false');
    return [action, picker];
  }

  function makeCanonicalFolderRenamePanel(item, pop, anchorEl) {
    let currentName = normalizeFolderRenameInput(item?.name || '');
    let currentItem = item;
    let currentNameRequestSeq = 0;
    const panel = el('div', {
      class: 'wbSidebarNativePickerSection',
      style: 'display:none;flex-direction:column;gap:7px;min-width:220px',
      'data-menu-item': 'canonical-folder-rename-panel',
    });
    panel.appendChild(el('div', { class: 'wbSidebarNativePickerLabel' }, 'Rename folder'));
    const input = el('input', {
      type: 'text',
      value: currentName,
      'aria-label': 'Folder name',
      autocomplete: 'off',
      spellcheck: 'false',
      style: 'width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.20);color:inherit;font:inherit;font-size:12px;outline:none',
    });
    const status = el('div', {
      class: 'wbSidebarNativePickerStatus',
      role: 'status',
      'aria-live': 'polite',
      style: 'display:none;font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
    });
    const setStatus = (message, kind = '') => {
      const text = String(message || '');
      status.textContent = text;
      status.dataset.kind = String(kind || '');
      status.style.display = text ? 'block' : 'none';
    };
    const buttonRow = el('div', {
      style: 'display:flex;gap:6px;justify-content:flex-end;align-items:center',
    });
    const cancel = el('button', {
      type: 'button',
      style: 'padding:5px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:inherit;font:inherit;font-size:12px;cursor:pointer',
    }, 'Cancel');
    const submit = el('button', {
      type: 'button',
      style: 'padding:5px 9px;border-radius:6px;border:1px solid rgba(125,211,252,.34);background:rgba(59,130,246,.18);color:inherit;font:inherit;font-size:12px;cursor:pointer',
    }, 'Rename');
    buttonRow.appendChild(cancel);
    buttonRow.appendChild(submit);
    panel.appendChild(input);
    panel.appendChild(buttonRow);
    panel.appendChild(status);

    let pendingRename = false;
    const syncSubmit = () => {
      const nextName = normalizeFolderRenameInput(input.value);
      input.disabled = pendingRename;
      cancel.disabled = pendingRename;
      submit.disabled = pendingRename || !nextName || nextName === currentName;
      submit.style.opacity = submit.disabled ? '.55' : '1';
      submit.style.cursor = submit.disabled ? 'not-allowed' : 'pointer';
      cancel.style.opacity = pendingRename ? '.55' : '1';
      cancel.style.cursor = pendingRename ? 'not-allowed' : 'pointer';
    };
    const refreshPanelCurrentName = async () => {
      const seq = ++currentNameRequestSeq;
      const previousName = currentName;
      const inputNameAtStart = normalizeFolderRenameInput(input.value);
      const freshItem = await resolveFreshCanonicalFolderItem(currentItem);
      if (seq !== currentNameRequestSeq || pendingRename || panel.style.display === 'none') return currentItem;
      if (freshItem) currentItem = freshItem;
      const freshName = normalizeFolderRenameInput(currentItem?.name || currentItem?.title || currentName);
      if (freshName) {
        currentName = freshName;
        if (!inputNameAtStart || inputNameAtStart === previousName) input.value = freshName;
      }
      syncSubmit();
      try { positionRowMenu(pop, anchorEl); } catch {}
      return currentItem;
    };
    const showPanel = () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      action.setAttribute('aria-expanded', panel.style.display === 'none' ? 'false' : 'true');
      if (panel.style.display !== 'none') {
        input.value = currentName;
        setStatus('', '');
        syncSubmit();
        refreshPanelCurrentName().catch((e) => err('folderRename.refreshPanelCurrentName', e));
        W.requestAnimationFrame(() => {
          try { positionRowMenu(pop, anchorEl); } catch {}
          try { input.focus(); input.select(); } catch {}
        });
      }
    };
    const submitRename = () => {
      const nextName = normalizeFolderRenameInput(input.value);
      if (!nextName) {
        setStatus('Blocked: invalid-folder-name', 'blocked');
        syncSubmit();
        return;
      }
      pendingRename = true;
      syncSubmit();
      Promise.resolve(resolveFreshCanonicalFolderItem(currentItem))
        .then((freshItem) => {
          if (freshItem) currentItem = freshItem;
          const freshName = normalizeFolderRenameInput(currentItem?.name || currentItem?.title || currentName);
          if (freshName) currentName = freshName;
          if (freshName && nextName === freshName) {
            setStatus('Name already current', 'ok');
            return { ok: true, applied: false, noMutation: true, warnings: [{ code: 'no-op-name-unchanged' }] };
          }
          return requestCanonicalFolderRename(currentItem, nextName, { setStatus });
        })
        .then((result) => {
          pendingRename = false;
          const resultName = normalizeFolderRenameInput(result?.after?.name || result?.after?.title || nextName);
          if (result?.ok && resultName) {
            currentName = resultName;
            currentItem = { ...currentItem, name: resultName, title: resultName };
          }
          syncSubmit();
          if (result?.ok && result.applied === true) {
            W.setTimeout(() => closeRowMenu(), 750);
          }
        })
        .catch((e) => {
          pendingRename = false;
          err('folderRename.panel', e);
          setStatus(`Blocked: ${String(e?.message || e || 'rename-failed')}`, 'blocked');
          syncSubmit();
        });
    };
    input.addEventListener('input', syncSubmit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (pendingRename) return;
        panel.style.display = 'none';
        action.setAttribute('aria-expanded', 'false');
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        if (!submit.disabled) submitRename();
      }
    });
    cancel.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (pendingRename) return;
      panel.style.display = 'none';
      action.setAttribute('aria-expanded', 'false');
    });
    submit.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!submit.disabled) submitRename();
    });

    const action = makeMenuAction('Rename folder', SIDEBAR_MENU_ACTION_SVGS.rename, showPanel, {
      keepOpen: true,
      title: 'Rename canonical folder through Native owner',
    });
    action.setAttribute('aria-haspopup', 'true');
    action.setAttribute('aria-expanded', 'false');
    syncSubmit();
    return [action, panel];
  }

  function makeCanonicalFolderDeletePreviewPanel(item, pop, anchorEl) {
    const panel = el('div', {
      class: 'wbSidebarNativePickerSection',
      style: 'display:none;flex-direction:column;gap:7px;min-width:240px;max-width:320px',
      'data-menu-item': 'canonical-folder-delete-preview-panel',
    });
    panel.appendChild(el('div', { class: 'wbSidebarNativePickerLabel' }, 'Delete preview'));
    const body = el('div', {
      style: 'display:flex;flex-direction:column;gap:5px;font-size:11px;line-height:1.35;color:rgba(255,255,255,.72)',
    });
    const status = el('div', {
      class: 'wbSidebarNativePickerStatus',
      role: 'status',
      'aria-live': 'polite',
      style: 'display:none;font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
    });
    const setStatus = (message, kind = '') => {
      const text = String(message || '');
      status.textContent = text;
      status.dataset.kind = String(kind || '');
      status.style.display = text ? 'block' : 'none';
    };
    const confirmWrap = el('div', {
      style: 'display:flex;flex-direction:column;gap:6px;margin-top:2px',
      'data-menu-item': 'canonical-folder-delete-apply-controls',
    });
    const confirmHint = el('div', {
      style: 'font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
    }, `Type ${FOLDER_METADATA_DELETE_CONFIRMATION_TEXT} to enable delete.`);
    const confirmInput = el('input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: FOLDER_METADATA_DELETE_CONFIRMATION_TEXT,
      'aria-label': `Type ${FOLDER_METADATA_DELETE_CONFIRMATION_TEXT} to confirm folder delete`,
      style: 'width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(0,0,0,.22);color:rgba(255,255,255,.92);padding:7px 8px;font-size:11px;line-height:1.3;outline:none',
    });
    const buttonRow = el('div', { style: 'display:flex;justify-content:flex-end;gap:6px' });
    const cancelDelete = el('button', {
      type: 'button',
      class: 'wbSidebarNativeAction',
      style: 'padding:6px 8px;font-size:11px;min-height:28px',
    }, 'Cancel');
    const submitDelete = el('button', {
      type: 'button',
      class: 'wbSidebarNativeAction wbSidebarNativeAction--danger',
      style: 'padding:6px 8px;font-size:11px;min-height:28px',
    }, 'Delete');
    buttonRow.appendChild(cancelDelete);
    buttonRow.appendChild(submitDelete);
    confirmWrap.appendChild(confirmHint);
    confirmWrap.appendChild(confirmInput);
    confirmWrap.appendChild(buttonRow);

    let latestPreview = null;
    let latestPreviewAt = 0;
    let pendingPreview = false;
    let pendingApply = false;
    let action = null;
    const confirmationMatches = () => confirmInput.value.trim() === FOLDER_METADATA_DELETE_CONFIRMATION_TEXT;
    const syncDeleteControls = () => {
      const eligible = canRequestCanonicalFolderDeleteApply(item) && canApplyDeletePreview(latestPreview, item);
      const busy = pendingPreview || pendingApply;
      const canSubmit = eligible && !busy && confirmationMatches();
      confirmInput.disabled = busy || !eligible;
      submitDelete.disabled = !canSubmit;
      submitDelete.setAttribute('aria-disabled', canSubmit ? 'false' : 'true');
      if (!latestPreview) {
        confirmHint.textContent = 'Preview the folder before delete.';
      } else if (!eligible) {
        const blocker = deletePreviewHardBlockers(latestPreview)[0]
          || (deletePreviewMembershipCount(latestPreview, item) > 0 ? 'delete-non-empty-folder-blocked' : 'delete-preview-not-applyable');
        confirmHint.textContent = `Blocked: ${blocker}`;
      } else if (!confirmationMatches()) {
        confirmHint.textContent = `Type ${FOLDER_METADATA_DELETE_CONFIRMATION_TEXT} to enable delete.`;
      } else {
        confirmHint.textContent = 'Ready to delete this empty folder through Native owner.';
      }
    };
    const renderLine = (label, value, opts = {}) => {
      const row = el('div', { style: 'display:flex;gap:8px;justify-content:space-between;align-items:flex-start' });
      row.appendChild(el('span', { style: 'color:rgba(255,255,255,.52)' }, label));
      row.appendChild(el('span', {
        style: `${opts.mono ? 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' : ''}text-align:right;min-width:0;overflow-wrap:anywhere`,
      }, value));
      return row;
    };
    const renderCodes = (label, codes) => {
      const values = Array.isArray(codes) ? codes.filter(Boolean) : [];
      const box = el('div', { style: 'display:flex;flex-direction:column;gap:3px' });
      box.appendChild(el('div', { style: 'color:rgba(255,255,255,.52)' }, label));
      if (!values.length) {
        box.appendChild(el('div', { style: 'color:rgba(255,255,255,.78)' }, 'none'));
        return box;
      }
      values.forEach((code) => {
        box.appendChild(el('code', {
          style: 'display:block;padding:2px 5px;border-radius:5px;background:rgba(255,255,255,.06);font-size:10.5px;white-space:normal;overflow-wrap:anywhere',
        }, code));
      });
      return box;
    };
    const renderPreview = (preview = null) => {
      body.innerHTML = '';
      const before = preview?.before && typeof preview.before === 'object' ? preview.before : {};
      const deps = preview?.dependencySummary && typeof preview.dependencySummary === 'object' ? preview.dependencySummary : {};
      const folderId = String(preview?.folderId || item?.folderId || item?.id || '').trim();
      const folderName = String(before.name || deps.folderName || item?.name || item?.title || folderId || 'Folder');
      const membershipCount = deletePreviewMembershipCount(preview, item);
      const itemBucketEmpty = deletePreviewItemBucketEmpty(preview);
      const confirmation = String(preview?.requiredConfirmation || preview?.confirmation?.text || FOLDER_METADATA_DELETE_CONFIRMATION_TEXT);
      const blockers = resultCodes(preview, 'blockers');
      const warnings = resultCodes(preview, 'warnings');
      body.appendChild(renderLine('Folder', folderName));
      body.appendChild(renderLine('Folder ID', shortFolderId(folderId), { mono: true }));
      body.appendChild(renderLine('Native members', String(membershipCount)));
      body.appendChild(renderLine('Item bucket', itemBucketEmpty ? 'empty' : 'not empty'));
      body.appendChild(renderLine('Required confirmation', confirmation, { mono: true }));
      body.appendChild(renderCodes('Blockers', blockers));
      body.appendChild(renderCodes('Warnings', warnings));
      body.appendChild(el('div', {
        style: 'margin-top:2px;color:rgba(255,255,255,.62)',
      }, membershipCount > 0
        ? 'Delete is blocked because the canonical folder is not empty.'
        : 'Empty folder delete can apply only after exact confirmation.'));
      syncDeleteControls();
    };
    renderPreview(null);
    panel.appendChild(body);
    panel.appendChild(confirmWrap);
    panel.appendChild(status);

    const rememberPreview = (preview) => {
      latestPreview = preview && typeof preview === 'object' ? preview : null;
      latestPreviewAt = latestPreview ? Date.now() : 0;
      renderPreview(latestPreview);
      syncDeleteControls();
    };
    const runPreview = () => {
      if (pendingPreview) return;
      pendingPreview = true;
      syncDeleteControls();
      renderPreview(null);
      Promise.resolve(requestCanonicalFolderDeletePreview(item, { setStatus }))
        .then((preview) => {
          pendingPreview = false;
          rememberPreview(preview);
          try { positionRowMenu(pop, anchorEl); } catch {}
        })
        .catch((e) => {
          pendingPreview = false;
          err('folderDelete.previewPanel', e);
          setStatus(`Blocked: ${String(e?.message || e || 'delete-preview-failed')}`, 'blocked');
          syncDeleteControls();
          try { positionRowMenu(pop, anchorEl); } catch {}
        });
    };
    const submitDeleteRequest = () => {
      if (pendingApply || submitDelete.disabled) return;
      pendingApply = true;
      syncDeleteControls();
      Promise.resolve(requestCanonicalFolderDeleteApply(item, latestPreview, confirmInput.value.trim(), {
        setStatus,
        previewAt: latestPreviewAt,
        onPreview: rememberPreview,
      }))
        .then((result) => {
          pendingApply = false;
          if (result?.ok && result.applied === true) {
            confirmInput.value = '';
            syncDeleteControls();
            W.setTimeout(() => {
              try { positionRowMenu(pop, anchorEl); } catch {}
            }, 0);
            return;
          }
          syncDeleteControls();
          try { positionRowMenu(pop, anchorEl); } catch {}
        })
        .catch((e) => {
          pendingApply = false;
          err('folderDelete.applyPanel', e);
          setStatus(`Blocked: ${String(e?.message || e || 'delete-apply-failed')}`, 'blocked');
          syncDeleteControls();
          try { positionRowMenu(pop, anchorEl); } catch {}
        });
    };
    confirmInput.addEventListener('input', syncDeleteControls);
    confirmInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (pendingPreview || pendingApply) return;
        panel.style.display = 'none';
        action?.setAttribute('aria-expanded', 'false');
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitDeleteRequest();
      }
    });
    cancelDelete.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (pendingPreview || pendingApply) return;
      panel.style.display = 'none';
      action?.setAttribute('aria-expanded', 'false');
    });
    submitDelete.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      submitDeleteRequest();
    });
    const showPanel = () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      action.setAttribute('aria-expanded', panel.style.display === 'none' ? 'false' : 'true');
      if (panel.style.display !== 'none') {
        setStatus('', '');
        confirmInput.value = '';
        latestPreview = null;
        latestPreviewAt = 0;
        syncDeleteControls();
        runPreview();
        W.requestAnimationFrame(() => {
          try { positionRowMenu(pop, anchorEl); } catch {}
          try { confirmInput.focus(); } catch {}
        });
      }
    };
    action = makeMenuAction('Delete folder', SIDEBAR_MENU_ACTION_SVGS.delete, showPanel, {
      keepOpen: true,
      danger: true,
      title: 'Delete an empty canonical folder through Native owner',
    });
    action.setAttribute('aria-haspopup', 'true');
    action.setAttribute('aria-expanded', 'false');
    syncDeleteControls();
    return [action, panel];
  }

  function folderHrefForId(folderId) {
    const id = String(folderId || '').trim();
    if (!id) return '';
    return getRouteSvc()?.buildLibraryHash?.('folder', id) || `#/library/folder/${encodeURIComponent(id)}`;
  }

  function openFolderRoute(folderId) {
    const href = folderHrefForId(folderId);
    if (!href) return false;
    W.location.hash = href.startsWith('#') ? href : `#${href}`;
    return true;
  }

  function countKnownUnfiledRows() {
    try {
      const rows = getIndex()?.getAll?.();
      if (!Array.isArray(rows)) return 0;
      return rows.filter((row) => {
        const folderId = String(row?.folderId || row?.folder || '').trim();
        const folderIds = Array.isArray(row?.folderIds) ? row.folderIds.filter((id) => String(id || '').trim()) : [];
        return !folderId && folderIds.length === 0;
      }).length;
    } catch (e) {
      err('countKnownUnfiledRows', e);
      return 0;
    }
  }

  function buildUnfiledSidebarItem() {
    const knownCount = countKnownUnfiledRows();
    const href = folderHrefForId(FOLDER_FILTER_NONE) || `#/library/folder/${encodeURIComponent(FOLDER_FILTER_NONE)}`;
    return {
      id: FOLDER_FILTER_NONE,
      folderId: FOLDER_FILTER_NONE,
      name: 'Unfiled',
      count: knownCount,
      displayCountLabel: `${formatNumber(knownCount)} known here`,
      knownCount,
      knownStudioCount: knownCount,
      badges: [],
      isCanonical: false,
      isSystem: true,
      isUnfiled: true,
      disableMenu: true,
      href,
      iconKey: 'inbox',
      iconSvg: SIDEBAR_ICON_SVGS.inbox,
    };
  }

  function copyTextValue(value) {
    const text = String(value || '').trim();
    if (!text) return false;
    if (W.navigator?.clipboard?.writeText) {
      W.navigator.clipboard.writeText(text).catch((e) => err('copyTextValue', e));
      return true;
    }
    try { W.prompt?.('Folder ID', text); return true; }
    catch (e) { err('copyTextFallback', e); return false; }
  }

  function makeMenuIconPicker(item, currentIcon = 'hash') {
    const current = normalizeCategoryIcon(currentIcon || 'hash');
    const section = el('div', { class: 'wbSidebarNativePickerSection' }, [
      el('div', { class: 'wbSidebarNativePickerLabel' }, 'Icon'),
    ]);
    const grid = el('div', { class: 'wbSidebarNativeIconGrid' });
    SIDEBAR_MENU_ICON_KEYS.forEach((key) => {
      const btn = el('button', {
        class: 'wbSidebarNativeIconChoice',
        type: 'button',
        title: key,
        'aria-label': key,
        'aria-pressed': key === current ? 'true' : 'false',
      });
      btn.innerHTML = SIDEBAR_ICON_SVGS[key] || SIDEBAR_ICON_SVGS.hash;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        closeRowMenu();
        applyMenuIcon(item, key);
      });
      grid.appendChild(btn);
    });
    section.appendChild(grid);
    return section;
  }

  function makeCategoryTagsPicker(item) {
    const categoryId = String(item.id || '').trim();
    const section = el('div', { class: 'wbSidebarNativeTags' });
    section.appendChild(el('div', { class: 'wbSidebarNativePickerLabel' }, 'Tags'));
    const row = el('div', { class: 'wbSidebarNativeTagAdd' });
    const input = el('input', {
      class: 'wbSidebarNativeTagInput',
      type: 'text',
      placeholder: 'Tag name...',
      'aria-label': 'Tag name',
    });
    const add = el('button', {
      class: 'wbSidebarNativeTagAddButton',
      type: 'button',
      title: 'Link tag',
      'aria-label': 'Link tag',
    });
    add.innerHTML = SIDEBAR_MENU_ACTION_SVGS.plus;
    row.appendChild(input);
    row.appendChild(add);
    const summary = el('div', { class: 'wbSidebarNativeTagSummary' });
    const list = el('div', { class: 'wbSidebarNativeTagList' });

    const renderRows = () => {
      const query = String(input.value || '').trim().toLowerCase();
      const tags = collectMenuTags(categoryId)
        .filter((tag) => !query || tag.label.toLowerCase().includes(query) || tag.id.includes(query))
        .slice(0, 8);
      list.innerHTML = '';
      const linkedCount = collectMenuTags(categoryId).filter((tag) => tag.linked).length;
      summary.textContent = `${linkedCount} tag${linkedCount === 1 ? '' : 's'} linked to ${item.name || 'this category'}`;
      if (!tags.length) {
        list.appendChild(el('div', { class: 'wbSidebarNativeTagEmpty' }, query ? 'No matching tags' : 'No tags yet'));
        return;
      }
      tags.forEach((tag) => {
        const label = el('label', { class: 'wbSidebarNativeTagRow' });
        const checkbox = D.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!tag.linked;
        checkbox.addEventListener('change', () => {
          setTagCategoryLinked(tag, categoryId, checkbox.checked);
          renderRows();
        });
        label.appendChild(checkbox);
        const dot = el('span', { class: 'wbSidebarNativeTagDot', 'aria-hidden': 'true' });
        dot.style.setProperty('--tag-color', tag.color || tagColorFor(tag.id));
        label.appendChild(dot);
        label.appendChild(el('span', { class: 'wbSidebarNativeTagName' }, tag.label));
        label.appendChild(el('span', { class: 'wbSidebarNativeTagCount' }, formatNumber(tag.count || 0)));
        list.appendChild(label);
      });
    };

    const addTypedTag = () => {
      const label = String(input.value || '').trim();
      if (!label) return;
      const tag = { id: normalizeTagKey(label), label, color: tagColorFor(label) };
      if (!tag.id) return;
      setTagCategoryLinked(tag, categoryId, true);
      input.value = '';
      renderRows();
    };
    input.addEventListener('input', renderRows);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        addTypedTag();
      }
    });
    add.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      addTypedTag();
    });
    section.appendChild(row);
    section.appendChild(summary);
    section.appendChild(list);
    renderRows();
    return section;
  }

  function makeMenuAction(label, iconSvg, onClick, opts = {}) {
    const btn = el('button', {
      class: `wbSidebarNativeAction${opts.danger ? ' is-danger' : ''}${opts.disabled ? ' is-disabled' : ''}`,
      type: 'button',
      role: 'menuitem',
      disabled: opts.disabled ? 'disabled' : null,
      title: opts.title || label,
    });
    const icon = el('span', { class: 'wbSidebarNativeActionIcon', 'aria-hidden': 'true' });
    icon.innerHTML = iconSvg || '';
    btn.appendChild(icon);
    btn.appendChild(el('span', {}, label));
    if (!opts.disabled) {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!opts.keepOpen) closeRowMenu();
        try { onClick?.(); } catch (e) { err(`menuAction:${label}`, e); }
      });
    }
    return btn;
  }

  function promptRenameItem(item) {
    const kind = normalizeMenuKind(item.kind || item.section);
    const current = String(item.name || '').trim();
    const next = String(W.prompt?.(`Rename ${kind === 'categories' ? 'category' : kind === 'labels' ? 'label' : 'item'}`, current) || '').trim();
    if (!next || next === current) return false;
    // R4.5.2 — Desktop routes category rename through OrganizationModals →
    // H2O.Studio.actions.categories.rename. `next` is already collected
    // above, so we pass it through and the modal won't re-prompt. MV3
    // falls through to the existing archiveBoot / ChatList ladder.
    if (kind === 'categories') {
      try {
        var modalsCR = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
        if (modalsCR && typeof modalsCR.openCategoryEditor === 'function') {
          modalsCR.openCategoryEditor({ categoryId: item.id, mode: 'rename', name: next })
            .then((res) => {
              if (res && res.ok) {
                emitLibraryAppearanceChanged({ action: 'rename-category', categoryId: item.id });
              }
              // actions.categories.rename already dispatched the canonical
              // refresh event; renderAllSections is still useful for the
              // sidebar's local row state.
              renderAllSections();
            })
            .catch((e) => err('openCategoryEditor.rename', e));
          return true;
        }
      } catch (e) { err('openCategoryEditor.rename.guard', e); }
    }
    if (kind === 'categories' && typeof H2O.archiveBoot?.renameCategory === 'function') {
      H2O.archiveBoot.renameCategory(item.id, next);
      emitLibraryAppearanceChanged({ action: 'rename-category', categoryId: item.id });
      renderAllSections();
      return true;
    }
    if (kind === 'categories' && typeof getChatListSvc()?.renameCategory === 'function') {
      Promise.resolve(getChatListSvc().renameCategory(item.id, next)).then(() => {
        try { H2O.Library?.Categories?.refresh?.(); } catch {}
        emitLibraryAppearanceChanged({ action: 'rename-category', categoryId: item.id });
        renderAllSections();
      }).catch((e) => err('renameCategory', e));
      return true;
    }
    // R4.5.3 — Desktop routes label rename through OrganizationModals →
    // H2O.Studio.actions.labels.rename. `next` is already collected so
    // no re-prompt happens. MV3 falls through to the existing
    // H2O.Labels.renameLabel ladder UNCHANGED.
    if (kind === 'labels') {
      try {
        var modalsLR = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
        if (modalsLR && typeof modalsLR.openLabelEditor === 'function') {
          modalsLR.openLabelEditor({ labelId: item.id, mode: 'rename', name: next })
            .then((res) => {
              if (res && res.ok) {
                emitLibraryAppearanceChanged({ action: 'rename-label', labelId: item.id });
              }
              renderAllSections();
            })
            .catch((e) => err('openLabelEditor.rename', e));
          return true;
        }
      } catch (e) { err('openLabelEditor.rename.guard', e); }
    }
    if (kind === 'labels' && typeof H2O.Labels?.renameLabel === 'function') {
      H2O.Labels.renameLabel(item.type || 'custom', item.id, next);
      emitLibraryAppearanceChanged({ action: 'rename-label', labelId: item.id });
      renderAllSections();
      return true;
    }
    if (kind === 'folders' || kind === 'labels' || kind === 'projects') {
      writeLocalRowAppearance(item, { name: next });
      return true;
    }
    return false;
  }

  function deleteMenuItem(item) {
    const kind = normalizeMenuKind(item.kind || item.section);
    const name = String(item.name || item.id || 'item');
    // R4.5.2 — Desktop routes category delete through OrganizationModals,
    // which runs its OWN enriched window.confirm (category name + bound
    // chat count from LibraryIndex.facets().byCategory). We skip the
    // S0Z1g basic confirm entirely on Desktop to avoid double-prompting.
    if (kind === 'categories') {
      try {
        var modalsCD = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
        if (modalsCD && typeof modalsCD.openCategoryEditor === 'function') {
          modalsCD.openCategoryEditor({ categoryId: item.id, mode: 'delete' })
            .then((res) => {
              if (res && res.ok) {
                emitLibraryAppearanceChanged({ action: 'delete-category', categoryId: item.id });
                renderAllSections();
              }
            })
            .catch((e) => err('openCategoryEditor.delete', e));
          return true;
        }
      } catch (e) { err('openCategoryEditor.delete.guard', e); }
    }
    // R4.5.3 — Desktop routes label delete through OrganizationModals,
    // which runs its OWN enriched window.confirm (label name + bound
    // chat count from LibraryIndex.facets().byLabel). We skip the
    // S0Z1g basic confirm to avoid double-prompting.
    if (kind === 'labels') {
      try {
        var modalsLD = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
        if (modalsLD && typeof modalsLD.openLabelEditor === 'function') {
          modalsLD.openLabelEditor({ labelId: item.id, mode: 'delete' })
            .then((res) => {
              if (res && res.ok) {
                emitLibraryAppearanceChanged({ action: 'delete-label', labelId: item.id });
                renderAllSections();
              }
            })
            .catch((e) => err('openLabelEditor.delete', e));
          return true;
        }
      } catch (e) { err('openLabelEditor.delete.guard', e); }
    }
    const ok = W.confirm?.(`Delete ${kind === 'categories' ? 'category' : kind === 'labels' ? 'label' : 'item'} "${name}"?`);
    if (!ok) return false;
    if (kind === 'categories' && typeof H2O.archiveBoot?.deleteCategory === 'function') {
      H2O.archiveBoot.deleteCategory(item.id);
      emitLibraryAppearanceChanged({ action: 'delete-category', categoryId: item.id });
      renderAllSections();
      return true;
    }
    if (kind === 'categories' && typeof getChatListSvc()?.deleteCategory === 'function') {
      Promise.resolve(getChatListSvc().deleteCategory(item.id)).then(() => {
        try { H2O.Library?.Categories?.refresh?.(); } catch {}
        emitLibraryAppearanceChanged({ action: 'delete-category', categoryId: item.id });
        renderAllSections();
      }).catch((e) => err('deleteCategory', e));
      return true;
    }
    if (kind === 'labels' && typeof H2O.Labels?.deleteLabel === 'function') {
      H2O.Labels.deleteLabel(item.type || 'custom', item.id);
      emitLibraryAppearanceChanged({ action: 'delete-label', labelId: item.id });
      renderAllSections();
      return true;
    }
    if (kind === 'folders' || kind === 'labels' || kind === 'projects') {
      writeLocalRowAppearance(item, { hidden: true });
      return true;
    }
    return false;
  }

  function openFolderCreatePanel(anchorEl) {
    if (!anchorEl || !canRequestCanonicalFolderCreate()) return null;
    closeRowMenu();
    anchorEl.setAttribute('aria-expanded', 'true');
    const pop = el('div', {
      class: 'wbSidebarNativeMenu wbSidebarNativeMenu--folder',
      role: 'dialog',
      'aria-label': 'Create folder',
      'data-kind': 'folders',
      'data-h2o-glass': 'panel',
      'data-h2o-skin': 'sand-glass',
      'data-h2o-skin-surface': 'sand-glass',
    });
    pop.appendChild(el('div', { class: 'wbSidebarNativeMenuTitle' }, 'Create folder'));

    const panel = el('div', {
      class: 'wbSidebarNativePickerSection',
      style: 'display:flex;flex-direction:column;gap:7px;min-width:240px;max-width:320px',
      'data-menu-item': 'canonical-folder-create-panel',
    });
    panel.appendChild(el('div', { class: 'wbSidebarNativePickerLabel' }, 'New folder'));
    const input = el('input', {
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'Folder name',
      'aria-label': 'Folder name',
      style: 'width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(0,0,0,.22);color:rgba(255,255,255,.92);padding:7px 8px;font-size:11px;line-height:1.3;outline:none',
    });
    const status = el('div', {
      class: 'wbSidebarNativePickerStatus',
      role: 'status',
      'aria-live': 'polite',
      style: 'display:none;font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
    });
    const setStatus = (message, kind = '') => {
      const text = String(message || '');
      status.textContent = text;
      status.dataset.kind = String(kind || '');
      status.style.display = text ? 'block' : 'none';
    };
    const buttonRow = el('div', { style: 'display:flex;justify-content:flex-end;gap:6px' });
    const cancel = el('button', {
      type: 'button',
      class: 'wbSidebarNativeAction',
      style: 'padding:6px 8px;font-size:11px;min-height:28px',
    }, 'Cancel');
    const submit = el('button', {
      type: 'button',
      class: 'wbSidebarNativeAction',
      style: 'padding:6px 8px;font-size:11px;min-height:28px',
    }, 'Create');
    buttonRow.appendChild(cancel);
    buttonRow.appendChild(submit);
    panel.appendChild(input);
    panel.appendChild(status);
    panel.appendChild(buttonRow);
    pop.appendChild(panel);

    let pending = false;
    const syncSubmit = () => {
      submit.disabled = pending || !normalizeFolderCreateInput(input.value);
    };
    const submitCreate = () => {
      if (pending || submit.disabled) return;
      pending = true;
      syncSubmit();
      Promise.resolve(requestCanonicalFolderCreate(input.value, { setStatus }))
        .then((result) => {
          pending = false;
          syncSubmit();
          if (result?.ok && result.applied === true) {
            input.value = '';
            syncSubmit();
            W.setTimeout(() => closeRowMenu(), 650);
            return;
          }
          try { positionRowMenu(pop, anchorEl); } catch {}
        })
        .catch((e) => {
          pending = false;
          err('folderCreate.panel', e);
          setStatus(`Blocked: ${String(e?.message || e || 'folder-create-failed')}`, 'blocked');
          syncSubmit();
          try { positionRowMenu(pop, anchorEl); } catch {}
        });
    };
    input.addEventListener('input', syncSubmit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (!pending) closeRowMenu();
        return;
      }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitCreate();
      }
    });
    cancel.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!pending) closeRowMenu();
    });
    submit.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      submitCreate();
    });
    syncSubmit();

    D.body.appendChild(pop);
    activeRowMenu = pop;
    const updatePosition = () => positionRowMenu(pop, anchorEl);
    updatePosition();
    requestAnimationFrame(updatePosition);
    W.addEventListener('resize', updatePosition, true);
    W.addEventListener('scroll', updatePosition, true);
    let ro = null;
    try {
      ro = new ResizeObserver(updatePosition);
      ro.observe(pop);
    } catch {}
    const onDoc = (ev) => {
      if (!pop.contains(ev.target) && ev.target !== anchorEl && !anchorEl.contains?.(ev.target)) closeRowMenu();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape' && !pending) closeRowMenu();
    };
    setTimeout(() => D.addEventListener('mousedown', onDoc, true), 0);
    D.addEventListener('keydown', onKey, true);
    activeRowMenuOff = () => {
      W.removeEventListener('resize', updatePosition, true);
      W.removeEventListener('scroll', updatePosition, true);
      D.removeEventListener('mousedown', onDoc, true);
      D.removeEventListener('keydown', onKey, true);
      try { ro?.disconnect?.(); } catch {}
    };
    W.setTimeout(() => {
      try { input.focus(); } catch {}
    }, 0);
    return pop;
  }

  function openRowMenu(anchorEl, rawItem = {}) {
    if (!anchorEl) return null;
    const item = {
      ...rawItem,
      id: String(rawItem.id || rawItem.folderId || rawItem.categoryId || rawItem.labelId || '').trim(),
      name: String(rawItem.name || rawItem.label || rawItem.title || '').trim(),
      kind: normalizeMenuKind(rawItem.kind || rawItem.section || rawItem.type || ''),
    };
    const isFolderMenu = item.kind === 'folders';
    const isCategoryMenu = item.kind === 'categories';
    if (!item.id || (!isFolderMenu && !isCategoryMenu)) return null;
    closeRowMenu();
    anchorEl.setAttribute('aria-expanded', 'true');
    const pop = el('div', {
      class: `wbSidebarNativeMenu${isFolderMenu ? ' wbSidebarNativeMenu--folder' : ''}`,
      role: 'menu',
      'data-kind': item.kind,
      'data-h2o-glass': 'panel',
      'data-h2o-skin': 'sand-glass',
      'data-h2o-skin-surface': 'sand-glass',
    });
    pop.appendChild(el('div', { class: 'wbSidebarNativeMenuTitle' }, menuTitleForKind(item.kind)));

    const appearance = getRowAppearance(item);
    const color = normalizeHexColor(appearance.color || item.color || item.iconColor || '') || (item.kind === 'categories' ? categoryAppearance(item).color : '');
    if (isFolderMenu) {
      const isCanonicalFolder = item.isCanonical === true;
      const disabledSyncTitle = 'Canonical folder actions are read-only until sync authority is proven.';
      const deleteTitle = 'Preview canonical folder delete through Native owner.';
      const hasFolderRoute = !!folderHrefForId(item.id);
      pop.appendChild(makeMenuAction('Open folder', SIDEBAR_MENU_ACTION_SVGS.open, () => openFolderRoute(item.id), {
        disabled: !hasFolderRoute,
        title: hasFolderRoute ? 'Open folder' : 'Folder route unavailable',
      }));
      pop.appendChild(makeMenuAction('Open in Studio', SIDEBAR_MENU_ACTION_SVGS.studio, () => openFolderRoute(item.id), {
        disabled: !hasFolderRoute,
        title: hasFolderRoute ? 'Open this folder in Studio' : 'Folder route unavailable',
      }));
      pop.appendChild(el('div', { class: 'wbSidebarNativeSep', role: 'separator' }));
      if (isCanonicalFolder) {
        if (canRequestCanonicalFolderColor(item)) {
          makeCanonicalFolderColorPicker(item, color, pop, anchorEl).forEach((node) => pop.appendChild(node));
        } else {
          pop.appendChild(makeMenuAction('Change color', SIDEBAR_MENU_ACTION_SVGS.palette, null, {
            disabled: true,
            title: studioPlatformAdapter() === 'mv3' ? 'Native owner bridge unavailable.' : disabledSyncTitle,
          }));
        }
      } else {
        pop.appendChild(makeMenuColorPicker(item, color));
      }
      if (isCanonicalFolder && canRequestCanonicalFolderRename(item)) {
        makeCanonicalFolderRenamePanel(item, pop, anchorEl).forEach((node) => pop.appendChild(node));
      } else {
        pop.appendChild(makeMenuAction('Rename folder', SIDEBAR_MENU_ACTION_SVGS.rename, null, {
          disabled: true,
          title: isCanonicalFolder && studioPlatformAdapter() === 'mv3' ? 'Native owner bridge unavailable.' : disabledSyncTitle,
        }));
      }
      if (folderDestructiveActionsEnabled()) {
        if (isCanonicalFolder && canRequestCanonicalFolderDeletePreview(item)) {
          makeCanonicalFolderDeletePreviewPanel(item, pop, anchorEl).forEach((node) => pop.appendChild(node));
        } else {
          pop.appendChild(makeMenuAction('Delete folder', SIDEBAR_MENU_ACTION_SVGS.delete, null, {
            danger: true,
            disabled: true,
            title: isCanonicalFolder && studioPlatformAdapter() === 'mv3' ? 'Native owner bridge unavailable.' : deleteTitle,
          }));
        }
      }
      if (folderSidebarDebugDetailsVisible()) {
        pop.appendChild(el('div', { class: 'wbSidebarNativeSep', role: 'separator' }));
        pop.appendChild(makeMenuAction('Copy folder ID', SIDEBAR_MENU_ACTION_SVGS.copy, () => copyTextValue(item.id), {
          title: 'Copy folder ID',
        }));
      }
    } else if (isCategoryMenu) {
      pop.appendChild(makeMenuColorPicker(item, color));
      pop.appendChild(makeMenuIconPicker(item, item.iconKey || appearance.icon || defaultIconForKind(item.kind)));
      pop.appendChild(el('div', { class: 'wbSidebarNativeSep', role: 'separator' }));
      pop.appendChild(makeCategoryTagsPicker(item));
    }

    const chatList = getChatListSvc();
    const canRename = item.kind === 'categories' && (typeof H2O.archiveBoot?.renameCategory === 'function' || typeof chatList?.renameCategory === 'function');
    const canDelete = item.kind === 'categories' && (typeof H2O.archiveBoot?.deleteCategory === 'function' || typeof chatList?.deleteCategory === 'function');
    if (isCategoryMenu) {
      pop.appendChild(el('div', { class: 'wbSidebarNativeSep', role: 'separator' }));
      pop.appendChild(makeMenuAction('Rename', SIDEBAR_MENU_ACTION_SVGS.rename, () => promptRenameItem(item), {
        disabled: !canRename,
        title: canRename ? 'Rename' : 'Rename is available when the native catalog API is loaded',
      }));
      pop.appendChild(makeMenuAction('Delete', SIDEBAR_MENU_ACTION_SVGS.delete, () => deleteMenuItem(item), {
        danger: true,
        disabled: !canDelete,
        title: canDelete ? 'Delete' : 'Delete is available when the native catalog API is loaded',
      }));
    }

    D.body.appendChild(pop);
    activeRowMenu = pop;
    const updatePosition = () => positionRowMenu(pop, anchorEl);
    updatePosition();
    requestAnimationFrame(updatePosition);
    W.addEventListener('resize', updatePosition, true);
    W.addEventListener('scroll', updatePosition, true);
    let ro = null;
    try {
      ro = new ResizeObserver(updatePosition);
      ro.observe(pop);
    } catch {}
    const onDoc = (ev) => {
      if (!pop.contains(ev.target) && ev.target !== anchorEl && !anchorEl.contains?.(ev.target)) closeRowMenu();
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') closeRowMenu();
    };
    setTimeout(() => D.addEventListener('mousedown', onDoc, true), 0);
    D.addEventListener('keydown', onKey, true);
    activeRowMenuOff = () => {
      W.removeEventListener('resize', updatePosition, true);
      W.removeEventListener('scroll', updatePosition, true);
      D.removeEventListener('mousedown', onDoc, true);
      D.removeEventListener('keydown', onKey, true);
      try { ro?.disconnect?.(); } catch {}
    };
    return pop;
  }

  function folderActionMenuItemFromButton(button) {
    if (!button) return null;
    const pageRow = button.closest?.('[data-h2o-folder-page-row="1"], .wbFolderPageRow');
    const sidebarRow = button.closest?.('.wbSidebarSectionItem--folders, [data-section="folders"]');
    const folderId = String(
      button.getAttribute?.('data-h2o-folder-id')
      || button.getAttribute?.('data-folder-id')
      || pageRow?.getAttribute?.('data-h2o-folder-id')
      || pageRow?.getAttribute?.('data-folder-id')
      || sidebarRow?.getAttribute?.('data-id')
      || sidebarRow?.getAttribute?.('data-h2o-folder-id')
      || ''
    ).trim();
    if (!folderId || folderId === FOLDER_FILTER_NONE) return null;
    const isFolderButton = !!button.closest?.('[data-h2o-folder-page-row="1"], .wbFolderPageRow')
      || String(sidebarRow?.getAttribute?.('data-section') || '').trim() === 'folders';
    if (!isFolderButton) return null;
    const canonicalRaw = String(
      button.getAttribute?.('data-h2o-folder-canonical')
      || pageRow?.getAttribute?.('data-canonical')
      || sidebarRow?.getAttribute?.('data-canonical')
      || (sidebarRow?.getAttribute?.('data-color-source') === 'canonical' ? 'true' : '')
      || ''
    ).trim().toLowerCase();
    if (canonicalRaw && canonicalRaw !== 'true') return null;
    const disabled = button.disabled === true
      || String(button.getAttribute?.('aria-disabled') || '').trim().toLowerCase() === 'true';
    if (disabled) return null;
    const rawName = String(
      button.getAttribute?.('data-h2o-folder-name')
      || pageRow?.getAttribute?.('data-h2o-folder-name')
      || sidebarRow?.getAttribute?.('data-h2o-folder-name')
      || button.getAttribute?.('aria-label')
      || pageRow?.getAttribute?.('title')
      || sidebarRow?.getAttribute?.('aria-label')
      || sidebarRow?.getAttribute?.('title')
      || ''
    ).trim();
    const name = rawName
      .replace(/^More options for\s+/i, '')
      .split(' — ')[0]
      .split(', ')[0]
      .trim() || folderId;
    const color = normalizeHexColor(
      button.getAttribute?.('data-h2o-folder-color')
      || pageRow?.getAttribute?.('data-color')
      || sidebarRow?.getAttribute?.('data-color')
      || ''
    );
    return {
      id: folderId,
      folderId,
      name,
      label: name,
      kind: 'folders',
      section: 'folders',
      color,
      iconColor: color,
      isCanonical: true,
    };
  }

  function bindFolderActionMenuDelegation() {
    if (folderActionDelegationBound) return;
    folderActionDelegationBound = true;
    D.addEventListener('pointerdown', (ev) => {
      const button = ev.target?.closest?.('[data-h2o-folder-page-action-button="1"], .wbSidebarSectionItemMenu');
      if (!button || !folderActionMenuItemFromButton(button)) return;
      ev.preventDefault();
      ev.stopPropagation();
      try { ev.stopImmediatePropagation?.(); } catch {}
    }, true);
    D.addEventListener('click', (ev) => {
      const button = ev.target?.closest?.('[data-h2o-folder-page-action-button="1"], .wbSidebarSectionItemMenu');
      if (!button) return;
      const item = folderActionMenuItemFromButton(button);
      if (!item) return;
      ev.preventDefault();
      ev.stopPropagation();
      try { ev.stopImmediatePropagation?.(); } catch {}
      openRowMenu(button, item);
    }, true);
  }

  // ── Collapse state (persisted across sessions) ─────────────────────────────
  function loadCollapse() {
    try { return JSON.parse(W.localStorage.getItem(COLLAPSE_KEY) || '{}') || {}; }
    catch { return {}; }
  }
  function saveCollapse(state) {
    try { W.localStorage.setItem(COLLAPSE_KEY, JSON.stringify(state || {})); } catch {}
  }
  const collapseState = loadCollapse();

  function isCollapsed(key, defaultCollapsed) {
    return Object.prototype.hasOwnProperty.call(collapseState, key)
      ? !!collapseState[key]
      : !!defaultCollapsed;
  }
  function setCollapsed(key, collapsed) {
    collapseState[key] = !!collapsed;
    saveCollapse(collapseState);
  }

  // ── Section rendering ──────────────────────────────────────────────────────
  // Builds a list of `.wbSidebarSectionItem` anchors inside the given host
  // element. Each item links to a Library detail route via the route service's
  // buildLibraryHash. Caps at ITEM_LIMIT_DEFAULT visible items with a "More"
  // link to Explorer (grouped by the section's facet) when the list is longer.
  function renderSectionList(host, kind, items, opts = {}) {
    if (!host) return;
    host.innerHTML = '';
    const limit = opts.limit || ITEM_LIMIT_DEFAULT;

    if (!Array.isArray(items) || items.length === 0) {
      host.appendChild(el('div', { class: 'wbSideEmpty' }, opts.emptyText || `No ${kind} yet`));
      return;
    }

    const prepared = items.map((raw) => {
      const id = String(raw?.id || '').trim();
      const name = String(raw?.name || '').trim();
      if (!id || !name) return null;
      const appearance = kind === 'categories'
        ? getRowAppearance({ ...raw, id, name, kind, section: kind })
        : {
          name,
          color: normalizeHexColor(raw?.color || ''),
          icon: raw?.iconKey || '',
          iconSvg: raw?.iconSvg || '',
          hidden: false,
        };
      if (appearance.hidden) return null;
      return {
        ...raw,
        id,
        name: appearance.name || name,
        color: appearance.color || raw.color || '',
        iconKey: appearance.icon || raw.iconKey || '',
        iconSvg: appearance.iconSvg || raw.iconSvg || '',
        displayCountLabel: String(raw.displayCountLabel || '').trim(),
        badges: Array.isArray(raw.badges) ? raw.badges.map((badge) => String(badge || '').trim()).filter(Boolean) : [],
      };
    }).filter(Boolean);

    if (!prepared.length) {
      host.appendChild(el('div', { class: 'wbSideEmpty' }, opts.emptyText || `No ${kind} yet`));
      return;
    }

    const visible = prepared.slice(0, limit);
    const routeSvc = getRouteSvc();
    const routeKind = kind === 'labels' ? 'label'
                    : kind === 'categories' ? 'category'
                    : kind === 'projects' ? 'project'
                    : kind === 'folders' ? 'folder'
                    : kind;
    const compactFolderCounts = kind === 'folders' && !opts.review && !FOLDER_SIDEBAR_UI_STATE.showFolderCountPills;

    for (const item of visible) {
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      if (!id || !name) continue;
      const href = String(item.href || '').trim() || routeSvc?.buildLibraryHash?.(routeKind, id) || `#/library/explorer`;
      const color = normalizeHexColor(item.color || '');
      const folderDebugDetails = kind !== 'folders' || folderSidebarDebugDetailsVisible();
      const countLabel = kind === 'folders' && !folderDebugDetails
        ? folderSidebarSimpleCountLabel(item)
        : countLabelForItem(item);
      const hasDetailedCount = folderDebugDetails && !!String(item.displayCountLabel || '').trim();
      const countDetails = kind === 'folders' ? folderCountDetailsText(item) : countLabel;
      const showInlineCount = !!countLabel && !compactFolderCounts;
      const countPillStyle = showInlineCount
        ? 'display:block;box-sizing:border-box;min-width:0;max-width:108px;padding:1px 5px;font-size:10px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;align-self:center;'
        : null;
      const badges = Array.isArray(item.badges) ? item.badges.map((badge) => String(badge || '').trim()).filter(Boolean) : [];
      const title = countDetails ? `${name} — ${countDetails}` : name;
      const ariaLabel = countDetails ? `${name}, ${countDetails}` : name;
      const rowStyle = [
        color ? `--wb-sidebar-item-color:${color};` : '',
        compactFolderCounts ? 'grid-template-columns:16px minmax(0,1fr) 24px;' : '',
      ].filter(Boolean).join('');
      const menuButton = !opts.disableMenu && !item.disableMenu && (kind === 'categories' || kind === 'folders')
        ? el('button', {
          class: 'wbSidebarSectionItemMenu',
          type: 'button',
          title: `More options for ${name}`,
          'aria-label': `More options for ${name}`,
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
          'data-h2o-folder-id': kind === 'folders' ? id : null,
          'data-h2o-folder-name': kind === 'folders' ? name : null,
          'data-h2o-folder-canonical': kind === 'folders' && item.isCanonical === true ? 'true' : null,
          'data-h2o-folder-color': kind === 'folders' && color ? color : null,
        }, '...')
        : null;
      if (menuButton) {
        menuButton.addEventListener('pointerdown', (ev) => ev.stopPropagation());
        menuButton.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          openRowMenu(menuButton, { ...item, id, name, kind, section: kind, color });
        });
      }
      const link = el('a', {
        class: `wbSidebarSectionItem wbSidebarSectionItem--${kind}`,
        href,
        title,
        'aria-label': ariaLabel,
        'data-section': kind,
        'data-id': id,
        'data-icon': item.iconKey || '',
        'data-color': color || '',
        'data-badges': badges.length ? badges.join(',') : null,
        'data-canonical-count': item.canonicalCount != null ? item.canonicalCount : null,
        'data-known-count': item.knownCount != null ? item.knownCount : null,
        'data-local-binding-count': item.localBindingCount != null ? item.localBindingCount : null,
        'data-count-mode': compactFolderCounts ? 'compact' : (showInlineCount ? 'inline' : null),
        'data-system-row': item.isSystem === true ? 'true' : null,
        'data-color-source': item.isCanonical === true ? 'canonical' : (color ? 'local' : null),
        style: rowStyle,
      }, [
        makeItemIcon(item, kind),
        opts.review ? el('span', {
          class: 'wbSidebarSectionItemLabel',
          style: 'display:flex;flex-direction:column;gap:0;min-width:0;white-space:normal;line-height:1.25',
        }, [
          el('span', { style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name),
          localReviewBadgeNodes(item),
        ]) : el('span', { class: 'wbSidebarSectionItemLabel' }, name),
        showInlineCount ? el('span', {
          class: `wbSidebarSectionItemCount${hasDetailedCount ? ' wbSidebarSectionItemCount--folderParity' : ''}`,
          title: countDetails || (hasDetailedCount ? countLabel : null),
          'aria-label': countDetails || countLabel,
          style: countPillStyle,
        }, countLabel) : null,
        menuButton,
      ]);
      host.appendChild(link);
    }

    const forcedMoreHref = String(opts.moreHref || '').trim();
    if (forcedMoreHref || prepared.length > visible.length) {
      const moreCount = prepared.length - visible.length;
      const groupBy = kind === 'labels' ? 'label'
                    : kind === 'categories' ? 'category'
                    : kind === 'projects' ? 'project'
                    : kind === 'folders' ? 'folder'
                    : 'date';
      const moreHref = forcedMoreHref || (kind === 'folders' ? '#/library/folders' : '#/library/explorer');
      const moreText = String(opts.moreLabel || '').trim() || `More · ${formatNumber(moreCount)}`;
      const more = el('a', {
        class: 'wbSidebarSectionMore',
        href: moreHref,
        'data-groupby': groupBy,
      }, moreText);
      // Switch non-folder sections into Explorer grouping. Folders have a
      // dedicated catalog page because their native/known counts need room.
      if (kind !== 'folders') {
        more.addEventListener('click', () => {
          try {
            const prefsKey = 'h2o:prm:cgx:library-insights:studio:prefs:v2';
            const raw = W.localStorage.getItem(prefsKey);
            const prefs = raw ? JSON.parse(raw) : {};
            prefs.groupBy = groupBy;
            W.localStorage.setItem(prefsKey, JSON.stringify(prefs));
          } catch (e) { err('more.prefs', e); }
        });
      }
      host.appendChild(more);
    }
  }

  // ── Section-specific data loaders ──────────────────────────────────────────
  async function renderFolders() {
    const ws = getWorkspace();
    if (!ws) return;
    const host = D.getElementById('folderList');
    if (!host) return;
    ensureFolderCountToggle();
    ensureFolderCreateButton();
    let model = null;
    try {
      model = await H2O.Library?.FolderParity?.getDisplayModel?.({ fresh: true });
    } catch (e) { err('folderParity.getDisplayModel', e); }

    const canonicalRows = Array.isArray(model?.canonicalRows) ? model.canonicalRows : [];
    const localReviewRows = Array.isArray(model?.localReviewRows) ? model.localReviewRows : [];
    const showLocalReview = folderLocalReviewUiEnabled();
    const fallbackUsed = !!model?.fallbackUsed;
    host.dataset.h2oFolderLocalReview = showLocalReview ? 'operator' : 'hidden';
    host.dataset.h2oFolderHiddenReviewRows = showLocalReview ? '0' : String(localReviewRows.length);

    const toSidebarItem = (row) => {
      const id = String(row?.folderId || row?.id || '').trim();
      if (!id) return null;
      const name = String(row?.name || id).trim();
      const appearance = getRowAppearance({
        ...row,
        id,
        folderId: id,
        name,
        kind: 'folders',
        section: 'folders',
      });
      const nativeCount = Number(row?.nativeMembershipCount ?? row?.canonicalCount ?? 0) || 0;
      return {
        id,
        folderId: id,
        name: appearance.name || name || id,
        count: nativeCount,
        displayCountLabel: String(row?.displayCountLabel || '').trim(),
        canonicalCount: Number(row?.canonicalCount || 0),
        nativeMembershipCount: nativeCount,
        knownCount: Number(row?.knownCount || 0),
        knownStudioCount: Number(row?.knownStudioCount ?? row?.knownCount ?? 0),
        savedCount: Number(row?.savedCount || 0),
        linkedCount: Number(row?.linkedCount || 0),
        orphanCount: Number(row?.orphanCount || 0),
        localBindingCount: Number(row?.localBindingCount || 0),
        badges: Array.isArray(row?.badges) ? row.badges : [],
        isCanonical: row?.isCanonical === true,
        isExtra: row?.isExtra === true,
        isTestCandidate: row?.isTestCandidate === true,
        isConflict: row?.isConflict === true,
        reviewBucket: row?.reviewBucket || null,
        color: row?.isCanonical === true
          ? normalizeHexColor(row?.iconColor || row?.color || '')
          : (appearance.color || normalizeHexColor(row?.color || row?.iconColor || '')),
        iconKey: appearance.icon || 'folder',
        iconSvg: appearance.iconSvg || SIDEBAR_ICON_SVGS.folder,
      };
    };

    const mainItems = [buildUnfiledSidebarItem()];
    mainItems.push(...canonicalRows
      .map(toSidebarItem)
      .filter((item) => item && item.id !== FOLDER_FILTER_NONE));
    const reviewItems = showLocalReview ? localReviewRows.map(toSidebarItem).filter(Boolean) : [];

    const mainEmptyText = fallbackUsed
      ? 'Folder catalog is loading from native ChatGPT.'
      : 'Canonical folder catalog unavailable. Open chatgpt.com to broadcast folders.';
    renderSectionList(host, 'folders', mainItems, {
      emptyText: mainEmptyText,
      limit: Math.max(mainItems.length, ITEM_LIMIT_DEFAULT),
      moreHref: '#/library/folders',
      moreLabel: 'More',
    });

    if (reviewItems.length > 0) {
      const persistKey = 'h2o:prm:cgx:library-sidebar:local-review:expanded:v1';
      let expandedPref = false;
      try { expandedPref = W.localStorage.getItem(persistKey) === '1'; } catch {}
      const details = el('details', { class: 'wbSidebarSection--localReview' });
      details.open = expandedPref;
      const summary = el('summary', {
        class: 'wbSidebarLocalReviewSummary',
        style: 'cursor:pointer;padding:6px 10px;margin-top:6px;font-size:11px;color:rgba(255,255,255,.5);letter-spacing:.04em;text-transform:uppercase;border-top:1px solid rgba(255,255,255,.06)',
      }, `Local Review · ${formatNumber(reviewItems.length)}`);
      details.appendChild(summary);
      details.appendChild(el('div', {
        class: 'wbSidebarLocalReviewExplanation',
        style: 'padding:0 10px 4px;color:rgba(255,255,255,.56);font-size:10.5px;line-height:1.35',
      }, LOCAL_REVIEW_EXPLANATION));
      const reviewHost = el('div', {
        class: 'wbSidebarLocalReviewList',
        style: 'opacity:0.84;padding-top:4px',
      });
      details.appendChild(reviewHost);
      renderSectionList(reviewHost, 'folders', reviewItems, {
        emptyText: 'No items in Local Review',
        limit: Math.max(reviewItems.length, 1),
        review: true,
        disableMenu: true,
      });
      reviewHost.querySelectorAll('.wbSidebarSectionItem').forEach((node) => {
        node.classList.add('wbSidebarSectionItem--review');
      });
      details.addEventListener('toggle', () => {
        try { W.localStorage.setItem(persistKey, details.open ? '1' : '0'); } catch {}
      });
      host.appendChild(details);
    }

    step('renderFolders.parity', `canonical=${mainItems.length} review=${reviewItems.length}`);
  }

  async function renderLabels() {
    const ws = getWorkspace();
    if (!ws) return;
    const host = D.getElementById('labelList');
    if (!host) return;
    let raw = [];
    try { raw = await ws.getLabels(); } catch (e) { err('getLabels', e); }
    const idx = getIndex();
    const labelFacet = idx?.facets?.()?.byLabel || {};
    const items = (Array.isArray(raw) ? raw : []).map((lb) => {
      const id = String(lb?.id || lb?.labelId || lb?.name || '').trim();
      const name = String(lb?.name || lb?.label || lb?.labelName || id).trim();
      const facetCount = Array.isArray(labelFacet[id]) ? labelFacet[id].length : 0;
      const color = normalizeHexColor(lb?.color || lb?.labelColor || lb?.iconColor || '');
      return id ? { id, name, count: facetCount, color, iconKey: 'label', iconSvg: SIDEBAR_ICON_SVGS.label } : null;
    }).filter(Boolean);
    renderSectionList(host, 'labels', items, { emptyText: 'No labels yet' });
    // R4.5.3 — mount the Desktop label-create button. Tauri-gated; no-op on MV3.
    try { ensureLabelCreateButton(); } catch (e) { err('ensureLabelCreateButton', e); }
    // R4.5.3 — defensive: also call the tag-create-button helper.
    // It targets `.wbSidebarSection--tags`, which doesn't exist in
    // S0Z1g today (no renderTags). The helper bails on missing
    // section, so this is a no-op until a future slice adds the
    // tags sidebar section. Wiring the call here means the button
    // will auto-mount the moment a tags section appears.
    try { ensureTagCreateButton(); } catch (e) { err('ensureTagCreateButton', e); }
    step('renderLabels', String(items.length));
  }

  async function renderCategories() {
    const ws = getWorkspace();
    if (!ws) return;
    const host = D.getElementById('categoryList');
    if (!host) return;
    let raw = [];
    try { raw = await ws.getCategories(); } catch (e) { err('getCategories', e); }
    const idx = getIndex();
    const catFacet = idx?.facets?.()?.byCategory || {};
    const categoryPrefs = readNativeCategoryPrefs();
    const items = (Array.isArray(raw) ? raw : []).map((c) => {
      if (String(c?.status || '').trim().toLowerCase() === 'retired') return null;
      const id = String(c?.id || c?.categoryId || '').trim();
      const name = String(c?.name || c?.label || c?.categoryName || id).trim();
      const facetCount = Array.isArray(catFacet[id]) ? catFacet[id].length : 0;
      const appearance = categoryAppearance({ ...c, id, name }, categoryPrefs);
      return id ? { id, name, count: facetCount, color: appearance.color, iconKey: appearance.icon, iconSvg: iconSvg(appearance.icon) } : null;
    }).filter(Boolean);
    renderSectionList(host, 'categories', items, { emptyText: 'No categories yet' });
    // R4.5.2 — ensure the Desktop category-create button is mounted in
    // the categories section header. Tauri-gated through the helper —
    // returns null on MV3, leaving the section unchanged.
    try { ensureCategoryCreateButton(); } catch (e) { err('ensureCategoryCreateButton', e); }
    step('renderCategories', String(items.length));
  }

  // R4.5.2 — small "+" button in the Categories section header that opens
  // openCategoryEditor({mode:'create'}). Mirrors ensureFolderCreateButton
  // visually but gates on Tauri presence rather than the canonical-folder-
  // create gate (Desktop categories don't need chrome.runtime).
  function ensureCategoryCreateButton() {
    const sec = D.querySelector('.wbSidebarSection--categories');
    const label = sec?.querySelector?.('.wbSideLabel');
    if (!sec || !label) return null;
    const isTauri = !!(W.__TAURI_INTERNALS__ || W.__TAURI__);
    const modalsAvail = !!(W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals
                           && typeof W.H2O.Studio.OrganizationModals.openCategoryEditor === 'function');
    let button = sec.querySelector('[data-h2o-category-create-button="1"]');
    if (!isTauri || !modalsAvail) {
      // Off-Desktop or modals not yet loaded: leave the section unchanged.
      try { button?.remove?.(); } catch {}
      return null;
    }
    if (button && button.parentElement !== sec) sec.insertBefore(button, label.nextSibling);
    if (!button) {
      try {
        sec.style.position = 'relative';
        label.style.paddingRight = '40px';
      } catch {}
      button = el('button', {
        class: 'wbSidebarCategoryCreateButton',
        type: 'button',
        title: 'Create category',
        'aria-label': 'Create category',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'data-h2o-category-create-button': '1',
        style: 'position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);cursor:pointer',
      });
      button.innerHTML = SIDEBAR_MENU_ACTION_SVGS.plus;
      button.querySelectorAll('svg').forEach((svg) => {
        svg.style.width = '13px';
        svg.style.height = '13px';
      });
      button.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      function openCategoryCreate() {
        try {
          var modals = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
          if (modals && typeof modals.openCategoryEditor === 'function') {
            modals.openCategoryEditor({ mode: 'create', anchorEl: button })
              .then((res) => { if (res && res.ok) renderAllSections(); })
              .catch((e) => { try { err('openCategoryEditor.create', e); } catch (_) { /* swallow */ } });
          }
        } catch (e) { try { err('openCategoryEditor.create.guard', e); } catch (_) {} }
      }
      button.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        openCategoryCreate();
      });
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openCategoryCreate();
      });
      sec.insertBefore(button, label.nextSibling);
    }
    try {
      sec.style.position = 'relative';
      label.style.paddingRight = '40px';
    } catch {}
    return button;
  }

  // R4.5.3 — small "+" button in the Labels section header that opens
  // openLabelEditor({mode:'create'}). Same shape as
  // ensureCategoryCreateButton: Tauri+modals gated, no MV3 fallback.
  function ensureLabelCreateButton() {
    const sec = D.querySelector('.wbSidebarSection--labels');
    const label = sec?.querySelector?.('.wbSideLabel');
    if (!sec || !label) return null;
    const isTauri = !!(W.__TAURI_INTERNALS__ || W.__TAURI__);
    const modalsAvail = !!(W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals
                           && typeof W.H2O.Studio.OrganizationModals.openLabelEditor === 'function');
    let button = sec.querySelector('[data-h2o-label-create-button="1"]');
    if (!isTauri || !modalsAvail) {
      try { button?.remove?.(); } catch {}
      return null;
    }
    if (button && button.parentElement !== sec) sec.insertBefore(button, label.nextSibling);
    if (!button) {
      try {
        sec.style.position = 'relative';
        label.style.paddingRight = '40px';
      } catch {}
      button = el('button', {
        class: 'wbSidebarLabelCreateButton',
        type: 'button',
        title: 'Create label',
        'aria-label': 'Create label',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'data-h2o-label-create-button': '1',
        style: 'position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);cursor:pointer',
      });
      button.innerHTML = SIDEBAR_MENU_ACTION_SVGS.plus;
      button.querySelectorAll('svg').forEach((svg) => {
        svg.style.width = '13px';
        svg.style.height = '13px';
      });
      button.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      function openLabelCreate() {
        try {
          var modals = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
          if (modals && typeof modals.openLabelEditor === 'function') {
            modals.openLabelEditor({ mode: 'create', anchorEl: button })
              .then((res) => { if (res && res.ok) renderAllSections(); })
              .catch((e) => { try { err('openLabelEditor.create', e); } catch (_) { /* swallow */ } });
          }
        } catch (e) { try { err('openLabelEditor.create.guard', e); } catch (_) {} }
      }
      button.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        openLabelCreate();
      });
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openLabelCreate();
      });
      sec.insertBefore(button, label.nextSibling);
    }
    try {
      sec.style.position = 'relative';
      label.style.paddingRight = '40px';
    } catch {}
    return button;
  }

  // R4.5.3 — small "+" button in the Tags section header that opens
  // openTagEditor({mode:'create'}). Tags have NO existing sidebar
  // section in S0Z1g today (no renderTags); this helper bails
  // gracefully when `.wbSidebarSection--tags` is absent. The moment a
  // future slice adds the tags sidebar section, this button will
  // auto-mount on the next renderAllSections() pass.
  //
  // HARD BOUNDARY: the create handler calls openTagEditor for CATALOG
  // creation only. NO turn-level tag extraction is triggered here —
  // extraction continues to flow from Native 0F5a.
  function ensureTagCreateButton() {
    const sec = D.querySelector('.wbSidebarSection--tags');
    const label = sec?.querySelector?.('.wbSideLabel');
    if (!sec || !label) return null;   // tags section not yet present
    const isTauri = !!(W.__TAURI_INTERNALS__ || W.__TAURI__);
    const modalsAvail = !!(W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals
                           && typeof W.H2O.Studio.OrganizationModals.openTagEditor === 'function');
    let button = sec.querySelector('[data-h2o-tag-create-button="1"]');
    if (!isTauri || !modalsAvail) {
      try { button?.remove?.(); } catch {}
      return null;
    }
    if (button && button.parentElement !== sec) sec.insertBefore(button, label.nextSibling);
    if (!button) {
      try {
        sec.style.position = 'relative';
        label.style.paddingRight = '40px';
      } catch {}
      button = el('button', {
        class: 'wbSidebarTagCreateButton',
        type: 'button',
        title: 'Create tag',
        'aria-label': 'Create tag',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'data-h2o-tag-create-button': '1',
        style: 'position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);cursor:pointer',
      });
      button.innerHTML = SIDEBAR_MENU_ACTION_SVGS.plus;
      button.querySelectorAll('svg').forEach((svg) => {
        svg.style.width = '13px';
        svg.style.height = '13px';
      });
      button.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      function openTagCreate() {
        try {
          var modals = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
          if (modals && typeof modals.openTagEditor === 'function') {
            modals.openTagEditor({ mode: 'create', anchorEl: button })
              .then((res) => { if (res && res.ok) renderAllSections(); })
              .catch((e) => { try { err('openTagEditor.create', e); } catch (_) { /* swallow */ } });
          }
        } catch (e) { try { err('openTagEditor.create.guard', e); } catch (_) {} }
      }
      button.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        openTagCreate();
      });
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        openTagCreate();
      });
      sec.insertBefore(button, label.nextSibling);
    }
    try {
      sec.style.position = 'relative';
      label.style.paddingRight = '40px';
    } catch {}
    return button;
  }

  function renderProjects() {
    const idx = getIndex();
    if (!idx) return;
    const host = D.getElementById('projectList');
    if (!host) return;
    const facet = idx.facets().byProject || {};
    const items = Object.entries(facet)
      .map(([id, ids]) => ({
        id: String(id),
        name: String(id),               // no project-name catalog in Studio today
        count: Array.isArray(ids) ? ids.length : 0,
        icon: '◧',
      }))
      .filter((p) => p.id)
      .sort((a, b) => b.count - a.count);
    renderSectionList(host, 'projects', items, { emptyText: 'No projects yet' });
    step('renderProjects', String(items.length));
  }

  // ── Collapse-toggle wiring ─────────────────────────────────────────────────
  // Click the section's label/header to toggle visibility of the body. Default
  // expanded; toggles are remembered across sessions.
  function bindCollapseToggle(sec, key, defaultCollapsed) {
    if (!sec || sec.__h2oCollapseBound) return;
    sec.__h2oCollapseBound = true;
    const label = sec.querySelector('.wbSideLabel');
    if (!label) return;

    label.style.cursor = 'pointer';
    label.setAttribute('role', 'button');
    label.setAttribute('tabindex', '0');
    label.setAttribute('aria-controls', sec.querySelector('[id$="List"]')?.id || '');

    const apply = (collapsed) => {
      sec.classList.toggle('is-collapsed', collapsed);
      label.setAttribute('aria-expanded', String(!collapsed));
    };

    apply(isCollapsed(key, defaultCollapsed));

    const toggle = () => {
      const next = !sec.classList.contains('is-collapsed');
      apply(next);
      setCollapsed(key, next);
      step('collapse-toggle', `${key}:${next}`);
    };

    label.addEventListener('click', toggle);
    label.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
    });
  }

  function updateFolderCountToggleButton(button) {
    if (!button) return;
    const enabled = !!FOLDER_SIDEBAR_UI_STATE.showFolderCountPills;
    button.textContent = '#';
    button.title = enabled ? 'Hide folder counts' : 'Show folder counts';
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Hide folder counts' : 'Show folder counts');
    button.style.background = enabled ? 'rgba(59,130,246,.18)' : 'rgba(255,255,255,.035)';
    button.style.borderColor = enabled ? 'rgba(125,211,252,.35)' : 'rgba(255,255,255,.12)';
    button.style.color = enabled ? 'rgba(191,219,254,.95)' : 'rgba(255,255,255,.62)';
  }

  function ensureFolderCountToggle() {
    const sec = D.querySelector('.wbSidebarSection--folders');
    const label = sec?.querySelector?.('.wbSideLabel');
    if (!sec || !label) return null;
    let button = sec.querySelector('[data-h2o-folder-count-toggle="1"]');
    if (button && button.parentElement !== sec) sec.insertBefore(button, label.nextSibling);
    if (!button) {
      try {
        sec.style.position = 'relative';
        label.style.paddingRight = '40px';
      } catch {}
      button = el('button', {
        class: 'wbSidebarFolderCountToggle',
        type: 'button',
        'data-h2o-folder-count-toggle': '1',
        style: 'position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.62);font:700 11px/1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0;text-transform:none;cursor:pointer',
      });
      button.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      button.addEventListener('keydown', (ev) => ev.stopPropagation());
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        FOLDER_SIDEBAR_UI_STATE.showFolderCountPills = !FOLDER_SIDEBAR_UI_STATE.showFolderCountPills;
        updateFolderCountToggleButton(button);
        renderFolders().catch((e) => err('renderFolders.countToggle', e));
      });
      sec.insertBefore(button, label.nextSibling);
    }
    updateFolderCountToggleButton(button);
    return button;
  }

  function ensureFolderCreateButton() {
    const sec = D.querySelector('.wbSidebarSection--folders');
    const label = sec?.querySelector?.('.wbSideLabel');
    if (!sec || !label) return null;
    let button = sec.querySelector('[data-h2o-folder-create-button="1"]');
    if (!canRequestCanonicalFolderCreate()) {
      try { button?.remove?.(); } catch {}
      return null;
    }
    if (button && button.parentElement !== sec) sec.insertBefore(button, label.nextSibling);
    if (!button) {
      try {
        sec.style.position = 'relative';
        label.style.paddingRight = '68px';
      } catch {}
      button = el('button', {
        class: 'wbSidebarFolderCreateButton',
        type: 'button',
        title: 'Create folder',
        'aria-label': 'Create folder',
        'aria-haspopup': 'dialog',
        'aria-expanded': 'false',
        'data-h2o-folder-create-button': '1',
        style: 'position:absolute;top:8px;right:36px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:22px;height:20px;padding:0;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(255,255,255,.035);color:rgba(255,255,255,.72);cursor:pointer',
      });
      button.innerHTML = SIDEBAR_MENU_ACTION_SVGS.plus;
      button.querySelectorAll('svg').forEach((svg) => {
        svg.style.width = '13px';
        svg.style.height = '13px';
      });
      button.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      // R4.5.1.a — Desktop routes folder creation through
      // H2O.Studio.OrganizationModals.openFolderEditor → actions.folders.create.
      // The OrganizationModals module is Tauri-gated and only registers on
      // Desktop, so on MV3 the dereference fails and we fall through to the
      // existing canonical-folder-create panel (preserved verbatim).
      function tryOpenOrganizationModalsCreate() {
        try {
          var modals = (W.H2O && W.H2O.Studio && W.H2O.Studio.OrganizationModals) || null;
          if (modals && typeof modals.openFolderEditor === 'function') {
            modals.openFolderEditor({ mode: 'create', anchorEl: button })
              .catch((e) => { try { err('openFolderEditor.create', e); } catch (_) { /* swallow */ } });
            return true;
          }
        } catch (_) { /* fall through */ }
        return false;
      }
      button.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        if (tryOpenOrganizationModalsCreate()) return;
        openFolderCreatePanel(button);
      });
      button.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (tryOpenOrganizationModalsCreate()) return;
        openFolderCreatePanel(button);
      });
      sec.insertBefore(button, label.nextSibling);
    }
    try {
      sec.style.position = 'relative';
      label.style.paddingRight = '68px';
    } catch {}
    return button;
  }

  // ── Re-render orchestration ────────────────────────────────────────────────
  function renderAllSections() {
    // Each loader has its own error boundary; one failure doesn't block the others.
    renderFolders().catch((e) => err('renderFolders.outer', e));
    renderLabels().catch((e) => err('renderLabels.outer', e));
    renderCategories().catch((e) => err('renderCategories.outer', e));
    try { renderProjects(); } catch (e) { err('renderProjects.outer', e); }
  }

  function bindUpdates() {
    const ws = getWorkspace();
    if (ws?.subscribe) ws.subscribe(() => { renderAllSections(); });
    // Refresh on cross-surface broadcasts so native mutations propagate here.
    W.addEventListener('evt:h2o:library:cross-surface-sync', () => renderAllSections());
    W.addEventListener('evt:h2o:folders:changed', () => renderAllSections());
    W.addEventListener('evt:h2o:labels:changed', () => renderAllSections());
    W.addEventListener('evt:h2o:studio:folder-operator-mode-changed', () => renderAllSections());
    W.addEventListener('evt:h2o:studio:appearance:changed', () => renderAllSections());
    W.addEventListener('storage', (ev) => {
      if (FOLDERS_UI_KEYS.includes(String(ev?.key || '')) || String(ev?.key || '') === FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY) renderAllSections();
    });
    step('bindUpdates');
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  function bootSections() {
    const foldersSec = D.querySelector('.wbSidebarSection--folders');
    const labelsSec  = D.querySelector('.wbSidebarSection--labels');
    const catsSec    = D.querySelector('.wbSidebarSection--categories');
    const projsSec   = D.querySelector('.wbSidebarSection--projects');

    // Folders is now collapsible too (v2.9 visual parity with Labels /
    // Categories / Projects). Folders defaults to expanded — it's the
    // most-used facet and matches the native ChatGPT sidebar default.
    // Labels and Projects collapse by default — they're often empty on a
    // fresh install. Categories defaults to expanded since users typically
    // see categories applied to their saved chats.
    if (foldersSec) bindCollapseToggle(foldersSec, 'folders',    false);
    if (labelsSec)  bindCollapseToggle(labelsSec,  'labels',     true);
    if (catsSec)    bindCollapseToggle(catsSec,    'categories', false);
    if (projsSec)   bindCollapseToggle(projsSec,   'projects',   true);
    ensureFolderCountToggle();
    ensureFolderCreateButton();
    bindFolderActionMenuDelegation();

    renderAllSections();
    bindUpdates();
    step('boot.ok');
  }

  function tryBoot(attemptsLeft = 60) {
    // Library Core + Workspace + Index are needed for full render. If they
    // aren't ready yet we retry every 100ms up to 6 seconds.
    if (getCore() && getWorkspace() && getIndex()) {
      bootSections();
      return;
    }
    if (attemptsLeft <= 0) {
      err('boot.timeout', 'gave up waiting for Library Core / Workspace / Index');
      // Still bind collapse toggles so the heading clicks at least work.
      bootSections();
      return;
    }
    W.setTimeout(() => tryBoot(attemptsLeft - 1), 100);
  }

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-sidebar-sections', { surface: 'studio', version: '1.0.0' }, { replace: true });
      step('register-on-core');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', () => { registerOnCore(); tryBoot(); }, { once: true });
  } else {
    registerOnCore();
    tryBoot();
  }

  // Public API for diagnostics
  H2O.Library.SidebarSections = {
    surface: 'studio',
    version: '1.0.0',
    refresh: renderAllSections,
    openRowMenu,
    closeRowMenu,
    getRowAppearance,
    setCollapsed,
    diagnose() {
      return {
        surface: 'studio',
        version: '1.0.0',
        labelsRendered:    D.getElementById('labelList')?.children.length || 0,
        categoriesRendered: D.getElementById('categoryList')?.children.length || 0,
        projectsRendered:  D.getElementById('projectList')?.children.length || 0,
        collapseState: { ...collapseState },
        folderSidebarUi: { ...FOLDER_SIDEBAR_UI_STATE },
        folderOperatorMode: {
          enabled: folderOperatorModeEnabled(),
          localReviewVisible: folderLocalReviewUiEnabled(),
          storageKey: FOLDER_LOCAL_REVIEW_OPERATOR_MODE_KEY,
        },
        folderCreateFlow: {
          ...FOLDER_CREATE_FLOW_STATE,
          lastPreview: FOLDER_CREATE_FLOW_STATE.lastPreview ? { ...FOLDER_CREATE_FLOW_STATE.lastPreview } : null,
          lastApply: FOLDER_CREATE_FLOW_STATE.lastApply ? { ...FOLDER_CREATE_FLOW_STATE.lastApply } : null,
        },
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  step('boot', 'studio-library-sidebar-sections-ready');
})();
