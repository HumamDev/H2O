#!/usr/bin/env node
//
// Real WebDAV/cloud/relay transport dry-run implementation validator.
//
// Proves the dry-run substrate requires B1-B6 + B8 + B7 evidence, returns a hash-only
// non-writing ready result for valid dry-run input, blocks write/mutation/relay/CAS/
// fullBundle.v3/export/outbox/ledger/raw/local-mock substitutions, and keeps
// productSyncReady:false and transportReady:false authoritative.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-dry-run.js';
const evidencePath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-dry-run-implementation.md';
const b7ImplPath = 'release-evidence/2026-07-01/real-transport-b7-transportready-evaluation-implementation.md';
const b8ImplPath = 'release-evidence/2026-07-01/real-transport-b8-approval-acceptance-implementation.md';
const b1b6RollupPath = 'release-evidence/2026-07-01/real-transport-b1-b6-implementation-rollup.md';
const b6ImplPath = 'release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-implementation.md';
const b5ImplPath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-implementation.md';
const b4ImplPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-implementation.md';
const b3ImplPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md';
const b2ImplPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const designRollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalMockRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const finalTransportRollupPath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyContractPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

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
  assert.doesNotMatch(src, /https?:\/\//i, `${label}: raw URL must not appear`);
  assert.doesNotMatch(src, /\b(?:dav|webdav|smb|s3|ftp):\/\//i, `${label}: raw remote scheme must not appear`);
  assert.doesNotMatch(src, /\b(?:password|passwd|secret|apikey|api_key|access[_-]?key)\s*[:=]\s*\S/i,
    `${label}: raw credential assignment must not appear`);
  assert.doesNotMatch(src, /\bBearer\s+[A-Za-z0-9._-]{6,}|\bBasic\s+[A-Za-z0-9+/=]{6,}/,
    `${label}: raw auth header must not appear`);
}

function H(d) {
  return `sha256:${String(d).repeat(64).slice(0, 64)}`;
}

const moduleSource = read(modulePath);
const evidence = read(evidencePath);
const flat = compact(evidence);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportDryRun;
}

const PH = H('a');
const valid = {
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
    idempotencyKeyHash: H('8'),
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withMutation(mutator) {
  const next = clone(valid);
  mutator(next);
  return next;
}

function assertBlocked(api, label, request, expectedBlocker) {
  const result = api.evaluateRealTransportDryRun(request);
  assert.equal(result.ok, false, `${label}: must block`);
  assert.equal(result.status, 'blocked-real-webdav-cloud-relay-transport-dry-run', `${label}: blocked status`);
  assert.ok(result.blockers.includes(expectedBlocker), `${label}: missing blocker ${expectedBlocker}`);
  assertNoSideEffects(result, label);
}

function assertNoSideEffects(result, label) {
  for (const [key, expected] of Object.entries({
    realTransportWrite: false,
    realWebDAVTransportAvailable: false,
    writesWebDAV: false,
    writesCloud: false,
    writesRelay: false,
    enqueuesRelay: false,
    writesCAS: false,
    writesFiles: false,
    mutatesExportState: false,
    mintsExportId: false,
    burnsSequence: false,
    publicationLedgerTouched: false,
    relayOutboxTouched: false,
    outboxWriteAllowed: false,
    ledgerWriteAllowed: false,
    fullBundleV3Started: false,
    transportReady: false,
    productSyncReady: false,
    noCleanupAuthority: true,
    noA950Mutation: true,
  })) {
    assert.equal(result[key], expected, `${label}: ${key}`);
  }
}

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'REAL WEBDAV/CLOUD/RELAY TRANSPORT DRY-RUN SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  '34356fa6',
  'a4777528',
  '10e1ee6c',
  '7cac0d82',
  '334361cc',
  '1117f976',
  '804b6d67',
  'de4aa12d',
  '93eb9065',
  'src-surfaces-base/studio/sync/real-transport-dry-run.js',
  'H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun(request)',
  'real-webdav-cloud-relay-transport-dry-run-evaluate',
  'real-webdav-cloud-relay-transport-dry-run-ready',
  'realTransportDryRun:true',
  'realTransportWrite:false',
  'realWebDAVTransportAvailable:false',
  'transportReadyCandidate:true',
  'transportReady:false',
  'transportReadyFlipAuthorized:false',
  'productSyncReady:false',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'real write is authorized',
  'outbox row was created',
  'ledger row was written',
  'a950 was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim ${forbidden}`);
}
assertPrivacySafe(evidence, 'dry-run evidence');

assertIncludes(read(b7ImplPath), 'B7 REAL TRANSPORTREADY EVALUATION SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B7 implementation respected');
assertIncludes(read(b8ImplPath), 'B8 REAL APPROVAL ACCEPTANCE SUBSTRATE IMPLEMENTED AS A NON-WRITING',
  'B8 implementation respected');
assertIncludes(read(b1b6RollupPath), 'B1-B6 REAL-TRANSPORT SUBSTRATES ARE IMPLEMENTED AS STANDALONE',
  'B1-B6 rollup respected');
assertIncludes(read(b6ImplPath), 'B6 REAL SEQUENCE / EXPORT-ID SEMANTICS SUBSTRATE IMPLEMENTED', 'B6 respected');
assertIncludes(read(b5ImplPath), 'B5 REAL CONFLICT / PARTIAL-WRITE HANDLING SUBSTRATE IMPLEMENTED', 'B5 respected');
assertIncludes(read(b4ImplPath), 'B4 REAL ENQUEUE / OUTBOX / PUBLICATION-LEDGER BOUNDARY SUBSTRATE IMPLEMENTED',
  'B4 respected');
assertIncludes(read(b3ImplPath), 'B3 DURABLE REAL-TRANSPORT IDEMPOTENCY STORE SUBSTRATE IMPLEMENTED', 'B3 respected');
assertIncludes(read(b2ImplPath), 'B2 REAL CONTROLLED-WRITE KILL-SWITCH LIFECYCLE SUBSTRATE IMPLEMENTED',
  'B2 respected');
assertIncludes(read(b1ImplPath), 'B1 REAL TARGET CONFIG / CREDENTIALS / PEER IDENTITY SUBSTRATE IMPLEMENTED',
  'B1 respected');
assertIncludes(read(designRollupPath), 'ALL EIGHT REAL-TRANSPORT GAP-REVIEW BLOCKERS (B1-B8) ARE DESIGN-SPECIFIED',
  'B1-B8 rollup respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalMockRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'controlled local mock final rollup respected');
assertIncludes(read(finalTransportRollupPath), '`transportReady:false` remains authoritative', 'final transport rollup respected');
assertIncludes(read(privacyContractPath), 'All transport-readiness evidence remains privacy-safe', 'privacy contract respected');
assertIncludes(read(rollbackPath), 'rollbackDisableFailClosedProof:true', 'rollback proof respected');
assertIncludes(read(fullBundleCloseoutPath), 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN', 'fullBundle closeout respected');
assertIncludes(read(relayCloseoutPath), 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN', 'relay closeout respected');
assertIncludes(read(webdavCloseoutPath), 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED', 'WebDAV closeout respected');
assertIncludes(chatSavingBoundary, 'Saved-chat archive package cloud-sync boundary validator', 'Chat Saving CAS boundary validator present');

// ---------------------------------------------------------------------------
// (2) Source anchors: standalone/non-writing/coercion-resistant.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportDryRun.evaluateRealTransportDryRun =',
  'dry-run API assignment');
assertIncludes(moduleSource, "SCHEMA = 'h2o.studio.sync.real-transport-dry-run.v1'", 'schema literal');
assertIncludes(moduleSource, "DRY_RUN_GATE = 'real-webdav-cloud-relay-transport-dry-run-evaluate'",
  'gate literal');
for (const token of [
  'realTransportDryRun: true',
  'dryRunOnlyAvailable: true',
  'realTransportWrite: false',
  'realWebDAVTransportAvailable: false',
  'transportReadyFlipAuthorized: false',
  'transportReady: false',
  'productSyncReady: false',
  'localExportableSyncReadyIsAuthorization: false',
  'transportEligibilityIsAuthorization: false',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesRelay: false',
  'enqueuesRelay: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'publicationLedgerTouched: false',
  'relayOutboxTouched: false',
  'fullBundleV3Started: false',
  'noCleanupAuthority: true',
  'noA950Mutation: true',
]) {
  assertIncludes(moduleSource, token, `dry-run invariant ${token}`);
}
for (const forbidden of [
  'realTransportWrite: true',
  'realWebDAVTransportAvailable: true',
  'transportReadyFlipAuthorized: true',
  'transportReady: true',
  'productSyncReady: true',
  'writesWebDAV: true',
  'writesCloud: true',
  'writesRelay: true',
  'enqueuesRelay: true',
  'writesCAS: true',
  'writesFiles: true',
  'mutatesExportState: true',
  'mintsExportId: true',
  'burnsSequence: true',
  'publicationLedgerTouched: true',
  'relayOutboxTouched: true',
  'fullBundleV3Started: true',
  'noCleanupAuthority: false',
]) {
  assertNotIncludes(moduleSource, forbidden, `source must not contain ${forbidden}`);
}
for (const writePrimitive of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'writeFile(', 'appendFile(', 'localStorage.setItem', 'indexedDB.open']) {
  assertNotIncludes(moduleSource, writePrimitive, `module must remain pure/non-writing (${writePrimitive})`);
}
assertNotIncludes(studioHtml, 'real-transport-dry-run.js', 'dry-run module must not be wired into studio.html');
assertNotIncludes(packStudio, 'real-transport-dry-run.js', 'dry-run module must not be wired into pack-studio');
assertPrivacySafe(moduleSource, 'dry-run source');

// ---------------------------------------------------------------------------
// (3) Behavioral VM execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportDryRun, 'function', 'dry-run API installed');

const ready = api.evaluateRealTransportDryRun(valid);
assert.equal(ready.ok, true, 'valid real dry-run returns ok');
assert.equal(ready.status, 'real-webdav-cloud-relay-transport-dry-run-ready', 'ready status');
assert.equal(ready.gateSatisfied, true, 'gate satisfied');
assert.equal(ready.realTransportDryRun, true, 'real transport dry-run evaluated');
assert.equal(ready.dryRunOnlyAvailable, true, 'dry-run only available');
assert.equal(ready.transportReadyCandidate, true, 'transportReady candidate evidence');
assert.equal(ready.realTransportApprovalAccepted, true, 'B8 approval accepted evidence present');
assert.equal(ready.privacy.hashOnly, true, 'hash-only privacy');
assert.equal(ready.privacy.rawInputRejected, false, 'no raw input rejected for valid request');
assertNoSideEffects(ready, 'valid ready result');

const blockCases = [
  ['wrong gate', (r) => { r.gate = 'wrong'; }, 'real-transport-dry-run-gate-required'],
  ['dryRun false', (r) => { r.dryRun = false; }, 'real-transport-dry-run-required'],
  ['apply true', (r) => { r.apply = true; }, 'real-transport-dry-run-apply-blocked'],
  ['missing B1', (r) => { delete r.evidence.b1TargetConfigRefHash; }, 'real-transport-dry-run-b1-evidence-missing'],
  ['missing B2', (r) => { delete r.evidence.b2KillSwitchRefHash; }, 'real-transport-dry-run-b2-evidence-missing'],
  ['missing B3', (r) => {
    delete r.evidence.b3IdempotencyRefHash;
    delete r.evidence.idempotencyKeyHash;
  }, 'real-transport-dry-run-b3-evidence-missing'],
  ['missing B4', (r) => { delete r.evidence.b4OutboxBoundaryRefHash; }, 'real-transport-dry-run-b4-evidence-missing'],
  ['missing B5', (r) => { delete r.evidence.b5ConflictPolicyRefHash; }, 'real-transport-dry-run-b5-evidence-missing'],
  ['missing B6', (r) => { delete r.evidence.b6SequenceExportRefHash; }, 'real-transport-dry-run-b6-evidence-missing'],
  ['missing B8', (r) => { r.evidence.realTransportApprovalAccepted = false; }, 'real-transport-dry-run-b8-approval-missing'],
  ['missing B7', (r) => {
    r.evidence.transportReadyCandidate = false;
    r.evidence.b7ReadinessCandidate = false;
  }, 'real-transport-dry-run-b7-candidate-missing'],
  ['productSyncReady true', (r) => { r.evidence.productSyncReady = true; }, 'real-transport-dry-run-product-sync-ready-must-remain-false'],
  ['transportReady true', (r) => { r.evidence.transportReady = true; }, 'real-transport-dry-run-b7-candidate-missing'],
  ['local mock target', (r) => { r.evidence.targetMode = 'local-mock-webdav'; }, 'real-transport-dry-run-real-target-required'],
  ['local mock approval', (r) => { r.evidence.scope = 'local-mock-webdav-target-only'; }, 'real-transport-dry-run-local-mock-not-accepted'],
  ['write WebDAV', (r) => { r.evidence.writeWebDAV = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['enqueue relay', (r) => { r.evidence.enqueueRelay = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['start fullBundle v3', (r) => { r.evidence.startFullBundleV3 = true; }, 'real-transport-dry-run-fullbundle-v3-request-blocked'],
  ['mint export id', (r) => { r.evidence.mintExportId = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['burn sequence', (r) => { r.evidence.burnSequence = true; }, 'real-transport-dry-run-write-or-mutation-request-blocked'],
  ['write outbox', (r) => { r.evidence.writeOutbox = true; }, 'real-transport-dry-run-outbox-ledger-request-blocked'],
  ['write ledger', (r) => { r.evidence.writePublicationLedger = true; }, 'real-transport-dry-run-outbox-ledger-request-blocked'],
  ['raw endpoint', (r) => { r.evidence.rawEndpoint = 'raw-remote-root'; }, 'real-transport-dry-run-raw-input-rejected'],
  ['CAS key', (r) => { r.evidence.casKey = 'raw-cas-key'; }, 'real-transport-dry-run-cas-key-input-rejected'],
  ['a950 mutation', (r) => { r.evidence.mutateA950 = true; }, 'real-transport-dry-run-a950-cleanup-or-leakage-blocked'],
  ['payload mismatch', (r) => { r.evidence.candidateBundleHash = H('0'); }, 'real-transport-dry-run-fullbundle-v2-envelope-invalid'],
];

for (const [label, mutate, expectedBlocker] of blockCases) {
  assertBlocked(api, label, withMutation(mutate), expectedBlocker);
}

const diag = api.diagnose();
assert.equal(diag.installed, true, 'diagnose installed');
assert.equal(diag.gate, 'real-webdav-cloud-relay-transport-dry-run-evaluate', 'diagnose gate');
assert.equal(diag.realWebDAVTransportAvailable, false, 'diagnose real transport unavailable');
assert.equal(diag.transportReady, false, 'diagnose transportReady false');
assert.equal(diag.productSyncReady, false, 'diagnose productSyncReady false');

console.log(JSON.stringify({
  ok: true,
  validator: 'validate-real-webdav-cloud-relay-transport-dry-run-implementation',
  source: modulePath,
  evidence: evidencePath,
  validStatus: ready.status,
  blockersExercised: blockCases.length,
  realTransportWrite: ready.realTransportWrite,
  writesWebDAV: ready.writesWebDAV,
  enqueuesRelay: ready.enqueuesRelay,
  publicationLedgerTouched: ready.publicationLedgerTouched,
  relayOutboxTouched: ready.relayOutboxTouched,
  fullBundleV3Started: ready.fullBundleV3Started,
  productSyncReady: ready.productSyncReady,
  transportReady: ready.transportReady,
}, null, 2));
