#!/usr/bin/env node
//
// Transport rollback / disable / fail-closed proof validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const inventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const v3BoundaryPath = 'release-evidence/2026-07-01/fullbundle-v3-preflight-payload-transport-boundary-design.md';
const webdavSourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relaySourcePath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';

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

function installWebdavSource() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(webdavSourcePath), sandbox, { filename: webdavSourcePath });
  return sandbox.H2O?.Studio?.sync;
}

function installRelaySource() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(relaySourcePath), sandbox, { filename: relaySourcePath });
  return sandbox.H2O?.Studio?.sync?.relayIdempotencyRestartProofHarness;
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const inventory = read(inventoryPath);
const v3Boundary = read(v3BoundaryPath);
const webdavSource = read(webdavSourcePath);
const relaySource = read(relaySourcePath);

for (const token of [
  'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'cb587fa0aa9e02b3acda0678997ef118d6dd76be',
  'rollbackDisableFailClosedProof:true',
  'transportDisabledByDefault:true',
  'killSwitchAvailable:false',
  'killSwitchBlocker:"transport-kill-switch-not-implemented-for-controlled-writes"',
  'autoStartBlocked:true',
  'bootResumeBlocked:true',
  'dryRunCannotBecomeWrite:true',
  'controlledGateRequired:true',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesRelay:false',
  'enqueuesRelay:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'productSyncReady:false',
  'transportReady:false',
  'fullBundleV3Started:false',
  'webdav-cloud-relay-transport-controlled-apply',
  'webdav-dev-only-do-not-ship',
  'A dedicated future controlled-transport kill switch must be implemented and proven before any controlled transport write implementation can be approved',
  'there is no transport state to roll back because the preflight writes nothing',
  'boot resume is blocked from dispatching transport',
  'dry-run state into write state',
  'status:"webdav-transport-dry-run-ready"',
  'status:"relay-idempotency-restart-proof-ready"',
  'status:"fullbundle-v2-transport-envelope-preflight-ready"',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeBlockedWithoutControlledGate:true',
  'allFailureModesBlockBeforeEnqueue:true',
  'localExportableSyncReadyIsAuthorization:false',
  'relayOutboxTouched:false',
  'publicationLedgerTouched:false',
  'payloadUnmodified:true',
  'fullBundleV3Required:false',
  'fullBundleV3Deferred:true',
  'a950LeaksIntoExportablePayload:false',
  'Transport still requires a future controlled implementation slice',
  'The proof does not authorize transport',
  'The proof does not authorize WebDAV/cloud/relay',
  'The proof does not authorize `fullBundle.v3`',
  'The proof does not authorize cleanup',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
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
  'WebDAV/cloud/relay can start now',
  'cleanup is authorized',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(fullBundleCloseout, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'fullBundle closeout respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV closeout respected');
assertIncludes(inventory, 'TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT',
  'inventory respected');
assertIncludes(v3Boundary, 'FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT',
  'v3 boundary respected');

for (const token of [
  'DEV_ONLY_WRITE_FLAG',
  'webdav-dev-only-do-not-ship',
  'TRANSPORT_CONTROLLED_APPLY_GATE',
  'webdav-cloud-relay-transport-controlled-apply',
  'function evaluateTransportReadinessDryRun(request)',
  'function evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesRelay: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'enqueuesRelay: false',
  'fullBundleV3Started: false',
  'productSyncReady: false',
  'transportReady: false',
  'noCleanupAuthority: true',
  'webdav-dry-run-remote-write-forbidden',
  'webdav-dry-run-relay-enqueue-forbidden',
  'webdav-chat-saving-cas-boundary-violation',
  'webdav-fullbundle-v3-start-forbidden',
  'fullbundle-v2-envelope-webdav-cloud-write-forbidden',
  'fullbundle-v2-envelope-relay-enqueue-forbidden',
  'fullbundle-v2-envelope-cas-write-forbidden',
  'fullbundle-v2-envelope-export-mutation-forbidden',
  'fullbundle-v2-envelope-fullbundle-v3-forbidden',
]) {
  assertIncludes(webdavSource, token, `WebDAV source token ${token}`);
}

for (const token of [
  'function evaluateRelayIdempotencyRestartProof(request)',
  'relay-idempotency-restart-proof-harness-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'writesRelay: false',
  'enqueuesRelay: false',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'bootResumeDispatch: false',
  'relayOutboxTouched: false',
  'publicationLedgerTouched: false',
  'fullBundleV3Started: false',
  'productSyncReady: false',
  'transportReady: false',
  'localExportableSyncReadyIsAuthorization: false',
  'duplicateReplayZeroWrite',
  'restartFailClosed: true',
  'bootResumeBlockedWithoutControlledGate: true',
  'allFailureModesBlockBeforeEnqueue',
  'relay-enqueue-forbidden-in-proof-harness',
  'relay-webdav-cloud-write-forbidden-in-proof-harness',
  'relay-cas-write-forbidden-in-proof-harness',
  'relay-fullbundle-v3-start-forbidden-in-proof-harness',
  'relay-export-state-mutation-forbidden-in-proof-harness',
  'relay-cleanup-authority-forbidden-in-proof-harness',
  'relay-boot-resume-dispatch-forbidden-in-proof-harness',
  'relay-dry-run-state-write-transition-forbidden',
]) {
  assertIncludes(relaySource, token, `relay source token ${token}`);
}

for (const source of [webdavSource, relaySource]) {
  for (const forbidden of [
    'fetch(',
    'XMLHttpRequest',
    'navigator.sendBeacon',
    'localStorage.setItem',
    'sessionStorage.setItem',
    'indexedDB.open',
    'productSyncReady: true',
    'transportReady: true',
  ]) {
    assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
  }
}

const sync = installWebdavSource();
assert.equal(typeof sync?.webdavTransportGates?.evaluateTransportReadinessDryRun, 'function',
  'WebDAV dry-run API exposed');
assert.equal(typeof sync?.fullBundleTransportEnvelope?.evaluateFullBundleV2TransportEnvelopePreflight, 'function',
  'fullBundle envelope preflight API exposed');

const payloadHash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const webdavProof = sync.webdavTransportGates.evaluateTransportReadinessDryRun({
  dryRun: true,
  apply: false,
  gate: 'webdav-transport-readiness-dry-run-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    chatSavingCasBlocked: true,
    a950DocumentedDebtQuarantined: true,
  },
  expectedBundle: {
    expectedHash: payloadHash,
  },
  sequence: {
    mintNewExport: false,
    requireExistingOnly: true,
  },
  target: {
    mode: 'mock-peer',
    peerToken: 'peer:webdav-dry-run-local-mock',
    remoteRootToken: 'root:webdav-dry-run-mock',
    ambiguous: false,
  },
  transport: {
    enqueueRelay: false,
    writeRemote: false,
    writeWebDAV: false,
    writeCloud: false,
    touchChatSavingCAS: false,
    startFullBundleV3: false,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
  },
  privacy: {
    mode: 'hash-only',
  },
});

assert.equal(webdavProof.ok, true, 'WebDAV dry-run remains ready');
assert.equal(webdavProof.status, 'webdav-transport-dry-run-ready', 'WebDAV dry-run status');
assert.equal(webdavProof.writesWebDAV, false, 'WebDAV proof does not write WebDAV');
assert.equal(webdavProof.writesRelay, false, 'WebDAV proof does not write relay');
assert.equal(webdavProof.enqueuesRelay, false, 'WebDAV proof does not enqueue relay');
assert.equal(webdavProof.writesCAS, false, 'WebDAV proof does not write CAS');
assert.equal(webdavProof.mutatesExportState, false, 'WebDAV proof does not mutate export state');
assert.equal(webdavProof.mintsExportId, false, 'WebDAV proof does not mint export id');
assert.equal(webdavProof.burnsSequence, false, 'WebDAV proof does not burn sequence');
assert.equal(webdavProof.productSyncReady, false, 'WebDAV proof keeps productSyncReady false');
assert.equal(webdavProof.transportReady, false, 'WebDAV proof keeps transportReady false');
assert.equal(webdavProof.fullBundleV3Started, false, 'WebDAV proof keeps fullBundle.v3 stopped');

const blockedWebdav = sync.webdavTransportGates.evaluateTransportReadinessDryRun({
  ...webdavProof,
  dryRun: true,
  apply: false,
  gate: 'webdav-transport-readiness-dry-run-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  expectedBundle: {
    expectedHash: payloadHash,
  },
  sequence: {
    mintNewExport: false,
    requireExistingOnly: true,
  },
  target: {
    mode: 'mock-peer',
    ambiguous: false,
  },
  transport: {
    writeWebDAV: true,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
  },
  privacy: {
    mode: 'hash-only',
  },
});
assert.equal(blockedWebdav.ok, false, 'WebDAV write attempt blocks');
assert.ok(blockedWebdav.blockers.includes('webdav-dry-run-remote-write-forbidden'),
  'WebDAV write blocker present');

const envelopeProof = sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight({
  dryRun: true,
  apply: false,
  gate: 'fullbundle-v2-transport-envelope-preflight-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  candidate: {
    payloadHash,
    bundleHash: payloadHash,
    expectedProjectionCount: 12,
    expectedBindingProjectionCount: 12,
    startFullBundleV3: false,
    mutatePayload: false,
  },
  sequence: {
    mintNewExport: false,
    burnSequence: false,
    requireExistingOnly: true,
  },
  target: {
    peerTargetHash: 'sha256:' + 'c'.repeat(64),
    remoteRootHash: 'sha256:' + 'd'.repeat(64),
    ambiguous: false,
  },
  transport: {
    enqueueRelay: false,
    writeWebDAV: false,
    writeCloud: false,
    touchChatSavingCAS: false,
    writeFiles: false,
    startFullBundleV3: false,
  },
  safety: {
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    mutateA950: false,
    cleanupAuthority: false,
  },
  privacy: {
    mode: 'hash-only',
  },
});

assert.equal(envelopeProof.ok, true, 'fullBundle envelope proof remains ready');
assert.equal(envelopeProof.fullBundleV3Started, false, 'envelope keeps fullBundle.v3 stopped');
assert.equal(envelopeProof.payloadUnmodified, true, 'envelope payload unmodified');
assert.equal(envelopeProof.mutatesExportState, false, 'envelope does not mutate export state');
assert.equal(envelopeProof.mintsExportId, false, 'envelope does not mint export id');
assert.equal(envelopeProof.burnsSequence, false, 'envelope does not burn sequence');
assert.equal(envelopeProof.a950LeaksIntoExportablePayload, false, 'a950 does not leak');

const relayApi = installRelaySource();
assert.equal(typeof relayApi?.evaluateRelayIdempotencyRestartProof, 'function', 'relay proof API exposed');
const relayProof = relayApi.evaluateRelayIdempotencyRestartProof({
  dryRun: true,
  apply: false,
  gate: 'relay-idempotency-restart-proof-harness-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  candidate: {
    payloadHash,
    bundleHash: payloadHash,
    peerTargetHash: 'sha256:' + 'c'.repeat(64),
    remoteRootHash: 'sha256:' + 'd'.repeat(64),
    operationKind: 'webdav-cloud-relay-transport-dry-run',
    activeTransport: 'local-sync-folder-json',
    reservedControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
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
    simulateBootResume: true,
    expectFailClosed: true,
    allowDispatchWithoutControlledGate: false,
  },
  transport: {
    enqueueRelay: false,
    writeRemote: false,
    writeWebDAV: false,
    writeCloud: false,
    touchChatSavingCAS: false,
    startFullBundleV3: false,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
    localExportableIsRelayAuthorization: false,
  },
  privacy: {
    mode: 'hash-only',
  },
});

assert.equal(relayProof.ok, true, 'relay proof remains ready');
assert.equal(relayProof.duplicateReplayZeroWrite, true, 'relay duplicate replay zero-write');
assert.equal(relayProof.restartFailClosed, true, 'relay restart fail-closed');
assert.equal(relayProof.bootResumeDispatch, false, 'relay boot resume dispatch false');
assert.equal(relayProof.bootResumeBlockedWithoutControlledGate, true, 'relay boot resume blocked without controlled gate');
assert.equal(relayProof.relayOutboxTouched, false, 'relay outbox untouched');
assert.equal(relayProof.publicationLedgerTouched, false, 'publication ledger untouched');
assert.equal(relayProof.writesRelay, false, 'relay proof does not write relay');
assert.equal(relayProof.enqueuesRelay, false, 'relay proof does not enqueue relay');
assert.equal(relayProof.writesWebDAV, false, 'relay proof does not write WebDAV');
assert.equal(relayProof.writesCAS, false, 'relay proof does not write CAS');
assert.equal(relayProof.mutatesExportState, false, 'relay proof does not mutate export state');
assert.equal(relayProof.mintsExportId, false, 'relay proof does not mint export id');
assert.equal(relayProof.burnsSequence, false, 'relay proof does not burn sequence');
assert.equal(relayProof.productSyncReady, false, 'relay proof keeps productSyncReady false');
assert.equal(relayProof.transportReady, false, 'relay proof keeps transportReady false');
assert.equal(relayProof.localExportableSyncReadyIsAuthorization, false,
  'localExportableSyncReady is not relay authorization');
assert.equal(relayProof.allFailureModesBlockBeforeEnqueue, true,
  'all relay failure modes block before enqueue');

const blockedRelay = relayApi.evaluateRelayIdempotencyRestartProof({
  ...relayProof,
  dryRun: true,
  apply: false,
  gate: 'relay-idempotency-restart-proof-harness-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  candidate: {
    payloadHash,
    bundleHash: payloadHash,
    peerTargetHash: 'sha256:' + 'c'.repeat(64),
    remoteRootHash: 'sha256:' + 'd'.repeat(64),
    operationKind: 'webdav-cloud-relay-transport-dry-run',
    activeTransport: 'local-sync-folder-json',
    reservedControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  },
  transport: {
    enqueueRelay: true,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
  },
});
assert.equal(blockedRelay.ok, false, 'relay enqueue attempt blocks');
assert.ok(blockedRelay.blockers.includes('relay-enqueue-forbidden-in-proof-harness'),
  'relay enqueue blocker present');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.rollback-disable-fail-closed-proof.validator.v1',
  verdict: 'TRANSPORT_ROLLBACK_DISABLE_FAIL_CLOSED_PROOF_NON_WRITING',
  rollbackDisableFailClosedProof: true,
  transportDisabledByDefault: true,
  killSwitchAvailable: false,
  killSwitchBlocker: 'transport-kill-switch-not-implemented-for-controlled-writes',
  autoStartBlocked: true,
  bootResumeBlocked: true,
  dryRunCannotBecomeWrite: true,
  controlledGateRequired: true,
  writesWebDAV: false,
  writesCloud: false,
  writesRelay: false,
  enqueuesRelay: false,
  writesCAS: false,
  writesFiles: false,
  mutatesExportState: false,
  mintsExportId: false,
  burnsSequence: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
}, null, 2));
