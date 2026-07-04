#!/usr/bin/env node
//
// Folder Sync - F15 settlement conflict-runtime context fix implementation validator.
//
// Proves the store-layer F15 folder-binding delegation threads a fresh, hashed
// existing-binding context into settlement without weakening the conflict runtime
// or release boundaries.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-context-fix-implementation.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['ff3ccd44', '0b015cc7', '501635ae', '0833d4a1', '8b5e13d0', '08527e9d'];

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
  foldersStorePath,
  folderSyncPath,
  settlementWriterPath,
  conflictRuntimePath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
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
  'BINDING F15 SETTLEMENT CONTEXT FIX IMPLEMENTED',
  'proposal had context, settlement args did not',
  'fresh hashed existing binding context',
  'settleLibraryExecuteEnvelope',
  'Conflict runtime was not weakened',
  '`requireContext` remains',
  'true duplicate',
  'one-active-per-chat',
  'Decomposed unbind+bind preserved',
  'No combined move/replace operation',
  'No fallback',
  'No live apply was run',
  'Phase A was not run',
  'Phase B was not run',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

// Store implementation anchors.
assertIncludes(foldersStore, 'async function buildF15SettlementExistingBindingContext',
  'fresh settlement binding context helper');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat(chatId)',
  'settlement context must use real canonical per-chat read');
assertIncludes(foldersStore, "hashLegacyEndpoint('folder.metadata', folderId)",
  'settlement context must hash folder endpoint ids');
assertIncludes(foldersStore, "subjectType: 'library.binding'", 'settlement context subject type');
assertIncludes(foldersStore, "bindingKind: 'chat-folder'", 'settlement context binding kind');
assertIncludes(foldersStore, "bindingState: 'bound'", 'settlement context binding state');
assertIncludes(foldersStore, "leftSubjectType: 'chat.metadata'", 'settlement context left endpoint type');
assertIncludes(foldersStore, "rightSubjectType: 'folder.metadata'", 'settlement context right endpoint type');
assertIncludes(foldersStore, 'var settlementExistingBindings = await buildF15SettlementExistingBindingContext',
  'pipeline must build settlement context after execute');
assertIncludes(foldersStore, 'existingBindings: settlementExistingBindings',
  'pipeline must pass existingBindings into settlement args');
assertIncludes(foldersStore, "blockers: ['f15-folder-binding-settlement-context-failed']",
  'pipeline must fail closed on untrusted settlement context');

const settleIndex = foldersStore.indexOf('var settlementExistingBindings = await buildF15SettlementExistingBindingContext');
const settleCallIndex = foldersStore.indexOf('var settlement = await sync.settleLibraryExecuteEnvelope');
assert.ok(settleIndex !== -1 && settleCallIndex !== -1 && settleIndex < settleCallIndex,
  'fresh settlement context must be computed immediately before settlement call');

// Settlement writer and conflict runtime must stay strict.
assertIncludes(settlementWriter, 'function settlementConflictInput', 'settlement conflict input builder retained');
assertIncludes(settlementWriter, "hasOwnProperty.call(args, 'existingBindings')", 'settlement reads existingBindings from args');
assertIncludes(settlementWriter, 'input.existingBindings = asArray(args.existingBindings || args.siblingBindings)',
  'settlement threads existing/sibling bindings to conflict runtime');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement requireContext retained');
assertIncludes(settlementWriter, 'library-conflict-runtime-context-missing', 'context missing blocker retained');
assertIncludes(conflictRuntime, 'binding-duplicate-context', 'duplicate context rule retained');
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active-per-chat rule retained');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'replacement blocker retained');
assertIncludes(conflictRuntime, 'replacement must remain independent unbind plus bind',
  'combined move/replace remains blocked');
assertIncludes(conflictRuntime, 'library-conflict-runtime-context-missing', 'context missing code retained');
assertIncludes(conflictRuntime, "supplied(ctx.input, 'existingBindings')", 'presence check retained');

// Repair handler and release boundaries.
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair still routes through F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate retained');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate retained');
assertIncludes(folderSync, 'persistence-verification-failure', 'durable failure reason retained');
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

  const chat = sha256('f15.settlement.chat');
  const targetFolder = sha256('f15.settlement.target-folder');
  const otherFolder = sha256('f15.settlement.other-folder');
  const candidate = {
    subjectId: sha256('f15.settlement.candidate-binding'),
    bindingKind: 'chat-folder',
    bindingState: 'bound',
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'folder.metadata',
    leftSubjectId: chat,
    rightSubjectId: targetFolder,
  };
  const duplicateExisting = Object.assign({}, candidate, {
    subjectId: sha256('f15.settlement.duplicate-existing'),
  });
  const otherExisting = Object.assign({}, candidate, {
    subjectId: sha256('f15.settlement.other-existing'),
    rightSubjectId: otherFolder,
  });

  const missingContext = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
  });
  assert.ok(hasCode(missingContext, 'library-conflict-runtime-context-missing'),
    'bind settlement without existingBindings must emit context-missing');

  const postUnbindContext = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [],
  });
  assert.equal(hasCode(postUnbindContext, 'library-conflict-runtime-context-missing'), false,
    'supplied empty post-unbind context must not emit context-missing');
  assert.equal(postUnbindContext.ok, true, 'post-unbind bind settlement should pass with supplied empty context');
  assert.equal(postUnbindContext.conflictFree, true, 'post-unbind bind settlement should be conflict-free');

  const duplicate = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [duplicateExisting],
  });
  assert.ok(hasCode(duplicate, 'library-binding-cross-install-duplicate-edge'),
    'true duplicate edge must still block');
  assert.equal(duplicate.ok, false, 'true duplicate edge result must fail');

  const oneActive = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'bind',
    candidate,
    existingBindings: [otherExisting],
  });
  assert.ok(hasCode(oneActive, 'library-binding-cross-install-state-conflict'),
    'true one-active-per-chat conflict must still block');
  assert.equal(oneActive.ok, false, 'one-active-per-chat result must fail');

  const unbind = sync.evaluateLibraryBindingRuntimeConflict({
    mode: 'settlement',
    requireContext: true,
    operation: 'unbind',
    candidate,
  });
  assert.equal(hasCode(unbind, 'library-conflict-runtime-context-missing'), false,
    'unbind settlement must remain unaffected by bind duplicate-context requirement');

  return {
    missingContextWarnings: codeList(missingContext.warnings),
    postUnbindOk: postUnbindContext.ok === true,
    duplicateBlocked: hasCode(duplicate, 'library-binding-cross-install-duplicate-edge'),
    oneActiveBlocked: hasCode(oneActive, 'library-binding-cross-install-state-conflict'),
    unbindContextMissing: hasCode(unbind, 'library-conflict-runtime-context-missing'),
  };
}

const harness = runRuntimeHarness();

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-context-fix-implementation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-context-fix-implementation',
  evidence: evidencePath,
  verdict: 'BINDING_F15_SETTLEMENT_CONTEXT_FIX_IMPLEMENTED',
  designCommit: '08527e9d',
  sourceChanged: foldersStorePath,
  settlementReceivesExistingBindings: true,
  settlementContextFreshRead: true,
  conflictRuntimeChanged: false,
  requireContextPreserved: true,
  missingContextWithoutExistingBindings: harness.missingContextWarnings.includes('library-conflict-runtime-context-missing'),
  postUnbindContextPasses: harness.postUnbindOk,
  duplicateEdgeStillBlocks: harness.duplicateBlocked,
  oneActivePerChatStillBlocks: harness.oneActiveBlocked,
  unbindUnaffected: harness.unbindContextMissing === false,
  fallbackRestored: false,
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
console.log('PASS validate-folder-sync-binding-f15-settlement-context-fix-implementation');
