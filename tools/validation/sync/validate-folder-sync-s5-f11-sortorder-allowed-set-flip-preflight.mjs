#!/usr/bin/env node
//
// Folder Sync S5/F11 - sortOrder allowed-set flip preflight.
//
// This validator proves the preflight is design-only and that the current source still
// blocks sortOrder and binding mismatch until a separate S5 implementation slice.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip-preflight.md';
const s2CloseoutPath = 'release-evidence/2026-07-01/folder-sync-s2-sortorder-local-closeout.md';
const s2bLivePath = 'release-evidence/2026-07-01/folder-sync-s2b-live-projection-activation.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';

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

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(s2CloseoutPath), `${s2CloseoutPath} must exist`);
assert.ok(exists(s2bLivePath), `${s2bLivePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const s2Closeout = read(s2CloseoutPath);
const s2bLive = read(s2bLivePath);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);

for (const token of [
  'S5/F11 SORTORDER ALLOWED-SET FLIP PREFLIGHT GO-WITH-CONDITIONS',
  'design/preflight-only slice',
  'No product source was edited',
  'actual F11 allowed-set flip is not performed here',
  '17d5119b',
  '05b581ea',
  '06839407',
  'aa2da1ac',
  'a47742d5',
  'c5553526',
  'd0e330cb',
  '8293156',
]) {
  assertIncludes(evidence, token, `preflight token ${token}`);
}

for (const token of [
  '`field-mismatch:sortOrder` is now eligible for a later S5/F11 allowed-set flip',
  'later S5 implementation may remove or reclassify only `field-mismatch:sortOrder`',
  '`binding-mismatch` must remain blocked',
  'Binding receipt schema remains unminted',
  'must not imply `productSyncReady`',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'own validator and exact source-diff proof',
]) {
  assertIncludes(evidence, token, `decision token ${token}`);
}

for (const token of [
  'S2b projection',
  'F32 handler',
  'WebDAV',
  'Chat Saving',
  'bindings',
  'tombstones',
  'deletes',
  '`productSyncReady`',
]) {
  assertIncludes(evidence, token, `later S5 forbidden touch ${token}`);
}

assertIncludes(s2Closeout, 'S2 LOCAL SORTORDER LANE CLOSED', 'S2 closeout verdict');
assertIncludes(s2Closeout, 'F11 `field-mismatch:sortOrder` may be considered for a separate S5 allowed-set flip', 'S2 closeout S5 path');
assertIncludes(s2Closeout, '`binding-mismatch` remains blocked', 'S2 closeout binding blocked');
assertIncludes(s2bLive, 'S2B LIVE PROJECTION PASSED', 'S2b live verdict');
assertIncludes(s2bLive, '"mirrorReprojection": "applied-sortorder-preserving-s2b"', 'S2b live mirror marker');

assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])",
  'current F11 source still blocks sortOrder and binding mismatch');
assertIncludes(foldersStoreSource, "result.skippedSortOrderRebuildCount = classSelection.blocked.indexOf('field-mismatch:sortOrder') !== -1 ? 1 : 0;",
  'current F11 source still counts skipped sortOrder rebuild');
assertIncludes(foldersStoreSource, "result.skippedBindingRepairCount = classSelection.blocked.indexOf('binding-mismatch') !== -1 ? 1 : 0;",
  'current F11 source still counts skipped binding repair');
assertIncludes(folderSyncSource, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b helper exists');
assertIncludes(folderSyncSource, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b applied marker exists');
assert.ok(!folderSyncSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema remains unminted');
assert.ok(!folderSyncSource.includes('productSyncReady: true'), 'productSyncReady must not flip true in folder-sync source');

for (const forbidden of [
  'productSyncReady` is `true`',
  'WebDAV enabled',
  'cloud/relay enabled',
  'Chat Saving CAS unblocked',
  'binding receipt schema minted',
  'allowed-set flip is performed here',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.s5-f11-sortorder-allowed-set-flip-preflight.validator.v1',
  lane: 'folder-sync',
  phase: 'S5-F11-preflight',
  evidence: evidencePath,
  verdict: 'S5_F11_SORTORDER_ALLOWED_SET_FLIP_PREFLIGHT_GO_WITH_CONDITIONS',
  designOnly: true,
  productSourceEdited: false,
  allowedSetFlipPerformed: false,
  fieldMismatchSortOrderEligibleForLaterFlip: true,
  fieldMismatchSortOrderCurrentlyBlockedInSource: true,
  bindingMismatchBlocked: true,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s5-f11-sortorder-allowed-set-flip-preflight');
