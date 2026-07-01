#!/usr/bin/env node
//
// Folder Sync Phase F32b — persistent idempotency + BEHAVIORAL apply-path proof of the REAL committed
// sortOrder handler (no live Desktop; no Tauri webview; node:sqlite temp DB; real consumed-operation ledger).
//
// Unlike F33 (which vm-evaluates only the decision functions), F32b LOADS the real folder-sync.tauri.js
// handler AND the real consumed-operation-ledger.tauri.js into a node harness and EXERCISES the real
// `H2O.Studio.sync.sortOrderReorder.apply(...)` against:
//   - a disposable canonical `folders` table (node:sqlite DatabaseSync) reached via a store.folders stub
//     whose only write path is UPDATE sort_order (so any canonical write is necessarily a sort_order write),
//   - the REAL H2O.Desktop.Sync.recordConsumedOperation / listConsumedOperations ledger, backed by an
//     in-memory chrome.storage.local mock (hash-only rows; no raw ids).
// It proves: dry-run default writes 0 rows and does not consume; gated apply writes only sort_order and
// reorders canonical to the requested order; a SEPARATE replay call with the same idempotencyKey writes 0
// rows and returns a duplicate/skipped receipt (PERSISTENT, ledger-sourced — not caller-context); conflict
// rejects write 0 rows and do not consume; no folder delete/purge/tombstone/chat/binding/mirror write; the
// receipt uses the receipt schema + canonicalAuthority desktop-sqlite + no-destructive flags; mirror stays
// deferred-to-s2b; F11 unchanged; productSyncReady false; binding receipt unminted; WebDAV deferred.
// If node:sqlite / DatabaseSync is unavailable, it STOPS and reports the blocker (it does not fake a proof).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f32bDoc = 'release-evidence/2026-07-01/folder-sync-f32b-persistent-idempotency-apply-proof.md';
const f33Doc = 'release-evidence/2026-06-25/folder-sync-f33-inprocess-reprove-and-s2b-design.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const ledgerFile = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const SPLIT_COMMIT = 'e405ba0';
const F33_COMMIT = 'fbfd6d8';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const LEDGER_KEY = 'h2o:sync:consumed-operation-ledger:v1';
const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';

function fail(msg) { failures.push(msg); }
function done() {
  if (failures.length) {
    console.error('FAIL validate-folder-sync-f32b-persistent-idempotency-apply-proof');
    for (const f of failures) console.error(`- ${f}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------------------------------
// Behavioral harness: real handler + real ledger over node:sqlite folders + in-memory chrome.storage.
// ---------------------------------------------------------------------------------------------------
async function runBehavioralProof() {
  // node:sqlite required — do not fake the apply proof.
  let DatabaseSync;
  try {
    const _emit = process.emitWarning;
    process.emitWarning = (w, ...rest) => {
      const s = typeof w === 'string' ? w : (w && w.message) || '';
      if (/SQLite is an experimental feature/i.test(s)) return undefined;
      return _emit.call(process, w, ...rest);
    };
    ({ DatabaseSync } = await import('node:sqlite'));
    process.emitWarning = _emit;
  } catch (e) {
    return { blocked: true, blocker: 'node:sqlite unavailable: ' + (e && e.message ? e.message : String(e)) };
  }
  if (typeof DatabaseSync !== 'function') return { blocked: true, blocker: 'node:sqlite DatabaseSync missing' };

  // disposable canonical folders table (fa,fb,fc visible; ft tombstoned)
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE folders (id TEXT PRIMARY KEY, sort_order INTEGER, tombstoned INTEGER)');
  const seed = db.prepare('INSERT INTO folders (id, sort_order, tombstoned) VALUES (?, ?, ?)');
  seed.run('fa', 0, 0); seed.run('fb', 1, 0); seed.run('fc', 2, 0); seed.run('ft', 3, 1);
  const folderRowCount = () => db.prepare('SELECT COUNT(*) AS n FROM folders').all()[0].n;
  const tombIds = () => db.prepare('SELECT id FROM folders WHERE tombstoned = 1').all().map((r) => r.id).join(',');
  const orderedVisible = () => db.prepare('SELECT id FROM folders WHERE tombstoned = 0 ORDER BY sort_order ASC').all().map((r) => r.id);

  const writes = { patchSortOrder: 0, otherStoreWrite: 0 };
  const foldersStore = {
    async getAll() {
      return db.prepare('SELECT id, sort_order FROM folders WHERE tombstoned = 0 ORDER BY sort_order ASC')
        .all().map((r) => ({ id: r.id, folderId: r.id, sortOrder: Number(r.sort_order) }));
    },
    async listRecentlyDeletedFolders() {
      return db.prepare('SELECT id FROM folders WHERE tombstoned = 1').all().map((r) => ({ id: r.id, folderId: r.id }));
    },
    async patch(id, partial) {
      if (partial && typeof partial === 'object' && typeof partial.sortOrder !== 'undefined' && Object.keys(partial).length === 1) {
        db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?').run(Number(partial.sortOrder), String(id));
        writes.patchSortOrder += 1;
      } else {
        writes.otherStoreWrite += 1; // any non-sort_order-only patch is a violation
      }
      return { ok: true };
    },
  };

  // in-memory chrome.storage.local for the real ledger
  const mem = {};
  const memStorage = {
    get(keys, cb) {
      const out = {};
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) if (Object.prototype.hasOwnProperty.call(mem, k)) out[k] = mem[k];
      cb(out);
    },
    set(items, cb) { Object.assign(mem, items); if (cb) cb(); },
  };
  const hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const identity = { physicalDeviceIdHash: hex('device'), installIdHash: hex('install'), syncPeerIdHash: hex('peer') };

  // install globals BEFORE loading the modules
  globalThis.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected tauri invoke in F32b harness'); } };
  globalThis.chrome = { storage: { local: memStorage }, runtime: {} };
  globalThis.H2O = {
    Studio: { store: { folders: foldersStore }, identity: { get: () => identity } },
    Desktop: {},
  };

  // load real ledger + real handler; suppress folder-sync boot watcher via a no-op setTimeout during load
  let loadError = '';
  const realSetTimeout = globalThis.setTimeout;
  try {
    vm.runInThisContext(read(ledgerFile), { filename: 'consumed-operation-ledger.tauri.js' });
    globalThis.setTimeout = function () { return 0; };
    vm.runInThisContext(read(folderSyncFile), { filename: 'folder-sync.tauri.js' });
  } catch (e) {
    loadError = e && e.message ? e.message : String(e);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  if (loadError) return { blocked: true, blocker: 'module load threw: ' + loadError };

  const ledgerApi = globalThis.H2O.Desktop && globalThis.H2O.Desktop.Sync;
  const sync = globalThis.H2O.Studio && globalThis.H2O.Studio.sync;
  const reorder = sync && sync.sortOrderReorder;
  if (!ledgerApi || typeof ledgerApi.recordConsumedOperation !== 'function' || typeof ledgerApi.listConsumedOperations !== 'function') {
    return { blocked: true, blocker: 'real consumed-operation ledger did not install' };
  }
  if (!reorder || typeof reorder.apply !== 'function' || typeof reorder.orderingHash !== 'function') {
    return { blocked: true, blocker: 'real sortOrderReorder handler did not install' };
  }

  const APPLY_GATE = reorder.applyGate;
  const oh = (ids) => reorder.orderingHash(ids);
  function mkReq(over) {
    return Object.assign({
      schema: REQUEST_SCHEMA, intent: 'folder-sortorder-reorder-request',
      requestId: 'req_' + crypto.randomBytes(4).toString('hex'),
      sourcePeerId: hex('src-peer'), surfaceKind: 'chrome-extension',
      orderPayload: [{ folderId: 'fa', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fc', position: 2 }],
      basisOrderingHash: oh(['fa', 'fb', 'fc']), requestedOrderingHash: oh(['fa', 'fb', 'fc']),
      createdAt: '2026-07-01T00:00:00.000Z', idempotencyKey: 'idem_' + crypto.randomBytes(6).toString('hex'),
      desktopApplyRequired: true, noLocalApply: true, noChromeCanonicalMutation: true,
      noHardDelete: true, noPurge: true, noChatDelete: true, noFolderDelete: true,
      noBindingMutation: true, noTombstoneMutation: true,
      privacy: { rawFolderNames: false, rawChatTitles: false, rawChatContent: false },
    }, over || {});
  }
  async function ledgerKeysConsumed() {
    const listed = await ledgerApi.listConsumedOperations();
    return (listed && Array.isArray(listed.rows) ? listed.rows : [])
      .filter((r) => String(r.operationKind) === 'folder-sortorder-reorder').length;
  }

  const before = { rows: folderRowCount(), tomb: tombIds(), order: orderedVisible().join(',') };

  // PROOF 1 — dry-run default (accepted): 0 writes, dry-run receipt, no consume
  const w0 = writes.patchSortOrder;
  const reqDry = mkReq(); // accepted (basis == current)
  const rDry = await reorder.apply(reqDry, {}); // no apply flag → dry-run
  assert(rDry && rDry.status === 'dry-run', `F32b dry-run: expected status dry-run, got ${rDry && rDry.status}`);
  assert(rDry && rDry.canonicalWriteCount === 0, 'F32b dry-run: canonicalWriteCount must be 0');
  assert(writes.patchSortOrder === w0, 'F32b dry-run: must write 0 canonical rows');
  assert((await ledgerKeysConsumed()) === 0, 'F32b dry-run: must NOT consume idempotency key');

  // PROOF 2 — gated apply (accepted): writes only sort_order, reorders canonical, consumes
  const reqApply = mkReq({ idempotencyKey: 'idem_apply_fixed',
    orderPayload: [{ folderId: 'fc', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fa', position: 2 }],
    basisOrderingHash: oh(['fa', 'fb', 'fc']), requestedOrderingHash: oh(['fc', 'fb', 'fa']) });
  const wA = writes.patchSortOrder;
  const rApply = await reorder.apply(reqApply, { apply: true, gate: APPLY_GATE });
  assert(rApply && rApply.status === 'applied', `F32b apply: expected applied, got ${rApply && rApply.status} (${rApply && rApply.reason})`);
  assert(rApply && rApply.canonicalWriteCount === 3, `F32b apply: canonicalWriteCount must be 3, got ${rApply && rApply.canonicalWriteCount}`);
  assert(writes.patchSortOrder - wA === 3, 'F32b apply: exactly 3 sort_order writes');
  assert(writes.otherStoreWrite === 0, 'F32b apply: no non-sort_order store writes');
  assert(orderedVisible().join(',') === 'fc,fb,fa', `F32b apply: canonical order must become fc,fb,fa; got ${orderedVisible().join(',')}`);
  assert(rApply && rApply.idempotencyPersisted === true, 'F32b apply: idempotencyPersisted must be true (recorded to ledger)');
  assert(rApply && rApply.canonicalAuthority === 'desktop-sqlite', 'F32b apply: canonicalAuthority must be desktop-sqlite');
  assert(rApply && rApply.mirrorReprojection === 'deferred-to-s2b', 'F32b apply: mirror must remain deferred-to-s2b');
  for (const k of ['noDestructiveMutation', 'noFolderDelete', 'noFolderPurge', 'noChatDelete', 'noBindingMutation', 'noTombstoneMutation']) {
    assert(rApply && rApply[k] === true, `F32b apply receipt: ${k} must be true`);
  }
  assert(rApply && rApply.schema === RECEIPT_SCHEMA, 'F32b apply receipt: schema must be the receipt schema');
  assert((await ledgerKeysConsumed()) === 1, 'F32b apply: exactly one consumed operation recorded');

  // PROOF 3 — PERSISTENT replay: a SEPARATE call, same idempotencyKey, fresh options (no ctx) → duplicate, 0 writes
  const wR = writes.patchSortOrder;
  const rReplay = await reorder.apply(reqApply, { apply: true, gate: APPLY_GATE });
  assert(rReplay && rReplay.status === 'skipped', `F32b replay: expected skipped, got ${rReplay && rReplay.status}`);
  assert(rReplay && rReplay.reason === 'duplicate', `F32b replay: expected reason duplicate, got ${rReplay && rReplay.reason}`);
  assert(rReplay && rReplay.canonicalWriteCount === 0, 'F32b replay: canonicalWriteCount must be 0');
  assert(writes.patchSortOrder === wR, 'F32b replay: must write 0 canonical rows (persistent no-op)');
  assert(orderedVisible().join(',') === 'fc,fb,fa', 'F32b replay: canonical order unchanged');
  assert((await ledgerKeysConsumed()) === 1, 'F32b replay: must not double-record');

  // PROOF 4 — conflict stale-basis: 0 writes, rejected, not consumed
  const wS = writes.patchSortOrder;
  const reqStale = mkReq({ idempotencyKey: 'idem_stale', orderPayload: [{ folderId: 'fa' }, { folderId: 'fb' }, { folderId: 'fc' }],
    basisOrderingHash: oh(['fa', 'fb', 'fc']) }); // canonical is now fc,fb,fa → basis stale
  const rStale = await reorder.apply(reqStale, { apply: true, gate: APPLY_GATE });
  assert(rStale && rStale.status === 'rejected' && rStale.reason === 'stale-basis', `F32b stale-basis: got ${rStale && rStale.status}/${rStale && rStale.reason}`);
  assert(writes.patchSortOrder === wS, 'F32b stale-basis: 0 writes');

  // PROOF 5 — conflict unknown-folder: 0 writes, rejected, not consumed
  const wU = writes.patchSortOrder;
  const reqUnknown = mkReq({ idempotencyKey: 'idem_unknown', orderPayload: [{ folderId: 'zzz' }],
    basisOrderingHash: oh(['zzz']), requestedOrderingHash: oh(['zzz']) });
  const rUnknown = await reorder.apply(reqUnknown, { apply: true, gate: APPLY_GATE });
  assert(rUnknown && rUnknown.status === 'rejected' && rUnknown.reason === 'unknown-folder', `F32b unknown-folder: got ${rUnknown && rUnknown.status}/${rUnknown && rUnknown.reason}`);
  assert(writes.patchSortOrder === wU, 'F32b unknown-folder: 0 writes');
  assert((await ledgerKeysConsumed()) === 1, 'F32b conflicts must not consume idempotency keys');

  // PROOF 6 — conflict tombstoned-folder (reachable via the seeded tombstoned 'ft'): rejected, 0 writes, not consumed
  const wT = writes.patchSortOrder;
  const reqTomb = mkReq({ idempotencyKey: 'idem_tomb', orderPayload: [{ folderId: 'ft' }],
    basisOrderingHash: oh(['ft']), requestedOrderingHash: oh(['ft']) });
  const rTomb = await reorder.apply(reqTomb, { apply: true, gate: APPLY_GATE });
  assert(rTomb && rTomb.status === 'rejected' && rTomb.reason === 'tombstoned-folder', `F32b tombstoned-folder: got ${rTomb && rTomb.status}/${rTomb && rTomb.reason}`);
  assert(rTomb && rTomb.canonicalWriteCount === 0, 'F32b tombstoned-folder: canonicalWriteCount 0');
  assert(writes.patchSortOrder === wT, 'F32b tombstoned-folder: 0 sort_order writes');
  assert(rTomb && rTomb.mirrorReprojection === 'deferred-to-s2b', 'F32b tombstoned-folder: mirror remains deferred');
  assert((await ledgerKeysConsumed()) === 1, 'F32b tombstoned-folder: must not consume idempotency key');

  // PROOF 7 — conflict superseded-concurrent (reachable via ctx.priorAppliedInBatch + stale basis): rejected, 0 writes, not consumed
  const wSc = writes.patchSortOrder;
  const reqSup = mkReq({ idempotencyKey: 'idem_superseded', orderPayload: [{ folderId: 'fa' }, { folderId: 'fb' }, { folderId: 'fc' }],
    basisOrderingHash: oh(['fa', 'fb', 'fc']), requestedOrderingHash: oh(['fc', 'fb', 'fa']) }); // canonical is fc,fb,fa → basis is stale
  const rSup = await reorder.apply(reqSup, { apply: true, gate: APPLY_GATE, ctx: { priorAppliedInBatch: true } });
  assert(rSup && rSup.status === 'rejected' && rSup.reason === 'superseded-concurrent', `F32b superseded-concurrent: got ${rSup && rSup.status}/${rSup && rSup.reason}`);
  assert(rSup && rSup.canonicalWriteCount === 0, 'F32b superseded-concurrent: canonicalWriteCount 0');
  assert(writes.patchSortOrder === wSc, 'F32b superseded-concurrent: 0 sort_order writes');
  assert(rSup && rSup.mirrorReprojection === 'deferred-to-s2b', 'F32b superseded-concurrent: mirror remains deferred');
  assert((await ledgerKeysConsumed()) === 1, 'F32b superseded-concurrent: must not consume idempotency key');

  // PROOF 8 — ungated apply of an accepted (non-consumed) request → rejected apply-gate-required, 0 writes
  const wG = writes.patchSortOrder;
  const reqGate = mkReq({ idempotencyKey: 'idem_nogate', orderPayload: [{ folderId: 'fb' }, { folderId: 'fa' }, { folderId: 'fc' }],
    basisOrderingHash: oh(['fc', 'fb', 'fa']), requestedOrderingHash: oh(['fb', 'fa', 'fc']) });
  const rGate = await reorder.apply(reqGate, { apply: true }); // no gate
  assert(rGate && rGate.status === 'rejected' && rGate.reason === 'apply-gate-required', `F32b gate: got ${rGate && rGate.status}/${rGate && rGate.reason}`);
  assert(writes.patchSortOrder === wG, 'F32b gate: 0 writes without gate');

  const after = { rows: folderRowCount(), tomb: tombIds() };
  assert(after.rows === before.rows, 'F32b: folder row count unchanged (no insert/delete/purge)');
  assert(after.tomb === before.tomb, 'F32b: tombstone set unchanged (no tombstone mutation)');
  assert(!Object.prototype.hasOwnProperty.call(mem, FOLDER_STATE_DATA_KEY), 'F32b: no FOLDER_STATE_DATA_KEY mirror write');
  assert(Object.prototype.hasOwnProperty.call(mem, LEDGER_KEY), 'F32b: consumed-operation ledger key present (persistent store used)');
  assert(writes.otherStoreWrite === 0, 'F32b: only sort_order canonical writes occurred');

  return {
    blocked: false,
    sqliteMode: 'node:sqlite',
    dryRunWrites: 0,
    applyWrites: 3,
    finalCanonicalOrder: orderedVisible().join(','),
    replayWrites: 0,
    replayStatus: rReplay.status,
    consumedRows: await ledgerKeysConsumed(),
    idempotencyPersistedOnApply: rApply.idempotencyPersisted === true,
    otherStoreWrites: writes.otherStoreWrite,
    mirrorWritten: Object.prototype.hasOwnProperty.call(mem, FOLDER_STATE_DATA_KEY),
  };
}

// ---- doc presence + supersession ----
assert(exists(f32bDoc), `${f32bDoc}: missing`);
if (exists(f32bDoc)) {
  const doc = read(f32bDoc);
  assert(doc.length > 3000, `${f32bDoc}: too short`);
  const flat = doc.replace(/\s+/g, ' ');
  assert(flat.includes(SPLIT_COMMIT), `F32b doc must reference the split-decision commit ${SPLIT_COMMIT}`);
  assert(flat.includes(F33_COMMIT), `F32b doc must reference the F33 commit ${F33_COMMIT}`);
  assert(/persistent idempotency/i.test(flat), 'F32b doc must state persistent idempotency');
  assert(/behavioral apply(?:-| )path proof|node:sqlite/i.test(flat), 'F32b doc must state the behavioral apply proof method');
  assert(/S2 (still )?remains open|full S2 remains open/i.test(flat), 'F32b doc must state full S2 remains open');
  assert(/deferred-to-s2b|mirror-after-write remains deferred/i.test(flat), 'F32b doc must keep mirror-after-write deferred');
  assert(/supersed/i.test(flat), "F32b doc must supersede F33's live-dry-run recommendation");
  assert(exists(f33Doc), 'F33 doc must exist (F32b supersedes its next-step recommendation)');
  assert(/tombstoned-folder/i.test(flat) && /superseded-concurrent/i.test(flat),
    'F32b doc must list the newly-covered reachable conflict classes (tombstoned-folder, superseded-concurrent)');
  assert(/missing-folder/i.test(flat) && /folder-not-in-catalog/i.test(flat) && /unreachable|dead[- ]branch/i.test(flat),
    'F32b doc must record missing-folder + folder-not-in-catalog as unreachable/dead-branch (F33 synthetic coverage), not overclaim all 7');
}

// ---- source: handler + ledger usage + deferral, no mirror/F11/flip/binding ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes('sortOrderReorder: {'), 'handler must remain exposed as sortOrderReorder');
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'apply function must exist');
  assert(src.includes('listConsumedOperations') && src.includes('recordConsumedOperation'),
    'handler must reference the existing consumed-operation ledger APIs');
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'mirror re-projection must remain deferred-to-s2b');
  assert(!src.includes('rebuildRenderMirrorFromSqlite'), 'handler file must not call rebuildRenderMirrorFromSqlite');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema must remain unminted');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'fullBundle must remain v2');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
  // the handler body must not itself write the mirror or flip readiness
  const b0 = src.indexOf('===================== F32 (folder-sync S2): sortOrder reorder Desktop handler');
  const b1 = src.indexOf('===================== end F32 S2 sortOrder reorder handler');
  const body = (b0 !== -1 && b1 !== -1) ? src.slice(b0, b1) : '';
  for (const banned of ['FOLDER_STATE_DATA_KEY', 'chromeStorageSet', 'productSyncReady: true', 'productSyncReady = true']) {
    assert(!body.includes(banned), `F32b handler body must NOT contain: ${banned}`);
  }
}

// ---- F11 unchanged ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'F11 gate constant must remain');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 must STILL block field-mismatch:sortOrder + binding-mismatch (no allowed-set change)');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-import.mv3.js');
assert(exists(ledgerFile), 'consumed-operation-ledger.tauri.js must exist (idempotency substrate)');

// ---- RUN THE BEHAVIORAL PROOF ----
let proof = null;
try {
  proof = await runBehavioralProof();
} catch (e) {
  fail('F32b behavioral proof threw: ' + (e && e.message ? e.message : String(e)));
}
if (proof && proof.blocked) {
  fail('F32b behavioral proof BLOCKED (not faked): ' + proof.blocker);
}

done();

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f32b-persistent-idempotency-apply-proof.v1',
  lane: 'folder-sync',
  phase: 'F32b',
  f32bDoc,
  splitCommitReferenced: SPLIT_COMMIT,
  f33CommitReferenced: F33_COMMIT,
  behavioralApplyProof: true,
  reproveApproach: 'real-handler+real-ledger over node:sqlite temp DB (no live Desktop, no Tauri webview)',
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  dryRunWrites: proof ? proof.dryRunWrites : null,
  applyWrites: proof ? proof.applyWrites : null,
  finalCanonicalOrder: proof ? proof.finalCanonicalOrder : null,
  replayWrites: proof ? proof.replayWrites : null,
  replayStatus: proof ? proof.replayStatus : null,
  persistentIdempotency: proof ? proof.idempotencyPersistedOnApply === true && proof.replayWrites === 0 : false,
  behavioralConflictClasses: ['duplicate', 'stale-basis', 'unknown-folder', 'tombstoned-folder', 'superseded-concurrent'],
  deadBranchConflictClasses: ['missing-folder', 'folder-not-in-catalog'],
  consumedRows: proof ? proof.consumedRows : null,
  otherStoreWrites: proof ? proof.otherStoreWrites : null,
  mirrorWritten: proof ? proof.mirrorWritten : null,
  mirrorReprojection: 'deferred-to-s2b',
  s2StillOpen: true,
  f11AllowedSetChanged: false,
  productSyncReady: false,
  bindingReceiptSchemaMinted: false,
  supersedesF33LiveDryRunRecommendation: true,
  recommendedNext: 'S3 live Desktop dry-run — only if strict review accepts F32b (separate explicit approval); mirror-after-write remains S2b/S5',
}, null, 2));
console.log('PASS validate-folder-sync-f32b-persistent-idempotency-apply-proof');
