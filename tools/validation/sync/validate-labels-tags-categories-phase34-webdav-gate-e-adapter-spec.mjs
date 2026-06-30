#!/usr/bin/env node
//
// Phase 34 — WebDAV Gate E dev-only local server adapter spec meta-validator (design/spec only).
//
// Verifies the Gate E adapter spec doc exists and is internally consistent: design/spec only, defines
// the allowed local/mock adapter proof shape, the WebDAV protocol surface, the byte-unchanged envelope
// constraints, the Desktop-canonical / Chrome-request-only authority constraints, the safety gates,
// the failure cases, the Phase 35 entry criteria, and the block conditions; keeps the allowlist at
// exactly four and product metadata sync globally NOT READY; references the Phase 33 commit; and — as
// real drift guards — confirms the source allowlist is exactly four, WebDAV stays deferred in the loop,
// and the gates module remains a disabled-by-default dev sandbox with no server/network code.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const specDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase34-webdav-gate-e-adapter-spec.md';
const phase33Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase33-webdav-next-step-design-gate.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const ADAPTER_SHAPE = [
  'local-only/mock WebDAV server', 'temp/sandbox root only', 'no external WebDAV account',
  'no real user credentials', 'no public/premium enablement',
];

const PROTOCOL_SURFACE = ['PROPFIND', '`PUT`', '`GET`', '`MOVE`', 'ETag', 'partial-upload', 'atomic publish via `MOVE`'];

const FAILURE_CASES = [
  'missing remote file', 'malformed remote file', 'checksum mismatch', 'stale remote',
  'sequence regression', 'peer mismatch', 'interrupted upload', 'failed atomic move',
  'duplicate/replay', 'corrupt sandbox state', 'dev flag missing',
];

const BLOCK_CONDITIONS = [
  'any product WebDAV enablement', 'any real remote WebDAV account dependency',
  'any credential/raw-data evidence', 'any schema mutation', 'any applied allowlist expansion',
  'any Chrome canonical mutation', 'any Desktop authority weakening', 'any write outside the sandbox',
  'any `productSyncReady` true claim',
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
  console.error('FAIL validate-labels-tags-categories-phase34-webdav-gate-e-adapter-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(specDoc);
assert(doc.length > 4000, `${specDoc}: spec doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec only; no adapter/server/network/writes ----
for (const marker of ['DESIGN / SPECIFICATION ONLY', 'No WebDAV server adapter was implemented',
  'No server code was added', 'No network calls were added', 'No remote writes were added',
  'No source modules were modified']) {
  assert(flat.includes(marker), `spec doc missing design-only marker: ${marker}`);
}

// ---- Phase 33 commit reference ----
assert(flat.includes('8cfa9ef'), 'spec doc must reference the Phase 33 commit 8cfa9ef');
assert(exists(phase33Doc), 'Phase 33 design-gate doc must exist on disk');

// ---- disabled by default + dev flag ----
assert(flat.includes('disabled by default'), 'spec doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'), 'spec doc must require the dev-only flag');

// ---- allowed adapter shape ----
assert(flat.includes('Allowed Adapter Proof Shape'), 'spec doc must define the allowed adapter proof shape');
for (const item of ADAPTER_SHAPE) assert(flat.includes(item), `spec doc missing adapter-shape item: ${item}`);

// ---- protocol surface ----
assert(flat.includes('Protocol Surface'), 'spec doc must define the protocol surface');
for (const verb of PROTOCOL_SURFACE) assert(flat.includes(verb), `spec doc missing protocol-surface item: ${verb}`);

// ---- envelope constraints: byte-unchanged + no schema mutation + no new applied types ----
assert(flat.includes('latest.json` byte-unchanged') || flat.includes('latest.json byte-unchanged'),
  'spec doc must require latest.json byte-unchanged');
assert(flat.includes('chrome-latest.json` byte-unchanged') || flat.includes('chrome-latest.json byte-unchanged'),
  'spec doc must require chrome-latest.json byte-unchanged');
assert(/no metadata request\/receipt\/projection schema mutation/i.test(flat) || /no schema mutation/i.test(flat),
  'spec doc must forbid envelope schema mutation');
assert(flat.includes('no new applied request types') || flat.includes('No new applied request types'),
  'spec doc must forbid new applied request types');

// ---- authority constraints ----
assert(flat.includes('Desktop remains canonical authority'), 'spec doc must keep Desktop canonical authority');
assert(flat.includes('Chrome remains request-only'), 'spec doc must keep Chrome request-only / read-only');
assert(flat.includes('DUMB TRANSPORT') || flat.includes('dumb transport'), 'spec doc must require dumb transport only');

// ---- safety gates + failure cases ----
assert(flat.includes('Safety Gates'), 'spec doc must define safety gates');
assert(flat.includes('path containment'), 'spec doc must require path containment');
assert(flat.includes('Failure Cases'), 'spec doc must define failure cases');
for (const item of FAILURE_CASES) assert(flat.includes(item), `spec doc missing failure case: ${item}`);

// ---- entry criteria + block conditions ----
assert(flat.includes('Entry Criteria for Phase 35'), 'spec doc must define Phase 35 entry criteria');
assert(flat.includes('Block Conditions'), 'spec doc must define block conditions');
for (const item of BLOCK_CONDITIONS) assert(flat.includes(item), `spec doc missing block condition: ${item}`);

// ---- applied types named + product sync NOT READY ----
for (const type of APPLIED_TYPES) assert(flat.includes(type), `spec doc missing applied type: ${type}`);
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'spec doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'spec doc must not over-claim completion');

// ---- verdict ----
assert(flat.includes('Gate E Design Verdict'), 'spec doc must state the Gate E design verdict');

// ---- REAL SOURCE: allowlist exactly four; WebDAV deferred; gates module disabled-by-default, no server/network ----
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
assert(exists(gatesFile), `${gatesFile}: missing (Phase 30 gates module expected)`);
if (exists(gatesFile)) {
  const gates = read(gatesFile);
  assert(gates.includes('webdav-dev-only-do-not-ship'), 'gates module must keep the dev-only write flag');
  assert(gates.includes('disabled-by-default-proof-only'), 'gates module must remain disabled-by-default proof-only');
  for (const netToken of ['createServer', 'PROPFIND', '.listen(', 'https.request', 'http.request', 'XMLHttpRequest']) {
    assert(!gates.includes(netToken), `design-only violated: gates module contains server/network token ${netToken}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase34-webdav-gate-e-adapter-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase34-webdav-gate-e-adapter-spec.v1',
  phase: 'phase34-webdav-gate-e-adapter-spec',
  specDoc,
  designOnly: true,
  adapterShapeChecked: ADAPTER_SHAPE.length,
  protocolSurfaceChecked: PROTOCOL_SURFACE.length,
  failureCasesChecked: FAILURE_CASES.length,
  blockConditionsChecked: BLOCK_CONDITIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase33CommitReferenced: '8cfa9ef',
  webdavDeferredInSource: true,
  gateEVerdict: 'ready-design-only',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase34-webdav-gate-e-adapter-spec');
