#!/usr/bin/env node
// K.4.1 - Saved-chat archive RELINK validator (static).
//
// This slice locks the K.4 relink contract and the recovery-validator allowance
// for a future dedicated relink module. It intentionally proves relink is still
// not implemented here.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const K4_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k4-relink-contract.md';
const K41_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k4-1-relink-validator.md';
const RECOVERY_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-recovery-import-export-v1.mjs';
const RESTORE_VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-restore-relink-v1.mjs';
const RESTORE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js';
const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js';
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const INSPECTOR_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-inspector.studio.js';
const EXPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-exporter.studio.js';
const HEALTH_UI_REL = 'src-surfaces-base/studio/ingestion/archive-health-ui.studio.js';
const STUDIO_DIR_REL = 'src-surfaces-base/studio';

const RELINK_NAMES = ['H2O.Studio.archiveRelink', 'dryRunRelinkPackage', 'relinkVerifiedPackage'];
const TOMBSTONE_OVERRIDE_NAMES = [
  'clearTombstone',
  'deleteTombstone',
  'supersedeTombstone',
  'UPDATE sync_tombstones',
  'DELETE FROM sync_tombstones',
];

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try {
    fn();
    PASS.push(label);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const m = e && e.message ? e.message : String(e);
    FAIL.push({ label, m });
    console.log(`  ✗ ${label}`);
    console.log(`      ${m}`);
  }
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walkJs(absDir) {
  const out = [];
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const k4 = exists(K4_CONTRACT_REL) ? readRepo(K4_CONTRACT_REL) : '';
const k41 = exists(K41_EVIDENCE_REL) ? readRepo(K41_EVIDENCE_REL) : '';
const recoveryValidator = exists(RECOVERY_VALIDATOR_REL) ? readRepo(RECOVERY_VALIDATOR_REL) : '';
const restoreValidator = exists(RESTORE_VALIDATOR_REL) ? readRepo(RESTORE_VALIDATOR_REL) : '';
const restoreCode = exists(RESTORE_REL) ? stripComments(readRepo(RESTORE_REL)) : '';
const healthUiCode = exists(HEALTH_UI_REL) ? stripComments(readRepo(HEALTH_UI_REL)) : '';

console.log('[archive-relink] K.4.1 static relink contract checks');

check('[K.4] relink contract exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(K4_CONTRACT_REL), 'missing K.4 contract evidence');
  assert.match(k4, /PHASE K\.4 CONTRACT[\s\S]*RELINK[\s\S]*NOT IMPLEMENTED/);
});

check('[K.4] contract defines the core relink operation', () => {
  for (const phrase of [
    'inserts a fresh recovered snapshot under the target chatId',
    'updates the target chat’s current snapshot pointer/metadata',
    'Relink must be additive in data',
    'target chat',
  ]) {
    assert.ok(k4.includes(phrase), 'missing relink operation phrase: ' + phrase);
  }
});

check('[K.4] contract locks typed confirmation and undo provenance', () => {
  assert.match(k4, /typed confirmation required/i);
  for (const field of [
    'previousSnapshotId',
    'previousCurrentLeafId',
    'previousLastCapturedAt',
    'newSnapshotId',
    'contentHash',
    'relinkedAt',
    'mode: `relink`',
  ]) {
    assert.ok(k4.includes(field), 'missing provenance field: ' + field);
  }
});

check('[K.4] contract defers tombstone override / undelete to K.5', () => {
  assert.match(k4, /Tombstone override is deferred to K\.5|Deferred to K\.5/);
  assert.ok(k4.includes('un-delete'), 'un-delete must be deferred');
  assert.ok(k4.includes('clear/supersede `sync_tombstones`'), 'sync_tombstones override must be deferred');
});

check('[K.4] contract forbids overwrite, re-parenting, original snapshot id reuse, and forbidden authorities', () => {
  for (const phrase of [
    'overwrite: never allowed',
    'snapshot re-parenting',
    'package original snapshotId as the new snapshot id',
    '`libraryIndex`',
    '`sync_tombstones`',
    '`saved_chat_archive_requests`',
    'no Chrome package authority',
  ]) {
    assert.ok(k4.includes(phrase), 'missing forbidden boundary: ' + phrase);
  }
  assert.match(k4, /no tombstone clear\/delete\/supersede/i);
});

check('[K.4] contract defines allowed and forbidden target chat update fields', () => {
  for (const allowed of ['last_snapshot_id', 'current_leaf_id', 'last_captured_at', 'snapshot_count', 'updated_at', 'meta_json']) {
    assert.ok(k4.includes(allowed), 'missing allowed update field: ' + allowed);
  }
  for (const forbidden of ['is_saved', 'is_linked', 'link_source_href', 'href', 'normalized_href', 'folder/category/label bindings']) {
    assert.ok(k4.includes(forbidden), 'missing forbidden update field: ' + forbidden);
  }
});

check('[K.4.1] runtime relink is not implemented in this slice', () => {
  assert.ok(!exists(RELINK_REL), 'production relink module must not exist in K.4.1');
  assert.ok(!healthUiCode.includes('archiveRelink'), 'Relink UI card must not be mounted');
  assert.ok(!healthUiCode.includes('mountArchiveRelinkCard'), 'Relink UI mount must not exist');
  for (const abs of walkJs(path.join(REPO_ROOT, STUDIO_DIR_REL))) {
    const rel = path.relative(REPO_ROOT, abs);
    const code = stripComments(fs.readFileSync(abs, 'utf8'));
    for (const name of RELINK_NAMES) {
      assert.ok(!code.includes(name), 'unexpected relink runtime marker in ' + rel + ': ' + name);
    }
  }
});

check('[K.4.1] future relink module invariants are locked by contract', () => {
  for (const phrase of [
    'module: `src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js`',
    'namespace: `H2O.Studio.archiveRelink`',
    '`dryRunRelinkPackage({ packagePath, targetChatId })`',
    '`relinkVerifiedPackage({ packagePath, targetChatId, confirm })`',
    '`archiveRestore` remains insert-only',
    'inspects/verifies package',
    'reuse `archiveImporter.buildTurnsFromPackageSnapshot`',
    'typed confirmation required',
    'inserts a fresh recovered snapshot',
    'no relink to an existing snapshot id',
    'no pure mode that only repoints to an existing snapshot',
  ]) {
    assert.ok(k4.includes(phrase), 'missing future invariant: ' + phrase);
  }
});

check('[K.4.1] recovery validator pre-authorizes relink names only inside the future relink module', () => {
  assert.ok(recoveryValidator.includes("const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js'"), 'missing RELINK_REL');
  assert.ok(recoveryValidator.includes('RELINK_ENTRY_NAMES'), 'missing RELINK_ENTRY_NAMES');
  assert.ok(recoveryValidator.includes('rel !== RELINK_REL'), 'relink names must be forbidden outside RELINK_REL');
  for (const name of RELINK_NAMES) {
    assert.ok(recoveryValidator.includes(name), 'recovery validator missing relink name allowance: ' + name);
  }
  assert.ok(recoveryValidator.includes('RESTORE_REL'), 'restore allowance must remain');
});

check('[K.4.1] tombstone override remains forbidden in archive restore/relink scope', () => {
  for (const rel of [RESTORE_REL, RELINK_REL, IMPORTER_REL, INSPECTOR_REL, EXPORTER_REL, HEALTH_UI_REL]) {
    if (!exists(rel)) continue;
    const code = stripComments(readRepo(rel));
    for (const banned of TOMBSTONE_OVERRIDE_NAMES) {
      assert.ok(!code.includes(banned), 'archive relink/import/restore scope must not override tombstones: ' + banned + ' in ' + rel);
    }
  }
});

check('[INVARIANT] restore validator remains focused on insert-only restore and still forbids relink runtime', () => {
  assert.ok(restoreValidator.includes('writes are insert-only'), 'restore validator must preserve insert-only check');
  assert.ok(restoreValidator.includes('relink runtime remains absent'), 'restore validator must still prove relink absent');
  assert.ok(restoreValidator.includes('tombstone override/un-delete stays absent'), 'restore validator must keep tombstone override deferred');
});

check('[INVARIANT] archiveRestore implementation remains insert-only and has no relink/pointer update behavior', () => {
  assert.ok(restoreCode.includes('INSERT INTO chats'), 'restore must still insert chats');
  assert.ok(restoreCode.includes('INSERT INTO snapshots'), 'restore must still insert snapshots');
  assert.ok(restoreCode.includes('INSERT INTO snapshot_turns'), 'restore must still insert turns');
  assert.ok(!/UPDATE\s+chats|UPDATE\s+snapshots|UPDATE\s+snapshot_turns/i.test(restoreCode), 'restore must not UPDATE existing state');
  for (const name of RELINK_NAMES) {
    assert.ok(!restoreCode.includes(name), 'restore module must not expose relink name: ' + name);
  }
});

check('[K.4.1] evidence note records validator flip and implementation deferral', () => {
  assert.ok(exists(K41_EVIDENCE_REL), 'missing K.4.1 evidence note');
  assert.match(k41, /PHASE K\.4\.1[\s\S]*RELINK VALIDATOR[\s\S]*NOT IMPLEMENTED/);
  for (const phrase of [
    'relink still not implemented',
    'recovery-validator flip',
    'tombstone override still deferred',
    'restore remains insert-only',
    'no runtime/capability/Chrome changes',
  ]) {
    assert.ok(k41.includes(phrase), 'evidence missing: ' + phrase);
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-relink] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-relink] PASS ${PASS.length} checks`);
}
