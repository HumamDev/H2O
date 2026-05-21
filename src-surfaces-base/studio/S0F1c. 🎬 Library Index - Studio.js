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
    // Phase E1 Stage 3: persist() now writes to both the new entity and legacy
    // Library.Store. These fields surface which backends accepted the most
    // recent persist so Stage 3.5 can confirm runtime parity before dropping
    // the legacy write. Values: 'entity+legacy' | 'entity' | 'legacy' | 'none'.
    lastPersistBackend: 'none',
    lastPersistTs: 0,
    lastHydrateSources: null,
    lastRefreshSources: null,
    refreshTimer: null,
    refreshInFlight: null,
    subscribers: new Set(),
    ready: false,
  };

  function getCore() { return H2O.LibraryCore || null; }
  function getStore() { return H2O.Library?.Store || null; }
  function getEntity() { return W.H2O?.Studio?.store?.libraryIndex || null; }
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

  // Phase E1 Stage 3.5: write the compact snapshot ONLY through the new entity
  // (chrome.storage.local via H2O.Studio.store.libraryIndex). The legacy
  // H2O.Library.Store write was dropped after Stage 3 dual-write was
  // runtime-validated. hydrate() (Stage 2) still reads legacy as a fallback
  // so a one-shot bootstrap succeeds for users coming from earlier builds;
  // that fallback path will be dropped in a later phase once the entity is
  // confirmed canonical across surfaces.
  // H2O.Library.Store is NOT globally retired by this change — other consumers
  // (Chat Registry, etc.) still use it. Phase F handles the broader retirement.
  async function persist() {
    const entity = getEntity();
    if (!entity) {
      state.lastPersistBackend = 'none';
      state.lastPersistTs = Date.now();
      step('persist.skip', 'entity-unavailable');
      return;
    }
    try {
      const compact = state.rows.map((r) => ({
        chatId: r.chatId, snapshotId: r.snapshotId, title: r.title, projectId: r.projectId,
        folderId: r.folderId, folderName: r.folderName,
        categoryId: r.categoryId, categoryName: r.categoryName,
        view: r.view, tags: r.tags, labels: r.labels,
        snapshotCount: r.snapshotCount, capturedAt: r.capturedAt, updatedAt: r.updatedAt,
        messageCount: r.messageCount, pinned: r.pinned, archived: r.archived,
      }));
      const ts = Date.now();
      const snap = { rows: compact, ts };

      let entityOk = false;
      if (typeof entity.setAll === 'function') {
        try { entity.setAll(snap); entityOk = true; }
        catch (e) { err('persist.entity', e); }
      }

      state.lastPersistBackend = entityOk ? 'entity' : 'none';
      state.lastPersistTs = ts;
      step('persist.ok', `${state.lastPersistBackend}:${compact.length}`);
    } catch (e) { err('persist', e); }
  }

  // Phase E1 Stage 2: hydrate from H2O.Studio.store.libraryIndex when available
  // and seed it from the legacy H2O.Library.Store snapshot on first boot.
  // Writes (persist, refreshFromArchive) and all sync read APIs are unchanged.
  // Decision tree:
  //   both populated, legacy newer    → use legacy + seed entity
  //   both populated, entity ≥ legacy → use entity (no seed)
  //   only legacy populated           → use legacy + seed entity
  //   only entity populated           → use entity
  //   neither populated               → leave state empty; refreshFromArchive
  //                                     will populate it as before
  //   entity unavailable / init throws → fall through to legacy-only path
  async function hydrate() {
    const entity = getEntity();
    const store = getStore();
    try {
      if (entity && typeof entity.init === 'function') {
        try { await entity.init(); }
        catch (e) { err('hydrate.entity.init', e); }
      }
      const entitySnap = (entity && typeof entity.getAll === 'function') ? entity.getAll() : null;
      const legacySnap = (store && typeof store.get === 'function') ? await store.get(STORAGE_KEY) : null;

      const eRows = (entitySnap && Array.isArray(entitySnap.rows)) ? entitySnap.rows : null;
      const lRows = (legacySnap && Array.isArray(legacySnap.rows)) ? legacySnap.rows : null;
      const eTs = (entitySnap && Number(entitySnap.ts)) || 0;
      const lTs = (legacySnap && Number(legacySnap.ts)) || 0;

      // Prefer whichever source is newer; tie or entity-newer → use entity
      // (avoids re-seeding when caches are already in sync).
      const useLegacy = !!lRows && (!eRows || lTs > eTs);
      const chosen = useLegacy ? legacySnap : (eRows ? entitySnap : null);
      const sourceLabel = useLegacy ? 'legacy' : (eRows ? 'entity' : 'none');
      state.lastHydrateSources = {
        entityRows: Array.isArray(eRows) ? eRows.length : 0,
        legacyRows: Array.isArray(lRows) ? lRows.length : 0,
        entityTs: eTs,
        legacyTs: lTs,
        chosen: sourceLabel,
        seededEntity: false,
        at: Date.now(),
      };

      if (chosen && Array.isArray(chosen.rows)) {
        state.rows = chosen.rows.map(normalizeRow).filter(Boolean);
        state.byChatId = Object.create(null);
        for (const r of state.rows) state.byChatId[r.chatId] = r;
        rebuildFacets();
        state.lastSource = `${sourceLabel}-hydrate`;
        step('hydrate.ok', `${sourceLabel}:${state.rows.length}`);
      }

      // Bootstrap: when legacy is the live source, seed the entity so
      // chrome.storage.local matches IDB on the next boot. setAll is itself
      // debounced (250 ms) so this does not block hydrate.
      if (useLegacy && entity && typeof entity.setAll === 'function' && Array.isArray(lRows) && lRows.length) {
        try { entity.setAll(lRows); if (state.lastHydrateSources) state.lastHydrateSources.seededEntity = true; }
        catch (e) { err('hydrate.seed-entity', e); }
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
        state.lastRefreshSources = {
          reason: String(reason),
          archiveRowsRaw: list.length,
          archiveRowsNormalized: archiveRows.length,
          nativeLinkedRecords: 0,
          nativeLinkedRows: 0,
          fallbackRegistryRecords: 0,
          fallbackLinkedRows: 0,
          linkedRows: 0,
          at: Date.now(),
        };
        try {
          const archiveIds = new Set(archiveRows.map((r) => r.chatId));
          const nativeRecords = await readNativeChatRegistryRecords();
          const nativeRecordsCount = Array.isArray(nativeRecords) ? nativeRecords.length : 0;
          let nativeLinkedRows = 0;
          let fallbackRecordsCount = 0;
          let fallbackLinkedRows = 0;
          for (const rec of nativeRecords) {
            if (!rec || !rec.chatId || archiveIds.has(rec.chatId)) continue;
            const row = normalizeLinkedOnlyRegistryRow(rec);
            if (row) { linkedRows.push(row); nativeLinkedRows++; }
          }
          // Fallback: if native key is empty (e.g. fresh install pre-reload)
          // try the Studio-side registry's listRecords-or-listAll. Filters
          // are best-effort because the Studio shape doesn't carry state.
          if (linkedRows.length === 0) {
            const reg = getChatRegistry();
            const list = reg && (typeof reg.listRecords === 'function'
              ? await reg.listRecords({ includeDeleted: false })
              : (typeof reg.listActive === 'function' ? await reg.listActive() : []));
            const fallbackRecords = Array.isArray(list) ? list : [];
            fallbackRecordsCount = fallbackRecords.length;
            for (const rec of fallbackRecords) {
              if (!rec || !rec.chatId || archiveIds.has(rec.chatId)) continue;
              const row = normalizeLinkedOnlyRegistryRow(rec);
              if (row) { linkedRows.push(row); fallbackLinkedRows++; }
            }
          }
          state.lastRefreshSources = {
            reason: String(reason),
            archiveRowsRaw: list.length,
            archiveRowsNormalized: archiveRows.length,
            nativeLinkedRecords: nativeRecordsCount,
            nativeLinkedRows,
            fallbackRegistryRecords: fallbackRecordsCount,
            fallbackLinkedRows,
            linkedRows: linkedRows.length,
            at: Date.now(),
          };
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
        state.lastRefreshSources = {
          ...(state.lastRefreshSources || {}),
          reason: String(reason),
          totalRows: state.rows.length,
          source: state.lastSource,
          at: state.lastScanTs,
        };
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

  // ── Desktop / Tauri (M2a-3g) ───────────────────────────────────────────────
  // When running in the Tauri Studio Desktop shell (apps/studio/desktop),
  // LibraryIndex derives its rows from the six SQLite-backed entity stores
  // (chats / snapshots / folders / labels / tags / categories) instead of
  // from the MV3 chat-list service + native broadcast. The MV3 path is left
  // untouched; the dispatcher below picks the right refresher based on
  // platform detection.
  function LI_isTauri() {
    try { return W.H2O?.Studio?.platform?.env?.isTauri === true; }
    catch (_) { return false; }
  }

  function collectStoreStatus() {
    const out = {};
    const stores = W.H2O?.Studio?.store;
    if (!stores) return out;
    ['chats', 'snapshots', 'folders', 'labels', 'tags', 'categories'].forEach((name) => {
      const s = stores[name];
      if (!s || typeof s.diagnose !== 'function') {
        out[name] = { available: false };
        return;
      }
      try {
        const d = s.diagnose() || {};
        out[name] = {
          available: true,
          ready: !!d.ready,
          backend: d.backend || null,
          errors: Array.isArray(d.errors) ? d.errors.length : 0,
        };
      } catch (e) {
        out[name] = { available: true, error: String(e?.message || e) };
      }
    });
    return out;
  }

  // Stores poll for SQLite-ready themselves; their isReady() flips true once
  // the kv shim has been upgraded and the first sanity count completes. We
  // poll briefly so the boot refresh sees populated tables rather than
  // racing the async store init.
  async function waitForDesktopStoresReady(maxWaitMs = 10000) {
    const stores = W.H2O?.Studio?.store;
    if (!stores) return false;
    const names = ['chats', 'snapshots', 'folders', 'labels', 'tags', 'categories'];
    const deadline = Date.now() + Math.max(100, Number(maxWaitMs) || 0);
    while (Date.now() < deadline) {
      const allReady = names.every((n) => {
        const s = stores[n];
        return s && typeof s.isReady === 'function' && s.isReady();
      });
      if (allReady) return true;
      await new Promise((r) => W.setTimeout(r, 100));
    }
    return false;
  }

  // Pure mapper: SQLite chat row + pre-fetched join data → compact row that
  // matches the shape persist() emits and that normalizeRow() round-trips.
  // Studio convention: tags/labels are arrays of NAMES (not ids/objects);
  // see persist() for the fields each carries.
  function projectChatToCompactRow(chat, joins) {
    const cid = chat?.chatId;
    const folderInfo = (joins.folderByChatId && joins.folderByChatId[cid]) || null;
    const labelInfos = (joins.labelsByChatId && joins.labelsByChatId[cid]) || [];
    const tagInfos = (joins.tagsByChatId && joins.tagsByChatId[cid]) || [];
    const catInfo = (joins.categoryByChatId && joins.categoryByChatId[cid]) || null;
    let view = 'all';
    if (chat?.isArchived) view = 'archived';
    else if (chat?.isSaved) view = 'saved';
    else if (chat?.isLinked) view = 'linked';
    const href = chat?.href || chat?.linkSourceHref
      || (chat?.sourceId ? ('https://chatgpt.com/c/' + chat.sourceId) : '')
      || (cid ? ('https://chatgpt.com/c/' + cid) : '');
    return {
      chatId: cid,
      snapshotId: chat?.lastSnapshotId || null,
      title: chat?.title || '',
      projectId: chat?.projectId || '',
      folderId: folderInfo ? folderInfo.folderId : '',
      folderName: folderInfo ? folderInfo.name : '',
      categoryId: catInfo ? catInfo.categoryId : (chat?.categoryId || ''),
      categoryName: catInfo ? catInfo.name : '',
      view,
      tags: tagInfos.map((t) => t && t.name).filter(Boolean),
      labels: labelInfos.map((l) => l && l.name).filter(Boolean),
      snapshotCount: Number(chat?.snapshotCount || 0),
      capturedAt: chat?.lastCapturedAt || null,
      updatedAt: chat?.updatedAt || 0,
      messageCount: Number(chat?.messageCount || 0),
      pinned: !!chat?.isPinned,
      archived: !!chat?.isArchived,
      // Desktop-only enrichment — not part of the compact contract but the
      // Reader / Library UI may consume these later (M2a-3i+):
      href,
      linkSourceHref: chat?.linkSourceHref || '',
      isSaved: !!chat?.isSaved,
      isLinked: !!chat?.isLinked,
      isImported: !!chat?.importBatchId,
    };
  }

  // First-commit join strategy: per-chat lookups via the existing store
  // APIs (one round-trip per chat per facet — N+1). Correctness over
  // performance for V1; large imports can later switch to bulk SQL JOINs
  // via direct __TAURI_INTERNALS__.invoke('plugin:sql|select') without
  // changing this contract.
  async function loadDesktopJoinsForChats(chatRows) {
    const stores = W.H2O?.Studio?.store || {};
    const folders = stores.folders;
    const labels = stores.labels;
    const tags = stores.tags;
    const categories = stores.categories;
    const folderByChatId = Object.create(null);
    const labelsByChatId = Object.create(null);
    const tagsByChatId = Object.create(null);
    const categoryByChatId = Object.create(null);
    await Promise.all((chatRows || []).map(async (chat) => {
      const cid = chat?.chatId;
      if (!cid) return;
      try {
        if (folders && typeof folders.listForChat === 'function') {
          const arr = await folders.listForChat(cid);
          if (Array.isArray(arr) && arr.length > 0) folderByChatId[cid] = arr[0];
        }
      } catch (e) { err('loadJoins.folders', e); }
      try {
        if (labels && typeof labels.listForChat === 'function') {
          const arr = await labels.listForChat(cid);
          if (Array.isArray(arr) && arr.length > 0) labelsByChatId[cid] = arr;
        }
      } catch (e) { err('loadJoins.labels', e); }
      try {
        if (tags && typeof tags.listForChat === 'function') {
          const arr = await tags.listForChat(cid);
          if (Array.isArray(arr) && arr.length > 0) tagsByChatId[cid] = arr;
        }
      } catch (e) { err('loadJoins.tags', e); }
      try {
        if (categories && typeof categories.getForChat === 'function') {
          const cat = await categories.getForChat(cid);
          if (cat) categoryByChatId[cid] = cat;
        }
      } catch (e) { err('loadJoins.category', e); }
    }));
    return { folderByChatId, labelsByChatId, tagsByChatId, categoryByChatId };
  }

  async function refreshFromStores(reason = 'manual') {
    if (state.refreshInFlight) return state.refreshInFlight;
    const chatsStore = W.H2O?.Studio?.store?.chats;
    if (!chatsStore || typeof chatsStore.list !== 'function') {
      err('refreshFromStores', 'store.chats unavailable');
      return state.rows;
    }
    state.refreshInFlight = (async () => {
      try {
        const chatRows = await chatsStore.list();
        const list = Array.isArray(chatRows) ? chatRows : [];
        const joins = await loadDesktopJoinsForChats(list);
        const compact = list.map((c) => projectChatToCompactRow(c, joins));
        const normalized = compact.map(normalizeRow).filter(Boolean);
        state.rows = normalized;
        state.byChatId = Object.create(null);
        for (const r of state.rows) state.byChatId[r.chatId] = r;
        rebuildFacets();
        state.lastScanTs = Date.now();
        state.lastScanReason = String(reason);
        state.lastSource = 'desktop-sqlite';
        state.lastRefreshSources = {
          reason: String(reason),
          sqliteChats: list.length,
          normalizedRows: normalized.length,
          totalRows: state.rows.length,
          source: state.lastSource,
          at: state.lastScanTs,
        };
        step('refreshFromStores.ok', `${list.length}->${normalized.length}:${reason}`);
        // Skip persist() on Desktop — SQLite tables are the canonical source
        // and the entity blob would only carry a redundant compact mirror.
        emitUpdated(reason);
        return state.rows;
      } catch (e) {
        err('refreshFromStores', e);
        return state.rows;
      } finally {
        state.refreshInFlight = null;
      }
    })();
    return state.refreshInFlight;
  }

  // Single point of fan-out: each store's subscribe() fires on any local
  // write; we coalesce them through scheduleRefresh's existing debouncer.
  function subscribeToDesktopStores() {
    const stores = W.H2O?.Studio?.store;
    if (!stores) return;
    ['chats', 'snapshots', 'folders', 'labels', 'tags', 'categories'].forEach((name) => {
      const s = stores[name];
      if (!s || typeof s.subscribe !== 'function') return;
      try { s.subscribe(() => scheduleRefresh('store:' + name + ':changed')); }
      catch (e) { err('subscribeToDesktopStores:' + name, e); }
    });
    step('subscribeToDesktopStores', 'wired');
  }

  // Dispatcher used by scheduleRefresh, the public refresh() API, and the
  // refresh-request listener. Branches on Tauri detection; MV3 keeps the
  // existing refreshFromArchive path verbatim.
  function runRefresh(reason) {
    if (LI_isTauri()) return refreshFromStores(reason);
    return refreshFromArchive(reason);
  }

  function scheduleRefresh(reason) {
    if (state.refreshTimer) return;
    state.refreshTimer = W.setTimeout(() => {
      state.refreshTimer = null;
      runRefresh(reason || 'scheduled').catch(() => {});
    }, REFRESH_DEBOUNCE_MS);
  }

  function summarizeFacets() {
    const out = {};
    try {
      for (const [key, value] of Object.entries(state.facets || {})) {
        out[key] = value && typeof value === 'object' ? Object.keys(value).length : 0;
      }
    } catch {}
    return out;
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

    async refresh(reason) { return runRefresh(reason || 'api'); },
    scheduleRefresh,

    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      state.subscribers.add(fn);
      return () => state.subscribers.delete(fn);
    },

    diagnose() {
      const desktop = LI_isTauri();
      return {
        surface: 'studio',
        source: desktop ? 'sqlite' : 'archive',
        storeStatus: desktop ? collectStoreStatus() : null,
        ready: state.ready,
        rows: state.rows.length,
        lastScanTs: state.lastScanTs,
        lastScanReason: state.lastScanReason,
        lastSource: state.lastSource,
        lastPersistBackend: state.lastPersistBackend,
        lastPersistTs: state.lastPersistTs,
        hasArchive: !!getChatList(),
        hasStore: !!getStore(),
        hasRegistry: !!getChatRegistry(),
        counts: LibraryIndex.counts(),
        projection: {
          sources: state.lastRefreshSources ? { ...state.lastRefreshSources } : null,
          hydrate: state.lastHydrateSources ? { ...state.lastHydrateSources } : null,
          facetKeyCounts: summarizeFacets(),
        },
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
      // Desktop / Tauri (M2a-3g): the chat-list service is MV3-only; on
      // Desktop we wire subscribers and refresh from the SQLite-backed
      // entity stores once their async init has caught up.
      if (LI_isTauri()) {
        try { subscribeToDesktopStores(); }
        catch (e) { err('boot.desktop.subscribe', e); }
        state.ready = true;
        waitForDesktopStoresReady().then((ok) => {
          if (!ok) err('boot.desktop', 'stores not ready within timeout');
          refreshFromStores('boot').catch(() => {});
        });
        return;
      }
      // MV3: first refresh after Library Ready signal so we know chat-list service is available.
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
    runRefresh(String(e?.detail?.reason || 'refresh-request')).catch(() => {});
  });

  // Phase K-2.5 — cross-surface broadcast trigger. When the user runs
  // Add-to-Library on chatgpt.com, native 0F1g emits chat-registry:changed;
  // native 0F1h consumes that event and writes a payload (including a
  // snapshotLinkedRecords() projection) into
  // chrome.storage.local['h2o:library:cross-surface:broadcast:native:v1'].
  // Studio S0F1h hears chrome.storage.onChanged on that key and dispatches
  // evt:h2o:library:cross-surface-sync on this window. Every other Studio
  // Library consumer (S0F1d / S0F2a / S0Z1g / studio.js) already listens
  // and re-renders on that event — S0F1c was the lone holdout, so the
  // newly-linked record sat unread in the broadcast key until boot/manual
  // refresh. This listener closes the loop so H2O.LibraryIndex.getAll()
  // picks up linked-only records automatically. runRefresh is single-
  // flight (refreshInFlight guard inside refreshFromArchive), so coalesced
  // bursts collapse to at most one in-flight refresh.
  W.addEventListener('evt:h2o:library:cross-surface-sync', () => {
    runRefresh('cross-surface-sync').catch(() => {});
  });

  step('boot', 'studio-library-index-ready');
})();
