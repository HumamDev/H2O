#!/usr/bin/env node
//
// Controlled local mock WebDAV transport - first apply live closeout validator.
//
// Proves the first controlled local mock WebDAV transport apply: the live API is available; the apply passed
// (ok:true, status:"controlled-local-mock-webdav-transport-applied"); the kill switch was enabled for local-mock-only;
// the exact controlled gate was satisfied; operator APPLY approval was accepted (localMockApplyApproved:true,
// realTransportApprovalAccepted:false); modeledMockApply:true with modeledMockWriteCount:1 and every real-write flag
// hardcoded false; no relay enqueue; no export-state mutation/mint/sequence-burn; fullBundle.v3 not started; duplicate
// replay remains modeled zero-write; restart/reload remains fail-closed; productSyncReady/transportReady stay false;
// a950 remains quarantined debt with no cleanup authority; privacy stayed redacted/hash-only; blockers/warnings empty;
// and this closeout does NOT authorize real WebDAV/cloud/relay transport. It loads the REAL source in a sandbox and
// re-executes the evaluator with the exact apply-mode request shape to confirm the live-reported result is
// reproducible from source, not just asserted in prose. Evidence/validator-only; no live apply is rerun; no product
// source is changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-first-apply-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const liveContractFixPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const approvalReportingPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-reporting-fix.md';
const dryRunPredicateFixPath = 'release-evidence/2026-07-01/controlled-local-mock-dry-run-approval-predicate-fix.md';
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
const implementation = read(implementationPath);
const liveContractFix = read(liveContractFixPath);
const approvalReporting = read(approvalReportingPath);
const dryRunPredicateFix = read(dryRunPredicateFixPath);
const approvalPredicateCloseout = read(approvalPredicateCloseoutPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Evidence content anchors (the live-reported result, verbatim).
// ---------------------------------------------------------------------------
for (const token of [
  'FIRST CONTROLLED LOCAL MOCK WEBDAV TRANSPORT APPLY LIVE-PROVEN',
  'MOCK-ONLY MODELED APPLY',
  'REAL WEBDAV/CLOUD/RELAY TRANSPORT REMAINS BLOCKED AND IS NOT AUTHORIZED BY THIS CLOSEOUT',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '8a57a9226a0c80b285439f63fc892957d57b221e',
  'ea9971acb298b021b93e87f3e3322b9498ed3e88',
  '1d7a2daa3fc16a13a916fc610373cec2130d2198',
  'h2o.studio.controlled-local-mock-webdav-transport.live-apply.v1',
  'diagnosticOnly:false',
  'readOnly:false',
  'writeIntent:true',
  'apiAvailable:true',
  'controlledMockApiAvailable:true',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1',
  'ok:true',
  'status:"controlled-local-mock-webdav-transport-applied"',
  'controlledMockTransport:true',
  'targetMode:"local-mock-webdav"',
  'gateSatisfied:true',
  'dryRun:false',
  'applyRequested:true',
  'killSwitchEnabled:true',
  'operatorApprovalAccepted:true',
  'operatorDryRunApprovalAccepted:false',
  'operatorApplyApprovalAccepted:true',
  'localMockApplyApproved:true',
  'realTransportApprovalAccepted:false',
  'reservedControlledGateUsedForLocalMockOnly:true',
  'modeledMockApply:true',
  'modeledMockWriteCount:1',
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
  'localExportableSyncReady:true',
  'transportEligibilityFromLocalExportableReady:true',
  'localExportableSyncReadyIsAuthorization:false',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeDispatch:false',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'blockers:[]',
  'warnings:[]',
  'does NOT authorize real WebDAV/cloud/relay transport',
  'does NOT flip `productSyncReady`',
  'does NOT set `transportReady:true`',
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
// (2) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation evidence respected');
assertIncludes(liveContractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live-contract fix evidence respected');
assertIncludes(approvalReporting, 'CONTROLLED LOCAL MOCK APPROVAL REPORTING FIXED',
  'approval reporting fix evidence respected');
assertIncludes(dryRunPredicateFix, 'CONTROLLED LOCAL MOCK DRY-RUN APPROVAL PREDICATE FIXED',
  'dry-run approval predicate fix evidence respected');
assertIncludes(approvalPredicateCloseout, 'CONTROLLED LOCAL MOCK APPROVAL PREDICATE LIVE PROVEN',
  'approval predicate live closeout respected');
assertIncludes(approvalPredicateCloseout, 'operatorApplyApprovalAccepted:false',
  'prior closeout correctly recorded apply as NOT yet approved (this slice is the one that approves it)');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE anchors: the exact apply-mode predicate + safety flags are hardcoded, not request-controlled.
// ---------------------------------------------------------------------------
for (const token of [
  "app.reviewedTransportApplyApproved !== true || app.controlledLocalMockApplyApproved !== true",
  'operatorApplyApprovalAccepted: applyApprovalOk',
  'localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk',
  'realTransportApprovalAccepted: false',
  'modeledMockApply: blockers.length === 0 && applyRequested',
  'modeledMockWriteCount: blockers.length === 0 && applyRequested && !duplicateReplayed ? 1 : 0',
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
  'localExportableSyncReadyIsAuthorization: false',
  'a950DocumentedDebtQuarantined: true',
  'noCleanupAuthority: true',
  "controlled-local-mock-real-transport-approval-forbidden",
  "controlled-local-mock-relay-enqueue-forbidden",
  "controlled-local-mock-cas-write-forbidden",
  "controlled-local-mock-file-write-forbidden",
  "controlled-local-mock-fullbundle-v3-forbidden",
  "controlled-local-mock-export-mutation-forbidden",
  "controlled-local-mock-cleanup-authority-forbidden",
]) {
  assertIncludes(source, token, `source token ${token}`);
}
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

// ---------------------------------------------------------------------------
// (4) Re-execute the REAL evaluator with the exact apply-mode request shape; confirm the live result reproduces.
// ---------------------------------------------------------------------------
const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function', 'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const commonRequest = {
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  killSwitch: { enabled: true },
  candidate: {
    kind: 'fullBundle.v2-readonly-projection',
    payloadHash,
    bundleHash: payloadHash,
    projectionHash: payloadHash,
    idempotencyKeyHash,
  },
  target: {
    mode: 'local-mock-webdav',
    peerTargetHash,
    remoteRootHash,
    ambiguous: false,
  },
  sequence: {
    mintNewExport: false,
    burnSequence: false,
    requireExistingOnly: true,
  },
  duplicateReplay: {
    samePayloadTargetSequence: true,
    expectZeroWrite: true,
  },
  restart: {
    simulateReload: true,
    expectFailClosed: true,
  },
  transport: {
    writeWebDAV: false,
    writeCloud: false,
    enqueueRelay: false,
    touchChatSavingCAS: false,
    writeFiles: false,
    startFullBundleV3: false,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
  },
  privacy: {
    mode: 'hash-only',
  },
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

const firstApply = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
  operatorApproval: applyApproval,
});

assert.equal(firstApply.ok, true, 'live first apply passes');
assert.equal(firstApply.status, 'controlled-local-mock-webdav-transport-applied', 'live status is applied');
assert.equal(firstApply.gateSatisfied, true, 'exact controlled gate satisfied');
assert.equal(firstApply.dryRun, false, 'first apply is not a dry-run');
assert.equal(firstApply.applyRequested, true, 'apply was requested');
assert.equal(firstApply.killSwitchEnabled, true, 'kill switch enabled');
assert.equal(firstApply.operatorApprovalAccepted, true, 'operator approval accepted');
assert.equal(firstApply.operatorDryRunApprovalAccepted, false, 'apply-mode approval is not a dry-run approval');
assert.equal(firstApply.operatorApplyApprovalAccepted, true, 'apply-mode approval accepted');
assert.equal(firstApply.localMockApplyApproved, true, 'apply approved for local mock target only');
assert.equal(firstApply.realTransportApprovalAccepted, false, 'real transport approval never granted');
assert.equal(firstApply.reservedControlledGateUsedForLocalMockOnly, true, 'reserved gate used for local mock only');
assert.equal(firstApply.modeledMockApply, true, 'modeled mock apply occurred');
assert.equal(firstApply.modeledMockWriteCount, 1, 'exactly one modeled write counted (first apply, not a replay)');
assert.equal(firstApply.realWebDAVWrite, false);
assert.equal(firstApply.writesWebDAV, false);
assert.equal(firstApply.writesCloud, false);
assert.equal(firstApply.writesRelay, false);
assert.equal(firstApply.enqueuesRelay, false);
assert.equal(firstApply.writesCAS, false);
assert.equal(firstApply.writesFiles, false);
assert.equal(firstApply.mutatesExportState, false);
assert.equal(firstApply.mintsExportId, false);
assert.equal(firstApply.burnsSequence, false);
assert.equal(firstApply.fullBundleV3Started, false);
assert.equal(firstApply.productSyncReady, false);
assert.equal(firstApply.transportReady, false);
assert.equal(firstApply.localExportableSyncReady, true);
assert.equal(firstApply.transportEligibilityFromLocalExportableReady, true);
assert.equal(firstApply.localExportableSyncReadyIsAuthorization, false, 'local exportable readiness is eligibility, not authorization');
assert.equal(firstApply.duplicateReplayZeroWrite, true, 'duplicate replay modeled zero-write');
assert.equal(firstApply.restartFailClosed, true, 'restart/reload modeled fail-closed');
assert.equal(firstApply.bootResumeDispatch, false);
assert.equal(firstApply.webdavCloudRelayBlocked, true);
assert.equal(firstApply.chatSavingCasBlocked, true);
assert.equal(firstApply.a950DocumentedDebtQuarantined, true);
assert.equal(firstApply.noCleanupAuthority, true);
assert.equal(firstApply.idempotencyKeyHash, idempotencyKeyHash);
assert.equal(firstApply.candidatePayloadHash, payloadHash);
assert.equal(firstApply.candidateBundleHash, payloadHash);
assert.equal(firstApply.peerTargetHash, peerTargetHash);
assert.equal(firstApply.remoteRootRefHash, remoteRootHash);
assert.equal(firstApply.privacy.redacted, true);
assert.equal(firstApply.privacy.hashOnly, true);
assert.equal(firstApply.privacy.rawPrivateFieldsLogged, false);
// deepEqual is avoided here: firstApply.blockers/warnings are cross-realm Arrays (produced by vm.runInNewContext),
// and Node's deepStrictEqual can fail on cross-realm array prototype identity even when contents are equal.
assert.equal(firstApply.blockers.length, 0, 'no blockers on the accepted first apply');
assert.equal(firstApply.warnings.length, 0, 'no warnings on the accepted first apply');

// ---------------------------------------------------------------------------
// (5) A duplicate replay of the SAME apply is modeled zero-write (idempotent), never a second real write.
// ---------------------------------------------------------------------------
const duplicateApply = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
  operatorApproval: applyApproval,
  duplicateReplay: {
    samePayloadTargetSequence: true,
    expectZeroWrite: true,
    replayed: true,
  },
});
assert.equal(duplicateApply.ok, true, 'duplicate replay still passes (does not become an error)');
assert.equal(duplicateApply.modeledMockWriteCount, 0, 'duplicate replay is modeled zero-write, not a second write');
assert.equal(duplicateApply.duplicateReplayZeroWrite, true, 'duplicate replay flag stays zero-write');

// ---------------------------------------------------------------------------
// (6) Attempting to smuggle a real-transport / relay / CAS / fullBundle.v3 / export-mutation / cleanup request
//     through the apply path is rejected by source, proving the model cannot be coerced into a real write.
// ---------------------------------------------------------------------------
function expectBlocked(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...commonRequest,
    dryRun: false,
    apply: true,
    operatorApproval: applyApproval,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} must block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected blocker ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.realWebDAVWrite, false, `${label}: real write must stay false even when blocked`);
}
expectBlocked('real WebDAV write request', { writeWebDAV: true }, 'controlled-local-mock-real-webdav-cloud-write-forbidden');
expectBlocked('real target mode request', { targetMode: 'webdav' }, 'controlled-local-mock-target-required');
expectBlocked('relay enqueue request', { enqueueRelay: true }, 'controlled-local-mock-relay-enqueue-forbidden');
expectBlocked('CAS write request', { writeCAS: true }, 'controlled-local-mock-cas-write-forbidden');
expectBlocked('fullBundle.v3 start request', { startFullBundleV3: true }, 'controlled-local-mock-fullbundle-v3-forbidden');
expectBlocked('export mutation request', { mutatesExportState: true }, 'controlled-local-mock-export-mutation-forbidden');
expectBlocked('cleanup authority request', { cleanupAuthority: true }, 'controlled-local-mock-cleanup-authority-forbidden');
expectBlocked('a950 mutation request', { mutateA950: true, safety: { mutateA950: true } }, 'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport-first-apply-live-closeout.validator.v1',
  lane: 'controlled-local-mock-webdav-transport',
  phase: 'first-apply-live-closeout',
  evidence: evidencePath,
  verdict: 'CONTROLLED_LOCAL_MOCK_FIRST_APPLY_LIVE_PROVEN_MOCK_ONLY',
  liveApiAvailable: true,
  applyOk: true,
  status: 'controlled-local-mock-webdav-transport-applied',
  killSwitchEnabledForLocalMockOnly: true,
  gateSatisfied: true,
  operatorApplyApprovalAccepted: true,
  localMockApplyApproved: true,
  realTransportApprovalAccepted: false,
  modeledMockApply: true,
  modeledMockWriteCount: 1,
  duplicateReplayZeroWrite: true,
  restartFailClosed: true,
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
  privacyHashOnly: true,
  blockersEmpty: true,
  warningsEmpty: true,
  authorizesRealTransport: false,
}, null, 2));
console.log('PASS validate-controlled-local-mock-webdav-transport-first-apply-live-closeout');
