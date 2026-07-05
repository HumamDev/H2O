#!/usr/bin/env node
//
// Controlled local mock WebDAV dry-run live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-dry-run-live-closeout.md';
const contractFixPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const implementationPath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
const designPath = 'release-evidence/2026-07-01/controlled-webdav-cloud-relay-transport-implementation-design.md';
const killSwitchPath = 'release-evidence/2026-07-01/transport-controlled-write-kill-switch-implementation.md';
const finalRollupPath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';

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

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const contractFix = read(contractFixPath);
const implementation = read(implementationPath);
const design = read(designPath);
const killSwitch = read(killSwitchPath);
const finalRollup = read(finalRollupPath);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const source = read(sourcePath);

for (const token of [
  'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT DRY-RUN LIVE PROVEN - ZERO WRITE; LOCAL MOCK APPLY NOT APPROVED',
  '050286fe4f695102e529c646e5a72fe60d5266d0',
  '2e9850e672710fea2157df2f34e00277c6723274',
  '5d0190d54a1a62f00cbb028c94ff19d1a37f651b',
  'edb306774a011f5af5fa4141ce9d85972b16283a',
  '40f52a5f8554861a09d8cf69cc77b0c6c7740495',
  'c3f1d8f70cb0b688268fcc814aece1e68ccb8994',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'h2o.studio.controlled-local-mock-webdav-transport.live-dry-run.v2',
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
  'operatorApprovalAccepted:false',
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
  'localExportableSyncReadyIsAuthorization:false',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeDispatch:false',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'blockers:[]',
  'warnings:[]',
  'operatorApprovalAccepted:false` is intentionally recorded',
  'This closeout does **not** approve local mock apply',
  'A future operator-approval acceptance proof/fix is required before any local mock apply can be approved',
  'no local mock apply occurred',
  'no real WebDAV/cloud/relay/CAS/file write occurred',
  'no relay enqueue occurred',
  'no export-state mutation occurred',
  'no export id was minted',
  'no sequence was burned',
  '`fullBundle.v3` was not started',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  'Local mock apply is not approved yet',
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
  'productSyncReady:true is approved',
  'transportReady:true is approved',
  'local mock apply is approved',
  'Real WebDAV/cloud/relay can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(contractFix, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED',
  'live contract fix respected');
assertIncludes(implementation, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'mock implementation respected');
assertIncludes(design, 'CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE',
  'controlled transport design respected');
assertIncludes(killSwitch, 'TRANSPORT CONTROLLED-WRITE KILL SWITCH IMPLEMENTED - DEFAULT BLOCKING / NON-WRITING',
  'kill switch respected');
assertIncludes(finalRollup, 'TRANSPORT READINESS ROLLUP COMPLETE - GLOBAL TRANSPORT STILL BLOCKED',
  'final rollup respected');
assertIncludes(privacy, 'TRANSPORT PRIVACY / EVIDENCE CONTRACT CLOSED - HASH-ONLY / NON-WRITING',
  'privacy contract respected');
assertIncludes(rollback, 'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  'rollback proof respected');
assertIncludes(fullBundleCloseout, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'fullBundle closeout respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV closeout respected');

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function', 'controlled mock API exposed');

const hashA = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idem = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const peer = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const rootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const liveDryRun = api.evaluateControlledLocalMockTransport({
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
    approved: true,
    scope: 'dry-run-no-real-transport',
    controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
    noChatSavingCas: true,
    noFullBundleV3: true,
    noA950Mutation: true,
    privacyHashOnly: true,
  },
  candidate: {
    payloadHash: hashA,
    bundleHash: hashA,
    projectionHash: hashA,
    idempotencyKeyHash: idem,
  },
  target: {
    mode: 'local-mock-webdav',
    peerTargetHash: peer,
    remoteRootHash: rootHash,
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
  privacy: { mode: 'hash-only' },
});

assert.equal(liveDryRun.ok, true, 'live dry-run shape passes');
assert.equal(liveDryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(liveDryRun.operatorApprovalAccepted, false, 'approval caveat modeled');
assert.equal(liveDryRun.modeledMockApply, false, 'no modeled apply');
assert.equal(liveDryRun.modeledMockWriteCount, 0, 'zero write');
assert.equal(liveDryRun.realWebDAVWrite, false);
assert.equal(liveDryRun.writesWebDAV, false);
assert.equal(liveDryRun.writesCloud, false);
assert.equal(liveDryRun.enqueuesRelay, false);
assert.equal(liveDryRun.writesCAS, false);
assert.equal(liveDryRun.writesFiles, false);
assert.equal(liveDryRun.mutatesExportState, false);
assert.equal(liveDryRun.mintsExportId, false);
assert.equal(liveDryRun.burnsSequence, false);
assert.equal(liveDryRun.fullBundleV3Started, false);
assert.equal(liveDryRun.productSyncReady, false);
assert.equal(liveDryRun.transportReady, false);
assert.equal(liveDryRun.duplicateReplayZeroWrite, true);
assert.equal(liveDryRun.restartFailClosed, true);
assert.equal(liveDryRun.noCleanupAuthority, true);
assert.equal(liveDryRun.blockers.length, 0, 'no blockers');
assert.equal(liveDryRun.warnings.length, 0, 'no warnings');

const applyWithSameApproval = api.evaluateControlledLocalMockTransport({
  dryRun: false,
  apply: true,
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  killSwitch: { enabled: true },
  operatorApproval: {
    approved: true,
    scope: 'dry-run-no-real-transport',
    controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
    noChatSavingCas: true,
    noFullBundleV3: true,
    noA950Mutation: true,
    privacyHashOnly: true,
  },
  candidate: {
    payloadHash: hashA,
    bundleHash: hashA,
    idempotencyKeyHash: idem,
  },
  target: {
    mode: 'local-mock-webdav',
    peerTargetHash: peer,
    remoteRootHash: rootHash,
    ambiguous: false,
  },
  sequence: { mintNewExport: false, burnSequence: false, requireExistingOnly: true },
  duplicateReplay: { samePayloadTargetSequence: true, expectZeroWrite: true },
  restart: { simulateReload: true, expectFailClosed: true },
  transport: { writeWebDAV: false, writeCloud: false, enqueueRelay: false, touchChatSavingCAS: false },
  safety: { mutateA950: false, cleanupAuthority: false },
  privacy: { mode: 'hash-only' },
});
assert.equal(applyWithSameApproval.ok, false, 'same approval does not approve apply');
assert.ok(applyWithSameApproval.blockers.includes('controlled-local-mock-operator-approval-required'),
  'apply remains blocked by approval requirement');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-dry-run-live-closeout.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_WEBDAV_DRY_RUN_LIVE_PROVEN_APPLY_NOT_APPROVED',
  liveApiAvailable: true,
  dryRunOk: true,
  operatorApprovalAccepted: false,
  localMockApplyApproved: false,
  modeledMockWriteCount: 0,
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
