#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const moduleFile = 'src-surfaces-base/studio/sync/library/library-performance-stress-proof.tauri.js';
const conflictRuntimeFile = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const htmlFile = 'src-surfaces-base/studio/studio.html';
const packFile = 'tools/product/studio/pack-studio.mjs';
const contractFile = 'docs/systems/cross-platform/f16.3-performance-stress-contract.md';

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertExists(file) {
  assert(exists(file), `${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  assert(text.includes(needle), `${file}: missing ${label}`);
}

function assertNotContains(file, needle, label = needle) {
  const text = read(file);
  assert(!text.includes(needle), `${file}: unexpected ${label}`);
}

function assertOrder(file, before, after) {
  const text = read(file);
  const beforeIndex = text.indexOf(before);
  const afterIndex = text.indexOf(after);
  assert(beforeIndex !== -1, `${file}: missing order source ${before}`);
  assert(afterIndex !== -1, `${file}: missing order target ${after}`);
  if (beforeIndex !== -1 && afterIndex !== -1) {
    assert(beforeIndex < afterIndex, `${file}: ${before} must load before ${after}`);
  }
}

function allRealSideEffectsFalse(result) {
  const summary = result?.sideEffectSummary || {};
  return [
    'realBusinessTableWrites',
    'realBookkeepingWrites',
    'nativeCalled',
    'f5Touched',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'realSqlExecuted',
    'watermarkWritten',
    'consumedOperationWritten'
  ].every((key) => summary[key] === false);
}

function buildContext(env = {}) {
  let tick = 1000;
  const context = {
    console,
    __TAURI_INTERNALS__: { invoke() {} },
    performance: {
      now() {
        tick += 0.125;
        return tick;
      }
    },
    H2O: {
      Desktop: {
        Sync: {
          kernel: {
            canonicalJSON(value) {
              function canonicalize(node) {
                if (Array.isArray(node)) return node.map(canonicalize);
                if (!node || typeof node !== 'object') return node;
                const out = {};
                for (const key of Object.keys(node).sort()) {
                  if (typeof node[key] !== 'undefined') out[key] = canonicalize(node[key]);
                }
                return out;
              }
              return JSON.stringify(canonicalize(value));
            },
            isSha256Hex(value) {
              return /^[0-9a-f]{64}$/.test(String(value || '').trim());
            },
            validateReplayCandidate() {
              return { ok: true, replaySafe: true, blockers: [], warnings: [] };
            },
            validateWatermarkAdvance() {
              return { ok: true, watermarkSafe: true, blockers: [], warnings: [] };
            },
            validateConsumedOperation() {
              return { ok: true, blockers: [], warnings: [] };
            }
          }
        }
      }
    },
    process: { env }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProof(env = {}) {
  const context = buildContext(env);
  vm.runInContext(read(conflictRuntimeFile), context, { filename: conflictRuntimeFile });
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryPerformanceStressProofInstalled === true, 'runtime installed marker missing');
  assert(sync.__libraryPerformanceStressProofVersion === '0.2.0-f16.3.c', 'runtime version marker mismatch');
  assert(typeof sync.runLibraryPerformanceStressProof === 'function', 'runtime proof API missing');

  const result = await sync.runLibraryPerformanceStressProof();
  assert(result.schema === 'h2o.desktop.sync.library-performance-stress.v1', 'proof schema mismatch');
  assert(result.version === '0.2.0-f16.3.c', 'proof version mismatch');
  assert(result.ok === true, `lightweight proof did not pass: ${JSON.stringify(result.blockers || [])}`);
  assert(result.tier === 'lightweight', 'default tier must be lightweight');
  assert(result.seed === 'f16.3.c-lightweight', 'default seed mismatch');
  assert(result.scaleSummary?.chats === 1000, 'lightweight chats scale mismatch');
  assert(result.scaleSummary?.labels === 40, 'lightweight labels scale mismatch');
  assert(result.scaleSummary?.tags === 40, 'lightweight tags scale mismatch');
  assert(result.scaleSummary?.categories === 40, 'lightweight categories scale mismatch');
  assert(result.scaleSummary?.bindings === 1000, 'lightweight bindings scale mismatch');
  assert(result.scaleSummary?.bulkRows === 500, 'lightweight bulk row scale mismatch');
  assert(result.scaleSummary?.cacheRefreshEdges === 250, 'lightweight cache refresh scale mismatch');
  assert(result.scaleSummary?.replayEnvelopes === 500, 'lightweight replay scale mismatch');
  assert(result.phaseCount === 7, 'phase count mismatch');
  assert(result.passCount === 7, 'all stress phases must pass');
  assert(result.failCount === 0, 'stress proof must have zero failed phases');
  assert(result.correctnessSummary?.plantedAnomaliesChecked === true, 'planted anomalies must be checked');
  assert(result.correctnessSummary?.anomalyMisses === 0, 'stress proof must not miss planted anomalies');
  assert(result.privacySummary?.ok === true, 'privacy scan must pass');
  assert(result.performanceSummary?.heavyRequested === false, 'heavy stress must not run by default');
  assert(result.performanceSummary?.heavyDefault === false, 'heavy default marker must be false');
  assert(result.performanceSummary?.heavyEnvFlag === 'F16_STRESS_HEAVY=1', 'heavy env flag mismatch');
  assert(result.performanceSummary?.hardCeilingViolations?.length === 0, 'hard ceiling violations must be empty');
  assert(allRealSideEffectsFalse(result), 'real side effects must all be false');
  assert(result.sideEffectSummary?.syntheticFixtureWritesUsed === true, 'synthetic fixture marker missing');
  assert(result.sideEffectSummary?.injectedExecutorUsed === true, 'injected executor marker missing');
  assert(result.realApiPresence?.evaluateLibraryRuntimeConflict === true, 'runtime conflict dispatcher not referenced/present');
  assert(result.realApiPresence?.evaluateLibraryCatalogRuntimeConflict === true, 'catalog conflict gate not referenced/present');
  assert(result.realApiPresence?.evaluateLibraryBindingRuntimeConflict === true, 'binding conflict gate not referenced/present');
  assert(result.realApiPresence?.classifyLibraryBulkRuntimeConflictRows === true, 'bulk classifier not referenced/present');
  for (const phaseName of [
    'catalog lookup / canonicalization-shaped pass',
    'binding duplicate-check-shaped pass',
    'runtime conflict gate pass',
    'bulk classification pass',
    'cache refresh shaping pass',
    'replay defense-shaped pass',
    'residual object growth / rerun leak-proxy check'
  ]) {
    assert((result.phases || []).some((phase) => phase.name === phaseName), `missing runtime phase ${phaseName}`);
  }

  const outputText = JSON.stringify(result);
  for (const needle of [
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
  ]) {
    assert(!outputText.includes(needle), `proof output leaked ${needle}`);
  }

  return result;
}

async function runHeavyVmProof() {
  const context = buildContext({ F16_STRESS_HEAVY: '1' });
  vm.runInContext(read(conflictRuntimeFile), context, { filename: conflictRuntimeFile });
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  const heavy = await sync.runLibraryPerformanceStressProof({ seed: 'f16.3.c-heavy-smoke' });
  assert(heavy.schema === 'h2o.desktop.sync.library-performance-stress.v1', 'heavy proof schema mismatch');
  assert(heavy.version === '0.2.0-f16.3.c', 'heavy proof version mismatch');
  assert(heavy.ok === true, `heavy proof did not pass: ${JSON.stringify(heavy.blockers || [])}`);
  assert(heavy.tier === 'heavy', 'heavy proof tier mismatch');
  assert(heavy.seed === 'f16.3.c-heavy-smoke', 'heavy seed must be reported');
  assert(heavy.scaleSummary?.chats === 10000, 'heavy chats scale mismatch');
  assert(heavy.scaleSummary?.labels === 100, 'heavy labels scale mismatch');
  assert(heavy.scaleSummary?.tags === 100, 'heavy tags scale mismatch');
  assert(heavy.scaleSummary?.categories === 100, 'heavy categories scale mismatch');
  assert(heavy.scaleSummary?.bindings === 10000, 'heavy bindings scale mismatch');
  assert(heavy.scaleSummary?.bulkRows === 5000, 'heavy bulk rows scale mismatch');
  assert(heavy.scaleSummary?.cacheRefreshEdges === 2500, 'heavy cache refresh scale mismatch');
  assert(heavy.scaleSummary?.replayEnvelopes === 5000, 'heavy replay scale mismatch');
  assert(heavy.phaseCount === 7, 'heavy phase count mismatch');
  assert(heavy.passCount === 7, 'heavy phases must pass');
  assert(heavy.failCount === 0, 'heavy proof must have zero failed phases');
  assert(heavy.correctnessSummary?.plantedAnomaliesChecked === true, 'heavy planted anomalies must be checked');
  assert(heavy.correctnessSummary?.anomalyMisses === 0, 'heavy proof must not miss planted anomalies');
  assert(heavy.privacySummary?.ok === true, 'heavy privacy scan must pass');
  assert(allRealSideEffectsFalse(heavy), 'heavy real side effects must all be false');
  return heavy;
}

async function main() {
  assertExists(contractFile);
  assertExists(moduleFile);
  assertExists(conflictRuntimeFile);
  assertExists(htmlFile);
  assertExists(packFile);

  assertContains(moduleFile, 'runLibraryPerformanceStressProof');
  assertContains(moduleFile, '__libraryPerformanceStressProofInstalled');
  assertContains(moduleFile, '__libraryPerformanceStressProofVersion = VERSION');
  assertContains(moduleFile, "0.2.0-f16.3.c");
  assertContains(moduleFile, 'h2o.desktop.sync.library-performance-stress.v1');

  for (const scaleNeedle of [
    'LIGHTWEIGHT_SCALE',
    'chats: 1000',
    'labels: 40',
    'tags: 40',
    'categories: 40',
    'bindings: 1000',
    'bulkRows: 500',
    'cacheRefreshEdges: 250',
    'replayEnvelopes: 500',
    'HEAVY_SCALE',
    'chats: 10000',
    'bindings: 10000',
    'bulkRows: 5000',
    'F16_STRESS_HEAVY=1',
    'heavyDefault: false',
    'DEFAULT_HEAVY_SEED',
    'runStressTier'
  ]) {
    assertContains(moduleFile, scaleNeedle, `scale/heavy marker ${scaleNeedle}`);
  }
  assertNotContains(moduleFile, 'heavy-requested-placeholder', 'F16.3.b heavy placeholder');
  assertNotContains(moduleFile, 'library-performance-stress-heavy-deferred-to-f16.3.c', 'F16.3.b heavy deferred warning');

  for (const phaseName of [
    'catalog lookup / canonicalization-shaped pass',
    'binding duplicate-check-shaped pass',
    'runtime conflict gate pass',
    'bulk classification pass',
    'cache refresh shaping pass',
    'replay defense-shaped pass',
    'residual object growth / rerun leak-proxy check'
  ]) {
    assertContains(moduleFile, phaseName, `phase ${phaseName}`);
  }

  for (const metric of [
    'durationMs',
    'opCount',
    'scalingRatio',
    'anomaliesPlanted',
    'anomaliesDetected',
    'budgetMs',
    'budgetExceeded',
    'hardCeilingViolated',
    'totalDurationMs',
    'maxPhaseDurationMs',
    'residualGrowth',
    'heapDeltaWarningOnly'
  ]) {
    assertContains(moduleFile, metric, `metric ${metric}`);
  }

  for (const blocker of [
    'library-performance-stress-anomaly-miss',
    'library-performance-stress-scaling-ratio-blowup',
    'library-performance-stress-hard-ceiling-violation',
    'library-performance-stress-residual-object-growth',
    'library-performance-stress-privacy-leak',
    'library-performance-stress-side-effect-flag-flip'
  ]) {
    assertContains(moduleFile, blocker, `blocker ${blocker}`);
  }

  for (const apiRef of [
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
  ]) {
    assertContains(moduleFile, apiRef, `real module/API reference ${apiRef}`);
  }

  for (const guardrail of [
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
  ]) {
    assertContains(moduleFile, guardrail, `privacy guardrail ${guardrail}`);
  }

  for (const sideEffect of [
    'realBusinessTableWrites',
    'realBookkeepingWrites',
    'nativeCalled',
    'f5Touched',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'realSqlExecuted',
    'watermarkWritten',
    'consumedOperationWritten',
    'syntheticFixtureWritesUsed',
    'injectedExecutorUsed'
  ]) {
    assertContains(moduleFile, sideEffect, `side-effect field ${sideEffect}`);
  }

  assertContains(htmlFile, './sync/library/library-performance-stress-proof.tauri.js', 'studio.html performance loader');
  assertContains(packFile, 'sync/library/library-performance-stress-proof.tauri.js', 'pack-studio performance module');
  assertOrder(htmlFile, './sync/library/library-multipeer-soak-proof.tauri.js', './sync/library/library-performance-stress-proof.tauri.js');
  assertOrder(packFile, '"sync/library/library-multipeer-soak-proof.tauri.js"', '"sync/library/library-performance-stress-proof.tauri.js"');

  const result = await runVmProof();
  let heavyResult = null;
  if (process.env.F16_STRESS_HEAVY === '1') {
    heavyResult = await runHeavyVmProof();
  }
  if (failures.length) {
    console.error('F16 library performance stress validation failed');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('F16 library performance stress validation passed');
  console.log(JSON.stringify({
    tier: result.tier,
    scaleSummary: result.scaleSummary,
    phaseCount: result.phaseCount,
    passCount: result.passCount,
    anomalyMisses: result.correctnessSummary?.anomalyMisses,
    heavyDefault: result.performanceSummary?.heavyDefault,
    heavySmokeRan: !!heavyResult,
    heavyPassCount: heavyResult?.passCount || 0,
    privacyOk: result.privacySummary?.ok,
    realSideEffectsSafe: allRealSideEffectsFalse(result)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
