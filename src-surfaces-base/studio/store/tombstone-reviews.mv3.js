/* H2O Studio Store - Tombstone Reviews (Chrome / MV3 IndexedDB)
 *
 * F5F.4c.1 - Chrome-side review-store scaffold for future remote tombstone
 * review. F5F.4d adds explicit, gated bundle tombstone ingestion. This module
 * never applies remote tombstones, deletes Library records, or mutates entity
 * stores.
 *
 * Chrome/MV3-only: gates on extension runtime detection and silently no-ops on
 * Tauri Desktop. The Desktop implementation remains tombstone-reviews.tauri.js.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* swallow */ }
    return false;
  }

  function detectChromeExtension() {
    try {
      return !!(global.chrome && global.chrome.runtime && global.chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  if (detectTauri() || !detectChromeExtension()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  var store = H2O.Studio.store;
  if (!store || typeof store.__registerEntity !== 'function') {
    try { console.warn('[H2O.Studio.store.tombstoneReviews.mv3] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.tombstoneReviews && store.tombstoneReviews.__installed) return;

  var DB_NAME = 'h2o.studio.tombstone-reviews.mv3';
  var DB_VERSION = 1;
  var STORE_NAME = 'reviews';
  var SCHEMA_VERSION = 1;
  var REVIEW_SCHEMA = 'h2o.studio.tombstone-review.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-review.diagnostic.v1';
  var CASCADE_DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-review-cascade-diagnostics.v1';
  var LIFECYCLE_DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-lifecycle-diagnostic.v1';
  var INGEST_SCHEMA = 'h2o.studio.tombstone-review-ingest.v1';
  var PREVIEW_SCHEMA = 'h2o.studio.tombstone-review-apply-preview.v1';
  var DECISION_SCHEMA = 'h2o.studio.tombstone-review-decision.v1';
  var APPLY_DRY_RUN_SCHEMA = 'h2o.studio.tombstone-review-apply-dry-run.v1';
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var DEFAULT_LIST_LIMIT = 100;
  var MAX_LIST_LIMIT = 1000;
  var SYNTHETIC_PREFIXES = ['f5c-', 'f5d-', 'f5d1-', 'f5d2-', 'f5f-', 'f5g-'];

  var CLASSIFICATIONS = {
    'safe-review': true,
    'delete-vs-edit': true,
    'already-deleted-local': true,
    'missing-local-record': true,
    'cascade-review': true,
    'duplicate-remote-tombstone': true,
    'malformed-remote-tombstone': true,
    'unsupported-record-kind': true,
    'self-originated': true,
    'local-comparison-unavailable': true,
  };
  var STATUSES = {
    pending: true,
    ignored: true,
    'accepted-later': true,
    rejected: true,
    superseded: true,
    resolved: true,
  };
  var DECISION_ACTIONS = {
    ignored: { status: 'ignored', decision: 'ignored-by-operator' },
    rejected: { status: 'rejected', decision: 'rejected-by-operator' },
    acceptedLater: { status: 'accepted-later', decision: 'accepted-for-later-apply' },
    resolved: { status: 'resolved', decision: 'resolved-without-apply' },
  };
  var KNOWN_TOMBSTONE_KINDS = {
    chat: true,
    snapshot: true,
    folder: true,
    folderBinding: true,
    tag: true,
    tagBinding: true,
    label: true,
    labelBinding: true,
    category: true,
    project: true,
    visualMetadata: true,
    linkedOnlyChat: true,
    savedSnapshot: true,
  };
  var BINDING_TOMBSTONE_KINDS = {
    folderBinding: true,
    tagBinding: true,
    labelBinding: true,
  };
  var REQUIRED_REMOTE_TOMBSTONE_FIELDS = [
    'schema',
    'tombstoneId',
    'recordKind',
    'recordId',
    'deletedAt',
    'deletedBySyncPeerId',
    'deleteReason',
  ];

  var state = {
    ready: false,
    initError: null,
    dbPromise: null,
    lastReloadedAt: null,
    lastWriteAt: null,
    writesSinceBoot: 0,
    errors: [],
    errMax: 20,
    warnings: [],
    warnMax: 20,
    subscribers: new Set(),
  };

  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.message) || e || '') });
      if (state.errors.length > state.errMax) state.errors.splice(0, state.errors.length - state.errMax);
    } catch (_) { /* swallow */ }
  }

  function recordWarning(code) {
    try {
      state.warnings.push({ t: Date.now(), code: String(code || 'warning') });
      if (state.warnings.length > state.warnMax) state.warnings.splice(0, state.warnings.length - state.warnMax);
    } catch (_) { /* swallow */ }
  }

  function recordWrite(/* op */) {
    state.writesSinceBoot += 1;
    state.lastWriteAt = Date.now();
  }

  function notifySubscribers(change) {
    state.subscribers.forEach(function (fn) {
      try { fn(change || {}); } catch (e) { recordError('notifySubscribers', e); }
    });
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function cleanScalar(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  function nullableString(value) {
    var s = cleanScalar(value);
    return s || null;
  }

  function isObject(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value));
  }

  function hasOwn(input, key) {
    return Object.prototype.hasOwnProperty.call(Object(input), key);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function bumpCounter(map, key, amount) {
    var k = cleanScalar(key) || 'unknown';
    map[k] = Number(map[k] || 0) + (amount == null ? 1 : Number(amount));
  }

  function isIsoLike(value) {
    var s = cleanScalar(value);
    return !!s && (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{10,}$/.test(s));
  }

  function parseTimeMs(value) {
    var s = cleanScalar(value);
    if (!s) return null;
    if (/^\d{10,}$/.test(s)) {
      var n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    var ms = Date.parse(s);
    return Number.isFinite(ms) ? ms : null;
  }

  function decodeComponentSafe(value) {
    var s = cleanScalar(value);
    if (!s) return '';
    try { return decodeURIComponent(s); }
    catch (_) { return s; }
  }

  function pushCodeWarning(warnings, code) {
    if (!Array.isArray(warnings)) return;
    var c = cleanScalar(code);
    if (!c) return;
    for (var i = 0; i < warnings.length; i += 1) {
      if (warnings[i] && warnings[i].code === c) return;
    }
    warnings.push({ code: c });
  }

  function readTimestampCandidate(record, fields) {
    var row = isObject(record) ? record : {};
    for (var i = 0; i < fields.length; i += 1) {
      var value = row[fields[i]];
      if (value == null || value === '') continue;
      var ms = parseTimeMs(value);
      return {
        value: cleanScalar(value) || null,
        ms: ms,
        parseable: ms != null,
      };
    }
    return { value: null, ms: null, parseable: false };
  }

  function makeClassification(classification, localRecordExists, localUpdatedAt, localHasNewerEdit, warnings) {
    return {
      classification: classification,
      localRecordExists: localRecordExists == null ? null : !!localRecordExists,
      localRecordDigest: null,
      localUpdatedAt: nullableString(localUpdatedAt),
      localHasNewerEdit: localHasNewerEdit == null ? null : !!localHasNewerEdit,
      warnings: Array.isArray(warnings) ? warnings.slice() : [],
    };
  }

  function getLibraryFoldersApi() {
    return (H2O && H2O.Library && H2O.Library.Folders) || null;
  }

  function getLibraryWorkspaceApi() {
    return (H2O && H2O.LibraryWorkspace) || null;
  }

  function getLibraryIndexApi() {
    return (H2O && H2O.LibraryIndex) || null;
  }

  function generateReviewId() {
    try {
      var c = global.crypto || null;
      if (c && typeof c.randomUUID === 'function') return 'tombstone-review:' + c.randomUUID();
    } catch (_) { /* ignore */ }
    return 'tombstone-review:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }

  function readField(input, camel, snake) {
    if (!input || typeof input !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(input, camel)) return input[camel];
    if (snake && Object.prototype.hasOwnProperty.call(input, snake)) return input[snake];
    return undefined;
  }

  function parseWarnings(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.slice();
    if (typeof raw !== 'string') return [];
    try {
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function normalizeRawTombstoneJson(input) {
    var raw = readField(input, 'rawTombstoneJson', 'raw_tombstone_json');
    if (raw == null) raw = readField(input, 'rawTombstone', 'raw_tombstone');
    if (raw == null) throw new Error('raw_tombstone_json required');
    if (typeof raw === 'string') {
      JSON.parse(raw);
      return raw;
    }
    if (typeof raw === 'object') return JSON.stringify(raw);
    throw new Error('raw_tombstone_json must be valid JSON');
  }

  function normalizeWarningsJson(input) {
    var raw = readField(input, 'warningsJson', 'warnings_json');
    if (raw == null) raw = readField(input, 'warnings', null);
    if (raw == null) return '[]';
    if (typeof raw === 'string') {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('warnings_json must be a JSON array');
      return raw;
    }
    if (Array.isArray(raw)) return JSON.stringify(raw);
    throw new Error('warnings_json must be a JSON array');
  }

  function buildDedupeKey(input) {
    var explicit = cleanString(readField(input, 'dedupeKey', 'dedupe_key'));
    if (explicit) return explicit;
    var peer = cleanString(readField(input, 'remoteSyncPeerId', 'remote_sync_peer_id'));
    var tombstoneId = cleanString(readField(input, 'remoteTombstoneId', 'remote_tombstone_id') || readField(input, 'tombstoneId', 'tombstone_id'));
    if (peer && tombstoneId) return 'remote-tombstone:' + encodeURIComponent(peer) + ':' + encodeURIComponent(tombstoneId);
    var kind = cleanString(readField(input, 'recordKind', 'record_kind'));
    var recordId = cleanString(readField(input, 'recordId', 'record_id'));
    var deletedAt = cleanString(readField(input, 'remoteDeletedAt', 'remote_deleted_at') || readField(input, 'deletedAt', 'deleted_at'));
    if (peer && kind && recordId && deletedAt) {
      return 'remote-record:' + encodeURIComponent(peer) + ':' + encodeURIComponent(kind) + ':' +
        encodeURIComponent(recordId) + ':' + encodeURIComponent(deletedAt);
    }
    return '';
  }

  function validateReview(record) {
    var r = record || {};
    var errors = [];
    var schema = cleanString(readField(r, 'schema', null));
    var classification = cleanString(readField(r, 'classification', null));
    var status = cleanString(readField(r, 'status', null));
    if (!cleanString(readField(r, 'reviewId', 'review_id'))) errors.push({ code: 'missing-review-id' });
    if (schema !== REVIEW_SCHEMA) errors.push({ code: 'invalid-schema' });
    if (!classification) errors.push({ code: 'missing-classification' });
    else if (!CLASSIFICATIONS[classification]) errors.push({ code: 'invalid-classification' });
    if (!status) errors.push({ code: 'missing-status' });
    else if (!STATUSES[status]) errors.push({ code: 'invalid-status' });
    if (!cleanString(readField(r, 'dedupeKey', 'dedupe_key'))) errors.push({ code: 'missing-dedupe-key' });
    try { normalizeRawTombstoneJson(r); }
    catch (e) { errors.push({ code: 'invalid-raw-tombstone-json', detail: String((e && e.message) || e) }); }
    try { normalizeWarningsJson(r); }
    catch (e2) { errors.push({ code: 'invalid-warnings-json', detail: String((e2 && e2.message) || e2) }); }
    var seq = readField(r, 'remoteSequenceNumber', 'remote_sequence_number');
    if (seq != null && seq !== '') {
      var n = Number(seq);
      if (!Number.isFinite(n) || Math.floor(n) !== n) errors.push({ code: 'invalid-remote-sequence-number' });
    }
    var seen = readField(r, 'seenCount', 'seen_count');
    if (seen != null && seen !== '') {
      var seenNumber = Number(seen);
      if (!Number.isFinite(seenNumber) || Math.floor(seenNumber) !== seenNumber || seenNumber < 1) {
        errors.push({ code: 'invalid-seen-count' });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeForCreate(input) {
    var r = input || {};
    var now = nowIso();
    var rawJson = normalizeRawTombstoneJson(r);
    var warningsJson = normalizeWarningsJson(r);
    var seq = readField(r, 'remoteSequenceNumber', 'remote_sequence_number');
    var seen = Number(readField(r, 'seenCount', 'seen_count'));
    var out = {
      reviewId: cleanString(readField(r, 'reviewId', 'review_id')) || generateReviewId(),
      schema: cleanString(readField(r, 'schema', null)) || REVIEW_SCHEMA,
      remoteTombstoneId: nullableString(readField(r, 'remoteTombstoneId', 'remote_tombstone_id')),
      remoteSyncPeerId: nullableString(readField(r, 'remoteSyncPeerId', 'remote_sync_peer_id')),
      remoteExportId: nullableString(readField(r, 'remoteExportId', 'remote_export_id')),
      remoteSequenceNumber: seq == null || seq === '' ? null : Number(seq),
      recordKind: nullableString(readField(r, 'recordKind', 'record_kind')),
      recordId: nullableString(readField(r, 'recordId', 'record_id')),
      deleteReason: nullableString(readField(r, 'deleteReason', 'delete_reason')),
      remoteDeletedAt: nullableString(readField(r, 'remoteDeletedAt', 'remote_deleted_at')),
      receivedAt: cleanString(readField(r, 'receivedAt', 'received_at')) || now,
      firstSeenAt: cleanString(readField(r, 'firstSeenAt', 'first_seen_at')) || now,
      lastSeenAt: cleanString(readField(r, 'lastSeenAt', 'last_seen_at')) || now,
      seenCount: Number.isFinite(seen) && seen > 0 ? Math.floor(seen) : 1,
      lastSeenExportId: nullableString(readField(r, 'lastSeenExportId', 'last_seen_export_id')),
      localRecordExists: readField(r, 'localRecordExists', 'local_record_exists') == null ? null : !!readField(r, 'localRecordExists', 'local_record_exists'),
      localRecordDigest: nullableString(readField(r, 'localRecordDigest', 'local_record_digest')),
      localUpdatedAt: nullableString(readField(r, 'localUpdatedAt', 'local_updated_at')),
      localHasNewerEdit: readField(r, 'localHasNewerEdit', 'local_has_newer_edit') == null ? null : !!readField(r, 'localHasNewerEdit', 'local_has_newer_edit'),
      classification: cleanString(readField(r, 'classification', null)),
      status: cleanString(readField(r, 'status', null)),
      decision: nullableString(readField(r, 'decision', null)),
      decidedAt: nullableString(readField(r, 'decidedAt', 'decided_at')),
      decidedBySyncPeerId: nullableString(readField(r, 'decidedBySyncPeerId', 'decided_by_sync_peer_id')),
      dedupeKey: cleanString(readField(r, 'dedupeKey', 'dedupe_key')) || buildDedupeKey(r),
      rawTombstoneJson: rawJson,
      warningsJson: warningsJson,
      createdAt: cleanString(readField(r, 'createdAt', 'created_at')) || now,
      updatedAt: cleanString(readField(r, 'updatedAt', 'updated_at')) || now,
    };
    var v = validateReview(out);
    if (!v.ok) {
      var err = new Error('invalid tombstone review: ' + v.errors.map(function (e) { return e.code; }).join(', '));
      err.validation = v;
      throw err;
    }
    return out;
  }

  function cloneRecord(record) {
    if (!record || typeof record !== 'object') return null;
    var out = Object.assign({}, record);
    out.warningsJson = out.warningsJson == null ? '[]' : String(out.warningsJson);
    out.warnings = parseWarnings(out.warningsJson);
    out.seenCount = out.seenCount == null ? null : Number(out.seenCount);
    return out;
  }

  function requestToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('indexeddb request failed')); };
    });
  }

  function txDone(tx) {
    return new Promise(function (resolve, reject) {
      tx.oncomplete = function () { resolve(); };
      tx.onabort = function () { reject(tx.error || new Error('indexeddb transaction aborted')); };
      tx.onerror = function () { reject(tx.error || new Error('indexeddb transaction failed')); };
    });
  }

  function ensureIndex(objectStore, name, keyPath, options) {
    try {
      if (!objectStore.indexNames || !objectStore.indexNames.contains(name)) {
        objectStore.createIndex(name, keyPath, options || {});
      }
    } catch (e) {
      recordError('ensureIndex:' + name, e);
      throw e;
    }
  }

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error('indexedDB unavailable'));
    if (state.dbPromise) return state.dbPromise;
    state.dbPromise = new Promise(function (resolve, reject) {
      var request;
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      request.onupgradeneeded = function (event) {
        var db = request.result || (event && event.target && event.target.result);
        var tx = request.transaction || (event && event.target && event.target.transaction);
        var objectStore = null;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'reviewId' });
        } else if (tx) {
          objectStore = tx.objectStore(STORE_NAME);
        }
        if (objectStore) {
          ensureIndex(objectStore, 'dedupeKey', 'dedupeKey', { unique: true });
          ensureIndex(objectStore, 'status', 'status');
          ensureIndex(objectStore, 'classification', 'classification');
          ensureIndex(objectStore, 'recordKind_recordId', ['recordKind', 'recordId']);
          ensureIndex(objectStore, 'remoteSyncPeerId', 'remoteSyncPeerId');
          ensureIndex(objectStore, 'remoteExportId', 'remoteExportId');
          ensureIndex(objectStore, 'receivedAt', 'receivedAt');
          ensureIndex(objectStore, 'lastSeenAt', 'lastSeenAt');
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('indexedDB open failed')); };
      request.onblocked = function () { recordWarning('indexeddb-open-blocked'); };
    }).catch(function (e) {
      state.dbPromise = null;
      throw e;
    });
    return state.dbPromise;
  }

  function getStore(mode) {
    return openDb().then(function (db) {
      var tx = db.transaction(STORE_NAME, mode || 'readonly');
      return { tx: tx, store: tx.objectStore(STORE_NAME) };
    });
  }

  function idbGet(reviewId) {
    return getStore('readonly').then(function (parts) {
      return requestToPromise(parts.store.get(reviewId)).then(function (result) {
        return txDone(parts.tx).then(function () { return cloneRecord(result); });
      });
    });
  }

  function idbGetByDedupeKey(dedupeKey) {
    return getStore('readonly').then(function (parts) {
      return requestToPromise(parts.store.index('dedupeKey').get(dedupeKey)).then(function (result) {
        return txDone(parts.tx).then(function () { return cloneRecord(result); });
      });
    });
  }

  function idbAdd(record) {
    return getStore('readwrite').then(function (parts) {
      return requestToPromise(parts.store.add(record)).then(function () {
        return txDone(parts.tx);
      });
    });
  }

  function idbPut(record) {
    return getStore('readwrite').then(function (parts) {
      return requestToPromise(parts.store.put(record)).then(function () {
        return txDone(parts.tx);
      });
    });
  }

  function idbGetAll() {
    return getStore('readonly').then(function (parts) {
      var request;
      if (typeof parts.store.getAll === 'function') {
        request = parts.store.getAll();
        return requestToPromise(request).then(function (rows) {
          return txDone(parts.tx).then(function () {
            return (Array.isArray(rows) ? rows : []).map(cloneRecord).filter(Boolean);
          });
        });
      }
      return new Promise(function (resolve, reject) {
        var out = [];
        var cursor = parts.store.openCursor();
        cursor.onsuccess = function () {
          var c = cursor.result;
          if (!c) { resolve(out.map(cloneRecord).filter(Boolean)); return; }
          out.push(c.value);
          c.continue();
        };
        cursor.onerror = function () { reject(cursor.error || new Error('indexeddb cursor failed')); };
      }).then(function (rows) {
        return txDone(parts.tx).then(function () { return rows; });
      });
    });
  }

  function buildWhere(filters) {
    var f = filters || {};
    var out = {};
    function pushString(field) {
      var value = cleanString(f[field]);
      if (value) out[field] = value;
    }
    pushString('reviewId');
    pushString('dedupeKey');
    pushString('status');
    pushString('classification');
    pushString('recordKind');
    pushString('recordId');
    pushString('remoteSyncPeerId');
    pushString('remoteExportId');
    pushString('remoteTombstoneId');
    return out;
  }

  function matchesFilters(row, filters) {
    var f = filters || {};
    var keys = Object.keys(f);
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (key === 'limit') continue;
      if (f[key] == null || f[key] === '') continue;
      if (cleanString(row && row[key]) !== cleanString(f[key])) return false;
    }
    return true;
  }

  function readLimit(filters) {
    var raw = Number(filters && filters.limit);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
  }

  function sortByNewest(a, b) {
    var ar = cleanString(a && a.receivedAt) || cleanString(a && a.createdAt);
    var br = cleanString(b && b.receivedAt) || cleanString(b && b.createdAt);
    if (ar < br) return 1;
    if (ar > br) return -1;
    return 0;
  }

  function init() {
    if (state.ready) return Promise.resolve({ rowCount: 0 });
    return openDb().then(function () {
      state.ready = true;
      state.initError = null;
      state.lastReloadedAt = Date.now();
      return countRows().then(function (n) { return { rowCount: n }; });
    }).catch(function (e) {
      state.ready = false;
      state.initError = String((e && e.message) || e);
      recordError('init', e);
      return { rowCount: 0 };
    });
  }

  function ensureReady() {
    if (state.ready) return Promise.resolve();
    return init().then(function () {
      if (!state.ready) throw new Error(state.initError || 'tombstone review IndexedDB store not ready');
    });
  }

  function dispose() {
    state.ready = false;
    if (state.dbPromise) {
      state.dbPromise.then(function (db) {
        try { db.close(); } catch (_) { /* ignore */ }
      }).catch(function () { /* ignore */ });
      state.dbPromise = null;
    }
  }

  function isReady() { return !!state.ready; }
  function saveNow() { return Promise.resolve(); }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    state.subscribers.add(fn);
    return function () { state.subscribers.delete(fn); };
  }
  function reload() {
    state.lastReloadedAt = Date.now();
    notifySubscribers({ source: 'reload' });
    return countRows().then(function (n) { return { rowCount: n }; })
      .catch(function () { return { rowCount: 0 }; });
  }

  function countRows(filters) {
    return ensureReady().then(function () {
      return idbGetAll().then(function (rows) {
        return rows.filter(function (row) { return matchesFilters(row, buildWhere(filters)); }).length;
      });
    });
  }

  function getReview(reviewIdInput) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.resolve(null);
    return ensureReady()
      .then(function () { return idbGet(reviewId); })
      .catch(function (e) { recordError('getReview', e); return null; });
  }

  function getByDedupeKey(dedupeKeyInput) {
    var dedupeKey = cleanString(dedupeKeyInput);
    if (!dedupeKey) return Promise.resolve(null);
    return ensureReady()
      .then(function () { return idbGetByDedupeKey(dedupeKey); })
      .catch(function (e) { recordError('getByDedupeKey', e); return null; });
  }

  function listReviews(filters) {
    return ensureReady()
      .then(function () {
        var where = buildWhere(filters);
        var limit = readLimit(filters);
        return idbGetAll().then(function (rows) {
          return rows.filter(function (row) { return matchesFilters(row, where); })
            .sort(sortByNewest)
            .slice(0, limit);
        });
      })
      .catch(function (e) { recordError('listReviews', e); return []; });
  }

  function getAll() { return listReviews(); }

  function countByField(field, filters) {
    return ensureReady()
      .then(function () {
        var where = buildWhere(filters);
        return idbGetAll().then(function (rows) {
          var counts = {};
          rows.filter(function (row) { return matchesFilters(row, where); }).forEach(function (row) {
            var key = cleanString(row && row[field]) || 'unknown';
            counts[key] = Number(counts[key] || 0) + 1;
          });
          return Object.keys(counts).sort().map(function (key) {
            var out = { total: counts[key] };
            out[field] = key;
            return out;
          });
        });
      });
  }

  function countByClassification(filters) {
    return countByField('classification', filters)
      .catch(function (e) { recordError('countByClassification', e); return []; });
  }

  function countByStatus(filters) {
    return countByField('status', filters)
      .catch(function (e) { recordError('countByStatus', e); return []; });
  }

  function createReview(record) {
    return ensureReady()
      .then(function () {
        var r = normalizeForCreate(record);
        return idbAdd(r).then(function () {
          recordWrite('createReview');
          notifySubscribers({ source: 'local', op: 'createReview', reviewId: r.reviewId, classification: r.classification, status: r.status });
          return getReview(r.reviewId);
        });
      })
      .catch(function (e) { recordError('createReview', e); throw e; });
  }

  function upsertReviewSighting(record) {
    var dedupeKey = cleanString(record && (record.dedupeKey || record.dedupe_key)) || buildDedupeKey(record);
    if (!dedupeKey) return Promise.reject(new Error('upsertReviewSighting: dedupeKey required'));
    return ensureReady()
      .then(function () { return getByDedupeKey(dedupeKey); })
      .then(function (existing) {
        if (!existing) {
          var input = Object.assign({}, record || {}, { dedupeKey: dedupeKey });
          return createReview(input);
        }
        var now = nowIso();
        var lastSeenExportId = nullableString(readField(record, 'lastSeenExportId', 'last_seen_export_id')) ||
          nullableString(readField(record, 'remoteExportId', 'remote_export_id')) ||
          nullableString(existing.lastSeenExportId);
        var next = Object.assign({}, existing, {
          lastSeenAt: now,
          seenCount: (Number(existing.seenCount) || 1) + 1,
          lastSeenExportId: lastSeenExportId,
          updatedAt: now,
        });
        return idbPut(next).then(function () {
          recordWrite('upsertReviewSighting');
          notifySubscribers({ source: 'local', op: 'upsertReviewSighting', dedupeKey: dedupeKey });
          return getReview(existing.reviewId);
        });
      })
      .catch(function (e) { recordError('upsertReviewSighting', e); throw e; });
  }

  function makeIngestResult(bundle, options) {
    var opts = isObject(options) ? options : {};
    var sourceProvided = cleanScalar(opts.source) !== '';
    var source = sourceProvided ? cleanScalar(opts.source) : 'manual';
    return {
      schema: INGEST_SCHEMA,
      ok: true,
      dryRun: false,
      source: source,
      sourceSyncPeerIdPresent: !!cleanScalar(bundle && bundle.sourceSyncPeerId),
      exportIdPresent: !!cleanScalar(bundle && bundle.exportId),
      sequenceNumberPresent: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== '',
      tombstoneSchemaVersion: cleanScalar(bundle && bundle.tombstoneSchemaVersion),
      found: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      selfOriginatedIgnored: 0,
      malformed: 0,
      skippedMalformed: 0,
      unsupported: 0,
      failed: 0,
      byClassification: {},
      byStatus: {},
      warnings: sourceProvided ? [] : [{ code: 'missing-source-defaulted' }],
    };
  }

  function pushIngestWarning(result, code) {
    var c = cleanScalar(code);
    if (!c) return;
    for (var i = 0; i < result.warnings.length; i += 1) {
      if (result.warnings[i] && result.warnings[i].code === c) {
        result.warnings[i].count = Number(result.warnings[i].count || 1) + 1;
        return;
      }
    }
    result.warnings.push({ code: c });
  }

  function pushBlocker(result, code) {
    var c = cleanScalar(code);
    if (!c || !result || !Array.isArray(result.blockers)) return;
    for (var i = 0; i < result.blockers.length; i += 1) {
      if (result.blockers[i] && result.blockers[i].code === c) return;
    }
    result.blockers.push({ code: c });
  }

  function makePreviewResult(review) {
    return {
      schema: PREVIEW_SCHEMA,
      ok: true,
      reviewFound: !!review,
      supported: false,
      dryRunOnly: true,
      wouldMutateOnApply: false,
      mutationType: null,
      action: 'blocked-malformed-review',
      recordKind: nullableString(review && review.recordKind),
      classification: nullableString(review && review.classification),
      status: nullableString(review && review.status),
      blockers: [],
      local: {
        exists: null,
        hasNewerEdit: null,
        targetMatches: null,
        timestampComparable: null,
      },
      auditPreview: {
        wouldCreateLocalTombstone: false,
        wouldUpdateReviewDecision: false,
        wouldRequireOperatorConfirmation: false,
        remoteTombstoneSourcePresent: false,
        remoteExportSourcePresent: false,
        localPeerIdentityAvailable: false,
      },
      warnings: [],
    };
  }

  function makeApplyDryRunResult(review, dryRun) {
    return {
      schema: APPLY_DRY_RUN_SCHEMA,
      ok: true,
      dryRun: dryRun === true,
      realApplyImplemented: false,
      reviewFound: !!review,
      supported: false,
      action: 'blocked-real-apply-not-implemented',
      mutationType: null,
      wouldMutateOnApply: false,
      writesPerformed: 0,
      blockers: [],
      preview: null,
      plannedWrites: {
        libraryMutation: {
          type: null,
          wouldRun: false,
        },
        localTombstone: {
          wouldCreate: false,
          recordKind: null,
          deleteReason: null,
        },
        reviewUpdate: {
          wouldUpdateStatus: false,
          futureStatus: null,
          futureDecision: null,
        },
      },
      auditPreview: {
        wouldRecordSourceReview: false,
        wouldRecordRemoteTombstone: false,
        wouldRecordRemotePeer: false,
        wouldRecordOperatorPeer: false,
        wouldRequireOperatorConfirmation: false,
        localPeerIdentityAvailable: false,
      },
      warnings: [],
    };
  }

  function copyCodeWarnings(warnings) {
    var out = [];
    (Array.isArray(warnings) ? warnings : []).forEach(function (warning) {
      var code = cleanScalar(warning && warning.code);
      if (code) pushCodeWarning(out, code);
    });
    return out;
  }

  function copyBlockers(blockers) {
    var out = [];
    (Array.isArray(blockers) ? blockers : []).forEach(function (blocker) {
      var code = cleanScalar(blocker && blocker.code);
      if (code) out.push({ code: code });
    });
    return out;
  }

  function makePreviewSummary(preview) {
    var p = preview || {};
    return {
      schema: PREVIEW_SCHEMA,
      ok: p.ok === true,
      reviewFound: p.reviewFound === true,
      supported: p.supported === true,
      action: cleanScalar(p.action) || null,
      mutationType: nullableString(p.mutationType),
      wouldMutateOnApply: p.wouldMutateOnApply === true,
      blockers: copyBlockers(p.blockers),
      warnings: copyCodeWarnings(p.warnings),
    };
  }

  function mergeCodeWarnings(target, warnings) {
    (Array.isArray(warnings) ? warnings : []).forEach(function (warning) {
      pushCodeWarning(target, warning && warning.code);
    });
  }

  function applyPreviewAudit(result, preview, review) {
    var audit = (preview && preview.auditPreview) || {};
    result.auditPreview = {
      wouldRecordSourceReview: true,
      wouldRecordRemoteTombstone: !!audit.remoteTombstoneSourcePresent,
      wouldRecordRemotePeer: !!cleanScalar(review && review.remoteSyncPeerId),
      wouldRecordOperatorPeer: !!audit.localPeerIdentityAvailable,
      wouldRequireOperatorConfirmation: true,
      localPeerIdentityAvailable: !!audit.localPeerIdentityAvailable,
    };
  }

  function setApplyDryRunPlan(result, preview, review) {
    applyPreviewAudit(result, preview, review);
    result.supported = preview && preview.supported === true;
    result.action = cleanScalar(preview && preview.action) || 'blocked-preview';
    result.mutationType = nullableString(preview && preview.mutationType);
    result.wouldMutateOnApply = preview && preview.wouldMutateOnApply === true;
    if (result.action === 'would-unbind-folder-binding') {
      result.plannedWrites = {
        libraryMutation: {
          type: 'folderBinding.unbind',
          wouldRun: true,
        },
        localTombstone: {
          wouldCreate: true,
          recordKind: 'folderBinding',
          deleteReason: 'remote-review-apply',
        },
        reviewUpdate: {
          wouldUpdateStatus: true,
          futureStatus: 'resolved',
          futureDecision: 'applied-folder-binding',
        },
      };
      return;
    }
    if (result.action === 'no-op-already-missing') {
      result.plannedWrites.reviewUpdate = {
        wouldUpdateStatus: true,
        futureStatus: 'resolved',
        futureDecision: 'already-local-missing',
      };
    }
  }

  function blockApplyDryRunFromPreview(result, preview, review) {
    result.ok = false;
    result.supported = preview && preview.supported === true;
    result.action = cleanScalar(preview && preview.action) || 'blocked-preview';
    result.mutationType = nullableString(preview && preview.mutationType);
    result.wouldMutateOnApply = false;
    applyPreviewAudit(result, preview, review);
    pushBlocker(result, 'preview-blocked');
    (Array.isArray(preview && preview.blockers) ? preview.blockers : []).forEach(function (blocker) {
      pushBlocker(result, blocker && blocker.code);
    });
    mergeCodeWarnings(result.warnings, preview && preview.warnings);
    result.preview = makePreviewSummary(preview);
    return result;
  }

  function parseReviewTombstone(review, result) {
    var raw = review && review.rawTombstoneJson;
    if (!raw) {
      pushBlocker(result, 'malformed-remote-tombstone');
      result.action = 'blocked-malformed-review';
      return null;
    }
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!isObject(parsed)) throw new Error('raw tombstone not object');
      return parsed;
    } catch (_) {
      pushBlocker(result, 'malformed-remote-tombstone');
      result.action = 'blocked-malformed-review';
      return null;
    }
  }

  function readLocalSyncPeerIdForPreview(result) {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      pushCodeWarning(result.warnings, 'local-identity-unavailable');
      return Promise.resolve('');
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) pushCodeWarning(result.warnings, 'local-identity-unavailable');
        result.auditPreview.localPeerIdentityAvailable = !!peerId;
        return peerId;
      }).catch(function () {
        pushCodeWarning(result.warnings, 'local-identity-unavailable');
        return '';
      });
    } catch (_) {
      pushCodeWarning(result.warnings, 'local-identity-unavailable');
      return Promise.resolve('');
    }
  }

  function readLocalSyncPeerIdForIngest(result) {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      pushIngestWarning(result, 'local-identity-unavailable');
      return Promise.resolve('');
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) pushIngestWarning(result, 'local-identity-unavailable');
        return peerId;
      }).catch(function () {
        pushIngestWarning(result, 'local-identity-unavailable');
        return '';
      });
    } catch (_) {
      pushIngestWarning(result, 'local-identity-unavailable');
      return Promise.resolve('');
    }
  }

  function readLocalSyncPeerIdForDecision() {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      return Promise.reject(new Error('local identity unavailable for decision audit'));
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanScalar(value && value.syncPeerId);
        if (!peerId) throw new Error('local identity unavailable for decision audit');
        return peerId;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function isCascadeRelated(tombstone, metaObject) {
    var deleteReason = cleanScalar(tombstone && tombstone.deleteReason);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(deleteReason) ||
      (metaObject && metaObject.cascade === true) ||
      (metaObject && cleanScalar(metaObject.cascadeKind))
    );
  }

  function isCascadeChild(tombstone, metaObject) {
    var kind = cleanScalar(tombstone && tombstone.recordKind);
    var deleteReason = cleanScalar(tombstone && tombstone.deleteReason);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(deleteReason) ||
      (metaObject && metaObject.cascade === true && BINDING_TOMBSTONE_KINDS[kind]) ||
      (metaObject && cleanScalar(metaObject.cascadeKind))
    );
  }

  function isLocallyComparableKind(kind) {
    return kind === 'folder' || kind === 'folderBinding';
  }

  function parseFolderRecordId(recordIdInput) {
    var recordId = cleanScalar(recordIdInput);
    if (!recordId) return '';
    if (recordId.indexOf('folder:') === 0) return decodeComponentSafe(recordId.slice('folder:'.length));
    return recordId;
  }

  function parseFolderBindingRecordId(recordIdInput) {
    var recordId = cleanScalar(recordIdInput);
    var prefix = 'folderBinding:';
    if (recordId.indexOf(prefix) !== 0) return { chatId: '', folderId: '' };
    var rest = recordId.slice(prefix.length);
    var sep = rest.indexOf(':');
    if (sep < 0) return { chatId: '', folderId: '' };
    return {
      chatId: decodeComponentSafe(rest.slice(0, sep)),
      folderId: decodeComponentSafe(rest.slice(sep + 1)),
    };
  }

  function parseFolderBindingIds(tombstone, metaObject) {
    var meta = metaObject || {};
    var chatId = cleanScalar(meta.chatId);
    var folderId = cleanScalar(meta.folderId) || cleanScalar(meta.oldFolderId);
    if (chatId && folderId) return { chatId: chatId, folderId: folderId };
    var parsed = parseFolderBindingRecordId(tombstone && tombstone.recordId);
    return {
      chatId: chatId || parsed.chatId,
      folderId: folderId || parsed.folderId,
    };
  }

  function normalizeFolderIdFromRecord(folder) {
    return cleanScalar(folder && (folder.id || folder.folderId || folder.folder_id));
  }

  function normalizeBindingFolderId(binding) {
    if (binding == null) return '';
    if (typeof binding === 'string' || typeof binding === 'number') return cleanScalar(binding);
    if (!isObject(binding)) return '';
    if (binding.folderId || binding.folder_id || binding.id) {
      return cleanScalar(binding.folderId || binding.folder_id || binding.id);
    }
    if (typeof binding.folder === 'string' || typeof binding.folder === 'number') return cleanScalar(binding.folder);
    if (isObject(binding.folder)) return cleanScalar(binding.folder.id || binding.folder.folderId || binding.folder.folder_id);
    return '';
  }

  function normalizeBindingChatId(binding) {
    if (binding == null) return '';
    if (typeof binding === 'string' || typeof binding === 'number') return cleanScalar(binding);
    if (!isObject(binding)) return '';
    return cleanScalar(binding.chatId || binding.chat_id || binding.id || binding.href || binding.chatHref);
  }

  function valuesFromObject(input) {
    if (!input || typeof input !== 'object') return [];
    return Object.keys(input).map(function (key) { return input[key]; });
  }

  function readFoldersList() {
    var workspace = getLibraryWorkspaceApi();
    var foldersApi = getLibraryFoldersApi();
    var legacyFoldersApi = H2O && H2O.folders;
    if (workspace && typeof workspace.getFolders === 'function') {
      try {
        return Promise.resolve(workspace.getFolders({ fresh: false })).then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        });
      } catch (_) { /* fall through */ }
    }
    if (foldersApi && typeof foldersApi.listFolders === 'function') {
      try {
        return Promise.resolve(foldersApi.listFolders({ fresh: false })).then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        });
      } catch (_) { /* fall through */ }
    }
    if (legacyFoldersApi && typeof legacyFoldersApi.list === 'function') {
      try {
        return Promise.resolve(legacyFoldersApi.list()).then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        });
      } catch (_) { /* fall through */ }
    }
    return Promise.resolve(null);
  }

  function readLocalFolder(folderId) {
    var id = cleanScalar(folderId);
    var foldersApi = getLibraryFoldersApi();
    var triedApi = false;
    var readError = false;
    var chain = Promise.resolve(null);
    if (foldersApi && typeof foldersApi.getFolderById === 'function') {
      triedApi = true;
      chain = Promise.resolve().then(function () {
        return foldersApi.getFolderById(id);
      }).catch(function () {
        readError = true;
        return null;
      });
    }
    return chain.then(function (folder) {
      if (folder) return { available: true, exists: true, record: folder };
      return readFoldersList().then(function (folders) {
        if (folders === null) return { available: triedApi && !readError, exists: false, record: null };
        var match = null;
        for (var i = 0; i < folders.length; i += 1) {
          if (normalizeFolderIdFromRecord(folders[i]) === id) {
            match = folders[i];
            break;
          }
        }
        return { available: true, exists: !!match, record: match };
      });
    });
  }

  function findBindingInResolved(result, chatId, folderId) {
    var value = null;
    if (result && typeof result.get === 'function') {
      value = result.get(chatId) || result.get(String(chatId));
    } else if (Array.isArray(result)) {
      for (var i = 0; i < result.length; i += 1) {
        var candidate = result[i];
        if (normalizeBindingChatId(candidate) === chatId || normalizeBindingFolderId(candidate) === folderId) {
          value = candidate;
          break;
        }
      }
    } else if (isObject(result)) {
      value = result[chatId] || result[String(chatId)];
      if (!value && (normalizeBindingChatId(result) === chatId || normalizeBindingFolderId(result) === folderId)) {
        value = result;
      }
    }
    var valueFolderId = normalizeBindingFolderId(value);
    if (valueFolderId && valueFolderId === folderId) return { exists: true, record: value };
    if (!valueFolderId && value && cleanScalar(value) === folderId) return { exists: true, record: value };
    return { exists: false, record: null };
  }

  function rowMatchesChatId(row, chatId) {
    if (row == null) return false;
    if (typeof row === 'string' || typeof row === 'number') return cleanScalar(row) === chatId;
    if (!isObject(row)) return false;
    return cleanScalar(row.chatId || row.chat_id || row.id || row.href || row.chatHref) === chatId;
  }

  function readBindingFromFolderChats(chatId, folderId) {
    var foldersApi = getLibraryFoldersApi();
    if (!foldersApi || typeof foldersApi.getChatsInFolder !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(foldersApi.getChatsInFolder(folderId)).then(function (rows) {
        var list = Array.isArray(rows) ? rows : [];
        for (var i = 0; i < list.length; i += 1) {
          if (rowMatchesChatId(list[i], chatId)) return { available: true, exists: true, record: list[i] };
        }
        return { available: true, exists: false, record: null };
      }).catch(function () { return null; });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function readBindingFromIndexFacets(chatId, folderId) {
    var index = getLibraryIndexApi();
    if (!index || typeof index.facets !== 'function') return null;
    try {
      var facets = index.facets() || {};
      var byFolder = facets.byFolder || {};
      var rows = byFolder[folderId] || byFolder[String(folderId)] || [];
      if (!Array.isArray(rows)) rows = valuesFromObject(rows);
      for (var i = 0; i < rows.length; i += 1) {
        if (rowMatchesChatId(rows[i], chatId)) return { available: true, exists: true, record: rows[i] };
      }
      return { available: true, exists: false, record: null };
    } catch (_) {
      return null;
    }
  }

  function readLocalFolderBinding(chatId, folderId) {
    var workspace = getLibraryWorkspaceApi();
    var triedApi = false;
    var readError = false;
    var chain = Promise.resolve(null);
    if (workspace && typeof workspace.resolveFolderBindings === 'function') {
      triedApi = true;
      chain = Promise.resolve().then(function () {
        return workspace.resolveFolderBindings([chatId]);
      }).then(function (result) {
        var found = findBindingInResolved(result, chatId, folderId);
        return found.exists ? { available: true, exists: true, record: found.record } : { available: true, exists: false, record: null };
      }).catch(function () {
        readError = true;
        return null;
      });
    }
    return chain.then(function (resolved) {
      if (resolved && resolved.exists) return resolved;
      return readBindingFromFolderChats(chatId, folderId).then(function (fromFolder) {
        if (fromFolder && fromFolder.exists) return fromFolder;
        var fromIndex = readBindingFromIndexFacets(chatId, folderId);
        if (fromIndex) return fromIndex.exists ? fromIndex : (resolved || fromFolder || fromIndex);
        return resolved || fromFolder || { available: triedApi && !readError, exists: false, record: null };
      });
    });
  }

  function readCurrentFolderBindingForPreview(chatId, folderId) {
    var workspace = getLibraryWorkspaceApi();
    if (workspace && typeof workspace.resolveFolderBindings === 'function') {
      try {
        return Promise.resolve(workspace.resolveFolderBindings([chatId])).then(function (result) {
          var value = null;
          if (result && typeof result.get === 'function') {
            value = result.get(chatId) || result.get(String(chatId));
          } else if (isObject(result)) {
            value = result[chatId] || result[String(chatId)];
          } else if (Array.isArray(result)) {
            for (var i = 0; i < result.length; i += 1) {
              if (normalizeBindingChatId(result[i]) === chatId || (result.length === 1 && normalizeBindingFolderId(result[i]))) {
                value = result[i];
                break;
              }
            }
          }
          var currentFolderId = normalizeBindingFolderId(value);
          if (currentFolderId) {
            return {
              available: true,
              complete: true,
              exists: true,
              targetMatches: currentFolderId === folderId,
              record: value,
            };
          }
          return {
            available: true,
            complete: true,
            exists: false,
            targetMatches: false,
            record: null,
          };
        }).catch(function () {
          return null;
        });
      } catch (_) { /* fall through */ }
    }
    return readLocalFolderBinding(chatId, folderId).then(function (exact) {
      if (exact && exact.exists) {
        return {
          available: true,
          complete: false,
          exists: true,
          targetMatches: true,
          record: exact.record,
        };
      }
      return {
        available: false,
        complete: false,
        exists: null,
        targetMatches: null,
        record: null,
      };
    });
  }

  function validateRemoteTombstone(tombstone, parentRecordIds) {
    var warnings = [];
    var errors = [];
    if (!isObject(tombstone)) {
      errors.push({ code: 'tombstone-not-object' });
      return {
        ok: false,
        malformed: true,
        unsupported: false,
        warnings: warnings,
        errors: errors,
        metaObject: null,
        cascadeRelated: false,
        cascadeChild: false,
      };
    }
    for (var i = 0; i < REQUIRED_REMOTE_TOMBSTONE_FIELDS.length; i += 1) {
      var field = REQUIRED_REMOTE_TOMBSTONE_FIELDS[i];
      if (!cleanScalar(tombstone[field])) errors.push({ code: 'missing-' + field });
    }
    if (cleanScalar(tombstone.schema) && cleanScalar(tombstone.schema) !== TOMBSTONE_SCHEMA) {
      errors.push({ code: 'invalid-tombstone-schema' });
    }
    var kind = cleanScalar(tombstone.recordKind);
    var unsupported = !!(kind && !KNOWN_TOMBSTONE_KINDS[kind]);
    if (unsupported) warnings.push({ code: 'unsupported-record-kind' });
    if (hasOwn(tombstone, 'meta') && tombstone.meta != null && !isObject(tombstone.meta)) {
      errors.push({ code: 'invalid-meta' });
    }
    if (cleanScalar(tombstone.deletedAt) && !isIsoLike(tombstone.deletedAt) && parseTimeMs(tombstone.deletedAt) == null) {
      errors.push({ code: 'invalid-deleted-at' });
    }
    var metaObject = isObject(tombstone.meta) ? tombstone.meta : null;
    var cascadeRelated = isCascadeRelated(tombstone, metaObject);
    var cascadeChild = isCascadeChild(tombstone, metaObject);
    if (cascadeChild && !cleanScalar(tombstone.cascadeFrom)) {
      warnings.push({ code: 'missing-cascade-from' });
    }
    if (cleanScalar(tombstone.cascadeFrom) && parentRecordIds && !parentRecordIds[cleanScalar(tombstone.cascadeFrom)]) {
      warnings.push({ code: 'missing-cascade-parent' });
    }
    return {
      ok: errors.length === 0 && !unsupported,
      malformed: errors.length > 0,
      unsupported: unsupported,
      warnings: warnings,
      errors: errors,
      metaObject: metaObject,
      cascadeRelated: cascadeRelated,
      cascadeChild: cascadeChild,
    };
  }

  function compareTimestampsForReview(localTimestamp, remoteDeletedAt) {
    var remoteMs = parseTimeMs(remoteDeletedAt);
    if (!localTimestamp || !localTimestamp.parseable || remoteMs == null) {
      return { comparable: false, newer: false };
    }
    return {
      comparable: true,
      newer: localTimestamp.ms > remoteMs,
    };
  }

  function compareLocalFolder(tombstone, validation) {
    var warnings = validation.warnings.slice();
    var folderId = parseFolderRecordId(tombstone && tombstone.recordId);
    if (!folderId) {
      pushCodeWarning(warnings, 'local-folder-id-unavailable');
      return Promise.resolve(makeClassification('local-comparison-unavailable', null, null, null, warnings));
    }
    return readLocalFolder(folderId).then(function (local) {
      if (!local || !local.available) {
        pushCodeWarning(warnings, 'local-folder-read-unavailable');
        return makeClassification('local-comparison-unavailable', null, null, null, warnings);
      }
      if (!local.exists) {
        return makeClassification('missing-local-record', false, null, false, warnings);
      }
      var timestamp = readTimestampCandidate(local.record, ['updatedAt', 'updated_at', 'modifiedAt', 'modified_at']);
      var compared = compareTimestampsForReview(timestamp, tombstone && tombstone.deletedAt);
      if (!timestamp.value || !compared.comparable) {
        pushCodeWarning(warnings, 'local-timestamp-unavailable');
        return makeClassification('local-comparison-unavailable', true, timestamp.value, false, warnings);
      }
      if (compared.newer) {
        return makeClassification('delete-vs-edit', true, timestamp.value, true, warnings);
      }
      return makeClassification('safe-review', true, timestamp.value, false, warnings);
    }).catch(function () {
      pushCodeWarning(warnings, 'local-folder-read-failed');
      return makeClassification('local-comparison-unavailable', null, null, null, warnings);
    });
  }

  function compareLocalFolderBinding(tombstone, validation) {
    var warnings = validation.warnings.slice();
    var ids = parseFolderBindingIds(tombstone, validation.metaObject);
    if (!ids.chatId || !ids.folderId) {
      pushCodeWarning(warnings, 'local-folder-binding-id-unavailable');
      return Promise.resolve(makeClassification('local-comparison-unavailable', null, null, null, warnings));
    }
    return readLocalFolderBinding(ids.chatId, ids.folderId).then(function (local) {
      if (!local || !local.available) {
        pushCodeWarning(warnings, 'local-folder-binding-read-unavailable');
        return makeClassification('local-comparison-unavailable', null, null, null, warnings);
      }
      if (!local.exists) {
        return makeClassification('missing-local-record', false, null, false, warnings);
      }
      var timestamp = readTimestampCandidate(local.record, [
        'assignedAt',
        'assigned_at',
        'boundAt',
        'bound_at',
        'updatedAt',
        'updated_at',
        'createdAt',
        'created_at',
      ]);
      var compared = compareTimestampsForReview(timestamp, tombstone && tombstone.deletedAt);
      if (timestamp.value && compared.comparable && compared.newer) {
        return makeClassification('delete-vs-edit', true, timestamp.value, true, warnings);
      }
      if (validation.cascadeRelated) {
        if (!timestamp.value || !compared.comparable) pushCodeWarning(warnings, 'local-timestamp-unavailable');
        return makeClassification('cascade-review', true, timestamp.value, false, warnings);
      }
      if (!timestamp.value || !compared.comparable) {
        pushCodeWarning(warnings, 'local-timestamp-unavailable');
        return makeClassification('local-comparison-unavailable', true, timestamp.value, false, warnings);
      }
      return makeClassification('safe-review', true, timestamp.value, false, warnings);
    }).catch(function () {
      pushCodeWarning(warnings, 'local-folder-binding-read-failed');
      return makeClassification('local-comparison-unavailable', null, null, null, warnings);
    });
  }

  function classifyRemoteTombstone(tombstone, validation) {
    if (validation.malformed) {
      return Promise.resolve(makeClassification(
        'malformed-remote-tombstone',
        null,
        null,
        null,
        validation.errors.concat(validation.warnings)
      ));
    }
    if (validation.unsupported) {
      return Promise.resolve(makeClassification('unsupported-record-kind', null, null, null, validation.warnings));
    }
    var kind = cleanScalar(tombstone && tombstone.recordKind);
    if (!isLocallyComparableKind(kind)) {
      var warnings = validation.warnings.slice();
      pushCodeWarning(warnings, 'unsupported-record-kind');
      return Promise.resolve(makeClassification('unsupported-record-kind', null, null, null, warnings));
    }
    if (kind === 'folder') return compareLocalFolder(tombstone, validation);
    if (kind === 'folderBinding') return compareLocalFolderBinding(tombstone, validation);
    return Promise.resolve(makeClassification('local-comparison-unavailable', null, null, null, validation.warnings));
  }

  function readSourceInfo(bundle) {
    return {
      sourceSyncPeerId: cleanScalar(bundle && bundle.sourceSyncPeerId),
      exportId: cleanScalar(bundle && bundle.exportId),
      sequenceNumber: bundle && bundle.sequenceNumber != null && bundle.sequenceNumber !== ''
        ? Number(bundle.sequenceNumber)
        : null,
      tombstoneSchemaVersion: cleanScalar(bundle && bundle.tombstoneSchemaVersion),
    };
  }

  function buildParentRecordIdSet(tombstones) {
    var parents = {};
    for (var i = 0; i < tombstones.length; i += 1) {
      var row = tombstones[i];
      if (isObject(row)) {
        var recordId = cleanScalar(row.recordId);
        if (recordId) parents[recordId] = true;
      }
    }
    return parents;
  }

  function buildReviewRecordFromTombstone(tombstone, sourceInfo, classification) {
    var remoteSyncPeerId = cleanScalar(sourceInfo.sourceSyncPeerId) || cleanScalar(tombstone && tombstone.deletedBySyncPeerId);
    var record = {
      schema: REVIEW_SCHEMA,
      remoteTombstoneId: cleanScalar(tombstone && tombstone.tombstoneId),
      remoteSyncPeerId: remoteSyncPeerId,
      remoteExportId: nullableString(sourceInfo.exportId),
      remoteSequenceNumber: sourceInfo.sequenceNumber == null || sourceInfo.sequenceNumber === '' ? null : Number(sourceInfo.sequenceNumber),
      recordKind: nullableString(tombstone && tombstone.recordKind),
      recordId: nullableString(tombstone && tombstone.recordId),
      deleteReason: nullableString(tombstone && tombstone.deleteReason),
      remoteDeletedAt: nullableString(tombstone && tombstone.deletedAt),
      lastSeenExportId: nullableString(sourceInfo.exportId),
      localRecordExists: classification.localRecordExists,
      localRecordDigest: classification.localRecordDigest == null ? null : classification.localRecordDigest,
      localUpdatedAt: classification.localUpdatedAt,
      localHasNewerEdit: classification.localHasNewerEdit,
      classification: classification.classification,
      status: 'pending',
      dedupeKey: '',
      rawTombstoneJson: JSON.stringify(tombstone),
      warningsJson: JSON.stringify(classification.warnings || []),
    };
    record.dedupeKey = buildDedupeKey(record);
    return record;
  }

  function addIngestCount(result, classification, status) {
    bumpCounter(result.byClassification, classification || 'unknown');
    bumpCounter(result.byStatus, status || 'unknown');
    if (classification === 'malformed-remote-tombstone') result.malformed += 1;
    if (classification === 'unsupported-record-kind') result.unsupported += 1;
  }

  function handleIngestRow(tombstone, sourceInfo, parentRecordIds, result) {
    var validation = validateRemoteTombstone(tombstone, parentRecordIds);
    var row = isObject(tombstone) ? tombstone : {};
    var reviewRecord = null;
    return classifyRemoteTombstone(tombstone, validation).then(function (classification) {
      (classification.warnings || []).forEach(function (warning) {
        pushIngestWarning(result, warning && warning.code);
      });
      try {
        reviewRecord = buildReviewRecordFromTombstone(row, sourceInfo, classification);
      } catch (_) {
        reviewRecord = null;
      }
      addIngestCount(result, classification.classification, 'pending');
      if (!reviewRecord || !reviewRecord.dedupeKey) {
        result.skipped += 1;
        if (classification.classification === 'malformed-remote-tombstone') result.skippedMalformed += 1;
        pushIngestWarning(result, 'review-dedupe-key-unavailable');
        return null;
      }
      return getByDedupeKey(reviewRecord.dedupeKey).then(function (existing) {
        return upsertReviewSighting(reviewRecord).then(function () {
          if (existing) result.updated += 1;
          else result.inserted += 1;
        });
      }).catch(function () {
        result.failed += 1;
        result.ok = false;
        pushIngestWarning(result, 'review-write-failed');
      });
    });
  }

  function ingestBundleTombstones(bundleInput, sourceContext) {
    var bundle = isObject(bundleInput) ? bundleInput : null;
    var result = makeIngestResult(bundle || {}, sourceContext);
    var opts = isObject(sourceContext) ? sourceContext : {};
    if (!bundle) {
      result.ok = false;
      pushIngestWarning(result, 'bundle-not-object');
      return Promise.resolve(result);
    }
    if (!hasOwn(bundle, 'tombstones')) {
      pushIngestWarning(result, 'missing-tombstone-array');
      return Promise.resolve(result);
    }
    if (!Array.isArray(bundle.tombstones)) {
      pushIngestWarning(result, 'tombstones-not-array');
      return Promise.resolve(result);
    }
    var sourceInfo = readSourceInfo(bundle);
    result.sourceSyncPeerIdPresent = !!sourceInfo.sourceSyncPeerId;
    result.exportIdPresent = !!sourceInfo.exportId;
    result.sequenceNumberPresent = sourceInfo.sequenceNumber != null;
    result.tombstoneSchemaVersion = sourceInfo.tombstoneSchemaVersion;
    result.found = bundle.tombstones.length;
    if (!sourceInfo.sourceSyncPeerId) pushIngestWarning(result, 'missing-source-sync-peer-id');
    var parentRecordIds = buildParentRecordIdSet(bundle.tombstones);
    return readLocalSyncPeerIdForIngest(result).then(function (localPeerId) {
      var selfOrigin = !!(
        sourceInfo.sourceSyncPeerId &&
        localPeerId &&
        sourceInfo.sourceSyncPeerId === localPeerId &&
        opts.allowSelfOrigin !== true
      );
      if (selfOrigin) {
        result.selfOriginatedIgnored = bundle.tombstones.length;
        result.skipped += bundle.tombstones.length;
        return result;
      }
      return ensureReady().then(function () {
        var chain = Promise.resolve();
        bundle.tombstones.forEach(function (tombstone) {
          chain = chain.then(function () {
            return handleIngestRow(tombstone, sourceInfo, parentRecordIds, result);
          });
        });
        return chain.then(function () { return result; });
      });
    }).catch(function (e) {
      recordError('ingestBundleTombstones', e);
      result.ok = false;
      pushIngestWarning(result, 'ingest-failed');
      return result;
    });
  }

  function previewFolderBindingApply(review, tombstone, validation, result) {
    var ids = parseFolderBindingIds(tombstone, validation.metaObject);
    if (!ids.chatId || !ids.folderId) {
      result.action = 'blocked-malformed-review';
      pushBlocker(result, 'malformed-remote-tombstone');
      return Promise.resolve(result);
    }
    return readCurrentFolderBindingForPreview(ids.chatId, ids.folderId).then(function (local) {
      if (!local || !local.available) {
        result.action = 'blocked-local-comparison-unavailable';
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'folder-binding-local-comparison-failed');
        return result;
      }
      result.supported = true;
      result.local.exists = local.exists === null ? null : !!local.exists;
      result.local.targetMatches = local.targetMatches === null ? null : !!local.targetMatches;

      if (!local.exists) {
        result.action = 'no-op-already-missing';
        result.wouldMutateOnApply = false;
        result.mutationType = null;
        result.local.hasNewerEdit = false;
        result.local.timestampComparable = false;
        result.auditPreview.wouldUpdateReviewDecision = true;
        result.auditPreview.wouldRequireOperatorConfirmation = true;
        return result;
      }
      if (!local.targetMatches) {
        result.action = 'blocked-target-mismatch';
        pushBlocker(result, 'local-target-mismatch');
        return result;
      }

      var timestamp = readTimestampCandidate(local.record, [
        'assignedAt',
        'assigned_at',
        'boundAt',
        'bound_at',
        'updatedAt',
        'updated_at',
        'createdAt',
        'created_at',
      ]);
      var compared = compareTimestampsForReview(timestamp, tombstone && tombstone.deletedAt);
      result.local.timestampComparable = compared.comparable;
      result.local.hasNewerEdit = compared.newer;
      if (!compared.comparable) {
        result.action = 'blocked-local-comparison-unavailable';
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'local-timestamp-unavailable');
        return result;
      }
      if (compared.newer) {
        result.action = 'blocked-delete-vs-edit';
        pushBlocker(result, 'delete-vs-edit');
        return result;
      }

      result.action = 'would-unbind-folder-binding';
      result.wouldMutateOnApply = true;
      result.mutationType = 'folderBinding.unbind';
      result.auditPreview.wouldCreateLocalTombstone = true;
      result.auditPreview.wouldUpdateReviewDecision = true;
      result.auditPreview.wouldRequireOperatorConfirmation = true;
      return result;
    }).catch(function () {
      result.action = 'blocked-local-comparison-unavailable';
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'folder-binding-local-comparison-failed');
      return result;
    });
  }

  function makeFolderCascadePreviewSummary(summary) {
    if (!summary) {
      return {
        groupFound: false,
        childCount: 0,
        pendingChildCount: 0,
        acceptedLaterChildCount: 0,
        resolvedChildCount: 0,
        blockedChildCount: 0,
        missingParent: null,
        complete: false,
        partial: true,
        orphan: null,
        warningsCount: 0,
      };
    }
    var warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
    return {
      groupFound: true,
      childCount: Number(summary.childCount) || 0,
      pendingChildCount: Number(summary.pendingChildCount) || 0,
      acceptedLaterChildCount: Number(summary.acceptedLaterChildCount) || 0,
      resolvedChildCount: Number(summary.resolvedChildCount) || 0,
      blockedChildCount: Number(summary.blockedChildCount) || 0,
      missingParent: summary.missingParent === true,
      complete: summary.rootPresent === true && Number(summary.childCount) > 0,
      partial: !(summary.rootPresent === true && Number(summary.childCount) > 0),
      orphan: summary.missingParent === true,
      warningsCount: warnings.length,
    };
  }

  function buildCascadeGroupsForPreview(rows) {
    var groups = {};
    (Array.isArray(rows) ? rows : []).forEach(function (review, index) {
      var rowWarnings = [];
      var tombstone = parseCascadeTombstone(review, rowWarnings);
      var meta = cascadeMeta(tombstone);
      var root = isCascadeRootReview(review, tombstone, meta);
      var child = isCascadeChildReview(review, tombstone, meta);
      if (!root && !child) return;
      var peer = cleanScalar(review && review.remoteSyncPeerId) ||
        cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
        'unknown-peer';
      var rootRecordId = root
        ? cascadeRecordId(review, tombstone)
        : inferCascadeRootRecordId(review, tombstone, meta);
      if (!rootRecordId) {
        rootRecordId = 'unknown-root:' + (cleanScalar(review && review.dedupeKey) || cleanScalar(review && review.reviewId) || String(index));
      }
      var group = ensureCascadeGroup(groups, peer + '\u0000' + rootRecordId);
      var member = makeCascadeMember(review, tombstone, meta, rootRecordId);
      if (root) addCascadeMemberOnce(group, 'root', member);
      if (child) addCascadeMemberOnce(group, 'children', member);
    });
    return groups;
  }

  function readCascadePreviewForFolder(review, tombstone) {
    var peer = cleanScalar(review && review.remoteSyncPeerId) ||
      cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
      'unknown-peer';
    var rootRecordId = cascadeRecordId(review, tombstone);
    if (!rootRecordId) return Promise.resolve(makeFolderCascadePreviewSummary(null));
    return readAllReviewsForCascadeDiagnostics()
      .then(function (rows) {
        var groups = buildCascadeGroupsForPreview(rows);
        var group = groups[peer + '\u0000' + rootRecordId] || null;
        return makeFolderCascadePreviewSummary(group ? summarizeCascadeGroup(group, 0) : null);
      })
      .catch(function () {
        return makeFolderCascadePreviewSummary(null);
      });
  }

  function applyFolderCascadePreview(result, cascade) {
    result.cascade = cascade;
    if (!cascade || !cascade.groupFound || cascade.partial || cascade.missingParent) {
      pushBlocker(result, 'cascade-group-incomplete');
    }
    if (cascade && cascade.blockedChildCount > 0) {
      pushBlocker(result, 'cascade-group-incomplete');
    }
  }

  function normalizeFolderParentId(folder) {
    if (!isObject(folder)) return '';
    return cleanScalar(folder.parentId || folder.parent_id || folder.parentFolderId || folder.parent_folder_id);
  }

  function countChildFoldersFromList(folderId) {
    return readFoldersList().then(function (folders) {
      if (folders === null) return null;
      var count = 0;
      (Array.isArray(folders) ? folders : []).forEach(function (folder) {
        if (normalizeFolderParentId(folder) === folderId) count += 1;
      });
      return count;
    }).catch(function () {
      return null;
    });
  }

  function countBindingsFromFolderChats(folderId) {
    var foldersApi = getLibraryFoldersApi();
    if (!foldersApi || typeof foldersApi.getChatsInFolder !== 'function') return Promise.resolve(null);
    try {
      return Promise.resolve(foldersApi.getChatsInFolder(folderId)).then(function (rows) {
        if (Array.isArray(rows)) return rows.length;
        if (isObject(rows)) return valuesFromObject(rows).length;
        return null;
      }).catch(function () { return null; });
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function countBindingsFromIndex(folderId) {
    var index = getLibraryIndexApi();
    if (!index || typeof index.facets !== 'function') return null;
    try {
      var facets = index.facets() || {};
      var byFolder = facets.byFolder || {};
      var rows = byFolder[folderId] || byFolder[String(folderId)] || null;
      if (Array.isArray(rows)) return rows.length;
      if (isObject(rows)) return valuesFromObject(rows).length;
      return null;
    } catch (_) {
      return null;
    }
  }

  function readFolderActiveBindingCount(folderId) {
    return countBindingsFromFolderChats(folderId).then(function (count) {
      if (count != null) return count;
      return countBindingsFromIndex(folderId);
    });
  }

  function readChromeFolderDiagnostics(folderId, tombstone, result) {
    var id = cleanScalar(folderId);
    if (!id) {
      result.local.exists = null;
      result.local.hasNewerEdit = null;
      result.local.timestampComparable = null;
      result.local.childFolderCount = null;
      result.local.activeBindingCount = null;
      pushBlocker(result, 'malformed-remote-tombstone');
      pushCodeWarning(result.warnings, 'local-folder-id-unavailable');
      return Promise.resolve(result);
    }
    return readLocalFolder(id).then(function (local) {
      if (!local || !local.available) {
        result.local.exists = null;
        result.local.hasNewerEdit = null;
        result.local.timestampComparable = null;
        result.local.childFolderCount = null;
        result.local.activeBindingCount = null;
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'local-folder-diagnostics-unavailable');
        return result;
      }
      if (!local.exists) {
        result.local.exists = false;
        result.local.hasNewerEdit = false;
        result.local.timestampComparable = false;
        result.local.childFolderCount = 0;
        result.local.activeBindingCount = 0;
        pushBlocker(result, 'missing-local-record');
        return result;
      }
      result.local.exists = true;
      var timestamp = readTimestampCandidate(local.record, [
        'updatedAt',
        'updated_at',
        'modifiedAt',
        'modified_at',
        'createdAt',
        'created_at',
      ]);
      var compared = compareTimestampsForReview(timestamp, tombstone && tombstone.deletedAt);
      result.local.hasNewerEdit = compared.newer;
      result.local.timestampComparable = compared.comparable;
      if (!timestamp.value || !compared.comparable) {
        pushBlocker(result, 'local-comparison-unavailable');
        pushCodeWarning(result.warnings, 'local-timestamp-unavailable');
      }
      if (compared.newer) pushBlocker(result, 'local-folder-newer-edit');
      return Promise.all([
        countChildFoldersFromList(id),
        readFolderActiveBindingCount(id),
      ]).then(function (counts) {
        var childFolderCount = counts[0];
        var activeBindingCount = counts[1];
        result.local.childFolderCount = childFolderCount == null ? null : Number(childFolderCount) || 0;
        result.local.activeBindingCount = activeBindingCount == null ? null : Number(activeBindingCount) || 0;
        if (childFolderCount == null || activeBindingCount == null) {
          pushCodeWarning(result.warnings, 'local-folder-diagnostics-unavailable');
        }
        if (Number(childFolderCount) > 0) pushBlocker(result, 'local-folder-has-child-folders');
        return result;
      });
    }).catch(function () {
      result.local.exists = null;
      result.local.hasNewerEdit = null;
      result.local.timestampComparable = null;
      result.local.childFolderCount = null;
      result.local.activeBindingCount = null;
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'local-folder-diagnostics-unavailable');
      return result;
    });
  }

  function applyFolderClassificationBlockers(review, validation, result) {
    var classification = cleanScalar(review && review.classification);
    if (validation && validation.malformed) pushBlocker(result, 'malformed-remote-tombstone');
    if (classification === 'malformed-remote-tombstone') pushBlocker(result, 'malformed-remote-tombstone');
    if (classification === 'unsupported-record-kind') pushBlocker(result, 'unsupported-record-kind');
    if (classification === 'self-originated') pushBlocker(result, 'self-originated');
    if (classification === 'delete-vs-edit') pushBlocker(result, 'local-folder-newer-edit');
    if (classification === 'local-comparison-unavailable') pushBlocker(result, 'local-comparison-unavailable');
  }

  function applyFolderCascadeBlockerDetails(result, rows, review, tombstone) {
    var peer = cleanScalar(review && review.remoteSyncPeerId) ||
      cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
      'unknown-peer';
    var rootRecordId = cascadeRecordId(review, tombstone);
    if (!rootRecordId) return;
    var groups = buildCascadeGroupsForPreview(rows);
    var group = groups[peer + '\u0000' + rootRecordId] || null;
    if (!group) return;
    var children = group.children || [];
    children.forEach(function (child) {
      if (child.deleteVsEdit) pushBlocker(result, 'cascade-child-delete-vs-edit');
      if (child.malformed) pushBlocker(result, 'cascade-child-malformed');
      if (child.unsupported) pushBlocker(result, 'cascade-child-unsupported');
    });
  }

  function previewFolderApply(review, tombstone, validation, result) {
    result.supported = false;
    result.action = 'blocked-folder-apply-deferred';
    result.wouldMutateOnApply = false;
    result.mutationType = null;
    result.local.targetMatches = null;
    result.auditPreview.wouldCreateLocalTombstone = false;
    result.auditPreview.wouldUpdateReviewDecision = false;
    result.auditPreview.wouldRequireOperatorConfirmation = true;
    pushBlocker(result, 'folder-apply-deferred');
    applyFolderClassificationBlockers(review, validation, result);
    (validation.errors || []).concat(validation.warnings || []).forEach(function (warning) {
      pushCodeWarning(result.warnings, warning && warning.code);
    });
    var folderId = parseFolderRecordId(tombstone && tombstone.recordId);
    return readChromeFolderDiagnostics(folderId, tombstone, result)
      .then(function () {
        return readCascadePreviewForFolder(review, tombstone).then(function (cascade) {
          applyFolderCascadePreview(result, cascade);
          return readAllReviewsForCascadeDiagnostics().then(function (rows) {
            applyFolderCascadeBlockerDetails(result, rows, review, tombstone);
            return result;
          }).catch(function () {
            pushCodeWarning(result.warnings, 'cascade-diagnostics-unavailable');
            return result;
          });
        });
      });
  }

  function previewApply(reviewIdInput, options) {
    var opts = options || {};
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) {
      var missingId = makePreviewResult(null);
      missingId.ok = false;
      missingId.reviewFound = false;
      missingId.action = 'blocked-review-not-found';
      pushBlocker(missingId, 'review-not-found');
      return Promise.resolve(missingId);
    }
    return getReview(reviewId).then(function (review) {
      var result = makePreviewResult(review);
      if (!review) {
        result.ok = false;
        result.reviewFound = false;
        result.action = 'blocked-review-not-found';
        pushBlocker(result, 'review-not-found');
        return result;
      }

      var tombstone = parseReviewTombstone(review, result);
      if (!tombstone) return result;

      var kind = cleanScalar(tombstone.recordKind || review.recordKind);
      result.recordKind = kind || null;
      if (kind === 'folderBinding') result.supported = true;
      result.classification = nullableString(review.classification);
      result.status = nullableString(review.status);
      result.auditPreview.remoteTombstoneSourcePresent = !!(cleanScalar(review.remoteTombstoneId) || cleanScalar(tombstone.tombstoneId));
      result.auditPreview.remoteExportSourcePresent = !!cleanScalar(review.remoteExportId);

      var status = cleanScalar(review.status);
      if (status !== 'pending' && status !== 'accepted-later') {
        result.action = 'blocked-review-status-not-previewable';
        pushBlocker(result, 'review-status-not-previewable');
        return result;
      }

      if (kind === 'folder') {
        var folderValidation = validateRemoteTombstone(tombstone, null);
        return previewFolderApply(review, tombstone, folderValidation, result);
      }

      var classification = cleanScalar(review.classification);
      if (classification === 'malformed-remote-tombstone') {
        result.action = 'blocked-malformed-review';
        pushBlocker(result, 'malformed-remote-tombstone');
        return result;
      }
      if (classification === 'unsupported-record-kind') {
        result.action = 'blocked-unsupported-kind';
        pushBlocker(result, 'unsupported-record-kind');
        return result;
      }
      if (classification === 'self-originated') {
        result.action = 'blocked-self-originated';
        pushBlocker(result, 'self-originated');
        return result;
      }
      if (classification === 'delete-vs-edit') {
        result.action = 'blocked-delete-vs-edit';
        pushBlocker(result, 'delete-vs-edit');
        return result;
      }
      if (classification === 'local-comparison-unavailable') {
        result.action = 'blocked-local-comparison-unavailable';
        pushBlocker(result, 'local-comparison-unavailable');
        return result;
      }

      if (kind !== 'folderBinding') {
        result.action = 'blocked-unsupported-kind';
        pushBlocker(result, 'unsupported-record-kind');
        return result;
      }

      var validation = validateRemoteTombstone(tombstone, null);
      if (validation.malformed) {
        result.action = 'blocked-malformed-review';
        pushBlocker(result, 'malformed-remote-tombstone');
        validation.errors.concat(validation.warnings).forEach(function (warning) {
          pushCodeWarning(result.warnings, warning && warning.code);
        });
        return result;
      }

      return readLocalSyncPeerIdForPreview(result).then(function (localPeerId) {
        var remotePeerId = cleanScalar(review.remoteSyncPeerId) || cleanScalar(tombstone.deletedBySyncPeerId);
        if (localPeerId && remotePeerId && localPeerId === remotePeerId) {
          result.action = 'blocked-self-originated';
          pushBlocker(result, 'self-originated');
          return result;
        }
        if (!remotePeerId) pushCodeWarning(result.warnings, 'source-peer-ambiguous');
        return previewFolderBindingApply(review, tombstone, validation, result);
      });
    }).catch(function (e) {
      recordError('previewApply', e);
      var result = makePreviewResult(null);
      result.action = 'blocked-local-comparison-unavailable';
      pushBlocker(result, 'local-comparison-unavailable');
      pushCodeWarning(result.warnings, 'preview-apply-failed');
      return result;
    }).then(function (result) {
      if (opts && opts.includeSensitive === true) {
        pushCodeWarning(result.warnings, 'include-sensitive-ignored');
      }
      return result;
    });
  }

  function applyReview(reviewIdInput, options) {
    var opts = options || {};
    var dryRun = opts && opts.dryRun === true;
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) {
      var missingId = makeApplyDryRunResult(null, dryRun);
      missingId.ok = false;
      missingId.reviewFound = false;
      missingId.action = 'blocked-review-not-found';
      pushBlocker(missingId, 'review-not-found');
      return Promise.resolve(missingId);
    }
    return getReview(reviewId).then(function (review) {
      var result = makeApplyDryRunResult(review, dryRun);
      if (!review) {
        result.ok = false;
        result.reviewFound = false;
        result.action = 'blocked-review-not-found';
        pushBlocker(result, 'review-not-found');
        return result;
      }
      if (!dryRun) {
        result.ok = false;
        result.action = 'blocked-real-apply-not-implemented';
        pushBlocker(result, 'real-apply-not-implemented');
        return result;
      }
      var status = cleanScalar(review.status);
      if (status !== 'pending' && status !== 'accepted-later') {
        result.ok = false;
        result.action = 'blocked-review-status-not-previewable';
        pushBlocker(result, 'review-status-not-previewable');
        return result;
      }
      return previewApply(reviewId, { refreshLocalState: true, includeSensitive: false }).then(function (preview) {
        result.preview = makePreviewSummary(preview);
        mergeCodeWarnings(result.warnings, preview && preview.warnings);
        if (!preview || (Array.isArray(preview.blockers) && preview.blockers.length)) {
          return blockApplyDryRunFromPreview(result, preview, review);
        }
        if (preview.action !== 'would-unbind-folder-binding' && preview.action !== 'no-op-already-missing') {
          pushBlocker(preview, 'unsupported-record-kind');
          return blockApplyDryRunFromPreview(result, preview, review);
        }
        setApplyDryRunPlan(result, preview, review);
        if (opts && opts.includeSensitive === true) {
          pushCodeWarning(result.warnings, 'include-sensitive-ignored');
        }
        return result;
      });
    }).catch(function (e) {
      recordError('applyReview', e);
      var result = makeApplyDryRunResult(null, dryRun);
      result.ok = false;
      result.action = 'blocked-preview';
      pushBlocker(result, 'preview-blocked');
      pushCodeWarning(result.warnings, 'apply-dry-run-failed');
      return result;
    });
  }

  function requireDecisionReason(reason) {
    var value = cleanString(reason);
    if (!value) throw new Error('decision reason required');
    return value;
  }

  function canApplyDecisionTransition(currentStatus, nextStatus) {
    if (currentStatus === 'pending') {
      return nextStatus === 'ignored' ||
        nextStatus === 'rejected' ||
        nextStatus === 'accepted-later' ||
        nextStatus === 'resolved';
    }
    if (currentStatus === 'accepted-later') {
      return nextStatus === 'ignored' ||
        nextStatus === 'rejected' ||
        nextStatus === 'resolved';
    }
    return false;
  }

  function appendDecisionAuditWarning(rawWarnings, decision) {
    var warnings = parseWarnings(rawWarnings);
    warnings.push({
      code: 'decision-reason-recorded',
      action: decision,
      reasonPresent: true,
    });
    return JSON.stringify(warnings);
  }

  function makeDecisionResult(status, decision, decidedAt, peerId) {
    return {
      schema: DECISION_SCHEMA,
      ok: true,
      reviewFound: true,
      status: status,
      decision: decision,
      decidedAt: decidedAt,
      decidedBySyncPeerIdPresent: !!peerId,
      warnings: [],
    };
  }

  function markDecision(reviewIdInput, action, reason) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.reject(new Error('reviewId required'));
    var spec = DECISION_ACTIONS[action];
    if (!spec || !STATUSES[spec.status]) return Promise.reject(new Error('invalid decision action: ' + action));
    try { requireDecisionReason(reason); }
    catch (e) { return Promise.reject(e); }
    return ensureReady()
      .then(function () { return idbGet(reviewId); })
      .then(function (existing) {
        if (!existing) throw new Error('review not found');
        var currentStatus = cleanScalar(existing.status);
        if (!canApplyDecisionTransition(currentStatus, spec.status)) {
          throw new Error('review status not decisionable: ' + (currentStatus || 'unknown'));
        }
        return readLocalSyncPeerIdForDecision().then(function (peerId) {
          var now = nowIso();
          var next = Object.assign({}, existing, {
            status: spec.status,
            decision: spec.decision,
            decidedAt: now,
            decidedBySyncPeerId: peerId,
            warningsJson: appendDecisionAuditWarning(existing.warningsJson || existing.warnings, spec.decision),
            updatedAt: now,
          });
          return idbPut(next).then(function () {
            recordWrite('markDecision');
            notifySubscribers({ source: 'local', op: 'markDecision', reviewId: reviewId, status: spec.status });
            return makeDecisionResult(spec.status, spec.decision, now, peerId);
          });
        });
      })
      .catch(function (e) { recordError('markDecision', e); throw e; });
  }
  function markIgnored(reviewId, reason) { return markDecision(reviewId, 'ignored', reason); }
  function markRejected(reviewId, reason) { return markDecision(reviewId, 'rejected', reason); }
  function markAcceptedLater(reviewId, reason) { return markDecision(reviewId, 'acceptedLater', reason); }
  function markResolved(reviewId, reason) { return markDecision(reviewId, 'resolved', reason); }

  function countMap(rows, keyField) {
    var out = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var key = cleanString(row[keyField]) || 'unknown';
      out[key] = Number(row.total) || 0;
    });
    return out;
  }
  function findCount(map, key) {
    return Number(map && map[key]) || 0;
  }

  function bumpMap(map, key) {
    var k = cleanString(key) || 'unknown';
    map[k] = Number(map[k] || 0) + 1;
  }

  function lifecycleRecommendations() {
    return [
      { code: 'peer-watermarks-required-before-compaction' },
      { code: 'synthetic-cleanup-preview-available-later' },
      { code: 'no-automatic-purge' },
    ];
  }

  function unsupportedChromeLifecycleTombstones() {
    return {
      supported: false,
      reason: 'chrome-local-tombstone-store-not-implemented',
    };
  }

  function makeLifecycleReviewSection() {
    return {
      supported: true,
      available: true,
      ready: true,
      total: 0,
      pending: 0,
      acceptedLater: 0,
      resolved: 0,
      rejected: 0,
      ignored: 0,
      superseded: 0,
      syntheticCandidates: 0,
      purgeBlocked: 0,
      byClassification: {},
      byStatus: {},
      malformedCount: 0,
      unsupportedKindCount: 0,
      deleteVsEditCount: 0,
      cascadeReviewCount: 0,
      oldestReceivedAt: null,
      newestReceivedAt: null,
      warnings: [],
    };
  }

  function unavailableLifecycleReviewSection(code) {
    var section = makeLifecycleReviewSection();
    section.available = false;
    section.ready = false;
    pushCodeWarning(section.warnings, code);
    return section;
  }

  function lifecycleString(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.trim();
    try {
      if (typeof value === 'object') return JSON.stringify(value);
    } catch (_) { /* ignore */ }
    return String(value).trim();
  }

  function lifecycleHasSyntheticMarker(value) {
    var s = lifecycleString(value).toLowerCase();
    if (!s) return false;
    for (var i = 0; i < SYNTHETIC_PREFIXES.length; i += 1) {
      var prefix = SYNTHETIC_PREFIXES[i];
      var encoded = '';
      try { encoded = encodeURIComponent(prefix).toLowerCase(); }
      catch (_) { encoded = prefix; }
      if (s.indexOf(prefix) >= 0 || s.indexOf(encoded) >= 0) return true;
    }
    return false;
  }

  function isSyntheticLifecycleReview(row) {
    return lifecycleHasSyntheticMarker(row && row.reviewId) ||
      lifecycleHasSyntheticMarker(row && row.recordId) ||
      lifecycleHasSyntheticMarker(row && row.deleteReason) ||
      lifecycleHasSyntheticMarker(row && row.rawTombstoneJson) ||
      lifecycleHasSyntheticMarker(row && row.remoteExportId);
  }

  function updateLifecycleRange(section, oldestField, newestField, stateObj, value) {
    var raw = lifecycleString(value);
    if (!raw) return;
    var ms = parseTimeMs(raw);
    if (ms == null) return;
    if (stateObj.oldestMs == null || ms < stateObj.oldestMs) {
      stateObj.oldestMs = ms;
      section[oldestField] = raw;
    }
    if (stateObj.newestMs == null || ms > stateObj.newestMs) {
      stateObj.newestMs = ms;
      section[newestField] = raw;
    }
  }

  function buildLifecycleReviewSection(rows) {
    var section = makeLifecycleReviewSection();
    var range = {};
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var status = cleanScalar(row && row.status) || 'unknown';
      var classification = cleanScalar(row && row.classification) || 'unknown';
      section.total += 1;
      bumpMap(section.byStatus, status);
      bumpMap(section.byClassification, classification);
      if (status === 'pending') section.pending += 1;
      if (status === 'accepted-later') section.acceptedLater += 1;
      if (status === 'resolved') section.resolved += 1;
      if (status === 'rejected') section.rejected += 1;
      if (status === 'ignored') section.ignored += 1;
      if (status === 'superseded') section.superseded += 1;
      if (classification === 'malformed-remote-tombstone') section.malformedCount += 1;
      if (classification === 'unsupported-record-kind') section.unsupportedKindCount += 1;
      if (classification === 'delete-vs-edit') section.deleteVsEditCount += 1;
      if (classification === 'cascade-review') section.cascadeReviewCount += 1;
      if (isSyntheticLifecycleReview(row)) section.syntheticCandidates += 1;
      updateLifecycleRange(section, 'oldestReceivedAt', 'newestReceivedAt', range, row && (row.receivedAt || row.createdAt));
    });
    section.purgeBlocked = section.total;
    return section;
  }

  function diagnoseLifecycle() {
    if (!global.indexedDB) {
      return Promise.resolve({
        schema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
        generatedAt: nowIso(),
        redacted: true,
        platform: 'chrome-mv3',
        tombstones: unsupportedChromeLifecycleTombstones(),
        reviews: unavailableLifecycleReviewSection('indexeddb-unavailable'),
        watermarks: {
          supported: false,
          reason: 'peer-watermarks-not-implemented',
        },
        recommendations: lifecycleRecommendations(),
      });
    }
    return ensureReady()
      .then(function () { return idbGetAll(); })
      .then(function (rows) {
        return {
          schema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
          generatedAt: nowIso(),
          redacted: true,
          platform: 'chrome-mv3',
          tombstones: unsupportedChromeLifecycleTombstones(),
          reviews: buildLifecycleReviewSection(rows),
          watermarks: {
            supported: false,
            reason: 'peer-watermarks-not-implemented',
          },
          recommendations: lifecycleRecommendations(),
        };
      })
      .catch(function (e) {
        recordError('diagnoseLifecycle', e);
        return {
          schema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
          generatedAt: nowIso(),
          redacted: true,
          platform: 'chrome-mv3',
          tombstones: unsupportedChromeLifecycleTombstones(),
          reviews: unavailableLifecycleReviewSection('lifecycle-review-diagnostics-failed'),
          watermarks: {
            supported: false,
            reason: 'peer-watermarks-not-implemented',
          },
          recommendations: lifecycleRecommendations(),
        };
      });
  }

  function readAllReviewsForCascadeDiagnostics() {
    return ensureReady()
      .then(function () {
        return idbGetAll().then(function (rows) {
          return (Array.isArray(rows) ? rows : []).sort(function (a, b) {
            var ak = [
              cleanScalar(a && a.remoteSyncPeerId),
              cleanScalar(a && a.recordId),
              cleanScalar(a && a.reviewId),
            ].join('\u0000');
            var bk = [
              cleanScalar(b && b.remoteSyncPeerId),
              cleanScalar(b && b.recordId),
              cleanScalar(b && b.reviewId),
            ].join('\u0000');
            if (ak < bk) return -1;
            if (ak > bk) return 1;
            return 0;
          });
        });
      });
  }

  function parseCascadeTombstone(review, warnings) {
    var raw = review && review.rawTombstoneJson;
    if (!raw) {
      pushCodeWarning(warnings, 'cascade-raw-tombstone-unavailable');
      return null;
    }
    try {
      var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!isObject(parsed)) throw new Error('raw tombstone not object');
      return parsed;
    } catch (_) {
      pushCodeWarning(warnings, 'cascade-raw-tombstone-unparseable');
      return null;
    }
  }

  function cascadeMeta(tombstone) {
    return isObject(tombstone && tombstone.meta) ? tombstone.meta : null;
  }

  function cascadeKind(review, tombstone) {
    return cleanScalar(tombstone && tombstone.recordKind) || cleanScalar(review && review.recordKind);
  }

  function cascadeDeleteReason(review, tombstone) {
    return cleanScalar(tombstone && tombstone.deleteReason) || cleanScalar(review && review.deleteReason);
  }

  function cascadeRecordId(review, tombstone) {
    return cleanScalar(tombstone && tombstone.recordId) || cleanScalar(review && review.recordId);
  }

  function encodeCascadePart(value) {
    var s = cleanScalar(value);
    try { return encodeURIComponent(s); }
    catch (_) { return s; }
  }

  function cascadeFolderRecordId(folderId) {
    var id = cleanScalar(folderId);
    return id ? ('folder:' + encodeCascadePart(id)) : '';
  }

  function inferCascadeRootRecordId(review, tombstone, meta) {
    var explicit = cleanScalar(tombstone && tombstone.cascadeFrom);
    if (explicit) return explicit;
    var kind = cascadeKind(review, tombstone);
    if (kind === 'folder') return cascadeRecordId(review, tombstone);
    if (kind === 'folderBinding') {
      var folderId = cleanScalar(meta && (meta.folderId || meta.oldFolderId));
      if (folderId) return cascadeFolderRecordId(folderId);
      var ids = parseFolderBindingIds(tombstone || { recordId: cascadeRecordId(review, tombstone) }, meta);
      if (ids && ids.folderId) return cascadeFolderRecordId(ids.folderId);
    }
    return '';
  }

  function isCascadeRootReview(review, tombstone, meta) {
    var kind = cascadeKind(review, tombstone);
    var reason = cascadeDeleteReason(review, tombstone);
    return kind === 'folder' &&
      !cleanScalar(tombstone && tombstone.cascadeFrom) &&
      !/-cascade$/.test(reason) &&
      ((meta && meta.cascade === true) || reason === 'folder-delete');
  }

  function isCascadeChildReview(review, tombstone, meta) {
    var kind = cascadeKind(review, tombstone);
    var reason = cascadeDeleteReason(review, tombstone);
    return !!(
      cleanScalar(tombstone && tombstone.cascadeFrom) ||
      /-cascade$/.test(reason) ||
      (meta && meta.cascade === true && BINDING_TOMBSTONE_KINDS[kind]) ||
      (meta && cleanScalar(meta.cascadeKind))
    );
  }

  function makeCascadeMember(review, tombstone, meta, rootRecordId) {
    var classification = cleanScalar(review && review.classification);
    var status = cleanScalar(review && review.status);
    var kind = cascadeKind(review, tombstone);
    return {
      memberKey: cleanScalar(review && review.dedupeKey) ||
        cleanScalar(review && review.remoteTombstoneId) ||
        cleanScalar(review && review.reviewId),
      kind: kind,
      status: status,
      classification: classification,
      decision: cleanScalar(review && review.decision),
      rootRecordId: cleanScalar(rootRecordId),
      cascadeFrom: cleanScalar(tombstone && tombstone.cascadeFrom),
      seenCount: Number(review && review.seenCount) || 1,
      exportPresent: !!cleanScalar(review && review.remoteExportId),
      malformed: classification === 'malformed-remote-tombstone',
      unsupported: classification === 'unsupported-record-kind' || !KNOWN_TOMBSTONE_KINDS[kind],
      deleteVsEdit: classification === 'delete-vs-edit',
      localComparisonUnavailable: classification === 'local-comparison-unavailable',
      applied: status === 'resolved' && cleanScalar(review && review.decision) === 'applied-folder-binding',
      applyCandidate: kind === 'folderBinding' &&
        status === 'accepted-later' &&
        (classification === 'safe-review' || classification === 'cascade-review'),
      reviewWarnings: parseWarnings(review && (review.warningsJson || review.warnings)).map(function (warning) {
        return cleanScalar(warning && warning.code);
      }).filter(Boolean),
      metaCascadeKindPresent: !!(meta && cleanScalar(meta.cascadeKind)),
    };
  }

  function ensureCascadeGroup(groups, key) {
    if (!groups[key]) {
      groups[key] = {
        key: key,
        root: null,
        children: [],
        memberKeys: {},
      };
    }
    return groups[key];
  }

  function addCascadeMemberOnce(group, bucket, member) {
    var fallbackIndex = bucket === 'children' ? group.children.length : (group.root ? 1 : 0);
    var key = cleanScalar(member && member.memberKey) || (bucket + ':' + fallbackIndex);
    if (group.memberKeys[bucket + ':' + key]) return;
    group.memberKeys[bucket + ':' + key] = true;
    if (bucket === 'root') {
      if (!group.root) group.root = member;
      return;
    }
    group.children.push(member);
  }

  function addCascadeGroupWarning(warnings, code) {
    pushCodeWarning(warnings, code);
  }

  function summarizeCascadeGroup(group, index) {
    var root = group.root || null;
    var children = group.children || [];
    var warnings = [];
    var pendingChildCount = 0;
    var acceptedLaterChildCount = 0;
    var resolvedChildCount = 0;
    var rejectedChildCount = 0;
    var ignoredChildCount = 0;
    var supersededChildCount = 0;
    var appliedChildCount = 0;
    var hasDeleteVsEditChild = false;
    var hasUnsupportedChild = false;
    var hasMalformedChild = false;
    var childApplyCandidates = 0;
    var blockedChildCount = 0;

    children.forEach(function (child) {
      var status = cleanScalar(child.status) || 'unknown';
      if (status === 'pending') pendingChildCount += 1;
      if (status === 'accepted-later') acceptedLaterChildCount += 1;
      if (status === 'resolved') resolvedChildCount += 1;
      if (status === 'rejected') rejectedChildCount += 1;
      if (status === 'ignored') ignoredChildCount += 1;
      if (status === 'superseded') supersededChildCount += 1;
      if (child.applied) appliedChildCount += 1;
      if (child.deleteVsEdit) hasDeleteVsEditChild = true;
      if (child.unsupported) hasUnsupportedChild = true;
      if (child.malformed) hasMalformedChild = true;
      if (child.applyCandidate) childApplyCandidates += 1;
      if (
        child.deleteVsEdit ||
        child.localComparisonUnavailable ||
        child.unsupported ||
        child.malformed ||
        status === 'rejected' ||
        status === 'ignored' ||
        status === 'superseded'
      ) {
        blockedChildCount += 1;
      }
    });

    var rootStatus = cleanScalar(root && root.status) || null;
    if (!root) addCascadeGroupWarning(warnings, 'cascade-root-missing');
    if (root && children.length === 0) addCascadeGroupWarning(warnings, 'cascade-root-only');
    if (root && root.kind && root.kind !== 'folder') addCascadeGroupWarning(warnings, 'cascade-root-kind-unsupported');
    if (rootStatus === 'rejected' && (pendingChildCount + acceptedLaterChildCount) > 0) {
      addCascadeGroupWarning(warnings, 'cascade-root-rejected-with-pending-children');
    }
    if (rootStatus === 'pending' && resolvedChildCount > 0) {
      addCascadeGroupWarning(warnings, 'cascade-parent-pending-with-resolved-children');
    }
    if (hasDeleteVsEditChild) addCascadeGroupWarning(warnings, 'cascade-child-delete-vs-edit');
    if (hasMalformedChild) addCascadeGroupWarning(warnings, 'cascade-child-malformed');
    if (hasUnsupportedChild) addCascadeGroupWarning(warnings, 'cascade-child-unsupported');
    if (!root || children.length === 0) addCascadeGroupWarning(warnings, 'cascade-incomplete-review-set');

    return {
      groupRef: 'cascade-group-' + String(index + 1).padStart(3, '0'),
      rootKind: nullableString(root && root.kind),
      rootPresent: !!root,
      rootStatus: nullableString(rootStatus),
      rootClassification: nullableString(root && root.classification),
      childCount: children.length,
      pendingChildCount: pendingChildCount,
      acceptedLaterChildCount: acceptedLaterChildCount,
      resolvedChildCount: resolvedChildCount,
      rejectedChildCount: rejectedChildCount,
      ignoredChildCount: ignoredChildCount,
      supersededChildCount: supersededChildCount,
      appliedChildCount: appliedChildCount,
      missingParent: !root,
      hasDeleteVsEditChild: hasDeleteVsEditChild,
      hasUnsupportedChild: hasUnsupportedChild,
      hasMalformedChild: hasMalformedChild,
      childApplyCandidates: childApplyCandidates,
      applyEligibleChildCount: childApplyCandidates,
      blockedChildCount: blockedChildCount,
      warnings: warnings,
    };
  }

  function buildCascadeDiagnostics(rows, options) {
    var opts = options || {};
    var groups = {};
    var warnings = [];
    (Array.isArray(rows) ? rows : []).forEach(function (review, index) {
      var rowWarnings = [];
      var tombstone = parseCascadeTombstone(review, rowWarnings);
      var meta = cascadeMeta(tombstone);
      var root = isCascadeRootReview(review, tombstone, meta);
      var child = isCascadeChildReview(review, tombstone, meta);
      if (!root && !child) return;
      var peer = cleanScalar(review && review.remoteSyncPeerId) ||
        cleanScalar(tombstone && tombstone.deletedBySyncPeerId) ||
        'unknown-peer';
      var rootRecordId = root
        ? cascadeRecordId(review, tombstone)
        : inferCascadeRootRecordId(review, tombstone, meta);
      if (!rootRecordId) {
        rootRecordId = 'unknown-root:' + (cleanScalar(review && review.dedupeKey) || cleanScalar(review && review.reviewId) || String(index));
        pushCodeWarning(rowWarnings, 'cascade-root-missing');
      }
      var group = ensureCascadeGroup(groups, peer + '\u0000' + rootRecordId);
      var member = makeCascadeMember(review, tombstone, meta, rootRecordId);
      rowWarnings.concat(member.reviewWarnings || []).forEach(function (code) {
        if (code === 'missing-cascade-parent') addCascadeGroupWarning(warnings, 'cascade-root-missing');
      });
      if (root) addCascadeMemberOnce(group, 'root', member);
      if (child) addCascadeMemberOnce(group, 'children', member);
    });

    var keys = Object.keys(groups).sort();
    var groupSummaries = keys.map(function (key, index) {
      return summarizeCascadeGroup(groups[key], index);
    });
    var groupsByRootKind = {};
    var groupsByStatus = {};
    var completeGroups = 0;
    var orphanChildGroups = 0;
    var rootOnlyGroups = 0;
    groupSummaries.forEach(function (group) {
      if (group.rootPresent && group.childCount > 0) completeGroups += 1;
      if (!group.rootPresent) orphanChildGroups += 1;
      if (group.rootPresent && group.childCount === 0) rootOnlyGroups += 1;
      bumpMap(groupsByRootKind, group.rootKind || 'missing-root');
      bumpMap(groupsByStatus, group.rootStatus || (group.rootPresent ? 'unknown' : 'orphan'));
    });
    if (opts && opts.includeSensitive === true) {
      pushCodeWarning(warnings, 'include-sensitive-ignored');
    }
    return {
      schema: CASCADE_DIAGNOSTIC_SCHEMA,
      generatedAt: nowIso(),
      redacted: true,
      totalGroups: groupSummaries.length,
      completeGroups: completeGroups,
      partialGroups: groupSummaries.length - completeGroups,
      orphanChildGroups: orphanChildGroups,
      rootOnlyGroups: rootOnlyGroups,
      groupsByRootKind: groupsByRootKind,
      groupsByStatus: groupsByStatus,
      folderApplyDeferred: true,
      cascadeApplyImplemented: false,
      groups: groupSummaries,
      warnings: warnings,
    };
  }

  function diagnoseCascadeGroups(options) {
    if (!global.indexedDB) {
      return Promise.resolve({
        schema: CASCADE_DIAGNOSTIC_SCHEMA,
        generatedAt: nowIso(),
        redacted: true,
        totalGroups: 0,
        completeGroups: 0,
        partialGroups: 0,
        orphanChildGroups: 0,
        rootOnlyGroups: 0,
        groupsByRootKind: {},
        groupsByStatus: {},
        folderApplyDeferred: true,
        cascadeApplyImplemented: false,
        groups: [],
        warnings: [{ code: 'indexeddb-unavailable' }],
      });
    }
    return readAllReviewsForCascadeDiagnostics()
      .then(function (rows) { return buildCascadeDiagnostics(rows, options); })
      .catch(function (e) {
        recordError('diagnoseCascadeGroups', e);
        return {
          schema: CASCADE_DIAGNOSTIC_SCHEMA,
          generatedAt: nowIso(),
          redacted: true,
          totalGroups: 0,
          completeGroups: 0,
          partialGroups: 0,
          orphanChildGroups: 0,
          rootOnlyGroups: 0,
          groupsByRootKind: {},
          groupsByStatus: {},
          folderApplyDeferred: true,
          cascadeApplyImplemented: false,
          groups: [],
          warnings: [{ code: 'cascade-diagnostics-failed' }],
        };
      });
  }

  function diagnose(options) {
    var includeSensitive = !!(options && options.includeSensitive);
    if (!global.indexedDB) {
      return Promise.resolve({
        schema: DIAGNOSTIC_SCHEMA,
        installed: true,
        ready: false,
        generatedAt: nowIso(),
        schemaVersion: SCHEMA_VERSION,
        reviewSchema: REVIEW_SCHEMA,
        backend: 'indexeddb',
        dbName: DB_NAME,
        dbVersion: DB_VERSION,
        storeName: STORE_NAME,
        redacted: !includeSensitive,
        total: 0,
        pending: 0,
        byClassification: [],
        byStatus: [],
        malformedCount: 0,
        selfOriginatedIgnoredCount: 0,
        duplicateCount: 0,
        cascadeReviewCount: 0,
        deleteVsEditCount: 0,
        unsupportedKindCount: 0,
        initError: 'indexedDB unavailable',
        warnings: [{ code: 'indexeddb-unavailable' }],
      });
    }
    return ensureReady()
      .then(function () {
        return Promise.all([idbGetAll(), countByClassification(), countByStatus()]);
      })
      .then(function (parts) {
        var rows = parts[0] || [];
        var byClassificationRows = parts[1] || [];
        var byStatusRows = parts[2] || [];
        var byClassification = countMap(byClassificationRows, 'classification');
        var byStatus = countMap(byStatusRows, 'status');
        return {
          schema: DIAGNOSTIC_SCHEMA,
          installed: true,
          ready: state.ready,
          generatedAt: nowIso(),
          schemaVersion: SCHEMA_VERSION,
          reviewSchema: REVIEW_SCHEMA,
          backend: 'indexeddb',
          dbName: DB_NAME,
          dbVersion: DB_VERSION,
          storeName: STORE_NAME,
          redacted: !includeSensitive,
          total: rows.length,
          pending: findCount(byStatus, 'pending'),
          byClassification: byClassificationRows,
          byStatus: byStatusRows,
          malformedCount: findCount(byClassification, 'malformed-remote-tombstone'),
          selfOriginatedIgnoredCount: findCount(byClassification, 'self-originated'),
          duplicateCount: findCount(byClassification, 'duplicate-remote-tombstone'),
          cascadeReviewCount: findCount(byClassification, 'cascade-review'),
          deleteVsEditCount: findCount(byClassification, 'delete-vs-edit'),
          unsupportedKindCount: findCount(byClassification, 'unsupported-record-kind'),
          lastReloadedAt: state.lastReloadedAt,
          lastWriteAt: state.lastWriteAt,
          writesSinceBoot: state.writesSinceBoot,
          subscribers: state.subscribers.size,
          initError: state.initError,
          warnings: state.warnings.slice(),
        };
      })
      .catch(function (e) {
        recordError('diagnose', e);
        return {
          schema: DIAGNOSTIC_SCHEMA,
          installed: true,
          ready: state.ready,
          generatedAt: nowIso(),
          schemaVersion: SCHEMA_VERSION,
          reviewSchema: REVIEW_SCHEMA,
          backend: 'indexeddb',
          dbName: DB_NAME,
          dbVersion: DB_VERSION,
          storeName: STORE_NAME,
          redacted: !includeSensitive,
          total: 0,
          pending: 0,
          byClassification: [],
          byStatus: [],
          malformedCount: 0,
          selfOriginatedIgnoredCount: 0,
          duplicateCount: 0,
          cascadeReviewCount: 0,
          deleteVsEditCount: 0,
          unsupportedKindCount: 0,
          initError: state.initError || String((e && e.message) || e),
          warnings: state.warnings.concat([{ code: 'diagnose-failed' }]),
        };
      });
  }

  var api = {
    __installed: true,
    __version: '0.1.0-f5h.1',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: getAll,
    list: listReviews,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    createReview: createReview,
    upsertReviewSighting: upsertReviewSighting,
    getReview: getReview,
    getByDedupeKey: getByDedupeKey,
    listReviews: listReviews,
    countByClassification: countByClassification,
    countByStatus: countByStatus,
    markIgnored: markIgnored,
    markRejected: markRejected,
    markAcceptedLater: markAcceptedLater,
    markResolved: markResolved,
    ingestBundleTombstones: ingestBundleTombstones,
    previewApply: previewApply,
    applyReview: applyReview,
    diagnose: diagnose,
    diagnoseCascadeGroups: diagnoseCascadeGroups,
    diagnoseLifecycle: diagnoseLifecycle,
    validateReview: validateReview,
    buildDedupeKey: buildDedupeKey,
    constants: Object.freeze({
      schema: REVIEW_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
      cascadeDiagnosticSchema: CASCADE_DIAGNOSTIC_SCHEMA,
      lifecycleDiagnosticSchema: LIFECYCLE_DIAGNOSTIC_SCHEMA,
      ingestSchema: INGEST_SCHEMA,
      previewSchema: PREVIEW_SCHEMA,
      decisionSchema: DECISION_SCHEMA,
      applyDryRunSchema: APPLY_DRY_RUN_SCHEMA,
      tombstoneSchema: TOMBSTONE_SCHEMA,
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      storeName: STORE_NAME,
      backend: 'indexeddb',
      classifications: Object.freeze(Object.keys(CLASSIFICATIONS).slice()),
      statuses: Object.freeze(Object.keys(STATUSES).slice()),
    }),
  };
  store.__registerEntity('tombstoneReviews', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
