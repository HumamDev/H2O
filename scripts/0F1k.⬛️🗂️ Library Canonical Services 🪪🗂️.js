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

  // One-shot late re-register for modules that boot after LibraryCore-ready
  // (Projects, Tags occurrence index, etc.). This is purely additive — it just
  // re-resolves the alias targets so a previously-placeholder slot can become
  // a real impl without restarting the page.
  W.setTimeout(() => {
    try {
      const core = H2O.LibraryCore;
      if (core) registerCanonicalServices(core);
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
        steps: diag.steps.slice(-15),
        errors: diag.errors.slice(-10),
      };
    },
  });

  step('boot', 'native-library-canonical-services-ready');
  try { console.log(`${TAG} v${VERSION} ready — canonical=${CANONICAL_SERVICES.length}`); } catch {}
})();
