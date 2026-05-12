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

  let cachedCatalog = null;
  let cachedAt = 0;
  const TTL_MS = 30_000;

  async function listCategories({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedCatalog && (now - cachedAt) < TTL_MS) return cachedCatalog;
    const ws = getWorkspace();
    const list = ws ? await ws.getCategories({ fresh }) : [];
    cachedCatalog = Array.isArray(list) ? list.slice() : [];
    cachedAt = now;
    return cachedCatalog;
  }

  async function getCategoryById(id) {
    const cid = String(id || '').trim();
    if (!cid) return null;
    const list = await listCategories();
    return list.find((c) => String(c.id || c.categoryId || '') === cid) || null;
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
