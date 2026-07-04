#!/usr/bin/env node
//
// Folder Sync - F15 post-reload boot-writer pinning investigation validator (design-only).
//
// Static validator for the investigation that supersedes the mirror/boot-writer hypothesis with a source-grounded
// leading root cause: the durable-gate WAL-checkpoint fence declares durable:true on busy===0 WITHOUT verifying a full
// WAL merge, so a Phase A write that lives only in the WAL passes the gate in-session but does not survive restart.
// It anchors: Phase A/B facts; the fence busy===0 -> durable:true classification (the false-positive); the ruled-out
// paths (init/reload read-only, rebuildRenderMirrorFromSqlite SQLite->mirror, chrome.storage.local mirror, Rust
// f5g4-proof-only writes, single DB); ledger/journal references; and all release/safety boundaries. No source fix,
// no live apply, no Phase A/B, no reload.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-post-reload-boot-writer-pinning.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['81de3a63', 'f2764d24'];
const OLD_HASH = 'sha256:1d602101ef02512f67b9d87ed1339d147ecf28a458b4836516c41d6e734f755d';
const REQUESTED_HASH = 'sha256:32e697d704934acc5cc614979e776b46b934b9fe3c144efe3d59b9ad941b294e';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(source, token, label) {
  assert.ok(source.includes(token), `${label}: missing ${token}`);
}

for (const rel of [evidencePath, foldersStorePath, folderSyncPath, rustLibPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const rustLib = read(rustLibPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'NOT A BOOT WRITER',
  'DURABLE-GATE WAL-CHECKPOINT FALSE-POSITIVE',
  'design-only investigation and preflight',
  // live facts
  OLD_HASH,
  REQUESTED_HASH,
  'durableGate.checkpointBusy:0',
  'reconcileSurvivalProven:false',
  'rowCount:14',
  'rebuildRenderMirrorFromSqlite',
  // ruled out
  'No JS boot/shutdown `folder_bindings` writer',
  'SQLite -> mirror',
  '`chrome.storage.local`-backed',
  'f5g4-proof-',
  "single `DB_URL = 'sqlite:studio-v1.db'`",
  'not statically auto-run on boot',
  // leading root cause
  'bindingDurablePersistenceFence',
  'wal_checkpoint(TRUNCATE)',
  'busy === 0` -> `checkpoint-confirmed`',
  'checkpointed < log',
  'only in the WAL, not in the authoritative main',
  // answers
  'main `studio-v1.db` file itself',
  // fix direction
  'strengthens',
  'partial-checkpoint-not-durable',
  'persistence-verification-failure',
  'reopen',
  'src-surfaces-base/studio/store/folders.tauri.js',
  // required confirmation
  'checkpointLog',
  'checkpointFrames',
  'main file vs `studio-v1.db-wal`',
  // validators + evidence
  'Durable full-merge fence validator',
  'folder-sync-binding-f15-durable-fullmerge-fence-implementation.md',
  // live retry
  'postReloadSnapshotHash === requestedBindingHash',
  'reconcileSurvivalProven:true',
  // boundaries
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: durable fence false-positive is fixed after restart-survival implementation ----
assertIncludes(foldersStore, 'PRAGMA wal_checkpoint(TRUNCATE)', 'durable fence uses TRUNCATE checkpoint');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-confirmed'; fence.durable = true",
  'fence declares durable on the checkpoint-confirmed branch');
assertIncludes(foldersStore, 'parsed.busy === 0', 'fence classifies durability on busy===0');
assertIncludes(foldersStore, 'function bindingCheckpointRowParse', 'checkpoint (busy,log,checkpointed) parser present');
assertIncludes(foldersStore, 'confirmCanonicalChatFolderBindingDurable', 'durable confirm entry present');
assertIncludes(foldersStore, 'parsed.log >= 0 && parsed.checkpointed >= 0 && parsed.log === parsed.checkpointed',
  'busy zero now requires full checkpoint merge');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false",
  'partial checkpoint is not durable');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable true now also requires requested hash match');

// ---- REAL SOURCE anchors: ruled-out boot writers ----
assertIncludes(foldersStore, 'function rebuildRenderMirrorFromSqlite', 'render mirror rebuild present (SQLite->mirror)');
assertIncludes(foldersStore, "targetKey: FOLDER_STATE_DATA_KEY", 'render mirror rebuild targets the mirror (not folder_bindings)');
assertIncludes(foldersStore, 'function chromeStorageLocal', 'chrome.storage.local facade present');
assertIncludes(foldersStore, 'api.storage.local ? api.storage.local : null', 'mirror is chrome.storage.local-backed (absent/no-op in Tauri)');
assertIncludes(foldersStore, "var DB_URL = 'sqlite:studio-v1.db'", 'single canonical DB path');
assertIncludes(foldersStore, 'function init()', 'store init present');
assertIncludes(foldersStore, "source: 'init'", 'init now runs bounded F15 settled restart convergence');
assertIncludes(foldersStore, 'runF15SettledBindingRestartConvergence', 'restart convergence helper present');
assertIncludes(rustLib, 'f5g4-proof-chat-001', 'Rust folder_bindings writes are F5G.4 proof/test only');

// ---- REAL SOURCE anchors: snapshot source + ledger/journal ----
assertIncludes(folderSync, 'function chatFolderBindingCanonicalSnapshot', 'repair snapshot present');
assertIncludes(folderSync, 'listCanonicalChatFolderBindings', 'snapshot reads canonical SQLite folder_bindings');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'consumed-ledger precheck present');

// ---- REAL SOURCE anchors: gates + boundaries intact and unedited ----
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'durable gate present');
assert.ok(!folderSync.includes('explicitF7Fallback: true'), 'no explicitF7Fallback:true');
assert.ok(!folderSync.includes('allowF7Fallback: true'), 'no allowF7Fallback:true');
assert.ok(!folderSync.includes('f15AllowF7Fallback: true'), 'no f15AllowF7Fallback:true');
assert.ok(!folderSync.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'binding-mismatch remains blocked');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');

// ---- design must remain design-only ----
for (const forbidden of [
  'DURABLE FENCE HARDENED',
  'Phase B passed',
  'Phase B survived',
  'reconcile survival implemented',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `investigation must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-post-reload-boot-writer-pinning.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-post-reload-boot-writer-pinning',
  evidence: evidencePath,
  supersedesHypothesisCommit: 'f2764d24',
  bootWriterFound: false,
  leadingRootCause: 'durable-gate WAL-checkpoint false-positive: durable:true on busy===0 without verifying full WAL merge (checkpointed===log / log===0); Phase A write stayed in WAL, not merged to main studio-v1.db, so it did not survive restart',
  ruledOut: ['js-boot-shutdown-writer', 'render-mirror-rebuild (SQLite->mirror)', 'chrome.storage.local mirror (no-op in Tauri)', 'rust-production-writer (f5g4-proof only)', 'db-path-split (single studio-v1.db)'],
  remainingToConfirmLive: ['checkpointLog>0 / checkpointFrames<log at Phase A', 'main-file-vs-WAL disk inspection', 'rust sqlx pool vs plugin:sql WAL handling on reconnect', 'ledger/journal survival'],
  recommendedFixDirection: 'harden bindingDurablePersistenceFence to require full WAL merge before durable:true (strengthens the gate); optional cross-connection reopen-verify',
  requiresLiveDurabilityDiagnostic: true,
  designOnly: true,
  liveApplyPerformed: false,
  durableGateWeakened: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'read-only durability diagnostic to confirm the WAL-merge false-positive, then design durable full-merge fence hardening + independent review',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-post-reload-boot-writer-pinning');
