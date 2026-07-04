#!/usr/bin/env node
//
// Operational.5 - localExportableSyncReady live read-only closeout validator.
//
// Proves the recorded LIVE run of H2O.Studio.store.folders.operational5LocalExportableSyncReadiness(...): the API is
// available and read-only; localExportableSyncReady:true with productSyncReady:false; raw canonical 13, exportable 12,
// fullBundle.v2 12; the only remaining documented debt is row:a950a44b859f (quarantined, visible); undocumented
// dangling rows and exportable dangling bindings are zero; no cleanup authority / no mutation; transportReady:false;
// WebDAV/cloud/relay/fullBundle.v3 blocked/not-started; Chat Saving CAS blocked; and this does NOT authorize global
// product readiness. It anchors the live result against the read-only source and models the readiness decision.
// Evidence/validator-only; no product source changed; no live cleanup/mutation run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-implementation.md';
const designPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-design.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Live-closeout evidence anchors: the exact live result + verdict.
// ---------------------------------------------------------------------------
for (const token of [
  'LIVE `localExportableSyncReady` CLOSEOUT',
  '9d317664111a8c18e61d237f7aba8a96b86cb723',
  'H2O.Studio.store.folders.operational5LocalExportableSyncReadiness',
  'h2o.studio.operational5.local-exportable-sync-ready.v1',
  '`status:"local-exportable-sync-ready"`',
  '`ok:true`',
  '`readOnly:true`',
  '`writesData:false`',
  '`writesCanonicalState:false`',
  '`noCleanupAuthority:true`',
  '`noBindingMutation:true`',
  '`noFolderMutation:true`',
  '`noChatMutation:true`',
  '`noTombstoneMutation:true`',
  '`noLedgerMutation:true`',
  '`noImportExportMutation:true`',
  '`noRenderMirrorWrite:true`',
  '`localExportableSyncReady:true`',
  '`productSyncReady:false`',
  '`transportReady:false`',
  '`fullBundleV3Started:false`',
  '`chatSavingCasBlocked:true`',
  '`webdavCloudRelayBlocked:true`',
  '`rawCanonicalBindingCount:13`',
  '`exportableCanonicalBindingCount:12`',
  '`fullBundleV2BindingProjectionCount:12`',
  '`remainingRawCanonicalDebtCount:1`',
  '`documentedDebtRowTokens:["row:a950a44b859f"]`',
  '`undocumentedDanglingRowCount:0`',
  '`exportableDanglingBindingCount:0`',
  '`rawCanonicalDebtVisible:true`',
  '`exportableParityClean:true`',
  '`documentedDebtQuarantined:true`',
  '`blockers:[]`',
  'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  'This does NOT authorize global product readiness',
  '`row:a950a44b859f` not cleaned or mutated',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'localExportableSyncReady:false',
  'productSyncReady:true',
  'productSyncReady flipped',
  'cleanup apply approved',
  'row:a950a44b859f was removed',
  'WebDAV started',
  'authorizes global product readiness',
]) {
  assertNotIncludes(flat, forbidden, `closeout must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence retained.
// ---------------------------------------------------------------------------
assertIncludes(compact(read(implementationPath)), 'LOCAL EXPORTABLE SYNC READY IMPLEMENTED', 'implementation evidence retained');
assert.ok(fs.existsSync(path.join(root, designPath)), 'design evidence exists');
assertIncludes(read(a950PolicyPath), 'global `productSyncReady` remains false', 'a950 policy keeps global false');
const fddCloseout = read(fddCloseoutPath);
assertIncludes(fddCloseout, 'rawCanonicalBindingCountAfter:13', 'fdd cleanup brought raw to 13');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]', 'fdd closeout leaves only a950 debt');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE: the live API is present, read-only, and unchanged in its safety posture.
// ---------------------------------------------------------------------------
assertIncludes(foldersStore, "OPERATIONAL5_LOCAL_EXPORTABLE_SYNC_READY_SCHEMA = 'h2o.studio.operational5.local-exportable-sync-ready.v1'", 'schema const present');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'", 'a950 documented-debt row token present');
assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)', 'live API function present');
assertIncludes(foldersStore, 'operational5LocalExportableSyncReadiness: operational5LocalExportableSyncReadiness', 'API exposed on store.folders');
assertIncludes(foldersStore, 'result.localExportableSyncReady = localReady', 'readiness computed');
assertIncludes(foldersStore, "result['webdavCloud' + 'RelayBlocked'] === true", 'readiness gated on webdav blocked');
// strict tombstone cleanup rules unchanged (not weakened by the read-only flag)
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup verification unchanged');

// the live readiness function body is read-only (no writes / no cleanup calls).
const fnStart = foldersStore.indexOf('async function operational5LocalExportableSyncReadiness');
const fnEnd = foldersStore.indexOf('async function operational5ResolveStrictEvidenceReceiptTarget');
assert.ok(fnStart >= 0 && fnEnd > fnStart, 'live readiness function slice found');
const fnBody = foldersStore.slice(fnStart, fnEnd);
for (const banned of [
  'sqlExecute(', 'DELETE FROM', 'INSERT ', 'UPDATE ', 'createTombstone(', 'chromeStorageSet', 'recordWrite(',
  'exportFullBundle(', 'exportLatestSyncBundle(', 'rebuildRenderMirrorFromSqlite(',
  'operational5OrphanBindingCleanup(', 'operational5OrphanBindingManualApprovalCleanupOverride(',
]) {
  assertNotIncludes(fnBody, banned, `live readiness function must be read-only (${banned})`);
}
// read-only flags declared in the result object
for (const flag of [
  'readOnly: true', 'writesData: false', 'writesCanonicalState: false', 'noCleanupAuthority: true',
  'noBindingMutation: true', 'noFolderMutation: true', 'noChatMutation: true', 'noTombstoneMutation: true',
  'noLedgerMutation: true', 'noImportExportMutation: true', 'noRenderMirrorWrite: true',
  'productSyncReady: false', 'transportReady: false', 'chatSavingCasBlocked: true',
]) {
  assertIncludes(fnBody, flag, `live readiness result flag ${flag}`);
}

// ---------------------------------------------------------------------------
// (4) Behavioral model: the live state is ready, stays productSyncReady:false, and undocumented debt would block.
// ---------------------------------------------------------------------------
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
    (remainingRawCanonicalDebtCount === 0 || rawCanonicalDebtVisible) &&
    state.productSyncReady === false &&
    state.transportReady === false &&
    state.webdavCloudRelayBlocked === true &&
    state.chatSavingCasBlocked === true;
  return { localExportableSyncReady, productSyncReady: false, transportReady: false, rawCanonicalDebtVisible, documentedDebtQuarantined };
}

const liveState = {
  rawCanonicalBindingCount: 13, exportableCanonicalBindingCount: 12, fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'], remainingRawCanonicalDebtCount: 1, undocumentedDanglingRowCount: 0,
  exportableDanglingBindingCount: 0, productSyncReady: false, transportReady: false,
  webdavCloudRelayBlocked: true, chatSavingCasBlocked: true,
};
const live = localExportableDecision(liveState);
assert.equal(live.localExportableSyncReady, true, 'model: live state is local-exportable-sync-ready');
assert.equal(live.productSyncReady, false, 'model: local readiness does not flip productSyncReady');
assert.equal(live.transportReady, false, 'model: local readiness does not imply transport readiness');
assert.equal(live.rawCanonicalDebtVisible, true, 'model: raw canonical debt stays visible');
assert.equal(live.documentedDebtQuarantined, true, 'model: a950 debt is documented + quarantined');

// an undocumented dangling row would block local readiness
assert.equal(localExportableDecision(Object.assign({}, liveState, {
  rawCanonicalBindingCount: 14, remainingRawCanonicalDebtCount: 2, undocumentedDanglingRowCount: 1,
})).localExportableSyncReady, false, 'model: undocumented dangling row blocks local readiness');
// an exportable-count / fullBundle.v2 mismatch would block
assert.equal(localExportableDecision(Object.assign({}, liveState, {
  fullBundleV2BindingProjectionCount: 11,
})).localExportableSyncReady, false, 'model: fullBundle.v2 mismatch blocks local readiness');
// losing visibility of the raw debt (raw==exportable while debt remains) blocks
assert.equal(localExportableDecision(Object.assign({}, liveState, {
  rawCanonicalBindingCount: 12,
})).localExportableSyncReady, false, 'model: hidden raw debt blocks local readiness');

// ---------------------------------------------------------------------------
// (5) Boundaries: productSyncReady false; WebDAV/fullBundle.v3 deferred; Chat Saving CAS blocked; a950 not removed.
// ---------------------------------------------------------------------------
const runtimeCombined = `${foldersStore}\n${folderSync}\n${folderImport}\n${webdavGates}`;
assert.ok(!runtimeCombined.includes('productSyncReady: true') && !runtimeCombined.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');
// a950 debt row still present in source as documented debt (not removed)
assertIncludes(foldersStore, "'row:a950a44b859f'", 'a950 documented-debt token retained in source');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.local-exportable-sync-ready-live-closeout.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-local-exportable-sync-ready-live-closeout',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_LOCAL_EXPORTABLE_SYNC_READY_LIVE_PROVEN',
  liveApiAvailable: true,
  liveResultReadOnly: true,
  localExportableSyncReady: true,
  productSyncReady: false,
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  undocumentedDanglingRowCount: 0,
  exportableDanglingBindingCount: 0,
  fullBundleV2ProjectionHash: 'sha256:a721ebdad94e398a4f45bc46c437f465402ad9e8ac2e68cc120eef96df9bbb85',
  noCleanupAuthority: true,
  a950RemovedOrMutated: false,
  transportReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  authorizesGlobalProductReadiness: false,
}, null, 2));
console.log('PASS validate-operational5-local-exportable-sync-ready-live-closeout');
