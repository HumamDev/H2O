#!/usr/bin/env node
//
// Folder Sync — F15-settled binding repair-write routing implementation proof.
//
// Loads the REAL folder-sync.tauri.js binding repair handler + REAL consumed-operation ledger over a mock store
// that models BOTH the canonical bindings and the F15-settled source-of-truth, and proves: the repair routes
// bind/move through the F15-settled delegation (settled source updated) and SURVIVES a simulated
// settlement/reconcile (rebuild-from-settled does NOT revert); a bare (unsettled) write would be reverted; the
// bare moveCanonicalChatFolderBinding is NOT called by the repair; F15 delegation unavailable -> rejected + zero
// ledger consume; the busy-aware durable gate + post-apply-binding-hash-mismatch remain and are ordered before
// the ledger consume. Source anchors confirm the routing change and the retained gates. No live apply.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-binding-f15-settled-repair-write-implementation.md';
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
  const liveChats = new Set([token('chat-c'), token('chat-a')]);
  const bindings = new Map();      // canonical folder_bindings
  const settledSource = new Map(); // the F15-settled source-of-truth
  let f15Available = true;
  let moveCalled = 0;
  const rows = () => Array.from(bindings.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([chatId, folderId]) => ({
    chatId, conversationId: chatId, folderId, assignedAt: 1, source: 'desktop-canonical-folder-bindings-sqlite',
  }));
  const reconcile = () => { bindings.clear(); for (const [c, f] of settledSource.entries()) bindings.set(c, f); };

  const folderStore = {
    async getAll() { return folders.slice(); },
    async listRecentlyDeletedFolders() { return []; },
    async listCanonicalChatFolderBindings() { return rows(); },
    async listCanonicalChatFolderBindingsForChat(chatId) { const f = bindings.get(String(chatId)); return f ? [{ chatId, conversationId: chatId, folderId: f, assignedAt: 1 }] : []; },
    async getCanonicalChatFolderBindingForChat(chatId) { const l = await this.listCanonicalChatFolderBindingsForChat(chatId); return l[0] || null; },
    async bindChat(folderId, chatId, opts) {
      const settled = !!(opts && opts.useF15FolderBindingDelegation === true);
      if (settled) {
        if (!f15Available) return false;                 // F15 delegation unavailable, no fallback -> fail
        settledSource.set(chatId, folderId); bindings.set(chatId, folderId); return true; // settled: BOTH updated
      }
      bindings.set(chatId, folderId); return true;       // bare/legacy: canonical only (NOT settled)
    },
    async unbindChat(folderId, chatId, opts) {
      const settled = !!(opts && opts.useF15FolderBindingDelegation === true);
      if (settled && !f15Available) return false;
      if (bindings.get(chatId) === folderId) bindings.delete(chatId);
      if (settled) settledSource.delete(chatId);
      return true;
    },
    async moveCanonicalChatFolderBinding(folderId, chatId) { moveCalled += 1; bindings.set(chatId, folderId); return { ok: true, status: 'chat-folder-binding-moved', changed: true, rowsAffected: 1 }; },
    async confirmCanonicalChatFolderBindingDurable(opts) {
      const freshRows = rows();
      let canonicalBindingHash = '';
      if (opts && typeof opts.hashRows === 'function') { try { canonicalBindingHash = String(await opts.hashRows(freshRows)); } catch (_) { canonicalBindingHash = ''; } }
      const requestedBindingHash = opts ? String(opts.requestedBindingHash || '') : '';
      return { durable: true, unverifiable: false, checkpointed: true, fenceInterpretation: 'checkpoint-confirmed', method: 'harness-fence+reread', canonicalBindingHash, matchesRequested: !!canonicalBindingHash && canonicalBindingHash === requestedBindingHash, storeIdentity: { adapter: 'harness' }, reason: 'checkpoint-confirmed', rows: freshRows };
    },
  };
  const chatsStore = { async get(chatId) { return liveChats.has(String(chatId)) ? { id: chatId } : null; } };

  globalThis.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected invoke'); } };
  globalThis.chrome = { storage: { local: storage }, runtime: {} };
  globalThis.H2O = { Studio: { store: { folders: folderStore, chats: chatsStore }, identity: { get: () => ({ physicalDeviceIdHash: sha256('d'), installIdHash: sha256('i'), syncPeerIdHash: sha256('p') }) } }, Desktop: {} };

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
  const hashFor = async (extra, omit) => {
    const omitSet = new Set(omit || []);
    const base = rows().filter((r) => !omitSet.has(r.chatId));
    return await api.bindingHash(base.concat(extra || []));
  };
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
  const consumedCount = async () => (((await globalThis.H2O.Desktop.Sync.listConsumedOperations()).rows) || []).filter((r) => r.operationKind === 'chat-folder-binding-repair').length;

  const out = {};

  // CASE 1 — settled bind: applied, consume +1, settled source updated, SURVIVES reconcile, move NOT called
  f15Available = true; moveCalled = 0;
  const req1 = baseReq({ chatId: token('chat-c'), targetFolderId: token('folder-a'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-c'), folderId: token('folder-a') }]) });
  const before1 = await consumedCount();
  const r1 = await api.apply(req1, { apply: true, gate: APPLY_GATE });
  out.settledBindStatus = r1.status;
  assert(r1.status === 'applied', `settled bind: expected applied, got ${r1.status}/${r1.reason}`);
  assert(r1.idempotencyPersisted === true && r1.canonicalBindingWriteCount === 1, 'settled bind: idempotencyPersisted + write count 1');
  assert((await consumedCount()) === before1 + 1, 'settled bind: consumes one ledger row');
  assert(settledSource.get(token('chat-c')) === token('folder-a'), 'settled bind: F15-settled source-of-truth updated');
  assert(moveCalled === 0, 'repair must NOT call the bare moveCanonicalChatFolderBinding');
  reconcile();
  assert(bindings.get(token('chat-c')) === token('folder-a'), 'RECONCILE-SURVIVAL: settled bind survives a settlement/reconcile rebuild');
  out.reconcileSurvivedBind = bindings.get(token('chat-c')) === token('folder-a');

  // CASE 2 — settled move/rebind: chat-a folder-a -> folder-b, applied, survives reconcile, move NOT called
  f15Available = true; moveCalled = 0;
  settledSource.set(token('chat-a'), token('folder-a')); bindings.set(token('chat-a'), token('folder-a'));
  const req2 = baseReq({ intent: 'move', chatId: token('chat-a'), targetFolderId: token('folder-b'),
    previousFolderId: token('folder-a'), expectedCurrentFolderId: token('folder-a'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-a'), folderId: token('folder-b') }], [token('chat-a')]) });
  const r2 = await api.apply(req2, { apply: true, gate: APPLY_GATE });
  out.settledMoveStatus = r2.status;
  assert(r2.status === 'applied', `settled move: expected applied, got ${r2.status}/${r2.reason}`);
  assert(moveCalled === 0, 'repair move must NOT call bare moveCanonicalChatFolderBinding (routes through settled bindChat)');
  assert(settledSource.get(token('chat-a')) === token('folder-b'), 'settled move: F15-settled source updated to folder-b');
  reconcile();
  assert(bindings.get(token('chat-a')) === token('folder-b'), 'RECONCILE-SURVIVAL: settled move survives reconcile');

  // CONTROL — a bare write (not settled) is REVERTED by reconcile (proves reconcile actually reverts non-settled)
  bindings.set(token('chat-c'), token('folder-b')); // bare canonical mutation only (settledSource still folder-a)
  reconcile();
  assert(bindings.get(token('chat-c')) === token('folder-a'), 'CONTROL: a bare (unsettled) write is reverted by reconcile (settled remained folder-a)');

  // CASE 3 — F15 delegation unavailable: rejected, zero consume, idempotencyPersisted false
  f15Available = false; moveCalled = 0;
  const req3 = baseReq({ chatId: token('chat-c'), targetFolderId: token('folder-b'),
    basisBindingHash: await currentHash(), requestedBindingHash: await hashFor([{ chatId: token('chat-c'), folderId: token('folder-b') }], [token('chat-c')]) });
  const before3 = await consumedCount();
  const r3 = await api.apply(req3, { apply: true, gate: APPLY_GATE });
  out.contingencyStatus = r3.status; out.contingencyReason = r3.reason;
  assert(r3.status === 'rejected', `F15-unavailable: expected rejected, got ${r3.status}/${r3.reason}`);
  assert(r3.idempotencyPersisted !== true && Number(r3.canonicalBindingWriteCount) === 0, 'F15-unavailable: no idempotency persist, zero write count');
  assert((await consumedCount()) === before3, 'LEDGER-CONTINGENCY: F15-unavailable consumes ZERO ledger rows');

  out.blocked = false;
  return out;
}

// ---- doc ----
assert(exists(doc), `${doc}: missing`);
if (exists(doc)) {
  const flat = read(doc).replace(/\s+/g, ' ');
  assert(/BINDING F15-SETTLED REPAIR-WRITE ROUTING IMPLEMENTED/.test(flat), 'doc must carry the implemented verdict');
  assert(/no longer (sets|uses) `?explicitF7Fallback/i.test(flat), 'doc must state explicitF7Fallback no longer used for normal repair');
  assert(/useF15FolderBindingDelegation|F15-settled delegation|delegateF15FolderBindingWrite/i.test(flat), 'doc must state routing through F15-settled delegation');
  assert(/No new Rust|no new Rust/i.test(flat), 'doc must state no new Rust');
  assert(/reconcile|settlement\/reconcile|survives reconcile/i.test(flat), 'doc must state reconcile-survival');
  assert(/F15 delegation is unavailable[^.]*safe-fail|safe-fails and consumes no ledger/i.test(flat), 'doc must state F15-unavailable safe-fail no consume');
  assert(/busy-aware durable gate/i.test(flat) && /post-apply-binding-hash-mismatch/.test(flat), 'doc must state gate retention');
  assert(/No live apply/i.test(flat), 'doc must state no live apply');
  assert(/`?binding-mismatch`? remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'doc must keep binding-mismatch blocked');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
}

// ---- source anchors ----
assert(exists(folderSyncPath), `${folderSyncPath}: missing`);
if (exists(folderSyncPath)) {
  const src = read(folderSyncPath);
  assert(src.includes('useF15FolderBindingDelegation: true'), 'repair writeOpts must route through the F15-settled delegation');
  assert(!src.includes('explicitF7Fallback: true'), 'repair must no longer set explicitF7Fallback:true');
  assert(!src.includes('folders.moveCanonicalChatFolderBinding('), 'repair handler must not call the bare moveCanonicalChatFolderBinding');
  assert(src.includes('post-apply-binding-hash-mismatch'), 'existing hash gate must remain');
  assert(src.includes('confirmCanonicalChatFolderBindingDurable('), 'busy-aware durable gate call must remain');
  const hashIdx = src.indexOf('post-apply-binding-hash-mismatch');
  const durableIdx = src.indexOf('confirmCanonicalChatFolderBindingDurable(');
  const consumeIdx = src.indexOf('await bindingRepairRecordConsumed(request)');
  assert(hashIdx !== -1 && durableIdx !== -1 && consumeIdx !== -1 && hashIdx < durableIdx && durableIdx < consumeIdx,
    'ordering must remain: hash gate < durable gate < ledger consume');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
}
assert(exists(foldersStorePath), `${foldersStorePath}: missing`);
if (exists(foldersStorePath)) {
  const store = read(foldersStorePath);
  assert(store.includes('function delegateF15FolderBindingWrite('), 'F15-settled delegation must exist in the store (fix target, unchanged)');
  assert(store.includes('parsed.busy === 1'), 'busy-aware fence must remain in the store');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"), 'F11 must STILL block binding-mismatch');
}
assert(exists(archiveBoundaryPath), 'Chat Saving archive-cloud boundary validator must remain present');

// ---- run behavioral proof ----
let proof = null;
try { proof = await runHarness(); }
catch (e) { failures.push('reconcile-survival harness threw: ' + (e && e.message ? e.message : String(e))); }
if (proof && proof.blocked) failures.push('reconcile-survival harness BLOCKED: ' + proof.blocker);

if (failures.length) {
  console.error('FAIL validate-folder-sync-binding-f15-settled-repair-write-implementation');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.binding-f15-settled-repair-write-implementation.v1',
  lane: 'folder-sync-binding',
  phase: 'binding-f15-settled-repair-write-implementation',
  doc,
  verdict: 'BINDING-F15-SETTLED-REPAIR-WRITE-ROUTING-IMPLEMENTED',
  storeOnlyFix: false,
  handlerOnlyFix: true,
  normalRepairUsesExplicitF7Fallback: false,
  routesThroughF15SettledDelegation: true,
  bareMoveUsedByRepair: false,
  reconcileSurvivalProven: true,
  ledgerContingencyProven: true,
  busyAwareGateRetained: true,
  postApplyHashGateRetained: true,
  settledBindStatus: proof ? proof.settledBindStatus : null,
  settledMoveStatus: proof ? proof.settledMoveStatus : null,
  contingencyStatus: proof ? proof.contingencyStatus : null,
  newRustRequired: false,
  liveApplyPerformed: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  webdavCloudRelayBlocked: true,
  chatSavingCasBlocked: true,
  recommendedNext: 'independent patch review, then live dry-run/reload/reconcile-survival proof before any allowed-set flip',
}, null, 2));
console.log('PASS validate-folder-sync-binding-f15-settled-repair-write-implementation');
