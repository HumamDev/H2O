/* H2O Desktop Sync - F14.6.13 snapshot execute readiness check
 *
 * Read-only proof that the Snapshot convergence surface exposes the shapes
 * needed by the future Snapshot execute adapter.
 *
 * Safety invariants:
 *   - API presence checks and synthetic redacted shape validation only.
 *   - Does not call Snapshot proposal, handoff, receipt, bookkeeping, proof,
 *     UI, or F5 review queue APIs because some of those surfaces can append
 *     ledgers or touch UI.
 *   - No Snapshot execute adapter, broker dispatch, publication dispatch,
 *     relay/outbox, Native execution, F5 execution, settlement, watermark
 *     write, consumed-op write, storage write, timer, or polling behavior.
 */
(function (global) {
  'use strict';

  function detectTauri() {
    try {
      if (typeof global.__TAURI_INTERNALS__ !== 'undefined') return true;
      if (typeof global.__TAURI__ !== 'undefined') return true;
      if (global.H2O && global.H2O.Studio && global.H2O.Studio.platform &&
          global.H2O.Studio.platform.env && global.H2O.Studio.platform.env.isTauri === true) return true;
    } catch (_) { /* ignore */ }
    return false;
  }
  if (!detectTauri()) return;

  var H2O = global.H2O = global.H2O || {};
  H2O.Desktop = H2O.Desktop || {};
  H2O.Desktop.Sync = H2O.Desktop.Sync || {};
  if (H2O.Desktop.Sync.__snapshotExecuteReadinessInstalled) return;

  var VERSION = '0.1.0-f14.6.13';
  var RESULT_SCHEMA = 'h2o.desktop.sync.snapshot-execute-readiness-result.v1';

  var REQUIRED_APIS = [
    { key: 'canonicalizer', name: 'canonicalizeSnapshot' },
    { key: 'preflight', name: 'runSnapshotConvergencePreflight' },
    { key: 'archiveProposal', name: 'generateSnapshotArchiveProposalCandidate' },
    { key: 'tombstoneProposal', name: 'generateSnapshotTombstoneProposalCandidate' },
    { key: 'restoreProposal', name: 'generateSnapshotRestoreProposalCandidate' },
    { key: 'archiveHandoff', name: 'previewSnapshotNativeArchiveHandoff' },
    { key: 'f5TombstoneHandoff', name: 'previewSnapshotF5TombstoneHandoff' },
    { key: 'restoreHandoff', name: 'previewSnapshotRestoreHandoff' },
    { key: 'archiveReceipt', name: 'buildSnapshotArchiveApplyEventReceipt' },
    { key: 'tombstoneReceipt', name: 'buildSnapshotTombstoneApplyEventReceipt' },
    { key: 'restoreReceipt', name: 'buildSnapshotRestoreApplyEventReceipt' },
    { key: 'recordBookkeeping', name: 'recordSnapshotConvergenceBookkeeping' },
    { key: 'listBookkeeping', name: 'listSnapshotConvergenceBookkeeping' },
    { key: 'proof', name: 'runSnapshotConvergenceProof' },
    { key: 'uiOpen', name: 'openSnapshotConvergencePanel' },
    { key: 'uiRefresh', name: 'refreshSnapshotConvergencePanel' },
    { key: 'f5Ingest', name: 'ingestF5Review' },
    { key: 'f5Decision', name: 'recordF5ReviewDecision' },
    { key: 'f5Expiry', name: 'evaluateF5ReviewExpiry' },
    { key: 'f5Close', name: 'closeF5Review' },
    { key: 'f5ListByState', name: 'listF5ReviewsByState' },
    { key: 'f5GetById', name: 'getF5ReviewById' },
    { key: 'f5StuckPostDecision', name: 'listF5ReviewsStuckPostDecision' }
  ];

  var REQUIRED_MARKERS = [
    '__snapshotCanonicalizerInstalled',
    '__snapshotPreflightInstalled',
    '__snapshotArchiveProposalInstalled',
    '__snapshotTombstoneProposalInstalled',
    '__snapshotRestoreProposalInstalled',
    '__snapshotNativeArchiveHandoffInstalled',
    '__snapshotF5TombstoneHandoffInstalled',
    '__snapshotRestoreHandoffInstalled',
    '__snapshotArchiveApplyEventInstalled',
    '__snapshotTombstoneApplyEventInstalled',
    '__snapshotRestoreApplyEventInstalled',
    '__snapshotBookkeepingInstalled',
    '__snapshotProofInstalled',
    '__snapshotConvergenceUiInstalled',
    '__snapshotF5ReviewQueueInstalled'
  ];

  var FOREVER_NO_FIELDS = [
    'snapshotId',
    'rawSnapshotId',
    'chatId',
    'rawChatId',
    'accountId',
    'rawAccountId',
    'model',
    'modelSlug',
    'modelVersion',
    'content',
    'body',
    'text',
    'messages',
    'message',
    'conversation',
    'transcript',
    'html',
    'markdown',
    'title',
    'name',
    'rawTitle',
    'sourceUrl',
    'url',
    'path',
    'href',
    'sourcePointer',
    'rawSourcePointer',
    'shareUrl',
    'shareToken',
    'token',
    'accessToken',
    'refreshToken',
    'password',
    'apiKey'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }
  function cleanLower(value) { return cleanString(value).toLowerCase(); }
  function addCode(list, code) {
    var normalized = cleanString(code);
    if (!normalized || list.indexOf(normalized) !== -1) return;
    list.push(normalized);
  }
  function codeList(value) {
    return asArray(value).map(function (item) {
      return isObject(item) ? cleanString(item.code) : cleanString(item);
    }).filter(Boolean).filter(function (code, index, arr) { return arr.indexOf(code) === index; });
  }
  function isSha256Hex(value) { return /^[0-9a-f]{64}$/.test(cleanLower(value)); }
  function isIso(value) {
    var text = cleanString(value);
    return !!text && Number.isFinite(Date.parse(text));
  }
  function digest(seed) {
    var map = {
      archive: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      tombstone: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      restore: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      apply: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      handoff: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      bookkeeping: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      f5: '1111111111111111111111111111111111111111111111111111111111111111',
      subject: '2222222222222222222222222222222222222222222222222222222222222222',
      lineage: '3333333333333333333333333333333333333333333333333333333333333333',
      dedupe: '4444444444444444444444444444444444444444444444444444444444444444'
    };
    return map[seed] || '5555555555555555555555555555555555555555555555555555555555555555';
  }

  function sideEffectSummary() {
    return {
      dispatchAttempted: false,
      relayOutboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      publicationDispatchTouched: false,
      publicationLedgerTouched: false,
      settlementExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      bookkeepingWritten: false,
      executeJournalTouched: false,
      storageWritten: false,
      uiTouched: false,
      timerScheduled: false,
      pollingStarted: false
    };
  }
  function allSideEffectsFalse(map) {
    var value = safeObject(map);
    return Object.keys(sideEffectSummary()).every(function (key) { return value[key] === false; });
  }

  function buildResult(opts) {
    opts = safeObject(opts);
    var blockers = codeList(opts.blockers);
    var warnings = codeList(opts.warnings);
    var ok = typeof opts.ok === 'boolean' ? opts.ok : blockers.length === 0;
    var payload = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: ok,
      actionable: ok,
      blockers: blockers,
      warnings: warnings,
      metadata: opts.metadata || {},
      readiness: opts.readiness || {},
      requiredApis: opts.requiredApis || [],
      requiredMarkers: opts.requiredMarkers || [],
      sideEffectSummary: sideEffectSummary()
    };
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.createResult === 'function') {
      try {
        var shaped = kernel.createResult({
          schema: RESULT_SCHEMA,
          ok: payload.ok,
          actionable: payload.actionable,
          blockers: payload.blockers,
          warnings: payload.warnings,
          metadata: payload.metadata,
          extra: {
            version: payload.version,
            readiness: payload.readiness,
            requiredApis: payload.requiredApis,
            requiredMarkers: payload.requiredMarkers,
            sideEffectSummary: payload.sideEffectSummary
          }
        });
        shaped.version = payload.version;
        shaped.readiness = payload.readiness;
        shaped.requiredApis = payload.requiredApis;
        shaped.requiredMarkers = payload.requiredMarkers;
        shaped.sideEffectSummary = payload.sideEffectSummary;
        return shaped;
      } catch (_) { /* fall through */ }
    }
    return payload;
  }

  function fieldForbidden(key, value) {
    var normalized = cleanString(key);
    if (!normalized) return false;
    if (FOREVER_NO_FIELDS.indexOf(normalized) !== -1) return true;
    if (/(^|_)(snapshotId|chatId|accountId)$/i.test(normalized)) return true;
    if (/(^|_)(content|body|text|messages|model)$/i.test(normalized)) return true;
    if (typeof value === 'string') {
      var text = cleanLower(value);
      if (text.indexOf('raw-snapshot-id') !== -1) return true;
      if (text.indexOf('raw-chat-id') !== -1) return true;
      if (text.indexOf('raw-account-id') !== -1) return true;
      if (text.indexOf('gpt-') !== -1) return true;
      if (/https?:\/\//.test(text)) return true;
    }
    return false;
  }

  function findForbiddenFields(value, path, out) {
    if (Array.isArray(value)) {
      value.forEach(function (item, index) { findForbiddenFields(item, path.concat(String(index)), out); });
      return out;
    }
    if (!isObject(value)) return out;
    Object.keys(value).forEach(function (key) {
      var nextPath = path.concat(key);
      var item = value[key];
      if (fieldForbidden(key, item)) out.push(nextPath.join('.'));
      findForbiddenFields(item, nextPath, out);
    });
    return out;
  }

  function scanPrivacy(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.scanPrivacy === 'function') {
      try {
        var result = kernel.scanPrivacy(value, {
          subjectType: 'snapshot.execute-readiness',
          redactionClass: 'redacted',
          foreverNoFields: FOREVER_NO_FIELDS,
          allowedRedactionClasses: ['redacted']
        });
        if (result && result.ok === false) {
          return {
            ok: false,
            findings: asArray(result.findings || result.forbiddenFields).map(function (item) {
              return isObject(item) ? cleanString(item.path || item.field || item.code) : cleanString(item);
            }).filter(Boolean)
          };
        }
      } catch (_) { /* fall through to local scan */ }
    }
    var findings = findForbiddenFields(value, [], []);
    return { ok: findings.length === 0, findings: findings };
  }

  function checkRequiredApis(sync, requiredApis) {
    return requiredApis.map(function (item) {
      var name = cleanString(item && item.name);
      var installed = !!name && typeof sync[name] === 'function';
      return { key: cleanString(item && item.key), name: name, installed: installed };
    });
  }

  function checkRequiredMarkers(sync, requiredMarkers) {
    return requiredMarkers.map(function (name) {
      name = cleanString(name);
      return { name: name, installed: sync[name] === true };
    });
  }

  function baseReceipt(kind, operationKind) {
    var now = '2026-01-01T00:00:00Z';
    var eventDigest = digest(kind);
    return {
      schema: 'h2o.desktop.sync.snapshot-' + kind + '-apply-event-receipt.v1',
      version: VERSION,
      ok: true,
      domainId: 'snapshot',
      operationKind: operationKind,
      subjectIdHash: digest('subject'),
      lineageIdHash: digest('lineage'),
      dedupeKey: 'snapshot:' + operationKind + ':' + digest('dedupe'),
      eventDigest: eventDigest,
      applyEvent: {
        schema: 'h2o.crossPlatform.apply-event.v1',
        domainId: 'snapshot',
        operationKind: operationKind,
        subjectIdHash: digest('subject'),
        lineageIdHash: digest('lineage'),
        eventDigest: digest('apply'),
        payload: {
          redactionClass: 'redacted',
          subjectDigest: digest('subject'),
          stateDigest: eventDigest
        },
        createdAtIso: now
      },
      auditMetadata: {
        schema: 'h2o.desktop.sync.snapshot-audit-metadata.v1',
        redactionClass: 'redacted',
        createdAtIso: now
      },
      auditRecord: {
        schema: 'h2o.desktop.sync.kernel.audit-record.v1',
        domainId: 'snapshot',
        operationKind: operationKind,
        eventDigest: eventDigest,
        createdAtIso: now
      },
      lifecycleState: {
        schema: 'h2o.desktop.sync.kernel.lifecycle-state.v1',
        subjectIdHash: digest('subject'),
        state: operationKind === 'restore' ? 'active' : operationKind
      },
      lifecycleTransition: {
        schema: 'h2o.desktop.sync.kernel.lifecycle-transition.v1',
        from: operationKind === 'restore' ? 'tombstoned' : 'active',
        to: operationKind === 'restore' ? 'active' : operationKind,
        eventDigest: eventDigest
      },
      proposedConsumedOperation: {
        schema: 'h2o.desktop.sync.kernel.consumed-operation-row.v1',
        domainId: 'snapshot',
        dedupeKey: 'snapshot:' + operationKind + ':' + digest('dedupe'),
        eventDigest: eventDigest,
        createdAtIso: now
      },
      proposedWatermarkTarget: {
        schema: 'h2o.desktop.sync.kernel.watermark-target.v1',
        domainId: 'snapshot',
        subjectIdHash: digest('subject'),
        eventDigest: eventDigest,
        observedAtIso: now
      },
      blockers: [],
      warnings: []
    };
  }

  function fixture(kind) {
    var operationKind = kind === 'archive' ? 'archive' : kind === 'restore' ? 'restore' : 'tombstone';
    var receipt = baseReceipt(kind, operationKind);
    var handoff = {
      schema: kind === 'tombstone'
        ? 'h2o.desktop.sync.snapshot-f5-tombstone-handoff-preview.v1'
        : 'h2o.desktop.sync.snapshot-native-' + operationKind + '-handoff-preview.v1',
      domainId: 'snapshot',
      operationKind: operationKind,
      handoffId: 'snapshot-' + operationKind + '-handoff',
      handoffDigest: digest('handoff'),
      subjectIdHash: digest('subject'),
      lineageIdHash: digest('lineage'),
      dedupeKey: receipt.dedupeKey,
      nativeCommand: kind === 'tombstone' ? '' : 'snapshot.' + operationKind,
      f5QueueKey: kind === 'tombstone' ? 'snapshot:f5:' + digest('f5') : '',
      createdAtIso: '2026-01-01T00:00:00Z'
    };
    var proposal = {
      schema: 'h2o.desktop.sync.snapshot-' + operationKind + '-proposal-candidate.v1',
      domainId: 'snapshot',
      operationKind: operationKind,
      proposalId: 'snapshot-' + operationKind + '-proposal',
      subjectIdHash: digest('subject'),
      lineageIdHash: digest('lineage'),
      dedupeKey: receipt.dedupeKey,
      eventDigest: receipt.eventDigest,
      createdAtIso: '2026-01-01T00:00:00Z'
    };
    var bookkeeping = {
      schema: 'h2o.desktop.sync.snapshot-convergence-bookkeeping-row.v1',
      domainId: 'snapshot',
      operationKind: operationKind,
      subjectIdHash: digest('subject'),
      lineageIdHash: digest('lineage'),
      dedupeKey: receipt.dedupeKey,
      proposalEventDigest: proposal.eventDigest,
      handoffId: handoff.handoffId,
      handoffDigest: handoff.handoffDigest,
      receiptEventDigest: receipt.eventDigest,
      applyEventDigest: receipt.applyEvent.eventDigest,
      createdAtIso: '2026-01-01T00:00:00Z'
    };
    if (kind === 'tombstone') {
      receipt.f5Evidence = {
        schema: 'h2o.desktop.sync.snapshot-f5-review-reference.v1',
        reviewId: 'snapshot-f5-review',
        f5QueueKey: handoff.f5QueueKey,
        decision: 'approved-seal',
        eventDigest: digest('f5')
      };
      receipt.proposedF5Record = receipt.f5Evidence;
      handoff.f5ReviewReference = receipt.f5Evidence;
    }
    return {
      proposalCandidate: proposal,
      handoffPreview: handoff,
      applyEventReceipt: receipt,
      bookkeepingRow: bookkeeping
    };
  }

  function hasReceiptPointers(item) {
    var receipt = safeObject(item.applyEventReceipt);
    var applyEvent = safeObject(receipt.applyEvent);
    return cleanString(receipt.domainId) === 'snapshot' &&
      !!cleanString(receipt.operationKind) &&
      isSha256Hex(receipt.subjectIdHash) &&
      isSha256Hex(receipt.lineageIdHash) &&
      !!cleanString(receipt.dedupeKey) &&
      isSha256Hex(receipt.eventDigest) &&
      cleanString(applyEvent.schema) === 'h2o.crossPlatform.apply-event.v1' &&
      cleanString(applyEvent.domainId) === 'snapshot' &&
      isSha256Hex(applyEvent.eventDigest);
  }

  function hasKernelShapes(item) {
    var receipt = safeObject(item.applyEventReceipt);
    return !!cleanString(safeObject(receipt.auditMetadata).schema) &&
      !!cleanString(safeObject(receipt.auditRecord).schema) &&
      !!cleanString(safeObject(receipt.lifecycleState).schema) &&
      !!cleanString(safeObject(receipt.lifecycleTransition).schema) &&
      !!cleanString(safeObject(receipt.proposedConsumedOperation).schema) &&
      !!cleanString(safeObject(receipt.proposedWatermarkTarget).schema);
  }

  function hasBookkeepingPointers(item) {
    var row = safeObject(item.bookkeepingRow);
    return cleanString(row.domainId) === 'snapshot' &&
      !!cleanString(row.operationKind) &&
      isSha256Hex(row.subjectIdHash) &&
      isSha256Hex(row.lineageIdHash) &&
      !!cleanString(row.dedupeKey) &&
      isSha256Hex(row.proposalEventDigest) &&
      !!cleanString(row.handoffId) &&
      isSha256Hex(row.handoffDigest) &&
      isSha256Hex(row.receiptEventDigest) &&
      isSha256Hex(row.applyEventDigest) &&
      isIso(row.createdAtIso);
  }

  function canConvertToExecuteInput(item) {
    var proposal = safeObject(item.proposalCandidate);
    var handoff = safeObject(item.handoffPreview);
    return hasReceiptPointers(item) &&
      cleanString(proposal.domainId) === 'snapshot' &&
      cleanString(handoff.domainId) === 'snapshot' &&
      cleanString(proposal.operationKind) === cleanString(safeObject(item.applyEventReceipt).operationKind) &&
      cleanString(handoff.operationKind) === cleanString(safeObject(item.applyEventReceipt).operationKind) &&
      !!cleanString(proposal.dedupeKey) &&
      !!cleanString(handoff.dedupeKey);
  }

  function hasF5ReviewReference(item) {
    var handoff = safeObject(item.handoffPreview);
    var receipt = safeObject(item.applyEventReceipt);
    var evidence = safeObject(receipt.f5Evidence || receipt.proposedF5Record || handoff.f5ReviewReference);
    return !!cleanString(handoff.f5QueueKey) &&
      !!cleanString(evidence.reviewId) &&
      !!cleanString(evidence.f5QueueKey) &&
      isSha256Hex(evidence.eventDigest);
  }

  function checkReadinessShapes(fixtures) {
    var blockers = [];
    var archive = safeObject(fixtures.archive);
    var restore = safeObject(fixtures.restore);
    var tombstone = safeObject(fixtures.tombstone);
    if (!canConvertToExecuteInput(archive)) addCode(blockers, 'snapshot-archive-execute-input-not-ready');
    if (!canConvertToExecuteInput(restore)) addCode(blockers, 'snapshot-restore-execute-input-not-ready');
    if (!canConvertToExecuteInput(tombstone)) addCode(blockers, 'snapshot-tombstone-execute-input-not-ready');
    if (!hasF5ReviewReference(tombstone)) addCode(blockers, 'snapshot-tombstone-f5-review-reference-missing');
    [archive, restore, tombstone].forEach(function (item) {
      if (!hasBookkeepingPointers(item)) addCode(blockers, 'snapshot-bookkeeping-pointers-missing');
      if (!hasKernelShapes(item)) addCode(blockers, 'snapshot-kernel-shaped-subobjects-missing');
    });
    return {
      ok: blockers.length === 0,
      blockers: blockers,
      archiveReady: canConvertToExecuteInput(archive),
      restoreReady: canConvertToExecuteInput(restore),
      tombstoneF5Ready: canConvertToExecuteInput(tombstone) && hasF5ReviewReference(tombstone),
      bookkeepingPointersReady: hasBookkeepingPointers(archive) && hasBookkeepingPointers(restore) && hasBookkeepingPointers(tombstone),
      kernelShapesReady: hasKernelShapes(archive) && hasKernelShapes(restore) && hasKernelShapes(tombstone)
    };
  }

  function cloneApiSurface(sync) {
    var clone = {};
    Object.keys(sync || {}).forEach(function (key) { clone[key] = sync[key]; });
    return clone;
  }

  function runInternal(options) {
    options = safeObject(options);
    var sync = safeObject(options.sync || H2O.Desktop.Sync);
    var requiredApis = asArray(options.requiredApis).length ? asArray(options.requiredApis) : REQUIRED_APIS;
    var requiredMarkers = asArray(options.requiredMarkers).length ? asArray(options.requiredMarkers) : REQUIRED_MARKERS;
    var fixtures = safeObject(options.fixtures);
    if (!fixtures.archive) fixtures.archive = fixture('archive');
    if (!fixtures.restore) fixtures.restore = fixture('restore');
    if (!fixtures.tombstone) fixtures.tombstone = fixture('tombstone');

    var blockers = [];
    var warnings = [];
    var apiStatus = checkRequiredApis(sync, requiredApis);
    var markerStatus = checkRequiredMarkers(sync, requiredMarkers);
    apiStatus.forEach(function (item) {
      if (!item.installed) addCode(blockers, 'snapshot-api-missing:' + item.name);
    });
    markerStatus.forEach(function (item) {
      if (!item.installed) addCode(blockers, 'snapshot-marker-missing:' + item.name);
    });

    var shapeStatus = checkReadinessShapes(fixtures);
    codeList(shapeStatus.blockers).forEach(function (code) { addCode(blockers, code); });

    var privacy = scanPrivacy(fixtures);
    if (!privacy.ok) addCode(blockers, 'snapshot-readiness-privacy-violation');
    if (!allSideEffectsFalse(sideEffectSummary())) addCode(blockers, 'snapshot-readiness-side-effect-flag-invalid');

    var readiness = {
      archiveReady: shapeStatus.archiveReady,
      restoreReady: shapeStatus.restoreReady,
      tombstoneF5Ready: shapeStatus.tombstoneF5Ready,
      allRequiredApisInstalled: apiStatus.every(function (item) { return item.installed; }),
      allRequiredMarkersInstalled: markerStatus.every(function (item) { return item.installed; }),
      bookkeepingPointersReady: shapeStatus.bookkeepingPointersReady,
      kernelShapesReady: shapeStatus.kernelShapesReady,
      privacySafe: privacy.ok,
      sideEffectsFalse: allSideEffectsFalse(sideEffectSummary()),
      missingApiSimulationBlocked: false,
      rawLeakSimulationBlocked: false
    };

    if (options.skipSimulations !== true) {
      var missingSync = cloneApiSurface(sync);
      missingSync.buildSnapshotArchiveApplyEventReceipt = null;
      var missingResult = runInternal({
        sync: missingSync,
        requiredApis: requiredApis,
        requiredMarkers: requiredMarkers,
        fixtures: fixtures,
        skipSimulations: true
      });
      readiness.missingApiSimulationBlocked = missingResult.ok === false &&
        missingResult.blockers.indexOf('snapshot-api-missing:buildSnapshotArchiveApplyEventReceipt') !== -1;
      if (!readiness.missingApiSimulationBlocked) addCode(blockers, 'snapshot-missing-api-simulation-failed');

      var leakedFixtures = {
        archive: fixture('archive'),
        restore: fixture('restore'),
        tombstone: fixture('tombstone')
      };
      leakedFixtures.archive.applyEventReceipt.snapshotId = 'raw-snapshot-id';
      var leakResult = runInternal({
        sync: sync,
        requiredApis: requiredApis,
        requiredMarkers: requiredMarkers,
        fixtures: leakedFixtures,
        skipSimulations: true
      });
      readiness.rawLeakSimulationBlocked = leakResult.ok === false &&
        leakResult.blockers.indexOf('snapshot-readiness-privacy-violation') !== -1;
      if (!readiness.rawLeakSimulationBlocked) addCode(blockers, 'snapshot-raw-leak-simulation-failed');
    }

    return buildResult({
      ok: blockers.length === 0,
      blockers: blockers,
      warnings: warnings,
      readiness: readiness,
      requiredApis: apiStatus,
      requiredMarkers: markerStatus,
      metadata: {
        phase: 'F14.6.13',
        behaviorChange: false,
        adapterImplemented: false,
        proofMode: options.skipSimulations === true ? 'internal' : 'runtime'
      }
    });
  }

  function runSnapshotExecuteReadinessCheck(options) {
    return runInternal(options || {});
  }

  H2O.Desktop.Sync.runSnapshotExecuteReadinessCheck = runSnapshotExecuteReadinessCheck;
  H2O.Desktop.Sync.__snapshotExecuteReadinessInstalled = true;
  H2O.Desktop.Sync.__snapshotExecuteReadinessVersion = VERSION;
})(typeof globalThis !== 'undefined' ? globalThis : window);
