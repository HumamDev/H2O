// ==UserScript==
// @h2o-id             s0f3a.folders.studio
// @name               S0F3a. 🎬 Folders - Studio
// @namespace          H2O.Premium.CGX.folders.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000009
// @description        Studio Folders facade. Exposes H2O.folders.* with the surface-agnostic subset used by Library Workspace, Insights, and studio.js. Backed by the chat-list service (archive bridge) — no native sidebar inject, no history wrapping. Studio routes (#/library/folder/<id>) replace native query-flag routes.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F3a Folders (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 50, errMax: 15 };
  const step = (s, o = '') => {
    try { diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s), o: String(o) }); if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax); } catch {}
  };
  const err = (s, e) => {
    try { diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s), e: String(e?.stack || e) }); if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax); } catch {}
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getWorkspace() { return H2O.LibraryWorkspace || null; }
  function getIndex() { return H2O.LibraryIndex || null; }

  let cachedFolders = null;
  let cachedAt = 0;
  const TTL_MS = 30_000;

  async function listFolders({ fresh = false } = {}) {
    const now = Date.now();
    if (!fresh && cachedFolders && (now - cachedAt) < TTL_MS) return cachedFolders;
    const ws = getWorkspace();
    const list = ws ? await ws.getFolders({ fresh }) : [];
    cachedFolders = Array.isArray(list) ? list.slice() : [];
    cachedAt = now;
    return cachedFolders;
  }

  async function getFolderById(folderId) {
    const id = String(folderId || '').trim();
    if (!id) return null;
    const list = await listFolders();
    return list.find((f) => String(f.id || f.folderId || '') === id) || null;
  }

  async function getChatsInFolder(folderId) {
    const idx = getIndex();
    if (!idx) return [];
    return idx.query({ folderId: String(folderId || '') });
  }

  async function setBinding(chatId, folderId) {
    const ws = getWorkspace();
    if (!ws) throw new Error('library-workspace unavailable');
    return ws.setFolderBinding(chatId, folderId);
  }

  function buildRouteHash(folderId) {
    return getCore()?.getService?.('route')?.buildLibraryHash?.('folder', folderId) || '';
  }

  const Folders = {
    surface: 'studio',
    listFolders,
    getFolderById,
    getChatsInFolder,
    setBinding,
    buildRouteHash,
    async refresh() { return listFolders({ fresh: true }); },
    diagnose() {
      return {
        surface: 'studio',
        cached: !!cachedFolders,
        cachedCount: cachedFolders ? cachedFolders.length : 0,
        cachedAt,
        hasWorkspace: !!getWorkspace(),
        hasIndex: !!getIndex(),
        steps: diag.steps.slice(-10),
        errors: diag.errors.slice(-5),
      };
    },
  };

  // Expose to match the native H2O.folders namespace shape.
  H2O.folders = H2O.folders || Folders;
  // Always expose the Studio facade under H2O.Library.Folders so studio.js + Library modules can find it cleanly.
  H2O.Library = H2O.Library || {};
  H2O.Library.Folders = Folders;

  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('folders', Folders, { replace: true });
      core.registerService('folders', Folders, { replace: true });
      // Register Studio folder route handler
      core.registerRoute('folder', async (route) => {
        const id = String(route?.id || '').trim();
        step('route:folder', id);
        return true;
      }, { replace: true });
      core.registerRoute('folders', async () => { step('route:folders'); return true; }, { replace: true });
      step('register-on-core', 'folders');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  step('boot', 'studio-folders-ready');
})();
