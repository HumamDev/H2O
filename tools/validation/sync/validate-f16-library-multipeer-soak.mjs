#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();
const failures = [];

const moduleFile = 'src-surfaces-base/studio/sync/library/library-multipeer-soak-proof.tauri.js';
const conflictRuntimeFile = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const htmlFile = 'src-surfaces-base/studio/studio.html';
const packFile = 'tools/product/studio/pack-studio.mjs';
const contractFile = 'docs/systems/cross-platform/f16.2-multipeer-offline-online-soak-contract.md';

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

function codeList(value) {
  return Array.isArray(value) ? value.map((entry) => {
    if (entry && typeof entry === 'object') return String(entry.code || '').trim();
    return String(entry || '').trim();
  }).filter(Boolean) : [];
}

function allSideEffectsFalse(result) {
  const summary = result?.sideEffectSummary || {};
  return [
    'storageWritten',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'nativeCalled',
    'f5Touched',
    'applyExecuted',
    'watermarkWritten',
    'consumedOperationWritten',
    'bookkeepingWritten',
    'cacheRefreshWritten',
    'journalWritten',
    'sqlExecutedForBlockedBulkRows'
  ].every((key) => summary[key] === false);
}

function ledgerDeltasZero(row) {
  const deltas = row?.ledgerDeltas || {};
  return [
    'consumedOperationWrites',
    'watermarkWrites',
    'bookkeepingWrites',
    'cacheRefreshWrites',
    'publicationTerminalMutations',
    'relayTerminalMutations',
    'outboxTerminalMutations',
    'nativeCalls',
    'f5Calls',
    'applySideEffects',
    'journalSideEffects',
    'sqlExecutionForBlockedBulkRows'
  ].every((key) => Number(deltas[key] || 0) === 0);
}

function buildContext() {
  const context = {
    console,
    __TAURI_INTERNALS__: { invoke() {} },
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
            validateConsumedOperation() {
              return { ok: true, blockers: [], warnings: [] };
            },
            validateWatermarkAdvance() {
              return { ok: true, watermarkSafe: true, blockers: [], warnings: [] };
            }
          }
        }
      }
    },
    process: { env: {} }
  };
  context.globalThis = context;
  return vm.createContext(context);
}

async function runVmProof() {
  const context = buildContext();
  vm.runInContext(read(conflictRuntimeFile), context, { filename: conflictRuntimeFile });
  vm.runInContext(read(moduleFile), context, { filename: moduleFile });
  const sync = context.H2O.Desktop.Sync;
  assert(sync.__libraryMultiPeerSoakProofInstalled === true, 'runtime installed marker missing');
  assert(sync.__libraryMultiPeerSoakProofVersion === '0.1.0-f16.2.b', 'runtime version marker mismatch');
  assert(typeof sync.runLibraryMultiPeerSoakProof === 'function', 'runtime proof API missing');
  const result = await sync.runLibraryMultiPeerSoakProof();
  assert(result.schema === 'h2o.desktop.sync.library-multipeer-soak.v1', 'proof schema mismatch');
  assert(result.version === '0.1.0-f16.2.b', 'proof version mismatch');
  assert(result.ok === true, `proof did not pass: ${JSON.stringify(result.blockers || [])}`);
  assert(result.peerCount === 2, 'default proof must use two peers');
  assert(result.scenarioCount === 14, 'default proof must include 14 scenarios');
  assert(result.passCount === 14, 'all lightweight scenarios must pass');
  assert(result.failCount === 0, 'lightweight proof must have zero failures');
  assert(result.performanceSummary?.heavyRequested === false, 'heavy soak must not run by default');
  assert(result.performanceSummary?.heavyDefault === false, 'heavy soak default marker must be false');
  assert(result.performanceSummary?.heavyEnvFlag === 'F16_SOAK_HEAVY=1', 'heavy env flag mismatch');
  assert(result.performanceSummary?.no10kScaleStressDefault === true, '10k stress must not be default');
  assert(allSideEffectsFalse(result), 'sideEffectSummary must be all false');
  assert(result.privacySummary?.ok === true, 'privacy scan must pass');
  assert(result.conflictSummary?.runtimeApiPresence?.evaluateLibraryRuntimeConflict === true, 'dispatcher runtime API not present in proof');
  assert(result.conflictSummary?.runtimeApiPresence?.evaluateLibraryCatalogRuntimeConflict === true, 'catalog runtime API not present in proof');
  assert(result.conflictSummary?.runtimeApiPresence?.evaluateLibraryBindingRuntimeConflict === true, 'binding runtime API not present in proof');
  assert(result.conflictSummary?.runtimeApiPresence?.classifyLibraryBulkRuntimeConflictRows === true, 'bulk runtime API not present in proof');
  for (const row of result.scenarios || []) {
    assert(row.ok === true, `${row.caseId}: scenario failed`);
    assert(row.privacySafe === true, `${row.caseId}: privacySafe false`);
    assert(row.sideEffectsSafe === true, `${row.caseId}: sideEffectsSafe false`);
    assert(ledgerDeltasZero(row), `${row.caseId}: ledger deltas must be zero`);
  }
  const observed = new Set((result.scenarios || []).flatMap((row) => row.observedCodes || []));
  for (const code of [
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
  ]) {
    assert(observed.has(code), `runtime proof missing observed code ${code}`);
  }
  const text = JSON.stringify(result);
  for (const needle of [
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
  ]) {
    assert(!text.includes(needle), `proof output leaked ${needle}`);
  }
  return result;
}

async function main() {
  assertExists(contractFile);
  assertExists(moduleFile);
  assertExists(conflictRuntimeFile);
  assertExists(htmlFile);
  assertExists(packFile);

  assertContains(moduleFile, 'runLibraryMultiPeerSoakProof');
  assertContains(moduleFile, '__libraryMultiPeerSoakProofInstalled');
  assertContains(moduleFile, "__libraryMultiPeerSoakProofVersion = VERSION");
  assertContains(moduleFile, "0.1.0-f16.2.b");
  assertContains(moduleFile, "h2o.desktop.sync.library-multipeer-soak.v1");
  assertContains(moduleFile, 'evaluateLibraryRuntimeConflict');
  assertContains(moduleFile, 'evaluateLibraryCatalogRuntimeConflict');
  assertContains(moduleFile, 'evaluateLibraryBindingRuntimeConflict');
  assertContains(moduleFile, 'classifyLibraryBulkRuntimeConflictRows');
  assertContains(moduleFile, 'F16_SOAK_HEAVY=1');
  assertContains(moduleFile, 'heavyDefault: false');
  assertContains(moduleFile, 'no10kScaleStressDefault');
  assertContains(moduleFile, 'validateReplayCandidate');
  assertContains(moduleFile, 'validateWatermarkAdvance');
  assertContains(moduleFile, 'validateConsumedOperation');

  for (const field of [
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
  ]) {
    assertContains(moduleFile, field, `peer model field ${field}`);
  }

  for (const mode of [
    'peer A online / peer B offline',
    'both peers offline',
    'delayed replay',
    'duplicate replay',
    'stale-base replay',
    'out-of-order replay',
    'exact replay idempotency',
    'conflicting replay fail-closed before settlement mutation'
  ]) {
    assertContains(moduleFile, mode, `replay mode ${mode}`);
  }

  for (const scenario of [
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
  ]) {
    assertContains(moduleFile, scenario, `scenario ${scenario}`);
  }

  for (const code of [
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
  ]) {
    assertContains(moduleFile, code, `expected code ${code}`);
  }

  for (const ledgerField of [
    'consumedOperationWrites',
    'watermarkWrites',
    'bookkeepingWrites',
    'cacheRefreshWrites',
    'publicationTerminalMutations',
    'relayTerminalMutations',
    'outboxTerminalMutations',
    'nativeCalls',
    'f5Calls',
    'applySideEffects',
    'journalSideEffects',
    'sqlExecutionForBlockedBulkRows'
  ]) {
    assertContains(moduleFile, ledgerField, `ledger zero field ${ledgerField}`);
  }

  for (const guardrail of [
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
  ]) {
    assertContains(moduleFile, guardrail, `privacy guardrail ${guardrail}`);
  }

  assertContains(htmlFile, './sync/library/library-multipeer-soak-proof.tauri.js', 'studio.html loader');
  assertContains(packFile, 'sync/library/library-multipeer-soak-proof.tauri.js', 'pack-studio module');
  assertOrder(htmlFile, './sync/library/library-conflict-runtime.tauri.js', './sync/library/library-multipeer-soak-proof.tauri.js');
  assertOrder(packFile, '"sync/library/library-conflict-runtime.tauri.js"', '"sync/library/library-multipeer-soak-proof.tauri.js"');

  const result = await runVmProof();
  if (failures.length) {
    console.error('F16 library multipeer soak validation failed');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('F16 library multipeer soak validation passed');
  console.log(JSON.stringify({
    scenarioCount: result.scenarioCount,
    passCount: result.passCount,
    heavyDefault: result.performanceSummary?.heavyDefault,
    privacyOk: result.privacySummary?.ok,
    sideEffectsSafe: allSideEffectsFalse(result)
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
