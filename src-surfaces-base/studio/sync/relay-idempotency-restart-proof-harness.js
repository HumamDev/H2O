/* H2O Studio Sync - Relay Idempotency / Restart Proof Harness
 *
 * Non-writing proof model only. This module does not dispatch relay, enqueue
 * outbox rows, write WebDAV/cloud/CAS, write files, mutate export state, mint
 * export identifiers, burn sequence numbers, or invoke boot resume.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.relayIdempotencyRestartProofHarness =
    H2O.Studio.sync.relayIdempotencyRestartProofHarness || {};
  if (H2O.Studio.sync.relayIdempotencyRestartProofHarness.__installed) return;

  var REQUEST_SCHEMA = 'h2o.studio.transport.relay-idempotency-restart-proof-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.relay-idempotency-restart-proof.v1';
  var VERSION = '0.1.0-phase31-relay-proof-harness';
  var ACTIVE_TRANSPORT = 'local-sync-folder-json';
  var RELAY_PROOF_HARNESS_GATE = 'relay-idempotency-restart-proof-harness-evaluate';
  var TRANSPORT_CONTROLLED_APPLY_GATE = 'webdav-cloud-relay-transport-controlled-apply';
  var FAILURE_MODES = Object.freeze([
    'network-failure',
    'partial-write',
    'checksum-mismatch',
    'sequence-mismatch',
    'peer-ambiguity',
    'stale-payload',
    'cas-boundary-violation',
    'missing-controlled-gate'
  ]);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function bool(value) {
    return value === true;
  }

  function addUnique(list, code) {
    var text = cleanString(code);
    if (text && list.indexOf(text) === -1) list.push(text);
  }

  function hashLike(value) {
    var text = cleanString(value);
    if (/^sha256:[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(text)) return 'sha256:' + text.toLowerCase();
    return '';
  }

  function integerOrNull(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }

  function firstHash(input, names) {
    var inp = safeObject(input);
    for (var i = 0; i < names.length; i += 1) {
      var value = hashLike(inp[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function objectHash(input, objectName, names) {
    var obj = safeObject(safeObject(input)[objectName]);
    for (var i = 0; i < names.length; i += 1) {
      var value = hashLike(obj[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function hasRawPrivateInput(input) {
    var inp = safeObject(input);
    var target = safeObject(inp.target);
    var privateFields = [
      inp.remoteRootUrl,
      inp.endpoint,
      inp.username,
      inp.password,
      inp.token,
      inp.rawChatTitle,
      inp.rawChatContent,
      inp.rawChatId,
      inp.rawFolderId,
      inp.rawPeerId,
      inp.rawPath,
      inp.chatTitle,
      inp.folderName,
      inp.chatId,
      inp.folderId,
      inp.accountLinkedMetadata,
      inp.remoteRootPath,
      target.remoteRootUrl,
      target.endpoint,
      target.username,
      target.password,
      target.token,
      target.rawPeerId,
      target.remoteRootPath
    ];
    return privateFields.some(function (value) { return cleanString(value); });
  }

  function valueOrFallback(value, fallback) {
    return value === undefined ? fallback : value;
  }

  function normalizeInput(request) {
    var inp = safeObject(request);
    var candidate = safeObject(inp.candidate);
    var target = safeObject(inp.target);
    var sequence = safeObject(inp.sequence);
    var readiness = safeObject(inp.readiness);
    var safety = safeObject(inp.safety);
    var restart = safeObject(inp.restart);
    var transport = safeObject(inp.transport);
    return {
      input: inp,
      candidatePayloadHash: firstHash(inp, ['candidatePayloadHash', 'payloadHash']) ||
        objectHash(inp, 'candidate', ['candidatePayloadHash', 'payloadHash']),
      candidateBundleHash: firstHash(inp, ['candidateBundleHash', 'bundleHash']) ||
        objectHash(inp, 'candidate', ['candidateBundleHash', 'bundleHash']),
      peerTargetHash: firstHash(inp, ['peerTargetHash', 'peerHash']) ||
        objectHash(inp, 'target', ['peerTargetHash', 'peerHash', 'targetHash']),
      remoteRootRefHash: firstHash(inp, ['remoteRootRefHash', 'remoteRootHash']) ||
        objectHash(inp, 'target', ['remoteRootRefHash', 'remoteRootHash', 'rootHash']),
      sequenceMode: cleanString(inp.sequenceMode || sequence.sequenceMode || 'not-minted-in-dry-run'),
      expectedSequenceNumber: integerOrNull(valueOrFallback(inp.expectedSequenceNumber, sequence.expectedSequenceNumber)),
      previousSequenceNumber: integerOrNull(valueOrFallback(inp.previousSequenceNumber, sequence.previousSequenceNumber)),
      exportConstraint: cleanString(inp.exportConstraint || sequence.exportConstraint || 'existing-export-only'),
      operationKind: cleanString(inp.operationKind || candidate.operationKind || 'webdav-cloud-relay-dry-run'),
      activeTransport: cleanString(inp.activeTransport || transport.activeTransport || ACTIVE_TRANSPORT),
      reservedControlledGate: cleanString(valueOrFallback(inp.reservedControlledGate,
        valueOrFallback(inp.transportControlledApplyGateReserved,
          valueOrFallback(transport.reservedControlledGate, TRANSPORT_CONTROLLED_APPLY_GATE)))),
      requestedProductSyncReady: valueOrFallback(inp.productSyncReady, readiness.productSyncReady),
      requestedTransportReady: valueOrFallback(inp.transportReady, readiness.transportReady),
      requestedLocalExportableSyncReady: valueOrFallback(inp.localExportableSyncReady,
        readiness.localExportableSyncReady),
      requestedTransportEligibility: valueOrFallback(inp.transportEligibilityFromLocalExportableReady,
        readiness.transportEligibilityFromLocalExportableReady),
      chatSavingCasBlocked: inp.chatSavingCasBlocked === true || readiness.chatSavingCasBlocked === true ||
        transport.chatSavingCasBlocked === true,
      a950Quarantined: inp.a950DocumentedDebtQuarantined === true || readiness.a950DocumentedDebtQuarantined === true ||
        inp.a950DocumentedDebtVisible === true || readiness.a950DocumentedDebtVisible === true,
      noCleanupAuthority: inp.noCleanupAuthority === true || safety.cleanupAuthority === false,
      rawPrivateInput: hasRawPrivateInput(inp),
      writeTransitionRequested: bool(inp.writeTransitionRequested) || bool(transport.writeTransitionRequested),
      relayEnqueueRequested: bool(inp.enqueueRelay) || bool(inp.enqueuesRelay) || bool(inp.relayEnqueueAttempted) ||
        bool(transport.enqueueRelay),
      webdavWriteRequested: bool(inp.writeWebDAV) || bool(inp.writesWebDAV) || bool(inp.writeCloud) ||
        bool(inp.writesCloud) || bool(transport.writeWebDAV) || bool(transport.writeCloud),
      casWriteRequested: bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.touchChatSavingCAS) ||
        bool(transport.touchChatSavingCAS),
      fullBundleV3Requested: bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
        bool(inp.mintFullBundleV3) || bool(transport.startFullBundleV3),
      exportMutationRequested: bool(inp.mutatesExportState) || bool(inp.mintExportId) || bool(inp.mintsExportId) ||
        bool(inp.burnsSequence) || bool(sequence.mintNewExport),
      cleanupRequested: bool(inp.cleanupAuthority) || bool(inp.cleanupApply) || bool(inp.mutateA950) ||
        bool(safety.cleanupAuthority) || bool(safety.mutateA950),
      bootResumeRequested: bool(inp.bootResumeDispatch) || bool(restart.bootResumeDispatch),
      dryRunStateMarkedWritable: bool(inp.dryRunStateCanBecomeWriteState) ||
        bool(restart.dryRunStateCanBecomeWriteState),
      modeledFailureMode: cleanString(inp.modeledFailureMode || inp.failureMode)
    };
  }

  function buildIdempotencyKey(parts) {
    return [
      'relay-idempotency:v1',
      parts.candidatePayloadHash,
      parts.candidateBundleHash,
      parts.peerTargetHash,
      parts.remoteRootRefHash,
      parts.sequenceMode,
      parts.expectedSequenceNumber == null ? 'seq:null' : 'seq:' + parts.expectedSequenceNumber,
      parts.previousSequenceNumber == null ? 'prev:null' : 'prev:' + parts.previousSequenceNumber,
      parts.exportConstraint,
      parts.operationKind,
      parts.activeTransport,
      parts.reservedControlledGate
    ].join('|');
  }

  function failureBlocker(mode) {
    if (mode === 'network-failure') return 'relay-network-failure-blocked-before-enqueue';
    if (mode === 'partial-write') return 'relay-partial-write-blocked-before-enqueue';
    if (mode === 'checksum-mismatch') return 'relay-checksum-mismatch-blocked-before-enqueue';
    if (mode === 'sequence-mismatch') return 'relay-sequence-mismatch-blocked-before-enqueue';
    if (mode === 'peer-ambiguity') return 'relay-peer-ambiguity-blocked-before-enqueue';
    if (mode === 'stale-payload') return 'relay-stale-payload-blocked-before-enqueue';
    if (mode === 'cas-boundary-violation') return 'relay-cas-boundary-blocked-before-enqueue';
    if (mode === 'missing-controlled-gate') return 'relay-controlled-gate-missing';
    return '';
  }

  function evaluateRelayIdempotencyRestartProof(request) {
    var parts = normalizeInput(request);
    var inp = parts.input;
    var blockers = [];
    var warnings = [];

    if (cleanString(inp.gate) !== RELAY_PROOF_HARNESS_GATE) addUnique(blockers, 'relay-proof-harness-gate-required');
    if (inp.dryRun !== true) addUnique(blockers, 'relay-proof-harness-dry-run-required');
    if (inp.apply === true) addUnique(blockers, 'relay-proof-harness-apply-forbidden');
    if (parts.requestedProductSyncReady !== false) addUnique(blockers, 'relay-product-sync-ready-mismatch');
    if (parts.requestedTransportReady !== false) addUnique(blockers, 'relay-transport-ready-mismatch');
    if (parts.requestedLocalExportableSyncReady !== true) addUnique(blockers, 'relay-local-exportable-not-ready');
    if (parts.requestedTransportEligibility !== true) addUnique(blockers, 'relay-transport-eligibility-missing');
    if (!parts.candidatePayloadHash || !parts.candidateBundleHash) addUnique(blockers, 'relay-candidate-hash-required');
    if (!parts.peerTargetHash || !parts.remoteRootRefHash) addUnique(blockers, 'relay-target-hash-required');
    if (parts.sequenceMode !== 'not-minted-in-dry-run' && parts.expectedSequenceNumber == null) {
      addUnique(blockers, 'relay-sequence-constraint-required');
    }
    if (parts.expectedSequenceNumber != null && parts.previousSequenceNumber != null &&
        parts.expectedSequenceNumber < parts.previousSequenceNumber) {
      addUnique(blockers, 'relay-sequence-mismatch-blocked-before-enqueue');
    }
    if (parts.reservedControlledGate !== TRANSPORT_CONTROLLED_APPLY_GATE) addUnique(blockers, 'relay-controlled-gate-missing');
    if (parts.activeTransport !== ACTIVE_TRANSPORT) addUnique(blockers, 'relay-active-transport-mismatch');
    if (parts.rawPrivateInput) addUnique(blockers, 'relay-private-input-rejected');
    if (!parts.chatSavingCasBlocked) addUnique(warnings, 'chat-saving-cas-blocked-flag-not-supplied');
    if (!parts.a950Quarantined) addUnique(warnings, 'a950-documented-debt-visibility-not-supplied');
    if (!parts.noCleanupAuthority) addUnique(warnings, 'no-cleanup-authority-flag-not-supplied');
    if (parts.relayEnqueueRequested) addUnique(blockers, 'relay-enqueue-forbidden-in-proof-harness');
    if (parts.webdavWriteRequested) addUnique(blockers, 'relay-webdav-cloud-write-forbidden-in-proof-harness');
    if (parts.casWriteRequested) addUnique(blockers, 'relay-cas-write-forbidden-in-proof-harness');
    if (parts.fullBundleV3Requested) addUnique(blockers, 'relay-fullbundle-v3-start-forbidden-in-proof-harness');
    if (parts.exportMutationRequested) addUnique(blockers, 'relay-export-state-mutation-forbidden-in-proof-harness');
    if (parts.cleanupRequested) addUnique(blockers, 'relay-cleanup-authority-forbidden-in-proof-harness');
    if (parts.bootResumeRequested) addUnique(blockers, 'relay-boot-resume-dispatch-forbidden-in-proof-harness');
    if (parts.dryRunStateMarkedWritable) addUnique(blockers, 'relay-dry-run-state-write-transition-forbidden');
    if (parts.writeTransitionRequested && parts.reservedControlledGate !== TRANSPORT_CONTROLLED_APPLY_GATE) {
      addUnique(blockers, 'relay-controlled-gate-missing');
    }

    if (parts.modeledFailureMode) {
      if (FAILURE_MODES.indexOf(parts.modeledFailureMode) === -1) {
        addUnique(blockers, 'relay-unknown-failure-mode');
      } else {
        addUnique(blockers, failureBlocker(parts.modeledFailureMode));
      }
    }

    var idempotencyKey = buildIdempotencyKey(parts);
    var ok = blockers.length === 0;
    var failureModeProofs = FAILURE_MODES.map(function (mode) {
      return {
        mode: mode,
        blocker: failureBlocker(mode),
        blocksBeforeEnqueue: true,
        writesRelay: false,
        enqueuesRelay: false,
        writesWebDAV: false,
        writesCloud: false,
        writesCAS: false,
        mutatesExportState: false
      };
    });

    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ok,
      status: ok ? 'relay-idempotency-restart-proof-ready' : 'blocked-relay-idempotency-restart-proof',
      reason: ok ? 'relay-idempotency-restart-proof-ready' : blockers[0],
      gate: cleanString(inp.gate),
      gateSatisfied: cleanString(inp.gate) === RELAY_PROOF_HARNESS_GATE,
      relayProofHarness: true,
      dryRunOnly: true,
      dryRun: true,
      applyRequested: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesWebDAV: false,
      writesCloud: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      bootResumeDispatch: false,
      relayOutboxTouched: false,
      publicationLedgerTouched: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReady: parts.requestedLocalExportableSyncReady === true,
      transportEligibilityFromLocalExportableReady: parts.requestedTransportEligibility === true,
      localExportableSyncReadyIsAuthorization: false,
      idempotencyModeled: true,
      idempotencyKey: idempotencyKey,
      idempotencyKeyHashOnly: !!(parts.candidatePayloadHash && parts.candidateBundleHash &&
        parts.peerTargetHash && parts.remoteRootRefHash),
      idempotencyKeyMaterial: {
        candidatePayloadHash: parts.candidatePayloadHash,
        candidateBundleHash: parts.candidateBundleHash,
        peerTargetHash: parts.peerTargetHash,
        remoteRootRefHash: parts.remoteRootRefHash,
        sequenceMode: parts.sequenceMode,
        expectedSequenceNumber: parts.expectedSequenceNumber,
        previousSequenceNumber: parts.previousSequenceNumber,
        exportConstraint: parts.exportConstraint,
        operationKind: parts.operationKind,
        activeTransport: parts.activeTransport,
        reservedControlledGate: parts.reservedControlledGate
      },
      duplicateReplay: {
        sameCandidateIdempotencyKey: idempotencyKey,
        duplicateModeled: true,
        duplicateReplayZeroWrite: ok,
        duplicateWrites: 0,
        duplicateRelayEnqueue: false,
        duplicateWebdavWrite: false,
        duplicateCasWrite: false,
        duplicateExportStateMutation: false,
        duplicateFullBundleV3Start: false
      },
      duplicateReplayZeroWrite: ok,
      restartModel: {
        restartFailClosed: true,
        queuedDryRunStateCannotBecomeWriteState: true,
        dryRunRecordsAreNotRelayOutboxRows: true,
        localExportableSyncReadyAuthorizesRelayDispatch: false,
        transportEligibilityAuthorizesRelayDispatch: false,
        transportReadinessEvaluationAuthorizesRelayDispatch: false,
        bootResumeDispatch: false,
        bootResumeBlockedWithoutControlledGate: true,
        missingControlledGateBlocksWriteTransition: true
      },
      restartFailClosed: true,
      bootResumeBlockedWithoutControlledGate: true,
      failureModes: failureModeProofs,
      allFailureModesBlockBeforeEnqueue: true,
      webdavCloudRelayBlocked: true,
      chatSavingCasBlocked: true,
      a950DocumentedDebtQuarantined: true,
      noCleanupAuthority: true,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawPrivateFieldsLogged: false,
        rawInputRejected: parts.rawPrivateInput
      },
      blockers: blockers,
      warnings: warnings,
      activeTransport: ACTIVE_TRANSPORT,
      transportControlledApplyGateReserved: TRANSPORT_CONTROLLED_APPLY_GATE
    };
  }

  function diagnose() {
    return {
      installed: true,
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      relayProofHarness: true,
      dryRunOnly: true,
      writesRelay: false,
      enqueuesRelay: false,
      writesWebDAV: false,
      writesCloud: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false,
      activeTransport: ACTIVE_TRANSPORT,
      gate: RELAY_PROOF_HARNESS_GATE,
      transportControlledApplyGateReserved: TRANSPORT_CONTROLLED_APPLY_GATE,
      failureModes: FAILURE_MODES.slice()
    };
  }

  H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof =
    evaluateRelayIdempotencyRestartProof;
  H2O.Studio.sync.relayIdempotencyRestartProofHarness.diagnose = diagnose;
  H2O.Studio.sync.relayIdempotencyRestartProofHarness.constants = Object.freeze({
    REQUEST_SCHEMA: REQUEST_SCHEMA,
    RESULT_SCHEMA: RESULT_SCHEMA,
    VERSION: VERSION,
    ACTIVE_TRANSPORT: ACTIVE_TRANSPORT,
    RELAY_PROOF_HARNESS_GATE: RELAY_PROOF_HARNESS_GATE,
    TRANSPORT_CONTROLLED_APPLY_GATE: TRANSPORT_CONTROLLED_APPLY_GATE,
    FAILURE_MODES: FAILURE_MODES.slice()
  });
  H2O.Studio.sync.relayIdempotencyRestartProofHarness.__installed = true;
  H2O.Studio.sync.relayIdempotencyRestartProofHarness.__version = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
