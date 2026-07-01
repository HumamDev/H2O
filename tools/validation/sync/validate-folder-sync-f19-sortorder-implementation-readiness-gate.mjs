#!/usr/bin/env node
//
// Folder Sync Phase F19 — sortOrder absorption implementation-readiness gate meta-validator
// (design/readiness only).
//
// Verifies the F19 doc exists and is internally consistent (design/readiness only): references the F18
// commit; is design/readiness-only (no runtime, no schema minting, no sortOrder allowed-set expansion);
// enumerates the future implementation change list (mint the two schemas, Desktop validate/apply handler,
// apply to canonical sort_order, emit receipt, re-project mirror, only-then allow field-mismatch:sortOrder
// into the F11 set); separates proven prerequisites (F14-F18) from open blockers; records the readiness
// verdict (partially ready for scoped planning; productSyncReady NOT ready; public/premium blocked; Chat
// Saving CAS blocked); defines hard preconditions + future validation requirements; keeps binding-mismatch
// blocked; keeps the standing postures; carries the cross-surface requirement; recommends F20. It grounds
// against REAL SOURCE that the proposed schemas are NOT minted, F11 still blocks field-mismatch:sortOrder,
// sort_order stays canonical, WebDAV stays deferred, fullBundle stays v2, using a BOUNDED metadata-lane
// guard. Binds no socket; makes no network call; performs no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f19Doc = 'release-evidence/2026-06-25/folder-sync-f19-sortorder-implementation-readiness-gate.md';
const f18Doc = 'release-evidence/2026-06-25/folder-sync-f18-sortorder-negative-apply-proof-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F18_COMMIT = '62c62b3';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const PRIOR_PHASES = ['F14', 'F15', 'F16', 'F17', 'F18'];
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
assert(exists(f19Doc), `${f19Doc}: missing`);
if (!exists(f19Doc)) {
  console.error('FAIL validate-folder-sync-f19-sortorder-implementation-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f19Doc);
assert(doc.length > 5000, `${f19Doc}: F19 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/readiness-only markers ----
assert(flat.includes('DESIGN / READINESS GATE ONLY'), 'F19 doc must mark itself design/readiness gate only');
assert(flat.includes('No product source was modified'), 'F19 doc must state no product source modified');
assert(/No request\/receipt schema was minted in runtime source|No .* schema was minted/i.test(flat),
  'F19 doc must state no schema minting');
assert(/was NOT added to the F11 allowed rebuild set|NOT added to the F11 allowed/i.test(flat),
  'F19 doc must state sortOrder not added to the F11 allowed set');

// ---- collision note ----
assert(/folder-sync-f19-\*|distinct from the pre-existing/i.test(flat) && /validate-f19-sync-hardening/i.test(flat),
  'F19 doc must note it is distinct from the pre-existing validate-f19-sync-hardening');

// ---- F18 commit reference ----
assert(flat.includes(F18_COMMIT), `F19 doc must reference the F18 commit ${F18_COMMIT}`);
assert(exists(f18Doc), 'F18 doc must exist on disk');

// ---- future implementation change list ----
assert(/Future Implementation Change List/i.test(flat), 'F19 doc must include the future implementation change list');
assert(flat.includes(REQUEST_SCHEMA) && flat.includes(RECEIPT_SCHEMA), 'F19 doc must name both proposed schemas to mint');
assert(/Desktop reorder-request VALIDATE\/APPLY handler|validate\/apply handler/i.test(flat),
  'F19 doc must list the Desktop validate/apply handler');
assert(/APPLY an accepted reorder to canonical SQLite `?sort_order`?|apply .* canonical .* sort_order/i.test(flat),
  'F19 doc must list applying to canonical sort_order');
assert(/EMIT the receipt|emit the receipt/i.test(flat), 'F19 doc must list emitting the receipt');
assert(/RE-PROJECT the `?FOLDER_STATE_DATA_KEY`? mirror|re-project the .* mirror/i.test(flat),
  'F19 doc must list re-projecting the mirror');
assert(/allow `?field-mismatch:sortOrder`? into the F11 allowed|only behind the absorption gate/i.test(flat),
  'F19 doc must list the gated F11 allowed-set update');

// ---- proven vs open ----
assert(/Proven Prerequisites vs Open Blockers|Proven prerequisites/i.test(flat), 'F19 doc must separate proven vs open');
for (const p of PRIOR_PHASES) assert(flat.includes(p), `F19 doc must reference proven phase ${p}`);
assert(/Open blockers/i.test(flat), 'F19 doc must list open blockers');
assert(/live Desktop (dry-run|controlled apply) proof|live Desktop .* proof/i.test(flat),
  'F19 doc must list the live Desktop proof as an open blocker');
assert(/multi-device import read-only proof|multi-device import/i.test(flat), 'F19 doc must list the multi-device import proof');

// ---- readiness verdict ----
assert(/implementation-readiness: PARTIALLY READY|PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING/i.test(flat),
  'F19 doc must state implementation-readiness partially ready for scoped planning');
assert(/productSyncReady`?: NOT READY|productSyncReady` remains `false`|NOT READY \(remains `false`\)/i.test(flat),
  'F19 doc must state productSyncReady not ready');

// ---- hard preconditions + future validation requirements ----
assert(/Hard Preconditions Before Implementation/i.test(flat), 'F19 doc must define hard preconditions');
assert(/no live profile mutation without a dedicated/i.test(flat), 'F19 doc must require a dedicated live-proof phase');
assert(/no schema minting without validator coverage/i.test(flat), 'F19 doc must require validator coverage for schema minting');
assert(/no lost folder order/i.test(flat), 'F19 doc must include the no-lost-folder-order invariant');
assert(/Validation Requirements for Future Implementation/i.test(flat), 'F19 doc must define future validation requirements');
assert(/live Desktop DRY-RUN proof/i.test(flat) && /CONTROLLED APPLY proof/i.test(flat),
  'F19 doc must require live dry-run + controlled apply proofs');
assert(/IMPORT read-only proof/i.test(flat), 'F19 doc must require a Chrome/native/mobile import read-only proof');

// ---- binding + postures ----
assert(/binding-mismatch[^.]*(BLOCKED|blocked)/i.test(flat), 'F19 doc must keep binding-mismatch blocked');
assert(/field-mismatch:sortOrder/.test(flat) && /gated|GATED|blocks it|NOT NOW/i.test(flat),
  'F19 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F19 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F19 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F19 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked|public\/premium sync: BLOCKED/i.test(flat),
  'F19 doc must keep public/premium blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F19 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F19 doc must preserve chats on folder delete');

// ---- cross-surface + F20 ----
assert(flat.includes('Cross-Surface Requirement'), 'F19 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F19 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F19 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F19 doc must include Chrome / native extension');
assert(flat.includes('Recommended F20'), 'F19 doc must recommend F20');
assert(/status rollup|readiness ledger|consolidated/i.test(flat), 'F19 doc F20 must be the lane status rollup / readiness ledger');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F19 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: proposed schemas NOT minted; F11 blocks sortOrder; sort_order canonical ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(!src.includes(REQUEST_SCHEMA), 'F19 readiness-only: proposed request schema must NOT be minted in source');
  assert(!src.includes(RECEIPT_SCHEMA), 'F19 readiness-only: proposed receipt schema must NOT be minted in source');
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
    'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch (not added to allowed set)');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f19-sortorder-implementation-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f19-sortorder-implementation-readiness-gate.v1',
  lane: 'folder-sync',
  phase: 'F19',
  f19Doc,
  designOnly: true,
  f18CommitReferenced: F18_COMMIT,
  implementationReadiness: 'partially-ready-for-scoped-planning',
  proposedSchemasMintedInSource: false,
  sortOrderInF11AllowedSet: false,
  provenPrerequisites: PRIOR_PHASES,
  openBlockers: ['product-runtime-implementation', 'live-desktop-dry-run-proof', 'live-desktop-controlled-apply-proof',
    'chrome-native-mobile-request-submission', 'multi-device-import-proof', 'f11-allowed-set-update-behind-gate'],
  bindingMismatchBlocked: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F20-folder-sync-lane-status-rollup-readiness-ledger (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f19-sortorder-implementation-readiness-gate');
