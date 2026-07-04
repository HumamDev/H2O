#!/usr/bin/env node
//
// Folder Sync - F28 S14 productSyncReady final review.
//
// Evidence/validator-only final review: S9-S13 are complete, but the broader productSyncReady source/procedure still
// keeps productSyncReady false and requires a separate global flip slice. WebDAV/cloud/relay and Chat Saving CAS remain
// deferred.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';
const f28PlanPath = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s12Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const s13Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s13-sustained-multi-surface-parity-proof.md';
const readinessDecisionPath = 'release-evidence/2026-07-01/folder-sync-product-sync-ready-readiness-decision.md';
const operational5Path = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const folderF1Path = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const folderF2Path = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const metadataDiagnosticsPath = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const metadataExportProjectionPath = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

for (const rel of [
  evidencePath,
  f28PlanPath,
  s9Path,
  s10Path,
  s11Path,
  s12Path,
  s13Path,
  readinessDecisionPath,
  operational5Path,
  folderF1Path,
  folderF2Path,
  folderSyncPath,
  foldersStorePath,
  folderImportPath,
  autoImportPath,
  exportBundlePath,
  importBundlePath,
  webdavGatesPath,
  metadataDiagnosticsPath,
  metadataExportProjectionPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const f28Plan = read(f28PlanPath);
const f28Flat = compact(f28Plan);
const s9 = read(s9Path);
const s10 = read(s10Path);
const s11 = read(s11Path);
const s12 = read(s12Path);
const s13 = read(s13Path);
const readinessDecision = read(readinessDecisionPath);
const operational5 = read(operational5Path);
const folderF1 = read(folderF1Path);
const folderF2 = read(folderF2Path);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const metadataDiagnostics = read(metadataDiagnosticsPath);
const metadataExportProjection = read(metadataExportProjectionPath);
const runtimeCombined = [
  folderSync,
  foldersStore,
  folderImport,
  autoImport,
  exportBundle,
  importBundle,
  webdavGates,
  metadataDiagnostics,
  metadataExportProjection,
].join('\n');

// ---- Evidence verdict and chain ----
for (const token of [
  'F28 S14 PRODUCTSYNCREADY FINAL REVIEW COMPLETE - KEEP `productSyncReady:false` / NOT FLIPPED',
  '138f7e120e385b6b5f4dccccc97a73d5868fd112',
  '69e5a33d946f078761b4344b7ab35cda5b4a3bdb',
  'c9fcc08b3ed3ccab01f7923e68115d0524d52a60',
  'df0323e2369a3ff72b42e585a71dc9a924601a80',
  '32fc3c5f3086e834a0df5b5b8a0eeb0baf7aa99d',
  'f0d19294d958cc0a66a2c13c7f567e1a9a422039',
  'do not flip `productSyncReady` in this slice',
  'The minimal safe source change is therefore **none**',
  'WebDAV/cloud/relay still requires a separate',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `S14 evidence token ${token}`);
}

for (const forbidden of [
  'PRODUCTSYNCREADY READY',
  'productSyncReady flipped',
  'WebDAV/cloud/relay can start',
  'fullBundle.v3 started',
]) {
  assert.ok(!flat.includes(forbidden), `S14 evidence must not claim: ${forbidden}`);
}

// ---- F28 procedure and completed S9-S13 ladder ----
assertIncludes(f28Flat, '### S14', 'F28 S14 exists');
assertIncludes(f28Flat, 'final productSyncReady flip review', 'F28 S14 final review');
assertIncludes(f28Flat, 'entry criteria: S1–S13 done; all invariants held; explicit maintainer approval',
  'F28 S14 entry criteria');
assertIncludes(f28Flat, 'real remote WebDAV remains transport-only until separately proven',
  'F28 WebDAV transport-only boundary');

assertIncludes(s9, 'F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN', 'S9 complete');
assertIncludes(s9, 'reconcileSurvivalProven:true', 'S9 restart survival');
assertIncludes(s9, 'duplicateReplayZeroWrite:true', 'S9 duplicate replay');
assertIncludes(s10, 'F28 S10 DONE', 'S10 complete');
assertIncludes(s10, 'binding-mismatch` IS ROUTED TO THE REVIEWED F15-SETTLED REPAIR PATH', 'S10 route');
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 complete');
assertIncludes(s11, 'Chrome/native/mobile', 'S11 surfaces');
assertIncludes(s12, 'F28 S12 PROVEN', 'S12 complete');
assertIncludes(s12, 'readOnlyProjection:true', 'S12 read-only projection');
assertIncludes(s13, 'F28 S13 SUSTAINED MULTI-SURFACE PARITY PROVEN', 'S13 complete');
assertIncludes(s13, 'S13 is complete', 'S13 next-state marker');
assertIncludes(readinessDecision, 'PRODUCTSYNCREADY READINESS DECISION: KEEP `productSyncReady:false` / NOT READY',
  'prior readiness decision kept false');

// ---- Broader global productSyncReady gate still blocks a source flip ----
assertIncludes(operational5, 'OPERATIONAL.5 productSyncReady FLIP-GATE - NOT FLIPPED', 'Operational.5 still not flipped');
assertIncludes(operational5, 'productSyncReady stays false', 'Operational.5 keeps false');
assertIncludes(operational5, 'folder-sync source-of-truth reconciled', 'Operational.5 requires source-of-truth gate');
assertIncludes(operational5, 'canonical count parity', 'Operational.5 requires canonical count parity');
assertIncludes(operational5, 'Folder-sync source-of-truth reconciliation remains outstanding',
  'Operational.5 records outstanding source-of-truth blocker');
assertIncludes(folderF1, 'Folder sync readiness: NOT READY', 'F1 still historical NOT READY');
assertIncludes(folderF1, 'source-of-truth split is identified but not yet reconciled', 'F1 source-of-truth blocker');
assertIncludes(folderF2, 'Folder sync readiness verdict: NOT READY', 'F2 still historical NOT READY');
assertIncludes(folderF2, 'repaired. The mirror is still not guaranteed', 'F2 drift not repaired blocker');

// ---- Source posture: productSyncReady is a combination of hardcoded local/diagnostic/transport flags ----
const falseLiteralCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(falseLiteralCount >= 20, `expected many productSyncReady:false markers; found ${falseLiteralCount}`);
assertIncludes(folderSync, 'productSyncReady: state.lastLibraryMetadataMutationRequestAutoApply.productSyncReady === true',
  'request-local metadata productSyncReady field remains distinct from global folder readiness');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'runtime source must not contain productSyncReady: true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'runtime source must not assign productSyncReady = true');

// ---- Binding-lane no-longer-active blocker status, without turning F11 into a writer ----
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'binding-mismatch reviewed path declared');
assertIncludes(foldersStore, 'bindingMismatchRoutedToReviewedRepairPath: true', 'binding-mismatch route flag');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 render mirror still blocks binding-mismatch as a render-mirror class');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror remains no-write');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  'binding request schema present');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  'binding receipt schema present');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'binding apply gate present');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable composite remains present');

// ---- WebDAV/cloud/relay/CAS boundaries remain deferred ----
assertIncludes(folderSync, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder sync remains fullBundle v2');
assertIncludes(folderImport, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder import remains fullBundle v2');
assertIncludes(exportBundle, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'export remains fullBundle v2');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be present');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV remains deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard remains');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled-by-default remains');
assertIncludes(webdavGates, 'productSyncReady remains false', 'WebDAV gate still reports productSyncReady false');

// ---- No fallback / no weakening in request/import surfaces ----
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /allowF7Fallback\s*:\s*true/,
  'allowF7Fallback:true must not be present in request/import paths');
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /f15AllowF7Fallback\s*:\s*true/,
  'f15AllowF7Fallback:true must not be present in request/import paths');
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /explicitF7Fallback\s*:\s*true/,
  'explicitF7Fallback:true must not be present in request/import paths');

const result = {
  schema: 'h2o.studio.folder-sync.binding-f28-s14-product-sync-ready-final-review.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'F28-S14-product-sync-ready-final-review',
  evidence: evidencePath,
  verdict: 'F28_S14_REVIEW_COMPLETE_PRODUCT_SYNC_READY_NOT_FLIPPED',
  s9Complete: true,
  s10Complete: true,
  s11Complete: true,
  s12Complete: true,
  s13Complete: true,
  bindingLaneActiveBlockerCleared: true,
  productSyncReadyDecision: 'keep-false',
  productSyncReadyFlipped: false,
  productSyncReadyFalseLiteralCount: falseLiteralCount,
  remainingBlocker: 'global Operational.5 source-of-truth reconciliation/canonical count parity gate requires separate flip slice',
  minimalSafeSourceChange: 'none',
  webdavCloudRelayStarted: false,
  webdavCloudRelayCanStartNext: false,
  webdavRequiresSeparateTransportReadinessLane: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f28-s14-product-sync-ready-final-review');
