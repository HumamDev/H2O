/* H2O Studio — Store: Notes (Phase 1e, read-only)
 *
 * Read-only Studio-side façade over the native Notes Engine
 * (src-runtime-base/3N1a) per-chat notes blob and scratchpad string.
 * Phase 1e introduces the API and subscription wiring; no write
 * methods are exposed, no Dock UI is built, no native runtime is
 * touched, and no body-version / conflict-resolution logic is added.
 *
 * Native keys this façade reads (verbatim from 3N1a:80-81, 92-93, 177-178):
 *   h2o:prm:cgx:ntsngn:store:notes:v1:${chatId   | 'unknown'}     (per-chat)
 *   h2o:prm:cgx:ntsngn:store:scratch:v1:${chatId | 'unknown'}     (per-chat)
 *
 * Chat-id fallback rule:
 *   The native engine uses `STR_NOTES.unknown` = `'unknown'`
 *   (3N1a.js:93) for an empty or missing chatId. This façade matches
 *   that fallback verbatim, so a missing chatId reads the same
 *   per-chat buckets the native engine writes.
 *
 * Native blob shapes (from 3N1a.js:204-223, 246-256):
 *   notes:    Array<Note>  — JSON-encoded array. Each Note is:
 *     { id:        string,             // UTIL_NT_cryptoId()
 *       type:      'note' | string,
 *       title:     string,
 *       text:      string,
 *       tags:      string[],
 *       pinned:    boolean,
 *       createdAt: number,
 *       updatedAt: number,
 *       source:    { msgId?, role?, … } | null }
 *   scratch:  string       — plain text, no JSON wrapping
 *
 * Storage backend:
 *   - Prefers H2O.Studio.platform.storage and platform.broadcast when a
 *     real adapter is bound (env.adapter !== 'fallback').
 *   - Falls back to a read-only no-op in-memory cache when no real
 *     adapter is bound. selfCheck reports the fallback so callers can
 *     surface a warning.
 *   - NEVER writes to notes or scratch keys. Never mutates stored
 *     blobs. No migration, no schema normalization, no body-version
 *     versioning.
 *
 * Read flow:
 *   getNotes / getScratch / getBundle / getAll / list / getNote are
 *   synchronous. They return the cached value (or null / empty array)
 *   and, on the first read of an unseen chatId, kick off async fetches
 *   for the two underlying keys. When each fetch resolves the cache is
 *   populated and subscribers receive a 'change' event with
 *   source: 'fetch'.
 *
 * Subscription flow:
 *   subscribe(fn) returns an unsubscribe function. The listener fires
 *   only for notes/scratch keys (the two prefixes above). Non-notes
 *   keys delivered by platform.broadcast.onAnyChange are filtered out
 *   before any listener is called. Listener errors are caught and
 *   recorded but do not interrupt other subscribers.
 *
 * Phase 1e is READ-ONLY: no public set/update/remove/saveNow/write
 * API. No body-version model. No conflict resolution.
 *
 * Contracts:
 *   docs/architecture/studio-dock-panel-plan.md (Phase 1e scope)
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
  if (H2O.Studio.store.notes && H2O.Studio.store.notes.__installed) {
    return;
  }

  const VERSION = '0.1.0-phase-1e-readonly';

  /* Phase 0B / 1e key sources: prefer H2O.Studio.DockKeys + DockKeyFor.
   * Fall back to inline literal strings mirrored verbatim from native
   * 3N1a if helpers are missing — same behavior either way. */
  function pickKeys() {
    const dk = H2O.Studio && H2O.Studio.DockKeys;
    const dkf = H2O.Studio && H2O.Studio.DockKeyFor;
    return {
      notesPrefix:    (dk && dk.notesPerChatPrefix)   || 'h2o:prm:cgx:ntsngn:store:notes:v1:',
      scratchPrefix:  (dk && dk.scratchPerChatPrefix) || 'h2o:prm:cgx:ntsngn:store:scratch:v1:',
      notesBuilder:   (dkf && typeof dkf.notesKey   === 'function') ? dkf.notesKey   : null,
      scratchBuilder: (dkf && typeof dkf.scratchKey === 'function') ? dkf.scratchKey : null,
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
    const notes   = k.notesBuilder   ? k.notesBuilder(chatId)   : (k.notesPrefix   + id);
    const scratch = k.scratchBuilder ? k.scratchBuilder(chatId) : (k.scratchPrefix + id);
    return Object.freeze({
      notes: notes,
      scratch: scratch,
    });
  }

  /* A key is a notes key iff it starts with the notes prefix AND has
   * a non-empty chatId after the prefix. Same for scratch. The two
   * prefixes are disjoint (`…:notes:v1:` vs `…:scratch:v1:`). */
  function classifyKey(key) {
    if (typeof key !== 'string' || key === '') return null;
    const k = pickKeys();
    if (key.indexOf(k.notesPrefix) === 0) {
      const chatId = key.slice(k.notesPrefix.length);
      if (chatId === '') return null;
      return { kind: 'notes', chatId: chatId };
    }
    if (key.indexOf(k.scratchPrefix) === 0) {
      const chatId = key.slice(k.scratchPrefix.length);
      if (chatId === '') return null;
      return { kind: 'scratch', chatId: chatId };
    }
    return null;
  }

  /* Best-effort normalization of the native notes blob into an array.
   * The native engine stores an Array<Note>; we accept that shape and
   * also tolerate missing or non-array values by returning []. We do
   * NOT rewrite the underlying blob. Returns a shallow copy so the
   * caller cannot mutate the internal cache. */
  function normalizeEntries(raw) {
    if (Array.isArray(raw)) return raw.slice();
    if (raw && Array.isArray(raw.items)) return raw.items.slice();
    if (raw && Array.isArray(raw.notes)) return raw.notes.slice();
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
  function getNotes(chatId) {
    return readKey(keysFor(chatId).notes);
  }
  function getScratch(chatId) {
    return readKey(keysFor(chatId).scratch);
  }
  function getBundle(chatId) {
    const keys = keysFor(chatId);
    const notes = getNotes(chatId);
    const scratch = getScratch(chatId);
    return {
      chatId: safeId(chatId),
      notes: notes,
      scratch: scratch,
      entries: normalizeEntries(notes),
      keys: keys,
      found: {
        notes:   notes   != null,
        scratch: scratch != null,
      },
    };
  }
  function getAll(chatId) { return getBundle(chatId); }

  /* list(chatId) returns just the entries array (best-effort: native
   * shape is Array<Note>; missing or non-array values yield []). */
  function list(chatId) {
    return normalizeEntries(getNotes(chatId));
  }

  /* getNote(chatId, noteId) finds an entry by its id. Returns the
   * entry object or null. */
  function getNote(chatId, noteId) {
    if (typeof noteId !== 'string' || noteId === '') return null;
    const entries = normalizeEntries(getNotes(chatId));
    for (let i = 0; i < entries.length; i += 1) {
      const e = entries[i];
      if (!e || typeof e !== 'object') continue;
      if (e.id === noteId) return e;
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
      if (!cls) return;                       /* filtered: non-notes key */
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
    getNotes: getNotes,
    getScratch: getScratch,
    getBundle: getBundle,
    getAll: getAll,
    list: list,
    getNote: getNote,
    keysFor: keysFor,
    subscribe: subscribe,
    selfCheck: selfCheck,
    __installed: true,
  };

  /* ── Register with store/index if present; else attach directly ──── */
  const store = H2O.Studio.store;
  if (store && typeof store.__registerEntity === 'function') {
    try {
      const ok = store.__registerEntity('notes', api);
      registeredWithStoreIndex = !!ok;
      if (!ok) {
        store.notes = api;
      }
    } catch (e) {
      recordError('register', e);
      store.notes = api;
    }
  } else {
    try { console.warn('[H2O.Studio.store.notes] store/index.js not present; attaching directly'); }
    catch (_) { /* ignore */ }
    store.notes = api;
  }

  bindBroadcast();
})(globalThis);
