// ==UserScript==
// @h2o-id             s0f4a.categories.studio
// @name               S0F4a. 🎬 Categories - Studio
// @namespace          H2O.Premium.CGX.categories.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000010
// @description        Studio Categories facade. Exposes H2O.Categories.* / H2O.Library.Categories with the surface-agnostic subset used by Library Workspace, Insights, and studio.js. Mutations write through the chat-list service to the MV3 archive bridge. No native sidebar coupling.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F4a Categories (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => { try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {} };
  const err = (s, e) => { try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {} };

  function getCore() { return H2O.LibraryCore || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function categoryCore() {
    try {
      const core = H2O.Library?.CategoryProviderCore || null;
      return core && core.__phase === '4B' ? core : null;
    } catch {
      return null;
    }
  }

  let cachedCatalog = null;
  let cachedAt = 0;
  let lastCategoryDiagnostics = [];
  const TTL_MS = 30_000;

  function mergeNormalizedCategory(raw, normalized) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const category = normalized && typeof normalized === 'object' ? normalized : {};
    const id = String(category.id || src.id || src.categoryId || '').trim();
    const name = String(category.name || src.name || src.categoryName || src.label || id).trim() || id;
    return {
      ...src,
      ...category,
      id,
      categoryId: String(src.categoryId || id).trim() || id,
      name,
      categoryName: String(src.categoryName || name).trim() || name,
    };
  }

  function normalizeCategoryList(rawList) {
    const list = Array.isArray(rawList) ? rawList : [];
    const core = categoryCore();
    lastCategoryDiagnostics = [];
    if (!core || typeof core.normalizeCategoryCatalog !== 'function') return list.slice();
    try {
      const normalized = core.normalizeCategoryCatalog({ categories: list });
      lastCategoryDiagnostics = Array.isArray(normalized?.diagnostics) ? normalized.diagnostics : [];
      const firstRawById = new Map();
      for (const row of list) {
        const id = String(row?.id || row?.categoryId || '').trim();
        if (id && !firstRawById.has(id)) firstRawById.set(id, row);
      }
      return (normalized?.categories || []).map((category) => mergeNormalizedCategory(firstRawById.get(category.id), category));
    } catch (e) {
      err('normalizeCategoryList', e);
      return list.slice();
    }
  }

  function normalizeCategoryId(categoryId) {
    return String(categoryId || '').trim();
  }

  function resolveCategoryIdForRead(categoryId, list) {
    const id = normalizeCategoryId(categoryId);
    if (!id) return '';
    const core = categoryCore();
    if (core && typeof core.validateCategoryId === 'function') {
      try {
        const valid = core.validateCategoryId(id);
        if (!valid?.ok && !(Array.isArray(list) && list.some((c) => String(c?.id || c?.categoryId || '') === id))) return '';
      } catch (e) {
        err('validateCategoryId', e);
      }
    }
    if (core && typeof core.resolveCategoryId === 'function') {
      try {
        const resolved = core.resolveCategoryId(id, { categories: Array.isArray(list) ? list : [] });
        if (resolved?.ok && resolved.categoryId) return String(resolved.categoryId);
      } catch (e) {
        err('resolveCategoryId', e);
      }
    }
    return id;
  }

  async function listCategories({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedCatalog && (now - cachedAt) < TTL_MS) return cachedCatalog;
    const ws = getWorkspace();
    const list = ws ? await ws.getCategories({ fresh }) : [];
    cachedCatalog = normalizeCategoryList(list);
    cachedAt = now;
    return cachedCatalog;
  }

  async function getCategoryById(id) {
    const cid = normalizeCategoryId(id);
    if (!cid) return null;
    const list = await listCategories();
    const resolvedId = resolveCategoryIdForRead(cid, list);
    if (!resolvedId) return null;
    return list.find((c) => String(c.id || c.categoryId || '') === resolvedId)
      || list.find((c) => String(c.id || c.categoryId || '') === cid)
      || null;
  }

  async function getChatsInCategory(id) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ categoryId: String(id || '') });
  }

  async function setSnapshotCategory(snapshotId, chatId, categoryId) {
    const ws = getWorkspace();
    if (!ws) throw new Error('library-workspace unavailable');
    return ws.setSnapshotCategory(snapshotId, chatId, categoryId);
  }

  const Categories = {
    surface: 'studio',
    listCategories,
    getCategoryById,
    getChatsInCategory,
    setSnapshotCategory,
    async refresh() { return listCategories({ fresh: true }); },
    diagnose() {
      return {
        surface: 'studio',
        cachedCount: cachedCatalog ? cachedCatalog.length : 0,
        cachedAt,
        hasWorkspace: !!getWorkspace(),
        hasIndex: !!getIndex(),
        hasCategoryCore: !!categoryCore(),
        categoryCorePhase: categoryCore()?.__phase || '',
        normalizationDiagnostics: lastCategoryDiagnostics.slice(-10),
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };

  H2O.Categories = H2O.Categories || Categories;
  H2O.Library.Categories = Categories;

  function registerOnCore() {
    const core = getCore();
    if (!core) return false;
    try {
      core.registerOwner('categories', Categories, { replace: true });
      core.registerService('categories', Categories, { replace: true });
      core.registerRoute('category', async (route) => { step('route:category', route?.id || ''); return true; }, { replace: true });
      core.registerRoute('categories', async () => { step('route:categories'); return true; }, { replace: true });
      step('register-on-core', 'categories');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });

  step('boot', 'studio-categories-ready');
})();
