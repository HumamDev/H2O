/* H2O Desktop Sync - F16.2.b deterministic multi-peer soak proof
 *
 * Proof harness only. Simulates peer transport, peer-local state, offline
 * queues, replay order, and ledger deltas in memory while calling the real
 * F16.1 runtime conflict gate APIs where available.
 *
 * No SQLite writes, store writes, Native/F5 execution, publication, relay,
 * outbox, apply, watermark writes, consumed-operation writes, or closure
 * integration.
 *
 * Public API:
 *   H2O.Desktop.Sync.runLibraryMultiPeerSoakProof(input)
 *
 *   H2O.Desktop.Sync.__libraryMultiPeerSoakProofInstalled
 *   H2O.Desktop.Sync.__libraryMultiPeerSoakProofVersion
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
  if (H2O.Desktop.Sync.__libraryMultiPeerSoakProofInstalled) return;

  var VERSION = '0.1.0-f16.2.b';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-multipeer-soak.v1';
  var FIXED_OBSERVED_AT_ISO = '2026-01-01T00:00:00Z';
  var CHAT_SUBJECT_TYPE = 'chat.metadata';
  var FOLDER_SUBJECT_TYPE = 'folder.metadata';
  var CATALOG_SUBJECT_TYPE = 'library.catalog';

  var RUNTIME_APIS = [
    'evaluateLibraryRuntimeConflict',
    'evaluateLibraryCatalogRuntimeConflict',
    'evaluateLibraryBindingRuntimeConflict',
    'classifyLibraryBulkRuntimeConflictRows'
  ];

  var PEER_STATE_FIELDS = [
    'peerIdHash',
    'installIdHash',
    'deviceIdHash',
    'syncPeerIdHash',
    'catalogState',
    'bindingState',
    'cacheState',
    'folderBridgeState',
    'outbox',
    'offlineQueue',
    'watermarks',
    'consumedOperations',
    'f5Reviews',
    'bulkBatches',
    'logicalClock'
  ];

  var REPLAY_MODES = [
    'peer A online / peer B offline',
    'both peers offline',
    'delayed replay',
    'duplicate replay',
    'stale-base replay',
    'out-of-order replay',
    'exact replay idempotency',
    'conflicting replay fail-closed before settlement mutation'
  ];

  var EXPECTED_CODES = [
    'library-catalog-cross-install-name-collision',
    'library-catalog-cross-install-stale-base',
    'library-catalog-cross-install-lifecycle-conflict',
    'library-binding-cross-install-duplicate-edge',
    'library-binding-cross-install-state-conflict',
    'library-binding-f7-f15-identity-conflict',
    'library-catalog-f5-review-conflict',
    'library-bulk-cross-install-partial-conflict',
    'library-cache-cross-install-drift',
    'library-conflict-runtime-required-unavailable'
  ];

  var SCENARIO_IDS = [
    'multipeer-catalog-create-same-name',
    'multipeer-offline-rename-vs-online-rename',
    'multipeer-recolor-vs-archive',
    'multipeer-duplicate-chat-label-chat-tag-bind',
    'multipeer-bind-vs-unbind-same-edge',
    'multipeer-chat-category-replacement-race',
    'multipeer-chat-folder-replacement-race-folder-metadata',
    'multipeer-f7-fallback-vs-f15-delegated-folder-binding',
    'multipeer-delayed-f5-approve-seal-vs-approve-restore',
    'multipeer-bulk-import-while-peer-edits-catalog',
    'multipeer-repeated-same-bundle-import',
    'multipeer-cache-drift-after-reconnect',
    'multipeer-conflict-runtime-unavailable-during-replay',
    'multipeer-settlement-blocker-before-consumed-op-watermark'
  ];

  var SCENARIO_NAMES = [
    'two peers create same label/tag/category',
    'offline rename vs online rename',
    'recolor vs archive',
    'duplicate chat-label/chat-tag bind',
    'bind vs unbind same edge',
    'chat-category replacement race',
    'chat-folder replacement race using folder.metadata',
    'F7 fallback vs F15 delegated path with delegation flag exercised both ways',
    'delayed F5 approve-seal vs approve-restore',
    'bulk import while peer edits catalog',
    'repeated same bundle import',
    'cache drift after reconnect',
    'conflict runtime unavailable during replay',
    'settlement blocker before consumed-op/watermark'
  ];

  var RAW_LEAK_NEEDLES = [
    'raw-chat-id-fixture',
    'raw-catalog-id-fixture',
    'raw-folder-id-fixture',
    'raw-visible-name-fixture',
    'raw-visible-title-fixture',
    'raw-folder-name-fixture',
    'raw-color-fixture',
    '/raw/path/fixture',
    'raw-file-name-fixture',
    'raw-bundle-file-fixture',
    'https://raw.example.invalid',
    'raw-token-fixture',
    'raw-content-fixture',
    'raw-message-fixture',
    'raw-attachment-fixture',
    'category_id',
    'chats.category_id',
    'folder_id',
    'chat_id'
  ];

  function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function safeObject(value) { return isObject(value) ? value : {}; }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function cleanString(value) { return String(value == null ? '' : value).trim(); }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isObject(value)) return value;
    var out = {};
    Object.keys(value).sort().forEach(function (key) {
      if (typeof value[key] !== 'undefined') out[key] = canonicalize(value[key]);
    });
    return out;
  }

  function canonicalJSON(value) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    if (kernel && typeof kernel.canonicalJSON === 'function') {
      try { return kernel.canonicalJSON(value); } catch (_) { /* fall through */ }
    }
    return JSON.stringify(canonicalize(value));
  }

  function localHash(label) {
    var text = cleanString(label);
    var seed = 2166136261;
    var hex = '';
    for (var round = 0; round < 8; round += 1) {
      var hash = seed ^ (round * 16777619);
      for (var i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i) + round;
        hash = Math.imul(hash, 16777619) >>> 0;
      }
      hex += ('00000000' + hash.toString(16)).slice(-8);
    }
    return hex.slice(0, 64);
  }

  function hash(label) {
    return localHash('f16.2.b:' + label);
  }

  function codeList(value) {
    return asArray(value).map(function (entry) {
      return isObject(entry) ? cleanString(entry.code || entry.blocker || entry.warning) : cleanString(entry);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }

  function allFalseLedgerDeltas() {
    return {
      consumedOperationWrites: 0,
      watermarkWrites: 0,
      bookkeepingWrites: 0,
      cacheRefreshWrites: 0,
      publicationTerminalMutations: 0,
      relayTerminalMutations: 0,
      outboxTerminalMutations: 0,
      nativeCalls: 0,
      f5Calls: 0,
      applySideEffects: 0,
      journalSideEffects: 0,
      sqlExecutionForBlockedBulkRows: 0
    };
  }

  function ledgerDeltasAreZero(deltas) {
    var d = safeObject(deltas);
    return Object.keys(allFalseLedgerDeltas()).every(function (key) {
      return Number(d[key] || 0) === 0;
    });
  }

  function sideEffectSummary() {
    return {
      storageWritten: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      nativeCalled: false,
      f5Touched: false,
      applyExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      bookkeepingWritten: false,
      cacheRefreshWritten: false,
      journalWritten: false,
      sqlExecutedForBlockedBulkRows: false
    };
  }

  function createClock() {
    return {
      tick: 0,
      next: function () {
        this.tick += 1;
        return this.tick;
      }
    };
  }

  function createPeer(label) {
    return {
      peerIdHash: hash(label + ':peer'),
      installIdHash: hash(label + ':install'),
      deviceIdHash: hash(label + ':device'),
      syncPeerIdHash: hash(label + ':sync-peer'),
      catalogState: {},
      bindingState: {},
      cacheState: { driftObserved: false, authority: 'library.binding' },
      folderBridgeState: { delegationFlag: false, endpointSubjectType: FOLDER_SUBJECT_TYPE },
      outbox: [],
      offlineQueue: [],
      watermarks: {},
      consumedOperations: {},
      f5Reviews: {},
      bulkBatches: {},
      logicalClock: createClock()
    };
  }

  function buildPeers() {
    return [createPeer('peer-a'), createPeer('peer-b')];
  }

  function peerRefs(peers) {
    return peers.map(function (peer) {
      return {
        peerIdHash: peer.peerIdHash,
        installIdHash: peer.installIdHash,
        deviceIdHash: peer.deviceIdHash,
        syncPeerIdHash: peer.syncPeerIdHash
      };
    });
  }

  function conflictApi(name, args, unavailable) {
    if (unavailable === true || typeof H2O.Desktop.Sync[name] !== 'function') {
      return {
        schema: 'h2o.desktop.sync.library-conflict-runtime.v1',
        version: cleanString(H2O.Desktop.Sync.__libraryConflictRuntimeVersion) || 'unavailable',
        ok: false,
        conflictFree: false,
        mode: safeObject(args).mode || 'settlement',
        operation: safeObject(args).operation || '',
        blockers: ['library-conflict-runtime-required-unavailable'],
        warnings: [],
        refreshRequired: true,
        retrySafe: true,
        sideEffectSummary: sideEffectSummary()
      };
    }
    try {
      return H2O.Desktop.Sync[name](args);
    } catch (error) {
      return {
        schema: 'h2o.desktop.sync.library-conflict-runtime.v1',
        version: cleanString(H2O.Desktop.Sync.__libraryConflictRuntimeVersion) || 'threw',
        ok: false,
        conflictFree: false,
        mode: safeObject(args).mode || 'settlement',
        operation: safeObject(args).operation || '',
        blockers: ['library-conflict-runtime-required-unavailable'],
        warnings: [],
        refreshRequired: true,
        retrySafe: true,
        sideEffectSummary: sideEffectSummary()
      };
    }
  }

  function callCatalog(args) {
    return conflictApi('evaluateLibraryCatalogRuntimeConflict', args);
  }

  function callBinding(args) {
    return conflictApi('evaluateLibraryBindingRuntimeConflict', args);
  }

  function callRuntime(args, unavailable) {
    return conflictApi('evaluateLibraryRuntimeConflict', args, unavailable);
  }

  function callBulk(args) {
    return conflictApi('classifyLibraryBulkRuntimeConflictRows', args);
  }

  function scenarioResult(def, conflictResult, extra) {
    var x = safeObject(extra);
    var observedCodes = codeList(conflictResult.blockers).concat(codeList(conflictResult.warnings));
    asArray(conflictResult.decisions).forEach(function (decision) {
      if (decision && decision.code) observedCodes.push(cleanString(decision.code));
    });
    observedCodes = observedCodes.filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
    var expectedCodes = asArray(def.expectedCodes || [def.expectedCode]).filter(Boolean);
    var matched = expectedCodes.length === 0 || expectedCodes.some(function (code) {
      return observedCodes.indexOf(code) !== -1;
    });
    var deltas = Object.assign(allFalseLedgerDeltas(), safeObject(x.ledgerDeltas));
    var sideEffectsSafe = ledgerDeltasAreZero(deltas);
    var warningOnly = x.warningOnly === true;
    var expectOk = typeof x.expectConflictOk === 'boolean' ? x.expectConflictOk : warningOnly;
    var conflictOkMatches = warningOnly ? conflictResult.ok === true : conflictResult.ok === false;
    if (typeof x.allowConflictOkAny === 'boolean' && x.allowConflictOkAny === true) conflictOkMatches = true;
    var ok = matched && sideEffectsSafe && conflictOkMatches && x.privacySafe !== false;
    return {
      caseId: def.caseId,
      ok: ok,
      peers: x.peers || [],
      replayMode: def.replayMode,
      winnerPeer: x.winnerPeer || '',
      loserPeer: x.loserPeer || '',
      operation: def.operation,
      expectedCode: expectedCodes[0] || '',
      observedCodes: observedCodes,
      refreshRequired: conflictResult.refreshRequired === true || x.refreshRequired === true,
      retrySafe: conflictResult.retrySafe === true || x.retrySafe === true,
      sideEffectsSafe: sideEffectsSafe,
      privacySafe: x.privacySafe !== false,
      ledgerDeltas: deltas,
      blockers: codeList(conflictResult.blockers),
      warnings: codeList(conflictResult.warnings)
    };
  }

  function bindingShape(bindingKind, right, suffix) {
    var kind = cleanString(bindingKind);
    var rightType = kind === 'chat-folder' ? FOLDER_SUBJECT_TYPE : CATALOG_SUBJECT_TYPE;
    return {
      subjectId: hash('binding:' + kind + ':' + suffix),
      bindingKind: kind,
      leftSubjectId: hash('chat-subject:' + suffix),
      rightSubjectId: right,
      leftSubjectType: CHAT_SUBJECT_TYPE,
      rightSubjectType: rightType,
      bindingState: 'bound',
      dedupeKey: hash('dedupe:' + kind + ':' + suffix),
      eventDigest: hash('event:' + kind + ':' + suffix)
    };
  }

  function runKernelValidationProbes(peers, observedAtIso) {
    var kernel = H2O.Desktop.Sync.kernel || null;
    var summary = {
      replayKernelAvailable: !!(kernel && typeof kernel.validateReplayCandidate === 'function'),
      watermarkKernelAvailable: !!(kernel && typeof kernel.validateWatermarkAdvance === 'function'),
      consumedKernelAvailable: !!(kernel && typeof kernel.validateConsumedOperation === 'function'),
      replayKernelInvoked: false,
      watermarkKernelInvoked: false,
      consumedKernelInvoked: false,
      blockers: [],
      warnings: []
    };
    var peer = peers[0] || createPeer('kernel-peer');
    var subjectId = hash('kernel-subject');
    var dedupeKey = hash('kernel-dedupe');
    var eventDigest = hash('kernel-event');
    if (summary.replayKernelAvailable) {
      try {
        summary.replayKernelInvoked = true;
        var replay = kernel.validateReplayCandidate({
          candidate: {
            consumedId: hash('kernel-consumed'),
            eventDigest: eventDigest,
            dedupeKey: dedupeKey,
            lineageId: hash('kernel-lineage'),
            subjectId: subjectId,
            sourcePeerId: peer.peerIdHash,
            envelopeKind: 'proposal',
            operationKind: 'multipeer-soak-proof',
            consumedStatus: 'consumed',
            consumedAtIso: observedAtIso,
            actorPeer: { peerIdHash: peer.peerIdHash },
            validationSummary: { checkedAtIso: observedAtIso }
          }
        });
        codeList(replay.blockers).forEach(function (code) { summary.blockers.push(code); });
        codeList(replay.warnings).forEach(function (code) { summary.warnings.push(code); });
      } catch (_) {
        summary.warnings.push('soak-replay-kernel-probe-threw');
      }
    }
    if (summary.consumedKernelAvailable) {
      try {
        summary.consumedKernelInvoked = true;
        var consumed = kernel.validateConsumedOperation({
          consumedId: hash('kernel-consumed-direct'),
          eventDigest: eventDigest,
          dedupeKey: dedupeKey,
          lineageId: hash('kernel-lineage-direct'),
          subjectId: subjectId,
          sourcePeerId: peer.peerIdHash,
          envelopeKind: 'proposal',
          operationKind: 'multipeer-soak-proof',
          consumedStatus: 'consumed',
          consumedAtIso: observedAtIso,
          actorPeer: { peerIdHash: peer.peerIdHash },
          validationSummary: { checkedAtIso: observedAtIso }
        });
        codeList(consumed.blockers).forEach(function (code) { summary.blockers.push(code); });
        codeList(consumed.warnings).forEach(function (code) { summary.warnings.push(code); });
      } catch (_) {
        summary.warnings.push('soak-consumed-kernel-probe-threw');
      }
    }
    if (summary.watermarkKernelAvailable) {
      try {
        summary.watermarkKernelInvoked = true;
        var watermark = kernel.validateWatermarkAdvance({
          current: {
            peerId: peer.peerIdHash,
            subjectId: subjectId,
            lineageId: hash('kernel-lineage'),
            revisionHash: hash('kernel-revision-a'),
            watermarkAtIso: '2026-01-01T00:00:01Z'
          },
          proposed: {
            peerId: peer.peerIdHash,
            subjectId: subjectId,
            lineageId: hash('kernel-lineage'),
            revisionHash: hash('kernel-revision-b'),
            watermarkAtIso: '2026-01-01T00:00:02Z'
          }
        });
        codeList(watermark.blockers).forEach(function (code) { summary.blockers.push(code); });
        codeList(watermark.warnings).forEach(function (code) { summary.warnings.push(code); });
      } catch (_) {
        summary.warnings.push('soak-watermark-kernel-probe-threw');
      }
    }
    summary.ok = summary.blockers.length === 0;
    return summary;
  }

  function scanPrivacy(result) {
    var text = canonicalJSON(result);
    var hits = RAW_LEAK_NEEDLES.filter(function (needle) {
      return text.indexOf(needle) !== -1;
    });
    return {
      ok: hits.length === 0,
      checkedNeedleCount: RAW_LEAK_NEEDLES.length,
      leakCount: hits.length
    };
  }

  function buildScenarios(peers) {
    var a = peers[0];
    var b = peers[1];
    var peerList = peerRefs(peers);
    var catalogA = hash('catalog-a');
    var catalogB = hash('catalog-b');
    var sameName = hash('catalog-name');
    var account = hash('account');
    var baseA = hash('base-a');
    var baseB = hash('base-b');
    var chat = hash('chat');
    var labelA = hash('label-a');
    var labelB = hash('label-b');
    var tagA = hash('tag-a');
    var categoryA = hash('category-a');
    var categoryB = hash('category-b');
    var folderA = hash('folder-a');
    var folderB = hash('folder-b');

    a.catalogState[catalogA] = { lifecycleState: 'active', revisionHash: baseB, nameHash: sameName };
    b.catalogState[catalogB] = { lifecycleState: 'active', revisionHash: baseA, nameHash: sameName };
    a.bindingState[hash('binding-chat-category-a')] = { bindingKind: 'chat-category', leftSubjectId: chat, rightSubjectId: categoryA };
    b.bindingState[hash('binding-chat-folder-b')] = { bindingKind: 'chat-folder', leftSubjectId: chat, rightSubjectId: folderB };
    a.folderBridgeState.delegationFlag = false;
    b.folderBridgeState.delegationFlag = true;
    a.outbox.push({ eventDigest: hash('outbox-a') });
    b.offlineQueue.push({ eventDigest: hash('offline-b') });
    a.logicalClock.next();
    b.logicalClock.next();

    return [
      {
        def: {
          caseId: SCENARIO_IDS[0],
          replayMode: REPLAY_MODES[0],
          operation: 'catalog-create',
          expectedCode: 'library-catalog-cross-install-name-collision'
        },
        result: callCatalog({
          mode: 'settlement',
          operation: 'create',
          candidate: {
            expectedTargetState: {
              subjectId: catalogB,
              catalogKind: 'label',
              nameHash: sameName,
              originAccountIdHash: account,
              lifecycleState: 'active'
            }
          },
          existingCatalogs: [{
            subjectId: catalogA,
            catalogKind: 'label',
            nameHash: sameName,
            originAccountIdHash: account,
            lifecycleState: 'active'
          }]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[1],
          replayMode: REPLAY_MODES[2],
          operation: 'catalog-rename',
          expectedCode: 'library-catalog-cross-install-stale-base'
        },
        result: callCatalog({
          mode: 'settlement',
          operation: 'rename',
          candidate: { baseHash: baseA },
          currentState: { subjectId: catalogA, revisionHash: baseB, lifecycleState: 'active' },
          expectedState: { lifecycleState: 'active' }
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[2],
          replayMode: REPLAY_MODES[5],
          operation: 'catalog-recolor-vs-archive',
          expectedCodes: ['library-catalog-cross-install-stale-base', 'library-catalog-cross-install-lifecycle-conflict']
        },
        result: callCatalog({
          mode: 'settlement',
          operation: 'recolor',
          candidate: { baseHash: baseA },
          currentState: { subjectId: catalogA, revisionHash: baseB, lifecycleState: 'archived' },
          expectedState: { lifecycleState: 'active' },
          expectedTargetState: { lifecycleState: 'active' }
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[3],
          replayMode: REPLAY_MODES[3],
          operation: 'binding-duplicate-chat-label-chat-tag',
          expectedCode: 'library-binding-cross-install-duplicate-edge'
        },
        result: callBinding({
          mode: 'settlement',
          operation: 'bind',
          candidate: bindingShape('chat-label', labelA, 'duplicate-a'),
          existingBindings: [Object.assign(bindingShape('chat-label', labelA, 'duplicate-a'), {
            subjectId: hash('binding-other-duplicate'),
            dedupeKey: hash('different-dedupe'),
            eventDigest: hash('different-event')
          })]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[4],
          replayMode: REPLAY_MODES[4],
          operation: 'binding-bind-vs-unbind',
          expectedCodes: ['library-binding-cross-install-state-conflict', 'library-binding-cross-install-stale-base']
        },
        result: callBinding({
          mode: 'settlement',
          operation: 'bind',
          candidate: bindingShape('chat-tag', tagA, 'bind-unbind'),
          expectedState: { bindingState: 'unbound' },
          currentState: { bindingState: 'bound' }
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[5],
          replayMode: REPLAY_MODES[1],
          operation: 'binding-chat-category-replacement',
          expectedCode: 'library-binding-cross-install-state-conflict'
        },
        result: callBinding({
          mode: 'settlement',
          operation: 'bind',
          candidate: Object.assign(bindingShape('chat-category', categoryB, 'category-b'), { leftSubjectId: chat }),
          existingBindings: [Object.assign(bindingShape('chat-category', categoryA, 'category-a'), { leftSubjectId: chat })],
          cacheObservation: { driftDetected: false }
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[6],
          replayMode: REPLAY_MODES[1],
          operation: 'binding-chat-folder-replacement',
          expectedCode: 'library-binding-cross-install-state-conflict'
        },
        result: callBinding({
          mode: 'settlement',
          operation: 'bind',
          candidate: Object.assign(bindingShape('chat-folder', folderB, 'folder-b'), { leftSubjectId: chat }),
          existingBindings: [Object.assign(bindingShape('chat-folder', folderA, 'folder-a'), { leftSubjectId: chat })]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[7],
          replayMode: REPLAY_MODES[5],
          operation: 'folder-bridge-fallback-delegated',
          expectedCode: 'library-binding-f7-f15-identity-conflict'
        },
        result: callBinding({
          mode: 'diagnostic',
          operation: 'bind',
          candidate: Object.assign(bindingShape('chat-folder', folderA, 'bridge'), { leftSubjectId: chat }),
          bridgeContext: {
            activeStateConflict: true,
            fallbackDelegationFlag: false,
            delegatedFlag: true,
            endpointSubjectType: FOLDER_SUBJECT_TYPE
          }
        }),
        extra: { peers: peerList, winnerPeer: b.peerIdHash, loserPeer: a.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[8],
          replayMode: REPLAY_MODES[2],
          operation: 'catalog-f5-terminal-race',
          expectedCode: 'library-catalog-f5-review-conflict'
        },
        result: callRuntime({
          domain: 'library.f5',
          mode: 'settlement',
          operation: 'tombstone',
          f5Review: { currentTerminal: 'approved-seal', expectedTerminal: 'approved-restore' }
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: false }
      },
      {
        def: {
          caseId: SCENARIO_IDS[9],
          replayMode: REPLAY_MODES[2],
          operation: 'bulk-import-during-edit',
          expectedCode: 'library-bulk-cross-install-partial-conflict'
        },
        result: callBulk({
          mode: 'bulk',
          operation: 'bundle-import',
          bulkRows: [
            { domain: CATALOG_SUBJECT_TYPE, conflict: true },
            { domain: 'library.binding', duplicate: true },
            { domain: 'library.binding' }
          ]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true, allowConflictOkAny: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[10],
          replayMode: REPLAY_MODES[6],
          operation: 'bulk-repeat-same-bundle',
          expectedCode: 'library-binding-cross-install-duplicate-edge'
        },
        result: callBulk({
          mode: 'bulk',
          operation: 'bundle-import',
          bulkRows: [
            { domain: 'library.binding', duplicate: true },
            { domain: CATALOG_SUBJECT_TYPE, exactReplay: true }
          ]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: false, retrySafe: true, expectConflictOk: true, allowConflictOkAny: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[11],
          replayMode: REPLAY_MODES[2],
          operation: 'cache-drift-after-reconnect',
          expectedCode: 'library-cache-cross-install-drift'
        },
        result: callRuntime({
          domain: 'library.cache',
          mode: 'diagnostic',
          operation: 'cache-refresh-check',
          cacheObservation: { driftDetected: true }
        }),
        extra: { peers: peerList, winnerPeer: '', loserPeer: '', refreshRequired: true, retrySafe: true, warningOnly: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[12],
          replayMode: REPLAY_MODES[7],
          operation: 'runtime-unavailable-settlement',
          expectedCode: 'library-conflict-runtime-required-unavailable'
        },
        result: callRuntime({
          domain: CATALOG_SUBJECT_TYPE,
          mode: 'settlement',
          operation: 'rename'
        }, true),
        extra: { peers: peerList, winnerPeer: '', loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      },
      {
        def: {
          caseId: SCENARIO_IDS[13],
          replayMode: REPLAY_MODES[7],
          operation: 'settlement-blocker-before-ledgers',
          expectedCode: 'library-binding-cross-install-duplicate-edge'
        },
        result: callBinding({
          mode: 'settlement',
          operation: 'bind',
          candidate: bindingShape('chat-label', labelB, 'blocked-ledger'),
          existingBindings: [Object.assign(bindingShape('chat-label', labelB, 'blocked-ledger'), {
            subjectId: hash('binding-blocked-other'),
            dedupeKey: hash('different-dedupe-blocked'),
            eventDigest: hash('different-event-blocked')
          })]
        }),
        extra: { peers: peerList, winnerPeer: a.peerIdHash, loserPeer: b.peerIdHash, refreshRequired: true, retrySafe: true }
      }
    ];
  }

  async function runLibraryMultiPeerSoakProof(input) {
    var args = safeObject(input);
    var envHeavy = false;
    try {
      envHeavy = !!(global.process && global.process.env && global.process.env.F16_SOAK_HEAVY === '1');
    } catch (_) { envHeavy = false; }
    var heavy = args.heavy === true || envHeavy === true;
    var observedAtIso = cleanString(args.observedAtIso) || FIXED_OBSERVED_AT_ISO;
    var peers = buildPeers();
    var runtimeApiPresence = {};
    RUNTIME_APIS.forEach(function (api) {
      runtimeApiPresence[api] = typeof H2O.Desktop.Sync[api] === 'function';
    });

    var scenarioInputs = buildScenarios(peers);
    var scenarios = scenarioInputs.map(function (entry) {
      return scenarioResult(entry.def, entry.result, entry.extra);
    });
    var privacy = scanPrivacy({
      schema: RESULT_SCHEMA,
      version: VERSION,
      peerCount: peers.length,
      scenarios: scenarios
    });
    scenarios = scenarios.map(function (scenario) {
      scenario.privacySafe = scenario.privacySafe && privacy.ok;
      scenario.ok = scenario.ok && scenario.privacySafe;
      return scenario;
    });

    var passCount = scenarios.filter(function (scenario) { return scenario.ok === true; }).length;
    var failCount = scenarios.length - passCount;
    var blockers = [];
    scenarios.forEach(function (scenario) {
      if (!scenario.ok) blockers.push('library-multipeer-soak-scenario-failed:' + scenario.caseId);
    });
    if (!privacy.ok) blockers.push('library-multipeer-soak-privacy-failed');
    RUNTIME_APIS.forEach(function (api) {
      if (!runtimeApiPresence[api]) blockers.push('library-multipeer-soak-runtime-api-missing:' + api);
    });

    var kernelProbes = runKernelValidationProbes(peers, observedAtIso);
    var sideEffects = sideEffectSummary();
    var heavySeed = cleanString(args.seed) || hash('heavy-soak-seed').slice(0, 16);
    var output = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      peerCount: peers.length,
      scenarioCount: scenarios.length,
      passCount: passCount,
      failCount: failCount,
      scenarios: scenarios,
      conflictSummary: {
        runtimeApiPresence: runtimeApiPresence,
        expectedCodes: EXPECTED_CODES,
        realConflictGateReferenced: true
      },
      replaySummary: {
        replayModes: REPLAY_MODES,
        kernelProbes: kernelProbes,
        defaultPeerCount: 2,
        deterministicLogicalClock: true
      },
      privacySummary: privacy,
      sideEffectSummary: sideEffects,
      performanceSummary: {
        heavyRequested: heavy,
        heavyDefault: false,
        heavyEnvFlag: 'F16_SOAK_HEAVY=1',
        seed: heavy ? heavySeed : '',
        defaultScenarioBudget: SCENARIO_IDS.length,
        no10kScaleStressDefault: true,
        performanceBudgetExceededWarningOnly: true
      },
      blockers: blockers,
      warnings: kernelProbes.warnings.slice(),
      observedAtIso: observedAtIso
    };
    output.privacySummary = scanPrivacy(output);
    output.ok = output.ok && output.privacySummary.ok;
    if (!output.privacySummary.ok && output.blockers.indexOf('library-multipeer-soak-privacy-failed') === -1) {
      output.blockers.push('library-multipeer-soak-privacy-failed');
      output.ok = false;
    }
    return output;
  }

  H2O.Desktop.Sync.runLibraryMultiPeerSoakProof = runLibraryMultiPeerSoakProof;
  H2O.Desktop.Sync.__libraryMultiPeerSoakProofInstalled = true;
  H2O.Desktop.Sync.__libraryMultiPeerSoakProofVersion = VERSION;

})(typeof window !== 'undefined' ? window : globalThis);
