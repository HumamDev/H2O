#!/usr/bin/env node
//
// Phase 28 — WebDAV Gate B schema/guard specification meta-validator (design/spec only, no behavior).
//
// Verifies the Gate B spec doc exists and is internally consistent: design-only, defines the
// control-plane schema + fields, the disabled-by-default feature gates, the pre-execution validation
// guards, the failure taxonomy, the negative gates, keeps envelopes/schema/allowlist unchanged, keeps
// product metadata sync globally NOT READY, requires no secrets/raw-data in evidence, references the
// Phase 27 commit, and — as real drift guards — confirms the source allowlist is exactly four and
// WebDAV remains deferred in source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const specDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec.md';
const phase27Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase27-webdav-cloud-relay-design-audit.md';
const phase27Validator = 'tools/validation/sync/validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const CONTROL_PLANE_FIELDS = [
  'transportKind', 'remoteRootRef', 'peerIdentity', 'safePeerDirectory', 'contentHash', 'fileHash',
  'sequenceNumber', 'previousExportId', 'lastKnownRemoteState', 'conflictStatus', 'writeStatus',
  'readStatus', 'recoveryStatus', 'privacyRedactionStatus',
];

const FEATURE_FLAGS = [
  'h2o:studio:sync:webdav:enabled',
  'h2o:studio:sync:webdav:read:enabled',
  'h2o:studio:sync:webdav:write:enabled',
  'h2o:studio:sync:webdav:desktop-export-mirror:enabled',
  'h2o:studio:sync:webdav:chrome-request-export-mirror:enabled',
  'h2o:studio:sync:webdav:dev-flag',
];

const GUARDS = [
  'envelope-unchanged-guard', 'no-new-applied-type-guard', 'authority-guard',
  'gate-guard', 'privacy-guard', 'integrity-guard',
];

const FAILURE_TAXONOMY = [
  'webdav-disabled', 'webdav-missing-config', 'webdav-invalid-config', 'webdav-auth-failure',
  'webdav-permission-denied', 'webdav-remote-unavailable', 'webdav-timeout', 'webdav-partial-upload',
  'webdav-checksum-mismatch', 'webdav-stale-remote', 'webdav-sequence-regression', 'webdav-peer-mismatch',
  'webdav-schema-unsupported', 'webdav-malformed-remote-file', 'webdav-conflict-detected',
  'webdav-recovery-required',
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
assert(exists(specDoc), `${specDoc}: missing`);
if (!exists(specDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(specDoc);
assert(doc.length > 4000, `${specDoc}: spec doc too short`);
// Markdown wraps prose across lines (and indents continuations), so normalize whitespace before
// phrase checks. Single tokens (flag keys, failure codes, field names) have no internal whitespace,
// so this is uniformly safe.
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec only; does not implement WebDAV ----
for (const marker of ['DESIGN / SPECIFICATION ONLY', 'No WebDAV transport was implemented',
  'No remote files are written', 'No source modules were modified']) {
  assert(flat.includes(marker), `spec doc missing design-only marker: ${marker}`);
}

// ---- Phase 27 commit + validator references ----
assert(flat.includes('08cf847'), 'spec doc must reference the Phase 27 commit 08cf847');
assert(flat.includes('validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit.mjs'),
  'spec doc must reference the Phase 27 validator');
assert(exists(phase27Validator), 'Phase 27 validator file must exist on disk');
assert(exists(phase27Doc), 'Phase 27 design-audit doc must exist on disk');

// ---- control-plane schema + fields ----
assert(flat.includes('h2o.studio.sync.webdav-transport-control-plane.v1'),
  'spec doc must define the control-plane schema id');
for (const field of CONTROL_PLANE_FIELDS) assert(flat.includes(field), `control-plane schema missing field: ${field}`);

// ---- feature flags + disabled-by-default + fallback ----
for (const flag of FEATURE_FLAGS) assert(flat.includes(flag), `spec doc missing feature flag: ${flag}`);
assert(flat.includes('globally disabled by default') || flat.includes('default to DISABLED'),
  'spec doc must state WebDAV is disabled by default');
assert(flat.includes('Safe fallback') || flat.includes('safe fallback'),
  'spec doc must define safe fallback to local sync-folder JSON');
assert(flat.includes('no public/premium default enablement') || flat.includes('No public/premium default enablement'),
  'spec doc must forbid public/premium default enablement');

// ---- validation guards ----
assert(flat.includes('Validation Guards'), 'spec doc must define validation guards');
for (const guard of GUARDS) assert(flat.includes(guard), `spec doc missing validation guard: ${guard}`);

// ---- failure taxonomy ----
for (const code of FAILURE_TAXONOMY) assert(flat.includes(code), `spec doc missing failure code: ${code}`);

// ---- same envelopes only + no schema mutation + no new applied types ----
assert(flat.includes('carries the SAME envelopes unchanged'),
  'spec doc must require the same envelopes carried unchanged');
assert(/no schema mutation/i.test(flat), 'spec doc must forbid envelope schema mutation');
assert(flat.includes('No new applied metadata request types'), 'spec doc must forbid new applied request types');

// ---- negative gates ----
assert(flat.includes('Negative Gates'), 'spec doc must define negative gates that block implementation');

// ---- no secrets / raw data in evidence ----
assert(flat.includes('No secrets/credentials in evidence'), 'spec doc must require no secrets/credentials in evidence');
assert(flat.includes('No raw chat titles/content/names/account-linked metadata in WebDAV diagnostics') ||
  flat.includes('no raw chat titles/content/names'),
  'spec doc must forbid raw chat data in WebDAV diagnostics');

// ---- product sync NOT READY globally ----
assert(flat.includes('NOT READY globally'), 'spec doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(flat), 'spec doc must not over-claim completion');

// ---- Gate B verdict ----
assert(flat.includes('Gate B Design Verdict'), 'spec doc must state the Gate B design verdict');

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
  console.error('FAIL validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase28-webdav-gate-b-schema-guard-spec.v1',
  phase: 'phase28-webdav-gate-b-schema-guard-spec',
  specDoc,
  designOnly: true,
  controlPlaneSchema: 'h2o.studio.sync.webdav-transport-control-plane.v1',
  controlPlaneFieldsChecked: CONTROL_PLANE_FIELDS.length,
  featureFlagsChecked: FEATURE_FLAGS.length,
  guardsChecked: GUARDS.length,
  failureTaxonomyChecked: FAILURE_TAXONOMY.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase27CommitReferenced: '08cf847',
  webdavDeferredInSource: true,
  gateBVerdict: 'ready-design-only',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase28-webdav-gate-b-schema-guard-spec');
