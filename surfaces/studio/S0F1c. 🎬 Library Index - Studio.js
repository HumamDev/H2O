// ==UserScript==
// @h2o-id             s0f1c.library_index.studio
// @name               S0F1c. 🎬 Library Index - Studio
// @namespace          H2O.Premium.CGX.library_index.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000005
// @description        Studio Library Index: normalized known-chat index + facets. Data source is the chat-list service (S0D3a Archive) — NEVER native sidebar DOM. Feeds Library Workspace, Insights, and the studio.js list view via a single canonical model.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1c Library Index (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  const STORAGE_KEY = 'h2o:prm:cgx:library-index:studio:registry:v1';
  const REFRESH_DEBOUNCE_MS = 220;
  const MAX_BOOT_POLL_ATTEMPTS = 180;

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

  // ── State ──────────────────────────────────────────────────────────────────
  // rows: array of normalized row objects keyed by chatId.
  // facets: derived buckets (byView, byFolder, byCategory, byProject, byLabel, byTag).
  const state = {
    rows: [],
    byChatId: Object.create(null),
    facets: {
      byView: Object.create(null),
      byFolder: Object.create(null),
      byCategory: Object.create(null),
      byProject: Object.create(null),
      byLabel: Object.create(null),
      byTag: Object.create(null),
    },
    lastScanTs: 0,
    lastScanReason: '',
    lastSource: 'none',
    refreshTimer: null,
    refreshInFlight: null,
    subscribers: new Set(),
    ready: false,
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getStore() { return H2O.Library?.Store || null; }
  function getChatList() {
    return getCore()?.getService?.('chat-list') || null;
  }
  function getChatRegistry() { return H2O.ChatRegistry || null; }

  // Phase 2B — pure row normalize / facet / dedupe / view logic lives in the
  // shared library-index-core (loaded by S0F0d before this script). Studio
  // and native compute byte-identical rows + facets for identical inputs.
  function ixCore() { return H2O.Library?.LibraryIndexCore || null; }

  function normalizeRow(raw) {
    const c = ixCore();
    if (c) return c.normalizeRowStudio(raw);
    return null;
  }

  function rebuildFacets() {
    const c = ixCore();
    state.facets = c ? c.buildFacetsStudio(state.rows) : {
      byView: Object.create(null),
      byFolder: Object.create(null),
      byCategory: Object.create(null),
      byProject: Object.create(null),
      byLabel: Object.create(null),
      byTag: Object.create(null),
    };
  }

  function emitUpdated(reason) {
    const detail = { reason: String(reason || ''), rows: state.rows.length, t: Date.now(), surface: 'studio' };
    try { W.dispatchEvent(new CustomEvent('evt:h2o:library-index:updated', { detail })); } catch {}
    try { W.dispatchEvent(new CustomEvent('h2o:library-index:updated', { detail })); } catch {}
    try { W.H2O?.events?.emit?.('library-index:updated', detail); } catch {}
    state.subscribers.forEach((fn) => { try { fn(detail); } catch (e) { err('subscriber', e); } });
  }

  async function persist() {
    const store = getStore();
    if (!store) return;
    try {
      const compact = state.rows.map((r) => ({
        chatId: r.chatId, snapshotId: r.snapshotId, title: r.title, projectId: r.projectId,
        folderId: r.folderId, folderName: r.folderName,
        categoryId: r.categoryId, categoryName: r.categoryName,
        view: r.view, tags: r.tags, labels: r.labels,
        snapshotCount: r.snapshotCount, capturedAt: r.capturedAt, updatedAt: r.updatedAt,
        messageCount: r.messageCount, pinned: r.pinned, archived: r.archived,
      }));
      await store.set(STORAGE_KEY, { rows: compact, ts: Date.now() });
      step('persist.ok', String(compact.length));
    } catch (e) { err('persist', e); }
  }

  async function hydrate() {
    const store = getStore();
    if (!store) return;
    try {
      const v = await store.get(STORAGE_KEY);
      if (v && Array.isArray(v.rows)) {
        state.rows = v.rows.map(normalizeRow).filter(Boolean);
        state.byChatId = Object.create(null);
        for (const r of state.rows) state.byChatId[r.chatId] = r;
        rebuildFacets();
        state.lastSource = 'store-hydrate';
        step('hydrate.ok', String(state.rows.length));
      }
    } catch (e) { err('hydrate', e); }
  }

  // Native Chat Registry persists to chatgpt.com's window.localStorage
  // (key h2o:library:chat-registry:v1), which is in a DIFFERENT origin
  // from Studio's chrome-extension://… page and therefore unreachable.
  // The only viable cross-origin channel is the existing cross-surface
  // broadcast key, which the bridge writes via the loader.js content-script
  // and which Studio (chrome-extension origin) can read with direct
  // chrome.storage.local.get. Native 0F1h now includes a projected
  // linked-only snapshot in the broadcast payload (`linkedRecords`).
  // We read that snapshot here.
  const NATIVE_BROADCAST_KEY = 'h2o:library:cross-surface:broadcast:native:v1';

  async function readNativeChatRegistryRecords() {
    try {
      if (!W.chrome || !chrome.storage || !chrome.storage.local) return [];
      const payload = await new Promise((resolve) => {
        try {
          chrome.storage.local.get(NATIVE_BROADCAST_KEY, (items) => {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
            resolve(items && items[NATIVE_BROADCAST_KEY]);
          });
        } catch { resolve(null); }
      });
      if (!payload || typeof payload !== 'object') return [];
      const linked = payload.linkedRecords;
      return Array.isArray(linked) ? linked.filter((r) => r && typeof r === 'object') : [];
    } catch (e) { err('readNativeChatRegistryRecords', e); return []; }
  }

  // Linked-only records live in Chat Registry but have no archive snapshot.
  // Delegated to the shared core; the projection enforces the strict filter
  // (isLinked AND !isSaved AND !isDeleted) and sets view='linked' so the
  // Saved/Pinned/Archive tabs naturally exclude them.
  function normalizeLinkedOnlyRegistryRow(rec) {
    const c = ixCore();
    return c ? c.normalizeLinkedOnlyProjection(rec) : null;
  }

  async function refreshFromArchive(reason = 'manual') {
    if (state.refreshInFlight) return state.refreshInFlight;
    const chatList = getChatList();
    if (!chatList) {
      err('refresh', 'chat-list service unavailable');
      return [];
    }
    state.refreshInFlight = (async () => {
      try {
        const raw = await chatList.listAll();
        const list = Array.isArray(raw) ? raw : [];
        const archiveRows = list.map(normalizeRow).filter(Boolean);

        // Pull linked-only records from Chat Registry. These are records the
        // user explicitly added via "Add to Library" on the native side but
        // never captured as a transcript, so the archive doesn't know about
        // them. Dedup by chatId — archive wins for any record present in
        // both (the archive carries snapshotId; the registry carries link
        // provenance only).
        //
        // Source priority:
        //   1. Native Chat Registry via chrome.storage (canonical for the
        //      Phase 1 record shape with state.isLinked / linkedAt / …).
        //      Studio's own H2O.ChatRegistry uses a different storage key
        //      and a simpler shape, so the native key is the source of
        //      truth for linked-only records.
        //   2. Studio H2O.ChatRegistry as a defensive fallback in case the
        //      two registries are ever unified (then listRecords appears).
        let linkedRows = [];
        try {
          const archiveIds = new Set(archiveRows.map((r) => r.chatId));
          const nativeRecords = await readNativeChatRegistryRecords();
          for (const rec of nativeRecords) {
            if (!rec || !rec.chatId || archiveIds.has(rec.chatId)) continue;
            const row = normalizeLinkedOnlyRegistryRow(rec);
            if (row) linkedRows.push(row);
          }
          // Fallback: if native key is empty (e.g. fresh install pre-reload)
          // try the Studio-side registry's listRecords-or-listAll. Filters
          // are best-effort because the Studio shape doesn't carry state.
          if (linkedRows.length === 0) {
            const reg = getChatRegistry();
            const list = reg && (typeof reg.listRecords === 'function'
              ? await reg.listRecords({ includeDeleted: false })
              : (typeof reg.listActive === 'function' ? await reg.listActive() : []));
            for (const rec of (Array.isArray(list) ? list : [])) {
              if (!rec || !rec.chatId || archiveIds.has(rec.chatId)) continue;
              const row = normalizeLinkedOnlyRegistryRow(rec);
              if (row) linkedRows.push(row);
            }
          }
        } catch (e) { err('refresh.linked-only', e); }

        state.rows = archiveRows.concat(linkedRows);
        state.byChatId = Object.create(null);
        for (const r of state.rows) state.byChatId[r.chatId] = r;
        rebuildFacets();
        state.lastScanTs = Date.now();
        state.lastScanReason = String(reason);
        state.lastSource = linkedRows.length
          ? `studio-archive+registry(${linkedRows.length})`
          : 'studio-archive';
        step('refresh.ok', `${archiveRows.length}+${linkedRows.length}:${reason}`);

        // Mirror archive rows into Chat Registry so it has fresh metadata
        // for all chats. Skip linked rows because they originated there
        // and we'd just re-stamp them with empty fields.
        try {
          const reg = getChatRegistry();
          if (reg && typeof reg.upsertMany === 'function') {
            await reg.upsertMany(archiveRows.map((r) => ({
              chatId: r.chatId, title: r.title, projectId: r.projectId,
              folderId: r.folderId, snapshotCount: r.snapshotCount,
              lastSeenTs: Date.now(),
            })));
          }
        } catch (e) { err('mirror-registry', e); }

        persist().catch(() => {});
        emitUpdated(reason);
        return state.rows;
      } catch (e) {
        err('refresh', e);
        return state.rows;
      } finally {
        state.refreshInFlight = null;
      }
    })();
    return state.refreshInFlight;
  }

  function scheduleRefresh(reason) {
    if (state.refreshTimer) return;
    state.refreshTimer = W.setTimeout(() => {
      state.refreshTimer = null;
      refreshFromArchive(reason || 'scheduled').catch(() => {});
    }, REFRESH_DEBOUNCE_MS);
  }

  // ── Query API ──────────────────────────────────────────────────────────────
  function query({ view, folderId, projectId, categoryId, label, tag, search, pinned, archived } = {}) {
    let rows = state.rows.slice();
    if (view) rows = rows.filter((r) => r.view === String(view).toLowerCase());
    if (folderId) rows = rows.filter((r) => r.folderId === folderId);
    if (projectId) rows = rows.filter((r) => r.projectId === projectId);
    if (categoryId) rows = rows.filter((r) => r.categoryId === categoryId);
    if (label) rows = rows.filter((r) => r.labels.includes(label));
    if (tag) rows = rows.filter((r) => r.tags.includes(tag));
    if (typeof pinned === 'boolean') rows = rows.filter((r) => r.pinned === pinned);
    if (typeof archived === 'boolean') rows = rows.filter((r) => r.archived === archived);
    if (search) {
      const needle = String(search).toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(needle));
    }
    return rows;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  const LibraryIndex = {
    surface: 'studio',
    ready: hydrate(), // returns a Promise that resolves when boot hydrate completes

    getAll() { return state.rows.slice(); },
    getByChatId(chatId) { return state.byChatId[String(chatId || '').trim()] || null; },
    query,

    facets() {
      return {
        byView: { ...state.facets.byView },
        byFolder: { ...state.facets.byFolder },
        byCategory: { ...state.facets.byCategory },
        byProject: { ...state.facets.byProject },
        byLabel: { ...state.facets.byLabel },
        byTag: { ...state.facets.byTag },
      };
    },

    counts() {
      const c = ixCore();
      if (c) return c.countsFromFacetsStudio(state.facets, state.rows.length);
      return { total: state.rows.length, views: {}, folders: {}, categories: {}, projects: {}, labels: {}, tags: {} };
    },

    async refresh(reason) { return refreshFromArchive(reason || 'api'); },
    scheduleRefresh,

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },

    diagnose() {
      return {
        surface: 'studio',
        ready: state.ready,
        rows: state.rows.length,
        lastScanTs: state.lastScanTs,
        lastScanReason: state.lastScanReason,
        lastSource: state.lastSource,
        hasArchive: !!getChatList(),
        hasStore: !!getStore(),
        hasRegistry: !!getChatRegistry(),
        counts: LibraryIndex.counts(),
        storeBackend: getStore()?.backend?.() || null,
        storageKey: STORAGE_KEY,
        steps: diag.steps.slice(-25),
        errors: diag.errors.slice(-10),
      };
    },
  };

  H2O.LibraryIndex = LibraryIndex;
  H2O.Library.Index = LibraryIndex;

  // ── Boot: wait for Library Core, hydrate, then first refresh ──────────────
  let pollAttempts = 0;
  function pollForCore() {
    const core = getCore();
    if (core && typeof core.registerOwner === 'function') {
      try {
        core.registerOwner('library-index', LibraryIndex, { replace: true });
        core.registerService('library-index', LibraryIndex, { replace: true });
        step('register-on-core', 'library-index');
      } catch (e) { err('register-on-core', e); }
      // First refresh after Library Ready signal so we know chat-list service is available.
      const onReady = () => {
        state.ready = true;
        refreshFromArchive('boot').catch(() => {});
      };
      W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', onReady, { once: true });
      // Also try immediately in case ready was already emitted.
      if (core.getService?.('chat-list')) {
        state.ready = true;
        refreshFromArchive('boot').catch(() => {});
      }
      return;
    }
    if (++pollAttempts < MAX_BOOT_POLL_ATTEMPTS) {
      const delay = pollAttempts < 10 ? 30 : (pollAttempts < 40 ? 120 : 400);
      W.setTimeout(pollForCore, delay);
    } else {
      err('poll-core', 'gave up after max attempts');
    }
  }
  pollForCore();

  // Listen for explicit refresh requests from other modules.
  W.addEventListener('evt:h2o:library-index:refresh-request', (e) => {
    refreshFromArchive(String(e?.detail?.reason || 'refresh-request')).catch(() => {});
  });

  step('boot', 'studio-library-index-ready');
})();
