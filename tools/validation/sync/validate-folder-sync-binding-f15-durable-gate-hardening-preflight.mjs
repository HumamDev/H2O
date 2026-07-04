#!/usr/bin/env node
//
// Folder Sync - F15 durable-gate hardening preflight validator (design-only).
//
// Static validator for the design-only preflight that pinned the durable-gate bug. The historical evidence still records
// that confirmCanonicalChatFolderBindingDurable() previously set result.durable from the checkpoint fence alone. After the
// restart-survival implementation, this validator now accepts the fixed source posture: durable true is composite
// (checkpoint fence + requested hash match), while preserving the same evidence/boundary checks.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-durable-gate-hardening-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const COMMITS = ['81de3a63', 'f2764d24', '0c4c2128'];

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

for (const rel of [evidencePath, foldersStorePath, folderSyncPath, folderImportPath]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assertIncludes(evidence, commit, `evidence commit ${commit}`);
}

for (const token of [
  // verdict + framing
  'DURABLE-GATE BUG PINNED',
  'NOT SUFFICIENT FOR PHASE B RESTART-SURVIVAL',
  'design-only preflight',
  // live facts
  'checkpointLog:0',
  'checkpointFrames:0',
  'matchesRequested:false',
  'durable:true` can coexist with `matchesRequested:false',
  // pinned bug
  'derived only from `fence.durable === true',
  'no `&& result.matchesRequested` term',
  'handler already requires `matchesRequested === true`',
  'not truthful',
  // answers
  'checkpointFrames',
  'not cleanly available',
  'pools connections by db URL',
  // fix
  'result.durable = fence.durable === true &&',
  'partial-checkpoint-not-durable',
  'reopen',
  'node:sqlite',
  // Q8 explicit
  'only prevent false-positive durable declarations',
  'They do NOT, by themselves, fix Phase B restart',
  'necessary',
  'not sufficient',
  'persistence-BOUNDARY problem',
  // validators/evidence
  'Reopen-survival harness',
  'folder-sync-binding-f15-durable-gate-hardening-implementation.md',
  // boundaries
  'only STRENGTHENS the durable gate',
  '`binding-mismatch` remains blocked',
  '`productSyncReady` remains false',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flat, token, `evidence token ${token}`);
}

// ---- REAL SOURCE anchors: the durable-gate bug was fixed after this preflight ----
assertIncludes(foldersStore, 'function confirmCanonicalChatFolderBindingDurable', 'durable confirm entry present');
assertIncludes(foldersStore, 'result.matchesRequested = !!result.canonicalBindingHash && !!reqHash && result.canonicalBindingHash === reqHash',
  'matchesRequested computed separately');
assertIncludes(foldersStore, 'if (fence && fence.durable === true && result.matchesRequested === true)',
  'durable branch now combines fence and requested hash match');
assertIncludes(foldersStore, "fresh-canonical-hash-mismatch-not-durable", 'hash mismatch is explicitly not durable');
assertIncludes(foldersStore, "fence.interpretation = 'checkpoint-not-fully-merged'; fence.durable = false",
  'partial checkpoint is not durable');
assertIncludes(foldersStore, 'parsed.log >= 0 && parsed.checkpointed >= 0 && parsed.log === parsed.checkpointed',
  'busy zero alone is no longer enough');

// ---- REAL SOURCE anchors: exposed diagnostic fields (callers can distinguish cases) ----
assertIncludes(foldersStore, 'result.checkpointBusy = fence ? fence.busy : null', 'checkpointBusy exposed');
assertIncludes(foldersStore, 'result.checkpointLog = fence ? fence.log : null', 'checkpointLog exposed');
assertIncludes(foldersStore, 'result.checkpointFrames = fence ? fence.checkpointed : null', 'checkpointFrames exposed');
assertIncludes(foldersStore, 'PRAGMA wal_checkpoint(TRUNCATE)', 'fence uses TRUNCATE checkpoint');
assertIncludes(foldersStore, 'parsed.busy === 0', 'fence classifies durability on busy===0');

// ---- REAL SOURCE anchors: handler already requires durable && matchesRequested (compensating), ordering ----
assertIncludes(folderSync, 'durableConfirmation.matchesRequested === true', 'handler requires matchesRequested===true');
assertIncludes(folderSync, "'persistence-verification-failure'", 'handler safe-fails on not-durable');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'handler calls durable confirm');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate present');
assertIncludes(folderSync, 'await bindingRepairRecordConsumed(request)', 'ledger consume present');
const hashGateIndex = folderSync.indexOf('post-apply-binding-hash-mismatch');
const durableIndex = folderSync.indexOf('confirmCanonicalChatFolderBindingDurable');
const ledgerConsumeIndex = folderSync.indexOf('await bindingRepairRecordConsumed(request)');
assert.ok(hashGateIndex !== -1 && durableIndex !== -1 && ledgerConsumeIndex !== -1 &&
  hashGateIndex < durableIndex && durableIndex < ledgerConsumeIndex,
  'hash gate -> durable gate -> ledger consume ordering must hold');

// ---- REAL SOURCE anchors: boundaries intact and unedited ----
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
  'DURABLE GATE HARDENED',
  'Phase B passed',
  'Phase B survived',
  'restart survival fixed',
  'productSyncReady is true',
]) {
  assert.ok(!flat.includes(forbidden), `preflight must not claim: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-durable-gate-hardening-preflight.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-durable-gate-hardening-preflight',
  evidence: evidencePath,
  pinnedBug: 'confirmCanonicalChatFolderBindingDurable sets result.durable from fence.durable (busy===0) alone, decoupled from matchesRequested; durable:true can coexist with matchesRequested:false',
  handlerAlreadyRequiresMatchesRequested: true,
  apiExposesEnoughFields: true,
  crossConnectionReopenAvailableFromJs: false,
  fixDirection: 'A: composite durable = fence.durable && matchesRequested (+C full-merge); B: keep handler matchesRequested requirement; E: node:sqlite reopen-survival harness; D: cross-boundary proof needs plugin/Rust',
  hardeningPreventsFalsePositive: true,
  hardeningFixesPhaseBSurvival: false,
  designOnly: true,
  liveApplyPerformed: false,
  durableGateWeakened: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'design durable composite + fence full-merge + reopen-survival harness; separately design cross-boundary restart proof; independent review before implementation',
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-durable-gate-hardening-preflight');
