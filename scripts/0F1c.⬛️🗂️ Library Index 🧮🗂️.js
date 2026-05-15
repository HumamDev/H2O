// ==H2O Module==
// @h2o-id             0f1c.library_index
// @name               0F1c.⬛️🗂️ Library Index 🧮🗂️
// @namespace          H2O.Premium.CGX.library_index
// @author             HumamDev
// @version            1.1.1
// @revision           004
// @build              260509-000001
// @description        Library Index: read-only normalized known-chat index, persisted known-chat registry, safer native Recents/known-chat discovery, facets, date buckets, and analytics foundation for Library Workspace Explorer/Analytics.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  /*
   * 0F1c — Library Index (read-only data/index layer)
   *
   * OWNS:
   *   - A normalized, read-only "Known chats" index built from currently available sources.
   *   - Source merging / dedupe / lightweight cache for Library Workspace Explorer + Analytics.
   *   - Facets, date buckets, and stats over the normalized index.
   *   - Diagnostics and stable public APIs for consumers.
   *
   * MUST NOT OWN:
   *   - Folder truth / bindings                → 0F3a Folders
   *   - Native project cache / fetch            → 0F2a Projects
   *   - Category catalog / grouping             → 0F4a Categories
   *   - Turn tags / keyword extraction          → 0F5a Tags
   *   - Manual labels / label catalog/bindings  → 0F6a Labels
   *   - Archive / workbench canonical rows      → 0D archive/data modules
   *   - Library page/workspace UI               → 0F1b Library Workspace
   *   - LibraryCore shared services             → 0F1a Library Core
   *
   * IMPORTANT NAMING:
   *   - "Saved chats" = captured/imported/archive/workbench rows.
   *   - "Recent chats" = native ChatGPT Recents currently discoverable via sidebar DOM and/or
   *     native read-only cache data.
   *   - "Known chats" = merged saved + recent + metadata-only rows known to H2O. This is NOT
   *     guaranteed to be the full ChatGPT account history.
   *
   * DESIGN:
   *   - Read through public owner/service APIs first.
   *   - Never mutate foreign data stores.
   *   - Never move sidebar DOM.
   *   - Never require all 0F modules to be loaded; degrade gracefully.
   */

  const W = window;
  const D = document;
  const H2O = (W.H2O = W.H2O || {});

  const BOOT_LOCK = '__h2oLibraryIndexBooted_v1_0_0';
  const BOOT_TIMER_SET = '__h2oLibraryIndexBootTimers_v1_0_0';
  const BOOT_MAX_ATTEMPTS = 160;

  function bootWhenLibraryCoreReady(attempt = 0) {
    const core = H2O.LibraryCore;
    if (!core) {
      if (attempt >= BOOT_MAX_ATTEMPTS) {
        try {
          H2O.LibraryIndexBootDiag = { ok: false, status: 'library-core-not-found', attempts: attempt, ts: Date.now() };
        } catch {}
        return;
      }
      if (!H2O[BOOT_TIMER_SET]) H2O[BOOT_TIMER_SET] = new Set();
      const delay = Math.min(1400, 70 + attempt * 30);
      const timer = W.setTimeout(() => {
        try { H2O[BOOT_TIMER_SET]?.delete?.(timer); } catch {}
        bootWhenLibraryCoreReady(attempt + 1);
      }, delay);
      try { H2O[BOOT_TIMER_SET].add(timer); } catch {}
      return;
    }

    try { H2O.LibraryIndexBootDiag = { ok: true, status: 'library-core-ready', attempts: attempt, ts: Date.now() }; } catch {}
    runLibraryIndex(core);
  }

  function runLibraryIndex(coreAtBoot) {
    if (H2O[BOOT_LOCK]) return;
    H2O[BOOT_LOCK] = true;

    const MOD = (H2O.LibraryIndex = H2O.LibraryIndex || {});
    MOD.meta = MOD.meta || {
      owner: '0F1c.library_index',
      label: 'Library Index',
      phase: 'phase-1-index-foundation',
      suite: 'prm',
      host: 'cgx',
    };

    const diag = (MOD.diag = MOD.diag || {
      t0: performance.now(),
      steps: [],
      errors: [],
      events: [],
      bufMax: 220,
      errMax: 60,
      eventMax: 60,
    });

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

    const evt = (s, o = '') => {
      try {
        diag.events.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
        if (diag.events.length > diag.eventMax) diag.events.splice(0, diag.events.length - diag.eventMax);
      } catch {}
    };

    const TOK = 'LI';
    const PID = 'libraryIndex';
    const SkID = 'lidx';
    const SUITE = 'prm';
    const HOST = 'cgx';

    const NS_DISK = `h2o:${SUITE}:${HOST}:library-index`;
    const KEY_CACHE_V1 = `${NS_DISK}:cache:v1`;
    const KEY_KNOWN_REGISTRY_V1 = `${NS_DISK}:known-registry:v1`;
    const KEY_PREFS_V1 = `${NS_DISK}:prefs:v1`;
    const KNOWN_REGISTRY_ROW_LIMIT = 6000;

    // Phase 2: durable Library Store namespace (separate from this module's library-index
    // legacy namespace). Reads/writes go through H2O.Library.Store, not direct localStorage.
    // The v1 key above is preserved for migration-source reads and rollback safety.
    const NS_LIBRARY_STORE = `h2o:${SUITE}:${HOST}:library`;
    const KEY_REGISTRY_V2 = `${NS_LIBRARY_STORE}:registry:v2`;
    const REGISTRY_BATCH_HISTORY_LIMIT = 10;
    const REGISTRY_STORE_FLUSH_DEBOUNCE_MS = 120;

    // Phase 3: scan batch ledger. One ledger per profile, capped FIFO. The ledger is the
    // append-only log of each scan event (refresh) — its rows let the durability panel say
    // "X chats vanished since the last scan", and they're the source of truth for the
    // scanBatchId / visibleInLastScan / batchHistory fields stamped onto registry rows.
    const KEY_SCAN_LEDGER_V1 = `${NS_LIBRARY_STORE}:scan-batches:v1`;
    const SCAN_LEDGER_BATCH_LIMIT = 50;
    const SIDEBAR_RECENTS_SCAN_DEBOUNCE_MS = 180;
    const SIDEBAR_RECENTS_SCROLL_DEBOUNCE_MS = 220;

    const EV_UPDATED = 'evt:h2o:library-index:updated';
    const EV_REFRESH_REQUEST = 'evt:h2o:library-index:refresh-request';
    const EV_REGISTRY_MIGRATED = 'evt:h2o:library-index:registry-migrated';
    const EV_SCAN_BATCH_COMMITTED = 'evt:h2o:library-index:scan-batch-committed';

    const ATTR_CGXUI = 'data-cgxui';
    const ATTR_CGXUI_OWNER = 'data-cgxui-owner';

    const SEL = Object.freeze({
      nav: 'nav',
      aside: 'aside',
      header: 'h2.__menu-label, h2, [role="heading"]',
      expandoSectionA: 'div.group\\/sidebar-expando-section',
      expandoSectionB: 'div[class*="sidebar-expando-section"]',
      sidebarItemAnchor: 'a.__menu-item[href], a[href*="/c/"]',
      sidebarTruncate: '.truncate,[class*="truncate"]',
    });

    const SOURCE_RANK = Object.freeze({
      archive: 100,
      saved: 96,
      imported: 92,
      categories: 82,
      labels: 80,
      folders: 78,
      tags: 74,
      projects: 64,
      recents: 58,
      indexed: 54,
      'labels-binding': 50,
      unknown: 10,
    });

    const state = (MOD.state = MOD.state || {
      booted: false,
      model: null,
      refreshPromise: null,
      lastRefreshAt: 0,
      lastSourceStatus: null,
      lastNativeRecentsDiag: null,
      lastNativeProjectChatsDiag: null,
      lastKnownRegistryCount: 0,
      scheduledRefreshTimer: 0,
      listenersBound: false,
      sidebarRecentsObserver: null,
      sidebarRecentsObserverRoot: null,
      sidebarRecentsScrollRoot: null,
      sidebarRecentsScrollListener: null,
      sidebarRecentsScanTimer: 0,
      sidebarRecentsScrollTimer: 0,
      sidebarRecentsEnsureTimer: 0,
      sidebarRecentsLastSignature: '',
      sidebarRecentsLastScanAt: 0,
      sidebarRecentsLastScanReason: '',
      sidebarRecentsLastRegisterAt: 0,
      sidebarRecentsLastRegisterReason: '',
      sidebarRecentsLastRegisteredRows: 0,
      sidebarRecentsLastRegistryDelta: 0,
      sidebarRecentsScrollRootSelector: '',
      sidebarRecentsObserverRootSelector: '',
      sidebarRecentsLastScanDiag: null,
      sidebarProjectChatsScanTimer: 0,
      sidebarProjectChatsLastSignature: '',
      sidebarProjectChatsLastScanAt: 0,
      sidebarProjectChatsLastScanReason: '',
      sidebarProjectChatsLastRegisteredRows: 0,
      sidebarProjectChatsLastRegistryDelta: 0,
      clean: { timers: new Set(), listeners: new Set() },
    });
    state.clean = state.clean || { timers: new Set(), listeners: new Set() };

    // Phase 2: Library Store migration state. v2RegistryCache is null until migration
    // completes; while null, all reads/writes use the legacy v1 localStorage path. Once
    // populated, it becomes the source of truth and writes are flushed to Store async.
    state.libraryStoreMigration = state.libraryStoreMigration || {
      status: 'pending',          // 'pending' | 'aborted-no-durable' | 'store-v2' | 'legacy-v1' | 'migrated-v1-to-v2'
      source: 'unknown',          // human-readable subtype: 'store-v2' | 'store-v2-empty' | 'migrated-v1-to-v2'
      rowsLoaded: 0,
      startedAt: 0,
      finishedAt: 0,
      error: null,
      legacyV1UpdatedAt: 0,
      legacyV1UpdatedAtIso: '',
    };
    state.v2RegistryCache = state.v2RegistryCache || null;
    state.v2FlushTimer = state.v2FlushTimer || 0;
    state.v2MigrationPromise = state.v2MigrationPromise || null;

    // Phase 3: in-memory ledger mirror (newest-first list of batch records); flushed to Store
    // through the bridge after each commit. activeScanBatch holds the in-progress batch (if
    // any) — strictly one at a time; a second beginScanBatch implicitly aborts any stale one.
    state.scanLedgerCache = state.scanLedgerCache || null;
    state.ledgerFlushTimer = state.ledgerFlushTimer || 0;
    state.activeScanBatch = state.activeScanBatch || null;

    // Phase 2 (Chat Registry integration): tracks our soft coupling with H2O.ChatRegistry.
    // Library Index remains the discovery/index/build-model layer; the registry receives
    // mirrored rows as the canonical truth layer for forward consumers. This object holds
    // the diagnostic counters surfaced by getChatRegistrySyncStatus() — it is NOT used as
    // an authoritative cache and never gates the existing build/refresh path.
    state.chatRegistrySync = state.chatRegistrySync || {
      lastSeedAt: 0,
      lastSeedReason: '',
      lastSeedSourceRows: 0,
      lastSeedMappedRows: 0,
      lastSeedUpsertedRows: 0,
      lastSeedSkipped: 0,
      lastSeedDurationMs: 0,
      lastSeedError: null,
      lastRecentsMirrorAt: 0,
      lastRecentsMirrorRows: 0,
      lastRecentsMirrorError: null,
      lastRegistryEventAt: 0,
      lastRegistryEventSource: '',
      lastRegistryEventDebouncedRefreshAt: 0,
      registryAvailable: false,
    };
    state.chatRegistryRefreshTimer = state.chatRegistryRefreshTimer || 0;

    const storage = {
      getJSON(key, fallback = null) {
        try {
          const raw = W.localStorage?.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      setJSON(key, value) {
        try {
          W.localStorage?.setItem(key, JSON.stringify(value));
          return true;
        } catch (e) {
          err(`storage-set:${key}`, e);
          return false;
        }
      },
      del(key) {
        try { W.localStorage?.removeItem(key); return true; } catch { return false; }
      },
    };

    function debugSidebarRecents(event, payload = null) {
      try { console.debug('[H2O.LibraryIndex][sidebar-recents]', event, payload); } catch {}
    }

    function coreNow() {
      return H2O.LibraryCore || coreAtBoot || null;
    }

    function ownerOrService(name, fallback = null) {
      const core = coreNow();
      try {
        return core?.getService?.(name) || core?.getOwner?.(name) || fallback || null;
      } catch {
        return fallback || null;
      }
    }

    function archiveApi() { return H2O.archiveBoot || H2O.archive || null; }
    function foldersApi() { return ownerOrService('folders', H2O.folders || H2O.FS?.fldrs || null); }
    function projectsApi() { return ownerOrService('projects', H2O.Projects || null); }
    function categoriesApi() { return ownerOrService('categories', H2O.Categories || null); }
    function tagsApi() { return ownerOrService('tags', H2O.Tags || null); }
    function labelsApi() { return ownerOrService('labels', H2O.Labels || null); }

    /* \u2500\u2500\u2500 Phase 2B: shared pure module \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
     *
     * Pure row normalize / merge / dedupe / view derive / facet / count /
     * filter / sort / bucket helpers live in shared/library/library-index-core.js
     * (loaded into this surface by scripts/0F0d.). We delegate to it instead
     * of carrying our own copy of the logic so native and Studio compute
     * byte-identical merged rows + facets + counts for identical inputs.
     *
     * The local wrappers preserve the previous in-file names so callers
     * inside this file (and any external consumers reaching for the same
     * names) don't change. If the shared module is unavailable for any
     * reason, the wrappers fall back to safe defaults \u2014 boot still succeeds. */
    function ixCore() { return H2O.Library?.LibraryIndexCore || null; }

    function normText(raw = '') {
      const c = ixCore();
      return c ? c.normText(raw) : String(raw || '').trim();
    }
    function slug(raw = '') {
      const c = ixCore();
      return c ? c.slug(raw) : String(raw || '').toLowerCase().trim();
    }

    function uniqueStrings(rows) {
      const c = ixCore();
      return c ? c.uniqueStrings(rows) : (Array.isArray(rows) ? rows.slice() : []);
    }
    function normalizeChatId(raw = '') {
      const c = ixCore();
      return c ? c.normalizeChatId(raw) : String(raw || '').trim();
    }
    function parseChatIdFromHref(href = '') {
      const c = ixCore();
      return c ? c.parseChatIdFromHref(href) : '';
    }
    function hrefForChatId(chatIdRaw = '') {
      const c = ixCore();
      return c ? c.hrefForChatId(chatIdRaw) : '';
    }
    function dateMs(value) {
      const c = ixCore();
      return c ? c.dateMs(value) : 0;
    }
    function isoOrEmpty(value) {
      const c = ixCore();
      return c ? c.isoOrEmpty(value) : '';
    }
    function pickNewerDate(a, b) {
      const c = ixCore();
      return c ? c.pickNewerDate(a, b) : (a || b || '');
    }
    function toNonNegativeInt(value, fallback = 0) {
      const c = ixCore();
      return c ? c.toNonNegativeInt(value, fallback) : fallback;
    }
    function firstCount(src, keys = []) {
      const c = ixCore();
      return c ? c.firstCount(src, keys) : 0;
    }
    function deriveTurnCounts(src = {}) {
      const c = ixCore();
      return c ? c.deriveTurnCounts(src) : { turnCount: 0, answerCount: 0, userTurnCount: 0 };
    }
    function mergeBatchHistory(prev, next) {
      const c = ixCore();
      return c ? c.mergeBatchHistory(prev, next) : [];
    }
    function compareDateDesc(a, b, field = 'createdAt') {
      const c = ixCore();
      return c ? c.compareDateDesc(a, b, field) : 0;
    }
    function readDateField(row, field = 'createdAt') {
      const c = ixCore();
      return c ? c.readDateField(row, field) : '';
    }
    function sourceRank(source) {
      const c = ixCore();
      return c ? c.sourceRank(source) : 0;
    }
    function normalizeSource(source = '') {
      const c = ixCore();
      return c ? c.normalizeSource(source) : 'unknown';
    }
    function mergeSourceArrays(a = [], b = []) {
      const c = ixCore();
      return c ? c.mergeSourceArrays(a, b) : [];
    }
    function bestSource(sources = []) {
      const c = ixCore();
      return c ? c.bestSource(sources) : 'unknown';
    }
    function sourceHintsForRow(src = {}, explicitSource = '') {
      const c = ixCore();
      return c ? c.sourceHintsForRow(src, explicitSource) : [];
    }

    // Native row normalize + merge — delegated to shared core. The bodies
    // previously inlined here are now in shared/library/library-index-core.js
    // (loaded by 0F0d); both surfaces compute byte-identical rows for the
    // same inputs.
    function normalizeChatRow(row, source = '', extra = {}) {
      const c = ixCore();
      if (c) return c.normalizeChatRow(row, source, extra);
      // Defensive fallback — should never run because 0F0d loads before 0F1c.
      const src = row && typeof row === 'object' ? row : {};
      return { id: '', chatId: String(src.chatId || ''), title: String(src.title || ''), href: '', sources: [], source: 'unknown', isSaved: false, isRecent: false, isImported: false, isArchived: false, isPinned: false, createdAt: '', updatedAt: '', lastInteractionAt: '', turnCount: 0, answerCount: 0, userTurnCount: 0, savedAt: '', lastSeenAt: '', observedAt: '', sortAt: '', nativeOrder: null, nativeRecentsMode: '', nativeRecentsSource: '', folderIds: [], folderNames: [], labels: [], labelIds: [], labelNames: [], categories: [], categoryIds: [], categoryNames: [], projectId: '', projectName: '', tags: [], tagIds: [], tagNames: [], keywords: [], confidence: 'low', evidence: [], firstSeenAt: '', scanBatchId: '', visibleInLastScan: false, batchHistory: [] };
    }
    function mergeObjectsById(a = [], b = [], idKeys = ['id'], labelKeys = ['label', 'name', 'title']) {
      const c = ixCore();
      return c ? c.mergeObjectsById(a, b, idKeys, labelKeys) : [];
    }
    function mergeChatRecord(prevRaw, nextRaw) {
      const c = ixCore();
      if (c) return c.mergeChatRecord(prevRaw, nextRaw);
      return { ...(prevRaw || {}), ...(nextRaw || {}) };
    }
    function chooseBetterTitle(a = '', b = '', fallback = '') {
      const c = ixCore();
      return c ? c.chooseBetterTitle(a, b, fallback) : (String(a || '') || String(b || '') || String(fallback || ''));
    }

    function selectorHint(node) {
      if (!(node instanceof HTMLElement)) return '';
      const tag = String(node.tagName || '').toLowerCase();
      const dataTestId = normText(node.getAttribute?.('data-testid') || '');
      const id = normText(node.id || '');
      const cls = normText(typeof node.className === 'string' ? node.className : '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 3)
        .join('.');
      const out = [tag || 'node'];
      if (id) out.push(`#${id}`);
      if (dataTestId) out.push(`[data-testid="${dataTestId}"]`);
      if (cls) out.push(`.${cls}`);
      return out.join('');
    }

    function isScrollableNode(node) {
      try {
        if (!(node instanceof HTMLElement)) return false;
        const style = W.getComputedStyle?.(node);
        const overflowY = String(style?.overflowY || style?.overflow || '').toLowerCase();
        if (!/(auto|scroll|overlay)/.test(overflowY)) return false;
        return (Number(node.scrollHeight || 0) - Number(node.clientHeight || 0)) > 24;
      } catch {
        return false;
      }
    }

    function findSidebarScrollRoot(section) {
      let cur = section instanceof HTMLElement ? section : null;
      while (cur && cur !== D.body) {
        if (isScrollableNode(cur)) return cur;
        cur = cur.parentElement;
      }
      const sidebar = D.querySelector('[data-testid="sidebar"]');
      if (isScrollableNode(sidebar)) return sidebar;
      const aside = D.querySelector(SEL.aside);
      if (isScrollableNode(aside)) return aside;
      return section instanceof HTMLElement ? section : null;
    }

    function resolveSidebarRecentsRoots() {
      const section = findRecentsSection();
      const scrollRoot = findSidebarScrollRoot(section);
      const observerRoot = D.body || D.documentElement || null;
      return {
        section,
        scrollRoot: scrollRoot instanceof HTMLElement ? scrollRoot : null,
        observerRoot: observerRoot instanceof HTMLElement ? observerRoot : null,
        scrollRootSelector: selectorHint(scrollRoot),
        observerRootSelector: selectorHint(observerRoot),
        sectionSelector: selectorHint(section),
      };
    }

    function matchesSidebarRecentNode(node) {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest?.(`[${ATTR_CGXUI_OWNER}]`)) return false;
      if (node.matches?.(SEL.sidebarItemAnchor) && /\/c\//i.test(String(node.getAttribute?.('href') || ''))) return true;
      if (node.matches?.(SEL.header) && /^recents?\b/i.test(normText(node.textContent || ''))) return true;
      if (node.matches?.('button[aria-expanded], [data-testid="sidebar"], aside, nav')) return true;
      try {
        if (node.querySelector?.(`${SEL.sidebarItemAnchor}, ${SEL.header}, [data-testid="sidebar"]`)) return true;
      } catch {}
      return false;
    }

    function mutationTouchesSidebarRecents(muts = []) {
      return (Array.isArray(muts) ? muts : []).some((mu) => {
        if (matchesSidebarRecentNode(mu.target)) return true;
        const nodes = [
          ...(Array.isArray(mu.addedNodes) ? mu.addedNodes : Array.from(mu.addedNodes || [])),
          ...(Array.isArray(mu.removedNodes) ? mu.removedNodes : Array.from(mu.removedNodes || [])),
        ];
        return nodes.some((node) => matchesSidebarRecentNode(node));
      });
    }

    function matchesSidebarProjectNode(node, section = findProjectsSection()) {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest?.(`[${ATTR_CGXUI_OWNER}]`)) return false;
      if (section instanceof HTMLElement && section.contains(node)) return true;
      if (node.matches?.(SEL.header) && /^projects?\b/i.test(normText(node.textContent || ''))) return true;
      if (node.matches?.('a[href*="/g/"][href*="/project"]')) return true;
      try {
        if (node.querySelector?.('a[href*="/g/"][href*="/project"], a[href*="/c/"]')) {
          if (section instanceof HTMLElement && section.contains(node)) return true;
        }
      } catch {}
      return false;
    }

    function mutationTouchesSidebarProjects(muts = []) {
      const section = findProjectsSection();
      return (Array.isArray(muts) ? muts : []).some((mu) => {
        if (matchesSidebarProjectNode(mu.target, section)) return true;
        const nodes = [
          ...(Array.isArray(mu.addedNodes) ? mu.addedNodes : Array.from(mu.addedNodes || [])),
          ...(Array.isArray(mu.removedNodes) ? mu.removedNodes : Array.from(mu.removedNodes || [])),
        ];
        return nodes.some((node) => matchesSidebarProjectNode(node, section));
      });
    }

    function sidebarRecentsStatus() {
      const scan = state.sidebarRecentsLastScanDiag;
      return {
        lastSidebarScanAt: state.sidebarRecentsLastScanAt || 0,
        lastSidebarScanAtIso: state.sidebarRecentsLastScanAt ? new Date(state.sidebarRecentsLastScanAt).toISOString() : '',
        lastSidebarScanReason: state.sidebarRecentsLastScanReason || '',
        lastSidebarRegisterAt: state.sidebarRecentsLastRegisterAt || 0,
        lastSidebarRegisterAtIso: state.sidebarRecentsLastRegisterAt ? new Date(state.sidebarRecentsLastRegisterAt).toISOString() : '',
        lastSidebarRegisterReason: state.sidebarRecentsLastRegisterReason || '',
        lastSidebarRegisteredRows: Number(state.sidebarRecentsLastRegisteredRows || 0) || 0,
        lastSidebarRegistryDelta: Number(state.sidebarRecentsLastRegistryDelta || 0) || 0,
        sidebarObserverAttached: !!state.sidebarRecentsObserver,
        sidebarObserverRootSelector: state.sidebarRecentsObserverRootSelector || '',
        sidebarScrollAttached: !!state.sidebarRecentsScrollListener,
        sidebarScrollRootSelector: state.sidebarRecentsScrollRootSelector || '',
        sidebarAnchorCount: Number(scan?.nativeRecentsAnchorCount || 0) || 0,
        sidebarTitleCount: Number(scan?.nativeRecentsTitleCount || 0) || 0,
        sidebarSkippedRows: Number(scan?.nativeRecentsSkippedCount || 0) || 0,
        sidebarSkippedReasons: scan?.nativeRecentsSkippedReasons || {},
      };
    }

    function pickOlderDate(a, b) {
      const c = ixCore();
      return c ? c.pickOlderDate(a, b) : (a || b || '');
    }
    function higherConfidence(a = 'low', b = 'low') {
      const c = ixCore();
      return c ? c.higherConfidence(a, b) : a;
    }

    function buildEmptyModel(reason = 'empty') {
      return {
        ok: true,
        version: 1,
        builtAt: Date.now(),
        builtAtIso: new Date().toISOString(),
        durationMs: 0,
        reason,
        sourceStatus: sourceStatus(),
        counts: emptyCounts(),
        chats: [],
        knownChats: [],
        savedChats: [],
        recentChats: [],
        folders: [],
        labels: [],
        categories: [],
        projects: [],
        tags: [],
        facets: emptyFacets(),
      };
    }

    function emptyCounts() {
      return {
        knownChats: 0,
        savedChats: 0,
        recentChats: 0,
        nativeRecentChats: 0,
        importedChats: 0,
        folders: 0,
        labels: 0,
        categories: 0,
        projects: 0,
        tags: 0,
        undated: 0,
        unfiledSaved: 0,
        unlabeledSaved: 0,
        uncategorizedSaved: 0,
      };
    }

    function emptyFacets() {
      return { sources: [], folders: [], labels: [], categories: [], projects: [], tags: [], years: [], months: [] };
    }

    function emptySourceStatus(mode = 'best-effort') {
      return {
        core: false,
        archive: false,
        nativeRecents: false,
        folders: false,
        projects: false,
        categories: false,
        tags: false,
        labels: false,
        nativeRecentsSectionFound: false,
        nativeRecentsExpanded: false,
        nativeRecentsVisibleCount: 0,
        nativeRecentsLoadedCount: 0,
        nativeRecentsBestEffortCount: 0,
        nativeRecentsCacheCount: 0,
        nativeRecentsCacheKeys: 0,
        nativeRecentsDeclaredTotal: 0,
        nativeRecentsAnchorCount: 0,
        nativeRecentsTitleCount: 0,
        nativeRecentsSkippedCount: 0,
        nativeRecentsSkippedReasons: {},
        nativeProjectChatsSectionFound: false,
        nativeProjectChatsLoadedCount: 0,
        nativeProjectChatsAnchorCount: 0,
        nativeProjectChatsProjectAnchorCount: 0,
        nativeProjectChatsSkippedCount: 0,
        nativeProjectChatsSkippedReasons: {},
        lastSidebarProjectChatsScanAt: 0,
        lastSidebarProjectChatsScanAtIso: '',
        lastSidebarProjectChatsScanReason: '',
        lastSidebarProjectChatsRegisteredRows: 0,
        lastSidebarProjectChatsRegistryDelta: 0,
        nativeConversationHistoryCacheFound: false,
        knownRegistryAvailable: false,
        knownRegistryCount: 0,
        nativeRecentsCollectionMode: mode,
        completenessLevel: mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort',
        chatHistoryCompleteness: mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort',
        allChatHistoryAvailable: false,
        lastSidebarScanAt: 0,
        lastSidebarScanAtIso: '',
        lastSidebarScanReason: '',
        lastSidebarRegisterAt: 0,
        lastSidebarRegisterAtIso: '',
        lastSidebarRegisterReason: '',
        lastSidebarRegisteredRows: 0,
        lastSidebarRegistryDelta: 0,
        sidebarObserverAttached: false,
        sidebarObserverRootSelector: '',
        sidebarScrollAttached: false,
        sidebarScrollRootSelector: '',
        sidebarAnchorCount: 0,
        sidebarTitleCount: 0,
        sidebarSkippedRows: 0,
        sidebarSkippedReasons: {},
      };
    }

    function sourceStatus(nativeDiag = null, opts = {}) {
      const c = coreNow();
      const mode = String(opts.mode || nativeDiag?.nativeRecentsCollectionMode || 'best-effort').toLowerCase();
      const diagRow = nativeDiag && typeof nativeDiag === 'object' ? nativeDiag : inspectNativeRecents({ mode }).diagnostics;
      const projectDiag = opts.projectChatDiag && typeof opts.projectChatDiag === 'object' ? opts.projectChatDiag : (state.lastNativeProjectChatsDiag || {});
      const registry = readKnownChatRegistry();
      const out = {
        core: !!c,
        archive: typeof archiveApi()?.listWorkbenchRows === 'function',
        nativeRecents: !!(diagRow.nativeRecentsSectionFound || diagRow.nativeConversationHistoryCacheFound || diagRow.nativeRecentsBestEffortCount),
        folders: !!foldersApi(),
        projects: !!projectsApi() || !!(projectDiag.nativeProjectChatsSectionFound || projectDiag.nativeProjectChatsLoadedCount),
        categories: !!categoriesApi(),
        tags: !!tagsApi(),
        labels: !!labelsApi(),
        knownRegistryAvailable: !!registry?.rows?.length,
        knownRegistryCount: Array.isArray(registry?.rows) ? registry.rows.length : 0,
        lastSidebarProjectChatsScanAt: Number(state.sidebarProjectChatsLastScanAt || 0) || 0,
        lastSidebarProjectChatsScanAtIso: state.sidebarProjectChatsLastScanAt ? new Date(state.sidebarProjectChatsLastScanAt).toISOString() : '',
        lastSidebarProjectChatsScanReason: state.sidebarProjectChatsLastScanReason || '',
        lastSidebarProjectChatsRegisteredRows: Number(state.sidebarProjectChatsLastRegisteredRows || 0) || 0,
        lastSidebarProjectChatsRegistryDelta: Number(state.sidebarProjectChatsLastRegistryDelta || 0) || 0,
      };
      return { ...emptySourceStatus(mode), ...diagRow, ...projectDiag, ...sidebarRecentsStatus(), ...out };
    }

    async function buildModel(reason = 'refresh') {
      const startedAt = performance.now();
      const observedAt = new Date().toISOString();
      const model = buildEmptyModel(reason);
      const chatMap = new Map();

      const upsert = (raw, source = '', extra = {}) => {
        try {
          const row = normalizeChatRow(raw, source, { observedAt, ...extra });
          if (!row.id) return null;
          const key = row.chatId || row.href || row.id;
          const prev = chatMap.get(key) || null;
          const merged = prev ? mergeChatRecord(prev, row) : row;
          chatMap.set(key, merged);
          return merged;
        } catch (e) {
          err(`upsert:${source}`, e);
          return null;
        }
      };

      const sourceRows = await collectSources({ upsert, observedAt });

      const chats = Array.from(chatMap.values());
      enrichWithFolders(chats, sourceRows.folders);
      enrichWithCategories(chats, sourceRows.categoryGroups);
      enrichWithLabels(chats, sourceRows.labelsOwner, sourceRows.labels);
      enrichWithTags(chats, sourceRows.tagsOwner);
      enrichWithProjects(chats, sourceRows.projects);

      finalizeChats(chats);

      model.chats = chats.slice().sort((a, b) => compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || '')));
      model.knownChats = model.chats;
      model.savedChats = model.chats.filter((row) => row.isSaved).sort((a, b) => compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || '')));
      model.recentChats = model.chats.filter((row) => row.isRecent).sort((a, b) => {
        const ao = Number.isFinite(Number(a.nativeOrder)) ? Number(a.nativeOrder) : 999999;
        const bo = Number.isFinite(Number(b.nativeOrder)) ? Number(b.nativeOrder) : 999999;
        return ao - bo || compareDateDesc(a, b, 'sortAt') || String(a.title || '').localeCompare(String(b.title || ''));
      });
      model.folders = sourceRows.folders;
      model.labels = sourceRows.labels;
      model.categories = normalizeCategoryList(sourceRows.categoryGroups, model.chats);
      model.projects = sourceRows.projects;
      model.tags = collectTagFacets(model.chats);
      model.sourceStatus = sourceStatus(sourceRows.nativeRecentsDiag, { projectChatDiag: sourceRows.nativeProjectChatsDiag });
      model.counts = buildCounts(model);
      model.facets = buildFacets(model.chats, model);
      model.durationMs = Math.round(performance.now() - startedAt);
      state.lastNativeRecentsDiag = sourceRows.nativeRecentsDiag || null;
      state.lastNativeProjectChatsDiag = sourceRows.nativeProjectChatsDiag || null;
      state.lastSourceStatus = model.sourceStatus || null;
      return model;
    }

    async function collectSources(ctx) {
      const indexedRows = readKnownChatRegistryRows();
      indexedRows.forEach((row) => ctx.upsert(row, 'indexed'));

      const chatRegistryRows = safeListChatRegistryRows();
      chatRegistryRows.forEach((row) => ctx.upsert(row, 'indexed'));

      const archiveRows = safeListArchiveRows();
      archiveRows.forEach((row) => ctx.upsert(row, detectArchiveSource(row)));

      const nativeRecents = inspectNativeRecents({ mode: 'best-effort', observedAt: ctx.observedAt });
      const recentRows = nativeRecents.rows;
      recentRows.forEach((row) => ctx.upsert(row, 'recents'));

      const nativeProjectChats = collectNativeProjectChatDomRows(ctx.observedAt);
      const projectChatRows = nativeProjectChats.rows;
      projectChatRows.forEach((row) => ctx.upsert(row, 'projects'));

      const folders = safeListFolders();
      const projects = await safeListProjects();
      const labelsOwner = labelsApi();
      const labels = safeListLabels(labelsOwner);
      const tagsOwner = tagsApi();
      const categoryGroups = await safeLoadCategoryGroups(ctx.upsert);

      safeListLabelKnownChats(labelsOwner).forEach((row) => {
        const source = normalizeSource(row?.source || 'labels');
        ctx.upsert(row, source);
      });

      categoryGroups.forEach((group) => {
        (Array.isArray(group?.rows) ? group.rows : []).forEach((row) => ctx.upsert(row, 'categories'));
      });

      return {
        indexedRows,
        chatRegistryRows,
        archiveRows,
        recentRows,
        projectChatRows,
        nativeRecentsDiag: nativeRecents.diagnostics,
        nativeProjectChatsDiag: nativeProjectChats.diagnostics,
        folders,
        projects,
        labelsOwner,
        labels,
        tagsOwner,
        categoryGroups,
      };
    }

    function detectArchiveSource(row) {
      const raw = String(row?.source || row?.origin || row?.originSource || '').toLowerCase();
      if (/import/.test(raw) || /^imported[-_:]/i.test(String(row?.chatId || row?.id || ''))) return 'imported';
      return 'archive';
    }

    function safeListArchiveRows() {
      try {
        const rows = archiveApi()?.listWorkbenchRows?.();
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        err('archive:listWorkbenchRows', e);
        return [];
      }
    }

    function findNativeHeaderSection(matcher) {
      try {
        const roots = [D.querySelector(SEL.nav), D.querySelector(SEL.aside), D.body].filter(Boolean);
        for (const root of roots) {
          const labels = Array.from(root.querySelectorAll(SEL.header));
          const label = labels.find((el) => matcher.test(normText(el.textContent || '')));
          if (!label) continue;
          const button = label.closest('button') || label.parentElement;
          const section = button?.closest?.(SEL.expandoSectionA) || button?.closest?.(SEL.expandoSectionB) || label.closest?.(SEL.expandoSectionA) || label.closest?.(SEL.expandoSectionB);
          if (section instanceof HTMLElement) return section;
          const parent = button?.parentElement || label.parentElement;
          if (parent instanceof HTMLElement) return parent;
        }
      } catch (e) {
        err('find-native-header-section', e);
      }
      return null;
    }

    function findRecentsSection() {
      return findNativeHeaderSection(/^recents?\b/i);
    }

    function findProjectsSection() {
      return findNativeHeaderSection(/^projects?\b/i);
    }

    function parseProjectIdFromHref(href = '') {
      const match = String(href || '').match(/\/g\/([^/?#]+)\/project(?:[/?#]|$)/i);
      return match ? normText(match[1]) : '';
    }

    function mergeNativeProjectChatRows(prevRaw, nextRaw) {
      const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
      const next = nextRaw && typeof nextRaw === 'object' ? nextRaw : {};
      return {
        ...prev,
        ...next,
        chatId: prev.chatId || next.chatId || '',
        href: prev.href || next.href || '',
        title: chooseBetterTitle(prev.title, next.title, prev.chatId || next.chatId || prev.href || next.href || ''),
        source: 'projects',
        projectId: prev.projectId || next.projectId || '',
        projectName: chooseBetterTitle(prev.projectName, next.projectName, prev.projectId || next.projectId || ''),
        nativeProjectHref: prev.nativeProjectHref || next.nativeProjectHref || '',
        nativeOrder: Number.isFinite(Number(prev.nativeOrder)) ? Number(prev.nativeOrder) : (Number.isFinite(Number(next.nativeOrder)) ? Number(next.nativeOrder) : null),
        observedAt: prev.observedAt || next.observedAt || '',
        nativeProjectChatsSource: prev.nativeProjectChatsSource || next.nativeProjectChatsSource || '',
      };
    }

    function dedupeNativeProjectChatRows(rows = []) {
      const out = [];
      const indexByKey = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = normalizeChatId(row?.chatId || row?.id || row?.href || '') || normText(row?.href || row?.title || '');
        if (!key) return;
        const at = indexByKey.get(key);
        if (Number.isInteger(at)) {
          out[at] = mergeNativeProjectChatRows(out[at], row);
          return;
        }
        indexByKey.set(key, out.length);
        out.push(row);
      });
      return out;
    }

    function collectNativeProjectChatDomRows(observedAt = new Date().toISOString()) {
      const rows = [];
      const section = findProjectsSection();
      const skippedReasons = {};
      let anchorCount = 0;
      let projectAnchorCount = 0;
      let currentProject = null;
      const skip = (reason) => {
        const key = normText(reason || 'unknown') || 'unknown';
        skippedReasons[key] = Number(skippedReasons[key] || 0) + 1;
      };
      try {
        if (!(section instanceof HTMLElement)) {
          return {
            rows,
            diagnostics: {
              nativeProjectChatsSectionFound: false,
              nativeProjectChatsLoadedCount: 0,
              nativeProjectChatsAnchorCount: 0,
              nativeProjectChatsProjectAnchorCount: 0,
              nativeProjectChatsSkippedCount: 0,
              nativeProjectChatsSkippedReasons: {},
            },
          };
        }
        Array.from(section.querySelectorAll('a[href]')).forEach((a, index) => {
          if (!(a instanceof HTMLElement)) return;
          anchorCount += 1;
          if (a.closest(`[${ATTR_CGXUI_OWNER}]`)) {
            skip('h2o-owned');
            return;
          }
          const href = normText(a.getAttribute('href') || '');
          const projectId = parseProjectIdFromHref(href);
          if (projectId) {
            projectAnchorCount += 1;
            currentProject = {
              id: projectId,
              name: extractNativeRecentTitle(a, projectId),
              href,
            };
            return;
          }
          const chatId = parseChatIdFromHref(href);
          if (!chatId) {
            skip('missing-chat-id');
            return;
          }
          const title = extractNativeRecentTitle(a, chatId);
          if (!title) {
            skip('missing-title');
            return;
          }
          rows.push({
            chatId,
            href,
            title,
            source: 'projects',
            projectId: currentProject?.id || '',
            projectName: currentProject?.name || '',
            nativeProjectHref: currentProject?.href || '',
            nativeOrder: index,
            observedAt,
            nativeProjectChatsSource: 'sidebar-dom',
          });
        });
      } catch (e) {
        err('native-project-chats:dom', e);
      }
      const deduped = dedupeNativeProjectChatRows(rows);
      return {
        rows: deduped,
        diagnostics: {
          nativeProjectChatsSectionFound: !!section,
          nativeProjectChatsLoadedCount: deduped.length,
          nativeProjectChatsAnchorCount: anchorCount,
          nativeProjectChatsProjectAnchorCount: projectAnchorCount,
          nativeProjectChatsSkippedCount: Object.values(skippedReasons).reduce((sum, value) => sum + Number(value || 0), 0),
          nativeProjectChatsSkippedReasons: skippedReasons,
        },
      };
    }

    function normalizeNativeRecentsMode(mode = 'best-effort') {
      const value = String(mode || 'best-effort').trim().toLowerCase();
      if (value === 'visible' || value === 'loaded' || value === 'best-effort') return value;
      return 'best-effort';
    }

    function resolveNativeRecentOptions(arg = null, fallback = {}) {
      const base = {
        mode: 'best-effort',
        observedAt: new Date().toISOString(),
      };
      if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
        return {
          ...base,
          ...fallback,
          ...arg,
          mode: normalizeNativeRecentsMode(arg.mode || fallback.mode || base.mode),
          observedAt: isoOrEmpty(arg.observedAt || fallback.observedAt || base.observedAt) || base.observedAt,
        };
      }
      if (typeof arg === 'string') {
        const trimmed = arg.trim();
        if (trimmed === 'visible' || trimmed === 'loaded' || trimmed === 'best-effort') {
          return {
            ...base,
            ...fallback,
            mode: normalizeNativeRecentsMode(trimmed),
            observedAt: isoOrEmpty(fallback.observedAt || base.observedAt) || base.observedAt,
          };
        }
        return {
          ...base,
          ...fallback,
          mode: normalizeNativeRecentsMode(fallback.mode || base.mode),
          observedAt: isoOrEmpty(trimmed || fallback.observedAt || base.observedAt) || base.observedAt,
        };
      }
      return {
        ...base,
        ...fallback,
        mode: normalizeNativeRecentsMode(fallback.mode || base.mode),
        observedAt: isoOrEmpty(fallback.observedAt || base.observedAt) || base.observedAt,
      };
    }

    function isElementVisible(el) {
      try {
        if (!(el instanceof HTMLElement)) return false;
        const style = W.getComputedStyle?.(el);
        if (style?.display === 'none' || style?.visibility === 'hidden' || Number(style?.opacity || 1) <= 0) return false;
        if (el.closest?.('[hidden],[aria-hidden="true"]')) return false;
        const rect = el.getBoundingClientRect?.();
        if (!rect) return false;
        if (rect.width <= 0 || rect.height <= 0) return false;
        const vh = W.innerHeight || D.documentElement?.clientHeight || 0;
        return rect.bottom > 0 && (!vh || rect.top < vh);
      } catch (e) {
        err('native-recents:is-visible', e);
        return false;
      }
    }

    function readNativeRecentsToggle(section) {
      try {
        if (!(section instanceof HTMLElement)) return false;
        const toggle = section.querySelector('button[aria-expanded]') || null;
        if (toggle instanceof HTMLElement) return toggle.getAttribute('aria-expanded') !== 'false';
      } catch (e) {
        err('native-recents:toggle', e);
      }
      return null;
    }

    function mergeNativeRecentRows(prevRaw, nextRaw) {
      const prev = prevRaw && typeof prevRaw === 'object' ? prevRaw : {};
      const next = nextRaw && typeof nextRaw === 'object' ? nextRaw : {};
      return {
        ...prev,
        ...next,
        chatId: prev.chatId || next.chatId || '',
        href: prev.href || next.href || '',
        title: chooseBetterTitle(prev.title, next.title, prev.chatId || next.chatId || prev.href || next.href || ''),
        source: 'recents',
        createdAt: prev.createdAt || next.createdAt || prev.create_time || next.create_time || '',
        updatedAt: prev.updatedAt || next.updatedAt || prev.update_time || next.update_time || '',
        lastInteractionAt: pickNewerDate(prev.lastInteractionAt || prev.lastMessageAt || prev.updatedAt || prev.update_time, next.lastInteractionAt || next.lastMessageAt || next.updatedAt || next.update_time),
        nativeOrder: Number.isFinite(Number(prev.nativeOrder)) ? Number(prev.nativeOrder) : (Number.isFinite(Number(next.nativeOrder)) ? Number(next.nativeOrder) : null),
        observedAt: prev.observedAt || next.observedAt || '',
        nativeRecentsMode: prev.nativeRecentsMode || next.nativeRecentsMode || '',
        nativeRecentsSource: prev.nativeRecentsSource || next.nativeRecentsSource || '',
        projectId: prev.projectId || next.projectId || prev.nativeProjectId || next.nativeProjectId || prev.gizmoId || next.gizmoId || prev.gizmo_id || next.gizmo_id || '',
        projectName: prev.projectName || next.projectName || prev.nativeProjectName || next.nativeProjectName || prev.gizmoName || next.gizmoName || prev.gizmo_name || next.gizmo_name || '',
        gizmo_id: prev.gizmo_id || next.gizmo_id || prev.gizmoId || next.gizmoId || '',
      };
    }

    function dedupeNativeRecentRows(rows = []) {
      const out = [];
      const indexByKey = new Map();
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        const key = normalizeChatId(row?.chatId || row?.id || row?.href || '') || normText(row?.href || row?.title || '');
        if (!key) return;
        const at = indexByKey.get(key);
        if (Number.isInteger(at)) {
          out[at] = mergeNativeRecentRows(out[at], row);
          return;
        }
        indexByKey.set(key, out.length);
        out.push(row);
      });
      return out;
    }

    function extractNativeRecentTitle(anchor, chatId = '') {
      if (!(anchor instanceof HTMLElement)) return normText(chatId || '');
      const candidates = [
        anchor.querySelector?.(SEL.sidebarTruncate)?.textContent,
        anchor.getAttribute?.('aria-label'),
        anchor.getAttribute?.('title'),
        anchor.innerText,
        anchor.textContent,
        chatId,
      ];
      for (const raw of candidates) {
        const title = normText(raw || '').slice(0, 220);
        if (!title) continue;
        if (/^more$/i.test(title) || /^recents?$/i.test(title)) continue;
        return title;
      }
      return normText(chatId || '').slice(0, 220);
    }

    function collectNativeRecentDomRows(observedAt = new Date().toISOString()) {
      const rows = [];
      const section = findRecentsSection();
      const expanded = readNativeRecentsToggle(section);
      const skippedReasons = {};
      let anchorCount = 0;
      let titleCount = 0;
      const skip = (reason) => {
        const key = normText(reason || 'unknown') || 'unknown';
        skippedReasons[key] = Number(skippedReasons[key] || 0) + 1;
      };
      try {
        if (!(section instanceof HTMLElement)) {
          return {
            rows,
            visibleRows: rows,
            diagnostics: {
              nativeRecentsSectionFound: false,
              nativeRecentsExpanded: false,
              nativeRecentsVisibleCount: 0,
              nativeRecentsLoadedCount: 0,
              nativeRecentsAnchorCount: 0,
              nativeRecentsTitleCount: 0,
              nativeRecentsSkippedCount: 0,
              nativeRecentsSkippedReasons: {},
            },
          };
        }
        Array.from(section.querySelectorAll(SEL.sidebarItemAnchor)).forEach((a, index) => {
          if (!(a instanceof HTMLElement)) return;
          anchorCount += 1;
          if (a.closest(`[${ATTR_CGXUI_OWNER}]`)) {
            skip('h2o-owned');
            return;
          }
          const href = normText(a.getAttribute('href') || '');
          const chatId = parseChatIdFromHref(href);
          if (!chatId) {
            skip('missing-chat-id');
            return;
          }
          const title = extractNativeRecentTitle(a, chatId);
          if (!title) {
            skip('missing-title');
            return;
          }
          titleCount += 1;
          rows.push({
            chatId,
            href,
            title,
            source: 'recents',
            nativeOrder: index,
            observedAt,
            nativeRecentsMode: 'loaded',
            nativeRecentsSource: 'sidebar-dom',
            __visible: isElementVisible(a),
          });
        });
      } catch (e) {
        err('native-recents:dom', e);
      }
      const deduped = dedupeNativeRecentRows(rows);
      const visibleRows = deduped.filter((row) => row.__visible === true).map((row) => ({ ...row, nativeRecentsMode: 'visible' }));
      return {
        rows: deduped,
        visibleRows,
        diagnostics: {
          nativeRecentsSectionFound: !!section,
          nativeRecentsExpanded: expanded == null ? !!deduped.length : !!expanded,
          nativeRecentsVisibleCount: visibleRows.length,
          nativeRecentsLoadedCount: deduped.length,
          nativeRecentsAnchorCount: anchorCount,
          nativeRecentsTitleCount: titleCount,
          nativeRecentsSkippedCount: Object.values(skippedReasons).reduce((sum, value) => sum + Number(value || 0), 0),
          nativeRecentsSkippedReasons: skippedReasons,
        },
      };
    }

    function listConversationHistoryCacheKeys() {
      const out = [];
      try {
        const box = W.localStorage;
        const len = Number(box?.length || 0);
        for (let i = 0; i < len; i += 1) {
          const key = String(box.key(i) || '');
          if (!key || !/\/conversation-history$/i.test(key)) continue;
          out.push(key);
        }
      } catch (e) {
        err('native-recents:cache-keys', e);
      }
      return out;
    }

    function collectNativeConversationHistoryCacheRows(observedAt = new Date().toISOString()) {
      const out = [];
      let declaredTotal = 0;
      const keys = listConversationHistoryCacheKeys();
      try {
        keys.forEach((key) => {
          const raw = W.localStorage?.getItem?.(key);
          if (!raw) return;
          let parsed = null;
          try { parsed = JSON.parse(raw); } catch { parsed = null; }
          const pages = Array.isArray(parsed?.value?.pages) ? parsed.value.pages : [];
          let globalIndex = 0;
          pages.forEach((page, pageIndex) => {
            const items = Array.isArray(page?.items) ? page.items : [];
            declaredTotal = Math.max(declaredTotal, Number(page?.total || 0) || 0);
            items.forEach((item, itemIndex) => {
              const chatId = normalizeChatId(item?.id || item?.conversationId || '');
              if (!chatId) return;
              const title = normText(item?.title || item?.snippet || chatId).slice(0, 220);
              if (!title) return;
              out.push({
                chatId,
                href: hrefForChatId(chatId),
                title,
                source: 'recents',
                create_time: item?.create_time || '',
                update_time: item?.update_time || '',
                lastInteractionAt: item?.update_time || '',
                pinned_time: item?.pinned_time || '',
                gizmo_id: item?.gizmo_id || '',
                is_archived: item?.is_archived === true,
                nativeOrder: globalIndex,
                observedAt,
                nativeRecentsMode: 'best-effort',
                nativeRecentsSource: 'conversation-history-cache',
                nativePageIndex: pageIndex,
                nativeItemIndex: itemIndex,
              });
              globalIndex += 1;
            });
          });
        });
      } catch (e) {
        err('native-recents:cache-rows', e);
      }
      return {
        rows: dedupeNativeRecentRows(out),
        diagnostics: {
          nativeConversationHistoryCacheFound: keys.length > 0,
          nativeRecentsCacheKeys: keys.length,
          nativeRecentsCacheCount: dedupeNativeRecentRows(out).length,
          nativeRecentsDeclaredTotal: declaredTotal,
        },
      };
    }

    function stripNativeRecentPrivateFields(rows = []) {
      return (Array.isArray(rows) ? rows : []).map((row) => {
        const next = { ...(row && typeof row === 'object' ? row : {}) };
        delete next.__visible;
        return next;
      });
    }

    function inspectNativeRecents(options = {}) {
      const opts = resolveNativeRecentOptions(options);
      const dom = collectNativeRecentDomRows(opts.observedAt);
      const cache = collectNativeConversationHistoryCacheRows(opts.observedAt);
      const bestEffortRows = dedupeNativeRecentRows([
        ...dom.rows.map((row) => ({ ...row, nativeRecentsMode: 'best-effort' })),
        ...cache.rows,
      ]);
      const mode = normalizeNativeRecentsMode(opts.mode);
      const rows = mode === 'visible'
        ? dom.visibleRows
        : mode === 'loaded'
          ? dom.rows
          : bestEffortRows;
      const completenessLevel = mode === 'visible' ? 'visible-only' : mode === 'loaded' ? 'loaded-dom' : 'best-effort';
      const diagnostics = {
        ...emptySourceStatus(mode),
        ...dom.diagnostics,
        ...cache.diagnostics,
        nativeRecents: !!(dom.rows.length || cache.rows.length || dom.diagnostics.nativeRecentsSectionFound),
        nativeRecentsBestEffortCount: bestEffortRows.length,
        nativeRecentsCollectionMode: mode,
        completenessLevel,
        chatHistoryCompleteness: completenessLevel,
        allChatHistoryAvailable: false,
      };
      state.lastNativeRecentsDiag = diagnostics;
      return { rows: stripNativeRecentPrivateFields(rows), diagnostics };
    }

    function signatureForRows(rows = []) {
      return (Array.isArray(rows) ? rows : [])
        .map((row) => `${normalizeChatId(row?.chatId || row?.href || row?.id || '')}|${normText(row?.title || '')}`)
        .filter(Boolean)
        .join('\n');
    }

    function signatureForProjectRows(rows = []) {
      return (Array.isArray(rows) ? rows : [])
        .map((row) => [
          normalizeChatId(row?.chatId || row?.href || row?.id || ''),
          normText(row?.title || ''),
          normText(row?.projectId || ''),
          normText(row?.projectName || ''),
        ].join('|'))
        .filter(Boolean)
        .join('\n');
    }

    async function scanSidebarProjectChatsNow(reason = 'sidebar-projects', opts = {}) {
      const scanReason = normText(reason || 'sidebar-projects') || 'sidebar-projects';
      const observedAt = new Date().toISOString();
      const inspection = collectNativeProjectChatDomRows(observedAt);
      const rows = inspection.rows || [];
      const diagnostics = inspection.diagnostics || {};
      state.lastNativeProjectChatsDiag = diagnostics;
      state.sidebarProjectChatsLastScanAt = Date.now();
      state.sidebarProjectChatsLastScanReason = scanReason;
      const signature = signatureForProjectRows(rows);
      const changed = signature !== state.sidebarProjectChatsLastSignature;
      if (rows.length && (changed || opts.force === true)) {
        const registryDelta = registerKnownChats(rows, { reason: `sidebar-projects:${scanReason}`, refresh: false });
        state.sidebarProjectChatsLastRegisteredRows = rows.length;
        state.sidebarProjectChatsLastRegistryDelta = registryDelta;
        state.sidebarProjectChatsLastSignature = signature;
        await flushKnownChatRegistryNow(`sidebar-projects:${scanReason}`);
        scheduleRefresh(`sidebar-projects:${scanReason}`);
      } else if (changed) {
        state.sidebarProjectChatsLastSignature = signature;
      }
      return { rows, diagnostics, changed };
    }

    function scheduleSidebarProjectChatsScan(reason = 'sidebar-projects', delay = SIDEBAR_RECENTS_SCAN_DEBOUNCE_MS, opts = {}) {
      if (state.sidebarProjectChatsScanTimer) {
        try { W.clearTimeout(state.sidebarProjectChatsScanTimer); } catch {}
        state.clean.timers.delete(state.sidebarProjectChatsScanTimer);
      }
      state.sidebarProjectChatsScanTimer = W.setTimeout(() => {
        const timer = state.sidebarProjectChatsScanTimer;
        state.sidebarProjectChatsScanTimer = 0;
        state.clean.timers.delete(timer);
        Promise.resolve(scanSidebarProjectChatsNow(reason, opts)).catch((e) => err(`sidebar-projects:scan:${reason}`, e));
      }, Math.max(0, Number(delay || 0)));
      state.clean.timers.add(state.sidebarProjectChatsScanTimer);
    }

    async function scanSidebarRecentsNow(reason = 'sidebar-recents', opts = {}) {
      const scanReason = normText(reason || 'sidebar-recents') || 'sidebar-recents';
      const observedAt = new Date().toISOString();
      const inspection = inspectNativeRecents({ mode: 'loaded', observedAt });
      const rows = Array.isArray(inspection?.rows) ? inspection.rows : [];
      const diagnostics = inspection?.diagnostics && typeof inspection.diagnostics === 'object'
        ? { ...inspection.diagnostics }
        : {};
      const roots = resolveSidebarRecentsRoots();
      diagnostics.sidebarObserverRootSelector = roots.observerRootSelector || '';
      diagnostics.sidebarScrollRootSelector = roots.scrollRootSelector || '';
      diagnostics.sidebarSectionSelector = roots.sectionSelector || '';
      diagnostics.sidebarObserverAttached = !!state.sidebarRecentsObserver;
      diagnostics.sidebarScrollAttached = !!state.sidebarRecentsScrollListener;
      diagnostics.sidebarScanReason = scanReason;
      diagnostics.sidebarRowsSeen = rows.length;
      state.sidebarRecentsLastScanDiag = diagnostics;
      state.sidebarRecentsLastScanAt = Date.now();
      state.sidebarRecentsLastScanReason = scanReason;
      const signature = signatureForRows(rows);
      const changed = signature !== state.sidebarRecentsLastSignature;
      let registryDelta = 0;
      if (changed || opts.force === true) {
        const beforeCount = Array.isArray(readKnownChatRegistry()?.rows) ? readKnownChatRegistry().rows.length : 0;
        registerKnownChats(rows, { reason: `sidebar-recents:${scanReason}`, refresh: false });
        const afterCount = Array.isArray(readKnownChatRegistry()?.rows) ? readKnownChatRegistry().rows.length : beforeCount;
        registryDelta = Math.max(0, afterCount - beforeCount);
        state.sidebarRecentsLastRegisterAt = Date.now();
        state.sidebarRecentsLastRegisterReason = scanReason;
        state.sidebarRecentsLastRegisteredRows = rows.length;
        state.sidebarRecentsLastRegistryDelta = registryDelta;
        state.sidebarRecentsLastSignature = signature;
        debugSidebarRecents('scan', {
          reason: scanReason,
          anchors: diagnostics.nativeRecentsAnchorCount || 0,
          titles: diagnostics.nativeRecentsTitleCount || 0,
          loadedRows: rows.length,
          registryDelta,
          skipped: diagnostics.nativeRecentsSkippedReasons || {},
          scrollRoot: roots.scrollRootSelector || '',
          observerRoot: roots.observerRootSelector || '',
        });
        await flushKnownChatRegistryNow(`sidebar-recents:${scanReason}`);
        // Phase 2C — mirror the same rows into H2O.ChatRegistry as passive sightings.
        // Soft no-op if the registry isn't loaded; never raises through to the caller.
        try { mirrorSidebarRecentsToChatRegistry(rows, observedAt); }
        catch (e) { err('chat-registry:mirror-recents', e); }
        scheduleRefresh(`sidebar-recents:${scanReason}`);
      }
      return { ok: true, changed, registryDelta, rows, diagnostics };
    }

    function scheduleSidebarRecentsScan(reason = 'sidebar-recents', delay = SIDEBAR_RECENTS_SCAN_DEBOUNCE_MS, opts = {}) {
      const ms = Math.max(0, Number(delay || 0));
      if (state.sidebarRecentsScanTimer) {
        try { W.clearTimeout(state.sidebarRecentsScanTimer); } catch {}
        state.clean.timers.delete(state.sidebarRecentsScanTimer);
      }
      state.sidebarRecentsScanTimer = W.setTimeout(() => {
        const timer = state.sidebarRecentsScanTimer;
        state.sidebarRecentsScanTimer = 0;
        state.clean.timers.delete(timer);
        ensureSidebarRecentsMonitor('scan');
        try {
          Promise.resolve(scanSidebarRecentsNow(reason, opts)).catch((e) => err(`sidebar-recents:scan:${reason}`, e));
        } catch (e) {
          err(`sidebar-recents:scan:${reason}`, e);
        }
      }, ms);
      state.clean.timers.add(state.sidebarRecentsScanTimer);
      return true;
    }

    function attachSidebarRecentsScroll(root) {
      if (!(root instanceof HTMLElement)) return false;
      if (state.sidebarRecentsScrollRoot === root && state.sidebarRecentsScrollListener) return true;
      if (state.sidebarRecentsScrollRoot && state.sidebarRecentsScrollListener) {
        try { state.sidebarRecentsScrollRoot.removeEventListener('scroll', state.sidebarRecentsScrollListener, true); } catch {}
      }
      const onScroll = () => {
        if (state.sidebarRecentsScrollTimer) {
          try { W.clearTimeout(state.sidebarRecentsScrollTimer); } catch {}
          state.clean.timers.delete(state.sidebarRecentsScrollTimer);
        }
        state.sidebarRecentsScrollTimer = W.setTimeout(() => {
          const timer = state.sidebarRecentsScrollTimer;
          state.sidebarRecentsScrollTimer = 0;
          state.clean.timers.delete(timer);
          scheduleSidebarRecentsScan('scroll', 0);
          scheduleSidebarProjectChatsScan('scroll', 0);
        }, SIDEBAR_RECENTS_SCROLL_DEBOUNCE_MS);
        state.clean.timers.add(state.sidebarRecentsScrollTimer);
      };
      try {
        root.addEventListener('scroll', onScroll, { passive: true, capture: true });
        state.sidebarRecentsScrollRoot = root;
        state.sidebarRecentsScrollListener = onScroll;
        state.sidebarRecentsScrollRootSelector = selectorHint(root);
        debugSidebarRecents('scroll-attached', { root: state.sidebarRecentsScrollRootSelector });
        return true;
      } catch (e) {
        err('sidebar-recents:scroll-attach', e);
        return false;
      }
    }

    function ensureSidebarRecentsMonitor(reason = 'ensure') {
      const roots = resolveSidebarRecentsRoots();
      const observerRoot = roots.observerRoot;
      if (observerRoot instanceof HTMLElement && state.sidebarRecentsObserverRoot !== observerRoot) {
        try { state.sidebarRecentsObserver?.disconnect?.(); } catch {}
        state.sidebarRecentsObserverRoot = observerRoot;
        state.sidebarRecentsObserverRootSelector = roots.observerRootSelector || '';
        if (typeof MutationObserver === 'function') {
          const mo = new MutationObserver((muts) => {
          const touchesRecents = mutationTouchesSidebarRecents(muts);
          const touchesProjects = mutationTouchesSidebarProjects(muts);
          if (!touchesRecents && !touchesProjects) return;
          if (touchesRecents) scheduleSidebarRecentsScan('mutation');
          if (touchesProjects) scheduleSidebarProjectChatsScan('mutation');
          const nextRoots = resolveSidebarRecentsRoots();
          if (nextRoots.scrollRoot instanceof HTMLElement) attachSidebarRecentsScroll(nextRoots.scrollRoot);
        });
          try {
            mo.observe(observerRoot, {
              childList: true,
              subtree: true,
              characterData: true,
              attributes: true,
              attributeFilter: ['href', 'aria-expanded', 'title', 'data-testid', 'hidden', 'class'],
            });
            state.sidebarRecentsObserver = mo;
            debugSidebarRecents('observer-attached', { root: state.sidebarRecentsObserverRootSelector, reason });
          } catch (e) {
            err('sidebar-recents:observer-attach', e);
          }
        }
      }
      if (roots.scrollRoot instanceof HTMLElement) attachSidebarRecentsScroll(roots.scrollRoot);
      state.sidebarRecentsScrollRootSelector = roots.scrollRootSelector || state.sidebarRecentsScrollRootSelector || '';
      return roots;
    }

    function scheduleEnsureSidebarRecentsMonitor(reason = 'ensure') {
      if (state.sidebarRecentsEnsureTimer) {
        try { W.clearTimeout(state.sidebarRecentsEnsureTimer); } catch {}
        state.clean.timers.delete(state.sidebarRecentsEnsureTimer);
      }
      state.sidebarRecentsEnsureTimer = W.setTimeout(() => {
        const timer = state.sidebarRecentsEnsureTimer;
        state.sidebarRecentsEnsureTimer = 0;
        state.clean.timers.delete(timer);
        ensureSidebarRecentsMonitor(reason);
      }, 120);
      state.clean.timers.add(state.sidebarRecentsEnsureTimer);
      return true;
    }

    function listNativeRecentChats(options = null) {
      try {
        const rows = inspectNativeRecents(options).rows;
        if (options && typeof options === 'object' && options.persist === true) {
          mergeKnownChatRegistryRows(rows, { reason: normText(options.reason || 'list-native-recent-chats:persist') });
        }
        return rows;
      } catch (e) {
        err('native-recents:list', e);
      }
      return [];
    }

    function registrySortMs(row) {
      return dateMs(row?.lastInteractionAt || row?.lastMessageAt || row?.updatedAt || row?.savedAt || row?.lastSeenAt || row?.createdAt || row?.observedAt || '');
    }

    function toKnownRegistryRow(raw, fallbackSource = 'indexed') {
      try {
        const source = raw?.source || raw?.originSource || fallbackSource;
        const normalized = normalizeChatRow(raw, source, { observedAt: raw?.observedAt || raw?.lastSeenAt || '' });
        if (!normalized?.id) return null;
        // Phase 2 durability fields. firstSeenAt defaults to the chat's earliest known
        // observation so v1 rows that never knew about this field still report a sensible
        // origin. visibleInLastScan and scanBatchId default to neutral values; they're
        // populated by the future scan ledger (Phase 3) and remain unmutated here.
        const observedAt = normalized.observedAt || new Date().toISOString();
        const firstSeenAt = isoOrEmpty(raw?.firstSeenAt || observedAt || normalized.lastSeenAt || '');
        const batchHistorySrc = Array.isArray(raw?.batchHistory) ? raw.batchHistory : [];
        const batchHistory = uniqueStrings(batchHistorySrc.map((s) => normText(s))).slice(0, REGISTRY_BATCH_HISTORY_LIMIT);
        return {
          id: normalized.id,
          chatId: normalized.chatId || '',
          href: normalized.href || '',
          title: normalized.title || '',
          source: 'indexed',
          originSource: bestSource(raw?.originSources || raw?.sources || normalized.sources || raw?.originSource || raw?.source || ''),
          originSources: mergeSourceArrays(raw?.originSources || raw?.sources || normalized.sources || raw?.originSource || raw?.source || ''),
          isSavedHint: !!(raw?.isSavedHint || normalized.isSaved),
          isImportedHint: !!(raw?.isImportedHint || normalized.isImported),
          isArchived: !!(raw?.isArchived || normalized.isArchived),
          isPinned: !!(raw?.isPinned || normalized.isPinned),
          createdAt: normalized.createdAt || '',
          updatedAt: normalized.updatedAt || '',
          lastInteractionAt: normalized.lastInteractionAt || '',
          turnCount: toNonNegativeInt(normalized.turnCount),
          answerCount: toNonNegativeInt(normalized.answerCount),
          userTurnCount: toNonNegativeInt(normalized.userTurnCount),
          savedAt: normalized.savedAt || '',
          lastSeenAt: normalized.lastSeenAt || '',
          observedAt,
          firstSeenAt,
          scanBatchId: normText(raw?.scanBatchId || ''),
          visibleInLastScan: !!raw?.visibleInLastScan,
          batchHistory,
          nativeOrder: Number.isFinite(Number(raw?.nativeOrder ?? normalized.nativeOrder)) ? Number(raw?.nativeOrder ?? normalized.nativeOrder) : null,
          nativeRecentsSource: normText(raw?.nativeRecentsSource || normalized.nativeRecentsSource || ''),
          projectId: normalized.projectId || '',
          projectName: normalized.projectName || '',
        };
      } catch (e) {
        err('known-registry:normalize', e);
        return null;
      }
    }

    // Phase 2: lift a v1 registry row to the v2 shape by stamping the new durability fields
    // with safe defaults. Used during the lazy v1→v2 migration.
    function upgradeRowV1ToV2(row) {
      if (!row || typeof row !== 'object') return null;
      const observedAt = isoOrEmpty(row.observedAt || row.lastSeenAt || '');
      return {
        ...row,
        lastInteractionAt: isoOrEmpty(row.lastInteractionAt || row.lastMessageAt || row.updatedAt || ''),
        turnCount: toNonNegativeInt(row.turnCount || row.answerCount || row.userTurnCount),
        answerCount: toNonNegativeInt(row.answerCount),
        userTurnCount: toNonNegativeInt(row.userTurnCount),
        firstSeenAt: isoOrEmpty(row.firstSeenAt || observedAt || ''),
        scanBatchId: normText(row.scanBatchId || ''),
        visibleInLastScan: !!row.visibleInLastScan,
        batchHistory: Array.isArray(row.batchHistory)
          ? uniqueStrings(row.batchHistory.map((s) => normText(s))).slice(0, REGISTRY_BATCH_HISTORY_LIMIT)
          : [],
      };
    }

    function compactKnownRegistryRows(rows = []) {
      const map = new Map();
      (Array.isArray(rows) ? rows : []).forEach((raw) => {
        const row = toKnownRegistryRow(raw, 'indexed');
        if (!row) return;
        const key = row.chatId || row.href || row.id;
        if (!key) return;
        const prev = map.get(key) || null;
        if (!prev) {
          map.set(key, row);
          return;
        }
        const merged = mergeChatRecord(
          normalizeChatRow(prev, 'indexed', { observedAt: prev.observedAt || '' }),
          normalizeChatRow(row, 'indexed', { observedAt: row.observedAt || '' }),
        );
        map.set(key, toKnownRegistryRow(merged, 'indexed'));
      });
      return Array.from(map.values())
        .filter(Boolean)
        .sort((a, b) => registrySortMs(b) - registrySortMs(a) || String(a.title || '').localeCompare(String(b.title || '')))
        .slice(0, KNOWN_REGISTRY_ROW_LIMIT);
    }

    // Phase 2: which storage key is currently authoritative for the registry. After a
    // successful migration this returns KEY_REGISTRY_V2 (Library Store via the bridge);
    // before migration / when migration aborts due to non-durable backend, it stays on the
    // legacy KEY_KNOWN_REGISTRY_V1 (localStorage) so behavior is unchanged.
    function activeStorageKey() {
      return state.v2RegistryCache ? KEY_REGISTRY_V2 : KEY_KNOWN_REGISTRY_V1;
    }

    // Phase 2: debounced async flush of the in-memory v2 cache to H2O.Library.Store. Writes
    // coalesce — many synchronous registerKnownChats calls become a single Store.set after
    // the debounce window. Failures log but do NOT clear the cache; the next flush retries.
    function scheduleStoreFlush(reason = '') {
      if (!state.v2RegistryCache) return;
      if (state.v2FlushTimer) return;
      const timer = W.setTimeout(async () => {
        state.v2FlushTimer = 0;
        state.clean.timers.delete(timer);
        try {
          const Store = W.H2O?.Library?.Store;
          if (Store && state.v2RegistryCache) {
            await Store.set(KEY_REGISTRY_V2, state.v2RegistryCache);
            step('store-flush:ok', `${state.v2RegistryCache.rows?.length || 0} rows | ${reason || ''}`);
          }
        } catch (e) {
          err('store-flush', e);
        }
      }, REGISTRY_STORE_FLUSH_DEBOUNCE_MS);
      state.v2FlushTimer = timer;
      state.clean.timers.add(timer);
    }

    async function flushKnownChatRegistryNow(reason = '') {
      if (!state.v2RegistryCache) return false;
      if (state.v2FlushTimer) {
        try { W.clearTimeout(state.v2FlushTimer); } catch {}
        state.clean.timers.delete(state.v2FlushTimer);
        state.v2FlushTimer = 0;
      }
      try {
        const Store = W.H2O?.Library?.Store;
        if (!Store || !state.v2RegistryCache) return false;
        await Store.set(KEY_REGISTRY_V2, state.v2RegistryCache);
        step('store-flush:immediate', `${state.v2RegistryCache.rows?.length || 0} rows | ${reason || ''}`);
        return true;
      } catch (e) {
        err('store-flush:immediate', e);
        return false;
      }
    }

    // Phase 3: same debounce pattern but for the ledger. Decoupled from registry flush so a
    // burst of registry writes during a scan doesn't hold the ledger flush back, and vice
    // versa. Both eventually land in the bridge's IndexedDB through H2O.Library.Store.
    function scheduleLedgerFlush(reason = '') {
      if (!state.scanLedgerCache) return;
      if (state.ledgerFlushTimer) return;
      const timer = W.setTimeout(async () => {
        state.ledgerFlushTimer = 0;
        state.clean.timers.delete(timer);
        try {
          const Store = W.H2O?.Library?.Store;
          if (Store && state.scanLedgerCache) {
            await Store.set(KEY_SCAN_LEDGER_V1, state.scanLedgerCache);
            step('ledger-flush:ok', `${state.scanLedgerCache.batches?.length || 0} batches | ${reason || ''}`);
          }
        } catch (e) {
          err('ledger-flush', e);
        }
      }, REGISTRY_STORE_FLUSH_DEBOUNCE_MS);
      state.ledgerFlushTimer = timer;
      state.clean.timers.add(timer);
    }

    async function flushScanLedgerNow(reason = '') {
      if (!state.scanLedgerCache) return false;
      if (state.ledgerFlushTimer) {
        try { W.clearTimeout(state.ledgerFlushTimer); } catch {}
        state.clean.timers.delete(state.ledgerFlushTimer);
        state.ledgerFlushTimer = 0;
      }
      try {
        const Store = W.H2O?.Library?.Store;
        if (!Store || !state.scanLedgerCache) return false;
        await Store.set(KEY_SCAN_LEDGER_V1, state.scanLedgerCache);
        step('ledger-flush:immediate', `${state.scanLedgerCache.batches?.length || 0} batches | ${reason || ''}`);
        return true;
      } catch (e) {
        err('ledger-flush:immediate', e);
        return false;
      }
    }

    function readKnownChatRegistry() {
      // Migrated mode: in-memory v2 cache is the source of truth. Sync read; no Store call.
      if (state.v2RegistryCache) {
        const c = state.v2RegistryCache;
        return {
          version: c.version || 2,
          rows: Array.isArray(c.rows) ? c.rows : [],
          updatedAt: Number(c.updatedAt || 0) || 0,
          updatedAtIso: normText(c.updatedAtIso || ''),
          reason: normText(c.reason || ''),
          migrationSource: state.libraryStoreMigration?.source || 'store-v2',
          storageKey: KEY_REGISTRY_V2,
        };
      }
      // Legacy path: read directly from localStorage v1 (no Store dependency).
      const raw = storage.getJSON(KEY_KNOWN_REGISTRY_V1, null);
      if (!raw || typeof raw !== 'object') return null;
      const rows = compactKnownRegistryRows(raw.rows || []);
      return {
        version: 1,
        rows,
        updatedAt: Number(raw.updatedAt || 0) || 0,
        updatedAtIso: normText(raw.updatedAtIso || ''),
        reason: normText(raw.reason || ''),
        migrationSource: state.libraryStoreMigration?.source || 'legacy-v1',
        storageKey: KEY_KNOWN_REGISTRY_V1,
      };
    }

    function readKnownChatRegistryRows() {
      const payload = readKnownChatRegistry();
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      state.lastKnownRegistryCount = rows.length;
      return rows.map((row) => ({ ...row, source: 'indexed' }));
    }

    /* ──────────────────────────────────────────────────────────────────
     * Phase 2 — H2O.ChatRegistry soft integration
     *
     * Why this lives here: 0F1c is the discovery/index layer; it knows the legacy
     * known-chat row shape and the sidebar-recents row shape. The registry is the
     * truth layer. We translate row → ChatRegistry input here, then call the
     * registry's public API. If the registry isn't loaded (older build, partial
     * loader), every helper soft-no-ops with a diagnostic counter — Library Index
     * keeps working unchanged.
     * ────────────────────────────────────────────────────────────────── */

    function chatRegistry() {
      // Live-read each call: the registry can boot a tick later than 0F1c when the
      // dev loader runs them in different orders. Capturing at init would miss it.
      const reg = W.H2O && W.H2O.ChatRegistry;
      state.chatRegistrySync.registryAvailable = !!reg;
      return reg && typeof reg.upsertMany === 'function' ? reg : null;
    }

    function safeListChatRegistryRows(api = chatRegistry()) {
      if (!api || typeof api.listRecords !== 'function') return [];
      try {
        const rows = api.listRecords({ includeDeleted: false });
        return (Array.isArray(rows) ? rows : []).map((record) => {
          const originSources = mergeSourceArrays(record?.source?.seenFrom || [], record?.source?.first || '');
          return {
            id: normText(record?.chatId || record?.id || ''),
            chatId: normText(record?.chatId || record?.id || ''),
            href: normText(record?.href || record?.normalizedHref || hrefForChatId(record?.chatId || record?.id || '')),
            title: normText(record?.title || record?.chatId || 'Untitled chat'),
            source: 'indexed',
            originSource: originSources[0] || 'chat-registry',
            originSources: originSources.length ? originSources : ['indexed'],
            createdAt: record?.createdAt || '',
            updatedAt: record?.updatedAt || '',
            lastSeenAt: record?.lastSeenAt || '',
            lastInteractionAt: record?.lastMessageAt || record?.lastInteractionAt || record?.updatedAt || '',
            turnCount: toNonNegativeInt(record?.turnCount),
            answerCount: toNonNegativeInt(record?.answerCount),
            userTurnCount: toNonNegativeInt(record?.userTurnCount),
            projectId: normText(record?.project?.projectId || ''),
            projectName: normText(record?.project?.projectName || ''),
            isArchived: !!record?.state?.isArchived,
            isPinned: !!record?.state?.isPinned,
            isSavedHint: !!record?.state?.isSaved,
            isImportedHint: !!record?.state?.isImported,
            isRecentHint: originSources.includes('recents'),
          };
        }).filter((row) => row.chatId || row.href || row.title);
      } catch (e) {
        err('chat-registry:list-records', e);
        return [];
      }
    }

    function mapKnownRegistryRowToChatRegistryInput(row, observedAt) {
      try {
        const id = normalizeChatId(row?.chatId || row?.id || parseChatIdFromHref(row?.href || ''));
        if (!id) return null;
        const originSources = sourceHintsForRow(row, row?.source || 'indexed');
        const lastSeen = isoOrEmpty(row?.lastSeenAt || row?.observedAt || observedAt || '');
        const firstSeen = isoOrEmpty(row?.firstSeenAt || row?.observedAt || lastSeen);
        return {
          chatId: id,
          href: normText(row?.href || ''),
          title: normText(row?.title || ''),
          // titleSource: 'sidebar' is the most accurate fallback — known-registry rows
          // originate from native sidebar discovery + cross-source merges.
          titleSource: 'sidebar',
          createdAt: isoOrEmpty(row?.createdAt),
          firstSeenAt: firstSeen,
          lastSeenAt: lastSeen,
          updatedAt: isoOrEmpty(row?.updatedAt),
          lastMessageAt: isoOrEmpty(row?.lastInteractionAt || row?.lastMessageAt || row?.updatedAt || row?.lastSeenAt || ''),
          turnCount: toNonNegativeInt(row?.turnCount),
          answerCount: toNonNegativeInt(row?.answerCount),
          userTurnCount: toNonNegativeInt(row?.userTurnCount),
          project: {
            projectId: normText(row?.projectId || ''),
            projectName: normText(row?.projectName || ''),
          },
          state: {
            isPinned: !!row?.isPinned,
            isArchived: !!row?.isArchived,
            isSaved: !!row?.isSavedHint,
            isImported: !!row?.isImportedHint,
          },
          quality: { confidence: 'medium' },
          source: {
            first: bestSource(originSources),
            seenFrom: originSources,
          },
        };
      } catch (e) {
        err('chat-registry:map-known-row', e);
        return null;
      }
    }

    function mapSidebarRecentsRowToChatRegistryInput(row, observedAt) {
      try {
        const id = normalizeChatId(row?.chatId || row?.id || parseChatIdFromHref(row?.href || ''));
        if (!id) return null;
        return {
          chatId: id,
          href: normText(row?.href || ''),
          title: normText(row?.title || ''),
          titleSource: 'recents',
          createdAt: isoOrEmpty(row?.createdAt),
          firstSeenAt: isoOrEmpty(row?.firstSeenAt || observedAt || row?.observedAt || ''),
          lastSeenAt: isoOrEmpty(observedAt || row?.lastSeenAt || row?.observedAt || ''),
          updatedAt: isoOrEmpty(row?.updatedAt),
          lastMessageAt: isoOrEmpty(row?.lastInteractionAt || row?.lastMessageAt || row?.updatedAt || ''),
          turnCount: toNonNegativeInt(row?.turnCount),
          answerCount: toNonNegativeInt(row?.answerCount),
          userTurnCount: toNonNegativeInt(row?.userTurnCount),
          project: {
            projectId: normText(row?.projectId || ''),
            projectName: normText(row?.projectName || ''),
          },
          state: {
            isPinned: !!row?.isPinned,
            isArchived: !!row?.isArchived,
          },
          quality: { confidence: 'medium' },
          source: { first: 'recents', seenFrom: ['recents'] },
        };
      } catch (e) {
        err('chat-registry:map-recents-row', e);
        return null;
      }
    }

    // Phase 2B — one-shot seed from the existing known-chat registry. Safe to call
    // repeatedly: passive merge protects organization/project/title-source rules in
    // the registry, so re-seeding cannot regress richer data.
    function seedChatRegistryFromKnownRegistry(reason = 'seed-chat-registry') {
      const startedAt = Date.now();
      const observedAt = new Date().toISOString();
      const reg = chatRegistry();
      const sourceRows = (() => {
        try { return readKnownChatRegistry()?.rows || []; }
        catch { return []; }
      })();
      const sourceCount = Array.isArray(sourceRows) ? sourceRows.length : 0;
      if (!reg) {
        const out = {
          ok: false, reason, sourceRows: sourceCount, mappedRows: 0,
          upsertedRows: 0, skipped: 0, registryCount: 0,
          error: 'chat-registry-not-available',
          durationMs: Date.now() - startedAt,
        };
        state.chatRegistrySync.lastSeedAt = startedAt;
        state.chatRegistrySync.lastSeedReason = String(reason || '');
        state.chatRegistrySync.lastSeedError = out.error;
        return out;
      }
      let mapped = [];
      let skipped = 0;
      for (const row of sourceRows) {
        const input = mapKnownRegistryRowToChatRegistryInput(row, observedAt);
        if (input) mapped.push(input); else skipped += 1;
      }
      let upserted = [];
      let error = null;
      try {
        upserted = reg.upsertMany(mapped, {
          source: 'library-index',
          passive: true,
          observedAt,
        });
      } catch (e) {
        err('chat-registry:seed:upsertMany', e);
        error = String(e?.message || e);
      }
      const registryCount = (() => {
        try { return reg.getStats?.()?.counts?.records || 0; } catch { return 0; }
      })();
      const out = {
        ok: !error,
        reason: String(reason || ''),
        sourceRows: sourceCount,
        mappedRows: mapped.length,
        upsertedRows: Array.isArray(upserted) ? upserted.length : 0,
        skipped,
        registryCount,
        error,
        durationMs: Date.now() - startedAt,
      };
      state.chatRegistrySync.lastSeedAt = startedAt;
      state.chatRegistrySync.lastSeedReason = String(reason || '');
      state.chatRegistrySync.lastSeedSourceRows = sourceCount;
      state.chatRegistrySync.lastSeedMappedRows = mapped.length;
      state.chatRegistrySync.lastSeedUpsertedRows = out.upsertedRows;
      state.chatRegistrySync.lastSeedSkipped = skipped;
      state.chatRegistrySync.lastSeedDurationMs = out.durationMs;
      state.chatRegistrySync.lastSeedError = error;
      step('chat-registry:seed', `rows=${sourceCount} mapped=${mapped.length} upserted=${out.upsertedRows} skipped=${skipped}`);
      return out;
    }

    // Phase 2C — mirror native-recents rows into the registry as a passive sighting.
    // Called from scanSidebarRecentsNow after registerKnownChats so the legacy registry
    // remains the system-of-record for the existing model build path.
    function mirrorSidebarRecentsToChatRegistry(rows = [], observedAt = '') {
      const reg = chatRegistry();
      if (!reg) {
        state.chatRegistrySync.lastRecentsMirrorError = 'chat-registry-not-available';
        return { ok: false, mappedRows: 0, upsertedRows: 0, error: 'chat-registry-not-available' };
      }
      const obs = isoOrEmpty(observedAt) || new Date().toISOString();
      const mapped = (Array.isArray(rows) ? rows : [])
        .map((row) => mapSidebarRecentsRowToChatRegistryInput(row, obs))
        .filter(Boolean);
      let upserted = [];
      let error = null;
      try {
        upserted = reg.upsertMany(mapped, {
          source: 'recents',
          passive: true,
          observedAt: obs,
        });
      } catch (e) {
        err('chat-registry:mirror-recents:upsertMany', e);
        error = String(e?.message || e);
      }
      state.chatRegistrySync.lastRecentsMirrorAt = Date.now();
      state.chatRegistrySync.lastRecentsMirrorRows = mapped.length;
      state.chatRegistrySync.lastRecentsMirrorError = error;
      return {
        ok: !error,
        mappedRows: mapped.length,
        upsertedRows: Array.isArray(upserted) ? upserted.length : 0,
        error,
      };
    }

    // Phase 2F — read-only sync status surface. Library Workspace / Insights / a future
    // Library Tab diag panel can consume this without depending on registry internals.
    function getChatRegistrySyncStatus() {
      const reg = chatRegistry();
      const stats = (() => {
        try { return reg?.getStats?.() || null; } catch { return null; }
      })();
      return {
        chatRegistryAvailable: !!reg,
        chatRegistryVersion: reg?.version || null,
        chatRegistrySchemaVersion: reg?.schemaVersion || null,
        chatRegistryStorageKey: reg?.storageKey || null,
        chatRegistryRecordCount: stats?.counts?.records || 0,
        chatRegistryTombstones: stats?.counts?.tombstones || 0,
        knownRegistryRowCount: (() => {
          try { return Array.isArray(readKnownChatRegistry()?.rows) ? readKnownChatRegistry().rows.length : 0; }
          catch { return 0; }
        })(),
        sync: { ...state.chatRegistrySync },
      };
    }

    function writeKnownChatRegistryRows(rows = [], meta = {}) {
      const compact = compactKnownRegistryRows(rows);
      const inV2 = !!state.v2RegistryCache;
      const payload = {
        version: inV2 ? 2 : 1,
        rows: compact,
        updatedAt: Date.now(),
        updatedAtIso: new Date().toISOString(),
        reason: normText(meta.reason || ''),
      };
      if (inV2) {
        // Sync update of the in-memory cache; async flush to Store via bridge.
        state.v2RegistryCache = payload;
        state.lastKnownRegistryCount = compact.length;
        scheduleStoreFlush(meta.reason || 'write-rows');
        return payload;
      }
      // Legacy fallback when migration is pending or aborted.
      const ok = storage.setJSON(KEY_KNOWN_REGISTRY_V1, payload);
      if (ok) state.lastKnownRegistryCount = compact.length;
      return ok ? payload : null;
    }

    function mergeKnownChatRegistryRows(rows = [], meta = {}) {
      const current = readKnownChatRegistryRows();
      return writeKnownChatRegistryRows([...(Array.isArray(current) ? current : []), ...(Array.isArray(rows) ? rows : [])], meta);
    }

    async function flushDurabilityNow(reason = '') {
      const [registry, ledger] = await Promise.allSettled([
        flushKnownChatRegistryNow(reason),
        flushScanLedgerNow(reason),
      ]);
      return {
        registry: registry.status === 'fulfilled' ? registry.value === true : false,
        ledger: ledger.status === 'fulfilled' ? ledger.value === true : false,
      };
    }

    // Phase 3 fix: which refresh reasons warrant a fresh ledger batch. The 'storage:*'
    // reasons come from a cross-tab `storage` event listener (line ~2390) that fires when
    // ANOTHER tab writes to a watched key. The originating tab already produced the
    // canonical batch — duplicating it here would override the user-facing batch reason
    // and pollute the ledger. The merge still runs so the local view stays in sync; the
    // existing durability fields on the registry rows are preserved by mergeChatRecord
    // (Phase 2 rules) because the model rows don't carry batch context to overwrite them.
    function shouldCreateBatchForReason(reason) {
      const r = String(reason || '');
      if (!r) return true;
      if (r.startsWith('storage:')) return false;
      return true;
    }

    function persistKnownChatRegistryFromModel(model, reason = 'refresh') {
      const rows = Array.isArray(model?.chats) ? model.chats : (Array.isArray(model?.knownChats) ? model.knownChats : []);
      if (!rows.length) return null;
      // Cross-tab sync trigger — merge without creating a duplicate batch.
      if (!shouldCreateBatchForReason(reason)) {
        return mergeKnownChatRegistryRows(rows, { reason });
      }
      // Phase 3: each user-facing / event-driven refresh wraps persistence in a scan batch
      // so rows get real visibleInLastScan / scanBatchId / batchHistory context AND the
      // ledger gets a committed entry. Boot-time seeds (seedKnownChatRegistryFromModel
      // below) intentionally skip this — they're cache restores, not scans.
      const handle = beginScanBatch({ reason, sources: inferSourcesFromModel(model) });
      try {
        const res = commitScanBatch(handle.batchId, { observedRows: rows });
        return res?.registryPayload || null;
      } catch (e) {
        err('persist-with-batch', e);
        try { handle.abort(); } catch (_e) {}
        return null;
      }
    }

    function seedKnownChatRegistryFromModel(model, reason = 'seed') {
      const rows = Array.isArray(model?.chats) ? model.chats : (Array.isArray(model?.knownChats) ? model.knownChats : []);
      if (!rows.length) return null;
      return mergeKnownChatRegistryRows(rows, { reason });
    }

    function clearKnownChatRegistry() {
      // Phase 2: clear the in-memory v2 cache, the durable v2 in Store (async fire-and-forget),
      // AND the legacy v1 localStorage snapshot. After this, registerKnownChats will write
      // through whichever tier becomes active again on next migration setup.
      state.lastKnownRegistryCount = 0;
      state.v2RegistryCache = null;
      try {
        const Store = W.H2O?.Library?.Store;
        if (Store) Store.del(KEY_REGISTRY_V2).catch((e) => err('store:clear-v2', e));
      } catch (e) { err('store:clear-v2-sync', e); }
      return storage.del(KEY_KNOWN_REGISTRY_V1);
    }

    function registerKnownChats(rows, opts = {}) {
      const list = Array.isArray(rows) ? rows : (rows ? [rows] : []);
      const storageKey = activeStorageKey();
      if (!list.length) return { ok: false, added: 0, count: state.lastKnownRegistryCount, storageKey };
      const payload = mergeKnownChatRegistryRows(list, { reason: opts.reason || 'api-register-known-chats' });
      if (opts.refresh !== false) scheduleRefresh(opts.refreshReason || 'api:register-known-chats');
      return {
        ok: !!payload,
        added: list.length,
        count: Array.isArray(payload?.rows) ? payload.rows.length : state.lastKnownRegistryCount,
        storageKey: activeStorageKey(),
      };
    }

    // Phase 2: setup runner — gates on Store.canMigrateLargeLibraryData. Idempotent (safe
    // to call multiple times). Returns the migration record. Writes that happen during the
    // pre-publication window go to legacy v1 and are picked up by the v1 read inside this
    // routine — no data loss.
    function resetLibraryStoreMigrationForRetry() {
      const m = state.libraryStoreMigration;
      state.v2MigrationPromise = null;
      m.status = 'pending';
      m.source = 'unknown';
      m.rowsLoaded = 0;
      m.startedAt = 0;
      m.finishedAt = 0;
      m.error = null;
      m.legacyV1UpdatedAt = 0;
      m.legacyV1UpdatedAtIso = '';
      return m;
    }

    async function retryLibraryStoreMigration(reason = 'store-event') {
      if (state.v2RegistryCache) return state.libraryStoreMigration;
      const m = state.libraryStoreMigration || {};
      if (m.status === 'store-v2' || m.status === 'migrated-v1-to-v2') return m;
      if (m.status === 'pending' && state.v2MigrationPromise) return state.v2MigrationPromise;
      const Store = W.H2O?.Library?.Store;
      if (!Store) return m;
      if (Store._readyPromise && typeof Store._readyPromise.then === 'function') {
        try { await Store._readyPromise; } catch (_e) {}
      }
      const caps = (typeof Store.caps === 'function') ? Store.caps() : null;
      if (!caps?.canMigrateLargeLibraryData) return m;
      if (m.status !== 'aborted-no-durable' && m.status !== 'pending') return m;
      resetLibraryStoreMigrationForRetry();
      step('migration:retry', `${reason} primary=${caps?.primary || 'unknown'} durable=${caps?.durable === true}`);
      return setupLibraryStoreMigration();
    }

    async function setupLibraryStoreMigration() {
      if (state.v2MigrationPromise) return state.v2MigrationPromise;
      state.v2MigrationPromise = (async () => {
        const m = state.libraryStoreMigration;
        m.startedAt = Date.now();
        try {
          const Store = W.H2O?.Library?.Store;
          if (!Store) {
            m.status = 'aborted-no-durable';
            m.error = 'H2O.Library.Store not available';
            m.finishedAt = Date.now();
            return m;
          }
          if (Store._readyPromise && typeof Store._readyPromise.then === 'function') {
            try { await Store._readyPromise; } catch (_e) {}
          }
          const caps = (typeof Store.caps === 'function') ? Store.caps() : null;
          if (!caps?.canMigrateLargeLibraryData) {
            m.status = 'aborted-no-durable';
            m.error = `Store not durable (primary=${caps?.primary || 'unknown'}, durable=${caps?.durable})`;
            m.finishedAt = Date.now();
            step('migration:aborted', m.error);
            return m;
          }

          // Phase 3: load the scan ledger (independent of which registry path runs below).
          // Failures here are non-fatal — we just start with an empty in-memory ledger.
          try {
            const lp = await Store.get(KEY_SCAN_LEDGER_V1);
            state.scanLedgerCache = (lp && Array.isArray(lp.batches))
              ? {
                  version: Number(lp.version || 1) || 1,
                  batches: lp.batches.slice(0, SCAN_LEDGER_BATCH_LIMIT),
                  updatedAt: Number(lp.updatedAt || 0) || 0,
                  updatedAtIso: normText(lp.updatedAtIso || ''),
                }
              : { version: 1, batches: [], updatedAt: 0, updatedAtIso: '' };
            step('migration:ledger-loaded', `${state.scanLedgerCache.batches.length} batches`);
          } catch (e) {
            err('migration:ledger-load', e);
            state.scanLedgerCache = { version: 1, batches: [], updatedAt: 0, updatedAtIso: '' };
          }

          // Path A: existing v2 in Store — load straight into the cache.
          let v2Payload = null;
          try { v2Payload = await Store.get(KEY_REGISTRY_V2); } catch (e) { err('migration:store-get', e); }
          if (v2Payload && typeof v2Payload === 'object' && Array.isArray(v2Payload.rows)) {
            state.v2RegistryCache = {
              version: 2,
              rows: compactKnownRegistryRows(v2Payload.rows),
              updatedAt: Number(v2Payload.updatedAt || 0) || 0,
              updatedAtIso: normText(v2Payload.updatedAtIso || ''),
              reason: normText(v2Payload.reason || ''),
            };
            m.status = 'store-v2';
            m.source = 'store-v2';
            m.rowsLoaded = state.v2RegistryCache.rows.length;
            m.finishedAt = Date.now();
            state.lastKnownRegistryCount = m.rowsLoaded;
            try { W.dispatchEvent(new CustomEvent(EV_REGISTRY_MIGRATED, { detail: { source: m.source, rows: m.rowsLoaded, status: m.status } })); } catch (_e) {}
            step('migration:store-v2-loaded', `${m.rowsLoaded} rows`);
            return m;
          }

          // Path B: legacy v1 in localStorage — upgrade to v2 shape and write to Store.
          const v1Payload = storage.getJSON(KEY_KNOWN_REGISTRY_V1, null);
          if (v1Payload && typeof v1Payload === 'object' && Array.isArray(v1Payload.rows)) {
            const upgraded = v1Payload.rows.map(upgradeRowV1ToV2).filter(Boolean);
            const compact = compactKnownRegistryRows(upgraded);
            const newCache = {
              version: 2,
              rows: compact,
              updatedAt: Date.now(),
              updatedAtIso: new Date().toISOString(),
              reason: 'migration:v1-to-v2',
            };
            try {
              await Store.set(KEY_REGISTRY_V2, newCache);
            } catch (e) {
              err('migration:store-set', e);
              m.status = 'aborted-no-durable';
              m.error = `Store.set failed: ${e?.message || e}`;
              m.finishedAt = Date.now();
              return m;
            }
            // Publish cache only AFTER the Store write succeeded — any in-flight writes
            // during the await landed in legacy v1, which we just snapshotted; from now on
            // writes route through v2.
            state.v2RegistryCache = newCache;
            state.lastKnownRegistryCount = compact.length;
            m.status = 'migrated-v1-to-v2';
            m.source = 'migrated-v1-to-v2';
            m.rowsLoaded = compact.length;
            m.legacyV1UpdatedAt = Number(v1Payload.updatedAt || 0) || 0;
            m.legacyV1UpdatedAtIso = normText(v1Payload.updatedAtIso || '');
            m.finishedAt = Date.now();
            try { W.dispatchEvent(new CustomEvent(EV_REGISTRY_MIGRATED, { detail: { source: m.source, rows: m.rowsLoaded, status: m.status } })); } catch (_e) {}
            step('migration:v1-to-v2', `${compact.length} rows | legacy v1 preserved at ${KEY_KNOWN_REGISTRY_V1}`);
            return m;
          }

          // Path C: nothing anywhere — start fresh in v2.
          state.v2RegistryCache = {
            version: 2,
            rows: [],
            updatedAt: 0,
            updatedAtIso: '',
            reason: '',
          };
          m.status = 'store-v2';
          m.source = 'store-v2-empty';
          m.rowsLoaded = 0;
          m.finishedAt = Date.now();
          try { W.dispatchEvent(new CustomEvent(EV_REGISTRY_MIGRATED, { detail: { source: m.source, rows: 0, status: m.status } })); } catch (_e) {}
          step('migration:fresh-v2');
          return m;
        } catch (e) {
          err('migration:setup', e);
          m.status = 'aborted-no-durable';
          m.error = String(e?.message || e);
          m.finishedAt = Date.now();
          return m;
        }
      })();
      return state.v2MigrationPromise;
    }

    // ─── Phase 3: Scan Batch Ledger ─────────────────────────────────────────
    // A "scan batch" is one logical scan event (a refresh) that observes some chats from
    // some sources. Lifecycle: beginScanBatch() → (collect & merge sources) → commitScanBatch()
    // (or handle.abort() on error). The ledger (capped FIFO of recent batches) is the
    // append-only history; the registry rows carry the per-row scan context derived from it.
    //
    // Single-in-flight invariant: a second beginScanBatch implicitly aborts any stale active
    // batch — practical for the existing refresh debouncer, where one batch overlaps another
    // only in pathological error paths.

    function newBatchId() {
      return 'sb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    }

    function inferSourcesFromModel(model) {
      if (!model || typeof model !== 'object') return [];
      if (Array.isArray(model.sources)) return uniqueStrings(model.sources.map((s) => normText(s)));
      const seen = new Set();
      const rows = Array.isArray(model.chats) ? model.chats : (Array.isArray(model.knownChats) ? model.knownChats : []);
      rows.forEach((chat) => {
        const list = Array.isArray(chat?.sources) ? chat.sources : (chat?.source ? [chat.source] : []);
        list.forEach((s) => { const v = normText(s); if (v && v !== 'indexed') seen.add(v); });
      });
      return Array.from(seen).sort();
    }

    function beginScanBatch(opts = {}) {
      // Lazy init of the in-memory ledger so commits work even when the migration runner
      // hasn't loaded the ledger yet (or aborted because the Store isn't durable). Persistence
      // still requires Store; in-memory always works.
      if (!state.scanLedgerCache) {
        state.scanLedgerCache = { version: 1, batches: [], updatedAt: 0, updatedAtIso: '' };
      }
      const reason = normText(opts.reason || '');
      const sources = Array.isArray(opts.sources)
        ? uniqueStrings(opts.sources.map((s) => normText(s)))
        : [];
      if (state.activeScanBatch && !state.activeScanBatch.committed && !state.activeScanBatch.aborted) {
        err('scan-batch:implicit-abort', `previous batch ${state.activeScanBatch.id} replaced by new one`);
        state.activeScanBatch.aborted = true;
      }
      const id = newBatchId();
      const startedAt = Date.now();
      state.activeScanBatch = {
        id,
        startedAt,
        startedAtIso: new Date(startedAt).toISOString(),
        finishedAt: 0,
        finishedAtIso: '',
        durationMs: 0,
        reason,
        sources,
        counts: { observed: 0, added: 0, reappeared: 0, vanished: 0 },
        ok: false,
        error: null,
        aborted: false,
        committed: false,
      };
      step('scan-batch:begin', `${id} reason=${reason || '-'} sources=${sources.join(',') || '-'}`);
      return {
        batchId: id,
        abort() {
          if (state.activeScanBatch?.id === id && !state.activeScanBatch.committed) {
            state.activeScanBatch.aborted = true;
            state.activeScanBatch = null;
            step('scan-batch:abort', id);
          }
        },
      };
    }

    function commitScanBatch(batchId, opts = {}) {
      const batch = state.activeScanBatch;
      if (!batch || batch.id !== batchId) {
        return { ok: false, error: 'no-active-batch', batchId, counts: null, registryPayload: null };
      }
      if (batch.aborted) {
        state.activeScanBatch = null;
        return { ok: false, error: 'batch-aborted', batchId, counts: null, registryPayload: null };
      }
      if (batch.committed) {
        return { ok: false, error: 'batch-already-committed', batchId, counts: batch.counts, registryPayload: null };
      }
      const finishedAt = Date.now();
      batch.finishedAt = finishedAt;
      batch.finishedAtIso = new Date(finishedAt).toISOString();
      batch.durationMs = finishedAt - (batch.startedAt || finishedAt);
      const errorParam = opts.error;
      batch.error = errorParam ? String(errorParam?.message || errorParam) : null;

      const observedInput = Array.isArray(opts.observedRows) ? opts.observedRows : [];
      const currentRows = readKnownChatRegistryRows();
      const currentByKey = new Map();
      currentRows.forEach((row) => {
        const k = row.chatId || row.href || row.id;
        if (k) currentByKey.set(k, row);
      });

      // Stamp observed rows with batch context. Counts: added = wasn't in registry;
      // reappeared = was in registry but visibleInLastScan was false.
      let observed = 0;
      let added = 0;
      let reappeared = 0;
      const observedKeys = new Set();
      const stampedObserved = observedInput.map((rawRow) => {
        const row = toKnownRegistryRow(rawRow, 'indexed');
        if (!row) return null;
        const key = row.chatId || row.href || row.id;
        if (!key || observedKeys.has(key)) return null;
        observedKeys.add(key);
        observed += 1;
        const prev = currentByKey.get(key);
        if (!prev) added += 1;
        else if (!prev.visibleInLastScan) reappeared += 1;
        return {
          ...row,
          scanBatchId: batchId,
          visibleInLastScan: true,
          // mergeChatRecord unions this with prev.batchHistory, newest-first, capped 10.
          batchHistory: [batchId],
        };
      }).filter(Boolean);

      // Vanished rows: was visibleInLastScan=true, not in this batch's observed set.
      // We deliberately leave scanBatchId (last visible batch) and batchHistory unchanged —
      // only flip the visibility flag.
      let vanished = 0;
      const vanishedFlipped = currentRows.filter((row) => {
        const k = row.chatId || row.href || row.id;
        if (!k || observedKeys.has(k)) return false;
        return !!row.visibleInLastScan;
      }).map((row) => {
        vanished += 1;
        return { ...row, visibleInLastScan: false };
      });

      // Single merge: stamped+flipped merge with current via mergeChatRecord, which applies
      // the Phase 2 rules (firstSeenAt = oldest, scanBatchId/visibleInLastScan = next wins,
      // batchHistory = newest-first union capped at REGISTRY_BATCH_HISTORY_LIMIT).
      const allNewRows = [...stampedObserved, ...vanishedFlipped];
      const registryPayload = mergeKnownChatRegistryRows(allNewRows, {
        reason: `scan-batch:${batch.reason || 'unknown'}`,
      });

      batch.counts = { observed, added, reappeared, vanished };
      batch.ok = !errorParam;
      batch.committed = true;
      state.activeScanBatch = null;

      appendBatchToLedger(batch);

      try {
        W.dispatchEvent(new CustomEvent(EV_SCAN_BATCH_COMMITTED, {
          detail: { batchId, counts: batch.counts, ok: batch.ok, reason: batch.reason },
        }));
      } catch (_e) {}

      step('scan-batch:commit', `${batchId} obs=${observed} +${added} ↺${reappeared} -${vanished} ok=${batch.ok}`);
      return { ok: batch.ok, batchId, counts: batch.counts, registryPayload };
    }

    function appendBatchToLedger(batch) {
      const cache = state.scanLedgerCache || { version: 1, batches: [], updatedAt: 0, updatedAtIso: '' };
      const next = {
        version: 1,
        batches: [{ ...batch }, ...(Array.isArray(cache.batches) ? cache.batches : [])].slice(0, SCAN_LEDGER_BATCH_LIMIT),
        updatedAt: Date.now(),
        updatedAtIso: new Date().toISOString(),
      };
      state.scanLedgerCache = next;
      scheduleLedgerFlush('append');
    }

    function listScanBatches(opts = {}) {
      const cache = state.scanLedgerCache;
      if (!cache || !Array.isArray(cache.batches)) return [];
      const limitRaw = Number(opts && opts.limit != null ? opts.limit : 20);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(SCAN_LEDGER_BATCH_LIMIT, Math.floor(limitRaw))) : 20;
      return cache.batches.slice(0, limit).map((b) => ({ ...b }));
    }

    function getLastScanBatch() {
      const cache = state.scanLedgerCache;
      if (!cache || !Array.isArray(cache.batches) || !cache.batches.length) return null;
      return { ...cache.batches[0] };
    }

    function getDurabilityStats() {
      const rows = (state.v2RegistryCache && Array.isArray(state.v2RegistryCache.rows))
        ? state.v2RegistryCache.rows
        : readKnownChatRegistryRows();
      let totalRows = 0;
      let visibleInLastScan = 0;
      let vanishedCount = 0;
      let neverScanned = 0;
      let oldestFirstSeenMs = Infinity;
      let oldestFirstSeenAt = '';
      rows.forEach((row) => {
        totalRows += 1;
        if (row.visibleInLastScan) visibleInLastScan += 1;
        else if (row.scanBatchId) vanishedCount += 1;
        else neverScanned += 1;
        const ms = dateMs(row.firstSeenAt);
        if (ms && ms < oldestFirstSeenMs) {
          oldestFirstSeenMs = ms;
          oldestFirstSeenAt = row.firstSeenAt || '';
        }
      });
      const ledger = state.scanLedgerCache;
      const last = (ledger && Array.isArray(ledger.batches) && ledger.batches[0]) || null;
      return {
        totalRows,
        visibleInLastScan,
        vanished: vanishedCount,
        neverScanned,
        oldestFirstSeenAt: oldestFirstSeenMs === Infinity ? '' : oldestFirstSeenAt,
        batchCount: ledger?.batches?.length || 0,
        lastBatchId: last?.id || '',
        lastBatchAtIso: last?.finishedAtIso || '',
        lastBatchReason: last?.reason || '',
        lastBatchCounts: last?.counts || null,
        storageKey: activeStorageKey(),
        ledgerKey: KEY_SCAN_LEDGER_V1,
      };
    }

    function findVanishedSince(iso) {
      const sinceMs = dateMs(iso);
      if (!sinceMs) return [];
      const rows = (state.v2RegistryCache && Array.isArray(state.v2RegistryCache.rows))
        ? state.v2RegistryCache.rows
        : readKnownChatRegistryRows();
      return rows
        .filter((row) => {
          if (row.visibleInLastScan) return false;
          if (!row.scanBatchId) return false; // never scanned can't have "vanished since"
          const observedMs = dateMs(row.observedAt || row.lastSeenAt || '');
          if (!observedMs) return false;
          return observedMs >= sinceMs;
        })
        .map((row) => ({ ...row }));
    }

    // Phase 2 diagnostics — read-only. Surfaces migration status, in-memory cache size, and
    // the active Store backend so the durability/scan-stats UI can render it later.
    function getMigrationStatus() {
      const m = state.libraryStoreMigration || {};
      const Store = W.H2O?.Library?.Store;
      let backend = null;
      let durable = null;
      try {
        backend = (typeof Store?.backend === 'function') ? Store.backend() : null;
        const caps = (typeof Store?.caps === 'function') ? Store.caps() : null;
        durable = !!caps?.durable;
      } catch (_e) {}
      return {
        status: m.status || 'pending',
        source: m.source || 'unknown',
        rowsLoaded: Number(m.rowsLoaded || 0) || 0,
        rowsCurrent: Array.isArray(state.v2RegistryCache?.rows) ? state.v2RegistryCache.rows.length : state.lastKnownRegistryCount,
        backend,
        durable,
        storageKey: activeStorageKey(),
        error: m.error || null,
        startedAt: m.startedAt || 0,
        finishedAt: m.finishedAt || 0,
        legacyV1UpdatedAt: m.legacyV1UpdatedAt || 0,
        legacyV1UpdatedAtIso: m.legacyV1UpdatedAtIso || '',
        legacyKey: KEY_KNOWN_REGISTRY_V1,
        v2Key: KEY_REGISTRY_V2,
      };
    }

    function safeListFolders(api = foldersApi()) {
      try {
        const rows = typeof api?.list === 'function' ? api.list() : (Array.isArray(api?.folders) ? api.folders : []);
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: normText(row?.id || row?.folderId || ''),
          name: normText(row?.name || row?.title || row?.id || 'Folder'),
          createdAt: isoOrEmpty(row?.createdAt || ''),
          projectId: normText(row?.projectId || row?.nativeProjectId || ''),
          source: 'folders',
        })).filter((row) => row.id || row.name);
      } catch (e) {
        err('folders:list', e);
        return [];
      }
    }

    function safeGetFolderBinding(api, chatIdOrHref) {
      if (!api || !chatIdOrHref || typeof api.getBinding !== 'function') return null;
      try {
        const res = api.getBinding(chatIdOrHref);
        if (!res || typeof res !== 'object') return null;
        const folderId = normText(res.folderId || res.id || '');
        const folderName = normText(res.folderName || res.name || '');
        if (!folderId && !folderName) return null;
        return { id: folderId, name: folderName };
      } catch {
        return null;
      }
    }

    async function safeListProjects(api = projectsApi()) {
      if (!api) return [];
      try {
        let rows = [];
        if (typeof api.loadRowsFast === 'function') rows = api.loadRowsFast(null) || [];
        if (!rows.length && typeof api.loadRows === 'function') {
          const maybe = api.loadRows(null, { backgroundRefresh: false });
          rows = Array.isArray(maybe) ? maybe : (await maybe || []);
        }
        if (!rows.length && typeof api.list === 'function') rows = api.list() || [];
        return (Array.isArray(rows) ? rows : []).map((row) => ({
          id: normText(row?.id || row?.projectId || ''),
          name: normText(row?.title || row?.name || row?.label || row?.id || 'Project'),
          title: normText(row?.title || row?.name || row?.label || row?.id || 'Project'),
          href: normText(row?.href || row?.url || ''),
          source: normText(row?.source || 'projects'),
        })).filter((row) => row.id || row.href || row.title);
      } catch (e) {
        err('projects:list', e);
        return [];
      }
    }

    async function safeLoadCategoryGroups(upsert) {
      const api = categoriesApi();
      if (!api) return [];
      try {
        const maybe = api.loadGroups?.();
        const groups = Array.isArray(maybe) ? maybe : (await maybe || []);
        return (Array.isArray(groups) ? groups : []).map((group) => ({
          id: normText(group?.id || ''),
          name: normText(group?.name || group?.label || group?.id || 'Category'),
          color: normText(group?.color || ''),
          sortOrder: Number.isFinite(Number(group?.sortOrder)) ? Number(group.sortOrder) : 9999,
          rows: Array.isArray(group?.rows) ? group.rows.slice() : [],
          source: 'categories',
        })).filter((group) => group.id || group.name);
      } catch (e) {
        err('categories:loadGroups', e);
        return [];
      }
    }

    function safeListLabels(api = labelsApi()) {
      if (!api) return [];
      try {
        const types = typeof api.listTypes === 'function' ? api.listTypes() : [];
        const typeByKey = new Map((Array.isArray(types) ? types : []).map((row) => [String(row?.key || ''), row]));
        const catalog = typeof api.listCatalog === 'function' ? api.listCatalog() : {};
        const counts = typeof api.getLabelCounts === 'function' ? api.getLabelCounts() : {};
        const out = [];
        Object.keys(catalog || {}).forEach((type) => {
          const typeDef = typeByKey.get(type) || { key: type, label: type, fullLabel: type, cardinality: '' };
          (Array.isArray(catalog[type]) ? catalog[type] : []).forEach((record) => {
            const id = normText(record?.id || '');
            const label = normText(record?.label || record?.name || id || 'Label');
            out.push({
              key: `${type}:${id}`,
              id,
              label,
              name: label,
              type,
              typeLabel: normText(typeDef.fullLabel || typeDef.label || type),
              cardinality: normText(typeDef.cardinality || ''),
              color: normText(record?.color || ''),
              count: Number(counts?.[type]?.[id] || 0) || 0,
              source: 'labels',
            });
          });
        });
        return out;
      } catch (e) {
        err('labels:list', e);
        return [];
      }
    }

    function safeListLabelKnownChats(api = labelsApi()) {
      if (!api || typeof api.listKnownChats !== 'function') return [];
      try {
        const rows = api.listKnownChats();
        return Array.isArray(rows) ? rows : [];
      } catch (e) {
        err('labels:listKnownChats', e);
        return [];
      }
    }

    function enrichWithFolders(chats, folders) {
      const api = foldersApi();
      const byId = new Map((Array.isArray(folders) ? folders : []).map((folder) => [String(folder.id || ''), folder]));
      chats.forEach((chat) => {
        const binding = safeGetFolderBinding(api, chat.chatId || chat.href) || safeGetFolderBinding(api, chat.href || chat.chatId);
        if (!binding) return;
        const record = byId.get(binding.id) || binding;
        chat.folderIds = uniqueStrings([...(chat.folderIds || []), binding.id || record.id]);
        chat.folderNames = uniqueStrings([...(chat.folderNames || []), binding.name || record.name]);
      });
    }

    function enrichWithCategories(chats, groups) {
      const byChat = new Map();
      (Array.isArray(groups) ? groups : []).forEach((group) => {
        (Array.isArray(group?.rows) ? group.rows : []).forEach((row) => {
          const chatId = normalizeChatId(row?.chatId || row?.href || row?.url || '');
          const href = normText(row?.href || row?.url || '');
          const keys = uniqueStrings([chatId, href]);
          keys.forEach((key) => {
            if (!key) return;
            const arr = byChat.get(key) || [];
            if (!arr.some((item) => item.id === group.id)) arr.push({ id: group.id, name: group.name, label: group.name, color: group.color });
            byChat.set(key, arr);
          });
        });
      });
      chats.forEach((chat) => {
        const cats = [...(byChat.get(chat.chatId) || []), ...(byChat.get(chat.href) || [])];
        chat.categories = mergeObjectsById(chat.categories, cats, ['id'], ['name', 'label']);
      });
    }

    function enrichWithLabels(chats, api, labelCatalog) {
      if (!api) return;
      const catalogByKey = new Map((Array.isArray(labelCatalog) ? labelCatalog : []).map((row) => [`${row.type}:${row.id}`, row]));
      chats.forEach((chat) => {
        const chatId = chat.chatId;
        if (!chatId) return;
        let labels = [];
        try {
          const flat = typeof api.flattenChatLabels === 'function' ? api.flattenChatLabels(chatId) : [];
          if (Array.isArray(flat) && flat.length) {
            labels = flat.map((item) => {
              const type = normText(item?.type || '');
              const id = normText(item?.id || item?.label || '');
              const catalog = catalogByKey.get(`${type}:${id}`) || null;
              const label = normText(item?.label || catalog?.label || id);
              return { key: `${type}:${id}`, id, label, name: label, type, typeLabel: normText(item?.typeLabel || catalog?.typeLabel || type), color: normText(item?.color || catalog?.color || '') };
            }).filter((item) => item.id || item.label);
          } else if (typeof api.getChatLabels === 'function') {
            const row = api.getChatLabels(chatId) || {};
            Object.keys(row || {}).forEach((type) => {
              const values = Array.isArray(row[type]) ? row[type] : (row[type] ? [row[type]] : []);
              values.forEach((idRaw) => {
                const id = normText(idRaw);
                const catalog = catalogByKey.get(`${type}:${id}`) || null;
                const label = normText(catalog?.label || id);
                if (!id && !label) return;
                labels.push({ key: `${type}:${id}`, id, label, name: label, type, typeLabel: normText(catalog?.typeLabel || type), color: normText(catalog?.color || '') });
              });
            });
          }
        } catch (e) {
          err(`labels:chat:${chatId}`, e);
        }
        chat.labels = mergeObjectsById(chat.labels, labels, ['key', 'id'], ['label', 'name']);
      });
    }

    function enrichWithTags(chats, api) {
      chats.forEach((chat) => {
        const chatId = chat.chatId;
        const tags = [];
        const keywords = [];
        if (Array.isArray(chat.tagCatalog)) tags.push(...chat.tagCatalog);
        if (Array.isArray(chat.tags)) tags.push(...chat.tags);
        if (Array.isArray(chat.keywords)) keywords.push(...chat.keywords);
        if (api && chatId) {
          try {
            const summary = typeof api.getChatSummary === 'function' ? api.getChatSummary(chatId) : null;
            if (Array.isArray(summary?.tags)) tags.push(...summary.tags.map((label) => ({ id: slug(label), label })));
            if (Array.isArray(summary?.tagCatalog)) tags.push(...summary.tagCatalog);
            if (Array.isArray(summary?.keywords)) keywords.push(...summary.keywords);
          } catch {}
          try {
            const catalog = typeof api.getChatTagCatalog === 'function' ? api.getChatTagCatalog(chatId) : [];
            if (Array.isArray(catalog)) tags.push(...catalog);
          } catch {}
        }
        chat.tags = mergeObjectsById(chat.tags, tags.map((tag) => ({
          id: normText(tag?.id || slug(tag?.label || tag?.name || tag)),
          label: normText(tag?.label || tag?.name || tag?.id || tag),
          color: normText(tag?.color || ''),
          usageCount: Number(tag?.usageCount || 0) || 0,
        })), ['id'], ['label', 'name']);
        chat.keywords = uniqueStrings([...(chat.keywords || []), ...keywords]);
      });
    }

    function enrichWithProjects(chats, projects) {
      const projectRows = Array.isArray(projects) ? projects : [];
      const byKey = new Map();
      const putProjectKey = (key, project) => {
        const k = normText(key).toLowerCase();
        if (!k || byKey.has(k)) return;
        byKey.set(k, project);
      };
      projectRows.forEach((project) => {
        putProjectKey(project.id, project);
        putProjectKey(project.projectId, project);
        putProjectKey(project.title, project);
        putProjectKey(project.name, project);
        putProjectKey(parseProjectIdFromHref(project.href), project);
      });
      chats.forEach((chat) => {
        const projectKey = normText(chat.projectId || chat.nativeProjectId || chat.gizmoId || chat.gizmo_id || '');
        const matchById = byKey.get(projectKey.toLowerCase()) || null;
        if (matchById) {
          chat.projectId = chat.projectId || matchById.id || matchById.projectId || projectKey || '';
          chat.projectName = chat.projectName || matchById.title || matchById.name || '';
          return;
        }
        if (chat.projectName || chat.projectId) return;
        const href = normText(chat.href || '');
        if (!href) return;
        const match = projectRows.find((project) => project.href && href.includes(project.href));
        if (!match) return;
        chat.projectId = match.id || '';
        chat.projectName = match.title || match.name || '';
      });
    }

    function finalizeChats(chats) {
      chats.forEach((chat) => {
        chat.sources = mergeSourceArrays(chat.sources || chat.source);
        chat.source = bestSource(chat.sources);
        chat.labelIds = uniqueStrings((chat.labels || []).map((item) => item.key || item.id || item.label));
        chat.labelNames = uniqueStrings((chat.labels || []).map((item) => item.label || item.name || item.id));
        chat.categoryIds = uniqueStrings((chat.categories || []).map((item) => item.id || item.label || item.name));
        chat.categoryNames = uniqueStrings((chat.categories || []).map((item) => item.name || item.label || item.id));
        chat.tagIds = uniqueStrings((chat.tags || []).map((item) => item.id || item.label || item.name));
        chat.tagNames = uniqueStrings((chat.tags || []).map((item) => item.label || item.name || item.id));
        chat.lastInteractionAt = pickNewerDate(chat.lastInteractionAt || chat.lastMessageAt, chat.updatedAt || '');
        chat.answerCount = toNonNegativeInt(chat.answerCount);
        chat.userTurnCount = toNonNegativeInt(chat.userTurnCount);
        chat.turnCount = Math.max(toNonNegativeInt(chat.turnCount), chat.answerCount, chat.userTurnCount);
        chat.folderId = chat.folderIds?.[0] || '';
        chat.folderName = chat.folderNames?.[0] || '';
        chat.labelText = chat.labelNames.join(', ');
        chat.categoryText = chat.categoryNames.join(', ');
        chat.tagText = chat.tagNames.join(', ');
        chat.sourceText = chat.sources.join(', ');
        chat.searchText = uniqueStrings([
          chat.title, chat.chatId, chat.href, chat.sourceText, chat.folderNames.join(' '), chat.labelText,
          chat.categoryText, chat.projectName, chat.tagText, chat.keywords.join(' '),
        ]).join(' ').toLowerCase();
        chat.sortAt = pickNewerDate(chat.lastInteractionAt, pickNewerDate(chat.updatedAt, pickNewerDate(chat.savedAt, pickNewerDate(chat.lastSeenAt, chat.observedAt))));
        chat.dates = {
          createdAt: chat.createdAt || '',
          lastInteractionAt: chat.lastInteractionAt || '',
          updatedAt: chat.updatedAt || '',
          savedAt: chat.savedAt || '',
          lastSeenAt: chat.lastSeenAt || '',
          observedAt: chat.observedAt || '',
          sortAt: chat.sortAt || '',
        };
      });
    }

    // Facet / count / filter / sort / bucket — delegated to shared core.
    // Native and Studio compute byte-identical facets + counts for identical
    // row inputs after Phase 2B.
    function normalizeCategoryList(groups, chats) {
      const c = ixCore();
      return c ? c.normalizeCategoryList(groups, chats) : (Array.isArray(groups) ? groups.slice() : []);
    }
    function collectTagFacets(chats) {
      const c = ixCore();
      return c ? c.collectTagFacets(chats) : [];
    }
    function buildCounts(model) {
      const c = ixCore();
      if (c) return c.buildCounts({ ...(model || {}), lastKnownRegistryCount: state.lastKnownRegistryCount });
      return { knownChats: 0, storedKnownChats: 0, savedChats: 0, recentChats: 0, nativeRecentChats: 0, importedChats: 0, folders: 0, labels: 0, categories: 0, projects: 0, tags: 0, undated: 0, unfiledSaved: 0, unlabeledSaved: 0, uncategorizedSaved: 0 };
    }
    function facetRowsFromMap(map) {
      const c = ixCore();
      return c ? c.facetRowsFromMap(map) : Array.from(map?.values?.() || []);
    }
    function bumpFacet(map, idRaw, labelRaw = idRaw, extra = {}) {
      const c = ixCore();
      if (c) return c.bumpFacet(map, idRaw, labelRaw, extra);
    }
    function buildFacets(chats /* , model */) {
      const c = ixCore();
      return c ? c.buildFacets(chats) : { sources: [], folders: [], labels: [], categories: [], projects: [], tags: [], years: [], months: [] };
    }
    function matchesOne(value, candidates = []) {
      const c = ixCore();
      return c ? c.matchesOne(value, candidates) : true;
    }
    function filterChats(chats, filters = {}) {
      const c = ixCore();
      return c ? c.filterChats(chats, filters) : (Array.isArray(chats) ? chats.slice() : []);
    }
    function sortChats(chats, sort = 'newest', dateField = 'createdAt') {
      const c = ixCore();
      return c ? c.sortChats(chats, sort, dateField) : (Array.isArray(chats) ? chats.slice() : []);
    }
    function bucketKey(value, bucket = 'month') {
      const c = ixCore();
      return c ? c.bucketKey(value, bucket) : '';
    }
    function isoWeekKey(date) {
      const c = ixCore();
      return c ? c.isoWeekKey(date) : '';
    }

    function bucketLabel(key, bucket = 'month') {
      const c = ixCore();
      return c ? c.bucketLabel(key, bucket) : (key || 'Undated');
    }

    function getActiveModel() {
      if (state.model?.ok) return state.model;
      const cached = readCache();
      if (cached?.ok) {
        state.model = cached;
        return cached;
      }
      return buildEmptyModel('no-model');
    }

    function getDateBuckets(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const bucket = String(opts.bucket || opts.groupBy || 'month').toLowerCase();
      const dateField = String(opts.dateField || 'createdAt');
      const rows = listChats(opts.filters || opts, { sort: 'newest', dateField });
      const map = new Map();
      let undated = 0;
      rows.forEach((chat) => {
        const key = bucketKey(readDateField(chat, dateField), bucket);
        if (!key) { undated += 1; return; }
        const item = map.get(key) || { key, label: bucketLabel(key, bucket), count: 0, chatIds: [] };
        item.count += 1;
        item.chatIds.push(chat.chatId || chat.id || chat.href);
        map.set(key, item);
      });
      const out = Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
      if (undated) out.push({ key: 'undated', label: 'Undated', count: undated, chatIds: [] });
      return out;
    }

    function getStats(options = {}) {
      const opts = options && typeof options === 'object' ? options : {};
      const filters = opts.filters || opts;
      const dateField = opts.dateField || 'createdAt';
      const bucket = opts.bucket || opts.groupBy || 'month';
      const chats = listChats(filters, { sort: opts.sort || 'newest', dateField });
      const partialModel = { ...getActiveModel(), chats };
      const facets = buildFacets(chats, partialModel);
      return {
        ok: true,
        generatedAt: Date.now(),
        generatedAtIso: new Date().toISOString(),
        filters,
        dateField,
        bucket,
        counts: {
          knownChats: chats.length,
          savedChats: chats.filter((chat) => chat.isSaved).length,
          recentChats: chats.filter((chat) => chat.isRecent).length,
          nativeRecentChats: chats.filter((chat) => chat.isRecent).length,
          importedChats: chats.filter((chat) => chat.isImported).length,
          undated: chats.filter((chat) => !dateMs(readDateField(chat, dateField))).length,
        },
        dateBuckets: getDateBuckets({ filters, dateField, bucket }),
        sourceDistribution: facets.sources,
        categoryDistribution: facets.categories,
        labelDistribution: facets.labels,
        folderDistribution: facets.folders,
        projectDistribution: facets.projects,
        tagDistribution: facets.tags,
        facets,
      };
    }

    function listChats(filters = {}, options = {}) {
      const model = getActiveModel();
      const rows = filterChats(model.chats || [], filters);
      return sortChats(rows, options.sort || filters.sort || 'newest', options.dateField || filters.dateField || 'createdAt');
    }

    function getChat(chatIdOrHref) {
      const key = normText(chatIdOrHref);
      if (!key) return null;
      const chatId = normalizeChatId(key);
      return (getActiveModel().chats || []).find((chat) => chat.chatId === chatId || chat.href === key || chat.id === key) || null;
    }

    function getFacets(filters = null) {
      if (filters && typeof filters === 'object' && Object.keys(filters).length) {
        return buildFacets(listChats(filters), getActiveModel());
      }
      return getActiveModel().facets || emptyFacets();
    }

    function readPrefs() {
      const raw = storage.getJSON(KEY_PREFS_V1, null);
      const src = raw && typeof raw === 'object' ? raw : {};
      return {
        autoRefresh: src.autoRefresh !== false,
        refreshDebounceMs: clampInt(src.refreshDebounceMs, 150, 8000, 900),
        cacheTtlMs: clampInt(src.cacheTtlMs, 0, 24 * 60 * 60 * 1000, 10 * 60 * 1000),
        defaultBucket: ['day', 'week', 'month', 'year'].includes(src.defaultBucket) ? src.defaultBucket : 'month',
        defaultDateField: ['createdAt', 'lastInteractionAt', 'savedAt', 'updatedAt', 'lastSeenAt', 'observedAt', 'sortAt'].includes(src.defaultDateField) ? src.defaultDateField : 'createdAt',
      };
    }

    function writePrefs(patch = {}) {
      const next = { ...readPrefs(), ...(patch && typeof patch === 'object' ? patch : {}), updatedAt: Date.now() };
      storage.setJSON(KEY_PREFS_V1, next);
      return readPrefs();
    }

    function clampInt(v, min, max, fallback) {
      const n = Number.parseInt(String(v ?? ''), 10);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    }

    function writeCache(model) {
      const safe = sanitizeForCache(model);
      return storage.setJSON(KEY_CACHE_V1, safe);
    }

    function sanitizeForCache(model) {
      const src = model && typeof model === 'object' ? model : buildEmptyModel('cache-empty');
      return {
        ...src,
        cacheWrittenAt: Date.now(),
      };
    }

    function readCache() {
      const cached = storage.getJSON(KEY_CACHE_V1, null);
      if (!cached || typeof cached !== 'object' || cached.version !== 1) return null;
      return cached;
    }

    function isCacheFresh(model = readCache()) {
      if (!model?.cacheWrittenAt) return false;
      const ttl = readPrefs().cacheTtlMs;
      if (!ttl) return true;
      return Date.now() - Number(model.cacheWrittenAt || 0) <= ttl;
    }

    async function refresh(reason = 'api', opts = {}) {
      if (state.refreshPromise && opts.force !== true) return state.refreshPromise;
      state.refreshPromise = Promise.resolve().then(async () => {
        step('refresh:start', reason);
        await retryLibraryStoreMigration(`refresh:${reason}`);
        const model = await buildModel(reason);
        state.model = model;
        state.lastRefreshAt = Date.now();
        const registryPayload = persistKnownChatRegistryFromModel(model, reason);
        const storedKnownChats = Array.isArray(registryPayload?.rows)
          ? registryPayload.rows.length
          : (Number(state.lastKnownRegistryCount || 0) || 0);
        if (storedKnownChats) {
          model.counts = model.counts || {};
          model.counts.storedKnownChats = storedKnownChats;
          model.counts.knownChats = Math.max(Number(model.counts.knownChats || 0) || 0, storedKnownChats);
          model.counts.allChats = Math.max(Number(model.counts.allChats || 0) || 0, storedKnownChats);
        }
        await flushDurabilityNow(`refresh:${reason}`);
        writeCache(model);
        dispatchUpdated(reason, model);
        step('refresh:done', `${model.counts.knownChats} known / ${model.durationMs}ms`);
        return model;
      }).catch((e) => {
        err('refresh', e);
        const fallback = readCache() || buildEmptyModel('refresh-error');
        fallback.ok = false;
        fallback.error = String(e?.message || e || 'refresh failed');
        state.model = fallback;
        return fallback;
      }).finally(() => {
        state.refreshPromise = null;
      });
      return state.refreshPromise;
    }

    function scheduleRefresh(reason = 'schedule') {
      if (!readPrefs().autoRefresh) return false;
      const delay = readPrefs().refreshDebounceMs;
      if (state.scheduledRefreshTimer) {
        try { W.clearTimeout(state.scheduledRefreshTimer); } catch {}
        state.clean.timers.delete(state.scheduledRefreshTimer);
      }
      state.scheduledRefreshTimer = W.setTimeout(() => {
        state.clean.timers.delete(state.scheduledRefreshTimer);
        state.scheduledRefreshTimer = 0;
        refresh(reason).catch((e) => err(`scheduled-refresh:${reason}`, e));
      }, delay);
      state.clean.timers.add(state.scheduledRefreshTimer);
      evt('refresh:scheduled', reason);
      return true;
    }

    function clearCache() {
      storage.del(KEY_CACHE_V1);
      state.model = null;
      return true;
    }

    function dispatchUpdated(reason, model) {
      try {
        W.dispatchEvent(new CustomEvent(EV_UPDATED, {
          detail: {
            reason,
            counts: model?.counts || null,
            builtAt: model?.builtAt || Date.now(),
            durationMs: model?.durationMs || 0,
          },
        }));
      } catch {}
    }

    function bindEventsOnce() {
      if (state.listenersBound) return;
      state.listenersBound = true;
      const bind = (target, name, fn, opts = true) => {
        try {
          target.addEventListener(name, fn, opts);
          state.clean.listeners.add(() => target.removeEventListener(name, fn, opts));
        } catch {}
      };

      bind(W, EV_REFRESH_REQUEST, () => scheduleRefresh('event:refresh-request'), true);
      bind(W, 'evt:h2o:labels:changed', () => scheduleRefresh('event:labels-changed'), true);
      bind(W, 'evt:h2o:labels:assigned', () => scheduleRefresh('event:labels-assigned'), true);
      bind(W, 'evt:h2o:tags:changed', () => scheduleRefresh('event:tags-changed'), true);
      bind(W, 'evt:h2o:tags:chat-analyzed', () => scheduleRefresh('event:tags-analyzed'), true);
      bind(W, 'evt:h2o:folders:changed', () => scheduleRefresh('event:folders-changed'), true);
      bind(W, 'evt:h2o:projects:changed', () => scheduleRefresh('event:projects-changed'), true);
      bind(W, 'evt:h2o:projects:refreshed', () => scheduleRefresh('event:projects-refreshed'), true);
      bind(W, 'evt:h2o:core:index:updated', () => scheduleRefresh('event:core-index-updated'), true);
      bind(W, 'popstate', () => scheduleRefresh('event:popstate'), true);
      bind(W, 'hashchange', () => scheduleRefresh('event:hashchange'), true);
      bind(W, 'evt:h2o:library:store:tier-promoted', () => { retryLibraryStoreMigration('event:store-tier-promoted').catch((e) => err('migration:retry:store-tier-promoted', e)); }, true);
      bind(W, 'h2o:library:store:tier-promoted', () => { retryLibraryStoreMigration('event:store-tier-promoted').catch((e) => err('migration:retry:store-tier-promoted', e)); }, true);
      bind(W, 'evt:h2o:library:store:ready', () => { retryLibraryStoreMigration('event:store-ready').catch((e) => err('migration:retry:store-ready', e)); }, true);
      bind(W, 'h2o:library:store:ready', () => { retryLibraryStoreMigration('event:store-ready').catch((e) => err('migration:retry:store-ready', e)); }, true);

      // Phase 2E — Chat Registry change listener with debounce + loop guard.
      // The registry fires evt:h2o:chat-registry:changed (with a legacy h2o:chat-registry:changed
      // mirror) on every meaningful mutation. We schedule a debounced Library Index refresh
      // when the change came from anywhere else (an open-chat enrichment, an external
      // upsert, a future seed from another tab). Guards:
      //   - source === 'library-index': skip — the change is our own mirrored seed/upsert.
      //   - source === 'recents' while a refresh is already in flight: skip — the same scan
      //     that produced the recents mirror is already going to refresh.
      const onChatRegistryChanged = (e) => {
        try {
          const detail = e?.detail || {};
          const sourceLabel = String(detail.source || '').toLowerCase();
          if (sourceLabel === 'library-index') return;
          if (sourceLabel === 'recents' && state.refreshPromise) return;
          if (state.chatRegistryRefreshTimer) {
            try { W.clearTimeout(state.chatRegistryRefreshTimer); } catch {}
            state.clean.timers.delete(state.chatRegistryRefreshTimer);
            state.chatRegistryRefreshTimer = 0;
          }
          state.chatRegistryRefreshTimer = W.setTimeout(() => {
            const t = state.chatRegistryRefreshTimer;
            state.chatRegistryRefreshTimer = 0;
            state.clean.timers.delete(t);
            state.chatRegistrySync.lastRegistryEventAt = Date.now();
            state.chatRegistrySync.lastRegistryEventSource = sourceLabel;
            state.chatRegistrySync.lastRegistryEventDebouncedRefreshAt = Date.now();
            scheduleRefresh(`event:chat-registry-changed:${sourceLabel || 'unknown'}`);
          }, 180);
          state.clean.timers.add(state.chatRegistryRefreshTimer);
        } catch (er) { err('chat-registry:on-changed', er); }
      };
      bind(W, 'evt:h2o:chat-registry:changed', onChatRegistryChanged, true);
      bind(W, 'h2o:chat-registry:changed', onChatRegistryChanged, true);
      bind(W, 'focus', () => {
        scheduleEnsureSidebarRecentsMonitor('focus');
        scheduleSidebarRecentsScan('focus', 0);
        scheduleSidebarProjectChatsScan('focus', 0);
      }, true);
      bind(W, 'storage', (event) => {
        const key = String(event?.key || '');
        if (/h2o:prm:cgx:(labels|fldrs|tags|library|library-index)|h2o:folders/i.test(key) || /\/conversation-history$/i.test(key)) {
          scheduleRefresh(`storage:${key.slice(0, 48)}`);
        }
      }, true);

      const timer = W.setTimeout(() => {
        state.clean.timers.delete(timer);
        retryLibraryStoreMigration('bind:initial-check').catch((e) => err('migration:retry:bind-initial-check', e));
        ensureSidebarRecentsMonitor('bind-initial-check');
        scheduleSidebarRecentsScan('bind-initial-check', 0, { force: true });
        scheduleSidebarProjectChatsScan('bind-initial-check', 0, { force: true });
      }, 0);
      state.clean.timers.add(timer);
    }

    function registerWithCore() {
      const core = coreNow();
      if (!core) return false;
      try {
        core.registerOwner?.('library-index', owner, { replace: true });
        core.registerService?.('library-index', owner, { replace: true });
        core.registerView?.('library-index', owner, { replace: true });
        step('registered-with-library-core');
        return true;
      } catch (e) {
        err('register-with-core', e);
        return false;
      }
    }

    function selfCheck() {
      const core = coreNow();
      const model = getActiveModel();
      return {
        ok: !!core?.getOwner?.('library-index') && !!core?.getService?.('library-index'),
        hasCore: !!core,
        registeredOwner: !!core?.getOwner?.('library-index'),
        registeredService: !!core?.getService?.('library-index'),
        registeredView: !!core?.getView?.('library-index'),
        modelReady: !!state.model?.ok,
        cacheReady: !!readCache(),
        cacheFresh: isCacheFresh(),
        refreshRunning: !!state.refreshPromise,
        lastRefreshAt: state.lastRefreshAt,
        sourceStatus: sourceStatus(),
        counts: model?.counts || null,
        registryReady: !!readKnownChatRegistry()?.rows?.length,
        registryCount: Array.isArray(readKnownChatRegistry()?.rows) ? readKnownChatRegistry().rows.length : 0,
        chatRegistrySync: getChatRegistrySyncStatus(),
        storageKeys: { cache: KEY_CACHE_V1, knownRegistry: KEY_KNOWN_REGISTRY_V1, prefs: KEY_PREFS_V1 },
        prefs: readPrefs(),
        bootDiag: H2O.LibraryIndexBootDiag || null,
        diag: {
          steps: diag.steps.slice(-14),
          events: diag.events.slice(-10),
          errors: diag.errors.slice(-10),
        },
      };
    }

    const owner = {
      phase: 'phase-1-index-foundation',
      refresh(reason = 'api', opts = {}) { return refresh(reason, opts); },
      scheduleRefresh(reason = 'api') { return scheduleRefresh(reason); },
      getModel(opts = {}) {
        const cached = getActiveModel();
        if (opts.refresh === true) return refresh('getModel:refresh', { force: opts.force === true });
        return cached;
      },
      buildModel(reason = 'api') { return buildModel(reason); },
      listChats(filters = {}, options = {}) { return listChats(filters, options); },
      getChat(chatIdOrHref) { return getChat(chatIdOrHref); },
      getFacets(filters = null) { return getFacets(filters); },
      getStats(options = {}) { return getStats(options); },
      getDateBuckets(options = {}) { return getDateBuckets(options); },
      getSourceStatus() { return sourceStatus(); },
      getPrefs() { return readPrefs(); },
      setPrefs(patch = {}) { return writePrefs(patch); },
      clearCache() { return clearCache(); },
      resetCache() { return clearCache(); },
      readKnownChatRegistry() { return readKnownChatRegistry(); },
      clearKnownChatRegistry() { return clearKnownChatRegistry(); },
      registerKnownChats(rows, opts = {}) { return registerKnownChats(rows, opts); },
      // Phase 2: durability/migration diagnostics. Read-only.
      getMigrationStatus() { return getMigrationStatus(); },
      // Phase 3: scan batch ledger API. begin/commit are public so external code (e.g., a
      // future "Force re-scan" repair command) can drive scans without going through the
      // normal refresh path. list/last/stats/vanished are read-only diagnostics.
      beginScanBatch(opts = {}) { return beginScanBatch(opts); },
      commitScanBatch(batchId, opts = {}) { return commitScanBatch(batchId, opts); },
      listScanBatches(opts = {}) { return listScanBatches(opts); },
      getLastScanBatch() { return getLastScanBatch(); },
      getDurabilityStats() { return getDurabilityStats(); },
      findVanishedSince(iso) { return findVanishedSince(iso); },
      readCache() { return readCache(); },
      isCacheFresh() { return isCacheFresh(); },
      listNativeRecentChats(options = null) { return listNativeRecentChats(options); },
      scanSidebarRecents(reason = 'api', opts = {}) { return scanSidebarRecentsNow(reason, opts); },
      scanSidebarProjectChats(reason = 'api', opts = {}) { return scanSidebarProjectChatsNow(reason, opts); },
      // Phase 2 (Chat Registry integration) — soft, additive helpers.
      seedChatRegistryFromKnownRegistry(reason = 'manual') { return seedChatRegistryFromKnownRegistry(reason); },
      mirrorSidebarRecentsToChatRegistry(rows, observedAt) { return mirrorSidebarRecentsToChatRegistry(rows, observedAt); },
      getChatRegistrySyncStatus() { return getChatRegistrySyncStatus(); },
      selfCheck() { return selfCheck(); },
    };

    function exposePublicApi() {
      MOD.owner = owner;
      Object.keys(owner).forEach((key) => {
        if (typeof owner[key] === 'function') MOD[key] = (...args) => owner[key](...args);
      });
      MOD.constants = Object.freeze({
        KEY_CACHE_V1,
        KEY_KNOWN_REGISTRY_V1,
        KEY_PREFS_V1,
        // Phase 2: durable Library Store key + migration event. Existing consumers that read
        // KEY_KNOWN_REGISTRY_V1 keep working; new consumers can target KEY_REGISTRY_V2.
        KEY_REGISTRY_V2,
        NS_LIBRARY_STORE,
        REGISTRY_BATCH_HISTORY_LIMIT,
        // Phase 3: scan ledger key + batch cap + commit event.
        KEY_SCAN_LEDGER_V1,
        SCAN_LEDGER_BATCH_LIMIT,
        EV_UPDATED,
        EV_REFRESH_REQUEST,
        EV_REGISTRY_MIGRATED,
        EV_SCAN_BATCH_COMMITTED,
        TOK,
        PID,
        SkID,
      });
    }

    function boot() {
      if (state.booted) return;
      state.booted = true;
      exposePublicApi();
      registerWithCore();
      bindEventsOnce();

      // Phase 2: kick off the Library Store migration. Fire-and-forget — the boot path
      // continues against legacy v1 storage until migration publishes the in-memory v2
      // cache. Any seed/refresh writes during the window land in v1 and are picked up by
      // the v1 read inside setupLibraryStoreMigration. After publication, all subsequent
      // writes route through the v2 cache + bridge KV.
      setupLibraryStoreMigration().catch((e) => err('boot:migration', e));

      const cached = readCache();
      if (cached?.ok) {
        state.model = cached;
        seedKnownChatRegistryFromModel(cached, 'boot-cache-seed');
      }
      if (!cached || !isCacheFresh(cached)) scheduleRefresh('boot');
      else step('boot:using-fresh-cache', `${cached.counts?.knownChats || 0} known`);
      ensureSidebarRecentsMonitor('boot');
      scheduleSidebarRecentsScan('boot', 0, { force: true });
      scheduleSidebarProjectChatsScan('boot', 0, { force: true });

      // Register again shortly after boot because some 0F modules may register late.
      const late = W.setTimeout(() => {
        state.clean.timers.delete(late);
        registerWithCore();
        ensureSidebarRecentsMonitor('late-boot');
        scheduleSidebarRecentsScan('late-boot');
        scheduleSidebarProjectChatsScan('late-boot');
        if (!state.model?.ok) scheduleRefresh('late-boot');
      }, 900);
      state.clean.timers.add(late);

      step('booted');
    }

    boot();
  }

  bootWhenLibraryCoreReady();
})();
