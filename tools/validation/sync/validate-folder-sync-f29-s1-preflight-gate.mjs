#!/usr/bin/env node
//
// Folder Sync Phase F29 — S1 pre-flight gate (sortOrder schema mint) meta-validator (design/pre-flight).
//
// Verifies the F29 doc exists and is internally consistent (design/pre-flight gate only): references the
// F28 commit; is pre-flight-only (nothing minted, no schema added to source, no F11 set change, no flip);
// specifies the exact sortOrder request + receipt schema shapes S1 would mint (as specification text, not
// added to source); specifies the S1 source-validator assertions; lists the retained validator/harness
// set; defines S1 entry criteria, exit criteria, and rollback; asserts the current state (nothing minted).
// It GROUNDS against REAL SOURCE that the proposed sortOrder schemas AND the proposed binding receipt
// schema are NOT minted in product source, the binding request schema is present, F11 still blocks both
// classes, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane guard. It recommends F30 as the
// explicit S1 execution slice requiring separate approval (first product-source schema mint). Binds no
// socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f29Doc = 'release-evidence/2026-06-25/folder-sync-f29-s1-preflight-gate.md';
const f28Doc = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F28_COMMIT = '64dd692';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const REQUEST_FIELDS = ['requestId', 'sourcePeerId', 'surfaceKind', 'orderPayload', 'basisOrderingHash',
  'requestedOrderingHash', 'createdAt', 'idempotencyKey'];
const RECEIPT_FIELDS = ['requestId', 'status', 'reason', 'resultingOrderingHash', 'canonicalAuthority',
  'noDestructiveMutation', 'noFolderDelete', 'noFolderPurge', 'noChatDelete'];
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
assert(exists(f29Doc), `${f29Doc}: missing`);
if (!exists(f29Doc)) {
  console.error('FAIL validate-folder-sync-f29-s1-preflight-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f29Doc);
assert(doc.length > 5000, `${f29Doc}: F29 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- pre-flight-only markers ----
assert(flat.includes('DESIGN / PRE-FLIGHT GATE ONLY'), 'F29 doc must mark itself design/pre-flight gate only');
assert(flat.includes('No product source was modified'), 'F29 doc must state no product source modified');
assert(/Nothing was minted/i.test(flat), 'F29 doc must state nothing was minted');
assert(/No schema was added to product source/i.test(flat), 'F29 doc must state no schema added to source');
assert(/No F11 allowed\/blocked set was changed/i.test(flat), 'F29 doc must state no F11 set change');
assert(/No `?productSyncReady`? flip happened/i.test(flat), 'F29 doc must state no productSyncReady flip');

// ---- F28 commit ----
assert(flat.includes(F28_COMMIT), `F29 doc must reference the F28 commit ${F28_COMMIT}`);
assert(exists(f28Doc), 'F28 doc must exist on disk');

// ---- request schema shape ----
assert(/Exact sortOrder Request Schema Shape/i.test(flat), 'F29 doc must specify the request schema shape');
assert(flat.includes(SORTORDER_REQUEST_SCHEMA), 'F29 doc must name the sortOrder request schema');
for (const f of REQUEST_FIELDS) assert(flat.includes(f), `F29 doc request schema must specify field: ${f}`);
assert(/tokenized\/hashed|hash-only|redact/i.test(flat), 'F29 doc request schema must specify redaction');

// ---- receipt schema shape ----
assert(/Exact sortOrder Receipt Schema Shape/i.test(flat), 'F29 doc must specify the receipt schema shape');
assert(flat.includes(SORTORDER_RECEIPT_SCHEMA), 'F29 doc must name the sortOrder receipt schema');
for (const f of RECEIPT_FIELDS) assert(flat.includes(f), `F29 doc receipt schema must specify field: ${f}`);
assert(/`applied` \| `skipped` \| `rejected`|applied.*skipped.*rejected/i.test(flat),
  'F29 doc receipt must specify status applied/skipped/rejected');
assert(/canonicalAuthority`?: `?desktop-sqlite/i.test(flat), 'F29 doc receipt must specify canonicalAuthority desktop-sqlite');

// ---- S1 source-validator assertions ----
assert(/S1 Source-Validator Assertions/i.test(flat), 'F29 doc must specify the S1 source-validator assertions');
assert(/request schema constant exists/i.test(flat) && /receipt schema constant exists/i.test(flat),
  'F29 doc must require the schema constants exist exactly');
assert(/NO runtime apply handler is added in S1|no apply handler/i.test(flat), 'F29 doc must forbid an apply handler in S1');
assert(/NO F11 allowed-set change is made in S1|no F11 allowed-set change/i.test(flat), 'F29 doc must forbid an F11 allowed-set change in S1');
assert(/NO `?fullBundle\.v3`? is minted|no fullBundle\.v3/i.test(flat), 'F29 doc must forbid fullBundle.v3 in S1');
assert(/NO WebDAV \/ CAS \/ Chat Saving code is touched|no WebDAV\/CAS/i.test(flat), 'F29 doc must forbid WebDAV/CAS/Chat Saving in S1');

// ---- retained validator set ----
assert(/Retained Validator \/ Harness Set/i.test(flat), 'F29 doc must list the retained validator set');
for (const v of ['F16', 'F17', 'F18', 'F19', 'F8–F28', 'Phase 40', 'productsyncready flip gate',
  'archive-cloud-sync-boundary', 'identity-key-e2e-boundary', 'F15 cutover']) {
  assert(flat.includes(v), `F29 doc retained set must include: ${v}`);
}

// ---- entry/exit/rollback ----
assert(/S1 Entry Criteria/i.test(flat), 'F29 doc must define S1 entry criteria');
assert(/S1 Exit Criteria/i.test(flat), 'F29 doc must define S1 exit criteria');
assert(/Rollback/i.test(flat), 'F29 doc must define rollback');
assert(/remove ONLY the newly minted sortOrder schema constants|remove only the newly minted/i.test(flat),
  'F29 doc rollback must remove only the newly minted constants');
assert(/preserve ALL evidence\/ledger history|preserve all evidence/i.test(flat), 'F29 doc rollback must preserve evidence history');

// ---- current state ----
assert(/Current State \(asserted in F29\)|nothing is minted yet/i.test(flat), 'F29 doc must assert the current state');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'F29 doc must keep binding-mismatch blocked');
assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder remains gated/i.test(flat), 'F29 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F29 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F29 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F29 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F29 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F29 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F29 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F29 doc must preserve chats on folder delete');

// ---- cross-surface + F30 (with separate-approval caveat) ----
assert(flat.includes('Cross-Surface Requirement'), 'F29 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F29 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F29 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F29 doc must include Chrome / native extension');
assert(flat.includes('Recommended F30'), 'F29 doc must recommend F30');
assert(/EXECUTE S1|actually mint/i.test(flat), 'F29 doc F30 must be the S1 execution slice');
assert(/FIRST PRODUCT-SOURCE SCHEMA MINT|first product-source/i.test(flat), 'F29 doc must flag F30 as the first product-source mint');
assert(/MUST REQUIRE SEPARATE EXPLICIT APPROVAL|require separate .* approval/i.test(flat),
  'F29 doc must state F30 requires separate explicit approval');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F29 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: NOTHING minted; request present; F11 blocks both ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes(SORTORDER_REQUEST_SCHEMA), 'sortOrder request schema now present in source (minted inert by F30 S1, which F29 gated)');
  assert(src.includes(SORTORDER_RECEIPT_SCHEMA), 'sortOrder receipt schema now present in source (minted inert by F30 S1, which F29 gated)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'F29 pre-flight: binding receipt schema must NOT be minted in source');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the real binding request schema');
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
    'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'),
    'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f29-s1-preflight-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f29-s1-preflight-gate.v1',
  lane: 'folder-sync',
  phase: 'F29',
  f29Doc,
  designOnly: true,
  preFlightOnly: true,
  f28CommitReferenced: F28_COMMIT,
  specifiedRequestSchema: SORTORDER_REQUEST_SCHEMA,
  specifiedReceiptSchema: SORTORDER_RECEIPT_SCHEMA,
  anythingMinted: false,
  sortOrderRequestSchemaMinted: false,
  sortOrderReceiptSchemaMinted: false,
  bindingReceiptSchemaMinted: false,
  bindingRequestSchemaPresent: true,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F30-EXECUTE-S1-mint-sortorder-schemas (FIRST product-source mint; requires separate explicit approval)',
}, null, 2));
console.log('PASS validate-folder-sync-f29-s1-preflight-gate');
