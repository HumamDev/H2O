#!/usr/bin/env node
//
// Real-transport B8 approval acceptance implementation validator.
//
// Proves the B8 substrate validates the real WebDAV/cloud/relay approval contract as a hash-only, non-writing,
// non-activating model: valid B8 approval is accepted as contract validity only; local mock approvals, missing
// prerequisites, readiness flips, raw/CAS inputs, fullBundle.v3, cleanup/a950, and write/enqueue/mint/burn requests
// block; real transport remains unavailable; transportReady:false and productSyncReady:false remain.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const modulePath = 'src-surfaces-base/studio/sync/real-transport-approval.js';
const evidencePath = 'release-evidence/2026-07-01/real-transport-b8-approval-acceptance-implementation.md';
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
const w1bEvidencePath = 'release-evidence/2026-07-05/real-transport-w1b-loader-registration.md';
const w1bValidatorPath = 'tools/validation/sync/validate-real-transport-w1b-loader-registration.mjs';
const w1Modules = [
  'sync/real-transport-target-config.js',
  'sync/real-transport-kill-switch.js',
  'sync/real-transport-idempotency.js',
  'sync/real-transport-enqueue-boundary.js',
  'sync/real-transport-conflict-recovery.js',
  'sync/real-transport-sequence-export.js',
  'sync/real-transport-approval.js',
  'sync/real-transport-readiness.js',
  'sync/real-transport-dry-run.js',
  'sync/real-transport-console.js',
];
const w1ForbiddenTokens = [
  'fetch(',
  'XMLHttpRequest',
  'localStorage.setItem',
  'sqlExecute',
  'writeFile',
  'invoke(',
  'enqueuesRelay:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'productSyncReady:true',
  'transportReady:true',
  'fullBundleV3Started:true',
  'mintsExportId:true',
  'burnsSequence:true',
];

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

function countOccurrences(haystack, needle) { return String(haystack).split(needle).length - 1; }
function scriptLiteral(rel) { return `<script src="./${rel}"></script>`; }
function packLiteral(rel) { return `"${rel}"`; }
function hasForbiddenToken(src, token) {
  const source = String(src);
  if (token === 'writeFile') return /(^|[^\w$])writeFile([^\w$]|$)/.test(source);
  return source.includes(token);
}
function assertW1bAwareWiring(rel, label) {
  const w1bPresent =
    studioHtml.includes(scriptLiteral('sync/real-transport-dry-run.js')) ||
    studioHtml.includes(scriptLiteral('sync/real-transport-console.js')) ||
    packStudio.includes(packLiteral('sync/real-transport-dry-run.js')) ||
    packStudio.includes(packLiteral('sync/real-transport-console.js'));
  if (!w1bPresent) {
    assertNotIncludes(studioHtml, path.basename(rel), `${label} pre-W1b not wired into studio.html`);
    assertNotIncludes(packStudio, path.basename(rel), `${label} pre-W1b not wired into pack-studio`);
    return;
  }
  read(w1bEvidencePath);
  read(w1bValidatorPath);
  assert.equal(countOccurrences(studioHtml, scriptLiteral(rel)), 1, `${label} W1b studio.html script`);
  assert.equal(countOccurrences(packStudio, packLiteral(rel)), 2, `${label} W1b pack-studio entries`);
  assert.equal(countOccurrences(studioHtml, scriptLiteral('sync/real-transport-console.js')), 1,
    `${label} W1b console studio.html script`);
  assert.equal(countOccurrences(packStudio, packLiteral('sync/real-transport-console.js')), 2,
    `${label} W1b console pack-studio entries`);
  for (const w1Rel of w1Modules) {
    const source = read(`src-surfaces-base/studio/${w1Rel}`);
    for (const forbidden of w1ForbiddenTokens) {
      assert.ok(!hasForbiddenToken(source, forbidden), `${label} ${w1Rel}: forbidden ${forbidden}`);
    }
  }
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
  return sandbox.H2O?.Studio?.sync?.realTransportApproval;
}

const PH = H('a');
const valid = {
  approval: {
    schema: 'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1',
    approved: true,
    reviewedRealTransportApplyApproved: true,
    realWebDAVCloudRelayApproved: true,
    scope: 'real-webdav-cloud-relay-target',
    targetMode: 'real-webdav',
    productSyncReady: false,
    transportReady: false,
    privacyHashOnly: true,
    operatorIdHash: H('1'),
    reviewIdHash: H('2'),
    approvedAtIso: '2026-07-01T00:00:00.000Z',
    endpointRefHash: H('3'),
    remoteRootRefHash: H('4'),
    credentialRefHash: H('5'),
    peerIdentityBindingHash: H('6'),
    localClientIdentityHash: H('7'),
    killSwitchEnableTokenHash: H('8'),
    idempotencyKeyHash: H('9'),
    conflictPolicyRefHash: H('b'),
    sequenceExportConstraintRefHash: H('c'),
    b7ReadinessPolicyRefHash: H('d'),
    b8ApprovalRefHash: H('e'),
    approvalRecordHash: H('e'),
    candidatePayloadHash: PH,
    candidateBundleHash: PH,
    fullBundleV2EnvelopeHash: PH,
    payloadSchema: 'h2o.studio.fullBundle.v2',
    noA950Mutation: true,
    noCleanupAuthority: true,
    noFullBundleV3: true,
    chatSavingCasSeparate: true,
    noChatSavingCAS: true,
    rawEndpointLogged: false,
    rawCredentialLogged: false,
    rawRemotePathLogged: false,
    rawPayloadBodyLogged: false,
  },
};

// ---------------------------------------------------------------------------
// (1) Evidence + anchor checks.
// ---------------------------------------------------------------------------
for (const token of [
  'B8 REAL APPROVAL ACCEPTANCE SUBSTRATE IMPLEMENTED AS A NON-WRITING, HASH-ONLY',
  '10e1ee6c',
  '26e6241b',
  '7cac0d82',
  '334361cc',
  '1117f976',
  '804b6d67',
  'de4aa12d',
  '93eb9065',
  'src-surfaces-base/studio/sync/real-transport-approval.js',
  'H2O.Studio.sync.realTransportApproval.evaluateRealTransportApproval(request)',
  'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1',
  'realTransportApprovalAccepted:true',
  'approvalAcceptanceOnly:true',
  'realWebDAVTransportAvailable:false',
  'transportReady:false',
  'productSyncReady:false',
  'B8 approval acceptance does not execute real transport',
  'B8 approval acceptance does not flip `transportReady`',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}
for (const forbidden of [
  'real transport is now available',
  'transportReady:true` is set',
  'productSyncReady:true` is set',
  'real write is authorized',
  'a950 was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `evidence must not claim ${forbidden}`);
}
assertPrivacySafe(evidence, 'B8 evidence');

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
assertIncludes(moduleSource, 'H2O.Studio.sync.realTransportApproval.evaluateRealTransportApproval =',
  'B8 API assignment');
assertIncludes(moduleSource, "APPROVAL_SCHEMA = 'h2o.studio.transport.real-webdav-cloud-relay-transport-apply-approval.v1'",
  'B8 approval schema literal');
assertIncludes(moduleSource, 'approvalAcceptanceOnly: true', 'approval acceptance is contract-only');
for (const token of [
  'realTransportExecuted: false',
  'realWebDAVTransportAvailable: false',
  'transportReady: false',
  'productSyncReady: false',
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
  assertIncludes(moduleSource, token, `B8 invariant ${token}`);
}
for (const forbidden of [
  'realTransportExecuted: true',
  'realWebDAVTransportAvailable: true',
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
  'fullBundleV3Started: true',
  'noCleanupAuthority: false',
]) {
  assertNotIncludes(moduleSource, forbidden, `B8 source must not contain ${forbidden}`);
}
for (const writePrimitive of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'writeFile(', 'appendFile(', 'localStorage.setItem', 'indexedDB.open']) {
  assertNotIncludes(moduleSource, writePrimitive, `B8 module must remain pure/non-writing (${writePrimitive})`);
}
assertW1bAwareWiring('sync/real-transport-approval.js', 'B8');
assertPrivacySafe(moduleSource, 'B8 source');

// ---------------------------------------------------------------------------
// (3) Behavioral VM execution.
// ---------------------------------------------------------------------------
const api = installModule();
assert.equal(typeof api?.evaluateRealTransportApproval, 'function', 'B8 API installed');

const accepted = api.evaluateRealTransportApproval(valid);
assert.equal(accepted.ok, true, 'valid B8 approval evaluates accepted');
assert.equal(accepted.status, 'real-transport-b8-approval-accepted', 'valid B8 status');
assert.equal(accepted.realApprovalContractEvaluated, true, 'approval contract evaluated');
assert.equal(accepted.realTransportApprovalAccepted, true, 'B8 approval accepted as contract validity');
assert.equal(accepted.approvalAcceptanceOnly, true, 'approval acceptance only');
assert.equal(accepted.realTransportExecuted, false, 'does not execute real transport');
assert.equal(accepted.realWebDAVTransportAvailable, false, 'real WebDAV remains unavailable');
assert.equal(accepted.transportReady, false, 'transportReady remains false');
assert.equal(accepted.productSyncReady, false, 'productSyncReady remains false');
assert.equal(accepted.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(accepted.writesWebDAV, false, 'no WebDAV write');
assert.equal(accepted.writesCloud, false, 'no cloud write');
assert.equal(accepted.writesRelay, false, 'no relay write');
assert.equal(accepted.enqueuesRelay, false, 'no relay enqueue');
assert.equal(accepted.writesCAS, false, 'no CAS write');
assert.equal(accepted.writesFiles, false, 'no file write');
assert.equal(accepted.mutatesExportState, false, 'no export mutation');
assert.equal(accepted.mintsExportId, false, 'no export id mint');
assert.equal(accepted.burnsSequence, false, 'no sequence burn');
assert.equal(accepted.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(accepted.noA950Mutation, true, 'no a950 mutation');
assert.equal(accepted.blockers.length, 0, 'valid B8 no blockers');

function cloneValid() {
  return JSON.parse(JSON.stringify(valid));
}

function block(mutator, code) {
  const request = cloneValid();
  mutator(request);
  const result = api.evaluateRealTransportApproval(request);
  assert.equal(result.ok, false, `${code}: request should block`);
  assert.ok(result.blockers.includes(code), `${code}: blockers were ${result.blockers.join(',')}`);
  assert.equal(result.realTransportApprovalAccepted, false, `${code}: approval not accepted`);
  assert.equal(result.realTransportExecuted, false, `${code}: no transport execution`);
  assert.equal(result.realWebDAVTransportAvailable, false, `${code}: real transport unavailable`);
  assert.equal(result.transportReady, false, `${code}: transportReady false`);
  assert.equal(result.productSyncReady, false, `${code}: productSyncReady false`);
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

block(r => { r.approval.schema = 'h2o.studio.transport.controlled-local-mock-webdav-transport-approval.v1'; },
  'real-transport-b8-approval-schema-mismatch');
block(r => { r.approval.scope = 'local-mock-webdav-target-only'; },
  'real-transport-b8-local-mock-approval-not-accepted');
block(r => { r.approval.targetMode = 'local-mock-webdav'; },
  'real-transport-b8-local-mock-approval-not-accepted');
block(r => { delete r.approval.endpointRefHash; },
  'real-transport-b8-b1-target-references-missing');
block(r => { delete r.approval.killSwitchEnableTokenHash; },
  'real-transport-b8-b2-kill-switch-ref-missing');
block(r => { delete r.approval.idempotencyKeyHash; },
  'real-transport-b8-b3-idempotency-ref-missing');
block(r => { delete r.approval.conflictPolicyRefHash; },
  'real-transport-b8-b5-conflict-policy-ref-missing');
block(r => { delete r.approval.sequenceExportConstraintRefHash; },
  'real-transport-b8-b6-sequence-export-ref-missing');
block(r => { delete r.approval.b7ReadinessPolicyRefHash; },
  'real-transport-b8-b7-readiness-policy-ref-missing');
block(r => { delete r.approval.candidatePayloadHash; },
  'real-transport-b8-payload-hashes-missing-or-mismatch');
block(r => { r.approval.productSyncReady = true; },
  'real-transport-b8-product-sync-ready-must-remain-false');
block(r => { r.approval.transportReady = true; },
  'real-transport-b8-transport-ready-must-remain-false');
block(r => { r.approval.endpoint = 'webdav.example.invalid'; },
  'real-transport-b8-raw-input-rejected');
block(r => { r.approval.casKey = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'; },
  'real-transport-b8-cas-key-input-rejected');
block(r => { r.approval.startFullBundleV3 = true; },
  'real-transport-b8-forbidden-authority-requested');
block(r => { r.approval.mutateA950 = true; },
  'real-transport-b8-forbidden-authority-requested');
block(r => { r.approval.writeWebDAV = true; },
  'real-transport-b8-write-or-mutation-request-blocked');

const raw = block(r => { r.approval.rawCredential = 'not-a-hash-secret'; },
  'real-transport-b8-raw-input-rejected');
assert.equal(raw.credentialRefHash, valid.approval.credentialRefHash, 'raw credential is not echoed over credential ref');
assert.equal(raw.rawCredentialLogged, false, 'raw credential logged false');

// ---------------------------------------------------------------------------
// (4) Active source still blocked.
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
  schema: 'h2o.studio.transport.real-transport-b8-approval-acceptance-implementation.validator.v1',
  lane: 'real-webdav-cloud-relay-transport',
  phase: 'b8-approval-acceptance-implementation',
  evidence: evidencePath,
  module: modulePath,
  verdict: 'B8_APPROVAL_ACCEPTANCE_SUBSTRATE_IMPLEMENTED_NON_WRITING',
  b1b6RollupRespected: '10e1ee6c',
  b8b7DesignRespected: '26e6241b',
  validB8ApprovalAccepted: true,
  approvalAcceptanceOnly: true,
  realTransportExecuted: false,
  realWebDAVTransportAvailable: false,
  productSyncReady: false,
  transportReady: false,
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
  recommendedNextLane: 'B7-transportReady-readiness-evaluation-flip-slice-after-explicit-approval',
}, null, 2));
console.log('PASS validate-real-transport-b8-approval-acceptance-implementation');
