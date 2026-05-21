/* H2O Studio Store - Tombstones Entity (Desktop / Tauri SQLite)
 *
 * F5C - inert local tombstone store scaffold. Backs the `sync_tombstones`
 * table defined in apps/studio/desktop/src-tauri/src/lib.rs (Migration v6).
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * F5C is deliberately inert: existing delete/remove/unbind/replace/clear
 * paths do not call this module. Tombstones are written only through direct
 * developer/API calls to H2O.Studio.store.tombstones.createTombstone().
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
    try { console.warn('[H2O.Studio.store.tombstones] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.tombstones && store.tombstones.__installed) return;

  var DB_URL = 'sqlite:studio-v1.db';
  var TABLE = 'sync_tombstones';
  var SCHEMA_VERSION = 1;
  var TOMBSTONE_SCHEMA = 'h2o.studio.tombstone.v1';
  var TOMBSTONE_EXPORT_PREVIEW_SCHEMA = 'h2o.studio.tombstone-export-preview.v1';
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
  var DEFAULT_LIST_LIMIT = 100;
  var MAX_LIST_LIMIT = 1000;
  var DEFAULT_PREVIEW_EXPORT_LIMIT = 5000;
  var MAX_PREVIEW_EXPORT_LIMIT = 5000;

  var RECORD_KINDS = {
    chat: true,
    linkedOnlyChat: true,
    snapshot: true,
    savedSnapshot: true,
    folder: true,
    folderBinding: true,
    tag: true,
    tagBinding: true,
    label: true,
    labelBinding: true,
    category: true,
    categoryAssignment: true,
    project: true,
    visualMetadata: true,
  };

  var COL_TO_FIELD = {
    tombstone_id: 'tombstoneId',
    schema: 'schema',
    record_kind: 'recordKind',
    record_id: 'recordId',
    deleted_at: 'deletedAt',
    deleted_by_sync_peer_id: 'deletedBySyncPeerId',
    delete_reason: 'deleteReason',
    prior_digest: 'priorDigest',
    prior_updated_at: 'priorUpdatedAt',
    source_export_id: 'sourceExportId',
    source_sequence_number: 'sourceSequenceNumber',
    cascade_from: 'cascadeFrom',
    restored_at: 'restoredAt',
    restored_by_sync_peer_id: 'restoredBySyncPeerId',
    meta_json: 'meta',
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
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.stack) || e || '') });
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
  function generateTombstoneId() {
    try {
      var c = global.crypto || null;
      if (c && typeof c.randomUUID === 'function') return 'tombstone:' + c.randomUUID();
    } catch (_) { /* ignore */ }
    return 'tombstone:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2);
  }

  function parseMeta(raw) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
    if (typeof raw !== 'string') return {};
    try {
      var v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
      recordWarning('meta_json parse failed: ' + ((e && e.message) || e));
      return {};
    }
  }
  function parseMetaForPreview(raw, warnings, rowId) {
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw;
    if (typeof raw !== 'string') return {};
    try {
      var v = JSON.parse(raw);
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
      warnings.push({
        code: 'invalid-meta-json',
        tombstoneId: cleanString(rowId),
        detail: String((e && e.message) || e),
      });
      return {};
    }
  }
  function normalizeMetaJson(input) {
    var raw = input && Object.prototype.hasOwnProperty.call(input, 'metaJson')
      ? input.metaJson
      : (input && Object.prototype.hasOwnProperty.call(input, 'meta_json') ? input.meta_json : input && input.meta);
    if (raw == null) return '{}';
    if (typeof raw === 'string') {
      JSON.parse(raw);
      return raw;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) return JSON.stringify(raw);
    throw new Error('meta_json must be a JSON object string or plain object');
  }

  function rowToJs(row) {
    if (!row || typeof row !== 'object') return null;
    var out = {};
    Object.keys(COL_TO_FIELD).forEach(function (col) {
      var field = COL_TO_FIELD[col];
      var value = row[col];
      if (col === 'meta_json') {
        out.meta = parseMeta(value);
      } else if (col === 'source_sequence_number') {
        out[field] = value == null ? null : Number(value);
      } else {
        out[field] = value == null ? null : value;
      }
    });
    return out;
  }

  function validateTombstone(record) {
    var r = record || {};
    var errors = [];
    var schema = cleanString(r.schema);
    var recordKind = cleanString(r.recordKind);
    var recordId = cleanString(r.recordId);
    if (schema !== TOMBSTONE_SCHEMA) errors.push({ code: 'invalid-schema' });
    if (!recordKind) errors.push({ code: 'missing-record-kind' });
    else if (!RECORD_KINDS[recordKind]) errors.push({ code: 'unknown-record-kind', recordKind: recordKind });
    if (!recordId) errors.push({ code: 'missing-record-id' });
    if (!cleanString(r.tombstoneId)) errors.push({ code: 'missing-tombstone-id' });
    if (!cleanString(r.deletedAt)) errors.push({ code: 'missing-deleted-at' });
    if (!cleanString(r.deletedBySyncPeerId)) errors.push({ code: 'missing-deleted-by-sync-peer-id' });
    if (!cleanString(r.deleteReason)) errors.push({ code: 'missing-delete-reason' });
    if (r.sourceSequenceNumber != null && r.sourceSequenceNumber !== '') {
      var seq = Number(r.sourceSequenceNumber);
      if (!Number.isFinite(seq) || Math.floor(seq) !== seq) errors.push({ code: 'invalid-source-sequence-number' });
    }
    try { normalizeMetaJson(r); }
    catch (e) { errors.push({ code: 'invalid-meta-json', detail: String((e && e.message) || e) }); }
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeForCreate(input, peerId) {
    var r = input || {};
    var at = cleanString(r.deletedAt) || nowIso();
    var now = nowIso();
    var out = {
      tombstoneId: cleanString(r.tombstoneId) || generateTombstoneId(),
      schema: cleanString(r.schema) || TOMBSTONE_SCHEMA,
      recordKind: cleanString(r.recordKind),
      recordId: cleanString(r.recordId),
      deletedAt: at,
      deletedBySyncPeerId: cleanString(r.deletedBySyncPeerId) || cleanString(peerId),
      deleteReason: cleanString(r.deleteReason),
      priorDigest: nullableString(r.priorDigest),
      priorUpdatedAt: nullableString(r.priorUpdatedAt),
      sourceExportId: nullableString(r.sourceExportId),
      sourceSequenceNumber: r.sourceSequenceNumber == null || r.sourceSequenceNumber === ''
        ? null
        : Number(r.sourceSequenceNumber),
      cascadeFrom: nullableString(r.cascadeFrom),
      restoredAt: nullableString(r.restoredAt),
      restoredBySyncPeerId: nullableString(r.restoredBySyncPeerId),
      metaJson: normalizeMetaJson(r),
      createdAt: cleanString(r.createdAt) || now,
      updatedAt: cleanString(r.updatedAt) || now,
    };
    var v = validateTombstone(out);
    if (!v.ok) {
      var err = new Error('invalid tombstone: ' + v.errors.map(function (e) { return e.code; }).join(', '));
      err.validation = v;
      throw err;
    }
    return out;
  }

  function readIdentityPeerId() {
    var api = H2O && H2O.Studio && H2O.Studio.identity;
    if (!api || typeof api.whenReady !== 'function') {
      return Promise.reject(new Error('peer identity unavailable'));
    }
    return api.whenReady().then(function (identity) {
      var syncPeerId = cleanString(identity && identity.syncPeerId);
      if (!syncPeerId) throw new Error('peer identity unavailable');
      return syncPeerId;
    });
  }
  function resolvePeerId(explicitPeerId) {
    var peerId = cleanString(explicitPeerId);
    if (peerId) return Promise.resolve(peerId);
    return readIdentityPeerId();
  }

  function buildWhere(filters) {
    var f = filters || {};
    var where = [];
    var values = [];
    function pushString(field, col) {
      var value = cleanString(f[field]);
      if (value) { where.push(col + ' = ?'); values.push(value); }
    }
    pushString('tombstoneId', 'tombstone_id');
    pushString('recordKind', 'record_kind');
    pushString('recordId', 'record_id');
    pushString('deletedBySyncPeerId', 'deleted_by_sync_peer_id');
    pushString('sourceExportId', 'source_export_id');
    pushString('cascadeFrom', 'cascade_from');
    if (f.activeOnly === true) where.push('restored_at IS NULL');
    if (f.restoredOnly === true) where.push('restored_at IS NOT NULL');
    return { sql: where.length ? (' WHERE ' + where.join(' AND ')) : '', values: values };
  }
  function readLimit(filters) {
    var raw = Number(filters && filters.limit);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIST_LIMIT;
    return Math.min(Math.floor(raw), MAX_LIST_LIMIT);
  }
  function readPreviewExportLimit(options, warnings) {
    var raw = Number(options && options.limit);
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PREVIEW_EXPORT_LIMIT;
    var limit = Math.floor(raw);
    if (limit > MAX_PREVIEW_EXPORT_LIMIT) {
      warnings.push({
        code: 'preview-limit-capped',
        requestedLimit: limit,
        effectiveLimit: MAX_PREVIEW_EXPORT_LIMIT,
      });
      return MAX_PREVIEW_EXPORT_LIMIT;
    }
    return limit;
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
      if (!state.ready) throw new Error(state.initError || 'tombstone store not ready');
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

  function getById(tombstoneIdInput) {
    var tombstoneId = cleanString(tombstoneIdInput);
    if (!tombstoneId) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect('SELECT * FROM ' + TABLE + ' WHERE tombstone_id = ? LIMIT 1', [tombstoneId]);
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getById', e); return null; });
  }

  function getTombstone(recordKindInput, recordIdInput) {
    var recordKind = cleanString(recordKindInput);
    var recordId = cleanString(recordIdInput);
    if (!recordKind || !recordId) return Promise.resolve(null);
    return ensureReady()
      .then(function () {
        return sqlSelect(
          'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1',
          [recordKind, recordId]
        );
      })
      .then(function (rows) { return Array.isArray(rows) && rows.length ? rowToJs(rows[0]) : null; })
      .catch(function (e) { recordError('getTombstone', e); return null; });
  }

  function listTombstones(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        var limit = readLimit(filters);
        return sqlSelect(
          'SELECT * FROM ' + TABLE + w.sql + ' ORDER BY deleted_at DESC, created_at DESC LIMIT ?',
          w.values.concat([limit])
        );
      })
      .then(function (rows) { return Array.isArray(rows) ? rows.map(rowToJs).filter(Boolean) : []; })
      .catch(function (e) { recordError('listTombstones', e); return []; });
  }

  function getAll() { return listTombstones(); }

  function countByKind(filters) {
    return ensureReady()
      .then(function () {
        var w = buildWhere(filters);
        return sqlSelect(
          'SELECT record_kind AS recordKind, COUNT(*) AS total, ' +
          'SUM(CASE WHEN restored_at IS NULL THEN 1 ELSE 0 END) AS active, ' +
          'SUM(CASE WHEN restored_at IS NOT NULL THEN 1 ELSE 0 END) AS restored ' +
          'FROM ' + TABLE + w.sql + ' GROUP BY record_kind ORDER BY record_kind ASC',
          w.values
        );
      })
      .then(function (rows) {
        return (Array.isArray(rows) ? rows : []).map(function (r) {
          return {
            recordKind: cleanString(r.recordKind),
            total: Number(r.total) || 0,
            active: Number(r.active) || 0,
            restored: Number(r.restored) || 0,
          };
        });
      })
      .catch(function (e) { recordError('countByKind', e); return []; });
  }

  function previewRowToExport(row, warnings, includeSensitive) {
    if (!row || typeof row !== 'object') return null;
    var meta = parseMetaForPreview(row.meta_json, warnings, row.tombstone_id);
    var tombstone = {
      schema: cleanString(row.schema),
      tombstoneId: cleanString(row.tombstone_id),
      recordKind: cleanString(row.record_kind),
      recordId: cleanString(row.record_id),
      deletedAt: cleanString(row.deleted_at),
      deletedBySyncPeerId: cleanString(row.deleted_by_sync_peer_id),
      deleteReason: cleanString(row.delete_reason),
      priorDigest: nullableString(row.prior_digest),
      priorUpdatedAt: nullableString(row.prior_updated_at),
      sourceExportId: nullableString(row.source_export_id),
      sourceSequenceNumber: row.source_sequence_number == null || row.source_sequence_number === ''
        ? null
        : Number(row.source_sequence_number),
      cascadeFrom: nullableString(row.cascade_from),
      restoredAt: nullableString(row.restored_at),
      restoredBySyncPeerId: nullableString(row.restored_by_sync_peer_id),
      meta: meta,
    };
    if (!includeSensitive) {
      tombstone.deletedBySyncPeerId = redactPeerId(tombstone.deletedBySyncPeerId);
      tombstone.restoredBySyncPeerId = tombstone.restoredBySyncPeerId
        ? redactPeerId(tombstone.restoredBySyncPeerId)
        : tombstone.restoredBySyncPeerId;
    }
    var validation = validateTombstone(tombstone);
    if (!validation.ok) {
      warnings.push({
        code: 'invalid-tombstone-row-skipped',
        tombstoneId: tombstone.tombstoneId,
        errors: validation.errors,
      });
      return null;
    }
    return tombstone;
  }

  function summarizeExportPreview(tombstones) {
    var byKindMap = Object.create(null);
    var active = 0;
    var restored = 0;
    tombstones.forEach(function (tombstone) {
      var kind = cleanString(tombstone && tombstone.recordKind) || 'unknown';
      if (!byKindMap[kind]) byKindMap[kind] = { recordKind: kind, total: 0, active: 0, restored: 0 };
      byKindMap[kind].total += 1;
      if (cleanString(tombstone && tombstone.restoredAt)) {
        restored += 1;
        byKindMap[kind].restored += 1;
      } else {
        active += 1;
        byKindMap[kind].active += 1;
      }
    });
    return {
      active: active,
      restored: restored,
      byKind: Object.keys(byKindMap).sort().map(function (kind) { return byKindMap[kind]; }),
    };
  }

  function previewExport(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var includeRestored = opts.includeRestored !== false;
    var includeSensitive = opts.includeSensitive !== false;
    var warnings = [];
    var limit = readPreviewExportLimit(opts, warnings);
    var where = includeRestored ? '' : ' WHERE restored_at IS NULL';
    return ensureReady()
      .then(function () {
        return Promise.all([
          sqlSelect('SELECT COUNT(*) AS n FROM ' + TABLE + where, []),
          sqlSelect('SELECT * FROM ' + TABLE + where + ' ORDER BY deleted_at DESC, created_at DESC LIMIT ?', [limit]),
        ]);
      })
      .then(function (parts) {
        var available = Array.isArray(parts[0]) && parts[0].length ? Number(parts[0][0].n) || 0 : 0;
        var rows = Array.isArray(parts[1]) ? parts[1] : [];
        if (available > rows.length) {
          warnings.push({
            code: 'preview-result-capped',
            available: available,
            exported: rows.length,
            skipped: available - rows.length,
            limit: limit,
          });
        }
        var tombstones = [];
        rows.forEach(function (row) {
          var tombstone = previewRowToExport(row, warnings, includeSensitive);
          if (tombstone) tombstones.push(tombstone);
        });
        var summary = summarizeExportPreview(tombstones);
        return {
          schema: TOMBSTONE_EXPORT_PREVIEW_SCHEMA,
          tombstoneSchemaVersion: TOMBSTONE_SCHEMA,
          generatedAt: nowIso(),
          redacted: !includeSensitive,
          includeRestored: includeRestored,
          limit: limit,
          total: tombstones.length,
          active: summary.active,
          restored: summary.restored,
          skipped: Math.max(0, available - rows.length) + (rows.length - tombstones.length),
          byKind: summary.byKind,
          warnings: warnings,
          tombstones: tombstones,
        };
      })
      .catch(function (e) {
        recordError('previewExport', e);
        return {
          schema: TOMBSTONE_EXPORT_PREVIEW_SCHEMA,
          tombstoneSchemaVersion: TOMBSTONE_SCHEMA,
          generatedAt: nowIso(),
          redacted: !includeSensitive,
          includeRestored: includeRestored,
          limit: limit,
          total: 0,
          active: 0,
          restored: 0,
          skipped: 0,
          byKind: [],
          warnings: warnings.concat([{
            code: 'preview-export-failed',
            detail: String((e && e.message) || e),
          }]),
          tombstones: [],
        };
      });
  }

  function createTombstone(record) {
    return resolvePeerId(record && record.deletedBySyncPeerId)
      .then(function (peerId) {
        return ensureReady().then(function () {
          var r = normalizeForCreate(record, peerId);
          return sqlExecute(
            'INSERT INTO ' + TABLE + ' (' +
              'tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id, ' +
              'delete_reason, prior_digest, prior_updated_at, source_export_id, source_sequence_number, ' +
              'cascade_from, restored_at, restored_by_sync_peer_id, meta_json, created_at, updated_at' +
            ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              r.tombstoneId, r.schema, r.recordKind, r.recordId, r.deletedAt, r.deletedBySyncPeerId,
              r.deleteReason, r.priorDigest, r.priorUpdatedAt, r.sourceExportId, r.sourceSequenceNumber,
              r.cascadeFrom, r.restoredAt, r.restoredBySyncPeerId, r.metaJson, r.createdAt, r.updatedAt,
            ]
          ).then(function () {
            recordWrite('createTombstone');
            notifySubscribers({ source: 'local', op: 'createTombstone', tombstoneId: r.tombstoneId, recordKind: r.recordKind, recordId: r.recordId });
            return getById(r.tombstoneId);
          });
        });
      })
      .catch(function (e) { recordError('createTombstone', e); throw e; });
  }

  function markRestored(tombstoneIdInput, restoredBySyncPeerIdInput) {
    var tombstoneId = cleanString(tombstoneIdInput);
    if (!tombstoneId) return Promise.reject(new Error('markRestored: tombstoneId required'));
    return resolvePeerId(restoredBySyncPeerIdInput)
      .then(function (peerId) {
        return ensureReady().then(function () {
          var now = nowIso();
          return sqlExecute(
            'UPDATE ' + TABLE + ' SET restored_at = ?, restored_by_sync_peer_id = ?, updated_at = ? ' +
            'WHERE tombstone_id = ? AND restored_at IS NULL',
            [now, peerId, now, tombstoneId]
          ).then(function (result) {
            if (readRowsAffected(result) > 0) {
              recordWrite('markRestored');
              notifySubscribers({ source: 'local', op: 'markRestored', tombstoneId: tombstoneId });
            }
            return getById(tombstoneId);
          });
        });
      })
      .catch(function (e) { recordError('markRestored', e); throw e; });
  }

  function redactPeerId(peerId) {
    var s = cleanString(peerId);
    if (!s) return '';
    var parts = s.split(':');
    if (parts.length >= 4) return parts.slice(0, 3).join(':') + ':<redacted>';
    return '<redacted>';
  }

  function diagnose(options) {
    var includeSensitive = !!(options && options.includeSensitive);
    return ensureReady()
      .then(function () {
        return Promise.all([
          sqlSelect(
            'SELECT COUNT(*) AS total, ' +
            'SUM(CASE WHEN restored_at IS NULL THEN 1 ELSE 0 END) AS active, ' +
            'SUM(CASE WHEN restored_at IS NOT NULL THEN 1 ELSE 0 END) AS restored, ' +
            'SUM(CASE WHEN cascade_from IS NOT NULL AND cascade_from != "" THEN 1 ELSE 0 END) AS cascadeCount, ' +
            'MIN(deleted_at) AS oldestDeletedAt, MAX(deleted_at) AS newestDeletedAt FROM ' + TABLE,
            []
          ),
          countByKind(),
          sqlSelect(
            'SELECT deleted_by_sync_peer_id AS peerId, COUNT(*) AS total FROM ' + TABLE +
            ' GROUP BY deleted_by_sync_peer_id ORDER BY total DESC',
            []
          ),
          sqlSelect(
            'SELECT tombstone_id, schema, record_kind, record_id, deleted_at, deleted_by_sync_peer_id, ' +
            'delete_reason, source_sequence_number, meta_json FROM ' + TABLE,
            []
          ),
        ]);
      })
      .then(function (parts) {
        var summary = Array.isArray(parts[0]) && parts[0].length ? parts[0][0] : {};
        var rowsForValidation = Array.isArray(parts[3]) ? parts[3] : [];
        var invalidRecordsCount = 0;
        rowsForValidation.forEach(function (row) {
          var v = validateTombstone({
            tombstoneId: row.tombstone_id,
            schema: row.schema,
            recordKind: row.record_kind,
            recordId: row.record_id,
            deletedAt: row.deleted_at,
            deletedBySyncPeerId: row.deleted_by_sync_peer_id,
            deleteReason: row.delete_reason,
            sourceSequenceNumber: row.source_sequence_number,
            metaJson: row.meta_json,
          });
          if (!v.ok) invalidRecordsCount += 1;
        });
        return {
          installed: true,
          ready: state.ready,
          schemaVersion: SCHEMA_VERSION,
          tombstoneSchema: TOMBSTONE_SCHEMA,
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          totals: {
            total: Number(summary.total) || 0,
            active: Number(summary.active) || 0,
            restored: Number(summary.restored) || 0,
            cascadeCount: Number(summary.cascadeCount) || 0,
            invalidRecordsCount: invalidRecordsCount,
            oldestDeletedAt: summary.oldestDeletedAt || null,
            newestDeletedAt: summary.newestDeletedAt || null,
          },
          byKind: parts[1],
          byDeletedPeer: (Array.isArray(parts[2]) ? parts[2] : []).map(function (r) {
            var peerId = cleanString(r.peerId);
            return {
              peer: includeSensitive ? peerId : redactPeerId(peerId),
              total: Number(r.total) || 0,
            };
          }),
          lastReloadedAt: state.lastReloadedAt,
          lastWriteAt: state.lastWriteAt,
          writesSinceBoot: state.writesSinceBoot,
          subscribers: state.subscribers.size,
          initError: state.initError,
          errors: state.errors.slice(),
          warnings: state.warnings.slice(),
        };
      })
      .catch(function (e) {
        recordError('diagnose', e);
        return {
          installed: true,
          ready: state.ready,
          schemaVersion: SCHEMA_VERSION,
          tombstoneSchema: TOMBSTONE_SCHEMA,
          dbUrl: DB_URL,
          table: TABLE,
          redacted: !includeSensitive,
          initError: state.initError || String((e && e.message) || e),
          errors: state.errors.slice(),
          warnings: state.warnings.slice(),
        };
      });
  }

  var api = {
    __installed: true,
    __version: '0.1.0',
    init: init,
    dispose: dispose,
    isReady: isReady,
    getAll: getAll,
    list: listTombstones,
    reload: reload,
    saveNow: saveNow,
    subscribe: subscribe,
    diagnose: diagnose,
    createTombstone: createTombstone,
    getTombstone: getTombstone,
    getById: getById,
    listTombstones: listTombstones,
    countByKind: countByKind,
    markRestored: markRestored,
    validateTombstone: validateTombstone,
    previewExport: previewExport,
    constants: Object.freeze({
      schema: TOMBSTONE_SCHEMA,
      exportPreviewSchema: TOMBSTONE_EXPORT_PREVIEW_SCHEMA,
      table: TABLE,
      recordKinds: Object.freeze(Object.keys(RECORD_KINDS).slice()),
    }),
  };
  store.__registerEntity('tombstones', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
