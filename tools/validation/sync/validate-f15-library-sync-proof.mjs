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
const cutoverValidator = 'tools/validation/sync/validate-f15-cutover.mjs';
const bulkValidator = 'tools/validation/sync/validate-f15-bulk-migration.mjs';
const closureValidator = 'tools/validation/sync/validate-f15-library-closure.mjs';

[
  proof,
  html,
  pack,
  cutoverValidator,
  bulkValidator,
  closureValidator
].forEach(assertExists);

if (failures.length === 0) {
  assertAll(proof, [
    "var VERSION = '0.7.0-f15.11.c'",
    "var CLOSURE_SCHEMA = 'h2o.desktop.sync.library-sync-closure-proof.v1'",
    "var RESULT_SCHEMA = 'h2o.desktop.sync.library-sync-proof.v1'",
    'runLibraryEndToEndSyncProof',
    'runLibraryCatalogPipelineProof',
    'runLibraryBindingPipelineProof',
    'runLibraryStoreCutoverProof',
    'runLibraryBulkMigrationE2EProof',
    'runLibrarySyncClosureProof',
    'H2O.Desktop.Sync.runLibrarySyncClosureProof = runLibrarySyncClosureProof',
    'CLOSURE_CASE_NAMES',
    'closure-catalog-proof-complete',
    'closure-binding-proof-complete',
    'closure-store-cutover-proof-complete',
    'closure-bulk-migration-proof-complete',
    'closure-aggregate-proof-ok',
    'closure-privacy-clean',
    'closure-side-effects-safe',
    'closure-required-apis-present',
    'closure-validators-present',
    'closure-loader-pack-wiring-present',
    'VALIDATOR_REFERENCES',
    'validate-f15-library-closure.mjs',
    // F15.9.d store cutover proof — case names, sub-proof references,
    // and supporting helpers must all appear in the proof module.
    'STORE_CUTOVER_CASE_NAMES',
    'cutover-direct-sql-blocked',
    'cutover-authorized-settlement-write-passes',
    'cutover-identity-clears-after-scope',
    'cutover-debug-emergency-not-silently-enabled',
    'shim-label-create-routes-through-f15',
    'shim-label-remove-pending-review',
    'shim-tag-bind-routes-through-f15',
    'shim-category-assign-routes-chat-category-binding',
    'shim-category-clear-routes-chat-category-unbind',
    'shim-chats-patch-category-reroutes-or-blocks-direct-write',
    'read-api-compatibility-smoke',
    'saveNow-subscribe-settlement-order-smoke',
    'store-cutover-privacy-leak-scan',
    // Sentinel + shim references (proof must consult the Rust-backed
    // sentinel and the cutover shim installer/evidence read-only APIs)
    'installLibraryStoreCutoverShims',
    'waitForLibraryStoreShimSettlement',
    'listLibraryStoreShimEvidence',
    '__f15CutoverAllowedWriterIdentities',
    '__f15CutoverShimmed',
    '__f15ChatCategoryShimmed',
    'runSentinelProofCases',
    'runShimRoutingCases',
    'runReadCompatibilityCase',
    'runSaveSubscribeSmokeCase',
    'runStoreCutoverPrivacyScan',
    'withMockStoreScope',
    'buildMockStore',
    'snapshotEvidence',
    'unauthorizedBeforeBlocked',
    'authorizedWritePassed',
    'unauthorizedAfterClearBlocked',
    'unregisteredConnectionFailedClosed',
    'debugBypassNotSilent',
    'emergencyRepairNotSilent',
    'evidenceDelta',
    'apisShimmed',
    'labelsReadable',
    'tagsReadable',
    'categoriesReadable',
    'chatsReadable',
    'saveNowReachable',
    'subscribeReachable',
    'waitForPendingAvailable',
    // F15.9.e bulk migration E2E proof — case names, sub-proof
    // structure, and supporting helpers must all appear.
    'BULK_MIGRATION_CASE_NAMES',
    'bulk-migration-chunked-mode-runs',
    'bulk-migration-100-plus-bindings',
    'bulk-migration-repeat-import-idempotent',
    'bulk-migration-duplicate-label-binding-skipped',
    'bulk-migration-duplicate-tag-binding-skipped',
    'bulk-migration-partial-failure-reports-partial',
    'bulk-migration-bulk-identity-required',
    'bulk-migration-shim-fallback-disabled-by-default',
    'bulk-migration-phase-order-catalogs-before-bindings',
    'bulk-migration-chat-category-cache-after-chat',
    'bulk-migration-no-raw-leak',
    // Bulk migration helpers + sub-result blocks
    'runBulkMigrationE2ECases',
    'executeLibraryBulkMigration',
    'makeStatefulBulkExecutor',
    'makeFailingBulkExecutor',
    'projectBulkForScan',
    'bulkChunks',
    'bulkItemSummaries',
    'bulkRowsAffected',
    'maxChunkRespected',
    'noShimTimeoutPath',
    'repeatImportSkipped',
    'sameBatchIdentity',
    'duplicateLabelSkipped',
    'duplicateTagSkipped',
    'failedChunkReported',
    'notSilent',
    'bulkIdentityUsed',
    'disabledBlocks',
    'shimFallbackBlocked',
    'catalogsBeforeBindings',
    'chatCategoryAfterChat',
    'bulkMigrationIdentityUsed',
    'injectedExecutorWritesUsed',
    'f15.bulk-migration',
    'H2O.Desktop.Sync.runLibraryEndToEndSyncProof = runLibraryEndToEndSyncProof',
    'H2O.Desktop.Sync.runLibraryCatalogPipelineProof = runLibraryCatalogPipelineProof',
    'H2O.Desktop.Sync.runLibraryBindingPipelineProof = runLibraryBindingPipelineProof',
    'H2O.Desktop.Sync.runLibraryStoreCutoverProof = runLibraryStoreCutoverProof',
    'H2O.Desktop.Sync.runLibraryBulkMigrationE2EProof = runLibraryBulkMigrationE2EProof',
    'H2O.Desktop.Sync.__librarySyncProofInstalled = true',
    'H2O.Desktop.Sync.__librarySyncProofVersion = VERSION',
    'CATALOG_CASE_DEFINITIONS',
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
    'BINDING_CASE_DEFINITIONS',
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
    'binding-duplicate-binding-blocks-proposal',
    'binding-replace-operation-not-supported',
    'binding-privacy-leak-scan',
    'requiresCategoryCacheRefresh',
    'settleLibraryExecuteEnvelope',
    'binding-chat-folder',
    'folder.metadata',
    'chatsCategoryIdCacheRefreshed',
    "categoryCacheAction === 'set'",
    "categoryCacheAction === 'clear'",
    'chats-category-id-refresh-pending',
    'library-sync-proof-binding-f5-footprint-detected',
    'library-binding-replace-operation-not-supported',
    'library-sync-proof-binding-replace-operation-not-blocked',
    'bindingProof',
    'approved-seal',
    'approved-restore',
    'closed-sealed',
    'closed-restored',
    'nativeApplyRequired',
    'library-catalog-execute-tombstone-f5-state-not-post-decision',
    'closeLibraryCatalogTombstoneViaF5',
    '__libraryCatalogF5ClosureInstalled',
    'canonicalizeLibraryCatalog',
    'diagnoseLibraryCatalog',
    'preflightLibraryCatalog',
    'generateLibraryCatalogProposalCandidate',
    'previewLibraryCatalogHandoff',
    'buildLibraryCatalogApplyEventReceipt',
    'recordLibraryCatalogBookkeeping',
    'shapeLibraryCatalogExecuteEnvelope',
    'closeLibraryCatalogTombstoneViaF5',
    'canonicalizeLibraryBinding',
    'diagnoseLibraryBinding',
    'preflightLibraryBinding',
    'generateLibraryBindingProposalCandidate',
    'previewLibraryBindingHandoff',
    'buildLibraryBindingApplyEventReceipt',
    'recordLibraryBindingBookkeeping',
    'shapeLibraryBindingExecuteEnvelope',
    'proveSQLiteWriterIdentitySentinel',
    'executeAuthorizedSqlite',
    'installLibraryStoreCutoverShims',
    'waitForLibraryStoreShimSettlement',
    'listLibraryStoreShimEvidence',
    'planLibraryBulkMigration',
    'executeLibraryBulkMigration',
    'runLibraryBulkMigrationProof',
    'catalogDeviceLocalInput',
    'bindingDeviceLocalInput',
    'buildBindingEndpoints',
    'runBindingProofCase',
    'bindingPrivacyNeedles',
    'bindingF5Footprint',
    'withMemoryChromeStorage',
    'privacyScan',
    'sideEffectSummary',
    'publicationTouched: false',
    'relayTouched: false',
    'outboxTouched: false',
    'nativeCalled: false',
    'f5Touched: false',
    'applyExecuted: false',
    'watermarkWritten: false',
    'consumedOperationWritten: false',
    'realBusinessTableWritten: false'
  ]);

  assertContains(html, 'sync/library/library-sync-proof.tauri.js');
  assertContains(pack, 'sync/library/library-sync-proof.tauri.js');

  const proofText = read(proof);
  for (const forbidden of [
    'rawName:',
    'color:',
    'rawColor:',
    'displayName:',
    'labelId:',
    'tagId:',
    'categoryId:',
    'folderId:',
    'chatId:',
    'chat_id:',
    'category_id:',
    'accountId:',
    'rawAccountId:',
    'userId:',
    'rawUserId:',
    'chatTitle:',
    'rawTitle:',
    'rawPayload:',
    'bindingPayload:',
    'rawLeftId:',
    'rawRightId:',
    'leftRawId:',
    'rightRawId:',
    'endpointRawId:',
    'content:',
    'body:',
    'messages:',
    'turns:',
    'attachments:',
    'files:',
    'filename:',
    'fileName:',
    'path:',
    'url:',
    'token:',
    'tokens:',
    // F15.9.e bulk-migration-specific raw-field needles. The bulk
    // migration bundle carries filenames / paths / titles that must
    // never be echoed into the proof output.
    'bundlePath:',
    'bundleFile:',
    'bundleFilename:',
    'bundleFileName:',
    'bundleName:',
    'bundleTitle:',
    'importPath:',
    'importFilename:',
    'importFileName:',
    'sourcePath:'
  ]) {
    if (proofText.includes(forbidden)) {
      failures.push(`${proof}: forbidden returned-field literal ${forbidden}`);
    }
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
      failures.push(`${proof}: proof foundation must not include business-table SQL ${forbiddenSql}`);
    }
  }
}

if (failures.length) {
  console.error('F15 library sync proof validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 library sync proof validation passed');
