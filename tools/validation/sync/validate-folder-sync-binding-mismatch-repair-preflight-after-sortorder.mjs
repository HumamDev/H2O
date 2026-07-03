#!/usr/bin/env node
//
// Folder Sync binding-mismatch repair preflight after sortOrder closeout/S5.
//
// Proves the post-sortOrder posture: sortOrder is no longer active, but
// binding-mismatch still blocks productSyncReady.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

const root = process.cwd();

const evidencePath = 'release-evidence/2026-07-01/folder-sync-binding-mismatch-repair-preflight-after-sortorder.md';
const readinessRecheckPath = 'release-evidence/2026-07-01/folder-sync-productsyncready-readiness-recheck-after-s5.md';
const s5EvidencePath = 'release-evidence/2026-07-01/folder-sync-s5-f11-sortorder-allowed-set-flip.md';
const foldersStorePath = 'src-surfaces-base/studio/store/folders.tauri.js';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';

const bindingAssets = [
  ['F21', 'release-evidence/2026-06-25/folder-sync-f21-binding-mismatch-repair-readiness-audit.md', 'tools/validation/sync/validate-folder-sync-f21-binding-mismatch-repair-readiness-audit.mjs'],
  ['F22', 'release-evidence/2026-06-25/folder-sync-f22-binding-repair-request-receipt-spec.md', 'tools/validation/sync/validate-folder-sync-f22-binding-repair-request-receipt-spec.mjs'],
  ['F23', 'release-evidence/2026-06-25/folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.md', 'tools/validation/sync/validate-folder-sync-f23-binding-repair-envelope-conflict-matrix-harness.mjs'],
  ['F24', 'release-evidence/2026-06-25/folder-sync-f24-binding-repair-apply-proof-harness.md', 'tools/validation/sync/validate-folder-sync-f24-binding-repair-apply-proof-harness.mjs'],
  ['F25', 'release-evidence/2026-06-25/folder-sync-f25-binding-repair-negative-apply-proof-harness.md', 'tools/validation/sync/validate-folder-sync-f25-binding-repair-negative-apply-proof-harness.mjs'],
  ['F26', 'release-evidence/2026-06-25/folder-sync-f26-binding-repair-implementation-readiness-gate.md', 'tools/validation/sync/validate-folder-sync-f26-binding-repair-implementation-readiness-gate.mjs'],
  ['F27', 'release-evidence/2026-06-25/folder-sync-f27-lane-status-readiness-ledger-v2.md', 'tools/validation/sync/validate-folder-sync-f27-lane-status-readiness-ledger-v2.mjs'],
  ['F28', 'release-evidence/2026-06-25/folder-sync-f28-implementation-sequencing-plan.md', 'tools/validation/sync/validate-folder-sync-f28-implementation-sequencing-plan.mjs'],
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function compact(value) {
  return String(value).replace(/\s+/g, ' ');
}

function assertIncludes(haystack, needle, label) {
  assert.ok(haystack.includes(needle), `${label}: missing ${needle}`);
}

for (const rel of [
  evidencePath,
  readinessRecheckPath,
  s5EvidencePath,
  foldersStorePath,
  folderSyncPath,
  folderImportPath,
]) {
  assert.ok(exists(rel), `${rel} must exist`);
}

const evidence = read(evidencePath);
const flat = compact(evidence);
const readinessRecheck = read(readinessRecheckPath);
const s5Evidence = read(s5EvidencePath);
const foldersStore = read(foldersStorePath);
const folderSync = read(folderSyncPath);
const folderImport = read(folderImportPath);
const canonicalDesktopSource = `${foldersStore}\n${folderSync}`;
const combinedSource = `${canonicalDesktopSource}\n${folderImport}`;

for (const token of [
  'BINDING-MISMATCH REPAIR PREFLIGHT REQUIRED',
  '93dd818f',
  '6bf420be',
  'sortOrder lane is closed and no longer the active blocker',
  '`productSyncReady` remains NOT READY after S5',
  'remaining primary blocker is `binding-mismatch`',
  '`binding-mismatch` remains blocked',
  'canonical Desktop binding repair/handler receipt schema remains unminted',
  'Binding repair handler is not implemented in this slice',
  'No product source changed in this slice',
  'WebDAV/cloud/relay remains blocked',
  'No `fullBundle.v3` was started',
  'Chat Saving WebDAV/cloud/archive CAS remains blocked',
  'historical/spec/proof groundwork only',
  'Next implementation lane must handle binding mismatch safely',
  'The next step is not WebDAV/cloud',
]) {
  assertIncludes(evidence, token, `evidence token ${token}`);
}
assertIncludes(flat, 'They do not make the current product ready', 'historical assets are not product readiness');

assertIncludes(readinessRecheck, 'productSyncReady remains NOT READY after S5', 'readiness recheck verdict');
assertIncludes(readinessRecheck, '`field-mismatch:sortOrder` is no longer the active blocker', 'sortOrder no longer active blocker');
assertIncludes(readinessRecheck, '`binding-mismatch` remains blocked', 'readiness recheck binding blocker');
assertIncludes(s5Evidence, 'S5/F11 SORTORDER-ONLY ALLOWED-SET FLIP PASSED', 'S5 evidence verdict');

assertIncludes(foldersStore, "'field-mismatch:sortOrder': true", 'sortOrder no longer blocked in F11');
assertIncludes(foldersStore, "blockedClasses: classSelection.blocked.concat(['binding-mismatch'])", 'binding-mismatch remains force-blocked');
assert.ok(!foldersStore.includes("blockedClasses: classSelection.blocked.concat(['field-mismatch:sortOrder', 'binding-mismatch'])"),
  'sortOrder must no longer be force-blocked with binding-mismatch');

assert.ok(!canonicalDesktopSource.includes('h2o.studio.chat-folder-binding-receipt.v1'),
  'canonical Desktop binding repair/handler receipt schema remains unminted');
assertIncludes(folderImport, 'chat-folder-binding-receipt-import-blocked', 'binding receipt import remains blocked');
assert.ok(!combinedSource.includes('productSyncReady: true'), 'productSyncReady must not be true in source');
assert.ok(!combinedSource.includes('productSyncReady = true'), 'productSyncReady assignment must not flip true');
assert.doesNotMatch(combinedSource, /h2o\.studio\.fullBundle\.v3|fullBundle\.v3/i, 'fullBundle.v3 must not be introduced');
assert.doesNotMatch(combinedSource, /archivePackage|archiveCloud|archiveCas|cloudRelay/i, 'cloud/archive CAS must not be introduced');
assertIncludes(folderSync, 'async function s2bProjectSortOrderPreservingRenderMirror()', 'S2b projection helper remains');
assertIncludes(folderSync, "appliedReceipt.mirrorReprojection = 'applied-sortorder-preserving-s2b';", 'S2b projection marker remains');

for (const [phase, evidenceRel, validatorRel] of bindingAssets) {
  assert.ok(exists(evidenceRel), `${phase} evidence must exist`);
  assert.ok(exists(validatorRel), `${phase} validator must exist`);
  assertIncludes(evidence, evidenceRel, `${phase} evidence listed`);
  assertIncludes(evidence, validatorRel, `${phase} validator listed`);
}

for (const forbidden of [
  'Verdict: productSyncReady READY',
  'binding-mismatch is unblocked',
  'binding receipt schema minted',
  'binding repair handler is implemented in this slice',
  'WebDAV/cloud/relay started',
  'Chat Saving CAS unblocked',
]) {
  assert.ok(!flat.includes(forbidden), `evidence must not claim forbidden state: ${forbidden}`);
}

const result = {
  schema: 'h2o.studio.folder-sync.binding-mismatch-repair-preflight-after-sortorder.validator.v1',
  lane: 'folder-sync',
  phase: 'binding-mismatch-repair-preflight-after-sortOrder',
  evidence: evidencePath,
  verdict: 'BINDING_MISMATCH_REPAIR_PREFLIGHT_REQUIRED',
  sortOrderActiveBlocker: false,
  bindingMismatchBlocked: true,
  bindingReceiptSchemaMinted: false,
  productSyncReady: false,
  webdavCloudRelayStarted: false,
  chatSavingCasBlocked: true,
  bindingAssets: bindingAssets.map(([phase, evidenceRel, validatorRel]) => ({
    phase,
    evidence: evidenceRel,
    validator: validatorRel,
    status: 'historical-spec-proof-groundwork',
  })),
};

console.log(JSON.stringify(result, null, 2));
console.log('PASS validate-folder-sync-binding-mismatch-repair-preflight-after-sortorder');
