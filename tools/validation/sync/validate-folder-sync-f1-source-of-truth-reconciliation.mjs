#!/usr/bin/env node
//
// Folder Sync Phase F1 — source-of-truth reconciliation diagnostic/design meta-validator.
//
// Verifies the F1 doc exists and is internally consistent (diagnostic/design only), identifies the
// folder source-of-truth split, names the render mirror, identifies SQLite `folders` as canonical
// Desktop storage, identifies the Chrome native-owner mutation path and the H2O request loops, keeps
// the folder/public-premium/remote postures, states the no-hard-delete + delete-preserves-chats
// boundaries, recommends the F2 drift-detector slice, and confirms the closed metadata lane is
// untouched. It grounds the key claims against real source and binds no socket / makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f1Doc = 'release-evidence/2026-06-25/folder-sync-f1-source-of-truth-reconciliation.md';
const auditDoc = 'release-evidence/2026-06-25/folder-sync-readiness-design-audit.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F1_METADATA_APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const CURRENT_METADATA_APPLIED_TYPES = [
  'chat-category-assign',
  'chat-category-clear',
  'chat-label-bind',
  'chat-tag-bind',
  'chat-label-unbind',
  'chat-tag-unbind',
];

// Source-of-truth tokens that must exist in real source AND be cited in the doc.
const SOURCE_AND_DOC_ANCHORS = [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['removeFolderFromStateMirror', foldersStoreFile],
  ['restoreFolderToStateMirror', foldersStoreFile],
  ["syncPropagation: 'deferred'", foldersStoreFile],
  ['hardDeleteBlocked', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile],
  ['h2o.studio.folder-delete-request.v1', folderSyncFile],
  ['h2o.studio.folder-restore-request.v1', folderSyncFile],
  ['h2o.studio.chat-folder-binding-request.v1', folderSyncFile],
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
assert(exists(f1Doc), `${f1Doc}: missing`);
if (!exists(f1Doc)) {
  console.error('FAIL validate-folder-sync-f1-source-of-truth-reconciliation');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f1Doc);
assert(doc.length > 4000, `${f1Doc}: F1 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- diagnostic/design only + audit commit ----
for (const marker of ['DIAGNOSTIC / DESIGN ONLY', 'No product source was modified']) {
  assert(flat.includes(marker), `F1 doc missing design-only marker: ${marker}`);
}
assert(flat.includes('3f92386'), 'F1 doc must reference the audit commit 3f92386');
assert(exists(auditDoc), 'folder-sync readiness audit doc must exist on disk');

// ---- identifies the split + names the mirror + SQLite canonical + native-owner + request loops ----
assert(/source-of-truth split/i.test(flat) || /render-vs-canonical/i.test(flat) || flat.includes('render mirror'),
  'F1 doc must identify the source-of-truth split');
assert(flat.includes('FOLDER_STATE_DATA_KEY'), 'F1 doc must name FOLDER_STATE_DATA_KEY');
assert(flat.includes('SQLite `folders`') && flat.includes('canonical'),
  'F1 doc must identify SQLite folders as canonical Desktop storage');
assert(flat.includes('native ChatGPT folder owner') || flat.includes('native-owner') || flat.includes('native ChatGPT'),
  'F1 doc must identify the Chrome native-owner mutation path');
for (const schema of ['h2o.studio.folder-delete-request.v1', 'h2o.studio.folder-restore-request.v1',
  'h2o.studio.chat-folder-binding-request.v1']) {
  assert(flat.includes(schema), `F1 doc must identify the H2O request loop ${schema}`);
}

// ---- reconciliation model + authoritative-per-field ----
assert(flat.includes('Reconciliation Model'), 'F1 doc must define a reconciliation model');
assert(flat.includes('Authoritative State Per Field') || flat.includes('Authoritative'),
  'F1 doc must decide authoritative state per field');
assert(flat.includes('derived write-through projection') || flat.includes('derived projection'),
  'F1 doc must define the mirror as a derived projection of SQLite');

// ---- boundaries ----
assert(/no hard delete/i.test(flat), 'F1 doc must state no hard delete');
assert(/folder delete preserves chats/i.test(flat) || flat.includes('delete preserves chats'),
  'F1 doc must state folder delete preserves chats');
assert(flat.includes('Desktop remains canonical'), 'F1 doc must keep Desktop canonical by default');
assert(/Chrome does not become canonical/i.test(flat) || flat.includes('Chrome stays non-canonical'),
  'F1 doc must keep Chrome non-canonical without explicit later approval');

// ---- postures + recommendation ----
assert(flat.includes('NOT READY'), 'F1 doc must state folder sync is NOT READY');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('Public/premium sync: REMAINS BLOCKED') ||
  flat.includes('public/premium remains blocked') || flat.includes('REMAINS BLOCKED'),
  'F1 doc must keep public/premium sync blocked');
assert(/Real remote WebDAV: SHOULD WAIT/i.test(flat) || flat.includes('should wait'),
  'F1 doc must state real remote WebDAV should wait');
assert(flat.includes('validator-only drift detector'), 'F1 doc must recommend the F2 validator-only drift detector');
assert(!/folder sync is (now )?ready/i.test(flat), 'F1 doc must not over-claim folder sync readiness');

// ---- metadata lane untouched (named in doc) ----
for (const type of F1_METADATA_APPLIED_TYPES) assert(flat.includes(type), `F1 doc must confirm metadata applied type: ${type}`);

// ---- source anchors real in source AND cited in doc ----
for (const [token, file] of SOURCE_AND_DOC_ANCHORS) {
  assert(exists(file), `source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `token absent from source ${file}: ${token}`);
  assert(flat.includes(token), `F1 doc does not cite source token: ${token}`);
}

// ---- closed metadata lane must remain untouched in source ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseMetadataAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    const sorted = applied.slice().sort();
    const expected = CURRENT_METADATA_APPLIED_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `metadata applied allowlist drifted: expected exactly [${expected.join(', ')}], got [${sorted.join(', ')}]`);
  }
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(exists(file) && read(file).includes("webdav: 'deferred'"),
    `metadata-lane WebDAV must remain deferred (webdav: 'deferred') in ${file}`);
}

if (failures.length) {
  console.error('FAIL validate-folder-sync-f1-source-of-truth-reconciliation');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f1-source-of-truth-reconciliation.v1',
  lane: 'folder-sync',
  phase: 'F1',
  f1Doc,
  designOnly: true,
  auditCommitReferenced: '3f92386',
  canonicalOwner: 'desktop-sqlite-folders',
  renderMirror: 'FOLDER_STATE_DATA_KEY',
  sourceAnchorsVerified: SOURCE_AND_DOC_ANCHORS.length,
  recommendedNext: 'F2-validator-only-drift-detector',
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavWaits: true,
  f1HistoricalMetadataAllowlist: F1_METADATA_APPLIED_TYPES,
  currentMetadataAllowlist: parseMetadataAllowlist(read(folderSyncFile)),
}, null, 2));
console.log('PASS validate-folder-sync-f1-source-of-truth-reconciliation');
