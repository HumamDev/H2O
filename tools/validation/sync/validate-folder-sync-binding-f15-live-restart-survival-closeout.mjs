#!/usr/bin/env node
//
// Folder Sync - F15 live restart-survival closeout validator.
//
// Static validator for the closeout evidence of the successful live Phase A (in-session) + Phase B (post full Desktop
// restart) proof of the F15-settled chat-folder binding repair. It confirms the evidence records the pass details,
// the journal-verified idempotent convergence, the truthful durable gate, zero-write duplicate replay, and that every
// release/safety boundary held (no fallback, productSyncReady false, binding-mismatch blocked, WebDAV/CAS blocked),
// and anchors the still-intact source gates. No product source is edited; no live proof is rerun.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const restartFixEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-restart-convergence-non-effect-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['81de3a63', 'a28f2a5c', 'a6f8b978'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, restartFixEvidencePath, foldersStorePath, folderSyncPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) assertIncludes(evidence, commit, `evidence commit ${commit}`);

for (const token of [
  // verdict + framing
  'F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN',
  'PHASE A + PHASE B PASSED',
  'no live Phase A/Phase B was rerun by this slice',
  OLD_HASH,
  REQUESTED_HASH,
  // Phase A
  'controlledApply.status:"applied"',
  'reason:"binding-repair-applied"',
  'canonicalBindingWriteCount:1',
  'idempotencyPersisted:true',
  'immediateReadbackMatchesRequested:true',
  'durableGate.durable:true',
  'duplicateReplayZeroWrite:true',
  // Phase B
  'binding-f15-settled-live-proof.phase-b.v3',
  'postRestartMatchesPhaseARequested:true',
  'oldHashNotRestored:true',
  'reconcileSurvivalProven:true',
  // convergence proof
  'convergenceReadyResult.source:"init"',
  'convergenceReadyResult.checkedCount:2',
  'convergenceReadyResult.journalVerifiedCount:2',
  'convergenceReadyResult.alreadyCurrentCount:2',
  'convergenceReadyResult.convergedCount:0',
  'convergenceReadyResult.blockers:[]',
  'convergenceReadyResult.warnings:[]',
  // durable truth
  'durable:true` only with `matchesRequested:true',
  'checkpointLog:0',
  'checkpointFrames:0',
  'log === checkpointed',
  // boundaries
  'No fallback',
  '`productSyncReady` was not flipped during the proof',
  '`binding-mismatch` remained blocked',
  'WebDAV/cloud/relay remained blocked; Chat Saving WebDAV/cloud/archive CAS remained blocked',
  // readiness state
  'is NOT performed by this closeout',
  'WebDAV/cloud/relay is NOT the next step',
  'separate binding-mismatch allowed-set',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// evidence must not over-claim
for (const forbidden of [
  'productSyncReady is true',
  'productSyncReady READY',
  'WebDAV ready',
  'binding-mismatch is allowed',
]) {
  assert.ok(!flat.includes(forbidden), `closeout must not claim: ${forbidden}`);
}

// ---- REAL SOURCE anchors: gates + boundaries remain intact (closeout edits no product source) ----
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false", 'full-merge fence intact');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence present');
assertIncludes(foldersStore, 'function ensureF15SettledBindingRestartConvergenceReady', 'convergence ready gate present');
assertIncludes(folderSync, "await folders.whenF15SettledBindingRestartConvergenceReady('binding-snapshot')", 'snapshot awaits convergence');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'binding-mismatch remains blocked in source');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-live-restart-survival-closeout.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-live-restart-survival-closeout',
  evidence: evidencePath,
  verdict: 'BINDING_F15_RESTART_SURVIVAL_LIVE_PROVEN',
  phaseAApplied: true,
  phaseBReconcileSurvivalProven: true,
  convergenceRanOnInit: true,
  convergenceJournalVerified: 2,
  convergenceAlreadyCurrent: 2,
  convergenceConverged: 0,
  durableTrueRequiresMatchesRequested: true,
  duplicateReplayZeroWrite: true,
  fallbackReintroduced: false,
  productSyncReadyFlipped: false,
  bindingMismatchBlocked: true,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  productSourceEditedByCloseout: false,
  livePhaseRerunByCloseout: false,
  nextStep: 'separate binding-mismatch allowed-set / productSyncReady readiness decision (NOT WebDAV/cloud/relay)',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-live-restart-survival-closeout');
