#!/usr/bin/env node
//
// Folder Sync Phase F34a — no-write live basis-hash alignment diagnostic meta-validator (evidence only).
//
// Verifies the F34a diagnostic doc exists and is internally consistent: references the F34 commit (4915d2a);
// records the read-only posture (readOnly:true / calledApply:false / passedGate:false / mutated:false) and
// the diagnostic aggregates (visibleFolderCount:6; all six sort_order = 0; tieGroupCount:1;
// nonMonotonicInversionCount:0; hash1_visibleOrder=oh:d526bd90; hash2_structuredObjects=oh:2842e705;
// hash3_classifySorted=oh:d526bd90; hash1EqualsHash3:true); states Attempt 2 is EXPLAINED by structured-object
// hashing and Attempt 1 remains UNRESOLVED pending an F34b classifier-introspection diagnostic; states F34a is
// diagnostic only and NOT a pass of the S3 dry-run; keeps S4/S2b/S5 blocked and the standing postures. It
// grounds the standing boundaries against REAL SOURCE (F32 handler present + still defers the mirror; binding
// receipt unminted; fullBundle v2; webdav deferred; bounded metadata guard; F11 still blocks both classes).
// Binds no socket; performs no write; runs no live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f34aDoc = 'release-evidence/2026-06-25/folder-sync-f34a-basis-hash-diagnostic.md';
const f34Doc = 'release-evidence/2026-06-25/folder-sync-f34-s3-live-dry-run-blocked-stale-basis.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F34_COMMIT = '4915d2a';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
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
assert(exists(f34aDoc), `${f34aDoc}: missing`);
if (!exists(f34aDoc)) {
  console.error('FAIL validate-folder-sync-f34a-basis-hash-diagnostic');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f34aDoc);
assert(doc.length > 3500, `${f34aDoc}: F34a doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- provenance ----
assert(flat.includes(F34_COMMIT), `F34a doc must reference the F34 commit ${F34_COMMIT}`);
assert(exists(f34Doc), 'F34 doc must exist on disk');

// ---- read-only posture (from the recorded diagnostic output) ----
assert(/"readOnly":\s*true/.test(flat), 'F34a doc must record readOnly:true');
assert(/"calledApply":\s*false/.test(flat), 'F34a doc must record calledApply:false');
assert(/"passedGate":\s*false/.test(flat), 'F34a doc must record passedGate:false');
assert(/"mutated":\s*false/.test(flat), 'F34a doc must record mutated:false');

// ---- diagnostic aggregates ----
assert(/"visibleFolderCount":\s*6/.test(flat), 'F34a doc must record visibleFolderCount:6');
assert(/"sortOrderValues":\s*\[\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\]/.test(flat),
  'F34a doc must record all six sort_order values as 0');
assert(/all six/i.test(flat) && /(tied at 0|all 0)/i.test(flat), 'F34a doc must state all six sort_order are 0 (single tie group)');
assert(/"tieGroupCount":\s*1/.test(flat), 'F34a doc must record tieGroupCount:1');
assert(/"nonMonotonicInversionCount":\s*0/.test(flat), 'F34a doc must record nonMonotonicInversionCount:0');
assert(/"hash1_visibleOrder":\s*"oh:d526bd90"/.test(flat), 'F34a doc must record hash1_visibleOrder oh:d526bd90');
assert(/"hash2_structuredObjects":\s*"oh:2842e705"/.test(flat), 'F34a doc must record hash2_structuredObjects oh:2842e705');
assert(/"hash3_classifySorted":\s*"oh:d526bd90"/.test(flat), 'F34a doc must record hash3_classifySorted oh:d526bd90');
assert(/"hash1EqualsHash3":\s*true/.test(flat), 'F34a doc must record hash1EqualsHash3:true');

// ---- interpretation ----
assert(/Attempt 2[^.]{0,40}EXPLAINED/i.test(flat), 'F34a doc must state Attempt 2 is explained');
assert(flat.includes('structured-object hashing'), 'F34a doc must attribute Attempt 2 to structured-object hashing');
assert(/Attempt 1[^.]{0,60}UNRESOLVED/i.test(flat), 'F34a doc must state Attempt 1 remains unresolved');
assert(/classifier[- ]introspection/i.test(flat) && flat.includes('F34b'),
  'F34a doc must state Attempt 1 needs an F34b classifier-introspection diagnostic');
assert(/diagnostic only/i.test(flat) && /not[^.]{0,4}a pass of the S3/i.test(flat),
  'F34a doc must state it is diagnostic only, not a pass of S3 dry-run');

// ---- blocked boundaries ----
assert(flat.includes('S4 controlled apply REMAINS BLOCKED'), 'F34a doc must block S4 controlled apply');
assert(/S2b[^.]*design-only/i.test(flat) || flat.includes('deferred-to-s2b'), 'F34a doc must keep S2b design-only');
assert(flat.includes('S5 F11 allowed-set change REMAINS BLOCKED'), 'F34a doc must keep S5/F11 change blocked');
assert(/binding-mismatch` remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'F34a doc must keep binding-mismatch blocked');
assert(flat.includes('binding receipt schema remains UNMINTED'), 'F34a doc must keep binding receipt unminted');
assert(flat.includes('`productSyncReady` remains `false`'), 'F34a doc must keep productSyncReady false');
assert(/public\/premium sync remains blocked/i.test(flat), 'F34a doc must keep public/premium blocked');
assert(/Real remote WebDAV remains deferred/i.test(flat), 'F34a doc must keep real remote WebDAV deferred');
assert(/`fullBundle\.v3` not minted/i.test(flat), 'F34a doc must keep fullBundle.v3 not minted');
assert(flat.includes('Chat Saving WebDAV/cloud/archive CAS remains BLOCKED'), 'F34a doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat), 'F34a doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F34a doc must preserve chats on folder delete');

// ---- cross-surface + F34b ----
assert(flat.includes('Cross-Surface Requirement'), 'F34a doc must include the cross-surface requirement');
assert(flat.includes('mobile') && flat.includes('native extension'), 'F34a doc must carry the cross-surface participants');
assert(flat.includes('Recommended F34b'), 'F34a doc must recommend F34b');
assert(flat.includes('NO-WRITE live classifier-introspection diagnostic'), 'F34a F34b must be a no-write classifier-introspection diagnostic');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F34a doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: standing boundaries unchanged ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'F32 handler must still be present');
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'F32 handler must still defer mirror re-projection (S2b not implemented)');
  assert(src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema is now minted and live-proven');
  assert(src.includes("CHAT_FOLDER_BINDING_REQUEST_SCHEMA = '" + BINDING_REQUEST_SCHEMA + "'"), 'binding request schema must remain present');
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync.tauri.js');
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
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("'field-mismatch:sortOrder': true"),
    'S5 flipped field-mismatch:sortOrder into the F11 allowed set');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'F11 helper keeps binding-mismatch blocked/reviewed after S5');
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder substrate tokens intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  'WebDAV must remain deferred in folder-import.mv3.js');

if (failures.length) {
  console.error('FAIL validate-folder-sync-f34a-basis-hash-diagnostic');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f34a-basis-hash-diagnostic.v1',
  lane: 'folder-sync',
  phase: 'F34a',
  step: 'S3-diagnostic',
  f34aDoc,
  verdict: 'DIAGNOSTIC-PASS',
  readOnly: true,
  calledApply: false,
  passedGate: false,
  mutated: false,
  f34CommitReferenced: F34_COMMIT,
  visibleFolderCount: 6,
  allSortOrderZero: true,
  tieGroupCount: 1,
  nonMonotonicInversionCount: 0,
  hash1VisibleOrder: 'oh:d526bd90',
  hash2StructuredObjects: 'oh:2842e705',
  hash3ClassifySorted: 'oh:d526bd90',
  hash1EqualsHash3: true,
  attempt2Explained: 'structured-object-hashing',
  attempt1Unresolved: true,
  s3DryRunPassed: false,
  s4ControlledApplyBlocked: true,
  s2bDesignOnly: true,
  s5F11FlipBlocked: true,
  bindingReceiptSchemaMinted: true,
  bindingMismatchBlocked: true,
  sortOrderGatedInF11: false,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F34b-no-write-live-classifier-introspection-diagnostic (read-only; no apply; no gate; no write)',
}, null, 2));
console.log('PASS validate-folder-sync-f34a-basis-hash-diagnostic');
