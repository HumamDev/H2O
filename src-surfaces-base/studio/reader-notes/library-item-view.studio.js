/* H2O Studio — Reader & Notes — MVP-A1.1: captured_chat LibraryItem view
 *
 * A flag-guarded, READ-ONLY typed view that projects existing captured-chat
 * data (Library Index known-chat rows + Chat Registry records) into the
 * `LibraryItem` envelope shape defined by the Reader & Notes Architecture
 * Contract v1.2 (docs/systems/reader-notes/architecture-contract-v1.2.md)
 * and ADR-0011.
 *
 * SCOPE (A1.1 only):
 *   - Default item kind is 'captured_chat'.
 *   - `LibraryItem.id` follows the existing Chat Registry / Library Index
 *     identity authority (the chatId). This module is a CONSUMER of that
 *     identity; it does NOT own deduplication, recapture identity, merge
 *     ordering, cross-account scoping, or fork resolution (D10).
 *   - Structured category / labels are preserved as opaque structured refs
 *     (`flattened: false`); they are never reduced to a plain string or
 *     string[] (Structured Metadata Policy).
 *
 * OUT OF SCOPE (later phases — NOT implemented here):
 *   - Every subsequent Reader & Notes phase (A1.2 onward). This module
 *     implements only the captured_chat library-item projection. It does
 *     not read or wrap any native feature store, and it implements no
 *     later-phase subsystem.
 *
 * HARD GUARANTEES:
 *   - Exposes only read methods: isEnabled / get / list / selfCheck /
 *     diagnose. No write/mutation API.
 *   - Performs NO persistence of any kind: no platform-storage writes and
 *     no direct browser storage APIs (key-value or database).
 *   - Reads dependencies lazily at call time; on load it only attaches a
 *     frozen namespace. No work runs while the flag is off, so loading this
 *     file changes no runtime behavior.
 *   - Fails closed: when the flag is off, or when Chat Registry / Library
 *     Index are unavailable, or on any internal error, reads return an
 *     empty result (null / []) and never throw.
 *
 * Feature flag: 'studio.readerNotes.libraryItemView.enabled' — default OFF.
 *   Read through H2O.flags.get(key, false) === true. When H2O.flags is
 *   absent, isEnabled() returns false (fail closed).
 *
 * Dependencies (all read-only, in-memory accessors):
 *   - H2O.flags.get(key, default)                        (S0F1k)
 *   - H2O.ChatRegistry.getRecord(id) / .listRecords(opt) (S0F1g) — identity authority
 *   - H2O.LibraryIndex.getAll()                          (S0F1c) — known-chat read model
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.readerNotes = H2O.Studio.readerNotes || {};

  /* Idempotent install. */
  if (H2O.Studio.readerNotes.libraryItems && H2O.Studio.readerNotes.libraryItems.__installed) {
    return;
  }

  var VERSION = 1;
  var SCHEMA_VERSION = 1;
  var KIND = 'captured_chat';
  var IDENTITY_AUTHORITY = 'chat-registry';
  var FLAG_KEY = 'studio.readerNotes.libraryItemView.enabled';

  /* Bounded error ring for diagnostics only. */
  var errors = [];
  var ERR_MAX = 20;
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

  /* Deep snapshot so callers receive read-only copies, never live internal
   * objects owned by Library Index / Chat Registry. */
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

  /* ── Dependency accessors (lazy, defensive) ───────────────────────────── */
  function getFlags() {
    var f = H2O && H2O.flags;
    return (f && typeof f.get === 'function') ? f : null;
  }
  function getChatRegistry() {
    var r = H2O && H2O.ChatRegistry;
    return (r && (typeof r.getRecord === 'function' || typeof r.listRecords === 'function')) ? r : null;
  }
  function getLibraryIndex() {
    var i = H2O && H2O.LibraryIndex;
    return (i && typeof i.getAll === 'function') ? i : null;
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

  /* ── Structured metadata refs (never flattened) ───────────────────────── */
  /* Prefer the richest structured source available, preserving id + name as
   * a structured object. We never reduce structured metadata to a plain
   * string or string[] — `flattened` is always false. */
  function buildCategoryRef(row, record) {
    var value = null;
    var org = record && record.organization;
    var structured = (record && record.category) || (org && org.category);
    if (structured && typeof structured === 'object') {
      value = cloneValue(structured);            /* e.g. a CategoryRecord-shaped object */
    } else {
      var categoryId = (org && org.categoryId) || (row && row.categoryId) || null;
      var categoryName = (row && row.categoryName) || null;
      if (categoryId || categoryName) {
        value = { categoryId: categoryId || null, categoryName: categoryName || null };
      }
    }
    return { kind: 'category_ref', value: value, flattened: false };
  }

  function buildLabelsRef(row, record) {
    var value = null;
    var org = record && record.organization;
    var structured = (record && record.labels) || (org && org.labels);
    if (structured && typeof structured === 'object' && !Array.isArray(structured)) {
      value = cloneValue(structured);            /* e.g. a LabelAssignments-shaped object */
    } else {
      var labelIds = (org && Array.isArray(org.labelIds)) ? org.labelIds.slice() : null;
      var labelNames = (row && Array.isArray(row.labels)) ? row.labels.slice() : null;
      if (labelIds || labelNames) {
        value = { labelIds: labelIds || null, labelNames: labelNames || null };
      }
    }
    return { kind: 'label_assignments_ref', value: value, flattened: false };
  }

  function buildFolderRef(row, record) {
    var org = record && record.organization;
    var folderId = (row && row.folderId) || (org && org.folderId) || null;
    var folderName = (row && row.folderName) || null;
    if (!folderId && !folderName) return null;
    return { folderId: folderId || null, folderName: folderName || null };
  }

  function buildTags(row, record) {
    if (row && Array.isArray(row.tags)) return row.tags.slice();
    var org = record && record.organization;
    if (org && Array.isArray(org.tagIds)) return org.tagIds.slice();
    return [];
  }

  /* ── Item builder ─────────────────────────────────────────────────────── */
  function buildItem(row, record) {
    var chatId = (record && record.chatId) || (row && row.chatId) || null;
    if (!chatId) return null;                    /* identity authority requires a chatId */
    chatId = String(chatId);

    var title = '';
    if (row && row.title) title = strOrEmpty(row.title);
    else if (record && record.title) title = strOrEmpty(record.title);

    var snapshotId = null;
    if (row) snapshotId = row.snapshotId || row.latestSnapshotId || row.lastSnapshotId || null;
    snapshotId = snapshotId ? String(snapshotId) : null;

    var snapshotCount = numOrNull(row && row.snapshotCount);
    if (snapshotCount == null) snapshotCount = numOrNull(record && record.snapshotCount);

    var messageCount = numOrNull(row && row.messageCount);

    return {
      schemaVersion: SCHEMA_VERSION,
      kind: KIND,
      id: chatId,
      title: title,
      identity: {
        authority: IDENTITY_AUTHORITY,
        chatId: chatId,
      },
      content: {
        kind: KIND,
        snapshotId: snapshotId,
        snapshotCount: snapshotCount,
        messageCount: messageCount,
      },
      metadata: {
        category: buildCategoryRef(row, record),
        labels: buildLabelsRef(row, record),
        tags: buildTags(row, record),
        folder: buildFolderRef(row, record),
      },
      raw: {
        libraryIndexRow: cloneValue(row),
        chatRegistryRecord: cloneValue(record),
      },
    };
  }

  function recordFor(reg, id) {
    if (!reg || typeof reg.getRecord !== 'function' || !id) return null;
    return safe(function () { return reg.getRecord(id); });
  }

  function rowsFromIndex(idx) {
    if (!idx || typeof idx.getAll !== 'function') return [];
    var rows = safe(function () { return idx.getAll(); });
    return Array.isArray(rows) ? rows : [];
  }

  function rowFor(idx, id) {
    var rows = rowsFromIndex(idx);
    for (var i = 0; i < rows.length; i += 1) {
      var r = rows[i];
      if (r && String(r.chatId || '') === String(id)) return r;
    }
    return null;
  }

  /* ── Public read API ──────────────────────────────────────────────────── */
  function get(itemId) {
    if (!isEnabled()) return null;               /* fail closed: disabled */
    try {
      var id = (itemId == null) ? '' : String(itemId).trim();
      if (!id) return null;
      var reg = getChatRegistry();
      var idx = getLibraryIndex();
      if (!reg && !idx) return null;             /* fail closed: dependencies missing */
      var record = recordFor(reg, id);
      var row = rowFor(idx, id);
      if (!record && !row) return null;          /* unknown id */
      return buildItem(row, record);
    } catch (e) {
      recordError('get', e);
      return null;
    }
  }

  function list(options) {
    if (!isEnabled()) return [];                 /* fail closed: disabled */
    try {
      var opts = options || {};
      var idx = getLibraryIndex();
      var reg = getChatRegistry();
      if (!idx && !reg) return [];               /* fail closed: dependencies missing */

      var items = [];
      var rows = rowsFromIndex(idx);
      if (rows.length) {
        /* Enumerate the Library Index known-chat read model (ADR-0004),
         * resolving identity/state via the Chat Registry (ADR-0005). */
        for (var i = 0; i < rows.length; i += 1) {
          var row = rows[i];
          var id = row && row.chatId;
          var record = id ? recordFor(reg, id) : null;
          var item = buildItem(row, record);
          if (item) items.push(item);
        }
      } else if (reg && typeof reg.listRecords === 'function') {
        var recs = safe(function () { return reg.listRecords({}); }) || [];
        if (Array.isArray(recs)) {
          for (var j = 0; j < recs.length; j += 1) {
            var built = buildItem(null, recs[j]);
            if (built) items.push(built);
          }
        }
      }

      if (Number.isFinite(opts.limit) && opts.limit >= 0) {
        items = items.slice(0, Math.trunc(opts.limit));
      }
      return items;
    } catch (e) {
      recordError('list', e);
      return [];
    }
  }

  function selfCheck() {
    var enabled = isEnabled();
    return {
      ok: errors.length === 0,
      version: VERSION,
      readonly: true,
      kind: KIND,
      identityAuthority: IDENTITY_AUTHORITY,
      schemaVersion: SCHEMA_VERSION,
      flagKey: FLAG_KEY,
      enabled: enabled,
      deps: {
        flags: !!getFlags(),
        chatRegistry: !!getChatRegistry(),
        libraryIndex: !!getLibraryIndex(),
      },
      errors: errors.slice(),
    };
  }

  function diagnose() {
    var base = selfCheck();
    var count = 0;
    if (base.enabled) {
      try { count = list().length; }
      catch (e) { recordError('diagnose', e); count = 0; }
    }
    return {
      ok: base.ok,
      version: VERSION,
      readonly: true,
      flagKey: FLAG_KEY,
      enabled: base.enabled,
      kind: KIND,
      identityAuthority: IDENTITY_AUTHORITY,
      schemaVersion: SCHEMA_VERSION,
      deps: base.deps,
      itemCount: count,
      note: base.enabled
        ? 'read-only captured_chat view active'
        : 'disabled — no runtime effect (flag off or dependencies missing)',
      errors: errors.slice(),
    };
  }

  /* ── Assemble + freeze the read-only public API ───────────────────────── */
  var api = Object.freeze({
    __installed: true,
    version: VERSION,
    readonly: true,
    flagKey: FLAG_KEY,
    isEnabled: isEnabled,
    get: get,
    list: list,
    selfCheck: selfCheck,
    diagnose: diagnose,
  });

  H2O.Studio.readerNotes.libraryItems = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
