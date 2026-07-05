#!/usr/bin/env node
//
// Controlled local mock WebDAV dry-run approval predicate fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-dry-run-approval-predicate-fix.md';
const reportingPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-reporting-fix.md';
const contractPath = 'release-evidence/2026-07-01/controlled-local-mock-operator-approval-contract-fix.md';
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
const reporting = read(reportingPath);
const contract = read(contractPath);
const implementation = read(implementationPath);

for (const token of [
  'CONTROLLED LOCAL MOCK DRY-RUN APPROVAL PREDICATE FIXED',
  '8a57a9226a0c80b285439f63fc892957d57b221e',
  '2cf439116db984f18060dfe24a394e0b474bafbe',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  'operatorDryRunApprovalAccepted:false',
  'predicate/field mismatch',
  'noCASWrite:true',
  'noFullBundleV3Start:true',
  'hashOnly:true',
  'remoteRootHash',
  'operatorDryRunApprovalAccepted:true',
  'operatorApplyApprovalAccepted:false',
  'localMockApplyApproved:false',
  'realTransportApprovalAccepted:false',
  'controlled-local-mock-real-transport-approval-forbidden',
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

assertIncludes(reporting, 'CONTROLLED LOCAL MOCK APPROVAL REPORTING FIXED',
  'approval reporting fix respected');
assertIncludes(contract, 'CONTROLLED LOCAL MOCK OPERATOR APPROVAL CONTRACT DOCUMENTED',
  'operator contract respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation respected');

for (const token of [
  'function explicitTrue(names)',
  'function explicitFalse(names)',
  'noCASWrite',
  'noFullBundleV3Start',
  'noA950Mutation',
  'privacyRedactedHashOnly',
  'realWebDAVApproved',
  'webdavCloudRelayApproved',
  'approvalRealTransportRequested',
  'controlled-local-mock-real-transport-approval-forbidden',
  'enqueueRelay',
  'mintFullBundleV3',
  'burnSequence',
  'operatorDryRunApprovalAccepted: dryRunApprovalOk',
  'operatorApplyApprovalAccepted: applyApprovalOk',
  'localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk',
  'realTransportApprovalAccepted: false',
]) {
  assertIncludes(source, token, `source predicate token ${token}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function',
  'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const liveStrictDryRunRequest = {
  dryRun: true,
  apply: false,
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  killSwitch: { enabled: true },
  operatorApproval: {
    schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-dry-run-approval.v1',
    approved: true,
    reviewedTransportDryRunApproved: true,
    scope: 'local-mock-webdav-target-only',
    targetMode: 'local-mock-webdav',
    gate: 'webdav-cloud-relay-transport-controlled-apply',
    killSwitchEnabled: true,
    idempotencyKeyHash,
    candidatePayloadHash: payloadHash,
    candidateBundleHash: payloadHash,
    peerTargetHash,
    remoteRootHash,
    productSyncReady: false,
    transportReady: false,
    hashOnly: true,
    noCASWrite: true,
    noRelayWrite: true,
    noFileWrite: true,
    noFullBundleV3Start: true,
    noExportStateMutation: true,
    noSequenceBurn: true,
    noA950Mutation: true,
  },
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

const strictDryRun = api.evaluateControlledLocalMockTransport(liveStrictDryRunRequest);
assert.equal(strictDryRun.ok, true, 'live strict dry-run shape passes');
assert.equal(strictDryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(strictDryRun.operatorApprovalAccepted, true);
assert.equal(strictDryRun.operatorDryRunApprovalAccepted, true);
assert.equal(strictDryRun.operatorApplyApprovalAccepted, false);
assert.equal(strictDryRun.localMockApplyApproved, false);
assert.equal(strictDryRun.realTransportApprovalAccepted, false);
assert.equal(strictDryRun.modeledMockApply, false);
assert.equal(strictDryRun.modeledMockWriteCount, 0);
assert.equal(strictDryRun.duplicateReplayZeroWrite, true);
assert.equal(strictDryRun.restartFailClosed, true);
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
  ...liveStrictDryRunRequest,
  dryRun: false,
  apply: true,
  operatorApproval: undefined,
});
assert.equal(missingApprovalApply.ok, false, 'missing apply approval blocks');
assert.ok(missingApprovalApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `missing approval blockers: ${missingApprovalApply.blockers.join(',')}`);

const invalidApprovalApply = api.evaluateControlledLocalMockTransport({
  ...liveStrictDryRunRequest,
  dryRun: false,
  apply: true,
  operatorApproval: {
    ...liveStrictDryRunRequest.operatorApproval,
    approved: false,
    reviewedTransportApplyApproved: true,
    controlledLocalMockApplyApproved: true,
  },
});
assert.equal(invalidApprovalApply.ok, false, 'invalid approval blocks');
assert.ok(invalidApprovalApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `invalid approval blockers: ${invalidApprovalApply.blockers.join(',')}`);

const dryRunApprovalCannotApply = api.evaluateControlledLocalMockTransport({
  ...liveStrictDryRunRequest,
  dryRun: false,
  apply: true,
});
assert.equal(dryRunApprovalCannotApply.ok, false, 'dry-run approval does not approve apply');
assert.equal(dryRunApprovalCannotApply.operatorDryRunApprovalAccepted, true);
assert.equal(dryRunApprovalCannotApply.operatorApplyApprovalAccepted, false);
assert.equal(dryRunApprovalCannotApply.localMockApplyApproved, false);
assert.ok(dryRunApprovalCannotApply.blockers.includes('controlled-local-mock-operator-approval-required'),
  `dry-run approval apply blockers: ${dryRunApprovalCannotApply.blockers.join(',')}`);

function expectBlock(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...liveStrictDryRunRequest,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} blocks`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.realWebDAVWrite, false, `${label}: no real WebDAV write`);
  assert.equal(result.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
}

expectBlock('real transport approval', {
  operatorApproval: {
    ...liveStrictDryRunRequest.operatorApproval,
    realTransportApproved: true,
  },
}, 'controlled-local-mock-real-transport-approval-forbidden');
expectBlock('real WebDAV target', {
  target: { mode: 'real-webdav', peerTargetHash, remoteRootHash, ambiguous: false },
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
  readiness: { ...liveStrictDryRunRequest.readiness, productSyncReady: true },
}, 'controlled-local-mock-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...liveStrictDryRunRequest.readiness, transportReady: true },
}, 'controlled-local-mock-transport-ready-mismatch');
expectBlock('a950 mutation', { safety: { mutateA950: true } },
  'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-dry-run-approval-predicate-fix.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_DRY_RUN_APPROVAL_PREDICATE_FIXED',
  operatorApprovalAccepted: true,
  operatorDryRunApprovalAccepted: true,
  operatorApplyApprovalAccepted: false,
  localMockApplyApproved: false,
  realTransportApprovalAccepted: false,
  dryRunZeroWrite: true,
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
