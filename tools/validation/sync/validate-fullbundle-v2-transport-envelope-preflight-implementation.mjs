#!/usr/bin/env node
//
// fullBundle.v2 transport-envelope preflight implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';

const root = process.cwd();

const sourcePath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const evidencePath = 'release-evidence/2026-07-01/fullbundle-v2-transport-envelope-preflight-implementation.md';
const designEvidencePath = 'release-evidence/2026-07-01/fullbundle-v3-preflight-payload-transport-boundary-design.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const sourceInventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const localCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
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
const designEvidence = read(designEvidencePath);
const relayCloseout = read(relayCloseoutPath);
const webdavCloseout = read(webdavCloseoutPath);
const sourceInventory = read(sourceInventoryPath);
const localCloseout = read(localCloseoutPath);
const exportBundle = read(exportBundlePath);
const foldersStore = read(foldersStorePath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'FULLBUNDLE V2 TRANSPORT ENVELOPE PREFLIGHT IMPLEMENTED - ZERO WRITE',
  'cb587fa0aa9e02b3acda0678997ef118d6dd76be',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  '82cf4aba',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'H2O.Studio.sync.fullBundleTransportEnvelope.evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1',
  'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-result.v1',
  'fullbundle-v2-transport-envelope-preflight-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  '`dryRun:true`',
  '`apply:false`',
  'payload schema remains `h2o.studio.fullBundle.v2`',
  'privacy.mode:"hash-only"',
  '`a950DocumentedDebtQuarantined:true`',
  '`a950LeaksIntoExportablePayload:false`',
  '`localExportableSyncReady:true`',
  '`transportEligibilityFromLocalExportableReady:true`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  'status:"fullbundle-v2-transport-envelope-preflight-ready"',
  '`fullBundleV2EnvelopePreflight:true`',
  '`selectedPayloadBoundary:"fullBundle.v2-transport-envelope"`',
  '`payloadSchema:"h2o.studio.fullBundle.v2"`',
  '`fullBundleV3Required:false`',
  '`fullBundleV3Deferred:true`',
  '`fullBundleV3Started:false`',
  '`payloadUnmodified:true`',
  '`writesWebDAV:false`',
  '`writesCloud:false`',
  '`writesRelay:false`',
  '`enqueuesRelay:false`',
  '`writesCAS:false`',
  '`writesFiles:false`',
  '`mutatesExportState:false`',
  '`mintsExportId:false`',
  '`burnsSequence:false`',
  '`localExportableSyncReadyIsAuthorization:false`',
  '`webdavCloudRelayBlocked:true`',
  '`chatSavingCasBlocked:true`',
  '`noCleanupAuthority:true`',
  '`privacy.hashOnly:true`',
  '`privacy.rawPrivateFieldsLogged:false`',
  '`blockers:[]`',
  'missing/wrong gate',
  '`dryRun:false`',
  '`apply:true`',
  'schema mismatch',
  'checksum/hash mismatch',
  'projection count mismatch',
  'privacy/raw input violation',
  'sequence/export-id ambiguity',
  'peer target ambiguity',
  '`fullBundle.v3` start/mint request',
  '`fullBundle.v2` payload mutation request',
  'export-state mutation / export-id mint / sequence burn request',
  'WebDAV/cloud write request',
  'relay enqueue request',
  'CAS write request',
  'file write request',
  'a950 leakage into exportable payload',
  'missing a950 quarantine visibility',
  '`productSyncReady` mismatch',
  '`transportReady` mismatch',
  '`localExportableSyncReady` mismatch',
  'missing transport eligibility',
  'cleanup or a950 mutation request',
  '`localExportableSyncReady:true` is an input to this preflight, not transport authorization',
  'This preflight does not authorize WebDAV/cloud/relay',
  'This preflight does not authorize the reserved controlled transport gate',
  'This preflight does not authorize cleanup',
  '`row:a950a44b859f` remains documented/quarantined debt',
  'Chat Saving CAS remains a separate blocked/deferred lane',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  'No real transport is implemented by this preflight',
  '`fullBundle.v3` remains deferred and not-started',
  'The `fullBundle.v2` payload remains unmodified',
  'No export id is minted',
  'No sequence is burned',
  'No export state is mutated',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

for (const forbidden of [
  'fullBundle.v3 can start now',
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'transportReady:true is approved',
  'productSyncReady:true is approved',
  'cleanup authority is introduced and approved',
]) {
  assertNotIncludes(flatEvidence, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(designEvidence, 'FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT',
  'design evidence respected');
assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay closeout respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV closeout respected');
assertIncludes(sourceInventory, 'TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT',
  'source inventory respected');
assertIncludes(localCloseout, '`localExportableSyncReady:true`', 'local exportable closeout respected');
assertIncludes(exportBundle, "var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'fullBundle.v2 exporter remains v2');
assertIncludes(exportBundle, 'diagnoseFullBundleV2ReadonlyProjection', 'fullBundle.v2 read-only diagnostic retained');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt retained');
assertIncludes(chatSavingBoundary, 'PREMATURE_TRANSPORT_PATTERNS', 'Chat Saving CAS boundary retained');

for (const token of [
  'H2O.Studio.sync.fullBundleTransportEnvelope',
  'function evaluateFullBundleV2TransportEnvelopePreflight(request)',
  'FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_REQUEST_SCHEMA',
  'FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_RESULT_SCHEMA',
  'FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE',
  'fullbundle-v2-transport-envelope-preflight-evaluate',
  'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1',
  'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-result.v1',
  'fullbundle-v2-transport-envelope-preflight-ready',
  'fullBundleV2EnvelopePreflight: true',
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
  'webdavCloudRelayBlocked: true',
  'chatSavingCasBlocked: true',
  'a950DocumentedDebtQuarantined: true',
  'a950LeaksIntoExportablePayload: false',
  'noCleanupAuthority: true',
  'fullbundle-v2-envelope-gate-missing',
  'fullbundle-v2-envelope-gate-invalid',
  'fullbundle-v2-envelope-dry-run-required',
  'fullbundle-v2-envelope-apply-forbidden',
  'fullbundle-v2-envelope-schema-mismatch',
  'fullbundle-v2-envelope-checksum-mismatch',
  'fullbundle-v2-envelope-projection-count-mismatch',
  'fullbundle-v2-envelope-private-input-rejected',
  'fullbundle-v2-envelope-sequence-mismatch',
  'fullbundle-v2-envelope-peer-target-ambiguous',
  'fullbundle-v2-envelope-fullbundle-v3-forbidden',
  'fullbundle-v2-envelope-payload-mutation-forbidden',
  'fullbundle-v2-envelope-export-mutation-forbidden',
  'fullbundle-v2-envelope-webdav-cloud-write-forbidden',
  'fullbundle-v2-envelope-relay-enqueue-forbidden',
  'fullbundle-v2-envelope-cas-write-forbidden',
  'fullbundle-v2-envelope-file-write-forbidden',
  'fullbundle-v2-envelope-a950-leakage-blocked',
  'fullbundle-v2-envelope-product-sync-ready-mismatch',
  'fullbundle-v2-envelope-transport-ready-mismatch',
  'fullbundle-v2-envelope-local-exportable-not-ready',
  'fullbundle-v2-envelope-transport-eligibility-missing',
  'fullbundle-v2-envelope-cleanup-authority-forbidden',
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
assert.equal(api.constants.FULL_BUNDLE_V2_ENVELOPE_PREFLIGHT_GATE,
  'fullbundle-v2-transport-envelope-preflight-evaluate', 'preflight gate constant');
assert.equal(api.constants.TRANSPORT_CONTROLLED_APPLY_GATE,
  'webdav-cloud-relay-transport-controlled-apply', 'reserved controlled gate constant');

const hashA = 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85';
const validRequest = Object.freeze({
  schema: 'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-request.v1',
  dryRun: true,
  apply: false,
  gate: 'fullbundle-v2-transport-envelope-preflight-evaluate',
  payloadSchema: 'h2o.studio.fullBundle.v2',
  candidatePayloadHash: hashA,
  checksumHash: hashA,
  expectedBindingProjectionHash: hashA,
  expectedBindingProjectionCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  privacy: { mode: 'hash-only' },
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
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    a950DocumentedDebtQuarantined: true,
  },
  safety: {
    a950DocumentedDebtQuarantined: true,
    a950LeaksIntoExportablePayload: false,
    cleanupAuthority: false,
    mutateA950: false,
  },
  transport: {
    writeWebDAV: false,
    writeCloud: false,
    enqueueRelay: false,
    touchChatSavingCAS: false,
    writeFiles: false,
    startFullBundleV3: false,
  },
});

const good = api.evaluateFullBundleV2TransportEnvelopePreflight(validRequest);
assert.equal(good.ok, true, 'valid preflight ok');
assert.equal(good.status, 'fullbundle-v2-transport-envelope-preflight-ready', 'valid status');
assert.equal(good.fullBundleV2EnvelopePreflight, true, 'preflight flag true');
assert.equal(good.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(good.fullBundleV3Required, false, 'fullBundle.v3 not required');
assert.equal(good.payloadUnmodified, true, 'payload unmodified');
assert.equal(good.writesWebDAV, false, 'no WebDAV write');
assert.equal(good.writesCloud, false, 'no cloud write');
assert.equal(good.writesRelay, false, 'no relay write');
assert.equal(good.enqueuesRelay, false, 'no relay enqueue');
assert.equal(good.writesCAS, false, 'no CAS write');
assert.equal(good.writesFiles, false, 'no file write');
assert.equal(good.mutatesExportState, false, 'no export state mutation');
assert.equal(good.mintsExportId, false, 'no export id mint');
assert.equal(good.burnsSequence, false, 'no sequence burn');
assert.equal(good.productSyncReady, false, 'productSyncReady false');
assert.equal(good.transportReady, false, 'transportReady false');
assert.equal(good.localExportableSyncReady, true, 'localExportable true');
assert.equal(good.localExportableSyncReadyIsAuthorization, false, 'localExportable not transport authorization');
assert.equal(good.a950DocumentedDebtQuarantined, true, 'a950 quarantined');
assert.equal(good.a950LeaksIntoExportablePayload, false, 'a950 does not leak');
assert.equal(good.privacy.hashOnly, true, 'privacy hash-only');
assert.equal(good.privacy.rawPrivateFieldsLogged, false, 'no raw private fields');
assert.equal(good.blockers.length, 0, 'no blockers');

function expectBlock(label, patch, blocker) {
  const result = api.evaluateFullBundleV2TransportEnvelopePreflight({ ...validRequest, ...patch });
  assert.equal(result.ok, false, `${label}: expected block`);
  assert.ok(result.blockers.includes(blocker), `${label}: expected ${blocker}, got ${result.blockers.join(',')}`);
  assert.equal(result.writesWebDAV, false, `${label}: no WebDAV write`);
  assert.equal(result.writesRelay, false, `${label}: no relay write`);
  assert.equal(result.enqueuesRelay, false, `${label}: no relay enqueue`);
  assert.equal(result.writesCAS, false, `${label}: no CAS write`);
  assert.equal(result.writesFiles, false, `${label}: no file write`);
  assert.equal(result.mutatesExportState, false, `${label}: no export mutation`);
  assert.equal(result.mintsExportId, false, `${label}: no export id mint`);
  assert.equal(result.burnsSequence, false, `${label}: no sequence burn`);
  assert.equal(result.productSyncReady, false, `${label}: productSyncReady false`);
  assert.equal(result.transportReady, false, `${label}: transportReady false`);
}

expectBlock('missing gate', { gate: '' }, 'fullbundle-v2-envelope-gate-missing');
expectBlock('wrong gate', { gate: 'wrong' }, 'fullbundle-v2-envelope-gate-invalid');
expectBlock('dryRun false', { dryRun: false }, 'fullbundle-v2-envelope-dry-run-required');
expectBlock('apply true', { apply: true }, 'fullbundle-v2-envelope-apply-forbidden');
expectBlock('schema mismatch', { payloadSchema: 'h2o.studio.fullBundle.v3' }, 'fullbundle-v2-envelope-schema-mismatch');
expectBlock('checksum mismatch', { checksumHash: 'sha256:' + 'b'.repeat(64) }, 'fullbundle-v2-envelope-checksum-mismatch');
expectBlock('projection count mismatch', {
  fullBundleV2BindingProjectionCount: 11,
}, 'fullbundle-v2-envelope-projection-count-mismatch');
expectBlock('private raw field', { rawChatTitle: 'private' }, 'fullbundle-v2-envelope-private-input-rejected');
expectBlock('sequence burn', { sequence: { mintNewExport: false, burnSequence: true, requireExistingOnly: true } },
  'fullbundle-v2-envelope-sequence-mismatch');
expectBlock('peer ambiguity', { target: { peerTargetHash: 'sha256:' + 'c'.repeat(64), ambiguous: true } },
  'fullbundle-v2-envelope-peer-target-ambiguous');
expectBlock('fullBundle v3 requested', { startFullBundleV3: true }, 'fullbundle-v2-envelope-fullbundle-v3-forbidden');
expectBlock('payload mutation', { mutatePayload: true }, 'fullbundle-v2-envelope-payload-mutation-forbidden');
expectBlock('export mutation', { mintExportId: true }, 'fullbundle-v2-envelope-export-mutation-forbidden');
expectBlock('webdav write', { writeWebDAV: true }, 'fullbundle-v2-envelope-webdav-cloud-write-forbidden');
expectBlock('relay enqueue', { enqueueRelay: true }, 'fullbundle-v2-envelope-relay-enqueue-forbidden');
expectBlock('CAS write', { writeCAS: true }, 'fullbundle-v2-envelope-cas-write-forbidden');
expectBlock('file write', { writeFiles: true }, 'fullbundle-v2-envelope-file-write-forbidden');
expectBlock('a950 leakage', { a950LeaksIntoExportablePayload: true }, 'fullbundle-v2-envelope-a950-leakage-blocked');
expectBlock('a950 missing quarantine', {
  readiness: {
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
  },
  safety: {
    a950LeaksIntoExportablePayload: false,
    cleanupAuthority: false,
    mutateA950: false,
  },
}, 'fullbundle-v2-envelope-a950-leakage-blocked');
expectBlock('productSyncReady mismatch', {
  readiness: { ...validRequest.readiness, productSyncReady: true },
}, 'fullbundle-v2-envelope-product-sync-ready-mismatch');
expectBlock('transportReady mismatch', {
  readiness: { ...validRequest.readiness, transportReady: true },
}, 'fullbundle-v2-envelope-transport-ready-mismatch');
expectBlock('localExportable mismatch', {
  readiness: { ...validRequest.readiness, localExportableSyncReady: false },
}, 'fullbundle-v2-envelope-local-exportable-not-ready');
expectBlock('transport eligibility missing', {
  readiness: { ...validRequest.readiness, transportEligibilityFromLocalExportableReady: false },
}, 'fullbundle-v2-envelope-transport-eligibility-missing');
expectBlock('cleanup authority', { safety: { ...validRequest.safety, cleanupAuthority: true } },
  'fullbundle-v2-envelope-cleanup-authority-forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.fullbundle-v2-transport-envelope-preflight-implementation.validator.v1',
  evidence: evidencePath,
  verdict: 'FULLBUNDLE_V2_TRANSPORT_ENVELOPE_PREFLIGHT_IMPLEMENTED_ZERO_WRITE',
  apiExposed: true,
  fullBundleV3Started: false,
  payloadUnmodified: true,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-fullbundle-v2-transport-envelope-preflight-implementation');
