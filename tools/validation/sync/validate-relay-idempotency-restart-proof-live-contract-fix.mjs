#!/usr/bin/env node
//
// Relay idempotency / restart proof live-contract fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';
const evidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-contract-fix.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-implementation.md';
const designEvidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-design.md';
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

const source = read(sourcePath);
const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const implementationEvidence = read(implementationEvidencePath);
const designEvidence = read(designEvidencePath);
const webdavCloseout = read(webdavCloseoutPath);

for (const token of [
  'RELAY IDEMPOTENCY RESTART PROOF LIVE CONTRACT FIXED - ZERO WRITE',
  'a8779f24ee8f043745ff3fe969d542bcf8bf2839',
  '5a728d1d2d8e19ce67f6f51ae50bf5102bb8c46d',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'gate:"relay-idempotency-restart-proof-harness-evaluate"',
  'candidate.peerTargetHash',
  'candidate.remoteRootHash',
  'candidate.activeTransport',
  'candidate.reservedControlledGate',
  'transport.touchChatSavingCAS:false',
  'safety.mutateA950:false',
  'safety.cleanupAuthority:false',
  'Real SHA-256 strings are still required',
  'await H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof',
  'peerTargetHash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',
  'remoteRootHash: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"',
  'status:"relay-idempotency-restart-proof-ready"',
  'gateSatisfied:true',
  'idempotencyKeyHashOnly:true',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'localExportableSyncReadyIsAuthorization:false',
  'blockers:[]',
  'warnings:[]',
  'writesRelay:false',
  'enqueuesRelay:false',
  'writesWebDAV:false',
  'writesCloud:false',
  'writesCAS:false',
  'writesFiles:false',
  'mutatesExportState:false',
  'mintsExportId:false',
  'burnsSequence:false',
  'fullBundleV3Started:false',
  'productSyncReady:false',
  'transportReady:false',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'missing gate blocks',
  'symbolic non-hex target hash blocks',
  'missing controlled gate blocks write transition',
  'all modeled failure modes block before enqueue/write',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  'No real transport is implemented',
  'Chat Saving CAS remains blocked/deferred',
  '`localExportableSyncReady:true` is not relay or transport authorization',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'transportReady:true is authorized',
  'productSyncReady:true is authorized',
  'cleanup authority is introduced and approved',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS IMPLEMENTED - NON-WRITING',
  'implementation evidence respected');
assertIncludes(designEvidence, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS DESIGNED - NON-WRITING',
  'design evidence respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV closeout respected');

for (const token of [
  "objectHash(inp, 'candidate', ['peerTargetHash'",
  "objectHash(inp, 'candidate', ['remoteRootRefHash'",
  'candidate.activeTransport',
  'candidate.reservedControlledGate',
  'transport.touchChatSavingCAS === false',
  'safety.mutateA950 === false && safety.cleanupAuthority === false',
  'relay-proof-harness-gate-required',
  'relay-target-hash-required',
  'relay-controlled-gate-missing',
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

const liveRequest = Object.freeze({
  schema: 'h2o.studio.transport.relay-idempotency-restart-proof-request.v1',
  dryRun: true,
  apply: false,
  gate: 'relay-idempotency-restart-proof-harness-evaluate',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
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

const good = api.evaluateRelayIdempotencyRestartProof(liveRequest);
assert.equal(good.ok, true, 'corrected live request should pass');
assert.equal(good.status, 'relay-idempotency-restart-proof-ready', 'corrected live status');
assert.equal(good.gateSatisfied, true, 'gate satisfied');
assert.equal(good.writesRelay, false, 'no relay write');
assert.equal(good.enqueuesRelay, false, 'no relay enqueue');
assert.equal(good.writesWebDAV, false, 'no WebDAV write');
assert.equal(good.writesCloud, false, 'no cloud write');
assert.equal(good.writesCAS, false, 'no CAS write');
assert.equal(good.writesFiles, false, 'no file write');
assert.equal(good.mutatesExportState, false, 'no export mutation');
assert.equal(good.mintsExportId, false, 'no export id mint');
assert.equal(good.burnsSequence, false, 'no sequence burn');
assert.equal(good.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(good.productSyncReady, false, 'productSyncReady false');
assert.equal(good.transportReady, false, 'transportReady false');
assert.equal(good.localExportableSyncReady, true, 'localExportable true');
assert.equal(good.transportEligibilityFromLocalExportableReady, true, 'transport eligibility true');
assert.equal(good.localExportableSyncReadyIsAuthorization, false, 'localExportable not relay authorization');
assert.equal(good.idempotencyKeyHashOnly, true, 'idempotency key hash-only');
assert.equal(good.duplicateReplayZeroWrite, true, 'duplicate replay zero-write');
assert.equal(good.restartFailClosed, true, 'restart fail-closed');
assert.equal(good.restartModel.bootResumeDispatch, false, 'boot resume dispatch false');
assert.equal(good.restartModel.localExportableSyncReadyAuthorizesRelayDispatch, false,
  'localExportable cannot dispatch relay');
assert.equal(good.restartModel.missingControlledGateBlocksWriteTransition, true,
  'missing controlled gate blocks write transition');
assert.equal(good.allFailureModesBlockBeforeEnqueue, true, 'all failure modes block before enqueue');
assert.equal(good.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(good.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(good.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(good.blockers.length, 0, 'corrected live request blockers empty');
assert.equal(good.warnings.length, 0, 'corrected live request warnings empty');

const same = api.evaluateRelayIdempotencyRestartProof({ ...liveRequest });
assert.equal(same.idempotencyKey, good.idempotencyKey, 'same live shape same idempotency key');
assert.equal(same.duplicateReplayZeroWrite, true, 'same live shape duplicate zero-write');

function expectBlock(label, patch, blocker) {
  const result = api.evaluateRelayIdempotencyRestartProof({ ...liveRequest, ...patch });
  assert.equal(result.ok, false, `${label}: expected block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.writesRelay, false, `${label}: no relay write`);
  assert.equal(result.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(result.writesWebDAV, false, `${label}: no WebDAV write`);
  assert.equal(result.writesCloud, false, `${label}: no cloud write`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
  assert.equal(result.productSyncReady, false, `${label}: productSyncReady false`);
  assert.equal(result.transportReady, false, `${label}: transportReady false`);
}

expectBlock('missing gate', { gate: '' }, 'relay-proof-harness-gate-required');
expectBlock('apply true', { apply: true }, 'relay-proof-harness-apply-forbidden');
expectBlock('dryRun false', { dryRun: false }, 'relay-proof-harness-dry-run-required');
expectBlock('symbolic target hash', {
  candidate: {
    ...liveRequest.candidate,
    peerTargetHash: 'sha256:webdav-dry-run-local-mock-peer',
  },
}, 'relay-target-hash-required');
expectBlock('missing controlled gate', {
  candidate: {
    ...liveRequest.candidate,
    reservedControlledGate: '',
  },
}, 'relay-controlled-gate-missing');
expectBlock('relay enqueue requested', {
  transport: {
    ...liveRequest.transport,
    enqueueRelay: true,
  },
}, 'relay-enqueue-forbidden-in-proof-harness');
expectBlock('WebDAV write requested', {
  transport: {
    ...liveRequest.transport,
    writeWebDAV: true,
  },
}, 'relay-webdav-cloud-write-forbidden-in-proof-harness');
expectBlock('CAS requested', {
  transport: {
    ...liveRequest.transport,
    touchChatSavingCAS: true,
  },
}, 'relay-cas-write-forbidden-in-proof-harness');
expectBlock('fullBundle v3 requested', {
  transport: {
    ...liveRequest.transport,
    startFullBundleV3: true,
  },
}, 'relay-fullbundle-v3-start-forbidden-in-proof-harness');
expectBlock('cleanup requested', {
  safety: {
    ...liveRequest.safety,
    mutateA950: true,
  },
}, 'relay-cleanup-authority-forbidden-in-proof-harness');
expectBlock('boot resume dispatch requested', {
  bootResumeDispatch: true,
}, 'relay-boot-resume-dispatch-forbidden-in-proof-harness');

for (const [mode, blocker] of new Map([
  ['network-failure', 'relay-network-failure-blocked-before-enqueue'],
  ['partial-write', 'relay-partial-write-blocked-before-enqueue'],
  ['checksum-mismatch', 'relay-checksum-mismatch-blocked-before-enqueue'],
  ['sequence-mismatch', 'relay-sequence-mismatch-blocked-before-enqueue'],
  ['peer-ambiguity', 'relay-peer-ambiguity-blocked-before-enqueue'],
  ['stale-payload', 'relay-stale-payload-blocked-before-enqueue'],
  ['cas-boundary-violation', 'relay-cas-boundary-blocked-before-enqueue'],
  ['missing-controlled-gate', 'relay-controlled-gate-missing'],
])) {
  expectBlock(`failure ${mode}`, { modeledFailureMode: mode }, blocker);
}

console.log('validate-relay-idempotency-restart-proof-live-contract-fix: PASS');
