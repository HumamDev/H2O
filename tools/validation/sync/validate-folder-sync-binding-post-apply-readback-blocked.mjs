#!/usr/bin/env node
//
// Folder Sync - binding post-apply readback blocked validator.
//
// Static validator for the live Desktop readback diagnostic that failed to confirm binding persistence after
// the controlled apply proof. It intentionally blocks binding allowed-set flip and product readiness.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-post-apply-readback-blocked.md';
const controlledApplyEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-controlled-apply-proof.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const archiveBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

const CONTROLLED_APPLY_COMMIT = '5c89ba95';
const IMPLEMENTATION_COMMIT = 'd4d5db19';
const READBACK_SCHEMA = 'h2o.studio.folder-sync.binding-post-apply-readback-idempotency.v1';
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';

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
  controlledApplyEvidencePath,
  implementationEvidencePath,
  folderSyncPath,
  foldersStorePath,
  folderImportPath,
  archiveBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const controlledApplyEvidence = read(controlledApplyEvidencePath);
const implementationEvidence = read(implementationEvidencePath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const combinedSource = `${folderSync}\n${foldersStore}\n${folderImport}`;

for (const token of [
  'BINDING POST-APPLY READBACK BLOCKED',
  'PERSISTENCE NOT CONFIRMED',
  CONTROLLED_APPLY_COMMIT,
  IMPLEMENTATION_COMMIT,
  READBACK_SCHEMA,
  `"currentBindingHash": "${OLD_HASH}"`,
  `"recomputedBindingHash": "${OLD_HASH}"`,
  REQUESTED_HASH,
  '"postApplyMatchesRequested": false',
  '"beforeHashNoLongerCurrent": false',
  '"consumedLedgerAvailable": true',
  '"consumedBindingRepairRowCount": 1',
  '"consumedRecordPresent": true',
  '"duplicateReplayAttempted": false',
  '"duplicateReplayReason": "raw-binding-idempotency-key-not-captured"',
  '"applyGatePassed": false',
  '"applyTruePassed": false',
  '"semanticBindingWriteAttempted": false',
  '"bindingMismatchStillBlocked": true',
  '"productSyncReady": false',
  '"webdavCloudRelay": "blocked"',
  '"chatSavingWebdavCloudArchiveCas": "blocked"',
  'No new apply/write happened in this diagnostic',
  'Binding allowed-set flip is blocked',
  'read-only binding state-source diagnostic',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(controlledApplyEvidence, 'BINDING CONTROLLED APPLY PASSED', 'controlled apply evidence verdict');
assertIncludes(controlledApplyEvidence, '"controlledApplyReceipt"', 'controlled apply receipt');
assertIncludes(controlledApplyEvidence, '"status": "applied"', 'controlled apply applied status');
assertIncludes(controlledApplyEvidence, '"canonicalBindingWriteCount": 1', 'controlled apply write count');
assertIncludes(controlledApplyEvidence, '"idempotencyPersisted": true', 'controlled apply idempotency persisted');
assertIncludes(implementationEvidence, 'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN', 'implementation verdict');

assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '${REQUEST_SCHEMA}'`, 'binding request schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '${RECEIPT_SCHEMA}'`, 'binding receipt schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'binding apply gate source');
assertIncludes(folderSync, 'bindingRepair: {', 'bindingRepair API export');
assertIncludes(folderSync, 'bindingMismatchAllowed: false', 'binding mismatch remains blocked in receipt');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV remains deferred in Chrome import');

assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assert.doesNotMatch(combinedSource, /archiveCloud|archivePackage|archiveCas|cloudRelay/i,
  'WebDAV/cloud/archive CAS must not be introduced');

for (const forbidden of [
  'BINDING POST-APPLY READBACK PASSED',
  'BINDING ALLOWED-SET FLIP PASSED',
  'binding-mismatch is allowed',
  '"productSyncReady": true',
  '"webdavCloudRelay": "ready"',
  '"chatSavingWebdavCloudArchiveCas": "ready"',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-post-apply-readback-blocked.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-post-apply-readback',
  evidence: evidencePath,
  verdict: 'BINDING_POST_APPLY_READBACK_BLOCKED',
  controlledApplyProofCommit: CONTROLLED_APPLY_COMMIT,
  implementationCommit: IMPLEMENTATION_COMMIT,
  currentBindingHash: OLD_HASH,
  requestedAppliedHash: REQUESTED_HASH,
  postApplyMatchesRequested: false,
  beforeHashNoLongerCurrent: false,
  consumedRecordPresent: true,
  duplicateReplayAttempted: false,
  applyGatePassed: false,
  applyTruePassed: false,
  semanticBindingWriteAttempted: false,
  bindingMismatchStillBlocked: true,
  bindingAllowedSetFlipBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'read-only binding state-source diagnostic',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-post-apply-readback-blocked');
