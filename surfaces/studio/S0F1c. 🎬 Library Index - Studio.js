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

  function normalizeRow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const chatId = String(raw.chatId || raw.id || '').trim();
    if (!chatId) return null;

    // Category metadata may be flat or nested. Archive snapshots commonly emit
    // `raw.category.primaryCategoryId` / `primaryCategoryName`, while other
    // upstream paths use the flat `raw.categoryId` / `raw.categoryName` or
    // `raw.primaryCategoryId`. Read in priority order; never throw on a missing
    // nested object (raw.category may be undefined).
    const catObj = (raw.category && typeof raw.category === 'object') ? raw.category : null;
    const categoryId = String(
      raw.categoryId
      || catObj?.primaryCategoryId
      || raw.primaryCategoryId
      || catObj?.categoryId
      || catObj?.id
      || ''
    ).trim();
    const categoryName = String(
      raw.categoryName
      || catObj?.primaryCategoryName
      || catObj?.name
      || catObj?.label
      || ''
    ).trim();

    // Resolve snapshotId from the archive payload. Different archive ops have
    // used different field names across versions; we accept any of these. The
    // value flows into the Library page ChatRow's href (#/read/<id>) and the
    // Studio reader hash-route — same path studio.js's saved-list rows use.
    const snapshotId = String(
      raw.snapshotId
      || raw.snapId
      || raw.snapshot_id
      || raw.snapshot?.id
      || raw.snapshot?.snapshotId
      || raw.meta?.snapshotId
      || ''
    ).trim();

    return {
      chatId,
      snapshotId,
      title: String(raw.title || raw.name || raw.chatTitle || '').trim(),
      projectId: String(raw.projectId || '').trim(),
      folderId: String(raw.folderId || raw.folder || '').trim(),
      folderName: String(raw.folderName || '').trim(),
      categoryId,
      categoryName,
      view: String(raw.view || raw.state || 'saved').toLowerCase(),
      tags: Array.isArray(raw.tags) ? raw.tags.slice() : [],
      labels: Array.isArray(raw.labels) ? raw.labels.slice() : [],
      snapshotCount: Number(raw.snapshotCount || raw.snapshots?.length || 1),
      capturedAt: String(raw.capturedAt || raw.updatedAt || raw.lastUpdated || ''),
      updatedAt: String(raw.updatedAt || raw.capturedAt || ''),
      messageCount: Number(raw.messageCount || raw.turns || 0),
      pinned: !!raw.pinned,
      archived: !!raw.archived,
      raw,
    };
  }

  function rebuildFacets() {
    const f = state.facets = {
      byView: Object.create(null),
      byFolder: Object.create(null),
      byCategory: Object.create(null),
      byProject: Object.create(null),
      byLabel: Object.create(null),
      byTag: Object.create(null),
    };
    const push = (bucket, key, chatId) => {
      const k = String(key || '').trim();
      if (!k) return;
      (bucket[k] = bucket[k] || []).push(chatId);
    };
    for (const row of state.rows) {
      push(f.byView, row.view, row.chatId);
      if (row.folderId) push(f.byFolder, row.folderId, row.chatId);
      if (row.categoryId) push(f.byCategory, row.categoryId, row.chatId);
      if (row.projectId) push(f.byProject, row.projectId, row.chatId);
      for (const lab of row.labels) push(f.byLabel, lab, row.chatId);
      for (const tag of row.tags) push(f.byTag, tag, row.chatId);
    }
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
        state.rows = list.map(normalizeRow).filter(Boolean);
        state.byChatId = Object.create(null);
        for (const r of state.rows) state.byChatId[r.chatId] = r;
        rebuildFacets();
        state.lastScanTs = Date.now();
        state.lastScanReason = String(reason);
        state.lastSource = 'studio-archive';
        step('refresh.ok', `${state.rows.length}:${reason}`);

        // Mirror into Chat Registry so it has fresh metadata for all chats.
        try {
          const reg = getChatRegistry();
          if (reg && typeof reg.upsertMany === 'function') {
            await reg.upsertMany(state.rows.map((r) => ({
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
      const f = state.facets;
      return {
        total: state.rows.length,
        views: Object.fromEntries(Object.entries(f.byView).map(([k, v]) => [k, v.length])),
        folders: Object.fromEntries(Object.entries(f.byFolder).map(([k, v]) => [k, v.length])),
        categories: Object.fromEntries(Object.entries(f.byCategory).map(([k, v]) => [k, v.length])),
        projects: Object.fromEntries(Object.entries(f.byProject).map(([k, v]) => [k, v.length])),
        labels: Object.fromEntries(Object.entries(f.byLabel).map(([k, v]) => [k, v.length])),
        tags: Object.fromEntries(Object.entries(f.byTag).map(([k, v]) => [k, v.length])),
      };
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
