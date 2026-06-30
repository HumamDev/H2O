#!/usr/bin/env node
// I.1/I.2/K.3 — Saved-chat archive IMPORT-RECOVERY + RESTORE HARNESS.
//
// Phase I promotes the one-off H.5 node:sqlite import-as-new proof into a permanent
// repo harness (contract: I.0). I.1 added the static scaffold + a deterministic
// fixture. I.2 (this file) turns it into the real harness: it builds a deterministic
// seed node:sqlite DB (schema/triggers mirrored from the real Tauri migrations, with a
// drift guard), registers the Tauri h2o_writer_identity() stub, loads the REAL
// diagnostics / inspector / importer / store adapters, and proves the import-as-new
// recovery loop end-to-end — verify -> import-ready -> imported, +1 chat / +1 snapshot
// / +N turns, fresh ids, provenance, NO UPDATE (no overwrite), already-imported no-op,
// and the live Desktop DB untouched. K.3 extends the same permanent temp-DB proof
// to restore-original-ids: restore-ready -> restored, confirm gate, already-present,
// conflict-snapshot-id, conflict-chat-id, and tombstoned.
//
//   [I.0]      = the harness contract (doc assertions).
//   [SCAFFOLD] = scaffold artifacts + the deterministic fixture is well-formed.
//   [LESSON]   = the H.5 lessons, locked against the real importer.
//   [I.2]      = the live harness run + its assertions.
//
// It NEVER depends on or mutates the developer's live studio-v1.db: the seed DB is a
// throwaway temp file built from inline SQL, and all reads/writes are routed there.
// (A live-DB stat is taken only as an optional untouched-witness, fully guarded.)
// Relink, tombstone override/un-delete, and package export are out of this harness.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const I0_CONTRACT_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-i0-import-harness-contract.md';
const I1_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-i1-import-harness-scaffold.md';
const I2_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-i2-import-harness-runtime.md';
const K3_EVIDENCE_REL = 'release-evidence/2026-06-24/saved-chat-archive-phase-k3-restore-runtime-smoke.md';
const VALIDATOR_REL = 'tools/validation/studio/validate-saved-chat-archive-import-recovery-harness-v1.mjs';
const FIXTURE_DIR_REL = 'tools/validation/fixtures/saved-chat-archive/import-recovery';
const FIXTURE_README_REL = FIXTURE_DIR_REL + '/README.md';
const FIXTURE_PKG_REL = FIXTURE_DIR_REL + '/i-harness-source.h2ochat';
const IMPORTER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-archive-importer.studio.js';
const LIB_RS_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const WRITER_IDENTITY_RS_REL = 'apps/studio/desktop/src-tauri/src/sqlite_writer_identity.rs';
const STORE_MODULES = [
  'store/index.js', 'store/snapshots.tauri.js', 'store/chats.tauri.js',
  'ingestion/saved-chat-archive-diagnostics.tauri.js',
  'ingestion/saved-chat-archive-inspector.studio.js',
  'ingestion/saved-chat-archive-importer.studio.js',
  'ingestion/saved-chat-archive-restore.studio.js',
];
const REQUIRED_FILES = ['manifest.json', 'snapshot.json', 'chat.md', 'chat.html'];
const LIVE_DB = path.join(os.homedir(), 'Library', 'Application Support', 'org.h2o.studio.desktop', 'studio-v1.db');

// Deterministic seed schema — the chats / snapshots / snapshot_turns tables the
// importer touches, plus the f15 chats-category_id protection triggers (BEFORE
// INSERT/UPDATE) that reference h2o_writer_identity(). Mirrored from the real Tauri
// schema; the drift guard (below) fails clearly if the real source restructures it.
const SEED_SCHEMA = `
CREATE TABLE chats (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0,
  last_message_at INTEGER NOT NULL DEFAULT 0, message_count INTEGER NOT NULL DEFAULT 0,
  user_turn_count INTEGER NOT NULL DEFAULT 0, assistant_turn_count INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0, is_archived INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0,
  folder_id TEXT, category_id TEXT, project_id TEXT NOT NULL DEFAULT '',
  current_leaf_id TEXT, import_batch_id TEXT, meta_json TEXT NOT NULL DEFAULT '{}',
  is_saved INTEGER NOT NULL DEFAULT 0, is_linked INTEGER NOT NULL DEFAULT 0,
  linked_at INTEGER NOT NULL DEFAULT 0, linked_from TEXT NOT NULL DEFAULT '',
  link_source_href TEXT NOT NULL DEFAULT '', href TEXT, normalized_href TEXT,
  snapshot_count INTEGER NOT NULL DEFAULT 0, last_snapshot_id TEXT, last_captured_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE snapshots (
  id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
  digest TEXT, message_count INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0,
  legacy INTEGER NOT NULL DEFAULT 0, captured_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0, meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE snapshot_turns (
  snapshot_id TEXT NOT NULL, turn_idx INTEGER NOT NULL, role TEXT NOT NULL,
  outer_html TEXT NOT NULL DEFAULT '', text TEXT NOT NULL DEFAULT '', meta_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (snapshot_id, turn_idx)
);
CREATE TABLE sync_tombstones (
  tombstone_id TEXT PRIMARY KEY,
  schema TEXT NOT NULL DEFAULT 'h2o.syncTombstone.v1',
  record_kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT '',
  deleted_by_sync_peer_id TEXT NOT NULL DEFAULT '',
  delete_reason TEXT NOT NULL DEFAULT '',
  prior_digest TEXT,
  prior_updated_at TEXT,
  source_export_id TEXT,
  source_sequence_number INTEGER,
  cascade_from TEXT,
  restored_at TEXT,
  restored_by_sync_peer_id TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TRIGGER f15_protect_chats_category_id_insert
  BEFORE INSERT ON chats WHEN NEW.category_id IS NOT NULL AND NEW.category_id != ''
  BEGIN SELECT CASE WHEN COALESCE(h2o_writer_identity(), '') NOT IN
    ('f15.execute-settlement-writer','f15.bulk-migration','f15.debug-bypass','f15.emergency-repair')
    THEN RAISE(ABORT, 'f15-store-write-protected:chats.category_id') END; END;
CREATE TRIGGER f15_protect_chats_category_id_update
  BEFORE UPDATE OF category_id ON chats WHEN COALESCE(OLD.category_id, '') != COALESCE(NEW.category_id, '')
  BEGIN SELECT CASE WHEN COALESCE(h2o_writer_identity(), '') NOT IN
    ('f15.execute-settlement-writer','f15.bulk-migration','f15.debug-bypass','f15.emergency-repair')
    THEN RAISE(ABORT, 'f15-store-write-protected:chats.category_id') END; END;
`;

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }
function stripComments(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1'); }
function sha256Prefixed(buf) { return 'sha256-' + crypto.createHash('sha256').update(buf).digest('hex'); }
function readFixtureBytes(leaf) { return fs.readFileSync(path.join(REPO_ROOT, FIXTURE_PKG_REL, leaf)); }
function readFixtureJson(leaf) { return JSON.parse(readFixtureBytes(leaf).toString('utf8')); }

const i0 = exists(I0_CONTRACT_REL) ? readRepo(I0_CONTRACT_REL) : '';
const i1 = exists(I1_EVIDENCE_REL) ? readRepo(I1_EVIDENCE_REL) : '';
const i2 = exists(I2_EVIDENCE_REL) ? readRepo(I2_EVIDENCE_REL) : '';
const importerCode = exists(IMPORTER_REL) ? stripComments(readRepo(IMPORTER_REL)) : '';

console.log('[archive-import-recovery-harness] I.1 scaffold + I.2 live-harness checks');

// --- A. I.0 contract ---------------------------------------------------------

check('[I.0] contract evidence file exists and is marked NOT IMPLEMENTED', () => {
  assert.ok(exists(I0_CONTRACT_REL), 'missing ' + I0_CONTRACT_REL);
  assert.match(i0, /PHASE I\.0 CONTRACT\s*[—-]\s*NOT IMPLEMENTED/);
});

check('[I.0] contract states the deterministic seed strategy (deterministic preferred; live-copy dev-only; drift guard)', () => {
  assert.match(i0, /deterministic/i);
  assert.match(i0, /seed (sqlite )?db|seed schema/i);
  assert.match(i0, /dev-only/i);
  assert.match(i0, /drift (guard|check)/i);
});

check('[I.0] contract enumerates the harness target coverage (the H.5 assertions)', () => {
  for (const phrase of ['import-ready', 'imported', 'already-imported']) {
    assert.ok(i0.includes(phrase), 'contract missing coverage phrase: ' + phrase);
  }
  assert.match(i0, /chats \+1/);
  assert.match(i0, /snapshots \+1/);
  assert.match(i0, /turns \+N|snapshot_turns \+N/);
  assert.match(i0, /no `?UPDATE`?/i);
});

check('[I.0] contract documents Tauri parity (h2o_writer_identity stub) and the deferrals', () => {
  assert.ok(i0.includes('h2o_writer_identity'), 'contract must document the writer-identity stub');
  assert.match(i0, /restore ?\/ ?relink/i);
  assert.match(i0, /export/i);
  assert.match(i0, /deferred/i);
});

// --- B. Scaffold artifacts + deterministic fixture well-formedness -----------

check('[SCAFFOLD] the validator, fixture directory, fixture package, and README all exist', () => {
  assert.ok(exists(VALIDATOR_REL) && exists(FIXTURE_DIR_REL) && exists(FIXTURE_PKG_REL) && exists(FIXTURE_README_REL));
  assert.ok(/\.h2ochat$/.test(FIXTURE_PKG_REL), 'fixture package dir must end in .h2ochat');
});

check('[SCAFFOLD] fixture README documents the seed strategy + Tauri parity + deferrals', () => {
  const r = readRepo(FIXTURE_README_REL);
  assert.match(r, /deterministic/i);
  assert.ok(r.includes('h2o_writer_identity'));
  assert.match(r, /drift guard/i);
  assert.ok(/not user data/i.test(r));
});

check('[SCAFFOLD] fixture has all four required files', () => {
  for (const f of REQUIRED_FILES) assert.ok(exists(FIXTURE_PKG_REL + '/' + f), 'missing: ' + f);
});

check('[SCAFFOLD] fixture file hashes recompute and match the manifest', () => {
  const manifest = readFixtureJson('manifest.json');
  const map = { snapshot: 'snapshot.json', markdown: 'chat.md', html: 'chat.html' };
  for (const key of Object.keys(map)) {
    const actual = sha256Prefixed(readFixtureBytes(map[key]));
    assert.equal(manifest.files[key].sha256, actual, key + ' sha mismatch');
  }
});

check('[SCAFFOLD] fixture is a verifiable v1 asset-free package (contentHash = snapshot sha; schemaVersion 1; no assets; messages[] present)', () => {
  const manifest = readFixtureJson('manifest.json');
  const snap = readFixtureJson('snapshot.json');
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.assets || [], []);
  const snapSha = sha256Prefixed(readFixtureBytes('snapshot.json'));
  assert.equal(manifest.contentHash, snapSha);
  assert.equal(manifest.chatId, snap.chatId);
  assert.equal(manifest.snapshotId, snap.snapshotId);
  assert.ok(Array.isArray(snap.messages) && snap.messages.length >= 1);
  // diagnostics requires the package folder basename to equal chatId + '.h2ochat'
  assert.equal(FIXTURE_PKG_REL.split('/').pop(), manifest.chatId + '.h2ochat', 'fixture dir basename must equal chatId.h2ochat');
});

// --- C. H.5 lessons locked against the real importer -------------------------

check('[LESSON] store rows expose snapshotId not id — importer uses snapshotRowId()', () => {
  assert.ok(importerCode.includes('snapshotRowId'));
});

check('[LESSON] import-as-new uses FRESH ids; snapshots.create omits snapshotId; the overwrite-by-id primitive is never used', () => {
  assert.ok(importerCode.includes('generateRecoveredChatId'));
  assert.ok(/snapStore\.create\(|snapshots\.create\(/.test(importerCode));
  assert.ok(!/snapStore\.upsert\(|snapshots\.upsert\(/.test(importerCode));
  assert.doesNotMatch(importerCode, /create\(\{[^}]*snapshotId/s);
});

check('[LESSON] importer writes no raw INSERT/UPDATE SQL (no-overwrite path is via the store adapters)', () => {
  assert.doesNotMatch(importerCode, /\bINSERT\s+INTO\b|\bUPDATE\b[^=]/i);
});

check('[LESSON] importer has no Chrome/scanner/materializer/watcher/sync coupling', () => {
  for (const banned of ['chrome.runtime', 'scanSavedChatArchiveRequestInboxV1', 'materializeSavedChatArchiveRequestV1',
    'setInterval', 'MutationObserver', 'connectNative', 'H2O.Studio.sync', 'webdav', 'plugin:fs|write']) {
    assert.ok(!importerCode.includes(banned), 'importer must not couple to: ' + banned);
  }
});

// --- D. Live harness (I.2) ---------------------------------------------------

function normRow(r) { const o = {}; for (const k in r) o[k] = typeof r[k] === 'bigint' ? Number(r[k] === null ? 0 : r[k]) : r[k]; return o; }

function generateConflictFreeFixture(srcDir, dstDir, newChat, newSnap) {
  const m = JSON.parse(fs.readFileSync(path.join(srcDir, 'manifest.json'), 'utf8'));
  const oldChat = m.chatId, oldSnap = m.snapshotId;
  const rw = (s) => s.split(oldChat).join(newChat).split(oldSnap).join(newSnap);
  const snapBuf = Buffer.from(rw(fs.readFileSync(path.join(srcDir, 'snapshot.json'), 'utf8')));
  const mdBuf = Buffer.from(rw(fs.readFileSync(path.join(srcDir, 'chat.md'), 'utf8')));
  const htmlBuf = Buffer.from(rw(fs.readFileSync(path.join(srcDir, 'chat.html'), 'utf8')));
  const snapSha = sha256Prefixed(snapBuf);
  m.chatId = newChat; m.snapshotId = newSnap; m.packageId = 'pkg_' + newSnap + '_' + snapSha.slice(7, 19);
  m.files.snapshot.sha256 = snapSha; m.files.snapshot.byteLength = snapBuf.length;
  m.files.markdown.sha256 = sha256Prefixed(mdBuf); m.files.markdown.byteLength = mdBuf.length;
  m.files.html.sha256 = sha256Prefixed(htmlBuf); m.files.html.byteLength = htmlBuf.length;
  m.contentHash = snapSha;
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, 'snapshot.json'), snapBuf);
  fs.writeFileSync(path.join(dstDir, 'chat.md'), mdBuf);
  fs.writeFileSync(path.join(dstDir, 'chat.html'), htmlBuf);
  fs.writeFileSync(path.join(dstDir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
}

function dirSig(dir) {
  return fs.readdirSync(dir).sort().map((f) => f + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 12)).join('|');
}

async function runHarness() {
  // --- drift guard: the seed mirrors the real Tauri schema/triggers ---
  const libRs = exists(LIB_RS_REL) ? readRepo(LIB_RS_REL) : '';
  const widRs = exists(WRITER_IDENTITY_RS_REL) ? readRepo(WRITER_IDENTITY_RS_REL) : '';
  const drift = [];
  if (!libRs) drift.push('lib.rs migration source not found');
  if (!widRs) drift.push('sqlite_writer_identity.rs not found');
  if (widRs && !/h2o_writer_identity/.test(widRs)) drift.push('h2o_writer_identity scalar no longer defined in sqlite_writer_identity.rs');
  if (libRs && !/f15_protect_chats_category_id|f15-store-write-protected:chats\.category_id/.test(libRs)) drift.push('f15 chats category_id protection trigger no longer present in lib.rs');
  for (const t of ['chats', 'snapshots', 'snapshot_turns']) {
    if (libRs && !new RegExp('\\b' + t + '\\b').test(libRs)) drift.push('studio_migrations() no longer references table: ' + t);
  }
  if (drift.length) throw new Error('SCHEMA/TRIGGER DRIFT — update the I.2 seed schema: ' + drift.join('; '));

  const srcSnap = readFixtureJson('snapshot.json');
  const SRC_CHAT = srcSnap.chatId, SRC_SNAP = srcSnap.snapshotId, SRC_DIGEST = srcSnap.metadata.digest;
  const SRC_MSGS = Array.isArray(srcSnap.messages) ? srcSnap.messages.length : 0;
  const RDY_CHAT = 'i-harness-import-ready-chat', RDY_SNAP = 'snap_i_harness_import_ready';

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'i2-harness-'));
  const seedDbPath = path.join(tmp, 'seed.db');
  const appDir = path.join(tmp, 'app');
  const pkgRoot = path.join(appDir, 'archive', 'packages');
  const writes = [];
  let db = null;
  const liveBefore = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

  try {
    // seed DB
    db = new DatabaseSync(seedDbPath);
    db.function('h2o_writer_identity', () => '');            // Tauri parity stub (must precede any chats INSERT)
    db.exec(SEED_SCHEMA);
    // seed the already-imported source row (chat + snapshot with the source digest)
    db.prepare('INSERT INTO chats (id, title, meta_json) VALUES (?, ?, ?)').run(SRC_CHAT, 'I-Harness source', '{}');
    db.prepare('INSERT INTO snapshots (id, chat_id, title, digest, message_count, meta_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(SRC_SNAP, SRC_CHAT, 'I-Harness source', SRC_DIGEST, SRC_MSGS, '{}');

    // stage fixtures under temp AppLocalData
    fs.mkdirSync(pkgRoot, { recursive: true });
    const srcAbs = path.join(REPO_ROOT, FIXTURE_PKG_REL);
    fs.cpSync(srcAbs, path.join(pkgRoot, 'i-harness-source.h2ochat'), { recursive: true });
    generateConflictFreeFixture(srcAbs, path.join(pkgRoot, 'i-harness-import-ready-chat.h2ochat'), RDY_CHAT, RDY_SNAP);
    const restorePackages = {
      ready: { chat: 'k3-restore-ready-chat', snap: 'snap_k3_restore_ready' },
      confirm: { chat: 'k3-confirm-gate-chat', snap: 'snap_k3_confirm_gate' },
      conflictSnap: { chat: 'k3-conflict-snapshot-chat', snap: 'snap_k3_conflict_snapshot' },
      conflictChat: { chat: 'k3-conflict-chat', snap: 'snap_k3_conflict_chat' },
      tombstoned: { chat: 'k3-tombstoned-chat', snap: 'snap_k3_tombstoned' },
    };
    for (const info of Object.values(restorePackages)) {
      generateConflictFreeFixture(srcAbs, path.join(pkgRoot, info.chat + '.h2ochat'), info.chat, info.snap);
    }

    // wire globals + load real modules
    const mockInvoke = (cmd, a) => {
      const j = (p) => path.join(appDir, String(p || ''));
      try {
        if (cmd === 'plugin:fs|exists') return Promise.resolve(fs.existsSync(j(a.path)));
        if (cmd === 'plugin:fs|read_file') return Promise.resolve(Array.from(fs.readFileSync(j(a.path))));
        if (cmd === 'plugin:fs|read_dir') return Promise.resolve(fs.existsSync(j(a.path)) ? fs.readdirSync(j(a.path), { withFileTypes: true }).map((e) => ({ name: e.name, isDirectory: e.isDirectory(), isFile: e.isFile() })) : []);
        if (cmd === 'plugin:sql|select') return Promise.resolve(db.prepare(a.query).all(...(a.values || [])).map(normRow));
        if (cmd === 'plugin:sql|execute') {
          const verb = String(a.query).trim().split(/\s+/)[0].toUpperCase();
          const tbl = (String(a.query).match(/(?:INTO|UPDATE|FROM)\s+([a-z_]+)/i) || [])[1] || '';
          const r = db.prepare(a.query).run(...(a.values || []));
          writes.push(verb + ' ' + tbl + ' (' + r.changes + ')');
          return Promise.resolve([Number(r.changes), Number(r.lastInsertRowid)]);
        }
      } catch (e) { return Promise.reject(e); }
      return Promise.reject(new Error('unmocked invoke: ' + cmd));
    };
    globalThis.__TAURI_INTERNALS__ = { invoke: mockInvoke };
    if (!globalThis.crypto || !globalThis.crypto.subtle) globalThis.crypto = crypto.webcrypto;
    globalThis.window = undefined;
    globalThis.H2O = {};
    for (const m of STORE_MODULES) require(path.join(REPO_ROOT, 'src-surfaces-base/studio', m));
    const S = globalThis.H2O.Studio;
    const inspector = S.archiveInspector, importer = S.archiveImporter, restore = S.archiveRestore;
    assert.ok(inspector && importer && restore, 'real inspector + importer + restore must register');

    const counts = () => ({
      chats: db.prepare('SELECT count(*) c FROM chats').get().c,
      snapshots: db.prepare('SELECT count(*) c FROM snapshots').get().c,
      turns: db.prepare('SELECT count(*) c FROM snapshot_turns').get().c,
    });
    const rowSig = (tbl, id) => { const r = db.prepare('SELECT * FROM ' + tbl + ' WHERE id=?').get(id); return r ? crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16) : null; };

    const READY_REL = 'archive/packages/i-harness-import-ready-chat.h2ochat';
    const SRC_REL = 'archive/packages/i-harness-source.h2ochat';

    const before = counts();
    const srcChatSig = rowSig('chats', SRC_CHAT), srcSnapSig = rowSig('snapshots', SRC_SNAP);
    const readyDir = path.join(pkgRoot, 'i-harness-import-ready-chat.h2ochat');
    const readyFilesBefore = dirSig(readyDir);

    // import-ready path
    const insp = await inspector.inspectPackage({ packagePath: READY_REL });
    const w0 = writes.length;
    const dry = await importer.dryRunImportPackage({ packagePath: READY_REL });
    const dryWrites = writes.length - w0;
    const imp = await importer.importVerifiedPackage({ packagePath: READY_REL, mode: 'import-as-new' });
    const after = counts();
    const importWrites = writes.slice(w0 + dryWrites);

    const newSnapId = imp.recovered && imp.recovered.newSnapshotId;
    const newSnapRow = newSnapId ? db.prepare('SELECT id, chat_id, message_count, meta_json FROM snapshots WHERE id=?').get(newSnapId) : null;
    const newChatRow = imp.recovered && imp.recovered.newChatId ? db.prepare('SELECT id, title FROM chats WHERE id=?').get(imp.recovered.newChatId) : null;
    const newTurns = newSnapId ? db.prepare('SELECT count(*) c FROM snapshot_turns WHERE snapshot_id=?').get(newSnapId).c : 0;
    const prov = newSnapRow ? (JSON.parse(newSnapRow.meta_json || '{}').recovered || {}) : {};

    // already-imported path (source fixture, original ids seeded)
    const wAI = writes.length;
    const dryAI = await importer.dryRunImportPackage({ packagePath: SRC_REL });
    const impAI = await importer.importVerifiedPackage({ packagePath: SRC_REL, mode: 'import-as-new' });
    const aiWrites = writes.length - wAI;

    // K.3 restore-original-ids harness cases.
    const restoreRel = (info) => 'archive/packages/' + info.chat + '.h2ochat';
    const countTurnsFor = (snapId) => db.prepare('SELECT count(*) c FROM snapshot_turns WHERE snapshot_id=?').get(snapId).c;
    const getChat = (chatId) => db.prepare('SELECT * FROM chats WHERE id=?').get(chatId);
    const getSnap = (snapId) => db.prepare('SELECT * FROM snapshots WHERE id=?').get(snapId);
    const restoreBefore = counts();
    const restoreReadyDir = path.join(pkgRoot, restorePackages.ready.chat + '.h2ochat');
    const restoreReadyFilesBefore = dirSig(restoreReadyDir);
    const wRestoreReady = writes.length;
    const restoreReadyDry = await restore.dryRunRestorePackage({ packagePath: restoreRel(restorePackages.ready) });
    const restoreReadyDryWrites = writes.length - wRestoreReady;
    const restoreAction = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.ready), mode: 'restore-original-ids', confirm: true });
    const restoreReadyWrites = writes.slice(wRestoreReady + restoreReadyDryWrites);
    const restoreAfter = counts();
    const restoredChat = getChat(restorePackages.ready.chat);
    const restoredSnap = getSnap(restorePackages.ready.snap);
    const restoredTurns = countTurnsFor(restorePackages.ready.snap);
    const restoredChatMeta = restoredChat ? JSON.parse(restoredChat.meta_json || '{}') : {};
    const restoredSnapMeta = restoredSnap ? JSON.parse(restoredSnap.meta_json || '{}') : {};
    const restoreReadyFilesAfter = dirSig(restoreReadyDir);

    const wAlready = writes.length;
    const restoreAlready = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.ready), mode: 'restore-original-ids', confirm: true });
    const restoreAlreadyWrites = writes.length - wAlready;

    const confirmBefore = counts();
    const wConfirm = writes.length;
    const restoreConfirm = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.confirm), mode: 'restore-original-ids', confirm: false });
    const confirmAfter = counts();
    const confirmWrites = writes.length - wConfirm;

    db.prepare('INSERT INTO snapshots (id, chat_id, title, digest, message_count, meta_json) VALUES (?, ?, ?, ?, ?, ?)')
      .run(restorePackages.conflictSnap.snap, 'different-chat-for-conflict', 'Conflicting snapshot', 'different-digest', 0, '{}');
    const conflictSnapBefore = counts();
    const wConflictSnap = writes.length;
    const conflictSnapDry = await restore.dryRunRestorePackage({ packagePath: restoreRel(restorePackages.conflictSnap) });
    const conflictSnapAction = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.conflictSnap), mode: 'restore-original-ids', confirm: true });
    const conflictSnapAfter = counts();
    const conflictSnapWrites = writes.length - wConflictSnap;

    db.prepare('INSERT INTO chats (id, title, meta_json) VALUES (?, ?, ?)').run(restorePackages.conflictChat.chat, 'Existing conflict chat', '{}');
    const conflictChatBefore = counts();
    const wConflictChat = writes.length;
    const conflictChatDry = await restore.dryRunRestorePackage({ packagePath: restoreRel(restorePackages.conflictChat) });
    const conflictChatAction = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.conflictChat), mode: 'restore-original-ids', confirm: true });
    const conflictChatAfter = counts();
    const conflictChatWrites = writes.length - wConflictChat;

    db.prepare('INSERT INTO sync_tombstones (tombstone_id, record_kind, record_id, deleted_at, deleted_by_sync_peer_id, delete_reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('tombstone-' + restorePackages.tombstoned.chat, 'chat', restorePackages.tombstoned.chat, '2026-06-24T00:00:00.000Z', 'k3-harness', 'restore-test', '2026-06-24T00:00:00.000Z', '2026-06-24T00:00:00.000Z');
    const tombstoneBefore = counts();
    const tombstoneRowBefore = db.prepare('SELECT * FROM sync_tombstones WHERE record_id=?').get(restorePackages.tombstoned.chat);
    const tombstoneSigBefore = crypto.createHash('sha256').update(JSON.stringify(tombstoneRowBefore)).digest('hex');
    const wTombstone = writes.length;
    const tombstoneDry = await restore.dryRunRestorePackage({ packagePath: restoreRel(restorePackages.tombstoned) });
    const tombstoneAction = await restore.restoreVerifiedPackage({ packagePath: restoreRel(restorePackages.tombstoned), mode: 'restore-original-ids', confirm: true });
    const tombstoneAfter = counts();
    const tombstoneWrites = writes.length - wTombstone;
    const tombstoneRowAfter = db.prepare('SELECT * FROM sync_tombstones WHERE record_id=?').get(restorePackages.tombstoned.chat);
    const tombstoneSigAfter = crypto.createHash('sha256').update(JSON.stringify(tombstoneRowAfter)).digest('hex');

    const readyFilesAfter = dirSig(readyDir);
    const srcChatSigAfter = rowSig('chats', SRC_CHAT), srcSnapSigAfter = rowSig('snapshots', SRC_SNAP);
    const liveAfter = fs.existsSync(LIVE_DB) ? fs.statSync(LIVE_DB) : null;

    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });

    return {
      ok: true,
      pkg: { readyChat: RDY_CHAT, readySnap: RDY_SNAP, srcChat: SRC_CHAT, srcSnap: SRC_SNAP, srcMsgs: SRC_MSGS },
      inspect: { status: insp.status, ok: insp.ok, contentHashOk: insp.checks && insp.checks.contentHashOk, blockers: insp.blockers },
      dry: { decision: dry.decision, writes: dryWrites },
      import: { status: imp.status, newChatId: imp.recovered && imp.recovered.newChatId, newSnapshotId: newSnapId, originalChatId: imp.recovered && imp.recovered.originalChatId, originalSnapshotId: imp.recovered && imp.recovered.originalSnapshotId },
      newRows: { snapshot: !!newSnapRow, chat: !!newChatRow, turns: newTurns, chatTitle: newChatRow && newChatRow.title, provOriginalChatId: prov.originalChatId, provOriginalSnapshotId: prov.originalSnapshotId },
      delta: { chats: after.chats - before.chats, snapshots: after.snapshots - before.snapshots, turns: after.turns - before.turns },
      writeVerbs: importWrites,
      noUpdate: !importWrites.some((w) => w.startsWith('UPDATE')),
      unchanged: { srcChatRow: srcChatSig === srcChatSigAfter, srcSnapRow: srcSnapSig === srcSnapSigAfter, readyFiles: readyFilesBefore === readyFilesAfter },
      alreadyImported: { decision: dryAI.decision, importStatus: impAI.status, writes: aiWrites },
      restore: {
        ready: {
          dryDecision: restoreReadyDry.decision,
          dryWrites: restoreReadyDryWrites,
          status: restoreAction.status,
          chatId: restoreAction.restored && restoreAction.restored.chatId,
          snapshotId: restoreAction.restored && restoreAction.restored.snapshotId,
          turnCount: restoreAction.restored && restoreAction.restored.turnCount,
          delta: { chats: restoreAfter.chats - restoreBefore.chats, snapshots: restoreAfter.snapshots - restoreBefore.snapshots, turns: restoreAfter.turns - restoreBefore.turns },
          chatExists: !!restoredChat,
          snapshotExists: !!restoredSnap,
          turns: restoredTurns,
          provenanceChat: restoredChatMeta.restored || null,
          provenanceSnapshot: restoredSnapMeta.restored || null,
          writes: restoreReadyWrites,
          noUpdate: !restoreReadyWrites.some((w) => w.startsWith('UPDATE')),
          fixtureUnchanged: restoreReadyFilesBefore === restoreReadyFilesAfter,
        },
        alreadyPresent: { status: restoreAlready.status, writes: restoreAlreadyWrites },
        confirmGate: { status: restoreConfirm.status, writes: confirmWrites, delta: { chats: confirmAfter.chats - confirmBefore.chats, snapshots: confirmAfter.snapshots - confirmBefore.snapshots, turns: confirmAfter.turns - confirmBefore.turns } },
        conflictSnapshot: { dryDecision: conflictSnapDry.decision, status: conflictSnapAction.status, writes: conflictSnapWrites, delta: { chats: conflictSnapAfter.chats - conflictSnapBefore.chats - 0, snapshots: conflictSnapAfter.snapshots - conflictSnapBefore.snapshots, turns: conflictSnapAfter.turns - conflictSnapBefore.turns } },
        conflictChat: { dryDecision: conflictChatDry.decision, status: conflictChatAction.status, writes: conflictChatWrites, delta: { chats: conflictChatAfter.chats - conflictChatBefore.chats, snapshots: conflictChatAfter.snapshots - conflictChatBefore.snapshots, turns: conflictChatAfter.turns - conflictChatBefore.turns } },
        tombstoned: { dryDecision: tombstoneDry.decision, status: tombstoneAction.status, writes: tombstoneWrites, delta: { chats: tombstoneAfter.chats - tombstoneBefore.chats, snapshots: tombstoneAfter.snapshots - tombstoneBefore.snapshots, turns: tombstoneAfter.turns - tombstoneBefore.turns }, tombstoneUnchanged: tombstoneSigBefore === tombstoneSigAfter },
      },
      liveDb: { present: !!liveBefore, untouched: !liveBefore || (!!liveAfter && liveBefore.mtimeMs === liveAfter.mtimeMs && liveBefore.size === liveAfter.size), seedIsTemp: seedDbPath.startsWith(os.tmpdir()) },
    };
  } finally {
    try { if (db) db.close(); } catch (_) { /* already closed */ }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* best effort */ }
  }
}

let H = null, harnessError = null;
try { H = await runHarness(); } catch (e) { harnessError = e; }

check('[I.2] live harness built + ran without schema/trigger drift or build error', () => {
  assert.ok(!harnessError, 'harness error: ' + (harnessError && (harnessError.message || harnessError)));
  assert.ok(H && H.ok, 'no harness result');
});

check('[I.2] inspectPackage returns verified (real diagnostics + inspector, hashes pass)', () => {
  assert.ok(H, 'no harness');
  assert.equal(H.inspect.status, 'verified');
  assert.equal(H.inspect.ok, true);
  assert.equal(H.inspect.contentHashOk, true);
  assert.deepEqual(H.inspect.blockers || [], []);
});

check('[I.2] dryRunImportPackage returns import-ready with zero writes', () => {
  assert.ok(H);
  assert.equal(H.dry.decision, 'import-ready');
  assert.equal(H.dry.writes, 0);
});

check('[I.2] importVerifiedPackage returns imported; recovered chatId + snapshotId are FRESH', () => {
  assert.ok(H);
  assert.equal(H.import.status, 'imported');
  assert.ok(H.import.newChatId && H.import.newChatId !== H.pkg.readyChat, 'recovered chatId must be fresh');
  assert.ok(H.import.newSnapshotId && H.import.newSnapshotId !== H.pkg.readySnap, 'recovered snapshotId must be fresh + non-empty');
});

check('[I.2] provenance records the original package ids', () => {
  assert.ok(H);
  assert.equal(H.newRows.provOriginalChatId, H.pkg.readyChat);
  assert.equal(H.newRows.provOriginalSnapshotId, H.pkg.readySnap);
});

check('[I.2] DB deltas: chats +1, snapshots +1, turns +N (new rows present)', () => {
  assert.ok(H);
  assert.equal(H.delta.chats, 1, 'chats delta');
  assert.equal(H.delta.snapshots, 1, 'snapshots delta');
  assert.equal(H.delta.turns, H.pkg.srcMsgs, 'turns delta (+N)');
  assert.ok(H.newRows.snapshot && H.newRows.chat, 'new chat + snapshot rows present');
  assert.equal(H.newRows.turns, H.pkg.srcMsgs, 'new snapshot turn count');
});

check('[I.2] no-overwrite proof: import write verbs contain NO UPDATE', () => {
  assert.ok(H);
  assert.equal(H.noUpdate, true, 'write verbs: ' + JSON.stringify(H.writeVerbs));
  assert.ok(H.writeVerbs.some((w) => w.startsWith('INSERT chats')), 'expected INSERT chats');
  assert.ok(H.writeVerbs.some((w) => w.startsWith('INSERT snapshots')), 'expected INSERT snapshots');
});

check('[I.2] source rows + import-ready fixture files unchanged by the import (no overwrite)', () => {
  assert.ok(H);
  assert.equal(H.unchanged.srcChatRow, true, 'seeded source chat row must be unchanged');
  assert.equal(H.unchanged.srcSnapRow, true, 'seeded source snapshot row must be unchanged');
  assert.equal(H.unchanged.readyFiles, true, 'fixture files must be unchanged');
});

check('[I.2] already-imported package returns already-imported (dry-run) + no-op import (zero writes)', () => {
  assert.ok(H);
  assert.equal(H.alreadyImported.decision, 'already-imported');
  assert.equal(H.alreadyImported.importStatus, 'already-imported');
  assert.equal(H.alreadyImported.writes, 0);
});

check('[I.2] live Desktop DB untouched (seed DB is a temp file; live studio-v1.db never opened/mutated)', () => {
  assert.ok(H);
  assert.equal(H.liveDb.seedIsTemp, true, 'seed DB must be a temp file');
  assert.equal(H.liveDb.untouched, true, 'live studio-v1.db mtime/size must be unchanged (or absent in CI)');
});

// --- E. Restore-original-ids harness (K.3) ----------------------------------

check('[K.3] restore-ready dry-run returns restore-ready with zero writes', () => {
  assert.ok(H);
  assert.equal(H.restore.ready.dryDecision, 'restore-ready');
  assert.equal(H.restore.ready.dryWrites, 0);
});

check('[K.3] restoreVerifiedPackage restores original chatId + snapshotId and inserts snapshot_turns', () => {
  assert.ok(H);
  assert.equal(H.restore.ready.status, 'restored');
  assert.equal(H.restore.ready.chatId, 'k3-restore-ready-chat');
  assert.equal(H.restore.ready.snapshotId, 'snap_k3_restore_ready');
  assert.equal(H.restore.ready.chatExists, true);
  assert.equal(H.restore.ready.snapshotExists, true);
  assert.equal(H.restore.ready.turns, H.pkg.srcMsgs);
});

check('[K.3] restore DB delta is exactly +1 chat, +1 snapshot, +N turns; provenance recorded; fixture unchanged', () => {
  assert.ok(H);
  assert.deepEqual(H.restore.ready.delta, { chats: 1, snapshots: 1, turns: H.pkg.srcMsgs });
  assert.equal(H.restore.ready.provenanceChat.originalChatId, 'k3-restore-ready-chat');
  assert.equal(H.restore.ready.provenanceSnapshot.originalSnapshotId, 'snap_k3_restore_ready');
  assert.equal(H.restore.ready.fixtureUnchanged, true);
});

check('[K.3] restore no-overwrite proof: restore write verbs contain no UPDATE', () => {
  assert.ok(H);
  assert.equal(H.restore.ready.noUpdate, true, 'restore writes: ' + JSON.stringify(H.restore.ready.writes));
  assert.ok(H.restore.ready.writes.some((w) => w.startsWith('INSERT chats')), 'expected INSERT chats');
  assert.ok(H.restore.ready.writes.some((w) => w.startsWith('INSERT snapshots')), 'expected INSERT snapshots');
  assert.ok(H.restore.ready.writes.some((w) => w.startsWith('INSERT snapshot_turns')), 'expected INSERT snapshot_turns');
});

check('[K.3] confirm gate rejects restore without confirm and performs zero writes', () => {
  assert.ok(H);
  assert.equal(H.restore.confirmGate.status, 'rejected');
  assert.equal(H.restore.confirmGate.writes, 0);
  assert.deepEqual(H.restore.confirmGate.delta, { chats: 0, snapshots: 0, turns: 0 });
});

check('[K.3] second restore returns already-present and performs zero writes', () => {
  assert.ok(H);
  assert.equal(H.restore.alreadyPresent.status, 'already-present');
  assert.equal(H.restore.alreadyPresent.writes, 0);
});

check('[K.3] conflict-snapshot-id returns conflict without restore writes', () => {
  assert.ok(H);
  assert.equal(H.restore.conflictSnapshot.dryDecision, 'conflict-snapshot-id');
  assert.equal(H.restore.conflictSnapshot.status, 'conflict');
  assert.equal(H.restore.conflictSnapshot.writes, 0);
  assert.deepEqual(H.restore.conflictSnapshot.delta, { chats: 0, snapshots: 0, turns: 0 });
});

check('[K.3] conflict-chat-id returns conflict without restore writes', () => {
  assert.ok(H);
  assert.equal(H.restore.conflictChat.dryDecision, 'conflict-chat-id');
  assert.equal(H.restore.conflictChat.status, 'conflict');
  assert.equal(H.restore.conflictChat.writes, 0);
  assert.deepEqual(H.restore.conflictChat.delta, { chats: 0, snapshots: 0, turns: 0 });
});

check('[K.3] tombstoned returns tombstoned, performs zero writes, and leaves tombstone unchanged', () => {
  assert.ok(H);
  assert.equal(H.restore.tombstoned.dryDecision, 'tombstoned');
  assert.equal(H.restore.tombstoned.status, 'tombstoned');
  assert.equal(H.restore.tombstoned.writes, 0);
  assert.deepEqual(H.restore.tombstoned.delta, { chats: 0, snapshots: 0, turns: 0 });
  assert.equal(H.restore.tombstoned.tombstoneUnchanged, true);
});

// --- F. Evidence + deferrals -------------------------------------------------

check('[I.0] I.1 scaffold evidence exists (PASSED) and defers restore/relink/export', () => {
  assert.ok(exists(I1_EVIDENCE_REL));
  assert.match(i1, /I\.1 IMPORT RECOVERY HARNESS SCAFFOLD\s*[—-]\s*PASSED/);
  assert.match(i1, /restore ?\/ ?relink/i);
});

check('[I.2] I.2 runtime evidence exists, is marked PASSED, and keeps restore/relink/export deferred', () => {
  assert.ok(exists(I2_EVIDENCE_REL), 'I.2 evidence missing');
  assert.match(i2, /I\.2 IMPORT RECOVERY HARNESS\s*[—-]\s*PASSED/);
  assert.match(i2, /restore ?\/ ?relink/i);
  assert.match(i2, /defer/i);
});

check('[K.3] K.3 restore evidence exists and records PASSED harness/runtime proof', () => {
  assert.ok(exists(K3_EVIDENCE_REL), 'K.3 evidence missing');
  const k3 = readRepo(K3_EVIDENCE_REL);
  assert.match(k3, /PHASE K\.3[\s\S]*RESTORE ORIGINAL IDS HARNESS ?\/ ?RUNTIME SMOKE[\s\S]*PASSED/);
  assert.match(k3, /restore-ready/i);
  assert.match(k3, /conflict-snapshot-id/i);
  assert.match(k3, /conflict-chat-id/i);
  assert.match(k3, /tombstoned/i);
  assert.match(k3, /no-overwrite/i);
});

console.log('');
if (FAIL.length) {
  console.error(`[archive-import-recovery-harness] ${FAIL.length} failed, ${PASS.length} passed`);
  process.exit(1);
} else {
  console.log(`[archive-import-recovery-harness] PASS ${PASS.length} checks`);
  process.exit(0);
}
