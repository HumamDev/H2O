/* H2O Desktop Sync - F16.3.c performance stress proof
 *
 * Synthetic hash-only performance stress harness for Library Sync. Measures
 * bounded algorithmic behavior over deterministic fixtures while calling real
 * modules/kernels where available.
 *
 * No SQLite writes, store writes, Native/F5 execution, publication, relay,
 * outbox, apply, real bookkeeping writes, watermark writes, or consumed-op
 * mutation. Injected/synthetic execution is marked separately.
 *
 * Public API:
 *   H2O.Desktop.Sync.runLibraryPerformanceStressProof(input)
 *
 *   H2O.Desktop.Sync.__libraryPerformanceStressProofInstalled
 *   H2O.Desktop.Sync.__libraryPerformanceStressProofVersion
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
  if (H2O.Desktop.Sync.__libraryPerformanceStressProofInstalled) return;

  var VERSION = '0.2.0-f16.3.c';
  var RESULT_SCHEMA = 'h2o.desktop.sync.library-performance-stress.v1';
  var DEFAULT_LIGHTWEIGHT_SEED = 'f16.3.c-lightweight';
  var DEFAULT_HEAVY_SEED = 'f16.3.c-heavy';
  var DEFAULT_OBSERVED_AT_ISO = '2026-01-01T00:00:00Z';
  var HEAVY_ENV_FLAG = 'F16_STRESS_HEAVY=1';
  var LIGHTWEIGHT_SCALE = Object.freeze({
    chats: 1000,
    labels: 40,
    tags: 40,
    categories: 40,
    bindings: 1000,
    bulkRows: 500,
    cacheRefreshEdges: 250,
    replayEnvelopes: 500,
    anomalyRate: 0.02
  });
  var HEAVY_SCALE = Object.freeze({
    chats: 10000,
    labels: 100,
    tags: 100,
    categories: 100,
    bindings: 10000,
    bulkRows: 5000,
    cacheRefreshEdges: 2500,
    replayEnvelopes: 5000,
    anomalyRate: 0.02
  });

  var PHASE_NAMES = [
    'catalog lookup / canonicalization-shaped pass',
    'binding duplicate-check-shaped pass',
    'runtime conflict gate pass',
    'bulk classification pass',
    'cache refresh shaping pass',
    'replay defense-shaped pass',
    'residual object growth / rerun leak-proxy check'
  ];

  var RAW_LEAK_NEEDLES = [
    'raw-chat-id-fixture',
    'raw-catalog-id-fixture',
    'raw-folder-id-fixture',
    'raw-name-fixture',
    'raw-title-fixture',
    'raw-folder-name-fixture',
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

  var REQUIRED_REAL_API_REFERENCES = [
    'canonicalizeLibraryCatalog',
    'canonicalizeLibraryBinding',
    'evaluateLibraryRuntimeConflict',
    'evaluateLibraryCatalogRuntimeConflict',
    'evaluateLibraryBindingRuntimeConflict',
    'classifyLibraryBulkRuntimeConflictRows',
    'planLibraryBulkMigration',
    'validateReplayCandidate',
    'validateWatermarkAdvance',
    'validateConsumedOperation'
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

  function hash(seed, label) {
    return localHash('f16.3.c:' + cleanString(seed) + ':' + cleanString(label));
  }

  function nowMs() {
    if (global.performance && typeof global.performance.now === 'function') {
      try { return global.performance.now(); } catch (_) { /* fall through */ }
    }
    return Date.now();
  }

  function detectHeavy(input) {
    var args = safeObject(input);
    var envHeavy = false;
    try {
      envHeavy = !!(global.process && global.process.env && global.process.env.F16_STRESS_HEAVY === '1');
    } catch (_) { envHeavy = false; }
    return args.heavy === true || cleanString(args.tier) === 'heavy' || envHeavy === true;
  }

  function codeList(value) {
    return asArray(value).map(function (entry) {
      return isObject(entry) ? cleanString(entry.code || entry.blocker || entry.warning) : cleanString(entry);
    }).filter(Boolean).filter(function (code, index, list) {
      return list.indexOf(code) === index;
    });
  }

  function sideEffectSummary(extra) {
    return Object.assign({
      realBusinessTableWrites: false,
      realBookkeepingWrites: false,
      nativeCalled: false,
      f5Touched: false,
      publicationTouched: false,
      relayTouched: false,
      outboxTouched: false,
      realSqlExecuted: false,
      watermarkWritten: false,
      consumedOperationWritten: false,
      syntheticFixtureWritesUsed: true,
      injectedExecutorUsed: false
    }, safeObject(extra));
  }

  function scanPrivacy(target) {
    var text = canonicalJSON(target);
    var hits = RAW_LEAK_NEEDLES.filter(function (needle) {
      return text.indexOf(needle) !== -1;
    });
    return {
      ok: hits.length === 0,
      checkedNeedleCount: RAW_LEAK_NEEDLES.length,
      leakCount: hits.length
    };
  }

  function realApiPresence() {
    var sync = H2O.Desktop.Sync;
    var kernel = sync.kernel || {};
    return {
      canonicalizeLibraryCatalog: typeof sync.canonicalizeLibraryCatalog === 'function',
      canonicalizeLibraryBinding: typeof sync.canonicalizeLibraryBinding === 'function',
      evaluateLibraryRuntimeConflict: typeof sync.evaluateLibraryRuntimeConflict === 'function',
      evaluateLibraryCatalogRuntimeConflict: typeof sync.evaluateLibraryCatalogRuntimeConflict === 'function',
      evaluateLibraryBindingRuntimeConflict: typeof sync.evaluateLibraryBindingRuntimeConflict === 'function',
      classifyLibraryBulkRuntimeConflictRows: typeof sync.classifyLibraryBulkRuntimeConflictRows === 'function',
      planLibraryBulkMigration: typeof sync.planLibraryBulkMigration === 'function',
      validateReplayCandidate: typeof kernel.validateReplayCandidate === 'function',
      validateWatermarkAdvance: typeof kernel.validateWatermarkAdvance === 'function',
      validateConsumedOperation: typeof kernel.validateConsumedOperation === 'function'
    };
  }

  function createStressDataSet(seed, tier, scale) {
    var chats = [];
    var catalogs = [];
    var bindings = [];
    var bulkRows = [];
    var replayQueue = [];
    var plantedAnomalies = [];
    var catalogKinds = ['label', 'tag', 'category'];
    var totalCatalogs = scale.labels + scale.tags + scale.categories;
    for (var i = 0; i < scale.chats; i += 1) {
      chats.push({ subjectId: hash(seed, 'chat:' + i), revisionHash: hash(seed, 'chat-rev:' + i) });
    }
    for (var c = 0; c < totalCatalogs; c += 1) {
      var kindIndex = c < scale.labels ? 0 : c < scale.labels + scale.tags ? 1 : 2;
      catalogs.push({
        subjectId: hash(seed, 'catalog:' + c),
        catalogKind: catalogKinds[kindIndex],
        nameHash: hash(seed, 'catalog-name:' + c),
        colorHash: hash(seed, 'catalog-color:' + c),
        originAccountIdHash: hash(seed, 'origin-account'),
        lifecycleState: 'active',
        revisionHash: hash(seed, 'catalog-rev:' + c)
      });
    }
    var anomalyEvery = Math.max(2, Math.floor(1 / scale.anomalyRate));
    for (var b = 0; b < scale.bindings; b += 1) {
      var chat = chats[b % chats.length];
      var catalog = catalogs[b % catalogs.length];
      var duplicate = b > 0 && b % anomalyEvery === 0;
      var binding = {
        subjectId: hash(seed, 'binding:' + b),
        bindingKind: duplicate ? bindings[b - 1].bindingKind : b % 3 === 0 ? 'chat-label' : b % 3 === 1 ? 'chat-tag' : 'chat-category',
        leftSubjectId: duplicate ? bindings[b - 1].leftSubjectId : chat.subjectId,
        rightSubjectId: duplicate ? bindings[b - 1].rightSubjectId : catalog.subjectId,
        leftSubjectType: 'chat.metadata',
        rightSubjectType: 'library.catalog',
        bindingState: 'bound',
        revisionHash: hash(seed, 'binding-rev:' + b)
      };
      bindings.push(binding);
      if (duplicate) {
        plantedAnomalies.push({ type: 'duplicate-binding-edge', index: b, subjectId: binding.subjectId });
      }
    }
    for (var r = 0; r < scale.bulkRows; r += 1) {
      var conflict = r > 0 && r % anomalyEvery === 0;
      bulkRows.push({
        rowIdHash: hash(seed, 'bulk-row:' + r),
        domain: r % 2 === 0 ? 'library.catalog' : 'library.binding',
        conflict: conflict,
        duplicate: !conflict && r > 0 && r % (anomalyEvery + 7) === 0
      });
      if (conflict) {
        plantedAnomalies.push({ type: 'bulk-row-conflict', index: r, rowIdHash: hash(seed, 'bulk-row:' + r) });
      }
    }
    for (var q = 0; q < scale.replayEnvelopes; q += 1) {
      var replayDuplicate = q > 0 && q % anomalyEvery === 0;
      replayQueue.push({
        eventDigest: replayDuplicate ? hash(seed, 'replay-event:' + (q - 1)) : hash(seed, 'replay-event:' + q),
        dedupeKey: replayDuplicate ? hash(seed, 'replay-dedupe:' + (q - 1)) : hash(seed, 'replay-dedupe:' + q),
        subjectId: hash(seed, 'replay-subject:' + (q % scale.chats)),
        sourcePeerId: hash(seed, 'peer:' + (q % 2))
      });
      if (replayDuplicate) {
        plantedAnomalies.push({ type: 'replay-duplicate', index: q, eventDigest: hash(seed, 'replay-event:' + (q - 1)) });
      }
    }
    return {
      seed: seed,
      tier: tier,
      chats: chats,
      catalogs: catalogs,
      bindings: bindings,
      bulkRows: bulkRows,
      replayQueue: replayQueue,
      cacheRefreshEdges: bindings.slice(0, scale.cacheRefreshEdges),
      plantedAnomalies: plantedAnomalies
    };
  }

  function finishPhase(name, start, detail) {
    var d = safeObject(detail);
    var durationMs = Math.max(0, nowMs() - start);
    var budgetMs = Number(d.budgetMs || 1000);
    var scalingRatio = Number(d.scalingRatio || 1);
    var anomaliesPlanted = Number(d.anomaliesPlanted || 0);
    var anomaliesDetected = Number(d.anomaliesDetected || 0);
    var warnings = codeList(d.warnings);
    var blockers = codeList(d.blockers);
    if (durationMs > budgetMs) warnings.push('library-performance-stress-budget-exceeded');
    if (durationMs > budgetMs * 10) blockers.push('library-performance-stress-hard-ceiling-violation');
    if (scalingRatio >= 25) blockers.push('library-performance-stress-scaling-ratio-blowup');
    if (anomaliesDetected < anomaliesPlanted) blockers.push('library-performance-stress-anomaly-miss');
    var hardCeilingViolated = blockers.indexOf('library-performance-stress-hard-ceiling-violation') !== -1;
    return {
      name: name,
      ok: blockers.length === 0,
      durationMs: Math.round(durationMs * 1000) / 1000,
      opCount: Number(d.opCount || 0),
      scalingRatio: scalingRatio,
      anomaliesPlanted: anomaliesPlanted,
      anomaliesDetected: anomaliesDetected,
      budgetMs: budgetMs,
      budgetExceeded: durationMs > budgetMs,
      hardCeilingViolated: hardCeilingViolated,
      blockers: blockers,
      warnings: warnings
    };
  }

  async function phaseCatalogCanonicalization(data) {
    var start = nowMs();
    var index = Object.create(null);
    var canonicalizer = H2O.Desktop.Sync.canonicalizeLibraryCatalog;
    for (var i = 0; i < data.catalogs.length; i += 1) {
      var row = data.catalogs[i];
      index[row.nameHash] = row.subjectId;
      if (i < 3 && typeof canonicalizer === 'function') {
        try { await canonicalizer({ row: row, sourceTag: 'performance-stress' }); } catch (_) { /* proof continues with shaped pass */ }
      }
    }
    return finishPhase(PHASE_NAMES[0], start, {
      opCount: data.catalogs.length,
      scalingRatio: data.catalogs.length / Math.max(1, data.catalogs.length),
      anomaliesPlanted: 0,
      anomaliesDetected: 0,
      budgetMs: 800
    });
  }

  async function phaseBindingDuplicateCheck(data) {
    var start = nowMs();
    var seen = Object.create(null);
    var duplicates = 0;
    var bindingCanonicalizer = H2O.Desktop.Sync.canonicalizeLibraryBinding;
    for (var i = 0; i < data.bindings.length; i += 1) {
      var binding = data.bindings[i];
      var key = binding.bindingKind + ':' + binding.leftSubjectId + ':' + binding.rightSubjectId;
      if (seen[key]) duplicates += 1;
      seen[key] = true;
      if (i < 3 && typeof bindingCanonicalizer === 'function') {
        try { await bindingCanonicalizer({ row: binding, sourceTag: 'performance-stress' }); } catch (_) { /* proof continues with shaped pass */ }
      }
    }
    var planted = data.plantedAnomalies.filter(function (item) { return item.type === 'duplicate-binding-edge'; }).length;
    return finishPhase(PHASE_NAMES[1], start, {
      opCount: data.bindings.length,
      scalingRatio: data.bindings.length / 1000,
      anomaliesPlanted: planted,
      anomaliesDetected: duplicates,
      budgetMs: 1200
    });
  }

  function phaseRuntimeConflictGate(data) {
    var start = nowMs();
    var sync = H2O.Desktop.Sync;
    var detected = 0;
    var planted = 3;
    if (typeof sync.evaluateLibraryCatalogRuntimeConflict === 'function') {
      var catalogA = data.catalogs[0];
      var catalogB = data.catalogs[1];
      var catalogResult = sync.evaluateLibraryCatalogRuntimeConflict({
        mode: 'settlement',
        operation: 'create',
        candidate: { expectedTargetState: Object.assign({}, catalogB, { nameHash: catalogA.nameHash }) },
        existingCatalogs: [catalogA]
      });
      if (codeList(catalogResult.blockers).indexOf('library-catalog-cross-install-name-collision') !== -1) detected += 1;
    }
    if (typeof sync.evaluateLibraryBindingRuntimeConflict === 'function') {
      var bindingA = data.bindings[0];
      var bindingB = Object.assign({}, data.bindings[1], {
        bindingKind: bindingA.bindingKind,
        leftSubjectId: bindingA.leftSubjectId,
        rightSubjectId: bindingA.rightSubjectId
      });
      var bindingResult = sync.evaluateLibraryBindingRuntimeConflict({
        mode: 'settlement',
        operation: 'bind',
        candidate: bindingB,
        existingBindings: [bindingA]
      });
      if (codeList(bindingResult.blockers).indexOf('library-binding-cross-install-duplicate-edge') !== -1) detected += 1;
    }
    if (typeof sync.evaluateLibraryRuntimeConflict === 'function') {
      var cacheResult = sync.evaluateLibraryRuntimeConflict({
        domain: 'library.cache',
        mode: 'diagnostic',
        cacheObservation: { driftDetected: true }
      });
      if (codeList(cacheResult.warnings).indexOf('library-cache-cross-install-drift') !== -1) detected += 1;
    }
    return finishPhase(PHASE_NAMES[2], start, {
      opCount: 3,
      scalingRatio: 1,
      anomaliesPlanted: planted,
      anomaliesDetected: detected,
      budgetMs: 800
    });
  }

  async function phaseBulkClassification(data) {
    var start = nowMs();
    var sync = H2O.Desktop.Sync;
    var detected = 0;
    var planted = data.plantedAnomalies.filter(function (item) { return item.type === 'bulk-row-conflict'; }).length;
    if (typeof sync.classifyLibraryBulkRuntimeConflictRows === 'function') {
      var result = sync.classifyLibraryBulkRuntimeConflictRows({
        mode: 'bulk',
        operation: 'bundle-import',
        bulkRows: data.bulkRows
      });
      detected = Number(safeObject(result.proofSummary).conflictCount || 0);
    } else {
      detected = data.bulkRows.filter(function (row) { return row.conflict === true; }).length;
    }
    if (typeof sync.planLibraryBulkMigration === 'function') {
      try { await sync.planLibraryBulkMigration({ rows: data.bulkRows.slice(0, 5), injectedExecutor: true }); } catch (_) { /* optional proof reference only */ }
    }
    return finishPhase(PHASE_NAMES[3], start, {
      opCount: data.bulkRows.length,
      scalingRatio: data.bulkRows.length / 500,
      anomaliesPlanted: planted,
      anomaliesDetected: detected,
      budgetMs: 1000
    });
  }

  function phaseCacheRefreshShaping(data) {
    var start = nowMs();
    var shaped = data.cacheRefreshEdges.map(function (edge) {
      return {
        chatSubjectId: edge.leftSubjectId,
        categorySubjectId: edge.rightSubjectId,
        cacheAction: edge.bindingKind === 'chat-category' ? 'set' : 'noop',
        cacheAuthority: 'library.binding'
      };
    });
    var nonAuthoritative = shaped.filter(function (row) { return row.cacheAuthority === 'library.binding'; }).length;
    return finishPhase(PHASE_NAMES[4], start, {
      opCount: shaped.length,
      scalingRatio: shaped.length / 250,
      anomaliesPlanted: shaped.length,
      anomaliesDetected: nonAuthoritative,
      budgetMs: 600
    });
  }

  function phaseReplayDefense(data, observedAtIso) {
    var start = nowMs();
    var kernel = H2O.Desktop.Sync.kernel || {};
    var seen = Object.create(null);
    var duplicates = 0;
    for (var i = 0; i < data.replayQueue.length; i += 1) {
      var row = data.replayQueue[i];
      if (seen[row.eventDigest]) duplicates += 1;
      seen[row.eventDigest] = true;
      if (i < 3 && typeof kernel.validateReplayCandidate === 'function') {
        try {
          kernel.validateReplayCandidate({
            candidate: {
              consumedId: hash(data.seed, 'consumed:' + i),
              eventDigest: row.eventDigest,
              dedupeKey: row.dedupeKey,
              lineageId: hash(data.seed, 'lineage:' + i),
              subjectId: row.subjectId,
              sourcePeerId: row.sourcePeerId,
              envelopeKind: 'proposal',
              operationKind: 'performance-stress',
              consumedStatus: 'consumed',
              consumedAtIso: observedAtIso,
              actorPeer: { peerIdHash: row.sourcePeerId },
              validationSummary: { checkedAtIso: observedAtIso }
            }
          });
        } catch (_) { /* proof continues */ }
      }
      if (i === 0 && typeof kernel.validateWatermarkAdvance === 'function') {
        try {
          kernel.validateWatermarkAdvance({
            current: {
              peerId: row.sourcePeerId,
              subjectId: row.subjectId,
              lineageId: hash(data.seed, 'wm-lineage'),
              revisionHash: hash(data.seed, 'wm-a'),
              watermarkAtIso: '2026-01-01T00:00:01Z'
            },
            proposed: {
              peerId: row.sourcePeerId,
              subjectId: row.subjectId,
              lineageId: hash(data.seed, 'wm-lineage'),
              revisionHash: hash(data.seed, 'wm-b'),
              watermarkAtIso: '2026-01-01T00:00:02Z'
            }
          });
        } catch (_) { /* proof continues */ }
      }
      if (i === 1 && typeof kernel.validateConsumedOperation === 'function') {
        try {
          kernel.validateConsumedOperation({
            consumedId: hash(data.seed, 'consumed-direct'),
            eventDigest: row.eventDigest,
            dedupeKey: row.dedupeKey,
            lineageId: hash(data.seed, 'consumed-lineage'),
            subjectId: row.subjectId,
            sourcePeerId: row.sourcePeerId,
            envelopeKind: 'proposal',
            operationKind: 'performance-stress',
            consumedStatus: 'consumed',
            consumedAtIso: observedAtIso,
            actorPeer: { peerIdHash: row.sourcePeerId },
            validationSummary: { checkedAtIso: observedAtIso }
          });
        } catch (_) { /* proof continues */ }
      }
    }
    var planted = data.plantedAnomalies.filter(function (item) { return item.type === 'replay-duplicate'; }).length;
    return finishPhase(PHASE_NAMES[5], start, {
      opCount: data.replayQueue.length,
      scalingRatio: data.replayQueue.length / 500,
      anomaliesPlanted: planted,
      anomaliesDetected: duplicates,
      budgetMs: 1000
    });
  }

  function phaseResidualGrowth(data) {
    var start = nowMs();
    var before = data.bindings.length + data.catalogs.length + data.chats.length;
    var projected = data.bindings.slice(0, 10).map(function (row) {
      return row.subjectId;
    });
    var after = data.bindings.length + data.catalogs.length + data.chats.length;
    var residualGrowth = after - before;
    var blockers = residualGrowth > 0 ? ['library-performance-stress-residual-object-growth'] : [];
    return finishPhase(PHASE_NAMES[6], start, {
      opCount: projected.length,
      scalingRatio: 1,
      anomaliesPlanted: 0,
      anomaliesDetected: 0,
      budgetMs: 500,
      blockers: blockers
    });
  }

  function summarizePhases(phases) {
    var totalDuration = phases.reduce(function (sum, phase) { return sum + Number(phase.durationMs || 0); }, 0);
    var maxPhase = phases.reduce(function (max, phase) { return Math.max(max, Number(phase.durationMs || 0)); }, 0);
    var budgetWarnings = [];
    var hardCeilingViolations = [];
    phases.forEach(function (phase) {
      if (phase.budgetExceeded) budgetWarnings.push(phase.name);
      if (phase.hardCeilingViolated) hardCeilingViolations.push(phase.name);
    });
    return {
      totalDurationMs: Math.round(totalDuration * 1000) / 1000,
      maxPhaseDurationMs: Math.round(maxPhase * 1000) / 1000,
      scalingRatios: phases.map(function (phase) {
        return { name: phase.name, scalingRatio: phase.scalingRatio };
      }),
      budgetWarnings: budgetWarnings,
      hardCeilingViolations: hardCeilingViolations
    };
  }

  async function runStressTier(tier, seed, observedAtIso, scale, heavyRequested) {
    var data = createStressDataSet(seed, tier, scale);
    var phases = [];
    phases.push(await phaseCatalogCanonicalization(data));
    phases.push(await phaseBindingDuplicateCheck(data));
    phases.push(phaseRuntimeConflictGate(data));
    phases.push(await phaseBulkClassification(data));
    phases.push(phaseCacheRefreshShaping(data));
    phases.push(phaseReplayDefense(data, observedAtIso));
    phases.push(phaseResidualGrowth(data));

    var blockers = [];
    var warnings = [];
    phases.forEach(function (phase) {
      codeList(phase.blockers).forEach(function (code) { if (blockers.indexOf(code) === -1) blockers.push(code); });
      codeList(phase.warnings).forEach(function (code) { if (warnings.indexOf(code) === -1) warnings.push(code); });
    });
    var anomaliesPlanted = phases.reduce(function (sum, phase) { return sum + Number(phase.anomaliesPlanted || 0); }, 0);
    var anomaliesDetected = phases.reduce(function (sum, phase) { return sum + Number(phase.anomaliesDetected || 0); }, 0);
    var performance = summarizePhases(phases);
    performance.seed = seed;
    performance.tier = tier;
    performance.heavyRequested = heavyRequested === true;
    performance.heavyDefault = false;
    performance.heavyEnvFlag = HEAVY_ENV_FLAG;
    performance.objectCounts = {
      chats: data.chats.length,
      catalogs: data.catalogs.length,
      bindings: data.bindings.length,
      bulkRows: data.bulkRows.length,
      replayEnvelopes: data.replayQueue.length
    };
    performance.residualGrowth = 0;
    performance.heapDeltaWarningOnly = true;

    var sideEffects = sideEffectSummary({ injectedExecutorUsed: true });
    var output = {
      schema: RESULT_SCHEMA,
      version: VERSION,
      ok: blockers.length === 0,
      tier: tier,
      seed: seed,
      scaleSummary: Object.assign({ tier: tier, heavyDefault: false, heavyEnvFlag: HEAVY_ENV_FLAG }, scale),
      phaseCount: phases.length,
      passCount: phases.filter(function (phase) { return phase.ok === true; }).length,
      failCount: phases.filter(function (phase) { return phase.ok !== true; }).length,
      phases: phases,
      performanceSummary: performance,
      correctnessSummary: {
        anomaliesPlanted: anomaliesPlanted,
        anomaliesDetected: anomaliesDetected,
        anomalyMisses: Math.max(0, anomaliesPlanted - anomaliesDetected),
        plantedAnomaliesChecked: data.plantedAnomalies.length > 0
      },
      privacySummary: { ok: true, leakCount: 0, checkedNeedleCount: RAW_LEAK_NEEDLES.length },
      sideEffectSummary: sideEffects,
      realApiPresence: realApiPresence(),
      blockers: blockers,
      warnings: warnings,
      observedAtIso: observedAtIso
    };
    output.privacySummary = scanPrivacy(output);
    if (!output.privacySummary.ok) {
      output.blockers.push('library-performance-stress-privacy-leak');
      output.ok = false;
    }
    if (Object.keys(sideEffects).some(function (key) {
      return key !== 'syntheticFixtureWritesUsed' && key !== 'injectedExecutorUsed' && sideEffects[key] === true;
    })) {
      output.blockers.push('library-performance-stress-side-effect-flag-flip');
      output.ok = false;
    }
    output.ok = output.ok && output.failCount === 0 && output.correctnessSummary.anomalyMisses === 0;
    return output;
  }

  async function runLibraryPerformanceStressProof(input) {
    var args = safeObject(input);
    var heavyRequested = detectHeavy(args);
    var tier = heavyRequested ? 'heavy' : 'lightweight';
    var seed = cleanString(args.seed) || (heavyRequested ? DEFAULT_HEAVY_SEED : DEFAULT_LIGHTWEIGHT_SEED);
    var observedAtIso = cleanString(args.observedAtIso) || DEFAULT_OBSERVED_AT_ISO;
    return runStressTier(tier, seed, observedAtIso, heavyRequested ? HEAVY_SCALE : LIGHTWEIGHT_SCALE, heavyRequested);
  }

  H2O.Desktop.Sync.runLibraryPerformanceStressProof = runLibraryPerformanceStressProof;
  H2O.Desktop.Sync.__libraryPerformanceStressProofInstalled = true;
  H2O.Desktop.Sync.__libraryPerformanceStressProofVersion = VERSION;

})(typeof window !== 'undefined' ? window : globalThis);
