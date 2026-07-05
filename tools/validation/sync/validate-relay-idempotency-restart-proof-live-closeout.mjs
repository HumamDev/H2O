#!/usr/bin/env node
//
// Relay idempotency / restart proof live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-implementation.md';
const liveContractFixPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-contract-fix.md';
const designEvidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-design.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const sourcePath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';

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

const evidence = read(evidencePath);
const flat = compact(evidence);
const implementationEvidence = read(implementationEvidencePath);
const liveContractFixEvidence = read(liveContractFixPath);
const designEvidence = read(designEvidencePath);
const webdavCloseout = read(webdavCloseoutPath);
const source = read(sourcePath);

for (const token of [
  'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'a8779f24ee8f043745ff3fe969d542bcf8bf2839',
  '2d4091d7f2757879e7b79f66e97caaf46c0e92ae',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  '5a728d1d2d8e19ce67f6f51ae50bf5102bb8c46d',
  'H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof(request)',
  'schema:"h2o.studio.relay.idempotency-restart-proof.live-readonly-proof.v2"',
  'diagnosticOnly:true',
  'readOnly:true',
  'writeIntent:false',
  'apiAvailable:true',
  'proofApiAvailable:true',
  'gate:"relay-idempotency-restart-proof-harness-evaluate"',
  'schema:"h2o.studio.transport.relay-idempotency-restart-proof.v1"',
  'requestSchema:"h2o.studio.transport.relay-idempotency-restart-proof-request.v1"',
  'version:"0.1.0-phase31-relay-proof-harness"',
  'ok:true',
  'status:"relay-idempotency-restart-proof-ready"',
  'reason:"relay-idempotency-restart-proof-ready"',
  'gateSatisfied:true',
  'relayProofHarness:true',
  'dryRunOnly:true',
  'dryRun:true',
  'applyRequested:false',
  'writesRelay:false',
  'enqueuesRelay:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'bootResumeDispatch:false',
  'relayOutboxTouched:false',
  'publicationLedgerTouched:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
  'localExportableSyncReady:true',
  'transportEligibilityFromLocalExportableReady:true',
  'localExportableSyncReadyIsAuthorization:false',
  'idempotencyModeled:true',
  'idempotencyKeyHashOnly:true',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeBlockedWithoutControlledGate:true',
  'allFailureModesBlockBeforeEnqueue:true',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'blockers:[]',
  'warnings:[]',
  'activeTransport:"local-sync-folder-json"',
  'transportControlledApplyGateReserved:"webdav-cloud-relay-transport-controlled-apply"',
  'The proof gate `relay-idempotency-restart-proof-harness-evaluate` was satisfied',
  'Duplicate replay is proven zero-write',
  'Restart and boot resume are proven fail-closed',
  '`localExportableSyncReady:true` remains a local/exportable parity signal only',
  'It is not relay authorization',
  'All modeled failure modes block before enqueue/write',
  'No relay outbox or publication ledger was touched',
  'No export state was mutated',
  'No WebDAV/cloud/relay/CAS/file write occurred',
  '`fullBundle.v3` was not started',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving CAS remains blocked/deferred',
  'a950 remains documented/quarantined debt',
  'No cleanup authority is introduced',
  'Privacy remained redacted/hash-only',
  'The reserved controlled gate `webdav-cloud-relay-transport-controlled-apply` remains reserved only and unusable in this slice',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  'No real transport is implemented by this closeout',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true',
  'productSyncReady:true',
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'fullBundle.v3 started',
  'Chat Saving CAS can start now',
  'cleanup authority is introduced and approved',
  'writesRelay:true',
  'enqueuesRelay:true',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesCAS:true',
  'writesFiles:true',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS IMPLEMENTED - NON-WRITING',
  'implementation evidence respected');
assertIncludes(liveContractFixEvidence, 'RELAY IDEMPOTENCY RESTART PROOF LIVE CONTRACT FIXED - ZERO WRITE',
  'live contract fix evidence respected');
assertIncludes(designEvidence, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS DESIGNED - NON-WRITING',
  'design evidence respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV dry-run closeout respected');

for (const token of [
  'function evaluateRelayIdempotencyRestartProof(request)',
  'relay-idempotency-restart-proof-harness-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'h2o.studio.transport.relay-idempotency-restart-proof.v1',
  'h2o.studio.transport.relay-idempotency-restart-proof-request.v1',
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
  'relay-cleanup-authority-forbidden-in-proof-harness',
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
  'dispatchExecuteRelay(',
  'enqueueRelayEnvelope(',
  'confirmExecuteRelay(',
  'classifyExecuteResumeAction(',
  'invokeResumeAction(',
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const api = sandbox.H2O?.Studio?.sync?.relayIdempotencyRestartProofHarness;
assert.equal(typeof api?.evaluateRelayIdempotencyRestartProof, 'function', 'proof harness API exposed');

const proof = api.evaluateRelayIdempotencyRestartProof({
  schema: 'h2o.studio.transport.relay-idempotency-restart-proof-request.v1',
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
    payloadHash: 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
    bundleHash: 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
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

assert.equal(proof.ok, true, 'modeled live proof passes');
assert.equal(proof.status, 'relay-idempotency-restart-proof-ready', 'modeled live status');
assert.equal(proof.gateSatisfied, true, 'gate satisfied');
assert.equal(proof.writesRelay, false, 'no relay write');
assert.equal(proof.enqueuesRelay, false, 'no relay enqueue');
assert.equal(proof.writesWebDAV, false, 'no WebDAV write');
assert.equal(proof.writesCloud, false, 'no cloud write');
assert.equal(proof.writesCAS, false, 'no CAS write');
assert.equal(proof.writesFiles, false, 'no file write');
assert.equal(proof.mutatesExportState, false, 'no export state mutation');
assert.equal(proof.mintsExportId, false, 'no export id mint');
assert.equal(proof.burnsSequence, false, 'no sequence burn');
assert.equal(proof.bootResumeDispatch, false, 'no boot resume dispatch');
assert.equal(proof.relayOutboxTouched, false, 'no relay outbox touch');
assert.equal(proof.publicationLedgerTouched, false, 'no publication ledger touch');
assert.equal(proof.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(proof.productSyncReady, false, 'productSyncReady false');
assert.equal(proof.transportReady, false, 'transportReady false');
assert.equal(proof.localExportableSyncReady, true, 'localExportable true');
assert.equal(proof.localExportableSyncReadyIsAuthorization, false, 'localExportable not relay authorization');
assert.equal(proof.idempotencyKeyHashOnly, true, 'idempotency hash-only');
assert.equal(proof.duplicateReplayZeroWrite, true, 'duplicate replay zero-write');
assert.equal(proof.restartFailClosed, true, 'restart fail-closed');
assert.equal(proof.restartModel.bootResumeDispatch, false, 'boot resume dispatch false');
assert.equal(proof.restartModel.missingControlledGateBlocksWriteTransition, true,
  'missing controlled gate blocks write transition');
assert.equal(proof.allFailureModesBlockBeforeEnqueue, true, 'all failure modes block before enqueue');
assert.equal(proof.webdavCloudRelayBlocked, true, 'WebDAV/cloud/relay blocked');
assert.equal(proof.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(proof.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(proof.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(proof.blockers.length, 0, 'modeled live proof blockers empty');
assert.equal(proof.warnings.length, 0, 'modeled live proof warnings empty');

console.log('validate-relay-idempotency-restart-proof-live-closeout: PASS');
