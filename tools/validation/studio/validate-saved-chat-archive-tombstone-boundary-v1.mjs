#!/usr/bin/env node
// K.5.1 - Saved-chat archive tombstone / un-delete boundary validator.
//
// Archive restore/relink may read tombstone/deleted state to fail closed, but
// un-delete belongs to the Sync Architecture / deletion lane. This validator
// locks that archive boundary: no archive undelete runtime, no sync_tombstones
// writes, and no chats.is_deleted live flip.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const K50_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k5-tombstone-undelete-contract.md';
const RESTORE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-restore.studio.js';
const RELINK_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-relink.studio.js';
const HARNESS_REL = 'tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs';
const INGESTION_DIR_REL = 'src-surfaces-base/studio/ingestion';

const ARCHIVE_MODULE_RE = /saved-chat-(archive|package).*\.(studio|tauri|mv3)\.js$/;
const UNDELETE_ENTRY_NAMES = [
  'H2O.Studio.archiveUndelete',
  'H2O.Studio.archiveTombstoneRestore',
  'dryRunUndeleteChat',
  'undeleteChat',
  'archiveUndelete',
  'archiveTombstoneRestore',
];

const TOMBSTONE_WRITE_PATTERNS = [
  /\bINSERT\s+INTO\s+sync_tombstones\b/i,
  /\bUPDATE\s+sync_tombstones\b/i,
  /\bDELETE\s+FROM\s+sync_tombstones\b/i,
  /\bMERGE\s+INTO\s+sync_tombstones\b/i,
  /\bclearTombstone\b/i,
  /\bdeleteTombstone\b/i,
  /\bremoveTombstone\b/i,
  /\bsupersedeTombstone\b/i,
  /\brestoreTombstone\b/i,
  /\bSET\b[\s\S]{0,160}\brestored_at\b/i,
  /\bSET\b[\s\S]{0,160}\brestored_by_sync_peer_id\b/i,
  /\brestored_at\s*=\s*\?/i,
  /\brestored_by_sync_peer_id\s*=\s*\?/i,
];

const IS_DELETED_FLIP_PATTERNS = [
  /\bSET\b[\s\S]{0,160}\bis_deleted\s*=\s*0\b/i,
  /\bis_deleted\s*:\s*0\b/i,
  /\bisDeleted\s*:\s*false\b/i,
  /\bis_deleted\s*=\s*\?/i,
  /\bSET\b[\s\S]{0,160}\bdeleted_at\b/i,
  /\bdeleted_at\s*=\s*\?/i,
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

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function readRepo(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function walkFiles(absDir) {
  const out = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const abs = path.join(absDir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

function archiveModuleFiles() {
  return walkFiles(path.join(REPO_ROOT, INGESTION_DIR_REL))
    .filter((abs) => ARCHIVE_MODULE_RE.test(path.basename(abs)))
    .map((abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/'))
    .sort();
}

function moduleCode(rel) {
  return stripComments(readRepo(rel));
}

function assertPatternAbsent(rel, code, patterns, label) {
  for (const pattern of patterns) {
    assert.ok(!pattern.test(code), `${label} matched ${pattern} in ${rel}`);
  }
}

const k50 = exists(K50_CONTRACT_REL) ? readRepo(K50_CONTRACT_REL) : '';
const archiveModules = archiveModuleFiles();
const restoreCode = exists(RESTORE_REL) ? moduleCode(RESTORE_REL) : '';
const relinkCode = exists(RELINK_REL) ? moduleCode(RELINK_REL) : '';
const harnessSrc = exists(HARNESS_REL) ? readRepo(HARNESS_REL) : '';

console.log('[archive-tombstone-boundary] K.5.1 tombstone / un-delete boundary checks');

check('[K.5.0] tombstone / un-delete boundary contract exists', () => {
  assert.ok(exists(K50_CONTRACT_REL), 'missing K.5.0 contract evidence');
  assert.match(k50, /PHASE K\.5 CONTRACT[\s\S]*TOMBSTONE OVERRIDE[\s\S]*UN-DELETE[\s\S]*NOT IMPLEMENTED/i);
});

check('[K.5.0] contract defers un-delete to sync lane and rejects archive ownership', () => {
  assert.match(k50, /DEFERRED TO SYNC LANE/i);
  assert.match(k50, /Sync Architecture \/ deletion lane/i);
  assert.match(k50, /Archive modules must not[\s\S]*write `sync_tombstones`/i);
  assert.match(k50, /Archive modules must not[\s\S]*flip `chats\.is_deleted`/i);
  assert.match(k50, /delete tombstone rows/i);
});

check('[K.5.0] contract preserves zero-write tombstoned restore/relink behavior', () => {
  assert.match(k50, /restore-original-ids returns `tombstoned` with zero writes/i);
  assert.match(k50, /relink returns `tombstoned` with zero writes/i);
  assert.match(k50, /tombstone row is superseded \(not deleted\)/i);
  assert.ok(k50.includes('UNDELETE:<chatId>'), 'future sync undelete token missing');
  assert.match(k50, /K\.5 closure/i);
});

check('[ARCHIVE] archive modules are discoverable for boundary scan', () => {
  assert.ok(archiveModules.includes(RESTORE_REL), 'restore module missing from scan');
  assert.ok(archiveModules.includes(RELINK_REL), 'relink module missing from scan');
  assert.ok(archiveModules.length >= 8, 'archive scan unexpectedly small');
});

check('[ARCHIVE] no archive undelete/tombstone-restore runtime entry point exists', () => {
  for (const rel of archiveModules) {
    const base = path.basename(rel).toLowerCase();
    assert.ok(!/(undelete|tombstone-restore)/.test(base), `archive undelete module file exists: ${rel}`);
    const code = moduleCode(rel);
    for (const name of UNDELETE_ENTRY_NAMES) {
      assert.ok(!code.includes(name), `archive undelete entry leaked into ${rel}: ${name}`);
    }
  }
});

check('[ARCHIVE] archive modules do not write sync_tombstones', () => {
  for (const rel of archiveModules) {
    const code = moduleCode(rel);
    assertPatternAbsent(rel, code, TOMBSTONE_WRITE_PATTERNS, 'sync_tombstones write-like pattern');
  }
});

check('[ARCHIVE] archive modules do not flip chats.is_deleted or mutate deleted_at', () => {
  for (const rel of archiveModules) {
    const code = moduleCode(rel);
    assertPatternAbsent(rel, code, IS_DELETED_FLIP_PATTERNS, 'is_deleted undelete-like pattern');
  }
});

check('[RESTORE] restore remains tombstone-gated and zero-write for tombstoned original chat', () => {
  assert.ok(restoreCode.includes('findActiveChatTombstone'), 'restore tombstone read gate missing');
  assert.ok(restoreCode.includes("'tombstoned'"), 'restore tombstoned status missing');
  assert.match(restoreCode, /override\/un-delete is deferred/i);
  assert.ok(!/UPDATE\s+sync_tombstones|DELETE\s+FROM\s+sync_tombstones|SET\s+restored_at/i.test(restoreCode), 'restore must not mutate tombstones');
  assert.ok(!/UPDATE\s+chats[\s\S]{0,200}is_deleted|SET\s+is_deleted/i.test(restoreCode), 'restore must not flip chat deletion');
});

check('[RELINK] relink remains tombstone-gated and zero-write for tombstoned target chat', () => {
  assert.ok(relinkCode.includes('findActiveChatTombstone'), 'relink tombstone read gate missing');
  assert.ok(relinkCode.includes("'tombstoned'"), 'relink tombstoned status missing');
  assert.match(relinkCode, /override\/un-delete is deferred/i);
  assert.ok(!/UPDATE\s+sync_tombstones|DELETE\s+FROM\s+sync_tombstones|SET\s+restored_at/i.test(relinkCode), 'relink must not mutate tombstones');
  assert.ok(!/UPDATE\s+chats[\s\S]{0,200}is_deleted|SET\s+is_deleted/i.test(relinkCode), 'relink must not flip chat deletion');
});

check('[HARNESS] permanent harness covers restore tombstoned zero-write', () => {
  assert.ok(harnessSrc.includes("[K.3] tombstoned returns tombstoned, performs zero writes, and leaves tombstone unchanged"), 'K.3 tombstoned harness assertion missing');
  assert.ok(harnessSrc.includes('H.restore.tombstoned.writes, 0'), 'restore tombstoned zero-write assertion missing');
  assert.ok(harnessSrc.includes('H.restore.tombstoned.tombstoneUnchanged, true'), 'restore tombstone unchanged assertion missing');
});

check('[HARNESS] permanent harness covers relink tombstoned zero-write', () => {
  assert.ok(harnessSrc.includes('[K.4.3] missing/deleted/tombstoned targets and original-snapshot conflict are zero-write'), 'K.4.3 tombstoned harness assertion missing');
  assert.ok(harnessSrc.includes('H.relink.tombstoned.writes, 0'), 'relink tombstoned zero-write assertion missing');
  assert.ok(harnessSrc.includes('H.relink.tombstoned.tombstoneUnchanged, true'), 'relink tombstone unchanged assertion missing');
});

check('[BOUNDARY] sync lane owns future undelete vocabulary; archive modules do not', () => {
  assert.ok(k50.includes('dryRunUndeleteChat({ chatId })'), 'future dryRunUndeleteChat sketch missing from contract');
  assert.ok(k50.includes('undeleteChat({ chatId, confirm: "UNDELETE:<chatId>" })'), 'future undeleteChat sketch missing from contract');
  for (const rel of archiveModules) {
    const code = moduleCode(rel);
    assert.ok(!code.includes('UNDELETE:<chatId>'), `future sync token leaked into archive runtime: ${rel}`);
    assert.ok(!code.includes('UNDELETE:'), `sync undelete token implemented in archive runtime: ${rel}`);
  }
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-tombstone-boundary] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exitCode = 1;
} else {
  console.log(`[archive-tombstone-boundary] all ${PASS.length} checks passed`);
}
