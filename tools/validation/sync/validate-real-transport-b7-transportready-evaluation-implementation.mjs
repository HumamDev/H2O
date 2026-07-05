#!/usr/bin/env node
//
// Real-transport B7 transportReady evaluation implementation validator.
//
// Proves the B7 substrate evaluates B1-B6 + B8 evidence into a modeled transportReady candidate only; it does not
// mutate source/global transportReady, does not execute transport, and keeps every write/enqueue/CAS/export/fullBundle.v3
// side-effect flag false.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-readiness.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b7-transportready-evaluation-implementation.md';
const b8ImplPath = 'release-evidence/2026-07-01/real-transport-b8-approval-acceptance-implementation.md';
const b1b6RollupPath = 'release-evidence/2026-07-01/real-transport-b1-b6-implementation-rollup.md';
const b8b7DesignPath = 'release-evidence/2026-07-01/real-transport-approval-contract-and-readiness-policy-design.md';
const b6ImplPath = 'release-evidence/2026-07-01/real-transport-b6-sequence-export-id-semantics-implementation.md';
const b5ImplPath = 'release-evidence/2026-07-01/real-transport-b5-conflict-partial-write-handling-implementation.md';
const b4ImplPath = 'release-evidence/2026-07-01/real-transport-b4-enqueue-outbox-boundary-implementation.md';
const b3ImplPath = 'release-evidence/2026-07-01/real-transport-b3-durable-idempotency-store-implementation.md';
const b2ImplPath = 'release-evidence/2026-07-01/real-transport-b2-kill-switch-lifecycle-implementation.md';
const b1ImplPath = 'release-evidence/2026-07-01/real-transport-b1-target-config-credentials-peer-identity-implementation.md';
const designRollupPath = 'release-evidence/2026-07-01/real-transport-b1-b8-implementation-readiness-rollup.md';
const gapReviewPath = 'release-evidence/2026-07-01/real-webdav-cloud-relay-transport-readiness-gap-review.md';
const finalMockRollupPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-final-rollup.md';
const transportGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
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
const transportGates = read(transportGatesPath);
const folderSync = read(folderSyncPath);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

function installModule() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(moduleSource, sandbox, { filename: modulePath });
  return sandbox.H2O?.Studio?.sync?.realTransportReadiness;
}

const PH = H('a');
const valid = {
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
  },
};

// ---------------------------------------------------------------------------
// (1) Evidence + chain anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'B7 REAL TRANSPORTREADY EVALUATION SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  'a4777528',
  '10e1ee6c',
  '26e6241b',
  '7cac0d82',
  '334361cc',
  '1117f976',
  '804b6d67',
  'de4aa12d',
  '93eb9065',
  'src-surfaces-base/studio/sync/real-transport-readiness.js',
  'H2O.Studio.sync.realTransportReadiness.evaluateRealTransportReadiness(request)',
  'transportReadyCandidate:true',
  'transportReady:false',
  'transportReadyFlipAuthorized:false',
  'productSyncReady:false',
  'B7 readiness evaluation returns `transportReadyCandidate`, not a source/global `transportReady` flip',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'real write is authorized',
  'a950 was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim ${forbidden}`);
}
assertPrivacySafe(evidence, 'B7 evidence');

assertIncludes(read(b8ImplPath), 'B8 REAL APPROVAL ACCEPTANCE SUBSTRATE IMPLEMENTED', 'B8 implementation respected');
assertIncludes(read(b1b6RollupPath), 'B1-B6 REAL-TRANSPORT SUBSTRATES ARE IMPLEMENTED AS STANDALONE',
  'B1-B6 rollup respected');
assertIncludes(read(b8b7DesignPath), 'B8 REAL-TRANSPORT APPROVAL CONTRACT AND B7 `transportReady` POLICY ARE DESIGNED',
  'B8+B7 design respected');
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
  'B1-B8 design rollup respected');
assertIncludes(read(gapReviewPath), 'REAL WEBDAV/CLOUD/RELAY TRANSPORT CANNOT START NOW', 'gap review respected');
assertIncludes(read(finalMockRollupPath), 'THE CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LANE IS COMPLETE AND AT A STABLE HANDOFF POINT',
  'controlled local mock final rollup respected');

// ---------------------------------------------------------------------------
// (2) Source anchors: standalone/non-writing/coercion-resistant.
// ---------------------------------------------------------------------------
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportReadiness.evaluateRealTransportReadiness =',
  'B7 API assignment');
assertIncludes(moduleSource, "SCHEMA = 'h2o.studio.sync.real-transport-b7-readiness.v1'", 'B7 schema literal');
assertIncludes(moduleSource, 'transportReadyCandidate: allSatisfied', 'B7 candidate is modeled');
for (const token of [
  'transportReadyFlipAuthorized: false',
  'transportReady: false',
  'productSyncReady: false',
  'realWebDAVTransportAvailable: false',
  'realTransportWriteAuthorized: false',
  'realTransportExecuted: false',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesRelay: false',
  'enqueuesRelay: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'fullBundleV3Started: false',
  'chatSavingCasBlocked: true',
  'noCleanupAuthority: true',
  'noA950Mutation: true',
]) {
  assertIncludes(moduleSource, token, `B7 invariant ${token}`);
}
for (const forbidden of [
  'transportReady: true',
  'transportReadyFlipAuthorized: true',
  'productSyncReady: true',
  'realWebDAVTransportAvailable: true',
  'realTransportWriteAuthorized: true',
  'realTransportExecuted: true',
  'writesWebDAV: true',
  'writesCloud: true',
  'writesRelay: true',
  'enqueuesRelay: true',
  'writesCAS: true',
  'writesFiles: true',
  'mutatesExportState: true',
  'mintsExportId: true',
  'burnsSequence: true',
  'fullBundleV3Started: true',
  'noCleanupAuthority: false',
]) {
  assertNotIncludes(moduleSource, forbidden, `B7 source must not contain ${forbidden}`);
}
for (const writePrimitive of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'writeFile(', 'appendFile(', 'localStorage.setItem', 'indexedDB.open']) {
  assertNotIncludes(moduleSource, writePrimitive, `B7 module must remain pure/non-writing (${writePrimitive})`);
}
assertNotIncludes(studioHtml, 'real-transport-readiness.js', 'B7 must not be wired into studio.html');
assertNotIncludes(packStudio, 'real-transport-readiness.js', 'B7 must not be wired into pack-studio');
assertPrivacySafe(moduleSource, 'B7 source');

// ---------------------------------------------------------------------------
// (3) Behavioral VM execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportReadiness, 'function', 'B7 API installed');

const candidate = api.evaluateRealTransportReadiness(valid);
assert.equal(candidate.ok, true, 'valid B1-B6+B8 evidence evaluates candidate');
assert.equal(candidate.status, 'real-transport-b7-readiness-candidate', 'candidate status');
assert.equal(candidate.realTransportReadinessEvaluated, true, 'readiness evaluated');
assert.equal(candidate.allPrerequisitesSatisfied, true, 'all prerequisites satisfied');
assert.equal(candidate.transportReadyCandidate, true, 'transportReady candidate true');
assert.equal(candidate.transportReadyFlipAuthorized, false, 'flip not authorized');
assert.equal(candidate.transportReady, false, 'transportReady false');
assert.equal(candidate.productSyncReady, false, 'productSyncReady false');
assert.equal(candidate.realWebDAVTransportAvailable, false, 'real WebDAV unavailable');
assert.equal(candidate.realTransportExecuted, false, 'real transport not executed');
assert.equal(candidate.localExportableSyncReady, true, 'local exportable ready present');
assert.equal(candidate.localExportableSyncReadyIsAuthorization, false, 'local exportable not authorization');
assert.equal(candidate.transportEligibilityFromLocalExportableReady, true, 'eligibility present');
assert.equal(candidate.transportEligibilityIsAuthorization, false, 'eligibility not authorization');
assert.equal(candidate.fullBundleV2EnvelopeBoundary, true, 'fullBundle.v2 envelope valid');
assert.equal(candidate.fullBundleV3Deferred, true, 'fullBundle.v3 deferred');
assert.equal(candidate.chatSavingCasBlocked, true, 'CAS blocked');
assert.equal(candidate.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(candidate.a950LeaksIntoExportablePayload, false, 'a950 does not leak');
for (const key of ['writesWebDAV', 'writesCloud', 'writesRelay', 'enqueuesRelay', 'writesCAS', 'writesFiles',
  'mutatesExportState', 'mintsExportId', 'burnsSequence', 'fullBundleV3Started']) {
  assert.equal(candidate[key], false, `${key} false`);
}
assert.equal(candidate.blockers.length, 0, 'valid candidate no blockers');

function cloneValid() {
  return JSON.parse(JSON.stringify(valid));
}

function block(mutator, code) {
  const request = cloneValid();
  mutator(request);
  const result = api.evaluateRealTransportReadiness(request);
  assert.equal(result.ok, false, `${code}: request should block`);
  assert.ok(result.blockers.includes(code), `${code}: blockers were ${result.blockers.join(',')}`);
  assert.equal(result.transportReadyCandidate, false, `${code}: no readiness candidate`);
  assert.equal(result.transportReadyFlipAuthorized, false, `${code}: flip unauthorized`);
  assert.equal(result.transportReady, false, `${code}: transportReady false`);
  assert.equal(result.productSyncReady, false, `${code}: productSyncReady false`);
  assert.equal(result.realWebDAVTransportAvailable, false, `${code}: real WebDAV unavailable`);
  assert.equal(result.realTransportExecuted, false, `${code}: no real transport`);
  assert.equal(result.writesWebDAV, false, `${code}: no WebDAV write`);
  assert.equal(result.writesCloud, false, `${code}: no cloud write`);
  assert.equal(result.writesRelay, false, `${code}: no relay write`);
  assert.equal(result.enqueuesRelay, false, `${code}: no relay enqueue`);
  assert.equal(result.writesCAS, false, `${code}: no CAS write`);
  assert.equal(result.writesFiles, false, `${code}: no file write`);
  assert.equal(result.mutatesExportState, false, `${code}: no export mutation`);
  assert.equal(result.mintsExportId, false, `${code}: no export id mint`);
  assert.equal(result.burnsSequence, false, `${code}: no sequence burn`);
  assert.equal(result.fullBundleV3Started, false, `${code}: fullBundle.v3 not started`);
  assert.equal(result.noCleanupAuthority, true, `${code}: no cleanup authority`);
  return result;
}

block(r => { delete r.evidence.b1TargetConfigRefHash; }, 'real-transport-b7-b1-evidence-missing');
block(r => { delete r.evidence.b2KillSwitchRefHash; }, 'real-transport-b7-b2-evidence-missing');
block(r => { delete r.evidence.b3IdempotencyRefHash; }, 'real-transport-b7-b3-evidence-missing');
block(r => { delete r.evidence.b4OutboxBoundaryRefHash; }, 'real-transport-b7-b4-evidence-missing');
block(r => { delete r.evidence.b5ConflictPolicyRefHash; }, 'real-transport-b7-b5-evidence-missing');
block(r => { delete r.evidence.b6SequenceExportRefHash; }, 'real-transport-b7-b6-evidence-missing');
block(r => { r.evidence.realTransportApprovalAccepted = false; }, 'real-transport-b7-b8-approval-acceptance-missing');
block(r => { delete r.evidence.b7ReadinessPolicyRefHash; }, 'real-transport-b7-readiness-policy-review-ref-missing');
block(r => { r.evidence.targetMode = 'local-mock-webdav'; }, 'real-transport-b7-local-mock-not-accepted');
block(r => { r.evidence.approvalSchema = 'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1'; },
  'real-transport-b7-local-mock-not-accepted');
block(r => { r.evidence.productSyncReady = true; }, 'real-transport-b7-product-sync-ready-must-remain-false');
block(r => { r.evidence.transportReady = true; }, 'real-transport-b7-caller-transport-ready-true-blocked');
block(r => { r.evidence.localExportableSyncReady = false; }, 'real-transport-b7-local-exportable-not-ready');
block(r => { r.evidence.transportEligibilityFromLocalExportableReady = false; },
  'real-transport-b7-transport-eligibility-missing');
block(r => { r.evidence.candidateBundleHash = H('0'); }, 'real-transport-b7-fullbundle-v2-envelope-invalid');
block(r => { r.evidence.startFullBundleV3 = true; }, 'real-transport-b7-fullbundle-v3-request-blocked');
block(r => { r.evidence.touchChatSavingCAS = true; }, 'real-transport-b7-chat-saving-cas-boundary-violation');
block(r => { r.evidence.mutateA950 = true; }, 'real-transport-b7-a950-cleanup-or-leakage-blocked');
block(r => { r.evidence.endpoint = 'webdav.example.invalid'; }, 'real-transport-b7-raw-input-rejected');
block(r => { r.evidence.casKey = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; },
  'real-transport-b7-cas-key-input-rejected');
block(r => { r.evidence.writeWebDAV = true; }, 'real-transport-b7-write-or-mutation-request-blocked');
block(r => { r.evidence.transportReadyFlipAuthorized = true; },
  'real-transport-b7-transport-ready-flip-request-blocked');

const raw = block(r => { r.evidence.rawPayloadBody = 'not-hash-payload'; }, 'real-transport-b7-raw-input-rejected');
assert.equal(raw.rawPayloadBodyLogged, false, 'raw payload body logged false');
assert.equal(raw.endpointRefHash, valid.evidence.endpointRefHash, 'raw input is not echoed over hash refs');

// ---------------------------------------------------------------------------
// (4) Active source still blocked and not mutated.
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
  assertIncludes(transportGates, token, `active transport gate invariant ${token}`);
}
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV remains deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS remains blocked/deferred');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.real-transport-b7-transportready-evaluation-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b7-transportready-evaluation-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B7_TRANSPORTREADY_EVALUATION_SUBSTRATE_IMPLEMENTED_NON_WRITING',
  b8ImplementationRespected: 'a4777528',
  b1b6RollupRespected: '10e1ee6c',
  b8b7DesignRespected: '26e6241b',
  validReadinessCandidate: true,
  allPrerequisitesSatisfied: true,
  transportReadyCandidate: true,
  transportReadyFlipAuthorized: false,
  transportReady: false,
  productSyncReady: false,
  realWebDAVTransportAvailable: false,
  realTransportExecuted: false,
  writesWebDAV: false,
  writesCloud: false,
  writesRelay: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  mutatesExportState: false,
  mintsExportId: false,
  burnsSequence: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
  moduleWired: false,
  recommendedNextLane: 'consolidated-B1-B8-implementation-rollup-or-real-transport-dry-run-design',
}, null, 2));
console.log('PASS validate-real-transport-b7-transportready-evaluation-implementation');
