#!/usr/bin/env node
//
// Transport-readiness evaluation gate design validator.
//
// Proves the policy bridge after a950 is respected: local exportable readiness may
// authorize only a non-writing transport-readiness evaluation candidate, while
// productSyncReady/transportReady remain false and WebDAV/cloud/relay/fullBundle.v3,
// Chat Saving CAS, and cleanup authority remain blocked.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/transport-readiness-evaluation-gate-design.md';
const policyForkPath = 'release-evidence/2026-07-01/operational5-global-readiness-policy-fork-after-a950.md';
const a950InvestigationPath = 'release-evidence/2026-07-01/operational5-a950-readonly-investigation.md';
const finalRollupPath = 'release-evidence/2026-07-01/operational5-final-rollup-local-exportable-ready-global-blocked.md';
const localCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
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
const policyFork = read(policyForkPath);
const a950Investigation = read(a950InvestigationPath);
const finalRollup = read(finalRollupPath);
const localCloseout = read(localCloseoutPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const exportBundle = read(exportBundlePath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'TRANSPORT READINESS EVALUATION GATE DESIGNED - EVALUATION ONLY; TRANSPORT NOT STARTED',
  'b66efe02f419e3a85807f9a57a635c095fe702d9',
  'baa7718d',
  '16853425',
  '82cf4aba',
  '9d317664111a8c18e61d237f7aba8a96b86cb723',
  'Option 2',
  '`transportEligibilityFromLocalExportableReady:true`',
  '`localExportableSyncReady:true`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`row:a950a44b859f` remains documented, quarantined raw canonical debt',
  'raw canonical bindings: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` bindings: `12`',
  'undocumented dangling rows: `0`',
  'exportable dangling bindings: `0`',
  '`transportReadinessEvaluationAllowed:true`',
  '`webdavCloudRelayBlocked:true`',
  '`fullBundleV3Started:false`',
  '`chatSavingCasBlocked:true`',
  '`transportWriteAuthorized:false`',
  '`cleanupAuthorityIntroduced:false`',
  'This state is not product readiness, not transport readiness, not WebDAV/cloud/relay authorization',
  'src-surfaces-base/studio/sync/webdav-transport-gates.js',
  'src-surfaces-base/studio/ingestion/export-bundle.tauri.js',
  'src-surfaces-base/studio/sync/folder-sync.tauri.js',
  'src-surfaces-base/studio/sync/folder-import.mv3.js',
  'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs',
  'WebDAV write boundary rules',
  'Relay queue and idempotency rules',
  'Conflict, retry, offline, and restart safety',
  '`fullBundle.v3` start rules',
  'Chat Saving CAS boundary',
  'Privacy/hash-only evidence',
  'Rollback/disable switch',
  'No mutation during evaluation',
  'Transport-readiness evaluation may consume the exportable payload shape only',
  'WebDAV/cloud/relay cannot start now',
  '`productSyncReady` remains `false`',
  'non-writing transport-readiness evaluation lane',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady:true is approved',
  'transportReady:true is approved',
  'WebDAV/cloud/relay can start now',
  'fullBundle.v3 can start now',
  'Chat Saving CAS can start now',
  'cleanup apply approved',
  'row:a950a44b859f was cleaned',
]) {
  assertNotIncludes(flat, forbidden, `evidence forbidden ${forbidden}`);
}

assertIncludes(policyFork, 'POLICY OPTION 2 SELECTED', 'policy bridge respected');
assertIncludes(policyFork, '`transportEligibilityFromLocalExportableReady:true`', 'candidate state came from policy bridge');
assertIncludes(policyFork, '`transportReady:false`', 'policy bridge keeps transportReady false');
assertIncludes(a950Investigation, '`row:a950a44b859f` REMAINS DOCUMENTED, QUARANTINED DEBT', 'a950 debt respected');
assertIncludes(a950Investigation, 'NO NEW STRICT EVIDENCE EXISTS', 'a950 has no new strict evidence');
assertIncludes(finalRollup, 'OPERATIONAL.5 IS AT A STABLE HANDOFF POINT', 'final rollup respected');
assertIncludes(finalRollup, 'Do NOT start transport from `localExportableSyncReady`', 'final rollup blocks direct transport');
assertIncludes(localCloseout, '`localExportableSyncReady:true`', 'local exportable readiness preserved');
assertIncludes(localCloseout, '`transportReady:false`', 'local closeout keeps transportReady false');

function gateDecision(state) {
  const allowed = state.transportEligibilityFromLocalExportableReady === true &&
    state.localExportableSyncReady === true &&
    state.productSyncReady === false &&
    state.transportReady === false &&
    state.documentedDebtRowTokens.includes('row:a950a44b859f') &&
    state.remainingRawCanonicalDebtCount === 1 &&
    state.undocumentedDanglingRows === 0 &&
    state.exportableDanglingBindings === 0 &&
    state.webdavCloudRelayBlocked === true &&
    state.chatSavingCasBlocked === true;

  return {
    transportReadinessEvaluationAllowed: allowed,
    productSyncReady: false,
    transportReady: false,
    webdavCloudRelayBlocked: true,
    fullBundleV3Started: false,
    chatSavingCasBlocked: true,
    transportWriteAuthorized: false,
    cleanupAuthorityIntroduced: false,
  };
}

const decision = gateDecision({
  transportEligibilityFromLocalExportableReady: true,
  localExportableSyncReady: true,
  productSyncReady: false,
  transportReady: false,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  undocumentedDanglingRows: 0,
  exportableDanglingBindings: 0,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
});

assert.equal(decision.transportReadinessEvaluationAllowed, true, 'candidate permits evaluation only');
assert.equal(decision.productSyncReady, false, 'productSyncReady remains false');
assert.equal(decision.transportReady, false, 'transportReady remains false');
assert.equal(decision.webdavCloudRelayBlocked, true, 'WebDAV/cloud/relay remain blocked');
assert.equal(decision.fullBundleV3Started, false, 'fullBundle.v3 remains not started');
assert.equal(decision.chatSavingCasBlocked, true, 'Chat Saving CAS remains blocked');
assert.equal(decision.transportWriteAuthorized, false, 'no transport write authorization introduced');
assert.equal(decision.cleanupAuthorityIntroduced, false, 'no cleanup authority introduced');

for (const bad of [
  { localExportableSyncReady: false },
  { productSyncReady: true },
  { transportReady: true },
  { documentedDebtRowTokens: [] },
  { undocumentedDanglingRows: 1 },
  { exportableDanglingBindings: 1 },
  { webdavCloudRelayBlocked: false },
]) {
  const input = Object.assign({
    transportEligibilityFromLocalExportableReady: true,
    localExportableSyncReady: true,
    productSyncReady: false,
    transportReady: false,
    documentedDebtRowTokens: ['row:a950a44b859f'],
    remainingRawCanonicalDebtCount: 1,
    undocumentedDanglingRows: 0,
    exportableDanglingBindings: 0,
    webdavCloudRelayBlocked: true,
    chatSavingCasBlocked: true,
  }, bad);
  assert.equal(gateDecision(input).transportReadinessEvaluationAllowed, false,
    `bad input must block evaluation candidate: ${JSON.stringify(bad)}`);
}

assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented debt token remains source-enforced');
assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)',
  'local exportable readiness API remains present');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup rules are not weakened');
assertIncludes(foldersStore, "result.status = 'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt'",
  'a950 cleanup/receipt path remains blocked');

assertIncludes(webdavGates, 'dryRunOnly: true', 'WebDAV gate remains dry-run only');
assertIncludes(webdavGates, 'webdavDisabledByDefault: true', 'WebDAV remains disabled by default');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(webdavGates, 'remoteFilesWritten: false', 'WebDAV dry-run reports no remote files written');
assertIncludes(webdavGates, 'webdavWritesEnabled: false', 'WebDAV writes remain disabled');

assertIncludes(exportBundle, 'async function diagnoseFullBundleV2ReadonlyProjection()', 'fullBundle.v2 read-only diagnostic exists');
assertIncludes(exportBundle, 'readOnlyProjection: true', 'fullBundle.v2 diagnostic is read-only');
assertIncludes(exportBundle, 'writesFiles: false', 'fullBundle.v2 diagnostic writes no files');
assertIncludes(exportBundle, 'writesTransport: false', 'fullBundle.v2 diagnostic writes no transport');
assertIncludes(exportBundle, 'noExportLatestSyncBundleCall: true', 'fullBundle.v2 diagnostic does not call disk-writing export');
assertIncludes(exportBundle, 'async function exportLatestSyncBundle(options)', 'disk-writing local export path remains distinct');

const runtimeCombined = `${foldersStore}\n${folderSync}\n${folderImport}\n${webdavGates}`;
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be flipped true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'Desktop folder sync WebDAV remains deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'Chrome/MV3 folder import WebDAV remains deferred');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS remains deferred');
assertIncludes(chatSavingBoundary, 'CAS-over-transport lane', 'Chat Saving CAS boundary remains explicit');
assertIncludes(chatSavingBoundary, 'archive package WebDAV/cloud/network transport', 'Chat Saving transport remains blocked');

console.log(JSON.stringify({
  schema: 'h2o.studio.transport-readiness.evaluation-gate-design.validator.v1',
  evidence: evidencePath,
  verdict: 'TRANSPORT_READINESS_EVALUATION_GATE_DESIGNED_EVALUATION_ONLY',
  transportEligibilityFromLocalExportableReady: true,
  transportReadinessEvaluationAllowed: true,
  localExportableSyncReady: true,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  a950DocumentedDebtVisible: true,
  transportWriteAuthorized: false,
  cleanupAuthorityIntroduced: false,
}, null, 2));
console.log('PASS validate-transport-readiness-evaluation-gate-design');
