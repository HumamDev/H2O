#!/usr/bin/env node
//
// Folder Sync - binding live dry-run proof after implementation validator.
//
// Static validator for the manually pasted Desktop Studio dry-run output. It records only fields present
// in the pasted live JSON and relies on the implementation/boundary validators for deeper safety coverage.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-live-dry-run-proof-after-implementation.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
const preflightEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-preflight-after-sortorder.md';
const readinessEvidencePath = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';
const s5EvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const archiveBoundaryValidatorPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

const LIVE_SCHEMA = 'h2o.studio.folder-sync.binding-live-dry-run-proof.v1';
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
  implementationEvidencePath,
  preflightEvidencePath,
  readinessEvidencePath,
  s5EvidencePath,
  folderSyncPath,
  foldersStorePath,
  folderImportPath,
  archiveBoundaryValidatorPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const implementationEvidence = read(implementationEvidencePath);
const preflightEvidence = read(preflightEvidencePath);
const readinessEvidence = read(readinessEvidencePath);
const s5Evidence = read(s5EvidencePath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const folderImport = read(folderImportPath);
const combinedSource = `${folderSync}\n${foldersStore}\n${folderImport}`;

for (const token of [
  'BINDING LIVE DRY-RUN PASSED',
  'd4d5db19',
  '6157a419',
  LIVE_SCHEMA,
  '"apiLoaded": true',
  '"requestSchemaPresent": true',
  '"applyGatePassed": false',
  '"applyTruePassed": false',
  '"status": "dry-run"',
  '"dryRun": true',
  '"canonicalBindingWriteCount": 0',
  '"mirrorWriteCount": 0',
  '"tombstoneWriteCount": 0',
  '"consumedOperationCount": 0',
  '"idempotencyPersisted": false',
  '"unchangedAfterDryRun": true',
  '"productSyncReady": false',
  '"webdavCloudRelay": "blocked"',
  '"chatSavingWebdavCloudArchiveCas": "blocked"',
  'live dry-run only, not live controlled apply',
  '`binding-mismatch` remains blocked',
  'binding controlled apply prep/proof',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}

assertIncludes(implementationEvidence, 'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN', 'implementation verdict');
assertIncludes(preflightEvidence, 'BINDING-MISMATCH REPAIR PREFLIGHT REQUIRED', 'binding preflight verdict');
assertIncludes(readinessEvidence, 'productSyncReady remains NOT READY after S5', 'readiness verdict');
assertIncludes(s5Evidence, 'S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED', 'S5 verdict');

assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '${REQUEST_SCHEMA}'`, 'binding request schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '${RECEIPT_SCHEMA}'`, 'binding receipt schema source');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'binding apply gate source');
assertIncludes(folderSync, 'bindingRepair: {', 'bindingRepair API source');
assertIncludes(folderSync, 'validate: validateChatFolderBindingRepairRequestForDesktopApply', 'binding validate API source');
assertIncludes(folderSync, 'apply: applyChatFolderBindingRepairRequest', 'binding apply API source');
assertIncludes(folderSync, 'bindingMismatchAllowed: false', 'binding-mismatch remains blocked in receipt');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch');
assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'sortOrder remains allowed after S5');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');

assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assert.doesNotMatch(combinedSource, /archiveCloud|archivePackage|archiveCas|cloudRelay/i,
  'WebDAV/cloud/archive CAS must not be introduced');

for (const forbidden of [
  'BINDING LIVE CONTROLLED APPLY PASSED',
  'applyGatePassed": true',
  'applyTruePassed": true',
  'productSyncReady": true',
  'webdavCloudRelay": "ready"',
  'chatSavingWebdavCloudArchiveCas": "ready"',
  'binding-mismatch is allowed',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-live-dry-run-proof-after-implementation.validator.v1',
  lane: 'folder-sync',
  phase: 'binding-live-dry-run-after-implementation',
  evidence: evidencePath,
  verdict: 'BINDING_LIVE_DRY_RUN_PASSED',
  implementationCommit: 'd4d5db19',
  preflightCommit: '6157a419',
  liveSchema: LIVE_SCHEMA,
  apiLoaded: true,
  requestSchemaPresent: true,
  applyGatePassed: false,
  applyTruePassed: false,
  dryRunStatus: 'dry-run',
  dryRun: true,
  canonicalBindingWriteCount: 0,
  mirrorWriteCount: 0,
  tombstoneWriteCount: 0,
  consumedOperationCount: 0,
  idempotencyPersisted: false,
  unchangedAfterDryRun: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
  nextGate: 'binding-controlled-apply-prep-proof',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-live-dry-run-proof-after-implementation');
