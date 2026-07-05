#!/usr/bin/env node
//
// Controlled local mock WebDAV approval predicate live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-approval-predicate-live-closeout.md';
const predicateFixPath =
  'release-evidence/2026-07-01/controlled-local-mock-dry-run-approval-predicate-fix.md';
const reportingPath = 'release-evidence/2026-07-01/controlled-local-mock-approval-reporting-fix.md';
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
const predicateFix = read(predicateFixPath);
const reporting = read(reportingPath);
const liveContractFix = read(liveContractFixPath);
const implementation = read(implementationPath);

for (const token of [
  'CONTROLLED LOCAL MOCK APPROVAL PREDICATE LIVE PROVEN',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '8a57a9226a0c80b285439f63fc892957d57b221e',
  'ea9971acb298b021b93e87f3e3322b9498ed3e88',
  'h2o.studio.controlled-local-mock-webdav-transport.approval-predicate-live-proof.v1',
  'diagnosticOnly:true',
  'readOnly:true',
  'writeIntent:false',
  'apiAvailable:true',
  'controlledMockApiAvailable:true',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1',
  'ok:true',
  'status:"controlled-local-mock-webdav-transport-dry-run-ready"',
  'controlledMockTransport:true',
  'targetMode:"local-mock-webdav"',
  'gateSatisfied:true',
  'dryRun:true',
  'applyRequested:false',
  'killSwitchEnabled:true',
  'operatorApprovalAccepted:true',
  'operatorDryRunApprovalAccepted:true',
  'operatorApplyApprovalAccepted:false',
  'localMockApplyApproved:false',
  'realTransportApprovalAccepted:false',
  'reservedControlledGateUsedForLocalMockOnly:true',
  'modeledMockApply:false',
  'modeledMockWriteCount:0',
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
  'no local mock apply was run',
  'Local mock apply is not approved by this closeout',
  'Real WebDAV/cloud/relay cannot start now',
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
  'modeledMockApply:true',
  'localMockApplyApproved:true',
  'realTransportApprovalAccepted:true',
  'productSyncReady:true is approved',
  'transportReady:true is approved',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(predicateFix, 'CONTROLLED LOCAL MOCK DRY-RUN APPROVAL PREDICATE FIXED',
  'predicate fix respected');
assertIncludes(reporting, 'CONTROLLED LOCAL MOCK APPROVAL REPORTING FIXED',
  'approval reporting fix respected');
assertIncludes(liveContractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live contract fix respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation respected');

for (const token of [
  'operatorDryRunApprovalAccepted: dryRunApprovalOk',
  'operatorApplyApprovalAccepted: applyApprovalOk',
  'localMockApplyApproved: blockers.length === 0 && applyRequested && applyApprovalOk',
  'realTransportApprovalAccepted: false',
  'controlled-local-mock-real-transport-approval-forbidden',
]) {
  assertIncludes(source, token, `source token ${token}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function',
  'controlled local mock API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idempotencyKeyHash = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peerTargetHash = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const remoteRootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const liveRequest = {
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

const result = api.evaluateControlledLocalMockTransport(liveRequest);
assert.equal(result.ok, true, 'live strict approval dry-run model passes');
assert.equal(result.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(result.operatorApprovalAccepted, true);
assert.equal(result.operatorDryRunApprovalAccepted, true);
assert.equal(result.operatorApplyApprovalAccepted, false);
assert.equal(result.localMockApplyApproved, false);
assert.equal(result.realTransportApprovalAccepted, false);
assert.equal(result.modeledMockApply, false);
assert.equal(result.modeledMockWriteCount, 0);
assert.equal(result.realWebDAVWrite, false);
assert.equal(result.writesWebDAV, false);
assert.equal(result.writesCloud, false);
assert.equal(result.enqueuesRelay, false);
assert.equal(result.writesCAS, false);
assert.equal(result.writesFiles, false);
assert.equal(result.mutatesExportState, false);
assert.equal(result.mintsExportId, false);
assert.equal(result.burnsSequence, false);
assert.equal(result.fullBundleV3Started, false);
assert.equal(result.productSyncReady, false);
assert.equal(result.transportReady, false);
assert.equal(result.duplicateReplayZeroWrite, true);
assert.equal(result.restartFailClosed, true);
assert.equal(result.noCleanupAuthority, true);
assert.equal(result.blockers.length, 0);
assert.equal(result.warnings.length, 0);

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-approval-predicate-live-closeout.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_APPROVAL_PREDICATE_LIVE_PROVEN',
  liveApiAvailable: true,
  strictDryRunOk: true,
  operatorApprovalAccepted: true,
  operatorDryRunApprovalAccepted: true,
  operatorApplyApprovalAccepted: false,
  localMockApplyApproved: false,
  realTransportApprovalAccepted: false,
  modeledMockWriteCount: 0,
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
