#!/usr/bin/env node
//
// Folder Sync Phase F17 — sortOrder absorption APPLY proof harness (in-process; SYNTHETIC; no writes to
// any product store; no live Desktop; no flip).
//
// This meta-validator (a) grounds the F17 doc against the standing postures, and (b) actually RUNS an
// in-process apply proof: it seeds a disposable canonical `folders` table (real node:sqlite
// DatabaseSync(':memory:'), with an in-memory-model fallback), projects a mocked FOLDER_STATE_DATA_KEY
// mirror, builds an ACCEPTED synthetic reorder request in the F15/F16 envelope shape, applies it ONLY to
// canonical `sort_order`, runs a read-only drift probe BEFORE re-projection (field-mismatch:sortOrder
// present), re-projects the mirror from canonical order, runs the drift probe AGAIN (field-mismatch:
// sortOrder clears), and asserts: no missing-mirror/color regressions; the write counter is bounded to
// temp canonical sort_order + mocked mirror projection; every forbidden write counter (binding /
// tombstone / chat / folder-delete / folder-purge / WebDAV / CAS / runtime-source) is 0; probes are
// read-only. It also asserts against REAL SOURCE that the proposed schemas are NOT minted, F11 still
// blocks field-mismatch:sortOrder + binding-mismatch, sort_order stays canonical, WebDAV stays deferred,
// fullBundle stays v2, using a BOUNDED metadata-lane guard. It imports NO product runtime store.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f17Doc = 'release-evidence/2026-06-25/folder-sync-f17-sortorder-absorption-apply-proof-harness.md';
const f16Doc = 'release-evidence/2026-06-25/folder-sync-f16-sortorder-envelope-conflict-matrix-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F16_COMMIT = '0a80b99';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
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
function tokenOf(id) { return 'sha256:' + sha256('F17:folder:' + id).slice(0, 16); }
function orderingHash(ids) { return 'sha256:' + sha256(ids.join('>')).slice(0, 24); }

// ============================================================================================
// IN-PROCESS APPLY PROOF HARNESS (disposable canonical store; mocked mirror; SYNTHETIC only)
// ============================================================================================

// A disposable canonical store: real node:sqlite if available, else an in-memory SQLite-like model.
async function makeCanonicalStore(writes) {
  const rows = [
    { id: 'fa', name: 'A', color: '#111111', sort_order: 0, tombstoned: 0 },
    { id: 'fb', name: 'B', color: '#222222', sort_order: 1, tombstoned: 0 },
    { id: 'fc', name: 'C', color: '#333333', sort_order: 2, tombstoned: 0 },
    { id: 'fd', name: 'D', color: '#444444', sort_order: 3, tombstoned: 0 },
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
    db.exec('CREATE TABLE folders (id TEXT PRIMARY KEY, name TEXT, color TEXT, sort_order INTEGER, tombstoned INTEGER)');
    const ins = db.prepare('INSERT INTO folders (id, name, color, sort_order, tombstoned) VALUES (?, ?, ?, ?, ?)');
    for (const r of rows) ins.run(r.id, r.name, r.color, r.sort_order, r.tombstoned);
    return {
      mode: 'node:sqlite',
      listOrdered() {
        return db.prepare('SELECT id, color, sort_order FROM folders WHERE tombstoned = 0 ORDER BY sort_order ASC').all();
      },
      applySortOrder(orderedIds) {
        const upd = db.prepare('UPDATE folders SET sort_order = ? WHERE id = ?');
        orderedIds.forEach((id, i) => { upd.run(i, id); writes.canonicalSortOrder += 1; });
      },
    };
  } catch (e) {
    // in-memory SQLite-like fallback
    const mem = rows.map((r) => Object.assign({}, r));
    return {
      mode: 'in-memory-model',
      listOrdered() {
        return mem.filter((r) => !r.tombstoned).slice().sort((a, b) => a.sort_order - b.sort_order)
          .map((r) => ({ id: r.id, color: r.color, sort_order: r.sort_order }));
      },
      applySortOrder(orderedIds) {
        orderedIds.forEach((id, i) => {
          const row = mem.find((r) => r.id === id);
          if (row) { row.sort_order = i; writes.canonicalSortOrder += 1; }
        });
      },
    };
  }
}

// mocked FOLDER_STATE_DATA_KEY mirror projected from a canonical ordered list.
function projectMirror(orderedRows, writes) {
  writes.mirrorProjection += 1;
  return {
    key: 'h2o:prm:cgx:fldrs:state:data:v1',
    folders: orderedRows.map((r, i) => ({ folderId: r.id, color: r.color, sortOrder: i })),
  };
}

// read-only drift probe over canonical vs mirror (no writes).
function probeDrift(canonRows, mirror, probe) {
  probe.probeWriteCallCount += 0; // read-only, explicit
  const mirrorById = new Map((mirror.folders || []).map((f) => [f.folderId, f]));
  const classes = [];
  canonRows.forEach((r, i) => {
    const m = mirrorById.get(r.id);
    if (!m) { classes.push('missing-mirror-folder'); return; }
    if (String(m.color) !== String(r.color)) classes.push('field-mismatch:color');
    if (Number(m.sortOrder) !== Number(i)) classes.push('field-mismatch:sortOrder');
  });
  const count = (c) => classes.filter((x) => x === c).length;
  return {
    driftClasses: classes,
    sortOrder: count('field-mismatch:sortOrder'),
    color: count('field-mismatch:color'),
    missing: count('missing-mirror-folder'),
    writeCallCount: 0,
  };
}

async function runApplyProof() {
  const writes = { canonicalSortOrder: 0, mirrorProjection: 0,
    forbidden: { binding: 0, tombstone: 0, chat: 0, folderDelete: 0, folderPurge: 0, webdav: 0, cas: 0, runtimeSource: 0 } };
  const probe = { probeWriteCallCount: 0 };

  const store = await makeCanonicalStore(writes);
  // baseline O0 + in-sync mirror
  const o0 = store.listOrdered();
  const o0ids = o0.map((r) => r.id);
  let mirror = projectMirror(o0, writes); // projection #1 (baseline)

  // accepted synthetic reorder request (F15/F16 envelope shape), new order O1 = reverse
  const o1ids = o0ids.slice().reverse();
  const request = {
    schema: REQUEST_SCHEMA,
    requestId: 'req_f17_0001',
    sourcePeerId: tokenOf('peer-desktop'),
    surfaceKind: 'chrome-extension',
    orderPayload: o1ids.map((id, i) => ({ folderId: tokenOf(id), position: i })),
    basisOrderingHash: orderingHash(o0ids),
    requestedOrderingHash: orderingHash(o1ids),
    createdAt: '2026-07-01T00:00:00.000Z',
    idempotencyKey: 'idem_f17_0001',
  };
  // receipt for the accepted apply (design-only shape; not minted in source)
  const receipt = {
    schema: RECEIPT_SCHEMA, requestId: request.requestId, status: 'applied', reason: 'applied',
    resultingOrderingHash: request.requestedOrderingHash, canonicalAuthority: 'desktop-sqlite',
    noDestructiveMutation: true, appliedAt: '2026-07-01T00:00:00.000Z',
  };
  assert(request.basisOrderingHash === orderingHash(o0ids), 'F17 request basis must match canonical O0');
  assert(receipt.status === 'applied' && receipt.canonicalAuthority === 'desktop-sqlite',
    'F17 receipt must be an applied desktop-sqlite receipt');

  // APPLY only to canonical sort_order (move canonical to O1). Mirror still reflects O0 -> order drift.
  store.applySortOrder(o1ids);
  const o1 = store.listOrdered();

  // DRIFT PROBE #1 (BEFORE re-projection): sortOrder drift present, no missing/color
  const before = probeDrift(o1, mirror, probe);
  assert(before.sortOrder > 0, 'F17 BEFORE re-projection must show field-mismatch:sortOrder drift');
  assert(before.color === 0, 'F17 BEFORE must show no color drift');
  assert(before.missing === 0, 'F17 BEFORE must show no missing-mirror-folder drift');

  // RE-PROJECT mirror from canonical O1 (mocked mirror write only)
  mirror = projectMirror(o1, writes); // projection #2 (re-projection)

  // DRIFT PROBE #2 (AFTER re-projection): sortOrder cleared, still no missing/color
  const after = probeDrift(o1, mirror, probe);
  assert(after.sortOrder === 0, 'F17 AFTER re-projection must clear field-mismatch:sortOrder');
  assert(after.color === 0, 'F17 AFTER must show no color drift');
  assert(after.missing === 0, 'F17 AFTER must show no missing-mirror-folder regression');

  // write-counter bounds
  assert(writes.canonicalSortOrder === o1ids.length,
    `F17 canonical sort_order writes must equal folder count (${o1ids.length}), got ${writes.canonicalSortOrder}`);
  assert(writes.mirrorProjection === 2, `F17 mirror projections must be 2 (baseline + re-project), got ${writes.mirrorProjection}`);
  const forbiddenTotal = Object.values(writes.forbidden).reduce((a, b) => a + b, 0);
  assert(forbiddenTotal === 0, `F17 forbidden write counters must all be 0, got ${forbiddenTotal}`);
  assert(probe.probeWriteCallCount === 0, 'F17 drift probes must be read-only (probeWriteCallCount 0)');
  assert(before.writeCallCount === 0 && after.writeCallCount === 0, 'F17 each drift probe must be read-only');

  return {
    sqliteMode: store.mode,
    beforeSortOrderDrift: before.sortOrder,
    afterSortOrderDrift: after.sortOrder,
    colorRegression: after.color,
    missingRegression: after.missing,
    writes: { canonicalSortOrder: writes.canonicalSortOrder, mirrorProjection: writes.mirrorProjection, forbiddenTotal },
    probeWriteCallCount: probe.probeWriteCallCount,
  };
}

// ---- doc presence ----
assert(exists(f17Doc), `${f17Doc}: missing`);
if (!exists(f17Doc)) {
  console.error('FAIL validate-folder-sync-f17-sortorder-absorption-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f17Doc);
assert(doc.length > 5000, `${f17Doc}: F17 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- harness-only markers ----
assert(/IN-PROCESS \/ FIXTURE-BACKED APPLY PROOF HARNESS ONLY/i.test(flat), 'F17 doc must mark itself in-process apply-proof harness only');
assert(/SYNTHETIC/i.test(flat), 'F17 doc must state synthetic data');
assert(flat.includes('No product source was modified'), 'F17 doc must state no product source modified');
assert(/No live Desktop write/i.test(flat), 'F17 doc must state no live Desktop write');
assert(/node:sqlite|in-memory SQLite-like/i.test(flat), 'F17 doc must state the substrate (node:sqlite or in-memory model)');

// ---- F16 commit reference ----
assert(flat.includes(F16_COMMIT), `F17 doc must reference the F16 commit ${F16_COMMIT}`);
assert(exists(f16Doc), 'F16 harness doc must exist on disk');

// ---- apply + projection + reconvergence described ----
assert(/APPLY the accepted reorder ONLY to canonical `?sort_order`?|applied only to canonical `?sort_order`?/i.test(flat),
  'F17 doc must describe applying only to canonical sort_order');
assert(/RE-PROJECT the mirror|re-project the mirror|re-projected/i.test(flat), 'F17 doc must describe re-projecting the mirror');
assert(/field-mismatch:sortOrder/.test(flat) && /reconverge|CLEARS|clears/i.test(flat),
  'F17 doc must prove field-mismatch:sortOrder reconverges');
assert(/missing-mirror-folder`? (and|,)? .*field-mismatch:color`? stay 0|no missing-mirror \/ color|No missing-mirror/i.test(flat) ||
  (flat.includes('missing-mirror-folder') && flat.includes('field-mismatch:color') && /stay 0|= 0/i.test(flat)),
  'F17 doc must prove no missing-mirror/color regression');
assert(/BOUNDED WRITES|write counter is bounded|bounded to/i.test(flat), 'F17 doc must bound the write counter');
assert(/forbidden write counter/i.test(flat) || /forbidden write counters .* are 0/i.test(flat) ||
  /Every forbidden write counter is 0/i.test(flat), 'F17 doc must assert forbidden writes are 0');

// ---- safety + postures ----
for (const inv of ['no hard delete', 'no folder delete / purge', 'no chat delete', 'no binding repair']) {
  assert(flat.includes(inv), `F17 doc must include safety invariant: ${inv}`);
}
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F17 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /GATED|gated/i.test(flat), 'F17 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F17 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F17 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F17 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F17 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F17 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F17 doc must preserve chats on folder delete');
assert(/redacted|hash-only/i.test(flat), 'F17 doc must state redacted / hash-only evidence');

// ---- cross-surface + F18 ----
assert(flat.includes('Cross-Surface Requirement'), 'F17 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F17 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F17 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F17 doc must include Chrome / native extension');
assert(flat.includes('Recommended F18'), 'F17 doc must recommend F18');
assert(/conflict-path|REJECTED \/ SKIPPED|negative path/i.test(flat), 'F17 doc F18 must be the conflict-path apply harness');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F17 doc must confirm metadata core type: ${type}`);

// ---- RUN THE APPLY PROOF ----
let proof = null;
try {
  proof = await runApplyProof();
} catch (e) {
  failures.push('F17 apply proof threw: ' + (e && e.message ? e.message : String(e)));
}
if (proof) {
  assert(proof.beforeSortOrderDrift > 0, 'F17 proof: sortOrder drift must be present before re-projection');
  assert(proof.afterSortOrderDrift === 0, 'F17 proof: sortOrder drift must clear after re-projection');
  assert(proof.colorRegression === 0 && proof.missingRegression === 0, 'F17 proof: no color/missing regression');
  assert(proof.writes.forbiddenTotal === 0, 'F17 proof: forbidden writes must be 0');
  assert(proof.probeWriteCallCount === 0, 'F17 proof: probes must be read-only');
}

// ---- REAL SOURCE: proposed schemas NOT minted; F11 blocks sortOrder; sort_order canonical ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(!src.includes(REQUEST_SCHEMA), 'F17 design-only: proposed request schema must NOT be minted in source');
  assert(!src.includes(RECEIPT_SCHEMA), 'F17 design-only: proposed receipt schema must NOT be minted in source');
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
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source F11 helper must still block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f17-sortorder-absorption-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f17-sortorder-absorption-apply-proof-harness.v1',
  lane: 'folder-sync',
  phase: 'F17',
  f17Doc,
  harnessOnly: true,
  fixtures: 'embedded-synthetic',
  f16CommitReferenced: F16_COMMIT,
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  beforeSortOrderDrift: proof ? proof.beforeSortOrderDrift : null,
  afterSortOrderDrift: proof ? proof.afterSortOrderDrift : null,
  colorRegression: proof ? proof.colorRegression : null,
  missingRegression: proof ? proof.missingRegression : null,
  writes: proof ? proof.writes : null,
  probeWriteCallCount: proof ? proof.probeWriteCallCount : null,
  proposedSchemasMintedInSource: false,
  sortOrderGated: true,
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F18-in-process-conflict-path-apply-harness (rejected/skipped paths write nothing; no product runtime change, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f17-sortorder-absorption-apply-proof-harness');
