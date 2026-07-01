#!/usr/bin/env node
//
// Folder Sync Phase F10 — mirror write-through/rebuild spec meta-validator (design/spec only).
//
// Verifies the F10 doc exists and is internally consistent (design/spec only): specifies the mirror
// write-through/rebuild model, keeps Desktop SQLite canonical and FOLDER_STATE_DATA_KEY a derived render
// mirror, classifies the four drift classes, allows ONLY the render-only rebuild candidates, keeps
// binding repair blocked and sortOrder under canonical review, defines the no-write boundary + F11 entry
// criteria + validator/live-proof requirements + rollback, preserves the hard-delete/delete-preserves-
// chats and cross-surface invariants, keeps productSyncReady false and Chat Saving CAS blocked, references
// the F9 commit, and recommends F11. It grounds the key claims against real source (fullBundle stays v2
// with no v3; WebDAV deferred; folder substrate) and uses a BOUNDED metadata-lane guard. Binds no socket.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f10Doc = 'release-evidence/2026-06-25/folder-sync-f10-mirror-write-through-rebuild-spec.md';
const f9Doc = 'release-evidence/2026-06-25/folder-sync-f9-productsyncready-readiness-gate.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F9_COMMIT = '157d66a';
const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);
const DRIFT_CLASSES = ['missing-mirror-folder', 'field-mismatch:color', 'field-mismatch:sortOrder', 'binding-mismatch'];

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
assert(exists(f10Doc), `${f10Doc}: missing`);
if (!exists(f10Doc)) {
  console.error('FAIL validate-folder-sync-f10-mirror-write-through-rebuild-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f10Doc);
assert(doc.length > 4000, `${f10Doc}: F10 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec only; no writes ----
for (const marker of ['DESIGN / SPECIFICATION ONLY', 'No product source was modified',
  'The mirror was NOT made write-through', '`productSyncReady` was NOT flipped']) {
  assert(flat.includes(marker), `F10 doc missing design-only marker: ${marker}`);
}
assert(flat.includes('F10 writes NOTHING') || flat.includes('No-Write Boundary'),
  'F10 doc must define the no-write boundary');

// ---- F9 commit ----
assert(flat.includes(F9_COMMIT), 'F10 doc must reference the F9 commit 157d66a');
assert(exists(f9Doc), 'F9 readiness-gate doc must exist on disk');

// ---- canonical model ----
assert(flat.includes('Desktop SQLite') && flat.includes('CANONICAL'), 'F10 doc must define Desktop SQLite as canonical');
assert(flat.includes('FOLDER_STATE_DATA_KEY') && flat.includes('DERIVED RENDER MIRROR'),
  'F10 doc must define FOLDER_STATE_DATA_KEY as a derived render mirror');

// ---- drift-class classification ----
for (const cls of DRIFT_CLASSES) assert(flat.includes(cls), `F10 doc must classify drift class: ${cls}`);
assert(flat.includes('Allowed Future Rebuild Actions') && flat.includes('render-only'),
  'F10 doc must allow only render-only mirror rebuild candidates');
assert(/binding-mismatch` (stays|remains) BLOCKED/i.test(flat) || flat.includes('binding repair (`binding-mismatch`)'),
  'F10 doc must keep binding repair blocked');
assert(flat.includes('canonical ownership decision') || flat.includes('Requires ownership decision first'),
  'F10 doc must keep sortOrder under canonical ownership review');

// ---- entry criteria + validator/live-proof + rollback ----
assert(flat.includes('F11 Implementation Entry Criteria'), 'F10 doc must define F11 entry criteria');
assert(flat.includes('Validator Requirements'), 'F10 doc must define validator requirements');
assert(flat.includes('Live Proof Requirements'), 'F10 doc must define live proof requirements');
assert(flat.includes('Rollback / Recovery'), 'F10 doc must define rollback/recovery');

// ---- safety invariants + postures ----
assert(/hard delete remains blocked/i.test(flat) || /no hard delete/i.test(flat), 'F10 doc must keep hard delete blocked');
assert(/chats are preserved on folder delete/i.test(flat) || /folder delete preserves chats/i.test(flat),
  'F10 doc must preserve chats on folder delete');
assert(/folder delete remains soft \/ tombstone \/ recoverable/i.test(flat) || flat.includes('soft / tombstone / recoverable'),
  'F10 doc must keep folder delete soft/tombstone/recoverable');
assert(/productSyncReady`?: remains `?false`?/i.test(flat) || flat.includes('NOT READY TO FLIP') ||
  flat.includes('productSyncReady` was NOT flipped'), 'F10 doc must keep productSyncReady false / not ready to flip');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*BLOCKED/i.test(flat) ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS remains blocked') ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED'),
  'F10 doc must keep Chat Saving CAS blocked');
assert(/Real remote WebDAV: deferred/i.test(flat) || flat.includes('Real remote WebDAV remains deferred') ||
  flat.includes('Real remote WebDAV: deferred'), 'F10 doc must keep real remote WebDAV deferred');
assert(/Public\/premium sync remains blocked/i.test(flat) || flat.includes('Public/premium: blocked') ||
  flat.includes('public/premium sync remains blocked'), 'F10 doc must keep public/premium blocked');

// ---- cross-surface + recommendation ----
assert(flat.includes('Cross-Surface Requirement'), 'F10 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F10 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F10 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F10 doc must include Chrome / native extension');
assert(flat.includes('Recommended F11'), 'F10 doc must recommend F11');

// ---- metadata core present (named) ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F10 doc must confirm metadata core type: ${type}`);

// ---- source anchors intact ----
for (const [token, file] of [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile], ['hardDeleteBlocked', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile]]) {
  assert(exists(file) && read(file).includes(token), `folder substrate token absent from ${file}: ${token}`);
}

// ---- REAL SOURCE: fullBundle v2/no-v3; WebDAV deferred; bounded metadata guard ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
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
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f10-mirror-write-through-rebuild-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f10-mirror-write-through-rebuild-spec.v1',
  lane: 'folder-sync',
  phase: 'F10',
  f10Doc,
  designOnly: true,
  f9CommitReferenced: F9_COMMIT,
  canonicalOwner: 'desktop-sqlite-folders',
  renderMirror: 'FOLDER_STATE_DATA_KEY',
  rebuildAllowedLater: ['missing-mirror-folder', 'field-mismatch:color'],
  ownershipReviewRequired: ['field-mismatch:sortOrder'],
  blocked: ['binding-mismatch', 'productSyncReady-flip', 'chat-saving-cas-restart', 'remote-webdav'],
  productSyncReady: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F11-render-only-mirror-write-through-rebuild-impl',
}, null, 2));
console.log('PASS validate-folder-sync-f10-mirror-write-through-rebuild-spec');
