/* H2O Studio Sync - Real Transport W3 Mock Executor Proof
 *
 * Standalone, zero-network, zero-write evaluator for W3.2 executor control
 * flow. It proves the future first-write executor remains fail-closed while
 * W3 has only read-only WebDAV readiness and mock-grade receipt material.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportW3MockExecutorProof =
    H2O.Studio.sync.realTransportW3MockExecutorProof || {};
  if (H2O.Studio.sync.realTransportW3MockExecutorProof.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-w3-mock-executor-proof.v1';
  var REQUEST_SCHEMA = 'h2o.studio.transport.real-transport-w3-mock-executor-proof-request.v1';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-w3-mock-executor-proof-result.v1';
  var MOCK_RECEIPT_SCHEMA = 'h2o.studio.transport.w3-mock-executor-proof-receipt.v1';
  var GATE = 'real-webdav-cloud-relay-transport-w3-mock-executor-proof-evaluate';
  var W3_1_CLOSEOUT_COMMIT = '7862270237955b86d48d943263fd53947cc71f72';

  var FORBIDDEN_WRITE_METHODS = [
    'PUT',
    'DELETE',
    'MKCOL',
    'PROPPATCH',
    'MOVE',
    'COPY',
    'LOCK',
    'UNLOCK',
    'POST'
  ];

  var RAW_INPUT_KEYS = [
    'endpoint',
    'endpointUrl',
    'rawEndpoint',
    'username',
    'credential',
    'credentials',
    'password',
    'secret',
    'token',
    'authHeader',
    'folder',
    'rootPath',
    'remotePath',
    'rawRemotePath',
    'listing',
    'responseBody',
    'payloadBody',
    'privateRegistry'
  ];

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

  function utcString(value) {
    var text = cleanString(value);
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text) ? text : '';
  }

  function utcExpired(value) {
    var text = utcString(value);
    if (!text) return false;
    var ms = Date.parse(text);
    return isFinite(ms) && ms <= Date.now();
  }

  function looksRaw(value) {
    var text = cleanString(value);
    if (!text || hashLike(text)) return false;
    return /:\/\//.test(text) || /^\//.test(text) || /\\/.test(text) ||
      /^[a-z0-9._%+-]+@[a-z0-9.-]+$/i.test(text);
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

  function firstValue(scopes, names) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var n = 0; n < names.length; n += 1) {
        var name = names[n];
        if (Object.prototype.hasOwnProperty.call(scope, name)) {
          var value = scope[name];
          if (value !== undefined && value !== null && cleanString(value) !== '') return value;
        }
      }
    }
    return undefined;
  }

  function firstHash(scopes, names) {
    return hashLike(firstValue(scopes, names));
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

  function nonWritingBase() {
    return {
      mockOnly: true,
      networkAttempted: false,
      executeAttempted: false,
      realWriteSelected: false,
      realWriteEligible: false,
      explicitWriteApprovalPresent: false,
      explicitWriteApprovalConsumed: false,
      writeGradeReceiptPresent: false,
      receiptExpired: false,
      fixtureOrMockGradeReceipt: true,
      noRealApprovalConsumed: true,
      noRealTokenMinted: true,
      noRealTokenConsumed: true,
      noExportIdMinted: true,
      noSequenceBurn: true,
      noRelayOutboxLedgerStoreMutation: true,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      writesCAS: false,
      writesFiles: false,
      enqueuesRelay: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false
    };
  }

  function buildMockReceipt(result) {
    return {
      schema: MOCK_RECEIPT_SCHEMA,
      receiptKind: 'w3-mock-executor-proof',
      mockOnly: true,
      canonicalization: 'json-sorted-keys-v1',
      w31CloseoutCommit: result.w31CloseoutCommit,
      descriptorRegistryRefHash: result.descriptorRegistryRefHash,
      endpointRefHash: result.endpointRefHash,
      remoteRootRefHash: result.remoteRootRefHash,
      credentialRefHash: result.credentialRefHash,
      readOnlyPrerequisitePassed: result.readOnlyPrerequisitePassed,
      failClosedReasons: result.failClosedReasons,
      boundaries: {
        networkAttempted: false,
        writesWebDAV: false,
        writesCloud: false,
        writesRelay: false,
        writesCAS: false,
        writesFiles: false,
        enqueuesRelay: false,
        mintsExportId: false,
        burnsSequence: false,
        fullBundleV3Started: false,
        productSyncReady: false,
        transportReady: false
      }
    };
  }

  function evaluateW3MockExecutorProof(request) {
    var inp = safeObject(request);
    var evidence = safeObject(inp.evidence);
    var readOnly = safeObject(inp.readOnlyCloseout || inp.w31ReadOnlyCloseout);
    var registry = safeObject(inp.registry || inp.resolver);
    var target = safeObject(inp.target);
    var receipt = safeObject(inp.receipt);
    var approval = safeObject(inp.approval || inp.writeApproval);
    var execution = safeObject(inp.execution || inp.writeExecution);
    var safety = safeObject(inp.safety);
    var blockers = [];
    var failClosedReasons = [];
    var scopes = [inp, evidence, readOnly, registry, target, receipt, approval, execution, safety];

    var gate = cleanString(firstValue(scopes, ['gate']));
    var operation = cleanString(firstValue(scopes, ['operation']));
    var descriptorRegistryRefHash = firstHash(scopes, ['descriptorRegistryRefHash']);
    var expectedDescriptorRegistryRefHash = firstHash(scopes, ['expectedDescriptorRegistryRefHash']);
    var endpointRefHash = firstHash(scopes, ['endpointRefHash']);
    var remoteRootRefHash = firstHash(scopes, ['remoteRootRefHash']);
    var credentialRefHash = firstHash(scopes, ['credentialRefHash']);
    var w31CloseoutCommit = cleanString(firstValue(scopes, ['w31CloseoutCommit']));
    var w31CloseoutEvidencePresent = bool(firstValue(scopes, ['w31CloseoutEvidencePresent']));
    var w31ReadOnlyPassed = bool(firstValue(scopes, ['w31ReadOnlyRemoteRootReadinessPassed'])) ||
      bool(firstValue(scopes, ['readOnlyRemoteRootReadinessPassed']));
    var remoteRootReachable = bool(firstValue(scopes, ['remoteRootReachable']));
    var rootExists = bool(firstValue(scopes, ['rootExists']));
    var child404Ok = bool(firstValue(scopes, ['child404Ok']));
    var firstWriteCommandAbsent = bool(firstValue(scopes, ['h2oRtFirstWriteAbsent', 'firstWriteCommandAbsent']));
    var explicitApprovalPresent = bool(firstValue(scopes, ['explicitWriteApprovalPresent', 'writeApprovalPresent']));
    var writeGradeReceiptPresent = bool(firstValue(scopes, ['writeGradeReceiptPresent']));
    var fixtureOrMockGradeReceipt = firstValue(scopes, ['fixtureOrMockGradeReceipt']) !== false;
    var expiryUtc = utcString(firstValue(scopes, ['expiryUtc']));
    var receiptExpired = utcExpired(expiryUtc) || bool(firstValue(scopes, ['receiptExpired']));
    var executeAttempted = bool(firstValue(scopes, ['executeAttempted', 'execute', 'writeRequested', 'writeRequestAttempted']));
    var selectedMethod = cleanString(firstValue(scopes, ['selectedMethod', 'method'])).toUpperCase();
    var realWriteSelected = FORBIDDEN_WRITE_METHODS.indexOf(selectedMethod) !== -1 ||
      bool(firstValue(scopes, ['realWriteSelected']));
    var networkAttemptedClaim = bool(firstValue(scopes, ['networkAttempted']));
    var productSyncReadyClaim = firstValue(scopes, ['productSyncReady']) === true;
    var transportReadyClaim = firstValue(scopes, ['transportReady']) === true;
    var hashMismatch = !!expectedDescriptorRegistryRefHash &&
      !!descriptorRegistryRefHash && expectedDescriptorRegistryRefHash !== descriptorRegistryRefHash;
    var rawInput = rawInputPresent(scopes, [
      descriptorRegistryRefHash,
      expectedDescriptorRegistryRefHash,
      endpointRefHash,
      remoteRootRefHash,
      credentialRefHash
    ]);

    if (gate !== GATE || operation !== 'mock-executor-proof') {
      addUnique(blockers, 'real-transport-w3-mock-executor-wrong-gate');
    }
    if (!descriptorRegistryRefHash || !endpointRefHash || !remoteRootRefHash || !credentialRefHash) {
      addUnique(blockers, 'real-transport-w3-mock-executor-registry-hash-missing');
    }
    if (w31CloseoutCommit !== W3_1_CLOSEOUT_COMMIT || !w31CloseoutEvidencePresent || !w31ReadOnlyPassed ||
      !remoteRootReachable || !rootExists || !child404Ok) {
      addUnique(blockers, 'real-transport-w3-mock-executor-readonly-closeout-missing');
    }
    if (!firstWriteCommandAbsent) addUnique(blockers, 'real-transport-w3-mock-executor-first-write-command-present');
    if (hashMismatch) addUnique(blockers, 'real-transport-w3-mock-executor-registry-hash-mismatch');
    if (receiptExpired) addUnique(blockers, 'real-transport-w3-mock-executor-receipt-expired');
    if (executeAttempted) addUnique(blockers, 'real-transport-w3-mock-executor-execute-requested');
    if (realWriteSelected) addUnique(blockers, 'real-transport-w3-mock-executor-real-write-method-selected');
    if (networkAttemptedClaim) addUnique(blockers, 'real-transport-w3-mock-executor-network-attempted-claim-rejected');
    if (productSyncReadyClaim) addUnique(blockers, 'real-transport-w3-mock-executor-product-sync-ready-claim-rejected');
    if (transportReadyClaim) addUnique(blockers, 'real-transport-w3-mock-executor-transport-ready-claim-rejected');
    if (rawInput) addUnique(blockers, 'real-transport-w3-mock-executor-raw-input-rejected');

    if (!explicitApprovalPresent) addUnique(failClosedReasons, 'explicit-write-approval-absent');
    if (!writeGradeReceiptPresent) addUnique(failClosedReasons, 'write-grade-receipt-absent');
    if (fixtureOrMockGradeReceipt) addUnique(failClosedReasons, 'fixture-or-mock-grade-receipt-rejected-for-real-write');

    var proofReady = blockers.length === 0;
    var base = nonWritingBase();
    base.schema = RESULT_SCHEMA;
    base.requestSchema = REQUEST_SCHEMA;
    base.status = proofReady ?
      'real-transport-w3-mock-executor-proof-completed-real-write-blocked' :
      'blocked-real-transport-w3-mock-executor-proof';
    base.ok = proofReady;
    base.reason = proofReady ? 'mock-executor-control-flow-proven-fail-closed' : blockers[0];
    base.gate = gate;
    base.gateSatisfied = gate === GATE;
    base.operation = operation;
    base.w31CloseoutCommit = w31CloseoutCommit;
    base.w31CloseoutEvidencePresent = w31CloseoutEvidencePresent;
    base.readOnlyPrerequisitePassed = !!(w31ReadOnlyPassed && remoteRootReachable && rootExists && child404Ok);
    base.descriptorRegistryRefHash = descriptorRegistryRefHash;
    base.endpointRefHash = endpointRefHash;
    base.remoteRootRefHash = remoteRootRefHash;
    base.credentialRefHash = credentialRefHash;
    base.expectedDescriptorRegistryRefHash = expectedDescriptorRegistryRefHash || descriptorRegistryRefHash;
    base.registryHashMatched = !hashMismatch && !!descriptorRegistryRefHash;
    base.firstWriteCommandAbsent = firstWriteCommandAbsent;
    base.explicitWriteApprovalPresent = explicitApprovalPresent;
    base.writeGradeReceiptPresent = writeGradeReceiptPresent;
    base.fixtureOrMockGradeReceipt = fixtureOrMockGradeReceipt;
    base.receiptExpired = receiptExpired;
    base.executeAttempted = executeAttempted;
    base.realWriteSelected = realWriteSelected;
    base.selectedMethodClass = realWriteSelected ? 'forbidden-write-method' : (selectedMethod ? 'read-or-none' : 'none');
    base.failClosed = !explicitApprovalPresent || !writeGradeReceiptPresent || fixtureOrMockGradeReceipt;
    base.failClosedReasons = failClosedReasons;
    base.blockers = blockers;
    base.mockReceipt = proofReady ? buildMockReceipt(base) : null;
    base.mockReceiptCore = proofReady ? canonicalString(base.mockReceipt) : '';
    base.privacy = {
      redacted: true,
      hashOnly: true,
      rawInputRejected: rawInput
    };
    return base;
  }

  function diagnose() {
    var base = nonWritingBase();
    base.installed = true;
    base.schema = SCHEMA;
    base.requestSchema = REQUEST_SCHEMA;
    base.mockReceiptSchema = MOCK_RECEIPT_SCHEMA;
    base.gate = GATE;
    base.evaluateOnly = true;
    base.loadTimeInert = true;
    base.status = 'real-transport-w3-mock-executor-proof-diagnose-ready';
    return base;
  }

  H2O.Studio.sync.realTransportW3MockExecutorProof.evaluateW3MockExecutorProof =
    evaluateW3MockExecutorProof;
  H2O.Studio.sync.realTransportW3MockExecutorProof.diagnose = diagnose;
  H2O.Studio.sync.realTransportW3MockExecutorProof.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportW3MockExecutorProof.REQUEST_SCHEMA = REQUEST_SCHEMA;
  H2O.Studio.sync.realTransportW3MockExecutorProof.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportW3MockExecutorProof.MOCK_RECEIPT_SCHEMA = MOCK_RECEIPT_SCHEMA;
  H2O.Studio.sync.realTransportW3MockExecutorProof.GATE = GATE;
  H2O.Studio.sync.realTransportW3MockExecutorProof.__installed = true;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
