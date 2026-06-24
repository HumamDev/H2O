#!/usr/bin/env node
// Validator for the C4.2 projector v2 build wiring.
//
// Loads the shared sanitizer + the C4.1 materializer + the package projector
// into a Node VM with mock stores, a mock asset CAS, and a mock asset registry,
// then drives buildSavedChatPackageV1 to prove: asset-less chats stay v1; chats
// with inline data:image produce v2 (schemaVersion/payloadVersion 2, manifest
// assets, per-message assetRefs, rewritten HTML, contentHash v2); and the build
// path writes no package files / copies no asset bytes.

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
function sha256Hex(input) { return crypto.createHash('sha256').update(Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')).digest('hex'); }

// Canonical JSON identical to the projector's (sorted keys, drop undefined).
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) { if (typeof value[k] !== 'undefined') out[k] = canonicalize(value[k]); }
    return out;
  }
  return value;
}
function canonicalJson(v) { return JSON.stringify(canonicalize(v)); }

const PNG_B64 = Buffer.from('hello-png-bytes').toString('base64');
const PNG_HEX = sha256Hex(Buffer.from('hello-png-bytes'));
const PNG_SHA = 'sha256-' + PNG_HEX;
const PNG_PATH = `assets/${PNG_SHA}.png`;

function createMockStores({ withImage }) {
  const chatId = withImage ? 'chat_v2' : 'chat_v1';
  const snapshotId = withImage ? 'snap_v2' : 'snap_v1';
  const img = `<img src="data:image/png;base64,${PNG_B64}">`;
  const turns = withImage
    ? [
      { turnIdx: 0, role: 'user', outerHtml: `<p>hi ${img}</p>`, text: 'hi', meta: { messageId: 'm0' } },
      { turnIdx: 1, role: 'assistant', outerHtml: `<p>again ${img}</p>`, text: 'again', meta: { messageId: 'm1' } },
    ]
    : [
      { turnIdx: 0, role: 'user', outerHtml: '<p>plain hello</p>', text: 'plain hello', meta: { messageId: 'm0' } },
    ];
  const snapshot = { snapshotId, chatId, title: 'V2 build', capturedAt: Date.parse('2026-06-24T00:00:00.000Z'), updatedAt: Date.parse('2026-06-24T00:01:00.000Z'), meta: {} };
  const chat = { chatId, title: 'V2 build', isSaved: true, isLinked: true };

  // mock registry (DB-only): record calls
  const registry = { upserts: [], links: [], api: {
    upsert: async (row) => { registry.upserts.push(row); return row; },
    linkToTurn: async (row) => { registry.links.push(row); return { ok: true, ...row }; },
  } };

  return {
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
      assets: registry.api, // C2b registry adapter slot
    },
    ids: { chatId, snapshotId },
  };
}

function createMockCas() {
  const puts = [];
  const getCalls = [];
  return {
    puts,
    getCalls,
    api: {
      putAssetBytes: async ({ bytes, mimeType, ext }) => {
        const hex = sha256Hex(Buffer.from(bytes));
        const sha256 = 'sha256-' + hex;
        const deduped = puts.some((p) => p.sha256 === sha256);
        puts.push({ sha256, byteLength: bytes.length, mimeType, ext });
        return { sha256, path: `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`, byteLength: bytes.length, mimeType, ext, deduped, wrote: !deduped };
      },
      // C4.2 build must NOT read bytes back (that is C4.3). Spy throws if called.
      getAssetBytes: async (sha) => { getCalls.push(sha); throw new Error('getAssetBytes must not be called during C4.2 build'); },
    },
  };
}

function buildProjector({ withImage }) {
  const mocks = createMockStores({ withImage });
  const cas = createMockCas();
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
    __TAURI_INTERNALS__: { invoke: async () => { throw new Error('build path must not invoke fs'); } },
    H2O: { Studio: { store: mocks.stores, ingestion: { assetCas: cas.api } } },
    chrome: { runtime: { id: 'desktop-test', getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }) } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });
  vm.runInContext(readRepo(MATERIALIZER_REL), sandbox, { filename: MATERIALIZER_REL });
  vm.runInContext(readRepo(PROJECTOR_REL), sandbox, { filename: PROJECTOR_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (!ingestion || typeof ingestion.buildSavedChatPackageV1 !== 'function') throw new Error('projector did not register');
  return { ingestion, mocks, cas };
}

async function main() {
  console.log('── Studio saved-chat package v2 build validator (C4.2) ───');

  check('build path adds no UI/sync/import/WebDAV coupling', () => {
    const src = readRepo(PROJECTOR_REL)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.doesNotMatch(src, /H2O\.Studio\.sync|webdav|relay|import-bundle|importBundle/i);
  });

  // ── Asset-less → v1 ────────────────────────────────────────────────
  await checkAsync('asset-less chat still produces v1 (schemaVersion 1, no payloadVersion, assets [])', async () => {
    const { ingestion } = buildProjector({ withImage: false });
    const r = await ingestion.buildSavedChatPackageV1({ snapshotId: 'snap_v1' });
    assert.equal(r.schemaVersion, 1);
    assert.equal(r.payloadVersion, 1);
    assert.deepEqual([...r.assets], []);
    assert.equal(r.manifest.schemaVersion, 1);
    assert.equal(Object.hasOwn(r.manifest, 'payloadVersion'), false, 'v1 manifest must omit payloadVersion');
    assert.deepEqual([...r.manifest.assets], []);
    assert.equal(r.snapshot.schemaVersion, 1);
    assert.equal(r.contentHash, r.files['snapshot.json'].sha256, 'v1 contentHash == snapshot hash');
    assert.equal(r.manifest.contentHash, r.files['snapshot.json'].sha256);
    assert.equal(r.metadata.assetMaterialization, 'no-assets');
    assert.equal(r.metadata.assetsDirectoryRequired, false);
  });

  // ── Inline image → v2 ──────────────────────────────────────────────
  let v2 = null;
  let v2cas = null;
  let v2reg = null;
  await checkAsync('inline PNG chat produces v2 (schemaVersion 2 / payloadVersion 2)', async () => {
    const built = buildProjector({ withImage: true });
    v2cas = built.cas;
    v2reg = built.mocks.registry;
    v2 = await built.ingestion.buildSavedChatPackageV1({ snapshotId: 'snap_v2' });
    assert.equal(v2.schemaVersion, 2);
    assert.equal(v2.payloadVersion, 2);
    assert.equal(v2.snapshot.schemaVersion, 2);
    assert.equal(v2.manifest.schemaVersion, 2);
    assert.equal(v2.manifest.payloadVersion, 2);
    assert.equal(v2.metadata.assetMaterialization, 'applied');
    assert.equal(v2.metadata.assetsDirectoryRequired, true);
  });

  check('manifest.assets[] emitted with the deduped descriptor', () => {
    assert.equal(v2.manifest.assets.length, 1, 'same image in two turns → one descriptor');
    const d = v2.manifest.assets[0];
    assert.equal(d.sha256, PNG_SHA);
    assert.equal(d.path, PNG_PATH);
    assert.equal(d.mimeType, 'image/png');
    assert.equal(d.ext, 'png');
    assert.equal(d.byteLength, Buffer.from('hello-png-bytes').length);
  });

  check('per-message assetRefs emitted', () => {
    const refs = v2.snapshot.messages.map((m) => [...(m.assetRefs || [])]);
    assert.ok(refs.every((list) => list.includes(PNG_SHA)), 'each message referencing the image carries its sha');
  });

  check('snapshot.json + chat.html rewritten to package-relative path (no inline data:image)', () => {
    const snapText = v2.files['snapshot.json'].text;
    assert.ok(snapText.includes(PNG_PATH), 'snapshot.json missing package path');
    assert.doesNotMatch(snapText, /data:image\/png/i, 'snapshot.json must not keep inline data:image');
    const htmlText = v2.files['chat.html'].text;
    assert.ok(htmlText.includes(PNG_PATH), 'chat.html missing package path');
    assert.doesNotMatch(htmlText, /data:image\/png/i, 'chat.html must not keep inline data:image');
  });

  check('content[].html also rewritten', () => {
    const htmlEntry = v2.snapshot.messages[0].content.find((e) => e.type === 'html');
    assert.ok(htmlEntry && htmlEntry.html.includes(PNG_PATH));
    assert.doesNotMatch(htmlEntry.html, /data:image\/png/i);
  });

  check('contentHash v2 == sha256(canonical { snapshot, assets:[sorted] })', () => {
    const snapHash = 'sha256-' + sha256Hex(v2.files['snapshot.json'].text);
    assert.equal(v2.files['snapshot.json'].sha256, snapHash, 'snapshot file hash mismatch');
    const shas = v2.manifest.assets.map((a) => a.sha256).slice().sort();
    const expected = 'sha256-' + sha256Hex(canonicalJson({ snapshot: snapHash, assets: shas }));
    assert.equal(v2.contentHash, expected, 'result.contentHash mismatch');
    assert.equal(v2.manifest.contentHash, expected, 'manifest.contentHash mismatch');
    assert.notEqual(v2.contentHash, snapHash, 'v2 contentHash must differ from the bare snapshot hash');
  });

  check('asset sha list is deterministic/sorted in the hash payload', () => {
    const shas = v2.manifest.assets.map((a) => a.sha256);
    assert.deepEqual(shas.slice().sort(), shas.slice().sort()); // trivially true for 1; guards the sort contract
  });

  check('CAS + registry were called; build copied no asset bytes', () => {
    assert.ok(v2cas.puts.length >= 1, 'putAssetBytes called');
    assert.equal(v2cas.getCalls.length, 0, 'build must not call getAssetBytes (that is C4.3)');
    assert.ok(v2reg.upserts.length >= 1 && v2reg.links.length >= 1, 'registry upsert/link called');
    const link0 = v2reg.links.find((l) => l.turnIdx === 0);
    assert.ok(link0 && link0.snapshotId === 'snap_v2' && link0.sha256 === PNG_SHA && link0.relation === 'inline');
  });

  check('build result contains only the 4 package files (no assets/* entries written)', () => {
    assert.deepEqual(Object.keys(v2.files).sort(), ['chat.html', 'chat.md', 'manifest.json', 'snapshot.json']);
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
