#!/usr/bin/env node
//
// Phase 39 — local WebDAV proof-series readiness/closeout audit meta-validator (design/audit only).
//
// Verifies the closeout audit doc exists and is internally consistent: design/readiness-audit only,
// summarizes the Phase 30–38 proof ladder, distinguishes proven vs unproven surfaces, recommends one
// of Option A/B/C with justification, defines block conditions for any later real-remote proof,
// reconfirms the disabled-by-default + dev-flag + local-transport + authority + NOT-READY posture,
// references the Phase 38 commit, and — as real drift guards — confirms the source allowlist is exactly
// four, WebDAV stays deferred in the loop, and the gates module remains a disabled-by-default dev
// sandbox with no server/network code. This validator binds no socket and makes no network call.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase39-webdav-local-proof-readiness-audit.md';
const phase38Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase38-webdav-localhost-smoke-harness.md';
const phase38Validator = 'tools/validation/sync/validate-labels-tags-categories-phase38-webdav-localhost-smoke-harness.mjs';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const PHASE38_COMMIT = '3a8e7c7e8acf945889f3e9a427a83041c2a505b9';

const LADDER_COMMITS = ['05814b6', 'bccbdd4', 'f908ddc', '8cfa9ef', '72a1b41', 'dc10129', '5d473f9', '7e72d04'];

const PROVEN = [
  'disabled-by-default behavior', 'dev flag requirement', 'local/mock adapter proof',
  'localhost socket-bound smoke proof', 'byte-unchanged', 'path containment',
  'ETag / precondition behavior', 'interrupted PUT / partial upload safety', 'atomic MOVE behavior',
  'fallback behavior', 'redacted evidence posture',
];

const UNPROVEN = [
  'real remote WebDAV provider behavior', 'credential storage/rotation', 'TLS/provider auth behavior',
  'cross-device remote conflict behavior', 'production enablement', 'public/premium readiness',
];

const REMOTE_BLOCK_CONDITIONS = [
  'no real credentials in repo/evidence', 'no raw endpoint evidence', 'no product transport enablement',
  'no schema mutation', 'no request allowlist expansion', 'no Chrome canonical mutation',
  'no Desktop authority weakening', 'no `productSyncReady` true claim',
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
  console.error('FAIL validate-labels-tags-categories-phase39-webdav-local-proof-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 4000, `${auditDoc}: audit doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- design/audit only; no implementation/server/enablement ----
for (const marker of ['DESIGN / READINESS AUDIT ONLY', 'No new WebDAV code was implemented',
  'No server code was added', 'No product WebDAV transport was enabled', 'No source modules were modified']) {
  assert(flat.includes(marker), `audit doc missing design-only marker: ${marker}`);
}

// ---- Phase 38 commit reference + ladder summary ----
assert(flat.includes(PHASE38_COMMIT), 'audit doc must reference the Phase 38 commit (full SHA)');
assert(exists(phase38Doc), 'Phase 38 harness doc must exist on disk');
assert(exists(phase38Validator), 'Phase 38 validator must exist on disk');
assert(flat.includes('Proof Ladder (Phases 30') || flat.includes('Proof Ladder'),
  'audit doc must summarize the Phase 30-38 proof ladder');
for (const commit of LADDER_COMMITS) assert(flat.includes(commit), `audit doc missing ladder commit: ${commit}`);

// ---- proven vs unproven ----
assert(flat.includes('Exactly What Is Proven'), 'audit doc must list what is proven');
for (const item of PROVEN) assert(flat.includes(item), `audit doc missing proven item: ${item}`);
assert(flat.includes('Exactly What Remains Unproven'), 'audit doc must list what remains unproven');
for (const item of UNPROVEN) assert(flat.includes(item), `audit doc missing unproven item: ${item}`);

// ---- disabled by default + dev flag + active transport ----
assert(flat.includes('disabled by default'), 'audit doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'), 'audit doc must keep the dev-only flag required');
assert(flat.includes('product transport remains local sync-folder JSON') ||
  flat.includes('Active product transport remains local sync-folder JSON') ||
  flat.includes('active product transport remains local sync-folder JSON'),
  'audit doc must keep active product transport as local sync-folder JSON');

// ---- allowlist named + no schema mutation + authority ----
for (const type of APPLIED_TYPES) assert(flat.includes(type), `audit doc missing applied type: ${type}`);
assert(/no metadata request\/receipt\/projection schema was mutated/i.test(flat) || /no schema mutation/i.test(flat),
  'audit doc must state no metadata envelope schema mutation');
assert(flat.includes('Desktop remains canonical authority') || flat.includes('Desktop-canonical'),
  'audit doc must preserve Desktop canonical authority');
assert(flat.includes('Chrome remains request-only') || flat.includes('Chrome-request-only'),
  'audit doc must preserve Chrome request-only / read-only');

// ---- block conditions for later real remote proof ----
assert(flat.includes('Block Conditions for Any Later Real Remote WebDAV Proof') || flat.includes('Block Conditions'),
  'audit doc must define block conditions for a later real-remote proof');
for (const item of REMOTE_BLOCK_CONDITIONS) assert(flat.includes(item), `audit doc missing remote block condition: ${item}`);

// ---- product sync NOT READY globally + recommendation ----
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'audit doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'audit doc must not over-claim completion');
assert(flat.includes('Recommended Phase 40') || flat.includes('Phase 39 Verdict'),
  'audit doc must state the verdict / recommended next slice');
assert(/Option [ABC]/.test(flat), 'audit doc must recommend Option A, B, or C');
assert(flat.includes('Justification'), 'audit doc must justify the recommendation');

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
    assert(!gates.includes(netToken), `product gates module must not contain server/network token ${netToken}`);
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase39-webdav-local-proof-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase39-webdav-local-proof-readiness-audit.v1',
  phase: 'phase39-webdav-local-proof-readiness-audit',
  auditDoc,
  designOnly: true,
  recommendation: 'option-a-close-local-webdav-proof-series',
  ladderCommitsChecked: LADDER_COMMITS.length + 1,
  provenChecked: PROVEN.length,
  unprovenChecked: UNPROVEN.length,
  remoteBlockConditionsChecked: REMOTE_BLOCK_CONDITIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  phase38CommitReferenced: PHASE38_COMMIT,
  webdavDeferredInSource: true,
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase39-webdav-local-proof-readiness-audit');
