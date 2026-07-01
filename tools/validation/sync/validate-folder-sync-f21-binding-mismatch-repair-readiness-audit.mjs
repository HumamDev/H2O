#!/usr/bin/env node
//
// Folder Sync Phase F21 — binding-mismatch repair-loop readiness audit meta-validator (design/audit only).
//
// Verifies the F21 doc exists and is internally consistent (design/readiness audit only): references the
// F20 commit; is audit-only (no binding repair, no writes); audits the real chat-folder binding
// read/write paths (canonical SQLite folder_bindings, mirror FOLDER_STATE_DATA_KEY.items projection,
// export/import, native/Chrome participation); identifies the sanctioned request/receipt repair channel
// (chat-folder-binding-request.v1) grounded in source; classifies binding mismatch types; keeps Desktop
// SQLite canonical for bindings + mirror derived; blocks direct mirror-only repair and Chrome/native/
// mobile canonical mutation; keeps binding-mismatch blocked + field-mismatch:sortOrder gated; keeps the
// standing postures; carries cross-surface; recommends F22. It grounds the binding-path claims against
// REAL SOURCE (folder_bindings table + bindChat/unbindChat + CHAT_FOLDER_BINDING_REQUEST_SCHEMA), and
// asserts the sortOrder proposed schemas are NOT minted, F11 still blocks the two gated classes, WebDAV
// deferred, fullBundle v2, using a BOUNDED metadata-lane guard. Binds no socket; makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f21Doc = 'release-evidence/2026-06-25/folder-sync-f21-binding-mismatch-repair-readiness-audit.md';
const f20Doc = 'release-evidence/2026-06-25/folder-sync-f20-lane-status-readiness-ledger.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F20_COMMIT = 'aa4958e';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const MISMATCH_CLASSES = ['missing-mirror-item', 'extra-mirror-item', 'orphan-folder-binding',
  'orphan-chat-binding', 'tombstoned-folder-binding', 'duplicate-binding', 'cross-device-stale-proposal',
  'privacy-redaction-sensitive-payload'];
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
assert(exists(f21Doc), `${f21Doc}: missing`);
if (!exists(f21Doc)) {
  console.error('FAIL validate-folder-sync-f21-binding-mismatch-repair-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f21Doc);
assert(doc.length > 5000, `${f21Doc}: F21 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- audit-only markers ----
assert(flat.includes('DESIGN / READINESS AUDIT ONLY'), 'F21 doc must mark itself design/readiness audit only');
assert(flat.includes('No product source was modified'), 'F21 doc must state no product source modified');
assert(/No binding repair was implemented|No runtime behavior was changed/i.test(flat),
  'F21 doc must state no binding repair / no runtime change');
assert(/No chat was bound or unbound/i.test(flat), 'F21 doc must state no bind/unbind occurred');

// ---- F20 commit ----
assert(flat.includes(F20_COMMIT), `F21 doc must reference the F20 commit ${F20_COMMIT}`);
assert(exists(f20Doc), 'F20 doc must exist on disk');

// ---- binding read/write path audit ----
assert(flat.includes('folder_bindings'), 'F21 doc must audit the canonical folder_bindings table');
assert(/ONE-FOLDER-PER-CHAT|one-folder-per-chat|PRIMARY KEY \(chat_id\)/i.test(flat),
  'F21 doc must note one-folder-per-chat / PRIMARY KEY (chat_id)');
assert(/bindChat/.test(flat) && /unbindChat/.test(flat), 'F21 doc must audit bindChat/unbindChat writes');
assert(flat.includes('FOLDER_STATE_DATA_KEY') && /items/.test(flat), 'F21 doc must audit the mirror items projection');
assert(/export|import/i.test(flat), 'F21 doc must audit export/import binding projection');

// ---- sanctioned repair channel ----
assert(flat.includes(BINDING_REQUEST_SCHEMA), `F21 doc must identify the sanctioned channel ${BINDING_REQUEST_SCHEMA}`);
assert(/NO direct mirror-only binding repair|no direct mirror-only/i.test(flat),
  'F21 doc must block direct mirror-only binding repair');
assert(/NO Chrome \/ native \/ mobile canonical mutation|proposers never write/i.test(flat),
  'F21 doc must block Chrome/native/mobile canonical mutation');

// ---- classification ----
assert(/Binding Mismatch Classification/i.test(flat), 'F21 doc must classify binding mismatch types');
for (const cls of MISMATCH_CLASSES) assert(flat.includes(cls), `F21 doc must classify mismatch type: ${cls}`);

// ---- safe vs dangerous ----
assert(/SAFE TO OBSERVE ONLY/i.test(flat), 'F21 doc must define safe-to-observe drift');
assert(/UNSAFE TO AUTO-REPAIR/i.test(flat), 'F21 doc must define unsafe-to-auto-repair drift');
assert(/BLOCKED UNTIL RECEIPT-CONFIRMED DESKTOP APPLY|receipt-confirmed Desktop apply/i.test(flat),
  'F21 doc must block until receipt-confirmed Desktop apply');

// ---- ownership ----
assert(/Desktop SQLite `?folder_bindings`? is CANONICAL|Desktop SQLite .* canonical for chat-folder bindings/i.test(flat),
  'F21 doc must keep Desktop SQLite canonical for bindings');
assert(/DERIVED render projection/i.test(flat), 'F21 doc must keep the mirror a derived projection');
assert(/NON-CANONICAL proposers|non-canonical proposers/i.test(flat), 'F21 doc must keep Chrome/native/mobile non-canonical proposers');

// ---- required future gate ----
assert(/Required Future Gate Before Any Binding Repair/i.test(flat), 'F21 doc must define the required future gate');
for (const step of ['request envelope', 'Desktop VALIDATION', 'Desktop APPLY', 'RECEIPT', 'mirror RE-PROJECTION']) {
  assert(new RegExp(step, 'i').test(flat), `F21 doc gate must include: ${step}`);
}
assert(/NO chat delete/i.test(flat), 'F21 doc gate must include no chat delete');
assert(/NO folder delete\/purge/i.test(flat), 'F21 doc gate must include no folder delete/purge');
assert(/live dry-run proof/i.test(flat) && /controlled apply proof/i.test(flat) && /post-apply read-only .* drift probe/i.test(flat),
  'F21 doc gate must require dry-run + controlled apply + post-apply drift probe');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F21 doc must keep binding-mismatch blocked');
assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder`?: REMAINS GATED|field-mismatch:sortOrder remains gated/i.test(flat),
  'F21 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F21 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|blocked)/i.test(flat),
  'F21 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F21 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F21 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F21 doc must state no fullBundle.v3');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F21 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F21 doc must preserve chats on folder delete');

// ---- cross-surface + F22 ----
assert(flat.includes('Cross-Surface Requirement'), 'F21 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F21 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F21 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F21 doc must include Chrome / native extension');
assert(flat.includes('Recommended F22'), 'F21 doc must recommend F22');
assert(/binding repair request\/receipt loop SPECIFICATION|binding analog of the F15/i.test(flat),
  'F21 doc F22 must be the binding repair request/receipt loop spec');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F21 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: binding substrate present + sanctioned schema present ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes('folder_bindings'), 'source must contain the folder_bindings table');
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'source bindChat must INSERT OR REPLACE folder_bindings');
  assert(store.includes('DELETE FROM folder_bindings WHERE chat_id'), 'source unbindChat must DELETE from folder_bindings');
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the sanctioned chat-folder-binding request schema');
  assert(src.includes(SORTORDER_REQUEST_SCHEMA) && src.includes(SORTORDER_RECEIPT_SCHEMA),
    'sortOrder schemas now present in source (minted inert by F30 S1)');
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
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f21-binding-mismatch-repair-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f21-binding-mismatch-repair-readiness-audit.v1',
  lane: 'folder-sync',
  phase: 'F21',
  f21Doc,
  designOnly: true,
  f20CommitReferenced: F20_COMMIT,
  bindingCanonicalOwner: 'desktop-sqlite-folder_bindings',
  bindingMirror: 'FOLDER_STATE_DATA_KEY.items-derived-projection',
  sanctionedRepairChannel: BINDING_REQUEST_SCHEMA,
  mismatchClasses: MISMATCH_CLASSES,
  directMirrorOnlyRepairBlocked: true,
  chromeNativeMobileCanonicalMutationBlocked: true,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F22-binding-repair-request-receipt-loop-spec (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f21-binding-mismatch-repair-readiness-audit');
