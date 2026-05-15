// ==H2O Module==
// @h2o-id             0f1f.library_maintenance
// @name               0F1f.⬛️🗂️ Library Maintenance 🛠️🗂️
// @namespace          H2O.Premium.CGX.library_maintenance
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260509-000001
// @description        Library Maintenance: Phase 10 — H2O.Library.Maintenance shared service + Command Bar Library group with read-only diagnostics and 2-step-confirm repair commands. Loads after every Library feature owner so it can call their public APIs.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * 0F1f — Library Maintenance (Phase 10)
   *
   * OWNS:     H2O.Library.Maintenance shared service. Command Bar 'library' group +
   *           ~14 controls (8 read-only inspectors + 5 repair commands + Export/Import
   *           snapshot). Boot-time registration, owner-scoped (so removeOwner cleans
   *           up). Snapshot export/import that round-trips every Phase 1–9 durable key.
   * MUST NOT OWN: Any feature-domain logic (folders / projects / categories /
   *           tags / library-index / library-store / NavTo). Repair commands are
   *           thin coordinators that call existing public APIs.
   * EXPOSES:  H2O.Library.Maintenance — { inspectStore, inspectRegistry,
   *           inspectScanLedger, inspectTagAutoPool, inspectOccurrenceIndex,
   *           inspectCategoryCandidates, inspectCategoryOverrides, exportSnapshot,
   *           importSnapshot, rebuildRegistryFromStore, repairScanLedger,
   *           recomputeOccurrenceIndex, recomputeTagAutoPool, purgeCategoryCandidatePool,
   *           cleanupLegacyLocalStorageResidue, registerCommandBarControls, version }.
   *
   * Boot order: this module must load AFTER 0F1c LibraryIndex, 0F1e LibraryStore,
   * 0F4a Categories, 0F5a Tags, 0X1a Command Bar. The userscript header sets
   * @run-at document-idle which together with the dev-order.tsv slot below 0F1d
   * keeps the boot sequence correct.
   *
   * Hard rules from Phase 10 brief:
   *   - Default: nothing destructive runs without an explicit user click + confirm.
   *   - Every destructive command snapshots first.
   *   - Side Actions Panel: NO repair commands registered here. Command Bar only.
   *   - Cleanup-legacy-localStorage MUST gate on Store.backend()==='bridge' AND
   *     Store.caps().durable===true AND a confirmed snapshot AND only target a
   *     small allow-list of known stale keys; never touch
   *     'h2o:prm:cgx:library-index:known-registry:v1' (preserved legacy registry).
   */

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};
  if (H2O.Library.Maintenance && H2O.Library.Maintenance.version) return; // already booted

  const VERSION = '10.0.0';
  const OWNER_ID = 'library-maintenance';
  const GROUP_ID = 'library';
  const GROUP_LABEL = 'Library';

  const diag = {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 40,
    lastSnapshotAt: 0,
    lastSnapshotByteSize: 0,
    lastConfirmAt: 0,
    pendingConfirmId: '',
    pendingConfirmAt: 0,
  };
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

  /* ───────────── Helpers: storage gates + safe API access ───────────── */

  function getStore() {
    try { return H2O.Library?.Store || null; } catch { return null; }
  }
  function getStoreCaps() {
    try { return getStore()?.caps?.() || null; } catch { return null; }
  }
  function isBridgeAndDurable() {
    try {
      const Store = getStore();
      if (!Store) return false;
      const backend = String(Store.backend?.() || '');
      const durable = !!getStoreCaps()?.durable;
      return backend === 'bridge' && durable;
    } catch { return false; }
  }
  function safeCurrentChatId() {
    try {
      const m = String(W.location?.pathname || '').match(/\/c\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch { return null; }
  }
  function nowIso() { return new Date().toISOString(); }
  function envelopeMeta(commandId) {
    return {
      ok: false,
      command: String(commandId || ''),
      backend: String(getStore()?.backend?.() || 'unknown'),
      durable: !!getStoreCaps()?.durable,
      at: nowIso(),
      counts: {},
      warnings: [],
      nextActions: [],
    };
  }

  /* ───────────── Read-only inspectors ───────────── */

  async function inspectStore() {
    const env = envelopeMeta('inspect-store');
    try {
      const Store = getStore();
      if (!Store) {
        env.warnings.push('H2O.Library.Store not available');
        return { ...env, ok: false };
      }
      const caps = Store.caps?.() || null;
      const estimate = await (Store.estimate?.() || Promise.resolve(null));
      env.counts = {
        adapters: caps ? Object.keys(caps.adapters || {}).length : 0,
      };
      return {
        ...env,
        ok: true,
        caps,
        estimate,
        backendName: String(Store.backend?.() || ''),
        mirrorBackendName: String(Store.mirrorBackend?.() || ''),
      };
    } catch (e) {
      err('inspectStore', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  function inspectRegistry() {
    const env = envelopeMeta('inspect-registry');
    try {
      const lib = H2O.LibraryIndex;
      if (!lib?.readKnownChatRegistry) {
        env.warnings.push('H2O.LibraryIndex.readKnownChatRegistry unavailable');
        return env;
      }
      const reg = lib.readKnownChatRegistry();
      const rows = Array.isArray(reg?.rows) ? reg.rows : [];
      const dur = lib.getDurabilityStats ? (lib.getDurabilityStats() || null) : null;
      env.counts = {
        rows: rows.length,
        visibleInLastScan: dur?.visibleInLastScan || 0,
        vanished: dur?.vanished || 0,
        neverScanned: dur?.neverScanned || 0,
      };
      return {
        ...env,
        ok: true,
        registryVersion: reg?.version,
        storageKey: reg?.storageKey,
        migrationSource: reg?.migrationSource,
        updatedAtIso: reg?.updatedAtIso || '',
        durability: dur || null,
        sample: rows.slice(0, 3).map((r) => ({ chatId: r.chatId, title: r.title, sortAt: r.sortAt })),
      };
    } catch (e) {
      err('inspectRegistry', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  function inspectScanLedger() {
    const env = envelopeMeta('inspect-scan-ledger');
    try {
      const lib = H2O.LibraryIndex;
      const list = lib?.listScanBatches ? (lib.listScanBatches({ limit: 10 }) || []) : [];
      const last = lib?.getLastScanBatch ? lib.getLastScanBatch() : null;
      env.counts = { recent: list.length };
      return {
        ...env,
        ok: true,
        last,
        recent: list,
      };
    } catch (e) {
      err('inspectScanLedger', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  function inspectTagAutoPool() {
    const env = envelopeMeta('inspect-tag-auto-pool');
    try {
      const tags = H2O.Tags;
      const pool = tags?.getTagAutoPool ? tags.getTagAutoPool() : null;
      const tagDiag = tags?.getTagAutoPoolDiagnostics ? tags.getTagAutoPoolDiagnostics() : null;
      const phraseCount = pool?.phrases ? Object.keys(pool.phrases).length : 0;
      env.counts = { phrases: phraseCount };
      return {
        ...env,
        ok: true,
        phraseCount,
        diag: tagDiag,
        sample: pool?.phrases ? Object.entries(pool.phrases).slice(0, 5).map(([key, v]) => ({
          key,
          phrase: v?.phrase,
          chatCount: v?.chatCount,
          status: v?.status || 'candidate',
        })) : [],
      };
    } catch (e) {
      err('inspectTagAutoPool', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  async function inspectOccurrenceIndex(chatIdRaw) {
    const env = envelopeMeta('inspect-occurrence-index');
    try {
      const chatId = String(chatIdRaw || safeCurrentChatId() || '').trim();
      if (!chatId) {
        env.warnings.push('no chatId available; pass an explicit chatId or open a chat');
        return env;
      }
      const tags = H2O.Tags;
      if (!tags?.getOccurrenceIndex) {
        env.warnings.push('H2O.Tags.getOccurrenceIndex unavailable');
        return env;
      }
      const occ = await tags.getOccurrenceIndex(chatId);
      const phraseCount = occ?.phrases ? Object.keys(occ.phrases).length : 0;
      env.counts = { phrases: phraseCount, chatId: 1 };
      return {
        ...env,
        ok: true,
        chatId,
        phraseCount,
        builtFromTurnCacheVersion: occ?.builtFromTurnCacheVersion,
        updatedAt: occ?.updatedAt,
        sampleKeys: occ?.phrases ? Object.keys(occ.phrases).slice(0, 8) : [],
      };
    } catch (e) {
      err('inspectOccurrenceIndex', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  // The Categories module hydrates its in-memory caches via fire-and-forget
  // loaders at 0F4a boot. If a Maintenance inspector runs before those have
  // resolved (or if the in-memory cache was cleared mid-session), the cache
  // returns null/empty even though Store has real data. To stay authoritative,
  // these inspectors read-through Store DIRECTLY at the canonical key, then
  // also report what the in-memory cache holds, so the user can see whether a
  // 0-count is genuine ("Store says 0 too") or a hydration race ("Store has
  // data but cache is empty, refresh Categories module").
  const CAT_CANDIDATES_KEY = 'h2o:prm:cgx:library:cat-candidate-pool:v1';
  const CAT_OVERRIDES_KEY = 'h2o:prm:cgx:library:category-overrides:v1';

  async function inspectCategoryCandidates() {
    const env = envelopeMeta('inspect-category-candidates');
    try {
      const cats = H2O.Categories;
      const Store = getStore();
      // 1. Try the in-memory cache first (fast path).
      const cachePool = cats?.getCategoryCandidatePool ? cats.getCategoryCandidatePool() : null;
      // 2. Read-through Store regardless — authoritative source-of-truth.
      let storePool = null;
      let storeRead = 'skipped';
      if (Store?.get) {
        try {
          storePool = await Store.get(CAT_CANDIDATES_KEY);
          storeRead = (storePool && typeof storePool === 'object') ? 'hit' : 'empty';
        } catch (e) { err('inspectCategoryCandidates.store', e); storeRead = `error:${e?.message || 'unknown'}`; }
      }
      // 3. Pick the more populated source for the primary answer.
      const cacheCount = Array.isArray(cachePool?.candidates) ? cachePool.candidates.length : 0;
      const storeCount = Array.isArray(storePool?.candidates) ? storePool.candidates.length : 0;
      const pool = (storeCount > cacheCount) ? storePool : (cachePool || storePool || null);
      const total = Array.isArray(pool?.candidates) ? pool.candidates.length : 0;
      const candDiag = cats?.getCategoryCandidateDiagnostics ? cats.getCategoryCandidateDiagnostics() : null;
      env.counts = { total, cacheCount, storeCount };
      if (cacheCount === 0 && storeCount > 0) {
        env.warnings.push('cache-out-of-sync: Store has data but Categories in-memory cache is empty (boot hydration race or session clear). Call H2O.Categories.refreshCategoryCandidatePool() to repopulate the cache.');
      }
      return {
        ...env,
        ok: true,
        total,
        cacheCount,
        storeCount,
        storeRead,
        storeKey: CAT_CANDIDATES_KEY,
        algoVersion: pool?.algoVersion,
        updatedAtIso: pool?.updatedAtIso,
        diag: candDiag,
        topByScore: Array.isArray(pool?.candidates) ? pool.candidates.slice(0, 5).map((c) => ({
          name: c.name, score: c.score, status: c.status,
        })) : [],
      };
    } catch (e) {
      err('inspectCategoryCandidates', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  async function inspectCategoryOverrides() {
    const env = envelopeMeta('inspect-category-overrides');
    try {
      const cats = H2O.Categories;
      const Store = getStore();
      const cacheOverrides = cats?.getCategoryOverrides ? cats.getCategoryOverrides() : null;
      let storeOverrides = null;
      let storeRead = 'skipped';
      if (Store?.get) {
        try {
          storeOverrides = await Store.get(CAT_OVERRIDES_KEY);
          storeRead = (storeOverrides && typeof storeOverrides === 'object') ? 'hit' : 'empty';
        } catch (e) { err('inspectCategoryOverrides.store', e); storeRead = `error:${e?.message || 'unknown'}`; }
      }
      const cacheRows = cacheOverrides?.rows && typeof cacheOverrides.rows === 'object' ? cacheOverrides.rows : {};
      const storeRows = storeOverrides?.rows && typeof storeOverrides.rows === 'object' ? storeOverrides.rows : {};
      const cacheRowCount = Object.keys(cacheRows).length;
      const storeRowCount = Object.keys(storeRows).length;
      const rows = (storeRowCount > cacheRowCount) ? storeRows : (cacheRowCount ? cacheRows : storeRows);
      const totalRows = Object.keys(rows).length;
      const acDiag = cats?.getAutoClassDiagnostics ? cats.getAutoClassDiagnostics() : null;
      // Compute slot counts directly from whichever source is more populated, so we
      // don't depend on Categories' internal slotCounts (which is tied to its cache).
      const slotCounts = { autoSuggestion: 0, acceptedSuggestion: 0, userOverride: 0 };
      for (const r of Object.values(rows)) {
        if (r?.autoSuggestion?.primaryCategoryId)     slotCounts.autoSuggestion += 1;
        if (r?.acceptedSuggestion?.primaryCategoryId) slotCounts.acceptedSuggestion += 1;
        if (r?.userOverride?.primaryCategoryId)       slotCounts.userOverride += 1;
      }
      env.counts = { totalRows, cacheRowCount, storeRowCount, ...slotCounts };
      if (cacheRowCount === 0 && storeRowCount > 0) {
        env.warnings.push('cache-out-of-sync: Store has overrides rows but Categories in-memory cache is empty (boot hydration race). The data is safe in Store; call any Phase 9 API (e.g. getAutoClassDiagnostics) to trigger lazy load.');
      }
      return {
        ...env,
        ok: true,
        totalRows,
        cacheRowCount,
        storeRowCount,
        storeRead,
        storeKey: CAT_OVERRIDES_KEY,
        slotCounts,
        autoClassDiag: acDiag,
        sample: Object.entries(rows).slice(0, 3).map(([chatId, row]) => ({ chatId, slots: Object.keys(row || {}) })),
      };
    } catch (e) {
      err('inspectCategoryOverrides', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  /* ───────────── Snapshot export / import ───────────── */

  async function exportSnapshot() {
    const env = envelopeMeta('export-snapshot');
    try {
      const Store = getStore();
      const lib = H2O.LibraryIndex;
      const cats = H2O.Categories;
      const tags = H2O.Tags;

      const caps = Store?.caps?.() || null;

      const snapshot = {
        version: 1,
        algoVersion: VERSION,
        exportedAt: nowIso(),
        capability: caps,
        registry: lib?.readKnownChatRegistry ? lib.readKnownChatRegistry() : null,
        scanLedger: lib?.listScanBatches ? lib.listScanBatches({ limit: 200 }) : null,
        durabilityStats: lib?.getDurabilityStats ? lib.getDurabilityStats() : null,
        migrationStatus: lib?.getMigrationStatus ? lib.getMigrationStatus() : null,
        tagAutoPool: tags?.getTagAutoPool ? tags.getTagAutoPool() : null,
        tagAutoPoolDiag: tags?.getTagAutoPoolDiagnostics ? tags.getTagAutoPoolDiagnostics() : null,
        currentChatOccurrenceIndex: null,
        // Read these two from Store directly so the snapshot reflects Store truth even
        // when the Categories in-memory cache is empty due to a hydration race.
        categoryCandidatePool: null,         // filled below from Store, fallback to cache
        categoryCandidateDiag: cats?.getCategoryCandidateDiagnostics ? cats.getCategoryCandidateDiagnostics() : null,
        categoryOverrides: null,             // filled below from Store, fallback to cache
        autoClassPrefs: cats?.getAutoClassPrefs ? cats.getAutoClassPrefs() : null,
        autoClassDiag: cats?.getAutoClassDiagnostics ? cats.getAutoClassDiagnostics() : null,
      };

      // Try to also include the current chat's occurrence index if we're on a chat route.
      try {
        const id = safeCurrentChatId();
        if (id && tags?.getOccurrenceIndex) {
          snapshot.currentChatOccurrenceIndex = await tags.getOccurrenceIndex(id);
        }
      } catch (e) { err('exportSnapshot.currentChatOcc', e); }

      // Phase 10 fix: read Categories Store keys directly so snapshot is authoritative
      // even when the Categories in-memory cache is empty (boot hydration race).
      try {
        if (Store?.get) {
          const cp = await Store.get(CAT_CANDIDATES_KEY);
          if (cp && typeof cp === 'object') snapshot.categoryCandidatePool = cp;
          else if (cats?.getCategoryCandidatePool) snapshot.categoryCandidatePool = cats.getCategoryCandidatePool();
          const co = await Store.get(CAT_OVERRIDES_KEY);
          if (co && typeof co === 'object') snapshot.categoryOverrides = co;
          else if (cats?.getCategoryOverrides) snapshot.categoryOverrides = cats.getCategoryOverrides();
        } else {
          snapshot.categoryCandidatePool = cats?.getCategoryCandidatePool ? cats.getCategoryCandidatePool() : null;
          snapshot.categoryOverrides = cats?.getCategoryOverrides ? cats.getCategoryOverrides() : null;
        }
      } catch (e) { err('exportSnapshot.categoryStoreRead', e); }

      const json = JSON.stringify(snapshot);
      diag.lastSnapshotAt = Date.now();
      diag.lastSnapshotByteSize = json.length;
      env.counts = {
        registryRows: snapshot.registry?.rows?.length || 0,
        scanBatches: Array.isArray(snapshot.scanLedger) ? snapshot.scanLedger.length : 0,
        tagAutoPoolPhrases: snapshot.tagAutoPool?.phrases ? Object.keys(snapshot.tagAutoPool.phrases).length : 0,
        categoryCandidates: Array.isArray(snapshot.categoryCandidatePool?.candidates) ? snapshot.categoryCandidatePool.candidates.length : 0,
        categoryOverrideRows: snapshot.categoryOverrides?.rows ? Object.keys(snapshot.categoryOverrides.rows).length : 0,
        bytes: json.length,
      };
      return { ...env, ok: true, snapshot, json };
    } catch (e) {
      err('exportSnapshot', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  async function importSnapshot(blob, opts = {}) {
    const env = envelopeMeta('import-snapshot');
    try {
      const data = (typeof blob === 'string') ? JSON.parse(blob) : blob;
      if (!data || typeof data !== 'object') {
        env.warnings.push('invalid snapshot');
        return env;
      }
      const mode = String(opts.mode || 'replace');
      if (mode !== 'replace' && mode !== 'merge') {
        env.warnings.push('mode must be replace|merge');
        return env;
      }
      if (!isBridgeAndDurable()) {
        env.warnings.push('store-not-durable; refusing to import');
        return env;
      }
      const Store = getStore();
      const writes = [];

      // Each Library Phase key has a clear shape; we only write the keys we recognize so
      // a corrupt blob can't smuggle arbitrary data into Store.
      if (data.registry?.rows && Array.isArray(data.registry.rows)) {
        writes.push({ key: 'h2o:prm:cgx:library:registry:v2', value: data.registry });
      }
      if (Array.isArray(data.scanLedger)) {
        writes.push({ key: 'h2o:prm:cgx:library:scan-batches:v1', value: { batches: data.scanLedger, updatedAt: Date.now() } });
      }
      if (data.tagAutoPool && data.tagAutoPool.phrases) {
        writes.push({ key: 'h2o:prm:cgx:library:tag-auto-pool:v1', value: data.tagAutoPool });
      }
      if (data.categoryCandidatePool?.candidates) {
        writes.push({ key: 'h2o:prm:cgx:library:cat-candidate-pool:v1', value: data.categoryCandidatePool });
      }
      if (data.categoryOverrides?.rows) {
        writes.push({ key: 'h2o:prm:cgx:library:category-overrides:v1', value: data.categoryOverrides });
      }
      // Mode 'merge' is best-effort for now: we only honor it for the categoryOverrides
      // envelope which is naturally row-keyed; everything else gets a full replace because
      // Store keys for those are atomic single-blob payloads.
      if (mode === 'merge' && data.categoryOverrides?.rows) {
        try {
          const existing = await Store.get('h2o:prm:cgx:library:category-overrides:v1');
          if (existing?.rows && typeof existing.rows === 'object') {
            const merged = { ...existing, rows: { ...existing.rows, ...data.categoryOverrides.rows }, updatedAt: Date.now(), updatedAtIso: nowIso() };
            const idx = writes.findIndex((w) => w.key === 'h2o:prm:cgx:library:category-overrides:v1');
            writes[idx] = { key: writes[idx].key, value: merged };
          }
        } catch (e) { err('importSnapshot.merge', e); }
      }

      const results = [];
      for (const w of writes) {
        try { await Store.set(w.key, w.value); results.push({ key: w.key, ok: true }); }
        catch (e) { err(`importSnapshot.write:${w.key}`, e); results.push({ key: w.key, ok: false, error: String(e?.message || e) }); }
      }
      env.counts = { written: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
      return { ...env, ok: env.counts.failed === 0, mode, results };
    } catch (e) {
      err('importSnapshot', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  /* ───────────── Repair commands ─────────────
   *
   * Every repair command:
   *   1. Refuses to run if Store is not durable+bridge.
   *   2. Auto-runs exportSnapshot() first and stashes the result on
   *      diag.lastSnapshotPayload so the user has an undo path via importSnapshot.
   *   3. Emits a structured envelope with ok/command/counts/warnings/nextActions.
   *   4. Never deletes canonical data without a backup.
   *
   * The 2-step confirm gate is enforced by Command Bar onClick() handlers in
   * registerCommandBarControls() — direct callers are expected to pass
   * { confirm:true } as opts. Callers without that flag are informed how to retry.
   */

  let _lastSnapshotPayload = null;

  async function autoSnapshotForRepair(label = '') {
    try {
      const r = await exportSnapshot();
      if (r.ok) {
        _lastSnapshotPayload = r.snapshot;
        step('repair:auto-snapshot', `${label} ${r.counts?.bytes || 0}B`);
        return { ok: true, snapshot: r.snapshot, byteSize: r.counts?.bytes || 0 };
      }
      return { ok: false, warnings: r.warnings || ['snapshot-failed'] };
    } catch (e) { err(`autoSnapshotForRepair:${label}`, e); return { ok: false, warnings: [String(e?.message || e)] }; }
  }

  async function rebuildRegistryFromStore(opts = {}) {
    const env = envelopeMeta('rebuild-registry-from-store');
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable'); return env; }
    const snap = await autoSnapshotForRepair('rebuild-registry-from-store');
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const lib = H2O.LibraryIndex;
      if (!lib?.refresh) { env.warnings.push('LibraryIndex.refresh unavailable'); return env; }
      // Triggers a full refresh from extension/native sources, which writes a fresh
      // registry-v2 payload through Store. Existing user data (categories, tags) is
      // unaffected — we only re-populate the registry cache.
      const r = await lib.refresh('library-maintenance:rebuild', { force: true });
      env.counts = { knownAfter: r?.counts?.knownChats || 0 };
      return { ...env, ok: true, refresh: r, snapshotByteSize: snap.byteSize };
    } catch (e) { err('rebuildRegistryFromStore', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  async function repairScanLedger(opts = {}) {
    const env = envelopeMeta('repair-scan-ledger');
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable'); return env; }
    const snap = await autoSnapshotForRepair('repair-scan-ledger');
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const lib = H2O.LibraryIndex;
      if (!lib?.beginScanBatch || !lib?.commitScanBatch) {
        env.warnings.push('LibraryIndex.beginScanBatch/commitScanBatch unavailable');
        return env;
      }
      // A "repair" is a fresh scan committed cleanly — the ledger gains a known-good
      // entry and any inconsistent state is overwritten via the merge path.
      const begin = lib.beginScanBatch({ reason: 'maintenance-repair' });
      if (!begin?.batchId) { env.warnings.push('beginScanBatch returned no batchId'); return env; }
      const r = await lib.refresh('library-maintenance:repair-ledger', { force: true });
      const commit = lib.commitScanBatch(begin.batchId, { observedRows: r?.counts?.knownChats || 0, ok: true });
      env.counts = { observed: commit?.observedCount || 0 };
      return { ...env, ok: true, batchId: begin.batchId, commit, snapshotByteSize: snap.byteSize };
    } catch (e) { err('repairScanLedger', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  async function recomputeOccurrenceIndex(chatIdRaw, opts = {}) {
    const env = envelopeMeta('recompute-occurrence-index');
    const chatId = String(chatIdRaw || safeCurrentChatId() || '').trim();
    if (!chatId) { env.warnings.push('no-chat-id-and-not-on-chat-route'); return env; }
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable'); return env; }
    const snap = await autoSnapshotForRepair(`recompute-occ-index:${chatId}`);
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const tags = H2O.Tags;
      if (!tags?.refreshChatSummary && !tags?.analyzeChat) {
        env.warnings.push('H2O.Tags.refreshChatSummary/analyzeChat unavailable');
        return env;
      }
      // refreshChatSummary triggers aggregateChat which runs Phase 4 emitPhase4SideOutputs,
      // which is the canonical writer for the per-chat occurrence index. We do NOT touch
      // the Store key directly — feature owners stay the source of truth.
      const r = (tags.refreshChatSummary ? tags.refreshChatSummary(chatId, { force: true }) : tags.analyzeChat(chatId, { force: true }));
      env.counts = { chatId: 1 };
      return { ...env, ok: true, chatId, refresh: r, snapshotByteSize: snap.byteSize };
    } catch (e) { err('recomputeOccurrenceIndex', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  async function recomputeTagAutoPool(chatIdRaw, opts = {}) {
    const env = envelopeMeta('recompute-tag-auto-pool');
    const chatId = String(chatIdRaw || safeCurrentChatId() || '').trim();
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable'); return env; }
    const snap = await autoSnapshotForRepair(`recompute-tag-auto-pool:${chatId || 'all-current'}`);
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const tags = H2O.Tags;
      if (!tags?.refreshTagAutoPool) { env.warnings.push('H2O.Tags.refreshTagAutoPool unavailable'); return env; }
      const r = await tags.refreshTagAutoPool(chatId || undefined, { force: true });
      env.counts = { chatId: chatId ? 1 : 0, scope: chatId ? 'single-chat' : 'current-chat-only' };
      return { ...env, ok: true, chatId, refresh: r, snapshotByteSize: snap.byteSize };
    } catch (e) { err('recomputeTagAutoPool', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  async function purgeCategoryCandidatePool(opts = {}) {
    const env = envelopeMeta('purge-category-candidate-pool');
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable'); return env; }
    const snap = await autoSnapshotForRepair('purge-category-candidate-pool');
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const Store = getStore();
      // Soft-purge: we delete the cache pool key — the next refreshCategoryCandidatePool()
      // will rebuild from registry + auto-pool + catalog. Decision memory (created /
      // rejected / merged) lives in this same key, so the user is warned to use Reject
      // explicitly if they want to remember rejections; otherwise this is a clean reset.
      env.warnings.push('purge clears decision memory (rejected/merged/created flags) — use rejectCategoryCandidate first for any decisions you want to keep');
      await Store.del('h2o:prm:cgx:library:cat-candidate-pool:v1');
      env.counts = { deletedKeys: 1 };
      env.nextActions.push('call H2O.Categories.refreshCategoryCandidatePool({force:true}) to rebuild');
      return { ...env, ok: true, snapshotByteSize: snap.byteSize };
    } catch (e) { err('purgeCategoryCandidatePool', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  // The list of legacy localStorage keys we are willing to clean up. Conservative on
  // purpose: only Library tag-pool and tag-occ-index, and only when the durable
  // bridge backend has equivalent or newer data. The legacy known-registry key is
  // explicitly NOT here — it stays preserved as the migration source until a future
  // migration-cleanup phase.
  const LEGACY_RESIDUE_KEY_PATTERNS = [
    /^h2o:prm:cgx:library:tag-auto-pool:v1$/,
    /^h2o:prm:cgx:library:tag-occ-index:v1:/,
  ];
  // Keys we explicitly never delete here:
  const LEGACY_PRESERVE_KEYS = new Set([
    'h2o:prm:cgx:library-index:known-registry:v1',
  ]);

  async function cleanupLegacyLocalStorageResidue(opts = {}) {
    const env = envelopeMeta('cleanup-legacy-localstorage-residue');
    if (!opts.confirm) { env.warnings.push('confirm-required'); env.nextActions.push('pass {confirm:true} after reviewing snapshot'); return env; }
    if (!isBridgeAndDurable()) { env.warnings.push('store-not-durable; cleanup refused'); return env; }
    const snap = await autoSnapshotForRepair('cleanup-legacy-residue');
    if (!snap.ok) { env.warnings.push(...snap.warnings); env.warnings.push('snapshot-required-failed'); return env; }
    try {
      const candidates = [];
      try {
        for (let i = 0; i < W.localStorage.length; i++) {
          const k = W.localStorage.key(i);
          if (!k) continue;
          if (LEGACY_PRESERVE_KEYS.has(k)) continue;
          if (LEGACY_RESIDUE_KEY_PATTERNS.some((re) => re.test(k))) candidates.push(k);
        }
      } catch (e) { err('cleanup.scan', e); }

      // Verify Store has equivalent / newer data for each candidate key by checking the
      // corresponding Store key has a non-undefined value. This is a coarse check — the
      // Store keys we care about are tag-auto-pool:v1 and tag-occ-index:v1:<chatId>; both
      // share the same prefix on either side, so this is a 1:1 comparison.
      const Store = getStore();
      const deleted = [];
      const skipped = [];
      for (const k of candidates) {
        try {
          const storeValue = await Store.get(k);
          if (storeValue === undefined) { skipped.push({ key: k, reason: 'store-empty' }); continue; }
          W.localStorage.removeItem(k);
          deleted.push(k);
        } catch (e) { err(`cleanup.remove:${k}`, e); skipped.push({ key: k, reason: `error:${e?.message || 'unknown'}` }); }
      }
      env.counts = { found: candidates.length, deleted: deleted.length, skipped: skipped.length };
      return { ...env, ok: true, deleted, skipped, snapshotByteSize: snap.byteSize };
    } catch (e) { err('cleanupLegacyLocalStorageResidue', e); env.warnings.push(`exception:${e?.message || 'unknown'}`); return env; }
  }

  /* ───────────── Command Bar registration ───────────── */

  // Two-step confirm: first click stages a pending command + sets a 6-second TTL on
  // the Command Bar status row; second click within that window runs the command.
  const CONFIRM_TTL_MS = 6_000;

  function setCommandBarStatus(text, tone = 'info') {
    try {
      H2O.commandBar?.setStatus?.({
        owner: OWNER_ID,
        text: String(text || ''),
        tone,
        priority: 50,
        important: tone === 'warn',
      });
    } catch (e) { err('setStatus', e); }
  }

  function clearPendingConfirm() { diag.pendingConfirmId = ''; diag.pendingConfirmAt = 0; }

  function makeConfirmedRunner(controlId, label, action) {
    // Returns an onClick handler that requires two clicks within CONFIRM_TTL_MS.
    return async () => {
      const now = Date.now();
      if (diag.pendingConfirmId === controlId && (now - diag.pendingConfirmAt) < CONFIRM_TTL_MS) {
        clearPendingConfirm();
        setCommandBarStatus(`${label}: running…`, 'info');
        try {
          const res = await action();
          diag.lastConfirmAt = Date.now();
          if (res?.ok) {
            setCommandBarStatus(`${label}: ✓ ok`, 'good');
          } else {
            const reasons = (res?.warnings || []).join('; ') || 'unknown';
            setCommandBarStatus(`${label}: ✗ ${reasons}`, 'warn');
          }
          try { console.log(`[H2O.Library.Maintenance] ${label}`, res); } catch {}
          return res;
        } catch (e) {
          err(`run:${controlId}`, e);
          setCommandBarStatus(`${label}: ✗ exception`, 'warn');
          return null;
        }
      }
      diag.pendingConfirmId = controlId;
      diag.pendingConfirmAt = now;
      setCommandBarStatus(`Click ${label} again within 6s to confirm`, 'warn');
      setTimeout(() => {
        if (diag.pendingConfirmId === controlId && (Date.now() - diag.pendingConfirmAt) >= CONFIRM_TTL_MS) {
          clearPendingConfirm();
          setCommandBarStatus('', 'info');
        }
      }, CONFIRM_TTL_MS + 100);
      return { ok: false, status: 'awaiting-confirm', controlId };
    };
  }

  function makeReadOnlyRunner(controlId, label, action) {
    return async () => {
      try {
        setCommandBarStatus(`${label}: …`, 'info');
        const res = await action();
        const tone = res?.ok ? 'good' : (res?.warnings?.length ? 'warn' : 'info');
        const summary = res?.counts ? Object.entries(res.counts).map(([k, v]) => `${k}=${v}`).join(' ') : '';
        setCommandBarStatus(`${label}: ${summary || (res?.ok ? '✓' : '–')}`, tone);
        try { console.log(`[H2O.Library.Maintenance] ${label}`, res); } catch {}
        return res;
      } catch (e) {
        err(`run:${controlId}`, e);
        setCommandBarStatus(`${label}: ✗ exception`, 'warn');
        return null;
      }
    };
  }

  // Phase 11 polish: one-shot health check that combines every Library subsystem's
  // diagnostic into a single object. Uses Maintenance's read-through inspectors so
  // counts reflect Store truth even when Categories' in-memory cache is stale. Safe
  // to call repeatedly — non-destructive, no Store writes.
  async function getHealthCheck() {
    const store = (() => { try { return getStoreCaps(); } catch { return null; } })();
    const lib = H2O.LibraryIndex;
    const tags = H2O.Tags;
    const cats = H2O.Categories;
    const navTo = H2O.Library?.NavTo;
    let registry = null, durStats = null;
    try { durStats = lib?.getDurabilityStats?.() || null; } catch (_e) {}
    try {
      const reg = lib?.readKnownChatRegistry?.();
      if (reg) registry = { rows: Array.isArray(reg.rows) ? reg.rows.length : 0, version: reg.version, storageKey: reg.storageKey };
    } catch (_e) {}
    let candidatesInspect = null, overridesInspect = null;
    try { candidatesInspect = await inspectCategoryCandidates(); } catch (_e) {}
    try { overridesInspect = await inspectCategoryOverrides(); } catch (_e) {}
    let localStorageResidue = [];
    try {
      for (let i = 0; i < W.localStorage.length; i++) {
        const k = W.localStorage.key(i);
        if (k && /^h2o:prm:cgx:library:tag-/.test(k)) localStorageResidue.push(k);
      }
    } catch (_e) {}
    return {
      ok: true,
      command: 'health-check',
      backend: String(getStore()?.backend?.() || 'unknown'),
      durable: !!store?.durable,
      at: nowIso(),
      store: {
        primary: store?.primary || null,
        mirror: store?.mirror || null,
        durable: !!store?.durable,
        health: store?.health || null,
        runtime: store?.runtime || null,
      },
      registry,
      durabilityStats: durStats,
      tags: tags?.getTagAutoPoolDiagnostics?.() || null,
      categories: {
        candidates: candidatesInspect ? {
          total: candidatesInspect.total,
          cacheCount: candidatesInspect.cacheCount,
          storeCount: candidatesInspect.storeCount,
          warnings: candidatesInspect.warnings,
        } : null,
        candidateDiag: cats?.getCategoryCandidateDiagnostics?.() || null,
      },
      autoclass: {
        overrides: overridesInspect ? {
          totalRows: overridesInspect.totalRows,
          slotCounts: overridesInspect.slotCounts,
          warnings: overridesInspect.warnings,
        } : null,
        diag: cats?.getAutoClassDiagnostics?.() || null,
      },
      navTo: navTo?._state ? navTo._state() : null,
      maintenance: {
        service: !!H2O.LibraryCore?.getService?.('library-maintenance'),
        version: VERSION,
        commandBar: inspectCommandBarRegistration(),
      },
      localStorageResidue,
    };
  }

  // Diagnostic: confirm the Command Bar group + controls are actually registered.
  //
  // The previous implementation used `document.querySelector('button[id="lib.…"]')`
  // — which always returned 0 because Command Bar's patchButtonControl never writes
  // def.id to the DOM as btn.id (it only sets className/textContent/title/aria-label).
  // The controls were always correctly registered in state.controls; the inspector
  // was the bug.
  //
  // The fix: ask Command Bar for its authoritative state via the new API.hasControl /
  // API.listControls / API.hasGroup added in 0X1a. DOM presence is reported as a
  // secondary cross-check (groupHeaderPresent) but is no longer required for `ok`.
  function inspectCommandBarRegistration() {
    const env = envelopeMeta('inspect-cmdbar-registration');
    try {
      const cmd = H2O.commandBar;
      if (!cmd) {
        env.warnings.push('H2O.commandBar not on window');
        return env;
      }
      const expectedIds = [
        'lib.inspect-store', 'lib.inspect-registry', 'lib.inspect-scan-ledger',
        'lib.inspect-tag-auto-pool', 'lib.inspect-occurrence-index',
        'lib.inspect-category-candidates', 'lib.inspect-category-overrides',
        'lib.export-snapshot',
        'lib.rebuild-registry', 'lib.repair-scan-ledger', 'lib.recompute-occ-index',
        'lib.recompute-tag-auto-pool', 'lib.purge-cat-candidates', 'lib.cleanup-legacy-residue',
      ];

      // Authoritative: ask Command Bar for its registered control map.
      const hasApi = typeof cmd.hasControl === 'function';
      const found = hasApi ? expectedIds.filter((id) => !!cmd.hasControl(id)) : [];
      const missing = expectedIds.filter((id) => !found.includes(id));
      const apiList = (typeof cmd.listControls === 'function')
        ? cmd.listControls({ owner: OWNER_ID, groupId: GROUP_ID })
        : null;
      const groupRegistered = (typeof cmd.hasGroup === 'function') ? !!cmd.hasGroup(GROUP_ID) : null;

      // Secondary cross-check: DOM header (purely informational; not required for ok).
      const groupHeader = document.querySelector(`[data-group-id="${GROUP_ID}"]`) || null;
      const groupHeaderPresent = !!groupHeader;
      const groupHeaderText = groupHeader?.textContent || '';

      env.counts = { expected: expectedIds.length, found: found.length, missing: missing.length };

      if (!hasApi) {
        env.warnings.push('cmdbar-inspection-api-missing: Command Bar does not expose hasControl/listControls. Falling back to DOM-only check.');
      }
      if (groupRegistered === false) env.warnings.push('group-not-registered');
      if (missing.length) env.warnings.push(`controls-missing:${missing.length}`);

      // ok criterion: group is registered AND every expected control is registered in
      // state.controls. DOM header presence is reported but not required (the group
      // header tab only renders inside a specific scopeWindow / when controls are
      // visible, which can vary by Command Bar zone state).
      const apiOk = hasApi && (groupRegistered !== false) && missing.length === 0;
      // If the new API is unavailable for any reason, fall back to the previous DOM
      // check so older Command Bar builds don't break Maintenance verification.
      const domFallbackOk = !hasApi && groupHeaderPresent && groupHeaderText === GROUP_LABEL;

      return {
        ...env,
        ok: apiOk || domFallbackOk,
        groupId: GROUP_ID,
        groupLabel: GROUP_LABEL,
        groupRegistered,
        groupHeaderPresent,
        groupHeaderText,
        groupOwner: groupHeader?.getAttribute?.('data-group-owner') || '',
        foundControls: found,
        missingControls: missing,
        registeredCount: Array.isArray(apiList) ? apiList.length : null,
        registeredControls: Array.isArray(apiList) ? apiList.map((c) => ({ id: c.id, text: c.text })) : null,
      };
    } catch (e) {
      err('inspectCommandBarRegistration', e);
      env.warnings.push(`exception:${e?.message || 'unknown'}`);
      return env;
    }
  }

  function registerCommandBarControls() {
    const cmd = H2O.commandBar;
    if (!cmd?.registerGroup || !cmd?.registerControl) {
      step('cmdbar-not-ready');
      return false;
    }
    cmd.registerGroup({ id: GROUP_ID, owner: OWNER_ID, zone: 'main', order: 60, label: GROUP_LABEL });

    const ROButtons = [
      ['lib.inspect-store',                 'Inspect Store',           inspectStore],
      ['lib.inspect-registry',              'Inspect Registry',        () => Promise.resolve(inspectRegistry())],
      ['lib.inspect-scan-ledger',           'Inspect Scan Ledger',     () => Promise.resolve(inspectScanLedger())],
      ['lib.inspect-tag-auto-pool',         'Inspect Tag Auto-Pool',   () => Promise.resolve(inspectTagAutoPool())],
      ['lib.inspect-occurrence-index',      'Inspect Occurrence Idx',  () => inspectOccurrenceIndex()],
      ['lib.inspect-category-candidates',   'Inspect Cat Candidates',  () => inspectCategoryCandidates()],
      ['lib.inspect-category-overrides',    'Inspect Cat Overrides',   () => inspectCategoryOverrides()],
      ['lib.export-snapshot',               'Export Snapshot',         () => exportSnapshot()],
    ];
    let order = 100;
    for (const [id, label, action] of ROButtons) {
      cmd.registerControl({
        id, owner: OWNER_ID, groupId: GROUP_ID, type: 'button', order: order += 10,
        text: label, title: `${label} (read-only diagnostic)`,
        onClick: makeReadOnlyRunner(id, label, action),
      });
    }

    const RepairButtons = [
      ['lib.rebuild-registry',              'Rebuild Registry',        () => rebuildRegistryFromStore({ confirm: true })],
      ['lib.repair-scan-ledger',            'Repair Scan Ledger',      () => repairScanLedger({ confirm: true })],
      ['lib.recompute-occ-index',           'Recompute Occ (this chat)', () => recomputeOccurrenceIndex(null, { confirm: true })],
      ['lib.recompute-tag-auto-pool',       'Recompute Tag Pool (this chat)', () => recomputeTagAutoPool(null, { confirm: true })],
      ['lib.purge-cat-candidates',          'Purge Cat Candidates',    () => purgeCategoryCandidatePool({ confirm: true })],
      ['lib.cleanup-legacy-residue',        'Cleanup Legacy Residue',  () => cleanupLegacyLocalStorageResidue({ confirm: true })],
    ];
    for (const [id, label, action] of RepairButtons) {
      cmd.registerControl({
        id, owner: OWNER_ID, groupId: GROUP_ID, type: 'button', order: order += 10,
        text: label, title: `${label} — destructive; click twice within 6s to confirm`,
        className: 'cmdLibraryRepair',
        onClick: makeConfirmedRunner(id, label, action),
      });
    }
    step('cmdbar-registered', `${ROButtons.length}ro+${RepairButtons.length}repair`);
    return true;
  }

  /* ───────────── Public surface + boot ───────────── */

  const Maintenance = {
    version: VERSION,
    inspectStore,
    inspectRegistry,
    inspectScanLedger,
    inspectTagAutoPool,
    inspectOccurrenceIndex,
    inspectCategoryCandidates,
    inspectCategoryOverrides,
    exportSnapshot,
    importSnapshot,
    rebuildRegistryFromStore,
    repairScanLedger,
    recomputeOccurrenceIndex,
    recomputeTagAutoPool,
    purgeCategoryCandidatePool,
    cleanupLegacyLocalStorageResidue,
    registerCommandBarControls,
    inspectCommandBarRegistration,
    getHealthCheck,
    _diag: diag,
    _lastSnapshotPayload: () => _lastSnapshotPayload,
  };
  H2O.Library.Maintenance = Maintenance;

  // Optional registration with LibraryCore so other modules can find us via
  // core.getService('library-maintenance'). Best-effort — works regardless.
  try {
    const core = H2O.LibraryCore;
    core?.registerOwner?.(OWNER_ID, Maintenance, { replace: true });
    core?.registerService?.('library-maintenance', Maintenance, { replace: true });
  } catch (e) { err('register-with-core', e); }

  // Boot-time Command Bar registration. If commandBar is not yet mounted (it should
  // be — 0X1a is L0 and we are L4), retry on a short interval up to ~6s.
  function tryRegister(attempt = 0) {
    if (registerCommandBarControls()) return;
    if (attempt >= 12) { step('cmdbar-register-give-up'); return; }
    setTimeout(() => tryRegister(attempt + 1), 500);
  }
  tryRegister();
  step('boot', VERSION);
})();
