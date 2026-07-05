#!/usr/bin/env node
//
// Controlled local mock WebDAV transport live-contract fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-live-contract-fix.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/controlled-local-mock-webdav-transport-implementation.md';
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
const implementationEvidence = read(implementationEvidencePath);
const design = read(designPath);
const killSwitch = read(killSwitchPath);
const finalRollup = read(finalRollupPath);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);

for (const token of [
  'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT LIVE CONTRACT FIXED - DRY-RUN CONTRACT NORMALIZED / REAL TRANSPORT STILL BLOCKED',
  'Root cause of the live dry-run rejection',
  'candidate.idempotencyKeyHash',
  'candidate.idempotencyKey` only when it is already a real `sha256:<64-hex>` value',
  'dry-run operator approval',
  'duplicateReplay.samePayloadTargetSequence:true',
  'restart.simulateReload:true',
  'Non-hash idempotency strings remain rejected',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledLocalMockTransport(request)',
  'controlled-local-mock-webdav-transport-dry-run-ready',
  'operatorApprovalAccepted:true',
  'idempotencyKeyHash:"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
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
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'blockers:[]',
  'real WebDAV target',
  'cloud target',
  'relay enqueue',
  'CAS write',
  'file write',
  '`fullBundle.v3` start/mint',
  'raw/private evidence',
  'cleanup or `row:a950a44b859f` mutation',
  'reserved controlled gate is still local-mock-only',
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
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'CONTROLLED LOCAL MOCK WEBDAV TRANSPORT IMPLEMENTED - MOCK ONLY / REAL TRANSPORT STILL BLOCKED',
  'implementation evidence respected');
assertIncludes(design, 'CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE',
  'controlled transport design respected');
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
  'WebDAV dry-run closeout respected');

for (const token of [
  'function approvalAccepted(approval, expected, applyRequested)',
  'reviewedTransportDryRunApproved',
  'hashLike(app.idempotencyKeyHash || app.idempotencyKey)',
  "objectHash(inp, 'candidate', ['idempotencyKeyHash', 'idempotencyKey'])",
  'duplicateReplay.samePayloadTargetSequence === true && !!idempotencyKeyHash',
  'restart.simulateReload === true',
  'restart.allowDispatchWithoutControlledGate !== true',
  'controlled-local-mock-private-input-rejected',
  'controlled-local-mock-real-webdav-cloud-write-forbidden',
  'controlled-local-mock-relay-enqueue-forbidden',
  'controlled-local-mock-cas-write-forbidden',
  'controlled-local-mock-file-write-forbidden',
  'controlled-local-mock-fullbundle-v3-forbidden',
  'controlled-local-mock-cleanup-authority-forbidden',
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

const liveDryRunRequest = {
  dryRun: true,
  apply: false,
  gate: 'webdav-cloud-relay-transport-controlled-apply',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  killSwitch: {
    enabled: true,
  },
  operatorApproval: {
    schema: 'h2o.studio.transport.webdav-cloud-relay-controlled-dry-run-approval.v1',
    approved: true,
    reviewedTransportDryRunApproved: true,
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
  },
  candidate: {
    kind: 'fullBundle.v2-readonly-projection',
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
  privacy: {
    mode: 'hash-only',
  },
};

const dryRun = api.evaluateControlledLocalMockTransport(liveDryRunRequest);
assert.equal(dryRun.ok, true, 'corrected live dry-run request passes');
assert.equal(dryRun.status, 'controlled-local-mock-webdav-transport-dry-run-ready');
assert.equal(dryRun.dryRun, true);
assert.equal(dryRun.applyRequested, false);
assert.equal(dryRun.operatorApprovalAccepted, true, 'dry-run approval accepted');
assert.equal(dryRun.idempotencyKeyHash, idem, 'idempotency key hash accepted');
assert.equal(dryRun.duplicateReplayZeroWrite, true, 'duplicate replay proof normalized');
assert.equal(dryRun.restartFailClosed, true, 'restart fail-closed proof normalized');
assert.equal(dryRun.modeledMockWriteCount, 0, 'dry-run zero-write');
assert.equal(dryRun.realWebDAVWrite, false);
assert.equal(dryRun.writesWebDAV, false);
assert.equal(dryRun.writesCloud, false);
assert.equal(dryRun.enqueuesRelay, false);
assert.equal(dryRun.writesCAS, false);
assert.equal(dryRun.writesFiles, false);
assert.equal(dryRun.mutatesExportState, false);
assert.equal(dryRun.mintsExportId, false);
assert.equal(dryRun.burnsSequence, false);
assert.equal(dryRun.fullBundleV3Started, false);
assert.equal(dryRun.productSyncReady, false);
assert.equal(dryRun.transportReady, false);
assert.equal(dryRun.noCleanupAuthority, true);
assert.equal(dryRun.blockers.length, 0, 'no blockers');

const candidateIdempotencyAlias = api.evaluateControlledLocalMockTransport({
  ...liveDryRunRequest,
  candidate: {
    kind: 'fullBundle.v2-readonly-projection',
    payloadHash: hashA,
    bundleHash: hashA,
    projectionHash: hashA,
    idempotencyKey: idem,
  },
});
assert.equal(candidateIdempotencyAlias.ok, true, 'candidate.idempotencyKey alias accepted when hash-only');
assert.equal(candidateIdempotencyAlias.idempotencyKeyHash, idem);

function expectBlock(label, patch, blocker) {
  const result = api.evaluateControlledLocalMockTransport({
    ...liveDryRunRequest,
    ...patch,
  });
  assert.equal(result.ok, false, `${label} blocks`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
}

expectBlock('non-hash idempotency', {
  candidate: {
    kind: 'fullBundle.v2-readonly-projection',
    payloadHash: hashA,
    bundleHash: hashA,
    projectionHash: hashA,
    idempotencyKey: 'relay-idempotency-key-not-a-hash',
  },
}, 'controlled-local-mock-idempotency-key-required');
expectBlock('real WebDAV target', {
  target: { mode: 'real-webdav', peerTargetHash: peer, remoteRootHash: rootHash, ambiguous: false },
}, 'controlled-local-mock-target-required');
expectBlock('cloud write', { transport: { writeCloud: true } },
  'controlled-local-mock-real-webdav-cloud-write-forbidden');
expectBlock('CAS write', { transport: { touchChatSavingCAS: true } },
  'controlled-local-mock-cas-write-forbidden');
expectBlock('file write', { transport: { writeFiles: true } },
  'controlled-local-mock-file-write-forbidden');
expectBlock('relay enqueue', { transport: { enqueueRelay: true } },
  'controlled-local-mock-relay-enqueue-forbidden');
expectBlock('fullBundle.v3 start', { transport: { startFullBundleV3: true } },
  'controlled-local-mock-fullbundle-v3-forbidden');
expectBlock('productSyncReady mismatch', {
  readiness: { ...liveDryRunRequest.readiness, productSyncReady: true },
}, 'controlled-local-mock-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...liveDryRunRequest.readiness, transportReady: true },
}, 'controlled-local-mock-transport-ready-mismatch');
expectBlock('a950 mutation', { safety: { mutateA950: true } },
  'controlled-local-mock-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-local-mock-webdav-transport.live-contract-fix.validator.v1',
  verdict: 'CONTROLLED_LOCAL_MOCK_WEBDAV_TRANSPORT_LIVE_CONTRACT_FIXED',
  liveDryRunOk: true,
  operatorApprovalAccepted: true,
  idempotencyKeyHashOnly: true,
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
