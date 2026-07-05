#!/usr/bin/env node
//
// WebDAV transport-readiness dry-run implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-implementation.md';
const contractDesignPath = 'release-evidence/2026-07-01/webdav-dry-run-contract-gate-design.md';
const sourceInventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const transportGatePath = 'release-evidence/2026-07-01/transport-readiness-evaluation-gate-design.md';
const policyForkPath = 'release-evidence/2026-07-01/operational5-global-readiness-policy-fork-after-a950.md';
const localCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

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
const contractDesign = read(contractDesignPath);
const sourceInventory = read(sourceInventoryPath);
const transportGate = read(transportGatePath);
const policyFork = read(policyForkPath);
const localCloseout = read(localCloseoutPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'WEBDAV TRANSPORT READINESS DRY-RUN IMPLEMENTED - ZERO WRITE',
  '2b12b53223297fe9588ffe29750948055305f8bc',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'c6d5eafe1b164570230088380377650467c028e1',
  'b66efe02f419e3a85807f9a57a635c095fe702d9',
  '82cf4aba',
  'H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun(request)',
  'webdav-transport-readiness-dry-run-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'reserved controlled gate is recorded only as a future gate',
  '`dryRun:true`',
  '`apply:false`',
  '`privacyMode:"hash-only"`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`localExportableSyncReady:true`',
  '`transportEligibilityFromLocalExportableReady:true`',
  'status:"webdav-transport-dry-run-ready"',
  '`transportReadinessDryRun:true`',
  '`writesData:false`',
  '`writesWebDAV:false`',
  '`writesCloud:false`',
  '`writesRelay:false`',
  '`writesCAS:false`',
  '`writesFiles:false`',
  '`mutatesExportState:false`',
  '`mintsExportId:false`',
  '`burnsSequence:false`',
  '`enqueuesRelay:false`',
  '`fullBundleV3Started:false`',
  '`webdavCloudRelayBlocked:true`',
  '`chatSavingCasBlocked:true`',
  '`a950DocumentedDebtQuarantined:true`',
  '`noCleanupAuthority:true`',
  'missing gate -> `webdav-dry-run-gate-missing`',
  'wrong gate -> `webdav-dry-run-gate-invalid`',
  '`dryRun:false` -> `webdav-dry-run-required`',
  '`apply:true` -> `webdav-dry-run-apply-forbidden`',
  '`productSyncReady` not exactly false -> `webdav-product-sync-ready-mismatch`',
  '`transportReady` not exactly false -> `webdav-transport-ready-mismatch`',
  '`localExportableSyncReady` not true -> `webdav-local-exportable-not-ready`',
  '`transportEligibilityFromLocalExportableReady` not true -> `webdav-transport-eligibility-missing`',
  'privacy/hash-only violation -> `webdav-private-input-rejected`',
  'missing or malformed bundle/checksum hash -> `webdav-checksum-required`',
  'sequence regression or unintended sequence mint -> `webdav-sequence-regression`',
  'export-id mint request -> `webdav-export-id-minted-in-dry-run`',
  'peer target ambiguity -> `webdav-peer-target-ambiguous`',
  'remote root ambiguity -> `webdav-remote-root-ambiguous`',
  'any relay enqueue request -> `webdav-dry-run-relay-enqueue-forbidden`',
  'any remote write request -> `webdav-dry-run-remote-write-forbidden`',
  'any `fullBundle.v3` start/mint request -> `webdav-fullbundle-v3-start-forbidden`',
  'any Chat Saving CAS boundary request -> `webdav-chat-saving-cas-boundary-violation`',
  'any cleanup or a950 mutation request -> `webdav-cleanup-authority-forbidden`',
  'WebDAV/cloud/relay remains blocked',
  '`fullBundle.v3` remains not-started',
  'Chat Saving CAS remains blocked/deferred',
  'No cleanup, mutation, WebDAV write, relay enqueue, CAS write, fullBundle.v3 mint/start, or productSyncReady flip occurred',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true',
  'productSyncReady:true',
  'WebDAV/cloud/relay can start now',
  'fullBundle.v3 can start now',
  'Chat Saving CAS can start now',
  'cleanup authority is approved',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(contractDesign, 'WEBDAV DRY-RUN CONTRACT DESIGNED', 'contract design respected');
assertIncludes(sourceInventory, 'TRANSPORT SOURCE INVENTORY COMPLETE', 'source inventory respected');
assertIncludes(transportGate, 'TRANSPORT READINESS EVALUATION GATE DESIGNED', 'transport gate respected');
assertIncludes(policyFork, 'POLICY OPTION 2 SELECTED', 'policy fork respected');
assertIncludes(localCloseout, '`localExportableSyncReady:true`', 'localExportable closeout respected');
assertIncludes(chatSavingBoundary, 'saved-chat', 'Chat Saving CAS boundary validator present');

for (const token of [
  'function evaluateTransportReadinessDryRun(request)',
  'READINESS_DRY_RUN_REQUEST_SCHEMA',
  'READINESS_DRY_RUN_RESULT_SCHEMA',
  'TRANSPORT_READINESS_DRY_RUN_GATE',
  'TRANSPORT_CONTROLLED_APPLY_GATE',
  'webdav-transport-readiness-dry-run-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'writesWebDAV: false',
  'writesRelay: false',
  'writesCAS: false',
  'fullBundleV3Started: false',
  'productSyncReady: false',
  'transportReady: false',
  'webdavCloudRelayBlocked: true',
  'chatSavingCasBlocked: true',
  'a950DocumentedDebtQuarantined: true',
  'noCleanupAuthority: true',
  'webdav-dry-run-gate-missing',
  'webdav-dry-run-gate-invalid',
  'webdav-dry-run-required',
  'webdav-dry-run-apply-forbidden',
  'webdav-product-sync-ready-mismatch',
  'webdav-transport-ready-mismatch',
  'webdav-local-exportable-not-ready',
  'webdav-transport-eligibility-missing',
  'webdav-private-input-rejected',
  'webdav-checksum-required',
  'webdav-sequence-regression',
  'webdav-peer-target-ambiguous',
  'webdav-remote-root-ambiguous',
  'webdav-dry-run-relay-enqueue-forbidden',
  'webdav-dry-run-remote-write-forbidden',
  'webdav-fullbundle-v3-start-forbidden',
  'webdav-chat-saving-cas-boundary-violation',
  'webdav-cleanup-authority-forbidden',
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
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const api = sandbox.H2O?.Studio?.sync?.webdavTransportGates;
assert.equal(typeof api?.evaluateTransportReadinessDryRun, 'function', 'API must be exposed');
assert.equal(api.constants.TRANSPORT_READINESS_DRY_RUN_GATE, 'webdav-transport-readiness-dry-run-evaluate');
assert.equal(api.constants.TRANSPORT_CONTROLLED_APPLY_GATE, 'webdav-cloud-relay-transport-controlled-apply');

const validRequest = Object.freeze({
  schema: 'h2o.studio.transport.webdav-readiness-dry-run-request.v1',
  dryRun: true,
  apply: false,
  gate: 'webdav-transport-readiness-dry-run-evaluate',
  source: 'validator-zero-write',
  reason: 'validate WebDAV transport dry-run readiness only',
  privacyMode: 'hash-only',
  expectedBundleHash: 'sha256:' + 'a'.repeat(64),
  expectedFileHash: 'sha256:' + 'b'.repeat(64),
  sequenceMode: 'not-minted-in-dry-run',
  peerTargetHash: 'sha256:' + 'c'.repeat(64),
  remoteRootRefHash: 'sha256:' + 'd'.repeat(64),
  productSyncReady: false,
  transportReady: false,
  localExportableSyncReady: true,
  transportEligibilityFromLocalExportableReady: true,
  chatSavingCasBlocked: true,
  a950DocumentedDebtVisible: true,
  fullBundleV3Started: false,
});

const good = api.evaluateTransportReadinessDryRun(validRequest);
assert.equal(good.ok, true, 'valid dry-run should be ready');
assert.equal(good.status, 'webdav-transport-dry-run-ready', 'valid dry-run status');
assert.equal(good.transportReadinessDryRun, true, 'transportReadinessDryRun true');
assert.equal(good.writesData, false, 'no data write');
assert.equal(good.writesWebDAV, false, 'no WebDAV write');
assert.equal(good.writesRelay, false, 'no relay write');
assert.equal(good.writesCAS, false, 'no CAS write');
assert.equal(good.fullBundleV3Started, false, 'no fullBundle.v3 start');
assert.equal(good.productSyncReady, false, 'productSyncReady false');
assert.equal(good.transportReady, false, 'transportReady false');
assert.equal(good.webdavCloudRelayBlocked, true, 'WebDAV/cloud/relay blocked');
assert.equal(good.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(good.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(good.transportControlledApplyGateReserved, 'webdav-cloud-relay-transport-controlled-apply');
assert.equal(good.candidatePayloadHash, 'sha256:' + 'a'.repeat(64), 'candidate payload hash redacted');
assert.equal(good.privacy.rawPrivateFieldsLogged, false, 'no raw private fields logged');

function expectBlock(label, patch, blocker) {
  const result = api.evaluateTransportReadinessDryRun({ ...validRequest, ...patch });
  assert.equal(result.ok, false, `${label}: must block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, saw ${result.blockers.join(',')}`);
  assert.equal(result.writesWebDAV, false, `${label}: still writes no WebDAV`);
  assert.equal(result.writesRelay, false, `${label}: still writes no relay`);
  assert.equal(result.writesCAS, false, `${label}: still writes no CAS`);
  assert.equal(result.productSyncReady, false, `${label}: productSyncReady remains false`);
  assert.equal(result.transportReady, false, `${label}: transportReady remains false`);
}

expectBlock('missing gate', { gate: '' }, 'webdav-dry-run-gate-missing');
expectBlock('wrong gate', { gate: 'not-the-gate' }, 'webdav-dry-run-gate-invalid');
expectBlock('reserved controlled gate unusable', { gate: 'webdav-cloud-relay-transport-controlled-apply' }, 'webdav-dry-run-gate-invalid');
expectBlock('dryRun false', { dryRun: false }, 'webdav-dry-run-required');
expectBlock('apply true', { apply: true }, 'webdav-dry-run-apply-forbidden');
expectBlock('productSyncReady mismatch', { productSyncReady: true }, 'webdav-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', { transportReady: true }, 'webdav-transport-ready-mismatch');
expectBlock('localExportable missing', { localExportableSyncReady: false }, 'webdav-local-exportable-not-ready');
expectBlock('transport eligibility missing', { transportEligibilityFromLocalExportableReady: false }, 'webdav-transport-eligibility-missing');
expectBlock('privacy mode violation', { privacyMode: 'raw', rawChatTitle: 'private' }, 'webdav-private-input-rejected');
expectBlock('checksum missing', { expectedBundleHash: '', expectedFileHash: '' }, 'webdav-checksum-required');
expectBlock('sequence regression', { sequenceMode: 'fixed-existing-sequence', expectedSequenceNumber: 1, previousSequenceNumber: 2 }, 'webdav-sequence-regression');
expectBlock('export id mint', { exportIdMinted: true }, 'webdav-export-id-minted-in-dry-run');
expectBlock('peer target ambiguous', { peerTargetHash: '', localMockTarget: false }, 'webdav-peer-target-ambiguous');
expectBlock('remote root ambiguous', { remoteRootRefHash: '', localMockTarget: false }, 'webdav-remote-root-ambiguous');
expectBlock('relay enqueue forbidden', { relayEnqueueAttempted: true }, 'webdav-dry-run-relay-enqueue-forbidden');
expectBlock('remote write forbidden', { remoteWriteAttempted: true }, 'webdav-dry-run-remote-write-forbidden');
expectBlock('fullBundle v3 forbidden', { fullBundleV3Started: true }, 'webdav-fullbundle-v3-start-forbidden');
expectBlock('CAS forbidden', { chatSavingCasTouched: true }, 'webdav-chat-saving-cas-boundary-violation');
expectBlock('cleanup forbidden', { cleanupAuthorityIntroduced: true }, 'webdav-cleanup-authority-forbidden');

console.log('validate-webdav-transport-readiness-dry-run-implementation: PASS');
