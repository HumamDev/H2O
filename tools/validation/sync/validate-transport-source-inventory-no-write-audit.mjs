#!/usr/bin/env node
//
// Transport source inventory / no-write audit validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-source-inventory-no-write-audit.md';
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
const executeLaneUiPath = 'src-surfaces-base/studio/sync/execute/execute-lane-ui.tauri.js';
const executeResumePath = 'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js';
const remoteProjectorPath = 'src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js';
const convergenceProposalPath = 'src-surfaces-base/studio/sync/convergence-proposal-generator.tauri.js';
const convergenceConflictPath = 'src-surfaces-base/studio/sync/convergence-conflict-candidate-generator.tauri.js';
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
const executeLaneUi = read(executeLaneUiPath);
const executeResume = read(executeResumePath);
const remoteProjector = read(remoteProjectorPath);
const convergenceProposal = read(convergenceProposalPath);
const convergenceConflict = read(convergenceConflictPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);
const chatSavingContract = read(chatSavingContractPath);

for (const token of [
  'TRANSPORT SOURCE INVENTORY COMPLETE - NO CURRENT OPERATIONAL.5 PATH STARTS TRANSPORT',
  'c6d5eafe1b164570230088380377650467c028e1',
  'b66efe02f419e3a85807f9a57a635c095fe702d9',
  '16853425',
  '82cf4aba',
  '`transportEligibilityFromLocalExportableReady:true` is only an evaluation candidate',
  '`transportReadinessEvaluationAllowed:true` is non-writing and non-starting',
  '`transportReady:false`',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay blocked',
  '`fullBundle.v3` not started',
  'Chat Saving CAS blocked/deferred',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'src-surfaces-base/studio/ingestion/export-bundle.tauri.js',
  'src-surfaces-base/studio/sync/folder-sync.tauri.js',
  'src-surfaces-base/studio/sync/folder-import.mv3.js',
  'src-surfaces-base/studio/store/folders.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-relay-broker.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-lane-ui.tauri.js',
  'src-surfaces-base/studio/sync/execute/execute-resume-on-boot.tauri.js',
  'src-surfaces-base/studio/sync/remote-envelope-projector.tauri.js',
  'src-surfaces-base/studio/sync/auto-export.tauri.js',
  'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs',
  'No current Operational.5 path starts WebDAV/cloud/relay',
  'No current `localExportableSyncReady` path writes to WebDAV/cloud/relay',
  'No `fullBundle.v3` mint/start path is active',
  'Chat Saving CAS remains blocked/deferred',
  'productSyncReady:false` remains visible and authoritative',
  'Suspicious / Write-Capable Sources To Guard Later',
  'dispatchExecuteRelay(...)',
  'execute-resume-on-boot.tauri.js',
  'Future WebDAV Dry-Run Contract Must Prove',
  'No remote write in dry-run',
  'No relay enqueue in dry-run',
  'No export sequence/exportId burn in dry-run',
  'No `fullBundle.v3` mint/start in dry-run',
  'No Chat Saving CAS package write or read',
  'This audit authorizes only the next WebDAV dry-run contract design slice',
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

assertIncludes(gateDesign, 'TRANSPORT READINESS EVALUATION GATE DESIGNED', 'transport gate design respected');
assertIncludes(gateDesign, '`transportWriteAuthorized:false`', 'gate design authorizes no transport write');
assertIncludes(policyFork, 'POLICY OPTION 2 SELECTED', 'policy fork respected');
assertIncludes(finalRollup, 'Do NOT start transport from `localExportableSyncReady`', 'final rollup direct transport block respected');
assertIncludes(localCloseout, '`localExportableSyncReady:true`', 'local exportable closeout preserved');
assertIncludes(localCloseout, '`transportReady:false`', 'transport remains false in closeout');

assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)', 'local exportable readiness function exists');
assertIncludes(foldersStore, 'readOnly: true', 'local exportable readiness is read-only');
assertIncludes(foldersStore, 'writesData: false', 'local exportable readiness writes no data');
assertIncludes(foldersStore, 'noCleanupAuthority: true', 'local exportable readiness grants no cleanup authority');
assertIncludes(foldersStore, 'noImportExportMutation: true', 'local exportable readiness mutates no import/export state');
assertIncludes(foldersStore, 'transportReady: false', 'local exportable readiness keeps transportReady false');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt remains source visible');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup rules remain unchanged');

assertIncludes(webdavGates, 'Disabled-by-default guard and manifest evaluator only', 'WebDAV source is dry-run gate only');
assertIncludes(webdavGates, 'dryRunOnly: true', 'WebDAV dry-run flag present');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV disabled by default');
assertIncludes(webdavGates, 'remoteFilesWritten: false', 'WebDAV reports no remote file write');
assertIncludes(webdavGates, 'webdavWritesEnabled: false', 'WebDAV writes disabled');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV has productSyncReady false guard');
assertIncludes(webdavGates, 'DEV_ONLY_WRITE_FLAG', 'WebDAV dev-only write flag guard exists');

assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'fullBundle.v2 read-only diagnostic exists');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'fullBundle.v2 diagnostic read-only');
assertIncludes(exportBundle, 'writesFiles: false', 'fullBundle.v2 diagnostic writes no files');
assertIncludes(exportBundle, 'writesTransport: false', 'fullBundle.v2 diagnostic writes no transport');
assertIncludes(exportBundle, 'noExportLatestSyncBundleCall: true', 'read-only diagnostic does not call exportLatest');
assertIncludes(exportBundle, 'noSequenceMutation: true', 'read-only diagnostic burns no sequence');
assertIncludes(exportBundle, 'noWebdavWrite: true', 'read-only diagnostic writes no WebDAV');
assertIncludes(exportBundle, 'noRelayWrite: true', 'read-only diagnostic writes no relay');
assertIncludes(exportBundle, 'async function exportLatestSyncBundle(options)', 'local disk export path identified');
assertIncludes(exportBundle, 'fsWriteTextFile(tmpPath, text, fileOptions)', 'local export file write identified as guard point');
assertIncludes(exportBundle, 'writePeerTransportMirrorSafely', 'peer mirror guard point identified');

assertIncludes(folderSync, "webdav: 'deferred'", 'Desktop folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'Chrome/MV3 folder import WebDAV deferred');
assertIncludes(autoExport, 'disabled by default', 'auto-export disabled by default');
assertIncludes(autoExport, 'exportLatestSyncBundle()', 'auto-export local export dependency identified');

assertIncludes(relayBroker, 'Relay outbox staging only', 'relay broker is outbox staging only');
assertIncludes(relayBroker, 'async function dispatchExecuteRelay(envelope, options)', 'relay dispatch function identified');
assertIncludes(relayBroker, 'requiresRelay !== true', 'relay requires explicit relay profile');
assertIncludes(relayBroker, 'relayOutboxTouched = true', 'relay write-capable outbox touch identified');
assertIncludes(executeLaneUi, 'function summarizeRelay(journalRows)', 'execute lane relay summary exists');
assertIncludes(executeLaneUi, 'typeof H2O.Desktop.Sync.dispatchExecuteRelay', 'execute lane UI detects relay availability only');
assertIncludes(executeResume, "if (action === 'dispatch-relay')", 'resume relay action identified as future guard point');
assertIncludes(executeResume, 'execute-relay-broker-unavailable', 'resume fails closed if relay broker unavailable');
assertIncludes(remoteProjector, 'read-only projection over accepted relay inbox rows', 'remote projector read-only');
assertIncludes(remoteProjector, 'No convergence, apply, proposal generation', 'remote projector no apply/proposal');
assertIncludes(remoteProjector, 'storage mutation, polling', 'remote projector no storage/polling');
assertIncludes(convergenceProposal, 'relay-index-unavailable', 'convergence proposal reads relay index and can block');
assertIncludes(convergenceConflict, 'relay-envelope-blocked', 'convergence conflict classifies blocked relay rows');

assertIncludes(chatSavingBoundary, 'CAS-over-transport lane', 'Chat Saving CAS boundary validator retained');
assertIncludes(chatSavingBoundary, 'PREMATURE_TRANSPORT_PATTERNS', 'Chat Saving transport block patterns retained');
assertIncludes(chatSavingBoundary, 'archiveCloudSync', 'Chat Saving cloud sync namespace remains blocked');
assertIncludes(chatSavingContract, 'ARCHIVE PACKAGE CLOUD SYNC - NOT IMPLEMENTED', 'Chat Saving cloud contract not implemented');
assertIncludes(chatSavingContract, 'Cloud/WebDAV is an untrusted transport boundary', 'Chat Saving cloud transport boundary retained');

const runtimeCombined = [
  foldersStore,
  webdavGates,
  exportBundle,
  folderSync,
  folderImport,
  autoExport,
  relayBroker,
  executeLaneUi,
  executeResume,
  remoteProjector,
  convergenceProposal,
  convergenceConflict,
].join('\n');

assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport-readiness.source-inventory-no-write-audit.validator.v1',
  evidence: evidencePath,
  verdict: 'TRANSPORT_SOURCE_INVENTORY_NO_WRITE_AUDIT_COMPLETE',
  transportReady: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  localExportableSyncReadyReadOnly: true,
  currentOperational5StartsTransport: false,
  writeCapableBlockedSources: [
    'webdav-transport-gates.js',
    'exportLatestSyncBundle',
    'auto-export.tauri.js',
    'execute-relay-broker.tauri.js',
    'execute-resume-on-boot.tauri.js',
  ],
  futureWebdavDryRunContractNext: true,
  cleanupAuthorityIntroduced: false,
}, null, 2));
console.log('PASS validate-transport-source-inventory-no-write-audit');
