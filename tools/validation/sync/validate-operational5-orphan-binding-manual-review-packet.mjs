#!/usr/bin/env node
//
// Operational.5 - orphan-binding manual-review packet validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-manual-review-packet.md';
const blockerEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
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
const blockerEvidence = read(blockerEvidencePath);
const cleanupEvidence = read(cleanupEvidencePath);
const fixEvidence = read(fixEvidencePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 ORPHAN-BINDING MANUAL REVIEW PACKET RECORDED - CLEANUP APPLY BLOCKED',
  '9fdf2dab',
  '221d91b6',
  '9dd82fdf',
  '3f1bd667',
  '68/68',
  'candidateCount:2',
  'verifiedCount:0',
  'removedCount:0',
  'skippedCount:2',
  'skipped-not-fully-tombstone-verified',
  'row:a950a44b859f',
  'r:650c3cb39924',
  'r:0226fecaed5b',
  'row:fdd2456fc8a2',
  'r:2f29d39a6c4f',
  'r:2d5469848470',
  'Strict folder tombstone present | Strict folderBinding tombstone present',
  'Keep documented debt and keep `productSyncReady:false`',
  'Seek missing strict folder tombstone evidence',
  'Restore folder if legitimate recovery evidence exists',
  'Create a future reviewed tombstone-backed cleanup approval',
  'No-op/manual reject',
  'Broad text matching is explicitly rejected as cleanup proof',
  'operational5-orphan-binding-cleanup-apply',
  'No cleanup apply.',
  'No `productSyncReady` flip.',
  'No WebDAV/cloud/relay/`fullBundle.v3`.',
  'No Chat Saving WebDAV/cloud/archive CAS.',
  'No fallback.',
]) {
  assertIncludes(flat, token, `packet token ${token}`);
}

for (const forbidden of [
  'controlled cleanup apply was run',
  'cleanup apply completed',
  'cleanup apply approved',
  'productSyncReady flipped',
  'productSyncReady:true',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'rawChatId:',
  'rawFolderId:',
]) {
  assertNotIncludes(flat, forbidden, `packet forbidden claim ${forbidden}`);
}

assertIncludes(blockerEvidence, 'MANUAL-REVIEW BLOCKER RECORDED', 'blocker decision evidence retained');
assertIncludes(blockerEvidence, 'verifiedCount:0', 'blocker decision records verifiedCount 0');
assertIncludes(blockerEvidence, 'broad text matching not accepted as cleanup proof', 'blocker rejects broad matching');
assertIncludes(cleanupEvidence, 'operational5-orphan-binding-cleanup-apply', 'cleanup command gate evidence retained');
assertIncludes(fixEvidence, "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'strict verification fix evidence retained');

assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE = 'operational5-orphan-binding-cleanup-apply'",
  'cleanup apply gate source retained');
assertIncludes(foldersStore, 'async function operational5OrphanBindingCleanup(opts)', 'cleanup command source retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict verifier retained');
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'strict active tombstone lookup retained');

const runtimeCombined = [foldersStore, folderSync, folderImport, webdavGates].join('\n');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not be true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default retained');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');
assert.doesNotMatch(runtimeCombined,
  /allowF7Fallback\s*:\s*true|f15AllowF7Fallback\s*:\s*true|explicitF7Fallback\s*:\s*true/,
  'fallback flags must not be enabled');

const result = {
  schema: 'h2o.studio.operational5.orphan-binding-manual-review-packet.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_MANUAL_REVIEW_PACKET_RECORDED',
  cleanupApplyBlocked: true,
  rowCount: 2,
  verifiedCount: 0,
  packetTokensOnly: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  next: 'manual-operator-review-before-any-cleanup-or-restore-slice',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-manual-review-packet');
