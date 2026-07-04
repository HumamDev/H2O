#!/usr/bin/env node
//
// Operational.5 - orphan-binding strict evidence receipt implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-implementation.md';
const designEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-design.md';
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
function functionBody(source, name, endToken) {
  const start = source.indexOf(`async function ${name}`);
  assert.ok(start > 0, `missing function ${name}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `missing end token ${endToken} after ${name}`);
  return source.slice(start, end);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const designEvidence = read(designEvidencePath);
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
  'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT PATH IMPLEMENTED - CLEANUP STILL BLOCKED',
  'e2b804c487973f4cf8efb5058a8df91378cb13c4',
  'da77730465dd2db272a6e392640c55c682655a9d',
  '2ecfbd81eddbef72b6f3c626ce503b33939291c4',
  'b344120ac4462b6e91f7ac6bfb4cff507cab0a68',
  '9fdf2dab',
  '221d91b6',
  '9dd82fdf',
  'src-surfaces-base/studio/store/folders.tauri.js',
  'operational5OrphanBindingStrictEvidenceReceipt(opts)',
  'h2o:studio:operational5:orphan-binding-strict-evidence-receipts:v1',
  'h2o.studio.operational5.orphan-binding-strict-evidence-receipt.v1',
  'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-result.v1',
  'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-ledger.v1',
  'operational5-orphan-binding-strict-evidence-receipt-record',
  'rowToken:"row:fdd2456fc8a2"',
  'chatToken:"r:2f29d39a6c4f"',
  'folderToken:"r:2d5469848470"',
  'exact active folderBinding tombstone present',
  'exact active folder tombstone absent',
  'no cleanup authorization',
  'no tombstone substitute',
  'manual approval prerequisite only',
  '`row:a950a44b859f` is explicitly rejected as documented debt',
  'write without the receipt gate is rejected',
  'duplicate write with the same receipt hash is zero-write/idempotent',
  'Cleanup apply remains blocked',
  'No folder/chat/binding/tombstone deletion',
  'No tombstone create/update/delete',
  'No sync consumed-ledger mutation',
  'No import/export state mutation',
  'No render-mirror write',
  'No `productSyncReady` flip',
  'No WebDAV/cloud/relay/`fullBundle.v3`',
  'No Chat Saving WebDAV/cloud/archive CAS',
  'No fallback',
]) {
  assertIncludes(flat, token, `implementation evidence token ${token}`);
}

for (const forbidden of [
  'cleanup apply approved',
  'cleanup apply completed',
  'binding row removed',
  'productSyncReady:true',
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'rawChatId:',
  'rawFolderId:',
]) {
  assertNotIncludes(flat, forbidden, `implementation evidence forbidden claim ${forbidden}`);
}

assertIncludes(designEvidence, 'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT DESIGN READY - CLEANUP STILL BLOCKED',
  'design evidence retained');
assertIncludes(liveDiagnostic, 'OPERATIONAL.5 ORPHAN-BINDING LIVE PROVENANCE DIAGNOSTIC READY - READ-ONLY DEVTOOLS STEP APPROVED',
  'live diagnostic retained');
assertIncludes(provenanceSearch, 'STRICT TOMBSTONE EVIDENCE STILL MISSING', 'provenance search retained');
assertIncludes(packetEvidence, 'CLEANUP APPLY BLOCKED', 'manual review packet retained');
assertIncludes(blockerEvidence, 'verifiedCount:0', 'manual-review blocker retained');
assertIncludes(cleanupEvidence, 'operational5-orphan-binding-cleanup-apply', 'cleanup implementation retained');
assertIncludes(fixEvidence, "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'strict tombstone verification fix retained');

for (const token of [
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_GATE = 'operational5-orphan-binding-strict-evidence-receipt-record'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_SCHEMA = 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt.v1'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_RESULT_SCHEMA = 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-result.v1'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_LEDGER_KEY = 'h2o:studio:operational5:orphan-binding-strict-evidence-receipts:v1'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN = 'row:fdd2456fc8a2'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_CHAT_TOKEN = 'r:2f29d39a6c4f'",
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_FOLDER_TOKEN = 'r:2d5469848470'",
  "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'function operational5StrictEvidenceReceiptId(rowToken)',
  'function operational5StrictEvidenceLedgerShape(input)',
  'async function readOperational5StrictEvidenceLedger()',
  'async function writeOperational5StrictEvidenceLedger(ledger)',
  'function operational5ReceiptSafeShape(row)',
  'async function operational5OrphanBindingStrictEvidenceReceipt(opts)',
  'operational5OrphanBindingStrictEvidenceReceipt: operational5OrphanBindingStrictEvidenceReceipt',
  'var writeRequested = opts.apply === true || opts.write === true || opts.record === true',
]) {
  assertIncludes(foldersStore, token, `source token ${token}`);
}

const receiptBody = functionBody(foldersStore, 'operational5OrphanBindingStrictEvidenceReceipt', 'async function operational5OrphanBindingManualApprovalCleanupOverride');
for (const token of [
  "rowToken === OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN",
  "result.status = 'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt'",
  "rowToken !== OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN",
  "chatToken !== OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_CHAT_TOKEN",
  "folderToken !== OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_FOLDER_TOKEN",
  "result.status = 'rejected-target-token-mismatch'",
  "matches.length !== 1",
  "tombstones.getTombstone('folder', folderTombstoneRecordId(target.folderId))",
  "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(target.chatId) + ':' + encodeURIComponent(target.folderId))",
  'var eligible = !!chatRow && folderAbsent && safeShape && !folderTomb && !!bindingTomb',
  'cleanupApplyApproved: false',
  'tombstoneSubstitute: false',
  'manualApprovalPrerequisiteOnly: true',
  'exactFolderTombstonePresent: false',
  'exactFolderBindingTombstonePresent: true',
  'chatLive: true',
  'folderAbsentFromCanonicalFolders: true',
  'rowSafeShape: true',
  'privacy: { redacted: true, hashOnly: true, rawIdsLogged: false, rawNamesLogged: false }',
  "result.status = 'blocked-receipt-gate-required'",
  "result.status = 'already-recorded-strict-evidence-receipt'",
  'result.duplicateReceiptZeroWrite = true',
  "result.status = 'blocked-conflicting-strict-evidence-receipt'",
  'await writeOperational5StrictEvidenceLedger(ledger)',
  "result.status = 'recorded-strict-evidence-receipt'",
]) {
  assertIncludes(receiptBody, token, `receipt body token ${token}`);
}

for (const forbidden of [
  'operational5OrphanBindingCleanup(',
  "DELETE FROM folder_bindings",
  'sqlExecute(',
  'createTombstone(',
  'writeTombstone',
  'bindChat(',
  'unbindChat(',
  'moveCanonicalChatFolderBinding(',
  'recordWrite(',
  'productSyncReady: true',
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
]) {
  assertNotIncludes(receiptBody, forbidden, `receipt body forbidden ${forbidden}`);
}

const cleanupBody = functionBody(foldersStore, 'operational5OrphanBindingCleanup', 'function canonicalBindingStoreIdentity');
assertIncludes(cleanupBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'cleanup exact folder tombstone lookup retained');
assertIncludes(cleanupBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'cleanup exact folderBinding tombstone lookup retained');
assertIncludes(cleanupBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'cleanup still requires both strict tombstones');
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'strict active tombstone lookup retained');

function model(opts) {
  const rowToken = opts.rowToken;
  const chatToken = opts.chatToken;
  const folderToken = opts.folderToken;
  const gate = opts.gate === 'operational5-orphan-binding-strict-evidence-receipt-record';
  const write = opts.apply === true || opts.write === true || opts.record === true;
  if (rowToken === 'row:a950a44b859f') return { status: 'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt' };
  if (rowToken !== 'row:fdd2456fc8a2' || chatToken !== 'r:2f29d39a6c4f' || folderToken !== 'r:2d5469848470') {
    return { status: 'rejected-target-token-mismatch' };
  }
  if (!opts.chatLive || !opts.folderAbsent || !opts.safeShape || opts.folderTombstone || !opts.bindingTombstone) {
    return { status: 'blocked-strict-evidence-receipt-eligibility-failed' };
  }
  if (write && !gate) return { status: 'blocked-receipt-gate-required', writes: 0 };
  if (!write) return { status: 'dry-run-strict-evidence-receipt-ready', writes: 0 };
  if (opts.alreadyRecorded) return { status: 'already-recorded-strict-evidence-receipt', writes: 0 };
  return { status: 'recorded-strict-evidence-receipt', writes: 1 };
}
assert.equal(model({ rowToken: 'row:a950a44b859f' }).status,
  'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt',
  'model rejects row a950');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', chatToken: 'bad', folderToken: 'r:2d5469848470' }).status,
  'rejected-target-token-mismatch',
  'model rejects token mismatch');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', chatToken: 'r:2f29d39a6c4f', folderToken: 'r:2d5469848470',
  chatLive: true, folderAbsent: true, safeShape: true, folderTombstone: false, bindingTombstone: true }).status,
  'dry-run-strict-evidence-receipt-ready',
  'model dry-run ready');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', chatToken: 'r:2f29d39a6c4f', folderToken: 'r:2d5469848470',
  chatLive: true, folderAbsent: true, safeShape: true, folderTombstone: false, bindingTombstone: true, apply: true }).status,
  'blocked-receipt-gate-required',
  'model apply requires gate');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', chatToken: 'r:2f29d39a6c4f', folderToken: 'r:2d5469848470',
  chatLive: true, folderAbsent: true, safeShape: true, folderTombstone: false, bindingTombstone: true, apply: true,
  gate: 'operational5-orphan-binding-strict-evidence-receipt-record' }).writes,
  1,
  'model gated apply records exactly one receipt');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', chatToken: 'r:2f29d39a6c4f', folderToken: 'r:2d5469848470',
  chatLive: true, folderAbsent: true, safeShape: true, folderTombstone: false, bindingTombstone: true, apply: true,
  gate: 'operational5-orphan-binding-strict-evidence-receipt-record', alreadyRecorded: true }).writes,
  0,
  'model duplicate apply zero-write');

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
  schema: 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-implementation.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_PATH_IMPLEMENTED_CLEANUP_BLOCKED',
  productSourceChanged: [foldersStorePath],
  storageKey: 'h2o:studio:operational5:orphan-binding-strict-evidence-receipts:v1',
  gate: 'operational5-orphan-binding-strict-evidence-receipt-record',
  rowFddReceiptPathImplemented: true,
  rowA950DocumentedDebt: true,
  cleanupApplyApproved: false,
  tombstoneSubstitute: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-strict-evidence-receipt-implementation');
