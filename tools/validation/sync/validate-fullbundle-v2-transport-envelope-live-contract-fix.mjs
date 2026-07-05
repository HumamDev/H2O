#!/usr/bin/env node
//
// Validates the fullBundle.v2 transport-envelope live DevTools request contract.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-live-contract-fix.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-implementation.md';
const implementationValidatorPath = 'tools/validation/sync/validate-fullbundle-v2-transport-envelope-preflight-implementation.mjs';
const designEvidencePath = 'release-evidence/2026-07-01/fullbundle-v3-preflight-payload-transport-boundary-design.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const casBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

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
const implementationValidator = read(implementationValidatorPath);
const designEvidence = read(designEvidencePath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const casBoundary = read(casBoundaryPath);

for (const token of [
  'FULLBUNDLE V2 TRANSPORT ENVELOPE LIVE CONTRACT FIXED - ZERO WRITE',
  '868d085ed00857b5f893c1e4387ae64c9007384c',
  'H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'candidate.payloadHash',
  'candidate.bundleHash',
  'candidate.expectedProjectionCount',
  'candidate.expectedBindingProjectionCount',
  'fullbundle-v2-envelope-checksum-mismatch',
  'fullbundle-v2-envelope-projection-count-mismatch',
  'fullbundle-v2-transport-envelope-preflight-evaluate',
  'fullBundle.v2-readonly-projection',
  'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  'status:"fullbundle-v2-transport-envelope-preflight-ready"',
  '`blockers:[]`',
  'This fix does not authorize transport',
  'This fix does not authorize WebDAV/cloud/relay',
  'This fix does not enqueue relay',
  'This fix does not write CAS or files',
  'This fix does not mutate export state',
  'This fix does not mint an export id',
  'This fix does not burn sequence',
  'This fix does not alter the fullBundle.v2 payload',
  'This fix does not mint or start fullBundle.v3',
  'This fix does not flip `productSyncReady`',
  'This fix does not set `transportReady:true`',
  'This fix does not clean or mutate `row:a950a44b859f`',
  'Strict tombstone cleanup rules remain unchanged',
  '`localExportableSyncReady:true` remains an input to this preflight, not transport authorization',
  '`row:a950a44b859f` remains documented/quarantined debt',
  'Chat Saving CAS remains separate and blocked/deferred',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'WebDAV/cloud/relay can start now',
  'transportReady:true is approved',
  'productSyncReady:true is approved',
  'cleanup authority is introduced',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

for (const token of [
  'candidate.expectedProjectionCount',
  'candidate.projectionCount',
  'candidate.expectedBindingProjectionCount',
  "'payloadHash'",
  "'bundleHash'",
  "'projectionHash'",
  'fullbundle-v2-envelope-checksum-mismatch',
  'fullbundle-v2-envelope-projection-count-mismatch',
]) {
  assertIncludes(source, token, `source token ${token}`);
}

assertIncludes(implementationEvidence, 'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT IMPLEMENTED - ZERO WRITE',
  'implementation evidence retained');
assertIncludes(implementationValidator, 'projection count mismatch', 'implementation validator still covers count mismatch');
assertIncludes(designEvidence, 'FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT',
  'v3 boundary design retained');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay live closeout retained');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV live closeout retained');
assertIncludes(casBoundary, 'PREMATURE_TRANSPORT_PATTERNS', 'CAS boundary retained');

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
const liveRequest = Object.freeze({
  schema: 'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1',
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
    fullBundleV3Required: false,
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
  privacy: {
    mode: 'hash-only',
  },
});

const result = api.evaluateFullBundleV2TransportEnvelopePreflight(liveRequest);
assert.equal(result.ok, true, 'exact live request shape accepted');
assert.equal(result.status, 'fullbundle-v2-transport-envelope-preflight-ready', 'ready status');
assert.equal(result.candidatePayloadHash, hash, 'candidate payload hash accepted');
assert.equal(result.candidateBundleHash, hash, 'candidate bundle hash accepted');
assert.equal(result.expectedProjectionHash, hash, 'projection hash accepted from candidate hash');
assert.equal(result.expectedProjectionCount, 12, 'projection count accepted');
assert.equal(result.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(result.fullBundleV3Required, false, 'fullBundle.v3 not required');
assert.equal(result.payloadUnmodified, true, 'payload unmodified');
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
assert.equal(result.localExportableSyncReadyIsAuthorization, false, 'localExportable is not transport authorization');
assert.equal(result.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(result.a950LeaksIntoExportablePayload, false, 'a950 does not leak');
assert.equal(result.noCleanupAuthority, true, 'no cleanup authority');
assert.equal(result.privacy.hashOnly, true, 'hash-only privacy');
assert.equal(result.blockers.length, 0, 'no blockers');
assert.equal(result.warnings.length, 0, 'no warnings');

function withPatch(base, patch) {
  return {
    ...base,
    ...patch,
    readiness: patch.readiness || base.readiness,
    candidate: patch.candidate || base.candidate,
    sequence: patch.sequence || base.sequence,
    target: patch.target || base.target,
    transport: patch.transport || base.transport,
    safety: patch.safety || base.safety,
    privacy: patch.privacy || base.privacy,
  };
}

function expectBlock(label, patch, blocker) {
  const blocked = api.evaluateFullBundleV2TransportEnvelopePreflight(withPatch(liveRequest, patch));
  assert.equal(blocked.ok, false, `${label}: expected blocked result`);
  assert.ok(blocked.blockers.includes(blocker), `${label}: expected ${blocker}, got ${blocked.blockers.join(',')}`);
  assert.equal(blocked.writesWebDAV, false, `${label}: no WebDAV write`);
  assert.equal(blocked.writesRelay, false, `${label}: no relay write`);
  assert.equal(blocked.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(blocked.writesCAS, false, `${label}: no CAS write`);
  assert.equal(blocked.writesFiles, false, `${label}: no file write`);
  assert.equal(blocked.mutatesExportState, false, `${label}: no export mutation`);
  assert.equal(blocked.mintsExportId, false, `${label}: no export id mint`);
  assert.equal(blocked.burnsSequence, false, `${label}: no sequence burn`);
  assert.equal(blocked.productSyncReady, false, `${label}: productSyncReady false`);
  assert.equal(blocked.transportReady, false, `${label}: transportReady false`);
}

expectBlock('wrong gate', { gate: 'wrong' }, 'fullbundle-v2-envelope-gate-invalid');
expectBlock('dryRun false', { dryRun: false }, 'fullbundle-v2-envelope-dry-run-required');
expectBlock('apply true', { apply: true }, 'fullbundle-v2-envelope-apply-forbidden');
expectBlock('checksum mismatch', {
  candidate: { ...liveRequest.candidate, bundleHash: 'sha256:' + 'b'.repeat(64) },
}, 'fullbundle-v2-envelope-checksum-mismatch');
expectBlock('projection count mismatch', {
  candidate: { ...liveRequest.candidate, expectedProjectionCount: 11 },
}, 'fullbundle-v2-envelope-projection-count-mismatch');
expectBlock('raw private input', { rawChatTitle: 'private' }, 'fullbundle-v2-envelope-private-input-rejected');
expectBlock('sequence burn', {
  sequence: { ...liveRequest.sequence, burnSequence: true },
}, 'fullbundle-v2-envelope-sequence-mismatch');
expectBlock('peer ambiguity', {
  target: { ...liveRequest.target, ambiguous: true },
}, 'fullbundle-v2-envelope-peer-target-ambiguous');
expectBlock('v3 start', {
  candidate: { ...liveRequest.candidate, startFullBundleV3: true },
}, 'fullbundle-v2-envelope-fullbundle-v3-forbidden');
expectBlock('payload mutation', {
  candidate: { ...liveRequest.candidate, mutatePayload: true },
}, 'fullbundle-v2-envelope-payload-mutation-forbidden');
expectBlock('WebDAV write', {
  transport: { ...liveRequest.transport, writeWebDAV: true },
}, 'fullbundle-v2-envelope-webdav-cloud-write-forbidden');
expectBlock('relay enqueue', {
  transport: { ...liveRequest.transport, enqueueRelay: true },
}, 'fullbundle-v2-envelope-relay-enqueue-forbidden');
expectBlock('CAS write', {
  transport: { ...liveRequest.transport, touchChatSavingCAS: true },
}, 'fullbundle-v2-envelope-cas-write-forbidden');
expectBlock('file write', {
  transport: { ...liveRequest.transport, writeFiles: true },
}, 'fullbundle-v2-envelope-file-write-forbidden');
expectBlock('a950 leakage', {
  safety: { ...liveRequest.safety, a950LeaksIntoExportablePayload: true },
}, 'fullbundle-v2-envelope-a950-leakage-blocked');
expectBlock('productSyncReady mismatch', {
  readiness: { ...liveRequest.readiness, productSyncReady: true },
}, 'fullbundle-v2-envelope-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...liveRequest.readiness, transportReady: true },
}, 'fullbundle-v2-envelope-transport-ready-mismatch');
expectBlock('localExportable mismatch', {
  readiness: { ...liveRequest.readiness, localExportableSyncReady: false },
}, 'fullbundle-v2-envelope-local-exportable-not-ready');
expectBlock('cleanup authority', {
  safety: { ...liveRequest.safety, cleanupAuthority: true },
}, 'fullbundle-v2-envelope-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.fullbundle-v2-transport-envelope-live-contract-fix.validator.v1',
  evidence: evidencePath,
  verdict: 'FULLBUNDLE_V2_TRANSPORT_ENVELOPE_LIVE_CONTRACT_FIXED_ZERO_WRITE',
  exactLiveRequestAccepted: true,
  candidatePayloadHashAccepted: true,
  projectionCountAccepted: true,
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-fullbundle-v2-transport-envelope-live-contract-fix');
