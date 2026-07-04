#!/usr/bin/env node
//
// Operational.5 - orphan-binding strict evidence receipt write-intent fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-write-intent-fix.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-strict-evidence-receipt-implementation.md';
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
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT WRITE-INTENT FIX IMPLEMENTED - CLEANUP STILL BLOCKED',
  '6d9267f42e88cb14084ed46483a9cd870b2ac159',
  'writeRequested:false',
  'dryRun:true',
  'status:"dry-run-strict-evidence-receipt-ready"',
  'receiptPersisted:false',
  'opts.apply === true',
  'opts.write === true',
  'opts.record === true',
  'apply:true',
  'operational5-orphan-binding-strict-evidence-receipt-record',
  'writeRequested:true',
  'dryRun:false',
  'receiptPersisted:true',
  'recorded-strict-evidence-receipt',
  'already-recorded-strict-evidence-receipt',
  'cleanupApplyApproved:false',
  'noBindingDelete:true',
  'productSyncReady:false',
  'Dry-run remains zero-write',
  '`apply:true` without the exact gate remains blocked',
  'Duplicate apply remains zero-write/idempotent',
  'The receipt is not cleanup authorization',
  'The receipt is not a tombstone substitute',
  'Cleanup apply remains blocked',
  'No folder/chat/binding/tombstone deletion',
  'No WebDAV/cloud/relay/`fullBundle.v3`',
  'No Chat Saving WebDAV/cloud/archive CAS',
  'Codex did not run live receipt recording',
  'Codex did not run cleanup apply',
]) {
  assertIncludes(flat, token, `write-intent evidence token ${token}`);
}

assertIncludes(implementationEvidence, 'OPERATIONAL.5 ORPHAN-BINDING STRICT EVIDENCE RECEIPT PATH IMPLEMENTED - CLEANUP STILL BLOCKED',
  'base strict evidence implementation retained');

const receiptBody = functionBody(foldersStore, 'operational5OrphanBindingStrictEvidenceReceipt', '/* Operational.5 reviewed orphan-binding cleanup.');
assertIncludes(receiptBody, 'var writeRequested = opts.apply === true || opts.write === true || opts.record === true',
  'write intent must include apply true');
assertIncludes(receiptBody, 'dryRun: !(writeRequested && gateSatisfied)', 'dry-run remains tied to write intent plus gate');
assertIncludes(receiptBody, "result.status = 'blocked-receipt-gate-required'", 'ungated apply/write remains blocked');
assertIncludes(receiptBody, "result.status = 'recorded-strict-evidence-receipt'", 'gated apply records receipt');
assertIncludes(receiptBody, "result.status = 'already-recorded-strict-evidence-receipt'", 'duplicate apply is idempotent');
assertIncludes(receiptBody, 'result.duplicateReceiptZeroWrite = true', 'duplicate apply zero-write flag retained');
assertIncludes(receiptBody, 'cleanupApplyApproved: false', 'receipt cannot approve cleanup');
assertIncludes(receiptBody, 'tombstoneSubstitute: false', 'receipt cannot substitute tombstone');
assertIncludes(receiptBody, 'noBindingDelete: true', 'receipt does not delete binding');
assertIncludes(receiptBody, 'productSyncReady: false', 'receipt keeps productSyncReady false');

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
  assertNotIncludes(receiptBody, forbidden, `receipt body forbidden ${forbidden}`);
}

function model(opts) {
  const gate = opts.gate === 'operational5-orphan-binding-strict-evidence-receipt-record';
  const writeRequested = opts.apply === true || opts.write === true || opts.record === true;
  if (!opts.eligible) return { status: 'blocked-strict-evidence-receipt-eligibility-failed', writes: 0 };
  if (writeRequested && !gate) return { status: 'blocked-receipt-gate-required', writes: 0, writeRequested, dryRun: true };
  if (!(writeRequested && gate)) return { status: 'dry-run-strict-evidence-receipt-ready', writes: 0, writeRequested, dryRun: true };
  if (opts.alreadyRecorded) return { status: 'already-recorded-strict-evidence-receipt', writes: 0, writeRequested, dryRun: false };
  return { status: 'recorded-strict-evidence-receipt', writes: 1, writeRequested, dryRun: false };
}

assert.deepEqual(model({ eligible: true }), {
  status: 'dry-run-strict-evidence-receipt-ready',
  writes: 0,
  writeRequested: false,
  dryRun: true,
}, 'dry-run stays zero-write');
assert.deepEqual(model({ eligible: true, apply: true }), {
  status: 'blocked-receipt-gate-required',
  writes: 0,
  writeRequested: true,
  dryRun: true,
}, 'apply true without gate blocks');
assert.deepEqual(model({ eligible: true, apply: true, gate: 'operational5-orphan-binding-strict-evidence-receipt-record' }), {
  status: 'recorded-strict-evidence-receipt',
  writes: 1,
  writeRequested: true,
  dryRun: false,
}, 'apply true with gate records exactly one receipt');
assert.deepEqual(model({ eligible: true, apply: true, gate: 'operational5-orphan-binding-strict-evidence-receipt-record', alreadyRecorded: true }), {
  status: 'already-recorded-strict-evidence-receipt',
  writes: 0,
  writeRequested: true,
  dryRun: false,
}, 'duplicate apply is zero-write');
assert.equal(model({ eligible: true, write: true, gate: 'operational5-orphan-binding-strict-evidence-receipt-record' }).writes, 1,
  'legacy write spelling still records');
assert.equal(model({ eligible: true, record: true, gate: 'operational5-orphan-binding-strict-evidence-receipt-record' }).writes, 1,
  'record spelling still records');

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
  schema: 'h2o.studio.operational5.orphan-binding-strict-evidence-receipt-write-intent-fix.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_RECEIPT_WRITE_INTENT_FIXED_CLEANUP_BLOCKED',
  rootCause: 'write intent ignored apply:true and only accepted write:true or record:true',
  approvedLiveCallShape: {
    apply: true,
    gate: 'operational5-orphan-binding-strict-evidence-receipt-record',
  },
  dryRunZeroWrite: true,
  applyWithGateRecordsExactlyOneReceipt: true,
  applyWithoutGateBlocks: true,
  duplicateApplyZeroWrite: true,
  cleanupApplyApproved: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-orphan-binding-strict-evidence-receipt-write-intent-fix');
