#!/usr/bin/env node
//
// Phase 15 — readiness audit validator for the currently live-proven safe chat-category loop.
//
// This is intentionally static. It verifies the evidence and the narrow source anchors without
// re-running runtime flows or changing product state.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const evidencePath = 'release-evidence/2026-06-25/labels-tags-categories-phase15-readiness-audit.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const autoImportPath = 'src-surfaces-base/studio/sync/auto-import.mv3.js';
const importBundlePath = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function exists(relPath) {
  return fs.existsSync(path.join(root, relPath));
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function requireIncludes(text, tokens, label) {
  for (const token of tokens) {
    assert(text.includes(token), `${label} missing required token: ${token}`);
  }
}

function extractAppliedActions(source) {
  const match = source.match(/var APPLIED_LIBRARY_METADATA_MUTATION_REQUEST_ACTIONS\s*=\s*\{([\s\S]*?)\};/);
  if (!match) return [];
  const actions = [];
  const re = /'([^']+)'\s*:\s*true/g;
  let item;
  while ((item = re.exec(match[1]))) actions.push(item[1]);
  return actions.sort();
}

for (const file of [evidencePath, folderSyncPath, folderImportPath, autoImportPath, importBundlePath]) {
  assert(exists(file), `required file missing: ${file}`);
}

if (!exists(evidencePath)) {
  console.error('FAIL validate-labels-tags-categories-phase15-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidencePath);
const folderSync = exists(folderSyncPath) ? read(folderSyncPath) : '';
const folderImport = exists(folderImportPath) ? read(folderImportPath) : '';
const autoImport = exists(autoImportPath) ? read(autoImportPath) : '';
const importBundle = exists(importBundlePath) ? read(importBundlePath) : '';

requireIncludes(evidence, [
  'Phase 15 Readiness Audit',
  '`chat-category-assign`',
  '`chat-category-clear`',
  'READY FOR REVIEW for `chat-category-assign` and `chat-category-clear` only',
  'Product metadata sync: NOT READY globally',
  'Chrome remains request-only',
  'Desktop remains canonical authority',
  'No raw chat content',
  'No raw chat titles',
  'No raw chat IDs in guard output where hash matching is required',
  'No raw category names in guard output',
  'No raw label names in guard output',
  'No raw tag names in guard output',
  'Phase 14H stale category rehydration guard',
  'sha256("chat:" + chatId)',
  'suppressionWarningSeen: true',
  'Duplicate detection uses current canonical state, not receipt ledger alone',
  'label create/rename/delete',
  'tag create/rename/delete',
  'category create/rename/delete',
  'label binding/unbinding',
  'tag binding/unbinding',
  'category-wide clear/delete',
  'generic metadata clear/delete/remove/unbind/purge/hard-delete',
  'classification expansion beyond the proven chat-category loop',
  'WebDAV/cloud/relay transport',
  'b9ef22be12fdce2073a5015ac68ae8b679218435',
  '8fc2f2f6b036b30b034a89b3ee4251330d4b045d',
], evidencePath);

requireIncludes(evidence, [
  'noHardDelete',
  'noPurge',
  'noChatDelete',
  'noSnapshotDelete',
  'noAssetDelete',
  'noLabelDelete',
  'noTagDelete',
  'noCategoryDelete',
  'noMetadataDelete',
], `${evidencePath} safety guarantees`);

const appliedActions = extractAppliedActions(folderSync);
const allowedAppliedActions = JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind']);
assert(
  JSON.stringify(appliedActions) === allowedAppliedActions,
  `${folderSyncPath}: applied request types must be exactly chat-category-assign, chat-category-clear, and chat-label-bind after Phase 17; found ${JSON.stringify(appliedActions)}`
);

requireIncludes(folderSync, [
  "var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);",
  'verifiesCanonicalChatRowAfterClear: true',
  'rejectsIfCategoryStillPresent: true',
  'rejectsIfProjectionNotDecremented: true',
  'duplicateDetectionUsesCurrentCanonicalState: true',
  'staleAppliedReceiptDoesNotMaskCanonicalState: true',
  'verifiesCanonicalLabelBindingAfterBind: true',
  'rejectsIfLabelMissing: true',
  'rejectsIfProjectionNotIncremented: true',
  'productSyncReady: false',
], folderSyncPath);

requireIncludes(folderImport, [
  "var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);",
  'markLibraryMetadataMutationRequestsResolvedByReceipts',
  'No row is ever deleted',
  'productSyncReady: false',
], folderImportPath);

requireIncludes(autoImport, [
  "var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);",
  'productSyncReady: false',
], autoImportPath);

requireIncludes(importBundle, [
  'appliedChatCategoryClearReceiptChatHashes',
  "sha256Hex('chat:' + id)",
  'library-metadata-category-rehydration-suppressed-after-clear',
  'desktop-applied-chat-category-clear-receipt',
  'rawChatIdsReturned: false',
  'noDelete: true',
  'noPurge: true',
  'noChromeCanonicalMutation: true',
], importBundlePath);

const forbiddenEvidenceClaims = [
  'Product metadata sync: READY globally',
  'Product metadata sync is READY globally',
  'broad product metadata sync is complete',
  'label create/rename/delete is ready',
  'tag create/rename/delete is ready',
  'category create/rename/delete is ready',
];
for (const claim of forbiddenEvidenceClaims) {
  assert(!evidence.includes(claim), `${evidencePath} contains forbidden readiness claim: ${claim}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase15-readiness-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase15-readiness-audit-validator.v1',
  phase: 'phase15-readiness-audit',
  evidencePath,
  appliedRequestTypes: appliedActions,
  chromeRequestOnly: true,
  desktopCanonicalAuthority: true,
  phase14hGuardAnchorsVerified: true,
  productMetadataSyncReady: false,
  verdict: 'ready-for-review-chat-category-loop-only'
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase15-readiness-audit');
