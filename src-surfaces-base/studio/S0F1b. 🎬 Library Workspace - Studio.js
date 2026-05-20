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
  const state = {
    lastReads: Object.create(null),
    lastWrites: Object.create(null),
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
  function itemCount(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  }
  function cacheAge(slot) {
    return slot && slot.ts ? Math.max(0, Date.now() - slot.ts) : null;
  }
  function recordRead(name, payload) {
    try {
      state.lastReads[String(name || '')] = {
        ...(payload || {}),
        at: Date.now(),
      };
    } catch {}
  }
  function recordWrite(name, payload) {
    try {
      const clean = { ...(payload || {}) };
      if (clean.result && typeof clean.result === 'object') {
        clean.resultSummary = {
          ok: clean.result.ok,
          status: clean.result.status || clean.result.reason || '',
          keys: Object.keys(clean.result).slice(0, 16),
        };
        delete clean.result;
      }
      state.lastWrites[String(name || '')] = {
        ...clean,
        at: Date.now(),
      };
    } catch {}
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

  // ── Desktop (Tauri) catalog source — M2c-1 ───────────────────────────────
  // On Tauri Studio Desktop, the chat-list service (MV3 archive bridge) is
  // unavailable, so the original getFolders/getCategories/getLabels paths
  // silently return []. Branch each getter on LW_isTauri() and source the
  // catalog rows from the SQLite-backed entity stores instead:
  //   store.folders.list()    → workspace folder shape (id, name, kind, …)
  //   store.categories.list() → workspace category shape (id, name, status, …)
  //   store.labels.list()     → workspace label shape (id, name, type, …)
  // Cache invalidation already piggybacks on the existing bindIndex →
  // bustCaches chain: any SQLite write fires LibraryIndex subscribers
  // (M2a-3g), which fires the Index subscriber inside Workspace, which
  // calls bustCaches — clearing the desktop-sourced cache too. No new
  // subscription required.
  function LW_isTauri() {
    try {
      return !!(W.H2O && W.H2O.Studio && W.H2O.Studio.platform
        && W.H2O.Studio.platform.env && W.H2O.Studio.platform.env.isTauri === true);
    } catch { return false; }
  }
  function getStudioStores() {
    try { return (W.H2O && W.H2O.Studio && W.H2O.Studio.store) || {}; }
    catch { return {}; }
  }
  function epochToIso(ms) {
    if (!ms || typeof ms !== 'number' || ms <= 0) return '';
    try { return new Date(ms).toISOString(); }
    catch { return ''; }
  }
  /* Map SQLite folder row → MV3 chat-list folder shape consumed by
   * S0Z1g sidebar sections + studio.js folder picker + S0F3a Folders. */
  function projectFolderRowForWorkspace(row) {
    if (!row || !row.folderId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    return {
      id: row.folderId,
      name: row.name || '',
      createdAt: epochToIso(row.createdAt),
      updatedAt: epochToIso(row.updatedAt),
      kind: meta.kind || 'local',
      projectRef: (meta.projectRef && typeof meta.projectRef === 'object') ? meta.projectRef : null,
      iconColor: row.color || '',
    };
  }
  function deriveFolderRowsFromIndex() {
    const index = getIndex();
    const rows = index && typeof index.getAll === 'function' ? index.getAll() : [];
    const byId = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row?.folderId || row?.folder || '').trim();
      if (!id) continue;
      const name = String(row?.folderName || row?.folderLabel || row?.folderTitle || id).trim() || id;
      const prev = byId.get(id) || {};
      byId.set(id, {
        ...prev,
        id,
        folderId: id,
        name: prev.name && prev.name !== id ? prev.name : name,
        kind: prev.kind || 'local',
        projectRef: prev.projectRef || null,
        iconColor: prev.iconColor || '',
        source: 'library-index-derived',
      });
    }
    return Array.from(byId.values()).sort((a, b) => (
      String(a.name || a.id).localeCompare(String(b.name || b.id))
      || String(a.id).localeCompare(String(b.id))
    ));
  }
  /* Map SQLite category row → MV3 chat-list category shape. status defaults
   * to 'active' since our V1 schema has no separate replacement model. */
  function projectCategoryRowForWorkspace(row) {
    if (!row || !row.categoryId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    return {
      id: row.categoryId,
      name: row.name || '',
      description: meta.description || '',
      color: meta.color || '',
      sortOrder: (typeof meta.sortOrder === 'number') ? meta.sortOrder : 0,
      createdAt: epochToIso(row.createdAt),
      updatedAt: epochToIso(row.updatedAt),
      status: meta.status || 'active',
      replacementCategoryId: meta.replacementCategoryId || null,
      aliases: Array.isArray(meta.aliases) ? meta.aliases.slice() : [],
    };
  }
  /* Map SQLite label row → MV3 chat-list label shape. type defaults to
   * 'custom' (the MV3 fallback bucket) when not present in meta. */
  function projectLabelRowForWorkspace(row) {
    if (!row || !row.labelId) return null;
    const meta = (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) ? row.meta : {};
    return {
      id: row.labelId,
      name: row.name || '',
      type: meta.type || 'custom',
      color: row.color || '',
      sortOrder: (typeof meta.sortOrder === 'number') ? meta.sortOrder : 0,
      createdAt: epochToIso(row.createdAt),
    };
  }
  /* Shared Desktop catalog fetcher used by all three getters. Caches the
   * result and records the read source so diagnose() reports it. On error,
   * falls back to the prior cache value (rather than throwing) so UI stays
   * stable. */
  async function desktopFetchCatalog(slot, name, sqliteFetcher) {
    try {
      const list = await sqliteFetcher();
      const safe = Array.isArray(list) ? list : [];
      setCache(slot, safe);
      /* Tag the slot so the cache fast-path in getFolders/Categories/Labels
       * can tell Desktop-sourced cache from MV3-sourced cache. Without this,
       * a stale [] left over from an MV3-fallback call would shadow the
       * Desktop branch on subsequent reads. */
      slot.source = 'desktop-sqlite';
      recordRead(name, { source: 'desktop-sqlite', count: safe.length, fresh: true });
      return safe;
    } catch (e) {
      recordRead(name, {
        source: 'desktop-sqlite-error',
        count: itemCount(slot.value),
        fresh: true,
        error: String((e && e.message) || e),
      });
      err('desktopFetch.' + name, e);
      return slot.value || [];
    }
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
    const desktop = LW_isTauri();
    /* On Tauri, only honor cache that was last populated by the Desktop
     * SQLite branch — never reuse a stale MV3 chat-list cache (which on
     * Desktop would be []) or an untagged pre-M2c-1 cache. */
    if (!fresh && isFresh(cache.folders) && (!desktop || cache.folders.source === 'desktop-sqlite')) {
      if (!desktop && itemCount(cache.folders.value) === 0 && deriveFolderRowsFromIndex().length > 0) {
        // Fall through: the bridge/catalog cache is empty but archive rows have
        // folder assignments, so derive a read-only folder catalog from them.
      } else {
        recordRead('folders', { source: 'cache', count: itemCount(cache.folders.value), fresh: false });
        return cache.folders.value;
      }
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.folders, 'folders', async () => {
        const store = getStudioStores().folders;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectFolderRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('folders', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getFoldersList();
      const safe = Array.isArray(list) ? list : [];
      const derived = safe.length ? [] : deriveFolderRowsFromIndex();
      setCache(cache.folders, safe.length ? safe : derived);
      cache.folders.source = safe.length ? 'chat-list.bridge' : 'library-index-derived';
      recordRead('folders', { source: cache.folders.source, count: itemCount(cache.folders.value), fresh: !!fresh });
      return cache.folders.value;
    } catch (e) {
      const derived = deriveFolderRowsFromIndex();
      if (derived.length) {
        setCache(cache.folders, derived);
        cache.folders.source = 'library-index-derived-after-error';
        recordRead('folders', { source: cache.folders.source, count: itemCount(cache.folders.value), fresh: !!fresh, error: String(e?.message || e) });
        return cache.folders.value;
      }
      recordRead('folders', { source: 'error', count: itemCount(cache.folders.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getFolders', e);
      return cache.folders.value || [];
    }
  }

  async function getCategories({ fresh = false } = {}) {
    const desktop = LW_isTauri();
    if (!fresh && isFresh(cache.categories) && (!desktop || cache.categories.source === 'desktop-sqlite')) {
      recordRead('categories', { source: 'cache', count: itemCount(cache.categories.value), fresh: false });
      return cache.categories.value;
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.categories, 'categories', async () => {
        const store = getStudioStores().categories;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectCategoryRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('categories', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getCategoriesCatalog();
      setCache(cache.categories, Array.isArray(list) ? list : []);
      recordRead('categories', { source: 'chat-list.bridge', count: itemCount(cache.categories.value), fresh: !!fresh });
      return cache.categories.value;
    } catch (e) {
      recordRead('categories', { source: 'error', count: itemCount(cache.categories.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getCategories', e);
      return cache.categories.value || [];
    }
  }

  async function getLabels({ fresh = false } = {}) {
    const desktop = LW_isTauri();
    if (!fresh && isFresh(cache.labels) && (!desktop || cache.labels.source === 'desktop-sqlite')) {
      recordRead('labels', { source: 'cache', count: itemCount(cache.labels.value), fresh: false });
      return cache.labels.value;
    }
    if (desktop) {
      return await desktopFetchCatalog(cache.labels, 'labels', async () => {
        const store = getStudioStores().labels;
        if (!store || typeof store.list !== 'function') return [];
        const rows = await store.list();
        return (Array.isArray(rows) ? rows : [])
          .map(projectLabelRowForWorkspace)
          .filter(Boolean);
      });
    }
    const cl = getChatList();
    if (!cl) {
      recordRead('labels', { source: 'unavailable', count: 0, fresh: !!fresh });
      return [];
    }
    try {
      const list = await cl.getLabelsCatalog();
      setCache(cache.labels, Array.isArray(list) ? list : []);
      recordRead('labels', { source: 'chat-list.bridge', count: itemCount(cache.labels.value), fresh: !!fresh });
      return cache.labels.value;
    } catch (e) {
      recordRead('labels', { source: 'error', count: itemCount(cache.labels.value), fresh: !!fresh, error: String(e?.message || e) });
      err('getLabels', e);
      return cache.labels.value || [];
    }
  }

  async function getTags() {
    const index = getIndex();
    if (!index) {
      recordRead('tags', { source: 'unavailable', count: 0 });
      return [];
    }
    const counts = index.counts().tags || {};
    const tags = Object.entries(counts)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    recordRead('tags', { source: 'LibraryIndex.counts.tags', count: tags.length });
    return tags;
  }

  async function getProjects() {
    const projectsFacade = H2O.Projects;
    if (projectsFacade && typeof projectsFacade.listProjects === 'function') {
      try {
        const projects = projectsFacade.listProjects();
        if (Array.isArray(projects) && projects.length) {
          recordRead('projects', { source: 'H2O.Projects.listProjects', count: projects.length });
          return projects;
        }
      } catch (e) {
        recordRead('projects', { source: 'H2O.Projects.error', count: 0, error: String(e?.message || e) });
        err('getProjects.facade', e);
      }
    }
    const index = getIndex();
    if (!index) {
      recordRead('projects', { source: 'unavailable', count: 0 });
      return [];
    }
    const f = index.facets();
    const projects = Object.entries(f.byProject || {})
      .map(([id, chatIds]) => ({ id, chatIds: chatIds.slice(), count: chatIds.length }));
    recordRead('projects', { source: 'LibraryIndex.facets.byProject', count: projects.length });
    return projects;
  }

  async function resolveFolderBindings(chatIds) {
    const cl = getChatList();
    if (!cl) {
      recordRead('folderBindings', { source: 'unavailable', count: 0, requested: Array.isArray(chatIds) ? chatIds.length : 0 });
      return {};
    }
    try {
      const result = await cl.resolveFolderBindings(chatIds);
      recordRead('folderBindings', {
        source: 'chat-list.bridge',
        count: itemCount(result),
        requested: Array.isArray(chatIds) ? chatIds.length : 0,
      });
      return result;
    }
    catch (e) {
      recordRead('folderBindings', {
        source: 'error',
        count: 0,
        requested: Array.isArray(chatIds) ? chatIds.length : 0,
        error: String(e?.message || e),
      });
      err('resolveFolderBindings', e);
      return {};
    }
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

  function folderWriteFailure(status, chatId, folderId, reason) {
    return {
      ok: false,
      status: String(status || 'folder-write-failed'),
      reason: String(reason || status || 'folder-write-failed'),
      chatId: String(chatId || ''),
      folderId: String(folderId || ''),
      folderName: '',
    };
  }

  function isFolderBridgeTransportError(error) {
    const msg = String(error?.stack || error?.message || error || '');
    return /Could not establish connection|Receiving end does not exist|folder bridge|chat-list service unavailable|open a ChatGPT tab to access folders|Extension context invalidated|context invalidated/i.test(msg);
  }

  /* M2c-2 Desktop folder write. folderId truthy → store.folders.bindChat
   * (INSERT OR REPLACE; chat_id is PK so prior binding is replaced
   * atomically). folderId empty/null → unbind via listForChat + unbindChat
   * for every current folder (typically 0 or 1 per V1 chat). Returns a
   * result shape compatible with MV3's setFolderBinding so studio.js's
   * picker handler doesn't need to branch. */
  async function desktopSetFolderBinding(chatId, folderId, opts) {
    const cid = String(chatId || '').trim();
    const folder = String(folderId || '').trim();
    if (!cid) {
      const result = folderWriteFailure('missing-chat-id', cid, folder, 'chatId required');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    const store = getStudioStores().folders;
    if (!store) {
      const result = folderWriteFailure('desktop-store-unavailable', cid, folder, 'store.folders unavailable');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    try {
      let folderName = '';
      if (folder) {
        const bindOk = await store.bindChat(folder, cid, { assignedAt: Date.now() });
        if (!bindOk) {
          const result = folderWriteFailure('desktop-bind-failed', cid, folder, 'bindChat returned false');
          recordWrite('folderBinding', { ...result });
          return result;
        }
        try {
          const f = (typeof store.get === 'function') ? await store.get(folder) : null;
          folderName = (f && f.name) || '';
        } catch (_) { /* name lookup is best-effort */ }
      } else {
        /* Unbind: clear every folder currently bound to this chat. V1's
         * folder_bindings.PRIMARY KEY (chat_id) means listForChat returns
         * at most one row, but loop defensively in case the caller has
         * relaxed that. */
        const bound = (typeof store.listForChat === 'function') ? await store.listForChat(cid) : [];
        for (const f of (Array.isArray(bound) ? bound : [])) {
          const fid = f && f.folderId;
          if (fid && typeof store.unbindChat === 'function') {
            try { await store.unbindChat(fid, cid); }
            catch (e) { err('desktopSetFolderBinding.unbind', e); }
          }
        }
      }
      bustCaches('desktop-setFolderBinding');
      try { await getIndex()?.refresh('desktop-setFolderBinding'); } catch {}
      emitUpdated('folder-binding-changed', {
        chatId: cid, folderId: folder, source: (opts && opts.source) || 'desktop-sqlite',
      });
      const result = { ok: true, status: 'desktop-sqlite', chatId: cid, folderId: folder, folderName };
      recordWrite('folderBinding', { ...result });
      return result;
    } catch (e) {
      const result = folderWriteFailure('desktop-write-failed', cid, folder, String((e && e.message) || e));
      recordWrite('folderBinding', { ...result, error: String((e && e.stack) || e) });
      err('desktopSetFolderBinding', e);
      return result;
    }
  }

  async function setFolderBinding(chatId, folderId, opts = {}) {
    if (LW_isTauri()) return await desktopSetFolderBinding(chatId, folderId, opts);
    const cid = String(chatId || '');
    const folder = String(folderId || '');
    const cl = getChatList();
    if (!cl) {
      const result = folderWriteFailure('folder-bridge-unavailable', cid, folder, 'chat-list service unavailable');
      recordWrite('folderBinding', { ...result });
      return result;
    }
    let result;
    try {
      result = await cl.setFolderBinding(chatId, folderId, opts);
    } catch (e) {
      const status = isFolderBridgeTransportError(e) ? 'folder-bridge-unavailable' : 'folder-write-failed';
      const result = folderWriteFailure(status, cid, folder, String(e?.message || e || status));
      recordWrite('folderBinding', { ...result, error: String(e?.stack || e) });
      step('setFolderBinding.rejected', status);
      err('setFolderBinding', e);
      return result;
    }
    if (result?.ok === false) {
      recordWrite('folderBinding', { ok: false, status: String(result.status || result.reason || 'rejected'), chatId: cid, folderId: folder, result });
      step('setFolderBinding.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setFolderBinding');
    try { await getIndex()?.refresh('setFolderBinding'); } catch {}
    emitUpdated('folder-binding-changed', { chatId, folderId, source: opts?.source || null });
    recordWrite('folderBinding', { ok: result?.ok !== false, status: String(result?.status || 'ok'), chatId: cid, folderId: folder, result });
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

  /* M2c-2 Desktop category write. SQLite category assignment is per-chat
   * (chats.category_id) rather than per-snapshot — snapshotId is preserved
   * in the result for UI/event compatibility but ignored for the write.
   * Empty categoryId triggers clearChat. assignChat/clearChat return false
   * if no chat row matches; that surfaces as ok:false without throwing. */
  async function desktopSetSnapshotCategory(snapshotId, chatId, categoryId) {
    const sid = String(snapshotId || '').trim();
    const cid = String(chatId || '').trim();
    const category = String(categoryId || '').trim();
    if (!cid) {
      const result = categoryWriteFailure('missing-chat-id', sid, cid, category, 'chatId required on Desktop');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    const store = getStudioStores().categories;
    if (!store) {
      const result = categoryWriteFailure('desktop-store-unavailable', sid, cid, category, 'store.categories unavailable');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    try {
      let writeOk;
      if (category) {
        if (typeof store.assignChat !== 'function') {
          const result = categoryWriteFailure('desktop-assign-unavailable', sid, cid, category, 'store.categories.assignChat unavailable');
          recordWrite('snapshotCategory', { ...result });
          return result;
        }
        writeOk = await store.assignChat(category, cid);
      } else {
        if (typeof store.clearChat !== 'function') {
          const result = categoryWriteFailure('desktop-clear-unavailable', sid, cid, category, 'store.categories.clearChat unavailable');
          recordWrite('snapshotCategory', { ...result });
          return result;
        }
        writeOk = await store.clearChat(cid);
      }
      bustCaches('desktop-setSnapshotCategory');
      try { await getIndex()?.refresh('desktop-setSnapshotCategory'); } catch {}
      emitUpdated('category-changed', { snapshotId: sid, chatId: cid, categoryId: category });
      const result = {
        ok: writeOk !== false,
        status: 'desktop-sqlite',
        snapshotId: sid,
        chatId: cid,
        categoryId: category,
      };
      recordWrite('snapshotCategory', { ...result });
      return result;
    } catch (e) {
      const result = categoryWriteFailure('desktop-write-failed', sid, cid, category, String((e && e.message) || e));
      recordWrite('snapshotCategory', { ...result, error: String((e && e.stack) || e) });
      err('desktopSetSnapshotCategory', e);
      return result;
    }
  }

  async function setSnapshotCategory(snapshotId, chatId, categoryId) {
    if (LW_isTauri()) return await desktopSetSnapshotCategory(snapshotId, chatId, categoryId);
    const sid = String(snapshotId || '').trim();
    const cid = String(chatId || '').trim();
    const category = String(categoryId || '').trim();
    if (!sid) {
      const result = categoryWriteFailure('missing-snapshot-id', sid, cid, category);
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    if (!category) {
      const result = categoryWriteFailure('missing-category-id', sid, cid, category);
      recordWrite('snapshotCategory', { ...result });
      return result;
    }

    const cl = getChatList();
    if (!cl || typeof cl.setSnapshotCategory !== 'function') {
      const result = categoryWriteFailure('category-bridge-unavailable', sid, cid, category, 'chat-list service unavailable');
      recordWrite('snapshotCategory', { ...result });
      return result;
    }

    let result;
    try {
      result = await cl.setSnapshotCategory(sid, cid, category);
    } catch (e) {
      const status = isCategoryBridgeTransportError(e) ? 'category-bridge-unavailable' : 'category-write-failed';
      step('setSnapshotCategory.rejected', status);
      err('setSnapshotCategory', e);
      const result = categoryWriteFailure(status, sid, cid, category, String(e?.message || e || status));
      recordWrite('snapshotCategory', { ...result });
      return result;
    }
    if (result?.ok === false) {
      recordWrite('snapshotCategory', { ok: false, status: String(result.status || result.reason || 'rejected'), snapshotId: sid, chatId: cid, categoryId: category, result });
      step('setSnapshotCategory.rejected', String(result.status || result.reason || 'rejected'));
      return result;
    }
    bustCaches('setSnapshotCategory');
    try { await getIndex()?.refresh('setSnapshotCategory'); } catch {}
    emitUpdated('category-changed', { snapshotId: sid, chatId: cid, categoryId: category });
    recordWrite('snapshotCategory', { ok: result?.ok !== false, status: String(result?.status || 'ok'), snapshotId: sid, chatId: cid, categoryId: category, result });
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
    recordWrite('snapshotCategoryReclassify', { ok: result?.ok !== false, status: String(result?.status || 'ok'), snapshotId: String(snapshotId || ''), result });
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
          folders: { hasValue: !!cache.folders.value, ts: cache.folders.ts, ageMs: cacheAge(cache.folders), count: itemCount(cache.folders.value) },
          categories: { hasValue: !!cache.categories.value, ts: cache.categories.ts, ageMs: cacheAge(cache.categories), count: itemCount(cache.categories.value) },
          labels: { hasValue: !!cache.labels.value, ts: cache.labels.ts, ageMs: cacheAge(cache.labels), count: itemCount(cache.labels.value) },
        },
        sources: {
          bridgeAvailability: {
            folders: typeof getChatList()?.getFoldersList === 'function',
            categories: typeof getChatList()?.getCategoriesCatalog === 'function',
            labels: typeof getChatList()?.getLabelsCatalog === 'function',
            folderBindings: typeof getChatList()?.resolveFolderBindings === 'function',
            folderWrite: typeof getChatList()?.setFolderBinding === 'function',
            categoryWrite: typeof getChatList()?.setSnapshotCategory === 'function',
          },
          lastReads: { ...state.lastReads },
          lastWrites: { ...state.lastWrites },
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
