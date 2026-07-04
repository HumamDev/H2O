#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_DB = path.join(os.homedir(), 'Library/Application Support/org.h2o.studio.desktop/studio-v1.db');
const DEFAULT_BACKUP_DIR = '/private/tmp/h2o-studio-db-backups';
const DEFAULT_PACKAGE_BACKUP_DIR = '/private/tmp/h2o-studio-package-backups';
const DEFAULT_PACKAGES_DIR = path.join(os.homedir(), 'Library/Application Support/org.h2o.studio.desktop/archive/packages');
const DEFAULT_SYNC_ROOT = path.join(os.homedir(), 'H2O Studio Sync');
const DEFAULT_SYNC_BACKUP_DIR = '/private/tmp/h2o-studio-sync-bundle-backups';

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

// A running Desktop Studio holds the smoke/debug rows in memory and can re-export
// them into the local fullBundle v2 sync artifacts, after which focus-import
// reinserts them into SQLite — silently undoing a cleanup that "verified" clean.
// So apply refuses to run while Desktop Studio is running (override: --force).
// productName "H2O Studio" (.app), bundle id org.h2o.studio.desktop, dev binary
// h2o-studio-desktop. Matched against the full command line, case-insensitive.
const DESKTOP_PROCESS_PATTERNS = ['H2O Studio.app', 'org.h2o.studio.desktop', 'h2o-studio-desktop'];
const RECHECK_DELAY_MS = 5000;

// Conservative detection: pgrep -f (full command line) per pattern, exclude this
// cleanup process (by pid) and the cleanup script itself (by resolved command).
// Fails OPEN (returns []) if pgrep is unavailable — the delayed re-check is the
// backstop in that case.
function detectRunningDesktop() {
  const pids = new Set();
  for (const pattern of DESKTOP_PROCESS_PATTERNS) {
    const result = spawnSync('pgrep', ['-f', '-i', pattern], { encoding: 'utf8' });
    if (result.error || result.status !== 0 || !result.stdout) continue; // status 1 = no match
    for (const line of result.stdout.trim().split('\n')) {
      const pid = line.trim();
      if (/^\d+$/.test(pid) && pid !== String(process.pid)) pids.add(pid);
    }
  }
  const found = [];
  for (const pid of pids) {
    const ps = spawnSync('ps', ['-p', pid, '-o', 'command='], { encoding: 'utf8' });
    const command = String(ps.stdout || '').trim();
    if (!command) continue;
    if (command.includes('cleanup-saved-chat-smoke-rows')) continue; // never self-flag
    found.push({ pid, command });
  }
  return found;
}

function parseArgs(argv) {
  const out = {
    mode: '',
    db: DEFAULT_DB,
    force: false,
    backup: false,
    backupDir: DEFAULT_BACKUP_DIR,
    packagesDir: DEFAULT_PACKAGES_DIR,
    packageBackupDir: DEFAULT_PACKAGE_BACKUP_DIR,
    syncRoot: DEFAULT_SYNC_ROOT,
    syncBackupDir: DEFAULT_SYNC_BACKUP_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.mode = 'dry-run';
    else if (arg === '--apply') out.mode = 'apply';
    else if (arg === '--verify') out.mode = 'verify';
    else if (arg === '--force') out.force = true;
    else if (arg === '--backup') out.backup = true;
    else if (arg === '--db') out.db = argv[++i] || '';
    else if (arg === '--backup-dir') out.backupDir = argv[++i] || '';
    else if (arg === '--packages-dir') out.packagesDir = argv[++i] || '';
    else if (arg === '--package-backup-dir') out.packageBackupDir = argv[++i] || '';
    else if (arg === '--sync-root') out.syncRoot = argv[++i] || '';
    else if (arg === '--sync-backup-dir') out.syncBackupDir = argv[++i] || '';
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

function collectSyncBundlePaths(syncRoot) {
  if (!syncRoot || !fs.existsSync(syncRoot)) return [];
  const paths = [
    path.join(syncRoot, 'latest.json'),
    path.join(syncRoot, 'chrome-latest.json'),
    path.join(syncRoot, 'chrome-latest.json.tmp'),
  ];
  const devicesDir = path.join(syncRoot, 'devices');
  if (fs.existsSync(devicesDir)) {
    for (const deviceName of fs.readdirSync(devicesDir)) {
      paths.push(path.join(devicesDir, deviceName, 'latest.json'));
    }
  }
  return [...new Set(paths)].filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
}

function inspectSyncBundleFile(file, candidateIds) {
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  const chats = Array.isArray(parsed?.chatArchive?.chats) ? parsed.chatArchive.chats : [];
  if (!chats.length) return null;
  const matchingChats = chats
    .filter((chat) => candidateIds.has(String(chat?.chatId || chat?.id || '')))
    .map((chat) => ({
      chatId: String(chat?.chatId || chat?.id || ''),
      title: String(chat?.chatIndex?.displayTitle || chat?.chatIndex?.title || chat?.title || ''),
    }));
  return {
    path: file,
    schema: parsed.schema || '',
    chatCount: Number(parsed?.chatArchive?.chatCount || chats.length) || chats.length,
    matchingCount: matchingChats.length,
    matchingChats,
  };
}

function inspectSyncBundles(syncRoot, candidates) {
  const candidateIds = new Set(candidates.map((row) => row.id));
  return collectSyncBundlePaths(syncRoot)
    .map((file) => inspectSyncBundleFile(file, candidateIds))
    .filter(Boolean)
    .filter((summary) => summary.matchingCount > 0);
}

function backupAndPruneSyncBundles(syncRoot, candidates, backupRoot) {
  const candidateIds = new Set(candidates.map((row) => row.id));
  const impacted = inspectSyncBundles(syncRoot, candidates);
  if (!impacted.length) return { syncBundleBackupDir: '', cleanedSyncBundles: [] };
  const syncBundleBackupDir = path.join(backupRoot, `sync-bundles-before-smoke-cleanup-${nowStamp()}`);
  fs.mkdirSync(syncBundleBackupDir, { recursive: true });
  const cleanedSyncBundles = [];
  for (const item of impacted) {
    const raw = fs.readFileSync(item.path, 'utf8');
    const parsed = JSON.parse(raw);
    const backupPath = path.join(syncBundleBackupDir, path.basename(item.path));
    let finalBackupPath = backupPath;
    let suffix = 1;
    while (fs.existsSync(finalBackupPath)) {
      finalBackupPath = path.join(syncBundleBackupDir, `${path.basename(item.path)}.${suffix}`);
      suffix += 1;
    }
    fs.writeFileSync(finalBackupPath, raw);
    const beforeChats = parsed.chatArchive.chats.length;
    parsed.chatArchive.chats = parsed.chatArchive.chats.filter((chat) => !candidateIds.has(String(chat?.chatId || chat?.id || '')));
    parsed.chatArchive.chatCount = parsed.chatArchive.chats.length;
    if (parsed.summary && typeof parsed.summary === 'object') {
      parsed.summary.chatCount = parsed.chatArchive.chats.length;
      parsed.summary.snapshotCount = parsed.chatArchive.chats.reduce(
        (sum, chat) => sum + (Array.isArray(chat?.snapshots) ? chat.snapshots.length : 0),
        0,
      );
    }
    if (Object.prototype.hasOwnProperty.call(parsed, 'contentSha256')) {
      const withoutContentSha = { ...parsed };
      delete withoutContentSha.contentSha256;
      const preimage = `${JSON.stringify(withoutContentSha, null, 2)}\n`;
      parsed.contentSha256 = `sha256:${crypto.createHash('sha256').update(preimage, 'utf8').digest('hex')}`;
    }
    const nextText = `${JSON.stringify(parsed, null, 2)}\n`;
    fs.writeFileSync(item.path, nextText);
    const sidecarPath = path.join(path.dirname(item.path), 'latest.sha256');
    let sidecarBackupPath = '';
    if (path.basename(item.path) === 'latest.json' && fs.existsSync(sidecarPath)) {
      sidecarBackupPath = path.join(syncBundleBackupDir, `${path.basename(path.dirname(item.path)) || 'root'}-latest.sha256`);
      let finalSidecarBackupPath = sidecarBackupPath;
      let sidecarSuffix = 1;
      while (fs.existsSync(finalSidecarBackupPath)) {
        finalSidecarBackupPath = path.join(syncBundleBackupDir, `${path.basename(path.dirname(item.path)) || 'root'}-latest.sha256.${sidecarSuffix}`);
        sidecarSuffix += 1;
      }
      fs.copyFileSync(sidecarPath, finalSidecarBackupPath);
      sidecarBackupPath = finalSidecarBackupPath;
      fs.writeFileSync(sidecarPath, `sha256:${crypto.createHash('sha256').update(nextText, 'utf8').digest('hex')}\n`);
    }
    cleanedSyncBundles.push({
      path: item.path,
      backupPath: finalBackupPath,
      sidecarBackupPath,
      removedChats: beforeChats - parsed.chatArchive.chats.length,
      remainingChats: parsed.chatArchive.chats.length,
    });
  }
  return { syncBundleBackupDir, cleanedSyncBundles };
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

  const desktopRunning = detectRunningDesktop();
  const beforeCounts = liveCounts(args.db);
  const { candidates, ambiguous } = loadCandidates(args.db);
  const { packageCandidates, packageAmbiguous } = loadPackageCandidates(candidates, args.packagesDir || DEFAULT_PACKAGES_DIR);
  const syncBundleCandidates = inspectSyncBundles(args.syncRoot || DEFAULT_SYNC_ROOT, candidates);
  const counts = dependentCounts(args.db, candidates);
  const base = {
    schema: 'h2o.studio.cleanup.saved-chat-smoke-rows.v1',
    mode: args.mode,
    dbPath: args.db,
    beforeCounts,
    desktopRunning,
    candidateCount: candidates.length,
    candidates,
    ambiguous: [...ambiguous, ...packageAmbiguous],
    packageCandidates,
    syncBundleCandidates,
    dependentCounts: counts,
  };

  if (base.ambiguous.length) {
    console.log(JSON.stringify({ ...base, status: 'blocked', reason: 'ambiguous-candidates' }, null, 2));
    process.exit(2);
  }

  // Pre-flight running-Desktop guard. A running Desktop Studio can re-export the
  // smoke rows into the sync bundle and focus-import them back into SQLite, silently
  // undoing a cleanup. Warn for every mode; refuse apply (without --force) BEFORE any
  // mutation (backup / SQLite write / sync-bundle write / sidecar update).
  if (desktopRunning.length) {
    console.error('WARNING: Desktop Studio appears to be running:');
    for (const proc of desktopRunning) console.error(`  pid ${proc.pid}: ${proc.command}`);
    console.error('A running Desktop can re-export smoke rows into the sync bundle and focus-import them back into SQLite.');
  }

  if (args.mode === 'dry-run') {
    console.log(JSON.stringify({ ...base, status: 'dry-run-ok' }, null, 2));
    return;
  }

  if (args.mode === 'verify') {
    console.log(JSON.stringify({ ...base, status: candidates.length ? 'verify-failed' : 'verified', verify: verify(args.db) }, null, 2));
    process.exit(candidates.length ? 3 : 0);
  }

  if (desktopRunning.length && !args.force) {
    console.error('Close Desktop Studio completely, then rerun cleanup.');
    console.log(JSON.stringify({
      ...base,
      status: 'blocked',
      reason: 'desktop-running',
      hint: 'Close Desktop Studio, or rerun with --force to override (accepts the rehydration risk).',
    }, null, 2));
    process.exit(5);
  }
  if (desktopRunning.length && args.force) {
    console.error('--force: proceeding despite a running Desktop Studio (rehydration risk accepted).');
  }

  let backupPath = '';
  if (args.backup) backupPath = backupDb(args.db, args.backupDir || DEFAULT_BACKUP_DIR);
  const packageRemoval = backupAndRemovePackages(packageCandidates, args.packageBackupDir || DEFAULT_PACKAGE_BACKUP_DIR);
  const syncBundleCleanup = backupAndPruneSyncBundles(
    args.syncRoot || DEFAULT_SYNC_ROOT,
    candidates,
    args.syncBackupDir || DEFAULT_SYNC_BACKUP_DIR,
  );
  await deleteCandidates(args.db, candidates);
  const after = verify(args.db);
  const afterCounts = after.liveCounts;
  console.log(JSON.stringify({
    ...base,
    status: after.remainingCandidates.length ? 'apply-incomplete' : 'applied',
    backupPath,
    ...packageRemoval,
    ...syncBundleCleanup,
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

  // Delayed post-verify re-check: a still-running Desktop (or an export/import cycle
  // triggered during cleanup) can reinsert the smoke rows seconds after a clean apply.
  // Wait a fixed interval, then re-count. Deterministic: one wait, one re-count.
  await new Promise((resolve) => setTimeout(resolve, RECHECK_DELAY_MS));
  const recheckCandidates = loadCandidates(args.db).candidates;
  const recheckChats = liveCounts(args.db).chats;
  console.log(JSON.stringify({
    schema: base.schema,
    mode: 'apply',
    stage: 'delayed-recheck',
    status: recheckCandidates.length ? 'rehydrated' : 'stable',
    recheckDelayMs: RECHECK_DELAY_MS,
    recheckChats,
    recheckSmoke: recheckCandidates.length,
    recheckCandidateIds: recheckCandidates.map((row) => row.id),
  }, null, 2));
  if (recheckCandidates.length) {
    console.error('Smoke rows reappeared after cleanup; likely reinserted by a running Desktop/export/import process.');
    process.exit(6);
  }
}

try {
  await main();
} catch (error) {
  console.error(String(error && error.stack ? error.stack : error));
  process.exit(1);
}
