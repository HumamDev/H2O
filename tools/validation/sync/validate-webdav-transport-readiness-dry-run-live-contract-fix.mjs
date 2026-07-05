#!/usr/bin/env node
//
// WebDAV transport-readiness dry-run live contract fix validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-contract-fix.md';
const implementationEvidencePath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-implementation.md';
const contractDesignPath = 'release-evidence/2026-07-01/webdav-dry-run-contract-gate-design.md';

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
const contractDesign = read(contractDesignPath);

for (const token of [
  'WEBDAV TRANSPORT READINESS DRY-RUN LIVE CONTRACT FIXED - ZERO WRITE',
  'f776e66d595de7ac80746fcd7e337d5452c2e26e',
  'The implementation accepted only flat validator fields',
  'The live DevTools request used the nested shape from the design',
  '`readiness.*` into readiness guards',
  '`expectedBundle.expectedHash` into the candidate payload / bundle hash',
  '`sequence.mintNewExport:false` plus `sequence.requireExistingOnly:true` into `sequenceMode:"not-minted-in-dry-run"`',
  '`target.mode:"mock-peer"` plus redacted peer/root tokens into an unambiguous local mock target',
  '`transport.*` into write/relay/CAS/fullBundle.v3 blockers',
  '`safety.*` into cleanup/a950 mutation blockers',
  'H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun',
  'gate: "webdav-transport-readiness-dry-run-evaluate"',
  'mode: "hash-only"',
  'localExportableSyncReady: true',
  'transportEligibilityFromLocalExportableReady: true',
  'productSyncReady: false',
  'transportReady: false',
  'expectedHash: "sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85"',
  'mode: "mock-peer"',
  'enqueueRelay: false',
  'writeRemote: false',
  'startFullBundleV3: false',
  'touchChatSavingCAS: false',
  'mutateA950: false',
  'cleanupAuthority: false',
  'status:"webdav-transport-dry-run-ready"',
  '`writesWebDAV:false`',
  '`writesRelay:false`',
  '`writesCAS:false`',
  '`fullBundleV3Started:false`',
  '`webdavCloudRelayBlocked:true`',
  '`chatSavingCasBlocked:true`',
  '`a950DocumentedDebtQuarantined:true`',
  'wrong gate',
  '`apply:true`',
  '`dryRun:false`',
  '`productSyncReady:true`',
  '`transportReady:true`',
  '`localExportableSyncReady:false`',
  'privacy/hash-only violations',
  'missing or malformed bundle hash',
  'sequence mint/regression',
  'ambiguous peer target',
  'relay enqueue',
  'remote write',
  '`fullBundle.v3` start/mint',
  'Chat Saving CAS boundary requests',
  'cleanup or a950 mutation authority',
  'No WebDAV/cloud/relay write occurred',
  '`productSyncReady:false` remains',
  '`transportReady:false` remains',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true is allowed',
  'productSyncReady:true is allowed',
  'WebDAV/cloud/relay can start now',
  'cleanup authority is introduced',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(implementationEvidence, 'WEBDAV TRANSPORT READINESS DRY-RUN IMPLEMENTED - ZERO WRITE', 'implementation evidence respected');
assertIncludes(contractDesign, 'peerTarget` as a redacted/hash-only peer target or `localMockTarget`', 'contract design supports mock target');
assertIncludes(contractDesign, 'expectedBundleHash` or `expectedContentSha256`', 'contract design supports bundle hash');

for (const token of [
  'var readiness = safeObject(inp.readiness)',
  'var expectedBundle = safeObject(inp.expectedBundle)',
  'var sequence = safeObject(inp.sequence)',
  'var target = safeObject(inp.target)',
  'var transport = safeObject(inp.transport)',
  'var safety = safeObject(inp.safety)',
  "objectHash(inp, 'expectedBundle'",
  "targetMode === 'mock-peer'",
  'sequence.mintNewExport === false && sequence.requireExistingOnly === true',
  'transport.writeRemote',
  'transport.enqueueRelay',
  'transport.startFullBundleV3',
  'transport.touchChatSavingCAS',
  'safety.cleanupAuthority',
  'safety.mutateA950',
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

const liveRequestShape = Object.freeze({
  schema: 'h2o.studio.transport.webdav-readiness-dry-run-request.v1',
  dryRun: true,
  apply: false,
  gate: 'webdav-transport-readiness-dry-run-evaluate',
  source: 'operational5-local-exportable-ready',
  reason: 'operator live WebDAV transport readiness dry-run only',
  privacy: {
    mode: 'hash-only',
    hashOnly: true,
  },
  readiness: {
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    productSyncReady: false,
    transportReady: false,
    chatSavingCasBlocked: true,
    a950DocumentedDebtVisible: true,
  },
  expectedBundle: {
    kind: 'fullBundle.v2-readonly-projection',
    expectedBindingProjectionCount: 12,
    expectedHash: 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
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
    startFullBundleV3: false,
    touchChatSavingCAS: false,
  },
  safety: {
    mutateA950: false,
    cleanupAuthority: false,
  },
  transportControlledApplyGateReserved: 'webdav-cloud-relay-transport-controlled-apply',
});

const good = api.evaluateTransportReadinessDryRun(liveRequestShape);
assert.equal(good.ok, true, 'nested live request should be accepted');
assert.equal(good.status, 'webdav-transport-dry-run-ready', 'nested live request status');
assert.equal(good.candidatePayloadHash, liveRequestShape.expectedBundle.expectedHash, 'nested bundle hash used');
assert.equal(good.candidateBundleHash, liveRequestShape.expectedBundle.expectedHash, 'nested bundle hash mirrored');
assert.equal(good.sequenceMode, 'not-minted-in-dry-run', 'nested sequence interpreted as no mint');
assert.equal(good.peerTarget.localMockTarget, true, 'mock-peer target accepted');
assert.equal(good.peerTarget.ambiguous, false, 'mock-peer target not ambiguous');
assert.equal(Array.isArray(good.blockers), true, 'nested live request blockers is an array');
assert.equal(good.blockers.length, 0, 'nested live request has no blockers');
assert.equal(good.writesData, false, 'no data write');
assert.equal(good.writesWebDAV, false, 'no WebDAV write');
assert.equal(good.writesCloud, false, 'no cloud write');
assert.equal(good.writesRelay, false, 'no relay write');
assert.equal(good.writesCAS, false, 'no CAS write');
assert.equal(good.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(good.productSyncReady, false, 'productSyncReady false');
assert.equal(good.transportReady, false, 'transportReady false');
assert.equal(good.localExportableSyncReady, true, 'localExportable true');
assert.equal(good.transportEligibilityFromLocalExportableReady, true, 'transport eligibility true');
assert.equal(good.webdavCloudRelayBlocked, true, 'WebDAV/cloud/relay blocked');
assert.equal(good.chatSavingCasBlocked, true, 'Chat Saving CAS blocked');
assert.equal(good.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(good.noCleanupAuthority, true, 'no cleanup authority');

function expectBlock(label, patch, blocker) {
  const request = {
    ...liveRequestShape,
    ...patch,
    readiness: { ...liveRequestShape.readiness, ...(patch.readiness || {}) },
    expectedBundle: { ...liveRequestShape.expectedBundle, ...(patch.expectedBundle || {}) },
    sequence: { ...liveRequestShape.sequence, ...(patch.sequence || {}) },
    target: { ...liveRequestShape.target, ...(patch.target || {}) },
    transport: { ...liveRequestShape.transport, ...(patch.transport || {}) },
    safety: { ...liveRequestShape.safety, ...(patch.safety || {}) },
    privacy: { ...liveRequestShape.privacy, ...(patch.privacy || {}) },
  };
  const result = api.evaluateTransportReadinessDryRun(request);
  assert.equal(result.ok, false, `${label}: must block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, saw ${result.blockers.join(',')}`);
  assert.equal(result.writesWebDAV, false, `${label}: no WebDAV write`);
  assert.equal(result.writesRelay, false, `${label}: no relay write`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
  assert.equal(result.productSyncReady, false, `${label}: productSyncReady remains false`);
  assert.equal(result.transportReady, false, `${label}: transportReady remains false`);
}

expectBlock('wrong gate', { gate: 'wrong-gate' }, 'webdav-dry-run-gate-invalid');
expectBlock('apply true', { apply: true }, 'webdav-dry-run-apply-forbidden');
expectBlock('dryRun false', { dryRun: false }, 'webdav-dry-run-required');
expectBlock('productSyncReady true', { readiness: { productSyncReady: true } }, 'webdav-product-sync-ready-mismatch');
expectBlock('transportReady true', { readiness: { transportReady: true } }, 'webdav-transport-ready-mismatch');
expectBlock('localExportable false', { readiness: { localExportableSyncReady: false } }, 'webdav-local-exportable-not-ready');
expectBlock('privacy raw', { privacy: { mode: 'raw', hashOnly: false } }, 'webdav-private-input-rejected');
expectBlock('hash missing', { expectedBundle: { expectedHash: '' } }, 'webdav-checksum-required');
expectBlock('sequence mint', { sequence: { mintNewExport: true, requireExistingOnly: false } }, 'webdav-sequence-regression');
expectBlock('peer ambiguous', { target: { mode: '', peerToken: '', remoteRootToken: '', ambiguous: true } }, 'webdav-peer-target-ambiguous');
expectBlock('relay enqueue', { transport: { enqueueRelay: true } }, 'webdav-dry-run-relay-enqueue-forbidden');
expectBlock('remote write', { transport: { writeRemote: true } }, 'webdav-dry-run-remote-write-forbidden');
expectBlock('fullBundle v3 start', { transport: { startFullBundleV3: true } }, 'webdav-fullbundle-v3-start-forbidden');
expectBlock('CAS touch', { transport: { touchChatSavingCAS: true } }, 'webdav-chat-saving-cas-boundary-violation');
expectBlock('cleanup authority', { safety: { cleanupAuthority: true } }, 'webdav-cleanup-authority-forbidden');
expectBlock('a950 mutation', { safety: { mutateA950: true } }, 'webdav-cleanup-authority-forbidden');

console.log('validate-webdav-transport-readiness-dry-run-live-contract-fix: PASS');
