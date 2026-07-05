/* H2O Studio Sync - Real-Transport B5 Conflict / Partial-Write Handling (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate that MODELS real-transport
 * conflict and partial-write recovery decisions. It does NOT execute recovery,
 * retry, remote overwrite, remote write, outbox write, publication-ledger write,
 * CAS write, file write, export-state mutation, export-id mint, sequence burn,
 * fullBundle v3 start, productSyncReady flip, transportReady flip, or a950 cleanup.
 * Every payload/target/approval/sequence value is a redacted hash-only reference;
 * no raw endpoint, credential, remote path, CAS key, or payload body is stored,
 * logged, or echoed. It implements the B5 design
 * (release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-design.md,
 * e60e00f0) as an evaluate/validate-only substrate, building on B1 (93eb9065),
 * B2 (de4aa12d), B3 (804b6d67), and B4 (1117f976).
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportConflictRecovery = H2O.Studio.sync.realTransportConflictRecovery || {};
  if (H2O.Studio.sync.realTransportConflictRecovery.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b5-conflict-recovery.v1';
  var VERSION = '0.1.0-b5-conflict-recovery-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b5-conflict-recovery-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b5-conflict-recovery-result.v1';
  var CONFLICT_CLASSES = [
    'local-payload-stale',
    'remote-same-payload-hash',
    'remote-newer',
    'remote-untrusted',
    'checksum-mismatch-before-write',
    'checksum-mismatch-after-observed-write',
    'peer-target-mismatch',
    'credential-permission-failure',
    'network-timeout-uncertain-write',
    'partial-upload-interrupted-write'
  ];
  var PARTIAL_WRITE_STATES = [
    'no-remote-write-attempted',
    'remote-write-attempted-unconfirmed',
    'remote-write-observed-checksum-unverified',
    'remote-write-observed-checksum-verified',
    'ledger-pending',
    'completed',
    'explicit-recovery-required'
  ];
  var HASH_REF_FIELDS = [
    'candidatePayloadHash',
    'candidateBundleHash',
    'fullBundleV2EnvelopeHash',
    'observedRemoteHash',
    'expectedRemoteHash',
    'endpointRefHash',
    'remoteRootRefHash',
    'peerIdentityBindingHash',
    'credentialRefHash',
    'idempotencyKeyHash',
    'b8ApprovalRefHash',
    'killSwitchEnableTokenHash',
    'sequenceExportConstraintRefHash',
    'outboxRecordHash'
  ];
  var B1_TARGET_HASH_FIELDS = ['endpointRefHash', 'remoteRootRefHash', 'peerIdentityBindingHash', 'credentialRefHash'];
  var RAW_INPUT_KEYS = [
    'endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint',
    'credential', 'credentials', 'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'accessKey', 'access_key', 'rawCredential', 'remotePath', 'path', 'rawRemotePath',
    'payloadBody', 'bundleBody', 'rawPayloadBody', 'rawBundleBody'
  ];
  var CAS_INPUT_KEYS = ['casKey', 'casKeyHash', 'chatSavingCasKey', 'casKeys'];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function bool(value) { return value === true; }
  function addUnique(list, code) { var t = cleanString(code); if (t && list.indexOf(t) === -1) list.push(t); }

  function hashLike(value) {
    var text = cleanString(value);
    if (/^sha256:[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(text)) return 'sha256:' + text.toLowerCase();
    return '';
  }

  function looksRaw(value) {
    var text = cleanString(value);
    if (!text || hashLike(text)) return false;
    return /:\/\//.test(text) || /^\//.test(text) || /^[a-z0-9.-]+@[a-z0-9.-]+/i.test(text) || /\\/.test(text);
  }

  function rawInputPresent(inp) {
    var scopes = [
      inp,
      safeObject(inp.target),
      safeObject(inp.credential),
      safeObject(inp.candidate),
      safeObject(inp.payload),
      safeObject(inp.remote),
      safeObject(inp.conflict)
    ];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    for (var f = 0; f < HASH_REF_FIELDS.length; f += 1) {
      if (looksRaw(inp[HASH_REF_FIELDS[f]])) return true;
    }
    return false;
  }

  function casInputPresent(inp) {
    var scopes = [inp, safeObject(inp.transport), safeObject(inp.safety), safeObject(inp.conflict)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < CAS_INPUT_KEYS.length; k += 1) {
        var key = CAS_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '' &&
          scopes[s][key] !== false) return true;
      }
    }
    return false;
  }

  function allHashesPresent(inp, fields) {
    for (var i = 0; i < fields.length; i += 1) {
      if (!hashLike(inp[fields[i]])) return false;
    }
    return true;
  }

  function evaluateRealTransportConflictRecovery(request) {
    var inp = safeObject(request);
    var conflict = safeObject(inp.conflict);
    var record = safeObject(inp.idempotencyRecord);
    var outbox = safeObject(inp.outbox);
    var killSwitch = safeObject(inp.killSwitch);
    var blockers = [];
    var warnings = [];

    var conflictClass = cleanString(inp.conflictClass || conflict.class);
    var partialWriteState = cleanString(inp.partialWriteState || outbox.partialWriteState || outbox.state) ||
      'no-remote-write-attempted';
    var idempotencyState = cleanString(inp.b3IdempotencyState || record.state);
    var outboxState = cleanString(inp.b4OutboxState || outbox.state);
    var candidatePayloadHash = hashLike(inp.candidatePayloadHash);
    var candidateBundleHash = hashLike(inp.candidateBundleHash);
    var fullBundleV2EnvelopeHash = hashLike(inp.fullBundleV2EnvelopeHash);
    var observedRemoteHash = hashLike(inp.observedRemoteHash);
    var expectedRemoteHash = hashLike(inp.expectedRemoteHash) || candidatePayloadHash;
    var idempotencyKeyHash = hashLike(inp.idempotencyKeyHash);
    var outboxRecordHash = hashLike(inp.outboxRecordHash);
    var b8ApprovalRefHash = hashLike(inp.b8ApprovalRefHash);
    var sequenceExportConstraintRefHash = hashLike(inp.sequenceExportConstraintRefHash);

    var b3StatePresent = bool(inp.b3IdempotencyStatePresent) || bool(record.present) || !!idempotencyState;
    var b4OutboxStatePresent = bool(inp.b4OutboxStatePresent) || bool(outbox.present) || !!outboxState;
    var b1TargetHashesPresent = allHashesPresent(inp, B1_TARGET_HASH_FIELDS);
    var b2KillSwitchEnabled = (bool(inp.b2KillSwitchEnabled) || bool(killSwitch.enabled)) &&
      !bool(inp.b2KillSwitchStale) && !bool(killSwitch.stale) && !bool(killSwitch.disabled);
    var b8ApprovalValid = bool(inp.b8ApprovalValid) && !!b8ApprovalRefHash;
    var b6SequenceConstraintsPresent = bool(inp.b6SequenceExportConstraintsPresent) && !!sequenceExportConstraintRefHash;
    var payloadHashMatchesEnvelope = !!candidatePayloadHash && candidatePayloadHash === candidateBundleHash &&
      candidatePayloadHash === fullBundleV2EnvelopeHash;
    var remoteWriteVerified = partialWriteState === 'remote-write-observed-checksum-verified' &&
      !!observedRemoteHash && observedRemoteHash === expectedRemoteHash && observedRemoteHash === candidatePayloadHash;
    var completedDuplicate = idempotencyState === 'completed' || partialWriteState === 'completed';
    var safePreWriteRetry = partialWriteState === 'no-remote-write-attempted' && conflictClass === 'local-payload-stale';
    var uncertainPartial = partialWriteState === 'remote-write-attempted-unconfirmed' ||
      partialWriteState === 'remote-write-observed-checksum-unverified' ||
      partialWriteState === 'explicit-recovery-required' ||
      conflictClass === 'network-timeout-uncertain-write' ||
      conflictClass === 'partial-upload-interrupted-write' ||
      conflictClass === 'checksum-mismatch-after-observed-write';
    var checksumMismatch = conflictClass === 'checksum-mismatch-before-write' ||
      conflictClass === 'checksum-mismatch-after-observed-write' ||
      (!!observedRemoteHash && !!expectedRemoteHash && observedRemoteHash !== expectedRemoteHash) ||
      (!!candidatePayloadHash && !!candidateBundleHash && candidatePayloadHash !== candidateBundleHash) ||
      (!!candidatePayloadHash && !!fullBundleV2EnvelopeHash && candidatePayloadHash !== fullBundleV2EnvelopeHash);

    var duplicateNoop = false;
    var explicitRecoveryRequired = false;
    var retryAllowed = false;
    var ledgerWriteAllowed = false;
    var resolvedState = partialWriteState;

    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b5-raw-input-rejected');
    if (casInputPresent(inp) || bool(inp.touchChatSavingCas) || bool(inp.writeCAS) ||
      bool(safeObject(inp.transport).touchChatSavingCas) || bool(safeObject(inp.transport).writeCAS)) {
      addUnique(blockers, 'real-transport-b5-cas-boundary-violation');
    }
    if (CONFLICT_CLASSES.indexOf(conflictClass) === -1) addUnique(blockers, 'real-transport-b5-conflict-class-required');
    if (PARTIAL_WRITE_STATES.indexOf(partialWriteState) === -1) addUnique(blockers, 'real-transport-b5-partial-write-state-invalid');
    if (!b3StatePresent || !idempotencyKeyHash) addUnique(blockers, 'real-transport-b5-b3-idempotency-state-missing');
    if (!b4OutboxStatePresent || !outboxRecordHash) addUnique(blockers, 'real-transport-b5-b4-outbox-state-missing');
    if (!b1TargetHashesPresent) addUnique(blockers, 'real-transport-b5-b1-target-hashes-missing');
    if (!b2KillSwitchEnabled) addUnique(blockers, 'real-transport-b5-b2-kill-switch-disabled-or-stale');
    if (!b8ApprovalValid) addUnique(blockers, 'real-transport-b5-b8-approval-missing');
    if (!b6SequenceConstraintsPresent) addUnique(blockers, 'real-transport-b5-b6-sequence-constraints-missing');
    if (!payloadHashMatchesEnvelope) addUnique(blockers, 'real-transport-b5-payload-envelope-hash-mismatch');
    if (bool(inp.peerTargetMismatch) || conflictClass === 'peer-target-mismatch') {
      addUnique(blockers, 'real-transport-b5-peer-target-mismatch');
    }
    if (bool(inp.credentialPermissionFailure) || conflictClass === 'credential-permission-failure') {
      addUnique(blockers, 'real-transport-b5-credential-permission-failure');
    }
    if (bool(inp.remoteOverwriteRequested) || bool(inp.localOverwriteRemote) ||
      bool(safeObject(inp.transport).remoteOverwriteRequested)) {
      addUnique(blockers, 'real-transport-b5-remote-overwrite-request-blocked');
    }

    if (completedDuplicate || conflictClass === 'remote-same-payload-hash') {
      duplicateNoop = true;
      resolvedState = 'duplicate-replay-noop';
    }
    if (safePreWriteRetry) {
      retryAllowed = true;
      resolvedState = 'no-remote-write-attempted';
    }
    if (conflictClass === 'remote-newer') {
      addUnique(blockers, 'real-transport-b5-remote-newer-overwrite-blocked');
      explicitRecoveryRequired = true;
      resolvedState = 'explicit-recovery-required';
    }
    if (conflictClass === 'remote-untrusted') {
      addUnique(blockers, 'real-transport-b5-remote-untrusted-review-required');
      explicitRecoveryRequired = true;
      resolvedState = 'explicit-recovery-required';
    }
    if (checksumMismatch) {
      addUnique(blockers, 'real-transport-b5-checksum-mismatch-explicit-recovery-required');
      explicitRecoveryRequired = true;
      resolvedState = 'explicit-recovery-required';
    }
    if (uncertainPartial) {
      explicitRecoveryRequired = true;
      resolvedState = 'explicit-recovery-required';
      if (bool(inp.retryRequested) || bool(inp.blindRetryRequested) || bool(safeObject(inp.transport).retryRequested)) {
        addUnique(blockers, 'real-transport-b5-blind-retry-after-uncertain-write-blocked');
      }
    }
    if (partialWriteState === 'ledger-pending' && !remoteWriteVerified) {
      addUnique(blockers, 'real-transport-b5-ledger-pending-without-verified-remote-write');
      explicitRecoveryRequired = true;
      resolvedState = 'explicit-recovery-required';
    }
    if (remoteWriteVerified) {
      ledgerWriteAllowed = true;
      resolvedState = 'ledger-pending';
    }

    var ready = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: ready ? 'real-transport-b5-conflict-recovery-ready' : 'blocked-real-transport-b5-conflict-recovery',
      reason: ready ? 'real-transport-b5-conflict-recovery-ready' : blockers[0],
      conflictClass: CONFLICT_CLASSES.indexOf(conflictClass) === -1 ? '' : conflictClass,
      partialWriteState: PARTIAL_WRITE_STATES.indexOf(partialWriteState) === -1 ? '' : partialWriteState,
      resolvedState: resolvedState,
      realConflictRecoveryReady: ready,
      duplicateReplayNoop: duplicateNoop,
      retryAllowedBeforeRemoteWriteOnly: retryAllowed,
      explicitRecoveryRequired: explicitRecoveryRequired,
      blockLocalOverwriteOnRemoteNewer: true,
      reviewedConflictDecisionRequired: conflictClass === 'remote-newer' || conflictClass === 'remote-untrusted',
      noLocalCanonicalMutationOnConflict: true,
      noBlindRetryAfterUncertainWrite: true,
      payloadHashMatchesFullBundleV2Envelope: payloadHashMatchesEnvelope,
      postWriteObservedHashMatchesCandidate: remoteWriteVerified,
      checksumMismatchBlocksLedgerWrite: checksumMismatch,
      checksumMismatchEntersExplicitRecovery: checksumMismatch,
      outboxCompletedRequiresB5VerifiedWrite: true,
      ledgerNeverPrecedesVerifiedRemoteWrite: true,
      b5DoesNotDecideSequenceBurn: true,
      sequenceExportRollbackHandoffToB6: true,
      b6SequenceExportFinalizationRequired: true,
      // Hash-only references only.
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      fullBundleV2EnvelopeHash: fullBundleV2EnvelopeHash,
      observedRemoteHash: observedRemoteHash,
      expectedRemoteHash: expectedRemoteHash,
      endpointRefHash: hashLike(inp.endpointRefHash),
      remoteRootRefHash: hashLike(inp.remoteRootRefHash),
      peerIdentityBindingHash: hashLike(inp.peerIdentityBindingHash),
      credentialRefHash: hashLike(inp.credentialRefHash),
      idempotencyKeyHash: idempotencyKeyHash,
      b8ApprovalRefHash: b8ApprovalRefHash,
      killSwitchEnableTokenHash: hashLike(inp.killSwitchEnableTokenHash),
      sequenceExportConstraintRefHash: sequenceExportConstraintRefHash,
      outboxRecordHash: outboxRecordHash,
      // Non-activation invariants: hardcoded, never request-controllable.
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      realRecoveryExecuted: false,
      retryDispatched: false,
      remoteWriteAttempted: false,
      remoteOverwriteAllowed: false,
      ledgerWriteAllowed: ledgerWriteAllowed,
      outboxCompleted: false,
      outboxWriteAllowed: false,
      publicationLedgerTouched: false,
      relayOutboxTouched: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReadyIsAuthorization: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesCAS: false,
      writesFiles: false,
      touchChatSavingCas: false,
      chatSavingCasBlocked: true,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      noA950Mutation: true,
      rawEndpointLogged: false,
      rawCredentialLogged: false,
      rawRemotePathLogged: false,
      rawPayloadBodyStored: false,
      casKeysExposed: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b5-raw-input-rejected') !== -1,
        casInputRejected: blockers.indexOf('real-transport-b5-cas-boundary-violation') !== -1
      },
      conflictClasses: CONFLICT_CLASSES.slice(),
      partialWriteStates: PARTIAL_WRITE_STATES.slice(),
      blockers: blockers,
      warnings: warnings
    };
  }

  function diagnose() {
    return {
      installed: true,
      schema: SCHEMA,
      version: VERSION,
      blocker: 'B5',
      substrate: 'real-transport-conflict-recovery-non-writing',
      evaluateOnly: true,
      conflictClasses: CONFLICT_CLASSES.slice(),
      partialWriteStates: PARTIAL_WRITE_STATES.slice(),
      noBlindRetryAfterUncertainWrite: true,
      ledgerNeverPrecedesVerifiedRemoteWrite: true,
      b6SequenceExportFinalizationRequired: true,
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      realRecoveryExecuted: false,
      retryDispatched: false,
      remoteWriteAttempted: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      credentialReferenceOnly: true
    };
  }

  H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery =
    evaluateRealTransportConflictRecovery;
  H2O.Studio.sync.realTransportConflictRecovery.diagnose = diagnose;
  H2O.Studio.sync.realTransportConflictRecovery.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportConflictRecovery.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportConflictRecovery.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportConflictRecovery.CONFLICT_CLASSES = CONFLICT_CLASSES.slice();
  H2O.Studio.sync.realTransportConflictRecovery.PARTIAL_WRITE_STATES = PARTIAL_WRITE_STATES.slice();
  H2O.Studio.sync.realTransportConflictRecovery.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
