#!/usr/bin/env node
//
// Phase 24 — four-type readiness / closure audit meta-validator.
//
// Lightweight consistency check (no behavior). It verifies the four-type readiness audit doc exists
// and is internally consistent with the codebase: names exactly the four applied types, records the
// chat-tag-bind proof/dev-only fixture, lists every deferred surface, references the Phase 22 + 23a
// commits and the Phase 23a validator (present on disk), keeps product metadata sync globally NOT
// READY, and — as a real drift guard — parses the live applied allowlist from source and asserts it
// is EXACTLY the four applied types with no broader type.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase24-four-type-readiness-audit.md';
const phase23aDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.md';
const phase23aValidator = 'tools/validation/sync/validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.mjs';
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
  'broader metadata sync closeout',
];

// Feasibility/enforcement tokens that must exist in real source AND be cited in the doc.
const SOURCE_AND_DOC_ANCHORS = [
  ["'chat-tag-bind': true", folderSyncFile],
  ['tags.bindChat', folderSyncFile],
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
  console.error('FAIL validate-labels-tags-categories-phase24-four-type-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: audit doc too short`);

// ---- names exactly the four applied types + exact-allowlist statement ----
for (const type of APPLIED_TYPES) {
  assert(doc.includes(type), `audit doc missing applied type: ${type}`);
  assert(doc.includes(`'${type}': true`), `audit doc must cite the exact allowlist entry '${type}': true`);
}
assert(doc.includes('remains exactly these four types'),
  'audit doc must state the applied-type allowlist remains exactly these four types');
assert(doc.includes('no broader applied request type is documented as ready'),
  'audit doc must confirm no broader applied request type is documented as ready');

// ---- chat-tag-bind proof/dev-only fixture documented ----
assert(doc.includes('proof/dev-only'), 'audit doc must document the proof/dev-only fixture');
assert(doc.includes('tags.upsert'), 'audit doc must record the tags.upsert fixture seed path');
assert(doc.includes('tag-create'), 'audit doc must note no tag-create sync request');
assert(doc.includes('no product behavior change') || doc.includes('NO product behavior change'),
  'audit doc must state the fixture is no product behavior change');

// ---- deferred surfaces ----
for (const item of REQUIRED_DEFERRED) assert(doc.includes(item), `audit doc missing deferred surface: ${item}`);

// ---- product sync NOT READY globally ----
assert(doc.includes('NOT READY globally'), 'audit doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(doc), 'audit doc must not over-claim completion');

// ---- references Phase 22 + 23a commits + Phase 23a validator ----
assert(doc.includes('57fe33e'), 'audit doc must reference the Phase 22 commit 57fe33e');
assert(doc.includes('eeb896b'), 'audit doc must reference the Phase 23a commit eeb896b');
assert(doc.includes('validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.mjs'),
  'audit doc must reference the Phase 23a validator');
assert(exists(phase23aValidator), 'Phase 23a validator file must exist on disk');
assert(exists(phase23aDoc), 'Phase 23a live-proof doc must exist on disk');

// ---- readiness verdict ----
assert(/READY FOR REVIEW/.test(doc), 'audit doc must state the four-type readiness verdict');

// ---- REAL SOURCE: applied allowlist is exactly the four applied types, no broader type ----
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

// ---- enforcement anchors real in source AND cited in doc ----
for (const [token, file] of SOURCE_AND_DOC_ANCHORS) {
  assert(exists(file), `enforcement source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `enforcement token absent from source ${file}: ${token}`);
  assert(doc.includes(token), `audit doc does not cite enforcement token: ${token}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase24-four-type-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase24-four-type-readiness-audit.v1',
  phase: 'phase24-four-type-readiness-audit',
  auditDoc,
  appliedTypes: APPLIED_TYPES,
  appliedTypeCount: APPLIED_TYPES.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  deferredSurfacesChecked: REQUIRED_DEFERRED.length,
  phase22CommitReferenced: '57fe33e',
  phase23aCommitReferenced: 'eeb896b',
  readiness: 'ready-for-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase24-four-type-readiness-audit');
