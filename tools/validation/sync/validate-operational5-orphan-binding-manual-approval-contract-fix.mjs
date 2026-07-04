#!/usr/bin/env node
//
// Operational.5 - orphan-binding manual-approval cleanup override contract fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-contract-fix.md';
const overrideEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-implementation.md';
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
const overrideEvidence = read(overrideEvidencePath);
const liveCloseout = read(liveCloseoutPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CONTRACT FIX IMPLEMENTED - LIVE CLEANUP APPLY NOT RUN',
  'ab6455991db40bd5fc00e02a9e00f8485caab810',
  '3e2f55eeaca5e18cea679348349ca9082313f77a',
  'row:fdd2456fc8a2',
  'row:a950a44b859f',
  'operational5-orphan-binding-manual-approval-cleanup-override-apply',
  'blocked-manual-approval-required',
  'operational5-orphan-binding-manual-approval-cleanup-override-manual-approval-required',
  'approved: true',
  'scope: "row:fdd2456fc8a2-only"',
  'reason: "operator-approved-dry-run-only-after-strict-evidence-receipt"',
  'noCleanupApplyYet: true',
  'ok:true',
  'status:"dry-run-manual-approval-cleanup-override-ready"',
  'removedCount:0',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1',
  'reviewedOverrideApproved: true',
  'cleanupApplyApproved: true',
  'removeOnlyExactDanglingFolderBindingRow: true',
  'Apply with only the dry-run approval still blocks',
  'Duplicate apply remains zero-write/idempotent',
  'No live cleanup apply was run by Codex',
  'productSyncReady:false',
  'WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `contract evidence token ${token}`);
}

for (const forbidden of [
  'live cleanup apply succeeded',
  'cleanup apply completed',
  'productSyncReady:true',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'fallback restored',
]) {
  assertNotIncludes(flat, forbidden, `contract evidence forbidden ${forbidden}`);
}

assertIncludes(overrideEvidence, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE IMPLEMENTED - LIVE APPLY NOT RUN',
  'base override implementation retained');
assertIncludes(liveCloseout, 'receiptPersisted:true', 'strict evidence receipt live closeout retained');

for (const token of [
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_GATE = 'operational5-orphan-binding-manual-approval-cleanup-override-apply'",
  "OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_SCHEMA = 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1'",
  'function operational5ManualApprovalCleanupOverrideAccepted(approval, strictEvidenceReceipt, requireApplyApproval)',
  'async function operational5OrphanBindingManualApprovalCleanupOverride(opts)',
]) {
  assertIncludes(foldersStore, token, `source token ${token}`);
}

const approvalBody = functionBody(foldersStore, 'operational5ManualApprovalCleanupOverrideAccepted', 'async function operational5OrphanBindingStrictEvidenceReceipt');
for (const token of [
  'var approved = a.approved === true',
  "var scopeOk = cleanString(a.scope) === 'row:fdd2456fc8a2-only'",
  'var targetOk = !a.targetRowToken || cleanString(a.targetRowToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN',
  'var reasonOk = !!cleanString(a.reason)',
  'var dryRunOnlyOk = a.noCleanupApplyYet === true',
  'if (!requireApplyApproval)',
  'return approved && scopeOk && targetOk && dryRunOnlyOk && reasonOk',
  'cleanString(a.schema) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_SCHEMA',
  'cleanString(a.targetRowToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN',
  'OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  'cleanString(a.strictEvidenceReceiptId) === receiptId',
  'reviewedOverrideApproved === true',
  'cleanupApplyApproved === true',
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

const overrideBody = functionBody(foldersStore, 'operational5OrphanBindingManualApprovalCleanupOverride', '/* Operational.5 reviewed orphan-binding cleanup.');
for (const token of [
  'var applyRequested = opts.apply === true',
  'var gateSatisfied = cleanString(opts.gate) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_GATE',
  'dryRun: !(applyRequested && gateSatisfied)',
  'rowA950Excluded: true',
  'strictEvidenceReceiptRequired: true',
  'manualApprovalRequired: true',
  'cleanupApplyApprovedByStrictEvidenceReceipt: false',
  'var resolved = await operational5ResolveStrictEvidenceReceiptTarget()',
  'resolved.strictEvidenceReceipt',
  'applyRequested',
  "result.status = 'blocked-manual-approval-required'",
  "result.status = 'blocked-override-apply-gate-required'",
  "result.status = 'dry-run-manual-approval-cleanup-override-ready'",
  "result.status = 'already-removed-manual-approval-cleanup-override'",
  "result.status = result.ok ? 'applied-manual-approval-cleanup-override' : 'blocked-override-delete-zero-rows'",
  "sqlExecute('DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?'",
  'productSyncReady: false',
]) {
  assertIncludes(overrideBody, token, `override body token ${token}`);
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

const targetRow = 'row:fdd2456fc8a2';
const excludedRow = 'row:a950a44b859f';
const gate = 'operational5-orphan-binding-manual-approval-cleanup-override-apply';
const schema = 'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.v1';
const receiptId = 'operational5-orphan-binding-strict-evidence-receipt:row:fdd2456fc8a2';

function approvalAccepted(approval, requireApplyApproval) {
  const a = approval || {};
  const approved = a.approved === true;
  const scopeOk = a.scope === 'row:fdd2456fc8a2-only';
  const targetOk = !a.targetRowToken || a.targetRowToken === targetRow;
  const reasonOk = typeof a.reason === 'string' && a.reason.length > 0;
  const dryRunOnlyOk = a.noCleanupApplyYet === true;
  if (!requireApplyApproval) return approved && scopeOk && targetOk && dryRunOnlyOk && reasonOk;
  return a.schema === schema &&
    approved &&
    scopeOk &&
    a.targetRowToken === targetRow &&
    (a.rejectedRowTokenShouldRemainDebt || a.excludedRowToken) === excludedRow &&
    a.chatToken === 'r:2f29d39a6c4f' &&
    a.folderToken === 'r:2d5469848470' &&
    a.strictEvidenceReceiptId === receiptId &&
    a.reviewedOverrideApproved === true &&
    a.cleanupApplyApproved === true &&
    a.removeOnlyExactDanglingFolderBindingRow === true &&
    a.noFolderDelete === true &&
    a.noChatDelete === true &&
    a.noTombstoneMutation === true &&
    a.noLedgerMutation === true &&
    a.noImportExportMutation === true &&
    a.noRenderMirrorWrite === true &&
    a.noWebdavWrite === true &&
    a.noChatSavingCas === true &&
    a.productSyncReady === false;
}

const dryRunApproval = {
  approved: true,
  scope: 'row:fdd2456fc8a2-only',
  reason: 'operator-approved-dry-run-only-after-strict-evidence-receipt',
  noCleanupApplyYet: true,
};
const fullApplyApproval = {
  schema,
  approved: true,
  scope: 'row:fdd2456fc8a2-only',
  targetRowToken: targetRow,
  rejectedRowTokenShouldRemainDebt: excludedRow,
  chatToken: 'r:2f29d39a6c4f',
  folderToken: 'r:2d5469848470',
  strictEvidenceReceiptId: receiptId,
  reviewedOverrideApproved: true,
  cleanupApplyApproved: true,
  removeOnlyExactDanglingFolderBindingRow: true,
  noFolderDelete: true,
  noChatDelete: true,
  noTombstoneMutation: true,
  noLedgerMutation: true,
  noImportExportMutation: true,
  noRenderMirrorWrite: true,
  noWebdavWrite: true,
  noChatSavingCas: true,
  productSyncReady: false,
};

assert.equal(approvalAccepted(dryRunApproval, false), true, 'dry-run approval accepted');
assert.equal(approvalAccepted({}, false), false, 'missing dry-run approval blocks');
assert.equal(approvalAccepted({ ...dryRunApproval, scope: 'all-rows' }, false), false, 'wrong dry-run scope blocks');
assert.equal(approvalAccepted({ ...dryRunApproval, noCleanupApplyYet: false }, false), false, 'dry-run must say no cleanup apply yet');
assert.equal(approvalAccepted(dryRunApproval, true), false, 'dry-run approval cannot authorize apply');
assert.equal(approvalAccepted(fullApplyApproval, true), true, 'full apply approval accepted');
assert.equal(approvalAccepted({ ...fullApplyApproval, cleanupApplyApproved: false }, true), false, 'apply approval must explicitly approve cleanup');
assert.equal(approvalAccepted({ ...fullApplyApproval, targetRowToken: excludedRow }, true), false, 'a950 cannot be approved');

function model(opts) {
  if (opts.rowToken === excludedRow) return { status: 'rejected-documented-debt-row-excluded', writes: 0 };
  if (opts.rowToken !== targetRow) return { status: 'rejected-target-token-mismatch', writes: 0 };
  if (!opts.strictEvidenceReceipt) return { status: 'blocked-override-preconditions-failed', writes: 0 };
  const applyRequested = opts.apply === true;
  const accepted = approvalAccepted(opts.manualApproval, applyRequested);
  if (!accepted) return { status: 'blocked-manual-approval-required', writes: 0 };
  if (applyRequested && opts.gate !== gate) return { status: 'blocked-override-apply-gate-required', writes: 0 };
  if (!applyRequested) return { status: 'dry-run-manual-approval-cleanup-override-ready', writes: 0, ok: true };
  if (opts.alreadyRemoved) return { status: 'already-removed-manual-approval-cleanup-override', writes: 0, ok: true };
  return { status: 'applied-manual-approval-cleanup-override', writes: 1, ok: true };
}

assert.deepEqual(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: dryRunApproval }), {
  status: 'dry-run-manual-approval-cleanup-override-ready',
  writes: 0,
  ok: true,
}, 'dry-run with valid approval is ok and zero-write');
assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true }).status,
  'blocked-manual-approval-required', 'dry-run missing approval blocks');
assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: dryRunApproval, apply: true, gate }).status,
  'blocked-manual-approval-required', 'apply with dry-run approval blocks');
assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: fullApplyApproval, apply: true }).status,
  'blocked-override-apply-gate-required', 'apply with full approval still requires gate');
assert.deepEqual(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: fullApplyApproval, apply: true, gate }), {
  status: 'applied-manual-approval-cleanup-override',
  writes: 1,
  ok: true,
}, 'apply with full approval and gate removes one row in model');
assert.deepEqual(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: fullApplyApproval, apply: true, gate, alreadyRemoved: true }), {
  status: 'already-removed-manual-approval-cleanup-override',
  writes: 0,
  ok: true,
}, 'duplicate apply is zero-write');
assert.equal(model({ rowToken: excludedRow, strictEvidenceReceipt: true, manualApproval: fullApplyApproval }).status,
  'rejected-documented-debt-row-excluded', 'a950 remains excluded');

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
  schema: 'h2o.studio.operational5.orphan-binding-manual-approval-contract-fix.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CONTRACT_FIXED_LIVE_CLEANUP_APPLY_NOT_RUN',
  rootCause: 'dry-run approval was evaluated as full controlled-apply approval',
  dryRunApprovalAccepted: true,
  dryRunZeroWrite: true,
  applyRequiresFullApproval: true,
  applyRequiresExactGate: true,
  targetRowOnly: targetRow,
  rowA950Excluded: true,
  duplicateApplyZeroWrite: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-manual-approval-contract-fix');
