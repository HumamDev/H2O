#!/usr/bin/env node
//
// Phase 11 — closeout / readiness audit meta-validator for the safe chat-category-assign loop.
//
// Lightweight consistency check (no behavior re-implementation). It verifies that the readiness
// audit doc exists and is internally consistent with the codebase:
//   - enumerates every required boundary invariant,
//   - references every proving validator (each of which must exist on disk),
//   - cites every phase commit,
//   - records every deferred-surface item,
//   - and that the enforcement tokens it cites are actually present in the real source files.
// It also asserts all required prior-phase validator files exist.
//
// Optional: pass --run-suite to execute every prior validator as a closeout gate (exit 0 each).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const runSuite = process.argv.includes('--run-suite');

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase11-closeout-readiness-audit.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const REQUIRED_INVARIANTS = [
  'Only chat-category-assign is applied',
  'Chrome remains request-only',
  'Chrome remains read-only over canonical metadata',
  'Desktop remains canonical authority',
  'No Chrome canonical mutation',
  'No Desktop canonical mutation beyond the Phase 7 chat-category-assign apply',
  'Destructive-shaped metadata actions remain blocked/deferred',
  'No deletion of chats, snapshots, assets, labels, tags, categories, folders, or metadata',
  'noHardDelete / noPurge / noChatDelete / noSnapshotDelete / noAssetDelete preserved',
  'No WebDAV/cloud/relay transport',
  'Product metadata sync is not broadly complete',
];

const REQUIRED_DEFERRED = [
  'catalog create/rename',
  'label/tag binding',
  'classification-set',
  'destructive actions',
  'live-CDP capture',
  'WebDAV/cloud/relay transport',
  'broader metadata sync closeout',
];

const REQUIRED_VALIDATORS = [
  'validate-labels-tags-categories-phase1-diagnostics.mjs',
  'validate-labels-tags-categories-phase2-desktop-export.mjs',
  'validate-labels-tags-categories-phase3-chrome-import-display.mjs',
  'validate-labels-tags-categories-phase5-display-parity.mjs',
  'validate-labels-tags-categories-phase6-chrome-request-export.mjs',
  'validate-labels-tags-categories-phase7-desktop-apply-receipts.mjs',
  'validate-labels-tags-categories-phase8-chrome-receipt-import.mjs',
  'validate-labels-tags-categories-phase9-end-to-end-runtime-proof.mjs',
  'validate-labels-tags-categories-phase10-status-display.mjs',
  'validate-f19-sync-hardening.mjs',
  'validate-f15-cutover.mjs',
];

const REQUIRED_COMMITS = [
  'd94f796402ef6421f2b239659c8d6ab644e52a99',
  'f93c7233b614b5926ea3aafa6bea78c0985ef5f4',
  'f89e1a583f2e64350a6c6ee70caf4c60d0dff721',
  '02dbf4ef609cfe3d03cc3d6521040c76d72d8c35',
  '60d3c7404fd9a7f574d65dd770f26e0d72ff9e45',
  'd8120e5b1d0cb9dad365de1966f0462c16e0fcba',
  '93d07f3', '91e1c95', '8addf3a', '2b6116f', 'ede1f66', 'daf28cc',
];

// Enforcement tokens the doc cites that must really exist in the named source file.
const ENFORCEMENT_ANCHORS = [
  ["if (action !== 'chat-category-assign')", 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ['readOnlyProjection: true', 'src-surfaces-base/studio/sync/folder-import.mv3.js'],
  ['canonicalMutation: false', 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js'],
  ['chromeReadOnlyCanonical: true', 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js'],
];

// ---- doc presence ----
assert(exists(auditDoc), `${auditDoc}: missing`);
if (!exists(auditDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase11-closeout-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 2000, `${auditDoc}: audit doc is too short to be a closeout`);

// ---- invariants enumerated ----
for (const invariant of REQUIRED_INVARIANTS) {
  assert(doc.includes(invariant), `audit doc missing invariant: ${invariant}`);
}

// ---- deferred surface recorded ----
for (const item of REQUIRED_DEFERRED) {
  assert(doc.includes(item), `audit doc missing deferred-surface item: ${item}`);
}

// ---- validators referenced AND present on disk ----
for (const validator of REQUIRED_VALIDATORS) {
  assert(doc.includes(validator), `audit doc does not reference proving validator: ${validator}`);
  assert(exists(`tools/validation/sync/${validator}`), `required validator file missing: ${validator}`);
}

// ---- this Phase 11 validator self-reference + own existence ----
const selfName = 'validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs';
assert(doc.includes(selfName), 'audit doc should reference the Phase 11 validator');
assert(exists(`tools/validation/sync/${selfName}`), 'Phase 11 validator file missing');

// ---- commits cited ----
for (const commit of REQUIRED_COMMITS) {
  assert(doc.includes(commit), `audit doc missing context commit: ${commit}`);
}

// ---- enforcement anchors real in source AND cited in doc ----
for (const [token, file] of ENFORCEMENT_ANCHORS) {
  assert(exists(file), `enforcement source file missing: ${file}`);
  if (exists(file)) {
    assert(read(file).includes(token), `enforcement token absent from source ${file}: ${token}`);
  }
  assert(doc.includes(token), `audit doc does not cite enforcement token: ${token}`);
}

// ---- readiness verdicts present, no over-claim ----
assert(/READY FOR REVIEW/.test(doc), 'audit doc must state the safe-loop readiness verdict');
assert(doc.includes('NOT READY'), 'audit doc must state product sync is NOT READY');
assert(!/product metadata sync is complete/i.test(doc), 'audit doc must not over-claim completion');

// ---- optional: run the prior validators as a closeout gate ----
const suite = [];
if (runSuite && failures.length === 0) {
  for (const validator of REQUIRED_VALIDATORS) {
    const rel = `tools/validation/sync/${validator}`;
    try {
      execFileSync('node', [rel], { cwd: root, stdio: 'pipe' });
      suite.push({ validator, ok: true });
    } catch (e) {
      suite.push({ validator, ok: false });
      failures.push(`closeout suite gate failed: ${validator}`);
    }
  }
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase11-closeout-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase11-closeout-readiness-audit.v1',
  phase: 'phase11-closeout-readiness-audit',
  auditDoc,
  invariantsChecked: REQUIRED_INVARIANTS.length,
  deferredItemsChecked: REQUIRED_DEFERRED.length,
  validatorsReferencedAndPresent: REQUIRED_VALIDATORS.length,
  commitsCited: REQUIRED_COMMITS.length,
  enforcementAnchorsVerified: ENFORCEMENT_ANCHORS.length,
  suiteGateRun: runSuite,
  suite,
  readiness: 'ready-for-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase11-closeout-readiness-audit');
