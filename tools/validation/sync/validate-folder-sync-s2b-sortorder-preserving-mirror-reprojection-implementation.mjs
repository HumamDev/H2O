#!/usr/bin/env node
//
// Folder Sync — S2b implementation/proof meta-validator: sortOrder-preserving render-mirror re-projection.
//
// Loads the REAL folder-sync.tauri.js handler + REAL consumed-operation ledger over a disposable node:sqlite
// canonical folders table, SEEDS an in-memory render mirror (FOLDER_STATE_DATA_KEY) with folder rows carrying
// name/color + a stale sortOrder and binding items, and exercises the real apply(...): dry-run leaves the
// mirror byte-for-byte unchanged (no mirror write); gated apply reorders canonical AND projects the canonical
// order into the mirror PRESERVING sortOrder (marker applied-sortorder-preserving-s2b), preserving name/color +
// binding items, bounded (no new rows); a second accepted apply of the same order is an idempotent no-op
// (mirror unchanged). It also checks source anchors (projection lives OUTSIDE the F32 region; the F32 region is
// still free of FOLDER_STATE_DATA_KEY/chromeStorageSet; the builder default stays deferred-to-s2b; the file
// does not reuse the F11 rebuild helper; F11 still strips sortOrder proving why) and the evidence doc. If
// node:sqlite is unavailable it STOPS and reports the blocker (it does not fake the proof).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-s2b-sortorder-preserving-mirror-reprojection-implementation.md';
const preflightDoc = 'release-evidence/2026-07-01/folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const ledgerFile = 'src-surfaces-base/studio/sync/consumed-operation-ledger.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const PREFLIGHT_COMMIT = 'aa2da1ac';
const S4_COMMIT = 'c5553526';
const POST_S4_COMMIT = 'a47742d5';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const FOLDER_STATE_DATA_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
const S2B_MARKER = 'applied-sortorder-preserving-s2b';

async function runS2bProof() {
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

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE folders (id TEXT PRIMARY KEY, sort_order INTEGER, tombstoned INTEGER)');
  const seed = db.prepare('INSERT INTO folders (id, sort_order, tombstoned) VALUES (?, ?, ?)');
  seed.run('fa', 0, 0); seed.run('fb', 1, 0); seed.run('fc', 2, 0); seed.run('ft', 3, 1);
  const folderRowCount = () => db.prepare('SELECT COUNT(*) AS n FROM folders').all()[0].n;
  const tombIds = () => db.prepare('SELECT id FROM folders WHERE tombstoned = 1').all().map((r) => r.id).join(',');
  const orderedVisible = () => db.prepare('SELECT id FROM folders WHERE tombstoned = 0 ORDER BY sort_order ASC, id ASC').all().map((r) => r.id);

  const writes = { patchSortOrder: 0, otherStoreWrite: 0 };
  const foldersStore = {
    async getAll() {
      return db.prepare('SELECT id, sort_order FROM folders WHERE tombstoned = 0 ORDER BY sort_order ASC, id ASC')
        .all().map((r) => ({ id: r.id, folderId: r.id, sortOrder: Number(r.sort_order) }));
    },
    async listRecentlyDeletedFolders() {
      return db.prepare('SELECT id FROM folders WHERE tombstoned = 1').all().map((r) => ({ id: r.id, folderId: r.id }));
    },
    async patch(id, partial) {
      if (partial && typeof partial === 'object' && typeof partial.sortOrder !== 'undefined' && Object.keys(partial).length === 1) {
        db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?').run(Number(partial.sortOrder), String(id));
        writes.patchSortOrder += 1;
      } else { writes.otherStoreWrite += 1; }
      return { ok: true };
    },
  };

  const mem = {};
  const memStorage = {
    get(keys, cb) { const out = {}; const arr = Array.isArray(keys) ? keys : [keys]; for (const k of arr) if (Object.prototype.hasOwnProperty.call(mem, k)) out[k] = mem[k]; cb(out); },
    set(items, cb) { Object.assign(mem, items); if (cb) cb(); },
  };
  const hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
  const identity = { physicalDeviceIdHash: hex('device'), installIdHash: hex('install'), syncPeerIdHash: hex('peer') };

  globalThis.__TAURI_INTERNALS__ = { invoke: async () => { throw new Error('unexpected tauri invoke'); } };
  globalThis.chrome = { storage: { local: memStorage }, runtime: {} };
  globalThis.H2O = { Studio: { store: { folders: foldersStore }, identity: { get: () => identity } }, Desktop: {} };

  let loadError = '';
  const realSetTimeout = globalThis.setTimeout;
  try {
    vm.runInThisContext(read(ledgerFile), { filename: 'consumed-operation-ledger.tauri.js' });
    globalThis.setTimeout = function () { return 0; };
    vm.runInThisContext(read(folderSyncFile), { filename: 'folder-sync.tauri.js' });
  } catch (e) { loadError = e && e.message ? e.message : String(e); } finally { globalThis.setTimeout = realSetTimeout; }
  if (loadError) return { blocked: true, blocker: 'module load threw: ' + loadError };

  const sync = globalThis.H2O.Studio && globalThis.H2O.Studio.sync;
  const reorder = sync && sync.sortOrderReorder;
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

  // seed a render mirror: rows carry name/color + a STALE sortOrder; items carries bindings.
  const seededItems = { fa: ['chatX'], fb: [], fc: ['chatY'] };
  mem[FOLDER_STATE_DATA_KEY] = {
    schemaVersion: 1, source: 'stored-folder-state',
    folders: [
      { id: 'fa', folderId: 'fa', name: 'Alpha', color: '#a11', sortOrder: 99 },
      { id: 'fb', folderId: 'fb', name: 'Bravo', color: '#b22', sortOrder: 99 },
      { id: 'fc', folderId: 'fc', name: 'Charlie', color: '#c33', sortOrder: 99 },
    ],
    items: JSON.parse(JSON.stringify(seededItems)),
  };

  // PROOF A — dry-run: 0 canonical writes; mirror byte-for-byte unchanged
  const mirrorBeforeDry = JSON.stringify(mem[FOLDER_STATE_DATA_KEY]);
  const wDry = writes.patchSortOrder;
  const rDry = await reorder.apply(mkReq({ idempotencyKey: 's2b_dry',
    orderPayload: [{ folderId: 'fc', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fa', position: 2 }],
    basisOrderingHash: oh(['fa', 'fb', 'fc']), requestedOrderingHash: oh(['fc', 'fb', 'fa']) }), {});
  assert(rDry && rDry.status === 'dry-run', `S2b dry-run: expected dry-run, got ${rDry && rDry.status}`);
  assert(writes.patchSortOrder === wDry, 'S2b dry-run: 0 canonical writes');
  assert(JSON.stringify(mem[FOLDER_STATE_DATA_KEY]) === mirrorBeforeDry, 'S2b dry-run: render mirror must be UNCHANGED (no mirror write in dry-run)');

  // PROOF B — gated apply: canonical reorder + sortOrder-preserving mirror projection
  const rApply = await reorder.apply(mkReq({ idempotencyKey: 's2b_apply',
    orderPayload: [{ folderId: 'fc', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fa', position: 2 }],
    basisOrderingHash: oh(['fa', 'fb', 'fc']), requestedOrderingHash: oh(['fc', 'fb', 'fa']) }),
    { apply: true, gate: APPLY_GATE });
  assert(rApply && rApply.status === 'applied', `S2b apply: expected applied, got ${rApply && rApply.status}/${rApply && rApply.reason}`);
  assert(rApply && rApply.canonicalWriteCount === 3, 'S2b apply: canonicalWriteCount 3');
  assert(rApply && rApply.idempotencyPersisted === true, 'S2b apply: idempotencyPersisted true');
  assert(rApply && rApply.mirrorReprojection === S2B_MARKER, `S2b apply: mirror marker must be ${S2B_MARKER}, got ${rApply && rApply.mirrorReprojection}`);
  assert(rApply && rApply.mirrorReprojectionResult === 'projected', `S2b apply: projection result must be projected, got ${rApply && rApply.mirrorReprojectionResult}`);
  assert(orderedVisible().join(',') === 'fc,fb,fa', `S2b apply: canonical order must be fc,fb,fa; got ${orderedVisible().join(',')}`);

  const mirror = mem[FOLDER_STATE_DATA_KEY];
  const rows = Array.isArray(mirror.folders) ? mirror.folders : [];
  assert(rows.length === 3, 'S2b apply: mirror bounded to the 3 existing rows (no insert/delete)');
  const byId = {}; rows.forEach((r) => { byId[r.id] = r; });
  // sortOrder PRESERVED (present) and set to canonical values
  assert(byId.fc && Number(byId.fc.sortOrder) === 0 && Number(byId.fc.sort_order) === 0, 'S2b: fc mirror sortOrder projected to 0');
  assert(byId.fb && Number(byId.fb.sortOrder) === 1 && Number(byId.fb.sort_order) === 1, 'S2b: fb mirror sortOrder projected to 1');
  assert(byId.fa && Number(byId.fa.sortOrder) === 2 && Number(byId.fa.sort_order) === 2, 'S2b: fa mirror sortOrder projected to 2');
  rows.forEach((r) => assert(typeof r.sortOrder === 'number', `S2b: mirror row ${r.id} must RETAIN a numeric sortOrder (not stripped)`));
  // mirror folders array reordered to canonical order
  assert(rows.map((r) => r.id).join(',') === 'fc,fb,fa', `S2b: mirror folders array reordered to canonical; got ${rows.map((r) => r.id).join(',')}`);
  // non-sortOrder visual metadata preserved
  assert(byId.fa.name === 'Alpha' && byId.fa.color === '#a11', 'S2b: fa name/color preserved');
  assert(byId.fb.name === 'Bravo' && byId.fb.color === '#b22', 'S2b: fb name/color preserved');
  assert(byId.fc.name === 'Charlie' && byId.fc.color === '#c33', 'S2b: fc name/color preserved');
  // binding items preserved (no binding mutation)
  assert(JSON.stringify(mirror.items) === JSON.stringify(seededItems), 'S2b: binding items map preserved unchanged (no binding mutation)');
  // explicit projection provenance marker written
  assert(mirror.s2bLastSortOrderPreservingProjection && mirror.s2bLastSortOrderPreservingProjection.sortOrderPreserving === true,
    'S2b: mirror carries the explicit sortOrder-preserving projection marker');

  // PROOF C — idempotency: re-apply the CURRENT order (fresh key) → projection no-op, mirror unchanged
  const mirrorAfterApply = JSON.stringify(mem[FOLDER_STATE_DATA_KEY]);
  const rIdem = await reorder.apply(mkReq({ idempotencyKey: 's2b_idem',
    orderPayload: [{ folderId: 'fc', position: 0 }, { folderId: 'fb', position: 1 }, { folderId: 'fa', position: 2 }],
    basisOrderingHash: oh(['fc', 'fb', 'fa']), requestedOrderingHash: oh(['fc', 'fb', 'fa']) }),
    { apply: true, gate: APPLY_GATE });
  assert(rIdem && rIdem.status === 'applied', `S2b idempotency: expected applied, got ${rIdem && rIdem.status}/${rIdem && rIdem.reason}`);
  assert(rIdem && rIdem.mirrorReprojectionResult === 'no-op-mirror-already-preserves-sortorder',
    `S2b idempotency: expected no-op projection result, got ${rIdem && rIdem.mirrorReprojectionResult}`);
  assert(JSON.stringify(mem[FOLDER_STATE_DATA_KEY]) === mirrorAfterApply, 'S2b idempotency: render mirror byte-for-byte unchanged on re-apply of converged order');

  // safety invariants
  assert(writes.otherStoreWrite === 0, 'S2b: only sort_order canonical writes occurred (no other store writes)');
  assert(folderRowCount() === 4, 'S2b: canonical folder row count unchanged (no insert/delete/purge)');
  assert(tombIds() === 'ft', 'S2b: tombstone set unchanged');

  return {
    blocked: false, sqliteMode: 'node:sqlite',
    dryRunMirrorUnchanged: JSON.stringify(mem) !== null,
    appliedMarker: rApply.mirrorReprojection,
    appliedProjectionResult: rApply.mirrorReprojectionResult,
    mirrorOrderAfterApply: rows.map((r) => r.id).join(','),
    mirrorSortOrderAfterApply: rows.map((r) => Number(r.sortOrder)).join(','),
    idempotentProjectionResult: rIdem.mirrorReprojectionResult,
    canonicalOrder: orderedVisible().join(','),
    otherStoreWrites: writes.otherStoreWrite,
  };
}

// ---- evidence doc ----
assert(exists(doc), `${doc}: missing`);
if (exists(doc)) {
  const text = read(doc);
  assert(text.length > 3000, `${doc}: too short`);
  const flat = text.replace(/\s+/g, ' ');
  assert(flat.includes(PREFLIGHT_COMMIT), `doc must reference S2b preflight commit ${PREFLIGHT_COMMIT}`);
  assert(flat.includes(S4_COMMIT), `doc must reference S4 commit ${S4_COMMIT}`);
  assert(flat.includes(POST_S4_COMMIT), `doc must reference post-S4 commit ${POST_S4_COMMIT}`);
  assert(/S2B IMPLEMENTATION PASSED/i.test(flat), 'doc must carry the S2b implementation pass verdict');
  assert(/applied-sortorder-preserving-s2b/.test(flat), 'doc must record the applied S2b mirror marker');
  assert(/preserv(e|ing) (each folder.s )?`?sortOrder`?/i.test(flat), 'doc must state sortOrder is preserved');
  assert(/after[^.]*canonical[^.]*write[^.]*(post-apply|hash)/i.test(flat), 'doc must state projection runs after canonical write + hash verification');
  assert(/idempotent/i.test(flat) && /bounded/i.test(flat), 'doc must state idempotent + bounded');
  assert(/dry-run[^.]*(no mirror|writes no mirror|UNCHANGED)/i.test(flat), 'doc must state dry-run writes no mirror');
  assert(/does not reuse the F11|NOT reuse the F11|not the F11 render-mirror rebuild helper/i.test(flat), 'doc must state it does not reuse the F11 rebuild helper');
  assert(/full S2 (remains|is) (pending|not yet|open)|PENDING LIVE S2b/i.test(flat), 'doc must NOT overclaim full S2 closure');
  assert(/`?productSyncReady`? remains `?false`?/i.test(flat), 'doc must keep productSyncReady false');
  assert(/S5 ?\/? ?F11 allowed-set flip remains BLOCKED/i.test(flat), 'doc must keep S5/F11 blocked');
  assert(/Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i.test(flat), 'doc must keep Chat Saving CAS blocked');
  assert(exists(preflightDoc), 'S2b preflight doc must exist on disk');
}

// ---- source anchors ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  // projection implemented, OUTSIDE the F32 handler region
  assert(src.includes('function s2bProjectSortOrderPreservingRenderMirror('), 'S2b projection function must exist');
  assert(src.includes("appliedReceipt.mirrorReprojection = '" + S2B_MARKER + "'"), 'applied path must set the S2b mirror marker');
  const b0 = src.indexOf('===================== F32 (folder-sync S2): sortOrder reorder Desktop handler');
  const b1 = src.indexOf('===================== end F32 S2 sortOrder reorder handler');
  const region = (b0 !== -1 && b1 !== -1) ? src.slice(b0, b1) : '';
  assert(region.length > 0 && src.indexOf('function s2bProjectSortOrderPreservingRenderMirror(') > b1,
    'S2b projection function must live OUTSIDE the F32 handler region (defined after the end marker)');
  for (const banned of ['FOLDER_STATE_DATA_KEY', 'chromeStorageSet']) {
    assert(!region.includes(banned), `F32 handler region must remain free of ${banned} (projection is out-of-region)`);
  }
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'receipt builder default must remain deferred-to-s2b (dry-run/conflict paths)');
  assert(!src.includes('rebuildRenderMirrorFromSqlite'), 'folder-sync must NOT reference/reuse the F11 rebuild helper');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema must remain unminted');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'fullBundle must remain v2');
  assert(!src.includes('fullBundle.v3'), 'no fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred');
  assert(!src.includes('productSyncReady: true') && !src.includes('productSyncReady = true'), 'productSyncReady must not be flipped');
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'F11 gate constant must remain');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 must STILL block field-mismatch:sortOrder + binding-mismatch (no allowed-set change)');
  assert(store.includes('delete next.sortOrder;') && store.includes('delete next.sort_order;'),
    'F11 rebuild helper must STILL strip sortOrder/sort_order (proving why S2b uses a new projection)');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-import.mv3.js');
assert(exists(ledgerFile), 'consumed-operation-ledger.tauri.js must exist');

// ---- run the behavioral proof ----
let proof = null;
try { proof = await runS2bProof(); }
catch (e) { failures.push('S2b behavioral proof threw: ' + (e && e.message ? e.message : String(e))); }
if (proof && proof.blocked) failures.push('S2b behavioral proof BLOCKED (not faked): ' + proof.blocker);

if (failures.length) {
  console.error('FAIL validate-folder-sync-s2b-sortorder-preserving-mirror-reprojection-implementation');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.s2b-sortorder-preserving-mirror-reprojection-implementation.v1',
  lane: 'folder-sync',
  phase: 'S2b-implementation',
  doc,
  verdict: 'S2B-IMPLEMENTATION-PASSED-BEHAVIORAL',
  preflightCommitReferenced: PREFLIGHT_COMMIT,
  s4CommitReferenced: S4_COMMIT,
  postS4CommitReferenced: POST_S4_COMMIT,
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  appliedMarker: proof ? proof.appliedMarker : null,
  appliedProjectionResult: proof ? proof.appliedProjectionResult : null,
  mirrorOrderAfterApply: proof ? proof.mirrorOrderAfterApply : null,
  mirrorSortOrderAfterApply: proof ? proof.mirrorSortOrderAfterApply : null,
  idempotentProjectionResult: proof ? proof.idempotentProjectionResult : null,
  canonicalOrder: proof ? proof.canonicalOrder : null,
  otherStoreWrites: proof ? proof.otherStoreWrites : null,
  reusedF11RebuildHelper: false,
  sortOrderPreserved: true,
  mirrorNeverLeadsCanonical: true,
  dryRunWritesMirror: false,
  s5F11FlipBlocked: true,
  productSyncReady: false,
  bindingReceiptSchemaMinted: false,
  chatSavingCasBlocked: true,
  fullS2Closed: false,
  recommendedNext: 'live Desktop S2b readback confirmation (separately approved) before declaring S2 closed; NOT S5/productSyncReady/WebDAV',
}, null, 2));
console.log('PASS validate-folder-sync-s2b-sortorder-preserving-mirror-reprojection-implementation');
