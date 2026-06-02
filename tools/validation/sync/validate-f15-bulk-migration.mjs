#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const failures = [];

function assertContains(file, needle, label = needle) {
  const text = read(file);
  if (!text.includes(needle)) failures.push(`${file}: missing ${label}`);
}

function assertAll(file, needles) {
  needles.forEach((needle) => assertContains(file, needle));
}

const bulk = 'src-surfaces-base/studio/sync/library/library-bulk-migration.tauri.js';
const importer = 'src-surfaces-base/studio/ingestion/import-bundle.tauri.js';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const sentinel = 'src-surfaces-base/studio/sync/sqlite-writer-identity-sentinel.tauri.js';

assertAll(bulk, [
  "var VERSION = '0.1.0-f15.8.g'",
  "var RESULT_SCHEMA = 'h2o.desktop.sync.library-bulk-migration.v1'",
  "var SOURCE_TAG = 'bundle-import'",
  "var BULK_IDENTITY = 'f15.bulk-migration'",
  "var DEFAULT_CHUNK_SIZE = 100",
  'planLibraryBulkMigration',
  'executeLibraryBulkMigration',
  'runLibraryBulkMigrationProof',
  'bulkMigrationEnabled: true',
  'identity: BULK_IDENTITY',
  'scanDomainForbiddenFields',
  'INSERT OR IGNORE INTO labels',
  'INSERT OR IGNORE INTO tags',
  'INSERT OR IGNORE INTO categories',
  'INSERT OR IGNORE INTO label_bindings',
  'INSERT OR IGNORE INTO tag_bindings',
  'UPDATE chats SET category_id = ?',
  'sideEffectSummary',
  'bulkMigrationIdentityUsed',
  '__libraryBulkMigrationInstalled',
  '__libraryBulkMigrationVersion'
]);

assertAll(importer, [
  'wantsLibraryBulkMigration',
  'allowsLibraryShimFallback',
  'libraryBulkApi',
  'importLibraryCatalogsBulk',
  'importLibraryBindingsBulk',
  'delete patch.categoryId',
  'library bulk migration unavailable; shim fallback disabled',
  'phase: \'catalogs\'',
  'phase: \'bindings\'',
  'maxLibraryBulkChunkSize',
  'libraryBulkMigration'
]);

assertAll(sentinel, [
  "var BULK_MIGRATION_IDENTITY = 'f15.bulk-migration'",
  'bulkMigrationEnabled: args.bulkMigrationEnabled === true'
]);

[html, pack].forEach((file) => {
  assertContains(file, 'sync/library/library-bulk-migration.tauri.js');
});

const bulkText = read(bulk);
for (const forbidden of [
  'rawName:',
  'rawId:',
  'rawAccountId:',
  'chatTitle:',
  'content:',
  'messages:',
  'attachments:',
  'filename:',
  'path:',
  'token:'
]) {
  if (bulkText.includes(forbidden)) failures.push(`${bulk}: forbidden returned-field literal ${forbidden}`);
}

if (bulkText.includes('executeSettlementSqlite')) {
  failures.push(`${bulk}: bulk migration must not use settlement identity facade`);
}

if (failures.length) {
  console.error('F15 bulk migration validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 bulk migration validation passed');
