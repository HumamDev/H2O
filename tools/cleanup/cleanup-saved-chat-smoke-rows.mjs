#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DB = path.join(os.homedir(), 'Library/Application Support/org.h2o.studio.desktop/studio-v1.db');
const DEFAULT_BACKUP_DIR = '/private/tmp/h2o-studio-db-backups';
const DEFAULT_PACKAGE_BACKUP_DIR = '/private/tmp/h2o-studio-package-backups';
const DEFAULT_PACKAGES_DIR = path.join(os.homedir(), 'Library/Application Support/org.h2o.studio.desktop/archive/packages');

const ID_PREFIXES = [
  /^c4_4_/,
  /^c5_3_/,
  /^c5_4_/,
  /^d2a_/,
  /^d2b_/,
  /^d2c_/,
  /^d3b2_/,
  /^writer_identity_debug_/,
];

const TITLE_PATTERNS = [
  /^C4\.4 package v1 runtime smoke$/,
  /^C4\.4 package v2 runtime smoke$/,
  /^C4\.4 writer identity debug$/,
  /^C5\.3 asset diagnostics v1 smoke$/,
  /^C5\.3 asset diagnostics v2 smoke$/,
  /^C5\.4 DB diagnostics v1 smoke$/,
  /^C5\.4 DB diagnostics v2 smoke$/,
  /^D\.2A archive request intake smoke$/,
  /^D\.2B archive request queue smoke$/,
  /^D\.2C archive request materializer smoke$/,
  /^D\.3B\.2 archive request inbox smoke$/,
  /^Writer identity debug chat$/,
  /^Writer identity debug snapshot$/,
];

function parseArgs(argv) {
  const out = {
    mode: '',
    db: DEFAULT_DB,
    backup: false,
    backupDir: DEFAULT_BACKUP_DIR,
    packagesDir: DEFAULT_PACKAGES_DIR,
    packageBackupDir: DEFAULT_PACKAGE_BACKUP_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.mode = 'dry-run';
    else if (arg === '--apply') out.mode = 'apply';
    else if (arg === '--verify') out.mode = 'verify';
    else if (arg === '--backup') out.backup = true;
    else if (arg === '--db') out.db = argv[++i] || '';
    else if (arg === '--backup-dir') out.backupDir = argv[++i] || '';
    else if (arg === '--packages-dir') out.packagesDir = argv[++i] || '';
    else if (arg === '--package-backup-dir') out.packageBackupDir = argv[++i] || '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.mode) throw new Error('Pass one of --dry-run, --apply, or --verify');
  if (out.mode === 'apply') out.backup = true;
  return out;
}

function runSqlite(db, args, opts = {}) {
  const result = spawnSync('sqlite3', [db, ...args], {
    encoding: 'utf8',
    maxBuffer: opts.maxBuffer || 20 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `sqlite3 exited ${result.status}`).trim());
  }
  return result.stdout || '';
}

function quoteSql(value) {
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function queryJson(db, sql) {
  const stdout = runSqlite(db, ['-json', sql]);
  const text = stdout.trim();
  return text ? JSON.parse(text) : [];
}

function tableExists(db, table) {
  const rows = queryJson(db, `SELECT name FROM sqlite_master WHERE type='table' AND name=${quoteSql(table)};`);
  return rows.length > 0;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function titleAllowed(title) {
  return TITLE_PATTERNS.some((pattern) => pattern.test(String(title || '').trim()));
}

function idAllowed(id) {
  return ID_PREFIXES.some((pattern) => pattern.test(String(id || '').trim()));
}

function loadCandidates(db) {
  const rows = queryJson(db, `
    SELECT
      id,
      title,
      is_saved AS isSaved,
      is_linked AS isLinked,
      is_deleted AS isDeleted,
      last_snapshot_id AS lastSnapshotId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM chats
    ORDER BY id;
  `);
  const candidates = [];
  const ambiguous = [];
  for (const row of rows) {
    const byId = idAllowed(row.id);
    const byTitle = titleAllowed(row.title);
    if (!byId && !byTitle) continue;
    if (byId && !byTitle) {
      ambiguous.push({ ...row, reason: 'dev-prefix-with-unrecognized-title' });
      continue;
    }
    candidates.push({ ...row, match: byId ? 'id+title' : 'title' });
  }
  return { candidates, ambiguous };
}

function loadPackageCandidates(candidates, packagesDir) {
  const packageCandidates = [];
  const packageAmbiguous = [];
  for (const row of candidates) {
    const packageDir = path.join(packagesDir, `${row.id}.h2ochat`);
    if (!fs.existsSync(packageDir)) continue;
    const manifestPath = path.join(packageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      packageAmbiguous.push({ chatId: row.id, packageDir, reason: 'manifest-missing' });
      continue;
    }
    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (error) {
      packageAmbiguous.push({ chatId: row.id, packageDir, reason: `manifest-read-failed:${String(error?.message || error)}` });
      continue;
    }
    const manifestChatId = String(manifest.chatId || manifest.chat_id || manifest.identity?.chatId || '').trim();
    const manifestSnapshotId = String(manifest.snapshotId || manifest.snapshot_id || manifest.identity?.snapshotId || '').trim();
    if (manifestChatId !== row.id || !idAllowed(manifestChatId)) {
      packageAmbiguous.push({ chatId: row.id, packageDir, manifestChatId, manifestSnapshotId, reason: 'manifest-chat-id-mismatch' });
      continue;
    }
    packageCandidates.push({ chatId: row.id, snapshotId: manifestSnapshotId, packageDir });
  }
  return { packageCandidates, packageAmbiguous };
}

function idsSql(ids) {
  return ids.length ? ids.map(quoteSql).join(',') : "''";
}

function countRows(db, table, whereSql) {
  if (!tableExists(db, table)) return 0;
  const rows = queryJson(db, `SELECT COUNT(*) AS n FROM ${table} WHERE ${whereSql};`);
  return Number(rows[0]?.n || 0) || 0;
}

function dependentCounts(db, candidates) {
  const chatIds = candidates.map((row) => row.id);
  const chatIdList = idsSql(chatIds);
  const snapshots = tableExists(db, 'snapshots')
    ? queryJson(db, `SELECT id FROM snapshots WHERE chat_id IN (${chatIdList}) ORDER BY id;`).map((row) => row.id)
    : [];
  const snapshotIdList = idsSql(snapshots);
  return {
    chats: candidates.length,
    snapshots: snapshots.length,
    snapshot_turns: countRows(db, 'snapshot_turns', `snapshot_id IN (${snapshotIdList})`),
    snapshot_turn_assets: countRows(db, 'snapshot_turn_assets', `snapshot_id IN (${snapshotIdList})`),
    folder_bindings: countRows(db, 'folder_bindings', `chat_id IN (${chatIdList})`),
    label_bindings: countRows(db, 'label_bindings', `chat_id IN (${chatIdList})`),
    tag_bindings: countRows(db, 'tag_bindings', `chat_id IN (${chatIdList})`),
    saved_chat_archive_requests: countRows(db, 'saved_chat_archive_requests', `studio_chat_id IN (${chatIdList}) OR snapshot_id IN (${snapshotIdList})`),
    sync_tombstones: countRows(db, 'sync_tombstones', `record_id IN (${chatIdList}) OR record_id IN (${snapshotIdList})`),
    sync_tombstone_reviews: countRows(db, 'sync_tombstone_reviews', `record_id IN (${chatIdList}) OR record_id IN (${snapshotIdList})`),
    sync_conflicts: countRows(db, 'sync_conflicts', `entity_id IN (${chatIdList}) OR entity_id IN (${snapshotIdList})`),
  };
}

function liveCounts(db) {
  const rows = queryJson(db, `
    SELECT
      COUNT(*) AS chats,
      SUM(CASE WHEN is_saved=1 AND is_deleted=0 THEN 1 ELSE 0 END) AS saved,
      SUM(CASE WHEN is_saved=1 AND is_deleted=0 AND last_snapshot_id IS NOT NULL AND last_snapshot_id <> '' THEN 1 ELSE 0 END) AS savedWithSnapshot
    FROM chats;
  `);
  const snapshots = queryJson(db, 'SELECT COUNT(*) AS n FROM snapshots;');
  const turns = queryJson(db, 'SELECT COUNT(*) AS n FROM snapshot_turns;');
  return {
    chats: Number(rows[0]?.chats || 0) || 0,
    saved: Number(rows[0]?.saved || 0) || 0,
    savedWithSnapshot: Number(rows[0]?.savedWithSnapshot || 0) || 0,
    snapshots: Number(snapshots[0]?.n || 0) || 0,
    snapshotTurns: Number(turns[0]?.n || 0) || 0,
  };
}

function backupDb(db, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `studio-v1-before-smoke-cleanup-${nowStamp()}.db`);
  runSqlite(db, [`.backup ${quoteSql(backupPath)}`]);
  return backupPath;
}

function backupAndRemovePackages(packageCandidates, backupRoot) {
  if (!packageCandidates.length) return { packageBackupDir: '', removedPackages: [] };
  const packageBackupDir = path.join(backupRoot, `packages-before-smoke-cleanup-${nowStamp()}`);
  fs.mkdirSync(packageBackupDir, { recursive: true });
  const removedPackages = [];
  for (const pkg of packageCandidates) {
    const source = pkg.packageDir;
    const dest = path.join(packageBackupDir, path.basename(source));
    fs.cpSync(source, dest, { recursive: true, preserveTimestamps: true });
    fs.rmSync(source, { recursive: true, force: false });
    removedPackages.push({ ...pkg, backupDir: dest });
  }
  return { packageBackupDir, removedPackages };
}

async function deleteCandidates(db, candidates) {
  const { DatabaseSync } = await import('node:sqlite');
  const chatIds = candidates.map((row) => row.id);
  const chatIdList = idsSql(chatIds);
  const sql = `
    BEGIN IMMEDIATE;
    CREATE TEMP TABLE h2o_cleanup_candidate_chats(id TEXT PRIMARY KEY);
    INSERT INTO h2o_cleanup_candidate_chats(id) VALUES ${chatIds.map((id) => `(${quoteSql(id)})`).join(',')};
    CREATE TEMP TABLE h2o_cleanup_candidate_snapshots(id TEXT PRIMARY KEY);
    INSERT INTO h2o_cleanup_candidate_snapshots(id)
      SELECT id FROM snapshots WHERE chat_id IN (SELECT id FROM h2o_cleanup_candidate_chats);
    DELETE FROM snapshot_turn_assets WHERE snapshot_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM saved_chat_archive_requests
      WHERE studio_chat_id IN (SELECT id FROM h2o_cleanup_candidate_chats)
         OR snapshot_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM sync_conflicts
      WHERE entity_id IN (SELECT id FROM h2o_cleanup_candidate_chats)
         OR entity_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM sync_tombstone_reviews
      WHERE record_id IN (SELECT id FROM h2o_cleanup_candidate_chats)
         OR record_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM sync_tombstones
      WHERE record_id IN (SELECT id FROM h2o_cleanup_candidate_chats)
         OR record_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM folder_bindings WHERE chat_id IN (SELECT id FROM h2o_cleanup_candidate_chats);
    DELETE FROM label_bindings WHERE chat_id IN (SELECT id FROM h2o_cleanup_candidate_chats);
    DELETE FROM tag_bindings WHERE chat_id IN (SELECT id FROM h2o_cleanup_candidate_chats);
    DELETE FROM snapshot_turns WHERE snapshot_id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM snapshots WHERE id IN (SELECT id FROM h2o_cleanup_candidate_snapshots);
    DELETE FROM chats WHERE id IN (${chatIdList});
    COMMIT;
  `;
  const handle = new DatabaseSync(db);
  try {
    handle.function('h2o_writer_identity', () => 'f15.execute-settlement-writer');
    handle.exec(sql);
  } finally {
    handle.close();
  }
}

function verify(db) {
  const { candidates, ambiguous } = loadCandidates(db);
  return {
    remainingCandidates: candidates,
    remainingAmbiguous: ambiguous,
    liveCounts: liveCounts(db),
    realSavedExamples: queryJson(db, `
      SELECT id, title, is_saved AS isSaved, is_deleted AS isDeleted, last_snapshot_id AS lastSnapshotId
      FROM chats
      WHERE is_saved=1 AND is_deleted=0
      ORDER BY updated_at DESC, id
      LIMIT 8;
    `),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.db)) throw new Error(`DB not found: ${args.db}`);

  const beforeCounts = liveCounts(args.db);
  const { candidates, ambiguous } = loadCandidates(args.db);
  const { packageCandidates, packageAmbiguous } = loadPackageCandidates(candidates, args.packagesDir || DEFAULT_PACKAGES_DIR);
  const counts = dependentCounts(args.db, candidates);
  const base = {
    schema: 'h2o.studio.cleanup.saved-chat-smoke-rows.v1',
    mode: args.mode,
    dbPath: args.db,
    beforeCounts,
    candidateCount: candidates.length,
    candidates,
    ambiguous: [...ambiguous, ...packageAmbiguous],
    packageCandidates,
    dependentCounts: counts,
  };

  if (base.ambiguous.length) {
    console.log(JSON.stringify({ ...base, status: 'blocked', reason: 'ambiguous-candidates' }, null, 2));
    process.exit(2);
  }

  if (args.mode === 'dry-run') {
    console.log(JSON.stringify({ ...base, status: 'dry-run-ok' }, null, 2));
    return;
  }

  if (args.mode === 'verify') {
    console.log(JSON.stringify({ ...base, status: candidates.length ? 'verify-failed' : 'verified', verify: verify(args.db) }, null, 2));
    process.exit(candidates.length ? 3 : 0);
  }

  let backupPath = '';
  if (args.backup) backupPath = backupDb(args.db, args.backupDir || DEFAULT_BACKUP_DIR);
  const packageRemoval = backupAndRemovePackages(packageCandidates, args.packageBackupDir || DEFAULT_PACKAGE_BACKUP_DIR);
  await deleteCandidates(args.db, candidates);
  const after = verify(args.db);
  const afterCounts = after.liveCounts;
  console.log(JSON.stringify({
    ...base,
    status: after.remainingCandidates.length ? 'apply-incomplete' : 'applied',
    backupPath,
    ...packageRemoval,
    afterCounts,
    removedCounts: {
      chats: beforeCounts.chats - afterCounts.chats,
      saved: beforeCounts.saved - afterCounts.saved,
      savedWithSnapshot: beforeCounts.savedWithSnapshot - afterCounts.savedWithSnapshot,
      snapshots: beforeCounts.snapshots - afterCounts.snapshots,
      snapshotTurns: beforeCounts.snapshotTurns - afterCounts.snapshotTurns,
      ...counts,
    },
    verify: after,
  }, null, 2));
  if (after.remainingCandidates.length) process.exit(4);
}

try {
  await main();
} catch (error) {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
}
