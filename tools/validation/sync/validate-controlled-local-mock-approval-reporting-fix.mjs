#!/usr/bin/env node
//
// Controlled local mock WebDAV approval reporting fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-approval-reporting-fix.md';
const contractPath = 'release-evidence/2026-07-01/controlled-local-mock-operator-approval-contract-fix.md';
const dryRunCloseoutPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-dry-run-live-closeout.md';
const liveContractFixPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const implementationPath =
  'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';

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
const contractEvidence = read(contractPath);
const dryRunCloseout = read(dryRunCloseoutPath);
const liveContractFix = read(liveContractFixPath);
const implementation = read(implementationPath);

for (const token of [
  'CONTROLLED LOCAL MOCK APPROVAL REPORTING FIXED',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '2cf439116db984f18060dfe24a394e0b474bafbe',
  'd2e57ea360191cd159922fb23ee9670b74effda1',
  'operatorDryRunApprovalAccepted:true',
  'operatorApplyApprovalAccepted:false',
  'operatorApprovalAccepted:true',
  'localMockApplyApproved:false',
  'realTransportApprovalAccepted:false',
  'noChatSavingCAS: true',
  'reviewedTransportApplyApproved:true',
  'controlledLocalMockApplyApproved:true',
  'Real WebDAV/cloud/relay approval remains impossible',
  'no local mock apply was run',
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

assertIncludes(contractEvidence, 'CONTROLLED LOCAL MOCK OPERATOR APPROVAL CONTRACT DOCUMENTED',
  'operator approval contract respected');
assertIncludes(dryRunCloseout,
  'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT DRY-RUN LIVE PROVEN - ZERO WRITE; LOCAL MOCK APPLY NOT APPROVED',
  'dry-run closeout respected');
assertIncludes(liveContractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live contract fix respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'controlled local mock implementation respected');

for (const token of [
  'operatorDryRunApprovalAccepted: dryRunApprovalOk',
  'operatorApplyApprovalAccepted: applyApprovalOk',
  'localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk',
  'realTransportApprovalAccepted: false',
  'operatorApprovalAccepted: approvalOk',
  'app.noChatSavingCas !== true && app.noChatSavingCAS !== true',
  'app.reviewedTransportApplyApproved !== true || app.controlledLocalMockApplyApproved !== true',
  'mode === \'dry-run\' && app.reviewedTransportDryRunApproved !== true',
]) {
  assertIncludes(source, token, `source reporting token ${token}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function',
  'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootRefHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const baseRequest = {
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

const strictDryRunApproval = {
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
  noChatSavingCAS: true,
  noFullBundleV3: true,
  noA950Mutation: true,
  privacyHashOnly: true,
};

const strictDryRun = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  dryRun: true,
  apply: false,
  operatorApproval: strictDryRunApproval,
});
assert.equal(strictDryRun.ok, true, 'strict dry-run approval passes');
assert.equal(strictDryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(strictDryRun.operatorApprovalAccepted, true, 'current-mode approval accepted');
assert.equal(strictDryRun.operatorDryRunApprovalAccepted, true, 'dry-run approval explicitly accepted');
assert.equal(strictDryRun.operatorApplyApprovalAccepted, false, 'apply approval remains false in dry-run');
assert.equal(strictDryRun.localMockApplyApproved, false, 'dry-run does not approve local mock apply');
assert.equal(strictDryRun.realTransportApprovalAccepted, false, 'real transport approval impossible');
assert.equal(strictDryRun.modeledMockApply, false, 'no modeled apply in dry-run');
assert.equal(strictDryRun.modeledMockWriteCount, 0, 'dry-run zero modeled writes');
assert.equal(strictDryRun.duplicateReplayZeroWrite, true, 'duplicate replay zero-write');
assert.equal(strictDryRun.restartFailClosed, true, 'restart fail-closed');
assert.equal(strictDryRun.realWebDAVWrite, false);
assert.equal(strictDryRun.writesWebDAV, false);
assert.equal(strictDryRun.writesCloud, false);
assert.equal(strictDryRun.enqueuesRelay, false);
assert.equal(strictDryRun.writesCAS, false);
assert.equal(strictDryRun.writesFiles, false);
assert.equal(strictDryRun.mutatesExportState, false);
assert.equal(strictDryRun.mintsExportId, false);
assert.equal(strictDryRun.burnsSequence, false);
assert.equal(strictDryRun.fullBundleV3Started, false);
assert.equal(strictDryRun.productSyncReady, false);
assert.equal(strictDryRun.transportReady, false);
assert.equal(strictDryRun.noCleanupAuthority, true);
assert.equal(strictDryRun.blockers.length, 0, 'strict dry-run has no blockers');
assert.equal(strictDryRun.warnings.length, 0, 'strict dry-run has no warnings');

const missingApprovalApply = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  dryRun: false,
  apply: true,
});
assert.equal(missingApprovalApply.ok, false, 'missing apply approval blocks');
assert.ok(missingApprovalApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `missing approval blockers: ${missingApprovalApply.blockers.join(',')}`);

const invalidApprovalApply = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  dryRun: false,
  apply: true,
  operatorApproval: {
    ...strictDryRunApproval,
    reviewedTransportApplyApproved: true,
    controlledLocalMockApplyApproved: true,
    approved: false,
  },
});
assert.equal(invalidApprovalApply.ok, false, 'invalid approval blocks');
assert.ok(invalidApprovalApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `invalid approval blockers: ${invalidApprovalApply.blockers.join(',')}`);

const dryRunApprovalCannotApply = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  dryRun: false,
  apply: true,
  operatorApproval: strictDryRunApproval,
});
assert.equal(dryRunApprovalCannotApply.ok, false, 'dry-run approval does not approve apply');
assert.equal(dryRunApprovalCannotApply.operatorDryRunApprovalAccepted, true);
assert.equal(dryRunApprovalCannotApply.operatorApplyApprovalAccepted, false);
assert.equal(dryRunApprovalCannotApply.localMockApplyApproved, false);
assert.ok(dryRunApprovalCannotApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `dry-run approval apply blockers: ${dryRunApprovalCannotApply.blockers.join(',')}`);

function expectBlock(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...baseRequest,
    dryRun: true,
    apply: false,
    operatorApproval: strictDryRunApproval,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} blocks`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.realWebDAVWrite, false, `${label}: no real WebDAV write`);
  assert.equal(result.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
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
expectBlock('export mutation', { sequence: { mintNewExport: true, burnSequence: false, requireExistingOnly: true } },
  'controlled-local-mock-sequence-mismatch');
expectBlock('productSyncReady mismatch', {
  readiness: { ...baseRequest.readiness, productSyncReady: true },
}, 'controlled-local-mock-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...baseRequest.readiness, transportReady: true },
}, 'controlled-local-mock-transport-ready-mismatch');
expectBlock('a950 mutation', { safety: { mutateA950: true } },
  'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-approval-reporting-fix.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_APPROVAL_REPORTING_FIXED',
  strictDryRunApprovalAccepted: true,
  operatorApprovalAccepted: true,
  operatorDryRunApprovalAccepted: true,
  operatorApplyApprovalAccepted: false,
  localMockApplyApproved: false,
  realTransportApprovalAccepted: false,
  duplicateReplayZeroWrite: true,
  restartFailClosed: true,
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
