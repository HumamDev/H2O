/* H2O Studio — Saved Chat Archive Request Materializer (Desktop / Tauri)
 *
 * Chat Saving Architecture Phase D.2C. Desktop-only trigger that materializes a
 * package from a persisted `validated` request in the saved_chat_archive_requests
 * queue. It:
 *   - loads the queue row by requestId,
 *   - accepts ONLY status `validated` (idempotent no-op for `written`,
 *     not-eligible for anything else, not-found when absent),
 *   - RE-RESOLVES the persisted normalized request against live Desktop store
 *     state (H2O.Studio.ingestion.resolveSavedChatArchiveRequestV1) immediately
 *     before writing, and bails (no write) if it no longer validates,
 *   - on still-validated, transitions validated -> writing, calls the existing
 *     Desktop writer writeSavedChatPackageV1({ snapshotId, overwrite:false })
 *     passing ONLY the resolved Desktop snapshotId, then transitions
 *     writing -> written (or writing -> failed).
 *
 * Trust boundary: Desktop is the only package writer. Chrome/request content is
 * NON-AUTHORITATIVE — it is never passed to the writer and is never used to build
 * package files or compute contentHash. The only DB mutation is the
 * saved_chat_archive_requests row (status / updated_at / meta_json, and snapshot_id
 * only if re-resolution corrected it); package files are written solely by the
 * existing writer under $APPLOCALDATA/archive/packages. No migration is added —
 * result metadata lives in meta_json.materialization. No overwrite by default, no
 * retry/batch/stale-writing recovery, no Chrome runtime, no sync/import/recovery.
 *
 * Public API:
 *   H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1({ requestId, overwrite=false })
 *
 * Contracts: docs/systems/archive/saved-chat-archive-request-v1.md
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
  H2O.Studio.ingestion = H2O.Studio.ingestion || {};
  if (H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1 && H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1.__installed) return;

  var DB_URL = 'sqlite:studio-v1.db';
  var QUEUE_TABLE = 'saved_chat_archive_requests';
  var MODULE_VERSION = '0.1.0-phase-d-2c';

  var STATUS_VALIDATED = 'validated';
  var STATUS_WRITING = 'writing';
  var STATUS_WRITTEN = 'written';
  var STATUS_FAILED = 'failed';
  var STATUS_NEEDS_DESKTOP_SNAPSHOT = 'needs-desktop-snapshot';
  var STATUS_DB_UNAVAILABLE = 'db-unavailable';

  function nowIso() { try { return new Date().toISOString(); } catch (_) { return ''; } }
  function cleanString(v) { return String(v == null ? '' : v).trim(); }
  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeObject(v) { return isObject(v) ? v : {}; }
  function asArray(v) { return Array.isArray(v) ? v : []; }
  function parseJsonObject(text) {
    if (isObject(text)) return text;
    if (typeof text !== 'string' || !text.trim()) return {};
    try { var v = JSON.parse(text); return isObject(v) ? v : {}; } catch (_) { return {}; }
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

  function getIngestion() { return (H2O.Studio && H2O.Studio.ingestion) || {}; }

  async function loadQueueRow(requestId) {
    var rows = await sqlSelect(
      'SELECT request_id, status, snapshot_id, studio_chat_id, normalized_request_json, meta_json FROM ' +
      QUEUE_TABLE + ' WHERE request_id = ? LIMIT 1',
      [requestId]
    );
    return asArray(rows)[0] || null;
  }

  /* Update only the saved_chat_archive_requests row: status / updated_at /
   * meta_json (+ snapshot_id when provided). Merges patch into
   * meta_json.materialization. */
  async function updateQueueRow(requestId, status, materializationPatch, currentMeta, snapshotIdOpt) {
    var meta = safeObject(currentMeta);
    var materialization = Object.assign({}, safeObject(meta.materialization), safeObject(materializationPatch));
    var newMeta = Object.assign({}, meta, { materialization: materialization });
    var cols = ['status = ?', 'updated_at = ?', 'meta_json = ?'];
    var values = [status, nowIso(), JSON.stringify(newMeta)];
    if (snapshotIdOpt != null && cleanString(snapshotIdOpt)) { cols.push('snapshot_id = ?'); values.push(cleanString(snapshotIdOpt)); }
    values.push(requestId);
    await sqlExecute('UPDATE ' + QUEUE_TABLE + ' SET ' + cols.join(', ') + ' WHERE request_id = ?', values);
    return newMeta;
  }

  function packageFromMaterialization(mat) {
    var m = safeObject(mat);
    if (!cleanString(m.packagePath)) return null;
    return {
      packagePath: cleanString(m.packagePath),
      schemaVersion: (typeof m.schemaVersion === 'number') ? m.schemaVersion : (m.schemaVersion == null ? null : m.schemaVersion),
      payloadVersion: (typeof m.payloadVersion === 'number') ? m.payloadVersion : (m.payloadVersion == null ? null : m.payloadVersion),
      contentHash: cleanString(m.contentHash) || null,
      snapshotId: cleanString(m.snapshotId) || null,
      writtenAt: cleanString(m.writtenAt) || null,
    };
  }

  function baseResult(requestId, status) {
    return {
      ok: false,
      status: status,
      requestId: cleanString(requestId) || null,
      previousStatus: null,
      packageWriteDeferred: false,
      chromeRuntime: false,
      syncTransport: false,
      package: null,
      error: null,
    };
  }

  async function materializeSavedChatArchiveRequestV1(options) {
    var opts = safeObject(options);
    var requestId = cleanString(opts.requestId);
    var result = baseResult(requestId, 'not-found');
    if (!requestId) return result;

    var row;
    try { row = await loadQueueRow(requestId); }
    catch (err) {
      result.status = STATUS_DB_UNAVAILABLE;
      result.error = String((err && err.message) || err || 'queue read failed');
      return result;
    }
    if (!row) return result; /* not-found */

    var previousStatus = cleanString(row.status);
    result.previousStatus = previousStatus;
    var currentMeta = parseJsonObject(row.meta_json);

    /* Idempotent: already written → return persisted package, no writer call. */
    if (previousStatus === STATUS_WRITTEN) {
      result.status = 'already-written';
      result.ok = true;
      result.package = packageFromMaterialization(currentMeta.materialization);
      return result;
    }

    /* Only `validated` rows are eligible to materialize. */
    if (previousStatus !== STATUS_VALIDATED) {
      result.status = 'not-eligible';
      return result;
    }

    var ingestion = getIngestion();
    if (typeof ingestion.resolveSavedChatArchiveRequestV1 !== 'function' || typeof ingestion.writeSavedChatPackageV1 !== 'function') {
      result.status = STATUS_DB_UNAVAILABLE;
      result.error = 'materializer-dependencies-missing';
      try { await updateQueueRow(requestId, STATUS_DB_UNAVAILABLE, { errorCode: 'materializer-dependencies-missing', errorMessage: 'resolve/writer ingestion API unavailable', processingFinishedAt: nowIso(), overwrite: false }, currentMeta); }
      catch (_) { /* best-effort */ }
      return result;
    }

    /* Re-resolve against live Desktop store immediately before writing. */
    var normalized = parseJsonObject(row.normalized_request_json);
    var reresolve;
    try { reresolve = await ingestion.resolveSavedChatArchiveRequestV1(normalized); }
    catch (err) {
      result.status = STATUS_DB_UNAVAILABLE;
      result.error = String((err && err.message) || err || 're-resolution failed');
      await updateQueueRow(requestId, STATUS_DB_UNAVAILABLE, { errorCode: 're-resolution-threw', errorMessage: result.error, processingFinishedAt: nowIso(), overwrite: false }, currentMeta);
      return result;
    }

    var reStatus = cleanString(reresolve && reresolve.status);
    if (reStatus !== STATUS_VALIDATED) {
      var newStatus = reStatus === STATUS_DB_UNAVAILABLE ? STATUS_DB_UNAVAILABLE : STATUS_NEEDS_DESKTOP_SNAPSHOT;
      await updateQueueRow(requestId, newStatus, { reresolveStatus: reStatus || 'unknown', errorCode: 're-resolution-not-validated', errorMessage: 'Request no longer validates against Desktop store; not written.', processingFinishedAt: nowIso(), overwrite: false }, currentMeta);
      result.status = newStatus;
      return result;
    }

    var snapshotId = cleanString(reresolve.resolution && reresolve.resolution.snapshotId) || cleanString(row.snapshot_id);
    if (!snapshotId) {
      await updateQueueRow(requestId, STATUS_NEEDS_DESKTOP_SNAPSHOT, { errorCode: 'snapshot-id-unresolved', errorMessage: 'Re-resolution returned no snapshotId; not written.', processingFinishedAt: nowIso(), overwrite: false }, currentMeta);
      result.status = STATUS_NEEDS_DESKTOP_SNAPSHOT;
      return result;
    }

    /* validated -> writing */
    var processingStartedAt = nowIso();
    await updateQueueRow(requestId, STATUS_WRITING, { processingStartedAt: processingStartedAt, snapshotId: snapshotId, overwrite: false }, currentMeta, snapshotId);

    /* Call the existing Desktop writer with ONLY the resolved snapshotId.
     * Never pass request/Chrome content as package source; overwrite stays false. */
    var written;
    try {
      written = await ingestion.writeSavedChatPackageV1({ snapshotId: snapshotId, overwrite: false });
    } catch (err) {
      var errorMessage = String((err && err.message) || err || 'package writer failed');
      var errorCode = /already exists/i.test(errorMessage) ? 'package-already-exists' : 'package-writer-threw';
      await updateQueueRow(requestId, STATUS_FAILED, { errorCode: errorCode, errorMessage: errorMessage, snapshotId: snapshotId, processingStartedAt: processingStartedAt, processingFinishedAt: nowIso(), overwrite: false }, currentMeta, snapshotId);
      result.status = STATUS_FAILED;
      result.error = errorCode;
      return result;
    }

    var w = safeObject(written);
    var pkg = {
      packagePath: cleanString(w.packagePath),
      schemaVersion: (typeof w.schemaVersion === 'number') ? w.schemaVersion : null,
      payloadVersion: (typeof w.payloadVersion === 'number') ? w.payloadVersion : null,
      contentHash: cleanString(w.contentHash) || null,
      snapshotId: cleanString(w.snapshotId) || snapshotId,
      writtenAt: cleanString(w.writtenAt) || nowIso(),
    };
    /* writing -> written */
    await updateQueueRow(requestId, STATUS_WRITTEN, Object.assign({}, pkg, { processingStartedAt: processingStartedAt, processingFinishedAt: nowIso(), overwrite: false }), currentMeta, pkg.snapshotId);
    result.status = STATUS_WRITTEN;
    result.ok = true;
    result.package = pkg;
    return result;
  }
  materializeSavedChatArchiveRequestV1.__installed = true;
  materializeSavedChatArchiveRequestV1.__version = MODULE_VERSION;

  H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1 = materializeSavedChatArchiveRequestV1;
})(typeof window !== 'undefined' ? window : globalThis);
