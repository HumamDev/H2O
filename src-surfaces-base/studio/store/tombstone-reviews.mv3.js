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
  var INGEST_SCHEMA = 'h2o.studio.tombstone-review-ingest.v1';
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var DEFAULT_LIST_LIMIT = 100;
  var MAX_LIST_LIMIT = 1000;

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

  function classifyRemoteTombstone(tombstone, validation) {
    if (validation.malformed) {
      return {
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.errors.concat(validation.warnings),
      };
    }
    if (validation.unsupported) {
      return {
        classification: 'unsupported-record-kind',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.warnings.slice(),
      };
    }
    if (validation.cascadeRelated) {
      return {
        classification: 'cascade-review',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.warnings.slice(),
      };
    }
    return {
      classification: 'local-comparison-unavailable',
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      warnings: validation.warnings.slice(),
    };
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
    var classification = classifyRemoteTombstone(tombstone, validation);
    var row = isObject(tombstone) ? tombstone : {};
    var reviewRecord = null;
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
      return Promise.resolve(null);
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

  function markStatus(reviewIdInput, status, reason) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.reject(new Error('reviewId required'));
    var nextStatus = cleanString(status);
    if (!STATUSES[nextStatus]) return Promise.reject(new Error('invalid status: ' + nextStatus));
    return ensureReady()
      .then(function () { return idbGet(reviewId); })
      .then(function (existing) {
        if (!existing) return null;
        var now = nowIso();
        var next = Object.assign({}, existing, {
          status: nextStatus,
          decision: nullableString(reason),
          decidedAt: now,
          updatedAt: now,
        });
        return idbPut(next).then(function () {
          recordWrite('markStatus');
          notifySubscribers({ source: 'local', op: 'markStatus', reviewId: reviewId, status: nextStatus });
          return getReview(reviewId);
        });
      })
      .catch(function (e) { recordError('markStatus', e); throw e; });
  }
  function markIgnored(reviewId, reason) { return markStatus(reviewId, 'ignored', reason); }
  function markRejected(reviewId, reason) { return markStatus(reviewId, 'rejected', reason); }

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
    __version: '0.1.0-f5f.4d',
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
    ingestBundleTombstones: ingestBundleTombstones,
    diagnose: diagnose,
    validateReview: validateReview,
    buildDedupeKey: buildDedupeKey,
    constants: Object.freeze({
      schema: REVIEW_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
      ingestSchema: INGEST_SCHEMA,
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
