#!/usr/bin/env node
//
// Folder Sync Phase F20 — lane status rollup / consolidated readiness ledger meta-validator
// (design/readiness ledger only).
//
// Verifies the F20 doc exists and is internally consistent (design/readiness ledger only): references the
// F19 commit and the full lane lineage; is ledger-only (no runtime change, no schema minting, no sortOrder
// allowed-set expansion); consolidates the lane (source-of-truth split -> Desktop-SQLite-canonical ->
// render-mirror rebuild F10-F13 -> sortOrder ownership+absorption F14-F19); records the four active
// drift-class postures (missing-mirror-folder + field-mismatch:color handled/idempotent;
// field-mismatch:sortOrder gated/unimplemented; binding-mismatch blocked); lists the proven prerequisites
// (F8-F19) and the remaining-before-flip blockers; reaffirms the hard blocked boundaries; carries the
// cross-surface requirement; recommends F21. It grounds against REAL SOURCE that the proposed schemas are
// NOT minted, F11 still blocks field-mismatch:sortOrder, sort_order stays canonical, WebDAV stays
// deferred, fullBundle stays v2, using a BOUNDED metadata-lane guard. Binds no socket; makes no network
// call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f20Doc = 'release-evidence/2026-06-25/folder-sync-f20-lane-status-readiness-ledger.md';
const f19Doc = 'release-evidence/2026-06-25/folder-sync-f19-sortorder-implementation-readiness-gate.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F19_COMMIT = '44ace94';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const DRIFT_CLASSES = ['missing-mirror-folder', 'field-mismatch:color', 'field-mismatch:sortOrder', 'binding-mismatch'];
const LANE_PHASES = ['F8', 'F9', 'F10', 'F11', 'F12A', 'F12B', 'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19'];
const LANE_COMMITS = ['44ace94', '62c62b3', 'c3b24ba', '0a80b99', 'cc0bda9', '58781a0', '37ad6c7',
  'e2b4281', '0a16f5a', '1776e17', 'bc1a67e', '157d66a', '0f03357'];
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
assert(exists(f20Doc), `${f20Doc}: missing`);
if (!exists(f20Doc)) {
  console.error('FAIL validate-folder-sync-f20-lane-status-readiness-ledger');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f20Doc);
assert(doc.length > 5000, `${f20Doc}: F20 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- ledger-only markers ----
assert(flat.includes('DESIGN / READINESS LEDGER ONLY'), 'F20 doc must mark itself design/readiness ledger only');
assert(flat.includes('No product source was modified'), 'F20 doc must state no product source modified');
assert(/No runtime behavior was changed/i.test(flat), 'F20 doc must state no runtime behavior changed');
assert(/No sortOrder request\/receipt schema was minted|No .* schema was minted/i.test(flat),
  'F20 doc must state no schema minting');
assert(/was NOT added to the F11 allowed rebuild set|NOT added to the F11 allowed/i.test(flat),
  'F20 doc must state sortOrder not added to the F11 allowed set');

// ---- F19 commit + lineage ----
assert(flat.includes(F19_COMMIT), `F20 doc must reference the F19 commit ${F19_COMMIT}`);
assert(exists(f19Doc), 'F19 doc must exist on disk');
for (const p of LANE_PHASES) assert(flat.includes(p), `F20 doc must reference lane phase ${p}`);
for (const c of LANE_COMMITS) assert(flat.includes(c), `F20 doc must reference lane commit ${c}`);

// ---- lane consolidation ----
assert(/Source-of-truth split/i.test(flat), 'F20 doc must consolidate the source-of-truth split audit');
assert(/Desktop SQLite canonical/i.test(flat), 'F20 doc must record the Desktop SQLite canonical decision');
assert(/Render mirror rebuild \(F10.?F13\)|render mirror rebuild/i.test(flat), 'F20 doc must consolidate the render mirror rebuild');
assert(/sortOrder ownership \+ absorption \(F14.?F19\)|sortOrder ownership \+ absorption/i.test(flat),
  'F20 doc must consolidate the sortOrder ownership + absorption phases');

// ---- four drift-class postures ----
for (const cls of DRIFT_CLASSES) assert(flat.includes(cls), `F20 doc must record drift class posture: ${cls}`);
assert(/`missing-mirror-folder`[^|]*HANDLED|missing-mirror-folder`?: handled/i.test(flat),
  'F20 doc must state missing-mirror-folder handled/idempotent');
assert(/`field-mismatch:color`[^|]*HANDLED|field-mismatch:color`?: handled/i.test(flat),
  'F20 doc must state field-mismatch:color handled/idempotent');
assert(/idempotent/i.test(flat), 'F20 doc must state the handled classes are idempotent');
assert(/field-mismatch:sortOrder`?[^.]*(GATED|gated|not started|unimplemented)/i.test(flat),
  'F20 doc must state field-mismatch:sortOrder gated/unimplemented in product runtime');
assert(/`binding-mismatch`[^|]*BLOCKED|binding-mismatch`?: blocked/i.test(flat),
  'F20 doc must state binding-mismatch blocked');

// ---- proven + remaining ----
assert(/What Is Proven/i.test(flat), 'F20 doc must list what is proven');
assert(/What Remains Before productSyncReady Can Be Reviewed|What Remains Before/i.test(flat),
  'F20 doc must list what remains before productSyncReady review');
assert(/live Desktop dry-run proof/i.test(flat) && /live Desktop controlled apply proof/i.test(flat),
  'F20 doc must list the live Desktop proofs as remaining');
assert(/multi-device import/i.test(flat), 'F20 doc must list the multi-device import proof as remaining');
assert(/binding-mismatch` repair \/ request-loop|binding-mismatch repair/i.test(flat),
  'F20 doc must list the binding-mismatch repair as remaining');

// ---- reaffirmed boundaries ----
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F20 doc must keep productSyncReady false');
assert(/public\/premium sync remains blocked/i.test(flat), 'F20 doc must keep public/premium blocked');
assert(/real remote WebDAV remains deferred/i.test(flat), 'F20 doc must keep real remote WebDAV deferred');
assert(/`fullBundle\.v3` NOT minted|no `?fullBundle\.v3`?/i.test(flat), 'F20 doc must state no fullBundle.v3');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|blocked)/i.test(flat),
  'F20 doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F20 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F20 doc must preserve chats on folder delete');

// ---- cross-surface + F21 ----
assert(flat.includes('Cross-Surface Requirement'), 'F20 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F20 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F20 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F20 doc must include Chrome / native extension');
assert(flat.includes('Recommended F21'), 'F20 doc must recommend F21');
assert(/binding-mismatch` repair readiness audit|binding-mismatch repair readiness/i.test(flat),
  'F20 doc F21 must be the binding-mismatch repair readiness audit');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F20 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: proposed schemas NOT minted; F11 blocks sortOrder; sort_order canonical ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes(REQUEST_SCHEMA), 'sortOrder request schema now present in source (minted inert by F30 S1)');
  assert(src.includes(RECEIPT_SCHEMA), 'sortOrder receipt schema now present in source (minted inert by F30 S1)');
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
  assert(store.includes("'field-mismatch:sortOrder': true"),
    'S5 flipped field-mismatch:sortOrder into the F11 allowed set');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'source F11 helper keeps binding-mismatch blocked/reviewed after S5');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f20-lane-status-readiness-ledger');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f20-lane-status-readiness-ledger.v1',
  lane: 'folder-sync',
  phase: 'F20',
  f20Doc,
  designOnly: true,
  f19CommitReferenced: F19_COMMIT,
  driftPosture: {
    'missing-mirror-folder': 'handled-applied-idempotent',
    'field-mismatch:color': 'handled-applied-idempotent',
    'field-mismatch:sortOrder': 'desktop-sqlite-canonical-designed-inprocess-proven-gated-unimplemented',
    'binding-mismatch': 'blocked-separate-repair-loop',
  },
  provenPhases: LANE_PHASES,
  proposedSchemasMintedInSource: false,
  sortOrderInF11AllowedSet: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F21-binding-mismatch-repair-readiness-audit (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f20-lane-status-readiness-ledger');
