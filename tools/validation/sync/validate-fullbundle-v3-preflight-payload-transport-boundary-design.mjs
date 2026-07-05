#!/usr/bin/env node
//
// fullBundle.v3 preflight / payload transport boundary design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/fullbundle-v3-preflight-payload-transport-boundary-design.md';
const relayCloseoutPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-closeout.md';
const relayContractFixPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-live-contract-fix.md';
const relayImplementationPath = 'release-evidence/2026-07-01/relay-idempotency-restart-proof-harness-implementation.md';
const webdavCloseoutPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-closeout.md';
const webdavContractFixPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-live-contract-fix.md';
const webdavImplementationPath = 'release-evidence/2026-07-01/webdav-transport-readiness-dry-run-implementation.md';
const sourceInventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const relayHarnessPath = 'src-surfaces-base/studio/sync/relay-idempotency-restart-proof-harness.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';
const chatSavingContractPath = 'release-evidence/2026-06-30/saved-chat-archive-phase-l0-package-cloud-sync-contract.md';

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
const relayCloseout = read(relayCloseoutPath);
const relayContractFix = read(relayContractFixPath);
const relayImplementation = read(relayImplementationPath);
const webdavCloseout = read(webdavCloseoutPath);
const webdavContractFix = read(webdavContractFixPath);
const webdavImplementation = read(webdavImplementationPath);
const sourceInventory = read(sourceInventoryPath);
const exportBundle = read(exportBundlePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const relayHarness = read(relayHarnessPath);
const foldersStore = read(foldersStorePath);
const chatSavingBoundary = read(chatSavingBoundaryPath);
const chatSavingContract = read(chatSavingContractPath);

for (const token of [
  'FULLBUNDLE V3 PREFLIGHT BOUNDARY DESIGNED - V3 DEFERRED / V2 TRANSPORT ENVELOPE PREFLIGHT NEXT',
  'f8cfcff9eb18437134df4470c033f37d3cecc2fd',
  '2d4091d7f2757879e7b79f66e97caaf46c0e92ae',
  'a8779f24ee8f043745ff3fe969d542bcf8bf2839',
  '7dd54b42b5df25d76fd4a308fe1f4c7a1a694ba2',
  'd28cf0b8beb857c65ec1251030087c5229241477',
  'f776e66d595de7ac80746fcd7e337d5452c2e26e',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  "`FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'`",
  'diagnoseFullBundleV2ReadonlyProjection',
  'exportLatestSyncBundle',
  'writePeerTransportMirrorSafely',
  '`fullBundle.v3` is **not required before the next controlled WebDAV/cloud/relay implementation preflight**',
  '**minimal v2 transport-envelope preflight**',
  'must not alter the `fullBundle.v2` payload schema',
  'must not mint `fullBundle.v3`',
  'fullbundle-v2-transport-envelope-preflight-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  '`fullBundleV3Preflight:true`',
  '`selectedPayloadBoundary:"fullBundle.v2-transport-envelope"`',
  '`fullBundleV3RequiredNow:false`',
  '`fullBundleV3Deferred:true`',
  '`fullBundleV3Started:false`',
  '`mintsExportId:false`',
  '`burnsSequence:false`',
  '`mutatesExportState:false`',
  '`writesWebDAV:false`',
  '`writesCloud:false`',
  '`writesRelay:false`',
  '`enqueuesRelay:false`',
  '`writesCAS:false`',
  '`writesFiles:false`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`localExportableSyncReady:true`',
  '`a950DocumentedDebtQuarantined:true`',
  '`a950ExcludedFromExportablePayload:true`',
  '`chatSavingCasBlocked:true`',
  '`privacy.hashOnly:true`',
  '`privacy.rawPrivateFieldsLogged:false`',
  'does **not** mean `fullBundle.v3` was minted or started',
  'a950 does not leak into any transport envelope as an active dangling binding',
  'Chat Saving WebDAV/cloud/archive CAS remains a separate blocked/deferred lane',
  'schema mismatch',
  'checksum mismatch',
  'sequence/export-id ambiguity',
  'a950 leakage into exportable payload',
  'raw private field logging',
  'CAS boundary violation',
  'WebDAV/relay write attempt',
  'relay enqueue request',
  'file write request',
  'export-state mutation request',
  'export id mint request',
  'sequence burn request',
  '`fullBundle.v3` mint/start request',
  '`productSyncReady` mismatch',
  '`transportReady` mismatch',
  'Implement the `fullBundle.v2` transport-envelope preflight API, still non-writing',
  'Re-evaluate whether `fullBundle.v3` is still needed',
  'WebDAV/cloud/relay cannot start now',
  'No relay enqueue is authorized now',
  'No real transport is implemented by this design',
  '`fullBundle.v3` remains not-started',
  'No export id is minted',
  'No sequence is burned',
  'No export state is mutated',
  'No cleanup/mutation authority is introduced',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'fullBundle.v3 is required now',
  'fullBundle.v3 can start now',
  'WebDAV/cloud/relay can start now',
  'relay enqueue is authorized now:true',
  'transportReady:true is approved',
  'productSyncReady:true is approved',
  'cleanup authority is introduced and approved',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(relayCloseout, 'RELAY IDEMPOTENCY RESTART PROOF LIVE PROVEN - ZERO WRITE',
  'relay live closeout respected');
assertIncludes(relayCloseout, 'duplicateReplayZeroWrite:true', 'relay duplicate zero-write respected');
assertIncludes(relayCloseout, 'restartFailClosed:true', 'relay restart fail-closed respected');
assertIncludes(relayContractFix, 'RELAY IDEMPOTENCY RESTART PROOF LIVE CONTRACT FIXED - ZERO WRITE',
  'relay live contract fix respected');
assertIncludes(relayImplementation, 'RELAY IDEMPOTENCY RESTART PROOF HARNESS IMPLEMENTED - NON-WRITING',
  'relay implementation respected');
assertIncludes(webdavCloseout, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE PROOF PASSED - ZERO WRITE',
  'WebDAV live closeout respected');
assertIncludes(webdavCloseout, 'writesWebDAV:false', 'WebDAV closeout no write respected');
assertIncludes(webdavContractFix, 'WEBDAV TRANSPORT READINESS DRY-RUN LIVE CONTRACT FIXED - ZERO WRITE',
  'WebDAV live contract fix respected');
assertIncludes(webdavImplementation, 'WEBDAV TRANSPORT READINESS DRY-RUN IMPLEMENTED - ZERO WRITE',
  'WebDAV implementation respected');
assertIncludes(sourceInventory, 'TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT',
  'source inventory respected');
assertIncludes(sourceInventory, 'No `fullBundle.v3` mint/start path is active',
  'source inventory fullBundle.v3 block respected');

assertIncludes(exportBundle, "var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'export bundle schema remains v2');
assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'read-only fullBundle.v2 diagnostic exists');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'read-only fullBundle.v2 diagnostic marker exists');
assertIncludes(exportBundle, 'writesFiles: false', 'read-only diagnostic writes no files');
assertIncludes(exportBundle, 'writesTransport: false', 'read-only diagnostic writes no transport');
assertIncludes(exportBundle, 'noExportLatestSyncBundleCall: true', 'diagnostic does not call exportLatest');
assertIncludes(exportBundle, 'noSequenceMutation: true', 'diagnostic does not burn sequence');
assertIncludes(exportBundle, 'noWebdavWrite: true', 'diagnostic writes no WebDAV');
assertIncludes(exportBundle, 'noRelayWrite: true', 'diagnostic writes no relay');
assertIncludes(exportBundle, 'async function exportLatestSyncBundle(options)', 'local export writer remains distinct');
assertIncludes(exportBundle, 'writePeerTransportMirrorSafely', 'peer mirror remains a guard point');
assertNotIncludes(exportBundle, 'h2o.studio.fullBundle.v3', 'export bundle must not introduce v3 schema');

assertIncludes(folderSync, "var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder-sync schema remains v2');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder-sync WebDAV deferred');
assertIncludes(folderImport, "var FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'", 'folder-import schema remains v2');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder-import WebDAV deferred');
assertIncludes(webdavGates, 'webdav-cloud-relay-transport-controlled-apply', 'reserved controlled gate remains source-visible');
assertIncludes(webdavGates, 'fullBundleV3Started: false', 'WebDAV dry-run keeps v3 stopped');
assertIncludes(webdavGates, 'mintsExportId: false', 'WebDAV dry-run mints no export id');
assertIncludes(webdavGates, 'burnsSequence: false', 'WebDAV dry-run burns no sequence');
assertIncludes(webdavGates, 'mutatesExportState: false', 'WebDAV dry-run mutates no export state');
assertIncludes(webdavGates, 'writesWebDAV: false', 'WebDAV dry-run writes no WebDAV');
assertIncludes(webdavGates, 'writesRelay: false', 'WebDAV dry-run writes no relay');
assertIncludes(webdavGates, 'writesCAS: false', 'WebDAV dry-run writes no CAS');
assertIncludes(webdavGates, 'productSyncReady: false', 'WebDAV dry-run keeps productSyncReady false');
assertIncludes(webdavGates, 'transportReady: false', 'WebDAV dry-run keeps transportReady false');

assertIncludes(relayHarness, 'writesRelay: false', 'relay harness writes no relay');
assertIncludes(relayHarness, 'enqueuesRelay: false', 'relay harness enqueues no relay');
assertIncludes(relayHarness, 'fullBundleV3Started: false', 'relay harness starts no v3');
assertIncludes(relayHarness, 'mintsExportId: false', 'relay harness mints no export id');
assertIncludes(relayHarness, 'burnsSequence: false', 'relay harness burns no sequence');
assertIncludes(relayHarness, 'mutatesExportState: false', 'relay harness mutates no export state');
assertIncludes(relayHarness, 'productSyncReady: false', 'relay harness keeps productSyncReady false');
assertIncludes(relayHarness, 'transportReady: false', 'relay harness keeps transportReady false');

assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt source-visible');
assertIncludes(foldersStore, 'result.localExportableSyncReady = localReady', 'local exportable readiness remains computed');
assertIncludes(foldersStore, 'noCleanupAuthority: true', 'no cleanup authority retained');
assertIncludes(foldersStore, 'transportReady: false', 'local exportable readiness does not set transportReady');
assertIncludes(foldersStore, "result['webdavCloud' + 'RelayBlocked'] = true", 'local exportable readiness keeps WebDAV blocked');

assertIncludes(chatSavingBoundary, 'PREMATURE_TRANSPORT_PATTERNS', 'Chat Saving premature transport blocks retained');
assertIncludes(chatSavingBoundary, 'archiveCloudSync', 'Chat Saving cloud sync namespace remains blocked');
assertIncludes(chatSavingContract, 'ARCHIVE PACKAGE CLOUD SYNC - NOT IMPLEMENTED', 'Chat Saving cloud contract remains not implemented');
assertIncludes(chatSavingContract, 'Cloud/WebDAV is an untrusted transport boundary', 'Chat Saving CAS transport boundary remains separate');

const runtimeCombined = [
  exportBundle,
  folderSync,
  folderImport,
  webdavGates,
  relayHarness,
  foldersStore,
].join('\n');

assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'runtime source must not introduce fullBundle.v3');
assert.ok(!runtimeCombined.includes('productSyncReady: true') && !runtimeCombined.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true');
assert.ok(!runtimeCombined.includes('transportReady: true') && !runtimeCombined.includes('transportReady = true'),
  'transportReady must not be flipped true');

function evaluatePreflightBoundary(state) {
  const localExportableReady = state.localExportableSyncReady === true;
  const productSyncReady = false;
  const transportReady = false;
  const a950Quarantined = state.a950DocumentedDebtQuarantined === true;
  const exportablePayloadClean = state.a950ExcludedFromExportablePayload === true &&
    state.exportableCanonicalBindingCount === state.fullBundleV2BindingProjectionCount;
  return {
    fullBundleV3Preflight: true,
    selectedPayloadBoundary: 'fullBundle.v2-transport-envelope',
    fullBundleV3RequiredNow: false,
    fullBundleV3Deferred: true,
    fullBundleV3Started: false,
    mintsExportId: false,
    burnsSequence: false,
    mutatesExportState: false,
    writesWebDAV: false,
    writesCloud: false,
    writesRelay: false,
    enqueuesRelay: false,
    writesCAS: false,
    writesFiles: false,
    productSyncReady,
    transportReady,
    localExportableSyncReady: localExportableReady,
    a950DocumentedDebtQuarantined: a950Quarantined,
    a950ExcludedFromExportablePayload: state.a950ExcludedFromExportablePayload === true,
    chatSavingCasBlocked: true,
    privacy: {
      hashOnly: true,
      rawPrivateFieldsLogged: false,
    },
    preflightReady: localExportableReady && exportablePayloadClean && a950Quarantined,
  };
}

const modeled = evaluatePreflightBoundary({
  localExportableSyncReady: true,
  a950DocumentedDebtQuarantined: true,
  a950ExcludedFromExportablePayload: true,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
});

assert.equal(modeled.preflightReady, true, 'v2 transport-envelope boundary can be preflight-ready');
assert.equal(modeled.fullBundleV3RequiredNow, false, 'fullBundle.v3 not required now');
assert.equal(modeled.fullBundleV3Deferred, true, 'fullBundle.v3 deferred');
assert.equal(modeled.fullBundleV3Started, false, 'fullBundle.v3 not started');
assert.equal(modeled.writesWebDAV, false, 'no WebDAV write');
assert.equal(modeled.writesRelay, false, 'no relay write');
assert.equal(modeled.enqueuesRelay, false, 'no relay enqueue');
assert.equal(modeled.writesCAS, false, 'no CAS write');
assert.equal(modeled.writesFiles, false, 'no file write');
assert.equal(modeled.mintsExportId, false, 'no export id mint');
assert.equal(modeled.burnsSequence, false, 'no sequence burn');
assert.equal(modeled.mutatesExportState, false, 'no export mutation');
assert.equal(modeled.productSyncReady, false, 'productSyncReady remains false');
assert.equal(modeled.transportReady, false, 'transportReady remains false');

assert.equal(evaluatePreflightBoundary({
  localExportableSyncReady: false,
  a950DocumentedDebtQuarantined: true,
  a950ExcludedFromExportablePayload: true,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
}).preflightReady, false, 'localExportable false blocks preflight readiness');
assert.equal(evaluatePreflightBoundary({
  localExportableSyncReady: true,
  a950DocumentedDebtQuarantined: true,
  a950ExcludedFromExportablePayload: false,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
}).preflightReady, false, 'a950 leakage blocks preflight readiness');
assert.equal(evaluatePreflightBoundary({
  localExportableSyncReady: true,
  a950DocumentedDebtQuarantined: true,
  a950ExcludedFromExportablePayload: true,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 11,
}).preflightReady, false, 'v2 projection mismatch blocks preflight readiness');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport.fullbundle-v3-preflight-payload-transport-boundary-design.validator.v1',
  evidence: evidencePath,
  verdict: 'FULLBUNDLE_V3_PREFLIGHT_BOUNDARY_DESIGNED_V3_DEFERRED_V2_ENVELOPE_NEXT',
  fullBundleV3RequiredNow: false,
  selectedPayloadBoundary: 'fullBundle.v2-transport-envelope',
  fullBundleV3Started: false,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  a950Quarantined: true,
}, null, 2));
console.log('PASS validate-fullbundle-v3-preflight-payload-transport-boundary-design');
