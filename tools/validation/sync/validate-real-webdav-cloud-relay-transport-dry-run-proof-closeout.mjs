#!/usr/bin/env node
//
// Real WebDAV/cloud/relay transport dry-run proof closeout validator.
//
// Re-executes the real dry-run substrate in a VM/source harness, proves a valid
// real transport dry-run is ready with zero writes, proves blocked cases fail
// closed, and verifies the module remains standalone/non-wired.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-dry-run.js';
const closeoutPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-dry-run-proof-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-dry-run-implementation.md';
const b7ImplPath = 'release-evidence/2026-07-01/real-transport-b7-transportready-evaluation-implementation.md';
const b8ImplPath = 'release-evidence/2026-07-01/real-transport-b8-approval-acceptance-implementation.md';
const b1b6RollupPath = 'release-evidence/2026-07-01/real-transport-b1-b6-implementation-rollup.md';
const finalTransportRollupPath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyContractPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';

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

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const moduleSource = read(modulePath);
const closeout = read(closeoutPath);
const closeoutFlat = compact(closeout);
const implementation = read(implementationPath);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportDryRun;
}

const PH = H('a');
const validRequest = {
  dryRun: true,
  apply: false,
  gate: 'real-webdav-cloud-relay-transport-dry-run-evaluate',
  evidence: {
    targetMode: 'real-webdav',
    b1TargetConfigReady: true,
    b1TargetConfigRefHash: H('1'),
    endpointRefHash: H('2'),
    remoteRootRefHash: H('3'),
    credentialRefHash: H('4'),
    peerIdentityBindingHash: H('5'),
    localClientIdentityHash: H('6'),
    b2KillSwitchLifecycleReady: true,
    b2KillSwitchRefHash: H('7'),
    b3DurableIdempotencyReady: true,
    b3IdempotencyRefHash: H('8'),
    idempotencyKeyHash: H('8'),
    b4EnqueueOutboxBoundaryReady: true,
    b4OutboxBoundaryRefHash: H('9'),
    b5ConflictPartialWriteReady: true,
    b5ConflictPolicyRefHash: H('b'),
    b6SequenceExportReady: true,
    b6SequenceExportRefHash: H('c'),
    b8ApprovalAccepted: true,
    realTransportApprovalAccepted: true,
    b8ApprovalRefHash: H('d'),
    b7ReadinessCandidate: true,
    transportReadyCandidate: true,
    transportReadyFlipAuthorized: false,
    b7ReadinessPolicyRefHash: H('e'),
    transportReadinessReviewRefHash: H('f'),
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
    candidatePayloadHash: PH,
    candidateBundleHash: PH,
    fullBundleV2EnvelopeHash: PH,
    payloadSchema: 'h2o.studio.fullBundle.v2',
    fullBundleV3Deferred: true,
    chatSavingCasSeparate: true,
    noChatSavingCAS: true,
    chatSavingCasBlocked: true,
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    noA950Mutation: true,
    privacyHashOnly: true,
  },
};

function assertNoSideEffects(result, label) {
  const expectedFalse = [
    'realTransportWrite',
    'realWebDAVTransportAvailable',
    'writesWebDAV',
    'writesCloud',
    'writesRelay',
    'enqueuesRelay',
    'writesCAS',
    'writesFiles',
    'mutatesExportState',
    'mintsExportId',
    'burnsSequence',
    'publicationLedgerTouched',
    'relayOutboxTouched',
    'outboxWriteAllowed',
    'ledgerWriteAllowed',
    'fullBundleV3Started',
    'transportReady',
    'productSyncReady',
  ];
  for (const key of expectedFalse) assert.equal(result[key], false, `${label}: ${key}`);
  assert.equal(result.noCleanupAuthority, true, `${label}: noCleanupAuthority`);
  assert.equal(result.noA950Mutation, true, `${label}: noA950Mutation`);
}

function blockCase(api, label, mutate, expectedBlocker) {
  const request = clone(validRequest);
  mutate(request);
  const result = api.evaluateRealTransportDryRun(request);
  assert.equal(result.ok, false, `${label}: blocked`);
  assert.equal(result.status, 'blocked-real-webdav-cloud-relay-transport-dry-run', `${label}: blocked status`);
  assert.ok(result.blockers.includes(expectedBlocker), `${label}: expected blocker ${expectedBlocker}`);
  assertNoSideEffects(result, label);
}

// ---------------------------------------------------------------------------
// Evidence and anchor checks.
// ---------------------------------------------------------------------------
for (const token of [
  'REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN PROOF PASSED BY VM SOURCE HARNESS - ZERO WRITE',
  'f93350d4a8e83bf49a00e0061f98f5c52454e74d',
  '34356fa6',
  'a4777528',
  '10e1ee6c',
  'H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun(request)',
  'real-webdav-cloud-relay-transport-dry-run-ready',
  'realTransportDryRun:true',
  'realTransportWrite:false',
  'writesWebDAV:false',
  'enqueuesRelay:false',
  'relayOutboxTouched:false',
  'publicationLedgerTouched:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
]) {
  assertIncludes(closeoutFlat, token, `closeout token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'real write is authorized',
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'outbox row was created',
  'ledger row was written',
  'a950 was cleaned',
]) {
  assertNotIncludes(closeoutFlat, forbidden, `closeout must not claim ${forbidden}`);
}

assertIncludes(implementation, 'REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'implementation evidence respected');
assertIncludes(read(b7ImplPath), 'B7 REAL TRANSPORTREADY EVALUATION SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B7 implementation respected');
assertIncludes(read(b8ImplPath), 'B8 REAL APPROVAL ACCEPTANCE SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B8 implementation respected');
assertIncludes(read(b1b6RollupPath), 'B1-B6 REAL-TRANSPORT SUBSTRATES ARE IMPLEMENTED AS STANDALONE',
  'B1-B6 rollup respected');
assertIncludes(read(finalTransportRollupPath), '`transportReady:false` remains authoritative',
  'final transport rollup respected');
assertIncludes(read(privacyContractPath), 'All transport-readiness evidence remains privacy-safe',
  'privacy contract respected');
assertIncludes(read(rollbackPath), 'rollbackDisableFailClosedProof:true', 'rollback respected');
assertIncludes(read(fullBundleCloseoutPath), 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN',
  'fullBundle closeout respected');
assertIncludes(read(relayCloseoutPath), 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN',
  'relay closeout respected');
assertIncludes(read(webdavCloseoutPath), 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED',
  'WebDAV closeout respected');

// ---------------------------------------------------------------------------
// Source remains standalone and non-writing.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun =',
  'dry-run API exposed');
assertNotIncludes(studioHtml, 'real-transport-dry-run.js', 'not wired into studio.html');
assertNotIncludes(packStudio, 'real-transport-dry-run.js', 'not wired into pack-studio');
for (const forbidden of [
  'sqlExecute',
  'fetch(',
  'writeFile(',
  'writeFileSync',
  'invoke(',
  'localStorage.setItem',
  'dispatchExecuteRelay',
  'enqueueRealRelay(',
  'writePublicationLedger(',
  'writeOutbox(',
]) {
  assertNotIncludes(moduleSource, forbidden, `source non-writing primitive ${forbidden}`);
}

// ---------------------------------------------------------------------------
// VM/source proof.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportDryRun, 'function', 'dry-run API installed in VM');

const validResult = api.evaluateRealTransportDryRun(validRequest);
assert.equal(validResult.ok, true, 'valid dry-run proof passes');
assert.equal(validResult.status, 'real-webdav-cloud-relay-transport-dry-run-ready', 'valid status');
assert.equal(validResult.realTransportDryRun, true, 'realTransportDryRun');
assert.equal(validResult.dryRunOnlyAvailable, true, 'dryRunOnlyAvailable');
assert.equal(validResult.transportReadyCandidate, true, 'transportReadyCandidate');
assert.equal(validResult.realTransportApprovalAccepted, true, 'realTransportApprovalAccepted');
assert.equal(validResult.privacy.hashOnly, true, 'privacy.hashOnly');
assertNoSideEffects(validResult, 'valid dry-run');

const blockCases = [
  ['wrong gate', (r) => { r.gate = 'wrong'; }, 'real-transport-dry-run-gate-required'],
  ['dryRun false', (r) => { r.dryRun = false; }, 'real-transport-dry-run-required'],
  ['apply true', (r) => { r.apply = true; }, 'real-transport-dry-run-apply-blocked'],
  ['missing B1', (r) => { delete r.evidence.b1TargetConfigRefHash; }, 'real-transport-dry-run-b1-evidence-missing'],
  ['missing B2', (r) => { delete r.evidence.b2KillSwitchRefHash; }, 'real-transport-dry-run-b2-evidence-missing'],
  ['missing B3', (r) => { delete r.evidence.b3IdempotencyRefHash; delete r.evidence.idempotencyKeyHash; },
    'real-transport-dry-run-b3-evidence-missing'],
  ['missing B4', (r) => { delete r.evidence.b4OutboxBoundaryRefHash; }, 'real-transport-dry-run-b4-evidence-missing'],
  ['missing B5', (r) => { delete r.evidence.b5ConflictPolicyRefHash; }, 'real-transport-dry-run-b5-evidence-missing'],
  ['missing B6', (r) => { delete r.evidence.b6SequenceExportRefHash; }, 'real-transport-dry-run-b6-evidence-missing'],
  ['missing B8', (r) => { r.evidence.realTransportApprovalAccepted = false; }, 'real-transport-dry-run-b8-approval-missing'],
  ['missing B7', (r) => { r.evidence.b7ReadinessCandidate = false; r.evidence.transportReadyCandidate = false; },
    'real-transport-dry-run-b7-candidate-missing'],
  ['productSyncReady true', (r) => { r.evidence.productSyncReady = true; },
    'real-transport-dry-run-product-sync-ready-must-remain-false'],
  ['transportReady true', (r) => { r.evidence.transportReady = true; },
    'real-transport-dry-run-b7-candidate-missing'],
  ['write request', (r) => { r.evidence.writeWebDAV = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['relay enqueue', (r) => { r.evidence.enqueueRelay = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['fullBundle v3', (r) => { r.evidence.startFullBundleV3 = true; },
    'real-transport-dry-run-fullbundle-v3-request-blocked'],
  ['export id mint', (r) => { r.evidence.mintExportId = true; },
    'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['sequence burn', (r) => { r.evidence.burnSequence = true; },
    'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['outbox write', (r) => { r.evidence.writeOutbox = true; },
    'real-transport-dry-run-outbox-ledger-request-blocked'],
  ['ledger write', (r) => { r.evidence.writePublicationLedger = true; },
    'real-transport-dry-run-outbox-ledger-request-blocked'],
  ['raw input', (r) => { r.evidence.rawEndpoint = 'raw-endpoint-ref'; },
    'real-transport-dry-run-raw-input-rejected'],
  ['CAS key input', (r) => { r.evidence.casKey = 'raw-cas-key'; },
    'real-transport-dry-run-cas-key-input-rejected'],
  ['a950 mutation', (r) => { r.evidence.mutateA950 = true; },
    'real-transport-dry-run-a950-cleanup-or-leakage-blocked'],
  ['local mock target', (r) => { r.evidence.targetMode = 'local-mock-webdav'; },
    'real-transport-dry-run-real-target-required'],
  ['local mock approval', (r) => { r.evidence.scope = 'local-mock-webdav-target-only'; },
    'real-transport-dry-run-local-mock-not-accepted'],
];

for (const [label, mutate, expectedBlocker] of blockCases) {
  blockCase(api, label, mutate, expectedBlocker);
}

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-webdav-cloud-relay-transport-dry-run-proof-closeout',
  implementationRespected: 'f93350d4',
  validStatus: validResult.status,
  blockedCases: blockCases.length,
  standaloneNonWired: true,
  realTransportWrite: validResult.realTransportWrite,
  writesWebDAV: validResult.writesWebDAV,
  enqueuesRelay: validResult.enqueuesRelay,
  relayOutboxTouched: validResult.relayOutboxTouched,
  publicationLedgerTouched: validResult.publicationLedgerTouched,
  fullBundleV3Started: validResult.fullBundleV3Started,
  productSyncReady: validResult.productSyncReady,
  transportReady: validResult.transportReady,
}, null, 2));
