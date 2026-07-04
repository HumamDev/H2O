#!/usr/bin/env node
//
// Operational.5 - source-of-truth / canonical count parity preflight.
//
// Evidence/validator-only gate after F28 S14. This keeps productSyncReady false and identifies the
// remaining global local-readiness proof: source-of-truth reconciliation plus canonical count parity.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-source-of-truth-canonical-count-parity-preflight.md';
const operational5Path = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const operational5ValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';
const f1Path = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const f2Path = 'release-evidence/2026-06-25/folder-sync-f2-source-of-truth-drift-detector.md';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s12Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const s13Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s13-sustained-multi-surface-parity-proof.md';
const s14Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';
const productDecisionPath = 'release-evidence/2026-07-01/folder-sync-product-sync-ready-readiness-decision.md';

const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const metadataDiagnosticsPath = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const metadataExportProjectionPath = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const chatSavingCasBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function repoPath(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function read(rel) {
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertMatches(source, pattern, label) {
  assert.match(String(source), pattern, label);
}

for (const rel of [
  evidencePath,
  operational5Path,
  operational5ValidatorPath,
  f1Path,
  f2Path,
  s9Path,
  s10Path,
  s11Path,
  s12Path,
  s13Path,
  s14Path,
  productDecisionPath,
  foldersStorePath,
  folderSyncPath,
  folderImportPath,
  autoImportPath,
  exportBundlePath,
  importBundlePath,
  webdavGatesPath,
  metadataDiagnosticsPath,
  metadataExportProjectionPath,
  settlementWriterPath,
  conflictRuntimePath,
  chatSavingCasBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const operational5 = read(operational5Path);
const operational5Validator = read(operational5ValidatorPath);
const f1 = read(f1Path);
const f2 = read(f2Path);
const f2Flat = compact(f2);
const s9 = read(s9Path);
const s10 = read(s10Path);
const s11 = read(s11Path);
const s12 = read(s12Path);
const s13 = read(s13Path);
const s14 = read(s14Path);
const productDecision = read(productDecisionPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const metadataDiagnostics = read(metadataDiagnosticsPath);
const metadataExportProjection = read(metadataExportProjectionPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);

const runtimeCombined = [
  foldersStore,
  folderSync,
  folderImport,
  autoImport,
  exportBundle,
  importBundle,
  webdavGates,
  metadataDiagnostics,
  metadataExportProjection,
  settlementWriter,
  conflictRuntime,
].join('\n');

// Evidence verdict and F28 chain.
for (const token of [
  'OPERATIONAL.5 SOURCE-OF-TRUTH / CANONICAL COUNT PARITY PREFLIGHT REQUIRED',
  '138f7e120e385b6b5f4dccccc97a73d5868fd112',
  '69e5a33d946f078761b4344b7ab35cda5b4a3bdb',
  'c9fcc08b3ed3ccab01f7923e68115d0524d52a60',
  'df0323e2369a3ff72b42e585a71dc9a924601a80',
  'f0d19294d958cc0a66a2c13c7f567e1a9a422039',
  'ceba8239b5d347024aca23aab55a92f4006fefc0',
  'The F28 binding lane is clear',
  'source-of-truth reconciliation not release-grade',
  'canonical count parity not proven',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay cannot start',
  'separate transport-readiness lane',
]) {
  assertIncludes(flat, token, `preflight evidence token ${token}`);
}

// Operational.5 location and blocker source anchors.
assertIncludes(flat, operational5Path, 'evidence names Operational.5 evidence');
assertIncludes(flat, operational5ValidatorPath, 'evidence names Operational.5 validator');
assertMatches(operational5, /OPERATIONAL\.5 productSyncReady FLIP-GATE - NOT FLIPPED/i,
  'Operational.5 evidence remains not flipped');
assertMatches(operational5, /folder-sync source-of-truth reconciled and release-grade/i,
  'Operational.5 source-of-truth gate');
assertMatches(operational5, /canonical count parity proven/i,
  'Operational.5 canonical parity gate');
assertIncludes(operational5, 'Folder-sync source-of-truth reconciliation remains outstanding',
  'Operational.5 outstanding blocker');
assertIncludes(operational5Validator, 'folder-sync-source-of-truth-reconciliation-not-release-grade',
  'Operational.5 validator source-of-truth blocker');
assertIncludes(operational5Validator, 'canonical-count-parity-not-yet-proven-for-flip',
  'Operational.5 validator parity blocker');

// F1/F2 source split and drift classes.
assertIncludes(f1, 'Folder sync readiness: NOT READY', 'F1 readiness still not ready');
assertIncludes(f1, 'source-of-truth split is identified but not yet reconciled', 'F1 split unresolved');
assertIncludes(f1, 'SQLite `folders` (+ bindings/tombstone tables)', 'F1 canonical SQLite owner');
assertIncludes(f1, 'FOLDER_STATE_DATA_KEY', 'F1 render mirror key');
assertIncludes(f2, 'Folder sync readiness verdict: NOT READY', 'F2 readiness still not ready');
assertIncludes(f2Flat, 'not yet repaired', 'F2 drift not repaired');
for (const driftClass of [
  'missing-mirror-folder',
  'extra-mirror-folder',
  'field-mismatch:name',
  'field-mismatch:color',
  'field-mismatch:sortOrder',
  'tombstone-status-mismatch',
  'binding-mismatch',
  'desktop-sqlite-source-diverged',
  'stale-deferred-propagation',
]) {
  assertIncludes(f2, driftClass, `F2 drift class ${driftClass}`);
  assertIncludes(flat, driftClass, `preflight evidence drift class ${driftClass}`);
}

// F28 S9-S14 evidence exists and proves the binding lane is complete but not a global flip.
assertIncludes(s9, 'F15 SETTLED CHAT-FOLDER BINDING REPAIR RESTART-SURVIVAL IS LIVE-PROVEN', 'S9 complete');
assertIncludes(s10, 'F28 S10 DONE', 'S10 complete');
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 complete');
assertIncludes(s12, 'F28 S12 PROVEN', 'S12 complete');
assertIncludes(s13, 'F28 S13 SUSTAINED MULTI-SURFACE PARITY PROVEN', 'S13 complete');
assertIncludes(s14, 'F28 S14 PRODUCTSYNCREADY FINAL REVIEW COMPLETE - KEEP `productSyncReady:false` / NOT FLIPPED',
  'S14 complete and not flipped');
assertIncludes(s14, 'global Operational.5 productSyncReady flip gate still says `productSyncReady` stays false',
  'S14 defers global gate');
assertIncludes(productDecision, 'PRODUCTSYNCREADY READINESS DECISION: KEEP `productSyncReady:false` / NOT READY',
  'prior product readiness decision kept false');

// Required surfaces and parity dimensions are spelled out in the preflight.
for (const surface of [
  'Desktop SQLite canonical folder rows',
  'Desktop SQLite canonical `folder_bindings`',
  'Desktop tombstone and recently deleted state',
  '`FOLDER_STATE_DATA_KEY` render mirror rows and `items` binding projection',
  'Chrome/MV3 projection and import diagnostics',
  '`fullBundle.v2` export/import projection',
  'Request/receipt ledgers',
  'F15-settled restart convergence records',
]) {
  assertIncludes(flat, surface, `required surface ${surface}`);
}

for (const dimension of [
  'canonical folder count',
  'visible folder count',
  'canonical folder id/order/hash',
  'canonical binding row count',
  'binding hash',
  'mirror folder count',
  'mirror item/binding projection count',
  'tombstone/recently-deleted count and hash',
  'exported `fullBundle.v2` folder/binding/receipt counts',
  'imported read-only projection count',
  'request/receipt ledger count and hash',
  'restart convergence checked/already-current/materialized counts',
  'duplicate replay zero-write posture',
]) {
  assertIncludes(flat, dimension, `required parity dimension ${dimension}`);
}

assertIncludes(flat, 'not optimistic request success alone', 'UI optimistic success guard');
assertIncludes(flat, 'canonical count parity read-only harness/validator', 'next proof clearly identified');

// Runtime source anchors for the same surfaces.
assertIncludes(foldersStore, "var FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1'", 'render mirror key source');
assertIncludes(foldersStore, 'function removeFolderFromStateMirror', 'mirror removal writer source');
assertIncludes(foldersStore, 'function restoreFolderToStateMirror', 'mirror restore writer source');
assertIncludes(foldersStore, "syncPropagation: 'deferred'", 'mirror deferred propagation marker');
assertIncludes(foldersStore, 'function listCanonicalChatFolderBindings', 'canonical binding reader source');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence source');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror stays no-write for binding repair');
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'binding reviewed repair path retained');
assertIncludes(folderSync, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder sync fullBundle v2');
assertIncludes(folderImport, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder import fullBundle v2');
assertIncludes(autoImport, "FULL_BUNDLE_SCHEMA   = 'h2o.studio.fullBundle.v2'", 'auto import fullBundle v2');
assertIncludes(exportBundle, "FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'export bundle fullBundle v2');
assertIncludes(exportBundle, 'chatFolderBindingReceipts: asArray(chatFolderBindingReceiptExport.receipts)',
  'export includes read-only binding receipts');
assertIncludes(folderImport, 'chatFolderBindingReceipts', 'folder import sees binding receipts');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'export has read-only projection markers');
assertIncludes(folderImport, 'readOnlyProjection: true', 'import has read-only projection markers');

// productSyncReady remains false, and the false markers are intentionally broader than a single flip.
const falseLiteralCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(falseLiteralCount >= 20, `expected many productSyncReady:false markers; found ${falseLiteralCount}`);
assertIncludes(folderSync, 'productSyncReady: state.lastLibraryMetadataMutationRequestAutoApply.productSyncReady === true',
  'request-local metadata productSyncReady field remains distinct from global readiness');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'runtime source must not contain productSyncReady: true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'runtime source must not assign productSyncReady = true');
assertIncludes(flat, 'future global flip cannot blindly change every literal', 'false literal classification recorded');

// Transport/CAS boundaries remain deferred.
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not exist');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assertIncludes(webdavGates, 'productSyncReady remains false', 'WebDAV gate still reports productSyncReady false');
assertIncludes(flat, 'Chat Saving WebDAV/cloud/archive CAS remains blocked/deferred', 'Chat Saving CAS boundary recorded');

// No fallback / no weakening.
assert.doesNotMatch(runtimeCombined, /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable/hash gate remains strict');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement context requirement remains represented');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'conflict runtime context-missing guard remains');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate remains');

const result = {
  schema: 'h2o.studio.operational5.source-of-truth-canonical-count-parity-preflight.validator.v1',
  verdict: 'OPERATIONAL5_SOURCE_OF_TRUTH_CANONICAL_COUNT_PARITY_PREFLIGHT_REQUIRED',
  evidence: evidencePath,
  f28S9ThroughS14Complete: true,
  bindingLaneClear: true,
  productSyncReady: false,
  productSyncReadyFlipped: false,
  productSyncReadyFalseLiteralCount: falseLiteralCount,
  remainingBlockers: [
    'source-of-truth reconciliation not release-grade',
    'canonical count parity not proven',
  ],
  nextRequiredSlice: 'canonical-count-parity-read-only-harness-validator',
  webdavCloudRelayStarted: false,
  webdavCloudRelayCanStartNext: false,
  webdavCloudRelayRequiresSeparateTransportReadinessLane: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-source-of-truth-canonical-count-parity-preflight');
