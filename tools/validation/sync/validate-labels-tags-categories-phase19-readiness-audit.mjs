#!/usr/bin/env node
//
// Phase 19 — closeout / readiness audit meta-validator for the three live-proven applied types
// (chat-category-assign, chat-category-clear, chat-label-bind).
//
// Lightweight consistency check (no behavior re-implementation). It verifies the readiness audit doc
// exists and is internally consistent with the codebase: enumerates the three applied types and the
// exact allowlist, lists every required invariant, records every deferred + blocked item, references
// every proving validator (each present on disk), cites the relevant phase commits, and verifies the
// enforcement tokens it cites are present in the real source files.
//
// Optional: pass --run-suite to execute every prior validator as a closeout gate (exit 0 each).

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const failures = [];
const runSuite = process.argv.includes('--run-suite');

const auditDoc = 'release-evidence/2026-06-25/labels-tags-categories-phase19-readiness-audit.md';

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }
function assert(condition, message) { if (!condition) failures.push(message); }

const APPLIED_TYPES = ['chat-category-assign', 'chat-category-clear', 'chat-label-bind'];

const REQUIRED_INVARIANTS = [
  'Only chat-category-assign, chat-category-clear, and chat-label-bind are applied',
  'Chrome remains request-only',
  'Chrome remains read-only over canonical metadata',
  'Desktop remains canonical authority',
  'No Chrome canonical mutation',
  'No Desktop canonical mutation beyond the three approved apply paths',
  'chat-category-clear and chat-label-bind are non-destructive',
  'Clear means category assignment becomes NULL',
  'Bind means add a label binding only',
  'Destructive-shaped actions remain blocked/deferred',
  'No WebDAV/cloud/relay transport',
  'Product metadata sync remains NOT READY globally',
];

const REQUIRED_NO_DELETE_FLAGS = [
  'noHardDelete', 'noPurge', 'noChatDelete', 'noSnapshotDelete', 'noAssetDelete',
  'noLabelDelete', 'noTagDelete', 'noCategoryDelete', 'noMetadataDelete',
];

const REQUIRED_BLOCKED = [
  'chat-label-clear',
  'chat-label-remove',
  'chat-label-unbind',
  'all tag actions',
  'catalog create/rename/delete',
  'classification expansion',
  'generic clear/delete/remove/unbind/purge/hard-delete',
  'WebDAV/cloud/relay transport',
];

const REQUIRED_DEFERRED = [
  'label clear/remove/unbind',
  'tag bind/clear/remove/unbind',
  'label/tag/category catalog create/rename/delete',
  'classification expansion',
  'destructive actions',
  'live proof for any not-yet-captured type',
  'WebDAV/cloud/relay transport',
  'broader product metadata sync closeout',
];

const REQUIRED_VALIDATORS = [
  'validate-labels-tags-categories-phase18-chat-label-bind-live-proof.mjs',
  'validate-labels-tags-categories-phase17-chat-label-bind.mjs',
  'validate-labels-tags-categories-phase16-next-request-type-design-audit.mjs',
  'validate-labels-tags-categories-phase15-readiness-audit.mjs',
  'validate-labels-tags-categories-phase14h-live-apply-receipt-canonical-consistency.mjs',
  'validate-labels-tags-categories-phase14g-live-runtime-apply-consistency.mjs',
  'validate-labels-tags-categories-phase14f-clear-apply-consistency.mjs',
  'validate-labels-tags-categories-phase14e-request-export-sanitizer.mjs',
  'validate-labels-tags-categories-phase14b-export-lock-diagnosis.mjs',
  'validate-labels-tags-categories-phase13-chat-category-clear.mjs',
  'validate-labels-tags-categories-phase12-chat-category-clear-design.mjs',
  'validate-labels-tags-categories-phase11-closeout-readiness-audit.mjs',
  'validate-f19-sync-hardening.mjs',
  'validate-f15-cutover.mjs',
];

const REQUIRED_COMMITS = ['b16fa29', 'd2b6816', 'e463a88', 'b9ef22b', 'ac49df1', '019eee6', '0b58d9e', '0f65543'];

// Enforcement tokens the doc cites that must really exist in the named source file.
const ENFORCEMENT_ANCHORS = [
  ['APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS', 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ["'chat-category-assign': true", 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ["'chat-category-clear': true", 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ["'chat-label-bind': true", 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ["NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])", 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ["NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear'])", 'src-surfaces-base/studio/sync/folder-import.mv3.js'],
  ['category_id = NULL', 'src-surfaces-base/studio/store/categories.tauri.js'],
  ['INSERT OR IGNORE INTO label_bindings', 'src-surfaces-base/studio/store/labels.tauri.js'],
  ['readOnlyProjection: true', 'src-surfaces-base/studio/sync/folder-import.mv3.js'],
  ['canonicalMutation: false', 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js'],
  ['chromeReadOnlyCanonical: true', 'src-surfaces-base/studio/sync/library/library-metadata-diagnostics.js'],
  ['delete|remove|unbind|clear|purge|hard-delete', 'src-surfaces-base/studio/sync/folder-sync.tauri.js'],
  ['delete|remove|unbind|clear|purge|hard-delete', 'src-surfaces-base/studio/sync/folder-import.mv3.js'],
];

// ---- doc presence ----
assert(exists(auditDoc), `${auditDoc}: missing`);
if (!exists(auditDoc)) {
  console.error('FAIL validate-labels-tags-categories-phase19-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
const doc = read(auditDoc);
assert(doc.length > 3000, `${auditDoc}: audit doc is too short to be a closeout`);

// ---- three applied types enumerated + exact allowlist asserted ----
for (const type of APPLIED_TYPES) assert(doc.includes(type), `audit doc missing applied type: ${type}`);
assert(doc.includes('applied-type allowlist is exactly'), 'audit doc must state the allowlist is exactly the three types');
for (const type of APPLIED_TYPES) {
  assert(doc.includes(`'${type}': true`), `audit doc must cite the exact allowlist entry '${type}': true`);
}

// ---- invariants + no-delete flags ----
for (const inv of REQUIRED_INVARIANTS) assert(doc.includes(inv), `audit doc missing invariant: ${inv}`);
for (const flag of REQUIRED_NO_DELETE_FLAGS) assert(doc.includes(flag), `audit doc missing no-delete flag: ${flag}`);

// ---- blocked + deferred surfaces ----
for (const item of REQUIRED_BLOCKED) assert(doc.includes(item), `audit doc missing blocked action: ${item}`);
for (const item of REQUIRED_DEFERRED) assert(doc.includes(item), `audit doc missing deferred-surface item: ${item}`);

// ---- validators referenced AND present on disk ----
for (const validator of REQUIRED_VALIDATORS) {
  assert(doc.includes(validator), `audit doc does not reference proving validator: ${validator}`);
  assert(exists(`tools/validation/sync/${validator}`), `required validator file missing: ${validator}`);
}
const selfName = 'validate-labels-tags-categories-phase19-readiness-audit.mjs';
assert(exists(`tools/validation/sync/${selfName}`), 'Phase 19 validator file missing');

// ---- commits cited ----
for (const commit of REQUIRED_COMMITS) assert(doc.includes(commit), `audit doc missing context commit: ${commit}`);

// ---- enforcement anchors real in source AND cited in doc ----
for (const [token, file] of ENFORCEMENT_ANCHORS) {
  assert(exists(file), `enforcement source file missing: ${file}`);
  if (exists(file)) assert(read(file).includes(token), `enforcement token absent from source ${file}: ${token}`);
  assert(doc.includes(token), `audit doc does not cite enforcement token: ${token}`);
}

// ---- readiness verdicts present, no over-claim ----
assert(/READY FOR REVIEW/.test(doc), 'audit doc must state the safe-loop readiness verdict');
assert(doc.includes('NOT READY'), 'audit doc must keep product sync NOT READY globally');
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
  console.error('FAIL validate-labels-tags-categories-phase19-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase19-readiness-audit.v1',
  phase: 'phase19-readiness-audit',
  auditDoc,
  appliedTypes: APPLIED_TYPES,
  appliedTypeCount: APPLIED_TYPES.length,
  invariantsChecked: REQUIRED_INVARIANTS.length,
  noDeleteFlagsChecked: REQUIRED_NO_DELETE_FLAGS.length,
  blockedActionsChecked: REQUIRED_BLOCKED.length,
  deferredItemsChecked: REQUIRED_DEFERRED.length,
  validatorsReferencedAndPresent: REQUIRED_VALIDATORS.length,
  commitsCited: REQUIRED_COMMITS.length,
  enforcementAnchorsVerified: ENFORCEMENT_ANCHORS.length,
  suiteGateRun: runSuite,
  suite,
  readiness: 'ready-for-review',
  productSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase19-readiness-audit');
