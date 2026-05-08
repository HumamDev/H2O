// ==UserScript==
// @h2o-id             0f1e.library_store
// @name               0F1e.⬛️🗂️ Library Store 📦🗂️
// @namespace          H2O.Premium.CGX.library_store
// @author             HumamDev
// @version            1.0.0
// @revision           001
// @build              260506-000001
// @description        Library Store: adapter-based async storage facade for the H2O Library subsystem. Picks the best durable backend per runtime (extension-mv3 / studio / userscript / legacy-page) with sentinel-verified availability, transparent LZ-string compression at the same 30 KB threshold the existing Data Store uses, and size guards for known-large keys. Phase 1 — facade and capability diagnostics only; no Library caller migrated yet.
// @match              https://chatgpt.com/*
// @run-at             document-idle
// @grant              unsafeWindow
// @grant              GM_getValue
// @grant              GM_setValue
// @grant              GM_deleteValue
// ==/UserScript==

(() => {
  'use strict';

  /*
   * 0F1e — Library Store (foundation)
   *
   * OWNS:     The H2O.Library.Store async facade. Adapter classes for every storage tier
   *           the Library subsystem can reach across runtimes. Capability probe + sentinel
   *           verification + adapter selection. LZ compression integration (delegates to
   *           0D1b H2O.compress). Size guards for known-large namespaces.
   * MUST NOT OWN: any Library data shape, any registry/tag/category logic, any UI, any
   *           repair command, any migration of existing data. Phase 1 ships ONLY the facade
   *           and diagnostics; callers continue to use whatever they use today. Phase 2
   *           switches Library Index to read/write through Store with lossless migration.
   * EXPOSES:  H2O.Library.Store — get/set/del/listKeys/size/estimate/caps/backend/
   *           mirrorBackend; H2O.Library.LibraryStoreError.
   *
   * RUNTIME ADAPTATION:
   *   detectRuntime() ∈ { 'extension-mv3', 'studio', 'userscript', 'legacy-page' }.
   *   Per runtime we pick the strongest adapter that passes a real write→read→delete
   *   sentinel at h2o:prm:cgx:library:_sentinel:v1:<adapter>. API-object presence alone
   *   is never enough — extensions can revoke permissions, GM storage can be throttled,
   *   chrome.storage can fail under quota.
   *
   * KEY NAMESPACE: every Library key uses the existing repo prefix style:
   *   h2o:prm:cgx:library:<sub>:vN  (per-chat keys append :${chatId})
   *
   * NOTE on IndexedDB:
   *   - IndexedDB is unsafe in the page-injected ChatGPT context (collision with ChatGPT's
   *     own IDB databases). IndexedDBPageAdapter is shipped but DISABLED by default behind
   *     H2O.Library.Store._features.allowPageIDB.
   *   - IndexedDBExtensionAdapter never touches IDB directly — it RPCs to the MV3 service
   *     worker via chrome.runtime.sendMessage; sentinel fails when no SW handler exists.
   *   - IndexedDBStudioAdapter targets Studio's own origin and is selected only when the
   *     Studio runtime marker is set.
   */

  const VERSION = '1.0.0';
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
  const TOPW = W.top || W;
  const H2O = (TOPW.H2O = TOPW.H2O || {});
  if (W !== TOPW) W.H2O = H2O;

  const NS_LIB = 'h2o:prm:cgx:library';
  const SENTINEL_BASE = `${NS_LIB}:_sentinel:v1`;
  const COMPRESS_PREFIX = '\x00LZb64:';
  const COMPRESS_THRESHOLD = 30_000;
  const LARGE_VALUE_LIMIT_DEFAULT = 5 * 1024 * 1024;
  const LARGE_VALUE_LIMIT_LEGACY  = 3 * 1024 * 1024;

  // Bridge sentinel cold-start tolerance: 0D3b's b.isAvailable() uses a 1.8s ping timeout
  // and CACHES the result, which is fatal for MV3 service workers that take 2-5s to wake.
  // The BridgeAdapter sentinel below bypasses isAvailable() and pings directly with this
  // longer timeout. Boot retry attempts (500/1500/3000/6000ms) compound this so a cold SW
  // is reliably caught without manual page reloads.
  const BRIDGE_SENTINEL_TIMEOUT_MS = 6000;
  const BRIDGE_BOOT_RETRY_DELAYS_MS = Object.freeze([500, 1500, 3000, 6000]);

  const KNOWN_LARGE_PREFIXES = Object.freeze([
    `${NS_LIB}:registry:`,
    `${NS_LIB}:scan-ledger`,
    `${NS_LIB}:tag-auto-pool`,
    `${NS_LIB}:tag-occ-index:`,
    `${NS_LIB}:cat-candidate-pool`,
    `${NS_LIB}:category-overrides:`,
    `${NS_LIB}:cache:`,
  ]);

  // Adapters considered durable for large Library data. localStorage is NEVER on this list —
  // it is the quota-limited tier we are migrating away from. An adapter only counts as
  // durable when the runtime sentinel passes (write→read→delete with byte-equality).
  const DURABLE_ADAPTERS = Object.freeze(new Set([
    'gm',
    'chrome.storage',
    'indexeddb-extension',
    'indexeddb-studio',
    'bridge',
  ]));
  function isDurableAdapter(name) {
    return typeof name === 'string' && DURABLE_ADAPTERS.has(name);
  }

  const TAG = '[H2O.Library.Store]';

  /* ─── tiny diag/log helpers (mirrors 0F1a's pattern) ─── */
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const diag = {
    steps: [],
    errors: [],
    bufMax: 80,
    errMax: 40,
  };
  const step = (s, o = '') => {
    try {
      const ms = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      diag.steps.push({ t: Math.round(ms - t0), s: String(s || ''), o: String(o || '') });
      if (diag.steps.length > diag.bufMax) diag.steps.splice(0, diag.steps.length - diag.bufMax);
    } catch {}
  };
  const errLog = (s, e) => {
    try {
      const ms = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      diag.errors.push({ t: Math.round(ms - t0), s: String(s || ''), e: String(e?.stack || e || '') });
      if (diag.errors.length > diag.errMax) diag.errors.splice(0, diag.errors.length - diag.errMax);
    } catch {}
  };

  function emitEvent(name, detail) {
    try {
      if (H2O.events && typeof H2O.events.emit === 'function') {
        H2O.events.emit(name, detail || {});
        return;
      }
    } catch {}
    // Fallback when H2O Core's bus isn't ready yet — fire all three names directly.
    const evtName = `evt:h2o:${name}`;
    const legacy1 = `h2o:${name}`;
    const legacy2 = `h2o-${name}`;
    [evtName, legacy1, legacy2].forEach(n => {
      try { W.dispatchEvent(new CustomEvent(n, { detail: detail || {} })); } catch {}
    });
  }

  /* ─── Custom error ─── */
  class LibraryStoreError extends Error {
    constructor(code, message, info) {
      super(message || code);
      this.name = 'LibraryStoreError';
      this.code = code;
      this.info = info || null;
    }
  }

  /* ─── Compression delegation (works even if 0D1b loaded later) ─── */
  function compressIfLarge(payload) {
    if (typeof payload !== 'string') return payload;
    if (payload.length < COMPRESS_THRESHOLD) return payload;
    try {
      const c = H2O.compress?.compress?.(payload);
      if (typeof c === 'string' && c.length < payload.length) return c;
    } catch (e) { errLog('compressIfLarge', e); }
    return payload;
  }
  function decompressIfNeeded(payload) {
    if (typeof payload !== 'string') return payload;
    if (!payload.startsWith(COMPRESS_PREFIX)) return payload;
    try {
      const d = H2O.compress?.decompress?.(payload);
      return (typeof d === 'string') ? d : payload;
    } catch (e) { errLog('decompressIfNeeded', e); return payload; }
  }

  function isKnownLargeKey(key) {
    return KNOWN_LARGE_PREFIXES.some(p => typeof key === 'string' && key.startsWith(p));
  }
  function bytesOfPayload(payload) {
    return typeof payload === 'string' ? payload.length : 0;
  }

  function safeJsonStringify(value) {
    try { return JSON.stringify(value); }
    catch (e) {
      throw new LibraryStoreError('SERIALIZE_FAILED', 'Could not JSON.stringify value', { error: String(e) });
    }
  }
  function safeJsonParse(s) {
    if (typeof s !== 'string' || s.length === 0) return undefined;
    try { return JSON.parse(s); }
    catch (e) {
      errLog('safeJsonParse', e);
      return undefined;
    }
  }

  /* ─── Sentinel test: write → read → delete with byte-equality ─── */
  async function runSentinel(adapter) {
    const key = `${SENTINEL_BASE}:${adapter.name}`;
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const payload = JSON.stringify({ adapter: adapter.name, nonce, t: Date.now() });
    try {
      await adapter._rawSet(key, payload);
      const back = await adapter._rawGet(key);
      const ok = (typeof back === 'string') && (back === payload);
      try { await adapter._rawDel(key); } catch {}
      return ok;
    } catch (e) {
      errLog(`sentinel:${adapter.name}`, e);
      try { await adapter._rawDel(key); } catch {}
      return false;
    }
  }

  /* ─── Runtime detection ─── */
  function detectRuntime() {
    try {
      if (typeof chrome !== 'undefined'
        && chrome && chrome.runtime && chrome.runtime.id
        && chrome.storage && chrome.storage.local) {
        return 'extension-mv3';
      }
    } catch {}
    try {
      if (W.__H2O_STUDIO__ === true || W.__H2O_WORKBENCH__ === true) return 'studio';
    } catch {}
    try {
      if (typeof GM_setValue === 'function') return 'userscript';
      if (typeof GM !== 'undefined' && typeof GM.setValue === 'function') return 'userscript';
    } catch {}
    return 'legacy-page';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ADAPTERS
     Each adapter exposes:
       name (string), apiPresent() (sync bool), sentinelOk() (async bool),
       available() (async bool = apiPresent && sentinelOk),
       _rawGet/_rawSet/_rawDel (used by sentinel),
       get(key) / set(key, payload) / del(key) / listKeys(prefix) / size(key) / estimate().
     get/set/del wrap _rawGet/_rawSet/_rawDel with compression-aware framing.
     Sentinel writes/reads RAW (already a JSON string) — no extra framing.
  ═══════════════════════════════════════════════════════════════════════════ */

  /* ─── LocalStorageAdapter (full) ───
     Note: 0D1b patches Storage.prototype to compress h2o:* keys ≥30 KB.
     We pre-compress here ourselves so behavior is identical across all adapters.
  */
  function makeLocalStorageAdapter() {
    const A = { name: 'localStorage' };
    A.apiPresent = () => {
      try { return typeof W.localStorage !== 'undefined' && W.localStorage !== null; }
      catch { return false; }
    };
    A._rawSet = async (k, v) => { W.localStorage.setItem(k, v); return true; };
    A._rawGet = async (k) => W.localStorage.getItem(k);
    A._rawDel = async (k) => { W.localStorage.removeItem(k); return true; };
    A.sentinelOk = async () => runSentinel(A);

    A.get = async (key) => {
      const raw = W.localStorage.getItem(key);
      if (raw == null) return undefined;
      const decoded = decompressIfNeeded(raw);
      return safeJsonParse(decoded);
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      W.localStorage.setItem(key, payload);
      return true;
    };
    A.del = async (key) => { W.localStorage.removeItem(key); return true; };
    A.listKeys = async (prefix) => {
      const out = [];
      const len = W.localStorage.length;
      for (let i = 0; i < len; i++) {
        const k = W.localStorage.key(i);
        if (typeof k === 'string' && k.startsWith(prefix)) out.push(k);
      }
      return out;
    };
    A.size = async (key) => {
      const raw = W.localStorage.getItem(key);
      return bytesOfPayload(raw);
    };
    A.estimate = async () => {
      try {
        if (navigator?.storage?.estimate) {
          const e = await navigator.storage.estimate();
          if (e && Number.isFinite(e.usage) && Number.isFinite(e.quota) && e.quota > 0) {
            return { used: e.usage, quota: e.quota, percent: e.usage / e.quota };
          }
        }
      } catch {}
      return null;
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── GMAdapter (full; supports sync GM_*, Promise GM.*, AND a page-injected
                   window.__h2oGM bridge so the adapter survives runtimes where the host
                   userscript is loaded without @grant lines and runs in page context.) ───
       To enable __h2oGM in a page-injected runtime, install a tiny sidecar userscript with:
         // @grant GM_setValue
         // @grant GM_getValue
         // @grant GM_deleteValue
         // @grant GM_listValues
         // @grant unsafeWindow
       and have it expose:
         (unsafeWindow || window).__h2oGM = {
           setValue: GM_setValue, getValue: GM_getValue,
           deleteValue: GM_deleteValue, listValues: GM_listValues
         };
       This adapter will then route through the sidecar transparently.
  */
  function makeGMAdapter() {
    const A = { name: 'gm' };

    const hasSyncSet = (typeof GM_setValue === 'function') && (typeof GM_getValue === 'function') && (typeof GM_deleteValue === 'function');
    const hasPromiseSet = (typeof GM !== 'undefined') && (typeof GM?.setValue === 'function') && (typeof GM?.getValue === 'function') && (typeof GM?.deleteValue === 'function');
    function pageGM() {
      try {
        const g = W.__h2oGM;
        if (g && typeof g.setValue === 'function' && typeof g.getValue === 'function' && typeof g.deleteValue === 'function') return g;
      } catch {}
      return null;
    }
    A._mode = hasSyncSet ? 'sync' : (hasPromiseSet ? 'promise' : (pageGM() ? 'page-bridge' : 'none'));

    A.apiPresent = () => A._mode !== 'none';

    async function gmSet(k, v) {
      if (A._mode === 'sync') { GM_setValue(k, v); return; }
      if (A._mode === 'promise') { await GM.setValue(k, v); return; }
      const pg = pageGM();
      if (pg) { const r = pg.setValue(k, v); if (r && typeof r.then === 'function') await r; return; }
      throw new LibraryStoreError('NO_BACKEND', 'GM storage unavailable');
    }
    async function gmGet(k, fallback) {
      if (A._mode === 'sync') return GM_getValue(k, fallback);
      if (A._mode === 'promise') return await GM.getValue(k, fallback);
      const pg = pageGM();
      if (pg) {
        const r = pg.getValue(k, fallback);
        return (r && typeof r.then === 'function') ? await r : r;
      }
      throw new LibraryStoreError('NO_BACKEND', 'GM storage unavailable');
    }
    async function gmDel(k) {
      if (A._mode === 'sync') { GM_deleteValue(k); return; }
      if (A._mode === 'promise') { await GM.deleteValue(k); return; }
      const pg = pageGM();
      if (pg) { const r = pg.deleteValue(k); if (r && typeof r.then === 'function') await r; return; }
      throw new LibraryStoreError('NO_BACKEND', 'GM storage unavailable');
    }
    async function gmListKeys() {
      if (typeof GM_listValues === 'function') return GM_listValues();
      if (typeof GM !== 'undefined' && typeof GM?.listValues === 'function') return await GM.listValues();
      const pg = pageGM();
      if (pg && typeof pg.listValues === 'function') {
        const r = pg.listValues();
        return (r && typeof r.then === 'function') ? await r : r;
      }
      return [];
    }

    A._rawSet = async (k, v) => { await gmSet(k, v); return true; };
    A._rawGet = async (k) => {
      const v = await gmGet(k, undefined);
      return (v === undefined || v === null) ? undefined : v;
    };
    A._rawDel = async (k) => { await gmDel(k); return true; };
    A.sentinelOk = async () => runSentinel(A);

    A.get = async (key) => {
      const raw = await gmGet(key, undefined);
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'string') return raw; // GM may return parsed objects in some VMs
      const decoded = decompressIfNeeded(raw);
      return safeJsonParse(decoded);
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await gmSet(key, payload);
      return true;
    };
    A.del = async (key) => { await gmDel(key); return true; };
    A.listKeys = async (prefix) => {
      try {
        const all = await gmListKeys();
        return (Array.isArray(all) ? all : []).filter(k => typeof k === 'string' && k.startsWith(prefix));
      } catch (e) { errLog('gm.listKeys', e); return []; }
    };
    A.size = async (key) => {
      const v = await gmGet(key, undefined);
      return typeof v === 'string' ? v.length : 0;
    };
    A.estimate = async () => null;
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── ChromeStorageLocalAdapter (full; async via callback wrapper) ─── */
  function makeChromeStorageLocalAdapter() {
    const A = { name: 'chrome.storage' };

    A.apiPresent = () => {
      try {
        return typeof chrome !== 'undefined'
          && !!chrome
          && !!chrome.storage
          && !!chrome.storage.local
          && typeof chrome.storage.local.get === 'function'
          && typeof chrome.storage.local.set === 'function';
      } catch { return false; }
    };

    function csGet(k) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get([k], (r) => {
            if (chrome.runtime?.lastError) {
              return reject(new LibraryStoreError('CHROME_GET_FAILED', String(chrome.runtime.lastError.message || chrome.runtime.lastError)));
            }
            resolve(r ? r[k] : undefined);
          });
        } catch (e) { reject(e); }
      });
    }
    function csSet(k, v) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.set({ [k]: v }, () => {
            if (chrome.runtime?.lastError) {
              return reject(new LibraryStoreError('CHROME_SET_FAILED', String(chrome.runtime.lastError.message || chrome.runtime.lastError)));
            }
            resolve(true);
          });
        } catch (e) { reject(e); }
      });
    }
    function csDel(k) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.remove([k], () => {
            if (chrome.runtime?.lastError) {
              return reject(new LibraryStoreError('CHROME_DEL_FAILED', String(chrome.runtime.lastError.message || chrome.runtime.lastError)));
            }
            resolve(true);
          });
        } catch (e) { reject(e); }
      });
    }
    function csKeys(prefix) {
      return new Promise((resolve, reject) => {
        try {
          chrome.storage.local.get(null, (r) => {
            if (chrome.runtime?.lastError) {
              return reject(new LibraryStoreError('CHROME_LIST_FAILED', String(chrome.runtime.lastError.message || chrome.runtime.lastError)));
            }
            const all = Object.keys(r || {});
            resolve(all.filter(k => k.startsWith(prefix)));
          });
        } catch (e) { reject(e); }
      });
    }

    A._rawSet = async (k, v) => { await csSet(k, v); return true; };
    A._rawGet = async (k) => csGet(k);
    A._rawDel = async (k) => { await csDel(k); return true; };
    A.sentinelOk = async () => runSentinel(A);

    A.get = async (key) => {
      const raw = await csGet(key);
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'string') return raw;
      const decoded = decompressIfNeeded(raw);
      return safeJsonParse(decoded);
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await csSet(key, payload);
      return true;
    };
    A.del = async (key) => { await csDel(key); return true; };
    A.listKeys = async (prefix) => csKeys(prefix);
    A.size = async (key) => {
      const v = await csGet(key);
      return typeof v === 'string' ? v.length : 0;
    };
    A.estimate = async () => {
      try {
        if (chrome.storage.local.getBytesInUse) {
          const used = await new Promise((resolve, reject) => {
            try {
              chrome.storage.local.getBytesInUse(null, (n) => {
                if (chrome.runtime?.lastError) return reject(chrome.runtime.lastError);
                resolve(n);
              });
            } catch (e) { reject(e); }
          });
          const quota = (chrome.storage.local.QUOTA_BYTES) || (10 * 1024 * 1024);
          return { used, quota, percent: used / quota };
        }
      } catch {}
      return null;
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── IndexedDBExtensionAdapter (RPC to MV3 service worker; stub until SW handler exists) ───
     Page-injected scripts CANNOT touch SW IndexedDB directly. All I/O goes through
     chrome.runtime.sendMessage({type:'h2o.libstore.kv', op, key, value}).
     The companion extension is responsible for routing this to the SW's IDB and replying.
     Until that handler exists, sentinelOk() returns false and the adapter is not selected.
  */
  function makeIndexedDBExtensionAdapter() {
    const A = { name: 'indexeddb-extension' };
    A.apiPresent = () => {
      try {
        return typeof chrome !== 'undefined'
          && !!chrome
          && !!chrome.runtime
          && typeof chrome.runtime.sendMessage === 'function'
          && !!chrome.runtime.id;
      } catch { return false; }
    };
    function rpc(op, payload, timeoutMs = 1500) {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = W.setTimeout(() => {
          if (done) return; done = true;
          reject(new LibraryStoreError('RPC_TIMEOUT', `IDB-extension RPC ${op} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        try {
          chrome.runtime.sendMessage(
            { type: 'h2o.libstore.kv', op, ...payload },
            (response) => {
              if (done) return; done = true;
              W.clearTimeout(timer);
              if (chrome.runtime?.lastError) {
                return reject(new LibraryStoreError('RPC_RUNTIME_ERROR', String(chrome.runtime.lastError.message || chrome.runtime.lastError)));
              }
              if (!response || response.ok !== true) {
                return reject(new LibraryStoreError('RPC_REJECTED', String(response?.error || 'unknown error'), { op }));
              }
              resolve(response.result);
            }
          );
        } catch (e) {
          if (done) return; done = true;
          W.clearTimeout(timer);
          reject(e);
        }
      });
    }
    A._rawSet = async (k, v) => { await rpc('set', { key: k, value: v }); return true; };
    A._rawGet = async (k) => { try { return await rpc('get', { key: k }); } catch (e) { errLog('idb-ext.get', e); return undefined; } };
    A._rawDel = async (k) => { await rpc('del', { key: k }); return true; };
    A.sentinelOk = async () => runSentinel(A);
    A.get = async (key) => {
      const raw = await rpc('get', { key }).catch(() => undefined);
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'string') return raw;
      const decoded = decompressIfNeeded(raw);
      return safeJsonParse(decoded);
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await rpc('set', { key, value: payload });
      return true;
    };
    A.del = async (key) => { await rpc('del', { key }); return true; };
    A.listKeys = async (prefix) => {
      try { const r = await rpc('listKeys', { prefix }); return Array.isArray(r) ? r : []; }
      catch { return []; }
    };
    A.size = async (key) => {
      try { const r = await rpc('size', { key }); return Number.isFinite(r) ? r : 0; }
      catch { return 0; }
    };
    A.estimate = async () => {
      try { return await rpc('estimate', {}); } catch { return null; }
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── IndexedDBStudioAdapter (Studio's own origin; only available when runtime === 'studio') ─── */
  function makeIndexedDBStudioAdapter() {
    const A = { name: 'indexeddb-studio' };
    const DB_NAME = 'h2o.library.studio';
    const STORE_NAME = 'kv';
    let _dbPromise = null;

    A.apiPresent = () => {
      try {
        const isStudio = (W.__H2O_STUDIO__ === true) || (W.__H2O_WORKBENCH__ === true);
        return isStudio && typeof W.indexedDB !== 'undefined';
      } catch { return false; }
    };

    function openDb() {
      if (_dbPromise) return _dbPromise;
      _dbPromise = new Promise((resolve, reject) => {
        try {
          const req = W.indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('idb open failed'));
        } catch (e) { reject(e); }
      });
      return _dbPromise;
    }
    async function tx(mode, fn) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        try {
          const t = db.transaction(STORE_NAME, mode);
          const s = t.objectStore(STORE_NAME);
          const r = fn(s);
          t.oncomplete = () => resolve(r?.result);
          t.onerror = () => reject(t.error || new Error('idb tx failed'));
          t.onabort = () => reject(t.error || new Error('idb tx aborted'));
        } catch (e) { reject(e); }
      });
    }

    A._rawSet = async (k, v) => { await tx('readwrite', s => s.put(v, k)); return true; };
    A._rawGet = async (k) => {
      return new Promise(async (resolve, reject) => {
        try {
          const db = await openDb();
          const t = db.transaction(STORE_NAME, 'readonly');
          const s = t.objectStore(STORE_NAME);
          const r = s.get(k);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error || new Error('idb get failed'));
        } catch (e) { reject(e); }
      });
    };
    A._rawDel = async (k) => { await tx('readwrite', s => s.delete(k)); return true; };
    A.sentinelOk = async () => runSentinel(A);

    A.get = async (key) => {
      const raw = await A._rawGet(key);
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'string') return raw;
      const decoded = decompressIfNeeded(raw);
      return safeJsonParse(decoded);
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await A._rawSet(key, payload);
      return true;
    };
    A.del = async (key) => A._rawDel(key);
    A.listKeys = async (prefix) => {
      return new Promise(async (resolve, reject) => {
        try {
          const db = await openDb();
          const t = db.transaction(STORE_NAME, 'readonly');
          const s = t.objectStore(STORE_NAME);
          const r = s.getAllKeys();
          r.onsuccess = () => {
            const all = Array.isArray(r.result) ? r.result : [];
            resolve(all.filter(k => typeof k === 'string' && k.startsWith(prefix)));
          };
          r.onerror = () => reject(r.error || new Error('idb getAllKeys failed'));
        } catch (e) { reject(e); }
      });
    };
    A.size = async (key) => {
      const v = await A._rawGet(key);
      return typeof v === 'string' ? v.length : 0;
    };
    A.estimate = async () => {
      try {
        if (navigator?.storage?.estimate) {
          const e = await navigator.storage.estimate();
          if (e && Number.isFinite(e.usage) && Number.isFinite(e.quota) && e.quota > 0) {
            return { used: e.usage, quota: e.quota, percent: e.usage / e.quota };
          }
        }
      } catch {}
      return null;
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── IndexedDBPageAdapter (shipped, DISABLED by default behind a feature flag) ───
     Page-context IndexedDB shares its database namespace with chatgpt.com — use only
     when an isolated context guarantees no collision. Default: apiPresent() === false.
     Enable explicitly with H2O.Library.Store._features.allowPageIDB = true at boot.
  */
  function makeIndexedDBPageAdapter() {
    const A = { name: 'indexeddb-page' };
    const DB_NAME = 'h2o.library.page';
    const STORE_NAME = 'kv';
    let _dbPromise = null;

    A.apiPresent = () => {
      try {
        if (Store._features?.allowPageIDB !== true) return false;
        return typeof W.indexedDB !== 'undefined';
      } catch { return false; }
    };

    function openDb() {
      if (_dbPromise) return _dbPromise;
      _dbPromise = new Promise((resolve, reject) => {
        try {
          const req = W.indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error || new Error('idb open failed'));
        } catch (e) { reject(e); }
      });
      return _dbPromise;
    }

    A._rawSet = async (k, v) => {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, 'readwrite');
        t.objectStore(STORE_NAME).put(v, k);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    };
    A._rawGet = async (k) => {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, 'readonly');
        const r = t.objectStore(STORE_NAME).get(k);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    };
    A._rawDel = async (k) => {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, 'readwrite');
        t.objectStore(STORE_NAME).delete(k);
        t.oncomplete = () => resolve(true);
        t.onerror = () => reject(t.error);
      });
    };
    A.sentinelOk = async () => runSentinel(A);

    A.get = async (key) => {
      const raw = await A._rawGet(key);
      if (raw === undefined || raw === null) return undefined;
      if (typeof raw !== 'string') return raw;
      return safeJsonParse(decompressIfNeeded(raw));
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await A._rawSet(key, payload);
      return true;
    };
    A.del = async (key) => A._rawDel(key);
    A.listKeys = async (prefix) => {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const t = db.transaction(STORE_NAME, 'readonly');
        const r = t.objectStore(STORE_NAME).getAllKeys();
        r.onsuccess = () => {
          const all = Array.isArray(r.result) ? r.result : [];
          resolve(all.filter(k => typeof k === 'string' && k.startsWith(prefix)));
        };
        r.onerror = () => reject(r.error);
      });
    };
    A.size = async (key) => {
      const v = await A._rawGet(key);
      return typeof v === 'string' ? v.length : 0;
    };
    A.estimate = async () => {
      try {
        if (navigator?.storage?.estimate) {
          const e = await navigator.storage.estimate();
          if (e && Number.isFinite(e.usage) && Number.isFinite(e.quota) && e.quota > 0) {
            return { used: e.usage, quota: e.quota, percent: e.usage / e.quota };
          }
        }
      } catch {}
      return null;
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ─── BridgeAdapter (uses existing 0D3b extension bridge; stub until SW exposes KV ops) ───
     The bridge is registered on H2O.archiveBoot via _registerExtensionBridge(api) in 0D3b,
     and the public accessor is H2O.archiveBoot._getExtensionBridge() defined at 0D3a:154.
     0D3b currently exposes archive snapshot ops but no general KV. The companion
     extension's service worker (tools/product/extension/chrome-live-background.mjs) routes
     ops at line ~3225 (`if (op === "ping")` etc.) — adding `if (op === "libraryKvSet")`
     handlers there + chrome.storage.local persistence on the SW side activates this adapter.
     Until that lands, sentinel fails and the adapter is not selected (the right behavior).
  */
  function makeBridgeAdapter() {
    const A = { name: 'bridge' };
    function bridge() {
      try {
        const ab = H2O.archiveBoot;
        if (!ab) return null;
        if (typeof ab._getExtensionBridge === 'function') return ab._getExtensionBridge() || null;
        // Forward-compat fallback for older 0D3a builds.
        return ab._extensionBridge || ab.bridge || null;
      } catch { return null; }
    }
    A.apiPresent = () => {
      try {
        const b = bridge();
        return !!(b && typeof b.call === 'function' && typeof b.isAvailable === 'function');
      } catch { return false; }
    };
    // Bridge response shape: 0D3b's call() rejects on SW {ok:false} and resolves with the
    // unwrapped result on {ok:true}. So _rawGet returns the raw stored value (or undefined).
    A._rawSet = async (k, v) => {
      const b = bridge();
      if (!b) throw new LibraryStoreError('NO_BRIDGE', 'archiveBoot bridge unavailable');
      await b.call('libraryKvSet', { key: k, value: v }, { timeoutMs: 1500 });
      return true;
    };
    A._rawGet = async (k) => {
      const b = bridge();
      if (!b) throw new LibraryStoreError('NO_BRIDGE', 'archiveBoot bridge unavailable');
      return await b.call('libraryKvGet', { key: k }, { timeoutMs: 1500 });
    };
    A._rawDel = async (k) => {
      const b = bridge();
      if (!b) throw new LibraryStoreError('NO_BRIDGE', 'archiveBoot bridge unavailable');
      await b.call('libraryKvDel', { key: k }, { timeoutMs: 1500 });
      return true;
    };
    A.sentinelOk = async () => {
      try {
        const b = bridge();
        if (!b) return false;
        // Cold-start tolerant: bypass b.isAvailable() (which caches its result and uses a
        // 1.8s timeout — too short for MV3 SW wake-up) and ping directly with a longer
        // timeout. Subsequent KV-op call()s auto-establish session via 0D3b's
        // bridgeNeedsSession gate, so no need to call ensureSession() explicitly here.
        let pong;
        try {
          pong = await b.call('ping', {}, { timeoutMs: BRIDGE_SENTINEL_TIMEOUT_MS });
        } catch (_e) {
          return false;
        }
        if (!pong || String(pong.source || '') !== 'sw') return false;
        return await runSentinel(A);
      } catch { return false; }
    };
    A.get = async (key) => {
      try {
        const raw = await A._rawGet(key);
        if (raw === undefined || raw === null) return undefined;
        if (typeof raw !== 'string') return raw;
        return safeJsonParse(decompressIfNeeded(raw));
      } catch { return undefined; }
    };
    A.set = async (key, value) => {
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      await A._rawSet(key, payload);
      return true;
    };
    A.del = async (key) => A._rawDel(key);
    A.listKeys = async (prefix) => {
      try {
        const b = bridge();
        if (!b) return [];
        const r = await b.call('libraryKvListKeys', { prefix }, { timeoutMs: 2000 });
        return Array.isArray(r) ? r : [];
      } catch { return []; }
    };
    A.size = async (key) => {
      const v = await A._rawGet(key);
      return typeof v === 'string' ? v.length : 0;
    };
    A.estimate = async () => {
      try {
        const b = bridge();
        if (!b) return null;
        const r = await b.call('libraryKvEstimate', {}, { timeoutMs: 1500 });
        if (r && Number.isFinite(r.used) && Number.isFinite(r.quota) && r.quota > 0) {
          return { used: r.used, quota: r.quota, percent: r.percent };
        }
        return null;
      } catch { return null; }
    };
    A.on = (_ev, _fn) => {};
    A.off = (_ev, _fn) => {};
    return A;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CAPABILITY PROBE + ADAPTER SELECTION
  ═══════════════════════════════════════════════════════════════════════════ */

  async function probeAll() {
    const adapters = {
      'indexeddb-extension': makeIndexedDBExtensionAdapter(),
      'chrome.storage':      makeChromeStorageLocalAdapter(),
      'indexeddb-studio':    makeIndexedDBStudioAdapter(),
      'gm':                  makeGMAdapter(),
      'bridge':              makeBridgeAdapter(),
      'indexeddb-page':      makeIndexedDBPageAdapter(),
      'localStorage':        makeLocalStorageAdapter(),
    };
    const probes = {};
    for (const [name, A] of Object.entries(adapters)) {
      const apiPresent = (() => { try { return !!A.apiPresent(); } catch { return false; } })();
      let sentinelOk = false;
      if (apiPresent) {
        try { sentinelOk = !!(await A.sentinelOk()); }
        catch (e) { errLog(`probe:${name}`, e); sentinelOk = false; }
      }
      probes[name] = { apiPresent, sentinelOk, available: apiPresent && sentinelOk };
      step(`probe:${name}`, `apiPresent=${apiPresent} sentinelOk=${sentinelOk}`);
    }
    return { adapters, probes };
  }

  function pickPrimary(runtime, probes) {
    const ok = (n) => probes[n]?.available === true;
    if (runtime === 'extension-mv3') {
      if (ok('indexeddb-extension')) return 'indexeddb-extension';
      if (ok('chrome.storage')) return 'chrome.storage';
      if (ok('bridge')) return 'bridge';
      if (ok('localStorage')) return 'localStorage';
      return null;
    }
    if (runtime === 'studio') {
      if (ok('indexeddb-studio')) return 'indexeddb-studio';
      if (ok('bridge')) return 'bridge';
      if (ok('localStorage')) return 'localStorage';
      return null;
    }
    if (runtime === 'userscript') {
      if (ok('gm')) return 'gm';
      if (ok('bridge')) return 'bridge';
      if (ok('localStorage')) return 'localStorage';
      return null;
    }
    // legacy-page (includes the page-injected dev pack and any companion-extension-injected setup
    // where neither GM_* nor chrome.storage reaches the page world). The bridge IS durable here
    // when the SW exposes KV ops — try it before falling back to the quota-limited localStorage.
    if (ok('bridge')) return 'bridge';
    if (ok('localStorage')) return 'localStorage';
    return null;
  }

  function pickMirror(runtime, probes, primary) {
    const ok = (n) => probes[n]?.available === true && n !== primary;
    if (runtime === 'extension-mv3') {
      if (primary === 'indexeddb-extension' && ok('chrome.storage')) return 'chrome.storage';
      return null;
    }
    if (runtime === 'userscript') {
      if (primary === 'gm' && ok('bridge')) return 'bridge';
      return null;
    }
    return null;
  }

  function pickMigrationSource(probes) {
    return probes['localStorage']?.available ? 'localStorage' : null;
  }

  function computeHealth(_runtime, primary, _probes) {
    if (!primary) return 'critical';
    // localStorage is NEVER 'ok' for the Library subsystem. It is the quota-limited tier we
    // are explicitly migrating away from — the user has hit its quota in production. Surfacing
    // 'degraded' here is what blocks Phase 2 migration until a durable adapter appears.
    if (primary === 'localStorage') return 'degraded';
    return 'ok';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PUBLIC FACADE
  ═══════════════════════════════════════════════════════════════════════════ */

  const _stats = {
    writes: 0,
    reads: 0,
    deletes: 0,
    mirrorSuccesses: 0,
    mirrorFailures: 0,
    oversizeRejects: 0,
    serializeFailures: 0,
    decompressFailures: 0,
    bootAt: null,
  };

  const _features = {
    allowPageIDB: false,           // see IndexedDBPageAdapter notes
    bridgeMirrorOnByDefault: true, // mirror writes when bridge available
  };

  let _ready = false;
  let _readyResolve;
  const _readyPromise = new Promise((resolve) => { _readyResolve = resolve; });

  let _capsCache = null;
  let _adapters = null;
  let _primaryName = null;
  let _mirrorName = null;
  let _migrationSourceName = null;
  let _runtime = null;
  let _health = 'critical';

  function getAdapter(name) {
    return name && _adapters ? _adapters[name] : null;
  }

  async function ensureReady() {
    if (_ready) return;
    await _readyPromise;
  }

  function checkSizeGuard(key, payload) {
    if (typeof payload !== 'string') return;
    if (!isKnownLargeKey(key)) return;
    const limit = (_runtime === 'legacy-page') ? LARGE_VALUE_LIMIT_LEGACY : LARGE_VALUE_LIMIT_DEFAULT;
    if (payload.length > limit) {
      _stats.oversizeRejects += 1;
      emitEvent('library:store:oversize', { key, length: payload.length, limit });
      throw new LibraryStoreError('OVERSIZE', `Payload for ${key} is ${payload.length} bytes (limit ${limit})`, {
        key, length: payload.length, limit,
      });
    }
  }

  const Store = {
    async get(key) {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) throw new LibraryStoreError('NO_BACKEND', 'No primary adapter available');
      _stats.reads += 1;
      try {
        const v = await primary.get(key);
        if (v !== undefined) return v;
      } catch (e) { errLog('get.primary', e); }
      const mirror = getAdapter(_mirrorName);
      if (mirror) {
        try {
          const v = await mirror.get(key);
          if (v !== undefined) return v;
        } catch (e) { errLog('get.mirror', e); }
      }
      // Phase 1: reads do NOT auto-migrate yet. Phase 2 will add the upgrade-write here.
      const migration = getAdapter(_migrationSourceName);
      if (migration && migration !== primary) {
        try {
          const v = await migration.get(key);
          if (v !== undefined) return v;
        } catch (e) { errLog('get.migration', e); }
      }
      return undefined;
    },

    async set(key, value, opts = {}) {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) throw new LibraryStoreError('NO_BACKEND', 'No primary adapter available');

      // Pre-serialize so size guard checks the actual payload bytes (post-compress).
      const json = safeJsonStringify(value);
      const payload = compressIfLarge(json);
      checkSizeGuard(key, payload);

      _stats.writes += 1;
      // Use _rawSet so we don't double-encode (we already serialized + compressed).
      await primary._rawSet(key, payload);

      const mirrorWanted = (opts.mirror !== false) && _features.bridgeMirrorOnByDefault;
      const mirror = mirrorWanted ? getAdapter(_mirrorName) : null;
      if (mirror) {
        // Fire-and-forget; mirror failures must never block primary success.
        mirror._rawSet(key, payload).then(
          () => { _stats.mirrorSuccesses += 1; },
          (e) => { _stats.mirrorFailures += 1; errLog('set.mirror', e); }
        );
      }
      return true;
    },

    async del(key) {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) throw new LibraryStoreError('NO_BACKEND', 'No primary adapter available');
      _stats.deletes += 1;
      await primary.del(key);
      const mirror = getAdapter(_mirrorName);
      if (mirror) {
        mirror.del(key).catch((e) => { _stats.mirrorFailures += 1; errLog('del.mirror', e); });
      }
      return true;
    },

    async listKeys(prefix) {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) return [];
      try { return await primary.listKeys(prefix); }
      catch (e) { errLog('listKeys', e); return []; }
    },

    async size(key) {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) return 0;
      try { return await primary.size(key); }
      catch (e) { errLog('size', e); return 0; }
    },

    async estimate() {
      await ensureReady();
      const primary = getAdapter(_primaryName);
      if (!primary) return null;
      try { return await primary.estimate(); }
      catch (e) { errLog('estimate', e); return null; }
    },

    caps() {
      // _capsCache is a defensive deep-ish copy so callers can't mutate internal state.
      if (!_capsCache) {
        const durable = isDurableAdapter(_primaryName);
        return {
          ready: _ready,
          runtime: _runtime,
          adapters: {},
          primary: _primaryName,
          mirror: _mirrorName,
          migrationSource: _migrationSourceName,
          durable,
          canMigrateLargeLibraryData: durable,
          quotaEstimate: null,
          health: _health,
          bootAt: _stats.bootAt,
          version: VERSION,
        };
      }
      return JSON.parse(JSON.stringify(_capsCache));
    },

    backend() { return _primaryName; },
    mirrorBackend() { return _mirrorName; },

    // Re-probe adapters and (if a healthier primary becomes available) promote it. Designed
    // for the MV3 SW cold-start race: when the bridge sentinel fails at boot because the
    // SW was waking up, calling reprobe() (or letting the boot retry chain run) catches it
    // without a manual page reload. Returns the post-reprobe caps snapshot.
    //
    //   opts.reason  — short label for telemetry (logged + sent in event detail)
    //   opts.force   — when true, re-probe ALL adapters; when false (default), skip ones
    //                  already marked available so we don't disturb the working primary.
    async reprobe(opts = {}) {
      const reason = String(opts?.reason || 'manual');
      const force = opts?.force === true;
      if (!_adapters) return Store.caps();
      // Wait for boot to complete the first time so we don't fight with the initial probe.
      if (_readyPromise && !_ready) { try { await _readyPromise; } catch (_e) {} }

      const probes = (_capsCache && _capsCache.adapters) ? _capsCache.adapters : {};
      let changed = false;
      for (const [name, A] of Object.entries(_adapters)) {
        const wasAvailable = probes[name]?.available === true;
        if (wasAvailable && !force) continue;
        let apiPresent = false;
        try { apiPresent = !!A.apiPresent(); } catch (_e) { apiPresent = false; }
        let sentinelOk = false;
        if (apiPresent) {
          try { sentinelOk = !!(await A.sentinelOk()); }
          catch (e) { errLog(`reprobe:${name}`, e); sentinelOk = false; }
        }
        const next = { apiPresent, sentinelOk, available: apiPresent && sentinelOk };
        if ((probes[name]?.available !== next.available) || (probes[name]?.sentinelOk !== next.sentinelOk)) {
          changed = true;
        }
        probes[name] = next;
        step(`reprobe:${name}`, `apiPresent=${apiPresent} sentinelOk=${sentinelOk}`);
      }

      const oldPrimary = _primaryName;
      const newPrimary = pickPrimary(_runtime, probes);
      if (changed || newPrimary !== oldPrimary) {
        _primaryName = newPrimary;
        _mirrorName = pickMirror(_runtime, probes, _primaryName);
        _migrationSourceName = pickMigrationSource(probes);
        _health = computeHealth(_runtime, _primaryName, probes);
        const durable = isDurableAdapter(_primaryName);
        if (_capsCache) {
          _capsCache.adapters = probes;
          _capsCache.primary = _primaryName;
          _capsCache.mirror = _mirrorName;
          _capsCache.migrationSource = _migrationSourceName;
          _capsCache.health = _health;
          _capsCache.durable = durable;
          _capsCache.canMigrateLargeLibraryData = durable;
          try {
            const primary = getAdapter(_primaryName);
            _capsCache.quotaEstimate = primary ? await primary.estimate() : null;
          } catch (_e) {}
        }
        if (newPrimary !== oldPrimary && isDurableAdapter(newPrimary) && !isDurableAdapter(oldPrimary)) {
          // Promotion: emit a dedicated event so consumers (Tags, Library Index, future
          // workspace UIs) can react and reload caches without a page reload.
          emitEvent('library:store:tier-promoted', {
            from: oldPrimary,
            to: newPrimary,
            reason,
            durable: true,
            mirror: _mirrorName,
            health: _health,
          });
          try {
            console.log(
              `${TAG} v${VERSION} promoted — primary=${_primaryName} (was ${oldPrimary || 'NONE'}) ` +
              `mirror=${_mirrorName || 'none'} health=${_health} durable=${durable} reason=${reason}`
            );
          } catch (_e) {}
          step('reprobe:promoted', `${oldPrimary || 'NONE'}→${_primaryName}`);
        } else if (newPrimary !== oldPrimary) {
          step('reprobe:reselected', `${oldPrimary || 'NONE'}→${_primaryName}`);
        }
      }
      return Store.caps();
    },

    on(eventName, fn) {
      const dual = (n) => W.addEventListener(n, fn);
      dual(`evt:h2o:library:store:${eventName}`);
      dual(`h2o:library:store:${eventName}`);
    },
    off(eventName, fn) {
      W.removeEventListener(`evt:h2o:library:store:${eventName}`, fn);
      W.removeEventListener(`h2o:library:store:${eventName}`, fn);
    },

    // Read-only diagnostics
    _stats,
    _features,
    _diag: diag,
    _readyPromise,
    LibraryStoreError,
    version: VERSION,
  };

  // Publish under H2O.Library.Store before boot completes so callers can hold a reference.
  H2O.Library = H2O.Library || {};
  H2O.Library.Store = Store;
  H2O.Library.LibraryStoreError = LibraryStoreError;

  /* ─── Boot ─── */
  async function boot() {
    step('boot:start');
    _runtime = detectRuntime();
    step('boot:runtime', _runtime);

    const { adapters, probes } = await probeAll();
    _adapters = adapters;

    _primaryName = pickPrimary(_runtime, probes);
    _mirrorName  = pickMirror(_runtime, probes, _primaryName);
    _migrationSourceName = pickMigrationSource(probes);
    _health = computeHealth(_runtime, _primaryName, probes);

    let quotaEstimate = null;
    try {
      const primary = getAdapter(_primaryName);
      quotaEstimate = primary ? await primary.estimate() : null;
    } catch (e) { errLog('boot.estimate', e); }

    const durable = isDurableAdapter(_primaryName);
    _capsCache = {
      ready: true,
      runtime: _runtime,
      adapters: probes,
      primary: _primaryName,
      mirror: _mirrorName,
      migrationSource: _migrationSourceName,
      // Hard contract: durable === true ONLY when primary is a durable adapter that passed
      // its sentinel. localStorage is durable=false even if it's the only thing we have.
      durable,
      // canMigrateLargeLibraryData mirrors durable: Phase 2 (registry migration) and any
      // future phase that touches large data MUST refuse to run when this is false.
      canMigrateLargeLibraryData: durable,
      quotaEstimate,
      health: _health,
      bootAt: Date.now(),
      version: VERSION,
    };
    _stats.bootAt = _capsCache.bootAt;

    _ready = true;
    try { _readyResolve && _readyResolve(); } catch {}

    if (_health === 'degraded') emitEvent('library:store:tier-degraded', { runtime: _runtime, primary: _primaryName, durable });
    if (_health === 'critical') emitEvent('library:store:tier-degraded', { runtime: _runtime, primary: null, critical: true, durable: false });
    emitEvent('library:store:ready', { runtime: _runtime, primary: _primaryName, mirror: _mirrorName, health: _health, durable });

    const summary = Object.entries(probes)
      .map(([n, p]) => `${n}:${p.available ? 'ok' : (p.apiPresent ? 'sentinel-fail' : 'absent')}`)
      .join(' ');
    console.log(
      `${TAG} v${VERSION} boot — runtime=${_runtime} primary=${_primaryName || 'NONE'} ` +
      `mirror=${_mirrorName || 'none'} migration=${_migrationSourceName || 'none'} ` +
      `health=${_health} durable=${durable} | ${summary}`
    );
    if (!durable) {
      // Loud Phase 2 blocker so the user sees the issue immediately on every boot.
      console.warn(
        `${TAG} PHASE 2 BLOCKED — no durable adapter selected (primary=${_primaryName || 'NONE'}). ` +
        `Library Index migration MUST NOT proceed. ` +
        `Resolve by either: (a) installing a sidecar userscript that exposes window.__h2oGM with ` +
        `GM_setValue/getValue/deleteValue/listValues so the GMAdapter activates, ` +
        `(b) adding 'libraryKvSet/Get/Del/ListKeys' op handlers to the companion extension SW ` +
        `(tools/product/extension/chrome-live-background.mjs near the existing op router) so the ` +
        `BridgeAdapter sentinel passes, or (c) running in a true MV3 extension content-script ` +
        `context where chrome.storage.local is reachable.`
      );
    }
    step('boot:done', `primary=${_primaryName} health=${_health} durable=${durable}`);

    // Boot retry: if we ended up on a non-durable primary AND a bridge adapter exists in
    // the runtime, schedule a few quiet re-probes to catch the MV3 SW cold-start race
    // without requiring the user to reload the page. Retries stop as soon as the bridge
    // promotes (each retry is gated by `isDurableAdapter(_primaryName)`).
    maybeScheduleBridgeBootRetries();
  }

  function maybeScheduleBridgeBootRetries() {
    try {
      if (isDurableAdapter(_primaryName)) return; // already durable, nothing to do
      if (!_adapters || !_adapters['bridge']) return; // bridge not in this runtime
      BRIDGE_BOOT_RETRY_DELAYS_MS.forEach((delay, idx) => {
        const timer = W.setTimeout(async () => {
          if (isDurableAdapter(_primaryName)) return; // promoted by an earlier retry
          try {
            await Store.reprobe({ reason: `boot-retry-${idx + 1}-${delay}ms`, force: false });
          } catch (e) { errLog(`boot-retry-${idx + 1}`, e); }
        }, delay);
        // No state.clean tracking — Store has no module-level cleanup contract; these are
        // one-shot timers that self-clear after firing.
      });
      step('boot:retry-scheduled', BRIDGE_BOOT_RETRY_DELAYS_MS.join(','));
    } catch (e) { errLog('boot:retry-schedule', e); }
  }

  // Boot is async but starts synchronously — callers awaiting public methods will see a
  // ready Store after the probe completes.
  boot().catch((e) => {
    errLog('boot', e);
    try { console.error(`${TAG} boot failed`, e); } catch {}
    // Even on boot failure, mark ready so awaits don't hang forever; primary will be null
    // and public calls will throw NO_BACKEND, which is the correct signal.
    _ready = true;
    try { _readyResolve && _readyResolve(); } catch {}
  });

})();
