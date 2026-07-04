#!/usr/bin/env node
//
// Operational.5 - localExportableSyncReady design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-design.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const postFddDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-decision-after-fdd-cleanup.md';
const op5GatePath = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const op5GateValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
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
const a950Policy = read(a950PolicyPath);
const fddCloseout = read(fddCloseoutPath);
const postFddDecision = read(postFddDecisionPath);
const op5Gate = read(op5GatePath);
const op5GateValidator = read(op5GateValidatorPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const exportBundle = read(exportBundlePath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 LOCAL EXPORTABLE SYNC READY DESIGN COMPLETE - DESIGN ONLY; `productSyncReady:false` REMAINS',
  '684ea497522b1804beb04fc3de0f5672b6901356',
  'bfbbd04302f9330d3e0e140d33e17ed5a2ed471f',
  'row:a950a44b859f',
  'raw canonical bindings: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` bindings: `12`',
  'dangling bindings: `1`',
  'Recommended name: **`localExportableSyncReady`**',
  'Rejected alternatives',
  'exportableCanonicalSyncReady',
  'productSyncReadyWithDebt',
  'productSyncReady:true-with-documented-local-debt-exception',
  'local: no WebDAV/cloud/relay/`fullBundle.v3`',
  'exportable: only the exportable canonical subset and `fullBundle.v2` projection',
  'not a writer, cleanup approval, or transport gate',
  'Exportable canonical bindings equal `fullBundle.v2` binding projection',
  'No exportable dangling bindings exist',
  'Remaining raw dangling rows, if any, are explicitly documented debt',
  '`row:a950a44b859f` remains non-exportable and quarantined from export',
  'Raw canonical debt remains visible in diagnostics and is not hidden',
  'Strict tombstone cleanup rules remain unchanged',
  '`productSyncReady:false` remains',
  'WebDAV/cloud/relay/`fullBundle.v3` remains blocked by separate global + transport gates',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
  'does not authorize folder/chat/binding/tombstone/ledger/import/export/render-mirror mutation',
  'product source-level diagnostic/readiness flag in a future slice',
  'UI-only would risk divergent semantics',
  'Evidence-only would not give runtime callers a stable contract',
  'non-transport',
  'Introduce `localExportableSyncReady` as a separate diagnostic/source-level readiness flag',
  'Do not flip `productSyncReady`',
  'Recommended next slice: implement a minimal read-only diagnostic/source flag',
]) {
  assertIncludes(flat, token, `design evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'WebDAV/cloud/relay can start',
  'Chat Saving CAS can start',
  'cleanup apply approved',
  'row:a950a44b859f` was removed',
]) {
  assertNotIncludes(flat, forbidden, `design forbidden ${forbidden}`);
}

assertIncludes(a950Policy, 'DO NOT FLIP WITH A950 DEBT', 'a950 policy keeps productSyncReady false');
assertIncludes(a950Policy, 'localExportableSyncReady:true', 'a950 policy recommended separate future flag');
assertIncludes(a950Policy, 'WebDAV/cloud/relay/`fullBundle.v3` cannot start next', 'a950 policy blocks transport');
assertIncludes(fddCloseout, 'rawCanonicalBindings:13', 'fdd closeout raw 13');
assertIncludes(fddCloseout, 'exportableCanonicalBindings:12', 'fdd closeout exportable 12');
assertIncludes(fddCloseout, 'fullBundleV2Bindings:12', 'fdd closeout bundle 12');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]', 'fdd closeout only a950 dangling');
assertIncludes(postFddDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'post-fdd decision keeps false');
assertIncludes(op5Gate, 'productSyncReady = v1 single-canonical local metadata sync model is release-grade',
  'Operational.5 global productSyncReady semantics retained');
assertIncludes(op5Gate, 'folder-sync source-of-truth reconciled and release-grade',
  'Operational.5 source-of-truth gate retained');
assertIncludes(op5Gate, 'canonical count parity proven', 'Operational.5 count parity gate retained');
assertIncludes(op5Gate, 'Cloud readiness is separate future `cloudSyncReady`',
  'cloud readiness remains separate');
assertIncludes(op5GateValidator, 'productSyncReady stays false', 'productSyncReady flip gate validator retained');
assertIncludes(op5GateValidator, 'WEBDAV_GATES_REL', 'WebDAV gate validator path retained');

function localExportablePolicy(state) {
  const exportableParityClean = state.exportableCanonicalBindings === state.fullBundleV2Bindings;
  const noExportableDangling = state.exportableDanglingBindings === 0;
  const rawDebtDocumented = state.documentedDebtRows.every((row) => state.rawDanglingRows.includes(row));
  const rawDebtVisible = state.rawDanglingRows.length > 0 && state.rawCanonicalBindings !== state.exportableCanonicalBindings;
  const canSetLocalExportable = exportableParityClean &&
    noExportableDangling &&
    rawDebtDocumented &&
    rawDebtVisible &&
    state.productSyncReady === false &&
    state.webdavStarted === false &&
    state.chatSavingCasStarted === false;
  return {
    exportableParityClean,
    noExportableDangling,
    rawDebtDocumented,
    rawDebtVisible,
    canSetLocalExportable,
    productSyncReadyCanFlip: false,
    webdavCanStart: false,
  };
}

const current = localExportablePolicy({
  rawCanonicalBindings: 13,
  exportableCanonicalBindings: 12,
  fullBundleV2Bindings: 12,
  exportableDanglingBindings: 0,
  rawDanglingRows: ['row:a950a44b859f'],
  documentedDebtRows: ['row:a950a44b859f'],
  productSyncReady: false,
  webdavStarted: false,
  chatSavingCasStarted: false,
});
assert.equal(current.exportableParityClean, true, 'exportable/fullBundle parity is clean');
assert.equal(current.noExportableDangling, true, 'no exportable dangling binding');
assert.equal(current.rawDebtDocumented, true, 'a950 debt documented');
assert.equal(current.rawDebtVisible, true, 'raw debt remains visible');
assert.equal(current.canSetLocalExportable, true, 'future local exportable flag can represent this state');
assert.equal(current.productSyncReadyCanFlip, false, 'local exportable flag cannot flip productSyncReady');
assert.equal(current.webdavCanStart, false, 'local exportable flag cannot start WebDAV');

const runtimeCombined = [foldersStore, folderSync, folderImport, exportBundle, webdavGates].join('\n');
const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /localExportableSyncReady\s*:\s*true|localExportableSyncReady\s*=\s*true/,
  'design slice must not implement localExportableSyncReady true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt token retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup verification retained');
assertIncludes(exportBundle, 'activeDanglingFolderBindingCount', 'export bundle still reports dangling diagnostics');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.local-exportable-sync-ready-design.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_LOCAL_EXPORTABLE_SYNC_READY_DESIGN_ONLY',
  recommendedFlagName: 'localExportableSyncReady',
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  danglingRows: ['row:a950a44b859f'],
  localExportableSyncReadyFutureSemantics: true,
  productSyncReady: false,
  productSyncReadyCanFlip: false,
  webdavCloudRelayCanStart: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-local-exportable-sync-ready-design');
