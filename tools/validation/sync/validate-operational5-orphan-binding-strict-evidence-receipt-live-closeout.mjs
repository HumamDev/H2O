#!/usr/bin/env node
//
// Operational.5 - orphan-binding strict evidence receipt live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-live-closeout.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-implementation.md';
const writeIntentEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-write-intent-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
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
function functionBody(source, name, endToken) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start > 0, `missing function ${name}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `missing end token ${endToken} after ${name}`);
  return source.slice(start, end);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const implementationEvidence = read(implementationEvidencePath);
const writeIntentEvidence = read(writeIntentEvidencePath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT LIVE CLOSEOUT PASSED - CLEANUP STILL BLOCKED',
  '6d9267f42e88cb14084ed46483a9cd870b2ac159',
  'db60e7b228510363bc01ca97948941b3bd686fec',
  'h2o.studio.operational5.orphan-binding-strict-evidence-receipt.live-record.v2',
  'targetRowToken:"row:fdd2456fc8a2"',
  'rejectedRowTokenShouldRemainDebt:"row:a950a44b859f"',
  'operational5-orphan-binding-strict-evidence-receipt-record',
  'result.status:"recorded-strict-evidence-receipt"',
  'result.ok:true',
  'gateSatisfied:true',
  'writeRequested:true',
  'dryRun:false',
  'receiptPersisted:true',
  'duplicateReceiptZeroWrite:false',
  'cleanupApplyApproved:false',
  'tombstoneSubstitute:false',
  'manualApprovalPrerequisiteOnly:true',
  'exactFolderTombstonePresent:false',
  'exactFolderBindingTombstonePresent:true',
  'chatLive:true',
  'folderAbsentFromCanonicalFolders:true',
  'rowSafeShape:true',
  'rawCanonicalBindingCount:14',
  'exportableCanonicalBindingCount:12',
  'noFolderDelete:true',
  'noChatDelete:true',
  'noBindingDelete:true',
  'noTombstoneMutation:true',
  'noLedgerMutation:true',
  'noImportExportMutation:true',
  'noRenderMirrorWrite:true',
  'noWebdavWrite:true',
  'noChatSavingCas:true',
  'productSyncReady:false',
  'The strict evidence receipt for `row:fdd2456fc8a2` is now persisted',
  '`row:a950a44b859f` remains documented debt',
  'Cleanup apply remains blocked',
  'No cleanup apply',
  'No binding row removal',
  'No WebDAV/cloud/relay/`fullBundle.v3`',
  'No Chat Saving WebDAV/cloud/archive CAS',
]) {
  assertIncludes(flat, token, `closeout evidence token ${token}`);
}

for (const forbidden of [
  'cleanup apply completed',
  'cleanup apply approved',
  'binding row removed',
  'productSyncReady:true',
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
]) {
  assertNotIncludes(flat, forbidden, `closeout evidence forbidden claim ${forbidden}`);
}

assertIncludes(implementationEvidence, 'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT PATH IMPLEMENTED - CLEANUP STILL BLOCKED',
  'strict evidence implementation retained');
assertIncludes(writeIntentEvidence, 'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT WRITE-INTENT FIX IMPLEMENTED - CLEANUP STILL BLOCKED',
  'write-intent fix retained');

const receiptBody = functionBody(foldersStore, 'operational5OrphanBindingStrictEvidenceReceipt', 'async function operational5OrphanBindingManualApprovalCleanupOverride');
for (const token of [
  'var writeRequested = opts.apply === true || opts.write === true || opts.record === true',
  'dryRun: !(writeRequested && gateSatisfied)',
  "result.status = 'recorded-strict-evidence-receipt'",
  "result.status = 'already-recorded-strict-evidence-receipt'",
  'result.duplicateReceiptZeroWrite = true',
  'cleanupApplyApproved: false',
  'tombstoneSubstitute: false',
  'manualApprovalPrerequisiteOnly: true',
  'exactFolderTombstonePresent: false',
  'exactFolderBindingTombstonePresent: true',
  'chatLive: true',
  'folderAbsentFromCanonicalFolders: true',
  'rowSafeShape: true',
  'noBindingDelete: true',
  'noTombstoneMutation: true',
  'noImportExportMutation: true',
  'noRenderMirrorWrite: true',
  'noWebdavWrite: true',
  'noChatSavingCas: true',
  'productSyncReady: false',
]) {
  assertIncludes(receiptBody, token, `receipt source token ${token}`);
}

for (const forbidden of [
  'operational5OrphanBindingCleanup(',
  'DELETE FROM folder_bindings',
  'sqlExecute(',
  'createTombstone(',
  'writeTombstone',
  'bindChat(',
  'unbindChat(',
  'moveCanonicalChatFolderBinding(',
  'productSyncReady: true',
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
]) {
  assertNotIncludes(receiptBody, forbidden, `receipt source forbidden ${forbidden}`);
}

const cleanupBody = functionBody(foldersStore, 'operational5OrphanBindingCleanup', 'function canonicalBindingStoreIdentity');
assertIncludes(cleanupBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup still requires exact folder tombstone');
assertIncludes(cleanupBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup still requires exact folderBinding tombstone');
assertIncludes(cleanupBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup remains strict tombstone-backed');

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'Desktop SQLite remains the canonical archive authority',
  'Chat Saving canonical authority retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-live-closeout.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_LIVE_CLOSEOUT_PASSED_CLEANUP_BLOCKED',
  targetRowToken: 'row:fdd2456fc8a2',
  rowA950RemainsDocumentedDebt: true,
  receiptPersisted: true,
  cleanupApplyApproved: false,
  tombstoneSubstitute: false,
  cleanupApplyBlocked: true,
  noBindingFolderChatTombstoneDeletion: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-strict-evidence-receipt-live-closeout');
