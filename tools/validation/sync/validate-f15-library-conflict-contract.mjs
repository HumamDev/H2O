#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assertExists(file) {
  if (!exists(file)) failures.push(`${file}: missing`);
}

function assertContains(file, needle, label = needle) {
  const text = read(file);
  if (!text.includes(needle)) failures.push(`${file}: missing ${label}`);
}

function assertAll(file, needles) {
  needles.forEach((needle) => assertContains(file, needle));
}

const doc = 'docs/systems/cross-platform/f15.12-cross-install-conflict-resolution-contract.md';
const proof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const syncValidator = 'tools/validation/sync/validate-f15-library-sync-proof.mjs';
const closureValidator = 'tools/validation/sync/validate-f15-library-closure.mjs';
const folderValidator = 'tools/validation/sync/validate-f15-folder-binding-absorption.mjs';

[
  doc,
  proof,
  syncValidator,
  closureValidator,
  folderValidator
].forEach(assertExists);

const conflictCaseNames = [
  'conflict-catalog-create-same-name-first-wins',
  'conflict-catalog-rename-stale-base-blocks',
  'conflict-catalog-recolor-stale-base-blocks',
  'conflict-catalog-archive-vs-rename-stale-loser-blocks',
  'conflict-catalog-tombstone-vs-restore-f5-authority',
  'conflict-catalog-tombstone-blocks-new-bind',
  'conflict-catalog-f5-seal-vs-restore-conflict',
  'conflict-binding-duplicate-chat-label',
  'conflict-binding-duplicate-chat-tag',
  'conflict-binding-duplicate-tag-category',
  'conflict-binding-bind-vs-unbind-stale-loser',
  'conflict-binding-chat-category-replacement-race-partial',
  'conflict-binding-chat-folder-replacement-race-partial',
  'conflict-binding-f7-f15-identity-bridge-warning',
  'conflict-cache-drift-warning-only',
  'conflict-cache-never-source-of-truth',
  'conflict-cache-read-your-own-write-local-only',
  'conflict-bulk-same-bundle-idempotent',
  'conflict-bulk-import-during-edit-partial',
  'conflict-bulk-partial-retry-no-duplicates',
  'conflict-f5-duplicate-review-idempotent',
  'conflict-f5-auto-expiry-vs-restore',
  'conflict-f5-conflicting-terminal-closure-blocks',
  'conflict-folder-f7-f15-identity-shadow-deterministic',
  'conflict-folder-fallback-flag-off-compatible',
  'conflict-folder-delegated-chat-folder-uses-folder-metadata',
  'conflict-folder-trigger-protection-guarded-optional',
  'conflict-privacy-leak-scan'
];

const contractCodes = [
  'library-catalog-cross-install-stale-base',
  'library-catalog-cross-install-name-collision',
  'library-catalog-cross-install-lifecycle-conflict',
  'library-catalog-f5-review-conflict',
  'library-binding-cross-install-stale-base',
  'library-binding-cross-install-duplicate-edge',
  'library-binding-cross-install-state-conflict',
  'library-binding-f7-f15-identity-conflict',
  'library-bulk-cross-install-partial-conflict',
  'library-conflict-refresh-required',
  'library-cache-cross-install-drift'
];

if (failures.length === 0) {
  assertAll(doc, [
    'F15.12 — Cross-Install Conflict Resolution Contract',
    'F15.12.a defines the conflict-resolution contract only',
    'F15.12.b will extend runtime proof and validators',
    'No new kernel primitive',
    'one-subject-per-proposal',
    'binding-as-subject',
    '`folder_bindings` SQLite trigger protection remains deferred',
    'first valid settlement wins',
    'No field-level auto-merge in F15',
    'Stale `baseHash`',
    'Same `eventDigest` / `dedupeKey`',
    'Watermark is forward-only',
    'Consumed-operation rows are append-only',
    'bindingKind',
    'nameHash',
    'Cache is never conflict authority',
    'folder.metadata',
    'Folders are not `library.catalog`'
  ]);
  contractCodes.forEach((code) => assertContains(doc, code, `contract code ${code}`));

  assertAll(proof, [
    "var VERSION = '1.2.0-f16.4.d'",
    "var CONFLICT_SCHEMA = 'h2o.desktop.sync.library-conflict-proof.v1'",
    'CONFLICT_REQUIRED_CASE_NAMES',
    'runLibraryConflictProof',
    'H2O.Desktop.Sync.runLibraryConflictProof = runLibraryConflictProof',
    'closure-conflict-proof-complete',
    'conflictProof',
    'catalogConflicts',
    'bindingConflicts',
    'cacheConflicts',
    'bulkConflicts',
    'f5Conflicts',
    'folderIdentityConflicts',
    'conflictSideEffectSummary',
    'runtimeConflictResolverImplemented',
    'sqliteTriggerChanged',
    'storeWriteEnabled',
    'f7Deleted',
    'triggerProtectionGuarded'
  ]);
  conflictCaseNames.forEach((name) => assertContains(proof, name, `proof case ${name}`));
  contractCodes.forEach((code) => assertContains(proof, code, `proof code ${code}`));

  assertAll(proof, [
    'catalog-create-full-pipeline',
    'binding-bind-chat-label-full-pipeline',
    'binding-bind-chat-folder-full-pipeline',
    'bulk-migration-repeat-import-idempotent',
    'folder-absorption-f7-fallback-default-off',
    'folder-absorption-trigger-protection-guarded-optional'
  ]);

  assertAll(syncValidator, [
    "var VERSION = '1.2.0-f16.4.d'",
    'runLibraryConflictProof',
    'validate-f15-library-conflict-contract.mjs'
  ]);
  conflictCaseNames.forEach((name) => assertContains(syncValidator, name, `sync validator case ${name}`));

  assertAll(closureValidator, [
    "var VERSION = '1.2.0-f16.4.d'",
    'runLibraryConflictProof',
    'closure-conflict-proof-complete',
    'validate-f15-library-conflict-contract.mjs'
  ]);
  conflictCaseNames.forEach((name) => assertContains(closureValidator, name, `closure validator case ${name}`));

  assertContains(folderValidator, "var VERSION = '1.2.0-f16.4.d'", 'folder validator proof version');

  const proofText = read(proof);
  const privacyNeedles = [
    'rawName',
    'rawColor',
    'rawId',
    'chatId',
    'chat_id',
    'folderId',
    'folder_id',
    'category_id',
    'chats.category_id',
    'bundlePathNeedle',
    'bundleFileNeedle',
    'titleValue',
    'contentValue',
    'urlValue',
    'tokenValue'
  ];
  for (const needle of privacyNeedles) {
    if (!proofText.includes(needle)) failures.push(`${proof}: missing conflict privacy guardrail ${needle}`);
  }

  const forbiddenSql = [
    'INSERT INTO labels',
    'INSERT INTO tags',
    'INSERT INTO categories',
    'INSERT INTO folder_bindings',
    'UPDATE folder_bindings',
    'DELETE FROM folder_bindings',
    'UPDATE chats SET category_id'
  ];
  for (const sql of forbiddenSql) {
    if (proofText.includes(sql)) failures.push(`${proof}: conflict proof must not include business-table SQL ${sql}`);
  }
}

if (failures.length) {
  console.error('F15 library conflict contract validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 library conflict contract validation passed');
