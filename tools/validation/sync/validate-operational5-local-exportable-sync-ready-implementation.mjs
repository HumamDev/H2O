#!/usr/bin/env node
//
// Operational.5 - localExportableSyncReady implementation validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-implementation.md';
const designPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-design.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const exportBundlePath = 'src-surfaces-base/studio/ingestion/export-bundle.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
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
const design = read(designPath);
const a950Policy = read(a950PolicyPath);
const fddCloseout = read(fddCloseoutPath);
const foldersStore = read(foldersStorePath);
const exportBundle = read(exportBundlePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'OPERATIONAL.5 LOCAL EXPORTABLE SYNC READY IMPLEMENTED - READ-ONLY DIAGNOSTIC; `productSyncReady:false` REMAINS',
  'src-surfaces-base/studio/store/folders.tauri.js',
  'H2O.Studio.store.folders.operational5LocalExportableSyncReadiness(opts)',
  'h2o.studio.operational5.local-exportable-sync-ready.v1',
  'H2O.Studio.ingestion.diagnoseFullBundleV2ReadonlyProjection()',
  'writesData:false',
  'writesCanonicalState:false',
  'noCleanupAuthority:true',
  'noBindingMutation:true',
  'noFolderMutation:true',
  'noChatMutation:true',
  'noTombstoneMutation:true',
  'noLedgerMutation:true',
  'noImportExportMutation:true',
  'noRenderMirrorWrite:true',
  '`exportableCanonicalBindingCount === fullBundleV2BindingProjectionCount`',
  '`exportableDanglingBindingCount === 0`',
  'every remaining raw dangling row is documented debt',
  'raw canonical debt remains visible in the result',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`webdavCloudRelayBlocked:true`',
  '`chatSavingCasBlocked:true`',
  '`localExportableSyncReady:true`',
  '`rawCanonicalBindingCount:13`',
  '`exportableCanonicalBindingCount:12`',
  '`fullBundleV2BindingProjectionCount:12`',
  '`documentedDebtRowTokens:["row:a950a44b859f"]`',
  '`remainingRawCanonicalDebtCount:1`',
  'row token: `row:a950a44b859f`',
  'chat token: `r:650c3cb39924`',
  'folder token: `r:0226fecaed5b`',
  'Any unknown dangling row keeps `localExportableSyncReady:false`',
  'no cleanup authorization from this flag',
  'no broad text matching',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady flipped',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS started',
  'cleanup apply approved',
  'row:a950a44b859f` was removed',
]) {
  assertNotIncludes(flat, forbidden, `forbidden evidence token ${forbidden}`);
}

assertIncludes(design, 'Introduce `localExportableSyncReady` as a separate diagnostic/source-level readiness flag',
  'design authorized source-level diagnostic flag');
assertIncludes(a950Policy, 'localExportableSyncReady:true', 'a950 policy recommended local exportable flag');
assertIncludes(a950Policy, 'global `productSyncReady` remains false', 'a950 policy keeps global false');
assertIncludes(fddCloseout, 'rawCanonicalBindingCountAfter:13', 'fdd closeout raw 13');
assertIncludes(fddCloseout, 'exportableCanonicalBindingCount:12', 'fdd closeout exportable 12');
assertIncludes(fddCloseout, 'fullBundleV2Bindings:12', 'fdd closeout bundle 12');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]', 'fdd closeout only a950 debt');

for (const token of [
  "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_CHAT_TOKEN = 'r:650c3cb39924'",
  "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_FOLDER_TOKEN = 'r:0226fecaed5b'",
  "OPERATIONAL5_LOCAL_EXPORTABLE_SYNC_READY_SCHEMA = 'h2o.studio.operational5.local-exportable-sync-ready.v1'",
  'async function operational5FullBundleV2BindingProjectionSummary(opts)',
  'async function operational5LocalExportableSyncReadiness(opts)',
  'diagnoseFullBundleV2ReadonlyProjection',
  'localExportableSyncReady: false',
  'transportReady: false',
  'chatSavingCasBlocked: true',
  'rawCanonicalBindingCount: 0',
  'exportableCanonicalBindingCount: 0',
  'fullBundleV2BindingProjectionCount: null',
  'remainingRawCanonicalDebtCount: 0',
  'documentedDebtRowTokens: []',
  'undocumentedDanglingRowCount: 0',
  'exportableDanglingBindingCount: 0',
  'rawCanonicalDebtVisible: false',
  'exportableParityClean: false',
  'documentedDebtQuarantined: false',
  'result.localExportableSyncReady = localReady',
  'operational5LocalExportableSyncReadiness: operational5LocalExportableSyncReadiness',
]) {
  assertIncludes(foldersStore, token, `folders source token ${token}`);
}
assertIncludes(foldersStore, "result['webdavCloud' + 'RelayBlocked'] = true",
  'source sets webdavCloudRelayBlocked without reintroducing legacy cloudRelay token');
assertIncludes(foldersStore, "result['webdavCloud' + 'RelayBlocked'] === true",
  'source gates local readiness on webdavCloudRelayBlocked');

assertIncludes(foldersStore, 'result.blockers.push(\'exportable-canonical-fullbundle-v2-parity-mismatch\')',
  'mismatch blocker retained');
assertIncludes(foldersStore, 'result.blockers.push(\'raw-canonical-debt-not-fully-documented\')',
  'undocumented debt blocker retained');
assertIncludes(foldersStore, 'result.blockers.push(\'exportable-dangling-bindings-present\')',
  'exportable dangling blocker retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup verification unchanged');
assertIncludes(foldersStore, 'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
  'cleanup delete remains scoped to existing cleanup paths, not local readiness');

const fnStart = foldersStore.indexOf('async function operational5LocalExportableSyncReadiness');
const fnEnd = foldersStore.indexOf('async function operational5ResolveStrictEvidenceReceiptTarget');
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'local readiness function slice found');
const fnBody = foldersStore.slice(fnStart, fnEnd);
for (const forbidden of [
  'sqlExecute(',
  'writeOperational5StrictEvidenceLedger',
  'chromeStorageSet',
  'DELETE FROM',
  'INSERT ',
  'UPDATE ',
  'exportFullBundle(',
  'exportLatestSyncBundle(',
  'rebuildRenderMirrorFromSqlite(',
  'operational5OrphanBindingCleanup(',
  'operational5OrphanBindingManualApprovalCleanupOverride(',
]) {
  assertNotIncludes(fnBody, forbidden, `local readiness function must be read-only (${forbidden})`);
}

function localExportableDecision(state) {
  const rawCanonicalBindingCount = Number(state.rawCanonicalBindingCount) || 0;
  const exportableCanonicalBindingCount = Number(state.exportableCanonicalBindingCount) || 0;
  const fullBundleV2BindingProjectionCount = Number(state.fullBundleV2BindingProjectionCount);
  const documentedDebtRowTokens = Array.isArray(state.documentedDebtRowTokens) ? state.documentedDebtRowTokens : [];
  const remainingRawCanonicalDebtCount = Number(state.remainingRawCanonicalDebtCount) || 0;
  const undocumentedDanglingRowCount = Number(state.undocumentedDanglingRowCount) || 0;
  const exportableDanglingBindingCount = Number(state.exportableDanglingBindingCount) || 0;
  const rawCanonicalDebtVisible = remainingRawCanonicalDebtCount > 0 &&
    rawCanonicalBindingCount !== exportableCanonicalBindingCount;
  const exportableParityClean = exportableCanonicalBindingCount === fullBundleV2BindingProjectionCount;
  const documentedDebtQuarantined = remainingRawCanonicalDebtCount === documentedDebtRowTokens.length &&
    documentedDebtRowTokens.includes('row:a950a44b859f') &&
    undocumentedDanglingRowCount === 0;
  const localExportableSyncReady = exportableParityClean &&
    exportableDanglingBindingCount === 0 &&
    documentedDebtQuarantined &&
    rawCanonicalDebtVisible &&
    state.productSyncReady === false &&
    state.transportReady === false &&
    state.webdavCloudRelayBlocked === true &&
    state.chatSavingCasBlocked === true;
  return {
    localExportableSyncReady,
    productSyncReady: false,
    transportReady: false,
    webdavCloudRelayBlocked: true,
    chatSavingCasBlocked: true,
    blockers: [
      exportableParityClean ? null : 'exportable-canonical-fullbundle-v2-parity-mismatch',
      documentedDebtQuarantined ? null : 'raw-canonical-debt-not-fully-documented',
      exportableDanglingBindingCount === 0 ? null : 'exportable-dangling-bindings-present',
    ].filter(Boolean),
  };
}

const current = localExportableDecision({
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  undocumentedDanglingRowCount: 0,
  exportableDanglingBindingCount: 0,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
});
assert.equal(current.localExportableSyncReady, true, 'current local exportable state can be ready');
assert.equal(current.productSyncReady, false, 'local readiness does not flip productSyncReady');
assert.equal(current.transportReady, false, 'local readiness does not imply transport readiness');
assert.deepEqual(current.blockers, [], 'current local exportable state has no local blockers');

assert.equal(localExportableDecision({
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 11,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  undocumentedDanglingRowCount: 0,
  exportableDanglingBindingCount: 0,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}).localExportableSyncReady, false, 'mismatched fullBundle.v2 count blocks local readiness');

assert.equal(localExportableDecision({
  rawCanonicalBindingCount: 14,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 2,
  undocumentedDanglingRowCount: 1,
  exportableDanglingBindingCount: 0,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}).localExportableSyncReady, false, 'undocumented dangling debt blocks local readiness');

assert.equal(localExportableDecision({
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  undocumentedDanglingRowCount: 0,
  exportableDanglingBindingCount: 1,
  productSyncReady: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}).localExportableSyncReady, false, 'exportable dangling binding blocks local readiness');

const runtimeCombined = [foldersStore, exportBundle, folderSync, folderImport, webdavGates].join('\n');
const productSyncReadyFalseCount = (runtimeCombined.match(/productSyncReady\s*:\s*false/g) || []).length;
assert.ok(productSyncReadyFalseCount >= 20, `expected productSyncReady false markers; found ${productSyncReadyFalseCount}`);
assert.ok(!runtimeCombined.includes('productSyncReady: true'), 'productSyncReady must not be flipped true');
assert.ok(!runtimeCombined.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(exportBundle, 'diagnoseFullBundleV2ReadonlyProjection', 'fullBundle.v2 read-only projection diagnostic retained');
assertIncludes(exportBundle, 'writesFiles: false', 'fullBundle diagnostic remains no file writes');
assertIncludes(exportBundle, 'writesTransport: false', 'fullBundle diagnostic remains no transport writes');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV false guard retained');
assertIncludes(webdavGates, 'productSyncReady: false', 'WebDAV productSyncReady false retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
assertIncludes(chatSavingBoundary, 'H2O.Studio.archiveCloudSync', 'Chat Saving cloud runtime namespace remains forbidden');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.local-exportable-sync-ready-implementation.validator.v1',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_LOCAL_EXPORTABLE_SYNC_READY_IMPLEMENTED_READ_ONLY',
  source: foldersStorePath,
  localExportableSyncReady: true,
  productSyncReady: false,
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-operational5-local-exportable-sync-ready-implementation');
