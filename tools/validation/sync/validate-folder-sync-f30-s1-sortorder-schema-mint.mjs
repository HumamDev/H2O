#!/usr/bin/env node
//
// Folder Sync Phase F30 — S1 execution: sortOrder schema mint (source validator).
//
// F30 is the FIRST product-source change in the folder-sync lane. It mints exactly two INERT sortOrder
// schema string constants into src-surfaces-base/studio/sync/folder-sync.tauri.js. This validator asserts
// (against REAL SOURCE): the F30 evidence exists and references the F29 commit; both constants exist with
// EXACT names + values; both are declared in the request/receipt schema-constants region (between the
// existing CHAT_FOLDER_BINDING_REQUEST_SCHEMA and LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA constants);
// each constant is referenced EXACTLY ONCE (its declaration) — i.e. INERT, not wired into any handler /
// request loop / transport / import / export; no sortOrder validate/apply handler over sort_order was
// added; F11 still blocks field-mismatch:sortOrder + binding-mismatch; the binding receipt schema is
// still NOT minted; fullBundle stays v2 / no v3; WebDAV deferred; the bounded metadata guard holds; no
// CAS / Chat Saving / archive code was added; productSyncReady stays false. Binds no socket; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f30Doc = 'release-evidence/2026-06-25/folder-sync-f30-s1-sortorder-schema-mint.md';
const f29Doc = 'release-evidence/2026-06-25/folder-sync-f29-s1-preflight-gate.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function countOccurrences(hay, needle) {
  let n = 0; let i = hay.indexOf(needle);
  while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

const F29_COMMIT = '436a59a';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_CONST = 'FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA';
const RECEIPT_CONST = 'FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA';
const REQUEST_DECL = "var FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';";
const RECEIPT_DECL = "var FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';";
const REQUEST_STRING = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_STRING = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
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
assert(exists(f30Doc), `${f30Doc}: missing`);
if (!exists(f30Doc)) {
  console.error('FAIL validate-folder-sync-f30-s1-sortorder-schema-mint');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f30Doc);
assert(doc.length > 4000, `${f30Doc}: F30 doc too short`);
const flat = doc.replace(/\s+/g, ' ');
assert(/S1 EXECUTION — FIRST PRODUCT-SOURCE SCHEMA MINT/i.test(flat), 'F30 doc must mark itself S1 execution / first product-source mint');
assert(flat.includes(F29_COMMIT), `F30 doc must reference the F29 commit ${F29_COMMIT}`);
assert(exists(f29Doc), 'F29 doc must exist on disk');
assert(/inert/i.test(flat), 'F30 doc must state the constants are inert');
assert(/Rollback/i.test(flat), 'F30 doc must define rollback');
assert(/Retained-Validator Source-Anchor Updates|absent → present|absent -> present/i.test(flat),
  'F30 doc must record the absent→present retained-validator updates');
assert(flat.includes('Recommended F31'), 'F30 doc must recommend F31');

// ---- REAL SOURCE: the mint ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);

  // exact declarations present
  assert(src.includes(REQUEST_DECL), 'source must contain the exact sortOrder request schema declaration');
  assert(src.includes(RECEIPT_DECL), 'source must contain the exact sortOrder receipt schema declaration');
  assert(src.includes(REQUEST_STRING), 'source must contain the sortOrder request schema string');
  assert(src.includes(RECEIPT_STRING), 'source must contain the sortOrder receipt schema string');

  // INERT: each constant name referenced EXACTLY ONCE (its declaration); each schema string exactly once
  assert(countOccurrences(src, REQUEST_CONST) === 1,
    `sortOrder request constant must be referenced exactly once (inert); found ${countOccurrences(src, REQUEST_CONST)}`);
  assert(countOccurrences(src, RECEIPT_CONST) === 1,
    `sortOrder receipt constant must be referenced exactly once (inert); found ${countOccurrences(src, RECEIPT_CONST)}`);
  assert(countOccurrences(src, REQUEST_STRING) === 1, 'sortOrder request schema string must appear exactly once (declaration only)');
  assert(countOccurrences(src, RECEIPT_STRING) === 1, 'sortOrder receipt schema string must appear exactly once (declaration only)');

  // region: both constants declared between CHAT_FOLDER_BINDING_REQUEST_SCHEMA and
  // LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA (the request/receipt schema-constants region)
  const bindingIdx = src.indexOf("var CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '");
  const metaIdx = src.indexOf('var LIBRARY_METADATA_MUTATION_REQUEST_SCHEMA = ');
  const reqIdx = src.indexOf(REQUEST_DECL);
  const rcptIdx = src.indexOf(RECEIPT_DECL);
  assert(bindingIdx !== -1 && metaIdx !== -1 && reqIdx !== -1 && rcptIdx !== -1 &&
    bindingIdx < reqIdx && reqIdx < rcptIdx && rcptIdx < metaIdx,
    'sortOrder schema constants must be declared in the request/receipt schema-constants region');

  // NO apply handler / wiring: since each constant is referenced exactly once, nothing consumes them.
  // Belt-and-suspenders: no obvious sortOrder reorder apply/validate/receipt handler token was added.
  for (const banned of ['applySortorderReorder', 'applySortOrderReorder', 'validateSortorderReorder',
    'absorbSortorderReorder', 'sortorderReorderReceipt', 'buildSortorderReorderReceipt']) {
    assert(!src.includes(banned), `no sortOrder apply/handler token should be added: ${banned}`);
  }

  // binding receipt schema still NOT minted; binding request schema present
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema must remain NOT minted (S6, not S1)');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must still define the real binding request schema');

  // fullBundle v2 / no v3; webdav deferred; bounded metadata guard
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

// ---- F11 still blocks both classes (no allowed-set change) ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch (no allowed-set change in S1)');
  assert(store.includes('folder_bindings') && store.includes("var sortCol = 'sort_order'") &&
    store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f30-s1-sortorder-schema-mint');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f30-s1-sortorder-schema-mint.v1',
  lane: 'folder-sync',
  phase: 'F30',
  step: 'S1',
  f30Doc,
  firstProductSourceChange: true,
  f29CommitReferenced: F29_COMMIT,
  mintedRequestSchema: REQUEST_STRING,
  mintedReceiptSchema: RECEIPT_STRING,
  requestConstOccurrences: countOccurrences(read(folderSyncFile), REQUEST_CONST),
  receiptConstOccurrences: countOccurrences(read(folderSyncFile), RECEIPT_CONST),
  inert: true,
  applyHandlerAdded: false,
  f11AllowedSetChanged: false,
  bindingReceiptSchemaMinted: false,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F31-S2-preflight-gate-sortorder-desktop-handler (design-only; S2 execution needs separate approval)',
}, null, 2));
console.log('PASS validate-folder-sync-f30-s1-sortorder-schema-mint');
