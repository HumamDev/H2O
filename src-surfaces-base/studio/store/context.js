/* H2O Studio — Store: Context (Phase 1c, read-only)
 *
 * Read-only Studio-side façade over the native Context Engine
 * (src-runtime-base/3W1a) storage keys. Phase 1c introduces the API
 * and subscription wiring; no write methods are exposed, no Dock UI is
 * built, no native runtime is touched.
 *
 * Native keys this façade reads (verbatim from 3W1a:37-40):
 *   h2o:prm:cgx:ctxeng:meta:v1                              (singleton)
 *   h2o:prm:cgx:ctxeng:items:v1:${chatId | 'unknown'}       (per-chat)
 *   h2o:prm:cgx:ctxeng:ui:v1:${chatId | 'unknown'}          (per-chat)
 *   h2o:prm:cgx:ctxeng:history:v1:${chatId | 'unknown'}     (per-chat)
 *
 * Chat-id fallback rule:
 *   The native engine (3W1a.js:38-40) uses 'unknown' for an empty or
 *   missing chatId. This façade matches that fallback verbatim, so a
 *   missing chatId reads the same bucket the native engine writes.
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage and platform.broadcast when a
 *     real adapter is bound (env.adapter !== 'fallback').
 *   - Falls back to a read-only no-op in-memory cache when no real
 *     adapter is bound. selfCheck reports the fallback so callers can
 *     surface a warning.
 *   - NEVER writes to context keys. Never mutates stored blobs. No
 *     migration, no schema normalization.
 *
 * Read flow:
 *   getMeta / getItems / getUi / getHistory are synchronous. They
 *   return the cached value (or null) and, on the first read of an
 *   unseen key, kick off an async fetch. When the fetch resolves the
 *   cache is populated and subscribers receive a 'change' event with
 *   source: 'fetch'.
 *
 * Subscription flow:
 *   subscribe(fn) returns an unsubscribe function. The listener fires
 *   only for context keys (meta, items, ui, history). Non-context keys
 *   delivered by platform.broadcast.onAnyChange are filtered out
 *   before any listener is called. Listener errors are caught and
 *   recorded but do not interrupt other subscribers.
 *
 * Phase 1c is READ-ONLY: no public set/update/remove/saveNow/write API.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1c scope)
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
  if (H2O.Studio.store.context && H2O.Studio.store.context.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1c-readonly';

  /* Phase 0B / 1c key sources: prefer H2O.Studio.DockKeys + DockKeyFor
   * (loaded earlier in studio.html). Fall back to inline literal strings
   * mirrored verbatim from native 3W1a if helpers are missing — same
   * behavior either way. */
  function pickKeys() {
    const dk = H2O.Studio && H2O.Studio.DockKeys;
    const dkf = H2O.Studio && H2O.Studio.DockKeyFor;
    return {
      meta:           (dk && dk.contextMeta)                 || 'h2o:prm:cgx:ctxeng:meta:v1',
      itemsPrefix:    (dk && dk.contextItemsPerChatPrefix)   || 'h2o:prm:cgx:ctxeng:items:v1:',
      uiPrefix:       (dk && dk.contextUiPerChatPrefix)      || 'h2o:prm:cgx:ctxeng:ui:v1:',
      historyPrefix:  (dk && dk.contextHistoryPerChatPrefix) || 'h2o:prm:cgx:ctxeng:history:v1:',
      itemsBuilder:   (dkf && typeof dkf.contextItemsKey   === 'function') ? dkf.contextItemsKey   : null,
      uiBuilder:      (dkf && typeof dkf.contextUiKey      === 'function') ? dkf.contextUiKey      : null,
      historyBuilder: (dkf && typeof dkf.contextHistoryKey === 'function') ? dkf.contextHistoryKey : null,
      hasDockKeys:    !!dk,
      hasDockKeyFor:  !!dkf,
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
    const id = safeId(chatId);
    const items   = k.itemsBuilder   ? k.itemsBuilder(chatId)   : (k.itemsPrefix   + id);
    const ui      = k.uiBuilder      ? k.uiBuilder(chatId)      : (k.uiPrefix      + id);
    const history = k.historyBuilder ? k.historyBuilder(chatId) : (k.historyPrefix + id);
    return Object.freeze({
      meta: k.meta,
      items: items,
      ui: ui,
      history: history,
    });
  }

  function classifyKey(key) {
    if (typeof key !== 'string' || key === '') return null;
    const k = pickKeys();
    if (key === k.meta) return { kind: 'meta', chatId: null };
    if (key.indexOf(k.itemsPrefix)   === 0) return { kind: 'items',   chatId: key.slice(k.itemsPrefix.length) };
    if (key.indexOf(k.uiPrefix)      === 0) return { kind: 'ui',      chatId: key.slice(k.uiPrefix.length) };
    if (key.indexOf(k.historyPrefix) === 0) return { kind: 'history', chatId: key.slice(k.historyPrefix.length) };
    return null;
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
        /* Adapter returned synchronously (defensive). */
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

  /* ── Public read API (sync; lazy-load behind cache) ───────────────── */
  function getMeta() {
    const k = pickKeys();
    ensureFetch(k.meta);
    return cache.has(k.meta) ? cache.get(k.meta) : null;
  }
  function getItems(chatId) {
    const key = keysFor(chatId).items;
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }
  function getUi(chatId) {
    const key = keysFor(chatId).ui;
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }
  function getHistory(chatId) {
    const key = keysFor(chatId).history;
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }
  function getBundle(chatId) {
    const keys = keysFor(chatId);
    const meta = getMeta();
    const items = getItems(chatId);
    const ui = getUi(chatId);
    const history = getHistory(chatId);
    return {
      chatId: safeId(chatId),
      meta: meta,
      items: items,
      ui: ui,
      history: history,
      keys: keys,
      found: {
        meta:    meta    != null,
        items:   items   != null,
        ui:      ui      != null,
        history: history != null,
      },
    };
  }
  /* getAll(chatId) aliases getBundle(chatId). */
  function getAll(chatId) { return getBundle(chatId); }

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
    /* chrome.storage.onChanged fires for one area at a time. We only
     * care about 'local' (where 3W1a writes). Tauri adapter may pass
     * undefined; accept that as well. */
    if (area !== undefined && area !== 'local') return;
    Object.keys(changes).forEach(function (key) {
      const cls = classifyKey(key);
      if (!cls) return;                          /* filtered: non-context key */
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
    getMeta: getMeta,
    getItems: getItems,
    getUi: getUi,
    getHistory: getHistory,
    getBundle: getBundle,
    getAll: getAll,
    keysFor: keysFor,
    subscribe: subscribe,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Register with store/index if present; else attach directly ──── */
  const store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      const ok = store.__registerEntity('context', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) {
        store.context = api;
      }
    } catch (e) {
      recordError('register', e);
      store.context = api;
    }
  } else {
    try { console.warn('[H2O.Studio.store.context] store/index.js not present; attaching directly'); }
    catch (_) { /* ignore */ }
    store.context = api;
  }

  /* Bind broadcast last so registration is observable in selfCheck even
   * if broadcast wiring throws. */
  bindBroadcast();
})(globalThis);
