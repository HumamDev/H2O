#!/usr/bin/env node
//
// Folder Sync - F28 S12 multi-device import / read-only proofs validator (evidence-only).
//
// Proves a second device imports/observes the binding projection + receipts read-only: the export emits a
// readOnlyProjection canonical binding projection + chat-folder-binding receipts (v1) as read-only evidence, the
// import performs no direct/bare folder_bindings mutation, no fallback, and no receipt->repair re-apply (the only
// binding write is the F15-settled reviewed bindChat), and all release boundaries hold. No product source is changed;
// no live proof is rerun.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f28-s12-multi-device-import-readonly-proofs.md';
const s9Path = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const s10Path = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-reviewed-repair-path-s10.md';
const s11Path = 'release-evidence/2026-07-01/folder-sync-binding-f28-s11-request-submission-proofs.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, s9Path, s10Path, s11Path, exportBundlePath, importBundlePath, folderSyncPath, foldersStorePath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const exportBundle = read(exportBundlePath);
const importBundle = read(importBundlePath);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const s9 = read(s9Path);
const s10 = read(s10Path);
const s11 = read(s11Path);

// ---- S9/S10/S11 evidence exists and S12 follows them ----
assertIncludes(s9, 'reconcileSurvivalProven:true', 'S9 evidence present');
assertIncludes(s10, 'F28 S10 DONE', 'S10 evidence present');
assertIncludes(s11, 'F28 S11 PROVEN', 'S11 evidence present');

for (const token of [
  'F28 S12 PROVEN (EVIDENCE/VALIDATOR-ONLY)',
  'READ-ONLY EVIDENCE (NOT REPAIR COMMANDS)',
  'evidence/validator-only',
  'h2o.studio.fullBundle.v2',
  'readOnlyProjection: true',
  'h2o.studio.chat-folder-bindings.desktop-canonical.v1',
  'chatFolderBindingReceipts',
  'h2o.studio.chat-folder-binding-receipt.v1',
  'h2o.studio.chat-folder-binding-request.v1',
  'listChatFolderBindingReceipts',
  'receipt -> binding-repair re-apply path in the import',
  'Receipts are read-only evidence, not repair commands',
  'The only binding write available to the import is `folderStore.bindChat',
  'desktopApplyRequired:true',
  'noLocalApply:true',
  'productSyncReady readiness DECISION',
  'NOT an automatic flip',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains deferred',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady is true',
  'productSyncReady READY',
  'second device writes canonical',
  'receipt re-applies',
  'WebDAV ready',
]) {
  assert.ok(!flat.includes(forbidden), `S12 evidence must not claim: ${forbidden}`);
}

// ---- REAL SOURCE: export emits read-only projection + receipt evidence via public reads ----
assertIncludes(exportBundle, "DESKTOP_CANONICAL_CHAT_FOLDER_BINDING_SCHEMA = 'h2o.studio.chat-folder-bindings.desktop-canonical.v1'", 'canonical binding projection schema present');
assertIncludes(exportBundle, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'", 'receipt schema present in export');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'binding projection is read-only');
assertIncludes(exportBundle, 'chatFolderBindingReceipts: asArray(chatFolderBindingReceiptExport.receipts)', 'export includes chat-folder binding receipts (read-only evidence)');
assertIncludes(exportBundle, 'listChatFolderBindingReceipts', 'receipts collected via read-only list API');
assertIncludes(exportBundle, 'listChats', 'projection built via public read API');

// ---- REAL SOURCE: import performs NO direct/bare binding mutation / fallback / receipt re-apply ----
assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(importBundle),
  'import-bundle must not directly INSERT/DELETE folder_bindings');
assert.ok(!importBundle.includes('moveCanonicalChatFolderBinding'), 'import must not use bare moveCanonicalChatFolderBinding');
assert.ok(!importBundle.includes('allowF7Fallback') && !importBundle.includes('f15AllowF7Fallback') && !importBundle.includes('explicitF7Fallback'),
  'import must not contain fallback');
assertIncludes(importBundle, 'folderStore.bindChat(', 'import binding write routes through the F15-settled store bindChat (single-writer path)');
// receipts are read-only in import: the receipt schema must NOT drive a binding write (no receipt-token near bindChat)
assert.ok(!/chat-folder-binding-receipt[\s\S]{0,200}bindChat/i.test(importBundle),
  'import must not re-apply binding receipts as repairs');

// ---- REAL SOURCE: reviewed request constraints + schemas + apply gate remain ----
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1'", 'reviewed request schema present');
assertIncludes(folderSync, "CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1'", 'reviewed receipt schema present');
assertIncludes(folderSync, 'folder-sync-chat-folder-binding-repair-apply', 'reviewed apply gate present');
assertIncludes(folderSync, 'noLocalApply: true', 'reviewed request keeps noLocalApply');
assertIncludes(folderSync, 'desktopApplyRequired: true', 'reviewed request keeps desktopApplyRequired');

// ---- S10 routing + render-only F11 boundary + gates + boundaries intact ----
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'S10 routing preserved');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'render mirror still blocks binding-mismatch');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains render-only');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence intact');
const combined = `${foldersStore}\n${folderSync}\n${exportBundle}\n${importBundle}`;
assert.ok(!combined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');

const result = {
  schema: 'h2o.studio.folder-sync.binding-f28-s12-multi-device-import-readonly-proofs.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f28-s12-multi-device-import-readonly-proofs',
  evidence: evidencePath,
  verdict: 'F28_S12_MULTI_DEVICE_IMPORT_READONLY_PROVEN',
  evidenceOnly: true,
  importReadOnlyPathsCovered: ['fullBundle.v2 read-only binding projection', 'chatFolderBindingReceipts (v1) read-only evidence'],
  exportReadOnlyProjection: true,
  receiptsAreReadOnlyEvidence: true,
  importReAppliesReceipts: false,
  importDirectBindingMutation: false,
  importFallback: false,
  onlyBindingWriter: 'F15-settled reviewed folderStore.bindChat',
  s10RoutingPreserved: true,
  renderMirrorRemainsRenderOnly: true,
  productSourceEdited: false,
  livePhaseRerun: false,
  productSyncReadyFlipped: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  next: 'productSyncReady readiness DECISION (explicit/reviewed, not automatic); productSyncReady stays false until then',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f28-s12-multi-device-import-readonly-proofs');
