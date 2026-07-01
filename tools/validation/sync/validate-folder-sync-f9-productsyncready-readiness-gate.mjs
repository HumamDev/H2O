#!/usr/bin/env node
//
// Folder Sync Phase F9 — productSyncReady local readiness-gate meta-validator (audit/readiness only).
//
// Verifies the F9 doc exists and is internally consistent (audit/readiness only): summarizes F1-F8,
// records F8 as PASSED_CHROME_DESKTOP_FOLDER_PARITY, keeps productSyncReady:false, states no
// fullBundle.v3 / no WebDAV/cloud/archive CAS / Chat Saving restart blocked / public-premium blocked,
// keeps Desktop-canonical + Chrome-read-only postures, carries the cross-surface (Desktop + Chrome/native
// multi-device + mobile) requirement, references the F8 commit, and recommends the next phase. It grounds
// the key claims against real source (fullBundle stays v2 with no v3; WebDAV deferred; folder substrate)
// and uses a BOUNDED metadata-lane guard (four core present; applied within the four core plus the known
// Operational unbinds). Binds no socket; makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f9Doc = 'release-evidence/2026-06-25/folder-sync-f9-productsyncready-readiness-gate.md';
const f8Doc = 'release-evidence/2026-06-25/folder-sync-f8-live-chrome-desktop-parity-proof.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F8_COMMIT = '0f03357';
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
assert(exists(f9Doc), `${f9Doc}: missing`);
if (!exists(f9Doc)) {
  console.error('FAIL validate-folder-sync-f9-productsyncready-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f9Doc);
assert(doc.length > 4000, `${f9Doc}: F9 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- audit/readiness only ----
for (const marker of ['AUDIT / READINESS GATE ONLY', 'No product source was modified',
  '`productSyncReady` was NOT flipped']) {
  assert(flat.includes(marker), `F9 doc missing readiness-only marker: ${marker}`);
}

// ---- F8 commit + summary + PASSED status ----
assert(flat.includes(F8_COMMIT), 'F9 doc must reference the F8 Chrome proof commit 0f03357');
assert(exists(f8Doc), 'F8 parity proof doc must exist on disk');
assert(flat.includes('F1–F8 Folder Lane Summary') || flat.includes('F1-F8'),
  'F9 doc must summarize F1-F8');
for (const p of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) {
  assert(flat.includes(p), `F9 doc must reference phase ${p}`);
}
assert(flat.includes('PASSED_CHROME_DESKTOP_FOLDER_PARITY'), 'F9 doc must record F8 PASSED_CHROME_DESKTOP_FOLDER_PARITY');

// ---- productSyncReady false + no fullBundle.v3 + no CAS + Chat Saving blocked ----
assert(/productSyncReady` stays `false`/.test(flat) || flat.includes('productSyncReady: `false`') ||
  flat.includes('productSyncReady:false'), 'F9 doc must keep productSyncReady false');
assert(/was NOT flipped/i.test(flat), 'F9 doc must state productSyncReady was not flipped');
assert(/no `?fullBundle\.v3`?/i.test(flat), 'F9 doc must state no fullBundle.v3');
assert(/no WebDAV\/cloud\/archive CAS/i.test(flat), 'F9 doc must state no WebDAV/cloud/archive CAS');
assert(flat.includes('Chat Saving Restart Remains Blocked') || /Chat Saving[^.]*restart[^.]*BLOCKED/i.test(flat),
  'F9 doc must keep Chat Saving restart blocked');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('REMAINS BLOCKED'),
  'F9 doc must keep public/premium sync blocked');

// ---- authority postures ----
assert(flat.includes('Desktop remains canonical'), 'F9 doc must keep Desktop canonical');
assert(/Chrome remains read-only \/ non-canonical/i.test(flat) || flat.includes('Chrome remains read-only'),
  'F9 doc must keep Chrome read-only / non-canonical');

// ---- cross-surface requirement ----
assert(flat.includes('Cross-Surface Requirement'), 'F9 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F9 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F9 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F9 doc must include Chrome / native extension as a cross-surface participant');

// ---- prerequisite lists + recommendation ----
assert(flat.includes('Prerequisites Before `productSyncReady` Can Flip') || flat.includes('Prerequisites Before'),
  'F9 doc must define the flip prerequisites');
assert(flat.includes('Chat Saving WebDAV/Cloud/Archive CAS Can Restart') || flat.includes('Can Restart'),
  'F9 doc must define the Chat Saving restart prerequisites');
assert(flat.includes('Recommended Next Phase') && flat.includes('write-through / rebuild specification'),
  'F9 doc must recommend the F10 write-through/rebuild spec');

// ---- metadata core present (named) ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F9 doc must confirm metadata core type: ${type}`);

// ---- source anchors intact (folder substrate) ----
for (const [token, file] of [['FOLDER_STATE_DATA_KEY', foldersStoreFile], ['hardDeleteBlocked', foldersStoreFile]]) {
  assert(exists(file) && read(file).includes(token), `folder substrate token absent from ${file}: ${token}`);
}

// ---- REAL SOURCE: fullBundle stays v2, no v3; WebDAV deferred; bounded metadata guard ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes("FULL_BUNDLE_SCHEMA = 'h2o.studio.fullBundle.v2'"), 'source fullBundle schema must remain v2');
  assert(!src.includes('fullBundle.v3'), 'source must not contain fullBundle.v3');
  assert(src.includes("webdav: 'deferred'"), "metadata-lane WebDAV must remain deferred in folder-sync.tauri.js");
  const applied = parseMetadataAllowlist(src);
  assert(Array.isArray(applied), 'could not parse the metadata applied allowlist from source');
  if (Array.isArray(applied)) {
    for (const core of METADATA_CORE_TYPES) assert(applied.includes(core), `metadata core applied type missing: ${core}`);
    for (const a of applied) assert(METADATA_ALLOWED_SUPERSET.includes(a),
      `unexpected applied type beyond the four core + known Operational unbinds: ${a}`);
  }
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  "metadata-lane WebDAV must remain deferred in folder-import.mv3.js");

if (failures.length) {
  console.error('FAIL validate-folder-sync-f9-productsyncready-readiness-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f9-productsyncready-readiness-gate.v1',
  lane: 'folder-sync',
  phase: 'F9',
  f9Doc,
  auditOnly: true,
  f8CommitReferenced: F8_COMMIT,
  f8Status: 'PASSED_CHROME_DESKTOP_FOLDER_PARITY',
  productSyncReady: false,
  productSyncReadyFlipReady: false,
  fullBundleV3Present: false,
  webdavCloudArchiveCas: false,
  chatSavingRestartBlocked: true,
  publicPremiumBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F10-design-only-mirror-write-through-rebuild-spec',
}, null, 2));
console.log('PASS validate-folder-sync-f9-productsyncready-readiness-gate');
