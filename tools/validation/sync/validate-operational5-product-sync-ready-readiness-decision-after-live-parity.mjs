#!/usr/bin/env node
//
// Operational.5 - productSyncReady readiness decision after live parity.
//
// This validator records the post-v3 decision: exportable parity is clean, but global
// productSyncReady stays false because raw canonical dangling binding cleanup debt remains.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
const op5PreflightPath = 'release-evidence/2026-07-01/operational5-source-of-truth-canonical-count-parity-preflight.md';
const parityHarnessPath = 'release-evidence/2026-07-01/operational5-canonical-count-parity-readonly-harness.md';
const liveDiagnosticPath = 'release-evidence/2026-07-01/operational5-live-readonly-canonical-count-parity-diagnostic.md';
const fullBundleDiagnosticPath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-readonly-projection-diagnostic.md';
const mismatchInvestigationPath = 'release-evidence/2026-07-01/operational5-fullbundle-v2-binding-count-mismatch-investigation.md';
const s14Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s14-product-sync-ready-final-review.md';
const op5GatePath = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const op5GateValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';

const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const metadataDiagnosticsPath = 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js';
const metadataExportProjectionPath = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function repoPath(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(repoPath(rel));
}

function read(rel) {
  assert.ok(exists(rel), `missing ${rel}`);
  return fs.readFileSync(repoPath(rel), 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const op5Preflight = read(op5PreflightPath);
const parityHarness = read(parityHarnessPath);
const liveDiagnostic = read(liveDiagnosticPath);
const fullBundleDiagnostic = read(fullBundleDiagnosticPath);
const mismatchInvestigation = read(mismatchInvestigationPath);
const s14 = read(s14Path);
const op5Gate = read(op5GatePath);
const op5GateValidator = read(op5GateValidatorPath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const autoImport = read(autoImportPath);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const webdavGates = read(webdavGatesPath);
const metadataDiagnostics = read(metadataDiagnosticsPath);
const metadataExportProjection = read(metadataExportProjectionPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

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

for (const token of [
  'OPERATIONAL.5 PRODUCTSYNCREADY READINESS DECISION AFTER LIVE PARITY - KEEP `productSyncReady:false` / NOT FLIPPED',
  '4f76cfbbc557f9898d6b8d2b9adf2b4e33e2564f',
  '52264289de23207b6db8a376f5b46dc1a127a766',
  '0291e55d75542a482a7ff3538e4d1733c4b0ec87',
  '90b633052ea86de3b192490f59482613a92eaa27',
  '640e6f3d2a365b53a50712d0dfa683463ef4ce0e',
  'h2o.studio.operational5.live-readonly-canonical-count-parity-diagnostic.v3',
  'classification.overall:"match-with-known-debt"',
  'mismatches:[]',
  'orphanBuckets:[]',
  'notExposed:[]',
  'requiresLiveFollowUp:[]',
  'knownDebt:["rawCanonicalDanglingBindingsFilteredFromExport"]',
  'Desktop raw canonical `folder_bindings` count: `14`',
  'exportable canonical binding subset count: `12`',
  '`fullBundle.v2` `canonicalChatFolderBindingProjection` count: `12`',
  'fullBundleV2BindingsVsExportableCanonical:"match"',
  'fullBundleV2RawBindingsDebtRecorded:"known-debt-recorded"',
  '`productSyncReady:false`',
  'It is **not** sufficient to flip global `productSyncReady`.',
  'source-of-truth cleanup debt',
  'two raw canonical dangling `folder_bindings` rows',
  'No product source edited.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  'cleanup/reconciliation debt preflight',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'PRODUCTSYNCREADY READY',
  'WebDAV/cloud/relay can start',
  'destructive cleanup performed',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim ${forbidden}`);
}

assertIncludes(op5Preflight, 'OPERATIONAL.5 SOURCE-OF-TRUTH / CANONICAL COUNT PARITY PREFLIGHT REQUIRED',
  'Operational.5 preflight verdict');
assertIncludes(op5Preflight, 'source-of-truth reconciliation not release-grade',
  'Operational.5 preflight source-of-truth gate');
assertIncludes(op5Preflight, 'canonical count parity not proven', 'Operational.5 preflight blocker');
assertIncludes(parityHarness, 'OPERATIONAL.5 CANONICAL COUNT/HASH PARITY READ-ONLY HARNESS IMPLEMENTED',
  'parity harness exists');
assertIncludes(liveDiagnostic, 'OPERATIONAL.5 LIVE READ-ONLY CANONICAL COUNT PARITY DIAGNOSTIC READY',
  'live diagnostic prep exists');
assertIncludes(fullBundleDiagnostic, 'OPERATIONAL.5 FULLBUNDLE.V2 READ-ONLY PROJECTION DIAGNOSTIC IMPLEMENTED',
  'fullBundle read-only projection diagnostic exists');
assertIncludes(mismatchInvestigation, 'OPERATIONAL.5 FULLBUNDLE.V2 BINDING COUNT MISMATCH CLASSIFIED',
  'mismatch investigation exists');
assertIncludes(mismatchInvestigation, 'expected export filtering that exposes canonical cleanup debt',
  'mismatch investigation classifies known debt');
assertIncludes(mismatchInvestigation, 'Raw canonical dangling rows remain reported separately',
  'mismatch investigation keeps raw debt visible');
assertIncludes(mismatchInvestigation, 'No destructive cleanup', 'mismatch investigation did not clean up');
assertIncludes(s14, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'S14 kept productSyncReady false');

assertIncludes(op5Gate, 'OPERATIONAL.5 productSyncReady FLIP-GATE - NOT FLIPPED',
  'Operational.5 original gate not flipped');
assertIncludes(op5Gate, 'folder-sync source-of-truth reconciled and release-grade',
  'Operational.5 gate source-of-truth requirement');
assertIncludes(op5Gate, 'canonical count parity proven', 'Operational.5 gate canonical parity requirement');
assertIncludes(op5Gate, 'Folder-sync source-of-truth reconciliation remains outstanding',
  'Operational.5 gate outstanding source-of-truth blocker');
assertIncludes(op5GateValidator, 'folder-sync-source-of-truth-reconciliation-not-release-grade',
  'Operational.5 validator source-of-truth blocker code');
assertIncludes(op5GateValidator, 'canonical-count-parity-not-yet-proven-for-flip',
  'Operational.5 validator canonical parity blocker code');

assertIncludes(liveDiagnostic, 'canonicalExportableBindingRows', 'live diagnostic exportable subset source');
assertIncludes(liveDiagnostic, 'canonicalMissingFolderBindingRows', 'live diagnostic missing-folder source');
assertIncludes(exportBundle, 'activeDanglingFolderBindingCount', 'fullBundle diagnostic dangling source');
assertIncludes(exportBundle, 'diagnoseFullBundleV2ReadonlyProjection', 'fullBundle read-only diagnostic source');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'binding hash gate retained');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable gate retained');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains no-write');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');

const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /fullBundle\.v3|h2o\.studio\.fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.doesNotMatch(runtimeCombined, /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');

const result = {
  schema: 'h2o.studio.operational5.product-sync-ready-readiness-decision-after-live-parity.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_PRODUCT_SYNC_READY_KEEP_FALSE_AFTER_LIVE_PARITY_WITH_KNOWN_DEBT',
  liveDiagnosticOverall: 'match-with-known-debt',
  rawCanonicalBindingCount: 14,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  knownDebt: ['rawCanonicalDanglingBindingsFilteredFromExport'],
  productSyncReadyDecision: 'keep-false',
  productSyncReadyFlipped: false,
  productSyncReadyFalseLiteralCount: productSyncReadyFalseCount,
  remainingBlocker: 'source-of-truth cleanup/reconciliation debt for two raw canonical dangling folder_bindings rows',
  nextSlice: 'cleanup-reconciliation-debt-preflight',
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-product-sync-ready-readiness-decision-after-live-parity');
