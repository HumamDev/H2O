#!/usr/bin/env node
//
// Phase 33 — WebDAV next-step design-gate meta-validator (design/audit only, no behavior).
//
// Verifies the next-step decision doc exists and is internally consistent: design/audit only, decides
// the next WebDAV step after the Phase 32 loopback proof, defines entry criteria + strict non-goals +
// allowed adapter shape + block conditions, reconfirms the active product transport (local sync-folder
// JSON) and that product metadata sync stays globally NOT READY, recommends one of Option A/B/C with
// justification, references the Phase 32 commit, and — as real drift guards — confirms the source
// allowlist is exactly four, WebDAV stays deferred in the loop, and the gates module remains a
// disabled-by-default dev sandbox with no server/network code.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase33-webdav-next-step-design-gate.md';
const phase32Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase32-webdav-loopback-sandbox-proof.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const NON_GOALS = [
  'no product enablement', 'no public/premium enablement', 'no real user credentials',
  'no real external WebDAV account', 'no production remote writes',
];

const ADAPTER_SHAPE = [
  'local-only server or mock adapter', 'temp/sandbox root only', 'byte-unchanged envelopes',
  'path containment', 'redacted evidence only',
];

const BLOCK_CONDITIONS = [
  'any metadata request/receipt/projection schema mutation', 'any allowlist expansion',
  'any Chrome canonical mutation', 'any Desktop authority weakening',
  'any credential/raw-data leakage', 'any write outside the sandbox', 'any product-ready claim',
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
  console.error('FAIL validate-labels-tags-categories-phase33-webdav-next-step-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 4000, `${auditDoc}: audit doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit only; no implementation/enablement/network/writes ----
for (const marker of ['DESIGN / AUDIT ONLY', 'No WebDAV server adapter was implemented',
  'No product WebDAV transport was enabled', 'No network calls were added',
  'No remote writes were added', 'No source modules were modified']) {
  assert(flat.includes(marker), `audit doc missing design-only marker: ${marker}`);
}

// ---- Phase 32 commit reference ----
assert(flat.includes('f908ddc'), 'audit doc must reference the Phase 32 commit f908ddc');
assert(exists(phase32Doc), 'Phase 32 loopback proof doc must exist on disk');

// ---- disabled-by-default + dev flag kept ----
assert(flat.includes('disabled by default'), 'audit doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'),
  'audit doc must keep the dev-only flag required for future dev behavior');

// ---- active product transport reconfirmation ----
assert(flat.includes('active product transport remains local sync-folder JSON'),
  'audit doc must reconfirm active product transport is local sync-folder JSON');

// ---- allowlist exactly four + no schema mutation + authority ----
for (const type of APPLIED_TYPES) {
  assert(flat.includes(type), `audit doc missing applied type: ${type}`);
}
assert(/no metadata request\/receipt\/projection schema was mutated/i.test(flat) || /no schema mutation/i.test(flat),
  'audit doc must state no metadata envelope schema mutation');
assert(flat.includes('Desktop-canonical / Chrome-request-only'),
  'audit doc must preserve Desktop-canonical / Chrome-request-only authority');

// ---- non-goals, adapter shape, block conditions, entry criteria ----
assert(flat.includes('Strict Non-Goals'), 'audit doc must define strict non-goals');
for (const item of NON_GOALS) assert(flat.includes(item), `audit doc missing non-goal: ${item}`);
assert(flat.includes('Allowed Adapter Proof Shape'), 'audit doc must define the allowed adapter proof shape');
for (const item of ADAPTER_SHAPE) assert(flat.includes(item), `audit doc missing adapter-shape item: ${item}`);
assert(flat.includes('Block Conditions'), 'audit doc must define block conditions');
for (const item of BLOCK_CONDITIONS) assert(flat.includes(item), `audit doc missing block condition: ${item}`);
assert(flat.includes('Entry Criteria'), 'audit doc must define entry criteria');

// ---- product sync NOT READY globally ----
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'audit doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'audit doc must not over-claim completion');

// ---- recommendation: one of Option A/B/C with justification ----
assert(flat.includes('Recommended Phase 34 Slice'), 'audit doc must recommend a Phase 34 slice');
const recommendsOption = /Option [ABC]/.test(flat);
assert(recommendsOption, 'audit doc must recommend Option A, B, or C');
assert(flat.includes('Justification'), 'audit doc must justify the recommendation');

// ---- verdict ----
assert(flat.includes('Phase 33 Verdict'), 'audit doc must state the Phase 33 verdict');

// ---- REAL SOURCE: allowlist exactly four; WebDAV deferred in loop; gates module disabled-by-default, no server/network ----
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
  // Design-only: no server/network code may have been added by Phase 33.
  for (const netToken of ['createServer', 'PROPFIND', '.listen(', 'https.request', 'http.request', 'XMLHttpRequest']) {
    assert(!gates.includes(netToken), `design-only violated: gates module contains server/network token ${netToken}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase33-webdav-next-step-design-gate');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase33-webdav-next-step-design-gate.v1',
  phase: 'phase33-webdav-next-step-design-gate',
  auditDoc,
  designOnly: true,
  recommendation: 'option-b-design-only-gate-e-spec',
  nonGoalsChecked: NON_GOALS.length,
  adapterShapeChecked: ADAPTER_SHAPE.length,
  blockConditionsChecked: BLOCK_CONDITIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase32CommitReferenced: 'f908ddc',
  webdavDeferredInSource: true,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase33-webdav-next-step-design-gate');
