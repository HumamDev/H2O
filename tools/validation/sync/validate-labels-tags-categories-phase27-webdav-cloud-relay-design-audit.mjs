#!/usr/bin/env node
//
// Phase 27 — design-only WebDAV/cloud/relay transport audit meta-validator.
//
// Lightweight consistency check (no behavior). It verifies the transport design-audit doc exists, is
// design-only, defines the transport boundary (same envelopes, no new applied types/schema), preserves
// the Desktop-canonical / Chrome-request-only authority model, lists Gate A/B/C + negative gates,
// keeps product metadata sync globally NOT READY, and — as real drift guards — parses the live applied
// allowlist from source (exactly four) and confirms WebDAV remains marked deferred in source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase27-webdav-cloud-relay-design-audit.md';
const phase26Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase26-stabilization-closeout.md';
const phase26Validator = 'tools/validation/sync/validate-labels-tags-categories-phase26-stabilization-closeout.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];

const REQUIRED_NEGATIVE_GATES = [
  'no allowlist broadening',
  'no destructive actions',
  'no authority move',
  'no schema change',
  'no product-ready claim',
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
  console.error('FAIL validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 4000, `${auditDoc}: design-audit doc too short`);

// ---- design-only ----
for (const marker of ['DESIGN-ONLY', 'No transport was implemented', 'No source modules were modified']) {
  assert(doc.includes(marker), `audit doc missing design-only marker: ${marker}`);
}

// ---- Phase 26 commit + validator references ----
assert(doc.includes('1991e28'), 'audit doc must reference the Phase 26 commit 1991e28');
assert(doc.includes('validate-labels-tags-categories-phase26-stabilization-closeout.mjs'),
  'audit doc must reference the Phase 26 validator');
assert(exists(phase26Validator), 'Phase 26 validator file must exist on disk');
assert(exists(phase26Doc), 'Phase 26 closeout doc must exist on disk');

// ---- transport boundary: same envelopes, no new applied types / schema ----
assert(doc.includes('carries the SAME request/receipt/projection envelopes unchanged'),
  'audit doc must state the transport carries the same envelopes unchanged');
assert(doc.includes('MUST NOT introduce new applied request types') && doc.includes('MUST NOT introduce new schemas'),
  'audit doc must forbid new applied types and new schemas');

// ---- authority model preserved ----
assert(doc.includes('Desktop remains the canonical authority'), 'audit doc must keep Desktop canonical authority');
assert(doc.includes('Chrome remains request-only and read-only over canonical metadata'),
  'audit doc must keep Chrome request-only / read-only');
assert(doc.includes('DUMB TRANSPORT'), 'audit doc must require relay/cloud to be dumb transport only');

// ---- Gate A/B/C ----
for (const gate of ['Gate A', 'Gate B', 'Gate C']) assert(doc.includes(gate), `audit doc missing transport ${gate}`);

// ---- negative gates ----
assert(doc.includes('Negative Gates'), 'audit doc must list negative gates');
for (const gate of REQUIRED_NEGATIVE_GATES) assert(doc.includes(gate), `audit doc missing negative gate: ${gate}`);

// ---- threat / recovery / conflict models present ----
for (const section of ['Threat Model', 'Recovery Model', 'Conflict / Idempotency Model']) {
  assert(doc.includes(section), `audit doc missing section: ${section}`);
}

// ---- transport recommendation (one candidate or defer) ----
assert(doc.includes('Recommend exactly one design-only candidate') && doc.includes('WebDAV'),
  'audit doc must recommend exactly one design-only transport candidate');

// ---- product sync NOT READY globally ----
assert(doc.includes('NOT READY globally'), 'audit doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(doc), 'audit doc must not over-claim completion');

// ---- design verdict ----
assert(/Design Verdict[\s\S]{0,40}READY/.test(doc) || doc.includes('READY — for a WebDAV design-only candidate'),
  'audit doc must state the design verdict');

// ---- REAL SOURCE: applied allowlist exactly four; WebDAV deferred ----
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
  console.error('FAIL validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase27-webdav-cloud-relay-design-audit.v1',
  phase: 'phase27-webdav-cloud-relay-design-audit',
  auditDoc,
  designOnly: true,
  transportRecommendation: 'webdav',
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  negativeGatesChecked: REQUIRED_NEGATIVE_GATES.length,
  gates: ['Gate A', 'Gate B', 'Gate C'],
  phase26CommitReferenced: '1991e28',
  webdavDeferredInSource: true,
  designVerdict: 'ready-design-only',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase27-webdav-cloud-relay-design-audit');
