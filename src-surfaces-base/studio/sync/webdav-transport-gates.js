/* H2O Studio Sync - WebDAV Transport Gate Dry-Run (Phase 30)
 *
 * Disabled-by-default guard and manifest evaluator only. This module does not
 * upload, download, fetch, write files, touch storage, mutate envelopes, or
 * alter the active local sync-folder JSON transport.
 */
(function (global) {
  'use strict';

  var H2O = global.H2O = global.H2O || {};
  H2O.Studio = H2O.Studio || {};
  H2O.Studio.sync = H2O.Studio.sync || {};
  H2O.Studio.sync.webdavTransportGates = H2O.Studio.sync.webdavTransportGates || {};
  if (H2O.Studio.sync.webdavTransportGates.__installed) return;

  var SCHEMA = 'h2o.studio.sync.webdav-transport-control-plane.v1';
  var VERSION = '0.1.0-phase30-dry-run';
  var DEV_ONLY_WRITE_FLAG = 'webdav-dev-only-do-not-ship';
  var ACTIVE_TRANSPORT = 'local-sync-folder-json';
  var READINESS_DRY_RUN_REQUEST_SCHEMA = 'h2o.studio.transport.webdav-readiness-dry-run-request.v1';
  var READINESS_DRY_RUN_RESULT_SCHEMA = 'h2o.studio.transport.webdav-readiness-dry-run-result.v1';
  var TRANSPORT_READINESS_DRY_RUN_GATE = 'webdav-transport-readiness-dry-run-evaluate';
  var TRANSPORT_CONTROLLED_APPLY_GATE = 'webdav-cloud-relay-transport-controlled-apply';
  var APPLIED_TYPES = Object.freeze([
    'chat-category-assign',
    'chat-category-clear',
    'chat-label-bind',
    'chat-tag-bind',
    'chat-label-unbind',
    'chat-tag-unbind'
  ]);
  var SAME_ENVELOPES = Object.freeze([
    'latest.json',
    'chrome-latest.json',
    'libraryMetadataMutationReceipts[]',
    'desktopCanonicalLibraryMetadata'
  ]);
  var GUARDS = Object.freeze([
    'feature-gate-guard',
    'dev-only-write-flag-guard',
    'envelope-unchanged-guard',
    'allowlist-unchanged-guard',
    'authority-model-guard',
    'chrome-read-only-guard',
    'desktop-canonical-guard',
    'no-destructive-action-guard',
    'no-schema-mutation-guard',
    'no-secret-raw-data-evidence-guard',
    'checksum-integrity-guard',
    'sequence-monotonicity-guard',
    'peer-identity-guard',
    'stale-basis-guard',
    'corrupt-partial-file-recovery-guard',
    'product-sync-ready-false-guard'
  ]);
  var FEATURE_FLAGS = Object.freeze([
    'h2o:studio:sync:webdav:enabled',
    'h2o:studio:sync:webdav:read:enabled',
    'h2o:studio:sync:webdav:write:enabled',
    'h2o:studio:sync:webdav:desktop-export-mirror:enabled',
    'h2o:studio:sync:webdav:chrome-request-export-mirror:enabled',
    'h2o:studio:sync:webdav:dev-flag'
  ]);

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function safeObject(value) {
    return isObject(value) ? value : {};
  }

  function cleanString(value) {
    return String(value == null ? '' : value).trim();
  }

  function addUnique(list, code) {
    var text = cleanString(code);
    if (text && list.indexOf(text) === -1) list.push(text);
  }

  function bool(value) {
    return value === true;
  }

  function integerOrNull(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.floor(n);
  }

  function hashLike(value) {
    var text = cleanString(value);
    if (/^sha256:[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(text)) return 'sha256:' + text.toLowerCase();
    return '';
  }

  function redactedRemoteRootRef(input) {
    var remote = safeObject(input.remoteRootRef);
    return {
      remoteRootRefHash: hashLike(remote.remoteRootRefHash || input.remoteRootRefHash),
      remoteRootLabel: cleanString(remote.remoteRootLabel || input.remoteRootLabel || 'webdav-redacted-root'),
      endpointRedacted: true,
      credentialsRedacted: true,
      rawEndpointPresent: false,
      rawCredentialsPresent: false
    };
  }

  function redactedSafePeerDirectory(input) {
    var dir = safeObject(input.safePeerDirectory);
    return {
      peerDirHash: hashLike(dir.peerDirHash || input.peerDirHash),
      schema: cleanString(dir.schema || 'h2o.studio.sync.webdav-peer-directory.v1'),
      version: cleanString(dir.version || VERSION),
      rawPeerDirectoryPresent: false
    };
  }

  function redactedPeerIdentity(input) {
    var peer = safeObject(input.peerIdentity);
    return {
      peerIdHash: hashLike(peer.peerIdHash || input.peerIdHash),
      installIdHash: hashLike(peer.installIdHash || input.installIdHash),
      deviceLabel: cleanString(peer.deviceLabel || input.deviceLabel || 'redacted-peer'),
      rawPeerIdPresent: false,
      accountLinked: false
    };
  }

  function normalizeFlags(input) {
    var raw = safeObject(input.flags);
    return {
      webdavEnabled: bool(raw.webdavEnabled || raw['h2o:studio:sync:webdav:enabled']),
      readEnabled: bool(raw.readEnabled || raw['h2o:studio:sync:webdav:read:enabled']),
      writeEnabled: bool(raw.writeEnabled || raw['h2o:studio:sync:webdav:write:enabled']),
      desktopExportMirrorEnabled: bool(raw.desktopExportMirrorEnabled ||
        raw['h2o:studio:sync:webdav:desktop-export-mirror:enabled']),
      chromeRequestExportMirrorEnabled: bool(raw.chromeRequestExportMirrorEnabled ||
        raw['h2o:studio:sync:webdav:chrome-request-export-mirror:enabled']),
      devFlag: cleanString(raw.devFlag || raw['h2o:studio:sync:webdav:dev-flag'])
    };
  }

  function requestedMirrorFlag(flags, operation) {
    if (operation === 'chrome-request-export-mirror') return flags.chromeRequestExportMirrorEnabled;
    return flags.desktopExportMirrorEnabled;
  }

  function hasRawPrivateInput(input) {
    var textFields = [
      input.remoteRootUrl,
      input.endpoint,
      input.username,
      input.password,
      input.token,
      input.rawChatTitle,
      input.rawChatContent,
      input.rawChatId,
      input.rawFolderId,
      input.rawPeerId,
      input.rawPath,
      input.chatTitle,
      input.folderName,
      input.chatId,
      input.folderId,
      input.rawLabelName,
      input.rawTagName,
      input.rawCategoryName,
      input.accountLinkedMetadata,
      input.remoteRootPath
    ];
    return textFields.some(function (value) { return cleanString(value); });
  }

  function privacyRedactionStatus(input) {
    return {
      redacted: true,
      hashOnly: true,
      rawContent: false,
      rawTitles: false,
      rawNames: false,
      accountLinked: false,
      secretsPresent: false,
      rawInputRejected: hasRawPrivateInput(safeObject(input))
    };
  }

  function evaluateGuards(input) {
    var inp = safeObject(input);
    var operation = cleanString(inp.operation || 'desktop-export-mirror');
    var flags = normalizeFlags(inp);
    var blockers = [];
    var warnings = [];
    var guardRows = [];
    var writeRequested = operation === 'desktop-export-mirror' || operation === 'chrome-request-export-mirror';
    var devFlagOk = flags.devFlag === DEV_ONLY_WRITE_FLAG;
    var mirrorGateOk = requestedMirrorFlag(flags, operation);
    var contentHash = hashLike(inp.contentHash);
    var fileHash = hashLike(inp.fileHash);
    var seq = integerOrNull(inp.sequenceNumber);
    var previousSeq = integerOrNull(inp.previousSequenceNumber);
    var peer = redactedPeerIdentity(inp);
    var privacy = privacyRedactionStatus(inp);

    function guard(code, ok, status, detail) {
      guardRows.push({
        code: code,
        ok: ok === true,
        status: cleanString(status || (ok ? 'passed' : 'blocked')),
        detail: cleanString(detail)
      });
      if (!ok) addUnique(blockers, code);
    }

    guard('feature-gate-guard', flags.webdavEnabled || !writeRequested, flags.webdavEnabled ? 'enabled' : 'blocked-disabled-by-default',
      flags.webdavEnabled ? 'WebDAV gate explicitly enabled for dry-run.' : 'WebDAV remains disabled by default.');
    guard('dev-only-write-flag-guard', !writeRequested || devFlagOk, devFlagOk ? 'dev-flag-present' : 'blocked-dev-flag-required',
      'Write-capable WebDAV path requires webdav-dev-only-do-not-ship.');
    guard('envelope-unchanged-guard', true, 'passed', 'Dry-run carries existing latest.json/chrome-latest.json envelope names only.');
    guard('allowlist-unchanged-guard', true, 'passed', APPLIED_TYPES.join(', '));
    guard('authority-model-guard', true, 'passed', 'Desktop canonical, Chrome request-only, WebDAV dumb transport.');
    guard('chrome-read-only-guard', true, 'passed', 'Chrome canonical mutation remains blocked.');
    guard('desktop-canonical-guard', true, 'passed', 'Desktop remains canonical authority.');
    guard('no-destructive-action-guard', true, 'passed', 'No delete, purge, remove, hard-delete, or catalog destructive broadening.');
    guard('no-schema-mutation-guard', true, 'passed', 'No metadata request/receipt/projection schema mutation.');
    guard('no-secret-raw-data-evidence-guard', !privacy.rawInputRejected, privacy.rawInputRejected ? 'blocked-raw-private-input' : 'passed',
      'Manifest/evidence is hash/redacted only.');
    guard('checksum-integrity-guard', !!contentHash && !!fileHash, contentHash && fileHash ? 'passed' : 'blocked-missing-hash',
      'contentHash and fileHash must be SHA-256 values.');
    guard('sequence-monotonicity-guard', seq != null && (previousSeq == null || seq >= previousSeq),
      seq != null && (previousSeq == null || seq >= previousSeq) ? 'passed' : 'blocked-sequence-regression',
      'sequenceNumber must be present and monotonic.');
    guard('peer-identity-guard', !!peer.peerIdHash, peer.peerIdHash ? 'passed' : 'blocked-peer-id-hash-required',
      'Peer identity must be hash/redacted.');
    guard('stale-basis-guard', true, 'dry-run-decision-only', 'Stale basis decisions are reported, not applied.');
    guard('corrupt-partial-file-recovery-guard', true, 'dry-run-decision-only', 'Corrupt/partial recovery is a decision only.');
    guard('product-sync-ready-false-guard', true, 'passed', 'productSyncReady remains false.');

    if (writeRequested && flags.webdavEnabled && !flags.writeEnabled) addUnique(blockers, 'webdav-write-disabled');
    if (writeRequested && flags.webdavEnabled && !mirrorGateOk) addUnique(blockers, 'webdav-mirror-gate-disabled');
    if (!flags.webdavEnabled) addUnique(blockers, 'webdav-disabled');
    if (writeRequested && !devFlagOk) addUnique(blockers, 'webdav-dev-flag-required');
    if (!contentHash || !fileHash) addUnique(blockers, 'webdav-checksum-required');
    if (!peer.peerIdHash) addUnique(blockers, 'webdav-peer-mismatch');
    if (privacy.rawInputRejected) addUnique(blockers, 'webdav-private-input-rejected');
    if (seq == null || (previousSeq != null && seq < previousSeq)) addUnique(blockers, 'webdav-sequence-regression');
    if (flags.webdavEnabled && (flags.readEnabled || flags.writeEnabled)) {
      addUnique(warnings, 'webdav-dry-run-only-no-remote-io');
    }

    return {
      schema: SCHEMA + '.guard-evaluation',
      version: VERSION,
      operation: operation,
      dryRunOnly: true,
      flags: {
        webdavEnabled: flags.webdavEnabled,
        readEnabled: flags.readEnabled,
        writeEnabled: flags.writeEnabled,
        desktopExportMirrorEnabled: flags.desktopExportMirrorEnabled,
        chromeRequestExportMirrorEnabled: flags.chromeRequestExportMirrorEnabled,
        devOnlyWriteFlagPresent: devFlagOk
      },
      guards: guardRows,
      blockers: blockers,
      warnings: warnings,
      ok: blockers.length === 0,
      activeTransport: ACTIVE_TRANSPORT,
      localSyncFolderJsonActive: true,
      remoteFilesWritten: false,
      webdavWritesEnabled: false,
      productSyncReady: false
    };
  }

  function buildDryRunManifest(input) {
    var inp = safeObject(input);
    var evaluation = evaluateGuards(inp);
    var flags = normalizeFlags(inp);
    var operation = cleanString(inp.operation || 'desktop-export-mirror');
    var writeRequested = operation === 'desktop-export-mirror' || operation === 'chrome-request-export-mirror';
    var devFlagOk = flags.devFlag === DEV_ONLY_WRITE_FLAG;
    var writeStatus = 'disabled';
    var readStatus = 'disabled';

    if (flags.webdavEnabled && flags.readEnabled) readStatus = 'dry-run-read-eligible';
    if (writeRequested && flags.webdavEnabled && flags.writeEnabled && requestedMirrorFlag(flags, operation)) {
      writeStatus = devFlagOk ? 'dry-run-dev-flag-present-no-remote-write' : 'skipped-no-dev-flag';
    } else if (writeRequested && flags.webdavEnabled) {
      writeStatus = 'blocked-gate-disabled';
    } else if (writeRequested) {
      writeStatus = 'disabled';
    }

    return {
      schema: SCHEMA,
      version: VERSION,
      phase: 'phase30-webdav-dry-run-gates',
      transportKind: 'webdav',
      dryRunOnly: true,
      implementationStatus: 'disabled-by-default-proof-only',
      activeTransport: ACTIVE_TRANSPORT,
      localSyncFolderJsonActive: true,
      remoteFilesWritten: false,
      webdavWritesEnabled: false,
      devOnlyWriteFlagRequired: DEV_ONLY_WRITE_FLAG,
      sameEnvelopes: SAME_ENVELOPES.slice(),
      appliedRequestTypeAllowlist: APPLIED_TYPES.slice(),
      remoteRootRef: redactedRemoteRootRef(inp),
      safePeerDirectory: redactedSafePeerDirectory(inp),
      peerIdentity: redactedPeerIdentity(inp),
      sequenceNumber: integerOrNull(inp.sequenceNumber),
      previousExportId: cleanString(inp.previousExportId),
      contentHash: hashLike(inp.contentHash),
      fileHash: hashLike(inp.fileHash),
      lastKnownRemoteState: {
        exportId: cleanString(safeObject(inp.lastKnownRemoteState).exportId),
        sequenceNumber: integerOrNull(safeObject(inp.lastKnownRemoteState).sequenceNumber),
        fileHash: hashLike(safeObject(inp.lastKnownRemoteState).fileHash),
        observedAtIso: cleanString(safeObject(inp.lastKnownRemoteState).observedAtIso)
      },
      conflictStatus: cleanString(inp.conflictStatus || (evaluation.blockers.indexOf('webdav-sequence-regression') !== -1 ? 'sequence-regression' : 'none')),
      writeStatus: writeStatus,
      readStatus: readStatus,
      recoveryStatus: cleanString(inp.recoveryStatus || 'none'),
      privacyRedactionStatus: privacyRedactionStatus(inp),
      guardEvaluation: evaluation,
      authority: {
        desktopCanonical: true,
        chromeRequestOnly: true,
        chromeReadOnlyCanonicalMetadata: true,
        webdavDumbTransportOnly: true
      },
      safety: {
        noRemoteWrite: true,
        noFetch: true,
        noStorageWrite: true,
        noEnvelopeMutation: true,
        noSchemaMutation: true,
        noAppliedTypeBroadening: true,
        noDestructiveAction: true,
        noChromeCanonicalMutation: true
      },
      productSyncReady: false
    };
  }

  function dryRun(input) {
    var manifest = buildDryRunManifest(input);
    return {
      ok: true,
      status: 'webdav-dry-run-evaluated',
      schema: SCHEMA + '.dry-run-result',
      version: VERSION,
      manifest: manifest,
      activeTransport: ACTIVE_TRANSPORT,
      localSyncFolderJsonActive: true,
      remoteFilesWritten: false,
      webdavWritesEnabled: false,
      productSyncReady: false
    };
  }

  function firstHash(input, names) {
    var inp = safeObject(input);
    for (var i = 0; i < names.length; i += 1) {
      var value = hashLike(inp[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function objectHash(input, objectName, names) {
    var obj = safeObject(safeObject(input)[objectName]);
    for (var i = 0; i < names.length; i += 1) {
      var value = hashLike(obj[names[i]]);
      if (value) return value;
    }
    return '';
  }

  function peerTargetHash(input) {
    return firstHash(input, ['peerTargetHash', 'peerIdHash', 'localMockTargetHash']) ||
      objectHash(input, 'peerTarget', ['peerTargetHash', 'peerIdHash', 'targetHash']);
  }

  function remoteRootHash(input) {
    return firstHash(input, ['remoteRootRefHash', 'remoteRootHash']) ||
      objectHash(input, 'remoteRootRef', ['remoteRootRefHash', 'remoteRootHash']);
  }

  function evaluateTransportReadinessDryRun(request) {
    var inp = safeObject(request);
    var blockers = [];
    var warnings = [];
    var gate = cleanString(inp.gate);
    var localMockTarget = bool(inp.localMockTarget);
    var peerHash = peerTargetHash(inp);
    var rootHash = remoteRootHash(inp);
    var bundleHash = firstHash(inp, [
      'candidatePayloadHash',
      'candidateBundleHash',
      'expectedBundleHash',
      'expectedContentSha256',
      'contentHash'
    ]);
    var checksumHash = firstHash(inp, ['expectedFileHash', 'fileHash', 'expectedChecksum', 'checksumHash']);
    var expectedSeq = integerOrNull(inp.expectedSequenceNumber == null ? inp.sequenceNumber : inp.expectedSequenceNumber);
    var previousSeq = integerOrNull(inp.previousSequenceNumber);
    var sequenceMode = cleanString(inp.sequenceMode);
    var privacy = privacyRedactionStatus(inp);
    var privacyMode = cleanString(inp.privacyMode);
    var privacyObject = safeObject(inp.privacy);
    var peerTargetProvided = isObject(inp.peerTarget) || cleanString(inp.peerTargetHash) || cleanString(inp.peerIdHash) ||
      cleanString(inp.localMockTargetHash) || localMockTarget;
    var remoteRootProvided = isObject(inp.remoteRootRef) || cleanString(inp.remoteRootRefHash) || cleanString(inp.remoteRootHash);
    var writeLikeRequested = bool(inp.writeRequested) || bool(inp.writesData) || bool(inp.writeData) ||
      bool(inp.writeWebDAV) || bool(inp.writesWebDAV) || bool(inp.webdavWrite) ||
      bool(inp.writesCloud) || bool(inp.cloudWrite) || bool(inp.remoteWriteAttempted);
    var relayRequested = bool(inp.writeRelay) || bool(inp.writesRelay) || bool(inp.relayEnqueueAttempted) ||
      bool(inp.enqueueRelay) || bool(inp.relayDispatchRequested);
    var casRequested = bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.casWrite) ||
      bool(inp.chatSavingCasTouched) || bool(inp.chatSavingCasRequested);
    var fullBundleV3Requested = bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
      bool(inp.mintFullBundleV3) || bool(inp.fullBundleV3MintRequested);
    var cleanupRequested = bool(inp.cleanupAuthorityIntroduced) || bool(inp.cleanupApply) || bool(inp.cleanupRequested) ||
      bool(inp.a950MutationAttempted) || bool(inp.mutateA950);
    var exportMintRequested = bool(inp.exportIdMinted) || bool(inp.mintExportId) || cleanString(inp.mintedExportId);

    if (!gate) addUnique(blockers, 'webdav-dry-run-gate-missing');
    else if (gate !== TRANSPORT_READINESS_DRY_RUN_GATE) addUnique(blockers, 'webdav-dry-run-gate-invalid');
    if (inp.dryRun !== true) addUnique(blockers, 'webdav-dry-run-required');
    if (inp.apply === true) addUnique(blockers, 'webdav-dry-run-apply-forbidden');
    if (inp.productSyncReady !== false) addUnique(blockers, 'webdav-product-sync-ready-mismatch');
    if (inp.transportReady !== false) addUnique(blockers, 'webdav-transport-ready-mismatch');
    if (inp.localExportableSyncReady !== true) addUnique(blockers, 'webdav-local-exportable-not-ready');
    if (inp.transportEligibilityFromLocalExportableReady !== true) addUnique(blockers, 'webdav-transport-eligibility-missing');
    if (privacyMode !== 'hash-only' || privacyObject.hashOnly === false || bool(inp.rawPrivateFieldsLogged) || privacy.rawInputRejected) {
      addUnique(blockers, 'webdav-private-input-rejected');
    }
    if (!bundleHash || (cleanString(inp.expectedFileHash || inp.fileHash || inp.expectedChecksum || inp.checksumHash) && !checksumHash)) {
      addUnique(blockers, 'webdav-checksum-required');
    }
    if (sequenceMode !== 'not-minted-in-dry-run' && expectedSeq == null) addUnique(blockers, 'webdav-sequence-regression');
    if (expectedSeq != null && previousSeq != null && expectedSeq < previousSeq) addUnique(blockers, 'webdav-sequence-regression');
    if (exportMintRequested) addUnique(blockers, 'webdav-export-id-minted-in-dry-run');
    if (!peerTargetProvided || (!peerHash && !localMockTarget)) addUnique(blockers, 'webdav-peer-target-ambiguous');
    if (isObject(inp.peerTarget) && !peerHash && !localMockTarget) addUnique(blockers, 'webdav-peer-hash-required');
    if (peerHash && localMockTarget) addUnique(blockers, 'webdav-peer-target-ambiguous');
    if (!localMockTarget && (!remoteRootProvided || !rootHash)) addUnique(blockers, 'webdav-remote-root-ambiguous');
    if (writeLikeRequested) addUnique(blockers, 'webdav-dry-run-remote-write-forbidden');
    if (relayRequested) addUnique(blockers, 'webdav-dry-run-relay-enqueue-forbidden');
    if (casRequested) addUnique(blockers, 'webdav-chat-saving-cas-boundary-violation');
    if (fullBundleV3Requested) addUnique(blockers, 'webdav-fullbundle-v3-start-forbidden');
    if (cleanupRequested) addUnique(blockers, 'webdav-cleanup-authority-forbidden');
    if (inp.chatSavingCasBlocked !== true) addUnique(warnings, 'chat-saving-cas-blocked-flag-not-supplied');
    if (inp.a950DocumentedDebtVisible !== true && inp.a950DocumentedDebtQuarantined !== true) {
      addUnique(warnings, 'a950-documented-debt-visibility-not-supplied');
    }

    return {
      schema: READINESS_DRY_RUN_RESULT_SCHEMA,
      requestSchema: READINESS_DRY_RUN_REQUEST_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      status: blockers.length === 0 ? 'webdav-transport-dry-run-ready' : 'blocked-webdav-transport-dry-run',
      reason: blockers.length === 0 ? 'webdav-transport-dry-run-ready' : blockers[0],
      gate: gate,
      gateSatisfied: gate === TRANSPORT_READINESS_DRY_RUN_GATE,
      transportReadinessDryRun: true,
      dryRun: true,
      applyRequested: false,
      writesData: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      enqueuesRelay: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReady: inp.localExportableSyncReady === true,
      transportEligibilityFromLocalExportableReady: inp.transportEligibilityFromLocalExportableReady === true,
      transportControlledApplyGateReserved: TRANSPORT_CONTROLLED_APPLY_GATE,
      webdavCloudRelayBlocked: true,
      chatSavingCasBlocked: true,
      a950DocumentedDebtQuarantined: true,
      noCleanupAuthority: true,
      candidatePayloadHash: bundleHash,
      candidateBundleHash: bundleHash,
      expectedFileHash: checksumHash,
      sequenceMode: sequenceMode || (expectedSeq == null ? 'not-minted-in-dry-run' : 'fixed-existing-sequence'),
      expectedSequenceNumber: expectedSeq,
      previousSequenceNumber: previousSeq,
      peerTarget: {
        localMockTarget: localMockTarget,
        peerTargetHash: peerHash,
        remoteRootRefHash: rootHash,
        ambiguous: blockers.indexOf('webdav-peer-target-ambiguous') !== -1
      },
      privacy: {
        redacted: true,
        hashOnly: true,
        rawPrivateFieldsLogged: false,
        rawInputRejected: privacy.rawInputRejected
      },
      blockers: blockers,
      warnings: warnings,
      activeTransport: ACTIVE_TRANSPORT
    };
  }

  function diagnose() {
    return {
      installed: true,
      schema: SCHEMA,
      version: VERSION,
      phase: 'phase30-webdav-dry-run-gates',
      dryRunOnly: true,
      webdavDisabledByDefault: true,
      devOnlyWriteFlag: DEV_ONLY_WRITE_FLAG,
      activeTransport: ACTIVE_TRANSPORT,
      localSyncFolderJsonActive: true,
      remoteFilesWritten: false,
      webdavWritesEnabled: false,
      sameEnvelopes: SAME_ENVELOPES.slice(),
      appliedRequestTypeAllowlist: APPLIED_TYPES.slice(),
      guards: GUARDS.slice(),
      featureFlags: FEATURE_FLAGS.slice(),
      productSyncReady: false
    };
  }

  H2O.Studio.sync.webdavTransportGates.buildDryRunManifest = buildDryRunManifest;
  H2O.Studio.sync.webdavTransportGates.evaluateGuards = evaluateGuards;
  H2O.Studio.sync.webdavTransportGates.dryRun = dryRun;
  H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun = evaluateTransportReadinessDryRun;
  H2O.Studio.sync.webdavTransportGates.diagnose = diagnose;
  H2O.Studio.sync.webdavTransportGates.constants = Object.freeze({
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    DEV_ONLY_WRITE_FLAG: DEV_ONLY_WRITE_FLAG,
    ACTIVE_TRANSPORT: ACTIVE_TRANSPORT,
    READINESS_DRY_RUN_REQUEST_SCHEMA: READINESS_DRY_RUN_REQUEST_SCHEMA,
    READINESS_DRY_RUN_RESULT_SCHEMA: READINESS_DRY_RUN_RESULT_SCHEMA,
    TRANSPORT_READINESS_DRY_RUN_GATE: TRANSPORT_READINESS_DRY_RUN_GATE,
    TRANSPORT_CONTROLLED_APPLY_GATE: TRANSPORT_CONTROLLED_APPLY_GATE,
    APPLIED_TYPES: APPLIED_TYPES.slice(),
    SAME_ENVELOPES: SAME_ENVELOPES.slice(),
    GUARDS: GUARDS.slice(),
    FEATURE_FLAGS: FEATURE_FLAGS.slice()
  });
  H2O.Studio.sync.webdavTransportGates.__installed = true;
  H2O.Studio.sync.webdavTransportGates.__version = VERSION;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
