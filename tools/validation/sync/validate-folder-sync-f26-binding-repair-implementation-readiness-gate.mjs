#!/usr/bin/env node
//
// Folder Sync Phase F26 — binding repair implementation-readiness gate meta-validator (design/readiness).
//
// Verifies the F26 doc exists and is internally consistent (design/readiness only): references the F25
// commit; is design/readiness-only (no runtime, no receipt schema minting, no binding-mismatch allowed-set
// change); enumerates the future implementation change list (mint the receipt schema, Desktop
// validate/apply/receipt handler over folder_bindings, apply bind/unbind/move to canonical only, emit
// receipt, re-project mirror items, only-then allow binding-mismatch into a reviewed repair path);
// separates proven prerequisites (F21-F25) from open blockers; records the readiness verdict (partially
// ready for scoped planning; binding-mismatch cannot join F11 now; productSyncReady NOT ready;
// public/premium blocked; Chat Saving CAS blocked); defines hard preconditions + future validation
// requirements; keeps the standing postures; carries cross-surface; recommends F27. It grounds against
// REAL SOURCE that the proposed receipt schema is NOT minted, the request schema + folder_bindings +
// bindChat/unbindChat are intact, F11 still blocks the two gated classes, the sortOrder proposed schemas
// are unminted, WebDAV deferred, fullBundle v2, using a BOUNDED metadata-lane guard. No socket; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f26Doc = 'release-evidence/2026-06-25/folder-sync-f26-binding-repair-implementation-readiness-gate.md';
const f25Doc = 'release-evidence/2026-06-25/folder-sync-f25-binding-repair-negative-apply-proof-harness.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const s5SortOrderFlipDoc = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const bindingImplementationEvidenceDoc = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-implementation.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F25_COMMIT = '358837c';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const PRIOR_PHASES = ['F21', 'F22', 'F23', 'F24', 'F25'];
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
assert(exists(f26Doc), `${f26Doc}: missing`);
if (!exists(f26Doc)) {
  console.error('FAIL validate-folder-sync-f26-binding-repair-implementation-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f26Doc);
assert(doc.length > 5000, `${f26Doc}: F26 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/readiness-only markers ----
assert(flat.includes('DESIGN / READINESS GATE ONLY'), 'F26 doc must mark itself design/readiness gate only');
assert(flat.includes('No product source was modified'), 'F26 doc must state no product source modified');
assert(/No binding receipt schema was minted in runtime source|No .* schema was minted/i.test(flat),
  'F26 doc must state no receipt schema minting');
assert(/was NOT added to the F11 allowed rebuild set|NOT added to the F11 allowed/i.test(flat),
  'F26 doc must state binding-mismatch not added to the F11 allowed set');

// ---- naming note ----
assert(/folder-sync-f26-\*/i.test(flat), 'F26 doc must note the folder-sync-f26-* naming');

// ---- F25 commit ----
assert(flat.includes(F25_COMMIT), `F26 doc must reference the F25 commit ${F25_COMMIT}`);
assert(exists(f25Doc), 'F25 doc must exist on disk');

// ---- future implementation change list ----
assert(/Future Implementation Change List/i.test(flat), 'F26 doc must include the future implementation change list');
assert(flat.includes(BINDING_RECEIPT_SCHEMA), 'F26 doc must name the receipt schema to mint');
assert(/Desktop binding-request VALIDATE\/APPLY\/RECEIPT handler|validate\/apply\/receipt handler/i.test(flat),
  'F26 doc must list the Desktop handler');
assert(/APPLY an approved `?bind`? \/ `?unbind`? \/ `?move`? to canonical SQLite `?folder_bindings`?|apply .* folder_bindings/i.test(flat),
  'F26 doc must list applying to canonical folder_bindings');
assert(/EMIT the receipt|emit the receipt/i.test(flat), 'F26 doc must list emitting the receipt');
assert(/RE-PROJECT `?FOLDER_STATE_DATA_KEY\.items`?|re-project .* FOLDER_STATE_DATA_KEY\.items/i.test(flat),
  'F26 doc must list re-projecting the mirror items');
assert(/allow `?binding-mismatch`? into a repair path|only behind the reviewed repair gate/i.test(flat),
  'F26 doc must list the gated binding-mismatch repair-path change');

// ---- proven vs open ----
assert(/Proven Prerequisites vs Open Blockers|Proven prerequisites/i.test(flat), 'F26 doc must separate proven vs open');
for (const p of PRIOR_PHASES) assert(flat.includes(p), `F26 doc must reference proven phase ${p}`);
assert(/Open blockers/i.test(flat), 'F26 doc must list open blockers');
assert(/live Desktop (dry-run|controlled apply) proof|live Desktop .* proof/i.test(flat),
  'F26 doc must list the live Desktop proof as an open blocker');
assert(/multi-device import/i.test(flat), 'F26 doc must list the multi-device import proof');

// ---- readiness verdict ----
assert(/implementation-readiness: PARTIALLY READY|PARTIALLY READY FOR SCOPED IMPLEMENTATION PLANNING/i.test(flat),
  'F26 doc must state implementation-readiness partially ready for scoped planning');
assert(/binding-mismatch` cannot join the F11 allowed set now|cannot join the F11 allowed set/i.test(flat),
  'F26 doc must state binding-mismatch cannot join the F11 allowed set now');
assert(/productSyncReady`?: NOT READY|productSyncReady` remains `false`|NOT READY \(remains `false`\)/i.test(flat),
  'F26 doc must state productSyncReady not ready');

// ---- hard preconditions + future validation requirements ----
assert(/Hard Preconditions Before Implementation/i.test(flat), 'F26 doc must define hard preconditions');
assert(/no live profile mutation without a dedicated/i.test(flat), 'F26 doc must require a dedicated live-proof phase');
assert(/no schema minting without validator coverage/i.test(flat), 'F26 doc must require validator coverage for schema minting');
assert(/one-folder-per-chat invariant PRESERVED|one-folder-per-chat/i.test(flat), 'F26 doc must preserve one-folder-per-chat');
assert(/Future Validation Requirements/i.test(flat), 'F26 doc must define future validation requirements');
assert(/live Desktop DRY-RUN proof/i.test(flat) && /CONTROLLED APPLY proof/i.test(flat),
  'F26 doc must require live dry-run + controlled apply proofs');
assert(/retained|RETAINED/i.test(flat), 'F26 doc must require the F24/F25 harnesses be retained');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F26 doc must keep binding-mismatch blocked');
if (exists(s5SortOrderFlipDoc)) {
  const s5 = read(s5SortOrderFlipDoc);
  assert(s5.includes('S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED'), 'S5 must supersede the historical sortOrder gated posture');
} else {
  assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder`?: REMAINS GATED|field-mismatch:sortOrder remains gated/i.test(flat),
    'F26 doc must keep field-mismatch:sortOrder gated before S5');
}
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F26 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F26 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F26 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked|public\/premium sync: BLOCKED/i.test(flat),
  'F26 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F26 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F26 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F26 doc must preserve chats on folder delete');

// ---- cross-surface + F27 ----
assert(flat.includes('Cross-Surface Requirement'), 'F26 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F26 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F26 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F26 doc must include Chrome / native extension');
assert(flat.includes('Recommended F27'), 'F26 doc must recommend F27');
assert(/status rollup|readiness ledger|consolidated/i.test(flat), 'F26 doc F27 must be the lane status rollup / readiness ledger');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F26 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: receipt NOT minted; request present; substrate intact; F11 blocks both ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  if (exists(bindingImplementationEvidenceDoc)) {
    const implementationEvidence = read(bindingImplementationEvidenceDoc);
    assert(implementationEvidence.includes('BINDING-MISMATCH REPAIR IMPLEMENTED_AND_PROVEN'),
      'binding implementation evidence must record implemented/proven verdict');
    assert(src.includes("CHAT_FOLDER_BINDING_RECEIPT_SCHEMA = '" + BINDING_RECEIPT_SCHEMA + "'"),
      'binding receipt schema must be minted by the later binding implementation');
    assert(src.includes('bindingMismatchAllowed: false'),
      'binding-mismatch must remain blocked after binding implementation');
  } else {
    assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'F26 readiness-only: proposed binding receipt schema must NOT be minted in source');
  }
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
  assert(store.includes('INSERT OR REPLACE INTO folder_bindings'), 'source bindChat must INSERT OR REPLACE folder_bindings');
  assert(store.includes('DELETE FROM folder_bindings WHERE chat_id'), 'source unbindChat must DELETE from folder_bindings');
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
  console.error('FAIL validate-folder-sync-f26-binding-repair-implementation-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f26-binding-repair-implementation-readiness-gate.v1',
  lane: 'folder-sync',
  phase: 'F26',
  f26Doc,
  designOnly: true,
  f25CommitReferenced: F25_COMMIT,
  implementationReadiness: 'partially-ready-for-scoped-planning',
  proposedReceiptMintedInSource: exists(bindingImplementationEvidenceDoc),
  bindingMismatchInF11AllowedSet: false,
  provenPrerequisites: PRIOR_PHASES,
  openBlockers: ['product-runtime-implementation', 'receipt-schema-source-minting', 'desktop-handler-implementation',
    'live-desktop-dry-run-proof', 'live-desktop-controlled-apply-proof', 'chrome-native-mobile-request-submission',
    'multi-device-import-proof', 'f11-blocked-set-change-behind-repair-gate'],
  bindingMismatchBlocked: true,
  sortOrderGated: !exists(s5SortOrderFlipDoc),
  sortOrderSupersededByS5: exists(s5SortOrderFlipDoc),
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F27-folder-sync-lane-status-rollup-v2-readiness-ledger (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f26-binding-repair-implementation-readiness-gate');
