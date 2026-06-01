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

const lib = 'apps/studio/desktop/src-tauri/src/lib.rs';
const rustSentinel = 'apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs';
const jsSentinel = 'src-surfaces-base/studio/sync/sqlite-writer-identity-sentinel.tauri.js';
const shim = 'src-surfaces-base/studio/sync/library/library-store-cutover-shims.tauri.js';
const html = 'src-surfaces-base/studio/studio.html';
const pack = 'tools/product/studio/pack-studio.mjs';
const settlement = 'src-surfaces-base/studio/sync/execute/execute-settlement-writer-library-extension.tauri.js';
const cache = 'src-surfaces-base/studio/sync/execute/library-category-cache-refresh.tauri.js';

assertAll(lib, [
  'version: 12',
  'protect legacy library store writes',
  'f15_protect_labels_insert',
  'f15_protect_labels_update',
  'f15_protect_labels_delete',
  'f15_protect_tags_insert',
  'f15_protect_tags_update',
  'f15_protect_tags_delete',
  'f15_protect_categories_insert',
  'f15_protect_categories_update',
  'f15_protect_categories_delete',
  'f15_protect_label_bindings_insert',
  'f15_protect_label_bindings_update',
  'f15_protect_label_bindings_delete',
  'f15_protect_tag_bindings_insert',
  'f15_protect_tag_bindings_update',
  'f15_protect_tag_bindings_delete',
  'f15_protect_chats_category_id_update',
  'f15_protect_chats_category_id_insert',
  'f15-store-write-protected:labels',
  'f15-store-write-protected:tags',
  'f15-store-write-protected:categories',
  'f15-store-write-protected:label_bindings',
  'f15-store-write-protected:tag_bindings',
  'f15-store-write-protected:chats.category_id',
  'sqlite_writer_identity::f15_authorized_sqlite_execute',
  'sqlite_writer_identity::f15_prove_sqlite_writer_identity_sentinel'
]);

assertAll(rustSentinel, [
  'sqlite3_create_function_v2',
  'h2o_writer_identity',
  'f15.execute-settlement-writer',
  'f15.bulk-migration',
  'f15.debug-bypass',
  'f15.emergency-repair',
  'I_UNDERSTAND_F15_DEBUG_BYPASS',
  'I_UNDERSTAND_F15_EMERGENCY_REPAIR',
  'f15_authorized_sqlite_execute',
  'f15_prove_sqlite_writer_identity_sentinel'
]);

assertAll(jsSentinel, [
  'executeAuthorizedSqlite',
  'executeSettlementSqlite',
  'withSQLiteWriterIdentity',
  'proveSQLiteWriterIdentitySentinel',
  '__f15CutoverInstalled',
  '__f15CutoverVersion'
]);

assertAll(shim, [
  'f15-store-shim-evidence',
  'wrapCatalog',
  'wrapBindingStore',
  'wrapCategories',
  'wrapChats',
  'bindChat',
  'unbindChat',
  'replaceForChat',
  'assignChat',
  'clearChat',
  'pending-review',
  'executeSettlementSqlite',
  'scanDomainForbiddenFields',
  'storeShimRouted: true',
  'sqliteSentinelUsed: true'
]);

assertAll(cache, [
  'withSQLiteWriterIdentity',
  'sqliteSentinelUsed: authorized && authorized.sqliteSentinelUsed === true'
]);

assertAll(settlement, [
  'withSQLiteWriterIdentity',
  'sqliteSentinelUsed: true'
]);

[html, pack].forEach((file) => {
  assertAll(file, [
    'sqlite-writer-identity-sentinel.tauri.js',
    'library-store-cutover-shims.tauri.js'
  ]);
});

const shimText = read(shim);
for (const forbidden of [
  'rawName:',
  'rawId:',
  'rawAccountId:',
  'chatTitle:',
  'content:',
  'messages:'
]) {
  if (shimText.includes(forbidden)) failures.push(`${shim}: forbidden evidence field literal ${forbidden}`);
}

if (failures.length) {
  console.error('F15 cutover validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('F15 cutover validation passed');
