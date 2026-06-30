#!/usr/bin/env node
//
// Phase 37 — WebDAV localhost server smoke spec meta-validator (design/spec only, no behavior).
//
// Verifies the localhost smoke spec doc exists and is internally consistent: design/spec only, defines
// the localhost/loopback-only harness shape, the real socket-bound protocol surface, the byte-unchanged
// envelope constraints, the Desktop-canonical / Chrome-request-only authority constraints, the
// security/privacy constraints, the failure cases, the Phase 38 entry criteria, and the block
// conditions; keeps the allowlist at exactly four and product metadata sync globally NOT READY;
// references the Phase 36 commit; and — as real drift guards — confirms the source allowlist is exactly
// four, WebDAV stays deferred in the loop, and the gates module remains a disabled-by-default dev
// sandbox with no server/network code.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const specDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase37-webdav-localhost-smoke-spec.md';
const phase36Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase36-webdav-localhost-smoke-design-gate.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const HARNESS_SHAPE = [
  'localhost / loopback only', 'temp/sandbox root only', 'no external network',
  'no real remote WebDAV account', 'no credentials', 'no product/public/premium enablement',
];

const PROTOCOL_SURFACE = [
  'socket-bound `PROPFIND`', 'socket-bound `PUT`', 'socket-bound `GET`', 'socket-bound `MOVE`',
  'ETag', 'interrupted `PUT` over the wire', 'partial upload does not publish the final file',
  'atomic publish via server-side `MOVE`',
];

const PRIVACY = [
  'redacted/hash-only evidence', 'no secrets', 'no credentials', 'no real endpoint evidence',
  'no raw chat titles/content', 'no label/tag/category names', 'no account-linked metadata',
];

const FAILURE_CASES = [
  'missing remote file', 'malformed remote file', 'checksum mismatch', 'stale remote',
  'sequence regression', 'peer mismatch', 'interrupted PUT', 'failed MOVE', 'duplicate/replay',
  'corrupt sandbox state', 'dev flag missing', 'server unavailable', 'request timeout',
  'path escape attempt',
];

const BLOCK_CONDITIONS = [
  'any product WebDAV enablement', 'any public/premium default', 'any real remote WebDAV dependency',
  'any credential or endpoint evidence', 'any external network dependency', 'any schema mutation',
  'any applied allowlist expansion', 'any Chrome canonical mutation', 'any Desktop authority weakening',
  'any write outside the sandbox', 'any `productSyncReady` true claim',
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
  console.error('FAIL validate-labels-tags-categories-phase37-webdav-localhost-smoke-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(specDoc);
assert(doc.length > 4000, `${specDoc}: spec doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/spec only; no harness/server/network/account/credentials ----
for (const marker of ['DESIGN / SPECIFICATION ONLY', 'No localhost WebDAV server smoke harness was implemented',
  'No server code was added', 'No network calls were added', 'No real WebDAV account was used',
  'No credentials were added', 'No source modules were modified']) {
  assert(flat.includes(marker), `spec doc missing design-only marker: ${marker}`);
}

// ---- Phase 36 commit reference ----
assert(flat.includes('5d473f9'), 'spec doc must reference the Phase 36 commit 5d473f9');
assert(exists(phase36Doc), 'Phase 36 design-gate doc must exist on disk');

// ---- disabled by default + dev flag + active transport ----
assert(flat.includes('disabled by default'), 'spec doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'), 'spec doc must require the dev-only flag');
assert(flat.includes('Active product transport remains local sync-folder JSON') ||
  flat.includes('local sync-folder JSON remains the active product transport'),
  'spec doc must keep active product transport as local sync-folder JSON');

// ---- harness shape (localhost/loopback-only boundaries) ----
assert(flat.includes('Allowed Localhost Smoke Harness Shape'), 'spec doc must define the harness shape');
for (const item of HARNESS_SHAPE) assert(flat.includes(item), `spec doc missing harness-shape item: ${item}`);

// ---- protocol surface ----
assert(flat.includes('Protocol Surface') || flat.includes('Transport / Protocol Surface'),
  'spec doc must define the protocol surface');
for (const verb of PROTOCOL_SURFACE) assert(flat.includes(verb), `spec doc missing protocol-surface item: ${verb}`);

// ---- envelope constraints ----
assert(flat.includes('latest.json` byte-unchanged') || flat.includes('latest.json byte-unchanged'),
  'spec doc must require latest.json byte-unchanged');
assert(flat.includes('chrome-latest.json` byte-unchanged') || flat.includes('chrome-latest.json byte-unchanged'),
  'spec doc must require chrome-latest.json byte-unchanged');
assert(/no metadata request\/receipt\/projection schema mutation/i.test(flat) || /no schema mutation/i.test(flat),
  'spec doc must forbid envelope schema mutation');
assert(flat.includes('no new applied request types') || flat.includes('No new applied request types'),
  'spec doc must forbid new applied request types');

// ---- authority + privacy ----
assert(flat.includes('Desktop remains canonical authority'), 'spec doc must keep Desktop canonical authority');
assert(flat.includes('Chrome remains request-only'), 'spec doc must keep Chrome request-only / read-only');
assert(flat.includes('DUMB TRANSPORT') || flat.includes('dumb transport'), 'spec doc must require dumb transport only');
for (const item of PRIVACY) assert(flat.includes(item), `spec doc missing security/privacy constraint: ${item}`);

// ---- failure cases, entry criteria, block conditions ----
assert(flat.includes('Failure Cases'), 'spec doc must define failure cases');
for (const item of FAILURE_CASES) assert(flat.includes(item), `spec doc missing failure case: ${item}`);
assert(flat.includes('Phase 38 Entry Criteria'), 'spec doc must define Phase 38 entry criteria');
assert(flat.includes('Block Conditions'), 'spec doc must define block conditions');
for (const item of BLOCK_CONDITIONS) assert(flat.includes(item), `spec doc missing block condition: ${item}`);

// ---- applied types named + product sync NOT READY ----
for (const type of APPLIED_TYPES) assert(flat.includes(type), `spec doc missing applied type: ${type}`);
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'spec doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'spec doc must not over-claim completion');
assert(flat.includes('Localhost Smoke Spec Verdict'), 'spec doc must state the localhost smoke spec verdict');

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
  console.error('FAIL validate-labels-tags-categories-phase37-webdav-localhost-smoke-spec');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase37-webdav-localhost-smoke-spec.v1',
  phase: 'phase37-webdav-localhost-smoke-spec',
  specDoc,
  designOnly: true,
  harnessShapeChecked: HARNESS_SHAPE.length,
  protocolSurfaceChecked: PROTOCOL_SURFACE.length,
  privacyConstraintsChecked: PRIVACY.length,
  failureCasesChecked: FAILURE_CASES.length,
  blockConditionsChecked: BLOCK_CONDITIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase36CommitReferenced: '5d473f9',
  webdavDeferredInSource: true,
  smokeSpecVerdict: 'ready-design-only',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase37-webdav-localhost-smoke-spec');
