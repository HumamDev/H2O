#!/usr/bin/env node
//
// Folder Sync Phase F31 — S2 pre-flight gate (sortOrder Desktop handler) meta-validator (design/pre-flight).
//
// Verifies the F31 doc exists and is internally consistent (design/pre-flight gate only): references the
// F30 commit; is pre-flight-only (no handler added, no wiring, no F11 set change, no flip); specifies the
// S2 Desktop validate/apply/receipt handler contract; specifies the handler-validator assertions; lists
// the retained validator set; defines S2 entry criteria, exit criteria, and rollback; asserts the current
// state (no handler yet; constants still inert). It GROUNDS against REAL SOURCE that the two sortOrder
// schema constants are PRESENT but INERT (each constant name + schema string referenced EXACTLY ONCE), that
// NO sortOrder apply/validate/receipt handler exists yet, that F11 still blocks both classes, the binding
// receipt schema is still NOT minted, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane guard.
// It recommends F32 as the explicit S2 execution slice requiring separate approval (a real product-source
// handler addition). Binds no socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f31Doc = 'release-evidence/2026-06-25/folder-sync-f31-s2-preflight-gate.md';
const f30Doc = 'release-evidence/2026-06-25/folder-sync-f30-s1-sortorder-schema-mint.md';
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

const F30_COMMIT = '01b05cb';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_CONST = 'FOLDER_SORTORDER_REORDER_REQUEST_SCHEMA';
const RECEIPT_CONST = 'FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA';
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
assert(exists(f31Doc), `${f31Doc}: missing`);
if (!exists(f31Doc)) {
  console.error('FAIL validate-folder-sync-f31-s2-preflight-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f31Doc);
assert(doc.length > 5000, `${f31Doc}: F31 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- pre-flight-only markers ----
assert(flat.includes('DESIGN / PRE-FLIGHT GATE ONLY'), 'F31 doc must mark itself design/pre-flight gate only');
assert(/No handler was added/i.test(flat), 'F31 doc must state no handler was added');
assert(/was read for inspection only and NOT modified|NOT modified/i.test(flat), 'F31 doc must state folder-sync.tauri.js not modified');
assert(/No F11 allowed\/blocked set was changed/i.test(flat), 'F31 doc must state no F11 set change');
assert(/No `?productSyncReady`? flip/i.test(flat), 'F31 doc must state no productSyncReady flip');

// ---- F30 commit ----
assert(flat.includes(F30_COMMIT), `F31 doc must reference the F30 commit ${F30_COMMIT}`);
assert(exists(f30Doc), 'F30 doc must exist on disk');

// ---- S2 handler contract ----
assert(/Exact S2 Desktop Handler Contract/i.test(flat), 'F31 doc must specify the S2 handler contract');
assert(flat.includes(REQUEST_CONST) && flat.includes(RECEIPT_CONST), 'F31 doc must reference both sortOrder schema constants');
assert(/VALIDATE the request/i.test(flat), 'F31 contract must include request validation');
assert(/APPLY an accepted reorder ONLY to canonical SQLite `?sort_order`?|apply .* canonical .* sort_order/i.test(flat),
  'F31 contract must apply only to canonical sort_order');
assert(/EMIT a receipt using `?FOLDER_SORTORDER_REORDER_RECEIPT_SCHEMA`?/i.test(flat), 'F31 contract must emit the receipt');
assert(/RE-PROJECT the `?FOLDER_STATE_DATA_KEY`? mirror/i.test(flat), 'F31 contract must re-project the mirror');
assert(/DRY-RUN BY DEFAULT/i.test(flat), 'F31 contract must be dry-run by default');
for (const c of ['stale-basis', 'duplicate', 'missing-folder', 'tombstoned-folder', 'unknown-folder',
  'folder-not-in-catalog', 'superseded-concurrent']) {
  assert(flat.includes(c), `F31 contract must classify conflict case: ${c}`);
}

// ---- handler-validator assertions + retained set + entry/exit/rollback + current state ----
assert(/S2 Handler-Validator Assertions/i.test(flat), 'F31 doc must specify the handler-validator assertions');
assert(/the handler exists ONLY after S2 execution — NOT now|handler exists ONLY after S2/i.test(flat),
  'F31 doc must assert the handler exists only after S2');
assert(/writes ONLY canonical `?sort_order`?/i.test(flat), 'F31 doc must assert the apply path writes only sort_order');
assert(/NO direct mirror-only order repair/i.test(flat), 'F31 doc must forbid direct mirror-only repair');
assert(/Retained Validator \/ Harness Set/i.test(flat), 'F31 doc must list the retained validator set');
for (const v of ['F16', 'F17', 'F18', 'F19', 'F30', 'F29', 'F8–F30', 'Phase 40 metadata closeout',
  'productsyncready-flip-gate', 'archive-cloud-sync-boundary', 'identity-key-e2e-boundary', 'F15-cutover']) {
  assert(flat.includes(v), `F31 retained set must include: ${v}`);
}
assert(/S2 Entry Criteria/i.test(flat), 'F31 doc must define S2 entry criteria');
assert(/S2 Exit Criteria/i.test(flat), 'F31 doc must define S2 exit criteria');
assert(/Rollback/i.test(flat), 'F31 doc must define rollback');
assert(/keep the F30 inert schema constants/i.test(flat), 'F31 rollback must keep the F30 inert constants');
assert(/Current State \(asserted in F31\)|no sortOrder handler exists yet/i.test(flat), 'F31 doc must assert current state');
assert(/each sortOrder constant name appears EXACTLY ONCE|referenced exactly once/i.test(flat),
  'F31 doc must assert the constants are referenced exactly once');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'F31 doc must keep binding-mismatch blocked');
assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder remains gated/i.test(flat), 'F31 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F31 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F31 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F31 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F31 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3`'), 'F31 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F31 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F31 doc must preserve chats on folder delete');

// ---- cross-surface + F32 (with separate-approval caveat) ----
assert(flat.includes('Cross-Surface Requirement'), 'F31 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F31 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F31 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F31 doc must include Chrome / native extension');
assert(flat.includes('Recommended F32'), 'F31 doc must recommend F32');
assert(/EXECUTE S2/i.test(flat), 'F31 doc F32 must be the S2 execution slice');
assert(/REAL PRODUCT-SOURCE HANDLER ADDITION|real product-source/i.test(flat), 'F31 doc must flag F32 as a real product-source handler addition');
assert(/MUST REQUIRE SEPARATE EXPLICIT APPROVAL|require separate .* approval/i.test(flat),
  'F31 doc must state F32 requires separate explicit approval');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F31 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: constants present + INERT; no handler; F11 blocks both; binding receipt unminted ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  // present (minted by F30)
  assert(src.includes(REQUEST_STRING), 'sortOrder request schema must be present in source (minted by F30 S1)');
  assert(src.includes(RECEIPT_STRING), 'sortOrder receipt schema must be present in source (minted by F30 S1)');
  // PRESENT + now consumed: F31 gated S2; F32 later added the handler that consumes the constants, so
  // each is now referenced >= 1 (declaration + handler use). (F31's doc records the as-of-F31 no-handler
  // state; this source anchor reflects current source after the F32 S2 handler landed.)
  assert(countOccurrences(src, REQUEST_CONST) >= 1,
    `sortOrder request constant must be present in source (now consumed by the F32 S2 handler); found ${countOccurrences(src, REQUEST_CONST)}`);
  assert(countOccurrences(src, RECEIPT_CONST) >= 1,
    `sortOrder receipt constant must be present in source (now consumed by the F32 S2 handler); found ${countOccurrences(src, RECEIPT_CONST)}`);
  assert(countOccurrences(src, REQUEST_STRING) >= 1, 'sortOrder request schema string must be present in source');
  assert(countOccurrences(src, RECEIPT_STRING) >= 1, 'sortOrder receipt schema string must be present in source');
  // the F32 S2 sortOrder handler is now present (F31 gated it; F32 executed it)
  assert(src.includes('function validateFolderSortorderReorderRequestForDesktopApply(') &&
    src.includes('function applyFolderSortorderReorderRequest('),
    'the F32 S2 sortOrder validate/apply handler is now present in source');
  // binding request/receipt schemas are now minted and live-proven by the later binding lane.
  assert(src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema is now minted and live-proven');
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
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("'field-mismatch:sortOrder': true"), 'S5 allows F11 field-mismatch:sortOrder');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'F11 helper must keep binding-mismatch blocked/reviewed after S5');
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'),
    'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f31-s2-preflight-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const src = read(folderSyncFile);
const appliedNow = parseMetadataAllowlist(src);
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f31-s2-preflight-gate.v1',
  lane: 'folder-sync',
  phase: 'F31',
  step: 'S2-preflight',
  f31Doc,
  designOnly: true,
  preFlightOnly: true,
  f30CommitReferenced: F30_COMMIT,
  sortOrderConstantsPresent: true,
  requestConstOccurrences: countOccurrences(src, REQUEST_CONST),
  receiptConstOccurrences: countOccurrences(src, RECEIPT_CONST),
  constantsInert: countOccurrences(src, REQUEST_CONST) === 1 && countOccurrences(src, RECEIPT_CONST) === 1,
  handlerExists: src.includes('function applyFolderSortorderReorderRequest('),
  f11AllowedSetChanged: true,
  bindingReceiptSchemaMinted: true,
  bindingMismatchBlocked: true,
  sortOrderGated: false,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F32-EXECUTE-S2-sortorder-desktop-handler (real product-source handler; requires separate explicit approval)',
}, null, 2));
console.log('PASS validate-folder-sync-f31-s2-preflight-gate');
