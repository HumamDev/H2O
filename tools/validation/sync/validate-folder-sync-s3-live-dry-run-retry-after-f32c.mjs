#!/usr/bin/env node
//
// Folder Sync S3 - live Desktop dry-run retry after F32c.
//
// This validator proves the S3 evidence records a dry-run-only live Desktop pass after F32c,
// while keeping S4/S2b/S5/productSyncReady/Chat Saving CAS blocked.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s3-live-dry-run-retry-after-f32c.md';
const f32cEvidencePath = 'release-evidence/2026-07-01/folder-sync-f32c-tied-sortorder-basis-normalization-implementation.md';
const f34bEvidencePath = 'release-evidence/2026-06-25/folder-sync-f34b-classifier-introspection.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(f32cEvidencePath), `${f32cEvidencePath} must exist`);
assert.ok(exists(f34bEvidencePath), `${f34bEvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const f32cEvidence = read(f32cEvidencePath);
const f34bEvidence = read(f34bEvidencePath);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);

for (const token of [
  'S3 LIVE DRY-RUN PASSED AFTER F32C',
  '8293156',
  'bdb66bf',
  'dry-run pass only',
  'does not authorize S4 controlled apply',
  'does not implement S2b',
  'does not unblock S5/F11',
  'does not flip `productSyncReady`',
  'Chat Saving WebDAV/cloud/archive CAS',
  'payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

for (const token of [
  '"schema": "h2o.studio.folder-sync.s3-live-dry-run-retry-after-f32c.v1"',
  '"phase": "S3"',
  '"step": "live-desktop-dry-run-retry-after-f32c"',
  '"surface": "desktop-studio"',
  '"mode": "manual-devtools-dry-run"',
  '"ok": true',
  '"blockers": []',
  '"status": "dry-run"',
  '"reason": "dry-run-sortorder-reorder-plan-ready"',
  '"dryRun": true',
  '"canonicalWriteCount": 0',
  '"mirrorReprojection": "deferred-to-s2b"',
  '"appliedAt": null',
  '"idempotencyPersisted": false',
  '"basisOrderingHash": "oh:d526bd90"',
  '"requestedOrderingHash": "oh:d91ad328"',
  '"resultingOrderingHash": "oh:d526bd90"',
  '"visibleFolderCount": 6',
  '"allSortOrderTied": true',
  '"distinctSortOrderValueCount": 1',
  '"minSortOrder": 0',
  '"maxSortOrder": 0',
]) {
  assertIncludes(evidence, token, `live S3 fact ${token}`);
}

for (const token of [
  '"noHardDelete": true',
  '"noPurge": true',
  '"noChatDelete": true',
  '"noFolderDelete": true',
  '"noBindingMutation": true',
  '"noTombstoneMutation": true',
  '"noChromeCanonicalMutation": true',
  '"noMirrorWrite": true',
  '"noTransportWrite": true',
  '"noWebdavWrite": true',
]) {
  assertIncludes(evidence, token, `safety flag ${token}`);
}

for (const token of [
  '"productSyncReady": false',
  '"s4ControlledApply": "blocked"',
  '"s2b": "blocked"',
  '"s5": "blocked"',
  '"chatSavingWebdavCloudArchiveCas": "blocked"',
]) {
  assertIncludes(evidence, token, `boundary ${token}`);
}

assertIncludes(f32cEvidence, 'IMPLEMENTED_AND_REPROVED_WITH_FIXTURES', 'F32c implementation evidence');
assertIncludes(f32cEvidence, 'payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)', 'F32c contract');
assertIncludes(f34bEvidence, '"genuineReorderUnsatisfiableUnderTies": true', 'F34b old blocker');
assertIncludes(f34bEvidence, '"basisOrderingHash": "oh:d526bd90"', 'F34b basis hash');
assertIncludes(f34bEvidence, '"requestedOrderingHash": "oh:d91ad328"', 'F34b requested hash');

assertIncludes(folderSyncSource, "mirrorReprojection: 'deferred-to-s2b'", 'source mirror deferral');
assertIncludes(folderSyncSource, 'visibleIndexById', 'F32c tied basis normalization source');
assert.ok(!folderSyncSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema must remain unminted');
assert.ok(!folderSyncSource.includes('productSyncReady: true'), 'productSyncReady must not flip true');
assert.ok(!folderSyncSource.includes('rebuildRenderMirrorFromSqlite'), 'no mirror write-through should be introduced in folder-sync source');
assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])",
  'F11 blocked classes remain protected');

assert.match(flat, /S4 controlled apply remains blocked/i, 'S4 must remain blocked');
assert.match(flat, /S2b remains blocked\/design-only/i, 'S2b must remain blocked/design-only');
assert.match(flat, /S5\/F11 allowed-set changes remain blocked/i, 'S5/F11 must remain blocked');
assert.match(flat, /`productSyncReady` remains `false`/i, 'productSyncReady must remain false');
assert.match(flat, /Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i, 'Chat Saving CAS must remain blocked');

const result = {
  schema: 'h2o.studio.folder-sync.s3-live-dry-run-retry-after-f32c.validator.v1',
  lane: 'folder-sync',
  phase: 'S3',
  evidence: evidencePath,
  f32cCommitReferenced: '8293156',
  f34bCommitReferenced: 'bdb66bf',
  verdict: 'S3_LIVE_DRY_RUN_PASSED_AFTER_F32C',
  dryRunOnly: true,
  validationOk: true,
  blockers: [],
  status: 'dry-run',
  reason: 'dry-run-sortorder-reorder-plan-ready',
  canonicalWriteCount: 0,
  mirrorReprojection: 'deferred-to-s2b',
  appliedAt: null,
  idempotencyPersisted: false,
  basisOrderingHash: 'oh:d526bd90',
  requestedOrderingHash: 'oh:d91ad328',
  resultingOrderingHash: 'oh:d526bd90',
  visibleFolderCount: 6,
  allSortOrderTied: true,
  safetyFlagsAllTrue: true,
  s4ControlledApply: 'blocked',
  s2b: 'blocked',
  s5F11: 'blocked',
  productSyncReady: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s3-live-dry-run-retry-after-f32c');
