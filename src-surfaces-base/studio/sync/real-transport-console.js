/* H2O Studio Sync - Real Transport Console Aggregator (W1a)
 *
 * Standalone, non-writing, non-activating console substrate for aggregating the
 * real WebDAV/cloud/relay transport evaluator chain. It installs only the
 * H2O.Studio.sync.realTransportConsole namespace at load time. It performs no
 * I/O, registers no listeners or timers, holds no state, and does not make real
 * transport available.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.realTransportConsole = H2O.Studio.sync.realTransportConsole || {};
  if (H2O.Studio.sync.realTransportConsole.__installed) return;

  var SCHEMA = 'h2o.studio.sync.real-transport-console.w1a.v1';
  var VERSION = '0.1.0-w1a-real-transport-console-non-writing';
  var RESULT_SCHEMA = 'h2o.studio.transport.real-transport-console-result.w1a.v1';
  var DRY_RUN_GATE = 'real-webdav-cloud-relay-transport-dry-run-evaluate';

  var SUBSTRATES = [
    {
      key: 'b1',
      name: 'B1 target config',
      namespace: 'realTransportTargetConfig',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportTargetConfig'
    },
    {
      key: 'b2',
      name: 'B2 kill switch',
      namespace: 'realTransportKillSwitch',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportKillSwitch'
    },
    {
      key: 'b3',
      name: 'B3 idempotency',
      namespace: 'realTransportIdempotency',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportIdempotency'
    },
    {
      key: 'b4',
      name: 'B4 enqueue boundary',
      namespace: 'realTransportEnqueueBoundary',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportEnqueueBoundary'
    },
    {
      key: 'b5',
      name: 'B5 conflict recovery',
      namespace: 'realTransportConflictRecovery',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportConflictRecovery'
    },
    {
      key: 'b6',
      name: 'B6 sequence export',
      namespace: 'realTransportSequenceExport',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportSequenceExport'
    },
    {
      key: 'b8',
      name: 'B8 approval',
      namespace: 'realTransportApproval',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportApproval'
    },
    {
      key: 'b7',
      name: 'B7 readiness',
      namespace: 'realTransportReadiness',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportReadiness'
    },
    {
      key: 'dryRun',
      name: 'real transport dry-run',
      namespace: 'realTransportDryRun',
      diagnose: 'diagnose',
      evaluate: 'evaluateRealTransportDryRun'
    }
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function bool(value) { return value === true; }

  function hashLike(value) {
    var text = cleanString(value);
    if (/^sha256:[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(text)) return 'sha256:' + text.toLowerCase();
    return '';
  }

  function firstHash(scopes, names) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var n = 0; n < names.length; n += 1) {
        if (Object.prototype.hasOwnProperty.call(scope, names[n])) {
          var hash = hashLike(scope[names[n]]);
          if (hash) return hash;
        }
      }
    }
    return '';
  }

  function firstValue(scopes, names) {
    for (var s = 0; s < scopes.length; s += 1) {
      var scope = safeObject(scopes[s]);
      for (var n = 0; n < names.length; n += 1) {
        if (Object.prototype.hasOwnProperty.call(scope, names[n])) {
          var value = scope[names[n]];
          if (value !== undefined && value !== null && cleanString(value) !== '') return value;
        }
      }
    }
    return undefined;
  }

  function substrateApi(substrate) {
    var sync = safeObject(safeObject(safeObject(global.H2O).Studio).sync);
    var ns = safeObject(sync[substrate.namespace]);
    return {
      diagnose: typeof ns[substrate.diagnose] === 'function' ? ns[substrate.diagnose] : null,
      evaluate: typeof ns[substrate.evaluate] === 'function' ? ns[substrate.evaluate] : null
    };
  }

  function missingSubstrates(requireEvaluate) {
    var missing = [];
    for (var i = 0; i < SUBSTRATES.length; i += 1) {
      var substrate = SUBSTRATES[i];
      var api = substrateApi(substrate);
      if (!api.diagnose || (requireEvaluate && !api.evaluate)) missing.push(substrate.key);
    }
    return missing;
  }

  function nonActivationBase() {
    return {
      realWebDAVTransportAvailable: false,
      realTransportWrite: false,
      transportReady: false,
      transportReadyFlipAuthorized: false,
      productSyncReady: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      writesCAS: false,
      writesFiles: false,
      enqueuesRelay: false,
      realOutboxRowCreated: false,
      relayOutboxTouched: false,
      publicationLedgerTouched: false,
      durableStoreCreated: false,
      exportIdMinted: false,
      sequenceBurned: false,
      outboxWriteAllowed: false,
      ledgerWriteAllowed: false,
      realRecoveryExecuted: false,
      retryDispatched: false,
      remoteWriteAttempted: false,
      mintsExportId: false,
      burnsSequence: false,
      mutatesExportState: false,
      fullBundleV3Started: false,
      noCleanupAuthority: true,
      noA950Mutation: true
    };
  }

  function diagnose() {
    var missing = missingSubstrates(false);
    var diagnostics = {};
    for (var i = 0; i < SUBSTRATES.length; i += 1) {
      var substrate = SUBSTRATES[i];
      var api = substrateApi(substrate);
      if (api.diagnose) diagnostics[substrate.key] = api.diagnose();
    }
    var base = nonActivationBase();
    base.schema = SCHEMA;
    base.version = VERSION;
    base.ok = missing.length === 0;
    base.status = missing.length === 0 ? 'real-transport-console-diagnose-ready' : 'blocked-real-transport-console-missing-substrate';
    base.reason = missing.length === 0 ? 'real-transport-console-diagnose-ready' : 'real-transport-console-missing-substrate';
    base.installed = true;
    base.evaluateOnly = true;
    base.holdsState = false;
    base.loadTimeInert = true;
    base.substrateOrder = SUBSTRATES.map(function (s) { return s.key; });
    base.missingSubstrates = missing;
    base.substrateDiagnostics = diagnostics;
    return base;
  }

  function subrequest(input, key) {
    var subrequests = safeObject(input.subrequests);
    if (isObject(subrequests[key])) return subrequests[key];
    if (isObject(input[key])) return input[key];
    return {};
  }

  function addResultBlockers(blockers, key, result) {
    if (!result || result.ok === true) return;
    var list = Array.isArray(result.blockers) ? result.blockers : [result.reason || result.status || 'blocked'];
    for (var i = 0; i < list.length; i += 1) blockers.push(key + ':' + cleanString(list[i]));
  }

  function buildDryRunRequest(input, results) {
    var refs = safeObject(input.refs || input.evidenceRefs);
    var requestedDryRun = safeObject(input.dryRun);
    var b1 = safeObject(results.b1);
    var b2 = safeObject(results.b2);
    var b3 = safeObject(results.b3);
    var b4 = safeObject(results.b4);
    var b5 = safeObject(results.b5);
    var b6 = safeObject(results.b6);
    var b8 = safeObject(results.b8);
    var b7 = safeObject(results.b7);
    var scopes = [refs, b7, b8, b6, b5, b4, b3, b2, b1, requestedDryRun];

    var payloadHash = firstHash(scopes, ['candidatePayloadHash']);
    var bundleHash = firstHash(scopes, ['candidateBundleHash']) || payloadHash;
    var envelopeHash = firstHash(scopes, ['fullBundleV2EnvelopeHash']) || payloadHash;

    return {
      dryRun: firstValue([requestedDryRun, input], ['dryRun']) === false ? false : true,
      apply: firstValue([requestedDryRun, input], ['apply']) === true,
      gate: cleanString(firstValue([requestedDryRun, input, refs], ['gate'])) || DRY_RUN_GATE,
      evidence: {
        targetMode: cleanString(firstValue(scopes, ['targetMode'])) || 'real-webdav',
        b1TargetConfigReady: b1.realTargetConfigReady === true,
        b1TargetConfigRefHash: firstHash(scopes, ['b1TargetConfigRefHash']) || firstHash(scopes, ['endpointRefHash']),
        endpointRefHash: firstHash(scopes, ['endpointRefHash']),
        remoteRootRefHash: firstHash(scopes, ['remoteRootRefHash']),
        credentialRefHash: firstHash(scopes, ['credentialRefHash']),
        peerIdentityBindingHash: firstHash(scopes, ['peerIdentityBindingHash']),
        localClientIdentityHash: firstHash(scopes, ['localClientIdentityHash']),
        b2KillSwitchLifecycleReady: b2.realKillSwitchLifecycleReady === true || b2.ok === true,
        b2KillSwitchRefHash: firstHash(scopes, ['b2KillSwitchRefHash', 'killSwitchEnableTokenHash']),
        b3DurableIdempotencyReady: b3.idempotencyRecordReady === true,
        b3IdempotencyRefHash: firstHash(scopes, ['b3IdempotencyRefHash', 'idempotencyKeyHash']),
        idempotencyKeyHash: firstHash(scopes, ['idempotencyKeyHash', 'b3IdempotencyRefHash']),
        b4EnqueueOutboxBoundaryReady: b4.realEnqueueAuthorized === true || b4.ok === true,
        b4OutboxBoundaryRefHash: firstHash(scopes, ['b4OutboxBoundaryRefHash', 'outboxRecordHash']),
        b5ConflictPartialWriteReady: b5.realConflictRecoveryReady === true,
        b5ConflictPolicyRefHash: firstHash(scopes, ['b5ConflictPolicyRefHash', 'conflictPolicyRefHash', 'b5VerifiedWriteRefHash']),
        b6SequenceExportReady: b6.realSequenceExportReady === true,
        b6SequenceExportRefHash: firstHash(scopes, ['b6SequenceExportRefHash', 'sequenceExportConstraintRefHash']),
        b8ApprovalAccepted: b8.realTransportApprovalAccepted === true,
        realTransportApprovalAccepted: b8.realTransportApprovalAccepted === true,
        b8ApprovalRefHash: firstHash(scopes, ['b8ApprovalRefHash', 'approvalRecordHash']),
        b7ReadinessCandidate: b7.transportReadyCandidate === true,
        transportReadyCandidate: b7.transportReadyCandidate === true,
        transportReadyFlipAuthorized: false,
        b7ReadinessPolicyRefHash: firstHash(scopes, ['b7ReadinessPolicyRefHash']),
        transportReadinessReviewRefHash: firstHash(scopes, ['transportReadinessReviewRefHash']),
        localExportableSyncReady: b7.localExportableSyncReady === true,
        transportEligibilityFromLocalExportableReady: b7.transportEligibilityFromLocalExportableReady === true,
        productSyncReady: false,
        transportReady: false,
        candidatePayloadHash: payloadHash,
        candidateBundleHash: bundleHash,
        fullBundleV2EnvelopeHash: envelopeHash,
        payloadSchema: cleanString(firstValue(scopes, ['payloadSchema'])) || 'h2o.studio.fullBundle.v2',
        fullBundleV3Deferred: firstValue(scopes, ['fullBundleV3Deferred']) === false ? false : true,
        chatSavingCasSeparate: firstValue(scopes, ['chatSavingCasSeparate']) === false ? false : true,
        noChatSavingCAS: firstValue(scopes, ['noChatSavingCAS']) === false ? false : true,
        chatSavingCasBlocked: firstValue(scopes, ['chatSavingCasBlocked']) === false ? false : true,
        a950DocumentedDebtQuarantined: firstValue(scopes, ['a950DocumentedDebtQuarantined']) === false ? false : true,
        a950LeaksIntoExportablePayload: false,
        noA950Mutation: firstValue(scopes, ['noA950Mutation']) === false ? false : true,
        privacyHashOnly: firstValue(scopes, ['privacyHashOnly']) === false ? false : true
      }
    };
  }

  function runChainedDryRun(request) {
    var input = safeObject(request);
    var missing = missingSubstrates(true);
    var base = nonActivationBase();
    var results = {};
    var blockers = [];

    if (missing.length > 0) {
      base.schema = RESULT_SCHEMA;
      base.version = VERSION;
      base.ok = false;
      base.status = 'blocked-real-transport-console-missing-substrate';
      base.reason = 'real-transport-console-missing-substrate';
      base.realTransportConsole = true;
      base.missingSubstrates = missing;
      base.substrateResults = results;
      base.blockers = missing.map(function (key) { return 'missing-substrate:' + key; });
      base.warnings = [];
      return base;
    }

    for (var i = 0; i < SUBSTRATES.length - 1; i += 1) {
      var substrate = SUBSTRATES[i];
      var api = substrateApi(substrate);
      results[substrate.key] = api.evaluate(subrequest(input, substrate.key));
      addResultBlockers(blockers, substrate.key, results[substrate.key]);
    }

    var dryRunRequest = buildDryRunRequest(input, results);
    results.dryRun = substrateApi(SUBSTRATES[SUBSTRATES.length - 1]).evaluate(dryRunRequest);
    addResultBlockers(blockers, 'dryRun', results.dryRun);

    var dry = safeObject(results.dryRun);
    var ok = dry.ok === true && blockers.length === 0;
    base.schema = RESULT_SCHEMA;
    base.version = VERSION;
    base.ok = ok;
    base.status = ok ? 'real-transport-console-chained-dry-run-ready' : 'blocked-real-transport-console-chained-dry-run';
    base.reason = ok ? 'real-transport-console-chained-dry-run-ready' : (blockers[0] || dry.reason || 'blocked');
    base.realTransportConsole = true;
    base.chainedDryRun = true;
    base.missingSubstrates = [];
    base.substrateOrder = SUBSTRATES.map(function (s) { return s.key; });
    base.substrateResults = results;
    base.dryRunRequestRedacted = dryRunRequest;
    base.transportReadyCandidate = dry.transportReadyCandidate === true;
    base.realTransportApprovalAccepted = results.b8 && results.b8.realTransportApprovalAccepted === true;
    base.localExportableSyncReadyIsAuthorization = false;
    base.localMockSubstitutionAccepted = false;
    base.privacy = {
      redacted: true,
      hashOnly: true,
      rawInputRejected: dry.privacy && dry.privacy.rawInputRejected === true
    };
    base.blockers = blockers;
    base.warnings = [];
    return base;
  }

  H2O.Studio.sync.realTransportConsole.diagnose = diagnose;
  H2O.Studio.sync.realTransportConsole.runChainedDryRun = runChainedDryRun;
  H2O.Studio.sync.realTransportConsole.SCHEMA = SCHEMA;
  H2O.Studio.sync.realTransportConsole.RESULT_SCHEMA = RESULT_SCHEMA;
  H2O.Studio.sync.realTransportConsole.__installed = true;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
