#!/usr/bin/env node
//
// Operational.5 - reviewed orphan-binding cleanup command implementation validator.
//
// Proves the dedicated reviewed cleanup command `operational5OrphanBindingCleanup` (in store/folders.tauri.js) is:
//   - dry-run by default; the scoped exact-row DELETE fires ONLY under the explicit reviewed apply gate
//     (`operational5-orphan-binding-cleanup-apply`);
//   - exact-row + tombstone verified (safe desktop-canonical shape + folder tombstone + folderBinding tombstone +
//     folder absent from current canonical folders); exportable rows (folder present) are never candidates;
//   - receipt-backed, redacted/hash-only, scoped-delete only (no bare/delete-all folder_bindings SQL);
//   - non-destructive (never deletes folders/chats/tombstones/ledgers/receipts/render-mirror; creates no tombstone);
//   - idempotent (dry-run zero-write; apply removes exactly the verified rows; duplicate apply zero-write);
//   - releasing NO boundary (productSyncReady stays false; no WebDAV/cloud/relay/fullBundle.v3; no Chat Saving CAS;
//     no fallback).
// It also models the gate/dry-run/verify/idempotency decision logic to confirm dry-run writes zero rows, apply is
// gated, exportable rows are preserved, raw count drops 14 -> 12 only under a gated apply, and a duplicate apply is
// zero-write. This slice runs NO live cleanup apply.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/operational5-orphan-binding-cleanup-implementation.md';
const designPath = 'release-evidence/2026-07-01/operational5-dangling-binding-cleanup-design-preflight.md';
const diagnosticPath = 'release-evidence/2026-07-01/operational5-dangling-binding-row-level-diagnostic.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function compact(v) { return String(v).replace(/\s+/g, ' '); }
function assertIncludes(src, tok, label) { assert.ok(src.includes(tok), `${label}: missing ${tok}`); }

for (const rel of [evidencePath, designPath, diagnosticPath, foldersStorePath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);

// ---------------------------------------------------------------------------
// (1) Evidence anchors the real command contract.
// ---------------------------------------------------------------------------
for (const token of [
  'OPERATIONAL.5 REVIEWED ORPHAN-BINDING CLEANUP COMMAND IMPLEMENTED',
  'SOURCE + VALIDATOR + EVIDENCE ONLY; NO LIVE APPLY RUN',
  'operational5-orphan-binding-cleanup-apply',
  'h2o.studio.folder-sync.operational5-orphan-binding-cleanup.v1',
  'h2o.studio.folder-sync.operational5-orphan-binding-cleanup-receipt.v1',
  'dryRun = !(opts.apply === true && opts.gate ===',
  'blocked-apply-gate-required',
  'dry-run-orphan-binding-cleanup-ready',
  'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
  "getTombstone('folder', folderTombstoneRecordId(folderId))",
  "getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))",
  'already-removed-idempotent',
  'exportable canonical bindings = 12',
  'fullBundle.v2 projection = 12',
  'raw canonical count drops 14 -> 12',
  '`productSyncReady` remains `false`',
  'WebDAV/cloud/relay/`fullBundle.v3`',
  'Chat Saving WebDAV/cloud/archive CAS',
  'No live cleanup apply was run',
  'No fallback (`allowF7Fallback`',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

for (const forbidden of [
  'productSyncReady is true',
  'ran the live apply',
  'live apply completed',
  'WebDAV write performed',
  'deleted the folder tombstone',
]) {
  assert.ok(!flat.includes(forbidden), `cleanup evidence must not claim: ${forbidden}`);
}

// Design + diagnostic preflights referenced.
assertIncludes(compact(read(designPath)), 'folderBinding tombstone', 'design preflight present');
assertIncludes(compact(read(diagnosticPath)), 'folderBinding', 'row-level diagnostic present');

// ---------------------------------------------------------------------------
// (2) REAL SOURCE anchors: the command exists, is gated, dry-run default, scoped-delete only.
// ---------------------------------------------------------------------------
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE = 'operational5-orphan-binding-cleanup-apply'", 'apply gate const present');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_CLEANUP_SCHEMA = 'h2o.studio.folder-sync.operational5-orphan-binding-cleanup.v1'", 'result schema const present');
assertIncludes(foldersStore, "OPERATIONAL5_ORPHAN_BINDING_CLEANUP_RECEIPT_SCHEMA = 'h2o.studio.folder-sync.operational5-orphan-binding-cleanup-receipt.v1'", 'receipt schema const present');
assertIncludes(foldersStore, 'async function operational5OrphanBindingCleanup(opts)', 'cleanup command present');
assertIncludes(foldersStore, 'async function operational5RedactToken(id)', 'redact helper present');
assertIncludes(foldersStore, 'operational5OrphanBindingCleanup: operational5OrphanBindingCleanup,', 'cleanup exposed on store.folders api');
assertIncludes(foldersStore, 'var gateSatisfied = cleanString(opts.gate) === OPERATIONAL5_ORPHAN_BINDING_CLEANUP_APPLY_GATE', 'gate check present');
assertIncludes(foldersStore, 'dryRun: !(applyRequested && gateSatisfied)', 'dry-run default (apply+gate required to leave dry-run)');

// Function body region for targeted checks.
const fnStart = foldersStore.indexOf('async function operational5OrphanBindingCleanup');
const fnEnd = foldersStore.indexOf('function canonicalBindingStoreIdentity');
assert.ok(fnStart > 0 && fnEnd > fnStart, 'cleanup function body region resolves');
const fnBody = foldersStore.slice(fnStart, fnEnd);

// Exact-row + tombstone verification inside the command.
assertIncludes(fnBody, "row.source === 'desktop-canonical-folder-bindings-sqlite'", 'safe desktop-canonical shape check');
assertIncludes(fnBody, "row.sourceSurface === 'desktop-studio'", 'safe shape: sourceSurface');
assertIncludes(fnBody, "row.authority === 'desktop'", 'safe shape: authority');
assertIncludes(fnBody, "row.status === 'active' && row.state === 'active'", 'safe shape: status/state active');
assertIncludes(fnBody, "row.noHardDelete === true && row.noPurge === true && row.noChatDelete === true", 'safe shape: safety booleans');
assertIncludes(fnBody, "tombstones.getTombstone('folder', folderTombstoneRecordId(folderId))", 'folder tombstone lookup');
assertIncludes(fnBody, "tombstones.getTombstone('folderBinding', 'folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId))", 'folderBinding tombstone lookup');
assertIncludes(fnBody, 'var verified = safeShape && !!folderTomb && !!bindingTomb && !canonicalFolderIds[folderId]', 'verified = shape + both tombstones + folder-absent');
assertIncludes(fnBody, 'if (canonicalFolderIds[folderId]) { result.exportableBindingCount += 1; continue; }', 'exportable rows counted + skipped (never removed)');

// Scoped, exact-row DELETE only + idempotency + status transitions.
assertIncludes(fnBody, "'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?'", 'scoped exact-row delete');
assertIncludes(fnBody, "candidateRef.status = 'already-removed-idempotent'", 'idempotent re-check (duplicate apply zero-write)');
assertIncludes(fnBody, "result.status = 'blocked-apply-gate-required'", 'apply-without-gate blocked');
assertIncludes(fnBody, "result.status = 'dry-run-orphan-binding-cleanup-ready'", 'dry-run status');
assertIncludes(fnBody, "result.status = 'applied-orphan-binding-cleanup'", 'applied status');

// Receipt-backed + redacted/hash-only.
assertIncludes(fnBody, 'schema: OPERATIONAL5_ORPHAN_BINDING_CLEANUP_RECEIPT_SCHEMA', 'cleanup receipt minted');
assertIncludes(fnBody, 'chatToken: await operational5RedactToken(chatId)', 'candidate chat id redacted');
assertIncludes(fnBody, 'folderToken: await operational5RedactToken(folderId)', 'candidate folder id redacted');
assertIncludes(fnBody, 'privacy: { redacted: true, hashOnly: true }', 'redacted/hash-only result');
assertIncludes(fnBody, 'verifiedExactRows', 'exact ids held internally for the scoped delete');

// Safety flags asserted on the result.
for (const flag of [
  'noHardDelete: true', 'noPurge: true', 'noChatDelete: true', 'noFolderDelete: true',
  'noTombstoneMutation: true', 'noTombstoneCreate: true', 'noReceiptDelete: true', 'noLedgerMutation: true',
  'noRenderMirrorWrite: true', 'noExportableBindingRemoval: true', 'noBareDeleteAll: true',
  'noChromeCanonicalMutation: true', 'noWebdavWrite: true', 'noChatSavingCas: true', 'productSyncReady: false',
]) {
  assertIncludes(fnBody, flag, `cleanup result safety flag ${flag}`);
}

// ---------------------------------------------------------------------------
// (3) Non-destructive: no bare/delete-all folder_bindings anywhere; command touches no folder/chat/tombstone delete.
// ---------------------------------------------------------------------------
// No bare/delete-all folder_bindings SQL anywhere in the store (every real delete is WHERE-scoped).
assert.ok(!/DELETE\s+FROM\s+folder_bindings\s*(?:;|['"`])/i.test(foldersStore),
  'no bare/delete-all folder_bindings SQL (all deletes must be WHERE-scoped)');
// The cleanup command itself performs no destructive folder/chat/tombstone/schema operation and no binding writer call.
for (const banned of [
  'DELETE FROM folders', 'DELETE FROM chats', 'DROP TABLE', 'TRUNCATE',
  'deleteTombstone', 'removeTombstone', 'purgeTombstone',
  'deleteFolder(', 'deleteChat(', 'bindChat(', 'moveCanonicalChatFolderBinding', 'unbindChat(',
  'productSyncReady: true', 'productSyncReady = true',
]) {
  assert.ok(!fnBody.includes(banned), `cleanup command must not contain: ${banned}`);
}
// No fallback anywhere in the store touched by this slice.
for (const tok of ['allowF7Fallback: true', 'f15AllowF7Fallback: true', 'explicitF7Fallback: true']) {
  assert.ok(!foldersStore.includes(tok), `no fallback token ${tok}`);
}
// Prior gates/boundaries in the same file remain intact (not weakened by this slice).
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)', 'durable composite gate intact');
assertIncludes(foldersStore, 'async function runF15SettledBindingRestartConvergence', 'restart convergence intact');
assertIncludes(foldersStore, "reviewedRepairPathClasses: ['binding-mismatch']", 'S10 reviewed repair routing intact');
assertIncludes(foldersStore, 'noBindingRepair: true', 'render mirror remains render-only');
assert.ok(!foldersStore.includes('productSyncReady: true') && !foldersStore.includes('productSyncReady = true'),
  'productSyncReady must not be flipped true');
assert.doesNotMatch(foldersStore, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'no fullBundle.v3');

// ---------------------------------------------------------------------------
// (4) Behavioral model of the gate/dry-run/verify/idempotency decision logic (mirrors the real source semantics).
// ---------------------------------------------------------------------------
const GATE = 'operational5-orphan-binding-cleanup-apply';

function safeRow(chatId, folderId, extra) {
  return Object.assign({
    chatId, folderId,
    source: 'desktop-canonical-folder-bindings-sqlite', sourceSurface: 'desktop-studio', authority: 'desktop',
    status: 'active', state: 'active', noHardDelete: true, noPurge: true, noChatDelete: true,
  }, extra || {});
}

function simulateCleanup(state, opts) {
  opts = opts || {};
  const applyRequested = opts.apply === true;
  const gateSatisfied = String(opts.gate || '') === GATE;
  const dryRun = !(applyRequested && gateSatisfied);
  const rows = state.rows.map((r) => Object.assign({}, r));
  const folderIds = state.canonicalFolderIds;
  const res = {
    dryRun, ok: false, status: '',
    rawBefore: rows.length, rawAfter: rows.length,
    exportableBindingCount: 0, candidateCount: 0, verifiedCount: 0, removedCount: 0, skippedCount: 0,
    productSyncReady: false,
  };
  const verifiedExact = [];
  for (const row of rows) {
    const chatId = row.chatId; const folderId = row.folderId;
    if (!chatId || !folderId) continue;
    if (folderIds[folderId]) { res.exportableBindingCount += 1; continue; } // exportable -> never removed
    const safeShape = row.source === 'desktop-canonical-folder-bindings-sqlite' &&
      row.sourceSurface === 'desktop-studio' && row.authority === 'desktop' &&
      row.status === 'active' && row.state === 'active' &&
      row.noHardDelete === true && row.noPurge === true && row.noChatDelete === true;
    const folderTomb = !!state.folderTombstones[folderId];
    const bindingTomb = !!state.bindingTombstones['folderBinding:' + encodeURIComponent(chatId) + ':' + encodeURIComponent(folderId)];
    const verified = safeShape && folderTomb && bindingTomb && !folderIds[folderId];
    res.candidateCount += 1;
    if (verified) { res.verifiedCount += 1; verifiedExact.push({ chatId, folderId }); }
    else res.skippedCount += 1;
  }
  if (dryRun) {
    if (applyRequested && !gateSatisfied) { res.ok = false; res.status = 'blocked-apply-gate-required'; }
    else { res.ok = true; res.status = 'dry-run-orphan-binding-cleanup-ready'; }
    res.rawAfter = res.rawBefore; // zero write
    return { res, rows };
  }
  for (const t of verifiedExact) {
    const idx = rows.findIndex((r) => r.chatId === t.chatId && r.folderId === t.folderId);
    if (idx === -1) { res.skippedCount += 1; continue; } // already-removed-idempotent
    rows.splice(idx, 1);
    res.removedCount += 1;
  }
  res.rawAfter = rows.length;
  res.ok = true; res.status = 'applied-orphan-binding-cleanup';
  return { res, rows };
}

// State: 14 raw rows = 12 exportable (folder present) + 2 dangling (folder absent, both tombstones, safe shape).
function buildState() {
  const canonicalFolderIds = Object.create(null);
  const rows = [];
  for (let i = 0; i < 12; i += 1) { canonicalFolderIds['folder-' + i] = true; rows.push(safeRow('chat-' + i, 'folder-' + i)); }
  rows.push(safeRow('chatA', 'ghost-folder-A'));
  rows.push(safeRow('chatB', 'ghost-folder-B'));
  const folderTombstones = { 'ghost-folder-A': true, 'ghost-folder-B': true };
  const bindingTombstones = {
    ['folderBinding:' + encodeURIComponent('chatA') + ':' + encodeURIComponent('ghost-folder-A')]: true,
    ['folderBinding:' + encodeURIComponent('chatB') + ':' + encodeURIComponent('ghost-folder-B')]: true,
  };
  return { rows, canonicalFolderIds, folderTombstones, bindingTombstones };
}

// Test A - dry-run by default: zero write, 12 exportable preserved, 2 verified, raw stays 14.
{
  const { res } = simulateCleanup(buildState(), {});
  assert.equal(res.dryRun, true, 'A: default is dry-run');
  assert.equal(res.status, 'dry-run-orphan-binding-cleanup-ready', 'A: dry-run status');
  assert.equal(res.removedCount, 0, 'A: dry-run removes nothing');
  assert.equal(res.rawAfter, res.rawBefore, 'A: dry-run zero write');
  assert.equal(res.rawAfter, 14, 'A: raw stays 14 on dry-run');
  assert.equal(res.exportableBindingCount, 12, 'A: 12 exportable preserved');
  assert.equal(res.verifiedCount, 2, 'A: 2 verified dangling');
}

// Test B - apply without the gate is blocked, zero write.
{
  const { res } = simulateCleanup(buildState(), { apply: true, gate: 'wrong-gate' });
  assert.equal(res.dryRun, true, 'B: apply without gate stays dry-run');
  assert.equal(res.ok, false, 'B: apply without gate not ok');
  assert.equal(res.status, 'blocked-apply-gate-required', 'B: blocked status');
  assert.equal(res.removedCount, 0, 'B: blocked removes nothing');
  assert.equal(res.rawAfter, 14, 'B: raw stays 14 when blocked');
}

// Test C - gated apply removes exactly the 2 verified dangling rows; raw 14 -> 12; exportable untouched.
let afterApplyRows;
{
  const { res, rows } = simulateCleanup(buildState(), { apply: true, gate: GATE });
  assert.equal(res.dryRun, false, 'C: gated apply leaves dry-run');
  assert.equal(res.status, 'applied-orphan-binding-cleanup', 'C: applied status');
  assert.equal(res.removedCount, 2, 'C: removes exactly 2 verified rows');
  assert.equal(res.rawAfter, 12, 'C: raw drops 14 -> 12');
  assert.equal(res.exportableBindingCount, 12, 'C: 12 exportable untouched');
  // every remaining row has a present folder (no exportable removed)
  assert.ok(rows.every((r) => r.folderId.indexOf('ghost-folder') === -1), 'C: only ghost rows removed');
  afterApplyRows = rows;
}

// Test D - duplicate gated apply on the already-cleaned state is zero-write (idempotent).
{
  const state = buildState();
  state.rows = afterApplyRows; // dangling rows already gone
  const { res } = simulateCleanup(state, { apply: true, gate: GATE });
  assert.equal(res.removedCount, 0, 'D: duplicate apply removes nothing');
  assert.equal(res.verifiedCount, 0, 'D: no dangling candidates remain');
  assert.equal(res.rawAfter, 12, 'D: raw stays 12 on duplicate apply');
}

// Test E - a dangling row missing its folderBinding tombstone is NOT verified and is never removed, even under the gate.
{
  const state = buildState();
  // drop the binding tombstone for chatA/ghost-folder-A
  delete state.bindingTombstones['folderBinding:' + encodeURIComponent('chatA') + ':' + encodeURIComponent('ghost-folder-A')];
  const { res } = simulateCleanup(state, { apply: true, gate: GATE });
  assert.equal(res.verifiedCount, 1, 'E: only the fully tombstone-backed row verifies');
  assert.equal(res.removedCount, 1, 'E: removes only the verified row');
  assert.equal(res.rawAfter, 13, 'E: the un-tombstoned dangling row is retained (14 -> 13)');
}

const result = {
  schema: 'h2o.studio.folder-sync.operational5-orphan-binding-cleanup-implementation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'operational5-orphan-binding-cleanup-implementation',
  evidence: evidencePath,
  verdict: 'OPERATIONAL5_ORPHAN_BINDING_CLEANUP_IMPLEMENTED',
  command: 'operational5OrphanBindingCleanup',
  applyGate: 'operational5-orphan-binding-cleanup-apply',
  resultSchema: 'h2o.studio.folder-sync.operational5-orphan-binding-cleanup.v1',
  receiptSchema: 'h2o.studio.folder-sync.operational5-orphan-binding-cleanup-receipt.v1',
  dryRunDefault: true,
  applyGated: true,
  exactRowTombstoneVerified: true,
  scopedDeleteOnly: true,
  bareDeleteAll: false,
  exportablePreserved: 12,
  fullBundleV2Projection: 12,
  rawBeforeApply: 14,
  rawAfterApply: 12,
  idempotentDuplicateApply: true,
  destructiveFolderChatTombstoneDelete: false,
  tombstoneCreated: false,
  fallbackPresent: false,
  liveApplyRun: false,
  productSyncReadyFlipped: false,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  next: 'operator-controlled live dry-run (zero write), then reviewed controlled apply under the gate - not started here',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-operational5-orphan-binding-cleanup-implementation');
