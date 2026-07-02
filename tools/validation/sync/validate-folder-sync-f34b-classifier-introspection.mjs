#!/usr/bin/env node
//
// Folder Sync Phase F34b — live classifier-introspection evidence proof (diagnostic + no-write only).
//
// Verifies the new F34b evidence file exists and records the expected live-derived facts:
// read-only posture, real-api classifier usage, tied sort_order reproduction, identity request acceptance,
// genuine reorder stale-basis under ties, and boundary blocks that remain unchanged (S3 retry blocked,
// S4 blocked, S2b design-only, S5/F11 blocked, `field-mismatch:sortOrder` + `binding-mismatch` blocked).
// This validator performs no live socket work and does not run apply.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const evidencePath = 'release-evidence/2026-06-25/folder-sync-f34b-classifier-introspection.md';
const f32bCommit = '247a0de';
const f34aCommit = '0cab297';
const f34aDoc = 'release-evidence/2026-06-25/folder-sync-f34a-basis-hash-diagnostic.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function hasJsonObject(block, re) {
  const m = block.match(re);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (_) { return null; }
}

assert(exists(evidencePath), `${evidencePath}: missing`);
if (!exists(evidencePath)) {
  console.error('FAIL validate-folder-sync-f34b-classifier-introspection');
  for (const msg of failures) console.error(`- ${msg}`);
  process.exit(1);
}

const evidence = read(evidencePath);
assert(evidence.includes('DIAGNOSTIC / EVIDENCE ONLY'), 'evidence must explicitly mark diagnostic/evidence-only scope');
assert(evidence.includes('readOnly: true'), 'evidence must record readOnly:true');
assert(evidence.includes('calledApply: false'), 'evidence must record calledApply:false');
assert(evidence.includes('passedGate: false'), 'evidence must record passedGate:false');
assert(evidence.includes('mutated: false'), 'evidence must record mutated:false');
assert(evidence.includes('classifyExposed": true') || evidence.includes('classifyExposed":true') || evidence.includes('classifyExposed: true'),
  'evidence must record classifyExposed:true');
assert(evidence.includes('classifierSource": "real-api-classify"') || evidence.includes('classifierSource: "real-api-classify"'),
  'evidence must record classifierSource:"real-api-classify"');

const flat = evidence.replace(/\s+/g, ' ');
assert(flat.includes(f32bCommit), `evidence must reference F32b commit ${f32bCommit}`);
assert(flat.includes(f34aCommit), `evidence must reference F34a commit ${f34aCommit}`);
assert(exists(f34aDoc), 'F34a basis-hash diagnostic doc must exist');

assert(/visibleFolderCount"\s*:\s*6/.test(flat), 'evidence must record visibleFolderCount:6');
assert(/allSortOrderTied"\s*:\s*true/.test(flat), 'evidence must record allSortOrderTied:true');
assert(/"sortOrderValues"\s*:\s*\[\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\]/.test(flat),
  'evidence must record six sortOrder values as 0');

assert(/"identityRequest"[\s\S]{0,240}"basisOrderingHash"\s*:\s*"oh:d526bd90"/.test(evidence),
  'evidence must record identity basis hash oh:d526bd90');
assert(/"identityRequest"[\s\S]{0,240}"requestedOrderingHash"\s*:\s*"oh:d526bd90"/.test(evidence),
  'evidence must record identity requested hash oh:d526bd90');
assert(/"identityRequest"[\s\S]{0,240}"classifierDerivedCurrentHash"\s*:\s*"oh:d526bd90"/.test(evidence),
  'evidence must record identity classifierDerivedCurrentHash oh:d526bd90');
assert(/"identityRequest"[\s\S]{0,240}"validate"\s*:\s*\{\s*"ok"\s*:\s*true\s*\}/.test(evidence),
  'evidence must record identity validate.ok:true');
assert(/"identityRequest"[\s\S]{0,240}"classifyReason"\s*:\s*null/.test(evidence),
  'evidence must record identity classifyReason:null');
assert(/"identityRequest"[\s\S]{0,240}"classifyEquivReason"\s*:\s*null/.test(evidence),
  'evidence must record identity classifyEquivReason:null');

assert(/"genuineReorderRequest"[\s\S]{0,320}"payload"\s*:\s*"first-two-swap"/.test(evidence),
  'evidence must record genuine reorder payload as first-two-swap');
assert(/"genuineReorderRequest"[\s\S]{0,320}"basisOrderingHash"\s*:\s*"oh:d526bd90"/.test(evidence),
  'evidence must record genuine reorder basis hash oh:d526bd90');
assert(/"genuineReorderRequest"[\s\S]{0,320}"requestedOrderingHash"\s*:\s*"oh:d91ad328"/.test(evidence),
  'evidence must record genuine reorder requested hash oh:d91ad328');
assert(/"genuineReorderRequest"[\s\S]{0,320}"classifierDerivedCurrentHash"\s*:\s*"oh:d91ad328"/.test(evidence),
  'evidence must record genuine reorder derived current hash oh:d91ad328');
assert(/"genuineReorderRequest"[\s\S]{0,320}"derivedCurrentHashEqualsRequested"\s*:\s*true/.test(evidence),
  'evidence must record derivedCurrentHashEqualsRequested:true');
assert(/"genuineReorderRequest"[\s\S]{0,320}"derivedCurrentHashEqualsBasis"\s*:\s*false/.test(evidence),
  'evidence must record derivedCurrentHashEqualsBasis:false');
assert(/"genuineReorderRequest"[\s\S]{0,320}"validate"\s*:\s*\{\s*"ok"\s*:\s*true\s*\}/.test(evidence),
  'evidence must record genuine reorder validate.ok:true');
assert(/"genuineReorderRequest"[\s\S]{0,320}"classifyReason"\s*:\s*"stale-basis"/.test(evidence),
  'evidence must record genuine reorder classifyReason: "stale-basis"');
assert(/"genuineReorderRequest"[\s\S]{0,500}"classifyEquivReason"\s*:\s*"stale-basis"/.test(evidence),
  'evidence must record genuine reorder classifyEquivReason: "stale-basis"');
assert(/"genuineReorderUnsatisfiableUnderTies"\s*:\s*true/.test(flat),
  'evidence must record genuineReorderUnsatisfiableUnderTies:true');

assert(/confirms the tied-sortOrder basis-derivation bug/i.test(flat),
  'evidence must state that tied-sortOrder basis-derivation is confirmed');
assert(/does\s*\**not\s*\**\s+authorize\s+S3\s+retry/i.test(flat), 'evidence must keep S3 retry not authorized');
assert(/does\s*\**not\s*\**\s+authorize\s+S4\s+controlled\s+apply/i.test(flat), 'evidence must keep S4 controlled apply not authorized');
assert(/S4 controlled apply remains blocked/i.test(flat), 'evidence must block S4');
assert(/S2b remains design-only/i.test(flat), 'evidence must keep S2b design-only');
assert(/S5|F11/.test(evidence) && /flip remains blocked/i.test(evidence) && /field-mismatch:sortOrder/i.test(evidence),
  'evidence must keep S5/F11 flip blocked with field-mismatch:sortOrder blocked');
assert(/binding-mismatch.*blocked/i.test(evidence), 'evidence must keep binding-mismatch blocked');
assert(/Binding receipt schema remains unminted/i.test(evidence), 'evidence must keep binding receipt schema unminted');
assert(/productSyncReady\s*:\s*false/i.test(evidence) || /`productSyncReady`.*false/i.test(evidence),
  'evidence must keep productSyncReady false');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains blocked/i.test(evidence), 'evidence must keep Chat Saving CAS blocked');

assert(/F34 Attempt 1/.test(evidence), 'evidence should reference that F34 Attempt 1 is confirmed');
assert(/unsatisfiable(?:-under-ties)?\s*behavior/i.test(flat), 'evidence should explicitly mention unsatisfiable under ties behavior');

// ---- Standing source checks (still no write path/receiver minting in this slice) ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'folder-sync source must still defer mirror reprojection');
  assert(!src.includes('h2o.studio.chat-folder-binding-receipt.v1'), 'binding receipt schema must stay unminted');
  assert(!src.includes('fullBundle.v3'), 'fullBundle.v3 must not be present in source');
  assert(src.includes("webdav: 'deferred'"), 'WebDAV must remain deferred in folder-sync source');
}

assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 blockedClasses must still include field-mismatch:sortOrder and binding-mismatch');
  assert(store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder store should still carry hard-delete and soft-delete guard tokens');
}
assert(exists(folderImportFile), `${folderImportFile}: missing`);
if (exists(folderImportFile)) {
  const imp = read(folderImportFile);
  assert(imp.includes("webdav: 'deferred'"), 'folder-import source must still defer webdav');
}

if (failures.length) {
  console.error('FAIL validate-folder-sync-f34b-classifier-introspection');
  for (const msg of failures) console.error(`- ${msg}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f34b-classifier-introspection.v1',
  lane: 'folder-sync',
  phase: 'F34b',
  f34bDoc: evidencePath,
  f34aCommitReferenced: f34aCommit,
  f32bCommitReferenced: f32bCommit,
  readOnly: true,
  calledApply: false,
  passedGate: false,
  mutated: false,
  classifyExposed: true,
  classifierSource: 'real-api-classify',
  visibleFolderCount: 6,
  allSortOrderTied: true,
  identityBasis: 'oh:d526bd90',
  identityRequested: 'oh:d526bd90',
  identityDerived: 'oh:d526bd90',
  genuineReorderBasis: 'oh:d526bd90',
  genuineReorderRequested: 'oh:d91ad328',
  genuineReorderDerived: 'oh:d91ad328',
  derivedCurrentHashEqualsRequested: true,
  derivedCurrentHashEqualsBasis: false,
  genuineReorderUnsatisfiableUnderTies: true,
  s3Retry: false,
  s4ControlledApply: false,
  s2bDesignOnly: true,
  s5F11FlipBlocked: true,
  fieldMismatchSortOrderBlocked: true,
  bindingMismatchBlocked: true,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  chatSavingCasBlocked: true,
}, null, 2));
console.log('PASS validate-folder-sync-f34b-classifier-introspection');
