/* H2O Studio — Store: Bookmarks (Phase 1d, read-only)
 *
 * Read-only Studio-side façade over the native Bookmarks Engine
 * (src-runtime-base/3B1a) per-chat storage key. Phase 1d introduces
 * the API and subscription wiring; no write methods are exposed, no
 * Dock UI is built, no native runtime is touched.
 *
 * Native key this façade reads (verbatim from 3B1a:97,143-145):
 *   h2o:prm:cgx:bkmrksngne:state:bookmarks_${chatId | 'unknown'}:v1
 *
 * Chat-id fallback rule:
 *   The native engine uses `STR.chatUnknown` = `'unknown'` (3B1a.js:97)
 *   for an empty or missing chatId. This façade matches that fallback
 *   verbatim, so a missing chatId reads the same per-chat blob the
 *   native engine writes.
 *
 * Native blob shape (from 3B1a.js:243 `getAll(){ return loadStore(); }`
 * and the upsert/migration code paths around line 220-364):
 *   Array<{
 *     msgId:       string,   // canonical id (may be migrated to primaryAId)
 *     primaryAId?: string,   // preferred fallback id
 *     pairNo?:     number,   // sort key
 *     snapText?:   string,   // snapshot text, capped at 12000 chars
 *     title?:      string,   // first-line title
 *     turnNo?:     number,
 *     role?:       string,
 *     createdAt?:  number,
 *   }>
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage and platform.broadcast when a
 *     real adapter is bound (env.adapter !== 'fallback').
 *   - Falls back to a read-only no-op in-memory cache when no real
 *     adapter is bound. selfCheck reports the fallback so callers can
 *     surface a warning.
 *   - NEVER writes to bookmark keys. Never mutates stored blobs. No
 *     migration, no schema normalization.
 *
 * Read flow:
 *   get / getAll / list / getBookmark are synchronous. They return the
 *   cached value (or null / empty array) and, on the first read of an
 *   unseen chatId, kick off an async fetch. When the fetch resolves
 *   the cache is populated and subscribers receive a 'change' event
 *   with source: 'fetch'.
 *
 * Subscription flow:
 *   subscribe(fn) returns an unsubscribe function. The listener fires
 *   only for bookmark keys (`h2o:prm:cgx:bkmrksngne:state:bookmarks_…:v1`).
 *   Non-bookmark keys delivered by platform.broadcast.onAnyChange are
 *   filtered out before any listener is called. Listener errors are
 *   caught and recorded but do not interrupt other subscribers.
 *
 * Phase 1d is READ-ONLY: no public set/update/remove/saveNow/write API.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1d scope)
 *   src-surfaces-base/studio/STUDIO_DOCK_PANEL_CONTRACT.md
 *   src-surfaces-base/studio/STUDIO_PLATFORM_ADAPTER_GUIDE.md
 *   src-surfaces-base/studio/store/README.md
 */
(function (global) {
  'use strict';

  const H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.store = H2O.Studio.store || {};

  /* Idempotency. */
  if (H2O.Studio.store.bookmarks && H2O.Studio.store.bookmarks.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1d-readonly';
  const KEY_SUFFIX = ':v1';

  /* Phase 0B / 1d key sources: prefer H2O.Studio.DockKeys + DockKeyFor.
   * Fall back to inline literal strings mirrored verbatim from native
   * 3B1a if helpers are missing — same behavior either way. */
  function pickKeys() {
    const dk = H2O.Studio && H2O.Studio.DockKeys;
    const dkf = H2O.Studio && H2O.Studio.DockKeyFor;
    return {
      prefix:        (dk && dk.bookmarksPerChatPrefix) || 'h2o:prm:cgx:bkmrksngne:state:bookmarks_',
      builder:       (dkf && typeof dkf.bookmarkKey === 'function') ? dkf.bookmarkKey : null,
      hasDockKeys:   !!dk,
      hasDockKeyFor: !!dkf,
    };
  }

  function safeId(chatId) {
    return String(chatId == null || chatId === '' ? 'unknown' : chatId);
  }

  /* ── State ────────────────────────────────────────────────────────── */
  const cache = new Map();
  const inflight = new Map();
  const subscribers = new Set();
  const errors = [];
  const errMax = 20;
  let platformStorage = null;
  let platformBroadcast = null;
  let hasPlatformStorage = false;
  let registeredWithStoreIndex = false;

  function detectPlatform() {
    try {
      const platform = H2O.Studio && H2O.Studio.platform;
      if (!platform || !platform.storage) {
        return { ps: null, broadcast: null, real: false };
      }
      const env = platform.env || {};
      const real = env.adapter && env.adapter !== 'fallback';
      return {
        ps: platform.storage,
        broadcast: platform.broadcast || null,
        real: !!real,
      };
    } catch (_) {
      return { ps: null, broadcast: null, real: false };
    }
  }

  function recordError(op, e) {
    try {
      const message = String((e && e.message) || (e && e.stack) || e || '');
      errors.push({ t: Date.now(), op: String(op), e: message });
      if (errors.length > errMax) errors.splice(0, errors.length - errMax);
    } catch (_) { /* swallow */ }
  }

  function notify(event) {
    subscribers.forEach(function (fn) {
      try { fn(event); }
      catch (e) { recordError('subscriber', e); }
    });
  }

  /* ── Key helpers ──────────────────────────────────────────────────── */
  function keysFor(chatId) {
    const k = pickKeys();
    const built = k.builder ? k.builder(chatId) : (k.prefix + safeId(chatId) + KEY_SUFFIX);
    return Object.freeze({
      bookmarks: built,
    });
  }

  /* A key is a bookmark key iff it starts with the per-chat prefix and
   * ends with ':v1'. Extract chatId from the slice between them. */
  function classifyKey(key) {
    if (typeof key !== 'string' || key === '') return null;
    const k = pickKeys();
    if (key.indexOf(k.prefix) !== 0) return null;
    if (key.length <= k.prefix.length + KEY_SUFFIX.length) return null;
    if (key.slice(-KEY_SUFFIX.length) !== KEY_SUFFIX) return null;
    const chatId = key.slice(k.prefix.length, key.length - KEY_SUFFIX.length);
    if (chatId === '') return null;
    return { kind: 'bookmarks', chatId: chatId };
  }

  /* Best-effort normalization of the native blob into an array. The
   * native engine stores an Array; we accept that shape and also
   * tolerate a missing or non-array value by returning []. We do NOT
   * rewrite the underlying blob. */
  function normalizeEntries(raw) {
    if (Array.isArray(raw)) return raw.slice();      /* shallow copy; caller-safe */
    if (raw && Array.isArray(raw.items)) return raw.items.slice();
    if (raw && Array.isArray(raw.bookmarks)) return raw.bookmarks.slice();
    return [];
  }

  /* ── Lazy fetch (sync API, async hydrate) ─────────────────────────── */
  function ensureFetch(key) {
    if (cache.has(key)) return;
    if (inflight.has(key)) return;
    if (!platformStorage || typeof platformStorage.get !== 'function') return;
    let promise;
    try {
      const result = platformStorage.get(key);
      if (result && typeof result.then === 'function') {
        promise = result;
      } else {
        cache.set(key, result == null ? null : result);
        return;
      }
    } catch (e) {
      recordError('fetch:start:' + key, e);
      cache.set(key, null);
      return;
    }
    inflight.set(key, promise);
    promise.then(function (value) {
      inflight.delete(key);
      const had = cache.has(key);
      const oldValue = had ? cache.get(key) : undefined;
      cache.set(key, value == null ? null : value);
      const cls = classifyKey(key);
      if (cls) {
        notify({
          type: 'change',
          key: key,
          chatId: cls.chatId,
          value: cache.get(key),
          oldValue: oldValue,
          at: Date.now(),
          source: 'fetch',
        });
      }
    }, function (e) {
      inflight.delete(key);
      recordError('fetch:reject:' + key, e);
      cache.set(key, null);
    });
  }

  function readRaw(chatId) {
    const key = keysFor(chatId).bookmarks;
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }

  /* ── Public read API (sync; lazy-load behind cache) ───────────────── */
  function get(chatId) {
    const key = keysFor(chatId).bookmarks;
    const raw = readRaw(chatId);
    return {
      chatId: safeId(chatId),
      raw: raw,
      entries: normalizeEntries(raw),
      key: key,
      found: raw != null,
    };
  }

  /* getAll(chatId) aliases get(chatId). */
  function getAll(chatId) { return get(chatId); }

  /* list(chatId) returns just the entries array. Stable best-effort. */
  function list(chatId) {
    return normalizeEntries(readRaw(chatId));
  }

  /* getBookmark(chatId, bookmarkId) finds a single entry by msgId or
   * primaryAId. Returns the entry object or null. */
  function getBookmark(chatId, bookmarkId) {
    if (typeof bookmarkId !== 'string' || bookmarkId === '') return null;
    const entries = normalizeEntries(readRaw(chatId));
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (!e || typeof e !== 'object') continue;
      if (e.msgId === bookmarkId) return e;
    }
    /* Fallback: match by primaryAId. */
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (!e || typeof e !== 'object') continue;
      if (e.primaryAId === bookmarkId) return e;
    }
    return null;
  }

  /* ── Subscription ─────────────────────────────────────────────────── */
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.add(fn);
    return function unsubscribe() { subscribers.delete(fn); };
  }

  function selfCheck() {
    const k = pickKeys();
    return {
      ok: errors.length === 0,
      version: VERSION,
      readonly: true,
      hasPlatformStorage: hasPlatformStorage,
      hasDockKeys: k.hasDockKeys,
      hasDockKeyFor: k.hasDockKeyFor,
      registeredWithStoreIndex: registeredWithStoreIndex,
      errors: errors.slice(),
    };
  }

  /* ── Cross-context broadcast wiring ───────────────────────────────── */
  function handlePlatformChange(changes, area) {
    if (!changes || typeof changes !== 'object') return;
    if (area !== undefined && area !== 'local') return;
    Object.keys(changes).forEach(function (key) {
      const cls = classifyKey(key);
      if (!cls) return;                          /* filtered: non-bookmark key */
      const change = changes[key] || {};
      const newValue = change.newValue == null ? null : change.newValue;
      const oldCacheValue = cache.has(key) ? cache.get(key) : undefined;
      cache.set(key, newValue);
      notify({
        type: 'change',
        key: key,
        chatId: cls.chatId,
        value: newValue,
        oldValue: oldCacheValue,
        at: Date.now(),
        source: 'cross-tab',
      });
    });
  }

  function bindBroadcast() {
    const detected = detectPlatform();
    platformStorage = detected.ps;
    platformBroadcast = detected.broadcast;
    hasPlatformStorage = detected.real;
    if (!platformBroadcast || typeof platformBroadcast.onAnyChange !== 'function') return;
    try {
      platformBroadcast.onAnyChange(handlePlatformChange);
    } catch (e) {
      recordError('bindBroadcast', e);
    }
  }

  /* ── Assemble the public API (read-only) ──────────────────────────── */
  const api = {
    version: VERSION,
    readonly: true,
    get: get,
    getAll: getAll,
    list: list,
    getBookmark: getBookmark,
    keysFor: keysFor,
    subscribe: subscribe,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Register with store/index if present; else attach directly ──── */
  const store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      const ok = store.__registerEntity('bookmarks', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) {
        store.bookmarks = api;
      }
    } catch (e) {
      recordError('register', e);
      store.bookmarks = api;
    }
  } else {
    try { console.warn('[H2O.Studio.store.bookmarks] store/index.js not present; attaching directly'); }
    catch (_) { /* ignore */ }
    store.bookmarks = api;
  }

  bindBroadcast();
})(globalThis);
