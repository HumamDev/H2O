#!/usr/bin/env node
//
// Operational.5 - productSyncReady decision after fdd orphan-binding cleanup.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-product-sync-ready-decision-after-fdd-cleanup.md';
const closeoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const manualReviewDecisionPath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const liveParityDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
const op5GatePath = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const s14Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const op5GateValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';

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
const closeout = read(closeoutPath);
const manualReviewDecision = read(manualReviewDecisionPath);
const liveParityDecision = read(liveParityDecisionPath);
const op5Gate = read(op5GatePath);
const s14 = read(s14Path);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);
const op5GateValidator = read(op5GateValidatorPath);

for (const token of [
  'OPERATIONAL.5 PRODUCTSYNCREADY DECISION AFTER FDD CLEANUP - KEEP `productSyncReady:false` / NOT FLIPPED',
  'raw canonical `folder_bindings` from `14` to `13`',
  'row:a950a44b859f',
  'raw canonical `folder_bindings`: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` binding projection: `12`',
  'remaining dangling row: `row:a950a44b859f`',
  'productSyncReady` remains `false`',
  'No source flip is authorized in this slice.',
  'No product source was edited for readiness.',
  'Raw canonical source-of-truth count parity is still `13` raw vs `12` exportable',
  'WebDAV/cloud/relay/`fullBundle.v3` still requires a separate transport-readiness lane',
  'No additional cleanup/mutation was performed by this decision slice.',
  '`row:a950a44b859f` was not touched.',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.',
]) {
  assertIncludes(flat, token, `readiness evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'PRODUCTSYNCREADY READY',
  'WebDAV/cloud/relay can start next',
  'row:a950a44b859f` was removed',
]) {
  assertNotIncludes(flat, forbidden, `readiness forbidden ${forbidden}`);
}

assertIncludes(closeout, 'OPERATIONAL.5 FDD-ONLY ORPHAN-BINDING CLEANUP LIVE CLOSEOUT PASSED',
  'fdd closeout exists');
assertIncludes(closeout, 'rawCanonicalBindingCountAfter:13', 'fdd closeout records raw 13');
assertIncludes(closeout, 'a950StillDebt:true', 'fdd closeout keeps a950 debt');
assertIncludes(manualReviewDecision, 'not sufficient** to flip global `productSyncReady`',
  'manual-review decision kept source-of-truth debt blocking');
assertIncludes(manualReviewDecision, 'source-of-truth reconciled and release-grade',
  'manual-review decision source-of-truth requirement');
assertIncludes(liveParityDecision, 'source-of-truth cleanup debt',
  'live parity decision source-of-truth blocker');
assertIncludes(op5Gate, 'folder-sync source-of-truth reconciled and release-grade',
  'Operational.5 gate source-of-truth requirement');
assertIncludes(op5Gate, 'canonical count parity proven',
  'Operational.5 gate count parity requirement');
assertIncludes(op5GateValidator, 'folder-sync-source-of-truth-reconciliation-not-release-grade',
  'Operational.5 validator source-of-truth blocker code');
assertIncludes(op5GateValidator, 'canonical-count-parity-not-yet-proven-for-flip',
  'Operational.5 validator canonical parity blocker code');
assertIncludes(s14, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'F28 S14 kept productSyncReady false');

function readinessDecision(state) {
  const rawParityClean = state.rawCanonicalBindings === state.exportableCanonicalBindings &&
    state.exportableCanonicalBindings === state.fullBundleV2Bindings;
  const remainingDebt = state.danglingRows.length > 0;
  const productSyncReadyCanFlip = rawParityClean && !remainingDebt && state.explicitReviewedSupersession === true;
  return {
    rawParityClean,
    remainingDebt,
    productSyncReadyCanFlip,
    decision: productSyncReadyCanFlip ? 'flip-review-authorized' : 'keep-productSyncReady-false',
    webdavCanStart: false,
  };
}
const current = readinessDecision({
  rawCanonicalBindings: 13,
  exportableCanonicalBindings: 12,
  fullBundleV2Bindings: 12,
  danglingRows: ['row:a950a44b859f'],
  explicitReviewedSupersession: false,
});
assert.equal(current.rawParityClean, false, 'raw 13 vs exportable/fullBundle 12 is not clean parity');
assert.equal(current.remainingDebt, true, 'a950 remains debt');
assert.equal(current.productSyncReadyCanFlip, false, 'productSyncReady cannot flip');
assert.equal(current.decision, 'keep-productSyncReady-false', 'decision keeps false');
assert.equal(current.webdavCanStart, false, 'WebDAV cannot start from this decision');

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.product-sync-ready-decision-after-fdd-cleanup.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_PRODUCT_SYNC_READY_KEEP_FALSE_AFTER_FDD_CLEANUP',
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  remainingDebt: ['row:a950a44b859f'],
  productSyncReadyDecision: 'keep-false',
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-product-sync-ready-decision-after-fdd-cleanup');
