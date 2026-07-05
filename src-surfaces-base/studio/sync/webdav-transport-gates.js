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
  H2O.Studio.sync.fullBundleTransportEnvelope = H2O.Studio.sync.fullBundleTransportEnvelope || {};
  if (H2O.Studio.sync.webdavTransportGates.__installed) return;

  var SCHEMA = 'h2o.studio.sync.webdav-transport-control-plane.v1';
  var VERSION = '0.1.0-phase30-dry-run';
  var ENVELOPE_VERSION = '0.1.0-phase32-v2-envelope-preflight';
  var DEV_ONLY_WRITE_FLAG = 'webdav-dev-only-do-not-ship';
  var ACTIVE_TRANSPORT = 'local-sync-folder-json';
  var FULL_BUNDLE_V2_SCHEMA = 'h2o.studio.fullBundle.v2';
  var READINESS_DRY_RUN_REQUEST_SCHEMA = 'h2o.studio.transport.webdav-readiness-dry-run-request.v1';
  var READINESS_DRY_RUN_RESULT_SCHEMA = 'h2o.studio.transport.webdav-readiness-dry-run-result.v1';
  var TRANSPORT_READINESS_DRY_RUN_GATE = 'webdav-transport-readiness-dry-run-evaluate';
  var CONTROLLED_WRITE_KILL_SWITCH_REQUEST_SCHEMA =
    'h2o.studio.transport.controlled-write-kill-switch-proof-request.v1';
  var CONTROLLED_WRITE_KILL_SWITCH_RESULT_SCHEMA =
    'h2o.studio.transport.controlled-write-kill-switch-proof-result.v1';
  var CONTROLLED_WRITE_KILL_SWITCH_GATE = 'webdav-controlled-write-kill-switch-evaluate';
  var CONTROLLED_LOCAL_MOCK_TRANSPORT_REQUEST_SCHEMA =
    'h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1';
  var CONTROLLED_LOCAL_MOCK_TRANSPORT_RESULT_SCHEMA =
    'h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1';
  var FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_REQUEST_SCHEMA =
    'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1';
  var FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_RESULT_SCHEMA =
    'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-result.v1';
  var FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE = 'fullbundle-v2-transport-envelope-preflight-evaluate';
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
      objectHash(input, 'peerTarget', ['peerTargetHash', 'peerIdHash', 'targetHash']) ||
      objectHash(input, 'target', ['peerTargetHash', 'peerIdHash', 'targetHash']);
  }

  function remoteRootHash(input) {
    return firstHash(input, ['remoteRootRefHash', 'remoteRootHash']) ||
      objectHash(input, 'remoteRootRef', ['remoteRootRefHash', 'remoteRootHash']) ||
      objectHash(input, 'target', ['remoteRootRefHash', 'remoteRootHash', 'remoteRootTargetHash']);
  }

  function transportPeerTargetHash(input) {
    return firstHash(input, ['peerTargetHash', 'peerIdHash', 'localMockTargetHash']) ||
      objectHash(input, 'candidate', ['peerTargetHash', 'peerIdHash', 'targetHash']) ||
      objectHash(input, 'peerTarget', ['peerTargetHash', 'peerIdHash', 'targetHash']) ||
      objectHash(input, 'target', ['peerTargetHash', 'peerIdHash', 'targetHash']);
  }

  function transportRemoteRootHash(input) {
    return firstHash(input, ['remoteRootRefHash', 'remoteRootHash']) ||
      objectHash(input, 'candidate', ['remoteRootRefHash', 'remoteRootHash', 'rootHash']) ||
      objectHash(input, 'remoteRootRef', ['remoteRootRefHash', 'remoteRootHash']) ||
      objectHash(input, 'target', ['remoteRootRefHash', 'remoteRootHash', 'remoteRootTargetHash', 'rootHash']);
  }

  function expectedProjectionCount(input) {
    var inp = safeObject(input);
    var candidate = safeObject(inp.candidate);
    var expectedBundle = safeObject(inp.expectedBundle);
    var projection = safeObject(inp.projection);
    var value = valueOrFallback(inp.fullBundleV2BindingProjectionCount,
      valueOrFallback(inp.bindingProjectionCount,
        valueOrFallback(candidate.expectedProjectionCount,
          valueOrFallback(candidate.projectionCount,
            valueOrFallback(expectedBundle.bindingProjectionCount,
              valueOrFallback(projection.bindingProjectionCount, projection.count))))));
    return integerOrNull(value);
  }

  function expectedProjectionHash(input) {
    return firstHash(input, [
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'fullBundleV2BindingProjectionHash'
    ]) || objectHash(input, 'expectedProjection', [
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'hash',
      'activeHash'
    ]) || objectHash(input, 'candidate', [
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'projectionHash',
      'payloadHash',
      'bundleHash',
      'hash'
    ]) || objectHash(input, 'expectedBundle', [
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'expectedHash',
      'hash',
      'activeHash'
    ]) || objectHash(input, 'projection', [
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'hash',
      'activeHash'
    ]);
  }

  function hasEnvelopeRawPrivateInput(input) {
    var inp = safeObject(input);
    var expectedBundle = safeObject(inp.expectedBundle);
    var expectedProjection = safeObject(inp.expectedProjection);
    var privateFound = hasRawPrivateInput(inp);
    var privateFields = [
      expectedBundle.rawChatTitle,
      expectedBundle.rawChatContent,
      expectedBundle.rawChatId,
      expectedBundle.rawFolderId,
      expectedBundle.rawFolderName,
      expectedBundle.rawPath,
      expectedProjection.rawChatTitle,
      expectedProjection.rawChatContent,
      expectedProjection.rawChatId,
      expectedProjection.rawFolderId,
      expectedProjection.rawFolderName,
      expectedProjection.rawPath
    ];
    return privateFound || privateFields.some(function (value) { return cleanString(value); });
  }

  function valueOrFallback(value, fallback) {
    return value === undefined ? fallback : value;
  }

  function safeToken(value, prefix) {
    var text = cleanString(value);
    if (!text) return '';
    return text.indexOf(prefix) === 0 ? text : '';
  }

  function evaluateTransportReadinessDryRun(request) {
    var inp = safeObject(request);
    var readiness = safeObject(inp.readiness);
    var expectedBundle = safeObject(inp.expectedBundle);
    var sequence = safeObject(inp.sequence);
    var target = safeObject(inp.target);
    var transport = safeObject(inp.transport);
    var safety = safeObject(inp.safety);
    var blockers = [];
    var warnings = [];
    var gate = cleanString(inp.gate);
    var targetMode = cleanString(target.mode);
    var localMockTarget = bool(inp.localMockTarget) || bool(target.localMockTarget) || targetMode === 'mock-peer';
    var peerHash = peerTargetHash(inp);
    var rootHash = remoteRootHash(inp);
    var bundleHash = firstHash(inp, [
      'candidatePayloadHash',
      'candidateBundleHash',
      'expectedBundleHash',
      'expectedContentSha256',
      'contentHash'
    ]) || objectHash(inp, 'expectedBundle', [
      'candidatePayloadHash',
      'candidateBundleHash',
      'expectedHash',
      'expectedBundleHash',
      'expectedContentSha256',
      'contentHash'
    ]);
    var checksumHash = firstHash(inp, ['expectedFileHash', 'fileHash', 'expectedChecksum', 'checksumHash']) ||
      objectHash(inp, 'expectedBundle', ['expectedFileHash', 'fileHash', 'expectedChecksum', 'checksumHash']);
    var expectedSeq = integerOrNull(valueOrFallback(inp.expectedSequenceNumber,
      valueOrFallback(sequence.expectedSequenceNumber, valueOrFallback(inp.sequenceNumber, sequence.sequenceNumber))));
    var previousSeq = integerOrNull(valueOrFallback(inp.previousSequenceNumber, sequence.previousSequenceNumber));
    var sequenceMode = cleanString(inp.sequenceMode || sequence.sequenceMode ||
      (sequence.mintNewExport === false && sequence.requireExistingOnly === true ? 'not-minted-in-dry-run' : ''));
    var privacy = privacyRedactionStatus(inp);
    var privacyObject = safeObject(inp.privacy);
    var privacyMode = cleanString(inp.privacyMode || privacyObject.mode || (privacyObject.hashOnly === true ? 'hash-only' : ''));
    var peerToken = safeToken(target.peerToken, 'peer:');
    var remoteRootToken = safeToken(target.remoteRootToken, 'root:');
    var peerTargetProvided = isObject(inp.peerTarget) || isObject(inp.target) || cleanString(inp.peerTargetHash) ||
      cleanString(inp.peerIdHash) || cleanString(inp.localMockTargetHash) || peerToken || localMockTarget;
    var remoteRootProvided = isObject(inp.remoteRootRef) || isObject(inp.target) || cleanString(inp.remoteRootRefHash) ||
      cleanString(inp.remoteRootHash) || remoteRootToken;
    var writeLikeRequested = bool(inp.writeRequested) || bool(inp.writesData) || bool(inp.writeData) ||
      bool(inp.writeWebDAV) || bool(inp.writesWebDAV) || bool(inp.webdavWrite) ||
      bool(inp.writesCloud) || bool(inp.cloudWrite) || bool(inp.remoteWriteAttempted) ||
      bool(transport.writeRemote) || bool(transport.writeWebDAV) || bool(transport.writeCloud);
    var relayRequested = bool(inp.writeRelay) || bool(inp.writesRelay) || bool(inp.relayEnqueueAttempted) ||
      bool(inp.enqueueRelay) || bool(inp.relayDispatchRequested) || bool(transport.enqueueRelay) ||
      bool(transport.writeRelay);
    var casRequested = bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.casWrite) ||
      bool(inp.chatSavingCasTouched) || bool(inp.chatSavingCasRequested) || bool(transport.touchChatSavingCAS) ||
      bool(transport.writeCAS);
    var fullBundleV3Requested = bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
      bool(inp.mintFullBundleV3) || bool(inp.fullBundleV3MintRequested) || bool(transport.startFullBundleV3) ||
      bool(transport.mintFullBundleV3);
    var cleanupRequested = bool(inp.cleanupAuthorityIntroduced) || bool(inp.cleanupApply) || bool(inp.cleanupRequested) ||
      bool(inp.a950MutationAttempted) || bool(inp.mutateA950) || bool(safety.cleanupAuthority) ||
      bool(safety.mutateA950);
    var exportMintRequested = bool(inp.exportIdMinted) || bool(inp.mintExportId) || cleanString(inp.mintedExportId) ||
      bool(sequence.mintNewExport);
    var requestedProductSyncReady = valueOrFallback(inp.productSyncReady, readiness.productSyncReady);
    var requestedTransportReady = valueOrFallback(inp.transportReady, readiness.transportReady);
    var requestedLocalExportableSyncReady = valueOrFallback(inp.localExportableSyncReady, readiness.localExportableSyncReady);
    var requestedTransportEligibility = valueOrFallback(inp.transportEligibilityFromLocalExportableReady,
      readiness.transportEligibilityFromLocalExportableReady);
    var casBlockedSupplied = inp.chatSavingCasBlocked === true || readiness.chatSavingCasBlocked === true ||
      transport.chatSavingCasBlocked === true || transport.touchChatSavingCAS === false;
    var a950VisibleSupplied = inp.a950DocumentedDebtVisible === true || inp.a950DocumentedDebtQuarantined === true ||
      readiness.a950DocumentedDebtVisible === true || readiness.a950DocumentedDebtQuarantined === true ||
      (safety.mutateA950 === false && safety.cleanupAuthority === false);

    if (!gate) addUnique(blockers, 'webdav-dry-run-gate-missing');
    else if (gate !== TRANSPORT_READINESS_DRY_RUN_GATE) addUnique(blockers, 'webdav-dry-run-gate-invalid');
    if (inp.dryRun !== true) addUnique(blockers, 'webdav-dry-run-required');
    if (inp.apply === true) addUnique(blockers, 'webdav-dry-run-apply-forbidden');
    if (requestedProductSyncReady !== false) addUnique(blockers, 'webdav-product-sync-ready-mismatch');
    if (requestedTransportReady !== false) addUnique(blockers, 'webdav-transport-ready-mismatch');
    if (requestedLocalExportableSyncReady !== true) addUnique(blockers, 'webdav-local-exportable-not-ready');
    if (requestedTransportEligibility !== true) addUnique(blockers, 'webdav-transport-eligibility-missing');
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
    if ((isObject(inp.peerTarget) || (isObject(inp.target) && targetMode !== 'mock-peer')) && !peerHash && !localMockTarget) {
      addUnique(blockers, 'webdav-peer-hash-required');
    }
    if (peerHash && localMockTarget) addUnique(blockers, 'webdav-peer-target-ambiguous');
    if (!localMockTarget && (!remoteRootProvided || !rootHash)) addUnique(blockers, 'webdav-remote-root-ambiguous');
    if (writeLikeRequested) addUnique(blockers, 'webdav-dry-run-remote-write-forbidden');
    if (relayRequested) addUnique(blockers, 'webdav-dry-run-relay-enqueue-forbidden');
    if (casRequested) addUnique(blockers, 'webdav-chat-saving-cas-boundary-violation');
    if (fullBundleV3Requested) addUnique(blockers, 'webdav-fullbundle-v3-start-forbidden');
    if (cleanupRequested) addUnique(blockers, 'webdav-cleanup-authority-forbidden');
    if (!casBlockedSupplied) addUnique(warnings, 'chat-saving-cas-blocked-flag-not-supplied');
    if (!a950VisibleSupplied) {
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
      localExportableSyncReady: requestedLocalExportableSyncReady === true,
      transportEligibilityFromLocalExportableReady: requestedTransportEligibility === true,
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

  function evaluateFullBundleV2TransportEnvelopePreflight(request) {
    var inp = safeObject(request);
    var readiness = safeObject(inp.readiness);
    var candidate = safeObject(inp.candidate);
    var expectedBundle = safeObject(inp.expectedBundle);
    var expectedProjection = safeObject(inp.expectedProjection);
    var sequence = safeObject(inp.sequence);
    var target = safeObject(inp.target);
    var transport = safeObject(inp.transport);
    var safety = safeObject(inp.safety);
    var privacyObject = safeObject(inp.privacy);
    var blockers = [];
    var gate = cleanString(inp.gate);
    var payloadSchema = cleanString(inp.payloadSchema || expectedBundle.schema || FULL_BUNDLE_V2_SCHEMA);
    var candidatePayloadHash = firstHash(inp, [
      'candidatePayloadHash',
      'fullBundleV2PayloadHash',
      'fullBundleV2BindingProjectionHash',
      'expectedBundleHash'
    ]) || objectHash(inp, 'candidate', [
      'candidatePayloadHash',
      'candidateBundleHash',
      'fullBundleV2PayloadHash',
      'payloadHash',
      'expectedProjectionHash',
      'expectedBindingProjectionHash',
      'bundleHash',
      'hash'
    ]) || objectHash(inp, 'expectedBundle', [
      'candidatePayloadHash',
      'candidateBundleHash',
      'expectedHash',
      'hash'
    ]);
    var candidateBundleHash = firstHash(inp, ['candidateBundleHash']) ||
      objectHash(inp, 'candidate', ['candidateBundleHash', 'bundleHash']) ||
      objectHash(inp, 'expectedBundle', ['candidateBundleHash', 'expectedHash', 'hash']);
    var candidateHash = candidatePayloadHash || candidateBundleHash;
    var checksumHash = firstHash(inp, ['checksumHash', 'expectedChecksumHash', 'expectedFileHash', 'fileHash']) ||
      objectHash(inp, 'expectedBundle', ['checksumHash', 'expectedChecksumHash', 'expectedFileHash', 'fileHash']) ||
      candidateBundleHash || candidateHash;
    var projectionHash = expectedProjectionHash(inp);
    var projectionCount = expectedProjectionCount(inp);
    var expectedCount = integerOrNull(valueOrFallback(inp.expectedBindingProjectionCount,
      valueOrFallback(candidate.expectedBindingProjectionCount,
        valueOrFallback(expectedBundle.expectedBindingProjectionCount, expectedProjection.expectedBindingProjectionCount))));
    var peerHash = transportPeerTargetHash(inp);
    var rootHash = transportRemoteRootHash(inp);
    var privacyMode = cleanString(inp.privacyMode || privacyObject.mode || (privacyObject.hashOnly === true ? 'hash-only' : ''));
    var sequenceMode = cleanString(inp.sequenceMode || sequence.sequenceMode ||
      (sequence.mintNewExport === false && sequence.burnSequence === false && sequence.requireExistingOnly === true ?
        'not-minted-in-dry-run' : ''));
    var expectedSeq = integerOrNull(valueOrFallback(inp.expectedSequenceNumber,
      valueOrFallback(sequence.expectedSequenceNumber, valueOrFallback(inp.sequenceNumber, sequence.sequenceNumber))));
    var previousSeq = integerOrNull(valueOrFallback(inp.previousSequenceNumber, sequence.previousSequenceNumber));
    var requestedProductSyncReady = valueOrFallback(inp.productSyncReady, readiness.productSyncReady);
    var requestedTransportReady = valueOrFallback(inp.transportReady, readiness.transportReady);
    var requestedLocalExportableSyncReady = valueOrFallback(inp.localExportableSyncReady,
      readiness.localExportableSyncReady);
    var requestedTransportEligibility = valueOrFallback(inp.transportEligibilityFromLocalExportableReady,
      readiness.transportEligibilityFromLocalExportableReady);
    var a950Quarantined = inp.a950DocumentedDebtQuarantined === true ||
      readiness.a950DocumentedDebtQuarantined === true ||
      inp.a950DocumentedDebtVisible === true ||
      readiness.a950DocumentedDebtVisible === true ||
      safety.a950DocumentedDebtQuarantined === true;
    var a950Leak = bool(inp.a950LeaksIntoExportablePayload) ||
      bool(expectedBundle.a950LeaksIntoExportablePayload) ||
      bool(expectedProjection.a950LeaksIntoExportablePayload) ||
      bool(safety.a950LeaksIntoExportablePayload);
    var payloadMutationRequested = bool(inp.mutatePayload) || bool(inp.payloadMutationRequested) ||
      bool(inp.alterFullBundleV2Payload) || bool(expectedBundle.mutatePayload) ||
      bool(expectedBundle.payloadMutationRequested) || bool(expectedBundle.alterFullBundleV2Payload) ||
      bool(candidate.mutatePayload) || bool(candidate.payloadMutationRequested) ||
      bool(candidate.alterFullBundleV2Payload);
    var writeLikeRequested = bool(inp.writeRequested) || bool(inp.writesData) || bool(inp.writeData) ||
      bool(inp.writeWebDAV) || bool(inp.writesWebDAV) || bool(inp.writeCloud) || bool(inp.writesCloud) ||
      bool(inp.writeRemote) || bool(transport.writeRemote) || bool(transport.writeWebDAV) ||
      bool(transport.writeCloud);
    var relayRequested = bool(inp.enqueueRelay) || bool(inp.enqueuesRelay) || bool(inp.writeRelay) ||
      bool(inp.writesRelay) || bool(transport.enqueueRelay) || bool(transport.writeRelay);
    var casRequested = bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.touchChatSavingCAS) ||
      bool(transport.touchChatSavingCAS) || bool(transport.writeCAS);
    var fileWriteRequested = bool(inp.writeFiles) || bool(inp.writesFiles) || bool(inp.writeFile) ||
      bool(transport.writeFiles) || bool(transport.writeFile);
    var fullBundleV3Requested = bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
      bool(inp.mintFullBundleV3) || bool(inp.fullBundleV3MintRequested) ||
      bool(transport.startFullBundleV3) || bool(transport.mintFullBundleV3) ||
      bool(candidate.startFullBundleV3) || bool(candidate.mintFullBundleV3) ||
      bool(candidate.fullBundleV3Required) || bool(candidate.fullBundleV3MintRequested);
    var exportMutationRequested = bool(inp.mutatesExportState) || bool(inp.mintExportId) ||
      bool(inp.mintsExportId) || bool(inp.burnsSequence) || bool(sequence.mintNewExport) ||
      bool(sequence.burnSequence);
    var cleanupRequested = bool(inp.cleanupAuthority) || bool(inp.cleanupApply) || bool(inp.cleanupRequested) ||
      bool(inp.a950MutationAttempted) || bool(inp.mutateA950) || bool(safety.cleanupAuthority) ||
      bool(safety.mutateA950);
    var targetAmbiguous = bool(inp.peerTargetAmbiguous) || bool(inp.targetAmbiguous) || bool(target.ambiguous);
    var rawPrivateInput = hasEnvelopeRawPrivateInput(inp) || bool(inp.rawPrivateFieldsLogged) ||
      bool(privacyObject.rawPrivateFieldsLogged);

    if (!gate) addUnique(blockers, 'fullbundle-v2-envelope-gate-missing');
    else if (gate !== FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE) {
      addUnique(blockers, 'fullbundle-v2-envelope-gate-invalid');
    }
    if (inp.dryRun !== true) addUnique(blockers, 'fullbundle-v2-envelope-dry-run-required');
    if (inp.apply === true) addUnique(blockers, 'fullbundle-v2-envelope-apply-forbidden');
    if (payloadSchema !== FULL_BUNDLE_V2_SCHEMA) addUnique(blockers, 'fullbundle-v2-envelope-schema-mismatch');
    if (!candidateHash || !checksumHash || !projectionHash || candidateHash !== checksumHash ||
        candidateHash !== projectionHash || (candidateBundleHash && candidateHash !== candidateBundleHash)) {
      addUnique(blockers, 'fullbundle-v2-envelope-checksum-mismatch');
    }
    if (projectionCount == null || expectedCount == null || projectionCount !== expectedCount) {
      addUnique(blockers, 'fullbundle-v2-envelope-projection-count-mismatch');
    }
    if (privacyMode !== 'hash-only' || privacyObject.hashOnly === false || rawPrivateInput) {
      addUnique(blockers, 'fullbundle-v2-envelope-private-input-rejected');
    }
    if (sequenceMode !== 'not-minted-in-dry-run') addUnique(blockers, 'fullbundle-v2-envelope-sequence-mismatch');
    if (expectedSeq != null && previousSeq != null && expectedSeq < previousSeq) {
      addUnique(blockers, 'fullbundle-v2-envelope-sequence-mismatch');
    }
    if (!peerHash || targetAmbiguous) addUnique(blockers, 'fullbundle-v2-envelope-peer-target-ambiguous');
    if (fullBundleV3Requested) addUnique(blockers, 'fullbundle-v2-envelope-fullbundle-v3-forbidden');
    if (payloadMutationRequested) addUnique(blockers, 'fullbundle-v2-envelope-payload-mutation-forbidden');
    if (exportMutationRequested) addUnique(blockers, 'fullbundle-v2-envelope-export-mutation-forbidden');
    if (writeLikeRequested) addUnique(blockers, 'fullbundle-v2-envelope-webdav-cloud-write-forbidden');
    if (relayRequested) addUnique(blockers, 'fullbundle-v2-envelope-relay-enqueue-forbidden');
    if (casRequested) addUnique(blockers, 'fullbundle-v2-envelope-cas-write-forbidden');
    if (fileWriteRequested) addUnique(blockers, 'fullbundle-v2-envelope-file-write-forbidden');
    if (a950Leak || !a950Quarantined) addUnique(blockers, 'fullbundle-v2-envelope-a950-leakage-blocked');
    if (requestedProductSyncReady !== false) addUnique(blockers, 'fullbundle-v2-envelope-product-sync-ready-mismatch');
    if (requestedTransportReady !== false) addUnique(blockers, 'fullbundle-v2-envelope-transport-ready-mismatch');
    if (requestedLocalExportableSyncReady !== true) addUnique(blockers, 'fullbundle-v2-envelope-local-exportable-not-ready');
    if (requestedTransportEligibility !== true) {
      addUnique(blockers, 'fullbundle-v2-envelope-transport-eligibility-missing');
    }
    if (cleanupRequested) addUnique(blockers, 'fullbundle-v2-envelope-cleanup-authority-forbidden');

    return {
      schema: FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_RESULT_SCHEMA,
      requestSchema: FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_REQUEST_SCHEMA,
      version: ENVELOPE_VERSION,
      ok: blockers.length === 0,
      status: blockers.length === 0 ? 'fullbundle-v2-transport-envelope-preflight-ready' :
        'blocked-fullbundle-v2-transport-envelope-preflight',
      reason: blockers.length === 0 ? 'fullbundle-v2-transport-envelope-preflight-ready' : blockers[0],
      gate: gate,
      gateSatisfied: gate === FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE,
      fullBundleV2EnvelopePreflight: true,
      selectedPayloadBoundary: 'fullBundle.v2-transport-envelope',
      payloadSchema: FULL_BUNDLE_V2_SCHEMA,
      fullBundleV3Required: false,
      fullBundleV3Deferred: true,
      fullBundleV3Started: false,
      payloadUnmodified: true,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReady: requestedLocalExportableSyncReady === true,
      localExportableSyncReadyIsAuthorization: false,
      transportEligibilityFromLocalExportableReady: requestedTransportEligibility === true,
      webdavCloudRelayBlocked: true,
      chatSavingCasBlocked: true,
      a950DocumentedDebtQuarantined: true,
      a950LeaksIntoExportablePayload: false,
      noCleanupAuthority: true,
      candidatePayloadHash: candidateHash,
      candidateBundleHash: candidateBundleHash || candidateHash,
      expectedProjectionHash: projectionHash,
      expectedProjectionCount: projectionCount,
      peerTargetHash: peerHash,
      remoteRootRefHash: rootHash,
      sequenceMode: sequenceMode || 'not-minted-in-dry-run',
      expectedSequenceNumber: expectedSeq,
      previousSequenceNumber: previousSeq,
      transportControlledApplyGateReserved: TRANSPORT_CONTROLLED_APPLY_GATE,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawPrivateFieldsLogged: false,
        rawInputRejected: rawPrivateInput
      },
      blockers: blockers,
      warnings: [],
      activeTransport: ACTIVE_TRANSPORT
    };
  }

  function evaluateControlledWriteKillSwitch(request) {
    var inp = safeObject(request);
    var readiness = safeObject(inp.readiness);
    var killSwitch = safeObject(inp.killSwitch || inp.controlledWriteKillSwitch);
    var controlled = safeObject(inp.controlled || inp.controlledTransport);
    var transport = safeObject(inp.transport);
    var safety = safeObject(inp.safety);
    var gate = cleanString(inp.gate);
    var proofBlockers = [];
    var controlledWriteBlockers = [];
    var modeledMissingKillSwitch = inp.killSwitchExists === false || killSwitch.exists === false ||
      bool(inp.modelMissingKillSwitch) || bool(killSwitch.modelMissing);
    var killSwitchExists = !modeledMissingKillSwitch;
    var killSwitchEnabled = killSwitchExists && (inp.killSwitchEnabled === true || killSwitch.enabled === true);
    var providedControlledGate = cleanString(inp.controlledGate || inp.controlledApplyGate ||
      controlled.gate || controlled.controlledGate || controlled.controlledApplyGate);
    var controlledGateProvided = !!providedControlledGate || bool(inp.controlledGateProvided) ||
      bool(controlled.controlledGateProvided);
    var requestedProductSyncReady = valueOrFallback(inp.productSyncReady, readiness.productSyncReady);
    var requestedTransportReady = valueOrFallback(inp.transportReady, readiness.transportReady);
    var requestedLocalExportableSyncReady = valueOrFallback(inp.localExportableSyncReady,
      readiness.localExportableSyncReady);
    var requestedTransportEligibility = valueOrFallback(inp.transportEligibilityFromLocalExportableReady,
      readiness.transportEligibilityFromLocalExportableReady);
    var writeLikeRequested = bool(inp.writeRequested) || bool(inp.writesData) || bool(inp.writeData) ||
      bool(inp.writeWebDAV) || bool(inp.writesWebDAV) || bool(inp.writeCloud) || bool(inp.writesCloud) ||
      bool(inp.writeRemote) || bool(transport.writeRemote) || bool(transport.writeWebDAV) ||
      bool(transport.writeCloud) || bool(controlled.writeWebDAV) || bool(controlled.writeCloud);
    var relayRequested = bool(inp.enqueueRelay) || bool(inp.enqueuesRelay) || bool(inp.writeRelay) ||
      bool(inp.writesRelay) || bool(transport.enqueueRelay) || bool(transport.writeRelay) ||
      bool(controlled.enqueueRelay) || bool(controlled.writeRelay);
    var casRequested = bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.touchChatSavingCAS) ||
      bool(transport.touchChatSavingCAS) || bool(transport.writeCAS) || bool(controlled.writeCAS) ||
      bool(controlled.touchChatSavingCAS);
    var fileWriteRequested = bool(inp.writeFiles) || bool(inp.writesFiles) || bool(inp.writeFile) ||
      bool(transport.writeFiles) || bool(transport.writeFile) || bool(controlled.writeFiles);
    var fullBundleV3Requested = bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
      bool(inp.mintFullBundleV3) || bool(transport.startFullBundleV3) || bool(transport.mintFullBundleV3) ||
      bool(controlled.startFullBundleV3) || bool(controlled.mintFullBundleV3);
    var exportMutationRequested = bool(inp.mutatesExportState) || bool(inp.mintExportId) ||
      bool(inp.mintsExportId) || bool(inp.burnsSequence) || bool(safeObject(inp.sequence).mintNewExport) ||
      bool(safeObject(inp.sequence).burnSequence) || bool(controlled.mutatesExportState) ||
      bool(controlled.mintExportId) || bool(controlled.burnsSequence);
    var cleanupRequested = bool(inp.cleanupAuthority) || bool(inp.cleanupApply) || bool(inp.cleanupRequested) ||
      bool(inp.a950MutationAttempted) || bool(inp.mutateA950) || bool(safety.cleanupAuthority) ||
      bool(safety.mutateA950) || bool(controlled.cleanupAuthority) || bool(controlled.mutateA950);

    if (!gate) addUnique(proofBlockers, 'transport-kill-switch-proof-gate-missing');
    else if (gate !== CONTROLLED_WRITE_KILL_SWITCH_GATE) {
      addUnique(proofBlockers, 'transport-kill-switch-proof-gate-invalid');
    }
    if (inp.dryRun !== true) addUnique(proofBlockers, 'transport-kill-switch-proof-dry-run-required');
    if (inp.apply === true) addUnique(proofBlockers, 'transport-kill-switch-proof-apply-forbidden');
    if (requestedProductSyncReady !== false) addUnique(proofBlockers, 'transport-kill-switch-product-sync-ready-mismatch');
    if (requestedTransportReady !== false) addUnique(proofBlockers, 'transport-kill-switch-transport-ready-mismatch');
    if (requestedLocalExportableSyncReady === true && bool(inp.localExportableSyncReadyIsAuthorization)) {
      addUnique(proofBlockers, 'transport-kill-switch-local-exportable-authorization-forbidden');
    }
    if (writeLikeRequested) addUnique(proofBlockers, 'transport-kill-switch-webdav-cloud-write-forbidden');
    if (relayRequested) addUnique(proofBlockers, 'transport-kill-switch-relay-enqueue-forbidden');
    if (casRequested) addUnique(proofBlockers, 'transport-kill-switch-cas-write-forbidden');
    if (fileWriteRequested) addUnique(proofBlockers, 'transport-kill-switch-file-write-forbidden');
    if (fullBundleV3Requested) addUnique(proofBlockers, 'transport-kill-switch-fullbundle-v3-forbidden');
    if (exportMutationRequested) addUnique(proofBlockers, 'transport-kill-switch-export-mutation-forbidden');
    if (cleanupRequested) addUnique(proofBlockers, 'transport-kill-switch-cleanup-authority-forbidden');

    if (!killSwitchExists) addUnique(controlledWriteBlockers, 'transport-controlled-write-kill-switch-missing');
    if (killSwitchExists && !killSwitchEnabled) {
      addUnique(controlledWriteBlockers, 'transport-controlled-write-kill-switch-disabled-by-default');
    }
    if (killSwitchEnabled && !controlledGateProvided) {
      addUnique(controlledWriteBlockers, 'transport-controlled-write-controlled-gate-required');
    }
    if (killSwitchEnabled && controlledGateProvided && providedControlledGate !== TRANSPORT_CONTROLLED_APPLY_GATE) {
      addUnique(controlledWriteBlockers, 'transport-controlled-write-controlled-gate-invalid');
    }
    if (killSwitchEnabled && controlledGateProvided && providedControlledGate === TRANSPORT_CONTROLLED_APPLY_GATE) {
      addUnique(controlledWriteBlockers, 'transport-controlled-write-implementation-not-present');
      addUnique(controlledWriteBlockers, 'transport-controlled-apply-gate-reserved-only');
    }

    return {
      schema: CONTROLLED_WRITE_KILL_SWITCH_RESULT_SCHEMA,
      requestSchema: CONTROLLED_WRITE_KILL_SWITCH_REQUEST_SCHEMA,
      version: VERSION,
      ok: proofBlockers.length === 0,
      status: proofBlockers.length === 0 ? 'transport-controlled-write-kill-switch-proof-ready' :
        'blocked-transport-controlled-write-kill-switch-proof',
      reason: proofBlockers.length === 0 ? 'transport-controlled-write-kill-switch-proof-ready' : proofBlockers[0],
      gate: gate,
      gateSatisfied: gate === CONTROLLED_WRITE_KILL_SWITCH_GATE,
      controlledWriteKillSwitchProof: true,
      dryRun: true,
      applyRequested: false,
      killSwitchExists: killSwitchExists,
      killSwitchDefaultEnabled: false,
      killSwitchEnabled: killSwitchEnabled,
      killSwitchSeparateFromProductSyncReady: true,
      killSwitchSeparateFromTransportReady: true,
      killSwitchSeparateFromLocalExportableSyncReady: true,
      killSwitchSeparateFromTransportEligibility: true,
      controlledWritesBlocked: true,
      controlledWriteBlockers: controlledWriteBlockers,
      controlledTransportImplementationPresent: false,
      reservedControlledGate: TRANSPORT_CONTROLLED_APPLY_GATE,
      transportControlledApplyGateReserved: TRANSPORT_CONTROLLED_APPLY_GATE,
      transportControlledApplyGateUsable: false,
      reservedControlledGateUsable: false,
      writesData: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReady: requestedLocalExportableSyncReady === true,
      transportEligibilityFromLocalExportableReady: requestedTransportEligibility === true,
      localExportableSyncReadyIsAuthorization: false,
      webdavCloudRelayBlocked: true,
      chatSavingCasBlocked: true,
      a950DocumentedDebtQuarantined: true,
      noCleanupAuthority: true,
      blockers: proofBlockers,
      warnings: [],
      activeTransport: ACTIVE_TRANSPORT
    };
  }

  function approvalAccepted(approval, expected, mode) {
    var app = safeObject(approval);
    if (app.approved !== true) return false;
    if (mode === 'apply' &&
        (app.reviewedTransportApplyApproved !== true || app.controlledLocalMockApplyApproved !== true)) {
      return false;
    }
    if (mode === 'dry-run' && app.reviewedTransportDryRunApproved !== true) return false;
    if (cleanString(app.scope) !== 'local-mock-webdav-target-only') return false;
    if (cleanString(app.controlledGate || app.gate) !== TRANSPORT_CONTROLLED_APPLY_GATE) return false;
    if (app.killSwitchEnabled !== true && expected.killSwitchEnabled !== true) return false;
    if (hashLike(app.idempotencyKeyHash || app.idempotencyKey) &&
        hashLike(app.idempotencyKeyHash || app.idempotencyKey) !== expected.idempotencyKeyHash) return false;
    if (hashLike(app.candidatePayloadHash || app.payloadHash) &&
        hashLike(app.candidatePayloadHash || app.payloadHash) !== expected.candidatePayloadHash) return false;
    if (hashLike(app.candidateBundleHash || app.bundleHash) &&
        hashLike(app.candidateBundleHash || app.bundleHash) !== expected.candidateBundleHash) return false;
    if (hashLike(app.peerTargetHash) && hashLike(app.peerTargetHash) !== expected.peerTargetHash) return false;
    if (hashLike(app.remoteRootRefHash || app.remoteRootHash) &&
        hashLike(app.remoteRootRefHash || app.remoteRootHash) !== expected.remoteRootRefHash) return false;
    if (app.productSyncReady !== false || app.transportReady !== false) return false;
    if (app.noChatSavingCas !== true && app.noChatSavingCAS !== true) return false;
    if (app.noFullBundleV3 !== true || app.noA950Mutation !== true) return false;
    if (app.privacyHashOnly !== true) return false;
    return true;
  }

  function evaluateControlledLocalMockTransport(request) {
    var inp = safeObject(request);
    var readiness = safeObject(inp.readiness);
    var killSwitch = safeObject(inp.killSwitch || inp.controlledWriteKillSwitch);
    var approval = safeObject(inp.operatorApproval || inp.approval || inp.manualApproval);
    var candidate = safeObject(inp.candidate);
    var target = safeObject(inp.target);
    var sequence = safeObject(inp.sequence);
    var transport = safeObject(inp.transport);
    var safety = safeObject(inp.safety);
    var privacyObject = safeObject(inp.privacy);
    var duplicateReplay = safeObject(inp.duplicateReplay);
    var restart = safeObject(inp.restart);
    var blockers = [];
    var gate = cleanString(inp.gate || inp.controlledGate || inp.controlledApplyGate);
    var dryRun = inp.dryRun === true;
    var applyRequested = inp.apply === true;
    var killSwitchEnabled = killSwitch.enabled === true || inp.killSwitchEnabled === true;
    var targetMode = cleanString(inp.targetMode || target.mode);
    var localMockTarget = targetMode === 'local-mock-webdav' || targetMode === 'mock-peer' ||
      target.localMockTarget === true || inp.localMockTarget === true;
    var candidatePayloadHash = firstHash(inp, ['candidatePayloadHash', 'payloadHash']) ||
      objectHash(inp, 'candidate', ['candidatePayloadHash', 'payloadHash', 'hash']);
    var candidateBundleHash = firstHash(inp, ['candidateBundleHash', 'bundleHash']) ||
      objectHash(inp, 'candidate', ['candidateBundleHash', 'bundleHash', 'hash']);
    var idempotencyKeyHash = firstHash(inp, ['idempotencyKeyHash']) ||
      firstHash(inp, ['idempotencyKey']) ||
      objectHash(inp, 'idempotency', ['idempotencyKeyHash', 'keyHash', 'idempotencyKey', 'key']) ||
      objectHash(inp, 'candidate', ['idempotencyKeyHash', 'idempotencyKey']);
    var peerHash = transportPeerTargetHash(inp);
    var rootHash = transportRemoteRootHash(inp);
    var requestedProductSyncReady = valueOrFallback(inp.productSyncReady, readiness.productSyncReady);
    var requestedTransportReady = valueOrFallback(inp.transportReady, readiness.transportReady);
    var requestedLocalExportableSyncReady = valueOrFallback(inp.localExportableSyncReady,
      readiness.localExportableSyncReady);
    var requestedTransportEligibility = valueOrFallback(inp.transportEligibilityFromLocalExportableReady,
      readiness.transportEligibilityFromLocalExportableReady);
    var privacyMode = cleanString(inp.privacyMode || privacyObject.mode || (privacyObject.hashOnly === true ? 'hash-only' : ''));
    var rawPrivateInput = hasEnvelopeRawPrivateInput(inp) || bool(inp.rawPrivateFieldsLogged) ||
      bool(privacyObject.rawPrivateFieldsLogged);
    var sequenceMode = cleanString(inp.sequenceMode || sequence.sequenceMode ||
      (sequence.mintNewExport === false && sequence.burnSequence === false && sequence.requireExistingOnly === true ?
        'not-minted-in-controlled-mock' : ''));
    var writeLikeRequested = bool(inp.realWebDAVWrite) || bool(inp.writeWebDAV) || bool(inp.writesWebDAV) ||
      bool(inp.writeCloud) || bool(inp.writesCloud) || bool(inp.writeRemote) || bool(transport.writeWebDAV) ||
      bool(transport.writeCloud) || bool(transport.writeRemote);
    var realTargetRequested = targetMode === 'webdav' || targetMode === 'real-webdav' || targetMode === 'cloud' ||
      bool(target.realWebDAVTarget) || bool(inp.realWebDAVTarget);
    var relayRequested = bool(inp.enqueueRelay) || bool(inp.enqueuesRelay) || bool(inp.writeRelay) ||
      bool(inp.writesRelay) || bool(transport.enqueueRelay) || bool(transport.writeRelay);
    var casRequested = bool(inp.writeCAS) || bool(inp.writesCAS) || bool(inp.touchChatSavingCAS) ||
      bool(transport.touchChatSavingCAS) || bool(transport.writeCAS);
    var fileWriteRequested = bool(inp.writeFiles) || bool(inp.writesFiles) || bool(inp.writeFile) ||
      bool(transport.writeFiles) || bool(transport.writeFile);
    var fullBundleV3Requested = bool(inp.fullBundleV3Started) || bool(inp.startFullBundleV3) ||
      bool(inp.mintFullBundleV3) || bool(transport.startFullBundleV3) || bool(transport.mintFullBundleV3);
    var exportMutationRequested = bool(inp.mutatesExportState) || bool(inp.mintExportId) ||
      bool(inp.mintsExportId) || bool(inp.burnsSequence) || bool(sequence.mintNewExport) ||
      bool(sequence.burnSequence);
    var cleanupRequested = bool(inp.cleanupAuthority) || bool(inp.cleanupApply) || bool(inp.cleanupRequested) ||
      bool(inp.a950MutationAttempted) || bool(inp.mutateA950) || bool(safety.cleanupAuthority) ||
      bool(safety.mutateA950);
    var approvalExpected = {
      idempotencyKeyHash: idempotencyKeyHash,
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      peerTargetHash: peerHash,
      remoteRootRefHash: rootHash,
      killSwitchEnabled: killSwitchEnabled
    };
    var dryRunApprovalOk = approvalAccepted(approval, approvalExpected, 'dry-run');
    var applyApprovalOk = approvalAccepted(approval, approvalExpected, 'apply');
    var approvalOk = dryRun ? dryRunApprovalOk : (applyRequested ? applyApprovalOk : false);
    var duplicateSameKey = duplicateReplay.sameIdempotencyKey === true ||
      (duplicateReplay.samePayloadTargetSequence === true && !!idempotencyKeyHash);
    var duplicateZeroWrite = duplicateSameKey && duplicateReplay.samePayloadTargetSequence === true &&
      duplicateReplay.expectZeroWrite === true;
    var duplicateReplayed = duplicateReplay.replayed === true;
    var restartFailClosed = restart.expectFailClosed === true &&
      restart.allowDispatchWithoutControlledGate !== true &&
      (restart.simulateReload === true || restart.simulateBootResume === true || restart.failClosedMode === true ||
        applyRequested === true || dryRun === true);

    if (!dryRun && !applyRequested) addUnique(blockers, 'controlled-local-mock-dry-run-or-apply-required');
    if (dryRun && applyRequested) addUnique(blockers, 'controlled-local-mock-dry-run-apply-conflict');
    if (applyRequested && !killSwitchEnabled) addUnique(blockers, 'controlled-local-mock-kill-switch-disabled');
    if (gate !== TRANSPORT_CONTROLLED_APPLY_GATE) addUnique(blockers, 'controlled-local-mock-controlled-gate-required');
    if (applyRequested && !applyApprovalOk) addUnique(blockers, 'controlled-local-mock-operator-approval-required');
    if (!idempotencyKeyHash) addUnique(blockers, 'controlled-local-mock-idempotency-key-required');
    if (!candidatePayloadHash || !candidateBundleHash || candidatePayloadHash !== candidateBundleHash) {
      addUnique(blockers, 'controlled-local-mock-payload-hash-mismatch');
    }
    if (!peerHash || !rootHash || !localMockTarget || realTargetRequested || target.ambiguous === true) {
      addUnique(blockers, 'controlled-local-mock-target-required');
    }
    if (requestedProductSyncReady !== false) addUnique(blockers, 'controlled-local-mock-product-sync-ready-mismatch');
    if (requestedTransportReady !== false) addUnique(blockers, 'controlled-local-mock-transport-ready-mismatch');
    if (requestedLocalExportableSyncReady !== true) addUnique(blockers, 'controlled-local-mock-local-exportable-not-ready');
    if (requestedTransportEligibility !== true) addUnique(blockers, 'controlled-local-mock-transport-eligibility-missing');
    if (privacyMode !== 'hash-only' || privacyObject.hashOnly === false || rawPrivateInput) {
      addUnique(blockers, 'controlled-local-mock-private-input-rejected');
    }
    if (!duplicateZeroWrite) addUnique(blockers, 'controlled-local-mock-duplicate-replay-proof-required');
    if (!restartFailClosed) addUnique(blockers, 'controlled-local-mock-restart-fail-closed-proof-required');
    if (sequenceMode !== 'not-minted-in-controlled-mock') addUnique(blockers, 'controlled-local-mock-sequence-mismatch');
    if (writeLikeRequested || realTargetRequested) addUnique(blockers, 'controlled-local-mock-real-webdav-cloud-write-forbidden');
    if (relayRequested) addUnique(blockers, 'controlled-local-mock-relay-enqueue-forbidden');
    if (casRequested) addUnique(blockers, 'controlled-local-mock-cas-write-forbidden');
    if (fileWriteRequested) addUnique(blockers, 'controlled-local-mock-file-write-forbidden');
    if (fullBundleV3Requested) addUnique(blockers, 'controlled-local-mock-fullbundle-v3-forbidden');
    if (exportMutationRequested) addUnique(blockers, 'controlled-local-mock-export-mutation-forbidden');
    if (cleanupRequested) addUnique(blockers, 'controlled-local-mock-cleanup-authority-forbidden');

    return {
      schema: CONTROLLED_LOCAL_MOCK_TRANSPORT_RESULT_SCHEMA,
      requestSchema: CONTROLLED_LOCAL_MOCK_TRANSPORT_REQUEST_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      status: blockers.length === 0 ?
        (applyRequested ? 'controlled-local-mock-webdav-transport-applied' :
          'controlled-local-mock-webdav-transport-dry-run-ready') :
        'blocked-controlled-local-mock-webdav-transport',
      reason: blockers.length === 0 ? 'controlled-local-mock-webdav-transport-ready' : blockers[0],
      controlledMockTransport: true,
      targetMode: 'local-mock-webdav',
      gate: gate,
      gateSatisfied: gate === TRANSPORT_CONTROLLED_APPLY_GATE,
      dryRun: dryRun,
      applyRequested: applyRequested,
      killSwitchEnabled: killSwitchEnabled,
      operatorApprovalAccepted: approvalOk,
      operatorDryRunApprovalAccepted: dryRunApprovalOk,
      operatorApplyApprovalAccepted: applyApprovalOk,
      localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk,
      realTransportApprovalAccepted: false,
      controlledApplyGate: TRANSPORT_CONTROLLED_APPLY_GATE,
      reservedControlledGateUsedForLocalMockOnly: gate === TRANSPORT_CONTROLLED_APPLY_GATE && localMockTarget,
      controlledMockTransportImplementationPresent: true,
      controlledTransportScope: 'local-mock-webdav-target-only',
      modeledMockApply: blockers.length === 0 && applyRequested,
      modeledMockWriteCount: blockers.length === 0 && applyRequested && !duplicateReplayed ? 1 : 0,
      realWebDAVWrite: false,
      writesWebDAV: false,
      writesCloud: false,
      writesRelay: false,
      enqueuesRelay: false,
      writesCAS: false,
      writesFiles: false,
      mutatesExportState: false,
      mintsExportId: false,
      burnsSequence: false,
      fullBundleV3Started: false,
      productSyncReady: false,
      transportReady: false,
      localExportableSyncReady: requestedLocalExportableSyncReady === true,
      transportEligibilityFromLocalExportableReady: requestedTransportEligibility === true,
      localExportableSyncReadyIsAuthorization: false,
      duplicateReplayZeroWrite: duplicateZeroWrite,
      restartFailClosed: restartFailClosed,
      bootResumeDispatch: false,
      webdavCloudRelayBlocked: true,
      chatSavingCasBlocked: true,
      a950DocumentedDebtQuarantined: true,
      noCleanupAuthority: true,
      idempotencyKeyHash: idempotencyKeyHash,
      candidatePayloadHash: candidatePayloadHash,
      candidateBundleHash: candidateBundleHash,
      peerTargetHash: peerHash,
      remoteRootRefHash: rootHash,
      privacy: {
        redacted: true,
        hashOnly: true,
        rawPrivateFieldsLogged: false,
        rawInputRejected: rawPrivateInput
      },
      blockers: blockers,
      warnings: [],
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
      controlledWriteKillSwitchExists: true,
      controlledWriteKillSwitchDefaultEnabled: false,
      controlledWriteKillSwitchGate: CONTROLLED_WRITE_KILL_SWITCH_GATE,
      transportControlledApplyGateUsable: false,
      controlledLocalMockTransportApiAvailable: true,
      controlledLocalMockTransportScope: 'local-mock-webdav-target-only',
      realWebDAVTransportAvailable: false,
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
  H2O.Studio.sync.webdavTransportGates.evaluateControlledWriteKillSwitch = evaluateControlledWriteKillSwitch;
  H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport =
    evaluateControlledLocalMockTransport;
  H2O.Studio.sync.webdavTransportGates.diagnose = diagnose;
  H2O.Studio.sync.webdavTransportGates.constants = Object.freeze({
    SCHEMA: SCHEMA,
    VERSION: VERSION,
    DEV_ONLY_WRITE_FLAG: DEV_ONLY_WRITE_FLAG,
    ACTIVE_TRANSPORT: ACTIVE_TRANSPORT,
    READINESS_DRY_RUN_REQUEST_SCHEMA: READINESS_DRY_RUN_REQUEST_SCHEMA,
    READINESS_DRY_RUN_RESULT_SCHEMA: READINESS_DRY_RUN_RESULT_SCHEMA,
    TRANSPORT_READINESS_DRY_RUN_GATE: TRANSPORT_READINESS_DRY_RUN_GATE,
    CONTROLLED_WRITE_KILL_SWITCH_REQUEST_SCHEMA: CONTROLLED_WRITE_KILL_SWITCH_REQUEST_SCHEMA,
    CONTROLLED_WRITE_KILL_SWITCH_RESULT_SCHEMA: CONTROLLED_WRITE_KILL_SWITCH_RESULT_SCHEMA,
    CONTROLLED_WRITE_KILL_SWITCH_GATE: CONTROLLED_WRITE_KILL_SWITCH_GATE,
    CONTROLLED_LOCAL_MOCK_TRANSPORT_REQUEST_SCHEMA: CONTROLLED_LOCAL_MOCK_TRANSPORT_REQUEST_SCHEMA,
    CONTROLLED_LOCAL_MOCK_TRANSPORT_RESULT_SCHEMA: CONTROLLED_LOCAL_MOCK_TRANSPORT_RESULT_SCHEMA,
    TRANSPORT_CONTROLLED_APPLY_GATE: TRANSPORT_CONTROLLED_APPLY_GATE,
    APPLIED_TYPES: APPLIED_TYPES.slice(),
    SAME_ENVELOPES: SAME_ENVELOPES.slice(),
    GUARDS: GUARDS.slice(),
    FEATURE_FLAGS: FEATURE_FLAGS.slice()
  });
  H2O.Studio.sync.webdavTransportGates.__installed = true;
  H2O.Studio.sync.webdavTransportGates.__version = VERSION;

  H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight =
    evaluateFullBundleV2TransportEnvelopePreflight;
  H2O.Studio.sync.fullBundleTransportEnvelope.constants = Object.freeze({
    FULL_BUNDLE_V2_SCHEMA: FULL_BUNDLE_V2_SCHEMA,
    FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_REQUEST_SCHEMA: FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_REQUEST_SCHEMA,
    FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_RESULT_SCHEMA: FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_RESULT_SCHEMA,
    FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE: FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE,
    TRANSPORT_CONTROLLED_APPLY_GATE: TRANSPORT_CONTROLLED_APPLY_GATE,
    ACTIVE_TRANSPORT: ACTIVE_TRANSPORT
  });

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
