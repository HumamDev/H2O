#!/usr/bin/env node
//
// Relay idempotency / restart proof harness implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';
const studioHtmlPath = 'src-surfaces-base/studio/studio.html';
const packStudioPath = 'tools/product/studio/pack-studio.mjs';
const evidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-implementation.md';
const designEvidencePath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-design.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayBrokerPath = 'src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js';
const resumePath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';

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
const designEvidence = read(designEvidencePath);
const webdavCloseout = read(webdavCloseoutPath);
const webdavGates = read(webdavGatesPath);
const relayBroker = read(relayBrokerPath);
const resume = read(resumePath);
const studioHtml = read(studioHtmlPath);
const packStudio = read(packStudioPath);

for (const token of [
  'RELAY IDEMPOTENCY RESTART PROOF HARNESS IMPLEMENTED - NON-WRITING',
  '5a728d1d2d8e19ce67f6f51ae50bf5102bb8c46d',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  'f776e66d595de7ac80746fcd7e337d5452c2e26e',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js',
  'H2O.Studio.sync.relayIdempotencyRestartProofHarness.evaluateRelayIdempotencyRestartProof(request)',
  'h2o.studio.transport.relay-idempotency-restart-proof.v1',
  'h2o.studio.transport.relay-idempotency-restart-proof-request.v1',
  'relay-idempotency-restart-proof-harness-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  '`dryRun:true`',
  '`apply:false`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`localExportableSyncReady:true`',
  '`transportEligibilityFromLocalExportableReady:true`',
  '`chatSavingCasBlocked:true`',
  '`a950DocumentedDebtQuarantined:true`',
  '`noCleanupAuthority:true`',
  'ok:true',
  'status:"relay-idempotency-restart-proof-ready"',
  '`relayProofHarness:true`',
  '`writesRelay:false`',
  '`enqueuesRelay:false`',
  '`writesWebDAV:false`',
  '`writesCloud:false`',
  '`writesCAS:false`',
  '`writesFiles:false`',
  '`mutatesExportState:false`',
  '`mintsExportId:false`',
  '`burnsSequence:false`',
  '`bootResumeDispatch:false`',
  '`relayOutboxTouched:false`',
  '`publicationLedgerTouched:false`',
  '`fullBundleV3Started:false`',
  '`webdavCloudRelayBlocked:true`',
  '`idempotencyModeled:true`',
  '`idempotencyKeyHashOnly:true`',
  '`localExportableSyncReadyIsAuthorization:false`',
  'Raw endpoint URLs, credentials, raw chat IDs, raw folder IDs',
  'relay-private-input-rejected',
  '`duplicateReplayZeroWrite:true`',
  '`duplicateWrites:0`',
  '`duplicateRelayEnqueue:false`',
  '`duplicateWebdavWrite:false`',
  '`duplicateCasWrite:false`',
  '`duplicateExportStateMutation:false`',
  '`duplicateFullBundleV3Start:false`',
  '`restartFailClosed:true`',
  '`queuedDryRunStateCannotBecomeWriteState:true`',
  '`dryRunRecordsAreNotRelayOutboxRows:true`',
  '`localExportableSyncReadyAuthorizesRelayDispatch:false`',
  '`transportEligibilityAuthorizesRelayDispatch:false`',
  '`transportReadinessEvaluationAuthorizesRelayDispatch:false`',
  '`bootResumeBlockedWithoutControlledGate:true`',
  '`missingControlledGateBlocksWriteTransition:true`',
  'network-failure',
  'partial-write',
  'checksum-mismatch',
  'sequence-mismatch',
  'peer-ambiguity',
  'stale-payload',
  'cas-boundary-violation',
  'missing-controlled-gate',
  'relay-network-failure-blocked-before-enqueue',
  'relay-partial-write-blocked-before-enqueue',
  'relay-checksum-mismatch-blocked-before-enqueue',
  'relay-sequence-mismatch-blocked-before-enqueue',
  'relay-peer-ambiguity-blocked-before-enqueue',
  'relay-stale-payload-blocked-before-enqueue',
  'relay-cas-boundary-blocked-before-enqueue',
  'relay-controlled-gate-missing',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  'No real transport is implemented by this harness',
  '`fullBundle.v3` remains not-started',
  'Chat Saving CAS remains blocked/deferred',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  '`localExportableSyncReady:true` is not relay or transport authorization',
  'a950 remains documented/quarantined debt and no cleanup authority is introduced',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'transportReady:true is authorized',
  'productSyncReady:true is authorized',
  'fullBundle.v3 started',
  'cleanup authority is introduced and approved',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(designEvidence, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS DESIGNED - NON-WRITING', 'design respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE', 'WebDAV closeout respected');
assertIncludes(webdavCloseout, 'enqueuesRelay:false', 'WebDAV closeout no enqueue');
assertIncludes(webdavGates, 'evaluateTransportReadinessDryRun', 'WebDAV dry-run gate still exists');
assertIncludes(webdavGates, 'transportReady: false', 'WebDAV transportReady remains false');
assertIncludes(relayBroker, 'function dispatchExecuteRelay', 'relay broker exists but is not invoked by harness');
assertIncludes(resume, 'function classifyExecuteResumeAction', 'boot resume classifier exists but is not invoked by harness');
assertIncludes(studioHtml, './sync/relay-idempotency-restart-proof-harness.js', 'studio.html loads harness');
assertIncludes(packStudio, '"sync/relay-idempotency-restart-proof-harness.js"', 'pack-studio packages harness');

for (const token of [
  'H2O.Studio.sync.relayIdempotencyRestartProofHarness',
  'function evaluateRelayIdempotencyRestartProof(request)',
  'function diagnose()',
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
  'relay-network-failure-blocked-before-enqueue',
  'relay-partial-write-blocked-before-enqueue',
  'relay-checksum-mismatch-blocked-before-enqueue',
  'relay-sequence-mismatch-blocked-before-enqueue',
  'relay-peer-ambiguity-blocked-before-enqueue',
  'relay-stale-payload-blocked-before-enqueue',
  'relay-cas-boundary-blocked-before-enqueue',
  'relay-controlled-gate-missing',
  'relay-enqueue-forbidden-in-proof-harness',
  'relay-webdav-cloud-write-forbidden-in-proof-harness',
  'relay-cas-write-forbidden-in-proof-harness',
  'relay-fullbundle-v3-start-forbidden-in-proof-harness',
  'relay-export-state-mutation-forbidden-in-proof-harness',
  'relay-cleanup-authority-forbidden-in-proof-harness',
  'relay-boot-resume-dispatch-forbidden-in-proof-harness',
  'relay-dry-run-state-write-transition-forbidden',
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
assert.equal(api.constants.RELAY_PROOF_HARNESS_GATE, 'relay-idempotency-restart-proof-harness-evaluate');
assert.equal(api.constants.TRANSPORT_CONTROLLED_APPLY_GATE, 'webdav-cloud-relay-transport-controlled-apply');

const validRequest = Object.freeze({
  schema: 'h2o.studio.transport.relay-idempotency-restart-proof-request.v1',
  dryRun: true,
  apply: false,
  gate: 'relay-idempotency-restart-proof-harness-evaluate',
  candidatePayloadHash: 'sha256:' + 'a'.repeat(64),
  candidateBundleHash: 'sha256:' + 'b'.repeat(64),
  peerTargetHash: 'sha256:' + 'c'.repeat(64),
  remoteRootRefHash: 'sha256:' + 'd'.repeat(64),
  sequenceMode: 'not-minted-in-dry-run',
  expectedSequenceNumber: 12,
  previousSequenceNumber: 12,
  exportConstraint: 'existing-export-only',
  operationKind: 'webdav-cloud-relay-dry-run',
  activeTransport: 'local-sync-folder-json',
  reservedControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  productSyncReady: false,
  transportReady: false,
  localExportableSyncReady: true,
  transportEligibilityFromLocalExportableReady: true,
  chatSavingCasBlocked: true,
  a950DocumentedDebtQuarantined: true,
  noCleanupAuthority: true,
});

const good = api.evaluateRelayIdempotencyRestartProof(validRequest);
assert.equal(good.ok, true, 'valid proof should pass');
assert.equal(good.status, 'relay-idempotency-restart-proof-ready', 'valid status');
assert.equal(good.relayProofHarness, true, 'relay proof harness flag');
assert.equal(good.writesRelay, false, 'no relay write');
assert.equal(good.enqueuesRelay, false, 'no relay enqueue');
assert.equal(good.writesWebDAV, false, 'no WebDAV write');
assert.equal(good.writesCloud, false, 'no cloud write');
assert.equal(good.writesCAS, false, 'no CAS write');
assert.equal(good.writesFiles, false, 'no file write');
assert.equal(good.mutatesExportState, false, 'no export state mutation');
assert.equal(good.mintsExportId, false, 'no export id mint');
assert.equal(good.burnsSequence, false, 'no sequence burn');
assert.equal(good.bootResumeDispatch, false, 'no boot resume dispatch');
assert.equal(good.relayOutboxTouched, false, 'no relay outbox touch');
assert.equal(good.publicationLedgerTouched, false, 'no publication ledger touch');
assert.equal(good.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(good.productSyncReady, false, 'productSyncReady false');
assert.equal(good.transportReady, false, 'transportReady false');
assert.equal(good.localExportableSyncReady, true, 'localExportableSyncReady true');
assert.equal(good.localExportableSyncReadyIsAuthorization, false, 'localExportable is not auth');
assert.equal(good.idempotencyModeled, true, 'idempotency modeled');
assert.equal(good.idempotencyKeyHashOnly, true, 'idempotency key material hash-only');
assert.equal(good.duplicateReplayZeroWrite, true, 'duplicate replay zero-write');
assert.equal(good.duplicateReplay.duplicateWrites, 0, 'duplicate writes zero');
assert.equal(good.duplicateReplay.duplicateRelayEnqueue, false, 'duplicate no relay enqueue');
assert.equal(good.duplicateReplay.duplicateWebdavWrite, false, 'duplicate no WebDAV write');
assert.equal(good.duplicateReplay.duplicateCasWrite, false, 'duplicate no CAS write');
assert.equal(good.restartFailClosed, true, 'restart fail closed');
assert.equal(good.restartModel.bootResumeDispatch, false, 'boot resume dispatch false');
assert.equal(good.restartModel.localExportableSyncReadyAuthorizesRelayDispatch, false, 'localExportable cannot dispatch');
assert.equal(good.restartModel.missingControlledGateBlocksWriteTransition, true, 'missing gate blocks transition');
assert.equal(good.allFailureModesBlockBeforeEnqueue, true, 'failure modes block before enqueue');
assert.equal(good.webdavCloudRelayBlocked, true, 'WebDAV/cloud/relay blocked');
assert.equal(good.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(good.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(good.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(good.blockers.length, 0, 'valid proof has no blockers');

const goodAgain = api.evaluateRelayIdempotencyRestartProof({ ...validRequest });
assert.equal(goodAgain.idempotencyKey, good.idempotencyKey, 'same candidate yields same idempotency key');
assert.equal(goodAgain.duplicateReplayZeroWrite, true, 'same candidate duplicate zero-write');
const changedPayload = api.evaluateRelayIdempotencyRestartProof({
  ...validRequest,
  candidatePayloadHash: 'sha256:' + 'e'.repeat(64),
});
assert.notEqual(changedPayload.idempotencyKey, good.idempotencyKey, 'changed payload changes modeled key');

function expectBlock(label, patch, blocker) {
  const result = api.evaluateRelayIdempotencyRestartProof({ ...validRequest, ...patch });
  assert.equal(result.ok, false, `${label}: expected block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.writesRelay, false, `${label}: no relay write`);
  assert.equal(result.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(result.writesWebDAV, false, `${label}: no WebDAV write`);
  assert.equal(result.writesCloud, false, `${label}: no cloud write`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
  assert.equal(result.mutatesExportState, false, `${label}: no export mutation`);
  assert.equal(result.productSyncReady, false, `${label}: productSyncReady false`);
  assert.equal(result.transportReady, false, `${label}: transportReady false`);
}

expectBlock('wrong gate', { gate: 'wrong' }, 'relay-proof-harness-gate-required');
expectBlock('dryRun false', { dryRun: false }, 'relay-proof-harness-dry-run-required');
expectBlock('apply true', { apply: true }, 'relay-proof-harness-apply-forbidden');
expectBlock('productSyncReady true', { productSyncReady: true }, 'relay-product-sync-ready-mismatch');
expectBlock('transportReady true', { transportReady: true }, 'relay-transport-ready-mismatch');
expectBlock('localExportable false', { localExportableSyncReady: false }, 'relay-local-exportable-not-ready');
expectBlock('eligibility false', { transportEligibilityFromLocalExportableReady: false }, 'relay-transport-eligibility-missing');
expectBlock('missing candidate hash', { candidatePayloadHash: '' }, 'relay-candidate-hash-required');
expectBlock('missing target hash', { peerTargetHash: '' }, 'relay-target-hash-required');
expectBlock('sequence mismatch', { expectedSequenceNumber: 1, previousSequenceNumber: 2 }, 'relay-sequence-mismatch-blocked-before-enqueue');
expectBlock('missing controlled gate', { reservedControlledGate: '' }, 'relay-controlled-gate-missing');
expectBlock('active transport mismatch', { activeTransport: 'webdav-cloud-relay' }, 'relay-active-transport-mismatch');
expectBlock('private input', { rawChatTitle: 'private' }, 'relay-private-input-rejected');
expectBlock('relay enqueue requested', { enqueueRelay: true }, 'relay-enqueue-forbidden-in-proof-harness');
expectBlock('webdav write requested', { writeWebDAV: true }, 'relay-webdav-cloud-write-forbidden-in-proof-harness');
expectBlock('cas write requested', { writeCAS: true }, 'relay-cas-write-forbidden-in-proof-harness');
expectBlock('fullBundle v3 requested', { startFullBundleV3: true }, 'relay-fullbundle-v3-start-forbidden-in-proof-harness');
expectBlock('export mutation requested', { mintExportId: true }, 'relay-export-state-mutation-forbidden-in-proof-harness');
expectBlock('cleanup requested', { mutateA950: true }, 'relay-cleanup-authority-forbidden-in-proof-harness');
expectBlock('boot resume requested', { bootResumeDispatch: true }, 'relay-boot-resume-dispatch-forbidden-in-proof-harness');
expectBlock('dry-run write transition requested', {
  dryRunStateCanBecomeWriteState: true,
}, 'relay-dry-run-state-write-transition-forbidden');

const failureExpectations = new Map([
  ['network-failure', 'relay-network-failure-blocked-before-enqueue'],
  ['partial-write', 'relay-partial-write-blocked-before-enqueue'],
  ['checksum-mismatch', 'relay-checksum-mismatch-blocked-before-enqueue'],
  ['sequence-mismatch', 'relay-sequence-mismatch-blocked-before-enqueue'],
  ['peer-ambiguity', 'relay-peer-ambiguity-blocked-before-enqueue'],
  ['stale-payload', 'relay-stale-payload-blocked-before-enqueue'],
  ['cas-boundary-violation', 'relay-cas-boundary-blocked-before-enqueue'],
  ['missing-controlled-gate', 'relay-controlled-gate-missing'],
]);

for (const [mode, blocker] of failureExpectations) {
  expectBlock(`failure ${mode}`, { modeledFailureMode: mode }, blocker);
  assert.ok(good.failureModes.some((entry) => entry.mode === mode && entry.blocker === blocker &&
    entry.blocksBeforeEnqueue === true && entry.enqueuesRelay === false &&
    entry.writesWebDAV === false && entry.writesCAS === false),
  `valid proof should model ${mode} as blocked before enqueue`);
}

console.log('validate-relay-idempotency-restart-proof-harness-implementation: PASS');
