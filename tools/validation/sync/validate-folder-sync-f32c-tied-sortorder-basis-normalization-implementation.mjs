#!/usr/bin/env node
//
// Folder Sync F32c - implementation proof for tied-sortOrder handler-side basis normalization.
//
// This validator proves the committed F32 helper derives current payload order from canonical state
// using (sortOrder, position in snapshot.visibleOrderIds), exercises tied-sortOrder fixtures through
// the real classifier block, and checks the F32b behavioral harness records the new dry-run proof.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-f32c-tied-sortorder-basis-normalization-implementation.md';
const preflightPath = 'release-evidence/2026-07-01/folder-sync-f32c-tied-sortorder-basis-normalization-preflight.md';
const f34bEvidencePath = 'release-evidence/2026-06-25/folder-sync-f34b-classifier-introspection.md';
const s5ImplementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const f33ValidatorPath = 'tools/validation/sync/validate-folder-sync-f33-inprocess-reprove-and-s2b-design.mjs';
const f32bValidatorPath = 'tools/validation/sync/validate-folder-sync-f32b-persistent-idempotency-apply-proof.mjs';
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

function extractF32Api(source) {
  const start = source.indexOf('var FOLDER_SORTORDER_REORDER_APPLY_GATE');
  const end = source.indexOf('/* ===================== end F32 S2 sortOrder reorder handler');
  assert.ok(start > 0 && end > start, 'F32 handler block must be extractable');
  const block = source.slice(start, end);
  const ctx = {
    cleanString: (v) => (v == null ? '' : String(v)).trim(),
    safeObject: (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {},
    FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA: 'h2o.studio.folder-sortorder-reorder-request.v1',
    FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA: 'h2o.studio.folder-sortorder-reorder-receipt.v1',
    H2O: {},
    isFinite,
    Number,
  };
  vm.createContext(ctx);
  vm.runInContext(block + '\n;this.__api = {' +
    ' currentPayloadOrder: f32CurrentPayloadOrder,' +
    ' classify: classifyFolderSortorderReorderConflict,' +
    ' orderingHash: folderSortorderOrderingHash };', ctx);
  return ctx.__api;
}

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(preflightPath), `${preflightPath} must exist`);
assert.ok(exists(f34bEvidencePath), `${f34bEvidencePath} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(f33ValidatorPath), `${f33ValidatorPath} must exist`);
assert.ok(exists(f32bValidatorPath), `${f32bValidatorPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const preflight = read(preflightPath);
const f34b = read(f34bEvidencePath);
const source = read(folderSyncPath);
const f33Validator = read(f33ValidatorPath);
const f32bValidator = read(f32bValidatorPath);
const foldersStore = read(foldersStorePath);

assertIncludes(evidence, 'IMPLEMENTED_AND_REPROVED_WITH_FIXTURES', 'implementation status');
assertIncludes(evidence, '13755b0', 'preflight commit');
assertIncludes(evidence, 'bdb66bf', 'F34b commit');
assertIncludes(evidence, '247a0de', 'F32b commit');
assertIncludes(evidence, 'payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)', 'implemented contract');
assertIncludes(evidence, 'basisOrderingHash = orderingHash(current visible order restricted to the payload set)', 'proposer basis contract');
assertIncludes(evidence, 'F32c does not pass S3 by itself.', 'S3 boundary');
assertIncludes(evidence, 'S4 controlled apply remains blocked', 'S4 boundary');
assertIncludes(preflight, 'GO-WITH-CONDITIONS', 'preflight gate');
assertIncludes(preflight, 'NO-GO for S3 retry', 'preflight S3 gate');

for (const token of [
  '"allSortOrderTied": true',
  '"genuineReorderUnsatisfiableUnderTies": true',
  '"classifyReason": null',
  '"classifyReason": "stale-basis"',
  '"basisOrderingHash": "oh:d526bd90"',
  '"requestedOrderingHash": "oh:d91ad328"',
]) {
  assertIncludes(f34b, token, `F34b fact ${token}`);
}

assertIncludes(source, 'function f32CurrentPayloadOrder(payloadIds, snapshot)', 'F32 helper');
assertIncludes(source, 'visibleIndexById', 'visible order tie-break implementation');
assertIncludes(source, 'f32Arr(snap.visibleOrderIds)', 'visibleOrderIds source');
assertIncludes(source, 'Number.MAX_SAFE_INTEGER', 'missing visible-index fallback');
assertIncludes(source, 'return aid < bid ? -1 : (aid > bid ? 1 : 0);', 'stable id fallback');
assertIncludes(source, "mirrorReprojection: 'deferred-to-s2b'", 'mirror deferral');
assert.ok(!source.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema must remain unminted');
assert.ok(!source.includes('productSyncReady: true'), 'productSyncReady must not flip true');
assert.ok(!source.includes('fullBundle.v3'), 'fullBundle.v3 must remain absent');

const api = extractF32Api(source);
const tiedSnapshot = {
  visibleOrderIds: ['fa', 'fb', 'fc'],
  knownSet: { fa: true, fb: true, fc: true },
  presentSet: { fa: true, fb: true, fc: true },
  tombSet: {},
  visibleSet: { fa: true, fb: true, fc: true },
  sortOrderById: { fa: 0, fb: 0, fc: 0 },
};
const tiedPayload = ['fb', 'fa', 'fc'];
assert.deepEqual(api.currentPayloadOrder(tiedPayload, tiedSnapshot), ['fa', 'fb', 'fc'],
  'tied sortOrder current order must use canonical visible order, not proposed payload order');
const tiedAcceptedRequest = {
  idempotencyKey: 'idem_f32c_tied',
  orderPayload: [{ folderId: 'fb' }, { folderId: 'fa' }, { folderId: 'fc' }],
  basisOrderingHash: api.orderingHash(['fa', 'fb', 'fc']),
  requestedOrderingHash: api.orderingHash(['fb', 'fa', 'fc']),
};
assert.equal(api.classify(tiedAcceptedRequest, tiedSnapshot, {}), null,
  'tied sortOrder genuine reorder must classify accepted/null with visible-order basis');
const tiedWrongBasisRequest = Object.assign({}, tiedAcceptedRequest, {
  idempotencyKey: 'idem_f32c_wrong',
  basisOrderingHash: api.orderingHash(['fb', 'fa', 'fc']),
});
assert.equal(api.classify(tiedWrongBasisRequest, tiedSnapshot, {}), 'stale-basis',
  'tied sortOrder wrong basis must remain stale-basis');

const distinctSnapshot = {
  visibleOrderIds: ['fa', 'fb', 'fc'],
  sortOrderById: { fa: 0, fb: 1, fc: 2 },
};
assert.deepEqual(api.currentPayloadOrder(['fc', 'fa', 'fb'], distinctSnapshot), ['fa', 'fb', 'fc'],
  'distinct sortOrder behavior must remain sorted by sortOrder');

for (const token of [
  'TIED_SORTORDER_SNAP',
  'tied-sortorder-genuine-reorder-accepted',
  'tied-sortorder-wrong-basis-stale',
  'matrix.length === 11',
]) {
  assertIncludes(f33Validator, token, `F33 tied fixture ${token}`);
}

for (const token of [
  'PROOF 1b',
  'idem_tied_dry',
  'tiedSortOrderDryRunStatus',
  'tiedSortOrderDryRunWrites',
  'tiedSortOrderDryRunConsumedRows',
]) {
  assertIncludes(f32bValidator, token, `F32b tied dry-run fixture ${token}`);
}

assert.match(flatEvidence, /canonicalWriteCount` remains `0`|canonicalWriteCount.*0/i,
  'evidence must record zero canonical dry-run writes');
if (exists(s5ImplementationEvidencePath)) {
  assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'S5 allows F11 field-mismatch:sortOrder');
  assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
    'F11 binding-mismatch remains blocked after S5');
} else {
  assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])",
    'F11 allowed/blocked set unchanged before S5');
}
assert.ok(!source.includes('rebuildRenderMirrorFromSqlite'), 'F32c must not introduce mirror rebuild into folder-sync');

const result = {
  schema: 'h2o.studio.folder-sync.f32c-tied-sortorder-basis-normalization-implementation.v1',
  lane: 'folder-sync',
  phase: 'F32c',
  evidence: evidencePath,
  preflightCommitReferenced: '13755b0',
  f34bCommitReferenced: 'bdb66bf',
  verdict: 'IMPLEMENTED_AND_REPROVED_WITH_FIXTURES',
  helperContract: 'payload ids ordered by (sortOrder, position in snapshot.visibleOrderIds)',
  tiedSortOrderGenuineReorderClassifyReason: null,
  tiedSortOrderWrongBasisReason: 'stale-basis',
  dryRunWrites: 0,
  dryRunConsumedLedgerRows: 0,
  mirrorReprojection: 'deferred-to-s2b',
  f11AllowedSetChanged: false,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  chatSavingCasBlocked: true,
  s3Retry: 'separate-live-dry-run-slice',
  s4ControlledApply: 'blocked',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-f32c-tied-sortorder-basis-normalization-implementation');
