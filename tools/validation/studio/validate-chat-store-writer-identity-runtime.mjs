#!/usr/bin/env node
// Focused validator for the C4.4 runtime blocker where stale
// chats.category_id triggers can call h2o_writer_identity() for ordinary chat
// inserts on plugin-sql connections.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = process.cwd();
const LIB_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const lib = fs.readFileSync(path.join(REPO_ROOT, LIB_REL), 'utf8');
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

function indexOf(needle) {
  return lib.indexOf(needle);
}

function sectionBetween(startNeedle, endNeedle) {
  const start = indexOf(startNeedle);
  if (start < 0) return '';
  const end = endNeedle ? lib.indexOf(endNeedle, start + startNeedle.length) : -1;
  return lib.slice(start, end > start ? end : undefined);
}

console.log('── Studio chat store writer identity runtime validator ─');

const v14 = indexOf('version: 14');
const v15 = indexOf('version: 15');
check('migration v15 exists after v14', v14 >= 0 && v15 > v14, 'expected monotonic v15 after saved-chat asset registry v14');

const v15Block = sectionBetween('version: 15', 'async fn f5g4_setup_proof_schema');
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

if (failures.length) {
  console.error(`\nFAIL ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nPASS 7');
