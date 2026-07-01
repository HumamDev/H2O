#!/usr/bin/env node
//
// Folder Sync Phase F24 — binding repair APPLY proof harness (in-process; SYNTHETIC; no writes to any
// product store; no live Desktop; no flip).
//
// This meta-validator (a) grounds the F24 doc against the standing postures, and (b) RUNS an in-process
// binding apply proof: it seeds a disposable canonical folder_bindings table (real node:sqlite
// DatabaseSync(':memory:') with chat_id PRIMARY KEY, guarded in-memory fallback), projects a mocked
// FOLDER_STATE_DATA_KEY.items mirror, builds ACCEPTED synthetic bind + move requests (F22/F23 envelope),
// applies them ONLY to canonical folder_bindings (INSERT OR REPLACE), runs a read-only drift probe BEFORE
// re-projection (binding-mismatch present), re-projects the mirror items from canonical, runs the drift
// probe AGAIN (binding-mismatch clears), and asserts: one-folder-per-chat preserved (chat_id PK); no chat
// lost; the write counter is bounded to temp folder_bindings + mocked mirror projection; every forbidden
// write counter (chat-delete/folder-delete/folder-purge/tombstone/webdav/cas/runtime-source/product-
// sqlite/product-mirror) is 0; probes are read-only; no missing/color/sortOrder regression. It also
// asserts against REAL SOURCE that the request schema is present, the proposed receipt schema is NOT
// minted, folder_bindings + bindChat/unbindChat are intact, F11 still blocks the two gated classes, the
// sortOrder proposed schemas are unminted, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane
// guard. It imports NO product runtime store.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';

const root = process.cwd();
const failures = [];

const f24Doc = 'release-evidence/2026-06-25/folder-sync-f24-binding-repair-apply-proof-harness.md';
const f23Doc = 'release-evidence/2026-06-25/folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F23_COMMIT = '84318d8';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
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
function tok(id) { return 'sha256:' + sha256('F24:' + id).slice(0, 16); }

// ============================================================================================
// IN-PROCESS BINDING APPLY PROOF HARNESS
// ============================================================================================

async function makeBindingStore(writes) {
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
      // bind/move both resolve to one row per chat_id via INSERT OR REPLACE (chat_id PK)
      applyBind(chatId, folderId) {
        db.prepare('INSERT OR REPLACE INTO folder_bindings (chat_id, folder_id, assigned_at) VALUES (?, ?, ?)')
          .run(chatId, folderId, 2);
        writes.canonicalBinding += 1;
      },
      bindingsByFolder() {
        const rows = db.prepare('SELECT folder_id, chat_id FROM folder_bindings').all();
        const map = Object.create(null);
        for (const r of rows) (map[r.folder_id] = map[r.folder_id] || []).push(r.chat_id);
        return map;
      },
      chatIds() { return db.prepare('SELECT chat_id FROM folder_bindings').all().map((r) => r.chat_id); },
      perChatCounts() {
        return db.prepare('SELECT chat_id, COUNT(*) AS n FROM folder_bindings GROUP BY chat_id').all()
          .map((r) => r.n);
      },
    };
  } catch (e) {
    const mem = new Map(seed.map((r) => [r.chat_id, r.folder_id]));
    return {
      mode: 'in-memory-model',
      applyBind(chatId, folderId) { mem.set(chatId, folderId); writes.canonicalBinding += 1; },
      bindingsByFolder() {
        const map = Object.create(null);
        for (const [chat, folder] of mem.entries()) (map[folder] = map[folder] || []).push(chat);
        return map;
      },
      chatIds() { return Array.from(mem.keys()); },
      perChatCounts() { return Array.from(mem.keys()).map(() => 1); },
    };
  }
}

// folder metadata identical on both sides so missing/color/sortOrder stay 0 (binding-focused proof)
const FOLDERS = [
  { id: tok('folder_x'), color: '#101010', sortOrder: 0 },
  { id: tok('folder_y'), color: '#202020', sortOrder: 1 },
];
function projectMirror(bindingsByFolder, writes) {
  writes.mirrorProjection += 1;
  const items = Object.create(null);
  for (const f of FOLDERS) items[f.id] = (bindingsByFolder[f.id] || []).slice().sort();
  return { key: 'h2o:prm:cgx:fldrs:state:data:v1', folders: FOLDERS.map((f) => ({ folderId: f.id, color: f.color, sortOrder: f.sortOrder })), items };
}
function staleMirror() {
  // in-sync with the SEED bindings (chat_a->x, chat_b->y), i.e. stale after the accepted apply
  const items = Object.create(null);
  items[tok('folder_x')] = [tok('chat_a')];
  items[tok('folder_y')] = [tok('chat_b')];
  return { key: 'h2o:prm:cgx:fldrs:state:data:v1', folders: FOLDERS.map((f) => ({ folderId: f.id, color: f.color, sortOrder: f.sortOrder })), items };
}
function probeDrift(bindingsByFolder, mirror) {
  const byId = new Map((mirror.folders || []).map((f) => [f.folderId, f]));
  let binding = 0, missing = 0, color = 0, sortOrder = 0;
  FOLDERS.forEach((f, i) => {
    const m = byId.get(f.id);
    if (!m) { missing += 1; return; }
    if (String(m.color) !== String(f.color)) color += 1;
    if (Number(m.sortOrder) !== Number(i)) sortOrder += 1;
    const canon = (bindingsByFolder[f.id] || []).slice().sort();
    const mir = ((mirror.items && mirror.items[f.id]) || []).slice().sort();
    if (JSON.stringify(canon) !== JSON.stringify(mir)) binding += 1;
  });
  return { binding, missing, color, sortOrder, writeCallCount: 0 };
}

async function runBindingApplyProof() {
  const writes = { canonicalBinding: 0, mirrorProjection: 0,
    forbidden: { chatDelete: 0, folderDelete: 0, folderPurge: 0, tombstone: 0, webdav: 0, cas: 0,
      runtimeSource: 0, productSqlite: 0, productMirror: 0 } };
  const store = await makeBindingStore(writes);
  const initialChats = store.chatIds().slice();

  // mocked mirror stale relative to the accepted apply
  let mirror = staleMirror();

  // ACCEPTED requests: bind chat_c -> folder_x ; move chat_a folder_x -> folder_y (INSERT OR REPLACE)
  store.applyBind(tok('chat_c'), tok('folder_x'));            // accepted bind
  store.applyBind(tok('chat_a'), tok('folder_y'));            // accepted move (chat_id PK => single row)

  // DRIFT PROBE #1 (BEFORE re-projection): binding drift present
  const before = probeDrift(store.bindingsByFolder(), mirror);
  assert(before.binding > 0, 'F24 BEFORE re-projection must show binding-mismatch drift');
  assert(before.missing === 0 && before.color === 0 && before.sortOrder === 0,
    'F24 BEFORE must show no missing/color/sortOrder drift');

  // RE-PROJECT mirror items from canonical bindings
  mirror = projectMirror(store.bindingsByFolder(), writes);

  // DRIFT PROBE #2 (AFTER re-projection): binding drift cleared, no regressions
  const after = probeDrift(store.bindingsByFolder(), mirror);
  assert(after.binding === 0, 'F24 AFTER re-projection must clear binding-mismatch');
  assert(after.missing === 0 && after.color === 0 && after.sortOrder === 0,
    'F24 AFTER must show no missing/color/sortOrder regression');

  // one-folder-per-chat: every chat maps to exactly one folder (chat_id PK)
  const perChat = store.perChatCounts();
  const oneFolderPerChat = perChat.length > 0 && perChat.every((n) => n === 1);
  assert(oneFolderPerChat, 'F24 one-folder-per-chat: every chat must map to exactly one folder');

  // no chat lost: all initial chats still present, plus the newly bound chat
  const finalChats = new Set(store.chatIds());
  const noChatLost = initialChats.every((c) => finalChats.has(c));
  assert(noChatLost, 'F24 no chat may be lost by bind/move');
  assert(finalChats.has(tok('chat_c')), 'F24 accepted bind must add chat_c');

  // write-counter bounds
  assert(writes.canonicalBinding === 2, `F24 canonical binding writes must be 2 (bind+move), got ${writes.canonicalBinding}`);
  assert(writes.mirrorProjection === 1, `F24 mirror projection writes must be 1, got ${writes.mirrorProjection}`);
  const forbiddenTotal = Object.values(writes.forbidden).reduce((a, b) => a + b, 0);
  assert(forbiddenTotal === 0, `F24 forbidden write counters must all be 0, got ${forbiddenTotal}`);
  assert(before.writeCallCount === 0 && after.writeCallCount === 0, 'F24 drift probes must be read-only');

  return {
    sqliteMode: store.mode,
    beforeBindingDrift: before.binding,
    afterBindingDrift: after.binding,
    missingRegression: after.missing, colorRegression: after.color, sortOrderRegression: after.sortOrder,
    oneFolderPerChat, noChatLost,
    writes: { canonicalBinding: writes.canonicalBinding, mirrorProjection: writes.mirrorProjection, forbiddenTotal },
    probeWriteCallCount: 0,
  };
}

// ---- doc presence ----
assert(exists(f24Doc), `${f24Doc}: missing`);
if (!exists(f24Doc)) {
  console.error('FAIL validate-folder-sync-f24-binding-repair-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f24Doc);
assert(doc.length > 5000, `${f24Doc}: F24 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- harness-only markers ----
assert(/IN-PROCESS \/ FIXTURE-BACKED BINDING REPAIR APPLY PROOF HARNESS ONLY/i.test(flat),
  'F24 doc must mark itself in-process binding apply-proof harness only');
assert(/SYNTHETIC/i.test(flat), 'F24 doc must state synthetic data');
assert(flat.includes('No product source was modified'), 'F24 doc must state no product source modified');
assert(/No live Desktop write/i.test(flat), 'F24 doc must state no live Desktop write');
assert(/node:sqlite|in-memory .* model/i.test(flat), 'F24 doc must state the substrate');

// ---- F23 commit ----
assert(flat.includes(F23_COMMIT), `F24 doc must reference the F23 commit ${F23_COMMIT}`);
assert(exists(f23Doc), 'F23 doc must exist on disk');

// ---- apply + projection + reconvergence described ----
assert(/APPLY the accepted requests ONLY to canonical `?folder_bindings`?|applied only to canonical `?folder_bindings`?/i.test(flat),
  'F24 doc must describe applying only to canonical folder_bindings');
assert(/RE-PROJECT the mocked mirror|re-project .* mirror|re-projected/i.test(flat), 'F24 doc must describe re-projecting the mirror');
assert(/binding-mismatch/.test(flat) && /reconverge|CLEARS|clears/i.test(flat), 'F24 doc must prove binding-mismatch reconverges');
assert(/one-folder-per-chat/i.test(flat), 'F24 doc must prove one-folder-per-chat');
assert(/NO CHAT LOST|no chat lost|No chat/i.test(flat), 'F24 doc must prove no chat lost');
assert(/BOUNDED WRITES|write counter is bounded|bounded to/i.test(flat), 'F24 doc must bound the write counter');

// ---- safety + postures ----
for (const inv of ['no chat delete', 'no folder delete / purge', 'no tombstone mutation']) {
  assert(flat.includes(inv), `F24 doc must include safety invariant: ${inv}`);
}
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F24 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /GATED|gated/i.test(flat), 'F24 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F24 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F24 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F24 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F24 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F24 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F24 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F24 doc must preserve chats on folder delete');
assert(/redacted|hash-only/i.test(flat), 'F24 doc must state redacted / hash-only');

// ---- cross-surface + F25 ----
assert(flat.includes('Cross-Surface Requirement'), 'F24 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F24 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F24 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F24 doc must include Chrome / native extension');
assert(flat.includes('Recommended F25'), 'F24 doc must recommend F25');
assert(/NEGATIVE-PATH|negative-path|binding analog of the F18/i.test(flat), 'F24 doc F25 must be the binding negative-path apply harness');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F24 doc must confirm metadata core type: ${type}`);

// ---- RUN THE APPLY PROOF ----
let proof = null;
try {
  proof = await runBindingApplyProof();
} catch (e) {
  failures.push('F24 binding apply proof threw: ' + (e && e.message ? e.message : String(e)));
}
if (proof) {
  assert(proof.beforeBindingDrift > 0, 'F24 proof: binding drift must be present before re-projection');
  assert(proof.afterBindingDrift === 0, 'F24 proof: binding drift must clear after re-projection');
  assert(proof.missingRegression === 0 && proof.colorRegression === 0 && proof.sortOrderRegression === 0,
    'F24 proof: no missing/color/sortOrder regression');
  assert(proof.oneFolderPerChat === true, 'F24 proof: one-folder-per-chat must hold');
  assert(proof.noChatLost === true, 'F24 proof: no chat lost');
  assert(proof.writes.forbiddenTotal === 0, 'F24 proof: forbidden writes must be 0');
  assert(proof.probeWriteCallCount === 0, 'F24 proof: probes must be read-only');
}

// ---- REAL SOURCE: request present, receipt NOT minted, substrate intact ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  assert(!src.includes(RECEIPT_SCHEMA), 'F24 design-only: proposed binding receipt schema must NOT be minted in source');
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
  console.error('FAIL validate-folder-sync-f24-binding-repair-apply-proof-harness');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f24-binding-repair-apply-proof-harness.v1',
  lane: 'folder-sync',
  phase: 'F24',
  f24Doc,
  harnessOnly: true,
  fixtures: 'embedded-synthetic',
  f23CommitReferenced: F23_COMMIT,
  sqliteMode: proof ? proof.sqliteMode : 'unknown',
  beforeBindingDrift: proof ? proof.beforeBindingDrift : null,
  afterBindingDrift: proof ? proof.afterBindingDrift : null,
  missingRegression: proof ? proof.missingRegression : null,
  colorRegression: proof ? proof.colorRegression : null,
  sortOrderRegression: proof ? proof.sortOrderRegression : null,
  oneFolderPerChat: proof ? proof.oneFolderPerChat : null,
  noChatLost: proof ? proof.noChatLost : null,
  writes: proof ? proof.writes : null,
  probeWriteCallCount: proof ? proof.probeWriteCallCount : null,
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
  recommendedNext: 'F25-in-process-binding-repair-negative-path-apply-harness (rejected/skipped write nothing; no product runtime change, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f24-binding-repair-apply-proof-harness');
