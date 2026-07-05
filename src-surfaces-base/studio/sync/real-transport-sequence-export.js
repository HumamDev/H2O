/* H2O Studio Sync - Real-Transport B6 Sequence / Export-Id Semantics (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate that MODELS real-transport
 * sequence/export-id finalization semantics. It does NOT mutate export state,
 * mint an export id, burn sequence, write a publication ledger, write an outbox,
 * write WebDAV/cloud/relay/CAS/files, enqueue relay, start fullBundle v3, flip
 * productSyncReady, set transportReady, or clean/mutate a950. Every payload,
 * target, approval, sequence, and export-id value is a redacted hash-only
 * reference; no raw endpoint, credential, remote path, CAS key, payload body, or
 * minted export id is stored, logged, or echoed. It implements the B6 design
 * (release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-design.md,
 * 53792911) as an evaluate/validate-only substrate, building on B1 (93eb9065),
 * B2 (de4aa12d), B3 (804b6d67), B4 (1117f976), and B5 (334361cc).
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportSequenceExport = H2O.Studio.sync.realTransportSequenceExport || {};
  if (H2O.Studio.sync.realTransportSequenceExport.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b6-sequence-export.v1';
  var VERSION = '0.1.0-b6-sequence-export-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b6-sequence-export-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b6-sequence-export-result.v1';
  var FINALIZATION_STATES = [
    'preflight',
    'local-mock',
    'failed-before-remote-write',
    'remote-write-observed-checksum-verified',
    'ledger-pending',
    'completed',
    'explicit-recovery-required'
  ];
  var HASH_REF_FIELDS = [
    'candidatePayloadHash',
    'candidateBundleHash',
    'idempotencyKeyHash',
    'b8ApprovalRefHash',
    'killSwitchEnableTokenHash',
    'endpointRefHash',
    'remoteRootRefHash',
    'peerIdentityBindingHash',
    'credentialRefHash',
    'sequenceExportConstraintRefHash',
    'exportIdRefHash',
    'burnedSequenceRefHash',
    'outboxRecordHash',
    'b5VerifiedWriteRefHash'
  ];
  var B1_TARGET_HASH_FIELDS = ['endpointRefHash', 'remoteRootRefHash', 'peerIdentityBindingHash', 'credentialRefHash'];
  var RAW_INPUT_KEYS = [
    'endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint',
    'credential', 'credentials', 'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'accessKey', 'access_key', 'rawCredential', 'remotePath', 'path', 'rawRemotePath',
    'payloadBody', 'bundleBody', 'rawPayloadBody', 'rawBundleBody', 'exportId', 'mintedExportId',
    'rawExportId'
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
      safeObject(inp.sequence),
      safeObject(inp.export)
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
    var scopes = [inp, safeObject(inp.transport), safeObject(inp.safety), safeObject(inp.sequence)];
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

  function evaluateRealTransportSequenceExport(request) {
    var inp = safeObject(request);
    var record = safeObject(inp.idempotencyRecord);
    var outbox = safeObject(inp.outbox);
    var b5 = safeObject(inp.b5);
    var killSwitch = safeObject(inp.killSwitch);
    var blockers = [];
    var warnings = [];

    var finalizationState = cleanString(inp.finalizationState || inp.phase || outbox.state) || 'preflight';
    var candidatePayloadHash = hashLike(inp.candidatePayloadHash);
    var candidateBundleHash = hashLike(inp.candidateBundleHash);
    var idempotencyKeyHash = hashLike(inp.idempotencyKeyHash);
    var b8ApprovalRefHash = hashLike(inp.b8ApprovalRefHash);
    var killSwitchEnableTokenHash = hashLike(inp.killSwitchEnableTokenHash);
    var sequenceExportConstraintRefHash = hashLike(inp.sequenceExportConstraintRefHash);
    var exportIdRefHash = hashLike(inp.exportIdRefHash);
    var burnedSequenceRefHash = hashLike(inp.burnedSequenceRefHash);
    var outboxRecordHash = hashLike(inp.outboxRecordHash);
    var b5VerifiedWriteRefHash = hashLike(inp.b5VerifiedWriteRefHash);
    var b3IdempotencyState = cleanString(inp.b3IdempotencyState || record.state);
    var b4OutboxState = cleanString(inp.b4OutboxState || outbox.state);
    var b5PartialWriteState = cleanString(inp.b5PartialWriteState || b5.partialWriteState);
    var b5ConflictClass = cleanString(inp.b5ConflictClass || b5.conflictClass);

    var b3EvidencePresent = (bool(inp.b3IdempotencyEvidencePresent) || bool(record.present) || !!b3IdempotencyState) &&
      !!idempotencyKeyHash;
    var b4EvidencePresent = (bool(inp.b4OutboxEvidencePresent) || bool(outbox.present) || !!b4OutboxState) &&
      !!outboxRecordHash;
    var b5VerifiedWrite = (bool(inp.b5VerifiedRemoteWrite) || bool(b5.verifiedRemoteWrite) ||
      b5PartialWriteState === 'remote-write-observed-checksum-verified') && !!b5VerifiedWriteRefHash;
    var b8ApprovalValid = bool(inp.b8ApprovalValid) && !!b8ApprovalRefHash;
    var b2KillSwitchValid = (bool(inp.b2KillSwitchValid) || bool(killSwitch.enabled)) &&
      !!killSwitchEnableTokenHash && !bool(inp.b2KillSwitchStale) && !bool(killSwitch.stale) && !bool(killSwitch.disabled);
    var targetHashesPresent = allHashesPresent(inp, B1_TARGET_HASH_FIELDS);
    var payloadHashMatches = !!candidatePayloadHash && candidatePayloadHash === candidateBundleHash;
    var completedDuplicate = b3IdempotencyState === 'completed' || finalizationState === 'completed';
    var changedConstraints = bool(inp.changedPayloadTargetSequence) ||
      (!!hashLike(record.idempotencyKeyHash) && !!idempotencyKeyHash && hashLike(record.idempotencyKeyHash) !== idempotencyKeyHash);
    var explicitRecovery = bool(inp.explicitRecoveryRequired) ||
      b5PartialWriteState === 'explicit-recovery-required' ||
      finalizationState === 'explicit-recovery-required';
    var partialOrUncertain = finalizationState === 'remote-write-attempted-unconfirmed' ||
      finalizationState === 'remote-write-observed-checksum-unverified' ||
      b5PartialWriteState === 'remote-write-attempted-unconfirmed' ||
      b5PartialWriteState === 'remote-write-observed-checksum-unverified' ||
      b5ConflictClass === 'network-timeout-uncertain-write' ||
      b5ConflictClass === 'partial-upload-interrupted-write';
    var checksumMismatch = bool(inp.checksumMismatch) ||
      b5ConflictClass === 'checksum-mismatch-before-write' ||
      b5ConflictClass === 'checksum-mismatch-after-observed-write' ||
      (!!candidatePayloadHash && !!candidateBundleHash && candidatePayloadHash !== candidateBundleHash);
    var remoteNewer = bool(inp.remoteNewer) || b5ConflictClass === 'remote-newer';
    var failedBeforeWrite = finalizationState === 'failed-before-remote-write';
    var preflightOrMock = finalizationState === 'preflight' || finalizationState === 'local-mock';
    var writeRequest = bool(inp.mintExportId) || bool(inp.mintExportIdRequested) || bool(inp.burnSequence) ||
      bool(inp.burnSequenceRequested) || bool(inp.writeLedger) || bool(inp.writePublicationLedger) ||
      bool(safeObject(inp.sequence).mintExportId) || bool(safeObject(inp.sequence).burnSequence);

    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b6-raw-input-rejected');
    if (casInputPresent(inp) || bool(inp.touchChatSavingCas) || bool(inp.writeCAS) ||
      bool(safeObject(inp.transport).touchChatSavingCas) || bool(safeObject(inp.transport).writeCAS)) {
      addUnique(blockers, 'real-transport-b6-cas-boundary-violation');
    }
    if (FINALIZATION_STATES.indexOf(finalizationState) === -1) addUnique(blockers, 'real-transport-b6-finalization-state-invalid');
    if (!b3EvidencePresent) addUnique(blockers, 'real-transport-b6-b3-idempotency-evidence-missing');
    if (!b4EvidencePresent) addUnique(blockers, 'real-transport-b6-b4-outbox-evidence-missing');
    if (!targetHashesPresent) addUnique(blockers, 'real-transport-b6-b1-target-hashes-missing');
    if (!b2KillSwitchValid) addUnique(blockers, 'real-transport-b6-b2-kill-switch-ref-missing-or-stale');
    if (!b8ApprovalValid) addUnique(blockers, 'real-transport-b6-b8-approval-ref-missing');
    if (!sequenceExportConstraintRefHash) addUnique(blockers, 'real-transport-b6-sequence-export-constraints-missing');
    if (!payloadHashMatches) addUnique(blockers, 'real-transport-b6-checksum-mismatch-blocks-mint-burn');
    if (writeRequest) addUnique(blockers, 'real-transport-b6-mint-burn-write-request-blocked');
    if (completedDuplicate) addUnique(blockers, 'real-transport-b6-completed-idempotency-duplicate-noop');
    if (changedConstraints) addUnique(blockers, 'real-transport-b6-changed-payload-target-sequence-not-duplicate');
    if (failedBeforeWrite) addUnique(blockers, 'real-transport-b6-failed-before-write-no-mint-burn');
    if (explicitRecovery) addUnique(blockers, 'real-transport-b6-explicit-recovery-required-blocks-mint-burn');
    if (partialOrUncertain) addUnique(blockers, 'real-transport-b6-partial-or-uncertain-write-blocks-mint-burn');
    if (checksumMismatch) addUnique(blockers, 'real-transport-b6-checksum-mismatch-blocks-mint-burn');
    if (remoteNewer) addUnique(blockers, 'real-transport-b6-remote-newer-blocks-mint-burn');
    if (preflightOrMock && (bool(inp.modelMintBurnDuringPreflight) || bool(inp.modelMintBurnDuringLocalMock))) {
      addUnique(blockers, 'real-transport-b6-preflight-local-mock-mint-burn-blocked');
    }

    var finalizationEligible = !preflightOrMock && !failedBeforeWrite && !explicitRecovery && !partialOrUncertain &&
      !checksumMismatch && !remoteNewer && !completedDuplicate && !changedConstraints && b5VerifiedWrite &&
      b3EvidencePresent && b4EvidencePresent && b8ApprovalValid && b2KillSwitchValid && targetHashesPresent &&
      !!sequenceExportConstraintRefHash && !!exportIdRefHash && !!burnedSequenceRefHash && payloadHashMatches;

    if (!preflightOrMock && !failedBeforeWrite && !explicitRecovery && !partialOrUncertain && !checksumMismatch &&
      !remoteNewer && !completedDuplicate && !changedConstraints && !b5VerifiedWrite) {
      addUnique(blockers, 'real-transport-b6-b5-verified-write-evidence-missing');
    }
    if (!preflightOrMock && !failedBeforeWrite && !explicitRecovery && !partialOrUncertain && !checksumMismatch &&
      !remoteNewer && !completedDuplicate && !changedConstraints && b5VerifiedWrite &&
      (!exportIdRefHash || !burnedSequenceRefHash)) {
      addUnique(blockers, 'real-transport-b6-export-sequence-ref-missing-or-not-hash-only');
    }

    var ready = blockers.length === 0;
    var ledgerWriteAllowed = finalizationEligible && ready;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: ready ? 'real-transport-b6-sequence-export-ready' : 'blocked-real-transport-b6-sequence-export',
      reason: ready ? 'real-transport-b6-sequence-export-ready' : blockers[0],
      finalizationState: FINALIZATION_STATES.indexOf(finalizationState) === -1 ? '' : finalizationState,
      realSequenceExportReady: ready,
      sequenceExportModeledReady: ledgerWriteAllowed,
      exportIdMintAllowed: ledgerWriteAllowed,
      sequenceBurnAllowed: ledgerWriteAllowed,
      exportIdMintedDuringPreflight: false,
      exportIdMintedDuringLocalMock: false,
      sequenceBurnedDuringPreflight: false,
      sequenceBurnedBeforeVerifiedRemoteWrite: false,
      noBurnedSequenceForFailedOrUncertainWrite: true,
      failedBeforeWriteNoMintNoBurn: failedBeforeWrite,
      explicitRecoveryBlocksMintBurn: explicitRecovery,
      checksumMismatchBlocksSequenceBurn: checksumMismatch,
      remoteNewerBlocksSequenceBurn: remoteNewer,
      partialWriteBlocksSequenceBurn: partialOrUncertain,
      atomicOnRecovery: true,
      idempotencyKeyBindsExportConstraints: true,
      completedIdempotencyPreventsDuplicateMintBurn: completedDuplicate,
      changedPayloadTargetSequenceNotDuplicate: changedConstraints,
      outboxCompletedRequiresSequenceExportPolicy: true,
      ledgerNeverPrecedesVerifiedRemoteWrite: true,
      b5VerifiedRemoteWritePrerequisite: b5VerifiedWrite,
      // Hash-only references only.
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      idempotencyKeyHash: idempotencyKeyHash,
      b8ApprovalRefHash: b8ApprovalRefHash,
      killSwitchEnableTokenHash: killSwitchEnableTokenHash,
      endpointRefHash: hashLike(inp.endpointRefHash),
      remoteRootRefHash: hashLike(inp.remoteRootRefHash),
      peerIdentityBindingHash: hashLike(inp.peerIdentityBindingHash),
      credentialRefHash: hashLike(inp.credentialRefHash),
      sequenceExportConstraintRefHash: sequenceExportConstraintRefHash,
      exportIdRefHash: exportIdRefHash,
      burnedSequenceRefHash: burnedSequenceRefHash,
      outboxRecordHash: outboxRecordHash,
      b5VerifiedWriteRefHash: b5VerifiedWriteRefHash,
      // Non-activation invariants: hardcoded, never request-controllable.
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      exportIdMinted: false,
      sequenceBurned: false,
      ledgerWriteAllowed: ledgerWriteAllowed,
      publicationLedgerTouched: false,
      relayOutboxTouched: false,
      outboxCompleted: false,
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
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReadyIsAuthorization: false,
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
        rawInputRejected: blockers.indexOf('real-transport-b6-raw-input-rejected') !== -1,
        casInputRejected: blockers.indexOf('real-transport-b6-cas-boundary-violation') !== -1
      },
      finalizationStates: FINALIZATION_STATES.slice(),
      blockers: blockers,
      warnings: warnings
    };
  }

  function diagnose() {
    return {
      installed: true,
      schema: SCHEMA,
      version: VERSION,
      blocker: 'B6',
      substrate: 'real-transport-sequence-export-non-writing',
      evaluateOnly: true,
      finalizationStates: FINALIZATION_STATES.slice(),
      exportIdMintedDuringPreflight: false,
      exportIdMintedDuringLocalMock: false,
      sequenceBurnedDuringPreflight: false,
      sequenceBurnedBeforeVerifiedRemoteWrite: false,
      noBurnedSequenceForFailedOrUncertainWrite: true,
      atomicOnRecovery: true,
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      exportIdMinted: false,
      sequenceBurned: false,
      publicationLedgerTouched: false,
      relayOutboxTouched: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true
    };
  }

  H2O.Studio.sync.realTransportSequenceExport.evaluateRealTransportSequenceExport =
    evaluateRealTransportSequenceExport;
  H2O.Studio.sync.realTransportSequenceExport.diagnose = diagnose;
  H2O.Studio.sync.realTransportSequenceExport.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportSequenceExport.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportSequenceExport.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportSequenceExport.FINALIZATION_STATES = FINALIZATION_STATES.slice();
  H2O.Studio.sync.realTransportSequenceExport.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
