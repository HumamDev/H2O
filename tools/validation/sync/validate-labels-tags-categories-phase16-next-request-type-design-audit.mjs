#!/usr/bin/env node
//
// Phase 16 — design-only next request type audit validator.
//
// Verifies that the evidence recommends one next single request type, keeps Phase 16 design-only,
// preserves the current applied allowlist, and grounds the recommendation in existing source
// support without changing runtime behavior.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const evidencePath = 'release-evidence/2026-06-25/labels-tags-categories-phase16-next-request-type-design-audit.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';
const folderImportPath = 'src-surfaces-base/studio/sync/folder-import.mv3.js';
const labelsStorePath = 'src-surfaces-base/studio/store/labels.tauri.js';
const projectionPath = 'src-surfaces-base/studio/sync/library/library-metadata-export-projection.tauri.js';

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

for (const file of [evidencePath, folderSyncPath, folderImportPath, labelsStorePath, projectionPath]) {
  assert(exists(file), `required file missing: ${file}`);
}

if (!exists(evidencePath)) {
  console.error('FAIL validate-labels-tags-categories-phase16-next-request-type-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidencePath);
const folderSync = exists(folderSyncPath) ? read(folderSyncPath) : '';
const folderImport = exists(folderImportPath) ? read(folderImportPath) : '';
const labelsStore = exists(labelsStorePath) ? read(labelsStorePath) : '';
const projection = exists(projectionPath) ? read(projectionPath) : '';

requireIncludes(evidence, [
  'Recommended next single request type: `chat-label-bind`',
  'Phase 16 is design-only',
  'made no product behavior changes',
  'Product metadata sync verdict: NOT READY globally',
  'The Desktop applied request allowlist remains limited to:',
  '`chat-category-assign`',
  '`chat-category-clear`',
  '`chat-label-bind` is recommended for the next implementation phase but is not implemented by this audit',
  'Chrome request-only behavior',
  'Desktop canonical authority',
  'no Chrome canonical mutation',
  'no hard delete',
  'no purge',
  'no chat delete',
  'no snapshot delete',
  'no asset delete',
  'no label delete',
  'no tag delete',
  'no category delete',
  'no metadata delete',
  'no raw chat content',
  'no raw chat titles',
  'no raw label names',
  'redacted/hash-only diagnostics',
], evidencePath);

requireIncludes(evidence, [
  'chat-label-clear',
  'chat-label-remove',
  'chat-label-unbind',
  'chat-tag-clear',
  'chat-tag-remove',
  'chat-tag-unbind',
  'category-clear',
  'metadata-clear',
  'delete',
  'remove',
  'unbind',
  'purge',
  'hard-delete',
  'label create/rename/delete',
  'tag create/rename/delete',
  'category create/rename/delete',
  'classification expansion beyond the proven chat-category loop',
  'WebDAV/cloud/relay transport',
], `${evidencePath} negative gates`);

requireIncludes(evidence, [
  'H2O.Studio.store.labels.bindChat(labelId, chatId)',
  'labels.listForChat(chatId)',
  'chatLabelBindingCount',
  'hashes.chatLabelBindings',
  'bindings.chatLabels',
  'INSERT OR IGNORE',
  'existing label',
], `${evidencePath} recommendation grounding`);

const appliedActions = extractAppliedActions(folderSync);
assert(
  JSON.stringify(appliedActions) === JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind']),
  `${folderSyncPath}: after Phase 22 the applied request types must be exactly chat-category-assign, chat-category-clear, chat-label-bind, and chat-tag-bind; found ${JSON.stringify(appliedActions)}`
);

requireIncludes(folderImport, [
  "'chat-label-bind': { metadataKind: 'label', subjectKind: 'chat-label-binding', operation: 'bind', requiresChatId: true, requiresId: true }",
  'libraryMetadataMutationRequests',
  'noChromeCanonicalMutation',
  'noHardDelete',
  'noLabelDelete',
], folderImportPath);

requireIncludes(labelsStore, [
  'function bindChat(labelIdInput, chatIdInput, opts)',
  'INSERT OR IGNORE INTO label_bindings',
  'function listForChat(chatIdInput)',
  'SELECT label_id FROM label_bindings WHERE chat_id = ?',
  'function listChats(labelIdInput)',
  'tables: [\'labels\', \'label_bindings\']',
], labelsStorePath);

requireIncludes(projection, [
  'chatLabelBindingCount',
  'chatLabelBindings',
  'chatLabels',
  "var labelBindings = await listCatalogChatBindings(stores.labels, labels, 'label', warnings);",
  'rawLabelNames: false',
], projectionPath);

const forbiddenClaims = [
  'Product metadata sync verdict: READY globally',
  'Product metadata sync: READY globally',
  'chat-label-bind is implemented by this audit',
  'chat-label-clear is recommended',
  'chat-label-remove is recommended',
  'chat-tag-bind is recommended',
  'classification-set is recommended',
];
for (const claim of forbiddenClaims) {
  assert(!evidence.includes(claim), `${evidencePath} contains forbidden claim: ${claim}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase16-next-request-type-design-audit');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase16-next-request-type-design-audit-validator.v1',
  phase: 'phase16-next-request-type-design-audit',
  evidencePath,
  recommendedNextRequestType: 'chat-label-bind',
  currentAppliedRequestTypes: appliedActions,
  designOnly: true,
  productMetadataSyncReady: false,
  verdict: 'ready-for-phase17-chat-label-bind-design-implementation'
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase16-next-request-type-design-audit');
