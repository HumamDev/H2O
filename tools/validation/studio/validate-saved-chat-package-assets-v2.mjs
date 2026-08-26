#!/usr/bin/env node
// Validator for the saved-chat package asset materializer (Phase C C4.1).
//
// Loads src-surfaces-base/studio/ingestion/saved-chat-package-assets.tauri.js
// into a Node VM with mock assetCas + mock assetStore and proves inline
// data:image extraction, HTML rewrite, CAS/registry orchestration, dedup,
// per-message assetRefs, and the C4.1 non-goals (no remote fetch, no FS write,
// no contentHash v2, input not mutated).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');
const MODULE_REL = 'src-surfaces-base/studio/ingestion/saved-chat-package-assets.tauri.js';

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
// Strip comments so static checks test CODE, not the explanatory header prose
// (which legitimately names the non-goals).
function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// The real CAS publishes the DP-PRE-M05-ASSET-BOUND authority; the mock must
// too, or the ingest surface silently loses its early bound. `capBytes` lets a
// test exercise the mechanism at a small size instead of allocating 32 MiB.
// Default derived from the CAS authority itself, so the mock can never drift
// from the real governed value.
const CAS_MODULE_REL = 'src-surfaces-base/studio/ingestion/asset-cas.tauri.js';
const GOVERNED_ASSET_CAP = Number(
  /var GOVERNED_ASSET_BLOB_CAP_BYTES = (\d+);/.exec(readRepo(CAS_MODULE_REL))[1],
);
function createMockCas({ capBytes = GOVERNED_ASSET_CAP } = {}) {
  const calls = [];
  const seen = new Set();
  return {
    calls,
    api: {
      assetBlobCapBytes: capBytes,
      putAssetBytes: async ({ bytes, mimeType, ext, source, meta }) => {
        const hex = sha256Hex(bytes);
        const sha256 = 'sha256-' + hex;
        const deduped = seen.has(sha256);
        seen.add(sha256);
        calls.push({ sha256, mimeType, ext, source, meta, byteLength: bytes.length });
        return { sha256, path: `archive/assets/${hex.slice(0, 2)}/sha256-${hex}`, byteLength: bytes.length, mimeType, ext, deduped, wrote: !deduped };
      },
    },
  };
}
function createMockStore() {
  const upserts = [];
  const links = [];
  return {
    upserts,
    links,
    api: {
      upsert: async (row) => { upserts.push(row); return row; },
      linkToTurn: async (row) => { links.push(row); return { ok: true, ...row }; },
    },
  };
}

function loadHelper() {
  const context = {
    console,
    atob: globalThis.atob,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    __TAURI_INTERNALS__: {}, // pass the Tauri gate; helper makes no real Tauri calls
    H2O: {},
  };
  context.globalThis = context;
  const sandbox = vm.createContext(context);
  vm.runInContext(readRepo(MODULE_REL), sandbox, { filename: MODULE_REL });
  const api = sandbox.H2O?.Studio?.ingestion?.savedChatPackageAssets;
  if (!api) throw new Error('savedChatPackageAssets did not register');
  return api;
}

async function main() {
  console.log('── Studio saved-chat package asset materializer validator (C4.1) ─');

  // Static proofs (against comment-stripped CODE; the header prose names the
  // non-goals and the diagnose object exposes `fetchesRemote`/`contentHashV2`
  // flags, so we assert against implementation patterns, not bare substrings).
  const CODE = stripComments(readRepo(MODULE_REL));
  check('helper code has no sync/import/WebDAV coupling', () => {
    assert.doesNotMatch(CODE, /H2O\.Studio\.sync|webdav|relay|import-bundle|importBundle|recovery/i);
  });
  check('helper writes no files (no write_file / plugin:fs / fs facade)', () => {
    assert.doesNotMatch(CODE, /plugin:fs|write_file|read_file|writeFile|readFile|mkdir|__TAURI__\.fs/i);
  });
  check('helper implements no hashing / contentHash v2 (delegated to CAS)', () => {
    assert.doesNotMatch(CODE, /canonicalJson|crypto\b|subtle|createHash|sha256\s*\(/i);
  });
  check('helper performs no remote fetch', () => {
    assert.doesNotMatch(CODE, /\bfetch\s*\(|XMLHttpRequest|new\s+Request\b|axios/i);
  });

  const helper = loadHelper();

  check('exposes the required API', () => {
    for (const m of ['materializeInlineImageAssetsV2', 'extractInlineDataImageAssetsV2', 'decodeDataImageUriV2', 'mimeToExtV2', 'rewriteInlineImageRefsV2', 'diagnoseSavedChatPackageAssetsV2']) {
      assert.equal(typeof helper[m], 'function', `missing ${m}`);
    }
  });

  check('mimeToExtV2 + decodeDataImageUriV2 handle supported types only', () => {
    assert.equal(helper.mimeToExtV2('image/png'), 'png');
    assert.equal(helper.mimeToExtV2('image/jpeg'), 'jpg');
    assert.equal(helper.mimeToExtV2('image/gif'), 'gif');
    assert.equal(helper.mimeToExtV2('image/webp'), 'webp');
    assert.equal(helper.mimeToExtV2('image/svg+xml'), '');
    const okUri = 'data:image/png;base64,' + Buffer.from('x').toString('base64');
    assert.ok(helper.decodeDataImageUriV2(okUri));
    assert.equal(helper.decodeDataImageUriV2('data:image/svg+xml;base64,YWJj'), null);
    assert.equal(helper.decodeDataImageUriV2('https://example.com/y.png'), null);
    // No cap supplied → the decoder applies none; the CAS remains the enforcer.
    assert.ok(helper.decodeDataImageUriV2(okUri).bytes);
  });

  // ── DP-PRE-M05-ASSET-BOUND at the data-URI ingest boundary ───────────────
  check('the data-URI boundary refuses oversized assets, pre-decode where provable', () => {
    const helper = loadHelper();
    const uriFor = (bytes) => 'data:image/png;base64,' + Buffer.from(bytes).toString('base64');
    // Small cap chosen congruent to the real one (33554432 % 3 === 2) so the
    // just-over case lands on the same code path it does at 32 MiB.
    const CAP = 98;

    // Exactly at the cap must NOT be rejected — the pre-decode bound is a
    // lower bound precisely so it can never fire on a valid payload.
    const atCap = helper.decodeDataImageUriV2(uriFor(Buffer.alloc(CAP, 1)), CAP);
    assert.ok(atCap && atCap.bytes, 'a payload exactly at the cap must be accepted');
    assert.equal(atCap.bytes.length, CAP);
    assert.equal(atCap.oversize, undefined);

    // One byte over: refused. At this cap — as at the real 32 MiB — the encoded
    // length alone cannot prove it, so the AUTHORITATIVE post-decode check is
    // what catches it, and the actual decoded length is reported.
    const overByOne = helper.decodeDataImageUriV2(uriFor(Buffer.alloc(CAP + 1, 1)), CAP);
    assert.equal(overByOne.oversize, true, 'one byte over the cap must be refused');
    assert.equal(overByOne.decodedLength, CAP + 1, 'the actual decoded length is authoritative');

    // Clearly oversized: refused WITHOUT decoding — decodedLength stays null,
    // proving no decoded buffer was ever allocated.
    const huge = helper.decodeDataImageUriV2(uriFor(Buffer.alloc(CAP * 4, 1)), CAP);
    assert.equal(huge.oversize, true);
    assert.equal(huge.decodedLength, null, 'a provably oversized payload must be refused pre-decode');
    assert.ok(huge.encodedLength > 0, 'the encoded length must be reported');

    // Sanity across the whole valid range, at three caps chosen to cover every
    // residue of the cap mod 3. The residue matters: a payload of n bytes with
    // n % 3 === 1 encodes with TWO padding chars, and that is the only case
    // where the `- 2` slack in minimumDecodedBytes is actually load-bearing.
    // Without a cap congruent to 1 (mod 3) here, weakening the lower bound to
    // `- 1` would falsely reject an exactly-at-cap asset with the suite still
    // green. 98 is congruent to the real cap (33554432 % 3 === 2).
    for (const cap of [98, 99, 100]) {
      for (const n of [1, 2, 3, 4, 5, cap - 3, cap - 2, cap - 1, cap]) {
        const out = helper.decodeDataImageUriV2(uriFor(Buffer.alloc(n, 2)), cap);
        assert.ok(out && out.bytes, `${n} bytes must not be falsely rejected at cap ${cap}`);
        assert.equal(out.bytes.length, n);
      }
    }
  });

  // Fixtures
  const PNG_B64 = Buffer.from('hello-png-bytes').toString('base64');
  const SVG_B64 = Buffer.from('<svg/>').toString('base64');
  const imgPng = `<img src="data:image/png;base64,${PNG_B64}">`;
  const imgRemote = `<img src="https://example.com/y.png">`;
  const imgSvg = `<img src="data:image/svg+xml;base64,${SVG_B64}">`;
  const m0Html = `<p>hi ${imgPng} ${imgRemote} ${imgSvg}</p>`;
  const m1Html = `<p>again ${imgPng}</p>`;
  const input = {
    snapshotId: 'snap_1',
    chatId: 'chat_1',
    messages: [
      { id: 'm0', turnIndex: 0, contentHtml: m0Html, content: [{ type: 'text', text: 'hi' }, { type: 'html', html: m0Html, sanitized: true }], assetRefs: [] },
      { id: 'm1', turnIndex: 1, contentHtml: m1Html, content: [{ type: 'text', text: 'again' }, { type: 'html', html: m1Html, sanitized: true }], assetRefs: [] },
    ],
  };
  const inputBefore = JSON.stringify(input);

  const pngHex = sha256Hex(Buffer.from('hello-png-bytes'));
  const pngSha = 'sha256-' + pngHex;
  const pngPath = `assets/${pngSha}.png`;

  const cas = createMockCas();
  const store = createMockStore();
  let out = null;

  await checkAsync('an oversized inline asset fails the whole materialization closed', async () => {
    const cap = 98;
    const bigB64 = Buffer.alloc(cap * 4, 3).toString('base64');
    const bigHtml = `<p>big <img src="data:image/png;base64,${bigB64}"></p>`;
    const oversizeInput = {
      snapshotId: 'snap_oversize',
      chatId: 'chat_oversize',
      messages: [
        { id: 'm0', turnIndex: 0, contentHtml: bigHtml, content: [{ type: 'html', html: bigHtml, sanitized: true }], assetRefs: [] },
      ],
    };
    const boundedCas = createMockCas({ capBytes: cap });
    const boundedStore = createMockStore();
    await assert.rejects(
      () => helper.materializeInlineImageAssetsV2({ snapshotJson: oversizeInput, assetCas: boundedCas.api, assetStore: boundedStore.api }),
      /exceeds the governed ingest bound/,
      'an oversized inline asset must fail closed, not be silently dropped',
    );
    assert.equal(boundedCas.calls.length, 0, 'no CAS object may be created');
    assert.equal(boundedStore.upserts.length, 0, 'no registry row may be written');
    assert.equal(boundedStore.links.length, 0, 'no turn link may be written');
  });

  await checkAsync('a valid asset before an oversized one is still not committed', async () => {
    // The single-asset case above passes even if the bound is checked INSIDE
    // the per-asset loop, so on its own it proves nothing about atomicity. Here
    // a perfectly valid asset precedes the oversized one in an earlier message:
    // a per-asset check would have already written its CAS object, registry row
    // and turn link before reaching the refusal, leaving the snapshot half
    // ingested. Only a whole-snapshot pre-scan keeps all three counters at zero.
    const cap = 98;
    const goodB64 = Buffer.from('valid-first-asset').toString('base64');
    const goodHtml = `<p>ok <img src="data:image/png;base64,${goodB64}"></p>`;
    // cap + 1 decoded bytes: too small for the pre-decode lower bound to prove
    // oversize, so the authoritative post-decode check is what must fire.
    const badB64 = Buffer.alloc(cap + 1, 7).toString('base64');
    const badHtml = `<p>too big <img src="data:image/png;base64,${badB64}"></p>`;
    const mixedInput = {
      snapshotId: 'snap_mixed',
      chatId: 'chat_mixed',
      messages: [
        { id: 'm0', turnIndex: 0, contentHtml: goodHtml, content: [{ type: 'html', html: goodHtml, sanitized: true }], assetRefs: [] },
        { id: 'm1', turnIndex: 1, contentHtml: badHtml, content: [{ type: 'html', html: badHtml, sanitized: true }], assetRefs: [] },
      ],
    };
    const boundedCas = createMockCas({ capBytes: cap });
    const boundedStore = createMockStore();
    await assert.rejects(
      () => helper.materializeInlineImageAssetsV2({ snapshotJson: mixedInput, assetCas: boundedCas.api, assetStore: boundedStore.api }),
      /exceeds the governed ingest bound/,
      'the oversized second asset must fail the whole materialization',
    );
    assert.equal(boundedCas.calls.length, 0, 'the earlier valid asset must not have been written');
    assert.equal(boundedStore.upserts.length, 0, 'the earlier valid asset must not have a registry row');
    assert.equal(boundedStore.links.length, 0, 'the earlier valid asset must not be linked to its turn');
    // Guard the fixture itself: if the "valid" asset were not actually valid,
    // the zeros above would be vacuous.
    const soloCas = createMockCas({ capBytes: cap });
    const soloStore = createMockStore();
    const solo = await helper.materializeInlineImageAssetsV2({
      snapshotJson: { snapshotId: 's', chatId: 'c', messages: [mixedInput.messages[0]] },
      assetCas: soloCas.api,
      assetStore: soloStore.api,
    });
    assert.equal(solo.uniqueAssetCount, 1, 'the first asset is accepted on its own');
    assert.equal(soloCas.calls.length, 1);
    assert.equal(soloStore.links.length, 1);
  });

  await checkAsync('materialize extracts the inline PNG and reports counts', async () => {
    out = await helper.materializeInlineImageAssetsV2({ snapshotJson: input, assetCas: cas.api, assetStore: store.api });
    assert.equal(out.changed, true);
    assert.equal(out.extractedCount, 2, 'PNG present in m0 and m1 → 2 extractions');
    assert.equal(out.uniqueAssetCount, 1, 'same bytes dedupe to one asset');
  });

  check('rewrites contentHtml data:image → assets/sha256-<hex>.png', () => {
    const c0 = out.snapshotJson.messages[0].contentHtml;
    assert.ok(c0.includes(pngPath), 'package path missing from contentHtml');
    assert.doesNotMatch(c0, /data:image\/png/i, 'data:image/png should be gone from contentHtml');
  });

  check('rewrites content[].html too', () => {
    const htmlEntry = out.snapshotJson.messages[0].content.find((e) => e.type === 'html');
    assert.ok(htmlEntry && htmlEntry.html.includes(pngPath), 'content[].html not rewritten');
    assert.doesNotMatch(htmlEntry.html, /data:image\/png/i);
  });

  check('called mock assetCas.putAssetBytes (twice; 2nd deduped)', () => {
    assert.equal(cas.calls.length, 2);
    assert.equal(cas.calls[0].sha256, pngSha);
    assert.equal(cas.calls[0].mimeType, 'image/png');
    assert.equal(cas.calls[0].ext, 'png');
  });

  check('called mock assetStore.upsert and linkToTurn with the right shape', () => {
    assert.ok(store.upserts.length >= 1);
    assert.equal(store.upserts[0].sha256, pngSha);
    assert.equal(store.upserts[0].byteSize, Buffer.from('hello-png-bytes').length);
    const link0 = store.links.find((l) => l.turnIdx === 0);
    const link1 = store.links.find((l) => l.turnIdx === 1);
    assert.ok(link0 && link0.snapshotId === 'snap_1' && link0.sha256 === pngSha && link0.relation === 'inline');
    assert.ok(link1 && link1.turnIdx === 1, 'm1 link missing');
  });

  check('manifestAssets dedupes to one descriptor with C4.0 fields', () => {
    assert.equal(out.manifestAssets.length, 1);
    const d = out.manifestAssets[0];
    assert.equal(d.sha256, pngSha);
    assert.equal(d.path, pngPath);
    assert.equal(d.mimeType, 'image/png');
    assert.equal(d.ext, 'png');
    assert.equal(d.byteLength, Buffer.from('hello-png-bytes').length);
    assert.equal(d.source, 'chatgpt-capture');
    assert.equal(d.sourceMessageId, 'm0');
    assert.equal(d.turnRef, 0);
  });

  check('per-message assetRefs emitted (sha once each)', () => {
    assert.deepEqual([...out.snapshotJson.messages[0].assetRefs], [pngSha]);
    assert.deepEqual([...out.snapshotJson.messages[1].assetRefs], [pngSha]);
  });

  check('unsupported data:image/svg+xml is ignored (left inline, no asset)', () => {
    const c0 = out.snapshotJson.messages[0].contentHtml;
    assert.match(c0, /data:image\/svg\+xml/i, 'svg data URI should be untouched');
    assert.ok(!out.manifestAssets.some((d) => d.mimeType === 'image/svg+xml'));
  });

  check('remote URL is not fetched and not rewritten', () => {
    const c0 = out.snapshotJson.messages[0].contentHtml;
    assert.match(c0, /https:\/\/example\.com\/y\.png/i, 'remote URL must be left unchanged');
    // mock CAS only ever saw the PNG bytes (no remote fetch happened)
    assert.ok(cas.calls.every((c) => c.sha256 === pngSha));
  });

  check('original input object is not mutated', () => {
    assert.equal(JSON.stringify(input), inputBefore, 'input snapshotJson was mutated');
    assert.match(input.messages[0].contentHtml, /data:image\/png/i, 'original still has inline data image');
    assert.deepEqual([...input.messages[0].assetRefs], []);
  });

  check('diagnose reports C4.1 boundaries', () => {
    const d = helper.diagnoseSavedChatPackageAssetsV2();
    assert.equal(d.installed, true);
    assert.equal(d.writesFiles, false);
    assert.equal(d.fetchesRemote, false);
    assert.equal(d.contentHashV2, false);
    assert.deepEqual([...d.supportedMimeTypes].sort(), ['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  });

  let v3Out = null;
  const scalarOnlyBytes = Buffer.from('scalar-lookalike-must-be-ignored');
  const scalarOnlyUri = `data:image/png;base64,${scalarOnlyBytes.toString('base64')}`;
  const v3Input = {
    schemaVersion: 3,
    snapshotId: 'snap_v3_asset',
    chatId: 'chat_v3_asset',
    messages: [{
      id: 'v3-m0', turnIndex: 0,
      contentHtml: `<p>legacy lookalike <img src="${scalarOnlyUri}"></p>`,
      content: [
        { type: 'text', text: 'canonical typed content' },
        { type: 'html', html: `<p>canonical <img src="${imgPng}"></p>`, sanitized: true },
      ],
      assetRefs: [],
    }],
  };
  const v3Before = JSON.stringify(v3Input);
  const v3Cas = createMockCas();
  const v3Store = createMockStore();

  await checkAsync('v3 discovers and rewrites authoritative typed HTML while ignoring scalar lookalikes', async () => {
    v3Out = await helper.materializeInlineImageAssetsV2({ snapshotJson: v3Input, assetCas: v3Cas.api, assetStore: v3Store.api });
    assert.equal(v3Out.extractedCount, 1);
    assert.equal(v3Out.uniqueAssetCount, 1);
    assert.equal(v3Cas.calls.length, 1);
    assert.equal(v3Cas.calls[0].sha256, pngSha);
    const message = v3Out.snapshotJson.messages[0];
    assert.ok(message.contentHtml.includes(scalarOnlyUri), 'v3 scalar lookalike must be ignored and untouched');
    const typedHtml = message.content.find((part) => part.type === 'html').html;
    assert.ok(typedHtml.includes(pngPath));
    assert.doesNotMatch(typedHtml, /data:image\/png/i);
    assert.deepEqual([...message.assetRefs], [pngSha]);
    assert.equal(v3Out.manifestAssets[0].sha256, pngSha);
    assert.equal(v3Out.manifestAssets[0].path, pngPath);
    assert.equal(JSON.stringify(v3Input), v3Before, 'v3 source object must remain immutable');
  });

  check('v3 package asset references and hash identity are deterministic', () => {
    assert.deepEqual(Array.from(v3Out.manifestAssets, (asset) => asset.sha256), [pngSha]);
    assert.deepEqual(Array.from(v3Out.replacements, (entry) => entry.sha256), [pngSha]);
    assert.equal(v3Out.snapshotJson.messages[0].assetRefs[0], v3Out.manifestAssets[0].sha256);
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
