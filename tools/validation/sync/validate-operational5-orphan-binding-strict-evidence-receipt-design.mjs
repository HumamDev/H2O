#!/usr/bin/env node
//
// Operational.5 - orphan-binding strict evidence receipt design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-design.md';
const liveDiagnosticPath = 'release-evidence/2026-07-01/operational5-orphan-binding-live-provenance-diagnostic.md';
const provenanceSearchPath = 'release-evidence/2026-07-01/operational5-orphan-binding-provenance-search.md';
const packetEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-review-packet.md';
const blockerEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
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
const liveDiagnostic = read(liveDiagnosticPath);
const provenanceSearch = read(provenanceSearchPath);
const packetEvidence = read(packetEvidencePath);
const blockerEvidence = read(blockerEvidencePath);
const cleanupEvidence = read(cleanupEvidencePath);
const fixEvidence = read(fixEvidencePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT DESIGN READY - CLEANUP STILL BLOCKED',
  'da77730465dd2db272a6e392640c55c682655a9d',
  '2ecfbd81eddbef72b6f3c626ce503b33939291c4',
  'b344120ac4462b6e91f7ac6bfb4cff507cab0a68',
  '9fdf2dab',
  '221d91b6',
  '9dd82fdf',
  '73/73',
  'h2o.studio.operational5.orphan-binding-live-provenance-diagnostic.v1',
  'canonical folders: `6`',
  'raw canonical `folder_bindings`: `14`',
  'exportable canonical bindings: `12`',
  'dangling bindings: `2`',
  'exact strict folder tombstone count: `0`',
  'exact strict folderBinding tombstone count: `1`',
  'both strict evidence count: `0`',
  'recommended next route: `D.create-new-strict-evidence-receipt`',
  '`row:a950a44b859f`',
  '`r:650c3cb39924`',
  '`r:0226fecaed5b`',
  '`row:fdd2456fc8a2`',
  '`r:2f29d39a6c4f`',
  '`r:2d5469848470`',
  '`row:a950a44b859f` remains documented debt',
  '`row:fdd2456fc8a2` is eligible only for a strict evidence receipt design/implementation',
  'does **not** approve cleanup',
  'does **not** substitute automatically for the missing exact active folder tombstone',
  'Design decision: **B. manual-approval prerequisite for a later cleanup**',
  'not C tombstone substitute',
  'not cleanup authorization',
  'h2o.studio.operational5.orphan-binding-strict-evidence-receipt.v1',
  '`exactFolderTombstonePresent:false`',
  '`exactFolderBindingTombstonePresent:true`',
  '`chatLive:true`',
  '`folderAbsentFromCanonicalFolders:true`',
  '`broadMatchingAcceptedAsCleanupProof:false`',
  '`cleanupApplyApproved:false`',
  '`tombstoneSubstitute:false`',
  '`manualApprovalRequiredBeforeAnyCleanup:true`',
  'strict evidence receipt creation is read-only or append-only to the explicit reviewed receipt store',
  'the receipt does not weaken `operational5OrphanBindingCleanup`',
  'cleanup remains blocked unless a separate manual-approval cleanup override is designed and approved',
  '`row:a950a44b859f` remains documented debt and is not swept into the receipt path',
  'Controlled cleanup apply remains blocked',
  'No cleanup apply.',
  'No product source edited.',
  'No strict tombstone verification weakening.',
  'No broad text/meta/receipt matching accepted as cleanup proof.',
  'No tombstone substitute is minted in this design.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  'No fallback.',
]) {
  assertIncludes(flat, token, `strict evidence design token ${token}`);
}

for (const forbidden of [
  'cleanup apply approved',
  'cleanup apply completed',
  'controlled cleanup apply was run',
  'strict tombstone verification was weakened',
  'broad text matching is accepted',
  'tombstone substitute minted:true',
  'productSyncReady:true',
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'rawChatId:',
  'rawFolderId:',
]) {
  assertNotIncludes(flat, forbidden, `strict evidence design forbidden claim ${forbidden}`);
}

assertIncludes(liveDiagnostic, 'OPERATIONAL.5 ORPHAN-BINDING LIVE PROVENANCE DIAGNOSTIC READY - READ-ONLY DEVTOOLS STEP APPROVED',
  'live provenance diagnostic prep retained');
assertIncludes(liveDiagnostic, 'D. create a new strict evidence receipt', 'live provenance diagnostic includes route D');
assertIncludes(provenanceSearch, 'OPERATIONAL.5 ORPHAN-BINDING PROVENANCE SEARCH RECORDED - STRICT TOMBSTONE EVIDENCE STILL MISSING',
  'provenance search retained');
assertIncludes(packetEvidence, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL REVIEW PACKET RECORDED - CLEANUP APPLY BLOCKED',
  'manual-review packet retained');
assertIncludes(blockerEvidence, 'verifiedCount:0', 'manual-review blocker retains verifiedCount 0');
assertIncludes(cleanupEvidence, 'operational5-orphan-binding-cleanup-apply', 'cleanup command gate retained');
assertIncludes(fixEvidence, "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'strict tombstone verification fix retained');

assertIncludes(foldersStore, 'async function operational5OrphanBindingCleanup(opts)', 'cleanup command retained');
assertIncludes(foldersStore, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup exact folder tombstone lookup retained');
assertIncludes(foldersStore, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup exact folderBinding tombstone lookup retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup still requires both strict tombstones');
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'strict active tombstone lookup retained');

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
  schema: 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-design.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_DESIGN_READY_CLEANUP_BLOCKED',
  rowA950Decision: 'keep-documented-debt',
  rowFddDecision: 'strict-evidence-receipt-design-only',
  cleanupApplyApproved: false,
  tombstoneSubstituteMinted: false,
  strictVerificationWeakened: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  next: 'strict-evidence-receipt-implementation-for-row-fdd-only-if-approved',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-strict-evidence-receipt-design');
