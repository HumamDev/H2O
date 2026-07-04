#!/usr/bin/env node
//
// Folder Sync - F15 repair-origin canonical-row enrichment implementation validator.
//
// Proves the store-layer F15 folder-binding delegation now supplies a clean
// canonical library.binding row/context to the real F15 proposal stack, while
// keeping F15 canonicalizer/preflight/privacy rules and readiness boundaries intact.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-canonical-row-enrichment-implementation.md';
const shadowRegressionEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-canonical-row-shadow-regression-fix.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const canonicalizerPath = 'src-surfaces-base/studio/sync/library/library-binding-canonicalizer.tauri.js';
const diagnosticsPath = 'src-surfaces-base/studio/sync/library/library-binding-diagnostics.tauri.js';
const preflightPath = 'src-surfaces-base/studio/sync/library/library-binding-preflight.tauri.js';
const proposalPath = 'src-surfaces-base/studio/sync/library/library-binding-proposal-candidate-generator.tauri.js';
const shadowPath = 'src-surfaces-base/studio/sync/library/library-folder-binding-migration-shadow.tauri.js';
const privacyPath = 'src-surfaces-base/studio/sync/kernel/privacy-scan.tauri.js';
const identityPath = 'src-surfaces-base/studio/sync/kernel/identity-kit.tauri.js';
const lifecyclePath = 'src-surfaces-base/studio/sync/kernel/lifecycle-framework.tauri.js';
const watermarkPath = 'src-surfaces-base/studio/sync/kernel/watermark-service.tauri.js';
const replayPath = 'src-surfaces-base/studio/sync/kernel/replay-composer.tauri.js';
const publicationPath = 'src-surfaces-base/studio/sync/kernel/publication-kit.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

const IMPLEMENTATION_COMMIT = '0b015cc7';
const PRIOR_COMMITS = ['71616328', 'a2864ad6', '7dd1e069', '44151f14', 'ff3ccd44'];
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';

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

for (const rel of [
  evidencePath,
  shadowRegressionEvidencePath,
  foldersStorePath,
  folderSyncPath,
  canonicalizerPath,
  diagnosticsPath,
  preflightPath,
  proposalPath,
  shadowPath,
  privacyPath,
  identityPath,
  lifecyclePath,
  watermarkPath,
  replayPath,
  publicationPath,
  folderImportPath,
  archiveBoundaryPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const shadowRegressionEvidence = read(shadowRegressionEvidencePath);
const flatEvidence = compact(evidence);
const flatShadowRegressionEvidence = compact(shadowRegressionEvidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const canonicalizer = read(canonicalizerPath);
const diagnostics = read(diagnosticsPath);
const preflight = read(preflightPath);
const proposal = read(proposalPath);
const shadowSource = read(shadowPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of PRIOR_COMMITS.concat(IMPLEMENTATION_COMMIT)) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  'BINDING F15 CANONICAL-ROW SHADOW REGRESSION FIXED',
  '501635ae865b460ac0bb4e0cb4e5d6196714022d',
  'input.canonicalBinding.leftSubjectId',
  'input.canonicalBinding.rightSubjectId',
  'missing-chat-subject-hash',
  'missing-folder-subject-hash',
  'f15-folder-binding-shadow-failed',
  'f15-folder-binding-canonical-row-invalid',
  'validator now proves shadow plus proposal behavior',
  'No fallback was restored',
  'No live apply was run',
  'Phase A was not retried',
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay/fullBundle.v3 remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flatShadowRegressionEvidence, token, `shadow regression evidence token ${token}`);
}

for (const token of [
  'BINDING F15 CANONICAL-ROW ENRICHMENT IMPLEMENTED',
  'envelope-laden compat input',
  'clean canonical chat-folder binding row/context',
  'F15 canonicalizer/preflight/privacy were not weakened',
  'No fallback restored',
  'No live apply was run',
  'Phase A must be retried after this commit',
  'binding-mismatch remains blocked',
  'productSyncReady remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'canonicalization ok',
  'sourceKind canonicalBinding',
  'bindingKind chat-folder valid',
  'endpoint types chat to folder valid',
  'bindingState bound valid',
  'hash shape valid',
  'related chat context supplied',
  'related catalog context explicitly supplied',
  'proposal.generated === true',
  'repair-origin unbind',
  'repair-origin bind',
  'sourceMirror',
  'replayContext',
  'watermarkState',
  'consumedOperationState',
  'actorPeer',
  'perEnvelopeSalt',
  'pipeline-only fields stay outside the canonical row',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

assertIncludes(foldersStore, 'function compactF15CanonicalBinding', 'canonical compactor helper');
assertIncludes(foldersStore, 'async function buildF15CanonicalChatFolderBinding', 'canonical row helper');
assertIncludes(foldersStore, 'function cleanF15SiblingBindings', 'sibling compactor helper');
assertIncludes(foldersStore, 'canonicalizeLibraryBinding(row)', 'store uses real F15 canonicalizer when present');
assertIncludes(foldersStore, 'canonicalBinding: canonicalBinding', 'delegation input supplies canonicalBinding');
assertIncludes(foldersStore, 'var canonicalBinding = input && input.canonicalBinding',
  'pipeline must read canonicalBinding for shadow contract');
assertIncludes(foldersStore, 'f15-folder-binding-canonical-row-invalid',
  'pipeline must fail safely for missing/invalid canonical rows');
assertIncludes(foldersStore, 'chatSubjectId: canonicalBinding.leftSubjectId',
  'shadow step must read chat subject from canonicalBinding');
assertIncludes(foldersStore, 'folderSubjectId: canonicalBinding.rightSubjectId',
  'shadow step must read folder subject from canonicalBinding');
assertNotIncludes(foldersStore, 'chatSubjectId: input.leftSubjectId',
  'shadow step must not read removed top-level chat subject');
assertNotIncludes(foldersStore, 'folderSubjectId: input.rightSubjectId',
  'shadow step must not read removed top-level folder subject');
assertIncludes(foldersStore, 'relatedCatalogs: []', 'delegation input explicitly supplies catalog context');
assertIncludes(foldersStore, "relatedChats: [{ subjectType: 'chat.metadata', subjectId: chatSubjectId }]",
  'delegation input supplies chat context');
assertIncludes(foldersStore, 'materializedCacheObservation: { status: \'fresh\' }', 'delegation input supplies cache observation context');
assertIncludes(foldersStore, 'existingBindings: siblingBindings', 'delegation input separates sibling/existing context');
assertIncludes(foldersStore, "sourceTag: 'desktop'", 'delegation input uses canonical desktop source tag');
assertIncludes(foldersStore, "bindingState: 'bound'", 'canonical row remains bound current state for bind/unbind proposal base');
assertIncludes(foldersStore, "schemaVersion: 'h2o.library.binding.v1'", 'canonical schema retained');
assertIncludes(foldersStore, 'generateLibraryBindingProposalCandidate(input)', 'F15 proposal route retained');
assertIncludes(foldersStore, "delegateF15FolderBindingWrite('unbind'", 'rebind decomposition retained');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked in F11 source');
assertNotIncludes(folderSync, 'explicitF7Fallback: true', 'repair must not set explicitF7Fallback');
assertNotIncludes(folderSync, 'allowF7Fallback: true', 'repair must not set allowF7Fallback');
assertNotIncludes(folderSync, 'f15AllowF7Fallback: true', 'repair must not set f15AllowF7Fallback');
assertNotIncludes(folderSync, 'folders.moveCanonicalChatFolderBinding(', 'repair handler must not restore bare move');
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair handler still routes through F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post apply hash gate retained');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate retained');
assertIncludes(folderSync, 'persistence-verification-failure', 'durable gate failure reason retained');
assertIncludes(folderSync, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'binding apply gate retained');

assertIncludes(canonicalizer, "var ALLOWED_BINDING_KINDS = ['chat-label', 'chat-tag', 'chat-category', 'tag-category', 'chat-folder'];",
  'ALLOWED_BINDING_KINDS unchanged with chat-folder support');
assertIncludes(canonicalizer, 'RAW_ENDPOINT_FIELD_NAMES', 'canonicalizer forbidden raw field scan retained');
assertIncludes(canonicalizer, 'return quarantine(\'forbidden-field-detected\'', 'canonicalizer forbidden field quarantine retained');
assertIncludes(preflight, 'library-binding-canonicalization-failed', 'preflight canonicalization blocker retained');
assertIncludes(preflight, 'library-binding-diagnostics-failed', 'preflight diagnostics blocker retained');
assertIncludes(preflight, 'library-binding-row-contains-forbidden-field', 'preflight forbidden-field blocker retained');
assertIncludes(diagnostics, 'library-binding-row-contains-forbidden-field', 'diagnostics forbidden-field blocker retained');
assertIncludes(proposal, 'scanDomain(SUBJECT_TYPE, args, \'device-local\'', 'proposal privacy scan retained');
assertIncludes(proposal, 'library-binding-preflight-not-ok', 'proposal preflight blocker retained');
assertIncludes(shadowSource, 'missing-chat-subject-hash', 'shadow missing chat subject blocker retained');
assertIncludes(shadowSource, 'missing-folder-subject-hash', 'shadow missing folder subject blocker retained');

assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

function createContext() {
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
  context.H2O = {
    Studio: {
      identity: {
        get() {
          return {
            physicalDeviceIdHash: sha256('device'),
            installIdHash: sha256('install'),
            syncPeerIdHash: sha256('peer'),
          };
        },
      },
    },
    Desktop: { Sync: {} },
  };
  vm.createContext(context);
  return context;
}

function runFile(context, rel) {
  vm.runInContext(read(rel), context, { filename: rel });
}

function codeList(entries) {
  return Array.isArray(entries)
    ? entries.map((entry) => (entry && typeof entry === 'object' ? String(entry.code || '') : String(entry || '')))
      .filter(Boolean)
    : [];
}

function proposalInputFor(canonicalBinding, operation, common) {
  return {
    operation,
    diagnosticIntent: operation,
    canonicalBinding,
    originAccountIdHash: common.account,
    localAccountIdHash: common.account,
    perEnvelopeSalt: common.salt,
    actorPeer: common.actorPeer,
    ownerStatus: 'reachable',
    sourceTag: 'desktop',
    relatedCatalogs: [],
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: common.chatSubjectId }],
    siblingBindings: [],
    existingBindings: [],
    materializedCacheObservation: { status: 'fresh' },
    sourceMirror: { ok: true, fresh: true, mirrorFresh: true },
    replayContext: { ok: true, replaySafe: true },
    watermarkState: { ok: true, watermarkSafe: true, currentWatermark: 1, proposedWatermark: 2 },
    consumedOperationState: { ok: true, consumedSafe: true },
    observedAtIso: common.observedAtIso,
  };
}

async function runProposalHarness() {
  const context = createContext();
  for (const rel of [
    identityPath,
    privacyPath,
    lifecyclePath,
    watermarkPath,
    replayPath,
    publicationPath,
    canonicalizerPath,
    diagnosticsPath,
    preflightPath,
    proposalPath,
    shadowPath,
  ]) {
    runFile(context, rel);
  }
  const sync = context.H2O.Desktop.Sync;
  assert.equal(typeof sync.canonicalizeLibraryBinding, 'function', 'canonicalizer must load in harness');
  assert.equal(typeof sync.diagnoseLibraryBinding, 'function', 'diagnostics must load in harness');
  assert.equal(typeof sync.preflightLibraryBinding, 'function', 'preflight must load in harness');
  assert.equal(typeof sync.generateLibraryBindingProposalCandidate, 'function', 'proposal generator must load in harness');
  assert.equal(typeof sync.createLibraryFolderBindingMigrationShadow, 'function', 'shadow helper must load in harness');

  const common = {
    account: sha256('f15.local-account'),
    salt: sha256('f15.repair-origin.salt'),
    chatSubjectId: sha256('chat.metadata:repair-chat'),
    folderSubjectId: sha256('folder.metadata:repair-folder'),
    observedAtIso: '2026-07-01T10:00:00Z',
    actorPeer: {
      physicalDeviceIdHash: sha256('device'),
      installIdHash: sha256('install'),
      syncPeerIdHash: sha256('peer'),
    },
  };

  const oldCompatInput = {
    operation: 'unbind',
    bindingKind: 'chat-folder',
    bindingState: 'unbound',
    leftSubjectId: common.chatSubjectId,
    rightSubjectId: common.folderSubjectId,
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'folder.metadata',
    originAccountIdHash: common.account,
    localAccountIdHash: common.account,
    perEnvelopeSalt: common.salt,
    actorPeer: common.actorPeer,
    ownerStatus: 'reachable',
    sourceTag: 'f7-folder-binding-compat',
    relatedChats: [{ subjectType: 'chat.metadata', subjectId: common.chatSubjectId }],
    siblingBindings: [],
    sourceMirror: { ok: true, fresh: true, mirrorFresh: true },
    replayContext: { ok: true, replaySafe: true },
    watermarkState: { ok: true, watermarkSafe: true },
    consumedOperationState: { ok: true, consumedSafe: true },
    observedAtIso: common.observedAtIso,
  };
  const before = await sync.generateLibraryBindingProposalCandidate(oldCompatInput);
  assert.equal(before.ok, false, 'old compat input should not generate a proposal');
  assert.equal(before.generated, false, 'old compat input generated false');
  assert.equal(before.operation, 'unbind', 'old compat input operation unbind');
  assert.equal(before.diagnostics.sourceKind, 'missing', 'old compat input resolves as missing canonical source');
  assert.ok(codeList(before.blockers).includes('library-binding-preflight-not-ok'),
    'old compat input should fail preflight');
  assert.ok(codeList(before.blockers).includes('library-binding-row-contains-forbidden-field'),
    'old compat input should surface forbidden-field blocker through invalid row/source');

  const row = {
    bindingKind: 'chat-folder',
    bindingState: 'bound',
    leftSubjectId: common.chatSubjectId,
    rightSubjectId: common.folderSubjectId,
    leftSubjectType: 'chat.metadata',
    rightSubjectType: 'folder.metadata',
    originAccountIdHash: common.account,
    perEnvelopeSalt: common.salt,
    sourceTag: 'desktop',
    observedAtIso: common.observedAtIso,
    boundAtIso: common.observedAtIso,
  };
  const canonicalizerResult = await sync.canonicalizeLibraryBinding(row);
  assert.equal(canonicalizerResult.ok, true, 'clean canonical row should canonicalize');
  assert.equal(canonicalizerResult.quarantined, false, 'clean canonical row should not quarantine');
  const canonicalBinding = canonicalizerResult.canonicalBinding;
  assert.equal(canonicalBinding.bindingKind, 'chat-folder', 'canonical binding kind chat-folder');
  assert.equal(canonicalBinding.bindingState, 'bound', 'canonical binding state bound');
  assert.equal(canonicalBinding.leftSubjectType, 'chat.metadata', 'canonical left endpoint chat.metadata');
  assert.equal(canonicalBinding.rightSubjectType, 'folder.metadata', 'canonical right endpoint folder.metadata');

  const cleanContextScan = sync.kernel.scanDomainForbiddenFields('library.binding', {
    canonicalBinding,
    redactionClass: 'redacted',
  });
  assert.equal(cleanContextScan.ok, true, 'clean canonicalBinding wrapper must pass privacy scan');
  assert.equal((cleanContextScan.forbiddenFields || []).length, 0, 'clean canonicalBinding wrapper has no forbidden fields');

  const enrichedInputWithoutTopLevelSubjects = proposalInputFor(canonicalBinding, 'unbind', common);
  const brokenShadow = await sync.createLibraryFolderBindingMigrationShadow({
    chatSubjectId: enrichedInputWithoutTopLevelSubjects.leftSubjectId,
    folderSubjectId: enrichedInputWithoutTopLevelSubjects.rightSubjectId,
    perEnvelopeSalt: enrichedInputWithoutTopLevelSubjects.perEnvelopeSalt,
    observedAtIso: enrichedInputWithoutTopLevelSubjects.observedAtIso,
  });
  const brokenShadowBlockers = codeList(brokenShadow.blockers);
  assert.equal(brokenShadow.ok, false, 'old removed top-level subject shadow path should fail');
  assert.ok(brokenShadowBlockers.includes('missing-chat-subject-hash'),
    'old removed top-level subject shadow path should miss chat subject hash');
  assert.ok(brokenShadowBlockers.includes('missing-folder-subject-hash'),
    'old removed top-level subject shadow path should miss folder subject hash');

  const patchedShadow = await sync.createLibraryFolderBindingMigrationShadow({
    chatSubjectId: canonicalBinding.leftSubjectId,
    folderSubjectId: canonicalBinding.rightSubjectId,
    perEnvelopeSalt: enrichedInputWithoutTopLevelSubjects.perEnvelopeSalt,
    observedAtIso: enrichedInputWithoutTopLevelSubjects.observedAtIso,
  });
  assert.equal(patchedShadow.ok, true, `patched canonicalBinding shadow failed: ${codeList(patchedShadow.blockers).join(',')}`);
  assert.equal(patchedShadow.privacy.ok, true, 'patched canonicalBinding shadow privacy ok');

  const unbindProposal = await sync.generateLibraryBindingProposalCandidate(
    proposalInputFor(canonicalBinding, 'unbind', common)
  );
  assert.equal(unbindProposal.ok, true, `unbind proposal failed: ${codeList(unbindProposal.blockers).join(',')}`);
  assert.equal(unbindProposal.generated, true, 'unbind proposal generated');
  assert.equal(unbindProposal.operation, 'unbind', 'unbind proposal operation');
  assert.equal(unbindProposal.preflight.ok, true, 'unbind preflight ok');
  assert.equal(unbindProposal.preflight.actionable, true, 'unbind preflight actionable');
  assert.equal(unbindProposal.diagnostics.sourceKind, 'canonicalBinding', 'unbind sourceKind canonicalBinding');
  assert.equal(unbindProposal.diagnostics.bindingKindValid, true, 'unbind binding kind valid');
  assert.equal(unbindProposal.diagnostics.endpointTypeConsistent, true, 'unbind endpoint type consistent');
  assert.equal(unbindProposal.diagnostics.bindingStateValid, true, 'unbind binding state valid');
  assert.equal(unbindProposal.diagnostics.hashShapeValid, true, 'unbind hash shape valid');
  assert.equal(unbindProposal.diagnostics.relatedChatContextSupplied, true, 'unbind chat context supplied');
  assert.equal(unbindProposal.diagnostics.relatedCatalogContextSupplied, true, 'unbind catalog context supplied');
  assert.equal(unbindProposal.preflight.preflight.endpointTypesValid, true, 'unbind preflight endpoint types valid');
  assert.equal(unbindProposal.preflight.preflight.endpointSubjectHashesValid, true, 'unbind preflight subject hashes valid');

  const bindProposal = await sync.generateLibraryBindingProposalCandidate(
    proposalInputFor(canonicalBinding, 'bind', common)
  );
  assert.equal(bindProposal.ok, true, `bind proposal failed: ${codeList(bindProposal.blockers).join(',')}`);
  assert.equal(bindProposal.generated, true, 'bind proposal generated');
  assert.equal(bindProposal.operation, 'bind', 'bind proposal operation');
  assert.equal(bindProposal.preflight.ok, true, 'bind preflight ok');
  assert.equal(bindProposal.preflight.actionable, true, 'bind preflight actionable');
  assert.equal(bindProposal.diagnostics.sourceKind, 'canonicalBinding', 'bind sourceKind canonicalBinding');
  assert.equal(bindProposal.diagnostics.bindingKindValid, true, 'bind binding kind valid');
  assert.equal(bindProposal.diagnostics.endpointTypeConsistent, true, 'bind endpoint type consistent');
  assert.equal(bindProposal.diagnostics.bindingStateValid, true, 'bind binding state valid');
  assert.equal(bindProposal.diagnostics.hashShapeValid, true, 'bind hash shape valid');
  assert.equal(bindProposal.diagnostics.relatedChatContextSupplied, true, 'bind chat context supplied');
  assert.equal(bindProposal.diagnostics.relatedCatalogContextSupplied, true, 'bind catalog context supplied');
  assert.equal(bindProposal.diagnostics.siblingBindingContextSupplied, true, 'bind sibling context supplied');
  assert.equal(bindProposal.preflight.preflight.endpointTypesValid, true, 'bind preflight endpoint types valid');
  assert.equal(bindProposal.preflight.preflight.endpointSubjectHashesValid, true, 'bind preflight subject hashes valid');

  return {
    beforeBlockers: codeList(before.blockers),
    beforeSourceKind: before.diagnostics.sourceKind,
    brokenShadowBlockers,
    patchedShadowOk: patchedShadow.ok === true,
    unbindSubjectId: unbindProposal.subjectId,
    bindSubjectId: bindProposal.subjectId,
  };
}

const harness = await runProposalHarness();

for (const forbiddenClaim of [
  'binding-mismatch is allowed',
  'productSyncReady is true',
  'WebDAV/cloud/relay ready',
  'Phase A passed',
  'Phase B passed',
  'Fallback restored',
]) {
  assert.ok(!flatEvidence.includes(forbiddenClaim), `evidence must not claim ${forbiddenClaim}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-canonical-row-enrichment-implementation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-canonical-row-enrichment-implementation',
  evidence: evidencePath,
  shadowRegressionEvidence: shadowRegressionEvidencePath,
  verdict: 'BINDING_F15_CANONICAL_ROW_ENRICHMENT_IMPLEMENTED',
  priorBlockerCommit: IMPLEMENTATION_COMMIT,
  sourceChanged: foldersStorePath,
  canonicalizerWeakened: false,
  preflightWeakened: false,
  privacyWeakened: false,
  fallbackRestored: false,
  beforeCompatSourceKind: harness.beforeSourceKind,
  beforeCompatBlockers: harness.beforeBlockers,
  brokenShadowMissingSubjectHashes: harness.brokenShadowBlockers.includes('missing-chat-subject-hash') &&
    harness.brokenShadowBlockers.includes('missing-folder-subject-hash'),
  patchedShadowOk: harness.patchedShadowOk,
  shadowReadsCanonicalBinding: true,
  unbindProposalGenerated: true,
  bindProposalGenerated: true,
  f15RouteRetained: true,
  busyAwareDurableGateRetained: true,
  postApplyHashGateRetained: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  liveApplyPerformed: false,
  recommendedNext: 'independent review, then retry Phase A',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-canonical-row-enrichment-implementation');
