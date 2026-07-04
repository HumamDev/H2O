#!/usr/bin/env node
//
// Folder Sync - F15 settlement conflict-runtime context fix preflight validator (design-only).
//
// Static validator for the design-only preflight that plans the fix for the settlement context gap recorded in
// 8b5e13d0. It proves the evidence records the root cause, the minimal single-file approach (thread a freshly-read
// hashed existing-binding context into the settle args), the rebind decision (keep decomposed unbind+bind; a combined
// move op is blocked by the conflict runtime), required validators/evidence, live-retry conditions, and NO-GO
// conditions. It anchors the design against REAL, STABLE source symbols so the plan is grounded, and confirms every
// release/safety boundary still holds. No source fix, no live apply, no Phase A/B.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-context-fix-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['ff3ccd44', '0b015cc7', '501635ae', '0833d4a1', '8b5e13d0'];

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
  'BINDING F15 SETTLEMENT CONTEXT FIX DESIGN APPROVED',
  'design-only preflight',
  // root cause
  'existingBindings',
  'siblingBindings',
  'settleLibraryExecuteEnvelope({ envelope, receipt, dispatchResult, observedAtIso })',
  'settlementConflictInput(args)',
  'requireContext: true',
  "mode: 'settlement'",
  'presence-only',
  'library-conflict-runtime-context-missing',
  'binding-duplicate-context',
  // design answers
  'fresh canonical read immediately before settlement',
  'listCanonicalChatFolderBindingsForChat(chatId)',
  "hashLegacyEndpoint('folder.metadata', folderId)",
  'input.canonicalBinding.leftSubjectId',
  'post-unbind',
  'binding-one-active-per-chat',
  'directly into the `settleLibraryExecuteEnvelope` args',
  'Args-only is sufficient',
  'Keep the decomposed `unbind` + `bind`',
  'replacement must remain independent unbind plus bind',
  // minimal plan
  'buildF15SettlementExistingBindingContext',
  'runF15FolderBindingDelegationPipeline',
  'Single-file JS change',
  // torn-write recovery
  'torn-write',
  'post-apply-binding-hash-mismatch',
  'no ledger consume',
  'retry',
  // validators + evidence
  'validate-folder-sync-binding-f15-settlement-context-fix-implementation.mjs',
  'Rebind torn-write recovery validator',
  'folder-sync-binding-f15-settlement-context-fix-implementation.md',
  // live retry conditions
  'settlement.ok:true',
  'f15Delegation.ok:true',
  'controlledApply.status:"applied"',
  'No Phase B until Phase A passes',
  // NO-GO
  'Do not add `allowF7Fallback` or `f15AllowF7Fallback`',
  'Do not restore a bare `moveCanonicalChatFolderBinding` repair route',
  'Do not weaken the conflict runtime',
  'Do not disable `requireContext`',
  'Do not suppress `library-conflict-runtime-context-missing`',
  'Do not fabricate an empty `existingBindings`',
  'combined settled move/replace op',
  // files likely to change
  'src-surfaces-base/studio/store/folders.tauri.js` (only)',
  // boundaries
  'F15 settled route preserved',
  'busy-aware durable gate preserved',
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: the design targets and reuses these stable symbols ----
assertIncludes(foldersStore, 'function runF15FolderBindingDelegationPipeline', 'pipeline exists for the fix site');
assertIncludes(foldersStore, 'settleLibraryExecuteEnvelope({', 'settle call exists in pipeline');
assertIncludes(foldersStore, 'hashLegacyEndpoint', 'folder/chat endpoint hasher reusable for existing bindings');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat', 'canonical per-chat binding read reusable');
assertIncludes(foldersStore, "delegateF15FolderBindingWrite('unbind'", 'rebind decomposition present');

// ---- REAL SOURCE anchors: settlement writer already supports args-sourced existing bindings ----
assertIncludes(settlementWriter, 'function settlementConflictInput', 'settlement conflict input builder present');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'existingBindings')", 'settle args already read existingBindings');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'siblingBindings')", 'settle args already read siblingBindings');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement requireContext must remain');
assertIncludes(settlementWriter, "mode: 'settlement'", 'settlement mode present');

// ---- REAL SOURCE anchors: conflict runtime rules the design must not weaken ----
assertIncludes(conflictRuntime, 'binding-duplicate-context', 'duplicate-context rule present');
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active-per-chat rule present');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'context-missing code present');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'move/replace blocker present');
assertIncludes(conflictRuntime, 'replacement must remain independent unbind plus bind', 'combined move op is blocked by runtime');
assertIncludes(conflictRuntime, 'function supplied', 'presence-only supplied helper present');

// ---- REAL SOURCE anchors: repair handler safety invariants intact ----
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair forces F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'same-session hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate present');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'repair must not set explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'repair must not set allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'repair must not set f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('),
  'repair handler must not call bare moveCanonicalChatFolderBinding');

// ---- REAL SOURCE anchors: readiness boundaries ----
assertIncludes(foldersStore, 'parsed.busy === 1', 'busy-aware fence remains');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- design must remain design-only (no premature success/impl claims) ----
for (const forbidden of [
  'BINDING F15 SETTLEMENT CONTEXT FIX IMPLEMENTED',
  'Phase A passed',
  'Phase A retried',
  'Phase B passed',
  'productSyncReady is true',
  'allowF7Fallback added',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-context-fix-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-context-fix-preflight',
  evidence: evidencePath,
  verdict: 'BINDING_F15_SETTLEMENT_CONTEXT_FIX_DESIGN_APPROVED',
  priorSettlementBlockerCommit: '8b5e13d0',
  rootCause: 'settle call omits existing/sibling binding context; settlementConflictInput reads existingBindings only from settle args (presence-only supplied()); bind-op conflict runtime warns->blocks',
  approach: 'thread freshly-read hashed existing-binding context (listCanonicalChatFolderBindingsForChat + hashLegacyEndpoint) into settleLibraryExecuteEnvelope args in runF15FolderBindingDelegationPipeline',
  filesLikelyToChange: [foldersStorePath],
  keepDecomposition: true,
  combinedMoveOpRejected: true,
  settlementConflictInputUnchanged: true,
  requireContextPreserved: true,
  conflictRuntimeWeakened: false,
  fallbackReintroduced: false,
  designOnly: true,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'implement single-file fix + 2 validators + implementation evidence, run battery, independent review before live Phase A retry',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settlement-context-fix-preflight');
