#!/usr/bin/env node
//
// Folder Sync - F15-settled live Phase A settlement blocker validator.
//
// Static validator for the design-only evidence that records the live Phase A F15 settlement conflict-runtime
// context blocker: shadow/proposal/handoff/execute now pass, and settlement fails with
// library-conflict-runtime-context-missing (binding-duplicate-context rule) because the settlement conflict
// runtime is not supplied existing binding context. Also anchors the real source paths that explain the gap and
// confirms every release/safety boundary remains held. No live apply, no Phase B, no fallback.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-phase-a-settlement-blocked.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const bindingAdapterPath = 'src-surfaces-base/studio/sync/execute/adapters/library-binding-execute-adapter.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['71616328', 'a2864ad6', '7dd1e069', '44151f14', 'ff3ccd44', '0b015cc7', '501635ae', '0833d4a1'];

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
  folderSyncPath,
  foldersStorePath,
  settlementWriterPath,
  conflictRuntimePath,
  bindingAdapterPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);
const bindingAdapter = read(bindingAdapterPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${folderSync}\n${foldersStore}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  'BINDING F15 LIVE PHASE A BLOCKED AT SETTLEMENT CONTEXT',
  'design-only evidence and preflight',
  // dry-run
  'candidateFound:true',
  'validate.ok:true',
  'dryRun.status:"dry-run"',
  'dryRun.reason:"dry-run-binding-repair-plan-ready"',
  'dryRun.canonicalBindingWriteCount:0',
  'dryRun.idempotencyPersisted:false',
  'dryRun.bindingHashUnchanged:true',
  // controlled apply
  'controlledApply.status:"rejected"',
  'controlledApply.reason:"canonical-binding-bind-failed"',
  'controlledApply.canonicalBindingWriteCount:0',
  'controlledApply.idempotencyPersisted:false',
  'immediateReadbackMatchesRequested:false',
  'duplicateReplayZeroWrite:false',
  // delegation capture v2
  'f15-delegation-blocker-capture.v2',
  'evidencePresent:true',
  'blockers:["f15-folder-binding-settlement-failed"]',
  // progress: shadow → execute pass
  'shadow.ok:true',
  'shadow.blockers:[]',
  'proposal.ok:true',
  'proposal.status:"generated"',
  'proposal.generated:true',
  'proposal.preflight.ok:true',
  'proposal.preflight.actionable:true',
  'proposal.blockers:[]',
  'handoff.ok:true',
  'handoff.handoffReady:true',
  'execute.ok:true',
  'execute envelope built',
  'h2o_library_binding_bind_chat_folder_apply',
  // settlement blocker
  'settlement.ok:false',
  'settlement.settled:false',
  'settlement.blockers:["library-conflict-runtime-context-missing"]',
  'settlement.conflictRuntime.ok:false',
  'settlement.conflictRuntime.conflictFree:false',
  'settlement.conflictRuntime.mode:"settlement"',
  'settlement.conflictRuntime.operation:"bind"',
  'rule:"binding-duplicate-context"',
  'status:"warning"',
  'code:"library-conflict-runtime-context-missing"',
  'outcome:"existing binding context missing"',
  'settlement.conflictRuntimeSummary.blockerCount:1',
  // side effects
  'bindingMutated:false',
  'catalogMutated:false',
  'storageWritten:false',
  'consumedOperationWritten:false',
  'applyExecuted:false',
  'nativeCalled:false',
  // interpretation / root cause
  'The previous proposal blocker',
  'settlement conflict-runtime context gap',
  'settleLibraryExecuteEnvelope',
  'settlementConflictInput',
  'requireContext:true',
  'presence-only',
  'evaluateSettlementConflict',
  // fix direction
  'settlement conflict-runtime context fix design',
  'Thread existing/sibling binding context into the',
  'listForChat',
  'Do not add `allowF7Fallback` or `f15AllowF7Fallback`',
  'Do not restore a bare `moveCanonicalChatFolderBinding` repair route',
  'Do not weaken the conflict runtime',
  'Do not disable `requireContext`',
  'Do not run Phase B',
  // boundaries
  'No canonical binding write landed',
  'No ledger consume happened',
  'Conflict runtime must not be weakened',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay remains `blocked`',
  'Chat Saving WebDAV/cloud/archive CAS remains `blocked`',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: store pipeline ----
assertIncludes(foldersStore, 'function runF15FolderBindingDelegationPipeline', 'F15 delegation pipeline source');
assertIncludes(foldersStore, 'function buildF15FolderBindingDelegationInput', 'F15 delegation input builder source');
assertIncludes(foldersStore, 'function delegateF15FolderBindingWrite', 'F15 delegation function source');
assertIncludes(foldersStore, 'settleLibraryExecuteEnvelope({', 'pipeline settle call source');
assertIncludes(foldersStore, "blockers: ['f15-folder-binding-settlement-failed']", 'settlement failure blocker source');
assertIncludes(foldersStore, 'existingBindings: siblingBindings', 'delegation input carries existing/sibling binding context');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch source');

// ---- REAL SOURCE anchors: settlement writer extension (context threading gap) ----
assertIncludes(settlementWriter, 'function settlementConflictInput', 'settlement conflict input builder source');
assertIncludes(settlementWriter, "mode: 'settlement'", 'settlement mode source');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement requireContext source');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'existingBindings')", 'existingBindings sourced from settle args');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'siblingBindings')", 'siblingBindings sourced from settle args');
assertIncludes(settlementWriter, 'library-conflict-runtime-context-missing', 'settlement promotes context-missing code');

// ---- REAL SOURCE anchors: conflict runtime (rule + presence-only supplied) ----
assertIncludes(conflictRuntime, 'binding-duplicate-context', 'conflict runtime duplicate-context rule source');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'conflict runtime context-missing code source');
assertIncludes(conflictRuntime, 'function supplied', 'conflict runtime supplied helper source');
assertIncludes(conflictRuntime, "supplied(ctx.input, 'existingBindings')", 'conflict runtime existingBindings presence check source');
assertIncludes(conflictRuntime, "supplied(ctx.input, 'existingSubjects')", 'conflict runtime existingSubjects presence check source');
assertIncludes(conflictRuntime, 'existing binding context missing', 'conflict runtime missing-context outcome source');

// ---- REAL SOURCE anchors: native execute adapter command ----
// The live command h2o_library_binding_bind_chat_folder_apply is runtime-derived by nativeCommandFor('bind',
// 'chat-folder'); anchor on the real builder + template rather than a literal that is only produced at runtime.
assertIncludes(bindingAdapter, 'function nativeCommandFor', 'adapter native command builder source');
assertIncludes(bindingAdapter, "'h2o_library_binding_' + operation + '_' + kindToken + '_apply'",
  'adapter derives bind chat-folder native command');

// ---- REAL SOURCE anchors: repair handler safety invariants intact ----
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair forces F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'same-session hash gate source');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate source');
assertIncludes(folderSync, 'persistence-verification-failure', 'persistence failure gate source');
assertIncludes(folderSync, 'canonical-binding-bind-failed', 'bind failure receipt reason source');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'repair must not set explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'repair must not set allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'repair must not set f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('),
  'repair handler must not call bare moveCanonicalChatFolderBinding');

// ---- REAL SOURCE anchors: durable fence + readiness boundaries ----
assertIncludes(foldersStore, 'parsed.busy === 1', 'busy-aware fence remains source');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- evidence must not over-claim ----
for (const forbidden of [
  'BINDING F15 LIVE PHASE A PASSED',
  'Phase B passed',
  'settlement.ok:true',
  'binding-mismatch is allowed',
  'productSyncReady is true',
  'WebDAV/cloud/relay ready',
  'allowF7Fallback should be added',
  'f15AllowF7Fallback should be added',
  'restore bare moveCanonicalChatFolderBinding',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-live-phase-a-settlement-blocked.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-live-phase-a-settlement-blocked',
  evidence: evidencePath,
  verdict: 'BINDING_F15_LIVE_PHASE_A_BLOCKED_AT_SETTLEMENT_CONTEXT',
  priorProposalBlockerCommit: '0b015cc7',
  shadowRegressionFixCommit: '0833d4a1',
  dryRunPassed: true,
  controlledApplyStatus: 'rejected',
  controlledApplyReason: 'canonical-binding-bind-failed',
  f15DelegationEvidencePresent: true,
  f15DelegationOk: false,
  blocker: 'f15-folder-binding-settlement-failed',
  shadowOk: true,
  proposalGenerated: true,
  handoffOk: true,
  executeOk: true,
  settlementOk: false,
  settlementBlocker: 'library-conflict-runtime-context-missing',
  conflictRule: 'binding-duplicate-context',
  rootCause: 'settle call omits existing/sibling binding context; settlementConflictInput reads existingBindings only from settle args (presence-only supplied()); bind-op conflict runtime warns->blocks',
  recommendedFixDirection: 'thread existing/sibling binding context (materialized via listForChat) into settleLibraryExecuteEnvelope; do not weaken conflict runtime / requireContext',
  noWrite: true,
  noLedgerConsume: true,
  phaseBBlocked: true,
  fallbackReintroduced: false,
  conflictRuntimeWeakened: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  liveApplyPerformed: false,
  recommendedNext: 'settlement conflict-runtime context fix design',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-live-phase-a-settlement-blocked');
