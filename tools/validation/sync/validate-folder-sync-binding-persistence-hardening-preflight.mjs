#!/usr/bin/env node
//
// Folder Sync - binding persistence hardening preflight validator.
//
// Static validator for the design-only durability/revert-resistance preflight. It verifies the evidence records
// the current blocker, required future proof categories, source-fix readiness inventory, and hard boundaries.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-persistence-hardening-preflight.md';
const stateSourceEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-state-source-diagnostic.md';
const readbackBlockedEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-post-apply-readback-blocked.md';
const controlledApplyEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-controlled-apply-proof.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const bindingReviewedApplyPath = 'src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const archiveBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

const COMMITS = ['d4d5db19', 'd139e062', '5c89ba95', 'd46f0805', '132002b6'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';

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
  stateSourceEvidencePath,
  readbackBlockedEvidencePath,
  controlledApplyEvidencePath,
  folderSyncPath,
  foldersStorePath,
  bindingReviewedApplyPath,
  importBundlePath,
  rustLibPath,
  folderImportPath,
  archiveBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const stateSourceEvidence = read(stateSourceEvidencePath);
const readbackBlockedEvidence = read(readbackBlockedEvidencePath);
const controlledApplyEvidence = read(controlledApplyEvidencePath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const bindingReviewedApply = read(bindingReviewedApplyPath);
const importBundle = read(importBundlePath);
const rustLib = read(rustLibPath);
const folderImport = read(folderImportPath);
const combinedSource = `${folderSync}\n${foldersStore}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  'BINDING PERSISTENCE HARDENING PREFLIGHT REQUIRED',
  'design-only preflight',
  'No product source was edited',
  OLD_HASH,
  REQUESTED_HASH,
  'snapshotHash = storeHash = directSqlHash',
  'consumedBindingRepairRows:1',
  'write-durability / later-revert gap',
  'same-session fresh canonical SQLite re-read',
  '75ms stability checks',
  'Consumed ledger row exists, but it is insufficient as canonical persistence proof',
  'Durable canonical persistence means',
  'commit/checkpoint/reopen',
  'persistence-verification-failure',
  'Durability harness',
  'Revert-detection proof',
  'Ledger-contingency proof',
  'Live reload-surviving proof',
  foldersStorePath,
  folderSyncPath,
  bindingReviewedApplyPath,
  importBundlePath,
  rustLibPath,
  'moveCanonicalChatFolderBinding',
  'bindChatLegacy',
  'unbindChat',
  'listCanonicalChatFolderBindings',
  'sqlExecute',
  'sqlSelect',
  'canonicalBindingStoreIdentity',
  'recordWrite',
  'applyChatFolderBindingRepairRequest',
  'chatFolderBindingCanonicalSnapshot',
  'buildChatFolderBindingRepairReceipt',
  'bindingRepairRecordConsumed',
  'bindingRepairAlreadyConsumed',
  'post-apply-binding-hash-mismatch',
  'Competing Writer Inventory',
  'binding-mismatch` remains blocked',
  'productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains `blocked`',
  'Chat Saving WebDAV/cloud/archive CAS remains `blocked`',
  'No binding allowed-set flip is authorized',
  'No blind live apply retry is approved',
  'Codex source-fix implementation preflight, then Claude review before any live retry',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(stateSourceEvidence, 'BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER',
  'state-source diagnostic verdict');
assertIncludes(stateSourceEvidence, '"snapshotMatchesStore": true', 'state-source snapshot/store agreement');
assertIncludes(stateSourceEvidence, '"snapshotMatchesDirectSql": true', 'state-source snapshot/direct SQL agreement');
assertIncludes(stateSourceEvidence, '"storeMatchesDirectSql": true', 'state-source store/direct SQL agreement');
assertIncludes(stateSourceEvidence, '"consumedBindingRepairRows": 1', 'state-source consumed row count');
assertIncludes(readbackBlockedEvidence, 'BINDING POST-APPLY READBACK BLOCKED', 'readback blocked verdict');
assertIncludes(controlledApplyEvidence, 'BINDING CONTROLLED APPLY PASSED', 'controlled apply historical proof');

assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '${REQUEST_SCHEMA}'`, 'binding request schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '${RECEIPT_SCHEMA}'`, 'binding receipt schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'binding apply gate source');
assertIncludes(folderSync, 'function applyChatFolderBindingRepairRequest', 'binding apply handler source');
assertIncludes(folderSync, 'function chatFolderBindingCanonicalSnapshot', 'canonical snapshot source');
assertIncludes(folderSync, 'function buildChatFolderBindingRepairReceipt', 'receipt builder source');
assertIncludes(folderSync, 'function bindingRepairRecordConsumed', 'ledger consume source');
assertIncludes(folderSync, 'function bindingRepairAlreadyConsumed', 'ledger replay source');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'same-session post-apply hash gate source');

assertIncludes(foldersStore, 'function moveCanonicalChatFolderBinding', 'move canonical binding source');
assertIncludes(foldersStore, 'function bindChat(', 'bindChat source');
assertIncludes(foldersStore, 'function bindChatLegacy', 'bindChatLegacy source');
assertIncludes(foldersStore, 'function unbindChat', 'unbindChat source');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindings', 'canonical reader source');
assertIncludes(foldersStore, 'function sqlExecute', 'sqlExecute source');
assertIncludes(foldersStore, 'function sqlSelect', 'sqlSelect source');
assertIncludes(foldersStore, 'function canonicalBindingStoreIdentity', 'store identity source');
assertIncludes(foldersStore, 'function recordWrite', 'recordWrite source');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch');
assertIncludes(foldersStore, 'INSERT OR REPLACE INTO folder_bindings', 'folder_bindings insert/replace writer source');
assertIncludes(foldersStore, 'DELETE FROM folder_bindings', 'folder_bindings delete writer source');

assertIncludes(bindingReviewedApply, 'BEGIN IMMEDIATE', 'reviewed apply transaction begin source');
assertIncludes(bindingReviewedApply, 'COMMIT', 'reviewed apply transaction commit source');
assertIncludes(bindingReviewedApply, 'INSERT INTO folder_bindings', 'reviewed apply folder_bindings writer source');
assertIncludes(importBundle, 'folderStore.bindChat', 'import bundle folder binding writer source');
assertIncludes(rustLib, 'CREATE TABLE folder_bindings', 'Rust migration folder_bindings table source');
assertIncludes(rustLib, 'PRIMARY KEY (chat_id)', 'Rust migration one-folder-per-chat primary key source');
assertIncludes(rustLib, 'f16_protect_folder_bindings_insert', 'Rust trigger protection insert source');
assertIncludes(rustLib, '.add_migrations("sqlite:studio-v1.db"', 'Rust SQL plugin migration registration source');

assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV remains deferred in folder import');
assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');

for (const forbidden of [
  'BINDING PERSISTENCE HARDENING PASSED',
  'binding-mismatch is allowed',
  'binding allowed-set flip passed',
  'productSyncReady is true',
  'WebDAV/cloud/relay ready',
  'blind live apply retry approved',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-persistence-hardening-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-persistence-hardening-preflight',
  evidence: evidencePath,
  verdict: 'BINDING_PERSISTENCE_HARDENING_PREFLIGHT_REQUIRED',
  commitsReferenced: COMMITS,
  oldHash: OLD_HASH,
  requestedAppliedHash: REQUESTED_HASH,
  snapshotStoreDirectSqlShowOldHash: true,
  consumedLedgerRowExistsButInsufficient: true,
  durableReloadSurvivingPersistenceRequired: true,
  proofCategories: [
    'durability-harness',
    'revert-detection',
    'ledger-contingency',
    'live-reload-surviving-proof',
  ],
  sourceFixReadinessFiles: [
    foldersStorePath,
    folderSyncPath,
    bindingReviewedApplyPath,
    importBundlePath,
    rustLibPath,
  ],
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  allowedSetFlipPerformed: false,
  productSourceEdited: false,
  recommendedNext: 'Codex source-fix implementation preflight, then Claude review before live retry',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-persistence-hardening-preflight');
