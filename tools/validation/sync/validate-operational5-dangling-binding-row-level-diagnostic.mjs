#!/usr/bin/env node
//
// Operational.5 - dangling binding row-level diagnostic prep validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const preflightEvidencePath = 'release-evidence/2026-07-01/operational5-dangling-raw-canonical-binding-cleanup-preflight.md';
const preflightValidatorPath = 'tools/validation/sync/validate-operational5-dangling-raw-canonical-binding-cleanup-preflight.mjs';
const readinessDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
const liveDiagnosticEvidencePath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
const consumedLedgerPath = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function repoPath(rel) {
  return path.join(root, rel);
}

function read(rel) {
  assert.ok(fs.existsSync(repoPath(rel)), `missing ${rel}`);
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const preflightEvidence = read(preflightEvidencePath);
const preflightValidator = read(preflightValidatorPath);
const readinessDecision = read(readinessDecisionPath);
const liveDiagnosticEvidence = read(liveDiagnosticEvidencePath);
const exportBundle = read(exportBundlePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const tombstoneReviews = read(tombstoneReviewsPath);
const consumedLedger = read(consumedLedgerPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

const runtimeCombined = [
  exportBundle,
  foldersStore,
  folderSync,
  folderImport,
  autoImport,
  importBundle,
  webdavGates,
].join('\n');

const snippetMatch = evidence.match(/```js\n([\s\S]*?)\n```/);
assert.ok(snippetMatch, 'evidence must contain a JavaScript DevTools snippet');
const snippet = snippetMatch[1];

for (const token of [
  'OPERATIONAL.5 DANGLING BINDING ROW-LEVEL DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT',
  '584aff71ce3f40d45cc1b51ea38fe98813c6f093',
  'raw Desktop canonical `folder_bindings`: `14`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` binding projection: `12`',
  'h2o.studio.operational5.dangling-binding-row-level-diagnostic.v1',
  'restore-folder-candidate',
  'reviewed-rebind-or-unbind-candidate',
  'tombstone-receipt-already-explains-it',
  'unsafe-needs-manual-review',
  'Correction (2026-07-04) - broad matching superseded by strict verification',
  'FALSE POSITIVES',
  'operational5-orphan-binding-cleanup-tombstone-verification-fix.md',
  'Classification Rules (strict - corrected 2026-07-04)',
  'binding-tombstone-present-folder-tombstone-missing-needs-manual-review',
  'No product source edited.',
  'No live Desktop run by Codex.',
  'No cleanup/write/apply/delete/restore/rebind/unbind/purge.',
  'No raw chat titles, raw content, raw folder names, raw chat ids, or raw folder ids in evidence.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(preflightEvidence, 'OPERATIONAL.5 DANGLING RAW CANONICAL BINDING CLEANUP PREFLIGHT REQUIRED',
  'preflight evidence retained');
assertIncludes(preflightEvidence, 'not approved cleanup candidates yet', 'preflight blocks cleanup');
assertIncludes(preflightValidator, 'OPERATIONAL5_DANGLING_RAW_CANONICAL_BINDING_CLEANUP_PREFLIGHT_REQUIRED',
  'preflight validator retained');
assertIncludes(readinessDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED',
  'readiness decision keeps false');
assertIncludes(liveDiagnosticEvidence, 'canonicalMissingFolderBindingRows',
  'live diagnostic computes missing rows');

for (const token of [
  'readOnly: true',
  'mutationAttempted: false',
  'calledApply: false',
  'calledGate: false',
  'calledBind: false',
  'calledUnbind: false',
  'calledRestore: false',
  'calledDelete: false',
  'calledPurge: false',
  'calledExportFullBundle: false',
  'calledExportLatestSyncBundle: false',
  'calledImportLatestBundle: false',
  'calledRestartConvergence: false',
  'wroteSqlite: false',
  'wroteChromeStorage: false',
  'wroteKv: false',
  'wroteLedger: false',
  'wroteReceipt: false',
  'wroteTombstone: false',
  'productSyncReady: false',
  "webdavCloudRelay: 'blocked'",
  "fullBundleV3: 'not-started'",
  "chatSavingWebdavCloudArchiveCas: 'blocked'",
]) {
  assertIncludes(snippet, token, `snippet safety token ${token}`);
}

for (const token of [
  'folders.getAll()',
  'folders.listCanonicalChatFolderBindings()',
  'folders.listCanonicalChatFolderBindingsForChat(chatId)',
  'folders.listRecentlyDeletedFolders({ limit: 1000 })',
  'folders.diagnose()',
  "tombstones.list({ recordKind: 'folder', includeRestored: true, limit: 1000 })",
  "tombstones.list({ recordKind: 'folderBinding', includeRestored: true, limit: 1000 })",
  'tombstoneReviews.listChatFolderBindingReceipts({ limit: 1000 })',
  'desktopSync.listConsumedOperations()',
  'ingestion.diagnoseFullBundleV2ReadonlyProjection()',
  'readChromeStorageKey(FOLDER_STATE_DATA_KEY)',
  'chats.get(chatId)',
]) {
  assertIncludes(snippet, token, `snippet read token ${token}`);
}

for (const token of [
  'rowToken',
  'chatToken',
  'missingFolderToken',
  'assignedAt',
  'sourceSurface',
  'authority',
  'status',
  'state',
  'livenessChecked',
  'live: chatLive',
  'folderTombstoneCount',
  'activeFolderTombstoneCount',
  'restoredFolderTombstoneCount',
  'recoverySnapshotCount',
  'folderBindingTombstoneCount',
  'reviewedReceiptCount',
  'f15MaterializationRecordExposure',
  'consumedLedgerRelatedCount',
  'classification',
  'recommendedAction',
  'cleanupApproved: false',
]) {
  assertIncludes(snippet, token, `snippet row output token ${token}`);
}

for (const token of [
  "classification = 'tombstone-receipt-already-explains-it'",
  "classification = 'restore-folder-candidate'",
  "classification = 'reviewed-rebind-or-unbind-candidate'",
  "let classification = 'unsafe-needs-manual-review'",
  "recommendedAction = 'verify-existing-tombstone-or-receipt-before-any-row-cleanup'",
  "recommendedAction = 'reviewed-folder-restore-reconciliation-dry-run-first'",
  "recommendedAction = 'reviewed-f15-binding-repair-dry-run-first'",
]) {
  assertIncludes(snippet, token, `classification rule ${token}`);
}

// ---- STRICT verification (corrected): exact + active tombstone bar, identical to the cleanup command ----
for (const token of [
  'function folderTombstoneRecordId(folderId)',
  "return 'folder:' + encodeURIComponent(folderId);",
  'function strictActiveFolderTombstoneMatch(row, folderId)',
  'recordId === folderTombstoneRecordId(folderId) && !tombstoneRestored(row)',
  'function strictActiveFolderBindingTombstoneMatch(row, chatId, folderId)',
  'recordId === bindingRecordId(chatId, folderId) && !tombstoneRestored(row)',
  'const strictTombstoneBacked = strictFolderTombstonePresent && strictFolderBindingTombstonePresent;',
  'if (strictTombstoneBacked) {',
  "classification = 'binding-tombstone-present-folder-tombstone-missing-needs-manual-review'",
  'strictActiveFolderTombstoneCount',
  'strictFolderTombstonePresent',
  'strictFolderBindingTombstonePresent',
  'looseFolderBindingMetaMatchCount',
  'looseReceiptFieldMatchCount',
  'NON-AUTHORITATIVE',
]) {
  assertIncludes(snippet, token, `strict verification token ${token}`);
}
// The "explained" verdict must NOT be driven by the old broad OR-match (binding-meta OR receipt, no folder tombstone).
assertNotIncludes(snippet, 'const alreadyExplained = relatedBindingTombstones.length > 0 || relatedReceipts.length > 0;',
  'broad OR-match must no longer drive the explained verdict');
assertNotIncludes(snippet, 'function folderBindingTombstoneMatches(', 'broad binding matcher renamed to non-authoritative loose matcher');

for (const forbidden of [
  '.apply(',
  'bindChat(',
  'unbindChat(',
  'restoreTombstonedFolder(',
  'restoreFolder(',
  'softDelete',
  'purgeRecentlyDeletedFolders(',
  'clearRecentlyDeletedRestoredHistory(',
  'repairPurgedFolderResurrections(',
  'exportFullBundle(',
  'exportLatestSyncBundle(',
  'importLatestBundle(',
  'runF15SettledBindingRestartConvergence(',
  'whenF15SettledBindingRestartConvergenceReady(',
  'chrome.storage.local.set',
  'localStorage.setItem',
  'recordConsumedOperation(',
  'createTombstone(',
]) {
  assertNotIncludes(snippet, forbidden, `snippet must be read-only`);
}

assertIncludes(snippet, 'rawIdentifiersLogged: false', 'snippet does not log raw ids');
assertIncludes(snippet, 'rawNamesLogged: false', 'snippet does not log raw names');
assertIncludes(snippet, 'chatTitlesLogged: false', 'snippet does not log titles');
assertIncludes(snippet, 'chatContentLogged: false', 'snippet does not log content');
assertIncludes(snippet, 'operational5-dangling-binding-row-level-diagnostic-failed', 'snippet error prefix');

assertIncludes(exportBundle, 'activeDanglingFolderBindingCount', 'export dangling diagnostic source');
assertIncludes(exportBundle, 'missingFolderBindingCount += 1', 'export missing count source');
assertIncludes(exportBundle, 'fallbackUnfiledBindingCount += 1', 'export fallback count source');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindings()', 'canonical binding reader exists');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindingsForChat(chatIdInput)', 'per-chat binding reader exists');
assertIncludes(foldersStore, 'function listRecentlyDeletedFolders(opts)', 'recently deleted reader exists');
assertIncludes(foldersStore, 'lastF15SettledBindingRestartConvergence', 'F15 convergence summary exposed in diagnose');
assertIncludes(tombstones, 'function listTombstones(filters)', 'tombstone list exists');
assertIncludes(tombstones, 'folderBinding: true', 'folderBinding tombstone kind supported');
assertIncludes(tombstoneReviews, 'function listChatFolderBindingReceipts(filters)', 'binding receipt reader exists');
assertIncludes(consumedLedger, 'async function listConsumedOperations()', 'consumed ledger reader exists');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  'binding request schema retained');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'hash gate retained');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains no-write');

const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not exist');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');
assert.doesNotMatch(runtimeCombined,
  /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');

const result = {
  schema: 'h2o.studio.operational5.dangling-binding-row-level-diagnostic.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_DANGLING_BINDING_ROW_LEVEL_DIAGNOSTIC_READY_PENDING_DEVTOOLS_OUTPUT',
  diagnosticReadOnly: true,
  productSourceChanged: false,
  expectedDanglingRows: 2,
  rawIdentifiersLogged: false,
  cleanupApproved: false,
  nextAction: 'run-devtools-snippet-and-record-row-level-output',
  productSyncReady: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-dangling-binding-row-level-diagnostic');
