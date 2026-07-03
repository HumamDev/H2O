#!/usr/bin/env node
//
// Folder Sync — Binding state-source diagnostic meta-validator (evidence only; read-only diagnostic).
//
// Verifies the binding state-source diagnostic doc exists and is internally consistent: references the binding
// implementation (d4d5db19), controlled-apply proof (5c89ba95), and readback-blocked (d46f0805) commits; records
// verdict BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER; records that snapshot/store/
// direct-SQL all equal the OLD before hash (currentEqualsOldBeforeHash:true, currentEqualsRequestedAppliedHash:
// false, the three cross-match booleans true); records the consumed binding-repair ledger row
// (consumedBindingRepairRows:1) while stating the ledger alone does not prove canonical persistence; records the
// read-only posture (readOnly:true / calledApply:false / applyGatePassed:false / applyTruePassed:false); keeps
// binding-mismatch blocked, productSyncReady false, WebDAV/cloud/relay + Chat Saving CAS blocked. It grounds
// anchors against REAL SOURCE (binding request/receipt schema + apply gate present; productSyncReady not flipped;
// no fullBundle.v3; webdav deferred; binding-mismatch still in F11 blockedClasses; Chat Saving boundary validator
// present). No write; no live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-state-source-diagnostic.md';
const readbackDoc = 'release-evidence/2026-07-01/folder-sync-binding-post-apply-readback-blocked.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const chatSavingBoundaryValidator = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const IMPL_COMMIT = 'd4d5db19';
const CONTROLLED_APPLY_COMMIT = '5c89ba95';
const READBACK_BLOCKED_COMMIT = 'd46f0805';
const DIAG_SCHEMA = 'h2o.studio.folder-sync.binding-state-source-diagnostic.v1';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const BINDING_APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';
const OLD_BEFORE_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:d53244603643dd1bf8efb36fcafa8b8ca5543e4d4da8d6ce2d9798a8ac487869';

// ---- doc presence ----
assert(exists(doc), `${doc}: missing`);
if (!exists(doc)) {
  console.error('FAIL validate-folder-sync-binding-state-source-diagnostic');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const text = read(doc);
assert(text.length > 3000, `${doc}: doc too short`);
const flat = text.replace(/\s+/g, ' ');

// ---- provenance + verdict ----
assert(flat.includes(IMPL_COMMIT), `doc must reference binding implementation commit ${IMPL_COMMIT}`);
assert(flat.includes(CONTROLLED_APPLY_COMMIT), `doc must reference binding controlled-apply proof commit ${CONTROLLED_APPLY_COMMIT}`);
assert(flat.includes(READBACK_BLOCKED_COMMIT), `doc must reference binding readback-blocked commit ${READBACK_BLOCKED_COMMIT}`);
assert(/BINDING STATE-SOURCE DIAGNOSTIC CONFIRMS CANONICAL PERSISTENCE BLOCKER/.test(flat), 'doc must carry the canonical-persistence-blocker verdict');
assert(flat.includes(DIAG_SCHEMA), `doc must record the diagnostic schema ${DIAG_SCHEMA}`);

// ---- read-only posture ----
assert(/"readOnly":\s*true/.test(flat), 'doc must record readOnly:true');
assert(/"calledApply":\s*false/.test(flat), 'doc must record calledApply:false');
assert(/"applyGatePassed":\s*false/.test(flat), 'doc must record applyGatePassed:false');
assert(/"applyTruePassed":\s*false/.test(flat), 'doc must record applyTruePassed:false');

// ---- snapshot/store/direct SQL all agree on the OLD hash ----
assert((flat.match(new RegExp(OLD_BEFORE_HASH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 4,
  'doc must show snapshot/store/directSql (and expectedBefore) all equal the OLD before hash');
assert(flat.includes(REQUESTED_HASH), 'doc must record the requested/applied target hash');
assert(/"snapshotMatchesStore":\s*true/.test(flat), 'doc must record snapshotMatchesStore:true');
assert(/"snapshotMatchesDirectSql":\s*true/.test(flat), 'doc must record snapshotMatchesDirectSql:true');
assert(/"storeMatchesDirectSql":\s*true/.test(flat), 'doc must record storeMatchesDirectSql:true');
assert(/"currentEqualsOldBeforeHash":\s*true/.test(flat), 'doc must record currentEqualsOldBeforeHash:true');
assert(/"currentEqualsRequestedAppliedHash":\s*false/.test(flat), 'doc must record currentEqualsRequestedAppliedHash:false');
assert(/"snapshotRows":\s*14/.test(flat) && /"storeRows":\s*14/.test(flat) && /"directSqlRows":\s*14/.test(flat),
  'doc must record the agreeing 14-row counts across snapshot/store/directSql');

// ---- consumed ledger row exists but does not prove persistence ----
assert(/"consumedBindingRepairRows":\s*1/.test(flat), 'doc must record consumedBindingRepairRows:1');
assert(/"operationKind":\s*"chat-folder-binding-repair"/.test(flat), 'doc must record the consumed operationKind');
assert(/consumed[- ]?ledger row (exists|ALONE|nonetheless)|ledger row ALONE does not prove|does not prove canonical persistence/i.test(flat),
  'doc must state the consumed ledger row alone does not prove canonical persistence');
assert(/mirror also differs|mirror also/i.test(flat) && /direct SQLite (is also old|being old|itself is still old)/i.test(flat),
  'doc must state the mirror differs too but the deeper problem is direct SQLite is also old');

// ---- blocked boundaries ----
assert(/"bindingMismatchStillBlocked":\s*true/.test(flat), 'doc must record bindingMismatchStillBlocked:true');
assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
assert(/WebDAV ?\/ ?cloud ?\/ ?relay remains `?blocked`?/i.test(flat), 'doc must keep WebDAV/cloud/relay blocked');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains `?blocked`?/i.test(flat), 'doc must keep Chat Saving CAS blocked');
assert(/source-level[^.]*persistence review|persistence review \/ fix plan|not another blind apply retry/i.test(flat),
  'doc must recommend a source-level persistence review/fix, not a blind apply retry or allowed-set flip');

// ---- REAL SOURCE anchors ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must exist in source');
  assert(src.includes("CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '" + BINDING_RECEIPT_SCHEMA + "'"), 'binding receipt schema must exist in source');
  assert(src.includes("CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '" + BINDING_APPLY_GATE + "'"), 'binding apply gate must exist in source');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3 introduced');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred (no cloud/relay/CAS transport)');
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'F11 must STILL block binding-mismatch (binding allowed-set flip not performed)');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-import.mv3.js');
assert(exists(chatSavingBoundaryValidator), 'Chat Saving archive-cloud boundary validator must remain present (boundary held)');

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-state-source-diagnostic');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-state-source-diagnostic-proof.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-state-source-diagnostic',
  doc,
  verdict: 'CANONICAL-PERSISTENCE-BLOCKER-CONFIRMED',
  readOnly: true,
  calledApply: false,
  applyGatePassed: false,
  applyTruePassed: false,
  implCommitReferenced: IMPL_COMMIT,
  controlledApplyCommitReferenced: CONTROLLED_APPLY_COMMIT,
  readbackBlockedCommitReferenced: READBACK_BLOCKED_COMMIT,
  snapshotStoreDirectSqlAgreeOnOldHash: true,
  currentEqualsOldBeforeHash: true,
  currentEqualsRequestedAppliedHash: false,
  consumedBindingRepairRows: 1,
  consumedLedgerAloneProvesPersistence: false,
  mirrorMatchesSnapshot: false,
  bindingMismatchStillBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  bindingRequestSchemaPresent: true,
  bindingReceiptSchemaPresent: true,
  bindingApplyGatePresent: true,
  fullBundleV3Present: false,
  recommendedNext: 'source-level binding persistence review / fix plan (why moveCanonicalChatFolderBinding recorded a consumed ledger row + applied receipt while folder_bindings did not advance); NOT a blind apply retry, NOT an allowed-set flip',
}, null, 2));
console.log('PASS validate-folder-sync-binding-state-source-diagnostic');
