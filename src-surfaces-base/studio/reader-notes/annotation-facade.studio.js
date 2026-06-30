/* H2O Studio — Reader & Notes — MVP-A1.2: annotation façade (notes + bookmarks)
 *
 * A flag-guarded, READ-ONLY aggregator that projects existing per-chat
 * annotation data (notes and bookmarks only) for a captured_chat
 * LibraryItem into a unified annotation shape, per the Reader & Notes
 * Architecture Contract v1.2 (docs/systems/reader-notes/architecture-contract-v1.2.md)
 * and ADR-0011.
 *
 * SCOPE (A1.2 only):
 *   - Covers exactly two annotation kinds: 'note' and 'bookmark'.
 *   - Validates item identity through the A1.1 typed view
 *     (H2O.Studio.readerNotes.libraryItems.get) so it reads annotation data
 *     only for a known captured_chat item.
 *   - Reads only via H2O.Studio.store.notes.list(chatId) and
 *     H2O.Studio.store.bookmarks.list(chatId). Returns deep-cloned,
 *     read-only annotation snapshots.
 *
 * OUT OF SCOPE (later phases — NOT implemented here):
 *   - Every subsequent Reader & Notes phase. This module covers only the
 *     note and bookmark annotation kinds and implements no later-phase
 *     feature.
 *
 * HARD GUARANTEES:
 *   - Exposes only read methods: isEnabled / listForItem / selfCheck /
 *     diagnose. No mutation API.
 *   - Calls only the read method `.list(chatId)` on the notes and bookmarks
 *     stores. It never invokes any store mutation method and reads no other
 *     store surface.
 *   - Performs NO persistence: no platform-storage writes and no direct
 *     browser storage APIs (key-value or database).
 *   - No subscriptions, no polling, no async hydrate logic.
 *   - Reads dependencies lazily at call time; on load it only attaches a
 *     frozen namespace, so loading this file changes no runtime behavior.
 *   - Fails closed: when the flag is off, when any dependency is missing,
 *     or on internal error, reads return [] and never throw.
 *
 * Identity / bucket safety:
 *   - LibraryItem.id is the chatId. Notes and bookmarks are per-chat and
 *     map directly to that chatId.
 *   - An empty/missing itemId returns [] WITHOUT calling any store, so the
 *     stores' 'unknown' fallback bucket is never read for invalid ids.
 *   - An unknown itemId (not a captured_chat per A1.1) returns [].
 *
 * Feature flag: 'studio.readerNotes.annotationFacade.enabled' — default OFF.
 *   Read through H2O.flags.get(key, false) === true. When H2O.flags is
 *   absent, isEnabled() returns false (fail closed). No flag default is
 *   persisted and no flag store is created.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  /* Idempotent install. */
  if (H2O.Studio.readerNotes.annotations && H2O.Studio.readerNotes.annotations.__installed) {
    return;
  }

  var VERSION = 1;
  var SCHEMA_VERSION = 1;
  var FLAG_KEY = 'studio.readerNotes.annotationFacade.enabled';
  var KINDS = Object.freeze(['note', 'bookmark']);

  /* Bounded error ring + last-run malformed counters (diagnostics only). */
  var errors = [];
  var ERR_MAX = 20;
  var lastMalformed = { note: 0, bookmark: 0 };

  function recordError(op, e) {
    try {
      errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || (e && e.stack) || e || '') });
      if (errors.length > ERR_MAX) errors.splice(0, errors.length - ERR_MAX);
    } catch (_) { /* swallow */ }
  }
  function safe(fn) {
    try { return fn(); }
    catch (e) { recordError('dep-call', e); return null; }
  }
  function isPlainObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }
  function cloneValue(v) {
    if (v == null) return null;
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { recordError('clone', e); return null; }
  }
  function numOrNull(v) {
    return (typeof v === 'number' && Number.isFinite(v)) ? v : null;
  }
  function strOrEmpty(v) {
    return (v == null) ? '' : String(v);
  }
  function strOrNull(v) {
    return (v == null || v === '') ? null : String(v);
  }

  /* ── Dependency accessors (lazy, defensive) ───────────────────────────── */
  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }
  function getLibraryItems() {
    var li = H2O && H2O.Studio && H2O.Studio.readerNotes && H2O.Studio.readerNotes.libraryItems;
    return (li && typeof li.get === 'function') ? li : null;
  }
  function getNotesStore() {
    var s = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.notes;
    return (s && typeof s.list === 'function') ? s : null;
  }
  function getBookmarksStore() {
    var s = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.bookmarks;
    return (s && typeof s.list === 'function') ? s : null;
  }

  /* ── Flag (default OFF; fail closed) ──────────────────────────────────── */
  function isEnabled() {
    try {
      var flags = getFlags();
      if (!flags) return false;                 /* no flag system → fail closed */
      return flags.get(FLAG_KEY, false) === true;
    } catch (e) {
      recordError('isEnabled', e);
      return false;
    }
  }

  /* ── Identity validation via the A1.1 typed view ──────────────────────── */
  /* Returns the captured_chat chatId for a known item, else null. Empty or
   * unknown ids resolve to null so no store read (and no 'unknown' bucket
   * read) ever happens for an invalid id. */
  function chatIdForItem(itemId) {
    if (itemId == null) return null;
    var id = String(itemId).trim();
    if (!id) return null;                        /* empty id → no store read */
    var li = getLibraryItems();
    if (!li) return null;                        /* A1.1 missing → fail closed */
    var item = safe(function () { return li.get(id); });
    if (!isPlainObject(item) || item.kind !== 'captured_chat') return null;  /* unknown → [] */
    var chatId = (item.identity && item.identity.chatId) || item.id || null;
    return chatId ? String(chatId) : null;
  }

  /* ── Mappers (return cloned, read-only annotation snapshots) ──────────── */
  function mapNote(chatId, entry) {
    if (!isPlainObject(entry)) return null;      /* malformed: non-object */
    var nativeId = strOrNull(entry.id);
    if (!nativeId) return null;                  /* malformed: no stable id */
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'note',
      id: 'note:' + chatId + ':' + nativeId,
      item: { kind: 'captured_chat', id: chatId },
      source: { store: 'notes', chatId: chatId, nativeId: nativeId },
      body: {
        title: strOrEmpty(entry.title),
        text: strOrEmpty(entry.text),
        tags: Array.isArray(entry.tags) ? entry.tags.slice() : [],
        pinned: entry.pinned === true,
        createdAt: numOrNull(entry.createdAt),
        updatedAt: numOrNull(entry.updatedAt),
        source: cloneValue(entry.source),        /* e.g. { msgId, role } or null */
      },
      raw: cloneValue(entry),
    };
  }

  function mapBookmark(chatId, entry, index) {
    if (!isPlainObject(entry)) return null;      /* malformed: non-object */
    var nativeId = strOrNull(entry.msgId) || strOrNull(entry.primaryAId) || String(index);
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'bookmark',
      id: 'bookmark:' + chatId + ':' + nativeId,
      item: { kind: 'captured_chat', id: chatId },
      source: { store: 'bookmarks', chatId: chatId, nativeId: nativeId },
      body: {
        title: strOrEmpty(entry.title),
        text: (entry.snapText != null) ? strOrEmpty(entry.snapText) : strOrEmpty(entry.text),
        msgId: strOrNull(entry.msgId),
        primaryAId: strOrNull(entry.primaryAId),
        pairNo: numOrNull(entry.pairNo),
        turnNo: numOrNull(entry.turnNo),
        role: strOrNull(entry.role),
        createdAt: numOrNull(entry.createdAt),
      },
      raw: cloneValue(entry),
    };
  }

  /* ── Public read API ──────────────────────────────────────────────────── */
  function listForItem(itemId, options) {
    if (!isEnabled()) return [];                 /* fail closed: disabled */
    try {
      var chatId = chatIdForItem(itemId);
      if (!chatId) return [];                     /* empty / unknown / A1.1 missing */

      var out = [];
      var malformed = { note: 0, bookmark: 0 };
      var opts = options || {};
      var wantNote = !opts.kind || opts.kind === 'note';
      var wantBookmark = !opts.kind || opts.kind === 'bookmark';

      if (wantNote) {
        var notesStore = getNotesStore();
        if (notesStore) {
          var notes = safe(function () { return notesStore.list(chatId); });
          if (Array.isArray(notes)) {
            for (var i = 0; i < notes.length; i += 1) {
              var n = mapNote(chatId, notes[i]);
              if (n) out.push(n); else malformed.note += 1;
            }
          }
        }
      }

      /* Continue with bookmarks even if the notes read failed. */
      if (wantBookmark) {
        var bmStore = getBookmarksStore();
        if (bmStore) {
          var bms = safe(function () { return bmStore.list(chatId); });
          if (Array.isArray(bms)) {
            for (var j = 0; j < bms.length; j += 1) {
              var b = mapBookmark(chatId, bms[j], j);
              if (b) out.push(b); else malformed.bookmark += 1;
            }
          }
        }
      }

      lastMalformed = malformed;
      return out;
    } catch (e) {
      recordError('listForItem', e);
      return [];
    }
  }

  function selfCheck() {
    return {
      ok: errors.length === 0,
      version: VERSION,
      readonly: true,
      schemaVersion: SCHEMA_VERSION,
      flagKey: FLAG_KEY,
      kinds: KINDS.slice(),
      enabled: isEnabled(),
      deps: {
        flags: !!getFlags(),
        libraryItems: !!getLibraryItems(),
        notesStore: !!getNotesStore(),
        bookmarksStore: !!getBookmarksStore(),
      },
      errors: errors.slice(),
    };
  }

  function diagnose() {
    var base = selfCheck();
    return {
      ok: base.ok,
      version: VERSION,
      readonly: true,
      flagKey: FLAG_KEY,
      kinds: KINDS.slice(),
      enabled: base.enabled,
      deps: base.deps,
      lastMalformed: { note: lastMalformed.note, bookmark: lastMalformed.bookmark },
      note: base.enabled
        ? 'read-only notes+bookmarks annotation facade active'
        : 'disabled — no runtime effect (flag off or dependencies missing)',
      errors: base.errors,
    };
  }

  /* ── Assemble + freeze the read-only public API ───────────────────────── */
  var api = Object.freeze({
    __installed: true,
    version: VERSION,
    readonly: true,
    flagKey: FLAG_KEY,
    kinds: KINDS,
    isEnabled: isEnabled,
    listForItem: listForItem,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.annotations = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
