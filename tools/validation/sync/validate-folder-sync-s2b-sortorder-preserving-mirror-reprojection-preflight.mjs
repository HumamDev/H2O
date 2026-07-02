#!/usr/bin/env node
//
// Folder Sync — S2b preflight (design-only) meta-validator for the sortOrder-preserving mirror re-projection.
//
// Verifies the S2b preflight doc exists and is internally consistent: references F32c (8293156), S4
// (c5553526), and post-S4 (a47742d5); records the post-S4 canonical readback hash (oh:d91ad328) and that the
// mirror is still deferred-to-s2b with full S2 open pending S2b; states design-only / not implemented here;
// specifies the required contract (validation pass + canonical write success + post-apply hash verification
// -> sortOrder-preserving mirror projection), the "never leads canonical" rule, idempotent/bounded, and the
// no-binding/tombstone/chat/delete/WebDAV/CAS invariants; states that rebuildRenderMirrorFromSqlite must NOT
// be reused BECAUSE the F11 helper strips sortOrder/sort_order; keeps S5/F11/productSyncReady/Chat-Saving-CAS
// blocked. It grounds anchors against REAL SOURCE (mirror still deferred; binding receipt unminted; fullBundle
// v2; webdav deferred; F11 blocks both classes; the F11 rebuild helper strips sortOrder). Binds no socket;
// performs no write; runs no live Desktop; edits no product source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const doc = 'release-evidence/2026-07-01/folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight.md';
const postS4Doc = 'release-evidence/2026-07-01/folder-sync-post-s4-readback-idempotency.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F32C_COMMIT = '8293156';
const S4_COMMIT = 'c5553526';
const POST_S4_COMMIT = 'a47742d5';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
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

// ---- doc presence ----
assert(exists(doc), `${doc}: missing`);
if (!exists(doc)) {
  console.error('FAIL validate-folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const text = read(doc);
assert(text.length > 3000, `${doc}: doc too short`);
const flat = text.replace(/\s+/g, ' ');

// ---- verdict + design-only ----
assert(/S2B PREFLIGHT GO-WITH-CONDITIONS/.test(flat), 'doc must carry the GO-WITH-CONDITIONS verdict');
assert(/design-only/i.test(flat), 'doc must state design-only');
assert(/No product source was edited/i.test(flat), 'doc must state no product source was edited');
assert(/S2b is NOT implemented|not implemented in this slice|S2b implementation is not performed/i.test(flat),
  'doc must state S2b is not implemented here');

// ---- provenance ----
assert(flat.includes(F32C_COMMIT), `doc must reference F32c commit ${F32C_COMMIT}`);
assert(flat.includes(S4_COMMIT), `doc must reference S4 commit ${S4_COMMIT}`);
assert(flat.includes(POST_S4_COMMIT), `doc must reference post-S4 commit ${POST_S4_COMMIT}`);
assert(exists(postS4Doc), 'post-S4 evidence doc must exist on disk');

// ---- carried state ----
assert(flat.includes('oh:d91ad328'), 'doc must record the canonical readback hash oh:d91ad328');
assert(/deferred-to-s2b/.test(flat), 'doc must record mirror still deferred-to-s2b');
assert(/full S2 remains open|Full S2 remains OPEN/i.test(flat), 'doc must record full S2 remains open pending S2b');

// ---- no-reuse of F11 rebuild helper + WHY ----
assert(/must NOT reuse `?rebuildRenderMirrorFromSqlite`?|MUST NOT reuse/i.test(flat) && flat.includes('rebuildRenderMirrorFromSqlite'),
  'doc must state rebuildRenderMirrorFromSqlite must not be reused');
assert(/strips? (ordering|`?sortOrder`?)/i.test(flat) && flat.includes('delete next.sortOrder;') && flat.includes('delete next.sort_order;'),
  'doc must state WHY: the F11 helper strips sortOrder/sort_order');

// ---- required contract ----
assert(/validation passes/i.test(flat) && /canonical Desktop SQLite `?sortOrder`? write succeeds/i.test(flat) &&
  /post-apply canonical ordering hash equals the requested ordering hash/i.test(flat),
  'doc must state the ordered preconditions (validation -> canonical write success -> post-apply hash equals requested)');
assert(/sortOrder-preserving/i.test(flat) && /mirror (re-)?projection/i.test(flat),
  'doc must state the sortOrder-preserving mirror projection contract');
assert(/Never lead canonical state|never leads canonical|mirror is strictly derived/i.test(flat),
  'doc must state the mirror never leads canonical state');
assert(/idempotent/i.test(flat), 'doc must state the projection is idempotent');
assert(/bounded/i.test(flat), 'doc must state the projection is bounded');

// ---- invariants ----
assert(/NOT mutate bindings/i.test(flat), 'doc must forbid binding mutation');
assert(/NOT mutate tombstones/i.test(flat), 'doc must forbid tombstone mutation');
assert(/NOT delete folders/i.test(flat), 'doc must forbid folder delete');
assert(/NOT delete chats/i.test(flat), 'doc must forbid chat delete');
assert(/NOT touch WebDAV|WebDAV \/ cloud \/ relay \/ archive CAS/i.test(flat), 'doc must forbid WebDAV/cloud/archive CAS');

// ---- blocked postures ----
assert(/dry-run \/ proof FIRST|dry-run\/proof first|proof FIRST/i.test(flat), 'doc must require dry-run/proof first');
assert(/S5 ?\/? ?F11 allowed-set flip (remains|stays) BLOCKED/i.test(flat), 'doc must keep S5/F11 flip blocked');
assert(flat.includes('`productSyncReady` remains `false`') || /productSyncReady` (remains|stays) `false`/.test(flat),
  'doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i.test(flat), 'doc must keep Chat Saving CAS blocked');
assert(/binding receipt schema (remains|stays) unminted/i.test(flat), 'doc must keep binding receipt unminted');
assert(/Recommended Next Slice|S2b implementation \/ proof/i.test(flat), 'doc must recommend S2b implementation/proof next');

// ---- REAL SOURCE anchors ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'F32 handler must still be present');
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'source must still defer mirror re-projection (S2b not implemented)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema must remain NOT minted');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must remain present');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync.tauri.js');
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a), `unexpected applied type: ${a}`);
  }
}
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  // the exact reason S2b cannot reuse the F11 helper: it strips ordering.
  assert(store.includes('function rebuildRenderMirrorFromSqlite('), 'F11 rebuild helper must still exist in source');
  assert(store.includes('delete next.sortOrder;') && store.includes('delete next.sort_order;'),
    'F11 rebuild helper must STILL strip sortOrder/sort_order (proving why S2b cannot reuse it)');
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder substrate tokens intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  'WebDAV must remain deferred in folder-import.mv3.js');

if (failures.length) {
  console.error('FAIL validate-folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.s2b-sortorder-preserving-mirror-reprojection-preflight.v1',
  lane: 'folder-sync',
  phase: 'S2b-preflight',
  step: 'sortorder-preserving-mirror-reprojection-design-only-gate',
  doc,
  verdict: 'GO-WITH-CONDITIONS',
  designOnly: true,
  s2bImplemented: false,
  f32cCommitReferenced: F32C_COMMIT,
  s4CommitReferenced: S4_COMMIT,
  postS4CommitReferenced: POST_S4_COMMIT,
  canonicalReadbackHash: 'oh:d91ad328',
  mirrorDeferred: true,
  fullS2Open: true,
  mustNotReuseF11RebuildHelper: true,
  f11RebuildStripsSortOrder: true,
  contract: 'validation-pass + canonical-write-success + post-apply-hash==requested -> sortOrder-preserving mirror projection',
  mirrorNeverLeadsCanonical: true,
  idempotent: true,
  bounded: true,
  noBindingMutation: true,
  noTombstoneMutation: true,
  noFolderDelete: true,
  noChatDelete: true,
  noWebdavCloudArchiveCas: true,
  s5F11FlipBlocked: true,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'S2b-implementation-proof (dry-run-first sortOrder-preserving mirror projection + validator); NOT S5/productSyncReady/WebDAV',
}, null, 2));
console.log('PASS validate-folder-sync-s2b-sortorder-preserving-mirror-reprojection-preflight');
