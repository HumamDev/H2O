// ==UserScript==
// @h2o-id             s0f1k.library_canonical_services.studio
// @name               S0F1k. 🎬 Library Canonical Services - Studio
// @namespace          H2O.Premium.CGX.library_canonical_services.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260515-000002
// @description        Phase 1 of the Library migration — Studio surface. Registers the 14 canonical service names (storage, registry, index, archive, native-link-opener, current-chat-provider, project-provider, folder-provider, category-provider, label-provider, tag-provider, event-bus, sync-bridge, archive-bridge) on H2O.LibraryCore as thin aliases over Studio's existing implementations. Adds H2O.LibraryCore.listCanonicalServices() / getCanonicalServiceStatus() diagnostics and the minimal H2O.flags registry. Strictly additive — no Studio module is changed, no record shape touched, no behavior gated.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1k Library Canonical Services (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});

  const VERSION = '1.0.0';
  const SURFACE = 'studio';
  const TAG = '[H2O.LibraryCanonicalServices(Studio)]';

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

  // ── Canonical service names (identical to native 0F1k) ────────────────────
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
  // Studio runs in chrome-extension origin. We attempt chrome.tabs.create first
  // (the right call from an extension page) and fall back to window.open so
  // anonymous test consoles still work. Phase 7 will tighten this further.
  const nativeLinkOpener = Object.freeze({
    __canonicalName: 'native-link-opener',
    __surface: SURFACE,
    open(url, opts = {}) {
      const target = (opts && opts.target) || '_blank';
      const features = (opts && opts.features) || 'noopener,noreferrer';
      const u = String(url || '');
      try {
        if (W.chrome?.tabs?.create) {
          W.chrome.tabs.create({ url: u, active: !(opts && opts.background) });
          return null;
        }
      } catch (e) { err('native-link-opener.chrome-tabs', e); }
      try {
        return W.open(u, target, features);
      } catch (e) {
        err('native-link-opener.window-open', e);
        return null;
      }
    },
    diagnose() {
      return {
        name: 'native-link-opener',
        surface: SURFACE,
        hasChromeTabs: !!W.chrome?.tabs?.create,
        ok: true,
      };
    },
  });

  // ── Current-chat provider (Studio: explicit unsupported) ──────────────────
  // Studio has no live ChatGPT chat. Reader-snapshot chatId is conceptually
  // different from "the user's currently focused native chat" and we do not
  // want callers to confuse them in Phase 1. Surface this as a placeholder
  // that is safe to call but always returns "".
  const currentChatProvider = Object.freeze({
    __canonicalName: 'current-chat-provider',
    __surface: SURFACE,
    __placeholder: true,
    unsupported: true,
    reason: 'studio-has-no-live-chatgpt-chat',
    getCurrentChatHref() { return ''; },
    getCurrentChatId() { return ''; },
    diagnose() {
      return {
        name: 'current-chat-provider',
        surface: SURFACE,
        unsupported: true,
        reason: 'studio-has-no-live-chatgpt-chat',
      };
    },
  });

  // ── Resolver ───────────────────────────────────────────────────────────────
  function resolveCanonical(name) {
    switch (name) {
      case 'storage': {
        const s = H2O.Library?.Store;
        return s || placeholder('storage', 'H2O.Library.Store not available — load S0F1e');
      }
      case 'registry': {
        const r = H2O.ChatRegistry;
        return r || placeholder('registry', 'H2O.ChatRegistry not available — load S0F1g');
      }
      case 'index': {
        const i = H2O.LibraryIndex;
        return i || placeholder('index', 'H2O.LibraryIndex not available — load S0F1c');
      }
      case 'archive': {
        const a = H2O.archiveBoot || H2O.archive;
        return a || placeholder('archive', 'H2O.archiveBoot / H2O.archive not available — load S0D3a');
      }
      case 'native-link-opener':    return nativeLinkOpener;
      case 'current-chat-provider': return currentChatProvider;
      case 'project-provider': {
        const p = H2O.Projects;
        return p || placeholder('project-provider', 'H2O.Projects not available — load S0F2a');
      }
      case 'folder-provider': {
        const f = H2O.folders;
        return f || placeholder('folder-provider', 'H2O.folders not available — load S0F3a');
      }
      case 'category-provider': {
        const c = H2O.Categories;
        return c || placeholder('category-provider', 'H2O.Categories not available — load S0F4a');
      }
      case 'label-provider': {
        const l = H2O.Labels;
        return l || placeholder('label-provider', 'H2O.Labels not available — load S0F6a');
      }
      case 'tag-provider': {
        const t = H2O.Tags;
        return t || placeholder('tag-provider', 'H2O.Tags not available — load S0F5a');
      }
      case 'event-bus': {
        const e = H2O.events;
        return e || placeholder('event-bus', 'H2O.events not available — load S0A1a H2O Core');
      }
      case 'sync-bridge': {
        const s = H2O.Library?.Sync;
        return s || placeholder('sync-bridge', 'H2O.Library.Sync not available — load S0F1h');
      }
      case 'archive-bridge': {
        // Studio's archive-bridge is the chat-list service registered by the
        // Surface Host (S0F0a) — it talks to chatgpt.com tabs via the extension
        // message bridge to fetch workbench rows, folder bindings, etc.
        const core = H2O.LibraryCore;
        const chatList = core?.getService?.('chat-list');
        if (chatList) return chatList;
        const host = H2O.Library?.LibrarySurfaceHost;
        const direct = host?.chatListService;
        return direct || placeholder('archive-bridge', 'chat-list service not registered yet — load S0F0a');
      }
      default:
        return placeholder(name, 'unknown-canonical-service-name');
    }
  }

  function isPlaceholder(value) {
    return !!(value && typeof value === 'object' && value.__placeholder === true);
  }

  // ── H2O.flags registry (minimal, per-surface) ──────────────────────────────
  // Studio runs in chrome-extension origin; its localStorage is isolated from
  // chatgpt.com. Phase 1 keeps these surfaces decoupled — no bridge sync.
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
  function boot() {
    ensureFlags();
    const core = H2O.LibraryCore;
    if (!core) return false;
    installCanonicalDiagnostics(core);
    registerCanonicalServices(core);
    return true;
  }

  if (!boot()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => boot(), { once: true });
  } else {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => {
      try {
        const core = H2O.LibraryCore;
        if (core) registerCanonicalServices(core);
      } catch (e) { err('rebind-on-ready', e); }
    }, { once: true });
  }

  // Late-rebind to catch modules that boot after LibraryCore-ready (Tags,
  // Projects-derived facets, etc.).
  W.setTimeout(() => {
    try {
      const core = H2O.LibraryCore;
      if (core) registerCanonicalServices(core);
      step('late-rebind');
    } catch (e) { err('late-rebind', e); }
  }, 350);

  // Public surface
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
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  });

  step('boot', 'studio-library-canonical-services-ready');
  try { console.log(`${TAG} v${VERSION} ready — canonical=${CANONICAL_SERVICES.length}`); } catch {}
})();
