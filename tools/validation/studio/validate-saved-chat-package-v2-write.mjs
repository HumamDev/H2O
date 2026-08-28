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
const CODEC_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-codec.tauri.js';
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

// A distinct second asset, so a fixture can place corruption BEHIND a good one.
const PNG2_BYTES = Buffer.from('second-package-image-bytes');
const PNG2_B64 = PNG2_BYTES.toString('base64');
const PNG2_SHA = 'sha256-' + sha256Hex(PNG2_BYTES);

function createStrictFs({ failWritePath = '' } = {}) {
  const dirs = new Set();
  const files = new Map();
  const calls = [];
  const writes = [];
  const removes = [];
  const lstatOverrides = new Map();
  const controls = { failWritePath };

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

    if (cmd === 'plugin:fs|lstat') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      if (lstatOverrides.has(p)) return { ...lstatOverrides.get(p) };
      if (files.has(p)) return { isFile: true, isSymlink: false, size: files.get(p).byteLength };
      if (dirs.has(p)) return { isFile: false, isDirectory: true, isSymlink: false, size: 0 };
      throw new Error('not found: ' + p);
    }

    if (cmd === 'plugin:fs|read_dir') {
      const { path: p, options } = requireOptions(args, cmd);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      if (!dirs.has(p)) throw new Error('not found: ' + p);
      const prefix = p.replace(/\/$/, '') + '/';
      const names = new Map();
      for (const dir of dirs) {
        if (!dir.startsWith(prefix)) continue;
        const rest = dir.slice(prefix.length);
        if (rest && !rest.includes('/')) names.set(rest, { name: rest, isDirectory: true });
      }
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        if (rest && !rest.includes('/')) names.set(rest, { name: rest, isFile: true });
      }
      return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    if (cmd === 'plugin:fs|write_file') {
      const { path: p, options } = parseWriteHeaders(meta);
      if (!(args instanceof Uint8Array)) throw new Error('write_file body must be Uint8Array');
      if (p.includes('H2O Studio Sync')) throw new Error('write_file: sync folder path forbidden');
      if (controls.failWritePath && p.endsWith(controls.failWritePath)) throw new Error('injected write failure: ' + controls.failWritePath);
      calls.push({ cmd, path: p, baseDir: options.baseDir });
      const copy = new Uint8Array(args);
      files.set(p, copy);
      writes.push({ path: p, baseDir: options.baseDir, bytes: copy });
      return true;
    }

    throw new Error('unexpected fs command: ' + cmd);
  }

  return { invoke, dirs, files, calls, writes, removes, lstatOverrides, controls };
}

function createStores({ withImage, turnText = '', secondImage = false }) {
  const chatId = withImage ? 'chat_v2_write' : 'chat_v1_write';
  const snapshotId = withImage ? 'snap_v2_write' : 'snap_v1_write';
  const img = `<img src="data:image/png;base64,${PNG_B64}">`;
  const plainText = turnText || 'plain';
  const img2 = `<img src="data:image/png;base64,${PNG2_B64}">`;
  const bothImages = secondImage ? `<p>image ${img}</p><p>image2 ${img2}</p>` : `<p>image ${img}</p>`;
  const turns = withImage
    ? [{ turnIdx: 0, role: 'user', outerHtml: bothImages, text: 'image', meta: { messageId: 'm0' } }]
    : [{ turnIdx: 0, role: 'user', outerHtml: `<p>${plainText}</p>`, text: plainText, meta: { messageId: 'm0' } }];
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

// `corruptOnGet` plants bytes that do NOT hash to the key they are stored
// under, so the verified read has something real to reject.
function createCas({ missingOnGet = false, corruptOnGet = false, corruptOnNthRead = 0 } = {}) {
  const bytesBySha = new Map();
  const puts = [];
  const gets = [];
  const verifiedGets = [];
  return {
    puts,
    gets,
    verifiedGets,
    bytesBySha,
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
      // Faithful model of the real verified read: absent is null, but bytes
      // that contradict the requested identity THROW rather than returning.
      readVerifiedAssetBytes: async (sha256) => {
        gets.push(sha256);
        verifiedGets.push(sha256);
        if (missingOnGet) return null;
        const stored = bytesBySha.get(sha256);
        if (!stored) return null;
        const corruptThis = corruptOnGet
          || (corruptOnNthRead > 0 && verifiedGets.length === corruptOnNthRead);
        const planted = corruptThis ? Uint8Array.from([...stored, 0xff]) : stored;
        if ('sha256-' + sha256Hex(planted) !== sha256) {
          throw new Error('readVerifiedAssetBytes: CAS object failed verification: ' + sha256);
        }
        return planted;
      },
    },
  };
}

function loadProjector({
  withImage,
  missingOnGet = false,
  corruptOnGet = false,
  corruptOnNthRead = 0,
  secondImage = false,
  failWritePath = '',
  turnText = '',
  CompressionStreamImpl = CompressionStream,
  DecompressionStreamImpl = DecompressionStream,
}) {
  const stores = createStores({ withImage, turnText, secondImage });
  const cas = createCas({ missingOnGet, corruptOnGet, corruptOnNthRead });
  const strictFs = createStrictFs({ failWritePath });
  const context = {
    console,
    setTimeout,
    URL,
    atob: globalThis.atob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    ReadableStream,
    TransformStream,
    CompressionStream: CompressionStreamImpl,
    DecompressionStream: DecompressionStreamImpl,
    crypto: globalThis.crypto || crypto.webcrypto,
    __TAURI_INTERNALS__: { invoke: strictFs.invoke },
    H2O: { Studio: { store: stores.stores, ingestion: { assetCas: cas.api } } },
    chrome: { runtime: { id: 'desktop-test', getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }) } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });
  vm.runInContext(readRepo(MATERIALIZER_REL), sandbox, { filename: MATERIALIZER_REL });
  vm.runInContext(readRepo(CODEC_REL), sandbox, { filename: CODEC_REL });
  vm.runInContext(readRepo(PROJECTOR_REL), sandbox, { filename: PROJECTOR_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (!ingestion || typeof ingestion.writeSavedChatPackageV1 !== 'function') throw new Error('projector did not register');
  return { ingestion, stores, cas, fs: strictFs, sandbox };
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

function passthroughCompressionStreamClass() {
  return class PassthroughCompressionStream {
    constructor() {
      return new TransformStream({
        transform(chunk, controller) { controller.enqueue(chunk); },
      });
    }
  };
}

function snapshotReadCalls(env, root) {
  return env.fs.calls.filter((call) => call.cmd === 'plugin:fs|read_file' && call.path === root + '/snapshot.json');
}

async function buildV3(env) {
  return env.ingestion.buildSavedChatPackageV3({ snapshotId: 'snap_v1_write' });
}

function installInterruptedSnapshot(env, root, bytes) {
  env.fs.dirs.add(root);
  env.fs.files.set(root + '/snapshot.json', new Uint8Array(bytes));
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
  /* ────────────────────────────────────────────────────────────────────────
   * M05 G1 CUTOVER.
   *
   * Every check below this banner previously drove the renderer-side package
   * writer: directory creation, member write ordering, CAS asset copies, and
   * the DP-M03-B/C v3 interrupted-write resume semantics. That writer is
   * retired. Publication is now a trusted Rust operation, and after the G1
   * capability narrowing the renderer holds NO mutation authority under
   * archive/** — so those code paths cannot run and cannot be tested here.
   *
   * The guarantees they protected did not disappear; they moved to where they
   * are actually enforced, and are proven by cargo tests in
   * apps/studio/desktop/src-tauri/src/archive_generation_publish/tests.rs:
   * required-member completeness, per-member re-hash against manifest.files,
   * in-Rust CAS re-verification by sha AND length, refusal before any
   * publication with no partial directory, exclusive create-only promotion,
   * and honest durability reporting.
   *
   * DELIBERATE, RECORDED COVERAGE DEFERRAL: the DP-M03-B/C v3 interrupted-write
   * resume semantics are frozen normative behaviour for a payload version that
   * is NOT live (live v3 remains OFF). They must be re-established inside the
   * trusted publisher as a prerequisite of any future live-v3 activation. This
   * note exists so that requirement is explicit rather than silently lost with
   * the retired writer.
   * ──────────────────────────────────────────────────────────────────────── */

  await checkAsync('the retired v1 writer now publishes through trusted Rust and mutates nothing itself', async () => {
    const env = loadProjector({ withImage: false });
    const staged = [];
    env.ingestion.publishSavedChatGenerationV1 = async (built) => {
      for (const member of ['snapshot', 'markdown', 'html', 'manifest']) staged.push(member);
      const hex = String(built.contentHash || '').replace(/^sha256-/, '');
      return {
        ok: true, outcome: 'created', committed: true, deduped: false,
        durabilityComplete: true,
        generationPath: `archive/packages/${built.manifest.chatId}.g${hex}.h2ochat`,
        contentHash: built.contentHash, blockers: [], advisories: [],
      };
    };
    const before = env.fs.writes.length;
    const written = await env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write' });
    assert.equal(written.written, true);
    assert.deepEqual(staged, ['snapshot', 'markdown', 'html', 'manifest']);
    assert.match(written.packagePath, /\.g[0-9a-f]{64}\.h2ochat$/,
      'the trusted side derives the generation path');
    assert.equal(env.fs.writes.length, before,
      'the renderer must issue no plugin-fs writes during publication');
  });

  await checkAsync('the destructive overwrite path is unreachable', async () => {
    const env = loadProjector({ withImage: false });
    await assert.rejects(
      () => env.ingestion.writeSavedChatPackageV1({ snapshotId: 'snap_v1_write', overwrite: true }),
      /create-only|overwrite is forbidden/,
    );
  });

  await checkAsync('the dormant v3 renderer writer is retired, not merely unused', async () => {
    const env = loadProjector({ withImage: false });
    await assert.rejects(
      () => env.ingestion.writeSavedChatPackageV3({ snapshotId: 'snap_v1_write' }),
      /retired/,
      'it was the last renderer path able to mkdir a package and write members',
    );
  });

  check('the package module issues no archive filesystem mutation at all', () => {
    const src = readRepo(PROJECTOR_REL);
    for (const forbidden of ['plugin:fs|write_file', 'plugin:fs|mkdir', 'plugin:fs|remove', 'plugin:fs|rename', 'plugin:fs|open']) {
      assert.ok(!src.includes(forbidden), `the package module must not invoke ${forbidden} after the G1 cutover`);
    }
  });

  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

/* ── Generation-publisher BRIDGE: opaque token passthrough ────────────────
 *
 * The bridge had no validator at all, and the Rust suite never crossed JSON,
 * so a full-range u64 session token shipped as a JSON number and was truncated
 * by the WebView -- begin succeeded, then write_member was refused with
 * generation-session-unknown. The token is opaque: the bridge must hand back
 * the EXACT value it was given, byte for byte, to every later command. */
const PUBLISHER_BRIDGE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-generation-publisher.tauri.js';
const BIG_TOKEN = '12308876026142924039'; // the real token from the failed run

function loadPublisherBridge(invokeImpl) {
  const context = {
    console, setTimeout, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, Math, JSON,
    Promise, Object, Array, String, Number, Boolean, Error, isFinite, parseInt,
    __TAURI_INTERNALS__: { invoke: invokeImpl },
    H2O: { Studio: { ingestion: {} } },
  };
  context.globalThis = context; context.window = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(PUBLISHER_BRIDGE_REL), sandbox, { filename: PUBLISHER_BRIDGE_REL });
  return sandbox.H2O.Studio.ingestion;
}

function builtPackageFixture() {
  const enc = new TextEncoder();
  return {
    manifest: { chatId: 'c_bridge_token', schemaVersion: 1 },
    files: {
      'snapshot.json': { bytes: enc.encode('{"snapshotId":"s1"}') },
      'chat.md': { bytes: enc.encode('# t') },
      'chat.html': { bytes: enc.encode('<p>t</p>') },
      'manifest.json': { bytes: enc.encode('{"chatId":"c_bridge_token"}') },
    },
  };
}

await checkAsync('bridge returns the EXACT opaque token string to write/commit', async () => {
  const seen = [];
  const api = loadPublisherBridge(async (cmd, a, b) => {
    if (cmd === 'h2o_archive_generation_begin') return { ok: true, token: BIG_TOKEN, blockers: [] };
    if (cmd === 'h2o_archive_generation_write_member') {
      const opts = JSON.parse((b && b.headers && b.headers.options) || '{}');
      seen.push({ cmd, token: opts.token });
      return { ok: true, blockers: [] };
    }
    if (cmd === 'h2o_archive_generation_commit') {
      seen.push({ cmd, token: a && a.options && a.options.token });
      return { ok: true, outcome: 'created', packagePath: 'archive/packages/x.h2ochat', blockers: [], advisories: [] };
    }
    if (cmd === 'h2o_archive_generation_abort') { seen.push({ cmd, token: a && a.options && a.options.token }); return { ok: true }; }
    throw new Error('unexpected command ' + cmd);
  });
  assert.equal(typeof api.publishSavedChatGenerationV1, 'function', 'bridge did not register');
  await api.publishSavedChatGenerationV1(builtPackageFixture());

  assert.ok(seen.length >= 2, 'bridge must reach write_member and commit');
  for (const s of seen) {
    assert.strictEqual(typeof s.token, 'string', `${s.cmd} sent a ${typeof s.token}, not an opaque string`);
    assert.strictEqual(s.token, BIG_TOKEN, `${s.cmd} altered the token: ${s.token}`);
  }
  assert.ok(seen.some((s) => s.cmd === 'h2o_archive_generation_commit'), 'commit must be reached');
});

check('NEGATIVE CONTROL — Number() coercion of this token loses precision', () => {
  /* Proves the fixture is load-bearing: had the bridge (or the old JSON-number
   * contract) put this token through a JS Number, the equality above could not
   * hold. This is exactly the shipped defect. */
  const coerced = String(Number(BIG_TOKEN));
  assert.notEqual(coerced, BIG_TOKEN, 'fixture no longer demonstrates precision loss');
  assert.equal(coerced, '12308876026142925000');
  assert.ok(Number(BIG_TOKEN) > Number.MAX_SAFE_INTEGER, 'fixture must exceed MAX_SAFE_INTEGER');
});

check('bridge performs no arithmetic or numeric coercion on the token', () => {
  const src = readRepo(PUBLISHER_BRIDGE_REL)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  for (const banned of ['Number(token', 'parseInt(token', 'parseFloat(token', 'token +', '+ token', 'token++']) {
    assert.ok(!src.includes(banned), `bridge must not coerce the token: ${banned}`);
  }
});


await main();
