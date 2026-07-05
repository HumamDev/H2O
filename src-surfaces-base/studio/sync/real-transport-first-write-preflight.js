/* H2O Studio Sync - Real Transport First-Write Preflight (W2a)
 *
 * Standalone, zero-write, non-activating evaluator for a first-write
 * authorization candidate receipt core. It creates deterministic receipt text
 * only. It does not calculate a digest, does not mint a token, does not execute
 * transport, and does not create standing write authority.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportFirstWritePreflight =
    H2O.Studio.sync.realTransportFirstWritePreflight || {};
  if (H2O.Studio.sync.realTransportFirstWritePreflight.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-w2-first-write-preflight.v1';
  var VERSION = '0.1.0-w2a-first-write-preflight-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-w2-first-write-preflight-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-w2-first-write-preflight-result.v1';
  var RECEIPT_SCHEMA = 'h2o.studio.transport.first-write-authorization-candidate-receipt-core.v1';
  var PREFLIGHT_GATE = 'real-webdav-cloud-relay-transport-first-write-preflight-evaluate';
  var CANONICALIZATION = 'json-sorted-keys-v1';

  var RAW_INPUT_KEYS = [
    'endpoint', 'endpointUrl', 'href', 'rawEndpoint',
    'credential', 'credentials', 'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'accessKey', 'access_key', 'rawCredential', 'remotePath', 'path', 'rawRemotePath',
    'payloadBody', 'bundleBody', 'rawPayloadBody', 'rawBundleBody'
  ];
  var CAS_INPUT_KEYS = ['casKey', 'casKeyHash', 'chatSavingCasKey', 'casKeys'];
  var LOCAL_MOCK_SCOPES = ['local-mock-webdav-target-only', 'local-mock-webdav-target', 'dry-run-no-real-transport'];
  var LOCAL_MOCK_SCHEMAS = [
    'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1',
    'h2o.studio.controlled-local-mock-webdav-transport.approval.v1'
  ];
  var LOCAL_MOCK_TARGET_MODES = ['local-mock-webdav', 'mock-peer'];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function bool(value) { return value === true; }
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

  function looksRaw(value) {
    var text = cleanString(value);
    if (!text || hashLike(text)) return false;
    return /:\/\//.test(text) || /^\//.test(text) || /\\/.test(text) ||
      /^[a-z0-9._%+-]+@[a-z0-9.-]+$/i.test(text);
  }

  function nestedValue(scope, name) {
    return Object.prototype.hasOwnProperty.call(scope, name) ? scope[name] : undefined;
  }

  function firstValue(scopes, names) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var n = 0; n < names.length; n += 1) {
        var value = nestedValue(scope, names[n]);
        if (value !== undefined && value !== null && cleanString(value) !== '') return value;
      }
    }
    return undefined;
  }

  function firstHash(scopes, names) {
    return hashLike(firstValue(scopes, names));
  }

  function firstBool(scopes, names) {
    return firstValue(scopes, names) === true;
  }

  function exactFalse(scopes, names) {
    return firstValue(scopes, names) === false;
  }

  function utcString(value) {
    var text = cleanString(value);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) ? text : '';
  }

  function rawInputPresent(scopes, hashRefs) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scope, key) && cleanString(scope[key]) !== '') return true;
      }
    }
    for (var h = 0; h < hashRefs.length; h += 1) {
      if (looksRaw(hashRefs[h])) return true;
    }
    return false;
  }

  function casInputPresent(scopes) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var k = 0; k < CAS_INPUT_KEYS.length; k += 1) {
        var key = CAS_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scope, key) &&
          cleanString(scope[key]) !== '' && scope[key] !== false) return true;
      }
    }
    return false;
  }

  function sortedClone(value) {
    if (Array.isArray(value)) return value.map(sortedClone);
    if (isObject(value)) {
      var out = {};
      var keys = Object.keys(value).sort();
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i];
        var item = value[key];
        if (item !== undefined) out[key] = sortedClone(item);
      }
      return out;
    }
    return value;
  }

  function canonicalString(value) {
    return JSON.stringify(sortedClone(value));
  }

  function nonActivationBase() {
    return {
      standingAuthority: false,
      oneShotTokenMinted: false,
      realWriteExecuted: false,
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      transportReady: false,
      transportReadyFlipAuthorized: false,
      productSyncReady: false,
      realOutboxRowCreated: false,
      relayOutboxTouched: false,
      publicationLedgerTouched: false,
      durableStoreCreated: false,
      enqueuesRelay: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      writesCAS: false,
      writesFiles: false,
      writesKv: false,
      writesSqlite: false,
      writesLocalStorage: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      bootResumeDispatch: false,
      mutatesExportState: false,
      chatSavingCasBlocked: true,
      noCleanupAuthority: true,
      noA950Mutation: true
    };
  }

  function buildReceiptObject(result) {
    var bindings = safeObject(result.receiptBindings);
    var scope = safeObject(result.w3InvocationScope);
    return {
      schema: RECEIPT_SCHEMA,
      receiptKind: 'first-write-authorization-candidate',
      canonicalization: CANONICALIZATION,
      candidateOnly: true,
      standingAuthority: false,
      oneShotTokenMinted: false,
      gate: PREFLIGHT_GATE,
      operation: 'preflight',
      expiryUtc: cleanString(result.expiryUtc),
      receiptBindings: bindings,
      targetScope: safeObject(result.targetScope),
      w3InvocationScope: scope,
      boundaries: {
        realWriteExecuted: false,
        realWebDAVTransportAvailable: false,
        transportReady: false,
        transportReadyFlipAuthorized: false,
        productSyncReady: false,
        writesWebDAV: false,
        writesCloud: false,
        writesRelay: false,
        enqueuesRelay: false,
        writesCAS: false,
        writesFiles: false,
        realOutboxRowCreated: false,
        relayOutboxTouched: false,
        publicationLedgerTouched: false,
        durableStoreCreated: false,
        mintsExportId: false,
        burnsSequence: false,
        fullBundleV3Started: false,
        noCleanupAuthority: true,
        noA950Mutation: true
      }
    };
  }

  function buildReceiptCore(result) {
    var res = safeObject(result);
    if (res.ok !== true) return '';
    return canonicalString(buildReceiptObject(res));
  }

  function evaluateRealTransportFirstWritePreflight(request) {
    var inp = safeObject(request);
    var evidence = safeObject(inp.evidence);
    var readiness = safeObject(inp.readiness);
    var target = safeObject(inp.target);
    var targetScope = safeObject(inp.targetScope);
    var w3InvocationScope = safeObject(inp.w3InvocationScope);
    var approval = safeObject(inp.approval || inp.operatorApproval);
    var payload = safeObject(inp.payload || inp.candidate);
    var safety = safeObject(inp.safety);
    var transport = safeObject(inp.transport);
    var privacy = safeObject(inp.privacy);
    var blockers = [];
    var warnings = [];
    var scopes = [inp, evidence, readiness, target, targetScope, w3InvocationScope, approval, payload, safety, transport, privacy];

    var gate = cleanString(firstValue(scopes, ['gate']));
    var operation = cleanString(firstValue(scopes, ['operation']));
    var applyRequested = firstValue(scopes, ['apply']) === true || firstValue(scopes, ['applyRequested']) === true;
    var executeRequested = firstValue(scopes, ['execute']) === true ||
      firstValue(scopes, ['executeRequested']) === true;
    var targetMode = cleanString(firstValue(scopes, ['targetMode', 'mode']));
    var approvalSchema = cleanString(firstValue(scopes, ['approvalSchema', 'schema']));
    var approvalScope = cleanString(firstValue(scopes, ['scope']));
    var isLocalMockApproval = LOCAL_MOCK_SCHEMAS.indexOf(approvalSchema) !== -1 ||
      LOCAL_MOCK_SCOPES.indexOf(approvalScope) !== -1 || bool(firstValue(scopes, ['localMockApproval']));
    var isLocalMockTarget = LOCAL_MOCK_TARGET_MODES.indexOf(targetMode) !== -1;

    var b1TargetConfigRefHash = firstHash(scopes, ['b1TargetConfigRefHash']);
    var endpointRefHash = firstHash(scopes, ['endpointRefHash']);
    var remoteRootRefHash = firstHash(scopes, ['remoteRootRefHash']);
    var credentialRefHash = firstHash(scopes, ['credentialRefHash']);
    var peerIdentityBindingHash = firstHash(scopes, ['peerIdentityBindingHash']);
    var localClientIdentityHash = firstHash(scopes, ['localClientIdentityHash']);
    var b2KillSwitchRefHash = firstHash(scopes, ['b2KillSwitchRefHash', 'killSwitchEnableTokenHash']);
    var b3IdempotencyRefHash = firstHash(scopes, ['b3IdempotencyRefHash', 'idempotencyKeyHash']);
    var b4OutboxBoundaryRefHash = firstHash(scopes, ['b4OutboxBoundaryRefHash', 'outboxRecordHash']);
    var b5ConflictPolicyRefHash = firstHash(scopes, ['b5ConflictPolicyRefHash', 'conflictPolicyRefHash']);
    var b6SequenceExportRefHash = firstHash(scopes, ['b6SequenceExportRefHash', 'sequenceExportConstraintRefHash']);
    var b8ApprovalRefHash = firstHash(scopes, ['b8ApprovalRefHash', 'approvalRecordHash']);
    var b7ReadinessPolicyRefHash = firstHash(scopes, ['b7ReadinessPolicyRefHash']);
    var transportReadinessReviewRefHash = firstHash(scopes, ['transportReadinessReviewRefHash']);
    var candidatePayloadHash = firstHash(scopes, ['candidatePayloadHash']);
    var candidateBundleHash = firstHash(scopes, ['candidateBundleHash']);
    var fullBundleV2EnvelopeHash = firstHash(scopes, ['fullBundleV2EnvelopeHash']);
    var sequenceExportConstraintRefHash = firstHash(scopes, ['sequenceExportConstraintRefHash']) || b6SequenceExportRefHash;
    var w1cProofReceiptHash = firstHash(scopes, ['w1cProofReceiptHash']);
    var b8ApprovalArtifactHash = firstHash(scopes, ['b8ApprovalArtifactHash']);
    var rollbackRehearsalReceiptHash = firstHash(scopes, ['rollbackRehearsalReceiptHash']);
    var remoteRootInitialStateHash = firstHash(scopes, ['remoteRootInitialStateHash']);
    var recoveryPlanHash = firstHash(scopes, ['recoveryPlanHash']);
    var targetRefHash = firstHash(scopes, ['targetRefHash']);
    var payloadSchema = cleanString(firstValue(scopes, ['payloadSchema']));
    var expiryUtc = utcString(firstValue([w3InvocationScope, inp, evidence], ['expiryUtc']));
    var payloadKind = cleanString(firstValue([targetScope, inp], ['payloadKind']));
    var payloadCount = firstValue([targetScope, inp], ['payloadCount']);
    var operationKind = cleanString(firstValue([w3InvocationScope, inp], ['operationKind']));
    var maxInvocations = firstValue([w3InvocationScope, inp], ['maxInvocations']);

    var allTargetHashes = endpointRefHash && remoteRootRefHash && credentialRefHash &&
      peerIdentityBindingHash && localClientIdentityHash && targetRefHash;
    var targetEvidenceReady = !!(b1TargetConfigRefHash && allTargetHashes);
    var payloadHashesMatch = !!candidatePayloadHash && candidatePayloadHash === candidateBundleHash &&
      candidatePayloadHash === fullBundleV2EnvelopeHash && payloadSchema === 'h2o.studio.fullBundle.v2';
    var chainReady = firstBool(scopes, ['b1TargetConfigReady']) &&
      firstBool(scopes, ['b3DurableIdempotencyReady']) &&
      firstBool(scopes, ['b4EnqueueOutboxBoundaryReady']) &&
      firstBool(scopes, ['b5ConflictPartialWriteReady']) &&
      firstBool(scopes, ['b6SequenceExportReady']) &&
      firstBool(scopes, ['b7ReadinessCandidate', 'transportReadyCandidate']) &&
      !!(b3IdempotencyRefHash && b4OutboxBoundaryRefHash && b5ConflictPolicyRefHash &&
        b6SequenceExportRefHash && b7ReadinessPolicyRefHash && transportReadinessReviewRefHash);
    var approvalReady = firstBool(scopes, ['b8ApprovalAccepted']) &&
      firstBool(scopes, ['realTransportApprovalAccepted']) && !!b8ApprovalRefHash;
    var killSwitchReady = firstBool(scopes, ['b2KillSwitchLifecycleReady']) && !!b2KillSwitchRefHash &&
      firstValue(scopes, ['killSwitchStale']) !== true;
    var localExportableIsAuth = firstValue(scopes, ['localExportableSyncReadyIsAuthorization']) === true ||
      firstValue(scopes, ['transportEligibilityIsAuthorization']) === true;
    var localExportableReady = firstBool(scopes, ['localExportableSyncReady']);
    var eligibilityReady = firstBool(scopes, ['transportEligibilityFromLocalExportableReady']);
    var targetScopeValid = payloadKind === 'single-fullbundle-v2-envelope' && payloadCount === 1 && !!targetRefHash;
    var invocationScopeValid = operationKind === 'first-controlled-real-write' && maxInvocations === 1 && !!expiryUtc;
    var sequenceMismatch = !!sequenceExportConstraintRefHash && !!b6SequenceExportRefHash &&
      sequenceExportConstraintRefHash !== b6SequenceExportRefHash;
    var rawRefs = [
      b1TargetConfigRefHash, endpointRefHash, remoteRootRefHash, credentialRefHash, peerIdentityBindingHash,
      localClientIdentityHash, b2KillSwitchRefHash, b3IdempotencyRefHash, b4OutboxBoundaryRefHash,
      b5ConflictPolicyRefHash, b6SequenceExportRefHash, b8ApprovalRefHash, b7ReadinessPolicyRefHash,
      transportReadinessReviewRefHash, candidatePayloadHash, candidateBundleHash, fullBundleV2EnvelopeHash,
      sequenceExportConstraintRefHash, w1cProofReceiptHash, b8ApprovalArtifactHash, rollbackRehearsalReceiptHash,
      remoteRootInitialStateHash, recoveryPlanHash, targetRefHash
    ];

    if (gate !== PREFLIGHT_GATE || operation !== 'preflight') addUnique(blockers, 'real-transport-w2-wrong-gate');
    if (applyRequested) addUnique(blockers, 'real-transport-w2-apply-requested');
    if (executeRequested) addUnique(blockers, 'real-transport-w2-execute-requested');
    if (!w1cProofReceiptHash) addUnique(blockers, 'real-transport-w2-w1c-proof-missing');
    if (!b8ApprovalArtifactHash) addUnique(blockers, 'real-transport-w2-b8-artifact-missing');
    if (!approvalReady) addUnique(blockers, 'real-transport-w2-approval-missing');
    if (isLocalMockApproval || isLocalMockTarget) addUnique(blockers, 'real-transport-w2-local-mock-approval-rejected');
    if (!localExportableReady || !eligibilityReady || localExportableIsAuth) {
      addUnique(blockers, 'real-transport-w2-local-exportable-not-authorization');
    }
    if (!targetEvidenceReady) addUnique(blockers, 'real-transport-w2-target-evidence-missing');
    if (!killSwitchReady) addUnique(blockers, 'real-transport-w2-kill-switch-missing-or-stale');
    if (!rollbackRehearsalReceiptHash) addUnique(blockers, 'real-transport-w2-rollback-rehearsal-missing');
    if (!remoteRootInitialStateHash) addUnique(blockers, 'real-transport-w2-remote-root-state-missing');
    if (!recoveryPlanHash) addUnique(blockers, 'real-transport-w2-recovery-plan-missing');
    if (!chainReady) addUnique(blockers, 'real-transport-w2-chain-evidence-missing');
    if (!payloadHashesMatch) addUnique(blockers, 'real-transport-w2-payload-envelope-mismatch');
    if (!targetScopeValid) addUnique(blockers, 'real-transport-w2-scope-not-single-payload');
    if (!invocationScopeValid) addUnique(blockers, 'real-transport-w2-invocation-scope-invalid');
    if (firstValue(scopes, ['transportReady']) === true || firstValue(scopes, ['transportReadyFlipAuthorized']) === true) {
      addUnique(blockers, 'real-transport-w2-transport-ready-claim-rejected');
    }
    if (firstValue(scopes, ['productSyncReady']) !== false) {
      addUnique(blockers, 'real-transport-w2-product-sync-ready-claim-rejected');
    }
    if (sequenceMismatch) addUnique(blockers, 'real-transport-w2-sequence-constraint-mismatch');
    if (firstValue(scopes, ['peerAmbiguous']) === true || firstValue(scopes, ['ambiguous']) === true ||
      firstValue(scopes, ['peerTargetAmbiguous']) === true) {
      addUnique(blockers, 'real-transport-w2-peer-ambiguous');
    }
    if (rawInputPresent(scopes, rawRefs)) addUnique(blockers, 'real-transport-w2-raw-input-rejected');
    if (casInputPresent(scopes)) addUnique(blockers, 'real-transport-w2-cas-input-rejected');
    if (firstValue(scopes, ['startFullBundleV3']) === true || firstValue(scopes, ['fullBundleV3Required']) === true ||
      firstValue(scopes, ['fullBundleV3Started']) === true || firstValue(scopes, ['noFullBundleV3']) === false) {
      addUnique(blockers, 'real-transport-w2-fullbundle-v3-rejected');
    }

    var ready = blockers.length === 0;
    var bindings = {
      b1TargetConfigRefHash: b1TargetConfigRefHash,
      endpointRefHash: endpointRefHash,
      remoteRootRefHash: remoteRootRefHash,
      credentialRefHash: credentialRefHash,
      peerIdentityBindingHash: peerIdentityBindingHash,
      localClientIdentityHash: localClientIdentityHash,
      b2KillSwitchRefHash: b2KillSwitchRefHash,
      b3IdempotencyRefHash: b3IdempotencyRefHash,
      b4OutboxBoundaryRefHash: b4OutboxBoundaryRefHash,
      b5ConflictPolicyRefHash: b5ConflictPolicyRefHash,
      b6SequenceExportRefHash: b6SequenceExportRefHash,
      b8ApprovalRefHash: b8ApprovalRefHash,
      b7ReadinessPolicyRefHash: b7ReadinessPolicyRefHash,
      transportReadinessReviewRefHash: transportReadinessReviewRefHash,
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      fullBundleV2EnvelopeHash: fullBundleV2EnvelopeHash,
      sequenceExportConstraintRefHash: sequenceExportConstraintRefHash,
      w1cProofReceiptHash: w1cProofReceiptHash,
      b8ApprovalArtifactHash: b8ApprovalArtifactHash,
      rollbackRehearsalReceiptHash: rollbackRehearsalReceiptHash,
      remoteRootInitialStateHash: remoteRootInitialStateHash,
      recoveryPlanHash: recoveryPlanHash,
      targetRefHash: targetRefHash
    };
    var scopedTarget = {
      payloadKind: targetScopeValid ? payloadKind : '',
      payloadCount: targetScopeValid ? 1 : 0,
      targetRefHash: targetScopeValid ? targetRefHash : ''
    };
    var scopedInvocation = {
      operationKind: invocationScopeValid ? operationKind : '',
      maxInvocations: invocationScopeValid ? 1 : 0,
      expiryUtc: invocationScopeValid ? expiryUtc : ''
    };
    var base = nonActivationBase();
    base.schema = RESULT_SCHEMA;
    base.requestSchema = REQUEST_SCHEMA;
    base.version = VERSION;
    base.ok = ready;
    base.status = ready ? 'real-transport-w2-first-write-preflight-ready' :
      'blocked-real-transport-w2-first-write-preflight';
    base.reason = ready ? 'real-transport-w2-first-write-preflight-ready' : blockers[0];
    base.gate = gate;
    base.gateSatisfied = gate === PREFLIGHT_GATE;
    base.operation = operation;
    base.firstWritePreflight = true;
    base.firstWriteAuthorizationCandidate = ready;
    base.receiptKind = 'first-write-authorization-candidate';
    base.receiptCoreCanonicalization = CANONICALIZATION;
    base.receiptBindings = bindings;
    base.targetScope = scopedTarget;
    base.w3InvocationScope = scopedInvocation;
    base.expiryUtc = invocationScopeValid ? expiryUtc : '';
    base.receiptCore = ready ? buildReceiptCore(base) : '';
    base.blockers = blockers;
    base.warnings = warnings;
    base.privacy = {
      redacted: true,
      hashOnly: true,
      rawInputRejected: blockers.indexOf('real-transport-w2-raw-input-rejected') !== -1,
      casInputRejected: blockers.indexOf('real-transport-w2-cas-input-rejected') !== -1
    };
    return base;
  }

  function diagnose() {
    var base = nonActivationBase();
    base.installed = true;
    base.schema = SCHEMA;
    base.version = VERSION;
    base.requestSchema = REQUEST_SCHEMA;
    base.receiptSchema = RECEIPT_SCHEMA;
    base.gate = PREFLIGHT_GATE;
    base.evaluateOnly = true;
    base.loadTimeInert = true;
    base.receiptCoreCanonicalization = CANONICALIZATION;
    base.firstWritePreflight = true;
    base.firstWriteAuthorizationCandidate = false;
    base.status = 'real-transport-w2-first-write-preflight-diagnose-ready';
    return base;
  }

  H2O.Studio.sync.realTransportFirstWritePreflight.evaluateRealTransportFirstWritePreflight =
    evaluateRealTransportFirstWritePreflight;
  H2O.Studio.sync.realTransportFirstWritePreflight.buildReceiptCore = buildReceiptCore;
  H2O.Studio.sync.realTransportFirstWritePreflight.diagnose = diagnose;
  H2O.Studio.sync.realTransportFirstWritePreflight.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportFirstWritePreflight.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportFirstWritePreflight.RECEIPT_SCHEMA = RECEIPT_SCHEMA;
  H2O.Studio.sync.realTransportFirstWritePreflight.PREFLIGHT_GATE = PREFLIGHT_GATE;
  H2O.Studio.sync.realTransportFirstWritePreflight.__installed = true;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
