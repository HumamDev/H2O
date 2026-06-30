#!/usr/bin/env node
//
// Phase 36 — WebDAV localhost smoke design-gate meta-validator (design/audit only, no behavior).
//
// Verifies the localhost-smoke decision doc exists and is internally consistent: design/audit only,
// decides the next WebDAV step after the Phase 35 mock adapter proof, defines the value/boundaries/
// risks/block-conditions of a future localhost smoke, reconfirms the disabled-by-default + dev-flag +
// local-transport + authority + NOT-READY posture, recommends one of Option A/B/C with justification,
// references the Phase 35 commit, and — as real drift guards — confirms the source allowlist is exactly
// four, WebDAV stays deferred in the loop, and the gates module remains a disabled-by-default dev
// sandbox with no server/network code.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase36-webdav-localhost-smoke-design-gate.md';
const phase35Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase35-webdav-local-mock-adapter-proof.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const BOUNDARIES = [
  'localhost only', 'temp/sandbox root only', 'no real remote account', 'no credentials',
  'no product transport enablement', 'no public/premium enablement',
];

const RISKS = [
  'accidental product enablement', 'real network leakage', 'credential leakage', 'path escape',
  'schema drift', 'request allowlist drift', 'authority model drift', 'product-ready overclaim',
];

const BLOCK_CONDITIONS = [
  'any product WebDAV enablement', 'any real remote WebDAV dependency',
  'any credential or endpoint evidence', 'any schema mutation', 'any applied allowlist expansion',
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
assert(exists(auditDoc), `${auditDoc}: missing`);
if (!exists(auditDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase36-webdav-localhost-smoke-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 4000, `${auditDoc}: audit doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit only; no harness/server/network/account/credentials ----
for (const marker of ['DESIGN / AUDIT ONLY', 'No localhost WebDAV server smoke harness was implemented',
  'No server code was added', 'No network calls were added', 'No real WebDAV account was used',
  'No credentials were added', 'No source modules were modified']) {
  assert(flat.includes(marker), `audit doc missing design-only marker: ${marker}`);
}

// ---- Phase 35 commit reference ----
assert(flat.includes('dc10129'), 'audit doc must reference the Phase 35 commit dc10129');
assert(exists(phase35Doc), 'Phase 35 mock-adapter proof doc must exist on disk');

// ---- disabled by default + dev flag + active transport ----
assert(flat.includes('disabled by default'), 'audit doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'), 'audit doc must keep the dev-only flag required');
assert(flat.includes('active product transport remains local sync-folder JSON'),
  'audit doc must reconfirm active product transport is local sync-folder JSON');

// ---- allowlist named + no schema mutation + authority ----
for (const type of APPLIED_TYPES) assert(flat.includes(type), `audit doc missing applied type: ${type}`);
assert(/no metadata request\/receipt\/projection schema was mutated/i.test(flat) || /no schema mutation/i.test(flat),
  'audit doc must state no metadata envelope schema mutation');
assert(flat.includes('Desktop remains canonical authority'), 'audit doc must keep Desktop canonical authority');
assert(flat.includes('Chrome remains request-only'), 'audit doc must keep Chrome request-only / read-only');

// ---- boundaries, risks, block conditions ----
assert(flat.includes('Strict Boundaries'), 'audit doc must define strict boundaries');
for (const item of BOUNDARIES) assert(flat.includes(item), `audit doc missing boundary: ${item}`);
assert(flat.includes('Risks'), 'audit doc must define risks');
for (const item of RISKS) assert(flat.includes(item), `audit doc missing risk: ${item}`);
assert(flat.includes('Block Conditions'), 'audit doc must define block conditions');
for (const item of BLOCK_CONDITIONS) assert(flat.includes(item), `audit doc missing block condition: ${item}`);

// ---- product sync NOT READY globally ----
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'audit doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'audit doc must not over-claim completion');

// ---- recommendation A/B/C with justification ----
assert(flat.includes('Recommended Phase 37 Slice'), 'audit doc must recommend a Phase 37 slice');
assert(/Option [ABC]/.test(flat), 'audit doc must recommend Option A, B, or C');
assert(flat.includes('Justification'), 'audit doc must justify the recommendation');
assert(flat.includes('Phase 36 Verdict'), 'audit doc must state the Phase 36 verdict');

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
  console.error('FAIL validate-labels-tags-categories-phase36-webdav-localhost-smoke-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase36-webdav-localhost-smoke-design-gate.v1',
  phase: 'phase36-webdav-localhost-smoke-design-gate',
  auditDoc,
  designOnly: true,
  recommendation: 'option-b-design-only-localhost-smoke-spec',
  boundariesChecked: BOUNDARIES.length,
  risksChecked: RISKS.length,
  blockConditionsChecked: BLOCK_CONDITIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase35CommitReferenced: 'dc10129',
  webdavDeferredInSource: true,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase36-webdav-localhost-smoke-design-gate');
