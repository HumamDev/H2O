#!/usr/bin/env node
//
// Operational.5 - orphan-binding cleanup tombstone-verification fix validator.
//
// Proves the cleanup command's tombstone verification is strict and source-grounded, that broad text matching is NOT
// accepted as cleanup proof, that false positives are blocked while valid exact tombstone evidence verifies a
// candidate, that dry-run stays zero-write and apply stays gated, and that all release boundaries hold
// (productSyncReady false; WebDAV/cloud/relay/fullBundle.v3 deferred; Chat Saving CAS blocked). It anchors to the real
// getTombstone SQL (exact record_kind + record_id + restored_at IS NULL) and the real folder / folderBinding tombstone
// record-id writers, confirms the cleanup command uses no substring/meta/receipt matching, and confirms the row-level
// diagnostic was tightened to the same strict bar. No product source is required to change; no live apply is run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const diagnosticEvidencePath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const deleteReviewedApplyPath = 'src-surfaces-base/studio/sync/delete-reviewed-apply.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`); return fs.readFileSync(path.join(root, rel), 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const fixEvidence = read(fixEvidencePath);
const flat = compact(fixEvidence);
const cleanupEvidence = read(cleanupEvidencePath);
const diagnosticEvidence = read(diagnosticEvidencePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const deleteReviewedApply = read(deleteReviewedApplyPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Fix evidence anchors: root cause, blocked apply, no command source change, boundaries.
// ---------------------------------------------------------------------------
for (const token of [
  'ROOT CAUSE FOUND',
  "THE CLEANUP COMMAND'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED",
  'NO LIVE CLEANUP APPLY WAS RUN',
  'verifiedCount:0',
  'WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL',
  "getTombstone('folder', folderTombstoneRecordId(folderId))",
  'No change to the cleanup command source.',
  'Controlled apply:** remains BLOCKED',
  'require MANUAL REVIEW',
  'Broad text matching is not accepted as cleanup proof',
  '`productSyncReady` remains `false`',
  'no WebDAV/cloud/relay/`fullBundle.v3`',
  'no Chat Saving CAS',
  'no fallback',
]) {
  assertIncludes(flat, token, `fix evidence token ${token}`);
}
for (const forbidden of [
  'ran the controlled apply',
  'apply approved',
  'productSyncReady is true',
  'weaken verification',
  'accept broad text matches as proof',
]) {
  assertNotIncludes(flat, forbidden, `fix evidence must not claim: ${forbidden}`);
}
// cleanup implementation evidence remains present/referenced
assertIncludes(compact(cleanupEvidence), 'operational5-orphan-binding-cleanup-apply', 'cleanup implementation evidence retained');

// ---------------------------------------------------------------------------
// (2) STRICT + source-grounded: real getTombstone SQL + real record-id writers + cleanup lookups.
// ---------------------------------------------------------------------------
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'getTombstone is exact record_kind + record_id + active-only');
// folder tombstone writers use folder:enc(folderId)
assertIncludes(foldersStore, "recordId: 'folder:' + encodeURIComponent(fid)", 'buildFolderTombstone record-id format');
assertIncludes(foldersStore, "return 'folder:' + encodeURIComponent(cleanString(folderId));", 'folderTombstoneRecordId format');
assertIncludes(deleteReviewedApply, "recordId: 'folder:' + encodeURIComponent(folderId)", 'reviewed folder-delete apply uses the same folder record-id');
// folderBinding tombstone writer uses folderBinding:enc(chatId):enc(folderId)
assertIncludes(foldersStore, "recordId: 'folderBinding:' + encodeURIComponent(cid) + ':' + encodeURIComponent(fid)", 'buildFolderBindingTombstone record-id format');

// cleanup command's exact lookups + strict verified conjunction
const fnStart = foldersStore.indexOf('async function operational5OrphanBindingCleanup');
const fnEnd = foldersStore.indexOf('function canonicalBindingStoreIdentity');
assert.ok(fnStart > 0 && fnEnd > fnStart, 'cleanup function body region resolves');
const fnBody = foldersStore.slice(fnStart, fnEnd);
assertIncludes(fnBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))", 'cleanup folder tombstone exact lookup');
assertIncludes(fnBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))", 'cleanup binding tombstone exact lookup');
assertIncludes(fnBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]', 'cleanup verified = strict conjunction');

// ---------------------------------------------------------------------------
// (3) Broad text matching is NOT accepted as cleanup proof.
// ---------------------------------------------------------------------------
// The cleanup command must not scan/substring/meta/receipt-match tombstones.
for (const banned of ['meta.oldFolderId', 'receiptMatches', 'folderBindingTombstoneMatches', '.includes(chatId)', '.includes(folderId)', 'stableStringify']) {
  assertNotIncludes(fnBody, banned, `cleanup command must not broad-match (${banned})`);
}
// The diagnostic snippet was tightened to the strict bar; the old broad OR-match no longer drives the verdict.
assertIncludes(diagnosticEvidence, 'strictTombstoneBacked', 'diagnostic scores strict tombstone evidence');
assertIncludes(diagnosticEvidence, 'NON-AUTHORITATIVE', 'diagnostic labels loose matches non-authoritative');
assertIncludes(diagnosticEvidence, 'Correction (2026-07-04) - broad matching superseded by strict verification', 'diagnostic correction section present');
assertNotIncludes(diagnosticEvidence, 'const alreadyExplained = relatedBindingTombstones.length > 0 || relatedReceipts.length > 0;',
  'diagnostic old broad OR-match removed');

// ---------------------------------------------------------------------------
// (4) Fix-evidence strict re-verify snippet is read-only + exact getTombstone.
// ---------------------------------------------------------------------------
const snippetMatch = fixEvidence.match(/```js\n([\s\S]*?)\n```/);
assert.ok(snippetMatch, 'fix evidence contains a strict re-verify DevTools snippet');
const snippet = snippetMatch[1];
assertIncludes(snippet, "getTombstone('folder', 'folder:' + enc(folderId))", 're-verify uses exact folder lookup');
assertIncludes(snippet, "getTombstone('folderBinding', 'folderBinding:' + enc(chatId) + ':' + enc(folderId))", 're-verify uses exact binding lookup');
assertIncludes(snippet, 'readOnly: true', 're-verify is read-only');
for (const banned of ['.apply(', 'createTombstone(', 'bindChat(', 'unbindChat(', 'DELETE FROM', 'sqlExecute', 'storage.local.set', 'productSyncReady: true']) {
  assertNotIncludes(snippet, banned, `re-verify snippet must be read-only (${banned})`);
}

// ---------------------------------------------------------------------------
// (5) Behavioral model: strict verify blocks false positives, verifies valid exact evidence; dry-run/gate/idempotent.
// ---------------------------------------------------------------------------
const GATE = 'operational5-orphan-binding-cleanup-apply';
function safeShapeOf(row) {
  return row.source === 'desktop-canonical-folder-bindings-sqlite' && row.sourceSurface === 'desktop-studio' &&
    row.authority === 'desktop' && row.status === 'active' && row.state === 'active' &&
    row.noHardDelete === true && row.noPurge === true && row.noChatDelete === true;
}
// strict verify identical to operational5OrphanBindingCleanup: loose/broad signals are ignored.
function verifyRow(row) {
  if (row.folderPresentInCanonical) return false; // exportable -> never a candidate
  const folderTomb = row.folderTombExactActive === true;   // getTombstone('folder', exact) restored_at IS NULL
  const bindingTomb = row.bindingTombExactActive === true;  // getTombstone('folderBinding', exact) restored_at IS NULL
  return safeShapeOf(row) && folderTomb && bindingTomb && row.folderAbsentFromCanonical === true;
}
function simulate(rows, opts) {
  opts = opts || {};
  const applyRequested = opts.apply === true;
  const gateSatisfied = String(opts.gate || '') === GATE;
  const dryRun = !(applyRequested && gateSatisfied);
  let verified = 0; let exportable = 0;
  for (const r of rows) { if (r.folderPresentInCanonical) exportable += 1; else if (verifyRow(r)) verified += 1; }
  if (dryRun) {
    return { dryRun, ok: applyRequested && !gateSatisfied ? false : true,
      status: applyRequested && !gateSatisfied ? 'blocked-apply-gate-required' : 'dry-run-orphan-binding-cleanup-ready',
      verified, removed: 0, exportable, rawBefore: rows.length, rawAfter: rows.length, kept: rows.slice() };
  }
  const kept = rows.filter((r) => !verifyRow(r));
  return { dryRun, ok: true, status: 'applied-orphan-binding-cleanup', verified, removed: rows.length - kept.length,
    exportable, rawBefore: rows.length, rawAfter: kept.length, kept };
}
function baseSafe(extra) {
  return Object.assign({
    source: 'desktop-canonical-folder-bindings-sqlite', sourceSurface: 'desktop-studio', authority: 'desktop',
    status: 'active', state: 'active', noHardDelete: true, noPurge: true, noChatDelete: true,
    folderAbsentFromCanonical: true, folderPresentInCanonical: false,
    folderTombExactActive: false, bindingTombExactActive: false, looseMatch: false,
  }, extra || {});
}
// candidate 1: no exact tombstones, but a broad/loose match existed (diagnostic false positive)
const candidate1 = baseSafe({ looseMatch: true });
// candidate 2: exact active binding tombstone, but NO folder tombstone
const candidate2 = baseSafe({ bindingTombExactActive: true, looseMatch: true });
// restored folder tombstone -> not active -> not verified
const restoredFolder = baseSafe({ folderTombExactActive: false, bindingTombExactActive: true, looseMatch: true });
// fully strict-backed dangling row -> verifies
const fullyBacked = baseSafe({ folderTombExactActive: true, bindingTombExactActive: true });
// exportable (folder present) -> never a candidate
const exportableRow = baseSafe({ folderPresentInCanonical: true, folderAbsentFromCanonical: false, folderTombExactActive: true, bindingTombExactActive: true });

// False positives blocked: loose-only / binding-only / restored rows never verify.
assert.equal(verifyRow(candidate1), false, 'model: candidate 1 (loose-only) not verified');
assert.equal(verifyRow(candidate2), false, 'model: candidate 2 (binding tombstone, no folder tombstone) not verified');
assert.equal(verifyRow(restoredFolder), false, 'model: restored folder tombstone not verified');
// Valid exact evidence verifies.
assert.equal(verifyRow(fullyBacked), true, 'model: fully strict-backed row verifies');
assert.equal(verifyRow(exportableRow), false, 'model: exportable row never a candidate');

// Dry-run by default is zero-write, mirrors the live run (2 dangling, 0 verified for the current DB shape).
{
  const dryRunLikeLive = simulate([candidate1, candidate2], {});
  assert.equal(dryRunLikeLive.dryRun, true, 'model: default dry-run');
  assert.equal(dryRunLikeLive.verified, 0, 'model: live-shape verifiedCount 0');
  assert.equal(dryRunLikeLive.removed, 0, 'model: dry-run zero removed');
  assert.equal(dryRunLikeLive.rawAfter, dryRunLikeLive.rawBefore, 'model: dry-run zero write');
}
// Apply without gate is blocked, zero-write.
{
  const blocked = simulate([candidate1, candidate2, fullyBacked], { apply: true, gate: 'nope' });
  assert.equal(blocked.status, 'blocked-apply-gate-required', 'model: apply without gate blocked');
  assert.equal(blocked.removed, 0, 'model: blocked apply removes nothing');
}
// Gated apply removes ONLY the strict-verified row; loose/binding-only/restored rows are preserved.
let keptAfterApply;
{
  const mixed = [candidate1, candidate2, restoredFolder, fullyBacked, exportableRow];
  const applied = simulate(mixed, { apply: true, gate: GATE });
  assert.equal(applied.verified, 1, 'model: exactly 1 strict-verified');
  assert.equal(applied.removed, 1, 'model: removes exactly the strict-verified row');
  assert.equal(applied.rawAfter, mixed.length - 1, 'model: raw drops by exactly 1');
  assert.ok(applied.kept.includes(candidate1) && applied.kept.includes(candidate2) && applied.kept.includes(restoredFolder),
    'model: false-positive rows preserved (not removed)');
  keptAfterApply = applied.kept;
}
// Idempotent duplicate apply is zero-write.
{
  const again = simulate(keptAfterApply, { apply: true, gate: GATE });
  assert.equal(again.removed, 0, 'model: duplicate apply removes nothing');
  assert.equal(again.verified, 0, 'model: no verified candidates remain');
}

// ---------------------------------------------------------------------------
// (6) Boundaries: productSyncReady false; WebDAV/cloud/relay/fullBundle.v3 deferred; Chat Saving CAS blocked; no fallback.
// ---------------------------------------------------------------------------
assert.ok(!foldersStore.includes('productSyncReady: true') && !foldersStore.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true');
assert.doesNotMatch(`${foldersStore}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');
for (const tok of ['allowF7Fallback: true', 'f15AllowF7Fallback: true', 'explicitF7Fallback: true']) {
  assert.ok(!foldersStore.includes(tok), `no fallback token ${tok}`);
}

const result = {
  schema: 'h2o.studio.operational5.orphan-binding-cleanup-tombstone-verification-fix.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-orphan-binding-cleanup-tombstone-verification-fix',
  evidence: fixEvidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_CLEANUP_TOMBSTONE_VERIFICATION_STRICT_AND_SOURCE_GROUNDED',
  rootCause: 'diagnostic broad matching produced false positives; strict exact+active getTombstone verification is correct',
  cleanupCommandSourceChanged: false,
  diagnosticTightenedToStrict: true,
  verificationStrict: true,
  broadMatchAcceptedAsProof: false,
  falsePositivesBlocked: true,
  validExactEvidenceVerifies: true,
  dryRunZeroWrite: true,
  applyGated: true,
  idempotentDuplicateApply: true,
  controlledApplyBlocked: true,
  rowsNeedManualReview: 2,
  liveApplyRun: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  next: 'operator may run the read-only strict re-verify snippet; controlled apply stays blocked pending manual review',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-cleanup-tombstone-verification-fix');
