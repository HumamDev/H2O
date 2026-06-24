#!/usr/bin/env node
// Validator for C4.3 saved-chat package filesystem writes.
//
// Loads the shared sanitizer, C4.1 asset materializer, and package projector
// into a Node VM. The VM provides mocked store adapters, a mocked live CAS, and
// a strict tauri-plugin-fs v2 invoke shim. The shim rejects text-file writes and
// records every path/baseDir/order so this validator can prove package writes
// are app-owned, binary, asset-first, and fail closed when CAS bytes are missing.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const SANITIZER_REL = 'src-surfaces-base/studio/platform/html-sanitizer.js';
const MATERIALIZER_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-assets.tauri.js';
const PROJECTOR_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js';

const APP_LOCAL_DATA = 15;
const PACKAGE_ROOT = 'archive/packages';

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
function sha256Hex(bytes) { return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'); }
function decode(bytes) { return new TextDecoder().decode(bytes); }

const PNG_BYTES = Buffer.from('package-image-bytes');
const PNG_B64 = PNG_BYTES.toString('base64');
const PNG_SHA = 'sha256-' + sha256Hex(PNG_BYTES);
const PNG_PATH = `assets/${PNG_SHA}.png`;

function createStrictFs() {
  const dirs = new Set();
  const files = new Map();
  const calls = [];
  const writes = [];
  const removes = [];

  function parseWriteHeaders(meta) {
    const headers = meta?.headers || {};
    if (!headers.path) throw new Error('write_file: missing file path header');
    const p = decodeURIComponent(headers.path);
    let options = {};
    try { options = JSON.parse(headers.options || '{}'); }
    catch (_) { throw new Error('write_file: options header must be JSON'); }
    if (options.baseDir !== APP_LOCAL_DATA) throw new Error(`write_file: expected baseDir 15, got ${JSON.stringify(options.baseDir)}`);
    return { path: p, options };
  }

  function requireOptions(args, cmd) {
    const p = args?.path;
    const options = args?.options || {};
    if (options.baseDir !== APP_LOCAL_DATA) throw new Error(`${cmd}: expected baseDir 15, got ${JSON.stringify(options.baseDir)}`);
    if (String(p || '').includes('H2O Studio Sync')) throw new Error(`${cmd}: sync folder path forbidden`);
    return { path: p, options };
  }

  async function invoke(cmd, args, meta) {
    if (cmd === 'plugin:fs|write_text_file') throw new Error('write_text_file is forbidden for saved-chat package writes');

    if (cmd === 'plugin:fs|exists') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      return dirs.has(p) || files.has(p);
    }

    if (cmd === 'plugin:fs|mkdir') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      dirs.add(p);
      return true;
    }

    if (cmd === 'plugin:fs|remove') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      removes.push({ path: p, baseDir: options.baseDir });
      dirs.delete(p);
      for (const key of [...files.keys()]) if (key === p || key.startsWith(p + '/')) files.delete(key);
      for (const key of [...dirs.keys()]) if (key.startsWith(p + '/')) dirs.delete(key);
      return true;
    }

    if (cmd === 'plugin:fs|read_file') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      if (!files.has(p)) throw new Error('not found: ' + p);
      return files.get(p);
    }

    if (cmd === 'plugin:fs|write_file') {
      const { path: p, options } = parseWriteHeaders(meta);
      if (!(args instanceof Uint8Array)) throw new Error('write_file body must be Uint8Array');
      if (p.includes('H2O Studio Sync')) throw new Error('write_file: sync folder path forbidden');
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      const copy = new Uint8Array(args);
      files.set(p, copy);
      writes.push({ path: p, baseDir: options.baseDir, bytes: copy });
      return true;
    }

    throw new Error('unexpected fs command: ' + cmd);
  }

  return { invoke, dirs, files, calls, writes, removes };
}

function createStores({ withImage }) {
  const chatId = withImage ? 'chat_v2_write' : 'chat_v1_write';
  const snapshotId = withImage ? 'snap_v2_write' : 'snap_v1_write';
  const img = `<img src="data:image/png;base64,${PNG_B64}">`;
  const turns = withImage
    ? [{ turnIdx: 0, role: 'user', outerHtml: `<p>image ${img}</p>`, text: 'image', meta: { messageId: 'm0' } }]
    : [{ turnIdx: 0, role: 'user', outerHtml: '<p>plain</p>', text: 'plain', meta: { messageId: 'm0' } }];
  const snapshot = {
    snapshotId,
    chatId,
    title: withImage ? 'V2 write' : 'V1 write',
    capturedAt: Date.parse('2026-06-24T00:00:00.000Z'),
    updatedAt: Date.parse('2026-06-24T00:01:00.000Z'),
    meta: {},
  };
  const chat = { chatId, title: snapshot.title, isSaved: true, isLinked: true };
  const registry = { upserts: [], links: [], api: {
    upsert: async (row) => { registry.upserts.push(row); return row; },
    linkToTurn: async (row) => { registry.links.push(row); return { ok: true, ...row }; },
  } };
  return {
    ids: { chatId, snapshotId },
    registry,
    stores: {
      chats: { get: async (id) => (id === chatId ? { ...chat } : null) },
      snapshots: {
        listByChat: async (id) => (id === chatId ? [{ ...snapshot }] : []),
        get: async (id) => (id === snapshotId ? { snapshot: { ...snapshot }, turns: turns.map((t) => ({ ...t, meta: { ...t.meta } })) } : null),
      },
      folders: { listForChat: async () => [] },
      categories: { getForChat: async () => null },
      labels: { listForChat: async () => [] },
      tags: { listForChat: async () => [] },
      assets: registry.api,
    },
  };
}

function createCas({ missingOnGet = false } = {}) {
  const bytesBySha = new Map();
  const puts = [];
  const gets = [];
  return {
    puts,
    gets,
    api: {
      putAssetBytes: async ({ bytes, mimeType, ext }) => {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        const sha256 = 'sha256-' + sha256Hex(u8);
        puts.push({ sha256, mimeType, ext, byteLength: u8.length });
        bytesBySha.set(sha256, new Uint8Array(u8));
        return {
          sha256,
          path: `archive/assets/${sha256.slice('sha256-'.length, 'sha256-'.length + 2)}/${sha256}`,
          byteLength: u8.length,
          mimeType,
          ext,
          deduped: false,
          wrote: true,
        };
      },
      getAssetBytes: async (sha256) => {
        gets.push(sha256);
        if (missingOnGet) return null;
        return bytesBySha.get(sha256) || null;
      },
    },
  };
}

function loadProjector({ withImage, missingOnGet = false }) {
  const stores = createStores({ withImage });
  const cas = createCas({ missingOnGet });
  const strictFs = createStrictFs();
  const context = {
    console,
    setTimeout,
    URL,
    atob: globalThis.atob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    crypto: globalThis.crypto || crypto.webcrypto,
    __TAURI_INTERNALS__: { invoke: strictFs.invoke },
    H2O: { Studio: { store: stores.stores, ingestion: { assetCas: cas.api } } },
    chrome: { runtime: { id: 'desktop-test', getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }) } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });
  vm.runInContext(readRepo(MATERIALIZER_REL), sandbox, { filename: MATERIALIZER_REL });
  vm.runInContext(readRepo(PROJECTOR_REL), sandbox, { filename: PROJECTOR_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (!ingestion || typeof ingestion.writeSavedChatPackageV1 !== 'function') throw new Error('projector did not register');
  return { ingestion, stores, cas, fs: strictFs };
}

function textWrites(fsShim) {
  return fsShim.writes.filter((w) => /\/(manifest\.json|snapshot\.json|chat\.md|chat\.html)$/.test(w.path));
}

function assetWrites(fsShim) {
  return fsShim.writes.filter((w) => /\/assets\/sha256-[0-9a-f]{64}\.[a-z0-9]+$/.test(w.path));
}

function assertAllAppLocalData(fsShim) {
  for (const call of fsShim.calls) assert.equal(call.baseDir, APP_LOCAL_DATA, `${call.cmd} ${call.path} did not use baseDir 15`);
}

function assertNoSyncPath(fsShim) {
  for (const call of fsShim.calls) assert.doesNotMatch(call.path || '', /H2O Studio Sync|\$HOME/i);
}

async function main() {
  console.log('── Studio saved-chat package v2 write validator (C4.3) ───');

  check('source has no user-folder dialog, sync, import, or WebDAV coupling', () => {
    const src = readRepo(PROJECTOR_REL)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(src, /showSave|saveDialog|openDialog|dialog\.save|dialog\.open/i);
    assert.doesNotMatch(src, /H2O\.Studio\.sync|H2O\.Desktop\.Sync|webdav|importBundle|import-bundle/i);
    assert.doesNotMatch(src, /write_text_file|writeTextFile/i);
    assert.match(src, /APP_LOCAL_DATA\s*=\s*15/);
    assert.match(src, /PACKAGE_ROOT\s*=\s*'archive\/packages'/);
  });

  let v1Env = null;
  await checkAsync('v1 asset-less write emits only four binary package files under archive/packages', async () => {
    v1Env = loadProjector({ withImage: false });
    const out = await v1Env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write' });
    assert.equal(out.packagePath, 'archive/packages/chat_v1_write.h2ochat');
    assert.equal(out.paths.assets, '');
    const writes = v1Env.fs.writes.map((w) => w.path).sort();
    assert.deepEqual(writes, [
      'archive/packages/chat_v1_write.h2ochat/chat.html',
      'archive/packages/chat_v1_write.h2ochat/chat.md',
      'archive/packages/chat_v1_write.h2ochat/manifest.json',
      'archive/packages/chat_v1_write.h2ochat/snapshot.json',
    ].sort());
    assert.equal(v1Env.fs.dirs.has('archive/packages/chat_v1_write.h2ochat/assets'), false);
    assertAllAppLocalData(v1Env.fs);
    assertNoSyncPath(v1Env.fs);
  });

  await checkAsync('writer rejects arbitrary targetDir / targetFolder options', async () => {
    const env = loadProjector({ withImage: false });
    await assert.rejects(
      () => env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write', targetDir: '/tmp/user-selected' }),
      /targetDir\/targetFolder is deferred/
    );
    assert.deepEqual(env.fs.writes, []);
  });

  let v2Env = null;
  await checkAsync('v2 asset-bearing write copies CAS asset before text files', async () => {
    v2Env = loadProjector({ withImage: true });
    const out = await v2Env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v2_write' });
    assert.equal(out.schemaVersion, 2);
    assert.equal(out.packagePath, 'archive/packages/chat_v2_write.h2ochat');
    assert.equal(out.writtenAssets.length, 1);
    assert.equal(out.writtenAssets[0].relativePath, PNG_PATH);
    const writes = v2Env.fs.writes;
    assert.ok(writes.length >= 5, 'asset + four package files expected');
    assert.match(writes[0].path, new RegExp(`^archive/packages/chat_v2_write\\.h2ochat/${PNG_PATH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    assert.equal(textWrites(v2Env.fs).length, 4);
    assert.equal(assetWrites(v2Env.fs).length, 1);
    assert.ok(v2Env.cas.gets.includes(PNG_SHA), 'write must read asset bytes from live CAS');
    assertAllAppLocalData(v2Env.fs);
    assertNoSyncPath(v2Env.fs);
  });

  check('v2 manifest.assets[] path matches written package asset path', () => {
    const manifestBytes = v2Env.fs.files.get('archive/packages/chat_v2_write.h2ochat/manifest.json');
    const manifest = JSON.parse(decode(manifestBytes));
    assert.equal(manifest.assets.length, 1);
    assert.equal(manifest.assets[0].sha256, PNG_SHA);
    assert.equal(manifest.assets[0].path, PNG_PATH);
    assert.equal(v2Env.fs.files.has(`archive/packages/chat_v2_write.h2ochat/${PNG_PATH}`), true);
  });

  await checkAsync('missing CAS asset fails before manifest/snapshot/renderers are written', async () => {
    const env = loadProjector({ withImage: true, missingOnGet: true });
    await assert.rejects(
      () => env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v2_write' }),
      /missing CAS asset/
    );
    assert.equal(textWrites(env.fs).length, 0, 'text files must not be written after missing asset failure');
    assert.equal(assetWrites(env.fs).length, 0, 'asset copy must not be written when CAS read returns null');
    assertAllAppLocalData(env.fs);
  });

  await checkAsync('overwrite defaults to fail-if-existing', async () => {
    await assert.rejects(
      () => v1Env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write' }),
      /already exists/
    );
  });

  await checkAsync('explicit overwrite removes only guarded .h2ochat package path', async () => {
    const out = await v1Env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write', overwrite: true });
    assert.equal(out.written, true);
    assert.ok(v1Env.fs.removes.length >= 1, 'overwrite should remove old package before rewrite');
    const last = v1Env.fs.removes[v1Env.fs.removes.length - 1];
    assert.equal(last.path, 'archive/packages/chat_v1_write.h2ochat');
    assert.match(last.path, /\.h2ochat$/);
    assert.equal(last.baseDir, APP_LOCAL_DATA);
  });

  check('write_file body+headers form was used for all package file writes', () => {
    for (const env of [v1Env, v2Env]) {
      for (const w of env.fs.writes) {
        assert.equal(w.baseDir, APP_LOCAL_DATA);
        assert.ok(w.bytes instanceof Uint8Array);
      }
      assert.equal(env.fs.calls.some((c) => c.cmd === 'plugin:fs|write_text_file'), false);
    }
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
