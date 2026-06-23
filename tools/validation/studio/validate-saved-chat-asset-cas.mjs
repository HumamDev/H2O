#!/usr/bin/env node
// Validator for the Desktop asset CAS put/get module (Phase C C3.2).
//
// Loads src-surfaces-base/studio/ingestion/asset-cas.tauri.js into a Node VM
// with an in-memory Tauri fs shim and proves: byte-exact write/read roundtrip,
// content-addressed dedup (no second write), distinct hashes/paths, missing-blob
// handling, the locked path/baseDir layout, no remove/rename/GC, no registry/DB
// coupling, no sync/UI/import refs, and Tauri-gated (Chrome-light) behavior.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/ingestion/asset-cas.tauri.js';

const PASS = [];
const FAIL = [];
function check(label, fn) {
  try { fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
async function checkAsync(label, fn) {
  try { await fn(); PASS.push(label); console.log(`  ✓ ${label}`); }
  catch (e) { const m = e && e.message ? e.message : String(e); FAIL.push({ label, m }); console.log(`  ✗ ${label}`); console.log(`      ${m}`); }
}
function readRepo(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function sha256HexNode(bytes) { return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'); }

// In-memory Tauri fs shim. Records every invoked command + every path/baseDir
// so the validator can assert layout, dedup, and the absence of remove/rename.
function createFsShim() {
  const files = new Map();   // path -> number[]
  const dirs = new Set();
  const calls = [];          // { cmd, path, baseDir }
  const writes = [];         // paths written (to prove dedup skips the 2nd write)

  function requireBaseDir15(args, cmd) {
    const opts = (args && args.options) || {};
    if (opts.baseDir !== 15) throw new Error(`${cmd}: expected options.baseDir===15, got ${JSON.stringify(opts.baseDir)}`);
  }

  const invoke = async (cmd, args) => {
    const p = args && args.path;
    calls.push({ cmd, path: p, baseDir: args && args.options && args.options.baseDir });
    if (cmd === 'plugin:fs|exists') { requireBaseDir15(args, cmd); return files.has(p) || dirs.has(p); }
    if (cmd === 'plugin:fs|mkdir') {
      requireBaseDir15(args, cmd);
      if (!args.options || args.options.recursive !== true) throw new Error('mkdir: expected recursive:true');
      dirs.add(p); return true;
    }
    if (cmd === 'plugin:fs|write_file') {
      requireBaseDir15(args, cmd);
      if (!Array.isArray(args.contents)) throw new Error('write_file: contents must be a number[]');
      files.set(p, args.contents.slice()); writes.push(p); return null;
    }
    if (cmd === 'plugin:fs|read_file') {
      requireBaseDir15(args, cmd);
      if (!files.has(p)) throw new Error('not found: ' + p);
      return files.get(p).slice(); // return number[], like Tauri Vec<u8> over JSON
    }
    throw new Error('shim: unhandled invoke command: ' + cmd);
  };

  return { invoke, files, dirs, calls, writes };
}

function loadCas({ withTauri = true } = {}) {
  const shim = createFsShim();
  const context = {
    console,
    setTimeout,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Array,
    crypto: globalThis.crypto || crypto.webcrypto,
    H2O: {},
  };
  if (withTauri) context.__TAURI_INTERNALS__ = { invoke: shim.invoke };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  return { sandbox, shim, api: sandbox.H2O?.Studio?.ingestion?.assetCas };
}

async function main() {
  console.log('── Studio desktop asset CAS validator (C3.2) ────────────');

  // ── Static proofs ──────────────────────────────────────────────────
  check('module is Tauri-gated and has no registry/DB/sync/UI/import coupling', () => {
    const src = readRepo(MODULE_REL);
    assert.match(src, /if \(!detectTauri\(\)\) return;/, 'must be Tauri-gated');
    assert.doesNotMatch(src, /H2O\.Studio\.store/, 'must not reference the registry/store');
    assert.doesNotMatch(src, /plugin:sql/, 'must not touch SQLite');
    assert.doesNotMatch(src, /H2O\.Studio\.sync|webdav|relay|import-bundle|recovery|linkToTurn/i, 'no sync/import/linking');
    assert.doesNotMatch(src, /plugin:fs\|remove|plugin:fs\|rename|fs\|copy/i, 'no remove/rename/copy commands');
  });

  // ── Tauri-gated: Chrome light ──────────────────────────────────────
  check('does not register when Tauri is absent (Chrome stays light)', () => {
    const { api } = loadCas({ withTauri: false });
    assert.equal(api, undefined, 'assetCas must not register without Tauri');
  });

  const { api, shim } = loadCas();

  check('registers the required private Desktop API only (no remove/rename/gc)', () => {
    assert.ok(api, 'assetCas registered');
    for (const m of ['putAssetBytes', 'getAssetBytes', 'exists', 'describe', 'diagnoseAssetCas']) {
      assert.equal(typeof api[m], 'function', `missing ${m}`);
    }
    for (const banned of ['remove', 'delete', 'rename', 'gc', 'collect', 'purge']) {
      assert.equal(typeof api[banned], 'undefined', `must not expose ${banned}`);
    }
  });

  const helloBytes = new TextEncoder().encode('hello cas');
  const helloHex = sha256HexNode(helloBytes);
  const helloSha = 'sha256-' + helloHex;
  const expectPath = `archive/assets/${helloHex.slice(0, 2)}/sha256-${helloHex}`;
  let put1 = null;

  await checkAsync('putAssetBytes hashes, writes, returns sha256-<hex> identity + locked path', async () => {
    put1 = await api.putAssetBytes({ bytes: helloBytes, mimeType: 'image/png', ext: 'png', originalName: 'h.png', source: 'chatgpt-capture' });
    assert.equal(put1.sha256, helloSha, 'sha256 identity mismatch vs node crypto');
    assert.equal(put1.path, expectPath, 'path must be archive/assets/<aa>/sha256-<hex>');
    assert.equal(put1.deduped, false);
    assert.equal(put1.wrote, true);
    assert.equal(put1.byteLength, helloBytes.length);
    // echoes metadata for the future C4 caller (without persisting it)
    assert.equal(put1.mimeType, 'image/png');
    assert.equal(put1.ext, 'png');
  });

  await checkAsync('binary write/read roundtrip is byte-exact', async () => {
    const got = await api.getAssetBytes(helloSha);
    assert.ok(got instanceof Uint8Array, 'getAssetBytes must return a Uint8Array');
    assert.deepEqual([...got], [...helloBytes], 'roundtrip bytes differ');
  });

  await checkAsync('same bytes → same sha256 + same path; second put dedupes (no 2nd write)', async () => {
    const writesBefore = shim.writes.length;
    const put2 = await api.putAssetBytes({ bytes: new TextEncoder().encode('hello cas') });
    assert.equal(put2.sha256, helloSha);
    assert.equal(put2.path, expectPath);
    assert.equal(put2.deduped, true);
    assert.equal(put2.wrote, false);
    assert.equal(shim.writes.length, writesBefore, 'dedup must not call write_file again');
  });

  await checkAsync('different bytes → different sha256 + different path', async () => {
    const other = await api.putAssetBytes({ bytes: new TextEncoder().encode('different content') });
    assert.notEqual(other.sha256, helloSha);
    assert.notEqual(other.path, expectPath);
    assert.match(other.path, /^archive\/assets\/[0-9a-f]{2}\/sha256-[0-9a-f]{64}$/);
  });

  await checkAsync('unknown sha256 → exists:false, getAssetBytes:null, describe.exists:false', async () => {
    const unknown = 'sha256-' + 'f'.repeat(64);
    assert.equal(await api.exists(unknown), false);
    assert.equal(await api.getAssetBytes(unknown), null);
    const d = await api.describe(unknown);
    assert.equal(d.exists, false);
    assert.equal(d.byteLength, null);
    assert.equal(d.path, `archive/assets/ff/sha256-${'f'.repeat(64)}`);
  });

  await checkAsync('describe of an existing blob reports fs-level info', async () => {
    const d = await api.describe(helloSha);
    assert.equal(d.exists, true);
    assert.equal(d.sha256, helloSha);
    assert.equal(d.byteLength, helloBytes.length);
  });

  check('all fs calls use baseDir 15 and the archive/assets layout; none touch the sync folder', () => {
    assert.ok(shim.calls.length > 0);
    for (const c of shim.calls) {
      assert.equal(c.baseDir, 15, `fs call ${c.cmd} did not use baseDir 15`);
      assert.doesNotMatch(String(c.path || ''), /H2O Studio Sync/, 'must not touch the sync folder');
      assert.match(String(c.path || ''), /^archive\/assets(\/|$)/, `unexpected path: ${c.path}`);
    }
  });

  check('only exists/mkdir/write_file/read_file commands were invoked (no remove/rename/gc)', () => {
    const cmds = [...new Set(shim.calls.map((c) => c.cmd))].sort();
    assert.deepEqual(cmds, ['plugin:fs|exists', 'plugin:fs|mkdir', 'plugin:fs|read_file', 'plugin:fs|write_file']);
  });

  check('diagnoseAssetCas reports sane status', () => {
    const d = api.diagnoseAssetCas();
    assert.equal(d.installed, true);
    assert.equal(d.desktopOnly, true);
    assert.equal(d.baseDir, 15);
    assert.equal(d.casRoot, 'archive/assets');
    assert.equal(d.registryCoupled, false);
    assert.equal(d.mutatesDb, false);
    assert.equal(d.gcEnabled, false);
    assert.equal(d.removeRenameExposed, false);
    assert.ok(d.writeCount >= 1 && d.dedupeCount >= 1);
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
