/* H2O Studio Dev Validation - F6 Conflict Queue Final Validation
 *
 * Desktop/Tauri-only debug harness. It validates the public F6 conflict queue
 * API path from inside the Studio WebView. It intentionally does not use SQL,
 * Rust shortcuts, import/export/sync paths, entity mutation paths, F5 paths,
 * or cleanup/delete helpers.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.devValidation = H2O.Studio.devValidation || {};
  if (H2O.Studio.devValidation.f6FinalValidation &&
      H2O.Studio.devValidation.f6FinalValidation.__installed) return;

  var SCHEMA = 'h2o.studio.f6-final-validation.v1';
  var CANDIDATE_SCHEMA = 'h2o.studio.sync-conflict-candidate.v1';
  var VALIDATION_GATE = 'I_UNDERSTAND_THIS_EXPOSES_CONFLICT_IDS_FOR_VALIDATION';

  var last = null;

  function nowIso() {
    try { return new Date().toISOString(); }
    catch (_) { return null; }
  }

  function cleanCode(value) {
    var s = String(value == null ? '' : value).trim();
    return /^[A-Za-z0-9._:-]{1,160}$/.test(s) ? s : 'validation-error';
  }

  function warning(code) {
    return { code: cleanCode(code || 'warning') };
  }

  function makeSteps() {
    return {
      apiAvailable: false,
      baselineOk: false,
      dryRunOk: false,
      ingestOk: false,
      idResolved: false,
      getOk: false,
      previewOk: false,
      decisionOk: false,
      afterGetOk: false,
      afterPreviewOk: false,
      finalDiagnoseOk: false,
    };
  }

  function makeCounts() {
    return {
      beforeTotal: 0,
      afterTotal: 0,
      insertedOrUpdated: 0,
      pendingAfter: 0,
      acceptedLaterAfter: 0,
    };
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      generatedAt: nowIso(),
      redacted: true,
      steps: makeSteps(),
      counts: makeCounts(),
      conflictIdPresent: false,
      blockers: [],
      warnings: [],
    };
  }

  function fail(result, step, code) {
    result.ok = false;
    result.failedStep = step || 'unknown';
    result.blockers = [warning(code || 'validation-failed')];
    last = cloneResult(result);
    return result;
  }

  function cloneResult(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
  }

  function conflictStore() {
    return H2O && H2O.Studio && H2O.Studio.store && H2O.Studio.store.conflicts;
  }

  function hasFunction(obj, name) {
    return !!(obj && typeof obj[name] === 'function');
  }

  function ensureApis(result) {
    var conflicts = conflictStore();
    var required = [
      'diagnose',
      'ingestConflictCandidates',
      'listConflicts',
      'getConflict',
      'previewResolution',
      'markAcceptedLater',
    ];
    for (var i = 0; i < required.length; i++) {
      if (!hasFunction(conflicts, required[i])) return null;
    }
    result.steps.apiAvailable = true;
    return conflicts;
  }

  function statusCount(diag, status) {
    var byStatus = diag && diag.byStatus;
    return Number((byStatus && byStatus[status]) || 0);
  }

  function totalCount(diag) {
    return Number((diag && diag.total) || 0);
  }

  function buildCandidate(runId) {
    return {
      schema: CANDIDATE_SCHEMA,
      conflictKind: 'same-record-divergent-metadata',
      entityKind: 'folder',
      classification: 'needs-human-review',
      severity: 'medium',
      source: 'multi-peer-diff',
      dedupeKeyHash: 'f6-final-validation-dedupe-' + runId,
      localUpdatedAtPresent: true,
      remoteUpdatedAtPresent: true,
      localDigestPresent: true,
      remoteDigestPresent: true,
      warnings: [{ code: 'f6-final-validation' }],
    };
  }

  function validConflictId(value) {
    var s = String(value == null ? '' : value).trim();
    return !!s && s.length <= 256 && !/[\u0000-\u001f\u007f]/.test(s);
  }

  function resolveConflictId(result, listed, beforeDiag, ingest) {
    var rows = listed && Array.isArray(listed.rows) ? listed.rows : [];
    var inserted = Number(ingest && ingest.inserted) || 0;
    var updated = Number(ingest && ingest.updated) || 0;
    var beforePending = statusCount(beforeDiag, 'pending');
    if (!rows.length) return null;
    if (inserted === 1 || beforePending === 0) {
      return validConflictId(rows[0].conflictId) ? rows[0].conflictId : null;
    }
    if (updated === 1 && beforePending === 1) {
      return validConflictId(rows[0].conflictId) ? rows[0].conflictId : null;
    }
    result.warnings.push(warning('validation-conflict-id-ambiguous'));
    return null;
  }

  function assertRedactedResult(result) {
    var s = '';
    try { s = JSON.stringify(result); }
    catch (_) { return false; }
    return !/"conflictId"\s*:|dedupe|peer[_-]?id|record[_-]?id|raw[_-]?json|title|href|url|prompt|answer|transcript|content|metadata/i.test(s);
  }

  function run() {
    var result = baseResult();
    var conflicts = ensureApis(result);
    if (!conflicts) return Promise.resolve(fail(result, 'apiAvailable', 'conflict-store-api-unavailable'));

    var runId = 'f6-final-validation-' + Date.now().toString(36);
    var candidate = buildCandidate(runId);
    var beforeDiag = null;
    var conflictId = null;

    return Promise.resolve()
      .then(function () {
        return conflicts.diagnose();
      })
      .then(function (diag) {
        if (!diag || diag.ready !== true) throw { step: 'baseline', code: 'baseline-diagnose-failed' };
        beforeDiag = diag;
        result.steps.baselineOk = true;
        result.counts.beforeTotal = totalCount(diag);
        return conflicts.ingestConflictCandidates([candidate], {
          source: 'manual-devtools',
          reason: 'f6 final validation dry run',
          dryRun: true,
        });
      })
      .then(function (dryRun) {
        if (!dryRun || dryRun.ok !== true || dryRun.dryRun !== true ||
            Number(dryRun.accepted) !== 1 || Number(dryRun.writesPerformed) !== 0) {
          throw { step: 'dryRun', code: 'dry-run-validation-failed' };
        }
        result.steps.dryRunOk = true;
        return conflicts.ingestConflictCandidates([candidate], {
          source: 'manual-devtools',
          reason: 'f6 final validation manual ingest',
          dryRun: false,
        });
      })
      .then(function (ingest) {
        var inserted = Number(ingest && ingest.inserted) || 0;
        var updated = Number(ingest && ingest.updated) || 0;
        if (!ingest || ingest.ok !== true || ingest.dryRun !== false ||
            Number(ingest.accepted) !== 1 || (inserted + updated) < 1) {
          throw { step: 'ingest', code: 'manual-ingest-failed' };
        }
        result.steps.ingestOk = true;
        result.counts.insertedOrUpdated = inserted + updated;
        return conflicts.listConflicts({
          status: 'pending',
          limit: 50,
          includeIdsForManualValidation: true,
          validationGate: VALIDATION_GATE,
        }).then(function (listed) {
          if (!listed || listed.ok !== true || !Array.isArray(listed.rows)) {
            throw { step: 'idResolved', code: 'validation-list-failed' };
          }
          conflictId = resolveConflictId(result, listed, beforeDiag, ingest);
          if (!conflictId) throw { step: 'idResolved', code: 'unable-to-resolve-validation-conflict-id' };
          result.steps.idResolved = true;
          result.conflictIdPresent = true;
          return conflicts.getConflict(conflictId);
        });
      })
      .then(function (conflict) {
        if (!conflict || conflict.ok !== true || conflict.found !== true || !conflict.conflict) {
          throw { step: 'getConflict', code: 'get-conflict-failed' };
        }
        if (conflict.conflict.status !== 'pending') {
          throw { step: 'getConflict', code: 'validation-conflict-not-pending' };
        }
        result.steps.getOk = true;
        return conflicts.previewResolution(conflictId, {
          includeSensitive: false,
          refreshLocalState: false,
        });
      })
      .then(function (preview) {
        if (!preview || preview.ok !== true || preview.dryRunOnly !== true ||
            preview.wouldMutateOnApply !== false || !Array.isArray(preview.options)) {
          throw { step: 'previewResolution', code: 'preview-resolution-failed' };
        }
        result.steps.previewOk = true;
        return conflicts.markAcceptedLater(conflictId, 'f6 final validation accepted later');
      })
      .then(function (decision) {
        if (!decision || decision.ok !== true || decision.status !== 'accepted-later' ||
            decision.decision !== 'accepted-for-later-review') {
          throw { step: 'decision', code: 'decision-action-failed' };
        }
        result.steps.decisionOk = true;
        return conflicts.getConflict(conflictId);
      })
      .then(function (afterGet) {
        if (!afterGet || afterGet.ok !== true || afterGet.found !== true ||
            !afterGet.conflict || afterGet.conflict.status !== 'accepted-later') {
          throw { step: 'afterGet', code: 'after-decision-get-failed' };
        }
        result.steps.afterGetOk = true;
        return conflicts.previewResolution(conflictId, {
          includeSensitive: false,
          refreshLocalState: false,
        });
      })
      .then(function (afterPreview) {
        if (!afterPreview || afterPreview.ok !== true || afterPreview.dryRunOnly !== true ||
            afterPreview.wouldMutateOnApply !== false) {
          throw { step: 'afterPreview', code: 'after-decision-preview-failed' };
        }
        result.steps.afterPreviewOk = true;
        return conflicts.diagnose();
      })
      .then(function (afterDiag) {
        if (!afterDiag || afterDiag.ready !== true) {
          throw { step: 'finalDiagnose', code: 'final-diagnose-failed' };
        }
        result.steps.finalDiagnoseOk = true;
        result.counts.afterTotal = totalCount(afterDiag);
        result.counts.pendingAfter = statusCount(afterDiag, 'pending');
        result.counts.acceptedLaterAfter = statusCount(afterDiag, 'accepted-later');
        result.ok = true;
        result.generatedAt = nowIso();
        result.blockers = [];
        if (!assertRedactedResult(result)) {
          throw { step: 'redaction', code: 'validation-output-redaction-failed' };
        }
        last = cloneResult(result);
        return result;
      })
      .catch(function (err) {
        var step = cleanCode(err && err.step) || 'unknown';
        var code = cleanCode(err && err.code) || 'f6-final-validation-failed';
        result.generatedAt = nowIso();
        result.conflictIdPresent = !!conflictId;
        return fail(result, step, code);
      });
  }

  function lastResult() {
    return cloneResult(last);
  }

  function clearLastResult() {
    last = null;
    return true;
  }

  H2O.Studio.devValidation.f6FinalValidation = Object.freeze({
    __installed: true,
    __version: '0.1.0-f6-final-validation',
    run: run,
    lastResult: lastResult,
    clearLastResult: clearLastResult,
    constants: Object.freeze({
      schema: SCHEMA,
    }),
  });

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
