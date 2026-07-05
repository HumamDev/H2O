#!/usr/bin/env node
//
// Real-transport B1-B6 implementation rollup / handoff manifest validator.
//
// Proves the rollup respects B1-B6 implementation anchors and the B1-B8 design rollup; the B1-B6 modules are present
// as standalone, non-activating, non-writing substrates; no real transport authorization, durable store/outbox/ledger
// write, export-id mint, sequence burn, fullBundle.v3 start, Chat Saving CAS path, or cleanup/a950 authority is
// introduced; and productSyncReady:false plus transportReady:false remain authoritative.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const rollupPath = 'release-evidence/2026-07-01/real-transport-b1-b6-implementation-rollup.md';
const designRollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalMockRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const finalTransportRollupPath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyContractPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackProofPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';

const modules = {
  B1: {
    commit: '93eb9065',
    path: 'src-surfaces-base/studio/sync/real-transport-target-config.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md',
    verdict: 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig',
    assign: 'H2O.Studio.sync.realTransportTargetConfig.evaluateRealTransportTargetConfig =',
    invariants: ['realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false'],
  },
  B2: {
    commit: 'de4aa12d',
    path: 'src-surfaces-base/studio/sync/real-transport-kill-switch.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md',
    verdict: 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch',
    assign: 'H2O.Studio.sync.realTransportKillSwitch.evaluateRealTransportKillSwitch =',
    invariants: ['realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false'],
  },
  B3: {
    commit: '804b6d67',
    path: 'src-surfaces-base/studio/sync/real-transport-idempotency.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md',
    verdict: 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency',
    assign: 'H2O.Studio.sync.realTransportIdempotency.evaluateRealTransportIdempotency =',
    invariants: ['durableStoreCreated: false', 'realWebDAVTransportAvailable: false', 'realTransportApprovalAccepted: false'],
  },
  B4: {
    commit: '1117f976',
    path: 'src-surfaces-base/studio/sync/real-transport-enqueue-boundary.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-implementation.md',
    verdict: 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary',
    assign: 'H2O.Studio.sync.realTransportEnqueueBoundary.evaluateRealTransportEnqueueBoundary =',
    invariants: [
      'realOutboxRowCreated: false',
      'publicationLedgerTouched: false',
      'relayOutboxTouched: false',
      'realWebDAVTransportAvailable: false',
      'realTransportApprovalAccepted: false',
    ],
  },
  B5: {
    commit: '334361cc',
    path: 'src-surfaces-base/studio/sync/real-transport-conflict-recovery.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-implementation.md',
    verdict: 'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery',
    assign: 'H2O.Studio.sync.realTransportConflictRecovery.evaluateRealTransportConflictRecovery =',
    invariants: [
      'realRecoveryExecuted: false',
      'retryDispatched: false',
      'remoteWriteAttempted: false',
      'realWebDAVTransportAvailable: false',
      'realTransportApprovalAccepted: false',
    ],
  },
  B6: {
    commit: '7cac0d82',
    path: 'src-surfaces-base/studio/sync/real-transport-sequence-export.js',
    evidence: 'release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-implementation.md',
    verdict: 'B6 REAL SEQUENCE / EXPORT-ID SEMANTICS SUBSTRATE IMPLEMENTED',
    api: 'H2O.Studio.sync.realTransportSequenceExport.evaluateRealTransportSequenceExport',
    assign: 'H2O.Studio.sync.realTransportSequenceExport.evaluateRealTransportSequenceExport =',
    invariants: [
      'exportIdMinted: false',
      'sequenceBurned: false',
      'mintsExportId: false',
      'burnsSequence: false',
      'publicationLedgerTouched: false',
      'relayOutboxTouched: false',
      'realWebDAVTransportAvailable: false',
      'realTransportApprovalAccepted: false',
    ],
  },
};

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(v) {
  return String(v).replace(/\s+/g, ' ');
}

function assertIncludes(src, token, label) {
  assert.ok(String(src).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(src, token, label) {
  assert.ok(!String(src).includes(token), `${label}: forbidden ${token}`);
}

function assertPrivacySafe(src, label) {
  assert.doesNotMatch(src, /https?:\/\//i, `${label}: raw URL must not be present`);
  assert.doesNotMatch(src, /\b(?:dav|webdav|smb|s3|ftp):\/\//i, `${label}: raw remote scheme must not be present`);
  assert.doesNotMatch(src, /\b(?:password|passwd|secret|apikey|api_key|access[_-]?key)\s*[:=]\s*\S/i,
    `${label}: raw credential assignment must not be present`);
  assert.doesNotMatch(src, /\bBearer\s+[A-Za-z0-9._-]{6,}|\bBasic\s+[A-Za-z0-9+/=]{6,}/,
    `${label}: raw auth header value must not be present`);
}

const rollup = read(rollupPath);
const flatRollup = compact(rollup);
const designRollup = read(designRollupPath);
const b8b7Design = read(b8b7DesignPath);
const gapReview = read(gapReviewPath);
const finalMockRollup = read(finalMockRollupPath);
const finalTransportRollup = read(finalTransportRollupPath);
const privacyContract = read(privacyContractPath);
const rollbackProof = read(rollbackProofPath);
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Rollup content anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B1-B6 REAL-TRANSPORT SUBSTRATES ARE IMPLEMENTED AS STANDALONE, NON-ACTIVATING, NON-WRITING',
  'THIS MANIFEST IS EVIDENCE + VALIDATOR ONLY',
  'B1-B8 design rollup / handoff manifest: `36e46513`',
  'real WebDAV/cloud/relay transport writes',
  'real transport approval acceptance (B8)',
  '`transportReady:true` evaluation / flip slice (B7)',
  'the `fullBundle.v2` envelope remains selected',
  '`fullBundle.v3` remains deferred and not started',
  'Chat Saving CAS remains separate and blocked/deferred',
  '`row:a950a44b859f` remains documented/quarantined debt',
  'local mock transport is not real transport',
  '`localExportableSyncReady` is not transport authorization',
  '`productSyncReady:false` and `transportReady:false` remain authoritative',
  'B8 real approval acceptance implementation',
  'B7 `transportReady` evaluation / flip slice',
  'Do NOT reopen Operational.5 cleanup/parity',
  'Do NOT clean `row:a950a44b859f` without new strict evidence',
  'Do NOT treat local mock apply as real transport',
  'Do NOT start Chat Saving CAS from this lane',
  'Do NOT reintroduce `fullBundle.v3`',
  'Do NOT wire B1-B6 into `studio.html` / `pack-studio.mjs` without a later activation slice',
  'Can Real Transport Start Now?',
  '**No.**',
]) {
  assertIncludes(flatRollup, token, `rollup token ${token}`);
}

for (const [phase, spec] of Object.entries(modules)) {
  assertIncludes(flatRollup, spec.commit, `${phase} commit anchor`);
  assertIncludes(flatRollup, spec.path, `${phase} source path`);
}

for (const forbidden of [
  'real transport is now authorized',
  'real transport may start now',
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'export id was minted',
  'sequence was burned',
  'outbox row was created',
  'publication ledger row was created',
  'row:a950a44b859f` was cleaned',
]) {
  assertNotIncludes(flatRollup, forbidden, `rollup must not claim ${forbidden}`);
}
assertPrivacySafe(rollup, 'B1-B6 rollup evidence');

// ---------------------------------------------------------------------------
// (2) Anchor prior evidence and design handoffs.
// ---------------------------------------------------------------------------
assertIncludes(designRollup, 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED',
  'B1-B8 design rollup respected');
assertIncludes(b8b7Design, 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(gapReview, 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(finalMockRollup, 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'controlled local mock final rollup respected');
assertIncludes(finalTransportRollup, 'Transport remains globally blocked', 'final transport rollup respected');
assertIncludes(privacyContract, 'All transport-readiness evidence remains privacy-safe', 'privacy contract respected');
assertIncludes(rollbackProof, 'Rollback / disable / fail-closed semantics are proven', 'rollback/fail-closed proof respected');

for (const [phase, spec] of Object.entries(modules)) {
  const evidence = read(spec.evidence);
  assertIncludes(evidence, spec.verdict, `${phase} implementation evidence verdict`);
  assertIncludes(evidence, spec.api, `${phase} implementation API evidence`);
  assertIncludes(evidence, 'non-writing', `${phase} implementation evidence non-writing`);
  assertIncludes(evidence, 'non-activating', `${phase} implementation evidence non-activating`);
  assertPrivacySafe(evidence, `${phase} implementation evidence`);
}

// ---------------------------------------------------------------------------
// (3) Source module anchors: API exposed, hardcoded no-write/no-activation flags retained.
// ---------------------------------------------------------------------------
const moduleSources = {};
for (const [phase, spec] of Object.entries(modules)) {
  const src = read(spec.path);
  moduleSources[phase] = src;
  assertIncludes(src, spec.assign, `${phase} API assignment`);
  assertIncludes(src, 'diagnose = diagnose', `${phase} diagnostic API`);
  assertIncludes(src, '__installed = true', `${phase} install marker`);
  for (const invariant of [
    ...spec.invariants,
    'productSyncReady: false',
    'transportReady: false',
    'fullBundleV3Started: false',
    'chatSavingCasBlocked: true',
    'noCleanupAuthority: true',
    'writesWebDAV: false',
    'writesCloud: false',
    'writesRelay: false',
    'enqueuesRelay: false',
    'writesCAS: false',
    'writesFiles: false',
    'mutatesExportState: false',
  ]) {
    assertIncludes(src, invariant, `${phase} invariant ${invariant}`);
  }
  for (const forbidden of [
    'realWebDAVTransportAvailable: true',
    'realTransportApprovalAccepted: true',
    'productSyncReady: true',
    'transportReady: true',
    'fullBundleV3Started: true',
    'writesWebDAV: true',
    'writesCloud: true',
    'writesRelay: true',
    'enqueuesRelay: true',
    'writesCAS: true',
    'writesFiles: true',
    'mutatesExportState: true',
    'noCleanupAuthority: false',
  ]) {
    assertNotIncludes(src, forbidden, `${phase} must not contain ${forbidden}`);
  }
  for (const writePrimitive of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'writeFile', 'appendFile', 'localStorage.setItem', 'indexedDB.open']) {
    assertNotIncludes(src, writePrimitive, `${phase} must remain pure/non-writing (${writePrimitive})`);
  }
  assertPrivacySafe(src, `${phase} source`);
}

// B1-B6 are intentionally not wired into active Desktop Studio pack/load paths.
for (const spec of Object.values(modules)) {
  const basename = path.basename(spec.path);
  assertNotIncludes(studioHtml, basename, `${basename} must not be wired into studio.html`);
  assertNotIncludes(packStudio, basename, `${basename} must not be packed by pack-studio.mjs`);
}

// ---------------------------------------------------------------------------
// (4) Active source-control plane invariants remain blocked.
// ---------------------------------------------------------------------------
for (const token of [
  'realTransportApprovalAccepted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'realWebDAVWrite: false',
  'productSyncReady: false',
  'fullBundleV3Started: false',
  'chatSavingCasBlocked: true',
  'noCleanupAuthority: true',
]) {
  assertIncludes(transportGates, token, `transport gate invariant ${token}`);
}
assertNotIncludes(transportGates, 'realTransportApprovalAccepted: true', 'real approval must remain false in active gate');
assertNotIncludes(transportGates, 'realWebDAVTransportAvailable: true', 'real WebDAV availability must remain false');
assertNotIncludes(transportGates, 'transportReady: true', 'transportReady must not be true in active gate');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS boundary remains blocked/deferred');
assertPrivacySafe(transportGates, 'transport gates source');

// No B1-B6 rollup authority reopens a950 cleanup or introduces transport activation.
const allNewlyCheckedText = [
  rollup,
  ...Object.values(moduleSources),
].join('\n');
for (const forbidden of [
  'cleanupApplyApproved: true',
  'a950CleanupApproved: true',
  'mutateA950: true',
  'deleteA950: true',
  'transportReady = true',
  'productSyncReady = true',
  'fullBundle.v3Started: true',
]) {
  assertNotIncludes(allNewlyCheckedText, forbidden, `forbidden authority ${forbidden}`);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b1-b6-implementation-rollup.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b1-b6-implementation-rollup',
  evidence: rollupPath,
  verdict: 'REAL_TRANSPORT_B1_B6_IMPLEMENTATION_ROLLUP_COMPLETE_STILL_BLOCKED',
  implementationsRespected: Object.fromEntries(Object.entries(modules).map(([phase, spec]) => [phase, spec.commit])),
  b1b8DesignRollupRespected: '36e46513',
  modulesStandaloneNonActivating: true,
  studioHtmlWired: false,
  packStudioWired: false,
  realTransportAuthorizationIntroduced: false,
  durableStoreWriteIntroduced: false,
  outboxLedgerWriteIntroduced: false,
  exportIdMintIntroduced: false,
  sequenceBurnIntroduced: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  rawEndpointCredentialPathPayloadPresent: false,
  cleanupA950MutationAuthorityIntroduced: false,
  remainingBlockers: [
    'B8-real-transport-approval-acceptance-implementation',
    'B7-transportReady-evaluation-flip-slice',
    'real-transport-dry-run',
    'explicit-first-real-write-approval',
  ],
  recommendedNextLane: 'B8-real-approval-acceptance-implementation-non-writing-hash-only',
}, null, 2));
console.log('PASS validate-real-transport-b1-b6-implementation-rollup');
