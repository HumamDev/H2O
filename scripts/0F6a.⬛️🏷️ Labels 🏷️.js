// ==UserScript==
// @h2o-id             0f6a.labels
// @name               0F6a.⬛️🏷️ Labels 🏷️
// @namespace          H2O.Premium.CGX.labels
// @author             HumamDev
// @version            1.1.1
// @revision           004
// @build              260425-000004
// @description        Labels: standalone feature-owner module for chat-level manual labels, sidebar label browsing, label assignment UI, and safe archive metadata projection.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F6a — Labels (feature-owner module)
   *
   * OWNS:
   *   - chat-level manual labels
   *   - label type/catalog storage
   *   - chat ↔ label bindings
   *   - Labels sidebar section
   *   - Labels overview + single-label viewer/page
   *   - safe metadata projection into archive/workbench truth when archive write APIs exist
   *
   * MUST NOT OWN:
   *   - folders or folder bindings (0F3a)
   *   - native projects cache/fetch/reconcile (0F2a)
   *   - category catalog/grouping (0F4a)
   *   - turn-level tags/keywords/title-bar tag tray (0F5a)
   *   - system badge truth (source/state badges are separate metadata, not Labels)
   *   - shared LibraryCore services (0F1a)
   *
   * EXPOSES:
   *   - H2O.Labels
   *   - registers 'labels' owner + service in H2O.LibraryCore
   *   - registers 'labels' and 'label' route handlers for direct LibraryCore dispatch.
   *
   * DESIGN NOTES:
   *   - Labels are user-visible manual chat markers.
   *   - System Source Badges (Mobile/Browser/iPad) and System State Badges
   *     (Pinned/Archived/Saved/Imported) are intentionally not stored as Labels.
   *   - Sidebar insertion is standalone and additive. To avoid fighting 0F3a's strict
   *     Folders -> Categories -> Projects placement invariant, Labels stays on the stable
   *     fallback order before the Folders/Categories pair when that pair exists.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  /*
   * v1.0.2 boot hardening:
   * Do not exit forever when 0F1a Library Core has not registered yet.
   * Userscript/extension load order can race document-idle modules, so this wrapper
   * waits for H2O.LibraryCore and only then initializes the feature owner once.
   */
  const BOOT_LOCK = '__h2oLabelsBooted_v1_0_2';
  const BOOT_TIMER_SET = '__h2oLabelsBootTimers_v1_0_2';
  const BOOT_MAX_ATTEMPTS = 160;

  function bootWhenLibraryCoreReady(attempt = 0) {
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try {
          H2O.LabelsBootDiag = {
            ok: false,
            status: 'library-core-not-found',
            attempts: attempt,
            ts: Date.now(),
          };
        } catch {}
        return;
      }
      if (!H2O[BOOT_TIMER_SET]) H2O[BOOT_TIMER_SET] = new Set();
      const delay = Math.min(1200, 80 + attempt * 30);
      const timer = W.setTimeout(() => {
        try { H2O[BOOT_TIMER_SET]?.delete?.(timer); } catch {}
        bootWhenLibraryCoreReady(attempt + 1);
      }, delay);
      try { H2O[BOOT_TIMER_SET].add(timer); } catch {}
      return;
    }
    try {
      H2O.LabelsBootDiag = {
        ok: true,
        status: 'library-core-ready',
        attempts: attempt,
        ts: Date.now(),
      };
    } catch {}
    runLabelsModule(core);
  }

  function runLabelsModule(core) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;

  const MOD = (H2O.Labels = H2O.Labels || {});
  MOD.meta = MOD.meta || {
    owner: '0F6a.labels',
    label: 'Labels',
    phase: 'phase-1-labels-owner-sidebar',
  };

  const diag = (MOD.diag = MOD.diag || {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 180,
    errMax: 40,
  });

  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };

  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  const TOK = 'LB';
  const PID = 'labels';
  const SkID = 'lbsc';
  const MODTAG = 'Labels';
  const SUITE = 'prm';
  const HOST = 'cgx';
  const DsID = PID;

  const NS_DISK = `h2o:${SUITE}:${HOST}:${DsID}`;
  const KEY_LABEL_CATALOG_V1 = `${NS_DISK}:catalog:v1`;
  const KEY_LABEL_BINDINGS_V1 = `${NS_DISK}:bindings:v1`;
  const KEY_LABEL_UI_V1 = `${NS_DISK}:ui:v1`;
  const KEY_LABEL_CFG_V1 = `${NS_DISK}:cfg:v1`;

  const EV_LABELS_CHANGED = 'evt:h2o:labels:changed';
  const EV_LABELS_ASSIGNED = 'evt:h2o:labels:assigned';
  const EV_LABELS_UI_OPEN = 'evt:h2o:labels:ui-open';
  const EV_LABELS_UI_CLOSE = 'evt:h2o:labels:ui-close';

  const ATTR_CGXUI = 'data-cgxui';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const ATTR_CGXUI_MODE = 'data-cgxui-mode';
  const ATTR_CGXUI_PAGE_HIDDEN = 'data-cgxui-page-hidden-by';

  const UI_LABELS_ROOT = `${SkID}-root`;
  const UI_LABELS_PAGE_HOST = `${SkID}-page-host`;
  const UI_LABELS_PAGE = `${SkID}-page`;
  const UI_LABELS_VIEWER = `${SkID}-viewer`;
  const UI_LABELS_MODAL = `${SkID}-modal`;
  const UI_LABELS_POP = `${SkID}-pop`;
  const UI_LABELS_ROW = `${SkID}-row`;
  const UI_LABELS_MENU_ITEM = `${SkID}-menu-item`;
  const UI_LABELS_ICON_SLOT = `${SkID}-ico-slot`;
  const CSS_STYLE_ID = `cgxui-${SkID}-style`;

  const CFG_SEE_MORE_LIMIT = 4;
  const CFG_LABEL_CHAT_PREVIEW_LIMIT = 80;
  const CFG_FLOATING_Z = 2147483647;
  const CFG_H2O_PAGE_ROUTE_OWNER = `${SkID}:page-route:v1`;
  const CFG_H2O_PAGE_ROUTE_PREFIX = 'h2o';
  const CFG_H2O_PAGE_QUERY_FLAG = `h2o_${SkID}`;
  const CFG_H2O_PAGE_QUERY_VIEW = `h2o_${SkID}_view`;
  const CFG_H2O_PAGE_QUERY_ID = `h2o_${SkID}_id`;

  const FRAG_SVG_LABEL = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h6.1c.7 0 1.3.3 1.8.7l4.4 4.4a2.5 2.5 0 0 1 0 3.6l-7.6 7.6a2.5 2.5 0 0 1-3.6 0L4.2 15.4a2.5 2.5 0 0 1-.7-1.8V5.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="8.5" cy="7.5" r="1.25" fill="currentColor"/>
    </svg>
  `;
  const FRAG_SVG_ADD = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
  `;
  const FRAG_SVG_MORE = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h.01M12 12h.01M18 12h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
  `;
  const FRAG_SVG_SECTION_ARROW = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" data-rtl-flip="" class="invisible h-3 w-3 shrink-0 group-hover/sidebar-expando-section:visible"><use href="/cdn/assets/sprites-core-97566a9e.svg#ba3792" fill="currentColor"></use></svg>';

  const TYPE_DEFS = Object.freeze({
    workflowStatus: { key: 'workflowStatus', label: 'Workflow', fullLabel: 'Workflow Status', cardinality: 'single', order: 10 },
    priority: { key: 'priority', label: 'Priority', fullLabel: 'Priority', cardinality: 'single', order: 20 },
    followUp: { key: 'followUp', label: 'Follow-up', fullLabel: 'Follow-up / Action', cardinality: 'multi', order: 30 },
    contentType: { key: 'contentType', label: 'Content Type', fullLabel: 'Content Type', cardinality: 'multi', order: 40 },
    context: { key: 'context', label: 'Context', fullLabel: 'Context', cardinality: 'multi', order: 50 },
    custom: { key: 'custom', label: 'Custom', fullLabel: 'Custom Labels', cardinality: 'multi', order: 60 },
  });

  const TYPE_ALIASES = Object.freeze({
    workflow: 'workflowStatus',
    status: 'workflowStatus',
    workflowstatus: 'workflowStatus',
    workflow_status: 'workflowStatus',
    priority: 'priority',
    followup: 'followUp',
    follow_up: 'followUp',
    action: 'followUp',
    actions: 'followUp',
    content: 'contentType',
    contenttype: 'contentType',
    content_type: 'contentType',
    context: 'context',
    contexts: 'context',
    custom: 'custom',
    customlabel: 'custom',
    customlabels: 'custom',
  });

  const COLOR_POOL = Object.freeze(['#3B82F6', '#22C55E', '#A855F7', '#F472B6', '#FF914D', '#FFD54F', '#7DD3FC', '#14B8A6', '#F97316', '#8B5CF6', '#84CC16', '#EF4444']);

  const DEFAULT_CATALOG = Object.freeze({
    workflowStatus: [
      ['done', 'Done', '#22C55E'],
      ['draft', 'Draft', '#A855F7'],
      ['in-progress', 'In progress', '#3B82F6'],
      ['waiting', 'Waiting', '#FFD54F'],
      ['blocked', 'Blocked', '#EF4444'],
    ],
    priority: [
      ['important', 'Important', '#FF914D'],
      ['urgent', 'Urgent', '#EF4444'],
      ['low-priority', 'Low priority', '#7DD3FC'],
    ],
    followUp: [
      ['read-later', 'Read later', '#3B82F6'],
      ['revise', 'Revise', '#A855F7'],
      ['come-back', 'Come back', '#FFD54F'],
    ],
    contentType: [
      ['question', 'Question', '#7DD3FC'],
      ['answer', 'Answer', '#22C55E'],
      ['reference', 'Reference', '#14B8A6'],
      ['prompt', 'Prompt', '#A855F7'],
      ['idea', 'Idea', '#F472B6'],
    ],
    context: [
      ['personal', 'Personal', '#F472B6'],
      ['university', 'University', '#3B82F6'],
      ['work', 'Work', '#FF914D'],
      ['research', 'Research', '#14B8A6'],
    ],
    custom: [],
  });

  const SEL = {
    projectsLabelH2: 'h2.__menu-label',
    projectsSectionA: 'div.group\\/sidebar-expando-section',
    projectsSectionB: 'div[class*="sidebar-expando-section"]',
    sidebarItemAnchor: 'a.__menu-item[href]',
    sidebarItemDiv: 'div.__menu-item',
    sidebarTruncate: '.truncate,[class*="truncate"]',
    currentChatAnchor: 'a[aria-current="page"][href*="/c/"]',
    nav: 'nav',
    aside: 'aside',
    radixMenu: '[role="menu"]',
    radixMenuItem: '[role="menuitem"]',
    menuCaptureBtn:
      'button.__menu-item-trailing-btn,' +
      'button[data-testid*="history-item"][data-testid$="options"],' +
      'button[data-testid$="options"],' +
      'button[aria-label*="conversation options"],' +
      'button[aria-label*="Open conversation options"]',
  };

  const state = (MOD.state = MOD.state || {
    booted: false,
    catalogCache: null,
    bindingsCache: null,
    openModal: null,
    viewerEl: null,
    pageEl: null,
    pageHost: null,
    pageSession: null,
    pageHiddenRecords: [],
    pageSeq: 0,
    pageRoute: null,
    pageRouteToken: 0,
    lastChatHrefForMenu: '',
    sidebarMO: null,
    menuMO: null,
    observedRoot: null,
    ensureTimer: 0,
    building: false,
    suppressMO: false,
    sidebarRenderCount: 0,
    sidebarEnsureCount: 0,
    sidebarActiveSyncCount: 0,
    sidebarSkippedH2OMutations: 0,
    sidebarPlacementRepairCount: 0,
    sidebarActiveSyncTimer: 0,
    lastSidebarRenderReason: '',
    lastSidebarEnsureReason: '',
    lastSidebarActiveSyncReason: '',
    sidebarLastRenderReason: '',
    sidebarLastEnsureReason: '',
    sidebarLastActiveSyncReason: '',
    sidebarLastRenderAt: 0,
    sidebarLastEnsureAt: 0,
    sidebarLastActiveSyncAt: 0,
    firstLabelsShellAt: 0,
    sidebarHydrationCount: 0,
    sidebarHydrationLastReason: '',
    sidebarShellMode: '',
    clean: { timers: new Set(), listeners: new Set(), observers: new Set(), nodes: new Set() },
  });

  const storage = {
    getJSON(key, fallback = null) {
      try {
        const raw = W.localStorage?.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    setJSON(key, value) {
      try {
        W.localStorage?.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
    del(key) {
      try {
        W.localStorage?.removeItem(key);
        return true;
      } catch {
        return false;
      }
    },
  };

  function safeDispatch(name, detail = {}) {
    try { W.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
  }

  function normText(raw = '') {
    return String(raw || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeLabel(raw = '') {
    return normText(raw).replace(/^[-–—•\s]+|[-–—•\s]+$/g, '');
  }

  function slugify(raw = '') {
    return normalizeLabel(raw)
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function escapeHtml(raw = '') {
    return String(raw || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function cssEscape(raw = '') {
    const value = String(raw || '');
    try { return CSS.escape(value); } catch { return value.replace(/[^a-z0-9_-]/gi, '\\$&'); }
  }

  function normalizeHexColor(raw = '') {
    const value = String(raw || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(value) ? value : '';
  }

  function colorFor(raw = '') {
    const id = String(raw || '');
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return COLOR_POOL[Math.abs(hash) % COLOR_POOL.length] || COLOR_POOL[0];
  }

  function normalizeType(raw = '') {
    const direct = String(raw || '').trim();
    if (TYPE_DEFS[direct]) return direct;
    const key = direct.toLowerCase().replace(/[\s-]+/g, '_');
    return TYPE_ALIASES[key] || TYPE_ALIASES[key.replace(/_/g, '')] || '';
  }

  function listTypeDefs() {
    return Object.values(TYPE_DEFS).sort((a, b) => a.order - b.order);
  }

  function normalizeLabelRecord(typeRaw, raw, index = 0, opts = {}) {
    const type = normalizeType(typeRaw);
    if (!type) return null;
    const src = raw && typeof raw === 'object' ? raw : {};
    const label = normalizeLabel(typeof raw === 'string' ? raw : (src.label || src.name || ''));
    const id = slugify(src.id || label);
    if (!id || !label) return null;
    const now = Date.now();
    const builtIn = opts.builtIn === true || src.builtIn === true;
    return {
      id,
      label,
      type,
      color: normalizeHexColor(src.color) || colorFor(`${type}:${id}`),
      icon: String(src.icon || 'label').trim() || 'label',
      sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : index,
      builtIn,
      createdAt: Number.isFinite(Number(src.createdAt)) ? Number(src.createdAt) : now,
      updatedAt: Number.isFinite(Number(src.updatedAt)) ? Number(src.updatedAt) : now,
    };
  }

  function defaultCatalog() {
    const out = {};
    listTypeDefs().forEach((typeDef) => {
      const rows = DEFAULT_CATALOG[typeDef.key] || [];
      out[typeDef.key] = rows.map(([id, label, color], index) => normalizeLabelRecord(typeDef.key, {
        id,
        label,
        color,
        sortOrder: index,
        builtIn: true,
      }, index, { builtIn: true })).filter(Boolean);
    });
    return out;
  }

  function normalizeCatalog(raw) {
    const base = defaultCatalog();
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    listTypeDefs().forEach((typeDef) => {
      const map = new Map();
      (base[typeDef.key] || []).forEach((row) => map.set(row.id, row));
      const rows = Array.isArray(src[typeDef.key]) ? src[typeDef.key] : [];
      rows.forEach((row, index) => {
        const next = normalizeLabelRecord(typeDef.key, row, index + 100);
        if (!next) return;
        const prev = map.get(next.id);
        map.set(next.id, prev ? { ...prev, ...next, builtIn: prev.builtIn || next.builtIn } : next);
      });
      out[typeDef.key] = Array.from(map.values()).sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
    });
    return out;
  }

  function readCatalog() {
    if (state.catalogCache) return state.catalogCache;
    const raw = storage.getJSON(KEY_LABEL_CATALOG_V1, null);
    const normalized = normalizeCatalog(raw);
    state.catalogCache = normalized;
    if (!raw || typeof raw !== 'object') storage.setJSON(KEY_LABEL_CATALOG_V1, normalized);
    return normalized;
  }

  function writeCatalog(catalog) {
    const normalized = normalizeCatalog(catalog);
    state.catalogCache = normalized;
    storage.setJSON(KEY_LABEL_CATALOG_V1, normalized);
    return normalized;
  }

  function normalizeBindingRow(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    listTypeDefs().forEach((typeDef) => {
      if (typeDef.cardinality === 'single') {
        out[typeDef.key] = slugify(src[typeDef.key] || '');
      } else {
        const arr = Array.isArray(src[typeDef.key]) ? src[typeDef.key] : (src[typeDef.key] ? [src[typeDef.key]] : []);
        out[typeDef.key] = [...new Set(arr.map((v) => slugify(v)).filter(Boolean))];
      }
    });
    return out;
  }

  function normalizeBindings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = Object.create(null);
    Object.keys(src).forEach((chatIdRaw) => {
      const chatId = normalizeChatId(chatIdRaw);
      if (!chatId) return;
      out[chatId] = normalizeBindingRow(src[chatIdRaw]);
    });
    return out;
  }

  function readBindings() {
    if (state.bindingsCache) return state.bindingsCache;
    const raw = storage.getJSON(KEY_LABEL_BINDINGS_V1, null);
    const normalized = normalizeBindings(raw);
    state.bindingsCache = normalized;
    if (!raw || typeof raw !== 'object') storage.setJSON(KEY_LABEL_BINDINGS_V1, normalized);
    return normalized;
  }

  function writeBindings(bindings) {
    const normalized = normalizeBindings(bindings);
    state.bindingsCache = normalized;
    storage.setJSON(KEY_LABEL_BINDINGS_V1, normalized);
    return normalized;
  }

  function readUi() {
    const raw = storage.getJSON(KEY_LABEL_UI_V1, null);
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      expanded: src.expanded !== false,
      openTypes: normalizeOpenStateMap(src.openTypes),
      visibleTypes: normalizeVisibleTypeMap(src.visibleTypes),
      openLabels: normalizeOpenStateMap(src.openLabels),
      showCounts: src.showCounts !== false,
      openMode: normalizeOpenMode(src.openMode),
      inlinePreview: src.inlinePreview === true,
      typeExpandMode: normalizeTypeExpandMode(src.typeExpandMode),
    };
  }

  function writeUi(ui) {
    const current = readUi();
    const next = { ...current, ...(ui && typeof ui === 'object' ? ui : {}) };
    next.openTypes = normalizeOpenStateMap(next.openTypes);
    next.visibleTypes = normalizeVisibleTypeMap(next.visibleTypes);
    next.openLabels = normalizeOpenStateMap(next.openLabels);
    next.showCounts = next.showCounts !== false;
    next.openMode = normalizeOpenMode(next.openMode);
    next.inlinePreview = next.inlinePreview === true;
    next.typeExpandMode = normalizeTypeExpandMode(next.typeExpandMode);
    storage.setJSON(KEY_LABEL_UI_V1, next);
    return next;
  }

  function normalizeOpenStateMap(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    Object.keys(src).forEach((key) => {
      const id = String(key || '').trim();
      if (!id) return;
      out[id] = src[key] === true;
    });
    return out;
  }

  function normalizeVisibleTypeMap(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    listTypeDefs().forEach((typeDef) => {
      out[typeDef.key] = src[typeDef.key] !== false;
    });
    return out;
  }

  function normalizeOpenMode(raw) {
    return String(raw || '').trim().toLowerCase() === 'panel' ? 'panel' : 'page';
  }

  function normalizeTypeExpandMode(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'all-open') return 'all-open';
    if (value === 'all-closed') return 'all-closed';
    return 'remember';
  }

  function readCfg() {
    const raw = storage.getJSON(KEY_LABEL_CFG_V1, null);
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      visibleLabelsPerType: clampInt(src.visibleLabelsPerType, 2, 12, CFG_SEE_MORE_LIMIT),
      autoProjectMetadata: src.autoProjectMetadata !== false,
    };
  }

  function clampInt(v, min, max, fallback) {
    const n = Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function normalizeChatId(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return '';
    const match = value.match(/\/c\/([a-z0-9-]+)/i);
    if (match) return match[1];
    return value.replace(/^chat:/, '').trim();
  }

  function parseChatIdFromHref(href = '') {
    const match = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : '';
  }

  function toChatId(raw = '') {
    const direct = normalizeChatId(raw);
    if (direct) return direct;
    try {
      const fromArchive = H2O.archiveBoot?.getCurrentChatId?.();
      if (fromArchive) return normalizeChatId(fromArchive);
    } catch {}
    try {
      const fromUtil = H2O.util?.getChatId?.();
      if (fromUtil) return normalizeChatId(fromUtil);
    } catch {}
    try {
      const currentHref = D.querySelector(SEL.currentChatAnchor)?.getAttribute('href') || '';
      const fromHref = parseChatIdFromHref(currentHref);
      if (fromHref) return fromHref;
    } catch {}
    try {
      return parseChatIdFromHref(W.location.pathname || '');
    } catch {
      return '';
    }
  }

  function hrefForChatId(chatIdRaw = '') {
    const chatId = normalizeChatId(chatIdRaw);
    if (!chatId) return '';
    if (/^imported[-_:]/i.test(chatId)) return '';
    return `/c/${encodeURIComponent(chatId)}`;
  }

  function findChatTitleInSidebar(chatIdRaw = '') {
    const chatId = normalizeChatId(chatIdRaw);
    if (!chatId) return '';
    try {
      const anchors = D.querySelectorAll(SEL.sidebarItemAnchor);
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (parseChatIdFromHref(href) === chatId) return normText(a.innerText || '').slice(0, 140);
      }
    } catch {}
    return '';
  }

  function getArchiveBoot() {
    return H2O.archiveBoot || null;
  }

  function safeListWorkbenchRows() {
    try {
      const rows = getArchiveBoot()?.listWorkbenchRows?.();
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      err('list-workbench-rows', e);
      return [];
    }
  }

  function rowChatId(row) {
    return normalizeChatId(row?.chatId || row?.id || parseChatIdFromHref(row?.href || row?.url || ''));
  }

  function nativeHrefForRow(row) {
    const chatId = rowChatId(row);
    if (!chatId) return '';
    const sidebarHref = findHrefInSidebarByChatId(chatId);
    if (sidebarHref) return sidebarHref;
    return String(row?.href || row?.url || hrefForChatId(chatId) || '').trim();
  }

  function findHrefInSidebarByChatId(chatIdRaw = '') {
    const chatId = normalizeChatId(chatIdRaw);
    if (!chatId) return '';
    try {
      for (const a of D.querySelectorAll(SEL.sidebarItemAnchor)) {
        const href = a.getAttribute('href') || '';
        if (parseChatIdFromHref(href) === chatId) return href;
      }
    } catch {}
    return '';
  }

  function listKnownChats() {
    const rows = safeListWorkbenchRows();
    const byId = new Map();
    rows.forEach((row) => {
      const chatId = rowChatId(row);
      if (!chatId) return;
      byId.set(chatId, {
        chatId,
        href: nativeHrefForRow(row),
        title: normText(row?.title || row?.name || row?.excerpt || findChatTitleInSidebar(chatId) || chatId).slice(0, 160),
        updatedAt: String(row?.updatedAt || row?.createdAt || ''),
        source: 'archive',
      });
    });

    Object.keys(readBindings()).forEach((chatId) => {
      if (byId.has(chatId)) return;
      byId.set(chatId, {
        chatId,
        href: findHrefInSidebarByChatId(chatId) || hrefForChatId(chatId),
        title: findChatTitleInSidebar(chatId) || chatId,
        updatedAt: '',
        source: 'labels-binding',
      });
    });

    return Array.from(byId.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || a.title.localeCompare(b.title));
  }

  function getLabel(typeRaw, labelIdRaw) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    if (!type || !id) return null;
    return (readCatalog()[type] || []).find((row) => row.id === id) || null;
  }

  function listCatalog(typeRaw = '') {
    const catalog = readCatalog();
    const type = normalizeType(typeRaw);
    if (type) return (catalog[type] || []).slice();
    return listTypeDefs().reduce((acc, typeDef) => {
      acc[typeDef.key] = (catalog[typeDef.key] || []).slice();
      return acc;
    }, {});
  }

  function createLabel(typeRaw, labelRaw, opts = {}) {
    const type = normalizeType(typeRaw) || 'custom';
    const label = normalizeLabel(labelRaw);
    if (!type || !label) return null;
    const catalog = readCatalog();
    const rows = Array.isArray(catalog[type]) ? catalog[type].slice() : [];
    const id = slugify(opts.id || label);
    const existing = rows.find((row) => row.id === id || row.label.toLowerCase() === label.toLowerCase());
    if (existing) return existing;
    const record = normalizeLabelRecord(type, {
      id,
      label,
      color: opts.color || colorFor(`${type}:${id}`),
      icon: opts.icon || 'label',
      sortOrder: Number.isFinite(Number(opts.sortOrder)) ? Number(opts.sortOrder) : rows.length + 100,
      builtIn: opts.builtIn === true,
    });
    if (!record) return null;
    catalog[type] = [...rows, record];
    writeCatalog(catalog);
    rerenderLabelsSection('create-label');
    safeDispatch(EV_LABELS_CHANGED, { type, label: record, action: 'create-label', ts: Date.now() });
    return record;
  }

  function renameLabel(typeRaw, labelIdRaw, nextLabelRaw) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    const nextLabel = normalizeLabel(nextLabelRaw);
    if (!type || !id || !nextLabel) return null;
    const catalog = readCatalog();
    const rows = (catalog[type] || []).slice();
    const idx = rows.findIndex((row) => row.id === id);
    if (idx < 0) return null;
    const nextId = rows[idx].builtIn ? id : slugify(nextLabel);
    rows[idx] = { ...rows[idx], id: nextId, label: nextLabel, updatedAt: Date.now() };
    catalog[type] = rows;
    writeCatalog(catalog);
    if (nextId !== id) replaceLabelIdInBindings(type, id, nextId);
    rerenderLabelsSection('rename-label');
    safeDispatch(EV_LABELS_CHANGED, { type, label: rows[idx], previousId: id, action: 'rename-label', ts: Date.now() });
    return rows[idx];
  }

  function deleteLabel(typeRaw, labelIdRaw, opts = {}) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    if (!type || !id) return false;
    const catalog = readCatalog();
    const row = (catalog[type] || []).find((item) => item.id === id);
    if (row?.builtIn && opts.force !== true) return false;
    catalog[type] = (catalog[type] || []).filter((item) => item.id !== id);
    writeCatalog(catalog);
    const bindings = readBindings();
    Object.keys(bindings).forEach((chatId) => {
      const rec = bindings[chatId];
      if (TYPE_DEFS[type].cardinality === 'single') {
        if (rec[type] === id) rec[type] = '';
      } else {
        rec[type] = (Array.isArray(rec[type]) ? rec[type] : []).filter((v) => v !== id);
      }
    });
    writeBindings(bindings);
    rerenderLabelsSection('delete-label');
    safeDispatch(EV_LABELS_CHANGED, { type, labelId: id, action: 'delete-label', ts: Date.now() });
    return true;
  }

  function replaceLabelIdInBindings(type, oldId, newId) {
    const bindings = readBindings();
    Object.keys(bindings).forEach((chatId) => {
      const rec = bindings[chatId];
      if (TYPE_DEFS[type].cardinality === 'single') {
        if (rec[type] === oldId) rec[type] = newId;
      } else {
        rec[type] = [...new Set((Array.isArray(rec[type]) ? rec[type] : []).map((id) => id === oldId ? newId : id))];
      }
    });
    writeBindings(bindings);
  }

  function getChatLabels(chatIdRaw = '') {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return normalizeBindingRow(null);
    return normalizeBindingRow(readBindings()[chatId]);
  }

  function ensureChatBinding(chatIdRaw = '') {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { chatId: '', bindings: readBindings(), row: null };
    const bindings = readBindings();
    bindings[chatId] = normalizeBindingRow(bindings[chatId]);
    return { chatId, bindings, row: bindings[chatId] };
  }

  function setChatLabel(chatIdRaw, typeRaw, labelIdRaw) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    if (!type) return { ok: false, status: 'invalid-type' };
    if (id && !getLabel(type, id)) return { ok: false, status: 'label-not-found', type, labelId: id };
    const target = ensureChatBinding(chatIdRaw);
    if (!target.chatId || !target.row) return { ok: false, status: 'missing-chat-id' };
    if (TYPE_DEFS[type].cardinality === 'single') target.row[type] = id;
    else target.row[type] = id ? [id] : [];
    target.bindings[target.chatId] = normalizeBindingRow(target.row);
    writeBindings(target.bindings);
    afterLabelMutation(target.chatId, { action: 'set', type, labelId: id });
    return { ok: true, status: 'ok', chatId: target.chatId, labels: getChatLabels(target.chatId) };
  }

  function addChatLabel(chatIdRaw, typeRaw, labelIdRaw) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    if (!type || !id) return { ok: false, status: 'invalid-label' };
    if (!getLabel(type, id)) return { ok: false, status: 'label-not-found', type, labelId: id };
    const target = ensureChatBinding(chatIdRaw);
    if (!target.chatId || !target.row) return { ok: false, status: 'missing-chat-id' };
    if (TYPE_DEFS[type].cardinality === 'single') target.row[type] = id;
    else target.row[type] = [...new Set([...(Array.isArray(target.row[type]) ? target.row[type] : []), id])];
    target.bindings[target.chatId] = normalizeBindingRow(target.row);
    writeBindings(target.bindings);
    afterLabelMutation(target.chatId, { action: 'add', type, labelId: id });
    return { ok: true, status: 'ok', chatId: target.chatId, labels: getChatLabels(target.chatId) };
  }

  function removeChatLabel(chatIdRaw, typeRaw, labelIdRaw) {
    const type = normalizeType(typeRaw);
    const id = slugify(labelIdRaw);
    if (!type || !id) return { ok: false, status: 'invalid-label' };
    const target = ensureChatBinding(chatIdRaw);
    if (!target.chatId || !target.row) return { ok: false, status: 'missing-chat-id' };
    if (TYPE_DEFS[type].cardinality === 'single') {
      if (target.row[type] === id) target.row[type] = '';
    } else {
      target.row[type] = (Array.isArray(target.row[type]) ? target.row[type] : []).filter((v) => v !== id);
    }
    target.bindings[target.chatId] = normalizeBindingRow(target.row);
    writeBindings(target.bindings);
    afterLabelMutation(target.chatId, { action: 'remove', type, labelId: id });
    return { ok: true, status: 'ok', chatId: target.chatId, labels: getChatLabels(target.chatId) };
  }

  function clearChatLabels(chatIdRaw, typeRaw = '') {
    const target = ensureChatBinding(chatIdRaw);
    if (!target.chatId || !target.row) return { ok: false, status: 'missing-chat-id' };
    const type = normalizeType(typeRaw);
    if (type) {
      target.row[type] = TYPE_DEFS[type].cardinality === 'single' ? '' : [];
    } else {
      target.row = normalizeBindingRow(null);
    }
    target.bindings[target.chatId] = normalizeBindingRow(target.row);
    writeBindings(target.bindings);
    afterLabelMutation(target.chatId, { action: 'clear', type: type || 'all' });
    return { ok: true, status: 'ok', chatId: target.chatId, labels: getChatLabels(target.chatId) };
  }

  function afterLabelMutation(chatId, detail = {}) {
    rerenderLabelsSection('label-mutation');
    safeDispatch(EV_LABELS_ASSIGNED, { chatId, ...detail, labels: getChatLabels(chatId), ts: Date.now() });
    safeDispatch(EV_LABELS_CHANGED, { chatId, ...detail, source: 'mutation', ts: Date.now() });
    if (readCfg().autoProjectMetadata !== false) {
      Promise.resolve().then(() => projectChatMetadata(chatId, detail)).catch((e) => err('project-after-mutation', e));
    }
  }

  function flattenChatLabels(chatIdRaw = '') {
    const chatId = toChatId(chatIdRaw);
    const row = getChatLabels(chatId);
    const catalog = readCatalog();
    const out = [];
    listTypeDefs().forEach((typeDef) => {
      const value = row[typeDef.key];
      const ids = typeDef.cardinality === 'single' ? (value ? [value] : []) : (Array.isArray(value) ? value : []);
      ids.forEach((id) => {
        const label = (catalog[typeDef.key] || []).find((item) => item.id === id);
        if (!label) return;
        out.push({
          type: typeDef.key,
          typeLabel: typeDef.fullLabel,
          id: label.id,
          label: label.label,
          color: label.color,
        });
      });
    });
    return out;
  }

  function getLabelCounts() {
    const counts = {};
    listTypeDefs().forEach((typeDef) => { counts[typeDef.key] = Object.create(null); });
    const bindings = readBindings();
    Object.values(bindings).forEach((rowRaw) => {
      const row = normalizeBindingRow(rowRaw);
      listTypeDefs().forEach((typeDef) => {
        const ids = typeDef.cardinality === 'single'
          ? (row[typeDef.key] ? [row[typeDef.key]] : [])
          : (Array.isArray(row[typeDef.key]) ? row[typeDef.key] : []);
        ids.forEach((id) => { counts[typeDef.key][id] = (counts[typeDef.key][id] || 0) + 1; });
      });
    });
    return counts;
  }

  function listChatsByLabel(typeRaw, labelIdRaw) {
    const type = normalizeType(typeRaw);
    const labelId = slugify(labelIdRaw);
    if (!type || !labelId) return [];
    const typeDef = TYPE_DEFS[type];
    const bindings = readBindings();
    const chats = listKnownChats();
    const chatMeta = new Map(chats.map((row) => [row.chatId, row]));
    const out = [];
    Object.keys(bindings).forEach((chatId) => {
      const row = normalizeBindingRow(bindings[chatId]);
      const has = typeDef.cardinality === 'single'
        ? row[type] === labelId
        : (Array.isArray(row[type]) ? row[type] : []).includes(labelId);
      if (!has) return;
      const meta = chatMeta.get(chatId) || { chatId, href: hrefForChatId(chatId), title: chatId, updatedAt: '', source: 'labels-binding' };
      out.push(meta);
    });
    return out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.title || '').localeCompare(String(b.title || '')));
  }

  function buildLabelSummary(chatIdRaw = '') {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return null;
    const flat = flattenChatLabels(chatId);
    const byType = {};
    listTypeDefs().forEach((typeDef) => {
      byType[typeDef.key] = flat.filter((item) => item.type === typeDef.key).map((item) => ({ id: item.id, label: item.label, color: item.color }));
    });
    return {
      chatId,
      updatedAt: Date.now(),
      labels: flat,
      labelCatalog: flat.map((item) => ({ type: item.type, id: item.id, label: item.label, color: item.color })),
      labelSummary: byType,
    };
  }

  function buildArchiveLabelAssignments(chatIdRaw = '') {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return null;
    const row = getChatLabels(chatId);
    const contentTypeIds = Array.isArray(row.contentType) ? row.contentType : [];
    const customIds = Array.isArray(row.custom) ? row.custom : [];
    return {
      workflowStatusLabelId: String(row.workflowStatus || '').trim(),
      priorityLabelId: String(row.priority || '').trim(),
      actionLabelIds: [...new Set(Array.isArray(row.followUp) ? row.followUp : [])],
      contextLabelIds: [...new Set(Array.isArray(row.context) ? row.context : [])],
      customLabelIds: [...new Set([
        ...customIds,
        ...contentTypeIds.map((id) => `contentType:${slugify(id)}`).filter((id) => id !== 'contentType:'),
      ])],
    };
  }

  async function projectChatMetadata(chatIdRaw, opts = {}) {
    const chatId = toChatId(chatIdRaw);
    if (!chatId) return { ok: false, status: 'missing-chat-id' };
    const labels = buildArchiveLabelAssignments(chatId);
    if (!labels) return { ok: false, status: 'missing-labels' };
    const patch = {
      labels,
    };
    const archive = getArchiveBoot();
    const upsert = archive?.upsertLatestSnapshotMeta || archive?._rendererHost?.upsertLatestSnapshotMeta || null;
    if (typeof upsert !== 'function') return { ok: false, status: 'archive-meta-write-api-missing', chatId, patch };
    try {
      const res = await upsert(chatId, patch, { source: 'labels', reason: opts.reason || opts.action || '' });
      return { ok: true, status: 'ok', chatId, patch, res };
    } catch (e) {
      err('projectChatMetadata', e);
      return { ok: false, status: 'archive-meta-write-failed', chatId, patch, error: String(e?.message || e || '') };
    }
  }

  function getNativeSidebarService() {
    return core.getService?.('native-sidebar') || null;
  }

  function mutationHasOnlyH2OOwnedNodes(muts) {
    try {
      return !!getNativeSidebarService()?.mutationHasOnlyH2OOwnedNodes?.(muts);
    } catch {
      return false;
    }
  }

  function getUiShellService() {
    return core.getService?.('ui-shell') || null;
  }

  function getPageHostService() {
    return core.getService?.('page-host') || null;
  }

  function labelsEnv() {
    return {
      W,
      D,
      H2O,
      STATE: state,
      CLEAN: state.clean,
      SAFE_remove: safeRemove,
      ATTR_CGXUI,
      ATTR_CGXUI_OWNER,
      ATTR_CGXUI_STATE,
      ATTR_CGXUI_MODE,
      ATTR_CGXUI_PAGE_HIDDEN,
      UI_FSECTION_VIEWER: UI_LABELS_VIEWER,
      UI_FSECTION_PAGE_HOST: UI_LABELS_PAGE_HOST,
      UI_FSECTION_PAGE: UI_LABELS_PAGE,
      CFG_H2O_PAGE_ROUTE_OWNER,
      CFG_H2O_PAGE_ROUTE_PREFIX,
      CFG_H2O_PAGE_QUERY_FLAG,
      CFG_H2O_PAGE_QUERY_VIEW,
      CFG_H2O_PAGE_QUERY_ID,
      SkID,
      STORE_normalizeCategoryOpenMode: () => 'panel',
      STORE_normalizeHexColor: normalizeHexColor,
      FRAG_SVG_CATEGORY: FRAG_SVG_LABEL,
      FRAG_SVG_FOLDER: FRAG_SVG_LABEL,
      DOM_resolveRightPanePageHost,
    };
  }

  function safeRemove(node) {
    try { node?.remove?.(); } catch {}
  }

  function DOM_classText(el) {
    return String(el?.className || '');
  }

  function DOM_isScrollPageHost(el) {
    if (!(el instanceof HTMLElement)) return false;
    const cls = DOM_classText(el);
    return cls.includes('group/scroll-root') || (cls.includes('overflow-y-auto') && cls.includes('flex-col') && cls.includes('min-h-0'));
  }

  function DOM_resolveRightPanePageHost() {
    const main = D.querySelector('main');
    if (main instanceof HTMLElement) {
      const candidates = [main, ...main.querySelectorAll('div')];
      const scrollRoot = candidates.find((el) => DOM_isScrollPageHost(el));
      if (scrollRoot instanceof HTMLElement) return scrollRoot;
      return main;
    }
    const thread = D.getElementById('thread');
    return thread instanceof HTMLElement ? thread : null;
  }

  function utilSelScoped(uiTok) {
    return `[${ATTR_CGXUI}="${uiTok}"][${ATTR_CGXUI_OWNER}="${SkID}"]`;
  }

  function findProjectsH2() {
    const svc = getNativeSidebarService();
    const env = {
      D,
      normalizeText: normText,
      projectsLabelSelector: SEL.projectsLabelH2,
      projectsSectionSelectors: [SEL.projectsSectionA, SEL.projectsSectionB],
      sidebarItemSelector: '.__menu-item',
      moreLabel: 'More',
    };
    const viaSvc = svc?.findProjectsH2?.(env);
    if (viaSvc) return viaSvc;
    return [...D.querySelectorAll(SEL.projectsLabelH2)].find((el) => /projects/i.test(normText(el.textContent || ''))) || null;
  }

  function findProjectsSection(h2) {
    if (!h2) return null;
    const svc = getNativeSidebarService();
    const env = {
      D,
      normalizeText: normText,
      projectsLabelSelector: SEL.projectsLabelH2,
      projectsSectionSelectors: [SEL.projectsSectionA, SEL.projectsSectionB],
      sidebarItemSelector: '.__menu-item',
      moreLabel: 'More',
    };
    const viaSvc = svc?.findProjectsSection?.(env, h2);
    if (viaSvc) return viaSvc;
    const btn = h2.closest('button');
    return btn?.closest?.(SEL.projectsSectionA) || btn?.closest?.(SEL.projectsSectionB) || null;
  }

  function pickSidebarRoot(fromEl) {
    return fromEl?.closest?.(SEL.nav) || fromEl?.closest?.(SEL.aside) || fromEl?.parentElement || D.body;
  }

  function findLabelsRoot() {
    try {
      const node = D.querySelector(utilSelScoped(UI_LABELS_ROOT));
      return node instanceof HTMLElement ? node : null;
    } catch {
      return null;
    }
  }

  function recordLabelsShellSeen(root, reason = 'shell') {
    if (!(root instanceof HTMLElement)) return;
    if (!state.firstLabelsShellAt) state.firstLabelsShellAt = Date.now();
    state.sidebarShellMode = root.getAttribute('data-h2o-sidebar-shell') === 'prepaint' ? 'prepaint' : (state.sidebarShellMode || 'hydrated');
    root.setAttribute('data-h2o-sidebar-shell-last-seen-by', SkID);
    root.setAttribute('data-h2o-sidebar-shell-last-reason', String(reason || 'shell').slice(0, 80));
  }

  function recordLabelsHydrated(root, reason = 'hydrate') {
    if (!(root instanceof HTMLElement)) return;
    recordLabelsShellSeen(root, reason);
    root.setAttribute('data-h2o-sidebar-shell', 'hydrated');
    root.setAttribute(ATTR_CGXUI_MODE, 'hydrated');
    state.sidebarHydrationCount = Number(state.sidebarHydrationCount || 0) + 1;
    state.sidebarHydrationLastReason = String(reason || 'hydrate');
    state.sidebarShellMode = 'hydrated';
  }

  function makeRowShell(tplDiv, tplA, fallbackClass, tagName = 'div') {
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
      row.querySelectorAll?.('[aria-current]')?.forEach((el) => el.removeAttribute('aria-current'));
      row.querySelectorAll?.('[data-cgxui], [data-cgxui-owner], [data-cgxui-state]')?.forEach((el) => {
        el.removeAttribute(ATTR_CGXUI);
        el.removeAttribute(ATTR_CGXUI_OWNER);
        el.removeAttribute(ATTR_CGXUI_STATE);
      });
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

  function setRowText(row, text) {
    const value = String(text || '');
    const trunc = row.querySelector?.(SEL.sidebarTruncate);
    if (trunc) {
      trunc.textContent = value;
      return;
    }
    row.textContent = value;
  }

  function injectIcon(row, color = '') {
    return setPrimaryIcon(row, FRAG_SVG_LABEL, { color });
  }

  function findExistingPrimaryIconSlot(row) {
    const owned = row.querySelector?.(utilSelScoped(UI_LABELS_ICON_SLOT));
    if (owned) return owned;

    const trunc = row.querySelector?.(SEL.sidebarTruncate);
    const textParent = trunc?.parentElement || null;
    if (textParent) {
      const beforeText = [...textParent.children].filter((el) => el !== trunc && !el.contains?.(trunc));
      const nativeIcon = beforeText.find((el) =>
        /\bicon\b/.test(String(el.className || '')) ||
        (el.children.length <= 2 && !!el.querySelector?.(':scope > svg'))
      );
      if (nativeIcon) return nativeIcon;
    }

    const candidates = [...row.querySelectorAll?.('div,span') || []].filter((el) =>
      el !== trunc &&
      !el.contains?.(trunc) &&
      (/\bicon\b/.test(String(el.className || '')) || (el.children.length <= 2 && !!el.querySelector?.(':scope > svg')))
    );
    return candidates[0] || null;
  }

  function removeSurfaceChatLeadingIcon(row) {
    const slot = findExistingPrimaryIconSlot(row);
    if (slot) safeRemove(slot);
  }

  function cleanSurfaceChatTitle(raw) {
    let text = normText(raw || '');
    for (const icon of ['📎', '📌', '📝', '✎', '✏️', '✏']) {
      if (text.startsWith(icon)) text = normText(text.slice(icon.length));
    }
    return text;
  }

  function findPrimaryIconSlot(row) {
    const owned = row.querySelector?.(utilSelScoped(UI_LABELS_ICON_SLOT));
    if (owned) return owned;

    const trunc = row.querySelector?.(SEL.sidebarTruncate);
    const textParent = trunc?.parentElement || null;
    if (textParent) {
      const beforeText = [...textParent.children].filter((el) => el !== trunc && !el.contains?.(trunc));
      const nativeIcon = beforeText.find((el) =>
        /\bicon\b/.test(String(el.className || '')) ||
        (el.children.length <= 2 && !!el.querySelector?.(':scope > svg'))
      );
      if (nativeIcon) return nativeIcon;
    }

    const candidates = [...row.querySelectorAll?.('div,span') || []].filter((el) =>
      el !== trunc &&
      !el.contains?.(trunc) &&
      (/\bicon\b/.test(String(el.className || '')) || (el.children.length <= 2 && !!el.querySelector?.(':scope > svg')))
    );
    if (candidates[0]) return candidates[0];

    const slot = D.createElement('span');
    if (trunc && trunc.parentElement) trunc.parentElement.insertBefore(slot, trunc);
    else row.insertBefore(slot, row.firstChild);
    return slot;
  }

  function setPrimaryIcon(row, svg, opts = {}) {
    if (!svg) return null;
    const slot = findPrimaryIconSlot(row);
    if (!slot) return null;
    slot.setAttribute(ATTR_CGXUI, UI_LABELS_ICON_SLOT);
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
    icon.style.color = normalizeHexColor(opts.color) || 'currentColor';
    icon.innerHTML = svg;
    control.appendChild(icon);

    slot.innerHTML = '';
    slot.appendChild(control);
    return slot;
  }

  function makeIconToggle(row, label, onClick, expanded = null, color = '') {
    const slot = setPrimaryIcon(row, FRAG_SVG_LABEL, { onClick, expanded, label, color });
    if (!slot) return null;
    slot.setAttribute(ATTR_CGXUI_STATE, 'label-toggle');
    return slot;
  }

  function wireAsButton(row, onClick) {
    row.setAttribute('role', row.tagName === 'A' ? 'link' : 'button');
    row.setAttribute('tabindex', '0');
    row.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick?.(e);
    };
    row.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      onClick?.(e);
    };
    return row;
  }

  function syncHeaderArrow(headerBtn, expanded) {
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

  function makeLabelCountSpan(count) {
    const span = D.createElement('span');
    span.setAttribute(ATTR_CGXUI_STATE, 'count');
    span.textContent = `(${Number(count || 0)})`;
    return span;
  }

  function previewKeyFor(typeKey, labelId) {
    return `${normalizeType(typeKey)}:${slugify(labelId)}`;
  }

  function getTypeExpanded(typeKey, ui = readUi()) {
    return ui.openTypes[String(typeKey || '').trim()] !== false;
  }

  function isTypeVisible(typeKey, ui = readUi()) {
    const key = String(typeKey || '').trim();
    return !!key && ui.visibleTypes[key] !== false;
  }

  function setTypeVisible(typeKey, visible) {
    const key = String(typeKey || '').trim();
    if (!key || !TYPE_DEFS[key]) return false;
    const ui = readUi();
    ui.visibleTypes = { ...ui.visibleTypes, [key]: visible !== false };
    writeUi(ui);
    rerenderLabelsSection('set-type-visible');
    return ui.visibleTypes[key] !== false;
  }

  function setTypeExpanded(typeKey, expanded) {
    const key = String(typeKey || '').trim();
    if (!key) return false;
    const ui = readUi();
    ui.openTypes = { ...ui.openTypes, [key]: expanded !== false };
    writeUi(ui);
    return ui.openTypes[key];
  }

  function setAllTypeExpanded(expanded) {
    const ui = readUi();
    ui.openTypes = Object.fromEntries(listTypeDefs().map((typeDef) => [typeDef.key, expanded !== false]));
    writeUi(ui);
    return ui.openTypes;
  }

  function applyTypeExpandModeOnSectionOpen() {
    const ui = readUi();
    if (ui.typeExpandMode === 'all-open') setAllTypeExpanded(true);
    else if (ui.typeExpandMode === 'all-closed') setAllTypeExpanded(false);
  }

  function isLabelPreviewOpen(typeKey, labelId, ui = readUi()) {
    return ui.openLabels[previewKeyFor(typeKey, labelId)] === true;
  }

  function setLabelPreviewOpen(typeKey, labelId, expanded) {
    const key = previewKeyFor(typeKey, labelId);
    const ui = readUi();
    ui.openLabels = { ...ui.openLabels, [key]: expanded === true };
    writeUi(ui);
    return ui.openLabels[key] === true;
  }

  function openLabelByMode(typeKey, labelId, opts = {}) {
    const mode = opts.mode || readUi().openMode || 'page';
    return openLabelViewer(typeKey, labelId, { ...opts, mode });
  }

  function openLabelsByMode(opts = {}) {
    const mode = opts.mode || readUi().openMode || 'page';
    return openLabelsViewer({ ...opts, mode });
  }

  function makeTypeHeaderButton(typeDef, expanded, onToggle) {
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI_STATE, 'group-title');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    btn.innerHTML = `
      <span ${ATTR_CGXUI_STATE}="group-title-main">
        ${FRAG_SVG_SECTION_ARROW}
        <span ${ATTR_CGXUI_STATE}="group-title-text">${typeDef.label}</span>
      </span>
    `;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.();
    };
    btn.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      onToggle?.();
    };
    syncHeaderArrow(btn, expanded);
    return btn;
  }

  function makeFallbackSidebarHeader(labelText) {
    const btn = D.createElement('button');
    btn.type = 'button';
    btn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
    btn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
    const label = btn.querySelector('h2.__menu-label');
    if (label) label.textContent = labelText;
    return btn;
  }

  function prepareLabelsSection(projectsSection, existingSection = null) {
    const projectsHeaderBtn = projectsSection?.querySelector?.(':scope > button') || projectsSection?.querySelector?.('button') || null;

    const section = existingSection instanceof HTMLElement ? existingSection : D.createElement('div');
    if (projectsSection?.className) section.className = projectsSection.className;
    else if (!section.className) section.className = 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]';
    section.style.display = '';
    section.setAttribute(ATTR_CGXUI, UI_LABELS_ROOT);
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
      headerBtn = makeFallbackSidebarHeader(MODTAG);
      section.insertBefore(headerBtn, section.firstChild || null);
    }

    headerBtn.removeAttribute('data-h2o-sidebar-shell-inert');
    const label = headerBtn.querySelector('h2.__menu-label');
    if (label) label.textContent = MODTAG;

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
    if (headerBtn.nextElementSibling !== listWrap) section.insertBefore(listWrap, headerBtn.nextElementSibling || null);

    return { section, headerBtn, listWrap };
  }

  function buildLabelsSection(projectsSection, existingSection = null, reason = 'build') {
    ensureStyle();
    readCatalog();

    const prepared = prepareLabelsSection(projectsSection, existingSection);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    recordLabelsShellSeen(section, reason);

    const tplDiv = D.querySelector(`nav ${SEL.sidebarItemDiv}`) || D.querySelector(SEL.sidebarItemDiv) || null;
    const tplA = D.querySelector(`nav ${SEL.sidebarItemAnchor}`) || D.querySelector(SEL.sidebarItemAnchor) || null;
    const fallbackClass = tplDiv?.className || tplA?.className || 'group __menu-item hoverable';

    let expanded = readUi().expanded;
    const applyExpanded = () => {
      const ui = readUi();
      expanded = ui.expanded !== false;
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      syncHeaderArrow(headerBtn, expanded);
    };
    const setExpanded = (value) => {
      writeUi({ expanded: !!value });
      if (value) applyTypeExpandModeOnSectionOpen();
      render();
    };

    headerBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(!readUi().expanded);
    };

    const makeActionRow = (text, onClick, opts = {}) => {
      const row = makeRowShell(tplDiv, tplA, fallbackClass, 'div');
      setRowText(row, text);
      injectIcon(row, opts.color || '');
      row.setAttribute(ATTR_CGXUI, UI_LABELS_ROW);
      row.setAttribute(ATTR_CGXUI_OWNER, SkID);
      return wireAsButton(row, onClick);
    };

    const makeLabelRow = (typeDef, record, count) => {
      const ui = readUi();
      const previewEnabled = ui.inlinePreview === true;
      const isPreviewOpen = previewEnabled && isLabelPreviewOpen(typeDef.key, record.id, ui);
      const row = makeActionRow(record.label, () => openLabelByMode(typeDef.key, record.id), { color: record.color });
      row.setAttribute('data-h2o-label-type', typeDef.key);
      row.setAttribute('data-h2o-label-id', record.id);
      row.title = `${typeDef.fullLabel}: ${record.label}`;
      const trunc = row.querySelector?.(SEL.sidebarTruncate);
      if (trunc && ui.showCounts !== false) trunc.parentElement?.appendChild(makeLabelCountSpan(count));
      if (previewEnabled) {
        makeIconToggle(
          row,
          isPreviewOpen ? 'Hide chats' : 'Show chats',
          () => {
            setLabelPreviewOpen(typeDef.key, record.id, !isPreviewOpen);
            rerenderLabelsSection('label-preview-toggle');
          },
          isPreviewOpen,
          record.color
        );
      }
      return { row, isPreviewOpen };
    };

    const makeSubChatRow = (href, text) => {
      const a = makeRowShell(tplDiv, tplA, fallbackClass, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      removeSurfaceChatLeadingIcon(a);
      setRowText(a, cleanSurfaceChatTitle(text));
      return a;
    };

    const render = () => {
      const ui = readUi();
      const cfg = readCfg();
      const catalog = readCatalog();
      const counts = getLabelCounts();
      listWrap.replaceChildren();

      listWrap.appendChild(makeActionRow('Manage labels', () => openLabelsByMode(), { color: '#A855F7' }));
      listWrap.appendChild(makeActionRow('Label current chat', () => openAssignModal(toChatId(), { source: 'sidebar-action' }), { color: '#3B82F6' }));

      listTypeDefs().filter((typeDef) => isTypeVisible(typeDef.key, ui)).forEach((typeDef) => {
        const rows = (catalog[typeDef.key] || []).filter((row) => row.builtIn || typeDef.key === 'custom' || (counts[typeDef.key]?.[row.id] || 0) > 0);
        if (!rows.length && typeDef.key === 'custom') return;
        const typeExpanded = getTypeExpanded(typeDef.key, ui);
        const groupWrap = D.createElement('div');
        groupWrap.setAttribute(ATTR_CGXUI_STATE, 'group');
        const groupBtn = makeTypeHeaderButton(typeDef, typeExpanded, () => {
          setTypeExpanded(typeDef.key, !getTypeExpanded(typeDef.key));
          rerenderLabelsSection('type-toggle');
        });
        groupWrap.appendChild(groupBtn);
        const groupBody = D.createElement('div');
        groupBody.setAttribute(ATTR_CGXUI_STATE, 'group-body');
        groupBody.style.display = typeExpanded ? '' : 'none';
        const limit = cfg.visibleLabelsPerType || CFG_SEE_MORE_LIMIT;
        rows.slice(0, limit).forEach((record) => {
          const block = D.createElement('div');
          block.setAttribute(ATTR_CGXUI_STATE, 'label-block');
          const { row, isPreviewOpen } = makeLabelRow(typeDef, record, counts[typeDef.key]?.[record.id] || 0);
          block.appendChild(row);
          if (ui.inlinePreview === true && isPreviewOpen) {
            const chats = listChatsByLabel(typeDef.key, record.id);
            chats.slice(0, 5).forEach((chat) => {
              if (!chat?.href) return;
              block.appendChild(makeSubChatRow(chat.href, chat.title || chat.chatId || chat.href));
            });
            if (chats.length > 5) {
              const moreChats = makeActionRow('Show more', () => openLabelByMode(typeDef.key, record.id), { color: record.color });
              moreChats.classList.add('ps-9');
              block.appendChild(moreChats);
            }
          }
          groupBody.appendChild(block);
        });
        if (rows.length > limit) {
          const more = makeActionRow('More', () => openLabelsByMode({ focusType: typeDef.key }), { color: '#888888' });
          more.setAttribute(ATTR_CGXUI_STATE, 'labels-more');
          groupBody.appendChild(more);
        }
        groupWrap.appendChild(groupBody);
        listWrap.appendChild(groupWrap);
      });

      applyExpanded();
      if (ui.inlinePreview) section.setAttribute('data-cgxui-inline-preview', 'true');
      else section.removeAttribute('data-cgxui-inline-preview');
      syncLabelSidebarActiveState('render');
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);
    section._cgxuiRender = render;
    render();
    recordLabelsHydrated(section, reason);
    return section;
  }

  function activePageLabelKey() {
    try {
      const page = state.pageEl?.isConnected ? state.pageEl : null;
      if (page?.getAttribute?.('data-cgxui-page-kind') !== 'label') return '';
      return String(page.getAttribute('data-cgxui-page-id') || '');
    } catch {
      return '';
    }
  }

  function syncLabelSidebarActiveState(reason = 'sync') {
    try {
      state.sidebarActiveSyncCount = Number(state.sidebarActiveSyncCount || 0) + 1;
      state.lastSidebarActiveSyncReason = String(reason || 'sync');
      state.sidebarLastActiveSyncReason = String(reason || 'sync');
      state.sidebarLastActiveSyncAt = Date.now();
      const currentChatId = toChatId();
      const currentLabels = currentChatId ? getChatLabels(currentChatId) : normalizeBindingRow(null);
      const pageKey = activePageLabelKey();
      D.querySelectorAll(utilSelScoped(UI_LABELS_ROW)).forEach((row) => {
        const type = normalizeType(row.getAttribute('data-h2o-label-type') || '');
        const labelId = slugify(row.getAttribute('data-h2o-label-id') || '');
        if (!type || !labelId) {
          row.removeAttribute('aria-current');
          return;
        }
        const value = currentLabels[type];
        const activeForChat = TYPE_DEFS[type]?.cardinality === 'single'
          ? value === labelId
          : (Array.isArray(value) ? value : []).includes(labelId);
        const activeForPage = pageKey === `${type}:${labelId}`;
        if (activeForChat || activeForPage) row.setAttribute('aria-current', 'true');
        else row.removeAttribute('aria-current');
      });
    } catch (e) {
      err('sync-label-active-state', e);
    }
  }

  function scheduleLabelSidebarActiveSync(reason = 'sync') {
    if (state.sidebarActiveSyncTimer) return;
    state.sidebarActiveSyncTimer = W.setTimeout(() => {
      const timer = state.sidebarActiveSyncTimer;
      state.sidebarActiveSyncTimer = 0;
      state.clean.timers.delete(timer);
      syncLabelSidebarActiveState(reason);
    }, 0);
    state.clean.timers.add(state.sidebarActiveSyncTimer);
  }

  function rerenderLabelsSection(reason = 'rerender') {
    try {
      D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT)).forEach((section) => {
        const fn = section?._cgxuiRender;
        if (typeof fn === 'function') fn();
      });
      state.sidebarRenderCount = Number(state.sidebarRenderCount || 0) + 1;
      state.lastSidebarRenderReason = String(reason || 'rerender');
      state.sidebarLastRenderReason = String(reason || 'rerender');
      state.sidebarLastRenderAt = Date.now();
      step('rerender-section', reason);
    } catch (e) {
      err('rerender-section', e);
    }
  }

  function ensureSidebarObserver(root) {
    if (!(root instanceof HTMLElement)) return;
    if (state.observedRoot === root && state.sidebarMO) return;
    try { state.sidebarMO?.disconnect?.(); } catch {}
    state.observedRoot = root;
    const mo = new MutationObserver((muts) => {
      if (state.suppressMO) return;
      if (mutationHasOnlyH2OOwnedNodes(muts)) {
        if (D.querySelector(utilSelScoped(UI_LABELS_ROOT))) {
          state.sidebarSkippedH2OMutations = Number(state.sidebarSkippedH2OMutations || 0) + 1;
          scheduleLabelSidebarActiveSync('h2o-owned-mutation');
          return;
        }
      }
      const relevant = muts.some((mu) => {
        const target = mu.target;
        if (!(target instanceof HTMLElement)) return true;
        return !target.closest?.([
          utilSelScoped(UI_LABELS_ROOT),
          utilSelScoped(UI_LABELS_MODAL),
          utilSelScoped(UI_LABELS_VIEWER),
          utilSelScoped(UI_LABELS_PAGE_HOST),
          utilSelScoped(UI_LABELS_PAGE),
          utilSelScoped(UI_LABELS_POP),
        ].join(','));
      });
      if (!relevant) return;
      scheduleLabelSidebarActiveSync('sidebar-mutation');
      scheduleEnsure('mutation');
    });
    mo.observe(root, { childList: true, subtree: true });
    state.sidebarMO = mo;
    state.clean.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function scheduleEnsure(reason = 'schedule') {
    if (state.ensureTimer) W.clearTimeout(state.ensureTimer);
    state.ensureTimer = W.setTimeout(() => {
      const timer = state.ensureTimer;
      state.ensureTimer = 0;
      state.clean.timers.delete(timer);
      ensureInjected(reason);
    }, 180);
    state.clean.timers.add(state.ensureTimer);
  }

  function ensureInjected(reason = 'ensure') {
    if (state.building) return false;
    state.sidebarEnsureCount = Number(state.sidebarEnsureCount || 0) + 1;
    state.lastSidebarEnsureReason = String(reason || 'ensure');
    state.sidebarLastEnsureReason = String(reason || 'ensure');
    state.sidebarLastEnsureAt = Date.now();
    const h2 = findProjectsH2();
    const projectsSection = h2 ? findProjectsSection(h2) : null;
    const existingGlobal = findLabelsRoot();
    if (!(projectsSection instanceof HTMLElement) && !existingGlobal) return false;
    const parent = projectsSection?.parentElement || existingGlobal?.parentElement || null;
    if (!(parent instanceof HTMLElement)) return false;
    ensureSidebarObserver(pickSidebarRoot(projectsSection || parent));

    const existing = parent.querySelector(`:scope > ${utilSelScoped(UI_LABELS_ROOT)}`) || existingGlobal;
    const folderRoot = parent.querySelector(':scope > [data-cgxui="flsc-root"][data-cgxui-owner="flsc"]');
    const beforeNode = projectsSection instanceof HTMLElement ? (folderRoot || projectsSection) : null;
    const labelRoots = [...D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT))].filter((node) => node instanceof HTMLElement);

    if (existing && (!beforeNode || existing.nextElementSibling === beforeNode)) {
      if (!existing._cgxuiRender || existing.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
        buildLabelsSection(projectsSection, existing, reason || 'already-ok-hydrate');
      } else {
        recordLabelsShellSeen(existing, reason || 'already-ok');
      }
      syncLabelSidebarActiveState(reason || 'already-ok');
      step('already-ok', reason);
      return true;
    }

    if (existing && beforeNode) {
      state.suppressMO = true;
      try {
        if (!existing._cgxuiRender || existing.getAttribute('data-h2o-sidebar-shell') === 'prepaint') {
          buildLabelsSection(projectsSection, existing, reason || 'placement-hydrate');
        }
        labelRoots.forEach((node) => { if (node !== existing) safeRemove(node); });
        parent.insertBefore(existing, beforeNode);
        state.sidebarPlacementRepairCount = Number(state.sidebarPlacementRepairCount || 0) + 1;
        syncLabelSidebarActiveState(reason || 'placement-repair');
        step('placement-repair', `${reason}:before-${folderRoot ? 'folders' : 'projects'}`);
        return true;
      } catch (e) {
        err('placement-repair', e);
      } finally {
        state.suppressMO = false;
      }
    }
    if (existing && !beforeNode) {
      state.building = true;
      state.suppressMO = true;
      try {
        labelRoots.forEach((node) => { if (node !== existing) safeRemove(node); });
        buildLabelsSection(projectsSection, existing, reason || 'hydrate-existing');
        syncLabelSidebarActiveState(reason || 'hydrated');
        step('hydrated', reason);
        return true;
      } catch (e) {
        err('hydrate-existing', e);
        return false;
      } finally {
        state.suppressMO = false;
        state.building = false;
      }
    }

    state.building = true;
    state.suppressMO = true;
    try {
      labelRoots.forEach((node) => safeRemove(node));
      if (!(projectsSection instanceof HTMLElement)) return false;
      const section = buildLabelsSection(projectsSection, null, reason || 'build');
      if (!section) return false;
      parent.insertBefore(section, beforeNode);
      state.sidebarRenderCount = Number(state.sidebarRenderCount || 0) + 1;
      state.lastSidebarRenderReason = String(reason || 'ensure');
      state.sidebarLastRenderReason = String(reason || 'ensure');
      state.sidebarLastRenderAt = Date.now();
      syncLabelSidebarActiveState(reason || 'injected');
      step('injected', `${reason}:before-${folderRoot ? 'folders' : 'projects'}`);
      return true;
    } catch (e) {
      err('ensure-injected', e);
      return false;
    } finally {
      state.suppressMO = false;
      state.building = false;
    }
  }

  function debugSnapshot() {
    const projectsH2 = findProjectsH2();
    const projectsSection = findProjectsSection(projectsH2);
    const sidebarRoot = projectsSection ? pickSidebarRoot(projectsSection) : null;
    const labelsRoots = [...D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT))];
    return {
      ok: !!core.getOwner?.('labels') && !!core.getService?.('labels'),
      hasCore: !!core,
      hasLabels: !!H2O.Labels,
      ownerRegistered: !!core.getOwner?.('labels'),
      serviceRegistered: !!core.getService?.('labels'),
      routeRegistered: {
        labels: !!core.getRoute?.('labels'),
        label: !!core.getRoute?.('label'),
      },
      labelsRoot: !!labelsRoots[0],
      labelsRootCount: labelsRoots.length,
      labelsRootConnected: !!labelsRoots[0]?.isConnected,
      labelsRootParentTag: String(labelsRoots[0]?.parentElement?.tagName || ''),
      labelsRootPrev: String(labelsRoots[0]?.previousElementSibling?.getAttribute?.(ATTR_CGXUI) || labelsRoots[0]?.previousElementSibling?.tagName || ''),
      labelsRootNext: String(labelsRoots[0]?.nextElementSibling?.getAttribute?.(ATTR_CGXUI) || labelsRoots[0]?.nextElementSibling?.tagName || ''),
      hasProjectsH2: !!projectsH2,
      hasProjectsSection: !!projectsSection,
      projectsSectionConnected: !!projectsSection?.isConnected,
      sidebarRootTag: String(sidebarRoot?.tagName || ''),
      sidebarRootConnected: !!sidebarRoot?.isConnected,
      folderRoot: !!D.querySelector('[data-cgxui="flsc-root"][data-cgxui-owner="flsc"]'),
      categoriesRoot: !!D.querySelector('[data-cgxui="flsc-categories-root"][data-cgxui-owner="flsc"]'),
      owners: core.listOwners?.() || [],
      services: core.listServices?.() || [],
      bootDiag: H2O.LabelsBootDiag || null,
      state: {
        booted: !!state.booted,
        building: !!state.building,
        suppressMO: !!state.suppressMO,
        observedRootTag: String(state.observedRoot?.tagName || ''),
      },
      diag: {
        steps: diag.steps.slice(-16),
        errors: diag.errors.slice(-10),
      },
    };
  }

  function makeChatRow(chat, opts = {}) {
    const li = D.createElement('li');
    li.setAttribute(ATTR_CGXUI_STATE, 'chat-row');
    const href = String(chat?.href || hrefForChatId(chat?.chatId || '') || '').trim();
    const el = href ? D.createElement('a') : D.createElement('button');
    if (href) {
      el.href = href;
      el.setAttribute('role', 'link');
    } else {
      el.type = 'button';
      el.onclick = () => openAssignModal(chat?.chatId || '', { source: 'viewer-row' });
    }
    el.setAttribute(ATTR_CGXUI_STATE, 'row');

    const body = D.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = normText(chat?.title || chat?.chatId || 'Untitled chat');
    body.appendChild(title);

    const sub = D.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    const labels = flattenChatLabels(chat?.chatId || '');
    sub.textContent = opts.subText || labels.map((item) => item.label).join(' · ') || chat?.updatedAt || '';
    body.appendChild(sub);

    el.appendChild(body);
    li.appendChild(el);
    return li;
  }

  function makeStandalonePageShell(titleText, subText, opts = {}) {
    const svc = getUiShellService();
    const env = labelsEnv();
    try {
      const made = svc?.UI_makeInShellPageShell?.(env, titleText, subText, opts.tabText || 'Chats', {
        kind: opts.kind || 'labels',
        id: opts.id || '',
        iconSvg: opts.iconSvg || FRAG_SVG_LABEL,
        iconColor: opts.iconColor || '',
      });
      if (made?.page && made?.list) return made;
    } catch (e) {
      err('make-page-shell-core', e);
    }

    const page = D.createElement('div');
    page.setAttribute(ATTR_CGXUI, UI_LABELS_PAGE);
    page.setAttribute(ATTR_CGXUI_OWNER, SkID);
    page.setAttribute('data-cgxui-page-kind', String(opts.kind || 'labels'));
    page.setAttribute('data-cgxui-page-id', String(opts.id || ''));
    page.setAttribute('data-cgxui-page-title', titleText || 'Labels');

    const top = D.createElement('div');
    top.setAttribute(ATTR_CGXUI_STATE, 'top');
    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'head');
    const wrap = D.createElement('div');
    wrap.style.minWidth = '0';
    const row = D.createElement('div');
    row.setAttribute(ATTR_CGXUI_STATE, 'title-row');
    const icon = D.createElement('span');
    icon.setAttribute(ATTR_CGXUI_STATE, 'title-icon');
    icon.innerHTML = opts.iconSvg || FRAG_SVG_LABEL;
    const h1 = D.createElement('h1');
    h1.textContent = titleText || 'Labels';
    row.appendChild(icon);
    row.appendChild(h1);
    wrap.appendChild(row);
    if (subText) {
      const sub = D.createElement('div');
      sub.setAttribute(ATTR_CGXUI_STATE, 'sub');
      sub.textContent = subText;
      wrap.appendChild(sub);
    }
    head.appendChild(wrap);
    const close = D.createElement('button');
    close.type = 'button';
    close.setAttribute(ATTR_CGXUI_STATE, 'close');
    close.textContent = '✕';
    close.onclick = () => closeViewer();
    head.appendChild(close);
    top.appendChild(head);
    const list = D.createElement('ol');
    list.setAttribute(ATTR_CGXUI_STATE, 'list');
    page.appendChild(top);
    page.appendChild(list);
    return { page, list };
  }

  function mountPage(page, opts = {}) {
    const svc = getPageHostService();
    const mode = normalizeOpenMode(opts.mode || readUi().openMode);
    if (mode !== 'panel') {
      try {
        if (svc?.UI_mountInShellPage?.(labelsEnv(), page)) return true;
      } catch (e) {
        err('mount-page-core', e);
      }
    }
    closeViewer();
    const viewer = D.createElement('div');
    viewer.setAttribute(ATTR_CGXUI, UI_LABELS_VIEWER);
    viewer.setAttribute(ATTR_CGXUI_OWNER, SkID);
    viewer.setAttribute(ATTR_CGXUI_MODE, 'panel');
    viewer.appendChild(page);
    D.body.appendChild(viewer);
    state.viewerEl = viewer;
    state.clean.nodes.add(viewer);
    return true;
  }

  function closeViewer() {
    try { getPageHostService()?.UI_closeViewer?.(labelsEnv()); } catch {}
    safeRemove(state.viewerEl);
    state.viewerEl = null;
    state.pageEl = null;
    syncLabelSidebarActiveState('close-viewer');
  }

  function openLabelsViewer(opts = {}) {
    ensureStyle();
    const catalog = readCatalog();
    const counts = getLabelCounts();
    const totalLabels = listTypeDefs().reduce((n, typeDef) => n + (catalog[typeDef.key] || []).length, 0);
    const { page, list } = makeStandalonePageShell('Labels', `${totalLabels} labels`, { kind: 'labels', tabText: 'Label groups' });

    listTypeDefs().forEach((typeDef) => {
      const header = D.createElement('li');
      header.setAttribute(ATTR_CGXUI_STATE, 'type-head');
      header.innerHTML = `<div><strong>${escapeHtml(typeDef.fullLabel)}</strong><span>${escapeHtml(typeDef.cardinality)}</span></div>`;
      list.appendChild(header);
      (catalog[typeDef.key] || []).forEach((record) => {
        const li = D.createElement('li');
        const btn = D.createElement('button');
        btn.type = 'button';
        btn.setAttribute(ATTR_CGXUI_STATE, 'row');
        btn.onclick = () => openLabelViewer(typeDef.key, record.id, { mode: opts.mode });
        const dot = D.createElement('span');
        dot.setAttribute(ATTR_CGXUI_STATE, 'dot');
        dot.style.background = normalizeHexColor(record.color) || colorFor(record.id);
        const body = D.createElement('div');
        body.style.minWidth = '0';
        body.style.flex = '1 1 auto';
        const title = D.createElement('div');
        title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
        title.textContent = record.label;
        const sub = D.createElement('div');
        sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
        sub.textContent = `${counts[typeDef.key]?.[record.id] || 0} chats`;
        body.appendChild(title);
        body.appendChild(sub);
        btn.appendChild(dot);
        btn.appendChild(body);
        li.appendChild(btn);
        list.appendChild(li);
      });
    });

    mountPage(page, { mode: opts.mode });
    state.pageEl = page;
    syncLabelSidebarActiveState('open-labels-viewer');
    safeDispatch(EV_LABELS_UI_OPEN, { view: 'labels', opts, ts: Date.now() });
    return page;
  }

  function openLabelViewer(typeRaw, labelIdRaw, opts = {}) {
    ensureStyle();
    const type = normalizeType(typeRaw);
    const labelId = slugify(labelIdRaw);
    const typeDef = TYPE_DEFS[type];
    const label = getLabel(type, labelId);
    if (!typeDef || !label) return null;
    const chats = listChatsByLabel(type, labelId).slice(0, CFG_LABEL_CHAT_PREVIEW_LIMIT);
    const { page, list } = makeStandalonePageShell(label.label, `${typeDef.fullLabel} · ${chats.length} chats`, {
      kind: 'label',
      id: `${type}:${labelId}`,
      tabText: 'Chats',
      iconColor: label.color,
    });

    if (!chats.length) {
      const li = D.createElement('li');
      li.setAttribute(ATTR_CGXUI_STATE, 'empty');
      li.textContent = 'No chats have this label yet.';
      list.appendChild(li);
    } else {
      chats.forEach((chat) => list.appendChild(makeChatRow(chat, { subText: `${typeDef.fullLabel}: ${label.label}` })));
    }

    mountPage(page, { mode: opts.mode });
    state.pageEl = page;
    syncLabelSidebarActiveState('open-label-viewer');
    safeDispatch(EV_LABELS_UI_OPEN, { view: 'label', type, labelId, opts, ts: Date.now() });
    return page;
  }

  function closeAssignModal() {
    safeRemove(state.openModal);
    state.openModal = null;
    safeDispatch(EV_LABELS_UI_CLOSE, { view: 'assign-modal', ts: Date.now() });
  }

  function openAssignModal(chatIdRaw = '', opts = {}) {
    ensureStyle();
    const chatId = toChatId(chatIdRaw || state.lastChatHrefForMenu || '');
    if (!chatId) {
      try { alert('Open or select a chat first.'); } catch {}
      return null;
    }
    closeAssignModal();

    const modal = D.createElement('div');
    modal.setAttribute(ATTR_CGXUI, UI_LABELS_MODAL);
    modal.setAttribute(ATTR_CGXUI_OWNER, SkID);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Manage chat labels');

    const box = D.createElement('div');
    box.setAttribute(ATTR_CGXUI_STATE, 'box');
    const head = D.createElement('div');
    head.setAttribute(ATTR_CGXUI_STATE, 'hd');
    const title = D.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'title');
    title.textContent = 'Manage labels';
    const x = D.createElement('button');
    x.type = 'button';
    x.setAttribute(ATTR_CGXUI_STATE, 'x');
    x.textContent = '✕';
    x.onclick = closeAssignModal;
    head.appendChild(title);
    head.appendChild(x);

    const body = D.createElement('div');
    body.setAttribute(ATTR_CGXUI_STATE, 'bd');
    const sub = D.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'hint');
    sub.textContent = findChatTitleInSidebar(chatId) || chatId;
    body.appendChild(sub);

    const renderBody = () => {
      [...body.querySelectorAll(`[${ATTR_CGXUI_STATE}="type-block"], [${ATTR_CGXUI_STATE}="custom-create"]`)].forEach((node) => node.remove());
      const catalog = readCatalog();
      const current = getChatLabels(chatId);
      listTypeDefs().forEach((typeDef) => {
        const block = D.createElement('div');
        block.setAttribute(ATTR_CGXUI_STATE, 'type-block');
        const h = D.createElement('div');
        h.setAttribute(ATTR_CGXUI_STATE, 'type-title');
        h.textContent = `${typeDef.fullLabel}${typeDef.cardinality === 'single' ? ' · single' : ''}`;
        block.appendChild(h);
        const chips = D.createElement('div');
        chips.setAttribute(ATTR_CGXUI_STATE, 'chips');
        (catalog[typeDef.key] || []).forEach((record) => {
          const active = typeDef.cardinality === 'single'
            ? current[typeDef.key] === record.id
            : (Array.isArray(current[typeDef.key]) ? current[typeDef.key] : []).includes(record.id);
          const chip = D.createElement('button');
          chip.type = 'button';
          chip.setAttribute(ATTR_CGXUI_STATE, 'chip');
          chip.setAttribute('aria-pressed', active ? 'true' : 'false');
          chip.style.setProperty('--lbsc-chip-color', normalizeHexColor(record.color) || colorFor(record.id));
          chip.textContent = record.label;
          chip.onclick = () => {
            if (active) removeChatLabel(chatId, typeDef.key, record.id);
            else addChatLabel(chatId, typeDef.key, record.id);
            renderBody();
          };
          chips.appendChild(chip);
        });
        block.appendChild(chips);
        body.appendChild(block);
      });

      const custom = D.createElement('div');
      custom.setAttribute(ATTR_CGXUI_STATE, 'custom-create');
      const input = D.createElement('input');
      input.type = 'text';
      input.placeholder = 'Create custom label…';
      const add = D.createElement('button');
      add.type = 'button';
      add.textContent = 'Add';
      add.onclick = () => {
        const label = normalizeLabel(input.value || '');
        if (!label) return;
        const record = createLabel('custom', label);
        if (record) addChatLabel(chatId, 'custom', record.id);
        input.value = '';
        renderBody();
      };
      input.onkeydown = (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        add.click();
      };
      custom.appendChild(input);
      custom.appendChild(add);
      body.appendChild(custom);
    };

    const foot = D.createElement('div');
    foot.setAttribute(ATTR_CGXUI_STATE, 'ft');
    const clear = D.createElement('button');
    clear.type = 'button';
    clear.setAttribute(ATTR_CGXUI_STATE, 'btn');
    clear.textContent = 'Clear all';
    clear.onclick = () => {
      clearChatLabels(chatId);
      renderBody();
    };
    const done = D.createElement('button');
    done.type = 'button';
    done.setAttribute(ATTR_CGXUI_STATE, 'primary');
    done.textContent = 'Done';
    done.onclick = closeAssignModal;
    foot.appendChild(clear);
    foot.appendChild(done);

    box.appendChild(head);
    box.appendChild(body);
    box.appendChild(foot);
    modal.appendChild(box);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeAssignModal(); }, true);
    D.body.appendChild(modal);
    state.openModal = modal;
    state.clean.nodes.add(modal);
    renderBody();
    safeDispatch(EV_LABELS_UI_OPEN, { view: 'assign-modal', chatId, opts, ts: Date.now() });
    return modal;
  }

  function hookMenuInjectionOnce() {
    if (state.menuHooked) return;
    state.menuHooked = true;

    const onPointerDown = (e) => {
      const btn = e.target?.closest?.(SEL.menuCaptureBtn);
      if (!btn) return;
      const anchor = btn.closest('a[href*="/c/"]');
      if (!anchor) return;
      state.lastChatHrefForMenu = anchor.getAttribute('href') || '';
    };

    D.addEventListener('pointerdown', onPointerDown, true);
    state.clean.listeners.add(() => D.removeEventListener('pointerdown', onPointerDown, true));

    const injectMenu = (menu) => {
      if (!(menu instanceof HTMLElement)) return;
      if (menu.querySelector?.(`[${ATTR_CGXUI}="${UI_LABELS_MENU_ITEM}"][${ATTR_CGXUI_OWNER}="${SkID}"]`)) return;
      const txt = normText(menu.innerText || '');
      if (!/pin chat|archive|delete|move to project|add to folder/i.test(txt)) return;

      const item = D.createElement('div');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '0');
      item.setAttribute(ATTR_CGXUI, UI_LABELS_MENU_ITEM);
      item.setAttribute(ATTR_CGXUI_OWNER, SkID);
      item.innerHTML = `<span ${ATTR_CGXUI_STATE}="menu-icon">${FRAG_SVG_LABEL}</span><span>Add label</span>`;
      const fire = (e) => {
        e.preventDefault();
        e.stopPropagation();
        openAssignModal(state.lastChatHrefForMenu || '', { source: 'native-menu' });
      };
      item.onclick = fire;
      item.onkeydown = (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        fire(e);
      };

      const anchorItems = [...menu.querySelectorAll(SEL.radixMenuItem)];
      const after = anchorItems.find((el) => /add to folder|move to project/i.test(normText(el.textContent || ''))) || anchorItems[0] || null;
      if (after?.parentNode) after.parentNode.insertBefore(item, after.nextSibling);
      else menu.appendChild(item);
    };

    const mo = new MutationObserver((muts) => {
      for (const mu of muts) {
        for (const node of mu.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const menus = [];
          if (node.getAttribute?.('role') === 'menu') menus.push(node);
          else if (node.querySelectorAll) menus.push(...node.querySelectorAll(SEL.radixMenu));
          menus.forEach((menu) => W.requestAnimationFrame(() => injectMenu(menu)));
        }
      }
    });
    mo.observe(D.body, { childList: true, subtree: true });
    state.menuMO = mo;
    state.clean.observers.add(() => { try { mo.disconnect(); } catch {} });
  }

  function hookGlobalKeysOnce() {
    if (state.globalKeysHooked) return;
    state.globalKeysHooked = true;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      closeAssignModal();
      closeTransientPop();
    };
    D.addEventListener('keydown', onKey, true);
    state.clean.listeners.add(() => D.removeEventListener('keydown', onKey, true));
  }

  function closeTransientPop() {
    try { D.querySelectorAll(utilSelScoped(UI_LABELS_POP)).forEach((node) => node.remove()); } catch {}
  }

  function ensureStyle() {
    const existing = D.getElementById(CSS_STYLE_ID);
    const css = CSS_TEXT();
    if (existing) {
      if (existing.textContent !== css) existing.textContent = css;
      return;
    }
    const st = D.createElement('style');
    st.id = CSS_STYLE_ID;
    st.setAttribute(ATTR_CGXUI_OWNER, SkID);
    st.textContent = css;
    D.documentElement.appendChild(st);
    state.clean.nodes.add(st);
  }

  function CSS_TEXT() {
    const ROOT = utilSelScoped(UI_LABELS_ROOT);
    const MODAL = utilSelScoped(UI_LABELS_MODAL);
    const VIEWER = utilSelScoped(UI_LABELS_VIEWER);
    const PAGE_HOST = utilSelScoped(UI_LABELS_PAGE_HOST);
    const PAGE = utilSelScoped(UI_LABELS_PAGE);
    const ROW = utilSelScoped(UI_LABELS_ROW);
    const ICON = utilSelScoped(UI_LABELS_ICON_SLOT);
    const MENU_ITEM = utilSelScoped(UI_LABELS_MENU_ITEM);
    return `
/* ===========================
   🏷️ Labels — cgxui (${SkID})
   =========================== */
${ICON}{ display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; flex:0 0 auto; }
${ICON} svg,
${ROOT} [${ATTR_CGXUI_STATE}="project-like-icon"] svg{
  width:16px;
  height:16px;
  opacity:.92;
  flex:0 0 auto;
}
${ROOT} [${ATTR_CGXUI_STATE}="group-title"]{
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px 4px 12px;
  color: var(--text-tertiary, rgba(255,255,255,.48));
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .01em;
  text-transform: uppercase;
  cursor: pointer;
}
${ROOT} [${ATTR_CGXUI_STATE}="group-title-main"]{
  display:inline-flex;
  align-items:center;
  gap:8px;
}
${ROOT} [${ATTR_CGXUI_STATE}="group-title-text"]{
  padding-left: 0;
}
${ROOT} [${ATTR_CGXUI_STATE}="group-title"] > svg{
  width:12px;
  height:12px;
}
${ROOT} [${ATTR_CGXUI_STATE}="group-body"]{
  display: block;
}
${ROOT} [${ATTR_CGXUI_STATE}="count"]{
  margin-left: 8px;
  color: var(--text-tertiary, rgba(255,255,255,.48));
  font-size: 12px;
}
${ROOT} [${ATTR_CGXUI_STATE}="project-like-icon"]{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px;
  height:20px;
}
${ROW}[aria-current="true"]{
  background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08));
  border-radius: 8px;
}
${MENU_ITEM}{
  box-sizing:border-box;
  display:flex;
  align-items:center;
  gap:10px;
  width:100%;
  min-height:36px;
  padding:8px 12px;
  border-radius:8px;
  color:var(--text-primary, currentColor);
  cursor:pointer;
  font-size:14px;
}
${MENU_ITEM}:hover{ background: var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${MENU_ITEM} [${ATTR_CGXUI_STATE}="menu-icon"]{ width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; opacity:.9; }
${MENU_ITEM} svg{ width:18px; height:18px; }
${MODAL}{
  position:fixed; inset:0; z-index:${CFG_FLOATING_Z};
  display:flex; align-items:flex-start; justify-content:center;
  padding-top:76px; background:rgba(0,0,0,.52);
}
${MODAL} [${ATTR_CGXUI_STATE}="box"]{
  width:min(680px, calc(100vw - 32px)); max-height:min(780px, calc(100svh - 110px));
  overflow:hidden; display:flex; flex-direction:column;
  background:var(--bg-elevated-secondary, #202020);
  border:1px solid var(--border-default, rgba(255,255,255,.14));
  border-radius:18px; box-shadow:0 22px 70px rgba(0,0,0,.48);
}
${MODAL} [${ATTR_CGXUI_STATE}="hd"]{ display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid rgba(255,255,255,.08); }
${MODAL} [${ATTR_CGXUI_STATE}="title"]{ font-size:15px; font-weight:650; }
${MODAL} [${ATTR_CGXUI_STATE}="x"]{ all:unset; width:30px; height:30px; display:flex; align-items:center; justify-content:center; border-radius:10px; cursor:pointer; opacity:.82; }
${MODAL} [${ATTR_CGXUI_STATE}="x"]:hover{ background:var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); opacity:1; }
${MODAL} [${ATTR_CGXUI_STATE}="bd"]{ padding:14px 16px; overflow:auto; }
${MODAL} [${ATTR_CGXUI_STATE}="hint"]{ color:var(--text-secondary, rgba(255,255,255,.68)); font-size:12px; margin-bottom:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
${MODAL} [${ATTR_CGXUI_STATE}="type-block"]{ margin:12px 0 16px; }
${MODAL} [${ATTR_CGXUI_STATE}="type-title"]{ color:var(--text-secondary, rgba(255,255,255,.72)); font-size:12px; font-weight:650; margin-bottom:8px; }
${MODAL} [${ATTR_CGXUI_STATE}="chips"]{ display:flex; flex-wrap:wrap; gap:8px; }
${MODAL} [${ATTR_CGXUI_STATE}="chip"]{
  border:1px solid color-mix(in srgb, var(--lbsc-chip-color, #888) 48%, transparent);
  color:var(--text-primary, #fff);
  background: color-mix(in srgb, var(--lbsc-chip-color, #888) 16%, transparent);
  border-radius:999px; padding:7px 11px; font-size:13px; cursor:pointer;
}
${MODAL} [${ATTR_CGXUI_STATE}="chip"][aria-pressed="true"]{
  background: color-mix(in srgb, var(--lbsc-chip-color, #888) 36%, transparent);
  border-color: color-mix(in srgb, var(--lbsc-chip-color, #888) 78%, transparent);
}
${MODAL} [${ATTR_CGXUI_STATE}="custom-create"]{ display:flex; gap:8px; padding-top:10px; border-top:1px solid rgba(255,255,255,.08); }
${MODAL} input{
  flex:1 1 auto; min-width:0; padding:10px 12px; border-radius:12px;
  background:rgba(0,0,0,.22); color:var(--text-primary, #fff);
  border:1px solid rgba(255,255,255,.14); outline:none;
}
${MODAL} [${ATTR_CGXUI_STATE}="custom-create"] button,
${MODAL} [${ATTR_CGXUI_STATE}="ft"] button{
  border:1px solid rgba(255,255,255,.14); border-radius:12px; padding:10px 14px;
  background:rgba(255,255,255,.07); color:var(--text-primary, #fff); cursor:pointer;
}
${MODAL} [${ATTR_CGXUI_STATE}="ft"]{ display:flex; justify-content:flex-end; gap:10px; padding:12px 16px 16px; border-top:1px solid rgba(255,255,255,.08); }
${MODAL} [${ATTR_CGXUI_STATE}="primary"]{ background:rgba(255,255,255,.14) !important; }
${VIEWER}{ position:fixed; inset:0; z-index:${CFG_FLOATING_Z}; overflow:auto; background:var(--main-surface-primary, #212121); color:var(--text-primary, #fff); }
${VIEWER}[${ATTR_CGXUI_MODE}="panel"]{ inset:8px auto 8px calc(var(--sidebar-width, 260px) + 8px); width:min(460px, max(320px, calc(100vw - var(--sidebar-width, 260px) - 24px))); border:1px solid rgba(255,255,255,.12); border-radius:22px; overflow:auto; }
${PAGE_HOST}{ min-height:100%; width:100%; flex:1 1 auto; display:flex; align-items:stretch; justify-content:center; box-sizing:border-box; overflow:visible; background:var(--main-surface-primary, #212121); color:var(--text-primary, #fff); }
${PAGE}{ --thread-content-max-width: 40rem; width:min(90cqw, var(--thread-content-max-width)); max-width:var(--thread-content-max-width); min-height:100%; margin:0 auto; padding:64px 0 32px; color:var(--text-primary, #fff); display:grid; grid-template-rows:auto minmax(0,1fr); align-content:start; gap:18px; }
${PAGE} [${ATTR_CGXUI_STATE}="head"]{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding-bottom:10px; }
${PAGE} [${ATTR_CGXUI_STATE}="title-row"]{ display:flex; min-width:0; align-items:center; gap:10px; }
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"]{ width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; color:currentColor; border-radius:8px; }
${PAGE} [${ATTR_CGXUI_STATE}="title-icon"] svg{ width:22px; height:22px; }
${PAGE} h1{ margin:0; min-width:0; font-size:28px; line-height:34px; font-weight:500; }
${PAGE} [${ATTR_CGXUI_STATE}="sub"]{ margin-top:6px; color:var(--text-secondary, rgba(255,255,255,.72)); font-size:13px; }
${PAGE} [${ATTR_CGXUI_STATE}="close"]{ border:0; background:transparent; color:inherit; cursor:pointer; width:32px; height:32px; border-radius:8px; }
${PAGE} [${ATTR_CGXUI_STATE}="close"]:hover{ background:var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${PAGE} [${ATTR_CGXUI_STATE}="tabs"]{ display:flex; align-items:center; gap:4px; color:var(--text-secondary, rgba(255,255,255,.72)); font-size:14px; font-weight:500; }
${PAGE} [${ATTR_CGXUI_STATE}="tab"]{ border:0; border-radius:999px; padding:9px 16px; background:var(--interactive-bg-secondary-press, rgba(255,255,255,.10)); color:var(--text-primary, #fff); }
${PAGE} [${ATTR_CGXUI_STATE}="view-action"]{ border:0; border-radius:999px; padding:9px 16px; background:transparent; color:var(--text-secondary, rgba(255,255,255,.72)); cursor:pointer; }
${PAGE} ol{ margin:0; padding:0; list-style:none; border-top:1px solid var(--border-default, rgba(255,255,255,.10)); }
${PAGE} li{ min-height:48px; border-bottom:1px solid var(--border-default, rgba(255,255,255,.10)); }
${PAGE} li[${ATTR_CGXUI_STATE}="type-head"]{ min-height:38px; display:flex; align-items:end; padding:18px 12px 8px; color:var(--text-secondary, rgba(255,255,255,.72)); border-bottom:0; }
${PAGE} li[${ATTR_CGXUI_STATE}="type-head"] span{ margin-left:8px; color:var(--text-tertiary, rgba(255,255,255,.48)); font-size:12px; }
${PAGE} li[${ATTR_CGXUI_STATE}="empty"]{ padding:18px 12px; color:var(--text-secondary, rgba(255,255,255,.68)); }
${PAGE} a,
${PAGE} button[${ATTR_CGXUI_STATE}="row"]{ display:flex; width:100%; min-height:48px; align-items:center; gap:12px; box-sizing:border-box; padding:10px 12px; color:inherit; text-decoration:none; border:0; background:transparent; text-align:left; cursor:pointer; }
${PAGE} a:hover,
${PAGE} button[${ATTR_CGXUI_STATE}="row"]:hover{ background:var(--interactive-bg-secondary-hover, rgba(255,255,255,.08)); }
${PAGE} [${ATTR_CGXUI_STATE}="dot"]{ width:12px; height:12px; border-radius:999px; flex:0 0 12px; box-shadow:0 0 0 1px rgba(255,255,255,.14) inset; }
${PAGE} [${ATTR_CGXUI_STATE}="row-title"]{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:14px; font-weight:500; }
${PAGE} [${ATTR_CGXUI_STATE}="row-sub"]{ min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary, rgba(255,255,255,.72)); font-size:13px; margin-top:3px; }
`;
  }

  function getShowCounts() {
    return readUi().showCounts !== false;
  }

  function getVisibleTypes() {
    return { ...readUi().visibleTypes };
  }

  function setShowCounts(value) {
    const ui = readUi();
    ui.showCounts = value !== false;
    writeUi(ui);
    rerenderLabelsSection('set-show-counts');
    return ui.showCounts;
  }

  function getOpenMode() {
    return normalizeOpenMode(readUi().openMode);
  }

  function setOpenMode(mode) {
    const ui = readUi();
    ui.openMode = normalizeOpenMode(mode);
    writeUi(ui);
    return ui.openMode;
  }

  function getInlinePreviewOnOpen() {
    return readUi().inlinePreview === true;
  }

  function setInlinePreviewOnOpen(value) {
    const ui = readUi();
    ui.inlinePreview = value === true;
    writeUi(ui);
    rerenderLabelsSection('set-inline-preview');
    return ui.inlinePreview;
  }

  function getTypeExpandMode() {
    return normalizeTypeExpandMode(readUi().typeExpandMode);
  }

  function setTypeExpandMode(mode) {
    const ui = readUi();
    ui.typeExpandMode = normalizeTypeExpandMode(mode);
    writeUi(ui);
    if (ui.typeExpandMode === 'all-open') setAllTypeExpanded(true);
    else if (ui.typeExpandMode === 'all-closed') setAllTypeExpanded(false);
    rerenderLabelsSection('set-type-expand-mode');
    return ui.typeExpandMode;
  }

  function getSectionExpanded() {
    return readUi().expanded !== false;
  }

  function setSectionExpanded(value) {
    const ui = readUi();
    ui.expanded = value !== false;
    writeUi(ui);
    if (ui.expanded) applyTypeExpandModeOnSectionOpen();
    rerenderLabelsSection('set-section-expanded');
    return ui.expanded;
  }

  function selfCheck() {
    const owner = core.getOwner?.('labels') || null;
    const service = core.getService?.('labels') || null;
    const sectionCount = D.querySelectorAll(utilSelScoped(UI_LABELS_ROOT)).length;
    const catalog = readCatalog();
    const bindings = readBindings();
    const snapshot = debugSnapshot();
    return {
      ok: !!owner && !!service,
      ownerRegistered: !!owner,
      serviceRegistered: !!service,
      routesRegistered: {
        labels: !!core.getRoute?.('labels'),
        label: !!core.getRoute?.('label'),
      },
      sectionCount,
      storageKeys: {
        catalog: KEY_LABEL_CATALOG_V1,
        bindings: KEY_LABEL_BINDINGS_V1,
        ui: KEY_LABEL_UI_V1,
        cfg: KEY_LABEL_CFG_V1,
      },
      typeCounts: Object.fromEntries(listTypeDefs().map((typeDef) => [typeDef.key, (catalog[typeDef.key] || []).length])),
      boundChatCount: Object.keys(bindings).length,
      sidebar: {
        hasProjectsH2: snapshot.hasProjectsH2,
        hasProjectsSection: snapshot.hasProjectsSection,
        labelsRoot: snapshot.labelsRoot,
        labelsRootCount: snapshot.labelsRootCount,
        folderRoot: snapshot.folderRoot,
        categoriesRoot: snapshot.categoriesRoot,
      },
      sidebarRenderCount: Number(state.sidebarRenderCount || 0),
      sidebarEnsureCount: Number(state.sidebarEnsureCount || 0),
      sidebarActiveSyncCount: Number(state.sidebarActiveSyncCount || 0),
      sidebarSkippedH2OMutations: Number(state.sidebarSkippedH2OMutations || 0),
      sidebarPlacementRepairCount: Number(state.sidebarPlacementRepairCount || 0),
      firstLabelsShellAt: Number(state.firstLabelsShellAt || 0),
      sidebarHydrationCount: Number(state.sidebarHydrationCount || 0),
      sidebarHydrationLastReason: String(state.sidebarHydrationLastReason || ''),
      sidebarShellMode: String(state.sidebarShellMode || ''),
      sidebarLastRenderReason: String(state.sidebarLastRenderReason || state.lastSidebarRenderReason || ''),
      sidebarLastEnsureReason: String(state.sidebarLastEnsureReason || state.lastSidebarEnsureReason || ''),
      sidebarLastActiveSyncReason: String(state.sidebarLastActiveSyncReason || state.lastSidebarActiveSyncReason || ''),
      sidebarLastRenderAt: Number(state.sidebarLastRenderAt || 0),
      sidebarLastEnsureAt: Number(state.sidebarLastEnsureAt || 0),
      sidebarLastActiveSyncAt: Number(state.sidebarLastActiveSyncAt || 0),
      lastSidebarRenderReason: String(state.lastSidebarRenderReason || ''),
      lastSidebarEnsureReason: String(state.lastSidebarEnsureReason || ''),
      lastSidebarActiveSyncReason: String(state.lastSidebarActiveSyncReason || ''),
      bootDiag: snapshot.bootDiag,
      diag: {
        steps: diag.steps.slice(-12),
        errors: diag.errors.slice(-8),
      },
    };
  }

  const owner = {
    phase: 'phase-1-labels-owner-sidebar',
    listTypes() { return listTypeDefs().map((row) => ({ ...row })); },
    listCatalog(type) { return listCatalog(type); },
    createLabel(type, label, opts = {}) { return createLabel(type, label, opts); },
    renameLabel(type, labelId, nextLabel) { return renameLabel(type, labelId, nextLabel); },
    deleteLabel(type, labelId, opts = {}) { return deleteLabel(type, labelId, opts); },
    getChatLabels(chatId) { return getChatLabels(chatId); },
    setChatLabel(chatId, type, labelId) { return setChatLabel(chatId, type, labelId); },
    addChatLabel(chatId, type, labelId) { return addChatLabel(chatId, type, labelId); },
    removeChatLabel(chatId, type, labelId) { return removeChatLabel(chatId, type, labelId); },
    clearChatLabels(chatId, type) { return clearChatLabels(chatId, type); },
    listChatsByLabel(type, labelId) { return listChatsByLabel(type, labelId); },
    getLabelCounts() { return getLabelCounts(); },
    buildLabelSummary(chatId) { return buildLabelSummary(chatId); },
    flattenChatLabels(chatId) { return flattenChatLabels(chatId); },
    getShowCounts() { return getShowCounts(); },
    getVisibleTypes() { return getVisibleTypes(); },
    isTypeVisible(type) { return isTypeVisible(type); },
    setTypeVisible(type, visible) { return setTypeVisible(type, visible); },
    setShowCounts(value) { return setShowCounts(value); },
    getOpenMode() { return getOpenMode(); },
    setOpenMode(mode) { return setOpenMode(mode); },
    getInlinePreviewOnOpen() { return getInlinePreviewOnOpen(); },
    setInlinePreviewOnOpen(value) { return setInlinePreviewOnOpen(value); },
    getTypeExpandMode() { return getTypeExpandMode(); },
    setTypeExpandMode(mode) { return setTypeExpandMode(mode); },
    getSectionExpanded() { return getSectionExpanded(); },
    setSectionExpanded(value) { return setSectionExpanded(value); },
    openLabelsViewer(opts = {}) { return openLabelsViewer(opts); },
    openLabelViewer(type, labelId, opts = {}) { return openLabelViewer(type, labelId, opts); },
    openAssignModal(chatId, opts = {}) { return openAssignModal(chatId, opts); },
    closeAssignModal() { return closeAssignModal(); },
    buildSection(projectsSection, existingSection = null, reason = 'api') { return buildLabelsSection(projectsSection, existingSection, reason); },
    ensureInjected(reason = 'api') { return ensureInjected(reason); },
    syncLabelSidebarActiveState(reason = 'api') { return syncLabelSidebarActiveState(reason); },
    projectChatMetadata(chatId, opts = {}) { return projectChatMetadata(chatId, opts); },
    debugSnapshot() { return debugSnapshot(); },
    selfCheck() { return selfCheck(); },
  };

  MOD.owner = owner;
  MOD.storage = MOD.storage || {};
  MOD.storage.readCatalog = readCatalog;
  MOD.storage.writeCatalog = writeCatalog;
  MOD.storage.readBindings = readBindings;
  MOD.storage.writeBindings = writeBindings;
  MOD.data = MOD.data || {};
  MOD.data.normalizeType = normalizeType;
  MOD.data.flattenChatLabels = flattenChatLabels;
  MOD.data.buildLabelSummary = buildLabelSummary;
  MOD.data.buildArchiveLabelAssignments = buildArchiveLabelAssignments;
  MOD.ui = MOD.ui || {};
  MOD.ui.ensureStyle = ensureStyle;
  MOD.ui.openAssignModal = openAssignModal;
  MOD.ui.closeAssignModal = closeAssignModal;
  MOD.ui.openLabelsViewer = openLabelsViewer;
  MOD.ui.openLabelViewer = openLabelViewer;
  MOD.debugSnapshot = debugSnapshot;

  Object.keys(owner).forEach((key) => {
    if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
  });

  function registerWithCore() {
    try {
      core.registerOwner?.('labels', owner, { replace: true });
      core.registerService?.('labels', owner, { replace: true });
      core.registerRoute?.('labels', async (route) => owner.openLabelsViewer({ fromRoute: true, baseHref: route?.baseHref }), { replace: true });
      core.registerRoute?.('label', async (route) => {
        const raw = String(route?.id || '');
        const [type, ...rest] = raw.split(':');
        const labelId = rest.join(':') || '';
        return owner.openLabelViewer(type, labelId, { fromRoute: true, baseHref: route?.baseHref });
      }, { replace: true });
      step('labels-owner-registered');
      try {
        H2O.LabelsBootDiag = {
          ...(H2O.LabelsBootDiag && typeof H2O.LabelsBootDiag === 'object' ? H2O.LabelsBootDiag : {}),
          ok: true,
          status: 'registered',
          owners: core.listOwners?.() || [],
          services: core.listServices?.() || [],
          ts: Date.now(),
        };
      } catch {}
    } catch (e) {
      err('register-labels-owner', e);
      try {
        H2O.LabelsBootDiag = {
          ok: false,
          status: 'register-failed',
          error: String(e?.message || e || ''),
          ts: Date.now(),
        };
      } catch {}
    }
  }

  function boot() {
    if (state.booted) return;
    state.booted = true;
    ensureStyle();
    readCatalog();
    readBindings();
    registerWithCore();
    hookMenuInjectionOnce();
    hookGlobalKeysOnce();
    scheduleEnsure('boot');
    const late = W.setTimeout(() => {
      state.clean.timers.delete(late);
      ensureInjected('late-boot');
    }, 900);
    state.clean.timers.add(late);
  }

  boot();
  }

  bootWhenLibraryCoreReady();
})();
