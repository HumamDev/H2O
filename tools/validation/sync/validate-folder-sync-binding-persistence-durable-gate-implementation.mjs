#!/usr/bin/env node
//
// Folder Sync — Binding persistence durable-verification gate implementation proof (detection + safe-fail).
//
// Loads the REAL folder-sync.tauri.js binding repair handler + REAL consumed-operation ledger over a mock
// canonical binding store whose confirmCanonicalChatFolderBindingDurable is toggled per case, and proves the
// new durable gate: durable+matchesRequested -> applied (consume +1); non-durable/unverifiable -> rejected
// persistence-verification-failure (consume 0); fenced-but-mismatch (revert) -> rejected
// persistence-verification-failure (consume 0). It also asserts source anchors (the store durable helper +
// exposure; the handler's durable gate placed AFTER the preserved post-apply-binding-hash-mismatch gate and
// BEFORE the ledger consume; the persistence-verification-failure reason) and the standing boundaries
// (binding-mismatch blocked; productSyncReady false; no fullBundle.v3; webdav deferred; no Rust/writer-identity
// coupling in the store helper). If node:sqlite-free (this harness needs none), it still runs. No live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-persistence-durable-gate-implementation.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const ledgerPath = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(cond, msg) { if (!cond) failures.push(msg); }

const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const token = (s) => 'tok_' + sha256(s).slice(0, 16);

async function runHarness() {
  const mem = {};
  const storage = {
    get(keys, cb) { const out = {}; const list = Array.isArray(keys) ? keys : [keys]; for (const k of list) if (Object.prototype.hasOwnProperty.call(mem, k)) out[k] = mem[k]; cb(out); },
    set(items, cb) { Object.assign(mem, items); if (cb) cb(); },
  };
  const folders = [
    { id: token('folder-a'), folderId: token('folder-a'), sortOrder: 0 },
    { id: token('folder-b'), folderId: token('folder-b'), sortOrder: 1 },
  ];
  const tombstoned = [];
  const liveChats = new Set([token('chat-c'), token('chat-d'), token('chat-e'), token('chat-f')]);
  const bindings = new Map();
  const writes = { canonicalBinding: 0, tombstone: 0 };
  const rows = () => Array.from(bindings.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([chatId, folderId]) => ({
    chatId, conversationId: chatId, folderId, assignedAt: 1, source: 'desktop-canonical-folder-bindings-sqlite',
  }));

  let durableMode = 'durable'; // 'durable' | 'non-durable' | 'revert'
  const folderStore = {
    async getAll() { return folders.slice(); },
    async listRecentlyDeletedFolders() { return tombstoned.slice(); },
    async listCanonicalChatFolderBindings() { return rows(); },
    async listCanonicalChatFolderBindingsForChat(chatId) {
      const folderId = bindings.get(String(chatId));
      return folderId ? [{ chatId, conversationId: chatId, folderId, assignedAt: 1 }] : [];
    },
    async getCanonicalChatFolderBindingForChat(chatId) { const l = await this.listCanonicalChatFolderBindingsForChat(chatId); return l[0] || null; },
    async bindChat(folderId, chatId) { bindings.set(chatId, folderId); writes.canonicalBinding += 1; return true; },
    async unbindChat(folderId, chatId) { if (bindings.get(chatId) !== folderId) return false; bindings.delete(chatId); writes.canonicalBinding += 1; return true; },
    async moveCanonicalChatFolderBinding(folderId, chatId, opts) {
      if (opts && opts.expectedCurrentFolderId && bindings.get(chatId) !== opts.expectedCurrentFolderId) return { ok: false, status: 'expected-current-folder-mismatch', rowsAffected: 0 };
      bindings.set(chatId, folderId); writes.canonicalBinding += 1; return { ok: true, status: 'chat-folder-binding-moved', changed: true, rowsAffected: 1 };
    },
    async confirmCanonicalChatFolderBindingDurable(opts) {
      const freshRows = rows();
      let canonicalBindingHash = '';
      if (opts && typeof opts.hashRows === 'function') { try { canonicalBindingHash = String(await opts.hashRows(freshRows)); } catch (_) { canonicalBindingHash = ''; } }
      const requestedBindingHash = opts ? String(opts.requestedBindingHash || '') : '';
      if (durableMode === 'non-durable') {
        return { durable: false, unverifiable: true, method: 'wal_checkpoint-unavailable', checkpointed: false, canonicalBindingHash: '', matchesRequested: false, storeIdentity: { adapter: 'harness' }, reason: 'durability-fence-unavailable-js-only', rows: freshRows };
      }
      if (durableMode === 'busy-incomplete') {
        // the shape the busy-aware fence returns for a busy=1 (blocked/incomplete) checkpoint
        return { durable: false, unverifiable: true, method: 'wal_checkpoint(TRUNCATE):select+fresh-canonical-reread', checkpointed: false, fenceInterpretation: 'busy-incomplete', canonicalBindingHash: '', matchesRequested: false, storeIdentity: { adapter: 'harness' }, reason: 'busy-incomplete', rows: freshRows };
      }
      if (durableMode === 'revert') {
        return { durable: true, unverifiable: false, method: 'wal_checkpoint(TRUNCATE)+fresh-canonical-reread', checkpointed: true, canonicalBindingHash: 'sha256:reverted-old-state', matchesRequested: false, storeIdentity: { adapter: 'harness' }, reason: 'checkpoint-fenced-canonical-reread', rows: freshRows };
      }
      return { durable: true, unverifiable: false, method: 'wal_checkpoint(TRUNCATE)+fresh-canonical-reread', checkpointed: true, canonicalBindingHash, matchesRequested: !!canonicalBindingHash && canonicalBindingHash === requestedBindingHash, storeIdentity: { adapter: 'harness', tableName: 'folder_bindings' }, reason: 'checkpoint-fenced-canonical-reread', rows: freshRows };
    },
  };
  const chatsStore = { async get(chatId) { return liveChats.has(String(chatId)) ? { id: chatId } : null; } };

  globalThis.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected invoke'); } };
  globalThis.chrome = { storage: { local: storage }, runtime: {} };
  globalThis.H2O = {
    Studio: { store: { folders: folderStore, chats: chatsStore }, identity: { get: () => ({ physicalDeviceIdHash: sha256('device'), installIdHash: sha256('install'), syncPeerIdHash: sha256('peer') }) } },
    Desktop: {},
  };

  const realSetTimeout = globalThis.setTimeout;
  try {
    vm.runInThisContext(read(ledgerPath), { filename: ledgerPath });
    globalThis.setTimeout = function () { return 0; };
    vm.runInThisContext(read(folderSyncPath), { filename: folderSyncPath });
  } finally { globalThis.setTimeout = realSetTimeout; }

  const api = globalThis.H2O.Studio.sync && globalThis.H2O.Studio.sync.bindingRepair;
  if (!api || typeof api.apply !== 'function' || typeof api.snapshot !== 'function' || typeof api.bindingHash !== 'function') {
    return { blocked: true, blocker: 'real bindingRepair apply/snapshot/bindingHash API did not install' };
  }
  const currentHash = async () => (await api.snapshot()).bindingHash;
  const hashFor = async (extraRows) => await api.bindingHash(rows().concat(extraRows || []));
  function baseReq(over) {
    return Object.assign({
      schema: REQUEST_SCHEMA, requestId: 'req_' + crypto.randomBytes(4).toString('hex'),
      sourcePeerId: 'sha256:' + sha256('peer'), surfaceKind: 'chrome-extension',
      intent: 'bind', chatId: token('chat-c'), targetFolderId: token('folder-a'),
      basisBindingHash: '', requestedBindingHash: '', createdAt: '2026-07-01T00:00:00.000Z',
      idempotencyKey: 'idem_' + crypto.randomBytes(6).toString('hex'),
      desktopApplyRequired: true, noLocalApply: true, noChromeCanonicalMutation: true,
      noHardDelete: true, noPurge: true, noChatDelete: true, noFolderDelete: true, noTombstoneMutation: true,
      privacy: { rawFolderNames: false, rawChatTitles: false, rawChatContent: false },
    }, over || {});
  }
  const consumedCount = async () => {
    const listed = await globalThis.H2O.Desktop.Sync.listConsumedOperations();
    return (listed.rows || []).filter((r) => r.operationKind === 'chat-folder-binding-repair').length;
  };

  const out = {};

  // CASE 1 — durable success: applied, consume +1, idempotencyPersisted true, write count 1
  durableMode = 'durable';
  const req1 = baseReq({ chatId: token('chat-c'), targetFolderId: token('folder-a'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-c'), folderId: token('folder-a') }]) });
  const consumedBefore1 = await consumedCount();
  const r1 = await api.apply(req1, { apply: true, gate: APPLY_GATE });
  out.durableStatus = r1.status; out.durableReason = r1.reason;
  assert(r1.status === 'applied', `durable case: expected applied, got ${r1.status}/${r1.reason}`);
  assert(r1.canonicalBindingWriteCount === 1, `durable case: canonicalBindingWriteCount must be 1, got ${r1.canonicalBindingWriteCount}`);
  assert(r1.idempotencyPersisted === true, 'durable case: idempotencyPersisted must be true');
  assert((await consumedCount()) === consumedBefore1 + 1, 'durable case: consumes exactly one ledger row');

  // CASE 2 — non-durable/unverifiable: rejected persistence-verification-failure, consume 0, zero-write receipt
  durableMode = 'non-durable';
  const req2 = baseReq({ chatId: token('chat-d'), targetFolderId: token('folder-b'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-d'), folderId: token('folder-b') }]) });
  const consumedBefore2 = await consumedCount();
  const r2 = await api.apply(req2, { apply: true, gate: APPLY_GATE });
  out.nonDurableStatus = r2.status; out.nonDurableReason = r2.reason;
  assert(r2.status === 'rejected', `non-durable case: expected rejected, got ${r2.status}`);
  assert(r2.reason === 'persistence-verification-failure', `non-durable case: expected persistence-verification-failure, got ${r2.reason}`);
  assert(r2.canonicalBindingWriteCount === 0 && r2.canonicalWriteCount === 0, 'non-durable case: zero write counts on receipt');
  assert(r2.idempotencyPersisted !== true, 'non-durable case: idempotencyPersisted must not be true');
  for (const k of ['noHardDelete', 'noFolderPurge', 'noChatDelete', 'noFolderDelete', 'noBindingDeleteBeyondRequestedUnbind', 'noTombstoneMutation', 'noMirrorWrite', 'noTransportWrite', 'noWebdavWrite']) {
    assert(r2[k] === true, `non-durable case: safety flag ${k} must remain true`);
  }
  assert(r2.bindingMismatchAllowed === false && r2.productSyncReady === false, 'non-durable case: bindingMismatchAllowed + productSyncReady false');
  assert((await consumedCount()) === consumedBefore2, 'non-durable case: consumes ZERO ledger rows');

  // CASE 3 — fenced-but-mismatch (revert): rejected persistence-verification-failure, consume 0
  durableMode = 'revert';
  const req3 = baseReq({ chatId: token('chat-e'), targetFolderId: token('folder-a'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-e'), folderId: token('folder-a') }]) });
  const consumedBefore3 = await consumedCount();
  const r3 = await api.apply(req3, { apply: true, gate: APPLY_GATE });
  out.revertStatus = r3.status; out.revertReason = r3.reason;
  assert(r3.status === 'rejected' && r3.reason === 'persistence-verification-failure', `revert case: expected persistence-verification-failure, got ${r3.status}/${r3.reason}`);
  assert(r3.idempotencyPersisted !== true && r3.canonicalBindingWriteCount === 0, 'revert case: no idempotency persist, zero write count');
  assert((await consumedCount()) === consumedBefore3, 'revert case: revert DETECTED, consumes ZERO ledger rows');

  // CASE 4 — busy-incomplete (busy=1 checkpoint): rejected persistence-verification-failure, consume 0
  durableMode = 'busy-incomplete';
  const req4 = baseReq({ chatId: token('chat-f'), targetFolderId: token('folder-a'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-f'), folderId: token('folder-a') }]) });
  const consumedBefore4 = await consumedCount();
  const r4 = await api.apply(req4, { apply: true, gate: APPLY_GATE });
  out.busyIncompleteStatus = r4.status; out.busyIncompleteReason = r4.reason;
  assert(r4.status === 'rejected' && r4.reason === 'persistence-verification-failure', `busy-incomplete case: expected persistence-verification-failure, got ${r4.status}/${r4.reason}`);
  assert(r4.idempotencyPersisted !== true && r4.canonicalBindingWriteCount === 0, 'busy-incomplete case: no idempotency persist, zero write count');
  assert((await consumedCount()) === consumedBefore4, 'busy-incomplete (busy=1) case: consumes ZERO ledger rows');

  out.blocked = false;
  return out;
}

// ---- doc ----
assert(exists(doc), `${doc}: missing`);
if (exists(doc)) {
  const flat = read(doc).replace(/\s+/g, ' ');
  assert(/BINDING PERSISTENCE DURABLE GATE IMPLEMENTED/.test(flat), 'doc must carry the implemented verdict');
  assert(/detection \+ safe-fail (hardening )?only|detection \+ safe-fail/i.test(flat), 'doc must state detection + safe-fail only');
  assert(/NOT the final|not the final Rust/i.test(flat), 'doc must state this is not the final Rust/competing-writer fix');
  assert(flat.includes('persistence-verification-failure'), 'doc must record the persistence-verification-failure reason');
  assert(/post-apply-binding-hash-mismatch/.test(flat), 'doc must state the existing hash gate is preserved');
  assert(/No live Desktop apply|no live Desktop|No live Desktop apply was performed/i.test(flat), 'doc must state no live apply');
  assert(/`?binding-mismatch`? remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'doc must keep binding-mismatch blocked');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
}

// ---- source anchors: store helper ----
assert(exists(foldersStorePath), `${foldersStorePath}: missing`);
if (exists(foldersStorePath)) {
  const store = read(foldersStorePath);
  assert(store.includes('function confirmCanonicalChatFolderBindingDurable('), 'store durable helper must exist');
  assert(store.includes('confirmCanonicalChatFolderBindingDurable: confirmCanonicalChatFolderBindingDurable'), 'store durable helper must be exposed on the store API');
  assert(store.includes('PRAGMA wal_checkpoint(TRUNCATE)'), 'store helper must attempt a WAL checkpoint persistence fence');
  assert(store.includes('listCanonicalChatFolderBindings()'), 'store helper must fresh-re-read canonical bindings');
  assert(/unverifiable/.test(store) && /durable/.test(store), 'store helper must report durable/unverifiable');
  assert(!store.includes('h2o_writer_identity'), 'store helper must NOT route through the Rust writer identity');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"), 'F11 must STILL block binding-mismatch');
}

// ---- source anchors: handler gate ordering ----
assert(exists(folderSyncPath), `${folderSyncPath}: missing`);
if (exists(folderSyncPath)) {
  const src = read(folderSyncPath);
  assert(src.includes('post-apply-binding-hash-mismatch'), 'existing post-apply-binding-hash-mismatch gate must remain');
  assert(src.includes("'persistence-verification-failure'"), 'handler must return persistence-verification-failure');
  assert(src.includes('confirmCanonicalChatFolderBindingDurable('), 'handler must call the durable confirmation helper');
  const hashGateIdx = src.indexOf('post-apply-binding-hash-mismatch');
  const durableIdx = src.indexOf('confirmCanonicalChatFolderBindingDurable(');
  const pvfIdx = src.indexOf("'persistence-verification-failure'");
  const consumeIdx = src.indexOf('await bindingRepairRecordConsumed(request)');
  assert(hashGateIdx !== -1 && durableIdx !== -1 && pvfIdx !== -1 && consumeIdx !== -1, 'gate ordering anchors must all be present');
  assert(hashGateIdx < durableIdx && durableIdx < consumeIdx, 'durable gate must run AFTER the hash gate and BEFORE the ledger consume');
  assert(pvfIdx < consumeIdx, 'persistence-verification-failure must short-circuit before the ledger consume');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
}
assert(exists(archiveBoundaryPath), 'Chat Saving archive-cloud boundary validator must remain present');

// ---- run behavioral proof ----
let proof = null;
try { proof = await runHarness(); }
catch (e) { failures.push('durable-gate behavioral proof threw: ' + (e && e.message ? e.message : String(e))); }
if (proof && proof.blocked) failures.push('durable-gate behavioral proof BLOCKED: ' + proof.blocker);

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-persistence-durable-gate-implementation');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-persistence-durable-gate-implementation.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-persistence-durable-gate',
  doc,
  verdict: 'BINDING-PERSISTENCE-DURABLE-GATE-IMPLEMENTED',
  detectionAndSafeFailOnly: true,
  finalRustCompetingWriterFix: false,
  durableSuccessStatus: proof ? proof.durableStatus : null,
  nonDurableStatus: proof ? proof.nonDurableStatus : null,
  nonDurableReason: proof ? proof.nonDurableReason : null,
  revertStatus: proof ? proof.revertStatus : null,
  revertReason: proof ? proof.revertReason : null,
  persistenceVerificationFailureConsumesZeroLedger: true,
  postApplyBindingHashMismatchPreserved: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  liveApplyPerformed: false,
  recommendedNext: 'independent patch review + Rust/Tauri-SQL durability + h2o_writer_identity + competing-writer investigation before any live retry',
}, null, 2));
console.log('PASS validate-folder-sync-binding-persistence-durable-gate-implementation');
