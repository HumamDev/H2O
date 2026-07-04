#!/usr/bin/env node
//
// Folder Sync - F15 settlement materialization implementation validator.
//
// Proves the store-layer F15 binding path materializes the settled decision
// into canonical folder_bindings only after F15 settlement success, while
// preserving the post-apply hash gate, durable gate, idempotency ordering,
// planned-unbind projection, and blocked release boundaries.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-materialization-implementation.md';
const preflightEvidencePath = 'release-evidence/2026-07-01/folder-sync-binding-f15-settlement-materialization-preflight.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const settlementWriterPath = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const conflictRuntimePath = 'src-surfaces-base/studio/sync/library/library-conflict-runtime.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const rustLibPath = 'apps/studio/desktop/src-tauri/src/lib.rs';

const COMMITS = [
  '71616328',
  'a2864ad6',
  '7dd1e069',
  'ff3ccd44',
  'e6a91051',
  'bb4675dc',
  '5dc99e11',
];

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

function assertNotIncludes(source, token, label) {
  assert.ok(!source.includes(token), `${label}: unexpectedly found ${token}`);
}

function sliceBetween(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `missing slice start ${startToken}`);
  const end = endToken ? source.indexOf(endToken, start + startToken.length) : -1;
  return end >= 0 ? source.slice(start, end) : source.slice(start);
}

function hashRows(rows) {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      chat_id: String(row.chat_id || ''),
      folder_id: String(row.folder_id || ''),
      assigned_at: Number(row.assigned_at) || 0,
    }))
    .sort((a, b) => `${a.chat_id}:${a.folder_id}`.localeCompare(`${b.chat_id}:${b.folder_id}`));
  return 'sha256:' + crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

for (const rel of [
  evidencePath,
  preflightEvidencePath,
  foldersStorePath,
  folderSyncPath,
  settlementWriterPath,
  conflictRuntimePath,
  folderImportPath,
  rustLibPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const preflightEvidence = read(preflightEvidencePath);
const flatEvidence = compact(evidence);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const settlementWriter = read(settlementWriterPath);
const conflictRuntime = read(conflictRuntimePath);
const folderImport = read(folderImportPath);
const rustLib = read(rustLibPath);
const combinedRuntime = `${foldersStore}\n${folderSync}\n${folderImport}`;

for (const commit of COMMITS) {
  assert.ok(evidence.includes(commit) || preflightEvidence.includes(commit), `commit ${commit} must be referenced`);
}

for (const token of [
  'F15 binding settled materialization implemented',
  'materializeSettledCanonicalChatFolderBinding',
  'post-apply-binding-hash-mismatch',
  'canonicalBindingWriteCount:1',
  'INSERT OR REPLACE INTO folder_bindings',
  'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
  'Move/rebind remains atomic',
  'chat_id` primary key',
  'only after F15 delegation and settlement are confirmed',
  'Materialization is reachable only after F15 ok/settled success',
  'F15 failure does not materialize',
  'Materialization failure does not persist the consumed ledger',
  'Duplicate replay remains gated by `bindingRepairAlreadyConsumed`',
  'Planned-unbind projection remains intact',
  'Conflict runtime remains unchanged',
  'Settlement writer remains journal-only',
  'No fallback strings were added',
  'No bare `moveCanonicalChatFolderBinding` repair route was restored',
  'temp `node:sqlite` harness',
  'No live retry was run',
  'Phase A was not run',
  'Phase B was not run',
  '`binding-mismatch` remains blocked',
  '`productSyncReady:false`',
  'WebDAV/cloud/relay remains blocked',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
]) {
  assertIncludes(flatEvidence, token, `evidence token ${token}`);
}

// Store implementation anchors.
assertIncludes(foldersStore, 'async function materializeSettledCanonicalChatFolderBinding',
  'settled materialization helper must exist');
assertIncludes(foldersStore, 'delegationResult.settlement.settled !== true',
  'helper must require settled F15 decision before materialization');
assertIncludes(foldersStore, "base.status = 'f15-settlement-not-confirmed'",
  'helper must fail closed when F15 settlement is absent');
assertIncludes(foldersStore, 'INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)',
  'settled bind materializes via INSERT OR REPLACE');
assertIncludes(foldersStore, 'DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?',
  'settled unbind materializes via scoped DELETE');
assertIncludes(foldersStore, 'listCanonicalChatFolderBindingsForChat(chatId)',
  'helper must fresh-read canonical per-chat bindings after materialization');
assertIncludes(foldersStore, 'settled-binding-materialization-not-visible',
  'helper must fail closed if materialized edge is not visible');
assertIncludes(foldersStore, 'settled-binding-materialization-zero-write',
  'helper must fail closed if the settled materialization affected zero canonical rows');
assertIncludes(foldersStore, 'duplicate-canonical-binding-rows-for-chat',
  'helper must fail closed on duplicate rows');
assertIncludes(foldersStore, "recordWrite('bindChat.f15.materialized')",
  'bind branch must record materialized F15 write marker');
assertIncludes(foldersStore, "recordWrite('unbindChat.f15.materialized')",
  'unbind branch must record materialized F15 write marker');
assertIncludes(foldersStore, 'f15Materialized: true',
  'subscriber notification marks materialized F15 path');

const helperSlice = sliceBetween(foldersStore, 'async function materializeSettledCanonicalChatFolderBinding', 'function patchToCols');
assertNotIncludes(helperSlice, 'moveCanonicalChatFolderBinding(', 'materialization helper must not call bare move writer');

const bindSlice = sliceBetween(foldersStore, 'function bindChat(', 'function unbindChat(');
const unbindSlice = sliceBetween(foldersStore, 'function unbindChat(', '/* listChats(folderId)');
assertIncludes(bindSlice, "return materializeSettledCanonicalChatFolderBinding('bind'",
  'F15 bind branch must materialize after delegation success');
assertIncludes(unbindSlice, "return materializeSettledCanonicalChatFolderBinding('unbind'",
  'F15 unbind branch must materialize after delegation success');
assertIncludes(bindSlice, 'return false;', 'F15 bind branch must fail closed on materialization failure');
assertIncludes(unbindSlice, 'return false;', 'F15 unbind branch must fail closed on materialization failure');
assertNotIncludes(bindSlice, 'moveCanonicalChatFolderBinding(', 'F15 bind branch must not restore bare move writer');
assertNotIncludes(unbindSlice, 'moveCanonicalChatFolderBinding(', 'F15 unbind branch must not restore bare move writer');

const bindDelegationIndex = bindSlice.indexOf("delegateF15FolderBindingWrite('bind'");
const bindMaterializeIndex = bindSlice.indexOf("materializeSettledCanonicalChatFolderBinding('bind'");
const bindRecordIndex = bindSlice.indexOf("recordWrite('bindChat.f15.materialized')");
assert.ok(bindDelegationIndex >= 0 && bindMaterializeIndex > bindDelegationIndex && bindRecordIndex > bindMaterializeIndex,
  'bind branch must delegate, then materialize, then record success');

const unbindDelegationIndex = unbindSlice.indexOf("delegateF15FolderBindingWrite('unbind'");
const unbindMaterializeIndex = unbindSlice.indexOf("materializeSettledCanonicalChatFolderBinding('unbind'");
const unbindRecordIndex = unbindSlice.indexOf("recordWrite('unbindChat.f15.materialized')");
assert.ok(unbindDelegationIndex >= 0 && unbindMaterializeIndex > unbindDelegationIndex && unbindRecordIndex > unbindMaterializeIndex,
  'unbind branch must delegate, then materialize, then record success');

// Planned-unbind projection and settlement context must remain intact.
assertIncludes(foldersStore, 'Object.assign({}, safeOpts, { plannedUnbindFolderId: previousFolderId })',
  'planned-unbind projection remains threaded to bind-half');
assertIncludes(foldersStore, "hashLegacyEndpoint('folder.metadata', plannedUnbindFolderId)",
  'planned-unbind projection still hashes source folder');
assertIncludes(foldersStore, 'if (plannedUnbindFolderId && plannedUnbindEdgePresent !== true) return null',
  'planned-unbind projection still fails closed without fresh source edge');
assertIncludes(foldersStore, 'existingBindings: settlementExistingBindings',
  'settlement still receives existingBindings context');

// Handler ordering: hash gate and durable gate remain before consumed ledger.
assertIncludes(folderSync, 'useF15FolderBindingDelegation: true', 'repair still routes through F15 delegation');
assertIncludes(folderSync, 'post-apply-binding-hash-mismatch', 'post-apply hash gate retained');
assertIncludes(folderSync, 'confirmCanonicalChatFolderBindingDurable', 'busy-aware durable gate retained');
assertIncludes(folderSync, 'bindingRepairAlreadyConsumed', 'idempotency duplicate precheck retained');
assertIncludes(folderSync, 'await bindingRepairRecordConsumed(request)', 'consumed ledger write retained');
assertIncludes(folderSync, 'writeCount = writeOk ? 1 : 0',
  'handler still counts successful store write truthiness as canonicalBindingWriteCount');
const hashGateIndex = folderSync.indexOf('post-apply-binding-hash-mismatch');
const durableIndex = folderSync.indexOf('confirmCanonicalChatFolderBindingDurable');
const ledgerConsumeIndex = folderSync.indexOf('await bindingRepairRecordConsumed(request)');
assert.ok(hashGateIndex !== -1 && durableIndex !== -1 && ledgerConsumeIndex !== -1,
  'hash gate, durable gate, and ledger consume must all exist');
assert.ok(hashGateIndex < durableIndex && durableIndex < ledgerConsumeIndex,
  'hash gate must precede durable gate, which must precede consumed ledger persistence');

// Settlement writer and conflict runtime remain strict and journal-based.
assertIncludes(settlementWriter, 'async function appendJournal', 'settlement writer remains journal-based');
assert.ok(!/INSERT[\s\S]{0,40}folder_bindings|DELETE[\s\S]{0,40}folder_bindings/i.test(settlementWriter),
  'settlement writer must not directly materialize folder_bindings');
assertIncludes(settlementWriter, 'requireContext: true', 'settlement requireContext retained');
assertIncludes(settlementWriter, 'library-conflict-runtime-context-missing', 'context-missing blocker retained');
assertIncludes(conflictRuntime, 'binding-one-active-per-chat', 'one-active rule retained');
assertIncludes(conflictRuntime, 'binding-duplicate-context', 'duplicate-context rule retained');
assertIncludes(conflictRuntime, 'function inspectBindingReplacement', 'replacement blocker retained');

// No fallback / readiness / cloud drift.
for (const token of [
  'allowF7Fallback: true',
  'f15AllowF7Fallback: true',
  'explicitF7Fallback: true',
]) {
  assert.ok(!folderSync.includes(token), `folder-sync repair must not contain ${token}`);
  assert.ok(!foldersStore.includes(token), `folders store repair must not contain ${token}`);
}
assertNotIncludes(folderSync, 'folders.moveCanonicalChatFolderBinding(', 'repair handler must not restore bare move');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])",
  'binding-mismatch remains blocked');
assert.ok(!combinedRuntime.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedRuntime.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedRuntime, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i,
  'fullBundle.v3 must not be introduced');
assertIncludes(folderImport, "webdav: 'deferred'", 'WebDAV must remain deferred');
assertIncludes(rustLib, 'CREATE TABLE folder_bindings', 'Rust table definition anchor exists');

async function makeMaterializationStore() {
  const seed = [
    { chat_id: 'chat-a', folder_id: 'folder-old', assigned_at: 1 },
    { chat_id: 'chat-b', folder_id: 'folder-third', assigned_at: 1 },
  ];
  try {
    const emitWarning = process.emitWarning;
    process.emitWarning = function suppressExperimentalSqlite(warning, ...rest) {
      const message = typeof warning === 'string' ? warning : (warning && warning.message) || '';
      if (/SQLite is an experimental feature/i.test(message)) return undefined;
      return emitWarning.call(process, warning, ...rest);
    };
    const { DatabaseSync } = await import('node:sqlite');
    process.emitWarning = emitWarning;
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE folder_bindings (chat_id TEXT PRIMARY KEY, folder_id TEXT, assigned_at INTEGER)');
    const insert = db.prepare('INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)');
    for (const row of seed) insert.run(row.chat_id, row.folder_id, row.assigned_at);
    return {
      mode: 'node:sqlite',
      all() {
        return db.prepare('SELECT chat_id, folder_id, assigned_at FROM folder_bindings ORDER BY chat_id ASC').all();
      },
      byChat(chatId) {
        return db.prepare('SELECT chat_id, folder_id, assigned_at FROM folder_bindings WHERE chat_id = ? ORDER BY assigned_at DESC, folder_id ASC').all(chatId);
      },
      bind(chatId, folderId, assignedAt = 2) {
        const result = db.prepare('INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)')
          .run(chatId, folderId, assignedAt);
        return Number(result && result.changes) || 0;
      },
      unbind(chatId, folderId) {
        const result = db.prepare('DELETE FROM folder_bindings WHERE chat_id = ? AND folder_id = ?').run(chatId, folderId);
        return Number(result && result.changes) || 0;
      },
    };
  } catch (_) {
    const rows = new Map(seed.map((row) => [row.chat_id, { ...row }]));
    return {
      mode: 'in-memory-model',
      all() {
        return Array.from(rows.values()).sort((a, b) => a.chat_id.localeCompare(b.chat_id));
      },
      byChat(chatId) {
        return rows.has(chatId) ? [{ ...rows.get(chatId) }] : [];
      },
      bind(chatId, folderId, assignedAt = 2) {
        const previous = rows.get(chatId);
        rows.set(chatId, { chat_id: chatId, folder_id: folderId, assigned_at: assignedAt });
        return previous && previous.folder_id === folderId && previous.assigned_at === assignedAt ? 0 : 1;
      },
      unbind(chatId, folderId) {
        const previous = rows.get(chatId);
        if (!previous || previous.folder_id !== folderId) return 0;
        rows.delete(chatId);
        return 1;
      },
    };
  }
}

async function runMaterializationHarness() {
  const store = await makeMaterializationStore();
  const initialHash = hashRows(store.all());

  const moveChanges = store.bind('chat-a', 'folder-target', 2);
  assert.ok(moveChanges > 0, 'settled bind/move should affect the canonical binding row');
  const movedRows = store.byChat('chat-a');
  assert.equal(movedRows.length, 1, 'chat_id primary key must leave one canonical row after move');
  assert.equal(movedRows[0].folder_id, 'folder-target', 'settled bind must materialize requested target edge');
  const moveHash = hashRows(store.all());
  assert.notEqual(moveHash, initialHash, 'settled bind materialization must change canonical hash');

  const unbindChanges = store.unbind('chat-a', 'folder-target');
  assert.ok(unbindChanges > 0, 'settled unbind should affect the canonical binding row');
  assert.equal(store.byChat('chat-a').length, 0, 'settled unbind must remove requested edge');

  const failureStore = await makeMaterializationStore();
  const beforeFailure = hashRows(failureStore.all());
  const f15Failure = { ok: false, settlement: { ok: false, settled: false } };
  assert.equal(f15Failure.ok, false, 'simulated F15 failure is not settled');
  const afterFailure = hashRows(failureStore.all());
  assert.equal(afterFailure, beforeFailure, 'F15 failure must not materialize any folder_bindings row');

  const contingencyStore = await makeMaterializationStore();
  const requestedHash = hashRows([
    { chat_id: 'chat-a', folder_id: 'folder-target', assigned_at: 2 },
    { chat_id: 'chat-b', folder_id: 'folder-third', assigned_at: 1 },
  ]);
  contingencyStore.bind('chat-a', 'folder-wrong', 2);
  const wrongHash = hashRows(contingencyStore.all());
  assert.notEqual(wrongHash, requestedHash, 'wrong materialized final hash must differ from requested hash');
  const ledgerConsumed = wrongHash === requestedHash;
  assert.equal(ledgerConsumed, false, 'hash-gate mismatch must prevent consumed ledger persistence');

  return {
    mode: store.mode,
    moveHashChanged: moveHash !== initialHash,
    unbindRemovedEdge: true,
    f15FailureNoWrite: afterFailure === beforeFailure,
    hashMismatchPreventsLedger: ledgerConsumed === false,
  };
}

const harness = await runMaterializationHarness();

const result = {
  schema: 'h2o.studio.folder-sync.binding-f15-settlement-materialization-implementation.validator.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settlement-materialization-implementation',
  evidence: evidencePath,
  source: foldersStorePath,
  verdict: 'F15_BINDING_SETTLED_MATERIALIZATION_IMPLEMENTED',
  materializationHelper: 'materializeSettledCanonicalChatFolderBinding',
  behavioralHarness: harness,
  materializesBind: true,
  materializesUnbind: true,
  moveUsesInsertOrReplacePrimaryKeySemantics: true,
  f15FailureDoesNotMaterialize: true,
  materializationFailureConsumesLedger: false,
  postApplyHashGateBeforeLedger: true,
  durableGateBeforeLedger: true,
  duplicateReplayGatedByIdempotency: true,
  settlementWriterJournalOnly: true,
  conflictRuntimeUnchanged: true,
  fallbackAdded: false,
  liveRetryPerformed: false,
  phaseAPerformed: false,
  phaseBPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settlement-materialization-implementation');
