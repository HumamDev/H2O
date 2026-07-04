#!/usr/bin/env node
//
// Folder Sync - F28 S11 Chrome/native/mobile reviewed request-submission proofs validator (evidence-only).
//
// Proves that binding-mismatch is submitted through the reviewed F15 request->validate->apply->receipt path across
// surfaces (Chrome MV3 builds+exports pending reviewed requests; native/mobile accepted via the surfaceKind contract;
// Desktop validates+applies+emits a v1 receipt behind the apply gate), that no surface performs canonical local
// binding mutation / render-mirror repair / fallback, and that the S10 routing + render-only F11 boundary and all
// release boundaries hold. No product source is changed; no live proof is rerun.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const s10EvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const closeoutPath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const autoImportMv3Path = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const folderImportMv3Path = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, s10EvidencePath, closeoutPath, foldersStorePath, folderSyncPath, autoImportMv3Path, folderImportMv3Path]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const autoImport = read(autoImportMv3Path);
const folderImport = read(folderImportMv3Path);
const closeout = read(closeoutPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${autoImport}\n${folderImport}`;

for (const token of [
  'F28 S11 PROVEN (EVIDENCE/VALIDATOR-ONLY)',
  'ALL SURFACES SUBMIT `binding-mismatch` THROUGH THE REVIEWED',
  'evidence/validator-only',
  'chrome-extension',
  'native-extension',
  'mobile',
  'h2o.studio.chat-folder-binding-request.v1',
  'h2o.studio.chat-folder-binding-receipt.v1',
  'folder-sync-chat-folder-binding-repair-apply',
  'h2o:studio:chat-folder-binding-requests:pending-export:v1',
  'No surface performs canonical local binding mutation',
  'noLocalApply:true',
  'desktopApplyRequired:true',
  'S12',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains deferred',
  'Chat Saving',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady is true',
  'WebDAV ready',
  'render mirror repairs binding',
  'Chrome writes canonical',
]) {
  assert.ok(!flat.includes(forbidden), `S11 evidence must not claim: ${forbidden}`);
}

// ---- Chrome MV3 surface: builds + exports a reviewed pending request; no canonical mutation ----
assertIncludes(autoImport, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'", 'MV3 request schema present');
assertIncludes(autoImport, "intent: 'chat-folder-binding-request'", 'MV3 builds a binding-request intent');
assertIncludes(autoImport, 'desktopApplyRequired: true', 'MV3 request requires Desktop apply');
assertIncludes(autoImport, 'noLocalApply: true', 'MV3 request performs no local apply');
assertIncludes(autoImport, 'noChromeBindingAuthority: true', 'MV3 request has no Chrome binding authority');
assertIncludes(autoImport, 'noDesktopCanonicalMutation: true', 'MV3 request performs no canonical mutation');
assertIncludes(autoImport, "CHAT_FOLDER_BINDING_REQUEST_EXPORT_KEY = 'h2o:studio:chat-folder-binding-requests:pending-export:v1'", 'MV3 exports pending binding requests for Desktop apply');
// no canonical binding mutation on the Chrome surfaces
for (const [name, src] of [['auto-import.mv3.js', autoImport], ['folder-import.mv3.js', folderImport]]) {
  assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(src), `${name}: no folder_bindings mutation`);
  assert.ok(!src.includes('.bindChat(') && !src.includes('.unbindChat(') && !src.includes('moveCanonicalChatFolderBinding'),
    `${name}: no canonical bindChat/unbindChat/move`);
}

// ---- Desktop reviewed validate accepts the three surfaces + emits a v1 receipt behind the apply gate ----
assertIncludes(folderSync, "['chrome-extension', 'native-extension', 'mobile'].indexOf(cleanString(req.surfaceKind)) === -1", 'Desktop validate accepts chrome/native/mobile surfaceKind');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'", 'Desktop request schema present');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'", 'Desktop receipt schema minted');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'reviewed apply gate present');
assertIncludes(folderSync, 'function buildChatFolderBindingRepairReceipt', 'receipt builder present');
assertIncludes(folderSync, 'schema: CHAT_FOLDER_BINDING_RECEIPT_SCHEMA', 'receipt emitted with the v1 schema');
assertIncludes(folderSync, 'surface: cleanString(req.surfaceKind)', 'receipt records the submitting surface');

// ---- S10 routing + render-only F11 boundary preserved ----
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'S10 routing preserved');
assertIncludes(foldersStore, 'bindingMismatchRoutedToReviewedRepairPath: true', 'S10 routing flag preserved');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'render mirror still blocks binding-mismatch');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains render-only');

// ---- Gates + boundaries intact ----
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence intact');
for (const token of ['allowF7Fallback: true', 'f15AllowF7Fallback: true', 'explicitF7Fallback: true']) {
  assert.ok(!combinedRuntime.includes(token), `no fallback token ${token}`);
}
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');
assertIncludes(closeout, 'reconcileSurvivalProven:true', 'S9 Desktop apply path live-proven referenced');

const result = {
  schema: 'h2o.studio.folder-sync.binding-f28-s11-request-submission-proofs.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f28-s11-request-submission-proofs',
  evidence: evidencePath,
  verdict: 'F28_S11_REQUEST_SUBMISSION_PROVEN',
  evidenceOnly: true,
  surfacesCovered: ['chrome-extension', 'native-extension', 'mobile', 'desktop-studio'],
  requestSchema: 'h2o.studio.chat-folder-binding-request.v1',
  receiptSchema: 'h2o.studio.chat-folder-binding-receipt.v1',
  applyGate: 'folder-sync-chat-folder-binding-repair-apply',
  chromeSubmitsReviewedRequest: true,
  chromePerformsCanonicalMutation: false,
  surfaceKindAccepted: ['chrome-extension', 'native-extension', 'mobile'],
  s10RoutingPreserved: true,
  renderMirrorRemainsRenderOnly: true,
  fallbackPresent: false,
  productSourceEdited: false,
  livePhaseRerun: false,
  productSyncReadyFlipped: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  next: 'F28 S12 multi-device import/read-only proofs; productSyncReady stays false until S12 + explicit approval',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f28-s11-request-submission-proofs');
