/* H2O Studio Sync - Real-Transport B2 Controlled-Write Kill-Switch Lifecycle (implementation)
 *
 * Non-writing, hash-only evaluate/diagnose substrate for the real controlled-write
 * kill-switch lifecycle (explicit enable / explicit disable / mid-flight fail-closed +
 * explicit recovery). This module does NOT enable real transport, does NOT make real
 * WebDAV available, does NOT accept a real-transport approval, does NOT enable or disable
 * any real kill-switch state, does NOT flip productSyncReady or transportReady, does NOT
 * write WebDAV/cloud/relay/CAS/files, does NOT enqueue relay, does NOT start or mint a
 * fullBundle v3 payload, and does NOT clean or mutate a950. Every target/credential/peer/
 * approval/policy/token value is a redacted hash-only reference; no raw endpoint URL, raw
 * credential, or raw remote path is ever stored, logged, or echoed. It implements the B2
 * design (release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-design.md,
 * 09bf7701) as an evaluate/validate-only substrate, building on the B1 substrate (93eb9065).
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportKillSwitch = H2O.Studio.sync.realTransportKillSwitch || {};
  if (H2O.Studio.sync.realTransportKillSwitch.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b2-kill-switch.v1';
  var VERSION = '0.1.0-b2-kill-switch-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b2-kill-switch-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b2-kill-switch-result.v1';
  var KILL_SWITCH_SCOPE = 'real-webdav-cloud-relay-controlled-write';
  var LOCAL_MOCK_SCOPES = ['local-mock-webdav-target-only', 'dry-run-no-real-transport'];
  var LOCAL_MOCK_TARGET_MODES = ['local-mock-webdav', 'mock-peer'];
  var RAW_INPUT_KEYS = ['endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint',
    'credential', 'credentials', 'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'accessKey', 'access_key', 'rawCredential', 'remotePath', 'path', 'rawRemotePath'];

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
      safeObject(inp.endpointRef), safeObject(inp.remoteRootRef)];
    for (var s = 0; s < scopes.length; s += 1) {
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scopes[s], key) && cleanString(scopes[s][key]) !== '') return true;
      }
    }
    var refs = [inp.endpointRefHash, inp.remoteRootRefHash, inp.credentialRefHash, inp.peerIdentityBindingHash,
      inp.localClientIdentityHash, inp.killSwitchEnableTokenHash, inp.b8ApprovalRefHash, inp.b7ReadinessPolicyRefHash];
    for (var r = 0; r < refs.length; r += 1) { if (looksRaw(refs[r])) return true; }
    return false;
  }

  function evaluateRealTransportKillSwitch(request) {
    var inp = safeObject(request);
    var target = safeObject(inp.target);
    var blockers = [];
    var warnings = [];
    var operation = cleanString(inp.operation) || 'enable';

    var scope = cleanString(inp.killSwitchScope || inp.scope);
    var endpointRefHash = hashLike(inp.endpointRefHash);
    var remoteRootRefHash = hashLike(inp.remoteRootRefHash);
    var credentialRefHash = hashLike(inp.credentialRefHash);
    var peerIdentityBindingHash = hashLike(inp.peerIdentityBindingHash);
    var localClientIdentityHash = hashLike(inp.localClientIdentityHash);
    var killSwitchEnableTokenHash = hashLike(inp.killSwitchEnableTokenHash);
    var b8ApprovalRefHash = hashLike(inp.b8ApprovalRefHash);
    var b7ReadinessPolicyRefHash = hashLike(inp.b7ReadinessPolicyRefHash);
    var expectedPeerIdentityBindingHash = hashLike(inp.expectedPeerIdentityBindingHash);
    var expectedRemoteRootRefHash = hashLike(inp.expectedRemoteRootRefHash);
    var expectedKillSwitchEnableTokenHash = hashLike(inp.expectedKillSwitchEnableTokenHash);

    var killSwitchExists = !(inp.killSwitchExists === false || bool(inp.modelMissingKillSwitch) ||
      cleanString(inp.killSwitchState) === 'missing');
    var killSwitchEnabled = killSwitchExists && (bool(inp.killSwitchEnabled) || cleanString(inp.killSwitchState) === 'enabled');
    var enableTokenStale = bool(inp.enableTokenStale) ||
      (!!expectedKillSwitchEnableTokenHash && !!killSwitchEnableTokenHash &&
        expectedKillSwitchEnableTokenHash !== killSwitchEnableTokenHash);
    var isLocalMock = LOCAL_MOCK_TARGET_MODES.indexOf(cleanString(inp.targetMode || target.mode)) !== -1 ||
      LOCAL_MOCK_SCOPES.indexOf(scope) !== -1 || bool(inp.localMockApproval) || bool(inp.localMockKillSwitch);
    var b1HashesPresent = !!(endpointRefHash && remoteRootRefHash && credentialRefHash && peerIdentityBindingHash);

    var failClosed = false;
    var explicitRecoveryRequired = false;
    var midFlightRecoveryState = '';

    // ---- common validations (all operations) ----
    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b2-kill-switch-raw-input-rejected');
    if (isLocalMock) addUnique(blockers, 'real-transport-b2-kill-switch-local-mock-not-accepted');
    if (!killSwitchExists) addUnique(blockers, 'real-transport-b2-kill-switch-missing');
    if (inp.productSyncReady === true || inp.transportReady === true) {
      addUnique(blockers, 'real-transport-b2-kill-switch-readiness-mismatch-hidden');
    }

    if (operation === 'enable') {
      if (inp.reviewedKillSwitchEnableApproved !== true) addUnique(blockers, 'real-transport-b2-kill-switch-enable-review-missing');
      if (scope !== KILL_SWITCH_SCOPE) addUnique(blockers, 'real-transport-b2-kill-switch-scope-invalid');
      if (!b1HashesPresent) addUnique(blockers, 'real-transport-b2-kill-switch-target-hashes-missing');
      if (!b8ApprovalRefHash) addUnique(blockers, 'real-transport-b2-kill-switch-approval-missing');
      if (!b7ReadinessPolicyRefHash) addUnique(blockers, 'real-transport-b2-kill-switch-policy-missing');
      if (!killSwitchEnableTokenHash) addUnique(blockers, 'real-transport-b2-kill-switch-enable-token-missing');
      if (enableTokenStale) addUnique(blockers, 'real-transport-b2-kill-switch-enable-token-stale');
      if ((expectedPeerIdentityBindingHash && peerIdentityBindingHash && expectedPeerIdentityBindingHash !== peerIdentityBindingHash) ||
        (expectedRemoteRootRefHash && remoteRootRefHash && expectedRemoteRootRefHash !== remoteRootRefHash)) {
        addUnique(blockers, 'real-transport-b2-kill-switch-target-mismatch');
      }
    } else if (operation === 'apply') {
      // a hypothetical write op requires the kill switch enabled; disabled blocks (never writes anyway).
      if (!killSwitchEnabled) addUnique(blockers, 'real-transport-b2-kill-switch-disabled');
    } else if (operation === 'disable') {
      // disable is fail-safe: it closes the switch. failClosed is the modeled outcome.
      failClosed = true;
      if (bool(inp.disableBeforeWrite)) addUnique(blockers, 'real-transport-b2-kill-switch-disabled-before-write');
      if (bool(inp.disableAfterPreflight)) addUnique(blockers, 'real-transport-b2-kill-switch-disabled-after-preflight');
    } else if (operation === 'mid-flight') {
      if (bool(inp.midFlightDisabledAfterRemoteWriteBeforeLedger)) {
        explicitRecoveryRequired = true;
        midFlightRecoveryState = 'explicit-recovery-required';
        addUnique(blockers, 'real-transport-b2-kill-switch-mid-flight-disabled');
      } else if (bool(inp.midFlightDisabledBeforeRemoteWrite)) {
        failClosed = true;
        midFlightRecoveryState = 'fail-closed';
      }
    }

    var ready = blockers.length === 0;
    var status;
    if (!ready) {
      status = 'blocked-real-transport-b2-kill-switch';
    } else if (operation === 'enable') {
      status = 'real-transport-b2-kill-switch-lifecycle-ready';
    } else if (operation === 'disable') {
      status = 'real-transport-b2-kill-switch-disabled-fail-closed';
    } else if (operation === 'mid-flight') {
      status = failClosed ? 'real-transport-b2-kill-switch-mid-flight-fail-closed'
        : 'real-transport-b2-kill-switch-mid-flight-evaluated';
    } else {
      status = 'real-transport-b2-kill-switch-evaluated';
    }

    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: status,
      reason: ready ? status : blockers[0],
      operation: operation,
      // "ready" only ever means the enable request is well-formed - never transport enablement.
      realKillSwitchLifecycleReady: ready && operation === 'enable',
      killSwitchScope: scope === KILL_SWITCH_SCOPE ? KILL_SWITCH_SCOPE : '',
      killSwitchExists: killSwitchExists,
      killSwitchEnabled: killSwitchEnabled,
      failClosed: failClosed,
      explicitRecoveryRequired: explicitRecoveryRequired,
      killSwitchMidFlightRecoveryState: midFlightRecoveryState,
      noSilentRetry: true,
      noAutoResumeIntoWrite: true,
      // recorded hash-only references only (never raw)
      endpointRefHash: endpointRefHash,
      remoteRootRefHash: remoteRootRefHash,
      credentialRefHash: credentialRefHash,
      peerIdentityBindingHash: peerIdentityBindingHash,
      localClientIdentityHash: localClientIdentityHash,
      killSwitchEnableTokenHash: killSwitchEnableTokenHash,
      b8ApprovalRefHash: b8ApprovalRefHash,
      b7ReadinessPolicyRefHash: b7ReadinessPolicyRefHash,
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
      noCleanupAuthority: true,
      noA950Mutation: true,
      rawEndpointLogged: false,
      rawCredentialLogged: false,
      rawRemotePathLogged: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b2-kill-switch-raw-input-rejected') !== -1
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
      blocker: 'B2',
      substrate: 'real-transport-kill-switch-lifecycle-non-writing',
      evaluateOnly: true,
      killSwitchScope: KILL_SWITCH_SCOPE,
      realWebDAVTransportAvailable: false,
      realTransportApprovalAccepted: false,
      transportReady: false,
      productSyncReady: false,
      chatSavingCasBlocked: true,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      credentialReferenceOnly: true,
      noSilentRetry: true,
      noAutoResumeIntoWrite: true
    };
  }

  H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch = evaluateRealTransportKillSwitch;
  H2O.Studio.sync.realTransportKillSwitch.diagnose = diagnose;
  H2O.Studio.sync.realTransportKillSwitch.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportKillSwitch.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportKillSwitch.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportKillSwitch.KILL_SWITCH_SCOPE = KILL_SWITCH_SCOPE;
  H2O.Studio.sync.realTransportKillSwitch.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
