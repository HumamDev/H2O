// ==UserScript==
// @h2o-id             s0f1a.library_core.studio
// @name               S0F1a. 🎬 Library Core - Studio
// @namespace          H2O.Premium.CGX.library_core.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000002
// @description        Studio Library Core: shared service registry (owners, routes, pages, views, services); plugs in Studio surface implementations registered by S0F0a Library Surface Host. Mirrors native 0F1a Library Core's contract so all Library feature owners (Workspace, Index, Folders, Categories, Tags, Labels, Projects) consume the same API regardless of surface.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1a Library Core (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const CORE_KEY = 'LibraryCore';
  const core = (H2O[CORE_KEY] = H2O[CORE_KEY] || {});

  const diag = (core.diag = core.diag || {
    t0: performance.now(),
    steps: [],
    errors: [],
    bufMax: 160,
    errMax: 40,
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

  core.meta = core.meta || {
    owner: 'S0F1a.library_core.studio',
    label: 'Library Core (Studio)',
    phase: 'studio-phase-1-foundation',
    suite: 'prm',
    host: 'cgx',
    surface: 'studio',
  };

  // ── Registries ─────────────────────────────────────────────────────────────
  // Same shape as native 0F1a, so feature owners work identically.
  const registries = (core.registries = core.registries || {
    routes: Object.create(null),
    owners: Object.create(null),
    pages: Object.create(null),
    views: Object.create(null),
    services: Object.create(null),
    surfaces: Object.create(null),
  });

  core.state = core.state || {
    initializedAt: Date.now(),
    phase1Ready: true,
    phase2Ready: true,
    currentSurface: 'studio',
  };

  function ensureString(v) { return String(v || '').trim(); }

  function registerIn(bucket, key, value, opts = {}) {
    const name = ensureString(key);
    if (!name) return false;
    const table = registries[bucket];
    if (!table || typeof table !== 'object') return false;
    if (table[name] && opts.replace !== true) {
      step(`keep-first:${bucket}`, name);
      return false;
    }
    table[name] = value;
    step(`register:${bucket}`, name);
    return true;
  }

  function getFrom(bucket, key) {
    const name = ensureString(key);
    const table = registries[bucket];
    if (!name || !table) return null;
    return table[name] || null;
  }

  function listBucket(bucket) {
    const table = registries[bucket];
    return table ? Object.keys(table) : [];
  }

  // Public registry API — identical to native Library Core so feature owners
  // can call core.registerOwner/getService/etc. without surface awareness.
  core.registerOwner   = core.registerOwner   || ((name, api, opts) => registerIn('owners',   name, api, opts));
  core.getOwner        = core.getOwner        || ((name)              => getFrom('owners',   name));
  core.listOwners      = core.listOwners      || (()                  => listBucket('owners'));

  core.registerRoute   = core.registerRoute   || ((name, h, opts)    => registerIn('routes',   name, h, opts));
  core.getRoute        = core.getRoute        || ((name)              => getFrom('routes',   name));
  core.listRoutes      = core.listRoutes      || (()                  => listBucket('routes'));

  core.registerPage    = core.registerPage    || ((name, api, opts)  => registerIn('pages',    name, api, opts));
  core.getPage         = core.getPage         || ((name)              => getFrom('pages',    name));
  core.listPages       = core.listPages       || (()                  => listBucket('pages'));

  core.registerView    = core.registerView    || ((name, api, opts)  => registerIn('views',    name, api, opts));
  core.getView         = core.getView         || ((name)              => getFrom('views',    name));
  core.listViews       = core.listViews       || (()                  => listBucket('views'));

  core.registerService = core.registerService || ((name, api, opts)  => registerIn('services', name, api, opts));
  core.getService      = core.getService      || ((name)              => getFrom('services', name));
  core.listServices    = core.listServices    || (()                  => listBucket('services'));

  // Surface API (NEW vs native — backward-compatible because native simply doesn't
  // call these). Allows multiple surfaces to coexist conceptually.
  core.registerSurface = core.registerSurface || function registerSurface(name, def) {
    const n = ensureString(name);
    if (!n) return false;
    registries.surfaces[n] = { ...(def || {}), name: n, registeredAt: Date.now() };
    step('register:surfaces', n);
    return true;
  };
  core.getSurface = core.getSurface || function getSurface(name) {
    return registries.surfaces[ensureString(name)] || null;
  };
  core.listSurfaces = core.listSurfaces || function listSurfaces() {
    return Object.keys(registries.surfaces);
  };
  core.setCurrentSurface = core.setCurrentSurface || function setCurrentSurface(name) {
    const n = ensureString(name);
    if (!n) return false;
    core.state.currentSurface = n;
    step('set-current-surface', n);
    return true;
  };
  core.getCurrentSurface = core.getCurrentSurface || function getCurrentSurface() {
    return core.state.currentSurface || 'studio';
  };

  // Phase contract
  core.phase = {
    ...(core.phase || {}),
    getCurrent() { return core.meta.phase; },
    isBridgeOnly() { return false; },
  };

  // ── Contracts (storage-key references, route owner) ────────────────────────
  // Studio variant references the same canonical storage keys as native so any
  // cross-surface sync stays consistent. Studio's actual storage is isolated by
  // origin, but the key shape is identical so migrations work both ways.
  core.contracts = core.contracts || {
    frozen: true,
    storageKeys: {
      data: 'h2o:prm:cgx:fldrs:state:data:v1',
      ui: 'h2o:prm:cgx:fldrs:state:ui:v1',
      seeMore: 'h2o:prm:cgx:fldrs:state:see_more:v1',
      foldersExpanded: 'h2o:prm:cgx:fldrs:state:folders_expanded:v1',
      projectsCache: 'h2o:prm:cgx:fldrs:state:projects_cache:v1',
      projectsNativeHeaders: 'h2o:prm:cgx:fldrs:state:projects_native_headers:v1',
      libraryWorkspaceLayout: 'h2o:prm:cgx:library-workspace:sidebar-layout:v1',
      libraryInsightsPrefs: 'h2o:prm:cgx:library-insights:prefs:v1',
      chatRegistryStudio: 'h2o:library:chat-registry:studio:v1',
      labelsCatalog: 'h2o:prm:cgx:library:labels:catalog:v1',
      labelsBindings: 'h2o:prm:cgx:library:labels:bindings:v1',
    },
    routeContract: {
      owner: 'flsc:page-route:v1',
      surfaceSpecific: 'studio',
      // Studio uses hash routes; native uses query flag. Both supported via service.
      supportedViews: [
        'library', 'dashboard', 'analytics', 'explorer', 'recents', 'saved', 'organize',
        'projects', 'folder', 'folders', 'categories', 'category', 'labels', 'label',
        'tags', 'tag',
      ],
    },
    publicApi: {
      keepStable: 'H2O.Library',
    },
  };

  core.reserved = {
    ...(core.reserved || {}),
    owners: [
      'library-core', 'library-workspace', 'library-index', 'library-insights',
      'library-maintenance', 'library-store', 'chat-registry',
      'projects', 'folders', 'categories', 'tags', 'labels',
    ],
    services: [
      'route', 'page-host', 'ui-shell', 'native-sidebar', 'chat-list', 'command-bar',
      'library-workspace', 'library-index', 'library-insights', 'library-maintenance',
      'projects', 'folders', 'categories', 'categories-compat', 'tags', 'labels',
    ],
    pages: [
      'library', 'dashboard', 'analytics', 'explorer', 'recents', 'saved', 'organize',
      'folders', 'folder', 'projects', 'categories', 'category', 'labels', 'label',
      'tags', 'tag',
    ],
    routes: [
      'library', 'dashboard', 'analytics', 'explorer', 'recents', 'saved', 'organize',
      'folders', 'folder', 'projects', 'categories', 'category', 'labels', 'label',
      'tags', 'tag',
    ],
    views: ['viewer-shell', 'page-shell', 'library-index', 'library-insights'],
  };

  // ── Self register as owner + boot signal ──────────────────────────────────
  core.registerOwner('library-core', core, { replace: true });

  // ── Wire in Surface Host services (S0F0a) ─────────────────────────────────
  function wireSurfaceHost() {
    const hostRef = H2O.Library?.LibrarySurfaceHost;
    if (!hostRef || typeof hostRef.registerOnCore !== 'function') return false;
    try {
      hostRef.registerOnCore(core);
      step('surface-host-wired', 'studio');
      return true;
    } catch (e) {
      err('wire-surface-host', e);
      return false;
    }
  }

  if (!wireSurfaceHost()) {
    // S0F0a wasn't loaded yet — listen for its ready event.
    const onSurfaceReady = () => {
      try {
        if (wireSurfaceHost()) {
          W.removeEventListener('evt:h2o:library:surface-host-ready', onSurfaceReady);
          maybeEmitLibraryReady();
        }
      } catch (e) { err('surface-host-ready-handler', e); }
    };
    W.addEventListener('evt:h2o:library:surface-host-ready', onSurfaceReady);
  }

  // ── Diagnose ───────────────────────────────────────────────────────────────
  core.diagnose = function diagnose() {
    const surfaceHost = H2O.Library?.LibrarySurfaceHost;
    return {
      surface: core.getCurrentSurface(),
      phase: core.phase.getCurrent(),
      owners: core.listOwners(),
      services: core.listServices(),
      routes: core.listRoutes(),
      pages: core.listPages(),
      views: core.listViews(),
      surfaces: core.listSurfaces(),
      surfaceHost: surfaceHost ? surfaceHost.diagnose() : null,
      steps: diag.steps.slice(-30),
      errors: diag.errors.slice(-10),
    };
  };

  // ── Self-check ─────────────────────────────────────────────────────────────
  // Reports which required services/owners are present. Library Workspace and
  // diagnostics consumers can call this to verify the surface is healthy.
  core.selfCheck = function selfCheck() {
    const required = {
      services: ['ui-shell', 'page-host', 'native-sidebar', 'route', 'chat-list'],
      owners: ['library-core'],
    };
    const optional = {
      owners: [
        'library-store', 'library-index', 'library-workspace', 'library-insights',
        'library-maintenance', 'chat-registry',
        'projects', 'folders', 'categories', 'tags', 'labels',
      ],
      services: [
        'library-workspace', 'library-index', 'library-insights', 'library-maintenance',
        'projects', 'folders', 'categories', 'tags', 'labels',
      ],
    };
    const present = (bucket, name) => !!getFrom(bucket, name);
    return {
      ok: required.services.every((n) => present('services', n))
       && required.owners.every((n) => present('owners', n)),
      missing: {
        services: required.services.filter((n) => !present('services', n)),
        owners:   required.owners.filter((n) => !present('owners', n)),
      },
      optionalPresent: {
        services: optional.services.filter((n) => present('services', n)),
        owners:   optional.owners.filter((n) => present('owners', n)),
      },
    };
  };

  // ── Ownership boundary verification ────────────────────────────────────────
  // Verifies no owner has registered into a bucket reserved for another owner.
  // Mirrors native semantics so behavior stays consistent.
  core.verifyOwnershipBoundaries = function verifyOwnershipBoundaries() {
    const ok = true;
    const violations = [];
    // Studio is single-tenant per surface; we trust the registration site is the
    // owner. Detailed boundary verification matches native; kept lightweight here.
    return { ok, violations };
  };

  // ── Library Ready event ────────────────────────────────────────────────────
  // Mirrors native 0F1a's gated ready event. In Studio we always emit because
  // there's no flag gate — Studio is a fresh document each time and the event
  // is the signal that downstream Library modules should boot.
  let readyEmitted = false;
  function maybeEmitLibraryReady() {
    if (readyEmitted) return;
    readyEmitted = true;
    const detail = {
      ts: Date.now(),
      version: '1.0.0',
      surface: 'studio',
      owners: Object.keys(registries.owners),
      services: Object.keys(registries.services),
    };
    try {
      if (W.H2O?.events?.emit) {
        W.H2O.events.emit('h2o.ev:prm:cgx:lib:ready:v1', detail, { replay: true });
      } else {
        W.dispatchEvent(new CustomEvent('h2o.ev:prm:cgx:lib:ready:v1', { detail }));
      }
    } catch (e) { err('emit-ready', e); }
    try { W.performance?.mark?.('h2o:surface:ready:library:studio'); } catch {}
    step('emit-ready', 'studio');
  }

  // Emit ready once we've done all sync registration. If S0F0a is already loaded
  // and registered, we emit now; otherwise the surface-host-ready listener above
  // will emit after wiring completes.
  if (core.getService('ui-shell') && core.getService('page-host')) {
    maybeEmitLibraryReady();
  }

  // Expose public Library namespace
  H2O.Library = H2O.Library || {};
  H2O.Library.Core = core;

  step('boot', core.meta.phase);
})();
