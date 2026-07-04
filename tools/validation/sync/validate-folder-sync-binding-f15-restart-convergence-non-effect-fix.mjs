#!/usr/bin/env node
//
// Folder Sync - F15 restart convergence non-effect fix validator.
//
// Proves the ordering + observability fix: the store exposes the convergence result, drives convergence through a
// one-shot readiness gate on init/reload, and the binding snapshot awaits that gate before reading canonical truth;
// plus that record-persistence and journal-verification shapes agree, consumed-but-reverted recovery survives, true
// already-current duplicate stays zero-write, and no boundary drifted. Source-grounded; a live restart proof is still
// separate.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-restart-convergence-non-effect-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const bindingAdapterPath = 'src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const executeJournalPath = 'src-surfaces-base/studio/sync/execute/execute-journal.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['a28f2a5c', 'e50db532', 'be3d982e'];

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, foldersStorePath, folderSyncPath, bindingAdapterPath, settlementWriterPath, executeJournalPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const bindingAdapter = read(bindingAdapterPath);
const settlementWriter = read(settlementWriterPath);
const executeJournal = read(executeJournalPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) assertIncludes(evidence, commit, `evidence commit ${commit}`);

for (const token of [
  'BINDING F15 RESTART CONVERGENCE NON-EFFECT FIXED',
  'fire-and-forget',
  'awaited before the binding snapshot',
  'Result not exposed for live proof',
  '__lastF15SettledBindingRestartConvergenceResult',
  'ensureF15SettledBindingRestartConvergenceReady',
  'whenF15SettledBindingRestartConvergenceReady',
  'one-shot memoized readiness gate',
  'The shapes are aligned',
  'bounded',
  'idempotent',
  'journal-verified',
  'fail-closed',
  'No manual convergence is required for product correctness',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'A real Desktop restart/reload Phase B proof is still required',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- Store: result exposed + one-shot ensure + init/reload drive it ----
assertIncludes(foldersStore, 'f15RestartConvergenceReadyPromise: null', 'one-shot memo field on state');
assert.ok((foldersStore.match(/api\.__lastF15SettledBindingRestartConvergenceResult = result/g) || []).length >= 2,
  'convergence result exposed on api at both return paths');
assertIncludes(foldersStore, 'function ensureF15SettledBindingRestartConvergenceReady', 'one-shot ensure helper present');
assertIncludes(foldersStore, 'state.f15RestartConvergenceReadyPromise = runF15SettledBindingRestartConvergence',
  'ensure memoizes the convergence promise');
assertIncludes(foldersStore, "ensureF15SettledBindingRestartConvergenceReady('init')", 'init drives convergence via ensure');
assertIncludes(foldersStore, "ensureF15SettledBindingRestartConvergenceReady('reload')", 'reload drives convergence via ensure');
assertIncludes(foldersStore, 'state.f15RestartConvergenceReadyPromise = null', 'reload resets the one-shot');
assertIncludes(foldersStore, 'whenF15SettledBindingRestartConvergenceReady: ensureF15SettledBindingRestartConvergenceReady',
  'ready gate exposed on api');
assertIncludes(foldersStore, 'runF15SettledBindingRestartConvergence: runF15SettledBindingRestartConvergence',
  'manual convergence diagnostic remains exposed');

// ---- Snapshot awaits convergence before reading canonical truth (ordering) ----
assertIncludes(folderSync, "await folders.whenF15SettledBindingRestartConvergenceReady('binding-snapshot')",
  'snapshot awaits convergence readiness');
const snapStart = folderSync.indexOf('async function chatFolderBindingCanonicalSnapshot');
const gateIdx = folderSync.indexOf("await folders.whenF15SettledBindingRestartConvergenceReady('binding-snapshot')", snapStart);
const readIdx = folderSync.indexOf('await folders.listCanonicalChatFolderBindings()', snapStart);
assert.ok(snapStart !== -1 && gateIdx !== -1 && readIdx !== -1 && gateIdx < readIdx,
  'convergence-ready await must precede the canonical folder_bindings read');

// ---- Record-persistence and journal-verification shapes AGREE ----
assertIncludes(bindingAdapter, "return 'library-binding-' + operation + '-applied';", 'envelope operationKind is *-applied');
assertIncludes(foldersStore, "return op ? 'library-binding-' + op + '-applied' : '';", 'verifier expected operationKind matches');
assertIncludes(settlementWriter, "phase: 'settled'", 'settled journal row phase is settled');
assertIncludes(settlementWriter, "var BINDING_DOMAIN = 'library.binding'", 'binding domain id is library.binding');
assertIncludes(settlementWriter, 'settlementDigest: cleanLower(safeObject(envelope.settlementShapes).settlementDigest)',
  'settled journal row carries evidence.settlementDigest');
assertIncludes(foldersStore, "row.phase === 'settled'", 'verifier requires settled phase');
assertIncludes(foldersStore, "row.domainId === 'library.binding'", 'verifier requires library.binding domain');
assertIncludes(foldersStore, 'cleanString(evidence.settlementDigest).toLowerCase() === cleanString(rec.settlementDigest).toLowerCase()',
  'verifier matches settlementDigest');
assertIncludes(executeJournal, 'function normalizeEvidence', 'execute journal normalizes evidence (preserves settlementDigest string)');

// ---- Consumed-but-reverted recovery + true duplicate zero-write remain (from a28f2a5c, unchanged) ----
assertIncludes(folderSync, "if ((intent === 'bind' || intent === 'move') && currentFolderId === targetFolderId) return 'duplicate';",
  'consumed bind/move duplicate requires target already current');
assertIncludes(folderSync, "if (intent === 'unbind' && !currentFolderId) return 'duplicate';",
  'consumed unbind duplicate requires already unbound');
assert.ok(!folderSync.includes("if (appliedKeys[cleanString(req.idempotencyKey)]) return 'duplicate';"),
  'old unconditional consumed short-circuit must stay gone');
assertIncludes(folderSync, 'already-consumed-before-recovery', 'consumed-but-reverted recovery keeps idempotency after gates');

// ---- Gates + boundaries intact ----
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false", 'full-merge fence intact');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assertIncludes(foldersStore, 'delegationResult.settlement.settled !== true', 'materializer requires settled F15');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'binding-mismatch remains blocked');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- Behavioral models: one-shot idempotency + snapshot ordering + convergence decision ----
function oneShotEnsure() {
  let runs = 0;
  let memo = null;
  const ensure = () => { if (!memo) { runs += 1; memo = Promise.resolve({ ok: true, run: runs }); } return memo; };
  return { ensure, runs: () => runs };
}
const os = oneShotEnsure();
os.ensure(); os.ensure(); os.ensure();
assert.equal(os.runs(), 1, 'one-shot ensure runs convergence at most once across repeated snapshots');

function convergeDecision(record, currentFolderId, journalOk) {
  if (!journalOk) return 'skipped';
  if (record.operation === 'bind' && currentFolderId === record.folderId) return 'already-current';
  if (record.operation === 'unbind' && currentFolderId !== record.folderId) return 'already-current';
  return 'converged';
}
assert.equal(convergeDecision({ operation: 'bind', folderId: 'new' }, 'old', true), 'converged', 'reverted bind re-materializes');
assert.equal(convergeDecision({ operation: 'bind', folderId: 'new' }, 'new', true), 'already-current', 'current bind is zero-write');
assert.equal(convergeDecision({ operation: 'bind', folderId: 'new' }, 'old', false), 'skipped', 'unconfirmed journal skips');

function classifyConsumed(consumed, intent, current, target) {
  if (consumed) {
    if ((intent === 'bind' || intent === 'move') && current === target) return 'duplicate';
    if (intent === 'unbind' && !current) return 'duplicate';
  }
  return null;
}
assert.equal(classifyConsumed(true, 'move', 'target', 'target'), 'duplicate', 'true duplicate zero-write');
assert.equal(classifyConsumed(true, 'move', 'old', 'target'), null, 'consumed-but-reverted recovers');

console.log(JSON.stringify({
  ok: true,
  verdict: 'BINDING_F15_RESTART_CONVERGENCE_NON_EFFECT_FIX_VALIDATED',
  convergenceRunsOnInitAndReload: true,
  convergenceResultExposed: true,
  snapshotAwaitsConvergenceBeforeCanonicalRead: true,
  recordAndJournalShapesAgree: true,
  oneShotIdempotent: true,
  consumedButRevertedRecovers: true,
  trueDuplicateZeroWrite: true,
  desktopRestartProofIncluded: false,
}, null, 2));
console.log('PASS validate-folder-sync-binding-f15-restart-convergence-non-effect-fix');
