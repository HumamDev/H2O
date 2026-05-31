/* H2O Desktop Sync - F14.4.3 read-only snapshot convergence preflight
 *
 * Determines whether a snapshot lifecycle operation is eligible to become a
 * proposal candidate. This module composes the F14.4.1 canonicalizer,
 * F14.4.2 diagnostics, and F14.2 kernel validation helpers only.
 *
 * Public API:
 *   H2O.Desktop.Sync.runSnapshotConvergencePreflight({
 *     snapshotRecord,
 *     operation,             // "archive" | "tombstone" | "restore"
 *     expectedTarget,
 *     ...
 *   }) -> Promise<result>
 *
 *   H2O.Desktop.Sync.__snapshotPreflightInstalled
 *   H2O.Desktop.Sync.__snapshotPreflightVersion
 *
 * Hard boundaries:
 *   - no proposal, no publication, no relay/outbox
 *   - no apply, no restore execution, no Native execution
 *   - no owner handoff execution
 *   - no storage writes, no watermark writes, no consumed-op writes
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
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__snapshotPreflightInstalled) return;

  var VERSION = '0.1.0-f14.4.3';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-convergence-preflight.v1';
  var SUBJECT_TYPE = 'snapshot.conversation';
  var ALLOWED_OPERATIONS = ['archive', 'tombstone', 'restore'];

  function nowIsoSeconds() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }
  function getSync() {
    return (H2O && H2O.Desktop && H2O.Desktop.Sync) || {};
  }
  function getKernel() {
    return getSync().kernel || null;
  }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized) return;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].code === normalized) return;
    }
    list.push({ code: normalized });
  }
  function mergeCodes(into, from) {
    if (!Array.isArray(from)) return;
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      if (entry && typeof entry === 'object' && typeof entry.code === 'string') addCode(into, entry.code);
      else if (typeof entry === 'string') addCode(into, entry);
    }
  }
  function hasCode(list, code) {
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      var entry = list[i];
      var value = entry && typeof entry === 'object' ? entry.code : entry;
      if (value === code) return true;
    }
    return false;
  }
  function mergeCodesExcept(into, from, excluded) {
    if (!Array.isArray(from)) return;
    var blocked = Array.isArray(excluded) ? excluded : [];
    for (var i = 0; i < from.length; i++) {
      var entry = from[i];
      var code = entry && typeof entry === 'object' ? entry.code : entry;
      if (blocked.indexOf(code) === -1) addCode(into, code);
    }
  }
  function isSha256HexLocal(value) {
    var kernel = getKernel();
    if (kernel && typeof kernel.isSha256Hex === 'function') {
      try { return !!kernel.isSha256Hex(value); } catch (_) { /* fall through */ }
    }
    return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  }

  function emptySummary() {
    return {
      operationAllowed: false,
      canonicalizationOk: false,
      crossAccountSafe: false,
      nativeOwnerReachable: false,
      mirrorNotStale: false,
      tombstoneStateValid: false,
      forbiddenFieldsClear: false,
      consumedSafe: false,
      watermarkSafe: false,
      replaySafe: false,
      lifecycleTransitionAllowed: false,
      retentionWindowValid: false,
      contentIntegrityValid: false,
      expectedTargetValid: false
    };
  }

  function canonicalLifecycleState(state) {
    var normalized = cleanString(state).toLowerCase();
    if (normalized === 'captured') return 'active';
    if (normalized === 'live') return 'active';
    if (normalized === 'deleted' || normalized === 'removed') return 'tombstoned';
    return normalized;
  }

  function contractLifecycleState(state) {
    var normalized = canonicalLifecycleState(state);
    return normalized === 'active' ? 'captured' : normalized;
  }

  function expectedLifecycleForOperation(operation, expectedTarget) {
    var target = isObject(expectedTarget) ? expectedTarget : {};
    var explicit = cleanString(target.lifecycleState || target.targetLifecycleState || target.state);
    if (explicit) return canonicalLifecycleState(explicit);
    if (operation === 'archive') return 'archived';
    if (operation === 'tombstone') return 'tombstoned';
    if (operation === 'restore') return 'active';
    return '';
  }

  function transitionAllowedByOperation(operation, fromState, toState) {
    var from = canonicalLifecycleState(fromState);
    var to = canonicalLifecycleState(toState);
    if (operation === 'archive') return from === 'active' && to === 'archived';
    if (operation === 'tombstone') return (from === 'active' || from === 'archived') && to === 'tombstoned';
    if (operation === 'restore') return (from === 'archived' || from === 'tombstoned') && to === 'active';
    return false;
  }

  function compareWatermarksInternal(current, proposed) {
    if (current === null || typeof current === 'undefined') return true;
    if (typeof current === 'number' && typeof proposed === 'number') return proposed >= current;
    if (typeof current === 'string' && typeof proposed === 'string') return proposed >= current;
    if (isObject(current) && isObject(proposed)) {
      if (typeof current.value === 'number' && typeof proposed.value === 'number') return proposed.value >= current.value;
      if (typeof current.iso === 'string' && typeof proposed.iso === 'string') return proposed.iso >= current.iso;
      if (typeof current.watermarkAtIso === 'string' && typeof proposed.watermarkAtIso === 'string') {
        return proposed.watermarkAtIso >= current.watermarkAtIso;
      }
    }
    return false;
  }

  function internalReplayCheck(snapshot, operation, log) {
    if (!Array.isArray(log) || !snapshot) return true;
    for (var i = 0; i < log.length; i++) {
      var entry = log[i];
      if (!isObject(entry)) continue;
      if (entry.subjectId === snapshot.subjectId &&
          (entry.operation === operation || entry.operationKind === 'snapshot.' + operation) &&
          (entry.revisionHash === snapshot.revisionHash || entry.eventDigest === snapshot.revisionHash)) {
        return false;
      }
    }
    return true;
  }

  function runForbiddenFieldScan(value) {
    var sync = getSync();
    if (typeof sync.runSnapshotForbiddenFieldScan === 'function') {
      try { return sync.runSnapshotForbiddenFieldScan(value); } catch (_) { /* fall through */ }
    }
    var kernel = getKernel();
    if (kernel && typeof kernel.scanDomainForbiddenFields === 'function') {
      try { return kernel.scanDomainForbiddenFields(SUBJECT_TYPE, value); } catch (_) { /* fall through */ }
    }
    return null;
  }

  function assembleResult(parts) {
    var blockers = parts.blockers || [];
    var warnings = parts.warnings || [];
    var noop = !!parts.noop;
    var ok = blockers.length === 0;
    var result = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      actionable: ok && !noop,
      operation: parts.operation || '',
      noop: noop,
      canonicalSnapshot: parts.canonicalSnapshot || null,
      targetSummary: parts.targetSummary || null,
      blockers: blockers,
      warnings: warnings,
      validationSummary: parts.validationSummary || emptySummary(),
      observedAtIso: parts.observedAtIso || nowIsoSeconds()
    };

    var outputScan = runForbiddenFieldScan(result);
    if (outputScan && outputScan.ok === false) {
      var leakBlockers = blockers.slice();
      addCode(leakBlockers, 'snapshot-preflight-output-contains-forbidden-field');
      mergeCodes(leakBlockers, outputScan.blockers);
      return {
        schema: RESULT_SCHEMA,
        version: VERSION,
        ok: false,
        actionable: false,
        operation: parts.operation || '',
        noop: false,
        canonicalSnapshot: null,
        targetSummary: null,
        blockers: leakBlockers,
        warnings: warnings,
        validationSummary: parts.validationSummary || emptySummary(),
        observedAtIso: parts.observedAtIso || nowIsoSeconds()
      };
    }
    return result;
  }

  async function canonicalizeInput(input, blockers, warnings) {
    var sync = getSync();
    if (isObject(input.snapshotRecord) && input.snapshotRecord.subjectType === SUBJECT_TYPE) {
      return input.snapshotRecord;
    }
    if (isObject(input.canonicalSnapshot) && input.canonicalSnapshot.subjectType === SUBJECT_TYPE) {
      return input.canonicalSnapshot;
    }
    if (typeof sync.canonicalizeSnapshot !== 'function') {
      addCode(blockers, 'snapshot-canonicalizer-unavailable');
      return null;
    }
    var canon;
    try {
      canon = await sync.canonicalizeSnapshot(input.snapshotRecord || input.snapshot || input);
    } catch (_) {
      addCode(blockers, 'snapshot-canonicalizer-threw');
      return null;
    }
    if (!canon || canon.quarantined || !canon.snapshot) {
      addCode(blockers, (canon && canon.quarantineReason) || 'snapshot-canonicalization-failed');
      mergeCodes(blockers, canon && canon.blockers);
      mergeCodes(warnings, canon && canon.warnings);
      return null;
    }
    mergeCodes(warnings, canon.warnings);
    return canon.snapshot;
  }

  function operationKind(operation) {
    return operation ? 'snapshot.' + operation : 'snapshot.lifecycle';
  }

  function consumedCandidate(snapshot, operation, input) {
    return {
      eventDigest: cleanString(input.eventDigest) || snapshot.revisionHash,
      dedupeKey: cleanString(input.dedupeKey) || snapshot.revisionHash,
      lineageId: cleanString(input.lineageId),
      subjectId: snapshot.subjectId,
      sourcePeerId: cleanString(input.sourcePeerId),
      envelopeKind: cleanString(input.envelopeKind) || 'proposal',
      operationKind: operationKind(operation),
      consumedStatus: 'consumed',
      consumedAtIso: cleanString(input.observedAtIso) || nowIsoSeconds(),
      actorPeer: input.actorPeer,
      originTag: input.originTag,
      validationSummary: input.validationSummary
    };
  }

  async function runSnapshotConvergencePreflight(input) {
    var observedAtIso = isObject(input) && typeof input.observedAtIso === 'string'
      ? input.observedAtIso
      : nowIsoSeconds();
    var blockers = [];
    var warnings = [];
    var summary = emptySummary();
    var canonicalSnapshot = null;
    var targetSummary = null;
    var noop = false;
    var operation = isObject(input) ? cleanString(input.operation) : '';

    if (!isObject(input)) {
      addCode(blockers, 'snapshot-preflight-input-missing');
      return assembleResult({
        operation: operation,
        blockers: blockers,
        warnings: warnings,
        validationSummary: summary,
        observedAtIso: observedAtIso
      });
    }

    if (ALLOWED_OPERATIONS.indexOf(operation) === -1) {
      addCode(blockers, 'snapshot-operation-not-allowed');
    } else {
      summary.operationAllowed = true;
    }

    var sync = getSync();
    var kernel = getKernel();

    canonicalSnapshot = await canonicalizeInput(input, blockers, warnings);
    if (!canonicalSnapshot) {
      return assembleResult({
        operation: operation,
        blockers: blockers,
        warnings: warnings,
        validationSummary: summary,
        observedAtIso: observedAtIso
      });
    }
    summary.canonicalizationOk = true;

    if (typeof sync.runSnapshotCrossAccountIdentityCheck === 'function') {
      var identity = await sync.runSnapshotCrossAccountIdentityCheck({
        snapshot: canonicalSnapshot,
        localAccountIdHash: input.localAccountIdHash,
        localAccountId: input.localAccountId,
        localAccount: input.localAccount,
        observedAtIso: observedAtIso
      });
      if (identity && identity.ok && identity.match) summary.crossAccountSafe = true;
      else mergeCodes(blockers, identity && identity.blockers);
      mergeCodes(warnings, identity && identity.warnings);
    } else {
      addCode(blockers, 'snapshot-cross-account-diagnostic-unavailable');
    }

    if (typeof sync.runSnapshotNativeOwnerReachabilityProbe === 'function') {
      var owner = sync.runSnapshotNativeOwnerReachabilityProbe({
        ownerDeclaration: input.ownerDeclaration,
        ownerStatus: input.ownerStatus,
        status: input.ownerStatus || input.status,
        reachable: input.ownerReachable,
        observedAtIso: observedAtIso
      });
      if (owner && owner.ok && owner.reachable) summary.nativeOwnerReachable = true;
      else mergeCodes(blockers, owner && owner.blockers);
      mergeCodes(warnings, owner && owner.warnings);
    } else {
      addCode(blockers, 'snapshot-native-owner-diagnostic-unavailable');
    }

    if (typeof sync.runSnapshotMirrorStalenessProbe === 'function') {
      var mirror = sync.runSnapshotMirrorStalenessProbe({
        snapshot: canonicalSnapshot,
        mirrorLastSyncIso: input.mirrorLastSyncIso || input.nativeMirrorLastSyncIso,
        referenceIso: input.referenceIso || observedAtIso,
        freshnessWindowMs: input.freshnessWindowMs,
        observedAtIso: observedAtIso
      });
      if (mirror && mirror.ok && mirror.fresh) summary.mirrorNotStale = true;
      else mergeCodes(blockers, mirror && mirror.blockers);
      mergeCodes(warnings, mirror && mirror.warnings);
    } else {
      addCode(blockers, 'snapshot-mirror-staleness-diagnostic-unavailable');
    }

    var targetLifecycleState = expectedLifecycleForOperation(operation, input.expectedTarget);
    var currentLifecycleState = canonicalLifecycleState(canonicalSnapshot.lifecycleState);
    noop = currentLifecycleState === targetLifecycleState;
    targetSummary = {
      operation: operation,
      currentLifecycleState: contractLifecycleState(currentLifecycleState),
      targetLifecycleState: contractLifecycleState(targetLifecycleState),
      targetCanonicalLifecycleState: targetLifecycleState,
      revisionHash: canonicalSnapshot.revisionHash,
      noop: noop
    };

    if (!targetLifecycleState) {
      addCode(blockers, 'snapshot-expected-target-invalid');
    } else {
      summary.expectedTargetValid = true;
    }

    var restoreFromTombstone = operation === 'restore' && currentLifecycleState === 'tombstoned';
    if (typeof sync.runSnapshotTombstoneCheck === 'function') {
      var tombstone = await sync.runSnapshotTombstoneCheck({
        snapshot: canonicalSnapshot,
        tombstoneLog: input.tombstoneLog,
        observedAtIso: observedAtIso
      });
      if (operation === 'restore' && (currentLifecycleState === 'archived' || restoreFromTombstone)) {
        if (restoreFromTombstone) {
          summary.tombstoneStateValid = !!(tombstone && (tombstone.present || tombstone.canonicalTombstoned));
          if (!summary.tombstoneStateValid) addCode(blockers, 'snapshot-tombstone-evidence-required-for-restore');
          mergeCodesExcept(blockers, tombstone && tombstone.blockers, ['snapshot-tombstone-present']);
        } else {
          summary.tombstoneStateValid = !!(tombstone && tombstone.absent);
          mergeCodes(blockers, tombstone && tombstone.blockers);
        }
      } else if (tombstone && tombstone.ok && tombstone.absent) {
        summary.tombstoneStateValid = true;
      } else {
        mergeCodes(blockers, tombstone && tombstone.blockers);
      }
      mergeCodes(warnings, tombstone && tombstone.warnings);
    } else {
      addCode(blockers, 'snapshot-tombstone-diagnostic-unavailable');
    }

    var targetScan = runForbiddenFieldScan({
      operation: operation,
      expectedTarget: input.expectedTarget || null
    });
    if (targetScan && targetScan.ok) {
      summary.forbiddenFieldsClear = true;
      mergeCodes(warnings, targetScan.warnings);
    } else if (targetScan) {
      mergeCodes(blockers, targetScan.blockers);
      mergeCodes(warnings, targetScan.warnings);
    } else {
      addCode(blockers, 'snapshot-forbidden-field-scan-unavailable');
    }

    var consumedRows = Array.isArray(input.consumedOperationsLog)
      ? input.consumedOperationsLog
      : (Array.isArray(input.consumedLog) ? input.consumedLog : null);
    if (consumedRows) {
      if (kernel && typeof kernel.assistConsumedSafe === 'function') {
        try {
          var consumed = kernel.assistConsumedSafe({
            rows: consumedRows,
            candidate: consumedCandidate(canonicalSnapshot, operation, input)
          });
          if (consumed && consumed.consumedSafe) summary.consumedSafe = true;
          else mergeCodes(blockers, consumed && consumed.blockers);
          mergeCodes(warnings, consumed && consumed.warnings);
        } catch (_) {
          if (internalReplayCheck(canonicalSnapshot, operation, consumedRows)) summary.consumedSafe = true;
          else addCode(blockers, 'snapshot-consumed-operation-not-safe');
        }
      } else if (internalReplayCheck(canonicalSnapshot, operation, consumedRows)) {
        summary.consumedSafe = true;
      } else {
        addCode(blockers, 'snapshot-consumed-operation-not-safe');
      }
    } else {
      summary.consumedSafe = true;
      addCode(warnings, 'snapshot-consumed-op-log-not-provided');
    }

    if (typeof input.currentWatermark !== 'undefined' || typeof input.proposedWatermark !== 'undefined') {
      var watermarkOk = false;
      if (kernel && typeof kernel.validateWatermarkMonotonicity === 'function') {
        try {
          var watermark = kernel.validateWatermarkMonotonicity({
            currentWatermark: input.currentWatermark,
            proposedWatermark: input.proposedWatermark,
            requireAdvance: input.requireWatermarkAdvance === true,
            allowIdempotent: input.allowIdempotentWatermark !== false
          });
          if (watermark && watermark.ok) watermarkOk = true;
          else mergeCodes(blockers, watermark && watermark.blockers);
          mergeCodes(warnings, watermark && watermark.warnings);
        } catch (_) {
          watermarkOk = compareWatermarksInternal(input.currentWatermark, input.proposedWatermark);
        }
      } else {
        watermarkOk = compareWatermarksInternal(input.currentWatermark, input.proposedWatermark);
      }
      if (watermarkOk) summary.watermarkSafe = true;
      else addCode(blockers, 'snapshot-watermark-unsafe');
    } else {
      summary.watermarkSafe = true;
      addCode(warnings, 'snapshot-watermark-input-not-provided');
    }

    var replayRows = Array.isArray(input.replayLog)
      ? input.replayLog
      : consumedRows;
    if (replayRows) {
      var replayOk = false;
      if (kernel && typeof kernel.composeReplayDefense === 'function') {
        try {
          var replay = kernel.composeReplayDefense({
            candidate: {
              subjectType: SUBJECT_TYPE,
              subjectId: canonicalSnapshot.subjectId,
              operation: operation,
              operationKind: operationKind(operation),
              revisionHash: canonicalSnapshot.revisionHash,
              targetHash: targetLifecycleState,
              eventDigest: cleanString(input.eventDigest) || canonicalSnapshot.revisionHash,
              dedupeKey: cleanString(input.dedupeKey) || canonicalSnapshot.revisionHash
            }
          });
          replayOk = !!(replay && replay.replaySafe);
          mergeCodes(warnings, replay && replay.warnings);
        } catch (_) {
          replayOk = internalReplayCheck(canonicalSnapshot, operation, replayRows);
        }
      }
      if (!replayOk) replayOk = internalReplayCheck(canonicalSnapshot, operation, replayRows);
      if (replayOk) summary.replaySafe = true;
      else addCode(blockers, 'snapshot-replay-unsafe');
    } else {
      summary.replaySafe = true;
      addCode(warnings, 'snapshot-replay-log-not-provided');
    }

    if (typeof sync.runSnapshotLifecycleTransitionAllowed === 'function') {
      var lifecycle = await sync.runSnapshotLifecycleTransitionAllowed({
        snapshot: canonicalSnapshot,
        fromState: currentLifecycleState,
        toState: targetLifecycleState,
        observedAtIso: observedAtIso
      });
      var operationTransitionAllowed = noop || transitionAllowedByOperation(operation, currentLifecycleState, targetLifecycleState);
      if (operationTransitionAllowed) {
        summary.lifecycleTransitionAllowed = true;
      } else {
        mergeCodes(blockers, lifecycle && lifecycle.blockers);
        addCode(blockers, 'snapshot-operation-lifecycle-transition-invalid');
      }
      mergeCodes(warnings, lifecycle && lifecycle.warnings);
    } else {
      addCode(blockers, 'snapshot-lifecycle-diagnostic-unavailable');
    }

    if (typeof sync.runSnapshotRetentionWindowCheck === 'function') {
      var retention = await sync.runSnapshotRetentionWindowCheck({
        snapshot: canonicalSnapshot,
        retentionExpiresAtIso: input.retentionExpiresAtIso,
        referenceIso: input.referenceIso || observedAtIso,
        observedAtIso: observedAtIso
      });
      if (retention && retention.ok && retention.retentionActive) {
        summary.retentionWindowValid = true;
      } else {
        mergeCodes(blockers, retention && retention.blockers);
      }
      if (restoreFromTombstone && !(retention && retention.retentionKnown && retention.retentionActive)) {
        addCode(blockers, 'snapshot-retention-window-required-for-tombstone-restore');
        summary.retentionWindowValid = false;
      }
      mergeCodes(warnings, retention && retention.warnings);
    } else {
      addCode(blockers, 'snapshot-retention-diagnostic-unavailable');
    }

    if (typeof sync.runSnapshotContentIntegrityProbe === 'function') {
      var content = sync.runSnapshotContentIntegrityProbe({
        contentAvailable: input.contentAvailable,
        contentPresent: input.contentPresent,
        snapshotContentAvailable: input.snapshotContentAvailable,
        contentDigest: input.contentDigest,
        contentHash: input.contentHash,
        expectedContentDigest: input.expectedContentDigest,
        observedAtIso: observedAtIso
      });
      if (content && content.ok && content.integrityVerified) summary.contentIntegrityValid = true;
      else mergeCodes(blockers, content && content.blockers);
      mergeCodes(warnings, content && content.warnings);
    } else {
      addCode(blockers, 'snapshot-content-integrity-diagnostic-unavailable');
    }

    return assembleResult({
      operation: operation,
      noop: noop,
      canonicalSnapshot: canonicalSnapshot,
      targetSummary: targetSummary,
      blockers: blockers,
      warnings: warnings,
      validationSummary: summary,
      observedAtIso: observedAtIso
    });
  }

  H2O.Desktop.Sync.runSnapshotConvergencePreflight = runSnapshotConvergencePreflight;
  H2O.Desktop.Sync.__snapshotPreflightInstalled = true;
  H2O.Desktop.Sync.__snapshotPreflightVersion = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
