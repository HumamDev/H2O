#!/usr/bin/env node
//
// Folder Sync — F15-settled binding repair-write fix preflight (design-only) meta-validator.
//
// Verifies the preflight doc exists and is consistent with REAL SOURCE: it records the true revert vector
// (bare/legacy repair write overwritten by the authorized F15 settlement path), selects the F15-settled
// delegation as the fix (no new Rust, no f16 guard enablement, no new writer identity), requires the busy-aware
// durable gate + post-apply-binding-hash-mismatch to remain, enumerates the required future validators + the
// live reconcile-survival proof, and keeps every release gate blocked. It grounds anchors against source
// (delegateF15FolderBindingWrite + the bare repair path + explicitF7Fallback; durable gate + busy-aware fence;
// h2o_writer_identity + f16 guard disabled; binding-mismatch blocked; productSyncReady not flipped; no CAS).
// Design-only: no product source edited; no live apply.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-f15-settled-repair-write-preflight.md';
const investigationDoc = 'release-evidence/2026-07-01/folder-sync-binding-persistence-rust-writer-investigation.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) failures.push(msg); }

const INVESTIGATION_COMMIT = '7dd1e069';
const BUSY_FENCE_COMMIT = 'a2864ad6';
const DURABLE_GATE_COMMIT = '71616328';
const SOURCE_FIX_PREFLIGHT_COMMIT = '3afd4058';
const EARLIER = ['5c89ba95', 'd46f0805', '132002b6', 'd4d5db19'];

// ---- doc ----
assert(exists(doc), `${doc}: missing`);
if (exists(doc)) {
  const flat = read(doc).replace(/\s+/g, ' ');
  assert(/BINDING F15-SETTLED REPAIR-WRITE PREFLIGHT READY/.test(flat), 'doc must carry the preflight-ready verdict');
  assert(/design-only/i.test(flat) && /NOT implemented|not the final|no product source/i.test(flat), 'doc must state design-only / not implemented');
  // provenance
  assert(flat.includes(INVESTIGATION_COMMIT), `doc must reference the investigation commit ${INVESTIGATION_COMMIT}`);
  assert(flat.includes(BUSY_FENCE_COMMIT), `doc must reference the busy-aware fence commit ${BUSY_FENCE_COMMIT}`);
  assert(flat.includes(DURABLE_GATE_COMMIT), `doc must reference the durable-gate commit ${DURABLE_GATE_COMMIT}`);
  assert(flat.includes(SOURCE_FIX_PREFLIGHT_COMMIT), `doc must reference the source-fix preflight commit ${SOURCE_FIX_PREFLIGHT_COMMIT}`);
  for (const c of EARLIER) assert(flat.includes(c), `doc should reference earlier blocker commit ${c}`);
  // true revert vector + bare path
  assert(/true revert vector/i.test(flat), 'doc must record the true revert vector');
  assert(/bare ?\/? ?legacy|bare\/legacy path/i.test(flat) && /moveCanonicalChatFolderBinding/.test(flat), 'doc must record the bare/legacy repair write path');
  assert(/does NOT update the F15-settled|not update the F15-settled|does not update the F15/i.test(flat), 'doc must state the bare write does not update the F15-settled source-of-truth');
  // selected fix
  assert(/delegateF15FolderBindingWrite/.test(flat) && /F15[- ]settled/i.test(flat), 'doc must select the F15-settled delegation as the fix path');
  assert(/No new Rust|no new Rust/i.test(flat), 'doc must state no new Rust is required');
  assert(/f16[^.]*trigger guard[^.]*(not enabled|stays 0|not enable)/i.test(flat), 'doc must state no f16 trigger guard enablement');
  assert(/no new .*writer identity|reuse the existing settlement delegation|No new `?h2o_writer_identity/i.test(flat), 'doc must state no new writer-identity routing');
  assert(/busy-aware durable gate remains|busy-aware fence/i.test(flat), 'doc must keep the busy-aware durable gate required');
  assert(/post-apply-binding-hash-mismatch/.test(flat), 'doc must keep the existing hash gate required');
  assert(/explicitF7Fallback/.test(flat), 'doc must record the explicitF7Fallback usage to remove');
  // required validators / live proof
  assert(/settled-write routing|routing validator/i.test(flat), 'doc must require a settled-write routing validator');
  assert(/reconcile-survival/i.test(flat), 'doc must require a reconcile-survival validator/proof');
  assert(/ledger-contingency/i.test(flat), 'doc must require a ledger-contingency validator');
  assert(/live reload|reconcile-survival proof/i.test(flat), 'doc must record the live reload + reconcile-survival proof sequence');
  // boundaries
  assert(/No live apply retry is approved|No live apply/i.test(flat), 'doc must record no live apply approved');
  assert(/`?binding-mismatch`? remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'doc must keep binding-mismatch blocked');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
  assert(/WebDAV\/cloud\/relay remains blocked/i.test(flat), 'doc must keep WebDAV/cloud/relay blocked');
  assert(/Chat Saving[^.]*CAS remains blocked/i.test(flat), 'doc must keep Chat Saving CAS blocked');
  assert(/no binding allowed-set flip|before .*reconcile-survival/i.test(flat), 'doc must forbid a binding allowed-set flip before the live proof');
  assert(exists(investigationDoc), 'investigation evidence doc must exist on disk');
}

// ---- REAL SOURCE anchors ----
assert(exists(foldersStorePath), `${foldersStorePath}: missing`);
if (exists(foldersStorePath)) {
  const store = read(foldersStorePath);
  assert(store.includes('function delegateF15FolderBindingWrite('), 'F15-settled delegation function must exist (the fix target)');
  assert(store.includes('function f15FolderBindingDelegationEnabled('), 'F15 delegation gate function must exist');
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'bare folder_bindings write path must exist (repair/legacy)');
  assert(store.includes('function confirmCanonicalChatFolderBindingDurable('), 'durable helper must remain present');
  assert(store.includes('parsed.busy === 1'), 'busy-aware fence must remain present');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"), 'F11 must STILL block binding-mismatch');
}
assert(exists(folderSyncPath), `${folderSyncPath}: missing`);
if (exists(folderSyncPath)) {
  const src = read(folderSyncPath);
  // Superseded by the F15-settled implementation: the repair now routes through useF15FolderBindingDelegation
  // and no longer sets explicitF7Fallback:true (the design-only preflight recorded the pre-fix bare-path state).
  assert(src.includes('useF15FolderBindingDelegation: true') && !src.includes('explicitF7Fallback: true'),
    'F15-settled fix landed: repair routes through useF15FolderBindingDelegation and no longer sets explicitF7Fallback:true');
  assert(src.includes('post-apply-binding-hash-mismatch'), 'existing hash gate must remain');
  assert(src.includes('confirmCanonicalChatFolderBindingDurable('), 'handler must still call the durable helper');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
}
assert(exists(rustLibPath) && read(rustLibPath).includes('h2o_writer_identity') && read(rustLibPath).includes('f16_folder_bindings_trigger_guard'),
  'Rust anchors (h2o_writer_identity + f16 folder_bindings guard) must remain present (inspect-only)');
assert(exists(archiveBoundaryPath), 'Chat Saving archive-cloud boundary validator must remain present');

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-f15-settled-repair-write-preflight');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-f15-settled-repair-write-preflight.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settled-repair-write-preflight',
  doc,
  verdict: 'BINDING-F15-SETTLED-REPAIR-WRITE-PREFLIGHT-READY',
  designOnly: true,
  fixImplemented: false,
  trueRevertVector: 'bare/legacy repair write (moveCanonicalChatFolderBinding + explicitF7Fallback) overwritten by the authorized F15 settlement/materialization path',
  selectedFixPath: 'route binding repair through delegateF15FolderBindingWrite (F15-settled); applied/consume require durable AND settled AND reconcile-survival',
  newRustRequired: false,
  f16TriggerGuardEnablement: false,
  newWriterIdentityRouting: false,
  busyAwareGateRetained: true,
  postApplyHashGateRetained: true,
  requiredValidators: [
    'settled-write-routing', 'no-explicitF7Fallback-on-normal-repair', 'settlement-reconcile-survival',
    'ledger-contingency', 'durable-busy-aware-gate-retention', 'live-reload-reconcile-survival-proof',
  ],
  investigationCommit: INVESTIGATION_COMMIT,
  liveApplyApproved: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'implement F15-settled repair-write routing (JS only) with reconcile-survival validators; live retry only after that, separately approved',
}, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settled-repair-write-preflight');
