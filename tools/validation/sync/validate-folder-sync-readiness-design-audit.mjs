#!/usr/bin/env node
//
// Folder Sync Readiness / Design Audit meta-validator (design/audit only, no behavior).
//
// Verifies the folder-sync readiness audit doc exists and is internally consistent: design/audit only,
// separates the folder lane from the metadata lane, carries the hard boundaries, inventories the
// folder store + sync substrate, distinguishes implemented vs missing surfaces, defines required
// validators + live proofs, and recommends the safe first slice (source-of-truth reconciliation) with
// real-remote-waits and public/premium-blocked. It grounds the key substrate claims against real
// source (folders store APIs, the three folder sync request schemas, the FOLDER_STATE_DATA_KEY split,
// the no-hard-delete invariant) and confirms this lane did NOT disturb the closed metadata lane
// (applied allowlist still exactly four; WebDAV still deferred).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/folder-sync-readiness-design-audit.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const METADATA_APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

// Substrate tokens that must exist in real source AND be cited in the doc.
const SOURCE_AND_DOC_ANCHORS = [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile],
  ['restoreTombstonedFolder', foldersStoreFile],
  ['hardDeleteBlocked', foldersStoreFile],
  ['sortOrder', foldersStoreFile],
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
assert(exists(auditDoc), `${auditDoc}: missing`);
if (!exists(auditDoc)) {
  console.error('FAIL validate-folder-sync-readiness-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 4000, `${auditDoc}: audit doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit only ----
for (const marker of ['DESIGN / READINESS AUDIT ONLY', 'No folder sync was implemented',
  'No source modules were modified']) {
  assert(flat.includes(marker), `audit doc missing design-only marker: ${marker}`);
}

// ---- lane separation + Phase 40 reference ----
assert(flat.includes('7a3a226'), 'audit doc must reference the metadata-lane Phase 40 commit 7a3a226');
assert(flat.includes('SEPARATE FUTURE LANE') || flat.includes('separate lane') || flat.includes('separate future lane'),
  'audit doc must classify folder sync as a separate lane');

// ---- hard boundaries ----
for (const boundary of ['No hard delete', 'soft / tombstone / recoverable',
  'Chats must not be deleted by folder delete', 'Desktop remains canonical authority',
  'transport only, not authority', 'Product sync remains NOT READY', 'Public/premium sync remains blocked']) {
  assert(flat.includes(boundary), `audit doc missing hard boundary: ${boundary}`);
}

// ---- substrate inventory + implemented/missing classification ----
assert(flat.includes('Existing Folder Data Model') || flat.includes('Store APIs'),
  'audit doc must inventory the folder store APIs');
assert(flat.includes('Implemented vs Missing'), 'audit doc must classify implemented vs missing surfaces');
for (const api of ['softDeleteEmptyFolder', 'restoreTombstonedFolder', 'bindChat', 'sortOrder', 'hardDeleteBlocked']) {
  assert(flat.includes(api), `audit doc missing store-API citation: ${api}`);
}

// ---- safe unit + validators + live proofs ----
assert(flat.includes('Safe Folder Sync Unit'), 'audit doc must decide the safe folder sync unit');
assert(flat.includes('reconciliation diagnostic') || flat.includes('source-of-truth reconciliation'),
  'audit doc must recommend the source-of-truth reconciliation first slice');
assert(flat.includes('Required Validators'), 'audit doc must define required validators');
assert(flat.includes('Required Live Proofs'), 'audit doc must define required live proofs');

// ---- recommendation: real-remote waits + public/premium blocked + verdict NOT READY ----
assert(/Real remote WebDAV (SHOULD WAIT|should wait)/.test(flat), 'audit doc must state real remote WebDAV should wait');
assert(/Public\/premium sync REMAINS BLOCKED/i.test(flat) || flat.includes('Public/premium sync remains blocked'),
  'audit doc must keep public/premium sync blocked');
assert(flat.includes('Folder Sync Readiness Verdict'), 'audit doc must state the readiness verdict');
assert(flat.includes('NOT READY'), 'audit doc must state folder sync is NOT READY');
assert(!/folder sync is (now )?ready/i.test(flat), 'audit doc must not over-claim folder sync readiness');

// ---- substrate anchors real in source AND cited in doc ----
for (const [token, file] of SOURCE_AND_DOC_ANCHORS) {
  assert(exists(file), `substrate source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `substrate token absent from source ${file}: ${token}`);
  assert(flat.includes(token), `audit doc does not cite substrate token: ${token}`);
}

// ---- this lane must NOT disturb the closed metadata lane ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseMetadataAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    const sorted = applied.slice().sort();
    const expected = METADATA_APPLIED_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `metadata applied allowlist drifted: expected exactly [${expected.join(', ')}], got [${sorted.join(', ')}]`);
  }
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(exists(file) && read(file).includes("webdav: 'deferred'"),
    `metadata-lane WebDAV must remain deferred (webdav: 'deferred') in ${file}`);
}

if (failures.length) {
  console.error('FAIL validate-folder-sync-readiness-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.readiness-design-audit.v1',
  lane: 'folder-sync',
  auditDoc,
  designOnly: true,
  readinessVerdict: 'not-ready-reopened-source-of-truth-split',
  firstSlice: 'folder-canonical-source-of-truth-reconciliation-diagnostic',
  realRemoteWebdavWaits: true,
  publicPremiumBlocked: true,
  substrateAnchorsVerified: SOURCE_AND_DOC_ANCHORS.length,
  metadataAllowlistUntouched: parseMetadataAllowlist(read(folderSyncFile)),
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-folder-sync-readiness-design-audit');
