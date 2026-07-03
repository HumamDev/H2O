#!/usr/bin/env node
//
// Folder Sync - binding-mismatch repair implementation validator.
//
// Loads the real Desktop binding repair handler and the real consumed-operation ledger into a VM-backed
// harness with a disposable canonical folder_bindings store. Proves dry-run, gated apply, replay, and
// negative paths without touching a live Desktop profile.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root = process.cwd();
const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';
const preflightPath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-preflight-after-sortorder.md';
const readinessPath = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';
const s5Path = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const ledgerPath = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const archiveBoundaryPath = 'tools/validation/studio/validate-saved-chat-archive-cloud-sync-boundary-v1.mjs';

const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const APPLY_GATE = 'folder-sync-chat-folder-binding-repair-apply';
const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}
function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function token(value) {
  return `tok_${sha256(value).slice(0, 16)}`;
}
function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}
function assertIncludes(source, tokenValue, label) {
  assert.ok(source.includes(tokenValue), `${label}: missing ${tokenValue}`);
}

assert.ok(exists(evidencePath), `${evidencePath} must exist`);
assert.ok(exists(preflightPath), `${preflightPath} must exist`);
assert.ok(exists(readinessPath), `${readinessPath} must exist`);
assert.ok(exists(s5Path), `${s5Path} must exist`);
assert.ok(exists(folderSyncPath), `${folderSyncPath} must exist`);
assert.ok(exists(foldersStorePath), `${foldersStorePath} must exist`);
assert.ok(exists(ledgerPath), `${ledgerPath} must exist`);

const evidence = read(evidencePath);
const flatEvidence = compact(evidence);
const preflight = read(preflightPath);
const readiness = read(readinessPath);
const s5 = read(s5Path);
const folderSyncSource = read(folderSyncPath);
const foldersStoreSource = read(foldersStorePath);
const folderImportSource = read(folderImportPath);

for (const tokenValue of [
  'BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN',
  '6157a419',
  '93dd818f',
  '6bf420be',
  REQUEST_SCHEMA,
  RECEIPT_SCHEMA,
  APPLY_GATE,
  'Dry-run is the default',
  'Rejected/conflict paths write nothing',
  '`binding-mismatch` remains blocked',
  '`field-mismatch:sortOrder` remains allowed after S5',
  '`productSyncReady` remains `false`',
  'No WebDAV/cloud/relay/fullBundle.v3',
  'No Chat Saving WebDAV/cloud/archive CAS',
]) {
  assertIncludes(evidence, tokenValue, `evidence token ${tokenValue}`);
}
assertIncludes(preflight, 'BINDING-MISMATCH REPAIR PREFLIGHT REQUIRED', 'preflight verdict');
assertIncludes(readiness, 'productSyncReady remains NOT READY after S5', 'readiness verdict');
assertIncludes(s5, 'S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED', 'S5 verdict');

assertIncludes(folderSyncSource, `CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '${RECEIPT_SCHEMA}'`, 'receipt schema minted');
assertIncludes(folderSyncSource, `CHAT_FOLDER_BINDING_REPAIR_APPLY_GATE = '${APPLY_GATE}'`, 'apply gate minted');
assertIncludes(folderSyncSource, 'bindingRepair: {', 'bindingRepair API exported');
assertIncludes(folderSyncSource, 'apply: applyChatFolderBindingRepairRequest', 'bindingRepair apply exported');
assertIncludes(folderSyncSource, 'validate: validateChatFolderBindingRepairRequestForDesktopApply', 'bindingRepair validate exported');
assertIncludes(folderSyncSource, "operationKind: CHAT_FOLDER_BINDING_REPAIR_OPERATION_KIND", 'consumed ledger operation recorded');
assertIncludes(folderSyncSource, "mirrorReprojection: 'deferred-to-binding-live-proof'", 'mirror write deferred');
assertIncludes(folderSyncSource, 'bindingMismatchAllowed: false', 'binding mismatch still blocked by handler receipt');
assertIncludes(folderSyncSource, 'productSyncReady: false', 'productSyncReady false marker');
assertIncludes(foldersStoreSource, 'skipBindingTombstone', 'unbind supports skipBindingTombstone');
assertIncludes(foldersStoreSource, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'F11 still blocks binding-mismatch');
assertIncludes(foldersStoreSource, "'field-mismatch:sortOrder': true", 'sortOrder remains allowed after S5');
assertIncludes(folderSyncSource, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b helper remains');
assertIncludes(folderSyncSource, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b marker remains');
assertIncludes(folderImportSource, "webdav: 'deferred'", 'folder import WebDAV remains deferred');

const combinedSource = `${folderSyncSource}\n${foldersStoreSource}\n${folderImportSource}`;
assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.doesNotMatch(folderSyncSource, /archiveCloud|archivePackage|chatSavingWebdavCloudArchiveCas:\s*'ready'/i,
  'Chat Saving/cloud archive CAS must not be introduced');
assert.ok(exists(archiveBoundaryPath), 'archive cloud boundary validator must remain present');

async function runHarness() {
  const mem = {};
  const storage = {
    get(keys, cb) {
      const out = {};
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) if (Object.prototype.hasOwnProperty.call(mem, key)) out[key] = mem[key];
      cb(out);
    },
    set(items, cb) {
      Object.assign(mem, items);
      if (cb) cb();
    },
  };

  const folders = [
    { id: token('folder-a'), folderId: token('folder-a'), sortOrder: 0 },
    { id: token('folder-b'), folderId: token('folder-b'), sortOrder: 1 },
  ];
  const tombstoned = [{ id: token('folder-t'), folderId: token('folder-t'), sortOrder: 2 }];
  const liveChats = new Set([token('chat-a'), token('chat-b'), token('chat-c')]);
  const bindings = new Map([
    [token('chat-a'), token('folder-a')],
    [token('chat-b'), token('folder-b')],
  ]);
  const writes = {
    canonicalBinding: 0,
    tombstone: 0,
    folderDelete: 0,
    folderPurge: 0,
    chatDelete: 0,
    mirror: 0,
    transport: 0,
    webdav: 0,
  };
  const rows = () => Array.from(bindings.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([chatId, folderId]) => ({
    chatId,
    conversationId: chatId,
    folderId,
    assignedAt: 1,
    source: 'desktop-canonical-folder-bindings-sqlite',
  }));
  const folderStore = {
    async getAll() {
      return folders.slice();
    },
    async listRecentlyDeletedFolders() {
      return tombstoned.slice();
    },
    async listCanonicalChatFolderBindings() {
      return rows();
    },
    async listCanonicalChatFolderBindingsForChat(chatId) {
      const folderId = bindings.get(String(chatId));
      return folderId ? [{ chatId, conversationId: chatId, folderId, assignedAt: 1 }] : [];
    },
    async getCanonicalChatFolderBindingForChat(chatId) {
      const list = await this.listCanonicalChatFolderBindingsForChat(chatId);
      return list[0] || null;
    },
    async bindChat(folderId, chatId, opts) {
      if (!opts || opts.skipBindingTombstone !== true) writes.tombstone += bindings.has(chatId) ? 1 : 0;
      bindings.set(chatId, folderId);
      writes.canonicalBinding += 1;
      return true;
    },
    async unbindChat(folderId, chatId, opts) {
      if (bindings.get(chatId) !== folderId) return false;
      bindings.delete(chatId);
      writes.canonicalBinding += 1;
      if (!opts || opts.skipBindingTombstone !== true) writes.tombstone += 1;
      return true;
    },
    async moveCanonicalChatFolderBinding(folderId, chatId, opts) {
      if (opts && opts.expectedCurrentFolderId && bindings.get(chatId) !== opts.expectedCurrentFolderId) {
        return { ok: false, status: 'expected-current-folder-mismatch', rowsAffected: 0 };
      }
      bindings.set(chatId, folderId);
      writes.canonicalBinding += 1;
      if (!opts || opts.skipBindingTombstone !== true) writes.tombstone += 1;
      return { ok: true, status: 'chat-folder-binding-moved', changed: true, rowsAffected: 1 };
    },
    // durable-confirmation surface: a fenced FRESH canonical re-read; matchesRequested reflects whether the
    // canonical binding actually landed (the durable gate rejects when it did not).
    async confirmCanonicalChatFolderBindingDurable(opts) {
      const freshRows = rows();
      let canonicalBindingHash = '';
      if (opts && typeof opts.hashRows === 'function') {
        try { canonicalBindingHash = String(await opts.hashRows(freshRows)); } catch (_) { canonicalBindingHash = ''; }
      }
      const requestedBindingHash = opts ? String(opts.requestedBindingHash || '') : '';
      return {
        durable: true,
        unverifiable: false,
        method: 'harness-fence+fresh-canonical-reread',
        checkpointed: true,
        canonicalBindingHash,
        matchesRequested: !!canonicalBindingHash && canonicalBindingHash === requestedBindingHash,
        storeIdentity: { adapter: 'harness', tableName: 'folder_bindings' },
        reason: 'harness-durable',
        rows: freshRows,
      };
    },
  };
  const chatsStore = {
    async get(chatId) {
      return liveChats.has(String(chatId)) ? { id: chatId } : null;
    },
  };

  globalThis.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected invoke'); } };
  globalThis.chrome = { storage: { local: storage }, runtime: {} };
  globalThis.H2O = {
    Studio: {
      store: { folders: folderStore, chats: chatsStore },
      identity: {
        get: () => ({
          physicalDeviceIdHash: sha256('device'),
          installIdHash: sha256('install'),
          syncPeerIdHash: sha256('peer'),
        }),
      },
    },
    Desktop: {},
  };

  const realSetTimeout = globalThis.setTimeout;
  try {
    vm.runInThisContext(read(ledgerPath), { filename: ledgerPath });
    globalThis.setTimeout = function () { return 0; };
    vm.runInThisContext(folderSyncSource, { filename: folderSyncPath });
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }

  const api = globalThis.H2O.Studio.sync && globalThis.H2O.Studio.sync.bindingRepair;
  assert.ok(api && typeof api.apply === 'function', 'real bindingRepair apply API must install');
  assert.equal(api.applyGate, APPLY_GATE, 'apply gate must match');

  async function currentHash() {
    const snapshot = await api.snapshot();
    return snapshot.bindingHash;
  }
  async function hashFor(extraRows, omitChatIds = []) {
    const omit = new Set(omitChatIds);
    const base = rows().filter((row) => !omit.has(row.chatId));
    return await api.bindingHash(base.concat(extraRows || []));
  }
  function baseReq(over) {
    return Object.assign({
      schema: REQUEST_SCHEMA,
      requestId: `req_${crypto.randomBytes(4).toString('hex')}`,
      sourcePeerId: `sha256:${sha256('peer')}`,
      surfaceKind: 'chrome-extension',
      intent: 'bind',
      chatId: token('chat-c'),
      targetFolderId: token('folder-a'),
      basisBindingHash: '',
      requestedBindingHash: '',
      createdAt: '2026-07-01T00:00:00.000Z',
      idempotencyKey: `idem_${crypto.randomBytes(4).toString('hex')}`,
      desktopApplyRequired: true,
      noLocalApply: true,
      noChromeCanonicalMutation: true,
      noHardDelete: true,
      noPurge: true,
      noChatDelete: true,
      noFolderDelete: true,
      noTombstoneMutation: true,
      privacy: { rawFolderNames: false, rawChatTitles: false, rawChatContent: false },
    }, over || {});
  }
  async function consumedCount() {
    const listed = await globalThis.H2O.Desktop.Sync.listConsumedOperations();
    return (listed.rows || []).filter((row) => row.operationKind === 'chat-folder-binding-repair').length;
  }

  const dryReq = baseReq({
    basisBindingHash: await currentHash(),
    requestedBindingHash: await hashFor([{ chatId: token('chat-c'), folderId: token('folder-a') }]),
  });
  const dryWritesBefore = writes.canonicalBinding;
  const dryReceipt = await api.apply(dryReq, {});
  assert.equal(dryReceipt.status, 'dry-run', 'dry-run status');
  assert.equal(dryReceipt.canonicalWriteCount, 0, 'dry-run canonicalWriteCount');
  assert.equal(writes.canonicalBinding, dryWritesBefore, 'dry-run writes zero canonical bindings');
  assert.equal(await consumedCount(), 0, 'dry-run does not consume idempotency');

  const bindReq = baseReq({
    idempotencyKey: 'idem_bind_apply',
    basisBindingHash: await currentHash(),
    requestedBindingHash: await hashFor([{ chatId: token('chat-c'), folderId: token('folder-a') }]),
  });
  const bindReceipt = await api.apply(bindReq, { apply: true, gate: APPLY_GATE });
  assert.equal(bindReceipt.status, 'applied', 'bind apply status');
  assert.equal(bindReceipt.reason, 'binding-repair-applied', 'bind apply reason');
  assert.equal(bindReceipt.canonicalWriteCount, 1, 'bind apply writes one canonical binding row');
  assert.equal(bindReceipt.resultingBindingHash, bindReq.requestedBindingHash, 'bind resulting hash');
  assert.equal(bindReceipt.idempotencyPersisted, true, 'bind idempotency persisted');
  assert.equal(bindReceipt.noTombstoneMutation, true, 'bind receipt tombstone safe');
  assert.equal(bindReceipt.noMirrorWrite, true, 'bind receipt mirror safe');
  assert.equal(bindReceipt.productSyncReady, false, 'bind receipt productSyncReady false');

  const replayWritesBefore = writes.canonicalBinding;
  const replay = await api.apply(bindReq, { apply: true, gate: APPLY_GATE });
  assert.equal(replay.status, 'skipped', 'replay status');
  assert.equal(replay.reason, 'duplicate', 'replay reason');
  assert.equal(replay.canonicalWriteCount, 0, 'replay writes zero');
  assert.equal(writes.canonicalBinding, replayWritesBefore, 'replay canonical unchanged');

  const moveReq = baseReq({
    intent: 'move',
    chatId: token('chat-a'),
    previousFolderId: token('folder-a'),
    targetFolderId: token('folder-b'),
    idempotencyKey: 'idem_move_apply',
    basisBindingHash: await currentHash(),
    requestedBindingHash: await hashFor([{ chatId: token('chat-a'), folderId: token('folder-b') }], [token('chat-a')]),
  });
  const moveReceipt = await api.apply(moveReq, { apply: true, gate: APPLY_GATE });
  assert.equal(moveReceipt.status, 'applied', 'move apply status');
  assert.equal(moveReceipt.canonicalWriteCount, 1, 'move writes one canonical binding row');
  assert.equal(moveReceipt.resultingBindingHash, moveReq.requestedBindingHash, 'move resulting hash');

  const unbindReq = baseReq({
    intent: 'unbind',
    chatId: token('chat-b'),
    previousFolderId: token('folder-b'),
    targetFolderId: token('folder-b'),
    idempotencyKey: 'idem_unbind_apply',
    basisBindingHash: await currentHash(),
    requestedBindingHash: await hashFor([], [token('chat-b')]),
  });
  const unbindReceipt = await api.apply(unbindReq, { apply: true, gate: APPLY_GATE });
  assert.equal(unbindReceipt.status, 'applied', 'unbind apply status');
  assert.equal(unbindReceipt.canonicalWriteCount, 1, 'unbind writes one canonical binding row');
  assert.equal(unbindReceipt.resultingBindingHash, unbindReq.requestedBindingHash, 'unbind resulting hash');

  const negativeStartWrites = writes.canonicalBinding;
  const negs = [
    ['stale-basis', baseReq({ basisBindingHash: 'sha256:stale', requestedBindingHash: await currentHash() }), 'stale-basis'],
    ['orphan-folder', baseReq({ chatId: token('chat-c'), targetFolderId: token('folder-missing'), basisBindingHash: await currentHash(), requestedBindingHash: await currentHash() }), 'orphan-folder-binding'],
    ['orphan-chat', baseReq({ chatId: token('chat-missing'), targetFolderId: token('folder-a'), basisBindingHash: await currentHash(), requestedBindingHash: await currentHash() }), 'orphan-chat-binding'],
    ['tombstoned-folder', baseReq({ chatId: token('chat-c'), targetFolderId: token('folder-t'), basisBindingHash: await currentHash(), requestedBindingHash: await currentHash() }), 'tombstoned-folder-binding'],
    ['privacy', baseReq({ title: 'raw title', basisBindingHash: await currentHash(), requestedBindingHash: await currentHash() }), 'privacy-redaction-violation'],
  ];
  for (const [name, req, reason] of negs) {
    const before = writes.canonicalBinding;
    const receipt = await api.apply(req, { apply: true, gate: APPLY_GATE });
    assert.equal(receipt.status, 'rejected', `${name} rejected`);
    assert.equal(receipt.reason, reason, `${name} reason`);
    assert.equal(receipt.canonicalWriteCount, 0, `${name} canonicalWriteCount`);
    assert.equal(writes.canonicalBinding, before, `${name} writes zero`);
  }
  assert.equal(writes.canonicalBinding, negativeStartWrites, 'all negative paths write zero');
  assert.equal(writes.tombstone, 0, 'no tombstone writes');
  assert.equal(writes.folderDelete + writes.folderPurge + writes.chatDelete, 0, 'no delete/purge/chat writes');
  assert.equal(writes.mirror + writes.transport + writes.webdav, 0, 'no mirror/transport/webdav writes');
  assert.ok(!Object.prototype.hasOwnProperty.call(mem, FOLDER_STATE_DATA_KEY), 'handler must not write render mirror');

  return {
    dryRunStatus: dryReceipt.status,
    bindStatus: bindReceipt.status,
    replayStatus: replay.status,
    moveStatus: moveReceipt.status,
    unbindStatus: unbindReceipt.status,
    canonicalBindingWriteCount: writes.canonicalBinding,
    tombstoneWriteCount: writes.tombstone,
    mirrorWriteCount: writes.mirror,
    consumedOperationCount: await consumedCount(),
    negativeCases: negs.map(([name]) => name),
  };
}

const harness = await runHarness();

const result = {
  schema: 'h2o.studio.folder-sync.binding-mismatch-repair-implementation.validator.v1',
  lane: 'folder-sync',
  verdict: 'BINDING_MISMATCH_REPAIR_IMPLEMENTED_AND_PROVEN',
  evidence: evidencePath,
  sourceChanged: [folderSyncPath, foldersStorePath],
  requestSchema: REQUEST_SCHEMA,
  receiptSchema: RECEIPT_SCHEMA,
  applyGate: APPLY_GATE,
  harness,
  bindingMismatchStillBlockedInF11: true,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-mismatch-repair-implementation');
