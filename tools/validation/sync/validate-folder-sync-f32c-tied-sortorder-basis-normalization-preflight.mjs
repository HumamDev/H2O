#!/usr/bin/env node
//
// Folder Sync F32c-preflight - design-only gate for tied-sortOrder basis normalization.
//
// This validator proves the preflight evidence records the F34b root cause, encodes the
// later F32c handler-side normalization contract, rejects unsafe shortcuts, and keeps all
// product/source boundaries blocked. It performs no live Desktop work and no writes.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-f32c-tied-sortorder-basis-normalization-preflight.md';
const f34bEvidencePath = 'release-evidence/2026-06-25/folder-sync-f34b-classifier-introspection.md';
const f11EvidencePath = 'release-evidence/2026-06-25/folder-sync-f11-render-only-mirror-rebuild.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(s) {
  return String(s).replace(/\s+/g, ' ');
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

function assertMatch(haystack, regex, label) {
  assert.match(haystack, regex, label);
}

function idsBySortOrderThenVisible(payloadIds, snapshot) {
  const visibleIndex = new Map(snapshot.visibleOrderIds.map((id, index) => [id, index]));
  const sortOrderById = snapshot.sortOrderById || Object.create(null);
  return payloadIds.slice().sort((a, b) => {
    const as = Number(sortOrderById[a]);
    const bs = Number(sortOrderById[b]);
    const av = Number.isFinite(as) ? as : 0;
    const bv = Number.isFinite(bs) ? bs : 0;
    if (av !== bv) return av - bv;
    return (visibleIndex.get(a) ?? Number.MAX_SAFE_INTEGER) - (visibleIndex.get(b) ?? Number.MAX_SAFE_INTEGER);
  });
}

function currentVisibleSubset(payloadIds, visibleOrderIds) {
  const payload = new Set(payloadIds);
  return visibleOrderIds.filter((id) => payload.has(id));
}

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(f34bEvidencePath), `${f34bEvidencePath} must exist`);
assert.ok(exists(f11EvidencePath), `${f11EvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flat = compact(evidence);
const f34b = read(f34bEvidencePath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const f11Evidence = read(f11EvidencePath);

// Evidence identity and commit references.
assertIncludes(evidence, 'DESIGN-ONLY PREFLIGHT', 'scope');
assertIncludes(evidence, 'GO-WITH-CONDITIONS', 'verdict');
assertIncludes(evidence, 'NO-GO for S3 retry', 'verdict');
assertIncludes(evidence, '247a0de', 'F32b commit');
assertIncludes(evidence, 'bdb66bf', 'F34b commit');
assertIncludes(evidence, '4915d2a', 'F34 commit');
assertIncludes(evidence, '0cab297', 'F34a commit');

// F34b root-cause facts must be encoded.
for (const token of [
  '"classifyExposed": true',
  '"classifierSource": "real-api-classify"',
  '"visibleFolderCount": 6',
  '"allSortOrderTied": true',
  '"classifyReason": null',
  '"basisOrderingHash": "oh:d526bd90"',
  '"requestedOrderingHash": "oh:d526bd90"',
  '"classifierDerivedCurrentHash": "oh:d526bd90"',
  '"classifyReason": "stale-basis"',
  '"requestedOrderingHash": "oh:d91ad328"',
  '"derivedCurrentHashEqualsRequested": true',
  '"derivedCurrentHashEqualsBasis": false',
  '"genuineReorderUnsatisfiableUnderTies": true',
]) {
  assertIncludes(evidence, token, `F34b fact ${token}`);
}

assertMatch(flat, /Root Cause.*payload order/i, 'root cause must identify payload-order-dependent derivation');
assertMatch(flat, /stable-sorts request payload IDs by canonical `sortOrder`/i, 'root cause must name current helper behavior');
assertMatch(flat, /derived current order = payload ids ordered by \(sortOrder, position in snapshot\.visibleOrderIds\)/,
  'preferred F32c contract must be explicit');
assertMatch(flat, /basisOrderingHash = orderingHash\(current visible order restricted to the payload set\)/,
  'proposer basis contract must be explicit');
assertMatch(flat, /change only the handler-side basis derivation helper, preferably `f32CurrentPayloadOrder`/,
  'implementation must be scoped to basis helper');

// Rejected paths and unchanged behavior.
for (const token of [
  'Do not use proposer-side-only hashing of the broken handler derivation as the sole fix.',
  'Do not reject all-tied `sortOrder` as the fix.',
  'Do not normalize by writing canonical `sortOrder` in this slice.',
  'Do not implement mirror-after-write.',
  'Do not change request schema.',
  'Do not change receipt schema.',
  'Do not change conflict precedence except fixing the derived current order.',
  'Do not change dry-run default.',
  'Do not change F32b idempotency ledger semantics.',
  'Do not change the apply gate.',
  'Do not write the mirror.',
  'Do not change the F11 allowed or blocked set.',
  'Do not flip `productSyncReady`.',
]) {
  assertIncludes(evidence, token, `rejected path ${token}`);
}

for (const token of [
  'F33 VM decision-path matrix',
  'all-zero sortOrder genuine reorder should classify accepted/null',
  'F33 wrong-basis tied fixture should still classify `stale-basis`',
  'F32b sqlite behavioral harness should seed all-zero sortOrder',
  'Existing distinct-sortOrder fixtures must remain green',
  'S3 retry after F32c must be a genuine reorder with no `apply:true`, no gate',
  'S4 remains blocked even after F32c',
]) {
  assertIncludes(evidence, token, `future proof requirement ${token}`);
}

for (const token of [
  'S3 retry remains blocked until F32c lands and is re-proven.',
  'S4 controlled apply remains blocked.',
  'S2b remains design-only.',
  'S5/F11 remains blocked.',
  '`field-mismatch:sortOrder` remains blocked in F11.',
  '`binding-mismatch` remains blocked.',
  'Binding receipt schema remains unminted.',
  "`mirrorReprojection: 'deferred-to-s2b'` remains the current posture.",
  '`FOLDER_STATE_DATA_KEY` mirror write-through is not introduced by this slice.',
  '`productSyncReady` remains `false`.',
  'Chat Saving CAS remains blocked.',
]) {
  assertIncludes(evidence, token, `boundary ${token}`);
}

// F34b source evidence remains the factual basis.
for (const token of [
  '"classifyExposed": true',
  '"classifierSource": "real-api-classify"',
  '"allSortOrderTied": true',
  '"genuineReorderUnsatisfiableUnderTies": true',
  '"classifyReason": "stale-basis"',
  '"requestedOrderingHash": "oh:d91ad328"',
]) {
  assertIncludes(f34b, token, `F34b evidence anchor ${token}`);
}

// Static source/boundary anchors.
assertIncludes(folderSync, 'function f32CurrentPayloadOrder(payloadIds, snapshot)', 'F32 helper anchor');
assertIncludes(folderSync, "mirrorReprojection: 'deferred-to-s2b'", 'S2b deferral');
assert.ok(folderSync.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema is now minted and live-proven in folder-sync');
assert.ok(!folderSync.includes('productSyncReady: true'), 'folder-sync must not flip productSyncReady true');
assertIncludes(folderSync, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b owns current mirror projection');
assert.ok(!folderSync.includes('rebuildRenderMirrorFromSqlite'), 'folder-sync must not use the old sortOrder-stripping mirror rebuild');
assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'S5 allows F11 field-mismatch:sortOrder');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 binding-mismatch remains blocked/reviewed in current post-S5 source');
assertIncludes(f11Evidence, 'field-mismatch:sortOrder', 'F11 sortOrder blocked evidence');
assertIncludes(f11Evidence, 'binding-mismatch', 'F11 binding blocked evidence');
assertIncludes(f11Evidence, '`FOLDER_STATE_DATA_KEY` remains a derived render mirror', 'F11 mirror derivation evidence');

// Synthetic model of the proposed fix: ties must be resolved from canonical visible order, not payload order.
const snapshot = {
  visibleOrderIds: ['folder-a', 'folder-b', 'folder-c'],
  sortOrderById: { 'folder-a': 0, 'folder-b': 0, 'folder-c': 0 },
};
const genuineReorderPayload = ['folder-b', 'folder-a', 'folder-c'];
assert.deepEqual(currentVisibleSubset(genuineReorderPayload, snapshot.visibleOrderIds), ['folder-a', 'folder-b', 'folder-c'],
  'proposer basis subset should follow canonical visible order');
assert.deepEqual(idsBySortOrderThenVisible(genuineReorderPayload, snapshot), ['folder-a', 'folder-b', 'folder-c'],
  'F32c normalized derived current order should resolve tied sortOrder by visible order');

const distinct = {
  visibleOrderIds: ['folder-a', 'folder-b', 'folder-c'],
  sortOrderById: { 'folder-a': 10, 'folder-b': 20, 'folder-c': 30 },
};
assert.deepEqual(idsBySortOrderThenVisible(['folder-c', 'folder-a', 'folder-b'], distinct), ['folder-a', 'folder-b', 'folder-c'],
  'distinct sortOrder fixtures should remain ordered by sortOrder');

const result = {
  schema: 'h2o.studio.folder-sync.f32c-tied-sortorder-basis-normalization-preflight.v1',
  lane: 'folder-sync',
  phase: 'F32c-preflight',
  evidence: evidencePath,
  f32bCommitReferenced: '247a0de',
  f34bCommitReferenced: 'bdb66bf',
  verdict: 'GO-WITH-CONDITIONS',
  s3Retry: 'blocked-until-f32c-lands-and-reproved',
  s4ControlledApply: 'blocked',
  s2b: 'design-only',
  s5F11: 'blocked',
  productSyncReady: false,
  chatSavingCasBlocked: true,
  preferredContract: 'payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)',
  proposerBasisContract: 'orderingHash(current visible order restricted to payload set)',
  f32cImplementedInThisSlice: false,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-f32c-tied-sortorder-basis-normalization-preflight');
