#!/usr/bin/env node
//
// Folder Sync - F15 settlement materialization fix preflight validator (design-only).
//
// Static validator for the design-only preflight that root-causes the live Phase A `post-apply-binding-hash-mismatch`
// after bb4675dc and plans the settled-materialization fix. It proves the evidence records the source-grounded root
// cause (F15 settles + journals but never materializes the canonical folder_bindings row; no native/Rust/reconcile
// materializer exists; canonicalBindingWriteCount counts delegation success), the minimal single-file approach,
// required validators/evidence, live-retry conditions, and NO-GO conditions. It anchors the design against REAL,
// STABLE source symbols and confirms every release/safety boundary still holds. No source fix, no live apply,
// no Phase A/B.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-materialization-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['e6a91051', 'b260da0f', 'bb4675dc'];

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
  rustLibPath,
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
const rustLib = read(rustLibPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'BINDING F15 SETTLEMENT MATERIALIZATION FIX DESIGN APPROVED',
  'design-only preflight',
  // live result
  'controlledApply.reason:"post-apply-binding-hash-mismatch"',
  'controlledApply.canonicalBindingWriteCount:1',
  'immediateReadbackMatchesRequested:false',
  'durableGate.durable:true',
  // root cause
  'never materializes the canonical Desktop',
  "recordWrite('bindChat.f15')",
  'moveCanonicalChatFolderBinding',
  'INSERT OR REPLACE INTO folder_bindings',
  'appendJournal',
  'appendExecuteJournalRow',
  'no native/Rust materializer',
  'h2o_library_binding_bind_chat_folder_apply',
  'execute-resume-on-boot',
  'counts delegation success, not a row mutation',
  'writeCount = writeOk ? 1 : 0',
  // design answers
  'JS/`plugin:sql`-materialized',
  'settled materialization',
  'expectedCurrentFolderId',
  'chat_id` PRIMARY KEY',
  'materializeSettledCanonicalChatFolderBinding',
  'bindingRepairAlreadyConsumed(request)',
  'src-surfaces-base/studio/store/folders.tauri.js` only',
  // validators + evidence
  'Settled-materialization implementation validator',
  'node:sqlite` harness',
  'folder-sync-binding-f15-settlement-materialization-implementation.md',
  // live retry conditions
  'afterBindingHash` equals `requestedBindingHash`',
  'immediateReadbackMatchesRequested:true',
  'controlledApply.status:"applied"',
  'No Phase B until Phase A passes',
  // NO-GO
  'Any bypass, move, or weakening of `post-apply-binding-hash-mismatch`',
  'Rust edits (Rust is not the canonical materializer)',
  'Silent divergence between the settled journal and `folder_bindings`',
  // boundaries
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: F15 write path has no folder_bindings mutation; canonical writers exist ----
assertIncludes(foldersStore, "recordWrite('bindChat.f15')", 'F15 bind branch present (returns on delegation ok)');
assertIncludes(foldersStore, 'function moveCanonicalChatFolderBinding', 'JS canonical writer exists (candidate materializer)');
assertIncludes(foldersStore, 'INSERT OR REPLACE INTO folder_bindings', 'canonical INSERT writer exists in store');
assertIncludes(foldersStore, 'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?', 'canonical DELETE writer exists in store');
assertIncludes(foldersStore, 'function delegateF15FolderBindingWrite', 'F15 delegation present');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat', 'canonical per-chat read exists (readback source)');

// ---- REAL SOURCE anchors: handler counts delegation success, gates, and dedups ----
assertIncludes(folderSync, 'writeCount = writeOk ? 1 : 0', 'writeCount counts bindChat success (delegation), not a row mutation');
assertIncludes(folderSync, 'canonicalBindingWriteCount: writeCount', 'handler reports writeCount as canonicalBindingWriteCount');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate present');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'early idempotency precheck present (duplicate-replay zero-write)');
assertIncludes(folderSync, 'await bindingRepairRecordConsumed(request)', 'ledger consume present');
assertIncludes(folderSync, 'expectedCurrentFolderId: previousFolderId || currentFolderId',
  'writeOpts already carries the settled edge for materialization');
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair routes through F15 delegation');

// gate ordering: post-apply hash mismatch before ledger consume.
const hashGateIndex = folderSync.indexOf('post-apply-binding-hash-mismatch');
const ledgerConsumeIndex = folderSync.indexOf('await bindingRepairRecordConsumed(request)');
assert.ok(hashGateIndex !== -1 && ledgerConsumeIndex !== -1 && hashGateIndex < ledgerConsumeIndex,
  'post-apply hash mismatch gate must remain before consumed ledger write');

// ---- REAL SOURCE anchors: settlement journals rather than materializing folder_bindings ----
assertIncludes(settlementWriter, 'async function appendJournal', 'settlement journals a settled row');
assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(settlementWriter),
  'settlement writer must not directly mutate folder_bindings (confirms journal-not-materialize root cause)');

// ---- REAL SOURCE anchors: Rust is NOT the materializer (table + guard only) ----
assertIncludes(rustLib, 'CREATE TABLE folder_bindings', 'lib.rs defines folder_bindings table');
assertIncludes(rustLib, 'f16_folder_bindings_trigger_guard', 'lib.rs defines the f16 guard (not a materializer)');

// ---- REAL SOURCE anchors: conflict runtime unchanged and strict ----
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active rule present');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'replacement blocker present');

// ---- REAL SOURCE anchors: repair handler safety invariants intact ----
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
  'MATERIALIZATION FIX IMPLEMENTED',
  'Phase A passed',
  'Phase B passed',
  'post-apply-binding-hash-mismatch bypassed',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-materialization-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-materialization-preflight',
  evidence: evidencePath,
  priorProjectionImplementationCommit: 'bb4675dc',
  liveBlocker: 'post-apply-binding-hash-mismatch',
  rootCause: 'F15 bindChat/unbindChat settles+journals (appendExecuteJournalRow) but never materializes the canonical folder_bindings row; no native/Rust/reconcile materializer exists; canonicalBindingWriteCount counts bindChat/delegation success',
  rustIsMaterializer: false,
  existingReconcileMaterializer: false,
  approach: 'settled materialization in folders.tauri.js F15 bindChat/unbindChat path after delegation success, via existing JS canonical writer (INSERT OR REPLACE / DELETE), before handler readback + hash gate',
  filesLikelyToChange: [foldersStorePath],
  hashGatePreserved: true,
  durableGatePreserved: true,
  duplicateReplayHandledByExistingPrecheck: true,
  designOnly: true,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'implement single-file settled materialization + validator + implementation evidence, run battery, independent review before live Phase A retry',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settlement-materialization-preflight');
