#!/usr/bin/env node
//
// Controlled local mock WebDAV transport implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
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

const source = read(sourcePath);
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const design = read(designPath);
const killSwitch = read(killSwitchPath);
const finalRollup = read(finalRollupPath);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);

for (const token of [
  'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  '5d0190d54a1a62f00cbb028c94ff19d1a37f651b',
  'edb306774a011f5af5fa4141ce9d85972b16283a',
  '40f52a5f8554861a09d8cf69cc77b0c6c7740495',
  'c3f1d8f70cb0b688268fcc814aece1e68ccb8994',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-request.v1',
  'h2o.studio.transport.controlled-local-mock-webdav-transport-result.v1',
  'webdav-cloud-relay-transport-controlled-apply',
  'usable only for the local mock modeled apply path',
  'killSwitch.enabled:true',
  'scope:"local-mock-webdav-target-only"',
  'controlledGate:"webdav-cloud-relay-transport-controlled-apply"',
  'idempotencyKeyHash:"sha256:<64-hex>"',
  'candidatePayloadHash:"sha256:<64-hex>"',
  'candidateBundleHash:"sha256:<64-hex>"',
  'peerTargetHash:"sha256:<64-hex>"',
  'remoteRootRefHash:"sha256:<64-hex>"',
  'productSyncReady:false',
  'transportReady:false',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'controlledMockTransport:true',
  'targetMode:"local-mock-webdav"',
  'gateSatisfied:true',
  'operatorApprovalAccepted:true',
  'controlledMockTransportImplementationPresent:true',
  'controlledTransportScope:"local-mock-webdav-target-only"',
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
  'localExportableSyncReadyIsAuthorization:false',
  'bootResumeDispatch:false',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'modeledMockWriteCount:0',
  'controlled-local-mock-kill-switch-disabled',
  'controlled-local-mock-controlled-gate-required',
  'controlled-local-mock-operator-approval-required',
  'controlled-local-mock-idempotency-key-required',
  'controlled-local-mock-payload-hash-mismatch',
  'controlled-local-mock-real-webdav-cloud-write-forbidden',
  'controlled-local-mock-relay-enqueue-forbidden',
  'controlled-local-mock-cas-write-forbidden',
  'controlled-local-mock-file-write-forbidden',
  'controlled-local-mock-fullbundle-v3-forbidden',
  'controlled-local-mock-export-mutation-forbidden',
  'controlled-local-mock-cleanup-authority-forbidden',
  'controlled-local-mock-private-input-rejected',
  'controlled-local-mock-duplicate-replay-proof-required',
  'controlled-local-mock-restart-fail-closed-proof-required',
  'Real WebDAV/cloud/relay cannot start now',
  'Relay enqueue cannot start now',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
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
  'productSyncReady:true is approved',
  'transportReady:true is approved',
  'noCleanupAuthority:false',
  'Real WebDAV/cloud/relay can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(design, 'CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE',
  'controlled transport design respected');
assertIncludes(design, 'local mock WebDAV target first', 'local mock strategy respected');
assertIncludes(killSwitch, 'TRANSPORT CONTROLLED-WRITE KILL SWITCH IMPLEMENTED - DEFAULT BLOCKING / NON-WRITING',
  'kill-switch implementation respected');
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

for (const token of [
  'CONTROLLED_LOCAL_MOCK_TRANSPORT_REQUEST_SCHEMA',
  'CONTROLLED_LOCAL_MOCK_TRANSPORT_RESULT_SCHEMA',
  'function evaluateControlledLocalMockTransport(request)',
  'evaluateControlledLocalMockTransport',
  'controlledMockTransport: true',
  "targetMode: 'local-mock-webdav'",
  'controlledMockTransportImplementationPresent: true',
  "controlledTransportScope: 'local-mock-webdav-target-only'",
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
  'duplicateReplayZeroWrite: duplicateZeroWrite',
  'restartFailClosed: restartFailClosed',
  'bootResumeDispatch: false',
  'noCleanupAuthority: true',
  'controlled-local-mock-kill-switch-disabled',
  'controlled-local-mock-operator-approval-required',
  'controlled-local-mock-real-webdav-cloud-write-forbidden',
  'controlled-local-mock-relay-enqueue-forbidden',
  'controlled-local-mock-cas-write-forbidden',
  'controlled-local-mock-file-write-forbidden',
  'controlled-local-mock-fullbundle-v3-forbidden',
  'controlled-local-mock-export-mutation-forbidden',
  'controlled-local-mock-cleanup-authority-forbidden',
  'controlled-local-mock-duplicate-replay-proof-required',
  'controlled-local-mock-restart-fail-closed-proof-required',
]) {
  assertIncludes(source, token, `source token ${token}`);
}

for (const forbidden of [
  'fetch(',
  'XMLHttpRequest',
  'navigator.sendBeacon',
  'localStorage.setItem',
  'sessionStorage.setItem',
  'indexedDB.open',
  'realWebDAVWrite: true',
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
  'productSyncReady: true',
  'transportReady: true',
  'noCleanupAuthority: false',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledLocalMockTransport, 'function', 'controlled local mock API exposed');

const hashA = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const idem = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const peer = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const rootHash = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

const baseRequest = {
  dryRun: false,
  apply: true,
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  killSwitch: { enabled: true },
  candidate: {
    payloadHash: hashA,
    bundleHash: hashA,
  },
  idempotency: { idempotencyKeyHash: idem },
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
  duplicateReplay: {
    sameIdempotencyKey: true,
    samePayloadTargetSequence: true,
    expectZeroWrite: true,
  },
  restart: {
    expectFailClosed: true,
    allowDispatchWithoutControlledGate: false,
  },
};

const approval = {
  schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1',
  approved: true,
  reviewedTransportApplyApproved: true,
  scope: 'local-mock-webdav-target-only',
  controlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  killSwitchEnabled: true,
  idempotencyKeyHash: idem,
  candidatePayloadHash: hashA,
  candidateBundleHash: hashA,
  peerTargetHash: peer,
  remoteRootRefHash: rootHash,
  productSyncReady: false,
  transportReady: false,
  noChatSavingCas: true,
  noFullBundleV3: true,
  noA950Mutation: true,
  privacyHashOnly: true,
};

const dryRun = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  dryRun: true,
  apply: false,
  killSwitch: { enabled: false },
});
assert.equal(dryRun.ok, true, 'dry-run succeeds with disabled kill switch');
assert.equal(dryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(dryRun.modeledMockWriteCount, 0, 'dry-run zero modeled writes');
assert.equal(dryRun.writesWebDAV, false, 'dry-run no WebDAV write');

const defaultDisabledApply = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  killSwitch: { enabled: false },
  operatorApproval: approval,
});
assert.equal(defaultDisabledApply.ok, false, 'disabled kill switch blocks apply');
assert.ok(defaultDisabledApply.blockers.includes('controlled-local-mock-kill-switch-disabled'),
  'disabled kill-switch blocker present');

const missingApproval = api.evaluateControlledLocalMockTransport(baseRequest);
assert.equal(missingApproval.ok, false, 'missing approval blocks apply');
assert.ok(missingApproval.blockers.includes('controlled-local-mock-operator-approval-required'),
  'approval blocker present');

const apply = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  operatorApproval: approval,
});
assert.equal(apply.ok, true, 'valid local mock apply modeled');
assert.equal(apply.status, 'controlled-local-mock-webdav-transport-applied');
assert.equal(apply.controlledMockTransport, true);
assert.equal(apply.targetMode, 'local-mock-webdav');
assert.equal(apply.operatorApprovalAccepted, true);
assert.equal(apply.modeledMockWriteCount, 1, 'first modeled local mock apply writes one model row');
assert.equal(apply.realWebDAVWrite, false);
assert.equal(apply.writesWebDAV, false);
assert.equal(apply.writesCloud, false);
assert.equal(apply.enqueuesRelay, false);
assert.equal(apply.writesCAS, false);
assert.equal(apply.writesFiles, false);
assert.equal(apply.mutatesExportState, false);
assert.equal(apply.mintsExportId, false);
assert.equal(apply.burnsSequence, false);
assert.equal(apply.fullBundleV3Started, false);
assert.equal(apply.productSyncReady, false);
assert.equal(apply.transportReady, false);
assert.equal(apply.duplicateReplayZeroWrite, true);
assert.equal(apply.restartFailClosed, true);
assert.equal(apply.noCleanupAuthority, true);

const duplicate = api.evaluateControlledLocalMockTransport({
  ...baseRequest,
  operatorApproval: approval,
  duplicateReplay: {
    sameIdempotencyKey: true,
    samePayloadTargetSequence: true,
    expectZeroWrite: true,
    replayed: true,
  },
});
assert.equal(duplicate.ok, true, 'duplicate replay model valid');
assert.equal(duplicate.modeledMockWriteCount, 0, 'duplicate replay zero-write');
assert.equal(duplicate.duplicateReplayZeroWrite, true, 'duplicate replay posture true');

function expectBlock(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...baseRequest,
    operatorApproval: approval,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} blocks`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
}

expectBlock('wrong gate', { gate: 'wrong-gate' }, 'controlled-local-mock-controlled-gate-required');
expectBlock('real WebDAV target', {
  target: { mode: 'real-webdav', peerTargetHash: peer, remoteRootHash: rootHash, ambiguous: false },
}, 'controlled-local-mock-target-required');
expectBlock('cloud write', { transport: { writeCloud: true } }, 'controlled-local-mock-real-webdav-cloud-write-forbidden');
expectBlock('relay enqueue', { transport: { enqueueRelay: true } }, 'controlled-local-mock-relay-enqueue-forbidden');
expectBlock('CAS write', { transport: { touchChatSavingCAS: true } }, 'controlled-local-mock-cas-write-forbidden');
expectBlock('file write', { transport: { writeFiles: true } }, 'controlled-local-mock-file-write-forbidden');
expectBlock('fullBundle.v3 start', { transport: { startFullBundleV3: true } }, 'controlled-local-mock-fullbundle-v3-forbidden');
expectBlock('export mutation', { sequence: { mintNewExport: true } }, 'controlled-local-mock-sequence-mismatch');
expectBlock('a950 mutation', { safety: { mutateA950: true } }, 'controlled-local-mock-cleanup-authority-forbidden');
expectBlock('raw private evidence', { rawChatId: 'chat-raw' }, 'controlled-local-mock-private-input-rejected');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_WEBDAV_TRANSPORT_IMPLEMENTED_REAL_TRANSPORT_BLOCKED',
  api: 'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  defaultKillSwitchBlocksApply: true,
  validLocalMockApplyModeled: true,
  duplicateReplayZeroWrite: true,
  restartFailClosed: true,
  realWebDAVWrite: false,
  writesCloud: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  cleanupAuthorityIntroduced: false,
}, null, 2));
