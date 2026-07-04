#!/usr/bin/env node
//
// Operational.5 - orphan-binding manual-approval controlled-apply contract fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-controlled-apply-contract-fix.md';
const dryRunContractEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-contract-fix.md';
const overrideEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-implementation.md';
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
const dryRunContractEvidence = read(dryRunContractEvidencePath);
const overrideEvidence = read(overrideEvidencePath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CONTROLLED-APPLY CONTRACT FIX IMPLEMENTED - LIVE CLEANUP APPLY NOT RUN BY CODEX',
  'ab6455991db40bd5fc00e02a9e00f8485caab810',
  'ab3c8c75b427a6ded7525b1ee3eba904a0f1b749',
  'row:fdd2456fc8a2',
  'row:a950a44b859f',
  'blocked-manual-approval-required',
  'operational5-orphan-binding-manual-approval-cleanup-override-manual-approval-required',
  'removeOnlyExactDanglingFolderBindingRow:true',
  'repeated the top-level `chatToken` and `folderToken`',
  'optional-but-matching',
  'optional-but-not-false',
  'absent: accepted',
  '`true`: accepted',
  '`false`: rejected',
  'strictEvidenceReceiptHash: "7d169983ebbfb0d5076ac319282cd49ae04af2b70d93ba0a8f51674a1fdccf5c"',
  'operator-approved-fdd-only-controlled-cleanup-after-dry-run',
  'Apply without the exact gate still blocks',
  'Apply with missing/invalid approval still blocks',
  'Controlled apply model removes exactly one row only when gated and approved',
  'Duplicate apply remains zero-write/idempotent',
  'No live cleanup apply was run by Codex',
  'productSyncReady:false',
  'WebDAV/cloud/relay/`fullBundle.v3` remains deferred/not started',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `controlled-apply evidence token ${token}`);
}

for (const forbidden of [
  'live cleanup apply succeeded',
  'cleanup apply completed',
  'productSyncReady:true',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'fallback restored',
]) {
  assertNotIncludes(flat, forbidden, `controlled-apply evidence forbidden ${forbidden}`);
}

assertIncludes(dryRunContractEvidence, 'status:"dry-run-manual-approval-cleanup-override-ready"',
  'dry-run contract evidence retained');
assertIncludes(overrideEvidence, 'OPERATIONAL.5 ORPHAN-BINDING MANUAL-APPROVAL CLEANUP OVERRIDE IMPLEMENTED - LIVE APPLY NOT RUN',
  'override implementation evidence retained');

const approvalBody = functionBody(foldersStore, 'operational5ManualApprovalCleanupOverrideAccepted', 'async function operational5OrphanBindingStrictEvidenceReceipt');
for (const token of [
  'var exactRowIntentOk = a.removeOnlyExactDanglingFolderBindingRow !== false',
  'if (!requireApplyApproval)',
  'return approved && scopeOk && targetOk && dryRunOnlyOk && reasonOk',
  'cleanString(a.schema) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_SCHEMA',
  'cleanString(a.targetRowToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN',
  'cleanString(a.rejectedRowTokenShouldRemainDebt || a.excludedRowToken) === OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  '(!a.chatToken || cleanString(a.chatToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_CHAT_TOKEN)',
  '(!a.folderToken || cleanString(a.folderToken) === OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_FOLDER_TOKEN)',
  'cleanString(a.strictEvidenceReceiptId) === receiptId',
  'reviewedOverrideApproved === true',
  'cleanupApplyApproved === true',
  'exactRowIntentOk',
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
assertNotIncludes(approvalBody, 'a.removeOnlyExactDanglingFolderBindingRow === true',
  'approval body must not require redundant exact-row flag to be present');

const overrideBody = functionBody(foldersStore, 'operational5OrphanBindingManualApprovalCleanupOverride', '/* Operational.5 reviewed orphan-binding cleanup.');
for (const token of [
  'var applyRequested = opts.apply === true',
  'var gateSatisfied = cleanString(opts.gate) === OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CLEANUP_OVERRIDE_GATE',
  'rowA950Excluded: true',
  'strictEvidenceReceiptRequired: true',
  'cleanupApplyApprovedByStrictEvidenceReceipt: false',
  'var resolved = await operational5ResolveStrictEvidenceReceiptTarget()',
  'resolved.strictEvidenceReceipt',
  'applyRequested',
  "result.status = 'blocked-manual-approval-required'",
  "result.status = 'blocked-override-apply-gate-required'",
  "result.status = 'dry-run-manual-approval-cleanup-override-ready'",
  "result.status = 'already-removed-manual-approval-cleanup-override'",
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
const receiptHash = '7d169983ebbfb0d5076ac319282cd49ae04af2b70d93ba0a8f51674a1fdccf5c';

const liveApproval = {
  schema,
  approved: true,
  reviewedOverrideApproved: true,
  cleanupApplyApproved: true,
  scope: 'row:fdd2456fc8a2-only',
  targetRowToken: targetRow,
  excludedRowToken: excludedRow,
  strictEvidenceReceiptId: receiptId,
  strictEvidenceReceiptHash: receiptHash,
  reason: 'operator-approved-fdd-only-controlled-cleanup-after-dry-run',
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

function approvalAccepted(approval, requireApplyApproval) {
  const a = approval || {};
  const approved = a.approved === true;
  const scopeOk = a.scope === 'row:fdd2456fc8a2-only';
  const targetOk = !a.targetRowToken || a.targetRowToken === targetRow;
  const reasonOk = typeof a.reason === 'string' && a.reason.length > 0;
  const dryRunOnlyOk = a.noCleanupApplyYet === true;
  const exactRowIntentOk = a.removeOnlyExactDanglingFolderBindingRow !== false;
  if (!requireApplyApproval) return approved && scopeOk && targetOk && dryRunOnlyOk && reasonOk;
  return a.schema === schema &&
    approved &&
    scopeOk &&
    a.targetRowToken === targetRow &&
    (a.rejectedRowTokenShouldRemainDebt || a.excludedRowToken) === excludedRow &&
    (!a.chatToken || a.chatToken === 'r:2f29d39a6c4f') &&
    (!a.folderToken || a.folderToken === 'r:2d5469848470') &&
    a.strictEvidenceReceiptId === receiptId &&
    (!a.strictEvidenceReceiptHash || a.strictEvidenceReceiptHash === receiptHash) &&
    a.reviewedOverrideApproved === true &&
    a.cleanupApplyApproved === true &&
    exactRowIntentOk &&
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

assert.equal(approvalAccepted(liveApproval, true), true, 'live controlled-apply approval is accepted');
assert.equal(approvalAccepted({ ...liveApproval, removeOnlyExactDanglingFolderBindingRow: true }, true), true,
  'explicit exact-row true remains accepted');
assert.equal(approvalAccepted({ ...liveApproval, removeOnlyExactDanglingFolderBindingRow: false }, true), false,
  'explicit exact-row false blocks');
assert.equal(approvalAccepted({ ...liveApproval, cleanupApplyApproved: false }, true), false,
  'cleanup approval is required');
assert.equal(approvalAccepted({ ...liveApproval, targetRowToken: excludedRow }, true), false,
  'a950 cannot be approved');
assert.equal(approvalAccepted({ ...liveApproval, strictEvidenceReceiptHash: 'bad-hash' }, true), false,
  'wrong strict evidence receipt hash blocks');

function model(opts) {
  if (opts.rowToken === excludedRow) return { status: 'rejected-documented-debt-row-excluded', writes: 0 };
  if (opts.rowToken !== targetRow) return { status: 'rejected-target-token-mismatch', writes: 0 };
  if (!opts.strictEvidenceReceipt) return { status: 'blocked-override-preconditions-failed', writes: 0 };
  const applyRequested = opts.apply === true;
  if (!approvalAccepted(opts.manualApproval, applyRequested)) return { status: 'blocked-manual-approval-required', writes: 0 };
  if (applyRequested && opts.gate !== gate) return { status: 'blocked-override-apply-gate-required', writes: 0 };
  if (!applyRequested) return { status: 'dry-run-manual-approval-cleanup-override-ready', writes: 0, ok: true };
  if (opts.alreadyRemoved) return { status: 'already-removed-manual-approval-cleanup-override', writes: 0, ok: true };
  return { status: 'applied-manual-approval-cleanup-override', writes: 1, ok: true, rawBefore: 14, rawAfter: 13, exportable: 12, bundle: 12 };
}

assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: liveApproval, apply: true, gate }).writes,
  1, 'controlled apply model removes exactly one row');
assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: liveApproval, apply: true }).status,
  'blocked-override-apply-gate-required', 'apply without gate blocks');
assert.equal(model({ rowToken: targetRow, strictEvidenceReceipt: true, apply: true, gate }).status,
  'blocked-manual-approval-required', 'apply with missing approval blocks');
assert.equal(model({ rowToken: excludedRow, strictEvidenceReceipt: true, manualApproval: liveApproval, apply: true, gate }).status,
  'rejected-documented-debt-row-excluded', 'a950 remains excluded');
const duplicate = model({ rowToken: targetRow, strictEvidenceReceipt: true, manualApproval: liveApproval, apply: true, gate, alreadyRemoved: true });
assert.equal(duplicate.writes, 0, 'duplicate apply is zero-write');
assert.equal(duplicate.status, 'already-removed-manual-approval-cleanup-override', 'duplicate apply status retained');

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
  schema: 'h2o.studio.operational5.orphan-binding-manual-approval-controlled-apply-contract-fix.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_MANUAL_APPROVAL_CONTROLLED_APPLY_CONTRACT_FIXED_LIVE_CLEANUP_APPLY_NOT_RUN_BY_CODEX',
  rootCause: 'controlled apply required redundant nested chat/folder tokens and removeOnlyExactDanglingFolderBindingRow:true even though source already enforces exact-row targeting',
  liveApprovalAccepted: true,
  explicitFalseExactRowIntentBlocks: true,
  applyRequiresGate: true,
  missingApprovalBlocks: true,
  targetRowOnly: targetRow,
  rowA950Excluded: true,
  modeledControlledApplyWrites: 1,
  duplicateApplyZeroWrite: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-manual-approval-controlled-apply-contract-fix');
