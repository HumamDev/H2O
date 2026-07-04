#!/usr/bin/env node
//
// Operational.5 - dangling raw canonical binding cleanup preflight.
//
// Evidence/validator-only read-only preflight: classify the 14-vs-12 debt bucket and require a
// redacted row-level diagnostic before any cleanup.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-dangling-raw-canonical-binding-cleanup-preflight.md';
const readinessDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
const mismatchInvestigationPath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-binding-count-mismatch-investigation.md';
const liveDiagnosticPath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
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

function extractFunctionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `missing function signature ${signature}`);
  const open = source.indexOf('{', start);
  assert.ok(open >= 0, `missing function body for ${signature}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unterminated function body for ${signature}`);
}

const evidence = read(evidencePath);
const readinessDecision = read(readinessDecisionPath);
const mismatchInvestigation = read(mismatchInvestigationPath);
const liveDiagnostic = read(liveDiagnosticPath);
const exportBundle = read(exportBundlePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const tombstoneReviews = read(tombstoneReviewsPath);
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

for (const token of [
  'OPERATIONAL.5 DANGLING RAW CANONICAL BINDING CLEANUP PREFLIGHT REQUIRED',
  '13ca3677c3815c9bc098d705ddfddf3d9884d2d1',
  '640e6f3d2a365b53a50712d0dfa683463ef4ce0e',
  'h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v3',
  'classification.overall:"match-with-known-debt"',
  'knownDebt:["rawCanonicalDanglingBindingsFilteredFromExport"]',
  'Desktop raw canonical `folder_bindings` count: `14`',
  'exportable canonical binding subset count: `12`',
  '`fullBundle.v2` binding projection count: `12`',
  'raw canonical dangling chat-folder binding rows',
  'missingFolderBindingCount:2',
  'fallbackUnfiledBindingCount:2',
  'activeDanglingFolderBindingCount:2',
  'deletedFolderBindingCount:0',
  'Raw chat ids, raw folder ids, chat titles, and folder names are not recorded',
  'not approved cleanup candidates yet',
  'reviewed F15-settled binding repair',
  'dedicated reviewed orphan-binding cleanup handler',
  'read-only row-level diagnostic',
  'No product source edited.',
  'No folder/chat/binding/tombstone/ledger/receipt mutation.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'cleanup approved',
  'delete the two `folder_bindings` rows now',
  'productSyncReady flipped',
  'WebDAV/cloud/relay can start',
]) {
  assert.ok(!evidence.includes(forbidden), `evidence must not claim ${forbidden}`);
}

assertIncludes(readinessDecision, 'source-of-truth cleanup/reconciliation debt for the two raw canonical',
  'readiness decision blocker retained');
assertIncludes(readinessDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'readiness decision keeps productSyncReady false');
assertIncludes(mismatchInvestigation, 'Desktop canonical `folder_bindings` count: `14`',
  'mismatch investigation raw count');
assertIncludes(mismatchInvestigation, '`fullBundle.v2` canonical chat-folder binding projection count: `12`',
  'mismatch investigation projection count');
assertIncludes(mismatchInvestigation, 'expected export filtering that exposes canonical cleanup debt',
  'mismatch investigation classification');
assertIncludes(mismatchInvestigation, 'No destructive cleanup', 'mismatch investigation no cleanup');
assertIncludes(liveDiagnostic, 'canonicalMissingFolderBindingRows', 'live diagnostic computes missing-folder rows');
assertIncludes(liveDiagnostic, 'filteredFolderBindings', 'live diagnostic reports filtered rows');

const projectionBody = extractFunctionBody(exportBundle, 'async function buildDesktopCanonicalChatFolderBindingProjection(stores, chatCount)');
for (const token of [
  'var missingFolderBindingCount = 0',
  'var deletedFolderBindingCount = 0',
  'var fallbackUnfiledBindingCount = 0',
  'var activeDanglingFolderBindingCount = 0',
  'if (folderIds.indexOf(folderId) < 0)',
  'missingFolderBindingCount += 1',
  'fallbackUnfiledBindingCount += 1',
  'activeDanglingFolderBindingCount += 1',
  'return;',
  'if (activeDeletedFolderIds[folderId])',
  'deletedFolderBindingCount += 1',
  'bindings.push({',
]) {
  assertIncludes(projectionBody, token, `projection source token ${token}`);
}
const missingBranch = projectionBody.slice(
  projectionBody.indexOf('if (folderIds.indexOf(folderId) < 0)'),
  projectionBody.indexOf('if (activeDeletedFolderIds[folderId])'),
);
assertIncludes(missingBranch, 'return;', 'missing-folder branch returns before export');
assert.ok(!missingBranch.includes('bindings.push'), 'missing-folder branch must not export dangling binding rows');

for (const token of [
  'function listCanonicalChatFolderBindings()',
  'FROM folder_bindings b LEFT JOIN folders f ON f.id = b.folder_id',
  'function listCanonicalChatFolderBindingsForChat(chatIdInput)',
  'function listChats(folderIdInput)',
  'function listRecentlyDeletedFolders(opts)',
  'restoreTombstonedFolder',
  'writeFolderBindingTombstoneSafely',
  'buildFolderBindingTombstone',
]) {
  assertIncludes(foldersStore, token, `folders store read/context token ${token}`);
}

for (const token of [
  'folderBinding: true',
  'function getTombstone(recordKindInput, recordIdInput)',
  'function listTombstones(filters)',
  "pushString('recordKind', 'record_kind')",
  'activeOnly === true',
  'restoredOnly === true',
]) {
  assertIncludes(tombstones, token, `tombstone source token ${token}`);
}

for (const token of [
  'function listChatFolderBindingReceipts(filters)',
  'recordKind: \'folderBinding\'',
  'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
  'chatFolderBindingReceiptFromReview',
]) {
  assertIncludes(tombstoneReviews, token, `tombstone review source token ${token}`);
}

assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  'reviewed binding request schema retained');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  'reviewed binding receipt schema retained');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'reviewed binding apply gate retained');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'binding hash gate retained');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable gate retained');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains no-write');

const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV remains deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default retained');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');

assert.doesNotMatch(runtimeCombined,
  /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');

const result = {
  schema: 'h2o.studio.operational5.dangling-raw-canonical-binding-cleanup-preflight.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_DANGLING_RAW_CANONICAL_BINDING_CLEANUP_PREFLIGHT_REQUIRED',
  rawCanonicalBindingCount: 14,
  exportableCanonicalBindingCount: 12,
  danglingRawCanonicalBindingCount: 2,
  classification: 'missing-folder-active-dangling-raw-canonical-bindings-filtered-from-export',
  rawIdentifiersRecorded: false,
  cleanupApproved: false,
  nextAction: 'read-only-redacted-row-level-diagnostic',
  productSyncReady: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-dangling-raw-canonical-binding-cleanup-preflight');
