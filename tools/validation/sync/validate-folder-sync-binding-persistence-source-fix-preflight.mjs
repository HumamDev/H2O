#!/usr/bin/env node
//
// Folder Sync - binding persistence source-fix implementation preflight validator.
//
// Static validator for the design-only implementation preflight. It verifies the evidence records the exact
// source-fix plan, required proof strategy, NO-GO boundaries, and live source anchors without editing product source.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-persistence-source-fix-preflight.md';
const hardeningEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-persistence-hardening-preflight.md';
const stateSourceEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-state-source-diagnostic.md';
const readbackBlockedEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-post-apply-readback-blocked.md';
const controlledApplyEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-controlled-apply-proof.md';
const dryRunEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-live-dry-run-proof-after-implementation.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';

const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const bindingReviewedApplyPath = 'src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['d4d5db19', 'd139e062', '5c89ba95', 'd46f0805', '132002b6', '01dc9957'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';
const FAILURE_REASON = 'persistence-verification-failure';

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
  hardeningEvidencePath,
  stateSourceEvidencePath,
  readbackBlockedEvidencePath,
  controlledApplyEvidencePath,
  dryRunEvidencePath,
  implementationEvidencePath,
  foldersStorePath,
  folderSyncPath,
  bindingReviewedApplyPath,
  importBundlePath,
  tombstoneReviewsPath,
  rustLibPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const hardeningEvidence = read(hardeningEvidencePath);
const stateSourceEvidence = read(stateSourceEvidencePath);
const readbackBlockedEvidence = read(readbackBlockedEvidencePath);
const controlledApplyEvidence = read(controlledApplyEvidencePath);
const dryRunEvidence = read(dryRunEvidencePath);
const implementationEvidence = read(implementationEvidencePath);

const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const bindingReviewedApply = read(bindingReviewedApplyPath);
const importBundle = read(importBundlePath);
const tombstoneReviews = read(tombstoneReviewsPath);
const rustLib = read(rustLibPath);
const folderImport = read(folderImportPath);
const combinedProductSource = [
  foldersStore,
  folderSync,
  bindingReviewedApply,
  importBundle,
  tombstoneReviews,
  rustLib,
  folderImport,
].join('\n');

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  'BINDING PERSISTENCE SOURCE-FIX PREFLIGHT READY',
  'implementation-preflight document only',
  'No product source was edited',
  OLD_HASH,
  REQUESTED_HASH,
  'snapshotHash = storeHash = directSqlHash = old before hash',
  'consumedBindingRepairRows:1',
  'status:"applied"',
  'idempotencyPersisted:true',
  'consumed-ledger insertion are only valid after durable canonical persistence is proven',
  'persistence-verification-failure',
  foldersStorePath,
  folderSyncPath,
  bindingReviewedApplyPath,
  importBundlePath,
  tombstoneReviewsPath,
  rustLibPath,
  'moveCanonicalChatFolderBinding',
  'bindChatLegacy',
  'unbindChatLegacy',
  'listCanonicalChatFolderBindingsForChat',
  'getCanonicalChatFolderBindingForChat',
  'sqlExecute',
  'sqlSelect',
  'canonicalBindingStoreIdentity',
  'recordWrite',
  'applyChatFolderBindingRepairRequest',
  'chatFolderBindingCanonicalSnapshot',
  'chatFolderBindingHashFromRows',
  'buildChatFolderBindingRepairReceipt',
  'bindingRepairRecordConsumed',
  'bindingRepairAlreadyConsumed',
  'validateChatFolderBindingRepairRequestForDesktopApply',
  REQUEST_SCHEMA,
  RECEIPT_SCHEMA,
  APPLY_GATE,
  'post-apply-binding-hash-mismatch',
  'INSERT OR REPLACE INTO folder_bindings',
  'DELETE FROM folder_bindings',
  'INSERT INTO folder_bindings',
  'BEGIN IMMEDIATE',
  'COMMIT',
  'folderStore.bindChat',
  'folders.moveCanonicalChatFolderBinding',
  'PRIMARY KEY (chat_id)',
  'Ranked Implementation Options',
  'Chosen: store durable verification helper plus handler durable gate',
  'Handler-only extra snapshot read',
  'Rejected as insufficient',
  'Rewrite binding repair around reviewed apply transaction',
  'Allow-set flip despite readback block',
  'Later Patch Boundaries',
  'Durability / reopen-or-fence harness',
  'Revert-detection harness',
  'Ledger-contingency harness',
  'Receipt contract validator for `persistence-verification-failure`',
  'Boundary validator keeping `binding-mismatch`, `productSyncReady`, WebDAV/cloud/relay, and Chat Saving CAS blocked',
  'Binding live dry-run',
  'Binding controlled apply with `folder-sync-chat-folder-binding-repair-apply`',
  'App reload/restart or equivalent fresh readback',
  'Canonical binding hash still equals requested hash',
  'Consumed ledger row matches durable canonical state',
  'Duplicate replay is zero-write/no-op',
  'No blind live retry',
  'No same-session-only success claim',
  'No ledger consume before durable proof',
  'No weakening `post-apply-binding-hash-mismatch`',
  'No binding allowed-set flip',
  'No `productSyncReady`',
  'No WebDAV/cloud/relay',
  'No Chat Saving CAS',
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains `blocked`',
  'Chat Saving WebDAV/cloud/archive CAS remains `blocked`',
  'Claude review of this source-fix preflight before Codex implementation',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const token of [
  'BINDING PERSISTENCE HARDENING PREFLIGHT REQUIRED',
  'persistence-verification-failure',
  'Consumed ledger row exists, but it is insufficient as canonical persistence proof',
]) {
  assertIncludes(hardeningEvidence, token, `hardening evidence ${token}`);
}

assertIncludes(stateSourceEvidence, 'BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER',
  'state-source diagnostic verdict');
assertIncludes(stateSourceEvidence, '"snapshotMatchesStore": true', 'state-source snapshot/store agreement');
assertIncludes(stateSourceEvidence, '"snapshotMatchesDirectSql": true', 'state-source snapshot/direct SQL agreement');
assertIncludes(stateSourceEvidence, '"storeMatchesDirectSql": true', 'state-source store/direct SQL agreement');
assertIncludes(stateSourceEvidence, '"consumedBindingRepairRows": 1', 'state-source consumed row count');
assertIncludes(readbackBlockedEvidence, 'BINDING POST-APPLY READBACK BLOCKED', 'readback blocked verdict');
assertIncludes(controlledApplyEvidence, 'BINDING CONTROLLED APPLY PASSED', 'controlled apply historical proof');
assertIncludes(dryRunEvidence, 'BINDING LIVE DRY-RUN PASSED', 'dry-run historical proof');
assertIncludes(implementationEvidence, 'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN',
  'binding implementation historical proof');

assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '${REQUEST_SCHEMA}'`, 'binding request schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '${RECEIPT_SCHEMA}'`, 'binding receipt schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'binding apply gate source');
assertIncludes(folderSync, 'function applyChatFolderBindingRepairRequest', 'binding apply handler source');
assertIncludes(folderSync, 'function chatFolderBindingCanonicalSnapshot', 'canonical snapshot source');
assertIncludes(folderSync, 'async function chatFolderBindingHashFromRows', 'binding hash helper source');
assertIncludes(folderSync, 'function buildChatFolderBindingRepairReceipt', 'receipt builder source');
assertIncludes(folderSync, 'function bindingRepairRecordConsumed', 'ledger consume source');
assertIncludes(folderSync, 'function bindingRepairAlreadyConsumed', 'ledger replay source');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'same-session post-apply hash gate source');

assertIncludes(foldersStore, 'function moveCanonicalChatFolderBinding', 'move canonical binding source');
assertIncludes(foldersStore, 'function bindChat(', 'bindChat source');
assertIncludes(foldersStore, 'function bindChatLegacy', 'bindChatLegacy source');
assertIncludes(foldersStore, 'function unbindChat', 'unbindChat source');
assertIncludes(foldersStore, 'function unbindChatLegacy', 'unbindChatLegacy source');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindings', 'canonical reader source');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindingsForChat', 'canonical row reader source');
assertIncludes(foldersStore, 'function getCanonicalChatFolderBindingForChat', 'canonical single reader source');
assertIncludes(foldersStore, 'function sqlExecute', 'sqlExecute source');
assertIncludes(foldersStore, 'function sqlSelect', 'sqlSelect source');
assertIncludes(foldersStore, 'function canonicalBindingStoreIdentity', 'store identity source');
assertIncludes(foldersStore, 'function recordWrite', 'recordWrite source');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch');
assertIncludes(foldersStore, 'INSERT OR REPLACE INTO folder_bindings', 'folder_bindings insert/replace writer source');
assertIncludes(foldersStore, 'DELETE FROM folder_bindings', 'folder_bindings delete writer source');

assertIncludes(bindingReviewedApply, 'BEGIN IMMEDIATE', 'reviewed apply transaction begin source');
assertIncludes(bindingReviewedApply, 'INSERT INTO folder_bindings', 'reviewed apply folder_bindings writer source');
assertIncludes(bindingReviewedApply, 'COMMIT', 'reviewed apply transaction commit source');
assertIncludes(importBundle, 'folderStore.bindChat', 'import bundle folder binding writer source');
assertIncludes(tombstoneReviews, 'folders.moveCanonicalChatFolderBinding', 'review/reconcile move writer source');
assertIncludes(tombstoneReviews, 'folders.unbindChat', 'review/reconcile unbind writer source');
assertIncludes(rustLib, 'CREATE TABLE folder_bindings', 'Rust migration folder_bindings table source');
assertIncludes(rustLib, 'PRIMARY KEY (chat_id)', 'Rust migration one-folder-per-chat primary key source');
assertIncludes(rustLib, 'f16_protect_folder_bindings_insert', 'Rust trigger protection insert source');
assertIncludes(rustLib, '.add_migrations("sqlite:studio-v1.db"', 'Rust SQL plugin migration registration source');

assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV remains deferred in folder import');
assert.ok(!combinedProductSource.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedProductSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedProductSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');

for (const forbidden of [
  'BINDING PERSISTENCE SOURCE FIX IMPLEMENTED',
  'binding-mismatch is allowed',
  'binding allowed-set flip passed',
  'productSyncReady is true',
  'WebDAV/cloud/relay ready',
  'blind live apply retry approved',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

assertIncludes(evidence, FAILURE_REASON, 'failure reason evidence');
assert.ok(!folderSync.includes(FAILURE_REASON), 'product source must not implement the new failure reason in preflight');

const result = {
  schema: 'h2o.studio.folder-sync.binding-persistence-source-fix-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-persistence-source-fix-preflight',
  evidence: evidencePath,
  verdict: 'BINDING_PERSISTENCE_SOURCE_FIX_PREFLIGHT_READY',
  commitsReferenced: COMMITS,
  oldHash: OLD_HASH,
  requestedAppliedHash: REQUESTED_HASH,
  recommendedImplementation: 'store durable verification helper plus handler durable gate',
  patchTargets: [foldersStorePath, folderSyncPath],
  discoveredFolderBindingsWritePaths: [
    `${foldersStorePath}: bindChatLegacy INSERT OR REPLACE`,
    `${foldersStorePath}: unbindChatLegacy DELETE`,
    `${foldersStorePath}: moveCanonicalChatFolderBinding INSERT OR REPLACE`,
    `${folderSyncPath}: applyChatFolderBindingRepairRequest via store.folders`,
    `${bindingReviewedApplyPath}: reviewed apply INSERT in transaction`,
    `${importBundlePath}: import materialization via folderStore.bindChat`,
    `${tombstoneReviewsPath}: reviewed/reconcile apply via folders move/unbind`,
    `${rustLibPath}: schema/proof/trigger substrate`,
  ],
  requiredValidators: [
    'durability-reopen-or-fence-harness',
    'revert-detection-harness',
    'ledger-contingency-harness',
    'persistence-verification-failure-receipt-contract',
    'boundary-validator',
  ],
  liveProofSequence: [
    'dry-run',
    'controlled-apply',
    'reload-or-restart-readback',
    'canonical-hash-equals-requested',
    'consumed-ledger-row-matches-durable-state',
    'duplicate-replay-zero-write',
    'no-readiness-or-cloud-or-allowed-set-flip',
  ],
  productSourceEdited: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-persistence-source-fix-preflight');
