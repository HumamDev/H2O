#!/usr/bin/env node
//
// Folder Sync Phase F13 — render-only mirror rebuild SUSTAINED PARITY / IDEMPOTENCE proof meta-validator
// (evidence only).
//
// Verifies the F13 doc exists and is internally consistent (post-F12B idempotence + read-only re-probe
// evidence only): references the F12B commit; records the no-op idempotence dry-run and the post-check
// F5-style read-only drift re-probe; proves the re-run helper is a no-op
// (status:no-op-render-mirror-already-converged, diagnosticCount:0, handledClasses:[], rebuilt counts 0,
// mirrorWriteAttempted:false / mirrorWriteOk:false + every no-write flag true); proves the two allowed
// classes (missing-mirror-folder + field-mismatch:color) stay cleared; proves the post-check probe has
// diagnosticCount:7 / writeCallCount:0 with only binding-mismatch + field-mismatch:sortOrder remaining
// and hash-only diagnostics; states the optional no-op apply was skipped and no further apply is needed;
// keeps productSyncReady false, public/premium blocked, real remote WebDAV deferred, Chat Saving
// WebDAV/cloud/archive CAS blocked, no fullBundle.v3. It grounds the claims against REAL SOURCE (the
// committed F11 helper: gate constant, no-op branch preceding the write path, dry-run default, always-
// blocked sortOrder+binding classes, single mirror write target) and against the folder substrate + a
// BOUNDED metadata-lane guard (four core present; applied within the four core plus the known Operational
// unbinds). Binds no socket; makes no network call; does NOT run the helper or perform any write.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const f13Doc = 'release-evidence/2026-06-25/folder-sync-f13-mirror-rebuild-sustained-parity-proof.md';
const f12bDoc = 'release-evidence/2026-06-25/folder-sync-f12b-render-only-mirror-rebuild-apply-proof.md';
const f11Doc = 'release-evidence/2026-06-25/folder-sync-f11-render-only-mirror-rebuild.md';
const foldersStoreFile = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const F12B_COMMIT = 'e2b4281';
const F11_GATE = 'folder-sync-f11-render-only-mirror-rebuild';
const F11_SCHEMA = 'h2o.studio.folder-sync.f11-render-only-mirror-rebuild.v1';
const PROBE_SCHEMA = 'h2o.studio.folder-sync.f5-desktop-runtime-drift-report.v1';
const FOLDER_STATE_KEY = 'h2o:prm:cgx:fldrs:state:data:v1';
const CLEARED_CLASSES = ['missing-mirror-folder', 'field-mismatch:color'];
const REMAINING_CLASSES = ['binding-mismatch', 'field-mismatch:sortOrder'];
const NO_WRITE_FLAGS = [
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
assert(exists(f13Doc), `${f13Doc}: missing`);
if (!exists(f13Doc)) {
  console.error('FAIL validate-folder-sync-f13-mirror-rebuild-sustained-parity-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(f13Doc);
assert(doc.length > 5000, `${f13Doc}: F13 doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- sustained-parity / idempotence markers ----
assert(flat.includes('SUSTAINED PARITY / IDEMPOTENCE PROOF ONLY'),
  'F13 doc must mark itself sustained-parity / idempotence proof only');
assert(flat.includes('Desktop Studio') && flat.includes('DevTools'), 'F13 doc must record live Desktop DevTools evidence');
assert(flat.includes('rebuildRenderMirrorFromSqlite'), 'F13 doc must name the F11 helper');
assert(flat.includes(F11_SCHEMA), `F13 doc must record the F11 result schema: ${F11_SCHEMA}`);
assert(flat.includes(PROBE_SCHEMA), `F13 doc must record the F5-style probe schema: ${PROBE_SCHEMA}`);

// ---- commit reference ----
assert(flat.includes(F12B_COMMIT), `F13 doc must reference the F12B commit ${F12B_COMMIT}`);
assert(exists(f12bDoc), 'F12B apply doc must exist on disk');
assert(exists(f11Doc), 'F11 evidence doc must exist on disk');

// ---- no-op dry-run recorded ----
assert(/No-Op Idempotence Dry-Run/i.test(flat), 'F13 doc must record the no-op idempotence dry-run step');
assert(flat.includes(F11_GATE), `F13 doc must record the F11 gate: ${F11_GATE}`);
assert(has(flat, 'gateSatisfied', 'true'), 'F13 doc must prove gateSatisfied:true');
assert(/"status": "no-op-render-mirror-already-converged"/.test(flat) || flat.includes('no-op-render-mirror-already-converged'),
  'F13 doc must prove status no-op-render-mirror-already-converged');
assert(has(flat, 'dryRun', 'true'), 'F13 doc must record dryRun:true on the re-run');
assert(has(flat, 'applyRequested', 'false'), 'F13 doc must record applyRequested:false on the re-run');

// ---- no additional write ----
assert(has(flat, 'mirrorWriteAttempted', 'false'), 'F13 doc must prove mirrorWriteAttempted:false');
assert(has(flat, 'mirrorWriteOk', 'false'), 'F13 doc must prove mirrorWriteOk:false');
assert(has(flat, 'handledClasses', '\\[\\]') || flat.includes('"handledClasses": []') || flat.includes('handledClasses: []') ||
  /handledClasses[^.]*empty/i.test(flat), 'F13 doc must prove handledClasses is empty');
assert(has(flat, 'diagnosticCount', '0'), 'F13 doc must prove no-op diagnosticCount:0');
assert(has(flat, 'rebuiltMissingMirrorFolderCount', '0'), 'F13 doc must record rebuiltMissingMirrorFolderCount:0');
assert(has(flat, 'rebuiltColorMismatchCount', '0'), 'F13 doc must record rebuiltColorMismatchCount:0');
for (const flag of NO_WRITE_FLAGS) {
  assert(has(flat, flag, 'true'), `F13 doc must prove no-op no-write flag true: ${flag}`);
}
assert(/no additional mirror rebuild write was needed after F12B/i.test(flat) ||
  /No additional mirror .* write/i.test(flat), 'F13 doc must state no additional mirror write was needed after F12B');

// ---- allowed classes stay cleared ----
for (const cls of CLEARED_CLASSES) assert(flat.includes(cls), `F13 doc must record cleared class: ${cls}`);
assert(/remain ABSENT|STILL CLEARED|stay converged|remain absent/i.test(flat),
  'F13 doc must prove the two allowed classes stay cleared');

// ---- post-check probe: diagnosticCount 7, writeCallCount 0, remaining classes ----
assert(/Post-Check Read-Only Drift Re-Probe/i.test(flat), 'F13 doc must record the post-check read-only drift re-probe');
assert(has(flat, 'diagnosticCount', '7'), 'F13 doc must record post-probe diagnosticCount:7');
assert(has(flat, 'writeCallCount', '0'), 'F13 doc must prove post-probe writeCallCount:0');
assert(has(flat, 'readOnly', 'true'), 'F13 doc must record the re-probe readOnly:true');
assert(flat.includes('manual-devtools-read-only'), 'F13 doc must record the read-only probe mode');
for (const cls of REMAINING_CLASSES) assert(flat.includes(cls), `F13 doc must record remaining drift class: ${cls}`);
assert(/binding-mismatch[^.]*(stays|remain|remains|blocked)/i.test(flat), 'F13 doc must keep binding-mismatch blocked');
assert(/sortOrder[^.]*(gated|unchanged|blocked)/i.test(flat) || /field-mismatch:sortOrder`? \(gated/i.test(flat),
  'F13 doc must keep sortOrder gated');
for (const flag of PROBE_SAFETY_FLAGS) {
  assert(has(flat, flag, 'true'), `F13 doc must prove probe safety flag true: ${flag}`);
}

// ---- redaction / hash-only ----
assert(/hash-only|hash\/redacted|redacted \/ hash-only/i.test(flat), 'F13 doc must assert diagnostics are hash/redacted only');

// ---- optional apply skipped ----
assert(/Optional Gated No-Op Apply .*SKIPPED|intentionally SKIPPED|INTENTIONALLY SKIPPED/i.test(flat),
  'F13 doc must state the optional no-op apply was skipped');
assert(/no further apply is needed for F13|No further apply is needed/i.test(flat),
  'F13 doc must state no further apply is needed for F13');

// ---- postures ----
assert(has(flat, 'productSyncReady', 'false') || flat.includes('productSyncReady` false') ||
  flat.includes('remains `false`'), 'F13 doc must keep productSyncReady false');
assert(/no `?fullBundle\.v3`?/i.test(flat) || flat.includes('No `fullBundle.v3` was'), 'F13 doc must state no fullBundle.v3');
assert(/Public\/premium sync: REMAINS BLOCKED/i.test(flat) || flat.includes('public/premium sync remains blocked') ||
  flat.includes('Public/premium sync: REMAINS BLOCKED'), 'F13 doc must keep public/premium blocked');
assert(/Real remote WebDAV: deferred/i.test(flat) || flat.includes('real remote WebDAV remains deferred'),
  'F13 doc must keep real remote WebDAV deferred');
assert(/Chat Saving WebDAV\/cloud\/archive CAS[^.]*(REMAINS BLOCKED|remains blocked)/i.test(flat) ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS remains blocked') ||
  flat.includes('Chat Saving WebDAV/cloud/archive CAS: REMAINS BLOCKED'),
  'F13 doc must keep Chat Saving CAS blocked');
assert(/hard delete blocked/i.test(flat) || /no hard delete/i.test(flat), 'F13 doc must keep hard delete blocked');
assert(/folder delete preserves chats/i.test(flat), 'F13 doc must preserve chats on folder delete');

// ---- F14 recommendation = sortOrder ownership decision, design-only ----
assert(flat.includes('Recommended F14'), 'F13 doc must recommend F14');
assert(/sortOrder.*(ownership|canonical)/i.test(flat) || /CANONICAL-OWNERSHIP DECISION/i.test(flat),
  'F13 doc F14 must be the sortOrder canonical-ownership decision');
assert(/design-only|no writes|writes nothing/i.test(flat), 'F13 doc F14 must be design-only / no writes');

// ---- cross-surface ----
assert(flat.includes('Cross-Surface Requirement'), 'F13 doc must include the cross-surface requirement');
assert(flat.includes('MULTIPLE DEVICES') || flat.includes('multiple devices'), 'F13 doc must require multi-device parity');
assert(flat.includes('mobile'), 'F13 doc must include future mobile compatibility');
assert(flat.includes('Chrome / native extension') || flat.includes('native extension'),
  'F13 doc must include Chrome / native extension');

// ---- metadata core named ----
for (const type of METADATA_CORE_TYPES) assert(flat.includes(type), `F13 doc must confirm metadata core type: ${type}`);

// ---- REAL SOURCE: committed F11 helper anchors + idempotence branch ----
assert(exists(foldersStoreFile), `${foldersStoreFile}: missing`);
if (exists(foldersStoreFile)) {
  const store = read(foldersStoreFile);
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_GATE = '" + F11_GATE + "'"), 'source must define the F11 gate constant');
  assert(store.includes("F11_RENDER_MIRROR_REBUILD_SCHEMA = '" + F11_SCHEMA + "'"), 'source must define the F11 result schema');
  assert(store.includes('async function rebuildRenderMirrorFromSqlite('), 'source must define the F11 helper');
  assert(store.includes('dryRun: opts.apply !== true'), 'source helper must default to dry-run unless apply:true');
  assert(store.includes("status = 'no-op-render-mirror-already-converged'"),
    'source helper must have the no-op-render-mirror-already-converged branch');
  // idempotence guarantee: WITHIN the rebuildRenderMirrorFromSqlite body, the no-op branch must precede
  // the apply write path (scope to the helper body — the same chromeStorageSet string also appears in
  // earlier F5c/F5d write helpers, so a whole-file indexOf would match the wrong occurrence).
  const helperStart = store.indexOf('async function rebuildRenderMirrorFromSqlite(');
  const helperEnd = store.indexOf('function buildFolderBindingTombstone(', helperStart);
  const helperBody = helperStart !== -1 && helperEnd !== -1 ? store.slice(helperStart, helperEnd) : '';
  const noopIdx = helperBody.indexOf("status = 'no-op-render-mirror-already-converged'");
  const applyWriteIdx = helperBody.indexOf('chromeStorageSet({ [FOLDER_STATE_DATA_KEY]: nextState })');
  assert(noopIdx !== -1 && applyWriteIdx !== -1 && noopIdx < applyWriteIdx,
    'source no-op branch must precede the apply mirror-write path within the helper (idempotence guarantee)');
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
  console.error('FAIL validate-folder-sync-f13-mirror-rebuild-sustained-parity-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const appliedNow = parseMetadataAllowlist(read(folderSyncFile));
console.log(JSON.stringify({
  schema: 'h2o.studio.folder-sync.f13-mirror-rebuild-sustained-parity-proof.v1',
  lane: 'folder-sync',
  phase: 'F13',
  f13Doc,
  liveDesktopIdempotence: true,
  f12bCommitReferenced: F12B_COMMIT,
  gate: F11_GATE,
  gateSatisfied: true,
  reRunStatus: 'no-op-render-mirror-already-converged',
  additionalWrite: false,
  mirrorWriteAttempted: false,
  handledClasses: [],
  clearedClasses: CLEARED_CLASSES,
  remainingDriftClasses: REMAINING_CLASSES,
  postProbeDiagnosticCount: 7,
  postProbeWriteCallCount: 0,
  optionalApplySkipped: true,
  redactedHashOnly: true,
  productSyncReady: false,
  publicPremiumBlocked: true,
  realRemoteWebdavDeferred: true,
  chatSavingCasBlocked: true,
  metadataCorePresent: METADATA_CORE_TYPES.every((t) => appliedNow.includes(t)),
  metadataAppliedInSource: appliedNow,
  recommendedNext: 'F14-sortOrder-canonical-ownership-decision (design-only, no writes, no flip)',
}, null, 2));
console.log('PASS validate-folder-sync-f13-mirror-rebuild-sustained-parity-proof');
