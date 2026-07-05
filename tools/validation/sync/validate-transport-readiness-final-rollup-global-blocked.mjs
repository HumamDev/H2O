#!/usr/bin/env node
//
// Transport-readiness final rollup validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-readiness-final-rollup-global-blocked.md';
const privacyPath = 'release-evidence/2026-07-01/transport-privacy-evidence-contract-closeout.md';
const rollbackPath = 'release-evidence/2026-07-01/transport-rollback-disable-fail-closed-proof.md';
const fullBundleCloseoutPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const inventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const gateDesignPath = 'release-evidence/2026-07-01/transport-readiness-evaluation-gate-design.md';

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
const flatEvidence = compact(evidence);
const privacy = read(privacyPath);
const rollback = read(rollbackPath);
const fullBundleCloseout = read(fullBundleCloseoutPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const inventory = read(inventoryPath);
const gateDesign = read(gateDesignPath);

for (const token of [
  'TRANSPORT READINESS ROLLUP COMPLETE - GLOBAL TRANSPORT STILL BLOCKED',
  'c3f1d8f70cb0b688268fcc814aece1e68ccb8994',
  'b6dc031157ad7689620aed288869151bd23392c8',
  '735e9b002f8fac14e57ae0523f2dadd9a2bbe22a',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'c6d5eafe1b164570230088380377650467c028e1',
  'WebDAV dry-run live proof',
  'status:"webdav-transport-dry-run-ready"',
  'Relay / idempotency / restart live proof',
  'status:"relay-idempotency-restart-proof-ready"',
  'duplicateReplayZeroWrite:true',
  'restartFailClosed:true',
  'bootResumeBlockedWithoutControlledGate:true',
  'fullBundle.v2 transport-envelope live proof',
  'status:"fullbundle-v2-transport-envelope-preflight-ready"',
  'selectedPayloadBoundary:"fullBundle.v2-transport-envelope"',
  'payloadUnmodified:true',
  'fullBundleV3Required:false',
  'fullBundleV3Deferred:true',
  'fullBundleV3Started:false',
  'rollbackDisableFailClosedProof:true',
  'transportDisabledByDefault:true',
  'autoStartBlocked:true',
  'bootResumeBlocked:true',
  'dryRunCannotBecomeWrite:true',
  'controlledGateRequired:true',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'real WebDAV/cloud/relay writes',
  '`transportReady:true`',
  'global `productSyncReady:true`',
  'Chat Saving CAS / archive cloud',
  '`transport-kill-switch-not-implemented-for-controlled-writes`',
  '`webdav-cloud-relay-transport-controlled-apply`',
  'That gate is not usable until a future controlled-write kill switch exists',
  '`localExportableSyncReady:true` is not transport authorization',
  '`transportEligibilityFromLocalExportableReady:true` is candidate-only',
  '`transportReadinessEvaluationAllowed:true` is non-writing and non-starting',
  '`transportReady:false` remains authoritative',
  '`productSyncReady:false` remains authoritative globally',
  '`webdavCloudRelayBlocked:true` remains authoritative',
  '`chatSavingCasBlocked:true` remains authoritative',
  '`a950DocumentedDebtQuarantined:true` remains visible',
  '`noCleanupAuthority:true` remains authoritative',
  'Controlled-write kill switch design and implementation',
  'Controlled transport implementation design',
  'Live dry-run with kill switch enabled but still no writes',
  'First controlled WebDAV/cloud/relay apply only after explicit approval',
  'Do not reopen Operational.5 cleanup/parity from this transport rollup',
  'Do not clean or mutate `row:a950a44b859f` without new strict evidence',
  'Do not reintroduce `fullBundle.v3` unless a later design proves it is required',
  'Do not treat `localExportableSyncReady:true` as `transportReady:true`',
  'Do not start Chat Saving CAS from this lane',
  'Transport remains globally blocked',
  'WebDAV/cloud/relay cannot start now',
  'Chat Saving CAS cannot start now',
  'No cleanup or a950 mutation authority is introduced',
]) {
  assertIncludes(flatEvidence, token, `rollup token ${token}`);
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
  'noCleanupAuthority:false',
  'localExportableSyncReady is transport authorization',
  'WebDAV/cloud/relay can start now',
  'Chat Saving CAS can start now',
]) {
  assertNotIncludes(flatEvidence, forbidden, `rollup forbidden ${forbidden}`);
}

assertIncludes(privacy, 'TRANSPORT PRIVACY / EVIDENCE CONTRACT CLOSED - HASH-ONLY / NON-WRITING',
  'privacy closeout respected');
assertIncludes(privacy, 'killSwitchBlocker:"transport-kill-switch-not-implemented-for-controlled-writes"',
  'privacy closeout keeps kill-switch blocker');
assertIncludes(rollback, 'TRANSPORT ROLLBACK / DISABLE / FAIL-CLOSED PROOF COMPLETE - NON-WRITING',
  'rollback proof respected');
assertIncludes(rollback, 'killSwitchBlocker:"transport-kill-switch-not-implemented-for-controlled-writes"',
  'rollback proof keeps kill-switch blocker');
assertIncludes(fullBundleCloseout, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  'fullBundle closeout respected');
assertIncludes(fullBundleCloseout, 'fullBundleV3Started:false', 'fullBundle closeout keeps v3 stopped');
assertIncludes(fullBundleCloseout, 'a950LeaksIntoExportablePayload:false', 'a950 quarantine respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(relayCloseout, 'localExportableSyncReadyIsAuthorization:false',
  'relay closeout keeps localExportable non-authorization');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV closeout respected');
assertIncludes(webdavCloseout, 'transportControlledApplyGateReserved:"webdav-cloud-relay-transport-controlled-apply"',
  'WebDAV closeout keeps reserved gate');
assertIncludes(inventory, 'TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT',
  'source inventory respected');
assertIncludes(gateDesign, 'TRANSPORT READINESS EVALUATION GATE DESIGNED - EVALUATION ONLY; TRANSPORT NOT STARTED',
  'transport gate design respected');

for (const source of [privacy, rollback, fullBundleCloseout, relayCloseout, webdavCloseout, inventory, gateDesign]) {
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
    assertNotIncludes(source, forbidden, `anchor forbidden ${forbidden}`);
  }
}

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.final-rollup-global-blocked.validator.v1',
  verdict: 'TRANSPORT_READINESS_FINAL_ROLLUP_COMPLETE_GLOBAL_BLOCKED',
  webdavDryRunLiveProofComplete: true,
  relayIdempotencyRestartProofComplete: true,
  fullBundleV2EnvelopeProofComplete: true,
  rollbackDisableFailClosedProofComplete: true,
  privacyEvidenceContractComplete: true,
  transportReady: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  remainingBlocker: 'transport-kill-switch-not-implemented-for-controlled-writes',
  reservedControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  cleanupAuthorityIntroduced: false,
  transportWriteAuthorized: false,
}, null, 2));
