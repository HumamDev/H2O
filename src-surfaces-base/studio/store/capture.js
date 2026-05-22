/* H2O Studio — Store: Capture (Phase 1g, read-only)
 *
 * Read-only Studio-side façade over the native Capture Engine
 * (src-runtime-base/3X1a) per-chat store blob and UI state. Phase 1g
 * introduces the API and subscription wiring; no write methods are
 * exposed, no Dock UI is built, no native runtime is touched, no
 * Capture conversion / archiving / live-selection logic is added.
 *
 * Phase 1g also completes the symmetric read-only foundation: the six
 * native Dock-feature engines (highlights, context, bookmarks, notes,
 * navigator, capture) now each have a read-only Studio façade.
 *
 * Native keys this façade reads (verbatim from 3X1a:20, 34-35, 44, 56,
 * 73-74):
 *   h2o:prm:cgx:capture:store:v1:${chatId | 'unknown'}     (per-chat store)
 *   h2o:prm:cgx:capture:ui:v1:${chatId    | 'unknown'}     (per-chat UI)
 *
 *   The `:v1:` infix is the value of `CFG.storeVersion` (a frozen
 *   constant set to 1 in 3X1a:35). If the native engine bumps this
 *   version in a future migration, this façade will need updating in
 *   lock-step.
 *
 * Chat-id fallback rule:
 *   The native engine uses `STR.unknownChat` = `'unknown'`
 *   (3X1a.js:44) — same fallback as bookmarks/notes/navigator. This
 *   façade matches that fallback verbatim.
 *
 * Native blob shapes (from 3X1a:78, 82, 206-228):
 *   store: {
 *     version:  number,                    // CFG.storeVersion (1)
 *     items:    Array<Item>,
 *     meta:     { createdAt, updatedAt, lastReviewAt },
 *   }
 *
 *   Item: {
 *     id:               string,            // 'cap-…'
 *     chatId:           string,
 *     kind:             string,            // default 'text'
 *     text:             string,
 *     title:            string,
 *     source:           { msgId?, role?, … },
 *     routeSuggestion:  string,
 *     status:           string,            // 'new' | 'reviewed' | 'archived' | 'converted' | …
 *     tags:             string[],
 *     pinned:           boolean,
 *     createdAt:        number,
 *     updatedAt:        number,
 *     reviewedAt:       number,
 *     convertedTo:      any | null,
 *     dismissed:        boolean,
 *   }
 *
 *   ui: {
 *     version:  number,
 *     subTab:   'capture' | 'review',
 *     sortBy:   'newest' | …,
 *     filter:   'all' | …,
 *     query:    string,
 *   }
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage and platform.broadcast when a
 *     real adapter is bound (env.adapter !== 'fallback').
 *   - Falls back to a read-only no-op in-memory cache when no real
 *     adapter is bound. selfCheck reports the fallback so callers can
 *     surface a warning.
 *   - NEVER writes to Capture keys. Never mutates stored blobs. No
 *     migration, no schema normalization, no item creation, no
 *     conversion, no archiving, no live selection.
 *
 * Read flow:
 *   getStore / getUi / getBundle / getAll / list / getItem are
 *   synchronous. They return the cached value (or null / empty array)
 *   and, on the first read of an unseen chatId, kick off async fetches
 *   for the two underlying keys. When each fetch resolves the cache is
 *   populated and subscribers receive a 'change' event with
 *   source: 'fetch'.
 *
 * Subscription flow:
 *   subscribe(fn) returns an unsubscribe function. The listener fires
 *   only for Capture keys (the two prefixes above). Non-Capture keys
 *   delivered by platform.broadcast.onAnyChange are filtered out
 *   before any listener is called. Listener errors are caught and
 *   recorded but do not interrupt other subscribers.
 *
 * Phase 1g is READ-ONLY: no public set/update/remove/saveNow/convert/
 * archive/write API. No Capture item creation. No conversion to
 * Notes/Bookmarks/Context. No live selection. No Dock UI.
 *
 * Notes on Capture's V1 Studio stance:
 *   Per STUDIO_DOCK_PANEL_CONTRACT.md, the Studio V1 stance for
 *   Capture is "inert" — Studio reads the captured items the native
 *   engine wrote but does not surface a Capture mutation path. This
 *   façade exposes the read side only; the inert/disabled UI lives in
 *   Phase 2A (when a placeholder Capture tab is rendered).
 *
 * Note on `DockKeyFor`:
 *   No `captureStoreKey` / `captureUiKey` helper exists in
 *   `dock-keys.js` yet. The user instruction for Phase 1g preferred
 *   "build keys locally inside `store/capture.js`" over editing
 *   `dock-keys.js`. This file therefore reads `DockKeys.capturePrefix`
 *   only (a passive constant) and builds the full keys locally.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1g scope)
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
  if (H2O.Studio.store.capture && H2O.Studio.store.capture.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1g-readonly';

  /* Capture key prefixes built locally from the verified native
   * namespace. DockKeys.capturePrefix is just the namespace root
   * ('h2o:prm:cgx:capture'); the per-chat store / ui keys are
   * '${ns}:store:v1:${chatId}' and '${ns}:ui:v1:${chatId}'. */
  const NATIVE_NS_LITERAL = 'h2o:prm:cgx:capture';
  const STORE_INFIX = ':store:v1:';
  const UI_INFIX    = ':ui:v1:';

  function pickKeys() {
    const dk = H2O.Studio && H2O.Studio.DockKeys;
    const ns = (dk && typeof dk.capturePrefix === 'string') ? dk.capturePrefix : NATIVE_NS_LITERAL;
    return {
      ns: ns,
      storePrefix: ns + STORE_INFIX,
      uiPrefix:    ns + UI_INFIX,
      hasDockKeys: !!dk,
      hasCapturePrefix: !!(dk && dk.capturePrefix),
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

  /* ── Key helpers (built locally; dock-keys.js untouched) ──────────── */
  function keysFor(chatId) {
    const k = pickKeys();
    const id = safeId(chatId);
    return Object.freeze({
      store: k.storePrefix + id,
      ui:    k.uiPrefix    + id,
    });
  }

  /* A key is a Capture key iff it starts with the store-prefix or
   * ui-prefix AND has a non-empty chatId after the prefix. The two
   * prefixes are disjoint (store:v1: vs ui:v1:). The migration marker
   * 'h2o:prm:cgx:capture:migrate:slot8-to-slot7:v1' is NOT a per-chat
   * key and is silently filtered out. */
  function classifyKey(key) {
    if (typeof key !== 'string' || key === '') return null;
    const k = pickKeys();
    if (key.indexOf(k.storePrefix) === 0) {
      const chatId = key.slice(k.storePrefix.length);
      if (chatId === '') return null;
      return { kind: 'store', chatId: chatId };
    }
    if (key.indexOf(k.uiPrefix) === 0) {
      const chatId = key.slice(k.uiPrefix.length);
      if (chatId === '') return null;
      return { kind: 'ui', chatId: chatId };
    }
    return null;
  }

  /* Best-effort extraction of the item array from a Capture store blob.
   * Native shape is { version, items: Array<Item>, meta }. We accept
   * that and also tolerate missing fields by returning []. Shallow
   * copy so callers cannot mutate the cache. */
  function normalizeItems(raw) {
    if (Array.isArray(raw)) return raw.slice();
    if (raw && Array.isArray(raw.items)) return raw.items.slice();
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

  function readKey(key) {
    ensureFetch(key);
    return cache.has(key) ? cache.get(key) : null;
  }

  /* ── Public read API (sync; lazy-load behind cache) ───────────────── */
  function getStore(chatId) {
    return readKey(keysFor(chatId).store);
  }
  function getUi(chatId) {
    return readKey(keysFor(chatId).ui);
  }
  function getBundle(chatId) {
    const keys = keysFor(chatId);
    const store = getStore(chatId);
    const ui = getUi(chatId);
    return {
      chatId: safeId(chatId),
      store: store,
      ui: ui,
      items: normalizeItems(store),
      keys: keys,
      found: {
        store: store != null,
        ui:    ui    != null,
      },
    };
  }
  function getAll(chatId) { return getBundle(chatId); }

  function list(chatId) {
    return normalizeItems(getStore(chatId));
  }

  function getItem(chatId, itemId) {
    if (typeof itemId !== 'string' || itemId === '') return null;
    const items = normalizeItems(getStore(chatId));
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (!it || typeof it !== 'object') continue;
      if (it.id === itemId) return it;
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
      hasCapturePrefix: k.hasCapturePrefix,
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
      if (!cls) return;                       /* filtered: non-Capture key */
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
    getStore: getStore,
    getUi: getUi,
    getBundle: getBundle,
    getAll: getAll,
    list: list,
    getItem: getItem,
    keysFor: keysFor,
    subscribe: subscribe,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Register with store/index if present; else attach directly ──── */
  const store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      const ok = store.__registerEntity('capture', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) {
        store.capture = api;
      }
    } catch (e) {
      recordError('register', e);
      store.capture = api;
    }
  } else {
    try { console.warn('[H2O.Studio.store.capture] store/index.js not present; attaching directly'); }
    catch (_) { /* ignore */ }
    store.capture = api;
  }

  bindBroadcast();
})(globalThis);
