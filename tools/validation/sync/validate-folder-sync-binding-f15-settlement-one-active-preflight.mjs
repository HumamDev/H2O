#!/usr/bin/env node
//
// Folder Sync - F15 settlement one-active-per-chat projection fix preflight validator (design-only).
//
// Static validator for the design-only preflight that root-causes the live Phase A settlement
// `binding-one-active-per-chat` block after e6a91051 and plans the planned-transition projection fix. It proves the
// evidence records the source-grounded root cause (move is decomposed; F15 settlement journals rather than materializes
// the folder_bindings delete, so the bind-half's fresh read still sees the move's source edge), the minimal single-file
// projection approach, required validators/evidence, live-retry conditions, and NO-GO conditions. It anchors the design
// against REAL, STABLE source symbols and confirms every release/safety boundary still holds. No source fix, no live
// apply, no Phase A/B.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-one-active-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['ff3ccd44', '0b015cc7', '501635ae', '0833d4a1', '8b5e13d0', '08527e9d', 'e6a91051'];

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
  foldersStorePath,
  folderSyncPath,
  settlementWriterPath,
  conflictRuntimePath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'BINDING F15 SETTLEMENT ONE-ACTIVE PROJECTION FIX DESIGN APPROVED',
  'design-only preflight',
  // live result
  'library-binding-cross-install-state-conflict',
  'binding-one-active-per-chat',
  'library-conflict-refresh-required',
  'receipt-preview-only',
  'contextMissing:false',
  // root cause
  'decomposed into unbind + bind',
  'delegateF15FolderBindingWrite',
  'previousFolderId',
  'appendJournal',
  'synchronously mutate `folder_bindings`',
  'listCanonicalChatFolderBindingsForChat(chatId)',
  'buildF15SettlementExistingBindingContext',
  'existingBindings: settlementExistingBindings',
  'not a split-source bug',
  // design answers
  'post-planned-transition',
  'chat -> previousFolder',
  'plannedUnbindFolderId',
  "hashLegacyEndpoint('folder.metadata', plannedUnbindFolderId)",
  'fabricate empty context',
  'Not C (settle unbind before bind)',
  'Not D (dedicated combined settled-rebind)',
  'replacement must remain independent unbind plus bind',
  'src-surfaces-base/studio/store/folders.tauri.js` only',
  // validators + evidence
  'One-active projection implementation validator',
  'Rebind torn-write recovery validator',
  // live retry conditions
  'settlement.ok:true',
  'f15Delegation.ok:true',
  'controlledApply.status:"applied"',
  'No Phase B until Phase A passes',
  // NO-GO
  'Any F15 blocker',
  'A true duplicate edge or a true one-active conflict NOT blocking',
  // boundaries
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: decomposition + current settlement context threading (e6a91051) ----
assertIncludes(foldersStore, 'function runF15FolderBindingDelegationPipeline', 'pipeline exists');
assertIncludes(foldersStore, 'async function buildF15SettlementExistingBindingContext', 'settlement context helper exists');
assertIncludes(foldersStore, 'existingBindings: settlementExistingBindings', 'existingBindings already threaded into settle args');
assertIncludes(foldersStore, "delegateF15FolderBindingWrite('unbind'", 'move/rebind decomposition present');
assertIncludes(foldersStore, 'var previousFolderId = previous && getFolderId(previous)', 'decomposition computes previousFolderId (reusable for projection)');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat', 'settlement context uses canonical per-chat read');
assertIncludes(foldersStore, "hashLegacyEndpoint('folder.metadata', folderId)", 'context builder already hashes folder endpoints');
assertIncludes(foldersStore, "dispatchStatus: 'confirmed'", 'pipeline supplies a simulated confirmed dispatch (execute is preview/receipt)');

// ---- REAL SOURCE anchors: settlement journals rather than mutating folder_bindings ----
assertIncludes(settlementWriter, 'async function appendJournal', 'settlement journals a settled row');
assertIncludes(settlementWriter, 'sideEffects.nativeCalled = false', 'settlement apply does not call native');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement requireContext must remain');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'existingBindings')", 'settlement reads existingBindings from args');
// The settlement writer must not perform a direct folder_bindings mutation (it journals instead).
assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(settlementWriter),
  'settlement writer must not directly mutate folder_bindings (confirms journal-not-materialize root cause)');

// ---- REAL SOURCE anchors: conflict runtime rules the design must not weaken ----
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active-per-chat rule present');
assertIncludes(conflictRuntime, 'library-binding-cross-install-state-conflict', 'one-active conflict code present');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'move/replace blocker present');
assertIncludes(conflictRuntime, 'replacement must remain independent unbind plus bind', 'combined move op blocked by runtime');
assertIncludes(conflictRuntime, 'function supplied', 'presence-only supplied helper present');
assertIncludes(conflictRuntime, "supplied(ctx.input, 'existingBindings')", 'existing bindings presence check present');

// ---- REAL SOURCE anchors: repair handler safety invariants intact ----
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair still routes through F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate present');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'repair must not set explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'repair must not set allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'repair must not set f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('),
  'repair handler must not call bare moveCanonicalChatFolderBinding');

// ---- REAL SOURCE anchors: readiness boundaries ----
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked in source');
assertIncludes(foldersStore, 'parsed.busy === 1', 'busy-aware fence remains');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- design must remain design-only (no premature success/impl claims) ----
for (const forbidden of [
  'ONE-ACTIVE PROJECTION FIX IMPLEMENTED',
  'Phase A passed',
  'Phase B passed',
  'one-active protection removed',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-one-active-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-one-active-preflight',
  evidence: evidencePath,
  priorContextFixCommit: 'e6a91051',
  liveSettlementBlocker: 'library-binding-cross-install-state-conflict',
  liveConflictRule: 'binding-one-active-per-chat',
  rootCause: 'move decomposed to unbind+bind; F15 settlement journals (appendJournal) but does not synchronously materialize the folder_bindings delete, so the bind-half fresh read still sees chat->previousFolder and one-active-per-chat fires',
  approach: 'planned-transition projection: exclude the exact chat->previousFolder edge from bind-half settlement existingBindings; folders.tauri.js only',
  filesLikelyToChange: [foldersStorePath],
  keepDecomposition: true,
  combinedMoveOpRejected: true,
  settlementWriterUnchanged: true,
  conflictRuntimeUnchanged: true,
  requireContextPreserved: true,
  fabricatesEmptyContext: false,
  designOnly: true,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'implement single-file planned-unbind projection + 2 validators + implementation evidence, run battery, independent review before live Phase A retry',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settlement-one-active-preflight');
