#!/usr/bin/env node
//
// Phase 21 — design-only audit meta-validator for the chat-tag-bind candidate.
//
// Lightweight consistency check (no behavior). It verifies the design-audit doc exists, states the
// READY verdict + Gate A satisfaction, lists the candidate comparison + negative gates, keeps product
// metadata sync globally NOT READY, and confirms the Phase 22 implementation state: it parses the
// live applied allowlist from source and asserts it is now EXACTLY the four safe types with the
// Phase 21 candidate chat-tag-bind enabled and no broader action. It also grounds the feasibility
// claims by checking the cited store/projection/request-spec tokens exist in real source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase21-chat-tag-bind-design-audit.md';
const phase20Validator = 'tools/validation/sync/validate-labels-tags-categories-phase20-closure-gate-audit.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const tagsStoreFile = 'src-surfaces-base/studio/store/tags.tauri.js';
const projectionFile = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const CANDIDATE = 'chat-tag-bind';

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

// Feasibility tokens that must exist in real source AND be cited in the doc.
const SOURCE_AND_DOC_ANCHORS = [
  ['INSERT OR IGNORE INTO tag_bindings', tagsStoreFile],
  ['chatTagBindingCount: tagBindings.length', projectionFile],
  ['chatTagBindings: await hashValue(tagBindings)', projectionFile],
];
// Feasibility tokens that must exist in source (request spec on both surfaces).
const SOURCE_ONLY_ANCHORS = [
  ["'chat-tag-bind':", folderSyncFile],
  ["'chat-tag-bind':", folderImportFile],
];

// ---- doc presence ----
assert(exists(auditDoc), `${auditDoc}: missing`);
if (!exists(auditDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase21-chat-tag-bind-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: design-audit doc too short`);

// ---- verdict + Gate A ----
assert(doc.includes('READY for later Phase 22 implementation'),
  'audit doc must state the READY-for-Phase-22 verdict');
assert(doc.includes('Gate A'), 'audit doc must address Phase 20 Gate A');
assert(doc.includes(CANDIDATE), `audit doc must name the candidate ${CANDIDATE}`);

// ---- candidate comparison + recommendation ----
assert(doc.includes('Candidate Comparison'), 'audit doc must include a candidate comparison');
for (const alt of ['chat-label-unbind', 'chat-label-clear', 'classification expansion']) {
  assert(doc.includes(alt), `candidate comparison missing alternative: ${alt}`);
}
assert(doc.includes('RECOMMENDED'), 'audit doc must recommend exactly one next type');

// ---- negative gates ----
assert(doc.includes('Negative Gates'), 'audit doc must list negative gates');
for (const gate of ['chat-label-unbind', 'chat-tag-unbind', 'classification expansion', 'WebDAV/cloud/relay']) {
  assert(doc.includes(gate), `audit doc missing negative gate: ${gate}`);
}

// ---- privacy/safety/idempotency requirements ----
for (const req of ['Privacy', 'Safety', 'Idempotency']) {
  assert(doc.includes(req), `audit doc missing requirement section: ${req}`);
}

// ---- product sync NOT READY + no-change statement ----
assert(doc.includes('Product metadata sync remains globally NOT READY'),
  'audit doc must keep product metadata sync globally NOT READY');
assert(doc.includes('Phase 21 made no product behavior changes'),
  'audit doc must explicitly state no product behavior changes');
assert(!/product metadata sync is complete/i.test(doc), 'audit doc must not over-claim completion');

// ---- references Phase 20 commit + validator ----
assert(doc.includes('7f5746b'), 'audit doc must reference the Phase 20 commit 7f5746b');
assert(doc.includes('validate-labels-tags-categories-phase20-closure-gate-audit.mjs'),
  'audit doc must reference the Phase 20 validator');
assert(exists(phase20Validator), 'Phase 20 validator file must exist on disk');

// ---- POST-PHASE-22: chat-tag-bind is enabled; allowlist is exactly the four safe types ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseAppliedAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse the applied allowlist from source');
  if (Array.isArray(applied)) {
    assert(applied.includes(CANDIDATE),
      `Phase 22 implementation missing: ${CANDIDATE} is not enabled in the applied allowlist`);
    const sorted = applied.slice().sort();
    const expected = APPLIED_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `applied allowlist drifted: expected exactly [${expected.join(', ')}], got [${sorted.join(', ')}]`);
  }
}

// ---- feasibility grounded in real source ----
for (const [token, file] of SOURCE_AND_DOC_ANCHORS) {
  assert(exists(file), `feasibility source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `feasibility token absent from source ${file}: ${token}`);
  assert(doc.includes(token), `audit doc does not cite feasibility token: ${token}`);
}
for (const [token, file] of SOURCE_ONLY_ANCHORS) {
  assert(exists(file), `feasibility source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `feasibility token absent from source ${file}: ${token}`);
}
assert(doc.includes('tags.bindChat'), 'audit doc must cite the tags.bindChat store path');

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase21-chat-tag-bind-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase21-chat-tag-bind-design-audit.v1',
  phase: 'phase21-chat-tag-bind-design-audit',
  auditDoc,
  candidate: CANDIDATE,
  verdict: 'ready-for-phase22',
  gateA: 'satisfied',
  candidateEnabledInSource: true,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  feasibilityAnchorsVerified: SOURCE_AND_DOC_ANCHORS.length + SOURCE_ONLY_ANCHORS.length,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase21-chat-tag-bind-design-audit');
