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

function assertOrder(file, before, after) {
  const text = read(file);
  const a = text.indexOf(before);
  const b = text.indexOf(after);
  if (a === -1) failures.push(`${file}: missing order source ${before}`);
  if (b === -1) failures.push(`${file}: missing order target ${after}`);
  if (a !== -1 && b !== -1 && a >= b) failures.push(`${file}: ${before} must appear before ${after}`);
}

const ui = 'src-surfaces-base/studio/sync/library/library-sync-operator-ui.tauri.js';
const proof = 'src-surfaces-base/studio/sync/library/library-sync-proof.tauri.js';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const studio = 'src-surfaces-base/studio/studio.js';

[
  ui,
  proof,
  html,
  pack,
  studio
].forEach(assertExists);

if (failures.length === 0) {
  [
    "var VERSION = '0.3.0-f15.10.c'",
    'openLibrarySyncOperatorPanel',
    'refreshLibrarySyncOperatorPanel',
    'copyLibrarySyncProofReport',
    'H2O.Desktop.Sync.openLibrarySyncOperatorPanel = openLibrarySyncOperatorPanel',
    'H2O.Desktop.Sync.refreshLibrarySyncOperatorPanel = refreshLibrarySyncOperatorPanel',
    'H2O.Desktop.Sync.copyLibrarySyncProofReport = copyLibrarySyncProofReport',
    'H2O.Desktop.Sync.__librarySyncOperatorUiInstalled = true',
    'H2O.Desktop.Sync.__librarySyncOperatorUiVersion = VERSION',
    'runLibrarySyncClosureProof',
    'runLibraryEndToEndSyncProof',
    'Not run this session',
    'Run Closure Proof',
    'Run End-to-End Proof',
    'Copy Report',
    'Refresh',
    'publicationTouched',
    'relayTouched',
    'outboxTouched',
    'nativeCalled',
    'f5Touched',
    'applyExecuted',
    'watermarkWritten',
    'consumedOperationWritten',
    'RAW_FIELD_KEYS',
    'RAW_LEAK_PATTERNS',
    'sanitizeForReport',
    'shortHash',
    'safeReportKey',
    'forbiddenButtonLabelCheck'
  ].forEach((needle) => assertContains(ui, needle));

  [
    'CATALOG_LANE_CASES',
    'BINDING_LANE_CASES',
    'F5_TOMBSTONE_CASES',
    'BULK_MIGRATION_CASES',
    'STORE_CUTOVER_CASES',
    'CACHE_REFRESH_CASES',
    'renderLaneDetails',
    'renderLaneCaseRow',
    'renderProofCaseRows',
    'renderProofCaseRow',
    'findLaneCase',
    'findProofCase',
    'laneCaseStatus',
    'Catalog Lane Details',
    'Binding Lane Details',
    'F5 Catalog Tombstones',
    'Bulk Migration',
    'Store Cutover',
    'Cache Refresh',
    'renderF5TombstoneStatus',
    'renderBulkMigrationStatus',
    'renderStoreCutoverStatus',
    'renderCacheRefreshStatus',
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
    'binding-chat-category-cache-refresh-metadata',
    'binding-no-f5-footprint',
    'binding-replace-operation-not-supported',
    'binding-privacy-leak-scan',
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
    'nativeApplyRequired',
    'chunkedMode',
    'readCompatibility',
    'saveSubscribe',
    'chatCategorySet',
    'chatCategoryClear'
  ].forEach((needle) => assertContains(ui, needle));

  [
    '"library-sync": { label: "Library Sync", hash: "#/settings/convergence/library-sync" }',
    '"h2o-library-sync-operator-panel"',
    'openLibrarySyncOperatorPanel?.({ settingsHosted: true })',
    'panelId: "h2o-library-sync-operator-panel"'
  ].forEach((needle) => assertContains(studio, needle));

  assertContains(html, 'sync/library/library-sync-operator-ui.tauri.js');
  assertContains(pack, 'sync/library/library-sync-operator-ui.tauri.js');
  assertOrder(html, 'sync/library/library-sync-proof.tauri.js', 'sync/library/library-sync-operator-ui.tauri.js');
  assertOrder(pack, 'sync/library/library-sync-proof.tauri.js', 'sync/library/library-sync-operator-ui.tauri.js');

  const uiText = read(ui);
  const buttonLabels = [...uiText.matchAll(/<button[^>]*>([^<]+)<\/button>/g)]
    .map((match) => match[1].trim().toLowerCase());
  const forbiddenButtonLabels = [
    'apply',
    'execute now',
    'publish',
    'dispatch',
    'native action',
    'f5 action',
    'direct sql',
    'approve seal',
    'approve restore',
    'close review',
    'repair',
    'bypass',
    'migrate now',
    'import now',
    'cache edit',
    'cache repair',
    'create',
    'rename',
    'recolor',
    'bind',
    'unbind'
  ];
  for (const label of buttonLabels) {
    if (forbiddenButtonLabels.includes(label)) {
      failures.push(`${ui}: forbidden action button label ${label}`);
    }
  }

  const guardrails = [
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
    'accountId',
    'rawAccountId',
    'userId',
    'rawUserId',
    'path',
    'url',
    'fileName',
    'filename',
    'bundlePath',
    'bundleFilename',
    'content',
    'messages',
    'attachments',
    'token'
  ];
  for (const needle of guardrails) {
    if (!uiText.includes(needle)) failures.push(`${ui}: missing raw-field guardrail ${needle}`);
  }

  const forbiddenApiCalls = [
    'executeAuthorizedSqlite(',
    'installLibraryStoreCutoverShims(',
    'executeLibraryBulkMigration(',
    'shapeLibraryCatalogExecuteEnvelope(',
    'shapeLibraryBindingExecuteEnvelope(',
    'closeLibraryCatalogTombstoneViaF5(',
    'recordF5ReviewDecision(',
    'closeF5Review(',
    'ingestF5Review('
  ];
  for (const needle of forbiddenApiCalls) {
    if (uiText.includes(needle)) failures.push(`${ui}: UI must not call or label forbidden behavior ${needle}`);
  }
}

if (failures.length) {
  console.error('F15 library sync UI validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 library sync UI validation passed');
