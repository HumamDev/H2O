/* H2O Studio Store - Sync Conflicts (Desktop / Tauri SQLite)
 *
 * F6.1b.1 - read-only conflict queue scaffold. Backs the `sync_conflicts`
 * table defined by the Desktop migration from F6.1b.0.
 *
 * Desktop-only: gates on Tauri detection at load. On MV3 / web this file is
 * a silent no-op and registers nothing.
 *
 * This module is intentionally conservative. It lists and diagnoses evidence
 * already present in SQLite. F6.4a adds manual candidate ingest validation as
 * dry-run only. F6.4b adds explicit manual ingestion through a narrow Rust
 * transaction command. F6.5 adds decision-only actions for existing conflict
 * rows. F6.6 adds read-only resolution previews as labels only. There is still
 * no automatic candidate ingestion, merge, apply, entity mutation, delete, or
 * analyzer/runner persistence.
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
  var CONFLICT_CANDIDATE_SCHEMA = 'h2o.studio.sync-conflict-candidate.v1';
  var DIAGNOSTIC_SCHEMA = 'h2o.studio.sync-conflict.diagnostic.v1';
  var INGEST_SCHEMA = 'h2o.studio.sync-conflict-ingest.v1';
  var DECISION_SCHEMA = 'h2o.studio.sync-conflict-decision.v1';
  var RESOLUTION_PREVIEW_SCHEMA = 'h2o.studio.sync-conflict-resolution-preview.v1';
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
  var INGEST_SOURCES = Object.freeze({
    'manual-devtools': true,
    'test-harness': true,
    'multi-peer-diff-manual': true,
  });
  var CANDIDATE_SOURCES = Object.freeze({
    'multi-peer-diff': true,
    'manual-devtools': true,
    'test-harness': true,
    'multi-peer-diff-manual': true,
  });
  var RESOLVED_DECISIONS = Object.freeze({
    'resolved-local-wins': true,
    'resolved-remote-wins': true,
    'resolved-manual-merge': true,
    'resolved-no-action-needed': true,
    'resolved-duplicate': true,
    'resolved-owned-by-f5': true,
    'blocked-unsupported': true,
  });
  var TERMINAL_STATUSES = Object.freeze({
    ignored: true,
    rejected: true,
    resolved: true,
    superseded: true,
  });
  var RESOLUTION_PREVIEW_KINDS = Object.freeze({
    'same-record-divergent-metadata': true,
    'local-newer-than-remote': true,
    'remote-newer-than-local': true,
    'folder-membership-divergence': true,
    'unsupported-merge-kind': true,
    'delete-vs-edit-reference': true,
  });
  var SUSPICIOUS_CANDIDATE_FIELDS = Object.freeze({
    rawjson: true,
    raw_json: true,
    content: true,
    title: true,
    name: true,
    prompt: true,
    answer: true,
    message: true,
    href: true,
    url: true,
    transcript: true,
    text: true,
    body: true,
    raw: true,
    metadata: true,
    recordid: true,
    record_id: true,
    peerid: true,
    peer_id: true,
    chatid: true,
    chat_id: true,
    folderid: true,
    folder_id: true,
    conflictid: true,
    conflict_id: true,
    dedupekey: true,
    dedupe_key: true,
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

  function bumpResultCounter(obj, key) {
    var k = cleanString(key) || 'unknown';
    obj[k] = Number(obj[k] || 0) + 1;
  }

  function makeIngestResult(dryRun, source, received) {
    return {
      schema: INGEST_SCHEMA,
      ok: true,
      dryRun: dryRun === true,
      source: source || null,
      received: Number(received || 0),
      accepted: 0,
      wouldInsert: 0,
      wouldUpdate: 0,
      wouldReject: 0,
      inserted: 0,
      updated: 0,
      rejected: 0,
      failed: 0,
      writesPerformed: 0,
      byKind: {},
      byEntityKind: {},
      byClassification: {},
      bySeverity: {},
      rejectionCodes: {},
      warnings: [],
    };
  }

  function makeBlockedIngestResult(candidates, options, code) {
    var received = Array.isArray(candidates) ? candidates.length : 0;
    var opts = options || {};
    var result = makeIngestResult(opts.dryRun === true, cleanString(opts.source), received);
    result.ok = false;
    result.dryRun = opts.dryRun === true ? true : false;
    result.accepted = 0;
    result.wouldReject = received;
    result.rejected = received;
    result.blockers = [warning(code || 'dry-run-required')];
    if (received) result.rejectionCodes[code || 'dry-run-required'] = received;
    return result;
  }

  function safeCodeString(value) {
    var s = cleanString(value);
    return /^[A-Za-z0-9._:-]{1,160}$/.test(s) ? s : '';
  }

  function validateReason(reason) {
    if (reason == null || reason === '') return null;
    if (typeof reason !== 'string') return 'invalid-reason';
    if (reason.length > 256) return 'invalid-reason';
    if (/[\u0000-\u001f\u007f]/.test(reason)) return 'invalid-reason';
    return null;
  }

  function validateRequiredReason(reason) {
    if (typeof reason !== 'string') return 'invalid-reason';
    var trimmed = reason.trim();
    if (!trimmed) return 'invalid-reason';
    if (trimmed.length > 256) return 'invalid-reason';
    if (/[\u0000-\u001f\u007f]/.test(reason)) return 'invalid-reason';
    return null;
  }

  function findSuspiciousField(value) {
    var seen = [];
    function visit(v) {
      if (!v || typeof v !== 'object') return null;
      if (seen.indexOf(v) !== -1) return null;
      seen.push(v);
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          var arrHit = visit(v[i]);
          if (arrHit) return arrHit;
        }
        return null;
      }
      var keys = Object.keys(v);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var normalized = String(key || '').toLowerCase();
        if (SUSPICIOUS_CANDIDATE_FIELDS[normalized]) return key;
        var hit = visit(v[key]);
        if (hit) return hit;
      }
      return null;
    }
    return visit(value);
  }

  function candidateDedupeKey(candidate) {
    if (safeCodeString(candidate.dedupeKeyHash)) {
      return { ok: true, key: 'candidate-hash:' + cleanString(candidate.dedupeKeyHash), warnings: [] };
    }
    if (candidate.dedupeKeyHashPresent === true) return { ok: false, code: 'missing-dedupe-material' };
    return { ok: false, code: 'missing-dedupe-material' };
  }

  function validateCandidate(candidate) {
    var blockers = [];
    var warnings = [];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { ok: false, blockers: [warning('invalid-candidate')], warnings: warnings };
    }
    var suspicious = findSuspiciousField(candidate);
    if (suspicious) blockers.push(warning('content-like-field-blocked'));
    if (candidate.schema !== CONFLICT_CANDIDATE_SCHEMA) blockers.push(warning('invalid-schema'));
    if (!hasOwn(CONFLICT_KINDS, candidate.conflictKind)) blockers.push(warning('invalid-conflict-kind'));
    if (!hasOwn(ENTITY_KINDS, candidate.entityKind)) blockers.push(warning('invalid-entity-kind'));
    if (!hasOwn(CLASSIFICATIONS, candidate.classification)) blockers.push(warning('invalid-classification'));
    if (!hasOwn(SEVERITIES, candidate.severity)) blockers.push(warning('invalid-severity'));
    if (!hasOwn(CANDIDATE_SOURCES, candidate.source)) blockers.push(warning('invalid-candidate-source'));
    var dedupe = candidateDedupeKey(candidate);
    if (!dedupe.ok) {
      blockers.push(warning(dedupe.code || 'missing-dedupe-material'));
    } else if (Array.isArray(dedupe.warnings)) {
      warnings = warnings.concat(dedupe.warnings);
    }
    return {
      ok: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      dedupeKey: dedupe.key || null,
    };
  }

  function safeTimestamp(value) {
    var s = cleanString(value);
    return /^[0-9T:Z.+-]{1,64}$/.test(s) ? s : null;
  }

  function safeInteger(value) {
    if (value == null || value === '') return null;
    var n = Number(value);
    if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0) return null;
    return n;
  }

  function safeSummaryJson(candidate, side) {
    var c = candidate || {};
    return JSON.stringify({
      redacted: true,
      side: side === 'remote' ? 'remote' : 'local',
      schema: CONFLICT_CANDIDATE_SCHEMA,
      source: cleanString(c.source) || null,
      conflictKind: cleanString(c.conflictKind) || null,
      entityKind: cleanString(c.entityKind) || null,
      classification: cleanString(c.classification) || null,
      severity: cleanString(c.severity) || null,
      updatedAtPresent: side === 'remote'
        ? (c.remoteUpdatedAtPresent === true || !!safeTimestamp(c.remoteUpdatedAt))
        : (c.localUpdatedAtPresent === true || !!safeTimestamp(c.localUpdatedAt)),
      digestPresent: side === 'remote'
        ? (c.remoteDigestPresent === true || !!safeCodeString(c.remoteDigest))
        : (c.localDigestPresent === true || !!safeCodeString(c.localDigest)),
    });
  }

  function safeWarningsJson(candidate) {
    var warnings = [];
    var raw = candidate && Array.isArray(candidate.warnings) ? candidate.warnings : [];
    for (var i = 0; i < raw.length && warnings.length < 50; i++) {
      var item = raw[i];
      var code = null;
      if (typeof item === 'string') code = safeCodeString(item);
      else if (item && typeof item === 'object') code = safeCodeString(item.code);
      if (code) warnings.push({ code: code });
    }
    return JSON.stringify(warnings);
  }

  function buildWritePlan(candidate, validation) {
    return {
      dedupeKey: validation.dedupeKey,
      conflictKind: cleanString(candidate.conflictKind),
      entityKind: cleanString(candidate.entityKind),
      classification: cleanString(candidate.classification),
      severity: cleanString(candidate.severity),
      remoteExportId: safeCodeString(candidate.remoteExportId) || null,
      remoteSequenceNumber: safeInteger(candidate.remoteSequenceNumber),
      localVersionDigest: safeCodeString(candidate.localDigest) || null,
      remoteVersionDigest: safeCodeString(candidate.remoteDigest) || null,
      localUpdatedAt: safeTimestamp(candidate.localUpdatedAt),
      remoteUpdatedAt: safeTimestamp(candidate.remoteUpdatedAt),
      rawLocalSummaryJson: safeSummaryJson(candidate, 'local'),
      rawRemoteSummaryJson: safeSummaryJson(candidate, 'remote'),
      warningsJson: safeWarningsJson(candidate),
    };
  }

  function mergeCommitResult(base, commandResult) {
    if (!commandResult || typeof commandResult !== 'object' || commandResult.schema !== INGEST_SCHEMA) {
      base.ok = false;
      base.blockers = [warning('desktop-conflict-ingest-unavailable')];
      base.failed = base.accepted;
      return base;
    }
    if (commandResult.ok !== true) {
      base.ok = false;
      base.blockers = Array.isArray(commandResult.blockers) ? commandResult.blockers : [warning('desktop-conflict-ingest-failed')];
      base.failed = Number(commandResult.failed || base.accepted || 0) || 0;
      return base;
    }
    base.ok = true;
    base.inserted = Number(commandResult.inserted) || 0;
    base.updated = Number(commandResult.updated) || 0;
    base.failed = Number(commandResult.failed) || 0;
    base.writesPerformed = Number(commandResult.writesPerformed) || (base.inserted + base.updated);
    if (Array.isArray(commandResult.warnings)) {
      commandResult.warnings.forEach(function (w) {
        if (typeof w === 'string') base.warnings.push(warning(w));
        else if (w && typeof w === 'object' && w.code) base.warnings.push(warning(w.code));
      });
    }
    return base;
  }

  function invokeRealIngest(base, source, reason, writePlans) {
    if (!writePlans.length) {
      base.ok = true;
      base.rejected = base.wouldReject;
      return Promise.resolve(base);
    }
    var invoke = getInvoke();
    if (typeof invoke !== 'function' || !detectTauri()) {
      base.ok = false;
      base.failed = base.accepted;
      base.blockers = [warning('desktop-conflict-ingest-unavailable')];
      return Promise.resolve(base);
    }
    return invoke('ingest_conflict_candidates', {
      payload: {
        source: source,
        reason: reason,
        plans: writePlans,
      },
    }).then(function (commandResult) {
      return mergeCommitResult(base, commandResult);
    }).catch(function (e) {
      recordError('ingestConflictCandidates:commit', e);
      base.ok = false;
      base.failed = base.accepted;
      base.blockers = [warning('desktop-conflict-ingest-unavailable')];
      return base;
    });
  }

  function predictExistingDedupe(dedupeKey) {
    return ensureReady().then(function (ok) {
      if (!ok) return false;
      return sqlSelect(
        'SELECT dedupe_key AS dedupeKey FROM ' + TABLE + ' WHERE dedupe_key = ? LIMIT 1',
        [dedupeKey]
      ).then(function (rows) {
        return Array.isArray(rows) && rows.length > 0;
      });
    });
  }

  function ingestConflictCandidates(candidates, options) {
    var opts = options || {};
    var received = Array.isArray(candidates) ? candidates.length : 0;
    if (opts.dryRun !== true && opts.dryRun !== false) {
      return Promise.resolve(makeBlockedIngestResult(candidates, opts, 'dry-run-required'));
    }
    if (!Array.isArray(candidates)) {
      return Promise.resolve(makeBlockedIngestResult([], opts, 'invalid-candidates'));
    }
    var source = cleanString(opts.source);
    if (!hasOwn(INGEST_SOURCES, source)) {
      return Promise.resolve(makeBlockedIngestResult(candidates, opts, 'invalid-source'));
    }
    var reasonBlocker = validateReason(opts.reason);
    if (reasonBlocker) {
      return Promise.resolve(makeBlockedIngestResult(candidates, opts, reasonBlocker));
    }
    if (opts.dryRun === false) {
      var requiredReasonBlocker = validateRequiredReason(opts.reason);
      if (requiredReasonBlocker) {
        return Promise.resolve(makeBlockedIngestResult(candidates, opts, requiredReasonBlocker));
      }
    }

    var result = makeIngestResult(opts.dryRun === true, source, received);
    var accepted = [];
    var writePlans = [];
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      var validation = validateCandidate(candidate);
      if (!validation.ok) {
        result.wouldReject += 1;
        result.rejected += 1;
        validation.blockers.forEach(function (blocker) {
          bumpResultCounter(result.rejectionCodes, blocker.code);
        });
        continue;
      }
      result.accepted += 1;
      bumpResultCounter(result.byKind, candidate.conflictKind);
      bumpResultCounter(result.byEntityKind, candidate.entityKind);
      bumpResultCounter(result.byClassification, candidate.classification);
      bumpResultCounter(result.bySeverity, candidate.severity);
      validation.warnings.forEach(function (w) { result.warnings.push(w); });
      accepted.push({ candidate: candidate, dedupeKey: validation.dedupeKey });
      writePlans.push(buildWritePlan(candidate, validation));
    }

    if (opts.dryRun === false) {
      return invokeRealIngest(result, source, cleanString(opts.reason), writePlans);
    }

    var seenInBatch = Object.create(null);
    function classifyAccepted(index) {
      if (index >= accepted.length) return Promise.resolve(result);
      var item = accepted[index];
      if (seenInBatch[item.dedupeKey]) {
        result.wouldUpdate += 1;
        return classifyAccepted(index + 1);
      }
      seenInBatch[item.dedupeKey] = true;
      return predictExistingDedupe(item.dedupeKey).then(function (exists) {
        if (exists) result.wouldUpdate += 1;
        else result.wouldInsert += 1;
        return classifyAccepted(index + 1);
      }, function (e) {
        recordError('ingestConflictCandidates:predictExistingDedupe', e);
        result.warnings.push(warning('dedupe-lookup-failed'));
        result.wouldInsert += 1;
        return classifyAccepted(index + 1);
      });
    }
    return classifyAccepted(0);
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

  function decisionFailure(code, conflictFound) {
    return {
      schema: DECISION_SCHEMA,
      ok: false,
      conflictFound: conflictFound === true,
      redacted: true,
      platform: 'desktop-tauri',
      status: null,
      decision: null,
      decidedAt: null,
      decidedBySyncPeerIdPresent: false,
      blockers: [warning(code || 'db-unavailable')],
      warnings: [],
    };
  }

  function validConflictId(value) {
    var s = cleanString(value);
    return !!s && s.length <= 256 && !/[\u0000-\u001f\u007f]/.test(s);
  }

  function validDecisionReason(value) {
    var s = cleanString(value);
    return s.length >= 6 && s.length <= 256 && !/[\u0000-\u001f\u007f]/.test(s);
  }

  function isAllowedDecision(status, decision) {
    if (status === 'ignored') return decision === 'ignored-by-operator';
    if (status === 'rejected') return decision === 'rejected-by-operator';
    if (status === 'accepted-later') return decision === 'accepted-for-later-review';
    if (status === 'resolved') return hasOwn(RESOLVED_DECISIONS, decision);
    return false;
  }

  function readLocalSyncPeerIdForDecision() {
    var identity = H2O && H2O.Studio && H2O.Studio.identity;
    if (!identity || typeof identity.whenReady !== 'function') {
      return Promise.reject(new Error('local identity unavailable for conflict decision audit'));
    }
    try {
      return Promise.resolve(identity.whenReady()).then(function (value) {
        var peerId = cleanString(value && value.syncPeerId);
        if (!peerId || peerId.length > 256 || /[\u0000-\u001f\u007f]/.test(peerId)) {
          throw new Error('local identity unavailable for conflict decision audit');
        }
        return peerId;
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function normalizeDecisionResult(result) {
    if (!result || typeof result !== 'object' || result.schema !== DECISION_SCHEMA) {
      return decisionFailure('db-unavailable', false);
    }
    return {
      schema: DECISION_SCHEMA,
      ok: result.ok === true,
      conflictFound: result.conflictFound === true,
      redacted: true,
      platform: 'desktop-tauri',
      status: cleanString(result.status) || null,
      decision: cleanString(result.decision) || null,
      decidedAt: cleanString(result.decidedAt) || null,
      decidedBySyncPeerIdPresent: result.decidedBySyncPeerIdPresent === true,
      blockers: Array.isArray(result.blockers) ? result.blockers.map(function (b) {
        return warning(b && b.code);
      }) : [],
      warnings: Array.isArray(result.warnings) ? result.warnings.map(function (w) {
        return typeof w === 'string' ? warning(w) : warning(w && w.code);
      }) : [],
    };
  }

  function markConflictDecision(input) {
    var opts = input || {};
    var conflictId = cleanString(opts.conflictId);
    var status = cleanString(opts.status);
    var decision = cleanString(opts.decision);
    var reason = cleanString(opts.reason);
    if (!validConflictId(conflictId)) return Promise.resolve(decisionFailure('invalid-conflict-id', false));
    if (!validDecisionReason(reason)) return Promise.resolve(decisionFailure('invalid-reason', false));
    if (!isAllowedDecision(status, decision)) return Promise.resolve(decisionFailure('invalid-decision', false));
    var invoke = getInvoke();
    if (typeof invoke !== 'function' || !detectTauri()) {
      return Promise.resolve(decisionFailure('db-unavailable', false));
    }
    return readLocalSyncPeerIdForDecision().catch(function (e) {
      recordError('markConflictDecision:identity', e);
      return '';
    }).then(function (peerId) {
      if (!peerId) {
        return decisionFailure('identity-unavailable', false);
      }
      return invoke('mark_sync_conflict_decision', {
        payload: {
          conflictId: conflictId,
          status: status,
          decision: decision,
          reason: reason,
          decidedBySyncPeerId: peerId,
        },
      }).then(normalizeDecisionResult).catch(function (e) {
        recordError('markConflictDecision:command', e);
        return decisionFailure('db-unavailable', false);
      });
    });
  }

  function markIgnored(conflictId, reason) {
    return markConflictDecision({
      conflictId: conflictId,
      status: 'ignored',
      decision: 'ignored-by-operator',
      reason: reason,
    });
  }

  function markRejected(conflictId, reason) {
    return markConflictDecision({
      conflictId: conflictId,
      status: 'rejected',
      decision: 'rejected-by-operator',
      reason: reason,
    });
  }

  function markAcceptedLater(conflictId, reason) {
    return markConflictDecision({
      conflictId: conflictId,
      status: 'accepted-later',
      decision: 'accepted-for-later-review',
      reason: reason,
    });
  }

  function markResolved(conflictId, decision, reason) {
    return markConflictDecision({
      conflictId: conflictId,
      status: 'resolved',
      decision: decision,
      reason: reason,
    });
  }

  function previewBase(conflictFound, warnings) {
    return {
      schema: RESOLUTION_PREVIEW_SCHEMA,
      ok: conflictFound === true,
      conflictFound: conflictFound === true,
      redacted: true,
      platform: 'desktop-tauri',
      dryRunOnly: true,
      wouldMutateOnApply: false,
      conflictKind: null,
      entityKind: null,
      status: null,
      classification: null,
      severity: null,
      evidence: {
        localSummaryPresent: false,
        remoteSummaryPresent: false,
        localUpdatedAtPresent: false,
        remoteUpdatedAtPresent: false,
        warningCount: 0,
      },
      options: [],
      recommendedAction: null,
      blockers: [],
      warnings: Array.isArray(warnings) ? warnings : [],
    };
  }

  function normalizeCodeList(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      return typeof item === 'string' ? warning(item) : warning(item && item.code);
    }).filter(function (item) { return !!item.code; });
  }

  function optionLabel(action, available, wouldRequireFutureApply, blockers) {
    return {
      action: action,
      available: available === true,
      wouldRequireFutureApply: wouldRequireFutureApply === true,
      implemented: false,
      blockers: normalizeCodeList(blockers || []),
    };
  }

  function previewWarnings(options) {
    var opts = options || {};
    var warnings = [];
    if (opts.includeSensitive === true) warnings.push(warning('include-sensitive-ignored'));
    if (opts.refreshLocalState === true) warnings.push(warning('local-refresh-not-implemented'));
    return warnings;
  }

  function previewFailure(code, warnings) {
    var out = previewBase(false, warnings);
    out.blockers = [warning(code || 'conflict-not-found')];
    return out;
  }

  function summaryBlockers(conflict) {
    var blockers = [];
    if (!conflict || !conflict.localSummary || conflict.localSummary.present !== true) {
      blockers.push(warning('missing-local-summary'));
    }
    if (!conflict || !conflict.remoteSummary || conflict.remoteSummary.present !== true) {
      blockers.push(warning('missing-remote-summary'));
    }
    return blockers;
  }

  function populatePreviewFromConflict(out, conflict) {
    out.ok = true;
    out.conflictFound = true;
    out.conflictKind = cleanString(conflict && conflict.conflictKind) || null;
    out.entityKind = cleanString(conflict && conflict.entityKind) || null;
    out.status = cleanString(conflict && conflict.status) || null;
    out.classification = cleanString(conflict && conflict.classification) || null;
    out.severity = cleanString(conflict && conflict.severity) || null;
    out.evidence = {
      localSummaryPresent: !!(conflict && conflict.localSummary && conflict.localSummary.present === true),
      remoteSummaryPresent: !!(conflict && conflict.remoteSummary && conflict.remoteSummary.present === true),
      localUpdatedAtPresent: !!(conflict && conflict.localUpdatedAtPresent),
      remoteUpdatedAtPresent: !!(conflict && conflict.remoteUpdatedAtPresent),
      warningCount: Number(conflict && conflict.warningCount) || 0,
    };
    return out;
  }

  function buildPreviewOptions(out, conflict) {
    var kind = cleanString(out.conflictKind);
    var classification = cleanString(out.classification);
    var status = cleanString(out.status);
    if (hasOwn(TERMINAL_STATUSES, status)) {
      out.blockers.push(warning('conflict-status-terminal'));
      return out;
    }
    if (status !== 'pending' && status !== 'accepted-later') {
      out.blockers.push(warning('unsupported-conflict-status'));
      return out;
    }
    if (kind === 'delete-vs-edit-reference' || classification === 'delete-vs-edit-owned-by-f5') {
      out.blockers.push(warning('delete-vs-edit-owned-by-f5'));
      out.options.push(optionLabel('f5-owned-delete-review', true, false, []));
      return out;
    }
    if (!hasOwn(RESOLUTION_PREVIEW_KINDS, kind) || kind === 'unsupported-merge-kind') {
      out.blockers.push(warning('unsupported-conflict-kind'));
      out.blockers.push(warning('resolution-not-implemented'));
      out.options.push(optionLabel('unsupported-resolution', false, false, out.blockers));
      return out;
    }

    var evidenceBlockers = summaryBlockers(conflict);
    out.blockers = out.blockers.concat(evidenceBlockers);
    out.options.push(optionLabel('local-wins-preview', evidenceBlockers.length === 0, true, evidenceBlockers));
    out.options.push(optionLabel('remote-wins-preview', evidenceBlockers.length === 0, true, evidenceBlockers));
    out.options.push(optionLabel('manual-merge-preview', evidenceBlockers.length === 0, true, evidenceBlockers));
    out.options.push(optionLabel('ignore-preview', true, false, []));
    out.options.push(optionLabel('reject-preview', true, false, []));
    if (status === 'pending') {
      out.options.push(optionLabel('accepted-later-preview', true, false, []));
    }
    return out;
  }

  function previewResolution(conflictId, options) {
    var id = cleanString(conflictId);
    var warnings = previewWarnings(options);
    if (!validConflictId(id)) return Promise.resolve(previewFailure('invalid-conflict-id', warnings));
    return getConflict(id).then(function (result) {
      if (!result || result.ok !== true) {
        var blockers = result && Array.isArray(result.blockers) ? result.blockers : [];
        return previewFailure((blockers[0] && blockers[0].code) || 'sync-conflicts-get-failed', warnings);
      }
      if (result.found !== true || !result.conflict) {
        return previewFailure('conflict-not-found', warnings);
      }
      var out = populatePreviewFromConflict(previewBase(true, warnings), result.conflict);
      return buildPreviewOptions(out, result.conflict);
    }).catch(function (e) {
      recordError('previewResolution', e);
      return previewFailure('sync-conflict-resolution-preview-failed', warnings);
    });
  }

  var api = {
    __installed: true,
    __version: '0.1.4-f6.6',
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
    ingestConflictCandidates: ingestConflictCandidates,
    markIgnored: markIgnored,
    markRejected: markRejected,
    markAcceptedLater: markAcceptedLater,
    markResolved: markResolved,
    previewResolution: previewResolution,
    constants: Object.freeze({
      schema: CONFLICT_SCHEMA,
      candidateSchema: CONFLICT_CANDIDATE_SCHEMA,
      diagnosticSchema: DIAGNOSTIC_SCHEMA,
      ingestSchema: INGEST_SCHEMA,
      decisionSchema: DECISION_SCHEMA,
      resolutionPreviewSchema: RESOLUTION_PREVIEW_SCHEMA,
      table: TABLE,
      statuses: Object.freeze(Object.keys(STATUSES).slice()),
      severities: Object.freeze(Object.keys(SEVERITIES).slice()),
      classifications: Object.freeze(Object.keys(CLASSIFICATIONS).slice()),
      conflictKinds: Object.freeze(Object.keys(CONFLICT_KINDS).slice()),
      entityKinds: Object.freeze(Object.keys(ENTITY_KINDS).slice()),
      ingestSources: Object.freeze(Object.keys(INGEST_SOURCES).slice()),
      candidateSources: Object.freeze(Object.keys(CANDIDATE_SOURCES).slice()),
      resolvedDecisions: Object.freeze(Object.keys(RESOLVED_DECISIONS).slice()),
      resolutionPreviewKinds: Object.freeze(Object.keys(RESOLUTION_PREVIEW_KINDS).slice()),
      defaultListLimit: DEFAULT_LIST_LIMIT,
      maxListLimit: MAX_LIST_LIMIT,
    }),
  };
  store.__registerEntity('conflicts', api);

  global.setTimeout(function () {
    init().catch(function (e) { recordError('autoInit', e); });
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
