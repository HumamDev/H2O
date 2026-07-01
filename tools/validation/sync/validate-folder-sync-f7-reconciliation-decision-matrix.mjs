#!/usr/bin/env node
//
// Folder Sync Phase F7 — reconciliation decision-matrix meta-validator (design/audit/read-only).
//
// Verifies the F7 doc exists and is internally consistent (read-only decision matrix only): records the
// F6 live drift result (diagnosticCount 9; the four drift classes), publishes a reconciliation decision
// matrix classifying each class into expected-benign / mirror-rebuild-candidate / canonical-review /
// blocked, states no repair or write-through is implemented, keeps the Desktop-SQLite-canonical /
// FOLDER_STATE_DATA_KEY-render-mirror model, keeps the folder/public-premium/remote postures and the
// hard-delete / delete-preserves-chats boundaries, includes the cross-surface (Desktop + Chrome/native
// multi-device + mobile) requirement, references the F6 commit, and uses a BOUNDED metadata-lane guard
// (four core present; applied within the four core plus the known Operational unbinds) — not
// exactly-four. Binds no socket; makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f7Doc = 'release-evidence/2026-06-25/folder-sync-f7-reconciliation-decision-matrix.md';
const f6Doc = 'release-evidence/2026-06-25/folder-sync-f6-desktop-runtime-drift-live-evidence.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F6_COMMIT = 'deed147e76b61dfd496365e2a551194beb2a8bd2';
const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);

const F6_DRIFT_CLASSES = ['binding-mismatch', 'field-mismatch:color', 'field-mismatch:sortOrder', 'missing-mirror-folder'];
const CLASSIFICATIONS = [
  'EXPECTED BENIGN DRIFT', 'MIRROR REBUILD CANDIDATE', 'CANONICAL REVIEW REQUIRED',
  'BLOCKED UNTIL EXPLICIT WRITE-THROUGH/REPAIR PHASE',
];

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
assert(exists(f7Doc), `${f7Doc}: missing`);
if (!exists(f7Doc)) {
  console.error('FAIL validate-folder-sync-f7-reconciliation-decision-matrix');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f7Doc);
assert(doc.length > 4000, `${f7Doc}: F7 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit/read-only only ----
for (const marker of ['DESIGN / AUDIT / READ-ONLY DECISION MATRIX ONLY', 'No reconciliation writes were implemented',
  'No product source was modified', 'The mirror was not made write-through']) {
  assert(flat.includes(marker), `F7 doc missing read-only marker: ${marker}`);
}

// ---- F6 commit + diagnosticCount + drift classes ----
assert(flat.includes(F6_COMMIT), 'F7 doc must reference the F6 commit (full SHA)');
assert(exists(f6Doc), 'F6 live-evidence doc must exist on disk');
assert(flat.includes('diagnosticCount: 9') || flat.includes('diagnosticCount` is `9') || flat.includes('9 diagnostics'),
  'F7 doc must record diagnosticCount 9');
for (const cls of F6_DRIFT_CLASSES) assert(flat.includes(cls), `F7 doc missing F6 drift class: ${cls}`);

// ---- decision matrix + classifications ----
assert(flat.includes('Reconciliation Decision Matrix'), 'F7 doc must define a reconciliation decision matrix');
for (const c of CLASSIFICATIONS) assert(flat.includes(c), `F7 doc missing classification category: ${c}`);

// ---- source-of-truth model + no repair/write-through ----
assert(flat.includes('Desktop SQLite') && flat.includes('CANONICAL') && flat.includes('remains canonical'),
  'F7 doc must keep Desktop SQLite canonical');
assert(flat.includes('FOLDER_STATE_DATA_KEY') && flat.includes('render mirror'),
  'F7 doc must keep FOLDER_STATE_DATA_KEY as the render mirror');
assert(/no repair or write-through was implemented/i.test(flat) || flat.includes('No reconciliation writes were implemented'),
  'F7 doc must state no repair or write-through is implemented');

// ---- hard safety + postures ----
assert(/no hard delete/i.test(flat), 'F7 doc must state no hard delete');
assert(/folder delete preserves chats/i.test(flat), 'F7 doc must state folder delete preserves chats');
assert(/tombstones remain recoverable/i.test(flat), 'F7 doc must keep tombstones recoverable');
assert(flat.includes('Desktop remains canonical'), 'F7 doc must keep Desktop canonical by default');
assert(flat.includes('NOT READY'), 'F7 doc must keep folder sync NOT READY');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('REMAINS BLOCKED'),
  'F7 doc must keep public/premium sync blocked');
assert(/Real remote WebDAV: deferred/i.test(flat) || flat.includes('real remote WebDAV remains deferred'),
  'F7 doc must keep real remote WebDAV deferred');

// ---- cross-surface requirement ----
assert(flat.includes('Cross-Surface Requirement'), 'F7 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F7 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F7 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F7 doc must include Chrome / native extension as a cross-surface participant');

// ---- F8 recommendation ----
assert(flat.includes('What F8 Should Be') && flat.includes('write-through / rebuild specification'),
  'F7 doc must recommend the F8 design-only write-through/rebuild specification');

// ---- metadata lane not modified BY THIS lane; core present ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F7 doc must confirm metadata core type: ${type}`);
assert(flat.includes('not modified by this folder-sync lane') || flat.includes('is not modified by this'),
  'F7 doc must confirm the metadata lane is not modified by this lane');

// ---- source anchors intact (folder substrate) ----
for (const [token, file] of [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['hardDeleteBlocked', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile],
]) {
  assert(exists(file) && read(file).includes(token), `folder substrate token absent from ${file}: ${token}`);
}

// ---- REAL SOURCE: bounded metadata guard (core present; within core + known Operational unbinds) ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseMetadataAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) {
      assert(applied.includes(core), `metadata core applied type missing from source: ${core}`);
    }
    for (const a of applied) {
      assert(METADATA_ALLOWED_SUPERSET.includes(a),
        `unexpected applied type beyond the four core + known Operational unbinds: ${a}`);
    }
  }
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(exists(file) && read(file).includes("webdav: 'deferred'"),
    `metadata-lane WebDAV must remain deferred (webdav: 'deferred') in ${file}`);
}

if (failures.length) {
  console.error('FAIL validate-folder-sync-f7-reconciliation-decision-matrix');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f7-reconciliation-decision-matrix.v1',
  lane: 'folder-sync',
  phase: 'F7',
  f7Doc,
  designOnly: true,
  f6CommitReferenced: F6_COMMIT,
  diagnosticCount: 9,
  driftClasses: F6_DRIFT_CLASSES,
  classification: {
    'missing-mirror-folder': 'MIRROR REBUILD CANDIDATE',
    'field-mismatch:color': 'MIRROR REBUILD CANDIDATE',
    'field-mismatch:sortOrder': 'CANONICAL REVIEW REQUIRED',
    'binding-mismatch': 'BLOCKED UNTIL EXPLICIT WRITE-THROUGH/REPAIR PHASE',
  },
  noRepairOrWriteThrough: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F8-design-only-write-through-rebuild-spec',
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
}, null, 2));
console.log('PASS validate-folder-sync-f7-reconciliation-decision-matrix');
