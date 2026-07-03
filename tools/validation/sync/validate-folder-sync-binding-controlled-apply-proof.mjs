#!/usr/bin/env node
//
// Folder Sync — Binding repair controlled-apply proof meta-validator (evidence only; records a live apply).
//
// Verifies the binding controlled-apply doc exists and is internally consistent: references the binding
// implementation (d4d5db19) and binding live dry-run (d139e062) commits; records verdict BINDING CONTROLLED
// APPLY PASSED + schema binding-controlled-apply-candidate-safe.v1 + status passed; records applyTruePassed/
// applyGatePassed; records the dry-run precheck (status dry-run, canonicalBindingWriteCount 0) BEFORE the gated
// apply; records the controlled apply (status applied, reason binding-repair-applied, canonicalBindingWriteCount
// 1, idempotencyPersisted true, afterMatchesRequested true, beforeChangedAfterApply true, mirrorWriteCount 0,
// tombstoneWriteCount 0, consumedOperationCountDelta null/not-measured); keeps productSyncReady false, WebDAV/
// cloud/relay + Chat Saving CAS blocked, and binding-mismatch blocked. It grounds anchors against REAL SOURCE
// (binding request/receipt schema + apply gate present; productSyncReady not flipped; no fullBundle.v3; webdav
// deferred; S2b sortOrder marker intact; binding-mismatch still in F11 blockedClasses). No write; no live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-controlled-apply-proof.md';
const implDoc = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const chatSavingBoundaryValidator = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const IMPL_COMMIT = 'd4d5db19';
const DRYRUN_COMMIT = 'd139e062';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const BINDING_APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';
const CONTROLLED_APPLY_SCHEMA = 'h2o.studio.folder-sync.binding-controlled-apply-candidate-safe.v1';
const S2B_MARKER = 'applied-sortorder-preserving-s2b';

// ---- doc presence ----
assert(exists(doc), `${doc}: missing`);
if (!exists(doc)) {
  console.error('FAIL validate-folder-sync-binding-controlled-apply-proof');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const text = read(doc);
assert(text.length > 3000, `${doc}: doc too short`);
const flat = text.replace(/\s+/g, ' ');

// ---- provenance + verdict ----
assert(flat.includes(IMPL_COMMIT), `doc must reference binding implementation commit ${IMPL_COMMIT}`);
assert(flat.includes(DRYRUN_COMMIT), `doc must reference binding live dry-run commit ${DRYRUN_COMMIT}`);
assert(/BINDING CONTROLLED APPLY PASSED/.test(flat), 'doc must carry the BINDING CONTROLLED APPLY PASSED verdict');
assert(flat.includes(CONTROLLED_APPLY_SCHEMA), `doc must record the controlled-apply schema ${CONTROLLED_APPLY_SCHEMA}`);
assert(/"status":\s*"passed"/.test(flat), 'doc must record status passed');
assert(/"applyTruePassed":\s*true/.test(flat), 'doc must record applyTruePassed true');
assert(/"applyGatePassed":\s*true/.test(flat), 'doc must record applyGatePassed true');
assert(flat.includes(BINDING_APPLY_GATE), `doc must record the binding apply gate ${BINDING_APPLY_GATE}`);

// ---- dry-run precheck BEFORE apply ----
assert(/dry-run-binding-repair-plan-ready/.test(flat), 'doc must record the dry-run plan-ready reason');
assert(/"status":\s*"dry-run"/.test(flat), 'doc must record dry-run precheck status dry-run');
assert(/"canonicalBindingWriteCount":\s*0/.test(flat), 'doc must record dry-run canonicalBindingWriteCount 0');

// ---- controlled apply ----
assert(/"status":\s*"applied"/.test(flat), 'doc must record controlled apply status applied');
assert(/"reason":\s*"binding-repair-applied"/.test(flat), 'doc must record reason binding-repair-applied');
assert(/"canonicalBindingWriteCount":\s*1/.test(flat), 'doc must record canonicalBindingWriteCount 1');
assert(/"idempotencyPersisted":\s*true/.test(flat), 'doc must record idempotencyPersisted true');
assert(/"afterMatchesRequested":\s*true/.test(flat), 'doc must record afterMatchesRequested true');
assert(/"beforeChangedAfterApply":\s*true/.test(flat), 'doc must record beforeChangedAfterApply true');
assert(/"mirrorWriteCount":\s*0/.test(flat), 'doc must record mirrorWriteCount 0');
assert(/"tombstoneWriteCount":\s*0/.test(flat), 'doc must record tombstoneWriteCount 0');
assert(/"consumedOperationCountDelta":\s*null/.test(flat) && /NOT measured|not measured|not[- ]measured/i.test(flat),
  'doc must record consumedOperationCountDelta null / not measured (no ledger delta claim)');

// ---- blocked boundaries ----
assert(/"bindingMismatchStillBlocked":\s*true/.test(flat), 'doc must record bindingMismatchStillBlocked true');
assert(/`?binding-mismatch`? (remains|stays) BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'doc must state binding-mismatch remains blocked until a later allowed-set flip');
assert(/NOT an? (F11\/S5 )?allowed-set flip|proves live controlled apply, NOT/i.test(flat),
  'doc must state this proves controlled apply, not an allowed-set flip');
assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
assert(/WebDAV ?\/ ?cloud ?\/ ?relay remains `?blocked`?/i.test(flat), 'doc must keep WebDAV/cloud/relay blocked');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains `?blocked`?/i.test(flat), 'doc must keep Chat Saving CAS blocked');

// ---- REAL SOURCE anchors ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must exist in source');
  assert(src.includes("CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '" + BINDING_RECEIPT_SCHEMA + "'"), 'binding receipt schema must exist in source');
  assert(src.includes("CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '" + BINDING_APPLY_GATE + "'"), 'binding apply gate must exist in source');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'fullBundle must remain v2');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3 introduced');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred (no cloud/relay/CAS transport)');
  assert(src.includes(S2B_MARKER), 'S2b sortOrder-preserving mirror marker must remain intact in source');
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'F11 must STILL block binding-mismatch (binding allowed-set flip not yet performed)');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-import.mv3.js');
assert(exists(chatSavingBoundaryValidator), 'Chat Saving archive-cloud boundary validator must remain present (boundary held)');
assert(exists(implDoc), 'binding implementation evidence doc must exist on disk');

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-controlled-apply-proof');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-controlled-apply-proof.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-controlled-apply',
  doc,
  verdict: 'BINDING-CONTROLLED-APPLY-PASSED',
  implCommitReferenced: IMPL_COMMIT,
  dryRunCommitReferenced: DRYRUN_COMMIT,
  applyTruePassed: true,
  applyGatePassed: true,
  applyGate: BINDING_APPLY_GATE,
  dryRunPrecheckStatus: 'dry-run',
  dryRunCanonicalBindingWriteCount: 0,
  controlledApplyStatus: 'applied',
  controlledApplyReason: 'binding-repair-applied',
  canonicalBindingWriteCount: 1,
  idempotencyPersisted: true,
  afterMatchesRequested: true,
  beforeChangedAfterApply: true,
  mirrorWriteCount: 0,
  tombstoneWriteCount: 0,
  consumedOperationCountDelta: null,
  consumedOperationCountDeltaMeasured: false,
  bindingMismatchStillBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  bindingRequestSchemaPresent: true,
  bindingReceiptSchemaPresent: true,
  bindingApplyGatePresent: true,
  fullBundleV3Present: false,
  s2bMarkerIntact: true,
  allowedSetFlip: false,
  recommendedNext: 'binding post-apply readback/idempotency proof OR binding allowed-set preflight (design-only); NOT productSyncReady/WebDAV/CAS',
}, null, 2));
console.log('PASS validate-folder-sync-binding-controlled-apply-proof');
