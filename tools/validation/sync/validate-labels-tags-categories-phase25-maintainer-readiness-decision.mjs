#!/usr/bin/env node
//
// Phase 25 — maintainer readiness decision-gate meta-validator.
//
// Lightweight consistency check (no behavior). It verifies the maintainer-readiness decision doc
// exists and is internally consistent: names exactly the four applied types, records the chat-tag-bind
// proof/dev-only fixture, lists every deferred surface, defines maintainer release categories, makes a
// recommendation (stabilization/closeout or one design-only candidate), keeps product metadata sync
// globally NOT READY, references the Phase 24 commit + validator, and — as a real drift guard — parses
// the live applied allowlist from source and asserts it is EXACTLY the four types with no fifth type
// implemented.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase25-maintainer-readiness-decision.md';
const phase24Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase24-four-type-readiness-audit.md';
const phase24Validator = 'tools/validation/sync/validate-labels-tags-categories-phase24-four-type-readiness-audit.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const REQUIRED_DEFERRED = [
  'chat-label-clear',
  'chat-label-remove',
  'chat-label-unbind',
  'chat-tag-clear',
  'chat-tag-remove',
  'chat-tag-unbind',
  'label/tag/category catalog create/rename/delete',
  'classification expansion',
  'destructive clear/delete/remove/unbind/purge/hard-delete actions',
  'WebDAV/cloud/relay transport',
];

const REQUIRED_RISK_CATEGORIES = ['ready-for-review', 'internal/dev-only', 'blocked', 'deferred'];

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
  console.error('FAIL validate-labels-tags-categories-phase25-maintainer-readiness-decision');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: decision doc too short`);

// ---- names exactly the four applied types + exact allowlist ----
for (const type of APPLIED_TYPES) {
  assert(doc.includes(type), `decision doc missing applied type: ${type}`);
  assert(doc.includes(`'${type}': true`), `decision doc must cite the exact allowlist entry '${type}': true`);
}
assert(doc.includes('applied allowlist remains exactly these four types'),
  'decision doc must state the applied allowlist remains exactly these four types');

// ---- Phase 24 commit + validator references ----
assert(doc.includes('4ac80c5'), 'decision doc must reference the Phase 24 commit 4ac80c5');
assert(doc.includes('validate-labels-tags-categories-phase24-four-type-readiness-audit.mjs'),
  'decision doc must reference the Phase 24 validator');
assert(exists(phase24Validator), 'Phase 24 validator file must exist on disk');
assert(exists(phase24Doc), 'Phase 24 readiness doc must exist on disk');

// ---- product sync NOT READY globally ----
assert(doc.includes('NOT READY globally'), 'decision doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(doc), 'decision doc must not over-claim completion');

// ---- fixture-backed chat-tag-bind recorded ----
assert(doc.includes('proof/dev-only'), 'decision doc must record the proof/dev-only fixture');
assert(doc.includes('tags.upsert'), 'decision doc must record the tags.upsert fixture seed path');
assert(doc.includes('tag-create'), 'decision doc must note no tag-create sync request');
assert(doc.includes('no product behavior change'), 'decision doc must state no product behavior change');

// ---- deferred surfaces ----
for (const item of REQUIRED_DEFERRED) assert(doc.includes(item), `decision doc missing deferred surface: ${item}`);

// ---- maintainer release categories ----
for (const cat of REQUIRED_RISK_CATEGORIES) assert(doc.includes(cat), `decision doc missing release category: ${cat}`);

// ---- a recommendation is made (stabilization/closeout or one design-only candidate) ----
assert(doc.includes('Recommended Next Slice'), 'decision doc must include a recommended next slice');
const recommendsStabilization = doc.includes('stabilization') && doc.includes('closeout');
const recommendsDesignOnly = doc.includes('design-only audit');
assert(recommendsStabilization || recommendsDesignOnly,
  'decision doc must recommend stabilization/closeout or one design-only next candidate');

// ---- maintainer readiness verdict ----
assert(/READY FOR MAINTAINER REVIEW/.test(doc), 'decision doc must state the maintainer readiness verdict');

// ---- no fifth type documented as implemented/ready without a fresh design gate ----
assert(doc.includes('No fifth applied type is recommended for implementation') ||
  doc.includes('No Implementation Without a Fresh Design Gate'),
  'decision doc must state no fifth type is implemented/ready without a fresh design gate');
assert(/fresh\s+(Phase 20-style\s+)?Gate A|fresh design gate/i.test(doc),
  'decision doc must require a fresh design gate before any fifth type');

// ---- REAL SOURCE: applied allowlist is exactly the four types (no fifth implemented) ----
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

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase25-maintainer-readiness-decision');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase25-maintainer-readiness-decision.v1',
  phase: 'phase25-maintainer-readiness-decision',
  auditDoc,
  appliedTypes: APPLIED_TYPES,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  deferredSurfacesChecked: REQUIRED_DEFERRED.length,
  riskCategoriesChecked: REQUIRED_RISK_CATEGORIES.length,
  phase24CommitReferenced: '4ac80c5',
  recommendation: recommendsStabilization ? 'stabilization-closeout' : 'design-only-next-candidate',
  maintainerReadiness: 'ready-for-maintainer-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase25-maintainer-readiness-decision');
