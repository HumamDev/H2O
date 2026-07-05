/* H2O Studio Sync - Real-Transport B3 Durable Idempotency Store (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate that MODELS the real-transport
 * durable idempotency record lifecycle. It does NOT create the durable store, does NOT
 * write KV / SQLite / localStorage / filesystem, does NOT enable real transport, does NOT
 * make real WebDAV available, does NOT accept a real-transport approval, does NOT flip
 * productSyncReady or transportReady, does NOT write WebDAV/cloud/relay/CAS/files, does NOT
 * enqueue relay, does NOT start or mint a fullBundle v3 payload, and does NOT clean or
 * mutate a950. Every payload/target/credential/approval/policy/sequence/token value is a
 * redacted hash-only reference; no raw endpoint URL, raw credential, raw remote path, or
 * raw payload body is ever stored, logged, or echoed. It implements the B3 design
 * (release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-design.md,
 * e1618571) as an evaluate/validate-only substrate, building on B1 (93eb9065) and B2 (de4aa12d).
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportIdempotency = H2O.Studio.sync.realTransportIdempotency || {};
  if (H2O.Studio.sync.realTransportIdempotency.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b3-idempotency.v1';
  var VERSION = '0.1.0-b3-idempotency-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b3-idempotency-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b3-idempotency-result.v1';
  // Proposed Desktop-authority durable store namespace - referenced only, NOT created here.
  var STORE_NAMESPACE = 'h2o:sync:real-transport-idempotency:v1';
  var RECORD_SCHEMA = 'h2o.desktop.sync.real-transport-idempotency-record.v1';
  var LIFECYCLE_STATES = ['preflight-observed', 'apply-intent-recorded', 'remote-write-pending',
    'remote-write-observed', 'ledger-pending', 'completed', 'failed', 'explicit-recovery-required',
    'duplicate-replay-noop'];
  var HASH_KEY_FIELDS = ['idempotencyKeyHash', 'candidatePayloadHash', 'candidateBundleHash', 'endpointRefHash',
    'remoteRootRefHash', 'peerIdentityBindingHash', 'credentialRefHash', 'killSwitchEnableTokenHash',
    'b8ApprovalRefHash', 'b7ReadinessPolicyRefHash', 'sequenceExportConstraintRefHash'];
  var RAW_INPUT_KEYS = ['endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint', 'credential', 'credentials',
    'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key', 'accessKey', 'access_key', 'rawCredential',
    'remotePath', 'path', 'rawRemotePath', 'payloadBody', 'bundleBody', 'rawPayloadBody', 'rawBundleBody'];
  var CAS_INPUT_KEYS = ['casKey', 'casKeyHash', 'chatSavingCasKey', 'touchChatSavingCAS', 'writeCAS', 'casKeys'];

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
    var scopes = [inp, safeObject(inp.target), safeObject(inp.credential), safeObject(inp.credentialRef),
      safeObject(inp.candidate), safeObject(inp.payload)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    for (var f = 0; f < HASH_KEY_FIELDS.length; f += 1) { if (looksRaw(inp[HASH_KEY_FIELDS[f]])) return true; }
    return false;
  }

  function casInputPresent(inp) {
    var scopes = [inp, safeObject(inp.transport), safeObject(inp.safety)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < CAS_INPUT_KEYS.length; k += 1) {
        var key = CAS_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '' &&
          scopes[s][key] !== false) return true;
      }
    }
    return false;
  }

  function evaluateRealTransportIdempotency(request) {
    var inp = safeObject(request);
    var attempt = safeObject(inp.attempt);
    var record = safeObject(inp.existingRecord);
    var restart = safeObject(inp.restart);
    var blockers = [];
    var warnings = [];

    var phase = cleanString(attempt.phase || inp.phase) || 'preflight';
    var idempotencyKeyHash = hashLike(inp.idempotencyKeyHash);
    var candidatePayloadHash = hashLike(inp.candidatePayloadHash);
    var candidateBundleHash = hashLike(inp.candidateBundleHash);
    var operationKind = cleanString(inp.operationKind);
    var activeTransport = cleanString(inp.activeTransport);

    var keyMaterialComplete = true;
    for (var f = 0; f < HASH_KEY_FIELDS.length; f += 1) {
      if (!hashLike(inp[HASH_KEY_FIELDS[f]])) { keyMaterialComplete = false; break; }
    }
    if (!operationKind || !activeTransport) keyMaterialComplete = false;

    var recordPresent = bool(record.present);
    var recordState = cleanString(record.state);
    var recordKey = hashLike(record.idempotencyKeyHash);
    var recordPayload = hashLike(record.candidatePayloadHash);
    var sameKey = recordPresent && !!idempotencyKeyHash && recordKey === idempotencyKeyHash;
    var changedKey = recordPresent && !!recordKey && !!idempotencyKeyHash && recordKey !== idempotencyKeyHash;

    // ---- common input rejections ----
    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b3-raw-input-rejected');
    if (casInputPresent(inp)) addUnique(blockers, 'real-transport-b3-cas-input-rejected');
    if (!keyMaterialComplete) addUnique(blockers, 'real-transport-b3-key-material-missing');
    if (bool(record.corrupted)) addUnique(blockers, 'real-transport-b3-idempotency-record-corrupted');
    if (recordState && LIFECYCLE_STATES.indexOf(recordState) === -1) {
      addUnique(blockers, 'real-transport-b3-idempotency-record-corrupted');
    }

    // ---- explicit expectation mismatches ----
    var expEndpoint = hashLike(inp.expectedEndpointRefHash);
    var expRoot = hashLike(inp.expectedRemoteRootRefHash);
    var expPeer = hashLike(inp.expectedPeerIdentityBindingHash);
    var expPayload = hashLike(inp.expectedCandidatePayloadHash);
    var expApproval = hashLike(inp.expectedB8ApprovalRefHash);
    var expToken = hashLike(inp.expectedKillSwitchEnableTokenHash);
    var expSeq = hashLike(inp.expectedSequenceExportConstraintRefHash);
    if ((expEndpoint && expEndpoint !== hashLike(inp.endpointRefHash)) ||
      (expRoot && expRoot !== hashLike(inp.remoteRootRefHash)) ||
      (expPeer && expPeer !== hashLike(inp.peerIdentityBindingHash))) {
      addUnique(blockers, 'real-transport-b3-target-hash-mismatch');
    }
    if ((expPayload && expPayload !== candidatePayloadHash) ||
      (candidatePayloadHash && candidateBundleHash && candidatePayloadHash !== candidateBundleHash)) {
      addUnique(blockers, 'real-transport-b3-payload-hash-mismatch');
    }
    if (expApproval && expApproval !== hashLike(inp.b8ApprovalRefHash)) {
      addUnique(blockers, 'real-transport-b3-approval-hash-mismatch');
    }
    if (bool(inp.killSwitchTokenStale)) addUnique(blockers, 'real-transport-b3-kill-switch-token-stale');
    if (expToken && expToken !== hashLike(inp.killSwitchEnableTokenHash)) {
      addUnique(blockers, 'real-transport-b3-kill-switch-token-mismatch');
    }
    if (expSeq && expSeq !== hashLike(inp.sequenceExportConstraintRefHash)) {
      addUnique(blockers, 'real-transport-b3-sequence-constraint-mismatch');
    }
    // same key claimed but bound payload material differs -> duplicate with changed payload/target
    if (sameKey && recordPayload && candidatePayloadHash && recordPayload !== candidatePayloadHash) {
      addUnique(blockers, 'real-transport-b3-duplicate-changed-payload-target');
    }

    // ---- verdict / lifecycle resolution ----
    var isRestartResume = phase === 'restart-resume' || bool(restart.simulateRestart) || bool(restart.simulateReload);
    var controlledGatePresent = restart.controlledGatePresent !== false && inp.controlledGatePresent !== false;
    var killSwitchEnabled = !(restart.killSwitchEnabled === false || inp.killSwitchEnabled === false);
    var duplicateReplayNoop = false;
    var zeroWrite = false;
    var changedConstraintsAreNotDuplicate = false;
    var recoveryRequired = false;
    var resolvedState = 'preflight-observed';

    if (isRestartResume) {
      if (!controlledGatePresent) addUnique(blockers, 'real-transport-b3-resume-missing-controlled-gate');
      if (!killSwitchEnabled) addUnique(blockers, 'real-transport-b3-resume-kill-switch-disabled');
      if (sameKey && recordState === 'completed') {
        duplicateReplayNoop = true; zeroWrite = true; resolvedState = 'duplicate-replay-noop';
      } else if (sameKey && (recordState === 'remote-write-pending' || recordState === 'apply-intent-recorded' ||
        recordState === 'ledger-pending')) {
        recoveryRequired = true; resolvedState = 'explicit-recovery-required';
      } else {
        resolvedState = 'preflight-observed';
      }
    } else if (sameKey && recordState === 'completed') {
      duplicateReplayNoop = true; zeroWrite = true; resolvedState = 'duplicate-replay-noop';
    } else if (changedKey) {
      // a changed payload/target/sequence yields a different key -> NOT a duplicate; a new operation.
      changedConstraintsAreNotDuplicate = true; resolvedState = 'preflight-observed';
    } else if (sameKey && recordState === 'remote-write-pending') {
      recoveryRequired = true; resolvedState = 'explicit-recovery-required';
    } else if (phase === 'apply-intent') {
      resolvedState = 'apply-intent-recorded';
    } else {
      resolvedState = 'preflight-observed';
    }

    var ready = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: ready ? ('real-transport-b3-idempotency-' + resolvedState) : 'blocked-real-transport-b3-idempotency',
      reason: ready ? resolvedState : blockers[0],
      // validation readiness ONLY - never transport enablement, never store creation.
      idempotencyRecordReady: ready,
      storeNamespace: STORE_NAMESPACE,
      recordSchema: RECORD_SCHEMA,
      durableStoreCreated: false,
      lifecycleStates: LIFECYCLE_STATES.slice(),
      resolvedState: resolvedState,
      duplicateReplayNoop: duplicateReplayNoop,
      zeroWrite: zeroWrite,
      changedConstraintsAreNotDuplicate: changedConstraintsAreNotDuplicate,
      explicitRecoveryRequired: recoveryRequired,
      autoWriteOnResume: false,
      // recorded hash-only references only (never raw)
      idempotencyKeyHash: idempotencyKeyHash,
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      endpointRefHash: hashLike(inp.endpointRefHash),
      remoteRootRefHash: hashLike(inp.remoteRootRefHash),
      peerIdentityBindingHash: hashLike(inp.peerIdentityBindingHash),
      credentialRefHash: hashLike(inp.credentialRefHash),
      killSwitchEnableTokenHash: hashLike(inp.killSwitchEnableTokenHash),
      b8ApprovalRefHash: hashLike(inp.b8ApprovalRefHash),
      b7ReadinessPolicyRefHash: hashLike(inp.b7ReadinessPolicyRefHash),
      sequenceExportConstraintRefHash: hashLike(inp.sequenceExportConstraintRefHash),
      operationKind: operationKind,
      activeTransport: activeTransport,
      credentialReferenceOnly: true,
      // non-activation invariants: hardcoded, never request-controllable
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
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
      writesKv: false,
      writesSqlite: false,
      writesLocalStorage: false,
      noCleanupAuthority: true,
      noA950Mutation: true,
      rawEndpointLogged: false,
      rawCredentialLogged: false,
      rawRemotePathLogged: false,
      rawPayloadBodyStored: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b3-raw-input-rejected') !== -1,
        casInputRejected: blockers.indexOf('real-transport-b3-cas-input-rejected') !== -1
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
      blocker: 'B3',
      substrate: 'real-transport-idempotency-non-writing',
      evaluateOnly: true,
      storeNamespace: STORE_NAMESPACE,
      durableStoreCreated: false,
      lifecycleStates: LIFECYCLE_STATES.slice(),
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      credentialReferenceOnly: true,
      autoWriteOnResume: false
    };
  }

  H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency = evaluateRealTransportIdempotency;
  H2O.Studio.sync.realTransportIdempotency.diagnose = diagnose;
  H2O.Studio.sync.realTransportIdempotency.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportIdempotency.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportIdempotency.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportIdempotency.STORE_NAMESPACE = STORE_NAMESPACE;
  H2O.Studio.sync.realTransportIdempotency.LIFECYCLE_STATES = LIFECYCLE_STATES.slice();
  H2O.Studio.sync.realTransportIdempotency.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
