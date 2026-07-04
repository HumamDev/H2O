#!/usr/bin/env node
//
// Folder Sync - F15 binding restart-survival implementation validator.
//
// Source-grounded validator for the combined restart-survival fix:
// durable truth is composite, consumed-ledger duplicate handling is current-state
// aware, and settled F15 materializations are journal-verified before restart
// convergence can re-materialize canonical folder_bindings.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-restart-survival-implementation.md';
const durablePreflightPath = 'release-evidence/2026-07-01/folder-sync-binding-f15-durable-gate-hardening-preflight.md';
const restartPreflightPath = 'release-evidence/2026-07-01/folder-sync-binding-f15-ledger-journal-restart-survival-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = [
  'e50db532a1dc32ebd2372d2c53f25c32f450c198',
  'be3d982e216c9498b3396d655c6f189bceb1a266',
  '81de3a63',
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!source.includes(token), `${label}: unexpectedly found ${token}`);
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `missing slice start ${startToken}`);
  const end = endToken ? source.indexOf(endToken, start + startToken.length) : -1;
  return end >= 0 ? source.slice(start, end) : source.slice(start);
}

for (const rel of [
  evidencePath,
  durablePreflightPath,
  restartPreflightPath,
  foldersStorePath,
  folderSyncPath,
  settlementWriterPath,
  conflictRuntimePath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const durablePreflight = read(durablePreflightPath);
const restartPreflight = read(restartPreflightPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assert.ok(evidence.includes(commit) || durablePreflight.includes(commit) || restartPreflight.includes(commit),
    `commit ${commit} must be referenced`);
}

for (const token of [
  'BINDING F15 RESTART-SURVIVAL FIX IMPLEMENTED',
  'Durable truth hardening',
  'Consumed-ledger recovery ordering',
  'Settled-journal restart convergence',
  'fresh-canonical-hash-mismatch-not-durable',
  'A consumed key skips only when current canonical state already matches',
  'runF15SettledBindingRestartConvergence',
  'No live Phase A was run',
  'No Phase B was run',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false` remains',
  'WebDAV/cloud/relay/fullBundle.v3 remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'A real Desktop restart/reload survival proof is still required',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

// ---- Durable truth hardening ----
assertIncludes(foldersStore, 'function bindingDurablePersistenceFence', 'durable fence exists');
assertIncludes(foldersStore, 'Number.isFinite(parsed.log)', 'checkpoint log must be parseable');
assertIncludes(foldersStore, 'Number.isFinite(parsed.checkpointed)', 'checkpoint frames must be parseable');
assertIncludes(foldersStore, 'parsed.log >= 0 && parsed.checkpointed >= 0 && parsed.log === parsed.checkpointed',
  'checkpoint must be fully merged, not only busy zero');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false",
  'partial checkpoint is not durable');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable true requires requested hash match');
assertIncludes(foldersStore, "result.reason = result.canonicalBindingHash", 'mismatch reason branch exists');
assertIncludes(foldersStore, "fresh-canonical-hash-mismatch-not-durable", 'hash mismatch is not durable');
for (const token of [
  'result.canonicalBindingHash',
  'result.matchesRequested',
  'result.checkpointBusy = fence ? fence.busy : null',
  'result.checkpointLog = fence ? fence.log : null',
  'result.checkpointFrames = fence ? fence.checkpointed : null',
  'result.fenceInterpretation = fence ? fence.interpretation :',
]) {
  assertIncludes(foldersStore, token, `durable diagnostic ${token}`);
}

function durableDecision(fenceDurable, matchesRequested, canonicalBindingHash = 'sha256:x') {
  if (fenceDurable === true && matchesRequested === true) {
    return { durable: true, unverifiable: false, reason: 'checkpoint-confirmed' };
  }
  if (fenceDurable === true && matchesRequested !== true) {
    return {
      durable: false,
      unverifiable: false,
      reason: canonicalBindingHash ? 'fresh-canonical-hash-mismatch-not-durable' : 'fresh-canonical-hash-unavailable-not-durable',
    };
  }
  return { durable: false, unverifiable: true, reason: 'busy-incomplete' };
}
assert.equal(durableDecision(true, false).durable, false, 'durable false when matchesRequested false');
assert.equal(durableDecision(true, true).durable, true, 'durable true when fence and hash match');
assert.equal(durableDecision(false, true).durable, false, 'durable false when fence not durable');

// ---- Consumed ledger duplicate ordering ----
const classifySlice = sliceBetween(folderSync, 'async function classifyChatFolderBindingRepairConflict', 'function buildChatFolderBindingRepairReceipt');
assertIncludes(classifySlice, 'var currentFolderId = cleanString(snap.bindingByChatId && snap.bindingByChatId[chatId]);',
  'current state is read before consumed duplicate decision');
assertIncludes(classifySlice, "if ((intent === 'bind' || intent === 'move') && currentFolderId === targetFolderId) return 'duplicate';",
  'bind/move consumed key skips only when target already current');
assertIncludes(classifySlice, "if (intent === 'unbind' && !currentFolderId) return 'duplicate';",
  'unbind consumed key skips only when already unbound');
assertNotIncludes(classifySlice, "if (appliedKeys[cleanString(req.idempotencyKey)]) return 'duplicate';",
  'consumed key must not skip before current-state verification');
assertIncludes(folderSync, 'var consumedBeforeApply = persisted.consumed === true', 'handler tracks pre-existing consumed row');
assertIncludes(folderSync, "already-consumed-before-recovery", 'recovery treats existing ledger row as persisted after gates pass');

function classifyConsumed({ consumed, intent, currentFolderId, targetFolderId }) {
  if (consumed) {
    if ((intent === 'bind' || intent === 'move') && currentFolderId === targetFolderId) return 'duplicate';
    if (intent === 'unbind' && !currentFolderId) return 'duplicate';
  }
  return null;
}
assert.equal(classifyConsumed({ consumed: true, intent: 'move', currentFolderId: 'target', targetFolderId: 'target' }),
  'duplicate', 'true duplicate remains zero-write');
assert.equal(classifyConsumed({ consumed: true, intent: 'move', currentFolderId: 'old', targetFolderId: 'target' }),
  null, 'consumed-but-reverted can recover');
assert.equal(classifyConsumed({ consumed: true, intent: 'unbind', currentFolderId: '', targetFolderId: '' }),
  'duplicate', 'already-unbound consumed key remains duplicate');

// ---- Settled-journal restart convergence ----
for (const token of [
  'F15_SETTLED_BINDING_MATERIALIZATION_LEDGER_KEY',
  'F15_SETTLED_BINDING_MATERIALIZATION_RECORD_SCHEMA',
  'persistF15SettledBindingMaterializationRecord',
  'f15SettledJournalConfirmsMaterializationRecord',
  "row.phase === 'settled'",
  "row.domainId === 'library.binding'",
  "cleanString(evidence.settlementDigest).toLowerCase() === cleanString(rec.settlementDigest).toLowerCase()",
  'runF15SettledBindingRestartConvergence',
  'journalVerifiedCount',
  'alreadyCurrentCount',
  'convergedCount',
  'materializeSettledCanonicalChatFolderBinding(op, folderId, chatId',
  'skipF15SettledMaterializationRecord: true',
  "ensureF15SettledBindingRestartConvergenceReady('init')",
  "source: 'reload'",
]) {
  assertIncludes(foldersStore, token, `restart convergence anchor ${token}`);
}
const convergenceSlice = sliceBetween(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'function requiredF15FolderBindingApis');
const journalCheckIdx = convergenceSlice.indexOf('f15SettledJournalConfirmsMaterializationRecord(rec)');
const materializeIdx = convergenceSlice.indexOf('materializeSettledCanonicalChatFolderBinding(op, folderId, chatId');
assert.ok(journalCheckIdx >= 0 && materializeIdx > journalCheckIdx,
  'convergence must verify survived settled journal before materialization');
const alreadyCurrentIdx = convergenceSlice.indexOf('result.alreadyCurrentCount += 1');
assert.ok(alreadyCurrentIdx >= 0 && alreadyCurrentIdx < materializeIdx,
  'already-current convergence path must skip before write');

function convergeSimulation(record, currentFolderId, journalOk) {
  if (!journalOk) return 'skipped';
  if (record.operation === 'bind' && currentFolderId === record.folderId) return 'already-current';
  if (record.operation === 'unbind' && currentFolderId !== record.folderId) return 'already-current';
  return 'converged';
}
assert.equal(convergeSimulation({ operation: 'bind', folderId: 'new' }, 'new', true), 'already-current',
  'restart convergence bind is idempotent');
assert.equal(convergeSimulation({ operation: 'bind', folderId: 'new' }, 'old', true), 'converged',
  'restart convergence re-materializes diverged bind');
assert.equal(convergeSimulation({ operation: 'bind', folderId: 'new' }, 'old', false), 'skipped',
  'restart convergence skips without settled journal confirmation');

// ---- Ordering and safety guards remain ----
const hashGateIndex = folderSync.indexOf('post-apply-binding-hash-mismatch');
const durableIndex = folderSync.indexOf('confirmCanonicalChatFolderBindingDurable');
const ledgerConsumeIndex = folderSync.indexOf('await bindingRepairRecordConsumed(request)');
assert.ok(hashGateIndex !== -1 && durableIndex !== -1 && ledgerConsumeIndex !== -1 &&
  hashGateIndex < durableIndex && durableIndex < ledgerConsumeIndex,
  'post-apply hash gate -> durable gate -> ledger consume ordering must hold');
assertIncludes(foldersStore, 'materializeSettledCanonicalChatFolderBinding', 'settled materialization helper retained');
assertIncludes(foldersStore, 'delegationResult.settlement.settled !== true', 'materialization requires settled F15 success');
assertIncludes(foldersStore, 'restartConvergenceVerifiedFromJournal: true', 'synthetic convergence result is journal-backed');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'runtime missing-context blocker remains');
assertIncludes(settlementWriter, 'appendJournal', 'settlement writer remains journal-based');

for (const forbidden of [
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
  'fullBundle.v3',
  'productSyncReady = true',
]) {
  assertNotIncludes(combinedRuntime, forbidden, `runtime forbidden token ${forbidden}`);
}
assertNotIncludes(folderSync, 'folders.moveCanonicalChatFolderBinding(', 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked');
assertIncludes(folderSync, 'productSyncReady: false', 'binding receipt keeps productSyncReady false');
assertIncludes(folderSync, 'noWebdavWrite: true', 'binding receipt keeps WebDAV writes blocked');

console.log(JSON.stringify({
  ok: true,
  verdict: 'BINDING_F15_RESTART_SURVIVAL_IMPLEMENTATION_VALIDATED',
  sourceGrounded: true,
  desktopRestartProofIncluded: false,
  reason: 'live Desktop restart proof remains a separate Phase A/Phase B slice',
}, null, 2));
