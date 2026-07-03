#!/usr/bin/env node
//
// Folder Sync productSyncReady readiness re-check after S5.
//
// Proves sortOrder is no longer the active blocker after S5, while binding-mismatch
// and product transport readiness still keep productSyncReady false.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';
const s5EvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const s2CloseoutPath = 'release-evidence/2026-07-01/folder-sync-s2-sortorder-local-closeout.md';
const s2bLivePath = 'release-evidence/2026-07-01/folder-sync-s2b-live-projection-activation.md';
const bindingImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

for (const rel of [
  evidencePath,
  s5EvidencePath,
  s2CloseoutPath,
  s2bLivePath,
  foldersStorePath,
  folderSyncPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const s5Evidence = read(s5EvidencePath);
const s2Closeout = read(s2CloseoutPath);
const s2bLive = read(s2bLivePath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const combinedSource = `${foldersStore}\n${folderSync}\n${folderImport}`;
const bindingRepairImplemented = exists(bindingImplementationEvidencePath);

for (const token of [
  'productSyncReady remains NOT READY after S5',
  '6bf420be',
  '17d5119b',
  '05b581ea',
  'S2 local sortOrder lane is closed',
  'S2b live projection passed',
  'S5/F11 sortOrder-only allowed-set flip landed',
  '`field-mismatch:sortOrder` is no longer the active blocker',
  '`binding-mismatch` remains blocked',
  'Binding repair/handler receipt schema remains unminted in the canonical Desktop repair path',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains blocked',
  'No `fullBundle.v3` was started',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'This task does not flip `productSyncReady`',
  'This task does not start WebDAV/cloud/relay',
  'binding-mismatch repair / readiness decision',
  'The next step is not WebDAV/cloud',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(s5Evidence, 'S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED', 'S5 verdict');
assertIncludes(s5Evidence, 'only to `field-mismatch:sortOrder`', 'S5 sortOrder-only scope');
assertIncludes(s5Evidence, '`binding-mismatch` remains blocked', 'S5 binding blocked');
assertIncludes(s5Evidence, '`productSyncReady` remains `false`', 'S5 productSyncReady false');
assertIncludes(s2Closeout, 'S2 LOCAL SORTORDER LANE CLOSED', 'S2 closeout verdict');
assertIncludes(s2bLive, 'S2B LIVE PROJECTION PASSED', 'S2b live verdict');

assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'F11 sortOrder no longer blocked');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'F11 binding-mismatch remains blocked');
assert.ok(!foldersStore.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
  'F11 must not force-block sortOrder after S5');

assertIncludes(folderSync, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b projection helper remains');
assertIncludes(folderSync, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b live marker remains');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV remains deferred');

if (bindingRepairImplemented) {
  const implementationEvidence = read(bindingImplementationEvidencePath);
  assertIncludes(implementationEvidence, 'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN',
    'binding repair implementation evidence verdict');
  assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
    'canonical binding repair receipt schema minted by implementation');
  assertIncludes(folderSync, 'bindingRepair: {', 'binding repair API exposed after implementation');
  assertIncludes(folderSync, 'bindingMismatchAllowed: false',
    'binding-mismatch remains blocked until later allowed-set flip');
} else {
  assert.ok(!`${foldersStore}\n${folderSync}`.includes('h2o.studio.chat-folder-binding-receipt.v1'),
    'canonical binding repair/handler receipt schema remains unminted');
}
assertIncludes(folderImport, 'chat-folder-binding-receipt-import-blocked', 'binding receipt import remains blocked');
assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true in source');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.doesNotMatch(combinedSource, /archivePackage|archiveCloud|archiveCas|cloudRelay/i, 'cloud/archive CAS must not be introduced');

for (const forbidden of [
  'Verdict: productSyncReady READY',
  'productSyncReady is true',
  'binding-mismatch is unblocked',
  'binding receipt schema minted',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS unblocked',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.productsync-ready-recheck-after-s5.validator.v1',
  lane: 'folder-sync',
  phase: 'productSyncReady-readiness-recheck-after-S5',
  evidence: evidencePath,
  verdict: 'NOT_READY',
  sortOrderActiveBlocker: false,
  bindingMismatchBlocked: true,
  bindingReceiptSchemaMinted: bindingRepairImplemented,
  bindingRepairImplementationEvidence: bindingRepairImplemented ? bindingImplementationEvidencePath : null,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
  recommendedNext: 'binding-mismatch-repair-readiness-decision',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-productsyncready-readiness-recheck-after-s5');
