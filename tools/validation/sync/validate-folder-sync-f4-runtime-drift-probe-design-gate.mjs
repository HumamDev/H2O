#!/usr/bin/env node
//
// Folder Sync Phase F4 — runtime drift-probe design-gate meta-validator (design/audit only).
//
// Verifies the F4 doc exists and is internally consistent (design/audit only): defines the
// disabled/read-only Desktop runtime probe boundary, the writer traps (writeCallCount: 0), the read
// surfaces (Desktop SQLite folders + FOLDER_STATE_DATA_KEY), the F3-compatible drift classes, the
// redacted/hash-only output, the cross-surface (Desktop + Chrome/native multi-device + mobile future)
// requirement, the failure modes, and the F5 recommendation; keeps the folder/public-premium/remote
// postures; references the F3 commit; and confirms this folder-sync lane did NOT expand or modify the
// metadata lane. The metadata-lane guard is a SUBSET + BOUNDED check (the four core types remain, and
// the applied allowlist stays within the four core plus the known label/tag Operational unbinds), so it
// tolerates the concurrent out-of-scope Operational expansion without asserting exactly-four. This
// validator binds no socket and makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f4Doc = 'release-evidence/2026-06-25/folder-sync-f4-runtime-drift-probe-design-gate.md';
const f3Doc = 'release-evidence/2026-06-25/folder-sync-f3-read-only-live-drift-probe.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const METADATA_CORE_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
// The concurrent (out-of-scope) label/tag Operational lane may add these; F4 tolerates but does not add them.
const METADATA_ALLOWED_SUPERSET = METADATA_CORE_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);

const F3_DRIFT_CLASSES = [
  'missing-mirror-folder', 'extra-mirror-folder', 'field-mismatch:name', 'field-mismatch:color',
  'field-mismatch:sortOrder', 'tombstone-status-mismatch', 'binding-mismatch',
  'desktop-sqlite-source-diverged', 'stale-deferred-propagation',
];

const WRITER_TRAPS = [
  'writeCallCount: 0', 'no `create` / `upsert` / `patch`', 'no `bindChat` / `unbindChat`',
  'no tombstone mutation', 'no `chrome.storage.set`', 'no export / write transport calls',
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
assert(exists(f4Doc), `${f4Doc}: missing`);
if (!exists(f4Doc)) {
  console.error('FAIL validate-folder-sync-f4-runtime-drift-probe-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f4Doc);
assert(doc.length > 4000, `${f4Doc}: F4 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit only ----
for (const marker of ['DESIGN / AUDIT ONLY', 'No runtime probe was implemented',
  'No product source was modified', 'No reconciliation writes were added']) {
  assert(flat.includes(marker), `F4 doc missing design-only marker: ${marker}`);
}

// ---- F3 commit + doc ----
assert(flat.includes('ba0a13f'), 'F4 doc must reference the F3 commit ba0a13f');
assert(exists(f3Doc), 'F3 read-only drift probe doc must exist on disk');

// ---- runtime probe boundary (disabled/read-only, no writes) ----
assert(flat.includes('Runtime Probe Boundary'), 'F4 doc must define the runtime probe boundary');
for (const b of ['disabled by default / read-only', 'no writes to SQLite',
  'no writes to chrome.storage / `FOLDER_STATE_DATA_KEY`', 'no tombstone writes', 'no binding writes',
  'no mirror repair', 'no WebDAV writes']) {
  assert(flat.includes(b), `F4 doc missing probe boundary: ${b}`);
}
assert(flat.includes('Desktop Studio only for the first live probe'),
  'F4 doc must scope the first live probe to Desktop Studio only');

// ---- read surfaces named ----
assert(flat.includes('Desktop canonical SQLite'), 'F4 doc must name Desktop canonical SQLite folder state');
assert(flat.includes('FOLDER_STATE_DATA_KEY'), 'F4 doc must name the FOLDER_STATE_DATA_KEY mirror');

// ---- writer traps + writeCallCount: 0 ----
assert(flat.includes('Writer Traps'), 'F4 doc must define writer traps');
for (const t of WRITER_TRAPS) assert(flat.includes(t), `F4 doc missing writer trap: ${t}`);

// ---- F3-compatible drift classes ----
for (const cls of F3_DRIFT_CLASSES) assert(flat.includes(cls), `F4 doc missing F3 drift class: ${cls}`);

// ---- redacted/hash-only diagnostics ----
assert(flat.includes('hash-only folder IDs'), 'F4 doc must require hash-only folder IDs');
assert(flat.includes('no raw folder names'), 'F4 doc must forbid raw folder names');
assert(flat.includes('no account / user / mobile / peer raw identifiers') ||
  flat.includes('no account/user/mobile/peer raw identifiers'),
  'F4 doc must forbid raw account/user/mobile/peer identifiers');

// ---- cross-surface requirement (Desktop + Chrome/native multi-device + mobile) ----
assert(flat.includes('Cross-Surface Requirement'), 'F4 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'),
  'F4 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F4 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F4 doc must include Chrome / native extension as a cross-surface participant');

// ---- failure modes + F5 recommendation ----
assert(flat.includes('Failure Modes'), 'F4 doc must define failure modes');
assert(flat.includes('Recommended F5 Slice') && flat.includes('disabled/read-only Desktop runtime probe'),
  'F4 doc must recommend the F5 disabled/read-only Desktop runtime probe');

// ---- postures ----
assert(flat.includes('NOT READY'), 'F4 doc must keep folder sync NOT READY');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('public/premium sync remains blocked') ||
  flat.includes('REMAINS BLOCKED'), 'F4 doc must keep public/premium sync blocked');
assert(/Real remote WebDAV: deferred/i.test(flat) || flat.includes('real remote WebDAV remains deferred'),
  'F4 doc must keep real remote WebDAV deferred');
assert(/hard delete remains blocked/i.test(flat), 'F4 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F4 doc must keep folder delete preserving chats');

// ---- metadata lane not expanded/modified BY THIS folder-sync lane ----
assert(flat.includes('not expanded or modified by this folder-sync lane'),
  'F4 doc must confirm the metadata lane is not expanded/modified by this lane');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F4 doc must confirm metadata core type: ${type}`);

// ---- source anchors intact (folder substrate) ----
for (const [token, file] of [
  ['FOLDER_STATE_DATA_KEY', foldersStoreFile],
  ['hardDeleteBlocked', foldersStoreFile],
  ['softDeleteEmptyFolder', foldersStoreFile],
]) {
  assert(exists(file) && read(file).includes(token), `folder substrate token absent from ${file}: ${token}`);
}

// ---- REAL SOURCE: metadata lane untouched by F4 (core present + bounded by known Operational superset) ----
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
  console.error('FAIL validate-folder-sync-f4-runtime-drift-probe-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f4-runtime-drift-probe-design-gate.v1',
  lane: 'folder-sync',
  phase: 'F4',
  f4Doc,
  designOnly: true,
  f3CommitReferenced: 'ba0a13f',
  probeBoundary: 'disabled-read-only-desktop-first',
  writeCallCount: 0,
  driftClassesChecked: F3_DRIFT_CLASSES.length,
  writerTrapsChecked: WRITER_TRAPS.length,
  crossSurface: ['desktop', 'chrome-native-extension-multi-device', 'mobile-future'],
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  metadataExpandedByThisLane: false,
  recommendedNext: 'F5-disabled-read-only-desktop-runtime-probe',
  folderSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
}, null, 2));
console.log('PASS validate-folder-sync-f4-runtime-drift-probe-design-gate');
