#!/usr/bin/env node
//
// Operational.5 - orphan-binding provenance search validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-provenance-search.md';
const packetEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-review-packet.md';
const blockerEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const rowDiagnosticEvidencePath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const mismatchEvidencePath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-binding-count-mismatch-investigation.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
const deleteReviewedApplyPath = 'src-surfaces-base/studio/sync/delete-reviewed-apply.tauri.js';
const bindingReviewedApplyPath = 'src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js';
const executeJournalPath = 'src-surfaces-base/studio/sync/execute/execute-journal.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer.tauri.js';
const settlementLibraryExtensionPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const libraryBindingReceiptPath = 'src-surfaces-base/studio/sync/library/library-binding-apply-event-receipt.tauri.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}
function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}
function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}
function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const packetEvidence = read(packetEvidencePath);
const blockerEvidence = read(blockerEvidencePath);
const cleanupEvidence = read(cleanupEvidencePath);
const fixEvidence = read(fixEvidencePath);
const rowDiagnosticEvidence = read(rowDiagnosticEvidencePath);
const mismatchEvidence = read(mismatchEvidencePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const tombstoneReviews = read(tombstoneReviewsPath);
const deleteReviewedApply = read(deleteReviewedApplyPath);
const bindingReviewedApply = read(bindingReviewedApplyPath);
const executeJournal = read(executeJournalPath);
const settlementWriter = read(settlementWriterPath);
const settlementLibraryExtension = read(settlementLibraryExtensionPath);
const libraryBindingReceipt = read(libraryBindingReceiptPath);
const exportBundle = read(exportBundlePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING PROVENANCE SEARCH RECORDED - STRICT TOMBSTONE EVIDENCE STILL MISSING',
  '9fdf2dab',
  '221d91b6',
  '9dd82fdf',
  '3f1bd667',
  'b344120ac4462b6e91f7ac6bfb4cff507cab0a68',
  '69/69',
  'row:a950a44b859f',
  'r:650c3cb39924',
  'r:0226fecaed5b',
  'row:fdd2456fc8a2',
  'r:2f29d39a6c4f',
  'r:2d5469848470',
  'skipped-not-fully-tombstone-verified',
  'Strict folder tombstone evidence was not found for either row',
  '`row:a950a44b859f`: strict folder tombstone evidence **not found**; strict folderBinding tombstone evidence **not found**',
  '`row:fdd2456fc8a2`: strict folder tombstone evidence **not found**; strict folderBinding tombstone evidence **found**',
  'missingFolderBindingCount:2',
  'fallbackUnfiledBindingCount:2',
  'activeDanglingFolderBindingCount:2',
  'Broad text matching, loose metadata matching, receipt substring matching, historical narrative',
  'is not accepted as cleanup proof',
  'getTombstone("folder", "folder:<id>")',
  'create a stronger read-only live provenance diagnostic',
  'Cleanup apply is not recommended from this search',
  'No cleanup apply.',
  'No product source edited.',
  'No strict tombstone verification weakening.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  'No fallback.',
]) {
  assertIncludes(flat, token, `provenance evidence token ${token}`);
}

for (const pathToken of [
  'src-surfaces-base/studio/store/folders.tauri.js',
  'src-surfaces-base/studio/store/tombstones.tauri.js',
  'src-surfaces-base/studio/store/tombstone-reviews.tauri.js',
  'src-surfaces-base/studio/sync/delete-reviewed-apply.tauri.js',
  'src-surfaces-base/studio/sync/binding-reviewed-apply.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-journal.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-settlement-writer.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js',
  'src-surfaces-base/studio/sync/library/library-binding-apply-event-receipt.tauri.js',
  'src-surfaces-base/studio/ingestion/export-bundle.tauri.js',
]) {
  assertIncludes(flat, pathToken, `provenance searched path ${pathToken}`);
}

for (const forbidden of [
  'cleanup apply approved',
  'cleanup apply completed',
  'controlled cleanup apply was run',
  'strict tombstone verification was weakened',
  'broad text matching is accepted',
  'productSyncReady:true',
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'rawChatId:',
  'rawFolderId:',
]) {
  assertNotIncludes(flat, forbidden, `provenance forbidden claim ${forbidden}`);
}

assertIncludes(packetEvidence, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL REVIEW PACKET RECORDED - CLEANUP APPLY BLOCKED',
  'manual-review packet retained');
assertIncludes(packetEvidence, '`row:fdd2456fc8a2`: strict active folderBinding tombstone exists, but strict active folder tombstone',
  'packet records row fdd exact binding tombstone but missing folder tombstone');
assertIncludes(blockerEvidence, 'verifiedCount:0', 'blocker decision retains verifiedCount 0');
assertIncludes(blockerEvidence, 'broad text matching not accepted as cleanup proof', 'blocker rejects broad matching');
assertIncludes(cleanupEvidence, 'operational5-orphan-binding-cleanup-apply', 'cleanup gate evidence retained');
assertIncludes(fixEvidence, "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'strict verification fix retained');
assertIncludes(rowDiagnosticEvidence, 'OPERATIONAL.5 DANGLING BINDING ROW-LEVEL DIAGNOSTIC READY - PENDING DEVTOOLS OUTPUT',
  'row-level diagnostic prep retained');
assertIncludes(rowDiagnosticEvidence, 'Correction (2026-07-04) - broad matching superseded by strict verification',
  'row-level diagnostic strict correction retained');
assertIncludes(rowDiagnosticEvidence, 'rowClassificationHash', 'row-level diagnostic hash contract retained');
assertIncludes(mismatchEvidence, 'expected export filtering that exposes canonical cleanup debt',
  'mismatch investigation retains expected-filtering cleanup-debt classification');

assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'strict getTombstone active lookup retained');
assertIncludes(foldersStore, "return 'folder:' + encodeURIComponent(cleanString(folderId));",
  'folder tombstone record-id helper retained');
assertIncludes(foldersStore, "recordId: 'folderBinding:' + encodeURIComponent(cid) + ':' + encodeURIComponent(fid)",
  'folderBinding tombstone writer retained');
assertIncludes(deleteReviewedApply, "recordId: 'folder:' + encodeURIComponent(folderId)",
  'reviewed folder delete uses strict folder record-id');
assertIncludes(bindingReviewedApply, "return 'folderBinding:' + encodeRecordPart(id) + ':' + encodeRecordPart(folder.localId);",
  'reviewed binding path uses folderBinding tombstone shape');
assertIncludes(tombstoneReviews, 'tombstone', 'tombstone review substrate exists');
assertIncludes(executeJournal, 'journal', 'execute journal source exists');
assertIncludes(settlementWriter, 'settlement', 'settlement writer source exists');
assertIncludes(settlementLibraryExtension, 'library', 'library settlement extension exists');
assertIncludes(libraryBindingReceipt, 'binding', 'library binding receipt source exists');
assertIncludes(exportBundle, 'activeDanglingFolderBindingCount', 'export dangling binding diagnostic retained');
assertIncludes(exportBundle, 'missingFolderBindingCount += 1', 'export missing-folder count retained');
assertIncludes(exportBundle, 'fallbackUnfiledBindingCount += 1', 'export fallback-unfiled count retained');

const fnStart = foldersStore.indexOf('async function operational5OrphanBindingCleanup');
const fnEnd = foldersStore.indexOf('function canonicalBindingStoreIdentity');
assert.ok(fnStart > 0 && fnEnd > fnStart, 'cleanup function body resolves');
const cleanupBody = foldersStore.slice(fnStart, fnEnd);
assertIncludes(cleanupBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup exact folder tombstone lookup retained');
assertIncludes(cleanupBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup exact folderBinding tombstone lookup retained');
assertIncludes(cleanupBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup still requires both strict tombstones');
for (const banned of ['meta.oldFolderId', 'receiptMatches', 'folderBindingTombstoneMatches', '.includes(chatId)', '.includes(folderId)', 'stableStringify']) {
  assertNotIncludes(cleanupBody, banned, `cleanup body must not broad-match (${banned})`);
}

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default retained');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');
assert.doesNotMatch(runtimeCombined,
  /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');

const result = {
  schema: 'h2o.studio.operational5.orphan-binding-provenance-search.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_PROVENANCE_SEARCH_RECORDED_STRICT_EVIDENCE_STILL_MISSING',
  readOnly: true,
  cleanupApplyApproved: false,
  strictFolderTombstoneEvidenceFound: false,
  rows: [
    {
      rowToken: 'row:a950a44b859f',
      strictFolderTombstoneEvidence: 'not-found',
      strictFolderBindingTombstoneEvidence: 'not-found',
      cleanupEligible: false,
    },
    {
      rowToken: 'row:fdd2456fc8a2',
      strictFolderTombstoneEvidence: 'not-found',
      strictFolderBindingTombstoneEvidence: 'found',
      cleanupEligible: false,
    },
  ],
  broadMatchingAcceptedAsCleanupProof: false,
  recommendedNext: 'stronger-read-only-live-provenance-diagnostic',
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-provenance-search');
