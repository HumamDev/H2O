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
  const ITEM_LIMIT_DEFAULT = 8;
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
  const LOCAL_REVIEW_EXPLANATION = 'These folders exist locally but are not in your native ChatGPT folder catalog. Read-only — no cleanup performed.';
  const LOCAL_REVIEW_BADGE_ORDER = Object.freeze(['extra', 'test', 'conflict', 'desktop-only', 'chrome-only', 'review-required']);
  const FOLDER_METADATA_OPERATION_SCHEMA = 'h2o.folder-metadata-operation.v1';
  const FOLDER_METADATA_COLOR_REASON = 'Chrome Studio canonical folder color change';
  const FOLDER_METADATA_COLOR_TIMEOUT_MS = 8000;
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

  function countLabelForItem(item = {}) {
    const display = String(item.displayCountLabel || '').trim();
    if (display) return display;
    return item.count != null ? formatNumber(item.count) : '';
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

  function staleGuardFromPreview(preview) {
    const src = preview?.before && typeof preview.before === 'object' ? preview.before : {};
    const out = {};
    ['folderHash', 'sourceHash', 'membershipHash', 'previewHash'].forEach((key) => {
      const value = String(src[key] || preview?.staleGuard?.[key] || '').trim();
      if (value) out[key] = value;
    });
    return out;
  }

  function refreshAfterNativeFolderColorApply() {
    let refreshed = false;
    try {
      const result = W.H2O?.Studio?.sync?.refreshNativeFolderState?.('folder-color-apply');
      if (result && typeof result.finally === 'function') {
        refreshed = true;
        result.finally(() => {
          try { renderAllSections(); } catch (e) { err('renderAfterFolderColorApply', e); }
        });
      }
    } catch (e) { err('refreshNativeFolderState.folderColorApply', e); }
    if (!refreshed) {
      W.setTimeout(() => {
        try { renderAllSections(); } catch (e) { err('renderAfterFolderColorApply.timeout', e); }
      }, 650);
    }
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
    D.querySelectorAll('.wbSidebarSectionItemMenu[aria-expanded="true"], .wbFolderMenuBtn[aria-expanded="true"]')
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
        style: 'min-height:16px;margin-top:6px;font-size:10.5px;line-height:1.35;color:rgba(255,255,255,.62)',
      })
      : null;
    const setStatus = (message, kind = '') => {
      if (!status) return;
      status.textContent = String(message || '');
      status.dataset.kind = String(kind || '');
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
        closeRowMenu();
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
      const deleteTitle = 'Delete requires a future preview and confirmation flow.';
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
          pop.appendChild(makeMenuColorPicker(item, color, {
            label: 'Change color',
            status: true,
            keepOpen: true,
            onSelect: (value, controls) => requestCanonicalFolderColor(item, value, controls),
          }));
        } else {
          pop.appendChild(makeMenuAction('Change color', SIDEBAR_MENU_ACTION_SVGS.palette, null, {
            disabled: true,
            title: studioPlatformAdapter() === 'mv3' ? 'Native owner bridge unavailable.' : disabledSyncTitle,
          }));
        }
      } else {
        pop.appendChild(makeMenuColorPicker(item, color));
      }
      pop.appendChild(makeMenuAction('Rename folder', SIDEBAR_MENU_ACTION_SVGS.rename, null, {
        disabled: true,
        title: disabledSyncTitle,
      }));
      pop.appendChild(makeMenuAction('Delete folder', SIDEBAR_MENU_ACTION_SVGS.delete, null, {
        danger: true,
        disabled: true,
        title: deleteTitle,
      }));
      pop.appendChild(el('div', { class: 'wbSidebarNativeSep', role: 'separator' }));
      pop.appendChild(makeMenuAction('Copy folder ID', SIDEBAR_MENU_ACTION_SVGS.copy, () => copyTextValue(item.id), {
        title: 'Copy folder ID',
      }));
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

    for (const item of visible) {
      const id = String(item.id || '').trim();
      const name = String(item.name || '').trim();
      if (!id || !name) continue;
      const href = routeSvc?.buildLibraryHash?.(routeKind, id) || `#/library/explorer`;
      const color = normalizeHexColor(item.color || '');
      const countLabel = countLabelForItem(item);
      const hasDetailedCount = !!String(item.displayCountLabel || '').trim();
      const badges = Array.isArray(item.badges) ? item.badges.map((badge) => String(badge || '').trim()).filter(Boolean) : [];
      const title = hasDetailedCount ? `${name} — ${countLabel}` : name;
      const menuButton = !opts.disableMenu && (kind === 'categories' || kind === 'folders')
        ? el('button', {
          class: 'wbSidebarSectionItemMenu',
          type: 'button',
          title: `More options for ${name}`,
          'aria-label': `More options for ${name}`,
          'aria-haspopup': 'menu',
          'aria-expanded': 'false',
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
        'data-section': kind,
        'data-id': id,
        'data-icon': item.iconKey || '',
        'data-color': color || '',
        'data-badges': badges.length ? badges.join(',') : null,
        'data-canonical-count': item.canonicalCount != null ? item.canonicalCount : null,
        'data-known-count': item.knownCount != null ? item.knownCount : null,
        'data-local-binding-count': item.localBindingCount != null ? item.localBindingCount : null,
        'data-color-source': item.isCanonical === true ? 'canonical' : (color ? 'local' : null),
        style: color ? `--wb-sidebar-item-color:${color};` : '',
      }, [
        makeItemIcon(item, kind),
        opts.review ? el('span', {
          class: 'wbSidebarSectionItemLabel',
          style: 'display:flex;flex-direction:column;gap:0;min-width:0;white-space:normal;line-height:1.25',
        }, [
          el('span', { style: 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name),
          localReviewBadgeNodes(item),
        ]) : el('span', { class: 'wbSidebarSectionItemLabel' }, name),
        countLabel ? el('span', {
          class: `wbSidebarSectionItemCount${hasDetailedCount ? ' wbSidebarSectionItemCount--folderParity' : ''}`,
          title: hasDetailedCount ? countLabel : null,
          style: hasDetailedCount ? 'height:auto;min-height:18px;max-width:116px;white-space:normal;text-align:right;line-height:1.15;padding:2px 6px;' : null,
        }, countLabel) : null,
        menuButton,
      ]);
      host.appendChild(link);
    }

    if (prepared.length > visible.length) {
      const moreCount = prepared.length - visible.length;
      const groupBy = kind === 'labels' ? 'label'
                    : kind === 'categories' ? 'category'
                    : kind === 'projects' ? 'project'
                    : kind === 'folders' ? 'folder'
                    : 'date';
      const moreHref = kind === 'folders' ? '#/library/folders' : '#/library/explorer';
      const more = el('a', {
        class: 'wbSidebarSectionMore',
        href: moreHref,
        'data-groupby': groupBy,
      }, `More · ${formatNumber(moreCount)}`);
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
    let model = null;
    try {
      model = await H2O.Library?.FolderParity?.getDisplayModel?.({ fresh: true });
    } catch (e) { err('folderParity.getDisplayModel', e); }

    const canonicalRows = Array.isArray(model?.canonicalRows) ? model.canonicalRows : [];
    const localReviewRows = Array.isArray(model?.localReviewRows) ? model.localReviewRows : [];
    const fallbackUsed = !!model?.fallbackUsed;

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

    const mainItems = canonicalRows.map(toSidebarItem).filter(Boolean);
    const reviewItems = localReviewRows.map(toSidebarItem).filter(Boolean);

    const mainEmptyText = fallbackUsed
      ? 'Folder catalog is loading from native ChatGPT.'
      : 'Canonical folder catalog unavailable. Open chatgpt.com to broadcast folders.';
    renderSectionList(host, 'folders', mainItems, { emptyText: mainEmptyText });

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
    step('renderCategories', String(items.length));
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
    W.addEventListener('storage', (ev) => {
      if (FOLDERS_UI_KEYS.includes(String(ev?.key || ''))) renderAllSections();
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
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  };

  step('boot', 'studio-library-sidebar-sections-ready');
})();
