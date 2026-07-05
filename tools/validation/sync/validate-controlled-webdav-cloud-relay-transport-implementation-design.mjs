#!/usr/bin/env node
//
// Controlled WebDAV/cloud/relay transport implementation design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/controlled-webdav-cloud-relay-transport-implementation-design.md';
const killSwitchEvidencePath = 'release-evidence/2026-07-01/transport-controlled-write-kill-switch-implementation.md';
const finalRollupPath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

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
const killSwitchEvidence = read(killSwitchEvidencePath);
const finalRollup = read(finalRollupPath);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const source = read(sourcePath);

for (const token of [
  'CONTROLLED WEBDAV / CLOUD / RELAY TRANSPORT IMPLEMENTATION DESIGN COMPLETE - DESIGN ONLY; REAL TRANSPORT STILL BLOCKED',
  'edb306774a011f5af5fa4141ce9d85972b16283a',
  '40f52a5f8554861a09d8cf69cc77b0c6c7740495',
  'c3f1d8f70cb0b688268fcc814aece1e68ccb8994',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'killSwitchExists:true',
  'killSwitchDefaultEnabled:false',
  'killSwitchEnabled:false',
  'controlledWritesBlocked:true',
  'transportControlledApplyGateUsable:false',
  'reservedControlledGateUsable:false',
  'controlledTransportImplementationPresent:false',
  'productSyncReady:false',
  'transportReady:false',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'webdav-cloud-relay-transport-controlled-apply',
  'That gate remains reserved and unusable in this design slice',
  'WebDAV dry-run proof passed',
  'Relay/idempotency/restart proof passed',
  'fullBundle.v2 transport-envelope proof passed',
  'Rollback / disable / fail-closed proof passed',
  'Privacy/evidence contract passed',
  'explicit operator approval object',
  'Fixed hash-only idempotency key',
  'Fixed candidate payload hash',
  'Fixed peer target hash',
  'Fixed remote-root hash/ref',
  'local mock WebDAV target first',
  'no real remote WebDAV/cloud/relay endpoint in the first controlled implementation',
  'dry-run mode',
  'apply mode only behind kill switch + exact gate + explicit operator approval',
  'duplicate replay zero-write',
  'restart fail-closed',
  'rollback/disable before write',
  'privacy/hash-only evidence',
  'h2o.studio.transport.webdav-cloud-relay-controlled-apply-approval.v1',
  'scope:"local-mock-webdav-target-only"',
  'controlledGate:"webdav-cloud-relay-transport-controlled-apply"',
  'killSwitchEnabled:true',
  'idempotencyKeyHash:"sha256:<64-hex>"',
  'candidatePayloadHash:"sha256:<64-hex>"',
  'candidateBundleHash:"sha256:<64-hex>"',
  'peerTargetHash:"sha256:<64-hex>"',
  'remoteRootRefHash:"sha256:<64-hex>"',
  'noChatSavingCas:true',
  'noFullBundleV3:true',
  'noA950Mutation:true',
  'privacyHashOnly:true',
  'partial remote write',
  'relay enqueue without remote write',
  'sequence burn without write',
  'export id minted but not delivered',
  'CAS boundary violation',
  'stale payload',
  'peer target ambiguity',
  'kill switch disabled mid-flight',
  'Controlled transport implementation behind disabled kill switch',
  'Live dry-run with kill switch enabled but `apply:false`',
  'First controlled local mock WebDAV apply only after explicit approval',
  'Duplicate replay proof',
  'Restart/reload proof',
  'Final transportReady decision',
  'This design does not authorize real transport',
  'This design does not authorize WebDAV/cloud/relay writes',
  'This design does not authorize relay enqueue',
  'This design does not authorize Chat Saving CAS',
  'This design does not authorize `fullBundle.v3`',
  'This design does not authorize export-state mutation',
  'This design does not authorize export id mint',
  'This design does not authorize sequence burn',
  'This design does not authorize cleanup or `row:a950a44b859f` mutation',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  'Real WebDAV/cloud/relay cannot start now',
]) {
  assertIncludes(flatEvidence, token, `design evidence token ${token}`);
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
  'transportReady:true can start now',
  'productSyncReady:true can start now',
  'transportControlledApplyGateUsable:true',
  'reservedControlledGateUsable:true',
  'controlledTransportImplementationPresent:true',
  'noCleanupAuthority:false',
  'Real WebDAV/cloud/relay can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `design evidence forbidden ${forbidden}`);
}

assertIncludes(killSwitchEvidence, 'TRANSPORT CONTROLLED-WRITE KILL SWITCH IMPLEMENTED - DEFAULT BLOCKING / NON-WRITING',
  'kill switch implementation respected');
assertIncludes(killSwitchEvidence, 'transportControlledApplyGateUsable:false',
  'kill switch keeps controlled apply gate unusable');
assertIncludes(killSwitchEvidence, 'controlledTransportImplementationPresent:false',
  'controlled implementation still absent');
assertIncludes(finalRollup, 'TRANSPORT READINESS ROLLUP COMPLETE - GLOBAL TRANSPORT STILL BLOCKED',
  'final rollup respected');
assertIncludes(privacy, 'TRANSPORT PRIVACY / EVIDENCE CONTRACT CLOSED - HASH-ONLY / NON-WRITING',
  'privacy contract respected');
assertIncludes(rollback, 'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  'rollback proof respected');
assertIncludes(fullBundleCloseout, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'fullBundle v2 envelope closeout respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay proof closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV dry-run closeout respected');

for (const anchor of [killSwitchEvidence, finalRollup, privacy, rollback, fullBundleCloseout, relayCloseout, webdavCloseout]) {
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
    'noCleanupAuthority:false',
    'WebDAV/cloud/relay can start now',
    'Chat Saving CAS can start now',
  ]) {
    assertNotIncludes(anchor, forbidden, `anchor forbidden ${forbidden}`);
  }
}

for (const token of [
  'function evaluateControlledWriteKillSwitch(request)',
  'webdav-controlled-write-kill-switch-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'controlledWriteKillSwitchProof: true',
  'killSwitchDefaultEnabled: false',
  'controlledWritesBlocked: true',
  'controlledTransportImplementationPresent: false',
  'transportControlledApplyGateUsable: false',
  'reservedControlledGateUsable: false',
  'transport-controlled-write-kill-switch-disabled-by-default',
  'transport-controlled-write-controlled-gate-required',
  'transport-controlled-write-controlled-gate-invalid',
  'transport-controlled-write-implementation-not-present',
  'transport-controlled-apply-gate-reserved-only',
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
  'noCleanupAuthority: true',
]) {
  assertIncludes(source, token, `source token ${token}`);
}

const api = installWebdavGates();
assert.equal(typeof api?.evaluateControlledWriteKillSwitch, 'function', 'kill switch API exposed');
assert.equal(api.constants.TRANSPORT_CONTROLLED_APPLY_GATE, 'webdav-cloud-relay-transport-controlled-apply',
  'reserved controlled gate exported');

const proofRequest = {
  dryRun: true,
  apply: false,
  gate: 'webdav-controlled-write-kill-switch-evaluate',
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  killSwitch: {
    exists: true,
    enabled: false,
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
};

const defaultProof = api.evaluateControlledWriteKillSwitch(proofRequest);
assert.equal(defaultProof.ok, true, 'kill switch proof itself is valid');
assert.equal(defaultProof.killSwitchDefaultEnabled, false, 'kill switch disabled by default');
assert.equal(defaultProof.controlledWritesBlocked, true, 'controlled writes blocked');
assert.equal(defaultProof.transportControlledApplyGateUsable, false, 'reserved controlled gate unusable');
assert.equal(defaultProof.productSyncReady, false, 'productSyncReady false');
assert.equal(defaultProof.transportReady, false, 'transportReady false');
assert.equal(defaultProof.writesWebDAV, false, 'no WebDAV write');
assert.equal(defaultProof.enqueuesRelay, false, 'no relay enqueue');
assert.equal(defaultProof.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(defaultProof.noCleanupAuthority, true, 'no cleanup authority');

const modeledFutureReservedGate = api.evaluateControlledWriteKillSwitch({
  ...proofRequest,
  killSwitch: { exists: true, enabled: true },
  controlled: { controlledGate: 'webdav-cloud-relay-transport-controlled-apply' },
});
assert.equal(modeledFutureReservedGate.ok, true, 'reserved-gate model is a valid proof request');
assert.equal(modeledFutureReservedGate.transportControlledApplyGateUsable, false,
  'reserved gate remains unusable even when modeled with enabled kill switch');
assert.ok(modeledFutureReservedGate.controlledWriteBlockers.includes('transport-controlled-write-implementation-not-present'),
  'implementation absent blocks');
assert.ok(modeledFutureReservedGate.controlledWriteBlockers.includes('transport-controlled-apply-gate-reserved-only'),
  'reserved gate remains reserved only');

const writeAttempt = api.evaluateControlledWriteKillSwitch({
  ...proofRequest,
  transport: { writeWebDAV: true },
});
assert.equal(writeAttempt.ok, false, 'write request blocks proof');
assert.ok(writeAttempt.blockers.includes('transport-kill-switch-webdav-cloud-write-forbidden'),
  'WebDAV/cloud write forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-implementation-design.validator.v1',
  verdict: 'CONTROLLED_WEBDAV_CLOUD_RELAY_TRANSPORT_IMPLEMENTATION_DESIGN_COMPLETE_GLOBAL_BLOCKED',
  selectedFirstControlledTransportStrategy: 'local-mock-webdav-target-first',
  killSwitchRequired: true,
  reservedControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  reservedControlledGateUsable: false,
  transportWriteAuthorized: false,
  relayEnqueueAuthorized: false,
  productSyncReady: false,
  transportReady: false,
  fullBundleV3Started: false,
  cleanupAuthorityIntroduced: false,
}, null, 2));
