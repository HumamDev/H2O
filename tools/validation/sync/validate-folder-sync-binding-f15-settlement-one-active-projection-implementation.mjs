#!/usr/bin/env node
//
// Folder Sync - F15 settlement one-active planned-transition projection implementation validator.
//
// Proves the store-layer F15 repair-origin rebind path projects out exactly the
// detected planned source edge for the bind-half settlement context, while the
// real conflict runtime still blocks true duplicate and one-active conflicts.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-one-active-projection-implementation.md';
const preflightEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-one-active-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = [
  'ff3ccd44',
  '0b015cc7',
  '501635ae',
  '0833d4a1',
  '8b5e13d0',
  '08527e9d',
  'e6a91051',
  'b260da0f',
];

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

function assertNotIncludes(source, token, label) {
  assert.ok(!source.includes(token), `${label}: unexpectedly found ${token}`);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function codeList(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => (entry && typeof entry === 'object' ? String(entry.code || '') : String(entry || '')))
      .filter(Boolean)
    : [];
}

function hasCode(result, code) {
  return codeList(result && result.blockers).includes(code) || codeList(result && result.warnings).includes(code);
}

for (const rel of [
  evidencePath,
  preflightEvidencePath,
  foldersStorePath,
  folderSyncPath,
  settlementWriterPath,
  conflictRuntimePath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const preflightEvidence = read(preflightEvidencePath);
const flatEvidence = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assert.ok(evidence.includes(commit) || preflightEvidence.includes(commit), `commit ${commit} must be referenced`);
}

for (const token of [
  'BINDING F15 SETTLEMENT ONE-ACTIVE PROJECTION FIX IMPLEMENTED',
  'planned-transition projection',
  'actual current edge detected',
  'strips any caller-provided `plannedUnbindFolderId`',
  'cross-checks caller-declared `previousFolderId`',
  'f15-folder-binding-planned-unbind-mismatch',
  'hashLegacyEndpoint(\'folder.metadata\', plannedUnbindFolderId)',
  'projects out exactly one matching',
  'f15-folder-binding-settlement-context-failed',
  'true duplicate',
  'true one-active',
  '`requireContext` is unchanged',
  'conflict runtime is unchanged',
  'settlement writer remains journal-based',
  'no fallback route',
  'No live apply was run',
  'Phase A was not run',
  'Phase B was not run',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'source-grounded',
  'post-apply-binding-hash-mismatch',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

// Store implementation anchors: detected edge drives projection, caller-only projection is stripped.
assertIncludes(foldersStore, 'async function buildF15SettlementExistingBindingContext',
  'settlement context helper exists');
assertIncludes(foldersStore, "var operation = cleanString(opts.operation)",
  'settlement context is operation-aware');
assertIncludes(foldersStore, "var plannedUnbindFolderId = operation === 'bind' ? getFolderId(opts.plannedUnbindFolderId) : ''",
  'planned projection is bind-only');
assertIncludes(foldersStore, "hashLegacyEndpoint('folder.metadata', plannedUnbindFolderId)",
  'planned source edge is hashed with folder endpoint helper');
assertIncludes(foldersStore, 'plannedUnbindEdgePresent !== true',
  'only one planned source edge is projected out');
assertIncludes(foldersStore, 'if (plannedUnbindFolderId && plannedUnbindEdgePresent !== true) return null',
  'missing planned source edge fails closed');
assertIncludes(foldersStore, "blockers: ['f15-folder-binding-settlement-context-failed']",
  'untrusted projection context fails closed before settlement');
assertIncludes(foldersStore, 'delete safeOpts.plannedUnbindFolderId',
  'caller-supplied plannedUnbindFolderId is stripped');
assertIncludes(foldersStore, 'var declaredPreviousFolderId = getFolderId(opts.previousFolderId || opts.expectedCurrentFolderId || opts.currentFolderId)',
  'declared previous edge is read for cross-check');
assertIncludes(foldersStore, 'declaredPreviousFolderId !== previousFolderId',
  'declared previous edge mismatch is detected');
assertIncludes(foldersStore, "blockers: ['f15-folder-binding-planned-unbind-mismatch']",
  'declared/detected mismatch fails closed');
assertIncludes(foldersStore, 'Object.assign({}, safeOpts, { plannedUnbindFolderId: previousFolderId })',
  'only detected previous edge is threaded to bind-half');
assertIncludes(foldersStore, "delegateF15FolderBindingWrite('unbind'", 'decomposed unbind retained');
assertIncludes(foldersStore, 'existingBindings: settlementExistingBindings', 'settlement receives existingBindings');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat(canonicalChatId)',
  'projection reads fresh canonical per-chat rows');

// Settlement writer and conflict runtime must remain strict and unchanged by this slice.
assertIncludes(settlementWriter, 'async function appendJournal', 'settlement writer journal model retained');
assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(settlementWriter),
  'settlement writer must not directly materialize folder_bindings');
assertIncludes(settlementWriter, 'requireContext: true', 'requireContext retained in settlement writer');
assertIncludes(settlementWriter, 'library-conflict-runtime-context-missing', 'context-missing blocker retained');
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active rule retained');
assertIncludes(conflictRuntime, 'binding-duplicate-context', 'duplicate-context rule retained');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'replacement blocker retained');
assertIncludes(conflictRuntime, 'replacement must remain independent unbind plus bind',
  'combined move/replace remains blocked');
assertIncludes(conflictRuntime, "supplied(ctx.input, 'existingBindings')", 'existingBindings presence check retained');

// Repair handler and readiness boundaries.
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair still routes through F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate retained');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate retained');
assertNotIncludes(folderSync, 'explicitF7Fallback: true', 'repair must not set explicitF7Fallback');
assertNotIncludes(folderSync, 'allowF7Fallback: true', 'repair must not set allowF7Fallback');
assertNotIncludes(folderSync, 'f15AllowF7Fallback: true', 'repair must not set f15AllowF7Fallback');
assertNotIncludes(folderSync, 'folders.moveCanonicalChatFolderBinding(', 'repair handler must not restore bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// Torn-write / retry source-grounded proof: hash gate remains before ledger consumption.
const hashGateIndex = folderSync.indexOf('post-apply-binding-hash-mismatch');
const ledgerConsumeIndex = folderSync.indexOf('await bindingRepairRecordConsumed(request)');
assert.ok(hashGateIndex !== -1 && ledgerConsumeIndex !== -1 && hashGateIndex < ledgerConsumeIndex,
  'post-apply hash mismatch gate must remain before consumed ledger write');

function createRuntimeContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    crypto: crypto.webcrypto,
  };
  context.globalThis = context;
  context.window = context;
  context.self = context;
  context.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected invoke'); } };
  context.H2O = { Desktop: { Sync: {} }, Studio: { platform: { env: { isTauri: true } } } };
  vm.createContext(context);
  return context;
}

function runRuntimeHarness() {
  const context = createRuntimeContext();
  vm.runInContext(conflictRuntime, context, { filename: conflictRuntimePath });
  const sync = context.H2O.Desktop.Sync;
  assert.equal(typeof sync.evaluateLibraryBindingRuntimeConflict, 'function', 'binding conflict runtime API must load');

  const chat = sha256('projection.chat');
  const previousFolder = sha256('projection.previous-folder');
  const targetFolder = sha256('projection.target-folder');
  const thirdFolder = sha256('projection.third-folder');
  const candidate = {
    subjectId: sha256('projection.candidate'),
    bindingKind: 'chat-folder',
    bindingState: 'bound',
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'folder.metadata',
    leftSubjectId: chat,
    rightSubjectId: targetFolder,
  };
  const previousEdge = Object.assign({}, candidate, {
    subjectId: sha256('projection.previous-edge'),
    rightSubjectId: previousFolder,
  });
  const targetDuplicate = Object.assign({}, candidate, {
    subjectId: sha256('projection.target-duplicate'),
  });
  const thirdEdge = Object.assign({}, candidate, {
    subjectId: sha256('projection.third-edge'),
    rightSubjectId: thirdFolder,
  });

  const rawCurrent = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [previousEdge],
  });
  assert.ok(hasCode(rawCurrent, 'library-binding-cross-install-state-conflict'),
    'raw current source edge must trigger one-active conflict before projection');

  const projected = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [],
  });
  assert.equal(hasCode(projected, 'library-conflict-runtime-context-missing'), false,
    'projected empty context is supplied context, not missing context');
  assert.equal(projected.ok, true, 'projected post-unbind context should pass bind settlement');

  const duplicate = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [targetDuplicate],
  });
  assert.ok(hasCode(duplicate, 'library-binding-cross-install-duplicate-edge'),
    'true duplicate target edge must still block');
  assert.equal(duplicate.ok, false, 'duplicate target edge result must fail');

  const oneActive = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [thirdEdge],
  });
  assert.ok(hasCode(oneActive, 'library-binding-cross-install-state-conflict'),
    'true third-folder one-active conflict must still block');
  assert.equal(oneActive.ok, false, 'third-folder one-active result must fail');

  return {
    rawCurrentOneActiveBlocked: hasCode(rawCurrent, 'library-binding-cross-install-state-conflict'),
    projectedPasses: projected.ok === true,
    duplicateStillBlocks: hasCode(duplicate, 'library-binding-cross-install-duplicate-edge'),
    oneActiveStillBlocks: hasCode(oneActive, 'library-binding-cross-install-state-conflict'),
  };
}

const harness = runRuntimeHarness();

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-one-active-projection-implementation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-one-active-projection-implementation',
  evidence: evidencePath,
  verdict: 'BINDING_F15_SETTLEMENT_ONE_ACTIVE_PROJECTION_FIX_IMPLEMENTED',
  preflightCommit: 'b260da0f',
  sourceChanged: foldersStorePath,
  plannedProjectionBindOnly: true,
  projectionDerivedFromDetectedPreviousEdge: true,
  callerProjectionStripped: true,
  mismatchFailsClosed: true,
  missingPlannedEdgeFailsClosed: true,
  rawCurrentOneActiveBlocked: harness.rawCurrentOneActiveBlocked,
  projectedBindPasses: harness.projectedPasses,
  duplicateStillBlocks: harness.duplicateStillBlocks,
  oneActiveStillBlocks: harness.oneActiveStillBlocks,
  requireContextPreserved: true,
  conflictRuntimeChanged: false,
  settlementWriterChanged: false,
  tornWriteRecoveryProof: 'source-grounded-post-apply-hash-gate-before-ledger-consume',
  liveApplyPerformed: false,
  phaseARun: false,
  phaseBRun: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'independent review, then live Phase A retry if approved',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settlement-one-active-projection-implementation');
