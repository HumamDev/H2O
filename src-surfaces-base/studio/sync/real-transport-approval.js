/* H2O Studio Sync - Real-Transport B8 Approval Acceptance (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate for the real WebDAV/cloud/relay
 * approval contract. It validates only the B8 approval shape and references. It does
 * NOT execute real transport, does NOT make real WebDAV available, does NOT flip
 * productSyncReady or transportReady, does NOT write WebDAV/cloud/relay/CAS/files, does
 * NOT enqueue relay, does NOT mutate export state, does NOT mint an export id, does NOT
 * burn sequence, does NOT start or mint fullBundle v3, and does NOT clean or mutate a950.
 * Approval acceptance here is contract validity only, not write authorization.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportApproval = H2O.Studio.sync.realTransportApproval || {};
  if (H2O.Studio.sync.realTransportApproval.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b8-approval.v1';
  var VERSION = '0.1.0-b8-approval-non-writing';
  var APPROVAL_SCHEMA = 'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b8-approval-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b8-approval-result.v1';
  var REQUIRED_SCOPE = 'real-webdav-cloud-relay-target';
  var LOCAL_MOCK_SCOPES = ['local-mock-webdav-target-only', 'local-mock-webdav-target', 'dry-run-no-real-transport'];
  var LOCAL_MOCK_SCHEMAS = [
    'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1',
    'h2o.studio.controlled-local-mock-webdav-transport.approval.v1'
  ];
  var LOCAL_MOCK_TARGET_MODES = ['local-mock-webdav', 'mock-peer'];
  var REAL_TARGET_MODES = ['real-webdav', 'cloud', 'relay'];
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
    var value = firstValue(scopes, names);
    return hashLike(value);
  }

  function firstBool(scopes, names) {
    var value = firstValue(scopes, names);
    return value === true;
  }

  function exactFalse(scopes, names) {
    var value = firstValue(scopes, names);
    return value === false;
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

  function evaluateRealTransportApproval(request) {
    var inp = safeObject(request);
    var approval = safeObject(inp.approval || inp.operatorApproval);
    var target = safeObject(inp.target);
    var payload = safeObject(inp.payload || inp.candidate);
    var safety = safeObject(inp.safety);
    var transport = safeObject(inp.transport);
    var readiness = safeObject(inp.readiness);
    var blockers = [];
    var warnings = [];
    var scopes = [approval, inp, target, payload, safety, transport, readiness];

    var schema = cleanString(firstValue(scopes, ['schema', 'approvalSchema']));
    var scope = cleanString(firstValue(scopes, ['scope']));
    var targetMode = cleanString(firstValue(scopes, ['targetMode', 'mode']));
    var productSyncReadyProvidedFalse = exactFalse(scopes, ['productSyncReady']);
    var transportReadyProvidedFalse = exactFalse(scopes, ['transportReady']);
    var privacyHashOnly = firstBool(scopes, ['privacyHashOnly']) || cleanString(firstValue([safeObject(inp.privacy), safeObject(approval.privacy)], ['mode'])) === 'hash-only';

    var endpointRefHash = firstHash(scopes, ['endpointRefHash']);
    var remoteRootRefHash = firstHash(scopes, ['remoteRootRefHash']);
    var credentialRefHash = firstHash(scopes, ['credentialRefHash']);
    var peerIdentityBindingHash = firstHash(scopes, ['peerIdentityBindingHash']);
    var localClientIdentityHash = firstHash(scopes, ['localClientIdentityHash']);
    var killSwitchEnableTokenHash = firstHash(scopes, ['killSwitchEnableTokenHash', 'killSwitchLifecycleRefHash']);
    var idempotencyKeyHash = firstHash(scopes, ['idempotencyKeyHash', 'durableIdempotencyKeyHash']);
    var conflictPolicyRefHash = firstHash(scopes, ['conflictPolicyRefHash', 'conflictPartialWritePolicyRefHash']);
    var sequenceExportConstraintRefHash = firstHash(scopes, ['sequenceExportConstraintRefHash', 'sequenceExportIdPolicyRefHash']);
    var b7ReadinessPolicyRefHash = firstHash(scopes, ['b7ReadinessPolicyRefHash']);
    var b8ApprovalRefHash = firstHash(scopes, ['b8ApprovalRefHash', 'approvalRecordHash']);
    var approvalRecordHash = firstHash(scopes, ['approvalRecordHash', 'b8ApprovalRefHash']);
    var candidatePayloadHash = firstHash(scopes, ['candidatePayloadHash']);
    var candidateBundleHash = firstHash(scopes, ['candidateBundleHash']);
    var fullBundleV2EnvelopeHash = firstHash(scopes, ['fullBundleV2EnvelopeHash']);
    var operatorIdHash = firstHash(scopes, ['operatorIdHash']);
    var reviewIdHash = firstHash(scopes, ['reviewIdHash']);
    var approvedAtIso = cleanString(firstValue(scopes, ['approvedAtIso']));
    var payloadSchema = cleanString(firstValue(scopes, ['payloadSchema']));

    var isLocalMockSchema = LOCAL_MOCK_SCHEMAS.indexOf(schema) !== -1;
    var isLocalMockScope = LOCAL_MOCK_SCOPES.indexOf(scope) !== -1;
    var isLocalMockTarget = LOCAL_MOCK_TARGET_MODES.indexOf(targetMode) !== -1;
    var isRealTarget = REAL_TARGET_MODES.indexOf(targetMode) !== -1;
    var payloadHashesMatch = !!candidatePayloadHash && candidatePayloadHash === candidateBundleHash &&
      candidatePayloadHash === fullBundleV2EnvelopeHash;
    var rawRefs = [
      endpointRefHash, remoteRootRefHash, credentialRefHash, peerIdentityBindingHash, localClientIdentityHash,
      killSwitchEnableTokenHash, idempotencyKeyHash, conflictPolicyRefHash, sequenceExportConstraintRefHash,
      b7ReadinessPolicyRefHash, b8ApprovalRefHash, approvalRecordHash, candidatePayloadHash, candidateBundleHash,
      fullBundleV2EnvelopeHash, operatorIdHash, reviewIdHash
    ];
    var writeRequest = bool(firstValue(scopes, ['writeWebDAV'])) || bool(firstValue(scopes, ['writeCloud'])) ||
      bool(firstValue(scopes, ['writeRelay'])) || bool(firstValue(scopes, ['enqueueRelay'])) ||
      bool(firstValue(scopes, ['writeCAS'])) || bool(firstValue(scopes, ['writeFiles'])) ||
      bool(firstValue(scopes, ['mutateExportState'])) || bool(firstValue(scopes, ['mintExportId'])) ||
      bool(firstValue(scopes, ['burnSequence']));

    if (schema !== APPROVAL_SCHEMA) addUnique(blockers, 'real-transport-b8-approval-schema-mismatch');
    if (isLocalMockSchema || isLocalMockScope || isLocalMockTarget) {
      addUnique(blockers, 'real-transport-b8-local-mock-approval-not-accepted');
    }
    if (!isRealTarget) addUnique(blockers, 'real-transport-b8-real-target-mode-required');
    if (!bool(firstValue(scopes, ['approved']))) addUnique(blockers, 'real-transport-b8-approval-required');
    if (!bool(firstValue(scopes, ['reviewedRealTransportApplyApproved']))) {
      addUnique(blockers, 'real-transport-b8-reviewed-approval-required');
    }
    if (!bool(firstValue(scopes, ['realWebDAVCloudRelayApproved']))) {
      addUnique(blockers, 'real-transport-b8-real-webdav-cloud-relay-approval-required');
    }
    if (scope !== REQUIRED_SCOPE) addUnique(blockers, 'real-transport-b8-scope-invalid');
    if (!productSyncReadyProvidedFalse || firstValue(scopes, ['productSyncReady']) === true) {
      addUnique(blockers, 'real-transport-b8-product-sync-ready-must-remain-false');
    }
    if (!transportReadyProvidedFalse || firstValue(scopes, ['transportReady']) === true) {
      addUnique(blockers, 'real-transport-b8-transport-ready-must-remain-false');
    }
    if (!privacyHashOnly) addUnique(blockers, 'real-transport-b8-privacy-hash-only-required');
    if (!operatorIdHash || !reviewIdHash || !approvedAtIso) addUnique(blockers, 'real-transport-b8-review-metadata-missing');
    if (!(endpointRefHash && remoteRootRefHash && credentialRefHash && peerIdentityBindingHash && localClientIdentityHash)) {
      addUnique(blockers, 'real-transport-b8-b1-target-references-missing');
    }
    if (!killSwitchEnableTokenHash) addUnique(blockers, 'real-transport-b8-b2-kill-switch-ref-missing');
    if (!idempotencyKeyHash) addUnique(blockers, 'real-transport-b8-b3-idempotency-ref-missing');
    if (!conflictPolicyRefHash) addUnique(blockers, 'real-transport-b8-b5-conflict-policy-ref-missing');
    if (!sequenceExportConstraintRefHash) addUnique(blockers, 'real-transport-b8-b6-sequence-export-ref-missing');
    if (!b7ReadinessPolicyRefHash) addUnique(blockers, 'real-transport-b8-b7-readiness-policy-ref-missing');
    if (!(b8ApprovalRefHash || approvalRecordHash)) addUnique(blockers, 'real-transport-b8-approval-record-ref-missing');
    if (!payloadHashesMatch) addUnique(blockers, 'real-transport-b8-payload-hashes-missing-or-mismatch');
    if (payloadSchema !== 'h2o.studio.fullBundle.v2') addUnique(blockers, 'real-transport-b8-payload-schema-mismatch');
    if (rawInputPresent(scopes, rawRefs)) addUnique(blockers, 'real-transport-b8-raw-input-rejected');
    if (casInputPresent(scopes)) addUnique(blockers, 'real-transport-b8-cas-key-input-rejected');
    if (!exactFalse(scopes, ['rawEndpointLogged']) || !exactFalse(scopes, ['rawCredentialLogged']) ||
      !exactFalse(scopes, ['rawRemotePathLogged']) || !exactFalse(scopes, ['rawPayloadBodyLogged'])) {
      addUnique(blockers, 'real-transport-b8-raw-logging-flags-required-false');
    }
    if (!firstBool(scopes, ['noA950Mutation']) || !firstBool(scopes, ['noCleanupAuthority']) ||
      !firstBool(scopes, ['noFullBundleV3']) || !firstBool(scopes, ['chatSavingCasSeparate']) ||
      !firstBool(scopes, ['noChatSavingCAS'])) {
      addUnique(blockers, 'real-transport-b8-required-safety-flags-missing');
    }
    if (bool(firstValue(scopes, ['mutateA950'])) || bool(firstValue(scopes, ['cleanupAuthority'])) ||
      bool(firstValue(scopes, ['startFullBundleV3'])) || bool(firstValue(scopes, ['fullBundleV3Required'])) ||
      bool(firstValue(scopes, ['touchChatSavingCAS']))) {
      addUnique(blockers, 'real-transport-b8-forbidden-authority-requested');
    }
    if (writeRequest) addUnique(blockers, 'real-transport-b8-write-or-mutation-request-blocked');

    var accepted = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      approvalSchema: schema === APPROVAL_SCHEMA ? APPROVAL_SCHEMA : '',
      ok: accepted,
      status: accepted ? 'real-transport-b8-approval-accepted' : 'blocked-real-transport-b8-approval',
      reason: accepted ? 'real-transport-b8-approval-accepted' : blockers[0],
      realApprovalContractEvaluated: true,
      realTransportApprovalAccepted: accepted,
      approvalAcceptanceOnly: true,
      realTransportExecuted: false,
      realWebDAVTransportAvailable: false,
      transportReady: false,
      productSyncReady: false,
      targetMode: isRealTarget ? targetMode : '',
      scope: scope === REQUIRED_SCOPE ? REQUIRED_SCOPE : '',
      endpointRefHash: endpointRefHash,
      remoteRootRefHash: remoteRootRefHash,
      credentialRefHash: credentialRefHash,
      peerIdentityBindingHash: peerIdentityBindingHash,
      localClientIdentityHash: localClientIdentityHash,
      killSwitchEnableTokenHash: killSwitchEnableTokenHash,
      idempotencyKeyHash: idempotencyKeyHash,
      conflictPolicyRefHash: conflictPolicyRefHash,
      sequenceExportConstraintRefHash: sequenceExportConstraintRefHash,
      b7ReadinessPolicyRefHash: b7ReadinessPolicyRefHash,
      b8ApprovalRefHash: b8ApprovalRefHash || approvalRecordHash,
      approvalRecordHash: approvalRecordHash || b8ApprovalRefHash,
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      fullBundleV2EnvelopeHash: fullBundleV2EnvelopeHash,
      operatorIdHash: operatorIdHash,
      reviewIdHash: reviewIdHash,
      payloadSchema: payloadSchema === 'h2o.studio.fullBundle.v2' ? payloadSchema : '',
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
      rawPayloadBodyLogged: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b8-raw-input-rejected') !== -1
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
      blocker: 'B8',
      approvalSchema: APPROVAL_SCHEMA,
      substrate: 'real-transport-approval-acceptance-non-writing',
      evaluateOnly: true,
      approvalAcceptanceOnly: true,
      realWebDAVTransportAvailable: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true
    };
  }

  H2O.Studio.sync.realTransportApproval.evaluateRealTransportApproval = evaluateRealTransportApproval;
  H2O.Studio.sync.realTransportApproval.diagnose = diagnose;
  H2O.Studio.sync.realTransportApproval.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportApproval.APPROVAL_SCHEMA = APPROVAL_SCHEMA;
  H2O.Studio.sync.realTransportApproval.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportApproval.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportApproval.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
