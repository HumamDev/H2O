/* H2O Studio Store - Sync Conflicts (Desktop / Tauri SQLite)
 *
 * F6.1b.1 - read-only conflict queue scaffold. Backs the `sync_conflicts`
 * table defined by the Desktop migration from F6.1b.0.
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * This module is intentionally observation-only. It lists and diagnoses
 * evidence already present in SQLite, and exposes no candidate ingestion,
 * merge, apply, or row mutation API.
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
    try { console.warn('[H2O.Studio.store.conflicts] H2O.Studio.store not present; entity not registered'); }
    catch (_) { /* ignore */ }
    return;
  }
  if (store.conflicts && store.conflicts.__installed) return;

  var DB_URL = 'sqlite:studio-v1.db';
  var TABLE = 'sync_conflicts';
  var CONFLICT_SCHEMA = 'h2o.studio.sync-conflict.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.studio.sync-conflict.diagnostic.v1';
  var READY_POLL_INTERVAL_MS = 100;
  var READY_POLL_MAX_TRIES = 100;
  var DEFAULT_LIST_LIMIT = 50;
  var MAX_LIST_LIMIT = 500;

  var STATUSES = Object.freeze({
    pending: true,
    'accepted-later': true,
    ignored: true,
    rejected: true,
    resolved: true,
    superseded: true,
  });
  var SEVERITIES = Object.freeze({
    info: true,
    low: true,
    medium: true,
    high: true,
    critical: true,
  });
  var CLASSIFICATIONS = Object.freeze({
    'safe-review': true,
    'needs-human-review': true,
    'dangerous-auto-merge': true,
    'unsupported-record-kind': true,
    'delete-vs-edit-owned-by-f5': true,
    'local-comparison-unavailable': true,
    'malformed-remote-record': true,
    'duplicate-candidate': true,
  });
  var CONFLICT_KINDS = Object.freeze({
    'same-record-divergent-metadata': true,
    'local-newer-than-remote': true,
    'remote-newer-than-local': true,
    'duplicate-identity': true,
    'folder-membership-divergence': true,
    'label-binding-divergence': true,
    'category-binding-divergence': true,
    'visual-metadata-divergence': true,
    'unsupported-merge-kind': true,
    'delete-vs-edit-reference': true,
  });
  var ENTITY_KINDS = Object.freeze({
    folder: true,
    folderBinding: true,
    chat: true,
    snapshot: true,
    label: true,
    labelBinding: true,
    category: true,
    categoryBinding: true,
    visualMetadata: true,
    linkedOnlyChat: true,
    savedSnapshot: true,
    unknown: true,
  });

  var state = {
    ready: false,
    tableInstalled: false,
    initError: null,
    initializedAt: null,
    disposed: false,
    errors: [],
    errMax: 20,
    warnings: [],
    warnMax: 20,
  };

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return null; }
  }

  function recordError(op, e) {
    try {
      state.errors.push({ t: Date.now(), op: String(op), e: String((e && e.stack) || e || '') });
      if (state.errors.length > state.errMax) state.errors.splice(0, state.errors.length - state.errMax);
    } catch (_) { /* swallow */ }
  }

  function recordWarning(code) {
    try {
      state.warnings.push({ t: Date.now(), code: String(code || 'warning') });
      if (state.warnings.length > state.warnMax) state.warnings.splice(0, state.warnings.length - state.warnMax);
    } catch (_) { /* swallow */ }
  }

  function warning(code) {
    return { code: String(code || 'warning') };
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
    return String(value == null ? '' : value).trim();
  }

  function hasOwn(map, value) {
    return Object.prototype.hasOwnProperty.call(map, cleanString(value));
  }

  function tableExists() {
    return sqlSelect(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1',
      ['table', TABLE]
    ).then(function (rows) {
      return Array.isArray(rows) && rows.length > 0;
    });
  }

  function normalizeCountRows(rows, keyField) {
    var out = {};
    if (!Array.isArray(rows)) return out;
    rows.forEach(function (row) {
      var key = cleanString(row && row[keyField]);
      if (!key) key = 'unknown';
      out[key] = Number(row && row.total) || 0;
    });
    return out;
  }

  function safeJsonFlags(value) {
    var raw = value == null ? '' : String(value);
    var trimmed = raw.trim();
    var flags = {
      present: trimmed.length > 0 && trimmed !== '{}',
      size: raw.length,
      parseStatus: 'empty',
    };
    if (!trimmed) return flags;
    try {
      JSON.parse(trimmed);
      flags.parseStatus = 'ok';
    } catch (_) {
      flags.parseStatus = 'malformed';
    }
    return flags;
  }

  function countWarnings(value) {
    var raw = value == null ? '' : String(value).trim();
    if (!raw) return 0;
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (_) {
      return 1;
    }
  }

  function redactedRow(row) {
    row = row || {};
    return {
      conflictIdPresent: !!cleanString(row.conflict_id),
      schema: cleanString(row.schema) || null,
      conflictKind: cleanString(row.conflict_kind) || null,
      entityKind: cleanString(row.entity_kind) || null,
      status: cleanString(row.status) || null,
      severity: cleanString(row.severity) || null,
      classification: cleanString(row.classification) || null,
      seenCount: Number(row.seen_count) || 0,
      firstSeenAt: row.first_seen_at || null,
      lastSeenAt: row.last_seen_at || null,
      localUpdatedAtPresent: !!cleanString(row.local_updated_at),
      remoteUpdatedAtPresent: !!cleanString(row.remote_updated_at),
      hasLocalSummary: safeJsonFlags(row.raw_local_summary_json).present,
      hasRemoteSummary: safeJsonFlags(row.raw_remote_summary_json).present,
      warningCount: countWarnings(row.warnings_json),
    };
  }

  function redactedDetail(row) {
    if (!row) return null;
    var summary = redactedRow(row);
    summary.localSummary = safeJsonFlags(row.raw_local_summary_json);
    summary.remoteSummary = safeJsonFlags(row.raw_remote_summary_json);
    summary.warnings = safeJsonFlags(row.warnings_json);
    summary.decisionPresent = !!cleanString(row.decision);
    summary.decidedAtPresent = !!cleanString(row.decided_at);
    summary.decidedByPeerPresent = !!cleanString(row.decided_by_sync_peer_id);
    summary.createdAt = row.created_at || null;
    summary.updatedAt = row.updated_at || null;
    return summary;
  }

  function diagnosticBase(installed, ready, warnings) {
    return {
      schema: DIAGNOSTIC_SCHEMA,
      installed: installed === true,
      ready: ready === true,
      redacted: true,
      platform: 'desktop-tauri',
      table: TABLE,
      total: 0,
      pending: 0,
      byKind: {},
      byEntityKind: {},
      byStatus: {},
      bySeverity: {},
      unsupportedCount: 0,
      deleteVsEditReferenceCount: 0,
      warnings: Array.isArray(warnings) ? warnings : [],
    };
  }

  function ensureReady() {
    if (state.ready && state.tableInstalled) return Promise.resolve(true);
    return init().then(function () {
      return state.ready && state.tableInstalled;
    });
  }

  function init() {
    state.disposed = false;
    return waitForSqlite()
      .then(function () {
        return tableExists();
      })
      .then(function (exists) {
        state.tableInstalled = exists === true;
        state.ready = exists === true;
        state.initializedAt = nowIso();
        state.initError = exists ? null : 'sync-conflicts-table-missing';
        if (!exists) recordWarning('sync-conflicts-table-missing');
        return state.ready;
      })
      .catch(function (e) {
        state.ready = false;
        state.tableInstalled = false;
        state.initError = String((e && e.message) || e);
        recordError('init', e);
        return false;
      });
  }

  function dispose() {
    state.ready = false;
    state.disposed = true;
    return Promise.resolve(true);
  }

  function isReady() {
    return state.ready === true;
  }

  function countGrouped(column, aliasName) {
    return ensureReady().then(function (ok) {
      if (!ok) return {};
      return sqlSelect(
        'SELECT ' + column + ' AS ' + aliasName + ', COUNT(*) AS total FROM ' + TABLE +
        ' GROUP BY ' + column + ' ORDER BY total DESC',
        []
      ).then(function (rows) {
        return normalizeCountRows(rows, aliasName);
      });
    });
  }

  function countByStatus() {
    return countGrouped('status', 'status');
  }

  function countByKind() {
    return countGrouped('conflict_kind', 'kind');
  }

  function countBySeverity() {
    return countGrouped('severity', 'severity');
  }

  function diagnose() {
    return ensureReady().then(function (ok) {
      if (!ok) {
        return diagnosticBase(false, false, [warning(state.initError || 'sync-conflicts-table-missing')]);
      }
      return Promise.all([
        sqlSelect(
          'SELECT COUNT(*) AS total, ' +
          'SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS pending, ' +
          'SUM(CASE WHEN classification = ? THEN 1 ELSE 0 END) AS unsupportedCount, ' +
          'SUM(CASE WHEN conflict_kind = ? THEN 1 ELSE 0 END) AS deleteVsEditReferenceCount ' +
          'FROM ' + TABLE,
          ['pending', 'unsupported-record-kind', 'delete-vs-edit-reference']
        ),
        countByKind(),
        countGrouped('entity_kind', 'entityKind'),
        countByStatus(),
        countBySeverity(),
      ]).then(function (parts) {
        var summary = Array.isArray(parts[0]) && parts[0].length ? parts[0][0] : {};
        var out = diagnosticBase(true, true, []);
        out.total = Number(summary.total) || 0;
        out.pending = Number(summary.pending) || 0;
        out.unsupportedCount = Number(summary.unsupportedCount) || 0;
        out.deleteVsEditReferenceCount = Number(summary.deleteVsEditReferenceCount) || 0;
        out.byKind = parts[1] || {};
        out.byEntityKind = parts[2] || {};
        out.byStatus = parts[3] || {};
        out.bySeverity = parts[4] || {};
        return out;
      });
    }).catch(function (e) {
      recordError('diagnose', e);
      return diagnosticBase(false, false, [warning('sync-conflicts-diagnose-failed')]);
    });
  }

  function normalizeLimit(limit) {
    var n = Number(limit);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIST_LIMIT;
    n = Math.floor(n);
    return Math.min(n, MAX_LIST_LIMIT);
  }

  function validateFilters(filters) {
    filters = filters || {};
    var blockers = [];
    if (filters.status != null && !hasOwn(STATUSES, filters.status)) blockers.push({ code: 'invalid-status' });
    if (filters.conflictKind != null && !hasOwn(CONFLICT_KINDS, filters.conflictKind)) blockers.push({ code: 'invalid-conflict-kind' });
    if (filters.entityKind != null && !hasOwn(ENTITY_KINDS, filters.entityKind)) blockers.push({ code: 'invalid-entity-kind' });
    if (filters.severity != null && !hasOwn(SEVERITIES, filters.severity)) blockers.push({ code: 'invalid-severity' });
    return blockers;
  }

  function listConflicts(filters) {
    filters = filters || {};
    var blockers = validateFilters(filters);
    if (blockers.length) {
      return Promise.resolve({
        ok: false,
        redacted: true,
        platform: 'desktop-tauri',
        blockers: blockers,
        rows: [],
        warnings: [],
      });
    }
    return ensureReady().then(function (ok) {
      if (!ok) {
        return {
          ok: false,
          redacted: true,
          platform: 'desktop-tauri',
          blockers: [warning(state.initError || 'sync-conflicts-table-missing')],
          rows: [],
          warnings: [],
        };
      }
      var where = [];
      var values = [];
      if (filters.status != null) { where.push('status = ?'); values.push(cleanString(filters.status)); }
      if (filters.conflictKind != null) { where.push('conflict_kind = ?'); values.push(cleanString(filters.conflictKind)); }
      if (filters.entityKind != null) { where.push('entity_kind = ?'); values.push(cleanString(filters.entityKind)); }
      if (filters.severity != null) { where.push('severity = ?'); values.push(cleanString(filters.severity)); }
      values.push(normalizeLimit(filters.limit));
      return sqlSelect(
        'SELECT conflict_id, schema, conflict_kind, entity_kind, status, severity, classification, ' +
        'seen_count, first_seen_at, last_seen_at, local_updated_at, remote_updated_at, ' +
        'raw_local_summary_json, raw_remote_summary_json, warnings_json FROM ' + TABLE +
        (where.length ? ' WHERE ' + where.join(' AND ') : '') +
        ' ORDER BY last_seen_at DESC LIMIT ?',
        values
      ).then(function (rows) {
        return {
          ok: true,
          redacted: true,
          platform: 'desktop-tauri',
          rows: (Array.isArray(rows) ? rows : []).map(redactedRow),
          warnings: [],
        };
      });
    }).catch(function (e) {
      recordError('listConflicts', e);
      return {
        ok: false,
        redacted: true,
        platform: 'desktop-tauri',
        blockers: [warning('sync-conflicts-list-failed')],
        rows: [],
        warnings: [],
      };
    });
  }

  function getConflict(conflictId) {
    var id = cleanString(conflictId);
    if (!id) {
      return Promise.resolve({
        ok: false,
        found: false,
        redacted: true,
        platform: 'desktop-tauri',
        blockers: [warning('invalid-conflict-id')],
      });
    }
    return ensureReady().then(function (ok) {
      if (!ok) {
        return {
          ok: false,
          found: false,
          redacted: true,
          platform: 'desktop-tauri',
          blockers: [warning(state.initError || 'sync-conflicts-table-missing')],
        };
      }
      return sqlSelect(
        'SELECT conflict_id, schema, conflict_kind, entity_kind, status, severity, classification, ' +
        'seen_count, first_seen_at, last_seen_at, local_updated_at, remote_updated_at, ' +
        'raw_local_summary_json, raw_remote_summary_json, warnings_json, decision, decided_at, ' +
        'decided_by_sync_peer_id, created_at, updated_at FROM ' + TABLE +
        ' WHERE conflict_id = ? LIMIT 1',
        [id]
      ).then(function (rows) {
        var row = Array.isArray(rows) && rows.length ? rows[0] : null;
        return {
          ok: true,
          found: !!row,
          redacted: true,
          platform: 'desktop-tauri',
          conflict: row ? redactedDetail(row) : null,
          warnings: [],
        };
      });
    }).catch(function (e) {
      recordError('getConflict', e);
      return {
        ok: false,
        found: false,
        redacted: true,
        platform: 'desktop-tauri',
        blockers: [warning('sync-conflicts-get-failed')],
      };
    });
  }

  function validateJsonish(value) {
    if (value == null) return { ok: true };
    if (typeof value === 'object') return { ok: true };
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return { ok: true };
      } catch (_) {
        return { ok: false };
      }
    }
    return { ok: false };
  }

  function validateConflict(record) {
    record = record || {};
    var blockers = [];
    var schema = record.schema;
    var status = record.status;
    var severity = record.severity;
    var classification = record.classification;
    var conflictKind = record.conflictKind || record.conflict_kind;
    var entityKind = record.entityKind || record.entity_kind;
    var dedupeKey = record.dedupeKey || record.dedupe_key;
    if (schema !== CONFLICT_SCHEMA) blockers.push({ code: 'invalid-schema' });
    if (!hasOwn(STATUSES, status)) blockers.push({ code: 'invalid-status' });
    if (!hasOwn(SEVERITIES, severity)) blockers.push({ code: 'invalid-severity' });
    if (!hasOwn(CLASSIFICATIONS, classification)) blockers.push({ code: 'invalid-classification' });
    if (!hasOwn(CONFLICT_KINDS, conflictKind)) blockers.push({ code: 'invalid-conflict-kind' });
    if (!hasOwn(ENTITY_KINDS, entityKind)) blockers.push({ code: 'invalid-entity-kind' });
    if (!cleanString(dedupeKey)) blockers.push({ code: 'missing-dedupe-key' });
    if (!validateJsonish(record.rawLocalSummaryJson || record.raw_local_summary_json).ok) {
      blockers.push({ code: 'invalid-local-summary-json' });
    }
    if (!validateJsonish(record.rawRemoteSummaryJson || record.raw_remote_summary_json).ok) {
      blockers.push({ code: 'invalid-remote-summary-json' });
    }
    return {
      ok: blockers.length === 0,
      redacted: true,
      blockers: blockers,
      warnings: [],
    };
  }

  var api = {
    __installed: true,
    __version: '0.1.0-f6.1b.1',
    init: init,
    dispose: dispose,
    isReady: isReady,
    diagnose: diagnose,
    listConflicts: listConflicts,
    getConflict: getConflict,
    countByStatus: countByStatus,
    countByKind: countByKind,
    countBySeverity: countBySeverity,
    validateConflict: validateConflict,
    constants: Object.freeze({
      schema: CONFLICT_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
      table: TABLE,
      statuses: Object.freeze(Object.keys(STATUSES).slice()),
      severities: Object.freeze(Object.keys(SEVERITIES).slice()),
      classifications: Object.freeze(Object.keys(CLASSIFICATIONS).slice()),
      conflictKinds: Object.freeze(Object.keys(CONFLICT_KINDS).slice()),
      entityKinds: Object.freeze(Object.keys(ENTITY_KINDS).slice()),
      defaultListLimit: DEFAULT_LIST_LIMIT,
      maxListLimit: MAX_LIST_LIMIT,
    }),
  };
  store.__registerEntity('conflicts', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
