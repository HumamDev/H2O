/* H2O Studio — Reader & Notes — MVP-A1.3a: annotation façade
 *
 * A flag-guarded, READ-ONLY aggregator that projects existing per-chat
 * annotation data (notes and bookmarks) for a captured_chat
 * LibraryItem into a unified annotation shape, per the Reader & Notes
 * Architecture Contract v1.2 (docs/systems/reader-notes/architecture-contract-v1.2.md)
 * and ADR-0011.
 *
 * SCOPE:
 *   - A1.2 covers item-scoped 'note' and 'bookmark' annotations.
 *   - A1.3a adds zero-attribution-risk highlight enumeration:
 *     every highlight is returned from listUnattributed() as
 *     attribution: 'unattributed' with reason
 *     'a1_3a-attribution-deferred'.
 *   - listForItem(itemId) remains notes + bookmarks only in A1.3a.
 *   - Validates item identity through the A1.1 typed view
 *     (H2O.Studio.readerNotes.libraryItems.get) so it reads annotation data
 *     only for a known captured_chat item.
 *   - Reads only via H2O.Studio.store.notes.list(chatId) and
 *     H2O.Studio.store.bookmarks.list(chatId) for item-scoped reads.
 *   - Reads highlights only via H2O.Studio.store.highlights.getAll() to
 *     enumerate answer ids and .getForAnswer(answerId) to fetch cloned lists.
 *     Returns deep-cloned, read-only annotation snapshots.
 *
 * OUT OF SCOPE (later phases — NOT implemented here):
 *   - A1.3b safe highlight attribution. This module performs no highlight
 *     matching and does not move highlights into listForItem().
 *   - Anchor resolver, A2a/A2b, sidecar, enrichment, renderer registry,
 *     native_note, sync, chat saving, capture/saving, or runtime writers.
 *
 * HARD GUARANTEES:
 *   - Exposes only read methods: isEnabled / listForItem /
 *     listUnattributed / selfCheck / diagnose. No mutation API.
 *   - Calls only the read method `.list(chatId)` on the notes and bookmarks
 *     stores. It never invokes any store mutation method and reads no other
 *     store surface.
 *   - Calls only `getAll()` and `getForAnswer(answerId)` on the highlights
 *     store. It never invokes any highlight mutation method.
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
 *
 * Highlight sub-flag: 'studio.readerNotes.annotationHighlights.enabled' —
 *   default OFF. listUnattributed() returns highlights only when both the
 *   outer annotation façade flag and this sub-flag are true.
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
  var HIGHLIGHT_FLAG_KEY = 'studio.readerNotes.annotationHighlights.enabled';
  var KINDS = Object.freeze(['note', 'bookmark', 'highlight']);

  /* Bounded error ring + last-run malformed counters (diagnostics only). */
  var errors = [];
  var ERR_MAX = 20;
  var lastMalformed = { note: 0, bookmark: 0, highlight: 0 };
  var lastUnattributedHighlights = 0;

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
  function getHighlightsStore() {
    var s = H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.highlights;
    return (s && typeof s.getAll === 'function' && typeof s.getForAnswer === 'function') ? s : null;
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

  function isHighlightSubFlagEnabled() {
    try {
      var flags = getFlags();
      if (!flags) return false;                 /* no flag system → fail closed */
      return flags.get(HIGHLIGHT_FLAG_KEY, false) === true;
    } catch (e) {
      recordError('isHighlightSubFlagEnabled', e);
      return false;
    }
  }

  function canReadHighlights() {
    return isEnabled() && isHighlightSubFlagEnabled();
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

  function highlightText(entry) {
    if (entry && entry.anchors && entry.anchors.exact != null) return strOrEmpty(entry.anchors.exact);
    if (entry && entry.anchor && entry.anchor.exact != null) return strOrEmpty(entry.anchor.exact);
    if (entry && entry.exact != null) return strOrEmpty(entry.exact);
    if (entry && entry.quote != null) return strOrEmpty(entry.quote);
    if (entry && entry.selectedText != null) return strOrEmpty(entry.selectedText);
    if (entry && entry.text != null) return strOrEmpty(entry.text);
    return '';
  }

  function highlightColor(entry) {
    return strOrNull(entry && (entry.color || entry.highlightColor || entry.hlColor || entry.c));
  }

  function mapUnattributedHighlight(answerId, entry, index) {
    if (!isPlainObject(entry)) return null;      /* malformed: non-object */
    var answer = strOrNull(answerId);
    if (!answer) return null;                   /* malformed: no answer bucket */
    var nativeId = strOrNull(entry.id) || (answer + ':' + String(index));
    return {
      schemaVersion: SCHEMA_VERSION,
      kind: 'highlight',
      id: 'highlight:unattributed:' + answer + ':' + nativeId,
      item: null,
      attribution: 'unattributed',
      reason: 'a1_3a-attribution-deferred',
      source: {
        store: 'highlights',
        chatId: null,
        answerId: answer,
        nativeId: nativeId,
        convoId: strOrNull(entry.convoId),
      },
      body: {
        color: highlightColor(entry),
        text: highlightText(entry),
        createdAt: numOrNull(entry.ts),
      },
      raw: cloneValue(entry),
    };
  }

  function answerIdsFromHighlights(store) {
    var blob = safe(function () { return store.getAll(); });
    var iba = blob && blob.itemsByAnswer;
    if (!isPlainObject(iba)) return [];
    return Object.keys(iba).filter(function (key) { return String(key || '').trim() !== ''; });
  }

  /* ── Public read API ──────────────────────────────────────────────────── */
  function listForItem(itemId, options) {
    if (!isEnabled()) return [];                 /* fail closed: disabled */
    try {
      var chatId = chatIdForItem(itemId);
      if (!chatId) return [];                     /* empty / unknown / A1.1 missing */

      var out = [];
      var malformed = { note: 0, bookmark: 0, highlight: lastMalformed.highlight || 0 };
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

  function listUnattributed(options) {
    if (!canReadHighlights()) {
      lastUnattributedHighlights = 0;
      lastMalformed.highlight = 0;
      return [];
    }
    try {
      var opts = options || {};
      if (opts.kind && opts.kind !== 'highlight') {
        lastUnattributedHighlights = 0;
        lastMalformed.highlight = 0;
        return [];
      }
      var store = getHighlightsStore();
      if (!store) {
        lastUnattributedHighlights = 0;
        lastMalformed.highlight = 0;
        return [];
      }

      var out = [];
      var malformed = 0;
      var answers = answerIdsFromHighlights(store);
      for (var i = 0; i < answers.length; i += 1) {
        var answerId = answers[i];
        var items = safe(function (id) {
          return function () { return store.getForAnswer(id); };
        }(answerId));
        if (!Array.isArray(items)) continue;
        for (var j = 0; j < items.length; j += 1) {
          var h = mapUnattributedHighlight(answerId, items[j], j);
          if (h) out.push(h); else malformed += 1;
        }
      }
      lastUnattributedHighlights = out.length;
      lastMalformed.highlight = malformed;
      return out;
    } catch (e) {
      recordError('listUnattributed', e);
      lastUnattributedHighlights = 0;
      lastMalformed.highlight = 0;
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
      highlightSubFlagKey: HIGHLIGHT_FLAG_KEY,
      kinds: KINDS.slice(),
      enabled: isEnabled(),
      highlightSubFlag: isHighlightSubFlagEnabled(),
      deps: {
        flags: !!getFlags(),
        libraryItems: !!getLibraryItems(),
        notesStore: !!getNotesStore(),
        bookmarksStore: !!getBookmarksStore(),
        highlightsStore: !!getHighlightsStore(),
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
      highlightSubFlagKey: HIGHLIGHT_FLAG_KEY,
      highlightSubFlag: base.highlightSubFlag,
      kinds: KINDS.slice(),
      enabled: base.enabled,
      deps: base.deps,
      lastUnattributedHighlights: lastUnattributedHighlights,
      lastMalformed: {
        note: lastMalformed.note,
        bookmark: lastMalformed.bookmark,
        highlight: lastMalformed.highlight,
      },
      note: base.enabled
        ? 'read-only annotation facade active; A1.3a returns all highlights as unattributed and performs no attribution'
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
    listUnattributed: listUnattributed,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.annotations = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
