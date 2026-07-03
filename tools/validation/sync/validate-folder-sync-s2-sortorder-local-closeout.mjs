#!/usr/bin/env node
//
// Folder Sync S2 - local sortOrder lane closeout validator.
//
// This validator proves the closeout records the S2 local sortOrder lane as closed while
// keeping S5/F11, productSyncReady, WebDAV/cloud/archive CAS, and Chat Saving blocked.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s2-sortorder-local-closeout.md';
const s2bLiveEvidencePath = 'release-evidence/2026-07-01/folder-sync-s2b-live-projection-activation.md';
const s5ImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const bindingImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
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
assert.ok(exists(s2bLiveEvidencePath), `${s2bLiveEvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const s2bLiveEvidence = read(s2bLiveEvidencePath);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);

for (const token of [
  'S2 LOCAL SORTORDER LANE CLOSED',
  '247a0de',
  '8293156',
  'd0e330cb',
  'c5553526',
  'a47742d5',
  'aa2da1ac',
  '06839407',
  '05b581ea',
  'Desktop canonical `sortOrder` handler path',
  'Persistent idempotency',
  'Tied-sortOrder basis normalization',
  'Live dry-run',
  'Controlled canonical apply',
  'Post-apply canonical readback',
  'SortOrder-preserving mirror projection',
  'Live mirror projection activation/readback',
]) {
  assertIncludes(evidence, token, `closeout token ${token}`);
}

for (const token of [
  'S3 dry-run passed after F32c',
  'S4 controlled apply passed after S3',
  'Canonical readback persisted to `oh:d91ad328`',
  'SortOrder is no longer tied',
  'F32b consumed ledger record exists',
  'S2b implementation added sortOrder-preserving mirror reprojection',
  'S2b live projection confirmed S2b code was loaded',
  'The pre-apply mirror was stale',
  'The dry-run guard passed first',
  'Controlled identity apply projected the mirror',
  'The post-apply mirror matches canonical `oh:d91ad328`',
  'SortOrder is preserved and not stripped',
  '`mirrorReprojection:"applied-sortorder-preserving-s2b"`',
  '`rebuildRenderMirrorFromSqlite` is not reused by S2b',
]) {
  assertIncludes(evidence, token, `proven fact ${token}`);
}

for (const token of [
  'S5/F11 allowed-set flip',
  'Binding-mismatch repair',
  '`productSyncReady` flip',
  'WebDAV/cloud/relay/`fullBundle.v3`',
  'Chat Saving WebDAV/cloud/archive CAS',
  'F11 `field-mismatch:sortOrder` may be considered for a separate S5 allowed-set flip',
  'that flip is not performed here',
  '`binding-mismatch` remains blocked',
  'Binding receipt schema remains unminted',
  '`productSyncReady` remains `false`',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'does not declare full product sync ready',
  'does not authorize WebDAV',
]) {
  assertIncludes(evidence, token, `boundary token ${token}`);
}

assertIncludes(s2bLiveEvidence, 'S2B LIVE PROJECTION PASSED', 'S2b live evidence verdict');
assertIncludes(s2bLiveEvidence, '"s2bCodeConfirmedLoaded": true', 'S2b live code loaded');
assertIncludes(s2bLiveEvidence, '"mirrorMatchesCanonical": false', 'S2b pre-apply stale mirror');
assertIncludes(s2bLiveEvidence, '"status": "dry-run"', 'S2b dry-run guard');
assertIncludes(s2bLiveEvidence, '"mirrorReprojection": "applied-sortorder-preserving-s2b"', 'S2b live marker');
assertIncludes(s2bLiveEvidence, '"mirrorOrderHash": "oh:d91ad328"', 'S2b post-apply mirror hash');
assertIncludes(s2bLiveEvidence, '"mirrorSortOrderPreserved": true', 'S2b sortOrder preserved');
assertIncludes(s2bLiveEvidence, '"mirrorSortOrderStripped": false', 'S2b sortOrder not stripped');

assertIncludes(folderSyncSource, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b helper exists');
assertIncludes(folderSyncSource, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b applied marker exists');
assertIncludes(folderSyncSource, "sortOrder: so, sort_order: so", 'S2b preserves sortOrder and sort_order');
assert.ok(!folderSyncSource.includes('rebuildRenderMirrorFromSqlite'), 'folder-sync source must not reuse rebuildRenderMirrorFromSqlite');
if (exists(bindingImplementationEvidencePath)) {
  const implementationEvidence = read(bindingImplementationEvidencePath);
  assertIncludes(implementationEvidence, 'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN',
    'binding implementation evidence verdict');
  assertIncludes(folderSyncSource, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
    'binding receipt schema minted by later binding implementation');
  assertIncludes(folderSyncSource, 'bindingMismatchAllowed: false',
    'binding-mismatch remains blocked after binding implementation');
} else {
  assert.ok(!folderSyncSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema must remain unminted');
}
assert.ok(!folderSyncSource.includes('productSyncReady: true'), 'productSyncReady must not flip true in folder-sync source');

if (exists(s5ImplementationEvidencePath)) {
  assertIncludes(foldersStoreSource, "'field-mismatch:sortOrder': true", 'S5 allows F11 field-mismatch:sortOrder');
  assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
    'F11 binding-mismatch remains blocked after S5');
} else {
  assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])",
    'F11 field-mismatch:sortOrder and binding-mismatch remain blocked before S5');
}

for (const forbidden of [
  'productSyncReady` is `true`',
  'WebDAV enabled',
  'fullBundle.v3 enabled',
  'Chat Saving CAS unblocked',
  'binding receipt schema minted',
]) {
  assert.ok(!flat.includes(forbidden), `closeout must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.s2-sortorder-local-closeout.validator.v1',
  lane: 'folder-sync',
  phase: 'S2-closeout',
  evidence: evidencePath,
  verdict: 'S2_LOCAL_SORTORDER_LANE_CLOSED',
  canonicalHash: 'oh:d91ad328',
  s3DryRunPassed: true,
  s4ControlledApplyPassed: true,
  postS4ReadbackPassed: true,
  s2bLiveProjectionPassed: true,
  mirrorReprojection: 'applied-sortorder-preserving-s2b',
  sortOrderPreserved: true,
  sortOrderStripped: false,
  s5F11Performed: false,
  fieldMismatchSortOrderBlockedUntilS5: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s2-sortorder-local-closeout');
