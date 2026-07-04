#!/usr/bin/env node
//
// Folder Sync - F28 S13 sustained multi-surface parity proof.
//
// Evidence/validator-only proof over the retained S9-S12 ladder and current source boundaries: Desktop canonical
// restart survival, reviewed request/receipt path, render-mirror no-write routing, Chrome/native/mobile proposer
// contract, and multi-device read-only import/projection. No product source flip or transport start.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f28-s13-sustained-multi-surface-parity-proof.md';
const f28PlanPath = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s12Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const readinessDecisionPath = 'release-evidence/2026-07-01/folder-sync-product-sync-ready-readiness-decision.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

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
  readinessDecisionPath,
  folderSyncPath,
  foldersStorePath,
  folderImportPath,
  autoImportPath,
  exportBundlePath,
  importBundlePath,
  webdavGatesPath,
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
const readinessDecision = read(readinessDecisionPath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const runtimeCombined = [
  folderSync,
  foldersStore,
  folderImport,
  autoImport,
  exportBundle,
  importBundle,
  webdavGates,
].join('\n');

// ---- Evidence scope and chain ----
for (const token of [
  'F28 S13 SUSTAINED MULTI-SURFACE PARITY PROVEN (EVIDENCE/VALIDATOR-ONLY)',
  '138f7e120e385b6b5f4dccccc97a73d5868fd112',
  '69e5a33d946f078761b4344b7ab35cda5b4a3bdb',
  'c9fcc08b3ed3ccab01f7923e68115d0524d52a60',
  'df0323e2369a3ff72b42e585a71dc9a924601a80',
  '32fc3c5f3086e834a0df5b5b8a0eeb0baf7aa99d',
  'Desktop Studio canonical',
  'Restart convergence / settled journal',
  'Duplicate replay / idempotency',
  'F11 render mirror boundary',
  'Chrome Studio / MV3 and native/mobile request contract',
  'Multi-device import/read-only projection',
  'S13 is complete',
  'F28 S14 final productSyncReady flip review',
  'WebDAV/cloud/relay remains a separate transport-readiness slice',
]) {
  assertIncludes(flat, token, `S13 evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'WebDAV/cloud/relay can start',
  'fullBundle.v3 started',
  'product source was changed for S13',
]) {
  assert.ok(!flat.includes(forbidden), `S13 evidence must not claim: ${forbidden}`);
}

// ---- F28 S13/S14 procedure ----
assertIncludes(f28Flat, '### S13', 'F28 S13 exists');
assertIncludes(f28Flat, 'sustained multi-surface parity proof', 'F28 S13 sustained parity definition');
assertIncludes(f28Flat, 'not a single snapshot', 'F28 S13 not single snapshot');
assertIncludes(f28Flat, 'no flip until S14', 'F28 S13 blocks flip until S14');
assertIncludes(f28Flat, '### S14', 'F28 S14 exists');
assertIncludes(f28Flat, 'entry criteria: S1–S13 done; all invariants held; explicit maintainer approval',
  'F28 S14 entry criteria');
assertIncludes(f28Flat, 'real remote WebDAV remains transport-only until separately proven',
  'F28 S14 WebDAV remains separate');

// ---- S9 Desktop canonical / restart / duplicate replay / convergence parity ----
assertIncludes(s9, 'F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN', 'S9 verdict');
assertIncludes(s9, 'requestedBindingHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e',
  'S9 requested hash');
assertIncludes(s9, 'afterBindingHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e',
  'S9 applied hash');
assertIncludes(s9, 'postRestartSnapshotHash: sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e',
  'S9 post-restart hash');
assertIncludes(s9, 'postRestartMatchesPhaseARequested:true', 'S9 post-restart parity');
assertIncludes(s9, 'reconcileSurvivalProven:true', 'S9 restart survival');
assertIncludes(s9, 'duplicateReplayZeroWrite:true', 'S9 duplicate replay zero-write');
assertIncludes(s9, 'convergenceReadyResult.source:"init"', 'S9 startup convergence');
assertIncludes(s9, 'convergenceReadyResult.journalVerifiedCount:2', 'S9 journal verified');
assertIncludes(s9, 'convergenceReadyResult.alreadyCurrentCount:2', 'S9 already-current');
assertIncludes(s9, 'convergenceReadyResult.convergedCount:0', 'S9 no convergence writes when current');
assertIncludes(s9, 'convergenceReadyResult.blockers:[]', 'S9 convergence blockers empty');
assertIncludes(s9, 'convergenceReadyResult.warnings:[]', 'S9 convergence warnings empty');

// ---- S10 reviewed routing and render-only boundary ----
assertIncludes(s10, 'F28 S10 DONE', 'S10 verdict');
assertIncludes(s10, "reviewedRepairPathClasses: ['binding-mismatch']", 'S10 evidence reviewed route');
assertIncludes(s10, 'bindingMismatchRoutedToReviewedRepairPath: true', 'S10 evidence route flag');
assertIncludes(s10, 'noBindingRepair:true', 'S10 evidence render-only');
assertIncludes(s10, 'duplicateReplayZeroWrite:true', 'S10 carries duplicate replay');
assertIncludes(s10, 'reconcileSurvivalProven:true', 'S10 carries restart survival');

// ---- S11 Chrome/native/mobile non-canonical proposer contract ----
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 verdict');
assertIncludes(s11, 'Chrome/native/mobile', 'S11 surfaces');
assertIncludes(s11, 'desktopApplyRequired:true', 'S11 Desktop apply required');
assertIncludes(s11, 'noLocalApply:true', 'S11 no local apply');
assertIncludes(s11, 'noChromeCanonicalMutation', 'S11 no Chrome canonical mutation');
assertIncludes(s11, 'productSyncReady:false', 'S11 productSyncReady false');

// ---- S12 multi-device read-only import/projection ----
assertIncludes(s12, 'F28 S12 PROVEN', 'S12 verdict');
assertIncludes(s12, 'h2o.studio.fullBundle.v2', 'S12 full bundle v2');
assertIncludes(s12, 'readOnlyProjection:true', 'S12 read-only projection');
assertIncludes(s12, 'chatFolderBindingReceipts', 'S12 receipts exported');
assertIncludes(s12, 'Receipts are read-only evidence, not repair commands', 'S12 receipts read-only');
assertIncludes(s12, 'noChromeCanonicalMutation', 'S12 non-Desktop canonical boundary');
assertIncludes(s12, 'productSyncReady readiness DECISION', 'S12 next decision');
assertIncludes(s12, 'WebDAV/cloud/relay remains deferred and is not next', 'S12 WebDAV deferred');

// ---- ProductSyncReady decision remains pre-S13 and does not flip ----
assertIncludes(readinessDecision, 'PRODUCTSYNCREADY READINESS DECISION: KEEP `productSyncReady:false` / NOT READY',
  'readiness decision keeps productSyncReady false');
assertIncludes(readinessDecision, 'missing F28 S13 sustained parity proof', 'readiness decision named S13 blocker');
assertIncludes(readinessDecision, 'WebDAV/cloud/relay cannot start immediately after this decision',
  'readiness decision WebDAV boundary');

// ---- Real source boundaries: Desktop canonical writer only; non-Desktop read/propose-only ----
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'",
  'binding request schema present');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'",
  'binding receipt schema present');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'binding apply gate present');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'desktopApplyRequired: true', 'folder sync request requires Desktop apply');
assertIncludes(folderSync, 'noLocalApply: true', 'folder sync request forbids local apply');
assertIncludes(folderSync, 'productSyncReady: false', 'folder sync productSyncReady remains false');

assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'source reviewed repair route');
assertIncludes(foldersStore, 'bindingMismatchRoutedToReviewedRepairPath: true', 'source route flag');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch for render mirror');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror remains no-write for binding repair');
assertIncludes(foldersStore, 'runF15SettledBindingRestartConvergence', 'restart convergence remains present');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'duplicate/idempotency guard remains present');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable composite remains present');

assertIncludes(autoImport, 'desktopApplyRequired: true', 'MV3/native export requires Desktop apply');
assertIncludes(autoImport, 'noLocalApply: true', 'MV3/native export forbids local apply');
assertIncludes(autoImport, 'productSyncReady: false', 'MV3 productSyncReady remains false');
assertIncludes(folderImport, 'desktopApplyRequired: true', 'folder import request requires Desktop apply');
assertIncludes(folderImport, 'noLocalApply: true', 'folder import request forbids local apply');
assertIncludes(folderImport, 'readOnlyProjection: true', 'folder import has read-only projection');
assertIncludes(folderImport, 'chatFolderBindingReceipts', 'folder import reads binding receipts');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV remains deferred');

assertIncludes(exportBundle, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'export bundle remains v2');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'export binding projection read-only');
assertIncludes(exportBundle, 'chatFolderBindingReceipts: asArray(chatFolderBindingReceiptExport.receipts)',
  'export includes receipt evidence');
assertIncludes(importBundle, 'folderStore.bindChat(', 'import canonical write, when any, routes through reviewed Desktop store path');
assert.ok(!/INSERT[\s\S]{0,80}folder_bindings|DELETE[\s\S]{0,80}folder_bindings/i.test(importBundle),
  'import-bundle must not directly INSERT/DELETE folder_bindings');
assert.ok(!/chat-folder-binding-receipt[\s\S]{0,200}bindChat/i.test(importBundle),
  'import must not re-apply binding receipts as repair commands');

// ---- Release boundaries held ----
const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 12,
  `expected retained productSyncReady:false boundaries; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be flipped true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assertIncludes(folderSync, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder sync bundle remains v2');
assertIncludes(folderImport, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder import bundle remains v2');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not exist');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV gate retains productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV remains disabled by default');
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /allowF7Fallback\s*:\s*true/,
  'allowF7Fallback:true must not be present in request/import paths');
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /f15AllowF7Fallback\s*:\s*true/,
  'f15AllowF7Fallback:true must not be present in request/import paths');
assert.doesNotMatch(`${folderSync}\n${autoImport}\n${folderImport}\n${importBundle}`, /explicitF7Fallback\s*:\s*true/,
  'explicitF7Fallback:true must not be present in request/import paths');

const result = {
  schema: 'h2o.studio.folder-sync.binding-f28-s13-sustained-multi-surface-parity-proof.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'F28-S13-sustained-multi-surface-parity-proof',
  evidence: evidencePath,
  verdict: 'F28_S13_SUSTAINED_MULTI_SURFACE_PARITY_PROVEN',
  evidenceOnly: true,
  productSourceChanged: false,
  surfacesCovered: [
    'desktop-studio-canonical-folder_bindings',
    'restart-convergence-settled-journal',
    'reviewed-request-receipt-path',
    'f11-render-mirror-boundary',
    'chrome-mv3-native-mobile-submission-contract',
    'multi-device-readonly-import-projection',
  ],
  parityDimensions: [
    'canonical-binding-hash',
    'read-only-projection-and-receipts',
    'duplicate-replay-zero-write',
    'restart-convergence-already-current',
    'reviewed-repair-routing',
    'render-mirror-no-write',
  ],
  s9Complete: true,
  s10Complete: true,
  s11Complete: true,
  s12Complete: true,
  productSyncReadyFlipped: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  next: 'F28 S14 final productSyncReady flip review with explicit approval; WebDAV/cloud/relay remains separate',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f28-s13-sustained-multi-surface-parity-proof');
