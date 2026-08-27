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
 * Every status transition is compare-and-swap guarded: the UPDATE names the
 * status it expects to move away from and must affect exactly one row. Reading
 * `validated` and then writing unconditionally would let two concurrent or
 * stale callers both claim the same row and both invoke the package writer,
 * and would let a stale worker regress a correct `written` row to `failed`
 * while a valid package sits on disk. A lost transition is surfaced as
 * `transition-conflict`, never treated as success and never retried here —
 * retry, stale-`writing` recovery and re-arm policy remain M05 lifecycle work.
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

  /* Result code only — never a persisted queue status. Reported when a guarded
   * transition matched no row, i.e. the row moved under this caller. */
  var RESULT_TRANSITION_CONFLICT = 'transition-conflict';

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
  /* tauri-plugin-sql v2's execute command returns a Rust tuple (u64, i64) =
   * (rows_affected, last_insert_id), which Tauri serializes as a JSON array
   * [rowsAffected, lastInsertId]. Some build/version permutations have
   * historically surfaced object shapes too, so we tolerate both. */
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
   * meta_json.materialization.
   *
   * The WHERE clause pins BOTH the request id and the status this transition
   * expects to move away from, so the claim is atomic in SQLite rather than
   * dependent on the caller's earlier read still being true. `expectedStatus`
   * is required; a caller that cannot name the state it is leaving has no
   * business writing the row. Returns { ok, rowsAffected, meta } — ok:false
   * means the row moved under us and nothing was written. */
  async function transitionRequestStatus(input) {
    var opts = safeObject(input);
    var requestId = cleanString(opts.requestId);
    var expectedStatus = cleanString(opts.expectedStatus);
    var nextStatus = cleanString(opts.nextStatus);
    if (!requestId || !expectedStatus || !nextStatus) {
      throw new Error('transitionRequestStatus: requestId, expectedStatus and nextStatus are required');
    }
    var meta = safeObject(opts.currentMeta);
    var materialization = Object.assign({}, safeObject(meta.materialization), safeObject(opts.patch));
    var newMeta = Object.assign({}, meta, { materialization: materialization });
    var cols = ['status = ?', 'updated_at = ?', 'meta_json = ?'];
    var values = [nextStatus, nowIso(), JSON.stringify(newMeta)];
    if (opts.snapshotId != null && cleanString(opts.snapshotId)) { cols.push('snapshot_id = ?'); values.push(cleanString(opts.snapshotId)); }
    values.push(requestId);
    values.push(expectedStatus);
    var executed = await sqlExecute(
      'UPDATE ' + QUEUE_TABLE + ' SET ' + cols.join(', ') + ' WHERE request_id = ? AND status = ?',
      values
    );
    var rowsAffected = readRowsAffected(executed);
    return { ok: rowsAffected === 1, rowsAffected: rowsAffected, meta: newMeta };
  }

  function conflictResult(result, expectedStatus, nextStatus) {
    result.ok = false;
    result.status = RESULT_TRANSITION_CONFLICT;
    result.transitionConflict = { expectedStatus: expectedStatus, nextStatus: nextStatus };
    result.error = 'transition-conflict:' + expectedStatus + '->' + nextStatus;
    return result;
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
      transitionConflict: null,
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
      /* Best-effort report: the missing dependency is the actionable truth, so
       * a lost race is noted but does not replace it. */
      try {
        var depNote = await transitionRequestStatus({
          requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_DB_UNAVAILABLE,
          patch: { errorCode: 'materializer-dependencies-missing', errorMessage: 'resolve/writer ingestion API unavailable', processingFinishedAt: nowIso(), overwrite: false },
          currentMeta: currentMeta,
        });
        if (!depNote.ok) result.transitionConflict = { expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_DB_UNAVAILABLE };
      } catch (_) { /* best-effort */ }
      return result;
    }

    /* Re-resolve against live Desktop store immediately before writing. */
    var normalized = parseJsonObject(row.normalized_request_json);
    var reresolve;
    try { reresolve = await ingestion.resolveSavedChatArchiveRequestV1(normalized); }
    catch (err) {
      result.status = STATUS_DB_UNAVAILABLE;
      result.error = String((err && err.message) || err || 're-resolution failed');
      var threwMove = await transitionRequestStatus({
        requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_DB_UNAVAILABLE,
        patch: { errorCode: 're-resolution-threw', errorMessage: result.error, processingFinishedAt: nowIso(), overwrite: false },
        currentMeta: currentMeta,
      });
      if (!threwMove.ok) return conflictResult(result, STATUS_VALIDATED, STATUS_DB_UNAVAILABLE);
      return result;
    }

    var reStatus = cleanString(reresolve && reresolve.status);
    if (reStatus !== STATUS_VALIDATED) {
      var newStatus = reStatus === STATUS_DB_UNAVAILABLE ? STATUS_DB_UNAVAILABLE : STATUS_NEEDS_DESKTOP_SNAPSHOT;
      var reMove = await transitionRequestStatus({
        requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: newStatus,
        patch: { reresolveStatus: reStatus || 'unknown', errorCode: 're-resolution-not-validated', errorMessage: 'Request no longer validates against Desktop store; not written.', processingFinishedAt: nowIso(), overwrite: false },
        currentMeta: currentMeta,
      });
      if (!reMove.ok) return conflictResult(result, STATUS_VALIDATED, newStatus);
      result.status = newStatus;
      return result;
    }

    var snapshotId = cleanString(reresolve.resolution && reresolve.resolution.snapshotId) || cleanString(row.snapshot_id);
    if (!snapshotId) {
      var noSnapshotMove = await transitionRequestStatus({
        requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_NEEDS_DESKTOP_SNAPSHOT,
        patch: { errorCode: 'snapshot-id-unresolved', errorMessage: 'Re-resolution returned no snapshotId; not written.', processingFinishedAt: nowIso(), overwrite: false },
        currentMeta: currentMeta,
      });
      if (!noSnapshotMove.ok) return conflictResult(result, STATUS_VALIDATED, STATUS_NEEDS_DESKTOP_SNAPSHOT);
      result.status = STATUS_NEEDS_DESKTOP_SNAPSHOT;
      return result;
    }

    /* ── M05 Phase 3: coverage decision ──────────────────────────────────
     *
     * Runs AFTER re-resolution and BEFORE the writing claim, deliberately:
     * freshness must be judged against the exact snapshot re-resolution just
     * selected, and a row should not enter `writing` when no write is needed.
     *
     * Freshness comes only from the Phase 2 authorities — the recomputed
     * package contentHash versus the current projection contentHash. Queue
     * metadata is NEVER consulted for it: `meta_json.materialization` records
     * what happened at write time, which is history, not present truth. */
    var coverage = null;
    if (typeof ingestion.describeSavedChatCoverageV1 === 'function') {
      var coverageChatId = cleanString(reresolve.resolution && reresolve.resolution.studioChatId)
        || cleanString(row.studio_chat_id);
      if (coverageChatId) {
        try {
          coverage = await ingestion.describeSavedChatCoverageV1({ chatId: coverageChatId });
        } catch (err) {
          coverage = null;
        }
      }
    }

    if (coverage) {
      var projectionStatus = cleanString(safeObject(coverage.projection).status);

      if (projectionStatus === 'indeterminate') {
        /* Neither fresh nor stale may be asserted, so publishing would be
         * acting on an unproven negative. DEFER by leaving the row in
         * `validated`: it stays immediately eligible for a later attempt,
         * whereas any transition out of `validated` would strand it until the
         * re-arm work of the next increment exists. No new durable status is
         * introduced. */
        result.status = 'deferred';
        result.deferred = { reason: 'projection-indeterminate', projectionReason: cleanString(coverage.projection.reason) };
        return result;
      }

      if (coverage.covered === true && asArray(coverage.fresh).length > 0) {
        /* ALREADY FRESH — a freshness short-circuit, not filesystem dedupe.
         * A valid package already represents this exact projection, so there
         * is nothing to publish. BEST-HISTORICAL and PRESERVED deliberately do
         * NOT reach here: only `fresh` does.
         *
         * The row still claims `writing` first. That is not a write — it is
         * the existing single-owner mechanism, and `validated -> written` is
         * not a sanctioned edge, so claim-then-complete keeps the edge set
         * unchanged. No publication, CAS or package mutation occurs. */
        var freshEntry = safeObject(asArray(coverage.fresh)[0]);
        var freshSelected = safeObject(coverage.selected);
        var freshPick = cleanString(freshSelected.contentHash) ? freshSelected : freshEntry;
        var freshStartedAt = nowIso();
        var freshClaim = await transitionRequestStatus({
          requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_WRITING,
          patch: { processingStartedAt: freshStartedAt, snapshotId: snapshotId, overwrite: false },
          currentMeta: currentMeta, snapshotId: snapshotId,
        });
        if (!freshClaim.ok) return conflictResult(result, STATUS_VALIDATED, STATUS_WRITING);

        var freshPkg = {
          packagePath: cleanString(freshPick.packagePath),
          schemaVersion: (typeof freshPick.schemaVersion === 'number') ? freshPick.schemaVersion : null,
          payloadVersion: (typeof freshPick.payloadVersion === 'number') ? freshPick.payloadVersion : null,
          contentHash: cleanString(freshPick.contentHash) || null,
          snapshotId: snapshotId,
          writtenAt: freshStartedAt,
          outcome: 'already-fresh',
        };
        var freshDone = await transitionRequestStatus({
          requestId: requestId, expectedStatus: STATUS_WRITING, nextStatus: STATUS_WRITTEN,
          patch: Object.assign({}, freshPkg, { processingStartedAt: freshStartedAt, processingFinishedAt: nowIso(), overwrite: false }),
          currentMeta: currentMeta, snapshotId: snapshotId,
        });
        if (!freshDone.ok) {
          conflictResult(result, STATUS_WRITING, STATUS_WRITTEN);
          result.package = freshPkg;
          return result;
        }
        result.status = STATUS_WRITTEN;
        result.ok = true;
        result.package = freshPkg;
        return result;
      }

      /* Reaching a publication decision from here needs the NEGATIVE
       * conclusion "no fresh package represents this projection". Only a
       * complete scan can support that; a truncated one cannot, so defer
       * rather than publish on an unproven absence. Phase 2 reports `covered`
       * as null (not false) in exactly that case. */
      if (coverage.covered === null && coverage.complete !== true) {
        result.status = 'deferred';
        result.deferred = { reason: 'discovery-incomplete' };
        return result;
      }
    }

    /* validated -> writing. This is the claim: only the caller that actually
     * moves the row out of `validated` may call the package writer. */
    var processingStartedAt = nowIso();
    var claim = await transitionRequestStatus({
      requestId: requestId, expectedStatus: STATUS_VALIDATED, nextStatus: STATUS_WRITING,
      patch: { processingStartedAt: processingStartedAt, snapshotId: snapshotId, overwrite: false },
      currentMeta: currentMeta, snapshotId: snapshotId,
    });
    /* Returning here rather than falling through is load-bearing: `currentMeta`
     * is the pre-claim snapshot, so a later write would stamp stale metadata
     * over whichever caller actually owns the row. */
    if (!claim.ok) return conflictResult(result, STATUS_VALIDATED, STATUS_WRITING);

    /* Call the existing Desktop writer with ONLY the resolved snapshotId.
     * Never pass request/Chrome content as package source; overwrite stays false. */
    var written;
    try {
      written = await ingestion.writeSavedChatPackageV1({ snapshotId: snapshotId, overwrite: false });
    } catch (err) {
      var errorMessage = String((err && err.message) || err || 'package writer failed');
      /* The legacy `package already exists -> failure` mapping is RETIRED.
       * An occupied exact generation is no longer a renderer-adjudicated
       * error: the trusted publisher verifies the occupant itself and returns
       * DEDUPED, which is a successful publication handled below. Only a real
       * throw reaches here. */
      var errorCode = 'package-writer-threw';
      var failMove = await transitionRequestStatus({
        requestId: requestId, expectedStatus: STATUS_WRITING, nextStatus: STATUS_FAILED,
        patch: { errorCode: errorCode, errorMessage: errorMessage, snapshotId: snapshotId, processingStartedAt: processingStartedAt, processingFinishedAt: nowIso(), overwrite: false },
        currentMeta: currentMeta, snapshotId: snapshotId,
      });
      if (!failMove.ok) {
        conflictResult(result, STATUS_WRITING, STATUS_FAILED);
        result.error = 'transition-conflict:' + STATUS_WRITING + '->' + STATUS_FAILED + ' (' + errorCode + ')';
        return result;
      }
      result.status = STATUS_FAILED;
      result.error = errorCode;
      return result;
    }

    var w = safeObject(written);
    /* Trusted-side truth, recorded verbatim. Both Created and DEDUPED are
     * successful materializations: DEDUPED means the trusted publisher found
     * the exact generation already present AND verified it, so there was
     * nothing to write. The renderer never adjudicates that — it consumes the
     * verdict. This metadata is recorded-at-write-time history, never future
     * freshness authority. */
    var pkg = {
      packagePath: cleanString(w.packagePath),
      schemaVersion: (typeof w.schemaVersion === 'number') ? w.schemaVersion : null,
      payloadVersion: (typeof w.payloadVersion === 'number') ? w.payloadVersion : null,
      contentHash: cleanString(w.contentHash) || null,
      snapshotId: cleanString(w.snapshotId) || snapshotId,
      writtenAt: cleanString(w.writtenAt) || nowIso(),
      outcome: cleanString(w.outcome) || (w.deduped === true ? 'deduped' : 'created'),
      deduped: w.deduped === true,
      durabilityComplete: w.durabilityComplete === true,
      advisories: asArray(w.advisories).map(cleanString).filter(Boolean),
    };
    /* writing -> written */
    var doneMove = await transitionRequestStatus({
      requestId: requestId, expectedStatus: STATUS_WRITING, nextStatus: STATUS_WRITTEN,
      patch: Object.assign({}, pkg, { processingStartedAt: processingStartedAt, processingFinishedAt: nowIso(), overwrite: false }),
      currentMeta: currentMeta, snapshotId: pkg.snapshotId,
    });
    if (!doneMove.ok) {
      /* The package exists on disk but this caller no longer owns the row.
       * Report both facts rather than claiming a success we cannot record. */
      conflictResult(result, STATUS_WRITING, STATUS_WRITTEN);
      result.package = pkg;
      return result;
    }
    result.status = STATUS_WRITTEN;
    result.ok = true;
    result.package = pkg;
    return result;
  }
  materializeSavedChatArchiveRequestV1.__installed = true;
  materializeSavedChatArchiveRequestV1.__version = MODULE_VERSION;

  H2O.Studio.ingestion.materializeSavedChatArchiveRequestV1 = materializeSavedChatArchiveRequestV1;
})(typeof window !== 'undefined' ? window : globalThis);
