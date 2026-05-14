/* H2O Studio Store — Highlights Entity (Stage 1: parallel infra)
 *
 * Registers H2O.Studio.store.highlights as a parallel entity store for the
 * planned migration of S3H1a's UTIL_storage IIFE into a Studio-wide façade.
 *
 * STAGE 1 SCOPE (this commit):
 *   - Hydrate the same canonical chrome.storage.local key S3H1a uses.
 *   - Subscribe to cross-tab changes via platform.broadcast.onAnyChange,
 *     with a direct chrome.storage.onChanged fallback when the platform
 *     adapter is unavailable.
 *   - Expose the full public API listed below.
 *   - Record errors in diagnostics; never throw during boot.
 *
 * STAGE 1 NON-GOALS (deliberately not done here):
 *   - Does NOT take over S3H1a's read/write paths — S3H1a's UTIL_storage
 *     remains the active code path for the live Highlights workflow.
 *   - Does NOT run legacy-key bootstrap on init (deferred to Stage 4).
 *     init() reads ONLY the canonical v3 key; if it's missing the cache is
 *     simply empty. No write happens on boot.
 *   - Does NOT touch UI prefs (KEY_CFG_UI_V1) or CFG_load/save in S3H1a.
 *   - Does NOT mirror alias/legacy keys on write (matches current
 *     CFG_MIRROR_LEGACY_KEYS=false / CFG_MIRROR_ALIAS_KEYS=false in S3H1a).
 *
 * Wire format preserved exactly (must match S3H1a):
 *   key  : 'h2o:prm:cgx:nlnhghlghtr:state:inline_highlights:v3'
 *   shape: { itemsByAnswer: { [answerId]: Item[] },
 *            convoId?: string,
 *            _meta?: { currentColor?: string } }
 *   debounce: 250ms (matches S3H1a CFG_SAVE_DEBOUNCE_MS)
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
    try { console.warn('[H2O.Studio.store.highlights] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.highlights && store.highlights.__installed) {
    return;
  }

  /* ── Constants (mirror S3H1a exactly) ─────────────────────────────── */
  var NS_DISK = 'h2o:prm:cgx:nlnhghlghtr';
  var KEY_DISK_CANON = NS_DISK + ':state:inline_highlights:v3';
  var LEGACY_DISK_KEYS = Object.freeze([
    NS_DISK + ':state:inline_highlights:v2',
    NS_DISK + ':state:inline_highlights:v1',
    'h2o:inlineHighlights.v3',
    'h2o:inlineHighlights',
    'h2o:inlineHighlights.v2',
    'ho:inlineHighlights.v2',
    'ho:inlineHighlights',
  ]);
  var KEY_MIG_DISK_V1 = NS_DISK + ':migrate:inline_highlights:v1';
  var SAVE_DEBOUNCE_MS = 250;

  /* ── State ────────────────────────────────────────────────────────── */
  var state = {
    cache: null,                /* canonical blob; null until init() */
    ready: false,
    pending: false,             /* dirty + scheduled save */
    saveTimer: null,
    lastSavedAt: null,
    lastReloadedAt: null,
    unsubBroadcast: null,
    transport: null,            /* 'platform.broadcast' | 'chrome.storage' | 'none' */
    errors: [],
    errMax: 20,
    subscribers: new Set(),
  };

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
  function hasLocalStorage() {
    try { return typeof global.localStorage !== 'undefined' && global.localStorage !== null; }
    catch (_) { return false; }
  }
  function getPlatformBroadcast() {
    var p = global.H2O && global.H2O.Studio && global.H2O.Studio.platform && global.H2O.Studio.platform.broadcast;
    if (!p || typeof p.onAnyChange !== 'function') return null;
    var env = global.H2O && global.H2O.Studio && global.H2O.Studio.platform && global.H2O.Studio.platform.env;
    if (env && env.adapter === 'fallback') return null;
    return p;
  }

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function safeParse(raw, fallback) {
    if (raw == null) return fallback;
    if (typeof raw === 'object') return raw;
    try { var v = JSON.parse(raw); return v == null ? fallback : v; }
    catch (_) { return fallback; }
  }
  function isPlainObject(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
    var proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
  }
  function asStoreObj(v) { return isPlainObject(v) ? v : {}; }
  function clone(obj) {
    try { return JSON.parse(JSON.stringify(obj || {})); }
    catch (_) { return {}; }
  }
  function ensureShape(obj) {
    var blob = isPlainObject(obj) ? clone(obj) : {};
    if (!isPlainObject(blob.itemsByAnswer)) blob.itemsByAnswer = {};
    if (!isPlainObject(blob._meta)) blob._meta = {};
    return blob;
  }
  function countItems(blob) {
    var total = 0;
    var iba = asStoreObj(asStoreObj(blob).itemsByAnswer);
    var keys = Object.keys(iba);
    for (var i = 0; i < keys.length; i += 1) {
      var arr = iba[keys[i]];
      if (Array.isArray(arr)) total += arr.length;
    }
    return total;
  }

  /* Non-destructive merge: last-write-wins by per-item `ts`. Mirrors
   * S3H1a's _mergeStore semantics so cross-tab races stay byte-identical. */
  function mergeBlob(a, b) {
    if (!isPlainObject(a) && !isPlainObject(b)) return null;
    if (!isPlainObject(a)) return clone(b);
    if (!isPlainObject(b)) return clone(a);
    var out = clone(a);
    out.itemsByAnswer = asStoreObj(out.itemsByAnswer);
    var srcItems = asStoreObj(b.itemsByAnswer);
    var keys = Object.keys(srcItems);
    for (var i = 0; i < keys.length; i += 1) {
      var ans = keys[i];
      var srcList = srcItems[ans];
      if (!Array.isArray(srcList) || !srcList.length) continue;
      var prevList = Array.isArray(out.itemsByAnswer[ans]) ? out.itemsByAnswer[ans].slice() : [];
      var byId = Object.create(null);
      for (var j = 0; j < prevList.length; j += 1) {
        var p = prevList[j];
        var pid = (p && p.id != null) ? String(p.id) : '';
        if (pid) byId[pid] = p;
      }
      for (var k = 0; k < srcList.length; k += 1) {
        var item = srcList[k];
        if (!isPlainObject(item)) continue;
        var iid = item.id != null ? String(item.id) : '';
        if (!iid) { prevList.push(item); continue; }
        var prevTs = Number(byId[iid] && byId[iid].ts || 0);
        var nextTs = Number(item.ts || 0);
        if (!byId[iid] || nextTs >= prevTs) byId[iid] = item;
      }
      var mergedIds = Object.keys(byId);
      var merged = [];
      for (var m = 0; m < mergedIds.length; m += 1) merged.push(byId[mergedIds[m]]);
      for (var n = 0; n < prevList.length; n += 1) {
        var it = prevList[n];
        if (!(it && it.id != null)) merged.push(it);
      }
      out.itemsByAnswer[ans] = merged;
    }
    if (!isPlainObject(out._meta)) out._meta = {};
    var srcMeta = isPlainObject(b._meta) ? b._meta : {};
    if (!out._meta.currentColor && srcMeta.currentColor) out._meta.currentColor = String(srcMeta.currentColor);
    if (!out.convoId && b.convoId) out.convoId = String(b.convoId);
    return out;
  }

  /* ── Low-level disk I/O ───────────────────────────────────────────── */
  /* Read the canonical key from chrome.storage.local AND the localStorage
   * mirror, then merge non-destructively. Matches the pattern in S3H1a's
   * UTIL_storage._readRaw (canonical-only path). LEGACY key bootstrap is
   * deliberately NOT performed here — that is Stage 4. */
  function readCanonical() {
    return new Promise(function (resolve) {
      var chromeVal = null;
      var lsVal = null;
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(mergeBlob(chromeVal, lsVal));
      }
      if (hasLocalStorage()) {
        try {
          var raw = global.localStorage.getItem(KEY_DISK_CANON);
          lsVal = raw ? safeParse(raw, null) : null;
        } catch (e) { recordError('readCanonical.ls', e); }
      }
      if (!hasChromeStorage()) { finish(); return; }
      try {
        global.chrome.storage.local.get([KEY_DISK_CANON], function (r) {
          try {
            var v = r && r[KEY_DISK_CANON];
            chromeVal = isPlainObject(v) ? v : null;
          } catch (e) { recordError('readCanonical.parse', e); }
          finish();
        });
      } catch (e) {
        recordError('readCanonical.chrome.throw', e);
        finish();
      }
    });
  }

  /* Write the canonical blob to BOTH chrome.storage.local AND the
   * localStorage mirror, matching S3H1a's _writeRaw + _writeLocalMirror
   * pattern (line ~978–994). Stage 1: write APIs exist but are not
   * auto-invoked on boot. */
  function writeCanonical(blob) {
    var safe = ensureShape(blob);
    if (hasLocalStorage()) {
      try { global.localStorage.setItem(KEY_DISK_CANON, JSON.stringify(safe)); }
      catch (e) { recordError('writeCanonical.ls', e); }
    }
    return new Promise(function (resolve) {
      if (!hasChromeStorage()) {
        state.lastSavedAt = Date.now();
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
          resolve();
        });
      } catch (e) {
        recordError('writeCanonical.chrome.throw', e);
        state.lastSavedAt = Date.now();
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

  /* ── Cross-tab listener ───────────────────────────────────────────── */
  function bindBroadcast() {
    if (state.unsubBroadcast) return true;
    var pb = getPlatformBroadcast();
    if (pb) {
      try {
        state.unsubBroadcast = pb.onAnyChange(handleChange);
        state.transport = 'platform.broadcast';
        return true;
      } catch (e) {
        recordError('bindBroadcast.platform', e);
        /* fall through to legacy chrome.storage path */
      }
    }
    if (hasChromeStorage() && global.chrome.storage.onChanged
        && typeof global.chrome.storage.onChanged.addListener === 'function') {
      try {
        var listener = function (changes, area) { handleChange(changes, area); };
        global.chrome.storage.onChanged.addListener(listener);
        state.unsubBroadcast = function () {
          try { global.chrome.storage.onChanged.removeListener(listener); }
          catch (_) { /* ignore */ }
        };
        state.transport = 'chrome.storage';
        return true;
      } catch (e) { recordError('bindBroadcast.chrome', e); }
    }
    state.transport = 'none';
    return false;
  }

  function handleChange(changes, area) {
    if (area !== 'local') return;
    if (!changes || !Object.prototype.hasOwnProperty.call(changes, KEY_DISK_CANON)) return;
    var rec = changes[KEY_DISK_CANON];
    var next = rec && rec.newValue;
    if (!isPlainObject(next)) return;
    /* Merge incoming non-destructively to honor per-item last-write-wins. */
    var merged = mergeBlob(state.cache || {}, next);
    if (merged) state.cache = merged;
    state.lastReloadedAt = Date.now();
    notifySubscribers({ source: 'cross-tab' });
  }

  function notifySubscribers(change) {
    state.subscribers.forEach(function (fn) {
      try { fn(change || {}); } catch (e) { recordError('notifySubscribers', e); }
    });
  }

  /* ── Public API ───────────────────────────────────────────────────── */
  function init() {
    if (state.ready) return Promise.resolve(state.cache);
    return readCanonical().then(function (blob) {
      state.cache = ensureShape(blob || {});
      state.lastReloadedAt = Date.now();
      bindBroadcast();
      state.ready = true;
      /* SAFETY: Stage 1 does NOT run legacy-key bootstrap. Reading the
       * canonical v3 key is non-destructive. If the user is on legacy data
       * and S3H1a has already imported it (via its own UTIL_storage path),
       * the canonical key is already populated and we hydrate from it. If
       * neither side has imported yet (extreme edge), the cache is simply
       * empty — S3H1a continues to be the source of truth for live state
       * during Stage 1. Legacy bootstrap moves into the store at Stage 4. */
      return state.cache;
    }).catch(function (e) {
      recordError('init', e);
      state.cache = ensureShape({});
      state.ready = true;
      return state.cache;
    });
  }

  function dispose() {
    if (state.unsubBroadcast) {
      try { state.unsubBroadcast(); } catch (_) { /* ignore */ }
      state.unsubBroadcast = null;
    }
    if (state.saveTimer) {
      try { global.clearTimeout(state.saveTimer); } catch (_) { /* ignore */ }
      state.saveTimer = null;
    }
    state.transport = 'none';
    state.ready = false;
  }

  function isReady() { return !!state.ready; }

  function getAll() { return state.cache ? clone(state.cache) : ensureShape({}); }

  function getForAnswer(answerId) {
    var id = String(answerId == null ? '' : answerId).trim();
    if (!id || !state.cache) return [];
    var iba = asStoreObj(state.cache.itemsByAnswer);
    var list = iba[id];
    return Array.isArray(list) ? clone(list) : [];
  }

  function setForAnswer(answerId, items) {
    var id = String(answerId == null ? '' : answerId).trim();
    if (!id) { recordError('setForAnswer', new Error('empty answerId')); return; }
    if (!state.cache) state.cache = ensureShape({});
    var iba = state.cache.itemsByAnswer = asStoreObj(state.cache.itemsByAnswer);
    if (Array.isArray(items) && items.length) {
      iba[id] = clone(items);
    } else {
      delete iba[id];
    }
    scheduleSave();
    notifySubscribers({ source: 'local', op: 'setForAnswer', answerId: id });
  }

  function removeForAnswer(answerId) {
    var id = String(answerId == null ? '' : answerId).trim();
    if (!id || !state.cache) return;
    var iba = asStoreObj(state.cache.itemsByAnswer);
    if (Object.prototype.hasOwnProperty.call(iba, id)) {
      delete iba[id];
      scheduleSave();
      notifySubscribers({ source: 'local', op: 'removeForAnswer', answerId: id });
    }
  }

  function update(updaterOrObj) {
    if (!state.cache) state.cache = ensureShape({});
    var next;
    if (typeof updaterOrObj === 'function') {
      var draft = clone(state.cache);
      var result;
      try { result = updaterOrObj(draft); }
      catch (e) { recordError('update.updater', e); return; }
      next = isPlainObject(result) ? result : draft;
    } else if (isPlainObject(updaterOrObj)) {
      next = updaterOrObj;
    } else {
      recordError('update', new Error('invalid argument: expected function or plain object'));
      return;
    }
    state.cache = ensureShape(next);
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
    return readCanonical().then(function (blob) {
      state.cache = ensureShape(blob || {});
      state.lastReloadedAt = Date.now();
      notifySubscribers({ source: 'reload' });
      return clone(state.cache);
    }).catch(function (e) {
      recordError('reload', e);
      return state.cache ? clone(state.cache) : ensureShape({});
    });
  }

  function getCurrentColor() {
    var c = state.cache && state.cache._meta && state.cache._meta.currentColor;
    return c ? String(c) : '';
  }

  function setCurrentColor(name) {
    if (!state.cache) state.cache = ensureShape({});
    if (!isPlainObject(state.cache._meta)) state.cache._meta = {};
    state.cache._meta.currentColor = String(name == null ? '' : name).trim().toLowerCase();
    scheduleSave();
    notifySubscribers({ source: 'local', op: 'setCurrentColor' });
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    state.subscribers.add(fn);
    return function () { state.subscribers.delete(fn); };
  }

  function diagnose() {
    var backend;
    if (hasChromeStorage()) backend = 'chrome.storage';
    else if (hasLocalStorage()) backend = 'localStorage';
    else backend = 'none';
    var pAdapter = global.H2O && global.H2O.Studio && global.H2O.Studio.platform
      && global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.adapter;
    var cacheAnswers = state.cache ? Object.keys(asStoreObj(state.cache.itemsByAnswer)).length : 0;
    return {
      installed: true,
      ready: state.ready,
      backend: backend,
      transport: state.transport,
      platformAdapter: pAdapter || null,
      canonicalKey: KEY_DISK_CANON,
      legacyKeys: LEGACY_DISK_KEYS.slice(),
      migrationFlagKey: KEY_MIG_DISK_V1,
      cacheAnswers: cacheAnswers,
      cacheItems: state.cache ? countItems(state.cache) : 0,
      pendingSave: !!state.pending,
      lastSavedAt: state.lastSavedAt,
      lastReloadedAt: state.lastReloadedAt,
      saveDebounceMs: SAVE_DEBOUNCE_MS,
      subscribers: state.subscribers.size,
      errors: state.errors.slice(),
      /* Stage marker — feature code should not depend on this. */
      stage: 1,
      parallelInfra: true,
      writesByS3H1aStillActive: true,
      legacyBootstrapDeferred: 'stage-4',
      legacyKeyCompat: true,
    };
  }

  /* ── Register & schedule init ─────────────────────────────────────── */
  var api = {
    __installed: true,
    __version: '0.1.0',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getForAnswer: getForAnswer,
    setForAnswer: setForAnswer,
    removeForAnswer: removeForAnswer,
    getAll: getAll,
    update: update,
    saveNow: saveNow,
    reload: reload,
    getCurrentColor: getCurrentColor,
    setCurrentColor: setCurrentColor,
    subscribe: subscribe,
    diagnose: diagnose,
  };
  store.__registerEntity('highlights', api);

  /* Hydrate on next tick so the platform adapter has time to register.
   * init() only READS the canonical key — no mutation on boot. */
  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
