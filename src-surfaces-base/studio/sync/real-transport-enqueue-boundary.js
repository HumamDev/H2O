/* H2O Studio Sync - Real-Transport B4 Enqueue / Outbox / Publication-Ledger Boundary (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate that MODELS the real-transport enqueue /
 * outbox / publication-ledger boundary. It does NOT create or write any outbox row, does NOT
 * touch the relay outbox or publication ledger, does NOT write KV / SQLite / localStorage /
 * filesystem, does NOT enable real transport, does NOT make real WebDAV available, does NOT
 * accept a real-transport approval, does NOT flip productSyncReady or transportReady, does NOT
 * write WebDAV/cloud/relay/CAS/files, does NOT enqueue relay, does NOT start or mint a fullBundle
 * v3 payload, and does NOT clean or mutate a950. Every payload/target/credential/approval/token/
 * sequence value is a redacted hash-only reference; no raw endpoint URL, raw credential, raw
 * remote path, or raw payload body is ever stored, logged, or echoed. It implements the B4 design
 * (release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-design.md, 0b6ed75e) as an
 * evaluate/validate-only substrate, building on B1 (93eb9065), B2 (de4aa12d), and B3 (804b6d67).
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportEnqueueBoundary = H2O.Studio.sync.realTransportEnqueueBoundary || {};
  if (H2O.Studio.sync.realTransportEnqueueBoundary.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b4-enqueue-boundary.v1';
  var VERSION = '0.1.0-b4-enqueue-boundary-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b4-enqueue-boundary-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b4-enqueue-boundary-result.v1';
  // Existing durable stores - referenced by name only, NEVER written here.
  var RELAY_OUTBOX_STORE = 'h2o:sync:relay-outbox:v1';
  var PUBLICATION_LEDGER_STORE = 'h2o:sync:publication-ledger:v1';
  var OUTBOX_LIFECYCLE_STATES = ['queued', 'dispatching', 'remote-write-observed', 'ledger-pending',
    'completed', 'failed', 'explicit-recovery-required'];
  var B1_TARGET_HASH_FIELDS = ['endpointRefHash', 'remoteRootRefHash', 'peerIdentityBindingHash', 'credentialRefHash'];
  var HASH_REF_FIELDS = ['candidatePayloadHash', 'candidateBundleHash', 'endpointRefHash', 'remoteRootRefHash',
    'peerIdentityBindingHash', 'credentialRefHash', 'idempotencyKeyHash', 'b8ApprovalRefHash',
    'killSwitchEnableTokenHash', 'sequenceExportConstraintRefHash'];
  var RAW_INPUT_KEYS = ['endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint', 'credential', 'credentials',
    'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key', 'accessKey', 'access_key', 'rawCredential',
    'remotePath', 'path', 'rawRemotePath', 'payloadBody', 'bundleBody', 'rawPayloadBody', 'rawBundleBody'];
  var CAS_KEY_INPUT = ['casKey', 'casKeyHash', 'chatSavingCasKey', 'casKeys'];

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
    var scopes = [inp, safeObject(inp.target), safeObject(inp.credential), safeObject(inp.candidate), safeObject(inp.payload)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    for (var f = 0; f < HASH_REF_FIELDS.length; f += 1) { if (looksRaw(inp[HASH_REF_FIELDS[f]])) return true; }
    return false;
  }

  function casKeyPresent(inp) {
    var scopes = [inp, safeObject(inp.transport), safeObject(inp.safety)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < CAS_KEY_INPUT.length; k += 1) {
        var key = CAS_KEY_INPUT[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    return false;
  }

  function evaluateRealTransportEnqueueBoundary(request) {
    var inp = safeObject(request);
    var target = safeObject(inp.target);
    var killSwitch = safeObject(inp.killSwitch);
    var record = safeObject(inp.idempotencyRecord);
    var restart = safeObject(inp.restart);
    var blockers = [];
    var warnings = [];
    var operation = cleanString(inp.operation) || 'enqueue';

    var targetMode = cleanString(inp.targetMode || target.mode);
    var isLocalMockTarget = targetMode === 'local-mock-webdav' || targetMode === 'mock-peer' || bool(target.localMockTarget);
    var b1HashesPresent = true;
    for (var i = 0; i < B1_TARGET_HASH_FIELDS.length; i += 1) {
      if (!hashLike(inp[B1_TARGET_HASH_FIELDS[i]])) { b1HashesPresent = false; break; }
    }
    var idempotencyKeyHash = hashLike(inp.idempotencyKeyHash);
    var candidatePayloadHash = hashLike(inp.candidatePayloadHash);
    var b8ApprovalRefHash = hashLike(inp.b8ApprovalRefHash);
    var killSwitchEnableTokenHash = hashLike(inp.killSwitchEnableTokenHash);
    var sequenceExportConstraintRefHash = hashLike(inp.sequenceExportConstraintRefHash);

    var b8ApprovalAccepted = bool(inp.b8ApprovalAccepted) && !!b8ApprovalRefHash;
    var killSwitchEnabled = !(killSwitch.enabled === false || inp.killSwitchEnabled === false);
    var killSwitchTokenStale = bool(inp.killSwitchTokenStale) || bool(killSwitch.tokenStale);
    var b7PolicyAllows = inp.b7PolicyAllowsEvaluation !== false;
    var b5Available = inp.b5PolicyAvailable !== false;
    var b6Available = inp.b6PolicyAvailable !== false;
    var localExportableAuthorizationClaimed = bool(inp.localExportableSyncReadyIsAuthorization);
    var peerAmbiguous = bool(inp.peerAmbiguous) || bool(target.ambiguous) || bool(inp.ambiguous);
    var casBoundaryViolation = bool(inp.touchChatSavingCas) || bool(inp.writeCAS) ||
      bool(safeObject(inp.transport).touchChatSavingCas) || bool(safeObject(inp.transport).writeCAS);

    var recordPresent = bool(record.present);
    var recordState = cleanString(record.state);
    var recordKey = hashLike(record.idempotencyKeyHash);
    var sameKey = recordPresent && !!recordKey && !!idempotencyKeyHash && recordKey === idempotencyKeyHash;

    var expSeq = hashLike(inp.expectedSequenceExportConstraintRefHash);

    var duplicateReplayNoop = false;
    var zeroWrite = false;
    var explicitRecoveryRequired = false;
    var resolvedState = 'queued';

    // ---- common input rejections ----
    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b4-raw-input-rejected');
    if (casKeyPresent(inp)) addUnique(blockers, 'real-transport-b4-cas-input-rejected');
    if (casBoundaryViolation) addUnique(blockers, 'real-transport-b4-enqueue-cas-boundary-violation');

    if (operation === 'ledger') {
      // ledger write is allowed ONLY after a verified remote write.
      var remoteWriteVerified = bool(inp.remoteWriteVerified) || recordState === 'remote-write-observed';
      if (!remoteWriteVerified) addUnique(blockers, 'real-transport-b4-ledger-precedes-remote-write');
      if (!idempotencyKeyHash || !candidatePayloadHash) addUnique(blockers, 'real-transport-b4-enqueue-target-hashes-missing');
      resolvedState = 'ledger-pending';
    } else if (operation === 'restart-resume') {
      if (restart.controlledGatePresent === false || inp.controlledGatePresent === false) {
        addUnique(blockers, 'real-transport-b4-resume-missing-controlled-gate');
      }
      if (restart.killSwitchEnabled === false || !killSwitchEnabled) {
        addUnique(blockers, 'real-transport-b4-resume-kill-switch-disabled');
      }
      if (sameKey && recordState === 'completed') {
        duplicateReplayNoop = true; zeroWrite = true; resolvedState = 'completed';
      } else if (sameKey && (recordState === 'remote-write-pending' || recordState === 'dispatching' ||
        recordState === 'apply-intent-recorded' || recordState === 'ledger-pending')) {
        explicitRecoveryRequired = true; resolvedState = 'explicit-recovery-required';
      } else {
        resolvedState = 'queued';
      }
    } else {
      // operation === 'enqueue' (default): may an outbox row be queued?
      if (localExportableAuthorizationClaimed) addUnique(blockers, 'real-transport-b4-enqueue-local-exportable-not-authorization');
      if (bool(inp.localMockApproval)) addUnique(blockers, 'real-transport-b4-enqueue-local-mock-approval-not-accepted');
      if (isLocalMockTarget) addUnique(blockers, 'real-transport-b4-enqueue-local-mock-target-not-real');
      if (!recordPresent) addUnique(blockers, 'real-transport-b4-enqueue-idempotency-record-missing');
      if (recordPresent && recordState === 'completed') {
        addUnique(blockers, 'real-transport-b4-enqueue-completed-record-not-enqueueable');
        duplicateReplayNoop = true; zeroWrite = true;
      }
      if (killSwitchTokenStale) addUnique(blockers, 'real-transport-b4-enqueue-kill-switch-token-stale');
      if (!killSwitchEnabled) addUnique(blockers, 'real-transport-b4-enqueue-kill-switch-disabled');
      if (!b8ApprovalAccepted) addUnique(blockers, 'real-transport-b4-enqueue-approval-missing');
      if (!b1HashesPresent) addUnique(blockers, 'real-transport-b4-enqueue-target-hashes-missing');
      if (expSeq && expSeq !== sequenceExportConstraintRefHash) addUnique(blockers, 'real-transport-b4-enqueue-sequence-constraint-mismatch');
      if (peerAmbiguous) addUnique(blockers, 'real-transport-b4-enqueue-peer-ambiguous');
      if (!b7PolicyAllows) addUnique(blockers, 'real-transport-b4-enqueue-b7-policy-not-evaluable');
      if (!b5Available || !b6Available) addUnique(blockers, 'real-transport-b4-enqueue-b5-b6-policy-not-available');
      resolvedState = 'queued';
    }

    var ready = blockers.length === 0;
    var realEnqueueAuthorized = ready && operation === 'enqueue';

    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: ready ? ('real-transport-b4-enqueue-' + resolvedState) : 'blocked-real-transport-b4-enqueue',
      reason: ready ? resolvedState : blockers[0],
      operation: operation,
      // boundary-model readiness ONLY - never an actual enqueue/write and never an outbox row.
      realEnqueueAuthorized: realEnqueueAuthorized,
      relayOutboxStore: RELAY_OUTBOX_STORE,
      publicationLedgerStore: PUBLICATION_LEDGER_STORE,
      realOutboxRowCreated: false,
      relayOutboxTouched: false,
      publicationLedgerTouched: false,
      outboxLifecycleStates: OUTBOX_LIFECYCLE_STATES.slice(),
      resolvedState: resolvedState,
      duplicateReplayNoop: duplicateReplayNoop,
      zeroWrite: zeroWrite,
      explicitRecoveryRequired: explicitRecoveryRequired,
      ledgerNeverPrecedesRemoteWrite: true,
      ledgerReferencesIdempotencyKeyAndPayload: true,
      ledgerHashOnly: true,
      bootResumeDispatch: false,
      noBlindRetryAfterPartialWrite: true,
      autoRetryOnMismatch: false,
      // recorded hash-only references only (never raw)
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: hashLike(inp.candidateBundleHash),
      endpointRefHash: hashLike(inp.endpointRefHash),
      remoteRootRefHash: hashLike(inp.remoteRootRefHash),
      peerIdentityBindingHash: hashLike(inp.peerIdentityBindingHash),
      credentialRefHash: hashLike(inp.credentialRefHash),
      idempotencyKeyHash: idempotencyKeyHash,
      b8ApprovalRefHash: b8ApprovalRefHash,
      killSwitchEnableTokenHash: killSwitchEnableTokenHash,
      sequenceExportConstraintRefHash: sequenceExportConstraintRefHash,
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
        rawInputRejected: blockers.indexOf('real-transport-b4-raw-input-rejected') !== -1,
        casInputRejected: blockers.indexOf('real-transport-b4-cas-input-rejected') !== -1
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
      blocker: 'B4',
      substrate: 'real-transport-enqueue-boundary-non-writing',
      evaluateOnly: true,
      relayOutboxStore: RELAY_OUTBOX_STORE,
      publicationLedgerStore: PUBLICATION_LEDGER_STORE,
      realOutboxRowCreated: false,
      relayOutboxTouched: false,
      publicationLedgerTouched: false,
      outboxLifecycleStates: OUTBOX_LIFECYCLE_STATES.slice(),
      ledgerNeverPrecedesRemoteWrite: true,
      bootResumeDispatch: false,
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      credentialReferenceOnly: true
    };
  }

  H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary = evaluateRealTransportEnqueueBoundary;
  H2O.Studio.sync.realTransportEnqueueBoundary.diagnose = diagnose;
  H2O.Studio.sync.realTransportEnqueueBoundary.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportEnqueueBoundary.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportEnqueueBoundary.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportEnqueueBoundary.RELAY_OUTBOX_STORE = RELAY_OUTBOX_STORE;
  H2O.Studio.sync.realTransportEnqueueBoundary.PUBLICATION_LEDGER_STORE = PUBLICATION_LEDGER_STORE;
  H2O.Studio.sync.realTransportEnqueueBoundary.OUTBOX_LIFECYCLE_STATES = OUTBOX_LIFECYCLE_STATES.slice();
  H2O.Studio.sync.realTransportEnqueueBoundary.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
