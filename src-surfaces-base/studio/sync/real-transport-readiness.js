/* H2O Studio Sync - Real-Transport B7 transportReady Evaluation (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate for the real transportReady policy.
 * It evaluates whether B1-B6 plus B8 evidence can produce a modeled transportReady
 * candidate. It does NOT execute real transport, does NOT make real WebDAV available,
 * does NOT mutate global/source transportReady, does NOT flip productSyncReady, does
 * NOT write WebDAV/cloud/relay/CAS/files, does NOT enqueue relay, does NOT mutate export
 * state, does NOT mint an export id, does NOT burn sequence, does NOT start or mint
 * fullBundle v3, and does NOT clean or mutate a950.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportReadiness = H2O.Studio.sync.realTransportReadiness || {};
  if (H2O.Studio.sync.realTransportReadiness.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b7-readiness.v1';
  var VERSION = '0.1.0-b7-readiness-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b7-readiness-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b7-readiness-result.v1';
  var REAL_TARGET_MODES = ['real-webdav', 'cloud', 'relay'];
  var LOCAL_MOCK_TARGET_MODES = ['local-mock-webdav', 'mock-peer'];
  var LOCAL_MOCK_SCOPES = ['local-mock-webdav-target-only', 'local-mock-webdav-target', 'dry-run-no-real-transport'];
  var LOCAL_MOCK_SCHEMAS = [
    'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1',
    'h2o.studio.controlled-local-mock-webdav-transport.approval.v1'
  ];
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
  function addUnique(list, code) { var text = cleanString(code); if (text && list.indexOf(text) === -1) list.push(text); }

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

  function nestedValue(scope, name) {
    return Object.prototype.hasOwnProperty.call(scope, name) ? scope[name] : undefined;
  }

  function firstValue(scopes, names) {
    for (var s = 0; s < scopes.length; s += 1) {
      for (var n = 0; n < names.length; n += 1) {
        var value = nestedValue(scopes[s], names[n]);
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

  function rawInputPresent(scopes, hashRefs) {
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    for (var h = 0; h < hashRefs.length; h += 1) {
      if (looksRaw(hashRefs[h])) return true;
    }
    return false;
  }

  function casInputPresent(scopes) {
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < CAS_INPUT_KEYS.length; k += 1) {
        var key = CAS_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '' &&
          scopes[s][key] !== false) return true;
      }
    }
    return false;
  }

  function evaluateRealTransportReadiness(request) {
    var inp = safeObject(request);
    var evidence = safeObject(inp.evidence);
    var target = safeObject(inp.target);
    var approval = safeObject(inp.approval || inp.operatorApproval);
    var readiness = safeObject(inp.readiness);
    var payload = safeObject(inp.payload || inp.candidate);
    var safety = safeObject(inp.safety);
    var transport = safeObject(inp.transport);
    var blockers = [];
    var warnings = [];
    var scopes = [inp, evidence, target, approval, readiness, payload, safety, transport];

    var targetMode = cleanString(firstValue(scopes, ['targetMode', 'mode']));
    var approvalSchema = cleanString(firstValue(scopes, ['approvalSchema', 'schema']));
    var approvalScope = cleanString(firstValue(scopes, ['scope']));
    var isRealTarget = REAL_TARGET_MODES.indexOf(targetMode) !== -1;
    var isLocalMockTarget = LOCAL_MOCK_TARGET_MODES.indexOf(targetMode) !== -1;
    var isLocalMockApproval = LOCAL_MOCK_SCHEMAS.indexOf(approvalSchema) !== -1 ||
      LOCAL_MOCK_SCOPES.indexOf(approvalScope) !== -1 || bool(firstValue(scopes, ['localMockApproval']));

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
    var candidatePayloadHash = firstHash(scopes, ['candidatePayloadHash']);
    var candidateBundleHash = firstHash(scopes, ['candidateBundleHash']);
    var fullBundleV2EnvelopeHash = firstHash(scopes, ['fullBundleV2EnvelopeHash']);
    var transportReadinessReviewRefHash = firstHash(scopes, ['transportReadinessReviewRefHash']);
    var payloadSchema = cleanString(firstValue(scopes, ['payloadSchema']));
    var payloadHashesMatch = !!candidatePayloadHash && candidatePayloadHash === candidateBundleHash &&
      candidatePayloadHash === fullBundleV2EnvelopeHash;

    var b1Ready = firstBool(scopes, ['b1TargetConfigReady']) && !!b1TargetConfigRefHash &&
      !!(endpointRefHash && remoteRootRefHash && credentialRefHash && peerIdentityBindingHash && localClientIdentityHash);
    var b2Ready = firstBool(scopes, ['b2KillSwitchLifecycleReady']) && !!b2KillSwitchRefHash;
    var b3Ready = firstBool(scopes, ['b3DurableIdempotencyReady']) && !!b3IdempotencyRefHash;
    var b4Ready = firstBool(scopes, ['b4EnqueueOutboxBoundaryReady']) && !!b4OutboxBoundaryRefHash;
    var b5Ready = firstBool(scopes, ['b5ConflictPartialWriteReady']) && !!b5ConflictPolicyRefHash;
    var b6Ready = firstBool(scopes, ['b6SequenceExportReady']) && !!b6SequenceExportRefHash;
    var b8Ready = firstBool(scopes, ['b8ApprovalAccepted']) && firstBool(scopes, ['realTransportApprovalAccepted']) &&
      !!b8ApprovalRefHash;
    var localExportableReady = firstBool(scopes, ['localExportableSyncReady']);
    var eligibilityReady = firstBool(scopes, ['transportEligibilityFromLocalExportableReady']);
    var productSyncReadyFalse = exactFalse(scopes, ['productSyncReady']);
    var transportReadyFalse = exactFalse(scopes, ['transportReady']);
    var fullBundleV3Deferred = firstBool(scopes, ['fullBundleV3Deferred']) || firstBool(scopes, ['noFullBundleV3']);
    var chatSavingCasSeparate = firstBool(scopes, ['chatSavingCasSeparate']) && firstBool(scopes, ['noChatSavingCAS']) &&
      firstBool(scopes, ['chatSavingCasBlocked']);
    var a950Quarantined = firstBool(scopes, ['a950DocumentedDebtQuarantined']) &&
      firstValue(scopes, ['a950LeaksIntoExportablePayload']) === false && firstBool(scopes, ['noA950Mutation']);
    var rawRefs = [
      b1TargetConfigRefHash, endpointRefHash, remoteRootRefHash, credentialRefHash, peerIdentityBindingHash,
      localClientIdentityHash, b2KillSwitchRefHash, b3IdempotencyRefHash, b4OutboxBoundaryRefHash,
      b5ConflictPolicyRefHash, b6SequenceExportRefHash, b8ApprovalRefHash, b7ReadinessPolicyRefHash,
      candidatePayloadHash, candidateBundleHash, fullBundleV2EnvelopeHash, transportReadinessReviewRefHash
    ];
    var writeRequest = bool(firstValue(scopes, ['writeWebDAV'])) || bool(firstValue(scopes, ['writeCloud'])) ||
      bool(firstValue(scopes, ['writeRelay'])) || bool(firstValue(scopes, ['enqueueRelay'])) ||
      bool(firstValue(scopes, ['writeCAS'])) || bool(firstValue(scopes, ['writeFiles'])) ||
      bool(firstValue(scopes, ['mutateExportState'])) || bool(firstValue(scopes, ['mintExportId'])) ||
      bool(firstValue(scopes, ['burnSequence']));

    if (!b1Ready) addUnique(blockers, 'real-transport-b7-b1-evidence-missing');
    if (!b2Ready) addUnique(blockers, 'real-transport-b7-b2-evidence-missing');
    if (!b3Ready) addUnique(blockers, 'real-transport-b7-b3-evidence-missing');
    if (!b4Ready) addUnique(blockers, 'real-transport-b7-b4-evidence-missing');
    if (!b5Ready) addUnique(blockers, 'real-transport-b7-b5-evidence-missing');
    if (!b6Ready) addUnique(blockers, 'real-transport-b7-b6-evidence-missing');
    if (!b8Ready) addUnique(blockers, 'real-transport-b7-b8-approval-acceptance-missing');
    if (!b7ReadinessPolicyRefHash || !transportReadinessReviewRefHash) {
      addUnique(blockers, 'real-transport-b7-readiness-policy-review-ref-missing');
    }
    if (!isRealTarget) addUnique(blockers, 'real-transport-b7-real-target-required');
    if (isLocalMockTarget || isLocalMockApproval) addUnique(blockers, 'real-transport-b7-local-mock-not-accepted');
    if (!productSyncReadyFalse || firstValue(scopes, ['productSyncReady']) === true) {
      addUnique(blockers, 'real-transport-b7-product-sync-ready-must-remain-false');
    }
    if (!transportReadyFalse || firstValue(scopes, ['transportReady']) === true) {
      addUnique(blockers, 'real-transport-b7-caller-transport-ready-true-blocked');
    }
    if (!localExportableReady) addUnique(blockers, 'real-transport-b7-local-exportable-not-ready');
    if (!eligibilityReady) addUnique(blockers, 'real-transport-b7-transport-eligibility-missing');
    if (!payloadHashesMatch || payloadSchema !== 'h2o.studio.fullBundle.v2') {
      addUnique(blockers, 'real-transport-b7-fullbundle-v2-envelope-invalid');
    }
    if (!fullBundleV3Deferred || bool(firstValue(scopes, ['startFullBundleV3'])) ||
      bool(firstValue(scopes, ['fullBundleV3Required']))) {
      addUnique(blockers, 'real-transport-b7-fullbundle-v3-request-blocked');
    }
    if (!chatSavingCasSeparate || bool(firstValue(scopes, ['touchChatSavingCAS']))) {
      addUnique(blockers, 'real-transport-b7-chat-saving-cas-boundary-violation');
    }
    if (!a950Quarantined || bool(firstValue(scopes, ['mutateA950'])) || bool(firstValue(scopes, ['cleanupAuthority']))) {
      addUnique(blockers, 'real-transport-b7-a950-cleanup-or-leakage-blocked');
    }
    if (rawInputPresent(scopes, rawRefs)) addUnique(blockers, 'real-transport-b7-raw-input-rejected');
    if (casInputPresent(scopes)) addUnique(blockers, 'real-transport-b7-cas-key-input-rejected');
    if (writeRequest) addUnique(blockers, 'real-transport-b7-write-or-mutation-request-blocked');
    if (firstValue(scopes, ['transportReadyFlipAuthorized']) === true ||
      firstValue(scopes, ['mutateGlobalTransportReady']) === true) {
      addUnique(blockers, 'real-transport-b7-transport-ready-flip-request-blocked');
    }

    var allSatisfied = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: allSatisfied,
      status: allSatisfied ? 'real-transport-b7-readiness-candidate' : 'blocked-real-transport-b7-readiness',
      reason: allSatisfied ? 'real-transport-b7-readiness-candidate' : blockers[0],
      realTransportReadinessEvaluated: true,
      allPrerequisitesSatisfied: allSatisfied,
      transportReadyCandidate: allSatisfied,
      transportReadyFlipAuthorized: false,
      transportReady: false,
      productSyncReady: false,
      realWebDAVTransportAvailable: false,
      realTransportWriteAuthorized: false,
      realTransportExecuted: false,
      targetMode: isRealTarget ? targetMode : '',
      b1TargetConfigReady: b1Ready,
      b2KillSwitchLifecycleReady: b2Ready,
      b3DurableIdempotencyReady: b3Ready,
      b4EnqueueOutboxBoundaryReady: b4Ready,
      b5ConflictPartialWriteReady: b5Ready,
      b6SequenceExportReady: b6Ready,
      b8ApprovalAccepted: b8Ready,
      localExportableSyncReady: localExportableReady,
      localExportableSyncReadyIsAuthorization: false,
      transportEligibilityFromLocalExportableReady: eligibilityReady,
      transportEligibilityIsAuthorization: false,
      fullBundleV2EnvelopeBoundary: payloadHashesMatch && payloadSchema === 'h2o.studio.fullBundle.v2',
      fullBundleV3Deferred: fullBundleV3Deferred,
      chatSavingCasBlocked: true,
      chatSavingCasSeparate: chatSavingCasSeparate,
      a950DocumentedDebtQuarantined: a950Quarantined,
      a950LeaksIntoExportablePayload: false,
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
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesCAS: false,
      writesFiles: false,
      touchChatSavingCas: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      noA950Mutation: true,
      rawEndpointLogged: false,
      rawCredentialLogged: false,
      rawRemotePathLogged: false,
      rawPayloadBodyLogged: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b7-raw-input-rejected') !== -1
      },
      blockers: blockers,
      warnings: warnings
    };
  }

  function diagnose() {
    return {
      installed: true,
      schema: SCHEMA,
      version: VERSION,
      blocker: 'B7',
      substrate: 'real-transport-readiness-evaluation-non-writing',
      evaluateOnly: true,
      transportReadyCandidateOnly: true,
      transportReadyFlipAuthorized: false,
      realWebDAVTransportAvailable: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true
    };
  }

  H2O.Studio.sync.realTransportReadiness.evaluateRealTransportReadiness = evaluateRealTransportReadiness;
  H2O.Studio.sync.realTransportReadiness.diagnose = diagnose;
  H2O.Studio.sync.realTransportReadiness.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportReadiness.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportReadiness.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportReadiness.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
