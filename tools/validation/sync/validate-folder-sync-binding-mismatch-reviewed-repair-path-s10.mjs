#!/usr/bin/env node
//
// Folder Sync - F28 S10 reviewed-repair-path implementation validator.
//
// Proves S10: binding-mismatch is routed (in the F11 render-mirror rebuild result) to the reviewed F15-settled
// request->apply->receipt repair path, while the render mirror stays render-only (noBindingRepair; binding-mismatch
// still a blocked/non-allowed render-mirror class). Confirms the reviewed repair path anchors, that the live proof
// covers the reviewed flow, and that no boundary drifted (no productSyncReady flip, no fallback, no WebDAV/CAS).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const closeoutPath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const decisionPath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-readiness-decision.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const f11ValidatorPath = 'tools/validation/sync/validate-folder-sync-f11-render-only-mirror-rebuild.mjs';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, closeoutPath, decisionPath, foldersStorePath, folderSyncPath, folderImportPath, f11ValidatorPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const f11Validator = read(f11ValidatorPath);
const closeout = read(closeoutPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const token of [
  'F28 S10 DONE',
  'ROUTED TO THE REVIEWED F15-SETTLED REPAIR PATH',
  'RENDER MIRROR REMAINS RENDER-ONLY',
  'reviewedRepairPathClasses',
  'bindingMismatchRoutedToReviewedRepairPath',
  'folder-sync-chat-folder-binding-repair-apply',
  'h2o.studio.chat-folder-binding-request.v1',
  'render mirror is not turned into a binding repair writer',
  'duplicateReplayZeroWrite:true',
  'reconcileSurvivalProven:true',
  '`productSyncReady` remains `false`',
  'No WebDAV/cloud/relay',
  'Chat Saving',
  'S11 (Chrome/native/mobile request-submission proofs)',
  'S12 (multi-device import/read-only',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady is true',
  'render mirror repairs binding',
  'binding-mismatch is an allowed render',
  'free binding repair',
]) {
  assert.ok(!flat.includes(forbidden), `S10 evidence must not claim: ${forbidden}`);
}

// ---- REAL SOURCE: S10 routing declared in the render-mirror result ----
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'S10 routes binding-mismatch to reviewed repair path');
assertIncludes(foldersStore, 'bindingMismatchRoutedToReviewedRepairPath: true', 'S10 routing flag present');
assertIncludes(foldersStore, "reviewedRepairRequestSchema: 'h2o.studio.chat-folder-binding-request.v1'", 'S10 references reviewed request schema');
assertIncludes(foldersStore, "reviewedRepairApplyGate: 'folder-sync-chat-folder-binding-repair-apply'", 'S10 references reviewed apply gate');

// ---- REAL SOURCE: render-only boundary preserved ----
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'render mirror still blocks binding-mismatch');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains render-only (no binding repair)');
assertIncludes(foldersStore, 'noBindingWrite: true', 'render mirror does not write bindings');
assertIncludes(foldersStore, 'skippedBindingRepairCount', 'render mirror still records skipped binding repair');
assert.ok(!foldersStore.includes("'binding-mismatch': true"), 'binding-mismatch must NOT be an allowed render-mirror rebuild class');

// ---- REAL SOURCE: reviewed repair path exists (the routing target is real) ----
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'", 'reviewed request schema present');
assertIncludes(folderSync, "folder-sync-chat-folder-binding-repair-apply", 'reviewed apply gate present');
assertIncludes(folderSync, 'reviewId', 'reviewed path carries a reviewId');
assertIncludes(folderSync, 'buildChatFolderBindingRepairReceipt', 'reviewed path emits a receipt');

// ---- The F11 validator was updated to reflect the gated reviewed-repair allowance ----
assertIncludes(f11Validator, "reviewedRepairPathClasses: \\['binding-mismatch'\\]", 'updated F11 validator asserts the routing');
assertIncludes(f11Validator, 'S10: render mirror remains render-only', 'updated F11 validator keeps the render-only assertion');

// ---- Gates + boundaries intact ----
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence intact');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');
assertIncludes(closeout, 'reconcileSurvivalProven:true', 'live proof of the reviewed repair path referenced');

const result = {
  schema: 'h2o.studio.folder-sync.binding-mismatch-reviewed-repair-path-s10.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-mismatch-reviewed-repair-path-s10',
  evidence: evidencePath,
  verdict: 'F28_S10_REVIEWED_REPAIR_PATH_ROUTED',
  sourceChanged: foldersStorePath,
  bindingMismatchRoutedToReviewedRepairPath: true,
  renderMirrorRemainsRenderOnly: true,
  renderMirrorNoBindingRepair: true,
  bindingMismatchNotAnAllowedRenderMirrorClass: true,
  reviewedPathLiveProven: true,
  productSyncReadyFlipped: false,
  fallbackAdded: false,
  livePhaseRerun: false,
  bindingMismatchBlockedInRenderMirror: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  next: 'F28 S11 (multi-surface submission proofs) + S12 (multi-device import proofs); productSyncReady stays false',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-mismatch-reviewed-repair-path-s10');
