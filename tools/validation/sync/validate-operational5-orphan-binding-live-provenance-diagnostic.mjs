#!/usr/bin/env node
//
// Operational.5 - orphan-binding live provenance diagnostic validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-live-provenance-diagnostic.md';
const provenanceSearchPath = 'release-evidence/2026-07-01/operational5-orphan-binding-provenance-search.md';
const packetEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-review-packet.md';
const blockerEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const rowDiagnosticEvidencePath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const tombstoneReviewsPath = 'src-surfaces-base/studio/store/tombstone-reviews.tauri.js';
const consumedLedgerPath = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';
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
const provenanceSearch = read(provenanceSearchPath);
const packetEvidence = read(packetEvidencePath);
const blockerEvidence = read(blockerEvidencePath);
const cleanupEvidence = read(cleanupEvidencePath);
const fixEvidence = read(fixEvidencePath);
const rowDiagnosticEvidence = read(rowDiagnosticEvidencePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const tombstoneReviews = read(tombstoneReviewsPath);
const consumedLedger = read(consumedLedgerPath);
const exportBundle = read(exportBundlePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING LIVE PROVENANCE DIAGNOSTIC READY - READ-ONLY DEVTOOLS STEP APPROVED',
  '2ecfbd81eddbef72b6f3c626ce503b33939291c4',
  'b344120ac4462b6e91f7ac6bfb4cff507cab0a68',
  '9fdf2dab',
  '221d91b6',
  '9dd82fdf',
  '72/72',
  'row:a950a44b859f',
  'r:650c3cb39924',
  'r:0226fecaed5b',
  'row:fdd2456fc8a2',
  'r:2f29d39a6c4f',
  'r:2d5469848470',
  'Strict cleanup proof remains unchanged',
  'Broad text matching, metadata correlation, receipt substring matching',
  'non-authoritative context only',
  'must not be used as cleanup proof',
  'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1',
  'targetRowsTracked',
  'targetRowsMatched',
  'rowContexts',
  'strict.folderTombstonePresent',
  'strict.folderBindingTombstonePresent',
  'strict.cleanupEligibleUnderCurrentRules',
  'rowContextHash',
  'broadMatchingAcceptedAsCleanupProof:false',
  'rawIdsLogged:false',
  'rawNamesLogged:false',
  'rawChatTitlesLogged:false',
  'rawContentLogged:false',
  'cleanupApplyApproved:false',
  'productSyncReady:false',
  'webdavCloudRelay:"blocked"',
  'fullBundleV3:"not-started"',
  'chatSavingWebdavCloudArchiveCas:"blocked"',
  'A. keep documented debt',
  'B. restore missing folder from legitimate recovery snapshot',
  'C. manual-approval cleanup override',
  'D. create a new strict evidence receipt',
  'E. no-op/manual reject',
  'No cleanup apply.',
  'No product source edited.',
  'No strict tombstone verification weakening.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  'No fallback.',
]) {
  assertIncludes(flat, token, `live provenance evidence token ${token}`);
}

for (const apiToken of [
  'H2O.Studio.store.folders.getAll()',
  'H2O.Studio.store.folders.listCanonicalChatFolderBindings()',
  'H2O.Studio.store.folders.listCanonicalChatFolderBindingsForChat(chatId)',
  'H2O.Studio.store.folders.listRecentlyDeletedFolders({ limit: 1000 })',
  'H2O.Studio.store.folders.diagnose()',
  'H2O.Studio.store.tombstones.getTombstone(recordKind, recordId)',
  'H2O.Studio.store.tombstones.list({ recordKind, includeRestored:true, limit:1000 })',
  'H2O.Studio.store.tombstoneReviews.listChatFolderBindingReceipts({ limit:1000 })',
  'H2O.Desktop.Sync.listConsumedOperations()',
  'H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()',
  "chrome.storage.local.get('h2o:prm:cgx:fldrs:state:data:v1')",
]) {
  assertIncludes(flat, apiToken, `read-only API listed ${apiToken}`);
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
  assertNotIncludes(flat, forbidden, `live provenance forbidden claim ${forbidden}`);
}

const snippetMatch = evidence.match(/```js\n([\s\S]*?)\n```/);
assert.ok(snippetMatch, 'evidence must include a DevTools JS snippet');
const snippet = snippetMatch[1];
for (const token of [
  "const SCHEMA = 'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1'",
  'const TARGETS = [',
  "rowToken: 'row:a950a44b859f'",
  "chatToken: 'r:650c3cb39924'",
  "folderToken: 'r:0226fecaed5b'",
  "rowToken: 'row:fdd2456fc8a2'",
  "chatToken: 'r:2f29d39a6c4f'",
  "folderToken: 'r:2d5469848470'",
  'readOnly: true',
  'cleanupApplyCalled: false',
  'mutationAttempted: false',
  'noTombstoneMutation: true',
  'noLedgerMutation: true',
  'noReceiptMutation: true',
  'noImportExportMutation: true',
  'noRenderMirrorWrite: true',
  'noProductSyncReadyFlip: true',
  'noWebdavCloudRelay: true',
  'noChatSavingCas: true',
  'noFallback: true',
  'function redactionToken(raw)',
  "return 'r:' + (await sha256Hex(clean(raw))).slice(0, 12)",
  "tombstones.getTombstone('folder', exactFolderRecordId)",
  "tombstones.getTombstone('folderBinding', exactBindingRecordId)",
  "tombstones.list({ recordKind: 'folder', includeRestored: true, limit: 1000 })",
  "tombstones.list({ recordKind: 'folderBinding', includeRestored: true, limit: 1000 })",
  'listChatFolderBindingReceipts({ limit: 1000 })',
  'listConsumedOperations()',
  'diagnoseFullBundleV2ReadonlyProjection()',
  'readChromeStorageKey(FOLDER_STATE_DATA_KEY)',
  'broadContextAuthoritativeForCleanup: false',
  'strictProofRequirementsUnchanged: true',
  'broadMatchingAcceptedAsCleanupProof: false',
  'rawIdsLogged: false',
  'rawNamesLogged: false',
  'rawChatTitlesLogged: false',
  'rawContentLogged: false',
  'cleanupApplyApproved: false',
  "productSyncReady: false",
  "webdavCloudRelay: 'blocked'",
  "fullBundleV3: 'not-started'",
  "chatSavingWebdavCloudArchiveCas: 'blocked'",
  'operational5-orphan-binding-live-provenance-diagnostic-failed',
]) {
  assertIncludes(snippet, token, `snippet token ${token}`);
}

for (const forbidden of [
  'operational5OrphanBindingCleanup(',
  '.apply(',
  'apply: true',
  'gate:',
  'createTombstone(',
  'sqlExecute',
  'DELETE FROM',
  'INSERT INTO',
  'UPDATE ',
  'bindChat(',
  'unbindChat(',
  'moveCanonicalChatFolderBinding(',
  'chrome.storage.local.set',
  'localStorage.setItem',
  'productSyncReady: true',
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
]) {
  assertNotIncludes(snippet, forbidden, `snippet must remain read-only (${forbidden})`);
}

assertIncludes(provenanceSearch, 'OPERATIONAL.5 ORPHAN-BINDING PROVENANCE SEARCH RECORDED - STRICT TOMBSTONE EVIDENCE STILL MISSING',
  'prior provenance search retained');
assertIncludes(packetEvidence, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL REVIEW PACKET RECORDED - CLEANUP APPLY BLOCKED',
  'manual-review packet retained');
assertIncludes(blockerEvidence, 'verifiedCount:0', 'manual-review blocker retains verifiedCount 0');
assertIncludes(cleanupEvidence, 'operational5-orphan-binding-cleanup-apply', 'cleanup command gate retained');
assertIncludes(fixEvidence, "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'strict tombstone fix retained');
assertIncludes(rowDiagnosticEvidence, 'Correction (2026-07-04) - broad matching superseded by strict verification',
  'row diagnostic strict correction retained');

assertIncludes(foldersStore, 'async function operational5RedactToken(id)', 'cleanup redaction helper retained');
assertIncludes(foldersStore, 'async function operational5OrphanBindingCleanup(opts)', 'cleanup command retained');
assertIncludes(foldersStore, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup exact folder tombstone lookup retained');
assertIncludes(foldersStore, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup exact folderBinding tombstone lookup retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup strict verifier retained');
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'strict active tombstone lookup retained');
assertIncludes(tombstoneReviews, 'function listChatFolderBindingReceipts(filters)', 'receipt read API retained');
assertIncludes(consumedLedger, 'async function listConsumedOperations()', 'consumed ledger read API retained');
assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'fullBundle v2 read-only diagnostic retained');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'fullBundle v2 read-only flag retained');

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
  schema: 'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_LIVE_PROVENANCE_DIAGNOSTIC_READY_READONLY',
  readOnly: true,
  rawIdsLogged: false,
  targetRowsTracked: 2,
  strictProofRequirementsUnchanged: true,
  broadMatchingAcceptedAsCleanupProof: false,
  cleanupApplyApproved: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  approvedNext: 'operator-may-run-devtools-readonly-provenance-diagnostic',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-live-provenance-diagnostic');
