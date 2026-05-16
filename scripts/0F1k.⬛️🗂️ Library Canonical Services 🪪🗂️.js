// ==H2O Module==
// @h2o-id             0f1k.library_canonical_services
// @name               0F1k.⬛️🗂️ Library Canonical Services 🪪🗂️
// @namespace          H2O.Premium.CGX.library_canonical_services
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260515-000001
// @description        Phase 1 of the Library migration: registers the 14 canonical service names (storage, registry, index, archive, native-link-opener, current-chat-provider, project-provider, folder-provider, category-provider, label-provider, tag-provider, event-bus, sync-bridge, archive-bridge) on H2O.LibraryCore as thin aliases over existing implementations. Adds H2O.LibraryCore.listCanonicalServices() and getCanonicalServiceStatus() diagnostics, plus the minimal H2O.flags registry. Strictly additive — no feature module is changed, no record shape touched, no storage migrated, no behavior gated by a flag.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/H2O Module==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ 0F1k Library Canonical Services (native)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const VERSION = '1.0.0';
  const SURFACE = 'native';
  const TAG = '[H2O.LibraryCanonicalServices]';

  // ── Diagnostics buffers ────────────────────────────────────────────────────
  const diag = {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 80,
    errMax: 20,
  };
  const step = (s, o = '') => {
    try {
      diag.steps.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const err = (s, e) => {
    try {
      diag.errors.push({ t: Math.round(performance.now() - diag.t0), s: String(s || ''), e: String(e?.stack || e?.message || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  // ── Canonical service names ────────────────────────────────────────────────
  // The Phase 1 contract: every surface must expose these names through
  // LibraryCore.getService(name). The values may be (a) the canonical existing
  // implementation, (b) a thin alias wrapping the existing global, or (c) a
  // documented no-op placeholder when the surface can't provide it.
  //
  // This is a names-only contract. Phase 2 starts moving call sites; Phase 1
  // does NOT rewrite any caller.
  const CANONICAL_SERVICES = Object.freeze([
    'storage',
    'registry',
    'index',
    'archive',
    'native-link-opener',
    'current-chat-provider',
    'project-provider',
    'folder-provider',
    'category-provider',
    'label-provider',
    'tag-provider',
    'event-bus',
    'sync-bridge',
    'archive-bridge',
  ]);

  function placeholder(name, reason) {
    return Object.freeze({
      __placeholder: true,
      __canonicalName: name,
      __surface: SURFACE,
      unsupported: true,
      reason: String(reason || 'unsupported-on-this-surface'),
      diagnose() { return { name, surface: SURFACE, unsupported: true, reason }; },
    });
  }

  // ── Native-link-opener adapter ─────────────────────────────────────────────
  // Wraps window.open with a tiny shape contract. Phase 1 intentionally keeps
  // this minimal — Phase 7 (Actions consolidation) will widen the contract.
  const nativeLinkOpener = Object.freeze({
    __canonicalName: 'native-link-opener',
    __surface: SURFACE,
    open(url, opts = {}) {
      const target = (opts && opts.target) || '_blank';
      const features = (opts && opts.features) || 'noopener,noreferrer';
      try {
        return W.open(String(url || ''), target, features);
      } catch (e) {
        err('native-link-opener.open', e);
        return null;
      }
    },
    diagnose() { return { name: 'native-link-opener', surface: SURFACE, ok: true }; },
  });

  // ── Current-chat provider ──────────────────────────────────────────────────
  // Reads from window.location.href; uses ChatRegistry.parseChatIdFromHref when
  // available. Returns empty strings (never null/undefined) when no chat is
  // active so callers can safely string-check.
  const currentChatProvider = Object.freeze({
    __canonicalName: 'current-chat-provider',
    __surface: SURFACE,
    getCurrentChatHref() {
      try {
        const href = String(W.location?.href || '');
        if (/^https?:\/\/chatgpt\.com\//i.test(href)) return href;
      } catch {}
      return '';
    },
    getCurrentChatId() {
      const href = this.getCurrentChatHref();
      if (!href) return '';
      const reg = H2O.ChatRegistry;
      const parse = reg && typeof reg.parseChatIdFromHref === 'function' ? reg.parseChatIdFromHref : null;
      try { return parse ? (parse(href) || '') : ''; } catch (e) { err('current-chat-provider.parse', e); return ''; }
    },
    diagnose() {
      return {
        name: 'current-chat-provider',
        surface: SURFACE,
        hasRegistry: !!H2O.ChatRegistry,
        chatId: this.getCurrentChatId(),
        href: this.getCurrentChatHref(),
      };
    },
  });

  // ── Resolver: maps a canonical name to its surface impl (or placeholder) ───
  // Resolution is done at call time, not at boot, so late-loaded modules
  // (e.g., H2O.Projects after the projects-fetch intercept) still alias
  // correctly.
  function resolveCanonical(name) {
    switch (name) {
      case 'storage': {
        const s = H2O.Library?.Store;
        return s || placeholder('storage', 'H2O.Library.Store not available — load 0F1e');
      }
      case 'registry': {
        const r = H2O.ChatRegistry;
        return r || placeholder('registry', 'H2O.ChatRegistry not available — load 0F1g');
      }
      case 'index': {
        const i = H2O.LibraryIndex;
        return i || placeholder('index', 'H2O.LibraryIndex not available — load 0F1c');
      }
      case 'archive': {
        // 0D3a registers as H2O.archiveBoot. Older builds also kept H2O.archive
        // as a back-compat namespace. Prefer the canonical one.
        const a = H2O.archiveBoot || H2O.archive;
        return a || placeholder('archive', 'H2O.archiveBoot / H2O.archive not available — load 0D3a');
      }
      case 'native-link-opener':   return nativeLinkOpener;
      case 'current-chat-provider': return currentChatProvider;
      case 'project-provider': {
        const p = H2O.Projects;
        return p || placeholder('project-provider', 'H2O.Projects not available — load 0F2a');
      }
      case 'folder-provider': {
        const f = H2O.folders;
        return f || placeholder('folder-provider', 'H2O.folders not available — load 0F3a');
      }
      case 'category-provider': {
        const c = H2O.Categories;
        return c || placeholder('category-provider', 'H2O.Categories not available — load 0F4a');
      }
      case 'label-provider': {
        const l = H2O.Labels;
        return l || placeholder('label-provider', 'H2O.Labels not available — load 0F6a');
      }
      case 'tag-provider': {
        const t = H2O.Tags;
        return t || placeholder('tag-provider', 'H2O.Tags not available — load 0F5a');
      }
      case 'event-bus': {
        const e = H2O.events;
        return e || placeholder('event-bus', 'H2O.events not available — load 0A1a H2O Core');
      }
      case 'sync-bridge': {
        const s = H2O.Library?.Sync;
        return s || placeholder('sync-bridge', 'H2O.Library.Sync not available — load 0F1h');
      }
      case 'archive-bridge': {
        // Native has direct in-page access to the archive engine, so the
        // bridge concept is Studio-only. We expose a placeholder rather than
        // omit the name so the canonical list is symmetric.
        return placeholder('archive-bridge', 'native-has-direct-archive-access');
      }
      default:
        return placeholder(name, 'unknown-canonical-service-name');
    }
  }

  function isPlaceholder(value) {
    return !!(value && typeof value === 'object' && value.__placeholder === true);
  }

  // ── Phase 8A storage adapter contract diagnostics ─────────────────────────
  const STORAGE_ADAPTER_PHASE = '8A';
  const STORAGE_BACKGROUND_DIAG_OP = 'h2o:library-storage:diagnose';
  const STORAGE_ARCHIVE_MSG = 'h2o-ext-archive:v1';
  const SHARED_IDB_TARGET = 'IndexedDB:h2o.library.shared';
  const STORAGE_ADAPTER_DOMAINS = Object.freeze([
    {
      name: 'chatRegistry',
      currentOwner: 'native-chat-registry',
      currentRoot: 'chatgpt.com localStorage',
      currentRoots: ['h2o:library:chat-registry:v1'],
      targetOwner: 'extension-background-service-worker',
      targetRoot: SHARED_IDB_TARGET,
      migrationPriority: 'high',
      migrate: 'later',
      sourcePriority: ['native localStorage registry', 'Studio mirror registry', 'future SW-IDB'],
      readCompatibility: ['legacy localStorage', 'Studio registry cache', 'future storage adapter'],
      writeCompatibility: ['legacy native writer until migration flag is enabled'],
      rollback: ['turn migration flag off', 'read legacy localStorage key'],
    },
    {
      name: 'libraryIndex',
      currentOwner: 'surface-library-index',
      currentRoot: 'Library Store plus archive/registry projections',
      currentRoots: ['h2o:prm:cgx:library:registry:v2', 'h2o:prm:cgx:library:scan-ledger'],
      targetOwner: 'derived-cache',
      targetRoot: 'rebuild from canonical records plus per-surface cache',
      migrationPriority: 'medium',
      migrate: 'later-cache-only',
      sourcePriority: ['archive rows', 'chat registry rows', 'linked record broadcast', 'future SW-IDB cache'],
      readCompatibility: ['legacy LibraryIndex refresh', 'future cache rebuild'],
      writeCompatibility: ['no direct canonical writes'],
      rollback: ['rebuild from legacy registry/archive sources'],
    },
    {
      name: 'folders',
      currentOwner: 'native-folders/archive-bridge',
      currentRoot: 'folder vault localStorage/archive metadata',
      currentRoots: [
        'h2o:prm:cgx:fldrs:state:data:v1',
        'h2o:folders:data:v1',
        'h2o:folders:v1',
      ],
      targetOwner: 'extension-background-service-worker',
      targetRoot: SHARED_IDB_TARGET,
      migrationPriority: 'high',
      migrate: 'later',
      sourcePriority: ['native folder vault', 'archive snapshot metadata', 'Studio bridge cache', 'future SW-IDB'],
      readCompatibility: ['FolderProviderCore normalizers', 'legacy folder vault', 'archive bridge'],
      writeCompatibility: ['legacy native/archive writers until migration flag is enabled'],
      rollback: ['turn migration flag off', 'legacy folder keys remain readable'],
    },
    {
      name: 'categories',
      currentOwner: 'native-categories/archive-bridge',
      currentRoot: 'archive category catalog plus Store candidate/override keys',
      currentRoots: [
        'h2o:prm:cgx:library:cat-candidate-pool:v1',
        'h2o:prm:cgx:library:category-overrides:v1',
        'h2o:prm:cgx:library:autoclass-prefs:v1',
      ],
      targetOwner: 'extension-background-service-worker',
      targetRoot: SHARED_IDB_TARGET,
      migrationPriority: 'high',
      migrate: 'later',
      sourcePriority: ['archive category catalog', 'snapshot metadata', 'candidate/override Store keys', 'future SW-IDB'],
      readCompatibility: ['CategoryProviderCore normalizers', 'archive bridge', 'legacy Store keys'],
      writeCompatibility: ['legacy category writers until migration flag is enabled'],
      rollback: ['turn migration flag off', 'legacy archive/category keys remain readable'],
    },
    {
      name: 'tags',
      currentOwner: 'native-tags',
      currentRoot: 'native turn/chat localStorage plus Library Store indexes',
      currentRoots: [
        'h2o:prm:cgx:tags:turn-cache:v2',
        'h2o:prm:cgx:tags:chat-cache:v2',
        'h2o:prm:cgx:tags:tag-pool:v2',
        'h2o:prm:cgx:library:tag-auto-pool:v1',
        'h2o:prm:cgx:library:tag-user-pool:v1',
        'h2o:prm:cgx:library:tag-category-links:v1',
      ],
      targetOwner: 'mixed-native-and-background',
      targetRoot: 'native live turn state plus selected SW-IDB catalogs/bindings',
      migrationPriority: 'medium',
      migrate: 'later-partial',
      sourcePriority: ['native turn DOM/cache', 'tag occurrence Store keys', 'LibraryIndex row facets', 'future SW-IDB'],
      readCompatibility: ['TagProviderCore normalizers', 'legacy tag caches', 'future shared catalogs'],
      writeCompatibility: ['native turn/tag writers stay owner for live DOM-derived state'],
      rollback: ['turn migration flag off', 'legacy native tag keys remain readable'],
    },
    {
      name: 'labels',
      currentOwner: 'native-labels/archive-bridge',
      currentRoot: 'native label catalog/bindings plus Studio bridge catalog',
      currentRoots: [
        'h2o:prm:cgx:library:labels:catalog:v1',
        'h2o:prm:cgx:library:labels:bindings:v1',
        'h2o:prm:cgx:library:labels:ui:v1',
        'h2o:prm:cgx:library:labels:cfg:v1',
      ],
      targetOwner: 'extension-background-service-worker',
      targetRoot: SHARED_IDB_TARGET,
      migrationPriority: 'high',
      migrate: 'later',
      sourcePriority: ['native label catalog/bindings', 'archive metadata', 'Studio bridge catalog', 'future SW-IDB'],
      readCompatibility: ['LabelProviderCore normalizers', 'legacy label keys', 'archive bridge'],
      writeCompatibility: ['legacy label writers until migration flag is enabled'],
      rollback: ['turn migration flag off', 'legacy label keys remain readable'],
    },
    {
      name: 'projects',
      currentOwner: 'native-projects',
      currentRoot: 'native project cache plus read-only Studio broadcast projection',
      currentRoots: [
        'h2o:prm:cgx:fldrs:state:projects_cache:v1',
        'h2o:prm:cgx:fldrs:state:projects_native_headers:v1',
      ],
      targetOwner: 'extension-background-service-worker',
      targetRoot: SHARED_IDB_TARGET,
      migrationPriority: 'medium',
      migrate: 'later-read-mostly',
      sourcePriority: ['native project cache', 'native broadcast projectCatalog', 'LibraryIndex project facets', 'future SW-IDB'],
      readCompatibility: ['ProjectProviderCore normalizers', 'native cache', 'broadcast catalog'],
      writeCompatibility: ['no Studio write path', 'native project harvesting remains owner'],
      rollback: ['turn migration flag off', 'native project cache remains readable'],
    },
    {
      name: 'archiveRefs',
      currentOwner: 'archive-engine/background',
      currentRoot: 'archive snapshot storage',
      currentRoots: ['h2o_chat_archive IndexedDB', 'archive snapshot metadata'],
      targetOwner: 'archive-engine/background',
      targetRoot: 'archive DB plus future reference indexes',
      migrationPriority: 'low',
      migrate: 'later-after-archive-boundary',
      sourcePriority: ['archive snapshot DB', 'background archive APIs', 'future reference indexes'],
      readCompatibility: ['existing archive bridge'],
      writeCompatibility: ['existing archive engine only'],
      rollback: ['archive DB remains canonical'],
    },
    {
      name: 'syncEnvelopes',
      currentOwner: 'cross-surface-sync',
      currentRoot: 'chrome.storage.local broadcast envelopes',
      currentRoots: [
        'h2o:library:cross-surface:broadcast:v1',
        'h2o:library:cross-surface:broadcast:native:v1',
      ],
      targetOwner: 'cross-surface-sync',
      targetRoot: 'chrome.storage.local broadcast envelopes',
      migrationPriority: 'none',
      migrate: 'never',
      sourcePriority: ['chrome.storage.local broadcast envelope'],
      readCompatibility: ['existing sync diagnostics'],
      writeCompatibility: ['existing sync envelope writers only'],
      rollback: ['clear broadcast envelope only if explicitly requested'],
    },
    {
      name: 'uiPrefs',
      currentOwner: 'surface-ui',
      currentRoot: 'surface-local localStorage/chrome.storage small prefs',
      currentRoots: [
        'h2o:flags:v1',
        'h2o:prm:cgx:fldrs:state:ui:v1',
        'h2o:prm:cgx:library-workspace:sidebar-layout:v1',
      ],
      targetOwner: 'surface-ui',
      targetRoot: 'surface-local hot-path prefs',
      migrationPriority: 'none',
      migrate: 'never-or-later-selective',
      sourcePriority: ['surface localStorage', 'chrome.storage.local small prefs'],
      readCompatibility: ['existing UI pref reads'],
      writeCompatibility: ['existing UI pref writers'],
      rollback: ['surface-local keys remain owner'],
    },
  ]);
  const backgroundHealthState = {
    lastCheckedAt: 0,
    lastTransport: '',
    lastResult: null,
  };

  function safeCall(label, fn, fallback = null) {
    try { return fn(); } catch (e) { err(label, e); return fallback; }
  }

  function compactStoreCaps(caps) {
    const c = (caps && typeof caps === 'object') ? caps : {};
    const adapters = {};
    const rawAdapters = (c.adapters && typeof c.adapters === 'object') ? c.adapters : {};
    Object.keys(rawAdapters).sort().forEach((name) => {
      const a = rawAdapters[name] || {};
      adapters[name] = {
        apiPresent: a.apiPresent === true,
        sentinelOk: a.sentinelOk === true,
        available: a.available === true,
      };
    });
    return {
      ready: c.ready === true,
      runtime: String(c.runtime || ''),
      primary: String(c.primary || ''),
      mirror: c.mirror || null,
      migrationSource: c.migrationSource || null,
      durable: c.durable === true,
      canMigrateLargeLibraryData: c.canMigrateLargeLibraryData === true,
      health: String(c.health || ''),
      adapters,
    };
  }

  function storageCapabilities() {
    const store = H2O.Library?.Store || null;
    const caps = store && typeof store.caps === 'function' ? safeCall('storage-adapter.store.caps', () => store.caps(), null) : null;
    return {
      backgroundServiceWorker: {
        available: !!W.chrome?.runtime?.sendMessage,
        access: 'chrome.runtime.sendMessage',
      },
      indexedDB: {
        available: typeof W.indexedDB !== 'undefined',
        access: 'surface-global',
      },
      chromeStorageLocal: {
        available: !!W.chrome?.storage?.local,
        access: 'extension-api-if-present',
      },
      legacyLocalStorage: {
        available: safeCall('storage-adapter.localStorage.available', () => !!W.localStorage, false) === true,
        access: 'surface-origin',
      },
      libraryStore: {
        available: !!store,
        backend: store && typeof store.backend === 'function' ? safeCall('storage-adapter.store.backend', () => store.backend(), '') : '',
        mirrorBackend: store && typeof store.mirrorBackend === 'function' ? safeCall('storage-adapter.store.mirrorBackend', () => store.mirrorBackend(), null) : null,
        caps: compactStoreCaps(caps),
      },
      plannedCanonicalStore: {
        owner: 'extension-background-service-worker',
        root: SHARED_IDB_TARGET,
        enabled: false,
        phase: STORAGE_ADAPTER_PHASE,
      },
    };
  }

  function flagsForDomain(domain) {
    const flags = H2O.flags;
    const base = `library.storage.${domain}`;
    const read = (suffix) => {
      try { return flags && typeof flags.get === 'function' ? flags.get(`${base}.${suffix}`, false) === true : false; }
      catch (e) { err(`storage-adapter.flag:${domain}:${suffix}`, e); return false; }
    };
    return {
      canonicalReadEnabled: read('canonicalReadEnabled'),
      dualWriteEnabled: read('dualWriteEnabled'),
      migrationEnabled: read('migrationEnabled'),
      legacyReadDisabled: read('legacyReadDisabled'),
    };
  }

  function hasLegacyKey(key) {
    if (!key || /IndexedDB|metadata|archive DB|cross-surface:broadcast/i.test(key)) return null;
    return safeCall(`storage-adapter.localStorage.has:${key}`, () => W.localStorage?.getItem(String(key)) != null, null);
  }

  function domainStatus(domainName) {
    const name = String(domainName || '');
    const cfg = STORAGE_ADAPTER_DOMAINS.find((d) => d.name === name);
    if (!cfg) {
      return {
        ok: false,
        status: 'unknown-domain',
        domain: name,
        knownDomains: STORAGE_ADAPTER_DOMAINS.map((d) => d.name),
      };
    }
    const legacyKeys = {};
    (cfg.currentRoots || []).forEach((key) => { legacyKeys[key] = hasLegacyKey(key); });
    const flags = flagsForDomain(cfg.name);
    const sentinelKey = `h2o:library:storage-migration:${cfg.name}:v1`;
    return {
      ok: true,
      phase: STORAGE_ADAPTER_PHASE,
      mode: 'diagnostics-only',
      domain: cfg.name,
      currentOwner: cfg.currentOwner,
      currentRoot: cfg.currentRoot,
      currentRoots: cfg.currentRoots.slice(),
      targetOwner: cfg.targetOwner,
      targetRoot: cfg.targetRoot,
      migrationPriority: cfg.migrationPriority,
      migrate: cfg.migrate,
      sourcePriority: cfg.sourcePriority.slice(),
      readCompatibility: cfg.readCompatibility.slice(),
      writeCompatibility: cfg.writeCompatibility.slice(),
      rollback: cfg.rollback.slice(),
      flags,
      canonicalEnabled: false,
      migrationSentinel: {
        key: sentinelKey,
        present: hasLegacyKey(sentinelKey) === true,
        writeEnabled: false,
      },
      legacyKeyPresence: legacyKeys,
      parityCounts: {
        available: false,
        source: 'not-collected-in-phase-8a',
        legacy: null,
        canonical: null,
      },
      lastBackend: {
        read: null,
        write: null,
        source: 'not-tracked-in-phase-8a',
      },
    };
  }

  function dualReadBlockers(cfg, flags, legacyKeys) {
    const blockers = [
      'phase-8c-diagnostics-only',
      'canonical-read-flag-disabled',
      'dual-read-execution-not-implemented',
      'parity-counts-not-collected',
      'no-domain-migration-sentinel',
    ];
    if (!cfg || cfg.migrate === 'never' || String(cfg.migrate || '').startsWith('never')) {
      blockers.push('domain-not-planned-for-canonical-migration');
    }
    if (cfg && cfg.targetOwner === 'derived-cache') blockers.push('domain-is-derived-cache-not-canonical-store');
    if (cfg && cfg.name === 'tags') blockers.push('live-turn-dom-state-must-remain-native-owned');
    if (cfg && cfg.name === 'archiveRefs') blockers.push('archive-boundary-not-migrated');
    if (cfg && cfg.name === 'syncEnvelopes') blockers.push('broadcast-envelope-remains-transport-not-store');
    if (cfg && cfg.name === 'uiPrefs') blockers.push('hot-path-ui-prefs-remain-surface-local');
    if (flags && flags.legacyReadDisabled) blockers.push('legacy-read-disabled-flag-would-be-unsafe');
    const knownPresence = Object.values(legacyKeys || {}).filter((v) => v !== null);
    if (knownPresence.length && !knownPresence.some(Boolean)) blockers.push('no-known-legacy-key-present-on-this-surface');
    return blockers;
  }

  function dualReadParityChecks(cfg) {
    const base = [
      'record-count',
      'id-set-hash',
      'schema-version',
      'updated-at-watermark',
      'provider-normalized-shape',
    ];
    switch (cfg?.name) {
      case 'folders':
        return base.concat(['folder-catalog-count', 'folder-binding-count', 'orphan-folder-bindings']);
      case 'categories':
        return base.concat(['category-catalog-count', 'assignment-count', 'override-count', 'candidate-pool-count']);
      case 'tags':
        return base.concat(['tag-summary-count', 'turn-binding-count', 'occurrence-index-count', 'tag-category-link-count']);
      case 'labels':
        return base.concat(['label-catalog-count', 'label-binding-count', 'label-type-count']);
      case 'projects':
        return base.concat(['project-catalog-count', 'project-name-coverage', 'project-binding-count']);
      case 'libraryIndex':
        return ['row-count', 'facet-counts', 'linked-saved-imported-split', 'source-component-counts', 'row-id-set-hash'];
      case 'archiveRefs':
        return ['snapshot-count', 'snapshot-id-set-hash', 'metadata-shape', 'chunk-count'];
      case 'syncEnvelopes':
        return ['envelope-version', 'payload-key-set', 'last-broadcast-age'];
      case 'uiPrefs':
        return ['pref-key-set', 'json-shape', 'surface-specificity'];
      default:
        return base;
    }
  }

  function dualReadRisk(cfg) {
    if (!cfg) return 'unknown';
    if (cfg.name === 'tags') return 'high-live-dom-and-large-index';
    if (cfg.name === 'archiveRefs') return 'high-archive-boundary';
    if (cfg.migrationPriority === 'high') return 'high';
    if (cfg.migrationPriority === 'medium') return 'medium';
    return 'low';
  }

  function dualReadPrerequisites(cfg) {
    const out = [
      'background-schema-created-and-validated',
      'domain-copy-or-mirror-populated',
      'legacy-and-canonical-normalizers-produce-compatible-shapes',
      'parity-checks-pass-with-bounded-diagnostics',
      'structured-fallback-result-shapes-validated',
      'canonical-read-flag-explicitly-enabled',
    ];
    if (cfg?.name === 'tags') out.push('tag-occurrence-index-size-strategy-decided');
    if (cfg?.name === 'libraryIndex') out.push('index-cache-rebuild-boundary-defined');
    if (cfg?.name === 'archiveRefs') out.push('archive-storage-boundary-approved');
    if (cfg?.name === 'syncEnvelopes') out.push('transport-remains-chrome-storage-envelope');
    if (cfg?.name === 'uiPrefs') out.push('surface-local-pref-boundary-approved');
    return out;
  }

  function getDualReadPlan(domainName) {
    const name = String(domainName || '');
    const cfg = STORAGE_ADAPTER_DOMAINS.find((d) => d.name === name);
    if (!cfg) {
      return {
        ok: false,
        status: 'unknown-domain',
        domain: name,
        knownDomains: STORAGE_ADAPTER_DOMAINS.map((d) => d.name),
      };
    }
    const status = domainStatus(cfg.name);
    const flags = status.flags || {};
    const canonicalSource = {
      owner: cfg.targetOwner,
      root: cfg.targetRoot,
      domain: cfg.name,
      enabled: false,
      checkedInPhase8C: false,
    };
    const legacySources = (cfg.sourcePriority || []).map((source, index) => ({
      source,
      priority: index + 1,
      activeFallback: index === 0 || cfg.migrate === 'never' || String(cfg.migrate || '').startsWith('never'),
    }));
    return {
      ok: true,
      phase: '8C',
      mode: 'diagnostics-only',
      domain: cfg.name,
      enabled: false,
      canonicalReadEnabled: false,
      legacyFallbackEnabled: true,
      activeReadPathChanged: false,
      canonicalSource,
      legacySources,
      activeReadOrder: legacySources.map((s) => s.source),
      futureDualReadOrder: [canonicalSource.root].concat(legacySources.map((s) => s.source)),
      fallbackSource: legacySources[0]?.source || cfg.currentRoot,
      parityChecksPlanned: dualReadParityChecks(cfg),
      parityMetrics: {
        collected: false,
        legacyCount: null,
        canonicalCount: null,
        idSetHashMatch: null,
        shapeMatch: null,
      },
      blockers: dualReadBlockers(cfg, flags, status.legacyKeyPresence),
      risk: dualReadRisk(cfg),
      activationPrerequisites: dualReadPrerequisites(cfg),
      status,
    };
  }

  function getDualReadReadiness() {
    const plans = {};
    const summary = {
      total: STORAGE_ADAPTER_DOMAINS.length,
      enabled: 0,
      canonicalReadEnabled: 0,
      ready: 0,
      blocked: 0,
      diagnosticsOnly: true,
    };
    STORAGE_ADAPTER_DOMAINS.forEach((cfg) => {
      const plan = getDualReadPlan(cfg.name);
      plans[cfg.name] = plan;
      if (plan.enabled) summary.enabled += 1;
      if (plan.canonicalReadEnabled) summary.canonicalReadEnabled += 1;
      if (plan.ok && Array.isArray(plan.blockers) && plan.blockers.length === 0) summary.ready += 1;
      else summary.blocked += 1;
    });
    return {
      ok: true,
      phase: '8C',
      mode: 'diagnostics-only',
      surface: SURFACE,
      canonicalReadsEnabled: false,
      dualReadExecutionEnabled: false,
      legacyFallbackEnabled: true,
      activeReadPathsChanged: false,
      summary,
      plans,
    };
  }

  function dualWriteDomains() {
    return [
      {
        name: 'chatRegistry',
        eligible: true,
        writerOwner: SURFACE === 'studio' ? 'studio' : 'native',
        canonicalStore: 'chatRegistry',
        legacyOwner: SURFACE === 'studio' ? 'studio-chat-registry' : 'native-chat-registry',
        legacyRoot: SURFACE === 'studio' ? 'h2o:library:chat-registry:studio:v1' : 'h2o:library:chat-registry:v1',
        operation: 'write-chat-registry-record',
        risk: 'high',
      },
      {
        name: 'folders',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'folders',
        legacyOwner: 'native-folders/archive-bridge',
        legacyRoot: 'folder vault localStorage/archive metadata',
        operation: 'write-folder-catalog',
        risk: 'high',
      },
      {
        name: 'folderBindings',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'folderBindings',
        legacyOwner: 'native-folders/archive-bridge',
        legacyRoot: 'folder bindings in folder vault/archive snapshot metadata',
        operation: 'write-folder-binding',
        risk: 'high',
      },
      {
        name: 'categories',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'categories',
        legacyOwner: 'native-categories/archive-bridge',
        legacyRoot: 'archive category catalog',
        operation: 'write-category-catalog',
        risk: 'high',
      },
      {
        name: 'categoryAssignments',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'categoryAssignments',
        legacyOwner: 'native-categories/archive-bridge',
        legacyRoot: 'snapshot category metadata and category override keys',
        operation: 'write-category-assignment',
        risk: 'high',
      },
      {
        name: 'labels',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'labels',
        legacyOwner: 'native-labels/archive-bridge',
        legacyRoot: 'native label catalog',
        operation: 'write-label-catalog',
        risk: 'high',
      },
      {
        name: 'labelBindings',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'labelBindings',
        legacyOwner: 'native-labels/archive-bridge',
        legacyRoot: 'native label bindings and archive metadata',
        operation: 'write-label-binding',
        risk: 'high',
      },
      {
        name: 'projects',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'projects',
        legacyOwner: 'native-projects',
        legacyRoot: 'native project cache and read-only Studio projection',
        operation: 'mirror-project-catalog',
        risk: 'medium',
        extraBlockers: ['project-domain-is-read-mostly', 'native-project-harvest-owner-not-adapted'],
      },
      {
        name: 'tags',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'tags',
        legacyOwner: 'native-tags',
        legacyRoot: 'native turn/chat tag state',
        operation: 'write-tag-catalog-or-binding',
        risk: 'high',
        extraBlockers: ['live-turn-dom-state-must-remain-native-owned', 'tag-occurrence-strategy-not-finalized'],
      },
      {
        name: 'tagSummaries',
        eligible: true,
        writerOwner: 'native',
        canonicalStore: 'tagSummaries',
        legacyOwner: 'native-tags',
        legacyRoot: 'chat tag summaries and occurrence index',
        operation: 'mirror-tag-summary',
        risk: 'high',
        extraBlockers: ['tag-occurrence-index-size-strategy-not-finalized'],
      },
      {
        name: 'archiveRefs',
        eligible: false,
        writerOwner: 'archive',
        canonicalStore: 'archiveRefs',
        legacyOwner: 'archive-engine/background',
        legacyRoot: 'archive snapshot storage',
        operation: 'write-archive-reference',
        risk: 'high',
        extraBlockers: ['archive-boundary-owned-separately', 'archive-contract-not-migrated'],
      },
      {
        name: 'libraryIndex',
        eligible: false,
        writerOwner: 'none',
        canonicalStore: 'libraryIndex',
        legacyOwner: 'derived-cache',
        legacyRoot: 'rebuild from archive/registry/provider records',
        operation: 'write-library-index-cache',
        risk: 'medium',
        extraBlockers: ['library-index-is-derived-cache'],
      },
      {
        name: 'syncEnvelopes',
        eligible: false,
        writerOwner: 'none',
        canonicalStore: 'syncState',
        legacyOwner: 'cross-surface-sync',
        legacyRoot: 'chrome.storage.local broadcast envelopes',
        operation: 'write-sync-envelope',
        risk: 'low',
        extraBlockers: ['sync-envelope-is-transport-not-canonical-data'],
      },
      {
        name: 'uiPrefs',
        eligible: false,
        writerOwner: 'none',
        canonicalStore: 'uiPrefs',
        legacyOwner: 'surface-ui',
        legacyRoot: 'surface-local localStorage/chrome.storage small prefs',
        operation: 'write-ui-pref',
        risk: 'low',
        extraBlockers: ['ui-prefs-remain-surface-local'],
      },
    ];
  }

  function getDualWriteConfig(domainName) {
    const name = String(domainName || '');
    return dualWriteDomains().find((d) => d.name === name) || null;
  }

  function dualWritePreconditions(cfg) {
    const out = [
      'background-schema-created-and-validated',
      'canonical-write-transport-available',
      'legacy-writer-result-shape-structured',
      'canonical-writer-result-shape-structured',
      'idempotent-operation-key-defined',
      'legacy-and-canonical-post-write-parity-check-defined',
      'rollback-to-legacy-read-path-validated',
      'dual-write-flag-explicitly-enabled',
    ];
    if (cfg?.eligible === false) out.push('domain-ownership-approved-for-canonical-writes');
    if (cfg?.name === 'tags' || cfg?.name === 'tagSummaries') out.push('tag-live-turn-boundary-approved');
    if (cfg?.name === 'archiveRefs') out.push('archive-storage-contract-approved');
    return out;
  }

  function dualWriteBlockers(cfg) {
    const blockers = [
      'phase-8d-diagnostics-only',
      'dual-write-flag-disabled',
      'canonical-write-disabled',
      'canonical-schema-not-created',
      'dual-write-execution-not-implemented',
    ];
    if (!cfg?.eligible) blockers.push('domain-not-dual-write-eligible');
    (cfg?.extraBlockers || []).forEach((item) => blockers.push(item));
    return blockers;
  }

  function dualWriteFailureShape(cfg) {
    return {
      ok: false,
      status: 'dual-write-disabled|canonical-write-unavailable|legacy-write-failed|canonical-write-failed|partial-write-failed',
      reason: 'dual-write is disabled and diagnostics-only in Phase 8D',
      domain: cfg?.name || '',
      operation: cfg?.operation || 'write',
    };
  }

  function getDualWritePlan(domainName) {
    const name = String(domainName || '');
    const cfg = getDualWriteConfig(name);
    if (!cfg) {
      return {
        ok: false,
        status: 'unknown-domain',
        domain: name,
        knownDomains: dualWriteDomains().map((d) => d.name),
      };
    }
    const blockers = dualWriteBlockers(cfg);
    return {
      ok: true,
      phase: '8D',
      mode: 'diagnostics-only',
      domain: cfg.name,
      enabled: false,
      dualWriteEnabled: false,
      canonicalWriteEnabled: false,
      legacyWriteEnabled: cfg.writerOwner !== 'none',
      eligible: cfg.eligible === true,
      ready: false,
      canonicalTarget: {
        owner: 'extension-background-service-worker',
        root: SHARED_IDB_TARGET,
        store: cfg.canonicalStore,
        enabled: false,
      },
      legacyTarget: {
        owner: cfg.legacyOwner,
        root: cfg.legacyRoot,
        enabled: cfg.writerOwner !== 'none',
      },
      writerOwner: cfg.writerOwner,
      preconditions: dualWritePreconditions(cfg),
      blockers,
      failureShape: dualWriteFailureShape(cfg),
      rollback: [
        'leave canonical write flag disabled',
        'continue legacy writes only',
        'prefer legacy read path',
        'ignore or clear future canonical mirror only after explicit migration rollback approval',
      ],
      atomicity: 'legacy-first-with-canonical-mirror-later',
      partialFailurePolicy: 'future dual-write must return structured partial-write-failed and keep legacy read fallback active',
      risk: cfg.risk || 'medium',
    };
  }

  function getDualWriteReadiness() {
    const domains = {};
    const summary = {
      total: 0,
      domainsEligible: 0,
      domainsNotEligible: 0,
      domainsReady: 0,
      domainsBlocked: 0,
    };
    dualWriteDomains().forEach((cfg) => {
      const plan = getDualWritePlan(cfg.name);
      summary.total += 1;
      if (plan.eligible) summary.domainsEligible += 1;
      else summary.domainsNotEligible += 1;
      if (plan.ready) summary.domainsReady += 1;
      if (!plan.ready) summary.domainsBlocked += 1;
      domains[cfg.name] = {
        eligible: plan.eligible,
        ready: plan.ready,
        writerOwner: plan.writerOwner,
        risk: plan.risk,
        blockers: plan.blockers.slice(),
      };
    });
    return {
      ok: true,
      phase: '8D',
      mode: 'diagnostics-only',
      surface: SURFACE,
      enabled: false,
      dualWriteEnabled: false,
      canonicalWriteEnabled: false,
      legacyWritesRemainAuthoritative: true,
      summary,
      domainsEligible: summary.domainsEligible,
      domainsBlocked: summary.domainsBlocked,
      domains,
    };
  }

  const INVENTORY_SAMPLE_LIMIT = 5;
  const INVENTORY_PARSE_LIMIT_CHARS = 250000;

  function canonicalStoreExistsForInventory() {
    const result = backgroundHealthState.lastResult;
    const schema = result && typeof result === 'object' ? result.schema : null;
    if (schema && Object.prototype.hasOwnProperty.call(schema, 'dbExists')) {
      if (schema.dbExists === true) return true;
      if (schema.dbExists === false) return false;
      return null;
    }
    return null;
  }

  function backendForLegacyRoot(root) {
    const value = String(root || '');
    if (!value) return 'unknown';
    if (/^h2o:/u.test(value)) {
      if (/cross-surface:broadcast/u.test(value)) return 'broadcast';
      return 'localStorage';
    }
    if (/chrome\.storage/u.test(value)) return 'chrome.storage';
    if (/indexeddb|idb|h2o_chat_archive/iu.test(value)) return SURFACE === 'studio' ? 'idb-studio' : 'archive-bridge';
    if (/archive/iu.test(value)) return 'archive-bridge';
    if (/broadcast/iu.test(value)) return 'broadcast';
    return 'unknown';
  }

  function localStorageReadable() {
    return safeCall('storage-adapter.inventory.localStorage.available', () => !!W.localStorage, false) === true;
  }

  function estimateRecordCount(parsed) {
    if (Array.isArray(parsed)) return parsed.length;
    if (!parsed || typeof parsed !== 'object') return null;
    const arrayKeys = [
      'rows',
      'bestRows',
      'categories',
      'folders',
      'labels',
      'projects',
      'bindings',
      'records',
      'items',
      'entries',
      'chats',
      'snapshots',
      'tagIds',
      'labelIds',
    ];
    for (const key of arrayKeys) {
      if (Array.isArray(parsed[key])) return parsed[key].length;
    }
    const objectKeys = ['byId', 'map', 'bindingsByChatId', 'recordsById', 'catalog', 'index'];
    for (const key of objectKeys) {
      if (parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
        return Object.keys(parsed[key]).length;
      }
    }
    return Object.keys(parsed).length;
  }

  function sampleRecordKey(item, index) {
    if (item && typeof item === 'object') {
      return String(item.id || item.chatId || item.snapshotId || item.key || item.name || item.title || index);
    }
    return String(item ?? index);
  }

  function sampleParsedKeys(parsed) {
    if (Array.isArray(parsed)) {
      return parsed.slice(0, INVENTORY_SAMPLE_LIMIT).map(sampleRecordKey);
    }
    if (parsed && typeof parsed === 'object') {
      return Object.keys(parsed).slice(0, INVENTORY_SAMPLE_LIMIT);
    }
    return [];
  }

  function inspectLegacySource(key) {
    const root = String(key || '');
    const backend = backendForLegacyRoot(root);
    const base = {
      key: root,
      backend,
      present: null,
      count: null,
      sampleKeys: [],
      readable: false,
      error: '',
    };
    if (backend !== 'localStorage') {
      base.error = backend === 'unknown'
        ? 'source-not-classified-for-synchronous-phase-8e-inventory'
        : 'source-not-synchronously-readable-on-this-surface';
      return base;
    }
    if (!localStorageReadable()) {
      base.error = 'localStorage-unavailable';
      return base;
    }
    base.readable = true;
    try {
      const raw = W.localStorage.getItem(root);
      base.present = raw != null;
      if (raw == null) {
        base.count = 0;
        return base;
      }
      if (raw.length > INVENTORY_PARSE_LIMIT_CHARS) {
        base.error = 'value-too-large-for-phase-8e-bounded-parse';
        return base;
      }
      try {
        const parsed = JSON.parse(raw);
        base.count = estimateRecordCount(parsed);
        base.sampleKeys = sampleParsedKeys(parsed);
      } catch (e) {
        base.count = 1;
        base.error = 'non-json-or-unparsed-legacy-value';
      }
      return base;
    } catch (e) {
      base.present = null;
      base.readable = false;
      base.error = String(e?.message || e || 'localStorage read failed');
      return base;
    }
  }

  function migrationExclusionReason(cfg) {
    if (!cfg) return 'unknown-domain';
    if (cfg.name === 'libraryIndex') return 'derived-cache-rebuilds-from-canonical-records';
    if (cfg.name === 'syncEnvelopes') return 'transport-envelope-not-canonical-domain-data';
    if (cfg.name === 'uiPrefs') return 'surface-local-hot-path-preferences';
    if (cfg.name === 'archiveRefs') return 'archive-owned-boundary-not-in-library-storage-migration';
    if (cfg.migrate === 'never' || String(cfg.migrate || '').startsWith('never')) return 'domain-marked-never-migrate';
    return '';
  }

  function getMigrationInventory(domainName) {
    const name = String(domainName || '');
    const cfg = STORAGE_ADAPTER_DOMAINS.find((d) => d.name === name);
    if (!cfg) {
      return {
        ok: false,
        status: 'unknown-domain',
        domain: name,
        knownDomains: STORAGE_ADAPTER_DOMAINS.map((d) => d.name),
      };
    }
    const legacySources = (cfg.currentRoots || []).map(inspectLegacySource);
    const counts = legacySources.map((src) => src.count).filter((count) => typeof count === 'number' && Number.isFinite(count));
    const hasUnknownPresent = legacySources.some((src) => src.present === null);
    const hasUncountedPresent = legacySources.some((src) => src.present === true && typeof src.count !== 'number');
    const anyPresent = legacySources.some((src) => src.present === true);
    const allKnownAbsent = legacySources.length > 0 && legacySources.every((src) => src.present === false);
    const estimatedRecords = hasUncountedPresent ? null : counts.reduce((sum, count) => sum + count, 0);
    const canCountSafely = !hasUncountedPresent && !hasUnknownPresent;
    const canSampleSafely = legacySources.every((src) => src.present !== true || !src.error || src.error === 'non-json-or-unparsed-legacy-value');
    const reasonIfExcluded = migrationExclusionReason(cfg);
    const canonicalStoreExists = canonicalStoreExistsForInventory();
    const blockers = ['phase-8e-diagnostics-only'];
    if (canonicalStoreExists === false) blockers.push('canonical-store-not-created');
    else if (canonicalStoreExists === null) blockers.push('canonical-store-existence-unknown');
    if (reasonIfExcluded) blockers.push('domain-excluded-from-migration');
    if (hasUnknownPresent) blockers.push('legacy-source-presence-unknown-on-this-surface');
    if (hasUncountedPresent) blockers.push('legacy-source-count-unavailable-with-bounded-parser');
    if (!anyPresent && allKnownAbsent) blockers.push('no-present-legacy-source-detected-on-this-surface');
    let nextAction = 'diagnostics-only';
    if (reasonIfExcluded) nextAction = 'excluded';
    else if (canonicalStoreExists !== true) nextAction = 'needs-canonical-db';
    else if (!canCountSafely) nextAction = 'needs-parser';
    return {
      ok: true,
      phase: '8E',
      mode: 'diagnostics-only',
      surface: SURFACE,
      domain: cfg.name,
      migrationEnabled: false,
      canonicalStoreExists,
      legacySources,
      estimatedRecords,
      canCountSafely,
      canSampleSafely,
      excludedFromMigration: !!reasonIfExcluded,
      reasonIfExcluded,
      blockers,
      nextAction,
    };
  }

  function getMigrationInventoryAll() {
    const domains = {};
    const summary = {
      total: 0,
      countable: 0,
      empty: 0,
      excluded: 0,
      blocked: 0,
      canonicalStoreExists: canonicalStoreExistsForInventory(),
    };
    STORAGE_ADAPTER_DOMAINS.forEach((cfg) => {
      const inventory = getMigrationInventory(cfg.name);
      domains[cfg.name] = inventory;
      summary.total += 1;
      if (inventory.canCountSafely) summary.countable += 1;
      if (inventory.estimatedRecords === 0) summary.empty += 1;
      if (inventory.excludedFromMigration) summary.excluded += 1;
      if (Array.isArray(inventory.blockers) && inventory.blockers.length > 0) summary.blocked += 1;
    });
    return {
      ok: true,
      phase: '8E',
      mode: 'diagnostics-only',
      surface: SURFACE,
      migrationEnabled: false,
      summary,
      domains,
    };
  }

  function comparableFieldsForParity(cfg) {
    switch (cfg?.name) {
      case 'chatRegistry':
        return ['chatId', 'href', 'title', 'updatedAt', 'organization'];
      case 'folders':
        return ['id', 'name', 'parentId', 'sortOrder', 'status'];
      case 'categories':
        return ['id', 'name', 'status', 'replacementCategoryId', 'assignment'];
      case 'tags':
        return ['tagId', 'name', 'chatId', 'turnId', 'source'];
      case 'labels':
        return ['labelId', 'name', 'type', 'chatId'];
      case 'projects':
        return ['projectId', 'projectName', 'href', 'source'];
      case 'libraryIndex':
        return ['rowId', 'chatId', 'view', 'facets'];
      case 'archiveRefs':
        return ['snapshotId', 'chatId', 'metadata'];
      case 'syncEnvelopes':
        return ['version', 'reason', 'payloadKeys'];
      case 'uiPrefs':
        return ['key', 'valueShape', 'surface'];
      default:
        return ['id', 'updatedAt'];
    }
  }

  function checksumStrategyForParity(cfg, inventory) {
    if (inventory?.excludedFromMigration) return 'none';
    if (cfg?.name === 'tags') return 'count-only';
    if (cfg?.name === 'libraryIndex') return 'count-only';
    if (cfg?.name === 'uiPrefs' || cfg?.name === 'syncEnvelopes') return 'none';
    if (typeof inventory?.estimatedRecords === 'number') return 'id-list';
    return 'count-only';
  }

  function getParityPlan(domainName) {
    const name = String(domainName || '');
    const cfg = STORAGE_ADAPTER_DOMAINS.find((d) => d.name === name);
    if (!cfg) {
      return {
        ok: false,
        status: 'unknown-domain',
        domain: name,
        knownDomains: STORAGE_ADAPTER_DOMAINS.map((d) => d.name),
      };
    }
    const inventory = getMigrationInventory(cfg.name);
    const canonicalStoreExists = inventory.canonicalStoreExists;
    const blockers = [
      'phase-8e-diagnostics-only',
      'canonical-read-disabled',
      'parity-execution-not-implemented',
    ];
    if (canonicalStoreExists === false) blockers.push('canonical-store-not-created');
    else if (canonicalStoreExists === null) blockers.push('canonical-store-existence-unknown');
    if (inventory.excludedFromMigration) blockers.push('domain-excluded-from-parity');
    if (typeof inventory.estimatedRecords !== 'number') blockers.push('legacy-count-unavailable');
    return {
      ok: true,
      phase: '8E',
      mode: 'diagnostics-only',
      domain: cfg.name,
      enabled: false,
      canonicalReadEnabled: false,
      parityCheckExecutable: false,
      canonicalCount: null,
      legacyCount: inventory.estimatedRecords,
      comparableFields: comparableFieldsForParity(cfg),
      checksumStrategy: checksumStrategyForParity(cfg, inventory),
      blockers,
      passCriteria: [
        'legacy-count-equals-canonical-count',
        'legacy-id-set-equals-canonical-id-set-where-applicable',
        'provider-normalized-shape-compatible',
        'no-orphan-bindings-after-normalization',
      ],
      inventory,
    };
  }

  function getParityReadiness() {
    const domains = {};
    const summary = {
      total: 0,
      executable: 0,
      blocked: 0,
      excluded: 0,
      legacyCountable: 0,
    };
    STORAGE_ADAPTER_DOMAINS.forEach((cfg) => {
      const plan = getParityPlan(cfg.name);
      domains[cfg.name] = {
        enabled: plan.enabled === true,
        executable: plan.parityCheckExecutable === true,
        legacyCount: plan.legacyCount,
        checksumStrategy: plan.checksumStrategy,
        blockers: plan.blockers.slice(),
      };
      summary.total += 1;
      if (plan.parityCheckExecutable) summary.executable += 1;
      if (plan.blockers.length) summary.blocked += 1;
      if (plan.inventory?.excludedFromMigration) summary.excluded += 1;
      if (typeof plan.legacyCount === 'number') summary.legacyCountable += 1;
    });
    return {
      ok: true,
      phase: '8E',
      mode: 'diagnostics-only',
      surface: SURFACE,
      enabled: false,
      canonicalReadEnabled: false,
      parityExecutionEnabled: false,
      summary,
      domains,
    };
  }

  const MIRROR_DRY_RUN_SAMPLE_LIMIT = 8;
  const MIRROR_DRY_RUN_MAX_RECORDS = 5000;
  const MIRROR_DRY_RUN_MAX_RAW_CHARS = 2000000;

  function chatRegistryCore() {
    return H2O.Library?.RegistryCore || H2O.Library?.ChatRegistryCore || null;
  }

  function hashString(value) {
    const raw = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function emptyMirrorSource(source, key, backend, error = '') {
    return {
      source,
      key,
      backend,
      present: null,
      readable: false,
      recordCount: null,
      tombstoneCount: 0,
      skippedCount: 0,
      invalidCount: 0,
      sampleChatIds: [],
      error,
      records: [],
    };
  }

  function summarizeMirrorSource(src) {
    return {
      source: src.source,
      key: src.key,
      backend: src.backend,
      present: src.present,
      readable: src.readable,
      recordCount: src.recordCount,
      tombstoneCount: src.tombstoneCount,
      skippedCount: src.skippedCount,
      invalidCount: src.invalidCount,
      sampleChatIds: src.sampleChatIds.slice(0, MIRROR_DRY_RUN_SAMPLE_LIMIT),
      error: src.error || '',
    };
  }

  function readChatRegistryLocalSource(core, key, sourceName) {
    const source = emptyMirrorSource(sourceName, key, 'localStorage');
    if (!localStorageReadable()) {
      source.error = 'localStorage-unavailable';
      return source;
    }
    source.readable = true;
    try {
      const raw = W.localStorage.getItem(key);
      source.present = raw != null;
      if (raw == null) {
        source.recordCount = 0;
        return source;
      }
      if (raw.length > MIRROR_DRY_RUN_MAX_RAW_CHARS) {
        source.readable = false;
        source.skippedCount = 1;
        source.error = 'legacy-registry-too-large-for-phase-8f-bounded-dry-run';
        return source;
      }
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        source.skippedCount = 1;
        source.error = 'legacy-registry-json-parse-failed';
        return source;
      }
      if (!core || typeof core.adoptShape !== 'function') {
        source.skippedCount = 1;
        source.error = 'chat-registry-core-unavailable';
        return source;
      }
      const adopted = core.adoptShape(parsed);
      const recordsById = adopted?.recordsById && typeof adopted.recordsById === 'object' ? adopted.recordsById : {};
      const ids = Object.keys(recordsById);
      source.recordCount = ids.length;
      source.tombstoneCount = adopted?.tombstonesById && typeof adopted.tombstonesById === 'object'
        ? Object.keys(adopted.tombstonesById).length
        : 0;
      source.records = ids.slice(0, MIRROR_DRY_RUN_MAX_RECORDS).map((id) => recordsById[id]).filter(Boolean);
      source.skippedCount = Math.max(0, ids.length - source.records.length);
      source.sampleChatIds = source.records.map((rec) => String(rec?.chatId || '')).filter(Boolean).slice(0, MIRROR_DRY_RUN_SAMPLE_LIMIT);
      return source;
    } catch (e) {
      source.present = null;
      source.readable = false;
      source.error = String(e?.message || e || 'chat registry source read failed');
      return source;
    }
  }

  function readChatRegistryNativeBroadcastSource(core) {
    const source = emptyMirrorSource('native-linked-record-broadcast', 'h2o:library:cross-surface:broadcast:native:v1', 'broadcast');
    try {
      const payload = H2O.Library?.Sync && typeof H2O.Library.Sync.getNativeBroadcast === 'function'
        ? H2O.Library.Sync.getNativeBroadcast()
        : null;
      const rows = Array.isArray(payload?.linkedRecords) ? payload.linkedRecords : [];
      source.present = !!payload;
      source.readable = !!payload;
      source.recordCount = rows.length;
      if (!payload) {
        source.error = 'native-broadcast-unavailable-on-this-surface';
        return source;
      }
      if (!core || typeof core.sanitizeRecord !== 'function') {
        source.skippedCount = rows.length;
        source.error = 'chat-registry-core-unavailable';
        return source;
      }
      source.records = rows.slice(0, MIRROR_DRY_RUN_MAX_RECORDS)
        .map((row) => core.sanitizeRecord(row, row?.chatId || row?.id || ''))
        .filter(Boolean);
      source.skippedCount = Math.max(0, rows.length - source.records.length);
      source.sampleChatIds = source.records.map((rec) => String(rec?.chatId || '')).filter(Boolean).slice(0, MIRROR_DRY_RUN_SAMPLE_LIMIT);
      return source;
    } catch (e) {
      source.present = null;
      source.readable = false;
      source.error = String(e?.message || e || 'native broadcast read failed');
      return source;
    }
  }

  function chatRegistryMirrorSources(core) {
    const sources = [];
    if (SURFACE === 'studio') {
      sources.push(readChatRegistryLocalSource(core, 'h2o:library:chat-registry:studio:v1', 'studio-chat-registry-localStorage'));
      sources.push(readChatRegistryNativeBroadcastSource(core));
    } else {
      sources.push(readChatRegistryLocalSource(core, 'h2o:library:chat-registry:v1', 'native-chat-registry-localStorage'));
    }
    return sources;
  }

  function buildChatRegistryCandidates(core, sources) {
    const byKey = Object.create(null);
    let legacyCount = 0;
    let skippedCount = 0;
    let invalidCount = 0;
    let tombstoneCount = 0;
    (sources || []).forEach((source) => {
      if (typeof source.recordCount === 'number') legacyCount += source.recordCount;
      skippedCount += Number(source.skippedCount || 0) || 0;
      invalidCount += Number(source.invalidCount || 0) || 0;
      tombstoneCount += Number(source.tombstoneCount || 0) || 0;
      (source.records || []).forEach((rec) => {
        if (Object.keys(byKey).length >= MIRROR_DRY_RUN_MAX_RECORDS) {
          skippedCount += 1;
          return;
        }
        let sane = null;
        try {
          sane = core?.sanitizeRecord ? core.sanitizeRecord(rec, rec?.chatId || rec?.id || '') : rec;
        } catch {
          invalidCount += 1;
          return;
        }
        const key = (core?.getRecordDedupeKey ? core.getRecordDedupeKey(sane) : '')
          || (sane?.chatId ? `chatId:${sane.chatId}` : '')
          || (sane?.normalizedHref ? `href:${sane.normalizedHref}` : '');
        if (!key) {
          invalidCount += 1;
          return;
        }
        if (byKey[key] && core?.mergeRecord) {
          try {
            byKey[key] = core.mergeRecord(byKey[key], sane, { passive: true });
          } catch {
            byKey[key] = sane;
          }
        } else {
          byKey[key] = sane;
        }
      });
    });
    const keys = Object.keys(byKey).sort();
    const records = keys.map((key) => byKey[key]);
    const sampleChatIds = records
      .map((rec) => String(rec?.chatId || ''))
      .filter(Boolean)
      .slice(0, MIRROR_DRY_RUN_SAMPLE_LIMIT);
    const checksumInput = records.map((rec, index) => [
      keys[index],
      rec?.chatId || '',
      rec?.normalizedHref || '',
      rec?.updatedAt || '',
      rec?.state?.isSaved ? 'saved' : '',
      rec?.state?.isLinked ? 'linked' : '',
      rec?.state?.isImported ? 'imported' : '',
    ].join(':')).join('|');
    return {
      legacyCount,
      candidateCount: records.length,
      skippedCount,
      invalidCount,
      tombstoneCount,
      sampleChatIds,
      checksum: records.length ? hashString(checksumInput) : '',
    };
  }

  function getMirrorDryRun(domainName) {
    const domain = String(domainName || '');
    if (domain !== 'chatRegistry') {
      return {
        ok: false,
        status: 'unsupported-domain',
        phase: '8F',
        domain,
        supportedDomains: ['chatRegistry'],
      };
    }
    const core = chatRegistryCore();
    const sources = chatRegistryMirrorSources(core);
    const candidate = buildChatRegistryCandidates(core, sources);
    const canonicalStoreExists = canonicalStoreExistsForInventory();
    const sourceSummaries = sources.map(summarizeMirrorSource);
    const blockers = ['phase-8f-diagnostics-only'];
    if (!core) blockers.push('chat-registry-core-unavailable');
    if (canonicalStoreExists === false) blockers.push('canonical-store-not-created');
    else if (canonicalStoreExists === null) blockers.push('canonical-store-existence-unknown');
    if (!candidate.legacyCount) blockers.push('no-legacy-chat-registry-records-detected');
    if (candidate.invalidCount) blockers.push('invalid-records-detected');
    if (candidate.skippedCount) blockers.push('records-skipped-by-bounded-dry-run');
    const hasCandidates = candidate.candidateCount > 0;
    return {
      ok: true,
      phase: '8F',
      domain: 'chatRegistry',
      mode: 'dry-run',
      writesEnabled: false,
      canonicalReadEnabled: false,
      dualWriteEnabled: false,
      canonicalStoreExists,
      legacySource: sourceSummaries.map((src) => src.source).join('+') || 'none',
      legacyCount: candidate.legacyCount,
      candidateCount: candidate.candidateCount,
      skippedCount: candidate.skippedCount,
      invalidCount: candidate.invalidCount,
      tombstoneCount: candidate.tombstoneCount,
      sampleChatIds: candidate.sampleChatIds,
      checksum: candidate.checksum,
      sources: sourceSummaries,
      blockers,
      nextAction: hasCandidates ? 'review-only' : 'blocked',
    };
  }

  function getMirrorReadiness(domainName, dryRunInput = null) {
    const domain = String(domainName || '');
    if (domain !== 'chatRegistry') {
      return {
        ok: false,
        status: 'unsupported-domain',
        phase: '8F',
        domain,
        supportedDomains: ['chatRegistry'],
      };
    }
    const dryRun = dryRunInput && dryRunInput.ok ? dryRunInput : getMirrorDryRun(domain);
    const blockers = [
      'phase-8f-diagnostics-only',
      'mirror-write-disabled',
      'canonical-read-disabled',
      'dual-write-disabled',
    ].concat((dryRun.blockers || []).filter((item) => item !== 'phase-8f-diagnostics-only'));
    return {
      ok: true,
      phase: '8F',
      mode: 'dry-run-readiness',
      domain: 'chatRegistry',
      enabled: false,
      writesEnabled: false,
      canonicalReadEnabled: false,
      dualWriteEnabled: false,
      readyForReadOnlyMirror: false,
      legacyCount: dryRun.legacyCount,
      candidateCount: dryRun.candidateCount,
      checksum: dryRun.checksum,
      blockers,
      nextAction: dryRun.candidateCount > 0 ? 'ready-for-read-only-mirror-review' : 'blocked',
    };
  }

  function backgroundSchemaSnapshot() {
    const result = backgroundHealthState.lastResult && typeof backgroundHealthState.lastResult === 'object'
      ? backgroundHealthState.lastResult
      : null;
    const schema = result?.schema && typeof result.schema === 'object' ? result.schema : null;
    const stores = schema?.stores && typeof schema.stores === 'object' ? schema.stores : {};
    const chatRegistryStore = stores.chatRegistry && typeof stores.chatRegistry === 'object' ? stores.chatRegistry : null;
    const dbExists = typeof schema?.dbExists === 'boolean' ? schema.dbExists : null;
    let canonicalStoreStatus = 'unknown';
    if (dbExists === false) {
      canonicalStoreStatus = 'not-created';
    } else if (dbExists === true) {
      const storeStatus = String(chatRegistryStore?.status || '');
      if (chatRegistryStore?.exists === false) canonicalStoreStatus = 'absent';
      else if (/not-inspected/i.test(storeStatus)) canonicalStoreStatus = 'not-inspected';
      else canonicalStoreStatus = 'not-inspected';
    }
    return {
      queried: backgroundHealthState.lastCheckedAt > 0,
      ok: result?.ok === true,
      status: String(result?.status || (result ? 'ok' : 'not-queried')),
      transport: String(backgroundHealthState.lastTransport || result?.transport || ''),
      schemaAvailable: !!schema,
      canonicalDbExists: dbExists,
      canonicalStoreStatus,
      dbCreatedByThisCheck: schema?.dbCreatedByThisCheck === true,
      plannedStores: Array.isArray(schema?.plannedStores) ? schema.plannedStores.slice() : [],
      chatRegistryStore: chatRegistryStore
        ? {
            planned: chatRegistryStore.planned === true,
            exists: typeof chatRegistryStore.exists === 'boolean' ? chatRegistryStore.exists : null,
            status: String(chatRegistryStore.status || ''),
          }
        : null,
    };
  }

  function getReadOnlyMirrorStatus(domainName) {
    const domain = String(domainName || '');
    if (domain !== 'chatRegistry') {
      return {
        ok: false,
        status: 'unsupported-domain',
        phase: '8H',
        domain,
        supportedDomains: ['chatRegistry'],
      };
    }
    const dryRun = getMirrorDryRun('chatRegistry');
    const readiness = getMirrorReadiness('chatRegistry', dryRun);
    const background = backgroundSchemaSnapshot();
    const blockers = [
      'phase-8h-diagnostics-only',
      'mirror-write-disabled',
      'canonical-read-disabled',
      'dual-read-execution-disabled',
      'dual-write-disabled',
    ];
    if (!background.queried) blockers.push('background-health-not-queried');
    if (background.queried && background.ok !== true) blockers.push('background-health-not-ok');
    if (background.canonicalDbExists !== true) blockers.push('canonical-db-not-created');
    if (background.canonicalStoreStatus !== 'not-inspected') blockers.push(`canonical-store-${background.canonicalStoreStatus}`);
    if (!dryRun.candidateCount) blockers.push('no-chat-registry-mirror-candidates');
    if (dryRun.invalidCount) blockers.push('invalid-chat-registry-candidates');
    if (dryRun.skippedCount) blockers.push('bounded-dry-run-skipped-records');
    return {
      ok: true,
      phase: '8H',
      domain: 'chatRegistry',
      mode: 'read-only-mirror-status',
      mirrorExecutable: false,
      writesEnabled: false,
      canonicalReadEnabled: false,
      dualReadExecutionEnabled: false,
      dualWriteEnabled: false,
      legacyCandidateCount: typeof dryRun.candidateCount === 'number' ? dryRun.candidateCount : null,
      legacyCount: typeof dryRun.legacyCount === 'number' ? dryRun.legacyCount : null,
      canonicalDbExists: background.canonicalDbExists,
      canonicalStoreStatus: background.canonicalStoreStatus,
      dbCreatedByThisCheck: false,
      background,
      dryRun: {
        ok: dryRun.ok === true,
        phase: dryRun.phase,
        mode: dryRun.mode,
        legacySource: dryRun.legacySource,
        legacyCount: dryRun.legacyCount,
        candidateCount: dryRun.candidateCount,
        skippedCount: dryRun.skippedCount,
        invalidCount: dryRun.invalidCount,
        tombstoneCount: dryRun.tombstoneCount,
        sampleChatIds: Array.isArray(dryRun.sampleChatIds) ? dryRun.sampleChatIds.slice(0, MIRROR_DRY_RUN_SAMPLE_LIMIT) : [],
        checksum: dryRun.checksum || '',
      },
      readiness: {
        ok: readiness.ok === true,
        phase: readiness.phase,
        mode: readiness.mode,
        readyForReadOnlyMirror: readiness.readyForReadOnlyMirror === true,
        nextAction: readiness.nextAction || '',
      },
      nextAction: 'schema-creation-review',
      blockers,
    };
  }

  function getReadOnlyMirrorPlan(domainName) {
    const domain = String(domainName || '');
    if (domain !== 'chatRegistry') {
      return {
        ok: false,
        status: 'unsupported-domain',
        phase: '8H',
        domain,
        supportedDomains: ['chatRegistry'],
      };
    }
    const status = getReadOnlyMirrorStatus('chatRegistry');
    return {
      ok: true,
      phase: '8H',
      domain: 'chatRegistry',
      mode: 'read-only-mirror-plan',
      selectedOption: 'read-only-empty-mirror-diagnostics',
      activeReadPathChanged: false,
      mirrorExecutable: false,
      writesEnabled: false,
      canonicalReadEnabled: false,
      dualReadExecutionEnabled: false,
      dualWriteEnabled: false,
      contract: {
        statusMethod: 'StorageAdapter.getReadOnlyMirrorStatus("chatRegistry")',
        planMethod: 'StorageAdapter.getReadOnlyMirrorPlan("chatRegistry")',
        canonicalTarget: SHARED_IDB_TARGET,
        canonicalStore: 'chatRegistry',
        legacySources: status.dryRun?.legacySource ? String(status.dryRun.legacySource).split('+').filter(Boolean) : [],
      },
      prerequisites: [
        'explicit-schema-creation-phase-approved',
        'background-schema-diagnostics-reviewed',
        'mirror-dry-run-candidate-count-reviewed',
        'rollback-plan-approved',
      ],
      futureSteps: [
        'create-empty-schema-behind-explicit-phase-gate',
        'inspect-empty-chatRegistry-store-without-canonical-read-switch',
        'review-parity-plan-before-any-record-write',
      ],
      rollback: [
        'disable future schema/mirror flags',
        'leave legacy chat registry keys untouched',
        'remove empty diagnostic DB only with explicit user approval',
      ],
      forbiddenActions: [
        'no-sw-idb-schema-creation-in-phase-8h',
        'no-canonical-record-writes',
        'no-canonical-read-switch',
        'no-dual-read-execution',
        'no-dual-write',
      ],
      status,
      nextAction: 'schema-creation-review',
    };
  }

  function storageAdapterHealth() {
    const capabilities = storageCapabilities();
    const store = capabilities.libraryStore;
    const ok = capabilities.legacyLocalStorage.available || store.available || capabilities.chromeStorageLocal.available || capabilities.indexedDB.available;
    return {
      ok,
      phase: STORAGE_ADAPTER_PHASE,
      mode: 'diagnostics-only',
      surface: SURFACE,
      canonicalStoreEnabled: false,
      migrationEnabled: false,
      dualWriteEnabled: false,
      canonicalWriteEnabled: false,
      backgroundServiceWorkerAvailable: capabilities.backgroundServiceWorker.available,
      indexedDBAvailable: capabilities.indexedDB.available,
      chromeStorageAvailable: capabilities.chromeStorageLocal.available,
      legacyLocalStorageAvailable: capabilities.legacyLocalStorage.available,
      libraryStoreAvailable: store.available,
      libraryStoreBackend: store.backend || '',
      libraryStoreHealth: store.caps.health || '',
    };
  }

  function rememberBackgroundHealth(result, transport) {
    const out = (result && typeof result === 'object' && !Array.isArray(result))
      ? { ...result }
      : { ok: false, status: 'invalid-background-diagnostic-result', reason: String(result || '') };
    if (!out.status) out.status = out.ok === false ? 'background-diagnostic-failed' : 'ok';
    out.transport = String(transport || out.transport || '');
    backgroundHealthState.lastCheckedAt = Date.now();
    backgroundHealthState.lastTransport = out.transport;
    backgroundHealthState.lastResult = out;
    return out;
  }

  function normalizeBackgroundHealthEnvelope(raw, transport) {
    const env = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    if (!env) {
      return rememberBackgroundHealth({
        ok: false,
        status: 'background-diagnostic-empty-result',
        reason: 'background returned no diagnostic payload',
      }, transport);
    }
    if (Object.prototype.hasOwnProperty.call(env, 'result')) {
      if (env.ok === false) {
        return rememberBackgroundHealth({
          ok: false,
          status: 'background-diagnostic-rejected',
          reason: String(env.error || env.reason || 'background diagnostic rejected'),
          error: env.error || '',
        }, transport);
      }
      return rememberBackgroundHealth(env.result, transport);
    }
    return rememberBackgroundHealth(env, transport);
  }

  function sendRuntimeArchiveMessage() {
    return new Promise((resolve, reject) => {
      try {
        if (!W.chrome?.runtime || typeof W.chrome.runtime.sendMessage !== 'function') {
          reject(new Error('chrome.runtime.sendMessage unavailable'));
          return;
        }
        W.chrome.runtime.sendMessage({
          type: STORAGE_ARCHIVE_MSG,
          req: { op: STORAGE_BACKGROUND_DIAG_OP, payload: {} },
        }, (response) => {
          const le = W.chrome?.runtime?.lastError;
          if (le) {
            reject(new Error(String(le.message || le)));
            return;
          }
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  async function getBackgroundHealth() {
    try {
      const bridge = safeCall('storage-adapter.background.bridge.get', () => H2O.archiveBoot?._getExtensionBridge?.(), null);
      if (bridge && typeof bridge.libraryStorageDiagnose === 'function') {
        const out = await bridge.libraryStorageDiagnose();
        return normalizeBackgroundHealthEnvelope(out, 'extension-archive-bridge');
      }
      if (W.chrome?.runtime && typeof W.chrome.runtime.sendMessage === 'function') {
        const out = await sendRuntimeArchiveMessage();
        return normalizeBackgroundHealthEnvelope(out, 'chrome.runtime.sendMessage');
      }
      return rememberBackgroundHealth({
        ok: false,
        status: 'background-diagnostic-unavailable',
        reason: 'no extension archive bridge or chrome.runtime transport available',
      }, 'none');
    } catch (e) {
      return rememberBackgroundHealth({
        ok: false,
        status: 'background-diagnostic-error',
        reason: String(e?.message || e || ''),
      }, 'error');
    }
  }

  function backgroundHealthSnapshot() {
    return {
      lastCheckedAt: backgroundHealthState.lastCheckedAt,
      lastTransport: backgroundHealthState.lastTransport,
      lastResult: backgroundHealthState.lastResult,
      queried: backgroundHealthState.lastCheckedAt > 0,
    };
  }

  function installStorageAdapterDiagnostics(core) {
    H2O.Library = H2O.Library || {};
    const api = Object.freeze({
      __phase: STORAGE_ADAPTER_PHASE,
      surface: SURFACE,
      mode: 'diagnostics-only',
      listDomains() { return STORAGE_ADAPTER_DOMAINS.map((d) => d.name); },
      getHealth() { return storageAdapterHealth(); },
      getBackgroundHealth,
      getDualReadPlan,
      getDualReadReadiness,
      getDualWritePlan,
      getDualWriteReadiness,
      getMigrationInventory,
      getMigrationInventoryAll,
      getParityPlan,
      getParityReadiness,
      getMirrorDryRun,
      getMirrorReadiness,
      getReadOnlyMirrorStatus,
      getReadOnlyMirrorPlan,
      getDomainStatus(domain) { return domainStatus(domain); },
      read(domain, key) {
        return Promise.resolve({
          ok: false,
          status: 'phase-8a-diagnostics-only',
          reason: 'storage-adapter-read-not-enabled',
          domain: String(domain || ''),
          key: String(key || ''),
        });
      },
      write(domain, key) {
        return Promise.resolve({
          ok: false,
          status: 'phase-8a-diagnostics-only',
          reason: 'storage-adapter-write-not-enabled',
          domain: String(domain || ''),
          key: String(key || ''),
        });
      },
      diagnose() {
        const domains = {};
        STORAGE_ADAPTER_DOMAINS.forEach((d) => { domains[d.name] = domainStatus(d.name); });
        const chatRegistryMirrorDryRun = getMirrorDryRun('chatRegistry');
        return {
          phase: STORAGE_ADAPTER_PHASE,
          surface: SURFACE,
          mode: 'diagnostics-only',
          contract: {
            service: 'H2O.Library.StorageAdapter',
            methods: [
              'getHealth',
              'getBackgroundHealth',
              'getDualReadPlan',
              'getDualReadReadiness',
              'getDualWritePlan',
              'getDualWriteReadiness',
              'getMigrationInventory',
              'getMigrationInventoryAll',
              'getParityPlan',
              'getParityReadiness',
              'getMirrorDryRun',
              'getMirrorReadiness',
              'getReadOnlyMirrorStatus',
              'getReadOnlyMirrorPlan',
              'getDomainStatus',
              'listDomains',
              'diagnose',
            ],
            futureMethods: ['read', 'write'],
            canonicalTarget: SHARED_IDB_TARGET,
            writesEnabled: false,
            migrationsEnabled: false,
            dualWriteEnabled: false,
          },
          health: storageAdapterHealth(),
          capabilities: storageCapabilities(),
          background: backgroundHealthSnapshot(),
          dualRead: getDualReadReadiness(),
          dualWrite: getDualWriteReadiness(),
          migrationInventory: getMigrationInventoryAll(),
          parity: getParityReadiness(),
          mirrorDryRun: {
            chatRegistry: chatRegistryMirrorDryRun,
          },
          mirrorReadiness: {
            chatRegistry: getMirrorReadiness('chatRegistry', chatRegistryMirrorDryRun),
          },
          readOnlyMirror: {
            chatRegistry: getReadOnlyMirrorStatus('chatRegistry'),
          },
          domains,
        };
      },
    });
    H2O.Library.StorageAdapter = api;
    if (core && typeof core.registerService === 'function') {
      try { core.registerService('storage-adapter', api, { replace: true }); }
      catch (e) { err('register:storage-adapter', e); }
    }
    step('storage-adapter-diagnostics-ready', `domains=${STORAGE_ADAPTER_DOMAINS.length}`);
    return api;
  }

  // ── H2O.flags registry (minimal) ───────────────────────────────────────────
  // Per-surface key/value store. Phase 1 contract:
  //   - No feature behavior reads a flag yet.
  //   - One persistence key only: h2o:flags:v1 (per-surface origin).
  //   - No cross-surface sync.
  //   - Reading an unset flag returns the supplied fallback.
  const FLAGS_STORAGE_KEY = 'h2o:flags:v1';
  const flagState = { values: Object.create(null), loadedAt: 0, lastErr: '' };

  function readFlagsFromStorage() {
    try {
      const raw = W.localStorage?.getItem(FLAGS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      flagState.lastErr = String(e?.message || e || '');
      err('flags.read', e);
      return {};
    }
  }

  function writeFlagsToStorage(obj) {
    try {
      W.localStorage?.setItem(FLAGS_STORAGE_KEY, JSON.stringify(obj || {}));
      return true;
    } catch (e) {
      flagState.lastErr = String(e?.message || e || '');
      err('flags.write', e);
      return false;
    }
  }

  function ensureFlags() {
    if (H2O.flags && typeof H2O.flags.get === 'function') return H2O.flags;
    flagState.values = readFlagsFromStorage();
    flagState.loadedAt = Date.now();
    const api = {
      get(name, fallback = undefined) {
        const k = String(name || '');
        if (!k) return fallback;
        return Object.prototype.hasOwnProperty.call(flagState.values, k) ? flagState.values[k] : fallback;
      },
      set(name, value) {
        const k = String(name || '');
        if (!k) return false;
        flagState.values[k] = value;
        return writeFlagsToStorage(flagState.values);
      },
      diagnose() {
        return {
          surface: SURFACE,
          loadedAt: flagState.loadedAt,
          key: FLAGS_STORAGE_KEY,
          keys: Object.keys(flagState.values),
          values: { ...flagState.values },
          lastErr: flagState.lastErr,
        };
      },
    };
    H2O.flags = api;
    step('flags-ready', `keys=${Object.keys(flagState.values).length}`);
    return api;
  }

  // ── Library Core registration ──────────────────────────────────────────────
  // Register canonical aliases. Two concerns at this seam:
  //   (1) Several core service names already exist under different keys
  //       (e.g., 'chat-registry' instead of 'registry'). We register the
  //       canonical name *additively* — the legacy name stays registered
  //       alongside it, so existing callers are untouched.
  //   (2) Some feature modules boot AFTER LibraryCore is ready. We re-resolve
  //       on first call (getService is dynamic), but we also re-register on
  //       library-ready and on a one-shot 350 ms tick to cover late arrivals.
  function registerCanonicalServices(core) {
    if (!core || typeof core.registerService !== 'function') return { ok: false, registered: [] };
    const registered = [];
    CANONICAL_SERVICES.forEach((name) => {
      try {
        const impl = resolveCanonical(name);
        core.registerService(name, impl, { replace: true });
        registered.push({ name, placeholder: isPlaceholder(impl) });
      } catch (e) { err(`register:${name}`, e); }
    });
    step('register-canonical', `count=${registered.length}`);
    return { ok: true, registered };
  }

  function installCanonicalDiagnostics(core) {
    if (!core) return false;
    if (typeof core.listCanonicalServices !== 'function') {
      core.listCanonicalServices = function listCanonicalServices() {
        return CANONICAL_SERVICES.slice();
      };
    }
    if (typeof core.getCanonicalServiceStatus !== 'function') {
      core.getCanonicalServiceStatus = function getCanonicalServiceStatus() {
        const out = {
          surface: typeof core.getCurrentSurface === 'function' ? core.getCurrentSurface() : SURFACE,
          phase: 'phase-1-service-boundary',
          counts: { total: CANONICAL_SERVICES.length, present: 0, placeholders: 0, missing: 0 },
          services: {},
        };
        CANONICAL_SERVICES.forEach((name) => {
          let impl = null;
          try { impl = core.getService?.(name) ?? null; } catch (e) { err(`status:${name}`, e); }
          if (!impl) {
            out.services[name] = { status: 'missing' };
            out.counts.missing += 1;
            return;
          }
          if (isPlaceholder(impl)) {
            out.services[name] = { status: 'placeholder', reason: impl.reason || '' };
            out.counts.placeholders += 1;
            return;
          }
          out.services[name] = { status: 'present' };
          out.counts.present += 1;
        });
        return out;
      };
    }
    // Wrap selfCheck so it includes canonical service health without changing
    // its existing return shape. Keep the original selfCheck callable too.
    if (typeof core.selfCheck === 'function' && !core.__canonicalSelfCheckWrapped) {
      const inner = core.selfCheck;
      core.selfCheck = function selfCheckWithCanonical() {
        let base;
        try { base = inner.call(core); } catch (e) { err('selfCheck.inner', e); base = { ok: false, error: 'inner-self-check-threw' }; }
        let canonical;
        try { canonical = core.getCanonicalServiceStatus?.() || null; } catch (e) { err('selfCheck.canonical', e); canonical = null; }
        return { ...(base || {}), canonical };
      };
      core.__canonicalSelfCheckWrapped = true;
    }
    return true;
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Boot strategy: try once immediately, then again after library-ready, then
  // one final 350 ms timer to catch any late-bound feature owner (Projects in
  // particular boots a bit later than the rest).
  function boot() {
    ensureFlags();
    const core = H2O.LibraryCore;
    if (!core) return false;
    installCanonicalDiagnostics(core);
    installStorageAdapterDiagnostics(core);
    registerCanonicalServices(core);
    return true;
  }

  if (!boot()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => boot(), { once: true });
  } else {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => {
      try {
        const core = H2O.LibraryCore;
        if (core) {
          installStorageAdapterDiagnostics(core);
          registerCanonicalServices(core);
        }
      } catch (e) { err('rebind-on-ready', e); }
    }, { once: true });
  }

  // One-shot late re-register for modules that boot after LibraryCore-ready
  // (Projects, Tags occurrence index, etc.). This is purely additive — it just
  // re-resolves the alias targets so a previously-placeholder slot can become
  // a real impl without restarting the page.
  W.setTimeout(() => {
    try {
      const core = H2O.LibraryCore;
      if (core) {
        installStorageAdapterDiagnostics(core);
        registerCanonicalServices(core);
      }
      step('late-rebind');
    } catch (e) { err('late-rebind', e); }
  }, 350);

  // Public surface — small, mostly for diagnostics.
  H2O.Library = H2O.Library || {};
  H2O.Library.CanonicalServices = Object.freeze({
    version: VERSION,
    surface: SURFACE,
    list() { return CANONICAL_SERVICES.slice(); },
    resolve(name) { return resolveCanonical(String(name || '')); },
    diagnose() {
      return {
        version: VERSION,
        surface: SURFACE,
        canonical: CANONICAL_SERVICES.slice(),
        status: H2O.LibraryCore?.getCanonicalServiceStatus?.() || null,
        storageAdapter: H2O.Library?.StorageAdapter?.getHealth?.() || null,
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  });

  step('boot', 'native-library-canonical-services-ready');
  try { console.log(`${TAG} v${VERSION} ready — canonical=${CANONICAL_SERVICES.length}`); } catch {}
})();
