#!/usr/bin/env node
//
// Controlled local mock WebDAV operator approval contract validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-operator-approval-contract-fix.md';
const dryRunCloseoutPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-dry-run-live-closeout.md';
const contractFixPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const implementationPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const designPath =
  'release-evidence/2026-07-01/controlled-webdav-cloud-relay-transport-implementation-design.md';
const killSwitchPath = 'release-evidence/2026-07-01/transport-controlled-write-kill-switch-implementation.md';

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
const dryRunCloseout = read(dryRunCloseoutPath);
const contractFix = read(contractFixPath);
const implementation = read(implementationPath);
const design = read(designPath);
const killSwitch = read(killSwitchPath);

for (const token of [
  'CONTROLLED LOCAL MOCK OPERATOR APPROVAL CONTRACT DOCUMENTED',
  'd2e57ea360191cd159922fb23ee9670b74effda1',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '5d0190d54a1a62f00cbb028c94ff19d1a37f651b',
  'edb306774a011f5af5fa4141ce9d85972b16283a',
  'operatorApprovalAccepted:false',
  'scope:"dry-run-no-real-transport"',
  'reviewedTransportDryRunApproved: true',
  'reviewedTransportApplyApproved: true',
  'controlledLocalMockApplyApproved: true',
  'scope: "local-mock-webdav-target-only"',
  'operatorApprovalAccepted:true',
  'controlled-local-mock-operator-approval-required',
  'dry-run-only approval does not approve apply',
  'real WebDAV/cloud target blocks',
  'relay enqueue blocks',
  'CAS/file writes block',
  '`fullBundle.v3` start blocks',
  'cleanup or `row:a950a44b859f` mutation blocks',
  'No local mock apply was run',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'realWebDAVWrite:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'enqueuesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
  'mutatesExportState:true',
  'mintsExportId:true',
  'burnsSequence:true',
  'fullBundleV3Started:true',
  'productSyncReady:true is approved',
  'transportReady:true is approved',
  'Real WebDAV/cloud/relay can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(dryRunCloseout,
  'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT DRY-RUN LIVE PROVEN - ZERO WRITE; LOCAL MOCK APPLY NOT APPROVED',
  'dry-run closeout respected');
assertIncludes(dryRunCloseout, 'operatorApprovalAccepted:false', 'historical approval caveat respected');
assertIncludes(contractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live contract fix respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'controlled local mock implementation respected');
assertIncludes(design, 'CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE',
  'controlled transport design respected');
assertIncludes(killSwitch, 'TRANSPORT CONTROLLED-WRITE KILL SWITCH IMPLEMENTED - DEFAULT BLOCKING / NON-WRITING',
  'kill switch respected');

for (const token of [
  'function approvalAccepted(approval, expected, mode)',
  'app.approved !== true',
  'app.reviewedTransportApplyApproved !== true',
  'app.controlledLocalMockApplyApproved !== true',
  'app.reviewedTransportDryRunApproved !== true',
  'local-mock-webdav-target-only',
  'TRANSPORT_CONTROLLED_APPLY_GATE',
  'noChatSavingCas',
  'noChatSavingCAS',
  'noFullBundleV3',
  'noA950Mutation',
  'privacyHashOnly',
  'operatorApprovalAccepted: approvalOk',
  'operatorDryRunApprovalAccepted: dryRunApprovalOk',
  'operatorApplyApprovalAccepted: applyApprovalOk',
  'localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk',
  'if (applyRequested && !applyApprovalOk) addUnique(blockers, \'controlled-local-mock-operator-approval-required\')',
]) {
  assertIncludes(source, token, `source approval contract token ${token}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function',
  'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootRefHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

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
    remoteRootHash: remoteRootRefHash,
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

const dryRunApproval = {
  schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-dry-run-approval.v1',
  approved: true,
  reviewedTransportDryRunApproved: true,
  scope: 'local-mock-webdav-target-only',
  controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  killSwitchEnabled: true,
  idempotencyKeyHash,
  candidatePayloadHash: payloadHash,
  candidateBundleHash: payloadHash,
  peerTargetHash,
  remoteRootRefHash,
  productSyncReady: false,
  transportReady: false,
  noChatSavingCas: true,
  noFullBundleV3: true,
  noA950Mutation: true,
  privacyHashOnly: true,
};

const applyApproval = {
  ...dryRunApproval,
  schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1',
  reviewedTransportApplyApproved: true,
  controlledLocalMockApplyApproved: true,
};
delete applyApproval.reviewedTransportDryRunApproved;

const approvedDryRun = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: true,
  apply: false,
  operatorApproval: dryRunApproval,
});
assert.equal(approvedDryRun.ok, true, 'strict dry-run approval contract passes');
assert.equal(approvedDryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(approvedDryRun.operatorApprovalAccepted, true, 'strict dry-run approval clearly reported');
assert.equal(approvedDryRun.modeledMockApply, false, 'dry-run does not apply');
assert.equal(approvedDryRun.modeledMockWriteCount, 0, 'dry-run zero modeled writes');
assert.equal(approvedDryRun.realWebDAVWrite, false);
assert.equal(approvedDryRun.writesWebDAV, false);
assert.equal(approvedDryRun.writesCloud, false);
assert.equal(approvedDryRun.enqueuesRelay, false);
assert.equal(approvedDryRun.writesCAS, false);
assert.equal(approvedDryRun.writesFiles, false);
assert.equal(approvedDryRun.mutatesExportState, false);
assert.equal(approvedDryRun.mintsExportId, false);
assert.equal(approvedDryRun.burnsSequence, false);
assert.equal(approvedDryRun.fullBundleV3Started, false);
assert.equal(approvedDryRun.productSyncReady, false);
assert.equal(approvedDryRun.transportReady, false);
assert.equal(approvedDryRun.duplicateReplayZeroWrite, true);
assert.equal(approvedDryRun.restartFailClosed, true);
assert.equal(approvedDryRun.noCleanupAuthority, true);
assert.equal(approvedDryRun.blockers.length, 0, 'approved dry-run has no blockers');

const historicalCaveatDryRun = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: true,
  apply: false,
  operatorApproval: {
    approved: true,
    scope: 'dry-run-no-real-transport',
    controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
    noChatSavingCas: true,
    noFullBundleV3: true,
    noA950Mutation: true,
    privacyHashOnly: true,
  },
});
assert.equal(historicalCaveatDryRun.ok, true, 'historical non-authoritative dry-run remains zero-write');
assert.equal(historicalCaveatDryRun.operatorApprovalAccepted, false,
  'historical non-authoritative approval remains caveated');
assert.equal(historicalCaveatDryRun.modeledMockWriteCount, 0);

const missingApplyApproval = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
});
assert.equal(missingApplyApproval.ok, false, 'missing apply approval blocks');
assert.ok(missingApplyApproval.blockers.includes('controlled-local-mock-operator-approval-required'),
  `missing approval blockers: ${missingApplyApproval.blockers.join(',')}`);

const invalidApplyApproval = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
  operatorApproval: {
    ...applyApproval,
    approved: false,
  },
});
assert.equal(invalidApplyApproval.ok, false, 'invalid apply approval blocks');
assert.ok(invalidApplyApproval.blockers.includes('controlled-local-mock-operator-approval-required'),
  `invalid approval blockers: ${invalidApplyApproval.blockers.join(',')}`);

const dryRunOnlyApprovalCannotApply = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
  operatorApproval: dryRunApproval,
});
assert.equal(dryRunOnlyApprovalCannotApply.ok, false, 'dry-run approval does not approve apply');
assert.ok(dryRunOnlyApprovalCannotApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `dry-run-only approval blockers: ${dryRunOnlyApprovalCannotApply.blockers.join(',')}`);

const modeledApplyDecision = api.evaluateControlledLocalMockTransport({
  ...commonRequest,
  dryRun: false,
  apply: true,
  operatorApproval: applyApproval,
});
assert.equal(modeledApplyDecision.ok, true, 'future local mock apply approval shape is defined in model');
assert.equal(modeledApplyDecision.status, 'controlled-local-mock-webdav-transport-applied');
assert.equal(modeledApplyDecision.operatorApprovalAccepted, true);
assert.equal(modeledApplyDecision.targetMode, 'local-mock-webdav');
assert.equal(modeledApplyDecision.realWebDAVWrite, false);
assert.equal(modeledApplyDecision.writesWebDAV, false);
assert.equal(modeledApplyDecision.writesCloud, false);
assert.equal(modeledApplyDecision.enqueuesRelay, false);
assert.equal(modeledApplyDecision.writesCAS, false);
assert.equal(modeledApplyDecision.writesFiles, false);
assert.equal(modeledApplyDecision.mutatesExportState, false);
assert.equal(modeledApplyDecision.mintsExportId, false);
assert.equal(modeledApplyDecision.burnsSequence, false);
assert.equal(modeledApplyDecision.fullBundleV3Started, false);
assert.equal(modeledApplyDecision.productSyncReady, false);
assert.equal(modeledApplyDecision.transportReady, false);
assert.equal(modeledApplyDecision.noCleanupAuthority, true);

function expectBlock(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...commonRequest,
    dryRun: false,
    apply: true,
    operatorApproval: applyApproval,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} blocks`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
}

expectBlock('real WebDAV target', {
  target: { mode: 'real-webdav', peerTargetHash, remoteRootHash: remoteRootRefHash, ambiguous: false },
}, 'controlled-local-mock-target-required');
expectBlock('cloud write', { transport: { writeCloud: true } },
  'controlled-local-mock-real-webdav-cloud-write-forbidden');
expectBlock('relay enqueue', { transport: { enqueueRelay: true } },
  'controlled-local-mock-relay-enqueue-forbidden');
expectBlock('CAS write', { transport: { touchChatSavingCAS: true } },
  'controlled-local-mock-cas-write-forbidden');
expectBlock('file write', { transport: { writeFiles: true } },
  'controlled-local-mock-file-write-forbidden');
expectBlock('fullBundle.v3 start', { transport: { startFullBundleV3: true } },
  'controlled-local-mock-fullbundle-v3-forbidden');
expectBlock('productSyncReady mismatch', {
  readiness: { ...commonRequest.readiness, productSyncReady: true },
}, 'controlled-local-mock-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...commonRequest.readiness, transportReady: true },
}, 'controlled-local-mock-transport-ready-mismatch');
expectBlock('a950 mutation', { safety: { mutateA950: true } },
  'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-operator-approval-contract-fix.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_OPERATOR_APPROVAL_CONTRACT_DOCUMENTED',
  sourceChanged: false,
  dryRunApprovalAccepted: true,
  applyApprovalShapeDefinedButNotRunLive: true,
  historicalCaveatPreserved: true,
  missingApprovalBlocksApply: true,
  invalidApprovalBlocksApply: true,
  dryRunApprovalDoesNotApproveApply: true,
  realWebDAVWrite: false,
  writesCloud: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  mutatesExportState: false,
  mintsExportId: false,
  burnsSequence: false,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  cleanupAuthorityIntroduced: false,
}, null, 2));
