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
  function nullableString(value) {
    var s = cleanString(value);
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
    __version: '0.1.0-f5f.1',
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
    diagnose: diagnose,
    validateReview: validateReview,
    buildDedupeKey: buildDedupeKey,
    constants: Object.freeze({
      schema: REVIEW_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
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
