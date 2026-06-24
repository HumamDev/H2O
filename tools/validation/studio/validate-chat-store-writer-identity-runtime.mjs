#!/usr/bin/env node
// Focused validator for the C4.4 runtime blocker where chats.category_id
// triggers reference h2o_writer_identity() on normal plugin-sql connections.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = process.cwd();
const LIB_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const WRITER_REL = 'apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs';
const CHATS_REL = 'src-surfaces-base/studio/store/chats.tauri.js';
const lib = fs.readFileSync(path.join(REPO_ROOT, LIB_REL), 'utf8');
const writer = fs.readFileSync(path.join(REPO_ROOT, WRITER_REL), 'utf8');
const chats = fs.readFileSync(path.join(REPO_ROOT, CHATS_REL), 'utf8');
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(detail || label);
    console.log(`  ✗ ${label}`);
    if (detail) console.log(`      ${detail}`);
  }
}

function indexOf(text, needle) {
  return text.indexOf(needle);
}

function sectionBetween(text, startNeedle, endNeedle) {
  const start = indexOf(text, startNeedle);
  if (start < 0) return '';
  const end = endNeedle ? text.indexOf(endNeedle, start + startNeedle.length) : -1;
  return text.slice(start, end > start ? end : undefined);
}

console.log('── Studio chat store writer identity runtime validator ─');

const v14 = indexOf(lib, 'version: 14');
const v15 = indexOf(lib, 'version: 15');
const v16 = indexOf(lib, 'version: 16');
check('migration v15 exists after v14', v14 >= 0 && v15 > v14, 'expected monotonic v15 after saved-chat asset registry v14');
check('migration v16 exists after v15', v15 >= 0 && v16 > v15, 'expected monotonic v16 after trigger-scope repair v15');

const v15Block = sectionBetween(lib, 'version: 15', 'version: 16');
check('v15 describes the runtime trigger repair', v15Block.includes('repair chats category writer identity triggers'), 'missing v15 repair description');
check('v15 drops stale chats.category_id triggers before recreate',
  v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_chats_category_id_update;') &&
  v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_chats_category_id_insert;'),
  'stale triggers must be replaced, not left behind by CREATE TRIGGER IF NOT EXISTS');
check('v15 recreates update trigger with category change WHEN clause',
  /CREATE TRIGGER f15_protect_chats_category_id_update[\s\S]*?BEFORE UPDATE OF category_id ON chats[\s\S]*?WHEN COALESCE\(OLD\.category_id, ''\) != COALESCE\(NEW\.category_id, ''\)/.test(v15Block),
  'update trigger must call h2o_writer_identity only when category_id changes');
check('v15 recreates insert trigger with non-empty category WHEN clause',
  /CREATE TRIGGER f15_protect_chats_category_id_insert[\s\S]*?BEFORE INSERT ON chats[\s\S]*?WHEN NEW\.category_id IS NOT NULL AND NEW\.category_id != ''/.test(v15Block),
  'insert trigger must not call h2o_writer_identity for ordinary chat inserts');
check('v15 keeps authorized writer identities intact',
  [
    "'f15.execute-settlement-writer'",
    "'f15.bulk-migration'",
    "'f15.debug-bypass'",
    "'f15.emergency-repair'",
    "RAISE(ABORT, 'f15-store-write-protected:chats.category_id')",
  ].every((needle) => v15Block.includes(needle)),
  'category writes must still fail closed without an allowed writer identity');
check('v15 does not repair unrelated protected catalog triggers',
  !v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_labels_') &&
  !v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_tags_') &&
  !v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_categories_') &&
  !v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_label_bindings_') &&
  !v15Block.includes('DROP TRIGGER IF EXISTS f15_protect_tag_bindings_'),
  'repair must stay scoped to chats.category_id triggers');

const v16Block = sectionBetween(lib, 'v16', 'async fn f5g4_setup_proof_schema');
check('v16 documents SQLite trigger function-resolution repair',
  v16Block.includes('SQLite resolves trigger') &&
  v16Block.includes('empty process-wide h2o_writer_identity() auto-extension'),
  'v16 must explain why WHEN clauses alone were insufficient');
check('v16 drops and recreates chats.category_id triggers',
  v16Block.includes('DROP TRIGGER IF EXISTS f15_protect_chats_category_id_update;') &&
  v16Block.includes('DROP TRIGGER IF EXISTS f15_protect_chats_category_id_insert;') &&
  v16Block.includes('CREATE TRIGGER f15_protect_chats_category_id_update') &&
  v16Block.includes('CREATE TRIGGER f15_protect_chats_category_id_insert'),
  'v16 must repair existing DB trigger definitions');
check('v16 insert trigger is scoped to real category_id values',
  /CREATE TRIGGER f15_protect_chats_category_id_insert[\s\S]*?BEFORE INSERT ON chats[\s\S]*?WHEN NEW\.category_id IS NOT NULL AND NEW\.category_id != ''/.test(v16Block),
  'normal chat inserts without category_id must not enter protected category assignment semantics');
check('v16 update trigger is scoped to real category_id changes',
  /CREATE TRIGGER f15_protect_chats_category_id_update[\s\S]*?BEFORE UPDATE OF category_id ON chats[\s\S]*?WHEN COALESCE\(OLD\.category_id, ''\) != COALESCE\(NEW\.category_id, ''\)/.test(v16Block),
  'updates that do not change category_id must not enter protected category assignment semantics');
check('v16 keeps category_id writes protected by allowed identities',
  [
    'h2o_writer_identity()',
    "'f15.execute-settlement-writer'",
    "'f15.bulk-migration'",
    "'f15.debug-bypass'",
    "'f15.emergency-repair'",
    "RAISE(ABORT, 'f15-store-write-protected:chats.category_id')",
  ].every((needle) => v16Block.includes(needle)),
  'real category_id set/change must remain writer-identity protected');

const runBlock = sectionBetween(lib, 'pub fn run()', 'tauri::Builder::default()');
check('runtime installs writer identity auto-extension before SQL plugin setup',
  runBlock.includes('sqlite_writer_identity::install_writer_identity_auto_extension()'),
  'plugin-sql connections must see default h2o_writer_identity() before migrations and writes');
check('writer identity module registers a SQLite auto-extension',
  writer.includes('sqlite3_auto_extension') &&
  writer.includes('writer_identity_auto_extension') &&
  writer.includes('register_writer_identity_function_on_raw(db, "")'),
  'new SQLite connections must get an empty h2o_writer_identity() by default');
check('authorized writer path still overrides connection identity',
  writer.includes('install_writer_identity_function') &&
  writer.includes('register_writer_identity_function_on_raw(handle.as_raw_handle().as_ptr(), identity)'),
  'authorized paths must still install non-empty scoped identity on their acquired connection');

const chatInsertBlock = sectionBetween(chats, "var cols = ['id'];", "return sqlExecute");
check('chat adapter does not default category_id on ordinary inserts',
  chatInsertBlock.includes("var vals = [chatId];") &&
  chatInsertBlock.includes('Object.keys(pc.columns).forEach(function (col)') &&
  !chatInsertBlock.includes('category_id'),
  'store.chats.upsert without categoryId must not synthesize a category_id value');
check('chats table category_id has nullable no-default shape',
  /CREATE TABLE chats[\s\S]*?category_id\s+TEXT,/.test(lib),
  'schema should not default category_id to a non-empty value');

if (failures.length) {
  console.error(`\nFAIL ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nPASS 18');
