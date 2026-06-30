#!/usr/bin/env node
//
// Phase 29 — WebDAV Gate C design-to-proof bridge meta-validator (design/proof-plan only, no behavior).
//
// Verifies the Gate C proof-bridge doc exists and is internally consistent: design/proof-plan only,
// defines the end-to-end live-proof sequence, the control-plane manifest proof, the guard matrix, the
// redaction/privacy proof, the failure/recovery proof, the runtime evidence capture points, and the
// Phase 30 entry conditions; keeps envelopes/schema/allowlist unchanged and product metadata sync
// globally NOT READY; references the Phase 28 commit; and — as real drift guards — confirms the source
// allowlist is exactly four and WebDAV remains deferred in source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const planDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase29-webdav-gate-c-proof-bridge.md';
const phase28Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.md';
const phase28Validator = 'tools/validation/sync/validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const MANIFEST_FIELDS = [
  'transportKind', 'schemaVersion', 'remoteRootRef', 'safePeerDirectory', 'peerIdentity',
  'sequenceNumber', 'previousExportId', 'contentHash', 'fileHash', 'lastKnownRemoteState',
  'conflictStatus', 'writeStatus', 'readStatus', 'recoveryStatus', 'privacyRedactionStatus',
];

const GUARD_MATRIX = [
  'feature-gate-guard', 'dev-only-write-flag-guard', 'envelope-unchanged-guard',
  'allowlist-unchanged-guard', 'authority-model-guard', 'chrome-read-only-guard',
  'desktop-canonical-guard', 'no-destructive-action-guard', 'no-schema-mutation-guard',
  'no-secret-raw-data-evidence-guard', 'checksum-integrity-guard', 'sequence-monotonicity-guard',
  'peer-identity-guard', 'stale-basis-guard', 'corrupt-partial-file-recovery-guard',
  'product-sync-ready-false-guard',
];

function parseAppliedAllowlist(source) {
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
assert(exists(planDoc), `${planDoc}: missing`);
if (!exists(planDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase29-webdav-gate-c-proof-bridge');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(planDoc);
assert(doc.length > 4000, `${planDoc}: proof-bridge doc too short`);
// Markdown wraps prose across lines; normalize whitespace before phrase checks.
const flat = doc.replace(/\s+/g, ' ');

// ---- design/proof-plan only; no implementation, no writes ----
for (const marker of ['DESIGN / PROOF-PLAN ONLY', 'No WebDAV transport was implemented',
  'No WebDAV writes are enabled', 'No remote files are written', 'No source modules were modified']) {
  assert(flat.includes(marker), `proof-bridge doc missing design-only marker: ${marker}`);
}

// ---- Phase 28 commit + validator references ----
assert(flat.includes('3654291'), 'proof-bridge doc must reference the Phase 28 commit 3654291');
assert(flat.includes('validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.mjs'),
  'proof-bridge doc must reference the Phase 28 validator');
assert(exists(phase28Validator), 'Phase 28 validator file must exist on disk');
assert(exists(phase28Doc), 'Phase 28 spec doc must exist on disk');

// ---- Gate C live-proof plan + sequence ----
assert(flat.includes('Gate C Live-Proof Plan'), 'proof-bridge doc must define the Gate C live-proof plan');
assert(flat.includes('End-to-End Proof Sequence'), 'proof-bridge doc must define the end-to-end proof sequence');
for (const step of [
  'Chrome request export envelope remains unchanged',
  'byte-equivalent `chrome-latest.json`',
  'applies only one of the four allowed request types',
  'byte-equivalent `latest.json`',
  'imports the receipt + projection read-only',
  'skipped_duplicate',
  'falls back safely to local sync-folder JSON',
]) {
  assert(flat.includes(step), `proof sequence missing step: ${step}`);
}

// ---- control-plane manifest proof ----
assert(flat.includes('Control-Plane Manifest Proof'), 'proof-bridge doc must define the control-plane manifest proof');
assert(flat.includes('h2o.studio.sync.webdav-transport-control-plane.v1'),
  'manifest proof must reference the control-plane schema');
for (const field of MANIFEST_FIELDS) assert(flat.includes(field), `manifest proof missing field: ${field}`);

// ---- guard matrix proof ----
assert(flat.includes('Guard Matrix'), 'proof-bridge doc must define the guard matrix');
for (const guard of GUARD_MATRIX) assert(flat.includes(guard), `guard matrix missing guard: ${guard}`);

// ---- redaction/privacy + failure/recovery proofs ----
assert(flat.includes('Redaction / Privacy Proof'), 'proof-bridge doc must define the redaction/privacy proof');
assert(flat.includes('Failure / Recovery Proof'), 'proof-bridge doc must define the failure/recovery proof');
assert(flat.includes('Runtime Evidence Capture Points'), 'proof-bridge doc must define runtime evidence capture points');

// ---- same envelopes only + no schema mutation + no new applied types ----
assert(flat.includes('SAME envelopes unchanged'), 'proof-bridge doc must require the same envelopes carried unchanged');
assert(/no schema mutation/i.test(flat), 'proof-bridge doc must forbid envelope schema mutation');
assert(flat.includes('no new applied request types') || flat.includes('no new applied request type'),
  'proof-bridge doc must forbid new applied request types');

// ---- entry conditions for Phase 30 ----
assert(flat.includes('Entry Conditions for a Later Phase 30'), 'proof-bridge doc must define Phase 30 entry conditions');

// ---- product sync NOT READY globally ----
assert(flat.includes('NOT READY globally'), 'proof-bridge doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(flat), 'proof-bridge doc must not over-claim completion');

// ---- verdict ----
assert(flat.includes('Gate C Proof-Bridge Verdict'), 'proof-bridge doc must state the Gate C verdict');

// ---- REAL SOURCE: allowlist exactly four; WebDAV still deferred ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseAppliedAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS from source');
  if (Array.isArray(applied)) {
    const sorted = applied.slice().sort();
    const expected = APPLIED_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `source applied allowlist drifted: expected exactly [${expected.join(', ')}], got [${sorted.join(', ')}]`);
    for (const a of applied) assert(APPLIED_TYPES.includes(a), `source enables a broader/unexpected applied type: ${a}`);
  }
}
for (const file of [folderSyncFile, folderImportFile]) {
  assert(exists(file), `${file}: missing`);
  if (exists(file)) assert(read(file).includes("webdav: 'deferred'"),
    `WebDAV must remain deferred (webdav: 'deferred') in ${file}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase29-webdav-gate-c-proof-bridge');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase29-webdav-gate-c-proof-bridge.v1',
  phase: 'phase29-webdav-gate-c-proof-bridge',
  planDoc,
  designOnly: true,
  manifestFieldsChecked: MANIFEST_FIELDS.length,
  guardMatrixChecked: GUARD_MATRIX.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase28CommitReferenced: '3654291',
  webdavDeferredInSource: true,
  gateCVerdict: 'ready-design-only',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase29-webdav-gate-c-proof-bridge');
