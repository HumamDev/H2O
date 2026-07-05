#!/usr/bin/env node
//
// Folder Sync Phase F14 — sortOrder canonical-ownership decision meta-validator (design/audit only).
//
// Verifies the F14 doc exists and is internally consistent (design/decision only): references the F13
// commit; is design/audit-only (no sortOrder implementation, no writes); audits the real sortOrder
// read/write paths (SQLite sort_order canonical, FOLDER_STATE_DATA_KEY mirror projection, native owner,
// export/import, F11 deletes sortOrder from rebuilt rows); DECIDES a canonical ownership model among the
// four options and names the chosen one (Desktop SQLite canonical); specifies the native-reorder
// absorption path that does NOT make Chrome/mobile canonical; classifies safe vs dangerous sortOrder
// drift; states whether field-mismatch:sortOrder can ever join the allowed rebuild set and the required
// gate; keeps binding-mismatch blocked/out-of-scope; keeps productSyncReady false, public/premium
// blocked, real remote WebDAV deferred, Chat Saving WebDAV/cloud/archive CAS blocked; carries the
// cross-surface (Desktop + Chrome/native multi-device + mobile) requirement; and recommends F15. It
// grounds the audit against REAL SOURCE (the committed F11 helper + folder substrate + a BOUNDED
// metadata-lane guard). Binds no socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f14Doc = 'release-evidence/2026-06-25/folder-sync-f14-sortorder-ownership-decision.md';
const f13Doc = 'release-evidence/2026-06-25/folder-sync-f13-mirror-rebuild-sustained-parity-proof.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F13_COMMIT = '37ad6c7';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const OWNERSHIP_OPTIONS = ['Desktop SQLite canonical', 'Chrome / native-owner', 'Hybrid / request-loop', 'deferred'];
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
assert(exists(f14Doc), `${f14Doc}: missing`);
if (!exists(f14Doc)) {
  console.error('FAIL validate-folder-sync-f14-sortorder-ownership-decision');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f14Doc);
assert(doc.length > 5000, `${f14Doc}: F14 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit-only markers ----
assert(flat.includes('DESIGN / AUDIT / DECISION ONLY'), 'F14 doc must mark itself design/audit/decision only');
assert(flat.includes('No product source was modified'), 'F14 doc must state no product source modified');
assert(/No sortOrder implementation was done|No runtime behavior was implemented|No sortOrder repair was performed/i.test(flat),
  'F14 doc must state no sortOrder implementation was done');
assert(/No mirror write|no mirror write/i.test(flat), 'F14 doc must state no mirror write');

// ---- F13 commit reference ----
assert(flat.includes(F13_COMMIT), `F14 doc must reference the F13 commit ${F13_COMMIT}`);
assert(exists(f13Doc), 'F13 evidence doc must exist on disk');

// ---- discusses field-mismatch:sortOrder ----
assert(flat.includes('field-mismatch:sortOrder'), 'F14 doc must discuss field-mismatch:sortOrder');
assert(flat.includes('sortOrder') || flat.includes('sort_order'), 'F14 doc must discuss sortOrder');

// ---- ownership option audit + a named recommendation ----
for (const opt of OWNERSHIP_OPTIONS) assert(flat.includes(opt), `F14 doc must identify ownership option: ${opt}`);
assert(/DECISION: \*\*Desktop SQLite is CANONICAL/i.test(flat) || flat.includes('Desktop SQLite is CANONICAL for folder') ||
  /sortOrder canonical owner: Desktop SQLite/i.test(flat),
  'F14 doc must recommend a specific ownership model (Desktop SQLite canonical)');

// ---- source path audit named ----
assert(flat.includes('sort_order'), 'F14 doc must audit the SQLite sort_order column');
assert(flat.includes('FOLDER_STATE_DATA_KEY'), 'F14 doc must audit the FOLDER_STATE_DATA_KEY mirror ordering');
assert(/native|Chrome/i.test(flat) && flat.includes('non-canonical'), 'F14 doc must audit native/Chrome ordering as non-canonical');
assert(/export|import/i.test(flat), 'F14 doc must audit export/import projection ordering');
assert(/f11BuildRenderMirrorFolderRow|deletes `?sortOrder`?|delete next.sortOrder/i.test(flat),
  'F14 doc must note F11 does not touch sortOrder (deletes it from rebuilt rows)');

// ---- native reorder reconciliation without accidental canonical promotion ----
assert(/absorb|absorption|request\s*\/\s*receipt|request\/receipt|reconcile/i.test(flat),
  'F14 doc must specify the native-reorder absorption / reconciliation path');
assert(/never becomes the authority|does not make Chrome or mobile canonical|never writes canonical order directly|without accidental canonical/i.test(flat),
  'F14 doc must keep Chrome/mobile from becoming canonical accidentally');

// ---- safe drift classification ----
for (const marker of ['display-only drift', 'Stale mirror drift', 'Native reorder pending absorption', 'True canonical mismatch']) {
  assert(flat.includes(marker), `F14 doc must classify drift case: ${marker}`);
}

// ---- can it join the allowed rebuild set + gate ----
assert(/CONDITIONALLY YES|Can .*field-mismatch:sortOrder.* Ever Join|NOT NOW/i.test(flat),
  'F14 doc must state whether sortOrder can join the allowed rebuild set');
assert(/Required Gate Before Any sortOrder Rebuild|required gate/i.test(flat), 'F14 doc must define the required gate');
assert(/no lost folder order/i.test(flat), 'F14 doc must include the no-lost-folder-order invariant');
assert(/live proof/i.test(flat), 'F14 doc must require a live proof before sortOrder rebuild');

// ---- binding blocked/out of scope ----
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F14 doc must keep binding-mismatch blocked');
assert(/out of scope|OUT OF SCOPE/i.test(flat), 'F14 doc must keep binding repair out of scope');

// ---- postures ----
assert(/productSyncReady` remains `false`|productSyncReady`?: remains `?false|productSyncReady` remains `?false`?|NOT READY TO FLIP/i.test(flat) ||
  flat.includes('productSyncReady` remains `false`'), 'F14 doc must keep productSyncReady false');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F14 doc must state no fullBundle.v3');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F14 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*(deferred)/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F14 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked|public\/premium sync: blocked/i.test(flat),
  'F14 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F14 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F14 doc must preserve chats on folder delete');
assert(/Desktop remains canonical/i.test(flat), 'F14 doc must keep Desktop canonical by default');

// ---- cross-surface ----
assert(flat.includes('Cross-Surface Requirement'), 'F14 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F14 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F14 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F14 doc must include Chrome / native extension');

// ---- F15 recommendation ----
assert(flat.includes('Recommended F15'), 'F14 doc must recommend F15');
assert(/absorption|request-receipt|request\/receipt/i.test(flat), 'F14 doc F15 must be the sortOrder absorption / request-receipt spec');
assert(/design-only|no writes|writes nothing/i.test(flat), 'F14 doc F15 must be design-only / no writes');

// ---- metadata core named ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F14 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: sortOrder audit anchors + F11 helper intact ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the sort_order column (canonical)');
  assert(store.includes('sortOrder: Number(folder.sortOrder) || 0'), 'source must project sortOrder into the render mirror');
  assert(store.includes('delete next.sortOrder;') && store.includes('delete next.sort_order;'),
    'source F11 rebuild row builder must delete sortOrder (never writes mirror ordering)');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("'field-mismatch:sortOrder': true"),
    'S5 flipped field-mismatch:sortOrder into the F11 allowed set');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'source F11 helper keeps binding-mismatch blocked/reviewed after S5');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}

// ---- REAL SOURCE: fullBundle v2/no-v3; WebDAV deferred; bounded metadata guard ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
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
  console.error('FAIL validate-folder-sync-f14-sortorder-ownership-decision');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f14-sortorder-ownership-decision.v1',
  lane: 'folder-sync',
  phase: 'F14',
  f14Doc,
  designOnly: true,
  f13CommitReferenced: F13_COMMIT,
  sortOrderCanonicalOwner: 'desktop-sqlite',
  renderMirror: 'FOLDER_STATE_DATA_KEY-derived-projection',
  nativeReorderPath: 'request-receipt-absorption-into-sqlite (Chrome/mobile stay non-canonical)',
  sortOrderCanJoinRebuildLater: 'conditional-after-gate',
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F15-sortOrder-absorption-request-receipt-spec (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f14-sortorder-ownership-decision');
