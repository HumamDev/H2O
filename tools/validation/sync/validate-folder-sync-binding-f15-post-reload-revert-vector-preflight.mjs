#!/usr/bin/env node
//
// Folder Sync - F15 post-reload revert vector preflight/investigation validator (design-only).
//
// Static validator for the design-only investigation that records the Phase B post-reload revert after 81de3a63.
// It proves the evidence records: Phase A pass + Phase B old-hash restoration; that the repair snapshot reads TRUE
// SQLite folder_bindings (so the revert is a real SQLite overwrite on boot); the split source-of-truth (repair writes
// SQLite, not the FOLDER_STATE_DATA_KEY mirror); the competing folder_bindings writers / boot suspects; the required
// live boot diagnostic; the fix direction; and every release/safety boundary. It anchors these against REAL, STABLE
// source symbols. No source fix, no live apply, no Phase A/B, no reload.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-post-reload-revert-vector-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const reviewedApplyPath = 'src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js';
const resumeOnBootPath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['bb4675dc', '5dc99e11', '81de3a63'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e';

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

for (const rel of [
  evidencePath,
  foldersStorePath,
  folderSyncPath,
  importBundlePath,
  reviewedApplyPath,
  resumeOnBootPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const importBundle = read(importBundlePath);
const reviewedApply = read(reviewedApplyPath);
const resumeOnBoot = read(resumeOnBootPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'BINDING F15 POST-RELOAD REVERT VECTOR IDENTIFIED',
  'design-only investigation and preflight',
  // Phase A pass
  'controlledApply.status:"applied"',
  'canonicalBindingWriteCount:1',
  'idempotencyPersisted:true',
  'immediateReadbackMatchesRequested:true',
  'checkpoint-confirmed',
  // Phase B fail
  OLD_HASH,
  REQUESTED_HASH,
  'postReloadSnapshotHash',
  'postReloadRecomputedHash',
  'postReloadMatchesPhaseARequested:false',
  'oldHashNotRestored:false',
  'reconcileSurvivalProven:false',
  // root cause
  'reads TRUE SQLite',
  'chatFolderBindingCanonicalSnapshot',
  'listCanonicalChatFolderBindings',
  'SQLite `folder_bindings` overwrite',
  'never updates the `FOLDER_STATE_DATA_KEY` mirror',
  'materializeSettledCanonicalChatFolderBinding',
  'split source-of-truth',
  'importFolderBindings',
  'folderStore.bindChat',
  'binding-reviewed-apply.tauri.js',
  'resumeExecuteOnBoot',
  'not statically evident',
  'canonical-DB-path mismatch',
  // answers
  'TRUE SQLite `folder_bindings` via `listCanonicalChatFolderBindings`',
  'bindingRepairAlreadyConsumed',
  // fix direction
  'prevent startup from overwriting canonical `folder_bindings`',
  'converges the `FOLDER_STATE_DATA_KEY` mirror',
  'Not **B** alone',
  'Not **C** unless',
  'must NOT be edited',
  // required confirmation
  'live boot diagnostic',
  'no product-source change',
  // validators + evidence
  'Reconcile-survival implementation validator',
  'folder-sync-binding-f15-post-reload-reconcile-survival-implementation.md',
  // live retry conditions
  'postReloadSnapshotHash === requestedBindingHash',
  'reconcileSurvivalProven:true',
  // boundaries
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: snapshot reads SQLite folder_bindings (revert = real SQLite overwrite) ----
assertIncludes(folderSync, 'function chatFolderBindingCanonicalSnapshot', 'repair snapshot function present');
assertIncludes(folderSync, 'listCanonicalChatFolderBindings', 'snapshot reads canonical SQLite folder_bindings');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'idempotency precheck present (replay is skipped)');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat', 'canonical per-chat SQLite read present');
assertIncludes(foldersStore, 'SELECT folder_id FROM folder_bindings', 'canonical SQLite folder_bindings read present');

// ---- REAL SOURCE anchors: split source-of-truth (repair writes SQLite; mirror is separate) ----
assertIncludes(foldersStore, 'async function materializeSettledCanonicalChatFolderBinding', 'settled materializer present');
assertIncludes(foldersStore, "var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1'", 'folder-state mirror key present');
// the settled materializer helper body must not write the mirror (proves the split at the write side)
const helperStart = foldersStore.indexOf('async function materializeSettledCanonicalChatFolderBinding');
const helperEnd = foldersStore.indexOf('function patchToCols', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'materializer helper slice must be locatable');
const helperSlice = foldersStore.slice(helperStart, helperEnd);
assert.ok(!helperSlice.includes('FOLDER_STATE_DATA_KEY') && !helperSlice.includes('chromeStorageSet'),
  'settled materializer must not write the folder-state mirror (confirms split source-of-truth)');

// ---- REAL SOURCE anchors: competing folder_bindings writers / boot suspects ----
assertIncludes(importBundle, 'async function importFolderBindings', 'bundle import re-applies folder bindings');
assertIncludes(importBundle, 'folderStore.bindChat(', 'bundle import writes bindings via bindChat');
assertIncludes(importBundle, 'async function importFolderStateOnly', 'folder-state-only import path present');
assertIncludes(reviewedApply, 'INSERT INTO folder_bindings', 'reviewed-apply is a competing folder_bindings writer');
assertIncludes(resumeOnBoot, 'resumeExecuteOnBoot', 'execute resume-on-boot path present (suspect)');

// ---- REAL SOURCE anchors: gates / boundaries remain intact and unedited by this investigation ----
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate present');
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair routes through F15 delegation');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'repair must not set explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'repair must not set allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'repair must not set f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked in source');
assertIncludes(foldersStore, 'parsed.busy === 1', 'busy-aware fence remains');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- design must remain design-only (no premature fix/success claims) ----
for (const forbidden of [
  'POST-RELOAD REVERT FIXED',
  'reconcile survival implemented',
  'Phase B passed',
  'Phase B survived',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-post-reload-revert-vector-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-post-reload-revert-vector-preflight',
  evidence: evidencePath,
  priorMaterializationCommit: '81de3a63',
  phaseAPassed: true,
  phaseBReverted: true,
  snapshotReadsSqlite: true,
  repairUpdatesMirror: false,
  splitSourceOfTruth: true,
  exactBootWriterPinned: false,
  narrowedSuspects: ['boot re-hydration/import re-applies stale mirror/bundle via bindChat/importFolderBindings',
    'resumeExecuteOnBoot re-dispatch', 'binding-reviewed-apply at boot', 'canonical-DB-path mismatch'],
  recommendedFixDirection: 'A (SQLite folder_bindings authoritative; stop boot overwrite from stale mirror/bundle) + D (F15 materialization converges the mirror)',
  requiresLiveBootDiagnostic: true,
  designOnly: true,
  liveApplyPerformed: false,
  phaseBBypassed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'read-only live boot diagnostic to pin the folder_bindings boot writer, then design reconcile-survival fix (A+D) + independent review',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-post-reload-revert-vector-preflight');
