#!/usr/bin/env node
//
// Operational.5 - a950 read-only investigation validator.
//
// Proves the a950 read-only investigation: it respects the final rollup 16853425; keeps row:a950a44b859f as the only
// documented debt row with no new strict evidence (neither an exact active folder tombstone nor an exact active
// folderBinding tombstone); preserves localExportableSyncReady:true and productSyncReady:false; is read-only and
// introduces no cleanup authority; asserts no product-state mutation; and keeps WebDAV/cloud/relay/fullBundle.v3 and
// Chat Saving CAS blocked. It anchors the investigation against the real source (a950 is source-excluded from the
// strict-evidence-receipt and manual-approval cleanup paths) and confirms the operator snippet is read-only.
// Evidence/validator-only; no product source changed; no live cleanup/mutation run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const investigationPath = 'release-evidence/2026-07-01/operational5-a950-readonly-investigation.md';
const rollupPath = 'release-evidence/2026-07-01/operational5-final-rollup-local-exportable-ready-global-blocked.md';
const liveCloseoutPath = 'release-evidence/2026-07-01/operational5-local-exportable-sync-ready-live-closeout.md';
const a950PolicyPath = 'release-evidence/2026-07-01/operational5-a950-documented-debt-readiness-policy.md';
const provenanceSearchPath = 'release-evidence/2026-07-01/operational5-orphan-binding-provenance-search.md';
const fddCloseoutPath = 'release-evidence/2026-07-01/operational5-fdd-orphan-binding-cleanup-live-closeout.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { const abs = path.join(root, rel); assert.ok(fs.existsSync(abs), `missing ${rel}`); return fs.readFileSync(abs, 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const investigation = read(investigationPath);
const flat = compact(investigation);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Investigation content anchors (verdict + the 10 answers + readiness preserved).
// ---------------------------------------------------------------------------
for (const token of [
  '`row:a950a44b859f` REMAINS DOCUMENTED, QUARANTINED DEBT',
  'NO NEW STRICT EVIDENCE EXISTS',
  'read-only investigation evidence/validator slice',
  '16853425',
  'r:650c3cb39924',
  'r:0226fecaed5b',
  "'r:' + sha256Hex(String(chatId)).slice(0, 12)",
  'OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN',
  "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN = 'row:fdd2456fc8a2'",
  'folderId` is absent from the current canonical folder list',
  "getTombstone('folder', 'folder:<encodeURIComponent(folderId)>')",
  "getTombstone('folderBinding', 'folderBinding:<encodeURIComponent(chatId)>:<encodeURIComponent(folderId)>')",
  'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt',
  'operational5-orphan-binding-strict-evidence-receipt-row-a950-documented-debt',
  'Broad text matching, loose metadata matching',
  'a950 remains documented, quarantined debt',
  'Future cleanup remains BLOCKED',
  '`localExportableSyncReady:true` and global `productSyncReady:false` are preserved',
  // snippet markers
  'operational5-a950-readonly-strict-reverify',
  'strictActiveFolderTombstonePresent',
  'strictActiveFolderBindingTombstonePresent',
  'remainsDocumentedDebt: !(!!folderTomb && !!bindingTomb)',
  // boundaries
  'no cleanup authority introduced',
  'WebDAV/cloud/relay/`fullBundle.v3`',
  'Chat Saving WebDAV/cloud/archive CAS',
]) {
  assertIncludes(flat, token, `investigation token ${token}`);
}

for (const forbidden of [
  'row:a950a44b859f was cleaned',
  'a950 cleanup approved',
  'a950 is now cleanup-eligible',
  'productSyncReady:true',
  'localExportableSyncReady:false',
  'transportReady:true',
]) {
  assertNotIncludes(flat, forbidden, `investigation must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence cross-checks (internal consistency with prior closeouts).
// ---------------------------------------------------------------------------
assertIncludes(compact(read(rollupPath)), 'OPERATIONAL.5 IS AT A STABLE HANDOFF POINT', 'final rollup evidence present');
assertIncludes(read(a950PolicyPath), 'no strict cleanup evidence', 'a950 policy records no strict cleanup evidence');
assertIncludes(read(provenanceSearchPath), 'STRICT TOMBSTONE EVIDENCE STILL MISSING', 'provenance search records missing strict evidence');
assertIncludes(read(fddCloseoutPath), 'rawCanonicalBindingCountAfter:13', 'fdd cleanup brought raw to 13');
assertIncludes(compact(read(liveCloseoutPath)), 'documentedDebtRowTokens:["row:a950a44b859f"]', 'live closeout shows a950 as the only documented debt');

// ---------------------------------------------------------------------------
// (3) REAL SOURCE: a950 is documented debt and is source-excluded from cleanup; strict authority unchanged.
// ---------------------------------------------------------------------------
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN = 'row:a950a44b859f'", 'a950 documented-debt token present');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_STRICT_EVIDENCE_TARGET_ROW_TOKEN = 'row:fdd2456fc8a2'", 'strict-evidence target was fdd, not a950');
assertIncludes(foldersStore, "result.status = 'rejected-documented-debt-row-not-eligible-for-strict-evidence-receipt'", 'source rejects a950 from strict-evidence-receipt path');
assertIncludes(foldersStore, "result.blockers.push('operational5-orphan-binding-strict-evidence-receipt-row-a950-documented-debt')", 'source blocker keeps a950 as documented debt');
assertIncludes(foldersStore, 'excludedRowToken: OPERATIONAL5_ORPHAN_BINDING_DOCUMENTED_DEBT_ROW_TOKEN', 'a950 excluded from manual-approval cleanup override');
// strict tombstone authority unchanged (not weakened)
assertIncludes(tombstones, 'WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL', 'getTombstone exact active authority intact');
assertIncludes(foldersStore, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]', 'strict cleanup verification unchanged');
assertIncludes(foldersStore, 'async function operational5LocalExportableSyncReadiness(opts)', 'local readiness API still present');

// ---------------------------------------------------------------------------
// (4) The operator snippet is read-only (no mutation / no cleanup call) and uses exact getTombstone.
// ---------------------------------------------------------------------------
const snippetMatch = investigation.match(/```js\n([\s\S]*?)\n```/);
assert.ok(snippetMatch, 'investigation contains a read-only strict re-verify snippet');
const snippet = snippetMatch[1];
assertIncludes(snippet, "getTombstone('folder', 'folder:' + enc(folderId))", 'snippet uses exact folder tombstone lookup');
assertIncludes(snippet, "getTombstone('folderBinding', 'folderBinding:' + enc(chatId) + ':' + enc(folderId))", 'snippet uses exact binding tombstone lookup');
assertIncludes(snippet, 'readOnly: true', 'snippet is read-only');
assertIncludes(snippet, 'noCleanupAuthority: true', 'snippet asserts no cleanup authority');
for (const banned of ['.apply(', 'createTombstone(', 'bindChat(', 'unbindChat(', 'DELETE FROM', 'sqlExecute', 'storage.local.set', 'productSyncReady: true',
  'operational5OrphanBindingCleanup(', 'operational5OrphanBindingManualApprovalCleanupOverride(']) {
  assertNotIncludes(snippet, banned, `snippet must be read-only (${banned})`);
}

// ---------------------------------------------------------------------------
// (5) Boundaries: productSyncReady false; WebDAV/fullBundle.v3 deferred; Chat Saving CAS blocked; source unmutated.
// ---------------------------------------------------------------------------
assert.ok(!foldersStore.includes('productSyncReady: true') && !foldersStore.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true in source');
const runtimeCombined = `${foldersStore}\n${folderSync}\n${folderImport}\n${webdavGates}`;
assert.doesNotMatch(runtimeCombined, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3 in source');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard retained');
assertIncludes(chatSavingBoundary, 'deferred encrypted', 'Chat Saving CAS deferred lane retained');

console.log(JSON.stringify({
  schema: 'h2o.studio.operational5.a950-readonly-investigation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-a950-readonly-investigation',
  evidence: investigationPath,
  verdict: 'OPERATIONAL5_A950_REMAINS_DOCUMENTED_DEBT_NO_NEW_STRICT_EVIDENCE',
  respectsFinalRollup: '16853425',
  a950RemainsOnlyDocumentedDebt: true,
  newStrictEvidence: false,
  strictFolderTombstonePresent: false,
  strictFolderBindingTombstonePresent: false,
  futureCleanupBlocked: true,
  a950SourceExcludedFromCleanup: true,
  investigationReadOnly: true,
  cleanupAuthorityIntroduced: false,
  productStateMutated: false,
  localExportableSyncReady: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  a950StatusDecision: 'permanent-documented-quarantined-debt-pending-live-strict-evidence',
}, null, 2));
console.log('PASS validate-operational5-a950-readonly-investigation');
