#!/usr/bin/env node
//
// Folder Sync Phase F34 — S3 live Desktop dry-run BLOCKED-by-stale-basis closeout meta-validator
// (evidence only; records a blocked live attempt).
//
// Verifies the F34 blocked doc exists and is internally consistent: references the F33 commit; records
// BOTH live dry-run attempts (status:rejected / reason:stale-basis / dryRun:true / canonicalWriteCount:0 /
// mirrorReprojection:deferred-to-s2b / appliedAt:null / safety flags true); states F34 did NOT pass and is
// BLOCKED (not failed); blocks S4 controlled apply; keeps S2b design-only + S5 blocked; keeps the standing
// postures; recommends F34a (a no-write basis-hash alignment diagnostic). It grounds the standing
// boundaries against REAL SOURCE (F11 still blocks both classes; binding receipt unminted; the F32 handler
// present + still defers the mirror; fullBundle v2; webdav deferred; bounded metadata guard). Binds no
// socket; performs no write; runs no live Desktop.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f34Doc = 'release-evidence/2026-06-25/folder-sync-f34-s3-live-dry-run-blocked-stale-basis.md';
const f33Doc = 'release-evidence/2026-06-25/folder-sync-f33-inprocess-reprove-and-s2b-design.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }
function count(hay, needle) { let n = 0; let i = hay.indexOf(needle); while (i !== -1) { n += 1; i = hay.indexOf(needle, i + needle.length); } return n; }

const F33_COMMIT = 'fbfd6d8';
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
assert(exists(f34Doc), `${f34Doc}: missing`);
if (!exists(f34Doc)) {
  console.error('FAIL validate-folder-sync-f34-s3-live-dry-run-blocked-stale-basis');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f34Doc);
assert(doc.length > 4000, `${f34Doc}: F34 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- blocked markers ----
assert(/BLOCKED \(not passed, not failed\)|BLOCKED by live stale-basis/i.test(flat), 'F34 doc must mark itself blocked (not passed, not failed)');
assert(flat.includes(F33_COMMIT), `F34 doc must reference the F33 commit ${F33_COMMIT}`);
assert(exists(f33Doc), 'F33 doc must exist on disk');
assert(/F34 did NOT pass/i.test(flat), 'F34 doc must explicitly state it did not pass');
assert(/NOT a product failure/i.test(flat), 'F34 doc must state it is blocked, not a product failure');

// ---- both live attempts recorded ----
assert(/Attempt 1/i.test(flat) && /Attempt 2/i.test(flat), 'F34 doc must record both live attempts');
assert(count(flat, '"status": "rejected"') >= 2 || count(flat, 'status": "rejected"') >= 2,
  'F34 doc must record status rejected for both attempts');
assert(count(flat, '"reason": "stale-basis"') >= 2, 'F34 doc must record reason stale-basis for both attempts');
assert(count(flat, '"dryRun": true') >= 2, 'F34 doc must record dryRun:true for both attempts');
assert(count(flat, '"canonicalWriteCount": 0') >= 2, 'F34 doc must record canonicalWriteCount:0 for both attempts');
assert(count(flat, '"mirrorReprojection": "deferred-to-s2b"') >= 2, 'F34 doc must record mirrorReprojection deferred for both attempts');
assert(count(flat, '"appliedAt": null') >= 2, 'F34 doc must record appliedAt:null for both attempts');
assert(count(flat, '"canonicalAuthority": "desktop-sqlite"') >= 2, 'F34 doc must record canonicalAuthority desktop-sqlite');
for (const marker of ['"noFolderDelete": true', '"noFolderPurge": true', '"noChatDelete": true',
  '"noBindingMutation": true', '"noTombstoneMutation": true']) {
  assert(count(flat, marker) >= 2, `F34 doc must record safety flag on both attempts: ${marker}`);
}
// the telling identity case (attempt 2 basis === requested)
assert(flat.includes('oh:2842e705'), 'F34 doc must record the attempt-2 identity basis hash (oh:2842e705)');
assert(flat.includes('oh:d526bd90'), 'F34 doc must record the attempt-1 basis hash');

// ---- blocked boundaries ----
assert(/S4 controlled apply REMAINS BLOCKED/i.test(flat), 'F34 doc must block S4 controlled apply');
assert(/S2b mirror re-projection REMAINS design-only|deferred-to-s2b/i.test(flat), 'F34 doc must keep S2b design-only');
assert(/S5 F11 allowed-set change REMAINS BLOCKED|field-mismatch:sortOrder` stays in the F11/i.test(flat), 'F34 doc must keep S5/F11 change blocked');
assert(/binding-mismatch` remains BLOCKED|binding-mismatch remains blocked/i.test(flat), 'F34 doc must keep binding-mismatch blocked');
assert(/binding receipt schema remains UNMINTED|binding receipt schema remains unminted/i.test(flat), 'F34 doc must keep binding receipt unminted');
assert(/productSyncReady` remains `false`|NOT READY TO FLIP/i.test(flat), 'F34 doc must keep productSyncReady false');
assert(/public\/premium sync remains blocked|Public\/premium: blocked/i.test(flat), 'F34 doc must keep public/premium blocked');
assert(/Real remote WebDAV remains deferred|Real remote WebDAV[^.]*deferred/i.test(flat), 'F34 doc must keep real remote WebDAV deferred');
assert(/`fullBundle\.v3` not minted|no `?fullBundle\.v3`?/i.test(flat), 'F34 doc must keep fullBundle.v3 not minted');
assert(/Chat Saving WebDAV\/cloud\/archive CAS remains BLOCKED|Chat Saving[^.]*CAS remains blocked/i.test(flat),
  'F34 doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F34 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F34 doc must preserve chats on folder delete');

// ---- cross-surface + F34a ----
assert(flat.includes('Cross-Surface Requirement'), 'F34 doc must include the cross-surface requirement');
assert(flat.includes('mobile') && (flat.includes('native extension') || flat.includes('Chrome / native extension')),
  'F34 doc must carry the cross-surface participants');
assert(flat.includes('Recommended F34a'), 'F34 doc must recommend F34a');
assert(/basis-hash alignment diagnostic|NO-WRITE live basis-hash/i.test(flat), 'F34 doc F34a must be a no-write basis-hash alignment diagnostic');
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F34 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: standing boundaries unchanged ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const src = read(folderSyncFile);
  assert(src.includes('function applyFolderSortorderReorderRequest('), 'F32 handler must still be present');
  assert(src.includes("mirrorReprojection: 'deferred-to-s2b'"), 'F32 handler must still defer mirror re-projection (S2b not implemented)');
  assert(!src.includes(BINDING_RECEIPT_SCHEMA), 'binding receipt schema must remain NOT minted');
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
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'F11 helper must STILL block field-mismatch:sortOrder + binding-mismatch');
  assert(store.includes('folder_bindings') && store.includes('FOLDER_STATE_DATA_KEY') &&
    store.includes('hardDeleteBlocked') && store.includes('softDeleteEmptyFolder'), 'folder substrate tokens intact');
}
assert(exists(folderImportFile) && read(folderImportFile).includes("webdav: 'deferred'"),
  'WebDAV must remain deferred in folder-import.mv3.js');

if (failures.length) {
  console.error('FAIL validate-folder-sync-f34-s3-live-dry-run-blocked-stale-basis');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f34-s3-live-dry-run-blocked-stale-basis.v1',
  lane: 'folder-sync',
  phase: 'F34',
  step: 'S3',
  f34Doc,
  verdict: 'BLOCKED',
  passed: false,
  productFailure: false,
  blockedReason: 'live-stale-basis-hash-mismatch',
  f33CommitReferenced: F33_COMMIT,
  liveAttempts: 2,
  liveStatus: 'rejected',
  liveReason: 'stale-basis',
  canonicalWriteCount: 0,
  mirrorReprojection: 'deferred-to-s2b',
  appliedAt: null,
  s4ControlledApplyBlocked: true,
  s2bDesignOnly: true,
  s5F11FlipBlocked: true,
  bindingReceiptSchemaMinted: false,
  bindingMismatchBlocked: true,
  sortOrderGatedInF11: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  fullBundleV3Present: false,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F34a-no-write-live-basis-hash-alignment-diagnostic (read-only; no apply; no gate; no write)',
}, null, 2));
console.log('PASS validate-folder-sync-f34-s3-live-dry-run-blocked-stale-basis');
