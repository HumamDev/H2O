// ==UserScript==
// @h2o-id             s0f1b.library_workspace.studio
// @name               S0F1b. 🎬 Library Workspace - Studio
// @namespace          H2O.Premium.CGX.library_workspace.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000006
// @description        Studio Library Workspace: canonical model facade for studio.js and Library Insights. Exposes getKnownChats / getFolders / getCategories / getLabels / getTags / getProjects with built-in caching and event subscriptions. Replaces ad-hoc chrome.runtime calls in studio.js with one stable API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1b Library Workspace (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const LAYOUT_KEY = 'h2o:prm:cgx:library-workspace:sidebar-layout:v1';

  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 100, errMax: 25 };
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

  const cache = {
    folders: { value: null, ts: 0, ttl: 60_000 },
    categories: { value: null, ts: 0, ttl: 60_000 },
    labels: { value: null, ts: 0, ttl: 60_000 },
    layout: null,
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getIndex() { return H2O.LibraryIndex || null; }
  function getChatList() { return getCore()?.getService?.('chat-list') || null; }
  function getRouteSvc() { return getCore()?.getService?.('route') || null; }
  function getUIShell() { return getCore()?.getService?.('ui-shell') || null; }
  function getPageHost() { return getCore()?.getService?.('page-host') || null; }
  function getSidebarSvc() { return getCore()?.getService?.('native-sidebar') || null; }
  function getRegistry() { return H2O.ChatRegistry || null; }

  // ── Layout persistence ─────────────────────────────────────────────────────
  function loadLayout() {
    if (cache.layout) return cache.layout;
    try {
      const raw = W.localStorage.getItem(LAYOUT_KEY);
      cache.layout = raw ? JSON.parse(raw) : { sidebarExpanded: true, view: 'saved' };
    } catch (e) { err('loadLayout', e); cache.layout = { sidebarExpanded: true, view: 'saved' }; }
    return cache.layout;
  }
  function saveLayout(patch) {
    try {
      const next = { ...loadLayout(), ...(patch || {}) };
      cache.layout = next;
      W.localStorage.setItem(LAYOUT_KEY, JSON.stringify(next));
      step('saveLayout', JSON.stringify(next));
      return true;
    } catch (e) { err('saveLayout', e); return false; }
  }

  // ── Cache helpers ──────────────────────────────────────────────────────────
  function isFresh(slot) {
    return slot && slot.value != null && (Date.now() - slot.ts) < slot.ttl;
  }
  function setCache(slot, value) {
    slot.value = value;
    slot.ts = Date.now();
  }
  function bustCaches(reason) {
    cache.folders.value = null;
    cache.categories.value = null;
    cache.labels.value = null;
    step('cache-bust', String(reason || ''));
    // Notify subscribers that derived caches were invalidated. Library Sync uses
    // this to coordinate cross-surface refreshes; Insights uses it to re-render.
    try {
      W.dispatchEvent(new CustomEvent('evt:h2o:library-workspace:cache-bust', {
        detail: { reason: String(reason || ''), surface: 'studio', t: Date.now() },
      }));
    } catch {}
  }

  // ── Model fetchers ─────────────────────────────────────────────────────────
  async function getKnownChats({ view = 'saved', folderId = '', filters = {}, fresh = false } = {}) {
    const index = getIndex();
    if (!index) {
      const cl = getChatList();
      if (cl) {
        try { return await cl.listByView(view); } catch (e) { err('getKnownChats.fallback', e); return []; }
      }
      return [];
    }
    if (fresh) {
      try { await index.refresh('workspace.fresh'); } catch (e) { err('getKnownChats.refresh', e); }
    }
    const rows = index.query({ view, folderId, ...filters });
    return rows;
  }

  async function getFolders({ fresh = false } = {}) {
    if (!fresh && isFresh(cache.folders)) return cache.folders.value;
    const cl = getChatList();
    if (!cl) return [];
    try {
      const list = await cl.getFoldersList();
      setCache(cache.folders, Array.isArray(list) ? list : []);
      return cache.folders.value;
    } catch (e) { err('getFolders', e); return cache.folders.value || []; }
  }

  async function getCategories({ fresh = false } = {}) {
    if (!fresh && isFresh(cache.categories)) return cache.categories.value;
    const cl = getChatList();
    if (!cl) return [];
    try {
      const list = await cl.getCategoriesCatalog();
      setCache(cache.categories, Array.isArray(list) ? list : []);
      return cache.categories.value;
    } catch (e) { err('getCategories', e); return cache.categories.value || []; }
  }

  async function getLabels({ fresh = false } = {}) {
    if (!fresh && isFresh(cache.labels)) return cache.labels.value;
    const cl = getChatList();
    if (!cl) return [];
    try {
      const list = await cl.getLabelsCatalog();
      setCache(cache.labels, Array.isArray(list) ? list : []);
      return cache.labels.value;
    } catch (e) { err('getLabels', e); return cache.labels.value || []; }
  }

  async function getTags() {
    const index = getIndex();
    if (!index) return [];
    const counts = index.counts().tags || {};
    return Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }

  async function getProjects() {
    const index = getIndex();
    if (!index) return [];
    const f = index.facets();
    return Object.entries(f.byProject || {})
      .map(([id, chatIds]) => ({ id, chatIds: chatIds.slice(), count: chatIds.length }));
  }

  async function resolveFolderBindings(chatIds) {
    const cl = getChatList();
    if (!cl) return {};
    try { return await cl.resolveFolderBindings(chatIds); }
    catch (e) { err('resolveFolderBindings', e); return {}; }
  }

  // ── Mutations (write through to archive bridge, then refresh) ──────────────
  // Every mutation:
  //   1. Sends the write through the chat-list service (archive bridge).
  //   2. Busts the local Workspace caches so the next read picks up fresh data.
  //   3. Triggers a Library Index refresh (in-flight calls dedup automatically,
  //      so a batch of 50 mutations costs only one archive scan).
  //   4. Emits 'library-workspace:updated' so Insights/Sidebar/studio.js
  //      subscribers re-render.
  //   5. Library Sync (S0F1h) picks up the resulting chrome.storage changes
  //      and broadcasts to native — closing the cross-surface loop.

  async function setFolderBinding(chatId, folderId, opts = {}) {
    const cl = getChatList();
    if (!cl) throw new Error('chat-list service unavailable');
    const result = await cl.setFolderBinding(chatId, folderId, opts);
    if (result?.ok === false) {
      step('setFolderBinding.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setFolderBinding');
    try { await getIndex()?.refresh('setFolderBinding'); } catch {}
    emitUpdated('folder-binding-changed', { chatId, folderId, source: opts?.source || null });
    return result;
  }

  function categoryWriteFailure(status, snapshotId, chatId, categoryId, reason) {
    return {
      ok: false,
      status: String(status || 'category-write-failed'),
      reason: String(reason || status || 'category-write-failed'),
      snapshotId: String(snapshotId || ''),
      chatId: String(chatId || ''),
      categoryId: String(categoryId || ''),
    };
  }

  function isCategoryBridgeTransportError(error) {
    const msg = String(error?.stack || error?.message || error || '');
    return /Could not establish connection|Receiving end does not exist|archive bridge|category bridge|Extension context invalidated|context invalidated/i.test(msg);
  }

  async function setSnapshotCategory(snapshotId, chatId, categoryId) {
    const sid = String(snapshotId || '').trim();
    const cid = String(chatId || '').trim();
    const category = String(categoryId || '').trim();
    if (!sid) return categoryWriteFailure('missing-snapshot-id', sid, cid, category);
    if (!category) return categoryWriteFailure('missing-category-id', sid, cid, category);

    const cl = getChatList();
    if (!cl || typeof cl.setSnapshotCategory !== 'function') {
      return categoryWriteFailure('category-bridge-unavailable', sid, cid, category, 'chat-list service unavailable');
    }

    let result;
    try {
      result = await cl.setSnapshotCategory(sid, cid, category);
    } catch (e) {
      const status = isCategoryBridgeTransportError(e) ? 'category-bridge-unavailable' : 'category-write-failed';
      step('setSnapshotCategory.rejected', status);
      err('setSnapshotCategory', e);
      return categoryWriteFailure(status, sid, cid, category, String(e?.message || e || status));
    }
    if (result?.ok === false) {
      step('setSnapshotCategory.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setSnapshotCategory');
    try { await getIndex()?.refresh('setSnapshotCategory'); } catch {}
    emitUpdated('category-changed', { snapshotId: sid, chatId: cid, categoryId: category });
    return result;
  }

  async function reclassifySnapshotCategory(snapshotId) {
    const cl = getChatList();
    if (!cl || typeof cl.reclassifySnapshotCategory !== 'function') {
      throw new Error('reclassifySnapshotCategory unavailable on chat-list service');
    }
    const result = await cl.reclassifySnapshotCategory(snapshotId);
    bustCaches('reclassifySnapshotCategory');
    try { await getIndex()?.refresh('reclassifySnapshotCategory'); } catch {}
    emitUpdated('category-reclassified', { snapshotId });
    return result;
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────
  const subscribers = new Set();
  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }
  function emitUpdated(reason, detail) {
    const payload = { reason: String(reason || ''), detail: detail || null, t: Date.now(), surface: 'studio' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library-workspace:updated', { detail: payload })); } catch {}
    try { W.H2O?.events?.emit?.('library-workspace:updated', payload); } catch {}
    subscribers.forEach((fn) => { try { fn(payload); } catch (e) { err('subscriber', e); } });
  }

  // When Index refreshes, bust caches and propagate.
  function bindIndex() {
    const idx = getIndex();
    if (!idx || typeof idx.subscribe !== 'function') return false;
    idx.subscribe((detail) => {
      bustCaches('index-updated');
      emitUpdated('index-updated', detail);
    });
    return true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const Workspace = {
    surface: 'studio',

    // Model accessors
    getKnownChats,
    getFolders,
    getCategories,
    getLabels,
    getTags,
    getProjects,
    resolveFolderBindings,

    // Mutations
    setFolderBinding,
    setSnapshotCategory,
    reclassifySnapshotCategory,

    // Layout
    getLayout: loadLayout,
    setLayout: saveLayout,

    // Routing helpers
    parseRoute() { return getRouteSvc()?.current?.() || null; },
    onRouteChange(fn) { return getRouteSvc()?.on?.(fn) || (() => {}); },
    buildLibraryHash(view, id) { return getRouteSvc()?.buildLibraryHash?.(view, id) || ''; },

    // Renderers / surface helpers
    services() {
      return {
        uiShell: getUIShell(),
        pageHost: getPageHost(),
        sidebar: getSidebarSvc(),
        route: getRouteSvc(),
        chatList: getChatList(),
        registry: getRegistry(),
        index: getIndex(),
      };
    },

    // Subscriptions
    subscribe,

    // Internals (used by Library Sync)
    _bustCaches: bustCaches,

    // Diagnose / self-check
    diagnose() {
      const idx = getIndex();
      return {
        surface: 'studio',
        ready: !!idx && idx.diagnose().ready,
        services: {
          uiShell: !!getUIShell(),
          pageHost: !!getPageHost(),
          sidebar: !!getSidebarSvc(),
          route: !!getRouteSvc(),
          chatList: !!getChatList(),
          registry: !!getRegistry(),
          index: !!idx,
        },
        cache: {
          folders: { hasValue: !!cache.folders.value, ts: cache.folders.ts },
          categories: { hasValue: !!cache.categories.value, ts: cache.categories.ts },
          labels: { hasValue: !!cache.labels.value, ts: cache.labels.ts },
        },
        indexCounts: idx?.counts?.() || null,
        layout: loadLayout(),
        subscribers: subscribers.size,
        steps: diag.steps.slice(-20),
        errors: diag.errors.slice(-10),
      };
    },
  };

  // Wait for ready Promise
  Object.defineProperty(Workspace, 'ready', {
    get() {
      const idx = getIndex();
      return idx ? idx.ready : Promise.resolve();
    },
  });

  H2O.LibraryWorkspace = Workspace;
  H2O.Library.Workspace = Workspace;

  // Register on Library Core
  function registerOnCore() {
    const core = getCore();
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-workspace', Workspace, { replace: true });
      core.registerService('library-workspace', Workspace, { replace: true });
      // Register routes for Library views
      core.registerRoute('library', async (route) => {
        emitUpdated('route', route);
        return true;
      }, { replace: true });
      ['dashboard', 'saved', 'recents', 'organize', 'analytics', 'explorer'].forEach((view) => {
        core.registerRoute(view, async (route) => {
          emitUpdated(`route:${view}`, route);
          return true;
        }, { replace: true });
      });
      step('register-on-core', 'library-workspace');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }

  // Bind to Index updates once it's available.
  function bootBinding() {
    if (bindIndex()) {
      step('bind-index', 'ok');
      return;
    }
    W.setTimeout(bootBinding, 200);
  }

  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => { registerOnCore(); bootBinding(); }, { once: true });
  } else {
    bootBinding();
  }

  // Listen to route changes from S0D3e
  const routeSvc = getRouteSvc();
  if (routeSvc?.on) routeSvc.on((route) => emitUpdated('route-change', route));

  step('boot', 'studio-library-workspace-ready');
})();
