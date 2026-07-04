#!/usr/bin/env node
//
// Operational.5 - final rollup / handoff manifest validator.
//
// Proves the handoff manifest: references the latest live closeout commit 82cf4aba; preserves
// localExportableSyncReady:true and productSyncReady:false; keeps row:a950a44b859f as the documented, quarantined
// remaining debt; blocks WebDAV/cloud/relay/fullBundle.v3 and Chat Saving CAS; authorizes no cleanup/mutation/flip/
// transport; and states the do-not-do list + recommended next lanes. It cross-checks the rollup against the real
// closeout evidence and confirms product source is unmutated. Evidence/validator-only; no product source changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const rollupPath = 'release-evidence/2026-07-01/operational5-final-rollup-local-exportable-ready-global-blocked.md';
const liveCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const implementationPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-implementation.md';
const designPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-design.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const postCleanupDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-decision-after-fdd-cleanup.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const rollup = read(rollupPath);
const flat = compact(rollup);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Rollup content anchors (the required manifest claims).
// ---------------------------------------------------------------------------
for (const token of [
  'OPERATIONAL.5 IS AT A STABLE HANDOFF POINT',
  'AUTHORIZES NO CLEANUP, NO MUTATION, NO FLIP, AND NO TRANSPORT',
  // references latest closeout commit + chain
  '82cf4aba',
  '9d317664111a8c18e61d237f7aba8a96b86cb723',
  '684ea497522b1804beb04fc3de0f5672b6901356',
  'bfbbd04302f9330d3e0e140d33e17ed5a2ed471f',
  // 1. complete
  '## 1. What Is Complete',
  '**fdd reviewed cleanup**',
  '**local exportable readiness diagnostic**',
  '**fullBundle.v2 exportable parity**',
  // 2. blocked
  '## 2. What Remains Blocked',
  'global `productSyncReady`**: `false`',
  "WebDAV/cloud/relay/`fullBundle.v3`**: not started / blocked",
  'Chat Saving WebDAV/cloud/archive CAS**: blocked/deferred',
  // 3. remaining blocker
  '## 3. Exact Remaining Blocker',
  'row:a950a44b859f',
  'documented,\n  quarantined debt'.replace(/\n\s*/g, ' '),
  // 4. semantics
  '## 4. Exact Final Semantics',
  '`localExportableSyncReady:true`',
  'is **NOT** transport readiness',
  '`transportReady:false`',
  '`productSyncReady:false`',
  'remains authoritative globally',
  // 5. must-not
  '## 5. What Future Agents Must NOT Do',
  'Do NOT clean or mutate `row:a950a44b859f`** without NEW strict evidence',
  'Do NOT flip `productSyncReady` from this lane',
  'Do NOT start transport from `localExportableSyncReady`',
  'Do NOT weaken strict tombstone cleanup rules',
  // 6. next lanes
  '## 6. Recommended Next Lanes',
  '**Separate a950 investigation lane**',
  'NO cleanup authority',
  '**Separate transport-readiness lane**',
  '**Separate Chat Saving CAS / WebDAV lane**',
  // final state
  'raw canonical bindings: `13`',
  'exportable canonical bindings: `12`',
  '`fullBundle.v2` bindings: `12`',
  'undocumented dangling rows: `0`',
  'exportable dangling bindings: `0`',
]) {
  assertIncludes(flat, token, `rollup token ${token}`);
}

for (const forbidden of [
  'productSyncReady:true',
  'productSyncReady is ready',
  'transportReady:true',
  'WebDAV enabled',
  'a950a44b859f was cleaned',
  'authorizes a cleanup',
  'global product readiness is granted',
]) {
  assertNotIncludes(flat, forbidden, `rollup must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Cross-check the rollup against the real closeout evidence (internal consistency).
// ---------------------------------------------------------------------------
assertIncludes(compact(read(liveCloseoutPath)), 'LIVE `localExportableSyncReady` CLOSEOUT', 'latest live closeout evidence present');
assertIncludes(compact(read(implementationPath)), 'LOCAL EXPORTABLE SYNC READY IMPLEMENTED', 'implementation evidence present');
assert.ok(fs.existsSync(path.join(root, designPath)), 'design evidence present');
assertIncludes(read(a950PolicyPath), 'global `productSyncReady` remains false', 'a950 policy keeps global false');
const fddCloseout = read(fddCloseoutPath);
assertIncludes(fddCloseout, 'rawCanonicalBindingCountAfter:13', 'fdd cleanup brought raw to 13');
assertIncludes(fddCloseout, 'danglingRowTokens:["row:a950a44b859f"]', 'fdd closeout leaves only a950 debt');
assert.ok(fs.existsSync(path.join(root, postCleanupDecisionPath)), 'post-cleanup readiness decision evidence present');

// ---------------------------------------------------------------------------
// (3) Product source is UNMUTATED (rollup authorizes nothing).
// ---------------------------------------------------------------------------
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'",
  'a950 documented-debt token still present in source (not removed)');
assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)', 'local readiness API still present');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]',
  'strict tombstone cleanup verification unchanged (not weakened)');
assert.ok(!foldersStore.includes('productSyncReady: true') && !foldersStore.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true in source');
const runtimeCombined = `${foldersStore}\n${folderSync}\n${folderImport}\n${webdavGates}`;
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.final-rollup-local-exportable-ready-global-blocked.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-final-rollup',
  evidence: rollupPath,
  verdict: 'OPERATIONAL5_FINAL_ROLLUP_LOCAL_EXPORTABLE_READY_GLOBAL_BLOCKED',
  referencesLatestCloseout: '82cf4aba',
  localExportableSyncReady: true,
  productSyncReady: false,
  transportReady: false,
  remainingDebtRowToken: 'row:a950a44b859f',
  rawCanonicalBindingCount: 13,
  exportableCanonicalBindingCount: 12,
  fullBundleV2BindingProjectionCount: 12,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  authorizesCleanupOrMutation: false,
  productSourceMutated: false,
  recommendedNextLanes: ['a950-investigation-read-only', 'transport-readiness-after-global-policy', 'chat-saving-cas-webdav-after-transport-gate'],
}, null, 2));
console.log('PASS validate-operational5-final-rollup-local-exportable-ready-global-blocked');
