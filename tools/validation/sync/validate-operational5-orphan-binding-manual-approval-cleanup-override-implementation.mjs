#!/usr/bin/env node
//
// Operational.5 - orphan-binding manual-approval cleanup override implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-implementation.md';
const designPath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-design.md';
const liveCloseoutPath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-live-closeout.md';
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
  let start = source.indexOf(`async function ${name}`);
  if (start < 0) start = source.indexOf(`function ${name}`);
  assert.ok(start > 0, `missing function ${name}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `missing end token ${endToken} after ${name}`);
  return source.slice(start, end);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const design = read(designPath);
const liveCloseout = read(liveCloseoutPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE IMPLEMENTED - LIVE APPLY NOT RUN',
  '0cf683b6c3b50e9265062cc9bc19875dd01c1f76',
  '6d9267f42e88cb14084ed46483a9cd870b2ac159',
  'db60e7b228510363bc01ca97948941b3bd686fec',
  '3e2f55eeaca5e18cea679348349ca9082313f77a',
  'src-surfaces-base/studio/store/folders.tauri.js',
  'operational5OrphanBindingManualApprovalCleanupOverride(opts)',
  'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-result.v1',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-receipt.v1',
  'dry-run zero-write',
  'apply without the exact gate blocks',
  'gated apply removes exactly one row',
  'duplicate apply is zero-write/idempotent',
  'raw canonical bindings `14 -> 13`',
  'exportable canonical bindings remain `12`',
  '`fullBundle.v2` binding projection remains `12`',
  '`row:a950a44b859f` remains documented debt',
  'No live cleanup apply was run by Codex',
  'Existing strict tombstone-backed cleanup remains unchanged',
  'Do not run controlled apply until the dry-run output proves',
]) {
  assertIncludes(flat, token, `implementation evidence token ${token}`);
}

for (const forbidden of [
  'live cleanup apply completed',
  'live cleanup apply succeeded',
  'productSyncReady:true',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'fallback restored',
]) {
  assertNotIncludes(flat, forbidden, `implementation evidence forbidden ${forbidden}`);
}

assertIncludes(design, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE DESIGN READY - NO CLEANUP APPLIED',
  'design retained');
assertIncludes(liveCloseout, 'receiptPersisted:true', 'strict evidence receipt closeout retained');

for (const token of [
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_GATE = 'operational5-orphan-binding-manual-approval-cleanup-override-apply'",
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_SCHEMA = 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1'",
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_RESULT_SCHEMA = 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-result.v1'",
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_RECEIPT_SCHEMA = 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-receipt.v1'",
  'async function operational5ResolveStrictEvidenceReceiptTarget()',
  'function operational5ManualApprovalCleanupOverrideAccepted(approval, strictEvidenceReceipt)',
  'async function operational5OrphanBindingManualApprovalCleanupOverride(opts)',
  'operational5OrphanBindingManualApprovalCleanupOverride: operational5OrphanBindingManualApprovalCleanupOverride',
]) {
  assertIncludes(foldersStore, token, `source token ${token}`);
}

const overrideBody = functionBody(foldersStore, 'operational5OrphanBindingManualApprovalCleanupOverride', '/* Operational.5 reviewed orphan-binding cleanup.');
for (const token of [
  'var applyRequested = opts.apply === true',
  'var gateSatisfied = cleanString(opts.gate) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_GATE',
  'dryRun: !(applyRequested && gateSatisfied)',
  'targetRowToken: OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN',
  'excludedRowToken: OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  'rowA950Excluded: true',
  'strictEvidenceReceiptRequired: true',
  'manualApprovalRequired: true',
  'cleanupApplyApprovedByStrictEvidenceReceipt: false',
  'tombstoneSubstitute: false',
  "result.status = 'rejected-documented-debt-row-excluded'",
  "result.status = 'rejected-target-token-mismatch'",
  'var resolved = await operational5ResolveStrictEvidenceReceiptTarget()',
  "result.status = 'blocked-override-preconditions-failed'",
  "result.status = 'blocked-manual-approval-required'",
  'OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_RECEIPT_SCHEMA',
  "result.status = 'blocked-override-apply-gate-required'",
  "result.status = 'dry-run-manual-approval-cleanup-override-ready'",
  "result.status = 'already-removed-manual-approval-cleanup-override'",
  'result.duplicateApplyZeroWrite = true',
  "sqlExecute('DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?'",
  'result.removedCount = readRowsAffected(del) > 0 ? 1 : 0',
  "result.status = result.ok ? 'applied-manual-approval-cleanup-override' : 'blocked-override-delete-zero-rows'",
  'productSyncReady: false',
]) {
  assertIncludes(overrideBody, token, `override body token ${token}`);
}

const resolverBody = functionBody(foldersStore, 'operational5ResolveStrictEvidenceReceiptTarget', 'function operational5ManualApprovalCleanupOverrideAccepted');
for (const token of [
  'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_CHAT_TOKEN',
  'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_FOLDER_TOKEN',
  'matches.length !== 1',
  'readOperational5StrictEvidenceLedger()',
  'strictEvidenceReceiptPresent',
  'strictEvidenceReceiptMatches',
  'cleanupApplyApproved === false',
  'tombstoneSubstitute === false',
  'manualApprovalPrerequisiteOnly === true',
]) {
  assertIncludes(resolverBody, token, `resolver body token ${token}`);
}

const approvalBody = functionBody(foldersStore, 'operational5ManualApprovalCleanupOverrideAccepted', 'async function operational5OrphanBindingStrictEvidenceReceipt');
for (const token of [
  'cleanString(a.schema) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_SCHEMA',
  'a.approved === true',
  'cleanString(a.targetRowToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN',
  'OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  'removeOnlyExactDanglingFolderBindingRow === true',
  'noFolderDelete === true',
  'noChatDelete === true',
  'noTombstoneMutation === true',
  'noLedgerMutation === true',
  'noImportExportMutation === true',
  'noRenderMirrorWrite === true',
  'noWebdavWrite === true',
  'noChatSavingCas === true',
  'productSyncReady === false',
]) {
  assertIncludes(approvalBody, token, `approval body token ${token}`);
}

for (const forbidden of [
  'DELETE FROM folders',
  'DELETE FROM chats',
  'createTombstone(',
  'writeTombstone',
  'moveCanonicalChatFolderBinding(',
  'productSyncReady: true',
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
]) {
  assertNotIncludes(overrideBody, forbidden, `override body forbidden ${forbidden}`);
}

const cleanupBody = functionBody(foldersStore, 'operational5OrphanBindingCleanup', 'function canonicalBindingStoreIdentity');
assertIncludes(cleanupBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))",
  'existing cleanup still requires exact folder tombstone');
assertIncludes(cleanupBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'existing cleanup still requires exact folderBinding tombstone');
assertIncludes(cleanupBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'existing cleanup strict verification unchanged');

function model(opts) {
  if (opts.rowToken === 'row:a950a44b859f') return { status: 'rejected-documented-debt-row-excluded', writes: 0 };
  if (opts.rowToken !== 'row:fdd2456fc8a2') return { status: 'rejected-target-token-mismatch', writes: 0 };
  if (!opts.strictEvidenceReceipt || !opts.manualApproval) return { status: 'blocked-manual-approval-required', writes: 0 };
  if (opts.apply === true && opts.gate !== 'operational5-orphan-binding-manual-approval-cleanup-override-apply') {
    return { status: 'blocked-override-apply-gate-required', writes: 0 };
  }
  if (opts.apply !== true) return { status: 'dry-run-manual-approval-cleanup-override-ready', writes: 0 };
  if (opts.alreadyRemoved) return { status: 'already-removed-manual-approval-cleanup-override', writes: 0 };
  return { status: 'applied-manual-approval-cleanup-override', writes: 1, rawBefore: 14, rawAfter: 13, exportable: 12, bundle: 12 };
}
assert.equal(model({ rowToken: 'row:a950a44b859f' }).status, 'rejected-documented-debt-row-excluded',
  'a950 rejected');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', strictEvidenceReceipt: true, manualApproval: true }).writes, 0,
  'dry-run zero-write');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', strictEvidenceReceipt: true, manualApproval: true, apply: true }).status,
  'blocked-override-apply-gate-required', 'apply requires gate');
const applyResult = model({
  rowToken: 'row:fdd2456fc8a2',
  strictEvidenceReceipt: true,
  manualApproval: true,
  apply: true,
  gate: 'operational5-orphan-binding-manual-approval-cleanup-override-apply',
});
assert.equal(applyResult.writes, 1, 'gated apply removes exactly one row');
assert.equal(applyResult.rawBefore, 14, 'modeled raw before 14');
assert.equal(applyResult.rawAfter, 13, 'modeled raw after 13');
assert.equal(applyResult.exportable, 12, 'modeled exportable remains 12');
assert.equal(applyResult.bundle, 12, 'modeled fullBundle.v2 remains 12');
assert.equal(model({ rowToken: 'row:fdd2456fc8a2', strictEvidenceReceipt: true, manualApproval: true, apply: true,
  gate: 'operational5-orphan-binding-manual-approval-cleanup-override-apply', alreadyRemoved: true }).writes, 0,
  'duplicate apply zero-write');

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
  schema: 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override-implementation.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_IMPLEMENTED_LIVE_APPLY_NOT_RUN',
  gate: 'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  dryRunZeroWrite: true,
  applyRequiresExactGate: true,
  targetRowOnly: 'row:fdd2456fc8a2',
  rowA950Excluded: true,
  strictEvidenceReceiptRequired: true,
  controlledApplyRemovesExactlyOneRowWhenGated: true,
  duplicateApplyZeroWrite: true,
  modeledRawCanonicalAfterApply: '14 -> 13',
  modeledExportableCanonicalBindings: 12,
  modeledFullBundleV2Bindings: 12,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-manual-approval-cleanup-override-implementation');
