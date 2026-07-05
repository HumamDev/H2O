/* H2O Studio Sync - Real-Transport B1 Target Config / Credentials / Peer Identity (implementation)
 *
 * Non-writing, hash-only read/validate substrate for real WebDAV/cloud/relay target
 * configuration references. This module does NOT enable real transport, does NOT make
 * real WebDAV available, does NOT accept a real-transport approval, does NOT flip
 * productSyncReady or transportReady, does NOT write WebDAV/cloud/relay/CAS/files, does
 * NOT enqueue relay, does NOT start or mint a fullBundle v3 payload, and does NOT clean or mutate a950.
 * Every target/credential/peer value is a redacted hash-only reference; no raw endpoint
 * URL, raw credential, or raw remote path is ever stored, logged, or echoed. It implements
 * the B1 design (release-evidence/2026-07-01/real-transport-b1-target-config-credentials-
 * peer-identity-design.md, b2e10531) as an evaluate/validate-only substrate.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportTargetConfig = H2O.Studio.sync.realTransportTargetConfig || {};
  if (H2O.Studio.sync.realTransportTargetConfig.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-b1-target-config.v1';
  var VERSION = '0.1.0-b1-target-config-non-writing';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-b1-target-config-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-b1-target-config-result.v1';
  var REAL_TARGET_MODES = ['real-webdav', 'cloud', 'relay'];
  var LOCAL_MOCK_TARGET_MODES = ['local-mock-webdav', 'mock-peer'];
  // raw-bearing keys that must never be supplied to this hash-only substrate
  var RAW_INPUT_KEYS = ['endpoint', 'endpointUrl', 'url', 'href', 'rawEndpoint',
    'credential', 'credentials', 'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
    'accessKey', 'access_key', 'rawCredential', 'remotePath', 'path', 'rawRemotePath'];

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

  // Accepts only a redacted sha256 reference; anything else is not a valid hash ref.
  function hashLike(value) {
    var text = cleanString(value);
    if (/^sha256:[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(text)) return 'sha256:' + text.toLowerCase();
    return '';
  }

  // Heuristic: does a string look like a raw endpoint URL / remote path (never a hash ref)?
  function looksRaw(value) {
    var text = cleanString(value);
    if (!text) return false;
    if (hashLike(text)) return false;
    return /:\/\//.test(text) || /^[a-z]+:\/\//i.test(text) || /^\//.test(text) ||
      /^[a-z0-9.-]+@[a-z0-9.-]+/i.test(text) || /\\/.test(text);
  }

  function rawInputPresent(inp) {
    var scopes = [inp, safeObject(inp.target), safeObject(inp.credential), safeObject(inp.credentialRef),
      safeObject(inp.endpointRef), safeObject(inp.remoteRootRef)];
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = scopes[s];
      for (var k = 0; k < RAW_INPUT_KEYS.length; k += 1) {
        var key = RAW_INPUT_KEYS[k];
        if (Object.prototype.hasOwnProperty.call(scope, key) && cleanString(scope[key]) !== '') return true;
      }
    }
    // a supplied "ref" whose value looks like a raw url/path is raw input, not a hash ref
    var refCandidates = [inp.endpointRefHash, inp.remoteRootRefHash, inp.credentialRefHash,
      inp.peerIdentityBindingHash, inp.localClientIdentityHash];
    for (var r = 0; r < refCandidates.length; r += 1) {
      if (looksRaw(refCandidates[r])) return true;
    }
    return false;
  }

  function firstHash(inp, names) {
    for (var i = 0; i < names.length; i += 1) {
      var h = hashLike(inp[names[i]]);
      if (h) return h;
    }
    return '';
  }

  function evaluateRealTransportTargetConfig(request) {
    var inp = safeObject(request);
    var target = safeObject(inp.target);
    var blockers = [];
    var warnings = [];

    var targetMode = cleanString(inp.targetMode || target.mode);
    var endpointRefHash = firstHash(inp, ['endpointRefHash']) || hashLike(safeObject(inp.endpointRef).endpointRefHash);
    var remoteRootRefHash = firstHash(inp, ['remoteRootRefHash']) || hashLike(safeObject(inp.remoteRootRef).remoteRootRefHash);
    var credentialRefHash = firstHash(inp, ['credentialRefHash']) || hashLike(safeObject(inp.credentialRef).credentialRefHash);
    var peerIdentityBindingHash = firstHash(inp, ['peerIdentityBindingHash']);
    var localClientIdentityHash = firstHash(inp, ['localClientIdentityHash']);
    var expectedPeerIdentityBindingHash = firstHash(inp, ['expectedPeerIdentityBindingHash']);
    var expectedRemoteRootRefHash = firstHash(inp, ['expectedRemoteRootRefHash']);

    var isLocalMockTarget = LOCAL_MOCK_TARGET_MODES.indexOf(targetMode) !== -1 ||
      bool(target.localMockTarget) || bool(inp.localMockTarget);
    var isRealTarget = REAL_TARGET_MODES.indexOf(targetMode) !== -1;

    // raw input is rejected outright (never stored/echoed)
    if (rawInputPresent(inp)) addUnique(blockers, 'real-transport-b1-raw-input-rejected');
    // local mock target may never be accepted as a real target
    if (isLocalMockTarget) addUnique(blockers, 'real-transport-b1-local-mock-target-not-real');
    // ambiguous target
    if (bool(target.ambiguous) || bool(inp.ambiguous) || (!isRealTarget && !isLocalMockTarget)) {
      addUnique(blockers, 'real-transport-b1-target-ambiguous');
    }
    // required hash-only references
    if (!endpointRefHash) addUnique(blockers, 'real-transport-b1-endpoint-ref-missing');
    if (!remoteRootRefHash) addUnique(blockers, 'real-transport-b1-remote-root-missing');
    if (!credentialRefHash) addUnique(blockers, 'real-transport-b1-credential-ref-missing');
    if (!peerIdentityBindingHash) addUnique(blockers, 'real-transport-b1-peer-binding-missing');
    // optional pairing checks
    if (expectedPeerIdentityBindingHash && peerIdentityBindingHash &&
      expectedPeerIdentityBindingHash !== peerIdentityBindingHash) {
      addUnique(blockers, 'real-transport-b1-peer-mismatch');
    }
    if (expectedRemoteRootRefHash && remoteRootRefHash && expectedRemoteRootRefHash !== remoteRootRefHash) {
      addUnique(blockers, 'real-transport-b1-remote-root-mismatch');
    }
    if (!localClientIdentityHash) addUnique(warnings, 'real-transport-b1-local-client-identity-recommended');

    var ready = blockers.length === 0;
    return {
      schema: RESULT_SCHEMA,
      requestSchema: REQUEST_SCHEMA,
      version: VERSION,
      ok: ready,
      status: ready ? 'real-transport-b1-target-config-ready' : 'blocked-real-transport-b1-target-config',
      reason: ready ? 'real-transport-b1-target-config-ready' : blockers[0],
      realTargetConfigReady: ready,
      targetMode: isRealTarget ? targetMode : '',
      // recorded hash-only references only (never raw)
      endpointRefHash: endpointRefHash,
      remoteRootRefHash: remoteRootRefHash,
      credentialRefHash: credentialRefHash,
      peerIdentityBindingHash: peerIdentityBindingHash,
      localClientIdentityHash: localClientIdentityHash,
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
      // privacy: raw never logged/stored/echoed
      rawEndpointLogged: false,
      rawCredentialLogged: false,
      rawRemotePathLogged: false,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawInputRejected: blockers.indexOf('real-transport-b1-raw-input-rejected') !== -1
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
      blocker: 'B1',
      substrate: 'real-transport-target-config-non-writing',
      evaluateOnly: true,
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

  H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig = evaluateRealTransportTargetConfig;
  H2O.Studio.sync.realTransportTargetConfig.diagnose = diagnose;
  H2O.Studio.sync.realTransportTargetConfig.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportTargetConfig.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportTargetConfig.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportTargetConfig.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
