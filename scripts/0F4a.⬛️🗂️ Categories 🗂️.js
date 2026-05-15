// ==H2O Module==
// @h2o-id             0f4a.categories
// @name               0F4a.⬛️🗂️ Categories 🗂️
// @namespace          H2O.Premium.CGX.categories
// @author             HumamDev
// @version            1.7.0
// @revision           009
// @build              260424-000002
// @description        Categories: stable feature-owner module. Owns category catalog (via archiveBoot), grouping, appearance prefs, viewer/page. Consumes 0F3a rendering infra via categories-compat seam.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * 0F4a — Categories (feature-owner module, stable)
   *
   * OWNS:     Category catalog (sourced from H2O.archiveBoot.getCategoriesCatalog), workbench row
   *           grouping, category appearance prefs (icon/color), category viewer/page, category routes.
   * MUST NOT OWN: Sidebar row infra (owned by 0F3a), viewer shell construction (owned by 0F3a),
   *           page host / route commit logic (owned by 0F1a via 0F3a), folder data.
   * EXPOSES:  H2O.Categories, registers 'categories' owner+service and 'categories'+'category'
   *           routes in H2O.LibraryCore. 'categories' is registered as both owner and service —
   *           this is intentional so callers can find it via either core.getOwner() or core.getService().
   * SEAM:     Consumes 'categories-compat' service (provided by 0F3a) for all rendering infra:
   *           row builders, viewer shells, pop menus, page mounting, route commits, UI state I/O.
   *           Never reach into 0F3a directly — always go through core.getService('categories-compat').
   * DATA TRUTH: Category catalog and workbench row data live in H2O.archiveBoot (0D3a).
   *           Do NOT cache or replicate catalog truth here; always read live via getCatalogEntries().
   *
   * TEMPLATE NOTES: This is the canonical pattern for a stable feature-owner module:
   *   own your data+logic locally, consume shared infra via LibraryCore services, delegate
   *   rendering primitives to a compat seam rather than duplicating UI infrastructure.
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  const core = H2O.LibraryCore;
  if (!core) return;

  const MOD = (H2O.Categories = H2O.Categories || {});
  MOD.meta = MOD.meta || {
    owner: '0F4a.categories',
    label: 'Categories',
    phase: 'phase-6-categories-owner-stable',
  };

  const diag = (MOD.diag = MOD.diag || { t0: performance.now(), steps: [], errors: [], bufMax: 160, errMax: 40 });
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

  const KEY_FSECTION_STATE_UI_V1 = 'h2o:prm:cgx:fldrs:state:ui:v1';
  const KEY_LEG_UI = 'h2o:folders:ui:v1';
  const OWNER_SKID = 'flsc';
  const ATTR_CGXUI_OWNER = 'data-cgxui-owner';
  const ATTR_CGXUI_STATE = 'data-cgxui-state';
  const UI_FSECTION_ROOT = 'flsc-root';
  const UI_FSECTION_CATEGORIES_ROOT = 'flsc-categories-root';
  const CFG_CATEGORY_DEFAULT_ICON = 'hash';
  const CFG_CATEGORY_DEFAULT_COLOR = '#3B82F6';
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
  const FRAG_SVG_CATEGORY_PLACEHOLDER = FRAG_SVG_CATEGORY;
  // Phase 12 polish: lightweight Title-Case helper for category display.
  // Capitalizes each word; preserves intentional all-caps acronyms (UI, API,
  // MV3, H2O, …) by leaving any token that's already fully uppercase alone.
  function titleCaseCategoryName(rawName) {
    const s = String(rawName || '').trim();
    if (!s) return s;
    return s.split(/(\s+)/).map((part) => {
      if (!part || /^\s+$/.test(part)) return part;
      // Already all-uppercase token (e.g. "UI", "API", "MV3", "H2O") — keep.
      if (/^[A-Z0-9]+$/.test(part) && part.length <= 6) return part;
      // Camel-cased multi-cap token (e.g. "iPhone", "MacBook") — keep.
      if (/[A-Z]/.test(part) && /[a-z]/.test(part) && /^[A-Za-z]/.test(part)) return part;
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    }).join('');
  }

  const CFG_CATEGORY_ICON_OPTIONS = Object.freeze([
    { key: 'hash', label: 'Category', svg: FRAG_SVG_CATEGORY },
    { key: 'folder', label: 'Folder', svg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>` },
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
  };

  function safeListWorkbenchRows() {
    try {
      const fn = H2O.archiveBoot?.listWorkbenchRows;
      return typeof fn === 'function' ? fn() : [];
    } catch (e) {
      err('list-workbench-rows', e);
      return [];
    }
  }

  function normalizeHexColor(raw) {
    const value = String(raw || '').trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : '';
  }

  function normText(raw) {
    return String(raw || '').trim().replace(/\s+/g, ' ');
  }

  function normalizeCategoryStatus(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'deprecated' || value === 'retired') return value;
    return 'active';
  }

  function normalizeAliasList(raw) {
    const src = Array.isArray(raw) ? raw : [];
    const out = [];
    const seen = new Set();
    src.forEach((item) => {
      const value = normText(item).toLowerCase();
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push(value);
    });
    return out;
  }

  function getCatalogEntries() {
    let catalog = [];
    try {
      catalog = H2O.archiveBoot?.getCategoriesCatalog?.() || [];
    } catch (e) {
      err('get-categories-catalog', e);
      catalog = [];
    }
    return Array.isArray(catalog)
      ? catalog
          .map((raw) => {
            const src = (raw && typeof raw === 'object') ? raw : {};
            const id = String(src.id || '').trim();
            const name = normText(src.name || '');
            if (!id || !name) return null;
            return {
              id,
              name,
              color: normalizeHexColor(src.color || ''),
              custom: src.custom === true,
              status: normalizeCategoryStatus(src.status),
              sortOrder: Number.isFinite(Number(src.sortOrder)) ? Number(src.sortOrder) : 9999,
              replacementCategoryId: String(src.replacementCategoryId || '').trim(),
              aliases: normalizeAliasList(src.aliases),
            };
          })
          .filter((entry) => entry && entry.status !== 'retired')
      : [];
  }

  function buildCatalogIndex(catalogEntries) {
    const byId = new Map();
    const aliasToId = new Map();
    (Array.isArray(catalogEntries) ? catalogEntries : []).forEach((entry) => {
      if (!entry?.id) return;
      byId.set(entry.id, entry);
    });
    byId.forEach((entry) => {
      aliasToId.set(String(entry.id || '').trim().toLowerCase(), entry.id);
      (entry.aliases || []).forEach((alias) => {
        const key = String(alias || '').trim().toLowerCase();
        if (key && !aliasToId.has(key)) aliasToId.set(key, entry.id);
      });
    });
    return { byId, aliasToId };
  }

  function resolveCategoryId(raw, index, seen = new Set()) {
    const key = String(raw || '').trim();
    if (!key || !index?.aliasToId) return '';
    const resolved = index.aliasToId.get(key.toLowerCase()) || '';
    if (!resolved || seen.has(resolved)) return '';
    seen.add(resolved);
    const entry = index.byId.get(resolved);
    if (!entry) return '';
    if (entry.status === 'active') return entry.id;
    if (entry.status === 'deprecated' && entry.replacementCategoryId) {
      return resolveCategoryId(entry.replacementCategoryId, index, seen);
    }
    return '';
  }

  function normalizeRowCategoryIds(row, index) {
    const category = (row?.category && typeof row.category === 'object') ? row.category : {};
    const primaryRaw = category.primaryCategoryId || category.primary || row?.primaryCategoryId || row?.primary || '';
    const secondaryRaw = category.secondaryCategoryId || category.secondary || row?.secondaryCategoryId || row?.secondary || '';
    const ids = [];
    const primaryId = resolveCategoryId(primaryRaw, index);
    const secondaryId = resolveCategoryId(secondaryRaw, index);
    if (primaryId) ids.push(primaryId);
    if (secondaryId && secondaryId !== primaryId) ids.push(secondaryId);
    return ids;
  }

  function parseChatIdFromHref(href) {
    const match = String(href || '').match(/\/c\/([a-z0-9-]+)/i);
    return match ? match[1] : '';
  }

  function findChatHrefInSidebarByChatId(chatId) {
    const id = String(chatId || '').trim();
    if (!id || !W.document?.querySelectorAll) return '';
    for (const anchor of W.document.querySelectorAll('a[href]')) {
      const href = anchor.getAttribute('href') || '';
      if (parseChatIdFromHref(href) === id) return href;
    }
    return '';
  }

  function nativeHrefForRow(row) {
    const chatId = String(row?.chatId || '').trim();
    if (!chatId || /^imported[-_:]/i.test(chatId)) return '';
    const liveHref = findChatHrefInSidebarByChatId(chatId);
    if (liveHref) return liveHref;
    if (!/^[a-z0-9-]{8,}$/i.test(chatId)) return '';
    return `/c/${encodeURIComponent(chatId)}`;
  }

  function collectGroups(rowsRaw, catalogEntries) {
    const catalog = new Map((catalogEntries || []).map((entry) => [entry.id, entry]));
    const catalogIndex = buildCatalogIndex(catalogEntries);
    const groups = new Map();
    for (const row of Array.isArray(rowsRaw) ? rowsRaw : []) {
      if (row?.archived) continue;
      const href = nativeHrefForRow(row);
      if (!href) continue;
      const categoryIds = normalizeRowCategoryIds(row, catalogIndex);
      if (!categoryIds.length) continue;
      categoryIds.forEach((categoryId) => {
        const catalogEntry = catalog.get(categoryId);
        if (!catalogEntry) return;
        const current = groups.get(categoryId) || {
          id: categoryId,
          name: catalogEntry.name,
          color: catalogEntry.color || '',
          sortOrder: catalogEntry.sortOrder,
          rows: [],
        };
        const rowChatId = String(row?.chatId || '');
        const rowTitle = normText(row?.title || row?.excerpt || row?.chatId || 'Untitled chat').slice(0, 120);
        const rowUpdatedAt = String(row?.updatedAt || row?.createdAt || '');
        const duplicate = current.rows.some((item) => (
          (rowChatId && item.chatId === rowChatId)
          || (!rowChatId && item.href === href)
        ));
        if (!duplicate) {
          current.rows.push({
            href,
            chatId: rowChatId,
            title: rowTitle,
            updatedAt: rowUpdatedAt,
          });
        }
        groups.set(categoryId, current);
      });
    }
    for (const entry of catalog.values()) {
      // The Categories page must mirror the tag-link dropdown: every
      // non-retired catalog category is visible, even before chats are assigned.
      if (groups.has(entry.id)) continue;
      groups.set(entry.id, {
        id: entry.id,
        name: entry.name,
        color: entry.color || '',
        sortOrder: entry.sortOrder,
        rows: [],
      });
    }
    return [...groups.values()]
      .map((group) => ({
        ...group,
        rows: group.rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))),
      }))
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
  }

  async function loadGroupsDirect() {
    const catalog = getCatalogEntries();
    if (!catalog.length) return [];
    const rows = await safeListWorkbenchRows();
    return collectGroups(rows, catalog);
  }



  function normalizeCategoryIcon(raw) {
    const value = String(raw || '').trim().toLowerCase();
    return CFG_CATEGORY_ICON_OPTIONS.some((item) => item.key === value) ? value : CFG_CATEGORY_DEFAULT_ICON;
  }

  function normalizeCategoryPrefs(raw) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const out = {};
    Object.keys(src).forEach((categoryId) => {
      const id = String(categoryId || '').trim();
      const pref = src[categoryId] && typeof src[categoryId] === 'object' ? src[categoryId] : {};
      if (!id) return;
      const icon = normalizeCategoryIcon(pref.icon);
      const color = normalizeHexColor(pref.color);
      const row = {};
      if (icon !== CFG_CATEGORY_DEFAULT_ICON) row.icon = icon;
      if (color) row.color = color;
      if (Object.keys(row).length) out[id] = row;
    });
    return out;
  }

  function readUiStore() {
    let ui = storage.getJSON(KEY_FSECTION_STATE_UI_V1, null);
    if (!ui || typeof ui !== 'object') ui = storage.getJSON(KEY_LEG_UI, null);
    if (!ui || typeof ui !== 'object') ui = {};
    ui.categoryPrefs = normalizeCategoryPrefs(ui.categoryPrefs);
    return ui;
  }

  function writeUiStore(ui) {
    const next = (ui && typeof ui === 'object') ? { ...ui } : {};
    next.categoryPrefs = normalizeCategoryPrefs(next.categoryPrefs);
    storage.setJSON(KEY_FSECTION_STATE_UI_V1, next);
    storage.setJSON(KEY_LEG_UI, next);
    return next;
  }

  function rerenderOwnedSections() {
    try {
      W.document.querySelectorAll(`[${ATTR_CGXUI_OWNER}="${OWNER_SKID}"][data-cgxui]`).forEach((sec) => {
        const fn = sec?._cgxuiRender;
        if (typeof fn === 'function') {
          try { fn(); } catch (e) { err('rerender-owned-section', e); }
        }
      });
    } catch (e) {
      err('rerender-owned-sections', e);
    }
  }

  function getActivePageContext() {
    const compat = getCompat();
    const fn = compat && compat.getActivePageContext;
    if (typeof fn === 'function') {
      try { return fn(); } catch (e) { err('get-active-page-context', e); }
    }
    return null;
  }

  async function refreshActivePageForAppearance(kind, id) {
    const targetKind = String(kind || '');
    const targetId = String(id || '');
    if (targetKind !== 'category') {
      const compat = getCompat();
      const fn = compat && compat.refreshActivePageForAppearance;
      if (typeof fn === 'function') {
        try { return await fn(kind, id); } catch (e) { err('refresh-active-page-appearance-fallback', e); }
      }
      return null;
    }

    const page = getActivePageContext();
    if (!page?.connected) return null;

    const activeKind = String(page.kind || '');
    const activeId = String(page.id || '');
    if (activeKind !== 'category' && activeKind !== 'categories') return null;

    try {
      const groups = await loadGroupsDirect();
      if (activeKind === 'categories') return openCategoriesViewer(groups, { skipHistory: true });
      const group = groups.find((item) => String(item?.id || '') === activeId || String(item?.id || '') === targetId);
      if (group) return openCategoryViewer(group, { skipHistory: true });
    } catch (e) {
      err('refresh-active-page-appearance', e);
    }
    return null;
  }

  function getCategoryAppearance(group, ui = readUiStore()) {
    const id = String(group?.id || '').trim();
    const pref = id ? ui.categoryPrefs?.[id] : null;
    return {
      icon: normalizeCategoryIcon(pref?.icon || CFG_CATEGORY_DEFAULT_ICON),
      color: normalizeHexColor(pref?.color || group?.color || CFG_CATEGORY_DEFAULT_COLOR) || CFG_CATEGORY_DEFAULT_COLOR,
      // Phase 12 polish: tells the row renderer whether the user has explicitly
      // chosen an icon. If false, the row should render the default category
      // panels placeholder instead of treating the persisted default as explicit.
      iconExplicit: !!pref?.icon,
      colorExplicit: !!(pref?.color || group?.color),
    };
  }

  // Resolve the SVG to render for a row's icon position. When the user hasn't
  // chosen an icon yet, return the default category panels placeholder;
  // otherwise return the chosen icon's SVG.
  function categoryIconSvgForAppearance(appearance) {
    if (!appearance?.iconExplicit) return FRAG_SVG_CATEGORY_PLACEHOLDER;
    return categoryIconSvg(appearance.icon);
  }

  function setCategoryAppearance(categoryId, patch = {}) {
    const id = String(categoryId || '').trim();
    if (!id) return null;
    const ui = readUiStore();
    const current = ui.categoryPrefs[id] || {};
    const next = { ...current };
    if (Object.prototype.hasOwnProperty.call(patch, 'icon')) {
      const icon = normalizeCategoryIcon(patch.icon);
      if (icon === CFG_CATEGORY_DEFAULT_ICON) delete next.icon;
      else next.icon = icon;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'color')) {
      const color = normalizeHexColor(patch.color);
      if (color) next.color = color;
      else delete next.color;
    }
    if (Object.keys(next).length) ui.categoryPrefs[id] = next;
    else delete ui.categoryPrefs[id];
    writeUiStore(ui);
    rerenderOwnedSections();
    refreshActivePageForAppearance('category', id);
    return getCategoryAppearance({ id }, ui);
  }

  function iconOptionForKey(key) {
    return CFG_CATEGORY_ICON_OPTIONS.find((item) => item.key === key) || CFG_CATEGORY_ICON_OPTIONS[0];
  }

  function categoryIconSvg(key) {
    return iconOptionForKey(normalizeCategoryIcon(key))?.svg || FRAG_SVG_CATEGORY;
  }


  function makePanelIcon(svg, color, opts = {}) {
    const icon = W.document.createElement(typeof opts.onClick === 'function' ? 'button' : 'span');
    if (icon.tagName === 'BUTTON') {
      icon.type = 'button';
      icon.setAttribute('aria-label', opts.label || 'Edit appearance');
      icon.title = opts.label || 'Edit appearance';
      icon.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { opts.onClick?.(icon); } catch (error) { err('panel-icon-click', error); }
      };
    }
    icon.setAttribute(ATTR_CGXUI_STATE, 'panel-icon');
    icon.style.color = normalizeHexColor(color) || 'currentColor';
    icon.innerHTML = svg || FRAG_SVG_CATEGORY;
    return icon;
  }

  function appendPanelCategoryRow(list, group) {
    if (!list || !group) return null;
    const appearance = getCategoryAppearance(group);
    const btn = W.document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI_STATE, 'row');
    btn.onclick = () => owner.openByMode(group);

    btn.appendChild(makePanelIcon(categoryIconSvgForAppearance(appearance), appearance.color));

    const body = W.document.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = W.document.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    title.textContent = group.name || group.id || 'Category';
    body.appendChild(title);

    const sub = W.document.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = `${Array.isArray(group.rows) ? group.rows.length : 0} chats`;
    body.appendChild(sub);

    btn.appendChild(body);
    list.appendChild(btn);
    return btn;
  }

  // Phase 13 polish: per-row tag bubbles for the Categories page.
  //
  // Collects unique tags across every chat in the category, tag seeds
  // remembered by the category candidate pool, and real auto-pool tags whose
  // phrase matches the category name/aliases. It de-duplicates by tag id, sorts
  // by recency (most-recently-used first), then renders pill-shaped bubbles
  // inline on the row between the title block and the right-side three-dots menu.
  //
  // Overflow rule: when the strip's available width can't fit all bubbles,
  // the most-recent bubbles win — older ones are hidden and an "+N" chip is
  // appended at the end. Measurement happens in rAF after the row is in
  // the DOM so we have real widths.
  //
  // The strip is non-interactive (visual only). Clicks bubble up to the row
  // which still opens the category viewer. We can wire per-bubble navigation
  // in a later pass if needed.
  let _catRowCandidatePoolPromise = null;

  function normalizeTagKeyForCategoryRow(raw) {
    return String(raw?.id || raw?.label || raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function tagColorForCategoryRow(tagIdOrLabel) {
    const palette = ['#3B82F6', '#22C55E', '#A855F7', '#F472B6', '#FF914D', '#FFD54F', '#7DD3FC', '#14B8A6', '#F97316', '#8B5CF6', '#84CC16', '#EF4444'];
    const id = String(tagIdOrLabel || '');
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) hash = ((hash << 5) - hash) + id.charCodeAt(i);
    return palette[Math.abs(hash) % palette.length] || '#7DD3FC';
  }

  function timestampMsForCategoryRow(raw) {
    if (raw == null || raw === '') return 0;
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(String(raw || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function mergeCategoryRowTag(byId, raw = {}) {
    const id = normalizeTagKeyForCategoryRow(raw.id || raw.label || raw.phrase);
    const label = normText(raw.label || raw.phrase || raw.id || '');
    if (!id || !label) return;
    const lastSeen = Math.max(
      timestampMsForCategoryRow(raw.lastSeen),
      timestampMsForCategoryRow(raw.updatedAt),
      timestampMsForCategoryRow(raw.updatedAtIso),
      timestampMsForCategoryRow(raw.createdAt)
    );
    const totalUsage = Math.max(1, Number(raw.totalUsage || raw.usageCount || raw.totalCount || raw.count || raw.chatCount || 0) || 0);
    const color = normalizeHexColor(raw.color || '') || tagColorForCategoryRow(id);
    const existing = byId.get(id);
    if (existing) {
      existing.lastSeen = Math.max(existing.lastSeen, lastSeen);
      existing.totalUsage += totalUsage;
      if (!existing.color) existing.color = color;
      return;
    }
    byId.set(id, { id, label, color, lastSeen, totalUsage });
  }

  function buildAutoPoolPhraseLookup() {
    const out = new Map();
    const pool = safeReadTagAutoPool();
    Object.entries(pool?.phrases || {}).forEach(([key, entry]) => {
      if (!entry || entry.blocked || entry.status === 'rejected') return;
      const normalizedKey = normalizeTagKeyForCategoryRow(key);
      const phraseKey = normalizeTagKeyForCategoryRow(entry.phrase || '');
      if (normalizedKey) out.set(normalizedKey, entry);
      if (phraseKey) out.set(phraseKey, entry);
    });
    return out;
  }

  function categoryCandidateMatchesGroup(candidate, group) {
    const groupId = String(group?.id || '').trim();
    const groupNameKey = normalizeCategoryNameKey(group?.name || group?.id || '');
    if (!candidate || !groupId) return false;
    if (String(candidate.createdCategoryId || '') === groupId) return true;
    if (String(candidate.mergedIntoCategoryId || '') === groupId) return true;
    return !!groupNameKey && normalizeCategoryNameKey(candidate.name || '') === groupNameKey;
  }

  function collectCandidateSeedTagsForCategoryRow(group) {
    const candidates = Array.isArray(_catPoolCache?.candidates) ? _catPoolCache.candidates : [];
    if (!candidates.length) return [];
    const autoPoolByKey = buildAutoPoolPhraseLookup();
    const out = [];
    candidates
      .filter((candidate) => String(candidate?.status || 'candidate') !== 'rejected')
      .filter((candidate) => categoryCandidateMatchesGroup(candidate, group))
      .forEach((candidate) => {
        const seedTags = Array.isArray(candidate?.sourceSignals?.seedTags) ? candidate.sourceSignals.seedTags : [];
        seedTags.forEach((phrase) => {
          const key = normalizeTagKeyForCategoryRow(phrase);
          const auto = autoPoolByKey.get(key) || null;
          out.push({
            id: key || phrase,
            label: String(auto?.phrase || phrase || '').trim(),
            lastSeen: auto?.lastSeen || candidate.decidedAt || candidate.createdAt,
            totalUsage: auto?.totalCount || auto?.chatCount || 1,
            color: tagColorForCategoryRow(key || phrase),
          });
        });
      });
    return out;
  }

  function getCategoryAliasKeysForRow(group) {
    const keys = new Set();
    const add = (value) => {
      const key = normalizeTagKeyForCategoryRow(value);
      if (key) keys.add(key);
    };
    add(group?.name || '');
    const catalog = getCatalogEntries();
    const entry = catalog.find((item) => String(item?.id || '') === String(group?.id || ''))
      || catalog.find((item) => normalizeCategoryNameKey(item?.name || '') === normalizeCategoryNameKey(group?.name || ''));
    if (entry) {
      add(entry.name);
      (entry.aliases || []).forEach(add);
    }
    return keys;
  }

  function collectAutoPoolAliasTagsForCategoryRow(group) {
    const autoPoolByKey = buildAutoPoolPhraseLookup();
    if (!autoPoolByKey.size) return [];
    const out = [];
    getCategoryAliasKeysForRow(group).forEach((key) => {
      const auto = autoPoolByKey.get(key) || null;
      if (!auto) return;
      out.push({
        id: key,
        label: String(auto.phrase || key || '').trim(),
        lastSeen: auto.lastSeen,
        totalUsage: auto.totalCount || auto.chatCount || 1,
        color: tagColorForCategoryRow(key),
      });
    });
    return out;
  }

  function collectExplicitLinkedTagsForCategoryRow(group) {
    const categoryId = String(group?.id || '').trim();
    if (!categoryId) return [];
    const tagsApi = getTagsApi();
    if (typeof tagsApi?.getTagsForCategory !== 'function') return [];
    try {
      const rows = tagsApi.getTagsForCategory(categoryId) || [];
      return (Array.isArray(rows) ? rows : []).map((tag) => ({
        id: tag?.id || tag?.key || tag?.label,
        label: tag?.label || tag?.id || tag?.key || '',
        color: tag?.color || tagColorForCategoryRow(tag?.id || tag?.label || ''),
        lastSeen: tag?.lastSeen || tag?.updatedAt || 0,
        totalUsage: tag?.totalUsage || tag?.usageCount || 1,
      }));
    } catch (e) {
      err('cat-row-bubbles:explicit-links', e);
      return [];
    }
  }

  function collectGroupTagsForRow(group) {
    const byId = new Map();
    const tagsApi = W.H2O?.Tags;
    const chatRows = Array.isArray(group?.rows) ? group.rows : [];
    if (tagsApi && typeof tagsApi.getChatTagCatalog === 'function') {
      for (const r of chatRows) {
        const chatId = String(r?.chatId || '').trim();
        if (!chatId) continue;
        let tags = [];
        try { tags = tagsApi.getChatTagCatalog(chatId) || []; } catch (_e) { tags = []; }
        for (const tag of tags) {
          mergeCategoryRowTag(byId, {
            ...tag,
            lastSeen: tag?.lastSeen || tag?.updatedAt || r?.updatedAt,
          });
        }
      }
    }
    collectExplicitLinkedTagsForCategoryRow(group).forEach((tag) => mergeCategoryRowTag(byId, tag));
    collectCandidateSeedTagsForCategoryRow(group).forEach((tag) => mergeCategoryRowTag(byId, tag));
    collectAutoPoolAliasTagsForCategoryRow(group).forEach((tag) => mergeCategoryRowTag(byId, tag));
    if (!byId.size) return [];
    return Array.from(byId.values()).sort((a, b) => (
      (b.lastSeen - a.lastSeen) || (b.totalUsage - a.totalUsage) || a.label.localeCompare(b.label)
    ));
  }

  function makeCategoryRowTagBubble(tag) {
    const pill = W.document.createElement('span');
    pill.setAttribute(ATTR_CGXUI_STATE, 'cat-row-tag-bubble');
    pill.textContent = tag.label;
    const color = /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : '#7DD3FC';
    pill.title = `${tag.label} · ${tag.totalUsage} occurrence${tag.totalUsage === 1 ? '' : 's'}`;
    pill.style.display = 'inline-flex';
    pill.style.alignItems = 'center';
    pill.style.padding = '2px 8px';
    pill.style.borderRadius = '999px';
    pill.style.fontSize = '11px';
    pill.style.lineHeight = '15px';
    pill.style.fontWeight = '500';
    pill.style.flex = '0 0 auto';
    pill.style.maxWidth = '140px';
    pill.style.whiteSpace = 'nowrap';
    pill.style.overflow = 'hidden';
    pill.style.textOverflow = 'ellipsis';
    pill.style.background = `${color}22`;
    pill.style.border = `1px solid ${color}55`;
    pill.style.color = `${color}EE`;
    pill.style.pointerEvents = 'none'; // visual only — let the row's click win
    return pill;
  }

  function makeCategoryRowOverflowChip(count) {
    const chip = W.document.createElement('span');
    chip.setAttribute(ATTR_CGXUI_STATE, 'cat-row-tag-overflow');
    chip.textContent = `+${count}`;
    chip.title = `${count} more tag${count === 1 ? '' : 's'}`;
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.padding = '2px 7px';
    chip.style.borderRadius = '999px';
    chip.style.fontSize = '11px';
    chip.style.lineHeight = '15px';
    chip.style.fontWeight = '600';
    chip.style.flex = '0 0 auto';
    chip.style.background = 'rgba(255,255,255,0.06)';
    chip.style.border = '1px solid rgba(255,255,255,0.10)';
    chip.style.color = 'rgba(255,255,255,0.72)';
    chip.style.pointerEvents = 'none';
    return chip;
  }

  function renderCategoryRowTagBubbles(li, group) {
    if (!li || !group) return;
    li.querySelector?.(`[${ATTR_CGXUI_STATE}="cat-row-tag-strip"]`)?.remove?.();
    const tags = collectGroupTagsForRow(group);
    if (!tags.length) return;
    const strip = W.document.createElement('div');
    strip.setAttribute(ATTR_CGXUI_STATE, 'cat-row-tag-strip');
    strip.style.position = 'absolute';
    // Sit between the body text and the right-side three-dots button (40px reserved).
    strip.style.right = '44px';
    strip.style.top = '50%';
    strip.style.transform = 'translateY(-50%)';
    strip.style.display = 'flex';
    strip.style.flexDirection = 'row';
    strip.style.gap = '5px';
    strip.style.alignItems = 'center';
    strip.style.maxWidth = '60%';                 // never crowd the title body
    strip.style.minWidth = '0';
    strip.style.overflow = 'hidden';
    strip.style.justifyContent = 'flex-end';
    strip.style.pointerEvents = 'none';
    // Append all bubbles in recent-first order, then measure and hide overflow.
    const bubbleEls = tags.map((t) => makeCategoryRowTagBubble(t));
    bubbleEls.forEach((b) => strip.appendChild(b));
    li.appendChild(strip);
    // Defer measurement so layout has computed real widths.
    requestAnimationFrame(() => {
      try {
        const stripWidth = strip.clientWidth;
        if (!stripWidth || !bubbleEls.length) return;
        // Reserve ~36 px for the +N overflow chip.
        const chipReserve = 36;
        let used = 0;
        let cutAt = -1;
        for (let i = 0; i < bubbleEls.length; i += 1) {
          const w = bubbleEls[i].offsetWidth + (i === 0 ? 0 : 5); // gap=5
          // If this bubble would push us over the budget (leaving room for chip
          // when there ARE more after it), hide from here onward.
          const willOverflow = (used + w) > (stripWidth - (i < bubbleEls.length - 1 ? chipReserve : 0));
          if (willOverflow) { cutAt = i; break; }
          used += w;
        }
        if (cutAt >= 0) {
          const hidden = bubbleEls.length - cutAt;
          for (let i = cutAt; i < bubbleEls.length; i += 1) {
            try { bubbleEls[i].remove(); } catch (_e) {}
          }
          if (hidden > 0) strip.appendChild(makeCategoryRowOverflowChip(hidden));
        }
      } catch (e) { err('cat-row-bubbles:measure', e); }
    });
  }

  function ensureCategoryRowCandidatePoolLoaded() {
    if (_catPoolCache) return null;
    if (_catRowCandidatePoolPromise) return _catRowCandidatePoolPromise;
    _catRowCandidatePoolPromise = Promise.resolve(loadCategoryCandidatePool())
      .catch((e) => { err('cat-row-bubbles:load-candidate-pool', e); return null; })
      .finally(() => { _catRowCandidatePoolPromise = null; });
    return _catRowCandidatePoolPromise;
  }

  function enrichCategoryRowWithTagBubbles(li, group) {
    renderCategoryRowTagBubbles(li, group);
    const pending = ensureCategoryRowCandidatePoolLoaded();
    if (pending) {
      pending.then(() => {
        if (li?.isConnected) renderCategoryRowTagBubbles(li, group);
      }).catch((e) => err('cat-row-bubbles:async-render', e));
    }
  }

  function bindTagCategoryLinkRefresh() {
    if (MOD._tagCategoryLinkRefreshBound) return;
    MOD._tagCategoryLinkRefreshBound = true;
    const onLinksChanged = () => {
      W.setTimeout(() => {
        refreshActivePageForAppearance('category', '').catch((e) => err('tag-category-links:refresh-page', e));
      }, 0);
    };
    try {
      W.addEventListener('evt:h2o:tags:category-links-changed', onLinksChanged, true);
      W.addEventListener('h2o:tags:category-links-changed', onLinksChanged, true);
    } catch (e) {
      err('tag-category-links:bind-refresh', e);
    }
  }

  function appendInShellCategoryRow(list, group) {
    if (!list || !group) return null;
    const appearance = getCategoryAppearance(group);
    const li = W.document.createElement('li');
    // Phase 12 polish: tighter row (was min-h-16 / p-3 = 64px+ tall, now ~44px),
    // explicit relative positioning so the absolute three-dots button can sit
    // on top, and a `data-h2o-cat-row` marker for future style hooks.
    li.className = 'group/project-item hover:bg-token-interactive-bg-secondary-hover active:bg-token-interactive-bg-secondary-press relative flex cursor-pointer items-center px-3 py-2 text-sm select-none';
    li.setAttribute('data-h2o-cat-row', '1');
    li.style.minHeight = '44px';

    const btn = W.document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI_STATE, 'category-button');
    btn.onclick = () => owner.openViewer(group);

    const icon = makePanelIcon(categoryIconSvgForAppearance(appearance), appearance.color);
    icon.style.width = '20px';
    icon.style.height = '20px';
    icon.style.minWidth = '20px';
    icon.style.display = 'inline-flex';
    icon.style.alignItems = 'center';
    icon.style.justifyContent = 'center';
    icon.querySelector?.('svg')?.setAttribute('width', '20');
    icon.querySelector?.('svg')?.setAttribute('height', '20');
    btn.appendChild(icon);

    const body = W.document.createElement('div');
    body.style.minWidth = '0';
    body.style.flex = '1 1 auto';

    const title = W.document.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'row-title');
    // Phase 12 polish: render every category name title-cased so user-typed
    // names like "first" / "new" / "cars" all line up with seeded names like
    // "Technology" / "Engineering" / "Health". Original raw name stays in the
    // catalog; this is presentation-only.
    title.textContent = titleCaseCategoryName(group.name || group.id || 'Category');
    body.appendChild(title);

    const sub = W.document.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = `${Array.isArray(group.rows) ? group.rows.length : 0} chats`;
    body.appendChild(sub);

    btn.appendChild(body);
    li.appendChild(btn);

    // Phase 12 polish: per-row three-dots menu, mirrors the sidebar action
    // pattern so Categories page interactions match the rest of Library.
    // Opens the category appearance / rename / delete popup. Stops bubbling
    // so the row's main click (open viewer) doesn't fire too.
    const moreBtn = W.document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.setAttribute(ATTR_CGXUI_STATE, 'row-more');
    moreBtn.setAttribute('aria-label', `Category actions for ${titleCaseCategoryName(group.name || group.id || 'Category')}`);
    moreBtn.title = 'Category actions';
    moreBtn.style.position = 'absolute';
    moreBtn.style.right = '8px';
    moreBtn.style.top = '50%';
    moreBtn.style.transform = 'translateY(-50%)';
    moreBtn.style.width = '28px';
    moreBtn.style.height = '28px';
    moreBtn.style.borderRadius = '8px';
    moreBtn.style.display = 'inline-flex';
    moreBtn.style.alignItems = 'center';
    moreBtn.style.justifyContent = 'center';
    moreBtn.style.opacity = '0.65';
    moreBtn.style.cursor = 'pointer';
    moreBtn.style.background = 'transparent';
    moreBtn.style.border = '1px solid transparent';
    moreBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="6" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18" cy="12" r="1.6" fill="currentColor"/></svg>';
    moreBtn.addEventListener('mouseenter', () => { moreBtn.style.opacity = '1'; moreBtn.style.background = 'rgba(255,255,255,0.06)'; moreBtn.style.borderColor = 'rgba(255,255,255,0.10)'; });
    moreBtn.addEventListener('mouseleave', () => { moreBtn.style.opacity = '0.65'; moreBtn.style.background = 'transparent'; moreBtn.style.borderColor = 'transparent'; });
    moreBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCategoryAppearanceEditor(moreBtn, group, () => {
        // Re-render from the live catalog so renames / deletes stay in sync.
        refreshActivePageForAppearance('category', group.id).catch((e2) => err('category-row-more:refresh', e2));
      });
    };
    li.appendChild(moreBtn);

    // Reserve right-side space inside the main button so its content doesn't
    // collide with the three-dots affordance.
    btn.style.paddingRight = '40px';

    list.appendChild(li);

    // Phase 13: enrich with inline tag bubbles. Non-blocking — runs after the
    // row is in the DOM so layout/measurement is real. Rows can still show
    // seed-tag bubbles before any chats are assigned to the category.
    try { enrichCategoryRowWithTagBubbles(li, group); } catch (e) { err('cat-row-enrich-tags', e); }

    return li;
  }

  function makeCategoryTagLinkPicker(group, afterChange = null) {
    const categoryId = String(group?.id || '').trim();
    const section = W.document.createElement('div');
    section.setAttribute(ATTR_CGXUI_STATE, 'picker-section');
    section.style.minWidth = '0';
    section.style.width = '100%';
    section.style.maxWidth = '320px';

    const title = W.document.createElement('div');
    title.setAttribute(ATTR_CGXUI_STATE, 'picker-label');
    title.textContent = 'Tags';
    section.appendChild(title);

    const form = W.document.createElement('form');
    form.style.display = 'flex';
    form.style.alignItems = 'center';
    form.style.gap = '6px';
    form.style.marginBottom = '7px';

    const input = W.document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Tag name...';
    input.spellcheck = false;
    input.style.flex = '1 1 auto';
    input.style.minWidth = '0';
    input.style.height = '28px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid rgba(255,255,255,.14)';
    input.style.background = 'rgba(255,255,255,.055)';
    input.style.color = 'rgba(255,255,255,.92)';
    input.style.padding = '0 8px';
    input.style.fontSize = '12px';
    input.style.outline = 'none';

    const addBtn = W.document.createElement('button');
    addBtn.type = 'submit';
    addBtn.textContent = '+';
    addBtn.title = 'Create and link tag';
    addBtn.style.height = '28px';
    addBtn.style.width = '34px';
    addBtn.style.padding = '0';
    addBtn.style.borderRadius = '8px';
    addBtn.style.border = '1px solid rgba(125,211,252,.34)';
    addBtn.style.background = 'rgba(125,211,252,.14)';
    addBtn.style.color = 'rgba(235,250,255,.94)';
    addBtn.style.fontWeight = '700';
    addBtn.style.cursor = 'pointer';
    addBtn.style.whiteSpace = 'nowrap';

    form.appendChild(input);
    form.appendChild(addBtn);
    section.appendChild(form);

    const summary = W.document.createElement('div');
    summary.style.fontSize = '11px';
    summary.style.color = 'rgba(255,255,255,.52)';
    summary.style.marginBottom = '5px';
    section.appendChild(summary);

    const list = W.document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '2px';
    list.style.maxHeight = '118px';
    list.style.overflow = 'auto';
    list.style.padding = '4px';
    list.style.border = '1px solid rgba(255,255,255,.09)';
    list.style.borderRadius = '9px';
    list.style.background = 'rgba(255,255,255,.035)';
    section.appendChild(list);

    const tagsApi = getTagsApi();
    if (!categoryId || !tagsApi) {
      list.textContent = 'Tags are not available yet.';
      return section;
    }

    const byId = new Map();
    const linkedIds = new Set();
    const mergeTagOption = (tagLike) => {
      const rawLabel = typeof tagLike === 'string'
        ? tagLike
        : (tagLike?.label || tagLike?.name || tagLike?.id || tagLike?.key || '');
      const id = normalizeTagKeyForCategoryRow(tagLike?.id || tagLike?.key || rawLabel);
      const label = normText(rawLabel || id);
      if (!id || !label) return null;
      const current = byId.get(id) || {};
      const color = normalizeHexColor(tagLike?.color || current.color || '') || tagColorForCategoryRow(id);
      const usageCount = Math.max(Number(current.usageCount || 0) || 0, Number(tagLike?.usageCount || tagLike?.count || 0) || 0);
      const next = { id, label: current.label || label, color, usageCount };
      byId.set(id, next);
      return next;
    };

    const readLinkedTags = () => {
      linkedIds.clear();
      try {
        const linked = typeof tagsApi.getTagsForCategory === 'function'
          ? tagsApi.getTagsForCategory(categoryId)
          : [];
        (Array.isArray(linked) ? linked : []).forEach((tag) => {
          const option = mergeTagOption(tag);
          if (option?.id) linkedIds.add(option.id);
        });
      } catch (e) {
        err('category-tag-picker:read-linked', e);
      }
    };

    const updateSummary = () => {
      const count = linkedIds.size;
      summary.textContent = `${count} tag${count === 1 ? '' : 's'} linked to ${group?.name || 'this category'}`;
    };

    const refreshPage = () => {
      refreshActivePageForAppearance('category', categoryId).catch((e) => err('category-tag-picker:refresh-page', e));
    };

    const setLinked = (tag, checked) => {
      if (!tag?.id) return;
      try {
        if (typeof tagsApi.toggleTagCategoryLink === 'function') {
          tagsApi.toggleTagCategoryLink(tag, categoryId, checked);
        } else if (typeof tagsApi.setTagCategoryIds === 'function' && typeof tagsApi.getTagCategoryIds === 'function') {
          const next = new Set(tagsApi.getTagCategoryIds(tag) || []);
          if (checked) next.add(categoryId);
          else next.delete(categoryId);
          tagsApi.setTagCategoryIds(tag, Array.from(next));
        }
        if (checked) linkedIds.add(tag.id);
        else linkedIds.delete(tag.id);
        updateSummary();
        refreshPage();
      } catch (e) {
        err('category-tag-picker:set-linked', e);
      }
    };

    const renderRows = () => {
      list.innerHTML = '';
      const rows = Array.from(byId.values()).sort((a, b) => (
        Number(linkedIds.has(b.id)) - Number(linkedIds.has(a.id))
        || String(a.label || '').localeCompare(String(b.label || ''))
      ));
      if (!rows.length) {
        const empty = W.document.createElement('div');
        empty.textContent = 'No tags yet. Create one above.';
        empty.style.padding = '8px 6px';
        empty.style.color = 'rgba(255,255,255,.48)';
        empty.style.fontSize = '12px';
        list.appendChild(empty);
        updateSummary();
        return;
      }
      rows.forEach((tag) => {
        const row = W.document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '7px';
        row.style.padding = '4px 5px';
        row.style.borderRadius = '7px';
        row.style.cursor = 'pointer';
        row.style.color = 'rgba(255,255,255,.82)';
        row.style.fontSize = '11px';

        const cb = W.document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = linkedIds.has(tag.id);
        cb.style.margin = '0';
        cb.style.width = '13px';
        cb.style.height = '13px';
        cb.onchange = () => setLinked(tag, cb.checked);
        row.appendChild(cb);

        const dot = W.document.createElement('span');
        dot.style.width = '8px';
        dot.style.height = '8px';
        dot.style.borderRadius = '999px';
        dot.style.background = tag.color || tagColorForCategoryRow(tag.id);
        dot.style.flex = '0 0 auto';
        row.appendChild(dot);

        const text = W.document.createElement('span');
        text.textContent = tag.label;
        text.style.flex = '1 1 auto';
        text.style.minWidth = '0';
        text.style.overflow = 'hidden';
        text.style.textOverflow = 'ellipsis';
        text.style.whiteSpace = 'nowrap';
        row.appendChild(text);

        if (tag.usageCount > 0) {
          const count = W.document.createElement('span');
          count.textContent = String(tag.usageCount);
          count.style.fontSize = '10px';
          count.style.opacity = '.55';
          row.appendChild(count);
        }

        list.appendChild(row);
      });
      updateSummary();
    };

    readLinkedTags();
    try { (tagsApi.listPoolTags?.() || []).forEach(mergeTagOption); } catch (e) { err('category-tag-picker:list-pool', e); }
    renderRows();

    if (typeof tagsApi.listAllChatTags === 'function') {
      Promise.resolve(tagsApi.listAllChatTags({ refreshCurrent: false }))
        .then((tags) => {
          if (!section.isConnected) return;
          (Array.isArray(tags) ? tags : []).forEach(mergeTagOption);
          readLinkedTags();
          renderRows();
        })
        .catch((e) => err('category-tag-picker:list-all', e));
    }

    form.onsubmit = (e) => {
      e.preventDefault();
      const label = normText(input.value || '');
      if (!label) return;
      let tag = null;
      try {
        tag = typeof tagsApi.createPoolTag === 'function'
          ? tagsApi.createPoolTag(label, { addToCurrentChatPool: false })
          : mergeTagOption(label);
      } catch (e2) {
        err('category-tag-picker:create-tag', e2);
      }
      const option = mergeTagOption(tag || label);
      if (!option) return;
      input.value = '';
      setLinked(option, true);
      renderRows();
    };

    return section;
  }

  function openCategoryAppearanceEditor(anchorEl, group, afterChange = null) {
    if (!anchorEl || !group) return null;
    const compat = getCompat();
    const openFolderPop = compat && compat.openFolderPop;
    if (typeof openFolderPop !== 'function') return null;
    const appearance = getCategoryAppearance(group);
    // Phase 12 polish: Rename and Delete are now available for every category.
    // - Rename: catalog merges by id, so renaming a default seeded category
    //   persists across reads.
    // - Delete: custom categories are physically removed; default seeded ones
    //   get a retired-status tombstone written into the stored catalog so the
    //   default-seed merge keeps them hidden on subsequent reads.
    const isCustom = group?.custom === true;
    const items = [
      { type: 'title', label: 'Category appearance' },
      {
        type: 'color-grid',
        label: 'Color',
        current: normalizeHexColor(appearance.color),
        options: [
          { key: 'default', label: 'Default', color: '', value: '' },
          { key: 'blue', label: 'Blue', color: '#3B82F6', value: '#3B82F6' },
          { key: 'red', label: 'Red', color: '#FF4C4C', value: '#FF4C4C' },
          { key: 'green', label: 'Green', color: '#22C55E', value: '#22C55E' },
          { key: 'gold', label: 'Gold', color: '#FFD54F', value: '#FFD54F' },
          { key: 'sky', label: 'Sky', color: '#7DD3FC', value: '#7DD3FC' },
          { key: 'pink', label: 'Pink', color: '#F472B6', value: '#F472B6' },
          { key: 'purple', label: 'Purple', color: '#A855F7', value: '#A855F7' },
          { key: 'orange', label: 'Orange', color: '#FF914D', value: '#FF914D' },
        ],
        onSelect: (color) => {
          setCategoryAppearance(group.id, { color });
          try { afterChange?.(); } catch (e) { err('after-change-color', e); }
        },
      },
      {
        type: 'icon-grid',
        label: 'Icon',
        current: normalizeCategoryIcon(appearance.icon),
        options: CFG_CATEGORY_ICON_OPTIONS,
        onSelect: (icon) => {
          setCategoryAppearance(group.id, { icon });
          try { afterChange?.(); } catch (e) { err('after-change-icon', e); }
        },
      },
    ];

    items.push('sep');
    items.push({
      type: 'custom',
      render: () => makeCategoryTagLinkPicker(group, afterChange),
    });

    // Rename — available for every category.
    items.push('sep');
    items.push({
      label: 'Rename',
      iconSvg: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m4 20 4.2-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm11-13 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      onClick: async () => {
        const opener = compat?.openNameModal;
        if (typeof opener !== 'function') return;
        const next = await opener({
          title: 'Rename category',
          placeholder: 'Category name',
          initialValue: String(group.name || ''),
          confirmText: 'Save',
        });
        const trimmed = String(next || '').trim();
        if (!trimmed || trimmed === group.name) return;
        if (typeof H2O.archiveBoot?.renameCategory !== 'function') return;
        const updated = H2O.archiveBoot.renameCategory(group.id, trimmed);
        if (!updated) return;
        try { afterChange?.(); } catch (e) { err('after-change-rename', e); }
      },
    });
    // Delete — available for every category. Default seeded ones become
    // retired tombstones; custom ones are physically removed.
    items.push({
      label: 'Delete',
      danger: true,
      iconSvg: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2m-7 0v12.5A1.5 1.5 0 0 0 9.5 21h5A1.5 1.5 0 0 0 16 19.5V7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      onClick: () => {
        const ok = W.confirm?.(`Delete category "${group.name}"?\n\nThis removes the category from the catalog. Chats already assigned to this category by the extension are not modified by this action.`);
        if (!ok) return;
        if (typeof H2O.archiveBoot?.deleteCategory !== 'function') return;
        const removed = H2O.archiveBoot.deleteCategory(group.id);
        if (!removed) return;
        try { afterChange?.(); } catch (e) { err('after-change-delete', e); }
      },
    });

    return openFolderPop(anchorEl, items);
  }

  function getCompat() {
    return core.getService?.('categories-compat') || null;
  }

  function getTagsApi() {
    return core.getOwner?.('tags') || core.getService?.('tags') || H2O.Tags || null;
  }

  function delegateTagsIntoList(listEl, opts = {}) {
    const tags = getTagsApi();
    if (typeof tags?.renderTagsIntoList === 'function') {
      return tags.renderTagsIntoList(listEl, opts);
    }
    if (!listEl) return null;
    listEl.innerHTML = '';
    const li = W.document.createElement('li');
    li.textContent = 'Tags are not available yet';
    li.style.padding = '16px 12px';
    li.style.color = 'var(--text-secondary, rgba(255,255,255,.72))';
    listEl.appendChild(li);
    return null;
  }

  function callCompat(name, argsLike) {
    const compat = getCompat();
    const fn = compat && compat[name];
    if (typeof fn !== 'function') return null;
    return fn(...Array.from(argsLike || []));
  }

  function callCompatHelper(name, ...args) {
    const compat = getCompat();
    const fn = compat && compat[name];
    if (typeof fn !== 'function') return null;
    return fn(...args);
  }

  function ensureStyle() {
    return callCompatHelper('ensureStyle');
  }

  function closeViewer() {
    return callCompatHelper('closeViewer');
  }

  function appendViewerChatRow(list, item) {
    return callCompatHelper('appendViewerChatRow', list, item);
  }

  function getCategoryOpenMode() {
    return callCompatHelper('getCategoryOpenMode') || 'page';
  }

  function makeViewerShell(titleText, subText, opts = {}) {
    return callCompatHelper('makeViewerShell', titleText, subText, opts);
  }

  function makeInShellPageShell(titleText, subText, tabText = 'Chats', opts = {}) {
    return callCompatHelper('makeInShellPageShell', titleText, subText, tabText, opts);
  }

  function mountInShellPage(pageEl) {
    return !!callCompatHelper('mountInShellPage', pageEl);
  }

  function commitPageRoute(route, opts = {}) {
    return callCompatHelper('commitPageRoute', route, opts);
  }

  function openCategoryViewer(groupRaw, opts = {}) {
    ensureStyle();
    const group = groupRaw && typeof groupRaw === 'object' ? groupRaw : null;
    if (!group) return null;

    const rows = Array.isArray(group.rows) ? group.rows : [];
    const title = group.name || group.id || 'Category';
    const appearance = getCategoryAppearance(group);
    const shell = makeInShellPageShell(title, `${rows.length} chats in this category`, 'Chats', {
      kind: 'category',
      id: group.id,
      hideViewActions: true,
      iconSvg: categoryIconSvgForAppearance(appearance),
      iconColor: appearance.color,
      iconLabel: 'Edit category appearance',
      onIconClick: (anchor) => openCategoryAppearanceEditor(anchor, group, () => openCategoryViewer(group, { skipHistory: true })),
    });
    if (shell?.list) rows.forEach((item) => appendViewerChatRow(shell.list, item));

    if (shell?.page && mountInShellPage(shell.page)) {
      commitPageRoute({ view: 'category', id: group.id }, opts);
      return shell.page;
    }

    closeViewer();
    const fallback = makeViewerShell(title, `${rows.length} chats in this category`, { mode: 'panel' });
    if (!fallback?.box || !fallback?.list) return null;
    rows.forEach((item) => appendViewerChatRow(fallback.list, item));
    W.document.body.appendChild(fallback.box);
    return fallback.box;
  }

  function openCategoryPanel(groupRaw) {
    ensureStyle();
    const group = groupRaw && typeof groupRaw === 'object' ? groupRaw : null;
    if (!group) return null;

    const rows = Array.isArray(group.rows) ? group.rows : [];
    closeViewer();

    const title = group.name || group.id || 'Category';
    const appearance = getCategoryAppearance(group);
    const shell = makeViewerShell(title, `${rows.length} chats in this category`, {
      mode: 'panel',
      iconSvg: categoryIconSvgForAppearance(appearance),
      iconColor: appearance.color,
      iconLabel: 'Edit category appearance',
      onIconClick: (anchor) => openCategoryAppearanceEditor(anchor, group, () => openCategoryPanel(group)),
    });
    if (!shell?.box || !shell?.list) return null;
    rows.forEach((item) => appendViewerChatRow(shell.list, item));
    W.document.body.appendChild(shell.box);
    return shell.box;
  }

  function openCategoryByMode(groupRaw) {
    return getCategoryOpenMode() === 'panel' ? openCategoryPanel(groupRaw) : openCategoryViewer(groupRaw);
  }

  function openCategoriesViewer(groupsRaw, opts = {}) {
    ensureStyle();
    const groups = Array.isArray(groupsRaw) ? groupsRaw : [];

    const shell = makeInShellPageShell('Categories', `${groups.length} categories`, 'Categories', {
      kind: 'categories',
      hideViewActions: true,
      // Header icon matches the per-row "no icon picked yet" category panels
      // placeholder so the Categories page reads as its own surface.
      iconSvg: FRAG_SVG_CATEGORY_PLACEHOLDER,
    });
    if (!shell?.page || !shell?.list) return null;

    const tabs = shell.page.querySelector?.(`[${ATTR_CGXUI_STATE}="tabs"]`) || null;
    const list = shell.list;
    const renderCategories = () => {
      list.innerHTML = '';
      groups.forEach((group) => appendInShellCategoryRow(list, group));
    };
    const renderTags = () => {
      delegateTagsIntoList(list, { refreshFn: () => openCategoriesViewer(groups, { ...opts, skipHistory: true, initialTab: 'tags' }) });
    };

    if (tabs && !tabs.querySelector('[data-h2o-tags-tab="1"]')) {
      const tagBtn = W.document.createElement('button');
      tagBtn.type = 'button';
      tagBtn.setAttribute(ATTR_CGXUI_STATE, 'view-action');
      tagBtn.setAttribute('data-h2o-tags-tab', '1');
      tagBtn.textContent = 'Tags';
      tabs.appendChild(tagBtn);
      const firstTab = tabs.querySelector(`[${ATTR_CGXUI_STATE}="tab"]`);
      const allBtns = () => Array.from(tabs.querySelectorAll('button'));
      const activate = (which) => {
        allBtns().forEach((btn) => {
          const selected = btn === which;
          btn.setAttribute(ATTR_CGXUI_STATE, selected ? 'tab' : 'view-action');
          btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
      };
      firstTab.onclick = (e) => { e.preventDefault(); e.stopPropagation(); activate(firstTab); renderCategories(); };
      tagBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); activate(tagBtn); renderTags(); };
      if (opts?.initialTab === 'tags') {
        activate(tagBtn);
        renderTags();
      } else {
        activate(firstTab);
        renderCategories();
      }
    } else if (!tabs) {
      renderCategories();
    }

    if (shell?.page && mountInShellPage(shell.page)) {
      commitPageRoute({ view: 'categories', id: '' }, opts);
      return shell.page;
    }

    closeViewer();
    const fallback = makeViewerShell('Categories', `${groups.length} categories`, { mode: 'panel' });
    if (!fallback?.box || !fallback?.list) return null;
    groups.forEach((group) => appendPanelCategoryRow(fallback.list, group));
    W.document.body.appendChild(fallback.box);
    return fallback.box;
  }

  function openCategoriesPanel(groupsRaw) {
    ensureStyle();
    const groups = Array.isArray(groupsRaw) ? groupsRaw : [];
    if (!groups.length) return null;

    closeViewer();
    const shell = makeViewerShell('Categories', `${groups.length} categories`, { mode: 'panel' });
    if (!shell?.box || !shell?.list) return null;
    groups.forEach((group) => appendPanelCategoryRow(shell.list, group));
    W.document.body.appendChild(shell.box);
    return shell.box;
  }

  function openCategoriesByMode(groupsRaw) {
    return getCategoryOpenMode() === 'panel' ? openCategoriesPanel(groupsRaw) : openCategoriesViewer(groupsRaw);
  }


  function makeFallbackSidebarHeader(labelText) {
    const btn = W.document.createElement('button');
    btn.type = 'button';
    btn.className = 'text-token-text-tertiary flex w-full items-center justify-start gap-0.5 px-4 py-1.5';
    btn.innerHTML = '<h2 class="__menu-label" data-no-spacing="true"></h2>';
    const label = btn.querySelector('h2.__menu-label');
    if (label) label.textContent = labelText;
    return btn;
  }

  function prepareCategoriesSection(projectsSection, existingSection = null) {
    const doc = W.document;
    const projectsHeaderBtn =
      projectsSection?.querySelector?.(':scope > button') ||
      projectsSection?.querySelector?.('button') ||
      null;

    const section = existingSection instanceof HTMLElement ? existingSection : doc.createElement('div');
    if (projectsSection?.className) section.className = projectsSection.className;
    else if (!section.className) section.className = 'group/sidebar-expando-section mb-[var(--sidebar-collapsed-section-margin-bottom)]';
    section.style.display = '';
    section.setAttribute('data-cgxui', UI_FSECTION_CATEGORIES_ROOT);
    section.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);

    let headerBtn = section.querySelector(':scope > button');
    if (projectsHeaderBtn instanceof HTMLElement) {
      const cloned = projectsHeaderBtn.cloneNode(true);
      cloned.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      cloned.removeAttribute('aria-controls');
      if (headerBtn instanceof HTMLElement) headerBtn.replaceWith(cloned);
      else section.insertBefore(cloned, section.firstChild || null);
      headerBtn = cloned;
    } else if (!(headerBtn instanceof HTMLElement)) {
      headerBtn = makeFallbackSidebarHeader('Categories');
      section.insertBefore(headerBtn, section.firstChild || null);
    }

    headerBtn.removeAttribute('data-h2o-sidebar-shell-inert');
    const label = headerBtn.querySelector('h2.__menu-label') || headerBtn.querySelector('h2') || null;
    if (label) label.textContent = 'Categories';

    let listWrap = section.querySelector(':scope > [data-cgxui-state="section-list"]') ||
      section.querySelector(':scope > [data-h2o-sidebar-shell-list="1"]') ||
      null;
    if (!(listWrap instanceof HTMLElement)) {
      listWrap = doc.createElement('div');
      listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
      section.appendChild(listWrap);
    }
    listWrap.removeAttribute('data-h2o-sidebar-shell-list');
    listWrap.setAttribute(ATTR_CGXUI_STATE, 'section-list');
    if (headerBtn.nextElementSibling !== listWrap) section.insertBefore(listWrap, headerBtn.nextElementSibling || null);
    return { section, headerBtn, listWrap };
  }

  function buildCategoriesSection(projectsSection, existingSection = null, reason = 'build') {
    const compat = getCompat();
    if (!compat) return null;

    const doc = W.document;
    const prepared = prepareCategoriesSection(projectsSection, existingSection);
    if (!prepared) return null;
    const { section, headerBtn, listWrap } = prepared;
    section.setAttribute('data-h2o-sidebar-shell-last-seen-by', 'categories');
    section.setAttribute('data-h2o-sidebar-shell-last-reason', String(reason || 'build').slice(0, 80));

    const tplDiv = doc.querySelector('nav div.__menu-item') || doc.querySelector('div.__menu-item') || null;
    const tplA = doc.querySelector('nav a.__menu-item[href]') || doc.querySelector('a.__menu-item[href]') || null;
    const fallbackRowClass = (tplDiv?.className || tplA?.className || 'group __menu-item hoverable');

    const makeActionRow = (text, iconSvg, onClick, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'div');
      compat.setRowText?.(row, text);
      compat.injectIcon?.(row, iconSvg, { color: opts.color });
      return compat.wireAsButton?.(row, onClick) || row;
    };
    const makeCategoryRow = (group, onOpen, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'a');
      compat.setRowText?.(row, group?.name || 'Category');
      const appearance = opts.appearance || getCategoryAppearance(group);
      compat.injectIcon?.(row, categoryIconSvgForAppearance(appearance), { color: appearance.color });
      compat.wireAsButton?.(row, onOpen);
      if (typeof opts.onToggle === 'function') {
        compat.makeIconToggle?.(row, opts.isOpen ? 'Hide chats' : 'Show chats', opts.onToggle, !!opts.isOpen);
      }
      return row;
    };
    const makeCategoryMoreRow = (text, onClick, opts = {}) => {
      const row = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'div');
      compat.setRowText?.(row, text);
      if (opts.indent) row.classList.add('ps-9');
      else compat.injectIcon?.(row, compat.moreIconSvg || '');
      return compat.wireAsButton?.(row, onClick) || row;
    };
    const makeSubChatRow = (href, text) => {
      const a = compat.makeRowShell?.(tplDiv, tplA, fallbackRowClass, 'a');
      a.setAttribute('href', href);
      a.setAttribute('role', 'link');
      a.classList.add('ps-9');
      compat.removeSurfaceChatLeadingIcon?.(a);
      const clean = compat.cleanSurfaceChatTitle ? compat.cleanSurfaceChatTitle(text) : text;
      compat.setRowText?.(a, clean);
      return a;
    };

    const readExpandedPref = () => {
      const ui = compat.readUi?.() || {};
      return ui.categoriesExpandedTouched === true ? !!ui.categoriesExpanded : true;
    };

    let expanded = readExpandedPref();
    let renderToken = 0;
    const applyExpandedToDOM = () => {
      headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      listWrap.style.display = expanded ? '' : 'none';
      compat.syncSectionHeaderArrow?.(headerBtn, expanded);
    };
    const setExpanded = (v) => {
      expanded = !!v;
      const ui = compat.readUi?.() || {};
      ui.categoriesExpanded = expanded;
      ui.categoriesExpandedTouched = true;
      compat.writeUi?.(ui);
      applyExpandedToDOM();
    };
    headerBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setExpanded(!expanded); };

    const render = async () => {
      const token = ++renderToken;
      const ui = compat.readUi?.() || {};
      listWrap.replaceChildren();
      listWrap.appendChild(makeActionRow('New category', compat.addIconSvg || '', async () => {
        const name = await compat.openNameModal?.({
          title: 'Create category',
          placeholder: 'Category name',
          initialValue: '',
          confirmText: 'Create category',
        });
        if (!name) return;
        if (typeof H2O.archiveBoot?.createCategory !== 'function') {
          W.alert?.('Category creation is not available yet.');
          return;
        }
        const created = H2O.archiveBoot.createCategory(name);
        const nextUi = compat.readUi?.() || {};
        nextUi.categoriesExpanded = true;
        nextUi.categoriesExpandedTouched = true;
        if (created?.id) nextUi.categoryPreviewFocusId = String(created.id || '');
        compat.writeUi?.(nextUi);
        expanded = true;
        render();
        refreshActivePageForAppearance('category', created?.id || '').catch((e2) => err('category-create:refresh-page', e2));
      }));

      let groups = [];
      try { groups = await owner.loadGroups(); } catch (e) { err('renderCategories', e); groups = []; }
      if (token !== renderToken) return;
      if (!groups.length) {
        applyExpandedToDOM();
        return;
      }
      const currentChatHref = doc.querySelector('a[aria-current="page"][href*="/c/"]')?.getAttribute('href') || '';
      const currentChatId = compat.parseChatIdFromHref ? compat.parseChatIdFromHref(currentChatHref) : '';
      let activeCategoryMarked = false;
      const previewLimit = Number(compat.categoryPreviewLimit || 5) || 5;
      const chatPreviewLimit = Number(compat.categoryChatPreviewLimit || 5) || 5;
      const previewFocusId = String(ui.categoryPreviewFocusId || '').trim();
      let previewGroups = groups.slice(0, previewLimit);
      if (previewFocusId && groups.length > previewLimit && !previewGroups.some((group) => group?.id === previewFocusId)) {
        const focusGroup = groups.find((group) => String(group?.id || '') === previewFocusId);
        if (focusGroup) previewGroups = [...groups.slice(0, Math.max(0, previewLimit - 1)), focusGroup];
      }

      previewGroups.forEach((group) => {
        const inlinePreviewEnabled = ui.categoryInlinePreviewOnOpen !== false;
        const isOpen = inlinePreviewEnabled && !!ui.openCategories?.[group.id];
        const appearance = getCategoryAppearance(group, ui);
        const grp = doc.createElement('div');
        grp.setAttribute('data-cgxui-state', 'category-group');
        grp.style.display = 'contents';
        const toggleCategory = () => {
          const u = compat.readUi?.() || {};
          u.openCategories = (u.openCategories && typeof u.openCategories === 'object') ? u.openCategories : {};
          u.openCategories[group.id] = !u.openCategories[group.id];
          compat.writeUi?.(u);
          render();
        };
        const row = makeCategoryRow(group, () => owner.openByMode(group), {
          appearance,
          isOpen,
          onToggle: inlinePreviewEnabled ? toggleCategory : null,
        });
        row.setAttribute('data-cgxui', compat.categoryRowToken || 'flsc-category-row');
        row.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);
        row.setAttribute('data-cgxui-category-id', group.id);
        const isActiveCategory = !!currentChatId && group.rows.some((item) => item.chatId === currentChatId);
        if (isActiveCategory && !activeCategoryMarked) {
          row.setAttribute('aria-current', 'true');
          activeCategoryMarked = true;
        }
        const trunc = row.querySelector?.('.truncate,[class*="truncate"]');
        if (trunc && ui.showCategoryCounts !== false) {
          const span = doc.createElement('span');
          span.style.opacity = '.6';
          span.style.marginLeft = '8px';
          span.style.fontSize = '12px';
          span.textContent = `(${group.rows.length})`;
          trunc.parentElement?.appendChild(span);
        }
        const more = compat.makeNativeLikeMoreButton?.('Category appearance', compat.categoryMoreToken || 'flsc-category-more') || doc.createElement('button');
        if (!more.hasAttribute('type')) more.type = 'button';
        if (!more.hasAttribute('aria-label')) more.setAttribute('aria-label', 'Category appearance');
        if (!more.hasAttribute('title')) more.title = 'Category appearance';
        if (!more.hasAttribute('data-cgxui')) more.setAttribute('data-cgxui', compat.categoryMoreToken || 'flsc-category-more');
        if (!more.innerHTML) more.innerHTML = compat.moreIconSvg || '⋯';
        more.setAttribute(ATTR_CGXUI_OWNER, OWNER_SKID);
        more.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          openCategoryAppearanceEditor(more, group, render);
        };
        row.appendChild(more);
        grp.appendChild(row);

        if (isOpen) {
          const previewRows = Array.isArray(group.rows) ? group.rows.slice(0, chatPreviewLimit) : [];
          previewRows.forEach((item) => grp.appendChild(makeSubChatRow(item.href, item.title)));
          if ((group.rows?.length || 0) > chatPreviewLimit) {
            const moreRow = makeCategoryMoreRow('Show more', () => owner.openByMode(group), { indent: true });
            moreRow.setAttribute('data-cgxui-state', 'category-show-more');
            grp.appendChild(moreRow);
          }
        }
        listWrap.appendChild(grp);
      });

      if (groups.length > previewLimit) {
        const moreRow = makeCategoryMoreRow('More', () => {});
        moreRow.setAttribute('data-cgxui-state', 'categories-more');
        moreRow.setAttribute('aria-label', 'More categories');
        moreRow.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof compat.openCategoriesMoreByMode === 'function') compat.openCategoriesMoreByMode(moreRow, groups);
          else owner.openCategoriesByMode(groups);
        };
        moreRow.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof compat.openCategoriesMoreByMode === 'function') compat.openCategoriesMoreByMode(moreRow, groups);
          else owner.openCategoriesByMode(groups);
        };
        listWrap.appendChild(moreRow);
      }
      applyExpandedToDOM();
    };

    section.appendChild(headerBtn);
    section.appendChild(listWrap);
    section._cgxuiRender = render;
    section.setAttribute('data-h2o-sidebar-shell', 'hydrated');
    section.setAttribute('data-cgxui-mode', 'hydrated');
    render();
    applyExpandedToDOM();
    return section;
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 8 — Category Candidate Pool
   *
   * Builds a durable, reviewable pool of suggested categories from existing
   * Library data. Read-only side-input: title tokens from the registry +
   * tag-auto-pool phrases + tag co-occurrence across chats. Hard duplicate
   * guard against the existing categories catalog. Rejected/merged/created
   * decisions are remembered across refreshes so the same candidate doesn't
   * resurface immediately.
   *
   * Hard rules from the plan:
   *   - Auto code never assigns chats to categories. Phase 8 ONLY surfaces
   *     candidates; Phase 9 is responsible for any classification work.
   *   - acceptCategoryCandidate() calls H2O.archiveBoot.createCategory(name,
   *     opts) — the existing writable category-creation path — and ONLY
   *     marks the candidate as 'created'. It does NOT touch any chat's
   *     category assignment.
   *   - All durable writes go through H2O.Library.Store. The pool refuses to
   *     persist if Store.caps().durable !== true (legacy localStorage primary
   *     is explicitly forbidden for Library Phase data).
   *   - Generic / noisy candidates ('Chat', 'Question', 'Test', 'Title', etc.)
   *     are dropped via a fixed blocklist before scoring.
   *   - All candidate scoring is deterministic from the inputs; no ML.
   * ──────────────────────────────────────────────────────────────────── */
  const CATPOOL_KEY = 'h2o:prm:cgx:library:cat-candidate-pool:v1';
  const CATPOOL_ALGO = 'cat-v1';
  const CATPOOL_MAX = 30;                     // most candidates we keep in the pool
  const CATPOOL_MIN_TITLE_FREQ = 3;           // a title token needs ≥ N chats to seed
  const CATPOOL_MIN_TAG_CHATS = 3;            // an auto-pool tag needs ≥ N chats to seed
  const CATPOOL_SAMPLE_LIMIT = 6;             // sampleChatIds / sampleTitles cap per candidate
  const CATPOOL_TOKEN_MIN_LEN = 3;            // drop tokens shorter than this
  const CATPOOL_TOKEN_MAX_LEN = 32;
  const CATPOOL_GENERIC_BLOCKLIST = new Set([
    // Generic chat-shape words user explicitly listed
    'chat', 'question', 'questions', 'test', 'tests', 'title', 'titles', 'received',
    'message', 'messages', 'conversation', 'conversations', 'reply', 'replies',
    'response', 'responses', 'answer', 'answers', 'thread', 'threads', 'topic',
    'topics', 'help', 'support', 'request', 'requests', 'task', 'tasks', 'note',
    'notes', 'general', 'misc', 'miscellaneous', 'other', 'others', 'untitled',
    'new', 'old', 'temp', 'temporary', 'draft', 'drafts', 'session', 'sessions',
    'todo', 'todos', 'random',
    // Common English stopwords that survive tokenization
    'the', 'and', 'for', 'with', 'from', 'about', 'into', 'this', 'that',
    'these', 'those', 'have', 'has', 'had', 'will', 'would', 'should', 'could',
    'are', 'was', 'were', 'been', 'being', 'just', 'only', 'not', 'but',
    'very', 'more', 'most', 'less', 'least', 'some', 'any', 'all', 'none',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom', 'whose',
    'can', 'cannot', 'may', 'might', 'must', 'shall', 'than', 'then', 'them',
    'their', 'theirs', 'they', 'your', 'yours', 'mine', 'ours', 'his', 'her', 'its',
    // German + Arabic high-frequency stopwords carried over from 0F5a
    'und', 'oder', 'aber', 'nicht', 'mit', 'für', 'auf', 'eine', 'ein',
    'في', 'من', 'إلى', 'على', 'هذا', 'هذه', 'ذلك',
  ]);

  // Phase 8.5 — Soft blocklist applied at quality-assessment time (NOT at tokenization).
  // These words can become category names ONLY when supported by a strong tag-overlap
  // signal (≥2 tags co-occurring with this token across multiple chats). Without that
  // support they are content-type / shape words rather than topical categories.
  // Listed in the Phase 8.5 brief: system, explanation, guide, improvement, process,
  // issue, question, answer, check, help, meaning, setup, usage, review, reply, prompt.
  // Note: question/answer are also in CATPOOL_GENERIC_BLOCKLIST above, so they never
  // reach this stage from the title-token path; included here too so tag-only
  // candidates (which bypass title tokenization) get the same treatment.
  const CATPOOL_WEAK_GENERIC = new Set([
    'system', 'explanation', 'explanations', 'guide', 'guides', 'improvement',
    'improvements', 'process', 'processes', 'issue', 'issues', 'question',
    'questions', 'answer', 'answers', 'check', 'checks', 'help', 'meaning',
    'meanings', 'setup', 'setups', 'usage', 'review', 'reviews', 'reply',
    'replies', 'prompt', 'prompts', 'overview', 'summary', 'summaries',
    'idea', 'ideas', 'plan', 'plans', 'tip', 'tips', 'example', 'examples',
    'discussion', 'discussions', 'feedback', 'comment', 'comments', 'detail',
    'details', 'note', 'notes', 'analysis', 'syntax', 'method', 'methods',
    'option', 'options', 'choice', 'choices',
    // Phase 8.6 — descriptive / generic adjectives the brief flagged. These are
    // content-shape words ("Best …", "Final …", "Free …") rather than topical
    // categories. Same rescue rule applies: if there are ≥2 supporting tags,
    // they survive (e.g. an unusual chat about "Free Software" with a strong
    // 'software' or 'gnu' tag overlap could still appear).
    'explained', 'best', 'free', 'custom', 'final', 'complete', 'basic',
    'advanced', 'current', 'latest', 'new', 'old', 'quick', 'simple', 'easy',
    'hard', 'good', 'bad', 'better', 'worse', 'small', 'large', 'big', 'short',
    'long', 'fast', 'slow',
  ]);

  // Phase 8.6 — display casing + rename map for the visible candidate name.
  // The candidate ID is built from the original (lowercased) token so decision
  // memory stays stable across refreshes; only the human-facing `name` is
  // adjusted. Two layers:
  //
  //   CATPOOL_DISPLAY_CASING  → exact-match replacement when the lowercased
  //                             token is well-known (iPhone, MV3, H2O, SDK …).
  //                             We capitalize-by-default for everything else
  //                             via titleCaseForCandidate().
  //
  //   CATPOOL_DISPLAY_RENAME  → soft singular→plural / canonical-form mapping
  //                             for technical terms we have a clear preferred
  //                             category name for. Kept tiny on purpose per the
  //                             brief: do not overdo this yet.
  const CATPOOL_DISPLAY_CASING = Object.freeze({
    'iphone': 'iPhone',
    'ipad': 'iPad',
    'macbook': 'MacBook',
    'ipod': 'iPod',
    'ios': 'iOS',
    'macos': 'macOS',
    'tvos': 'tvOS',
    'watchos': 'watchOS',
    'ui': 'UI',
    'ux': 'UX',
    'api': 'API',
    'mv3': 'MV3',
    'sdk': 'SDK',
    'sso': 'SSO',
    'mfa': 'MFA',
    'oauth': 'OAuth',
    'h2o': 'H2O',
    'cgx': 'CGX',
    'dom': 'DOM',
    'css': 'CSS',
    'html': 'HTML',
    'json': 'JSON',
    'xml': 'XML',
    'yaml': 'YAML',
    'svg': 'SVG',
    'pdf': 'PDF',
    'http': 'HTTP',
    'https': 'HTTPS',
    'url': 'URL',
    'sql': 'SQL',
    'cli': 'CLI',
    'npm': 'npm',
    'macos-x': 'macOS',
  });

  const CATPOOL_DISPLAY_RENAME = Object.freeze({
    // Singular technical term → preferred category form. Per the brief:
    // "Script → Scripts or Development Scripts, if enough script/dev context exists.
    //  Do not overdo this yet; just avoid bad display names."
    'script': 'Scripts',
  });

  // Phase 8.5 — Domain boost terms. These produce real topical categories the user
  // explicitly asked for in the Phase 8.5 brief (Codex / iPhone / Subscription /
  // Library / Tags / Labels / Identity / Auth / Extension / MV3 / UI / Interface /
  // Food / Cooking / Religion / Scripture / Legal / University / Health / Medication
  // / Finance / Tax + a few obvious neighbors). When a candidate's normalized name is
  // in this set, its score gets a 1.5× multiplier so meaningful domain candidates
  // outrank weak-generic ones at the same raw-frequency level.
  const CATPOOL_DOMAIN_BOOST = new Set([
    'codex', 'iphone', 'ipad', 'macbook', 'android', 'chrome', 'firefox', 'safari',
    'billing', 'subscription', 'invoice', 'payment',
    'library', 'tags', 'labels', 'folders', 'projects', 'archive', 'workbench',
    'identity', 'auth', 'authentication', 'login', 'signup', 'oauth', 'sso', 'mfa',
    'extension', 'mv3', 'manifest', 'sdk', 'plugin',
    'ui', 'interface', 'frontend', 'backend', 'database', 'api',
    'food', 'cooking', 'recipe', 'recipes', 'cuisine', 'nutrition', 'diet',
    'religion', 'scripture', 'quran', 'bible', 'torah', 'islam', 'christianity', 'judaism',
    'legal', 'law', 'university', 'school', 'academic', 'thesis', 'research',
    'health', 'medical', 'medication', 'doctor', 'fitness', 'symptom', 'symptoms',
    'finance', 'tax', 'taxes', 'budget', 'investment', 'crypto', 'stocks',
    'travel', 'flight', 'hotel', 'visa', 'passport', 'immigration',
    'translation', 'german', 'arabic', 'english', 'spanish',
  ]);

  // In-memory cache; refreshed by refreshCategoryCandidatePool() and on first read.
  let _catPoolCache = null;          // { version, updatedAt, ..., candidates: [...] }
  let _catPoolDiag = {
    lastRefreshAt: 0,
    lastRefreshReason: '',
    lastRefreshDurationMs: 0,
    lastTitleTokenCount: 0,
    lastTagPoolPhraseCount: 0,
    lastRegistryRowCount: 0,
    lastExistingCategoryCount: 0,
    lastSkippedGeneric: 0,
    lastSkippedDuplicate: 0,
    lastFailureReason: '',
    // Phase 8.5 quality-pass diagnostics:
    lastTotalRaw: 0,            // candidates produced before quality filter
    lastVisible: 0,             // candidates that passed quality (and got persisted)
    lastHiddenWeakGeneric: 0,   // hidden because weak-generic w/ no tag support
    lastHiddenLowSignal: 0,     // hidden because of low coverage + no tag support
    lastTopRejectedByQuality: [], // [{ name, reason, score }, ...]
    lastTopAcceptedByScore: [],   // [{ name, score, confidence, sourceSignals.titleClusterSize }, ...]
  };

  function getLibraryStore() {
    try { return W.H2O?.Library?.Store || null; } catch { return null; }
  }

  function isStoreDurable() {
    try {
      const Store = getLibraryStore();
      if (!Store?.caps) return false;
      const caps = Store.caps();
      return caps?.durable === true;
    } catch { return false; }
  }

  function safeReadKnownChatRegistryRows() {
    try {
      const lib = W.H2O?.LibraryIndex;
      if (lib?.readKnownChatRegistry) {
        const payload = lib.readKnownChatRegistry();
        return Array.isArray(payload?.rows) ? payload.rows : [];
      }
    } catch (e) { err('catpool:read-registry', e); }
    return [];
  }

  function safeReadTagAutoPool() {
    try {
      const tags = W.H2O?.Tags;
      const pool = tags?.getTagAutoPool ? tags.getTagAutoPool() : null;
      return (pool && typeof pool === 'object' && pool.phrases) ? pool : null;
    } catch (e) { err('catpool:read-tag-pool', e); return null; }
  }

  function tokenizeTitle(rawTitle) {
    const t = String(rawTitle || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return [];
    const out = [];
    t.split(' ').forEach((word) => {
      const w = word.replace(/^['-]+|['-]+$/g, '');
      if (!w) return;
      if (w.length < CATPOOL_TOKEN_MIN_LEN || w.length > CATPOOL_TOKEN_MAX_LEN) return;
      if (CATPOOL_GENERIC_BLOCKLIST.has(w)) return;
      // Drop pure numbers ("2024", "123") — rarely useful as a category seed.
      if (/^\d+$/.test(w)) return;
      out.push(w);
    });
    return out;
  }

  function normalizeCategoryNameKey(raw) {
    return String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function existingCategoryNameSet(catalogEntries) {
    const set = new Set();
    (Array.isArray(catalogEntries) ? catalogEntries : []).forEach((entry) => {
      const name = normalizeCategoryNameKey(entry?.name || '');
      if (name) set.add(name);
      (entry?.aliases || []).forEach((alias) => {
        const k = normalizeCategoryNameKey(alias);
        if (k) set.add(k);
      });
    });
    return set;
  }

  function titleCaseForCandidate(token) {
    // Phase 8.6: layer (1) display rename for known canonical forms,
    // (2) explicit casing override for known acronyms / brand names,
    // (3) default Title-case for everything else; uppercase if very short.
    const raw = String(token || '').trim();
    if (!raw) return '';
    const lower = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CATPOOL_DISPLAY_RENAME, lower)) {
      return CATPOOL_DISPLAY_RENAME[lower];
    }
    if (Object.prototype.hasOwnProperty.call(CATPOOL_DISPLAY_CASING, lower)) {
      return CATPOOL_DISPLAY_CASING[lower];
    }
    if (lower.length <= 2) return lower.toUpperCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }

  function buildCandidateId(token) {
    const slug = String(token || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `cand_${slug || 'x'}`;
  }

  // ─── Phase 8.5 — quality assessment + score adjustment ──────────────────────
  //
  // assessCandidateQuality(): given a freshly-generated candidate, decide whether
  // it is strong enough to surface as a real category suggestion.
  //
  // Reasons we hide a candidate:
  //   - weak-generic: name is in CATPOOL_WEAK_GENERIC AND there is no supporting
  //                   tag overlap (≥ 2 tags from the auto-pool co-occurring with
  //                   this candidate's chats). These are content-type / shape
  //                   words, not topical categories.
  //   - low-signal:   title cluster < MIN AND tag overlap < MIN. Below the
  //                   minimum confidence we won't show the bubble.
  //
  // Important "rescue" rule per the brief: words like Library / Tags / Labels /
  // Subscription are NOT in CATPOOL_WEAK_GENERIC because they are useful as
  // categories on their own. They ALSO get a boost from CATPOOL_DOMAIN_BOOST.
  //
  // applyDomainBoost(): multiplies the candidate's score by 1.5 when its
  // normalized name matches CATPOOL_DOMAIN_BOOST. This raises strong topical
  // candidates (Codex, iPhone, Subscription, Library, …) above borderline
  // single-token candidates that share the same raw frequency.
  function assessCandidateQuality(cand) {
    const name = String(cand?.name || '').toLowerCase().trim();
    const tagOverlap = Number(cand?.sourceSignals?.tagOverlap || 0) || 0;
    const titleClusterSize = Number(cand?.sourceSignals?.titleClusterSize || 0) || 0;
    const seedTags = Array.isArray(cand?.sourceSignals?.seedTags) ? cand.sourceSignals.seedTags.length : 0;
    if (CATPOOL_WEAK_GENERIC.has(name) && tagOverlap < 2 && seedTags < 2) {
      return { ok: false, reason: 'weak-generic' };
    }
    // Single-word low-coverage no-tag candidates are noise too.
    if (titleClusterSize < CATPOOL_MIN_TITLE_FREQ && tagOverlap < CATPOOL_MIN_TAG_CHATS) {
      return { ok: false, reason: 'low-signal' };
    }
    return { ok: true, reason: '' };
  }

  function applyDomainBoost(cand) {
    if (!cand?.name) return cand;
    const key = String(cand.name).toLowerCase().trim();
    if (CATPOOL_DOMAIN_BOOST.has(key)) {
      cand.score = Number((Number(cand.score || 0) * 1.5).toFixed(3));
      cand._domainBoost = true;
    }
    return cand;
  }

  // Generate raw candidates from the three signal sources. Each candidate has:
  //   { id, name, score, confidence, sourceSignals:{...}, status:'candidate', createdAt }
  // Decision history is layered on AFTER generation in mergeWithExistingPool().
  function generateRawCandidates() {
    const t0 = performance.now();
    const reg = safeReadKnownChatRegistryRows();
    const auto = safeReadTagAutoPool();
    const catalog = getCatalogEntries();
    const existing = existingCategoryNameSet(catalog);

    _catPoolDiag.lastRegistryRowCount = reg.length;
    _catPoolDiag.lastTagPoolPhraseCount = auto?.phrases ? Object.keys(auto.phrases).length : 0;
    _catPoolDiag.lastExistingCategoryCount = catalog.length;
    _catPoolDiag.lastSkippedGeneric = 0;
    _catPoolDiag.lastSkippedDuplicate = 0;

    // ── 1. Title token frequency map: token → { count, chatIds:[], titles:[] }.
    const tokenMap = new Map();
    for (const row of reg) {
      const chatId = String(row?.chatId || '').trim();
      const title = String(row?.title || '').trim();
      if (!chatId || !title) continue;
      const seenInThisTitle = new Set();
      tokenizeTitle(title).forEach((tok) => {
        if (seenInThisTitle.has(tok)) return;
        seenInThisTitle.add(tok);
        let entry = tokenMap.get(tok);
        if (!entry) {
          entry = { token: tok, count: 0, chatIds: [], titles: [] };
          tokenMap.set(tok, entry);
        }
        entry.count += 1;
        if (entry.chatIds.length < CATPOOL_SAMPLE_LIMIT) entry.chatIds.push(chatId);
        if (entry.titles.length < CATPOOL_SAMPLE_LIMIT) entry.titles.push(title);
      });
    }
    _catPoolDiag.lastTitleTokenCount = tokenMap.size;

    // ── 2. Tag-auto-pool: phraseKey → { phrase, totalCount, chatCount, contribByChat, score }.
    //    Build a phrase→chatIds reverse for co-occurrence and a top-N tag set.
    const tagPhraseToChats = new Map();
    if (auto && auto.phrases) {
      Object.entries(auto.phrases).forEach(([key, ent]) => {
        if (!ent || ent.blocked || ent.status === 'rejected') return;
        const chatCount = Number(ent.chatCount || 0) || 0;
        if (chatCount < 1) return;
        const chats = ent.contribByChat ? Object.keys(ent.contribByChat) : [];
        if (!chats.length) return;
        tagPhraseToChats.set(key, { phrase: String(ent.phrase || key), chats: new Set(chats), score: Number(ent.score || 0) || 0, chatCount });
      });
    }

    // ── 3. Build candidates from title tokens (the dominant signal). For each token,
    //    enrich with tag overlap (any tag-auto-pool phrase whose chats intersect the
    //    token's chats counts as a "seedTag"). Score combines coverage × token rarity
    //    × tag overlap.
    const candidates = [];
    for (const [token, entry] of tokenMap.entries()) {
      if (entry.count < CATPOOL_MIN_TITLE_FREQ) continue;
      const candidateName = titleCaseForCandidate(token);
      if (existing.has(normalizeCategoryNameKey(candidateName))) {
        _catPoolDiag.lastSkippedDuplicate += 1;
        continue;
      }
      const id = buildCandidateId(token);
      const tokenChatSet = new Set(entry.chatIds);
      // Tag overlap: tags whose chat-set intersects the token's chat-set.
      const seedTags = [];
      let tagOverlapTotal = 0;
      for (const [, tagInfo] of tagPhraseToChats.entries()) {
        let overlap = 0;
        for (const c of tokenChatSet) { if (tagInfo.chats.has(c)) overlap += 1; }
        if (overlap >= 2) {
          seedTags.push({ phrase: tagInfo.phrase, overlap });
          tagOverlapTotal += overlap;
        }
      }
      seedTags.sort((a, b) => b.overlap - a.overlap);
      const seedTagPhrases = seedTags.slice(0, 5).map((s) => s.phrase);
      // Coverage: title-frequency normalized against registry size.
      const coverage = reg.length ? entry.count / reg.length : 0;
      const score = (entry.count * 1.0) + (tagOverlapTotal * 0.5) + (token.length >= 5 ? 1.0 : 0);
      const confidence = Math.min(1, coverage * 4 + Math.min(seedTags.length, 3) * 0.1);
      candidates.push({
        id,
        name: candidateName,
        score: Number(score.toFixed(3)),
        confidence: Number(confidence.toFixed(3)),
        sourceSignals: {
          titleClusterSize: entry.count,
          tagOverlap: tagOverlapTotal,
          sampleChatIds: entry.chatIds.slice(0, CATPOOL_SAMPLE_LIMIT),
          seedTags: seedTagPhrases,
          sampleTitles: entry.titles.slice(0, CATPOOL_SAMPLE_LIMIT),
        },
      });
    }

    // ── 4. Tag-only candidates: for tags that appear in many chats but never as a
    //    title token — useful when many chats share a topic without sharing words.
    const candidateNameKeys = new Set(candidates.map((c) => normalizeCategoryNameKey(c.name)));
    for (const [, tagInfo] of tagPhraseToChats.entries()) {
      if (tagInfo.chatCount < CATPOOL_MIN_TAG_CHATS) continue;
      const tagToken = String(tagInfo.phrase || '').toLowerCase().trim();
      if (!tagToken) continue;
      // Skip if the tag is itself a generic blocklisted term.
      if (CATPOOL_GENERIC_BLOCKLIST.has(tagToken)) {
        _catPoolDiag.lastSkippedGeneric += 1;
        continue;
      }
      // Skip if a title-token candidate already covers it.
      const candidateName = titleCaseForCandidate(tagToken);
      const nk = normalizeCategoryNameKey(candidateName);
      if (existing.has(nk)) { _catPoolDiag.lastSkippedDuplicate += 1; continue; }
      if (candidateNameKeys.has(nk)) continue;
      const sampleChatIds = Array.from(tagInfo.chats).slice(0, CATPOOL_SAMPLE_LIMIT);
      // Pull titles for these chats from the registry where possible.
      const titleByChat = new Map();
      for (const r of reg) titleByChat.set(String(r?.chatId || ''), String(r?.title || ''));
      const sampleTitles = sampleChatIds.map((c) => titleByChat.get(c) || '').filter(Boolean).slice(0, CATPOOL_SAMPLE_LIMIT);
      const score = (tagInfo.chatCount * 0.7) + (Number(tagInfo.score || 0) * 0.1);
      const confidence = Math.min(1, (tagInfo.chatCount / 20) + 0.05);
      candidates.push({
        id: buildCandidateId(`tag_${tagToken}`),
        name: candidateName,
        score: Number(score.toFixed(3)),
        confidence: Number(confidence.toFixed(3)),
        sourceSignals: {
          titleClusterSize: 0,
          tagOverlap: tagInfo.chatCount,
          sampleChatIds,
          seedTags: [tagInfo.phrase],
          sampleTitles,
        },
      });
      candidateNameKeys.add(nk);
    }

    // ── 5. Phase 8.6 — collapse candidates that map to the same display name.
    //       Example: token "script" gets renamed to "Scripts" via
    //       CATPOOL_DISPLAY_RENAME, while a separate token "scripts" naturally
    //       title-cases to "Scripts". Both produce different IDs (cand_script,
    //       cand_scripts) but the same user-facing name. Merge them so the
    //       popup doesn't show two identical-looking entries — keep the one
    //       with the higher score and accumulate sourceSignals.tagOverlap +
    //       titleClusterSize so the survivor reflects the combined evidence.
    const collapsedByName = new Map();
    for (const c of candidates) {
      const nk = normalizeCategoryNameKey(c.name);
      const prev = collapsedByName.get(nk);
      if (!prev) {
        collapsedByName.set(nk, c);
        continue;
      }
      // Merge into whichever side has the higher score; combine signals.
      const winner = (Number(c.score || 0) >= Number(prev.score || 0)) ? c : prev;
      const loser = winner === c ? prev : c;
      const wsig = winner.sourceSignals || {};
      const lsig = loser.sourceSignals || {};
      winner.sourceSignals = {
        titleClusterSize: Math.max(Number(wsig.titleClusterSize || 0), Number(lsig.titleClusterSize || 0)),
        tagOverlap:       Number(wsig.tagOverlap || 0) + Number(lsig.tagOverlap || 0),
        sampleChatIds:    Array.from(new Set([...(wsig.sampleChatIds || []), ...(lsig.sampleChatIds || [])])).slice(0, CATPOOL_SAMPLE_LIMIT),
        seedTags:         Array.from(new Set([...(wsig.seedTags || []), ...(lsig.seedTags || [])])).slice(0, 5),
        sampleTitles:     Array.from(new Set([...(wsig.sampleTitles || []), ...(lsig.sampleTitles || [])])).slice(0, CATPOOL_SAMPLE_LIMIT),
      };
      collapsedByName.set(nk, winner);
    }
    const dedupedCandidates = Array.from(collapsedByName.values());

    // ── 6. Phase 8.5 — apply domain boost, then split into visible / rejected
    //       buckets via the quality assessor. Visible candidates get persisted;
    //       rejected ones land in diagnostics so the user can audit what was
    //       hidden and why. The hard generic blocklist (CATPOOL_GENERIC_BLOCKLIST)
    //       still removes terms at tokenization time, so this stage only sees
    //       names that survived that filter.
    dedupedCandidates.forEach(applyDomainBoost);
    const visible = [];
    const rejectedQuality = [];
    let hiddenWeakGeneric = 0;
    let hiddenLowSignal = 0;
    for (const cand of dedupedCandidates) {
      const verdict = assessCandidateQuality(cand);
      if (verdict.ok) {
        visible.push(cand);
      } else {
        rejectedQuality.push({
          name: cand.name,
          reason: verdict.reason,
          score: cand.score,
          titleClusterSize: cand.sourceSignals?.titleClusterSize || 0,
          tagOverlap: cand.sourceSignals?.tagOverlap || 0,
        });
        if (verdict.reason === 'weak-generic') hiddenWeakGeneric += 1;
        else if (verdict.reason === 'low-signal') hiddenLowSignal += 1;
      }
    }

    _catPoolDiag.lastTotalRaw = dedupedCandidates.length;
    _catPoolDiag.lastVisible = visible.length;
    _catPoolDiag.lastHiddenWeakGeneric = hiddenWeakGeneric;
    _catPoolDiag.lastHiddenLowSignal = hiddenLowSignal;
    _catPoolDiag.lastTopRejectedByQuality = rejectedQuality
      .sort((a, b) => (b.score - a.score))
      .slice(0, 8);

    // ── 6. Rank + cap visible candidates.
    visible.sort((a, b) => (b.score - a.score) || String(a.name).localeCompare(String(b.name)));
    const top = visible.slice(0, CATPOOL_MAX);

    _catPoolDiag.lastTopAcceptedByScore = top.slice(0, 8).map((c) => ({
      name: c.name,
      score: c.score,
      confidence: c.confidence,
      titleClusterSize: c.sourceSignals?.titleClusterSize || 0,
      tagOverlap: c.sourceSignals?.tagOverlap || 0,
      seedTags: c.sourceSignals?.seedTags || [],
      domainBoost: !!c._domainBoost,
    }));
    // _domainBoost is a transient flag — strip it before persistence so the
    // stored pool stays clean.
    top.forEach((c) => { if ('_domainBoost' in c) delete c._domainBoost; });

    _catPoolDiag.lastRefreshDurationMs = Math.round(performance.now() - t0);
    return top;
  }

  // Merge a freshly generated list with the stored pool so user decisions
  // (rejected/created/merged) survive refresh. New candidates start as 'candidate';
  // existing entries that are NOT in the new list AND have a final status are kept;
  // existing 'candidate'-status entries that are NOT in the new list are dropped.
  function mergeWithExistingPool(prev, fresh) {
    const prevById = new Map();
    if (prev?.candidates) prev.candidates.forEach((c) => { if (c?.id) prevById.set(c.id, c); });
    const freshById = new Map();
    fresh.forEach((c) => { if (c?.id) freshById.set(c.id, c); });

    const out = [];
    const seen = new Set();
    // First pass: each fresh candidate, layered with existing decision if present.
    for (const c of fresh) {
      if (!c?.id || seen.has(c.id)) continue;
      seen.add(c.id);
      const old = prevById.get(c.id);
      if (old && old.status && old.status !== 'candidate') {
        // Preserve user decision; refresh sourceSignals + score for context.
        out.push({
          ...old,
          score: c.score,
          confidence: c.confidence,
          sourceSignals: c.sourceSignals,
        });
      } else {
        out.push({
          id: c.id,
          name: c.name,
          score: c.score,
          confidence: c.confidence,
          status: 'candidate',
          sourceSignals: c.sourceSignals,
          createdAt: (old?.createdAt) || new Date().toISOString(),
          decidedAt: '',
        });
      }
    }
    // Second pass: keep retired entries (rejected/created/merged) that are no longer
    // generated by the fresh pass — so a once-rejected candidate doesn't immediately
    // resurface even if title frequency drops below threshold.
    for (const [id, old] of prevById.entries()) {
      if (seen.has(id)) continue;
      if (!old?.status || old.status === 'candidate') continue;
      out.push(old);
      seen.add(id);
    }
    return out;
  }

  async function loadCategoryCandidatePool() {
    if (_catPoolCache) return _catPoolCache;
    const Store = getLibraryStore();
    if (!Store?.get) return null;
    try {
      const v = await Store.get(CATPOOL_KEY);
      if (v && typeof v === 'object') {
        _catPoolCache = v;
        return v;
      }
    } catch (e) { err('catpool:load', e); }
    return null;
  }

  async function persistCategoryCandidatePool(pool) {
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    const Store = getLibraryStore();
    if (!Store?.set) return { ok: false, status: 'no-store' };
    try {
      await Store.set(CATPOOL_KEY, pool);
      return { ok: true };
    } catch (e) {
      err('catpool:persist', e);
      return { ok: false, status: `persist-failed:${e?.message || 'unknown'}` };
    }
  }

  async function refreshCategoryCandidatePool(opts = {}) {
    const reason = String(opts.reason || (opts.force ? 'force' : 'manual')).slice(0, 80);
    _catPoolDiag.lastRefreshReason = reason;
    if (!isStoreDurable()) {
      _catPoolDiag.lastFailureReason = 'store-not-durable';
      return { ok: false, status: 'store-not-durable' };
    }
    try {
      const prev = await loadCategoryCandidatePool();
      const fresh = generateRawCandidates();
      const merged = mergeWithExistingPool(prev, fresh);
      const now = Date.now();
      const pool = {
        version: 1,
        updatedAt: now,
        updatedAtIso: new Date(now).toISOString(),
        algoVersion: CATPOOL_ALGO,
        candidates: merged,
      };
      const persistRes = await persistCategoryCandidatePool(pool);
      if (!persistRes.ok) {
        _catPoolDiag.lastFailureReason = persistRes.status || 'persist-failed';
        return { ok: false, status: persistRes.status || 'persist-failed' };
      }
      _catPoolCache = pool;
      _catPoolDiag.lastRefreshAt = now;
      _catPoolDiag.lastFailureReason = '';
      try {
        W.dispatchEvent(new CustomEvent('evt:h2o:library:cat-candidate-pool-updated', { detail: { count: merged.length, reason } }));
        W.dispatchEvent(new CustomEvent('h2o:library:cat-candidate-pool-updated', { detail: { count: merged.length, reason } }));
      } catch (_e) {}
      return { ok: true, status: 'ok', candidateCount: merged.length, durable: true };
    } catch (e) {
      err('catpool:refresh', e);
      _catPoolDiag.lastFailureReason = String(e?.message || e || 'unknown');
      return { ok: false, status: 'error', error: String(e?.message || e || 'unknown') };
    }
  }

  function getCategoryCandidatePool() {
    return _catPoolCache;
  }

  function previewCategoryCandidate(candidateId) {
    const id = String(candidateId || '').trim();
    if (!id || !_catPoolCache?.candidates) return null;
    const cand = _catPoolCache.candidates.find((c) => c?.id === id);
    if (!cand) return null;
    // Re-resolve titles for sample chats on preview so they reflect the current
    // registry state (titles may have been edited since the pool was generated).
    const reg = safeReadKnownChatRegistryRows();
    const titleByChat = new Map();
    for (const r of reg) titleByChat.set(String(r?.chatId || ''), String(r?.title || ''));
    const sample = (cand.sourceSignals?.sampleChatIds || []).map((cid) => ({
      chatId: cid,
      title: titleByChat.get(cid) || cand.sourceSignals?.sampleTitles?.[0] || cid,
    }));
    return { ...cand, preview: { sample } };
  }

  async function acceptCategoryCandidate(candidateId, opts = {}) {
    const id = String(candidateId || '').trim();
    if (!id) return { ok: false, status: 'invalid-id' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    if (!_catPoolCache) await loadCategoryCandidatePool();
    const cand = _catPoolCache?.candidates?.find((c) => c?.id === id);
    if (!cand) return { ok: false, status: 'not-found' };
    if (cand.status && cand.status !== 'candidate') return { ok: false, status: `already-${cand.status}` };
    const finalName = String(opts.name || cand.name || '').trim();
    if (!finalName) return { ok: false, status: 'invalid-name' };
    const finalColor = normalizeHexColor(opts.color || '') || undefined;
    if (typeof H2O.archiveBoot?.createCategory !== 'function') {
      return { ok: false, status: 'create-api-unavailable' };
    }
    let created = null;
    try {
      // Use the existing writable category-creation path. Returns the created (or
      // existing if the name collides) record. We do NOT touch any chat record.
      created = H2O.archiveBoot.createCategory(finalName, finalColor ? { color: finalColor } : {});
    } catch (e) { err('catpool:create-category', e); return { ok: false, status: `create-failed:${e?.message || 'unknown'}` }; }
    if (!created?.id) return { ok: false, status: 'create-returned-null' };
    cand.status = 'created';
    cand.decidedAt = new Date().toISOString();
    cand.createdCategoryId = String(created.id);
    const persistRes = await persistCategoryCandidatePool(_catPoolCache);
    if (!persistRes.ok) return { ok: false, status: `persist-failed:${persistRes.status}` };
    refreshActivePageForAppearance('category', cand.createdCategoryId).catch((e2) => err('catpool:create-refresh-page', e2));
    return { ok: true, status: 'ok', createdCategoryId: cand.createdCategoryId, candidate: cand };
  }

  async function rejectCategoryCandidate(candidateId) {
    const id = String(candidateId || '').trim();
    if (!id) return { ok: false, status: 'invalid-id' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    if (!_catPoolCache) await loadCategoryCandidatePool();
    const cand = _catPoolCache?.candidates?.find((c) => c?.id === id);
    if (!cand) return { ok: false, status: 'not-found' };
    if (cand.status === 'rejected') return { ok: true, status: 'already-rejected' };
    cand.status = 'rejected';
    cand.decidedAt = new Date().toISOString();
    const persistRes = await persistCategoryCandidatePool(_catPoolCache);
    if (!persistRes.ok) return { ok: false, status: `persist-failed:${persistRes.status}` };
    return { ok: true, status: 'ok', candidate: cand };
  }

  async function mergeCategoryCandidate(candidateId, intoCategoryId) {
    const id = String(candidateId || '').trim();
    const into = String(intoCategoryId || '').trim();
    if (!id || !into) return { ok: false, status: 'invalid-args' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    if (!_catPoolCache) await loadCategoryCandidatePool();
    const cand = _catPoolCache?.candidates?.find((c) => c?.id === id);
    if (!cand) return { ok: false, status: 'not-found' };
    cand.status = 'merged';
    cand.decidedAt = new Date().toISOString();
    cand.mergedIntoCategoryId = into;
    const persistRes = await persistCategoryCandidatePool(_catPoolCache);
    if (!persistRes.ok) return { ok: false, status: `persist-failed:${persistRes.status}` };
    return { ok: true, status: 'ok', candidate: cand };
  }

  function getCategoryCandidateDiagnostics() {
    // Phase 11 polish: fire-and-forget hydration so subsequent calls reflect Store
    // truth even if the boot-time hydration hasn't completed yet. The cache load is
    // idempotent (`if (_catPoolCache) return _catPoolCache`), so repeated calls are
    // cheap. cacheHydrated tells the caller whether this snapshot is from a populated
    // cache or whether the cache is still warming up — Maintenance prefers Store
    // read-through (`H2O.Library.Maintenance.inspectCategoryCandidates`) when an
    // authoritative count is needed.
    if (!_catPoolCache) loadCategoryCandidatePool().catch(() => {});
    const Store = getLibraryStore();
    let durable = false;
    let backend = '';
    try {
      const caps = Store?.caps?.();
      durable = !!caps?.durable;
      backend = String(caps?.primary || Store?.backend?.() || '');
    } catch (_e) {}
    const total = Array.isArray(_catPoolCache?.candidates) ? _catPoolCache.candidates.length : 0;
    const byStatus = { candidate: 0, created: 0, rejected: 0, merged: 0 };
    if (_catPoolCache?.candidates) {
      _catPoolCache.candidates.forEach((c) => {
        const s = String(c?.status || 'candidate');
        if (Object.prototype.hasOwnProperty.call(byStatus, s)) byStatus[s] += 1;
      });
    }
    return {
      key: CATPOOL_KEY,
      algoVersion: CATPOOL_ALGO,
      durable,
      backend,
      cacheHydrated: !!_catPoolCache,
      total,
      byStatus,
      ...(_catPoolDiag),
    };
  }

  // Boot-time hydration: try to load any previously persisted pool so callers that
  // ask for getCategoryCandidatePool() before refresh see the cached snapshot.
  // Non-blocking; if Store is degraded the pool stays null until a manual refresh.
  loadCategoryCandidatePool().catch((e) => err('catpool:boot-load', e));

  /* ──────────────────────────────────────────────────────────────────────────
   * Phase 9 — Auto-classification Review Mode
   *
   * Uses the Phase 8 category candidate pool to suggest category assignments
   * for chats. The plan's hard rule: precedence is
   *
   *     userOverride > acceptedSuggestion > autoSuggestion > extension-provided
   *
   * Auto code can ONLY write the autoSuggestion slot — and only in
   * `apply-new` mode, only for chats with no existing acceptedSuggestion AND
   * no existing userOverride. The user explicitly promotes via
   * applyAutoClassSuggestion (acceptedSuggestion) or setUserCategoryOverride
   * (userOverride).
   *
   * Three modes:
   *   - off (default)  — runAutoClassReview is a noop.
   *   - suggest        — generates suggestions in-memory (and persisted as
   *                      autoSuggestion ONLY if apply-new). Suggest mode
   *                      itself never writes; the user must explicitly accept
   *                      or override.
   *   - apply-new      — writes autoSuggestion slot for chats with no user
   *                      override and no acceptedSuggestion. Never overwrites
   *                      either of those.
   *
   * NOTE: Phase 9 does NOT change LibraryIndex read paths. Storage is a
   * standalone overrides map; read-side merging is deferred to a future
   * narrow phase (per the plan: "avoid broad 0F1c refactor unless
   * necessary").
   * ──────────────────────────────────────────────────────────────────── */
  const OVERRIDES_KEY = 'h2o:prm:cgx:library:category-overrides:v1';
  const AUTOCLASS_PREFS_KEY = 'h2o:prm:cgx:library:autoclass-prefs:v1'; // localStorage (UI pref)
  const AUTOCLASS_MODES = Object.freeze(['off', 'suggest', 'apply-new']);
  const AUTOCLASS_DEFAULT_MODE = 'off';
  const AUTOCLASS_DEFAULT_THRESHOLD = 0.6;
  const AUTOCLASS_MIN_THRESHOLD = 0.3;
  const AUTOCLASS_MAX_THRESHOLD = 0.95;

  let _overridesCache = null;     // { version, updatedAt, ..., rows: { [chatId]: { autoSuggestion?, acceptedSuggestion?, userOverride? } } }
  let _autoClassPrefsCache = null;
  let _lastSuggestions = [];      // [{ chatId, primaryCategoryId, primaryCategoryName, confidence, reason, signals }, ...]
  let _autoClassDiag = {
    mode: AUTOCLASS_DEFAULT_MODE,
    threshold: AUTOCLASS_DEFAULT_THRESHOLD,
    lastRunAt: 0,
    lastRunReason: '',
    lastRunDurationMs: 0,
    totalChatsChecked: 0,
    suggestionsGenerated: 0,
    skippedExistingOverride: 0,
    skippedAcceptedSuggestion: 0,
    skippedNoMatch: 0,
    skippedLowConfidence: 0,
    appliedAutoSuggestions: 0,
    lastFailureReason: '',
  };

  function clampThreshold(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return AUTOCLASS_DEFAULT_THRESHOLD;
    return Math.min(AUTOCLASS_MAX_THRESHOLD, Math.max(AUTOCLASS_MIN_THRESHOLD, n));
  }

  function normalizeMode(raw) {
    const v = String(raw || '').trim().toLowerCase();
    return AUTOCLASS_MODES.includes(v) ? v : AUTOCLASS_DEFAULT_MODE;
  }

  function readAutoClassPrefsRaw() {
    try {
      const raw = W.localStorage?.getItem(AUTOCLASS_PREFS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) { err('autoclass:read-prefs', e); return null; }
  }

  function getAutoClassPrefs() {
    if (!_autoClassPrefsCache) {
      const stored = readAutoClassPrefsRaw();
      _autoClassPrefsCache = {
        mode:      normalizeMode(stored?.mode),
        threshold: clampThreshold(stored?.threshold),
      };
    }
    return { ..._autoClassPrefsCache };
  }

  function setAutoClassPrefs(patch = {}) {
    const cur = getAutoClassPrefs();
    const next = {
      mode: ('mode' in patch) ? normalizeMode(patch.mode) : cur.mode,
      threshold: ('threshold' in patch) ? clampThreshold(patch.threshold) : cur.threshold,
    };
    _autoClassPrefsCache = next;
    _autoClassDiag.mode = next.mode;
    _autoClassDiag.threshold = next.threshold;
    try { W.localStorage?.setItem(AUTOCLASS_PREFS_KEY, JSON.stringify(next)); } catch (e) { err('autoclass:write-prefs', e); }
    try {
      W.dispatchEvent(new CustomEvent('evt:h2o:library:autoclass-prefs-changed', { detail: { ...next } }));
      W.dispatchEvent(new CustomEvent('h2o:library:autoclass-prefs-changed', { detail: { ...next } }));
    } catch (_e) {}
    return { ok: true, prefs: { ...next } };
  }

  function emptyOverrides() {
    return {
      version: 1,
      updatedAt: 0,
      updatedAtIso: '',
      rows: {},
    };
  }

  async function loadCategoryOverrides() {
    if (_overridesCache) return _overridesCache;
    const Store = getLibraryStore();
    if (!Store?.get) return null;
    try {
      const v = await Store.get(OVERRIDES_KEY);
      if (v && typeof v === 'object' && v.rows && typeof v.rows === 'object') {
        _overridesCache = v;
        return v;
      }
    } catch (e) { err('autoclass:load-overrides', e); }
    _overridesCache = emptyOverrides();
    return _overridesCache;
  }

  async function persistCategoryOverrides() {
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    const Store = getLibraryStore();
    if (!Store?.set) return { ok: false, status: 'no-store' };
    if (!_overridesCache) _overridesCache = emptyOverrides();
    _overridesCache.updatedAt = Date.now();
    _overridesCache.updatedAtIso = new Date(_overridesCache.updatedAt).toISOString();
    try {
      await Store.set(OVERRIDES_KEY, _overridesCache);
      return { ok: true };
    } catch (e) {
      err('autoclass:persist-overrides', e);
      return { ok: false, status: `persist-failed:${e?.message || 'unknown'}` };
    }
  }

  function ensureRow(chatId) {
    if (!_overridesCache) _overridesCache = emptyOverrides();
    const id = String(chatId || '').trim();
    if (!id) return null;
    if (!_overridesCache.rows[id]) _overridesCache.rows[id] = {};
    return _overridesCache.rows[id];
  }

  function getEffectiveCategoryFromRow(row) {
    if (!row || typeof row !== 'object') return null;
    if (row.userOverride?.primaryCategoryId)       return { source: 'userOverride',       ...row.userOverride };
    if (row.acceptedSuggestion?.primaryCategoryId) return { source: 'acceptedSuggestion', ...row.acceptedSuggestion };
    if (row.autoSuggestion?.primaryCategoryId)     return { source: 'autoSuggestion',     ...row.autoSuggestion };
    return null;
  }

  // ── Suggestion algorithm ──
  //
  // For each chat in the registry, score every existing category by:
  //   (a) Title-token / alias match: chat title contains the category name (or
  //       any alias) as a whole token. Strongest signal.
  //   (b) Sample-chat match: chatId appears in a created candidate's
  //       sourceSignals.sampleChatIds where the candidate's createdCategoryId
  //       maps to this category. Strong signal — these are the chats that
  //       seeded the category in Phase 8.
  //   (c) Seed-tag match: chat is in the auto-pool's contribByChat for any of
  //       the candidate's seedTags. Medium signal — topical resonance.
  //
  // Confidence is derived from the total score, capped at 0.95. The chat is
  // skipped (no suggestion) when it has an existing userOverride or
  // acceptedSuggestion (those slots are sacred). Score must clear the user's
  // configured threshold to be emitted.
  function buildCreatedCandidateMap() {
    // categoryId → { sampleChatIds:Set, seedTags:Set, candidate }
    const map = new Map();
    const pool = _catPoolCache;
    if (!pool?.candidates) return map;
    for (const c of pool.candidates) {
      if (c?.status !== 'created' || !c?.createdCategoryId) continue;
      const id = String(c.createdCategoryId);
      const sigs = c.sourceSignals || {};
      const entry = map.get(id) || {
        sampleChatIds: new Set(),
        seedTags: new Set(),
        candidate: c,
      };
      (sigs.sampleChatIds || []).forEach((cid) => entry.sampleChatIds.add(String(cid)));
      (sigs.seedTags || []).forEach((t) => entry.seedTags.add(String(t).toLowerCase()));
      map.set(id, entry);
    }
    return map;
  }

  function buildAutoPoolChatTagMap() {
    // chatId → Set<{ phraseKey, phrase }>. We index BOTH the phraseKey (the
    // auto-pool's normalized form) AND the phrase string lowercased so
    // seed-tag overlap matches whichever shape Phase 8 stored. The candidate
    // pool's seedTags carries phrase strings; the auto-pool keys carry the
    // normalizeTagKey() form. Including both eliminates the
    // normalization-mismatch dead-zone.
    const out = new Map();
    const auto = safeReadTagAutoPool();
    if (!auto?.phrases) return out;
    Object.entries(auto.phrases).forEach(([key, ent]) => {
      if (!ent || ent.blocked || ent.status === 'rejected') return;
      const chats = ent.contribByChat ? Object.keys(ent.contribByChat) : [];
      const phraseLower = String(ent.phrase || key || '').toLowerCase().trim();
      const keyLower = String(key || '').toLowerCase().trim();
      chats.forEach((cid) => {
        let s = out.get(cid);
        if (!s) { s = new Set(); out.set(cid, s); }
        if (keyLower) s.add(keyLower);
        if (phraseLower && phraseLower !== keyLower) s.add(phraseLower);
      });
    });
    return out;
  }

  function scoreChatForCategory(chat, category, createdInfo, chatTagSet) {
    const title = String(chat?.title || '').toLowerCase();
    const titleTokens = new Set(tokenizeTitle(title));
    const catNameKey = String(category?.name || '').toLowerCase().trim();
    const aliasKeys = (category?.aliases || []).map((a) => String(a || '').toLowerCase().trim()).filter(Boolean);

    let score = 0;
    const reasons = [];

    // (a) Title token / alias match.
    if (catNameKey && titleTokens.has(catNameKey)) {
      score += 0.7;
      reasons.push(`title-token:${catNameKey}`);
    } else {
      for (const a of aliasKeys) {
        if (titleTokens.has(a)) { score += 0.6; reasons.push(`alias:${a}`); break; }
      }
    }
    // Substring fallback for multi-word category names that don't tokenize cleanly
    // (e.g. "Web Dev" might appear as a phrase in a title even though we tokenize
    // word-by-word). Lower confidence than a clean token match.
    if (!reasons.length && catNameKey && catNameKey.length >= 3 && title.includes(catNameKey)) {
      score += 0.45;
      reasons.push(`title-substring:${catNameKey}`);
    }

    if (createdInfo) {
      // (b) Sample-chat match — the chat literally seeded this category in Phase 8.
      if (chat?.chatId && createdInfo.sampleChatIds.has(String(chat.chatId))) {
        score += 0.85;
        reasons.push('sample-chat');
      }
      // (c) Seed-tag overlap.
      if (chatTagSet && createdInfo.seedTags.size) {
        let tagHits = 0;
        for (const t of createdInfo.seedTags) {
          if (chatTagSet.has(t)) tagHits += 1;
        }
        if (tagHits > 0) {
          // Each seed tag overlap adds 0.25, capped at 0.5 total contribution.
          const inc = Math.min(0.5, tagHits * 0.25);
          score += inc;
          reasons.push(`seed-tags:${tagHits}`);
        }
      }
    }

    return { score: Number(score.toFixed(3)), reasons };
  }

  async function runAutoClassReview(opts = {}) {
    const t0 = performance.now();
    const prefs = getAutoClassPrefs();
    _autoClassDiag.mode = prefs.mode;
    _autoClassDiag.threshold = prefs.threshold;
    _autoClassDiag.lastRunReason = String(opts.reason || (opts.force ? 'force' : 'manual')).slice(0, 80);
    _autoClassDiag.totalChatsChecked = 0;
    _autoClassDiag.suggestionsGenerated = 0;
    _autoClassDiag.skippedExistingOverride = 0;
    _autoClassDiag.skippedAcceptedSuggestion = 0;
    _autoClassDiag.skippedNoMatch = 0;
    _autoClassDiag.skippedLowConfidence = 0;
    _autoClassDiag.appliedAutoSuggestions = 0;

    if (prefs.mode === 'off') {
      _lastSuggestions = [];
      _autoClassDiag.lastRunAt = Date.now();
      _autoClassDiag.lastRunDurationMs = 0;
      return { ok: true, status: 'mode-off', mode: 'off', suggestionCount: 0, applied: 0 };
    }
    if (!isStoreDurable()) {
      _autoClassDiag.lastFailureReason = 'store-not-durable';
      return { ok: false, status: 'store-not-durable' };
    }
    await loadCategoryOverrides();
    if (!_catPoolCache) await loadCategoryCandidatePool();

    const reg = safeReadKnownChatRegistryRows();
    const catalog = getCatalogEntries();
    if (!reg.length || !catalog.length) {
      _autoClassDiag.lastRunAt = Date.now();
      _autoClassDiag.lastRunDurationMs = Math.round(performance.now() - t0);
      _lastSuggestions = [];
      return { ok: true, status: 'no-data', mode: prefs.mode, suggestionCount: 0, applied: 0 };
    }

    const createdMap = buildCreatedCandidateMap();
    const chatTagsByChatId = buildAutoPoolChatTagMap();
    const newSuggestions = [];

    for (const chat of reg) {
      const chatId = String(chat?.chatId || '').trim();
      if (!chatId) continue;
      _autoClassDiag.totalChatsChecked += 1;

      // Sacred-slot guard: never re-suggest for a chat that has a userOverride
      // OR acceptedSuggestion. The user has already decided; auto code respects
      // that completely.
      const row = _overridesCache?.rows?.[chatId] || null;
      if (row?.userOverride?.primaryCategoryId) {
        _autoClassDiag.skippedExistingOverride += 1;
        continue;
      }
      if (row?.acceptedSuggestion?.primaryCategoryId) {
        _autoClassDiag.skippedAcceptedSuggestion += 1;
        continue;
      }

      // Score every existing category for this chat; pick the best.
      let best = null;
      const tagSet = chatTagsByChatId.get(chatId) || null;
      for (const cat of catalog) {
        if (!cat?.id) continue;
        const createdInfo = createdMap.get(cat.id) || null;
        const { score, reasons } = scoreChatForCategory(chat, cat, createdInfo, tagSet);
        if (!score) continue;
        if (!best || score > best.score) best = { categoryId: cat.id, categoryName: cat.name, score, reasons };
      }
      if (!best) {
        _autoClassDiag.skippedNoMatch += 1;
        continue;
      }
      const confidence = Math.min(0.95, best.score);
      if (confidence < prefs.threshold) {
        _autoClassDiag.skippedLowConfidence += 1;
        continue;
      }
      const suggestion = {
        chatId,
        primaryCategoryId: best.categoryId,
        primaryCategoryName: best.categoryName,
        confidence: Number(confidence.toFixed(3)),
        reason: best.reasons.join('+') || 'unknown',
        signals: best.reasons,
        at: new Date().toISOString(),
      };
      newSuggestions.push(suggestion);
      _autoClassDiag.suggestionsGenerated += 1;

      // apply-new mode: write the autoSuggestion slot inline. Never touches
      // userOverride or acceptedSuggestion. Suggest mode does NOT write.
      if (prefs.mode === 'apply-new') {
        const r = ensureRow(chatId);
        if (r) {
          r.autoSuggestion = {
            primaryCategoryId: best.categoryId,
            primaryCategoryName: best.categoryName,
            confidence: suggestion.confidence,
            reason: suggestion.reason,
            at: suggestion.at,
            algoVersion: 'autoclass-v1',
          };
          _autoClassDiag.appliedAutoSuggestions += 1;
        }
      }
    }

    // Persist overrides only when apply-new actually wrote something (suggest
    // mode does not mutate the durable map).
    if (prefs.mode === 'apply-new' && _autoClassDiag.appliedAutoSuggestions > 0) {
      const persistRes = await persistCategoryOverrides();
      if (!persistRes.ok) {
        _autoClassDiag.lastFailureReason = persistRes.status || 'persist-failed';
        _lastSuggestions = newSuggestions;
        return { ok: false, status: persistRes.status || 'persist-failed', mode: prefs.mode, suggestionCount: newSuggestions.length, applied: 0 };
      }
    }
    _lastSuggestions = newSuggestions;
    _autoClassDiag.lastRunAt = Date.now();
    _autoClassDiag.lastRunDurationMs = Math.round(performance.now() - t0);
    _autoClassDiag.lastFailureReason = '';
    try {
      const detail = { mode: prefs.mode, suggestionCount: newSuggestions.length, applied: _autoClassDiag.appliedAutoSuggestions };
      W.dispatchEvent(new CustomEvent('evt:h2o:library:autoclass-review-completed', { detail }));
      W.dispatchEvent(new CustomEvent('h2o:library:autoclass-review-completed', { detail }));
    } catch (_e) {}
    return {
      ok: true,
      status: 'ok',
      mode: prefs.mode,
      suggestionCount: newSuggestions.length,
      applied: _autoClassDiag.appliedAutoSuggestions,
      skippedExistingOverride: _autoClassDiag.skippedExistingOverride,
      skippedAcceptedSuggestion: _autoClassDiag.skippedAcceptedSuggestion,
      skippedNoMatch: _autoClassDiag.skippedNoMatch,
      skippedLowConfidence: _autoClassDiag.skippedLowConfidence,
    };
  }

  function getAutoClassSuggestions() {
    return _lastSuggestions.slice();
  }

  async function applyAutoClassSuggestion(chatIdRaw, suggestion) {
    const chatId = String(chatIdRaw || '').trim();
    if (!chatId) return { ok: false, status: 'invalid-chat-id' };
    if (!suggestion || !suggestion.primaryCategoryId) return { ok: false, status: 'invalid-suggestion' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    await loadCategoryOverrides();
    const row = ensureRow(chatId);
    if (!row) return { ok: false, status: 'invalid-chat-id' };
    // Boundary: applyAutoClassSuggestion writes the acceptedSuggestion slot
    // ONLY. It does NOT touch userOverride.
    row.acceptedSuggestion = {
      primaryCategoryId: String(suggestion.primaryCategoryId),
      primaryCategoryName: String(suggestion.primaryCategoryName || ''),
      confidence: Number.isFinite(Number(suggestion.confidence)) ? Number(suggestion.confidence) : null,
      at: new Date().toISOString(),
    };
    const persistRes = await persistCategoryOverrides();
    if (!persistRes.ok) return { ok: false, status: persistRes.status };
    return { ok: true, status: 'ok', row: { ...row } };
  }

  async function rejectAutoClassSuggestion(chatIdRaw, suggestion) {
    const chatId = String(chatIdRaw || '').trim();
    if (!chatId) return { ok: false, status: 'invalid-chat-id' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    await loadCategoryOverrides();
    const row = ensureRow(chatId);
    if (!row) return { ok: false, status: 'invalid-chat-id' };
    // Drop the autoSuggestion slot if it matches the rejected suggestion's category;
    // record the rejection so a future apply-new run can skip re-suggesting the
    // same category.
    const targetCat = String(suggestion?.primaryCategoryId || '').trim();
    if (row.autoSuggestion?.primaryCategoryId === targetCat) {
      delete row.autoSuggestion;
    }
    if (!Array.isArray(row.rejectedSuggestions)) row.rejectedSuggestions = [];
    if (targetCat && !row.rejectedSuggestions.includes(targetCat)) {
      row.rejectedSuggestions.push(targetCat);
    }
    const persistRes = await persistCategoryOverrides();
    if (!persistRes.ok) return { ok: false, status: persistRes.status };
    return { ok: true, status: 'ok' };
  }

  async function setUserCategoryOverride(chatIdRaw, value, opts = {}) {
    const chatId = String(chatIdRaw || '').trim();
    if (!chatId) return { ok: false, status: 'invalid-chat-id' };
    if (!isStoreDurable()) return { ok: false, status: 'store-not-durable' };
    await loadCategoryOverrides();
    const row = ensureRow(chatId);
    if (!row) return { ok: false, status: 'invalid-chat-id' };
    const force = opts.force === true;
    // value === null → clear the override
    if (value === null) {
      if (row.userOverride && !force) {
        delete row.userOverride;
      } else if (force) {
        delete row.userOverride;
      }
      const persistRes = await persistCategoryOverrides();
      if (!persistRes.ok) return { ok: false, status: persistRes.status };
      return { ok: true, status: 'cleared' };
    }
    if (!value?.primaryCategoryId) return { ok: false, status: 'invalid-value' };
    if (row.userOverride?.primaryCategoryId && !force) {
      return { ok: false, status: 'override-exists' };
    }
    row.userOverride = {
      primaryCategoryId: String(value.primaryCategoryId),
      primaryCategoryName: String(value.primaryCategoryName || ''),
      secondaryCategoryId: String(value.secondaryCategoryId || ''),
      at: new Date().toISOString(),
      reviewer: 'user',
    };
    const persistRes = await persistCategoryOverrides();
    if (!persistRes.ok) return { ok: false, status: persistRes.status };
    return { ok: true, status: 'ok', override: { ...row.userOverride } };
  }

  function getCategoryOverrides() {
    return _overridesCache;
  }

  function getAutoClassDiagnostics() {
    // Phase 11 polish: fire-and-forget hydration of the overrides cache so subsequent
    // calls see Store truth. Same idempotency rule as the candidates diagnostics.
    if (!_overridesCache) loadCategoryOverrides().catch(() => {});
    const Store = getLibraryStore();
    let durable = false;
    let backend = '';
    try {
      const caps = Store?.caps?.();
      durable = !!caps?.durable;
      backend = String(caps?.primary || Store?.backend?.() || '');
    } catch (_e) {}
    const prefs = getAutoClassPrefs();
    const totalRows = _overridesCache?.rows ? Object.keys(_overridesCache.rows).length : 0;
    const slotCounts = { autoSuggestion: 0, acceptedSuggestion: 0, userOverride: 0 };
    if (_overridesCache?.rows) {
      for (const r of Object.values(_overridesCache.rows)) {
        if (r?.autoSuggestion?.primaryCategoryId)     slotCounts.autoSuggestion += 1;
        if (r?.acceptedSuggestion?.primaryCategoryId) slotCounts.acceptedSuggestion += 1;
        if (r?.userOverride?.primaryCategoryId)       slotCounts.userOverride += 1;
      }
    }
    return {
      key:                       OVERRIDES_KEY,
      prefsKey:                  AUTOCLASS_PREFS_KEY,
      mode:                      prefs.mode,
      threshold:                 prefs.threshold,
      durable,
      backend,
      cacheHydrated:             !!_overridesCache,
      totalRowsWithOverrides:    totalRows,
      slotCounts,
      ...(_autoClassDiag),
      lastSuggestionCount:       _lastSuggestions.length,
    };
  }

  // Boot-time hydration: best-effort load of any persisted overrides so callers
  // that read getCategoryOverrides() before runAutoClassReview() see the cached
  // snapshot. Non-blocking.
  loadCategoryOverrides().catch((e) => err('autoclass:boot-load', e));

  const owner = {
    phase: 'phase-c6-owner-refresh-hooks',
    loadGroups() { return loadGroupsDirect(); },
    normalizeCategoryIcon(raw) { return normalizeCategoryIcon(raw); },
    getAppearance(group, ui) { return getCategoryAppearance(group, ui); },
    setAppearance(categoryId, patch = {}) { return setCategoryAppearance(categoryId, patch); },
    iconOptionForKey(key) { return iconOptionForKey(key); },
    iconSvg(key) { return categoryIconSvg(key); },
    iconSvgForAppearance(appearance) { return categoryIconSvgForAppearance(appearance); },
    openAppearanceEditor(anchorEl, group, afterChange = null) { return openCategoryAppearanceEditor(anchorEl, group, afterChange); },
    appendPanelRow(list, group) { return appendPanelCategoryRow(list, group); },
    appendInShellRow(list, group) { return appendInShellCategoryRow(list, group); },
    openViewer(groupRaw, opts = {}) { return openCategoryViewer(groupRaw, opts); },
    openPanel(groupRaw) { return openCategoryPanel(groupRaw); },
    openByMode(groupRaw) { return openCategoryByMode(groupRaw); },
    openCategoriesViewer(groupsRaw, opts = {}) { return openCategoriesViewer(groupsRaw, opts); },
    openCategoriesPanel(groupsRaw) { return openCategoriesPanel(groupsRaw); },
    openCategoriesByMode(groupsRaw) { return openCategoriesByMode(groupsRaw); },
    buildSection(projectsSection, existingSection = null, reason = 'api') { return buildCategoriesSection(projectsSection, existingSection, reason); },
    refreshActivePageForAppearance(kind, id) { return refreshActivePageForAppearance(kind, id); },

    // Phase 8 — Category Candidate Pool (read-only generation; no chat assignment).
    getCategoryCandidatePool() { return getCategoryCandidatePool(); },
    refreshCategoryCandidatePool(opts = {}) { return refreshCategoryCandidatePool(opts); },
    previewCategoryCandidate(candidateId) { return previewCategoryCandidate(candidateId); },
    acceptCategoryCandidate(candidateId, opts = {}) { return acceptCategoryCandidate(candidateId, opts); },
    rejectCategoryCandidate(candidateId) { return rejectCategoryCandidate(candidateId); },
    mergeCategoryCandidate(candidateId, intoCategoryId) { return mergeCategoryCandidate(candidateId, intoCategoryId); },
    getCategoryCandidateDiagnostics() { return getCategoryCandidateDiagnostics(); },

    // Phase 9 — Auto-classification Review Mode (off / suggest / apply-new).
    getAutoClassPrefs() { return getAutoClassPrefs(); },
    setAutoClassPrefs(patch = {}) { return setAutoClassPrefs(patch); },
    runAutoClassReview(opts = {}) { return runAutoClassReview(opts); },
    getAutoClassSuggestions() { return getAutoClassSuggestions(); },
    applyAutoClassSuggestion(chatId, suggestion) { return applyAutoClassSuggestion(chatId, suggestion); },
    rejectAutoClassSuggestion(chatId, suggestion) { return rejectAutoClassSuggestion(chatId, suggestion); },
    setUserCategoryOverride(chatId, value, opts = {}) { return setUserCategoryOverride(chatId, value, opts); },
    getCategoryOverrides() { return getCategoryOverrides(); },
    getAutoClassDiagnostics() { return getAutoClassDiagnostics(); },
  };

  MOD.owner = owner;
  MOD.data = MOD.data || {};
  MOD.data.getCatalogEntries = getCatalogEntries;
  MOD.data.nativeHrefForRow = nativeHrefForRow;
  MOD.data.collectGroups = collectGroups;
  MOD.data.loadGroupsDirect = loadGroupsDirect;
  MOD.appearance = MOD.appearance || {};
  MOD.appearance.normalizeCategoryIcon = normalizeCategoryIcon;
  MOD.appearance.getAppearance = getCategoryAppearance;
  MOD.appearance.setAppearance = setCategoryAppearance;
  MOD.appearance.iconOptionForKey = iconOptionForKey;
  MOD.appearance.iconSvg = categoryIconSvg;
  // Expose the appearance-aware variant so the sidebar (0F3a Folders) and any
  // future consumer can render the category panels placeholder when a category
  // hasn't had an icon picked yet.
  MOD.appearance.iconSvgForAppearance = categoryIconSvgForAppearance;
  MOD.appearance.placeholderSvg = FRAG_SVG_CATEGORY_PLACEHOLDER;
  MOD.appearance.openAppearanceEditor = openCategoryAppearanceEditor;
  MOD.appearance.refreshActivePageForAppearance = refreshActivePageForAppearance;
  MOD.render = MOD.render || {};
  MOD.render.appendPanelRow = appendPanelCategoryRow;
  MOD.render.appendInShellRow = appendInShellCategoryRow;
  MOD.loadGroups = (...args) => owner.loadGroups(...args);
  MOD.getAppearance = (...args) => owner.getAppearance(...args);
  MOD.setAppearance = (...args) => owner.setAppearance(...args);
  MOD.openAppearanceEditor = (...args) => owner.openAppearanceEditor(...args);
  MOD.appendPanelRow = (...args) => owner.appendPanelRow(...args);
  MOD.appendInShellRow = (...args) => owner.appendInShellRow(...args);
  MOD.openViewer = (...args) => owner.openViewer(...args);
  MOD.openPanel = (...args) => owner.openPanel(...args);
  MOD.openByMode = (...args) => owner.openByMode(...args);
  MOD.openCategoriesViewer = (...args) => owner.openCategoriesViewer(...args);
  MOD.openCategoriesPanel = (...args) => owner.openCategoriesPanel(...args);
  MOD.openCategoriesByMode = (...args) => owner.openCategoriesByMode(...args);
  MOD.buildSection = (...args) => owner.buildSection(...args);
  MOD.refreshActivePageForAppearance = (...args) => owner.refreshActivePageForAppearance(...args);
  // Phase 8 — Category Candidate Pool. APIs only; no UI added in this phase.
  MOD.getCategoryCandidatePool = (...args) => owner.getCategoryCandidatePool(...args);
  MOD.refreshCategoryCandidatePool = (...args) => owner.refreshCategoryCandidatePool(...args);
  MOD.previewCategoryCandidate = (...args) => owner.previewCategoryCandidate(...args);
  MOD.acceptCategoryCandidate = (...args) => owner.acceptCategoryCandidate(...args);
  MOD.rejectCategoryCandidate = (...args) => owner.rejectCategoryCandidate(...args);
  MOD.mergeCategoryCandidate = (...args) => owner.mergeCategoryCandidate(...args);
  MOD.getCategoryCandidateDiagnostics = (...args) => owner.getCategoryCandidateDiagnostics(...args);
  // Phase 9 — Auto-classification Review Mode.
  MOD.getAutoClassPrefs = (...args) => owner.getAutoClassPrefs(...args);
  MOD.setAutoClassPrefs = (...args) => owner.setAutoClassPrefs(...args);
  MOD.runAutoClassReview = (...args) => owner.runAutoClassReview(...args);
  MOD.getAutoClassSuggestions = (...args) => owner.getAutoClassSuggestions(...args);
  MOD.applyAutoClassSuggestion = (...args) => owner.applyAutoClassSuggestion(...args);
  MOD.rejectAutoClassSuggestion = (...args) => owner.rejectAutoClassSuggestion(...args);
  MOD.setUserCategoryOverride = (...args) => owner.setUserCategoryOverride(...args);
  MOD.getCategoryOverrides = (...args) => owner.getCategoryOverrides(...args);
  MOD.getAutoClassDiagnostics = (...args) => owner.getAutoClassDiagnostics(...args);

  bindTagCategoryLinkRefresh();

  try {
    core.registerOwner?.('categories', owner, { replace: true });
    core.registerService?.('categories', owner, { replace: true }); // intentionally both: owner for boundary checks, service for cross-module lookup
    core.registerRoute?.('categories', async (route) => {
      const groups = await owner.loadGroups();
      return owner.openCategoriesViewer(groups, { fromRoute: true, baseHref: route?.baseHref });
    }, { replace: true });
    core.registerRoute?.('category', async (route) => {
      const groups = await owner.loadGroups();
      const match = Array.isArray(groups)
        ? groups.find((item) => String(item?.id || '') === String(route?.id || ''))
        : null;
      if (match) return owner.openViewer(match, { fromRoute: true, baseHref: route?.baseHref });
      return null;
    }, { replace: true });
    step('categories-owner-registered');
  } catch (e) {
    err('register-categories-owner', e);
  }
})();
