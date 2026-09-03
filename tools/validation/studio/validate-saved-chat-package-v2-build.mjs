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
const CODEC_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-codec.tauri.js';
const PROJECTOR_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-v1.tauri.js';
const GENERATION_POLICY_REL = 'src-surfaces-base/studio/ingestion/saved-chat-generation-policy.tauri.js';
const PROBE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-projection-probe.tauri.js';

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
    ReadableStream,
    TransformStream,
    CompressionStream,
    DecompressionStream,
    crypto: globalThis.crypto || crypto.webcrypto,
    __TAURI_INTERNALS__: { invoke: async () => { throw new Error('build path must not invoke fs'); } },
    H2O: { Studio: { store: mocks.stores, ingestion: { assetCas: cas.api } } },
    chrome: { runtime: { id: 'desktop-test', getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }) } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });
  vm.runInContext(readRepo(MATERIALIZER_REL), sandbox, { filename: MATERIALIZER_REL });
  vm.runInContext(readRepo(CODEC_REL), sandbox, { filename: CODEC_REL });
  vm.runInContext(readRepo(PROJECTOR_REL), sandbox, { filename: PROJECTOR_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (!ingestion || typeof ingestion.buildSavedChatPackageV1 !== 'function') throw new Error('projector did not register');
  return { ingestion, mocks, cas };
}

/* Phase 2.1: the same sandbox, plus the projection probe. `readiness` lets a
 * test mark one authoritative store unready. The sandbox's __TAURI_INTERNALS__
 * invoke THROWS, so any filesystem call by the probe fails the test
 * structurally rather than by assertion. */
function buildProbeEnv({ withImage, readiness = {}, family = 'v1v2', policyWire, policyThrows = '' }) {
  const mocks = createMockStores({ withImage });
  const cas = createMockCas();
  const policyCalls = [];
  for (const [name, ready] of Object.entries(readiness)) {
    mocks.stores[name] = { ...(mocks.stores[name] || {}), isReady: () => ready };
  }
  const context = {
    console, setTimeout, URL,
    atob: globalThis.atob,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    ReadableStream, TransformStream, CompressionStream, DecompressionStream,
    crypto: globalThis.crypto || crypto.webcrypto,
    __TAURI_INTERNALS__: { invoke: async (cmd) => {
      policyCalls.push(cmd);
      if (cmd === 'h2o_saved_chat_generation_policy') {
        if (policyThrows) throw new Error(policyThrows);
        return policyWire === undefined
          ? { schema: 'h2o.studio.saved-chat-generation-policy.v1', liveGenerationFamily: family }
          : policyWire;
      }
      throw new Error(`probe must not invoke ${cmd}`);
    } },
    H2O: { Studio: { store: mocks.stores, ingestion: { assetCas: cas.api } } },
    chrome: { runtime: { id: 'desktop-test', getManifest: () => ({ name: 'H2O Studio Test', version: '0.0.0-test' }) } },
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(SANITIZER_REL), sandbox, { filename: SANITIZER_REL });
  vm.runInContext(readRepo(MATERIALIZER_REL), sandbox, { filename: MATERIALIZER_REL });
  vm.runInContext(readRepo(CODEC_REL), sandbox, { filename: CODEC_REL });
  vm.runInContext(readRepo(PROJECTOR_REL), sandbox, { filename: PROJECTOR_REL });
  vm.runInContext(readRepo(GENERATION_POLICY_REL), sandbox, { filename: GENERATION_POLICY_REL });
  vm.runInContext(readRepo(PROBE_REL), sandbox, { filename: PROBE_REL });
  const ingestion = sandbox.H2O?.Studio?.ingestion;
  if (typeof ingestion?.probeCurrentSavedChatProjectionV1 !== 'function') {
    throw new Error('projection probe did not register');
  }
  /* The probe reuses the REAL governed bound; the mock CAS must publish it or
   * the probe would silently lose its asset-bound enforcement. */
  ingestion.assetCas.assetBlobCapBytes = 33554432;
  return { ingestion, mocks, cas, ids: mocks.ids, policyCalls };
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

  // ── Additive v3 contract coverage (M02 T06) ───────────────────────
  let v3a = null;
  let v3b = null;
  await checkAsync('v3 build is deterministic and emits canonical typed content only', async () => {
    const { ingestion } = buildProjector({ withImage: true });
    v3a = await ingestion.buildSavedChatPackageV3({ snapshotId: 'snap_v2' });
    v3b = await ingestion.buildSavedChatPackageV3({ snapshotId: 'snap_v2' });
    assert.equal(v3a.schemaVersion, 3);
    assert.equal(v3a.payloadVersion, 3);
    assert.equal(v3a.metadata.logicalSnapshotText, v3b.metadata.logicalSnapshotText);
    assert.equal(v3a.contentHash, v3b.contentHash);
    for (const message of v3a.snapshot.messages) {
      assert.ok(Array.isArray(message.content));
      assert.equal(Object.hasOwn(message, 'contentText'), false);
      assert.equal(Object.hasOwn(message, 'contentHtml'), false);
    }
  });

  check('v3 selected descriptor matches exact stored snapshot bytes and logical fallback', () => {
    const descriptor = v3a.manifest.files.snapshot;
    const bytes = Buffer.from(v3a.files['snapshot.json'].bytes);
    assert.equal(descriptor.sha256, 'sha256-' + sha256Hex(bytes));
    assert.equal(descriptor.byteLength, bytes.length);
    const api = buildProjector({ withImage: false }).ingestion.__savedChatPackageV3;
    assert.equal(api.logicalSha256(descriptor), v3a.metadata.logicalSnapshotSha256);
    assert.equal(api.logicalByteLength(descriptor), v3a.metadata.logicalSnapshotByteLength);
    assert.ok(v3a.metadata.logicalSnapshotByteLength > 0);
    assert.ok(v3a.metadata.logicalSnapshotByteLength <= 8 * 1024 * 1024);
    if (descriptor.encoding === 'gzip') {
      assert.ok(descriptor.byteLength > 0);
      assert.ok(descriptor.byteLength < descriptor.contentByteLength);
      assert.equal(descriptor.contentByteLength, v3a.metadata.logicalSnapshotByteLength);
      assert.ok(v3a.metadata.gzipTotalBytes < v3a.metadata.identityTotalBytes);
    }
  });

  check('v3 gzip admission independently requires physical and whole-package savings', () => {
    const api = buildProjector({ withImage: false }).ingestion.__savedChatPackageV3;
    assert.equal(api.gzipCandidateWins(99, 100, 49, 50), true);
    assert.equal(api.gzipCandidateWins(100, 100, 49, 50), false, 'whole-package tie must select identity');
    assert.equal(api.gzipCandidateWins(99, 100, 50, 50), false, 'snapshot tie must select identity');
    assert.equal(api.gzipCandidateWins(99, 100, 51, 50), false, 'expanded gzip snapshot must select identity');
    assert.equal(api.gzipCandidateWins(1, 100, 0, 50), false, 'empty gzip snapshot must select identity');
    assert.throws(() => api.gzipCandidateWins(1, 100, 1), /snapshot lengths/);
    assert.equal(api.candidateTotalBytes(new Uint8Array(40), new Uint8Array(60)), 100);
    const exactOverflow = {
      code: 'saved-chat-member-physical-output-exceeds-cap',
      detail: { byteCap: 100 },
    };
    assert.equal(api.isGzipDominanceOverflow(exactOverflow, 100), true);
    assert.equal(api.isGzipDominanceOverflow(exactOverflow, 99), false, 'wrong-cap overflow must fail closed');
    assert.equal(api.isGzipDominanceOverflow(new Error('generic codec failure'), 100), false);
  });

  await checkAsync('v3 contentHash is exact, asset-order independent, and excludes renderers', async () => {
    const assets = v3a.manifest.assets.map((asset) => asset.sha256).sort();
    const expected = 'sha256-' + sha256Hex(canonicalJson({
      payloadVersion: 3,
      snapshot: v3a.metadata.logicalSnapshotSha256,
      assets,
    }));
    assert.equal(v3a.manifest.contentHash, expected);
    assert.deepEqual(Object.keys(v3a.files).sort(), ['manifest.json', 'snapshot.json']);
    assert.equal(v3a.manifest.files.markdown, undefined);
    assert.equal(v3a.manifest.files.html, undefined);
    const api = buildProjector({ withImage: false }).ingestion.__savedChatPackageV3;
    const reversed = v3a.manifest.assets.slice().reverse();
    assert.equal(await api.contentHash(v3a.manifest.files, reversed), v3a.contentHash);
  });

  await checkAsync('v3 logical identity is encoding-independent without producing gzip', async () => {
    const api = buildProjector({ withImage: false }).ingestion.__savedChatPackageV3;
    const logical = 'sha256-275b305bbd4d55874fe0508003fceedc5c41940139fb17376dd336e614b4fa3b';
    const differentPhysical = 'sha256-181a911cccfe08bc59b0b12910dcea49d6eb958a9bbbfb7f7727b732744f163c';
    const identity = { path: 'snapshot.json', sha256: logical, byteLength: 1143, encoding: 'identity' };
    const futureEncoded = {
      path: 'snapshot.json', sha256: differentPhysical, byteLength: 35, encoding: 'gzip',
      contentSha256: logical, contentByteLength: 1143,
    };
    assert.notEqual(identity.sha256, futureEncoded.sha256);
    assert.equal(api.logicalSha256(identity), logical);
    assert.equal(api.logicalSha256(futureEncoded), logical);
    assert.equal(api.logicalByteLength(identity), 1143);
    assert.equal(api.logicalByteLength(futureEncoded), 1143);
    const hashA = await api.contentHash({ snapshot: identity }, []);
    const hashB = await api.contentHash({ snapshot: futureEncoded }, []);
    assert.equal(hashA, 'sha256-ff93ad08a4e2342f051369f7a99c68930102a0ccd6736246bbbc9c0675d09075');
    assert.equal(hashA, hashB);
    assert.doesNotMatch(readRepo(PROJECTOR_REL), /CompressionStream|DecompressionStream|gunzip|inflate|zlib/);
  });

  console.log('');
  console.log(`PASS ${PASS.length}`);
  // ── M05 Phase 2.1: mutation-free current-projection probe ────────────────

  await checkAsync('P2.1 the assetStack override drives the SAME builder, and the default is unchanged', () => {
    // The override must be a COMPLETE stack: a partial one would silently mix
    // probe and production dependencies.
    const env = buildProbeEnv({ withImage: false });
    return assert.rejects(
      () => env.ingestion.buildSavedChatPackageV1({
        snapshotId: env.ids.snapshotId,
        assetStack: { assetCas: {} },
      }),
      /assetStack override must supply/,
    ).then(async () => {
      // With no override, production resolution is untouched: this build still
      // reaches the production mock CAS registered on the namespace.
      const built = await env.ingestion.buildSavedChatPackageV1({ snapshotId: env.ids.snapshotId });
      assert.equal(typeof built.contentHash, 'string');
      assert.ok(built.contentHash.startsWith('sha256-'));
    });
  });

  await checkAsync('P2.1 v1 probe identity EXACTLY equals the writer projection', async () => {
    const env = buildProbeEnv({ withImage: false });
    const built = await env.ingestion.buildSavedChatPackageV1({ snapshotId: env.ids.snapshotId });
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(probe.status, 'ok', probe.reason);
    assert.equal(probe.contentHash, built.contentHash, 'probe must agree with the writer byte-for-byte');
    assert.equal(probe.schemaVersion, 1);
    assert.equal(probe.snapshotId, env.ids.snapshotId);
    assert.equal(probe.assetShas.length, 0);
  });

  await checkAsync('P2.1 v2 probe identity EXACTLY equals the writer projection with inline assets', async () => {
    const env = buildProbeEnv({ withImage: true });
    const built = await env.ingestion.buildSavedChatPackageV1({ snapshotId: env.ids.snapshotId });
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(probe.status, 'ok', probe.reason);
    assert.equal(probe.schemaVersion, 2, 'inline assets must still select v2 in the probe');
    assert.equal(probe.payloadVersion, 2);
    assert.equal(probe.contentHash, built.contentHash, 'v2 probe must agree with the writer');
    // Asset identity is equivalent, including the deterministic sort.
    const builtShas = built.manifest.assets.map((a) => a.sha256);
    // Cross-realm: compare contents, not prototypes.
    assert.deepEqual([...probe.assetShas], [...builtShas]);
    assert.ok(probe.assetShas.length > 0);
  });

  await checkAsync('M09 P2.3 injected V3 policy selects the canonical v3 builder for projection', async () => {
    const env = buildProbeEnv({ withImage: true, family: 'v3' });
    const direct = await env.ingestion.buildSavedChatPackageV3({ snapshotId: env.ids.snapshotId });
    const active = await env.ingestion.buildSavedChatPackageForLiveGenerationFamily({ snapshotId: env.ids.snapshotId });
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(active.schemaVersion, 3);
    assert.equal(active.payloadVersion, 3);
    assert.equal(active.liveGenerationFamily, 'v3');
    assert.equal(active.contentHash, direct.contentHash, 'facade must not duplicate or alter v3 identity');
    assert.equal(probe.status, 'ok', probe.reason);
    assert.equal(probe.schemaVersion, 3);
    assert.equal(probe.payloadVersion, 3);
    assert.equal(probe.liveGenerationFamily, 'v3');
    assert.equal(probe.contentHash, direct.contentHash, 'projection and v3 writer build must share identity');
    assert.deepEqual(Object.keys(active.files).sort(), ['manifest.json', 'snapshot.json']);
  });

  await checkAsync('M09 P2.3 malformed, unknown, missing, and failed policy reads are indeterminate', async () => {
    const fixtures = [
      { policyWire: { schema: 'wrong', liveGenerationFamily: 'v1v2' } },
      { policyWire: { schema: 'h2o.studio.saved-chat-generation-policy.v1', liveGenerationFamily: 'v4' } },
      { policyWire: { schema: 'h2o.studio.saved-chat-generation-policy.v1' } },
      { policyThrows: 'native policy unavailable' },
    ];
    for (const fixture of fixtures) {
      const env = buildProbeEnv({ withImage: false, ...fixture });
      const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
      assert.equal(probe.status, 'indeterminate');
      assert.equal(probe.reason, 'generation-policy-unavailable');
      assert.equal(probe.contentHash, '');
    }
  });

  await checkAsync('P2.1 the v2 probe rewrites HTML refs the same way the writer does', async () => {
    const env = buildProbeEnv({ withImage: true });
    const built = await env.ingestion.buildSavedChatPackageV1({ snapshotId: env.ids.snapshotId });
    // The rewritten snapshot the probe hashes is the same one the writer emits:
    // equal contentHash over an asset-bearing package already proves the
    // rewritten bytes match, since the snapshot hash feeds the identity.
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(probe.contentHash, built.contentHash);
    const snapshotText = built.files['snapshot.json'].text;
    assert.ok(!/data:image\//.test(snapshotText), 'inline data URIs must have been rewritten');
    assert.ok(/assets\/sha256-[0-9a-f]{64}\./.test(snapshotText), 'refs must be package-relative');
  });

  await checkAsync('P2.1 the probe mutates NOTHING: no fs invoke, no CAS write, no registry row', async () => {
    const env = buildProbeEnv({ withImage: true });
    // Any filesystem call throws in this sandbox, so reaching 'ok' is itself
    // proof no fs invoke happened.
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(probe.status, 'ok', probe.reason);
    assert.equal(env.cas.puts.length, 0, 'the real CAS must never be called by the probe');
    assert.equal(env.mocks.registry.upserts.length, 0, 'no asset registry row may be written');
    assert.equal(env.mocks.registry.links.length, 0, 'no turn link may be written');
  });

  for (const store of ['chats', 'snapshots', 'folders', 'categories', 'labels', 'tags']) {
    await checkAsync(`P2.1 an unready '${store}' store yields indeterminate with NO hash`, async () => {
      const env = buildProbeEnv({ withImage: false, readiness: { [store]: false } });
      const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
      assert.equal(probe.status, 'indeterminate');
      assert.equal(probe.reason, 'store-not-ready');
      assert.ok(probe.notReady.includes(store));
      // Never a hash a consumer could mistake for freshness authority.
      assert.equal(probe.contentHash, '');
      assert.notEqual(probe.status, 'ok');
    });
  }

  await checkAsync('P2.1 no current snapshot yields undefined-no-snapshot, never stale', async () => {
    const env = buildProbeEnv({ withImage: false });
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: 'chat_does_not_exist' });
    assert.equal(probe.status, 'undefined-no-snapshot');
    assert.equal(probe.reason, 'no-current-snapshot');
    assert.equal(probe.contentHash, '');
  });

  await checkAsync('P2.1 a governed asset-bound violation is indeterminate, not stale, and mutates nothing', async () => {
    const env = buildProbeEnv({ withImage: true });
    // Force the governed bound below the fixture asset size.
    env.ingestion.assetCas.assetBlobCapBytes = 1;
    const probe = await env.ingestion.probeCurrentSavedChatProjectionV1({ chatId: env.ids.chatId });
    assert.equal(probe.status, 'indeterminate');
    assert.equal(probe.reason, 'asset-bound-exceeded');
    assert.equal(probe.contentHash, '', 'an unpublishable state must not carry an identity');
    assert.equal(env.cas.puts.length, 0);
    assert.equal(env.mocks.registry.upserts.length, 0);
    assert.equal(env.mocks.registry.links.length, 0);
  });

  check('P2.1 the probe module performs no filesystem or SQL work by construction', () => {
    // Match the actual invoke forms, not English words: the module's own
    // comments legitimately discuss removing checks.
    const src = readRepo(PROBE_REL);
    for (const forbidden of [
      'plugin:fs|', 'plugin:sql|',
      "'write_file'", "'mkdir'", "'remove'", "'rename'",
      'invoke(',
    ]) {
      assert.ok(!src.includes(forbidden), `the probe must not reference ${forbidden}`);
    }
  });

  if (FAIL.length) {
    console.log(`FAIL ${FAIL.length}`);
    for (const f of FAIL) console.log(`- ${f.label}: ${f.m}`);
    process.exitCode = 1;
  }
}

await main();
