/* H2O Studio — Store: Prefs (Phase 1b)
 *
 * Studio-local key-value store for transient UI preferences. Backs the
 * passive H2O.Studio.dock shell's open/view persistence and is available
 * as generic KV storage for other future Studio UI prefs.
 *
 * Scope discipline:
 *   - Studio-local keys only (must begin with 'h2o:studio:'). Writes to
 *     other key shapes (e.g., the native 'h2o:prm:cgx:dckpnl:*' Dock
 *     Panel keys) are refused. Studio Dock UI state must NOT use native
 *     key names.
 *   - No cross-surface sync. This store mirrors no native data and does
 *     not subscribe to chrome.storage.onChanged here.
 *   - No feature data. For entity data use the dedicated entity store
 *     (currently only store/highlights.js exists).
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage when a real adapter is bound
 *     (env.adapter !== 'fallback'). Both reads and writes are async; we
 *     keep a synchronous in-memory cache so callers can use get/set
 *     without await.
 *   - Falls back to a pure in-memory Map when no real adapter is bound.
 *     selfCheck reports the fallback so callers can surface a warning.
 *
 * Boot flow:
 *   1. IIFE installs H2O.Studio.store.prefs synchronously and arranges
 *      to survive a later H2O.Studio.store reassignment (which the
 *      legacy store/index.js bootstrap performs).
 *   2. bootHydrate reads known Studio Dock keys from platform.storage in
 *      the background. The cache is empty until that completes.
 *   3. When hydrate completes (success or failure), subscribers receive
 *      a 'ready' event with source: 'boot' so they can refresh.
 *
 * Clobber defense:
 *   store/index.js performs an unconditional `H2O.Studio.store = store;`
 *   line at install. If prefs.js is loaded BEFORE store/index.js (because
 *   the Dock shell depends on prefs being available at its own install
 *   time, which is BEFORE store/index.js in studio.html), that
 *   replacement would lose the prefs entity. To stay robust without
 *   reordering scripts in studio.html, prefs.js installs a property
 *   accessor on H2O.Studio that re-attaches the prefs entity onto any
 *   future store reassignment. After store/index.js runs, the new store
 *   carries `prefs` and __registerEntity continues to work normally for
 *   highlights and any future entities.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1b scope)
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 *   src-surfaces-base/studio/store/README.md
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};

  /* Idempotency: if prefs already installed, exit. */
  if (H2O.Studio.store && H2O.Studio.store.prefs && H2O.Studio.store.prefs.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1b';
  const STUDIO_KEY_PREFIX = 'h2o:studio:';
  const SAVE_DEBOUNCE_MS = 250;

  const KEYS = Object.freeze({
    dockOpen: 'h2o:studio:dock:open:v1',
    dockView: 'h2o:studio:dock:view:v1',
    ribbonActiveTab: 'h2o:studio:ribbon:active-tab:v1',
    ribbonCollapsed: 'h2o:studio:ribbon:collapsed:v1',
  });

  /* ── State ────────────────────────────────────────────────────────── */
  const cache = new Map();
  const subscribers = new Set();
  const errors = [];
  const errMax = 20;
  let saveTimer = null;
  const pendingFlush = new Set();
  let hydrated = false;
  let platformStorage = null;
  let hasPlatformStorage = false;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function detectPlatformStorage() {
    try {
      const platform = H2O.Studio && H2O.Studio.platform;
      if (!platform || !platform.storage) return { ps: null, real: false };
      const env = platform.env || {};
      const real = env.adapter && env.adapter !== 'fallback';
      return { ps: platform.storage, real: !!real };
    } catch (_) {
      return { ps: null, real: false };
    }
  }

  function recordError(op, e) {
    try {
      const message = String((e && e.message) || (e && e.stack) || e || '');
      errors.push({ t: Date.now(), op: String(op), e: message });
      if (errors.length > errMax) {
        errors.splice(0, errors.length - errMax);
      }
    } catch (_) { /* swallow */ }
  }

  function notify(event) {
    subscribers.forEach(function (fn) {
      try { fn(event); }
      catch (e) { recordError('subscriber', e); }
    });
  }

  function isStudioKey(key) {
    return typeof key === 'string' && key.indexOf(STUDIO_KEY_PREFIX) === 0;
  }

  function scheduleFlush() {
    if (!hasPlatformStorage) return;
    if (saveTimer) return;
    try {
      saveTimer = setTimeout(function () {
        saveTimer = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    } catch (e) {
      saveTimer = null;
      recordError('scheduleFlush', e);
    }
  }

  function flush() {
    if (!hasPlatformStorage || !platformStorage) return;
    const keys = Array.from(pendingFlush);
    pendingFlush.clear();
    keys.forEach(function (key) {
      const has = cache.has(key);
      try {
        if (!has) {
          if (typeof platformStorage.remove === 'function') {
            const p = platformStorage.remove(key);
            if (p && typeof p.catch === 'function') {
              p.catch(function (e) { recordError('flush:remove:' + key, e); });
            }
          }
        } else {
          const value = cache.get(key);
          const p = platformStorage.set(key, value);
          if (p && typeof p.catch === 'function') {
            p.catch(function (e) { recordError('flush:set:' + key, e); });
          }
        }
      } catch (e) {
        recordError('flush:' + key, e);
      }
    });
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  function get(key, fallback) {
    if (typeof key !== 'string' || key === '') return fallback;
    if (cache.has(key)) return cache.get(key);
    return fallback;
  }

  function set(key, value) {
    if (typeof key !== 'string' || key === '') return;
    if (!isStudioKey(key)) {
      recordError('set:non-studio-key', new Error('refusing to set non-studio key: ' + key));
      return;
    }
    const had = cache.has(key);
    const oldValue = had ? cache.get(key) : undefined;
    cache.set(key, value);
    pendingFlush.add(key);
    scheduleFlush();
    notify({ type: 'set', key: key, value: value, oldValue: oldValue, at: Date.now(), source: 'local' });
  }

  function remove(key) {
    if (typeof key !== 'string' || key === '') return;
    if (!isStudioKey(key)) {
      recordError('remove:non-studio-key', new Error('refusing to remove non-studio key: ' + key));
      return;
    }
    if (!cache.has(key)) return;
    const oldValue = cache.get(key);
    cache.delete(key);
    pendingFlush.add(key);
    scheduleFlush();
    notify({ type: 'remove', key: key, value: undefined, oldValue: oldValue, at: Date.now(), source: 'local' });
  }

  function getAll(prefix) {
    const result = {};
    const p = typeof prefix === 'string' ? prefix : '';
    cache.forEach(function (value, key) {
      if (p === '' || key.indexOf(p) === 0) {
        result[key] = value;
      }
    });
    return result;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.add(fn);
    return function unsubscribe() {
      subscribers.delete(fn);
    };
  }

  function isReady() {
    return hydrated;
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      hasPlatformStorage: hasPlatformStorage,
      fallback: hasPlatformStorage ? 'platform' : 'memory',
      keyCount: cache.size,
      errors: errors.slice(),
    };
  }

  /* ── Boot hydration ───────────────────────────────────────────────── */
  function markReady() {
    if (hydrated) return;
    hydrated = true;
    notify({ type: 'ready', key: null, value: null, oldValue: null, at: Date.now(), source: 'boot' });
  }

  function bootHydrate() {
    const detected = detectPlatformStorage();
    platformStorage = detected.ps;
    hasPlatformStorage = detected.real;

    if (!hasPlatformStorage) {
      try { markReady(); }
      catch (e) { recordError('boot:markReady', e); }
      return;
    }

    const keysToLoad = [KEYS.dockOpen, KEYS.dockView, KEYS.ribbonActiveTab, KEYS.ribbonCollapsed];
    let remaining = keysToLoad.length;

    function done() {
      remaining -= 1;
      if (remaining === 0) {
        try { markReady(); }
        catch (e) { recordError('boot:markReady', e); }
      }
    }

    keysToLoad.forEach(function (key) {
      try {
        const result = platformStorage.get(key);
        if (result && typeof result.then === 'function') {
          result.then(function (value) {
            if (value !== undefined && value !== null) {
              cache.set(key, value);
            }
            done();
          }, function (e) {
            recordError('boot:hydrate:' + key, e);
            done();
          });
        } else {
          if (result !== undefined && result !== null) {
            cache.set(key, result);
          }
          done();
        }
      } catch (e) {
        recordError('boot:hydrate:' + key, e);
        done();
      }
    });
  }

  /* ── Build the prefs entity ───────────────────────────────────────── */
  const prefsApi = {
    version: VERSION,
    keys: KEYS,
    get: get,
    set: set,
    remove: remove,
    getAll: getAll,
    subscribe: subscribe,
    isReady: isReady,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Install with clobber defense ─────────────────────────────────── */
  /* If H2O.Studio.store already exists (e.g. store/index.js loaded
   * earlier), attach directly. Otherwise create a stub object and
   * install a property accessor on H2O.Studio so that when store/index.js
   * later assigns H2O.Studio.store = newStore, the prefs entity is
   * re-attached to the new store object. */

  function attachToStore(target) {
    if (!target || typeof target !== 'object') return;
    /* Never override an already-installed prefs object. */
    if (target.prefs && target.prefs.__installed) {
      return;
    }
    target.prefs = prefsApi;
  }

  if (H2O.Studio.store && typeof H2O.Studio.store === 'object') {
    /* Common case after store/index.js: attach directly. */
    attachToStore(H2O.Studio.store);
  } else {
    /* prefs.js loaded before store/index.js: create a stub and defend. */
    let underlyingStore = Object.create(null);
    attachToStore(underlyingStore);
    try {
      Object.defineProperty(H2O.Studio, 'store', {
        configurable: true,
        enumerable: true,
        get: function () { return underlyingStore; },
        set: function (newStore) {
          if (newStore && typeof newStore === 'object') {
            attachToStore(newStore);
            underlyingStore = newStore;
          } else {
            underlyingStore = newStore;
          }
        },
      });
    } catch (e) {
      recordError('install:defineProperty', e);
      /* Best-effort fallback: attach directly. May still be clobbered
       * later, but at least the API exists for any consumer that runs
       * before store/index.js. */
      H2O.Studio.store = underlyingStore;
    }
  }

  /* Kick off async hydration. Safe to call before the property defense
   * settles because we close over `prefsApi` and `cache`. */
  bootHydrate();
})(globalThis);
