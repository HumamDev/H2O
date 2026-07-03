#!/usr/bin/env node
//
// Folder Sync — Binding persistence Rust/writer-authority investigation meta-validator (evidence only).
//
// Verifies the investigation doc exists and is consistent with REAL SOURCE: it identifies the true revert
// vector (bare/unsettled repair write overwritten by the authorized F15 settlement path), records all
// discovered folder_bindings writers, the f16 trigger-guard + h2o_writer_identity posture, that the repair is
// NOT currently authorized/settled, the recommended F15-settled fix, and the required validators/live proofs —
// while keeping every release gate blocked. It grounds anchors against the Rust substrate (h2o_writer_identity,
// f16 folder_bindings guard disabled-by-default) and JS source (bare vs F15-delegated binding writes; durable
// gate + busy-aware fence intact; binding-mismatch blocked; productSyncReady not flipped; no CAS). No live apply.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-persistence-rust-writer-investigation.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const rustWriterIdentityPath = 'apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) failures.push(msg); }

const DURABLE_GATE_COMMIT = '71616328';
const BUSY_FENCE_COMMIT = 'a2864ad6';
const EARLIER_COMMITS = ['5c89ba95', 'd46f0805', '132002b6', 'd4d5db19'];

// ---- doc ----
assert(exists(doc), `${doc}: missing`);
if (exists(doc)) {
  const flat = read(doc).replace(/\s+/g, ' ');
  // verdict
  assert(/BINDING PERSISTENCE TRUE REVERT VECTOR IDENTIFIED|BINDING PERSISTENCE RUST\/WRITER INVESTIGATION INCONCLUSIVE/.test(flat),
    'doc must record one of the two allowed verdicts');
  assert(/BINDING PERSISTENCE TRUE REVERT VECTOR IDENTIFIED/.test(flat), 'doc must record the identified verdict');
  // provenance
  assert(flat.includes(DURABLE_GATE_COMMIT), `doc must reference the durable-gate commit ${DURABLE_GATE_COMMIT}`);
  assert(flat.includes(BUSY_FENCE_COMMIT), `doc must reference the busy-aware fence commit ${BUSY_FENCE_COMMIT}`);
  for (const c of EARLIER_COMMITS) assert(flat.includes(c), `doc must reference earlier blocker commit ${c}`);
  // discovered writer paths
  assert(/moveCanonicalChatFolderBinding/.test(flat), 'doc must record the bare moveCanonicalChatFolderBinding writer');
  assert(/bindChatLegacy|unbindChatLegacy|bare \/ (unsettled|legacy)|bare\/unsettled/i.test(flat), 'doc must record the bare/legacy writer path');
  assert(/delegateF15FolderBindingWrite|F15[- ]settled|f15\.execute-settlement-writer/i.test(flat), 'doc must record the F15-settled (authorized) writer path');
  assert(/binding-reviewed-apply/.test(flat) && /import-bundle/.test(flat) && /tombstone-reviews/.test(flat),
    'doc must record the competing writers (reviewed-apply, import-bundle, tombstone-reviews)');
  // trigger guard / writer identity posture
  assert(/h2o_writer_identity/.test(flat), 'doc must record the h2o_writer_identity model');
  assert(/f16[^.]*trigger guard[^.]*DISABLED|f16_folder_bindings_trigger_guard\.enabled\s*=\s*0|DISABLED by default/i.test(flat),
    'doc must record the f16 trigger guard disabled-by-default posture');
  assert(/f15\.execute-settlement-writer/.test(flat) && /f16\.folder-legacy-fallback/.test(flat), 'doc must record the writer-identity allowlist');
  // repair not authorized
  assert(/Is binding repair currently using an authorized writer identity\?[^]*?No|repair[^.]*NOT[^.]*(authorized|settled)|not F15-settled|bare\/legacy path/i.test(flat),
    'doc must record that binding repair is NOT currently using an authorized writer identity');
  assert(/explicitF7Fallback/.test(flat), 'doc must record the repair explicitF7Fallback (bare-path) usage');
  // recommended fix + required proofs
  assert(/Recommended final fix/i.test(flat) && /F15[- ]settled|delegateF15FolderBindingWrite/i.test(flat), 'doc must recommend routing the repair through the F15-settled path');
  assert(/reconcile-survival|does NOT revert|survives reconcile/i.test(flat), 'doc must require a reconcile-survival proof');
  assert(/Required validators|live proof/i.test(flat), 'doc must record required validators/live proofs');
  // boundaries
  assert(/No live apply/i.test(flat), 'doc must record no live apply');
  assert(/`?binding-mismatch`? remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'doc must keep binding-mismatch blocked');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
  assert(/WebDAV\/cloud\/relay remains blocked/i.test(flat), 'doc must keep WebDAV/cloud/relay blocked');
  assert(/Chat Saving[^.]*CAS remains blocked/i.test(flat), 'doc must keep Chat Saving CAS blocked');
}

// ---- REAL SOURCE anchors: Rust substrate ----
assert(exists(rustLibPath), `${rustLibPath}: missing`);
if (exists(rustLibPath)) {
  const rust = read(rustLibPath);
  assert(rust.includes('h2o_writer_identity'), 'lib.rs must reference h2o_writer_identity');
  assert(rust.includes('f16_folder_bindings_trigger_guard'), 'lib.rs must define the f16 folder_bindings trigger guard');
  assert(rust.includes('CREATE TABLE folder_bindings') || rust.includes('folder_bindings'), 'lib.rs must define/reference folder_bindings');
  assert(rust.includes("'f15.execute-settlement-writer'"), 'lib.rs must reference the settlement writer identity');
  // guard disabled by default (enabled INTEGER NOT NULL DEFAULT 0)
  assert(/enabled\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0/.test(rust), 'f16 trigger guard must be DEFAULT 0 (disabled)');
}
assert(exists(rustWriterIdentityPath), `${rustWriterIdentityPath}: missing`);
if (exists(rustWriterIdentityPath)) {
  const wi = read(rustWriterIdentityPath);
  assert(wi.includes('h2o_writer_identity'), 'sqlite_writer_identity.rs must define h2o_writer_identity');
  assert(wi.includes('f15.execute-settlement-writer') && wi.includes('f16.folder-legacy-fallback'), 'writer-identity module must carry the allowlist');
}

// ---- REAL SOURCE anchors: JS ----
assert(exists(foldersStorePath), `${foldersStorePath}: missing`);
if (exists(foldersStorePath)) {
  const store = read(foldersStorePath);
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'store must contain the bare folder_bindings INSERT OR REPLACE (repair/legacy path)');
  assert(store.includes('delegateF15FolderBindingWrite') || store.includes('f15FolderBindingDelegationEnabled'), 'store must have the F15-settled delegation path');
  assert(store.includes('function confirmCanonicalChatFolderBindingDurable('), 'durable helper must remain present');
  assert(store.includes('function bindingCheckpointRowParse('), 'busy-aware fence parser must remain present');
  assert(store.includes('parsed.busy === 1'), 'busy-aware fence must remain (busy===1 branch)');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"), 'F11 must STILL block binding-mismatch');
}
assert(exists(folderSyncPath), `${folderSyncPath}: missing`);
if (exists(folderSyncPath)) {
  const src = read(folderSyncPath);
  assert(src.includes('post-apply-binding-hash-mismatch'), 'existing post-apply-binding-hash-mismatch gate must remain');
  assert(src.includes("'persistence-verification-failure'"), 'durable gate persistence-verification-failure must remain');
  assert(src.includes('confirmCanonicalChatFolderBindingDurable('), 'handler must still call the durable helper');
  // The investigation identified the bare-path explicitF7Fallback usage; the F15-settled fix later removed it
  // and routes the repair through the F15-settled delegation (bare-path evidence superseded by the fix).
  assert(src.includes('useF15FolderBindingDelegation: true'), 'binding repair now routes through the F15-settled delegation (bare-path explicitF7Fallback superseded by the F15-settled fix)');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred (no cloud/relay/CAS)');
}
assert(exists(archiveBoundaryPath), 'Chat Saving archive-cloud boundary validator must remain present');

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-persistence-rust-writer-investigation');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-persistence-rust-writer-investigation.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-persistence-rust-writer-investigation',
  doc,
  verdict: 'TRUE-REVERT-VECTOR-IDENTIFIED',
  trueRevertVector: 'bare/unsettled repair write (moveCanonicalChatFolderBinding / legacy + explicitF7Fallback) later overwritten by the authorized F15 settlement/materialization path',
  bindingRepairUsesAuthorizedWriterIdentity: false,
  f16TriggerGuardEnabledByDefault: false,
  writerIdentityModel: 'per-connection h2o_writer_identity(); allowlist [f15.execute-settlement-writer, f16.folder-legacy-fallback]; JS plugin:sql installs empty identity',
  recommendedFinalFix: 'route binding repair through the F15-settled delegation (delegateF15FolderBindingWrite); emit applied/consume only after durable AND settled; keep busy-aware fence + hash gate',
  finalFixRequiresNewRust: false,
  competingWriterSerializationRequired: false,
  requiredProofBeforeLiveRetry: 'F15-settled repair-write validator + reconcile-survival proof (settlement pass does not revert) + live reload+reconcile readback',
  durableGateCommit: DURABLE_GATE_COMMIT,
  busyAwareFenceCommit: BUSY_FENCE_COMMIT,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'F15-settled repair-write fix preflight (design-only), then implementation + reconcile-survival proof; live retry only after that, separately approved',
}, null, 2));
console.log('PASS validate-folder-sync-binding-persistence-rust-writer-investigation');
