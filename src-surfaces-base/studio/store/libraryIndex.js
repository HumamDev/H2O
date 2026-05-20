/* H2O Studio Store — Library Index Entity (Phase E1 Stage 1: parallel infra)
 *
 * Persistence façade for Studio's Library Index — the denormalized
 * row-and-facet view that S0F1c. 🎬 Library Index - Studio.js builds from
 * the archive chat-list service and the cross-surface broadcast.
 *
 * STAGE 1 SCOPE: parallel infrastructure only. This entity registers itself
 * on H2O.Studio.store.libraryIndex and hydrates from the canonical key, but
 * NO feature code consumes it yet. S0F1c continues to own its current
 * persistence path (via H2O.Library.Store) unchanged. Stage 2 will migrate
 * the read path; Stage 3 will migrate the write path. See store/README.md
 * Migration Status table for the broader plan.
 *
 * Domain note: this is a PERSISTED DERIVED CACHE, not a source of truth.
 * The canonical chat metadata lives in store.chats (future Phase E2). Index
 * rows are aggregable, denormalized projections rebuilt from chats + the
 * archive chat-list. Treat the persisted blob as a hydration accelerator,
 * not as the authoritative chat state.
 *
 * Active storage path:
 *   chrome.storage.local  ←  H2O.Studio.store.libraryIndex
 *
 * Cross-tab sync: NOT bound in Stage 1. Library Index is Studio-only
 * (no shared native key) and its existing in-tab notification path
 * (`evt:h2o:library-index:updated`) is owned by S0F1c. Adding cross-tab
 * sync at the entity layer is a Stage 2+ design question.
 *
 * Wire format (compatible with current S0F1c persistence):
 *   key   : 'h2o:prm:cgx:library-index:studio:registry:v1'
 *   shape : { schemaVersion?: 1, rows: IndexRow[], ts?: number }
 *   debounce: 250ms
 *   schemaVersion: 1
 *
 * Contracts: surfaces/studio/store/README.md
 *            surfaces/studio/STUDIO_STORAGE_CONTRACT.md
 *            surfaces/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  var store = H2O.Studio.store;
  if (!store || typeof store.__registerEntity !== 'function') {
    /* store/index.js didn't load — fail closed but don't throw. */
    try { console.warn('[H2O.Studio.store.libraryIndex] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.libraryIndex && store.libraryIndex.__installed) {
    return;
  }

  /* ── Constants ────────────────────────────────────────────────────── */
  var KEY_DISK_CANON = 'h2o:prm:cgx:library-index:studio:registry:v1';
  var SCHEMA_VERSION = 1;
  var SAVE_DEBOUNCE_MS = 250;

  /* ── State ────────────────────────────────────────────────────────── */
  var state = {
    cache: null,                /* { schemaVersion, rows, ts } | null */
    ready: false,
    pending: false,
    saveTimer: null,
    lastSavedAt: null,
    lastFlushAt: null,
    lastReloadedAt: null,
    lastWriteAt: null,
    writesSinceBoot: 0,
    savesSinceBoot: 0,
    errors: [],
    errMax: 20,
    warnings: [],
    warnMax: 20,
    subscribers: new Set(),
  };

  function recordWrite(/* op */) {
    state.writesSinceBoot += 1;
    state.lastWriteAt = Date.now();
  }
  function recordWarning(msg) {
    try {
      state.warnings.push({ t: Date.now(), msg: String(msg) });
      if (state.warnings.length > state.warnMax) {
        state.warnings.splice(0, state.warnings.length - state.warnMax);
      }
    } catch (_) { /* swallow */ }
  }
  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.stack) || e || '') });
      if (state.errors.length > state.errMax) {
        state.errors.splice(0, state.errors.length - state.errMax);
      }
    } catch (_) { /* swallow */ }
  }

  /* ── Capability detection ─────────────────────────────────────────── */
  function hasChromeStorage() {
    try {
      return !!(global.chrome && global.chrome.storage && global.chrome.storage.local
        && typeof global.chrome.storage.local.get === 'function'
        && typeof global.chrome.storage.local.set === 'function');
    } catch (_) { return false; }
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function isPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    var proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }
  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch (_) { return null; }
  }
  /* Coerce any input into the canonical {schemaVersion, rows, ts} shape.
   * Accepts:
   *   - a plain object (existing snapshot, possibly missing fields)
   *   - an array (treated as the rows list)
   *   - null/undefined (returns an empty snapshot)
   * Always returns a fresh top-level object; rows are NOT cloned — the
   * caller decides whether they need a defensive copy. */
  function ensureShape(input) {
    var snap;
    if (Array.isArray(input)) {
      snap = { schemaVersion: SCHEMA_VERSION, rows: input.slice(), ts: Date.now() };
    } else if (isPlainObject(input)) {
      var rows = Array.isArray(input.rows) ? input.rows : [];
      snap = {
        schemaVersion: Number(input.schemaVersion) || SCHEMA_VERSION,
        rows: rows,
        ts: Number(input.ts) || 0,
      };
    } else {
      snap = { schemaVersion: SCHEMA_VERSION, rows: [], ts: 0 };
    }
    return snap;
  }

  /* ── Low-level disk I/O ───────────────────────────────────────────── */
  function readCanonical() {
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) {
        recordWarning('chrome.storage unavailable on read');
        resolve(null);
        return;
      }
      try {
        global.chrome.storage.local.get([KEY_DISK_CANON], function (r) {
          var v = r && r[KEY_DISK_CANON];
          resolve(isPlainObject(v) ? v : null);
        });
      } catch (e) {
        recordError('readCanonical.chrome.throw', e);
        resolve(null);
      }
    });
  }

  function writeCanonical(snap) {
    var safe = ensureShape(snap);
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) {
        recordWarning('chrome.storage unavailable on write');
        state.lastSavedAt = Date.now();
        state.lastFlushAt = state.lastSavedAt;
        state.savesSinceBoot += 1;
        resolve();
        return;
      }
      try {
        var obj = {};
        obj[KEY_DISK_CANON] = safe;
        global.chrome.storage.local.set(obj, function () {
          var err = global.chrome && global.chrome.runtime && global.chrome.runtime.lastError;
          if (err) recordError('writeCanonical.chrome', err);
          state.lastSavedAt = Date.now();
          state.lastFlushAt = state.lastSavedAt;
          state.savesSinceBoot += 1;
          resolve();
        });
      } catch (e) {
        recordError('writeCanonical.chrome.throw', e);
        state.lastSavedAt = Date.now();
        state.lastFlushAt = state.lastSavedAt;
        state.savesSinceBoot += 1;
        resolve();
      }
    });
  }

  function scheduleSave() {
    state.pending = true;
    if (state.saveTimer) return;
    state.saveTimer = global.setTimeout(function () {
      state.saveTimer = null;
      if (!state.pending || state.cache == null) return;
      state.pending = false;
      writeCanonical(state.cache).catch(function (e) { recordError('scheduleSave.write', e); });
    }, SAVE_DEBOUNCE_MS);
  }

  function notifySubscribers(change) {
    state.subscribers.forEach(function (fn) {
      try { fn(change || {}); } catch (e) { recordError('notifySubscribers', e); }
    });
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  function init() {
    if (state.ready) return Promise.resolve(state.cache);
    return readCanonical().then(function (snap) {
      state.cache = ensureShape(snap || {});
      state.lastReloadedAt = Date.now();
      state.ready = true;
      return state.cache;
    }).catch(function (e) {
      recordError('init', e);
      state.cache = ensureShape({});
      state.ready = true;
      return state.cache;
    });
  }

  function dispose() {
    if (state.saveTimer) {
      try { global.clearTimeout(state.saveTimer); } catch (_) { /* ignore */ }
      state.saveTimer = null;
    }
    state.ready = false;
  }

  function isReady() { return !!state.ready; }

  /* Returns the LIVE in-memory cache reference (not a clone). Mirrors the
   * byte-parity contract used by store.highlights.getAll(). Feature code
   * MUST NOT mutate the returned object directly — use setAll() / update()
   * for mutations. */
  function getAll() {
    if (state.cache == null) state.cache = ensureShape({});
    return state.cache;
  }

  /* Convenience: returns a defensive shallow copy of the rows array.
   * Safe to mutate; the underlying cache is not affected. */
  function list() {
    if (state.cache == null) state.cache = ensureShape({});
    var rows = Array.isArray(state.cache.rows) ? state.cache.rows : [];
    return rows.slice();
  }

  /* Replace the cache atomically. Accepts either a rows array or a full
   * snapshot object. Always coerced through ensureShape(). */
  function setAll(rowsOrSnapshot) {
    state.cache = ensureShape(rowsOrSnapshot);
    if (!state.cache.ts) state.cache.ts = Date.now();
    recordWrite('setAll');
    scheduleSave();
    notifySubscribers({ source: 'local', op: 'setAll' });
  }

  function update(updaterOrObj) {
    if (!state.cache) state.cache = ensureShape({});
    var next;
    if (typeof updaterOrObj === 'function') {
      var draft = clone(state.cache) || ensureShape({});
      var result;
      try { result = updaterOrObj(draft); }
      catch (e) { recordError('update.updater', e); return; }
      next = isPlainObject(result) || Array.isArray(result) ? result : draft;
    } else if (isPlainObject(updaterOrObj) || Array.isArray(updaterOrObj)) {
      next = updaterOrObj;
    } else {
      recordError('update', new Error('invalid argument: expected function, plain object, or array'));
      return;
    }
    state.cache = ensureShape(next);
    if (!state.cache.ts) state.cache.ts = Date.now();
    recordWrite('update');
    scheduleSave();
    notifySubscribers({ source: 'local', op: 'update' });
  }

  function saveNow() {
    if (state.saveTimer) {
      try { global.clearTimeout(state.saveTimer); } catch (_) { /* ignore */ }
      state.saveTimer = null;
    }
    state.pending = false;
    if (state.cache == null) return Promise.resolve();
    return writeCanonical(state.cache).catch(function (e) { recordError('saveNow', e); });
  }

  function reload() {
    return readCanonical().then(function (snap) {
      state.cache = ensureShape(snap || {});
      state.lastReloadedAt = Date.now();
      notifySubscribers({ source: 'reload' });
      return clone(state.cache) || ensureShape({});
    }).catch(function (e) {
      recordError('reload', e);
      return state.cache ? (clone(state.cache) || ensureShape({})) : ensureShape({});
    });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    state.subscribers.add(fn);
    return function () { state.subscribers.delete(fn); };
  }

  function diagnose() {
    var backend = hasChromeStorage() ? 'chrome.storage' : 'none';
    var cacheRows = state.cache && Array.isArray(state.cache.rows) ? state.cache.rows.length : 0;
    return {
      installed: true,
      ready: state.ready,
      schemaVersion: SCHEMA_VERSION,
      backend: backend,
      canonicalKey: KEY_DISK_CANON,
      cacheRows: cacheRows,
      pendingSave: !!state.pending,
      saveDebounceMs: SAVE_DEBOUNCE_MS,
      lastSavedAt: state.lastSavedAt,
      lastFlushAt: state.lastFlushAt,
      lastReloadedAt: state.lastReloadedAt,
      lastWriteAt: state.lastWriteAt,
      writesSinceBoot: state.writesSinceBoot,
      savesSinceBoot: state.savesSinceBoot,
      subscribers: state.subscribers.size,
      errors: state.errors.slice(),
      warnings: state.warnings.slice(),
    };
  }

  /* ── Register & schedule init ─────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: getAll,
    list: list,
    setAll: setAll,
    update: update,
    saveNow: saveNow,
    reload: reload,
    subscribe: subscribe,
    diagnose: diagnose,
  };
  store.__registerEntity('libraryIndex', api);

  /* Hydrate on next tick so the platform adapter has time to register.
   * init() only READS the canonical key — no mutation on boot. */
  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
