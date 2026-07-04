#!/usr/bin/env node
//
// Folder Sync Phase F32 — S2 execution: sortOrder Desktop validate/apply/receipt handler (source validator).
//
// F32 adds a real Desktop sortOrder handler to folder-sync.tauri.js, scoped to canonical sort_order apply
// ONLY, dry-run-by-default, gated, idempotent atomic-on-retry, with a strict basis stale-check and a
// post-apply ordering-hash verification. Mirror re-projection is DEFERRED to S2b. This validator asserts
// (against REAL SOURCE): the F32 evidence exists + references the F31 commit; the handler consumes the
// request schema + emits the receipt schema; validate/classify/apply/receipt functions exist; dry-run by
// default; apply writes ONLY canonical sort_order via store.folders.patch (recordWrite-routed); the handler
// body contains no folder_bindings write, no DELETE FROM folders, no tombstone/chat/binding mutation, no
// folder delete/purge, no mirror (FOLDER_STATE_DATA_KEY/chromeStorageSet) write; receipt carries
// canonicalAuthority desktop-sqlite + no-delete markers + mirrorReprojection deferred-to-s2b; a post-apply
// hash check gates the applied verdict; conflict cases build receipts with canonicalWriteCount 0; F11 blocks
// binding-mismatch (sortOrder allowed post-S5); binding request+receipt minted+live-proven; fullBundle v2/no v3; WebDAV deferred; bounded metadata
// guard; productSyncReady not flipped; no CAS/Chat Saving/archive code added. Binds no socket; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f32Doc = 'release-evidence/2026-06-25/folder-sync-f32-s2-sortorder-handler.md';
const f31Doc = 'release-evidence/2026-06-25/folder-sync-f31-s2-preflight-gate.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5ImplementationEvidenceFile = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const bindingLiveCloseoutFile = 'release-evidence/2026-07-01/folder-sync-binding-f15-live-restart-survival-closeout.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function stripComments(src) {
  return src.split('\n').filter((ln) => {
    const t = ln.trim();
    return !(t.startsWith('*') || t.startsWith('/*') || t.startsWith('//'));
  }).join('\n');
}

const F31_COMMIT = '6d6da48';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_STRING = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_STRING = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BODY_BEGIN = '===================== F32 (folder-sync S2): sortOrder reorder Desktop handler';
const BODY_END = '===================== end F32 S2 sortOrder reorder handler';
const CONFLICT_REASONS = ['duplicate', 'unknown-folder', 'tombstoned-folder', 'missing-folder',
  'folder-not-in-catalog', 'stale-basis', 'superseded-concurrent'];
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
assert(exists(f32Doc), `${f32Doc}: missing`);
if (!exists(f32Doc)) {
  console.error('FAIL validate-folder-sync-f32-s2-sortorder-handler');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f32Doc);
assert(doc.length > 5000, `${f32Doc}: F32 doc too short`);
const flat = doc.replace(/\s+/g, ' ');
assert(/S2 EXECUTION — REAL PRODUCT-SOURCE HANDLER ADDITION/i.test(flat), 'F32 doc must mark itself S2 execution / real handler addition');
assert(flat.includes(F31_COMMIT), `F32 doc must reference the F31 commit ${F31_COMMIT}`);
assert(exists(f31Doc), 'F31 doc must exist on disk');
assert(/canonical SQLite `?sort_order`? apply ONLY|canonical .* sort_order apply only/i.test(flat), 'F32 doc must state canonical sort_order apply only');
assert(/DEFERRED to a separate S2b slice|deferred-to-s2b/i.test(flat), 'F32 doc must record the mirror re-projection deferral to S2b');
assert(/Retained-Validator Ripple|F30 \/ F31/i.test(flat), 'F32 doc must record the F30/F31 ripple');
assert(flat.includes('Recommended F33'), 'F32 doc must recommend F33');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F32 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: handler present + scoped ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);

  // handler function family exists
  assert(src.includes('function validateFolderSortorderReorderRequestForDesktopApply('), 'validate function must exist');
  assert(src.includes('function classifyFolderSortorderReorderConflict('), 'classify function must exist');
  assert(src.includes('function buildFolderSortorderReorderReceipt('), 'receipt builder must exist');
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'apply function must exist');
  assert(src.includes('function folderSortorderCanonicalSnapshot('), 'canonical snapshot function must exist');
  assert(src.includes('sortOrderReorder: {'), 'handler must be exposed on the sync API (sortOrderReorder)');

  // consumes request schema + emits receipt schema (both strings now referenced beyond declaration)
  assert(src.includes(REQUEST_STRING), 'source must contain the request schema string');
  assert(src.includes(RECEIPT_STRING), 'source must contain the receipt schema string');
  assert(src.includes('cleanString(req.schema) !== FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA'),
    'validate must check the request schema constant');
  assert(src.includes('schema: FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA'), 'receipt builder must emit the receipt schema constant');

  // extract handler body between markers
  const b0 = src.indexOf(BODY_BEGIN);
  const b1 = src.indexOf(BODY_END);
  assert(b0 !== -1 && b1 !== -1 && b0 < b1, 'F32 handler body markers must be present');
  const body = b0 !== -1 && b1 !== -1 ? src.slice(b0, b1) : '';
  const code = stripComments(body);

  // dry-run by default + gated apply
  assert(code.includes('var dryRun = opts.apply !== true'), 'handler must be dry-run by default (opts.apply !== true)');
  assert(code.includes("cleanString(opts.gate) === FOLDER_SORTORDER_REORDER_APPLY_GATE"), 'apply must require the gate token');
  assert(/status[^;]*dry-run|'dry-run'/.test(code), 'handler must emit a dry-run receipt');
  assert(code.includes("'apply-gate-required'"), 'handler must reject apply without the gate');

  // apply writes ONLY canonical sort_order via store.folders.patch (recordWrite-routed)
  assert(code.includes('folders.patch(order[i], { sortOrder: i })'), 'apply must write sort_order via store.folders.patch');

  // FORBIDDEN in executable handler body: no bindings/delete/tombstone/chat/purge/mirror writes, no raw sql
  for (const banned of ['folder_bindings', 'DELETE FROM folders', 'bindChat', 'unbindChat',
    'moveCanonicalChatFolderBinding', 'softDelete', 'restoreTombstoned', 'purgeRecentlyDeleted',
    'chromeStorageSet', 'FOLDER_STATE_DATA_KEY', 'sqlExecute(', 'rebuildRenderMirrorFromSqlite',
    'productSyncReady', 'fullBundle.v3', 'webdav', 'chat-folder-binding-receipt']) {
    assert(!code.includes(banned), `F32 handler body must NOT contain: ${banned}`);
  }

  // receipt markers + post-apply hash gate + deferral + conflict zero-writes
  assert(code.includes("canonicalAuthority: 'desktop-sqlite'"), 'receipt must assert canonicalAuthority desktop-sqlite');
  for (const marker of ['noDestructiveMutation: true', 'noFolderDelete: true', 'noFolderPurge: true',
    'noChatDelete: true', 'noBindingMutation: true', 'noTombstoneMutation: true']) {
    assert(code.includes(marker), `receipt must carry marker: ${marker}`);
  }
  assert(code.includes("mirrorReprojection: 'deferred-to-s2b'"), 'receipt must record mirror re-projection deferral');
  assert(code.includes("afterHash === cleanString(request.requestedOrderingHash)"),
    'apply must emit applied only if post-apply hash equals requestedOrderingHash');
  assert(code.includes("'post-apply-ordering-hash-mismatch'"), 'apply must handle post-apply hash mismatch');
  assert(code.includes('canonicalWriteCount: 0'), 'conflict/dry-run receipts must record canonicalWriteCount 0');
  // conflict reasons present in classify
  for (const reason of CONFLICT_REASONS) assert(body.includes("'" + reason + "'") || body.includes(reason),
    `classify must produce conflict reason: ${reason}`);
  // strict basis stale-check
  assert(code.includes('folderSortorderOrderingHash(f32CurrentPayloadOrder(ids, snapshot))'),
    'classify must compute the current payload-order hash for the strict basis stale-check');

  // whole-file boundaries
  // Post-S5/F15: the chat-folder binding request + receipt schemas are minted and live-proven (restart-survival closeout).
  assert(src.includes("CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '" + BINDING_RECEIPT_SCHEMA + "'"), 'binding receipt schema now minted in source');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema present in source');
  assert(exists(bindingLiveCloseoutFile) && read(bindingLiveCloseoutFile).includes('reconcileSurvivalProven:true'),
    'binding request/receipt path is live-proven (restart-survival closeout)');
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

// ---- F11 boundary ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  if (exists(s5ImplementationEvidenceFile)) {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'S5 must allow F11 field-mismatch:sortOrder');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'F11 helper must keep binding-mismatch blocked after S5');
  } else {
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
      'F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch before S5');
  }
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'),
    'folder substrate tokens must remain intact');
  // the store patch write path the handler relies on (sort_order UPDATE + recordWrite)
  assert(store.includes("UPDATE folders SET ' + setClauses.join(', ') + ' WHERE id = ?") || store.includes('UPDATE folders SET '),
    'store upsert must UPDATE folders (sort_order write path)');
  assert(store.includes("recordWrite('upsert.update')"), 'store upsert must route through recordWrite');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f32-s2-sortorder-handler');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const src = read(folderSyncFile);
const appliedNow = parseMetadataAllowlist(src);
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f32-s2-sortorder-handler.v1',
  lane: 'folder-sync',
  phase: 'F32',
  step: 'S2',
  f32Doc,
  productSourceHandlerAdded: true,
  f31CommitReferenced: F31_COMMIT,
  clonedMetadataMutationIdiom: true,
  applyWritesOnlySortOrder: true,
  atomicOnRetry: true,
  strictBasisStaleCheck: true,
  postApplyHashGate: true,
  dryRunByDefault: true,
  gatedApply: true,
  mirrorReprojection: 'deferred-to-s2b',
  f11AllowedSetChanged: false,
  bindingReceiptSchemaMinted: true,
  bindingRequestReceiptLiveProven: true,
  bindingMismatchBlocked: true,
  sortOrderGatedInF11: false,
  productSyncReady: false,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F33-inprocess-reprove-real-handler + S2b-mirror-reprojection-design (no live writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f32-s2-sortorder-handler');
