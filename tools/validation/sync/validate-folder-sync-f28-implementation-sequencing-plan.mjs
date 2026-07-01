#!/usr/bin/env node
//
// Folder Sync Phase F28 — combined product-runtime implementation sequencing plan meta-validator
// (design/plan only).
//
// Verifies the F28 doc exists and is internally consistent (design/plan only): references the F27 commit;
// is plan-only (nothing implemented, no schema minted, no F11 allowed/blocked-set change, no flip);
// enumerates the ordered, individually-gated steps S1-S14 (sortOrder schema mint + validator; sortOrder
// Desktop handler; sortOrder live dry-run; sortOrder controlled apply + drift probe; F11 sortOrder
// allowed-set change behind the absorption gate; binding receipt schema mint + validator; binding Desktop
// handler; binding live dry-run; binding controlled apply + drift probe; move binding-mismatch into the
// reviewed repair path; Chrome/native/mobile submission proofs; multi-device import proofs; sustained
// parity; final productSyncReady flip review); confirms each S-step carries entry + exit criteria +
// preserved invariants; lists the required invariants; keeps the standing postures; carries cross-surface;
// recommends F29. It grounds against REAL SOURCE that the proposed sortOrder + binding receipt schemas are
// NOT minted, the binding request schema is present, F11 still blocks both classes, WebDAV deferred,
// fullBundle v2, using a BOUNDED metadata-lane guard. Binds no socket; makes no network call; no write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f28Doc = 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md';
const f27Doc = 'release-evidence/2026-06-25/folder-sync-f27-lane-status-readiness-ledger-v2.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F27_COMMIT = '8af5bea';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const BINDING_REQUEST_SCHEMA = 'h2o.studio.chat-folder-binding-request.v1';
const BINDING_RECEIPT_SCHEMA = 'h2o.studio.chat-folder-binding-receipt.v1';
const SORTORDER_REQUEST_SCHEMA = 'h2o.studio.folder-sortorder-reorder-request.v1';
const SORTORDER_RECEIPT_SCHEMA = 'h2o.studio.folder-sortorder-reorder-receipt.v1';
const STEPS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12', 'S13', 'S14'];
const REQUIRED_INVARIANTS = ['Desktop SQLite remains CANONICAL', 'one-folder-per-chat preserved',
  'no chat delete', 'no folder delete / purge', 'mirror remains a DERIVED PROJECTION',
  'TRANSPORT-ONLY', 'Chat Saving CAS remains BLOCKED'];
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
assert(exists(f28Doc), `${f28Doc}: missing`);
if (!exists(f28Doc)) {
  console.error('FAIL validate-folder-sync-f28-implementation-sequencing-plan');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f28Doc);
assert(doc.length > 6000, `${f28Doc}: F28 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- plan-only markers ----
assert(flat.includes('DESIGN / SEQUENCING PLAN ONLY'), 'F28 doc must mark itself design/sequencing plan only');
assert(flat.includes('No product source was modified'), 'F28 doc must state no product source modified');
assert(/Nothing was implemented/i.test(flat), 'F28 doc must state nothing was implemented');
assert(/No schema was minted/i.test(flat), 'F28 doc must state no schema minted');
assert(/No F11 allowed\/blocked set was changed/i.test(flat), 'F28 doc must state no F11 allowed/blocked-set change');
assert(/No `?productSyncReady`? flip happened/i.test(flat), 'F28 doc must state no productSyncReady flip');
assert(/PLAN ONLY|plan, not an implementation/i.test(flat), 'F28 doc must declare plan-only');

// ---- F27 commit ----
assert(flat.includes(F27_COMMIT), `F28 doc must reference the F27 commit ${F27_COMMIT}`);
assert(exists(f27Doc), 'F27 doc must exist on disk');

// ---- required invariants ----
for (const inv of REQUIRED_INVARIANTS) assert(flat.includes(inv), `F28 doc must list required invariant: ${inv}`);
assert(/NON-CANONICAL PROPOSERS/i.test(flat), 'F28 doc must keep Chrome/native/mobile non-canonical proposers');
assert(/REDACTED \/ HASH-ONLY|redacted \/ hash-only/i.test(flat), 'F28 doc must keep payloads redacted/hash-only');

// ---- all 14 ordered gated steps present ----
for (const s of STEPS) assert(new RegExp('### ' + s + ' ').test(flat) || flat.includes(s + ' —') || flat.includes(s + ' -'),
  `F28 doc must include ordered step: ${s}`);
// step content coverage
assert(/sortOrder schema mint \+ source validator/i.test(flat), 'F28 S1 must be sortOrder schema mint + source validator');
assert(/sortOrder Desktop validate\/apply\/receipt handler/i.test(flat), 'F28 S2 must be the sortOrder Desktop handler');
assert(/sortOrder live Desktop dry-run proof/i.test(flat), 'F28 S3 must be the sortOrder live dry-run proof');
assert(/sortOrder live controlled apply \+ post-apply drift probe/i.test(flat), 'F28 S4 must be the sortOrder controlled apply + drift probe');
assert(/add `?field-mismatch:sortOrder`? to the F11 allowed set behind the absorption gate/i.test(flat),
  'F28 S5 must add field-mismatch:sortOrder to the F11 allowed set behind the gate');
assert(/binding receipt schema mint \+ source validator/i.test(flat), 'F28 S6 must be binding receipt schema mint + validator');
assert(/binding Desktop validate\/apply\/receipt handler/i.test(flat), 'F28 S7 must be the binding Desktop handler');
assert(/binding live Desktop dry-run proof/i.test(flat), 'F28 S8 must be the binding live dry-run proof');
assert(/binding live controlled apply \+ post-apply drift probe/i.test(flat), 'F28 S9 must be the binding controlled apply + drift probe');
assert(/move `?binding-mismatch`? into the reviewed repair path/i.test(flat), 'F28 S10 must move binding-mismatch into the reviewed repair path');
assert(/Chrome\/native\/mobile request submission proofs/i.test(flat), 'F28 S11 must be the Chrome/native/mobile submission proofs');
assert(/multi-device import\/read-only proofs/i.test(flat), 'F28 S12 must be the multi-device import proofs');
assert(/sustained multi-surface parity proof/i.test(flat), 'F28 S13 must be the sustained parity proof');
assert(/final productSyncReady flip review/i.test(flat), 'F28 S14 must be the final flip review');

// ---- each step has entry + exit criteria + preserved invariants ----
const entryCount = (flat.match(/entry criteria:/gi) || []).length;
const exitCount = (flat.match(/exit criteria:/gi) || []).length;
const invCount = (flat.match(/invariants preserved:/gi) || []).length;
assert(entryCount >= 14, `F28 doc must give entry criteria for all 14 steps (found ${entryCount})`);
assert(exitCount >= 14, `F28 doc must give exit criteria for all 14 steps (found ${exitCount})`);
assert(invCount >= 14, `F28 doc must give preserved invariants for all 14 steps (found ${invCount})`);
assert(/validators\/proofs:/i.test(flat), 'F28 doc steps must list required validators/proofs');
assert(/blocked boundaries:/i.test(flat), 'F28 doc steps must list explicit blocked boundaries');

// ---- postures ----
assert(/`binding-mismatch` remains BLOCKED|binding-mismatch` REMAINS BLOCKED|binding-mismatch remains blocked/i.test(flat),
  'F28 doc must keep binding-mismatch blocked');
assert(/`field-mismatch:sortOrder` remains GATED|field-mismatch:sortOrder`?: REMAINS GATED|field-mismatch:sortOrder remains gated/i.test(flat),
  'F28 doc must keep field-mismatch:sortOrder gated');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F28 doc must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked|BLOCKED)/i.test(flat),
  'F28 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV[^.]*deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred'),
  'F28 doc must keep real remote WebDAV deferred');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F28 doc must keep public/premium blocked');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F28 doc must keep fullBundle.v3 not minted');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F28 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F28 doc must preserve chats on folder delete');

// ---- cross-surface + F29 ----
assert(flat.includes('Cross-Surface Requirement'), 'F28 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F28 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F28 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'), 'F28 doc must include Chrome / native extension');
assert(flat.includes('Recommended F29'), 'F28 doc must recommend F29');
assert(/S1 pre-flight gate|entry gate for the FIRST implementation step/i.test(flat), 'F28 doc F29 must be the S1 pre-flight gate');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F28 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: proposed schemas NOT minted; request present; F11 blocks both ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"),
    'source must define the chat-folder-binding request schema (reused)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'F28 plan-only: proposed binding receipt schema must NOT be minted in source');
  assert(!src.includes(SORTORDER_REQUEST_SCHEMA) && !src.includes(SORTORDER_RECEIPT_SCHEMA),
    'F28 plan-only: proposed sortOrder schemas must NOT be minted in source');
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
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f28-implementation-sequencing-plan');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f28-implementation-sequencing-plan.v1',
  lane: 'folder-sync',
  phase: 'F28',
  f28Doc,
  designOnly: true,
  planOnly: true,
  f27CommitReferenced: F27_COMMIT,
  steps: STEPS,
  stepCount: STEPS.length,
  entryCriteriaCount: (flat.match(/entry criteria:/gi) || []).length,
  exitCriteriaCount: (flat.match(/exit criteria:/gi) || []).length,
  invariantsPreservedCount: (flat.match(/invariants preserved:/gi) || []).length,
  anythingImplemented: false,
  anySchemaMinted: false,
  anyF11SetChange: false,
  anyProductSyncReadyFlip: false,
  bindingMismatchBlocked: true,
  sortOrderGated: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F29-S1-preflight-gate (design-only, no schema mint, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f28-implementation-sequencing-plan');
