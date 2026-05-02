// ==UserScript==
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
// ==/UserScript==

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
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7.5h14M5 12h14M5 16.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M8 5.5 6.8 18.5M17.2 5.5 16 18.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  `;

  const CFG_CATEGORY_ICON_OPTIONS = Object.freeze([
    { key: 'hash', label: 'Hash', svg: FRAG_SVG_CATEGORY },
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
      if (!entry.custom || groups.has(entry.id)) continue;
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
    };
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

    btn.appendChild(makePanelIcon(categoryIconSvg(appearance.icon), appearance.color));

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

  function appendInShellCategoryRow(list, group) {
    if (!list || !group) return null;
    const appearance = getCategoryAppearance(group);
    const li = W.document.createElement('li');
    li.className = 'group/project-item hover:bg-token-interactive-bg-secondary-hover active:bg-token-interactive-bg-secondary-press flex min-h-16 cursor-pointer items-center p-3 text-sm select-none';

    const btn = W.document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(ATTR_CGXUI_STATE, 'category-button');
    btn.onclick = () => owner.openViewer(group);

    const icon = makePanelIcon(categoryIconSvg(appearance.icon), appearance.color);
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
    title.textContent = group.name || group.id || 'Category';
    body.appendChild(title);

    const sub = W.document.createElement('div');
    sub.setAttribute(ATTR_CGXUI_STATE, 'row-sub');
    sub.textContent = `${Array.isArray(group.rows) ? group.rows.length : 0} chats`;
    body.appendChild(sub);

    btn.appendChild(body);
    li.appendChild(btn);
    list.appendChild(li);
    return li;
  }

  function openCategoryAppearanceEditor(anchorEl, group, afterChange = null) {
    if (!anchorEl || !group) return null;
    const compat = getCompat();
    const openFolderPop = compat && compat.openFolderPop;
    if (typeof openFolderPop !== 'function') return null;
    const appearance = getCategoryAppearance(group);
    return openFolderPop(anchorEl, [
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
    ]);
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
      iconSvg: categoryIconSvg(appearance.icon),
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
      iconSvg: categoryIconSvg(appearance.icon),
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

    const shell = makeInShellPageShell('Categories', `${groups.length} categories`, 'Categories', { kind: 'categories' });
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
      compat.injectIcon?.(row, categoryIconSvg(appearance.icon), { color: appearance.color });
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
        const more = doc.createElement('button');
        more.type = 'button';
        more.textContent = '⋯';
        more.title = 'Category appearance';
        more.setAttribute('data-cgxui', compat.categoryMoreToken || 'flsc-category-more');
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

  const owner = {
    phase: 'phase-c6-owner-refresh-hooks',
    loadGroups() { return loadGroupsDirect(); },
    normalizeCategoryIcon(raw) { return normalizeCategoryIcon(raw); },
    getAppearance(group, ui) { return getCategoryAppearance(group, ui); },
    setAppearance(categoryId, patch = {}) { return setCategoryAppearance(categoryId, patch); },
    iconOptionForKey(key) { return iconOptionForKey(key); },
    iconSvg(key) { return categoryIconSvg(key); },
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
