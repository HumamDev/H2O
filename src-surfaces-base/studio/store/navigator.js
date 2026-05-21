/* H2O Studio — Store: Navigator (Phase 1f, read-only)
 *
 * Read-only Studio-side façade over the native Navigator Engine
 * (src-runtime-base/3V1a) per-chat state blob. Phase 1f introduces
 * the API and subscription wiring; no write methods are exposed, no
 * Dock UI is built, no native runtime is touched, no turn-model
 * abstraction is added, and no outline is generated from DOM.
 *
 * Native key this façade reads (verbatim from 3V1a:22, 27, 84):
 *   h2o:prm:cgx:nvgngn:state:navigator:v1:${chatId | 'unknown'}
 *
 * Chat-id fallback rule:
 *   The native engine uses the literal string `'unknown'`
 *   (3V1a.js:84) when chatId is empty or missing. This façade matches
 *   that fallback verbatim via H2O.Studio.DockKeyFor.navigatorKey
 *   (which uses `safeId(chatId, 'unknown')`). Passing an empty string
 *   or null reads the same per-chat bucket the native engine writes.
 *
 * Native blob shape (from 3V1a.js:55-56, 248-249, 431-469):
 *   {
 *     pins:      Array<{ turnId: string,
 *                        kind:   'question' | 'answer',
 *                        answerId?: string }>,
 *     aliases:   { [turnId | 'turnId::a:answerId']: string },
 *     collapsed: { [turnId]: boolean }
 *   }
 *
 *   Notes on shape:
 *   - The native engine may write `collapsed[turnId] = false` after a
 *     toggle (not just delete the key). listCollapsed() therefore
 *     filters to truthy values so consumers get "currently collapsed"
 *     turn ids, not "ever touched" turn ids.
 *   - Alias keys may include `::a:<answerId>` to disambiguate per-
 *     answer aliases from per-turn aliases. listAliases() preserves
 *     these keys verbatim — consumers needing the answer-level alias
 *     parse the key themselves.
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage and platform.broadcast when a
 *     real adapter is bound (env.adapter !== 'fallback').
 *   - Falls back to a read-only no-op in-memory cache when no real
 *     adapter is bound. selfCheck reports the fallback so callers can
 *     surface a warning.
 *   - NEVER writes to navigator keys. Never mutates stored blobs. No
 *     migration, no schema normalization, no outline generation, no
 *     pin/alias/collapse editing.
 *
 * Read flow:
 *   get / getAll / getState / listPinned / listAliases / listCollapsed
 *   are synchronous. They return the cached value (or null / empty
 *   array) and, on the first read of an unseen chatId, kick off an
 *   async fetch. When the fetch resolves the cache is populated and
 *   subscribers receive a 'change' event with source: 'fetch'.
 *
 * Subscription flow:
 *   subscribe(fn) returns an unsubscribe function. The listener fires
 *   only for navigator keys (the prefix above). Non-navigator keys
 *   delivered by platform.broadcast.onAnyChange are filtered out
 *   before any listener is called. Listener errors are caught and
 *   recorded but do not interrupt other subscribers.
 *
 * Phase 1f is READ-ONLY: no public set/update/remove/saveNow/write
 * API. No turn-model abstraction. No outline rendering. No DOM
 * inspection. No pin/alias/collapse editing.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1f scope)
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
  if (H2O.Studio.store.navigator && H2O.Studio.store.navigator.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1f-readonly';

  /* Phase 0B / 1f key sources: prefer H2O.Studio.DockKeys + DockKeyFor.
   * Fall back to inline literal strings mirrored verbatim from native
   * 3V1a if helpers are missing — same behavior either way. */
  function pickKeys() {
    const dk = H2O.Studio && H2O.Studio.DockKeys;
    const dkf = H2O.Studio && H2O.Studio.DockKeyFor;
    return {
      prefix:        (dk && dk.navigatorPerChatPrefix) || 'h2o:prm:cgx:nvgngn:state:navigator:v1:',
      builder:       (dkf && typeof dkf.navigatorKey === 'function') ? dkf.navigatorKey : null,
      hasDockKeys:   !!dk,
      hasDockKeyFor: !!dkf,
    };
  }

  function safeId(chatId) {
    return String(chatId == null || chatId === '' ? 'unknown' : chatId);
  }

  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
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
    const built = k.builder ? k.builder(chatId) : (k.prefix + safeId(chatId));
    return Object.freeze({
      navigator: built,
    });
  }

  function classifyKey(key) {
    if (typeof key !== 'string' || key === '') return null;
    const k = pickKeys();
    if (key.indexOf(k.prefix) !== 0) return null;
    const chatId = key.slice(k.prefix.length);
    if (chatId === '') return null;
    return { kind: 'navigator', chatId: chatId };
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
    const key = keysFor(chatId).navigator;
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }

  /* ── Public read API (sync; lazy-load behind cache) ───────────────── */
  function get(chatId) {
    return readRaw(chatId);
  }
  function getAll(chatId) { return readRaw(chatId); }

  function getState(chatId) {
    const key = keysFor(chatId).navigator;
    const raw = readRaw(chatId);
    return {
      chatId: safeId(chatId),
      raw: raw,
      key: key,
      found: raw != null,
    };
  }

  /* listPinned: returns a shallow-copied array of pin entries from
   * raw.pins. Each entry preserves the native shape verbatim
   * ({turnId, kind, answerId?}). */
  function listPinned(chatId) {
    const raw = readRaw(chatId);
    if (!isPlainObject(raw)) return [];
    const pins = raw.pins;
    if (!Array.isArray(pins)) return [];
    return pins.slice();
  }

  /* listAliases: returns an array of { key, value } entries from
   * raw.aliases. Alias keys may include the `::a:<answerId>` suffix
   * for answer-level aliases — preserved verbatim. */
  function listAliases(chatId) {
    const raw = readRaw(chatId);
    if (!isPlainObject(raw)) return [];
    const aliases = raw.aliases;
    if (!isPlainObject(aliases)) return [];
    const out = [];
    const keys = Object.keys(aliases);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      const v = aliases[k];
      if (typeof v === 'string' && v.length > 0) {
        out.push({ key: k, value: v });
      }
    }
    return out;
  }

  /* listCollapsed: returns an array of { turnId, collapsed: true }
   * entries from raw.collapsed, filtered to truthy values only. The
   * native engine may store `false` after a toggle so we only surface
   * currently-collapsed turn ids. */
  function listCollapsed(chatId) {
    const raw = readRaw(chatId);
    if (!isPlainObject(raw)) return [];
    const col = raw.collapsed;
    if (!isPlainObject(col)) return [];
    const out = [];
    const keys = Object.keys(col);
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (col[k]) {
        out.push({ turnId: k, collapsed: true });
      }
    }
    return out;
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
      if (!cls) return;                       /* filtered: non-navigator key */
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
    getState: getState,
    listPinned: listPinned,
    listAliases: listAliases,
    listCollapsed: listCollapsed,
    keysFor: keysFor,
    subscribe: subscribe,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Register with store/index if present; else attach directly ──── */
  const store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      const ok = store.__registerEntity('navigator', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) {
        store.navigator = api;
      }
    } catch (e) {
      recordError('register', e);
      store.navigator = api;
    }
  } else {
    try { console.warn('[H2O.Studio.store.navigator] store/index.js not present; attaching directly'); }
    catch (_) { /* ignore */ }
    store.navigator = api;
  }

  bindBroadcast();
})(globalThis);
