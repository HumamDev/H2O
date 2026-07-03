#!/usr/bin/env node
//
// Folder Sync Phase F27 — lane status rollup v2 / consolidated readiness ledger meta-validator
// (design/readiness ledger only).
//
// Verifies the F27 doc exists and is internally consistent (design/readiness ledger only): references the
// F26 + F20 commits and the full lane lineage; is ledger-only (no runtime, no schema minting, no
// allowed/blocked-set change); consolidates the lane (source-of-truth split -> Desktop-SQLite-canonical
// -> render-mirror rebuild F10-F13 -> sortOrder ownership+absorption F14-F19 -> binding repair F21-F26);
// records the four drift-class postures with binding-mismatch now design+in-process-proven but still
// blocked and field-mismatch:sortOrder design+in-process-proven but still gated; lists the proven F8-F26
// lineage and the remaining-before-flip blockers; reaffirms the hard blocked boundaries; carries the
// cross-surface requirement; recommends F28. It grounds against REAL SOURCE that both proposed sortOrder
// schemas + the proposed binding receipt schema are NOT minted, the binding request schema is present,
// F11 still blocks both classes, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane guard.
// Binds no socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f27Doc = 'release-evidence/2026-06-25/folder-sync-f27-lane-status-readiness-ledger-v2.md';
const f26Doc = 'release-evidence/2026-06-25/folder-sync-f26-binding-repair-implementation-readiness-gate.md';
const f20Doc = 'release-evidence/2026-06-25/folder-sync-f20-lane-status-readiness-ledger.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5SortOrderFlipDoc = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F26_COMMIT = 'cc1985c';
const F20_COMMIT = 'aa4958e';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const DRIFT_CLASSES = ['missing-mirror-folder', 'field-mismatch:color', 'field-mismatch:sortOrder', 'binding-mismatch'];
const LANE_PHASES = ['F8', 'F9', 'F10', 'F11', 'F12A', 'F12B', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18',
  'F19', 'F21', 'F22', 'F23', 'F24', 'F25', 'F26'];
const LANE_COMMITS = ['cc1985c', '35e11ae', '5c3dd88', '84318d8', '6447b57', '358837c', '58781a0',
  'cc0bda9', '0a80b99', 'c3b24ba', '62c62b3', '44ace94', 'bc1a67e', '1776e17', '0a16f5a', 'e2b4281',
  '37ad6c7', '0f03357', '157d66a', 'aa4958e'];
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
assert(exists(f27Doc), `${f27Doc}: missing`);
if (!exists(f27Doc)) {
  console.error('FAIL validate-folder-sync-f27-lane-status-readiness-ledger-v2');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f27Doc);
assert(doc.length > 5000, `${f27Doc}: F27 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- ledger-only markers ----
assert(flat.includes('DESIGN / READINESS LEDGER ONLY'), 'F27 doc must mark itself design/readiness ledger only');
assert(flat.includes('No product source was modified'), 'F27 doc must state no product source modified');
assert(/No runtime behavior was changed/i.test(flat), 'F27 doc must state no runtime behavior changed');
assert(/No schema was minted/i.test(flat), 'F27 doc must state no schema minting');
assert(/No F11 allowed\/blocked set was changed|No .* allowed\/blocked set/i.test(flat),
  'F27 doc must state no F11 allowed/blocked-set change');

// ---- commit references + lineage ----
assert(flat.includes(F26_COMMIT), `F27 doc must reference the F26 commit ${F26_COMMIT}`);
assert(flat.includes(F20_COMMIT), `F27 doc must reference the F20 commit ${F20_COMMIT}`);
assert(exists(f26Doc), 'F26 doc must exist on disk');
assert(exists(f20Doc), 'F20 doc must exist on disk');
for (const p of LANE_PHASES) assert(flat.includes(p), `F27 doc must reference lane phase ${p}`);
for (const c of LANE_COMMITS) assert(flat.includes(c), `F27 doc must reference lane commit ${c}`);

// ---- lane consolidation ----
assert(/Source-of-truth split/i.test(flat), 'F27 doc must consolidate the source-of-truth split audit');
assert(/Desktop SQLite canonical/i.test(flat), 'F27 doc must record the Desktop SQLite canonical decision');
assert(/Render mirror rebuild \(F10.?F13\)|render mirror rebuild/i.test(flat), 'F27 doc must consolidate the render mirror rebuild');
assert(/sortOrder ownership \+ absorption \(F14.?F19\)|sortOrder ownership \+ absorption/i.test(flat),
  'F27 doc must consolidate the sortOrder sub-lane');
assert(/Binding repair \(F21.?F26\)|Binding repair/i.test(flat), 'F27 doc must consolidate the binding sub-lane');

// ---- four drift-class postures ----
for (const cls of DRIFT_CLASSES) assert(flat.includes(cls), `F27 doc must record drift class posture: ${cls}`);
assert(/`missing-mirror-folder`[^|]*HANDLED|missing-mirror-folder`?: handled/i.test(flat),
  'F27 doc must state missing-mirror-folder handled/idempotent');
assert(/`field-mismatch:color`[^|]*HANDLED|field-mismatch:color`?: handled/i.test(flat),
  'F27 doc must state field-mismatch:color handled/idempotent');
assert(/idempotent/i.test(flat), 'F27 doc must state the handled classes are idempotent');
if (exists(s5SortOrderFlipDoc)) {
  const s5 = read(s5SortOrderFlipDoc);
  assert(s5.includes('S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED'), 'S5 must supersede the historical sortOrder gated posture');
} else {
  assert(/field-mismatch:sortOrder`?[^.]*(GATED|gated|not started|unimplemented)/i.test(flat),
    'F27 doc must state field-mismatch:sortOrder gated/unimplemented in product runtime before S5');
}
// binding-mismatch: design + in-process proven but still blocked
assert(/binding-mismatch`?[^.]*(BLOCKED|blocked)/i.test(flat), 'F27 doc must state binding-mismatch blocked');
assert(/binding-mismatch[\s\S]*?(in-process|accepted\/negative proofs|design \+ in-process)/i.test(flat) ||
  /design \+ in-process accepted\/negative proofs complete \(F21.?F26\)/i.test(flat),
  'F27 doc must record binding-mismatch as design + in-process proven');

// ---- proven + remaining ----
assert(/Proven Lineage \(F8.?F26\)|Proven Lineage/i.test(flat), 'F27 doc must list the proven F8-F26 lineage');
assert(/What Remains Before productSyncReady Can Be Reviewed|What Remains Before/i.test(flat),
  'F27 doc must list what remains before productSyncReady review');
assert(/sortOrder product runtime implementation/i.test(flat), 'F27 doc must list sortOrder product runtime implementation as remaining');
assert(/binding product runtime implementation/i.test(flat), 'F27 doc must list binding product runtime implementation as remaining');
assert(/live Desktop dry-run proofs/i.test(flat) && /live Desktop controlled apply proofs/i.test(flat),
  'F27 doc must list the live Desktop proofs as remaining');
assert(/multi-device import/i.test(flat), 'F27 doc must list the multi-device import proof as remaining');
assert(/final `?productSyncReady`? flip review/i.test(flat), 'F27 doc must list the final flip review as remaining');

// ---- reaffirmed boundaries ----
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F27 doc must keep productSyncReady false');
assert(/public\/premium sync remains blocked/i.test(flat), 'F27 doc must keep public/premium blocked');
assert(/real remote WebDAV remains deferred/i.test(flat), 'F27 doc must keep real remote WebDAV deferred');
assert(/`fullBundle\.v3` NOT minted|no `?fullBundle\.v3`?/i.test(flat), 'F27 doc must state no fullBundle.v3');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|blocked)/i.test(flat),
  'F27 doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F27 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F27 doc must preserve chats on folder delete');

// ---- cross-surface + F28 ----
assert(flat.includes('Cross-Surface Requirement'), 'F27 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F27 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F27 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F27 doc must include Chrome / native extension');
assert(flat.includes('Recommended F28'), 'F27 doc must recommend F28');
assert(/SEQUENCING PLAN|sequencing plan|ordered .* implementation steps/i.test(flat),
  'F27 doc F28 must be the implementation sequencing plan');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F27 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: proposed schemas NOT minted; request present; F11 blocks both; substrate ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'proposed binding receipt schema must NOT be minted in source');
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
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes('folder_bindings'), 'source must contain the folder_bindings table');
  assert(store.includes("var sortCol = 'sort_order'"), 'source listFolders must order by the canonical sort_order column');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  if (exists(s5SortOrderFlipDoc)) {
    assert(store.includes("'field-mismatch:sortOrder': true"), 'source F11 helper must allow field-mismatch:sortOrder after S5');
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
      'source F11 helper must still block binding-mismatch after S5');
  } else {
    assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
      'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch before S5');
  }
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f27-lane-status-readiness-ledger-v2');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f27-lane-status-readiness-ledger-v2.v1',
  lane: 'folder-sync',
  phase: 'F27',
  f27Doc,
  designOnly: true,
  f26CommitReferenced: F26_COMMIT,
  f20CommitReferenced: F20_COMMIT,
  driftPosture: {
    'missing-mirror-folder': 'handled-applied-idempotent',
    'field-mismatch:color': 'handled-applied-idempotent',
    'field-mismatch:sortOrder': exists(s5SortOrderFlipDoc)
      ? 'desktop-sqlite-canonical-closed-allowed-after-s5'
      : 'desktop-sqlite-canonical-design-inprocess-proven-gated-unimplemented',
    'binding-mismatch': 'desktop-sqlite-folder_bindings-canonical-design-inprocess-proven-blocked-unimplemented',
  },
  provenPhases: LANE_PHASES,
  proposedSortOrderSchemasMinted: false,
  proposedBindingReceiptMinted: false,
  bindingRequestSchemaPresent: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F28-combined-product-runtime-implementation-sequencing-plan (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f27-lane-status-readiness-ledger-v2');
