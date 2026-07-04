#!/usr/bin/env node
//
// Operational.5 - a950 documented-debt readiness policy validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const postFddDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-decision-after-fdd-cleanup.md';
const manualReviewDecisionPath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const op5GatePath = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const op5GateValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';
const fddCloseoutValidatorPath = 'tools/validation/sync/validate-operational5-fdd-orphan-binding-cleanup-live-closeout.mjs';
const postFddDecisionValidatorPath = 'tools/validation/sync/validate-operational5-product-sync-ready-decision-after-fdd-cleanup.mjs';
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
const fddCloseout = read(fddCloseoutPath);
const postFddDecision = read(postFddDecisionPath);
const manualReviewDecision = read(manualReviewDecisionPath);
const op5Gate = read(op5GatePath);
const op5GateValidator = read(op5GateValidatorPath);
const fddCloseoutValidator = read(fddCloseoutValidatorPath);
const postFddDecisionValidator = read(postFddDecisionValidatorPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 A950 DOCUMENTED-DEBT POLICY - KEEP `productSyncReady:false`; DO NOT FLIP WITH A950 DEBT',
  'bfbbd04302f9330d3e0e140d33e17ed5a2ed471f',
  'row:fdd2456fc8a2` was removed exactly once',
  'row:a950a44b859f',
  'raw canonical bindings: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` bindings: `12`',
  'dangling bindings: `1`',
  'Is raw-vs-exportable parity required before productSyncReady can flip?',
  'Yes.',
  'No for global `productSyncReady`',
  'documented-debt exception for raw canonical dangling rows',
  'An exception is not approved for global `productSyncReady` in this slice.',
  'localExportableSyncReady:true',
  'raw canonical debt is still visible in diagnostics',
  'global `productSyncReady` remains false',
  'Do not use `productSyncReady:true-with-documented-local-debt-exception`.',
  'Keep `productSyncReady:false` until `row:a950a44b859f` is resolved',
  'WebDAV/cloud/relay/`fullBundle.v3` cannot start next',
  'No cleanup or mutation occurred.',
  '`row:a950a44b859f` was not touched.',
  'Strict tombstone cleanup rules were not weakened.',
  'No product source was edited.',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred.',
]) {
  assertIncludes(flat, token, `policy evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'productSyncReady:true-with-documented-local-debt-exception` is approved',
  'WebDAV/cloud/relay can start next',
  'a950 cleanup completed',
  'strict tombstone cleanup rules were weakened',
]) {
  assertNotIncludes(flat, forbidden, `policy forbidden ${forbidden}`);
}

assertIncludes(fddCloseout, 'OPERATIONAL.5 FDD-ONLY ORPHAN-BINDING CLEANUP LIVE CLOSEOUT PASSED',
  'fdd closeout exists');
assertIncludes(fddCloseout, 'rawCanonicalBindings:13', 'fdd closeout raw 13');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]', 'fdd closeout only a950 dangling');
assertIncludes(fddCloseout, 'fddStillPresent:false', 'fdd row removed');
assertIncludes(fddCloseout, 'a950StillDebt:true', 'a950 remains debt');
assertIncludes(postFddDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED',
  'post-fdd decision keeps false');
assertIncludes(postFddDecision, 'Raw canonical source-of-truth count parity is still `13` raw vs `12` exportable',
  'post-fdd decision count blocker');
assertIncludes(manualReviewDecision, 'source-of-truth reconciled and release-grade',
  'manual review decision gate text');
assertIncludes(op5Gate, 'folder-sync source-of-truth reconciled and release-grade',
  'Operational.5 source-of-truth gate');
assertIncludes(op5Gate, 'canonical count parity proven',
  'Operational.5 canonical parity gate');
assertIncludes(op5Gate, 'productSyncReady stays false',
  'Operational.5 productSyncReady false');
assertIncludes(op5GateValidator, 'folder-sync-source-of-truth-reconciliation-not-release-grade',
  'source-of-truth blocker code retained');
assertIncludes(op5GateValidator, 'canonical-count-parity-not-yet-proven-for-flip',
  'canonical parity blocker code retained');
assertIncludes(fddCloseoutValidator, 'OPERATIONAL5_FDD_ORPHAN_BINDING_CLEANUP_LIVE_CLOSEOUT_PASSED',
  'fdd closeout validator retained');
assertIncludes(postFddDecisionValidator, 'OPERATIONAL5_PRODUCT_SYNC_READY_KEEP_FALSE_AFTER_FDD_CLEANUP',
  'post-fdd decision validator retained');

function policy(state) {
  const exportableParityClean = state.exportableCanonicalBindings === state.fullBundleV2Bindings;
  const rawParityClean = state.rawCanonicalBindings === state.exportableCanonicalBindings &&
    state.exportableCanonicalBindings === state.fullBundleV2Bindings;
  const a950DebtRemaining = state.danglingRows.includes('row:a950a44b859f');
  const productSyncReadyCanFlip = rawParityClean && !a950DebtRemaining && state.explicitReviewedFlip === true;
  const separateExportableFlagRecommended = exportableParityClean && !rawParityClean && a950DebtRemaining;
  return {
    exportableParityClean,
    rawParityClean,
    a950DebtRemaining,
    productSyncReadyCanFlip,
    separateExportableFlagRecommended,
    webdavCanStart: false,
  };
}

const current = policy({
  rawCanonicalBindings: 13,
  exportableCanonicalBindings: 12,
  fullBundleV2Bindings: 12,
  danglingRows: ['row:a950a44b859f'],
  explicitReviewedFlip: false,
});
assert.equal(current.exportableParityClean, true, 'exportable/fullBundle parity is clean');
assert.equal(current.rawParityClean, false, 'raw-vs-exportable parity is not exact');
assert.equal(current.a950DebtRemaining, true, 'a950 debt remains');
assert.equal(current.productSyncReadyCanFlip, false, 'productSyncReady cannot flip with a950 debt');
assert.equal(current.separateExportableFlagRecommended, true, 'separate exportable-readiness flag is the safer future option');
assert.equal(current.webdavCanStart, false, 'WebDAV cannot start from this policy');

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt source token retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup verification retained');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.a950-documented-debt-readiness-policy.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_A950_DOCUMENTED_DEBT_POLICY_KEEP_PRODUCTSYNCREADY_FALSE',
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  danglingRows: ['row:a950a44b859f'],
  productSyncReadyCanFlipWithA950Debt: false,
  recommendedFutureFlag: 'localExportableSyncReady',
  webdavCloudRelayCanStartNext: false,
  productSyncReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-a950-documented-debt-readiness-policy');
