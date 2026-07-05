#!/usr/bin/env node
//
// Controlled local mock WebDAV transport - duplicate replay live proof validator.
//
// Proves the duplicate replay of the controlled local mock WebDAV apply is zero-write / idempotent: it respects the
// first apply closeout (c3fd4b57); reuses the SAME idempotency key / payload / bundle / peer / root / gate / local mock
// target as the first apply; replays to modeledMockWriteCount:0 with duplicateReplayZeroWrite:true; performs no real
// WebDAV/cloud/relay/CAS/file write; no relay enqueue; no export-state mutation / export-id mint / sequence burn;
// fullBundle.v3 stays not-started; productSyncReady:false and transportReady:false remain; introduces no cleanup/a950
// mutation authority; and keeps the unrelated productSyncReady flip-gate false-positive out-of-scope. It re-executes
// the REAL source evaluator to prove the modeled write count transitions 1 -> 0 for the same key, reproducing the
// live result from source. Evidence/validator-only; no live apply is rerun; no product source is changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-duplicate-replay-live-proof.md';
const firstApplyCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-first-apply-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const liveContractFixPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const approvalPredicateCloseoutPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-predicate-live-closeout.md';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing ${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(String(source).includes(token), `${label}: missing ${token}`);
}

function assertNotIncludes(source, token, label) {
  assert.ok(!String(source).includes(token), `${label}: forbidden ${token}`);
}

function installWebdavGates() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(sourcePath), sandbox, { filename: sourcePath });
  return sandbox.H2O?.Studio?.sync?.webdavTransportGates;
}

const source = read(sourcePath);
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const firstApplyCloseout = read(firstApplyCloseoutPath);
const implementation = read(implementationPath);
const liveContractFix = read(liveContractFixPath);
const approvalPredicateCloseout = read(approvalPredicateCloseoutPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Evidence content anchors (the duplicate-replay result, verbatim).
// ---------------------------------------------------------------------------
for (const token of [
  'DUPLICATE REPLAY OF THE CONTROLLED LOCAL MOCK WEBDAV APPLY IS ZERO-WRITE / IDEMPOTENT',
  'c3fd4b57',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '1d7a2daa3fc16a13a916fc610373cec2130d2198',
  'h2o.studio.controlled-local-mock-webdav-transport.duplicate-replay-live-proof.v1',
  'diagnosticOnly:false',
  'writeIntent:true',
  'duplicateReplay:true',
  'apiAvailable:true',
  'controlledMockApiAvailable:true',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1',
  'ok:true',
  'status:"controlled-local-mock-webdav-transport-applied"',
  'targetMode:"local-mock-webdav"',
  'gateSatisfied:true',
  'dryRun:false',
  'applyRequested:true',
  'killSwitchEnabled:true',
  'operatorApplyApprovalAccepted:true',
  'localMockApplyApproved:true',
  'realTransportApprovalAccepted:false',
  'modeledMockApply:true',
  'modeledMockWriteCount:0',
  'duplicateReplayZeroWrite:true',
  'realWebDAVWrite:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'enqueuesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
  'restartFailClosed:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'blockers:[]',
  'warnings:[]',
  'first apply: `modeledMockWriteCount:1`',
  'duplicate replay: `modeledMockWriteCount:0`',
  'NOT authorized by this proof',
  'task_c7ef8ae1',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'realWebDAVWrite:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'enqueuesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'mutatesExportState:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'fullBundleV3Started:true',
  'productSyncReady:true` remains',
  'transportReady:true` remains',
  'modeledMockWriteCount:2',
  'a950a44b859f` was cleaned',
  'authorizes real WebDAV',
  'authorizes real transport',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence retained (first apply closeout was the write-count-1 apply).
// ---------------------------------------------------------------------------
assertIncludes(firstApplyCloseout, 'FIRST CONTROLLED LOCAL MOCK WEBDAV TRANSPORT APPLY LIVE-PROVEN',
  'first apply closeout respected');
assertIncludes(firstApplyCloseout, 'modeledMockWriteCount:1', 'first apply counted one modeled write');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation evidence respected');
assertIncludes(liveContractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live-contract fix respected');
assertIncludes(approvalPredicateCloseout, 'CONTROLLED LOCAL MOCK APPROVAL PREDICATE LIVE PROVEN',
  'approval predicate live closeout respected');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE anchors: the duplicate-replay write-count gate + hardcoded safety flags.
// ---------------------------------------------------------------------------
for (const token of [
  'var duplicateReplayed = duplicateReplay.replayed === true;',
  'modeledMockWriteCount: blockers.length === 0 && applyRequested && !duplicateReplayed ? 1 : 0',
  'duplicateReplayZeroWrite: duplicateZeroWrite',
  'realWebDAVWrite: false',
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
  'productSyncReady: false',
  'transportReady: false',
  'a950DocumentedDebtQuarantined: true',
  'noCleanupAuthority: true',
]) {
  assertIncludes(source, token, `source token ${token}`);
}
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

// ---------------------------------------------------------------------------
// (4) Re-execute the REAL evaluator: same key -> first apply write count 1, duplicate replay write count 0.
// ---------------------------------------------------------------------------
const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function', 'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const base = {
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  killSwitch: { enabled: true },
  candidate: { kind: 'fullBundle.v2-readonly-projection', payloadHash, bundleHash: payloadHash, projectionHash: payloadHash, idempotencyKeyHash },
  target: { mode: 'local-mock-webdav', peerTargetHash, remoteRootHash, ambiguous: false },
  sequence: { mintNewExport: false, burnSequence: false, requireExistingOnly: true },
  restart: { simulateReload: true, expectFailClosed: true },
  transport: { writeWebDAV: false, writeCloud: false, enqueueRelay: false, touchChatSavingCAS: false, writeFiles: false, startFullBundleV3: false },
  safety: { mutateA950: false, cleanupAuthority: false },
  privacy: { mode: 'hash-only' },
};

const applyApproval = {
  schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1',
  approved: true,
  reviewedTransportApplyApproved: true,
  controlledLocalMockApplyApproved: true,
  scope: 'local-mock-webdav-target-only',
  controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  killSwitchEnabled: true,
  idempotencyKeyHash,
  candidatePayloadHash: payloadHash,
  candidateBundleHash: payloadHash,
  peerTargetHash,
  remoteRootRefHash: remoteRootHash,
  productSyncReady: false,
  transportReady: false,
  noChatSavingCas: true,
  noFullBundleV3: true,
  noA950Mutation: true,
  privacyHashOnly: true,
};

// First apply (same key) - one modeled write.
const firstApply = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: applyApproval,
  duplicateReplay: { samePayloadTargetSequence: true, expectZeroWrite: true },
});
assert.equal(firstApply.ok, true, 'first apply ok');
assert.equal(firstApply.modeledMockWriteCount, 1, 'first apply counts exactly one modeled write');
assert.equal(firstApply.duplicateReplayZeroWrite, true, 'first apply already carries duplicate-zero-write proof');

// Duplicate replay (SAME key + replayed marker) - zero modeled writes.
const duplicateReplay = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: applyApproval,
  duplicateReplay: { sameIdempotencyKey: true, samePayloadTargetSequence: true, expectZeroWrite: true, replayed: true },
});

// same key / payload / target reused
assert.equal(duplicateReplay.idempotencyKeyHash, firstApply.idempotencyKeyHash, 'duplicate replay reuses idempotency key');
assert.equal(duplicateReplay.candidatePayloadHash, firstApply.candidatePayloadHash, 'duplicate replay reuses payload hash');
assert.equal(duplicateReplay.candidateBundleHash, firstApply.candidateBundleHash, 'duplicate replay reuses bundle hash');
assert.equal(duplicateReplay.peerTargetHash, firstApply.peerTargetHash, 'duplicate replay reuses peer target hash');
assert.equal(duplicateReplay.remoteRootRefHash, firstApply.remoteRootRefHash, 'duplicate replay reuses remote root ref hash');
assert.equal(duplicateReplay.targetMode, 'local-mock-webdav', 'duplicate replay stays local mock target');

// zero-write / idempotent
assert.equal(duplicateReplay.ok, true, 'duplicate replay is not an error');
assert.equal(duplicateReplay.status, 'controlled-local-mock-webdav-transport-applied', 'duplicate replay status is applied (idempotent)');
assert.equal(duplicateReplay.modeledMockWriteCount, 0, 'duplicate replay is zero-write (0 modeled writes)');
assert.equal(duplicateReplay.duplicateReplayZeroWrite, true, 'duplicate replay zero-write flag set');
assert.equal(firstApply.modeledMockWriteCount - duplicateReplay.modeledMockWriteCount, 1, 'modeled write count transitions 1 -> 0 for the same key');

// no real writes anywhere
assert.equal(duplicateReplay.realWebDAVWrite, false);
assert.equal(duplicateReplay.writesWebDAV, false);
assert.equal(duplicateReplay.writesCloud, false);
assert.equal(duplicateReplay.writesRelay, false);
assert.equal(duplicateReplay.enqueuesRelay, false);
assert.equal(duplicateReplay.writesCAS, false);
assert.equal(duplicateReplay.writesFiles, false);
assert.equal(duplicateReplay.mutatesExportState, false);
assert.equal(duplicateReplay.mintsExportId, false);
assert.equal(duplicateReplay.burnsSequence, false);
assert.equal(duplicateReplay.fullBundleV3Started, false);
assert.equal(duplicateReplay.productSyncReady, false);
assert.equal(duplicateReplay.transportReady, false);
assert.equal(duplicateReplay.realTransportApprovalAccepted, false);
assert.equal(duplicateReplay.restartFailClosed, true);
assert.equal(duplicateReplay.a950DocumentedDebtQuarantined, true);
assert.equal(duplicateReplay.noCleanupAuthority, true);
assert.equal(duplicateReplay.privacy.redacted, true);
assert.equal(duplicateReplay.privacy.hashOnly, true);
assert.equal(duplicateReplay.blockers.length, 0, 'duplicate replay has no blockers');
assert.equal(duplicateReplay.warnings.length, 0, 'duplicate replay has no warnings');

// A third replay of the same key remains zero-write (idempotency is stable, never a second write).
const thirdReplay = api.evaluateControlledLocalMockTransport({
  ...base, dryRun: false, apply: true, operatorApproval: applyApproval,
  duplicateReplay: { sameIdempotencyKey: true, samePayloadTargetSequence: true, expectZeroWrite: true, replayed: true },
});
assert.equal(thirdReplay.modeledMockWriteCount, 0, 'a third replay of the same key remains zero-write');
assert.equal(thirdReplay.duplicateReplayZeroWrite, true, 'third replay stays zero-write');

// ---------------------------------------------------------------------------
// (5) Even under a duplicate replay, smuggled real-write / relay / CAS / fullBundle.v3 / export / cleanup is rejected.
// ---------------------------------------------------------------------------
function expectBlocked(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...base, dryRun: false, apply: true, operatorApproval: applyApproval,
    duplicateReplay: { sameIdempotencyKey: true, samePayloadTargetSequence: true, expectZeroWrite: true, replayed: true },
    ...patch,
  });
  assert.equal(result.ok, false, `${label} must block even on replay`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.realWebDAVWrite, false, `${label}: real write stays false`);
  assert.equal(result.modeledMockWriteCount, 0, `${label}: blocked replay is still zero-write`);
}
expectBlocked('real webdav write on replay', { writeWebDAV: true }, 'controlled-local-mock-real-webdav-cloud-write-forbidden');
expectBlocked('relay enqueue on replay', { enqueueRelay: true }, 'controlled-local-mock-relay-enqueue-forbidden');
expectBlocked('cas write on replay', { writeCAS: true }, 'controlled-local-mock-cas-write-forbidden');
expectBlocked('fullBundle.v3 on replay', { startFullBundleV3: true }, 'controlled-local-mock-fullbundle-v3-forbidden');
expectBlocked('export mutation on replay', { mutatesExportState: true }, 'controlled-local-mock-export-mutation-forbidden');
expectBlocked('cleanup authority on replay', { cleanupAuthority: true }, 'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport-duplicate-replay-live-proof.validator.v1',
  lane: 'controlled-local-mock-webdav-transport',
  phase: 'duplicate-replay-live-proof',
  evidence: evidencePath,
  verdict: 'CONTROLLED_LOCAL_MOCK_DUPLICATE_REPLAY_ZERO_WRITE_IDEMPOTENT',
  firstApplyCloseoutRespected: 'c3fd4b57',
  sameIdempotencyKeyReused: true,
  firstApplyModeledWriteCount: firstApply.modeledMockWriteCount,
  duplicateReplayModeledWriteCount: duplicateReplay.modeledMockWriteCount,
  duplicateReplayZeroWrite: true,
  realWebDAVWrite: false,
  writesCloud: false,
  writesRelay: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  mutatesExportState: false,
  mintsExportId: false,
  burnsSequence: false,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  a950DocumentedDebtQuarantined: true,
  noCleanupAuthority: true,
  authorizesRealTransport: false,
  unrelatedFlipGateFalsePositiveOutOfScope: 'task_c7ef8ae1',
}, null, 2));
console.log('PASS validate-controlled-local-mock-webdav-transport-duplicate-replay-live-proof');
