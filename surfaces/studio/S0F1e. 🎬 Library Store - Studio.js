// ==UserScript==
// @h2o-id             s0f1e.library_store.studio
// @name               S0F1e. 🎬 Library Store - Studio
// @namespace          H2O.Premium.CGX.library_store.studio
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260511-000003
// @description        Studio Library Store: async durable KV facade for Library state. Prefers IndexedDB (h2o.library.studio DB) and falls back to localStorage. Isolated from chatgpt.com origin and from the extension service-worker storage. Shape-compatible with native 0F1e Library Store so feature owners use one API.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              none
// ==/UserScript==

(() => {
  'use strict';

  console.log('H2O DEV LOAD ✅ S0F1e Library Store (Studio)', Date.now());

  const W = window;
  const H2O = (W.H2O = W.H2O || {});
  H2O.Library = H2O.Library || {};

  if (H2O.Library.Store && H2O.Library.Store.__studio === true) {
    // Already initialized — keep first registration.
    return;
  }

  // ── Diagnostics ────────────────────────────────────────────────────────────
  const STORE_KEY = 'Store';
  const diag = { t0: performance.now(), steps: [], errors: [], bufMax: 100, errMax: 30 };
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

  class LibraryStoreError extends Error {
    constructor(message, opts = {}) {
      super(String(message || 'LibraryStoreError'));
      this.name = 'LibraryStoreError';
      this.cause = opts.cause || null;
      this.code = String(opts.code || 'studio-store');
    }
  }

  // ── IndexedDB adapter (preferred) ──────────────────────────────────────────
  const DB_NAME = 'h2o.library.studio';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';

  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    if (!W.indexedDB) return Promise.reject(new LibraryStoreError('indexedDB unavailable', { code: 'no-idb' }));
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = W.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(new LibraryStoreError('idb open threw', { cause: e })); return; }
      req.onupgradeneeded = () => {
        try {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        } catch (e) { err('upgrade', e); }
      };
      req.onerror = () => reject(new LibraryStoreError(String(req.error?.message || 'idb error'), { cause: req.error }));
      req.onsuccess = () => resolve(req.result);
      req.onblocked = () => err('open.blocked', 'idb open blocked');
    });
    return dbPromise;
  }

  async function idbOp(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(STORE_NAME, mode); }
      catch (e) { reject(new LibraryStoreError('tx threw', { cause: e })); return; }
      const store = tx.objectStore(STORE_NAME);
      let outcome;
      try { outcome = fn(store); }
      catch (e) { reject(new LibraryStoreError('op threw', { cause: e })); return; }
      tx.oncomplete = () => resolve(outcome);
      tx.onabort = () => reject(new LibraryStoreError('tx aborted', { cause: tx.error }));
      tx.onerror = () => reject(new LibraryStoreError(String(tx.error?.message || 'tx error'), { cause: tx.error }));
    });
  }

  const idbAdapter = {
    name: 'idb-studio',
    async get(key) {
      let value;
      await idbOp('readonly', (s) => {
        const req = s.get(String(key));
        req.onsuccess = () => { value = req.result; };
      });
      return (value === undefined) ? null : value;
    },
    async set(key, val) {
      await idbOp('readwrite', (s) => { s.put(val, String(key)); });
      return true;
    },
    async del(key) {
      await idbOp('readwrite', (s) => { s.delete(String(key)); });
      return true;
    },
    async listKeys(prefix) {
      const keys = [];
      const pre = String(prefix || '');
      await idbOp('readonly', (s) => {
        const req = s.openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          const k = String(cursor.key);
          if (!pre || k.startsWith(pre)) keys.push(k);
          cursor.continue();
        };
      });
      return keys;
    },
    async estimate() {
      try {
        if (navigator?.storage?.estimate) return await navigator.storage.estimate();
      } catch (e) { err('estimate', e); }
      return { usage: 0, quota: 0 };
    },
  };

  // ── localStorage adapter (fallback) ────────────────────────────────────────
  const lsAdapter = {
    name: 'localStorage',
    async get(key) {
      try { const v = W.localStorage.getItem(String(key)); return v == null ? null : JSON.parse(v); }
      catch (e) { err('ls.get', e); return null; }
    },
    async set(key, val) {
      try { W.localStorage.setItem(String(key), JSON.stringify(val)); return true; }
      catch (e) { err('ls.set', e); throw new LibraryStoreError(String(e?.message || e), { cause: e }); }
    },
    async del(key) {
      try { W.localStorage.removeItem(String(key)); return true; }
      catch (e) { err('ls.del', e); return false; }
    },
    async listKeys(prefix) {
      const out = [];
      const pre = String(prefix || '');
      try {
        for (let i = 0; i < W.localStorage.length; i++) {
          const k = W.localStorage.key(i);
          if (k && (!pre || k.startsWith(pre))) out.push(k);
        }
      } catch (e) { err('ls.listKeys', e); }
      return out;
    },
    async estimate() { return { usage: 0, quota: 0 }; },
  };

  // ── Capability probe ───────────────────────────────────────────────────────
  // Writes a sentinel under each candidate adapter; promotes to the best one.
  const SENTINEL_PREFIX = 'h2o:prm:cgx:library:_sentinel:v1:studio:';

  let activeAdapter = lsAdapter;
  let caps = { durable: false, async: true, sizeLimit: 5 * 1024 * 1024 };
  let probedAt = 0;

  async function probe() {
    const probes = [idbAdapter, lsAdapter];
    for (const a of probes) {
      const k = `${SENTINEL_PREFIX}${a.name}`;
      try {
        await a.set(k, { ok: true, t: Date.now() });
        const v = await a.get(k);
        if (v && v.ok === true) {
          activeAdapter = a;
          caps = a === idbAdapter
            ? { durable: true, async: true, sizeLimit: 0 /* no fixed limit */ }
            : { durable: false, async: true, sizeLimit: 5 * 1024 * 1024 };
          probedAt = Date.now();
          step('probe.ok', a.name);
          await a.del(k).catch(() => {});
          try {
            W.dispatchEvent(new CustomEvent('evt:h2o:library:store:tier-promoted', {
              detail: { adapter: a.name, durable: caps.durable, surface: 'studio' },
            }));
          } catch {}
          return a.name;
        }
      } catch (e) { err(`probe.${a.name}`, e); }
    }
    // If somehow nothing worked, keep ls as last-resort.
    activeAdapter = lsAdapter;
    probedAt = Date.now();
    step('probe.fallback', 'localStorage');
    return 'localStorage';
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // Same shape as native 0F1e: get/set/del/listKeys/size/estimate/backend/caps.
  const Store = {
    __studio: true,
    LibraryStoreError,
    async get(key)         { return activeAdapter.get(String(key || '')); },
    async set(key, val)    { return activeAdapter.set(String(key || ''), val); },
    async del(key)         { return activeAdapter.del(String(key || '')); },
    async listKeys(prefix) { return activeAdapter.listKeys(String(prefix || '')); },
    async size() {
      const keys = await activeAdapter.listKeys('');
      return keys.length;
    },
    async estimate() { return activeAdapter.estimate(); },
    backend() { return activeAdapter.name; },
    caps() { return { ...caps }; },
    mirrorBackend() {
      // Returns name of any mirror (Studio has none yet — returns null).
      return null;
    },
    diagnose() {
      return {
        backend: activeAdapter.name,
        caps: { ...caps },
        probedAt,
        surface: 'studio',
        dbName: DB_NAME,
        steps: diag.steps.slice(-20),
        errors: diag.errors.slice(-10),
      };
    },
    // Allow ad-hoc adapter swap for tests; returns true if swap accepted.
    _setAdapter(name) {
      if (name === 'idb-studio') { activeAdapter = idbAdapter; return true; }
      if (name === 'localStorage') { activeAdapter = lsAdapter; return true; }
      return false;
    },
  };

  H2O.Library.Store = Store;

  // Boot probe — promote to IDB asynchronously without blocking.
  probe().catch((e) => err('probe.boot', e));

  // Register as owner on Library Core (idempotent; falls through if Core not ready yet).
  function registerOnCore() {
    const core = H2O.LibraryCore;
    if (!core || typeof core.registerOwner !== 'function') return false;
    try {
      core.registerOwner('library-store', Store, { replace: true });
      core.registerService('library-store', Store, { replace: true });
      step('register-on-core', 'library-store');
      return true;
    } catch (e) { err('register-on-core', e); return false; }
  }
  if (!registerOnCore()) {
    W.addEventListener('h2o.ev:prm:cgx:lib:ready:v1', () => registerOnCore(), { once: true });
  }

  // Emit readiness so dependents can boot deterministically.
  try {
    W.dispatchEvent(new CustomEvent('evt:h2o:library:store:ready', {
      detail: { surface: 'studio', backend: activeAdapter.name, t: Date.now() },
    }));
  } catch {}

  step('boot', 'studio-store-ready');
})();
