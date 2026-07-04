#!/usr/bin/env node
//
// Operational.5 - orphan-binding cleanup manual-review blocker decision validator.
//
// Proves the recorded decision: the live cleanup dry-run safe-failed (verifiedCount:0); strict exact + active
// getTombstone verification is the authority; controlled apply remains blocked (blocked-manual-review-required);
// productSyncReady stays false and cannot flip with the two dangling raw canonical rows unreconciled; WebDAV/cloud/
// relay/fullBundle.v3 stay deferred; Chat Saving CAS stays blocked; and the next action is manual review / stricter
// evidence acquisition, NOT cleanup apply. Evidence/validator-only; no product source is changed; no apply is run.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-manual-review-blocker-decision.md';
const cleanupEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const fixEvidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-tombstone-verification-fix.md';
const readinessDecisionPath = 'release-evidence/2026-07-01/operational5-product-sync-ready-readiness-decision-after-live-parity.md';
const flipGatePath = 'release-evidence/2026-06-30/sync-operational-5-productsyncready-flip-gate.md';
const flipGateValidatorPath = 'tools/validation/studio/validate-sync-productsyncready-flip-gate-v1.mjs';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const tombstonesPath = 'src-surfaces-base/studio/store/tombstones.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const webdavGatesPath = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';
const chatSavingBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(rel) { assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`); return fs.readFileSync(path.join(root, rel), 'utf8'); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(String(src).includes(tok), `${label}: missing ${tok}`); }
function assertNotIncludes(src, tok, label) { assert.ok(!String(src).includes(tok), `${label}: forbidden ${tok}`); }

const evidence = read(evidencePath);
const flat = compact(evidence);
const cleanupEvidence = read(cleanupEvidencePath);
const fixEvidence = read(fixEvidencePath);
const readinessDecision = read(readinessDecisionPath);
const flipGate = read(flipGatePath);
const foldersStore = read(foldersStorePath);
const tombstones = read(tombstonesPath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const webdavGates = read(webdavGatesPath);
const chatSavingBoundary = read(chatSavingBoundaryPath);

// ---------------------------------------------------------------------------
// (1) Decision evidence anchors.
// ---------------------------------------------------------------------------
for (const token of [
  'MANUAL-REVIEW BLOCKER RECORDED',
  'AUTOMATED TOMBSTONE-BACKED CLEANUP IS EXHAUSTED',
  // dry-run safe-failed with verifiedCount:0
  'verifiedCount:0',
  'dry-run-orphan-binding-cleanup-ready',
  'skipped-not-fully-tombstone-verified',
  // controlled apply remains blocked
  'Controlled cleanup apply REMAINS BLOCKED',
  'blocked-manual-review-required',
  'operational5-orphan-binding-cleanup-apply',
  // Q1 - cannot flip
  'Export-filtering only makes the `fullBundle.v2` projection match',
  'not sufficient** to flip global `productSyncReady`',
  'source-of-truth reconciled and release-grade',
  'match-with-known-debt',
  'rawCanonicalDanglingBindingsFilteredFromExport',
  'KEEP productSyncReady:false / NOT FLIPPED',
  // Q3 - next route D + A
  'manual operator review of the two tokenized rows',
  'documented debt in place',
  'manual review / stricter evidence acquisition, NOT cleanup apply',
  // Q4 - evidence needed
  'exact ACTIVE folder tombstone',
  'exact ACTIVE folderBinding tombstone',
  'never fabricated',
  'dry-run FIRST',
  // Q5 - keep separate
  'task_aea665fc',
  '**Keep separate.**',
  // boundaries
  '`productSyncReady` remains `false`',
  'No WebDAV/cloud/relay/`fullBundle.v3`; no Chat Saving WebDAV/cloud/archive CAS.',
  'strict tombstone verification not weakened',
  'broad text matching not accepted as cleanup proof',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady is true',
  'productSyncReady flipped to true',
  'ran the controlled apply',
  'controlled apply approved',
  'apply completed successfully',
  'weaken strict tombstone verification',
]) {
  assertNotIncludes(flat, forbidden, `decision must not claim: ${forbidden}`);
}

// ---------------------------------------------------------------------------
// (2) Chain evidence present (implementation + fix + readiness decision + flip gate).
// ---------------------------------------------------------------------------
assertIncludes(compact(cleanupEvidence), 'operational5-orphan-binding-cleanup-apply', 'cleanup implementation evidence retained');
assertIncludes(compact(fixEvidence), 'THE CLEANUP COMMAND\'S STRICT TOMBSTONE VERIFICATION IS CORRECT AND SOURCE-GROUNDED', 'tombstone fix evidence retained');
assertIncludes(readinessDecision, 'KEEP `productSyncReady:false` / NOT FLIPPED', 'readiness decision keeps productSyncReady false');
assertIncludes(readinessDecision, 'rawCanonicalDanglingBindingsFilteredFromExport', 'readiness decision records the dangling debt');
assertIncludes(flipGate, 'productSyncReady stays false', 'flip gate keeps productSyncReady false');
assertIncludes(flipGate, 'folder-sync source-of-truth reconciled and release-grade', 'flip gate requires source-of-truth reconciliation');
assert.ok(fs.existsSync(path.join(root, flipGateValidatorPath)), 'flip-gate validator exists');

// ---------------------------------------------------------------------------
// (3) STRICT tombstone verification is the authority (real source).
// ---------------------------------------------------------------------------
assertIncludes(tombstones, "'SELECT * FROM ' + TABLE + ' WHERE record_kind = ? AND record_id = ? AND restored_at IS NULL LIMIT 1'",
  'getTombstone is exact record_kind + record_id + active-only (authority)');
const fnStart = foldersStore.indexOf('async function operational5OrphanBindingCleanup');
const fnEnd = foldersStore.indexOf('function canonicalBindingStoreIdentity');
assert.ok(fnStart > 0 && fnEnd > fnStart, 'cleanup command body region resolves');
const fnBody = foldersStore.slice(fnStart, fnEnd);
assertIncludes(fnBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]', 'strict verified conjunction retained');
assertIncludes(fnBody, 'dryRun: !(applyRequested && gateSatisfied)', 'dry-run default retained');
assertIncludes(fnBody, "OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE", 'apply gate retained (apply only under gate)');
// authority not weakened to broad matching in the command
for (const banned of ['meta.oldFolderId', 'receiptMatches', 'folderBindingTombstoneMatches', 'stableStringify']) {
  assertNotIncludes(fnBody, banned, `cleanup command must not broad-match (${banned})`);
}

// ---------------------------------------------------------------------------
// (4) Boundaries hold in real source: productSyncReady false; WebDAV/fullBundle.v3 deferred; Chat Saving CAS blocked.
// ---------------------------------------------------------------------------
assert.ok(!foldersStore.includes('productSyncReady: true') && !foldersStore.includes('productSyncReady = true'),
  'folders store must not flip productSyncReady true');
assert.ok(!folderSync.includes('productSyncReady: true') && !folderSync.includes('productSyncReady = true'),
  'folder sync must not flip productSyncReady true');
assert.doesNotMatch(`${foldersStore}\n${folderSync}`, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');
assertIncludes(folderSync, "webdav: 'deferred'", 'folder sync WebDAV deferred');
assertIncludes(folderImport, "webdav: 'deferred'", 'folder import WebDAV deferred');
assertIncludes(webdavGates, 'product-sync-ready-false-guard', 'WebDAV productSyncReady false guard');
assertIncludes(chatSavingBoundary, 'encrypted CAS-over-transport lane', 'Chat Saving CAS boundary retained');
for (const tok of ['allowF7Fallback: true', 'f15AllowF7Fallback: true', 'explicitF7Fallback: true']) {
  assert.ok(!foldersStore.includes(tok), `no fallback token ${tok}`);
}

// ---------------------------------------------------------------------------
// (5) Decision model: with dangling raw != exportable and verifiedCount 0, the next action is review, not apply/flip.
// ---------------------------------------------------------------------------
function decide(state) {
  // Mirrors the recorded decision logic; no cleanup apply, no productSyncReady flip while debt is unreconciled.
  const rawReconciled = state.rawCanonicalBindingCount === state.exportableBindingCount;
  const cleanupExhausted = state.dryRun === true && state.verifiedCount === 0 && state.candidateCount > 0;
  const productSyncReadyEligible = rawReconciled; // source-of-truth reconciliation is a blocking local gate
  const controlledApplyAllowed = false;           // never allowed from a decision slice; strict + gated + dry-run-first only
  let nextAction = 'manual-review-or-stricter-evidence-acquisition';
  if (rawReconciled) nextAction = 'reopen-reviewed-source-of-truth-readiness';
  return { rawReconciled, cleanupExhausted, productSyncReadyEligible, controlledApplyAllowed, nextAction };
}
const live = decide({ rawCanonicalBindingCount: 14, exportableBindingCount: 12, candidateCount: 2, verifiedCount: 0, dryRun: true });
assert.equal(live.rawReconciled, false, 'model: raw 14 != exportable 12 -> not reconciled');
assert.equal(live.cleanupExhausted, true, 'model: dry-run verifiedCount 0 -> automated cleanup exhausted');
assert.equal(live.productSyncReadyEligible, false, 'model: productSyncReady cannot flip while unreconciled');
assert.equal(live.controlledApplyAllowed, false, 'model: controlled apply not allowed');
assert.equal(live.nextAction, 'manual-review-or-stricter-evidence-acquisition', 'model: next action is manual review / stricter evidence');
// counter-check: even a hypothetical reconciled state does not auto-apply or auto-flip; it only reopens a reviewed decision
const reconciled = decide({ rawCanonicalBindingCount: 12, exportableBindingCount: 12, candidateCount: 0, verifiedCount: 0, dryRun: true });
assert.equal(reconciled.controlledApplyAllowed, false, 'model: reconciled state still does not auto-apply');
assert.equal(reconciled.nextAction, 'reopen-reviewed-source-of-truth-readiness', 'model: reconciled -> reopen reviewed readiness (not automatic flip)');

const result = {
  schema: 'h2o.studio.operational5.orphan-binding-cleanup-manual-review-blocker-decision.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-orphan-binding-cleanup-manual-review-blocker-decision',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_CLEANUP_MANUAL_REVIEW_BLOCKER_RECORDED',
  dryRunSafeFailedVerifiedCountZero: true,
  strictTombstoneVerificationIsAuthority: true,
  controlledApplyBlocked: true,
  productSyncReadyCanFlip: false,
  productSyncReady: false,
  rawCanonicalBindingCount: 14,
  exportableBindingCount: 12,
  fullBundleV2Projection: 12,
  nextAction: 'manual-review-or-stricter-evidence-acquisition',
  cleanupApplyIsNextAction: false,
  staleValidatorsFoldedIn: false,
  webdavCloudRelayBlocked: true,
  fullBundleV3Started: false,
  chatSavingCasBlocked: true,
  liveApplyRun: false,
  productSyncReadyFlipped: false,
  next: 'manual operator review of the two tokenized rows (read-only); reviewed dry-run-first B/C/E only if legitimate strict evidence is acquired',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-cleanup-manual-review-blocker-decision');
