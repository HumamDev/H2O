#!/usr/bin/env node
//
// Folder Sync Phase F12A — render-only mirror rebuild LIVE DRY-RUN proof meta-validator (evidence only).
//
// Verifies the F12A doc exists and is internally consistent (live Desktop dry-run evidence only): records
// the F11 commit and the live Desktop DevTools dry-run output for
// H2O.Studio.store.folders.rebuildRenderMirrorFromSqlite; proves the run was gated (gateSatisfied:true),
// dry-run (dryRun:true / applyRequested:false), wrote NOTHING (mirrorWriteAttempted:false /
// mirrorWriteOk:false + every no-write safety flag true), handled ONLY missing-mirror-folder +
// field-mismatch:color, kept field-mismatch:sortOrder + binding-mismatch blocked/skipped
// (skipped counts 1), recorded diagnosticCount 2 / rebuilt missing 1 / rebuilt color 1, kept diagnostics
// redacted / hash-only, kept productSyncReady false, kept Chat Saving WebDAV/cloud/archive CAS blocked,
// and stated F12B apply is not run and requires explicit approval. It also grounds the claims against
// REAL SOURCE (the committed F11 helper: gate constant, dry-run default, single mirror write target,
// allowed classes, blocked-class skip counters) and against the folder substrate + a BOUNDED metadata-lane
// guard (four core present; applied within the four core plus the known Operational unbinds). Binds no
// socket; makes no network call; does NOT run the helper or perform any write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f12aDoc = 'release-evidence/2026-06-25/folder-sync-f12a-render-only-mirror-rebuild-dry-run-proof.md';
const f11Doc = 'release-evidence/2026-06-25/folder-sync-f11-render-only-mirror-rebuild.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F11_COMMIT = '1776e17';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const F11_SCHEMA = 'h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1';
const FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
const ALLOWED_CLASSES = ['missing-mirror-folder', 'field-mismatch:color'];
const BLOCKED_CLASSES = ['field-mismatch:sortOrder', 'binding-mismatch'];
const NO_WRITE_FLAGS = [
  'noSQLiteWrite', 'noBindingWrite', 'noTombstoneWrite', 'noTransportWrite', 'noWebdavWrite',
  'noChatSavingCas', 'noChromeCanonicalMutation', 'noFolderDelete', 'noFolderPurge',
  'noSortOrderOverwrite', 'noBindingRepair',
];
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
assert(exists(f12aDoc), `${f12aDoc}: missing`);
if (!exists(f12aDoc)) {
  console.error('FAIL validate-folder-sync-f12a-render-only-mirror-rebuild-dry-run-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f12aDoc);
assert(doc.length > 4000, `${f12aDoc}: F12A doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- live dry-run evidence markers ----
assert(flat.includes('LIVE DESKTOP DRY-RUN PROOF ONLY'), 'F12A doc must mark itself live-dry-run-proof only');
assert(flat.includes('Desktop Studio') && flat.includes('DevTools'), 'F12A doc must record live Desktop DevTools evidence');
assert(flat.includes('rebuildRenderMirrorFromSqlite'), 'F12A doc must name the F11 helper');
assert(flat.includes(F11_SCHEMA), `F12A doc must record the F11 result schema: ${F11_SCHEMA}`);

// ---- F11 commit reference ----
assert(flat.includes(F11_COMMIT), `F12A doc must reference the F11 commit ${F11_COMMIT}`);
assert(exists(f11Doc), 'F11 evidence doc must exist on disk');

// ---- gate + dry-run posture ----
assert(flat.includes(F11_GATE), `F12A doc must record the F11 gate: ${F11_GATE}`);
assert(/"gateSatisfied": true/.test(flat) || flat.includes('gateSatisfied: true'), 'F12A doc must prove gateSatisfied:true');
assert(/"dryRun": true/.test(flat) || flat.includes('dryRun: true'), 'F12A doc must prove dryRun:true');
assert(/"applyRequested": false/.test(flat) || flat.includes('applyRequested: false'),
  'F12A doc must prove applyRequested:false');
assert(/"status": "dry-run-render-mirror-rebuild-ready"/.test(flat) || flat.includes('dry-run-render-mirror-rebuild-ready'),
  'F12A doc must record status dry-run-render-mirror-rebuild-ready');
assert(/"ok": true/.test(flat) || flat.includes('ok: true'), 'F12A doc must record ok:true');

// ---- no write occurred ----
assert(/"mirrorWriteAttempted": false/.test(flat) || flat.includes('mirrorWriteAttempted: false'),
  'F12A doc must prove mirrorWriteAttempted:false');
assert(/"mirrorWriteOk": false/.test(flat) || flat.includes('mirrorWriteOk: false'),
  'F12A doc must prove mirrorWriteOk:false');
for (const flag of NO_WRITE_FLAGS) {
  assert(new RegExp('"' + flag + '": true').test(flat) || flat.includes(flag + ': true'),
    `F12A doc must prove no-write flag true: ${flag}`);
}

// ---- canonical + target + render-mirror-only ----
assert(flat.includes('desktop-sqlite-folders'), 'F12A doc must record source desktop-sqlite-folders');
assert(/"desktopSQLiteCanonical": true/.test(flat) || flat.includes('desktopSQLiteCanonical: true'),
  'F12A doc must record desktopSQLiteCanonical:true');
assert(/"renderMirrorOnly": true/.test(flat) || flat.includes('renderMirrorOnly: true'),
  'F12A doc must record renderMirrorOnly:true');
assert(flat.includes('FOLDER_STATE_DATA_KEY'), 'F12A doc must record the FOLDER_STATE_DATA_KEY target');
assert(flat.includes(FOLDER_STATE_KEY), `F12A doc must record the target key ${FOLDER_STATE_KEY}`);

// ---- allowed/handled classes only these two ----
for (const cls of ALLOWED_CLASSES) assert(flat.includes(cls), `F12A doc must record allowed/handled class: ${cls}`);
assert(!flat.includes('folder-move') && !flat.includes('chat-move'), 'F12A doc must not introduce out-of-scope classes');

// ---- blocked/skipped classes ----
for (const cls of BLOCKED_CLASSES) assert(flat.includes(cls), `F12A doc must record blocked/skipped class: ${cls}`);
assert(/"skippedSortOrderRebuildCount": 1/.test(flat) || flat.includes('skippedSortOrderRebuildCount: 1') ||
  flat.includes('skipped sortOrder rebuild count `1`') || flat.includes('skippedSortOrderRebuildCount` is `1`'),
  'F12A doc must prove skippedSortOrderRebuildCount:1');
assert(/"skippedBindingRepairCount": 1/.test(flat) || flat.includes('skippedBindingRepairCount: 1') ||
  flat.includes('skipped binding repair count `1`') || flat.includes('skippedBindingRepairCount` is `1`'),
  'F12A doc must prove skippedBindingRepairCount:1');

// ---- drift plan counts ----
assert(/"diagnosticCount": 2/.test(flat) || flat.includes('diagnosticCount: 2'), 'F12A doc must record diagnosticCount:2');
assert(/"rebuiltMissingMirrorFolderCount": 1/.test(flat) || flat.includes('rebuiltMissingMirrorFolderCount: 1'),
  'F12A doc must record rebuiltMissingMirrorFolderCount:1');
assert(/"rebuiltColorMismatchCount": 1/.test(flat) || flat.includes('rebuiltColorMismatchCount: 1'),
  'F12A doc must record rebuiltColorMismatchCount:1');

// ---- redaction / hash-only ----
assert(/"redacted": true/.test(flat) || flat.includes('redacted: true'), 'F12A doc must record privacy.redacted:true');
assert(/"hashOnly": true/.test(flat) || flat.includes('hashOnly: true'), 'F12A doc must record privacy.hashOnly:true');
assert(flat.includes('sha256:fadec7fe1c3fdf28'), 'F12A doc must record the color-mismatch hash-only folderToken');
assert(flat.includes('sha256:c149ef99393a3c63'), 'F12A doc must record the missing-mirror-folder hash-only folderToken');
assert(flat.includes('folderToken'), 'F12A doc must record hash-only folderToken diagnostics');

// ---- postures ----
assert(/"productSyncReady": false/.test(flat) || flat.includes('productSyncReady: false') ||
  flat.includes('productSyncReady` false') || flat.includes('remains `false`'),
  'F12A doc must keep productSyncReady false');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'),
  'F12A doc must state no fullBundle.v3');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked)/i.test(flat) ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS remains blocked') ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED'),
  'F12A doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F12A doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F12A doc must preserve chats on folder delete');

// ---- F12B not run / requires approval ----
assert(flat.includes('F12B') && (flat.includes('NOT RUN') || flat.includes('not run')),
  'F12A doc must state F12B apply is not run');
assert(/requires explicit approval/i.test(flat) || /MUST NOT be run without explicit approval/i.test(flat),
  'F12A doc must state F12B apply requires explicit approval');

// ---- cross-surface ----
assert(flat.includes('Cross-Surface Requirement'), 'F12A doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F12A doc must require multi-device parity');
assert(flat.includes('mobile'), 'F12A doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F12A doc must include Chrome / native extension');

// ---- metadata core named ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F12A doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: committed F11 helper anchors ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"),
    'source must define the F11 gate constant');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_SCHEMA = '" + F11_SCHEMA + "'"),
    'source must define the F11 result schema');
  assert(store.includes('async function rebuildRenderMirrorFromSqlite('), 'source must define the F11 helper');
  assert(store.includes('dryRun: opts.apply !== true'), 'source helper must default to dry-run unless apply:true');
  assert(store.includes("status = 'dry-run-render-mirror-rebuild-ready'"),
    'source helper must emit dry-run-render-mirror-rebuild-ready');
  assert(store.includes('if (opts.apply !== true) {'), 'source helper must early-return before the mirror write on dry-run');
  assert(store.includes('chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState })'),
    'source helper must write ONLY the FOLDER_STATE_DATA_KEY mirror on apply');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['binding-mismatch'])"),
    'source helper must force-block binding-mismatch (post-S5: sortOrder no longer force-blocked)');
  assert(!store.includes("classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'post-S5: field-mismatch:sortOrder must no longer be force-blocked alongside binding-mismatch');
  assert(store.includes("reviewedRepairPathClasses: ['binding-mismatch']") &&
    store.includes('bindingMismatchRoutedToReviewedRepairPath: true') &&
    store.includes("reviewedRepairRequestSchema: 'h2o.studio.chat-folder-binding-request.v1'") &&
    store.includes("reviewedRepairApplyGate: 'folder-sync-chat-folder-binding-repair-apply'"),
    'S10: binding-mismatch routed to the reviewed F15 request->apply->receipt repair path');
  assert(store.includes('noBindingRepair: true') && store.includes('noBindingWrite: true'),
    'F11 render mirror remains render-only (noBindingRepair + noBindingWrite)');
  assert(store.includes('skippedSortOrderRebuildCount') && store.includes('skippedBindingRepairCount'),
    'source helper must expose the sortOrder/binding skip counters');
  assert(store.includes('FOLDER_STATE_DATA_KEY') && store.includes('hardDeleteBlocked') &&
    store.includes('softDeleteEmptyFolder'), 'folder substrate tokens must remain intact');
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
  console.error('FAIL validate-folder-sync-f12a-render-only-mirror-rebuild-dry-run-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f12a-render-only-mirror-rebuild-dry-run-proof.v1',
  lane: 'folder-sync',
  phase: 'F12A',
  f12aDoc,
  liveDesktopDryRun: true,
  f11CommitReferenced: F11_COMMIT,
  gate: F11_GATE,
  gateSatisfied: true,
  dryRun: true,
  applyRequested: false,
  anyWrite: false,
  mirrorWriteAttempted: false,
  target: 'FOLDER_STATE_DATA_KEY',
  handledClasses: ALLOWED_CLASSES,
  blockedClasses: BLOCKED_CLASSES,
  diagnosticCount: 2,
  rebuiltMissingMirrorFolderCount: 1,
  rebuiltColorMismatchCount: 1,
  skippedSortOrderRebuildCount: 1,
  skippedBindingRepairCount: 1,
  redactedHashOnly: true,
  productSyncReady: false,
  chatSavingCasBlocked: true,
  f12bApplyRun: false,
  f12bRequiresApproval: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F12B-dev-gated-live-apply-render-only-mirror-rebuild (requires explicit approval)',
}, null, 2));
console.log('PASS validate-folder-sync-f12a-render-only-mirror-rebuild-dry-run-proof');
