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

const proof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const syncValidator = 'tools/validation/sync/validate-f15-library-sync-proof.mjs';
const cutoverValidator = 'tools/validation/sync/validate-f15-cutover.mjs';
const bulkValidator = 'tools/validation/sync/validate-f15-bulk-migration.mjs';
const repoScanValidator = 'tools/validation/cross-platform/run-cross-platform-repo-scan.mjs';
const envelopeValidator = 'tools/validation/cross-platform/validate-cross-platform-envelope.mjs';
const f7Validator = 'tools/validation/sync/validate-f7-folder-metadata-hash-parity.mjs';

[
  proof,
  html,
  pack,
  syncValidator,
  cutoverValidator,
  bulkValidator,
  repoScanValidator,
  envelopeValidator,
  f7Validator
].forEach(assertExists);

if (failures.length === 0) {
  assertAll(proof, [
    "var VERSION = '0.7.0-f15.11.f'",
    "var CLOSURE_SCHEMA = 'h2o.desktop.sync.library-sync-closure-proof.v1'",
    'runLibrarySyncClosureProof',
    'H2O.Desktop.Sync.runLibrarySyncClosureProof = runLibrarySyncClosureProof',
    'closure-catalog-proof-complete',
    'closure-binding-proof-complete',
    'closure-folder-absorption-proof-complete',
    'closure-store-cutover-proof-complete',
    'closure-bulk-migration-proof-complete',
    'closure-aggregate-proof-ok',
    'closure-privacy-clean',
    'closure-side-effects-safe',
    'closure-required-apis-present',
    'closure-validators-present',
    'closure-loader-pack-wiring-present',
    'CATALOG_REQUIRED_CASE_NAMES',
    'BINDING_REQUIRED_CASE_NAMES',
    'FOLDER_ABSORPTION_CASE_NAMES',
    'STORE_CUTOVER_CASE_NAMES',
    'BULK_MIGRATION_CASE_NAMES',
    'VALIDATOR_REFERENCES',
    'validate-f15-cutover.mjs',
    'validate-f15-bulk-migration.mjs',
    'validate-f15-library-sync-proof.mjs',
    'validate-f15-library-closure.mjs',
    'run-cross-platform-repo-scan.mjs',
    'validate-cross-platform-envelope.mjs',
    'validate-f7-folder-metadata-hash-parity.mjs',
    'apiPresenceResult',
    'sideEffectViolations',
    'proofCaseIds',
    'missingProofCases',
    'loaderPackWiring',
    'realBusinessTableWritten',
    'nativeCalled',
    'f5Touched',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'watermarkWritten',
    'consumedOperationWritten'
  ]);

  assertAll(proof, [
    'catalog-create-full-pipeline',
    'catalog-rename-full-pipeline',
    'catalog-recolor-full-pipeline',
    'catalog-archive-full-pipeline',
    'catalog-restore-from-archived-full-pipeline',
    'catalog-tombstone-approve-seal-full-pipeline',
    'catalog-tombstone-approve-restore-full-pipeline',
    'catalog-restore-from-retained-full-pipeline',
    'catalog-tombstone-pending-f5-blocks-execute',
    'catalog-privacy-leak-scan',
    'binding-bind-chat-label-full-pipeline',
    'binding-unbind-chat-label-full-pipeline',
    'binding-bind-chat-tag-full-pipeline',
    'binding-unbind-chat-tag-full-pipeline',
    'binding-bind-chat-category-full-pipeline',
    'binding-unbind-chat-category-full-pipeline',
    'binding-bind-tag-category-full-pipeline',
    'binding-unbind-tag-category-full-pipeline',
    'binding-bind-chat-folder-full-pipeline',
    'binding-unbind-chat-folder-full-pipeline',
    'binding-chat-category-cache-refresh-metadata',
    'binding-chat-folder-no-cache-refresh',
    'binding-chat-folder-no-f5-footprint',
    'binding-chat-folder-endpoint-folder-metadata',
    'binding-no-f5-footprint',
    'binding-replace-operation-not-supported',
    'binding-privacy-leak-scan',
    'folder-absorption-f7-fallback-default-off',
    'folder-absorption-f7-bind-legacy-path',
    'folder-absorption-f7-unbind-legacy-path',
    'folder-absorption-delegated-bind-chat-folder',
    'folder-absorption-delegated-unbind-chat-folder',
    'folder-absorption-delegation-no-silent-fallback',
    'folder-absorption-explicit-fallback-allowed',
    'folder-absorption-rebind-decomposes',
    'folder-absorption-shadow-event-deterministic',
    'folder-absorption-shadow-event-privacy-clean',
    'folder-absorption-chat-folder-bind-pipeline',
    'folder-absorption-chat-folder-unbind-pipeline',
    'folder-absorption-no-f5-footprint',
    'folder-absorption-no-category-cache-footprint',
    'folder-absorption-trigger-protection-deferred',
    'folder-absorption-f7-parity-still-green',
    'runLibraryFolderBindingAbsorptionProof',
    'folderAbsorption',
    'triggerProtectionDeferred',
    'proofSafeMockedWritesUsed',
    'cutover-direct-sql-blocked',
    'cutover-authorized-settlement-write-passes',
    'cutover-identity-clears-after-scope',
    'shim-label-create-routes-through-f15',
    'shim-category-assign-routes-chat-category-binding',
    'read-api-compatibility-smoke',
    'saveNow-subscribe-settlement-order-smoke',
    'store-cutover-privacy-leak-scan',
    'bulk-migration-chunked-mode-runs',
    'bulk-migration-100-plus-bindings',
    'bulk-migration-repeat-import-idempotent',
    'bulk-migration-partial-failure-reports-partial',
    'bulk-migration-bulk-identity-required',
    'bulk-migration-phase-order-catalogs-before-bindings',
    'bulk-migration-no-raw-leak'
  ]);

  assertAll(proof, [
    'canonicalizeLibraryCatalog',
    'canonicalizeLibraryBinding',
    'generateLibraryCatalogProposalCandidate',
    'generateLibraryBindingProposalCandidate',
    'shapeLibraryCatalogExecuteEnvelope',
    'shapeLibraryBindingExecuteEnvelope',
    'settleLibraryExecuteEnvelope',
    'proveSQLiteWriterIdentitySentinel',
    'executeAuthorizedSqlite',
    'installLibraryStoreCutoverShims',
    'waitForLibraryStoreShimSettlement',
    'listLibraryStoreShimEvidence',
    'planLibraryBulkMigration',
    'executeLibraryBulkMigration',
    'runLibraryBulkMigrationProof'
  ]);

  assertContains(html, 'sync/library/library-sync-proof.tauri.js');
  assertContains(pack, 'sync/library/library-sync-proof.tauri.js');
  assertContains(syncValidator, "var VERSION = '0.7.0-f15.11.f'", 'sync validator version check');
  assertContains(syncValidator, 'runLibrarySyncClosureProof', 'sync validator closure API check');
  assertContains(syncValidator, 'validate-f15-library-closure.mjs', 'sync validator closure validator reference');

  const proofText = read(proof);
  const requiredPrivacyNeedles = [
    'rawName',
    'rawColor',
    'rawId',
    'labelId',
    'tagId',
    'categoryId',
    'folderId',
    'chatId',
    'chat_id',
    'category_id',
    'chats.category_id',
    'rawPayload',
    'bindingPayload',
    'rawLeftId',
    'rawRightId',
    'rawAccountId',
    'rawUserId',
    'messages',
    'turns',
    'attachments',
    'files',
    'bundlePathNeedle',
    'bundleFileNeedle',
    'urlValue',
    'tokenValue'
  ];
  for (const needle of requiredPrivacyNeedles) {
    if (!proofText.includes(needle)) failures.push(`${proof}: missing privacy guardrail ${needle}`);
  }

  for (const forbiddenSql of [
    'INSERT INTO labels',
    'INSERT INTO tags',
    'INSERT INTO categories',
    'INSERT INTO label_bindings',
    'INSERT INTO tag_bindings',
    'UPDATE chats SET category_id',
    'DELETE FROM labels',
    'DELETE FROM tags',
    'DELETE FROM categories'
  ]) {
    if (proofText.includes(forbiddenSql)) {
      failures.push(`${proof}: closure proof must not include business-table SQL ${forbiddenSql}`);
    }
  }
}

if (failures.length) {
  console.error('F15 library closure validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 library closure validation passed');
