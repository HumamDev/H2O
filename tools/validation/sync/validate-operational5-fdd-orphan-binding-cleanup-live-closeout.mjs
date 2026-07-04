#!/usr/bin/env node
//
// Operational.5 - fdd orphan-binding cleanup live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const overrideImplementationPath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-cleanup-override-implementation.md';
const dryRunContractPath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-contract-fix.md';
const applyContractPath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-approval-controlled-apply-contract-fix.md';
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

const evidence = read(evidencePath);
const flat = compact(evidence);
const overrideImplementation = read(overrideImplementationPath);
const dryRunContract = read(dryRunContractPath);
const applyContract = read(applyContractPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 FDD-ONLY ORPHAN-BINDING CLEANUP LIVE CLOSEOUT PASSED',
  'ab6455991db40bd5fc00e02a9e00f8485caab810',
  'ab3c8c75b427a6ded7525b1ee3eba904a0f1b749',
  'f8e3f779db04184b013afeab9042d02be01fb090',
  'h2o.studio.operational5.orphan-binding-manual-approval-cleanup-override.live-apply.v2',
  'status:"applied-manual-approval-cleanup-override"',
  'ok:true',
  'targetRowToken:"row:fdd2456fc8a2"',
  'excludedRowToken:"row:a950a44b859f"',
  'rowA950Excluded:true',
  'removedCount:1',
  'rawCanonicalBindingCountBefore:14',
  'rawCanonicalBindingCountAfter:13',
  'exportableCanonicalBindingCount:12',
  'expectedFullBundleV2BindingProjectionCount:12',
  'h2o.studio.operational5.post-fdd-cleanup-parity-check.v1',
  'canonicalFolders:6',
  'rawCanonicalBindings:13',
  'exportableCanonicalBindings:12',
  'danglingBindings:1',
  'fullBundleV2Bindings:12',
  'danglingRowTokens:["row:a950a44b859f"]',
  'a950StillPresent:true',
  'fddStillPresent:false',
  'rawExpected13:true',
  'exportableExpected12:true',
  'fullBundleExpected12:true',
  'fddRemoved:true',
  'a950StillDebt:true',
  'POST-CLEANUP PARITY PASS',
  'productSyncReady:false',
  'WebDAV/cloud/relay: `blocked`',
  '`fullBundle.v3`: `not-started`',
  'Chat Saving CAS: `blocked`',
]) {
  assertIncludes(flat, token, `closeout evidence token ${token}`);
}

for (const token of [
  'No folder delete.',
  'No chat delete.',
  'No tombstone mutation.',
  'No ledger mutation.',
  'No import/export state mutation.',
  'No render-mirror write.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  '`productSyncReady:false` remained false during apply and parity proof.',
]) {
  assertIncludes(flat, token, `boundary token ${token}`);
}

for (const forbidden of [
  'row:a950a44b859f` was removed',
  'productSyncReady:true',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
]) {
  assertNotIncludes(flat, forbidden, `closeout forbidden ${forbidden}`);
}

assertIncludes(overrideImplementation, 'row:fdd2456fc8a2`-only manual-approval cleanup override command',
  'override implementation retained');
assertIncludes(dryRunContract, 'status:"dry-run-manual-approval-cleanup-override-ready"',
  'dry-run contract retained');
assertIncludes(applyContract, 'Approved Controlled-Apply Call Shape',
  'controlled apply contract retained');

assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt source token retained');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN = 'row:fdd2456fc8a2'",
  'fdd target source token retained');
assertIncludes(foldersStore, "sqlExecute('DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?'",
  'exact row delete source remains scoped');

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.fdd-orphan-binding-cleanup-live-closeout.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_FDD_ORPHAN_BINDING_CLEANUP_LIVE_CLOSEOUT_PASSED',
  targetRowRemoved: 'row:fdd2456fc8a2',
  excludedRowStillDebt: 'row:a950a44b859f',
  removedCount: 1,
  rawCanonicalBindingCountBefore: 14,
  rawCanonicalBindingCountAfter: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-fdd-orphan-binding-cleanup-live-closeout');
