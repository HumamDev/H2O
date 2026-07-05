#!/usr/bin/env node
//
// fullBundle.v2 transport-envelope preflight live closeout validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-live-closeout.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-implementation.md';
const liveContractFixPath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-live-contract-fix.md';
const v3BoundaryPath = 'release-evidence/2026-07-01/fullbundle-v3-preflight-payload-transport-boundary-design.md';
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

const evidence = read(evidencePath);
const flat = compact(evidence);
const implementationEvidence = read(implementationEvidencePath);
const liveContractFix = read(liveContractFixPath);
const v3Boundary = read(v3BoundaryPath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const source = read(sourcePath);

for (const token of [
  'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT LIVE PROVEN - ZERO WRITE',
  '868d085ed00857b5f893c1e4387ae64c9007384c',
  '249975efa0f2a06e94d3953db846d1e4cee19f6c',
  'cb587fa0aa9e02b3acda0678997ef118d6dd76be',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'schema:"h2o.studio.fullbundle-v2.transport-envelope-preflight.live-proof.v2"',
  'diagnosticOnly:true',
  'readOnly:true',
  'writeIntent:false',
  'apiAvailable:true',
  'preflightApiAvailable:true',
  'gate:"fullbundle-v2-transport-envelope-preflight-evaluate"',
  'schema:"h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-result.v1"',
  'requestSchema:"h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1"',
  'version:"0.1.0-phase32-v2-envelope-preflight"',
  'ok:true',
  'status:"fullbundle-v2-transport-envelope-preflight-ready"',
  'reason:"fullbundle-v2-transport-envelope-preflight-ready"',
  'gateSatisfied:true',
  'fullBundleV2EnvelopePreflight:true',
  'selectedPayloadBoundary:"fullBundle.v2-transport-envelope"',
  'payloadSchema:"h2o.studio.fullBundle.v2"',
  'fullBundleV3Required:false',
  'fullBundleV3Deferred:true',
  'fullBundleV3Started:false',
  'payloadUnmodified:true',
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
  'localExportableSyncReady:true',
  'localExportableSyncReadyIsAuthorization:false',
  'transportEligibilityFromLocalExportableReady:true',
  'webdavCloudRelayBlocked:true',
  'chatSavingCasBlocked:true',
  'a950DocumentedDebtQuarantined:true',
  'a950LeaksIntoExportablePayload:false',
  'noCleanupAuthority:true',
  'candidatePayloadHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'candidateBundleHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'expectedProjectionHash:"sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'expectedProjectionCount:12',
  'peerTargetHash:"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"',
  'remoteRootRefHash:"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"',
  'sequenceMode:"not-minted-in-dry-run"',
  'transportControlledApplyGateReserved:"webdav-cloud-relay-transport-controlled-apply"',
  'privacy.redacted:true',
  'privacy.hashOnly:true',
  'privacy.rawPrivateFieldsLogged:false',
  'privacy.rawInputRejected:false',
  'blockers:[]',
  'warnings:[]',
  'activeTransport:"local-sync-folder-json"',
  'The live preflight passed with `ok:true`',
  'The selected payload boundary remains `fullBundle.v2-transport-envelope`',
  '`fullBundle.v3` remains deferred and not-started',
  '`fullBundle.v3` is not required now',
  'The `fullBundle.v2` payload remains unmodified',
  'The expected projection count is `12`',
  'No WebDAV/cloud/relay write occurred',
  'No relay enqueue occurred',
  'No CAS write occurred',
  'No file write occurred',
  'No export-state mutation occurred',
  'No export id was minted',
  'No sequence was burned',
  '`productSyncReady:false` remains authoritative',
  '`transportReady:false` remains authoritative',
  '`localExportableSyncReady` is not transport authorization',
  '`a950LeaksIntoExportablePayload:false` was proven',
  'No cleanup authority is introduced',
  'Privacy remained redacted/hash-only',
  'The reserved controlled gate `webdav-cloud-relay-transport-controlled-apply` remains reserved only and unusable in this slice',
  'WebDAV/cloud/relay cannot start from this closeout',
  'Chat Saving CAS remains blocked/deferred',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true',
  'productSyncReady:true',
  'WebDAV/cloud/relay can start now',
  'fullBundle.v3 started',
  'Chat Saving CAS can start now',
  'cleanup authority is introduced and approved',
  'writesWebDAV:true',
  'writesCloud:true',
  'writesRelay:true',
  'enqueuesRelay:true',
  'writesCAS:true',
  'writesFiles:true',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT IMPLEMENTED - ZERO WRITE',
  'implementation evidence respected');
assertIncludes(liveContractFix, 'FULLBUNDLE V2 TRANSPORT ENVELOPE LIVE CONTRACT FIXED - ZERO WRITE',
  'live contract fix evidence respected');
assertIncludes(v3Boundary, 'FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT',
  'v3 boundary design respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV dry-run closeout respected');

for (const token of [
  'function evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight',
  'fullbundle-v2-transport-envelope-preflight-evaluate',
  'fullbundle-v2-transport-envelope-preflight-ready',
  "selectedPayloadBoundary: 'fullBundle.v2-transport-envelope'",
  'fullBundleV3Required: false',
  'fullBundleV3Deferred: true',
  'fullBundleV3Started: false',
  'payloadUnmodified: true',
  'writesWebDAV: false',
  'writesCloud: false',
  'writesRelay: false',
  'enqueuesRelay: false',
  'writesCAS: false',
  'writesFiles: false',
  'mutatesExportState: false',
  'mintsExportId: false',
  'burnsSequence: false',
  'productSyncReady: false',
  'transportReady: false',
  'localExportableSyncReadyIsAuthorization: false',
  'a950DocumentedDebtQuarantined: true',
  'a950LeaksIntoExportablePayload: false',
  'noCleanupAuthority: true',
  'webdav-cloud-relay-transport-controlled-apply',
  'candidate.expectedProjectionCount',
  'candidate.expectedBindingProjectionCount',
  "'payloadHash'",
  "'bundleHash'",
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
  'productSyncReady: true',
  'transportReady: true',
]) {
  assertNotIncludes(source, forbidden, `source forbidden ${forbidden}`);
}

const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const api = sandbox.H2O?.Studio?.sync?.fullBundleTransportEnvelope;
assert.equal(typeof api?.evaluateFullBundleV2TransportEnvelopePreflight, 'function', 'preflight API exposed');

const hash = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const liveShape = {
  dryRun: true,
  apply: false,
  gate: 'fullbundle-v2-transport-envelope-preflight-evaluate',
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
  },
  candidate: {
    kind: 'fullBundle.v2-readonly-projection',
    payloadHash: hash,
    bundleHash: hash,
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
    a950DocumentedDebtVisible: true,
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    mutateA950: false,
    cleanupAuthority: false,
  },
  privacy: { mode: 'hash-only' },
};

const result = api.evaluateFullBundleV2TransportEnvelopePreflight(liveShape);
assert.equal(result.ok, true, 'live request shape remains accepted');
assert.equal(result.status, 'fullbundle-v2-transport-envelope-preflight-ready', 'ready status');
assert.equal(result.gateSatisfied, true, 'gate satisfied');
assert.equal(result.selectedPayloadBoundary, 'fullBundle.v2-transport-envelope', 'selected boundary');
assert.equal(result.fullBundleV3Required, false, 'fullBundle.v3 not required');
assert.equal(result.fullBundleV3Deferred, true, 'fullBundle.v3 deferred');
assert.equal(result.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(result.payloadUnmodified, true, 'payload unmodified');
assert.equal(result.candidatePayloadHash, hash, 'payload hash accepted');
assert.equal(result.candidateBundleHash, hash, 'bundle hash accepted');
assert.equal(result.expectedProjectionHash, hash, 'projection hash accepted');
assert.equal(result.expectedProjectionCount, 12, 'projection count accepted');
assert.equal(result.writesWebDAV, false, 'no WebDAV write');
assert.equal(result.writesCloud, false, 'no cloud write');
assert.equal(result.writesRelay, false, 'no relay write');
assert.equal(result.enqueuesRelay, false, 'no relay enqueue');
assert.equal(result.writesCAS, false, 'no CAS write');
assert.equal(result.writesFiles, false, 'no file write');
assert.equal(result.mutatesExportState, false, 'no export-state mutation');
assert.equal(result.mintsExportId, false, 'no export id mint');
assert.equal(result.burnsSequence, false, 'no sequence burn');
assert.equal(result.productSyncReady, false, 'productSyncReady false');
assert.equal(result.transportReady, false, 'transportReady false');
assert.equal(result.localExportableSyncReady, true, 'localExportable true');
assert.equal(result.transportEligibilityFromLocalExportableReady, true, 'transport eligibility true');
assert.equal(result.localExportableSyncReadyIsAuthorization, false, 'localExportable not authorization');
assert.equal(result.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(result.a950LeaksIntoExportablePayload, false, 'a950 does not leak');
assert.equal(result.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(result.privacy.hashOnly, true, 'hash-only privacy');
assert.equal(result.privacy.rawPrivateFieldsLogged, false, 'no raw private fields');
assert.equal(result.privacy.rawInputRejected, false, 'raw input not rejected');
assert.equal(result.blockers.length, 0, 'no blockers');
assert.equal(result.warnings.length, 0, 'no warnings');
assert.equal(result.transportControlledApplyGateReserved, 'webdav-cloud-relay-transport-controlled-apply',
  'controlled gate remains reserved');

console.log('validate-fullbundle-v2-transport-envelope-preflight-live-closeout: PASS');
