#!/usr/bin/env node
//
// Folder Sync Phase F12B — render-only mirror rebuild LIVE APPLY proof meta-validator (evidence only).
//
// Verifies the F12B doc exists and is internally consistent (controlled live Desktop apply + read-only
// re-probe evidence only): references the F12A + F11 commits; records the pre-apply dry-run, the single
// gated apply (apply:true), and the post-apply F5-style read-only drift re-probe; proves the apply was
// gated (folder-sync-f11-render-only-mirror-rebuild), wrote ONLY FOLDER_STATE_DATA_KEY
// (mirrorWriteAttempted:true / mirrorWriteOk:true + every non-mirror write flag true), handled ONLY
// missing-mirror-folder + field-mismatch:color, kept field-mismatch:sortOrder + binding-mismatch
// blocked/skipped; proves the post-apply re-probe CLEARED missing-mirror-folder + field-mismatch:color
// while binding-mismatch + field-mismatch:sortOrder remain, with writeCallCount:0 / diagnosticCount:7 /
// read-only safety flags true / hash-only diagnostics; keeps productSyncReady false, public/premium
// blocked, real remote WebDAV deferred, Chat Saving WebDAV/cloud/archive CAS blocked; and recommends F13
// as a sustained-parity / idempotence re-probe (not a productSyncReady flip). It grounds the claims
// against REAL SOURCE (the committed F11 helper: gate constant, single mirror write target, dry-run
// default, render-only-mirror-rebuilt status, always-blocked sortOrder+binding classes, skip counters)
// and against the folder substrate + a BOUNDED metadata-lane guard (four core present; applied within
// the four core plus the known Operational unbinds). Binds no socket; makes no network call; does NOT run
// the helper or perform any write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f12bDoc = 'release-evidence/2026-06-25/folder-sync-f12b-render-only-mirror-rebuild-apply-proof.md';
const f12aDoc = 'release-evidence/2026-06-25/folder-sync-f12a-render-only-mirror-rebuild-dry-run-proof.md';
const f11Doc = 'release-evidence/2026-06-25/folder-sync-f11-render-only-mirror-rebuild.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F12A_COMMIT = '0a16f5a';
const F11_COMMIT = '1776e17';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const F11_SCHEMA = 'h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1';
const PROBE_SCHEMA = 'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1';
const FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
const HANDLED_CLASSES = ['missing-mirror-folder', 'field-mismatch:color'];
const BLOCKED_CLASSES = ['field-mismatch:sortOrder', 'binding-mismatch'];
const APPLY_NO_WRITE_FLAGS = [
  'noSQLiteWrite', 'noBindingWrite', 'noTombstoneWrite', 'noTransportWrite', 'noWebdavWrite',
  'noChatSavingCas', 'noChromeCanonicalMutation', 'noFolderDelete', 'noFolderPurge',
  'noSortOrderOverwrite', 'noBindingRepair',
];
const PROBE_SAFETY_FLAGS = [
  'noSqliteMutation', 'noChromeStorageMutation', 'noTombstoneMutation', 'noBindingMutation',
  'noTransportWrite', 'noWebdavWrite',
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
function has(flat, jsonKey, val) {
  return new RegExp('"' + jsonKey + '": ' + val).test(flat) || flat.includes(jsonKey + ': ' + val);
}

// ---- doc presence ----
assert(exists(f12bDoc), `${f12bDoc}: missing`);
if (!exists(f12bDoc)) {
  console.error('FAIL validate-folder-sync-f12b-render-only-mirror-rebuild-apply-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f12bDoc);
assert(doc.length > 5000, `${f12bDoc}: F12B doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- live apply-proof markers ----
assert(flat.includes('CONTROLLED LIVE DESKTOP APPLY PROOF ONLY'), 'F12B doc must mark itself controlled-live-apply-proof only');
assert(flat.includes('Desktop Studio') && flat.includes('DevTools'), 'F12B doc must record live Desktop DevTools evidence');
assert(flat.includes('rebuildRenderMirrorFromSqlite'), 'F12B doc must name the F11 helper');
assert(flat.includes(F11_SCHEMA), `F12B doc must record the F11 result schema: ${F11_SCHEMA}`);
assert(flat.includes(PROBE_SCHEMA), `F12B doc must record the F5-style probe schema: ${PROBE_SCHEMA}`);

// ---- commit references ----
assert(flat.includes(F12A_COMMIT), `F12B doc must reference the F12A commit ${F12A_COMMIT}`);
assert(flat.includes(F11_COMMIT), `F12B doc must reference the F11 commit ${F11_COMMIT}`);
assert(exists(f12aDoc), 'F12A dry-run doc must exist on disk');
assert(exists(f11Doc), 'F11 evidence doc must exist on disk');

// ---- three recorded steps ----
assert(/Pre-Apply Confirmation Dry-Run/i.test(flat), 'F12B doc must record the pre-apply dry-run step');
assert(/Gated Apply/i.test(flat), 'F12B doc must record the gated apply step');
assert(/Post-Apply Read-Only Drift Re-Probe/i.test(flat), 'F12B doc must record the post-apply read-only drift re-probe');

// ---- gate + apply posture ----
assert(flat.includes(F11_GATE), `F12B doc must record the F11 gate: ${F11_GATE}`);
assert(has(flat, 'gateSatisfied', 'true'), 'F12B doc must prove gateSatisfied:true');
assert(has(flat, 'dryRun', 'false'), 'F12B doc must prove dryRun:false on apply');
assert(has(flat, 'applyRequested', 'true'), 'F12B doc must prove applyRequested:true on apply');
assert(has(flat, 'mirrorWriteAttempted', 'true'), 'F12B doc must prove mirrorWriteAttempted:true on apply');
assert(has(flat, 'mirrorWriteOk', 'true'), 'F12B doc must prove mirrorWriteOk:true on apply');
assert(/"status": "render-only-mirror-rebuilt"/.test(flat) || flat.includes('render-only-mirror-rebuilt'),
  'F12B doc must record apply status render-only-mirror-rebuilt');
// dry-run precursor still present
assert(/"status": "dry-run-render-mirror-rebuild-ready"/.test(flat) || flat.includes('dry-run-render-mirror-rebuild-ready'),
  'F12B doc must record the pre-apply dry-run status');

// ---- only FOLDER_STATE_DATA_KEY written ----
assert(flat.includes('FOLDER_STATE_DATA_KEY'), 'F12B doc must record the FOLDER_STATE_DATA_KEY target');
assert(flat.includes(FOLDER_STATE_KEY), `F12B doc must record the target key ${FOLDER_STATE_KEY}`);
assert(/only .*FOLDER_STATE_DATA_KEY|WROTE ONLY THE RENDER MIRROR|Only .*FOLDER_STATE_DATA_KEY. written: YES/i.test(flat),
  'F12B doc must assert the only write target was FOLDER_STATE_DATA_KEY');
for (const flag of APPLY_NO_WRITE_FLAGS) {
  assert(has(flat, flag, 'true'), `F12B doc must prove apply no-write flag true: ${flag}`);
}

// ---- handled classes only these two ----
for (const cls of HANDLED_CLASSES) assert(flat.includes(cls), `F12B doc must record handled class: ${cls}`);
assert(has(flat, 'rebuiltMissingMirrorFolderCount', '1'), 'F12B doc must record rebuiltMissingMirrorFolderCount:1');
assert(has(flat, 'rebuiltColorMismatchCount', '1'), 'F12B doc must record rebuiltColorMismatchCount:1');
assert(has(flat, 'skippedSortOrderRebuildCount', '1'), 'F12B doc must record skippedSortOrderRebuildCount:1');
assert(has(flat, 'skippedBindingRepairCount', '1'), 'F12B doc must record skippedBindingRepairCount:1');

// ---- cleared classes (post-apply) ----
assert(/missing-mirror-folder no longer appears/i.test(flat) || /`missing-mirror-folder`[^.]*no longer appears/i.test(flat) ||
  /missing-mirror-folder`? = 0/i.test(flat) || flat.includes('missing-mirror-folder (1)'),
  'F12B doc must prove missing-mirror-folder cleared post-apply');
assert(/field-mismatch:color no longer appears/i.test(flat) || /`field-mismatch:color`[^.]*no longer appears/i.test(flat) ||
  /field-mismatch:color`? = 0/i.test(flat),
  'F12B doc must prove field-mismatch:color cleared post-apply');
assert(/CLEARED/i.test(flat), 'F12B doc must state the two approved classes cleared');

// ---- remaining blocked/gated classes ----
for (const cls of BLOCKED_CLASSES) assert(flat.includes(cls), `F12B doc must record remaining blocked/gated class: ${cls}`);
assert(/binding-mismatch[^.]*(stays|remain|remains|blocked)/i.test(flat), 'F12B doc must keep binding-mismatch blocked');
assert(/sortOrder[^.]*(gated|unchanged|blocked|not[- ]handled)/i.test(flat) ||
  /field-mismatch:sortOrder`? \(gated/i.test(flat), 'F12B doc must keep sortOrder gated/unchanged');

// ---- post-apply probe: writeCallCount 0 + diagnosticCount 7 + read-only ----
assert(has(flat, 'writeCallCount', '0'), 'F12B doc must prove post-apply writeCallCount:0');
assert(has(flat, 'diagnosticCount', '7'), 'F12B doc must record post-apply diagnosticCount:7');
assert(has(flat, 'readOnly', 'true'), 'F12B doc must record the re-probe readOnly:true');
assert(flat.includes('manual-devtools-read-only'), 'F12B doc must record the read-only probe mode');
for (const flag of PROBE_SAFETY_FLAGS) {
  assert(has(flat, flag, 'true'), `F12B doc must prove probe safety flag true: ${flag}`);
}

// ---- redaction / hash-only ----
assert(has(flat, 'redacted', 'true'), 'F12B doc must record privacy.redacted:true');
assert(has(flat, 'hashOnly', 'true'), 'F12B doc must record privacy.hashOnly:true');
assert(/hash-only|hash\/redacted|redacted \/ hash-only/i.test(flat), 'F12B doc must assert diagnostics are hash/redacted only');

// ---- postures ----
assert(has(flat, 'productSyncReady', 'false') || flat.includes('productSyncReady` false') ||
  flat.includes('remains `false`'), 'F12B doc must keep productSyncReady false');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F12B doc must state no fullBundle.v3');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('public/premium sync remains blocked') ||
  flat.includes('Public/premium sync: REMAINS BLOCKED'), 'F12B doc must keep public/premium blocked');
assert(/Real remote WebDAV: deferred/i.test(flat) || flat.includes('Real remote WebDAV: deferred') ||
  flat.includes('real remote WebDAV remains deferred'), 'F12B doc must keep real remote WebDAV deferred');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked)/i.test(flat) ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS remains blocked') ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED'),
  'F12B doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F12B doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F12B doc must preserve chats on folder delete');

// ---- F13 recommendation = sustained parity / idempotence, not a flip ----
assert(flat.includes('Recommended F13'), 'F12B doc must recommend F13');
assert(/sustained[- ]parity|idempotence/i.test(flat), 'F12B doc F13 must be sustained-parity / idempotence');
assert(/NOT a `?productSyncReady`? flip|not a productSyncReady flip/i.test(flat),
  'F12B doc must state F13 is not a productSyncReady flip');

// ---- cross-surface ----
assert(flat.includes('Cross-Surface Requirement'), 'F12B doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F12B doc must require multi-device parity');
assert(flat.includes('mobile'), 'F12B doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F12B doc must include Chrome / native extension');

// ---- metadata core named ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F12B doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: committed F11 helper anchors ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_SCHEMA = '" + F11_SCHEMA + "'"), 'source must define the F11 result schema');
  assert(store.includes('async function rebuildRenderMirrorFromSqlite('), 'source must define the F11 helper');
  assert(store.includes('dryRun: opts.apply !== true'), 'source helper must default to dry-run unless apply:true');
  assert(store.includes("'render-only-mirror-rebuilt'"), 'source helper must emit render-only-mirror-rebuilt on apply');
  assert(store.includes('chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState })'),
    'source helper must write ONLY the FOLDER_STATE_DATA_KEY mirror on apply');
  assert(store.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
    'source helper must always block field-mismatch:sortOrder + binding-mismatch');
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
  console.error('FAIL validate-folder-sync-f12b-render-only-mirror-rebuild-apply-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f12b-render-only-mirror-rebuild-apply-proof.v1',
  lane: 'folder-sync',
  phase: 'F12B',
  f12bDoc,
  liveDesktopApply: true,
  f12aCommitReferenced: F12A_COMMIT,
  f11CommitReferenced: F11_COMMIT,
  gate: F11_GATE,
  gateSatisfied: true,
  applyRun: true,
  onlyWriteTarget: 'FOLDER_STATE_DATA_KEY',
  handledClasses: HANDLED_CLASSES,
  clearedClasses: HANDLED_CLASSES,
  remainingBlockedClasses: BLOCKED_CLASSES,
  postApplyDiagnosticCount: 7,
  postApplyWriteCallCount: 0,
  redactedHashOnly: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F13-sustained-parity-idempotence-re-probe (NOT a productSyncReady flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f12b-render-only-mirror-rebuild-apply-proof');
