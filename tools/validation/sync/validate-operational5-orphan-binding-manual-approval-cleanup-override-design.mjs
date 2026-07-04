#!/usr/bin/env node
//
// Operational.5 - orphan-binding manual-approval cleanup override design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-design.md';
const liveCloseoutPath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-implementation.md';
const writeIntentPath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-write-intent-fix.md';
const cleanupImplementationPath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
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
const liveCloseout = read(liveCloseoutPath);
const implementation = read(implementationPath);
const writeIntent = read(writeIntentPath);
const cleanupImplementation = read(cleanupImplementationPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE DESIGN READY - NO CLEANUP APPLIED',
  '6d9267f42e88cb14084ed46483a9cd870b2ac159',
  'db60e7b228510363bc01ca97948941b3bd686fec',
  '3e2f55eeaca5e18cea679348349ca9082313f77a',
  'targetRowToken:"row:fdd2456fc8a2"',
  'rejectedRowTokenShouldRemainDebt:"row:a950a44b859f"',
  'result.status:"recorded-strict-evidence-receipt"',
  'receiptPersisted:true',
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
  'Recommendation: **clean `row:fdd2456fc8a2` only through a future reviewed manual-approval override**',
  '`row:a950a44b859f` must remain documented debt',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1',
  'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  'approval permits removing only the exact dangling `folder_bindings` row for',
  'does not authorize folder/chat/tombstone deletion',
  'does not authorize touching `row:a950a44b859f`',
  'dry-run write counts are zero',
  'raw canonical bindings drop from `14` to `13`',
  'exportable canonical bindings remain `12`',
  '`fullBundle.v2` binding projection remains `12`',
  'only `row:fdd2456fc8a2` is removed',
  '`row:a950a44b859f` remains documented debt and is not touched',
  'duplicate apply is zero-write/idempotent',
  'Do not clean `row:a950a44b859f`',
  'Do not clean both rows in one broad operation',
  'Do not use broad text/meta matching as proof',
  'Do not treat the strict evidence receipt as cleanup authorization',
  'Do not treat the strict evidence receipt as a tombstone substitute',
  'Do not weaken strict tombstone verification globally',
  'Do not flip `productSyncReady`',
  'Do not start WebDAV/cloud/relay/`fullBundle.v3`',
  'Do not touch Chat Saving WebDAV/cloud/archive CAS',
  'Cleanup is not approved by this design slice',
]) {
  assertIncludes(flat, token, `override design evidence token ${token}`);
}

for (const forbidden of [
  'cleanup apply completed',
  'cleanup applied',
  'source changed',
  'binding row removed',
  'productSyncReady:true',
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
]) {
  assertNotIncludes(flat, forbidden, `override design forbidden claim ${forbidden}`);
}

assertIncludes(liveCloseout, 'receiptPersisted:true', 'live closeout proves persisted receipt');
assertIncludes(liveCloseout, '`row:a950a44b859f` remains documented debt', 'a950 retained as debt');
assertIncludes(liveCloseout, 'Cleanup apply remains blocked', 'cleanup remains blocked in closeout');
assertIncludes(implementation, 'The receipt is **not** cleanup authorization', 'strict receipt not authorization');
assertIncludes(writeIntent, 'apply:true', 'write intent fix supports apply true');
assertIncludes(cleanupImplementation, 'operational5-orphan-binding-cleanup-apply', 'existing cleanup gate retained');

const receiptBody = functionBody(foldersStore, 'operational5OrphanBindingStrictEvidenceReceipt', '/* Operational.5 reviewed orphan-binding cleanup.');
assertIncludes(receiptBody, 'var writeRequested = opts.apply === true || opts.write === true || opts.record === true',
  'receipt path supports apply true');
assertIncludes(receiptBody, 'cleanupApplyApproved: false', 'receipt path still cannot authorize cleanup');
assertIncludes(receiptBody, 'tombstoneSubstitute: false', 'receipt path still cannot substitute tombstone');

const cleanupBody = functionBody(foldersStore, 'operational5OrphanBindingCleanup', 'function canonicalBindingStoreIdentity');
assertIncludes(cleanupBody, 'OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE',
  'existing cleanup command remains gated');
assertIncludes(cleanupBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup still requires exact folder tombstone');
assertIncludes(cleanupBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup still requires exact folderBinding tombstone');
assertIncludes(cleanupBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup strict tombstone verification remains unchanged');

assertIncludes(foldersStore, 'operational5OrphanBindingManualApprovalCleanupOverride',
  'manual override implementation may now exist after this design');
assertIncludes(foldersStore, 'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  'manual override gate may now exist after this design');
assertIncludes(foldersStore, 'OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  'documented debt row token remains source-anchored');

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
  schema: 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-design.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_DESIGN_READY_NO_CLEANUP_APPLIED',
  recommendation: 'clean-fdd-only-via-future-reviewed-manual-approval-override',
  rowFddHasPersistedStrictEvidenceReceipt: true,
  rowA950RemainsDocumentedDebt: true,
  cleanupImplementedInThisSlice: false,
  cleanupAppliedInThisSlice: false,
  futureGate: 'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  dryRunFirstRequired: true,
  exactRowRequired: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-manual-approval-cleanup-override-design');
