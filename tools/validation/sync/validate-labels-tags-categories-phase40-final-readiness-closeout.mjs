#!/usr/bin/env node
//
// Phase 40 — final lane-wide readiness/closeout consolidation meta-validator (audit/closeout only).
//
// Verifies the final closeout doc exists and is internally consistent: audit/closeout only, summarizes
// the four-type metadata loop and the closed local WebDAV proof ladder, classifies surfaces
// (ready/dev-only/deferred/blocked), reconfirms the source invariants, states what is NOT complete,
// classifies folder sync as a separate future lane, lists the next-lane options, recommends the safest
// next step, keeps product metadata sync globally NOT READY, references the Phase 39 commit, and — as
// real drift guards — confirms the source allowlist is the phase-40 four-type core plus any later
// Operational single-canonical extensions, WebDAV stays deferred in the loop, and the gates module
// remains a disabled-by-default dev sandbox with no server/network code.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const closeoutDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase40-final-readiness-closeout.md';
const phase39Doc = 'release-evidence/2026-06-25/labels-tags-categories-phase39-webdav-local-proof-readiness-audit.md';
const folderSyncFile = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportFile = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const gatesFile = 'src-surfaces-base/studio/sync/webdav-transport-gates.js';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind'];
const OPERATIONAL_RUNTIME_TYPES = APPLIED_TYPES.concat(['chat-label-unbind', 'chat-tag-unbind']);
const PHASE39_COMMIT = 'bb68e5c1c17bec08aeb9f099794f04dc73bd479f';

const SURFACE_CLASSES = ['ready-for-maintainer-review', 'dev-only / proof-only', 'deferred', 'blocked'];

const NOT_COMPLETE = [
  'real remote WebDAV provider proof', 'credentials/auth/TLS/provider behavior',
  'cross-device remote conflict behavior', 'product WebDAV enablement',
  'label/tag unbind/remove/clear', 'catalog create/rename/delete', 'classification expansion',
  'folder sync', 'public/premium readiness',
];

const NEXT_LANE_OPTIONS = [
  'stop and send to maintainer review', 'real-remote WebDAV proof design gate',
  'folder sync readiness/design lane', 'next metadata request type design gate',
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
assert(exists(closeoutDoc), `${closeoutDoc}: missing`);
if (!exists(closeoutDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase40-final-readiness-closeout');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(closeoutDoc);
assert(doc.length > 4000, `${closeoutDoc}: closeout doc too short`);
const flat = doc.replace(/\s+/g, ' ');

// ---- audit/closeout only ----
for (const marker of ['AUDIT / CLOSEOUT / READINESS CONSOLIDATION ONLY', 'No code was implemented',
  'No product WebDAV transport was enabled', 'No source modules were modified']) {
  assert(flat.includes(marker), `closeout doc missing closeout-only marker: ${marker}`);
}

// ---- Phase 39 commit + WebDAV local proof closeout + four types ----
assert(flat.includes(PHASE39_COMMIT), 'closeout doc must reference the Phase 39 commit (full SHA)');
assert(exists(phase39Doc), 'Phase 39 closeout doc must exist on disk');
assert(flat.includes('Closed Local WebDAV Proof Ladder') || flat.includes('local proof closeout'),
  'closeout doc must reference the WebDAV local proof closeout');
for (const type of APPLIED_TYPES) assert(flat.includes(type), `closeout doc missing applied type: ${type}`);

// ---- surface classification ----
for (const cls of SURFACE_CLASSES) assert(flat.includes(cls), `closeout doc missing surface class: ${cls}`);

// ---- posture reconfirmations ----
assert(flat.includes('disabled by default'), 'closeout doc must keep WebDAV disabled by default');
assert(flat.includes('webdav-dev-only-do-not-ship'), 'closeout doc must require the dev-only flag');
assert(flat.includes('active product transport remains local sync-folder JSON'),
  'closeout doc must keep active product transport as local sync-folder JSON');
assert(/no metadata request\/receipt\/projection schema mutation/i.test(flat) || /no schema mutation/i.test(flat),
  'closeout doc must state no metadata envelope schema mutation');
assert(flat.includes('Desktop remains canonical authority'), 'closeout doc must preserve Desktop canonical authority');
assert(flat.includes('Chrome remains request-only'), 'closeout doc must preserve Chrome request-only / read-only');
assert(flat.includes('real remote WebDAV provider proof'),
  'closeout doc must state no real remote WebDAV proof yet');

// ---- what is NOT complete ----
assert(flat.includes('What Is NOT Complete') || flat.includes('NOT Complete'),
  'closeout doc must state what is not complete');
for (const item of NOT_COMPLETE) assert(flat.includes(item), `closeout doc missing not-complete item: ${item}`);

// ---- folder sync is a separate future lane ----
assert(flat.includes('SEPARATE FUTURE LANE') || flat.includes('separate future lane'),
  'closeout doc must classify folder sync as a separate future lane');
assert(flat.includes('NOT part of this'), 'closeout doc must state folder sync is not part of this metadata lane');

// ---- next-lane options + recommendation ----
for (const opt of NEXT_LANE_OPTIONS) assert(flat.includes(opt), `closeout doc missing next-lane option: ${opt}`);
assert(flat.includes('Recommended Safest Next Step'), 'closeout doc must recommend the safest next step');
assert(/Option [ABCD]/.test(flat), 'closeout doc must recommend one of the lane options');
assert(flat.includes('Justification'), 'closeout doc must justify the recommendation');

// ---- product sync NOT READY globally + readiness verdict ----
assert(flat.includes('globally NOT READY') || flat.includes('NOT READY globally'),
  'closeout doc must keep product metadata sync globally NOT READY');
assert(!/product metadata sync is complete/i.test(flat), 'closeout doc must not over-claim completion');
assert(flat.includes('READY FOR MAINTAINER REVIEW'), 'closeout doc must state the final readiness verdict');

// ---- REAL SOURCE: four-core plus Operational.2 unbinds; WebDAV deferred; gates module disabled-by-default, no server/network ----
assert(exists(folderSyncFile), `${folderSyncFile}: missing`);
if (exists(folderSyncFile)) {
  const applied = parseAppliedAllowlist(read(folderSyncFile));
  assert(Array.isArray(applied), 'could not parse APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS from source');
  if (Array.isArray(applied)) {
    const sorted = applied.slice().sort();
    const expected = OPERATIONAL_RUNTIME_TYPES.slice().sort();
    assert(sorted.length === expected.length && sorted.every((a, i) => a === expected[i]),
      `source applied allowlist drifted: expected [${expected.join(', ')}], got [${sorted.join(', ')}]`);
    for (const a of applied) assert(OPERATIONAL_RUNTIME_TYPES.includes(a), `source enables a broader/unexpected applied type: ${a}`);
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
  console.error('FAIL validate-labels-tags-categories-phase40-final-readiness-closeout');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase40-final-readiness-closeout.v1',
  phase: 'phase40-final-readiness-closeout',
  closeoutDoc,
  auditOnly: true,
  recommendation: 'option-a-stop-and-send-to-maintainer-review',
  surfaceClassesChecked: SURFACE_CLASSES.length,
  notCompleteChecked: NOT_COMPLETE.length,
  nextLaneOptionsChecked: NEXT_LANE_OPTIONS.length,
  appliedAllowlistInSource: parseAppliedAllowlist(read(folderSyncFile)),
  operationalRuntimeTypes: OPERATIONAL_RUNTIME_TYPES,
  phase39CommitReferenced: PHASE39_COMMIT,
  webdavDeferredInSource: true,
  finalReadiness: 'ready-for-maintainer-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase40-final-readiness-closeout');
