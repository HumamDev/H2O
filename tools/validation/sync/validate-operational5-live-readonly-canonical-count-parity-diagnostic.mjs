#!/usr/bin/env node
//
// Operational.5 - live read-only canonical count parity diagnostic prep.
//
// This validator proves the evidence contains a safe DevTools diagnostic snippet that follows the
// 52264289 harness contract and does not call write/apply/export/convergence operations.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const harnessEvidencePath = 'release-evidence/2026-07-01/operational5-canonical-count-parity-readonly-harness.md';
const harnessValidatorPath = 'tools/validation/sync/validate-operational5-canonical-count-parity-readonly-harness.mjs';
const preflightEvidencePath = 'release-evidence/2026-07-01/operational5-source-of-truth-canonical-count-parity-preflight.md';
const s14EvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';

const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const consumedLedgerPath = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const chatSavingBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function repoPath(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function read(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

for (const rel of [
  evidencePath,
  harnessEvidencePath,
  harnessValidatorPath,
  preflightEvidencePath,
  s14EvidencePath,
  foldersStorePath,
  folderSyncPath,
  folderImportPath,
  autoImportPath,
  exportBundlePath,
  importBundlePath,
  consumedLedgerPath,
  tombstoneReviewsPath,
  webdavGatesPath,
  settlementWriterPath,
  conflictRuntimePath,
  chatSavingBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const harnessEvidence = read(harnessEvidencePath);
const harnessValidator = read(harnessValidatorPath);
const preflightEvidence = read(preflightEvidencePath);
const s14Evidence = read(s14EvidencePath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const consumedLedger = read(consumedLedgerPath);
const tombstoneReviews = read(tombstoneReviewsPath);
const webdavGates = read(webdavGatesPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);

const runtimeCombined = [
  foldersStore,
  folderSync,
  folderImport,
  autoImport,
  exportBundle,
  importBundle,
  consumedLedger,
  tombstoneReviews,
  webdavGates,
  settlementWriter,
  conflictRuntime,
].join('\n');

const snippetMatch = evidence.match(/```js\n([\s\S]*?)\n```/);
assert.ok(snippetMatch, 'evidence must contain a JavaScript DevTools snippet');
const snippet = snippetMatch[1];

for (const token of [
  'OPERATIONAL.5 LIVE READ-ONLY CANONICAL COUNT PARITY DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT',
  '52264289de23207b6db8a376f5b46dc1a127a766',
  'h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v1',
  'Desktop Studio WebView DevTools console',
  'does **not** call',
  'Restart convergence is reported from already-exposed diagnostics only',
  'pending DevTools output',
  'productSyncReady` stayed `false`',
  'WebDAV/cloud/relay/`fullBundle.v3` was not started',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

assertIncludes(harnessEvidence, 'OPERATIONAL.5 CANONICAL COUNT/HASH PARITY READ-ONLY HARNESS IMPLEMENTED',
  'harness evidence exists');
assertIncludes(harnessValidator, 'OPERATIONAL5_CANONICAL_COUNT_HASH_PARITY_READONLY_HARNESS_IMPLEMENTED_LIVE_DIAGNOSTIC_REQUIRED',
  'harness validator verdict');
assertIncludes(preflightEvidence, 'OPERATIONAL.5 SOURCE-OF-TRUTH / CANONICAL COUNT PARITY PREFLIGHT REQUIRED',
  'Operational.5 preflight exists');
assertIncludes(s14Evidence, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'S14 still keeps productSyncReady false');

for (const token of [
  'readOnly: true',
  'mutationAttempted: false',
  'calledApply: false',
  'calledGate: false',
  'calledExportFullBundle: false',
  'calledExportLatestSyncBundle: false',
  'calledSyncNow: false',
  'calledImportLatestBundle: false',
  'calledRestartConvergence: false',
  'calledRestartConvergenceReady: false',
  'wroteSqlite: false',
  'wroteChromeStorage: false',
  'wroteKv: false',
  'wroteLedger: false',
  'wroteReceipt: false',
  "productSyncReady: false",
  "webdavCloudRelay: 'blocked'",
  "chatSavingWebdavCloudArchiveCas: 'blocked'",
]) {
  assertIncludes(snippet, token, `snippet safety token ${token}`);
}

for (const token of [
  'foldersStore.getAll()',
  'foldersStore.count()',
  'foldersStore.listCanonicalChatFolderBindings()',
  'foldersStore.listRecentlyDeletedFolders({ limit: 1000 })',
  'readChromeStorageKey(FOLDER_STATE_DATA_KEY)',
  'canonicalExportableBindingRows',
  'canonicalMissingFolderBindingRows',
  'canonicalDeletedFolderBindingRows',
  'canonicalExportableBindings',
  'ingestion.diagnoseFullBundleV2ReadonlyProjection()',
  'ingestion.diagnoseExportBundle()',
  'folderSync.diagnose()',
  'tombstoneReviews.listChatFolderBindingReceipts({ limit: 1000 })',
  'desktopSync.listConsumedOperations()',
]) {
  assertIncludes(snippet, token, `snippet read token ${token}`);
}

for (const status of ['match', 'mismatch', 'orphan-bucket', 'not-exposed', 'requires-live-follow-up']) {
  assertIncludes(snippet, status, `snippet classification status ${status}`);
}

for (const surface of [
  'desktop-canonical-folders',
  'desktop-canonical-folder-bindings',
  'desktop-tombstones-recently-deleted',
  'render-mirror-folders',
  'render-mirror-bindings',
  'render-mirror-orphan-buckets',
  'desktop-canonical-binding-exportability',
  'fullBundle.v2-readonly-projection-diagnostic',
  'chrome-mv3-import-projection',
  'request-receipt-ledgers',
  'restart-convergence-records',
]) {
  assertIncludes(snippet, surface, `snippet surface ${surface}`);
}

for (const forbidden of [
  '.apply(',
  'exportFullBundle(',
  'exportLatestSyncBundle(',
  'syncNow(',
  'importLatestBundle(',
  'runF15SettledBindingRestartConvergence(',
  'whenF15SettledBindingRestartConvergenceReady(',
  'chrome.storage.local.set',
  'localStorage.setItem',
  'recordConsumedOperation(',
  'createTombstone(',
  'bindChat(',
  'unbindChat(',
  'moveCanonicalChatFolderBinding(',
]) {
  assert.ok(!snippet.includes(forbidden), `snippet must not contain forbidden call ${forbidden}`);
}

assertIncludes(snippet, 'exportFullBundle-not-called-by-this-diagnostic', 'snippet marks export follow-up instead of exporting');
assertIncludes(snippet, 'desktopCanonicalChatFolderBindingCount: canonicalExportableBindings.count',
  'snippet compares fullBundle binding count to canonical exportable subset');
assertIncludes(snippet, 'desktopCanonicalChatFolderBindingHash: canonicalExportableBindings.hash',
  'snippet compares fullBundle binding hash to canonical exportable subset');
assertIncludes(snippet, 'filteredFolderBindings', 'snippet reports filtered raw canonical rows');
assertIncludes(snippet, 'runF15SettledBindingRestartConvergence/whenReady intentionally not called',
  'snippet marks convergence follow-up instead of convergence call');
assertIncludes(snippet, 'operational5-live-readonly-canonical-count-parity-diagnostic-failed', 'snippet error prefix');

// Source anchors proving the referenced reads exist and the unsafe writes/gates remain separate.
assertIncludes(foldersStore, 'getAll: getAll', 'folders getAll export');
assertIncludes(foldersStore, 'count: countFolders', 'folders count export');
assertIncludes(foldersStore, 'listRecentlyDeletedFolders: listRecentlyDeletedFolders', 'recently deleted export');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindings: listCanonicalChatFolderBindings', 'canonical binding export');
assertIncludes(foldersStore, "var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1'", 'mirror key source');
assertIncludes(exportBundle, 'diagnoseExportBundle: diagnose', 'export diagnose API source');
assertIncludes(exportBundle, 'diagnoseFullBundleV2ReadonlyProjection: function ()', 'fullBundle.v2 read-only projection diagnostic source');
assertIncludes(exportBundle, 'exportFullBundle: function', 'exportFullBundle exists but snippet must not call it');
assertIncludes(folderImport, 'diagnose: diagnose', 'folder import diagnose API source');
assertIncludes(consumedLedger, 'async function listConsumedOperations()', 'consumed ledger read API source');
assertIncludes(tombstoneReviews, 'function listChatFolderBindingReceipts', 'binding receipt read API source');
assertIncludes(folderSync, 'bindingRepair: {', 'bindingRepair namespace exists');
assertIncludes(folderSync, 'apply: applyChatFolderBindingRepairRequest', 'apply exists but snippet must not call it');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'hash gate retained');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable gate retained');
assertIncludes(settlementWriter, 'requireContext: true', 'requireContext retained');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'conflict runtime guard retained');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror no-write retained');

const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be present');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assert.doesNotMatch(snippet + foldersStore + folderSync,
  /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'Operational.5 diagnostic and binding repair path must not enable fallback flags');

const result = {
  schema: 'h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.validator.v1',
  verdict: 'OPERATIONAL5_LIVE_READONLY_CANONICAL_COUNT_PARITY_DIAGNOSTIC_READY_PENDING_DEVTOOLS_OUTPUT',
  evidence: evidencePath,
  productSyncReady: false,
  productSyncReadyFlipped: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  snippetReadOnly: true,
  productSourceChanged: true,
  productSourceChangeKind: 'diagnostic-read-only-fullBundle-v2-projection',
  surfacesCovered: [
    'Desktop canonical folders',
    'canonical folder_bindings',
    'tombstones/recently deleted',
    'render mirror/FOLDER_STATE_DATA_KEY',
    'fullBundle.v2 read-only projection diagnostic',
    'Chrome/MV3 import diagnostic',
    'request/receipt ledgers',
    'restart convergence records classified without unsafe call',
  ],
  nextAction: 'run-devtools-snippet-and-record-live-output',
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-live-readonly-canonical-count-parity-diagnostic');
