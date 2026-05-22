/* H2O Studio Store - Tombstone Reviews (Desktop / Tauri SQLite)
 *
 * F5F.0/F5F.1 - inert local review-store scaffold for future remote
 * tombstone review. This module does not ingest bundles automatically,
 * apply remote tombstones, delete Library records, or mutate entity stores.
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
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
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  var store = H2O.Studio.store;
  if (!store || typeof store.__registerEntity !== 'function') {
    try { console.warn('[H2O.Studio.store.tombstoneReviews] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.tombstoneReviews && store.tombstoneReviews.__installed) return;

  var DB_URL = 'sqlite:studio-v1.db';
  var TABLE = 'sync_tombstone_reviews';
  var SCHEMA_VERSION = 1;
  var REVIEW_SCHEMA = 'h2o.studio.tombstone-review.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.studio.tombstone-review.diagnostic.v1';
  var INGEST_SCHEMA = 'h2o.studio.tombstone-review-ingest.v1';
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
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
  var SUPPORTED_INGEST_KINDS = {
    folder: true,
    folderBinding: true,
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

  var COL_TO_FIELD = {
    review_id: 'reviewId',
    schema: 'schema',
    remote_tombstone_id: 'remoteTombstoneId',
    remote_sync_peer_id: 'remoteSyncPeerId',
    remote_export_id: 'remoteExportId',
    remote_sequence_number: 'remoteSequenceNumber',
    record_kind: 'recordKind',
    record_id: 'recordId',
    delete_reason: 'deleteReason',
    remote_deleted_at: 'remoteDeletedAt',
    received_at: 'receivedAt',
    first_seen_at: 'firstSeenAt',
    last_seen_at: 'lastSeenAt',
    seen_count: 'seenCount',
    last_seen_export_id: 'lastSeenExportId',
    local_record_exists: 'localRecordExists',
    local_record_digest: 'localRecordDigest',
    local_updated_at: 'localUpdatedAt',
    local_has_newer_edit: 'localHasNewerEdit',
    classification: 'classification',
    status: 'status',
    decision: 'decision',
    decided_at: 'decidedAt',
    decided_by_sync_peer_id: 'decidedBySyncPeerId',
    dedupe_key: 'dedupeKey',
    raw_tombstone_json: 'rawTombstoneJson',
    warnings_json: 'warnings',
    created_at: 'createdAt',
    updated_at: 'updatedAt',
  };

  var state = {
    ready: false,
    initError: null,
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
  function recordWarning(msg) {
    try {
      state.warnings.push({ t: Date.now(), msg: String(msg) });
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

  function getInvoke() {
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') return internals.invoke.bind(internals);
    } catch (_) { /* ignore */ }
    try {
      var tauri = global.__TAURI__;
      if (tauri && tauri.core && typeof tauri.core.invoke === 'function') return tauri.core.invoke.bind(tauri.core);
      if (tauri && typeof tauri.invoke === 'function') return tauri.invoke.bind(tauri);
    } catch (_) { /* ignore */ }
    return null;
  }
  function sqlSelect(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|select', { db: DB_URL, query: query, values: values || [] });
  }
  function sqlExecute(query, values) {
    var invoke = getInvoke();
    if (!invoke) return Promise.reject(new Error('tauri invoke unavailable'));
    return invoke('plugin:sql|execute', { db: DB_URL, query: query, values: values || [] });
  }
  function readRowsAffected(result) {
    if (Array.isArray(result)) return Number(result[0]) || 0;
    if (result && typeof result === 'object') {
      if (result.rowsAffected != null) return Number(result.rowsAffected) || 0;
      if (result.rows_affected != null) return Number(result.rows_affected) || 0;
      if (result.affected != null) return Number(result.affected) || 0;
    }
    if (typeof result === 'number') return result;
    return 0;
  }

  function waitForSqlite() {
    return new Promise(function (resolve) {
      var tries = 0;
      function check() {
        var platform = global.H2O && global.H2O.Studio && global.H2O.Studio.platform;
        if (platform && typeof platform.__sqliteStatus === 'function') {
          var s = null;
          try { s = platform.__sqliteStatus(); }
          catch (_) { s = null; }
          if (s && s.backend === 'sqlite' && s.ready === true) { resolve(true); return; }
        }
        tries += 1;
        if (tries >= READY_POLL_MAX_TRIES) { resolve(false); return; }
        global.setTimeout(check, READY_POLL_INTERVAL_MS);
      }
      check();
    });
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function cleanScalar(value) {
    if (value == null) return '';
    return String(value).trim();
  }
  function isObject(value) {
    return !!(value && typeof value === 'object' && !Array.isArray(value));
  }
  function nullableString(value) {
    var s = cleanScalar(value);
    return s || null;
  }
  function nowIso() {
    return new Date().toISOString();
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
  function hasOwn(input, key) {
    return Object.prototype.hasOwnProperty.call(Object(input), key);
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
  function bumpCounter(map, key, amount) {
    var k = cleanScalar(key) || 'unknown';
    map[k] = Number(map[k] || 0) + (amount == null ? 1 : Number(amount));
  }
  function dbBool(value) {
    if (value == null || value === '') return null;
    return Number(value) ? true : false;
  }
  function boolToDb(value) {
    if (value == null || value === '') return null;
    return value ? 1 : 0;
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

  function rowToJs(row) {
    if (!row || typeof row !== 'object') return null;
    var out = {};
    Object.keys(COL_TO_FIELD).forEach(function (col) {
      var field = COL_TO_FIELD[col];
      var value = row[col];
      if (col === 'warnings_json') {
        out.warnings = parseWarnings(value);
        out.warningsJson = value == null ? '[]' : String(value);
      } else if (col === 'remote_sequence_number' || col === 'seen_count') {
        out[field] = value == null ? null : Number(value);
      } else if (col === 'local_record_exists' || col === 'local_has_newer_edit') {
        out[field] = dbBool(value);
      } else {
        out[field] = value == null ? null : value;
      }
    });
    return out;
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
      localRecordExists: boolToDb(readField(r, 'localRecordExists', 'local_record_exists')),
      localRecordDigest: nullableString(readField(r, 'localRecordDigest', 'local_record_digest')),
      localUpdatedAt: nullableString(readField(r, 'localUpdatedAt', 'local_updated_at')),
      localHasNewerEdit: boolToDb(readField(r, 'localHasNewerEdit', 'local_has_newer_edit')),
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

  function buildWhere(filters) {
    var f = filters || {};
    var where = [];
    var values = [];
    function pushString(field, col) {
      var value = cleanString(f[field]);
      if (value) { where.push(col + ' = ?'); values.push(value); }
    }
    pushString('reviewId', 'review_id');
    pushString('dedupeKey', 'dedupe_key');
    pushString('status', 'status');
    pushString('classification', 'classification');
    pushString('recordKind', 'record_kind');
    pushString('recordId', 'record_id');
    pushString('remoteSyncPeerId', 'remote_sync_peer_id');
    pushString('remoteExportId', 'remote_export_id');
    pushString('remoteTombstoneId', 'remote_tombstone_id');
    return { sql: where.length ? (' WHERE ' + where.join(' AND ')) : '', values: values };
  }
  function readLimit(filters) {
    var raw = Number(filters && filters.limit);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
  }

  function countRows(filters) {
    var w = buildWhere(filters);
    return sqlSelect('SELECT COUNT(*) AS n FROM ' + TABLE + w.sql, w.values)
      .then(function (rows) {
        return Array.isArray(rows) && rows.length ? Number(rows[0].n) || 0 : 0;
      });
  }

  function init() {
    if (state.ready) return Promise.resolve({ rowCount: 0 });
    return waitForSqlite().then(function (ok) {
      if (!ok) {
        state.initError = 'sqlite did not become ready in time';
        recordError('init', new Error(state.initError));
        return { rowCount: 0 };
      }
      state.ready = true;
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
      if (!state.ready) throw new Error(state.initError || 'tombstone review store not ready');
    });
  }
  function dispose() { state.ready = false; }
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

  function getReview(reviewIdInput) {
    var reviewId = cleanString(reviewIdInput);
    if (!reviewId) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect('SELECT * FROM ' + TABLE + ' WHERE review_id = ? LIMIT 1', [reviewId]);
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getReview', e); return null; });
  }

  function getByDedupeKey(dedupeKeyInput) {
    var dedupeKey = cleanString(dedupeKeyInput);
    if (!dedupeKey) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect('SELECT * FROM ' + TABLE + ' WHERE dedupe_key = ? LIMIT 1', [dedupeKey]);
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getByDedupeKey', e); return null; });
  }

  function listReviews(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        var limit = readLimit(filters);
        return sqlSelect(
          'SELECT * FROM ' + TABLE + w.sql + ' ORDER BY received_at DESC, created_at DESC LIMIT ?',
          w.values.concat([limit])
        );
      })
      .then(function (rows) { return Array.isArray(rows) ? rows.map(rowToJs).filter(Boolean) : []; })
      .catch(function (e) { recordError('listReviews', e); return []; });
  }

  function getAll() { return listReviews(); }

  function countByClassification(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        return sqlSelect(
          'SELECT classification AS classification, COUNT(*) AS total FROM ' + TABLE +
          w.sql + ' GROUP BY classification ORDER BY classification ASC',
          w.values
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(function (r) {
          return { classification: cleanString(r.classification), total: Number(r.total) || 0 };
        });
      })
      .catch(function (e) { recordError('countByClassification', e); return []; });
  }

  function countByStatus(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        return sqlSelect(
          'SELECT status AS status, COUNT(*) AS total FROM ' + TABLE +
          w.sql + ' GROUP BY status ORDER BY status ASC',
          w.values
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(function (r) {
          return { status: cleanString(r.status), total: Number(r.total) || 0 };
        });
      })
      .catch(function (e) { recordError('countByStatus', e); return []; });
  }

  function createReview(record) {
    return ensureReady()
      .then(function () {
        var r = normalizeForCreate(record);
        return sqlExecute(
          'INSERT INTO ' + TABLE + ' (' +
            'review_id, schema, remote_tombstone_id, remote_sync_peer_id, remote_export_id, remote_sequence_number, ' +
            'record_kind, record_id, delete_reason, remote_deleted_at, received_at, first_seen_at, last_seen_at, ' +
            'seen_count, last_seen_export_id, local_record_exists, local_record_digest, local_updated_at, ' +
            'local_has_newer_edit, classification, status, decision, decided_at, decided_by_sync_peer_id, ' +
            'dedupe_key, raw_tombstone_json, warnings_json, created_at, updated_at' +
          ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            r.reviewId, r.schema, r.remoteTombstoneId, r.remoteSyncPeerId, r.remoteExportId, r.remoteSequenceNumber,
            r.recordKind, r.recordId, r.deleteReason, r.remoteDeletedAt, r.receivedAt, r.firstSeenAt, r.lastSeenAt,
            r.seenCount, r.lastSeenExportId, r.localRecordExists, r.localRecordDigest, r.localUpdatedAt,
            r.localHasNewerEdit, r.classification, r.status, r.decision, r.decidedAt, r.decidedBySyncPeerId,
            r.dedupeKey, r.rawTombstoneJson, r.warningsJson, r.createdAt, r.updatedAt,
          ]
        ).then(function () {
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
          nullableString(readField(record, 'remoteExportId', 'remote_export_id'));
        return sqlExecute(
          'UPDATE ' + TABLE + ' SET last_seen_at = ?, seen_count = seen_count + 1, ' +
          'last_seen_export_id = ?, updated_at = ? WHERE dedupe_key = ?',
          [now, lastSeenExportId, now, dedupeKey]
        ).then(function () {
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
      dryRun: opts.dryRun === true,
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

  function decodePart(value) {
    var s = cleanScalar(value);
    if (!s) return '';
    try { return decodeURIComponent(s); }
    catch (_) { return s; }
  }

  function parseFolderIdFromRecordId(recordId) {
    var s = cleanScalar(recordId);
    if (!s) return '';
    if (s.indexOf('folder:') === 0) return decodePart(s.slice('folder:'.length));
    return s;
  }

  function parseFolderBindingIds(tombstone, metaObject) {
    var meta = metaObject || {};
    var chatId = cleanScalar(meta.chatId);
    var folderId = cleanScalar(meta.folderId || meta.oldFolderId);
    if (chatId && folderId) return { chatId: chatId, folderId: folderId, ok: true };
    var recordId = cleanScalar(tombstone && tombstone.recordId);
    var prefix = 'folderBinding:';
    if (recordId.indexOf(prefix) !== 0) return { chatId: chatId, folderId: folderId, ok: false };
    var parts = recordId.slice(prefix.length).split(':');
    if (parts.length < 2) return { chatId: chatId, folderId: folderId, ok: false };
    chatId = chatId || decodePart(parts[0]);
    folderId = folderId || decodePart(parts.slice(1).join(':'));
    return { chatId: chatId, folderId: folderId, ok: !!(chatId && folderId) };
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
      return { ok: false, malformed: true, warnings: warnings, errors: errors, metaObject: null, cascadeRelated: false, cascadeChild: false };
    }
    for (var i = 0; i < REQUIRED_REMOTE_TOMBSTONE_FIELDS.length; i += 1) {
      var field = REQUIRED_REMOTE_TOMBSTONE_FIELDS[i];
      if (!cleanScalar(tombstone[field])) errors.push({ code: 'missing-' + field });
    }
    if (cleanScalar(tombstone.schema) && cleanScalar(tombstone.schema) !== TOMBSTONE_SCHEMA) {
      errors.push({ code: 'invalid-tombstone-schema' });
    }
    var kind = cleanScalar(tombstone.recordKind);
    if (kind && !KNOWN_TOMBSTONE_KINDS[kind]) errors.push({ code: 'unknown-record-kind' });
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
      ok: errors.length === 0,
      malformed: errors.length > 0,
      warnings: warnings,
      errors: errors,
      metaObject: metaObject,
      cascadeRelated: cascadeRelated,
      cascadeChild: cascadeChild,
    };
  }

  function compareLocalTimestamp(localValue, remoteDeletedAt) {
    var localMs = parseTimeMs(localValue);
    var remoteMs = parseTimeMs(remoteDeletedAt);
    return localMs != null && remoteMs != null && localMs > remoteMs;
  }

  function classifyFolderTombstone(tombstone) {
    var folderId = parseFolderIdFromRecordId(tombstone && tombstone.recordId);
    if (!folderId) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-id-unavailable' }],
      });
    }
    return sqlSelect('SELECT id, updated_at FROM folders WHERE id = ? LIMIT 1', [folderId])
      .then(function (rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
          return {
            classification: 'missing-local-record',
            localRecordExists: false,
            localUpdatedAt: null,
            localHasNewerEdit: false,
            warnings: [],
          };
        }
        var row = rows[0] || {};
        var updatedAt = row.updated_at == null ? null : row.updated_at;
        var newer = compareLocalTimestamp(updatedAt, tombstone.deletedAt);
        return {
          classification: newer ? 'delete-vs-edit' : 'safe-review',
          localRecordExists: true,
          localUpdatedAt: updatedAt,
          localHasNewerEdit: newer,
          warnings: [],
        };
      })
      .catch(function () {
        return {
          classification: 'local-comparison-unavailable',
          localRecordExists: null,
          localUpdatedAt: null,
          localHasNewerEdit: null,
          warnings: [{ code: 'folder-local-comparison-failed' }],
        };
      });
  }

  function classifyFolderBindingTombstone(tombstone, metaObject, cascadeRelated) {
    var ids = parseFolderBindingIds(tombstone, metaObject);
    if (!ids.ok) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-binding-ids-unavailable' }],
      });
    }
    return sqlSelect(
      'SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? AND folder_id = ? LIMIT 1',
      [ids.chatId, ids.folderId]
    ).then(function (rows) {
      var exists = Array.isArray(rows) && rows.length > 0;
      var assignedAt = exists && rows[0] ? rows[0].assigned_at : null;
      var newer = exists ? compareLocalTimestamp(assignedAt, tombstone.deletedAt) : false;
      var classification = cascadeRelated
        ? 'cascade-review'
        : (exists ? (newer ? 'delete-vs-edit' : 'safe-review') : 'missing-local-record');
      return {
        classification: classification,
        localRecordExists: exists,
        localUpdatedAt: assignedAt,
        localHasNewerEdit: newer,
        warnings: [],
      };
    }).catch(function () {
      return {
        classification: 'local-comparison-unavailable',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: [{ code: 'folder-binding-local-comparison-failed' }],
      };
    });
  }

  function classifyRemoteTombstone(tombstone, validation) {
    if (validation.malformed) {
      return Promise.resolve({
        classification: 'malformed-remote-tombstone',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.errors.concat(validation.warnings),
      });
    }
    var kind = cleanScalar(tombstone.recordKind);
    if (!SUPPORTED_INGEST_KINDS[kind]) {
      return Promise.resolve({
        classification: 'unsupported-record-kind',
        localRecordExists: null,
        localUpdatedAt: null,
        localHasNewerEdit: null,
        warnings: validation.warnings.slice(),
      });
    }
    if (kind === 'folder') {
      return classifyFolderTombstone(tombstone).then(function (result) {
        result.warnings = validation.warnings.concat(result.warnings || []);
        return result;
      });
    }
    if (kind === 'folderBinding') {
      return classifyFolderBindingTombstone(tombstone, validation.metaObject, validation.cascadeRelated).then(function (result) {
        result.warnings = validation.warnings.concat(result.warnings || []);
        return result;
      });
    }
    return Promise.resolve({
      classification: 'unsupported-record-kind',
      localRecordExists: null,
      localUpdatedAt: null,
      localHasNewerEdit: null,
      warnings: validation.warnings.slice(),
    });
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

  function handleIngestRow(tombstone, sourceInfo, parentRecordIds, result, dryRun) {
    var validation = validateRemoteTombstone(tombstone, parentRecordIds);
    return classifyRemoteTombstone(tombstone, validation).then(function (classification) {
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
        return null;
      }
      if (dryRun) return null;
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
    }).catch(function () {
      result.failed += 1;
      result.ok = false;
      pushIngestWarning(result, 'review-row-ingest-failed');
      return null;
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
            return handleIngestRow(tombstone, sourceInfo, parentRecordIds, result, result.dryRun);
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
      .then(function () {
        var now = nowIso();
        return sqlExecute(
          'UPDATE ' + TABLE + ' SET status = ?, decision = ?, decided_at = ?, updated_at = ? WHERE review_id = ?',
          [nextStatus, nullableString(reason), now, now, reviewId]
        ).then(function (result) {
          if (readRowsAffected(result) > 0) {
            recordWrite('markStatus');
            notifySubscribers({ source: 'local', op: 'markStatus', reviewId: reviewId, status: nextStatus });
          }
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
    return ensureReady()
      .then(function () {
        return Promise.all([
          sqlSelect(
            'SELECT COUNT(*) AS total, ' +
            'SUM(CASE WHEN status = "pending" THEN 1 ELSE 0 END) AS pending FROM ' + TABLE,
            []
          ),
          countByClassification(),
          countByStatus(),
        ]);
      })
      .then(function (parts) {
        var summary = Array.isArray(parts[0]) && parts[0].length ? parts[0][0] : {};
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
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          total: Number(summary.total) || 0,
          pending: Number(summary.pending) || 0,
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
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          total: 0,
          pending: 0,
          byClassification: [],
          byStatus: [],
          initError: state.initError || String((e && e.message) || e),
          warnings: state.warnings.slice(),
        };
      });
  }

  var api = {
    __installed: true,
    __version: '0.1.0-f5f.2',
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
      table: TABLE,
      classifications: Object.freeze(Object.keys(CLASSIFICATIONS).slice()),
      statuses: Object.freeze(Object.keys(STATUSES).slice()),
    }),
  };
  store.__registerEntity('tombstoneReviews', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
