#!/usr/bin/env node
//
// Phase 20 — closure / release-gate audit meta-validator.
//
// Lightweight consistency check (no behavior). It verifies the closure-gate audit doc exists and is
// internally consistent, defines the implementation-entry gates + release-risk categories, keeps
// product metadata sync globally NOT READY, and — as a real drift guard — parses the live applied
// allowlist out of source and asserts it is EXACTLY the three live-proven types (no broader type).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase20-closure-gate-audit.md';
const phase19Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase19-readiness-audit.md';
const phase19Validator = 'tools/validation/sync/validate-labels-tags-categories-phase19-readiness-audit.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind'];

const REQUIRED_DEFERRED = [
  'label clear/remove/unbind',
  'tag bind/clear/remove/unbind',
  'label/tag/category catalog create/rename/delete',
  'classification expansion',
  'destructive actions',
  'WebDAV/cloud/relay transport',
];

const REQUIRED_RISK_CATEGORIES = ['safe-for-review', 'internal-only', 'blocked', 'deferred'];

// ---- Parse the live applied allowlist from source (real drift guard) ----
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
  console.error('FAIL validate-labels-tags-categories-phase20-closure-gate-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: closure-gate doc too short`);

// ---- names exactly the three live-proven applied types ----
for (const type of APPLIED_TYPES) assert(doc.includes(type), `audit doc missing applied type: ${type}`);
assert(doc.includes('applied-type allowlist remains exactly'),
  'audit doc must state the applied-type allowlist remains exactly the three types');

// ---- product metadata sync globally NOT READY ----
assert(doc.includes('Product metadata sync remains globally NOT READY'),
  'audit doc must state product metadata sync remains globally NOT READY');
assert(!/product metadata sync is complete/i.test(doc), 'audit doc must not over-claim completion');

// ---- deferred request/action surfaces listed ----
for (const item of REQUIRED_DEFERRED) assert(doc.includes(item), `audit doc missing deferred surface: ${item}`);

// ---- implementation-entry gates defined ----
assert(doc.includes('Implementation-Entry Gate'), 'audit doc must define the implementation-entry gate');
for (const gate of ['Gate A', 'Gate B', 'Gate C']) {
  assert(doc.includes(gate), `audit doc missing implementation-entry ${gate}`);
}

// ---- release-risk categories defined ----
for (const cat of REQUIRED_RISK_CATEGORIES) assert(doc.includes(cat), `audit doc missing release-risk category: ${cat}`);

// ---- closure criteria + readiness present ----
assert(doc.includes('Closure Criteria'), 'audit doc must define closure criteria');
assert(/READY FOR REVIEW/.test(doc), 'audit doc must state the closure/readiness verdict');

// ---- references Phase 19 commit + validator ----
assert(doc.includes('d32be86'), 'audit doc must reference the Phase 19 commit d32be86');
assert(doc.includes('validate-labels-tags-categories-phase19-readiness-audit.mjs'),
  'audit doc must reference the Phase 19 validator');
assert(exists(phase19Validator), 'Phase 19 validator file must exist on disk');
assert(exists(phase19Doc), 'Phase 19 readiness doc must exist on disk');

// ---- REAL SOURCE: applied allowlist is exactly the three types, no broader applied type ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseAppliedAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS from source');
  if (Array.isArray(applied)) {
    const sorted = applied.slice().sort();
    const expected = APPLIED_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `source applied allowlist drifted: expected exactly [${expected.join(', ')}], got [${sorted.join(', ')}]`);
    for (const a of applied) {
      assert(APPLIED_TYPES.includes(a), `source enables a broader/unexpected applied type: ${a}`);
    }
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase20-closure-gate-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase20-closure-gate-audit.v1',
  phase: 'phase20-closure-gate-audit',
  auditDoc,
  appliedTypes: APPLIED_TYPES,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  deferredSurfacesChecked: REQUIRED_DEFERRED.length,
  riskCategoriesChecked: REQUIRED_RISK_CATEGORIES.length,
  implementationEntryGates: ['Gate A', 'Gate B', 'Gate C'],
  phase19CommitReferenced: 'd32be86',
  closure: 'ready-for-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase20-closure-gate-audit');
