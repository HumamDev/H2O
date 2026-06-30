#!/usr/bin/env node
//
// Phase 26 — stabilization / closeout meta-validator for the four-type metadata sync loop.
//
// Lightweight consistency check (no behavior). It verifies the closeout doc exists, names exactly the
// four applied types, lists the deferred/blocked surfaces, keeps product metadata sync globally NOT
// READY, states WebDAV/cloud/relay is not implemented, defines the WebDAV/cloud/relay design handoff,
// references the Phase 25 commit + validator, and — as real drift guards — parses the live applied
// allowlist from source (exactly the four types) and confirms WebDAV is marked deferred in source.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase26-stabilization-closeout.md';
const phase25Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase25-maintainer-readiness-decision.md';
const phase25Validator = 'tools/validation/sync/validate-labels-tags-categories-phase25-maintainer-readiness-decision.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

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
  'catalog create/rename/delete',
  'classification expansion',
  'destructive clear/delete/remove/unbind/purge/hard-delete',
  'WebDAV/cloud/relay transport',
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
  console.error('FAIL validate-labels-tags-categories-phase26-stabilization-closeout');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: closeout doc too short`);

// ---- names exactly the four applied types + exact allowlist ----
for (const type of APPLIED_TYPES) {
  assert(doc.includes(type), `closeout doc missing applied type: ${type}`);
  assert(doc.includes(`'${type}': true`), `closeout doc must cite the exact allowlist entry '${type}': true`);
}

// ---- maintainer-closeout checklist present ----
assert(doc.includes('Maintainer-Closeout Checklist'), 'closeout doc must include a maintainer-closeout checklist');

// ---- Phase 25 commit + validator references ----
assert(doc.includes('a1690ec'), 'closeout doc must reference the Phase 25 commit a1690ec');
assert(doc.includes('validate-labels-tags-categories-phase25-maintainer-readiness-decision.mjs'),
  'closeout doc must reference the Phase 25 validator');
assert(exists(phase25Validator), 'Phase 25 validator file must exist on disk');
assert(exists(phase25Doc), 'Phase 25 decision doc must exist on disk');

// ---- product sync NOT READY globally ----
assert(doc.includes('NOT READY globally'), 'closeout doc must keep product metadata sync NOT READY globally');
assert(!/product metadata sync is complete/i.test(doc), 'closeout doc must not over-claim completion');

// ---- deferred/blocked surfaces ----
for (const item of REQUIRED_DEFERRED) assert(doc.includes(item), `closeout doc missing deferred/blocked surface: ${item}`);

// ---- WebDAV/cloud/relay not implemented + design handoff ----
assert(doc.includes('WebDAV/cloud/relay is NOT implemented'),
  'closeout doc must state WebDAV/cloud/relay is not implemented in Phase 26');
assert(doc.includes('Clean Handoff Point') && doc.includes('DESIGN-ONLY'),
  'closeout doc must define the later WebDAV/cloud/relay DESIGN-ONLY handoff');

// ---- closeout verdict ----
assert(doc.includes('STABILIZED AND CLOSED FOR MAINTAINER REVIEW'),
  'closeout doc must state the stabilization/closeout verdict');

// ---- REAL SOURCE: applied allowlist exactly the four types ----
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

// ---- REAL SOURCE: WebDAV is marked deferred (not implemented as a metadata transport) ----
for (const file of [folderSyncFile, folderImportFile]) {
  assert(exists(file), `${file}: missing`);
  if (exists(file)) assert(read(file).includes("webdav: 'deferred'"),
    `WebDAV must be marked deferred (webdav: 'deferred') in ${file}`);
}
assert(doc.includes("webdav: 'deferred'"), 'closeout doc must cite the source webdav: \'deferred\' marker');

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase26-stabilization-closeout');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase26-stabilization-closeout.v1',
  phase: 'phase26-stabilization-closeout',
  auditDoc,
  appliedTypes: APPLIED_TYPES,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  deferredSurfacesChecked: REQUIRED_DEFERRED.length,
  phase25CommitReferenced: 'a1690ec',
  webdavDeferredInSource: true,
  closeout: 'stabilized-closed-for-maintainer-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase26-stabilization-closeout');
