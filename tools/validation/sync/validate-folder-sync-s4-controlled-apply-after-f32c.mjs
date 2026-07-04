#!/usr/bin/env node
//
// Folder Sync S4 - controlled Desktop apply after F32c and S3.
//
// This validator proves the S4 evidence records a guarded controlled Desktop apply while
// keeping S2b/S5/productSyncReady/WebDAV/Chat Saving blocked.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s4-controlled-apply-after-f32c.md';
const s3EvidencePath = 'release-evidence/2026-07-01/folder-sync-s3-live-dry-run-retry-after-f32c.md';
const f32cEvidencePath = 'release-evidence/2026-07-01/folder-sync-f32c-tied-sortorder-basis-normalization-implementation.md';
const s5ImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
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
assert.ok(exists(s3EvidencePath), `${s3EvidencePath} must exist`);
assert.ok(exists(f32cEvidencePath), `${f32cEvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const s3Evidence = read(s3EvidencePath);
const f32cEvidence = read(f32cEvidencePath);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);

for (const token of [
  'S4 CONTROLLED APPLY PASSED AFTER F32C AND S3',
  '8293156',
  'd0e330cb',
  'first controlled canonical Desktop SQLite `sortOrder` write',
  'validation passed first',
  'dry-run precheck passed first',
  '`apply:true`',
  '`folder-sync-f32-sortorder-apply`',
  'Next recommended slice: post-apply readback/idempotency evidence',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

for (const token of [
  '"schema": "h2o.studio.folder-sync.s4-controlled-apply-after-f32c.v1"',
  '"phase": "S4"',
  '"step": "controlled-desktop-apply-after-s3-dry-run-pass"',
  '"surface": "desktop-studio"',
  '"mode": "manual-devtools-controlled-apply"',
  '"applyGate": "folder-sync-f32-sortorder-apply"',
  '"ok": true',
  '"blockers": []',
  '"status": "dry-run"',
  '"reason": "dry-run-sortorder-reorder-plan-ready"',
  '"dryRun": true',
  '"canonicalWriteCount": 0',
  '"resultingOrderingHash": "oh:d526bd90"',
  '"status": "applied"',
  '"reason": "sortorder-reorder-applied"',
  '"dryRun": false',
  '"canonicalWriteCount": 6',
  '"resultingOrderingHash": "oh:d91ad328"',
  '"resultingMatchesRequested": true',
  '"appliedAt": "2026-07-02T12:17:13.148Z"',
  '"idempotencyPersisted": true',
  '"basisOrderingHash": "oh:d526bd90"',
  '"requestedOrderingHash": "oh:d91ad328"',
  '"visibleFolderCount": 6',
  '"allSortOrderTied": true',
  '"distinctSortOrderValueCount": 1',
  '"minSortOrder": 0',
  '"maxSortOrder": 0',
]) {
  assertIncludes(evidence, token, `live S4 fact ${token}`);
}

for (const token of [
  '"noDestructiveMutation": true',
  '"noFolderDelete": true',
  '"noFolderPurge": true',
  '"noChatDelete": true',
  '"noBindingMutation": true',
  '"noTombstoneMutation": true',
  '"noHardDelete": true',
  '"noPurge": true',
  '"noChromeCanonicalMutation": true',
  '"noMirrorWrite": true',
  '"noTransportWrite": true',
  '"noWebdavWrite": true',
  '"redacted": true',
  '"hashOnly": true',
]) {
  assertIncludes(evidence, token, `safety/privacy flag ${token}`);
}

for (const token of [
  '"s2b": "blocked"',
  '"s5": "blocked"',
  '"productSyncReady": false',
  '"chatSavingWebdavCloudArchiveCas": "blocked"',
  '"bindingSchemaChanges": false',
  '"webdavCloudArchiveCasChanges": false',
  '"readerNotesChanges": false',
]) {
  assertIncludes(evidence, token, `boundary ${token}`);
}

assertIncludes(s3Evidence, 'S3 LIVE DRY-RUN PASSED AFTER F32C', 'S3 evidence status');
assertIncludes(s3Evidence, '"status": "dry-run"', 'S3 dry-run status');
assertIncludes(s3Evidence, '"canonicalWriteCount": 0', 'S3 zero-write dry-run');
assertIncludes(f32cEvidence, 'IMPLEMENTED_AND_REPROVED_WITH_FIXTURES', 'F32c implementation evidence');

assertIncludes(folderSyncSource, "var FOLDER_SORTORDER_REORDER_APPLY_GATE = 'folder-sync-f32-sortorder-apply';", 'source apply gate');
assertIncludes(folderSyncSource, 'var dryRun = opts.apply !== true;', 'source apply option');
assertIncludes(folderSyncSource, 'var gateOk = cleanString(opts.gate) === FOLDER_SORTORDER_REORDER_APPLY_GATE;', 'source gate check');
assertIncludes(folderSyncSource, "buildFolderSortorderReorderReceipt(request, 'applied', 'sortorder-reorder-applied'", 'source applied receipt');
assertIncludes(folderSyncSource, "mirrorReprojection: 'deferred-to-s2b'", 'source mirror deferral');
assert.ok(folderSyncSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema is now minted and live-proven');
assert.ok(!folderSyncSource.includes('productSyncReady: true'), 'productSyncReady must not flip true');
assert.ok(!folderSyncSource.includes('rebuildRenderMirrorFromSqlite'), 'no mirror write-through should be introduced in folder-sync source');
if (exists(s5ImplementationEvidencePath)) {
  assertIncludes(foldersStoreSource, "'field-mismatch:sortOrder': true", 'S5 allows F11 field-mismatch:sortOrder');
  assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
    'F11 binding-mismatch remains blocked after S5');
} else {
  assertIncludes(foldersStoreSource, "'field-mismatch:sortOrder': true", 'S5 allows F11 field-mismatch:sortOrder');
  assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
    'F11 binding-mismatch remains blocked/reviewed in current post-S5 source');
}

assert.match(flat, /S2b remains blocked\/design-only/i, 'S2b must remain blocked/design-only');
assert.match(flat, /S5\/F11 remains blocked/i, 'S5/F11 must remain blocked');
assert.match(flat, /`productSyncReady` remains `false`/i, 'productSyncReady must remain false');
assert.match(flat, /Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i, 'Chat Saving CAS must remain blocked');

const result = {
  schema: 'h2o.studio.folder-sync.s4-controlled-apply-after-f32c.validator.v1',
  lane: 'folder-sync',
  phase: 'S4',
  evidence: evidencePath,
  f32cCommitReferenced: '8293156',
  s3CommitReferenced: 'd0e330cb',
  verdict: 'S4_CONTROLLED_APPLY_PASSED_AFTER_F32C_AND_S3',
  applyGate: 'folder-sync-f32-sortorder-apply',
  validationOk: true,
  blockers: [],
  dryRunPrecheckStatus: 'dry-run',
  dryRunPrecheckCanonicalWriteCount: 0,
  dryRunPrecheckResultingHash: 'oh:d526bd90',
  controlledApplyStatus: 'applied',
  controlledApplyReason: 'sortorder-reorder-applied',
  controlledApplyDryRun: false,
  controlledApplyCanonicalWriteCount: 6,
  controlledApplyResultingHash: 'oh:d91ad328',
  resultingMatchesRequested: true,
  appliedAt: '2026-07-02T12:17:13.148Z',
  idempotencyPersisted: true,
  safetyFlagsAllTrue: true,
  s2b: 'blocked',
  s5F11: 'blocked',
  productSyncReady: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s4-controlled-apply-after-f32c');
