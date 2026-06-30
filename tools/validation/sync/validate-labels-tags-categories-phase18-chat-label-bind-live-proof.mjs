#!/usr/bin/env node
//
// Phase 18 — live proof evidence validator for chat-label-bind.
//
// Static evidence/source guard only. It does not run runtime sync, mutate product state,
// or broaden applied metadata request types.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

const evidencePath = 'release-evidence/2026-06-25/labels-tags-categories-phase18-chat-label-bind-live-proof.md';
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
  console.error('FAIL validate-labels-tags-categories-phase18-chat-label-bind-live-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const evidence = read(evidencePath);
const folderSync = read(folderSyncPath);

requireIncludes(evidence, [
  'Phase 18 live chat-label-bind proof: PASSED',
  'Product metadata sync: NOT READY globally',
  '`chat-label-bind`',
  '`chat-category-assign`',
  '`chat-category-clear`',
  '0b58d9ed99d2ac4144238f256c3f5082ebb983fd',
  'requestId: `library-metadata-mutation-request:ce7ae883-06c2-411a-8a73-9b840478deb6`',
  'action: `chat-label-bind`',
  'labelId: `wf_blocked`',
  'expectedCurrentBasisHash: `a349b709834e64a5c48ac404a1d872c6fea7cced238574fe375846a195484b7c`',
  'beforeProjectionHash: `a349b709834e64a5c48ac404a1d872c6fea7cced238574fe375846a195484b7c`',
  'resultingCanonicalHash: `f450dbcd924f4d71d56ebaa315e5fa20da8f122bfd392378c733338bebc133c6`',
  '`counts.chatLabelBindingCount: 1`',
  'code: `library-metadata-mutation-request-already-bound-canonical`',
  '`hashes.chatLabelBindings` | `b8fa49b48242aaadca90c4204f51e877d75b7c6d2e5b1e26319512cf22f3bdd6`',
  'canonical post-write verification via `H2O.Studio.store.labels.listForChat(chatId)`',
  'Chrome request-only export',
  'Desktop authoritative apply',
  'Chrome read-only receipt import/resolution',
  'replay/idempotency through `skipped_duplicate`',
  'no Chrome canonical mutation',
  'no raw chat title/content/label name leak',
], evidencePath);

requireIncludes(evidence, [
  'no hard delete',
  'no purge',
  'no chat delete',
  'no snapshot delete',
  'no asset delete',
  'no label delete',
  'no tag delete',
  'no category delete',
  'no metadata delete',
], `${evidencePath} safety`);

requireIncludes(evidence, [
  '`chat-label-clear`',
  '`chat-label-remove`',
  '`chat-label-unbind`',
  'tag actions',
  'label catalog create/rename/delete/clear',
  'classification expansion',
  'destructive actions',
  'WebDAV/cloud/relay transport',
], `${evidencePath} deferred scope`);

const appliedActions = extractAppliedActions(folderSync);
assert(
  JSON.stringify(appliedActions) === JSON.stringify(['chat-category-assign', 'chat-category-clear', 'chat-label-bind']),
  `${folderSyncPath}: applied request types must remain exactly chat-category-assign, chat-category-clear, and chat-label-bind; found ${JSON.stringify(appliedActions)}`
);

requireIncludes(folderSync, [
  "var NON_DESTRUCTIVE_CLEAR_ALLOWLIST = new Set(['chat-category-clear']);",
  'applyChatLabelBindLibraryMetadataRequest',
  'labels.bindChat(labelId, chatId)',
  'labels.listForChat(chatId)',
  'library-metadata-mutation-request-already-bound-canonical',
  'library-metadata-mutation-request-label-bind-projection-not-reflected',
  'productSyncReady: false',
], folderSyncPath);

const forbiddenEvidenceClaims = [
  'Product metadata sync: READY globally',
  'Product metadata sync is READY globally',
  'label clear is ready',
  'label remove is ready',
  'label unbind is ready',
  'tag actions are ready',
  'catalog actions are ready',
  'classification expansion is ready',
  'WebDAV/cloud/relay transport is ready',
];
for (const claim of forbiddenEvidenceClaims) {
  assert(!evidence.includes(claim), `${evidencePath} contains forbidden readiness claim: ${claim}`);
}

if (failures.length) {
  console.error('FAIL validate-labels-tags-categories-phase18-chat-label-bind-live-proof');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  schema: 'h2o.studio.library-metadata.phase18-chat-label-bind-live-proof-validator.v1',
  phase: 'phase18-chat-label-bind-live-proof',
  evidencePath,
  liveProofVerdict: 'passed',
  appliedRequestTypes: appliedActions,
  chatLabelBindLiveProof: true,
  chromeRequestOnly: true,
  desktopCanonicalAuthority: true,
  productMetadataSyncReady: false,
}, null, 2));
console.log('PASS validate-labels-tags-categories-phase18-chat-label-bind-live-proof');
