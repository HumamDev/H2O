#!/usr/bin/env node
//
// Operational.5 - global readiness policy fork after a950 validator.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const policyPath = 'release-evidence/2026-07-01/operational5-global-readiness-policy-fork-after-a950.md';
const a950InvestigationPath = 'release-evidence/2026-07-01/operational5-a950-readonly-investigation.md';
const finalRollupPath = 'release-evidence/2026-07-01/operational5-final-rollup-local-exportable-ready-global-blocked.md';
const localCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
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

const policy = read(policyPath);
const flat = compact(policy);
const a950Investigation = read(a950InvestigationPath);
const finalRollup = read(finalRollupPath);
const localCloseout = read(localCloseoutPath);
const a950Policy = read(a950PolicyPath);
const fddCloseout = read(fddCloseoutPath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

for (const token of [
  'POLICY OPTION 2 SELECTED - KEEP `productSyncReady:false`, PRESERVE `localExportableSyncReady:true`, AND ALLOW ONLY A SEPARATE TRANSPORT-READINESS EVALUATION CANDIDATE STATE',
  'evidence/policy-only slice',
  'baa7718d',
  '16853425',
  '82cf4aba',
  '9d317664111a8c18e61d237f7aba8a96b86cb723',
  '684ea497522b1804beb04fc3de0f5672b6901356',
  '`row:fdd2456fc8a2` was cleaned exactly once',
  '`row:a950a44b859f` remains permanent documented, quarantined debt',
  'a950 has no new strict tombstone evidence',
  'a950 cleanup remains blocked and source-enforced',
  'raw canonical bindings: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` bindings: `12`',
  'undocumented dangling rows: `0`',
  'exportable dangling bindings: `0`',
  '`localExportableSyncReady:true`',
  'global `productSyncReady:false`',
  '`transportReady:false`',
  'WebDAV/cloud/relay/`fullBundle.v3` blocked/not-started',
  'Chat Saving WebDAV/cloud/archive CAS blocked/deferred',
  'Option 1 - keep everything blocked until raw canonical debt is fully resolved',
  'Rejected as too conservative for planning',
  'Option 2 - keep `productSyncReady:false`, but allow a separate transport-candidate policy state',
  'Selected. Recommended state name:',
  '`transportEligibilityFromLocalExportableReady:true`',
  'only the next **separate transport-readiness evaluation**',
  'Option 3 - flip `productSyncReady:true` despite a950 debt',
  'Rejected. Global `productSyncReady` remains authoritative',
  '`localExportableSyncReady:true` means:',
  'exportable local canonical parity is clean',
  'remaining raw canonical debt is documented, visible, and quarantined',
  '`localExportableSyncReady:true` is **not**:',
  'global product readiness',
  'transport readiness',
  'WebDAV/cloud/relay authorization',
  '`fullBundle.v3` authorization',
  'Chat Saving CAS authorization',
  'cleanup authorization',
  'permission to weaken strict tombstone cleanup rules',
  '`transportEligibilityFromLocalExportableReady:true` may be used in a future evidence/source slice only when:',
  'the state authorizes only a transport-readiness evaluation, not transport start',
  'Transport can only start after a separate transport-readiness lane passes',
  'Selected policy option: **Option 2**',
  'WebDAV/cloud/relay/`fullBundle.v3` cannot start now',
]) {
  assertIncludes(flat, token, `policy token ${token}`);
}

for (const forbidden of [
  'productSyncReady:true is approved',
  'transportReady:true is approved',
  'WebDAV can start now',
  'cleanup apply approved',
  'row:a950a44b859f was cleaned',
  'Chat Saving CAS can start now',
]) {
  assertNotIncludes(flat, forbidden, `policy forbidden ${forbidden}`);
}

assertIncludes(a950Investigation, '`row:a950a44b859f` REMAINS DOCUMENTED, QUARANTINED DEBT',
  'a950 investigation respected');
assertIncludes(a950Investigation, 'NO NEW STRICT EVIDENCE EXISTS',
  'a950 investigation records no new strict evidence');
assertIncludes(a950Investigation, '`localExportableSyncReady:true` and global `productSyncReady:false` are preserved',
  'a950 investigation preserves local/global readiness split');
assertIncludes(finalRollup, 'OPERATIONAL.5 IS AT A STABLE HANDOFF POINT',
  'final rollup respected');
assertIncludes(finalRollup, 'Do NOT start transport from `localExportableSyncReady`',
  'final rollup blocks direct transport');
assertIncludes(finalRollup, '`localExportableSyncReady:true`',
  'final rollup preserves local readiness');
assertIncludes(localCloseout, 'LIVE `localExportableSyncReady` CLOSEOUT',
  'local exportable live closeout respected');
assertIncludes(localCloseout, '`localExportableSyncReady:true`',
  'local exportable ready true preserved');
assertIncludes(localCloseout, '`transportReady:false`',
  'transport remains false in live closeout');
assertIncludes(a950Policy, 'global `productSyncReady` remains false',
  'a950 policy preserves global false');
assertIncludes(fddCloseout, 'rawCanonicalBindingCountAfter:13',
  'fdd cleanup closeout raw 13 retained');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]',
  'fdd cleanup closeout leaves only a950 debt');

function policyDecision(state) {
  const localExportable = state.localExportableSyncReady === true;
  const productSyncReady = false;
  const transportReady = false;
  const a950DebtVisible = state.documentedDebtRowTokens.includes('row:a950a44b859f') &&
    state.remainingRawCanonicalDebtCount === 1;
  const canEvaluateTransport = localExportable &&
    productSyncReady === false &&
    transportReady === false &&
    a950DebtVisible &&
    state.webdavCloudRelayBlocked === true &&
    state.chatSavingCasBlocked === true;
  return {
    selectedOption: canEvaluateTransport ? 2 : 1,
    transportEligibilityFromLocalExportableReady: canEvaluateTransport,
    productSyncReady,
    transportReady,
    webdavCanStartNow: false,
    cleanupAuthorityIntroduced: false,
  };
}

const current = policyDecision({
  localExportableSyncReady: true,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
});
assert.equal(current.selectedOption, 2, 'policy model selects option 2');
assert.equal(current.transportEligibilityFromLocalExportableReady, true,
  'policy model allows only transport-readiness evaluation candidate state');
assert.equal(current.productSyncReady, false, 'policy model keeps productSyncReady false');
assert.equal(current.transportReady, false, 'policy model keeps transportReady false');
assert.equal(current.webdavCanStartNow, false, 'policy model does not start WebDAV');
assert.equal(current.cleanupAuthorityIntroduced, false, 'policy model introduces no cleanup authority');

assert.equal(policyDecision({
  localExportableSyncReady: false,
  documentedDebtRowTokens: ['row:a950a44b859f'],
  remainingRawCanonicalDebtCount: 1,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}).transportEligibilityFromLocalExportableReady, false, 'localExportable false blocks transport-candidate state');

assert.equal(policyDecision({
  localExportableSyncReady: true,
  documentedDebtRowTokens: [],
  remainingRawCanonicalDebtCount: 1,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
}).transportEligibilityFromLocalExportableReady, false, 'undocumented debt blocks transport-candidate state');

assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented-debt token retained in source');
assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)',
  'local exportable readiness API retained');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup rules unchanged');
assertIncludes(foldersStore, "result.status = 'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt'",
  'a950 remains rejected by strict evidence receipt path');
assertIncludes(foldersStore, 'excludedRowToken: OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  'a950 remains excluded from manual override cleanup');

const runtimeCombined = `${foldersStore}\n${folderSync}\n${folderImport}\n${webdavGates}`;
assert.ok(!runtimeCombined.includes('productSyncReady: true') && !runtimeCombined.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true');
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.global-readiness-policy-fork-after-a950.validator.v1',
  evidence: policyPath,
  verdict: 'OPERATIONAL5_POLICY_OPTION_2_SELECTED_TRANSPORT_EVALUATION_CANDIDATE_ONLY',
  selectedPolicyOption: 2,
  recommendedState: 'transportEligibilityFromLocalExportableReady',
  localExportableSyncReady: true,
  productSyncReady: false,
  transportReady: false,
  webdavCanStartNow: false,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  a950DocumentedDebtVisible: true,
  cleanupAuthorityIntroduced: false,
}, null, 2));
console.log('PASS validate-operational5-global-readiness-policy-fork-after-a950');
