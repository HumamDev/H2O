#!/usr/bin/env node
//
// Operational.5 - dangling binding cleanup design preflight validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-dangling-binding-cleanup-design-preflight.md';
const rowDiagnosticPrepPath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const rowDiagnosticValidatorPath = 'tools/validation/sync/validate-operational5-dangling-binding-row-level-diagnostic.mjs';
const cleanupPreflightPath = 'release-evidence/2026-07-01/operational5-dangling-raw-canonical-binding-cleanup-preflight.md';
const readinessDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
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

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
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
const rowDiagnosticPrep = read(rowDiagnosticPrepPath);
const rowDiagnosticValidator = read(rowDiagnosticValidatorPath);
const cleanupPreflight = read(cleanupPreflightPath);
const readinessDecision = read(readinessDecisionPath);
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
  'OPERATIONAL.5 DANGLING BINDING CLEANUP DESIGN PREFLIGHT READY',
  '584aff71ce3f40d45cc1b51ea38fe98813c6f093',
  'aa2526b8f35de7ff5c8b697935b870f80a57af52',
  'h2o.studio.operational5.dangling-binding-row-level-diagnostic.v1',
  '`canonicalFolders:6`',
  '`rawCanonicalBindings:14`',
  '`exportableCanonicalBindings:12`',
  '`danglingBindings:2`',
  '`tombstonesObserved:20`',
  '`receiptsObserved:1`',
  'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e',
  'sha256:3d3ee859083fcce5f079bee68a415db52648423297523662c8e53f165cf97ee0',
  'sha256:7ca03b2f8d5c48a32924ae07849eeee3843631c14d3f725cc870f9f83cfca3e2',
  '`tombstoneOrReceiptExplained:2`',
  '`unsafeManualReview:0`',
  'Cleanup implementation may be designed next, using reviewed non-destructive path only; no direct delete.',
  '`row:a950a44b859f`',
  '`row:fdd2456fc8a2`',
  '`tombstone/receipt explained`',
  'Both dangling rows are explained by tombstone context.',
  'No row is classified as `unsafe-needs-manual-review`',
  'dedicated **Operational.5 reviewed orphan-binding cleanup command**',
  'Dry-run first.',
  'do not trust caller-supplied raw ids alone',
  'folder tombstone context exists',
  'folderBinding tombstone context exists',
  'no row is exportable in `fullBundle.v2`',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

for (const token of [
  'Cleanup implementation is **not approved by this slice**.',
  'No product source edited.',
  'No cleanup/write/apply/delete/restore/rebind/unbind/purge.',
  'No folder/chat/binding/tombstone/ledger/receipt/import/export/render-mirror mutation.',
]) {
  assertIncludes(evidence, token, `no-mutation token ${token}`);
}

for (const forbidden of [
  'cleanup implementation is approved',
  'cleanup approved',
  'productSyncReady flipped',
  'WebDAV/cloud/relay can start',
  'delete the two `folder_bindings` rows now',
]) {
  assertNotIncludes(evidence, forbidden, `evidence must not claim ${forbidden}`);
}

assertIncludes(rowDiagnosticPrep, 'OPERATIONAL.5 DANGLING BINDING ROW-LEVEL DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT',
  'row diagnostic prep retained');
assertIncludes(rowDiagnosticPrep, 'No cleanup/write/apply/delete/restore/rebind/unbind/purge.',
  'row diagnostic prep read-only boundary');
assertIncludes(rowDiagnosticValidator, 'expectedDanglingRows: 2', 'row diagnostic validator expected row count');
assertIncludes(rowDiagnosticValidator, 'cleanupApproved: false', 'row diagnostic validator keeps cleanup blocked');
assertIncludes(cleanupPreflight, 'OPERATIONAL.5 DANGLING RAW CANONICAL BINDING CLEANUP PREFLIGHT REQUIRED',
  'cleanup preflight retained');
assertIncludes(cleanupPreflight, 'not approved cleanup candidates yet', 'cleanup preflight blocks cleanup');
assertIncludes(cleanupPreflight, 'dedicated reviewed orphan-binding cleanup handler',
  'cleanup preflight allowed dedicated handler direction');
assertIncludes(readinessDecision, 'source-of-truth cleanup/reconciliation debt for the two raw canonical',
  'readiness decision still blocked on cleanup debt');
assertIncludes(readinessDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'readiness decision keeps false');

for (const token of [
  'function listCanonicalChatFolderBindings()',
  'function listCanonicalChatFolderBindingsForChat(chatIdInput)',
  'function bindChat(folderIdInput, chatIdInput, opts)',
  'function unbindChat(folderIdInput, chatIdInput, opts)',
  'async function materializeSettledCanonicalChatFolderBinding',
  'function writeFolderBindingTombstoneSafely',
  'function buildFolderBindingTombstone',
  'function listRecentlyDeletedFolders(opts)',
]) {
  assertIncludes(foldersStore, token, `folders source anchor ${token}`);
}

for (const token of [
  'folderBinding: true',
  'function listTombstones(filters)',
  'function createTombstone(record)',
]) {
  assertIncludes(tombstones, token, `tombstone source anchor ${token}`);
}

for (const token of [
  'function listChatFolderBindingReceipts(filters)',
  'function previewApply(reviewIdInput, options)',
  'function applyRealFolderBindingReview',
  'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
  "recordKind: 'folderBinding'",
]) {
  assertIncludes(tombstoneReviews, token, `tombstone review source anchor ${token}`);
}

const projectionBody = extractFunctionBody(exportBundle, 'async function buildDesktopCanonicalChatFolderBindingProjection(stores, chatCount)');
for (const token of [
  'var missingFolderBindingCount = 0',
  'var fallbackUnfiledBindingCount = 0',
  'var activeDanglingFolderBindingCount = 0',
  'if (folderIds.indexOf(folderId) < 0)',
  'missingFolderBindingCount += 1',
  'fallbackUnfiledBindingCount += 1',
  'activeDanglingFolderBindingCount += 1',
  'return;',
]) {
  assertIncludes(projectionBody, token, `fullBundle projection source anchor ${token}`);
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
  schema: 'h2o.studio.operational5.dangling-binding-cleanup-design-preflight.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_DANGLING_BINDING_CLEANUP_DESIGN_PREFLIGHT_READY',
  rowLevelDiagnosticRecorded: true,
  danglingRows: 2,
  tombstoneOrReceiptExplained: 2,
  unsafeManualReview: 0,
  recommendedPath: 'dedicated-reviewed-operational5-orphan-binding-cleanup-command',
  cleanupImplemented: false,
  cleanupApproved: false,
  productSyncReady: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-dangling-binding-cleanup-design-preflight');
