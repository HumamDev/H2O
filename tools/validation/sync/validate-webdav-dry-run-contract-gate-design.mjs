#!/usr/bin/env node
//
// WebDAV dry-run contract / future gate design validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/webdav-dry-run-contract-gate-design.md';
const sourceInventoryPath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
const gateDesignPath = 'release-evidence/2026-07-01/transport-readiness-evaluation-gate-design.md';
const policyForkPath = 'release-evidence/2026-07-01/operational5-global-readiness-policy-fork-after-a950.md';
const finalRollupPath = 'release-evidence/2026-07-01/operational5-final-rollup-local-exportable-ready-global-blocked.md';
const localCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoExportPath = 'src-surfaces-base/studio/sync/auto-export.tauri.js';
const relayBrokerPath = 'src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js';
const executeResumePath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';
const remoteProjectorPath = 'src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js';
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

const evidence = read(evidencePath);
const flat = compact(evidence);
const sourceInventory = read(sourceInventoryPath);
const gateDesign = read(gateDesignPath);
const policyFork = read(policyForkPath);
const finalRollup = read(finalRollupPath);
const localCloseout = read(localCloseoutPath);
const foldersStore = read(foldersStorePath);
const webdavGates = read(webdavGatesPath);
const exportBundle = read(exportBundlePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const autoExport = read(autoExportPath);
const relayBroker = read(relayBrokerPath);
const executeResume = read(executeResumePath);
const remoteProjector = read(remoteProjectorPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'WEBDAV DRY-RUN CONTRACT DESIGNED - NON-WRITING, NON-STARTING, AND NOT TRANSPORT READY',
  '35607afcaca0263c2105e98e13b5d20ea08e37e9',
  'c6d5eafe1b164570230088380377650467c028e1',
  'b66efe02f419e3a85807f9a57a635c095fe702d9',
  '16853425',
  '82cf4aba',
  '`localExportableSyncReady:true`',
  '`transportEligibilityFromLocalExportableReady:true` is candidate-only',
  '`transportReadinessEvaluationAllowed:true` is non-writing and non-starting',
  '`productSyncReady:false`',
  '`transportReady:false`',
  'WebDAV/cloud/relay blocked',
  '`fullBundle.v3` not started',
  'Chat Saving CAS blocked/deferred',
  'H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun(request)',
  'webdav-transport-readiness-dry-run-evaluate',
  'webdav-cloud-relay-transport-controlled-apply',
  'The dry-run gate is not a write gate',
  'schema:"h2o.studio.transport.webdav-readiness-dry-run-request.v1"',
  '`dryRun:true`',
  '`apply:false`',
  '`gate:"webdav-transport-readiness-dry-run-evaluate"`',
  '`privacyMode:"hash-only"`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`localExportableSyncReady:true`',
  '`chatSavingCasBlocked:true`',
  '`fullBundleV3Started:false`',
  'status:"webdav-transport-dry-run-ready"',
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
  '`candidatePayloadHash:"sha256:<64 hex>"`',
  '`privacy:{redacted:true,hashOnly:true,rawPrivateFieldsLogged:false}`',
  '`noCleanupAuthority:true`',
  'missing gate -> `webdav-dry-run-gate-missing`',
  '`dryRun:false` -> `webdav-dry-run-required`',
  '`apply:true` -> `webdav-dry-run-apply-forbidden`',
  '`productSyncReady` not exactly false -> `webdav-product-sync-ready-mismatch`',
  '`transportReady` not exactly false -> `webdav-transport-ready-mismatch`',
  'privacy/hash-only violation -> `webdav-private-input-rejected`',
  'missing or malformed checksum/hash -> `webdav-checksum-required`',
  'sequence regression or unintended sequence mint -> `webdav-sequence-regression`',
  'peer target ambiguity -> `webdav-peer-target-ambiguous`',
  'Chat Saving CAS boundary violation -> `webdav-chat-saving-cas-boundary-violation`',
  'cleanup or a950 mutation attempted -> `webdav-cleanup-authority-forbidden`',
  'normalizeFlags(...)',
  'evaluateGuards(...)',
  'buildDryRunManifest(...)',
  'dryRun(...)',
  'diagnose(...)',
  'diagnoseFullBundleV2ReadonlyProjection(...)',
  'exportLatestSyncBundle(...)',
  'recordExportEventSafely(...)',
  'fsWriteTextFile(...)',
  'fsRename(...)',
  'writePeerTransportMirrorSafely(...)',
  'dispatchExecuteRelay(...)',
  'execute-resume-on-boot.tauri.js',
  'remote-envelope-projector.tauri.js',
  'Implement `evaluateTransportReadinessDryRun(...)`, still no writes',
  'Controlled transport implementation only after explicit approval and a separate write gate',
  'WebDAV/cloud/relay cannot start now',
  '`productSyncReady:false` and `transportReady:false` remain authoritative',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'transportReady:true is approved',
  'productSyncReady:true is approved',
  'WebDAV/cloud/relay can start now',
  'fullBundle.v3 can start now',
  'Chat Saving CAS can start now',
  'cleanup apply approved',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(sourceInventory, 'TRANSPORT SOURCE INVENTORY COMPLETE', 'source inventory respected');
assertIncludes(sourceInventory, 'No current Operational.5 path starts WebDAV/cloud/relay', 'source inventory no-start respected');
assertIncludes(sourceInventory, 'Future WebDAV Dry-Run Contract Must Prove', 'source inventory guard list respected');
assertIncludes(gateDesign, 'TRANSPORT READINESS EVALUATION GATE DESIGNED', 'transport gate design respected');
assertIncludes(gateDesign, '`transportWriteAuthorized:false`', 'gate design remains non-writing');
assertIncludes(policyFork, 'POLICY OPTION 2 SELECTED', 'policy fork respected');
assertIncludes(finalRollup, 'Do NOT start transport from `localExportableSyncReady`', 'local exportable not transport authority');
assertIncludes(localCloseout, '`localExportableSyncReady:true`', 'local exportable true preserved');
assertIncludes(localCloseout, '`transportReady:false`', 'transport false preserved');

function validateDryRunRequest(input) {
  const blockers = [];
  const hash = /^sha256:[0-9a-f]{64}$/i;
  if (!input.gate) blockers.push('webdav-dry-run-gate-missing');
  else if (input.gate !== 'webdav-transport-readiness-dry-run-evaluate') blockers.push('webdav-dry-run-gate-invalid');
  if (input.dryRun !== true) blockers.push('webdav-dry-run-required');
  if (input.apply === true) blockers.push('webdav-dry-run-apply-forbidden');
  if (input.productSyncReady !== false) blockers.push('webdav-product-sync-ready-mismatch');
  if (input.transportReady !== false) blockers.push('webdav-transport-ready-mismatch');
  if (input.localExportableSyncReady !== true) blockers.push('webdav-local-exportable-not-ready');
  if (input.transportEligibilityFromLocalExportableReady !== true) blockers.push('webdav-transport-eligibility-missing');
  if (input.privacyMode !== 'hash-only' || input.rawPrivateFieldsLogged === true) blockers.push('webdav-private-input-rejected');
  if (!hash.test(String(input.expectedBundleHash || input.expectedContentSha256 || ''))) blockers.push('webdav-checksum-required');
  if (input.sequenceRegression === true) blockers.push('webdav-sequence-regression');
  if (input.exportIdMinted === true) blockers.push('webdav-export-id-minted-in-dry-run');
  if (!input.peerTargetHash && !input.localMockTarget) blockers.push('webdav-peer-target-ambiguous');
  if (input.remoteWriteAttempted === true) blockers.push('webdav-dry-run-remote-write-forbidden');
  if (input.relayEnqueueAttempted === true) blockers.push('webdav-dry-run-relay-enqueue-forbidden');
  if (input.fullBundleV3Started === true) blockers.push('webdav-fullbundle-v3-start-forbidden');
  if (input.chatSavingCasTouched === true) blockers.push('webdav-chat-saving-cas-boundary-violation');
  if (input.cleanupAuthorityIntroduced === true || input.a950MutationAttempted === true) blockers.push('webdav-cleanup-authority-forbidden');
  return {
    ok: blockers.length === 0,
    status: blockers.length === 0 ? 'webdav-transport-dry-run-ready' : 'blocked-webdav-transport-dry-run',
    blockers,
    writesData: false,
    writesWebDAV: false,
    writesRelay: false,
    writesCAS: false,
    fullBundleV3Started: false,
    productSyncReady: false,
    transportReady: false,
  };
}

const good = validateDryRunRequest({
  dryRun: true,
  apply: false,
  gate: 'webdav-transport-readiness-dry-run-evaluate',
  productSyncReady: false,
  transportReady: false,
  localExportableSyncReady: true,
  transportEligibilityFromLocalExportableReady: true,
  privacyMode: 'hash-only',
  expectedBundleHash: 'sha256:' + 'a'.repeat(64),
  peerTargetHash: 'sha256:' + 'b'.repeat(64),
  fullBundleV3Started: false,
  chatSavingCasTouched: false,
});
assert.equal(good.ok, true, 'valid dry-run request should be ready');
assert.equal(good.status, 'webdav-transport-dry-run-ready', 'valid dry-run status');
assert.equal(good.writesWebDAV, false, 'valid dry-run writes no WebDAV');
assert.equal(good.transportReady, false, 'valid dry-run is not transport ready');

for (const [label, patch, expected] of [
  ['missing gate', { gate: '' }, 'webdav-dry-run-gate-missing'],
  ['wrong gate', { gate: 'webdav-cloud-relay-transport-controlled-apply' }, 'webdav-dry-run-gate-invalid'],
  ['dryRun false', { dryRun: false }, 'webdav-dry-run-required'],
  ['apply true', { apply: true }, 'webdav-dry-run-apply-forbidden'],
  ['productSyncReady mismatch', { productSyncReady: true }, 'webdav-product-sync-ready-mismatch'],
  ['transportReady mismatch', { transportReady: true }, 'webdav-transport-ready-mismatch'],
  ['privacy violation', { rawPrivateFieldsLogged: true }, 'webdav-private-input-rejected'],
  ['checksum missing', { expectedBundleHash: '' }, 'webdav-checksum-required'],
  ['peer ambiguous', { peerTargetHash: '', localMockTarget: false }, 'webdav-peer-target-ambiguous'],
  ['relay enqueue', { relayEnqueueAttempted: true }, 'webdav-dry-run-relay-enqueue-forbidden'],
  ['CAS touched', { chatSavingCasTouched: true }, 'webdav-chat-saving-cas-boundary-violation'],
]) {
  const result = validateDryRunRequest(Object.assign({
    dryRun: true,
    apply: false,
    gate: 'webdav-transport-readiness-dry-run-evaluate',
    productSyncReady: false,
    transportReady: false,
    localExportableSyncReady: true,
    transportEligibilityFromLocalExportableReady: true,
    privacyMode: 'hash-only',
    expectedBundleHash: 'sha256:' + 'c'.repeat(64),
    peerTargetHash: 'sha256:' + 'd'.repeat(64),
    fullBundleV3Started: false,
    chatSavingCasTouched: false,
  }, patch));
  assert.equal(result.ok, false, `${label} must block`);
  assert.ok(result.blockers.includes(expected), `${label} must emit ${expected}`);
}

assertIncludes(webdavGates, 'Disabled-by-default guard and manifest evaluator only', 'WebDAV gate remains dry-run only');
assertIncludes(webdavGates, 'dryRunOnly: true', 'WebDAV dryRunOnly source anchor');
assertIncludes(webdavGates, 'remoteFilesWritten: false', 'WebDAV no remote files written source anchor');
assertIncludes(webdavGates, 'webdavWritesEnabled: false', 'WebDAV writes disabled source anchor');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'productSyncReady false guard retained');
assertIncludes(webdavGates, 'DEV_ONLY_WRITE_FLAG', 'dev-only write flag guard retained');

assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)', 'local exportable readiness exists');
assertIncludes(foldersStore, 'readOnly: true', 'local exportable readiness read-only');
assertIncludes(foldersStore, 'transportReady: false', 'local exportable readiness keeps transport false');
assertIncludes(foldersStore, 'noCleanupAuthority: true', 'local exportable readiness grants no cleanup authority');

assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'fullBundle.v2 read-only diagnostic exists');
assertIncludes(exportBundle, 'writesTransport: false', 'fullBundle.v2 diagnostic writes no transport');
assertIncludes(exportBundle, 'noExportLatestSyncBundleCall: true', 'fullBundle.v2 diagnostic does not call local export');
assertIncludes(exportBundle, 'async function exportLatestSyncBundle(options)', 'local export guard point exists');
assertIncludes(exportBundle, 'fsWriteTextFile(tmpPath, text, fileOptions)', 'local file write guard point exists');
assertIncludes(exportBundle, 'writePeerTransportMirrorSafely', 'peer mirror guard point exists');

assertIncludes(autoExport, 'disabled by default', 'auto-export disabled by default retained');
assertIncludes(relayBroker, 'async function dispatchExecuteRelay(envelope, options)', 'relay broker dispatch guard point exists');
assertIncludes(relayBroker, 'requiresRelay !== true', 'relay explicit profile guard exists');
assertIncludes(relayBroker, 'relayOutboxTouched = true', 'relay outbox write-capable source identified');
assertIncludes(executeResume, "if (action === 'dispatch-relay')", 'boot resume relay classification identified');
assertIncludes(remoteProjector, 'read-only projection over accepted relay inbox rows', 'remote projector remains read-only');

assertIncludes(folderSync, "webdav: 'deferred'", 'Desktop folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'Chrome/MV3 folder import WebDAV deferred');
assertIncludes(chatSavingBoundary, 'CAS-over-transport lane', 'Chat Saving CAS boundary retained');
assertIncludes(chatSavingBoundary, 'PREMATURE_TRANSPORT_PATTERNS', 'Chat Saving transport block patterns retained');

const runtimeCombined = [
  foldersStore,
  webdavGates,
  exportBundle,
  folderSync,
  folderImport,
  autoExport,
  relayBroker,
  executeResume,
  remoteProjector,
].join('\n');
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not flip true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport-readiness.webdav-dry-run-contract-gate-design.validator.v1',
  evidence: evidencePath,
  verdict: 'WEBDAV_DRY_RUN_CONTRACT_DESIGNED_NON_WRITING',
  recommendedApi: 'H2O.Studio.sync.webdavTransportGates.evaluateTransportReadinessDryRun',
  recommendedDryRunGate: 'webdav-transport-readiness-dry-run-evaluate',
  reservedFutureControlledGate: 'webdav-cloud-relay-transport-controlled-apply',
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  cleanupAuthorityIntroduced: false,
}, null, 2));
console.log('PASS validate-webdav-dry-run-contract-gate-design');
