#!/usr/bin/env node
//
// Folder Sync - F15-settled live Phase A proposal blocker validator.
//
// Static validator for the design-only evidence that records the live Phase A F15 proposal/preflight blocker.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-phase-a-proposal-blocked.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const proposalPath = 'src-surfaces-base/studio/sync/library/library-binding-proposal-candidate-generator.tauri.js';
const preflightPath = 'src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js';
const diagnosticsPath = 'src-surfaces-base/studio/sync/library/library-binding-diagnostics.tauri.js';
const canonicalizerPath = 'src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js';
const shadowPath = 'src-surfaces-base/studio/sync/library/library-folder-binding-migration-shadow.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['71616328', 'a2864ad6', '7dd1e069', '44151f14', 'ff3ccd44'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e';

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
  proposalPath,
  preflightPath,
  diagnosticsPath,
  canonicalizerPath,
  shadowPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const folderSync = read(folderSyncPath);
const foldersStore = read(foldersStorePath);
const proposal = read(proposalPath);
const preflight = read(preflightPath);
const diagnostics = read(diagnosticsPath);
const canonicalizer = read(canonicalizerPath);
const shadow = read(shadowPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${folderSync}\n${foldersStore}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  'BINDING F15 LIVE PHASE A BLOCKED AT PROPOSAL GENERATION',
  'design-only evidence and preflight',
  'Live Phase A Dry-Run',
  'candidateFound:true',
  'validate.ok:true',
  'dryRun.status:"dry-run"',
  'dryRun.reason:"dry-run-binding-repair-plan-ready"',
  'dryRun.canonicalBindingWriteCount:0',
  'dryRun.idempotencyPersisted:false',
  'dryRun.bindingHashUnchanged:true',
  OLD_HASH,
  REQUESTED_HASH,
  'controlledApply.status:"rejected"',
  'controlledApply.reason:"canonical-binding-bind-failed"',
  'controlledApply.canonicalBindingWriteCount:0',
  'controlledApply.idempotencyPersisted:false',
  'immediateReadbackMatchesRequested:false',
  'duplicateReplayZeroWrite:false',
  'f15-folder-binding-proposal-failed',
  'resultRedacted.shadow.ok:true',
  'resultRedacted.shadow.created:false',
  'resultRedacted.shadow.alreadyPresent:true',
  'resultRedacted.proposal.ok:false',
  'resultRedacted.proposal.status:"blocked"',
  'resultRedacted.proposal.generated:false',
  'resultRedacted.proposal.operation:"unbind"',
  'resultRedacted.proposal.preflight.ok:false',
  'resultRedacted.proposal.preflight.actionable:false',
  'library-binding-canonicalization-failed',
  'library-binding-diagnostics-failed',
  'library-binding-row-contains-forbidden-field',
  'library-binding-preflight-not-ok',
  'sourceKind:"missing"',
  'bindingKindValid:false',
  'endpointTypeConsistent:false',
  'bindingStateValid:false',
  'hashShapeValid:false',
  'relatedCatalogContextSupplied:false',
  'relatedChatContextSupplied:false',
  'siblingBindingContextSupplied:false',
  'No canonical binding write landed',
  'No consumed ledger row',
  'Phase B/reload proof must not run',
  'delegateF15FolderBindingWrite',
  'buildF15FolderBindingDelegationInput',
  'runF15FolderBindingDelegationPipeline',
  'generateLibraryBindingProposalCandidate',
  'preflightLibraryBinding',
  'diagnoseLibraryBinding',
  'canonicalizeLibraryBinding',
  'createLibraryFolderBindingMigrationShadow',
  'Construct the `unbind` proposal from the existing settled binding row',
  'Supply a valid `canonicalBinding` or `canonicalizerResult`',
  'related folder/catalog context',
  'related chat context',
  'sibling binding context',
  'libraryBindingSubjectId',
  'Do not add `allowF7Fallback` or `f15AllowF7Fallback`',
  'Do not restore a bare `moveCanonicalChatFolderBinding` repair route',
  'Do not weaken `library-binding-row-contains-forbidden-field`',
  'Do not run Phase B',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay remains `blocked`',
  'Chat Saving WebDAV/cloud/archive CAS remains `blocked`',
  'F15 proposal/preflight fix design',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

assertIncludes(foldersStore, 'function delegateF15FolderBindingWrite', 'F15 delegation function source');
assertIncludes(foldersStore, 'function buildF15FolderBindingDelegationInput', 'F15 delegation input builder source');
assertIncludes(foldersStore, 'function runF15FolderBindingDelegationPipeline', 'F15 delegation pipeline source');
assertIncludes(foldersStore, 'generateLibraryBindingProposalCandidate(input)', 'proposal generator call source');
assertIncludes(foldersStore, "blockers: ['f15-folder-binding-proposal-failed']", 'F15 proposal failure blocker source');
assertIncludes(foldersStore, "delegateF15FolderBindingWrite('unbind'", 'rebind decomposition unbind source');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'F11 still blocks binding-mismatch source');

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

assertIncludes(proposal, 'function generateLibraryBindingProposalCandidate', 'proposal generator source');
assertIncludes(proposal, 'function runPreflight', 'proposal runPreflight source');
assertIncludes(proposal, 'function bindingFromPreflight', 'proposal bindingFromPreflight source');
assertIncludes(proposal, 'library-binding-preflight-not-ok', 'proposal preflight failure blocker source');
assertIncludes(preflight, 'function preflightLibraryBinding', 'preflight source');
assertIncludes(preflight, 'function resolveDiagnostics', 'preflight diagnostics resolver source');
assertIncludes(preflight, 'library-binding-canonicalization-failed', 'preflight canonicalization blocker source');
assertIncludes(preflight, 'library-binding-diagnostics-failed', 'preflight diagnostics blocker source');
assertIncludes(preflight, 'library-binding-row-contains-forbidden-field', 'preflight forbidden field blocker source');
assertIncludes(preflight, 'relatedCatalogs', 'preflight related catalog context source');
assertIncludes(preflight, 'relatedChats', 'preflight related chat context source');
assertIncludes(preflight, 'siblingBindings', 'preflight sibling binding context source');
assertIncludes(diagnostics, 'function diagnoseLibraryBinding', 'diagnostics source');
assertIncludes(diagnostics, 'function resolveBinding', 'diagnostics binding resolver source');
assertIncludes(diagnostics, 'sourceKind: \'missing\'', 'diagnostics missing source kind');
assertIncludes(diagnostics, 'bindingKindValid', 'diagnostics binding kind source');
assertIncludes(diagnostics, 'endpointTypeConsistent', 'diagnostics endpoint source');
assertIncludes(diagnostics, 'hashShapeValid', 'diagnostics hash shape source');
assertIncludes(canonicalizer, 'function canonicalizeLibraryBinding', 'canonicalizer source');
assertIncludes(canonicalizer, 'RAW_ENDPOINT_FIELD_NAMES', 'canonicalizer raw endpoint quarantine source');
assertIncludes(canonicalizer, 'h2o.library.binding.v1', 'canonical library binding schema source');
assertIncludes(shadow, 'function createLibraryFolderBindingMigrationShadow', 'migration shadow source');
assertIncludes(shadow, 'setF15FolderBindingDelegationEnabled', 'F15 delegation enablement source');

assertIncludes(foldersStore, 'parsed.busy === 1', 'busy-aware fence remains source');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

for (const forbidden of [
  'BINDING F15 LIVE PHASE A PASSED',
  'Phase B passed',
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
  schema: 'h2o.studio.folder-sync.binding-f15-live-phase-a-proposal-blocked.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-live-phase-a-proposal-blocked',
  evidence: evidencePath,
  verdict: 'BINDING_F15_LIVE_PHASE_A_BLOCKED_AT_PROPOSAL_GENERATION',
  implementationCommit: 'ff3ccd44',
  dryRunPassed: true,
  controlledApplyStatus: 'rejected',
  controlledApplyReason: 'canonical-binding-bind-failed',
  f15DelegationEvidencePresent: true,
  f15DelegationOk: false,
  blocker: 'f15-folder-binding-proposal-failed',
  proposalOperation: 'unbind',
  preflightBlockers: [
    'library-binding-canonicalization-failed',
    'library-binding-diagnostics-failed',
    'library-binding-row-contains-forbidden-field',
    'library-binding-preflight-not-ok',
  ],
  noWrite: true,
  noLedgerConsume: true,
  phaseBBlocked: true,
  fallbackReintroduced: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'F15 proposal/preflight fix design',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-live-phase-a-proposal-blocked');
