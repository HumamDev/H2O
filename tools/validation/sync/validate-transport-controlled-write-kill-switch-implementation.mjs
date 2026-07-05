#!/usr/bin/env node
//
// Transport controlled-write kill switch implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-controlled-write-kill-switch-implementation.md';
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

function installSource() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read(sourcePath), sandbox, { filename: sourcePath });
  return sandbox.H2O?.Studio?.sync?.webdavTransportGates;
}

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const finalRollup = read(finalRollupPath);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const source = read(sourcePath);

for (const token of [
  'TRANSPORT CONTROLLED-WRITE KILL SWITCH IMPLEMENTED - DEFAULT BLOCKING / NON-WRITING',
  '40f52a5f8554861a09d8cf69cc77b0c6c7740495',
  'c3f1d8f70cb0b688268fcc814aece1e68ccb8994',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledWriteKillSwitch(request)',
  'webdav-controlled-write-kill-switch-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'transportControlledApplyGateUsable:false',
  'reservedControlledGateUsable:false',
  'controlledTransportImplementationPresent:false',
  'controlledWriteKillSwitchProof:true',
  'killSwitchExists:true',
  'killSwitchDefaultEnabled:false',
  'killSwitchEnabled:false',
  'controlledWritesBlocked:true',
  'transport-controlled-write-kill-switch-disabled-by-default',
  'killSwitchSeparateFromProductSyncReady:true',
  'killSwitchSeparateFromTransportReady:true',
  'killSwitchSeparateFromLocalExportableSyncReady:true',
  'killSwitchSeparateFromTransportEligibility:true',
  'transport-controlled-write-kill-switch-missing',
  'transport-controlled-write-controlled-gate-required',
  'transport-controlled-write-controlled-gate-invalid',
  'transport-controlled-write-implementation-not-present',
  'transport-controlled-apply-gate-reserved-only',
  'writesData:false',
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
  'localExportableSyncReadyIsAuthorization:false',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'noCleanupAuthority:true',
  'ok:true',
  'status:"transport-controlled-write-kill-switch-proof-ready"',
  'gateSatisfied:true',
  'It does not authorize transport',
  'It does not authorize WebDAV/cloud/relay',
  'It does not authorize relay enqueue',
  'It does not authorize `fullBundle.v3`',
  'It does not authorize Chat Saving CAS',
  'It does not authorize cleanup',
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
  'transportControlledApplyGateUsable:true',
  'reservedControlledGateUsable:true',
  'controlledTransportImplementationPresent:true',
  'noCleanupAuthority:false',
  'WebDAV/cloud/relay can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(finalRollup, 'TRANSPORT READINESS ROLLUP COMPLETE - GLOBAL TRANSPORT STILL BLOCKED',
  'final rollup respected');
assertIncludes(finalRollup, '`transport-kill-switch-not-implemented-for-controlled-writes`',
  'final rollup old blocker respected');
assertIncludes(privacy, 'TRANSPORT PRIVACY / EVIDENCE CONTRACT CLOSED - HASH-ONLY / NON-WRITING',
  'privacy closeout respected');
assertIncludes(rollback, 'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  'rollback proof respected');
assertIncludes(fullBundleCloseout, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'fullBundle closeout respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV dry-run closeout respected');

for (const token of [
  'CONTROLLED_WRITE_KILL_SWITCH_REQUEST_SCHEMA',
  'CONTROLLED_WRITE_KILL_SWITCH_RESULT_SCHEMA',
  'CONTROLLED_WRITE_KILL_SWITCH_GATE',
  'webdav-controlled-write-kill-switch-evaluate',
  'function evaluateControlledWriteKillSwitch(request)',
  'H2O.Studio.sync.webdavTransportGates.evaluateControlledWriteKillSwitch',
  'controlledWriteKillSwitchProof: true',
  'killSwitchExists: killSwitchExists',
  'killSwitchDefaultEnabled: false',
  'killSwitchSeparateFromProductSyncReady: true',
  'killSwitchSeparateFromTransportReady: true',
  'killSwitchSeparateFromLocalExportableSyncReady: true',
  'killSwitchSeparateFromTransportEligibility: true',
  'controlledWritesBlocked: true',
  'transport-controlled-write-kill-switch-missing',
  'transport-controlled-write-kill-switch-disabled-by-default',
  'transport-controlled-write-controlled-gate-required',
  'transport-controlled-write-controlled-gate-invalid',
  'transport-controlled-write-implementation-not-present',
  'transport-controlled-apply-gate-reserved-only',
  'controlledTransportImplementationPresent: false',
  'transportControlledApplyGateUsable: false',
  'reservedControlledGateUsable: false',
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
  'localExportableSyncReadyIsAuthorization: false',
  'noCleanupAuthority: true',
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
  'transportControlledApplyGateUsable: true',
  'reservedControlledGateUsable: true',
  'controlledTransportImplementationPresent: true',
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

const api = installSource();
assert.equal(typeof api?.evaluateControlledWriteKillSwitch, 'function', 'kill-switch API exposed');
assert.equal(api.constants.CONTROLLED_WRITE_KILL_SWITCH_GATE, 'webdav-controlled-write-kill-switch-evaluate',
  'kill-switch proof gate exported');
assert.equal(api.constants.TRANSPORT_CONTROLLED_APPLY_GATE, 'webdav-cloud-relay-transport-controlled-apply',
  'reserved controlled gate still exported');

const baseRequest = {
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

const defaultProof = api.evaluateControlledWriteKillSwitch(baseRequest);
assert.equal(defaultProof.ok, true, 'default kill-switch proof ready');
assert.equal(defaultProof.status, 'transport-controlled-write-kill-switch-proof-ready', 'default status ready');
assert.equal(defaultProof.killSwitchExists, true, 'kill switch exists');
assert.equal(defaultProof.killSwitchDefaultEnabled, false, 'kill switch default disabled');
assert.equal(defaultProof.killSwitchEnabled, false, 'kill switch disabled by default');
assert.equal(defaultProof.controlledWritesBlocked, true, 'controlled writes blocked');
assert.equal(defaultProof.controlledWriteBlockers.length, 1, 'one disabled-by-default blocker');
assert.ok(defaultProof.controlledWriteBlockers.includes('transport-controlled-write-kill-switch-disabled-by-default'),
  'disabled-by-default blocker');
assert.equal(defaultProof.transportControlledApplyGateUsable, false, 'reserved gate unusable');
assert.equal(defaultProof.reservedControlledGateUsable, false, 'reserved gate unusable alias');
assert.equal(defaultProof.controlledTransportImplementationPresent, false, 'controlled implementation absent');
assert.equal(defaultProof.productSyncReady, false, 'productSyncReady false');
assert.equal(defaultProof.transportReady, false, 'transportReady false');
assert.equal(defaultProof.writesWebDAV, false, 'no WebDAV write');
assert.equal(defaultProof.writesCloud, false, 'no cloud write');
assert.equal(defaultProof.enqueuesRelay, false, 'no relay enqueue');
assert.equal(defaultProof.writesCAS, false, 'no CAS write');
assert.equal(defaultProof.writesFiles, false, 'no file write');
assert.equal(defaultProof.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(defaultProof.mutatesExportState, false, 'no export mutation');
assert.equal(defaultProof.mintsExportId, false, 'no export id mint');
assert.equal(defaultProof.burnsSequence, false, 'no sequence burn');
assert.equal(defaultProof.noCleanupAuthority, true, 'no cleanup authority');

const missingSwitch = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  killSwitch: { exists: false },
});
assert.equal(missingSwitch.ok, true, 'missing switch is modeled inside valid proof');
assert.ok(missingSwitch.controlledWriteBlockers.includes('transport-controlled-write-kill-switch-missing'),
  'missing switch blocks controlled writes');

const enabledNoGate = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  killSwitch: { exists: true, enabled: true },
});
assert.equal(enabledNoGate.ok, true, 'enabled no-gate proof request valid');
assert.ok(enabledNoGate.controlledWriteBlockers.includes('transport-controlled-write-controlled-gate-required'),
  'enabled switch still needs controlled gate');

const wrongGate = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  killSwitch: { exists: true, enabled: true },
  controlled: { controlledGate: 'wrong-controlled-gate' },
});
assert.equal(wrongGate.ok, true, 'wrong controlled gate proof request valid');
assert.ok(wrongGate.controlledWriteBlockers.includes('transport-controlled-write-controlled-gate-invalid'),
  'wrong controlled gate blocks');

const reservedGate = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  killSwitch: { exists: true, enabled: true },
  controlled: { controlledGate: 'webdav-cloud-relay-transport-controlled-apply' },
});
assert.equal(reservedGate.ok, true, 'reserved controlled gate proof request valid');
assert.ok(reservedGate.controlledWriteBlockers.includes('transport-controlled-write-implementation-not-present'),
  'implementation absent blocks');
assert.ok(reservedGate.controlledWriteBlockers.includes('transport-controlled-apply-gate-reserved-only'),
  'reserved controlled gate remains reserved only');
assert.equal(reservedGate.transportControlledApplyGateUsable, false, 'reserved gate still unusable when supplied');

const wrongProofGate = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  gate: 'webdav-cloud-relay-transport-controlled-apply',
});
assert.equal(wrongProofGate.ok, false, 'reserved controlled gate is wrong proof gate');
assert.ok(wrongProofGate.blockers.includes('transport-kill-switch-proof-gate-invalid'),
  'wrong proof gate blocks');

const applyAttempt = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  apply: true,
});
assert.equal(applyAttempt.ok, false, 'apply forbidden in kill-switch proof');
assert.ok(applyAttempt.blockers.includes('transport-kill-switch-proof-apply-forbidden'),
  'apply blocker present');

const writeAttempt = api.evaluateControlledWriteKillSwitch({
  ...baseRequest,
  transport: { writeWebDAV: true },
});
assert.equal(writeAttempt.ok, false, 'WebDAV write attempt blocks proof');
assert.ok(writeAttempt.blockers.includes('transport-kill-switch-webdav-cloud-write-forbidden'),
  'write blocker present');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.controlled-write-kill-switch.validator.v1',
  verdict: 'TRANSPORT_CONTROLLED_WRITE_KILL_SWITCH_IMPLEMENTED_DEFAULT_BLOCKING',
  source: sourcePath,
  api: 'H2O.Studio.sync.webdavTransportGates.evaluateControlledWriteKillSwitch(request)',
  killSwitchExists: true,
  killSwitchDefaultEnabled: false,
  controlledWritesBlocked: true,
  reservedControlledGateUsable: false,
  productSyncReady: false,
  transportReady: false,
  writesWebDAV: false,
  writesCloud: false,
  writesRelay: false,
  enqueuesRelay: false,
  writesCAS: false,
  fullBundleV3Started: false,
  cleanupAuthorityIntroduced: false,
}, null, 2));
