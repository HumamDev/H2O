#!/usr/bin/env node
//
// Folder Sync - binding-mismatch / productSyncReady readiness decision validator (evidence-only).
//
// Verifies the evidence-only readiness decision after the F15 live restart-survival closeout: binding repair
// readiness is met (F28 S9 complete), but this slice keeps binding-mismatch blocked and productSyncReady false
// (F28 S10 is the next reviewed slice; S11/S12 multi-surface/multi-device proofs gate any flip). Confirms no product
// source flip happened and all boundaries hold. No product source edited; no live proof rerun.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-readiness-decision.md';
const closeoutPath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';
const recheckPath = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';
const f28Path = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, closeoutPath, recheckPath, f28Path, foldersStorePath, folderSyncPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const closeout = read(closeoutPath);
const recheck = read(recheckPath);
const f28 = read(f28Path);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const token of [
  'BINDING REPAIR READINESS MET (S9 COMPLETE)',
  'KEEP `binding-mismatch` BLOCKED AND `productSyncReady` FALSE THIS',
  'evidence-only local readiness decision',
  'No product source was edited',
  // decision
  'Not C (do not flip `productSyncReady`)',
  'Not B in this slice',
  'S10 reviewed allowed-set slice',
  'no flip until multi-surface proofs land',
  // cleared blockers
  'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA',
  'restart convergence live-proven',
  'duplicate replay zero-write',
  // remaining
  'Chrome/native/mobile request-submission proofs',
  'multi-device import/read-only proofs',
  // Q5 identified not executed
  "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'is not done in this decision slice',
  // boundaries
  '`binding-mismatch` remains blocked in F11',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// evidence must not over-claim
for (const forbidden of [
  'productSyncReady is true',
  'productSyncReady READY',
  'binding-mismatch is allowed',
  'flip productSyncReady now',
  'WebDAV ready',
]) {
  assert.ok(!flat.includes(forbidden), `decision must not claim: ${forbidden}`);
}

// ---- F28 authoritative sequence anchors ----
assertIncludes(f28, 'no flip until multi-surface proofs land', 'F28 S10 no-flip boundary present');
assertIncludes(f28, 'move `binding-mismatch` into the reviewed repair path', 'F28 S10 step present');
assertIncludes(recheck, 'productSyncReady remains NOT READY', 'recheck verdict remains NOT READY');

// ---- REAL SOURCE: no flip happened; binding-mismatch still blocked; boundaries intact ----
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch (no allowed-set flip this slice)');
assertIncludes(foldersStore, 'noBindingRepair: true', 'F11 render mirror remains render-only (no binding repair)');
assert.ok(!foldersStore.includes("classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
  'sortOrder must remain cleared from the blocked-set (S5)');
assertIncludes(folderSync, 'CHAT_FOLDER_BINDING_RECEIPT_SCHEMA', 'binding repair receipt schema minted (S6 cleared)');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite intact');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- closeout prerequisite (S9) is referenced ----
assertIncludes(closeout, 'reconcileSurvivalProven:true', 'closeout proves restart survival (S9)');

const result = {
  schema: 'h2o.studio.folder-sync.binding-mismatch-readiness-decision.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-mismatch-readiness-decision',
  evidence: evidencePath,
  verdict: 'BINDING_REPAIR_READINESS_MET_S9_COMPLETE',
  decision: 'evidence-only; keep binding-mismatch blocked; keep productSyncReady false',
  bindingRepairReadinessMet: true,
  s9Complete: true,
  nextStep: 'F28 S10 reviewed allowed-set slice (move binding-mismatch into the reviewed repair path)',
  productSyncReadyFlipped: false,
  bindingMismatchMovedToAllowedSet: false,
  productSourceEdited: false,
  webdavCloudRelayStarted: false,
  chatSavingCasTouched: false,
  productSyncReadyFlipGatedBy: ['S10', 'S11-multi-surface-submission-proofs', 'S12-multi-device-import-proofs'],
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-mismatch-readiness-decision');
