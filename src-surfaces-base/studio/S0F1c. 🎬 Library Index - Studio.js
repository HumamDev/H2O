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
    lastRowsSignature: '',
    lastRowsSignatureBefore: '',
    lastRowsSignatureAfter: '',
    lastRefreshChanged: false,
    lastRefreshSkipped: false,
    lastRefreshSkipReason: '',
    lastUpdateReason: '',
    updateEvents: [],
    updateEventCount10s: 0,
    skippedUpdateEvents: 0,
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
    if (c) {
      const row = c.normalizeRowStudio(raw);
      if (row && raw && typeof raw === 'object') {
        row.lastSnapshotId = String(row.lastSnapshotId || raw.lastSnapshotId || raw.latestSnapshotId || row.snapshotId || raw.snapshotId || '').trim();
        row.latestSnapshotId = String(row.latestSnapshotId || row.lastSnapshotId || raw.latestSnapshotId || raw.lastSnapshotId || row.snapshotId || raw.snapshotId || '').trim();
        row.turnCount = numericCount(row.turnCount || raw.turnCount);
        row.userTurnCount = numericCount(row.userTurnCount || raw.userTurnCount);
        row.assistantTurnCount = numericCount(row.assistantTurnCount || raw.assistantTurnCount);
        row.answerCount = numericCount(row.answerCount || raw.answerCount);
      }
      return applyDisplayClassification(row);
    }
    return null;
  }

  function sortStrings(list) {
    return Array.isArray(list) ? list.map((v) => String(v || '')).sort() : [];
  }

  function canonicalRowForSignature(row) {
    const r = row && typeof row === 'object' ? row : {};
    const st = r.state && typeof r.state === 'object' ? r.state : {};
    return {
      chatId: cleanString(r.chatId),
      snapshotId: cleanString(r.snapshotId),
      lastSnapshotId: cleanString(r.lastSnapshotId),
      latestSnapshotId: cleanString(r.latestSnapshotId),
      title: cleanString(r.title),
      view: cleanString(r.view),
      displayView: cleanString(r.displayView),
      badgeKind: cleanString(r.badgeKind),
      readerKind: cleanString(r.readerKind),
      folderId: cleanString(r.folderId),
      folderName: cleanString(r.folderName),
      categoryId: cleanString(r.categoryId),
      categoryName: cleanString(r.categoryName),
      projectId: cleanString(r.projectId),
      labels: sortStrings(r.labels),
      tags: sortStrings(r.tags),
      snapshotCount: numericCount(r.snapshotCount),
      messageCount: numericCount(r.messageCount),
      turnCount: numericCount(r.turnCount),
      userTurnCount: numericCount(r.userTurnCount),
      assistantTurnCount: numericCount(r.assistantTurnCount),
      answerCount: numericCount(r.answerCount),
      pinned: !!r.pinned || !!st.isPinned,
      archived: !!r.archived || !!st.isArchived,
      isSaved: !!r.isSaved || !!st.isSaved,
      isLinked: !!r.isLinked || !!st.isLinked,
      isImported: !!r.isImported || !!st.isImported,
      isDeleted: !!st.isDeleted,
      href: cleanString(r.href),
      normalizedHref: cleanString(r.normalizedHref),
      linkSourceHref: cleanString(r.linkSourceHref),
      capturedAt: cleanString(r.capturedAt),
      updatedAt: cleanString(r.updatedAt),
    };
  }

  function rowsSignature(rows) {
    const list = (Array.isArray(rows) ? rows : [])
      .map(canonicalRowForSignature)
      .sort((a, b) => String(a.chatId || '').localeCompare(String(b.chatId || ''))
        || String(a.snapshotId || '').localeCompare(String(b.snapshotId || '')));
    return JSON.stringify(list);
  }

  function rememberUpdateEvent(reason, beforeHash, afterHash, emitted) {
    const now = Date.now();
    state.lastUpdateReason = String(reason || '');
    state.lastRowsSignatureBefore = String(beforeHash || '');
    state.lastRowsSignatureAfter = String(afterHash || '');
    if (!emitted) state.skippedUpdateEvents += 1;
    if (emitted) state.updateEvents.push({ t: now, reason: String(reason || ''), hash: String(afterHash || '') });
    state.updateEvents = state.updateEvents.filter((evt) => evt && now - evt.t <= 10000).slice(-50);
    state.updateEventCount10s = state.updateEvents.length;
  }

  function applyRowsIfChanged(nextRows, reason, source, refreshSources) {
    const rows = Array.isArray(nextRows) ? nextRows : [];
    const before = state.lastRowsSignature || rowsSignature(state.rows);
    const after = rowsSignature(rows);
    const changed = before !== after;
    state.lastRowsSignatureBefore = before;
    state.lastRowsSignatureAfter = after;
    state.lastRefreshChanged = changed;
    state.lastRefreshSkipped = !changed;
    state.lastRefreshSkipReason = changed ? '' : 'unchanged-row-signature';
    state.lastScanTs = Date.now();
    state.lastScanReason = String(reason);
    state.lastSource = String(source || state.lastSource || '');
    state.lastRefreshSources = {
      ...(refreshSources || {}),
      reason: String(reason),
      totalRows: rows.length,
      source: state.lastSource,
      changed,
      dataHashBefore: before,
      dataHashAfter: after,
      skippedReason: changed ? '' : state.lastRefreshSkipReason,
      at: state.lastScanTs,
    };
    if (!changed) {
      rememberUpdateEvent(reason, before, after, false);
      step('refresh.skip-unchanged', `${rows.length}:${reason}`);
      return false;
    }
    state.rows = rows;
    state.byChatId = Object.create(null);
    for (const r of state.rows) state.byChatId[r.chatId] = r;
    rebuildFacets();
    state.lastRowsSignature = after;
    return true;
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
    rememberUpdateEvent(reason, state.lastRowsSignatureBefore, state.lastRowsSignature, true);
    const detail = {
      reason: String(reason || ''),
      rows: state.rows.length,
      t: Date.now(),
      surface: 'studio',
      dataHash: state.lastRowsSignature || '',
      updateEventCount10s: state.updateEventCount10s,
    };
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
        lastSnapshotId: r.lastSnapshotId, latestSnapshotId: r.latestSnapshotId,
        messageCount: r.messageCount, turnCount: r.turnCount,
        userTurnCount: r.userTurnCount, assistantTurnCount: r.assistantTurnCount,
        answerCount: r.answerCount, pinned: r.pinned, archived: r.archived,
        displayView: r.displayView, badgeKind: r.badgeKind, readerKind: r.readerKind,
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
        state.lastRowsSignature = rowsSignature(state.rows);
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
  const ARCHIVE_MESSAGE_TYPE = 'h2o-ext-archive:v1';

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function looksLikeOpaqueTitle(value, id) {
    const text = cleanString(value);
    const chatId = cleanString(id);
    if (!text) return true;
    if (chatId && text === chatId) return true;
    if (/^(imported chat|linked chat|untitled chat|link|chatgpt)$/i.test(text)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
    if (/^[0-9a-f][0-9a-f-]{23,}$/i.test(text)) return true;
    if (/^(imported|chat|conversation)[-_:][a-z0-9-]{12,}$/i.test(text)) return true;
    return false;
  }

  function friendlyShellTitle(primary, id, fallback) {
    const values = Array.isArray(primary) ? primary : [primary];
    for (const value of values) {
      const title = cleanString(value);
      if (title && !looksLikeOpaqueTitle(title, id)) return title;
    }
    return cleanString(fallback) || 'Imported chat';
  }

  function boolValue(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }

  function numericCount(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function chatHasTranscriptEvidence(chat, latestSnapshot) {
    return !!(
      chat?.lastSnapshotId
      || chat?.snapshotId
      || chat?.snapshot_id
      || latestSnapshot?.snapshotId
      || numericCount(chat?.messageCount) > 0
      || numericCount(chat?.turnCount) > 0
      || numericCount(chat?.userTurnCount) > 0
      || numericCount(chat?.assistantTurnCount) > 0
    );
  }

  function rowLinkedUrl(row) {
    const raw = row?.raw && typeof row.raw === 'object' ? row.raw : {};
    return cleanString(
      row?.href
      || row?.url
      || row?.sourceUrl
      || row?.linkSourceHref
      || row?.normalizedHref
      || raw.href
      || raw.url
      || raw.sourceUrl
      || raw.linkSourceHref
      || raw.normalizedHref
    );
  }

  function rowHasRealTranscriptEvidence(row) {
    if (!row) return false;
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    if (row.snapshotId || row.lastSnapshotId || row.latestSnapshotId || raw.snapshotId || raw.lastSnapshotId || raw.latestSnapshotId || raw.snapshot_id) return true;
    if (numericCount(row.messageCount) > 0 || numericCount(row.turnCount) > 0 || numericCount(row.userTurnCount) > 0 || numericCount(row.assistantTurnCount) > 0) return true;
    if (numericCount(raw.messageCount) > 0 || numericCount(raw.turnCount) > 0 || numericCount(raw.userTurnCount) > 0 || numericCount(raw.assistantTurnCount) > 0) return true;
    if (Array.isArray(raw.snapshots)) {
      return raw.snapshots.some((snap) => snap && typeof snap === 'object' && (
        snap.snapshotId || snap.id || numericCount(snap.messageCount) > 0 || numericCount(snap.turnCount) > 0
      ));
    }
    return false;
  }

  function applyDisplayClassification(row) {
    if (!row || typeof row !== 'object') return row;
    const raw = row.raw && typeof row.raw === 'object' ? row.raw : {};
    const sourceView = cleanString(row.sourceView || row.originalView || row.rawView || row.view || raw.view).toLowerCase();
    const href = rowLinkedUrl(row);
    const hasTranscript = rowHasRealTranscriptEvidence(row);
    const sourceIsSaved = !!(row.sourceIsSaved || row.isSaved || row.state?.isSaved || raw.isSaved || raw.state?.isSaved || sourceView === 'saved');
    const sourceIsLinked = !!(row.sourceIsLinked || row.isLinked || row.state?.isLinked || raw.isLinked || raw.state?.isLinked || sourceView === 'linked' || sourceView === 'link');
    if (sourceView && !row.sourceView) row.sourceView = sourceView;
    if (sourceView && !row.originalView) row.originalView = sourceView;
    if (sourceView && !row.rawView) row.rawView = sourceView;
    if (hasTranscript) {
      row.displayView = row.archived ? 'archived' : 'saved';
      row.badgeKind = row.archived ? 'Archive' : 'Saved';
      row.readerKind = 'reader';
      row.sourceIsSaved = sourceIsSaved;
      row.sourceIsLinked = sourceIsLinked;
      row.view = row.displayView;
      row.isSaved = row.displayView === 'saved' || sourceIsSaved;
      row.isLinked = sourceIsLinked;
      row.state = Object.assign({}, row.state || {}, {
        isSaved: row.isSaved,
        isLinked: row.isLinked,
      });
      if (raw && typeof raw === 'object') {
        raw.sourceView = raw.sourceView || sourceView || '';
        raw.sourceIsSaved = raw.sourceIsSaved || sourceIsSaved;
        raw.sourceIsLinked = raw.sourceIsLinked || sourceIsLinked;
      }
      return row;
    }
    if (href) {
      row.sourceIsSaved = sourceIsSaved;
      row.sourceIsLinked = sourceIsLinked;
      row.view = 'link';
      row.displayView = 'link';
      row.badgeKind = 'Link';
      row.badge = 'Link';
      row.readerKind = 'placeholder';
      row.isSaved = false;
      if (row.state && typeof row.state === 'object') row.state = Object.assign({}, row.state, { isSaved: false });
      if (raw && typeof raw === 'object') {
        raw.sourceView = raw.sourceView || sourceView || '';
        raw.sourceIsSaved = raw.sourceIsSaved || row.sourceIsSaved;
        raw.sourceIsLinked = raw.sourceIsLinked || row.sourceIsLinked;
        raw.isSaved = false;
      }
    }
    return row;
  }

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

  function callArchiveExportFullBundle() {
    return new Promise((resolve) => {
      try {
        if (!W.chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
          resolve(null);
          return;
        }
        const message = { type: ARCHIVE_MESSAGE_TYPE, req: { op: 'exportFullBundle', payload: {} } };
        const sent = chrome.runtime.sendMessage(message, (response) => {
          try {
            if (chrome.runtime && chrome.runtime.lastError) { resolve(null); return; }
          } catch {}
          resolve(response && response.ok ? response.result : null);
        });
        if (sent && typeof sent.then === 'function') {
          sent.then((response) => resolve(response && response.ok ? response.result : null)).catch(() => resolve(null));
        }
      } catch (e) {
        err('callArchiveExportFullBundle', e);
        resolve(null);
      }
    });
  }

  function bundleChatIndex(chat) {
    return chat && chat.chatIndex && typeof chat.chatIndex === 'object' && !Array.isArray(chat.chatIndex)
      ? chat.chatIndex
      : {};
  }

  function bundleChatState(chat) {
    const index = bundleChatIndex(chat);
    return index.state && typeof index.state === 'object' && !Array.isArray(index.state)
      ? index.state
      : {};
  }

  function bundleShellLinkTarget(chat, index) {
    return cleanString(index && (index.href || index.normalizedHref || index.linkSourceHref))
      || cleanString(chat && (chat.href || chat.normalizedHref || chat.linkSourceHref));
  }

  function isDurableBundleShellChat(chat) {
    const chatId = cleanString(chat && chat.chatId);
    const snapshots = Array.isArray(chat && chat.snapshots) ? chat.snapshots : [];
    if (!chatId || snapshots.length > 0) return false;
    const index = bundleChatIndex(chat);
    const state = bundleChatState(chat);
    const view = cleanString(index.view || index.kind || index.type).toLowerCase();
    return index.f19MinimalLibraryIndexRow === true
      || index.f19ChromeDesktopMinimalRow === true
      || index.f19LibraryIndexProjectedRow === true
      || view === 'saved'
      || view === 'linked'
      || view === 'imported'
      || index.isSaved === true
      || index.isLinked === true
      || index.isImported === true
      || state.isSaved === true
      || state.isLinked === true
      || state.isImported === true
      || state.isPinned === true
      || state.isArchived === true
      || !!bundleShellLinkTarget(chat, index);
  }

  function recordFromDurableBundleShellChat(chat) {
    const chatId = cleanString(chat && chat.chatId);
    if (!chatId) return null;
    const index = bundleChatIndex(chat);
    const state = bundleChatState(chat);
    const org = index.organization && typeof index.organization === 'object' && !Array.isArray(index.organization)
      ? index.organization
      : {};
    const meta = chat && chat.meta && typeof chat.meta === 'object' && !Array.isArray(chat.meta) ? chat.meta : {};
    const source = chat && chat.source && typeof chat.source === 'object' && !Array.isArray(chat.source) ? chat.source : {};
    const view = cleanString(index.view || index.kind || index.type).toLowerCase();
    const saved = view === 'saved' || index.isSaved === true || state.isSaved === true;
    const linked = view === 'linked' || index.isLinked === true || state.isLinked === true;
    const imported = !saved && !linked
      && (view === 'imported' || index.isImported === true || state.isImported === true || !!bundleShellLinkTarget(chat, index));
    const href = bundleShellLinkTarget(chat, index) || ('https://chatgpt.com/c/' + chatId);
    const observedAt = new Date().toISOString();
    return {
      chatId,
      title: friendlyShellTitle([
        index.title || chat.title,
        index.displayTitle,
        index.sourceTitle,
        index.pageTitle,
        index.chatTitle,
        index.originalTitle,
        index.name,
        chat.displayTitle,
        chat.sourceTitle,
        chat.pageTitle,
        chat.chatTitle,
        chat.originalTitle,
        chat.name,
        meta.title,
        meta.displayTitle,
        meta.sourceTitle,
        meta.pageTitle,
        meta.chatTitle,
        meta.originalTitle,
        source.title,
        source.displayTitle,
        source.sourceTitle,
        source.pageTitle,
        source.chatTitle,
        source.originalTitle,
        index.filename,
        index.sourceLabel,
        chat.filename,
        chat.sourceLabel,
        source.filename,
        source.label,
      ], chatId, linked && !saved ? 'Link' : 'Imported chat'),
      href,
      normalizedHref: cleanString(index.normalizedHref || chat.normalizedHref) || href,
      updatedAt: cleanString(index.updatedAt || chat.updatedAt) || observedAt,
      lastSeenAt: cleanString(index.lastSeenAt || chat.lastSeenAt) || observedAt,
      source: {
        first: 'desktop-sync-folder-rehydrate',
        seenFrom: ['desktop-sync-folder-rehydrate'],
      },
      organization: {
        categoryId: cleanString(org.categoryId || org.category_id),
        folderId: '',
        tagIds: [],
        labelIds: [],
      },
      state: {
        isSaved: !!saved,
        isLinked: !!(linked || saved),
        isPinned: index.pinned === true || index.isPinned === true || state.isPinned === true,
        isArchived: index.archived === true || index.isArchived === true || state.isArchived === true,
        isImported: !!imported || index.f19MinimalLibraryIndexRow === true || index.f19ChromeDesktopMinimalRow === true,
        isDeleted: state.isDeleted === true,
      },
      linkedAt: cleanString(index.linkedAt || chat.linkedAt) || observedAt,
      linkedFrom: cleanString(index.linkedFrom || chat.linkedFrom) || 'desktop-sync-folder-rehydrate',
      linkSourceHref: cleanString(index.linkSourceHref || chat.linkSourceHref) || href,
      quality: {
        confidence: 'sync-shell',
        inferredFields: imported ? ['desktop-imported-shell-row'] : ['desktop-shell-row'],
      },
    };
  }

  async function readDurableBundleShellRows() {
    const out = {
      available: false,
      chatCount: 0,
      shellRecordCount: 0,
      shellRowCount: 0,
      records: [],
      rows: [],
    };
    const bundle = await callArchiveExportFullBundle();
    const chats = bundle && bundle.chatArchive && Array.isArray(bundle.chatArchive.chats)
      ? bundle.chatArchive.chats
      : [];
    out.available = !!bundle;
    out.chatCount = chats.length;
    for (const chat of chats) {
      if (!isDurableBundleShellChat(chat)) continue;
      const record = recordFromDurableBundleShellChat(chat);
      const row = normalizeRegistryShellRow(record);
      if (!record || !row) continue;
      out.records.push(record);
      out.rows.push(row);
    }
    out.shellRecordCount = out.records.length;
    out.shellRowCount = out.rows.length;
    return out;
  }

  async function rehydrateRegistryFromDurableShellRows(records, archiveIds) {
    const out = { attempted: 0, materialized: 0, existing: 0, failed: 0 };
    const reg = getChatRegistry();
    if (!reg || typeof reg.upsertRecord !== 'function') return out;
    try {
      if (reg.ready && typeof reg.ready.then === 'function') await reg.ready;
    } catch {}
    for (const rec of (Array.isArray(records) ? records : [])) {
      if (!rec || !rec.chatId || (archiveIds && archiveIds.has(rec.chatId))) continue;
      out.attempted += 1;
      try {
        let existed = null;
        if (typeof reg.getRecord === 'function') {
          try { existed = reg.getRecord(rec.chatId); } catch { existed = null; }
        }
        const written = reg.upsertRecord(rec, {
          source: 'desktop-sync-folder-rehydrate',
          passive: true,
          observedAt: new Date().toISOString(),
        });
        if (written) {
          if (existed) out.existing += 1;
          else out.materialized += 1;
        } else {
          out.failed += 1;
        }
      } catch (e) {
        out.failed += 1;
        err('rehydrateRegistryFromDurableShellRows', e);
      }
    }
    return out;
  }

  // Zero-snapshot registry records live in Chat Registry but have no archive
  // snapshot. Desktop -> Chrome propagation materializes Desktop shell rows
  // here; saved/linked flags keep their normal meaning, while imported-only
  // shell rows are visible total-only rows and do not increment saved/linked.
  function normalizeRegistryShellRow(rec) {
    const c = ixCore();
    if (!c || !rec || typeof rec !== 'object') return null;
    const chatId = String(rec.chatId || '').trim();
    if (!chatId) return null;
    const st = rec.state && typeof rec.state === 'object' ? rec.state : null;
    if (!st || st.isDeleted) return null;
    const isSaved = !!st.isSaved;
    const isLinked = !!st.isLinked;
    const isImported = !!st.isImported;
    const href = String(rec.href || rec.normalizedHref || rec.linkSourceHref || '').trim();
    if (!isSaved && !isLinked && !isImported && !st.isPinned && !st.isArchived && !href) return null;
    const snapshotId = String(rec.lastSnapshotId || rec.snapshotId || rec.snapshot_id || rec.latestSnapshotId || '').trim();
    const snapshotCount = snapshotId ? Math.max(numericCount(rec.snapshotCount), 1) : 0;
    const messageCount = numericCount(rec.messageCount);
    const turnCount = numericCount(rec.turnCount);
    const userTurnCount = numericCount(rec.userTurnCount);
    const assistantTurnCount = numericCount(rec.assistantTurnCount);
    const answerCount = numericCount(rec.answerCount);
    const hasTranscript = !!snapshotId || messageCount > 0 || turnCount > 0 || userTurnCount > 0 || assistantTurnCount > 0;
    const row = c.normalizeRowStudio({
      chatId,
      snapshotId: snapshotId || null,
      lastSnapshotId: snapshotId || null,
      latestSnapshotId: snapshotId || null,
      title: friendlyShellTitle([
        rec.title,
        rec.displayTitle,
        rec.sourceTitle,
        rec.pageTitle,
        rec.chatTitle,
        rec.originalTitle,
        rec.name,
        rec.source && rec.source.title,
        rec.source && rec.source.displayTitle,
        rec.source && rec.source.sourceTitle,
        rec.source && rec.source.pageTitle,
        rec.source && rec.source.chatTitle,
        rec.source && rec.source.originalTitle,
        rec.filename,
        rec.sourceLabel,
      ], chatId, isLinked && !isSaved ? 'Link' : 'Imported chat'),
      projectId: rec.project?.projectId,
      folderId: rec.organization?.folderId,
      categoryId: rec.organization?.categoryId,
      view: isSaved && hasTranscript ? 'saved' : (isLinked ? 'linked' : 'imported'),
      tags: [],
      labels: [],
      snapshotCount,
      messageCount,
      turnCount,
      userTurnCount,
      assistantTurnCount,
      answerCount,
      updatedAt: String(rec.updatedAt || rec.lastSeenAt || rec.firstSeenAt || ''),
      capturedAt: '',
      state: {
        isLinked,
        isSaved,
        isPinned: !!st.isPinned,
        isArchived: !!st.isArchived,
        isImported,
        isDeleted: false,
      },
      linkedAt: String(rec.linkedAt || ''),
      linkedFrom: String(rec.linkedFrom || ''),
      linkSourceHref: String(rec.linkSourceHref || ''),
      href,
      normalizedHref: String(rec.normalizedHref || ''),
    });
    row.lastSnapshotId = snapshotId || '';
    row.latestSnapshotId = snapshotId || '';
    row.snapshotCount = snapshotCount;
    row.messageCount = messageCount;
    row.turnCount = turnCount;
    row.userTurnCount = userTurnCount;
    row.assistantTurnCount = assistantTurnCount;
    row.answerCount = answerCount;
    row.transcriptEvidenceSource = hasTranscript ? 'native-linked-record-broadcast' : '';
    return applyDisplayClassification(row);
  }

  // Backward-compatible alias for older diagnostics and comments. This now
  // accepts saved and imported shell rows in addition to linked-only rows.
  function normalizeLinkedOnlyRegistryRow(rec) {
    return normalizeRegistryShellRow(rec);
  }

  function mergeNativeTranscriptEvidenceIntoRow(existing, incoming) {
    if (!existing || !incoming || !rowHasRealTranscriptEvidence(incoming)) return existing;
    const merged = Object.assign({}, existing, {
      title: friendlyShellTitle([
        incoming.title,
        incoming.displayTitle,
        incoming.sourceTitle,
        incoming.pageTitle,
        existing.title,
        existing.displayTitle,
        existing.name,
      ], existing.chatId || incoming.chatId, existing.title || incoming.title || 'Imported chat'),
      snapshotId: incoming.snapshotId || incoming.lastSnapshotId || existing.snapshotId || '',
      lastSnapshotId: incoming.lastSnapshotId || incoming.snapshotId || existing.lastSnapshotId || existing.snapshotId || '',
      latestSnapshotId: incoming.latestSnapshotId || incoming.lastSnapshotId || incoming.snapshotId || existing.latestSnapshotId || '',
      snapshotCount: Math.max(numericCount(existing.snapshotCount), numericCount(incoming.snapshotCount), incoming.snapshotId || incoming.lastSnapshotId ? 1 : 0),
      messageCount: Math.max(numericCount(existing.messageCount), numericCount(incoming.messageCount)),
      turnCount: Math.max(numericCount(existing.turnCount), numericCount(incoming.turnCount)),
      userTurnCount: Math.max(numericCount(existing.userTurnCount), numericCount(incoming.userTurnCount)),
      assistantTurnCount: Math.max(numericCount(existing.assistantTurnCount), numericCount(incoming.assistantTurnCount)),
      answerCount: Math.max(numericCount(existing.answerCount), numericCount(incoming.answerCount)),
      folderId: incoming.folderId || existing.folderId || '',
      categoryId: incoming.categoryId || existing.categoryId || '',
      href: rowLinkedUrl(incoming) || rowLinkedUrl(existing),
      normalizedHref: incoming.normalizedHref || existing.normalizedHref || '',
      linkSourceHref: incoming.linkSourceHref || existing.linkSourceHref || '',
      state: Object.assign({}, existing.state || {}, incoming.state || {}, {
        isSaved: true,
        isLinked: true,
      }),
      isSaved: true,
      isLinked: true,
      transcriptEvidenceSource: 'native-linked-record-broadcast-merge',
    });
    return applyDisplayClassification(merged);
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
          fallbackRegistryShellRows: 0,
          linkedRows: 0,
          at: Date.now(),
        };
        try {
          const archiveIds = new Set(archiveRows.map((r) => r.chatId));
          const nativeRecords = await readNativeChatRegistryRecords();
          const nativeRecordsCount = Array.isArray(nativeRecords) ? nativeRecords.length : 0;
          const projectedIds = new Set();
          let nativeLinkedRows = 0;
          let nativeTranscriptRows = 0;
          let nativeMergedTranscriptRows = 0;
          let fallbackRecordsCount = 0;
          let fallbackLinkedRows = 0;
          let fallbackRegistryShellRows = 0;
          let fallbackTranscriptRows = 0;
          let durableBundleChatCount = 0;
          let durableBundleShellRecords = 0;
          let durableBundleShellRows = 0;
          let durableBundleShellRowsProjected = 0;
          let durableBundleShellRowsRehydrated = 0;
          let durableBundleShellRowsExisting = 0;
          let durableBundleShellRowsFailed = 0;
          const archiveRowIndexById = new Map();
          archiveRows.forEach((row, index) => {
            if (row && row.chatId) archiveRowIndexById.set(row.chatId, index);
          });
          for (const rec of nativeRecords) {
            if (!rec || !rec.chatId) continue;
            const row = normalizeLinkedOnlyRegistryRow(rec);
            if (archiveIds.has(rec.chatId)) {
              if (row && rowHasRealTranscriptEvidence(row)) {
                const index = archiveRowIndexById.get(rec.chatId);
                if (Number.isInteger(index) && index >= 0) {
                  archiveRows[index] = mergeNativeTranscriptEvidenceIntoRow(archiveRows[index], row);
                  nativeMergedTranscriptRows++;
                  nativeTranscriptRows++;
                }
              }
              continue;
            }
            if (row && !projectedIds.has(row.chatId)) {
              linkedRows.push(row);
              projectedIds.add(row.chatId);
              nativeLinkedRows++;
              if (rowHasRealTranscriptEvidence(row)) nativeTranscriptRows++;
            }
          }
          const durable = await readDurableBundleShellRows();
          durableBundleChatCount = durable.chatCount;
          durableBundleShellRecords = durable.shellRecordCount;
          durableBundleShellRows = durable.shellRowCount;
          const rehydrated = await rehydrateRegistryFromDurableShellRows(durable.records, archiveIds);
          durableBundleShellRowsRehydrated = rehydrated.materialized;
          durableBundleShellRowsExisting = rehydrated.existing;
          durableBundleShellRowsFailed = rehydrated.failed;
          // Always merge Studio-side registry shell rows after native rows.
          // Desktop -> Chrome propagation materializes zero-snapshot Desktop
          // rows here; skipping this merge when the native key is non-empty
          // makes latest.json imports falsely report success while the
          // LibraryIndex remains unchanged. Archive rows still win by chatId.
          const reg = getChatRegistry();
          const registryList = reg && (typeof reg.listRecords === 'function'
            ? await reg.listRecords({ includeDeleted: false })
            : (typeof reg.listActive === 'function' ? await reg.listActive() : []));
          const fallbackRecords = Array.isArray(registryList) ? registryList : [];
          fallbackRecordsCount = fallbackRecords.length;
          for (const rec of fallbackRecords) {
            if (!rec || !rec.chatId || archiveIds.has(rec.chatId) || projectedIds.has(rec.chatId)) continue;
            const row = normalizeLinkedOnlyRegistryRow(rec);
            if (row) {
              linkedRows.push(row);
              projectedIds.add(row.chatId);
              fallbackLinkedRows++;
              fallbackRegistryShellRows++;
              if (rowHasRealTranscriptEvidence(row)) fallbackTranscriptRows++;
            }
          }
          for (const row of durable.rows) {
            if (!row || !row.chatId || archiveIds.has(row.chatId) || projectedIds.has(row.chatId)) continue;
            linkedRows.push(row);
            projectedIds.add(row.chatId);
            durableBundleShellRowsProjected++;
          }
          state.lastRefreshSources = {
            reason: String(reason),
            archiveRowsRaw: list.length,
            archiveRowsNormalized: archiveRows.length,
            nativeLinkedRecords: nativeRecordsCount,
            nativeLinkedRows,
            nativeTranscriptRows,
            nativeMergedTranscriptRows,
            fallbackRegistryRecords: fallbackRecordsCount,
            fallbackLinkedRows,
            fallbackRegistryShellRows,
            fallbackTranscriptRows,
            durableBundleChatCount,
            durableBundleShellRecords,
            durableBundleShellRows,
            durableBundleShellRowsProjected,
            durableBundleShellRowsRehydrated,
            durableBundleShellRowsExisting,
            durableBundleShellRowsFailed,
            linkedRows: linkedRows.length,
            at: Date.now(),
          };
        } catch (e) { err('refresh.linked-only', e); }

        const nextRows = archiveRows.concat(linkedRows);
        const nextSource = linkedRows.length
          ? `studio-archive+registry(${linkedRows.length})`
          : 'studio-archive';
        const changed = applyRowsIfChanged(nextRows, reason, nextSource, state.lastRefreshSources || {});
        if (!changed) return state.rows;
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
    const meta = chat?.meta && typeof chat.meta === 'object' && !Array.isArray(chat.meta) ? chat.meta : {};
    const chatIndexMeta = meta.chatIndexMeta && typeof meta.chatIndexMeta === 'object' && !Array.isArray(meta.chatIndexMeta)
      ? meta.chatIndexMeta
      : {};
    const folderInfo = (joins.folderByChatId && joins.folderByChatId[cid]) || null;
    const labelInfos = (joins.labelsByChatId && joins.labelsByChatId[cid]) || [];
    const tagInfos = (joins.tagsByChatId && joins.tagsByChatId[cid]) || [];
    const catInfo = (joins.categoryByChatId && joins.categoryByChatId[cid]) || null;
    const latestSnapshot = (joins.latestSnapshotByChatId && joins.latestSnapshotByChatId[cid]) || null;
    const href = chat?.href || chat?.linkSourceHref
      || (chat?.sourceId ? ('https://chatgpt.com/c/' + chat.sourceId) : '')
      || (cid ? ('https://chatgpt.com/c/' + cid) : '');
    const importedShell = !!(chat?.importBatchId || meta.f19ChromeDesktopMinimalRow || meta.f19ChromeDesktopMaterializedShell);
    const messageCount = Math.max(numericCount(chat?.messageCount), numericCount(latestSnapshot?.messageCount));
    const turnCount = Math.max(numericCount(chat?.turnCount), numericCount(meta.turnCount), numericCount(latestSnapshot?.turnCount));
    const userTurnCount = Math.max(numericCount(chat?.userTurnCount), numericCount(meta.userTurnCount), numericCount(latestSnapshot?.userTurnCount));
    const assistantTurnCount = Math.max(numericCount(chat?.assistantTurnCount), numericCount(meta.assistantTurnCount), numericCount(latestSnapshot?.assistantTurnCount));
    const answerCount = Math.max(numericCount(chat?.answerCount), numericCount(meta.answerCount), numericCount(latestSnapshot?.answerCount));
    const snapshotId = String(chat?.lastSnapshotId || chat?.snapshotId || chat?.snapshot_id || latestSnapshot?.snapshotId || '').trim();
    const snapshotCount = snapshotId ? Math.max(numericCount(chat?.snapshotCount), 1) : 0;
    const hasTranscript = chatHasTranscriptEvidence({ ...chat, snapshotCount, messageCount, turnCount, userTurnCount, assistantTurnCount }, latestSnapshot);
    const displaySaved = !!(chat?.isSaved && hasTranscript);
    const displayLinked = !!(chat?.isLinked || (!hasTranscript && href));
    let view = 'all';
    if (chat?.isArchived) view = 'archived';
    else if (displaySaved) view = 'saved';
    else if (displayLinked) view = 'linked';
    else if (importedShell) view = 'imported';
    const title = friendlyShellTitle([
      chat?.title,
      chat?.displayTitle,
      chat?.sourceTitle,
      chat?.pageTitle,
      chat?.chatTitle,
      chat?.originalTitle,
      meta.title,
      meta.displayTitle,
      meta.sourceTitle,
      meta.pageTitle,
      meta.chatTitle,
      meta.originalTitle,
      chatIndexMeta.title,
      chatIndexMeta.displayTitle,
      chatIndexMeta.sourceTitle,
      chatIndexMeta.pageTitle,
      chatIndexMeta.chatTitle,
      chatIndexMeta.originalTitle,
      chatIndexMeta.name,
      chat?.filename,
      chat?.sourceLabel,
      chatIndexMeta.filename,
      chatIndexMeta.sourceLabel,
    ], cid, displayLinked && !displaySaved ? 'Link' : 'Imported chat');
    return {
      chatId: cid,
      snapshotId: snapshotId || null,
      title,
      projectId: chat?.projectId || '',
      folderId: folderInfo ? folderInfo.folderId : '',
      folderName: folderInfo ? folderInfo.name : '',
      categoryId: catInfo ? catInfo.categoryId : (chat?.categoryId || ''),
      categoryName: catInfo ? catInfo.name : '',
      view,
      tags: tagInfos.map((t) => t && t.name).filter(Boolean),
      labels: labelInfos.map((l) => l && l.name).filter(Boolean),
      snapshotCount,
      capturedAt: chat?.lastCapturedAt || null,
      updatedAt: chat?.updatedAt || 0,
      messageCount,
      turnCount,
      userTurnCount,
      assistantTurnCount,
      answerCount,
      pinned: !!chat?.isPinned,
      archived: !!chat?.isArchived,
      // Desktop-only enrichment — not part of the compact contract but the
      // Reader / Library UI may consume these later (M2a-3i+):
      href,
      linkSourceHref: chat?.linkSourceHref || '',
      isSaved: displaySaved,
      isLinked: displayLinked,
      isImported: importedShell,
      state: {
        isLinked: displayLinked,
        isSaved: displaySaved,
        isPinned: !!chat?.isPinned,
        isArchived: !!chat?.isArchived,
        isImported: importedShell,
        isDeleted: !!chat?.isDeleted,
      },
      meta: Object.assign({}, meta, {
        f19SourceWasSaved: !!chat?.isSaved,
        f19DisplayClassifiedAsLink: displayLinked && !displaySaved,
      }),
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
    const snapshots = stores.snapshots;
    const folderByChatId = Object.create(null);
    const labelsByChatId = Object.create(null);
    const tagsByChatId = Object.create(null);
    const categoryByChatId = Object.create(null);
    const latestSnapshotByChatId = Object.create(null);
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
      try {
        if (snapshots && typeof snapshots.listByChat === 'function') {
          const arr = await snapshots.listByChat(cid);
          if (Array.isArray(arr) && arr.length > 0) latestSnapshotByChatId[cid] = arr[0];
        }
      } catch (e) { err('loadJoins.snapshots', e); }
    }));
    return { folderByChatId, labelsByChatId, tagsByChatId, categoryByChatId, latestSnapshotByChatId };
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
        const refreshSources = {
          reason: String(reason),
          sqliteChats: list.length,
          normalizedRows: normalized.length,
        };
        const changed = applyRowsIfChanged(normalized, reason, 'desktop-sqlite', refreshSources);
        if (!changed) return state.rows;
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
        lastUpdateReason: state.lastUpdateReason,
        dataHash: state.lastRowsSignature,
        dataHashBefore: state.lastRowsSignatureBefore,
        dataHashAfter: state.lastRowsSignatureAfter,
        lastRefreshChanged: state.lastRefreshChanged,
        lastRefreshSkipped: state.lastRefreshSkipped,
        lastRefreshSkipReason: state.lastRefreshSkipReason,
        updateEventCount10s: state.updateEventCount10s,
        skippedUpdateEvents: state.skippedUpdateEvents,
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
