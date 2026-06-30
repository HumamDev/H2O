#!/usr/bin/env node
//
// Phase 23a — fixture-backed live proof evidence validator for chat-tag-bind.
//
// Static evidence/source guard only. It does not seed fixture data, run runtime sync,
// mutate product state, or broaden applied metadata request types.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const evidencePath = 'release-evidence/2026-06-25/labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof.md';
const folderSyncPath = 'src-surfaces-base/studio/sync/folder-sync.tauri.js';

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

for (const file of [evidencePath, folderSyncPath]) {
  assert(exists(file), `required file missing: ${file}`);
}

if (!exists(evidencePath) || !exists(folderSyncPath)) {
  console.error('FAIL validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidencePath);
const folderSync = read(folderSyncPath);

requireIncludes(evidence, [
  'Phase 23a fixture-backed live `chat-tag-bind` proof: PASSED',
  'Product metadata sync: NOT READY globally',
  '`chat-category-assign`',
  '`chat-category-clear`',
  '`chat-label-bind`',
  '`chat-tag-bind`',
  '57fe33e',
  'tagCatalogCount: 0',
  'H2O.Studio.store.tags.upsert',
  'createsSyncRequest: `false`',
  'chromeMutation: `false`',
  'No sync tag-create request was added',
  'Chrome did not mutate canonical tag catalog data',
], evidencePath);

requireIncludes(evidence, [
  'chatId: `d2c_request_materializer_chat_1782334630557`',
  'tagId: `phase23a_proof_tag_chat_tag_bind`',
  'existingTagBindingCountForChat: `0`',
  'hashes.chatTagBindings | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`',
  'projectionHash | `efa2a7d0cfcaff69b0e01fb34a16c71bacdfb5dc7ce601608c9ba9b5955ac5e8`',
  'exportId: `72c5369e-f859-4da5-8c4d-73457d8e9c17`',
], `${evidencePath} baseline`);

requireIncludes(evidence, [
  'requestId: `library-metadata-mutation-request:ffd838ab-d209-4524-b053-611da48fc745`',
  'action: `chat-tag-bind`',
  'requestType: `chat-tag-bind`',
  'expectedCurrentBasisHash: `efa2a7d0cfcaff69b0e01fb34a16c71bacdfb5dc7ce601608c9ba9b5955ac5e8`',
  'noChromeCanonicalMutation: `true`',
  'noHardDelete: `true`',
  'noPurge: `true`',
  'noChatDelete: `true`',
  'noTagDelete: `true`',
  'noMetadataDelete: `true`',
], `${evidencePath} chrome request`);

requireIncludes(evidence, [
  'sourceSummary.libraryMetadataMutationRequestCount: `0`',
  'background/event path had already processed it',
  'receiptId: `library-metadata-mutation-receipt:library-metadata-mutation-request:ffd838ab-d209-4524-b053-611da48fc745:applied`',
  'status: `applied`',
  'code: `library-metadata-mutation-request-applied`',
  'requestAction: `chat-tag-bind`',
  'beforeProjectionHash: `efa2a7d0cfcaff69b0e01fb34a16c71bacdfb5dc7ce601608c9ba9b5955ac5e8`',
  'resultingCanonicalHash: `e8041e2be2e198cc78886f2fdee4c9af8f67ca5fcc35445024e853135a4b17e4`',
  'counts.chatTagBindingCount: `1`',
  'counts.tagCatalogCount: `1`',
  'receiptId: `library-metadata-mutation-receipt:library-metadata-mutation-request:ffd838ab-d209-4524-b053-611da48fc745:skipped_duplicate`',
  'code: `library-metadata-mutation-request-already-bound-canonical`',
  'hashes.chatTagBindings | `06d33c4c218abf87b353169fe70b30a2b9d6e1eed01e0b9c07fdf6790f625ed3`',
  'projectionHash | `e8041e2be2e198cc78886f2fdee4c9af8f67ca5fcc35445024e853135a4b17e4`',
  'exportId: `aedd1448-d05e-42a6-8667-27dbb71cadb4`',
], `${evidencePath} desktop apply`);

requireIncludes(evidence, [
  'importLatestResult.status: `sync-folder-imported`',
  'requestRow.status: `resolved`',
  'requestRow.action: `chat-tag-bind`',
  'applied receipt imported: `true`',
  'skipped_duplicate receipt imported: `true`',
  'requestResolved: `true`',
  'notPending: `true`',
  'appliedReceiptSeen: `true`',
  'replayReceiptSeen: `true`',
  'countIsOne: `true`',
  'projectionHashUpdated: `true`',
], `${evidencePath} chrome receipt import`);

requireIncludes(evidence, [
  'redacted/hash-only evidence was used',
  'No raw chat title was returned',
  'No raw chat content was returned',
  'No raw tag name was returned',
  'No account-linked metadata was returned',
], `${evidencePath} privacy`);

requireIncludes(evidence, [
  'No delete',
  'purge',
  'hard delete',
  'unbind',
  'remove',
  'clear',
  'chat delete',
  'snapshot delete',
  'asset delete',
  'label delete',
  'tag delete',
  'category delete',
  'metadata delete',
], `${evidencePath} safety`);

requireIncludes(evidence, [
  '`chat-tag-clear`',
  '`chat-tag-remove`',
  '`chat-tag-unbind`',
  'label clear/remove/unbind',
  'tag catalog create/rename/delete sync',
  'label/category catalog actions',
  'classification expansion',
  'destructive actions',
  'WebDAV/cloud/relay transport',
], `${evidencePath} deferred scope`);

const appliedActions = extractAppliedActions(folderSync);
assert(
  JSON.stringify(appliedActions) === JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind', 'chat-tag-bind']),
  `${folderSyncPath}: applied request types must remain exactly chat-category-assign, chat-category-clear, chat-label-bind, and chat-tag-bind; found ${JSON.stringify(appliedActions)}`
);

requireIncludes(folderSync, [
  "var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);",
  'applyChatTagBindLibraryMetadataRequest',
  'tags.bindChat(tagId, chatId)',
  'tags.listForChat(chatId)',
  'library-metadata-mutation-request-already-bound-canonical',
  'library-metadata-mutation-request-tag-bind-projection-not-reflected',
  'productSyncReady: false',
], folderSyncPath);

const forbiddenEvidenceClaims = [
  'Product metadata sync: READY globally',
  'Product metadata sync is READY globally',
  'tag clear is ready',
  'tag remove is ready',
  'tag unbind is ready',
  'tag catalog sync is ready',
  'catalog actions are ready',
  'classification expansion is ready',
  'WebDAV/cloud/relay transport is ready',
];
for (const claim of forbiddenEvidenceClaims) {
  assert(!evidence.includes(claim), `${evidencePath} contains forbidden readiness claim: ${claim}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase23a-chat-tag-bind-fixture-live-proof-validator.v1',
  phase: 'phase23a-chat-tag-bind-fixture-live-proof',
  evidencePath,
  liveProofVerdict: 'passed',
  fixtureProofOnly: true,
  tagCreateSyncRequestAdded: false,
  chromeCanonicalTagCatalogMutation: false,
  appliedRequestTypes: appliedActions,
  chatTagBindLiveProof: true,
  chromeRequestOnly: true,
  desktopCanonicalAuthority: true,
  productMetadataSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase23a-chat-tag-bind-fixture-live-proof');
