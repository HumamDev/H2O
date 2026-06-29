#!/usr/bin/env node
//
// Phase 12 — design-only meta-validator for the guarded non-destructive chat-category-clear spec.
//
// Lightweight consistency check (no behavior, no VM). It verifies the design doc exists and is
// internally consistent, AND proves the phase is genuinely design-only by asserting the source
// apply/request modules still do not reference chat-category-clear and the existing guards are intact.
// It does NOT assert any new applied behavior.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const designDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase12-chat-category-clear-design.md';
const phase11Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase11-closeout-readiness-audit.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const categoriesStoreFile = 'src-surfaces-base/studio/store/categories.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

// ---- design doc presence ----
assert(exists(designDoc), `${designDoc}: missing`);
if (!exists(designDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase12-chat-category-clear-design');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(designDoc);
assert(doc.length > 2000, `${designDoc}: design doc too short`);

// ---- design-only markers ----
for (const marker of ['DESIGN-ONLY', 'not implemented', 'not applied', 'No source modules were modified']) {
  assert(doc.includes(marker), `design doc missing design-only marker: ${marker}`);
}
// applied-type invariant: chat-category-assign stays the only applied type.
assert(doc.includes('remains the only currently applied') && doc.includes('chat-category-assign'),
  'design doc must state chat-category-assign remains the only currently applied type');

// ---- non-destructive reassignment semantics ----
assert(doc.includes('non-destructive reassignment-to-none'),
  'design doc must define chat-category-clear as non-destructive reassignment-to-none');
assert(/non-destructive/i.test(doc) && doc.includes('categories.clearChat') && doc.includes('category_id = NULL'),
  'design doc must cite the non-destructive clearChat / category_id = NULL store path');

// ---- required boundary invariants ----
const REQUIRED_INVARIANTS = [
  'Only chat-category-assign is applied',
  'Chrome remains request-only',
  'Chrome remains read-only over canonical metadata',
  'Desktop remains canonical authority',
  'No Chrome canonical mutation',
  'No Desktop canonical mutation beyond the Phase 7 chat-category-assign apply',
  'Destructive-shaped metadata actions remain blocked/deferred',
  'No deletion of chats, snapshots, assets, labels, tags, categories, folders, or metadata',
  'noHardDelete / noPurge / noChatDelete / noSnapshotDelete / noAssetDelete preserved',
  'No WebDAV/cloud/relay transport',
  'Product metadata sync is not broadly complete',
];
for (const inv of REQUIRED_INVARIANTS) assert(doc.includes(inv), `design doc missing invariant: ${inv}`);

// ---- deferred surface ----
for (const item of ['catalog create/rename', 'label/tag binding', 'classification-set',
  'destructive actions', 'live-CDP capture', 'WebDAV/cloud/relay']) {
  assert(doc.includes(item), `design doc missing deferred-surface item: ${item}`);
}

// ---- receipt status taxonomy enumerated ----
for (const status of ['applied', 'skipped_duplicate', 'stale_basis', 'rejected', 'deferred', 'invalid']) {
  assert(doc.includes(status), `design doc missing receipt status: ${status}`);
}

// ---- references to Phase 11 closeout + prior phase commits ----
assert(doc.includes('b16fa29'), 'design doc must reference the Phase 11 closeout commit b16fa29');
assert(doc.includes('labels-tags-categories-phase11-closeout-readiness-audit.md'),
  'design doc must reference the Phase 11 closeout audit doc');
for (const commit of ['91e1c95', '8addf3a', '2b6116f', 'ede1f66', 'daf28cc']) {
  assert(doc.includes(commit), `design doc missing prior phase commit: ${commit}`);
}
assert(exists(phase11Doc), `${phase11Doc}: Phase 11 closeout doc must exist`);

// ---- no over-claim ----
assert(!/chat-category-clear is (now )?(implemented|applied|enabled)/i.test(doc),
  'design doc must not claim chat-category-clear is implemented/applied/enabled');
assert(doc.includes('NOT READY'), 'design doc must keep product sync NOT READY');

// ---- design-only PROOF against source: nothing was enabled ----
for (const file of [folderSyncFile, folderImportFile, categoriesStoreFile]) {
  assert(exists(file), `${file}: missing`);
}
// The Desktop apply/validate module and the Chrome request module must NOT reference the new action
// (it remains a design only; only the Phase 10 diagnostics deferred-list mentions it).
assert(!read(folderSyncFile).includes('chat-category-clear'),
  'design-only violated: folder-sync.tauri.js references chat-category-clear (apply not allowed in this phase)');
assert(!read(folderImportFile).includes('chat-category-clear'),
  'design-only violated: folder-import.mv3.js references chat-category-clear (request enablement not allowed in this phase)');
// The apply gate and destructive guards must be unchanged (clear still blocked, assign-only apply).
assert(read(folderSyncFile).includes("if (action !== 'chat-category-assign')"),
  'Desktop apply gate must remain limited to chat-category-assign');
for (const guardFile of [folderSyncFile, folderImportFile]) {
  assert(read(guardFile).includes('delete|remove|unbind|clear|purge|hard-delete'),
    `destructive guard regex must remain intact (clear still blocked) in ${guardFile}`);
}
// The non-destructive store path the design relies on must really exist and be a NULL-set (not delete).
assert(read(categoriesStoreFile).includes('category_id = NULL'),
  'clearChat non-destructive store path (category_id = NULL) must exist in categories.tauri.js');

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase12-chat-category-clear-design');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase12-chat-category-clear-design.v1',
  phase: 'phase12-chat-category-clear-design',
  designDoc,
  designOnly: true,
  implemented: false,
  applied: false,
  onlyAppliedType: 'chat-category-assign',
  clearSemantics: 'non-destructive-reassignment-to-none',
  invariantsChecked: REQUIRED_INVARIANTS.length,
  sourceUnchanged: true,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase12-chat-category-clear-design');
