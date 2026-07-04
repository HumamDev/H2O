#!/usr/bin/env node
//
// Folder Sync - productSyncReady readiness decision after F28 binding S9-S12.
//
// Proves the decision is intentionally NOT READY: S9-S12 are present, but the F28 procedure still requires S13
// sustained parity and S14 final flip review before any productSyncReady source change. Also proves source boundaries
// remain false/deferred and no WebDAV/cloud/relay or Chat Saving CAS work was started by this decision slice.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-product-sync-ready-readiness-decision.md';
const f28PlanPath = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s12Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const staleCleanupCommit = 'e1ac529955782f93df2976adaa8e2cfa4dde998d';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const readinessAfterS5Path = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';

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
  folderSyncPath,
  foldersStorePath,
  folderImportPath,
  exportBundlePath,
  importBundlePath,
  webdavGatesPath,
  readinessAfterS5Path,
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
const readinessAfterS5 = read(readinessAfterS5Path);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const runtimeCombined = [
  folderSync,
  foldersStore,
  folderImport,
  exportBundle,
  importBundle,
  webdavGates,
].join('\n');

// ---- Evidence decision and commit chain ----
for (const token of [
  'PRODUCTSYNCREADY READINESS DECISION: KEEP `productSyncReady:false` / NOT READY',
  '138f7e120e385b6b5f4dccccc97a73d5868fd112',
  '69e5a33d946f078761b4344b7ab35cda5b4a3bdb',
  'c9fcc08b3ed3ccab01f7923e68115d0524d52a60',
  'df0323e2369a3ff72b42e585a71dc9a924601a80',
  staleCleanupCommit,
  'S13 is the **sustained multi-surface parity proof**',
  'S14 is the **final productSyncReady flip review**',
  'missing F28 S13 sustained parity proof',
  'WebDAV/cloud/relay cannot start immediately after this decision',
  'No product source edited',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `decision evidence token ${token}`);
}

for (const forbidden of [
  'PRODUCTSYNCREADY READY',
  'flip authorized now',
  'WebDAV/cloud/relay can start immediately',
  'fullBundle.v3 started',
]) {
  assert.ok(!flat.includes(forbidden), `decision evidence must not claim: ${forbidden}`);
}

// ---- S9-S12 complete proof anchors ----
assertIncludes(s9, 'F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN', 'S9 closeout');
assertIncludes(s9, 'reconcileSurvivalProven:true', 'S9 restart survival');
assertIncludes(s10, 'F28 S10 DONE', 'S10 reviewed repair route');
assertIncludes(s10, 'binding-mismatch` IS ROUTED TO THE REVIEWED F15-SETTLED REPAIR PATH', 'S10 routing');
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 request-submission proof');
assertIncludes(s11, 'Chrome/native/mobile', 'S11 surfaces');
assertIncludes(s12, 'F28 S12 PROVEN', 'S12 multi-device proof');
assertIncludes(s12, 'productSyncReady readiness DECISION', 'S12 points to decision');
assertIncludes(s12, 'NOT an automatic flip', 'S12 forbids automatic flip');
assertIncludes(s12, 'WebDAV/cloud/relay remains deferred and is not next', 'S12 keeps WebDAV deferred');

// ---- F28 source procedure remains S13 -> S14 before flip ----
assertIncludes(f28Flat, '### S13', 'F28 S13 exists');
assertIncludes(f28Flat, 'sustained multi-surface parity proof', 'F28 S13 sustained parity');
assertIncludes(f28Flat, 'no flip until S14', 'F28 S13 blocks flip until S14');
assertIncludes(f28Flat, '### S14', 'F28 S14 exists');
assertIncludes(f28Flat, 'final productSyncReady flip review', 'F28 S14 final flip review');
assertIncludes(f28Flat, 'entry criteria: S1–S13 done; all invariants held; explicit maintainer approval',
  'F28 S14 entry criteria');
assertIncludes(f28Flat, 'real remote WebDAV remains transport-only until separately proven',
  'F28 S14 transport-only WebDAV boundary');

// ---- Current readiness recheck is still not a flip authority ----
assertIncludes(readinessAfterS5, 'Verdict: productSyncReady remains NOT READY after S5.', 'after-S5 readiness verdict');
assertIncludes(readinessAfterS5, '`binding-mismatch` remains blocked', 'after-S5 historical blocker');

// ---- Source posture: not a single computed readiness result; multiple explicit false/deferred boundaries ----
const falseLiteralCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(falseLiteralCount >= 12, `expected many productSyncReady:false boundary literals; found ${falseLiteralCount}`);
assertIncludes(folderSync, 'productSyncReady: state.lastLibraryMetadataMutationRequestAutoApply.productSyncReady === true',
  'source has a request-local metadata productSyncReady field distinct from global folder readiness');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'runtime source must not contain productSyncReady: true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'runtime source must not assign productSyncReady = true');

// ---- S10 render-only boundary and reviewed path remain intact ----
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 render mirror still blocks binding-mismatch');
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']",
  'binding-mismatch reviewed repair path remains declared');
assertIncludes(foldersStore, 'bindingMismatchRoutedToReviewedRepairPath: true',
  'binding-mismatch route declaration remains');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror remains render-only');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  'binding request schema remains present');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  'binding receipt schema remains present');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'binding apply gate remains present');

// ---- WebDAV/cloud/relay and Chat Saving boundaries ----
assertIncludes(folderSync, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder sync bundle remains v2');
assertIncludes(exportBundle, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'export bundle remains v2');
assertIncludes(folderImport, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder import bundle remains v2');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be present');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder-sync WebDAV remains deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder-import WebDAV remains deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV transport gate keeps productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV write remains disabled by default');
assertIncludes(webdavGates, 'productSyncReady remains false', 'WebDAV gate records productSyncReady false');

// ---- No fallback / no gate weakening drift in the decision scope ----
assert.doesNotMatch(runtimeCombined, /allowF7Fallback\s*:\s*true/, 'allowF7Fallback:true must not be introduced');
assert.doesNotMatch(runtimeCombined, /f15AllowF7Fallback\s*:\s*true/, 'f15AllowF7Fallback:true must not be introduced');
assert.doesNotMatch(runtimeCombined, /explicitF7Fallback\s*:\s*true/, 'explicitF7Fallback:true must not be introduced');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate remains present');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable composite gate remains present');

const result = {
  schema: 'h2o.studio.folder-sync.product-sync-ready-readiness-decision.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'product-sync-ready-readiness-decision-after-s9-s12',
  evidence: evidencePath,
  verdict: 'PRODUCT_SYNC_READY_NOT_READY_PENDING_F28_S13_S14',
  s9RestartSurvivalComplete: true,
  s10ReviewedRepairPathComplete: true,
  s11RequestSubmissionComplete: true,
  s12MultiDeviceImportReadonlyComplete: true,
  productSyncReadyDecision: 'keep-false',
  productSyncReadyFlipped: false,
  remainingBlocker: 'F28 S13 sustained multi-surface parity proof, then S14 final productSyncReady flip review',
  productSyncReadyFalseLiteralCount: falseLiteralCount,
  bindingMismatchRoutedToReviewedRepairPath: true,
  f11RenderMirrorRemainsRenderOnly: true,
  webdavCloudRelayCanStartNext: false,
  webdavCloudRelayStarted: false,
  webdavRequiresSeparateTransportReadinessSlice: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-product-sync-ready-readiness-decision');
