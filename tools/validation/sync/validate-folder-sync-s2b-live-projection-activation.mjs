#!/usr/bin/env node
//
// Folder Sync S2b - live Desktop projection activation evidence.
//
// This validator proves the S2b live evidence records a stale render mirror before
// activation and a sortOrder-preserving projected mirror after a guarded identity apply.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-s2b-live-projection-activation.md';
const s2bImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-s2b-sortorder-preserving-mirror-reprojection-implementation.md';
const s2bPreflightEvidencePath = 'release-evidence/2026-07-01/folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight.md';
const postS4EvidencePath = 'release-evidence/2026-07-01/folder-sync-post-s4-readback-idempotency.md';
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
assert.ok(exists(s2bImplementationEvidencePath), `${s2bImplementationEvidencePath} must exist`);
assert.ok(exists(s2bPreflightEvidencePath), `${s2bPreflightEvidencePath} must exist`);
assert.ok(exists(postS4EvidencePath), `${postS4EvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const s2bImplementationEvidence = read(s2bImplementationEvidencePath);
const s2bPreflightEvidence = read(s2bPreflightEvidencePath);
const postS4Evidence = read(postS4EvidencePath);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);

for (const token of [
  'S2B LIVE PROJECTION PASSED',
  '06839407',
  'aa2da1ac',
  'c5553526',
  'a47742d5',
  'identity/current-order apply',
  'not a semantic reorder',
  'No raw folder IDs',
  'raw idempotency key',
  'intentionally redacted',
  'Full S2 may be considered ready for a separate closeout decision',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

for (const token of [
  '"schema": "h2o.studio.folder-sync.s2b-live-projection-activation.v1"',
  '"phase": "S2b-live-projection-activation"',
  '"status": "passed"',
  '"blockers": []',
  '"s2bCodeConfirmedLoaded": true',
  '"applyGate": "folder-sync-f32-sortorder-apply"',
  '"canonicalVisibleOrderHash": "oh:d91ad328"',
  '"canonicalExpectedHash": "oh:d91ad328"',
  '"mirrorOrderHash": "oh:4d5d3d80"',
  '"mirrorMatchesCanonical": false',
  '"mirrorSortOrderPreserved": false',
  '"mirrorSortOrderStripped": true',
  '"mirrorDistinctSortOrderValueCount": 3',
  '"mirrorMinSortOrder": 0',
  '"mirrorMaxSortOrder": 4',
  '"mirrorCanonicalRowCount": 6',
  '"ok": true',
  '"status": "dry-run"',
  '"reason": "dry-run-sortorder-reorder-plan-ready"',
  '"resultingOrderingHash": "oh:d91ad328"',
  '"canonicalWriteCount": 0',
  '"mirrorReprojection": "deferred-to-s2b"',
  '"idempotencyPersisted": false',
  '"dryRun": true',
  '"appliedAt": null',
  '"status": "applied"',
  '"reason": "sortorder-reorder-applied"',
  '"canonicalWriteCount": 6',
  '"mirrorReprojection": "applied-sortorder-preserving-s2b"',
  '"mirrorReprojectionResult": "projected"',
  '"idempotencyPersisted": true',
  '"dryRun": false',
  '"appliedAt": "2026-07-02T15:33:37.167Z"',
  '"mirrorOrderHash": "oh:d91ad328"',
  '"mirrorMatchesCanonical": true',
  '"mirrorSortOrderPreserved": true',
  '"mirrorSortOrderStripped": false',
  '"mirrorDistinctSortOrderValueCount": 6',
  '"mirrorMinSortOrder": 0',
  '"mirrorMaxSortOrder": 5',
  '"nameOrTitleRowCount": 6',
  '"colorRowCount": 3',
]) {
  assertIncludes(evidence, token, `live S2b fact ${token}`);
}

for (const value of [0, 1, 2, 3, 4, 5]) {
  assertIncludes(evidence, `"sortOrder": ${value}`, `redacted row sortOrder ${value}`);
}

for (const token of [
  '"hasSortOrder": true',
  '"hasSort_order": true',
  '"dryRunGuardBeforeApply": true',
  '"staleMirrorPrecheck": true',
  '"noHardDelete": true',
  '"noPurge": true',
  '"noChatDelete": true',
  '"noFolderDelete": true',
  '"noBindingMutation": true',
  '"noTombstoneMutation": true',
  '"noChromeCanonicalMutation": true',
  '"noTransportWrite": true',
  '"noWebdavWrite": true',
]) {
  assertIncludes(evidence, token, `safety flag ${token}`);
}

for (const token of [
  '"productSyncReady": false',
  '"s5": "blocked"',
  '"f11AllowedSetFlip": "blocked"',
  '"chatSavingWebdavCloudArchiveCas": "blocked"',
]) {
  assertIncludes(evidence, token, `boundary ${token}`);
}

assertIncludes(s2bImplementationEvidence, 'S2B IMPLEMENTATION PASSED (behavioral', 'S2b implementation evidence status');
assertIncludes(s2bImplementationEvidence, 'applied-sortorder-preserving-s2b', 'S2b implementation marker');
assertIncludes(s2bImplementationEvidence, 'Full S2 is NOT yet declared closed', 'S2b implementation keeps full S2 open until live readback');
assertIncludes(s2bPreflightEvidence, 'GO-WITH-CONDITIONS', 'S2b preflight verdict');
assertIncludes(postS4Evidence, 'POST-S4 READBACK AND LEDGER PERSISTENCE PASSED', 'post-S4 readback evidence status');
assertIncludes(postS4Evidence, '"readbackVisibleOrderHash": "oh:d91ad328"', 'post-S4 canonical hash');

assertIncludes(folderSyncSource, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b helper exists');
assertIncludes(folderSyncSource, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b applied marker exists');
assertIncludes(folderSyncSource, "var S2B_RENDER_MIRROR_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';", 'S2b mirror key exists');
assertIncludes(folderSyncSource, "var FOLDER_SORTORDER_REORDER_APPLY_GATE = 'folder-sync-f32-sortorder-apply';", 'F32 apply gate exists');
assertIncludes(folderSyncSource, "sortOrder: so, sort_order: so", 'S2b preserves sortOrder and sort_order');
assert.ok(!folderSyncSource.includes('rebuildRenderMirrorFromSqlite'), 'folder-sync source must not reuse rebuildRenderMirrorFromSqlite');
assert.ok(!folderSyncSource.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema must remain unminted');
assert.ok(!folderSyncSource.includes('productSyncReady: true'), 'productSyncReady must not flip true in folder-sync source');

assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])",
  'F11 blocked classes remain protected');

for (const forbidden of [
  'webdav package',
  'archive CAS enabled',
  'productSyncReady": true',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.s2b-live-projection-activation.validator.v1',
  lane: 'folder-sync',
  phase: 'S2b-live-projection-activation',
  evidence: evidencePath,
  s2bImplementationCommitReferenced: '06839407',
  s2bPreflightCommitReferenced: 'aa2da1ac',
  postS4CommitReferenced: 'a47742d5',
  verdict: 'S2B_LIVE_PROJECTION_PASSED',
  s2bCodeConfirmedLoaded: true,
  preApplyMirrorStale: true,
  dryRunGuardPassed: true,
  controlledApplyProjectedMirror: true,
  postApplyMirrorMatchesCanonical: true,
  mirrorSortOrderPreserved: true,
  mirrorSortOrderStripped: false,
  mirrorDistinctSortOrderValueCount: 6,
  productSyncReady: false,
  s5F11Blocked: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-s2b-live-projection-activation');
