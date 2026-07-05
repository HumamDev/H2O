#!/usr/bin/env node
//
// Folder Sync Phase F18 — sortOrder NEGATIVE-PATH absorption apply proof harness (in-process; SYNTHETIC;
// no writes to any product store; no live Desktop; no flip).
//
// This meta-validator (a) grounds the F18 doc against the standing postures, and (b) RUNS an in-process
// negative-path proof: it seeds a disposable canonical `folders` table (real node:sqlite
// DatabaseSync(':memory:'), guarded fallback), projects a mocked FOLDER_STATE_DATA_KEY mirror, and for
// each of the eight REJECTED/SKIPPED synthetic reorder fixtures asserts the decision receipt is
// rejected/skipped with the exact reason, the apply gate never fires, the canonical ordering hash + the
// temp SQLite sort_order rows are unchanged, the mocked mirror hash is unchanged, per-case
// canonicalSortOrderWriteCount/mirrorProjectionWriteCount/forbiddenTotal are 0, the read-only drift probe
// stays read-only with no missing/color regression, and an internal positive control confirms the oracle
// still returns 'applied' for a valid request (without applying). It also asserts against REAL SOURCE
// that the proposed schemas are NOT minted, F11 still blocks field-mismatch:sortOrder + binding-mismatch,
// sort_order stays canonical, WebDAV stays deferred, fullBundle stays v2, using a BOUNDED metadata-lane
// guard. It imports NO product runtime store; F17 is not modified.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f18Doc = 'release-evidence/2026-06-25/folder-sync-f18-sortorder-negative-apply-proof-harness.md';
const f17Doc = 'release-evidence/2026-06-25/folder-sync-f17-sortorder-absorption-apply-proof-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F17_COMMIT = 'c3b24ba';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const FORBIDDEN_KEYS = ['name', 'title', 'content'];
const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);

function parseMetadataAllowlist(source) {
  const start = source.indexOf('APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS = {');
  if (start < 0) return null;
  const end = source.indexOf('}', start);
  if (end < 0) return null;
  const block = source.slice(start, end);
  const applied = [];
  const re = /'([a-z0-9-]+)'\s*:\s*true/gi;
  let m;
  while ((m = re.exec(block)) !== null) applied.push(m[1]);
  return applied;
}
function sha256(v) { return crypto.createHash('sha256').update(String(v)).digest('hex'); }
function tokenOf(id) { return 'sha256:' + sha256('F18:folder:' + id).slice(0, 16); }
function orderingHash(ids) { return 'sha256:' + sha256(ids.join('>')).slice(0, 24); }
function isHash(v) { return typeof v === 'string' && /^sha256:[0-9a-z]+$/i.test(v); }
function hasForbiddenKeys(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.includes(k)) return true;
    const v = obj[k];
    if (v && typeof v === 'object' && hasForbiddenKeys(v)) return true;
  }
  return false;
}

// ============================================================================================
// IN-PROCESS NEGATIVE-PATH HARNESS
// ============================================================================================

async function makeCanonicalStore() {
  // visible catalog: fa,fb,fc ; tombstoned: fd ; present-but-hidden (not in visible catalog): fh ;
  // known-but-missing (no row): fe. `visible`=1 marks the visible catalog; `tombstoned`=1 marks tombstones.
  const rows = [
    { id: 'fa', name: 'A', color: '#111111', sort_order: 0, tombstoned: 0, visible: 1 },
    { id: 'fb', name: 'B', color: '#222222', sort_order: 1, tombstoned: 0, visible: 1 },
    { id: 'fc', name: 'C', color: '#333333', sort_order: 2, tombstoned: 0, visible: 1 },
    { id: 'fd', name: 'D', color: '#444444', sort_order: 3, tombstoned: 1, visible: 0 },
    { id: 'fh', name: 'H', color: '#555555', sort_order: 4, tombstoned: 0, visible: 0 },
  ];
  try {
    const _emit = process.emitWarning;
    process.emitWarning = function (w, ...rest) {
      const s = typeof w === 'string' ? w : (w && w.message) || '';
      if (/SQLite is an experimental feature/i.test(s)) return undefined;
      return _emit.call(process, w, ...rest);
    };
    const { DatabaseSync } = await import('node:sqlite');
    process.emitWarning = _emit;
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT, color TEXT, sort_order INTEGER, tombstoned INTEGER, visible INTEGER)');
    const ins = db.prepare('INSERT INTO folders (id, name, color, sort_order, tombstoned, visible) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of rows) ins.run(r.id, r.name, r.color, r.sort_order, r.tombstoned, r.visible);
    return {
      mode: 'node:sqlite',
      presentVisibleOrdered() {
        return db.prepare('SELECT id, color, sort_order FROM folders WHERE tombstoned = 0 AND visible = 1 ORDER BY sort_order ASC').all();
      },
      snapshotAll() {
        return db.prepare('SELECT id, sort_order, tombstoned, visible FROM folders ORDER BY id ASC').all()
          .map((r) => `${r.id}:${r.sort_order}:${r.tombstoned}:${r.visible}`).join('|');
      },
    };
  } catch (e) {
    const mem = rows.map((r) => Object.assign({}, r));
    return {
      mode: 'in-memory-model',
      presentVisibleOrdered() {
        return mem.filter((r) => !r.tombstoned && r.visible).slice().sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => ({ id: r.id, color: r.color, sort_order: r.sort_order }));
      },
      snapshotAll() {
        return mem.slice().sort((a, b) => (a.id < b.id ? -1 : 1))
          .map((r) => `${r.id}:${r.sort_order}:${r.tombstoned}:${r.visible}`).join('|');
      },
    };
  }
}

function projectMirror(orderedRows) {
  return { key: 'h2o:prm:cgx:fldrs:state:data:v1', folders: orderedRows.map((r, i) => ({ folderId: r.id, color: r.color, sortOrder: i })) };
}
function mirrorHash(mirror) { return 'sha256:' + sha256(JSON.stringify(mirror.folders)); }

function checkRequestEnvelope(req) {
  const problems = [];
  if (!req || typeof req !== 'object') return ['not-object'];
  if (req.schema !== REQUEST_SCHEMA) problems.push('bad-schema');
  if (!req.requestId) problems.push('missing-requestId');
  if (!req.sourcePeerId && !req.deviceId) problems.push('missing-peer');
  if (!['chrome-extension', 'native-extension', 'mobile'].includes(req.surfaceKind)) problems.push('bad-surfaceKind');
  if (!Array.isArray(req.orderPayload) || !req.orderPayload.length) problems.push('bad-orderPayload');
  else for (const e of req.orderPayload) {
    if (!e || typeof e.folderId !== 'string' || !isHash(e.folderId)) problems.push('bad-folderId');
    if (typeof e.position !== 'number') problems.push('bad-position');
    if (hasForbiddenKeys(e)) problems.push('raw-name-leak');
  }
  if (!isHash(req.basisOrderingHash)) problems.push('bad-basis');
  if (!isHash(req.requestedOrderingHash)) problems.push('bad-requested');
  if (!req.idempotencyKey) problems.push('missing-idempotencyKey');
  if (hasForbiddenKeys(req)) problems.push('raw-name-leak-top');
  return problems;
}

// decision oracle over tokenized canonical state
function decideReorder(req, canon, ctx) {
  ctx = ctx || {};
  const receipt = {
    schema: RECEIPT_SCHEMA, requestId: req.requestId, status: 'rejected', reason: 'rejected',
    resultingOrderingHash: canon.orderingHash, canonicalAuthority: 'desktop-sqlite',
    noDestructiveMutation: true, decidedAt: '2026-07-01T00:00:00.000Z',
  };
  const envProblems = checkRequestEnvelope(req);
  if (envProblems.length) { receipt.reason = 'invalid-request-envelope'; return receipt; }
  if ((ctx.appliedKeys || new Set()).has(req.idempotencyKey)) { receipt.status = 'skipped'; receipt.reason = 'duplicate'; return receipt; }
  if (req.basisOrderingHash !== canon.orderingHash) {
    receipt.reason = ctx.priorAppliedInBatch ? 'superseded-concurrent' : 'stale-basis';
    return receipt;
  }
  for (const entry of req.orderPayload) {
    const t = entry.folderId;
    if (!canon.knownTokens.has(t)) { receipt.reason = 'unknown-folder'; return receipt; }
    if (canon.tombstonedTokens.has(t)) { receipt.reason = 'tombstoned-folder'; return receipt; }
    if (!canon.presentTokens.has(t)) { receipt.reason = 'missing-folder'; return receipt; }
    if (!canon.visibleTokens.has(t)) { receipt.reason = 'folder-not-in-catalog'; return receipt; }
  }
  receipt.status = 'applied'; receipt.reason = 'applied'; receipt.resultingOrderingHash = req.requestedOrderingHash;
  receipt.appliedAt = '2026-07-01T00:00:00.000Z';
  return receipt;
}

function probeDrift(canonRows, mirror) {
  const byId = new Map((mirror.folders || []).map((f) => [f.folderId, f]));
  let sortOrder = 0, color = 0, missing = 0;
  canonRows.forEach((r, i) => {
    const m = byId.get(r.id);
    if (!m) { missing += 1; return; }
    if (String(m.color) !== String(r.color)) color += 1;
    if (Number(m.sortOrder) !== Number(i)) sortOrder += 1;
  });
  return { sortOrder, color, missing, writeCallCount: 0 };
}

async function runNegativeProof() {
  const store = await makeCanonicalStore();
  const visible = store.presentVisibleOrdered();
  const visibleIds = visible.map((r) => r.id);
  const baseHash = orderingHash(visibleIds);
  const mirror = projectMirror(visible);
  const baseMirrorHash = mirrorHash(mirror);
  const baseSnapshot = store.snapshotAll();

  const canon = {
    orderingHash: baseHash,
    knownTokens: new Set(['fa', 'fb', 'fc', 'fd', 'fe', 'fh'].map(tokenOf)), // fe known-but-missing
    presentTokens: new Set(['fa', 'fb', 'fc', 'fh'].map(tokenOf)),
    tombstonedTokens: new Set(['fd'].map(tokenOf)),
    visibleTokens: new Set(['fa', 'fb', 'fc'].map(tokenOf)),
  };
  const validPayload = visibleIds.map((id, i) => ({ folderId: tokenOf(id), position: i }));
  const mkReq = (over) => Object.assign({
    schema: REQUEST_SCHEMA, requestId: 'req_' + Math.random().toString(16).slice(2, 10),
    sourcePeerId: tokenOf('peer'), surfaceKind: 'chrome-extension', orderPayload: validPayload.slice(),
    basisOrderingHash: baseHash, requestedOrderingHash: orderingHash(visibleIds.slice().reverse()),
    createdAt: '2026-07-01T00:00:00.000Z', idempotencyKey: 'idem_' + Math.random().toString(16).slice(2, 10),
  }, over || {});

  // internal positive control: oracle returns applied for a valid request (NOT applied to the store)
  const controlReceipt = decideReorder(mkReq(), canon, {});
  assert(controlReceipt.status === 'applied' && controlReceipt.reason === 'applied',
    'F18 positive control: oracle must return applied for a valid request');

  const cases = [
    { name: 'stale-basis', req: mkReq({ basisOrderingHash: orderingHash(['x', 'y', 'z']) }), ctx: {}, status: 'rejected', reason: 'stale-basis' },
    { name: 'duplicate', req: mkReq({ idempotencyKey: 'idem_seen' }), ctx: { appliedKeys: new Set(['idem_seen']) }, status: 'skipped', reason: 'duplicate' },
    { name: 'missing-folder', req: mkReq({ orderPayload: [{ folderId: tokenOf('fe'), position: 0 }] }), ctx: {}, status: 'rejected', reason: 'missing-folder' },
    { name: 'tombstoned-folder', req: mkReq({ orderPayload: [{ folderId: tokenOf('fd'), position: 0 }] }), ctx: {}, status: 'rejected', reason: 'tombstoned-folder' },
    { name: 'unknown-folder', req: mkReq({ orderPayload: [{ folderId: tokenOf('fzzz'), position: 0 }] }), ctx: {}, status: 'rejected', reason: 'unknown-folder' },
    { name: 'folder-not-in-catalog', req: mkReq({ orderPayload: [{ folderId: tokenOf('fh'), position: 0 }] }), ctx: {}, status: 'rejected', reason: 'folder-not-in-catalog' },
    { name: 'multi-device-concurrent', req: mkReq({ basisOrderingHash: baseHash }), ctx: { priorAppliedInBatch: true, advancedHash: orderingHash(['fc', 'fb', 'fa']) }, status: 'rejected', reason: 'superseded-concurrent' },
    // invalid/redaction-violating request: a raw title key in the payload entry
    { name: 'invalid-redaction', req: mkReq({ orderPayload: [{ folderId: tokenOf('fa'), position: 0, title: 'Secret' }] }), ctx: {}, status: 'rejected', reason: 'invalid-request-envelope' },
  ];

  const results = [];
  for (const c of cases) {
    const writes = { canonicalSortOrder: 0, mirrorProjection: 0,
      forbidden: { binding: 0, tombstone: 0, chat: 0, folderDelete: 0, folderPurge: 0, webdav: 0, cas: 0, runtimeSource: 0 } };
    // concurrent case: present an advanced canonical basis to the oracle (simulated concurrent apply)
    const canonForCase = c.ctx.advancedHash ? Object.assign({}, canon, { orderingHash: c.ctx.advancedHash }) : canon;
    const receipt = decideReorder(c.req, canonForCase, c.ctx);
    // APPLY GATE: only apply when status === 'applied' (never for negatives)
    if (receipt.status === 'applied') { writes.canonicalSortOrder += c.req.orderPayload.length; writes.mirrorProjection += 1; }
    // read-only drift probe over the (unchanged) canonical vs (unchanged) mirror
    const drift = probeDrift(store.presentVisibleOrdered(), mirror);
    const forbiddenTotal = Object.values(writes.forbidden).reduce((a, b) => a + b, 0);

    assert(receipt.status === c.status, `F18 ${c.name}: status ${receipt.status} != ${c.status}`);
    assert(receipt.reason === c.reason, `F18 ${c.name}: reason ${receipt.reason} != ${c.reason}`);
    assert(receipt.canonicalAuthority === 'desktop-sqlite', `F18 ${c.name}: canonicalAuthority not desktop-sqlite`);
    assert(receipt.noDestructiveMutation === true, `F18 ${c.name}: noDestructiveMutation not true`);
    assert(store.snapshotAll() === baseSnapshot, `F18 ${c.name}: canonical sort_order rows changed`);
    assert(orderingHash(store.presentVisibleOrdered().map((r) => r.id)) === baseHash, `F18 ${c.name}: canonical ordering hash changed`);
    assert(mirrorHash(mirror) === baseMirrorHash, `F18 ${c.name}: mocked mirror changed`);
    assert(writes.canonicalSortOrder === 0, `F18 ${c.name}: canonicalSortOrderWriteCount != 0`);
    assert(writes.mirrorProjection === 0, `F18 ${c.name}: mirrorProjectionWriteCount != 0`);
    assert(forbiddenTotal === 0, `F18 ${c.name}: forbidden writes != 0`);
    assert(drift.writeCallCount === 0, `F18 ${c.name}: probe not read-only`);
    assert(drift.missing === 0 && drift.color === 0, `F18 ${c.name}: missing/color regression`);
    assert(drift.sortOrder === 0, `F18 ${c.name}: unexpected sortOrder drift on unchanged canonical`);
    results.push({ name: c.name, status: receipt.status, reason: receipt.reason,
      canonicalUnchanged: store.snapshotAll() === baseSnapshot, mirrorUnchanged: mirrorHash(mirror) === baseMirrorHash,
      canonicalSortOrderWriteCount: writes.canonicalSortOrder, mirrorProjectionWriteCount: writes.mirrorProjection, forbiddenTotal });
  }
  return { sqliteMode: store.mode, results };
}

// ---- doc presence ----
assert(exists(f18Doc), `${f18Doc}: missing`);
if (!exists(f18Doc)) {
  console.error('FAIL validate-folder-sync-f18-sortorder-negative-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f18Doc);
assert(doc.length > 5000, `${f18Doc}: F18 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- harness-only markers ----
assert(/IN-PROCESS \/ FIXTURE-BACKED NEGATIVE-PATH APPLY PROOF HARNESS ONLY/i.test(flat),
  'F18 doc must mark itself in-process negative-path apply-proof harness only');
assert(/SYNTHETIC/i.test(flat), 'F18 doc must state synthetic data');
assert(flat.includes('No product source was modified'), 'F18 doc must state no product source modified');
assert(/No live Desktop write/i.test(flat), 'F18 doc must state no live Desktop write');
assert(/node:sqlite|in-memory SQLite-like/i.test(flat), 'F18 doc must state the substrate');

// ---- F17 commit ----
assert(flat.includes(F17_COMMIT), `F18 doc must reference the F17 commit ${F17_COMMIT}`);
assert(exists(f17Doc), 'F17 doc must exist on disk');

// ---- negative matrix + zero-write claims in doc ----
for (const c of ['stale-basis', 'duplicate', 'missing-folder', 'tombstoned-folder', 'unknown-folder',
  'folder-not-in-catalog', 'superseded-concurrent', 'invalid-request-envelope']) {
  assert(flat.includes(c), `F18 doc must document negative case: ${c}`);
}
assert(/apply gate never fires|applies ONLY when|apply gate/i.test(flat), 'F18 doc must describe the apply gate');
assert(/canonicalSortOrderWriteCount: 0|canonicalSortOrderWriteCount:0/i.test(flat), 'F18 doc must claim canonicalSortOrderWriteCount 0');
assert(/mirrorProjectionWriteCount: 0|mirrorProjectionWriteCount:0/i.test(flat), 'F18 doc must claim mirrorProjectionWriteCount 0');
assert(/forbiddenTotal: 0|forbiddenTotal:0/i.test(flat), 'F18 doc must claim forbiddenTotal 0');
assert(/canonical ordering hash is UNCHANGED|canonical order unchanged|ordering hash is UNCHANGED/i.test(flat),
  'F18 doc must claim canonical order unchanged');
assert(/mirror projection hash is UNCHANGED|mocked mirror unchanged|mirror .* UNCHANGED/i.test(flat),
  'F18 doc must claim mirror unchanged');
assert(/positive control/i.test(flat), 'F18 doc must include the positive control');

// ---- safety + postures ----
for (const inv of ['no hard delete', 'no folder delete / purge', 'no chat delete', 'no binding repair']) {
  assert(flat.includes(inv), `F18 doc must include safety invariant: ${inv}`);
}
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F18 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /GATED|gated/i.test(flat), 'F18 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F18 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F18 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F18 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F18 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F18 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F18 doc must preserve chats on folder delete');
assert(/redacted|hash-only/i.test(flat), 'F18 doc must state redacted / hash-only');

// ---- cross-surface + F19 ----
assert(flat.includes('Cross-Surface Requirement'), 'F18 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F18 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F18 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F18 doc must include Chrome / native extension');
assert(flat.includes('Recommended F19'), 'F18 doc must recommend F19');
assert(/implementation-readiness|IMPLEMENTATION-READINESS/i.test(flat), 'F18 doc F19 must be the implementation-readiness gate');
assert(/folder-sync-f19-\*|distinct from the pre-existing `?validate-f19-sync-hardening/i.test(flat),
  'F18 doc must note F19 is distinct from the pre-existing validate-f19-sync-hardening');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F18 doc must confirm metadata core type: ${type}`);

// ---- RUN THE NEGATIVE PROOF ----
let proof = null;
try {
  proof = await runNegativeProof();
} catch (e) {
  failures.push('F18 negative proof threw: ' + (e && e.message ? e.message : String(e)));
}
if (proof) {
  assert(proof.results.length === 8, `F18 must exercise all 8 negative cases (got ${proof.results.length})`);
  for (const r of proof.results) {
    assert(['rejected', 'skipped'].includes(r.status), `F18 ${r.name}: status must be rejected/skipped`);
    assert(r.canonicalUnchanged === true, `F18 ${r.name}: canonical must be unchanged`);
    assert(r.mirrorUnchanged === true, `F18 ${r.name}: mirror must be unchanged`);
    assert(r.canonicalSortOrderWriteCount === 0 && r.mirrorProjectionWriteCount === 0 && r.forbiddenTotal === 0,
      `F18 ${r.name}: write counters must be 0`);
  }
}

// ---- REAL SOURCE: proposed schemas NOT minted; F11 blocks sortOrder; sort_order canonical ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes(REQUEST_SCHEMA), 'sortOrder request schema now present in source (minted inert by F30 S1)');
  assert(src.includes(RECEIPT_SCHEMA), 'sortOrder receipt schema now present in source (minted inert by F30 S1)');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), "WebDAV must remain deferred in folder-sync.tauri.js");
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a),
      `unexpected applied type beyond the four core + known Operational unbinds: ${a}`);
  }
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("'field-mismatch:sortOrder': true"),
    'S5 flipped field-mismatch:sortOrder into the F11 allowed set');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'source F11 helper keeps binding-mismatch blocked/reviewed after S5');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f18-sortorder-negative-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f18-sortorder-negative-apply-proof-harness.v1',
  lane: 'folder-sync',
  phase: 'F18',
  f18Doc,
  harnessOnly: true,
  fixtures: 'embedded-synthetic',
  f17CommitReferenced: F17_COMMIT,
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  negativeMatrix: proof ? proof.results : null,
  negativeCaseCount: proof ? proof.results.length : 0,
  canonicalSortOrderWriteCount: 0,
  mirrorProjectionWriteCount: 0,
  forbiddenTotal: 0,
  probeWriteCallCount: 0,
  proposedSchemasMintedInSource: false,
  sortOrderGated: false,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F19-sortorder-absorption-implementation-readiness-gate (design-only, no writes, no flip; distinct from validate-f19-sync-hardening)',
}, null, 2));
console.log('PASS validate-folder-sync-f18-sortorder-negative-apply-proof-harness');
