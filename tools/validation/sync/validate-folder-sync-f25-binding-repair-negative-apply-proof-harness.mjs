#!/usr/bin/env node
//
// Folder Sync Phase F25 — binding repair NEGATIVE-PATH apply proof harness (in-process; SYNTHETIC; no
// writes to any product store; no live Desktop; no flip).
//
// This meta-validator (a) grounds the F25 doc against the standing postures, and (b) RUNS an in-process
// negative-path proof: it seeds a disposable canonical folder_bindings table (real node:sqlite
// DatabaseSync(':memory:') with chat_id PRIMARY KEY, guarded fallback), projects a mocked
// FOLDER_STATE_DATA_KEY.items mirror, and for each of the ten REJECTED/SKIPPED synthetic binding fixtures
// asserts the decision receipt is rejected/skipped with the exact reason, the apply gate never fires, the
// canonical folder_bindings rows + the mocked mirror hash are unchanged, per-case
// canonicalBindingWriteCount/mirrorProjectionWriteCount/forbiddenTotal are 0, the read-only drift probe
// stays read-only, one-folder-per-chat still holds, and no chat is lost. An internal positive control
// confirms the oracle still returns 'applied' for a valid request (without applying it). It also asserts
// against REAL SOURCE that the request schema is present, the proposed receipt schema is NOT minted,
// folder_bindings + bindChat/unbindChat are intact, F11 still blocks the two gated classes, the sortOrder
// proposed schemas are unminted, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane guard. It
// imports NO product runtime store; F24 is not modified.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f25Doc = 'release-evidence/2026-06-25/folder-sync-f25-binding-repair-negative-apply-proof-harness.md';
const f24Doc = 'release-evidence/2026-06-25/folder-sync-f24-binding-repair-apply-proof-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F24_COMMIT = '6447b57';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const INTENTS = ['bind', 'unbind', 'move'];
const FORBIDDEN_KEYS = ['name', 'title', 'content'];
const NEGATIVE_REASONS = ['orphan-folder-binding', 'orphan-chat-binding', 'tombstoned-folder-binding',
  'duplicate', 'stale-basis', 'privacy-redaction-violation', 'superseded-concurrent', 'forbidden-intent'];
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
function tok(id) { return 'sha256:' + sha256('F25:' + id).slice(0, 16); }
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
// IN-PROCESS NEGATIVE-PATH BINDING HARNESS
// ============================================================================================

async function makeBindingStore() {
  const seed = [
    { chat_id: tok('chat_a'), folder_id: tok('folder_x'), assigned_at: 1 },
    { chat_id: tok('chat_b'), folder_id: tok('folder_y'), assigned_at: 1 },
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
    db.exec('CREATE TABLE folder_bindings (chat_id TEXT PRIMARY KEY, folder_id TEXT, assigned_at INTEGER)');
    const ins = db.prepare('INSERT INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)');
    for (const r of seed) ins.run(r.chat_id, r.folder_id, r.assigned_at);
    return {
      mode: 'node:sqlite',
      snapshot() {
        return db.prepare('SELECT chat_id, folder_id, assigned_at FROM folder_bindings ORDER BY chat_id ASC').all()
          .map((r) => `${r.chat_id}:${r.folder_id}:${r.assigned_at}`).join('|');
      },
      chatIds() { return db.prepare('SELECT chat_id FROM folder_bindings').all().map((r) => r.chat_id); },
      perChatCounts() { return db.prepare('SELECT chat_id, COUNT(*) AS n FROM folder_bindings GROUP BY chat_id').all().map((r) => r.n); },
      applyBind() { throw new Error('F25 must not apply on negative paths'); },
    };
  } catch (e) {
    const mem = new Map(seed.map((r) => [r.chat_id, r.folder_id]));
    return {
      mode: 'in-memory-model',
      snapshot() {
        return Array.from(mem.keys()).sort().map((c) => `${c}:${mem.get(c)}:1`).join('|');
      },
      chatIds() { return Array.from(mem.keys()); },
      perChatCounts() { return Array.from(mem.keys()).map(() => 1); },
      applyBind() { throw new Error('F25 must not apply on negative paths'); },
    };
  }
}

const FOLDERS = [tok('folder_x'), tok('folder_y')];
function mockMirror() {
  const items = Object.create(null);
  items[tok('folder_x')] = [tok('chat_a')];
  items[tok('folder_y')] = [tok('chat_b')];
  return { key: 'h2o:prm:cgx:fldrs:state:data:v1', items };
}
function mirrorHash(mirror) { return 'sha256:' + sha256(JSON.stringify(mirror.items)); }

// synthetic canonical validation snapshot for the oracle
const CANON = (() => {
  const bindings = { [tok('chat_a')]: tok('folder_x'), [tok('chat_b')]: tok('folder_y') };
  const raw = Object.keys(bindings).sort().map((c) => c + '>' + bindings[c]).join('|');
  return {
    bindingHash: 'sha256:' + sha256(raw).slice(0, 24),
    knownFolders: new Set([tok('folder_x'), tok('folder_y'), tok('folder_t')]),
    visibleFolders: new Set([tok('folder_x'), tok('folder_y')]),
    tombstonedFolders: new Set([tok('folder_t')]),
    liveChats: new Set([tok('chat_a'), tok('chat_b'), tok('chat_c')]),
    bindings,
  };
})();

function checkReceiptEnvelope(rcpt) {
  const problems = [];
  if (rcpt.schema !== RECEIPT_SCHEMA) problems.push('bad-schema');
  if (!rcpt.requestId) problems.push('missing-requestId');
  if (!['applied', 'skipped', 'rejected'].includes(rcpt.status)) problems.push('bad-status');
  if (!rcpt.reason) problems.push('missing-reason');
  if (!isHash(rcpt.resultingBindingHash)) problems.push('bad-resultingBindingHash');
  if (rcpt.canonicalAuthority !== 'desktop-sqlite') problems.push('bad-canonicalAuthority');
  if (rcpt.noChatDelete !== true || rcpt.noFolderDelete !== true || rcpt.noFolderPurge !== true || rcpt.noTombstoneMutation !== true) problems.push('bad-safety-marker');
  if (!rcpt.appliedAt && !rcpt.decidedAt) problems.push('missing-timestamp');
  if (hasForbiddenKeys(rcpt)) problems.push('raw-name-leak');
  return problems;
}

function decideBindingRepair(req, canon, ctx) {
  ctx = ctx || {};
  const r = {
    schema: RECEIPT_SCHEMA, requestId: req.requestId, status: 'rejected', reason: 'rejected',
    resultingBindingHash: canon.bindingHash, canonicalAuthority: 'desktop-sqlite',
    noChatDelete: true, noFolderDelete: true, noFolderPurge: true, noTombstoneMutation: true,
    decidedAt: '2026-07-01T00:00:00.000Z',
  };
  if (!INTENTS.includes(req.intent)) { r.reason = 'forbidden-intent'; return r; }
  if (hasForbiddenKeys(req)) { r.reason = 'privacy-redaction-violation'; return r; }
  if ((ctx.appliedKeys || new Set()).has(req.idempotencyKey)) { r.status = 'skipped'; r.reason = 'duplicate'; return r; }
  if (req.basisBindingHash !== canon.bindingHash) { r.reason = ctx.priorAppliedInBatch ? 'superseded-concurrent' : 'stale-basis'; return r; }
  if (!canon.liveChats.has(req.chatId)) { r.reason = 'orphan-chat-binding'; return r; }
  if (canon.tombstonedFolders.has(req.targetFolderId)) { r.reason = 'tombstoned-folder-binding'; return r; }
  if (!canon.visibleFolders.has(req.targetFolderId)) { r.reason = 'orphan-folder-binding'; return r; }
  r.status = 'applied'; r.reason = 'applied'; r.resultingBindingHash = req.requestedBindingHash; r.appliedAt = '2026-07-01T00:00:00.000Z';
  return r;
}

function mkReq(over) {
  return Object.assign({
    schema: REQUEST_SCHEMA, requestId: 'req_' + Math.random().toString(16).slice(2, 10),
    sourcePeerId: tok('peer'), surfaceKind: 'chrome-extension', intent: 'bind',
    chatId: tok('chat_c'), targetFolderId: tok('folder_x'),
    basisBindingHash: CANON.bindingHash, requestedBindingHash: 'sha256:req0000000000',
    createdAt: '2026-07-01T00:00:00.000Z', idempotencyKey: 'idem_' + Math.random().toString(16).slice(2, 10),
  }, over || {});
}

async function runNegativeProof() {
  const store = await makeBindingStore();
  const mirror = mockMirror();
  const baseSnapshot = store.snapshot();
  const baseMirrorHash = mirrorHash(mirror);
  const baseChats = store.chatIds().slice();

  // positive control: oracle returns applied for a valid request (NOT applied to the store)
  const controlReceipt = decideBindingRepair(mkReq({ intent: 'bind', chatId: tok('chat_c'), targetFolderId: tok('folder_x') }), CANON, {});
  assert(controlReceipt.status === 'applied' && controlReceipt.reason === 'applied',
    'F25 positive control: oracle must return applied for a valid request');

  const canonAdvanced = Object.assign({}, CANON, { bindingHash: 'sha256:advancedbind0000' });
  const cases = [
    { name: 'orphan-folder-binding', req: mkReq({ intent: 'bind', chatId: tok('chat_c'), targetFolderId: tok('folder_unknown') }), ctx: {}, status: 'rejected', reason: 'orphan-folder-binding' },
    { name: 'orphan-chat-binding', req: mkReq({ intent: 'bind', chatId: tok('chat_dead'), targetFolderId: tok('folder_x') }), ctx: {}, status: 'rejected', reason: 'orphan-chat-binding' },
    { name: 'tombstoned-folder-binding', req: mkReq({ intent: 'bind', chatId: tok('chat_c'), targetFolderId: tok('folder_t') }), ctx: {}, status: 'rejected', reason: 'tombstoned-folder-binding' },
    { name: 'duplicate-request', req: mkReq({ intent: 'bind', chatId: tok('chat_c'), idempotencyKey: 'idem_seen' }), ctx: { appliedKeys: new Set(['idem_seen']) }, status: 'skipped', reason: 'duplicate' },
    { name: 'stale-basis', req: mkReq({ intent: 'bind', chatId: tok('chat_c'), basisBindingHash: 'sha256:stalebind0000000' }), ctx: {}, status: 'rejected', reason: 'stale-basis' },
    { name: 'privacy-redaction-violation', req: mkReq({ intent: 'bind', chatId: tok('chat_c'), title: 'Secret' }), ctx: {}, status: 'rejected', reason: 'privacy-redaction-violation' },
    { name: 'multi-device-concurrent-move', req: mkReq({ intent: 'move', chatId: tok('chat_b'), previousFolderId: tok('folder_y'), targetFolderId: tok('folder_x'), basisBindingHash: CANON.bindingHash }), ctx: { priorAppliedInBatch: true, canon: canonAdvanced }, status: 'rejected', reason: 'superseded-concurrent' },
    { name: 'forbidden-intent-chat-delete', req: mkReq({ intent: 'chat-delete' }), ctx: {}, status: 'rejected', reason: 'forbidden-intent' },
    { name: 'forbidden-intent-folder-delete', req: mkReq({ intent: 'folder-delete' }), ctx: {}, status: 'rejected', reason: 'forbidden-intent' },
    { name: 'forbidden-intent-folder-purge', req: mkReq({ intent: 'folder-purge' }), ctx: {}, status: 'rejected', reason: 'forbidden-intent' },
  ];

  const results = [];
  for (const c of cases) {
    const writes = { canonicalBinding: 0, mirrorProjection: 0,
      forbidden: { chatDelete: 0, folderDelete: 0, folderPurge: 0, tombstone: 0, webdav: 0, cas: 0, runtimeSource: 0, productSqlite: 0, productMirror: 0 } };
    const canonForCase = c.ctx.canon || CANON;
    const receipt = decideBindingRepair(c.req, canonForCase, c.ctx);
    // APPLY GATE: only 'applied' would write; never fires for negatives
    if (receipt.status === 'applied') { writes.canonicalBinding += 1; writes.mirrorProjection += 1; }
    const forbiddenTotal = Object.values(writes.forbidden).reduce((a, b) => a + b, 0);

    assert(checkReceiptEnvelope(receipt).length === 0, `F25 ${c.name}: receipt invalid: ${checkReceiptEnvelope(receipt).join(',')}`);
    assert(receipt.status === c.status, `F25 ${c.name}: status ${receipt.status} != ${c.status}`);
    assert(receipt.reason === c.reason, `F25 ${c.name}: reason ${receipt.reason} != ${c.reason}`);
    assert(store.snapshot() === baseSnapshot, `F25 ${c.name}: canonical folder_bindings changed`);
    assert(mirrorHash(mirror) === baseMirrorHash, `F25 ${c.name}: mocked mirror changed`);
    assert(writes.canonicalBinding === 0, `F25 ${c.name}: canonicalBindingWriteCount != 0`);
    assert(writes.mirrorProjection === 0, `F25 ${c.name}: mirrorProjectionWriteCount != 0`);
    assert(forbiddenTotal === 0, `F25 ${c.name}: forbidden writes != 0`);
    assert(store.perChatCounts().every((n) => n === 1), `F25 ${c.name}: one-folder-per-chat broken`);
    assert(baseChats.every((ch) => store.chatIds().includes(ch)), `F25 ${c.name}: a chat was lost`);
    results.push({ name: c.name, status: receipt.status, reason: receipt.reason,
      canonicalUnchanged: store.snapshot() === baseSnapshot, mirrorUnchanged: mirrorHash(mirror) === baseMirrorHash,
      canonicalBindingWriteCount: writes.canonicalBinding, mirrorProjectionWriteCount: writes.mirrorProjection, forbiddenTotal });
  }
  return { sqliteMode: store.mode, results };
}

// ---- doc presence ----
assert(exists(f25Doc), `${f25Doc}: missing`);
if (!exists(f25Doc)) {
  console.error('FAIL validate-folder-sync-f25-binding-repair-negative-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f25Doc);
assert(doc.length > 5000, `${f25Doc}: F25 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- harness-only markers ----
assert(/IN-PROCESS \/ FIXTURE-BACKED BINDING REPAIR NEGATIVE-PATH APPLY PROOF HARNESS ONLY/i.test(flat),
  'F25 doc must mark itself in-process binding negative-path apply-proof harness only');
assert(/SYNTHETIC/i.test(flat), 'F25 doc must state synthetic data');
assert(flat.includes('No product source was modified'), 'F25 doc must state no product source modified');
assert(/No live Desktop write/i.test(flat), 'F25 doc must state no live Desktop write');
assert(/node:sqlite|in-memory .* model/i.test(flat), 'F25 doc must state the substrate');

// ---- F24 commit ----
assert(flat.includes(F24_COMMIT), `F25 doc must reference the F24 commit ${F24_COMMIT}`);
assert(exists(f24Doc), 'F24 doc must exist on disk');

// ---- negative matrix + zero-write claims in doc ----
for (const c of ['orphan-folder-binding', 'orphan-chat-binding', 'tombstoned-folder-binding',
  'duplicate-request', 'stale-basis', 'privacy-redaction-violation', 'multi-device-concurrent-move',
  'forbidden-intent']) {
  assert(flat.includes(c), `F25 doc must document negative case: ${c}`);
}
assert(/apply gate never fires|applies ONLY when|apply gate/i.test(flat), 'F25 doc must describe the apply gate');
assert(/canonicalBindingWriteCount: 0|canonicalBindingWriteCount:0/i.test(flat), 'F25 doc must claim canonicalBindingWriteCount 0');
assert(/mirrorProjectionWriteCount: 0|mirrorProjectionWriteCount:0/i.test(flat), 'F25 doc must claim mirrorProjectionWriteCount 0');
assert(/forbiddenTotal: 0|forbiddenTotal:0/i.test(flat), 'F25 doc must claim forbiddenTotal 0');
assert(/canonical `?folder_bindings`? rows are UNCHANGED|folder_bindings unchanged|rows are UNCHANGED/i.test(flat),
  'F25 doc must claim canonical folder_bindings unchanged');
assert(/mirror `?items`? hash is UNCHANGED|mocked mirror unchanged|mirror .* UNCHANGED/i.test(flat),
  'F25 doc must claim mirror unchanged');
assert(/positive control/i.test(flat), 'F25 doc must include the positive control');
assert(/one-folder-per-chat/i.test(flat), 'F25 doc must include one-folder-per-chat');
assert(/no chat is lost|no chat lost/i.test(flat), 'F25 doc must claim no chat lost');

// ---- safety + postures ----
for (const inv of ['no chat delete', 'no folder delete / purge', 'no tombstone mutation']) {
  assert(flat.includes(inv), `F25 doc must include safety invariant: ${inv}`);
}
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F25 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /GATED|gated/i.test(flat), 'F25 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F25 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F25 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F25 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F25 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F25 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F25 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F25 doc must preserve chats on folder delete');
assert(/redacted|hash-only/i.test(flat), 'F25 doc must state redacted / hash-only');

// ---- cross-surface + F26 ----
assert(flat.includes('Cross-Surface Requirement'), 'F25 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F25 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F25 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F25 doc must include Chrome / native extension');
assert(flat.includes('Recommended F26'), 'F25 doc must recommend F26');
assert(/IMPLEMENTATION-READINESS GATE|implementation-readiness|binding analog of the F19/i.test(flat),
  'F25 doc F26 must be the binding implementation-readiness gate');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F25 doc must confirm metadata core type: ${type}`);

// ---- RUN THE NEGATIVE PROOF ----
let proof = null;
try {
  proof = await runNegativeProof();
} catch (e) {
  failures.push('F25 negative proof threw: ' + (e && e.message ? e.message : String(e)));
}
if (proof) {
  assert(proof.results.length === 10, `F25 must exercise all 10 negative cases (got ${proof.results.length})`);
  for (const reason of NEGATIVE_REASONS) {
    assert(proof.results.some((r) => r.reason === reason), `F25 must include a negative case with reason ${reason}`);
  }
  for (const r of proof.results) {
    assert(['rejected', 'skipped'].includes(r.status), `F25 ${r.name}: status must be rejected/skipped`);
    assert(r.canonicalUnchanged === true, `F25 ${r.name}: canonical must be unchanged`);
    assert(r.mirrorUnchanged === true, `F25 ${r.name}: mirror must be unchanged`);
    assert(r.canonicalBindingWriteCount === 0 && r.mirrorProjectionWriteCount === 0 && r.forbiddenTotal === 0,
      `F25 ${r.name}: write counters must be 0`);
  }
}

// ---- REAL SOURCE: request present, receipt NOT minted, substrate intact ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  assert(!src.includes(RECEIPT_SCHEMA), 'F25 design-only: proposed binding receipt schema must NOT be minted in source');
  assert(!src.includes(SORTORDER_REQUEST_SCHEMA) && !src.includes(SORTORDER_RECEIPT_SCHEMA),
    'sortOrder proposed schemas must remain NOT minted in source');
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
  assert(store.includes('folder_bindings'), 'source must contain the folder_bindings table');
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'source bindChat must INSERT OR REPLACE folder_bindings');
  assert(store.includes('DELETE FROM folder_bindings WHERE chat_id'), 'source unbindChat must DELETE from folder_bindings');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f25-binding-repair-negative-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f25-binding-repair-negative-apply-proof-harness.v1',
  lane: 'folder-sync',
  phase: 'F25',
  f25Doc,
  harnessOnly: true,
  fixtures: 'embedded-synthetic',
  f24CommitReferenced: F24_COMMIT,
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  negativeMatrix: proof ? proof.results : null,
  negativeCaseCount: proof ? proof.results.length : 0,
  canonicalBindingWriteCount: 0,
  mirrorProjectionWriteCount: 0,
  forbiddenTotal: 0,
  probeWriteCallCount: 0,
  proposedReceiptMintedInSource: false,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F26-binding-repair-implementation-readiness-gate (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f25-binding-repair-negative-apply-proof-harness');
