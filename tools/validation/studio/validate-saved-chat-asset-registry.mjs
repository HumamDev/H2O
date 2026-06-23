#!/usr/bin/env node
// Validator for Studio Desktop saved-chat asset registry substrate (Phase C C2b).
//
// Loads src-surfaces-base/studio/store/index.js + store/assets.tauri.js into a
// Node VM with a small in-memory SQL shim that emulates the `assets` and
// `snapshot_turn_assets` tables (Migration v14). Proves the adapter's
// registration, upsert/get round-trip, turn linking, dedup, authoritative
// refcount recompute, unlink, and listBySnapshot ordering — and statically
// proves no CAS file IO / sync / import / UI slipped into the substrate.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const INDEX_REL = 'src-surfaces-base/studio/store/index.js';
const MODULE_REL = 'src-surfaces-base/studio/store/assets.tauri.js';
const LIB_RS_REL = 'apps/studio/desktop/src-tauri/src/lib.rs';
const STUDIO_HTML_REL = 'src-surfaces-base/studio/studio.html';
const PACK_REL = 'tools/product/studio/pack-studio.mjs';

const PASS = [];
const FAIL = [];

function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (error) { const m = error && error.message ? error.message : String(error); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (error) { const m = error && error.message ? error.message : String(error); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

// ── In-memory SQL shim ──────────────────────────────────────────────────
// Emulates exactly the queries store/assets.tauri.js emits. Records the set of
// table names touched so the test can prove only the two C2b tables are used.
function createSqlShim() {
  const assets = new Map();              // sha256 -> row (snake_case columns)
  const sta = new Map();                 // `${snapshot}|${turn}|${sha}` -> row
  const tablesTouched = new Set();
  const staKey = (s, t, h) => `${s}|${t}|${h}`;

  function select(query, values) {
    const v = values || [];
    if (/FROM snapshot_turn_assets sta JOIN assets a/.test(query)) {
      tablesTouched.add('snapshot_turn_assets'); tablesTouched.add('assets');
      const snapshotId = v[0];
      const out = [];
      for (const row of sta.values()) {
        if (row.snapshot_id !== snapshotId) continue;
        const a = assets.get(row.sha256);
        if (!a) continue; // JOIN drops unmatched
        out.push({ ...a, turn_idx: row.turn_idx, relation: row.relation });
      }
      out.sort((x, y) => (x.turn_idx - y.turn_idx) || String(x.sha256).localeCompare(String(y.sha256)));
      return out;
    }
    if (/SELECT COUNT\(\*\) AS n FROM assets/.test(query)) {
      tablesTouched.add('assets');
      return [{ n: assets.size }];
    }
    if (/SELECT refcount FROM assets WHERE sha256/.test(query)) {
      tablesTouched.add('assets');
      const a = assets.get(v[0]);
      return a ? [{ refcount: a.refcount }] : [];
    }
    if (/SELECT \* FROM assets WHERE sha256/.test(query)) {
      tablesTouched.add('assets');
      const a = assets.get(v[0]);
      return a ? [{ ...a }] : [];
    }
    if (/SELECT \* FROM assets ORDER BY/.test(query)) {
      tablesTouched.add('assets');
      return [...assets.values()].map((a) => ({ ...a })).sort((x, y) => String(x.sha256).localeCompare(String(y.sha256)));
    }
    throw new Error('shim: unhandled SELECT: ' + query);
  }

  function execute(query, values) {
    const v = values || [];
    if (/INSERT INTO assets/.test(query) && /ON CONFLICT\(sha256\)/.test(query)) {
      tablesTouched.add('assets');
      // values are 7 params; refcount is the SQL literal 0 (not a param), so
      // meta_json is v[6].
      const [sha256, mime_type, ext, byte_size, created_at, updated_at, meta_json] = v;
      const existing = assets.get(sha256);
      if (existing) {
        existing.mime_type = mime_type; existing.ext = ext; existing.byte_size = byte_size;
        existing.meta_json = meta_json; existing.updated_at = updated_at; // created_at + refcount preserved
      } else {
        assets.set(sha256, { sha256, mime_type, ext, byte_size, created_at, updated_at, refcount: 0, meta_json });
      }
      return [1, 0];
    }
    if (/UPDATE assets SET refcount =/.test(query)) {
      tablesTouched.add('assets'); tablesTouched.add('snapshot_turn_assets');
      const sha256 = v[0]; const updated_at = v[1];
      const a = assets.get(sha256);
      if (!a) return [0, 0];
      let n = 0; for (const row of sta.values()) if (row.sha256 === sha256) n += 1;
      a.refcount = n; a.updated_at = updated_at;
      return [1, 0];
    }
    if (/INSERT OR IGNORE INTO snapshot_turn_assets/.test(query)) {
      tablesTouched.add('snapshot_turn_assets');
      const [snapshot_id, turn_idx, sha256, relation, created_at, meta_json] = v;
      const k = staKey(snapshot_id, turn_idx, sha256);
      if (sta.has(k)) return [0, 0]; // IGNORE
      sta.set(k, { snapshot_id, turn_idx, sha256, relation, created_at, meta_json });
      return [1, 0];
    }
    if (/DELETE FROM snapshot_turn_assets WHERE/.test(query)) {
      tablesTouched.add('snapshot_turn_assets');
      const k = staKey(v[0], v[1], v[2]);
      const had = sta.delete(k);
      return [had ? 1 : 0, 0];
    }
    throw new Error('shim: unhandled EXECUTE: ' + query);
  }

  const invoke = async (cmd, args) => {
    const { query, values } = args || {};
    if (cmd === 'plugin:sql|select') return select(query, values);
    if (cmd === 'plugin:sql|execute') return execute(query, values);
    throw new Error('shim: unhandled invoke: ' + cmd);
  };

  return { invoke, assets, sta, tablesTouched };
}

function loadAdapter() {
  const shim = createSqlShim();
  const context = {
    console,
    setTimeout,
    JSON,
    Set,
    Number,
    __TAURI_INTERNALS__: { invoke: shim.invoke },
    H2O: { Studio: { platform: { __sqliteStatus: () => ({ backend: 'sqlite', ready: true }) } } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(INDEX_REL), sandbox, { filename: INDEX_REL });
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  const store = sandbox.H2O?.Studio?.store;
  if (!store || !store.assets) throw new Error('store.assets did not register');
  return { store, assets: store.assets, shim };
}

async function main() {
  console.log('── Studio saved-chat asset registry validator (C2b) ─────');

  // ── Static proofs ──────────────────────────────────────────────────
  check('migration v14 adds assets + snapshot_turn_assets tables + sha256 index', () => {
    const src = readRepo(LIB_RS_REL);
    assert.match(src, /version:\s*14/, 'migration version 14 missing');
    assert.match(src, /CREATE TABLE IF NOT EXISTS assets/, 'assets table missing');
    assert.match(src, /CREATE TABLE IF NOT EXISTS snapshot_turn_assets/, 'snapshot_turn_assets table missing');
    assert.match(src, /PRIMARY KEY \(snapshot_id, turn_idx, sha256\)/, 'join PK missing');
    assert.match(src, /idx_snapshot_turn_assets_sha256/, 'sha256 index missing');
  });

  check('adapter is desktop-gated substrate with no CAS file IO / sync / import', () => {
    const src = readRepo(MODULE_REL);
    assert.match(src, /if \(!detectTauri\(\)\) return;/, 'missing Tauri gate');
    assert.doesNotMatch(src, /plugin:fs\||writeFile|readFile|read_text_file|write_text_file|mkdir|BaseDirectory/i, 'must not touch filesystem/CAS');
    assert.doesNotMatch(src, /H2O\.Studio\.sync|webdav|relay|import-bundle|recovery/i, 'must not touch sync/import/recovery');
    assert.match(src, /plugin:sql\|select/, 'should read via plugin:sql');
    assert.match(src, /plugin:sql\|execute/, 'should write via plugin:sql');
  });

  check('loader + pack list expose the Desktop-only adapter after snapshots', () => {
    const html = readRepo(STUDIO_HTML_REL);
    const pack = readRepo(PACK_REL);
    assert.match(html, /store\/assets\.tauri\.js/, 'studio.html missing assets adapter');
    assert.match(pack, /store\/assets\.tauri\.js/, 'pack list missing assets adapter');
    assert.ok(html.indexOf('store/snapshots.tauri.js') < html.indexOf('store/assets.tauri.js'), 'assets must load after snapshots');
  });

  // ── Behavioral proofs ──────────────────────────────────────────────
  const { store, assets, shim } = loadAdapter();

  check('registers under H2O.Studio.store.assets with required surface', () => {
    for (const m of ['upsert', 'get', 'listBySnapshot', 'linkToTurn', 'unlinkFromTurn', 'diagnose', 'recountRefs']) {
      assert.equal(typeof assets[m], 'function', `missing ${m}`);
    }
    assert.ok(store.listEntities().includes('assets'));
  });

  const SHA = 'sha256-' + 'a'.repeat(64);

  await checkAsync('upsert then get round-trips a registry row (refcount starts 0)', async () => {
    const out = await assets.upsert({ sha256: SHA, mimeType: 'image/png', ext: 'png', byteSize: 1234, meta: { originalName: 'pic.png' } });
    assert.equal(out.sha256, SHA);
    assert.equal(out.mimeType, 'image/png');
    assert.equal(out.byteSize, 1234);
    assert.equal(out.refcount, 0);
    const got = await assets.get(SHA);
    assert.equal(got.ext, 'png');
    assert.deepEqual(got.meta, { originalName: 'pic.png' });
  });

  await checkAsync('linkToTurn recomputes refcount; dedup across turns counts links not blobs', async () => {
    const r0 = await assets.linkToTurn({ snapshotId: 'snap_1', turnIdx: 0, sha256: SHA });
    assert.equal(r0.refcount, 1);
    const r1 = await assets.linkToTurn({ snapshotId: 'snap_1', turnIdx: 1, sha256: SHA, relation: 'inline' });
    assert.equal(r1.refcount, 2, 'same blob linked to two turns ⇒ refcount 2');
    assert.equal(shim.assets.size, 1, 'still a single deduped blob row');
    assert.equal((await assets.get(SHA)).refcount, 2);
  });

  await checkAsync('idempotent link (INSERT OR IGNORE) does not double-count', async () => {
    const again = await assets.linkToTurn({ snapshotId: 'snap_1', turnIdx: 0, sha256: SHA });
    assert.equal(again.refcount, 2, 'relinking same (snapshot,turn,sha) keeps refcount at 2');
  });

  await checkAsync('listBySnapshot returns linked assets ordered by turn', async () => {
    // link to a later snapshot out of order to prove ORDER BY turn_idx
    await assets.linkToTurn({ snapshotId: 'snap_2', turnIdx: 5, sha256: SHA });
    await assets.linkToTurn({ snapshotId: 'snap_2', turnIdx: 2, sha256: SHA });
    const list = await assets.listBySnapshot('snap_2');
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((a) => a.turnIdx), [2, 5], 'ordered by turn_idx');
    assert.equal(list[0].sha256, SHA);
    assert.equal(list[0].relation, 'inline');
  });

  await checkAsync('upsert on existing sha256 preserves created_at + refcount, updates metadata', async () => {
    const before = await assets.get(SHA);
    const refBefore = before.refcount;
    const createdBefore = before.createdAt;
    const updated = await assets.upsert({ sha256: SHA, mimeType: 'image/webp', ext: 'webp', byteSize: 999 });
    assert.equal(updated.mimeType, 'image/webp', 'metadata updated');
    assert.equal(updated.refcount, refBefore, 'refcount preserved by upsert');
    assert.equal(updated.createdAt, createdBefore, 'created_at preserved by upsert');
  });

  await checkAsync('unlinkFromTurn recomputes refcount downward', async () => {
    const res = await assets.unlinkFromTurn({ snapshotId: 'snap_1', turnIdx: 1, sha256: SHA });
    assert.equal(res.removed, true);
    // remaining links: snap_1/turn0, snap_2/turn5, snap_2/turn2  ⇒ 3
    assert.equal(res.refcount, 3);
    assert.equal((await assets.get(SHA)).refcount, 3);
  });

  check('only the two C2b tables were ever touched (no CAS/sync/other tables)', () => {
    assert.deepEqual([...shim.tablesTouched].sort(), ['assets', 'snapshot_turn_assets']);
  });

  check('diagnose reports substrate boundaries', () => {
    const d = assets.diagnose();
    assert.equal(d.installed, true);
    assert.equal(d.casImplemented, false);
    assert.deepEqual([...d.tables], ['assets', 'snapshot_turn_assets']); // spread: normalize cross-realm array
    assert.match(d.refcountModel, /recomputed/);
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

await main();
