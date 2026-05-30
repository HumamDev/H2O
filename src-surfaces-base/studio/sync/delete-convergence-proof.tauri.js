/* H2O Desktop Sync - F12.0.5 delete convergence runtime proof
 *
 * Desktop/Tauri-only dogfood validation harness for the existing reviewed
 * delete convergence chain.
 *
 * Safety invariants:
 *   - Proof only. This module adds no delete, apply, proposal, F5 review,
 *     bookkeeping, publication, outbox/inbox, WebDAV, convergence, or mobile
 *     write-back behavior.
 *   - Positive proof calls existing APIs only:
 *       checkDeleteMaterialization()
 *       runDeleteConvergencePreflight()
 *       generateDeleteProposalCandidate()
 *       previewDeleteF5Handoff()
 *       createDeleteF5ReviewRow()
 *       executeReviewedDelete()
 *       buildDeleteApplyEvent()
 *       finalizeDeleteConvergence()
 *   - The harness does not approve F5 review rows. A destructive positive
 *     proof requires an already approved reviewId supplied by the operator.
 *   - Negative proofs are validation calls only and run before any reviewed
 *     local delete action.
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
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__deleteConvergenceProofInstalled) return;

  var SCHEMA = 'h2o.desktop.sync.delete-convergence-proof.v1';
  var VERSION = '0.1.0-f12.0.5';
  var FOREVER_NO_FIELDS = [
    'content', 'body', 'text', 'messages', 'attachments',
    'name', 'title', 'folderName', 'chatTitle', 'rawId', 'chatId',
    'folderId', 'targetFolderId', 'parentId', 'targetParentId',
    'sourceParentId', 'path', 'url', 'password', 'apiKey',
    'proposedName', 'targetName', 'previousName', 'rawName',
    'recoverySnapshot', 'rawSnapshot'
  ];

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }

  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean);
  }

  function changedFields(entry) {
    return asArray(safeObject(entry).changedFields).map(cleanString).filter(Boolean).sort();
  }

  function foreverNoKey(value) {
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        var arrHit = foreverNoKey(value[i]);
        if (arrHit) return arrHit;
      }
      return '';
    }
    if (!isObject(value)) return '';
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k += 1) {
      var key = keys[k];
      if (FOREVER_NO_FIELDS.indexOf(key) !== -1) return key;
      if (/Token$/.test(key) && key !== 'previewToken') return key;
      var childHit = foreverNoKey(value[key]);
      if (childHit) return childHit;
    }
    return '';
  }

  function baseResult() {
    return {
      schema: SCHEMA,
      ok: false,
      materializationOk: false,
      preflightOk: false,
      proposalOk: false,
      reviewOk: false,
      deleteOk: false,
      applyEventOk: false,
      consumedOk: false,
      watermarkOk: false,
      negativeProofs: {
        membershipBlocked: false,
        childFoldersBlocked: false,
        deleteVsEditBlocked: false,
        missingTombstoneBlocked: false
      },
      blockers: [],
      warnings: []
    };
  }

  function finish(result) {
    var negative = safeObject(result.negativeProofs);
    result.ok = result.materializationOk === true &&
      result.preflightOk === true &&
      result.proposalOk === true &&
      result.reviewOk === true &&
      result.deleteOk === true &&
      result.applyEventOk === true &&
      result.consumedOk === true &&
      result.watermarkOk === true &&
      negative.membershipBlocked === true &&
      negative.childFoldersBlocked === true &&
      negative.deleteVsEditBlocked === true &&
      negative.missingTombstoneBlocked === true &&
      result.blockers.length === 0;
    var forbidden = foreverNoKey(result);
    if (forbidden) {
      result.ok = false;
      addCode(result.blockers, 'delete-proof-output-contains-forbidden-field');
      addCode(result.warnings, 'blocked-forbidden-key-' + forbidden);
    }
    return result;
  }

  function requireApis(result) {
    var sync = H2O.Desktop.Sync;
    [
      'checkDeleteMaterialization',
      'runDeleteConvergencePreflight',
      'generateDeleteProposalCandidate',
      'previewDeleteF5Handoff',
      'createDeleteF5ReviewRow',
      'executeReviewedDelete',
      'buildDeleteApplyEvent',
      'finalizeDeleteConvergence'
    ].forEach(function (name) {
      if (!sync || typeof sync[name] !== 'function') addCode(result.blockers, name + '-unavailable');
    });
  }

  function isDeleteEntry(entry) {
    var row = safeObject(entry);
    var bucket = cleanString(row.bucket || row.sourceBucket || row.bucketName).toLowerCase();
    var reason = cleanString(row.reason || row.divergenceReason || row.conflictKind).toLowerCase();
    var operation = cleanString(row.operation || safeObject(row.proposedOperation).operation).toLowerCase();
    var intent = cleanString(row.operationIntent || safeObject(row.proposedOperation).operationIntent).toLowerCase();
    var fields = changedFields(row);
    if (bucket === 'deleted' || bucket === 'destructive' || bucket === 'delete') return true;
    if (reason.indexOf('delete') !== -1 && reason.indexOf('vs') === -1) return true;
    if (operation.indexOf('delete') !== -1 || intent === 'delete') return true;
    if (row.deleted === true || row.tombstoned === true) return true;
    return fields.length === 1 && (fields[0] === 'delete' || fields[0] === 'deleted' || fields[0] === 'tombstone');
  }

  async function firstPlannerDeleteEntry(warnings) {
    var sync = H2O.Desktop.Sync;
    if (!sync || typeof sync.buildConvergencePlan !== 'function') return null;
    try {
      var plan = safeObject(await sync.buildConvergencePlan());
      var buckets = safeObject(plan.buckets);
      var order = ['proposalEligible', 'needsPreview', 'conflicted', 'blocked', 'stale', 'replay'];
      for (var i = 0; i < order.length; i += 1) {
        var rows = asArray(buckets[order[i]]);
        for (var j = 0; j < rows.length; j += 1) {
          if (isDeleteEntry(rows[j])) return safeObject(rows[j]);
        }
      }
    } catch (_) {
      addCode(warnings, 'convergence-plan-read-failed');
    }
    return null;
  }

  async function sourceEntry(args, blockers, warnings) {
    var entry = safeObject(args.plannerEntry || args.entry || args.candidate);
    if (Object.keys(entry).length) return entry;
    entry = await firstPlannerDeleteEntry(warnings);
    if (!entry) addCode(blockers, 'delete-proof-entry-required');
    return safeObject(entry);
  }

  function blocked(output) {
    var row = safeObject(output);
    return row.ok !== true && codeList(row.blockers).length > 0;
  }

  async function runMaterialization(entry) {
    return safeObject(await H2O.Desktop.Sync.checkDeleteMaterialization({
      plannerEntry: entry
    }));
  }

  async function runPreflight(entry) {
    return safeObject(await H2O.Desktop.Sync.runDeleteConvergencePreflight({
      plannerEntry: entry
    }));
  }

  async function membershipProof(args, result) {
    var entry = safeObject(args.membershipPlannerEntry || args.nonEmptyMembershipEntry);
    if (!Object.keys(entry).length) {
      addCode(result.warnings, 'membership-negative-fixture-unavailable');
      return;
    }
    try {
      var output = await runMaterialization(entry);
      var blockers = codeList(output.blockers);
      result.negativeProofs.membershipBlocked = blocked(output) &&
        (Number(output.membershipCount) > 0 ||
          blockers.indexOf('folder-membership-present') !== -1 ||
          blockers.indexOf('folder-not-empty') !== -1);
      if (!result.negativeProofs.membershipBlocked) addCode(result.blockers, 'membership-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'membership-negative-proof-failed');
    }
  }

  async function childFolderProof(args, result) {
    var entry = safeObject(args.childFolderPlannerEntry || args.nonEmptyChildEntry);
    if (!Object.keys(entry).length) {
      addCode(result.warnings, 'child-folder-negative-fixture-unavailable');
      return;
    }
    try {
      var output = await runMaterialization(entry);
      var blockers = codeList(output.blockers);
      result.negativeProofs.childFoldersBlocked = blocked(output) &&
        (Number(output.childFolderCount) > 0 ||
          blockers.indexOf('child-folder-present') !== -1 ||
          blockers.indexOf('folder-not-empty') !== -1);
      if (!result.negativeProofs.childFoldersBlocked) addCode(result.blockers, 'child-folder-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'child-folder-negative-proof-failed');
    }
  }

  function withDeleteVsEdit(entry) {
    var clone = Object.assign({}, safeObject(entry));
    clone.changedFields = ['name'];
    clone.conflictKind = 'delete-vs-rename';
    clone.reason = 'delete-vs-edit';
    return clone;
  }

  async function deleteVsEditProof(entry, result) {
    try {
      var output = await runPreflight(withDeleteVsEdit(entry));
      result.negativeProofs.deleteVsEditBlocked = blocked(output) &&
        codeList(output.blockers).indexOf('delete-vs-edit-conflict') !== -1;
      if (!result.negativeProofs.deleteVsEditBlocked) addCode(result.blockers, 'delete-vs-edit-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'delete-vs-edit-negative-proof-failed');
    }
  }

  async function missingTombstoneProof(entry, result) {
    try {
      var output = safeObject(await H2O.Desktop.Sync.buildDeleteApplyEvent({
        deleteResult: {
          deleted: true,
          subjectId: cleanString(entry.subjectId),
          lineageId: cleanString(entry.lineageId || entry.proposalLineageId || 'delete-proof-lineage'),
          tombstoneId: '',
          auditMaintenanceId: ''
        }
      }));
      result.negativeProofs.missingTombstoneBlocked = blocked(output) &&
        (codeList(output.blockers).indexOf('tombstone-id-invalid') !== -1 ||
          codeList(output.blockers).indexOf('tombstone-not-found') !== -1);
      if (!result.negativeProofs.missingTombstoneBlocked) addCode(result.blockers, 'missing-tombstone-negative-proof-not-blocked');
    } catch (_) {
      addCode(result.blockers, 'missing-tombstone-negative-proof-failed');
    }
  }

  function token(name) {
    return cleanString(H2O.Desktop.Sync && H2O.Desktop.Sync[name]);
  }

  async function runDeleteConvergenceProof(input) {
    var args = safeObject(input);
    var result = baseResult();
    requireApis(result);
    if (result.blockers.length) return finish(result);

    var entry = await sourceEntry(args, result.blockers, result.warnings);
    if (result.blockers.length) return finish(result);

    var materialization = null;
    var preflight = null;
    var proposal = null;
    var handoff = null;
    var review = null;
    var deleteResult = null;
    var applyEventResult = null;
    var bookkeeping = null;
    var candidateId = cleanString(args.candidateId);
    var reviewId = cleanString(args.reviewId || args.approvedReviewId);

    try {
      materialization = await runMaterialization(entry);
      result.materializationOk = materialization.ok === true &&
        materialization.emptyFolder === true &&
        materialization.baseFresh === true &&
        materialization.deleteVsEditConflict === false &&
        materialization.recoveryReady === true &&
        materialization.tombstoneCapable === true;
      codeList(materialization.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(materialization.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'delete-proof-materialization-failed');
    }
    if (!result.materializationOk) return finish(result);

    try {
      preflight = await runPreflight(entry);
      result.preflightOk = preflight.ok === true && preflight.actionable === true;
      codeList(preflight.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(preflight.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'delete-proof-preflight-failed');
    }
    if (!result.preflightOk) return finish(result);

    await membershipProof(args, result);
    await childFolderProof(args, result);
    await deleteVsEditProof(entry, result);
    await missingTombstoneProof(entry, result);
    if (result.blockers.length) return finish(result);

    if (candidateId) {
      result.proposalOk = true;
    } else {
      try {
        proposal = safeObject(await H2O.Desktop.Sync.generateDeleteProposalCandidate({
          plannerEntry: entry,
          operatorApprovalToken: token('__deleteProposalCandidateApprovalToken')
        }));
        result.proposalOk = proposal.ok === true &&
          safeObject(proposal.proposalCandidate).kind === 'proposal' &&
          !!cleanString(proposal.candidateId);
        candidateId = cleanString(proposal.candidateId);
        codeList(proposal.blockers).forEach(function (code) { addCode(result.blockers, code); });
        codeList(proposal.warnings).forEach(function (code) { addCode(result.warnings, code); });
      } catch (_) {
        addCode(result.blockers, 'delete-proof-proposal-generation-failed');
      }
    }
    if (!result.proposalOk) return finish(result);

    try {
      handoff = safeObject(await H2O.Desktop.Sync.previewDeleteF5Handoff({ candidateId: candidateId }));
      codeList(handoff.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(handoff.warnings).forEach(function (code) { addCode(result.warnings, code); });
      if (handoff.ok !== true || handoff.handoffReady !== true) addCode(result.blockers, 'delete-proof-handoff-not-ready');
    } catch (_) {
      addCode(result.blockers, 'delete-proof-handoff-preview-failed');
    }
    if (result.blockers.length) return finish(result);

    if (reviewId) {
      result.reviewOk = true;
    } else {
      try {
        review = safeObject(await H2O.Desktop.Sync.createDeleteF5ReviewRow({
          candidateId: candidateId,
          operatorApprovalToken: token('__deleteF5ReviewRowApprovalToken')
        }));
        result.reviewOk = review.ok === true && isObject(review.reviewRow);
        codeList(review.blockers).forEach(function (code) { addCode(result.blockers, code); });
        codeList(review.warnings).forEach(function (code) { addCode(result.warnings, code); });
        reviewId = cleanString(safeObject(review.reviewRow).reviewId);
      } catch (_) {
        addCode(result.blockers, 'delete-proof-review-row-failed');
      }
    }
    if (!result.reviewOk) return finish(result);

    if (!cleanString(args.reviewId || args.approvedReviewId)) {
      addCode(result.blockers, 'delete-proof-approved-review-required');
      return finish(result);
    }

    try {
      deleteResult = safeObject(await H2O.Desktop.Sync.executeReviewedDelete({
        reviewId: reviewId,
        operatorApprovalToken: token('__deleteReviewedApplyApprovalToken')
      }));
      result.deleteOk = deleteResult.ok === true && deleteResult.deleted === true;
      codeList(deleteResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(deleteResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'delete-proof-reviewed-delete-failed');
    }
    if (!result.deleteOk) return finish(result);

    try {
      applyEventResult = safeObject(await H2O.Desktop.Sync.buildDeleteApplyEvent({ deleteResult: deleteResult }));
      result.applyEventOk = applyEventResult.ok === true &&
        safeObject(applyEventResult.applyEvent).kind === 'applyEvent';
      codeList(applyEventResult.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(applyEventResult.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'delete-proof-applyEvent-failed');
    }
    if (!result.applyEventOk) return finish(result);

    try {
      bookkeeping = safeObject(await H2O.Desktop.Sync.finalizeDeleteConvergence({ deleteResult: deleteResult }));
      result.consumedOk = bookkeeping.ok === true && isObject(bookkeeping.consumedRow);
      result.watermarkOk = bookkeeping.ok === true && isObject(bookkeeping.watermarkRow);
      codeList(bookkeeping.blockers).forEach(function (code) { addCode(result.blockers, code); });
      codeList(bookkeeping.warnings).forEach(function (code) { addCode(result.warnings, code); });
    } catch (_) {
      addCode(result.blockers, 'delete-proof-bookkeeping-failed');
    }

    return finish(result);
  }

  H2O.Desktop.Sync.runDeleteConvergenceProof = runDeleteConvergenceProof;
  H2O.Desktop.Sync.__deleteConvergenceProofInstalled = true;
  H2O.Desktop.Sync.__deleteConvergenceProofVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
